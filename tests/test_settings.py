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

    def test_resolve_download_dir_uses_workspace_root_for_relative_paths(
        self,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ):
        """相对下载目录应基于运行时工作目录，而不是仓库目录。"""
        workspace_root = tmp_path / "workspace"
        workspace_root.mkdir()
        monkeypatch.setenv("UIYA_WORKSPACE_ROOT", str(workspace_root))

        resolved = resolve_download_dir(UiyaSetting(download_dir="./downloads"))

        assert resolved == workspace_root / "downloads"

    def test_load_settings_file_prefers_runtime_config_path(
        self,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        runtime_config = tmp_path / "runtime" / "config" / "uiya.toml"
        runtime_config.parent.mkdir(parents=True)
        runtime_config.write_text(
            'ffmpeg_path = "portable-ffmpeg"\n',
            encoding="utf-8",
        )
        local_root = tmp_path / "workspace"
        local_root.mkdir(parents=True)
        local_config = local_root / "config" / "uiya.toml"
        local_config.parent.mkdir(parents=True)
        base_config = Path("config/uiya.toml").read_text(encoding="utf-8")
        local_config.write_text(
            base_config.replace('ffmpeg_path = "ffmpeg"', 'ffmpeg_path = "repo-ffmpeg"'),
            encoding="utf-8",
        )

        monkeypatch.setenv("UIYA_RUNTIME_CONFIG", str(runtime_config))
        monkeypatch.chdir(local_root)

        settings = load_settings_file("uiya.toml", UiyaSetting)

        assert settings.ffmpeg_path == "portable-ffmpeg"
        runtime_contents = runtime_config.read_text(encoding="utf-8")
        assert "portable-ffmpeg" in runtime_contents
        assert "repo-ffmpeg" in local_config.read_text(encoding="utf-8")

    def test_load_settings_falls_back_to_repo_when_runtime_missing(
        self,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        runtime_config = tmp_path / "runtime" / "config" / "uiya.toml"
        local_root = tmp_path / "workspace"
        local_root.mkdir(parents=True)
        local_config = local_root / "config" / "uiya.toml"
        local_config.parent.mkdir(parents=True)
        base_config = Path("config/uiya.toml").read_text(encoding="utf-8")
        local_config.write_text(
            base_config.replace('ffmpeg_path = "ffmpeg"', 'ffmpeg_path = "repo-ffmpeg"'),
            encoding="utf-8",
        )

        monkeypatch.setenv("UIYA_RUNTIME_CONFIG", str(runtime_config))
        monkeypatch.chdir(local_root)

        settings = load_settings_file("uiya.toml", UiyaSetting)

        assert settings.ffmpeg_path == "repo-ffmpeg"
        assert not runtime_config.exists()

if __name__ == "__main__":
    pytest.main()
