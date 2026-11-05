#!/usr/bin/env python3
"""P6-05 豁免面变异测试：改 approval.yml 各字段 → 跑 drift 用例 → 期望红/绿，最后恢复并核对。"""
import hashlib
import os
import shutil
import subprocess
import sys

WT = "/tmp/bot-wt/P6-05"
YML = f"{WT}/app/sdk/profile/patches/approval.yml"
SDK = f"{WT}/app/sdk"
BAK = "/tmp/bot-p6-05-vfy/approval.yml.bak"
os.makedirs("/tmp/bot-p6-05-vfy", exist_ok=True)
shutil.copyfile(YML, BAK)
orig_sha = hashlib.sha256(open(YML, "rb").read()).hexdigest()

def run_drift():
    env = dict(os.environ, HOME="/tmp/bot-p6-05-vfy-mut")
    os.makedirs(env["HOME"], exist_ok=True)
    r = subprocess.run(
        ["pnpm", "vitest", "run", "tests/e2e/guard-plugin-manager.test.ts", "-t", "drift"],
        cwd=SDK, env=env, capture_output=True, text=True, timeout=300,
    )
    return r.returncode, r.stdout[-600:]

def load():
    return open(YML, encoding="utf-8").read().split("\n")

def save(rows):
    with open(YML, "w", encoding="utf-8") as f:
        f.write("\n".join(rows))

def block_range(rows, header):
    s = rows.index(header)
    ind = len(header) - len(header.lstrip(" "))
    e = len(rows)
    for k in range(s + 1, len(rows)):
        if rows[k].lstrip().startswith("- id:") and len(rows[k]) - len(rows[k].lstrip(" ")) == ind:
            e = k
            break
    return s, e

def edit_in_block(header, old, new, count=1):
    rows = load()
    s, e = block_range(rows, header)
    hit = 0
    for k in range(s, e):
        if rows[k] == old:
            rows[k] = new
            hit += 1
            if hit >= count:
                break
    if hit != count:
        sys.exit(f"FAIL: 在 {header} 内没找到 {count} 处 {old!r}（命中 {hit}）")
    save(rows)

STD = "- id: preset-standard"
COR = "- id: preset-cordis"

def m1():
    # persona name（standard 块内）
    edit_in_block(STD, "        name: '@deepseek-ai/dsh-persona'", "        name: '@deepseek-ai/dsh-persona-x'")

def m2():
    # 非 persona 字段：agent-instructions maxBytes（standard 块内）
    edit_in_block(STD, "          maxBytes: 65536", "          maxBytes: 65537")

def m3():
    # cordis 块内字段（豁免明确只对 standard）
    edit_in_block(COR, "        disabled: true", "        disabled: false")

def m4():
    # standard persona prefix 的 base 句（豁免值本身 → 预期绿）
    edit_in_block(STD, "            You are a coding agent powered by the {{model}} model.",
                  "            You are a coding agent powered by the {{model}} model!")

def m5():
    # persona config 内 prefix 之外新增一个键（ ours-only → 检验豁免是否吞掉它）
    rows = load()
    s, e = block_range(rows, STD)
    tgt = None
    for k in range(s, e):
        if rows[k].strip() == "- id: agent-instructions":
            tgt = k
            break
    if tgt is None:
        sys.exit("FAIL: 没找到 agent-instructions 行")
    rows.insert(tgt, "          suffix: probe-only")
    save(rows)

MUTS = [
    ("M1 persona name 漂移（standard）", m1, "RED"),
    ("M2 agent-instructions maxBytes 漂移（standard）", m2, "RED"),
    ("M3 cordis 块 disabled 漂移", m3, "RED"),
    ("M4 standard persona prefix base 句漂移（豁免值本身）", m4, "GREEN"),
    ("M5 persona config 新增 suffix 键（豁免面边界）", m5, "观察"),
]

results = []
for name, fn, expect in MUTS:
    shutil.copyfile(BAK, YML)
    fn()
    code, out = run_drift()
    verdict = "RED" if code != 0 else "GREEN"
    mark = "OK" if (expect == "观察" or verdict == expect) else "UNEXPECTED"
    results.append((name, expect, verdict, mark))
    print(f"{name}: 期望={expect} 实际={verdict} => {mark}")
    if verdict == "RED":
        for l in out.split("\n"):
            if "AssertionError" in l or "expect(received)" in l:
                print(f"   红因: {l.strip()[:160]}")
                break
    shutil.copyfile(BAK, YML)

now_sha = hashlib.sha256(open(YML, "rb").read()).hexdigest()
print(f"恢复核对: {'一致' if now_sha == orig_sha else '不一致!!'} ({now_sha[:16]}...)")
bad = [r for r in results if r[3] == "UNEXPECTED"]
print("RESULT:", "PASS" if not bad and now_sha == orig_sha else "FAIL")
sys.exit(0 if not bad and now_sha == orig_sha else 1)
