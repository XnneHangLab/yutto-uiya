from __future__ import annotations

import ast
import platform
import re
from typing import TYPE_CHECKING

from uiya._dictionary import emoji

if TYPE_CHECKING:
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

    # 只解析单集
    def parse_line(self, line: str) -> None:
        print([line])
        """
        逐行解析输出
        """

        # 提取总集数
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

        # 提取视频名称
        if line.startswith(" 投稿视频 "):
            if " 投稿视频 " in line:
                self.current_value = line[6:].replace(" ", "")
                # else:
                #     self.current_value = line.split("\x1b[30m\x1b[46m 投稿视频 \x1b[0m")[1].replace(" ", "")
                self.current_type = "video_name"
                self.result[self.current_type] = self.current_value.strip()
                self.result["episodes"][0]["title"] = self.current_value.strip()
                return None

        if line.startswith(" LINK "):  # pexpect or wexpect
            self.current_value = line[6:].replace(" ", "").replace("\r\n", "")
            self.current_type = "link"
            self.result["episodes"][0][self.current_type] = self.current_value
            # 如果 LINK 以 p=? 结尾,那么提取 ?
            if "p=" in self.current_value:
                page_match = re.search(r"p=(\d+)", self.current_value)
                if page_match:
                    page = int(page_match.group(1))
                    self.result["video_name"] += f"(p={page})"

        # 检查是否有弹幕
        if line.startswith(" 弹幕 "):
            self.current_value = True
            self.current_type = "has_danmaku"
            self.result["episodes"][0][self.current_type] = self.current_value

        # 检查是否有字幕
        if line.startswith(" 字幕 "):
            self.current_value = True
            self.current_type = "has_subtitle"
            self.result["episodes"][0][self.current_type] = self.current_value

        # 检查是否有章节信息
        if line.startswith(" 章节 "):
            self.current_value = True
            self.current_type = "has_chapter_info"
            self.result["episodes"][0][self.current_type] = self.current_value

        if line.startswith(" 描述文件 "):  # pexpect or wexpect
            # 提取从"描述文件"后面的所有内容作为元数据开始
            meta_part = line[6:].replace("\r\n", "").replace(" ", "")
            self.current_type = "metadata"
            self.current_value = meta_part

            try:
                self.current_value = ast.literal_eval(self.current_value)
                self.result["episodes"][0]["metadata"] = self.current_value
                if self.result["episodes"][0]["metadata"]["title"]:
                    self.result["episodes"][0]["title"] = self.result["episodes"][0]["metadata"]["title"]
            except Exception as E:
                print(f"{E}")
                # 继续收集，可能跨多行

        # 提取封面链接（如果之前没提取到）
        if line.startswith(" 封面 ") and "http" in line:
            self.current_value = line[4:].replace(" ", "").replace("\r\n", "")
            self.current_type = "cover_link"
            self.result["episodes"][0][self.current_type] = str(self.current_value)

        if line.startswith(" 视频质量 "):
            self.current_type = "video_quality_list"
            quality_match = re.search(r"<([^>]*)>", line)
            if quality_match:
                quality: VideoQuality = quality_match.group(1).strip()  # type: ignore
                self.current_value = quality
                self.result["episodes"][self.current_index][self.current_type].append(self.current_value)
        # 处理音频流
        if line.startswith(" 音频质量 "):
            self.current_type = "audio_quality_list"
            bitrate_match = re.search(r"<([^>]*)>", line)
            if bitrate_match:
                bitrate: AudioQuality = bitrate_match.group(1).strip()  # type:ignore
                self.current_value = bitrate
                self.result["episodes"][self.current_index][self.current_type].append(self.current_value)

    # 批量解析
    def batch_parse_line(self, line: str) -> None:
        """
        逐行解析输出，当一集解析完成时返回该集的信息
        """
        # 清理行
        # 提取视频名称
        if line.startswith(" 投稿视频 "):
            if " 投稿视频 " in line:
                self.current_value = line[6:].replace(" ", "")
                self.current_type = "video_name"
                self.result[self.current_type] = self.current_value.strip()
                return None

        # 提取总集数
        if line.startswith(" 全集 "):  # wexpect and pexpect as the same
            episodes_count_match = re.search(r"全\s+(\d+)\s+话", line)
            if episodes_count_match:
                self.current_value = episodes_count_match.group(1)
                self.current_type = "episodes_count"
                self.result[self.current_type] = int(self.current_value)
            return None

        # 新的一集开始
        if line.startswith(" ["):  # [2/4]
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
            if line.startswith(" LINK"):  # pexpect or wexpect
                self.current_value = line[6:].replace(" ", "").replace("\r\n", "")
                self.current_type = "link"
                self.result["episodes"][self.current_index][self.current_type] = self.current_value

            # 检查是否有弹幕
            if line.startswith(" 弹幕 "):
                self.current_value = True
                self.current_type = "has_danmaku"
                self.result["episodes"][self.current_index][self.current_type] = self.current_value

            # 检查是否有字幕
            if line.startswith(" 字幕 "):
                self.current_value = True
                self.current_type = "has_subtitle"
                self.result["episodes"][self.current_index][self.current_type] = self.current_value

            # 检查是否有章节信息
            if line.startswith(" 章节 "):
                self.current_value = True
                self.current_type = "has_chapter_info"
                self.result["episodes"][self.current_index][self.current_type] = self.current_value

            if line.startswith(" 描述文件 "):  # pexpect or wexpect
                meta_part = line[6:].replace("\r\n", "").replace(" ", "")
                self.current_type = "metadata"
                self.current_value = meta_part

                try:
                    self.current_value = ast.literal_eval(self.current_value)
                    self.result["episodes"][self.current_index]["metadata"] = self.current_value
                except Exception as E:
                    print(f"{E}")
                    # 继续收集，可能跨多行

            # 提取封面链接（如果之前没提取到）
            if line.startswith(" 封面 ") and "http" in line:
                self.current_value = line[4:].replace(" ", "").replace("\r\n", "")
                self.current_type = "cover_link"
                self.result["episodes"][self.current_index][self.current_type] = str(self.current_value)

            # 处理视频流
            # TODO 考虑不用 match 直接用 if in.
            if line.startswith(" 视频质量 "):
                self.current_type = "video_quality_list"
                quality_match = re.search(r"<([^>]*)>", line)
                if quality_match:
                    quality: VideoQuality = quality_match.group(1).strip()  # type: ignore
                    self.current_value = quality
                    self.result["episodes"][self.current_index][self.current_type].append(self.current_value)
            # 处理音频流
            if line.startswith(" 音频质量 "):
                self.current_type = "audio_quality_list"
                bitrate_match = re.search(r"<([^>]*)>", line)
                if bitrate_match:
                    bitrate: AudioQuality = bitrate_match.group(1).strip()  # type:ignore
                    self.current_value = bitrate
                    self.result["episodes"][self.current_index][self.current_type].append(self.current_value)

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
