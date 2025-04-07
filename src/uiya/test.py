from __future__ import annotations

from typing import TYPE_CHECKING

from uiya._dataclass import CommandGenerator

if TYPE_CHECKING:
    from uiya._typing import CommandStatus


def main():
    status:CommandStatus = {
        "target_type": "video",
        "batch_download": False,
        "support_select": False,
        "url": "https://example.com/video123",  # adjustable
        "selected_p": None,  # adjustable/Optional
        "require_video": True,  # adjustable
        "require_audio": True,  # adjustable
        "require_danmaku": False,  # adjustable
        "require_cover": False,  # adjustable
        "debug_mode": False,  # adjustable
        "video_quality": "360p 流畅",  # adjustable
        "audio_quality": "320kbps",  # adjustable
    }


    command_generator = CommandGenerator(
        target_type="video",
        url="https://example.com/video123",
        batch_download=False,
        support_select=False,
        selected_p=None,
        require_video=True,
        require_audio=True,
        require_danmaku=False,
        require_cover=False,
        debug_mode=False,
        video_quality="360p 流畅",
        audio_quality="320kbps",
    )

    # 打印实例的属性
    print(command_generator)


    command= command_generator.from_status(status)

    print(command)

if __name__ == "__main__":
    main()
