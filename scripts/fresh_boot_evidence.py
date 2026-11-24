#!/usr/bin/env python3
"""fresh-boot A3/A4 断言判据（纠错轮五抽出：4b922fde 复测 #5——判据不可测=反例防不住）。

单一真源：fresh-boot.sh 调 main()（文件层证据），单元测试调 judge_sessions()（合成事件）。
判词语义见 fresh-boot.sh 内注释；此处只维护判定逻辑本身。
"""
import glob
import json
import os
import re
import sys

INJECTED_PREFIXES = ("[Bot team setup]", "[Message from Chief]", "<system-reminder>",
                     "Current runtime context", "Time sampled while preparing")
WRITE_TOOLS = ("write", "edit", "bash", "pwsh")
WS_MARKERS = ("boot-check.txt", "bot/workspace/boot-check")
ORCHESTRATION_TOOLS = ("create_bot", "message_bot", "list_bots")
PERSONA = "chief of staff"  # 人格开场锚（大小写不敏感：实测 Chief 会写成小写 "chief of staff"）


def _user_text(ev):
    for part in ev.get("data", {}).get("content", []):
        if isinstance(part, dict) and part.get("type") == "text":
            return part.get("text", "")
    return ""


def _is_human_user(ev):
    """人类消息 = user/message 且 source.kind == "user"（会话文件实测）。

    带 source 的一律按来源判：bot（kickoff / handoff / reply 转投）、runtime-context、
    dsh-superagent 等都是注入，不是人说的；不带 source 的合成事件回退到文本前缀规则。
    """
    if ev.get("type") != "user/message":
        return False
    source = (ev.get("data") or {}).get("source")
    if isinstance(source, dict):
        return source.get("kind") == "user"
    return not _user_text(ev).lstrip().startswith(INJECTED_PREFIXES)


def _is_kickoff_relay(ev):
    """DS-Bot bot 的 kickoff 注入（会话文件实测：source.kind=bot, form=relay, role=kickoff）。

    主 bot 与 worker 的 kickoff 同形——worker 由 create_bot 建成时也有自己的 kickoff
    （"[Bot team setup] Chief just created you…"）。所以 kickoff 本身不认身份，
    A3 只对 main_bot_ids() 认定的主 bot 会话判定。
    """
    if ev.get("type") != "user/message":
        return False
    source = (ev.get("data") or {}).get("source")
    return isinstance(source, dict) and source.get("kind") == "bot" and source.get("role") == "kickoff"


def _assistant_texts(ev):
    content = (ev.get("data") or {}).get("message", {}).get("content", [])
    return [p.get("text", "") for p in content if isinstance(p, dict) and p.get("type") == "text"]


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
        # 审查 F3：重定向/tee 的**目标**才是写入处——"grep x /ws/boot-check.txt > /tmp/out"
        # 是读取（marker 只出现在源位置），不得计为 worker 落盘。
        # 二轮：先剥 json.dumps 的 \" 转义（否则捕获会在转义引号处截断成单个反斜杠而漏判），
        # 再做目标绑定；tee 加 \b 词边界防 "sometee" 子串误配。
        args = json.dumps(ev.get("data", {}).get("arguments", "")).replace("\\", "")
        targets = re.findall(r'(?:>>?|\btee(?:\s+-a)?)\s*["\']?([^\s"\'|;&]+)', args)
        return any(any(mk in t for mk in WS_MARKERS) for t in targets)
    return False


def main_bot_ids(state):
    """DS-Bot 认定的主 bot（state.json mainBotIds[0]）及其全部聊天段的会话 id。

    镜像 DS-Bot store.js chatOf：当前段 = 条目 sessionId（空白则仍是 bot id）；openParts[] 及
    各自 segments[]、条目自己的 segments[] 也都是这个 bot 的聊天段。读不到（无 state / 无
    mainBotIds / 类型不符）回空集——空集 = 主 bot 身份未解析，调用方不得据此判 A3。
    """
    mains = state.get("mainBotIds") if isinstance(state, dict) else None
    bot_id = mains[0] if isinstance(mains, list) and mains else None
    if not isinstance(bot_id, str) or not bot_id.strip():
        return set()
    ids = {bot_id}
    entry = (state.get("bots") or {}).get(bot_id)
    if not isinstance(entry, dict):
        return ids

    def index(part):
        sid = part.get("sessionId")
        if isinstance(sid, str) and sid.strip():
            ids.add(sid)
        for seg in part.get("segments") or []:
            if isinstance(seg, dict) and isinstance(seg.get("sessionId"), str) and seg["sessionId"]:
                ids.add(seg["sessionId"])

    index(entry)
    for part in entry.get("openParts") or []:
        if isinstance(part, dict):
            index(part)
    return ids


def _is_main_session(key, main_ids):
    """会话标识可能是会话文件路径：按路径分量拆开，任一分量精确等于主 bot 的某个会话 id。"""
    return bool(main_ids) and any(part in main_ids for part in re.split(r"[/\\]+", str(key)))


def judge_a3(evs):
    """单个主 bot 会话的 A3：PASS | FAIL | SKIP。"""
    first_human = next((i for i, e in enumerate(evs) if _is_human_user(e)), None)
    for i, ev in enumerate(evs):
        if ev.get("type") != "assistant/message":
            continue
        if any(PERSONA in x.lower() for x in _assistant_texts(ev)):
            return "PASS" if (first_human is None or i < first_human) else "FAIL"
    if any(_is_kickoff_relay(e) for e in evs):
        # 开场没有 "chief of staff" 字样时的第二锚：kickoff relay 之后 Chief 先于首条人类消息开口。
        # 只把 SKIP 升为 PASS，绝不升为 FAIL——有 relay 但 Chief 没在首条人类消息前开口的仍是 SKIP（成因由 A3-reason 报）。
        first_assistant = next((i for i, e in enumerate(evs) if e.get("type") == "assistant/message"), None)
        if first_assistant is not None and (first_human is None or first_assistant < first_human):
            return "PASS"
    return "SKIP"


def judge_sessions(sessions, main_ids=None):
    """sessions: {会话标识: [事件dict, ...]} → {"A3": PASS|FAIL|SKIP, "A3-reason": str, "A4-worker": bool, "A4-chief": bool}。

    "A3-reason" 把 SKIP 的成因分开报（顾问复核 F0：同一个 SKIP 既可能是「kickoff 投了但 Chief 没先开口」，
    也可能是「主 bot 身份根本没解析到」，只看 A3=… 会把后者当正常放行）：
      judged               A3 是 PASS 或 FAIL（至少一个主 bot 会话判定完成）；
      main-bot-unresolved  读不到主 bot 身份（state.json 缺失 / 无 mainBotIds）——A3 没有被判定；
      main-session-missing 身份已解析，但没有任何会话文件属于主 bot——A3 没有被判定；
      kickoff-not-released 主 bot 会话在场，有 kickoff relay（roster.js sendKickoff 已投递）、但 Chief 在首条
                            人类消息之前没有开口（用户先写了话、开场白后来才投递，就落到这一种）；
      no-opening-evidence  主 bot 会话在场，却连 kickoff relay 都没有——roster 根本没把开场白投进来
                            （clean home 首启的主 bot 还没选模型时就是这样：greeting 存在 bot.kickoff，
                            releaseKickoff 要等它有模型）。不是「投了没开口」，不得混同。
                            这里只报成因、不决定放行：fresh-boot.sh 的 A3 只有 PASS 算过，四种 SKIP 成因一律 RC=1。

    main_ids: 主 bot 的会话 id 集合（main_bot_ids()）。A3 只对这些会话判定——worker 也有自己的
        kickoff 开场（事件形状与主 bot同形），不认身份就会被 worker 的开场顶成假 PASS；
        身份未解析（None/空集）时 A3 恒 SKIP，不报 FAIL。
    A3: 人格开场（'chief of staff'，大小写不敏感）必须出现在首条人类 user 消息之前（真 kickoff），
        否则该会话 FAIL；无开场时若有 kickoff relay 且 Chief 先于首条人类消息开口也算 PASS；
        其余=SKIP（不掩盖，也不替剧本判死）。多会话聚合：任一 FAIL 即 FAIL（最严，
        审查 F3：不允许后遍历会话的结果覆盖先前的 FAIL）。
    A4-worker: 某会话写了 marker（路径级因果）且全程无编排工具 = 真委派落盘（看全部会话）。
    A4-chief: 某会话有编排工具 = Chief 派活。
    """
    a3_results = []
    a4w = a4c = False
    for key, evs in sessions.items():
        if _is_main_session(key, main_ids):
            a3_results.append(judge_a3(evs))
        calls = [e.get("data", {}).get("name", "") for e in evs if e.get("type") == "tool/call"]
        if any(_writes_marker(e) for e in evs if e.get("type") == "tool/call") \
                and not any(c in ORCHESTRATION_TOOLS for c in calls):
            a4w = True
        if any(c in ORCHESTRATION_TOOLS for c in calls):
            a4c = True
    if "FAIL" in a3_results:
        a3, reason = "FAIL", "judged"
    elif "PASS" in a3_results:
        a3, reason = "PASS", "judged"
    elif not main_ids:
        a3, reason = "SKIP", "main-bot-unresolved"
    elif not a3_results:
        a3, reason = "SKIP", "main-session-missing"
    elif any(_is_kickoff_relay(e) for key, evs in sessions.items() if _is_main_session(key, main_ids) for e in evs):
        a3, reason = "SKIP", "kickoff-not-released"
    else:
        a3, reason = "SKIP", "no-opening-evidence"
    return {"A3": a3, "A3-reason": reason, "A4-worker": a4w, "A4-chief": a4c}


def _read_json(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def _load_events(path):
    """读一个会话文件的全部事件；引擎还在追加时最后一行可能只写了一半——只丢这半行，并在 stderr 报一声。

    实测（r21 主会话 38553 字节，逐个截断点试 3777 次）：截断落在最后一行中间时 json.loads 抛
    JSONDecodeError（7/3777）。--opening 每 3s 轮询，撞上就是判据自己崩溃而不是「还没开场」；
    终局证据那一次撞上，bash 侧拿到的就是空串、整轮没有证据地 RC=1。只容最后一行：
    中间的行坏了是真损坏，照样抛。
    """
    import zstandard
    dec = zstandard.ZstdDecompressor()
    with open(path, "rb") as fh:
        data = dec.stream_reader(fh).read()
    lines = [line for line in data.decode("utf-8", errors="replace").splitlines() if line.strip()]
    events = []
    for i, line in enumerate(lines):
        try:
            events.append(json.loads(line))
        except ValueError:
            if i != len(lines) - 1:
                raise
            print("torn tail dropped (file still being written): {}".format(path), file=sys.stderr)
    return events


def load_evidence(fresh):
    """读 fresh home 的主 bot 身份与全部会话事件（A3/A4 判定与 --opening 等待共用）。"""
    main_ids = main_bot_ids(_read_json(fresh + "/.ds-bot/bot/state.json"))
    files = sorted(glob.glob(fresh + "/.ds-bot/sessions/**/session-*/session.v4.jsonl.zstd", recursive=True))
    sessions = {}
    for f in files:
        sessions[f] = _load_events(f)
    return sessions, main_ids


def opening(fresh):
    """主 bot 是否已经在首条人类消息之前开场（A3 的 PASS 条件，单独拿来当等待条件）。

    剧本必须等到它成立才发首条编排，否则首条人类消息会抢在 kickoff 前面，A3 永远判不了。
    身份未解析 / 主会话缺失时返回 False（等不到 = 剧本失败，不猜）。
    """
    sessions, main_ids = load_evidence(fresh)
    verdicts = [judge_a3(evs) for key, evs in sessions.items() if _is_main_session(key, main_ids)]
    return "PASS" in verdicts


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    fresh = os.environ.get("DSBOT_TRIAL", "/tmp/dsbot-trial") + "/home-fresh"
    if argv[:1] == ["--opening"]:
        # 剧本轮询用：退出码 0 = 主 bot 已开场，3 = 还没有（与「判据自身出错」的其它非零码区分）。
        opened = opening(fresh)
        print("opening={}".format("yes" if opened else "no"))
        return 0 if opened else 3
    sessions, main_ids = load_evidence(fresh)
    v = judge_sessions(sessions, main_ids)
    # 一行、机器可读：fresh-boot.sh 用它区分「SKIP 可接受」与「A3 根本没被判定」。
    print("A3={} A3-reason={} A4-worker={} A4-chief={}".format(
        v["A3"], v["A3-reason"], "PASS" if v["A4-worker"] else "FAIL", "PASS" if v["A4-chief"] else "FAIL"))


if __name__ == "__main__":
    sys.exit(main())
