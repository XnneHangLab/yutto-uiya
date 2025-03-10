from __future__ import annotations

from uiya._typing import AudioQuality, VideoQuality
from uiya.utils.config import load_settings_file
from uiya.yutto.bangumi import bangumi_batch_download
from uiya.yutto.user_videos import (
    user_collection_video,
    user_favorlist_video,
    user_video,
    user_video_list,
)

Config = load_settings_file("uiya.toml")


def entry_user_video(
    url: str,
    require_video: bool,
    require_audio: bool,
    require_danmaku: bool,
    require_cover: bool,
    video_quality: VideoQuality,
    audio_quality: AudioQuality,
    debug_mode: bool,
) -> str:
    try:
        result = user_video(
            url=url,
            require_video=require_video,
            require_audio=require_audio,
            require_danmaku=require_danmaku,
            require_cover=require_cover,
            video_quality=video_quality,
            audio_quality=audio_quality,
            SESS_DATA=Config.SESS_DATA,
            debug_mode=debug_mode,
        )
        return result
    except Exception as e:
        return str(e)


def entry_user_video_list(
    url: str,
    select_p: str,
    require_video: bool,
    require_audio: bool,
    require_danmaku: bool,
    require_cover: bool,
    video_quality: VideoQuality,
    audio_quality: AudioQuality,
    debug_mode: bool,
) -> str:
    try:
        result = user_video_list(
            url=url,
            select_p=select_p,
            require_video=require_video,
            require_audio=require_audio,
            require_danmaku=require_danmaku,
            require_cover=require_cover,
            video_quality=video_quality,
            audio_quality=audio_quality,
            SESS_DATA=Config.SESS_DATA,
            debug_mode=debug_mode,
        )
        return result
    except Exception as e:
        return str(e)


def entry_favorlist(
    url: str,
    require_video: bool,
    require_audio: bool,
    require_danmaku: bool,
    require_cover: bool,
    video_quality: VideoQuality,
    audio_quality: AudioQuality,
    debug_mode: bool,
) -> str:
    try:
        result = user_favorlist_video(
            url=url,
            require_video=require_video,
            require_audio=require_audio,
            require_danmaku=require_danmaku,
            require_cover=require_cover,
            video_quality=video_quality,
            audio_quality=audio_quality,
            SESS_DATA=Config.SESS_DATA,
            debug_mode=debug_mode,
        )
        return result
    except Exception as e:
        return str(e)


def entry_collection(
    url: str,
    require_video: bool,
    require_audio: bool,
    require_danmaku: bool,
    require_cover: bool,
    video_quality: VideoQuality,
    audio_quality: AudioQuality,
    debug_mode: bool,
) -> str:
    try:
        result = user_collection_video(
            url=url,
            require_video=require_video,
            require_audio=require_audio,
            require_danmaku=require_danmaku,
            require_cover=require_cover,
            video_quality=video_quality,
            audio_quality=audio_quality,
            SESS_DATA=Config.SESS_DATA,
            debug_mode=debug_mode,
        )
        return result
    except Exception as e:
        return str(e)


def entry_bangumi(
    url: str,
    select_p: str,
    require_video: bool,
    require_audio: bool,
    require_danmaku: bool,
    require_cover: bool,
    video_quality: VideoQuality,
    audio_quality: AudioQuality,
    debug_mode: bool,
) -> str:
    try:
        result = bangumi_batch_download(
            url=url,
            select_p=select_p,
            require_video=require_video,
            require_audio=require_audio,
            require_danmaku=require_danmaku,
            require_cover=require_cover,
            video_quality=video_quality,
            audio_quality=audio_quality,
            SESS_DATA=Config.SESS_DATA,
            debug_mode=debug_mode,
        )
        return result
    except Exception as e:
        return str(e)
