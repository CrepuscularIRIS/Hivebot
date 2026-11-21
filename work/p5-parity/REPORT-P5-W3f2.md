# REPORT · P5-W3.f2（f1 验收 FAIL 修复链第二环）

worktree：`/tmp/bot-wt/P5-W3f1`（分支 `feat/P5-W3f1`，f3d5560 → **f03e0a3**）
输入：`VERIFY-P5-W3f1.md` [FIX] 清单（R2 / R4+O2 / R5 / 真模型重跑）

## 逐条 FIXED

### R2 · 聚合投影丢 toolResult · 已修
- **根因**：覆盖层 `overrides/modules/model.ts` 只重写了 `projectTranscriptEntry`；上游 `projectTranscriptFeedEntries` / `projectTranscriptPageResult` 经 `export *` 原样透传，内部调用的仍是上游模块内的投影——feed（回基线 :2341）与 tail/page（刷新 :979、装首页 :2237）两条路拿到的都是无卡投影。f1 疑点成立。
- **修法**：覆盖层按上游形状重建两个聚合入口（连带 `projectTranscriptPage` 一行委托），逐条走本模块附卡的 `projectTranscriptEntry`；`sentWhileOfflineAtMs` / `projectThreadSummaries` 上游未导出，按其实现本地复刻（composedAtMs 补记、nextBeforeSeq / threadCounts 透传语义有专测锁定）。ProductionRenderer 的 import 经 MODULE_OVERRIDES 别名解析到覆盖层，sourcemap 确认 18 个覆盖模块（含 model / acknowledgement / coordinator-client）全部进包。
- **证据**：探针 `evidence/P5-W3f2/probe-f2.log` 第 1 行——direct / feed / tail 三条投影路径 toolResult 全部非 null（f1 probe.log：feed/tail 为 null）。单测 `p5-w3f1.test.ts`「聚合投影（feed / page）同样附卡」+「page 投影保持上游语义」。

### R4 / O2 · 同文本历史消息被补新 nonce、ack 1→0 · 已修
- **根因**：f1 改成「最后一条与发送文本一致的用户消息」，文本匹配证明不了发送身份——历史里同文本旧消息在场、新消息未到时，nonce 落到旧消息上。
- **修法**：按消息身份绑定。wire 上 `user/message` 的 `data.source.rpcId` 就是 `session/prompt.requestId`（deepseek-harness session-controller index.ts:484；类型注释明示「Client-minted prompt identity used to reconcile optimistic and durable messages」，SDK 自己的对账机制）。`reduce.ts`（user 条目带 rpcId）→ `turn-fold.ts`（透传）→ `entries.ts`（nonce 只绑 `rpcId === clientNonce` 的最后一条用户消息，无命中不消费，等下一次快照）→ `data.ts`（pendingNonce 回到单 nonce，删 clientPrompt）。重试链（R5 换回原 nonce 后）原消息的 rpcId 即原 nonce，同样命中。
- **证据**：探针 `probe-f2.log`——历史同文本（rpcId=old-N）+ 新 nonce：old-u 不带 nonce、ack records 保持 1（f1：1→0）；新消息以 rpcId 到达绑到 new-u。单测：`entries.test.ts` 4 例（身份绑定 / 未到不消费 / 同文本旧 rpcId 不误绑 / 重试命中）+ `p5-w3f1.test.ts` R4/O2 全链 2 例（含 f1 探针场景复现）。

### R5 · 连续重试 wire 变 N1、N1、N2 · 已修
- **根因**：覆盖层 `retryFailed` 登记 `fresh→prior` 只回退一跳——第二次重试的 prior（N2）本身是重试铸出的 nonce，`withWireSendPromptNonce` 只映射到 N2，第三次 wire 不再复用 N1，SDK requestId 幂等去重对连续重试失效（重复执行风险）。
- **修法**：`overrides/modules/acknowledgement.ts` 登记时 prior 若已在映射里则跟到根（`retryWireNonces.get(prior) ?? prior`）再登记。
- **证据**：探针 `probe-f2.log`——map 折叠为 `N2→N1、N3→N1`，三次 wire requestId `["N1","N1","N1"]`（f1：`["N1","N1","N2"]`）。单测 `p5-w3f1.test.ts`「连续重试 N1→N2→N3：wire requestId 恒为 N1」（真实控制器链，f1 探针同款路径）。

### 真模型重跑（f1 疑 GLM 限流）· 两例全绿，无需修复
- SDK `security.test.ts` ⑤ real-key D2 smoke（LiteLLM 真模型 min-client 旅程 + 密钥扫描）：单跑 **1 passed，11.9s，`⑤ real-key scan hits=0 (scanner reported CLEAN)`**——实跑非 skip（skip 分支会打印 endpoint 不可达）。GLM 限流确已恢复。
- UI e2e `tests/e2e/journeys/d1-real-model.spec.ts`（D1+D2 真模型流式 + M2 原帧 tap === chunkCount）：单跑 **1 passed，17.1s**（流式 / 定稿 / turn/end / 计数全过），且在全量 68 里再过一次。

## 红基线（先红后绿）

- `entries.test.ts`：2 红（身份绑定两例——旧代码按 prompt 匹配，传 `{clientNonce}` 无 prompt 时落到「绑任意最后一条用户消息」回退分支）
- `p5-w3f1.test.ts`：3 红（聚合附卡 / 连续重试 / f1 探针场景：old-u 被补 nonce、records 1→0）
- 修复后 5 例全绿；无测试硬编码（断言走真实 foldTurns / serialize / 真实 ack 控制器链）。

## 回归（双包全量，均不低于基线计数）

| 包 | 命令 | 结果 |
|---|---|---|
| app/ui 单测 | `pnpm test` | **36 文件 405/405**（基线 399，+6 新用例） |
| app/ui e2e | `pnpm build`（产物重建，04:48）→ `pnpm test:e2e`（Xvfb） | **68/68**（9.0m） |
| renderer-grok | `pnpm check` | upstream diff=0（332 文件） |
| app/sdk | `pnpm test`（env 带 LITELLM_MASTER_KEY，⑤ 实跑） | **37 文件 319/319**（88.6s） |

## 提交

- `f03e0a3` fix(p5): P5-W3.f2 修复链 R2/R4+O2/R5（f1 验收 FAIL 三项）——基于 f3d5560，8 文件 +196/-33（产品 6 / 测试 2），上游移植树零改动
- 探针脚本与日志：`work/p5-parity/evidence/P5-W3f2/probe-f2.{ts,log}`（f1 同款断言点复跑）

## 未完成 / 新发现

- 无新问题。f1 报告「超出预算未验证」两项（data.ts:186 断链游标、历史 commit 正文来源行）不在本链范围，维持原处置。
- 已知余量（f1 记档沿用）：pendingNonce 按 agentId 单槽，同会话并发两次在途发送时前一 nonce 的 echo 对账依赖 onBaseline 整体替换兜底——rpcId 绑定后不再有误绑，但多发送在途的逐条对账仍非精确（显示收敛，无错误副作用）。

待 verifier 验收。
