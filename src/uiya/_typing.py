from __future__ import annotations

from typing import Any, Literal, TypedDict, get_args

VideoQuality = Literal[
    "360P 流畅",
    "480P 清晰",
    "720P 高清",
    "720P 60帧",
    "1080P 高清",
    "1080P 高码率",
    "1080P 60帧",
    "4K 超清",
    "HDR 真彩",
    "杜比视界",
    "8K 超高清",
]

video_quality_list:list[VideoQuality] = list(get_args(VideoQuality))

AudioQuality = Literal["64kbps", "128kbps", "320kbps", "杜比全景声", "杜比音效", "Hi-Res"]

audio_quality_list:list[AudioQuality] = list(get_args(AudioQuality))

class CommandStatus(TypedDict):
    """Command Status"""

    url: str
    batch_download: bool
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


full_status: CommandStatus = {
    "url": "https://example.com/video123",
    "batch_download": False,
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
    "video_quality": "360P 流畅",
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
    video_quality_list: list[VideoQuality]  # 只保留清晰度描述
    audio_quality_list: list[AudioQuality]  # 只保留比特率描述
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


class RunnerKeys(TypedDict):
    """Session keys use in runner.py"""

    select_p: str  # 被选中的解析卡片 index, list[int]
    click_p: str  # 被点击的解析卡片 index,  int
    parse_content: str  # 解析的卡片 content , list[dict], EpisodeInfo
    video_name: str # 整个视频的名称
    download_content: str  # 下载 output, 和终端保持一致
    parse_command_status: str  # 解析 CommandStatus 格式
    is_running: str  # 是否正在运行
    runtime_error: str  # 运行时错误


class YuttoUiyaKeys(TypedDict):
    """Session keys use in yutto_uiya.py"""

    is_running: str  # 是否正在运行

    save: str  # 是否保存(信息提示)

    flush: str  # 用于刷新页面
