# T93：tray Edit 底座——「回滚上一轮」= fork 到上一条用户消息之前 + bot 换绑到子会话（不做 UI）

> 开单：manager (Opus 5.5) | 日期：2026-11-16 | 施工：main (GLM 5.3)
> 来源：queue 8 行（A5 tray Edit）；T92 探针 PROBE_OK（queue 6 行）；`receipts/T92.probe.md`
> 原版锚：0.78.1 `work/grok-0.79.3-re/RE-UI-FACES-0.78.1.md` §4.2 L235（tray `data-sand-tray-action` = roll-back / start-fresh / buy-credits；Edit `ePK91l` = 编辑最近一条用户消息并回滚重跑）、差距表 L254；1.1.0 `work/grok-1.1.0-re/deb110/asar/dist/electron-main/main-app.cjs` `grok_bot_error_tray` + `case"start-fresh":case"roll-back":return\`${n.kind}:${n.sessionId}\``（tray 是**错误 tray**，动作按 sessionId 去重）
> 分支 / 作业目录：feat/T93 @ /tmp/bot-wt/T93
> claimed：main 2026-11-16（回执 receipts/T93.receipt.md）
> accepted：—（2026-11-16 经理验收：H1/H2/M1/M3 修复核实通过；M2 侧栏父壳违反本单「roster 不再出父」→ T93c；T93+T93c 一起验收合并）

## 目标
shim 新增一个能力 `rollBackLastTurn(botId)`：把这个 bot 的会话回到「最近一条用户消息之前」，返回 `{ sessionId: 子会话 id, text: 那条用户消息原文 }`；bot 在侧栏里还是同一个 bot（名字、形象、置顶、主 bot 身份不变），旧会话不再出现。UI（错误 tray 的 Edit 钮、把原文装回 composer）是下一张 T93b，本单不碰。

## 为什么是 fork + 换绑（已定，不再问用户）
dsh 无同会话回滚（T92：33 个方法无 truncate/rollback）。原版 roll-back 的用户可见结果 = 同一个 bot、尾巴那一轮没了。fork 产生新 sessionId，所以「同一个 bot」要靠换绑：把 bot 身份相关的状态从旧 id 挪到新 id，旧会话藏起来（留盘不删——原版丢弃尾巴，我们只是不显示）。T92 回执里「旧会话处置要用户拍板」按原版即规格定为**藏**，不进 QUESTIONS。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md（:65 fake 插件游标坑——**多轮脚本一次 writeScriptCalls 灌完整段**，第二次覆盖不重置游标；:212 每轮等待用本轮唯一标记、回归测试须在修前形态红过一次——T85d 教训）
2. `work/tickets/evidence/T92-fork-probe.mjs`：起 SDK runtime + `examples/lib/client.mjs` connect(baseUrl, token) 的跑法。**口径**：gateway 全端点参数要包壳——单参方法用 `{request:{…}}`（如 `session/fork {request:{sessionId, atSeq?}}`、`session/prompt {request:{…}}`），无参 / 多参方法用 `{_request:{}, …}`；不包壳 gateway 拒 `Remote payload must contain exactly one plain-object args field`。`session/tail` 404 = 方法名不对，取内容用 `session/events`（shim `data.ts:671` 已用）。
3. shim `renderer-grok/shim/src/{data.ts,avatars.ts,desktop.ts,agents.ts}`、main `m3-meta/store.ts`（bot 身份 = sessionId）

## 第一步：补探针事实（扩 T92 脚本，另存 `work/tickets/evidence/T93-fork-facts.mjs` + `.out`）
fake 脚本一次灌三条 call（答一 / 答二 / 分叉后答），会话发两轮后：
- F1 边界：用 `session/events` 找最后一条用户 prompt 事件的 seq，`session/fork {request:{sessionId, atSeq:<该 seq 或其前一个——实测定>}}`；断言子会话 events **含**「问一 / 答一」、**不含**「问二 / 答二」。atSeq 的确切含义（含不含该 seq）以实测为准写进回执。
- F2 子会话继承什么：cwd（必须 = 父的 `workspaces/<父id>`）、标题（rename 过的名字）、agentPreset、所选模型。逐项记 yes/no。
- F3 子会话续发：再发一条「分叉后新问」→ 收到「分叉后答」。
- **停止条件**：F1 切不出「上一条用户消息之前」，或 F2 cwd 不继承 → 停，回执报经理走任务 C（不要绕：cwd 不继承意味着 bot 换了工作区，原版没有这个语义）。

## 换绑清单（经理 grep 的初稿，施工时以 `grep -rn "sessionId\|agentId" shim/src` 实数补全，回执逐项列「挪 / 不挪 + 理由」）
| 状态 | 位置 | 处理 |
|---|---|---|
| 名字 | dsh 会话标题（`session/rename`，data.ts:824/836/870） | F2 未继承则对子会话 rename 成父的标题 |
| 模型 | `session/selectModel`（data.ts:919） | F2 未继承则对子会话 selectModel |
| 形象 | `avatars.ts` localStorage（按 bot id） | 挪 |
| 置顶 | `desktop.ts` localStorage 置顶列表 | 挪（保持原位次） |
| 侧栏隐藏（用户偏好） | `data.ts:164` `pbots.shim.hidden-agents` | 父在集合里则子也进 |
| 主 bot | bots.json `mainBotId`（metaApi） | 父是主 bot 则改指子 |
| worker 归属 | bots.json `bots[*].createdBy` | 指向父的改指子 |
| 连接器 standing grant | SDK `standing-grants.json`（bot×server） | **不挪**——要新 SDK 端点且是授权搬运面；已知差异：Edit 后每个连接器会再问一次。回执记，queue 记提议 |
| reaction（T91，若已合并） | dataDir 侧文件 | 合并了就挪；没合并写「不适用」 |
| 旧会话 | — | 新 localStorage 集合 `pbots.shim.superseded`（**不复用** hidden-agents——那个会出现在「Show in sidebar」列表里），roster 加载时过滤；不删盘 |

顺序：fork → 逐项挪 → 最后写 superseded。中途失败：已挪的不回滚，子会话不进 superseded 以外的任何清理，返回 `{ok:false, message}`；父未进 superseded → 最坏是侧栏多出一个子会话，不丢数据。

## 边界
1. 只动：`renderer-grok/shim/src/` 内文件（新能力建议独立小文件如 `rollback.ts`，data.ts 只加接线和 superseded 过滤）、新单测、evidence 脚本。不碰 overrides/、transcript、main、sdk。超出停下写存疑。
2. 先写失败测试：`tests/unit/grok-shim/t93-rollback.test.ts`（fake api 记录调用序列）：
   - 正常：fork 参数 = 由 events 算出的边界；返回的 text = 最后一条用户消息原文；清单每项都挪了；superseded 只含父；roster 不再出父、出子。
   - 父是主 bot / 有 worker / 有置顶 / 在 hidden 集合：各一格。
   - 会话里没有用户消息 → `{ok:false}`，零 fork 调用。
   - fork 失败 → `{ok:false}`，零挪动、superseded 不变。
   - 挪到一半失败 → 父不进 superseded。
   现状下（函数不存在）先红，贴输出。
3. 测试隔离 HOME / TMPDIR，DBus 指向不存在路径；不跑全量 e2e。
4. 凭证不进代码、文档、日志（evidence 脚本读 token 文件，不打印）。

## 验收（写命令，不写感觉）
1. `node work/tickets/evidence/T93-fork-facts.mjs | tee work/tickets/evidence/T93-fork-facts.out` → 末行 `FACTS_OK`；`.out` 里 F1 的含 / 不含两条断言、F2 四项 yes/no、F3 续发回答都能 grep 到原样行。
2. `cd app/ui && pnpm exec vitest run tests/unit/grok-shim/t93-rollback.test.ts --config.verify-deps-before-run=false` → 全 passed（≥6 格）；回执贴改前红。
3. `pnpm exec vitest run tests/unit/grok-shim/ --config.verify-deps-before-run=false` → 与起点 SHA 同口径（不新增红）。
4. 新文件行覆盖 ≥80%：同 2 加 `--coverage --coverage.include=<新文件>`，回执贴数。
5. 回执附换绑清单终版（每行 挪/不挪 + 理由 + 代码行号）。

## 为什么这样验收
要保住的是「用户点 Edit 后还是同一个 bot，只少了最后一轮」。所以：F1 用**内容**断言切点（不是只看 fork 返回了新 id——T92 已经证过这个，没证切在哪）；单测断言**每项身份状态都跟过去了**和**旧会话看不见了**，漏一项用户就会看到 bot 变了名 / 丢了形象 / 主 bot 掉了 / 侧栏出现两个同名 bot。失败路径格防「半挪」把用户的 bot 弄没。

## 后续（不开单，排 queue）
- **T93b** 错误 tray UI：轮次失败时出 tray（Edit = roll-back、Start fresh = `Reset this conversation?` 确认），Edit → `rollBackLastTurn` → 切到子会话 → composer 装回原文；先取 1.1.0 renderer 侧 tray 结构与出现条件锚。等 T93 回执 + T91 链合并（transcript 区）。e2e 失败轮 + 成功轮一次灌脚本。
- 提议：standing grant 随 Edit 迁移（需 SDK `connector_grants_rebind{from,to}`，安全面：只许 superseded 父→子）。

## 产出
- 新：`shim/src/rollback.ts`（名可改）、`tests/unit/grok-shim/t93-rollback.test.ts`、`work/tickets/evidence/T93-fork-facts.{mjs,out}`
- 改：`shim/src/data.ts`（接线 + superseded 过滤）
- `receipts/T93.receipt.md`
