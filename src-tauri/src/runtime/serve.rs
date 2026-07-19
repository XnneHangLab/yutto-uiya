use std::collections::VecDeque;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use super::process::{build_python_command_for_driver, emit_raw_log, kill_process};
use super::state::RuntimeState;

pub const SERVE_STATUS_EVENT: &str = "runtime:serve-status";
const SERVE_START_TIMEOUT: Duration = Duration::from_secs(30);
const STDERR_TAIL_LINES: usize = 20;

/// Browser origins the webview may connect from. Rust-side clients send no
/// Origin header and are always accepted by the server (`origins=[None, ...]`).
const ALLOWED_ORIGINS: [&str; 3] = [
    "http://tauri.localhost",
    "https://tauri.localhost",
    "http://localhost:5173",
];

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
enum ServeStatusKind {
    #[default]
    Stopped,
    Starting,
    Running,
    Crashed,
}

impl ServeStatusKind {
    fn as_str(self) -> &'static str {
        match self {
            ServeStatusKind::Stopped => "stopped",
            ServeStatusKind::Starting => "starting",
            ServeStatusKind::Running => "running",
            ServeStatusKind::Crashed => "crashed",
        }
    }
}

/// One yutto server child per uiya instance (`--port 0` keeps instances from
/// colliding). Generation increments on every start/stop so stale monitor
/// threads from a previous child cannot touch the current state.
#[derive(Default)]
pub struct ServeProcess {
    generation: u64,
    status: ServeStatusKind,
    pid: Option<u32>,
    url: Option<String>,
    token: Option<String>,
    exit_code: Option<i32>,
    message: Option<String>,
    /// Kill-on-close job object: if uiya dies without running the graceful
    /// shutdown path, the OS reclaims the serve process tree.
    #[cfg(target_os = "windows")]
    job: Option<win32job::Job>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServeInfo {
    pub url: String,
    pub token: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServeStatusPayload {
    pub status: String,
    pub url: Option<String>,
    pub pid: Option<u32>,
    pub exit_code: Option<i32>,
    pub message: Option<String>,
}

fn status_payload(serve: &ServeProcess) -> ServeStatusPayload {
    ServeStatusPayload {
        status: serve.status.as_str().to_string(),
        url: serve.url.clone(),
        pid: serve.pid,
        exit_code: serve.exit_code,
        message: serve.message.clone(),
    }
}

fn emit_status(app: &AppHandle, serve: &ServeProcess) {
    let _ = app.emit(SERVE_STATUS_EVENT, status_payload(serve));
}

pub fn current_status(state: &RuntimeState) -> ServeStatusPayload {
    let serve = state.serve.lock().unwrap();
    status_payload(&serve)
}

fn generate_token() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).map_err(|error| format!("生成 server token 失败: {error}"))?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

/// Extract the `ws://host:port` address from the server's announce line
/// (`yutto server 正在监听 ws://127.0.0.1:<port>`), the actual bound port when
/// spawned with `--port 0`. Tolerates surrounding text and ANSI sequences.
fn extract_ws_url(line: &str) -> Option<String> {
    let start = line.find("ws://")?;
    let rest = &line[start..];
    let end = rest
        .find(|c: char| c.is_whitespace() || c.is_control())
        .unwrap_or(rest.len());
    let url = &rest[..end];
    if !url.rsplit(':').next()?.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    Some(url.to_string())
}

fn resolve_download_root(state: &RuntimeState) -> PathBuf {
    let dir = state.current_download_dir();
    let path = PathBuf::from(&dir);
    if path.is_absolute() {
        path
    } else {
        state.current_workspace_root().join(path)
    }
}

#[cfg(target_os = "windows")]
fn assign_kill_on_close_job(child: &std::process::Child) -> Result<win32job::Job, String> {
    use std::os::windows::io::AsRawHandle;

    let job = win32job::Job::create().map_err(|error| error.to_string())?;
    let mut info = job
        .query_extended_limit_info()
        .map_err(|error| error.to_string())?;
    info.limit_kill_on_job_close();
    job.set_extended_limit_info(&info)
        .map_err(|error| error.to_string())?;
    job.assign_process(child.as_raw_handle() as _)
        .map_err(|error| error.to_string())?;
    Ok(job)
}

pub fn start_serve(app: &AppHandle, state: &RuntimeState) -> Result<ServeInfo, String> {
    let (token, generation) = {
        let mut serve = state.serve.lock().unwrap();
        match serve.status {
            ServeStatusKind::Running => {
                if let (Some(url), Some(token)) = (&serve.url, &serve.token) {
                    return Ok(ServeInfo {
                        url: url.clone(),
                        token: token.clone(),
                    });
                }
            }
            ServeStatusKind::Starting => {
                return Err("yutto server 正在启动中".to_string());
            }
            _ => {}
        }
        serve.generation += 1;
        serve.status = ServeStatusKind::Starting;
        serve.pid = None;
        serve.url = None;
        serve.exit_code = None;
        serve.message = None;
        let token = generate_token()?;
        serve.token = Some(token.clone());
        emit_status(app, &serve);
        (token, serve.generation)
    };

    let download_root = resolve_download_root(state);
    if let Err(error) = std::fs::create_dir_all(&download_root) {
        return fail_start(app, state, generation, format!("创建下载目录失败: {error}"));
    }

    let ffmpeg_path = state.current_ffmpeg_path();
    let mut args: Vec<String> = vec![
        "-m".into(),
        "yutto".into(),
        "serve".into(),
        "--port".into(),
        "0".into(),
        "--download-root".into(),
        download_root.to_string_lossy().into_owned(),
        "--ffmpeg-path".into(),
        ffmpeg_path,
    ];
    for origin in ALLOWED_ORIGINS {
        args.push("--allow-origin".into());
        args.push(origin.into());
    }

    let mut command = build_python_command_for_driver(
        &state.repo_root,
        &state.current_workspace_root(),
        &state.current_driver_config(),
        args,
    );
    command
        .env("YUTTO_SERVER_TOKEN", &token)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    emit_raw_log(app, "[serve] 正在启动 yutto server …");
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            return fail_start(
                app,
                state,
                generation,
                format!("启动 yutto server 失败: {error}"),
            );
        }
    };
    let pid = child.id();

    #[cfg(target_os = "windows")]
    {
        match assign_kill_on_close_job(&child) {
            Ok(job) => {
                let mut serve = state.serve.lock().unwrap();
                if serve.generation == generation {
                    serve.job = Some(job);
                }
            }
            Err(error) => {
                emit_raw_log(
                    app,
                    &format!("[serve] Job Object 绑定失败（崩溃兜底不可用）: {error}"),
                );
            }
        }
    }
    {
        let mut serve = state.serve.lock().unwrap();
        if serve.generation == generation {
            serve.pid = Some(pid);
        }
    }

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "yutto server missing stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "yutto server missing stderr".to_string())?;

    let stderr_tail: Arc<Mutex<VecDeque<String>>> = Arc::new(Mutex::new(VecDeque::new()));

    let app_for_stderr = app.clone();
    let tail_for_stderr = stderr_tail.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().map_while(Result::ok) {
            let line = line.trim_end().to_string();
            if line.trim().is_empty() {
                continue;
            }
            let _ = app_for_stderr.emit("runtime:raw-log", line.as_str());
            let mut tail = tail_for_stderr.lock().unwrap();
            if tail.len() >= STDERR_TAIL_LINES {
                tail.pop_front();
            }
            tail.push_back(line);
        }
    });

    let (url_tx, url_rx) = mpsc::channel::<String>();
    let app_for_stdout = app.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        let mut url_sender = Some(url_tx);
        for line in reader.lines().map_while(Result::ok) {
            let line = line.trim_end().to_string();
            if line.trim().is_empty() {
                continue;
            }
            let _ = app_for_stdout.emit("runtime:raw-log", line.as_str());
            if let Some(sender) = &url_sender {
                if let Some(url) = extract_ws_url(&line) {
                    let _ = sender.send(url);
                    url_sender = None;
                }
            }
        }
    });

    let app_for_monitor = app.clone();
    let state_for_monitor = state.clone();
    let tail_for_monitor = stderr_tail.clone();
    thread::spawn(move || {
        let status = child.wait().ok();
        let mut serve = state_for_monitor.serve.lock().unwrap();
        if serve.generation != generation {
            return;
        }
        serve.status = ServeStatusKind::Crashed;
        serve.pid = None;
        serve.url = None;
        serve.exit_code = status.and_then(|status| status.code());
        let tail = tail_for_monitor.lock().unwrap();
        serve.message = if tail.is_empty() {
            Some("yutto server 已退出".to_string())
        } else {
            Some(tail.iter().cloned().collect::<Vec<_>>().join("\n"))
        };
        emit_status(&app_for_monitor, &serve);
    });

    match url_rx.recv_timeout(SERVE_START_TIMEOUT) {
        Ok(url) => {
            let mut serve = state.serve.lock().unwrap();
            if serve.generation != generation {
                return Err("yutto server 已被停止".to_string());
            }
            serve.status = ServeStatusKind::Running;
            serve.url = Some(url.clone());
            emit_status(app, &serve);
            emit_raw_log(app, &format!("[serve] yutto server 就绪：{url}"));
            Ok(ServeInfo { url, token })
        }
        Err(_) => {
            // Either the process died before announcing (monitor thread has
            // already marked it crashed) or it hung past the timeout.
            {
                let serve = state.serve.lock().unwrap();
                if serve.generation == generation && serve.status == ServeStatusKind::Crashed {
                    let message = serve
                        .message
                        .clone()
                        .unwrap_or_else(|| "yutto server 启动失败".to_string());
                    return Err(format!("yutto server 启动失败：{message}"));
                }
            }
            kill_process(pid);
            fail_start(app, state, generation, "yutto server 启动超时".to_string())
        }
    }
}

fn fail_start<T>(
    app: &AppHandle,
    state: &RuntimeState,
    generation: u64,
    message: String,
) -> Result<T, String> {
    let mut serve = state.serve.lock().unwrap();
    if serve.generation == generation {
        // Invalidate the monitor thread so it cannot overwrite this state.
        serve.generation += 1;
        serve.status = ServeStatusKind::Crashed;
        serve.pid = None;
        serve.url = None;
        serve.message = Some(message.clone());
        #[cfg(target_os = "windows")]
        {
            serve.job = None;
        }
        emit_status(app, &serve);
    }
    Err(message)
}

pub fn stop_serve(app: &AppHandle, state: &RuntimeState) -> Result<(), String> {
    let mut serve = state.serve.lock().unwrap();
    // Invalidate any monitor thread watching the current child.
    serve.generation += 1;
    if let Some(pid) = serve.pid.take() {
        kill_process(pid);
    }
    serve.status = ServeStatusKind::Stopped;
    serve.url = None;
    serve.token = None;
    serve.exit_code = None;
    serve.message = None;
    #[cfg(target_os = "windows")]
    {
        // Dropping the job handle force-kills any survivors of the tree kill.
        serve.job = None;
    }
    emit_status(app, &serve);
    emit_raw_log(app, "[serve] yutto server 已停止");
    Ok(())
}

/// Best-effort kill on app exit; no events, the webview is already gone.
pub fn shutdown_serve_on_exit(state: &RuntimeState) {
    let mut serve = state.serve.lock().unwrap();
    serve.generation += 1;
    if let Some(pid) = serve.pid.take() {
        kill_process(pid);
    }
    serve.status = ServeStatusKind::Stopped;
    #[cfg(target_os = "windows")]
    {
        serve.job = None;
    }
}

#[cfg(test)]
mod tests {
    use super::extract_ws_url;

    #[test]
    fn extracts_url_from_announce_line() {
        assert_eq!(
            extract_ws_url(" INFO  yutto server 正在监听 ws://127.0.0.1:54321"),
            Some("ws://127.0.0.1:54321".to_string())
        );
    }

    #[test]
    fn extracts_ipv6_announce_line() {
        assert_eq!(
            extract_ws_url("yutto server 正在监听 ws://[::1]:11223"),
            Some("ws://[::1]:11223".to_string())
        );
    }

    #[test]
    fn stops_at_ansi_escape() {
        assert_eq!(
            extract_ws_url("\u{1b}[32m INFO \u{1b}[0m 正在监听 ws://127.0.0.1:9\u{1b}[0m"),
            Some("ws://127.0.0.1:9".to_string())
        );
    }

    #[test]
    fn ignores_lines_without_url() {
        assert_eq!(extract_ws_url("server token 文件：C:\\token.txt"), None);
        assert_eq!(extract_ws_url("ws:// 无端口"), None);
    }
}
