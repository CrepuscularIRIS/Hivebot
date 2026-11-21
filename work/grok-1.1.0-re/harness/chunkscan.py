"""Chunk inventory scanner: per-chunk feature signals for gap-ledger triage.

usage: python3 -I chunkscan.py <asar-root> <out.tsv>

Per chunk: size, lazy-route names, aria-labels count, i18n ids, sand-* anchors,
heading/menu text, first class-name hints. Sorted by size desc.
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

root = Path(sys.argv[1])
out = Path(sys.argv[2])
files = sorted((root / "dist/renderer").rglob("*.js"), key=lambda p: -p.stat().st_size)

re_lazy = re.compile(r'import\(`\./([^`]+\.js)`\)')
re_aria = re.compile(r'"aria-label":\s*"([^"]{2,60})"')
re_i18n_id = re.compile(r'id:`([A-Za-z0-9]{6})`')
re_i18n_map = re.compile(r'"([A-Za-z0-9]{6})":\s*"(?:\{[^}]*\}|[^"\\]*(?:\\.[^"\\]*)*)"')
re_sand = re.compile(r'(sand-[a-z0-9]+-[A-Za-z0-9_-]+)')
re_text = re.compile(r'children:\s*"([A-Z][^"]{3,50})"')

lazy_by_name: dict[str, list[str]] = {}
rows = []
for p in files:
    t = p.read_text(errors="replace")
    lazies = re_lazy.findall(t)
    for l in lazies:
        lazy_by_name.setdefault(l, []).append(p.name)
    arias = re_aria.findall(t)
    sands = re_sand.findall(t)
    texts = re_text.findall(t)
    i18n_ids = re_i18n_id.findall(t)
    i18n = re_i18n_map.findall(t)
    rows.append({
        "chunk": p.name,
        "size": p.stat().st_size,
        "lazy_routes": len(lazies),
        "aria": len(arias),
        "i18n_ids": len(set(i18n_ids)),
        "i18n_map": len(i18n),
        "sand": len(set(sands)),
        "texts": len(texts),
        "aria_sample": ";".join(sorted(set(arias))[:5]),
        "text_sample": ";".join(list(dict.fromkeys(texts))[:6]),
        "sand_sample": ";".join(list(dict.fromkeys(sands))[:6]),
    })

with out.open("w") as f:
    f.write("chunk\tsize\tlazy_routes\taria\ti18n_ids\ti18n_map\tsand\ttexts\taria_sample\ttext_sample\tsand_sample\n")
    for r in rows:
        f.write("\t".join(str(r[k]).replace("\t", " ") for k in (
            "chunk", "size", "lazy_routes", "aria", "i18n_ids", "i18n_map", "sand", "texts",
            "aria_sample", "text_sample", "sand_sample")) + "\n")

# which chunks are referenced as lazy routes (i.e. real views) vs never-imported
orphans = [r for r in rows if r["chunk"] not in {n for names in lazy_by_name.values() for n in names}
           and r["size"] > 50_000 and r["chunk"].startswith("chunk-")]
print(json.dumps({
    "total_chunks": len(rows),
    "lazy_referenced": sum(1 for r in rows if r["chunk"] in {n for v in lazy_by_name.values() for n in v}),
    "big_orphans": [r["chunk"] for r in orphans][:40],
    "out": str(out),
}, ensure_ascii=False, indent=1))
