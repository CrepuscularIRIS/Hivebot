# REPORT-P6-09 · 回报链 spike（1b 共同前提）

- 日期：2026-11-04 · builder（GLM 5.3）· 探针：`evidence/p6-09/{probe.mjs,run.mjs}`，结果 `evidence/p6-09/result.json`（62 断言全绿，31 条观察）
- 宿主：本机 `@deepseek-ai/dsh@0.2.2-alpha.2`（经 `app/sdk/scripts/start.mjs` 真实 Loader，`P2SDK_PATCH` 叠加 fake provider + 探针插件；SDK 9 次 boot、含 7 次崩溃模拟）
- 源码参照：`repos/deepseek-harness@ce7073d512`（锚点 `文件:行` 均为该仓；构建产物抽验一致：agent-loop lib 含 `already pending`、`interruptedTurnClosers`）
- 硬问题结论：**(a)(b)(c)(c′)(f1)(f4)(f5)(g) 全部「是」→ 可派 P6-21**。(d)(e)(f2) 亦为「是」。(f3) 三问中「待处理消息以 canceled 落盘」为**否**——不在硬问题清单，但**决策 27⑤ 的一句前提与实测矛盾**（见 §f3；需 director 改写该句并调整 P6-12 ⑦ 构造，不影响 P6-21 派发）。

## (a) 插件跨 session 注入自有来源消息并起回合（含冷会话）——是

- 问题：插件能否向另一 session `followup` 一条自有 source kind 的消息并起回合；SDK 重启后未加载的冷会话是否同样可行。
- 答案：**是**。运行时对 `MessageSource.kind` 无校验（`llm/src/message.ts:110-115` merge-extensible；`freezeMessage` 仅 deepFreeze `:212-214`），自定义 kind `pbots-main` / `pbots-worker` 直接落盘。热会话 followup 即起回合；冷会话经 `ctx.sessionController.resolveAgent(id)`（live 优先、否则去重 resume，`api/session-controller/src/agent.ts:161-181`）后 followup 同样起回合。不需要退 `{kind:'plugin'}` 旧格式。
- 证据：`PASS (a) plugin followup on a live session starts a turn`、`PASS (a) injected message persists with own source kind and stable id`、`PASS (a) cold session (never loaded this boot) accepts followup and runs a turn`。

## (b) 订阅 turn/end 与审批/提问挂起、作答事件，延迟 ≤1s——是（interrupted 带限定）

- 问题：能否订阅另一 session 的 `turn/end`（五种终止原因）与审批/提问挂起、作答事件，延迟 ≤1s。
- 答案：**是**。订阅原语 = `ctx.on('session/event', (session, event) => …)`（SA `delivery.ts:38-43` 同款）。终止原因实为 **7 种**（`session/src/types.ts:206-227`：completed / aborted / blocked / error / max-tokens / interrupted / forked），实测 6 种（forked 仅 fork 种子）：completed / aborted / blocked / error / max-tokens 走 live 事件；**interrupted 只能从日志读**——resume 的合成 closer 经 persistence handle 追加（`agent-loop/src/index.ts:800-805`），**不触发 session/event**（实测：(f2) 场景 resume 后日志有 `turn/end interrupted`、事件流无）。审批挂起/作答 = `approval/asked` / `approval/decided` 落盘事件（`interaction/user-approval/src/index.ts:252-259`），实测延迟 2ms 级。提问挂起：`tool/call`(ask_user_question) + 无 tool/result，迟到答复 `agent.steer`、kind `user-question-reply` 进 inbox（`interaction/user-questions/src/index.ts:191-215`、`types.ts:129-135`）——与审批同一 session/event 面（静态锚点；审批侧已实测，提问工具不在本 profile 工具表内未触发实测）。
- 对 P6-21/P6-12 的含义：**worker 崩溃重启的 interrupted 不能靠 live 事件感知，启动对账必须扫日志**（决策 27 本就是日志重算，自洽）。
- 证据：`PASS (b) completed/aborted/blocked/error/max-tokens reason observable`×5、`PASS (b) approval/asked latency <= 1s`、`PASS (d) resume appends turn/end {interrupted}`（日志侧）、`result.json.turnEndReasonsObserved`。

## (c) execute 内同步可判认领来源与运行态——是

- 问题：工具 execute 内能否同步判「本回合迄今认领的输入来源集合」与「目标 session 是否在跑回合」。
- 答案：**是**。认领集合：监听 `agent/inbox/claimed`（live emit，`agent-loop/src/inbox.ts:108-113`；事件表 `agent/src/runtime-types.ts:323-331`，payload 带 `message.source` 与 `turn`）按 turn 累积，execute 同步读内存表。运行态：`agent.status`（`agent.ts:156-158`）；**maintenance 期间也报 idle**（G2-r2 席 A 已指出）。
- 证据：`PASS (c) execute sees own turn claim kinds (user present)`、`PASS (c) execute sees self running`、`PASS (c) execute reads target session status synchronously`。

## (c′) 混合回合与非 user 来源枚举——是（白名单按 R2-1 新口径仅审计）

- 问题：回报 next-turn 待处理时用户 followup 与 steer 各一次，哪些消息被同一回合认领；普通用户回合出现的全部非 user 来源 kind。
- 答案：**是，机制清楚**。三种形态（`result.json.claimedTurns`）：
  1. 回合运行中，回报 followup（next-turn）+ 用户 **steer**（next-step）→ steer 被当前回合下一个 step 认领（同回合），回报独占下一回合；
  2. 回报 followup + 用户 **queue**（next-turn）→ 各自独占回合，按队列序；
  3. 回合以 error 终止时滞留 next-step 的 steer，与 next-turn 的回报被**同一新回合认领**（`claim('next-turn')` 取全部 next-step + 1 条 next-turn，`inbox.ts:108-113`）——即 P6-12 ③ 的混合回合。
  非 user 来源枚举（`result.json.staticEnum`）：基础 map 4 种（user / model / tool / system-prompt，仅 user 进 inbox）；宿主内部进 inbox 的 5 类（**R2-1 席 A 五锚点全部核实吻合**，kind 名修正一处）：`user-approval`（`user-approval/src/index.ts:215-221`，inject）、`user-question-reply`（席 A 写「user-questions」，实际 kind 如名，`user-questions/src/index.ts:191-215`，steer）、`working-directory`（`working-directory/src/index.ts:193-202`，inject）、`agent-message` / `subagent-settled`（`subagent/src/continuation-messages.ts:40-44` + `manager.ts:688-689`，steer/followup）、`schedule`（`schedule/src/runtime.ts:6-8,327-333`，followup）。另实测：**runtime-context 以 `user/message` 落盘（本 profile 每回合 3 块）但由 pre-step 追加、不经 inbox、不被 claim**（`agent.ts:300-304,462-474`）——按决策 29「回合来源 = agent/inbox/claimed」口径，普通用户回合认领集合恰为 `['user']`。
- 证据：`PASS (c') steer joins the running turn…`、`PASS (c') queue variant…`、`PASS (c') steer stranded by an error turn is claimed together with the report`、`PASS (c') plain user turns claim only 'user'…`。

## (d) 回合中途杀 SDK：落盘终态与枚举——是

- 问题：worker 回合中途停掉自己 spawn 的 SDK 再启动，该回合落盘为何种终态（或无 turn/end）；启动时能否枚举。
- 答案：**是**。崩溃现场日志尾部 = `turn/start`（+已 admit 的消息）**无 turn/end**；重启后对该 session 首次 `resolveAgent`（任何经 resume 的打开）追加合成 closer：缺失 tool 结果（TOOL_OUTCOME_UNKNOWN）→ `step/end` → **`turn/end {kind:'interrupted'}`**（`session/src/repair.ts:53-98,209-211` + `agent-loop/src/index.ts:800-805`）。枚举：`sessionPersistence.open(id,'read')` 逐 session 全量可读。**注意**：仅 create 未 flush 的冷 session 在 SIGKILL 下会丢（实测；探针在崩溃前补 flush），有任一 append 事件即恢复。
- 证据：`PASS (d) persisted tail has turn/start with no turn/end before resume`、`PASS (d) cold session resolves (resume) and idles`、`PASS (d) resume appends turn/end {interrupted}`。

## (e) 回合中 followup 与 inject 的排序——是

- 问题：主 session 跑回合时 followup 与 inject 各一次，哪个排在回合后、哪个插进当前回合。
- 答案：**是**。`inject`（next-step、不唤醒）被**当前回合的下一个 step 认领并 admit**（user/message 落 turn 1 step 2）；`followup`（next-turn、唤醒）**等回合结束**、独占下一回合（`agent.ts:170-189` + turn 循环 `:395-400`）。
- 证据：`PASS (e) inject joins the running turn (admitted inside turn 1)`、`PASS (e) followup waits for the next turn (admitted inside turn 2)`。

## (f1) 稳定 id 跨重启幂等——是

- 问题：自有来源消息带稳定 id 落盘后，重启读日志是否同 id、同 source、`items[]` 不丢；同 id 第二次投递按 SA holds 语义判已投 → 落盘恰 1 条。
- 答案：**是**。`user/message` 事件 data 即完整消息（id/source/items 原样）；SA `AgentDelivery.holds()` 的 history+pending 双查（SA `delivery.ts:60-66`）实测有效。
- 证据：`PASS (f1) after restart the persisted message keeps id / kind / items`、`PASS (f1) same id re-delivery is skipped by history check (SA holds semantics)`。

## (f2) next-turn 待处理跨重启与唤醒原语——是

- 问题：待处理消息跨 SDK 重启仍在 inbox？重启后是否自动认领？不自动时用哪个原语唤醒？
- 答案：**是**。inbox 是落盘投影（`agent/inbox/spliced` fold，`agent-loop/src/inbox.ts:26-64`），重启完整恢复；**不自动认领**（实测 1.5s 无新 turn/start；schedule 注释原话「A restored inbox does not wake an idle Agent by itself」`runtime.ts:328`）。唤醒原语 = **`inbox.remove(id)` + 同 id 同内容 `followup`**（`runtime.ts:329-333`，第 1 级现成做法）。
- 证据：`PASS (f2) pending next-turn message survives the restart in the inbox`、`PASS (f2) resumed agent is idle`、`PASS (f2) restored inbox does NOT wake the agent by itself`、`PASS (f2) inbox.remove + followup wakes it`、`PASS (f2) rewoken turn consumes the message`。

## (f3) 应用的「停止」调用链与 inbox 去向——两问「是」、一问「否」（决策 27⑤ 需改写）

- 问题：应用的「停止」走哪条调用、是否 keepInbox；待处理消息是否以 `outcome:'canceled'` 落盘且不出现为 user/message。
- 答案：**停止 = RPC `session/cancel` → `agent.cancel({kind:'user'}, {keepInbox: true})`**（`api/session-controller/src/commands.ts:464-477`）——**保留 inbox**：turn 以 `aborted{reason:'user'}` 落盘，待处理消息留 inbox、**无 canceled splice、不出现为 user/message**（第三问「否」）。对照路径：插件侧直调 `agent.cancel()`（不带 keepInbox）→ `inbox.clear()` → 每条移除以 `outcome:'canceled'` 落盘（`agent.ts:191-197` + `inbox.ts:97-100,214`），两路径均实测。
- **决策 27⑤ 修正建议（交 director）**：原句「用户停止主 bot 时 inbox 被清（落盘 canceled）…下一次触发补投」不成立——inbox 保留、键仍在 pending 集合 → 下一次触发**不补投**；残留回报由用户下一条消息的回合 `claim('next-turn')` **自然消费**（恰一次语义仍成立，路径不同）。P6-12 ⑦ 构造同步改。
- 证据：`PASS (f3) app stop (session/cancel) aborts the turn`、`PASS (f3) session/cancel keeps the inbox (keepInbox), no canceled splice`、`PASS (f3) pending message survives the stop`、`PASS (f3) plugin-side cancel() without keepInbox lands outcome:canceled splices`。

## (f4) 从 worker 日志定位 Assignment 回合——是

- 问题：能否从 worker 落盘日志定位「消费 `pbots-assign:*` 的回合」及其终态。
- 答案：**是**。重放法（R2-2 口径）：fold `agent/inbox/spliced` 重演两列表——**claim 的移除 splice 无 `outcome`，取消的移除带 `outcome:'canceled'`**（`inbox.ts:108-113` vs `:214`），无 outcome 的移除落在哪个 turn 区间即消费回合，其 `turn/end` reason 即终态。日志时序实测 `insert splice < turn/start < claim splice < user/message < turn/end`。探针 `P609Probe.foldAssignments`（probe.mjs）即 P6-21 `assignment` 雏形（同类 fold 参考 `agent/src/consumed-work.ts:69-101`）。
- 证据：`PASS (f4) fold(spliced+turn/start) recovers assignment->turn with end state`、`PASS (f4) log order: insert < turn/start < claim splice < user/message < turn/end`。

## (f5) 三个崩溃点各杀一次、键恰一次——是（含一个重要盲区发现）

- 问题：(i) worker `turn/end` 已落盘未投递；(ii) 主 session splice 已 flush 未回执；(iii) 合批构造后 splice 前——重启按决策 27 重算，每个键恰 1 次。
- 答案：**是，三点均恰一次**。(ii) 实测踩出**关键盲区**：followup 唤醒的消费在 exit 前已走到 claim——重启后该键**既不在 history（user/message 未落）也不在 inbox（claim 已移除）**，SA holds 双查不可见；决策 27 重算（两份日志为唯一真相）把它正确判回待投并补投，最终恰一次。**P6-21 的 `pending` 必须以日志 fold 为准，不能只查 live inbox**（实证）。
- 证据：`PASS (f5-i) worker ended + undelivered -> reconcile finds exactly one due end key`、`PASS (f5-i) second reconcile is a no-op…`、`PASS (f5-ii) claim-window crash: key visible in neither history nor pending (holds blind spot)`、`PASS (f5-ii) decision-27 recompute re-delivers the lost key`、`PASS (f5-ii) key a9b:end landed exactly once overall`、`PASS (f5-iii) nothing persisted before the crash -> exactly a9c due`、`PASS (f5) final reconcile: every key exactly once, nothing due`。

## (g) 认领窗口崩溃恢复（R2-2）——是

- 问题：worker 认领 `pbots-assign:*` 后、`user/message` 追加前崩溃（pre-step 内 `process.exit` 模拟），重启后能否恢复 assignmentId→turn 并产生恰一项 stopped/error；pre-step 拒绝路径同测一例。
- 答案：**是**。崩溃窗口落盘序 `insert splice → turn/start → claim splice（无 outcome）→ [无 user/message、无 turn/end]`（claim 在 `agent.ts:287`，user/message 在 `:464-474`，中间隔 tools.resolve/assemble/pre-step 多次 await）。重启 resume 后 `turn/end {interrupted}` 补齐；fold 仅凭 claim splice 恢复 `{a10 → turn, interrupted}` → reconcile 产出**恰一项** `end:stopped`（决策 28 映射）。pre-step 拒绝：`turn/end {blocked}`、assign 不落 user/message、fold 恢复 `{a11 → blocked}` 同样恰一项——**blocked 的 outcome 归属（stopped vs error）决策 28 未定，G2-r2 MEDIUM 已建议补映射，交 director**（探针临时映射 stopped）。
- 证据：`PASS (g) SDK crashed after claim (exit code)`、`PASS (g) crash window: claim splice persisted, no user/message, no turn/end`、`PASS (g) resume closes the claimed turn as interrupted`、`PASS (g) fold recovers assignmentId->turn from the claim splice alone`、`PASS (g) reconcile produces exactly one stopped item…`、`PASS (g) report lands exactly once in the main log`、`PASS (g) pre-step reject: assignment recoverable, turn blocked, no user/message`。

## 附：运行与环境事实（供 P6-21/P6-10 实现）

1. **create 不是即时持久**：`session/create` 后零事件的冷 session 在 SIGKILL 下丢（SQLite 未 commit）；有任一 append 或显式 `sessionPersistence.flush()` 即恢复。P6-10 建 worker 后首条 `pbots-assign:*` 投递（其 splice 即落盘）应先于任何崩溃窗口。
2. **resume closer 不触发 session/event**（见 (b)）；SDK 启动对账不能等 live 事件，直接扫日志。
3. `agent.status` 在 maintenance 期间报 idle（`agent.ts:156-158`）；busy 判定不能只看 status。
4. fake provider 游标为进程内存，SDK 重启按脚本文件从 0 重放（与 P5-03 LEARNINGS 同族，测试编排时需全量重写脚本文件）。
5. 沙箱卫生：runtime `/tmp/bot-p609-*` 用后即删；崩溃模拟 = `kill <dsh 字面 pid>`（自己 spawn 的孙进程）+ SIGKILL 子进程；正常 teardown SIGTERM；结束前 `bot-reap --dry-run --match P6-09` 确认无残留。

## 待 director 处置（不阻塞 P6-21）

1. **决策 27⑤ 改写**（(f3) 实测矛盾）+ P6-12 ⑦ 场景构造同步。
2. **决策 28 补 blocked / max-tokens 映射**（G2-r2 MEDIUM；本探针实证两 reason 均可达，`result.json.turnEndReasonsObserved` 六种）。
3. P6-09 (c′) 口径按 R2-1 落实：白名单仅审计（`result.json.staticEnum` 即底稿），拦截只认 `pbots-worker`；BRIEF D9⑨ 措辞同步。
