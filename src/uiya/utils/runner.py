from __future__ import annotations

import platform
import sys
import time
from typing import TYPE_CHECKING

import streamlit as st

from uiya._session_keys import runner_keys, yutto_uiya_keys
from uiya.utils.TextHelper import YuttoOutputParser, clean_ouput, split_into_words

if TYPE_CHECKING:
    from streamlit.delta_generator import DeltaGenerator

    from uiya._typing import CommandStatus, EpisodeInfo, SupportOS, YuttoParseResult

# 防止被小写 windows 坑到
if platform.system() == "Windows":
    os: SupportOS = "windows"
elif platform.system() == "Linux":
    os: SupportOS = "linux"
elif platform.system() == "Darwin":
    os: SupportOS = "macos"
else:
    raise ValueError("Unsupported OS")

if os == "windows":
    import wexpect as pexpect  # type:ignore [import-error]
else:
    import pexpect  # type:ignore [import-error]

if runner_keys["select_p"] not in st.session_state:
    st.session_state[runner_keys["select_p"]] = []
if runner_keys["click_p"] not in st.session_state:
    st.session_state[runner_keys["click_p"]] = None
if runner_keys["parse_content"] not in st.session_state:
    st.session_state[runner_keys["parse_content"]] = []
if runner_keys["download_content"] not in st.session_state:
    st.session_state[runner_keys["download_content"]] = ""
if runner_keys["parse_command_status"] not in st.session_state:
    st.session_state[runner_keys["parse_command_status"]] = ""
if runner_keys["is_running"] not in st.session_state:
    st.session_state[runner_keys["is_running"]] = False
if runner_keys["runtime_error"] not in st.session_state:
    st.session_state[runner_keys["runtime_error"]] = ""
if runner_keys["video_name"] not in st.session_state:
    st.session_state[runner_keys["video_name"]] = ""


def parse_status(status: CommandStatus, output_placeholder: DeltaGenerator) -> bool:
    """检查 Command status 并且提前返回错误. 防止用户触发 raise 异常导致 UI 崩溃"""
    # 初始化或清空输出
    st.session_state[runner_keys["parse_command_status"]] = ""
    st.session_state[runner_keys["parse_content"]] = []
    st.session_state[runner_keys["video_name"]] = ""
    st.session_state[runner_keys["select_p"]] = []
    st.session_state[runner_keys["download_content"]] = ""
    st.session_state[runner_keys["click_p"]] = None
    st.session_state[runner_keys["runtime_error"]] = ""
    # 用户没有输入 URL
    # TODO 应该检查合法性
    if not status["url"]:
        st.session_state[runner_keys["parse_command_status"]] = "URL 不能为空"
        output_placeholder.code(st.session_state[runner_keys["parse_command_status"]], language="bash")
        return False
    elif not (
        status["require_video"] or status["require_audio"] or status["require_danmaku"] or status["require_cover"]
    ):
        st.session_state[runner_keys["parse_command_status"]] = "至少需要选择一个资源项"
        output_placeholder.code(st.session_state[runner_keys["parse_command_status"]], language="bash")
        return False
    else:
        output_placeholder.code(st.session_state[runner_keys["parse_command_status"]], language="bash")
        return True


# TODO child 的类型不明确，可能需要找时间修复
def run_downloader(command: list[str], output_placeholder: DeltaGenerator) -> int | None:
    """
    使用 pexpect 运行命令并实时更新 Streamlit 界面，同时保留终端原始输出

    Args:
        command: 要执行的命令及其参数列表
        key_name: 用于 Streamlit 组件的唯一 key 值

    Returns:
        命令执行的退出状态码，如果无法获取则返回 None
    """
    st.session_state[runner_keys["click_p"]] = None
    st.session_state[runner_keys["runtime_error"]] = ""
    output_key = runner_keys["download_content"]
    # 显示初始空输出
    output_placeholder.code(st.session_state[output_key], language="bash")

    child = None
    try:
        child = pexpect.spawn(  # type: ignore[assignment]
            command[0],
            args=command[1:],
            encoding="utf-8",
        )
        # 读取并处理输出
        buffer:  list[str] = []
        last_update_time: float = time.time()
        output_text = ""
        while True:
            try:
                # 尝试读取字符
                index: int = child.expect([".", pexpect.EOF, pexpect.TIMEOUT], timeout=0.1)  # type: ignore[assignment]

                if index == 0:  # 读取到一个字符
                    char: str = str(child.after)  # type: ignore[assignment]
                    buffer.append(char)

                    # 定期更新界面
                    current_time: float = time.time()
                    line = "".join(buffer)
                    update_condition: bool = (
                        (char == "\n")
                        or ("⚡\x1b[0m" in line)
                        or ("[/s\x1b[0m" in line)
                        or ("/s\x1b[0m" in line)
                    )

                    if update_condition:
                        output_text += line
                        if "━━" in line:
                            print("\r" + line + "\r", end="")
                        else:
                            print(line, end="") # 自带 \r\n
                        output = clean_ouput(line)
                        st.session_state[output_key] += output
                        buffer = []
                        last_update_time = current_time
                        # 使用 .code() 而不是 text_area，避免key问题
                        output_placeholder.code(st.session_state[output_key], language="bash")

                elif index == 1:  # EOF，进程结束
                    if child.before:  # type: ignore[assignment]
                        buffer.append(child.before)  # type: ignore[assignment]
                        sys.stdout.write(child.before)  # type: ignore[assignment]
                        sys.stdout.flush()

                    if buffer:
                        # 匹配解析时输出的 `投稿视频 ...``
                        line = "".join(buffer)
                        output_text += line
                        if "━━" in line:
                            print("\r" + line + "\r", end="")
                        else:
                            print(line, end="") # 自带 \r\n 或者 \n
                        output = clean_ouput(line)
                        st.session_state[output_key] += output
                        output_placeholder.code(st.session_state[output_key], language="bash")
                    break

                elif index == 2:  # 超时
                    current_time: float = time.time()
                    if buffer and (current_time - last_update_time) > 0.5:
                        line = "".join(buffer)
                        output_text += line
                        if "━━" in line:
                            print("\r" + line + "\r", end="")
                        else:
                            print(line, end="") # 自带 \r\n
                        output = clean_ouput(line)
                        st.session_state[output_key] += output
                        buffer = []
                        last_update_time = current_time
                        output_placeholder.code(st.session_state[output_key], language="bash")
                    continue

            except Exception as e:
                error_msg: str = f"\n读取过程中发生错误: {e}\n"
                st.session_state[output_key] += error_msg
                print(error_msg, file=sys.stderr)
                output_placeholder.code(st.session_state[output_key], language="bash")
                break

        # 未经处理的原始字符集
        # print([output_text])

        # 获取退出状态
        child.close()  # type:ignore

    except Exception as e:
        error_msg: str = f"\n发生错误: {e}\n"
        st.session_state[output_key] += error_msg
        print(error_msg, file=sys.stderr)
        output_placeholder.code(st.session_state[output_key], language="bash")

    finally:
        st.session_state.is_running = False

    return child.exitstatus if child and hasattr(child, "exitstatus") else None  # type: ignore[assignment]


def truncate(text: str, max_len: int):
    return text if len(text) <= max_len else text[:max_len] + "…"


def run_parser(command: list[str], debug:bool = False, batch: bool = True) -> YuttoParseResult:
    """
    使用 pexpect 运行命令并实时更新 Streamlit 界面，同时保留终端原始输出

    Args:
        command: 要执行的命令及其参数列表
        key_name: 用于 Streamlit 组件的唯一 key 值

    Returns:
        命令执行的退出状态码，如果无法获取则返回 None
    """
    key = runner_keys["parse_content"]
    st.session_state[key] = []
    child = None
    parser = YuttoOutputParser()
    show_index = -1
    st.session_state[runner_keys["click_p"]] = None
    st.session_state[runner_keys["parse_content"]] = []
    st.session_state[runner_keys["runtime_error"]] = ""
    st.session_state[runner_keys["video_name"]] = ""
    buffer: list[str] = []
    output_text = ""

    try:
        child = pexpect.spawn(  # type: ignore[assignment]
            command[0],
            args=command[1:],
            encoding="utf-8",
        )
        # 读取并处理输出
        while True:
            try:
                # 尝试读取字符
                index: int = child.expect([".", pexpect.EOF, pexpect.TIMEOUT], timeout=0.1)  # type: ignore[assignment]

                if index == 0:  # 读取到一个字符
                    char: str = str(child.after)  # type: ignore[assignment]
                    buffer.append(char)

                    # 如果是unix-like,直接输出到终端，如果是windows,则需要先处理一下。
                    sys.stdout.write(char)
                    sys.stdout.flush()


                    update_condition: bool = "\r\n" in "".join(buffer)

                    if update_condition:
                        output_text += "".join(buffer)
                        if batch:
                            parser.batch_parse_line("".join(buffer))
                        else:
                            parser.parse_line("".join(buffer))
                        current_index = parser.current_index
                        if current_index - show_index == 1:
                            # 避免加入重复的元素 skip -1
                            if show_index != -1:
                                st.session_state[key].append(parser.result["episodes"][show_index])
                                show_card_container(st.session_state[key][show_index], show_index)
                            show_index += 1

                        buffer = []

                elif index == 1:  # EOF，进程结束
                    if child.before:  # type: ignore[assignment]
                        buffer.append(child.before)  # type: ignore[assignment]
                        sys.stdout.write(child.before)  # type: ignore[assignment]
                        sys.stdout.flush()

                    if buffer:
                        output_text += "".join(buffer)
                        if batch:
                            parser.batch_parse_line("".join(buffer))
                        else:
                            parser.parse_line("".join(buffer))
                        current_index = parser.current_index
                    break

            except Exception as e:
                error_msg: str = f"\n循环内部出现错误: {e}\n"
                print(error_msg, file=sys.stderr)
                break

        # 获取退出状态
        child.close()  # type:ignore

    except Exception as e:
        error_msg: str = f"\n发生错误: {e}\n"
        print(error_msg, file=sys.stderr)
    finally:
        if debug:
            st.session_state.is_running = False
            print([output_text])
            print([parser.result])
            st.session_state[key].append(parser.result["episodes"][show_index])
            st.session_state[runner_keys["video_name"]] = parser.result["video_name"]
            show_index += 1
            show_card_container(st.session_state[key][-1], show_index)
        else:
            try:
                if "url 不正确，也许该 url 仅支持批量下载，如果是这样，请使用参数 -b～" in output_text:
                    st.session_state[runner_keys["is_running"]] = False
                    output_text += "请尝试使用`全集解析` \r\n"
                    st.session_state[runner_keys["runtime_error"]] = clean_ouput(output_text)
                else:
                    st.session_state.is_running = False
                    st.session_state[key].append(parser.result["episodes"][show_index])
                    st.session_state[runner_keys["video_name"]] = parser.result["video_name"]
                    show_index += 1
                    show_card_container(st.session_state[key][-1], show_index)
            except Exception as e:
                st.session_state[runner_keys["runtime_error"]] = clean_ouput(output_text) if output_text else str(e)

    return parser.result


def show_card_container(episode: EpisodeInfo, index: int) -> None:
    """显示解析卡片的容器"""
    card_conatiner = st.container(key=f"card_container_{index}", border=True)
    with card_conatiner:
        title = (
            "".join(split_into_words(episode["title"])[:15]) + "..."
            if len(split_into_words(episode["title"])) > 15
            else episode["title"].strip()
        )
        if episode["metadata"] and episode["metadata"]["plot"]:
            details = (
                "".join(split_into_words(episode["metadata"]["plot"])[:30]) + "..."
                if len(split_into_words(episode["metadata"]["plot"])) > 30
                else episode["metadata"]["plot"].strip()
            )

        else:
            details = "无描述信息"
        # 显示标题和详情
        st.markdown(f"**{title}**")
        st.markdown(f"*{details}*")


def show_interatable_card_container(episode: EpisodeInfo, index: int) -> None:
    """显示解析卡片的容器"""
    card_conatiner = st.container(key=f"interatable_card_container_{index}")
    with card_conatiner:
        cols = st.columns([1, 16, 4])
        with cols[0]:
            # 通过 value 控制 checkbox 的选中状态
            checked = st.checkbox(
                "s",
                key=f"selected_{index}",
                value=True if index in st.session_state[runner_keys["select_p"]] else False,
                label_visibility="hidden",
            )
            # 通过 checkbox 控制 value
            if checked:
                # 避免重复添加
                if index not in st.session_state[runner_keys["select_p"]]:
                    st.session_state[runner_keys["select_p"]].append(index)
            else:
                if index in st.session_state["select_p"]:
                    st.session_state[runner_keys["select_p"]].remove(index)

        with cols[1]:
            title = (
                "".join(split_into_words(episode["title"])[:15]) + "..."
                if len(split_into_words(episode["title"])) > 15
                else episode["title"].strip()
            )
            if episode["metadata"] and episode["metadata"]["plot"]:
                details = (
                    "".join(split_into_words(episode["metadata"]["plot"])[:30]) + "..."
                    if len(split_into_words(episode["metadata"]["plot"])) > 30
                    else episode["metadata"]["plot"].strip()
                )

            else:
                details = "无描述信息"
            # 显示标题和详情
            st.markdown(f"**{title}**")
            st.markdown(f"*{details}*")

        # 在右侧放置一个明显的按钮，提示用户点击
        with cols[2]:
            st.markdown("")
            detail_btn = st.button(
                "查看详情",
                key=f"detail_btn_{index}",
                on_click=click_detail_btn,
                args=(index,),
            )
            if detail_btn:
                # 已经在 on_click 里处理了
                # on click 是即时的,这里可能会因为重新执行而脱节
                pass


def select_card_container() -> None:
    """可以利用该 card 进行全选和全不选"""
    card_conatiner = st.container(key="card_container_select")
    with card_conatiner:
        cols = st.columns([1, 16, 4])
        with cols[0]:
            checked = st.checkbox("s", key="selected_select", value=False, label_visibility="hidden")
            if checked:
                for i in range(len(st.session_state[runner_keys["parse_content"]])):
                    st.session_state[runner_keys["select_p"]].append(i) if i not in st.session_state[
                        runner_keys["select_p"]
                    ] else st.session_state[runner_keys["select_p"]]
            else:
                for i in range(len(st.session_state[runner_keys["parse_content"]])):
                    st.session_state[runner_keys["select_p"]].remove(i) if i in st.session_state[
                        runner_keys["select_p"]
                    ] else st.session_state[runner_keys["select_p"]]
        with cols[1]:
            st.markdown("")
        with cols[2]:
            st.markdown("")


def click_detail_btn(index: int):
    """点击详情按钮"""
    st.session_state[runner_keys["click_p"]] = index
    st.session_state[yutto_uiya_keys["flush"]] = True
