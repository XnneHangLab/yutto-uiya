from __future__ import annotations

import io
import json
import urllib.request

import pytest

from uiya.collection import collection_from_view, discover_collection, video_id


def test_collection_discovery_validates_video_urls_and_identity(monkeypatch: pytest.MonkeyPatch):
    assert video_id("https://www.bilibili.com/video/BV17zDWYwEj8/?p=2") == {"bvid": "BV17zDWYwEj8"}
    assert video_id("av123?p=2") == {"aid": "123"}
    assert video_id("https://example.com/video/BV17zDWYwEj8/") is None
    assert video_id("https://space.bilibili.com/1/lists/2?type=season") is None
    assert collection_from_view({"pages": [{}, {}]}) is None
    assert collection_from_view({"ugc_season": {"mid": 556737824, "id": 9471279, "title": "测试"}}) == {
        "title": "测试",
        "url": "https://space.bilibili.com/556737824/lists/9471279?type=season",
    }
    with pytest.raises(ValueError):
        collection_from_view({"ugc_season": {"mid": "../1", "id": 2}})

    class Opener:
        def open(self, request: urllib.request.Request, timeout: int):
            assert request.full_url.endswith("?bvid=BV17zDWYwEj8")
            assert timeout == 15
            return io.BytesIO(json.dumps({"code": 0, "data": {"ugc_season": {"mid": 1, "id": 2}}}).encode())

    monkeypatch.setattr(urllib.request, "build_opener", lambda *_: Opener())
    assert discover_collection("BV17zDWYwEj8", "no") == {
        "title": "视频合集",
        "url": "https://space.bilibili.com/1/lists/2?type=season",
    }
