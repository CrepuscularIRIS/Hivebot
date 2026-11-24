#!/usr/bin/env python3
"""A3/A4 判据回归（4b922fde 复测 #5 的两个反例 + 正例）。

反例一（Chief 自写 marker）：旧判据「有 write 调用即算 worker」会把 Chief 误判成 worker → A4 假绿。
反例二（无关会话只调无关工具）：旧判据「调过落盘类工具」这种弱信号会被无关 bash 命中 → A4 假绿。
反例三（worker 的 kickoff 冒充主 bot 开场）：worker 由 create_bot 建成时也有同形的 kickoff 注入，
  且先于任何人类消息开口——A3 只认 state.json mainBotIds[0] 的会话，否则无 UI 流程也会假 PASS。
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import fresh_boot_evidence as evidence  # noqa: E402
from fresh_boot_evidence import judge_sessions, main_bot_ids  # noqa: E402


def assistant(text):
    return {"type": "assistant/message", "data": {"message": {"content": [{"type": "text", "text": text}]}}}


def human(text):
    return {"type": "user/message", "data": {"content": [{"type": "text", "text": text}],
                                           "source": {"kind": "user"}}}


def relay(text, role):
    # DS-Bot 转投进会话的 bot 消息（kickoff/handoff/reply 同形：source.kind=bot）
    return {"type": "user/message", "data": {"content": [{"type": "text", "text": text}],
                                             "source": {"kind": "bot", "form": "relay", "role": role}}}


def tool_call(name, arguments):
    return {"type": "tool/call", "data": {"name": name, "arguments": arguments}}


MARKER_WRITE = lambda: tool_call("write", {"file_path": "/ws/boot-check.txt", "content": "ok"})  # noqa: E731
DELEGATE = lambda: tool_call("create_bot", {"name": "w1"})  # noqa: E731


def kickoff_relay(text="[Bot team setup] greet"):
    # DS-Bot bot 的 kickoff 注入事件形状（会话文件实测：source.kind=bot, form=relay, role=kickoff）。
    # 主 bot 与 worker 的 kickoff 同形（worker 的是 "[Bot team setup] Chief just created you…"）——
    # 只有 state.json 的 mainBotIds 能区分谁是主 bot。
    return relay(text, "kickoff")


def judge(sessions, main=("chief",)):
    # A3 只对主 bot 会话判定：main = state.json 认定的主 bot 及其各聊天段的会话标识
    return judge_sessions(sessions, set(main))


class MainBotIdentity(unittest.TestCase):
    def test_main_bot_and_all_its_parts_only(self):
        raw = {"mainBotIds": ["chief"], "bots": {
            "chief": {"sessionId": "chief-part-2",
                       "openParts": [{"sessionId": "chief-part-3", "segments": [{"sessionId": "chief-part-1"}]}],
                       "segments": [{"sessionId": "chief-part-0"}]},
            "worker": {"sessionId": "w", "segments": [{"sessionId": "w-seg"}]}}}
        self.assertEqual(main_bot_ids(raw),
                         {"chief", "chief-part-2", "chief-part-3", "chief-part-1", "chief-part-0"})

    def test_blank_session_id_falls_back_to_bot_id(self):
        self.assertEqual(main_bot_ids({"mainBotIds": ["chief"], "bots": {"chief": {"sessionId": "  "}}}), {"chief"})

    def test_missing_or_broken_state_is_empty(self):
        self.assertEqual(main_bot_ids({}), set())
        self.assertEqual(main_bot_ids({"mainBotIds": []}), set())
        self.assertEqual(main_bot_ids({"mainBotIds": "chief"}), set())
        self.assertEqual(main_bot_ids(None), set())


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

    def test_bash_quoted_redirect_target_counts(self):
        # 二轮：json.dumps 转义形态（\"boot-check.txt\"）不得截断目标——仍须命中 marker
        v = judge_sessions({"w": [tool_call("bash", {"command": 'echo ok > "boot-check.txt"'})]})
        self.assertTrue(v["A4-worker"])

    def test_bash_substring_tee_word_does_not_match(self):
        # 二轮：tee 无词边界时 "sometee" 子串误配——加 \\b 后不得命中
        v = judge_sessions({"w": [tool_call("bash", {"command": "sometee /ws/boot-check.txt"})]})
        self.assertFalse(v["A4-worker"])

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
        v = judge({"chief": [assistant("I am the Chief of Staff. Pick a model."), human("hi")]})
        self.assertEqual(v["A3"], "PASS")

    def test_greeting_after_user_is_not_kickoff(self):
        v = judge({"chief": [human("hi"), assistant("Chief of Staff reporting")]})
        self.assertEqual(v["A3"], "FAIL")

    def test_no_greeting_is_skip_not_fail(self):
        v = judge({"chief": [human("hi"), DELEGATE(), MARKER_WRITE()]})
        self.assertEqual(v["A3"], "SKIP")

    def test_injected_messages_do_not_count_as_human(self):
        # [Bot team setup]/<system-reminder> 等注入前缀不算人类首条——开场在其后仍是真 kickoff
        v = judge({"chief": [relay("[Bot team setup] configured", "kickoff"), assistant("Chief of Staff here")]})
        self.assertEqual(v["A3"], "PASS")

    def test_lowercase_persona_wording_still_counts(self):
        # UI 二轮实测：开场写成 "your Bot team's chief of staff"（小写）——旧判据大小写敏感，A3 假 SKIP
        v = judge({"chief": [relay("[Bot team setup] greet", "kickoff"),
                            assistant("Hey — I'm Chief, your Bot team's chief of staff. 👋"), human("do it")]})
        self.assertEqual(v["A3"], "PASS")

    def test_released_kickoff_without_persona_phrase_passes(self):
        # kickoff 已释放（Chief 在首条人类消息前开口）但开场没有 "chief of staff" 字样：以 kickoff relay 为锚 → PASS
        v = judge({"chief": [kickoff_relay(), assistant("Hey, I'm Chief."), human("do it")]})
        self.assertEqual(v["A3"], "PASS")

    def test_unreleased_kickoff_stays_skip(self):
        # kickoff relay 在场但 Chief 没先开口——判据层保持 SKIP（不得变 FAIL；放不放行由剧本决定）
        v = judge({"chief": [kickoff_relay()]})
        self.assertEqual(v["A3"], "SKIP")

    def test_worker_kickoff_greeting_is_not_main_opening(self):
        # UI 二轮回归（fresh-boot r16 假 PASS）：worker 由 create_bot 建成时也有自己的 kickoff relay
        # （"[Bot team setup] Chief just created you…"）且先于任何人类消息开口——与主 bot 同形。
        # 主 bot 没开场时 A3 必须保持 SKIP，不得被 worker 的开场顶成 PASS。
        v = judge({
            "chief": [human("do it"), DELEGATE()],
            "worker": [kickoff_relay("[Bot team setup] Chief just created you for the user."), assistant("On it.")],
        })
        self.assertEqual(v["A3"], "SKIP")
        self.assertTrue(v["A4-chief"])

    def test_unresolved_main_bot_is_skip(self):
        # 读不到主 bot 身份（state.json 缺失/无 mainBotIds）→ 任何会话的开场都不算 A3 证据，也不报 FAIL
        v = judge_sessions({"chief": [kickoff_relay(), assistant("Hey — I'm Chief, your Bot team's chief of staff.")]})
        self.assertEqual(v["A3"], "SKIP")
        self.assertEqual(judge_sessions({"chief": [human("hi"), assistant("Chief of Staff here")]}, set())["A3"], "SKIP")

    def test_file_path_session_key_matches_main_id(self):
        # main() 传入的会话键是会话文件路径：按路径分量精确匹配主 bot id
        key = "/fresh/.ds-bot/sessions/--tmp-ws--/session-6011852d-d358-4513-b355-f185c078bc00/session.v4.jsonl.zstd"
        v = judge_sessions({key: [assistant("Chief of Staff here"), human("hi")]}, {"session-6011852d-d358-4513-b355-f185c078bc00"})
        self.assertEqual(v["A3"], "PASS")
        self.assertEqual(judge_sessions({key: [assistant("Chief of Staff here"), human("hi")]}, {"session-other"} )["A3"], "SKIP")

    def test_rotated_part_counts_as_main_and_handoff_is_not_human(self):
        # 换段后的新段也是主 bot 会话；"[Handoff · part 2]" 是 bot 转投（source.kind=bot），不是人类消息——
        # 其后的开场仍是 kickoff（按文本前缀识别人类消息的旧判据会把它当人类首条而误判 FAIL）
        v = judge({
            "chief": [assistant("Chief of Staff here"), human("hi")],
            "chief-part-2": [relay("[Handoff · part 2] DS Bot moved your chat…", "handoff"),
                             assistant("Chief of Staff, back online."), human("status?")],
        }, main=("chief", "chief-part-2"))
        self.assertEqual(v["A3"], "PASS")

    def test_bot_reply_relay_before_any_human_is_not_fail(self):
        # worker 回复转投进 Chief 会话（"[Reply from Toolhand]"，source.kind=bot）：不是人类消息
        v = judge({"chief": [kickoff_relay(), relay("[Reply from Toolhand] done", "reply"),
                             assistant("Hey — I'm Chief, your Bot team's chief of staff.")]})
        self.assertEqual(v["A3"], "PASS")

    def test_a3_fail_in_any_main_session_is_final(self):
        # 审查 F3：后遍历会话不得覆盖先前会话的 FAIL
        v = judge({
            "good": [assistant("Chief of Staff reporting"), human("hi")],
            "bad": [human("hi"), assistant("Chief of Staff reporting")],
        }, main=("good", "bad"))
        self.assertEqual(v["A3"], "FAIL")

    def test_a3_pass_in_later_session_counts(self):
        v = judge({
            "quiet": [human("hi")],
            "good": [assistant("Chief of Staff reporting"), human("hi")],
        }, main=("quiet", "good"))
        self.assertEqual(v["A3"], "PASS")


class A3SkipReason(unittest.TestCase):
    """顾问复核 F0：A3=SKIP 必须带可区分的成因，身份没解析到不得和「kickoff 未释放」混为一谈。"""

    def test_unresolved_main_bot_reports_unresolved(self):
        self.assertEqual(judge_sessions({"chief": [kickoff_relay()]})["A3-reason"], "main-bot-unresolved")
        self.assertEqual(judge_sessions({"chief": [kickoff_relay()]}, set())["A3-reason"], "main-bot-unresolved")
        self.assertEqual(judge_sessions({})["A3-reason"], "main-bot-unresolved")

    def test_resolved_but_no_main_session_file_reports_missing(self):
        v = judge_sessions({"worker": [kickoff_relay(), assistant("On it.")]}, {"chief"})
        self.assertEqual((v["A3"], v["A3-reason"]), ("SKIP", "main-session-missing"))

    def test_main_session_with_kickoff_relay_unreleased_reports_not_released(self):
        # kickoff relay 已投递、Chief 还没开口（例如用户先写了话）——判据层是 SKIP，剧本不放行
        v = judge({"chief": [kickoff_relay(), human("do it"), DELEGATE()]})
        self.assertEqual((v["A3"], v["A3-reason"]), ("SKIP", "kickoff-not-released"))

    def test_main_session_without_any_kickoff_relay_reports_no_opening_evidence(self):
        # 反例（顾问复核）：主会话在、但连 kickoff relay 都没有（clean home 首启的主 bot 没选模型，
        # greeting 存在 bot.kickoff 等 releaseKickoff）。这不是「未释放」，不得混同、不得放行。
        v = judge({"chief": [human("do it"), DELEGATE()]})
        self.assertEqual((v["A3"], v["A3-reason"]), ("SKIP", "no-opening-evidence"))
        # 只有别的会话有 kickoff relay，不算主会话的
        v = judge({"chief": [human("do it")], "worker": [kickoff_relay(), assistant("On it.")]})
        self.assertEqual((v["A3"], v["A3-reason"]), ("SKIP", "no-opening-evidence"))

    def test_kickoff_relay_after_a_human_message_still_reports_not_released(self):
        # kickoff 在人类消息之后才投递（用户先写了话，releaseKickoff 才放行）：同样算未释放那一类
        v = judge({"chief": [human("hi"), kickoff_relay(), assistant("Hello!")]})
        self.assertEqual(v["A3-reason"], "kickoff-not-released")

    def test_opening_subcommand_exit_codes(self):
        # 剧本 A2.7 的等待条件：0 = 主 bot 已在首条人类消息前开场；3 = 还没有。
        import os
        import tempfile
        from unittest import mock
        import contextlib
        import io
        events = [kickoff_relay(), assistant("Hi — I am your Chief of Staff."), human("go")]
        with tempfile.TemporaryDirectory() as root:
            self.write_session(root, events)
            with mock.patch.dict(os.environ, {"DSBOT_TRIAL": root}), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(evidence.main(["--opening"]), 0)
        with tempfile.TemporaryDirectory() as root:
            # 选了模型但开场还没落盘（只有 kickoff relay）
            self.write_session(root, [kickoff_relay()])
            with mock.patch.dict(os.environ, {"DSBOT_TRIAL": root}), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(evidence.main(["--opening"]), 3)

    def write_session(self, root, events, torn=None, raw_text=None):
        # torn=再追加一帧只写了一半的行（真实会话文件是多次追加、每次一帧）；
        # raw_text=直接指定文件内容（造中间的坏行）。
        import json
        import os
        import zstandard
        fresh = os.path.join(root, "home-fresh")
        os.makedirs(os.path.join(fresh, ".ds-bot", "bot"))
        with open(os.path.join(fresh, ".ds-bot", "bot", "state.json"), "w", encoding="utf-8") as fh:
            json.dump({"mainBotIds": ["session-chief"], "bots": {"session-chief": {}}}, fh)
        sess = os.path.join(fresh, ".ds-bot", "sessions", "ws", "session-chief")
        os.makedirs(sess)
        blob = zstandard.ZstdCompressor().compress("\n".join(json.dumps(e) for e in events).encode())
        c = zstandard.ZstdCompressor()
        # 每行以换行结尾（jsonl）——半行才有资格自己占最后一行，不然会粘在上一条完整事件后面
        text = raw_text if raw_text is not None else "".join(json.dumps(e) + "\n" for e in events)
        blob = c.compress(text.encode())
        if torn is not None:
            blob += c.compress(json.dumps(torn).encode()[:24])
        with open(os.path.join(sess, "session.v4.jsonl.zstd"), "wb") as fh:
            fh.write(blob)

    def test_judged_pass_and_fail(self):
        self.assertEqual(judge({"chief": [assistant("Chief of Staff here")]})["A3-reason"], "judged")
        self.assertEqual(judge({"chief": [human("hi"), assistant("Chief of Staff here")]})["A3-reason"], "judged")

    def run_main(self, root, with_state):
        import contextlib
        import io
        import json
        import os
        from unittest import mock
        import zstandard
        fresh = os.path.join(root, "home-fresh")
        os.makedirs(os.path.join(fresh, ".ds-bot", "bot"))
        if with_state:
            with open(os.path.join(fresh, ".ds-bot", "bot", "state.json"), "w", encoding="utf-8") as fh:
                json.dump({"mainBotIds": ["session-chief"], "bots": {"session-chief": {}}}, fh)
        sess = os.path.join(fresh, ".ds-bot", "sessions", "ws", "session-chief")
        os.makedirs(sess)
        events = [assistant("Hi — I'm Chief, your Chief of Staff."), human("go")]
        blob = zstandard.ZstdCompressor().compress("\n".join(json.dumps(e) for e in events).encode())
        with open(os.path.join(sess, "session.v4.jsonl.zstd"), "wb") as fh:
            fh.write(blob)
        out, err = io.StringIO(), io.StringIO()
        with mock.patch.dict(os.environ, {"DSBOT_TRIAL": root}), contextlib.redirect_stdout(out), \
                contextlib.redirect_stderr(err):
            evidence.main()
        return out.getvalue(), err.getvalue()

    def test_main_stdout_is_one_machine_readable_line(self):
        import tempfile
        with tempfile.TemporaryDirectory() as root:
            out, err = self.run_main(root, with_state=True)
            self.assertEqual(out, "A3=PASS A3-reason=judged A4-worker=FAIL A4-chief=FAIL\n")
            self.assertEqual(err, "")
        with tempfile.TemporaryDirectory() as root:
            out, err = self.run_main(root, with_state=False)
            self.assertEqual(out, "A3=SKIP A3-reason=main-bot-unresolved A4-worker=FAIL A4-chief=FAIL\n")
            self.assertEqual(err, "")

    # --- 判据读层对「最后一行写到一半」的容错 ---------------------------------------------
    # r21 主会话实测 3777 个截断点里 7 个会让 json.loads 抛错；--opening 每 3s 轮询撞上就是判据
    # 自己崩溃（退出码 1，不是 0/3）。只容最后一行；中间的行坏了照样抛。

    def test_torn_last_line_is_dropped_with_a_notice(self):
        import contextlib
        import io
        import os
        import tempfile
        with tempfile.TemporaryDirectory() as root:
            self.write_session(root, [assistant("Hi — I'm your Chief of Staff."), human("go")], torn=human("torn"))
            err = io.StringIO()
            with contextlib.redirect_stderr(err):
                sessions, _ = evidence.load_evidence(os.path.join(root, "home-fresh"))
            self.assertEqual(len(next(iter(sessions.values()))), 2)
            self.assertIn("torn tail dropped", err.getvalue())

    def test_corrupt_middle_line_still_raises(self):
        import json
        import os
        import tempfile
        good = json.dumps(assistant("Hi, Chief of Staff"))
        with tempfile.TemporaryDirectory() as root:
            self.write_session(root, [], raw_text=good + "\n" + '{"type": ' + "\n" + good + "\n")
            with self.assertRaises(ValueError):
                evidence.load_evidence(os.path.join(root, "home-fresh"))

    def _opening_with_torn_tail(self, root, events):
        import contextlib
        import io
        import os
        from unittest import mock
        self.write_session(root, events, torn=human("torn"))
        with mock.patch.dict(os.environ, {"DSBOT_TRIAL": root}):
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                return evidence.main(["--opening"])

    def test_opening_probe_waits_through_a_torn_tail(self):
        # 只有 kickoff relay + 半行：是「还没开场」（3），不是判据崩溃
        import tempfile
        with tempfile.TemporaryDirectory() as root:
            self.assertEqual(self._opening_with_torn_tail(root, [kickoff_relay()]), 3)

    def test_opening_probe_passes_with_a_torn_tail(self):
        import tempfile
        with tempfile.TemporaryDirectory() as root:
            events = [kickoff_relay(), assistant("Hi — I am your Chief of Staff.")]
            self.assertEqual(self._opening_with_torn_tail(root, events), 0)

    def test_final_evidence_line_survives_a_torn_tail(self):
        # 终局证据那一次撞上半行，也必须照常打出一行机器可读结论
        import contextlib
        import io
        import os
        import tempfile
        from unittest import mock
        events = [assistant("Hi — I'm Chief, your Chief of Staff."), human("go")]
        with tempfile.TemporaryDirectory() as root:
            self.write_session(root, events, torn=human("torn"))
            out, err = io.StringIO(), io.StringIO()
            with mock.patch.dict(os.environ, {"DSBOT_TRIAL": root}):
                with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                    evidence.main()
            self.assertEqual(out.getvalue(), "A3=PASS A3-reason=judged A4-worker=FAIL A4-chief=FAIL\n")
            self.assertIn("torn tail dropped", err.getvalue())


if __name__ == "__main__":
    unittest.main()
