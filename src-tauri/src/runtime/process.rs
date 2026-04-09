use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;

use tauri::{AppHandle, Emitter};

use super::models::{EnvironmentProbePayload, ParseResult, PythonEnvelope, RuntimeEventPayload, TaskStatus};
use super::state::{RuntimeDriverConfig, RuntimeState};

const ENVIRONMENT_PROBE_SCRIPT: &str = r#"
import importlib
import json
import os
import subprocess
import traceback

result = {
    "status": "ready",
    "yuttoAvailable": False,
    "yuttoVersion": None,
    "ffmpegAvailable": False,
    "issues": [],
    "message": "环境就绪",
}

try:
    uiya = importlib.import_module("uiya")
    result["yuttoAvailable"] = True
    result["yuttoVersion"] = str(getattr(uiya, "__version__", "unknown"))
except Exception as error:
    traceback.print_exc()
    result["status"] = "yutto-unavailable"
    result["issues"].append(str(error))
    result["message"] = "uiya 不可用，请检查 Python 环境"

ffmpeg_cmd = os.environ.get("UIYA_FFMPEG_PATH") or "ffmpeg"
if ffmpeg_cmd == "ffmpeg":
    try:
        import tomllib
        from pathlib import Path
        config_path = Path("config") / "uiya.toml"
        if config_path.exists():
            with open(config_path, "rb") as _f:
                _cfg = tomllib.load(_f)
            _saved = _cfg.get("ffmpeg_path", "").strip()
            if _saved and _saved != "ffmpeg":
                ffmpeg_cmd = _saved
    except Exception:
        pass
try:
    proc = subprocess.run(
        [ffmpeg_cmd, "-version"],
        capture_output=True,
        timeout=5,
    )
    if proc.returncode == 0:
        result["ffmpegAvailable"] = True
    else:
        result["issues"].append("ffmpeg 返回非零退出码")
except Exception as error:
    traceback.print_exc()
    result["issues"].append(f"ffmpeg 不可用: {error}")

print(json.dumps(result, ensure_ascii=False), flush=True)
"#;

pub fn run_inspect_command(repo_root: &Path, workspace_root: &Path, driver: &RuntimeDriverConfig, app: &AppHandle) -> Result<serde_json::Value, String> {
    emit_raw_log(app, "[inspect] 正在读取运行时信息 …");
    let output = build_python_command_for_driver(
        repo_root,
        workspace_root,
        driver,
        ["-m", "uiya.cli", "inspect-runtime"],
    )
    .output()
    .map_err(|error| format!("failed to run inspect-runtime: {error}"))?;

    emit_stderr_lines(app, &output.stderr);

    if !output.status.success() {
        let msg = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(msg);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let last_line = stdout
        .lines()
        .last()
        .ok_or_else(|| "inspect-runtime returned no stdout".to_string())?;
    let envelope: PythonEnvelope =
        serde_json::from_str(last_line).map_err(|error| error.to_string())?;
    Ok(envelope.payload)
}

pub fn run_parse_command(
    repo_root: &Path,
    workspace_root: &Path,
    driver: &RuntimeDriverConfig,
    target: &str,
    ffmpeg_path: &str,
    app: &AppHandle,
) -> Result<ParseResult, String> {
    emit_raw_log(app, &format!("[parse] 正在解析 {target} …"));

    let output = build_python_command_for_driver(
        repo_root,
        workspace_root,
        driver,
        ["-m", "uiya.cli", "parse", target],
    )
    .env("UIYA_FFMPEG_PATH", ffmpeg_path)
    .output()
    .map_err(|error| format!("failed to run parse command: {error}"))?;

    emit_stderr_lines(app, &output.stderr);

    let stdout = String::from_utf8_lossy(&output.stdout);
    let lines: Vec<&str> = stdout.lines().collect();
    let Some(&last_line) = lines.last() else {
        return Err("parse command returned no output".to_string());
    };

    // Forward all but the last line (raw yutto output) as runtime:raw-log
    for line in lines[..lines.len().saturating_sub(1)].iter() {
        let line = line.trim();
        if !line.is_empty() {
            emit_raw_log(app, line);
        }
    }

    let envelope: PythonEnvelope =
        serde_json::from_str(last_line).map_err(|error| {
            format!("failed to parse parse-command output: {error} (last line: {last_line:?})")
        })?;
    let result: ParseResult = serde_json::from_value(envelope.payload.clone())
        .map_err(|error| format!("failed to deserialize parse result: {error}"))?;

    emit_raw_log(app, &format!("[parse] 解析完成，共 {} 个视频", result.items.len()));
    Ok(result)
}

pub fn run_save_settings_command(
    repo_root: &Path,
    workspace_root: &Path,
    driver: &RuntimeDriverConfig,
    ffmpeg_path: &str,
    no_proxy: bool,
) -> Result<(), String> {
    let output = build_python_command_for_driver(
        repo_root,
        workspace_root,
        driver,
        ["-m", "uiya.cli", "save-settings",
         "--ffmpeg-path", ffmpeg_path,
         "--no-proxy", if no_proxy { "true" } else { "false" }],
    )
    .output()
    .map_err(|error| format!("failed to run save-settings: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "save-settings command failed".to_string()
        } else {
            stderr
        });
    }
    Ok(())
}

pub fn run_probe_command(repo_root: &Path, workspace_root: &Path, driver: &RuntimeDriverConfig, ffmpeg_path: &str, app: &AppHandle) -> Result<EnvironmentProbePayload, String> {
    emit_raw_log(app, "[probe] 开始检测运行环境 …");

    if !workspace_root.is_dir() {
        emit_raw_log(app, &format!("[probe] 工作目录无效: {}", workspace_root.display()));
        return Ok(build_probe_payload(
            repo_root,
            workspace_root,
            "workspace-invalid",
            vec!["workspace root is missing or not a directory".to_string()],
            "工作目录无效".to_string(),
        ));
    }

    match driver {
        RuntimeDriverConfig::Uv => {
            let uv_version = Command::new("uv")
                .arg("--version")
                .current_dir(repo_root)
                .output()
                .map_err(|error| {
                    if error.kind() == std::io::ErrorKind::NotFound {
                        format!("uv not available: {error}")
                    } else {
                        format!("failed to run uv --version: {error}")
                    }
                });

            let uv_version = match uv_version {
                Ok(output) => output,
                Err(error) => {
                    emit_raw_log(app, &format!("[probe] uv 不可用: {error}"));
                    return Ok(build_probe_payload(
                        repo_root,
                        workspace_root,
                        "uv-unavailable",
                        vec![error.clone()],
                        "uv 不可用".to_string(),
                    ));
                }
            };

            if !uv_version.status.success() {
                let stderr = String::from_utf8_lossy(&uv_version.stderr).trim().to_string();
                emit_raw_log(app, &format!("[probe] uv 不可用: {stderr}"));
                return Ok(build_probe_payload(
                    repo_root,
                    workspace_root,
                    "uv-unavailable",
                    vec![stderr.clone()],
                    "uv 不可用".to_string(),
                ));
            }

            let uv_ver_str = String::from_utf8_lossy(&uv_version.stdout).trim().to_string();
            if !uv_ver_str.is_empty() {
                emit_raw_log(app, &format!("[probe] {uv_ver_str}"));
            }
        }
        RuntimeDriverConfig::DirectPython { python_path } => {
            if !python_path.is_file() {
                let msg = format!("python executable not found: {}", python_path.display());
                emit_raw_log(app, &format!("[probe] {msg}"));
                return Ok(build_probe_payload(
                    repo_root,
                    workspace_root,
                    "python-unavailable",
                    vec![msg],
                    "Python 不可用".to_string(),
                ));
            }
        }
    }

    let python_probe = build_python_command_for_driver(
        repo_root,
        workspace_root,
        driver,
        ["-c", "import sys; print(sys.executable)"],
    )
    .output()
    .map_err(|error| format!("failed to run python probe: {error}"))?;

    emit_stderr_lines(app, &python_probe.stderr);

    if !python_probe.status.success() {
        let stderr = String::from_utf8_lossy(&python_probe.stderr).trim().to_string();
        return Ok(build_probe_payload(
            repo_root,
            workspace_root,
            "python-unavailable",
            vec![stderr.clone()],
            "Python 不可用".to_string(),
        ));
    }

    let python_exe = String::from_utf8_lossy(&python_probe.stdout).trim().to_string();
    if !python_exe.is_empty() {
        emit_raw_log(app, &format!("[probe] Python: {python_exe}"));
    }

    let output = build_python_command_for_driver(repo_root, workspace_root, driver, ["-c", ENVIRONMENT_PROBE_SCRIPT])
        .env("UIYA_FFMPEG_PATH", ffmpeg_path)
        .output()
        .map_err(|error| format!("failed to run environment probe: {error}"))?;

    emit_stderr_lines(app, &output.stderr);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Ok(build_probe_payload(
            repo_root,
            workspace_root,
            "yutto-unavailable",
            vec![stderr.clone()],
            "uiya 不可用".to_string(),
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let last_line = stdout
        .lines()
        .last()
        .ok_or_else(|| "environment probe returned no stdout".to_string())?;
    let mut payload: EnvironmentProbePayload =
        serde_json::from_str(last_line).map_err(|error| error.to_string())?;
    payload.workspace_root = workspace_root.display().to_string();
    payload.repo_root = repo_root.display().to_string();

    for issue in &payload.issues {
        if !issue.trim().is_empty() {
            emit_raw_log(app, &format!("[probe] {issue}"));
        }
    }
    emit_raw_log(app, &format!("[probe] {}", payload.message));

    Ok(payload)
}

pub fn ensure_environment_ready(
    repo_root: &Path,
    workspace_root: &Path,
    driver: &RuntimeDriverConfig,
    ffmpeg_path: &str,
    app: &AppHandle,
) -> Result<EnvironmentProbePayload, String> {
    let probe = run_probe_command(repo_root, workspace_root, driver, ffmpeg_path, app)?;
    if probe.status == "ready" {
        Ok(probe)
    } else {
        Err(probe.message)
    }
}

pub fn run_download_command(
    app: AppHandle,
    state: RuntimeState,
    task_id: String,
    target: String,
    require_video: bool,
    require_audio: bool,
    require_cover: bool,
    video_quality: u32,
    audio_quality: u32,
    dir_override: Option<String>,
) -> Result<(), String> {
    let driver = state.current_driver_config();
    let ffmpeg_path = state.current_ffmpeg_path();
    let mut command = build_python_command_for_driver(
        &state.repo_root,
        &state.current_workspace_root(),
        &driver,
        ["-m", "uiya.cli", "download"],
    );
    command
        .arg(&target)
        .arg("--require-video").arg(if require_video { "true" } else { "false" })
        .arg("--require-audio").arg(if require_audio { "true" } else { "false" })
        .arg("--require-cover").arg(if require_cover { "true" } else { "false" })
        .arg("--video-quality").arg(video_quality.to_string())
        .arg("--audio-quality").arg(audio_quality.to_string())
        .env("UIYA_FFMPEG_PATH", &ffmpeg_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(dir) = &dir_override {
        command.arg("--dir-override").arg(dir);
    }

    let mut child = command
        .spawn()
        .map_err(|error| format!("failed to spawn download process: {error}"))?;

    // Register the running child so cancel_task can kill it by PID.
    {
        let mut active = state.active_download.lock().unwrap();
        *active = Some((task_id.clone(), child.id()));
    }

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "missing child stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "missing child stderr".to_string())?;

    let app_for_stderr = app.clone();
    let stderr_reader = thread::spawn(move || -> Result<(), String> {
        for line_result in BufReader::new(stderr).lines() {
            let line = line_result.map_err(|error| error.to_string())?;
            if !line.trim().is_empty() {
                app_for_stderr
                    .emit("runtime:raw-log", &line)
                    .map_err(|error| error.to_string())?;
            }
        }
        Ok(())
    });

    let mut stdout_reader = BufReader::new(stdout);
    let mut raw_line = String::new();
    loop {
        raw_line.clear();
        let n = stdout_reader
            .read_line(&mut raw_line)
            .map_err(|error| error.to_string())?;
        if n == 0 {
            break;
        }
        // Strip trailing \n only — keep \r so the frontend can detect progress lines
        let line = raw_line.trim_end_matches('\n');
        if line.trim_matches(|c: char| c == '\r' || c.is_whitespace()).is_empty() {
            continue;
        }
        // Strip \r for JSON parsing only (progress bar lines are never valid JSON)
        let for_parse = line.trim_end_matches('\r');
        if let Ok(envelope) = serde_json::from_str::<PythonEnvelope>(for_parse) {
            if envelope.kind == "event" {
                let payload = envelope.payload;
                let timestamp = super::state::current_timestamp();
                let event = runtime_event_from_python_payload(
                    &task_id,
                    &target,
                    &payload,
                    &timestamp,
                );
                if event.event != "download.file_progress" {
                    let mut queue = state.queue.lock().unwrap();
                    queue.apply_update(
                        &task_id,
                        task_status_from_str(&event.status),
                        event.message.clone(),
                        event.progress_current,
                        event.progress_total,
                    );
                }
                app.emit("runtime:event", &event)
                    .map_err(|error| error.to_string())?;
            }
        } else {
            app.emit("runtime:raw-log", line)
                .map_err(|error| error.to_string())?;
        }
    }

    let status = child.wait().map_err(|error| error.to_string())?;
    // Unregister the child PID regardless of exit status.
    {
        let mut active = state.active_download.lock().unwrap();
        *active = None;
    }
    stderr_reader
        .join()
        .map_err(|_| "stderr reader thread panicked".to_string())??;

    if status.success() {
        Ok(())
    } else {
        Err(format!("download process exited with status {status}"))
    }
}

pub fn run_fetch_meta_command(
    repo_root: &Path,
    workspace_root: &Path,
    driver: &RuntimeDriverConfig,
    url: &str,
    app: &AppHandle,
) -> Result<serde_json::Value, String> {
    let output = build_python_command_for_driver(
        repo_root,
        workspace_root,
        driver,
        ["-m", "uiya.cli", "fetch-meta", url],
    )
    .output()
    .map_err(|error| format!("failed to run fetch-meta: {error}"))?;

    emit_stderr_lines(app, &output.stderr);

    let stdout = String::from_utf8_lossy(&output.stdout);
    let last_line = stdout
        .lines()
        .last()
        .ok_or_else(|| "fetch-meta returned no output".to_string())?;
    let envelope: PythonEnvelope = serde_json::from_str(last_line)
        .map_err(|e| format!("failed to parse fetch-meta output: {e}"))?;

    if let Some(error) = envelope.payload.get("error").and_then(|v| v.as_str()) {
        return Err(error.to_string());
    }

    Ok(envelope.payload)
}

pub fn drain_download_queue(app: AppHandle, state: RuntimeState) {
    loop {
        let next_task = {
            let mut queue = state.queue.lock().unwrap();
            queue.take_next_task_or_mark_idle()
        };

        let Some(task) = next_task else {
            break;
        };

        if let Err(error) = run_download_command(
            app.clone(),
            RuntimeState {
                repo_root: state.repo_root.clone(),
                workspace_root: state.workspace_root.clone(),
                queue: state.queue.clone(),
                driver_config: state.driver_config.clone(),
                ffmpeg_path: state.ffmpeg_path.clone(),
                active_download: state.active_download.clone(),
            },
            task.task_id.clone(),
            task.target.clone(),
            task.require_video,
            task.require_audio,
            task.require_cover,
            task.video_quality,
            task.audio_quality,
            task.dir_override.clone(),
        ) {
            // If the task was already marked cancelled (by cancel_task), don't overwrite.
            let already_cancelled = {
                let queue = state.queue.lock().unwrap();
                queue.tasks.iter()
                    .find(|t| t.task_id == task.task_id)
                    .map(|t| t.status == TaskStatus::Cancelled)
                    .unwrap_or(false)
            };
            if !already_cancelled {
                let timestamp = super::state::current_timestamp();
                let mut queue = state.queue.lock().unwrap();
                queue.apply_update(&task.task_id, TaskStatus::Failed, error.clone(), 3, 3);
                drop(queue);

                let event = build_terminal_failure_event(
                    &task.task_id,
                    &task.target,
                    &error,
                    &timestamp,
                );
                let _ = app.emit("runtime:event", &event);
            }
        }
    }
}

/// Kill the process with the given PID. On Windows, kills the whole process tree.
pub fn kill_process(pid: u32) {
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("taskkill")
        .args(["/F", "/T", "/PID", &pid.to_string()])
        .output();
    #[cfg(not(target_os = "windows"))]
    let _ = std::process::Command::new("kill")
        .args(["-TERM", &pid.to_string()])
        .output();
}

pub fn open_path(path: &Path) -> Result<(), String> {
    let normalized_path = path
        .canonicalize()
        .map_err(|error| format!("failed to resolve open path {}: {error}", path.display()))?;

    #[cfg(target_os = "windows")]
    let mut command = build_windows_open_command(&normalized_path);

    #[cfg(target_os = "linux")]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(&normalized_path);
        command
    };

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(&normalized_path);
        command
    };

    command.spawn().map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(any(target_os = "windows", test))]
fn build_windows_open_command(path: &Path) -> Command {
    let mut command = Command::new("powershell");
    command
        .args([
            "-NoProfile",
            "-Command",
            "Invoke-Item -LiteralPath $env:UIYA_OPEN_PATH",
        ])
        .env("UIYA_OPEN_PATH", path);
    command
}

pub fn pick_workspace_root() -> Result<Option<PathBuf>, String> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description = '选择工作目录'; $dialog.ShowNewFolderButton = $true; if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Write-Output $dialog.SelectedPath }",
            ])
            .output()
            .map_err(|error| format!("failed to open workspace picker: {error}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if stderr.is_empty() {
                "failed to open workspace picker".to_string()
            } else {
                stderr
            });
        }
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return if stdout.is_empty() {
            Ok(None)
        } else {
            Ok(Some(PathBuf::from(stdout)))
        };
    }

    #[cfg(target_os = "macos")]
    {
        let output = Command::new("osascript")
            .args([
                "-e",
                "POSIX path of (choose folder with prompt \"选择工作目录\")",
            ])
            .output()
            .map_err(|error| format!("failed to open workspace picker: {error}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if stderr.is_empty() {
                "failed to open workspace picker".to_string()
            } else {
                stderr
            });
        }
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return if stdout.is_empty() {
            Ok(None)
        } else {
            Ok(Some(PathBuf::from(stdout)))
        };
    }

    #[cfg(target_os = "linux")]
    {
        for (program, args) in [
            (
                "zenity",
                vec![
                    "--file-selection",
                    "--directory",
                    "--title=选择工作目录",
                ],
            ),
            ("kdialog", vec!["--getexistingdirectory", "."]),
        ] {
            let output = Command::new(program).args(args).output();
            let Ok(output) = output else {
                continue;
            };
            if !output.status.success() {
                continue;
            }
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            return if stdout.is_empty() {
                Ok(None)
            } else {
                Ok(Some(PathBuf::from(stdout)))
            };
        }

        Err("failed to open workspace picker: no supported dialog program found".to_string())
    }
}

pub fn resolve_managed_path(workspace_root: &Path, path_key: &str) -> Result<PathBuf, String> {
    let downloads_root = workspace_root.join("downloads");
    let logs_root = workspace_root.join("logs");

    match path_key {
        "workspace" => Ok(workspace_root.to_path_buf()),
        "downloads" => Ok(downloads_root),
        "logs" => Ok(logs_root),
        other => Err(format!("managed path key not found in local runtime layout: {other}")),
    }
}

pub fn write_console_log(log_dir: &Path, contents: &str) -> Result<PathBuf, String> {
    fs::create_dir_all(&log_dir).map_err(|error| error.to_string())?;
    let log_path = log_dir.join(format!(
        "launcher-{}.log",
        super::state::current_timestamp()
    ));
    fs::write(&log_path, contents).map_err(|error| error.to_string())?;
    Ok(log_path)
}

#[cfg(test)]
fn managed_path_from_payload(
    payload: &serde_json::Value,
    path_key: &str,
) -> Result<PathBuf, String> {
    let managed_paths = payload
        .get("managedPaths")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| "inspect-runtime payload missing managedPaths".to_string())?;

    for entry in managed_paths {
        let key = entry
            .get("key")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| "managedPaths entry missing key".to_string())?;
        if key != path_key {
            continue;
        }

        let path = entry
            .get("path")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| format!("managedPaths entry missing path for key: {path_key}"))?;
        return Ok(PathBuf::from(path));
    }

    Err(format!(
        "managed path key not found in inspect-runtime payload: {path_key}"
    ))
}

fn build_terminal_failure_event(
    task_id: &str,
    target: &str,
    message: &str,
    timestamp: &str,
) -> RuntimeEventPayload {
    RuntimeEventPayload {
        event: "download.failed".to_string(),
        task_id: task_id.to_string(),
        target: target.to_string(),
        status: "failed".to_string(),
        message: message.to_string(),
        progress_current: 3,
        progress_total: 3,
        progress_unit: "stage".to_string(),
        timestamp: timestamp.to_string(),
        desc: None,
        percent: None,
        downloaded: None,
        total: None,
    }
}

fn runtime_event_from_python_payload(
    task_id: &str,
    default_target: &str,
    payload: &serde_json::Value,
    timestamp: &str,
) -> RuntimeEventPayload {
    RuntimeEventPayload {
        event: payload["event"]
            .as_str()
            .unwrap_or("download.progress")
            .to_string(),
        task_id: task_id.to_string(),
        target: payload["target"].as_str().unwrap_or(default_target).to_string(),
        status: payload["status"].as_str().unwrap_or("downloading").to_string(),
        message: payload["message"].as_str().unwrap_or("").to_string(),
        progress_current: payload["progressCurrent"].as_u64().unwrap_or(0),
        progress_total: payload["progressTotal"].as_u64().unwrap_or(3),
        progress_unit: payload["progressUnit"]
            .as_str()
            .unwrap_or("stage")
            .to_string(),
        timestamp: timestamp.to_string(),
        desc: payload["desc"].as_str().map(str::to_string),
        percent: payload["percent"].as_u64(),
        downloaded: payload["downloaded"].as_str().map(str::to_string),
        total: payload["total"].as_str().map(str::to_string),
    }
}

fn emit_raw_log(app: &AppHandle, line: &str) {
    let _ = app.emit("runtime:raw-log", line);
}

fn emit_stderr_lines(app: &AppHandle, stderr: &[u8]) {
    let text = String::from_utf8_lossy(stderr);
    for line in text.lines() {
        let line = line.trim();
        if !line.is_empty() {
            let _ = app.emit("runtime:raw-log", line);
        }
    }
}

pub fn build_uv_python_command<I, S>(
    repo_root: &Path,
    workspace_root: &Path,
    python_args: I,
) -> Command
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut command = Command::new("uv");
    command
        .arg("run")
        .arg("--no-sync")
        .arg("python")
        .current_dir(repo_root)
        .env("UIYA_WORKSPACE_ROOT", workspace_root)
        .env("UIYA_RUNTIME_CONFIG", repo_root.join("config").join("uiya.toml"))
        .env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUNBUFFERED", "1");
    for arg in python_args {
        command.arg(arg.as_ref());
    }
    command
}

pub fn build_direct_python_command<I, S>(
    repo_root: &Path,
    workspace_root: &Path,
    python_path: &Path,
    python_args: I,
) -> Command
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut command = Command::new(python_path);
    command
        .current_dir(repo_root)
        .env("UIYA_WORKSPACE_ROOT", workspace_root)
        .env("UIYA_RUNTIME_CONFIG", repo_root.join("config").join("uiya.toml"))
        .env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUNBUFFERED", "1");
    for arg in python_args {
        command.arg(arg.as_ref());
    }
    command
}

pub fn build_python_command_for_driver<I, S>(
    repo_root: &Path,
    workspace_root: &Path,
    driver: &RuntimeDriverConfig,
    python_args: I,
) -> Command
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    match driver {
        RuntimeDriverConfig::Uv => build_uv_python_command(repo_root, workspace_root, python_args),
        RuntimeDriverConfig::DirectPython { python_path } => {
            build_direct_python_command(repo_root, workspace_root, python_path, python_args)
        }
    }
}

pub fn pick_python_path() -> Result<Option<PathBuf>, String> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.OpenFileDialog; $dialog.Title = '选择 Python 可执行文件'; $dialog.Filter = 'Python 可执行文件 (python*.exe)|python*.exe|所有文件 (*.*)|*.*'; if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Write-Output $dialog.FileName }",
            ])
            .output()
            .map_err(|error| format!("failed to open python path picker: {error}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if stderr.is_empty() {
                "failed to open python path picker".to_string()
            } else {
                stderr
            });
        }
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return if stdout.is_empty() {
            Ok(None)
        } else {
            Ok(Some(PathBuf::from(stdout)))
        };
    }

    #[cfg(target_os = "macos")]
    {
        let output = Command::new("osascript")
            .args([
                "-e",
                "POSIX path of (choose file with prompt \"选择 Python 可执行文件\")",
            ])
            .output()
            .map_err(|error| format!("failed to open python path picker: {error}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if stderr.is_empty() {
                "failed to open python path picker".to_string()
            } else {
                stderr
            });
        }
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let path = stdout.trim_end_matches('\n');
        return if path.is_empty() {
            Ok(None)
        } else {
            Ok(Some(PathBuf::from(path)))
        };
    }

    #[cfg(target_os = "linux")]
    {
        for (program, args) in [
            (
                "zenity",
                vec![
                    "--file-selection",
                    "--title=选择 Python 可执行文件",
                ],
            ),
            ("kdialog", vec!["--getopenfilename", "."]),
        ] {
            let output = Command::new(program).args(args).output();
            let Ok(output) = output else {
                continue;
            };
            if !output.status.success() {
                continue;
            }
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            return if stdout.is_empty() {
                Ok(None)
            } else {
                Ok(Some(PathBuf::from(stdout)))
            };
        }

        Err("failed to open python path picker: no supported dialog program found".to_string())
    }
}

pub fn pick_ffmpeg_path() -> Result<Option<PathBuf>, String> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.OpenFileDialog; $dialog.Title = '选择 FFmpeg 可执行文件'; $dialog.Filter = 'FFmpeg 可执行文件 (ffmpeg.exe)|ffmpeg.exe|所有可执行文件 (*.exe)|*.exe'; if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Write-Output $dialog.FileName }",
            ])
            .output()
            .map_err(|error| format!("failed to open ffmpeg path picker: {error}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if stderr.is_empty() {
                "failed to open ffmpeg path picker".to_string()
            } else {
                stderr
            });
        }
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return if stdout.is_empty() {
            Ok(None)
        } else {
            Ok(Some(PathBuf::from(stdout)))
        };
    }

    #[cfg(target_os = "macos")]
    {
        let output = Command::new("osascript")
            .args([
                "-e",
                "POSIX path of (choose file with prompt \"选择 FFmpeg 可执行文件\")",
            ])
            .output()
            .map_err(|error| format!("failed to open ffmpeg path picker: {error}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if stderr.is_empty() {
                "failed to open ffmpeg path picker".to_string()
            } else {
                stderr
            });
        }
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let path = stdout.trim_end_matches('\n');
        return if path.is_empty() {
            Ok(None)
        } else {
            Ok(Some(PathBuf::from(path)))
        };
    }

    #[cfg(target_os = "linux")]
    {
        for (program, args) in [
            (
                "zenity",
                vec![
                    "--file-selection",
                    "--title=选择 FFmpeg 可执行文件",
                ],
            ),
            ("kdialog", vec!["--getopenfilename", "."]),
        ] {
            let output = Command::new(program).args(args).output();
            let Ok(output) = output else {
                continue;
            };
            if !output.status.success() {
                continue;
            }
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            return if stdout.is_empty() {
                Ok(None)
            } else {
                Ok(Some(PathBuf::from(stdout)))
            };
        }

        Err("failed to open ffmpeg path picker: no supported dialog program found".to_string())
    }
}

fn build_probe_payload(
    repo_root: &Path,
    workspace_root: &Path,
    status: &str,
    issues: Vec<String>,
    message: String,
) -> EnvironmentProbePayload {
    EnvironmentProbePayload {
        workspace_root: workspace_root.display().to_string(),
        repo_root: repo_root.display().to_string(),
        status: status.to_string(),
        yutto_available: false,
        yutto_version: None,
        ffmpeg_available: false,
        issues,
        message,
    }
}

fn task_status_from_str(value: &str) -> TaskStatus {
    match value {
        "queued" => TaskStatus::Queued,
        "preparing" => TaskStatus::Preparing,
        "downloading" => TaskStatus::Downloading,
        "verifying" => TaskStatus::Verifying,
        "completed" => TaskStatus::Completed,
        "failed" => TaskStatus::Failed,
        "cancelled" => TaskStatus::Cancelled,
        _ => TaskStatus::Downloading,
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use serde_json::json;

    use super::{
        build_terminal_failure_event, build_uv_python_command, build_windows_open_command,
        managed_path_from_payload, runtime_event_from_python_payload, EnvironmentProbePayload,
    };

    #[test]
    fn build_uv_python_command_always_includes_no_sync() {
        let command = build_uv_python_command(
            Path::new("/tmp/repo"),
            Path::new("/tmp/workspace"),
            ["-m", "uiya.cli", "inspect-runtime"],
        );
        let args = command
            .get_args()
            .map(|value| value.to_string_lossy().into_owned())
            .collect::<Vec<_>>();

        assert_eq!(
            args,
            vec![
                "run".to_string(),
                "--no-sync".to_string(),
                "python".to_string(),
                "-m".to_string(),
                "uiya.cli".to_string(),
                "inspect-runtime".to_string(),
            ]
        );
        let envs = command
            .get_envs()
            .map(|(key, value)| {
                (
                    key.to_string_lossy().into_owned(),
                    value.map(|item| item.to_string_lossy().into_owned()),
                )
            })
            .collect::<Vec<_>>();

        assert!(envs.iter().any(|(key, value)| {
            key == "UIYA_WORKSPACE_ROOT"
                && value.as_deref() == Some("/tmp/workspace")
        }));
        assert!(envs.iter().any(|(key, value)| {
            key == "PYTHONUNBUFFERED" && value.as_deref() == Some("1")
        }));
    }

    #[test]
    fn build_windows_open_command_uses_literal_path_via_env() {
        let command = build_windows_open_command(Path::new(r"C:\Users\demo\Downloads"));
        let args = command
            .get_args()
            .map(|value| value.to_string_lossy().into_owned())
            .collect::<Vec<_>>();

        assert_eq!(
            command.get_program().to_string_lossy(),
            "powershell"
        );
        assert_eq!(
            args,
            vec![
                "-NoProfile".to_string(),
                "-Command".to_string(),
                "Invoke-Item -LiteralPath $env:UIYA_OPEN_PATH".to_string(),
            ]
        );

        let envs = command
            .get_envs()
            .map(|(key, value)| {
                (
                    key.to_string_lossy().into_owned(),
                    value.map(|item| item.to_string_lossy().into_owned()),
                )
            })
            .collect::<Vec<_>>();

        assert!(envs.iter().any(|(key, value)| {
            key == "UIYA_OPEN_PATH"
                && value.as_deref() == Some(r"C:\Users\demo\Downloads")
        }));
    }

    #[test]
    fn environment_probe_payload_defaults_workspace_fields_when_python_probe_omits_them() {
        let payload: EnvironmentProbePayload = serde_json::from_str(
            r#"{
                "status":"ready",
                "yuttoAvailable":true,
                "yuttoVersion":"1.1.4",
                "ffmpegAvailable":true,
                "issues":[],
                "message":"环境就绪"
            }"#,
        )
        .unwrap();

        assert_eq!(payload.workspace_root, "");
        assert_eq!(payload.repo_root, "");
        assert_eq!(payload.status, "ready");
    }

    #[test]
    fn managed_path_from_payload_returns_matched_path() {
        let payload = json!({
            "managedPaths": [
                {"key": "workspace", "path": "/tmp/workspace"},
                {"key": "downloads", "path": "/tmp/downloads"}
            ]
        });

        let resolved = managed_path_from_payload(&payload, "downloads").unwrap();
        assert_eq!(resolved.to_string_lossy(), "/tmp/downloads");
    }

    #[test]
    fn managed_path_from_payload_returns_error_for_unknown_key() {
        let payload = json!({
            "managedPaths": [
                {"key": "workspace", "path": "/tmp/workspace"}
            ]
        });

        let error = managed_path_from_payload(&payload, "genieBase").unwrap_err();
        assert!(error.contains("genieBase"));
    }

    #[test]
    fn build_terminal_failure_event_marks_task_as_failed() {
        let event = build_terminal_failure_event(
            "task-7",
            "genie-base",
            "spawn failed",
            "1712300000",
        );

        assert_eq!(event.event, "download.failed");
        assert_eq!(event.task_id, "task-7");
        assert_eq!(event.target, "genie-base");
        assert_eq!(event.status, "failed");
        assert_eq!(event.message, "spawn failed");
        assert_eq!(event.progress_current, 3);
        assert_eq!(event.progress_total, 3);
        assert_eq!(event.progress_unit, "stage");
        assert_eq!(event.timestamp, "1712300000");
    }

    #[test]
    fn runtime_event_from_python_payload_keeps_file_progress_fields() {
        let payload = json!({
            "event": "download.file_progress",
            "target": "genie-base",
            "status": "downloading",
            "message": "",
            "progressCurrent": 1,
            "progressTotal": 3,
            "progressUnit": "stage",
            "desc": "GenieData/chinese-hubert-base/chinese-hubert-base.onnx",
            "percent": 42,
            "downloaded": "75.0M",
            "total": "180M"
        });

        let event = runtime_event_from_python_payload(
            "task-1",
            "genie-base",
            &payload,
            "1712300001",
        );

        assert_eq!(event.event, "download.file_progress");
        assert_eq!(
            event.desc.as_deref(),
            Some("GenieData/chinese-hubert-base/chinese-hubert-base.onnx")
        );
        assert_eq!(event.percent, Some(42));
        assert_eq!(event.downloaded.as_deref(), Some("75.0M"));
        assert_eq!(event.total.as_deref(), Some("180M"));
    }
}
