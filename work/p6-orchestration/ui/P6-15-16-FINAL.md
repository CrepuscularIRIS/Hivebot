# P6-15 + P6-16 定稿 · worker 分组 / 两侧 transcript

2026-11-04 · frontend-dev（Opus 5.5）。输入：`UX-1-A.md`（席 A）、`UX-1-C.md`（席 C，代录）、PLAN v4 决策 20–28 + §11 R2-1、CONTRACT v1.5。
worktree `/tmp/bot-wt/P6-15` · 分支 `feat/P6-15` · 基点 main@92cb6af。

## 0. 结论

骨架取 **席 A**（合成 section、notice 载体 + `pbotsUi.peer` 元数据、token 表、E1–E21 断言），约束取 **席 C**（回报 / 任务都是 assistant 泳道里署来源名的消息，不是用户气泡；主 bot 里不放审批按钮，待人工入口只做 `focus(workerId)` 并定位原卡；离线不清空；平局按 sessionId 稳定排序；预览不露 JSON 和包装句）。两席都同意的「合成 section 优于嵌套折页」直接采纳，不派 RE。上游 332 个文件零改动。

## 1. 分歧逐条定稿

| # | 分歧 | 定 | 理由 |
|---|---|---|---|
| 1 | worker 分组形态 | **合成 section**（A、C 一致） | 第 2 级，回退就是 `getSidebarSections` 返回 null。嵌套折页要 fork 509 行 sidebar，而且 d8e/qA 在桩下没有复现过 |
| 2 | section 切法 | **A**：每个创建者 3 组：`pbots:main:<cid>`（只放创建者本人，不显示 header）→ `pbots:workers:<cid>` → `pbots:done:<cid>`，最后是 `__agents__`（不显示 header） | C 的「父 bot 名 + 的工作」与上方紧挨着的主 bot 行重复；`__agents__` 由上游 normalize 强制放在最后（sections-state.ts:175） |
| 3 | 组名 | **A**：`Workers` / `Done`，英文，与 0.78.1 i18n 一致 | 主 bot 行就在正上方，归属不靠组名说明 |
| 4 | Workers 默认展开还是按状态自动展开 | **A**：默认展开，永不自动展开 | 自动展开会和用户的折叠选择打架，信号已经由主 bot 行承担（决策 21） |
| 5 | Done 默认折叠 | **A**：取反存储（`ponytail:`） | 上游 collapse store 没有默认值参数，取反是最小改动 |
| 6 | 排序 | **决策 21**：blocked > running > failed/stopped（未读）> unread > done；同档按 updatedAt 降序，再按 sessionId（C） | 见 §2 第 2 条 |
| 7 | 已读的 failed / stopped 放哪 | **A**：进 Done，预览保留 `Failed:` / `Stopped` 前缀 | C 要求始终可见，但主 bot transcript 的回报卡已经永久记录 Failed；Done 组标题有计数，并没有隐藏 |
| 8 | failed 行的点 | **自定**：沿用上游的 `Unread activity` 点，加文字前缀 `Failed:` / `Stopped` | A 要的 error 点必须 fork `AgentSidebarItem`（点的颜色只由 waitingReason / hasUnread 决定，sidebar.tsx:271/282）。用文字表达状态也满足 C「状态不只靠颜色」 |
| 9 | blocked 行原因 | **A**：worker 行和主 bot 汇总用可读的 askText；普通 bot 仍是 `local-tool-permission`（D11⑤ 不改，REPORT 列为待办） | 改普通 bot 会越过 D11⑤ |
| 10 | 主 bot 汇总文案 | **A**：1 个 worker 时 `‹worker›: ‹askText›`，多个时 `‹n› workers need you` | — |
| 11 | 打开主 bot 是否清汇总 | **不清**（A、C 一致） | 读主 bot 不等于读了 worker |
| 12 | rail（窄轨） | 去掉 `pbots:workers/done`，只留主 bot 行（A、C 一致） | 上游在折叠态会把 section 的 agent 平铺出来（sidebar.tsx:461） |
| 13 | Messaging 行载体 | **A**：只把 `create_bot` / `send_to_bot` 的 tool-call 在 entries 层改成 notice + peer 元数据；与工具行同形（复用 `.sand-outline-item*`），整行是「打开」按钮，尾部 `›` | 工具行的 DOM 不带 entry id，只能展开 / 收起（transcript.tsx:572-599）。fold 仍然把它当工具算（改在 fold 之后） |
| 14 | 回报卡形态 | **A 的卡片 + C 的来源署名**：assistant 泳道（左对齐、与气泡同宽 ≤560），卡片 1px 边框 + elevated 底；每一项带 worker persona 头像（xs 16px，静态）+ 名字 + 状态词 + 结果预览（3 行，超出可「Show more」展开全文，纯文本）+ 整行点击 → `focus(workerId)` | 用户指令：「回报 / 任务卡为 assistant 泳道来源消息」。头像让卡片和侧栏行对得上号 |
| 15 | ask 项 | 只给定位入口：`Needs you` + `Open ›`，没有 Allow / Deny；点击 → `focus(workerId)`，打开后焦点移到原审批卡（dock，`tabindex=-1` 容器，**不**聚焦 Allow 按钮，避免误按 Enter 放行） | 用户指令遵守 C 的反提案；决策 22 |
| 16 | 任务消息 | **A + C**：assistant 泳道，accent 左边线 + accent 浅底；头部是主 bot 头像（xs）+ `From ‹主 bot›`（按钮 → `focus(mainId)`）+ `· Task`；正文逐字全文，纯文本 | 不能放在右侧用户气泡（C）；透明优先（A） |
| 17 | 不可信文本 | 名字、result、任务正文一律走 React 文本节点，不渲染 markdown、不生成链接（A E14） | 决策 17「数据非指令」 |
| 18 | 离线 | 沿用上游：sections 和行保留最后一份快照，不清空；`Open` 照常导航（C） | — |

## 2. 席 A 读码发现：6 处出入逐条处理

| # | 出入 | 核实结果 | 处置 |
|---|---|---|---|
| 1 | renderer-grok 里没有 `--dsw-*`，只有 `--sand-*` | **成立**：`grep -rE "\-\-dsw-" app/ui/renderer-grok` 结果为 0 | 新样式只用 `--sand-*`，不写 `--cursor-*` fallback；C 的 dsw 映射整段不采纳 |
| 2 | 排序以决策 21 为准 | **成立**：PLAN P6-15 行里的「**running** → running → unread → done」是 blocked 被误替换后的笔误，决策 21 写的是审批 / 提问 > 回合中 > 出错 / 已停止 > 新结果 > 空闲 | rank 0–4 见 §1 第 6 条；单测逐档断言 |
| 3 | shim 要主动发 `host-settings`，sections 才会重拉 | **成立**：ProductionRenderer.tsx:838 订阅、sidebar-sections-state.ts:205/281 只认 `fields` 里含 `sidebarSections` 的事件；否则只在 transport connected 时重拉（:2565） | 每次 roster 推送后，比较 sections 签名，变了才 `emit('host-settings',{fields:['sidebarSections']})` |
| 4 | 主 bot 行的未读只能来自 worker 汇总 | **成立**：data.ts:302 `finished && sid !== mainBotId` | 主 bot 记录叠加 `hasUnread`（任一 worker rank 2 或 3）和 `awaitingUserResponse`（任一 worker rank 0）；E7 单独证伪 |
| 5 | eventId 和 requestId 是否同源 | **不同源**：`approval/asked.id` 由 dsh-user-approval `index.js:156` 用 `randomUUID()` 生成；`$events` waterfall 的 `eventId` 由 dsh-api-gateway `index.js:~1098` 另外生成一个 `randomUUID()` | ask 项的活状态按以下顺序判：①item.eventId 是 shim 当前待决的 `$events` eventId → 待决；②item.eventId 在 worker 的 `view.asked` 里 → 对应 callId 的工具行仍是 `awaiting && decision===null` → 待决；③两者都对不上 → 退回「worker 现在是否 blocked」。P6-12 用哪一种 id，UI 都能处理（REPORT 写给 P6-12：建议用 `approval/asked.id`，SDK 侧可见） |
| 6 | p6-fold 回归断言可能要跟着改 | **不需要改**：notice 化只针对 `create_bot` / `send_to_bot` 这两个工具名，p6-fold 只用 bash / read；回报卡和任务卡只来自 `pbots-*` 来源，p6-fold 不产生；新增卡片用 `role="article"`，不是 `note`，不会混进 p6-fold 的 `notices()` 计数 | 跑 `pnpm test:e2e p6-fold` 全绿为证，断言一行不改 |

## 3. 我新增的读码发现

| # | 发现 | 证据 | 处置 |
|---|---|---|---|
| F10 | 侧栏里 agent 的顺序**不是** shim 给的 roster 顺序：`projectRendererAgents` 按 updatedAt 降序重排 | production/model.ts:181-187 | 席 A §1.3-3 的「roster 顺序即组内顺序」不成立 → sidebar 覆盖模块按 `pbotsUi.workerRank(id)` 给 pbots section 内的行重新排序 |
| F11 | 行菜单的 `Move to new section` 被 grok-dead-entries.spec:154 断言为存在 | spec 原文 | 只在有 pbots section 时剥掉 section 编辑回调；没有 worker 时 props 与现状完全一致（D11⑤） |
| F12 | 席 C 担心的「hover 卡 working 盖住 blocked」：上游已经处理 | preview-header.tsx:67 `isWorking = awaitingUserResponse == null && …` | 汇总写 `awaitingUserResponse` 即可，不另外处理 |
| F13 | main 的 M3 store 读盘时把 `bots` 剥掉了，shim 拿不到 createdBy | main/m3-meta/store.ts:66、:73 | 唯一一处 shim 之外的改动：store 读写透传可选 `bots`（CONTRACT v1.5 §3.1 原样，没有 worker 时不写这个键）。P6-10 是它的超集，届时三方对照 |
| F14 | 侧栏未读从不随「打开」清除（上游从不在打开时调 setAgentUnread） | ProductionRenderer.tsx:3110 是唯一调用点 | worker：chat-header 覆盖层上报当前 agent → shim 清除该 worker 的未读，回合在打开期间结束也不标未读（E7 需要）。普通 bot 不动（D11⑤），REPORT 列为待办 |
| F15 | 新 worker 由 main 建出，shim 无从得知 | data.ts 只在 socket open 和自己的 createBot 时拉 roster | `$events` 里出现未知 sid 的 `api-session/status` → 重拉 roster + meta（单飞）。Assignment 消息一到 worker 就开跑，这一跳必然发生 |

## 4. 改动面（全部在 overrides / shim / tests，外加 F13 的 store）

- `shim/src/workers.ts`（新）：纯函数，包括 rank、预览、主 bot 汇总、sections 推导、peer 元数据。
- `shim/src/data.ts`：createdBy、follow 全部 worker、sections 与签名、host-settings、未知 sid 重拉、active、peer 收集、`pbotsUi.{workerRank,peer,agentName,setActive,focus(attention)}`。
- `shim/src/desktop.ts`：`getSidebarSections` 接 data；`setSidebarSections` 返回推导值（fail closed）。
- `shim/src/entries.ts`：tool-call 的 create/send → notice + `pbotsPeer`；新增 fold kind `peer` → notice + `pbotsPeer`。
- `renderer/session/reduce.ts`：`pbots-worker` → `report` item，`pbots-main` → `task` item；其他非 user 来源照旧丢弃。
- `renderer/fold/turn-fold.ts`：report / task 与 user 同级切段，透传为 `peer` entry。
- `overrides/modules/sidebar.tsx`：section 改写（a 剥编辑回调、b 去空 pbots 组、c rail 去 worker、d done 取反、e 组内按 rank 排序）。
- `overrides/modules/notice-view.tsx`（新）+ `vite.config.ts` 一行映射。
- `overrides/modules/chat-header.tsx`：`setActive`。
- `overrides/p6-15.css`（新）：只用 `--sand-*`。
- `main/m3-meta/store.ts`：F13 透传。
- 测试：`tests/unit/grok-shim/workers.test.ts`、`tests/unit/session/*`、`tests/unit/fold/*` 新增用例；`tests/e2e/p6-workers.spec.ts`（新）；`tests/support/p6-peer-plugin.mjs`（新，测试专用：投递 `pbots-*` 来源消息，骨架取 P6-09 probe 的 deliver 分支）。

## 5. 测试取并集（A 的 E1–E21 ∪ C 的 ①–⑧）

| 断言 | 落点 | 说明 |
|---|---|---|
| E1 / C①：不进顶层，不重载即出现 | e2e | createdBy 预先落盘（照决策 31「先落盘后建会话」），测试中途建 session 并投 Assignment → shim 收到未知 sid 后重拉 → 出现在 Workers；全程不导航 |
| E2 / E11 / D11⑤：无 worker 时 sections=null | 单测 + e2e 全量 | 跑全量 e2e 即证 |
| E3 / C②：排序 + 5 态 DOM | e2e（4 态：blocked / running / unread / done）+ 单测（5 态全档） | failed / stopped 未读在 fake 下用 cancel 造 stopped |
| E4：blocked 行可读原因 | e2e | 不含 `local-tool-permission` |
| E5：Done 默认折叠、取反持久化 | e2e | 包括 reload |
| E6 / C③：主 bot blocked 汇总，Workers 收起后仍在 | e2e | — |
| E7 / C③：未读汇总，打开主 bot 不清，打开 worker 才清 | e2e | — |
| E8 / C④：点 worker → 同一 session，composer 发出的消息只进入它 | e2e | — |
| E9 / C①：rail 不泄漏 | e2e | — |
| E10：不可编辑 | e2e | worker 行菜单没有 Move…，Workers header 右键没有菜单 |
| E12：Messaging 行，含无名、failed 不可点 | 单测（entries）+ e2e（点击打开） | failed 形态只在单测覆盖（fake 下工具不存在） |
| E13 / C⑤：回报不是用户气泡、署名、可跳转 | e2e | — |
| E14：纯文本 | e2e | — |
| E15 / C⑤：合批 1 卡 n 项 | e2e（2 项）+ 单测 | — |
| E16 / C⑥：ask `Needs you` → `Answered`；主 bot 区域内 Allow 按钮数为 0；聚焦原卡 | e2e | 作答观测里只出现 worker 原 eventId |
| E17 / C④：任务卡在 worker 回答之前，不在用户泳道，From → 主 bot | e2e | — |
| E18：runtime-context 等其他来源仍隐藏 | 单测（reduce） | — |
| E19：peer 元数据缺失时回落为上游 notice | 单测 | — |
| E20 / C⑧：亮暗 token computed 值 | e2e + 截图 | — |
| E21：p6-fold 回归 | e2e | 不改断言 |
| C⑤：重放 / 重连同 key 不重复；回报后紧跟工具，上一回合 result 仍是气泡 | 单测（fold 决策 6 闭合格）+ e2e reload | — |
| C⑦：无名、超长名 | 单测 | 「创建结果未知」形态在单测覆盖 |
| C⑧：Tab / Enter 可达，reduced-motion | e2e（键盘打开 worker 与回报项） | — |

**落不了的（写进 REPORT）**：真实 create_bot / send_to_bot 工具链（P6-10 / P6-11 未合并，Messaging 行的 e2e 用测试插件注册的同名桩工具）；真实回报投递（P6-12 未合并，用测试插件按决策 27 / 28 的 wire 形状投递）。P6-17 用真链路复测。

## 6. 交 GU 的品味项

沿用 A §10 的 ③④⑥⑦⑧⑨。新增 ⑩：failed 行用文字前缀，不用红点（§1 第 8 条）；⑪：回报卡每一项带 worker 头像。
