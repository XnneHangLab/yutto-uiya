from __future__ import annotations

from typing import Any, Literal, TypedDict

TargetType = Literal["bangumi", "video", "video_list", "collection", "favor", "space"]
VideoQuality = Literal[
    "360p 流畅",
    "480p 清晰",
    "720p 高清",
    "720p 60帧",
    "1080p 高清",
    "1080p 高码率",
    "1080p 60帧",
    "4K 超清",
    "HDR 真彩",
    "杜比视界",
    "8K 超高清",
]

AudioQuality = Literal["64kbps", "128kbps", "320kbps", "杜比全景声", "杜比音效", "Hi-Res"]


class CommandStatus(TypedDict):
    """Command Status"""

    target_type: TargetType
    url: str
    batch_download: (
        bool  # bangumi:True, video: False, video_list: True, collection: True, Favor: True, bangumi_list: True
    )
    support_select: bool  # bangumi: True, video: False, video_list: True, collection: False, space: False, Favor: False, bangumi_list: False
    selected_p: str | None  # Optional
    require_video: bool
    require_audio: bool
    require_danmaku: bool
    require_cover: bool
    require_metadata: bool
    require_subtitle: bool
    debug_mode: bool
    parse_mode: bool
    no_color: bool
    no_progress: bool
    video_quality: VideoQuality
    audio_quality: AudioQuality


bangumi_status: CommandStatus = {
    "target_type": "bangumi",
    "batch_download": True,
    "support_select": True,
    "url": "https://example.com/video123",
    "selected_p": None,
    "require_video": True,
    "require_audio": True,
    "require_danmaku": True,
    "require_cover": True,
    "require_metadata": True,
    "require_subtitle": True,
    "debug_mode": False,
    "parse_mode": True,
    "no_color": False,
    "no_progress": True,
    "video_quality": "360p 流畅",
    "audio_quality": "320kbps",
}

SupportOS = Literal["windows", "linux", "macos"]


class VideoMetadata(TypedDict):
    title: str
    show_title: str
    plot: str
    thumb: str
    premiered: int
    dateadded: int
    actor: list[dict[str, Any]]
    genre: list[str]
    tag: list[str]
    source: str
    original_filename: str
    website: str
    chapter_info_data: list[Any]


class EpisodeInfo(TypedDict):
    title: str
    link: str
    video_quality_list: list[str]  # 只保留清晰度描述
    audio_quality_list: list[str]  # 只保留比特率描述
    has_danmaku: bool
    has_subtitle: bool
    has_chapter_info: bool
    metadata: VideoMetadata | None
    cover_link: str


class YuttoParseResult(TypedDict):
    video_name: str
    episodes_count: int
    episodes: list[EpisodeInfo]
    current_episode_index: int  # 当前正在处理的集的索引
