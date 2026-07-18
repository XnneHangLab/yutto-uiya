mod runtime;

use runtime::state::RuntimeState;
use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let runtime_state =
        runtime::commands::build_runtime_state().expect("failed to build runtime state");

    let app = tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        if let Some(w) = app.get_webview_window("main") {
                            if w.is_visible().unwrap_or(false) {
                                let _ = w.hide();
                            } else {
                                let _ = w.show();
                                let _ = w.unminimize();
                                let _ = w.set_focus();
                            }
                        }
                    }
                })
                .build(),
        )
        .manage(runtime_state)
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // Register the saved/default global shortcut
            let hotkey = app.state::<RuntimeState>().current_hotkey();
            let _ = app.handle().global_shortcut().register(hotkey.as_str());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            runtime::commands::probe_environment,
            runtime::commands::choose_workspace_root,
            runtime::commands::use_repo_workspace_root,
            runtime::commands::inspect_runtime,
            runtime::commands::list_managed_folders,
            runtime::commands::open_managed_path,
            runtime::commands::open_task_save_dir,
            runtime::commands::open_path_command,
            runtime::commands::open_url_command,
            runtime::commands::export_console_logs,
            runtime::commands::set_runtime_driver,
            runtime::commands::pick_python_path_command,
            runtime::commands::pick_ffmpeg_path_command,
            runtime::commands::detect_ffmpeg_path,
            runtime::commands::pick_download_dir_command,
            runtime::commands::fetch_cover_image,
            runtime::commands::start_auth_login,
            runtime::commands::cancel_auth_login,
            runtime::commands::logout_auth,
            runtime::commands::get_hotkey,
            runtime::commands::set_hotkey,
            runtime::commands::pause_hotkey,
            runtime::commands::uv_sync,
            runtime::commands::serve_start,
            runtime::commands::serve_stop,
            runtime::commands::serve_status,
            runtime::commands::get_system_proxy,
            runtime::commands::convert_wav_audio,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        // Graceful half of "退出即杀"; the Windows Job Object covers crashes.
        if let tauri::RunEvent::Exit = event {
            let state = app_handle.state::<RuntimeState>();
            runtime::serve::shutdown_serve_on_exit(&state);
        }
    });
}
