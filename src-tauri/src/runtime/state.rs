use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

pub const DEFAULT_HOTKEY: &str = "Ctrl+Shift+Space";
pub const DEFAULT_DOWNLOAD_DIR: &str = "./downloads";

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RuntimeDriverConfig {
    Uv,
    DirectPython { python_path: PathBuf },
}

use super::serve::ServeProcess;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(crate) struct AuthProcessState {
    pid: Option<u32>,
    cancel_requested: bool,
}

#[derive(Clone)]
pub struct RuntimeState {
    pub repo_root: PathBuf,
    pub workspace_root: Arc<Mutex<PathBuf>>,
    pub driver_config: Arc<Mutex<RuntimeDriverConfig>>,
    pub portable_python_path: Arc<Mutex<Option<PathBuf>>>,
    pub ffmpeg_path: Arc<Mutex<String>>,
    pub(crate) active_auth: Arc<Mutex<Option<AuthProcessState>>>,
    pub hotkey: Arc<Mutex<String>>,
    /// Download directory — relative (resolved against workspace_root) or absolute.
    pub download_dir: Arc<Mutex<String>>,
    /// Managed `yutto serve` child (one per uiya instance).
    pub(crate) serve: Arc<Mutex<ServeProcess>>,
}

impl RuntimeState {
    pub fn new(repo_root: PathBuf, workspace_root: PathBuf) -> Self {
        Self {
            repo_root,
            workspace_root: Arc::new(Mutex::new(workspace_root)),
            driver_config: Arc::new(Mutex::new(RuntimeDriverConfig::Uv)),
            portable_python_path: Arc::new(Mutex::new(None)),
            ffmpeg_path: Arc::new(Mutex::new("ffmpeg".to_string())),
            active_auth: Arc::new(Mutex::new(None)),
            hotkey: Arc::new(Mutex::new(DEFAULT_HOTKEY.to_string())),
            download_dir: Arc::new(Mutex::new(DEFAULT_DOWNLOAD_DIR.to_string())),
            serve: Arc::new(Mutex::new(ServeProcess::default())),
        }
    }

    pub fn current_workspace_root(&self) -> PathBuf {
        self.workspace_root.lock().unwrap().clone()
    }

    pub fn set_workspace_root(&self, next: PathBuf) {
        *self.workspace_root.lock().unwrap() = next;
    }

    pub fn current_driver_config(&self) -> RuntimeDriverConfig {
        self.driver_config.lock().unwrap().clone()
    }

    pub fn set_driver_config(&self, next: RuntimeDriverConfig) {
        *self.driver_config.lock().unwrap() = next;
    }

    pub fn current_portable_python_path(&self) -> Option<PathBuf> {
        self.portable_python_path.lock().unwrap().clone()
    }

    pub fn set_portable_python_path(&self, next: Option<PathBuf>) {
        *self.portable_python_path.lock().unwrap() = next;
    }

    pub fn current_ffmpeg_path(&self) -> String {
        self.ffmpeg_path.lock().unwrap().clone()
    }

    pub fn set_ffmpeg_path(&self, next: String) {
        *self.ffmpeg_path.lock().unwrap() = next;
    }

    pub fn current_hotkey(&self) -> String {
        self.hotkey.lock().unwrap().clone()
    }

    pub fn set_hotkey_str(&self, next: String) {
        *self.hotkey.lock().unwrap() = next;
    }

    pub fn current_download_dir(&self) -> String {
        self.download_dir.lock().unwrap().clone()
    }

    pub fn set_download_dir(&self, next: String) {
        *self.download_dir.lock().unwrap() = next;
    }

    pub fn auth_in_progress(&self) -> bool {
        self.active_auth.lock().unwrap().is_some()
    }

    pub fn begin_auth_process(&self) {
        *self.active_auth.lock().unwrap() = Some(AuthProcessState::default());
    }

    pub fn set_auth_process_pid(&self, pid: u32) {
        if let Some(active) = self.active_auth.lock().unwrap().as_mut() {
            active.pid = Some(pid);
        }
    }

    #[cfg(test)]
    pub fn current_auth_pid(&self) -> Option<u32> {
        self.active_auth
            .lock()
            .unwrap()
            .as_ref()
            .and_then(|active| active.pid)
    }

    pub fn auth_cancel_requested(&self) -> bool {
        self.active_auth
            .lock()
            .unwrap()
            .as_ref()
            .map(|active| active.cancel_requested)
            .unwrap_or(false)
    }

    pub fn request_auth_cancel(&self) -> Option<u32> {
        let mut active_auth = self.active_auth.lock().unwrap();
        let active = active_auth.as_mut()?;
        active.cancel_requested = true;
        active.pid
    }

    pub fn finish_auth_process(&self) -> bool {
        self.active_auth
            .lock()
            .unwrap()
            .take()
            .map(|active| active.cancel_requested)
            .unwrap_or(false)
    }
}

pub fn current_timestamp() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    seconds.to_string()
}

pub fn resolve_repo_root() -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        return manifest_dir
            .parent()
            .map(|path| path.to_path_buf())
            .ok_or_else(|| "failed to resolve repo root from src-tauri".to_string());
    }

    let exe = std::env::current_exe()
        .map_err(|error| format!("failed to resolve current exe: {error}"))?;
    exe.parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "failed to resolve app root from current exe".to_string())
}

pub fn resolve_workspace_root(repo_root: &Path) -> Result<PathBuf, String> {
    if let Ok(value) = std::env::var("UIYA_WORKSPACE_ROOT") {
        return Ok(PathBuf::from(value));
    }

    Ok(repo_root.to_path_buf())
}

pub fn resolve_portable_python_path(app_root: &Path) -> PathBuf {
    #[cfg(target_os = "windows")]
    return app_root.join("env").join("python.exe");
    #[cfg(not(target_os = "windows"))]
    return app_root.join("env").join("bin").join("python");
}

pub fn resolve_portable_ffmpeg_path(app_root: &Path) -> PathBuf {
    #[cfg(target_os = "windows")]
    return app_root.join("ffmpeg.exe");
    #[cfg(not(target_os = "windows"))]
    return app_root.join("ffmpeg");
}

pub fn read_saved_driver_config(workspace_root: &Path) -> Option<RuntimeDriverConfig> {
    let path = workspace_root.join("config").join("runtime.json");
    let content = std::fs::read_to_string(&path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&content).ok()?;
    match value.get("driver")?.as_str()? {
        "uv" => Some(RuntimeDriverConfig::Uv),
        "conda" => {
            let python_path = value.get("pythonPath")?.as_str()?;
            let path = PathBuf::from(python_path);
            if path.is_file() {
                Some(RuntimeDriverConfig::DirectPython { python_path: path })
            } else {
                None
            }
        }
        _ => None,
    }
}

pub fn read_saved_download_dir(workspace_root: &Path) -> Option<String> {
    let path = workspace_root.join("config").join("runtime.json");
    let content = std::fs::read_to_string(&path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&content).ok()?;
    value.get("downloadDir")?.as_str().map(|s| s.to_string())
}

pub fn write_driver_config(
    workspace_root: &Path,
    driver: &RuntimeDriverConfig,
    download_dir: &str,
) {
    let config_dir = workspace_root.join("config");
    let _ = std::fs::create_dir_all(&config_dir);
    let path = config_dir.join("runtime.json");
    let mut value = match driver {
        RuntimeDriverConfig::Uv => serde_json::json!({"driver": "uv"}),
        RuntimeDriverConfig::DirectPython { python_path } => serde_json::json!({
            "driver": "conda",
            "pythonPath": python_path.display().to_string(),
        }),
    };
    if download_dir != DEFAULT_DOWNLOAD_DIR {
        value["downloadDir"] = serde_json::Value::String(download_dir.to_string());
    }
    if let Ok(content) = serde_json::to_string_pretty(&value) {
        let _ = std::fs::write(&path, content);
    }
}

pub fn read_saved_hotkey(workspace_root: &Path) -> Option<String> {
    let path = workspace_root.join("config").join("hotkey.json");
    let content = std::fs::read_to_string(&path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&content).ok()?;
    value.get("shortcut")?.as_str().map(|s| s.to_string())
}

pub fn write_hotkey_config(workspace_root: &Path, shortcut: &str) {
    let config_dir = workspace_root.join("config");
    let _ = std::fs::create_dir_all(&config_dir);
    let path = config_dir.join("hotkey.json");
    let value = serde_json::json!({"shortcut": shortcut});
    if let Ok(content) = serde_json::to_string_pretty(&value) {
        let _ = std::fs::write(&path, content);
    }
}

#[cfg(test)]
mod tests {
    use super::{
        read_saved_driver_config, resolve_portable_python_path, write_driver_config,
        RuntimeDriverConfig, RuntimeState, DEFAULT_DOWNLOAD_DIR,
    };
    use std::path::PathBuf;

    #[test]
    fn auth_process_state_tracks_pid_and_cancel_flag() {
        let state = RuntimeState::new(PathBuf::from("/repo"), PathBuf::from("/repo"));

        state.begin_auth_process();
        assert!(state.auth_in_progress());
        assert_eq!(state.current_auth_pid(), None);

        state.set_auth_process_pid(4321);
        assert_eq!(state.current_auth_pid(), Some(4321));

        let cancel_pid = state.request_auth_cancel();
        assert_eq!(cancel_pid, Some(4321));

        let was_cancelled = state.finish_auth_process();
        assert!(was_cancelled);
        assert!(!state.auth_in_progress());
        assert_eq!(state.current_auth_pid(), None);
    }

    #[test]
    fn resolve_portable_python_path_returns_env_python_exe() {
        let root = PathBuf::from(r"C:\portable");
        #[cfg(target_os = "windows")]
        let expected = root.join("env").join("python.exe");
        #[cfg(not(target_os = "windows"))]
        let expected = root.join("env").join("bin").join("python");

        assert_eq!(resolve_portable_python_path(&root), expected);
    }

    #[test]
    fn write_and_read_driver_config_round_trips_uv() {
        let tmp = std::env::temp_dir().join(format!(
            "uiya-test-driver-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&tmp).unwrap();

        write_driver_config(&tmp, &RuntimeDriverConfig::Uv, DEFAULT_DOWNLOAD_DIR);
        let restored = read_saved_driver_config(&tmp);
        assert_eq!(restored, Some(RuntimeDriverConfig::Uv));

        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn write_and_read_driver_config_round_trips_conda() {
        let tmp = std::env::temp_dir().join(format!(
            "uiya-test-driver-conda-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(tmp.join("config")).unwrap();
        // create a fake python executable so is_file() passes
        let fake_python = tmp.join("python");
        std::fs::write(&fake_python, b"").unwrap();

        write_driver_config(
            &tmp,
            &RuntimeDriverConfig::DirectPython {
                python_path: fake_python.clone(),
            },
            DEFAULT_DOWNLOAD_DIR,
        );
        let restored = read_saved_driver_config(&tmp);
        assert_eq!(
            restored,
            Some(RuntimeDriverConfig::DirectPython {
                python_path: fake_python
            })
        );

        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn read_saved_driver_config_returns_none_when_file_is_absent() {
        let tmp = std::env::temp_dir().join("uiya-test-driver-absent");
        let _ = std::fs::remove_dir_all(&tmp);
        assert_eq!(read_saved_driver_config(&tmp), None);
    }
}
