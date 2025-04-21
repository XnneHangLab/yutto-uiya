from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Annotated

from pydantic import BaseModel, Field

from uiya.utils.config import UiyaSetting, load_settings_file, search_for_settings_file, write_settings_file

if TYPE_CHECKING:
    from uiya._typing import (
        AudioQuality,
        CommandStatus,
        TargetType,
        VideoQuality,
    )

video_quality_mapping: dict[VideoQuality, int] = {
    "360p 流畅": 16,
    "480p 清晰": 32,
    "720p 高清": 64,
    "720p 60帧": 74,
    "1080p 高清": 80,
    "1080p 高码率": 112,
    "1080p 60帧": 116,
    "4K 超清": 120,
    "HDR 真彩": 125,
    "杜比视界": 126,
    "8K 超高清": 127,
}

audio_quality_mapping: dict[AudioQuality, int] = {
    "64kbps": 30216,
    "128kbps": 30232,
    "320kbps": 30280,
    "杜比全景声": 30250,
    "杜比音效": 30255,
    "Hi-Res": 30251,
}

# 能够下载到的前提是，该视频具有该等级的资源，并且你具有访问权限。


class YuttoBasicSetting(BaseModel):
    num_workers: Annotated[int, Field(8, gt=0)]
    video_quality: Annotated[int, Field(127)]
    audio_quality: Annotated[int, Field(30251)]
    sessdata: Annotated[str, Field("")]
    vip_strict: Annotated[bool, Field(False)]
    login_strict: Annotated[bool, Field(False)]
    dir: Annotated[str, Field("./downloads")]


class YuttoResourceSettings(BaseModel):
    require_video: Annotated[bool, Field(True)]
    require_audio: Annotated[bool, Field(True)]
    require_danmaku: Annotated[bool, Field(True)]
    require_subtitle: Annotated[bool, Field(True)]
    require_metadata: Annotated[bool, Field(False)]
    require_cover: Annotated[bool, Field(False)]
    save_cover: Annotated[bool, Field(False)]


class YuttoSettings(BaseModel):
    basic: Annotated[YuttoBasicSetting, Field(YuttoBasicSetting())]  # type: ignore
    resource: Annotated[YuttoResourceSettings, Field(YuttoResourceSettings())]  # type: ignore


@dataclass
class CommandGenerator:
    """Command Generator"""

    # ========= 这些从 UI 中获取，用户实时选择。
    target_type: TargetType
    url: str
    batch_download: bool
    support_select: bool
    selected_p: str | None = None

    require_video: bool = True
    require_audio: bool = True
    require_danmaku: bool = False
    require_cover: bool = False
    require_metadata: bool = True
    require_subtitle: bool = True

    debug_mode: bool = False
    parse_mode: bool = True
    no_color: bool = True
    no_progress: bool = True

    video_quality: VideoQuality = "360p 流畅"
    audio_quality: AudioQuality = "320kbps"

    # ========== 这些是从 uiya.toml 中读取，或者作为UI设置中保持的值
    uiya_setting: UiyaSetting = field(default_factory=lambda: load_settings_file("uiya.toml", UiyaSetting))

    def __post_init__(self):
        pass

    @classmethod
    def from_status(cls, status: CommandStatus) -> CommandGenerator:  # type: ignore
        """从 CommandStatus 创建 CommandGenerator 实例"""
        return cls(**status)  # type: ignore

    def url_check(self, url: str) -> bool:
        return True

    def gen_args(self):
        # TODO 直接在这里 raise, 会导致 UI 直接崩溃, 所以要提前检查，这里只是作为最后的检查
        # ================== URL
        # URL not correct
        if self.url == "" or not self.url_check(self.url):
            raise ValueError("Invalid URL")

        else:
            self.args = ["uv", "run", "yutto", self.url]

        # ================== RESOURCES
        # [] [] [], no resource required
        if not self.require_video and not self.require_audio and not self.require_danmaku and not self.require_cover:
            raise ValueError("No resource required")

        else:
            ResourceSetting = YuttoResourceSettings(
                require_video=self.require_video,
                require_audio=self.require_audio,
                require_danmaku=self.require_danmaku,
                require_subtitle=self.require_subtitle,
                require_metadata=self.require_metadata,
                require_cover=self.require_cover,
                save_cover=self.require_cover,
            )

        # =================== BASIC SETTING
        BasicSetting = YuttoBasicSetting(
            num_workers=8,
            video_quality=video_quality_mapping[self.video_quality],
            audio_quality=audio_quality_mapping[self.audio_quality],
            sessdata=self.uiya_setting.SESS_DATA,
            vip_strict=True if self.uiya_setting.vip_strict == "open" else False,
            login_strict=True if self.uiya_setting.login_strict == "open" else False,
            dir=self.uiya_setting.download_dir,
        )

        # =================== GENERATE yutto.toml
        YuttoSetting = YuttoSettings(basic=BasicSetting, resource=ResourceSetting)  # type: ignore
        write_settings_file("yutto.toml", YuttoSetting)
        yutto_setting_path = search_for_settings_file("yutto.toml")
        toml_args = ["--config", str(yutto_setting_path)]
        self.args.extend(toml_args)
        # =================== BATCH DOWNLOAD
        if self.batch_download:
            batch_download_args = ["-b"]
            self.args.extend(batch_download_args)
        if self.support_select and self.selected_p is not None:
            batch_download_args = ["-p", self.selected_p]
            self.args.extend(batch_download_args)
        # =================== DEBUG MODE
        if self.debug_mode:
            print("=================== DEBUG MODE ↓===================")
            print(self.args)
            print(YuttoSetting.basic)
            print(YuttoSetting.resource)
            print("=================== DEBUG MODE ↑===================")

        # =================== parse
        if self.parse_mode:
            parse_args = ["--skip-download"]
            self.args.extend(parse_args)

        # =================== no-color
        if self.no_color:
            no_color_args = ["--no-color"]
            self.args.extend(no_color_args)

        # =================== no-progress
        if self.no_progress:
            no_progress_args = ["--no-progress"]
            self.args.extend(no_progress_args)

        return self.args


if __name__ == "__main__":
    commander = CommandGenerator(
        target_type="video",
        url="https://www.bilibili.com/video/BV1Zy4y1q7ZB",
        batch_download=False,
        support_select=False,
        selected_p=None,
        debug_mode=True,
    )
    args = commander.gen_args()
    print(args)
