from __future__ import annotations

import os
import platform
import tomllib  # Python 3.11+ 自带
from pathlib import Path
from typing import TYPE_CHECKING, Annotated, Any

import tomli_w as tomlw  # 安装 tomli_w 用于写入
from pydantic import BaseModel, Field

toml_loads = tomllib.loads
toml_dumps = tomlw.dumps  # 使用 tomlw.dumps
# else:
#     import tomli as tomllib  # type: ignore
#     import tomli_w as tomlw  # type: ignore

#     toml_loads = tomllib.loads  # type: ignore
#     toml_dumps = tomlw.dumps  # 使用 tomlw.dumps

if TYPE_CHECKING:
    from uiya._dataclass import YuttoSettings


class UiyaSetting(BaseModel):
    SESS_DATA: Annotated[str, Field(default="")]
    download_dir: Annotated[str, Field(default="./downloads")]
    login_strict: Annotated[bool, Field(default=True)]
    vip_strict: Annotated[bool, Field(default=False)]


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


# 示例用法
if __name__ == "__main__":
    # 加载配置
    uiya_settings = load_settings_file("uiya.toml", UiyaSetting)
