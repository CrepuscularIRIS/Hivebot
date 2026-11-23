#!/usr/bin/env python3
"""fresh-boot A3/A4 断言判据（纠错轮五抽出：4b922fde 复测 #5——判据不可测=反例防不住）。

单一真源：fresh-boot.sh 调 main()（文件层证据），单元测试调 judge_sessions()（合成事件）。
判词语义见 fresh-boot.sh 内注释；此处只维护判定逻辑本身。
"""
import glob
import io
import json
import os
import sys

INJECTED_PREFIXES = ("[Bot team setup]", "[Message from Chief]", "<system-reminder>",
                     "Current runtime context", "Time sampled while preparing")
WRITE_TOOLS = ("write", "edit", "bash", "pwsh")
WS_MARKERS = ("boot-check.txt", "bot/workspace/boot-check")
ORCHESTRATION_TOOLS = ("create_bot", "message_bot", "list_bots")


def _user_text(ev):
    for part in ev.get("data", {}).get("content", []):
        if isinstance(part, dict) and part.get("type") == "text":
            return part.get("text", "")
    return ""


def _is_human_user(ev):
    if ev.get("type") != "user/message":
        return False
    return not _user_text(ev).lstrip().startswith(INJECTED_PREFIXES)


def _writes_marker(ev):
    """落盘调用与 marker 的因果绑定：write/edit 只认 path 类参数；bash/pwsh 认写入形态（重定向/tee/heredoc）。"""
    name = ev.get("data", {}).get("name", "")
    if name in ("write", "edit"):
        args_obj = ev.get("data", {}).get("arguments") or {}
        if isinstance(args_obj, str):
            try:
                args_obj = json.loads(args_obj)
            except ValueError:
                args_obj = {}
        items = args_obj.items() if isinstance(args_obj, dict) else []
        path_args = " ".join(str(v) for k, v in items
                             if isinstance(v, str) and ("path" in k.lower() or k.lower() in ("file", "file_path", "target")))
        return any(mk in path_args for mk in WS_MARKERS)
    if name in ("bash", "pwsh"):
        args = json.dumps(ev.get("data", {}).get("arguments", ""))
        return any(mk in args for mk in WS_MARKERS) and any(op in args for op in (">", "tee ", "tee\n", "<<"))
    return False


def judge_sessions(sessions):
    """sessions: {会话标识: [事件dict, ...]} → {"A3": PASS|FAIL|SKIP, "A4-worker": bool, "A4-chief": bool}。

    A3: 'Chief of Staff' 人格开场必须出现在首条人类 user 消息之前（真 kickoff），否则该会话 FAIL；
        无开场=SKIP（无 UI 流程未释放 kickoff，不掩盖）。
    A4-worker: 某会话写了 marker（路径级因果）且全程无编排工具 = 真委派落盘。
    A4-chief: 某会话有编排工具 = Chief 派活。
    """
    a3 = "SKIP"
    a4w = a4c = False
    for evs in sessions.values():
        for i, ev in enumerate(evs):
            if ev.get("type") != "assistant/message":
                continue
            content = (ev.get("data", {}) or {}).get("message", {}).get("content", [])
            texts = [p.get("text", "") for p in content if isinstance(p, dict) and p.get("type") == "text"]
            if any("Chief of Staff" in x for x in texts):
                a3 = "PASS" if not any(_is_human_user(e) for e in evs[:i]) else "FAIL"
                break
        calls = [e.get("data", {}).get("name", "") for e in evs if e.get("type") == "tool/call"]
        if any(_writes_marker(e) for e in evs if e.get("type") == "tool/call") \
                and not any(c in ORCHESTRATION_TOOLS for c in calls):
            a4w = True
        if any(c in ORCHESTRATION_TOOLS for c in calls):
            a4c = True
    return {"A3": a3, "A4-worker": a4w, "A4-chief": a4c}


def main():
    import zstandard
    fresh = os.environ.get("DSBOT_TRIAL", "/tmp/dsbot-trial") + "/home-fresh"
    files = sorted(glob.glob(fresh + "/.ds-bot/sessions/**/session-*/session.v4.jsonl.zstd", recursive=True))
    dec = zstandard.ZstdDecompressor()
    sessions = {}
    for f in files:
        with open(f, "rb") as fh:
            t = io.TextIOWrapper(dec.stream_reader(fh), encoding="utf-8").read()
        sessions[f] = [json.loads(line) for line in t.splitlines() if line.strip()]
    v = judge_sessions(sessions)
    print("A3={} A4-worker={} A4-chief={}".format(v["A3"], "PASS" if v["A4-worker"] else "FAIL",
                                                  "PASS" if v["A4-chief"] else "FAIL"))


if __name__ == "__main__":
    sys.exit(main())
