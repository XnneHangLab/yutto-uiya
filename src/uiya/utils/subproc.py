from __future__ import annotations

import sys
import threading
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Callable

import pexpect


def run_command_async(command: list[str],
                     update_callback: Callable[[str], None] | None = None,
                     on_complete: Callable[[], None] | None = None) -> threading.Thread:
    """
    在单独的线程中异步执行命令，不会阻塞主线程。

    Args:
        command: 要执行的命令及其参数列表
        update_callback: 每行输出的回调函数，用于更新Streamlit
        on_complete: 命令完成时调用的回调函数

    Returns:
        执行命令的线程对象
    """
    def _run_in_thread():
        try:
            run_command(command, update_callback)
        finally:
            if on_complete:
                on_complete()

    thread = threading.Thread(target=_run_in_thread)
    thread.daemon = True
    thread.start()
    return thread


def run_command(command: list[str], update_callback: Callable[[str], None] | None = None):
    """
    使用pexpect运行shell命令，保留所有ANSI转义序列和进度条更新。
    每当遇到换行符时，会调用回调函数更新Streamlit应用。

    Args:
        command: 要执行的命令及其参数列表
        update_callback: 接收当前行文本的回调函数，用于更新Streamlit
    """
    command_str = " ".join(command)
    print(f"执行命令: {command_str}", file=sys.stderr)

    # 当前行缓冲区
    current_line = []

    try:
        # 启动进程
        child = pexpect.spawn(command[0], args=command[1:], encoding="utf-8")

        # 读取并处理输出，直到进程结束
        while True:
            try:
                # 尝试读取一个字符
                index = child.expect([".", pexpect.EOF, pexpect.TIMEOUT], timeout=0.1)

                if index == 0:  # 读取到一个字符
                    # 获取最后匹配的字符
                    char = child.after

                    # 将字符添加到当前行缓冲区
                    current_line.append(char)

                    # 实时输出到终端
                    sys.stdout.write(char)
                    sys.stdout.flush()

                    # 如果是换行符，调用回调函数更新Streamlit
                    if char == "\n" and update_callback is not None:
                        line_text = "".join(current_line)
                        update_callback(line_text)
                        current_line = []  # 重置当前行缓冲区

                elif index == 1:  # EOF，进程结束
                    # 确保获取剩余输出
                    if child.before:
                        current_line.append(child.before)
                        sys.stdout.write(child.before)
                        sys.stdout.flush()

                    # 如果当前行还有内容，发送最后一次更新
                    if current_line and update_callback is not None:
                        line_text = "".join(current_line)
                        update_callback(line_text)

                    break

                elif index == 2:  # 超时，但进程可能仍在运行
                    continue

            except Exception as e:
                print(f"读取过程中发生错误: {e}", file=sys.stderr)
                break

        # 获取退出状态
        child.close()

    except FileNotFoundError as e:
        print(f"命令未找到错误: {e}", file=sys.stderr)

    except Exception as e:
        print(f"发生未知错误: {e}", file=sys.stderr)
