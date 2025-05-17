from __future__ import annotations

import ast
import platform
import re
from typing import TYPE_CHECKING, get_args

from uiya._dictionary import emoji


from uiya._typing import AudioQuality, VideoQuality, YuttoParseResult


def clean_ouput(output: str):
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
    output = output.replace("\x1b[97m\x1b[45m", "[")
    output = output.replace("\x1b[30m\x1b[46m", "[")
    output = output.replace("\x1b[0m", "] ")
    output = output.replace("\x1b[90m", "]")
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
        output = output + "\n" if platform.system() != "windows" else output + "\r\n"
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
        self.video_name_types = [
            "投稿视频",
            "番剧",
            "视频合集",
            "收藏夹",
            "用户收藏夹",
            "课程",
            "视频列表",
            "UP 主投稿视频",
            "稍后再看",
        ]

    def parse_line(self, line: str, is_batch: bool = False) -> None:
        # 批量时解析总集数
        if is_batch and line.startswith(" 全集 "):
            episodes_count_match = re.search(r"全\s+(\d+)\s+话", line)
            if episodes_count_match:
                self.result["episodes_count"] = int(episodes_count_match.group(1))
            return

        # 批量模式下判断新的一集
        if is_batch and line.startswith(" ["):
            pattern = r"\[(\d+)/(\d+)\]\s+(.*)"
            episode_start_match = re.search(pattern, line)
            if episode_start_match:
                self.result["current_episode_index"] = int(episode_start_match.group(1)) - 1
                title = episode_start_match.group(3).replace("\x1b[0m", "").replace(" ", "")
                self.result["episodes"].append(
                    {
                        "title": title,
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
            return

        # 非批量时只初始化一次集
        if not is_batch:
            self.result["episodes_count"] = 1
            if len(self.result["episodes"]) == 0:
                self.result["episodes"].append(
                    {
                        "title": "",
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
            self.result["current_episode_index"] = 0

        # 选择当前集索引
        self.current_index = self.result.get("current_episode_index", 0)

        # 提取视频名
        for video_name_type in self.video_name_types:
            if line.startswith(f" {video_name_type} "):
                value = line[len(video_name_type) + 2 :].replace(" ", "")
                self.result["video_name"] = value.strip()
                if not is_batch:
                    self.result["episodes"][self.current_index]["title"] = value.strip()
                return

        # LINK
        if line.startswith(" LINK"):
            value = line[6:].replace(" ", "").replace("\r\n", "")
            self.result["episodes"][self.current_index]["link"] = value
            if not is_batch and "p=" in value:
                page_match = re.search(r"p=(\d+)", value)
                if page_match:
                    page = int(page_match.group(1))
                    self.result["video_name"] += f"(p={page})"

        # 弹幕、字幕、章节信息
        if line.startswith(" 弹幕 "):
            self.result["episodes"][self.current_index]["has_danmaku"] = True
        if line.startswith(" 字幕 "):
            self.result["episodes"][self.current_index]["has_subtitle"] = True
        if line.startswith(" 章节 "):
            self.result["episodes"][self.current_index]["has_chapter_info"] = True

        # 描述文件
        if line.startswith(" 描述文件 "):
            meta_part = line[6:].replace("\r\n", "").replace(" ", "")
            try:
                metadata = ast.literal_eval(meta_part)
                self.result["episodes"][self.current_index]["metadata"] = metadata
                if not is_batch and metadata.get("title"):
                    self.result["episodes"][self.current_index]["title"] = metadata["title"]
            except Exception as e:
                print(f"{e}")

        # 封面
        if line.startswith(" 封面 ") and "http" in line:
            cover_link = line[4:].replace(" ", "").replace("\r\n", "")
            self.result["episodes"][self.current_index]["cover_link"] = cover_link

        # 视频质量
        if line.startswith(" 视频质量 "):
            quality_match = re.search(r"<([^>]*)>", line)
            if quality_match:
                quality = quality_match.group(1).strip()
                if quality not in list(get_args(VideoQuality)):
                    raise ValueError(f"未知清晰度: {quality}")
                self.result["episodes"][self.current_index]["video_quality_list"].append(quality)  # type: ignore

        # 音频质量
        if line.startswith(" 音频质量 "):
            bitrate_match = re.search(r"<([^>]*)>", line)
            if bitrate_match:
                bitrate = bitrate_match.group(1).strip()
                if bitrate not in list(get_args(AudioQuality)):
                    raise ValueError(f"未知清晰度: {bitrate}")
                self.result["episodes"][self.current_index]["audio_quality_list"].append(bitrate)  # type: ignore

    def get_result(self) -> YuttoParseResult:
        """获取当前的解析结果"""
        return self.result


def split_into_words(text: str) -> list[str]:
    """
    将句子分割成单个汉字和单词，保留标点符号
    Example:
    split_into_words("晚安纳尼南尼nony!") -> ['晚', '安', '纳', '尼', '南', '尼', 'nony', '!']
    split_into_words("就的真的妈a等等?") -> ['就', '的', '真', '的', '妈', 'a', '等', '等', '?']
    split_into_words("多喜天dustin birthday.") -> ['多', '喜', '天', 'dustin', 'birthday', '.']
    split_into_words("He's 我见过的。") -> ["He's", '我', '见', '过', '的', '。']
    """

    # 正则表达式用于匹配英文单词、汉字、标点符号和英文缩写
    pattern = re.compile(r"[a-zA-Z]+(?:'[a-zA-Z]+)?|[\u4e00-\u9fa5]|[^\u4e00-\u9fa5a-zA-Z\s]")

    # 使用 findall 方法找到所有匹配的部分
    words = pattern.findall(text)

    return words
