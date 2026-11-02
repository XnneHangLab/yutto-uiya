from __future__ import annotations

import json
import re
import urllib.request
from typing import Any, cast
from urllib.parse import urlsplit

from uiya.cli import BILIBILI_HEADERS


def video_id(target: str) -> dict[str, str] | None:
    value = target.strip()
    if value.startswith(("http://", "https://")):
        parsed = urlsplit(value)
        if parsed.hostname not in {"www.bilibili.com", "bilibili.com"}:
            return None
        value = parsed.path.removeprefix("/video/").rstrip("/")
    else:
        value = value.split("?", 1)[0]
    if re.fullmatch(r"BV[0-9A-Za-z]{10}", value, re.IGNORECASE):
        return {"bvid": "BV" + value[2:]}
    if re.fullmatch(r"av\d+", value, re.IGNORECASE):
        return {"aid": value[2:]}
    return None


def collection_from_view(data: dict[str, Any]) -> dict[str, str] | None:
    season = data.get("ugc_season")
    if not isinstance(season, dict):
        return None
    season = cast("dict[str, Any]", season)
    mid, season_id = str(season.get("mid", "")), str(season.get("id", ""))
    if not mid.isdecimal() or not season_id.isdecimal() or int(mid) <= 0 or int(season_id) <= 0:
        raise ValueError("视频详情返回了无效的合集标识")
    return {
        "title": str(season.get("title") or "视频合集"),
        "url": f"https://space.bilibili.com/{mid}/lists/{season_id}?type=season",
    }


def discover_collection(target: str, proxy: str) -> dict[str, str] | None:
    from urllib.parse import urlencode

    identity = video_id(target)
    if identity is None:
        return None
    request = urllib.request.Request(
        "https://api.bilibili.com/x/web-interface/view?" + urlencode(identity), headers=BILIBILI_HEADERS
    )
    handlers: list[urllib.request.BaseHandler] = []
    if proxy == "no":
        handlers.append(urllib.request.ProxyHandler({}))
    elif proxy != "auto":
        handlers.append(urllib.request.ProxyHandler({"http": proxy, "https": proxy}))
    with urllib.request.build_opener(*handlers).open(request, timeout=15) as response:
        envelope = json.load(response)
    if envelope.get("code") != 0:
        raise ValueError("无法检测所属合集：" + str(envelope.get("message", "视频详情请求失败")))
    return collection_from_view(envelope.get("data") or {})
