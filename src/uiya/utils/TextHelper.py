from __future__ import annotations


def process_expection(excpection: str):
    excpection = excpection.replace("\x1b[94m", "[")
    excpection = excpection.replace("\x1b[93m", "[")
    excpection = excpection.replace("\x1b[91m", "[")
    excpection = excpection.replace("\x1b[92m", "[")
    excpection = excpection.replace("\x1b[33m", "[")  # WARNING
    excpection = excpection.replace("\x1b[31;1m", "[")  # ERROR
    excpection = excpection.replace("\x1b[0m", "] ")
    excpection = excpection.replace("\x1b[30;46m", "[")
    excpection = excpection.replace("\x1b[32m", "[")
    excpection = excpection.replace("\x1b[34m*", ">")
    excpection = excpection.replace("\x1b[35m*", ">")
    excpection = excpection.replace("\x1b[0m", "")
    excpection = excpection.replace("\x1b[38;2;64;64;64m", "")
    excpection = excpection.replace("\x1b[36m", "")
    print([excpection])
    return excpection
