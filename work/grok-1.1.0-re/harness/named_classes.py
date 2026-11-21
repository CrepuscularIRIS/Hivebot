"""Named (semantic, non-hash) class + grep-context helper.
usage: python3 -I named_classes.py <css0781> <css110> <outdir> [ctx-needle ...]
"""
import re
import sys
from pathlib import Path

NAMED = re.compile(r"\.((?:sand|ui|pb|tasks)-[a-z]+(?:-[a-z]+)+(?:__[a-z-]+)?(?:--[a-z-]+)?)")


def named(css: str) -> set[str]:
    return {m for m in NAMED.findall(css) if not re.search(r"\d", m)}


a, b, out = (Path(p) for p in sys.argv[1:4])
ca, cb = a.read_text(errors="replace"), b.read_text(errors="replace")
na, nb = named(ca), named(cb)
(out / "named-removed.txt").write_text("\n".join(sorted(na - nb)) + "\n")
(out / "named-added.txt").write_text("\n".join(sorted(nb - na)) + "\n")
print(f"named 0781={len(na)} 110={len(nb)} removed={len(na - nb)} added={len(nb - na)}")
for needle in sys.argv[4:]:
    print(f"== {needle}")
    for m in list(re.finditer(re.escape(needle), cb))[:4]:
        print("  ", cb[max(0, m.start() - 160) : m.end() + 100].replace("\n", " "))
