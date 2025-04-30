from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from uiya._dataclass import CommandGenerator
from uiya._typing import full_status
from uiya.utils.config import UiyaSetting, load_settings_file

if TYPE_CHECKING:
    from uiya._typing import CommandStatus


class TestCommandGenerator:
    def setup_method(self):
        """每个测试方法运行前的设置"""
        self.status: CommandStatus = full_status
        self.settings = load_settings_file("uiya.toml", UiyaSetting)

    def test_from_status(self):
        """测试从状态字典创建 CommandGenerator"""
        command_generator = CommandGenerator.from_status(self.status)

        assert command_generator.url == "https://example.com/video123"
        assert command_generator.require_video is True
        assert command_generator.require_audio is True

    def test_gen_args(self):
        """测试生成命令行参数"""
        command_generator = CommandGenerator.from_status(self.status)
        command_args = command_generator.gen_args()

        # 根据实际情况添加对生成参数的断言
        assert isinstance(command_args, list)
        # 例如，可以检查特定参数是否存在
        # assert "--url" in command_args
        # assert "https://example.com/video123" in command_args


if __name__ == "__main__":
    pytest.main(["-v"])
