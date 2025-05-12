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
    "initial_settings": "initial_settings",
    "as_package": "as_package",
    "login_strict": "login_strict",
    "vip_strict": "vip_strict",
    "download_dir": "download_dir",
    "sess_data": "sess_data",
    "proxy_pool": "proxy_pool",
    "custom_proxy_pool": "custom_proxy_pool",
    "debug_mode": "debug_mode",
}
