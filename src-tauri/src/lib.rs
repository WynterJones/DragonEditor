mod ai;
mod eleven;
mod export;
mod keys;
mod media;

use tauri::{AppHandle, Manager};

#[tauri::command]
fn close_splash(app: AppHandle) {
    if let Some(s) = app.get_webview_window("splash") {
        let _ = s.close();
    }
    if let Some(m) = app.get_webview_window("main") {
        let _ = m.show();
        let _ = m.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .manage(export::Jobs::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            close_splash,
            keys::set_api_key,
            keys::has_api_key,
            keys::clear_api_key,
            eleven::eleven_voices,
            eleven::eleven_audio,
            ai::ai_providers,
            ai::ai_chat,
            media::probe,
            media::thumbnail,
            media::peaks,
            export::export_start,
            export::export_cancel,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
