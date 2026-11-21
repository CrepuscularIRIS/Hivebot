# VERIFY-T-15 · CONTRACT 遗留探明（两个测试即结论）

verdict: PASS
commit: a3758e0aeb18a04127e59579c2b93e1e55e0107f（/tmp/bot-wt/T-15，feat/T-15；验收期间 HEAD 无漂移、工作树干净）
验收时间：2026-11-02 01:28–01:33（本机 date 实测）
跑法：`cd /tmp/bot-wt/T-15/app/sdk && HOME=/tmp/bot-t15-vfy node_modules/node/bin/node node_modules/vitest/vitest.mjs run <目标>`（仓内 pnpm 托管 node v24.22.2；系统 node 22 过不了 devEngines；GPU 训练中全程串行）

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| 探明① connector-restart.test.ts 红，可复现，错误原文含 `Unknown agent preset: p2temp-` | PASS | evidence/T-15-verify/connector-restart-run.txt：`Tests 1 failed`，红 diff 原文 `"prompt": { "error": "prompt: session/prompt failed: {\"code\":\"gateway/internal\",\"message\":\"resume failed for session \\\"session-34b651e3-…\\\": RemoteError: Unknown agent preset: p2temp-1-79362c\"…}" }`；同 diff `freshBot: {ok:true}` 证明重启后运行时健康、新建连接器 bot 正常，红是旧 preset 特有 |
| 探明① 根因链由断言支撑还是仅注释 | PASS（两端断言实证，中间环节注释+上游源码核实） | 见下「根因链核对」 |
| 探明② events-replay.test.ts 绿（补发语义断言） | PASS | evidence/T-15-verify/events-replay-run.txt：`Test Files 1 passed, Tests 1 passed`（1.97s） |
| 探明② 补发语义断言覆盖核对 | PASS（见下「②断言覆盖核对」） | 测试文件 + 上游 gateway 源码独立核实 |
| 区域检查：diff 仅两个新测试文件 | PASS | `git diff --name-status 7ab9b42..a3758e0` = `A app/sdk/tests/e2e/connector-restart.test.ts`、`A app/sdk/tests/e2e/events-replay.test.ts`，428 insertions，零改动既有代码 |
| tests/market/ 单目录回归 | PASS | evidence/T-15-verify/market-regression.txt：`Test Files 2 passed, Tests 8 passed`（5.35s） |

## 根因链核对（①）

链条：SessionWireHeader.agentPreset 深冻结 → 重启 → resume → registry resolve（内存 definitions）抛错。

- 「深冻结临时 id」：**断言支撑**。测试 L198-201 从 follow snapshot 的 `header.agentPreset` 读出并 `expect(presetId).toMatch(/^p2temp-/)`，实测通过（红 diff 头部 `header presetId=p2temp-1-79362c`）。
- 「重启后 resume 失败」：**测试输出实证**（非专门断言，红即结论故不能加 contains 断言）：e 步 prompt 的 error 原文逐层 `session/prompt failed → resume failed → RemoteError: Unknown agent preset: p2temp-1-79362c`，与上游 resolve 抛错格式逐字吻合。
- 「registry 只存内存 definitions、不落盘」：**仅注释**（黑盒测不到），但注释引用的上游源码我已独立读实：repos/deepseek-harness packages/preset/agent-preset-registry src/index.ts register()（≈:96-115）写入 `this.definitions` 内存 Map、无持久化调用；resolve()（≈:219-224）miss 即 `throw new RemoteError('agent-preset/not-found', \`Unknown agent preset: ${wanted}\`, …)`。行号有 ±2 漂移，语义吻合。
- 注释与实测的一处偏差（不影响结论）：注释预断 d+e 两步都红；实测 d（follow opening snapshot）**绿**（`follow: {ok:true}` 匹配了 toMatchObject），红点仅在 e（prompt 的 resume）。即 follow 读 snapshot 不触发 preset resolve，prompt resume 才触发——根因链的实证位置比注释更精确。

## ②断言覆盖核对

- 补发存在 + 卡片内容：断言 ✓（L139-141 replayed 存在、toolName=bash、agentId=sessionId）。
- 订阅时刻语义：断言 ✓（L142-144 ready 帧严格先于补发 waterfall）。
- 新 clientId：断言 ✓（L145 重连 feed 的 clientId ≠ 首连）。
- 补发卡片可作答且拒绝不执行：断言 ✓（L148-150 answer 后 turnEnd、canary 文件不存在）。
- 「全量」快照的量纲：**无断言可覆盖**——任务原文流程只制造一个待审批请求，单条无法区分「全量快照」与「只补一条」；由注释引用 gateway 源码支撑，我已独立读实：repos/deepseek-harness packages/api/gateway/src/index.ts ≈:586-589 新 answer 客户端注册时 `for (const pending of this.pendingRemoteEvents.values()) this.deliverRemoteEvent(pending, client)`（全量、无筛选）；≈:732-738 断开只 `removeRemoteEventDelivery`（per-client per-pending），pending 本身不取消。
- 「无 cursor」：**无断言**（absence 无法黑盒断言），读码推定 + 上述源码核实（注册路径无任何 cursor/offset 参数，直接全量投递）。

## 坏路径

坏路径即两个测试的主体本身：①SIGKILL 整进程树（kill -9，最恶劣重启）+ freshBot 健康对照；②mux 断开期间产生 pending + rejected 应答零执行（canary 不存在）。均真实执行并留档于上述证据文件，不再另造场景。

## 环境与清理

- T-15 验收自身无遗留进程（测试 afterAll/finally 清理子进程生效；pgrep 列表中的残留均来自 T-12/T-13 旧任务，非本任务产生，未处理）。
- mkdtemp 残留：/tmp/p2sdk-t15-* 共 24 个目录（既有测试模式的通病，非本任务新引入；/tmp 重启自清）。
- 无 UI，无截图需求。

新问题（每条一行，可直接成为修复任务）：
- （无阻塞修复项。两条记录性事项：①测试注释预断 d 步红、实测 d 绿仅 e 红，注释可在后续修 preset.ensure 时顺手更正；②tests/market 与 e2e 的 mkdtemp 残留属既有模式，如需治理另立任务）
