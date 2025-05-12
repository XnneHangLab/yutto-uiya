from __future__ import annotations

from typing import TypedDict


class UiyaSettingDictionary(TypedDict):
    # login_strict && vip_strict
    open: tuple[int, str]
    close: tuple[int, str]

    # as package
    yes: tuple[int, str]
    no: tuple[int, str]


uiya_setting_dictionary: UiyaSettingDictionary = {
    "open": (0, "开启"),  # 第二个参数参数对应的中文
    "close": (1, "关闭"),  # index 是在 Literal 中的位置, 不能随意改除非连同 Literal 一起改
    "yes": (1, "是"),
    "no": (0, "否"),
}


emoji = [
    "(\u3000´･ω)",
    "( \u3000´･)",
    "( \u3000 ´)",
    "(     )",
    "(`\u3000  )",
    "(･`   )",
    "(ω･`\u3000)",
    "(･ω･` )",
    "(´･ω･`)",
    "( ´･ω･)",
]
