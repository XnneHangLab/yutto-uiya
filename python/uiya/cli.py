"""
uiya CLI – entry point called by the Tauri Rust layer.

Commands:
  inspect-runtime   Return runtime info as a JSON PythonEnvelope (kind=payload).
  download <target> Run a yutto download job, emitting JSON events to stdout.
  parse <target>    Run yutto --skip-download to enumerate playlist items + available quality tiers.
  save-settings     Persist settings to uiya.toml.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import subprocess
import sys
import urllib.request
from typing import TYPE_CHECKING, Any, NoReturn, cast

if TYPE_CHECKING:
    import pathlib
    from collections.abc import Callable

_BILIBILI_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.bilibili.com",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9",
}


def _build_yutto_command(
    target: str,
    *,
    config_path: str | None = None,
    ffmpeg_path: str = "",
    debug: bool = False,
    no_proxy: bool = False,
    proxy_pool: str = "",
    select_index: int | None = None,
    output_dir: str | None = None,
    audio_format: str | None = None,
) -> list[str]:
    command: list[str] = [sys.executable, "-m", "yutto", target, "--no-color"]

    if select_index is not None:
        command += ["-b", "-p", str(select_index)]

    if output_dir:
        command += ["--dir", output_dir]
    if config_path:
        command += ["--config", config_path]
    if ffmpeg_path and ffmpeg_path != "ffmpeg":
        command += ["--ffmpeg-path", ffmpeg_path]
    if debug:
        command.append("--debug")
    if no_proxy:
        command += ["--proxy", "no"]
    elif proxy_pool:
        command += ["--proxy", proxy_pool]

    if audio_format and audio_format not in ("infer", "wav"):
        command += ["--output-format-audio-only", audio_format]

    return command


def _fetch_image_as_data_url(url: str) -> str:
    """Download an image with Bilibili referer and return a base64 data URL."""
    try:
        req = urllib.request.Request(
            url,
            headers={
                **_BILIBILI_HEADERS,
                "Referer": "https://www.bilibili.com",
            },
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            img_bytes = resp.read()
            mime = resp.headers.get_content_type() or "image/jpeg"
        return f"data:{mime};base64,{base64.b64encode(img_bytes).decode()}"
    except Exception:
        return ""


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


def cmd_download(
    target: str,
    require_video: bool = True,
    require_audio: bool = True,
    require_cover: bool = False,
    require_subtitle: bool = False,
    require_danmaku: bool = False,
    video_quality: int = 127,
    audio_quality: int = 30280,
    select_index: int | None = None,
    dir_override: str | None = None,
    audio_format: str | None = None,
) -> None:
    """
    Build and run a yutto download job for *target* (a BiliBili URL).

    Structured JSON PythonEnvelope events are emitted to stdout so the Rust
    layer can forward them as Tauri events.  Raw yutto output lines (non-JSON)
    are also written to stdout so Rust passes them through as runtime:raw-log.
    """
    from uiya._dataclass import YuttoBasicSetting, YuttoResourceSettings, YuttoSettings
    from uiya.utils.config import (
        UiyaSetting,
        load_settings_file,
        resolve_download_dir,
        search_for_settings_file,
        write_settings_file,
    )

    def emit_event(payload: dict[str, Any]) -> None:
        print(json.dumps({"kind": "event", "payload": payload}, ensure_ascii=False), flush=True)

    def fail(message: str, current: int = 0) -> NoReturn:
        emit_event(
            {
                "event": "download.failed",
                "target": target,
                "status": "failed",
                "message": message,
                "progressCurrent": current,
                "progressTotal": 3,
                "progressUnit": "stage",
            }
        )
        sys.exit(1)

    # ── 1. load uiya.toml ────────────────────────────────────────────────
    try:
        settings = load_settings_file("uiya.toml", UiyaSetting)
    except Exception as exc:
        fail(f"配置加载失败: {exc}")

    # ── 2. write a fresh yutto.toml with runtime-resolved values ─────────
    try:
        dl_dir = resolve_download_dir(settings)
        if dir_override:
            dl_dir = dl_dir / dir_override
        basic = YuttoBasicSetting(
            num_workers=8,
            fetch_workers=settings.fetch_workers,
            video_quality=video_quality,
            audio_quality=audio_quality,
            sessdata=settings.SESS_DATA,
            vip_strict=settings.vip_strict == "open",
            login_strict=settings.login_strict == "open",
            dir=str(dl_dir),
        )
        resource = YuttoResourceSettings(
            require_video=require_video,
            require_audio=require_audio,
            require_danmaku=require_danmaku,
            require_subtitle=require_subtitle,
            require_metadata=False,
            require_cover=require_cover,
            save_cover=require_cover,
        )
        yutto_cfg = YuttoSettings(basic=basic, resource=resource)
        write_settings_file("yutto.toml", yutto_cfg)
        yutto_toml = search_for_settings_file("yutto.toml")
    except Exception as exc:
        fail(f"配置写入失败: {exc}")

    # ── 3. assemble yutto command ─────────────────────────────────────────
    _env_ffmpeg = os.environ.get("UIYA_FFMPEG_PATH", "").strip()
    ffmpeg_path = (_env_ffmpeg if _env_ffmpeg and _env_ffmpeg != "ffmpeg" else (settings.ffmpeg_path or "")).strip()
    command = _build_yutto_command(
        target,
        config_path=str(yutto_toml) if yutto_toml else None,
        ffmpeg_path=ffmpeg_path,
        debug=settings.debug_mode == "open",
        no_proxy=settings.no_proxy,
        proxy_pool=settings.proxy_pool if settings.custom_proxy_pool else "",
        select_index=select_index,
        audio_format=audio_format,
    )

    # ── 4. spawn and stream ───────────────────────────────────────────────
    emit_event(
        {
            "event": "download.started",
            "target": target,
            "status": "downloading",
            "message": "开始下载",
            "progressCurrent": 1,
            "progressTotal": 3,
            "progressUnit": "stage",
        }
    )

    try:
        proc = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            # Binary mode: universal-newlines off, \r preserved for progress detection
        )
    except Exception as exc:
        fail(f"启动下载进程失败: {exc}", current=1)

    assert proc.stdout is not None
    # Read in small chunks instead of line-by-line so that yutto's \r-delimited
    # progress frames reach Rust in real time (the \n-split iterator blocks until
    # the whole line—including all \r overwrites—is flushed by yutto at the end).
    _buf = b""
    while True:
        _chunk = proc.stdout.read(256)
        if not _chunk:
            break
        _buf += _chunk
        # Emit every \r- or \n-terminated segment immediately.
        while True:
            _r = _buf.find(b"\r")
            _n = _buf.find(b"\n")
            if _r == -1 and _n == -1:
                break
            if _r == -1 or (_n != -1 and _n < _r):
                _idx, _is_cr = _n, False
            else:
                _idx, _is_cr = _r, True
            _seg = _buf[:_idx]
            _buf = _buf[_idx + 1 :]
            _visible = _seg.decode("utf-8", errors="replace")
            if _visible.strip():
                _term = b"\r\n" if _is_cr else b"\n"
                sys.stdout.buffer.write(_visible.encode("utf-8") + _term)
                sys.stdout.buffer.flush()
    if _buf.strip():
        sys.stdout.buffer.write(_buf + b"\n")
        sys.stdout.buffer.flush()

    returncode = proc.wait()

    if returncode == 0:
        if audio_format == "wav":
            _convert_audio_to_wav(dl_dir, ffmpeg_path or "ffmpeg", emit_event)
        emit_event(
            {
                "event": "download.completed",
                "target": target,
                "status": "completed",
                "message": "下载完成",
                "progressCurrent": 3,
                "progressTotal": 3,
                "progressUnit": "stage",
            }
        )
    else:
        fail(f"下载失败，退出码 {returncode}", current=3)


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


def cmd_fetch_meta(url: str) -> None:
    """
    Fetch video metadata from Bilibili API for a single video URL.
    Emits a JSON payload with cover (as base64 data URL), title, description, uploader, etc.
    """
    import base64

    import httpx

    _headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.bilibili.com",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9",
    }

    def emit_payload(payload: dict[str, Any]) -> None:
        print(json.dumps({"kind": "payload", "payload": payload}, ensure_ascii=False), flush=True)

    bvid_m = re.search(r"(BV[1-9A-HJ-NP-Za-km-z]{10})", url)
    if not bvid_m:
        emit_payload({"error": "无法从 URL 中提取 BV 号"})
        return
    bvid = bvid_m.group(1)
    api_url = f"https://api.bilibili.com/x/web-interface/view?bvid={bvid}"
    try:
        with httpx.Client(timeout=10, http2=True, headers=_headers) as client:
            data = client.get(api_url).raise_for_status().json()
    except Exception as exc:
        emit_payload({"error": f"请求失败: {exc}"})
        return
    if data.get("code") != 0:
        emit_payload({"error": f"API 错误: {data.get('message')}"})
        return
    d: dict[str, Any] = data["data"]
    owner: dict[str, Any] = d.get("owner") or {}
    stat: dict[str, Any] = d.get("stat") or {}

    # Fetch cover image locally and encode as base64 data URL to bypass hotlink protection
    cover_data_url = ""
    pic_url = d.get("pic", "")
    if pic_url:
        try:
            with httpx.Client(timeout=10, http2=True, headers=_headers) as client:
                img_resp = client.get(pic_url).raise_for_status()
                img_bytes = img_resp.content
                mime = img_resp.headers.get("content-type", "image/jpeg").split(";")[0]
            cover_data_url = f"data:{mime};base64,{base64.b64encode(img_bytes).decode()}"
        except Exception:
            pass  # fall back to empty string; frontend will skip the image

    emit_payload(
        {
            "title": d.get("title", ""),
            "cover": cover_data_url,
            "description": d.get("desc", ""),
            "uploader": owner.get("name", ""),
            "pubdate": d.get("pubdate", 0),
            "duration": d.get("duration", 0),
            "view": stat.get("view", 0),
            "like": stat.get("like", 0),
        }
    )


def cmd_fetch_cover(url: str) -> None:
    """
    Download a single cover image and emit it as a base64 data URL.
    Called on demand when the user opens a detail panel.
    """

    def emit_payload(payload: dict[str, Any]) -> None:
        print(json.dumps({"kind": "payload", "payload": payload}, ensure_ascii=False), flush=True)

    data_url = _fetch_image_as_data_url(url)
    if data_url:
        emit_payload({"dataUrl": data_url})
    else:
        emit_payload({"error": "封面图片加载失败"})


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

    dl_parser = subparsers.add_parser("download")
    dl_parser.add_argument("target")
    dl_parser.add_argument("--require-video", default="true")
    dl_parser.add_argument("--require-audio", default="true")
    dl_parser.add_argument("--require-cover", default="false")
    dl_parser.add_argument("--require-subtitle", default="false")
    dl_parser.add_argument("--require-danmaku", default="false")
    dl_parser.add_argument("--video-quality", type=int, default=127)
    dl_parser.add_argument("--audio-quality", type=int, default=30280)
    dl_parser.add_argument("--select-index", type=int, default=None)
    dl_parser.add_argument("--dir-override", default=None)
    dl_parser.add_argument("--audio-format", default=None)

    fetch_meta_parser = subparsers.add_parser("fetch-meta")
    fetch_meta_parser.add_argument("url")

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
    elif args.command == "download":
        cmd_download(
            args.target,
            require_video=args.require_video.lower() == "true",
            require_audio=args.require_audio.lower() == "true",
            require_cover=args.require_cover.lower() == "true",
            require_subtitle=args.require_subtitle.lower() == "true",
            require_danmaku=args.require_danmaku.lower() == "true",
            video_quality=args.video_quality,
            audio_quality=args.audio_quality,
            select_index=args.select_index,
            dir_override=args.dir_override,
            audio_format=args.audio_format,
        )
    elif args.command == "fetch-meta":
        cmd_fetch_meta(args.url)
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
