from dataclasses import dataclass, field
from uiya.utils.config import load_settings_file, write_settings_file, UiyaSetting
from uiya._typing import (
    TargetType,
    VideoQuality,
    AudioQuality,
    CommandStatus,
)
from pydantic import BaseModel, Field
from typing import Annotated
from pathlib import Path


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

    # ========= 这些从 UI 中获取
    target_type: TargetType
    url: str
    batch_download: bool
    support_select: bool
    selected_p: str | None = None

    require_video: bool = True
    require_audio: bool = True
    require_danmaku: bool = False
    require_cover: bool = False

    debug_mode: bool = False

    video_quality: VideoQuality = "360p 流畅"
    audio_quality: AudioQuality = "320kbps"
    # ==========

    uiya_setting: UiyaSetting = field(
        default_factory=lambda: load_settings_file("uiya.toml")
    )

    def __post_init__(self):
        pass

    @classmethod
    def from_status(
        cls, status: CommandStatus
    ) -> "CommandGenerator":  # 用 "" 来延后类型检查到运行时，绝了。
        """从 CommandStatus 创建 CommandGenerator 实例"""
        return cls(**status)  # type: ignore

    def url_check(self, url: str) -> bool:
        return True

    def gen_args(self):
        # ================== URL
        # URL not correct
        if self.url == "" or not self.url_check(self.url):
            raise ValueError("Invalid URL")

        else:
            self.args = ["yutto", self.url]

        # ================== RESOURCES
        # [] [] [], no resource required
        if (
            not self.require_video
            and not self.require_audio
            and not self.require_danmaku
            and not self.require_cover
        ):
            raise ValueError("No resource required")

        else:
            ResourceSetting = YuttoResourceSettings(
                require_video=self.require_video,
                require_audio=self.require_audio,
                require_danmaku=self.require_danmaku,
                require_subtitle=False,
                require_metadata=False,
                require_cover=self.require_cover,
                save_cover=self.require_cover,
            )

        # =================== BASIC SETTING
        BasicSetting = YuttoBasicSetting(
            num_workers=8,
            video_quality=video_quality_mapping[self.video_quality],
            audio_quality=audio_quality_mapping[self.audio_quality],
            sessdata=self.uiya_setting.SESS_DATA,
            vip_strict=self.uiya_setting.vip_strict,
            login_strict=self.uiya_setting.login_strict,
            dir=self.uiya_setting.download_dir,
        )

        # =================== GENERATE yutto.toml
        YuttoSetting = YuttoSettings(basic=BasicSetting, resource=ResourceSetting)  # type: ignore
        yutto_setting_path = Path("yutto.toml")
        write_settings_file(yutto_setting_path, YuttoSetting)
        toml_args = ["--config", str(yutto_setting_path)]
        self.args.extend(toml_args)
        # =================== BATCH DOWNLOAD
        if self.support_select and self.selected_p is not None:
            batch_download_args = ["-b", "-p", self.selected_p]
            self.args.extend(batch_download_args)
        # =================== DEBUG MODE
        if self.debug_mode:
            print("=================== DEBUG MODE ↓===================")
            print(self.args)
            print(YuttoSetting.basic)
            print(YuttoSetting.resource)
            print("=================== DEBUG MODE ↑===================")

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
