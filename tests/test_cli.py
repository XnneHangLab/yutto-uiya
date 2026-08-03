from __future__ import annotations

import base64
import json
import urllib.error
from email.message import Message
from io import BytesIO
from typing import TYPE_CHECKING

from uiya.cli import (
    _build_qr_data_url,
    _cover_fetch_error_message,
    _fetch_image_as_data_url,
    _safe_cover_url,
    cmd_fetch_cover,
)

if TYPE_CHECKING:
    import pytest


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


class _ImageResponse(BytesIO):
    def __init__(self, data: bytes, content_type: str = "image/png") -> None:
        super().__init__(data)
        self.headers = Message()
        self.headers["Content-Type"] = content_type

    def __enter__(self):
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()


class _RecordingOpener:
    def __init__(self, response: _ImageResponse | Exception) -> None:
        self.response = response
        self.request = None
        self.timeout = None

    def open(self, request, timeout: int):
        self.request = request
        self.timeout = timeout
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


def test_fetch_image_as_data_url_uses_referer_and_content_type(monkeypatch: pytest.MonkeyPatch):
    opener = _RecordingOpener(_ImageResponse(b"png"))
    monkeypatch.setattr("urllib.request.build_opener", lambda *_handlers: opener)

    result = _fetch_image_as_data_url("https://i0.hdslb.com/cover.png")

    assert result == "data:image/png;base64,cG5n"
    assert opener.request.get_header("Referer") == "https://www.bilibili.com"
    assert opener.timeout == 10


def test_safe_cover_url_removes_credentials_query_and_fragment():
    assert (
        _safe_cover_url("https://user:secret@i0.hdslb.com:8443/cover.png?token=secret#preview")
        == "https://i0.hdslb.com:8443/cover.png"
    )


def test_cover_fetch_error_message_preserves_http_diagnostics_without_url():
    error = urllib.error.HTTPError(
        "https://i0.hdslb.com/cover.png?token=secret",
        403,
        "Forbidden",
        Message(),
        None,
    )

    message = _cover_fetch_error_message(error)

    assert message == "HTTP 403 Forbidden"
    assert "secret" not in message


def test_cmd_fetch_cover_returns_detailed_safe_error(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
):
    monkeypatch.setattr("uiya.cli._load_no_proxy_setting", lambda: True)
    monkeypatch.setattr(
        "uiya.cli._fetch_image_as_data_url",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(urllib.error.URLError(ConnectionResetError("reset"))),
    )

    cmd_fetch_cover("https://user:secret@i0.hdslb.com/cover.png?token=secret#preview")

    envelope = json.loads(capsys.readouterr().out)
    error = envelope["payload"]["error"]
    assert "直连" in error
    assert "https://i0.hdslb.com/cover.png" in error
    assert "ConnectionResetError" in error
    assert "token" not in error
    assert "secret" not in error


def test_cmd_fetch_cover_keeps_success_payload(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]):
    monkeypatch.setattr("uiya.cli._load_no_proxy_setting", lambda: False)
    monkeypatch.setattr("uiya.cli._fetch_image_as_data_url", lambda *_args, **_kwargs: "data:image/png;base64,cG5n")

    cmd_fetch_cover("https://i0.hdslb.com/cover.png")

    assert json.loads(capsys.readouterr().out) == {
        "kind": "payload",
        "payload": {"dataUrl": "data:image/png;base64,cG5n"},
    }
