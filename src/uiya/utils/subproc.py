from __future__ import annotations

import subprocess
import sys


def run_command(command: list[str]) -> str:
    try:
        process = subprocess.run(command, text=True, stdout=sys.stdout, stderr=sys.stderr)
        return str(process.returncode)
    except Exception as e:
        print(f"Error: {str(e)}")
        return str(e)
