"""Generic anchor check: every `backticked` / "quoted" token in RE docs that exists in the
0.78.1 bundle (renderer+main+preload) -> is it still in 1.1.0?  Minified identifiers churn,
so only tokens >=4 chars that contain a letter and are not pure short idents are kept.

usage: python3 -I anchors_generic.py <deb0781/asar> <deb110/asar> <outdir> <re_doc...>
"""
import re
import sys
from pathlib import Path

TOK_RE = re.compile(r"`([^`\n]{4,80})`|\"([^\"\n]{4,80})\"|「([^」\n]{2,40})」")
DIRS = ("dist/renderer", "dist/electron-main", "dist/electron-preload")


def bundle(root: Path) -> str:
    parts = []
    for d in DIRS:
        for p in sorted((root / d).rglob("*")):
            if p.suffix in (".js", ".css", ".json", ".mjs", ".cjs"):
                parts.append(p.read_text(errors="replace"))
    return "\n".join(parts)


def interesting(t: str) -> bool:
    t = t.strip()
    if re.fullmatch(r"[A-Za-z_$][\w$]{0,3}", t):  # short minified ident
        return False
    return bool(re.search(r"[A-Za-z]", t))


def candidates(t: str) -> list[str]:
    t = t.strip()
    out = [t]
    # split selector-ish / code-ish tokens into words worth checking
    out += [w for w in re.findall(r"[\w.:/-]{5,}", t) if w != t]
    return out


def main() -> None:
    a, b, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    ba, bb = bundle(a), bundle(b)
    out.mkdir(parents=True, exist_ok=True)
    for d in map(Path, sys.argv[4:]):
        toks = set()
        for m in TOK_RE.finditer(d.read_text()):
            raw = next(g for g in m.groups() if g)
            if interesting(raw):
                toks.update(c for c in candidates(raw) if interesting(c))
        real = sorted(t for t in toks if t in ba)
        gone = [t for t in real if t not in bb]
        (out / f"generic-{d.stem}.tsv").write_text("anchor\tin110\n" + "".join(f"{t}\t{int(t in bb)}\n" for t in real))
        print(f"{d.stem}: real_anchors={len(real)} gone_in_110={len(gone)} :: {gone[:40]}")


if __name__ == "__main__":
    main()
