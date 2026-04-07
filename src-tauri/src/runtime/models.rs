use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TaskStatus {
    Queued,
    Preparing,
    Downloading,
    Verifying,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeTaskRecord {
    pub task_id: String,
    pub target: String,
    pub label: String,
    pub status: TaskStatus,
    pub message: String,
    pub progress_current: u64,
    pub progress_total: u64,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeEventPayload {
    pub event: String,
    pub task_id: String,
    pub target: String,
    pub status: String,
    pub message: String,
    pub progress_current: u64,
    pub progress_total: u64,
    pub progress_unit: String,
    pub timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub desc: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub percent: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub downloaded: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PythonEnvelope {
    pub kind: String,
    pub payload: serde_json::Value,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedVideoItem {
    pub index: u64,
    pub title: String,
    pub url: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentProbePayload {
    #[serde(default)]
    pub workspace_root: String,
    #[serde(default)]
    pub repo_root: String,
    pub status: String,
    pub yutto_available: bool,
    pub yutto_version: Option<String>,
    pub ffmpeg_available: bool,
    pub issues: Vec<String>,
    pub message: String,
}
