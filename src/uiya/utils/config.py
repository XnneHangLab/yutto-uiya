from __future__ import annotations

import os
import platform
import tomllib  # Python 3.11+ 自带
from pathlib import Path
from typing import TYPE_CHECKING, Annotated, Any, get_args

import tomli_w as tomlw  # 安装 tomli_w 用于写入
from pydantic import BaseModel, Field

from uiya._dictionary import uiya_setting_dictionary
from uiya._typing import DebugMode, LoginStrict, VipStrict

toml_loads = tomllib.loads
toml_dumps = tomlw.dumps  # 使用 tomlw.dumps

if TYPE_CHECKING:
    from uiya._dataclass import YuttoSettings
    from uiya._typing import UiyaSettingsTitle


class UiyaSetting(BaseModel):
    as_package: Annotated[bool, Field(default=False, title="是否作为子包使用")]
    SESS_DATA: Annotated[str, Field(default="", title="SESS_DATA")]
    download_dir: Annotated[str, Field(default="./downloads", title="下载目录")]
    login_strict: Annotated[LoginStrict, Field(default="close", title="严格校验登陆")]
    vip_strict: Annotated[VipStrict, Field(default="close", title="严格校验大会员")]
    proxy_pool: Annotated[str, Field(default="", title="代理池")]
    custom_proxy_pool: Annotated[bool, Field(default=False, title="是否使用自定义代理池")]
    debug_mode: Annotated[DebugMode, Field(default="close", title="是否开启调试模式")]

    def get_zh_option_list(self, key: UiyaSettingsTitle) -> list[str]:
        """获取中文配置项列表"""
        if key == "login_strict":
            return [uiya_setting_dictionary[x][1] for x in get_args(LoginStrict)]
        elif key == "vip_strict":
            return [uiya_setting_dictionary[x][1] for x in get_args(VipStrict)]
        elif key == "debug_mode":
            return [uiya_setting_dictionary[x][1] for x in get_args(DebugMode)]
        else:
            raise ValueError(f"不支持的配置项: {key}")

    def get_index(self, key: UiyaSettingsTitle) -> int:
        """获取配置项的索引"""
        if key == "login_strict":
            return get_args(LoginStrict).index(self.login_strict)
        elif key == "vip_strict":
            return get_args(VipStrict).index(self.vip_strict)
        elif key == "debug_mode":
            return get_args(DebugMode).index(self.debug_mode)
        else:
            raise ValueError(f"不支持的配置项: {key}")

    def zh_get_value(self, key: UiyaSettingsTitle, value: str):
        """通过中文得到对应的 value, 但不直接修改"""
        if key == "login_strict":
            login_strict = get_args(LoginStrict)[
                [uiya_setting_dictionary[x][1] for x in get_args(LoginStrict)].index(value)
            ]
            return login_strict
        elif key == "vip_strict":
            vip_strict = get_args(VipStrict)[[uiya_setting_dictionary[x][1] for x in get_args(VipStrict)].index(value)]
            return vip_strict
        elif key == "debug_mode":
            debug_mode = get_args(DebugMode)[[uiya_setting_dictionary[x][1] for x in get_args(DebugMode)].index(value)]
            return debug_mode
        else:
            raise ValueError(f"不支持的配置项: {key}")


def xdg_config_home() -> Path:
    if (env := os.environ.get("XDG_CONFIG_HOME")) and (path := Path(env)).is_absolute():
        return path
    home = Path.home()
    if platform.system() == "Windows":
        return home / "AppData"
    return home / ".config"


def search_for_settings_file(setting_name: str) -> Path | None:
    config_dir = Path("config")
    settings_file = config_dir / setting_name
    if not settings_file.exists():  # 当前目录没找到
        settings_file = xdg_config_home() / setting_name
    if not settings_file.exists():  # XDG_CONFIG_HOME 也没找到
        return None
    return settings_file


def load_settings_file(
    setting_name: str,
    setting: (type[UiyaSetting]),
) -> UiyaSetting:
    """加载配置文件，如果不存在则创建默认配置文件在当前工作目录。"""
    settings_file = search_for_settings_file(setting_name=setting_name)
    if settings_file is None:
        config_dir = Path("config")
        if not config_dir.exists():
            config_dir.mkdir()
        settings_file = config_dir / setting_name
        print(f"未找到配置文件，将初始化默认配置:{str(settings_file)}")
        settings_file.touch()
    with settings_file.open("r", encoding="utf-8") as f:
        settings_raw: Any = tomllib.loads(f.read())
    validated_settings = setting.model_validate(settings_raw)
    write_settings_file(settings_name=setting_name, settings=validated_settings)
    return validated_settings


def write_settings_file(
    settings_name: str,
    settings: UiyaSetting | YuttoSettings,
) -> None:
    """将 Setting 对象写入 TOML 文件。"""
    settings_file = search_for_settings_file(setting_name=settings_name)
    if settings_file is None:
        settings_file = Path("config") / settings_name
        settings_file.touch()
    try:
        with settings_file.open("w", encoding="utf-8") as f:
            toml_string = toml_dumps(settings.model_dump())  # type: ignore
            f.write(toml_string)
    except Exception as e:
        print(f"写入配置文件失败: {e}")


def get_setting_title(
    name: UiyaSettingsTitle,
    setting: type[UiyaSetting],
) -> str:
    """获取配置项(英文)的标题。（中文）

    guide -> 指引,
    output_type -> 输出类型,
    subtitle_speed -> 字幕速度,
    ...
    """
    return str(setting.model_fields[name].title)


# 示例用法
if __name__ == "__main__":
    # 加载配置
    uiya_settings = load_settings_file("uiya.toml", UiyaSetting)
