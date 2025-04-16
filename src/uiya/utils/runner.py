from __future__ import annotations

import platform
import sys
import time
from typing import TYPE_CHECKING

import streamlit as st

from uiya.utils.TextHelper import clean_ouput

if TYPE_CHECKING:
    from streamlit.delta_generator import DeltaGenerator

    from uiya._typing import CommandStatus, SupportOS

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


def parse_status(status: CommandStatus, key_name: str, output_placeholder: DeltaGenerator) -> bool:
    """检查 Command status 并且提前返回错误. 防止用户触发 raise 异常导致 UI 崩溃"""
    # 初始化或清空输出
    output_key: str = f"{key_name}_content"
    if output_key not in st.session_state:
        st.session_state[output_key] = ""
    else:
        st.session_state[output_key] = ""
    # 用户没有输入 URL
    # TODO 应该检查合法性
    if not status["url"]:
        st.session_state[output_key] = "URL 不能为空"
        output_placeholder.code(st.session_state[output_key], language="bash")
        return False
    elif not (
        status["require_video"] or status["require_audio"] or status["require_danmaku"] or status["require_cover"]
    ):
        st.session_state[output_key] = "至少需要选择一个资源项"
        output_placeholder.code(st.session_state[output_key], language="bash")
        return False
    else:
        output_placeholder.code(st.session_state[output_key], language="bash")
        return True


# TODO child 的类型不明确，可能需要找时间修复
def run_command(command: list[str], key_name: str, output_placeholder: DeltaGenerator) -> int | None:
    """
    使用 pexpect 运行命令并实时更新 Streamlit 界面，同时保留终端原始输出

    Args:
        command: 要执行的命令及其参数列表
        key_name: 用于 Streamlit 组件的唯一 key 值

    Returns:
        命令执行的退出状态码，如果无法获取则返回 None
    """
    # 为这个特定命令创建唯一的输出键名
    output_key: str = f"{key_name}_content"

    # 初始化或清空输出
    if output_key not in st.session_state:
        st.session_state[output_key] = ""
    else:
        st.session_state[output_key] = ""

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
        buffer: list[str] = []
        last_update_time: float = time.time()
        output_text = ""
        while True:
            try:
                # 尝试读取字符
                index: int = child.expect([".", pexpect.EOF, pexpect.TIMEOUT], timeout=0.1)  # type: ignore[assignment]

                if index == 0:  # 读取到一个字符
                    char: str = str(child.after)  # type: ignore[assignment]
                    buffer.append(char)

                    # 如果是unix-like,直接输出到终端，如果是windows,则需要先处理一下。
                    if os != "windows":
                        sys.stdout.write(char)
                    sys.stdout.flush()

                    # 定期更新界面
                    current_time: float = time.time()
                    if os != "windows":
                        update_condition: bool = (
                            char == "\n" or "/s\x1b[0m" in "".join(buffer) or "/⚡\x1b[0m" in "".join(buffer)
                        )
                    else:
                        update_condition: bool = (
                            (char == "\n")
                            or "……" in "".join(buffer)  # 开始下载..... & 加载中.....
                            or "INFO " in "".join(buffer)
                            or "WARN" in "".join(buffer)
                            or "ERROR" in "".join(buffer)
                            or "⚡  " in "".join(buffer)
                        )

                    if update_condition:
                        output_text += "".join(buffer)
                        output = clean_ouput("".join(buffer))
                        if os == "windows":
                            if output:  # if != ""
                                print(output)
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
                        output_text += "".join(buffer)
                        output = clean_ouput("".join(buffer))
                        st.session_state[output_key] += output
                        output_placeholder.code(st.session_state[output_key], language="bash")
                    break

                elif index == 2:  # 超时
                    current_time: float = time.time()
                    if buffer and (current_time - last_update_time) > 0.5:
                        output_text += "".join(buffer)
                        output = clean_ouput("".join(buffer))
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
