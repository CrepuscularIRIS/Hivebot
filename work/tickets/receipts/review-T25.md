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

## 经理核实（Opus 5.5，任务 B，2026-11-07，HEAD 8a7afea7）
- MEDIUM 成立，处置正确：`isKickstartEntry(text, rpcId)` 在 entries.ts:104、outline.ts:50、data.ts:257 三处一致。偏离工单「纯内容匹配」的理由成立：rpcId 来自 durable `user/message` 的 source.rpcId（reduce.ts:12 注），重放后仍在，e2e ② 实测 reload 后 user 行为 0。
- LOW 成立，处置正确：kickstart.spec.ts ⑦ 已改为等 `option.nth(1)` attached（15s）再选。
- NOTE 接受收窄，不开 T25b。拼接只是 data.ts 一行三元，读代码可确认；普通 user 撤除 notice 是 L-7 O4 原有行为，谓词对普通 user（rpcId 是自己的 nonce）返回 false 已有 unit 格覆盖。
- 重跑结果：build exit=0；entries+outline 29 passed；grok-shim 174 passed；kickstart e2e 7 passed（31.6s）；check upstream diff=0（332 files）；`pgrep bot-T25` 无残留。
- 截图已看：ours 介绍是左侧灰泡（和 ref conv-done 的 assistant 行同样式），上方无 user 气泡，符合预期。截图出自 d366e9ed；review 修复不改介绍路径的渲染，不要求重截。
- 回执存疑项：①④ cursor 口径属于测试脚本写法，接受；②真模型下 queue 路径，Sol 已核实和 sendPrompt 同协议，接受，等用户实际使用时冒烟；③isChatStarting 属于工单「不做」，接受。
- 小注（不阻塞）：`push.agents()` 放在 await 介绍 prompt 之后，比工单设计的顺序晚。这样 notice 在推送前就写进去了，合理，代价是侧栏刷新要等 admission ack；另外 `shot-kickstart.spec.ts` 超出边界 1，有 shot-*.spec 先例，接受。
- 结论：**accepted**。
