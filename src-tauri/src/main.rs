#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod capture;
mod replay;
mod save;

fn main() {
    tauri::Builder::default()
        .manage(capture::CaptureState::default())
        .manage(replay::ReplayState::default())
        .invoke_handler(tauri::generate_handler![
            authlens_version,
            capture::start_capture,
            capture::stop_capture,
            save::save_text_file,
            replay::replay_send,
            replay::replay_quota,
        ])
        .run(tauri::generate_context!())
        .expect("error while running AuthLens");
}

#[tauri::command]
fn authlens_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}
