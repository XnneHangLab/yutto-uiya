from __future__ import annotations

import streamlit as st

from uiya._dataclass import CommandGenerator
from uiya._typing import AudioQuality, VideoQuality, bangumi_status, video_status
from uiya.styles.global_style import style
from uiya.utils.config import UiyaSetting, get_setting_title, load_settings_file, write_settings_file
from uiya.utils.runner import parse_status, run_command

if "save" in st.session_state:
    st.toast("参数已成功保存", icon=":material/verified:")
    del st.session_state["save"]


# Get video and audio quality choices
video_quality_choice: list[str] = list(VideoQuality.__args__)  # type: ignore
audio_quality_choice: list[str] = list(AudioQuality.__args__)  # type: ignore


if "is_running" not in st.session_state:
    st.session_state.is_running = False

if "save" in st.session_state:
    st.toast("参数已成功保存", icon=":material/verified:")
    del st.session_state["save"]


# 在你的应用中使用
def single_video_tab():
    SingleUser = st.container(border=True)
    with SingleUser:
        st.markdown("""
        ## 对正在播放用户投稿视频下载（单视频，或者多视频的p1）
        示例链接🔗:
        - [https://www.bilibili.com/video/BV1vZ4y1M7mQ](https://www.bilibili.com/video/BV1vZ4y1M7mQ)

        用法：
        - 输入框URL: 必填，输入想要下载的的视频链接
        - 资源选择: 可以单独选择或者组合选择。只选择画面则下载视频没有声音。
        - 清晰度: 如果不存在指定的清晰度或者该清晰度不具有访问权限，那么会降低清晰度进行下载，更高清晰度需要大会员。大会员需要填写`configs/args.yaml`中的SESS_DATA并且用户自身具有大会员权限。
        - 音频质量: 同清晰度。不用多说了哈。
        - Debug Mode: 如果碰到Bug,可以开启Debug Mode,然后截图终端的信息以及结果框反馈给我。
        """)

        url = st.text_input("URL (视频网址，详细见参考链接)")

        col1, col2, col3, col4 = st.columns(4)
        with col1:
            require_video = st.checkbox("画面", value=True)
        with col2:
            require_audio = st.checkbox("音频", value=True)
        with col3:
            require_danmaku = st.checkbox("弹幕", value=False)
        with col4:
            require_cover = st.checkbox("封面", value=False)

        debug_mode = st.checkbox("Debug Mode", value=False)

        col1, col2 = st.columns(2)
        with col1:
            video_quality: VideoQuality = st.selectbox(
                "清晰度",
                options=video_quality_choice,
                index=4,
                help="选择你想要的清晰度(视频具有该资源并且你有访问权限,否则自动降级)",
            )  # type: ignore
        with col2:
            audio_quality: AudioQuality = st.selectbox(
                "音频质量",
                options=audio_quality_choice,
                index=2,
                help="选择你想要的音频质量(视频具有该资源并且你有访问权限,否则自动降级)",
            )  # type: ignore
        # 初始化运行状态
        if "is_running" not in st.session_state:
            st.session_state.is_running = False

        # 禁用按钮如果已经在运行
        run_btn = st.button(
            "开始下载", key="single_video_button", disabled=st.session_state.is_running, use_container_width=True
        )

        if run_btn and not st.session_state.is_running:
            st.session_state.is_running = True

            status = video_status
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

            output_placeholder = st.empty()
            if parse_status(status, key_name="single_video_parse", output_placeholder=output_placeholder):  # 解析状态
                command_generator = CommandGenerator.from_status(status)  # 通过from_status来初始化
                command = command_generator.gen_args()
                # 使用特定的key名称
                run_command(command, key_name="single_video_output", output_placeholder=output_placeholder)
            else:
                st.session_state.is_running = False


def video_list_tab() -> None:
    """UI for downloading a list of videos."""
    VideoList = st.container(border=True)
    with VideoList:
        st.markdown("""
        ## 对正在播放用户投稿视频下载：(支持多p,不指定默认全下)
        示例链接🔗:
        - [https://www.bilibili.com/video/BV1vZ4y1M7mQ](https://www.bilibili.com/video/BV1vZ4y1M7mQ)

        用法：
        - 输入框URL: 必填，输入正在播放的视频链接
        - 选集: 选填，选择要下载的p,支持写法`1,2,3`或`1~3`,全部下载`1~-1`,可以自己探索一下。不填写默认下载全部。
        - 资源选择： 参见用户视频-单个视频的说明。
        - 清晰度： 参见用户视频-单个视频的说明。
        - 音频质量： 参见用户视频-单个视频的说明。
        - Debug Mode: 如果碰到Bug,可以开启Debug Mode,然后重复运行复现问题最后截图终端的信息以及结果框反馈给我。
        """)

        url = st.text_input("URL (视频网址，详细见参考链接)", key="video_list_url")
        select_p = st.text_input("选集 (输入比如这样的,1,2,3 or 1~3 or 1~-1,注意英文逗号分隔)", value="1~-1")

        col1, col2, col3, col4 = st.columns(4)
        with col1:
            require_video = st.checkbox("画面", value=True, key="video_list_video")
        with col2:
            require_audio = st.checkbox("音频", value=True, key="video_list_audio")
        with col3:
            require_danmaku = st.checkbox("弹幕", value=False, key="video_list_danmaku")
        with col4:
            require_cover = st.checkbox("封面", value=False, key="video_list_cover")

        debug_mode = st.checkbox("Debug Mode", value=False, key="video_list_debug")

        col1, col2 = st.columns(2)
        with col1:
            video_quality: VideoQuality = st.selectbox(
                "清晰度",
                options=video_quality_choice,
                index=4,
                key="video_list_quality",
                help="选择你想要的清晰度(视频具有该资源并且你有访问权限,否则自动降级)",
            )  # type: ignore
        with col2:
            audio_quality: AudioQuality = st.selectbox(
                "音频质量",
                options=audio_quality_choice,
                index=2,
                key="video_list_audio_quality",
                help="选择你想要的音频质量(视频具有该资源并且你有访问权限,否则自动降级)",
            )  # type: ignore

        # 禁用按钮如果已经在运行
        run_btn = st.button(
            "开始下载", key="video_list_button", disabled=st.session_state.is_running, use_container_width=True
        )

        if run_btn and not st.session_state.is_running:
            st.session_state.is_running = True

            status = video_status
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

            output_placeholder = st.empty()
            if parse_status(status, key_name="video_list_parse", output_placeholder=output_placeholder):  # 解析状态
                command_generator = CommandGenerator.from_status(status)  # 通过from_status来初始化
                command = command_generator.gen_args()

                # 使用特定的key名称
                run_command(command, key_name="video_list_output", output_placeholder=output_placeholder)
            else:
                st.session_state.is_running = False


def favorite_tab() -> None:
    """UI for downloading from favorites."""
    FavoriteConatiner = st.container(border=True)
    with FavoriteConatiner:
        st.markdown("""
        ## 对用户整个收藏夹下载：(不支持默认收藏夹，不建议尝试)
        示例链接🔗:
        - [https://space.bilibili.com/100969474/favlist?fid=1306978874&ftype=create](https://space.bilibili.com/100969474/favlist?fid=1306978874&ftype=create)

        用法：
        - 输入框URL: 指定收藏夹地址，参考示例，不支持默认收藏夹。
        - 资源选择： 参见用户视频-单个视频的说明。
        - 清晰度： 参见用户视频-单个视频的说明。
        - 音频质量： 参见用户视频-单个视频的说明。
        - Debug Mode: 如果碰到Bug,可以开启Debug Mode,然后重复运行复现问题最后截图终端的信息以及结果框反馈给我。
        """)

        url = st.text_input("URL (视频网址,详细见参考链接)", key="favorite_url")

        col1, col2, col3, col4 = st.columns(4)
        with col1:
            require_video = st.checkbox("画面", value=True, key="favorite_video")
        with col2:
            require_audio = st.checkbox("音频", value=True, key="favorite_audio")
        with col3:
            require_danmaku = st.checkbox("弹幕", value=False, key="favorite_danmaku")
        with col4:
            require_cover = st.checkbox("封面", value=False, key="favorite_cover")

        debug_mode = st.checkbox("Debug Mode", value=False, key="favorite_debug")

        col1, col2 = st.columns(2)
        with col1:
            video_quality: VideoQuality = st.selectbox(
                "清晰度",
                options=video_quality_choice,
                index=4,
                key="favorite_quality",
                help="选择你想要的清晰度(视频具有该资源并且你有访问权限,否则自动降级)",
            )  # type: ignore
        with col2:
            audio_quality: AudioQuality = st.selectbox(
                "音频质量",
                options=audio_quality_choice,
                index=2,
                key="favorite_audio_quality",
                help="选择你想要的音频质量(视频具有该资源并且你有访问权限,否则自动降级)",
            )  # type: ignore

        run_btn = st.button(
            "开始下载", key="favor_list_button", disabled=st.session_state.is_running, use_container_width=True
        )

        if run_btn and not st.session_state.is_running:
            st.session_state.is_running = True

            status = video_status
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

            output_placeholder = st.empty()
            if parse_status(status, key_name="favor_list_parse", output_placeholder=output_placeholder):  # 解析状态
                command_generator = CommandGenerator.from_status(status)  # 通过from_status来初始化
                command = command_generator.gen_args()

                # 使用特定的key名称
                run_command(command, key_name="favor_list_output", output_placeholder=output_placeholder)
            else:
                st.session_state.is_running = False


def collection_tab() -> None:
    """UI for downloading from collections."""
    CollectionContainer = st.container(border=True)
    with CollectionContainer:
        st.markdown("""
        ## 对用户发布合集下载：（不支持选集，只能全下）
        示例链接🔗:
        - [https://space.bilibili.com/100969474/channel/seriesdetail?sid=1947439](https://space.bilibili.com/100969474/channel/seriesdetail?sid=1947439)

        用法：
        - 输入框URL: 指定合集地址，参考示例
        - 资源选择： 参见用户视频-单个视频的说明。
        - 清晰度： 参见用户视频-单个视频的说明。
        - 音频质量： 参见用户视频-单个视频的说明。
        - Debug Mode: 如果碰到Bug,可以开启Debug Mode,然后重复运行复现问题最后截图终端的信息以及结果框反馈给我。
        """)

        url = st.text_input("URL (视频网址,详细见参考链接)", key="collection_url")

        col1, col2, col3, col4 = st.columns(4)
        with col1:
            require_video = st.checkbox("画面", value=True, key="collection_video")
        with col2:
            require_audio = st.checkbox("音频", value=True, key="collection_audio")
        with col3:
            require_danmaku = st.checkbox("弹幕", value=False, key="collection_danmaku")
        with col4:
            require_cover = st.checkbox("封面", value=False, key="collection_cover")

        debug_mode = st.checkbox("Debug Mode", value=False, key="collection_debug")

        col1, col2 = st.columns(2)
        with col1:
            video_quality: VideoQuality = st.selectbox(
                "清晰度",
                options=video_quality_choice,
                index=4,
                key="collection_quality",
                help="选择你想要的清晰度(视频具有该资源并且你有访问权限,否则自动降级)",
            )  # type: ignore
        with col2:
            audio_quality: AudioQuality = st.selectbox(
                "音频质量",
                options=audio_quality_choice,
                index=2,
                key="collection_audio_quality",
                help="选择你想要的音频质量(视频具有该资源并且你有访问权限,否则自动降级)",
            )  # type: ignore

        run_btn = st.button(
            "开始下载", key="collection_button", disabled=st.session_state.is_running, use_container_width=True
        )

        if run_btn and not st.session_state.is_running:
            st.session_state.is_running = True

            status = video_status
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

            output_placeholder = st.empty()
            if parse_status(status, key_name="collection_parse", output_placeholder=output_placeholder):
                command_generator = CommandGenerator.from_status(status)  # 通过from_status来初始化
                command = command_generator.gen_args()

                # 使用特定的key名称
                run_command(command, key_name="collection_output", output_placeholder=output_placeholder)
            else:
                st.session_state.is_running = False


def bangumi_tab() -> None:
    """UI for downloading bangumi."""
    BangumiContainer = st.container(border=True)
    with BangumiContainer:
        st.markdown("""
        ## 对番剧进行下载：（支持选集，不输入指定选集默认全下）
        示例链接🔗:
        - 播放中：[https://www.bilibili.com/bangumi/play/ss45957](https://www.bilibili.com/bangumi/play/ss45957)
        - 首页：[https://www.bilibili.com/bangumi/media/md21087073](https://www.bilibili.com/bangumi/media/md21087073)

        用法：
        - 输入框URL: 指定番剧首页地址，参考示例
        - 选择集数： `1,2,3` 或者 `1~3` 或者 `1~-1`全下，不输入默认全下。
        - 资源选择: 可以单独选择或者组合选择。只选择画面则下载视频没有声音。
        - 清晰度: 如果不存在指定的清晰度或者该清晰度不具有访问权限，那么会降低清晰度进行下载，更高清晰度需要大会员。大会员需要填写`configs/args.yaml`中的SESS_DATA并且用户自身具有大会员权限。
        - 音频质量: 同清晰度。不用多说了哈。
        - Debug Mode: 如果碰到Bug,可以开启Debug Mode,然后重复运行复现问题最后截图终端的信息以及结果框反馈给我。
        """)

        url = st.text_input("URL (视频网址,详细见参考链接)", key="bangumi_url")
        select_p = st.text_input(
            "选集 (输入比如这样的,1,2,3 or 1~3 or 1~-1,注意英文逗号分隔)", value="1~-1", key="bangumi_select_p"
        )

        col1, col2, col3, col4 = st.columns(4)
        with col1:
            require_video = st.checkbox("画面", value=True, key="bangumi_video")
        with col2:
            require_audio = st.checkbox("音频", value=True, key="bangumi_audio")
        with col3:
            require_danmaku = st.checkbox("弹幕", value=False, key="bangumi_danmaku")
        with col4:
            require_cover = st.checkbox("封面", value=False, key="bangumi_cover")

        debug_mode = st.checkbox("Debug Mode", value=False, key="bangumi_debug")

        col1, col2 = st.columns(2)
        with col1:
            video_quality: VideoQuality = st.selectbox(
                "清晰度",
                options=video_quality_choice,
                index=4,
                key="bangumi_quality",
                help="选择你想要的清晰度(视频具有该资源并且你有访问权限,否则自动降级)",
            )  # type: ignore
        with col2:
            audio_quality: AudioQuality = st.selectbox(
                "音频质量",
                options=audio_quality_choice,
                index=2,
                key="bangumi_audio_quality",
                help="选择你想要的音频质量(视频具有该资源并且你有访问权限,否则自动降级)",
            )  # type: ignore

        run_btn = st.button(
            "开始下载", key="bangumi_button", disabled=st.session_state.is_running, use_container_width=True
        )
        if run_btn and not st.session_state.is_running:
            st.session_state.is_running = True

            status = bangumi_status
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

            output_placeholder = st.empty()
            if parse_status(status, key_name="bangumi_parse", output_placeholder=output_placeholder):  # 解析状态
                command_generator = CommandGenerator.from_status(status)  # 通过from_status来初始化
                command = command_generator.gen_args()

                # 使用特定的key名称
                run_command(command, key_name="bangumi_output", output_placeholder=output_placeholder)
            else:
                st.session_state.is_running = False


def setting_tab() -> None:
    """UI for FAQ section."""
    settings: UiyaSetting = load_settings_file("uiya.toml", UiyaSetting)
    Save = st.container()
    Setting = st.container(border=True)

    with Setting:
        sess_data = st.text_input(
            get_setting_title("SESS_DATA", UiyaSetting),
            value=settings.SESS_DATA,
            help="如果需要下载大会员视频，必须填写该项。否则无法下载大会员视频。",
        )
        login_strict = st.selectbox(
            get_setting_title("login_strict", UiyaSetting),
            settings.get_zh_option_list("login_strict"),
            index=settings.get_index("login_strict"),
        )
        st.caption("如果你要使用 sess_data 登陆，建议开启")
        vip_strict = st.selectbox(
            get_setting_title("vip_strict", UiyaSetting),
            settings.get_zh_option_list("vip_strict"),
            index=settings.get_index("vip_strict"),
        )
        st.caption("如果你填入大会员的 sess_data,建议开启")
        download_dir = st.text_input(
            get_setting_title("download_dir", UiyaSetting),
            value=settings.download_dir,
            help="下载目录",
        )

    with Save:
        col1, col2 = st.columns([0.75, 0.25])
        st.markdown("")
        with col2:
            st.markdown("")
            st.markdown("")
            if st.button("**保存更改**", use_container_width=True, type="primary"):
                settings.zh_set_value("SESS_DATA", sess_data)
                settings.zh_set_value("login_strict", login_strict)
                settings.zh_set_value("vip_strict", vip_strict)
                settings.zh_set_value("download_dir", download_dir)
                write_settings_file("uiya.toml", settings)
                st.session_state.save = True
                st.rerun()
        with col1:
            st.markdown("")
            st.markdown("")
            st.markdown("### 参数设置")
            st.caption("Changing Parameter Settings")


def about_tab() -> None:
    """UI for About section."""
    AboutContainer = st.container(border=True)
    with AboutContainer:
        st.markdown("""
        ## 它的核心是`yutto`:
        作者原仓库:[yutto](https://github.com/yutto-dev/yutto)

        我只是写了这个 WebUI:[yutto-uiya](https://github.com/MrXnneHang/yutto-uiya/)

        如果有更多关于界面和操作上的优化，以及功能的需求欢迎补充，因为`yutto`的功能实际上还有好多有待发掘。

        我会考虑尝试进行拓展。

        最后，祝各位使用愉快!
        """)


settings: UiyaSetting = load_settings_file("uiya.toml", UiyaSetting)
if not settings.as_package:
    style()
TabContainer = st.container()
with TabContainer:
    tab1, tab2, tab3, tab4, tab5, tab6 = st.tabs(["用户视频", "收藏夹", "合集", "番剧", "设置", "关于 yutto-uiya"])

    with tab1:
        st.header("用户视频下载")
        user_video_subtab = st.radio("选择下载模式", ["单个视频", "视频列表（多个视频）"], horizontal=True)

        if user_video_subtab == "单个视频":
            single_video_tab()
        else:
            video_list_tab()

    with tab2:
        favorite_tab()

    with tab3:
        collection_tab()

    with tab4:
        bangumi_tab()

    with tab5:
        setting_tab()

    with tab6:
        about_tab()
