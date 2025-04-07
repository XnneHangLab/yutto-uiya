from __future__ import annotations

import streamlit as st

from uiya._typing import AudioQuality, VideoQuality
from uiya.api import (
    entry_bangumi,
    entry_collection,
    entry_favorlist,
    entry_user_video,
    entry_user_video_list,
)
from uiya.styles.global_style import style
from uiya.utils.config import UiyaSetting, load_settings_file

# Get video and audio quality choices
video_quality_choice: list[str] = list(VideoQuality.__args__)  # type: ignore
audio_quality_choice: list[str] = list(AudioQuality.__args__)  # type: ignore


def single_video_tab() -> None:
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

        if st.button("开始下载", key="single_video_download", use_container_width=True):
            if url:
                with st.spinner("正在下载..."):
                    result = entry_user_video(
                        url,
                        require_video,
                        require_audio,
                        require_danmaku,
                        require_cover,
                        video_quality,
                        audio_quality,
                        debug_mode,
                    )
                    st.text_area("结果", value=result, height=200)
            else:
                st.error("请输入视频URL")


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

        if st.button("开始下载", key="video_list_download", use_container_width=True):
            if url:
                with st.spinner("正在下载..."):
                    result = entry_user_video_list(
                        url,
                        select_p,
                        require_video,
                        require_audio,
                        require_danmaku,
                        require_cover,
                        video_quality,
                        audio_quality,
                        debug_mode,
                    )
                    st.text_area("结果", value=result, height=200)
            else:
                st.error("请输入视频URL")


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

        if st.button("开始下载", key="favorite_download", use_container_width=True):
            if url:
                with st.spinner("正在下载..."):
                    result = entry_favorlist(
                        url,
                        require_audio,
                        require_video,
                        require_danmaku,
                        require_cover,
                        video_quality,
                        audio_quality,
                        debug_mode,
                    )
                    st.text_area("结果", value=result, height=200)
            else:
                st.error("请输入收藏夹URL")


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

        if st.button("开始下载", key="collection_download", use_container_width=True):
            if url:
                with st.spinner("正在下载..."):
                    result = entry_collection(
                        url,
                        require_video,
                        require_audio,
                        require_danmaku,
                        require_cover,
                        video_quality,
                        audio_quality,
                        debug_mode,
                    )
                    st.text_area("结果", value=result, height=200)
            else:
                st.error("请输入合集URL")


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

        if st.button("开始下载", key="bangumi_download", use_container_width=True):
            if url:
                with st.spinner("正在下载..."):
                    result = entry_bangumi(
                        url,
                        select_p,
                        require_video,
                        require_audio,
                        require_danmaku,
                        require_cover,
                        video_quality,
                        audio_quality,
                        debug_mode,
                    )
                    st.text_area("结果", value=result, height=200)
            else:
                st.error("请输入番剧URL")


def faq_tab() -> None:
    """UI for FAQ section."""
    FAQContainer = st.container(border=True)
    with FAQContainer:
        st.markdown("""
        ## 常见问题和反馈:

        ### 1.为什么不能下其他清晰度的视频？
        如果你已经下载了某个视频，并且想要下载它其他的清晰度，应该需要你手动删除先前的下载记录（把`./download`下方的相关的视频或者文件夹整个删掉即可。）

        ### 2.为什么无法下载高清晰度视频？和番剧？
        你需要先获取SESS_DATA并且填入`./configs/args.yaml`.

        如果你是大会员，你还有应该保证设置`args.yaml`中的`vip_strict`和`login_strict`同时为true,否则容易被当作普通用户。

        如果你是普通用户，你应该保证`login_strict`为true,`vip_strict`为false.否则会因为大会员校验失败而无法下载视频。

        如果填写了`SESS_DATA`那么总是应该保证`login_strict`为true,它会校验你的`SESS_DATA`是否有效。

        ### 3.yutto is not accessible
        参见视频:[yutto is not accessible 解决方法 | yutto-uiya v1.0.1](https://www.bilibili.com/video/BV1c1zqYLEAE/)

        ## 我应该在哪里反映我碰到的相关问题？
        你应该首先查阅该页面，然后查看终端的信息看自己是否能够解决。如果依然不能解决，那么请到:

        [一目生的个人空间](https://space.bilibili.com/556737824?spm_id_from=333.788.0.0)

        你可以私信我或者在我相关视频底下留言。
        """)


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


settings = load_settings_file("uiya.toml", UiyaSetting)
if not settings.as_package:
    style()
TabContainer = st.container()
with TabContainer:
    tab1, tab2, tab3, tab4, tab5, tab6 = st.tabs(["用户视频", "收藏夹", "合集", "番剧", "常见问题", "关于 yutto-uiya"])

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
        faq_tab()

    with tab6:
        about_tab()
