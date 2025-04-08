from __future__ import annotations

from typing import TYPE_CHECKING

from uiya._dataclass import CommandGenerator
from uiya.utils.subproc import run_command
from uiya.utils.TextHelper import process_expection

if TYPE_CHECKING:
    from uiya._typing import AudioQuality, CommandStatus, VideoQuality


# 番剧默认参数
status: CommandStatus = {
    "target_type": "bangumi",
    "batch_download": True,
    "support_select": True,
    "url": "https://example.com/video123",  # adjustable
    "selected_p": None,  # adjustable/Optional
    "require_video": True,  # adjustable
    "require_audio": True,  # adjustable
    "require_danmaku": False,  # adjustable
    "require_cover": False,  # adjustable
    "debug_mode": False,  # adjustable
    "video_quality": "360p 流畅",  # adjustable
    "audio_quality": "320kbps",  # adjustable
}


# TODO: 似乎只支持-b,并且并不能直接获取url对应的那一话
# 下载单个番剧的指定一集
# 示例: https://www.bilibili.com/bangumi/play/ss48811
def bangumi_batch_download(
    url: str,
    select_p: str,
    require_video: bool,
    require_audio: bool,
    require_danmaku: bool,
    require_cover: bool,
    video_quality: VideoQuality,
    audio_quality: AudioQuality,
    SESS_DATA: str = "",
    debug_mode: bool = False,
) -> str:
    """
    下载单个番剧的指定一集
    :param url: 指定集数的番剧链接
    :param select_p: 用户选集
    :param require_video: 是否下载视频画面
    :param require_audio: 是否下载视频音频
    :param require_danmaku 是否下载视频弹幕
    :param SESSDATA: SESSDATA, 用于保持用户登录信息,如果下载大会员必须指定SESSDATA
    :return: 200/404/500
    """

    # 任务默认参数
    status.update({"target_type": "bangumi"})
    status.update({"batch_download": True})
    status.update({"support_select": True})

    # 用户自定义参数,由 UI 传入
    status.update({"url": url})
    status.update({"selected_p": select_p})
    status.update({"require_video": require_video})
    status.update({"require_audio": require_audio})
    status.update({"require_danmaku": require_danmaku})
    status.update({"require_cover": require_cover})
    status.update({"debug_mode": debug_mode})
    status.update({"video_quality": video_quality})
    status.update({"audio_quality": audio_quality})
    command_generator = CommandGenerator.from_status(status)  # 通过from_status来初始化
    command = command_generator.gen_args()

    exception = run_command(command)

    return process_expection(exception.stdout)
