"""count + first-context of needles in 0.78.1 vs 1.1.0 renderer+main JS.
usage: python3 -I probe.py <deb0781/asar> <deb110/asar> needle...
"""
import sys
from pathlib import Path


def load(root: Path) -> str:
    return "\n".join(
        p.read_text(errors="replace")
        for d in ("dist/renderer", "dist/electron-main")
        for p in sorted((root / d).rglob("*.js"))
    )


a, b = load(Path(sys.argv[1])), load(Path(sys.argv[2]))
for n in sys.argv[3:]:
    ia = b.find(n)
    ctx = b[max(0, ia - 90) : ia + len(n) + 120].replace("\n", " ") if ia >= 0 else ""
    print(f"[{a.count(n)}->{b.count(n)}] {n} :: {ctx[:260]}")
