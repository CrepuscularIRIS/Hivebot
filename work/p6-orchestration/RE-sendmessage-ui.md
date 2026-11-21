# RE-sendmessage-ui · 0.78.1 SendToUser/SendToAgent 卡与主 bot 编排 UI（静态）

日期：2026-11-03 · 目标：`/dev/shm/grok-re/0.78.1/app/dist/`（解包复现见 p1-re/RE-unpack.md §0）· 方法：bundle 静态分析（grep + 逐段反混淆），未运行 app。凭证未读取。

## 0. 结论（先行）

1. **SendToUser = 独立 transcript entry kind `send-message`，不是 tool-call 行**。渲染按 protocolKey `send-message:<message.type>` 寻址 34 型 lazy 卡（p1-re 记 33，本表多出 `virtual-card-approval` 同族卡）。卡声明（icon + placeholderHeight + frame）全部在 eager bundle；卡 body 在独立 lazy chunk（`chunk-view-*.js`）。
2. **send-message 卡默认渲染在「消息帧」**：`frame = declaration.frame ?? (entryKind==='send-message' ? 'message' : 'timeline')`——即气泡泳道（有作者署名/分组），不是时间线事件条。
3. **text 卡（SendToUser 纯文本）** = 与普通 agent 气泡同构的 bubble（content + images + attachments + channel 链接 + isStreaming 流式态 + timestamp），外层带 hover 动作（复制/下载/展开/回复引用）与 reactions；另有 7 个特化分支（交互卡、文档、agent 链接、链接卡、语音备忘、投递回执、链接列表）。
4. **SendToAgent 不产生任何卡片**：在父 bot transcript 里只是 tool-call 紧凑状态行——文案 `Messaging <targetAgentName>` / `Messaging another assistant`，verb `sending`，图标 `person-chat-bubble`（目标 agentId 可解析时换成该 agent 头像）。CreateAgent 也只是通用 `messaging` 行。
5. **worker 回合结束通知不是主 bot transcript 里的卡片**，是三层呈现：
   - 侧栏 bot 行下的**任务线程折页**（chevron + 嵌套任务行 + SVG 连线）；任务行 = 任务名 + 未读蓝点 + close（=unpin）；
   - bot 行 **unread 计数**（`unreadCount + unreadThreadCount` 聚合）与状态点（`unread` / `blocked` / working spinner）；`blocked` = `awaitingSessionIds` 含该线程（bot 在等用户输入）；
   - **OS 通知**：`agent-done`（正文=最后一条消息 preview，折叠空白、截 140 字符）/ `agent-needs-input`（正文=awaiting reason，urgency critical；agent-done 静音）。窗口聚焦时改为 on-screen 提示（可路由到具体 agent/task），点击通知 focus 对应 agent。另有 tasks/workspace 面板行：排序 blocked → working → 活跃 → done，活跃上限 5。
6. **worker 的消息进入主 bot 会话时是 `message` entry + `fromAgent` 字段**：渲染进 assistant 泳道（`uc(e)=message&&(fromAgent||toAgent)` → role 'assistant'），按 `agent:<id>` 归组署名（组首显示作者名/头像）。出站方向（用户经主 bot 转发给 worker）是 `toAgent`。任务线程的 sessionId 规则：`task:<taskId>[:<parentSessionId>]`。
7. **无编排专用 UI**：用户侧建 bot = 侧栏 new bot 流程（renderer roster 域 `createAgent` / `createAgentFromTemplate` / `createGroup` / `deleteAgents` / `kickstartAgent`）；停止 = `interruptAgentRun({agentId, sessionId?})`（roster 域，还有全局「停止所有运行中 bot」的聚合调用）。模型侧 CreateAgent/StopAgent/SendToAgent 是工具（CreateAgent 参数全是云 worker 语义：machine_type/pool/base_branch/environment/repo_url/fork_from）。主 bot 身份 = 客户端 `mainAgent` store（`getMainAgent`/`setMainAgent`/`ensureDefaultMainAgent`，实验开关 `sand_grok_main_agent`）。
8. **bot 列表数据结构没有 worker/hidden 之外的编排标记**：`GrokBotAgentKind = [UNSPECIFIED, AGENT, ROOM]`——0.78.1 的「worker」不是 roster 里的一等 bot，而是主 bot 名下的 **GrokBotAgentTask**（task 线程）+ `subagent_ids` + 云 worker（BC id）。隐藏机制存在且通用：agent client state 的 `hidden_from_sidebar` / `removed_from_sidebar`（RPC `SetGrokBotAgentClientStateRequest`；renderer `roster.setAgentHiddenFromSidebar`；temporal 云 agent 另有客户端隐藏覆盖表）。

## 1. 证据（bundle 锚点，均为 file@byte-offset）

### 1.1 卡片寻址与注册表（renderer/assets/index.eager-app-iGTgHP_Q.js，下称 APP）

| 锚点 | 内容 |
|---|---|
| APP@2619188 | `xXt` 卡片 schema：`Map[[event,Set(12型)],[send-message,Set(34型)],[message/user-attachment/mcp-app/notice/feedback/voice-chat→单型]]` |
| APP@2619357 | `RQ(e)`：entry kind→protocolKey，`case 'send-message': return 'send-message:'+e.message.type`；`tool-call` 返回 null（不走卡注册表） |
| APP@2627303 | `BXt(e)`：send-message 派发器。特例：`message.type==='permission-request'` → 渲染成 `retired` 变体的占位条（审批卡已退休到 approvals 域）；其余 `resolve('send-message:'+type)` → lazy Body + 高度占位 fallback（`sand-card-body-placeholder`） |
| APP@3478148 | `KOn`：card.ts 声明表（eager 占位 + icon/height 元数据） |
| APP@3484689 | `qOn`：view.tsx → `ya(()=>import('./chunk-view-*.js'))` lazy 加载表 |
| APP@2467007 | cursor-agent 卡声明 `Mn({icon:'cloud',placeholderHeight:164})` + 紧凑态高度覆盖（70/60/290） |
| renderer/assets/index.eager-platform-C2su3Zzb.js@412115 | `xT(e)` 声明构造：`frame = t.frame ?? (entryKind==='send-message' ? 'message' : 'timeline')`；校验 frame∈{timeline,message}、placeholderHeight 必须为有限正数 |

**34 型声明表**（icon / placeholderHeight，APP 卡声明区；body chunk 名同节尾）：

| type | icon | h(px) | | type | icon | h(px) |
|---|---|---|---|---|---|---|
| text | chat | 60 | | publish-approval | globe | 120 |
| attachment | file | 60 | | scm-connect | plug | 220 |
| widget | question | 168 | | secret-request | lock | 134 |
| user-form | edit | 220 | | slack-connect | plug | 90 |
| visualization | chart-line | 360 | | slack-draft | chat | 150 |
| cursor-agent | cloud | 164 | | meeting-chat-draft | chat | 150 |
| calendar-event | calendar | 60 | | imessage-draft | chat-bubble | 170 |
| email-draft | mail | 200 | | email-offer | mail | 242 |
| connector / connectors | plug | 76 | | listener-connect | plug | 154 |
| connector-grant | shield | 96 | | onepassword-connect | key | 120 |
| cookie-origin-approval | shield | 76 | | mobile-tool-permission | device-mobile | 76 |
| local-tool-permission | shield | 76 | | auto-review-approval | shield | 152 |
| meeting-join-consent | shield | 152 | | virtual-card-approval | credit-card | 180 |
| notifications-enable | bell | 120 | | app-secrets-request | key | 120 |
| team-access | people | 211 | | bot-template-share | link | 148 |
| appearance-picker | palette | 360 | | phone-call | headset | 300 |
| credential-request | key | 220 | | | | |

### 1.2 text 卡组件结构（renderer/assets/chunk-view-CKIKFjF_.js，278,997 B）

| 锚点 | 内容 |
|---|---|
| @278355 | 默认导出 `id`：无交互→`nd`（只读）；有交互（`message.cards` 且 run 可用）→`td`（交互视图，可被 superseded）；stale→isSuperseded 样式 |
| @273040 | `nd` 分支优先级：①`Vu` 交互卡（message.cards.items）②`Hu` 文档 ③`Uu` agent 链接 ④链接卡（surface elevated/bubble）⑤语音备忘（tone:'agent'）⑥`Yu` ⑦默认 `rd` |
| `rd` | 默认气泡：共享 bubble 组件 `z({adjacency, channel, channelHref, content, images, attachments, isSourceTrusted:true, isStreaming, timestampMs})`；非流式时附加分支：投递回执 `Wu`（shipment.lead）、`qu`、链接列表 `Ju` |
| APP@2530124 | `JZ` message-block 外壳（对 message/send-message/user-attachment 三 kind 生效）：hover 工具条（copy/download/expand/replyQuote）、reactions、`sand-message-block` 分组样式 |

### 1.3 SendToAgent / CreateAgent 的 transcript 呈现（tool-call 行）

| 锚点 | 内容 |
|---|---|
| APP@1061409 | `lO` 状态行映射：`case 'SendToAgent'/'UpdateAgent'` → verb `sending`/`messaging`，textKind `messaging_named`/`messaging_assistant`，文案 `Messaging ${targetAgentName}` / `Messaging another assistant`，icon `person-chat-bubble`，目标可解析时 `{kind:'agent',agentId}` 头像；`CreateAgent/ReactToMessage/SendIMessage` → 通用 `messaging`/`Messaging`/`person-chat-bubble` |
| APP@2619900 附近 | tool-call 行兜底：icon 映射（user→person-circle、pending→loading、failed→x-circle、其他→wrench），行文本=summary（p1-re RE-ui-shell §1.3 已记） |

### 1.4 worker 通知链（三层）

| 锚点 | 内容 |
|---|---|
| electron-main/proto.cjs@997601 | `GrokBotAgentTask \|1 id \|2 name \|3 description \|4 status \|5 updated_at_ms \|6 unread_entry_id? \|7 unread_preview? \|8 unread_at_ms? \|9 pinned_at_ms? \|10 subagent_ids* \|11 followed` + RPC `ListGrokBotAgentTasks(agent_id, include_recently_done)` / `MarkGrokBotAgentTaskDone/Read(agent_id,task_id,entry_id)` / `SetGrokBotAgentTaskPinned` |
| proto.cjs@842369 | `NotifySandAgentTurnFinishedRequest \| agent_id \| agent_name \| message_preview \| last_message_id \| awaiting_user_response \| member_agent_ids* \| sender_agent_id \| message_content_json`（GrokBotService Unary；**调用点不在 main bundle**，见局限） |
| proto.cjs@399173 | `GetAgentStatusWorker \| bc_id \| name \| lifecycle \| turn_in_flight \| last_terminal_turn_status \| pr_url \| last_activity_at_ms`（云 worker 状态，供 GetAgentStatus 工具） |
| proto.cjs@998957 | `GrokBotRunningSubagent \| subagent_id \| subagent_type \| title \| started_at_ms \| fresh_until_ms` |
| node-agent-coordinator/main.cjs@164297 | `P6`：agent live 态投影 `{isRunning, isRunningTurn, isComposingMessage, isRetrying, currentActivity{kind:'thinking'\|'tool',tool,detail,target,callId}, activeGroupMemberId, boxHandoff, awaitingUserResponse{tabId,reason,sinceMs}, lastTurnSettlement{turnId,outcome,settledAtMs}}` |
| coordinator@162766 | `z0`：跨 agent 聚合 → `runningSessionIds` / `awaitingSessionIds` / `workingTaskSessionIds`（task:<id> 线程） / `groupTurns`（ROOM 成员） |
| coordinator@164905 | `O6`：agent client 态投影 → `hasUnread, unreadCount, unreadThreadCount, lastViewedAt, lastActivityAt, newestEntryId, lastMessageId, lastMessageTaskId, lastMessagePreview, isHiddenFromSidebar, isRemovedFromSidebar, notifyOnUpdatesEnabled` |
| electron-main/main-app.cjs@3209281 | `cEe`：5s 轮询 diff（`ipr=5e3`）→ 通知事件。**agent-needs-input**：awaitingReason 新出现/变化；**agent-done**：`was isRunning && now !isRunning && 无 awaiting` 或 `lastMessageId` 变化 |
| main-app@3244019 | `N0t`：OS 通知文案。needs-input → title=bot 名、body=reason；done → body=preview（空白折叠、截 140 字符 `tmr=140`）；agent-done 静音（`silent`）、needs-input urgency critical |
| main-app@3208504 | `n0t`：通知用 agent 行形状（lastMessageAuthorId/lastMessageTaskId/lastMessagePreview/pushMessageContent/readAtLatestActivity） |
| main-app@3257025 | `pmr`：`awaitingSessionIds[0]` 解析出 taskId |
| APP@408704 | `sg(e)`：任务行状态推导 → `dot:'blocked'`（agent.awaitingSessionIds 含该线程）\| `dot:'unread'`（task.unreadEntryId 存在）\| isWorking（task 未 done 且 runningSessionIds/runningSubagentIds 命中） |
| APP@1522257 附近 | `jit`：任务行归一 `{id,isPinned,isBlocked,isWorking,isUnread,isFinished,lastMessageAtMs}`；排序 blocked→working→未完→已完（按时间）；活跃上限 `activeCap:5`；静默阈值 6h/2h |
| APP@1283357 | `d8e`：侧栏线程折页外壳：bot 行 + `data-agent-thread-toggle` chevron 按钮（aria-label 含 botName）+ 嵌套 `qA` 行 + `data-agent-thread-lines` SVG 连线 |
| APP@1279319 | `qA`：任务线程行（`data-agent-thread-row`）：任务名 + 未读指示（`status:'info'` 点，未读且非当前打开时）+ close 按钮（unpin，`Mr('agent_tasks',…)` 埋点）+ 右键菜单（pin-slash） |
| APP@（b8e，@1283357 前后） | bot 行 unread 计数：`(hasUnread?max(unreadCount??1,1):0)+(unreadThreadCount??0)` |
| APP@4304852 | tray store：host trays（`getTrays`/`dismissTray`/`clearTrays`）+ server-turn failure trays——错误托盘，与 worker 通知无关（排除项） |

### 1.5 worker 消息在 transcript 中的形状

| 锚点 | 内容 |
|---|---|
| APP@185623 | `uc(e)`：`message && (fromAgent\|\|toAgent)`；`dc/fc/pc`：toAgent 目标类型（agent/cloud-agent/其他通道） |
| APP@1738229 | `zR`：渲染角色推导——`message` 且 uc → **assistant** 泳道；send-message/mcp-app → assistant；user-attachment → user |
| APP@1738445 | `BR`：作者归组 key——send-message→`member:<author.id>`（群聊成员署名）；message→`agent:<fromAgent.id>` / `human:<fromUser.authId>` / toAgent→`agent:<id>` |
| APP@1911436 附近 | `SW`：frame==='message' 时署名显示 `isGroupStart?'group':'none'`（组首显作者名） |
| APP@409219 附近 | 任务线程 sessionId 解析：`task:<taskId>[:<parentSessionId>]`；composer 槽位 key `sand:task\0<agentId>\0<taskId>` |
| electron-main/main-app.cjs@1364500 | `nEn`：用户 prompt 判定要求 `role==='user' && 无channel && 无fromAgent`——即 fromAgent 消息不被当作用户输入回放 |
| renderer/assets/chunk-view-B2FzGpIY.js（全 4.4KB） | `message:message` 卡：role user → 用户气泡（link 卡/voice memo tone:'user'/气泡）；role assistant → assistant 气泡（isStreaming/onCopy/isSourceTrusted）。**普通 assistant message 与 send-message 卡都会渲染**（是否对用户隐藏普通 assistant 文本取决于 harness 是否产出该 entry，渲染层无抑制证据，见局限） |

### 1.6 建worker / 停worker / 主 bot 标识（用户入口）

| 锚点 | 内容 |
|---|---|
| APP@264102 | renderer desktop bridge `roster` 域方法表：`listAgents, countAgents, searchAgents, resolveAgentCreation, getServerAgentRoster, getMainAgent, setMainAgent, ensureDefaultMainAgent, restoreTemporalAgentRouting, createAgent, createAgentFromTemplate, createGroup, setGroupMembers, updateAgent, seedConversationName, deleteAgents, kickstartAgent, interruptAgentRun, startFreshConversation, rollBackConversation, setAgentUnread, setAgentHiddenFromSidebar, setAgentNotifyOnUpdates, …` |
| APP@2586840 附近 | `interruptAgentRun({agentId, sessionId?})`：对 roster 中所有 isRunning 的 agent（及其 runningSessionIds 逐 session）中断，轮询至全部停止（15s 超时）——「停止所有」批量入口 |
| APP@245204 附近 | `mainAgent` store（`$().mainAgent`，实验 `sand_grok_main_agent`）：`{kind:'known',agentId}` |
| proto.cjs@405750 | `CreateAgentArgs \| tool_call_id \| prompt \| name? \| model? \| base_branch? \| machine_type? \| worker_id? \| pool? \| labels \| environment_build_id? \| environment_id? \| repo_url? \| tracked_task_keys* \| fork_from? \| fork_turns?`；`StopAgentArgs{agent_id}`；`SendToAgentArgs \| tool_call_id \| agent_id \| message \| delivery \| title? \| model? \| tracked_task_keys*` |
| APP@281177（main-core 同表） | 工具名枚举：`SendToAgent / SendToUser / CreateAgent / StopAgent / MessageSubagent / CheckSubagent / StopSubagent / SetPrimaryBot …` |

### 1.7 bot 列表数据结构（Q-019）

| 锚点 | 内容 |
|---|---|
| proto.cjs@904696 | `GrokBotAgentKind=[UNSPECIFIED,AGENT,ROOM]`；`GrokBotAgentHarnessKind=[UNSPECIFIED,BOX,TEMPORAL]`；`GrokBotAgentCreateCaller=[UNSPECIFIED,ROOM_MEMBERS,ENSURE_SERVER_BACKED,MINT,BACKFILL,PRODUCT_CREATE]` |
| proto.cjs@964607 | `SetGrokBotAgentClientStateRequest \| agent_id \| mark_read? \| mark_unread? \| notifications_enabled? \| notify_on_updates_enabled? \| hidden_from_sidebar? \| mark_followed_threads_read?`（另有 `removedFromSidebar` 走 client 态投影） |
| APP@341203 | `Lm(e)`：侧栏过滤 `isHiddenFromSidebar===true && !(teamDefault && 非owner)` |
| APP@4109471 附近 | agent 行字段：`unreadThreadCount, lastViewedAt, lastActivityAt, localActivityAt, awaitingUserResponse, notificationsEnabled, notifyOnUpdatesEnabled, isHiddenFromSidebar, isRemovedFromSidebar, voiceId, origin, harness, purpose, visibility, memberIds(ROOM), isGroup` |
| APP@4120785 附近 | temporal（云）agent 的客户端隐藏覆盖表：restore/ingest/apply `isHidden/isRemoved`，仅 `harness==='temporal'` 生效 |
| APP@651438 / @3530516 | `setAgentHiddenFromSidebar(id,false)` 的两个调用场景：接受 team-bot 邀请（noteTeamBotAdded）、消息发送目标被隐藏时自动拉回侧栏 |
| proto.cjs（CreateAgent 系） | `CreateGrokBotAgent` / `CreateGrokBotTemporalAgent`（同参 Fc）服务端建 bot；roster 无 worker kind——worker 归属由 `GrokBotAgentTask.subagent_ids`、task 线程、云 BC id 表达 |

## 2. 复刻要点（可直接当 UI 任务规格）

1. **事件形状**：SendToUser 落一条独立 entry kind（我们 C2 里定为 `send-message` 帧或 tool/call 帧加标记），携带 `message.type` + payload；渲染按 `kind:type` 查卡表。text 卡直接复用 agent 气泡组件，加 `streaming` 态。
2. **卡表最小集**：MVP 只需 `text`（icon chat/h60）+ 审批类（icon shield/h76~152）；声明表（icon+placeholderHeight）eager、body lazy 的两层结构值得照抄（虚拟滚动要占位高度）。
3. **SendToAgent 行**：tool-call 紧凑行文案 `Messaging <botName>`（未知目标→`Messaging another assistant`），icon person-chat-bubble，目标解析成功换 agent 头像。
4. **worker 通知**（D5/D8 的 UI 面）：不要做 transcript 卡；做 ①侧栏任务行（名+未读点+unpin）挂在主 bot 行下的折页，②bot 行 unread 计数，③OS 通知（done=preview 截 140 字、needs-input=reason、critical、点击 focus）。blocked（awaiting）与 unread 是两个不同的点。
5. **任务行状态机**：`status∈{open,done}` × marks `isBlocked/isUnread` × `isWorking`；排序 blocked→working→active(≤5)→done。
6. **worker 可见性**（Q-019 对齐）：原版 worker=主 bot 的 task 线程，不是侧栏新 bot；若我们做成独立 bot（BRIEF §9-Q2 默认），数据结构对齐点是给 BotsMeta 加 `createdBy` 而非新 kind——原版 roster kind 只有 AGENT/ROOM，隐藏能力是通用 `hiddenFromSidebar` client state（连同 removed、notifyOnUpdates 一起在 SetClientState）。
7. **出站/入站署名**：入站 worker 消息= assistant 泳道 + `agent:<id>` 归组（组首署名）；出站给 worker 的消息（toAgent）同卡不同 direction。

## 3. 局限与未验证

- **纯静态**：stylex 哈希 class（`sand-*`）未还原为具体颜色/间距；视觉规格以结构+图标名+占位高度为准。
- **SendToUser 工具实现未找到**：main bundle 只有工具名枚举与 entry 消费端；harness（何时插 send-message entry、streaming 字段来源、`delivery` 枚举语义）在沙箱内 runner，未验证。
- **「普通 assistant 文本是否对用户隐藏」（BRIEF RE-1① 后半）**：渲染层证据表明 `message:message` 卡正常渲染 role=assistant 气泡（chunk-view-B2FzGpIY.js），recall 视图也把 send-message 当作 agent 唯一可见输出（main-app@1364500 附近 `VH.ofTranscript`：message→'them'、send-message→'you'）——但 harness 是否在有 SendToUser 的回合抑制普通 assistant entry，无 bundle 证据，保持未验证。
- **NotifySandAgentTurnFinished 调用点**：仅在 proto 定义与服务表（proto.cjs@842369、coordinator/local-exec-daemon 服务表）；实际调用应在沙箱 runner 或服务端，未验证。客户端实际用的通知路径是 main-app 的 5s 轮询 diff（§1.4）。
- cursor-agent / visualization 卡的内部布局只粗读（高度特殊分支多）；`delivery` 字段（SendToAgentArgs）枚举未展开。
- 34 型 vs p1-re 33 型：本表用声明表机械提取为 34（多 `virtual-card-approval`）；不影响结论。
