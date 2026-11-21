"""0.78.1 -> 1.1.0 delta harness (read-only on asar dirs).

usage: python3 -I delta.py <deb0781/asar> <deb110/asar> <outdir> <re_doc...>
Outputs: keyframes.tsv, tokens.tsv, anchors-<doc>.tsv, summary.txt
"""
import re
import sys
from pathlib import Path

KF_RE = re.compile(r"@keyframes\s+([\w-]+)\s*\{")
VAR_DEF_RE = re.compile(r"(--[\w-]+)\s*:\s*([^;}]+)")
# anchors we can check mechanically in RE docs
ANCHOR_RES = [
    re.compile(r"(--(?:sand|cursor|ui|panel)[\w-]+)"),
    re.compile(r"\b((?:sand|ui)-[a-z0-9]{5,8}(?:-B)?)\b"),
]


def read_css(root: Path) -> str:
    return "\n".join(p.read_text(errors="replace") for p in sorted((root / "dist/renderer").rglob("*.css")))


def read_js(root: Path) -> str:
    return "\n".join(p.read_text(errors="replace") for p in sorted((root / "dist/renderer").rglob("*.js")))


def block_after(text: str, start: int) -> str:
    depth, i = 0, start
    while i < len(text):
        c = text[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
        i += 1
    return text[start:]


def keyframes(css: str) -> dict[str, str]:
    out = {}
    for m in KF_RE.finditer(css):
        out[m.group(1)] = block_after(css, m.end() - 1)
    return out


def root_tokens(css: str) -> dict[str, str]:
    """first definition per (selector-ish scope) is too fuzzy; keep all defs joined."""
    defs: dict[str, list[str]] = {}
    for m in VAR_DEF_RE.finditer(css):
        defs.setdefault(m.group(1), []).append(m.group(2).strip())
    return {k: " | ".join(dict.fromkeys(v)) for k, v in defs.items()}


def main() -> None:
    a, b, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    docs = [Path(p) for p in sys.argv[4:]]
    out.mkdir(parents=True, exist_ok=True)
    css_a, css_b = read_css(a), read_css(b)
    js_a, js_b = read_js(a), read_js(b)
    kf_a, kf_b = keyframes(css_a), keyframes(css_b)
    tk_a, tk_b = root_tokens(css_a), root_tokens(css_b)
    lines = []
    with open(out / "keyframes.tsv", "w") as f:
        f.write("name\tstatus\n")
        for n in sorted(set(kf_a) | set(kf_b)):
            st = "removed" if n not in kf_b else "added" if n not in kf_a else "same" if kf_a[n] == kf_b[n] else "changed"
            f.write(f"{n}\t{st}\n")
    kc = {s: 0 for s in ("same", "changed", "added", "removed")}
    for n in set(kf_a) | set(kf_b):
        kc["removed" if n not in kf_b else "added" if n not in kf_a else "same" if kf_a[n] == kf_b[n] else "changed"] += 1
    lines.append(f"keyframes 0781={len(kf_a)} 110={len(kf_b)} {kc}")
    with open(out / "tokens.tsv", "w") as f:
        f.write("token\tstatus\t0781\t110\n")
        tc = {s: 0 for s in ("same", "changed", "added", "removed")}
        for n in sorted(set(tk_a) | set(tk_b)):
            va, vb = tk_a.get(n, ""), tk_b.get(n, "")
            st = "removed" if n not in tk_b else "added" if n not in tk_a else "same" if va == vb else "changed"
            tc[st] += 1
            if st != "same":
                f.write(f"{n}\t{st}\t{va[:200]}\t{vb[:200]}\n")
    lines.append(f"css vars 0781={len(tk_a)} 110={len(tk_b)} {tc}")
    cls_a = set(re.findall(r"\.((?:sand|ui)-[a-z0-9]+(?:-B)?)\b", css_a))
    cls_b = set(re.findall(r"\.((?:sand|ui)-[a-z0-9]+(?:-B)?)\b", css_b))
    lines.append(f"atomic classes 0781={len(cls_a)} 110={len(cls_b)} kept={len(cls_a & cls_b)} removed={len(cls_a - cls_b)} added={len(cls_b - cls_a)}")
    all_a, all_b = css_a + js_a, css_b + js_b
    for d in docs:
        anchors = sorted({m.group(1) for r in ANCHOR_RES for m in r.finditer(d.read_text())})
        miss, chg, ok = [], [], 0
        with open(out / f"anchors-{d.stem}.tsv", "w") as f:
            f.write("anchor\tin0781\tin110\tnote\n")
            for an in anchors:
                ia, ib = an in all_a, an in all_b
                note = ""
                if an.startswith("--") and an in tk_a and an in tk_b and tk_a[an] != tk_b[an]:
                    note = f"VALUE {tk_a[an][:80]} -> {tk_b[an][:80]}"
                    chg.append(an)
                if an in kf_a and an in kf_b and kf_a[an] != kf_b[an]:
                    note = "KEYFRAMES-BODY-CHANGED"
                    chg.append(an)
                if ia and not ib:
                    miss.append(an)
                f.write(f"{an}\t{int(ia)}\t{int(ib)}\t{note}\n")
                ok += ia and ib and not note
        lines.append(f"{d.stem}: anchors={len(anchors)} intact={ok} gone_in_110={len(miss)} value_changed={len(chg)} :: gone={miss[:25]} changed={chg[:15]}")
    (out / "summary.txt").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
