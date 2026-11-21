verdict: PASS
commit: a24bfa848397bc550e4128e3a724b909d12d8ebc（feat/U-26 @ /tmp/bot-wt/U-26，验收期间 head 未漂移）

# U-26 验收：GU-PDC REVISE 清单修复（接缝 / D5 / #11 分页 / MEDIUM）

验收人独立复跑，全部在 worktree 干净状态、临时 HOME（/tmp/bot-vfy-u26）下进行；红复现在独立 detach worktree（2fed799）。

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| ⑤a 生产构建 | PASS | `cd app/ui && pnpm build` → 3 段全绿（main 1.80kB preload / renderer 265 modules，18:14） |
| ⑤b 单测全量 | PASS | `pnpm vitest run` → **21 files / 196 passed**（2.92s，18:15），与 builder 申报一致 |
| ⑤c e2e 全量（--workers=1） | PASS | `pnpm test:e2e --workers=1` → **45 passed**（4.0m，18:15–18:19），含 market 2 + settings（D10c1 四处）+ session 4（#11 分页） |
| ⑤d sdk 不回退 | PASS | sdk 全量 `pnpm test` → **20 files / 148 passed**；market 相关单测 19/19（connectors 4 + market-search 4 + market-wrapper 11）。派发写「17 例」，实测相关面 19 例 + 全量 148，只多不少；U-26 对 sdk 的改动仅 wrapper.mjs + 新增 wrapper-name.mjs，调用方文件零改动（`git diff --stat 2fed799..a24bfa8 -- app/sdk` 仅此 2 文件） |
| ① 接缝：wrapper-name.mjs 单点 | PASS | `app/sdk/src/market/wrapper-name.mjs`（纯函数、零 node: 依赖）；renderer `store.ts:7` 相对路径 import **同一文件**（`../../../../sdk/src/market/wrapper-name.mjs`）；`wrapper.mjs:28-29` re-export，sdk 侧 API 不变（148 全绿实证）。renderer 全仓 grep 无第二份命名规则（`@p2sdk-market` 字面量只在测试钉死断言里）；`installedNameOf`（store.ts:73-78）同时认源名与 wrapper 名；Detail「用它新建 Bot」预勾实际 bundle 名（Market.tsx:60,88）。单测 classify.test.ts:20 字面量钉死 |
| ② D5 全旅程（spec 语义逐条） | PASS | market.spec.ts:175（P-C ②）逐条核对：**(a) enabled:false 精确断言**——`m1Installs.filter(spec===filesystem@1.2.29).toEqual([{spec,enabled:false}])`（toEqual 精确等值，观测面 `__pbotsM1` 只记透传成功的调用、无新 IPC，m1/api.test.ts 新增「拒绝不进」单测）；**(b) ✓**——装后 `data-kind=installed` + `.m-ok`「已安装」（认 wrapper 名，正是接缝修复点）；**(c) 预勾**——`[data-connector-option="@p2sdk-market/agent-infra__mcp-server-filesystem"] input` checked；**(d) X 实调**——建 X（recipe connectors === [WRAPPER]，bots.json 断言）→ `mcp__mcp-server-filesystem-3408f957__read_file` 真实 stdio server → tool-row done + 详情含 `u26-d5-connector-evidence`；**(e) Y 空**——request/header 探针 `yTools.filter(mcp__*) === []`。亲跑 2 次：全量 45 内 1 次 + 单跑 `pnpm test:e2e tests/e2e/market.spec.ts` → **2 passed (22.2s)**（18:33） |
| ③ #11 分页 | PASS | 实现：follow 带 `maxMessages=HISTORY_PAGE(40)`，snapshot `hasMore`+首条 seq 进 SessionView（reduce.ts:169-172）；`loadOlder` 走 M1 白名单既有行 `session/events`，`beforeSeq` 游标、失败游标不变只重试该页、空页/无 seq 取尽（store.ts:299-336）；顶部三态 older-bar + prepend 后 scrollTop 锚点补偿。E2E session.spec.ts:141：45 轮长历史 → reload 首窗 40（TURN-1 窗口外断言）→ **failNext 注入 session/events 失败 → 顶部失败态 + 重试按钮（本任务坏路径）** → 逐页补全到最早轮 + 顶部条消失 + 窗口内既有内容不动。45/45 内亲跑通过 |
| ④ MEDIUM 三处 | PASS | M1 select 置灰 + 文案：`app.css:261 .pane-field select:disabled{opacity:.45}`，InfoPane readOnly 态状态行「连接器已失效，不能改模型」；settings.spec.ts:171-174 断言 opacity 0.45 + 文案 + set-main disabled + title。M2 失效 bot 禁设主 Bot：InfoPane.tsx:107-109 `disabled={…\|\| readOnly}` + title。M3 三分类归一：serve 层 `patchRealIndex()`（connectors.ts:36-45）给「有 npm 坐标但 devDeps 版本不一致」的条目打 not-installable keyword，classify 现有逻辑自动归仅浏览（产品代码零改动）；实测 console `[U-23] 三分类实测：{"browse":109,"installed":1,"installable":1}` = **109-1-1**（算术：90 原生 + 19 未预置打标 / 1 filesystem 预置 / 1 pretrip 预装） |
| 红复现口径终裁（步骤 3） | **1 红** | 独立 detach worktree @2fed799（先装 ui+sdk 依赖并 build）：`pnpm test:e2e tests/e2e/market.spec.ts` → **1 failed / 1 passed**。红的是 P-C ②：`expect data-kind="unsupported" Received: "installable"`（180s timeout，spec.ts:180）——filesystem wrapper 装成功但 classify 不认 → 仍是 installable，即接缝本身；P-C ① 三分类 90-20-1 **仍绿**（此时 filesystem 尚未安装）。**终裁：builder「1 红」正确**；`work/LOG.md:486`「A 席实锤（main 亲跑确认 2 红）」与 GU-PDC-A.md 原文 L11「我没有实跑……main 上应当是红的」（未实跑、单数推断）不符，属转述升格 |
| 三分类口径正当性（步骤 4） | 成立 | GU-PDC-A [MEDIUM] 建议原文即「数据面打 not-installable keyword，classify 自动归仅浏览，零代码；预置补齐再摘掉」——builder 原样落实且更稳：判定与 devDeps 版本实时对比（补齐自动摘除），落在 serve 层（快照生成器与 serveMarket 同为数据面，选后者不污染共享快照）。注记：此归一只作用于 e2e serve 数据面；产品连真实在线 registry 时上游数据无此 keyword，未预置裸包仍会走 dsh 结构化 not-bundle 拒（非回退，属预置补齐前的已知过渡态） |
| 区域（步骤 5） | PASS | `git diff --stat 2fed799..a24bfa8` = 18 文件（+458/−67）：sdk 侧 2 文件（wrapper.mjs 改 + wrapper-name.mjs 新增，与派发一致），其余 16 文件全在 app/ui（renderer 8 / main 1 / tests 7），无越界 |

## 截图亲验（降级证据说明）

本会话 Read 图片仅返回 CDN URL（无视觉呈现）、外部视觉工具对该 CDN 域一律 400，**视觉通道不可用**。降级为 tesseract.js（eng）OCR 逐字核验 + PIL 像素统计，三张新截图全部命中预期关键词、像素分布为正常亮色 UI（非空白/非桌面截图）：

- `work/p4-ui/evidence/PDC/pc-d5-tool-call.png`（1280×820，白底文本色阶 1727 色）：窗口标题「standard - @p2sdk-market/agent-infra__mcp-server-filesystem」，工具行「Mcp Server Filesystem 3408f957 Read File …/hello.txt」，展开详情含 **u26-d5-connector-evidence** 原文，末条助手消息「D5 读取完成」——D5 主体的直接图像证据。
- `pc-new-with-wrapper.png`：新建对话框连接器列表中 **@p2sdk-market/agent-infra__mcp-server-filesystem 处于勾选态**（46.5% 灰 = 对话框遮罩层，与 D5 段落截图时序吻合）。
- `pc-filesystem-detail.png`：详情页「@agent-infra/mcp-server-filesystem - v1.2.29 · MCP server for filesystem access」+ 已安装态说明（「不会全局启用」结构）。

OCR 全文已逐字比对；若需像素级复核，可在有视觉通道的会话重看这 3 张图（均在主仓 evidence/PDC/）。

新问题（每条一行，可直接成为修复任务）：
- [FIX] dirSegmentOf 存在两份实现（wrapper-name.mjs 内部函数与 wrapper.mjs:56 箭头副本），wrapperNameOf 单点成立但底层段规则漂移无防护 | 复现：改 wrapper-name.mjs 的 sanitize 规则后 wrapper.mjs 的 serverName 段不随动 | 疑似位置：app/sdk/src/market/wrapper.mjs:56 | 严重度 LOW
- [NOTE→LOG 勘误] 红复现口径：LOG:486「A 席实锤（main 亲跑确认 2 红）」系转述升格（GU-PDC-A.md L11 原文「我没有实跑……应当是红的」），实证基线 1 红；建议 LOG 勘误一行，LEARNINGS「转述不升格证据强度」可并入现有「限定词丢失」条 | 严重度 LOW（流程）
