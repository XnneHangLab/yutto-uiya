from __future__ import annotations

from typing import get_args

import pytest

from uiya.utils.config import UiyaSetting, VipStrict, load_settings_file


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


if __name__ == "__main__":
    pytest.main()
