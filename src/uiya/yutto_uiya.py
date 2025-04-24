from __future__ import annotations

import streamlit as st

from uiya._dataclass import CommandGenerator
from uiya._session_keys import runner_keys, yutto_uiya_keys
from uiya._typing import AudioQuality, VideoQuality, bangumi_status,EpisodeInfo
from uiya.styles.global_style import style
from uiya.utils.config import UiyaSetting, get_setting_title, load_settings_file, write_settings_file
from uiya.utils.runner import parse_status, run_downloader, run_parser,show_interatable_card_container,select_card_container

if yutto_uiya_keys["save"] in st.session_state:
    st.toast("参数已成功保存", icon=":material/verified:")
    del st.session_state[yutto_uiya_keys["save"]]

if yutto_uiya_keys["flush"] in st.session_state:
    del st.session_state[yutto_uiya_keys["flush"]]
    st.rerun()


if yutto_uiya_keys["is_running"] not in st.session_state:
    st.session_state.is_running = False

if yutto_uiya_keys["save"] in st.session_state:
    st.toast("参数已成功保存", icon=":material/verified:")
    del st.session_state[yutto_uiya_keys["save"]]

# 这些在 import 时就会被初始化,需要保证它和 import 时的那个保持一致.
# 之所以这里再写一次是为了防止有时刷新网页后丢失了必要的数据
if runner_keys["parse_content"] not in st.session_state:
    st.session_state[runner_keys["parse_content"]] = []

if runner_keys["select_p"] not in st.session_state:
    st.session_state[runner_keys["select_p"]] = []

if runner_keys["click_p"] not in st.session_state:
    st.session_state[runner_keys["click_p"]] = None

if runner_keys["runtime_error"] not in st.session_state:
    st.session_state[runner_keys["runtime_error"]] = ""


def bangumi_tab() -> None:
    """UI for downloading bangumi."""
    episode_info_container = st.container(key="episode_info_container")
    with st.form("bangumi_form", clear_on_submit=False):
        input_col, btn_col = st.columns([4, 1])
        with input_col:
            url = st.text_input("URL", key="bangumi_url", placeholder="请输入番剧链接", label_visibility="collapsed")
        with btn_col:
            run_btn = st.form_submit_button(
                "解析", disabled=st.session_state.get(yutto_uiya_keys["is_running"], False), use_container_width=True
            )
    output_placeholder = st.empty()
    # 处理表单提交
    if run_btn and not st.session_state[yutto_uiya_keys["is_running"]]:
        st.session_state[yutto_uiya_keys["is_running"]] = True

        status = bangumi_status
        # 任务默认参数
        status.update({"target_type": "bangumi"})
        # 用户自定义参数,由 UI 传入
        status.update({"url": url})
        if parse_status(status, output_placeholder=output_placeholder):  # 解析状态
            command_generator = CommandGenerator.from_status(status)  # 通过from_status来初始化
            command = command_generator.gen_args()

            # 使用特定的key名称
            # run_downloader(command, key_name="bangumi_output", output_placeholder=output_placeholder)
            run_parser(command=command)
            st.rerun()
        else:
            st.session_state[yutto_uiya_keys["is_running"]] = False
    if st.session_state[runner_keys["parse_content"]]:
        # 去掉完全相同的元素
        select_card_container()
        for i, item in enumerate(st.session_state[runner_keys["parse_content"]]):
            show_interatable_card_container(item, i)
    if st.session_state[runner_keys["click_p"]] is not None: # index 可能为0
        current_p = st.session_state[runner_keys["click_p"]]
        current_episode: EpisodeInfo = st.session_state[runner_keys["parse_content"]][current_p]
        with episode_info_container:
            if current_episode["cover_link"]:
                # 使用HTML标签显示图片并控制大小
                st.markdown(
                    f"""
                    ![image](https://image.baidu.com/search/down?url={current_episode["cover_link"]})
                    """
                )
            st.markdown(f"### {current_episode['title']}")
            if current_episode["metadata"]:
                st.markdown(f"{current_episode['metadata']['plot']}")
    if st.session_state[runner_keys["runtime_error"]]:
        st.error(st.session_state[runner_keys["runtime_error"]])
        output_placeholder.code(
            st.session_state[runner_keys["runtime_error"]],
            language="bash",)
    if st.session_state[runner_keys["select_p"]]:
        print(st.session_state[runner_keys["select_p"]])


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
                settings.zh_set_value("login_strict", login_strict)
                settings.zh_set_value("vip_strict", vip_strict)
                settings.download_dir = download_dir
                settings.SESS_DATA = sess_data
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
