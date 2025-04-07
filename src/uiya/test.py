from __future__ import annotations

from typing import TYPE_CHECKING

from uiya._dataclass import CommandGenerator

if TYPE_CHECKING:
    from uiya._typing import CommandStatus


def main():
    print("================= Testing CommandGenerater Init=================")
    # from values
    command_generator = CommandGenerator(
        target_type="video",
        batch_download=False,
        support_select=False,
        url="https://example.com/video123",  # adjustable
        selected_p=None,  # adjustable/Optional
        require_video=True,  # adjustable
        require_audio=True,  # adjustable
        require_danmaku=False,  # adjustable
        require_cover=False,  # adjustable
        debug_mode=False,  # adjustable
        video_quality="360p 流畅",  # adjustable
        audio_quality="320kbps",  # adjustable
    )
    print(command_generator)

    # from status
    status: CommandStatus = {
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

    command_generator = CommandGenerator.from_status(status)
    # 打印实例的属性
    print(command_generator)

    print("================= Testing CommandGenerater get_args=================")
    command_generator = CommandGenerator.from_status(status)
    command_args = command_generator.gen_args()
    print(command_args)


if __name__ == "__main__":
    main()
