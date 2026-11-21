"""byte-offset + context for needles in CSS (single-line minified).
usage: python3 -I cssprobe.py <deb>/asar/dist/renderer/assets/index-*.css needle...
prints: OFFSET n ...ctx...
"""
import sys
from pathlib import Path

css = next(Path(sys.argv[1]).glob("index-*.css")).read_text(errors="replace")
for n in sys.argv[2:]:
    start, hits = 0, []
    while True:
        i = css.find(n, start)
        if i < 0:
            break
        hits.append(i)
        start = i + 1
    print(f"### {n}  ({len(hits)} hits)")
    for i in hits[:12]:
        ctx = css[max(0, i - 130) : i + len(n) + 170].replace("\n", " ")
        print(f"@{i} :: {ctx}")
    if len(hits) > 12:
        print(f"... {len(hits)-12} more")
