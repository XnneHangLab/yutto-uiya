from __future__ import annotations

import base64

from uiya.cli import _build_qr_data_url


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
