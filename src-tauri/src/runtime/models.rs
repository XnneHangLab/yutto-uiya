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
    /// Relative path under the downloads root where this task's files are saved.
    /// Empty string means the downloads root itself (single-video download).
    pub save_dir: String,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parse_item: Option<ParsedVideoItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_qr_data_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PythonEnvelope {
    pub kind: String,
    pub payload: serde_json::Value,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ParsedVideoItem {
    pub index: u64,
    pub title: String,
    pub url: String,
    /// Per-video output directory relative to the downloads root.
    /// Matches the leaf directory yutto creates during --skip-download parse.
    pub dir: String,
    #[serde(default)]
    pub uploader: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub pubdate: u64,
    #[serde(default)]
    pub duration: u64,
    #[serde(default)]
    pub cover: String,
    #[serde(default)]
    pub view: u64,
    #[serde(default)]
    pub like: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ParsedVideoGroup {
    pub title: String,
    pub dir: String,
    pub items: Vec<ParsedVideoItem>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QualityOption {
    pub label: String,
    pub code: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParseResult {
    pub url: String,
    pub dir: String,
    pub items: Vec<ParsedVideoItem>,
    #[serde(default)]
    pub groups: Vec<ParsedVideoGroup>,
    pub video_qualities: Vec<QualityOption>,
    pub audio_qualities: Vec<QualityOption>,
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
    #[serde(default = "default_auth_state")]
    pub auth_state: String,
    #[serde(default)]
    pub auth_message: String,
    #[serde(default)]
    pub auth_source: String,
}

fn default_auth_state() -> String {
    "unknown".to_string()
}

#[cfg(test)]
mod tests {
    use super::ParseResult;

    #[test]
    fn parse_result_defaults_groups_when_payload_omits_them() {
        let payload = serde_json::json!({
            "url": "https://example.com/video",
            "dir": "downloads",
            "items": [],
            "videoQualities": [],
            "audioQualities": []
        });

        let result: ParseResult =
            serde_json::from_value(payload).expect("payload should deserialize");

        assert!(result.groups.is_empty());
    }
}
