# RE-outline-tasks · R-05：outline 面板 + tasks/workspace + subagents 展示面（0.78.1）

2026-11-03/04 · reverse-engineer（REA 波次 1，RE-COVERAGE §3 R-05）。目标 `/dev/shm/grok-re/0.78.1/app/dist/`（易失，丢失按 RE-unpack §0 重建）。
方法：bundle 静态（grep + 逐段反混淆）+ grok-r3 桩 CDP 实证（参照图 8 张）。锚点 `文件@字节偏移`；`APP`=`renderer/assets/index.eager-app-iGTgHP_Q.js`，`COORD`=`node-agent-coordinator/main.cjs`，`PROTO`=`electron-main/proto.cjs`，`WSP`=`renderer/assets/chunk-view-DICrypK2.js`，`TCARD`=`renderer/assets/chunk-view-7PKdecmC.js`。凭证未读，产品树未动。

## 0. 结论（先行）

1. **getConversationOutline**：coordinator `transcript` 域方法，`args:{id}`（id = agentId **或 subagentId**，面板按 tab 逐 subject 拉取），reply 只校验 `Array.isArray`（U3n@APP@4399315 `array` 项）；节点字段全靠渲染端消费集定义（§1）。**新发现：它有事件通道 `conversation-outline`**（snapshot/appended/updated 三型增量），且 outline 面板对 **运行中 subagent 的 tab 以 2s 轮询**。
2. **侧栏右键 DEV 菜单挂的是两个浮层面板**：`Full conversation`（outline，RE-v3-toolrow 已证）+ **`Async tasks`（本波新发现的面板，Lst@APP@1600590）**，二者同壳（fixed 360px 右上浮层、可拖 header、Esc 关闭），数据源分别是 `getConversationOutline` / `getAsyncTasks`。这两个面板在 0.78.1 里都是 DEV-only 菜单项（菜单段 `r?` 门控）。
3. **tasks/workspace（WSP 16.3K）是独立页面入口**：侧栏头 Tasks 图标钮（badge = review+attention 行数，实测 "Tasks, 1 needs you"），双 Statsig gate `sand_tasks` + `sand_tasks_page`；**行源只取 `harness==='temporal'`（云）agent 的任务**——本地 bot 的任务不进这个页面（pMn@APP@3590530 附近）。分组 **For review → Needs attention → In progress → Done**（review=未读，attention=awaiting，progress=其余未完，done=已完成且无未读），非 done 组按组序+最近活动排，Done 组恒最后且**默认折叠**；排序切换 Status/Bot；行操作 Mark as finished / Archive / 打开线程。
4. **subagents 的展示面共 5 处**（P6-16「coworker 式展示」的原版证据全集）：①outline 面板的 **per-subagent tab**（`{subagentType}: {title}`，运行中带脉冲点 + 2s 轮询，每 tab 独立 outline）；②**async tasks 面板**的行（kind=subagent → agent 图标 + "Background task"）；③workspace 页 In progress 行的工作文案（currentActivity 优先，否则 running subagent 的 title）；④侧栏 bot 行/任务线程行的 working/unread/blocked 态（RE-sendmessage-ui §1.4 已档，本波补 `sg` 精确语义）；⑤transcript 的 **task-changed 事件卡**（E5，TCARD 全解，复用 thread-card 壳，working spinner/blocked/unread 三态 + 打开线程跳转）。
5. 客户端 subagent 记录 = proto `GrokBotRunningSubagent` + 客户端补的 `status`；**新鲜度自刷新**：取 running 记录里最早的 `freshUntilMs` 定时 refresh（无则 10s 兜底）。云端另有 `ListGrokBotSubagents(agent_id)` RPC（PROTO@998957）。

## 1. getConversationOutline：请求 / reply / 事件 / store

| 锚点 | 内容 |
|---|---|
| APP@258250 方法表 | `getConversationOutline:{args:'object',reply:'array'}`（transcript 域，D1）；唤醒类别 `person`（COORD@931865 表） |
| COORD@991336 参数表 | `getConversationOutline` args 同 `getSubagents/getAsyncTasks` = `Ft` = `{id:string}`；`getAgentTasks` = `{agentId:string}`（COORD@991200） |
| COORD@1005300 | 实现委托 `He.getConversationOutline`（host 桥）——**outline 由沙箱 host 计算，coordinator 只转发** |
| APP@4399315 | reply 校验 `array: e=>Array.isArray(e)?e:A9`（A9=corrupt）——item 结构不在校验表内 |
| APP@4295955（store `q1n`） | per-agent 快照：`snapshots`(loading/empty/ready/failed/unavailable + `previous`)，`retain(agentId,{pollIntervalMs?})`、`refresh`、`ingest`、`noteReconnect`；失败码 `conversation-outline/read-failed`（boundary client，retry command `conversation-outline.refresh`），poll 名 `conversation-outline-poll`（APP@4293800 区 `z1n/B1n`） |
| APP@4293800 区 | 事件归并 `H1n`：`snapshot`→整体替换；`appended`→按 id 替换或追加；`updated`→按 id 替换。即 **`conversation-outline` 事件 payload ≈ `{agentId, type:'snapshot'\|'appended'\|'updated', items?\|item?}`** |
| APP@4361074 | 事件接线：`outline: e=>Pe.ingest(e)`；同表 `subagents→rt.ingestSubagentsEvent`、`async-tasks→it.ingestAsyncTasksEvent`、`agents-tasks→at.noteTasksChanged(agentId)` |
| APP@435700 区 `Mye` | 消费 hook：`snapshotsFor(subjectId)` + retry 标签 i18n `vCqW2l`("Couldn't load conversation")；refresh 前把 subjectId 经 `ui()` 解析回 agentId |
| COORD@1118980 | server turn 结束后的族刷新：`subagents` 族 → 重新 `getSubagents` + `emitSubagents({parentAgentId, subagents})` |

**outline 节点类型全集**（`zfn` 标签 / `Bfn` 图标 / `Hfn` 预览 / `Ufn` detail，APP@3114966–3116660）：

| kind | 标签（en） | 图标 | 消费字段 | detail 行 |
|---|---|---|---|---|
| `user` | You | person-circle | `id,text` | `{key:'text',text}` |
| `thinking` | Thinking | thinking-medium（accent 色） | `id,text` | 同上 |
| `assistant-text` | Bot | sparkle | `id,text` | 同上 |
| `tool-call` | `<name>` 人性化（`Rfn`@3114870 前：剥 `…ToolCall` 后缀、`([a-z0-9])([A-Z])` 处插空格、首字母大写；机械验证 `bash`→"Bash"、`readFileSystemToolCall`→"Read File System"、`WebSearch`→"Web Search"） | pending→loading(spin) / failed→x-circle(红) / 其余→wrench | `id,name,status,pending/failed/completed,summary` | `{key:'summary',text}` |
| `send-message` | Message | send（绿） | `id,message{type,content,images?,widget?}`；预览 `Vfn`：type text→正文(+图片数)；type widget→问题 + 选项 ` / ` 连接 | `{key:'text',…}` |

- 预览/正文截断 `s4`：取首个换行前、slice 0..80 字符（`Lfn=80`）。
- 渲染顺序 = reply 数组顺序（无客户端排序、无 timestamp 消费）。
- exp4 复刻最小字段集即渲染成功（id/kind/text 或 name+status+summary 或 message），未知字段透传不炸——host 真实返回可能更宽。

## 2. Outline 面板（Full conversation）UI 规格

组件链：`epn`@3125641（aside role=dialog）→ header + `Zfn`@3124062（tablist，仅当 tab>1 渲染）→ `Jfn`@3121138（`sand-outline-panel__list` 虚拟列表）→ `Gfn`@3116974（item）。

**布局 / 挂载**
- 入口：侧栏 agent 右键菜单 DEV 段（`L4e`@APP@1184215，i18n `bSTUoz`="Full conversation"，图标 list-bullets）→ `panels.outlineAgentId` → `rFn`@3665173 渲染 `epn`。同段还有 `R4e`（`6T0tbB`="Async tasks"，图标 clock）→ `asyncTasksAgentId` → `Lst`，及 `z4e`（Open GrokBot harness）。Esc 关闭（`Nfn`@3114500 区）；header `onPointerDown` 可拖动（`SE()` attachPanel）。
- 浮层定位（CSS 原子类实测）：`position:fixed; top:56px; inset-inline-end:16px; width:360px; max-width:calc(100dvw-32px); z-index:200; border-radius:14px; border:1px solid var(--sand-border-tertiary-translucent); background:var(--sand-bg-elevated); box-shadow:0 24px 64px -24px #0009; -webkit-app-region:no-drag`；进场动画 0.16s cubic-bezier(.16,1,.3,1)（reduced-motion 下 animation-name:none）。**outline max-height:min(70vh,640px)**（`sand-1mpjnf3`）；async tasks 面板 `min(60vh,480px)`（`sand-1cnf4oa`）。
- Header：list-bullets(sm) + "Full conversation"(sm medium) + ` · ` + agentName(xs secondary) + 右侧 close 钮（icon close sm rounded variant secondary，aria `g2froP`）。aside aria-label = `iiUmLA`("Full conversation: {title}")。agentName 空时回退 `YyNOE7`("Conversation")。

**Tabs（subagent 面）**
- tab 集 = `[{id:agentId,label:agentName}, ...subagents.map(tpn)]`；`tpn` = `{id:subagentId, label:'${subagentType}: ${title}'.trim(), status}`（`$fn`@3130500 区；空 title 只显示 type）。错误哨兵记录被 `npn` 过滤（`Ll`=instanceof 错误类）。
- tab 交互：pill 形（radius 9999，max-width 200px，label 13px ellipsis），active 背景 `color-mix(text-primary 12%,transparent)`；左侧**状态点 6×6**：running→accent-primary（脉冲）、done→green、error/aborted→red、无→quaternary（`Yfn`+`o4.tabStatus*`）。键盘 ←/→/Home/End（roving tabindex，`vE`）。
- **切 tab 即切 subject**：`retain(subject, {pollIntervalMs})` —— 主 agent tab 不轮询；**running subagent tab 2s 轮询**（`Xfn=2e3`，@3130500 前）。切 tab 重置展开集。
- 每个 subject 独立 outline（subagent 的 outline 用 `getConversationOutline({id:subagentId})` 单拉）。

**列表 / 行 / detail**
- 虚拟化：rowPitch 30px、leadingOffset 6、spacer 2（`Pfn/Ffn/Ifn`）；detail 高度用 ResizeObserver 逐项实测（`Wfn`@3116700 区）合入 pitch；`autoScrollToBottom`（scrollTrigger=条数）。
- 行（`sand-outline-item__row` 按钮，h 28px、padding 7/8-12、radius 8、hover `color-mix(text-primary 7%)`、transition background .12s ease）：icon(sm；pending 加 spin) + 标签(13px medium) + 预览(13px ellipsis tertiary) + chevron(xs，右↔下)。aria-expanded/controls；外层 `div[data-kind][data-status?] role=listitem` + aria-posinset/setsize。
- 图标色（`Gfn` 内 3-bit 表）：user/assistant/正常 tool→tertiary；thinking→accent-primary；send-message→green；tool failed→red。
- detail（展开态）：缩进 `padding-inline-start:30px`，每节 = 可选 label（xs tertiary medium uppercase letter-spacing .04em）+ `pre` 正文（13px/1.5，margin-top 0）；本波版本 `Ufn` 不产 label，仅 `text`/`summary` 单节。空 detail → `ZZM+wt`("No additional details") xs tertiary。空列表 → `KSOvT7`("No conversation activity yet") sm tertiary。

## 3. Async tasks 面板（`Lst`@APP@1600590，新发现）

- 同壳浮层（`sand-async-tasks-panel`，除 max-height 60vh/480px 外同 §2 定位样式）；header：clock(sm) + "Async tasks"(sm medium) + ` · ` + agentName + close（aria `kbJugj`）；aside aria `dFDFkQ`("Async tasks: {title}")；Esc 关闭（MLn@3733670 全局 keydown）。
- 数据：`pbe(agentId)` → `getAsyncTasks({id})`（`bzn`@3812168 区 store：`snapshotsFor/refresh/ingestAsyncTasksEvent({parentAgentId,tasks})`）。
- 列表：虚拟 rowPitch **48px**、leading 6、spacer 2（`kst/Ast/QN`）；行高 46px、radius 8、padding 7/8-12。
- **行结构**（`Ist`@1597531）：左 6×6 running 脉冲点（role=status，aria `RiQMUh`="Running"）→ 图标(sm，`Nst`：subagent→`agent`、shell→`terminal-rectangle`、cloud-agent→`cloud-arrow-up`) → label(13px medium ellipsis) + meta(13px tertiary：kind 文案 + ` · ` + detail) → 右相对时间（tabular-nums，`MA` now-based）。行 aria `Gb1oSQ`("{id} — started {date}")。
- **async task 节点形状**：`{id, kind:'subagent'|'shell'|'cloud-agent', label, labelKind:'background_task'|'background_command'|'cloud_agent'|(default), labelParams?.id, detail, detailKind:'reattached_after_host_restart'|'durable_pending_wake_ledger'|(default), detailParams?.subagentType, startedAtMs}`；文案：`b9ZOw0`"Background task"、`yJBC7g`"Background command {id}"、`EbOjC8`"Cloud agent {id}"、`6YftFn`"reattached after a host restart"、`YFMpjb`"from the durable pending-wake ledger"（有 subagentType 时前缀 `{type} · `）；空态 `XAFPmV`"No async tasks in progress"。
- key = `${kind}:${id}`；不排序（数组序）。

## 4. tasks/workspace 页（`/src/electron-renderer/features/tasks/workspace/view.tsx` = WSP；entrypoint 注册 APP@3497963）

**入口与 gate**
- 侧栏头 Tasks 图标钮：aria "Tasks"（badge 有值时 "Tasks, {n} needs you"，badge 数 = `fMn` = review+attention 行数，APP@3591397 区）；点击 → entrypoint `p6.link()` 导航（APP@3775632 区 `Yt={count,isOpen,onOpen}`）。另有 `[data-tasks-row]` 侧栏行形态（可 "Move Tasks next to Search" 固定，i18n `nRI93X`），桩下默认未固定所以只见图标钮。
- gate：`Vt=nd('sand_tasks')`，`Ht=nd('sand_tasks_page')&&Vt`（APP@3775632 区）；快照来自 main 边 `getExperimentsSnapshot`（shape 见 main-app@1775965 区：`{isInitialized,hasAuthenticatedBootstrap,accountSlot,isAnysphereUser,featureGates:{},dynamicConfigs:{}}`；boot 初值在 `desktop.boot.experiments`，APP@4443950 区）。桩下注入两个 gate=true 实测可开。
- task-changed 卡同样受 `sand_tasks` 门控（TCARD 内 `j=i('sand_tasks')`）。

**行源与分组（APP@3590400–3591600）**
- `mMn({isEnabled})` rows hook：agents = 全 roster 过滤 `_Mn = !错误 && pMn`，**pMn = `harness==='temporal' && !isGroup && !isRemovedFromSidebar`** → 只有云 worker 的任务进页（实测 Main Bot 的 3 条任务不出现、Worker One 的 3 条出现）。tasks 来自 `getAgentTasks`（agentTasks store `nbe`@445238：`{agentId}` 拉取、按 `h_(agentId,taskId)` 去重、保留 未完/pinned/最近更新；pin 持久化写回）。
- 每行 `{agent, task, parentSessionId(bp: 非owner旁观时=viewerSessionId，否则 ''), threadSessionId(ug:'task:<id>[:<parent>'])}`；分组 `oMn`：**attention**（agent.awaitingSessionIds 含该线程 且 task 未 done）> **review**（task.unreadEntryId 存在）> **progress**（未完）> **done**；组序 `Y6=[review,attention,progress,done]`，组内按 `unreadAtMs??updatedAtMs` 降序。archive 状态过滤 `sMn`（archiving 即隐藏；archived 且 done 隐藏）。
- 区块 `dMn({rows,sort})`：sort='status' → 按组序逐组建 `group:` 区块；sort='bot' → 按 agent 建 `bot:` 区块；**Done 组恒为末尾 group 区块**。

**页面结构（WSP `ne`，实测截图 tasks-page.*）**
- Header：h1 "Tasks"(body1 medium) + 计数 span（`huXpvM` 复数 "{n} task(s)"）。
- 工具行："Sort by"（`/HgF9q`）+ SegmentedControl(compact/lg) `Status`(`uAQUqI`) | `Bot`(`ixkTse`)。
- 区块 `G`：h2 折叠钮（aria-expanded、chevron-right/down sm；标题 = 组名 i18n `fmS9Up`"For review"/`fAUSZy`"Needs attention"/`/LCAwL`"In progress"/`DPfwMq`"Done"，bot 区块 = 头像(xs)+bot 名）+ `ul`。**默认折叠集 = `{'group:done'}`**。
- 行 `H`（`li[data-task-board-row]`，分隔线 .5px tertiary-translucent（首行无）、padding 11/14、hover 显隐动作）：
  - lead 态标（`B(row)`）：attention→exclamation-circle(lg)+awaiting reason（无则 "Waiting for you" `N6oHir`），tone warn（文案色 `--sand-text-warn-primary`）；review→unread 点(dot info)+"New reply"(`/kRjAH`)；progress→working spinner（currentActivity 文案优先：activity→状态行文案（`g(i,{targetAgentName:null,isAgentStatusOn:f})`，即 RE-sendmessage-ui §1.3 的 lO 文案系统）；否则 running subagent 的 `title.trim()`；都不满足→"Idle" `QSzGDE`）；done→check 気泡。工作图标 `S`=`bN`@1519800 区：working→indeterminate 进度环（row=md/card=lg）、done→check-circle green、idle→空心环。
  - **progress 组的 lead 是可点 finish 钮**（`data-task-board-finish`，aria `vS7jKA`"Mark {name}"，title `p7WaXc`"Mark as finished"；hover 前置图标淡出、done 图标淡入）。
  - 主体：任务名（body1，`bdi`）+ meta（body2：bot 区块下不显 bot 名，group 区块显 头像(xs)+`agent 名 · 态文案`）。
  - 菜单（ky Dropdown）：`Mark as finished`（check，未完才有）+ `Archive`(`B495Gs`，archive 图标)；行尾常驻 ghost 圆形 archive 快捷钮（hover 显现，aria `7KhZ2e`）。动作走 `c.markDone/archive({agentId,taskId})` + 埋点 `agent_tasks`。
  - 点击行 → `close('workspace')` + setViewingAgent + `openThread({agentId,taskId})`（跳线程）。
- 空态：`qXAOim`"When you ask a Bot for several things at once, each one shows up here as a task"。

**task-changed 事件卡（E5，TCARD 全 4.1K）**
- entry：`{kind:'event', event:{type:'task-changed', taskId, taskName?, taskDescription?}}`（taskName/taskDescription 是 store 无该任务时的回退）。
- 状态推导 = `sg`@408600 区（`{agent,threadSessionId,task,runningSubagentIds}`）：blocked = awaitingSessionIds 含该线程；isWorking = 未 done 且(workingTaskSessionIds 命中 或 subagentIds∩runningSubagentIds)；unread = unreadEntryId 存在。图标 `og`：working/done/idle。runningSubagentIds = `A_`@453300 区（status==='running' 的 subagentId 集，仅在 `sand_tasks` 且 task.subagentIds 非空时算）。
- 卡 = thread-card 壳（`chunk-thread-card-ofnJW3_m`，`{name, detail, icon, trailing, onOpen, isInline, data-task-card}`）；detail 文案优先级：working→currentActivity 文案 > blocked→"Needs attention"(`6vppH3`) > unread→"New reply"(`v9vCX3`) > done→相对时间（`xOTzt5`"just now"/`0QMTco`"Done"）> "Thread"(`k52D/D`)；trailing = 状态点（`xN`：blocked=needs-attention、unread=info）。aria 矩阵 `RT0YVD`/`l+0N4d`/`h+4hdo`/`uaRF/T`/`/2GgU4`。onOpen→`openThread`。

## 5. subagents 数据面

- RPC：coordinator `getSubagents({id})`/`getAsyncTasks({id})`（subagents 域仅此 2 方法，D14 复核）。云侧 proto `ListGrokBotSubagentsRequest{agent_id}` → `subagents[]`（PROTO@998957）。
- 记录：proto `GrokBotRunningSubagent = {subagent_id, subagent_type, title, started_at_ms, fresh_until_ms}`；客户端投影补 `status`（'running'|'done'|'error'|'aborted'，Yfn 消费）。
- store `Gzn`@3827245：`snapshotsFor/refresh/ingestSubagentsEvent({parentAgentId,subagents})`；**新鲜度调度 `Hzn`：running 记录中最小 freshUntilMs，`refresh @ max(0, freshUntil-now)`，无 running 或无 fresh → 10s 兜底（`Uzn=1e4`）**。
- hooks：`k_(agentId)`（快照）、`A_(agentId, enabled)`（running subagentId 集）、`j_(agentId, predicate)`（找单条）@453100–453700。
- 侧栏 bot 行/任务行（已档于 RE-sendmessage-ui §1.4）：working spinner/unread/blocked 点 = `sg` + `xN`（blocked→`Sx` needs-attention、unread→`Sx` info）；bot 行 unread 计数含 `unreadThreadCount`。侧栏任务线程折页（d8e/qA@1279319/@1283357）本波未在桩下复现（见局限）。

## 6. 复刻要点（P6-16 / P5 直接可用）

1. **coworker 式展示**：原版不把 worker 做成侧栏新 bot（RE-sendmessage-ui §1.7 已证）；worker 的「可见工作」分散在 ①outline 面板 subagent tab（带 running 脉冲 + 2s 轮询的实时 outline）②async tasks 面板 ③workspace 页（**只列云 worker**）④侧栏任务线程态 ⑤task-changed 卡。P6-16 若要「worker 到侧栏去工作」，原版最接近的等价物是**侧栏 bot 行的任务线程折页 + working/awaiting 态点**；「coworker 独立工作区」等价物是 Tasks 页（含 badge 计数入口）。
2. outline 面板照抄规格：§2 的全部 CSS 值 + tab 语义（subagentType: title）+ 2s 轮询只在 running subject 上开。数据端给 `getConversationOutline({id})` 返回 §1 节点数组即可（节点 kind 是 outline 独立集合，别复用 transcript entry kind）。
3. async tasks 面板与 outline 面板共享壳组件——复刻时做一个 `FloatingDevPanel`（360px/fixed/Esc/拖 header），两个内容插槽。
4. Tasks 页分组规则一句话：**未读→review，等用户→attention，其余未完→progress，完成且无未读→done；done 默认折叠恒末尾**；行三动作 finish/archive/open。
5. gate：`sand_tasks`/`sand_tasks_page` 全关则这套面在原版也不可见——复刻时直接做常开，不必复刻 gate。
6. 桩补法：`stub-v3.js` 文本替换 4 个 COORD_VALUES 方法（getSubagents/getAsyncTasks/getAgentTasks(+3 个写方法)/getConversationOutline → FX 数据），gate 走 `boot.experiments={featureGates:{...}, isInitialized:true,...}`（只给 featureGates 不够，`isInitialized` 等字段要在——实测）。实验脚本 `/tmp/bot-r05/exp.mjs`（临时，未入库；要点已记本节）。

## 7. 参照图（`work/p6-orchestration/evidence/r05/`，1440×900@2 亮暗各一）

| 文件 | 内容 |
|---|---|
| outline-open.{light,dark}.png | 面板全节点 5 kind + 3 tool 状态（completed/pending spinner/failed 红）+ 双 subagent tab |
| outline-detail.{light,dark}.png | tool-call 行展开 detail（summary pre 块 + 缩进 30px） |
| outline-subagent-tab.{light,dark}.png | researcher: Market scan tab 激活（running 脉冲点）+ subagent 自己的 outline |
| async-tasks.{light,dark}.png | 3 kind 行（agent/terminal/cloud 图标、running 点、meta、相对时间） |
| tasks-page.{light,dark}.png | Tasks 页：计数 5、Status/Bot 切换、For review(warn 文案)/In progress(finish 钮+Idle)/Done(折叠)；侧栏 Tasks 钮 badge "1" |
| console-{light,dark}.txt | 桩 console（干净，无 boundary） |

## 8. 局限与未验证

- **outline 节点字段的"全集"以渲染端消费集为准**：U3n 不校验 item 结构，host 真实返回的额外字段（如 timestamp/层级）未观察；detail 多节/label 分支在 0.78.1 渲染代码里是能力位（c4 支持 label），当前 Ufn 不产 label。
- **outline/async-tasks 面板为 DEV-only 菜单**（`r?` 段位变量未解名——exp4 与本波均见 "DEV Full conversation"/"DEV Async tasks" 前缀）；正式入口是否存在（快捷键/深链）未穷举。
- **侧栏任务线程折页（d8e/qA）在桩下未复现**：给了 getAgentTasks + pinned/unread 字段仍不渲染，怀疑 threads 状态需 transcript 内 task 会话（`Pit/Nit` 扫 entries 的 taskId）或 agents-tasks 事件驱动，未继续追；结构规格仍以 RE-sendmessage-ui §1.4 静态结论为准。
- tasks-page 截图中 Main Bot（本地 agent）的任务按 pMn 语义被排除，**是设计行为不是桩缺数据**；但 `awaitingSessionIds/workingTaskSessionIds` 等活跃态字段在桩的静态 roster 下未验证是否会透传（attention 组未在截图中出现，因 awaiting 字段未生效或未配置——二者未区分）。
- subagent `status` 的赋值方（host 上报 or 客户端按 freshUntil 推导）未见实现代码；`fresh_until_ms` 的 host 端语义属边界外（R-06 G18 源码读可补）。
- workspace 页 badge i18n 复数形态（huXpvM）只取到片段；`Tasks, {n} needs you` 的完整模板 id 未定位（aria-label 实测文案已记）。
- CSS 全部取自 `work/p5-parity/evidence/078-css-rules-split.txt`（APP 同构建 CSS 拆分），stylex 原子类→语义类映射以本报告表格为准；两面板共享的 `sand-*` 原子类已逐条列出，未归类的（如 13px 字号族）沿用 RE-visual-078-values 口径。
