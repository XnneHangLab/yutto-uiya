use tauri::{AppHandle, Emitter, State};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use super::process::{
    ensure_environment_ready, kill_process, open_path, open_url, pick_download_dir,
    pick_ffmpeg_path, pick_python_path, pick_workspace_root, read_system_proxy,
    resolve_managed_path, run_auth_login_command, run_auth_logout_command, run_convert_wav_command,
    run_fetch_cover_command, run_inspect_command, run_probe_command, run_save_settings_command,
    run_uv_sync_command, write_console_log,
};
use super::state::{
    read_saved_download_dir, read_saved_driver_config, read_saved_hotkey,
    resolve_portable_ffmpeg_path, resolve_portable_python_path, resolve_repo_root,
    resolve_workspace_root, write_driver_config, write_hotkey_config, RuntimeDriverConfig,
    RuntimeState, DEFAULT_DOWNLOAD_DIR, DEFAULT_HOTKEY,
};

fn runtime_driver_api_value(driver: &RuntimeDriverConfig) -> &'static str {
    match driver {
        RuntimeDriverConfig::Uv => "uv",
        RuntimeDriverConfig::DirectPython { .. } => "conda",
    }
}

fn resolve_round_trip_drivers(
    _current_driver: &RuntimeDriverConfig,
    target_driver: &RuntimeDriverConfig,
) -> (RuntimeDriverConfig, RuntimeDriverConfig) {
    (target_driver.clone(), target_driver.clone())
}

fn apply_runtime_state_update(
    state: &RuntimeState,
    next_driver: RuntimeDriverConfig,
    next_ffmpeg: String,
    next_download_dir: String,
    round_trip_result: Result<serde_json::Value, String>,
) -> Result<serde_json::Value, String> {
    let payload = round_trip_result?;
    state.set_driver_config(next_driver);
    state.set_ffmpeg_path(next_ffmpeg);
    state.set_download_dir(next_download_dir);
    Ok(payload)
}

#[tauri::command]
pub async fn inspect_runtime(
    app: AppHandle,
    state: State<'_, RuntimeState>,
) -> Result<serde_json::Value, String> {
    let app_root = state.repo_root.clone();
    let repo_root = app_root.clone();
    let workspace_root = state.current_workspace_root();
    let driver = state.current_driver_config();
    let inspect_driver = driver.clone();
    let ffmpeg_path = state.current_ffmpeg_path();
    let mut result = run_blocking_runtime_action(move || {
        ensure_environment_ready(
            &repo_root,
            &workspace_root,
            &inspect_driver,
            &ffmpeg_path,
            &app,
        )?;
        run_inspect_command(&repo_root, &workspace_root, &inspect_driver, &app)
    })
    .await?;

    let runtime_driver = runtime_driver_api_value(&driver);
    let python_path = match &driver {
        RuntimeDriverConfig::DirectPython { python_path } => {
            Some(python_path.display().to_string())
        }
        RuntimeDriverConfig::Uv => state
            .current_portable_python_path()
            .map(|path| path.display().to_string()),
    };
    if let Some(payload) = result.as_object_mut() {
        payload.insert(
            "runtimeDriver".to_string(),
            serde_json::json!(runtime_driver),
        );
        payload.insert("pythonPath".to_string(), serde_json::json!(python_path));
        payload.insert(
            "appRoot".to_string(),
            serde_json::json!(app_root.display().to_string()),
        );
    }

    // Sync ffmpegPath from uiya.toml into RuntimeState so it survives restart
    if let Some(ffmpeg) = result.get("ffmpegPath").and_then(|v| v.as_str()) {
        state.set_ffmpeg_path(ffmpeg.to_string());
    }

    Ok(result)
}

#[tauri::command]
pub async fn probe_environment(
    app: AppHandle,
    state: State<'_, RuntimeState>,
) -> Result<serde_json::Value, String> {
    let repo_root = state.repo_root.clone();
    let workspace_root = state.current_workspace_root();
    let driver = state.current_driver_config();
    let ffmpeg_path = state.current_ffmpeg_path();
    run_blocking_runtime_action(move || {
        let probe = run_probe_command(&repo_root, &workspace_root, &driver, &ffmpeg_path, &app)?;
        serde_json::to_value(probe).map_err(|error| error.to_string())
    })
    .await
}

#[tauri::command]
pub async fn fetch_cover_image(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    url: String,
) -> Result<String, String> {
    let repo_root = state.repo_root.clone();
    let workspace_root = state.current_workspace_root();
    let driver = state.current_driver_config();
    run_blocking_runtime_action(move || {
        run_fetch_cover_command(&repo_root, &workspace_root, &driver, &url, &app)
    })
    .await
}

#[tauri::command]
pub async fn choose_workspace_root(
    app: AppHandle,
    state: State<'_, RuntimeState>,
) -> Result<Option<serde_json::Value>, String> {
    let picked = run_blocking_runtime_action(pick_workspace_root).await?;
    let Some(path) = picked else {
        return Ok(None);
    };

    switch_workspace_root(app, &state, path).await.map(Some)
}

#[tauri::command]
pub async fn use_repo_workspace_root(
    app: AppHandle,
    state: State<'_, RuntimeState>,
) -> Result<serde_json::Value, String> {
    let repo_root = state.repo_root.clone();
    switch_workspace_root(app, &state, repo_root).await
}

#[tauri::command]
pub async fn start_auth_login(
    app: AppHandle,
    state: State<'_, RuntimeState>,
) -> Result<(), String> {
    if state.auth_in_progress() {
        return Err("当前已有登录流程进行中".to_string());
    }

    state.begin_auth_process();
    let repo_root = state.repo_root.clone();
    let workspace_root = state.current_workspace_root();
    let driver = state.current_driver_config();
    let runtime_state = state.inner().clone();
    let app_handle = app.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let result = run_auth_login_command(
            &repo_root,
            &workspace_root,
            &driver,
            &runtime_state,
            &app_handle,
        );
        let cancelled = runtime_state.finish_auth_process();
        if cancelled && result.is_err() {
            let timestamp = super::state::current_timestamp();
            let _ = app_handle.emit(
                "runtime:event",
                &super::models::RuntimeEventPayload {
                    event: "auth.login.cancelled".to_string(),
                    task_id: String::new(),
                    target: "auth".to_string(),
                    status: "cancelled".to_string(),
                    message: "已取消登录".to_string(),
                    progress_current: 0,
                    progress_total: 3,
                    progress_unit: "step".to_string(),
                    timestamp,
                    desc: None,
                    percent: None,
                    downloaded: None,
                    total: None,
                    auth_qr_data_url: None,
                },
            );
            return;
        }
        if let Err(error) = result {
            let timestamp = super::state::current_timestamp();
            let _ = app_handle.emit(
                "runtime:event",
                &super::models::RuntimeEventPayload {
                    event: "auth.login.failed".to_string(),
                    task_id: String::new(),
                    target: "auth".to_string(),
                    status: "failed".to_string(),
                    message: error,
                    progress_current: 0,
                    progress_total: 0,
                    progress_unit: "step".to_string(),
                    timestamp,
                    desc: None,
                    percent: None,
                    downloaded: None,
                    total: None,
                    auth_qr_data_url: None,
                },
            );
        }
    });

    Ok(())
}

#[tauri::command]
pub fn cancel_auth_login(state: State<'_, RuntimeState>) -> Result<(), String> {
    if !state.auth_in_progress() {
        return Ok(());
    }

    if let Some(pid) = state.request_auth_cancel() {
        kill_process(pid);
    }

    Ok(())
}

#[tauri::command]
pub async fn logout_auth(app: AppHandle, state: State<'_, RuntimeState>) -> Result<String, String> {
    if state.auth_in_progress() {
        return Err("登录流程进行中，暂时不能退出登录".to_string());
    }

    let repo_root = state.repo_root.clone();
    let workspace_root = state.current_workspace_root();
    let driver = state.current_driver_config();
    let message = run_blocking_runtime_action(move || {
        run_auth_logout_command(&repo_root, &workspace_root, &driver)
    })
    .await?;

    let timestamp = super::state::current_timestamp();
    let _ = app.emit(
        "runtime:event",
        &super::models::RuntimeEventPayload {
            event: "auth.logout.completed".to_string(),
            task_id: String::new(),
            target: "auth".to_string(),
            status: "completed".to_string(),
            message: message.clone(),
            progress_current: 1,
            progress_total: 1,
            progress_unit: "step".to_string(),
            timestamp,
            desc: None,
            percent: None,
            downloaded: None,
            total: None,
            auth_qr_data_url: None,
        },
    );

    Ok(message)
}

#[tauri::command]
pub async fn uv_sync(app: AppHandle, state: State<'_, RuntimeState>) -> Result<(), String> {
    let repo_root = state.repo_root.clone();
    run_blocking_runtime_action(move || run_uv_sync_command(&repo_root, &app)).await
}

#[tauri::command]
pub async fn serve_start(
    app: AppHandle,
    state: State<'_, RuntimeState>,
) -> Result<super::serve::ServeInfo, String> {
    let state = state.inner().clone();
    run_blocking_runtime_action(move || super::serve::start_serve(&app, &state)).await
}

#[tauri::command]
pub async fn serve_stop(app: AppHandle, state: State<'_, RuntimeState>) -> Result<(), String> {
    let state = state.inner().clone();
    run_blocking_runtime_action(move || super::serve::stop_serve(&app, &state)).await
}

#[tauri::command]
pub fn serve_status(state: State<'_, RuntimeState>) -> super::serve::ServeStatusPayload {
    super::serve::current_status(&state)
}

#[tauri::command]
pub fn get_system_proxy() -> Option<String> {
    read_system_proxy()
}

#[tauri::command]
pub async fn convert_wav_audio(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    relative_dir: String,
) -> Result<(), String> {
    let repo_root = state.repo_root.clone();
    let workspace_root = state.current_workspace_root();
    let driver = state.current_driver_config();
    let ffmpeg_path = state.current_ffmpeg_path();
    run_blocking_runtime_action(move || {
        run_convert_wav_command(
            &repo_root,
            &workspace_root,
            &driver,
            &ffmpeg_path,
            &relative_dir,
            &app,
        )
    })
    .await
}

#[tauri::command]
pub fn list_managed_folders(state: State<'_, RuntimeState>) -> Result<serde_json::Value, String> {
    let workspace_root = state.current_workspace_root();
    let download_dir = state.current_download_dir();
    let downloads_root = resolve_managed_path(&workspace_root, "downloads", Some(&download_dir))?;
    let logs_root = resolve_managed_path(&workspace_root, "logs", None)?;
    let items = serde_json::json!([
        { "key": "workspace", "label": "根目录",     "path": workspace_root.display().to_string() },
        { "key": "downloads", "label": "下载目录",   "path": downloads_root.display().to_string() },
        { "key": "logs",      "label": "日志目录",   "path": logs_root.display().to_string() },
    ]);
    Ok(items)
}

#[tauri::command]
pub fn open_path_command(app: AppHandle, path: String) -> Result<(), String> {
    let target = std::path::PathBuf::from(path);
    let _ = app.emit("runtime:raw-log", format!("[open] {}", target.display()));
    open_path(&target)
}

#[tauri::command]
pub fn open_url_command(url: String) -> Result<(), String> {
    open_url(&url)
}

#[tauri::command]
pub fn open_managed_path(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    path_key: String,
) -> Result<(), String> {
    let workspace_root = state.current_workspace_root();
    let download_dir = state.current_download_dir();
    let path = resolve_managed_path(&workspace_root, &path_key, Some(&download_dir))?;
    if !path.exists() {
        std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }
    let _ = app.emit("runtime:raw-log", format!("[open] {}", path.display()));
    open_path(&path)
}

#[tauri::command]
pub fn open_task_save_dir(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    relative_path: String,
) -> Result<(), String> {
    let workspace_root = state.current_workspace_root();
    let download_dir = state.current_download_dir();
    let downloads_dir = resolve_managed_path(&workspace_root, "downloads", Some(&download_dir))?;
    let target = if relative_path.is_empty() {
        downloads_dir.clone()
    } else {
        downloads_dir.join(&relative_path)
    };
    let open_target = if target.exists() {
        &target
    } else {
        &downloads_dir
    };
    if !open_target.exists() {
        std::fs::create_dir_all(open_target).map_err(|e| e.to_string())?;
    }
    let _ = app.emit(
        "runtime:raw-log",
        format!("[open] {}", open_target.display()),
    );
    open_path(open_target)
}

#[tauri::command]
pub fn export_console_logs(
    state: State<'_, RuntimeState>,
    contents: String,
) -> Result<String, String> {
    let workspace_root = state.current_workspace_root();
    let log_dir = resolve_managed_path(&workspace_root, "logs", None)?;
    let path = write_console_log(&log_dir, &contents)?;
    Ok(path.display().to_string())
}

#[tauri::command]
pub fn get_hotkey(state: State<'_, RuntimeState>) -> String {
    state.current_hotkey()
}

#[tauri::command]
pub fn set_hotkey(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    shortcut: String,
) -> Result<(), String> {
    let old = state.current_hotkey();
    let _ = app.global_shortcut().unregister(old.as_str());
    app.global_shortcut()
        .register(shortcut.as_str())
        .map_err(|e| e.to_string())?;
    state.set_hotkey_str(shortcut.clone());
    let workspace_root = state.current_workspace_root();
    write_hotkey_config(&workspace_root, &shortcut);
    Ok(())
}

/// Temporarily unregisters the current global shortcut so key capture in
/// the settings UI can intercept the combo without the window hiding itself.
#[tauri::command]
pub fn pause_hotkey(app: AppHandle, state: State<'_, RuntimeState>) -> Result<(), String> {
    let current = state.current_hotkey();
    let _ = app.global_shortcut().unregister(current.as_str());
    Ok(())
}

pub fn build_runtime_state() -> Result<RuntimeState, String> {
    let repo_root = resolve_repo_root()?;
    let workspace_root = resolve_workspace_root(&repo_root)?;
    let portable_python = resolve_portable_python_path(&repo_root);
    let portable_ffmpeg = resolve_portable_ffmpeg_path(&repo_root);

    let state = RuntimeState::new(repo_root, workspace_root.clone());
    let has_portable_python = portable_python.is_file();
    if has_portable_python {
        state.set_portable_python_path(Some(portable_python.clone()));
        if !cfg!(debug_assertions) {
            state.set_driver_config(RuntimeDriverConfig::DirectPython {
                python_path: portable_python,
            });
        }
    }
    // Auto-use bundled ffmpeg when it sits next to the executable.
    // Only applies in release mode so dev builds still fall through to PATH.
    if !cfg!(debug_assertions) && portable_ffmpeg.is_file() {
        state.set_ffmpeg_path(portable_ffmpeg.to_string_lossy().into_owned());
    }
    if let Some(saved) = read_saved_driver_config(&workspace_root) {
        // In a portable release build the bundled ./env/python is the only
        // reliable runtime; a saved "uv" preference must not override it
        // because uv is not bundled and may not be installed.
        let portable_release = has_portable_python && !cfg!(debug_assertions);
        if !(portable_release && matches!(saved, RuntimeDriverConfig::Uv)) {
            state.set_driver_config(saved);
        }
    }
    let saved_hotkey =
        read_saved_hotkey(&workspace_root).unwrap_or_else(|| DEFAULT_HOTKEY.to_string());
    state.set_hotkey_str(saved_hotkey);
    if let Some(saved_download_dir) = read_saved_download_dir(&workspace_root) {
        state.set_download_dir(saved_download_dir);
    }
    Ok(state)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn set_runtime_driver(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    driver: String,
    python_path: Option<String>,
    ffmpeg_path: Option<String>,
    no_proxy: Option<bool>,
    download_dir: Option<String>,
    fetch_workers: Option<u32>,
) -> Result<serde_json::Value, String> {
    let driver_config = match driver.as_str() {
        "uv" => RuntimeDriverConfig::Uv,
        "conda" => {
            let path = python_path
                .filter(|p| !p.is_empty())
                .ok_or_else(|| "conda mode requires a python_path".to_string())?;
            RuntimeDriverConfig::DirectPython {
                python_path: std::path::PathBuf::from(path),
            }
        }
        other => return Err(format!("unsupported runtime driver: {other}")),
    };

    let next_ffmpeg = match ffmpeg_path {
        Some(p) => p.trim().to_string(),
        None => "ffmpeg".to_string(),
    };

    let resolved_no_proxy = no_proxy.unwrap_or(false);

    let resolved_fetch_workers = fetch_workers.unwrap_or(8).max(1);

    let next_download_dir = download_dir
        .map(|d| d.trim().to_string())
        .filter(|d| !d.is_empty())
        .unwrap_or_else(|| DEFAULT_DOWNLOAD_DIR.to_string());

    let repo_root = state.repo_root.clone();
    let workspace_root = state.current_workspace_root();
    let current_driver = state.current_driver_config();
    let (save_driver, probe_driver) = resolve_round_trip_drivers(&current_driver, &driver_config);
    let ffmpeg_for_round_trip = next_ffmpeg.clone();
    let download_dir_for_round_trip = next_download_dir.clone();
    let round_trip_result = run_blocking_runtime_action(move || {
        run_save_settings_command(
            &repo_root,
            &workspace_root,
            &save_driver,
            &ffmpeg_for_round_trip,
            resolved_no_proxy,
            &download_dir_for_round_trip,
            resolved_fetch_workers,
        )?;
        let probe = run_probe_command(
            &repo_root,
            &workspace_root,
            &probe_driver,
            &ffmpeg_for_round_trip,
            &app,
        )?;
        serde_json::to_value(probe).map_err(|error| error.to_string())
    })
    .await;

    let result = apply_runtime_state_update(
        state.inner(),
        driver_config,
        next_ffmpeg,
        next_download_dir,
        round_trip_result,
    );
    if result.is_ok() {
        write_driver_config(
            &state.current_workspace_root(),
            &state.current_driver_config(),
            &state.current_download_dir(),
        );
    }
    result
}

#[tauri::command]
pub async fn pick_python_path_command() -> Result<Option<String>, String> {
    run_blocking_runtime_action(move || {
        let path = pick_python_path()?;
        Ok(path.map(|p| p.display().to_string()))
    })
    .await
}

#[tauri::command]
pub async fn pick_download_dir_command() -> Result<Option<String>, String> {
    run_blocking_runtime_action(move || {
        let path = pick_download_dir()?;
        Ok(path.map(|p| p.display().to_string()))
    })
    .await
}

#[tauri::command]
pub async fn pick_ffmpeg_path_command() -> Result<Option<String>, String> {
    run_blocking_runtime_action(move || {
        let path = pick_ffmpeg_path()?;
        Ok(path.map(|p| p.display().to_string()))
    })
    .await
}

#[tauri::command]
pub fn detect_ffmpeg_path(state: State<'_, RuntimeState>) -> Vec<String> {
    let repo_root = &state.repo_root;
    let mut found: Vec<String> = Vec::new();
    let candidates = [
        resolve_portable_ffmpeg_path(repo_root),
        repo_root.join("ffmpeg").join("bin").join("ffmpeg.exe"),
        repo_root.join("ffmpeg").join("bin").join("ffmpeg"),
    ];
    for path in &candidates {
        if path.is_file() {
            found.push(path.display().to_string());
        }
    }
    #[cfg(target_os = "windows")]
    if let Ok(output) = {
        let mut cmd = std::process::Command::new("where");
        cmd.arg("ffmpeg");
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        cmd.output()
    } {
        if output.status.success() {
            for line in String::from_utf8_lossy(&output.stdout).lines() {
                let p = line.trim().to_string();
                if !p.is_empty() && !found.contains(&p) {
                    found.push(p);
                }
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    if let Ok(output) = std::process::Command::new("which").arg("ffmpeg").output() {
        if output.status.success() {
            let p = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !p.is_empty() && !found.contains(&p) {
                found.push(p);
            }
        }
    }
    found
}

async fn run_blocking_runtime_action<T, F>(action: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(action)
        .await
        .map_err(|error| format!("failed to join runtime task: {error}"))?
}

async fn switch_workspace_root(
    app: AppHandle,
    state: &RuntimeState,
    next_workspace_root: std::path::PathBuf,
) -> Result<serde_json::Value, String> {
    // 下载任务住在 serve 里；前端 workspaceLocked 已禁止有任务时切换。
    // serve 的 --download-root 在启动时固定，切换工作目录后必须停掉，
    // 下次解析/下载会用新目录自动拉起。
    let _ = super::serve::stop_serve(&app, state);

    state.set_workspace_root(next_workspace_root.clone());

    let saved_download_dir = read_saved_download_dir(&next_workspace_root)
        .unwrap_or_else(|| DEFAULT_DOWNLOAD_DIR.to_string());
    state.set_download_dir(saved_download_dir);

    let repo_root = state.repo_root.clone();
    let driver = state.current_driver_config();
    let ffmpeg_path = state.current_ffmpeg_path();
    run_blocking_runtime_action(move || {
        let probe = run_probe_command(
            &repo_root,
            &next_workspace_root,
            &driver,
            &ffmpeg_path,
            &app,
        )?;
        serde_json::to_value(probe).map_err(|error| error.to_string())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::{RuntimeDriverConfig, RuntimeState};
    use std::path::PathBuf;

    #[test]
    fn run_blocking_runtime_action_moves_work_off_the_calling_thread() {
        let caller_thread = format!("{:?}", std::thread::current().id());
        let worker_thread =
            tauri::async_runtime::block_on(super::run_blocking_runtime_action(|| {
                Ok(format!("{:?}", std::thread::current().id()))
            }))
            .unwrap();

        assert_ne!(worker_thread, caller_thread);
    }

    #[test]
    fn runtime_driver_api_value_uses_uv_and_conda() {
        assert_eq!(
            super::runtime_driver_api_value(&RuntimeDriverConfig::Uv),
            "uv"
        );
        assert_eq!(
            super::runtime_driver_api_value(&RuntimeDriverConfig::DirectPython {
                python_path: std::path::PathBuf::from("/app/env/python"),
            }),
            "conda"
        );
    }

    #[test]
    fn apply_runtime_state_update_keeps_previous_values_on_error() {
        let state = RuntimeState::new(PathBuf::from("/repo"), PathBuf::from("/workspace"));
        state.set_driver_config(RuntimeDriverConfig::DirectPython {
            python_path: PathBuf::from("/workspace/env/python"),
        });
        state.set_ffmpeg_path("/workspace/tools/ffmpeg".to_string());

        let result = super::apply_runtime_state_update(
            &state,
            RuntimeDriverConfig::Uv,
            "ffmpeg".to_string(),
            "./downloads".to_string(),
            Err("probe failed".to_string()),
        );

        assert!(result.is_err());
        assert_eq!(
            state.current_driver_config(),
            RuntimeDriverConfig::DirectPython {
                python_path: PathBuf::from("/workspace/env/python"),
            }
        );
        assert_eq!(state.current_ffmpeg_path(), "/workspace/tools/ffmpeg");
    }

    #[test]
    fn apply_runtime_state_update_commits_values_on_success() {
        let state = RuntimeState::new(PathBuf::from("/repo"), PathBuf::from("/workspace"));

        let result = super::apply_runtime_state_update(
            &state,
            RuntimeDriverConfig::DirectPython {
                python_path: PathBuf::from("/workspace/env/python"),
            },
            "/workspace/tools/ffmpeg".to_string(),
            "./downloads".to_string(),
            Ok(serde_json::json!({"status": "ready"})),
        )
        .unwrap();

        assert_eq!(result["status"], "ready");
        assert_eq!(
            state.current_driver_config(),
            RuntimeDriverConfig::DirectPython {
                python_path: PathBuf::from("/workspace/env/python"),
            }
        );
        assert_eq!(state.current_ffmpeg_path(), "/workspace/tools/ffmpeg");
    }

    #[test]
    fn apply_runtime_state_update_commits_values_on_non_ready_probe_payload() {
        let state = RuntimeState::new(PathBuf::from("/repo"), PathBuf::from("/workspace"));

        let result = super::apply_runtime_state_update(
            &state,
            RuntimeDriverConfig::Uv,
            "ffmpeg".to_string(),
            "./downloads".to_string(),
            Ok(serde_json::json!({"status": "uv-unavailable"})),
        )
        .unwrap();

        assert_eq!(result["status"], "uv-unavailable");
        assert_eq!(state.current_driver_config(), RuntimeDriverConfig::Uv);
        assert_eq!(state.current_ffmpeg_path(), "ffmpeg");
    }

    #[test]
    fn resolve_round_trip_drivers_uses_target_for_both_save_and_probe() {
        let current = RuntimeDriverConfig::DirectPython {
            python_path: PathBuf::from("/app/env/python"),
        };
        let target = RuntimeDriverConfig::Uv;

        let (save_driver, probe_driver) = super::resolve_round_trip_drivers(&current, &target);
        assert_eq!(save_driver, target);
        assert_eq!(probe_driver, target);
    }
}
