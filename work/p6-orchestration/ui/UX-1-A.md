# UX-1 · 席 A（Opus 5.5）· P6-15 worker 分组 / P6-16 两侧 transcript 呈现

2026-11-04 · ux-proposer 席 A。只提案，不写产品代码。字段以 PLAN 决策 20–28 为准；`pbotsUi.*` 是覆盖层到 shim 的 UI 侧接口（README「window.pbotsUi：覆盖模块唯一的数据入口」），不涉及后端字段。

**一句话结论**：P6-15 用**合成 section**（第 2 级）。主 bot 单独放一个 section，紧跟着放 worker section 和 done section，这三个都由 shim 经 `getSidebarSections` 推导；sidebar 覆盖模块只过滤和改写 props，不 fork 上游；样式靠一层 CSS 缩进，模拟 d8e 的连线。P6-16 的三种新视觉（`Messaging ‹name›` 行、回报条目、「来自主 bot」任务消息）共用一个载体：shim 产出 `notice` raw entry，同时登记 `pbotsUi.peer(entryId)`；新增覆盖模块 `notice-view.tsx` 按 peer 元数据渲染，查不到元数据就回落到上游 notice。上游零改动。

---

## 0. 读码发现（会改变实现路径，先看）

| # | 发现 | 证据 | 影响 |
|---|---|---|---|
| F1 | renderer-grok 里**没有 `--dsw-*`**（`app/` 下 grep 0 命中），`--dsw-alias-*` 只存在于旧 dsh renderer 的文档里 | `grep -rE "\-\-dsw-" app` 空；`work/p5-parity/RE-visual-residual.md:34` | 本提案的 token 全部用 `--sand-*`（`overrides/p5-55-palette.css`，0.78.1 原值）。不编造 `--dsw` 映射 |
| F2 | 0.18 移植的 transcript **不显示作者**：`<span hidden id={ids.author}>`；`fromAgent/toAgent` 的 message 在 seam 里被判为 `unsupported/special-variant` | `transcript.tsx:773`；`message-card-seam.ts:121-123,159` | 「署 worker 名」必须加覆盖层渲染。办不到「只改 shim 就有名字」 |
| F3 | 工具行 `TranscriptToolCallRow` 只能展开 / 收起，DOM 上没有 entry id，覆盖层无法给它挂「打开 worker」 | `transcript.tsx:572-599` | `Messaging ‹name›` 行不能沿用 tool-call raw entry，改用 notice 载体（§3.1） |
| F4 | 侧栏 sections 只在 transport connected 时，或收到 `host-settings{fields:['sidebarSections']}` 事件时重拉 | `ProductionRenderer.tsx:2562-2569`；`sidebar-sections-state.ts:205,281` | shim 在 worker 成员或状态变化时要发 host-settings 事件，D11①「不重载即出现」才成立 |
| F5 | shim 的 `getSidebarSections` 现在返回 `null`，所以侧栏走扁平列表；行菜单上的「Move to section / new section」入口现在大概率是活的，但写入后无法持久 | `shim/src/desktop.ts:172-173`；`sidebar.tsx:449-453` | 合成 section 上线时，sidebar 覆盖模块必须一并剥掉 section 编辑回调（§1.3），否则用户能把普通 bot 拖进 worker 组 |
| F6 | 行状态机已经齐备：`projectSidebarAgentStatus` 的 blocked > unread、running 角标、`SidebarStatusDot` 有 `working / needs-attention / error / info / offline` 五态 | `sidebar-agent-status.ts` | worker 行和主 bot 汇总**全部用现成行组件**，不新画点 |
| F7 | 审批时 `awaitingUserResponse.reason` 现在是枚举 `'local-tool-permission'`，行上直接显示成「Waiting for you: local-tool-permission」 | `shim/src/agents.ts:61`；`sidebar.tsx:213-214` | worker 和主 bot 汇总改成可读原因（§2.2），用现成的 `askText`。是否顺带修普通 bot 由 frontend-dev 定（会碰 D11⑤，建议单列） |
| F8 | 状态顺序两处口径不一致：题干写 blocked → running → unread → done，决策 21 是「审批 / 提问 > 回合中 > 出错 / 已停止 > 有新结果 > 空闲」 | PLAN L35 | 本提案以决策 21 为准，把 error / stopped 放在 running 和 unread 之间（只在未读时单列，§2.1） |
| F9 | shim 从不把主 bot 标为未读（`finished && sid !== mainBotId`） | `shim/src/data.ts:287` | 主 bot 行的「未读」**只能来自 worker 汇总**，所以汇总规则必须能单独证伪（E7） |

---

## 1. 方案比较：合成 section vs 主 bot 行下嵌套折页

### 1.1 两种形态

**A. 合成 section（第 2 级）**：shim 按 createdBy 推导出 4 个 section，顺序为 `pbots:main:<mainId>`（只放主 bot，隐藏 header）→ `pbots:workers:<mainId>`（Workers）→ `pbots:done:<mainId>`（Done，默认折叠）→ `__agents__`（其余 bot，隐藏 header）。组里每一行都是上游的 `AgentSidebarItem`。

**B. 行下嵌套折页（第 4/5 级）**：照 0.78.1 的 d8e / qA（RE-sendmessage-ui §1.4：bot 行加 `data-agent-thread-toggle` chevron，下面嵌套 `qA` 行，再加 `data-agent-thread-lines` SVG 连线）自建，或在 RE 补齐可移植性后移植。

### 1.2 三维比较

| 维度 | A 合成 section | B 嵌套折页 |
|---|---|---|
| **对齐 0.78.1** | 结构层面**中等**：没有 bot 行上的 chevron，也没有 SVG 连线，用缩进加左侧 1px 竖线近似。**行级是高**：worker 行用的就是 0.18 原行组件（头像 persona、角标、`Needs attention` / `Unread activity` 标签、`Waiting for you:` 前缀），状态语义和原版 `sg` / `projectSidebarAgentStatus` 一致。排序 blocked → working → 未完 → 已完与原版 `jit` 一致（RE-sendmessage-ui §1.4）。另外，0.78.1 的 qA 嵌的是**同一 bot 的 task 线程**，我们的 worker 是**独立 bot / session**，用完整 agent 行在语义上反而更贴切 | 结构层面**最高，但没有被证实**：d8e / qA 在桩下没渲染出来（RO §8），规格只来自静态阅读；行级要么照 qA 自画（任务名 + 点，无头像），要么塞完整 agent 行（这就偏离了 qA） |
| **改动面** | ① shim：sections 推导、roster 组内排序、主 bot 记录汇总、发 host-settings 事件（`shim/src/data.ts`、`agents.ts`，估计 60–90 行）；② `overrides/modules/sidebar.tsx`：在已有的 wrapper 里改写 props，共 4 处（≈25 行）；③ 一份 CSS（≈20 行）。**上游 0 行**，`pnpm check` 的 upstream diff=0 不受影响 | ConversationSidebar 的 `renderAgent` 是模块内闭包，覆盖层没有插槽可以把子行插到某一行下面 → 只能把 509 行的 `sidebar.tsx` 整个复制成覆盖模块（第 3 级 fork），再自建折页、树形 ARIA（`role=tree/treeitem`、←/→ 展开）、拖放互斥、rail 模式、hover 预览叠层。另外必须先派 RE（PLAN 决策 20 要求） |
| **可回退性** | 一个开关：sections 推导返回 `null`，侧栏立刻回到今天的扁平列表（`sections == null` 分支，`sidebar.tsx:461`）。残留的折叠状态 id 不会被任何东西引用，无害 | 回退要撤掉 fork 的整份 sidebar 覆盖模块，期间合进来的上游修复也会一起丢；fork 会长期偏离 0.18 源 |
| 风险 | 4 个 section 里有 2 个要用 CSS 藏 header（是 hack，写 `ponytail:` 注释）；成员变化要发事件（F4） | 未复现的原版行为可能对不上；工作量大约是 A 的 5–10 倍 |

### 1.3 推荐：A（合成 section）

理由：PLAN 默认就是 A，读码后没有找到推翻它的理由，反而多了一条支持：worker 是独立 bot，用完整 agent 行比 qA 线程行更对。选 B 的唯一收益是「bot 行上有 chevron 和连线」，这是像素级对齐，不值得为它 fork 整个 sidebar。

A 的完整清单（frontend-dev 照做）：

1. **shim 产出 sections**（`getSidebarSections`）。按 createdBy 分组，每个创建者一组（通常只有当前主 bot；换了主 bot 以后，旧 worker 仍然挂在原创建者下面）：
   - `{id:'pbots:main:<cid>', name:'', agentIds:[cid]}`
   - `{id:'pbots:workers:<cid>', name:'Workers', agentIds:[活跃 worker…]}`
   - `{id:'pbots:done:<cid>', name:'Done', agentIds:[已完成 worker…]}`
   - 最后一个是 `{id:'__agents__', name:'Unassigned', agentIds:[]}`（synthetic，自动收纳其余 bot）
   - 没有任何 worker 时返回 `null`，也就是今天的样子，保证非 worker 用户的行为字节不变（D11⑤）。
2. **成员或状态迁移时**，shim 的 coordinator 发 `host-settings {fields:['sidebarSections']}`（F4）。合并抖动：同一 tick 内只发一次。
3. **roster 顺序**：worker 在 `order` 里按 §2.1 的 rank 排好。`projectSidebarSections` 保留 roster 顺序（不排序，`sidebar-section-projection.ts:30`），所以 section 内的顺序就是 shim 给的顺序。
4. **`overrides/modules/sidebar.tsx` 改写 props**（都在现有 wrapper 里完成）：
   - a. 剥掉 `onRenameSection / onStartRenameSection / onRequestDeleteSection / onMoveSection / onMoveAgentToSection / onMoveAgentToNewSection / onMoveSelected*`（今天 sections 就不可用，剥掉不损失功能，同时堵住 F5）；
   - b. 去掉 `agents.length===0` 的 `pbots:*` section（主 bot 被 pin 之后 main section 为空，否则会出现「Drag chats here」）；
   - c. `sidebarLayout.isCollapsed`（rail 模式）下去掉 `pbots:workers/done`，worker 不进 rail 顶层；
   - d. **done 折叠取反**：`pbots:done:*` 的 `isCollapsed = !stored`，`onToggleSectionCollapsed` 也同步取反。存储里「已折叠」的语义变成「用户展开过」，于是默认折叠，用户的选择照样持久化。写 `ponytail:` 注释：用取反凑出「默认折叠」，上游 collapse store 没有默认值参数。
5. **CSS**（新文件，或追加到 `overrides/p5-57.css`）：
   - `.sand-agents-section:is([data-section-id^="pbots:main:"],[data-section-id="__agents__"]) > .sand-agents-section__header{display:none!important}`
   - workers / done section 加 `margin-inline-start:14px; padding-inline-start:6px; border-inline-start:1px solid var(--sand-border-tertiary-translucent)`，模拟 d8e 的连线。
6. **用户把某个 worker pin 住 = 「提升到侧栏」**（S5 M4，同一 session），这一项不用写代码。pin 之后它出现在顶部的 Pinned 组；主 bot 的汇总**仍然计入它**。

---

## 2. P6-15：worker 行、主 bot 汇总、排序、跳转

### 2.1 worker 状态推导（照 `sg()` / `oMn`，RX §1.3、RO §4）

| rank | 状态 | 条件（shim 已有数据） | 所在 section | 行表现（全部由上游行组件完成） | 预览行文案 |
|---|---|---|---|---|---|
| 0 | **blocked** | worker 有未决审批或提问（`awaitingApproval`） | Workers | 尾部 `needs-attention` 点，aria `Needs attention`；头像 persona idle | `Waiting for you: ‹可读原因›`（上游前缀；原因见 §2.2） |
| 1 | **running** | `view.running` | Workers | 头像角标 working（`corner:'running'`）；预览走 `SidebarAgentActivity` | 当前活动，例如 `Running pnpm test`（从 activity 推导，没有就用 `Working`） |
| 2 | **failed / stopped（未读）** | 最近一个 Assignment 回合的终止原因 ∈ error / aborted / interrupted / cancelled，且 worker 未读 | Workers | 尾部 `error` 点（`SidebarStatusDot status="error"`，五态里现成的一态） | `Failed: ‹首行›` / `Stopped` |
| 3 | **unread** | 回合 completed，未读（`data.ts:287` 的 unread 集合） | Workers | 尾部 `info` 点，aria `Unread activity` | result 首行，按 s4 规则截断（首个换行前、≤80 字，RO §1） |
| 4 | **done** | 以上都不满足（包括已读的 failed / stopped、从未运行过的空闲 worker） | Done（默认折叠） | 无点 | 最后一条结果首行；failed / stopped 保留 `Failed:` / `Stopped` 前缀 |

- 组内次序：先按 rank，再按 `updatedAt` 降序（与原版 `unreadAtMs ?? updatedAtMs` 同向）。
- **不做** 0.78.1 的 `activeCap:5` 和静默阈值（YAGNI；worker 上限由容量控制，通常少于 5 个）。
- 状态迁移会让行在 Workers 和 Done 之间移动，属于成员变化，触发 F4 的事件。行用 key 保持身份，不加动画（GU 决定）。

### 2.2 主 bot 行汇总（决策 21）

主 bot 本身就是一行普通 agent 行。shim 在它的 roster 记录上**叠加** worker 汇总：

| 汇总 | 写到主 bot 记录的字段 | 用户看到的 |
|---|---|---|
| 任一 worker blocked | `awaitingUserResponse = {reason}`；1 个 worker 时 reason = `‹worker 名›: ‹askText›`，例如 `Test fixer: Allow git push origin?`，多个时为 `‹n› workers need you` | 尾部 `needs-attention` 点 + `Waiting for you: Test fixer: Allow git push origin?`。按上游规则会压掉主 bot 自己的 running 角标（blocked > running，符合决策 21 的优先级） |
| 任一 worker 处于 rank 2 / 3（未读） | `hasUnread = true` | 尾部 `info` 点 |
| 都没有 | 不叠加 | 主 bot 原样 |

- **清除规则（可证伪）**：主 bot 行的汇总只随 worker 状态变化：打开对应 worker → worker 已读 → 汇总消失。**打开主 bot 本身不会清除汇总**，因为 F9 下主 bot 自己没有未读，只读主 bot transcript 不等于看过 worker 的产物。这条会显得「执拗」，所以列为 GU 品味项 ⑦；如果 GU 否决，退路是「汇总只计还没投递回报的 worker」。
- 分组折叠时，主 bot 行不在被折叠的 section 里（它在 `pbots:main`），所以信号不会丢（决策 21 末句）。
- 被用户 Hide 或 pin 的 worker 照样计入汇总。

### 2.3 点击与跳转

| 入口 | 动作 | 落点 |
|---|---|---|
| Workers / Done 里的 worker 行 | 上游 `onOpen` → `openAgent(workerId)` | 主内容区是该 worker 的实时 transcript，composer 可用（D11④） |
| 主 bot 行（带 blocked 汇总） | 打开主 bot。主 bot 已经按 D8 发过点名消息，下面还有回报条目里的 ask 项（§3.2），从那里一键过去 | 主 bot transcript，ask 项高亮成 warn 底色 |
| 主 bot transcript 里的 `Messaging ‹name›` 行 | `pbotsUi.focus(workerId)` | 该 worker |
| 回报条目里的某一项 | `pbotsUi.focus(workerId)` | 该 worker |
| OS 通知（P6-18） | 聚焦主窗口 + 打开 worker | 该 worker |
| worker transcript 里「From ‹Main›」的发送者名 | `pbotsUi.focus(mainId)` | 主 bot（只回到主 bot；PLAN 里没有 assignmentId → 主 bot 工具行 id 的映射，**不做定位到原 Messaging 行**） |

**跳回原审批卡**：审批卡是 worker transcript 的 dock 卡（`pendingLocalToolPermission`，P5-31 覆盖）。打开 worker 的那一刻它就渲染在 composer 上方，**不需要滚动和高亮**。所以上面所有入口都收敛到同一个动作 `focus(workerId)`，用户在原卡上作答（同一个 eventId，决策 22）。主 bot 一侧**永远不渲染审批按钮**。

---

## 3. P6-16：两侧 transcript 呈现

### 3.0 载体（共用）

- reduce 为 `pbots-main` / `pbots-worker` 各产出一种 item（决策 25，名字以 P6-16 实现为准）。create_bot / send_to_bot 的工具 item 保持不变，仍然参与 fold。
- `entries.ts` 把这三类映射成 raw `{kind:'notice', id, timestampMs, content:<回落文本>}`，同时登记 `pbotsUi.peer(id)`：
  - 任务消息 → `{kind:'task', fromId, fromName, text}`
  - 工具行 → `{kind:'assign', workerId|null, name|null, status, preview}`
  - 回报 → `{kind:'report', items:[{workerId, name, kind:'end'|'ask', outcome?, awaiting?, eventId?, result?}]}`，即决策 28 的项结构原样转交。
- 新增覆盖模块 `overrides/modules/notice-view.tsx`，在 `MODULE_OVERRIDES` 加一行映射 `recovered/features/conversation/cards/notice/view.tsx`。`peer(id)` 有值时按 kind 渲染下面三种视觉，否则原样转给上游 `TranscriptNoticeCard`。**回落文本保证覆盖层失效时仍然可读**，例如 `Messaging Test fixer`、`From Main Bot: …`、`Test fixer · Done: …`。
- 安全：worker 名和 result 都是**不可信数据**。只用纯文本渲染（React 文本节点），**不走 markdown，不生成链接**（参照 `isSourceTrusted` 的语义）。完整内容在 worker transcript 里，主 bot 随后还会转述一遍，所以条目只放预览。

### 3.1 主 bot 侧：`Messaging ‹name›` 行（决策 24）

和普通工具行**同形**（复用 `.sand-outline-item` / `__row` / `__icon` / `__label` / `__preview` 这几个 class，视觉零差异），区别只有两点：整行是「打开」按钮，尾部是 `›`，不是展开 chevron。

```
  [◐] Messaging Test fixer   Run the test suite in ~/proj and fix…   ›     ← 可点：focus(worker)
  [◎] Messaging Test fixer   Run the test suite in ~/proj and fix…         ← pending，workerId 未知：不可点，图标旋转
  [✕] Couldn't message Test fixer   Test fixer is busy                    ← failed，不可点，图标红
  [◐] Messaging another assistant   …                                  ›   ← name 为空（决策 24）
```

- 图标：0.78.1 lO 表用的是 `person-chat-bubble`。0.18 的图标字形表里如果找不到这个码位，就退回 `wrench`，不自画 SVG。
- 预览：取工具实参里 prompt / message 的首行（s4 规则）。
- failed 文案：`pbots/busy` → `‹name› is busy`；`pbots/forbidden` → `Not allowed`；`main-unavailable`（超时，决策 30）→ `Timed out — check Workers`。
- 元素：`<button data-pbots-peer="assign" data-worker-id=… aria-label="Open ‹name›">`。

### 3.2 主 bot 侧：回报条目（D5 UI 部分、决策 24）

走 assistant 泳道（左侧，与 assistant 气泡同列同宽），但用的是**卡片**：1px 边框加 elevated 底，**不是**气泡填充。卡片表示「这是一条记录 / 数据」，不是主 bot 在说话；主 bot 自己的转述紧随其后，用正常气泡。fold 把它当作切段边界（决策 25）。

单项（items = 1）：

```
 ┌────────────────────────────────────────────────────────┐
 │ ● Test fixer · Done                          2:14 PM  │  ← 头：6px 状态点 + 名(13 medium) + · + 状态词(13，按 tone 着色) + 时间(12 tertiary)
 │ 18 passed. Fixed 2 failures in tests/api.spec.ts and  │  ← result 纯文本，13/1.5 secondary，line-clamp 3
 │ tests/db.spec.ts; skipped flaky e2e (see notes)…      │
 │                                         Open worker ›  │  ← ghost 按钮 13 medium accent
 └────────────────────────────────────────────────────────┘
   主 bot：测试修复跑完了：18 个通过，修了 2 个……         ← 主 bot 正常气泡（转述）
```

合批（items > 1）：

```
 ┌ 2 worker updates ──────────────────────────────────────┐  ← 头 12 medium tertiary
 │ ● Test fixer   Done        18 passed. Fixed 2 fail…  ›  │  ← 每项一行按钮，h 32，预览单行省略
 │ ! Doc writer   Needs you   Allow git push origin?    ›  │  ← ask 项：warn 底；仍待决时状态词为 Needs you
 └─────────────────────────────────────────────────────────┘
```

| 项 | 状态点 / 图标 | 状态词（0.78.1 i18n 能对上的照用） | tone |
|---|---|---|---|
| end · completed | 6px 实心点 | `Done`（`0QMTco`） | success |
| end · error | `x-circle` | `Failed` | danger |
| end · stopped | 6px 空心环 | `Stopped` | muted |
| ask · approval / question，worker 当前仍等**同一个** eventId | `exclamation-circle` | `Needs you`；预览为 askText 或问题首行 | warn，整行 warn 底 |
| ask，已作答或已失效 | 6px 空心环 | `Answered` | muted，去掉 warn 底 |

- 「仍待决」是**活状态**：比较 item.eventId 和 worker 当前待决 ask 的 requestId。**需要 frontend-dev 核实 eventId 和 requestId 是否同源**；不同源就退回用「worker 现在是否 blocked」判断。
- 整行或整卡点击 → `focus(workerId)`。
- 元素：`<section data-pbots-peer="report" aria-label="Worker update">`；每项 `<button data-pbots-item-kind="end|ask" data-worker-id=… aria-label="Open ‹name›, ‹状态词›">`；名字放在 `[data-pbots-worker-name]`。

### 3.3 worker 侧：「来自主 bot」任务消息（D7 UI 部分）

这是 inbound fromAgent，按 0.78.1 走**左侧 assistant 泳道**（RE-sendmessage-ui §1.5 `zR`：fromAgent message → assistant），所以**绝不放右侧用户气泡**，否则用户会以为是自己说的。和回报卡相比，它带 accent 左边线和 accent 浅底，表示「这是这个 worker 收到的指令」。

```
 ┃ ↳ From Main Bot · Task                        2:10 PM
 ┃ Run the test suite in ~/proj and fix the failures.
 ┃ Route note: user wants green CI before 5pm.
 ┃ （全文逐字，含包装句；不截断）
   Worker：好的，先跑一遍……                               ← worker 的回答在它之后
```

- 头部：`↳`（`arrow-turn-down-right`，没有就省略图标）+ `From ‹主 bot 名›`（是按钮，可点 → `focus(mainId)`）+ ` · Task` + 时间。
- 正文**逐字全文**：用户需要看到 worker 到底被吩咐了什么，这是排查路由（P6-20）的唯一窗口。包装句是 model-facing 文本，但比较短，透明优先，不另拆字段。
- 元素：`<article data-pbots-peer="task" aria-label="Task from ‹主 bot 名›">`。
- 同一个 worker 的第二次 send_to_bot 会再出现一张卡，所以每个 Assignment 一张卡，天然成为该 worker transcript 的分段锚点。

### 3.4 token（全部是 `--sand-*`，取值来自 `overrides/p5-55-palette.css` 亮 / 暗）

| 元素 · 属性 | token | 亮 | 暗 |
|---|---|---|---|
| 回报卡 背景 | `--sand-bg-elevated` | `#ffffff` | `#1f1f1f` |
| 回报卡 边框 1px | `--sand-border-tertiary-translucent` | `#1c1c1c14` | `#f5f5f50f` |
| 回报项 hover | `--sand-bg-secondary-hover` | `#1c1c1c1a` | `#f5f5f514` |
| 名字 | `--sand-text-primary` | `#1c1c1c` | `#f5f5f5` |
| result 预览 / 任务正文 | `--sand-text-secondary` | `#1c1c1cad` | `#f5f5f5a8` |
| 时间、合批头、muted 状态词 | `--sand-text-tertiary` | `#1c1c1c8f` | `#f5f5f58a` |
| Done 点 / 状态词 | `--sand-text-success-primary` | `#00854a` | `#00ba69` |
| Failed 图标 / 状态词 | `--sand-text-danger-primary` | `#cd2834` | `#ff6463` |
| Needs you 图标 / 状态词 | `--sand-text-warn-primary` | `#aa6300` | `#e28600` |
| ask 项底 | `--sand-bg-warn-secondary` | `#f5931217` | `#f6941212` |
| Stopped / Answered 空心环 | `--sand-text-quaternary` | `#1c1c1c66` | `#f5f5f561` |
| Open worker 按钮文字 | `--sand-text-accent-primary` | `#0b6dd3` | `#4d9bff` |
| 任务卡 左边线 2px | `--sand-border-accent-primary` | `#1680f3` | `#116dd2` |
| 任务卡 底 | `--sand-bg-accent-secondary` | `#1e86fc17` | `#1884fc12` |
| `From ‹Main›` 链接 | `--sand-text-accent-primary` | `#0b6dd3` | `#4d9bff` |
| 侧栏 worker 组 竖线 | `--sand-border-tertiary-translucent` | `#1c1c1c14` | `#f5f5f50f` |
| Messaging 行 | 沿用工具行现有 class，不新增 token | — | — |

尺寸：卡片圆角 12、内边距 10/12；项行高 32、圆角 8（与 outline 行同族，RO §2）；字号 13 / 12；状态点 6×6（与 RO §2 tab 状态点同规格）。卡片最大宽度沿用 assistant 气泡列宽。`prefers-reduced-motion` 下取消 pending 旋转之外的所有过渡。

---

## 4. 核心旅程（J1 / J3）与最容易卡住的一步

1. 用户对主 bot 说「把测试跑一遍，失败的修掉」。
2. 主 bot ack，transcript 出现 `Messaging Test fixer ›`；侧栏主 bot 下方出现 Workers 组，`Test fixer` 带 running 角标。
3. 用户继续和主 bot 聊别的。
4. worker 卡在 `git push` 审批。主 bot 行出现 needs-attention 点和 `Waiting for you: Test fixer: Allow git push origin?`，主 transcript 出现 ask 项，OS 通知弹出。
5. **最容易卡住的一步**：用户以为要在主 bot 里批准，于是对主 bot 回复「同意」。**解法**：主 bot 侧完全不渲染审批按钮，ask 项的唯一动作是 `Open worker ›`，状态词写 `Needs you`；三个入口（行、ask 项、通知）落到同一个 dock 卡上。主 bot 的点名消息文案（P6-12）也应该写「去 Test fixer 里批准」，这一点交给 P6-12，本席只提出要求。
6. 用户批准后 worker 完成。主 transcript 出现 `Test fixer · Done` 回报卡，主 bot 接着转述；worker 行变成 unread，主 bot 行变成 info 点。
7. 用户点开 worker 看全文，worker 行移进 Done（折叠），主 bot 行的点消失。

## 5. 信息层级（每屏最重要的一件事）

| 屏 | 第一 | 次要 | 放哪 |
|---|---|---|---|
| 侧栏 | **谁在等我**（needs-attention 点挂在主 bot 行，收起分组也看得到） | 谁在跑；谁有新结果 | worker 行的角标、尾点；Done 折叠 |
| 主 bot transcript | **主 bot 的转述**（正常气泡） | 回报卡（证据和入口）、Messaging 行（派活记录） | 回报卡紧挨在转述之前；Messaging 行和工具行同等弱化 |
| worker transcript | **它被吩咐了什么**和它的回答 | 来源（From Main） | 任务卡在最前 |

## 6. 状态全集

| 状态 | 侧栏 | 主 bot transcript | worker transcript |
|---|---|---|---|
| 加载（roster / sections 没到） | 上游 `listStatus`，不出现分组 | — | 上游 |
| 空（没有 worker） | sections = `null`，与今天一致 | 没有新条目 | — |
| 错误（create 失败或超时） | 不出现新行（超时但 main 已建出 bot 时 → 出现空闲 worker，进 Done） | Messaging 行 failed 态（§3.1） | — |
| 离线（transport down） | 上游 offline 行为；sections 在重连后重拉 | 回报卡照常显示历史；`Open worker` 照常导航（只读与否由上游决定） | 上游 |
| 长任务进行中 | running 角标 + 活动预览 | Messaging 行静止（不反映 worker 进度，避免两处状态） | 上游工具行、流式 |
| 需要审批 | worker 行 needs-attention；主 bot 行汇总 | ask 项 warn 底 + `Needs you` | dock 审批卡 |
| 出错 / 已停止 | 未读时 error 点在 Workers；读后进 Done，保留 `Failed:` / `Stopped` 预览 | `Failed` / `Stopped` 项 | 上游 notice（`回复失败：…` / `已停止`） |

## 7. 反提案：不要在主 bot transcript 里放「活的 worker 状态卡」

大家默认会做的：0.18 树里有现成的 `cloud-agent` 卡（`transcript-card/views/cloud-agent.tsx`：标题、Running/Done 徽章、prompt、Open 按钮），看起来正好拿来给每次派活放一张实时 worker 卡。**不要这么做**：

- 状态会出现在两处（侧栏和卡片），而卡片在历史里会一直刷新，用户回看三天前的对话，看到的却是现在的状态，历史因此失真。
- 卡片要么也放审批按钮（同一个 eventId 出现两个作答面，违反决策 22），要么不放（那它比侧栏行信息更少）。
- 那张卡带着 Cursor 品牌和 `bcId` 语义；PLAN 决策 24 已经把「内联线程卡」列为不做。

所以 transcript 里只放**事件**（派了活、回了报），**状态**只放在侧栏。唯一的例外是 ask 项的 `Needs you` / `Answered`：它描述的是这条事件本身是否已经处理，不是 worker 的整体状态。

（附带的第二个反提案：不要另开一个全局的「Workers」页或 Tasks 页，决策 20 已经排除，因为它和分组是指向同一组对象的第二个入口。）

## 8. 可复用组件与参考

| 用途 | 出处 | 许可证 / 阶梯 |
|---|---|---|
| worker 行、状态点、角标、`Waiting for you:` | `frontend/src/recovered/.../workspace/sidebar.tsx`、`sidebar-agent-status.ts`（0.18 移植树） | 第 3 级已搬（README：私用，无独立 LICENSE） |
| section 投影、折叠持久化 | `sidebar-section-projection.ts`、`sidebar-collapse-state.ts`、`sidebar-sections-state.ts` | 同上；第 2 级复用，不改 |
| Messaging 行外观 | `transcript.tsx` 的 `.sand-outline-item*` class | 同上 |
| askText（可读审批原因） | `shim/src/entries.ts:askText` | 本仓 |
| 覆盖模块机制 | `overrides/vite.config.ts` `MODULE_OVERRIDES` | 本仓 |
| 语义参照（不搬码） | 0.78.1 `sg` / `oMn` / `jit` / d8e / qA（RX §1.3、RE-sendmessage-ui §1.4）；OpenCoworkAI `SubagentProgress.tsx`（MIT，S5 §5：只借「失败收起态仍可读原因」） | 第 4 级证据 / 第 3 级备选 |

---

## 9. 可证伪验收要点（可直接写成 e2e 断言，`app/ui/tests/e2e/p6-workers.spec.ts`）

记号：`S(id)` = `.sand-agents-section[data-section-id="<id>"]`，`row(name)` = `.sand-agent-item[aria-label="<name>"]`，M = 主 bot id。用 fake provider；先 `pnpm build`。

**P6-15**

- **E1 不进顶层**：create_bot（W1）后 5s 内，`S('pbots:workers:M') row('W1')` 计数为 1，`S('__agents__') row('W1')` 计数为 0；`S('pbots:main:M') row(Main)` 计数为 1。过程中不 reload（断言 `performance.navigation` 或 page 对象没有重新导航）。
- **E2 无 worker 时字节不变**：不加载编排时，`.sand-agents-section` 计数为 0（走 `sections==null` 分支），visual-sidebar 基线不变。
- **E3 排序**：构造 5 个 worker 分别处于 blocked / running / failed 未读 / unread / done。`S('pbots:workers:M') .sand-agent-item` 的 aria-label 顺序 === [blocked, running, failed, unread]；done 那个只在 `S('pbots:done:M')` 里。
- **E4 五态 DOM**：blocked 行 `.sand-agent-item__trailing[aria-label="Needs attention"]` 存在，且预览以 `Waiting for you:` 开头、**不含** `local-tool-permission`；running 行 `.sand-agent-item__corner-dot` 存在或 `.sand-agent-item__activity` 存在；failed 行 `[data-status="error"]` 存在；unread 行 `.sand-agent-item__trailing[aria-label="Unread activity"]` 存在；done 行没有 trailing marker。
- **E5 Done 默认折叠**：首次出现时 `S('pbots:done:M') .sand-agents-section__header` 的 `aria-expanded="false"`，且 header 文本包含 done 数；点击后变为 `"true"`；reload 后保持 `"true"`（取反持久化）。
- **E6 blocked 汇总不随折叠丢失**：W1 blocked → `S('pbots:main:M') row(Main) .sand-agent-item__trailing[aria-label="Needs attention"]` 存在，且主 bot 预览包含 `W1`；点击 Workers header（aria-expanded→false）后上面断言仍然成立；W1 作答后断言消失。
- **E7 未读汇总与清除**：W1 completed 且未打开 → 主 bot 行出现 `[aria-label="Unread activity"]`；打开主 bot → 仍然存在；打开 W1 → 主 bot 行和 W1 行的 unread 都消失，且 W1 进入 `S('pbots:done:M')`。
- **E8 点开即同一 session**：点 `row('W1')` → `.sand-chat-header` 名为 W1；composer 可输入，发送后 W1 transcript 出现该条用户消息（D11④）。
- **E9 rail 模式**：折叠侧栏后，`row('W1')` 计数为 0，`row(Main)` 计数为 1。
- **E10 不可编辑**：worker 行右键菜单没有「Move to section」「New section」；Workers header 右键没有 Rename / Delete。
- **E11 回退开关**：sections 推导返回 null（单测注入）→ 侧栏 DOM 与 E2 相同。

**P6-16**

- **E12 Messaging 行**：主 bot transcript 中 `[data-pbots-peer="assign"]` 文本 === `Messaging W1`；name 为空的实参 → `Messaging another assistant`；点击 → `.sand-chat-header` 名为 W1。create 失败的用例 → 文本以 `Couldn't message` 开头，且元素带 `disabled` 或没有可点击的 button。
- **E13 回报不是用户气泡**：W1 完成 → `[data-pbots-peer="report"]` 计数为 1，且 `closest('[data-role="user"]') === null`；`[data-pbots-worker-name]` 文本 === `W1`；状态词 === `Done`；点击项 → 打开 W1。
- **E14 纯文本**：result 内容为 `[x](https://evil) **b**` → 回报卡内 `a` 计数为 0，`strong` 计数为 0，文本原样出现。
- **E15 合批**：3 个 worker 在主 bot 回合中结束 → 回合结束后 `[data-pbots-peer="report"]` 只新增 1 个，其中 `[data-pbots-item-kind]` 计数为 3；主 bot 在它之后恰有 1 个 assistant 气泡（与 P6-12① 对表）。
- **E16 ask 活状态**：W1 blocked → 回报项 `[data-pbots-item-kind="ask"]` 文本含 `Needs you`；在 W1 作答后回到主 bot → 同一项文本含 `Answered`，且没有 warn 底（computed background ≠ `--sand-bg-warn-secondary` 的值）。主 bot transcript 内 `button:has-text("Allow")` 计数为 0。
- **E17 任务消息位置**：从分组打开 W1 → `[data-pbots-peer="task"]` 存在，包含 `From ‹Main 名›`，在 DOM 顺序上先于 W1 第一个 `.sand-message[data-role="assistant"]`；它不在 `[data-role="user"]` 里；点击 `From ‹Main›` → 打开主 bot。
- **E18 其他来源仍隐藏**：reduce 单测里 `runtime-context` 来源的 `user/message` → items 不变（D7 ④）。
- **E19 回落**：`pbotsUi.peer` 返回 null（单测）→ notice 按上游 `.sand-notice` 渲染，文本 === 回落文本。
- **E20 亮 / 暗 token**：两套主题下，回报卡的 `border-color`、`background-color` 和任务卡的 `border-inline-start-color` 分别等于对应 `--sand-*` 的 computed 值（§3.4），截图交 GU。
- **E21 回归**：`pnpm build && pnpm test:e2e p6-fold` 通过（Messaging 行改走 notice 载体后，p6-fold 若按 tool 行计数，需要同步更新断言并在报告中写明）。

---

## 10. 交 GU 的品味项（各 1 行，本席默认值）

- ③ done 折成 section `Done N`，默认折叠（**是**）。
- ④ Workers 默认**始终展开**，不因 blocked / running 自动展开（自动展开会和用户的折叠选择打架；信号已经由主 bot 行承担）。
- ⑥ 合成 section（**是**）。
- ⑦（新增）打开主 bot 不清除 worker 汇总（**是**，见 §2.2）。
- ⑧（新增）worker 行在 section 里沿用 md 头像，不缩小（**是**）；连线只用 1px 竖线，不画 SVG 弯钩。
- ⑨（新增）界面文案用英文，对齐 0.78.1 i18n（`Done` / `Needs attention` / `Waiting for you` / `New reply`），沿用现有 notice 的中文（`已停止` / `回复失败`）不改。
