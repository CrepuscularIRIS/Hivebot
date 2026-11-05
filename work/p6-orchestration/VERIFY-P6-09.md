# VERIFY-P6-09 · 回报链 spike 验收

verdict: **PASS**
commit: `36fab78f8de47e7f323c86562936de916a35c26a`（worktree `/tmp/bot-wt/P6-09` @ `feat/P6-09`，验收时 HEAD 与申报一致；merge-base `6abbbc0`）
验收人：verifier（GLM 5.3）· 2026-11-04 · 坏路径：未 flush 的 create 在 SIGKILL 后丢失（独立复证成立）

| 验收项 | 结果 | 证据 |
|---|---|---|
| 1. 分支仅 4 文件、全在 `work/p6-orchestration/`、零产品代码 | PASS | `git show --stat 36fab78`：REPORT-P6-09.md(98) + evidence/p6-09/{probe.mjs(294), run.mjs(562), result.json(856)}，1810 insertions / 0 deletions，无 `app/` 路径；`git diff --name-status 6abbbc0..36fab78` 恰 4 个 A。evidence 无 handoff/runtime 泄漏（LEARNINGS R5 条） |
| 2a. 独立复跑尾行 `ALL 62 assertions passed` | PASS | 主仓 `/home/lingxufeng/bot/app/sdk/node_modules/.bin/node run.mjs`（在 worktree 内、探针自管临时 HOME `/tmp/bot-p609-*`）：尾行 `ALL 62 assertions passed`（本次验收实跑输出，非 builder 粘贴） |
| 2b. result.json 31 条观察与 REPORT 一致 | PASS | result.json：93 checks = 62 断言 + 31 观察（`observation:true`）。31 条逐条核对：延迟观察 2ms 级（#1/#4/#5）、(c′) 三形态 turn claim kinds（#8 steer 入当前回合、#9 queue 各自独占、#10 混合回合 `["user","pbots-worker"]`）、#30 `(f5-ii) post-crash main state {"landed":0,"nextTurn":[]}`（新问题 2 原始证据）、#31 runtime-context「3 blocks/turn、LandsAsUserMessage:true、claimedByInbox:false」。结构化字段 `claimedTurns`/`staticEnum`（4 基础 kind + user-approval/user-question-reply/working-directory/agent-message/subagent-settled/schedule 进 inbox + runtime-context 特殊）与 REPORT (c′) 枚举逐项吻合 |
| 2b′. 复跑 result.json 与提交版等价 | PASS | 复跑覆盖 result.json 后 `git diff` 46 行，逐行定性：全部为运行时噪声（date、dshPid/childPid、session UUID、approval/asked 延迟 2ms→1ms、`(d) log tail after resume` 观察中 resume 前宿主事件 `session/title` vs `request/context` 的尾部抖动——关键序列 `step/end → turn/end interrupted → session/end-seed` 两版一致）。已 `git checkout --` 恢复提交版，worktree 干净 |
| 3①. `commands.ts:476` 附近 session/cancel 是 keepInbox:true | PASS | `repos/deepseek-harness@ce7073d512` `packages/api/session-controller/src/commands.ts` cancel 方法（460-477 区间）：`agent.cancel({ kind: 'user' }, { keepInbox: true })`，方法注释原文「Cancel one live ordinary Agent **while retaining pending inbox work**」——REPORT (f3) 一字不差 |
| 3②. claim 后崩溃的键不在 history 也不在 inbox（REPORT 新问题 2） | PASS | 机制核实：`packages/core/agent-loop/src/agent.ts:287` preStep 内 `this.inbox.claim(target, turn)`，其后经 `await tools.resolve(...)` 等多次 await 才到 `:467/:473` `session.append('user/message', ...)`——崩溃窗口真实存在；`inbox.ts:108-113` claim 移除 splice 无 outcome vs `:214` 取消路径 `outcome='canceled'` 分叉属实。实测：PASS `(f5-ii) claim-window crash: key visible in neither history nor pending` + 观察 #30 |
| 3③. runtime-context 落 user/message 但不被 claim | PASS | `agent.ts:298-306` pre-step 把 context 拼进 messages（非 inbox 来源）；`:462-476` `message.source.kind === 'runtime-context'` 分支同样走 `session.append('user/message', ...)` 落盘。源码 + 实测观察 #31 + REPORT (c′) 三方吻合 |
| 4. REPORT 结构完整（每硬问题一节 + 新问题单列） | PASS | (a)(b)(c)(c′)(d)(e)(f1)(f2)(f3)(f4)(f5)(g) 每问独立小节、标题含「是/否」、正文带 `文件:行` 锚点与 check 名证据。三个新发现显著单列：§f3「决策 27⑤ 修正建议（交 director）」独立加粗段、§f5 标题「（含一个重要盲区发现）」+ 粗体「P6-21 的 pending 必须以日志 fold 为准」、附录 1 粗体「create 不是即时持久」；另设「待 director 处置」3 条汇总。硬问题 (a)(b)(c)(c′)(f1)(f4)(f5) 全「是」→ 与 PLAN 闸门「可派 P6-21」判定一致 |
| 坏路径（额外） | PASS（复证 REPORT 附录 1） | 验收侧脚本 `/tmp/bot-P6-09-vfy/negative.mjs`（独立写、不进分支）：create+flush 的 session B 崩溃重启后 resolve 成功 idle；create **不 flush** 零事件的 session C 崩溃重启后 resolve 报 `p609/not-found "session-5ff6410e… not found"`——`NEGATIVE-PASS: unflushed create LOST on SIGKILL (REPORT appendix-1 confirmed)`。第二次崩溃后 B 仍可恢复（flush 持久性稳定） |

## 沙箱自查

- `bot-reap --dry-run --match P6-09` 与 `--match p609`：均 exit 0、无匹配进程
- `/tmp/bot-p609-*`、`/tmp/bot-P6-09-vfy-run-*`：无残留（run.mjs 与验收脚本 finally 均自清）
- worktree `/tmp/bot-wt/P6-09` 干净（result.json 已恢复提交版），HEAD 未漂移
- `repos/` 只读，仅 sed/grep；探针崩溃模拟均为脚本对**自己 spawn 子进程**的字面 PID SIGKILL（node API，非 shell kill）

## 新问题（每条一行，可派发）

- [FIX] REPORT「待 director 处置 2」写「result.json.turnEndReasonsObserved 六种」，字段实际只含 5 种 live 原因（completed/aborted/blocked/error/max-tokens），第 6 种 interrupted 的证据在 check `(d) resume appends turn/end {interrupted}` | 复现：`jq .turnEndReasonsObserved result.json` | 疑似位置：REPORT-P6-09.md 待处置节 | 严重度：低（结论本身有据，仅指代不准，director 改写时顺带修正）
- [FIX] 新发现 3「create 不 flush 会丢」在 result.json 中无负例断言（run.mjs:350 注释声明并补 flush 规避，丢路径未固化）| 复现：见本 VERIFY 坏路径项（验收侧已独立复证成立）| 疑似位置：run.mjs (d) 场景 | 严重度：低（已闭环；若 P6-21/P6-10 引用该行为，建议补 1 条断言）

## 结论

4 项验收全部 PASS，另加坏路径复证。P6-09 硬问题全「是」，闸门条件满足，**可派 P6-21**；决策 27⑤ 改写与决策 28 映射补齐按 REPORT「待 director 处置」交 director。
