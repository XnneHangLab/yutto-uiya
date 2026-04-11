use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RuntimeDriverConfig {
    Uv,
    DirectPython { python_path: PathBuf },
}

use super::models::{RuntimeTaskRecord, TaskStatus};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct QueuedTask {
    pub task_id: String,
    pub target: String,
    pub require_video: bool,
    pub require_audio: bool,
    pub require_cover: bool,
    pub video_quality: u32,
    pub audio_quality: u32,
    /// When set, pass `-b -p <index>` to yutto so the file lands in the correct collection directory.
    pub select_index: Option<u32>,
    /// When set, pass `--dir-override <dir>` so the file lands in the correct collection subdirectory.
    pub dir_override: Option<String>,
}

#[derive(Default)]
pub struct QueueState {
    next_id: u64,
    pub tasks: Vec<RuntimeTaskRecord>,
    pub waiting: VecDeque<QueuedTask>,
    pub worker_running: bool,
}

impl QueueState {
    pub fn enqueue(&mut self, target: String, label: String, require_video: bool, require_audio: bool, require_cover: bool, video_quality: u32, audio_quality: u32, select_index: Option<u32>, dir_override: Option<String>) -> RuntimeTaskRecord {
        self.next_id += 1;
        let task_id = format!("task-{}", self.next_id);
        let queued_target = target.clone();
        let task = RuntimeTaskRecord {
            task_id: task_id.clone(),
            target,
            label,
            status: TaskStatus::Queued,
            message: "已进入下载队列".to_string(),
            progress_current: 0,
            progress_total: 3,
            updated_at: current_timestamp(),
            save_dir: dir_override.clone().unwrap_or_default(),
        };
        self.waiting.push_back(QueuedTask {
            task_id: task_id.clone(),
            target: queued_target,
            require_video,
            require_audio,
            require_cover,
            video_quality,
            audio_quality,
            select_index,
            dir_override,
        });
        self.tasks.push(task.clone());
        task
    }

    pub fn enqueue_with_worker_control(
        &mut self,
        target: String,
        label: String,
        require_video: bool,
        require_audio: bool,
        require_cover: bool,
        video_quality: u32,
        audio_quality: u32,
        select_index: Option<u32>,
        dir_override: Option<String>,
    ) -> (RuntimeTaskRecord, bool) {
        let task = self.enqueue(target, label, require_video, require_audio, require_cover, video_quality, audio_quality, select_index, dir_override);
        if self.worker_running {
            (task, false)
        } else {
            self.worker_running = true;
            (task, true)
        }
    }

    pub fn take_next_task_or_mark_idle(&mut self) -> Option<QueuedTask> {
        match self.waiting.pop_front() {
            Some(task) => Some(task),
            None => {
                self.worker_running = false;
                None
            }
        }
    }

    pub fn apply_update(
        &mut self,
        task_id: &str,
        status: TaskStatus,
        message: String,
        progress_current: u64,
        progress_total: u64,
    ) {
        if let Some(task) = self.tasks.iter_mut().find(|item| item.task_id == task_id) {
            task.status = status;
            task.message = message;
            task.progress_current = progress_current;
            task.progress_total = progress_total;
            task.updated_at = current_timestamp();
        }
    }

    pub fn has_active_tasks(&self) -> bool {
        self.worker_running
            || self
                .tasks
                .iter()
                .any(|task| matches!(
                    task.status,
                    TaskStatus::Queued
                        | TaskStatus::Preparing
                        | TaskStatus::Downloading
                        | TaskStatus::Verifying
                ))
    }

    /// Remove a waiting (not-yet-started) task from the queue, mark it cancelled, and return its target URL.
    /// Returns None if the task is not in the waiting queue (it may already be running).
    pub fn cancel_waiting_task(&mut self, task_id: &str) -> Option<String> {
        let pos = self.waiting.iter().position(|t| t.task_id == task_id)?;
        self.waiting.remove(pos);
        let target = self.tasks.iter()
            .find(|t| t.task_id == task_id)
            .map(|t| t.target.clone())
            .unwrap_or_default();
        self.apply_update(task_id, TaskStatus::Cancelled, "已取消".to_string(), 0, 3);
        Some(target)
    }

    pub fn reset_for_workspace_switch(&mut self) {
        self.next_id = 0;
        self.tasks.clear();
        self.waiting.clear();
        self.worker_running = false;
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(crate) struct AuthProcessState {
    pid: Option<u32>,
    cancel_requested: bool,
}

#[derive(Clone)]
pub struct RuntimeState {
    pub repo_root: PathBuf,
    pub workspace_root: Arc<Mutex<PathBuf>>,
    pub queue: Arc<Mutex<QueueState>>,
    pub driver_config: Arc<Mutex<RuntimeDriverConfig>>,
    pub portable_python_path: Arc<Mutex<Option<PathBuf>>>,
    pub ffmpeg_path: Arc<Mutex<String>>,
    /// PID of the currently-running download subprocess (task_id, child_pid).
    pub active_download: Arc<Mutex<Option<(String, u32)>>>,
    pub(crate) active_auth: Arc<Mutex<Option<AuthProcessState>>>,
}

impl RuntimeState {
    pub fn new(repo_root: PathBuf, workspace_root: PathBuf) -> Self {
        Self {
            repo_root,
            workspace_root: Arc::new(Mutex::new(workspace_root)),
            queue: Arc::new(Mutex::new(QueueState::default())),
            driver_config: Arc::new(Mutex::new(RuntimeDriverConfig::Uv)),
            portable_python_path: Arc::new(Mutex::new(None)),
            ffmpeg_path: Arc::new(Mutex::new("ffmpeg".to_string())),
            active_download: Arc::new(Mutex::new(None)),
            active_auth: Arc::new(Mutex::new(None)),
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

pub fn resolve_workspace_root(repo_root: &PathBuf) -> Result<PathBuf, String> {
    if let Ok(value) = std::env::var("UIYA_WORKSPACE_ROOT") {
        return Ok(PathBuf::from(value));
    }

    Ok(repo_root.clone())
}

pub fn resolve_portable_python_path(app_root: &Path) -> PathBuf {
    #[cfg(target_os = "windows")]
    return app_root.join("env").join("python.exe");
    #[cfg(not(target_os = "windows"))]
    return app_root.join("env").join("bin").join("python");
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

pub fn write_driver_config(workspace_root: &Path, driver: &RuntimeDriverConfig) {
    let config_dir = workspace_root.join("config");
    let _ = std::fs::create_dir_all(&config_dir);
    let path = config_dir.join("runtime.json");
    let value = match driver {
        RuntimeDriverConfig::Uv => serde_json::json!({"driver": "uv"}),
        RuntimeDriverConfig::DirectPython { python_path } => serde_json::json!({
            "driver": "conda",
            "pythonPath": python_path.display().to_string(),
        }),
    };
    if let Ok(content) = serde_json::to_string_pretty(&value) {
        let _ = std::fs::write(&path, content);
    }
}

#[cfg(test)]
mod tests {
    use super::{
        read_saved_driver_config, resolve_portable_python_path, write_driver_config, QueueState,
        RuntimeDriverConfig, RuntimeState, TaskStatus,
    };
    use std::path::PathBuf;

    #[test]
    fn enqueue_adds_a_task_and_keeps_it_queued() {
        let mut queue = QueueState::default();
        let task = queue.enqueue("genie-base".to_string(), "GenieData 基础资源".to_string(), true, true, false, 127, 30280, None, None);

        assert_eq!(task.status, TaskStatus::Queued);
        assert_eq!(queue.tasks.len(), 1);
        assert_eq!(queue.tasks[0].target, "genie-base");
    }

    #[test]
    fn apply_status_updates_existing_task_progress() {
        let mut queue = QueueState::default();
        let task = queue.enqueue("genie-base".to_string(), "GenieData 基础资源".to_string(), true, true, false, 127, 30280, None, None);

        queue.apply_update(
            &task.task_id,
            TaskStatus::Downloading,
            "正在下载".to_string(),
            1,
            3,
        );

        let current = queue
            .tasks
            .iter()
            .find(|item| item.task_id == task.task_id)
            .unwrap();
        assert_eq!(current.status, TaskStatus::Downloading);
        assert_eq!(current.progress_current, 1);
        assert_eq!(current.progress_total, 3);
    }

    #[test]
    fn take_next_task_or_mark_idle_allows_follow_up_enqueue_to_restart_worker() {
        let mut queue = QueueState::default();
        queue.worker_running = true;

        let next = queue.take_next_task_or_mark_idle();
        assert!(next.is_none());
        assert!(!queue.worker_running);

        let (_task, should_start_worker) = queue.enqueue_with_worker_control(
            "genie-base".to_string(),
            "GenieData 基础资源".to_string(),
            true, true, false, 127, 30280, None, None,
        );

        assert!(should_start_worker);
        assert!(queue.worker_running);
    }

    #[test]
    fn take_next_task_or_mark_idle_keeps_enqueued_target() {
        let mut queue = QueueState::default();
        let (task, started_worker) = queue.enqueue_with_worker_control(
            "genie-base".to_string(),
            "GenieData 基础资源".to_string(),
            true, true, false, 127, 30280, None, None,
        );
        assert!(started_worker);

        let next = queue.take_next_task_or_mark_idle().unwrap();
        assert_eq!(next.task_id, task.task_id);
        assert_eq!(next.target, "genie-base");
    }

    #[test]
    fn has_active_tasks_only_reports_live_queue_items() {
        let mut queue = QueueState::default();
        assert!(!queue.has_active_tasks());

        let task = queue.enqueue("genie-base".to_string(), "GenieData 基础资源".to_string(), true, true, false, 127, 30280, None, None);
        assert!(queue.has_active_tasks());

        queue.apply_update(&task.task_id, TaskStatus::Completed, "完成".to_string(), 3, 3);
        queue.worker_running = false;
        assert!(!queue.has_active_tasks());
    }

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
        let tmp = std::env::temp_dir().join(format!("uiya-test-driver-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(&tmp).unwrap();

        write_driver_config(&tmp, &RuntimeDriverConfig::Uv);
        let restored = read_saved_driver_config(&tmp);
        assert_eq!(restored, Some(RuntimeDriverConfig::Uv));

        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn write_and_read_driver_config_round_trips_conda() {
        let tmp = std::env::temp_dir().join(format!("uiya-test-driver-conda-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(tmp.join("config")).unwrap();
        // create a fake python executable so is_file() passes
        let fake_python = tmp.join("python");
        std::fs::write(&fake_python, b"").unwrap();

        write_driver_config(&tmp, &RuntimeDriverConfig::DirectPython { python_path: fake_python.clone() });
        let restored = read_saved_driver_config(&tmp);
        assert_eq!(restored, Some(RuntimeDriverConfig::DirectPython { python_path: fake_python }));

        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn read_saved_driver_config_returns_none_when_file_is_absent() {
        let tmp = std::env::temp_dir().join("uiya-test-driver-absent");
        let _ = std::fs::remove_dir_all(&tmp);
        assert_eq!(read_saved_driver_config(&tmp), None);
    }
}
