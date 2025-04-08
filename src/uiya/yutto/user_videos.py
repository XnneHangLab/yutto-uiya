from __future__ import annotations

from typing import TYPE_CHECKING

from uiya._dataclass import CommandGenerator
from uiya.utils.subproc import run_command
from uiya.utils.TextHelper import process_expection

if TYPE_CHECKING:
    from uiya._typing import AudioQuality, CommandStatus, VideoQuality


# 视频默认参数
status: CommandStatus = {
    "target_type": "video",
    "batch_download": False,
    "support_select": False,
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


def user_video(
    url: str,
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
    下载指定视频（非列表形式，如果是列表，请用user_video_list）
    :param url: 指定视频网址
    :param require_video: 是否下载视频画面
    :param require_audio: 是否下载视频音频
    :param require_danmaku 是否下载视频弹幕
    :param SESSDATA: SESSDATA, 用于保持用户登录信息,如果下载大会员必须指定SESSDATA
    :return: 如果出错，会返回错误信息。
    """

    # 任务默认参数
    status.update({"target_type": "video"})
    status.update({"batch_download": False})
    status.update({"support_select": False})

    # 用户自定义参数,由 UI 传入
    status.update({"url": url})
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


# TODO: 似乎这个p参数不能指定要下载的视频，只会默认下载第一个视频
# Solve:批量下载需要指定-b参数
# 对于番剧需要进入番剧主页,例如: https://www.bilibili.com/bangumi/media/md23053814
# 因为番剧不是&id的形式，而是url自增，逻辑不同。
def user_video_list(
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
    下载整个视频列表或者其中选定部分
    :param url: 指定视频列表网址
    :param select_p: 用户选集
    :param require_video: 是否下载视频画面
    :param require_audio: 是否下载视频音频
    :param require_danmaku 是否下载视频弹幕
    :param SESSDATA: SESSDATA, 用于保持用户登录信息,如果下载大会员必须指定SESSDATA
    :return: 如果出错，会返回错误信息。
    """

    # 任务默认参数
    status.update({"target_type": "video_list"})
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


# 合集下载,不支持选集
# 示例：https://space.bilibili.com/100969474/channel/seriesdetail?sid=1947439
def user_collection_video(
    url: str,
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
    下载整个合集列表
    :param url: 指定视频列表网址
    :param require_video: 是否下载视频画面
    :param require_audio: 是否下载视频音频
    :param require_danmaku 是否下载视频弹幕
    :param SESSDATA: SESSDATA, 用于保持用户登录信息,如果下载大会员必须指定SESSDATA
    :return: 如果出错，会返回错误信息。
    """

    # 任务默认参数
    status.update({"target_type": "collection"})
    status.update({"batch_download": True})
    status.update({"support_select": False})

    # 用户自定义参数,由 UI 传入
    status.update({"url": url})
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


# 收藏夹下载,不支持选集
# 示例：https://space.bilibili.com/100969474/favlist?fid=1306978874&ftype=create
def user_favorlist_video(
    url: str,
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
    下载指定收藏列表
    :param url: 指定视频列表网址
    :param require_video: 是否下载视频画面
    :param require_audio: 是否下载视频音频
    :param require_danmaku 是否下载视频弹幕
    :param SESSDATA: SESSDATA, 用于保持用户登录信息,如果下载大会员必须指定SESSDATA
    :return: 如果出错，会返回错误信息。
    """

    # 任务默认参数
    status.update({"target_type": "favor"})
    status.update({"batch_download": True})
    status.update({"support_select": False})

    # 用户自定义参数,由 UI 传入
    status.update({"url": url})
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


# TODO: 似乎不清楚怎么调用，缺少了page参数，问一下作者
# 下载用户投稿的所有视频
# 不支持选集
# 示例：https://space.bilibili.com/100969474/video
def user_space_video(
    url: str,
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
    下载整个合集列表或者其中选定部分
    :param url: 指定视频列表网址
    :param require_video: 是否下载视频画面
    :param require_audio: 是否下载视频音频
    :param require_danmaku 是否下载视频弹幕
    :param SESSDATA: SESSDATA, 用于保持用户登录信息,如果下载大会员必须指定SESSDATA
    :return: 如果出错，会返回错误信息。
    """

    # 任务默认参数
    status.update({"target_type": "space"})
    status.update({"batch_download": True})
    status.update({"support_select": False})

    # 用户自定义参数,由 UI 传入
    status.update({"url": url})
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
