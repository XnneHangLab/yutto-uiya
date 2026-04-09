use std::collections::VecDeque;
use std::path::PathBuf;
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

#[derive(Clone)]
pub struct RuntimeState {
    pub repo_root: PathBuf,
    pub workspace_root: Arc<Mutex<PathBuf>>,
    pub queue: Arc<Mutex<QueueState>>,
    pub driver_config: Arc<Mutex<RuntimeDriverConfig>>,
    pub ffmpeg_path: Arc<Mutex<String>>,
    /// PID of the currently-running download subprocess (task_id, child_pid).
    pub active_download: Arc<Mutex<Option<(String, u32)>>>,
}

impl RuntimeState {
    pub fn new(repo_root: PathBuf, workspace_root: PathBuf) -> Self {
        Self {
            repo_root,
            workspace_root: Arc::new(Mutex::new(workspace_root)),
            queue: Arc::new(Mutex::new(QueueState::default())),
            driver_config: Arc::new(Mutex::new(RuntimeDriverConfig::Uv)),
            ffmpeg_path: Arc::new(Mutex::new("ffmpeg".to_string())),
            active_download: Arc::new(Mutex::new(None)),
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

    pub fn current_ffmpeg_path(&self) -> String {
        self.ffmpeg_path.lock().unwrap().clone()
    }

    pub fn set_ffmpeg_path(&self, next: String) {
        *self.ffmpeg_path.lock().unwrap() = next;
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
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_dir
        .parent()
        .map(|path| path.to_path_buf())
        .ok_or_else(|| "failed to resolve repo root from src-tauri".to_string())
}

pub fn resolve_workspace_root(repo_root: &PathBuf) -> Result<PathBuf, String> {
    if let Ok(value) = std::env::var("UIYA_WORKSPACE_ROOT") {
        return Ok(PathBuf::from(value));
    }

    Ok(repo_root.clone())
}

#[cfg(test)]
mod tests {
    use super::{QueueState, TaskStatus};

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
}
