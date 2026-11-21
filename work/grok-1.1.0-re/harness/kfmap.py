"""map added keyframes -> utility classes whose animation uses them -> JS chunks using those classes.
usage: python3 -I kfmap.py <deb110/asar/dist/renderer/assets> <keyframes.tsv>
"""
import re
import sys
from pathlib import Path

assets = Path(sys.argv[1])
css = next(assets.glob("index-*.css")).read_text(errors="replace")
names = [l.split("\t")[0] for l in Path(sys.argv[2]).read_text().splitlines()[1:] if "\tadded" in l]

# pre-index JS class usage
js_hits = {}
for p in sorted(assets.glob("*.js")):
    t = p.read_text(errors="replace")
    js_hits[p.name] = t

for kf in names:
    # find rules containing animation:<kf>
    pat = re.compile(r"animation:[^;}]*" + re.escape(kf))
    classes = set()
    for m in pat.finditer(css):
        # walk back to start of the rule (previous '}' boundary)
        start = css.rfind("}", 0, m.start()) + 1
        rule = css[start : m.end()]
        sel = rule.split("{", 1)[0]
        for c in re.findall(r"\.?sand-[a-z0-9]+", sel):
            classes.add(c.lstrip("."))
    chunks = sorted(fn for fn, t in js_hits.items() if any((f'"{c}"' in t) or (f"'{c}'" in t) or (f" {c} " in t) or (f"`{c}`" in t) for c in classes)) if classes else []
    body = css[css.find("@keyframes " + kf) : css.find("@keyframes " + kf) + 220]
    body = body.split("}")[0] + "}"
    print(f"== {kf} :: {body}")
    print(f"   classes={sorted(classes)}")
    print(f"   chunks={chunks}")
