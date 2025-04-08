from __future__ import annotations

import logging
import subprocess

from uiya._dictionary import emoji


def setup_logger(logger_name: str = "") -> logging.Logger:
    logger = logging.getLogger(logger_name + " - " + __name__)
    logger.setLevel(logging.DEBUG)

    # 创建控制台处理器并设置级别
    ch = logging.StreamHandler()
    ch.setLevel(logging.DEBUG)

    # 创建格式器并将其添加到处理器
    formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
    ch.setFormatter(formatter)

    # 将处理器添加到日志记录器
    logger.addHandler(ch)

    return logger


def run_command(
    command: list[str],
    log_level_stdout: int = logging.DEBUG,
    log_level_stderr: int = logging.WARNING,
    logger_name: str = "",
    check_returncode: bool = False,
):
    """
    运行 shell 命令并记录输出，可以控制日志级别和是否检查返回码。

    参数:
        command (list[str]): 要运行的命令。
        log_level_stdout (int): 标准输出的日志级别，默认为 DEBUG。
        log_level_stderr (int): 标准错误的日志级别，默认为 WARNING。
        check_returncode (bool): 是否检查返回码，如果为 True 且返回码非零，则抛出异常。 默认为 False。

    返回:
        subprocess.CompletedProcess: 包含命令执行结果的对象。

    抛出:
        subprocess.CalledProcessError: 如果 check_returncode=True 且命令返回非零返回码。
    """
    command_str = " ".join(command)
    logger = setup_logger(logger_name)  # 初始化 logger

    logger.debug(f"执行命令: {command_str}")

    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=check_returncode,
        )

        output_text_list = result.stdout.split("\n")
        new_output_text_list: list[str] = []
        for output_text in output_text_list:
            if output_text and output_text not in emoji:
                new_output_text_list.append(output_text)
        new_output_text = "\n".join(new_output_text_list)
        result.stdout = new_output_text
        if result.stdout:
            logger.log(log_level_stdout, result.stdout)
        if result.stderr:
            logger.log(log_level_stderr, result.stderr)
        return result

    except FileNotFoundError as e:
        logger.error(f"命令未找到错误: {e}")
        return subprocess.CompletedProcess(args=command, returncode=-1, stdout="", stderr=str(e))
    except subprocess.CalledProcessError as e:
        logger.error(f"子进程调用错误: {e}")
        logger.error(f"错误输出:\n{e.stderr}")
        raise e
    except Exception as e:
        logger.exception(f"发生未知错误: {e}")
        return subprocess.CompletedProcess(args=command, returncode=-1, stdout="", stderr=str(e))


# 示例调用
if __name__ == "__main__":
    command = ["echo", "Hello, world!"]
    run_command(command)
