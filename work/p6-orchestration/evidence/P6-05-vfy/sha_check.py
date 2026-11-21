#!/usr/bin/env python3
"""P6-05 独立校验：段落 sha256 与两处 persona prefix 逐字节一致（verifier 自写，不复用 builder 探针逻辑）。"""
import hashlib
import json
import sys

WT = "/tmp/bot-wt/P6-05"
APPROVAL = f"{WT}/app/sdk/profile/patches/approval.yml"
P6YML = f"{WT}/app/sdk/profile/patches/p6-reply-style.yml"
D3META = "/tmp/bot-wt/P6-05/work/p6-orchestration/evidence/D3/raw/run-meta.json"
EXPECTED = "c7c53cd4e281e361191cbdecf873d2c6c5a5d9d7e56277091bf0d54a9734b356"

def lines(p):
    with open(p, encoding="utf-8") as f:
        return f.read().split("\n")

def indent_of(s):
    return len(s) - len(s.lstrip(" "))

def find_block(rows, header):
    """header 行（如 '- id: preset-standard'）到同级下一个 header 的行区间。"""
    starts = [i for i, l in enumerate(rows) if l == header]
    if len(starts) != 1:
        sys.exit(f"FAIL: {header} 出现 {len(starts)} 次")
    s = starts[0]
    base_ind = indent_of(rows[s])
    e = len(rows)
    for k in range(s + 1, len(rows)):
        if rows[k].startswith(" ") is False and rows[k].startswith("- id:") and indent_of(rows[k]) == base_ind and k > s:
            e = k
            break
        if indent_of(rows[k]) == base_ind and rows[k].lstrip().startswith("- id:") and k > s:
            e = k
            break
    return rows[s:e]

def persona_prefix(block, label):
    """块内 persona 子项的 prefix 值：literal block（'prefix: |'）全文，dedent，clip 掐尾。"""
    for i, l in enumerate(block):
        if l.strip() == "- id: persona":
            j = i
            break
    else:
        sys.exit(f"FAIL: {label} 无 persona")
    # 找 persona 子块内的 prefix: | 行
    pfx = None
    for k in range(j + 1, len(block)):
        st = block[k].strip()
        ind = indent_of(block[k])
        if st.startswith("- id:") and ind <= indent_of(block[j]):
            break  # persona 子块结束
        if st == "prefix: |":
            pfx = k
            break
        if st.startswith("prefix: ") and not st.endswith("|"):
            return st[len("prefix: "):]  # 裸标量
    if pfx is None:
        sys.exit(f"FAIL: {label} persona 无 prefix")
    ci = indent_of(block[pfx]) + 2  # literal 内容缩进 = 键缩进 + 2
    out = []
    for k in range(pfx + 1, len(block)):
        l = block[k]
        if l.strip() == "":
            out.append("")
            continue
        if indent_of(l) < ci:
            break
        out.append(l[ci:])
    while out and out[-1] == "":
        out.pop()
    return "\n".join(out)

rows_p6 = lines(P6YML)
p6_block = find_block(rows_p6, "    - id: preset-p6-reply")
p6_prefix = persona_prefix(p6_block, "p6-reply")

rows_ap = lines(APPROVAL)
std_block = find_block(rows_ap, "- id: preset-standard")
std_prefix = persona_prefix(std_block, "preset-standard")

cut = p6_prefix.find("\n\n")
if cut < 0:
    sys.exit("FAIL: p6-reply prefix 无空行分段")
base, section = p6_prefix[:cut], p6_prefix[cut + 2:]

sha = hashlib.sha256(section.encode("utf-8")).hexdigest()
meta = json.load(open(D3META, encoding="utf-8"))

print(f"base 句        : {base!r}")
print(f"段落长度       : {len(section)} 字符")
print(f"段落 sha256    : {sha}")
print(f"D3 run-meta    : {meta['presetSectionSha256']}")
ok = True
if sha != EXPECTED:
    print(f"FAIL: sha256 != 报告值 {EXPECTED}")
    ok = False
if meta["presetSectionSha256"] != sha:
    print("FAIL: 与 D3 run-meta presetSectionSha256 不一致")
    ok = False
if base != meta.get("personaBaseFirstLine"):
    print(f"FAIL: base 句 != run-meta personaBaseFirstLine {meta.get('personaBaseFirstLine')!r}")
    ok = False
if std_prefix != base + "\n\n" + section:
    print("FAIL: approval.yml standard prefix != p6-reply prefix（逐字节）")
    print(f"  standard: {std_prefix[:80]!r}...")
    ok = False
else:
    print("approval.yml standard persona prefix == p6-reply prefix（逐字节一致，含 base 句 + 空行 + 段落）")
# 段落在 approval.yml 里的部分也单独比对（防 base/section 拼接掩盖差异）
cut2 = std_prefix.find("\n\n")
if cut2 < 0 or std_prefix[cut2 + 2:] != section:
    print("FAIL: approval.yml 内段落部分与 p6-reply 段落不一致")
    ok = False
print("RESULT:", "PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)
