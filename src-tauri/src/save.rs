//! User-driven file save. Opens an OS save dialog, then writes the supplied
//! text to the chosen path. The caller provides the content — we never read
//! from the filesystem and we never write to an unconfirmed path.
//!
//! Why this exists: in Tauri 1.x WKWebView/WebView2 doesn't surface a
//! download UI for `<a href="blob:..." download>` clicks, so reports/
//! Postman exports silently fail. Native dialog is the reliable path.

use std::fs;
use std::path::PathBuf;

use serde::Deserialize;
use tauri::api::dialog::blocking::FileDialogBuilder;
use tauri::{AppHandle, Runtime};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveOptions {
    pub default_filename: String,
    /// Suggested extension filters (e.g. `[["Markdown", "md"], ["JSON", "json"]]`).
    pub filters: Option<Vec<FilterDef>>,
}

#[derive(Deserialize)]
pub struct FilterDef {
    pub name: String,
    pub extensions: Vec<String>,
}

/// Returns the saved path on success, or `Ok(None)` if the user cancelled the
/// dialog. Errors are surfaced for I/O failures only.
#[tauri::command]
pub fn save_text_file<R: Runtime>(
    _app: AppHandle<R>,
    content: String,
    options: SaveOptions,
) -> Result<Option<String>, String> {
    let mut dialog = FileDialogBuilder::new().set_file_name(&options.default_filename);
    if let Some(filters) = options.filters {
        for f in filters {
            let exts: Vec<&str> = f.extensions.iter().map(String::as_str).collect();
            dialog = dialog.add_filter(&f.name, &exts);
        }
    }
    let path: Option<PathBuf> = dialog.save_file();
    let Some(path) = path else {
        return Ok(None);
    };
    fs::write(&path, content.as_bytes()).map_err(|e| format!("write failed: {e}"))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}
