from __future__ import annotations

import base64

from uiya.cli import (
    _assign_parse_group_dirs,
    _assign_parse_item_dirs,
    _build_qr_data_url,
    _parse_skip_download_lines,
    _resolve_single_download_title,
)


def test_resolve_single_download_title_uses_video_title_and_page_suffix():
    resolved = _resolve_single_download_title(
        "https://www.bilibili.com/video/BV1xx411c7mD?p=1",
        "mmexport1768031333059",
        lambda _url: {"title": "Qwen3.5-27B 变身本地 Claude"},
    )

    assert resolved == "Qwen3.5-27B 变身本地 Claude_p1"


def test_resolve_single_download_title_falls_back_to_existing_title_when_lookup_fails():
    resolved = _resolve_single_download_title(
        "https://www.bilibili.com/video/BV1xx411c7mD?p=2",
        "mmexport1768031333059",
        lambda _url: None,
    )

    assert resolved == "mmexport1768031333059"


def test_assign_parse_item_dirs_uses_title_without_page_suffix_for_per_video_layout():
    items = [
        {
            "index": 1,
            "title": "Qwen3.5-27B 变身本地 Claude_p1",
            "url": "https://www.bilibili.com/video/BV1xx411c7mD?p=1",
        }
    ]

    _assign_parse_item_dirs(items, "Korewaxnne的收藏夹/不可思议", is_per_video=True)

    assert items[0]["dir"] == "Korewaxnne的收藏夹/不可思议/Qwen3.5-27B 变身本地 Claude"


def test_build_qr_data_url_generates_png_with_alpha_channel():
    raw = base64.b64decode(_build_qr_data_url("https://example.com").split(",", 1)[1])

    # Transparent PNG may be encoded via alpha channels or indexed transparency (tRNS chunk).
    assert raw[25] in {3, 4, 6}
    assert b"tRNS" in raw or raw[25] in {4, 6}


def test_build_qr_data_url_uses_tight_png_dimensions():
    raw = base64.b64decode(_build_qr_data_url("https://example.com").split(",", 1)[1])

    width = int.from_bytes(raw[16:20], "big")
    height = int.from_bytes(raw[20:24], "big")

    assert width == height == 216


def test_resolve_single_download_title_keeps_playlist_page_titles():
    resolved = _resolve_single_download_title(
        "https://www.bilibili.com/video/BV1XY411o7Cv?p=1",
        "P01_3分钟学会 视频选集 视频合集 视频列表 分p怎么弄",
        lambda _url: {"title": "3分钟学会 视频选集 视频合集 视频列表 分p怎么弄"},
    )

    assert resolved == "P01_3分钟学会 视频选集 视频合集 视频列表 分p怎么弄"


def test_parse_skip_download_lines_groups_playlist_pages_under_list_heading():
    parsed = _parse_skip_download_lines(
        [
            " 列表  3分钟学会 视频选集 视频合集 视频列表 分p怎么弄",
            " INFO  开始处理视频 P01_3分钟学会 视频选集 视频合集 视频列表 分p怎么弄",
            " LINK  https://www.bilibili.com/video/BV1XY411o7Cv?p=1",
            " INFO  开始处理视频 P02_手机端添加分p",
            " LINK  https://www.bilibili.com/video/BV1XY411o7Cv?p=2",
            " 视频质量  * 0 [AVC ] [1920x1080] <1080P 60帧> #3",
            " 音频质量  * 0 [MP4A] <320kbps >",
            " INFO  开始处理视频 普通收藏视频",
            " LINK  https://www.bilibili.com/video/BV1v7QUBdE9U?p=1",
        ],
        lambda _url: None,
    )

    assert parsed["items"] == [
        {
            "index": 3,
            "title": "普通收藏视频",
            "url": "https://www.bilibili.com/video/BV1v7QUBdE9U?p=1",
            "dir": "",
        }
    ]
    assert parsed["groups"] == [
        {
            "title": "3分钟学会 视频选集 视频合集 视频列表 分p怎么弄",
            "dir": "",
            "items": [
                {
                    "index": 1,
                    "title": "P01_3分钟学会 视频选集 视频合集 视频列表 分p怎么弄",
                    "url": "https://www.bilibili.com/video/BV1XY411o7Cv?p=1",
                    "dir": "",
                },
                {
                    "index": 2,
                    "title": "P02_手机端添加分p",
                    "url": "https://www.bilibili.com/video/BV1XY411o7Cv?p=2",
                    "dir": "",
                },
            ],
        }
    ]
    assert parsed["videoQualities"] == [{"label": "1080P 60帧", "code": 116}]
    assert parsed["audioQualities"] == [{"label": "320kbps", "code": 30280}]


def test_assign_parse_group_dirs_uses_group_title_for_shared_dir():
    groups = [
        {
            "title": "3分钟学会 视频选集 视频合集 视频列表 分p怎么弄",
            "dir": "",
            "items": [
                {
                    "index": 1,
                    "title": "P01_3分钟学会 视频选集 视频合集 视频列表 分p怎么弄",
                    "url": "https://www.bilibili.com/video/BV1XY411o7Cv?p=1",
                    "dir": "",
                },
                {
                    "index": 2,
                    "title": "P02_手机端添加分p",
                    "url": "https://www.bilibili.com/video/BV1XY411o7Cv?p=2",
                    "dir": "",
                },
            ],
        }
    ]

    _assign_parse_group_dirs(groups, "Korewaxnne的收藏夹/不可思议")

    assert groups[0]["dir"] == "Korewaxnne的收藏夹/不可思议/3分钟学会 视频选集 视频合集 视频列表 分p怎么弄"
    assert groups[0]["items"][0]["dir"] == groups[0]["dir"]
    assert groups[0]["items"][1]["dir"] == groups[0]["dir"]
