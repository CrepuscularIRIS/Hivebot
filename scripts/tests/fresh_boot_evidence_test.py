#!/usr/bin/env python3
"""A3/A4 判据回归（4b922fde 复测 #5 的两个反例 + 正例）。

反例一（Chief 自写 marker）：旧判据「有 write 调用即算 worker」会把 Chief 误判成 worker → A4 假绿。
反例二（无关会话只调无关工具）：旧判据「调过落盘类工具」这种弱信号会被无关 bash 命中 → A4 假绿。
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from fresh_boot_evidence import judge_sessions  # noqa: E402


def assistant(text):
    return {"type": "assistant/message", "data": {"message": {"content": [{"type": "text", "text": text}]}}}


def human(text):
    return {"type": "user/message", "data": {"content": [{"type": "text", "text": text}]}}


def tool_call(name, arguments):
    return {"type": "tool/call", "data": {"name": name, "arguments": arguments}}


MARKER_WRITE = lambda: tool_call("write", {"file_path": "/ws/boot-check.txt", "content": "ok"})  # noqa: E731
DELEGATE = lambda: tool_call("create_bot", {"name": "w1"})  # noqa: E731


class A4Causality(unittest.TestCase):
    def test_normal_delegation_all_pass(self):
        v = judge_sessions({
            "chief": [human("do it"), DELEGATE()],
            "worker": [MARKER_WRITE()],
        })
        self.assertTrue(v["A4-worker"])
        self.assertTrue(v["A4-chief"])

    def test_counterexample_chief_writes_marker_itself(self):
        # 复测 #5 反例：Chief 自写 marker（编排+落盘同会话）——worker 断言必须 FAIL，不得假绿
        v = judge_sessions({"chief": [human("fine, I'll do it"), DELEGATE(), MARKER_WRITE()]})
        self.assertFalse(v["A4-worker"])
        self.assertTrue(v["A4-chief"])

    def test_counterexample_unrelated_session_only_unrelated_tools(self):
        # 复测 #5 反例：另一会话只调无关工具（bash 读文件），无人真写 marker —— A4-worker 必须 FAIL
        v = judge_sessions({
            "chief": [human("go"), DELEGATE()],
            "bystander": [tool_call("bash", {"command": "grep boot-check /ws/log.txt || true"})],
        })
        self.assertFalse(v["A4-worker"])

    def test_bash_write_form_counts_grep_does_not(self):
        yes = judge_sessions({"w": [tool_call("bash", {"command": "echo ok > /ws/boot-check.txt"})]})
        no = judge_sessions({"w": [tool_call("bash", {"command": "cat /ws/boot-check.txt"})]})
        self.assertTrue(yes["A4-worker"])
        self.assertFalse(no["A4-worker"])

    def test_bash_redirect_away_from_marker_is_read_not_write(self):
        # 审查 F3：marker 只出现在读取源、重定向目标在别处——读取，不算落盘
        v = judge_sessions({"w": [tool_call("bash", {"command": "grep x /ws/boot-check.txt > /tmp/out.txt"})]})
        self.assertFalse(v["A4-worker"])

    def test_bash_tee_to_marker_counts(self):
        v = judge_sessions({"w": [tool_call("bash", {"command": "echo ok | tee /ws/boot-check.txt"})]})
        self.assertTrue(v["A4-worker"])

    def test_write_content_mention_is_not_a_write(self):
        # content 里提及文件名不算——只有 path 类参数命中才绑因果
        v = judge_sessions({"w": [tool_call("write", {"file_path": "/ws/notes.md", "content": "see boot-check.txt"})]})
        self.assertFalse(v["A4-worker"])

    def test_json_string_arguments_form(self):
        # 真实事件流：arguments 常为 JSON 字符串形态
        v = judge_sessions({"w": [tool_call("write", json_string_if_needed())]})
        self.assertTrue(v["A4-worker"])


def json_string_if_needed():
    import json
    return json.dumps({"file_path": "/ws/boot-check.txt", "content": "ok"})


class A3Kickoff(unittest.TestCase):
    def test_kickoff_before_first_human_pass(self):
        v = judge_sessions({"chief": [assistant("I am the Chief of Staff. Pick a model."), human("hi")]})
        self.assertEqual(v["A3"], "PASS")

    def test_greeting_after_user_is_not_kickoff(self):
        v = judge_sessions({"chief": [human("hi"), assistant("Chief of Staff reporting")]})
        self.assertEqual(v["A3"], "FAIL")

    def test_no_greeting_is_skip_not_fail(self):
        v = judge_sessions({"chief": [human("hi"), DELEGATE(), MARKER_WRITE()]})
        self.assertEqual(v["A3"], "SKIP")

    def test_injected_messages_do_not_count_as_human(self):
        # [Bot team setup]/<system-reminder> 等注入前缀不算人类首条——开场在其后仍是真 kickoff
        v = judge_sessions({"chief": [human("[Bot team setup] configured"), assistant("Chief of Staff here")]})
        self.assertEqual(v["A3"], "PASS")

    def test_a3_fail_in_any_session_is_final(self):
        # 审查 F3：后遍历会话不得覆盖先前会话的 FAIL
        v = judge_sessions({
            "good": [assistant("Chief of Staff reporting"), human("hi")],
            "bad": [human("hi"), assistant("Chief of Staff reporting")],
        })
        self.assertEqual(v["A3"], "FAIL")

    def test_a3_pass_in_later_session_counts(self):
        v = judge_sessions({
            "quiet": [human("hi")],
            "good": [assistant("Chief of Staff reporting"), human("hi")],
        })
        self.assertEqual(v["A3"], "PASS")


if __name__ == "__main__":
    unittest.main()
