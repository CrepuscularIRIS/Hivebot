# RE-cross-session · 0.78.1 跨 session / 线程机制（R-10）

2026-11-03 · reverse-engineer（GLM 5.3 + REA）· 静态分析（HOME 隔离，未登录、未运行目标）。
输入：`/dev/shm/grok-re/0.78.1/app/dist/`。锚点 = `文件@字节偏移`。缩写：

- `APP` = `renderer/assets/index.eager-app-iGTgHP_Q.js`（4,491,154 B）
- `CRD` = `node-agent-coordinator/main.cjs`（1,193,881 B）
- `MA` = `electron-main/main-app.cjs`（3,470,507 B）
- `PROTO` = `electron-main/proto.cjs`（1,429,117 B）
- `TC` = `renderer/assets/chunk-thread-card-ofnJW3_m.js`（5,939 B）
- `TCC` = `renderer/assets/chunk-view-7PKdecmC.js`（task-changed 卡）

对应 RE-COVERAGE §4.1 #1（R-10）→ P6 第一批「跨 session」（Q-020）。

## 0. 结论（先读这个）

1. **0.78.1 的"线程"就是 task**。客户端没有独立 thread 对象：每条线程 = `agent 的一个 task`，会话 id 合成 `task:<taskId>[:<parentSessionId>]`，taskId 是 10 位 hex。`createThreadFromMessage` 只是把一条已有消息变成新 task 线程的入口，其余一切（侧栏折页、卡、composer 槽位、已读/未读、working 状态）全部复用 task 机制。
2. **跨 session = 三种 session 命名空间**：主会话（无前缀）、`dm:<N>` / `group:<id>`（多人/群）、`task:<id>[:<parent>]`（线程）。往线程里发言时客户端把 sendPrompt 的 sessionId 改写成 `task:...` 并同时携带 `taskId`。
3. **worker 回报路径的客户端侧** = 云端 Watch 多游标事件流（transcript + agent-tasks/subagents 族）+ 状态字段（`GrokBotAgentLiveState.working_task_ids` / `has_running_subagents` / `awaiting`）。`WakeParent` 在客户端只有工具名枚举，没有调用方；`NotifySandAgentTurnFinished` 是云→云（SandBox 服务）的 proto 方法，客户端不调用。维持 RE-COVERAGE A20/A21 判定。
4. **bot↔bot 消息走独立云 RPC** `SendGrokBotAgentMessage{from_agent_id,to_agent_id,message_id,text,sent_at_ms,reply_to_id?}`，回 `{delivery, target_agent_id, target_name, workflow_id?}`，delivery 枚举含 TEMPORAL/BOX 两路投递与 4 种失败。客户端里同样没有调用方（调用方在 host/云端，0.78.1 边界外）。
5. **MessageSubagent/WakeParent/CheckSubagent/CreateTask 等工具在客户端只有两处痕迹**：165 工具名枚举（键+值）和 tool-call 状态行的**默认渲染**（"Working" + wrench 图标）。只有 `SendToAgent` 有专属行（"Messaging <name>"）。payload schema 全部边界外 → G18 `source/host/runner/tools/*`（R-06，scout）。

---

## 1. ① reactToMessage / createThreadFromMessage（D2 send 域）

### 1.1 参数（三处一致：renderer / coordinator / 云 proto）

| 方法 | args | reply | 云 RPC | proto Request |
|---|---|---|---|---|
| `reactToMessage` | `{entryId: string, emoji: string, agentId: AgentId, sessionId?: string}` | void | `reactToGrokBotMessage` | `ReactToGrokBotMessageRequest`（同字段；`Response|1 refusal #0?`） |
| `createThreadFromMessage` | `{entryId: string, agentId: AgentId}`（**无 sessionId**） | void | `createGrokBotThreadFromMessage` | `CreateGrokBotThreadFromMessageRequest|1 agent_id 9|2 entry_id 9`（`Response|1 refusal #0?`） |

证据链：
- CRD@986100（args schema）、CRD@996670（方法表）、CRD@1130691（分发解码器，逐字段校验后透传）、CRD@1110115（args=object/reply=void）。
- MA@1440861（renderer 侧 rpc schema）、MA@2818865（云桥：`createThreadFromMessage → e.createGrokBotThreadFromMessage({agentId, entryId})`，refusal → 错误，accepted → `{status:ok,value:null}`）。
- PROTO@1177500 起：`gI`（Create…Request）、`wI`（Response）；`ReactToGrokBotMessage*` 紧邻其前。
- 语义标注：CRD@929907 disposition 表 `reactToMessage:"person", createThreadFromMessage:"person"`（需人在场，不后台重放）；CRD@1001057 scope 表 `createThreadFromMessage → {scope:"temporal", mirrorGateway:!1}`（走 temporal journal，不镜像 gateway——即本地 box 不执行此命令，只在云端 temporal 域生效）。

**线程怎么建**：reply 是 void + refusal，**不返回新线程 id**。客户端发出后不自己接线：新线程通过 **task-changed 事件（action=created）** + agent-tasks watch 刷新进入侧栏/tasks overlay（§2.3），用户从那里 `openThread` 打开。服务端负责从 entryId 反解 agent/session 并建 task。

### 1.2 入口门控（谁能看到"从消息建线程"）

APP@3411325（会话流 props 组装）：

```js
Ie = nd(`sand_tasks`)                      // feature gate
Re = Ie && f?.harness === `temporal`       // 仅 temporal harness 的 agent
      && !f.isGroup && !v && !b            // 非群聊、非只读 viewer、(v/b 为 viewer/群标志)
      && Fe === ``                         // composer 当前绑定主会话（Bg@420890 解析，''=主会话）
  ? e => { Le({entryId:e, agentId:f.id}).catch(...) } : void 0
// Le = createThreadFromMessage；失败 fl(refusal) → toast(TtKZw4/D2AZQg/zga9sT)
```

`onCreateThread` 与 `onReply`（openReplyTo）、`canReply:!0`、`replyTargetId`、`clearReplyTarget`、`replyPreview` 一起注入消息行（APP@3411800 附近）。即消息 hover 操作族 = **回复 / 建线程**。

`harness` 字段在 `GrokBotAgent|13 harness 9`（PROTO@442063），renderer 79 处 `harness==='temporal'` 比较（如 APP@200549）；`sand_tasks` gate 同时控制 task-changed 卡（TCC）与 tasks overlay。

### 1.3 挂在哪 + UI 呈现

- **线程行组件**：`TC`（chunk-thread-card）。props `{aria-label, icon, iconDataAttributes, name, detail, trailing, trailingDataAttributes, isInline, onOpen, ref}`；三种布局变体由 `isTasksOn(=sand_tasks gate)` × `isInline` 选择；`<bdi>` 包名字/详情（RTL 安全）。本身是哑组件，所有内容由调用方给。
- **task-changed 事件卡**（TCC，inline 线程行）：payload `entry.event.{taskId, taskName, taskDescription, action}`；名字回退 `T?.name ?? event.taskName`（T = agent-tasks 快照里同 taskId 的 task）。detail 按 `sg()` 状态机取：working→默认细节文案 / `dot:blocked`→6vppH3 / `dot:unread`→v9vCX3 / done→相对时间（xOTzt5/0QMTco）。icon：working 时 `c(size:row, work:working)` spinner，有线程时 `chat-bubbles` 18px；trailing = unread/blocked 圆点（`data-thread-lead`、`data-thread-indicator`）。onClick → `openThread({agentId, taskId})`。
- **行折叠规则**：APP@409986 `Nve`——transcript 里 `task-changed` 事件只保留 `action==='created'` 的可见行（其余被过滤），WeakMap 记忆化。
- **侧栏折页**（已逆，RE-sendmessage-ui §1.4）每行 = `uMn()`（APP@3590766）产出 `{agent, task, parentSessionId, threadSessionId: ug(task.id,{parentSessionId}), group}`，分组 `oMn()`（APP@3590123）：`awaitingSessionIds 含 threadSessionId 且未 done → 'attention'`；有 `unreadEntryId → 'review'`；done→'done'；否则 'progress'；组内按 `unreadAtMs??updatedAtMs` 倒序。
- **线程状态机** `sg()`（APP@408950 附近）：`agent.awaitingSessionIds.includes(threadSessionId) → {isWorking:false, dot:'blocked'}`；`agent.workingTaskSessionIds.includes(...) 或 task.subagentIds ∩ runningSubagentIds ≠ ∅ → isWorking`；`task.unreadEntryId≠∅ → dot:'unread'`。
- **线程打开**：tasks store（APP@446700–448800）`openThread({agentId,taskId,focusEntryId?})` → `threadSnapshots`（单值）+ `openedThreadSnapshots` 记时间 + `refresh(agentId)`；`markAgentTaskRead({agentId,taskId,entryId})` 消未读；`markAgentTaskDone` 归档；`focusSeq` 递增用于聚焦某 entry。

### 1.4 reactToMessage 的 UI（reactions）

- entry 字段 `reactions: [{emoji, isMine, by}]`（分组渲染，退出动画 `reaction-stack-collapse` ttl 150ms，shift 时长来自 motion token）。
- 点击处理 APP@2471758 `fWt`：先 journal 期望（`sWt({agentId,entryId,emoji,expectedPresent,viewer})`）；**temporal harness 且 entry 在当前会话** → 走本地乐观 `toggleReaction`（带 reactor 身份 `viewerIsOwner===!1?viewerAuthId:'me'`）；否则直接 RPC `reactToMessage({entryId,emoji,agentId,sessionId?})`。
- reactions 有独立 resync 通道：APP@4310864 `Zve({clock, send:e=>f.reactToMessage(e), resync:({agentId,entryId},n)=>f.resyncEntry(...), marks})`——断线后按 entry 重放 reactions 状态。

### 1.5 roll-back（同域，编辑被挡消息）

- RPC：`rollBackConversation({id, sessionId?})`（CRD@987511）。
- UI：**服务端 tray** 驱动。tray action 解析 APP@3738158 `JLn`：`{kind:'roll-back', sessionId, fromSeq?}` / `{kind:'start-fresh', sessionId}`（多与用量上限/阻塞文案一起下发）。点 roll-back（APP@3750897）：`FLn(entries, fromSeq?)` 把被回滚的 entries 转成 composer 草稿 → `rollBackConversation({agentId,sessionId})` → 若有草稿且无未发送草稿则 `onEditBlockedMessage(agentId, entries)` 重开 composer。失败红字 D2AZQg。
- `startFreshConversation({id, sessionId?})` 同 tray 另一动作。

---

## 2. ② 跨 session 消息流（SendToAgent 之外的客户端全链）

### 2.1 session 命名空间（APP@408950–409250）

| 形态 | 格式 | 解析 |
|---|---|---|
| 主会话 | 无前缀（agent 根会话） | — |
| DM | `dm:<1..N>`（`/^dm:[1-9][0-9]*$/`） | 群成员私聊 |
| 群 | `group:<id>`（APP@300020 `hfe`） | 群聊（Room） |
| 任务线程 | `task:<taskId>` 或 `task:<taskId>:<parentSessionId>`，taskId=10 hex，parent 须为 `dm:N` 或空 | `fg()` 严格校验 |
| 云运行 id | `task-<10hex>-t(\d+|b)s\d+` | `dg()` 提取 taskId（t=turns/b=branch? s=step——**语义推断**，客户端只用它反查 task） |

构造器 `ug(taskId,{parentSessionId})`（APP@409149）。`bp({agent})`（APP@299990）= viewer 非本人时取 `agent.viewerSessionId`，否则 `''`——即侧栏线程的 parentSessionId 来自 viewer 视角。

云侧 session 实体：`GrokBotAgentSession|1 agent_id|2 session_id|3 kind|4 created_at_ms|5 updated_at_ms|6 last_activity_at_ms?`（PROTO@963435），kind 枚举 `aw`（PROTO@901126）：`MAIN / SLACK_DM / SLACK_THREAD / DM / GROUP / TEAMS_DM / TEAMS_THREAD / TEAMS_GROUP_CHAT`。列出走 `desktop.listGrokBotAgentSessions({agentId})`（preload@118602 声明；MA@2794442 `Xgt.listSessions` → 云 `ListGrokBotAgentSessions` → `Kjn`@2794036 映射），renderer 里由团队数据上下文 `BHn`（APP@3909017）消费，gate `grok_bot_team_integration_enabled`。

### 2.2 发送侧：sessionId 改写 + 槽位

- **composer 草稿 schema**（client-persisted slice `composer-drafts`，APP@301500 起）：`{prompt, attachments[{path,name,size?}], richText?, replyToId?, replySessionId?, replyQuote?, isFork?, taskId?}`。
- **槽位 key**（APP@300584–300692）：task 槽 `sand:task\0<agentId>\0<taskId>`；线程槽（fork）`sand:thread\0<agentId>\0<threadRootId>`；主 composer = 裸 `<agentId>`。threadRoot 解析 `xfe`：`entry.authoredThreadRootId ?? (isFork===true && replyToId!=null ? replyToId : null)`。
- **发送时**（APP@4250783 dispatcher）：`sessionId' = taskId===undefined ? sessionId : ug(taskId,{parentSessionId: sessionId})`，然后 `sendPrompt` 同时携带 `{agentId, sessionId'(task: 前缀), taskId?}`；journal / optimistic 标记（`markOptimisticUndelivered` / `retain`）也用改写后的 sessionId。room agent（`group:` 前缀）重发被扣留（`isResendWithheld`）。
- **sendPrompt 全参数**（CRD@976724 `mB`）：`prompt, agentId, directAddressedAcceptance?, clientNonce?, attachmentPaths?, attachmentNames?, richText?, replyToId?, replyQuote?, automationWriteProvenance?(untrusted|template_import), isFork?, traceparent?, enterEpochMs?, composedAtMs?, source?, sendSource?, mcpConfigJson?, sessionId?, machineId?, onePasswordAppInstalled?, rendersMcpElicitationForms?, taskId?, initiator?(user|template_import|template_share|card_action|plugin_setup|teach_recording), firstSentAtMs?, language?`。
- **optimistic entry**（APP@1892200–1894700）：用户消息 → `message` entry，携带 `replyTo: replyToId, replyQuote, taskId, isFork===true → branched:!0`；`authoredThreadRootId` 由 journal 侧（`fU`）回填。附件 → `user-attachment` entry 同样带 replyTo/replyQuote/branched。**wire 上 fork 的字段名是 `branched`**（message/send-message/user-attachment/notice 都有，APP@185600 `lc` 系列）。
- 回复链回溯 `gne`：沿 `cc(entry)`（replyTo）向上找第一个非 branched 祖先——fork 线程根在主会话里的锚点。

### 2.3 接收侧：唤醒/通知的客户端机制

一个 session/线程有新动静时，客户端被动更新只有这几条通道：

1. **transcript Watch 流**（已逆 RE-ipc-rpc §4）：新 entry 直接进对应 session 的 replica；`message` entry 的跨 agent 字段 = `fromAgent` / `toAgent`（`{id,name,kind?}`，kind 含 `agent` / `cloud-agent` / 外部渠道）、`channel`、`fromUser`。方向归并 `Jpt`（APP@1733246）：fromAgent→`{direction:'inbound',peer:fromAgent}`，否则 toAgent→outbound；`xR` 聚合多 peer 显示。
2. **task 状态**：`GrokBotAgentLiveState`（PROTO@363000）字段 `session_id, is_running, is_composing_message, is_retrying, activity?, awaiting?, box_handoff_request_id?, box_handoff_instruction?, active_group_member_id?, has_running_subagents, surface_task_id?, working_task_ids*, last_turn_settlement?` + `GrokBotAgentClientState`（unread_count, unread_thread_count, last_entry_*, notify_on_updates…）——roster Watch 推送，驱动侧栏角标/working/blocked 点。renderer 里 `agent.awaitingSessionIds` / `workingTaskSessionIds` / `runningSessionIds`（APP@299990 附近 `vfe`）即其投影。
3. **agent-tasks / subagents / async-tasks 事件族**（APP@451002–451070 查询族 + tasks store `noteTasksChanged → refresh`，APP@451005）：任务集变更 → `getAgentTasks` 重拉 → 侧栏折页重算。
4. **task-changed transcript 事件**（§1.3）：在**主会话流里**内联出现一条可点开的线程卡（仅 action=created 可见）——这是"worker 开了新线程"在用户眼前的唯一会话内呈现。
5. **OS 通知**（已逆 RE-sendmessage-ui §1.4，agent-done/needs-input 5s 轮询 diff）。

**没有**的：客户端本地跨 session 直接调用（如一个 session 的代码唤醒另一个 session 的代码）——一切会话间流转都在云端完成（temporal journal / workflow），客户端只消费 Watch 事件。`SendGrokBotAgentMessage`（PROTO@1179360）是 bot↔bot 通道：Request `{from_agent_id,to_agent_id,message_id,text,sent_at_ms,reply_to_id?}`，Response `{delivery(GrokBotAgentMessageDelivery), target_agent_id, target_name, workflow_id?}`，delivery 枚举（PROTO@912255）`DELIVERED_TEMPORAL / DELIVERED_BOX / DUPLICATE / TARGET_NOT_FOUND / FORBIDDEN / BOX_UNREACHABLE / TEMPORAL_UNAVAILABLE / INVALID_TARGET`。整棵 dist 无调用方（见 §4 表）。

### 2.4 中断与重置（跨 session 控制）

`interruptAgentRun({id, sessionId?})`、`startFreshConversation({id, sessionId?})`、`rollBackConversation({id, sessionId?})`（CRD@987457）都接受可选 sessionId——可精确打断某个 task 线程/DM 会话，而不是整个 agent。

---

## 3. ③ MessageSubagent / WakeParent 类工具的客户端痕迹

| 痕迹 | 位置 | 内容 |
|---|---|---|
| 工具名枚举（165 项） | CRD@936334–941470（`$e={...}`）、main-core@278963、DAEMON 同段 | `CheckSubagent / MessageSubagent / SendToAgent / WakeParent / StopSubagent / CreateAgent / CreateTask / ReadTask / UpdateTask / ReadAgentActivity / ReadTranscript / ReadTranscriptFile / SearchTranscripts / ReactToMessage / SendMessage / SetStatus / UpdateAgent…` 键值各一次 |
| tool-call 状态行 | APP `lO` 表（@1059420 起） | **只有 `SendToAgent`/`UpdateAgent` 有专属行**（APP@1061414）：verb=`sending`(SendToAgent)/`messaging`(UpdateAgent)，text=`Messaging <targetAgentName>` / `messaging_named` / 无名 `Messaging another assistant`，icon=`person-chat-bubble` 或 `{kind:'agent',agentId}`（从入参 `targetAgentName`/target 解析）。`CreateAgent / ReactToMessage / SendIMessage` 共用 `messaging`+`person-chat-bubble`。**MessageSubagent / WakeParent / CheckSubagent / StopSubagent / CreateTask / ReadAgentActivity / ReadTranscript / SearchTranscripts 不在表内 → 默认行 `working/Working/wrench`** |
| payload schema | **无** | PROTO 74 个 `*Args` 全部属于 Cursor 云 agent 工具集；跨 agent 的只有：`SendToAgentArgs|1 tool_call_id|2 agent_id|3 message|4 delivery|5 title|6 model?|7 tracked_task_keys*`（PROTO@401221，Success=`{worker_bc_id, delivered_as, message, recipient{kind:MAIN_BOT|PROJECT_SESSION,id,display_name}}`）、`CreateAgentArgs|1 tool_call_id|2 prompt|3 name?…|9 labels|10 environment_build_id?…|13 tracked_task_keys*|14 fork_from?|15 fork_turns?`、`CreateProjectArgs`、`ReadAgentTranscriptArgs|1 tool_call_id|2 agent_id|3 mode|4 max_turns`、`GetAgentStatusArgs|1 tool_call_id|2 agent_ids*`、`StopAgentArgs|1 tool_call_id|2 agent_id`、`SendMessageArgs|1 text(message)|2 attachment?|3 reply_to?|4 replace_previous_message?`、`SendToUserArgs|1 message`。**MessageSubagent/WakeParent/CheckSubagent 的 Args 不存在**（0.78.1 边界外，G18 R-06） |

---

## 4. ④「跨 session 处理」客户端机制清单（P6 第一批按此对表）

| # | 机制 | 客户端入口 | wire | 0.78.1 状态 |
|---|---|---|---|---|
| 1 | 从消息建线程 | 消息行 onCreateThread（gate sand_tasks×temporal×主会话）APP@3411325 | `createThreadFromMessage{entryId,agentId}` → 云 `CreateGrokBotThreadFromMessage` | 已逆（本报告） |
| 2 | 线程 = task 会话 `task:<id>[:<parent>]` | `ug/fg/dg` APP@409149 | sendPrompt.sessionId 改写 + taskId | 已逆 |
| 3 | 往线程发言 | composer 槽位 `sand:task\0…` APP@300692 | sendPrompt{sessionId:'task:…',taskId} | 已逆 |
| 4 | 回复/分叉 | openReplyTo + draft{replyToId,replySessionId,replyQuote,isFork} | sendPrompt{replyToId,replyQuote,isFork}；entry{replyTo,replyQuote,branched,authoredThreadRootId} | 已逆 |
| 5 | 线程发现 | task-changed(created) 卡 TCC + 侧栏折页 uMn/oMn + tasks overlay(DICrypK2, R-05) | transcript event + agent-tasks watch | 卡与折页已逆；overlay 归 R-05 |
| 6 | 线程打开/已读/完成 | openThread / markAgentTaskRead / markAgentTaskDone APP@447180+ | automations 域 4 方法 CRD@991365 | 已逆（reply 结构归 R-05） |
| 7 | 跨 agent 入站消息 | message entry fromAgent/toAgent/channel；Jpt 方向 APP@1733246 | transcript 流 | 已逆（呈现细节在 C2 message 卡，R-12f） |
| 8 | bot↔bot 直发 | 无客户端调用方 | `SendGrokBotAgentMessage`（delivery 枚举 + workflow_id）PROTO@1179360 | proto 已逆；调用方云端 |
| 9 | host 工具（SendToAgent/MessageSubagent/WakeParent/CheckSubagent/StopSubagent…） | 仅工具名枚举 + 默认/专属 tool 行 | Args 仅 8 个跨 agent schema（§3） | 名字+行已逆；payload 边界外 → R-06 |
| 10 | 子 agent 状态 | `GrokBotAgentLiveState{has_running_subagents,working_task_ids…}` + `GrokBotRunningSubagent{subagent_id,subagent_type,title,started_at_ms,fresh_until_ms}`(CRD@405549) + getSubagents/getAsyncTasks(Ft={id}) | roster/transcript watch + subagents 域 | proto 已逆；reply 结构归 R-05 |
| 11 | turn 完成通知 | 客户端无调用方 | `NotifySandAgentTurnFinished{agent_id,agent_name,message_preview,last_message_id,awaiting_user_response,member_agent_ids*,sender_agent_id,message_content_json}`（CRD@227383 / SandBox 服务） | proto 已逆；调用方云端（A21 维持） |
| 12 | 回滚/重开/打断 | 服务端 tray actions；rollBack/startFresh/interrupt 带 sessionId | CRD@987457 | 已逆 |
| 13 | session 列表 | desktop.listGrokBotAgentSessions（团队上下文，gate grok_bot_team_integration_enabled） | `GrokBotAgentSession` kind 9 值 | proto+映射已逆；消费面小（团队向） |
| 14 | reactions | fWt 乐观 toggle / RPC reactToMessage；Zve resync | §1.4 | 已逆 |

## 5. 复刻要点（P6 规格）

1. **不要发明独立 thread 实体**：P6 的"任务线程"直接建模为 task，sessionId 采用 `task:<taskId>[:<parent>]`，parent 只允许空或 `dm:<N>`。taskId 用 10 hex。云运行 id 若需要，`task-<id>-t<N|b>s<N>` 只用于反查 taskId。
2. `createThreadFromMessage` = `{entryId, agentId}` 一次性命令，reply 只有 refusal；新线程经 task-changed(created) 事件 + tasks 重拉出现在 UI。P6 服务端需要保证这个事件落地，否则客户端永远看不到新线程。
3. 发送进线程：sendPrompt 同时带改写后的 sessionId 和 taskId；journal/optimistic 用同一 sessionId 对账。
4. 回复 vs 分叉：draft 存 `replyToId+replySessionId+replyQuote+isFork`（replySessionId 仅客户端），上行只发 `replyToId+replyQuote+isFork`；entry 侧字段名是 `replyTo/replyQuote/branched`，线程根用 `authoredThreadRootId` 显式回填。
5. 工具行文案：SendToAgent → "Messaging <targetAgentName>"（无名字 "Messaging another assistant"）；MessageSubagent/WakeParent/CheckSubagent/CreateTask → 通用 "Working"（wrench）。P6-16 若要 coworker 式展示（Q-019），这层加值只能来自 host 侧（R-06），客户端现状就是默认行。
6. 门控组合照抄：建线程动作 = `sand_tasks && harness==='temporal' && !isGroup && composer 在主会话`；task-changed 可见行仅 action=created。
7. reactions：entry.reactions[{emoji,isMine,by}]，temporal harness 本地乐观 toggle + 断线 resyncEntry，非 temporal 直接 RPC。

## 6. 局限与未验证项

- 纯静态：未在 grok-r3 桩下出线程卡/reactions/roll-back tray 参照图（dispatch 说静态为主）。需要视觉值时按 RE-stub-boot 方法补，预计每张 0.5–2h。
- `t(\d+|b)s\d+`（turn/branch/step）语义是推断，客户端只用 `dg()` 提 id，没有展开。
- tasks/workspace overlay（DICrypK2）、getConversationOutline、getSubagents/getAsyncTasks 的 reply 结构属 R-05，本报告只登记 proto 形状与调用点。
- `kickstartAgent` 的 args 用了共享 schema 变量未定位（影响：无。非跨 session 关键路径）。
- host 侧行为（MessageSubagent/WakeParent payload、SendToAgent 真实入参来源、temporal journal 服务端语义）0.78.1 不可得，需 R-06（G18 源码）补。
- 云 proto 引用（SendGrokBotAgentMessage 等）在 coordinator/daemon 里也各有一份 service 表（CRD@787441、DAEMON@3689921），内容一致，未逐字段 diff 三份拷贝。
