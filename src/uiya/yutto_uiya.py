from __future__ import annotations

import streamlit as st

from uiya._dataclass import CommandGenerator
from uiya._typing import AudioQuality, VideoQuality, bangumi_status
from uiya.styles.global_style import style
from uiya.utils.config import UiyaSetting, get_setting_title, load_settings_file, write_settings_file
from uiya.utils.runner import parse_status, run_downloader, run_parser

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


def bangumi_tab() -> None:
    """UI for downloading bangumi."""
    BangumiContainer = st.container(border=True)
    with BangumiContainer:
        url = st.text_input("URL (视频网址,详细见参考链接)", key="bangumi_url")
        run_btn = st.button(
            "解析", key="bangumi_button", disabled=st.session_state.is_running, use_container_width=True
        )
        if run_btn and not st.session_state.is_running:
            st.session_state.is_running = True

            status = bangumi_status
            # 任务默认参数
            status.update({"target_type": "bangumi"})
            # 用户自定义参数,由 UI 传入
            status.update({"url": url})

            output_placeholder = st.empty()
            if parse_status(status, key_name="bangumi_parse", output_placeholder=output_placeholder):  # 解析状态
                command_generator = CommandGenerator.from_status(status)  # 通过from_status来初始化
                command = command_generator.gen_args()

                # 使用特定的key名称
                # run_downloader(command, key_name="bangumi_output", output_placeholder=output_placeholder)
                print(run_parser(command=command))
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


settings: UiyaSetting = load_settings_file("uiya.toml", UiyaSetting)
if not settings.as_package:
    style()
TabContainer = st.container()
with TabContainer:
    tab5, tab6 = st.tabs(["视频", "设置"])

    with tab5:
        bangumi_tab()

    with tab6:
        setting_tab()
