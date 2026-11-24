"""Print the version the next release should get.

- No release yet, or package.json is ahead of the latest tag (a minor/major bump by hand): package.json's version.
- Otherwise: the latest tag with the patch number + 1. So every push to main is a new patch release,
  and nobody has to remember to bump the version.

Run from the repository root with the tags fetched (actions/checkout fetch-depth: 0).
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

SEMVER = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)$")


def parse(text: str) -> tuple[int, int, int] | None:
    m = SEMVER.match(text.strip())
    return (int(m[1]), int(m[2]), int(m[3])) if m else None


def next_version(base: tuple[int, int, int], tags: list[str]) -> tuple[int, int, int]:
    released = [v for v in (parse(t) for t in tags) if v]
    if not released:
        return base
    latest = max(released)
    if base > latest:
        return base
    return (latest[0], latest[1], latest[2] + 1)


def main() -> None:
    package = json.loads(Path("package.json").read_text(encoding="utf-8"))
    base = parse(package["version"])
    if base is None:
        sys.exit(f"package.json version is not x.y.z: {package['version']}")
    tags = subprocess.run(["git", "tag", "--list", "v*"], capture_output=True, text=True, check=True).stdout.split()
    print(".".join(map(str, next_version(base, tags))))


if __name__ == "__main__":
    main()
