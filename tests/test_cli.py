from __future__ import annotations

import base64

from uiya.cli import _assign_parse_item_dirs, _build_qr_data_url, _resolve_single_download_title


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
