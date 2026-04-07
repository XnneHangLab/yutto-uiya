"""
uiya CLI – entry point called by the Tauri Rust layer.

Commands:
  inspect-runtime   Return runtime info as a JSON PythonEnvelope (kind=payload).
  download <target> Run a yutto download job, emitting JSON events to stdout.
"""
from __future__ import annotations

import argparse
import json
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
    Placeholder: Tauri will call `uiya.cli download <url>`.
    Real implementation will build the yutto command and stream its output
    as JSON events to stdout so Rust can forward them to the frontend.
    """
    # TODO: build yutto command from target + config, stream output as events
    event = {
        "kind": "event",
        "payload": {
            "event": "download.failed",
            "target": target,
            "status": "failed",
            "message": "download command not yet implemented",
            "progressCurrent": 0,
            "progressTotal": 1,
            "progressUnit": "stage",
        },
    }
    print(json.dumps(event, ensure_ascii=False), flush=True)
    sys.exit(1)


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
