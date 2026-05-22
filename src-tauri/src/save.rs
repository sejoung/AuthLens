//! User-driven file save. Opens an OS save dialog, then writes the supplied
//! text to the chosen path. Caller provides the content — we never read
//! from the filesystem and we never write to an unconfirmed path.
//!
//! macOS-correct: `NSSavePanel` must NOT be invoked from a tokio worker
//! thread (non-main). We use the callback-based async dialog and bridge to
//! the command's async context with a oneshot channel.

use std::fs;
use std::path::PathBuf;

use serde::Deserialize;
use tauri::api::dialog::FileDialogBuilder;
use tauri::{AppHandle, Runtime};
use tokio::sync::oneshot;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveOptions {
    pub default_filename: String,
    pub filters: Option<Vec<FilterDef>>,
}

#[derive(Deserialize)]
pub struct FilterDef {
    pub name: String,
    pub extensions: Vec<String>,
}

#[tauri::command]
pub async fn save_text_file<R: Runtime>(
    _app: AppHandle<R>,
    content: String,
    options: SaveOptions,
) -> Result<Option<String>, String> {
    let (tx, rx) = oneshot::channel::<Option<PathBuf>>();

    // Build the dialog. The callback runs after the user dismisses the dialog;
    // the dialog itself is scheduled on the main thread by Tauri.
    let mut dialog = FileDialogBuilder::new().set_file_name(&options.default_filename);
    if let Some(filters) = options.filters {
        for f in filters {
            let exts: Vec<&str> = f.extensions.iter().map(String::as_str).collect();
            dialog = dialog.add_filter(&f.name, &exts);
        }
    }
    dialog.save_file(move |path| {
        let _ = tx.send(path);
    });

    let path = match rx.await {
        Ok(p) => p,
        Err(_) => return Ok(None), // sender dropped — treat as cancelled
    };
    let Some(path) = path else {
        return Ok(None);
    };
    fs::write(&path, content.as_bytes()).map_err(|e| format!("write failed: {e}"))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}
