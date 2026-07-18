use std::ffi::OsStr;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;

use tauri::{AppHandle, Emitter};

use super::models::{EnvironmentProbePayload, PythonEnvelope, RuntimeEventPayload};
use super::state::{RuntimeDriverConfig, RuntimeState};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

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
    "authState": "unknown",
    "authMessage": "",
    "authSource": "",
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

if result["status"] == "ready":
    try:
        from yutto.auth import default_auth_file, load_auth_file

        auth_profile = "default"
        auth_file = default_auth_file()
        result["authSource"] = f"{auth_file}（profile: {auth_profile}）"
        auth_file_model = load_auth_file(auth_file)

        if auth_file_model is None:
            result["authState"] = "missing"
            result["authMessage"] = "未登录，只能下载低画质"
            result["issues"].append("未找到可用认证信息，将只能下载低画质")
        else:
            entry = auth_file_model.profiles.get(auth_profile)
            if entry is None or not entry.sessdata:
                result["authState"] = "missing"
                result["authMessage"] = "未登录，只能下载低画质"
                result["issues"].append("未找到可用认证信息，将只能下载低画质")
            else:
                result["authState"] = "authenticated"
                result["authMessage"] = "已登录"
    except Exception as error:
        traceback.print_exc()
        result["authState"] = "invalid"
        result["authMessage"] = "认证信息无效，只能下载低画质"
        result["issues"].append(f"认证信息无效，将只能下载低画质: {error}")

_env_ffmpeg = os.environ.get("UIYA_FFMPEG_PATH")
ffmpeg_cmd = _env_ffmpeg if _env_ffmpeg is not None else "ffmpeg"
if ffmpeg_cmd == "ffmpeg":
    try:
        import tomllib
        from pathlib import Path
        config_override = (os.environ.get("UIYA_RUNTIME_CONFIG") or "").strip()
        config_path = Path(config_override) if config_override else (Path("config") / "uiya.toml")
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
        result["status"] = "ffmpeg-unavailable"
        result["message"] = "ffmpeg 不可用"
        result["issues"].append("ffmpeg 返回非零退出码")
except Exception as error:
    traceback.print_exc()
    result["status"] = "ffmpeg-unavailable"
    result["message"] = "ffmpeg 不可用"
    result["issues"].append(f"ffmpeg 不可用: {error}")

print(json.dumps(result, ensure_ascii=False), flush=True)
"#;

fn mark_command_as_background(command: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }

    #[cfg(test)]
    {
        command.env("UIYA_HIDE_CONSOLE_WINDOW", "1");
    }

    #[cfg(all(not(target_os = "windows"), not(test)))]
    let _ = command;
}

fn new_background_command<S>(program: S) -> Command
where
    S: AsRef<OsStr>,
{
    let mut command = Command::new(program);
    mark_command_as_background(&mut command);
    command
}

pub fn run_inspect_command(
    repo_root: &Path,
    workspace_root: &Path,
    driver: &RuntimeDriverConfig,
    app: &AppHandle,
) -> Result<serde_json::Value, String> {
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

pub fn run_save_settings_command(
    repo_root: &Path,
    workspace_root: &Path,
    driver: &RuntimeDriverConfig,
    ffmpeg_path: &str,
    no_proxy: bool,
    download_dir: &str,
    fetch_workers: u32,
) -> Result<(), String> {
    let fetch_workers_arg = fetch_workers.to_string();
    let output = build_python_command_for_driver(
        repo_root,
        workspace_root,
        driver,
        [
            "-m",
            "uiya.cli",
            "save-settings",
            "--ffmpeg-path",
            ffmpeg_path,
            "--no-proxy",
            if no_proxy { "true" } else { "false" },
            "--download-dir",
            download_dir,
            "--fetch-workers",
            fetch_workers_arg.as_str(),
        ],
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

pub fn run_auth_login_command(
    repo_root: &Path,
    workspace_root: &Path,
    driver: &RuntimeDriverConfig,
    state: &RuntimeState,
    app: &AppHandle,
) -> Result<(), String> {
    emit_raw_log(app, "[auth] 开始登录流程 …");

    let mut command = build_python_command_for_driver(
        repo_root,
        workspace_root,
        driver,
        ["-m", "uiya.cli", "auth-login"],
    );
    command.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|error| format!("failed to run auth-login command: {error}"))?;
    state.set_auth_process_pid(child.id());
    if state.auth_cancel_requested() {
        kill_process(child.id());
    }

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "auth-login command missing stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "auth-login command missing stderr".to_string())?;

    let app_for_stderr = app.clone();
    let stderr_handle = thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().map_while(Result::ok) {
            let line = line.trim().to_string();
            if !line.is_empty() {
                let _ = app_for_stderr.emit("runtime:raw-log", line);
            }
        }
    });

    let mut final_payload: Option<serde_json::Value> = None;
    let reader = BufReader::new(stdout);
    for line in reader.lines() {
        let line = line.map_err(|error| format!("failed to read auth-login stdout: {error}"))?;
        let line = line.trim().to_string();
        if line.is_empty() {
            continue;
        }

        match serde_json::from_str::<PythonEnvelope>(&line) {
            Ok(envelope) => match envelope.kind.as_str() {
                "event" => {
                    let timestamp = super::state::current_timestamp();
                    let event = runtime_event_from_python_payload(
                        "",
                        "auth",
                        &envelope.payload,
                        &timestamp,
                    );
                    let _ = app.emit("runtime:event", &event);
                }
                "payload" => {
                    final_payload = Some(envelope.payload);
                }
                _ => emit_raw_log(app, &line),
            },
            Err(_) => emit_raw_log(app, &line),
        }
    }

    let status = child
        .wait()
        .map_err(|error| format!("failed to wait for auth-login command: {error}"))?;
    let _ = stderr_handle.join();

    let payload = final_payload.unwrap_or_else(|| serde_json::json!({}));
    if !status.success() {
        if let Some(error) = payload.get("error").and_then(serde_json::Value::as_str) {
            return Err(error.to_string());
        }
        return Err(format!(
            "auth-login command failed with exit code {:?}",
            status.code()
        ));
    }

    if payload.get("ok").and_then(serde_json::Value::as_bool) == Some(false) {
        if let Some(error) = payload.get("error").and_then(serde_json::Value::as_str) {
            return Err(error.to_string());
        }
    }

    Ok(())
}

pub fn run_auth_logout_command(
    repo_root: &Path,
    workspace_root: &Path,
    driver: &RuntimeDriverConfig,
) -> Result<String, String> {
    let output = build_python_command_for_driver(
        repo_root,
        workspace_root,
        driver,
        ["-m", "uiya.cli", "auth-logout"],
    )
    .output()
    .map_err(|error| format!("failed to run auth-logout command: {error}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let last_line = stdout
        .lines()
        .last()
        .ok_or_else(|| "auth-logout command returned no stdout".to_string())?;
    let envelope: PythonEnvelope =
        serde_json::from_str(last_line).map_err(|error| error.to_string())?;
    let payload = envelope.payload;

    if !output.status.success()
        || payload.get("ok").and_then(serde_json::Value::as_bool) == Some(false)
    {
        if let Some(error) = payload.get("error").and_then(serde_json::Value::as_str) {
            return Err(error.to_string());
        }
        return Err("auth-logout command failed".to_string());
    }

    Ok(payload
        .get("message")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("已退出登录")
        .to_string())
}

pub fn run_uv_sync_command(repo_root: &Path, app: &AppHandle) -> Result<(), String> {
    emit_raw_log(app, "[sync] 开始执行 uv sync …");

    let mut child = new_background_command("uv")
        .arg("sync")
        .current_dir(repo_root)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("无法启动 uv: {error}"))?;

    let stderr = child.stderr.take().ok_or("无法获取 stderr")?;
    let stdout = child.stdout.take().ok_or("无法获取 stdout")?;

    // uv writes progress/status to stderr; stream it in a thread
    let app_for_stderr = app.clone();
    let stderr_handle = thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().map_while(Result::ok) {
            // preserve \r so the frontend can do in-place progress overwrite
            let line = line.trim_end_matches('\n');
            if !line.trim_matches('\r').trim().is_empty() {
                let _ = app_for_stderr.emit("runtime:raw-log", line);
            }
        }
    });

    // stdout is usually empty for uv sync but capture it anyway
    let reader = BufReader::new(stdout);
    for line in reader.lines().map_while(Result::ok) {
        let line = line.trim_end_matches('\n');
        if !line.trim().is_empty() {
            let _ = app.emit("runtime:raw-log", line);
        }
    }

    let _ = stderr_handle.join();
    let status = child
        .wait()
        .map_err(|error| format!("等待进程结束失败: {error}"))?;

    if status.success() {
        emit_raw_log(app, "[sync] uv sync 完成");
        Ok(())
    } else {
        let code = status.code().unwrap_or(-1);
        Err(format!("uv sync 失败，退出码: {code}"))
    }
}

pub fn run_probe_command(
    repo_root: &Path,
    workspace_root: &Path,
    driver: &RuntimeDriverConfig,
    ffmpeg_path: &str,
    app: &AppHandle,
) -> Result<EnvironmentProbePayload, String> {
    emit_raw_log(app, "[probe] 开始检测运行环境 …");

    if !workspace_root.is_dir() {
        emit_raw_log(
            app,
            &format!("[probe] 工作目录无效: {}", workspace_root.display()),
        );
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
            let uv_version = new_background_command("uv")
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
                let stderr = String::from_utf8_lossy(&uv_version.stderr)
                    .trim()
                    .to_string();
                emit_raw_log(app, &format!("[probe] uv 不可用: {stderr}"));
                return Ok(build_probe_payload(
                    repo_root,
                    workspace_root,
                    "uv-unavailable",
                    vec![stderr.clone()],
                    "uv 不可用".to_string(),
                ));
            }

            let uv_ver_str = String::from_utf8_lossy(&uv_version.stdout)
                .trim()
                .to_string();
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
        let stderr = String::from_utf8_lossy(&python_probe.stderr)
            .trim()
            .to_string();
        return Ok(build_probe_payload(
            repo_root,
            workspace_root,
            "python-unavailable",
            vec![stderr.clone()],
            "Python 不可用".to_string(),
        ));
    }

    let python_exe = String::from_utf8_lossy(&python_probe.stdout)
        .trim()
        .to_string();
    if !python_exe.is_empty() {
        emit_raw_log(app, &format!("[probe] Python: {python_exe}"));
    }

    let output = build_python_command_for_driver(
        repo_root,
        workspace_root,
        driver,
        ["-c", ENVIRONMENT_PROBE_SCRIPT],
    )
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
    payload.platform = detect_platform();

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

pub fn run_fetch_cover_command(
    repo_root: &Path,
    workspace_root: &Path,
    driver: &RuntimeDriverConfig,
    url: &str,
    app: &AppHandle,
) -> Result<String, String> {
    let output = build_python_command_for_driver(
        repo_root,
        workspace_root,
        driver,
        ["-m", "uiya.cli", "fetch-cover", url],
    )
    .output()
    .map_err(|error| format!("failed to run fetch-cover: {error}"))?;

    emit_stderr_lines(app, &output.stderr);

    let stdout = String::from_utf8_lossy(&output.stdout);
    let last_line = stdout
        .lines()
        .last()
        .ok_or_else(|| "fetch-cover returned no output".to_string())?;
    let envelope: PythonEnvelope = serde_json::from_str(last_line)
        .map_err(|e| format!("failed to parse fetch-cover output: {e}"))?;

    if let Some(error) = envelope.payload.get("error").and_then(|v| v.as_str()) {
        return Err(error.to_string());
    }

    envelope
        .payload
        .get("dataUrl")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "fetch-cover payload missing dataUrl".to_string())
}

pub fn run_convert_wav_command(
    repo_root: &Path,
    workspace_root: &Path,
    driver: &RuntimeDriverConfig,
    ffmpeg_path: &str,
    relative_dir: &str,
    app: &AppHandle,
) -> Result<(), String> {
    emit_raw_log(app, "[wav] 正在转码 m4a/aac → wav …");
    let mut command = build_python_command_for_driver(
        repo_root,
        workspace_root,
        driver,
        ["-m", "uiya.cli", "convert-wav", "--dir", relative_dir],
    );
    command
        .env("UIYA_FFMPEG_PATH", ffmpeg_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|error| format!("failed to run convert-wav: {error}"))?;
    let stdout = child.stdout.take().ok_or("convert-wav missing stdout")?;
    let stderr = child.stderr.take().ok_or("convert-wav missing stderr")?;

    let app_for_stderr = app.clone();
    let stderr_handle = thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().map_while(Result::ok) {
            if !line.trim().is_empty() {
                let _ = app_for_stderr.emit("runtime:raw-log", line);
            }
        }
    });
    let reader = BufReader::new(stdout);
    for line in reader.lines().map_while(Result::ok) {
        if !line.trim().is_empty() {
            emit_raw_log(app, &line);
        }
    }
    let _ = stderr_handle.join();
    let status = child
        .wait()
        .map_err(|error| format!("failed to wait for convert-wav: {error}"))?;
    if status.success() {
        emit_raw_log(app, "[wav] 转码完成");
        Ok(())
    } else {
        Err(format!(
            "convert-wav failed with exit code {:?}",
            status.code()
        ))
    }
}

/// Windows system proxy (WinINET, what browsers follow), or None when
/// disabled/absent. Read live per call so toggling the proxy client's
/// "system proxy" switch takes effect immediately — unlike environment
/// variables, which are frozen at process launch.
pub fn read_system_proxy() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        let query = |value: &str| -> Option<String> {
            let output = new_background_command("reg")
                .args([
                    "query",
                    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings",
                    "/v",
                    value,
                ])
                .output()
                .ok()?;
            String::from_utf8_lossy(&output.stdout)
                .lines()
                .find_map(|line| {
                    let mut parts = line.split_whitespace();
                    if parts.next() != Some(value) {
                        return None;
                    }
                    parts.next(); // REG_DWORD / REG_SZ
                    parts.next().map(str::to_string)
                })
        };
        let enabled = query("ProxyEnable")?;
        if enabled != "0x1" {
            return None;
        }
        parse_windows_proxy_server(&query("ProxyServer")?)
    }
    #[cfg(not(target_os = "windows"))]
    {
        None
    }
}

/// Normalize the WinINET ProxyServer value into a proxy URL yutto accepts
/// (http/https/socks5 schemes). Handles both the plain `host:port` form and
/// the per-protocol `http=...;https=...;socks=...` form.
// Only the Windows branch of read_system_proxy calls this, but the parsing is
// pure string logic — keep it compiled (and unit-tested) on every platform.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub fn parse_windows_proxy_server(server: &str) -> Option<String> {
    let server = server.trim();
    if server.is_empty() {
        return None;
    }
    if !server.contains('=') {
        return Some(normalize_proxy_url(server, "http"));
    }
    let mut by_protocol = std::collections::HashMap::new();
    for entry in server.split(';') {
        if let Some((protocol, address)) = entry.split_once('=') {
            by_protocol.insert(protocol.trim().to_ascii_lowercase(), address.trim());
        }
    }
    for (protocol, scheme) in [("https", "http"), ("http", "http"), ("socks", "socks5")] {
        if let Some(address) = by_protocol.get(protocol) {
            if !address.is_empty() {
                return Some(normalize_proxy_url(address, scheme));
            }
        }
    }
    None
}

fn normalize_proxy_url(address: &str, default_scheme: &str) -> String {
    if address.contains("://") {
        address.to_string()
    } else {
        format!("{default_scheme}://{address}")
    }
}

/// Kill the process with the given PID. On Windows, kills the whole process tree.
pub fn kill_process(pid: u32) {
    #[cfg(target_os = "windows")]
    let _ = new_background_command("taskkill")
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

pub fn open_url(url: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = new_background_command("powershell");
        command
            .args(["-NoProfile", "-Command", "Start-Process $env:UIYA_OPEN_URL"])
            .env("UIYA_OPEN_URL", url);
        command
    };

    #[cfg(target_os = "linux")]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(url);
        command
    };

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(url);
        command
    };

    command.spawn().map_err(|error| error.to_string())?;
    Ok(())
}
#[cfg(any(target_os = "windows", test))]
fn build_windows_open_command(path: &Path) -> Command {
    let mut command = new_background_command("powershell");
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
        let output = new_background_command("powershell")
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
        if stdout.is_empty() {
            Ok(None)
        } else {
            Ok(Some(PathBuf::from(stdout)))
        }
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
        if stdout.is_empty() {
            Ok(None)
        } else {
            Ok(Some(PathBuf::from(stdout)))
        }
    }

    #[cfg(target_os = "linux")]
    {
        for (program, args) in [
            (
                "zenity",
                vec!["--file-selection", "--directory", "--title=选择工作目录"],
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

pub fn resolve_managed_path(
    workspace_root: &Path,
    path_key: &str,
    download_dir: Option<&str>,
) -> Result<PathBuf, String> {
    let logs_root = workspace_root.join("logs");

    match path_key {
        "workspace" => Ok(workspace_root.to_path_buf()),
        "downloads" => {
            let dir = download_dir.unwrap_or("./downloads");
            let path = PathBuf::from(dir);
            if path.is_absolute() {
                Ok(path)
            } else {
                Ok(workspace_root.join(dir))
            }
        }
        "logs" => Ok(logs_root),
        other => Err(format!(
            "managed path key not found in local runtime layout: {other}"
        )),
    }
}

pub fn write_console_log(log_dir: &Path, contents: &str) -> Result<PathBuf, String> {
    fs::create_dir_all(log_dir).map_err(|error| error.to_string())?;
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
        target: payload["target"]
            .as_str()
            .unwrap_or(default_target)
            .to_string(),
        status: payload["status"]
            .as_str()
            .unwrap_or("downloading")
            .to_string(),
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
        auth_qr_data_url: payload["authQrDataUrl"].as_str().map(str::to_string),
    }
}

pub(crate) fn emit_raw_log(app: &AppHandle, line: &str) {
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
    let mut command = new_background_command("uv");
    command
        .arg("run")
        .arg("--no-sync")
        .arg("python")
        .current_dir(repo_root)
        .env("UIYA_WORKSPACE_ROOT", workspace_root)
        .env("UIYA_RUNTIME_CONFIG", runtime_config_path(workspace_root))
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
    let mut command = new_background_command(python_path);
    command
        .current_dir(repo_root)
        .env("UIYA_WORKSPACE_ROOT", workspace_root)
        .env("UIYA_RUNTIME_CONFIG", runtime_config_path(workspace_root))
        .env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUNBUFFERED", "1")
        .env("PYTHONPATH", repo_root.join("python"));
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

fn runtime_config_path(workspace_root: &Path) -> PathBuf {
    workspace_root.join("config").join("uiya.toml")
}

pub fn pick_python_path() -> Result<Option<PathBuf>, String> {
    #[cfg(target_os = "windows")]
    {
        let output = new_background_command("powershell")
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
        if stdout.is_empty() {
            Ok(None)
        } else {
            Ok(Some(PathBuf::from(stdout)))
        }
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
                vec!["--file-selection", "--title=选择 Python 可执行文件"],
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
        let output = new_background_command("powershell")
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
        if stdout.is_empty() {
            Ok(None)
        } else {
            Ok(Some(PathBuf::from(stdout)))
        }
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
                vec!["--file-selection", "--title=选择 FFmpeg 可执行文件"],
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

pub fn pick_download_dir() -> Result<Option<PathBuf>, String> {
    #[cfg(target_os = "windows")]
    {
        let output = new_background_command("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description = '选择下载目录'; $dialog.ShowNewFolderButton = $true; if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Write-Output $dialog.SelectedPath }",
            ])
            .output()
            .map_err(|error| format!("failed to open download dir picker: {error}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if stderr.is_empty() {
                "failed to open download dir picker".to_string()
            } else {
                stderr
            });
        }
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stdout.is_empty() {
            Ok(None)
        } else {
            Ok(Some(PathBuf::from(stdout)))
        }
    }

    #[cfg(target_os = "macos")]
    {
        let output = Command::new("osascript")
            .args([
                "-e",
                "POSIX path of (choose folder with prompt \"选择下载目录\")",
            ])
            .output()
            .map_err(|error| format!("failed to open download dir picker: {error}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if stderr.is_empty() {
                "failed to open download dir picker".to_string()
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
                vec!["--file-selection", "--directory", "--title=选择下载目录"],
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

        Err("failed to open download dir picker: no supported dialog program found".to_string())
    }
}

fn detect_platform() -> String {
    #[cfg(target_os = "windows")]
    return "Windows".to_string();

    #[cfg(target_os = "macos")]
    return "macOS".to_string();

    #[cfg(target_os = "linux")]
    {
        if let Ok(content) = std::fs::read_to_string("/etc/os-release") {
            for line in content.lines() {
                if let Some(rest) = line.strip_prefix("PRETTY_NAME=") {
                    let name = rest.trim_matches('"');
                    if !name.is_empty() {
                        return name.to_string();
                    }
                }
            }
        }
        "Linux".to_string()
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    return std::env::consts::OS.to_string();
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
        auth_state: "unknown".to_string(),
        auth_message: String::new(),
        auth_source: String::new(),
        platform: detect_platform(),
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use serde_json::json;

    use super::{
        build_direct_python_command, build_uv_python_command, build_windows_open_command,
        managed_path_from_payload, parse_windows_proxy_server, runtime_config_path,
        runtime_event_from_python_payload, EnvironmentProbePayload, ENVIRONMENT_PROBE_SCRIPT,
    };

    #[test]
    fn parse_windows_proxy_server_plain_host_port() {
        assert_eq!(
            parse_windows_proxy_server("127.0.0.1:7890"),
            Some("http://127.0.0.1:7890".to_string())
        );
    }

    #[test]
    fn parse_windows_proxy_server_per_protocol_prefers_https() {
        assert_eq!(
            parse_windows_proxy_server(
                "http=127.0.0.1:7890;https=127.0.0.1:7891;socks=127.0.0.1:7892"
            ),
            Some("http://127.0.0.1:7891".to_string())
        );
    }

    #[test]
    fn parse_windows_proxy_server_socks_only_maps_to_socks5() {
        assert_eq!(
            parse_windows_proxy_server("socks=127.0.0.1:7892"),
            Some("socks5://127.0.0.1:7892".to_string())
        );
    }

    #[test]
    fn parse_windows_proxy_server_keeps_existing_scheme_and_rejects_empty() {
        assert_eq!(
            parse_windows_proxy_server("socks5://127.0.0.1:1080"),
            Some("socks5://127.0.0.1:1080".to_string())
        );
        assert_eq!(parse_windows_proxy_server("  "), None);
        assert_eq!(parse_windows_proxy_server("ftp=127.0.0.1:2121"), None);
    }

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
            key == "UIYA_WORKSPACE_ROOT" && value.as_deref() == Some("/tmp/workspace")
        }));
        assert!(envs.iter().any(|(key, value)| {
            key == "UIYA_HIDE_CONSOLE_WINDOW" && value.as_deref() == Some("1")
        }));
        assert!(envs
            .iter()
            .any(|(key, value)| { key == "PYTHONUNBUFFERED" && value.as_deref() == Some("1") }));
    }

    #[test]
    fn build_direct_python_command_uses_workspace_config_path() {
        let command = build_direct_python_command(
            Path::new("/repo"),
            Path::new("/app"),
            Path::new("/app/env/python.exe"),
            ["-m", "uiya.cli", "inspect-runtime"],
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

        // Path::join 的分隔符跟随平台，期望值必须同样拼出来（Windows 是反斜杠）。
        let expected_config = runtime_config_path(Path::new("/app"))
            .to_string_lossy()
            .into_owned();
        let expected_pythonpath = Path::new("/repo")
            .join("python")
            .to_string_lossy()
            .into_owned();
        assert!(envs.iter().any(|(key, value)| {
            key == "UIYA_RUNTIME_CONFIG" && value.as_deref() == Some(expected_config.as_str())
        }));
        assert!(envs.iter().any(|(key, value)| {
            key == "UIYA_HIDE_CONSOLE_WINDOW" && value.as_deref() == Some("1")
        }));
        assert!(envs.iter().any(|(key, value)| {
            key == "PYTHONPATH" && value.as_deref() == Some(expected_pythonpath.as_str())
        }));
    }

    #[test]
    fn environment_probe_script_prefers_runtime_config_env_path() {
        assert!(ENVIRONMENT_PROBE_SCRIPT.contains("UIYA_RUNTIME_CONFIG"));
    }

    #[test]
    fn build_windows_open_command_uses_literal_path_via_env() {
        let command = build_windows_open_command(Path::new(r"C:\Users\demo\Downloads"));
        let args = command
            .get_args()
            .map(|value| value.to_string_lossy().into_owned())
            .collect::<Vec<_>>();

        assert_eq!(command.get_program().to_string_lossy(), "powershell");
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
            key == "UIYA_OPEN_PATH" && value.as_deref() == Some(r"C:\Users\demo\Downloads")
        }));
        assert!(envs.iter().any(|(key, value)| {
            key == "UIYA_HIDE_CONSOLE_WINDOW" && value.as_deref() == Some("1")
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
        assert_eq!(payload.auth_state, "unknown");
        assert_eq!(payload.auth_message, "");
        assert_eq!(payload.auth_source, "");
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

        let event =
            runtime_event_from_python_payload("task-1", "genie-base", &payload, "1712300001");

        assert_eq!(event.event, "download.file_progress");
        assert_eq!(
            event.desc.as_deref(),
            Some("GenieData/chinese-hubert-base/chinese-hubert-base.onnx")
        );
        assert_eq!(event.percent, Some(42));
        assert_eq!(event.downloaded.as_deref(), Some("75.0M"));
        assert_eq!(event.total.as_deref(), Some("180M"));
    }

    #[test]
    fn runtime_event_from_python_payload_keeps_auth_qr_data_url() {
        let payload = json!({
            "event": "auth.login.qr",
            "target": "auth",
            "status": "pending",
            "message": "请扫码登录",
            "progressCurrent": 1,
            "progressTotal": 3,
            "progressUnit": "step",
            "authQrDataUrl": "data:image/png;base64,abc"
        });

        let event = runtime_event_from_python_payload("", "auth", &payload, "1712300003");

        assert_eq!(event.event, "auth.login.qr");
        assert_eq!(
            event.auth_qr_data_url.as_deref(),
            Some("data:image/png;base64,abc")
        );
    }
}
