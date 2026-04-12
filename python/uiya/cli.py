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
import ast
import base64
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request

_BILIBILI_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.bilibili.com",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9",
}

TITLE_RE = re.compile(r"\bINFO\b.*开始处理视频\s+(.+)")
LINK_RE = re.compile(r"\bLINK\b\s+(https?://\S+)")
GROUP_RE = re.compile(r"^\s*列表\s+(.+?)\s*$")
METADATA_RE = re.compile(r"^\s*描述文件\s+(\{.+\})\s*$")
VIDEO_QUALITY_RE = re.compile(r"视频质量.*?<(.+?)>")
AUDIO_QUALITY_RE = re.compile(r"音频质量.*?<(.+?)>")


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


def _build_yutto_command(
    target: str,
    *,
    config_path: str | None = None,
    ffmpeg_path: str = "",
    debug: bool = False,
    no_proxy: bool = False,
    proxy_pool: str = "",
    skip_download: bool = False,
    select_index: int | None = None,
    output_dir: str | None = None,
) -> list[str]:
    command: list[str] = [sys.executable, "-m", "yutto", target, "--no-color"]

    if skip_download:
        command += ["--skip-download", "--no-progress", "-b", "--with-metadata"]
    elif select_index is not None:
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

    return command


def _fetch_image_as_data_url(url: str) -> str:
    """Download an image with Bilibili referer and return a base64 data URL."""
    try:
        req = urllib.request.Request(url, headers={
            **_BILIBILI_HEADERS,
            "Referer": "https://www.bilibili.com",
        })
        with urllib.request.urlopen(req, timeout=10) as resp:
            img_bytes = resp.read()
            mime = resp.headers.get_content_type() or "image/jpeg"
        return f"data:{mime};base64,{base64.b64encode(img_bytes).decode()}"
    except Exception:
        return ""


def _extract_bilibili_video_identity(url: str) -> tuple[str, str] | None:
    if bvid_match := re.search(r"(BV[1-9A-HJ-NP-Za-km-z]{10})", url):
        return ("bvid", bvid_match.group(1))
    if aid_match := re.search(r"/video/av(\d+)", url):
        return ("aid", aid_match.group(1))
    return None


def _fetch_bilibili_view_payload(url: str, sessdata: str = "") -> dict | None:
    identity = _extract_bilibili_video_identity(url)
    if identity is None:
        return None

    key, value = identity
    api_url = f"https://api.bilibili.com/x/web-interface/view?{key}={value}"
    try:
        headers = {**_BILIBILI_HEADERS}
        if sessdata:
            headers["Cookie"] = f"SESSDATA={sessdata}"
        request = urllib.request.Request(api_url, headers=headers)
        with urllib.request.urlopen(request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception:
        return None

    if payload.get("code") != 0:
        return None
    data = payload.get("data")
    return data if isinstance(data, dict) else None


def _is_playlist_page_title(title: str) -> bool:
    return bool(re.match(r"^P\d+[_\s].+", title.strip()))


def _resolve_single_download_title(
    url: str,
    fallback_title: str,
    view_fetcher: callable = _fetch_bilibili_view_payload,
) -> tuple[str, dict | None]:
    if _is_playlist_page_title(fallback_title):
        return fallback_title, None

    payload = view_fetcher(url)
    if not payload:
        return fallback_title, None

    title = str(payload.get("title", "")).strip()
    if not title:
        return fallback_title, None

    return title, payload


def _assign_parse_item_dirs(items: list[dict], collection_dir: str, is_per_video: bool) -> None:
    try:
        from yutto.path_templates import repair_filename as _repair_filename
    except ImportError:
        def _repair_filename(s: str) -> str:  # type: ignore[misc]
            return s

    for item in items:
        if is_per_video:
            raw_title = str(item.get("title", ""))
            subdir = _repair_filename(raw_title)
            item["dir"] = f"{collection_dir}/{subdir}" if collection_dir else subdir
        else:
            item["dir"] = collection_dir


class _ParseContext:
    def __init__(self) -> None:
        self.next_index = 1
        self.current_title: str | None = None
        self.current_group: dict | None = None
        self.pending_item: dict | None = None
        self.items: list[dict] = []
        self.groups: list[dict] = []
        self.seen_video_qualities: dict[int, str] = {}
        self.seen_audio_qualities: dict[int, str] = {}

    def _flush_group(self) -> None:
        if self.current_group and self.current_group["items"]:
            self.groups.append(self.current_group)
        self.current_group = None

    def _complete_pending_item(self) -> dict | None:
        """Finalise pending_item and commit it to items/current_group. Returns it."""
        item = self.pending_item
        if item is None:
            return None
        self.pending_item = None
        if self.current_group is not None and _is_playlist_page_title(item["title"]):
            self.current_group["items"].append(item)
        else:
            self._flush_group()
            self.items.append(item)
        return item

    def consume(self, line: str, view_fetcher: "callable | None" = None) -> dict | None:  # noqa: ARG002
        if m_group := GROUP_RE.search(line):
            self._complete_pending_item()
            self._flush_group()
            self.current_group = {"title": m_group.group(1).strip(), "dir": "", "items": []}
            return None

        if m_title := TITLE_RE.search(line):
            self._complete_pending_item()
            self.current_title = m_title.group(1).strip()
            return None

        if m_link := LINK_RE.search(line):
            if self.current_title is None:
                return None
            self.pending_item = {
                "index": self.next_index,
                "title": self.current_title,
                "url": m_link.group(1),
                "dir": "",
                "uploader": "",
                "description": "",
                "pubdate": 0,
                "duration": 0,
                "cover": "",
                "view": 0,
                "like": 0,
                "tags": [],
            }
            self.next_index += 1
            self.current_title = None
            return None  # deferred until 描述文件

        if m_meta := METADATA_RE.search(line):
            if self.pending_item is not None:
                try:
                    meta = ast.literal_eval(m_meta.group(1))
                except Exception:
                    meta = {}
                pic = str(meta.get("thumb", "")).strip()
                if pic:
                    self.pending_item["cover"] = _fetch_image_as_data_url(pic)
                uploader = ""
                for actor in meta.get("actor", []):
                    if isinstance(actor, dict) and actor.get("role") == "UP主":
                        uploader = str(actor.get("name", ""))
                        break
                self.pending_item["uploader"] = uploader
                self.pending_item["description"] = str(meta.get("plot", ""))
                premiered = meta.get("premiered", 0)
                self.pending_item["pubdate"] = int(premiered) if premiered else 0
                self.pending_item["tags"] = [str(t) for t in meta.get("tag", []) if t]
                return self._complete_pending_item()
            return None

        if m_vq := VIDEO_QUALITY_RE.search(line):
            label = m_vq.group(1).strip()
            code = _video_quality_code(label)
            if code is not None and code not in self.seen_video_qualities:
                self.seen_video_qualities[code] = label
            return None

        if m_aq := AUDIO_QUALITY_RE.search(line):
            label = m_aq.group(1).strip()
            code = _audio_quality_code(label)
            if code is not None and code not in self.seen_audio_qualities:
                self.seen_audio_qualities[code] = label
            return None

        return None

    def finish(self) -> dict:
        self._complete_pending_item()
        self._flush_group()
        return {
            "items": self.items,
            "groups": self.groups,
            "videoQualities": [
                {"label": label, "code": code}
                for code, label in sorted(self.seen_video_qualities.items(), reverse=True)
            ],
            "audioQualities": [
                {"label": label, "code": code}
                for code, label in sorted(self.seen_audio_qualities.items(), reverse=True)
            ],
        }


def _parse_skip_download_lines(lines: list[str], view_fetcher: "callable | None" = None) -> dict:
    context = _ParseContext()
    for line in lines:
        context.consume(line, view_fetcher)
    return context.finish()


def _assign_parse_group_dirs(groups: list[dict], collection_dir: str) -> None:
    try:
        from yutto.path_templates import repair_filename as _repair_filename
    except ImportError:
        def _repair_filename(s: str) -> str:  # type: ignore[misc]
            return s

    for group in groups:
        repaired_title = _repair_filename(str(group.get("title", "")))
        group_dir = f"{collection_dir}/{repaired_title}" if collection_dir else repaired_title
        group["dir"] = group_dir
        for item in group.get("items", []):
            item["dir"] = group_dir


def _leaf_dirs_from_new_dirs(new_dirs: set["pathlib.Path"]) -> set["pathlib.Path"]:
    return {d for d in new_dirs if not any(
        d2 != d and d2.is_relative_to(d) for d2 in new_dirs
    )}


def _build_parse_dir_title_candidates(items: list[dict], groups: list[dict]) -> set[str]:
    try:
        from yutto.path_templates import repair_filename as _repair_filename
    except ImportError:
        def _repair_filename(s: str) -> str:  # type: ignore[misc]
            return s

    candidates = set()
    for item in items:
        raw = str(item.get("title", ""))
        candidates.add(_repair_filename(raw))

    for group in groups:
        candidates.add(_repair_filename(str(group.get("title", ""))))

    return {candidate for candidate in candidates if candidate}


def _infer_collection_dir_from_candidate_dirs(
    new_dirs: set["pathlib.Path"],
    total_items: int,
    candidate_dir_names: set[str],
    leaf_dirs: set["pathlib.Path"] | None = None,
) -> str:
    import pathlib

    if leaf_dirs is None:
        leaf_dirs = _leaf_dirs_from_new_dirs(new_dirs)
    dirs_for_common = leaf_dirs or new_dirs

    if total_items > 1 and candidate_dir_names:
        matched_child_dirs = {d for d in dirs_for_common if d.name in candidate_dir_names}
        if matched_child_dirs:
            common_parent = pathlib.Path(
                os.path.commonpath([str(d.parent) for d in matched_child_dirs])
            )
            return common_parent.as_posix() if str(common_parent) not in (".", "") else ""

    if total_items > 1 and len(dirs_for_common) == 1:
        collection_dir = next(iter(dirs_for_common)).as_posix()
    elif total_items > 1 and len(dirs_for_common) > 1:
        common = pathlib.Path(os.path.commonpath([str(p) for p in dirs_for_common]))
        collection_dir = common.as_posix() if str(common) not in (".", "") else ""
    else:
        collection_dir = ""

    return collection_dir


def _infer_collection_dir_from_new_dirs(
    new_dirs: set["pathlib.Path"],
    total_items: int,
    groups: list[dict],
    leaf_dirs: set["pathlib.Path"] | None = None,
) -> str:
    return _infer_collection_dir_from_candidate_dirs(
        new_dirs,
        total_items,
        _build_parse_dir_title_candidates([], groups),
        leaf_dirs=leaf_dirs,
    )


def _find_existing_dirs_by_titles(
    downloads_path: "pathlib.Path",
    items: list[dict],
    groups: list[dict],
) -> set["pathlib.Path"]:
    import pathlib

    candidate_dir_names = _build_parse_dir_title_candidates(items, groups)

    matched: set[pathlib.Path] = set()
    for root, dirs, _files in os.walk(downloads_path):
        root_path = pathlib.Path(root)
        for d in dirs:
            if d in candidate_dir_names:
                matched.add((root_path / d).relative_to(downloads_path))

    return matched


def _resolve_runtime_proxy(settings) -> str:
    if getattr(settings, "no_proxy", False):
        return "no"
    if getattr(settings, "custom_proxy_pool", False) and getattr(settings, "proxy_pool", ""):
        return settings.proxy_pool
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
        resolve_download_dir,
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
        dl_dir = resolve_download_dir(settings)
        if dir_override:
            dl_dir = dl_dir / dir_override
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
    )

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
    import shlex

    from uiya._dataclass import YuttoBasicSetting, YuttoResourceSettings, YuttoSettings
    from uiya.utils.config import (
        UiyaSetting,
        load_settings_file,
        resolve_download_dir,
        search_for_settings_file,
        write_settings_file,
    )

    def emit_payload(payload: dict) -> None:
        print(json.dumps({"kind": "payload", "payload": payload}, ensure_ascii=False), flush=True)

    def emit_event(payload: dict) -> None:
        print(json.dumps({"kind": "event", "payload": payload}, ensure_ascii=False), flush=True)

    def fail(message: str) -> None:
        emit_event({
            "event": "parse.failed",
            "target": target,
            "status": "failed",
            "message": message,
            "progressCurrent": 0,
            "progressTotal": 0,
            "progressUnit": "item",
        })
        emit_payload({"items": [], "groups": [], "videoQualities": [], "audioQualities": [], "error": message})
        sys.exit(1)

    try:
        settings = load_settings_file("uiya.toml", UiyaSetting)
    except Exception as exc:
        fail(f"配置加载失败: {exc}")

    try:
        basic = YuttoBasicSetting(
            num_workers=8,
            video_quality=127,
            audio_quality=30280,
            sessdata=settings.SESS_DATA,
            vip_strict=settings.vip_strict == "open",
            login_strict=settings.login_strict == "open",
            dir=str(resolve_download_dir(settings)),
        )
        resource = YuttoResourceSettings(require_cover=True)
        yutto_cfg = YuttoSettings(basic=basic, resource=resource)
        write_settings_file("yutto.toml", yutto_cfg)
        yutto_toml = search_for_settings_file("yutto.toml")
    except Exception as exc:
        fail(f"配置写入失败: {exc}")

    _env_ffmpeg = os.environ.get("UIYA_FFMPEG_PATH", "").strip()
    ffmpeg_path = (_env_ffmpeg if _env_ffmpeg and _env_ffmpeg != "ffmpeg" else (settings.ffmpeg_path or "")).strip()
    _parse_tmpdir = tempfile.TemporaryDirectory(prefix="uiya-parse-")
    try:
        command = _build_yutto_command(
            target,
            config_path=str(yutto_toml) if yutto_toml else None,
            ffmpeg_path=ffmpeg_path,
            debug=settings.debug_mode == "open",
            no_proxy=settings.no_proxy,
            proxy_pool=settings.proxy_pool if settings.custom_proxy_pool else "",
            skip_download=True,
            output_dir=_parse_tmpdir.name,
        )

        print(f"[run] {shlex.join(command)}", flush=True)

        # Snapshot all directories under downloads/ BEFORE running yutto.
        # We diff against the post-parse state to find newly-created dirs.
        # Unlike mtime, this works even when the collection already exists:
        # on re-parse the dirs are already present in `before_dirs` so they
        # won't appear in the diff, and we fall back to title matching instead.
        import pathlib
        downloads_path = resolve_download_dir(settings)
        downloads_path.mkdir(parents=True, exist_ok=True)

        def _all_dirs(base: pathlib.Path) -> set[pathlib.Path]:
            result: set[pathlib.Path] = set()
            for root, dirs, _files in os.walk(base):
                for d in dirs:
                    result.add((pathlib.Path(root) / d).relative_to(base))
            return result

        before_dirs = _all_dirs(downloads_path)

        emit_event({
            "event": "parse.started",
            "target": target,
            "status": "parsing",
            "message": "开始解析",
            "progressCurrent": 0,
            "progressTotal": 0,
            "progressUnit": "item",
        })

        context = _ParseContext()

        try:
            proc = subprocess.Popen(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                encoding="utf-8",
                errors="replace",
            )
        except Exception as exc:
            fail(f"启动解析进程失败: {exc}")

        assert proc.stdout is not None
        for raw_line in proc.stdout:
            line = raw_line.rstrip("\r\n")
            if line.strip():
                print(line, flush=True)  # forwarded as runtime:raw-log
            item = context.consume(line)
            if item is not None:
                emit_event({
                    "event": "parse.item",
                    "target": target,
                    "status": "parsing",
                    "message": f"解析到视频: {item['title']}",
                    "progressCurrent": item["index"],
                    "progressTotal": 0,
                    "progressUnit": "item",
                    "parseItem": item,
                })

        returncode = proc.wait()
    finally:
        _parse_tmpdir.cleanup()

    if returncode != 0:
        fail(f"解析失败，退出码 {returncode}")

    parsed = context.finish()
    items = parsed["items"]
    groups = parsed["groups"]
    video_qualities = parsed["videoQualities"]
    audio_qualities = parsed["audioQualities"]

    all_items: list[dict] = items[:]
    for group in groups:
        all_items.extend(group.get("items", []))
    total_items = len(all_items)

    # Diff against before-snapshot to find directories created during this parse.
    new_dirs = _all_dirs(downloads_path) - before_dirs

    # Re-parse fallback: if no new dirs were created (all already existed), try
    # to locate per-video dirs by matching the repaired item titles against
    # directory basenames.  This covers 收藏夹 re-parses where each video has
    # its own subdir named after the video title (after repair_filename).
    # For 合集 (where the video title is used as a file stem, not a dir name)
    # this search will simply return nothing, which is correct — all items in a
    # 合集 share a single output directory detected via collection_dir.
    if not new_dirs and total_items > 1:
        new_dirs = _find_existing_dirs_by_titles(downloads_path, all_items, groups)
    # Use only leaf dirs (those that are not proper ancestors of other new dirs)
    # so that commonpath gives the deepest shared parent, not the top-level root.
    # E.g. for 收藏夹: new_dirs = {收藏夹, 收藏夹/dataset, 收藏夹/dataset/v1, ...}
    # leaf_dirs = {收藏夹/dataset/v1, ...} → commonpath = 收藏夹/dataset ✓
    leaf_dirs = _leaf_dirs_from_new_dirs(new_dirs)
    # Only set collection_dir for multi-video results; for single videos the
    # detected dir would be the video title itself which would cause double-
    # nesting if used as dir_override.
    candidate_dir_names = _build_parse_dir_title_candidates(all_items, groups)
    collection_dir = _infer_collection_dir_from_candidate_dirs(
        new_dirs,
        total_items,
        candidate_dir_names,
        leaf_dirs=leaf_dirs,
    )

    # Compute per-item dir from path template structure rather than filesystem
    # matching.  For 收藏夹 the template is "{series_title}/{title}/{name}" so each
    # video gets its own subdirectory named after the (repaired) title; leaf_dirs
    # are children of collection_dir → is_per_video = True.  For 合集 the template
    # is "{series_title}/{title}" where {title} is the file stem so all videos land
    # flat in the series dir; the single leaf IS collection_dir → is_per_video = False.
    collection_dir_path = pathlib.Path(collection_dir) if collection_dir else None
    is_per_video = bool(
        collection_dir
        and leaf_dirs
        and not any(d == collection_dir_path for d in leaf_dirs)
    )
    _assign_parse_item_dirs(items, collection_dir, is_per_video)
    _assign_parse_group_dirs(groups, collection_dir)

    emit_event({
        "event": "parse.completed",
        "target": target,
        "status": "completed",
        "message": f"解析完成，共 {total_items} 个视频",
        "progressCurrent": total_items,
        "progressTotal": total_items,
        "progressUnit": "item",
    })

    emit_payload({
        "url": target,
        "dir": collection_dir,
        "items": items,
        "groups": groups,
        "videoQualities": video_qualities,
        "audioQualities": audio_qualities,
    })


def cmd_fetch_meta(url: str) -> None:
    """
    Fetch video metadata from Bilibili API for a single video URL.
    Emits a JSON payload with cover (as base64 data URL), title, description, uploader, etc.
    """
    import base64
    import re

    import httpx

    _headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.bilibili.com",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9",
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
        with httpx.Client(timeout=10, http2=True, headers=_headers) as client:
            data = client.get(api_url).raise_for_status().json()
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
            with httpx.Client(timeout=10, http2=True, headers=_headers) as client:
                img_resp = client.get(pic_url).raise_for_status()
                img_bytes = img_resp.content
                mime = img_resp.headers.get("content-type", "image/jpeg").split(";")[0]
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

    def emit_event(payload: dict) -> None:
        print(json.dumps({"kind": "event", "payload": payload}, ensure_ascii=False), flush=True)

    def emit_payload(payload: dict) -> None:
        print(json.dumps({"kind": "payload", "payload": payload}, ensure_ascii=False), flush=True)

    def fail(message: str) -> None:
        emit_event({
            "event": "auth.login.failed",
            "target": "auth",
            "status": "failed",
            "message": message,
            "progressCurrent": 0,
            "progressTotal": 0,
            "progressUnit": "step",
        })
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

    emit_event({
        "event": "auth.login.started",
        "target": "auth",
        "status": "pending",
        "message": "正在生成二维码",
        "progressCurrent": 0,
        "progressTotal": 3,
        "progressUnit": "step",
    })

    try:
        with create_sync_client(proxy=ctx.proxy, trust_env=ctx.trust_env, timeout=10, verify=True) as client:
            qr_login_url, qr_key = generate_qr_login(client)
            emit_event({
                "event": "auth.login.qr",
                "target": "auth",
                "status": "pending",
                "message": "请使用哔哩哔哩 App 扫码登录",
                "progressCurrent": 1,
                "progressTotal": 3,
                "progressUnit": "step",
                "authQrDataUrl": _build_qr_data_url(qr_login_url),
            })

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

                data_any = payload.get("data")
                if not isinstance(data_any, dict):
                    raise ValueError(f"轮询登录状态失败，返回值异常：{payload}")
                data = data_any
                status = data.get("code")
                if not isinstance(status, int):
                    raise ValueError(f"轮询登录状态失败，缺少状态码：{payload}")

                if status != last_status:
                    if status == QR_STATUS_NOT_SCANNED:
                        emit_event({
                            "event": "auth.login.waiting",
                            "target": "auth",
                            "status": "pending",
                            "message": "二维码待扫描",
                            "progressCurrent": 1,
                            "progressTotal": 3,
                            "progressUnit": "step",
                        })
                    elif status == QR_STATUS_SCANNED:
                        emit_event({
                            "event": "auth.login.scanned",
                            "target": "auth",
                            "status": "pending",
                            "message": "已扫码，请在 App 内确认登录",
                            "progressCurrent": 2,
                            "progressTotal": 3,
                            "progressUnit": "step",
                        })
                    elif status == QR_STATUS_EXPIRED:
                        raise TimeoutError("二维码已过期，请重新登录")
                    last_status = status

                if status == QR_STATUS_CONFIRMED:
                    redirect_url = data.get("url")
                    if not isinstance(redirect_url, str):
                        raise ValueError(f"登录成功但未返回跳转链接：{payload}")
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
        auth = {"SESSDATA": sessdata, "bili_jct": bili_jct}
        is_valid = validate_saved_auth(auth, proxy=ctx.proxy, trust_env=ctx.trust_env)
    except Exception as exc:
        fail(f"写入认证信息失败: {exc}")

    emit_event({
        "event": "auth.login.completed",
        "target": "auth",
        "status": "completed",
        "message": "登录成功" if is_valid else "登录成功，认证状态待校验",
        "progressCurrent": 3,
        "progressTotal": 3,
        "progressUnit": "step",
    })
    emit_payload({"ok": True})


def cmd_auth_logout() -> None:
    from yutto.auth import default_auth_file, remove_auth

    def emit_payload(payload: dict) -> None:
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
    elif args.command == "auth-login":
        cmd_auth_login()
    elif args.command == "auth-logout":
        cmd_auth_logout()
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
