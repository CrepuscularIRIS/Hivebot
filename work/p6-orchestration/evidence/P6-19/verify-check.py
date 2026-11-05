"""P6-19 独立校验：JSON 可解析、16 条计数、expect 结构化字段、提示约束（中文/≤2句/无工具名）。"""
import json, re, sys
from collections import Counter

path = sys.argv[1]
data = json.loads(open(path, encoding="utf-8").read())
cases = data["cases"]
errors = []

# 计数：直接答 4 / 单派 4 / 并行 2 / 追加 2 / 停止 2 / 闲聊 2 = 16
want = {"direct": 4, "single": 4, "parallel": 2, "attach": 2, "stop": 2, "chat": 2}
c = Counter(x["kind"] for x in cases)
if len(cases) != 16:
    errors.append(f"total={len(cases)} != 16")
for k, v in want.items():
    if c.get(k, 0) != v:
        errors.append(f"kind {k}: {c.get(k, 0)} != {v}")

# expect 结构化字段逐 kind 断言（route/createCalls/stopCalls）
ROUTE = {"direct": ("direct-answer", 0, 0), "single": ("create", 1, 0),
         "parallel": ("create", 2, 0), "attach": ("send", 0, 0),
         "stop": ("stop", 0, 1), "chat": ("ignore", 0, 0)}
for case in cases:
    ex = case.get("expect", {})
    r, cc, sc = ROUTE[case["kind"]]
    cid = case.get("id", "?")
    if ex.get("route") != r:
        errors.append(f"{cid}: route={ex.get('route')} != {r}")
    if ex.get("createCalls") != cc:
        errors.append(f"{cid}: createCalls={ex.get('createCalls')} != {cc}")
    if ex.get("stopCalls") != sc:
        errors.append(f"{cid}: stopCalls={ex.get('stopCalls')} != {sc}")
    if not {"route", "createCalls", "stopCalls"} <= set(ex):
        errors.append(f"{cid}: expect 缺结构化字段")
    # 两回合条目：追加/停止必须 turns 恰 2；其余必须是单 prompt
    if case["kind"] in ("attach", "stop"):
        if len(case.get("turns", [])) != 2:
            errors.append(f"{cid}: turns={len(case.get('turns', []))} != 2")
    elif "prompt" not in case:
        errors.append(f"{cid}: 缺 prompt")

# 计分点在 turn[1] 需在文件内声明
if "turn[1]" not in data.get("note", ""):
    errors.append("note 未声明 turn[1] 为计分回合")

# 提示约束：中文口语（含 CJK）、≤2 句、无工具名/路由实现措辞
CN_WORDS = ["create_bot", "stop_bot", "send_message", "worker", "bot", "agent",
            "session", "orchestr", "delegate", "spawn", "工具", "路由", "委派", "调度", "派工", "派个", "派一"]
ASCII_WORDS = ["create", "stop", "send", "bot", "worker", "agent", "session", "tool"]
for case in cases:
    texts = case.get("turns") or [case["prompt"]]
    for i, t in enumerate(texts):
        if not re.search(r"[一-鿿]", t):
            errors.append(f"{case['id']}#{i}: 无中文")
        sents = [s for s in re.split(r"[。！？!?]", t) if s.strip()]
        if len(sents) > 2:
            errors.append(f"{case['id']}#{i}: {len(sents)} 句 > 2")
        low = t.lower()
        for w in CN_WORDS:
            if w in low:
                errors.append(f"{case['id']}#{i}: 含工具/路由措辞「{w}」")
        for w in ASCII_WORDS:
            if re.search(rf"\b{w}\b", low):
                errors.append(f"{case['id']}#{i}: 含英文工具词「{w}」")

print(f"total={len(cases)} kinds={dict(c)}")
print("PASS: all checks satisfied" if not errors else "FAIL")
for e in errors:
    print(" -", e)
sys.exit(1 if errors else 0)
