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
import json
import os
import subprocess
import sys


def _video_quality_code(label: str) -> int | None:
    s = label.strip()
    if "8K" in s: return 127
    if "杜比视界" in s: return 126
    if "HDR" in s: return 125
    if "4K" in s: return 120
    if "1080P 60" in s: return 116
    if "1080P 高码率" in s: return 112
    if "1080P" in s: return 80
    if "720P 60" in s: return 74
    if "720P" in s: return 64
    if "480P" in s: return 32
    if "360P" in s: return 16
    return None


def _audio_quality_code(label: str) -> int | None:
    s = label.strip()
    if "Hi-Res" in s: return 30251
    if "杜比音效" in s: return 30255
    if "杜比全景声" in s: return 30250
    if "320" in s: return 30280
    if "128" in s: return 30232
    if "64" in s: return 30216
    return None


def cmd_inspect_runtime() -> None:
    from uiya.utils.config import UiyaSetting, load_settings_file

    settings = load_settings_file("uiya.toml", UiyaSetting)
    import pathlib as _pathlib
    payload = {
        "managedPaths": [
            {"key": "workspace", "path": "."},
            {"key": "downloads", "path": str(settings.download_dir)},
            {"key": "logs", "path": "./logs"},
        ],
        "downloadDir": _pathlib.Path(settings.download_dir).resolve().as_posix(),
        "sessData": bool(settings.SESS_DATA),
        "ffmpegPath": settings.ffmpeg_path,
        "noProxy": settings.no_proxy,
    }
    print(json.dumps({"kind": "payload", "payload": payload}, ensure_ascii=False), flush=True)


def cmd_download(
    target: str,
    require_video: bool = True,
    require_audio: bool = True,
    require_cover: bool = False,
    video_quality: int = 127,
    audio_quality: int = 30280,
    select_index: int | None = None,
    dir_override: str | None = None,
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
        import pathlib
        dl_dir = pathlib.Path(settings.download_dir) / dir_override if dir_override else settings.download_dir
        basic = YuttoBasicSetting(
            num_workers=8,
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
            require_danmaku=True,
            require_subtitle=True,
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
    command: list[str] = ["uv", "run", "--no-sync", "yutto", target, "--no-color"]
    if select_index is not None:
        # Batch mode with specific page index.
        command += ["-b", "-p", str(select_index)]
    if yutto_toml:
        command += ["--config", str(yutto_toml)]
    # UIYA_FFMPEG_PATH env var (set by Rust) takes priority, but only when it
    # is a real path — the Rust default is literally "ffmpeg" which is no more
    # specific than the toml default, so fall back to settings in that case.
    _env_ffmpeg = os.environ.get("UIYA_FFMPEG_PATH", "").strip()
    ffmpeg_path = (_env_ffmpeg if _env_ffmpeg and _env_ffmpeg != "ffmpeg" else (settings.ffmpeg_path or "")).strip()
    if ffmpeg_path and ffmpeg_path != "ffmpeg":
        command += ["--ffmpeg-path", ffmpeg_path]
    if settings.debug_mode == "open":
        command.append("--debug")
    if settings.no_proxy:
        command += ["--proxy", "no"]
    elif settings.custom_proxy_pool and settings.proxy_pool:
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
            _r = _buf.find(b'\r')
            _n = _buf.find(b'\n')
            if _r == -1 and _n == -1:
                break
            if _r == -1 or (_n != -1 and _n < _r):
                _idx, _is_cr = _n, False
            else:
                _idx, _is_cr = _r, True
            _seg = _buf[:_idx]
            _buf = _buf[_idx + 1:]
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


def cmd_parse(target: str) -> None:
    """
    Run yutto with --skip-download to enumerate videos in *target* without
    downloading.  Prints each raw yutto line to stdout (forwarded as
    runtime:raw-log by Rust) then emits a final JSON payload with the
    parsed item list and available quality tiers.
    """
    import re
    import shlex

    from uiya._dataclass import YuttoBasicSetting, YuttoResourceSettings, YuttoSettings
    from uiya.utils.config import (
        UiyaSetting,
        load_settings_file,
        search_for_settings_file,
        write_settings_file,
    )

    def emit_payload(payload: dict) -> None:
        print(json.dumps({"kind": "payload", "payload": payload}, ensure_ascii=False), flush=True)

    try:
        settings = load_settings_file("uiya.toml", UiyaSetting)
    except Exception as exc:
        emit_payload({"items": [], "videoQualities": [], "audioQualities": [], "error": f"配置加载失败: {exc}"})
        sys.exit(1)

    try:
        basic = YuttoBasicSetting(
            num_workers=8,
            video_quality=127,
            audio_quality=30280,
            sessdata=settings.SESS_DATA,
            vip_strict=settings.vip_strict == "open",
            login_strict=settings.login_strict == "open",
            dir="./downloads",
        )
        resource = YuttoResourceSettings(require_cover=True)
        yutto_cfg = YuttoSettings(basic=basic, resource=resource)
        write_settings_file("yutto.toml", yutto_cfg)
        yutto_toml = search_for_settings_file("yutto.toml")
    except Exception as exc:
        emit_payload({"items": [], "videoQualities": [], "audioQualities": [], "error": f"配置写入失败: {exc}"})
        sys.exit(1)

    command: list[str] = [
        "uv", "run", "--no-sync", "yutto", target,
        "--no-color", "--skip-download", "--no-progress", "-b",
    ]
    if yutto_toml:
        command += ["--config", str(yutto_toml)]
    _env_ffmpeg = os.environ.get("UIYA_FFMPEG_PATH", "").strip()
    ffmpeg_path = (_env_ffmpeg if _env_ffmpeg and _env_ffmpeg != "ffmpeg" else (settings.ffmpeg_path or "")).strip()
    if ffmpeg_path and ffmpeg_path != "ffmpeg":
        command += ["--ffmpeg-path", ffmpeg_path]
    if settings.debug_mode == "open":
        command.append("--debug")
    if settings.no_proxy:
        command += ["--proxy", "no"]
    elif settings.custom_proxy_pool and settings.proxy_pool:
        command += ["--proxy", settings.proxy_pool]

    title_re = re.compile(r'\bINFO\b.*开始处理视频\s+(.+)')
    link_re = re.compile(r'\bLINK\b\s+(https?://\S+)')
    video_quality_re = re.compile(r'视频质量.*?<(.+?)>')
    audio_quality_re = re.compile(r'音频质量.*?<(.+?)>')

    print(f"[run] {shlex.join(command)}", flush=True)

    # Snapshot all directories under downloads/ BEFORE running yutto.
    # We diff against the post-parse state to find newly-created dirs.
    # Unlike mtime, this works even when the collection already exists:
    # on re-parse the dirs are already present in `before_dirs` so they
    # won't appear in the diff, and we fall back to title matching instead.
    import pathlib
    downloads_path = pathlib.Path("./downloads")
    downloads_path.mkdir(parents=True, exist_ok=True)

    def _all_dirs(base: pathlib.Path) -> set[pathlib.Path]:
        result: set[pathlib.Path] = set()
        for root, dirs, _files in os.walk(base):
            for d in dirs:
                result.add((pathlib.Path(root) / d).relative_to(base))
        return result

    before_dirs = _all_dirs(downloads_path)

    items: list[dict] = []
    current_title: str | None = None
    # ordered dicts: code → label, deduplicating across multiple videos in a playlist
    seen_video_qualities: dict[int, str] = {}
    seen_audio_qualities: dict[int, str] = {}

    try:
        proc = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            encoding="utf-8",
            errors="replace",
        )
    except Exception as exc:
        emit_payload({"items": [], "videoQualities": [], "audioQualities": [], "error": f"启动解析进程失败: {exc}"})
        sys.exit(1)

    assert proc.stdout is not None
    for raw_line in proc.stdout:
        line = raw_line.rstrip("\r\n")
        if line.strip():
            print(line, flush=True)  # forwarded as runtime:raw-log
        m_title = title_re.search(line)
        if m_title:
            current_title = m_title.group(1).strip()
        m_link = link_re.search(line)
        if m_link and current_title is not None:
            items.append({
                "index": len(items) + 1,
                "title": current_title,
                "url": m_link.group(1),
            })
            current_title = None
        m_vq = video_quality_re.search(line)
        if m_vq:
            label = m_vq.group(1).strip()
            code = _video_quality_code(label)
            if code is not None and code not in seen_video_qualities:
                seen_video_qualities[code] = label
        m_aq = audio_quality_re.search(line)
        if m_aq:
            label = m_aq.group(1).strip()
            code = _audio_quality_code(label)
            if code is not None and code not in seen_audio_qualities:
                seen_audio_qualities[code] = label

    proc.wait()

    # Diff against before-snapshot to find directories created during this parse.
    new_dirs = _all_dirs(downloads_path) - before_dirs

    # Re-parse fallback: if no new dirs were created (all already existed), try
    # to locate per-video dirs by matching the repaired item titles against
    # directory basenames.  This covers 收藏夹 re-parses where each video has
    # its own subdir named after the video title (after repair_filename).
    # For 合集 (where the video title is used as a file stem, not a dir name)
    # this search will simply return nothing, which is correct — all items in a
    # 合集 share a single output directory detected via collection_dir.
    if not new_dirs and len(items) > 1:
        try:
            from yutto.path_templates import repair_filename as _repair_fn2
        except ImportError:
            def _repair_fn2(s: str) -> str:  # type: ignore[misc]
                return s
        import re as _re2
        repaired_titles = set()
        for item in items:
            r = _repair_fn2(item["title"])
            repaired_titles.add(r)
            repaired_titles.add(_re2.sub(r'_p\d+$', '', r))
        for root, dirs, _files in os.walk(downloads_path):
            root_path = pathlib.Path(root)
            for d in dirs:
                if d in repaired_titles:
                    new_dirs.add((root_path / d).relative_to(downloads_path))
    # Use only leaf dirs (those that are not proper ancestors of other new dirs)
    # so that commonpath gives the deepest shared parent, not the top-level root.
    # E.g. for 收藏夹: new_dirs = {收藏夹, 收藏夹/dataset, 收藏夹/dataset/v1, ...}
    # leaf_dirs = {收藏夹/dataset/v1, ...} → commonpath = 收藏夹/dataset ✓
    leaf_dirs = {d for d in new_dirs if not any(
        d2 != d and d2.is_relative_to(d) for d2 in new_dirs
    )}
    dirs_for_common = leaf_dirs or new_dirs
    # Only set collection_dir for multi-video results; for single videos the
    # detected dir would be the video title itself which would cause double-
    # nesting if used as dir_override.
    if len(items) > 1 and len(dirs_for_common) == 1:
        collection_dir = next(iter(dirs_for_common)).as_posix()
    elif len(items) > 1 and len(dirs_for_common) > 1:
        common = pathlib.Path(os.path.commonpath([str(p) for p in dirs_for_common]))
        collection_dir = common.as_posix() if str(common) not in (".", "") else ""
    else:
        collection_dir = ""

    # Match each parse item to its per-video leaf dir by title.
    # Yutto sanitizes the title with repair_filename before using it as a dir/file
    # name (e.g. "/" → "／", ":" → "：", "..." → "……"). Apply the same transform.
    # The logged filename is repair_filename(name), where name may carry a page
    # suffix like "_p1". The directory basename is repair_filename(title) without
    # the suffix. Strip "_pN" from the end so the lookup still matches.
    import re as _re
    try:
        from yutto.path_templates import repair_filename as _repair_filename
    except ImportError:
        def _repair_filename(s: str) -> str:  # type: ignore[misc]
            return s
    dir_by_basename: dict[str, str] = {
        leaf.parts[-1]: leaf.as_posix() for leaf in leaf_dirs if leaf.parts
    }
    for item in items:
        repaired = _repair_filename(item["title"])
        repaired_no_page = _re.sub(r'_p\d+$', '', repaired)
        item["dir"] = (
            dir_by_basename.get(repaired)
            or dir_by_basename.get(repaired_no_page, collection_dir)
        )

    # Sort highest code first (best quality first)
    video_qualities = [{"label": label, "code": code}
                       for code, label in sorted(seen_video_qualities.items(), reverse=True)]
    audio_qualities = [{"label": label, "code": code}
                       for code, label in sorted(seen_audio_qualities.items(), reverse=True)]

    emit_payload({"url": target, "dir": collection_dir, "items": items, "videoQualities": video_qualities, "audioQualities": audio_qualities})


def cmd_fetch_meta(url: str) -> None:
    """
    Fetch video metadata from Bilibili API for a single video URL.
    Emits a JSON payload with cover (as base64 data URL), title, description, uploader, etc.
    """
    import base64
    import re
    import urllib.request

    _headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://www.bilibili.com",
    }

    def emit_payload(payload: dict) -> None:
        print(json.dumps({"kind": "payload", "payload": payload}, ensure_ascii=False), flush=True)

    bvid_m = re.search(r'(BV[1-9A-HJ-NP-Za-km-z]{10})', url)
    if not bvid_m:
        emit_payload({"error": "无法从 URL 中提取 BV 号"})
        return
    bvid = bvid_m.group(1)
    api_url = f"https://api.bilibili.com/x/web-interface/view?bvid={bvid}"
    try:
        req = urllib.request.Request(api_url, headers=_headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        emit_payload({"error": f"请求失败: {exc}"})
        return
    if data.get("code") != 0:
        emit_payload({"error": f"API 错误: {data.get('message')}"})
        return
    d = data["data"]
    owner = d.get("owner") or {}
    stat = d.get("stat") or {}

    # Fetch cover image locally and encode as base64 data URL to bypass hotlink protection
    cover_data_url = ""
    pic_url = d.get("pic", "")
    if pic_url:
        try:
            img_req = urllib.request.Request(pic_url, headers=_headers)
            with urllib.request.urlopen(img_req, timeout=10) as img_resp:
                img_bytes = img_resp.read()
                mime = img_resp.headers.get_content_type() or "image/jpeg"
            cover_data_url = f"data:{mime};base64,{base64.b64encode(img_bytes).decode()}"
        except Exception:
            pass  # fall back to empty string; frontend will skip the image

    emit_payload({
        "title": d.get("title", ""),
        "cover": cover_data_url,
        "description": d.get("desc", ""),
        "uploader": owner.get("name", ""),
        "pubdate": d.get("pubdate", 0),
        "duration": d.get("duration", 0),
        "view": stat.get("view", 0),
        "like": stat.get("like", 0),
    })


def cmd_save_settings(ffmpeg_path: str, no_proxy: bool) -> None:
    """
    Persist updated settings (currently ffmpeg_path and no_proxy) to uiya.toml.
    """
    from uiya.utils.config import UiyaSetting, load_settings_file, write_settings_file

    try:
        settings = load_settings_file("uiya.toml", UiyaSetting)
        settings.ffmpeg_path = ffmpeg_path
        settings.no_proxy = no_proxy
        write_settings_file("uiya.toml", settings)
    except Exception as exc:
        print(json.dumps({"kind": "payload", "payload": {"ok": False, "error": str(exc)}}, ensure_ascii=False), flush=True)
        sys.exit(1)
    print(json.dumps({"kind": "payload", "payload": {"ok": True}}, ensure_ascii=False), flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(prog="uiya.cli")
    subparsers = parser.add_subparsers(dest="command")

    subparsers.add_parser("inspect-runtime")

    dl_parser = subparsers.add_parser("download")
    dl_parser.add_argument("target")
    dl_parser.add_argument("--require-video", default="true")
    dl_parser.add_argument("--require-audio", default="true")
    dl_parser.add_argument("--require-cover", default="false")
    dl_parser.add_argument("--video-quality", type=int, default=127)
    dl_parser.add_argument("--audio-quality", type=int, default=30280)
    dl_parser.add_argument("--select-index", type=int, default=None)
    dl_parser.add_argument("--dir-override", default=None)

    parse_parser = subparsers.add_parser("parse")
    parse_parser.add_argument("target")

    fetch_meta_parser = subparsers.add_parser("fetch-meta")
    fetch_meta_parser.add_argument("url")

    save_parser = subparsers.add_parser("save-settings")
    save_parser.add_argument("--ffmpeg-path", default="ffmpeg")
    save_parser.add_argument("--no-proxy", default="false")

    args = parser.parse_args()

    if args.command == "inspect-runtime":
        cmd_inspect_runtime()
    elif args.command == "download":
        cmd_download(
            args.target,
            require_video=args.require_video.lower() == "true",
            require_audio=args.require_audio.lower() == "true",
            require_cover=args.require_cover.lower() == "true",
            video_quality=args.video_quality,
            audio_quality=args.audio_quality,
            select_index=args.select_index,
            dir_override=args.dir_override,
        )
    elif args.command == "parse":
        cmd_parse(args.target)
    elif args.command == "fetch-meta":
        cmd_fetch_meta(args.url)
    elif args.command == "save-settings":
        cmd_save_settings(args.ffmpeg_path, args.no_proxy.lower() == "true")
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
