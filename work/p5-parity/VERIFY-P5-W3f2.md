# VERIFY · P5-W3.f2（f1 FAIL 修复链验收）

- **SHA**：`f03e0a3ed8c12bd65ff77b3a5f9d0387fea4faf5`（worktree `/tmp/bot-wt/P5-W3f1`，基于 f3d5560；验收期间未漂移，树干净）
- **总结论：PASS**。6 项验收全部 PASS，无新问题。计数与 builder 自报完全一致（405 / 68 / 319）。
- 证据目录：`evidence/P5-W3f2-vfy/`（probe 复跑、坏路径探针、各套件日志、上游锚点核对）

| 验收项 | 结果 | 证据 |
|---|---|---|
| R2 三条投影路径 toolResult 非 null | PASS | 独立复跑 `probe-f2.ts`（esbuild 打包后 node 执行，`probe-rerun.log`）：direct/feed/tail 三路 output 均为 `VFY-UNIQUE-FULL-RESULT`（f1 feed/tail 为 null）。修法核对：上游 `frontend/src/production/model.ts:469-501` 聚合函数内部确绑模块内投影，`export *` 透传拿不到附卡——覆盖层按上游形状重建两个聚合入口是必要且正确的修法；本地复刻的 `sentWhileOfflineAtMs`（上游 :287）/`projectThreadSummaries`（上游 :488）与上游逐行等价。生产路径：fresh sourcemap `index-B9XyfcVy.js.map` 含 `overrides/modules/model.ts`（MODULE_OVERRIDES 别名 `production/model.ts`→覆盖层，18 个替换项全在包里） |
| R2 未改 renderer-grok 上游 | PASS | `pnpm --dir app/ui/renderer-grok check` → `upstream diff=0: 332 files`（`renderer-grok-check.log`） |
| R4/O2 身份对账 | PASS | 锚点属实：`repos/deepseek-harness/packages/api/session-controller/src/index.ts:484` `rpcId: request.requestId`；`types.ts:387` 注释原文「Client-minted prompt identity used to reconcile optimistic and durable messages」。rpcId 贯穿已在 diff 核实：`reduce.ts` user/message 读 `source.rpcId` → `turn-fold.ts` rpcIdOf 透传 → `entries.ts` 只绑 `e.rpcId === nonce`（无命中不消费）→ `data.ts` pendingNonce 回单 nonce。复跑探针：old-u（rpcId=old-N）序列化无 clientNonce、ack records 保持 1（f1 为 1→0）、新消息 rpcId=new-N 绑到 new-u |
| R5 重试 wire 恒 N1 | PASS | 复跑探针：map 折叠 `N2→N1、N3→N1`，三次 wire requestId `["N1","N1","N1"]`（f1 为 N1,N1,N2） |
| 真模型 2 例 | PASS | SDK `security.test.ts` ⑤ 单跑：1 passed（20.3s），stdout `⑤ real-key scan hits=0 (scanner reported CLEAN)`——实跑非 skip（skip 分支打印 endpoint 不可达）。e2e `d1-real-model.spec.ts` 单跑：1 passed（15.4s），D1 流式+定稿+turn/end+M2 计数全过 |
| 全量回归 | PASS | 负载 6.56/30 核（22%）下从干净状态跑：UI 单测 36 文件 **405/405**；`pnpm build` 重建产物（out/ 全量 05:12 时间戳，`ui-build.log`）后 e2e **68/68**（9.3m）；SDK **319/319**（37 文件，92.2s，⑤ 实跑）。与自报 405/68/319 逐项一致，均不低于基线（≥399 / 68 / ≥305） |
| diff 无夹带 | PASS | `git diff f3d5560..f03e0a3`：8 文件 +196/-33，逐文件核对全部映射到 R2（model.ts 覆盖层+2 测试文件）/ R4+O2（reduce/turn-fold/entries/data）/ R5（acknowledgement.ts 3 行根因修），无无关改动；renderer-grok 上游树零触碰 |

## 坏路径探针（`probe-extra.log`，独立于 builder 的探针）

- R4 对抗变体：旧消息**无 rpcId** + 新消息带 rpcId 并存 → nonce 只落 new-u，旧消息不沾；新消息未到时无泄漏、ack records 保持 1。
- R5 对抗变体：重试树分叉（N1→N2、N1→N4、N2→N3）→ map 全折到根，四次 wire requestId 全 `N1`。

## 新问题

无。builder 报告「已知余量」（pendingNonce 按 agentId 单槽、多发送在途逐条对账非精确）为 f1 记档沿用的显式残留，rpcId 绑定后无误绑副作用，维持原处置，不构成本轮 FAIL 项。

清理自查：`bot-reap --dry-run --match P5-W3` 空（无残留进程），临时 HOME `/tmp/bot-P5-W3f2-home` 已删。
