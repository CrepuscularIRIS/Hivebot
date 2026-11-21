# RE-features · 0.78.1 多 bot / 多 session 客户端模型（BRIEF §6）

日期：2026-11-01 · 目标：`/dev/shm/grok-re/0.78.1/app/`（只读静态分析，未运行、未登录、未拉 host-bundle）· 0.18 对照物：原版 asar `/dev/shm/grok-re/0.18.0/app/` + 重建仓 `/home/lingxufeng/bot/repos/grok-bot-0.18-reconstructed/`（只读）
锚点判定统一 `grep -cF`，命中数写在锚点后。W0.5 归属：本文新发现按 owners.tsv 的 features 域收口，未改 owners.tsv（见 §6）。

## 0. 结论（先行）

1. **客户端 bot 模型是「一个 roster + 每 bot 一条 agent 记录」**：proto `GrokBotAgent`（35 字段，含 `harness`/`role`/`kind`/`member_agent_ids`）与 renderer roster 行（`MYn` 映射，含 `origin`/`harness`/`purpose`/`visibility`/`teamId`/`isGroup`/`memberIds`）两套形状。bot 的判别字段是 `harness`（实测值 `temporal`）与 `kind` 枚举 `GrokBotAgentKind=[UNSPECIFIED,AGENT,ROOM]`；群聊 = `kind=ROOM` 的 agent。
2. **「主 bot / 日常 bot 分工」存在，但不是 SuperAgent 结构**：0.78.1 有明确的 **Main Agent（Primary Bot）** 概念——box `Settings.main_agent_id` 持久化指针 + `getMainAgent`/`setMainAgent`/`ensureDefaultMainAgent` 三个 source 方法 + 云端 `SetGrokBotMainAgent`/`EnsureGrokBotDefaultMainAgent` RPC + agent 侧 `SetPrimaryBot` 工具 + 内部迁移 `InternalPrimaryBotMigration*`（`primary_agent_id` 字段）。除 main agent 外，特殊 bot 只有**保留 purpose 的工具型 bot**（`disk-saver`、`plugin-auth`）与运行时 subagent。**未发现**任何 SuperAgent/调度 bot 的类型枚举或角色字段（负证据见 Q1§4）。
3. **冷启动**：UI 配置走同步 IPC `sand:boot-snapshot-sync`；bot 列表先从本地 slice `roster.last-roster`（host-durable）恢复出「旧 roster」立即渲染，再由 source RPC `getServerAgentRoster()`（失败降级 `countAgents()`）拿权威列表；历史 transcript 先恢复 `transcript.replicas` slice，再 `getAgentTranscriptTail`/`openAgentTail` 拉尾页。所有 slice 落盘在 **main 进程 `userData/sand-client-persistence/`**（按 key 分 blob 文件、原子 rename、配额）。
4. **多 bot 流不串线**：一条 server-streaming RPC `WatchGrokBotTranscripts`（request 带重复 `cursors`，每游标 = `{agent_id, session_id, generation, after_updated_seq}`）多路复用所有会话；renderer 侧每个 `(agentId,sessionId)` 一个 replica（`replicaKey` + epoch + `transcript-live-range` fromSequence/throughSequence 覆盖区间），事件带路由戳（`{agentId,sessionId,ordered}`），无戳事件只落到当前 active agent。
5. 清单五项（跨会话消息/群聊/自动化/记忆/审批分级）在 0.78.1 全部有客户端证据；对照 0.18：群聊（isGroup/createGroup）、自动化、审批 ceiling 0.18 已有，Main Agent、跨会话引用 RPC、记忆 RPC、多游标 watch 是 0.78.1 新增。

---

## Q1. 客户端看得到的模型：bot / agent 配置 / session

### 1.1 proto message（主进程 `dist/electron-main/proto.cjs`）

| 锚点 | 形状 / 判定 |
|---|---|
| `proto.cjs#"GrokBotAgentKind"`（grep -cF=2） | 枚举 `[0 UNSPECIFIED,1 AGENT,2 ROOM]` —— bot=AGENT，群=ROOM |
| `proto.cjs#GrokBotAgent\|1 id 9` | 35 字段：id, legacy_agent_id, name, description, title, avatar_*(5), created/updated_at_ms, agent_id, **harness(str)**, **role(str)**, visibility, team_id, viewer_is_owner, viewer_session_id, **kind(#GrokBotAgentKind)**, **member_agent_ids 9\***(群成员), owner_display_name, people*, published_at, team_default_for_viewer, voice_*(3), viewer_can_manage, drafting_disabled, routine_policy, viewer_access, access_grants_only, viewer_allowed_actions*, suggestions*, access_owner_only |
| `proto.cjs#"GrokBotAgentSessionKind"`（=2） | `[UNSPECIFIED, MAIN, SLACK_DM, SLACK_THREAD, DM, GROUP, TEAMS_DM, TEAMS_THREAD, TEAMS_GROUP_CHAT]` —— session 分主会话/私聊/群聊/Slack/Teams 通道 |
| `proto.cjs#GrokBotAgentSession\|1 agent_id 9` | `{agent_id, session_id, kind, created_at_ms, updated_at_ms, last_activity_at_ms?}`（proto-fields.tsv 同形） |
| `proto.cjs#primary_agent_id`（=1） | `InternalPrimaryBotMigrationOwner\|...|5 primary_agent_id|6 migration_status`；同族 `PreviewInternalPrimaryBotMigration{Request,Response}`、`ExecuteInternalPrimaryBotMigration{Request,Response}`、`InternalPrimaryBotMigration{Owner,Outcome,ExecuteAggregate,PreviewAggregate}` —— 用户级「主 bot」指针的服务端迁移 |
| `proto.cjs#SetGrokBotMainAgent`（=1）、`proto.cjs#EnsureGrokBotDefaultMainAgent` | 云端 GrokBotService 的主 bot 写/保底建 RPC；**无 `GetGrokBotMainAgent`**（读走 box settings，见 1.3） |
| `proto.cjs#GrokBotAgentClientState\|1 agent_id 9`（coordinator 内嵌同形） | 每 bot 的阅后状态：last_viewed_at_ms, unread_count, last_activity_at_ms, last_entry_id...；写 RPC `SetGrokBotAgentClientState` |

### 1.2 renderer：类型字面串、store 键

- **roster 行形状**（renderer 侧 bot 模型）：`renderer/assets/index.eager-app-iGTgHP_Q.js#"function MYn(e){return{id:e.id,name:e.name..."` —— 字段全集：id,name,description,title,avatarShape/Color/Version/Photo,createdAt,updatedAt,path,lastEntry,lastMessageId,newestEntryId,hasUnread,unreadCount,unreadThreadCount,lastViewedAt,lastActivityAt,localActivityAt,awaitingUserResponse,notificationsEnabled,notifyOnUpdatesEnabled,isHiddenFromSidebar,isRemovedFromSidebar,voiceId/Speed/Language,**origin,harness,purpose**,visibility,teamId,published,isAccessGrantsOnly,isAccessOwnerOnly,viewerIsOwner,viewerSessionId,viewerCanManage,viewerAllowedActions,automationPolicy,isTeamDefault,ownerDisplayName,people,suggestions,**isGroup,memberIds**。
- **harness 值**：`index.eager-app-iGTgHP_Q.js#harness:\`temporal\``（grep -cF=1，全树唯一反引号值）；判定函数 `_me(e){return e.origin==='dev'||e.purpose!==void 0}`（origin 枚举在 coordinator：`["user","dev"]`）。roster 行过滤 `e.harness==='temporal'` 多处出现。
- **store 域**（`$().` 访问统计，eager-app）：experiments, mcp, messagesAccess, roster, grokBotPlugins, cloudAgents, grokBotVault, grokBotMessaging, voiceCall, usageSummary, localToolPermission, grokBotEmailInbox, desktopWindow, pageStage, credentials, agentTasks, updateStatus, machines, grokBotSecrets, computerUsePermissions, passkey, launcher… 另有 `mainAgent`（`$().mainAgent`，快照值 `{agentId, ownerJobRole}`）、selection（`{currentAgentId, currentSessionId, isLoadPending}`）、transcript（`snapshotsFor(agentId,{sessionId})`）。
- **durable/client slice 键**（持久化注册表，全 35 条枚举）：`roster.last-roster`(host-durable,v4)、`transcript.replicas`(host-durable)、`agent-tasks.last-thread-rows`(host-durable)、`cloud-agents.infos`、`sidebar.last-sections`、`selection.last-agent`、`agent-creations`、`roster.agent-avatars`、`ui-agent-refs`、`send-journal`…（client-persisted 多数）；key 前缀 `index.eager-app-iGTgHP_Q.js#sand.client.slice`（=1，格式 `sand.client.slice.account.<encodeURIComponent(slot)>.<slice>`）。
- **source 方法表**（`index.eager-app-iGTgHP_Q.js#roster:\`listAgents.countAgents...`）：roster 域 = listAgents,countAgents,searchAgents,resolveAgentCreation,getServerAgentRoster,**getMainAgent,setMainAgent,ensureDefaultMainAgent**,restoreTemporalAgentRouting,createAgent,createAgentFromTemplate,createGroup,setGroupMembers,updateAgent,seedConversationName,deleteAgents,kickstartAgent,interruptAgentRun,startFreshConversation,rollBackConversation,setAgentUnread,…；subagents 域 = `getSubagents`,`getAsyncTasks`。
- **Primary Bot 差异（客户端证据）**：
  - onboarding：`index.eager-app-iGTgHP_Q.js#notePrimaryBotCreated`（=1）——首次建 bot 即「主 bot 创建」打点；`ensureDefault` 分支错误文案 "Couldn't add Grok Bot"（`t.ensureDefaultMainAgent()` 后校验 outcome/agentId）。
  - 主 bot 指针存在 box settings：coordinator `node-agent-coordinator/main.cjs#Settings\|1 server_id 9`（grep -cF=1，`|9 main_agent_id 9?`）；`MainAgentRequest|1 agent_id` → `MainAgentResponse|1 settings #0`（读/写都走 settings）。
  - UI 特判：feature gate `sand_grok_main_agent`、`sand_grok_force_main_agent_selection`；`wwn({agent,isGateOn,hasTeam,mainAgent})` —— **能被邀请进 team 的只有限定条件下的 temporal 个人 bot，且已是 main agent 的排除**。
  - 其余「主 bot 专属行为」未见客户端分支（删除保护/固定排序等未发现，标未知）。

### 1.3 agent 侧工具面（harness 工具名枚举，main/coordinator/daemon/renderer 四处同表）

`electron-main/main-core.cjs#SetPrimaryBot`（在 `ae={AddMcpServer:...}` 工具名枚举内）：同表还有 `CreateAgent`、`MessageSubagent`、`CheckSubagent`、`SendToAgent`、`SendToUser`、`RecallMemory`、`ConvertToTeam`、`PublishToTeam`、`ClearGrokBotConnectorAlwaysAllow` 等 —— 多 agent 协作是 **运行时工具**（bot 动态建/管 subagent），不是静态 roster 角色。

### 1.4 附加问题：是否存在「主 bot（总控）与日常 bot 分工」

**结论：有「主 bot」无「总控 bot」。**

- 正证据（主 bot 存在）：§1.1–1.2 全部 Main Agent/PrimaryBot 证据。
- 特殊工具型 bot（保留 purpose，coordinator `node-agent-coordinator/main.cjs#"disk-saver","plugin-auth"`，grep -cF=1，`P8=["disk-saver","plugin-auth"]` 为保留值表）：`disk-saver` = 磁盘审计 bot（renderer 判定 `purpose==='disk-saver'` + 固定 description）；`plugin-auth` = 插件 OAuth 专用 bot（renderer `$jt()` 单例 launcher：找不到就 `launchNewAgent({purpose:'plugin-auth'})` 并以 initiator `plugin_setup` 发首条 prompt）。它们是**功能专用 bot**，不是调度者。
- 负证据（总控/SuperAgent 不存在，`grep -roF` 全 dist 树计数）：`SuperAgent`=0、`super_agent`=0、`superAgent`=0、`SUPER_AGENT`=0、`PersonalBot`=0、`DispatcherBot`=0、`mainBot`=0、`leaderBot`=0。`Orchestrator` 7 处均为：语音通话轮次账本（"the orchestrator started a response"，index.eager-platform-C2su3Zzb.js）与一条德语 i18n 文案 "Cloud-Agent-Orchestrator"（chunk-core-CGCrbga9.js），无 roster 角色/类型枚举对应。
- 群聊 ROOM、team bot（teamId/published/isTeamDefault）、temporal agent、subagent（getSubagents）、cloud agent 是平行的 bot 种类，客户端未见「某 bot 调度其余 bot」的结构字段。

---

## Q2. 冷启动链路（旅程④：重启后 renderer/main 从哪拿 bot 列表与历史）

时序（全部静态证据推演，标推定的仅 storage 归宿一行）：

1. **UI 配置（preload 期同步）**：`electron-preload/preload.cjs#sand:boot-snapshot-sync`（=1；`ipcRenderer.sendSync`）← main `electron-main/main-core.cjs#sand:boot-snapshot-sync`（handler 返回 experiments/theme/language/辅助技术/出口隧道开关）。只含 UI 配置，不含 roster。
2. **连接建立**：`preload.cjs#sand:coordinator-port-request` → main 建 MessageChannelPort 对（`exposeInMainWorld("coordinatorPort")`）；renderer 的 source/RPC 都走这条端口到 node-agent-coordinator（fork 链见 W05 owners.tsv）。
3. **本地恢复（先渲染旧数据）**：renderer 持久化注册表（`index.eager-app-iGTgHP_Q.js#function zYn(` 的 `restore`）：`registry.register({slice:'roster.last-roster',schemaVersion:4,scope:'host-durable'})` → `read(accountSlot)` → 校验 envelope/schemaVersion/corrupt → 恢复 rows；UI 状态位 `isShowingRestoredRoster`、`loadState:'loading'`、boot `status:'restoring'`。写路径：250ms 去抖（`roster-last-roster-write`）写回 `{rows}`。
4. **权威列表（RPC）**：first-run/冷启动门 `index.eager-app-iGTgHP_Q.js#function kBn(` → `e.source.getServerAgentRoster()`（返回 `{status, boxAgentCount, agents[]}`；异常降级 `countAgents()`）。coordinator 侧注册 `getServerAgentRoster`（`node-agent-coordinator/main.cjs#q("getServerAgentRoster")`）。roster 收敛条件 `hasCompleteRoster && hasSettledSources`。
5. **历史 transcript**：本地 `transcript.replicas` slice 恢复副本 → `getAgentTranscriptTail`/`openAgentTail`（reply 类型 `transcript-page`）拉尾页 → `WatchGrokBotTranscripts` 流接管（Q3）。sidebar 行缓存 `agent-tasks.last-thread-rows`（host-durable, v2）。
6. **main 本地落盘**（renderer slice 的真正归宿）：`window.desktop.readManyClientPersistence/writeClientPersistence/removeClientPersistence/listClientPersistenceKeys`（preload `preload.cjs#writeClientPersistence`=1 桥）→ main `electron-main/main-app.cjs#writeClientPersistence`（handler `e.clientPersistence.write`）→ `var KA=QUt(hu.default.join(Ge.app.getPath("userData"),"sand-client-persistence"),...)`（`main-app.cjs#sand-client-persistence`=1）：目录 `userData/sand-client-persistence/`，按 key 分 blob 文件（`blobName(key)` 摘要命名），`writeTextFile(mode:0600)+rename` 原子写，`maxValueBytes/maxTotalBytes` 配额（错误码 SAND-E0700/0701/0702，`main-core.cjs#client/persistence.ts` 目录名可证源文件名）。另有 localStorage 迁移路径（`hasMigratedClientPersistence`/`migrateClientPersistence`）。其余 main 本地文件（`electron-main/*.cjs` 枚举 34 个 json）：settings.json、window-state.json、gateway.json、host-token.json、local-exec-daemon 系列 8 个、local-tool-approvals.json、mcp-auth.json、sand-secrets.json/user-secrets.json、recreate-intent/resume.json 等——均不含 bot 列表/历史本体。
7. **host 内部存储（推定，一行）**：0.18 的 host 落盘是 `~/.sand/agents/<agentId>/` 每 agent 目录 + `node:sqlite` DatabaseSync（重建仓 `source/host/storage/agent-paths.ts`、`store-db.ts`，`resolveSandAgentDir`）；0.78.1 host 改为云端下发 bundle（W05 §6 硬证据），等价存储推定移到 host 侧 / `AgentStoreService` RPC（`ListAgentStores` 等 25 方法，W05-4-1..26），客户端不可见其落盘形态。

---

## Q3. renderer 如何同时订阅多个 bot 的流而不串线

（ipc-rpc Q3 报告未见落盘，本文独立回答；若其报告后结论冲突，以含运行证据者为准。）

- **协议层：单流多游标**。`WatchGrokBotTranscriptsRequest|1 cursors #0*|2 include_unlisted_agents 8?|3 inline_body_max_bytes 13`；游标 `node-agent-coordinator/main.cjs#Cursor\|1 agent_id 9\|2 generation 13\|3 after_updated_seq 4\|4 session_id 9`（grep -cF=1）。coordinator 实测组装：`ne=Y.map(De=>Lt(De.agentId,De.sessionId??rn))` + `watch({cursors:Y, includeUnlistedAgents:!0, inlineBodyMaxBytes})`，单 generator `yield*` 一条 ServerStreaming（response 带 `streamId`）。
- **watch 集合管理**：coordinator 按 `(agentId,sessionId)` 维护条目 Map，renderer 用 `noteMountedAgent({id})` / `noteTranscriptOpened({id,sessionId})`（source 方法表与 coordinator `I().args({id:dr,sessionId:T(y())})` 双侧同形）登记前台会话；条目有 `isForegroundOpened`、`backgroundJoinedAt`、`deferredReplacement`（切换时延迟替换，防抖）。
- **renderer 层：replica 隔离**。每个 `(agentId,sessionId)` 一个 replica：`replicaKey=vp(e)`，`expectedCoverageKind:'transcript-live-range'`（`fromSequence/throughSequence`），ingest 带 `epoch`、`throughSequence`、`attemptId`；事件先经 `L7(e)` 分类——**无戳（unstamped）事件只应用给 activeAgentId**，`unrouted` 丢弃，有戳事件按 `{agentId,sessionId,ordered}` 落到对应 replica；snapshot 与 event 用 coverage 区间判定可不可丢。roster 本身也是一个 replica（`expectedCoverageKind:'complete-roster'`，`applyEvent` 按 `event.agent.id` upsert，temporal 行单独过滤）。
- **调度层**：coordinator 把方法分档 `person`/`background`（`MD={...}` 表，`dispatchCommand`→`Z2(method,demand)` 命中 person 才走 `dispatchPersonCall`（=1），必要时先 `requestBoxIntent({})` 再派发）——与串线无关，但决定了「用户在场语义」的调用路径。

---

## 4. 清单表（Q-003 定稿：清单级）

| 项 | 位置（锚点，grep -cF 均命中） | 一句话说明 | 0.18 对照 |
|---|---|---|---|
| 跨会话消息 | `proto.cjs#CreateGrokBotThreadFromMessage`（=1，Request=`{agent_id, entry_id}`）；renderer transcript 行 `replyToId/replySessionId/replyQuote/isFork`（eager-app `jp(e)` 解构）；slice `send-journal`(v3)、`agent-tasks.last-thread-rows`；工具 `SendToUser`/`SendToAgent` | 一条 entry 可引用另一 session 的消息（replyQuote 跨 session 解析 `findEntrySessionId`/`resolveReplySessionId`），可从消息分叉新线程；外发走 send-journal 队列 | `CreateGrokBotThreadFromMessage` 0.18 全树 0 命中（新增）；0.18 renderer 已有 reactToMessage/send-journal 未见（未逐一验证，标未知） |
| 群聊 | `proto.cjs#GrokBotAgentKind`（ROOM）；`proto.cjs#CreateGrokBotRoom`/`AddGrokBotRoomPeople`/`CancelGrokBotRoomMemberTurn`；source `createGroup`/`setGroupMembers`；roster 行 `isGroup/memberIds`；gate `grok_bot_multiplayer`；transcript 分组 `agent-comm-group` | 群聊 = `kind=ROOM` 的 agent（member_agent_ids + people + human_member_user_ids），成员 bot+人，成员轮次可取消 | 0.18 renderer 已有 `createGroup`/`setGroupMembers`/`isGroup`(103)/`memberIds`(18)（本地群）；0.18 无 Room 系列 RPC（服务端群是新增） |
| 自动化 | source 域 `automations:`（getAgentAutomations/create/delete/runAgentAutomationNow/runAutomationWebhook/getAutomationWebhookCredential/getAgentTasks…）；proto `GrokBotAgentAutomation\|1 automation_id\|2 record_json\|3 viewer_permissions`；UI chunk `chunk-automation-detail-panel-*`；recurrence `daily/weekly/monthly/yearly`（eager-app `w3e`） | 每 bot 的自动化规则（record_json 存储）+ webhook 触发 + 定时任务列表（agent-tasks），日程递归枚举在客户端 | 0.18 renderer 已有 `createAgentAutomation`/`getAgentAutomations`/`runAgentAutomationNow` 与 automation UI（onOpenAutomationDetail）；0.18 无 webhook credential 面（本次未逐一验证 webhook，标未知） |
| 记忆 | RPC `proto.cjs#ListGrokBotUserBotMemories`（=1，Request=`{agent_id}`，Response=`memories #0*`）；message `GrokBotMemoryFact\|1 fact_id\|2 text\|3 learned_at_ms`、`GrokBotMemoryFolder\|1 profile\|2 logs`；工具 `RecallMemory`；UI chunk `chunk-team-bot-memories-list` | 每 bot 的记忆事实列表（fact_id/text/learned_at）+ profile/logs 文件夹，只读列出到 UI；写入在 agent 侧 | 0.18 无 `ListGrokBotUserBotMemories`（0 命中）；0.18 有 agent 侧 memory-synthesis（错误码 memorySynthesis*，memory-synthesis-service.ts）——0.78.1 增加客户端可见列表 |
| 审批分级 | 枚举 `proto.cjs#"LocalToolPermissionCeiling"`（=2，`[UNSPECIFIED,NEVER,ASK,ALWAYS]`）；`GrokBotLocalToolPermissionCardResolution=[...,APPROVED,DENIED,ALWAYS]`；RPC `ResolveGrokBotLocalToolPermission`/`ResolveGrokBotAutoReviewApproval`/`ResolveGrokBotVirtualCardApproval`/`BeginGrokBotSpendApproval`+`FinishGrokBotSpendApprovalAssertion`（`SpendApprovalCeremonyMode=[ASSERT,REGISTER]`）/`Get|SetGrokBotMcpToolPermissions`/`ClearGrokBotConnectorAlwaysAllow`；renderer `resolveLocalToolPermission/resolveAutoReviewApproval/resolveConnectorGrant/resolveMessagesGrants`（source approvals 域）；本地 `local-tool-approvals.json`；`GrokBotToolPermissionPolicy\|1 tools\|2 reads\|3 writes` | 分层：本地工具许可 ceiling（NEVER/ASK/ALWAYS 档位 + 卡片 APPROVED/DENIED/ALWAYS）→ autoReview 审批 → 连接器/Messages 授权 → 虚拟卡/花费仪式（assert/register）；always-allow 可清除 | 0.18 已有 `resolveAutoReviewApproval`/`resolveLocalToolPermission`（renderer approvals 域）与 `LocalToolPermissionCeiling` 枚举名（main.cjs）；0.18 无 SpendApproval/VirtualCard/McpToolPermissions 面（`SpendApproval` 0.18 全树 0 命中） |

---

## 5. 与 0.18 的结构性对照（Q1–Q3 维度）

| 维度 | 0.18（原包+重建仓） | 0.78.1 |
|---|---|---|
| bot 列表来源 | renderer `listAgents()` + epoch/highWater 重同步（`index-lA9cgT4O.js` `e.listAgents().then(...)`） | 本地 slice 恢复 + `getServerAgentRoster()` + `WatchGrokBotTranscripts` 推流 |
| 主 bot | 无（`getMainAgent`/`PrimaryBot` 0.18 全树 0 命中） | box settings `main_agent_id` + get/set/ensure 三方法 + 云端 Set/Ensure RPC + `SetPrimaryBot` 工具 + 内部迁移 |
| 流订阅 | 未见多游标 watch（`WatchGrokBotTranscripts`/Cursor 0 命中；推流机制属 ipc-rpc 主题，未验证） | 单 ServerStreaming 多游标 + replica 路由戳 |
| session 模型 | 未枚举 SessionKind（0 命中） | `GrokBotAgentSessionKind` 8 值（含 Slack/Teams 通道） |
| host 存储 | `~/.sand/agents/<id>/` + node:sqlite（重建仓 storage/，推定原版同构） | host 云端下发（W05）；客户端只见 AgentStoreService RPC |
| 群/自动化/审批 | 群（本地）、自动化、审批 ceiling 已有 | 全部保留并服务端化（Room RPC、webhook、Spend/Mcp 审批新增） |

---

## 6. W0.5 归属对照

本文深挖的入口均在 owners.tsv features 域已有 id（W05-2-209 chunk-session、W05-2-46 cloud-agent-card、W05-4-* proto 方法/message 等）。新触达且需要归属判断的事实（均为 bundle 内部符号，非新入口文件）：`main_app.cjs#"sand-client-persistence"`（建议归 features，冷启动落盘）、`preload.cjs#"sand:boot-snapshot-sync"`（建议 ipc-rpc 或 features，本次按 features 使用）、coordinator `MD` persona 表与 `WatchGrokBotTranscripts`（已由 ipc-rpc Q1/Q3 兜底覆盖，不改判）。未改 owners.tsv；如需补行，规则改动在 w05.py 复跑。

## 7. 局限与未验证项

- **全部静态**：未运行、未登录、未抓包；「冷启动时序」是代码路径推演，boot 顺序（snapshot-sync → coordinator-port → slice restore → RPC）中各步的实际先后未运行验证。
- **minify 限制**：renderer bundle 无源映射，`MYn`/`zYn`/`kBn`/`TZn` 等为 minified 名，字段名可信（对象字面量键），控制流细节（如 `wwn` 的完整调用图）未展开。
- **客户端边界内的未知**（明确列出）：(a) `GrokBotAgent.role`（proto 字符串字段）的取值集——renderer 未见赋值/比较，服务端语义不可见；(b) main agent 是否有删除保护/固定排序等 UI 特权——只找到 team 邀请排除与 onboarding 打点；(c) `dispatchPersonCall` 的完整重试/park 语义（catch 分支未展开）；(d) `getServerAgentRoster` 的服务端聚合逻辑（boxAgentCount 与 agents 的合并规则）；(e) 0.18 的 transcript 推流机制（ipc-rpc 主题，本次只做了 0 命中负检索）。
- 0.18 对照物是 win-x64 Setup.exe（平台差，W05 §7）；重建仓仅用于 host storage 推定，其「重建」性质意味着该行标注推定而非原版实测。
- owner 判定未改动；本文引用的 coordinator/daemon 内嵌 proto 副本（W05 §3 局限所述 1514/1177 条）未逐条比对与 proto.cjs 的一致性，仅抽查（GrokBotAgentClientState、Cursor、Settings 同形）。
