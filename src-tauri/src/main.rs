#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![authlens_version])
        .run(tauri::generate_context!())
        .expect("error while running AuthLens");
}

#[tauri::command]
fn authlens_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}
