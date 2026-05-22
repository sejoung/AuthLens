//! Headful capture: spawns the Node sidecar that drives Playwright, pipes its NDJSON
//! events back to the React UI as Tauri events.
//!
//! Lifecycle:
//!   1. Frontend invokes `start_capture(target_url, headful)`.
//!   2. We spawn `node <resource>/sidecar/recorder.mjs <url> [--headless]`.
//!   3. A tokio task reads stdout line-by-line and emits Tauri event `capture-event`.
//!   4. Frontend invokes `stop_capture()` which writes `stop\n` to the sidecar's stdin.
//!   5. Sidecar finalizes, emits `finished`, exits. Our reader task ends naturally.

use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;

use tauri::{AppHandle, Manager, Runtime};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::Mutex;

#[derive(Default)]
pub struct CaptureState {
    inner: Arc<Mutex<Option<RunningCapture>>>,
}

struct RunningCapture {
    child: Child,
    stdin: Option<ChildStdin>,
}

/// Emit a Tauri event from the main thread. Required on macOS to avoid
/// null-ptr derefs in tao's Obj-C event callbacks when emit happens from a
/// tokio worker thread (Tauri 1.x).
fn emit_on_main<R: Runtime>(app: &AppHandle<R>, payload: serde_json::Value) {
    let app2 = app.clone();
    let _ = app.run_on_main_thread(move || {
        let _ = app2.emit_all("capture-event", payload);
    });
}

/// Resolve sidecar path. In dev, the Tauri working dir is `src-tauri/` so the script
/// lives at `../sidecar/recorder.mjs`. In a bundled build we copy via
/// `tauri.conf.json -> tauri.bundle.resources` and use the path resolver.
fn resolve_sidecar_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    if let Some(p) = app
        .path_resolver()
        .resolve_resource("sidecar/recorder.mjs")
    {
        if p.exists() {
            return Ok(p);
        }
    }
    let dev_path = std::env::current_dir()
        .map_err(|e| format!("cwd: {e}"))?
        .join("../sidecar/recorder.mjs");
    if dev_path.exists() {
        return Ok(dev_path);
    }
    Err(format!(
        "sidecar/recorder.mjs not found (looked in resources and {})",
        dev_path.display()
    ))
}

#[tauri::command]
pub async fn start_capture<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, CaptureState>,
    target_url: String,
    headful: bool,
    body_preview_limit: Option<u32>,
) -> Result<(), String> {
    {
        // Ensure no prior session is running.
        let guard = state.inner.lock().await;
        if guard.is_some() {
            return Err("A capture is already running".into());
        }
    }

    let script = resolve_sidecar_path(&app)?;
    let mut cmd = Command::new("node");
    cmd.arg(&script).arg(&target_url);
    if !headful {
        cmd.arg("--headless");
    }
    if let Some(limit) = body_preview_limit {
        cmd.arg("--body-limit").arg(limit.to_string());
    }
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("failed to launch node sidecar: {e}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "no stdout on sidecar".to_string())?;
    let stderr = child.stderr.take();
    let stdin = child.stdin.take();

    // Reader task: forward stdout lines as Tauri events.
    // CRITICAL on macOS: `emit_all` from a tokio worker thread can race with tao's
    // Cocoa event loop and trigger null-ptr derefs inside Obj-C callbacks (Tauri 1.x
    // bug). We marshal each event onto the main thread via `run_on_main_thread`.
    let app_handle = app.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        loop {
            match reader.next_line().await {
                Ok(Some(line)) => {
                    let line = line.trim();
                    if line.is_empty() {
                        continue;
                    }
                    let value: serde_json::Value =
                        serde_json::from_str(line).unwrap_or_else(|_| {
                            serde_json::json!({
                                "type": "error",
                                "message": format!("non-JSON line from sidecar: {line}"),
                            })
                        });
                    emit_on_main(&app_handle, value);
                }
                Ok(None) => break,
                Err(e) => {
                    emit_on_main(
                        &app_handle,
                        serde_json::json!({"type":"error","message":format!("stdout read: {e}")}),
                    );
                    break;
                }
            }
        }
        // Reader ended — notify UI.
        emit_on_main(&app_handle, serde_json::json!({"type":"closed"}));
    });

    // Stderr forwarder: surface as error events (don't kill capture though).
    if let Some(stderr) = stderr {
        let app_handle = app.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                emit_on_main(
                    &app_handle,
                    serde_json::json!({"type":"stderr","message":line}),
                );
            }
        });
    }

    {
        let mut guard = state.inner.lock().await;
        *guard = Some(RunningCapture { child, stdin });
    }

    Ok(())
}

#[tauri::command]
pub async fn stop_capture(state: tauri::State<'_, CaptureState>) -> Result<(), String> {
    let mut guard = state.inner.lock().await;
    let Some(running) = guard.as_mut() else {
        return Err("no capture is running".into());
    };
    if let Some(mut stdin) = running.stdin.take() {
        // Write "stop\n". Ignore errors — sidecar may have already exited.
        let _ = stdin.write_all(b"stop\n").await;
        let _ = stdin.shutdown().await;
    }
    // Reap: wait for sidecar to exit on its own.
    let _ = running.child.wait().await;
    *guard = None;
    Ok(())
}
