from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from uiya._typing import RunnerKeys, YuttoUiyaKeys


runner_keys: RunnerKeys = {
    "select_p": "select_p",
    "select_all": "select_all",
    "click_p": "click_p",
    "parse_content": "parse_content",
    "video_name": "video_name",
    "parse_command_status": "parse_command_status",
    "download_content": "download_content",
    "runtime_error": "runtime_error",
}

yutto_uiya_keys: YuttoUiyaKeys = {
    "save": "save",
    "full_status": "full_status",
}
