"""python3 -m pytest ~/bot/.claude/hooks/test_process_guard.py -q"""
import json
import os
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(__file__))
import process_guard as g  # noqa: E402


def _transcript(model: str) -> str:
    f = tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False)
    f.write(json.dumps({"message": {"model": model}}) + "\n")
    f.close()
    return f.name


def run(cmd: str, model: str = "glm-5.3") -> str | None:
    return g.decide({"tool_name": "Bash", "tool_input": {"command": cmd}, "transcript_path": _transcript(model)})


def test_incident_command_blocked_even_for_opus():
    assert run("pkill -x -P 1 2>/dev/null || true", "claude-opus-5-5")


def test_power_and_session_blocked():
    for c in ["sudo reboot", "systemctl poweroff", "loginctl terminate-user lingxufeng",
              "gnome-session-quit --logout", "systemctl isolate multi-user.target", "init 6"]:
        assert run(c, "claude-opus-5-5"), c


def test_kill_special_targets_blocked():
    for c in ["kill -9 -1", "kill 1", "kill -TERM -1234", "kill %1", "sudo kill 1234", "killall node",
              "fuser -k 8080/tcp", "bash -c 'kill -9 -1'"]:
        assert run(c, "claude-opus-5-5"), c


def test_glm_can_kill_sandbox_pid():
    p = subprocess.Popen(["sleep", "30"], cwd="/home/lingxufeng/bot")
    try:
        assert run(f"kill {p.pid}", "glm-5.3") is None
    finally:
        p.kill()


def test_systemctl_user_only_bot_units():
    assert run("systemctl --user restart pbots-host", "glm-5.3") is None
    assert run("systemctl --user stop litellm", "glm-5.3")


def test_bot_reap_allowed():
    assert run("~/bot/scripts/bot-reap --match T-12", "glm-5.3") is None


def test_opus_kill_literal_pid_in_sandbox_ok():
    p = subprocess.Popen(["sleep", "30"], cwd="/home/lingxufeng/bot")
    try:
        assert run(f"kill {p.pid}", "claude-opus-5-5") is None
        assert run(f"kill -9 {p.pid}", "claude-opus-5-5") is None
    finally:
        p.kill()


def test_opus_kill_outside_sandbox_blocked():
    p = subprocess.Popen(["sleep", "30"], cwd="/tmp")
    try:
        assert "沙箱" in run(f"kill {p.pid}", "claude-opus-5-5")
    finally:
        p.kill()


def test_opus_kill_non_literal_blocked():
    assert run("kill $(pgrep -x node)", "claude-opus-5-5")


def test_harmless_commands_pass():
    for c in ["pgrep -x node", "kill -0 1234", "kill -l", "ps aux | grep kill",
              'git commit -m "kill -9 restart keeps sessions"',
              "cat >> LOG.md << 'EOF'\npkill -f foo was bad\nEOF\necho done",
              "timeout 30 node x.mjs", "npx vitest run"]:
        assert run(c) is None, c
