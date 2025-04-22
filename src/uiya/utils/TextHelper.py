from __future__ import annotations

import ast
import platform
import re
from typing import TYPE_CHECKING

from uiya._dictionary import emoji

if TYPE_CHECKING:
    from uiya._typing import YuttoParseResult


def clean_ouput(output: str):
    if platform.system() == "Windows":
        for ignore_value in emoji:
            output = output.replace(ignore_value, "")
        output = output.replace("\r\n", "")
        output = output.replace("\r", "")
        output = output.replace("\n", "")
        output = output.replace("INFO", "")
        output = output.replace("WARN", "")
        output = output.replace("ERROR", "")

        # 忽略空行
        if output.replace(" ", "") == "":
            output = ""
        else:
            output = output + "\n"
        # print([output])

    else:
        # ignore emoji
        for ignore_value in emoji:
            output = output.replace(ignore_value, "")
        # ignore space
        output = output.replace(" ", "")

        # ignore color
        # output = output.replace("\x1b[33m", "")  # WARNING
        # output = output.replace("\x1b[31;1m", "")  # ERROR
        output = output.replace("\x1b[94m", "[")
        output = output.replace("\x1b[93m", "[")
        output = output.replace("\x1b[91m", "[")
        output = output.replace("\x1b[92m", "[")
        output = output.replace("\x1b[0m", "] ")
        output = output.replace("\x1b[30;46m", "[")
        output = output.replace("\x1b[32;1m", "")
        output = output.replace("\x1b[38;2;64;64;64m", "")
        output = output.replace("\x1b[32m", "")
        output = output.replace("\x1b[33m", "")
        output = output.replace("\x1b[31;1m", "")
        output = output.replace("\x1b[34m*", ">")
        output = output.replace("\x1b[35m*", ">")
        output = output.replace("\x1b[0m", "")
        output = output.replace("\x1b[36m", "")

        # Add line break for process line
        if "━━━" in output:
            output = output + "\n"
    return output


class YuttoOutputParser:
    def __init__(self):
        # 初始化解析结果
        self.result: YuttoParseResult = {
            "video_name": "",
            "episodes_count": 0,
            "episodes": [],
            "current_episode_index": -1,
        }

        # 缓存一些状态
        self.current_value = ""
        self.current_type = ""
        self.current_index = -1

    def parse_line(self, line: str) -> None:
        """
        逐行解析输出，当一集解析完成时返回该集的信息
        """
        # 清理行
        # 提取视频名称
        if "\x1b[30;46m 投稿视频 \x1b[0m" in line:
            self.current_value = line.split("\x1b[30;46m 投稿视频 \x1b[0m")[1].replace(" ", "")
            self.current_type = "video_name"
            self.result[self.current_type] = self.current_value.strip()
            return None

        # 提取总集数
        if "\x1b[94m INFO \x1b[0m 全" in line and "话" in line:
            episodes_count_match = re.search(r"全\s+(\d+)\s+话", line)
            if episodes_count_match:
                self.current_value = episodes_count_match.group(1)
                self.current_type = "episodes_count"
                self.result[self.current_type] = int(self.current_value)
            return None

        # 新的一集开始
        if "\x1b[30;46m [" in line:
            pattern = r"\[(\d+)/(\d+)\]\s+(.*)"
            episode_start_match = re.search(pattern, line)
            if episode_start_match:
                self.current_value = int(episode_start_match.group(1)) - 1
                self.current_type = "current_episode_index"
                self.result[self.current_type] = self.current_value

                self.current_value = episode_start_match.group(3).replace("\x1b[0m", "").replace(" ", "")
                self.current_type = "title"
                self.result["episodes"].append(
                    {
                        self.current_type: self.current_value,
                        "link": "",
                        "video_quality_list": [],
                        "audio_quality_list": [],
                        "has_danmaku": False,
                        "has_subtitle": False,
                        "has_chapter_info": False,
                        "metadata": None,
                        "cover_link": "",
                    }
                )

        self.current_index = self.result["current_episode_index"]
        # collect episode info
        if self.current_index != -1:
            # 提取链接
            if "\x1b[30;46m LINK \x1b[0m" in line:
                self.current_value = line.split("\x1b[30;46m LINK \x1b[0m")[1].replace(" ", "").replace("\r\n", "")
                self.current_type = "link"
                self.result["episodes"][self.current_index][self.current_type] = self.current_value

            # 检查是否有弹幕
            if "\x1b[30;46m 弹幕 \x1b[0m" in line:
                self.current_value = True
                self.current_type = "has_danmaku"
                self.result["episodes"][self.current_index][self.current_type] = self.current_value

            # 检查是否有字幕
            if "\x1b[30;46m 字幕 \x1b[0m" in line:
                self.current_value = True
                self.current_type = "has_subtitle"
                self.result["episodes"][self.current_index][self.current_type] = self.current_value

            # 检查是否有章节信息
            if "\x1b[30;46m 章节 \x1b[0m" in line:
                self.current_value = True
                self.current_type = "has_chapter_info"
                self.result["episodes"][self.current_index][self.current_type] = self.current_value

            if "\x1b[30;46m 描述文件 \x1b[0m " in line:
                # 提取从"描述文件"后面的所有内容作为元数据开始
                meta_part = line.split("\x1b[30;46m 描述文件 \x1b[0m ", 1)[1].replace("\r\n", "").replace(" ", "")
                self.current_type = "metadata"
                self.current_value = meta_part

                try:
                    self.current_value = ast.literal_eval(self.current_value)
                    self.result["episodes"][self.current_index]["metadata"] = self.current_value
                except Exception as E:
                    print(f"{E}")
                    # 继续收集，可能跨多行

            # 提取封面链接（如果之前没提取到）
            if "\x1b[30;46m 封面 \x1b[0m" in line and "http" in line:
                self.current_value = line.split("\x1b[30;46m 封面 \x1b[0m")[1].replace(" ", "").replace("\r\n", "")
                self.current_type = "cover_link"
                self.result["episodes"][self.current_index][self.current_type] = self.current_value

            # 进入视频流部分
            if "\x1b[94m INFO \x1b[0m 共包含以下" in line and "视频流" in line:
                self.current_type = "video_quality_list"
                self.result["episodes"][self.current_index]["video_quality_list"] = []
                return None

            # 进入音频流部分
            if "\x1b[94m INFO \x1b[0m 共包含以下" in line and "个音频流" in line:
                self.current_type = "audio_quality_list"
                self.result["episodes"][self.current_index]["audio_quality_list"] = []

            # 处理视频流
            if self.current_type == "video_quality_list":
                quality_match = re.search(r"<([^>]*)>", line)
                if quality_match:
                    quality = quality_match.group(1).strip()
                    self.current_value = quality
                    self.result["episodes"][self.current_index][self.current_type].append(self.current_value)
            # 处理音频流
            if self.current_type == "audio_quality_list":
                bitrate_match = re.search(r"<([^>]*)>", line)
                if bitrate_match:
                    bitrate = bitrate_match.group(1).strip()
                    self.current_value = bitrate
                    self.result["episodes"][self.current_index][self.current_type].append(self.current_value)

    def get_result(self) -> YuttoParseResult:
        """获取当前的解析结果"""
        return self.result
