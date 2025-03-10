from __future__ import annotations


from typing import Literal, TypedDict

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

AudioQuality = Literal[
    "64kbps", "128kbps", "320kbps", "杜比全景声", "杜比音效", "Hi-Res"
]


class CommandStatus(TypedDict):
    """Command Status"""

    target_type: TargetType
    url: str
    batch_download: bool  # bangumi:True, video: False, video_list: True, collection: True, Favor: True
    support_select: bool  # bangumi: True, video: False, video_list: True, collection: False, space: False, Favor: False
    selected_p: str | None  # Optional
    require_video: bool
    require_audio: bool
    require_danmaku: bool
    require_cover: bool
    debug_mode: bool
    video_quality: VideoQuality
    audio_quality: AudioQuality
