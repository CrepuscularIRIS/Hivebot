#!/usr/bin/env python3
"""PreToolUse(Bash) 进程沙箱：只能杀 bot 沙箱内自己起的进程，危险的批量/系统级命令一律禁止。

起因：2026-11-01 18:30 GLM verifier 跑 `pkill -x -P 1`，杀掉 systemd --user，
整个桌面会话注销、GDM 起不来，最后机器被 Ctrl+Alt+Del 重启。

规则（exit 2 = 拦截，stderr 回给模型）：
1. 所有模型都禁止：重启/关机/注销类命令；pkill、killall、fuser -k、xkill；
   kill 的目标是 -1、1、负数（进程组）或 %job；sudo 杀进程；系统级 systemctl stop/kill。
2. kill 只接受字面 PID，且目标必须属于本用户、不是自身祖先、
   cwd 或命令行落在 bot 沙箱目录（ALLOWED_ROOTS）里。任何模型都可以。
3. 按名字/任务批量清理用 scripts/bot-reap（同样的沙箱校验，见该文件）。
   2026-11-02 起取消「只许 Opus」：GLM 的正常测试清理被卡死，改为按目标而不是按模型限制。
"""
from __future__ import annotations

import json
import os
import re
import shlex
import sys

ALLOWED_ROOTS = ("/tmp/bot-wt", "/home/lingxufeng/bot", "/tmp/p2sdk", "/tmp/vfy-", "/tmp/bot-", "/dev/shm/bot-",
                 "/dev/shm/pbots")
PREFIX_WORDS = {"sudo", "exec", "nohup", "command", "builtin", "nice", "setsid", "env", "time", "stdbuf"}
SIGNAL_TOOLS = {"pkill", "killall", "xkill", "skill", "snice"}
POWER_WORDS = {"reboot", "shutdown", "poweroff", "halt", "telinit", "gnome-session-quit"}
SYSTEMCTL_POWER = {"reboot", "poweroff", "halt", "kexec", "isolate", "suspend", "hibernate",
                   "soft-reboot", "emergency", "rescue", "default", "hybrid-sleep"}
SYSTEMCTL_STOP = {"stop", "kill", "restart", "try-restart", "reload-or-restart", "mask", "disable"}
HELP = ("清理进程用 `~/bot/scripts/bot-reap <PID...>` 或 `bot-reap --match <任务id>`"
        "（只杀沙箱内进程）；沙箱外的进程写进回报交用户。见 ~/bot/CLAUDE.md §5。")


class Block(Exception):
    pass


# ---------- 命令切分 ----------

def _strip_noise(cmd: str) -> str:
    """去掉 heredoc 正文和 commit -m 文本，避免消息里出现 kill 字样误拦。"""
    cmd = re.sub(r"<<-?\s*(['\"]?)(\w+)\1[^\n]*\n.*?\n\s*\2\s*(\n|$)", "\n", cmd, flags=re.S)
    cmd = re.sub(r"""(-m|--message)\s+("(?:[^"\\]|\\.)*"|'[^']*')""", r"\1 MSG", cmd)
    return cmd


def segments(cmd: str) -> list[list[str]]:
    out: list[list[str]] = []
    for part in re.split(r"\|\||&&|[;&|\n`]|\$\(|\(|\)", _strip_noise(cmd)):
        part = part.strip()
        if not part:
            continue
        try:
            toks = shlex.split(part)
        except ValueError:
            toks = part.split()
        while toks and (toks[0] in PREFIX_WORDS or re.match(r"^\w+=", toks[0]) or toks[0].startswith("-")):
            toks = toks[1:]
        if toks:
            out.append(toks)
            # bash -c "..." / sh -c "..." 递归检查
            for i, t in enumerate(toks[:-1]):
                if os.path.basename(toks[0]) in {"bash", "sh", "zsh", "dash"} and t == "-c":
                    out.extend(segments(toks[i + 1]))
    return out


# ---------- 判定 ----------

def classify(cmd: str) -> tuple[list[str], list[list[str]]]:
    """返回 (绝对禁止的理由列表, 需要 Opus 的 kill 段)。"""
    hard: list[str] = []
    sandboxed: list[list[str]] = []
    raw_sudo_kill = re.search(r"\bsudo\b[^;&|\n]*\b(kill|pkill|killall|systemctl)\b", cmd)
    if raw_sudo_kill:
        hard.append("sudo 下的 kill/systemctl 一律禁止")
    for toks in segments(cmd):
        w = os.path.basename(toks[0])
        args = toks[1:]
        if w in POWER_WORDS or (w == "init" and args[:1] and args[0] in "0123456"):
            hard.append(f"`{w}` 会重启/关机/注销")
        elif w == "systemctl":
            verbs = [a for a in args if not a.startswith("-")]
            if verbs and verbs[0] in SYSTEMCTL_POWER:
                hard.append(f"`systemctl {verbs[0]}`")
            elif verbs and verbs[0] in SYSTEMCTL_STOP:
                if "--user" not in args:
                    hard.append("系统级 systemctl stop/kill/restart")
                else:
                    sandboxed.append(toks)
        elif w == "loginctl" and any(re.match(r"(terminate|kill|lock|poweroff|reboot|suspend)", a) for a in args):
            hard.append("`loginctl` 结束会话")
        elif w in SIGNAL_TOOLS or (w == "fuser" and any("k" in a for a in args if a.startswith("-"))):
            hard.append(f"`{w}` 按模式批量杀进程（改用 bot-reap）")
        elif w == "tmux" and any(a.startswith("kill-") for a in args):
            if "kill-server" in args:
                hard.append("`tmux kill-server`")
            else:
                sandboxed.append(toks)
        elif w == "kill":
            hard.extend(_kill_hard(args))
            if not any(a in {"-0", "-l", "-L"} for a in args):
                sandboxed.append(toks)
    return hard, sandboxed


def _kill_hard(args: list[str]) -> list[str]:
    reasons = []
    targets = _kill_targets(args)
    for t in targets:
        if t == "--":
            continue
        if t in {"1", "-1"} or re.fullmatch(r"-\d+", t) or t.startswith("%"):
            reasons.append(f"`kill {t}`：目标是 init/全部进程/进程组/作业")
    return reasons


def _kill_targets(args: list[str]) -> list[str]:
    out, skip = [], False
    for i, a in enumerate(args):
        if skip:
            skip = False
            continue
        if a in {"-s", "-n", "--signal"}:
            skip = True
            continue
        if a == "--":
            out.extend(args[i + 1:])
            break
        if re.fullmatch(r"-([A-Za-z]+|\d{1,2}|SIG\w+)", a) and not out:
            continue  # 信号参数
        out.append(a)
    return out


# ---------- 模型与目标检查 ----------

def _ancestors() -> set[int]:
    pids, pid = set(), os.getpid()
    while pid > 1:
        pids.add(pid)
        try:
            with open(f"/proc/{pid}/stat") as f:
                pid = int(f.read().rsplit(")", 1)[1].split()[1])
        except (OSError, ValueError, IndexError):
            break
    return pids


def check_kill(toks: list[str]) -> None:
    if toks[0] == "systemctl":
        units = [a for a in toks[1:] if not a.startswith("-")][1:]
        if not units or not all(u.startswith(("pbots", "bot")) for u in units):
            raise Block("systemctl --user stop/kill/restart 只能作用于 pbots* / bot* 单元")
        return
    if toks[0] != "kill":
        return  # tmux kill-session：作用于自己的会话
    targets = [t for t in _kill_targets(toks[1:]) if t != "--"]
    if not targets:
        raise Block("kill 没有目标 PID")
    anc = _ancestors()
    for t in targets:
        if not t.isdigit():
            raise Block(f"kill 只接受字面 PID，`{t}` 无法静态检查（先 pgrep -x 拿 PID）")
        pid = int(t)
        if pid in anc:
            raise Block(f"PID {pid} 是当前会话的祖先进程")
        try:
            if os.stat(f"/proc/{pid}").st_uid != os.getuid():
                raise Block(f"PID {pid} 不属于当前用户")
            with open(f"/proc/{pid}/cmdline", "rb") as f:
                cmdline = f.read().replace(b"\0", b" ").decode("utf-8", "ignore")
            cwd = os.readlink(f"/proc/{pid}/cwd")
        except FileNotFoundError:
            continue  # 已退出，无害
        except PermissionError:
            raise Block(f"PID {pid} 无法检查")
        if not any(cwd.startswith(r) or r in cmdline for r in ALLOWED_ROOTS):
            raise Block(f"PID {pid}（{cmdline[:80]}，cwd={cwd}）不在 bot 沙箱目录内")


def decide(data: dict) -> str | None:
    """返回拦截理由；None = 放行。"""
    if data.get("tool_name") != "Bash":
        return None
    cmd = (data.get("tool_input") or {}).get("command", "")
    hard, sandboxed = classify(cmd)
    if hard:
        return "进程沙箱拦截：" + "；".join(dict.fromkeys(hard)) + "。" + HELP
    if not sandboxed:
        return None
    try:
        for toks in sandboxed:
            check_kill(toks)
    except Block as e:
        return f"进程沙箱拦截：{e}。" + HELP
    return None


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0
    reason = decide(data)
    if reason:
        print(reason, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
