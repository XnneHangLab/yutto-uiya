from __future__ import annotations

import sys
import time

import pexpect
import streamlit as st

from uiya.utils.TextHelper import clean_ouput

# TODO child 的类型不明确，可能需要找时间修复


def run_command(command: list[str], key_name: str) -> int | None:
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

    # 创建占位符用于更新
    output_placeholder = st.empty()

    # 显示初始空输出
    output_placeholder.code(st.session_state[output_key], language="bash")

    command_str: str = " ".join(command)
    print(f"执行命令: {command_str}", file=sys.stderr)

    child: pexpect.spawn | None = None  # type: ignore[assignment]

    try:
        # 启动进程
        child = pexpect.spawn(command[0], args=command[1:], encoding="utf-8")  # type: ignore[assignment]

        # 读取并处理输出
        buffer: list[str] = []
        last_update_time: float = time.time()

        while True:
            try:
                # 尝试读取字符
                index: int = child.expect([".", pexpect.EOF, pexpect.TIMEOUT], timeout=0.1)

                if index == 0:  # 读取到一个字符
                    char: str = str(child.after)  # type: ignore[assignment]
                    buffer.append(char)

                    # 输出到终端
                    sys.stdout.write(char)
                    sys.stdout.flush()

                    # 定期更新界面
                    current_time: float = time.time()
                    update_condition: bool = (
                        char == "\n" or "/s\x1b[0m" in "".join(buffer) or "/⚡\x1b[0m" in "".join(buffer)
                    )

                    if update_condition:
                        output = clean_ouput("".join(buffer))
                        print(["".join(buffer)])
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
                        output = clean_ouput("".join(buffer))
                        st.session_state[output_key] += output
                        output_placeholder.code(st.session_state[output_key], language="bash")
                    break

                elif index == 2:  # 超时
                    current_time: float = time.time()
                    if buffer and (current_time - last_update_time) > 0.5:
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

        # 获取退出状态
        child.close()

    except Exception as e:
        error_msg: str = f"\n发生错误: {e}\n"
        st.session_state[output_key] += error_msg
        print(error_msg, file=sys.stderr)
        output_placeholder.code(st.session_state[output_key], language="bash")

    finally:
        st.session_state.is_running = False

    return child.exitstatus if child and hasattr(child, "exitstatus") else None  # type: ignore[assignment]
