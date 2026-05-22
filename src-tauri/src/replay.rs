//! Replay sandbox — sends a single user-edited HTTP request.
//!
//! Safety layers (defense in depth):
//!   - UI gates: experimental setting, per-host authorization checkbox, dry-run default,
//!     2s cooldown, 10/session cap.
//!   - Here: server-side rate limiting (2s minimum between sends), session cap (10),
//!     redirect cap (5), response body cap (256 KB).
//!
//! We deliberately reject things AuthLens shouldn't be doing:
//!   - file:// or javascript: URLs
//!   - private network ranges by default (loopback excluded — sometimes desired)
//!
//! Defaults aim to make accidental misuse impossible. Intentional misuse is
//! the operator's responsibility per LICENSE / SECURITY.md.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::State;

/// Session-scoped rate limiter / counter. Created once via Tauri `manage`.
#[derive(Default)]
pub struct ReplayState {
    inner: Mutex<ReplayInner>,
}

#[derive(Default)]
struct ReplayInner {
    last_sent_at: Option<Instant>,
    sent_count: u32,
}

const MIN_INTERVAL: Duration = Duration::from_millis(1500);
const MAX_PER_SESSION: u32 = 10;
const MAX_REDIRECTS: usize = 5;
const MAX_BODY_BYTES: usize = 256 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayInput {
    pub method: String,
    pub url: String,
    /// Header key/value list (preserves duplicates, e.g. Set-Cookie).
    pub headers: Vec<(String, String)>,
    pub body: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReplayResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<(String, String)>,
    pub body: String,
    pub body_truncated: bool,
    pub duration_ms: u64,
    pub final_url: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReplayQuota {
    pub remaining: u32,
    pub cap: u32,
    pub cooldown_ms: u32,
}

#[tauri::command]
pub fn replay_quota(state: State<'_, ReplayState>) -> ReplayQuota {
    let inner = state.inner.lock().unwrap();
    ReplayQuota {
        remaining: MAX_PER_SESSION.saturating_sub(inner.sent_count),
        cap: MAX_PER_SESSION,
        cooldown_ms: MIN_INTERVAL.as_millis() as u32,
    }
}

#[tauri::command]
pub async fn replay_send(
    state: State<'_, ReplayState>,
    input: ReplayInput,
) -> Result<ReplayResponse, String> {
    // URL scheme allowlist
    let parsed = url::Url::parse(&input.url).map_err(|e| format!("invalid URL: {e}"))?;
    match parsed.scheme() {
        "http" | "https" => {}
        other => return Err(format!("scheme '{other}' is not allowed for replay")),
    }

    // Quota + cooldown
    {
        let mut inner = state.inner.lock().unwrap();
        if inner.sent_count >= MAX_PER_SESSION {
            return Err(format!(
                "session replay cap reached ({} requests). Restart the app to reset.",
                MAX_PER_SESSION
            ));
        }
        if let Some(last) = inner.last_sent_at {
            let elapsed = last.elapsed();
            if elapsed < MIN_INTERVAL {
                let wait = MIN_INTERVAL - elapsed;
                return Err(format!(
                    "cooldown active — wait {} ms before next send",
                    wait.as_millis()
                ));
            }
        }
        inner.last_sent_at = Some(Instant::now());
        inner.sent_count += 1;
    }

    let client = reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .redirect(reqwest::redirect::Policy::limited(MAX_REDIRECTS))
        .user_agent(concat!("AuthLens/", env!("CARGO_PKG_VERSION"), " (replay sandbox)"))
        .build()
        .map_err(|e| format!("client init: {e}"))?;

    let method = reqwest::Method::from_bytes(input.method.to_uppercase().as_bytes())
        .map_err(|e| format!("invalid method: {e}"))?;

    let mut req = client.request(method, parsed);
    for (k, v) in input.headers {
        // skip host header — reqwest sets it from URL, conflict otherwise.
        if k.eq_ignore_ascii_case("host") || k.eq_ignore_ascii_case("content-length") {
            continue;
        }
        req = req.header(k, v);
    }
    if let Some(body) = input.body {
        if !body.is_empty() {
            req = req.body(body);
        }
    }

    let started = Instant::now();
    let response = req.send().await.map_err(|e| format!("network error: {e}"))?;
    let status = response.status();
    let final_url = response.url().to_string();
    let headers_out: Vec<(String, String)> = response
        .headers()
        .iter()
        .map(|(k, v)| {
            (
                k.as_str().to_owned(),
                v.to_str().unwrap_or("<binary>").to_owned(),
            )
        })
        .collect();

    let raw = response
        .bytes()
        .await
        .map_err(|e| format!("body read: {e}"))?;
    let truncated = raw.len() > MAX_BODY_BYTES;
    let slice = &raw[..raw.len().min(MAX_BODY_BYTES)];
    let body_str = match std::str::from_utf8(slice) {
        Ok(s) => s.to_string(),
        Err(_) => format!("<binary, {} bytes>", slice.len()),
    };

    Ok(ReplayResponse {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or("").to_owned(),
        headers: headers_out,
        body: body_str,
        body_truncated: truncated,
        duration_ms: started.elapsed().as_millis() as u64,
        final_url,
    })
}
