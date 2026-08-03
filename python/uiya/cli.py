"""
uiya CLI – entry point called by the Tauri Rust layer.

解析与下载已走 yutto serve 的 JSON-RPC（serve 迁移阶段 3/4），这里只剩
serve 之外的职责：

Commands:
  inspect-runtime   Return runtime info as a JSON PythonEnvelope (kind=payload).
  convert-wav       wav 转码（wire 不支持 wav，下载 m4a 后本地转）。
  fetch-cover       前端封面取图（webview 防盗链）。
  save-settings     Persist settings to uiya.toml.
  auth-login / auth-logout   扫码登录，读写 yutto auth.toml（等上游 auth.* RPC）。
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from typing import TYPE_CHECKING, Any, NoReturn, cast
from urllib.parse import SplitResult, urlsplit, urlunsplit

if TYPE_CHECKING:
    import pathlib
    from collections.abc import Callable

_BILIBILI_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.bilibili.com",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9",
}


def _load_no_proxy_setting() -> bool:
    """uiya.toml 的 不使用代理 开关；读取失败时按未开启处理。"""
    try:
        from uiya.utils.config import UiyaSetting, load_settings_file

        settings = load_settings_file("uiya.toml", UiyaSetting)
        return bool(getattr(settings, "no_proxy", False))
    except Exception:
        return False


def _safe_cover_url(url: str) -> str:
    """Return a log-safe URL without credentials, query parameters, or fragments."""
    parsed = urlsplit(url)
    host = parsed.hostname or ""
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"
    try:
        port = parsed.port
    except ValueError:
        port = None
    netloc = f"{host}:{port}" if port is not None else host
    return urlunsplit(SplitResult(parsed.scheme, netloc, parsed.path, "", ""))


def _cover_fetch_error_message(error: Exception) -> str:
    """Describe a cover fetch failure without echoing the possibly sensitive URL."""
    if isinstance(error, urllib.error.HTTPError):
        return f"HTTP {error.code} {error.reason}"
    if isinstance(error, urllib.error.URLError):
        reason = error.reason
        return f"{type(reason).__name__}: {reason}"
    return f"{type(error).__name__}: {error}"


def _fetch_image_as_data_url(url: str, no_proxy: bool = False) -> str:
    """Download an image with Bilibili referer and return a base64 data URL.

    no_proxy 时强制直连（绕过环境变量与系统注册表代理），与解析/下载的
    不使用代理 行为保持一致。网络异常交由调用方记录具体诊断信息。
    """
    req = urllib.request.Request(
        url,
        headers={
            **_BILIBILI_HEADERS,
            "Referer": "https://www.bilibili.com",
        },
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({})) if no_proxy else urllib.request.build_opener()
    with opener.open(req, timeout=10) as resp:
        img_bytes = resp.read()
        mime = resp.headers.get_content_type() or "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(img_bytes).decode()}"


def _resolve_runtime_proxy(settings: Any) -> str:
    if getattr(settings, "no_proxy", False):
        return "no"
    if getattr(settings, "custom_proxy_pool", False) and getattr(settings, "proxy_pool", ""):
        proxy: str = settings.proxy_pool
        return proxy
    return "auto"


def _build_qr_data_url(url: str) -> str:
    import base64
    import io

    import segno

    buffer = io.BytesIO()
    segno.make(url).save(
        buffer,
        kind="png",
        scale=8,
        border=1,
        dark="#0B1016",
        light="#FFFFFFB8",
    )
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def cmd_inspect_runtime() -> None:
    from uiya.utils.config import UiyaSetting, load_settings_file, resolve_download_dir

    settings = load_settings_file("uiya.toml", UiyaSetting)
    resolved_download_dir = resolve_download_dir(settings)
    payload = {
        "managedPaths": [
            {"key": "workspace", "path": "."},
            {"key": "downloads", "path": str(resolved_download_dir)},
            {"key": "logs", "path": "./logs"},
        ],
        "downloadDir": resolved_download_dir.resolve().as_posix(),
        "downloadDirSetting": settings.download_dir,
        "sessData": bool(settings.SESS_DATA),
        "ffmpegPath": settings.ffmpeg_path,
        "noProxy": settings.no_proxy,
        "fetchWorkers": settings.fetch_workers,
    }
    print(json.dumps({"kind": "payload", "payload": payload}, ensure_ascii=False), flush=True)


def _convert_audio_to_wav(
    download_dir: pathlib.Path,
    ffmpeg_cmd: str,
    emit_event: Callable[..., Any],
) -> None:
    for ext in ("m4a", "aac"):
        for src in download_dir.rglob(f"*.{ext}"):
            dst = src.with_suffix(".wav")
            if dst.exists():
                continue
            emit_event(
                {
                    "event": "download.converting",
                    "target": str(src.name),
                    "status": "verifying",
                    "message": f"转码 {src.name} → wav",
                    "progressCurrent": 2,
                    "progressTotal": 3,
                    "progressUnit": "stage",
                }
            )
            try:
                subprocess.run(
                    [ffmpeg_cmd, "-i", str(src), "-y", str(dst)],
                    capture_output=True,
                    timeout=300,
                    check=True,
                )
                src.unlink()
            except Exception as exc:
                print(f"[warn] 转码失败 {src.name}: {exc}", flush=True)


def cmd_convert_wav(directory: str | None) -> None:
    """
    Convert downloaded m4a/aac files under a downloads-root-relative
    directory to wav. The serve pipeline has no wav wire format; the app
    calls this after a download task completes.
    """
    from uiya.utils.config import UiyaSetting, load_settings_file, resolve_download_dir

    def emit_event(payload: dict[str, Any]) -> None:
        print(json.dumps({"kind": "event", "payload": payload}, ensure_ascii=False), flush=True)

    settings = load_settings_file("uiya.toml", UiyaSetting)
    target_dir = resolve_download_dir(settings)
    if directory:
        target_dir = target_dir / directory
    if not target_dir.exists():
        print(
            json.dumps({"kind": "payload", "payload": {"ok": False, "error": "目录不存在"}}, ensure_ascii=False),
            flush=True,
        )
        raise SystemExit(1)

    env_ffmpeg = (os.environ.get("UIYA_FFMPEG_PATH") or "").strip()
    ffmpeg_cmd = env_ffmpeg or (getattr(settings, "ffmpeg_path", "") or "ffmpeg")
    _convert_audio_to_wav(target_dir, ffmpeg_cmd, emit_event)
    print(json.dumps({"kind": "payload", "payload": {"ok": True}}, ensure_ascii=False), flush=True)


def cmd_fetch_cover(url: str) -> None:
    """
    Download a single cover image and emit it as a base64 data URL.
    Called on demand when the user opens a detail panel.
    """

    def emit_payload(payload: dict[str, Any]) -> None:
        print(json.dumps({"kind": "payload", "payload": payload}, ensure_ascii=False), flush=True)

    no_proxy = _load_no_proxy_setting()
    try:
        data_url = _fetch_image_as_data_url(url, no_proxy=no_proxy)
    except Exception as error:
        proxy_mode = "直连" if no_proxy else "系统/环境代理"
        emit_payload(
            {
                "error": (
                    f"封面图片加载失败（{proxy_mode}，{_safe_cover_url(url)}）："
                    f"{_cover_fetch_error_message(error)}"
                )
            }
        )
        return
    emit_payload({"dataUrl": data_url})


def cmd_save_settings(
    ffmpeg_path: str,
    no_proxy: bool,
    download_dir: str | None = None,
    fetch_workers: int | None = None,
) -> None:
    """
    Persist updated settings to uiya.toml.
    """
    from uiya.utils.config import UiyaSetting, load_settings_file, write_settings_file

    try:
        settings = load_settings_file("uiya.toml", UiyaSetting)
        settings.ffmpeg_path = ffmpeg_path
        settings.no_proxy = no_proxy
        if download_dir is not None:
            settings.download_dir = download_dir
        if fetch_workers is not None:
            settings.fetch_workers = max(1, fetch_workers)
        write_settings_file("uiya.toml", settings)
    except Exception as exc:
        print(
            json.dumps({"kind": "payload", "payload": {"ok": False, "error": str(exc)}}, ensure_ascii=False), flush=True
        )
        sys.exit(1)
    print(json.dumps({"kind": "payload", "payload": {"ok": True}}, ensure_ascii=False), flush=True)


def cmd_auth_login() -> None:
    from yutto.auth import default_auth_file, save_auth
    from yutto.login import (
        QR_POLL_API,
        QR_STATUS_CONFIRMED,
        QR_STATUS_EXPIRED,
        QR_STATUS_NOT_SCANNED,
        QR_STATUS_SCANNED,
        complete_login,
        generate_qr_login,
        request_json,
        validate_saved_auth,
    )
    from yutto.utils.fetcher import FetcherContext, create_sync_client

    from uiya.utils.config import UiyaSetting, load_settings_file

    def emit_event(payload: dict[str, Any]) -> None:
        print(json.dumps({"kind": "event", "payload": payload}, ensure_ascii=False), flush=True)

    def emit_payload(payload: dict[str, Any]) -> None:
        print(json.dumps({"kind": "payload", "payload": payload}, ensure_ascii=False), flush=True)

    def fail(message: str) -> NoReturn:
        emit_event(
            {
                "event": "auth.login.failed",
                "target": "auth",
                "status": "failed",
                "message": message,
                "progressCurrent": 0,
                "progressTotal": 0,
                "progressUnit": "step",
            }
        )
        emit_payload({"ok": False, "error": message})
        sys.exit(1)

    try:
        settings = load_settings_file("uiya.toml", UiyaSetting)
        proxy = _resolve_runtime_proxy(settings)
        ctx = FetcherContext()
        ctx.set_proxy(proxy)
        auth_profile = "default"
        auth_file = default_auth_file()
    except Exception as exc:
        fail(f"初始化登录环境失败: {exc}")

    emit_event(
        {
            "event": "auth.login.started",
            "target": "auth",
            "status": "pending",
            "message": "正在生成二维码",
            "progressCurrent": 0,
            "progressTotal": 3,
            "progressUnit": "step",
        }
    )

    try:
        with create_sync_client(proxy=ctx.proxy, trust_env=ctx.trust_env, timeout=10, verify=True) as client:
            qr_login_url, qr_key = generate_qr_login(client)
            emit_event(
                {
                    "event": "auth.login.qr",
                    "target": "auth",
                    "status": "pending",
                    "message": "请使用哔哩哔哩 App 扫码登录",
                    "progressCurrent": 1,
                    "progressTotal": 3,
                    "progressUnit": "step",
                    "authQrDataUrl": _build_qr_data_url(qr_login_url),
                }
            )

            deadline = __import__("time").monotonic() + 120
            last_status: int | None = None
            redirect_url: str | None = None
            while __import__("time").monotonic() < deadline:
                payload = request_json(
                    client,
                    QR_POLL_API,
                    params={"qrcode_key": qr_key, "source": "main-fe-header"},
                )
                code = payload.get("code")
                if not isinstance(code, int) or code != 0:
                    raise ValueError(f"轮询登录状态失败：{payload}")

                data_any: Any = payload.get("data")
                if not isinstance(data_any, dict):
                    raise ValueError(f"轮询登录状态失败，返回值异常：{payload}")
                data: dict[str, Any] = cast("dict[str, Any]", data_any)
                status: Any = data.get("code")
                if not isinstance(status, int):
                    raise ValueError(f"轮询登录状态失败，缺少状态码：{payload}")

                if status != last_status:
                    if status == QR_STATUS_NOT_SCANNED:
                        emit_event(
                            {
                                "event": "auth.login.waiting",
                                "target": "auth",
                                "status": "pending",
                                "message": "二维码待扫描",
                                "progressCurrent": 1,
                                "progressTotal": 3,
                                "progressUnit": "step",
                            }
                        )
                    elif status == QR_STATUS_SCANNED:
                        emit_event(
                            {
                                "event": "auth.login.scanned",
                                "target": "auth",
                                "status": "pending",
                                "message": "已扫码，请在 App 内确认登录",
                                "progressCurrent": 2,
                                "progressTotal": 3,
                                "progressUnit": "step",
                            }
                        )
                    elif status == QR_STATUS_EXPIRED:
                        raise TimeoutError("二维码已过期，请重新登录")
                    last_status = status

                if status == QR_STATUS_CONFIRMED:
                    redirect_url_raw: Any = data.get("url")
                    if not isinstance(redirect_url_raw, str):
                        raise ValueError(f"登录成功但未返回跳转链接：{payload}")
                    redirect_url = redirect_url_raw
                    break

                __import__("time").sleep(0.8)

            if redirect_url is None:
                raise TimeoutError("登录超时，请重试")

            _result_url, sessdata, bili_jct = complete_login(client, redirect_url)
    except Exception as exc:
        fail(f"登录失败: {exc}")

    if not sessdata:
        fail("登录成功但未提取到 SESSDATA")

    try:
        save_auth(auth_file, auth_profile, sessdata, bili_jct)
        auth: Any = {"SESSDATA": sessdata, "bili_jct": bili_jct}
        is_valid = validate_saved_auth(auth, proxy=ctx.proxy, trust_env=ctx.trust_env)
    except Exception as exc:
        fail(f"写入认证信息失败: {exc}")

    emit_event(
        {
            "event": "auth.login.completed",
            "target": "auth",
            "status": "completed",
            "message": "登录成功" if is_valid else "登录成功，认证状态待校验",
            "progressCurrent": 3,
            "progressTotal": 3,
            "progressUnit": "step",
        }
    )
    emit_payload({"ok": True})


def cmd_auth_logout() -> None:
    from yutto.auth import default_auth_file, remove_auth

    def emit_payload(payload: dict[str, Any]) -> None:
        print(json.dumps({"kind": "payload", "payload": payload}, ensure_ascii=False), flush=True)

    auth_profile = "default"
    auth_file = default_auth_file()

    try:
        removed = remove_auth(auth_file, auth_profile)
    except Exception as exc:
        emit_payload({"ok": False, "error": f"退出登录失败: {exc}"})
        sys.exit(1)

    message = (
        f"已退出登录并移除认证信息：{auth_file}（profile: {auth_profile}）"
        if removed
        else f"未找到可移除的认证信息，无需退出：{auth_file}（profile: {auth_profile}）"
    )
    emit_payload({"ok": True, "removed": removed, "message": message})


def main() -> None:
    parser = argparse.ArgumentParser(prog="uiya.cli")
    subparsers = parser.add_subparsers(dest="command")

    subparsers.add_parser("inspect-runtime")

    convert_wav_parser = subparsers.add_parser("convert-wav")
    convert_wav_parser.add_argument("--dir", default=None)

    fetch_cover_parser = subparsers.add_parser("fetch-cover")
    fetch_cover_parser.add_argument("url")

    save_parser = subparsers.add_parser("save-settings")
    save_parser.add_argument("--ffmpeg-path", default="ffmpeg")
    save_parser.add_argument("--no-proxy", default="false")
    save_parser.add_argument("--download-dir", default=None)
    save_parser.add_argument("--fetch-workers", type=int, default=None)

    subparsers.add_parser("auth-login")
    subparsers.add_parser("auth-logout")

    args = parser.parse_args()

    if args.command == "inspect-runtime":
        cmd_inspect_runtime()
    elif args.command == "convert-wav":
        cmd_convert_wav(args.dir)
    elif args.command == "fetch-cover":
        cmd_fetch_cover(args.url)
    elif args.command == "save-settings":
        cmd_save_settings(args.ffmpeg_path, args.no_proxy.lower() == "true", args.download_dir, args.fetch_workers)
    elif args.command == "auth-login":
        cmd_auth_login()
    elif args.command == "auth-logout":
        cmd_auth_logout()
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
