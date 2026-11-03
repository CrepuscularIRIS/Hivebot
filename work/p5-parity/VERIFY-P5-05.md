# VERIFY · P5-05（0e 子代理与根会话同表）

verdict: **PASS**
commit: 158f0b0（worktree /tmp/bot-wt/P5-05，基 9c89e64，现场干净）
验收人：GLM 5.3 verifier · 2026-11-03 02:39–02:45 实测

| 验收项 | 结果 | 证据 |
|---|---|---|
| ⑤ 前置：全量复跑（HOME=/tmp/bot-vfy-p505，独立环境） | PASS | `pnpm -C /tmp/bot-wt/P5-05/app/sdk test` → **Test Files 21 passed (21) / Tests 153 passed (153)**，27.84s（evidence/P5-05/verify-runs.txt A 段） |
| ① 单测 never → deny（T-12.f1 反转、名注 G1-r2 #1）；overrideOf 抛错 → 仍 ask | PASS | describe `P5-05 (G1-r2 #1)`，never→deny 4 用例（含 repeated/narrower、仅 config never、模式不可解析）；fail-closed 用例保留且绿（`tests/unit/policy.test.ts:204` 服务不可读→ask、`:219` overrideOf 抛错+config=never→仍 ask、`:228` 无 agent→ask）。红基线实证见下⑤ | 
| ② e2e：三工具子会话 bash 写 $CWD → deny 且 m 不存在；根会话照旧出卡 | PASS | `tests/e2e/subagent-policy.test.ts` 3 用例（subagent/subagent_fork/workflow）全绿（全量 + 单跑 `3 passed (3)`）：m 不存在 + 子会话 0 条 approval/request；`assertRootStillAsks` 断言根会话 asked=1（toolName=bash）、rejected 后无文件。正对照（下③）证明断言非 vacuous |
| ② 拒绝原因枚举集断言（v2.1）+ approval.test.ts:408 反转、名注 G2-r1 A-M | PASS | `approval.test.ts:407-408` it 名 `R2 inverted (G2-r1 A-M, P5-05)`；`:434-438` 枚举集断言 `['approval unavailable in this session', 'danger-full-access session mode is not supported']`（some/JSON 含匹配），canary 不存在 + 0 出卡前置断言在先。注：枚举集按 PLAN 行 79 ② 落在 R2 用例；subagent-policy 侧不重复断言原因（gateway 拒绝对子代理 session/follow，tool/result 帧不可观测——builder 环境注 2，PLAN ③ 亦未要求），已核与 PLAN 一致 |
| ③ 正对照：未打补丁时子会话 bash 真实执行（m 存在＝侧门） | PASS（verifier 补证） | builder evidence/ **无** P5-05 红跑帧，其声明不可独立核。按派发指示自证：独立 worktree @158f0b0 仅把 `shell-ask.mjs` 退回 9c89e64、测试保持 158f0b0 → `vitest run tests/e2e/subagent-policy.test.ts` → **3 failed (3)**，全部 `expected true to be false`（m-subagent / m-fork / m-workflow 存在）＝侧门真实，复现 builder 声明的红跑结论（verify-runs.txt D 段） |
| ④ 区域：diff 仅 5 个申报文件 | PASS | `git diff --stat 9c89e64..158f0b0`：shell-ask.mjs + tests/unit/policy.test.ts + tests/e2e/approval.test.ts + tests/e2e/subagent-policy.test.ts（新）+ tests/support/fake/plugin.mjs，共 5 files（verify-runs.txt F 段） |
| ⑤ 红基线抽查：never 分支改回 next() → ①单测必红、恢复绿 | PASS | 独立 worktree 改回 T-12.f1 的 `if (approvalNever(...)) return next()` → policy.test.ts **4 failed / 14 passed**，4 个失败全是 G1-r2 #1 never→deny 用例（`expected Symbol(next) to deeply equal {kind:'deny'}`），fail-closed 各格仍绿；`git checkout` 恢复后 **18 passed (18)**（verify-runs.txt B/C 段） |
| 环境注核对：测试 overlay 只在测试目录、不碰产品代码 | PASS | overlay yml 运行时写 `mkdtemp(/tmp/p2sdk-p505-patch-*)` 经 `P2SDK_PATCH` env 注入（subagent-policy.test.ts:169-199），bootstrap 复制进会话工作区临时目录；仓库内零提交、`src/` 除 shell-ask.mjs 外零改动。适配仅钉 PTC worker 解释器 `/usr/bin/node`，不动沙箱/委派/审批语义 |
| 坏路径（重复执行 / 状态泄漏） | PASS | 正对照红跑→恢复→同文件再跑 `3 passed (3)`，无残留状态或端口泄漏 |

## 备注（不阻塞）

- builder 的实现前红跑只有文字声明、无存档帧，本次由 verifier 在基线上复现补证（D 段）。此为流程瑕疵非代码缺陷：PLAN ④ 只要求「差分」存在，不要求帧存档。
- `plugin.mjs` 的 default.json 兜底：无 default 时原报错保留（ENOENT 双层判定），其余 20 个测试文件不写 default.json 仍全绿＝既有行为未变。

新问题（每条一行，可直接成为修复任务）：
- 无

结论：①②③④⑤ 全 PASS，全量 21 files / 153 tests 与申报一致，红/绿双向实证完成。可合并。
