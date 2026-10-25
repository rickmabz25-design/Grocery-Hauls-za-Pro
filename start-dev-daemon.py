#!/usr/bin/env python3
"""Double-fork daemonize the Next.js dev server so it survives tool session exits."""
import os
import subprocess
import sys

PROJECT = "/home/z/my-project"
LOG = os.path.join(PROJECT, "dev.log")


def is_up() -> bool:
    try:
        import urllib.request

        with urllib.request.urlopen("http://localhost:3000/", timeout=3) as r:
            return r.status == 200
    except Exception:
        return False


def main() -> None:
    if is_up():
        print("already-running")
        return
    pid = os.fork()
    if pid == 0:  # child 1
        os.setsid()
        pid2 = os.fork()
        if pid2 == 0:  # child 2 — daemon, reparented to init
            os.chdir(PROJECT)
            with open(LOG, "a") as out:
                subprocess.Popen(
                    ["bun", "run", "dev"],
                    stdout=out,
                    stderr=out,
                    stdin=subprocess.DEVNULL,
                    start_new_session=True,
                    cwd=PROJECT,
                )
            os._exit(0)
        os._exit(0)
    os.waitpid(pid, 0)
    print("daemon-started")


if __name__ == "__main__":
    sys.exit(main())
