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
}

#[derive(Default)]
pub struct QueueState {
    next_id: u64,
    pub tasks: Vec<RuntimeTaskRecord>,
    pub waiting: VecDeque<QueuedTask>,
    pub worker_running: bool,
}

impl QueueState {
    pub fn enqueue(&mut self, target: String, label: String) -> RuntimeTaskRecord {
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
        });
        self.tasks.push(task.clone());
        task
    }

    pub fn enqueue_with_worker_control(
        &mut self,
        target: String,
        label: String,
    ) -> (RuntimeTaskRecord, bool) {
        let task = self.enqueue(target, label);
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

    pub fn reset_for_workspace_switch(&mut self) {
        self.next_id = 0;
        self.tasks.clear();
        self.waiting.clear();
        self.worker_running = false;
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WebuiProcessRecord {
    pub launch_id: u64,
    pub pid: u32,
}

#[derive(Default)]
pub struct WebuiProcessState {
    next_launch_id: u64,
    active: Option<WebuiProcessRecord>,
}

impl WebuiProcessState {
    #[cfg(test)]
    pub fn current(&self) -> Option<WebuiProcessRecord> {
        self.active.clone()
    }

    pub fn register(&mut self, pid: u32) -> WebuiProcessRecord {
        self.next_launch_id += 1;
        let record = WebuiProcessRecord {
            launch_id: self.next_launch_id,
            pid,
        };
        self.active = Some(record.clone());
        record
    }

    pub fn clear_if_launch_matches(&mut self, launch_id: u64) -> bool {
        if self
            .active
            .as_ref()
            .is_some_and(|record| record.launch_id == launch_id)
        {
            self.active = None;
            true
        } else {
            false
        }
    }

    pub fn take_active(&mut self) -> Option<WebuiProcessRecord> {
        self.active.take()
    }
}

#[derive(Clone)]
pub struct RuntimeState {
    pub repo_root: PathBuf,
    pub workspace_root: Arc<Mutex<PathBuf>>,
    pub queue: Arc<Mutex<QueueState>>,
    pub driver_config: Arc<Mutex<RuntimeDriverConfig>>,
    pub ffmpeg_path: Arc<Mutex<String>>,
    pub webui: Arc<Mutex<WebuiProcessState>>,
}

impl RuntimeState {
    pub fn new(repo_root: PathBuf, workspace_root: PathBuf) -> Self {
        Self {
            repo_root,
            workspace_root: Arc::new(Mutex::new(workspace_root)),
            queue: Arc::new(Mutex::new(QueueState::default())),
            driver_config: Arc::new(Mutex::new(RuntimeDriverConfig::Uv)),
            ffmpeg_path: Arc::new(Mutex::new("ffmpeg".to_string())),
            webui: Arc::new(Mutex::new(WebuiProcessState::default())),
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

    pub fn register_webui_process(&self, pid: u32) -> WebuiProcessRecord {
        self.webui.lock().unwrap().register(pid)
    }

    pub fn clear_webui_process_if_matches(&self, launch_id: u64) -> bool {
        self.webui
            .lock()
            .unwrap()
            .clear_if_launch_matches(launch_id)
    }

    pub fn take_webui_process(&self) -> Option<WebuiProcessRecord> {
        self.webui.lock().unwrap().take_active()
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
    use super::{QueueState, TaskStatus, WebuiProcessState};

    #[test]
    fn enqueue_adds_a_task_and_keeps_it_queued() {
        let mut queue = QueueState::default();
        let task = queue.enqueue("genie-base".to_string(), "GenieData 基础资源".to_string());

        assert_eq!(task.status, TaskStatus::Queued);
        assert_eq!(queue.tasks.len(), 1);
        assert_eq!(queue.tasks[0].target, "genie-base");
    }

    #[test]
    fn apply_status_updates_existing_task_progress() {
        let mut queue = QueueState::default();
        let task = queue.enqueue("genie-base".to_string(), "GenieData 基础资源".to_string());

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

        let task = queue.enqueue("genie-base".to_string(), "GenieData 基础资源".to_string());
        assert!(queue.has_active_tasks());

        queue.apply_update(&task.task_id, TaskStatus::Completed, "完成".to_string(), 3, 3);
        queue.worker_running = false;
        assert!(!queue.has_active_tasks());
    }

    #[test]
    fn register_webui_process_replaces_previous_pid_and_bumps_launch_id() {
        let mut webui = WebuiProcessState::default();

        let first = webui.register(7860);
        let second = webui.register(7861);

        assert!(second.launch_id > first.launch_id);
        assert_eq!(webui.current().unwrap().pid, 7861);
    }

    #[test]
    fn clear_webui_process_only_clears_matching_launch_id() {
        let mut webui = WebuiProcessState::default();

        let first = webui.register(7860);
        let second = webui.register(7861);

        assert!(!webui.clear_if_launch_matches(first.launch_id));
        assert_eq!(webui.current().unwrap().pid, 7861);
        assert!(webui.clear_if_launch_matches(second.launch_id));
        assert!(webui.current().is_none());
    }
}
