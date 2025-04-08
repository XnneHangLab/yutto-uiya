import sys
import streamlit as st
import pexpect

def run_command(command: list[str], key_name: str = "cmd_output"):
    """
    使用 pexpect 运行命令并实时更新 Streamlit 界面，同时保留终端原始输出

    Args:
        command: 要执行的命令及其参数列表
        key_name: 用于 Streamlit 组件的唯一 key 值
    """
    # 初始化输出
    if "output" not in st.session_state:
        st.session_state.output = ""
    else:
        st.session_state.output = ""  # 清空现有输出

    # 创建可更新的输出区域
    output_area = st.empty()
    output_area.text_area("输出:", st.session_state.output, height=400, key=key_name+"_area_init")

    command_str = " ".join(command)
    print(f"执行命令: {command_str}", file=sys.stderr)

    try:
        # 启动进程
        child = pexpect.spawn(command[0], args=command[1:], encoding="utf-8")

        # 读取并处理输出，直到进程结束
        buffer = []
        area_index = 0
        while True:
            try:
                # 尝试读取一个字符
                index = child.expect([".", pexpect.EOF, pexpect.TIMEOUT], timeout=0.1)

                if index == 0:  # 读取到一个字符
                    char = child.after
                    buffer.append(char)

                    # 实时输出到终端
                    sys.stdout.write(char)
                    sys.stdout.flush()

                    # 如果是换行符或缓冲区较大，更新 Streamlit 界面
                    if char == "\n" or len(buffer) > 50:
                        st.session_state.output += "".join(buffer)
                        output_area.text_area("输出:", st.session_state.output, height=400, key=key_name+"_area_"+str(area_index))
                        area_index+= 1  # 增加索引，避免重复输出
                        buffer = []

                elif index == 1:  # EOF，进程结束
                    if child.before:
                        buffer.append(child.before)
                        sys.stdout.write(child.before)
                        sys.stdout.flush()

                    if buffer:
                        st.session_state.output += "".join(buffer)
                        output_area.text_area("输出:", st.session_state.output, height=400, key=key_name+"_area_"+str(area_index))
                        area_index+= 1  # 增加索引，避免重复输出
                    break

                elif index == 2:  # 超时，但进程可能仍在运行
                    if buffer:
                        st.session_state.output += "".join(buffer)
                        output_area.text_area("输出:", st.session_state.output, height=400, key=key_name+"_area_"+str(area_index))
                        area_index+= 1  # 增加索引，避免重复输出
                        buffer = []
                    continue

            except Exception as e:
                error_msg = f"\n读取过程中发生错误: {e}\n"
                st.session_state.output += error_msg
                print(error_msg, file=sys.stderr)
                output_area.text_area("输出:", st.session_state.output, height=400, key=key_name+"_area_"+str(area_index))
                area_index+= 1  # 增加索引，避免重复输出
                break

        # 获取退出状态
        child.close()

    except Exception as e:
        error_msg = f"\n发生错误: {e}\n"
        st.session_state.output += error_msg
        print(error_msg, file=sys.stderr)
        output_area.text_area("输出:", st.session_state.output, height=400, key=key_name)

    finally:
        st.session_state.is_running = False
        return child.exitstatus if hasattr(child, 'exitstatus') else None