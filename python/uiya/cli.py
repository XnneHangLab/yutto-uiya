"""
uiya CLI – entry point called by the Tauri Rust layer.

Commands:
  inspect-runtime   Return runtime info as a JSON PythonEnvelope (kind=payload).
  download <target> Run a yutto download job, emitting JSON events to stdout.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys


def cmd_inspect_runtime() -> None:
    from uiya.utils.config import UiyaSetting, load_settings_file

    settings = load_settings_file("uiya.toml", UiyaSetting)
    payload = {
        "managedPaths": [
            {"key": "workspace", "path": "."},
            {"key": "downloads", "path": str(settings.download_dir)},
            {"key": "logs", "path": "./logs"},
        ],
        "downloadDir": str(settings.download_dir),
        "sessData": bool(settings.SESS_DATA),
        "ffmpegPath": settings.ffmpeg_path,
    }
    print(json.dumps({"kind": "payload", "payload": payload}, ensure_ascii=False), flush=True)


def cmd_download(target: str) -> None:
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
        search_for_settings_file,
        write_settings_file,
    )

    def emit_event(payload: dict) -> None:
        print(json.dumps({"kind": "event", "payload": payload}, ensure_ascii=False), flush=True)

    def fail(message: str, current: int = 0) -> None:
        emit_event({
            "event": "download.failed",
            "target": target,
            "status": "failed",
            "message": message,
            "progressCurrent": current,
            "progressTotal": 3,
            "progressUnit": "stage",
        })
        sys.exit(1)

    # ── 1. load uiya.toml ────────────────────────────────────────────────
    try:
        settings = load_settings_file("uiya.toml", UiyaSetting)
    except Exception as exc:
        fail(f"配置加载失败: {exc}")

    # ── 2. write a fresh yutto.toml with runtime-resolved values ─────────
    try:
        basic = YuttoBasicSetting(
            num_workers=8,
            video_quality=80,   # 1080P 高清, yutto falls back if unavailable
            audio_quality=30280,  # 320kbps
            sessdata=settings.SESS_DATA,
            vip_strict=settings.vip_strict == "open",
            login_strict=settings.login_strict == "open",
            dir=str(settings.download_dir),
        )
        resource = YuttoResourceSettings()  # video+audio+danmaku+subtitle, no metadata/cover
        yutto_cfg = YuttoSettings(basic=basic, resource=resource)
        write_settings_file("yutto.toml", yutto_cfg)
        yutto_toml = search_for_settings_file("yutto.toml")
    except Exception as exc:
        fail(f"配置写入失败: {exc}")

    # ── 3. assemble yutto command ─────────────────────────────────────────
    command: list[str] = ["uv", "run", "--no-sync", "yutto", target, "--no-color"]
    if yutto_toml:
        command += ["--config", str(yutto_toml)]
    # UIYA_FFMPEG_PATH env var (set by Rust) takes priority over uiya.toml value
    ffmpeg_path = (os.environ.get("UIYA_FFMPEG_PATH") or settings.ffmpeg_path or "").strip()
    if ffmpeg_path and ffmpeg_path != "ffmpeg":
        command += ["--ffmpeg-path", ffmpeg_path]
    if settings.debug_mode == "open":
        command.append("--debug")
    if settings.custom_proxy_pool and settings.proxy_pool:
        command += ["--proxy", settings.proxy_pool]

    # ── 4. spawn and stream ───────────────────────────────────────────────
    emit_event({
        "event": "download.started",
        "target": target,
        "status": "downloading",
        "message": "开始下载",
        "progressCurrent": 1,
        "progressTotal": 3,
        "progressUnit": "stage",
    })

    try:
        proc = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            encoding="utf-8",
            errors="replace",
        )
    except Exception as exc:
        fail(f"启动下载进程失败: {exc}", current=1)

    assert proc.stdout is not None
    for raw_line in proc.stdout:
        line = raw_line.rstrip("\r\n")
        if line.strip():
            print(line, flush=True)  # forwarded as runtime:raw-log by Rust

    returncode = proc.wait()

    if returncode == 0:
        emit_event({
            "event": "download.completed",
            "target": target,
            "status": "completed",
            "message": "下载完成",
            "progressCurrent": 3,
            "progressTotal": 3,
            "progressUnit": "stage",
        })
    else:
        fail(f"下载失败，退出码 {returncode}", current=3)


def main() -> None:
    parser = argparse.ArgumentParser(prog="uiya.cli")
    subparsers = parser.add_subparsers(dest="command")

    subparsers.add_parser("inspect-runtime")

    dl_parser = subparsers.add_parser("download")
    dl_parser.add_argument("target")

    args = parser.parse_args()

    if args.command == "inspect-runtime":
        cmd_inspect_runtime()
    elif args.command == "download":
        cmd_download(args.target)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
