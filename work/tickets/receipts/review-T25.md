# Review · T25（reviewer 6.1 Sol，2026-11-07）

范围：docs..feat/T25（d366e9ed、c2f8882e）。结论：HIGH 0 / MEDIUM 1 / LOW 1 → 已修复（见末）。

| 严重度 | 位置 | 问题 | 处置 |
|---|---|---|---|
| MEDIUM · 已复现 | entries.ts:98-102 | 用户自输 `<bot_introduction_request>…</bot_introduction_request>` 文本：serialize/outline 双双过滤（消息丢失显示）且 optimistic ack 悬挂（accepted-await-echo 不清）——探针 rpcId='USER-N' 复现 | **已修**：isKickstartEntry(text, rpcId) 双条件（标签 + rpcId kickstart- 前缀），entries/outline/data 三处一致；补 2 格（用户同标签照常显示+nonce 对账；outline 同） |
| LOW · 静态确认 | kickstart.spec.ts:142-145 | ⑦ 固定 1500ms 等 catalog 有竞态（慢时跳过选 model → notice 断言误红） | **已修**：expect option[1] attached（15s）再选 |

NOTE：回执「覆盖含拼接/撤除」收窄——⑥ 只有 prompt 失败、⑦ 只有 model 失败，两种同时与普通 user 撤除未直接验证（未补格，留 T25b 如需）。
reviewer 实测：shim unit 173 passed、entries+outline 28 passed、check diff=0、diff --check 过；e2e/build 因当时 load 18 未重跑。
无发现：nonce 对账（kickstart 不设 pendingNonce、普通 nonce 按 rpcId 精确匹配不误认）、prompt 协议形态与 sendPrompt 一致（queue 走 agent.followup 回 admission ack）、普通场景撤除条件等价、①jsonl 时序、④ cursor 隔离（launchProduct 每 env 独立 home）。
修复后回归：grok-shim **174 passed**、kickstart e2e **7 passed**、check **diff=0**（HEAD 8305bfe2）。
