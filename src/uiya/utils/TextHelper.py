from __future__ import annotations

import platform

from uiya._dictionary import emoji


def clean_ouput(output: str):
    if platform.system() == "Windows":
        output = output.replace("\r\n", "")
        output = output.replace("\r", "")
        output = output.replace("\n", "")
        output = output.replace("INFO", "")
        output = output.replace("WARN", "")
        output = output.replace("ERROR", "")

        # 忽略空行
        if output.replace(" ", "") == "":
            output = ""
        else:
            output = output + "\n"
        # print([output])

    else:
        # ignore emoji
        for ignore_value in emoji:
            output = output.replace(ignore_value, "")
        # ignore space
        output = output.replace(" ", "")

        # ignore color
        # output = output.replace("\x1b[33m", "")  # WARNING
        # output = output.replace("\x1b[31;1m", "")  # ERROR
        output = output.replace("\x1b[94m", "[")
        output = output.replace("\x1b[93m", "[")
        output = output.replace("\x1b[91m", "[")
        output = output.replace("\x1b[92m", "[")
        output = output.replace("\x1b[0m", "] ")
        output = output.replace("\x1b[30;46m", "[")
        output = output.replace("\x1b[32;1m", "")
        output = output.replace("\x1b[38;2;64;64;64m", "")
        output = output.replace("\x1b[32m", "")
        output = output.replace("\x1b[33m", "")
        output = output.replace("\x1b[31;1m", "")
        output = output.replace("\x1b[34m*", ">")
        output = output.replace("\x1b[35m*", ">")
        output = output.replace("\x1b[0m", "")
        output = output.replace("\x1b[36m", "")

        # Add line break for process line
        if "━━━" in output:
            output = output + "\n"
    return output
