use tauri::{AppHandle, Emitter, State};

use super::process::{
    drain_download_queue,
    ensure_environment_ready, kill_process, open_path, open_url, pick_ffmpeg_path, pick_python_path, pick_workspace_root,
    resolve_managed_path, run_auth_login_command, run_auth_logout_command, run_fetch_meta_command,
    run_inspect_command, run_parse_command, run_probe_command, run_save_settings_command,
    write_console_log,
};
use super::state::{
    resolve_portable_python_path, resolve_repo_root, resolve_workspace_root, RuntimeDriverConfig,
    RuntimeState,
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
    round_trip_result: Result<serde_json::Value, String>,
) -> Result<serde_json::Value, String> {
    let payload = round_trip_result?;
    state.set_driver_config(next_driver);
    state.set_ffmpeg_path(next_ffmpeg);
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
        ensure_environment_ready(&repo_root, &workspace_root, &inspect_driver, &ffmpeg_path, &app)?;
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
        payload.insert("runtimeDriver".to_string(), serde_json::json!(runtime_driver));
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
pub async fn parse_target(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    target: String,
) -> Result<serde_json::Value, String> {
    let repo_root = state.repo_root.clone();
    let workspace_root = state.current_workspace_root();
    let driver = state.current_driver_config();
    let ffmpeg_path = state.current_ffmpeg_path();
    run_blocking_runtime_action(move || {
        let result = run_parse_command(&repo_root, &workspace_root, &driver, &target, &ffmpeg_path, &app)?;
        serde_json::to_value(result).map_err(|error| error.to_string())
    })
    .await
}

#[tauri::command]
pub async fn fetch_video_meta(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    url: String,
) -> Result<serde_json::Value, String> {
    let repo_root = state.repo_root.clone();
    let workspace_root = state.current_workspace_root();
    let driver = state.current_driver_config();
    run_blocking_runtime_action(move || {
        run_fetch_meta_command(&repo_root, &workspace_root, &driver, &url, &app)
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
pub async fn enqueue_download(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    target: String,
    label: Option<String>,
    require_video: Option<bool>,
    require_audio: Option<bool>,
    require_cover: Option<bool>,
    video_quality: Option<u32>,
    audio_quality: Option<u32>,
    dir_override: Option<String>,
    select_index: Option<u32>,
) -> Result<serde_json::Value, String> {
    let (target, fallback_label) = validate_download_target(&target)?;
    let display_label = label
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or(fallback_label);
    let rv = require_video.unwrap_or(true);
    let ra = require_audio.unwrap_or(true);
    let rc = require_cover.unwrap_or(false);
    let vq = video_quality.unwrap_or(127);
    let aq = audio_quality.unwrap_or(30280);
    let dir = dir_override.filter(|s| !s.is_empty());
    let (task, should_spawn_worker) = {
        let mut queue = state.queue.lock().unwrap();
        queue.enqueue_with_worker_control(target.to_string(), display_label, rv, ra, rc, vq, aq, select_index, dir)
    };

    if should_spawn_worker {
        let app_handle = app.clone();
        let runtime_state = RuntimeState {
            repo_root: state.repo_root.clone(),
            workspace_root: state.workspace_root.clone(),
            queue: state.queue.clone(),
            driver_config: state.driver_config.clone(),
            portable_python_path: state.portable_python_path.clone(),
            ffmpeg_path: state.ffmpeg_path.clone(),
            active_download: state.active_download.clone(),
            active_auth: state.active_auth.clone(),
        };

        tauri::async_runtime::spawn_blocking(move || {
            drain_download_queue(app_handle.clone(), runtime_state);
        });
    }

    serde_json::to_value(task).map_err(|error| error.to_string())
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
            let _ = app_handle.emit("runtime:event", &super::models::RuntimeEventPayload {
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
                parse_item: None,
                auth_qr_data_url: None,
            });
            return;
        }
        if let Err(error) = result {
            let timestamp = super::state::current_timestamp();
            let _ = app_handle.emit("runtime:event", &super::models::RuntimeEventPayload {
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
                parse_item: None,
                auth_qr_data_url: None,
            });
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
pub async fn logout_auth(
    app: AppHandle,
    state: State<'_, RuntimeState>,
) -> Result<String, String> {
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
    let _ = app.emit("runtime:event", &super::models::RuntimeEventPayload {
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
        parse_item: None,
        auth_qr_data_url: None,
    });

    Ok(message)
}

#[tauri::command]
pub fn list_download_tasks(state: State<'_, RuntimeState>) -> Result<serde_json::Value, String> {
    let queue = state.queue.lock().unwrap();
    serde_json::to_value(&queue.tasks).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn cancel_task(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    task_id: String,
) -> Result<(), String> {
    use super::models::{RuntimeEventPayload, TaskStatus};
    use super::state::current_timestamp;

    let timestamp = current_timestamp();

    // Fast path: the task is still waiting in the queue — just remove it.
    let cancelled_target = {
        let mut queue = state.queue.lock().unwrap();
        queue.cancel_waiting_task(&task_id)
    };

    if let Some(target) = cancelled_target {
        let _ = app.emit("runtime:event", &RuntimeEventPayload {
            event: "download.cancelled".to_string(),
            task_id: task_id.clone(),
            target,
            status: "cancelled".to_string(),
            message: "已取消".to_string(),
            progress_current: 0,
            progress_total: 3,
            progress_unit: "stage".to_string(),
            timestamp,
            desc: None, percent: None, downloaded: None, total: None,
            parse_item: None,
            auth_qr_data_url: None,
        });
        return Ok(());
    }

    // The task might be actively running — kill its subprocess.
    let active = state.active_download.lock().unwrap().clone();
    if let Some((active_task_id, pid)) = active {
        if active_task_id == task_id {
            kill_process(pid);

            let target = {
                let queue = state.queue.lock().unwrap();
                queue.tasks.iter()
                    .find(|t| t.task_id == task_id)
                    .map(|t| t.target.clone())
                    .unwrap_or_default()
            };

            // Pre-mark as cancelled so drain_download_queue won't overwrite with failed.
            {
                let mut queue = state.queue.lock().unwrap();
                queue.apply_update(&task_id, TaskStatus::Cancelled, "已取消".to_string(), 0, 3);
            }

            let _ = app.emit("runtime:event", &RuntimeEventPayload {
                event: "download.cancelled".to_string(),
                task_id,
                target,
                status: "cancelled".to_string(),
                message: "已取消".to_string(),
                progress_current: 0,
                progress_total: 3,
                progress_unit: "stage".to_string(),
                timestamp,
                desc: None, percent: None, downloaded: None, total: None,
                parse_item: None,
                auth_qr_data_url: None,
            });
        }
    }

    Ok(())
}

#[tauri::command]
pub fn list_managed_folders(state: State<'_, RuntimeState>) -> Result<serde_json::Value, String> {
    let workspace_root = state.current_workspace_root();
    let downloads_root = workspace_root.join("downloads");
    let logs_root = workspace_root.join("logs");
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
pub fn open_managed_path(app: AppHandle, state: State<'_, RuntimeState>, path_key: String) -> Result<(), String> {
    let workspace_root = state.current_workspace_root();
    let path = resolve_managed_path(&workspace_root, &path_key)?;
    if !path.exists() {
        std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }
    let _ = app.emit("runtime:raw-log", format!("[open] {}", path.display()));
    open_path(&path)
}

#[tauri::command]
pub fn open_task_save_dir(app: AppHandle, state: State<'_, RuntimeState>, relative_path: String) -> Result<(), String> {
    let workspace_root = state.current_workspace_root();
    let downloads_dir = resolve_managed_path(&workspace_root, "downloads")?;
    let target = if relative_path.is_empty() {
        downloads_dir.clone()
    } else {
        downloads_dir.join(&relative_path)
    };
    let open_target = if target.exists() { &target } else { &downloads_dir };
    if !open_target.exists() {
        std::fs::create_dir_all(open_target).map_err(|e| e.to_string())?;
    }
    let _ = app.emit("runtime:raw-log", format!("[open] {}", open_target.display()));
    open_path(open_target)
}

#[tauri::command]
pub fn export_console_logs(
    state: State<'_, RuntimeState>,
    contents: String,
) -> Result<String, String> {
    let workspace_root = state.current_workspace_root();
    let log_dir = resolve_managed_path(&workspace_root, "logs")?;
    let path = write_console_log(&log_dir, &contents)?;
    Ok(path.display().to_string())
}

pub fn build_runtime_state() -> Result<RuntimeState, String> {
    let repo_root = resolve_repo_root()?;
    let workspace_root = resolve_workspace_root(&repo_root)?;
    let portable_python = resolve_portable_python_path(&repo_root);

    let state = RuntimeState::new(repo_root, workspace_root);
    if portable_python.is_file() {
        state.set_portable_python_path(Some(portable_python.clone()));
        if !cfg!(debug_assertions) {
            state.set_driver_config(RuntimeDriverConfig::DirectPython {
                python_path: portable_python,
            });
        }
    }
    Ok(state)
}

#[tauri::command]
pub async fn set_runtime_driver(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    driver: String,
    python_path: Option<String>,
    ffmpeg_path: Option<String>,
    no_proxy: Option<bool>,
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

    let next_ffmpeg = ffmpeg_path
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .unwrap_or_else(|| "ffmpeg".to_string());

    let resolved_no_proxy = no_proxy.unwrap_or(false);

    let repo_root = state.repo_root.clone();
    let workspace_root = state.current_workspace_root();
    let current_driver = state.current_driver_config();
    let (save_driver, probe_driver) = resolve_round_trip_drivers(&current_driver, &driver_config);
    let ffmpeg_for_round_trip = next_ffmpeg.clone();
    let round_trip_result = run_blocking_runtime_action(move || {
        run_save_settings_command(
            &repo_root,
            &workspace_root,
            &save_driver,
            &ffmpeg_for_round_trip,
            resolved_no_proxy,
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

    apply_runtime_state_update(state.inner(), driver_config, next_ffmpeg, round_trip_result)
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
pub async fn pick_ffmpeg_path_command() -> Result<Option<String>, String> {
    run_blocking_runtime_action(move || {
        let path = pick_ffmpeg_path()?;
        Ok(path.map(|p| p.display().to_string()))
    })
    .await
}

fn validate_download_target(target: &str) -> Result<(String, String), String> {
    let target = target.trim();
    if target.is_empty() {
        return Err("download target must not be empty".to_string());
    }
    // Use BV ID as label when available; otherwise fall back to full URL.
    let label = target
        .find("BV")
        .and_then(|idx| target.get(idx..idx + 12))
        .map(str::to_string)
        .unwrap_or_else(|| target.to_string());
    Ok((target.to_string(), label))
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
    {
        let mut queue = state.queue.lock().unwrap();
        if queue.has_active_tasks() {
            return Err("当前有任务运行，禁止切换工作目录".to_string());
        }
        queue.reset_for_workspace_switch();
    }

    state.set_workspace_root(next_workspace_root.clone());

    let repo_root = state.repo_root.clone();
    let driver = state.current_driver_config();
    let ffmpeg_path = state.current_ffmpeg_path();
    run_blocking_runtime_action(move || {
        let probe = run_probe_command(&repo_root, &next_workspace_root, &driver, &ffmpeg_path, &app)?;
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
        assert_eq!(super::runtime_driver_api_value(&RuntimeDriverConfig::Uv), "uv");
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
