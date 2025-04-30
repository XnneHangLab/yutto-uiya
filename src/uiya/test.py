from __future__ import annotations

import ast
import json
import re
from typing import Any, TypedDict


class VideoMetadata(TypedDict):
    title: str
    show_title: str
    plot: str
    thumb: str
    premiered: int
    dateadded: int
    actor: list[dict[str, Any]]
    genre: list[str]
    tag: list[str]
    source: str
    original_filename: str
    website: str
    chapter_info_data: list[Any]


class EpisodeInfo(TypedDict):
    title: str
    link: str
    video_quality_list: list[str]  # 只保留清晰度描述
    audio_quality_list: list[str]  # 只保留比特率描述
    has_danmaku: bool
    has_subtitle: bool
    has_chapter_info: bool
    metadata: VideoMetadata | None
    cover_link: str


class YuttoParseResult(TypedDict):
    video_name: str
    episodes_count: int
    selected_episodes: list[int]
    episodes: list[EpisodeInfo]
    current_episode_index: int  # 当前正在处理的集的索引


class YuttoOutputParser:
    def __init__(self):
        # 初始化解析结果
        self.result: YuttoParseResult = {
            "video_name": "",
            "episodes_count": 0,
            "selected_episodes": [],
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

                self.current_value = episode_start_match.group(3)
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

        current_index = self.result["current_episode_index"]
        # collect episode info
        if current_index != -1:
            # 提取链接
            if "\x1b[30;46m LINK \x1b[0m" in line:
                self.current_value = line.split("\x1b[30;46m LINK \x1b[0m")[1].replace(" ", "").replace("\r\n", "")
                self.current_type = "link"
                self.result["episodes"][current_index][self.current_type] = self.current_value

            # 检查是否有弹幕
            if "\x1b[30;46m 弹幕 \x1b[0m" in line:
                self.current_value = True
                self.current_type = "has_danmaku"
                self.result["episodes"][current_index][self.current_type] = self.current_value

            # 检查是否有字幕
            if "\x1b[30;46m 字幕 \x1b[0m" in line:
                self.current_value = True
                self.current_type = "has_subtitle"
                self.result["episodes"][current_index][self.current_type] = self.current_value

            # 检查是否有章节信息
            if "\x1b[30;46m 章节 \x1b[0m" in line:
                self.current_value = True
                self.current_type = "has_chapter_info"
                self.result["episodes"][current_index][self.current_type] = self.current_value

            if "\x1b[30;46m 描述文件 \x1b[0m " in line:
                # 提取从"描述文件"后面的所有内容作为元数据开始
                meta_part = line.split("\x1b[30;46m 描述文件 \x1b[0m ", 1)[1].replace("\r\n", "").replace(" ", "")
                self.current_type = "metadata"
                self.current_value = meta_part

                try:
                    self.current_value = ast.literal_eval(self.current_value)
                    self.result["episodes"][current_index]["metadata"] = self.current_value
                except Exception as E:
                    print(f"{E}")
                    # 继续收集，可能跨多行

            # 提取封面链接（如果之前没提取到）
            if "\x1b[30;46m 封面 \x1b[0m" in line and "http" in line:
                self.current_value = line.split("\x1b[30;46m 封面 \x1b[0m")[1].replace(" ", "").replace("\r\n", "")
                self.current_type = "cover_link"
                self.result["episodes"][current_index][self.current_type] = self.current_value

            # 进入视频流部分
            if "\x1b[94m INFO \x1b[0m 共包含以下" in line and "视频流" in line:
                self.current_type = "video_quality_list"
                self.result["episodes"][current_index]["video_quality_list"] = []
                return None

            # 进入音频流部分
            if "\x1b[94m INFO \x1b[0m 共包含以下" in line and "个音频流" in line:
                self.current_type = "audio_quality_list"
                self.result["episodes"][current_index]["audio_quality_list"] = []

            # 处理视频流
            if self.current_type == "video_quality_list":
                quality_match = re.search(r"<([^>]*)>", line)
                if quality_match:
                    quality = quality_match.group(1).strip()
                    self.current_value = quality
                    self.result["episodes"][current_index][self.current_type].append(self.current_value)
            # 处理音频流
            if self.current_type == "audio_quality_list":
                bitrate_match = re.search(r"<([^>]*)>", line)
                if bitrate_match:
                    bitrate = bitrate_match.group(1).strip()
                    self.current_value = bitrate
                    self.result["episodes"][current_index][self.current_type].append(self.current_value)

    def get_result(self) -> YuttoParseResult:
        """获取当前的解析结果"""
        return self.result


def main():
    # 模拟逐行输入
    linux_lines = [
        "\x1b[94m INFO \x1b[0m 发现配置文件 config/yutto.toml，加载中……\r\n",
        "\x1b[94m INFO \x1b[0m 未提供 SESSDATA，无法下载高清视频、字幕等资源哦～\r\n",
        "\x1b[30;46m 投稿视频 \x1b[0m 用 bilili 下载 B 站视频\r\n"
        "\x1b[94m INFO \x1b[0m 全 2 话\r\n"
        "\x1b[94m INFO \x1b[0m 已选择第 1,2 话\r\n",
        "\x1b[30;46m [1/2] \x1b[0m bilili 特性以及使用方法简单介绍\r\n",
        "\x1b[94m INFO \x1b[0m 开始处理视频 bilili 特性以及使用方法简单介绍\r\n",
        "\x1b[30;46m LINK \x1b[0m https://www.bilibili.com/video/BV1vZ4y1M7mQ?p=1\r\n",
        "\x1b[94m INFO \x1b[0m 共包含以下 2 个视频流：\r\n"
        "\x1b[94m INFO \x1b[0m   0 [AVC ] [ 852x480 ] <480P 清晰 > #3\r\n",
        "\x1b[94m INFO \x1b[0m \x1b[34m* 1 [AVC ] [ 640x360 ] <360P 流畅 > #3\x1b[0m\r\n",
        "\x1b[94m INFO \x1b[0m 共包含以下 3 个音频流：\r\n",
        "\x1b[94m INFO \x1b[0m   0 [MP4A] <128kbps >\r\n",
        "\x1b[94m INFO \x1b[0m   1 [MP4A] < 64kbps >\r\n",
        "\x1b[94m INFO \x1b[0m \x1b[35m* 2 [MP4A] <320kbps >\x1b[0m\r\n",
        "\x1b[30;46m 弹幕 \x1b[0m 存在可下载弹幕\r\n",
        "\x1b[30;46m 描述文件 \x1b[0m {'title': 'bilili 特性以及使用方法简单介绍', 'show_title': 'bilili 特性以及使用方法简单介绍', 'plot': '最近总有人问我 bilili 怎么用之类的，为了方便我就直接录了个屏，P1 是在 Manjaro 下直接录的，主要介绍 bilili 的特性与用法，P2 是回到 Windows 录的，添加了一些环境配置的细节，不过懒得剪啦，建议二倍速\\n- BGM：ハイスクール Days\\n- 项目主页：https://github.com/SigureMo/bilili\\n- 文档链接：https://bilili.sigure.xyz/「建议直接访问这个，内容会更详细些」', 'thumb': 'http://i2.hdslb.com/bfs/archive/89528873eb69fca2352238b30b1443b5c03d61d7.jpg', 'premiered': 1596937757, 'dateadded': 1745238186, 'actor': [{'name': '时雨千陌', 'role': 'UP主', 'thumb': 'https://i1.hdslb.com/bfs/face/4b478115588ffc480246c40b41f5ee6628b952a5.jpg', 'profile': 'https://space.bilibili.com/100969474', 'order': 0}], 'genre': ['校园学习'], 'tag': ['下载', 'Python'], 'source': '', 'original_filename': '', 'website': 'https://www.bilibili.com/video/BV1vZ4y1M7mQ', 'chapter_info_data': []}\r\n"
        "\x1b[30;46m 封面 \x1b[0m http://i2.hdslb.com/bfs/archive/89528873eb69fca2352238b30b1443b5c03d61d7.jpg\r\n"
        "\r\n",
        "\x1b[30;46m [2/2] \x1b[0m bilili 环境配置方法\r\n",
        "\x1b[94m INFO \x1b[0m 开始处理视频 bilili 环境配置方法\r\n",
        "\x1b[30;46m LINK \x1b[0m https://www.bilibili.com/video/BV1vZ4y1M7mQ?p=2\r\n",
        "\x1b[94m INFO \x1b[0m 共包含以下 2 个视频流：\r\n",
        "\x1b[94m INFO \x1b[0m   0 [AVC ] [ 852x480 ] <480P 清晰 > #3\r\n",
        "\x1b[94m INFO \x1b[0m \x1b[34m* 1 [AVC ] [ 640x360 ] <360P 流畅 > #3\x1b[0m\r\n",
        "\x1b[94m INFO \x1b[0m 共包含以下 3 个音频流：\r\n",
        "\x1b[94m INFO \x1b[0m   0 [MP4A] <128kbps >\r\n",
        "\x1b[94m INFO \x1b[0m \x1b[35m* 1 [MP4A] <320kbps >\x1b[0m\r\n\x1b[94m INFO \x1b[0m   2 [MP4A] < 64kbps >\r\n",
        "\x1b[30;46m 弹幕 \x1b[0m 存在可下载弹幕\r\n",
        "\x1b[30;46m 描述文件 \x1b[0m {'title': 'bilili 环境配置方法', 'show_title': 'bilili 环境配置方法', 'plot': '最近总有人问我 bilili 怎么用之类的，为了方便我就直接录了个屏，P1 是在 Manjaro 下直接录的，主要介绍 bilili 的特性与用法，P2 是回到 Windows 录的，添加了一些环境配置的细节，不过懒得剪啦，建议二倍速\\n- BGM：ハイスクール Days\\n- 项目主页：https://github.com/SigureMo/bilili\\n- 文档链接：https://bilili.sigure.xyz/「建议直接访问这个，内容会更详细些」', 'thumb': 'http://i2.hdslb.com/bfs/archive/89528873eb69fca2352238b30b1443b5c03d61d7.jpg', 'premiered': 1596937757, 'dateadded': 1745238186, 'actor': [{'name': '时雨千陌', 'role': 'UP主', 'thumb': 'https://i1.hdslb.com/bfs/face/4b478115588ffc480246c40b41f5ee6628b952a5.jpg', 'profile': 'https://space.bilibili.com/100969474', 'order': 0}], 'genre': ['校园学习'], 'tag': ['下载', 'Python'], 'source': '', 'original_filename': '', 'website': 'https://www.bilibili.com/video/BV1vZ4y1M7mQ', 'chapter_info_data': []}\r\n",
        "\x1b[30;46m 封面 \x1b[0m http://i2.hdslb.com/bfs/archive/89528873eb69fca2352238b30b1443b5c03d61d7.jpg\r\n",
        "\r\n",
        "\r\n",
    ]

    parser = YuttoOutputParser()

    for line in linux_lines:
        parser.parse_line(line)

    # 获取最终结果
    result = parser.get_result()
    print("\n完整解析结果:")
    print(json.dumps(result, indent=2, ensure_ascii=False))


# 使用示例
if __name__ == "__main__":
    main()
