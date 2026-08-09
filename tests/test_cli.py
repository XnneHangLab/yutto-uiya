from __future__ import annotations

import asyncio
import base64
import json
import urllib.error
from contextlib import asynccontextmanager
from email.message import Message
from io import BytesIO
from types import SimpleNamespace
from typing import TYPE_CHECKING, Any

import pytest

from uiya.cli import (
    _build_qr_data_url,
    _cover_fetch_error_message,
    _fetch_image_as_data_url,
    _safe_cover_url,
    cmd_auth_login,
    cmd_fetch_cover,
)

if TYPE_CHECKING:
    from pathlib import Path


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


def test_cmd_auth_login_uses_async_native_session_and_emits_events(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
):
    import yutto.auth as auth_module
    import yutto.login as login_module
    import yutto.utils.fetcher as fetcher_module

    calls: dict[str, Any] = {}
    sessions: list[object] = []
    fake_session = object()
    responses = iter(
        [
            {"code": 0, "data": {"code": login_module.QR_STATUS_NOT_SCANNED}},
            {"code": 0, "data": {"code": login_module.QR_STATUS_SCANNED}},
            {
                "code": 0,
                "data": {
                    "code": login_module.QR_STATUS_CONFIRMED,
                    "url": "https://passport.bilibili.com/confirmed",
                },
            },
        ]
    )

    @asynccontextmanager
    async def fake_create_client(**kwargs: Any):
        calls["client"] = kwargs
        yield fake_session

    async def fake_generate_qr_login(session: object) -> tuple[str, str]:
        sessions.append(session)
        return "https://example.com/qr", "qr-key"

    async def fake_request_json(session: object, url: str, *, params: dict[str, str]) -> dict[str, Any]:
        sessions.append(session)
        calls.setdefault("requests", []).append((url, params))
        return next(responses)

    async def fake_complete_login(session: object, redirect_url: str) -> tuple[str, str, str]:
        sessions.append(session)
        calls["redirect"] = redirect_url
        return "https://www.bilibili.com", "sessdata", "csrf-token"

    async def fake_validate_saved_auth(
        auth: dict[str, str | None],
        *,
        proxy: str | None,
        trust_env: bool,
    ) -> bool:
        calls["validation"] = (auth, proxy, trust_env)
        return True

    async def fake_sleep(interval: float) -> None:
        calls.setdefault("sleeps", []).append(interval)

    def fake_save_auth(auth_file: Path, profile: str, sessdata: str, bili_jct: str | None) -> None:
        calls["saved"] = (auth_file, profile, sessdata, bili_jct)

    monkeypatch.setattr(fetcher_module, "create_client", fake_create_client)
    monkeypatch.setattr(login_module, "generate_qr_login", fake_generate_qr_login)
    monkeypatch.setattr(login_module, "request_json", fake_request_json)
    monkeypatch.setattr(login_module, "complete_login", fake_complete_login)
    monkeypatch.setattr(login_module, "validate_saved_auth", fake_validate_saved_auth)
    monkeypatch.setattr(auth_module, "default_auth_file", lambda: tmp_path / "auth.toml")
    monkeypatch.setattr(auth_module, "save_auth", fake_save_auth)
    monkeypatch.setattr(asyncio, "sleep", fake_sleep)
    monkeypatch.setattr("uiya.utils.config.load_settings_file", lambda *_args: SimpleNamespace(no_proxy=True))

    cmd_auth_login()

    envelopes = [json.loads(line) for line in capsys.readouterr().out.splitlines()]
    events = [item["payload"]["event"] for item in envelopes if item["kind"] == "event"]
    assert events == [
        "auth.login.started",
        "auth.login.qr",
        "auth.login.waiting",
        "auth.login.scanned",
        "auth.login.completed",
    ]
    qr_event = next(item["payload"] for item in envelopes if item.get("payload", {}).get("event") == "auth.login.qr")
    assert qr_event["authQrDataUrl"].startswith("data:image/png;base64,")
    assert envelopes[-1] == {"kind": "payload", "payload": {"ok": True}}
    assert calls["client"] == {"proxy": None, "trust_env": False, "timeout": 10, "verify": True}
    assert sessions == [fake_session] * 5
    assert calls["sleeps"] == [0.8, 0.8]
    assert calls["redirect"] == "https://passport.bilibili.com/confirmed"
    assert calls["saved"] == (tmp_path / "auth.toml", "default", "sessdata", "csrf-token")
    assert calls["validation"] == ({"SESSDATA": "sessdata", "bili_jct": "csrf-token"}, None, False)


def test_cmd_auth_login_emits_structured_failure(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
):
    import yutto.login as login_module
    import yutto.utils.fetcher as fetcher_module

    @asynccontextmanager
    async def fake_create_client(**_kwargs: Any):
        yield object()

    async def fail_generate_qr_login(_session: object) -> tuple[str, str]:
        raise RuntimeError("native request failed")

    monkeypatch.setattr(fetcher_module, "create_client", fake_create_client)
    monkeypatch.setattr(login_module, "generate_qr_login", fail_generate_qr_login)
    monkeypatch.setattr("uiya.utils.config.load_settings_file", lambda *_args: SimpleNamespace(no_proxy=False))

    with pytest.raises(SystemExit) as exc_info:
        cmd_auth_login()

    assert exc_info.value.code == 1
    envelopes = [json.loads(line) for line in capsys.readouterr().out.splitlines()]
    assert envelopes[-2]["payload"]["event"] == "auth.login.failed"
    assert envelopes[-2]["payload"]["message"] == "登录失败: native request failed"
    assert envelopes[-1] == {
        "kind": "payload",
        "payload": {"ok": False, "error": "登录失败: native request failed"},
    }
