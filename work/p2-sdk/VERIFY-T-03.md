# VERIFY · T-03 市场 dsh 侧 + 连接器按 session 启用（D6 基座，p2temp）

verdict: PASS
commit: affff7b737152f8b542bbef6b0c4f766b6d6013f（feat/T-03，worktree /tmp/bot-wt/T-03；验收 2026-11-01 15:27–15:36，全程串行 `--no-file-parallelism`，GPU 训练 load≈5.4 / iowait=0）

验收项原文（PLAN §2 T-03 ①②③，G2-r2 清单 3 基线修正口径）：

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| 干净复跑全量（派发口径「应 51/51，8 文件」） | PASS | `rm -rf node_modules && pnpm setup`（frozen，无漂移）→ `pnpm test -- --no-file-parallelism`：**Tests 51 passed (51)**，exit 0，13.15s。文件数为 **9 不是 8**：main 6 个 + T-03 新增 3 个（tests/market/ 2 + tests/unit/p2temp.test.ts 1），派发口径漏算了 p2temp.test.ts；用例数 51 与派发完全一致。evidence/T-03/t03-clean-full-suite.log |
| ① `/api/pluginMarket/search` 对本地 format-1 快照返回条目 | PASS | vitest `tests/market/market-search.test.ts` 4/4（verbose 见 t03-market-unit-verbose.log）+ **verifier 亲跑**（evidence/T-03/t03-hands-on.mjs/.out，非 builder 断言路径）：真实 start.mjs→dsh→网关 HTTP 链路，search 返回 `title="p2sdk fixture market" total=3`（demo-mcp / echo-tool / other-tool），`text:'echo'` 收窄至恰 1 条。快照 fixture = tests/market/fixtures/market-index.json（format:1），经 127.0.0.1 静态服务供给，无真实市场访问 |
| ② 装 MCP bundle fixture（enabled:false）→ X 启用 Y 不启用 → X 工具表含 `mcp__<name>__*`、Y 不含；工具表 35 vs 31 复核 | PASS | 亲跑 hands-on：`pluginManager/installBundle {enabled:false}` → `application=applied`；同一 runtime 内 X（p2temp 建）请求侧工具表 **35** 含 `mcp__demo__ping`，Y（普通 session/create）**31** 且 `mcp__*` 0 个——与 builder 口径 35/31 逐数复现。35−31=4 的构成已查明（evidence/T-03/t03-tool-diff.out）：mcp-client 插件自带 list/read_mcp_resource(s/_templates) 3 个通用工具 + ping 1 个，**非预设错配**（Y 显式 agentPreset='standard' 与默认同为 31、工具集逐项相同） |
| ③ 方法差集恰为 1 个 `p2temp/session.createWithConnectors`；grep P2-TEMP 命中面与签名一致 | PASS | 亲跑（methods-snapshot.mjs 观察者随 market.yml 装进我自起的新 runtime，读 `$P2SDK_HOME/methods.json`）：full=**144**（=builder 口径）、bare=139，差集=**5** = 4×`pluginMarket/{search,listIndexes,readEntryDetail,setIndexes}`（@deepseek-ai plugin-market 服务自带，按 G2-r2 修正留在基线）+ **恰 1×`p2temp/session.createWithConnectors`**；`p2temp/*` 全表仅此 1 个。测试实现（added 剔除 pluginMarket/*）与「基线保留所有 @deepseek-ai/* 启用项、只去 src/ 自有插件」代数等价（full−(bare∪pluginMarket/*)={p2temp}）。`grep -rn "P2-TEMP" app/sdk/src` 命中 2 行均在 src/p2temp/index.mjs（:1 头标、:59 耦合注记）；签名 :4 与 PLAN 逐字一致**至空白**（PLAN 表格压缩无空格 `{connectors:string[],…}`，src/tests 用带空格排版 `{connectors: string[], …}`，语义逐字相同——见注记 3）。禁止清单核：无自建安装器（安装走 pluginManager/installBundle）、无持久化（p2temp 只 readFile 不写业务文件）、无跨 session 调度、无热启用（方法只建新 session，签名无 sessionId 入参） |
| 区域检查：净新增 = market.yml、src/p2temp/、tests/market/*、tests/unit/p2temp.test.ts + 区域外 vitest.config.ts 一行 | PASS | `git diff --name-status 974e09e..affff7b -- app/sdk` = 恰 10 文件：9 新增（全在申报区域）+ vitest.config.ts 1 行 include 追加 `tests/market/**/*.test.ts`，无其他改动；跑前跑后 worktree `git status` 干净。evidence/T-03/t03-region-and-static.txt |
| vitest.config.ts 追认裁定 | **追认** | 理由：① `include` 是 vitest 拾取测试文件的唯一机制，替代方案只有把市场测试挪进 tests/e2e/——与 PLAN 自己的区域约定（`tests/market/`）矛盾；② 单行纯增量，对既有 6 文件零行为变化；③ 先例 T-01 pnpm-workspace.yaml 同标准（无替代方案 + 改动最小）。建议主会话在 PLAN §3 区域约定补记 `app/sdk/vitest.config.ts`（include 行）归 T-03 |
| 上游出处抽查：bundle fixture 结构 vs creator-plugin-manager.expected.e2e.ts:33-41 | PASS | repos/deepseek-harness（只读）原文 33-41 行：package.json `{dsh:{bundle:{patch:'./cordis.patch.yml'}}}` + cordis.patch.yml = JSON `[{insert:[{id,name:'@deepseek-ai/dsh-mcp-client',config:{serverName,transport,…,failOnStartupError:true}}]}]`。我方 tests/market/support.ts:39-62 同构；两处差异均有就地注释理由：stdio(command/args) vs streamable-http(url)（fixture MCP server 是 stdio 的）、file:// 绝对路径 vs 裸包名（$DSH_HOME profile 无 node_modules）。commit 9fc7f22 正文已注明 `deepseek-harness@ce7073d …:33-41 (MIT)`，符合 CLAUDE.md 出处硬约束。evidence/T-03/t03-upstream-fixture-compare.txt |
| 独立复现 144 方法数 | PASS | 上文 ③：verifier 自起 runtime 亲跑观察者脚本得 full=144，且用持久化 methods.json 交叉复核（144 行文件 vs 139 行文件差集恰为 5=4+1） |

坏路径（verifier 选「坏连接器入参」）：`connectors:['@nope/missing']` 与 `connectors:[]` 均经 RPC 报错（`p2temp: connector … is not installed` / `connectors must be a non-empty array…`），`session/list` 计数 0→0，未建出半成品 session。evidence/T-03/t03-hands-on.out 末 4 行。

注记：
1. 派发口径「8 文件」实为 9 文件（51 用例数一致）；非 builder 问题，建议主会话此后以「main N 文件 + 本任务增量」表述。
2. 覆盖率现状（非 T-03 验收项）：本分支 `vitest run --coverage` = 71.58/68.81/80/74.37，**未达 80 阈值**——start.ts 72.99（继承 f2，LOG 15:3x 已记）+ p2temp/index.mjs 67.39（服务类 94-118 行跑在 dsh 子进程内，v8 跨进程不计；纯函数部分 unit 已覆盖）。不影响本任务 PASS，但挡出口汇合 ②（≥80）。
3. 「逐字一致」空白差异：PLAN T-03③ 表格文本无空格、src/tests 用带空格排版。T-10 写 README「临时扩展」时请以 src/p2temp/index.mjs:4 的带空格形式为准（并让 VERIFY 对 src 比对），避免按 PLAN 表格压缩文本 grep 出假 FAIL。

新问题（每条一行，可直接成为修复任务）：
- [FIX] 覆盖率阈值不过（71.58/68.81/80/74.37 < 80），挡出口汇合 | 复现：`pnpm -C app/sdk exec vitest run --coverage --no-file-parallelism` | 疑似位置：src/start.ts（f2 子进程路径无 unit，72.99）+ src/p2temp/index.mjs:94-118（服务类跨进程不计，67.39）| 严重度 LOW（不挡 T-03，挡出口；f2.f1 锁测试已计划补一部分，p2temp 服务类可 mock ctx 补 unit 或改跨进程计数）
- [FIX] p2temp 坏路径错误码为 `gateway/internal`（500 类）而非 4xx 参数校验错 | 复现：evidence/T-03/t03-hands-on.out `bad path: uninstalled connector errors` 行 | 疑似位置：src/p2temp/index.mjs（异常未映射为 validation 错误码）| 严重度 LOW（P2-TEMP P3 推翻时一并处理）

验收环境：pnpm 11.0.9 / vitest 5.0.5 / Node v24.22.2（devEngines ^24.9.0 钉定，达标）；/repos 只读，未用 pkill -f；未改任何产品代码，仅写 evidence/ 与本文件。
