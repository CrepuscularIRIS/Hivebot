"""per-file offsets + wide context for needles in renderer JS.
usage: python3 -I appprobe.py <deb>/asar <needle> [needle...]
env PRE=600 POST=900 to widen (or args needle=PRExPOST suffix syntax not needed).
"""
import os
import sys
from pathlib import Path

root = Path(sys.argv[1])
pre = int(os.environ.get("PRE", "600"))
post = int(os.environ.get("POST", "900"))
maxhits = int(os.environ.get("MAXHITS", "6"))
files = sorted((root / "dist/renderer").rglob("*.js"))
for n in sys.argv[2:]:
    total = 0
    print(f"########## {n}")
    for p in files:
        t = p.read_text(errors="replace")
        start, hits = 0, []
        while len(hits) < maxhits:
            i = t.find(n, start)
            if i < 0:
                break
            hits.append(i)
            start = i + 1
        total += t.count(n)
        for i in hits:
            ctx = t[max(0, i - pre) : i + len(n) + post].replace("\n", " ")
            print(f"--- {p.name}@{i} (file hits {t.count(n)})")
            print(ctx)
    print(f"== total {total}")
