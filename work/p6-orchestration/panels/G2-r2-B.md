# G2-r2 席 B（6.1 Sol）

> 代录，未经改写。该席受上位约束不能写文件，以下为其最终回报原文。

seat: B
verdict: REVISE
confidence: high
reverse_take: 最可能失败在「Assignment 已从 inbox 认领、尚未进入 user/message」的窗口；继续复用两份 session 日志，但必须补齐认领恢复，而不是另建投递库。

findings:

- [HIGH] `/home/lingxufeng/bot/work/p6-orchestration/PLAN.md:45,83-84` — **持久 inbox 的核实成立，但 Assignment 恢复协议还漏了“已认领、未入历史”的状态。** 现有三个崩溃点都位于 worker 终态之后，没有验证 Assignment 输入从 pending 转入历史之间的窗口。不能仅凭“有稳定消息 id、从日志找回合”就认定恢复闭合。— 证据：`/home/lingxufeng/bot/repos/deepseek-harness/packages/core/agent-loop/src/inbox.ts:108-112` 先以持久 splice 移除消息，再发认领事件；`.../agent.ts:287-307` 在认领后还要异步 resolve 工具、assemble 提示词和执行 pre-step；直到 `.../agent.ts:445-471` 才追加 `user/message`。`/home/lingxufeng/bot/repos/deepseek-harness/packages/core/agent/src/runtime-types.ts:318-328` 更明确说明：pre-step 被拒时，已认领消息不会变成 `user/message`。因此 pending 与 `user/message` 并不能覆盖所有“已消费 Assignment”；`agent/inbox/claimed` 本身也只是运行时通知。— 建议：P6-09 增加硬问题：在 worker 认领 `pbots-assign:*` 后、追加 `user/message` 前 flush 并崩溃，以及 pre-step 拒绝，各跑一例；重启后仍能恢复 assignmentId→turn，产生恰一项 stopped/error。P6-21 明确重放 `agent/inbox/spliced`，结合 `turn/start` 还原被认领的消息，不能仅扫描 `user/message`。宿主已有 `/home/lingxufeng/bot/repos/deepseek-harness/packages/core/agent/src/consumed-work.ts:69-101` 可作消费记账参考；不需要新增存储。

- [MEDIUM] `/home/lingxufeng/bot/work/p6-orchestration/PLAN.md:45-46,83,87` — **终止原因尚未穷尽，新增恢复与唤醒规则没有规定 `max-tokens`、`blocked` 的映射。** — 证据：`.../agent-loop/src/agent.ts:349` 会产生 `blocked`；`:368-373,584` 明确保留并产生 `max-tokens`；`.../core/session/src/types.ts:211,220` 定义这两类终止原因。— 建议：列完整映射，至少将两者映射为非成功结果；主 bot 的自动补投触发用“排除用户主动停止类”，或明确给出允许集合。

- [MEDIUM] `/home/lingxufeng/bot/work/p6-orchestration/PLAN.md:84,95,114-115` — **P6-19 的冻结验收仍可能被合法派发顺序破坏，只是破坏者从 P6-10 换成了新增 P6-21。** — 建议：最小修改是把验收收窄为 BRIEF 的原口径——早于任何协调者工具 description 文案提交；或给 P6-21 增加 P6-19 依赖。

- [MEDIUM] `/home/lingxufeng/bot/work/p6-orchestration/BRIEF.md:111-112,202-203` — **修订账覆盖了主要新增项，但 BRIEF 还不是与 PLAN 一致的唯一验收基准。** BRIEF D4 仍要求 main #4 建 bot，PLAN 已改为 #3+#6；PLAN 接受“已送达、未转述时崩溃，转述不补”的上限，BRIEF D5 仍无例外。— 建议：同步 D4 编排入口；D5 分别写清正常运行保证与崩溃后例外，修订账注明本轮确认。

核实与其余结论：上一轮第 1 条的核心源码事实已经纠正（inbox 确实通过 session 事件持久化，`inbox.ts:20-64,214-223`；拒绝重复 pending id `:207-212`；清空落 `outcome:'canceled'`），「不另建回报存储」方向正确。#2–#7 已有实质落点，不重复报。第 0 波六项没有发现直接写文件交叠。决策 30/31 未发现新的 HIGH。没有 BLOCKER，不需要重开存储或通道架构大选型。
