from __future__ import annotations

from pathlib import Path
from typing import get_args

import pytest

from uiya.utils.config import (
    UiyaSetting,
    VipStrict,
    load_settings_file,
    resolve_download_dir,
)


class TestSettings:
    def setup_method(self):
        """每个测试方法运行前的设置"""
        self.settings = load_settings_file("uiya.toml", UiyaSetting)

    def test_get_zh_option_list(self):
        """测试获取中文选项列表"""
        options = self.settings.get_zh_option_list("login_strict")
        assert options == ["开启", "关闭"]

    def test_get_index(self):
        """测试获取索引"""
        index = self.settings.get_index("vip_strict")
        assert get_args(VipStrict)[index] == self.settings.vip_strict

    def test_resolve_download_dir_uses_workspace_root_for_relative_paths(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
        """相对下载目录应基于运行时工作目录，而不是仓库目录。"""
        workspace_root = tmp_path / "workspace"
        workspace_root.mkdir()
        monkeypatch.setenv("UIYA_WORKSPACE_ROOT", str(workspace_root))

        resolved = resolve_download_dir(UiyaSetting(download_dir="./downloads"))

        assert resolved == workspace_root / "downloads"


if __name__ == "__main__":
    pytest.main()
