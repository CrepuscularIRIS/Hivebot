# RE-ipc-rpc · 0.78.1 进程拓扑 / renderer 可调用面 / 流式事件

日期：2026-11-01 · 输入：`/dev/shm/grok-re/0.78.1/app/`（897 文件）、`/dev/shm/grok-re/0.18.0/app/`（726 文件）、`/dev/shm/grok-re/w05/{owners,proto-fields}.tsv`、`work/p1-re/RE-w05.md` · 全静态分析，未运行应用、未拉 host-bundle、未登录。

## 结论（先行）

1. **拓扑仍是 renderer→preload→main→coordinator→(host|云端)**，但 host 位置变了：0.78.1 不再本地带 host bundle（0.18 有 `dist/host/` 27MB），host 只在云端 box 里跑。桌面端剩 4 类进程：electron-main（main.cjs→main-app/main-core/proto/onepassword-connection-service）、node-agent-coordinator（utilityProcess fork）、local-exec-daemon（+新增 messages-worker）、renderer（6 个 preload）。**MCP/消息执行进程归 main 还是 host，按派发不在本题。**
2. **host 交付**：S3 `public-asphr-vm-daemon-bucket/sand-host-bundle`（us-east-1）→ box 内 supervisor 文件协议目录 `/tmp/sand-supervisor/`（`incoming-host-bundle.tgz` + `command.json`/`status.json`/`acks`）→ host 安装位 `/opt/sand/sand-host/host-main.cjs`（0.18 为 `/home/box/sand-host/host-main.cjs`）。**解包/启动者是 box 内 supervisor（不在桌面产物里）**；桌面 main-app.cjs 只残留同源 constants 模块。桌面 app 无任何本地 host 启动代码（负证据见 §2.3）。
3. **renderer 可调用面 = 三层**：
   - contextBridge 10 个键 + **11 条裸 IPC 通道**（preload.cjs）+ 动态 `dune-rpc:{edge}:{m|e|probe}` 通道族；
   - **main 边 dune-rpc 方法 431 个**（唯一名；0.18 为 117 个，前缀 `sand-rpc:`）；
   - **coordinator 端口 RPC 146 个**（协议 v3；0.18 为 85 个、v1）。云端 RPC（proto.cjs 7 服务 604 方法）renderer 不可直达，由 main/coordinator 代调。
4. **流式**：MessagePort 上的 JSON 帧（lifecycle/request/cancel/reply/event，protocolVersion 3）+ 事件族（transcript 等 29 族）；云端一**条** `WatchGrokBotTranscripts` ServerStreaming（SSE，connect 协议）按 per-agent cursor 多路复用全部 bot；断线由 SSE 重连退避 + `replay` 行补发 + coordinator 进程自动重启 + renderer 发送 journal（nonce 去重 + GetGrokBotSendStatus 补偿）兜底。
5. **旅程①「每个 bot 选 agent 配置」不存在**（新·复刻自建）：Create/Update GrokBotAgentRequest 均无 model/prompt/config 字段；0.18 的 `getAgentDefaultModel/setAgentDefaultModel/getAvailableModels` 在 0.78.1 已删（负证据 §5 J1）。

---

## 1. 证据目录（锚点均为 `grep -cF` ≥1 实测；路径相对各自解包树根）

| # | 锚点（0.78.1 树） | 用途 |
|---|---|---|
| A1 | `dist/electron-preload/preload.cjs#"exposeInMainWorld(\"coordinatorPort\")"` | contextBridge 键（另 desktop/sandPopout/sandRenderTrace/desktopMount/__duneReliability/__duneRenderTraceSampleRate） |
| A2 | `dist/electron-preload/preload.cjs#"sand:coordinator-port-request"` | renderer 向 main 要 port（invoke） |
| A3 | `dist/electron-preload/preload.cjs#"dune-rpc:${e}:m:${t}"` | main 边方法通道名构造（`dune-rpc:<edge>:e:<ev>`、`dune-rpc:<edge>:probe` 同段） |
| A4 | `dist/electron-preload/preload.cjs#"sand:boot-snapshot-sync"` | 冷启动 sendSync 快照 |
| A5 | `dist/electron-main/main-app.cjs#"node-agent-coordinator","main.cjs"` | coordinator 入口路径拼接（`$lt()`） |
| A6 | `dist/electron-main/main-app.cjs#"coordinator-renderer-port"` | main 把 renderer port 转交 coordinator（`{channel:"coordinator-renderer-port"}`+port） |
| A7 | `dist/electron-main/main-app.cjs#"sand-node-agent-coordinator"` | utilityProcess fork serviceName（`cGn`） |
| A8 | `dist/electron-main/main-app.cjs#"incoming-host-bundle.tgz"` | host bundle 落盘常量（constants 残留，见 §2.2） |
| A9 | `dist/electron-main/main-core.cjs#"sand-local-exec-daemon"` | daemon 服务名常量 `rD` |
| A10 | `dist/node-agent-coordinator/main.cjs#"coordinator-renderer-port"` | coordinator 侧收 port（`iz()`） |
| A11 | `dist/node-agent-coordinator/main.cjs#"--bootstrap="` | coordinator 启动参数（argv JSON，processConfig={appVersion,isPackaged,dataDir}） |
| A12 | `dist/node-agent-coordinator/main.cjs#"sendPrompt:I().args(Jne)"` | coordinator 服务表 `nse`（与 renderer 表 `Id` 逐名相等） |
| A13 | `dist/node-agent-coordinator/main.cjs#"{channel:\"forever-box\""` | gateway SSE 事件 channel 解析 |
| A14 | `dist/electron-main/main-app.cjs#"performServerAgentAction:C().args(mlt)"` | coordinator→main 控制边（server-agent 动作白名单 62 方法） |
| A15 | `dist/electron-main/main-app.cjs#"case\"sendPrompt\":"` | main 内 sendPrompt→SendGrokBotUserMessage 分发（`Syt`） |
| A16 | `dist/electron-main/proto.cjs#"{name:\"SendGrokBotUserMessage\",I:"` | 云端 RPC 核验（另 WatchGrokBotTranscripts/CreateGrokBotAgent/ListGrokBotAgents/SetGrokBotAgentPlugins/Get+SetGrokBotAgentPlugins/RespondGrokBotWidget/ResolveGrokBotLocalToolPermission/ListGrokBotAgentSessions/UpdateGrokBotAgent/SetGrokBotAgentClientState/List+CommitGrokBotTranscriptEntries/GetGrokBotSendStatus/EnsureGrokBotDefaultMainAgent 均 =1） |
| A17 | `dist/renderer/assets/index.eager-app-iGTgHP_Q.js#"var Id={"` | renderer 端 coordinator 方法表（146 方法，含 args/reply 类型） |
| A18 | `dist/renderer/assets/index.eager-app-iGTgHP_Q.js#"protocolVersion:3"` | renderer 端口协议 v3（帧收发 `Z3n`） |

0.18 对照锚点：`dist/electron-preload/preload.cjs#"sand-rpc:${edge}:m:${method}"`、`#"MAIN_METHOD_TABLE"`、`#"sand:mcp-install"`、`dist/node-agent-coordinator/main.cjs#"COORDINATOR_PROTOCOL_VERSION = 1"`、`#"classifyBaseUrlKind"`、`dist/renderer/assets/index-lA9cgT4O.js#"getAgentTranscriptTail:{args:\"object\",reply:\"transcript-page\"}"`、`dist/host/host-main.cjs#"SAND_SUPERVISOR_STAGED_BUNDLE_PATH"`、`#"SAND_BOX_HOST_ENTRY"`。

## 2. Q1 进程拓扑与 host 交付

### 2.1 进程图（全部静态证据）

```
renderer (index.html + index.eager-*.js, 697 files)
  │ contextBridge 10 键 / 裸 IPC 11 通道 / dune-rpc 动态通道
  ▼ preload.cjs (5 键) + 5 专项 preload
electron-main: main.cjs → main-app.cjs(3.4MB) / main-core.cjs / proto.cjs(1.4MB) / onepassword-connection-service.cjs
  │ A5+A7: utilityProcess.fork("../node-agent-coordinator/main.cjs",{serviceName:"sand-node-agent-coordinator"})
  │ bootstrap: postMessage({bootstrap:{processConfig}},[控制port, renderer数据port, main数据port])
  ▼
node-agent-coordinator/main.cjs (1.2MB, 内嵌完整 GrokBotService 414 方法副本)
  ├─ gateway（HTTPS SSE 下行 + POST 上行）→ 云端 box 里的 host（box harness bot）
  ├─ connect RPC（baseUrl 动态注入）→ 云端 GrokBotService（temporal harness bot）
  └─ coordinator-control 边（回 main）：resolveGatewayConnection / performServerAgentAction / spawnLocalExecDaemon ...
electron-main → local-exec-daemon/main.cjs（fork，服务名 A9；本机消息/语音等 local tools）
local-exec-daemon → messages-worker.cjs（0.78.1 新增 worker）
```

- coordinator 崩溃自愈：`qlt` 在 `processExited` 后按退避重启并重发 renderer ports（`main-app.cjs#"onLaunchRetired"` 同段），transport 事件带 generation 去重（`"transport-connected"`）。
- main 服务的全部 dune-rpc 边：`main-app.cjs` 内 `jo("gateway") / jo("coordinator-main") / jo("coordinator-control") / jo("desktop-mount") / jo("desktop-mount-capture-overlay") / jo("sand-dev") / jo("main") / jo("box-vnc")`（`jo("main"` grep=1）。

### 2.2 host 交付（incoming-host-bundle.tgz 谁解包谁启动）

- 0.78.1 `main-app.cjs`@22250-23000 constants（与 0.18 `host-main.cjs` 内 `../packages/constants/dist/sand-supervisor.js` 模块逐字同源，仅安装位不同）：
  - S3：`"public-asphr-vm-daemon-bucket"` + `"us-east-1"` → `https://<bucket>.s3.us-east-1.amazonaws.com/sand-host-bundle`（对象名 `MCe="sand-host-bundle"`，渠道 `["latest","stable","dogfood"]`）。
  - supervisor 目录 `/tmp/sand-supervisor`：`command.json`(+`.part`)、`status.json`、`acks/`、`incoming-host-bundle.tgz`(+`.part`)、`desktop-health.json`。
  - host 安装位 `/opt/sand/sand-host/host-main.cjs`、`/opt/sand/sand-host/version`；数据根 `/home/box/sand-data`（用户名 `box` ⇒ 云 box VM 内）；升级标记 `.sand-host-upgrade.json`。
- 0.18 host-main.cjs 的 `buildSandSupervisorCommand`（`kind:"upgrade"`+`bundlePath`）证明升级指令由 **box 内 supervisor** 读取 command.json、解包 tgz 到安装位并重启 host；host 自身只下载 staging（`hostBundleAutoUpdateEnabled`，`SAND_HOST_IN_BOX==="1"` 分支旁证）。
- **谁下发**：0.18→0.78.1 交付模型未变（S3+supervisor），变的是**桌面不再随包带 host**：0.78.1 树无 `dist/host/`（W05 §6 已证），main/coordinator/daemon bundle 内 `host-main.cjs`、`/opt/sand`、`/tmp/sand-supervisor` 均为 0 命中（`grep -cF` 实测，仅 main-app.cjs constants 段各 1 次）。

### 2.3 host 有没有本地模式？

- 0.18：**有实物**（`dist/host/` 5 文件 27MB 随 asar 分发），coordinator `classifyBaseUrlKind` 区分 `loopback`（本地 host）与 `pod_proxy`（box）；main.cjs 只做 host 进程探测（`isSandHostProcess`，`/proc/<pid>/cmdline` 含 `"host-main"`），未见由 main 拉起 host 的代码 ⇒ 0.18 本地 host 由外部/独立方式运行，桌面默认走 box。
- 0.78.1：**无本地 host 产物、无启动代码**（负证据：全树 `grep -F 'dist/host'` 0；fork 目标只有 coordinator/daemon/1Password 服务）。coordinator 仍保留 `loopback`/`pod_proxy` 分类与集群表 `["dev4","us8"]`（`EK=[\"loopback\",\"pod_proxy\",\"unknown\"]`），即**代码层未封死本地网关（dev 用）**，但发行产物内无 host 可跑——判「改：本地模式从"带产物"退化为"仅代码兼容"」，dev 态是否可跑未验证（局限）。

## 3. Q2 renderer 可调用面（全量）+ MVP 最小面

### 3.1 面总览（计数均为脚本实测）

| 面 | 数量 | 0.18 对应 | 备注 |
|---|---|---|---|
| contextBridge 键 | 10：desktop / sandPopout / coordinatorPort / sandRenderTrace / desktopMount（preload.cjs，后两个含条件键 __duneReliability、__duneRenderTraceSampleRate）+ desktopMount、desktopMountFiles（panel preload）+ desktopMountCaptureOverlay（overlay preload） | 2（desktop、coordinatorPort）+ dev-controls 键 `sand`（0.78.1 删） | preload-vnc/webview 无 exposeInMainWorld，走 MessageChannel |
| 裸 IPC 通道（preload.cjs） | 11：`sand:coordinator-port-request`(invoke) / `sand:coordinator-port`(on,附 port) / `sand:boot-snapshot-sync`(sendSync) / `sand:encode-png`(on+port) / `sand:render-trace-port`(postMessage) / `sand:renderer-alive` / `sand:renderer-boot-gate-landed` / `sand:renderer-boot-gate-opened`(send) / `sand:main-edge-served`(once) / `sand:network-online`(online 事件转发) / `dune:reliability-report`(send) | 0.18 为 **57 条 flat 通道**（sand:mcp-*、sand:secrets-*、sand:report-* 等，preload.cjs 字面量去重计数） | 大收缩：功能面搬进 dune-rpc 方法 |
| 专项 preload 通道 | avatar-source 1（`sand:avatar-source`）、webview 4、vnc 10 | 同类保留 | computer-use/VNC 专用，非 MVP |
| main 边 dune-rpc 方法 | **431**（声明在 preload `mm=Ce("main",…)` 6 组并集；434 处声明、3 重名） | 117（`sand-rpc:main:m:`） | 见 §3.2 |
| coordinator 端口 RPC | **146**（协议 v3，帧+reply 容器校验） | 85（v1） | 见 §3.3 |
| 云端 RPC（proto.cjs） | 7 服务 604 方法：GrokBot 414 / Dashboard 84 / SandBox 55 / AgentStore 25 / BackgroundComposer 10 / Ai 8 / Analytics 8 | 5 服务 882 | renderer 不可直达 |
| main 服务的其他边 | coordinator-main、coordinator-control（31 方法，A14）、gateway、desktop-mount×2、sand-dev（dev-only，`main-core.cjs#"preload-sand-dev.cjs"` 双门槛）、box-vnc | 0.18 有 coordinator-main 表 | — |

### 3.2 main 边 431 方法（通道 `dune-rpc:main:m:<m>`；preload 声明 `m:n().args(...)` ×main-app 声明+handler 双侧核验）

按 preload 6 组归类（组名=minified 变量）：`iet/uwn`（账户·登录·passkey·用量·team·计费·语音·报表 report*·通知·窗口·偏好·更新·附件·实验/experiments·passkey ceremony 等 114）、`OEt/r6n`（Grok Bot team/automation/teams-app/slack/vault/messaging/email/template/marketplace 主-edge 镜像 98）、`gd/fg`（MCP+secrets+credential provider+1Password+finance+computer-use 权限+messages 权限 147）、`h6n`（市场安装：`installEntry/updatePluginInstall/removeMcpServer/uninstallPlugin/reconcileUnpublishedPlugin/getMcpState/getMcpCatalog/refreshMcpCatalog/...` 72）、`KEt/u6n`（transcribe/dictation/synthesizeSpeech/stageVisualizationDocument 70）、`rbt`（tailnet 4）。完整 431 名单脚本产物：`/dev/shm/grok-re/ipcrpc/`（方法名可由 preload.cjs 复提，命令见局限 §7）。

### 3.3 coordinator 端口 146 方法（帧协议 §4；renderer 表 A17 ≡ coordinator 服务表 A12，逐名 diff=0）

- **bot/会话**：createAgentFromTemplate、resolveAgentCreation、restoreTemporalAgentRouting、noteMountedAgent、noteTranscriptOpened、getServerAgentRoster、getAgentTranscriptTail、openAgentTail、sendPrompt、promptAcceptanceStatus、respondToWidget、resolveAutoReviewApproval、resolveLocalToolPermission、resolveConnectorGrant、resolveMessagesGrants、resolveVirtualCardApproval、beginSpendApproval、controlOutboundCall、getMainAgent、setMainAgent、ensureDefaultMainAgent、searchPlacesArea、dismissWidget、sendDraft、discardDraft、submitSecret、submitUserForm、dismissUserForm、reactToMessage、createThreadFromMessage、voteFeedback、seedConversationName、deleteAgents、kickstartAgent、interruptAgentRun、startFreshConversation、rollBackConversation、listAgents、countAgents、searchAgents、searchMedia、createAgent、createGroup、setGroupMembers、updateAgent、setAgentUnread、setAgentHiddenFromSidebar、setAgentNotifyOnUpdates、setAgentDraftingDisabled、setAgentVoice、previewVoice、setAgentAvatarBytes、getAgentAvatar。
- **模板/发布**：publishBotTemplate、getBotTemplateVersion、getBotTemplateForSourceAgent、getBotTemplateExportPolicy、deleteBotTemplate、setBotTemplateVisibility、getPublicBotTemplate(0.18 已有 → 现在 coordinator 表)、publishSkill/resyncPublishedSkill/unpublishSkill/unpublishPluginListing/hasRestorablePluginListingCopy/getSkillPublishTargets、syncPluginSkills、skillsCatalog、getPluginSyncStatus。
- **云 agent（apps）**：getCloudAgentInfo/Conversation/TranscriptTail 相关、stopCloudAgent、getCloudAgentPublishProposals、listCloudAgentPublishedApps、confirm/dismissCloudAgentPublishProposal、updateCloudAgentPublishApp、get/set/tellCloudAgentAppSecrets、unpublishCloudAgentPublishApp、createCloudAgentAppsGateTicket、completeGithubConnect、getListenerIntegrations、getListenerConnectUrl。
- **MCP（盒侧）**：readMcpAppResource、callMcpAppTool、getMcpState、getMcpCatalog、getMcpPluginLogo、removeMcpServer、authenticateMcpServer、renameMcpAccount、removeMcpAccount、setMcpCustomInstructions、listMcpServerTools、toggleMcpToolDisabled（注意：`installEntry/updatePluginInstall/getEffectivePlugins` **不在**此表，是 main 边方法）。
- **工作流/任务/自动化**：getAgentWorkflows、create/update/deleteAgentWorkflow、runAgentWorkflowNow、importAgentWorkflowText/Url、getConversationOutline、readMainAgentContext、getSubagents、getAsyncTasks、getAgentTasks、markAgentTaskDone/Read、setAgentTaskPinned、dismissAgentSuggestions、getAgentAutomations、getAutomationWebhookCredential、runAutomationWebhook、listAllAutomations、setAgentAutomationEnabled、create/update/deleteAgentAutomation、runAgentAutomationNow。
- **box/host/tray/杂**：getHostStatus、updateHostNow、getForeverBoxStatus、ensureForeverBox、handBackForeverBox、getBoxSecretsStatus、getTrays、dismissTray、clearTrays、getAgentChannels、connectChannel、disconnectChannel、refreshChannel、transcribeAudio、generateAgentAvatarImage、nudgeVoiceCall、recordVoiceCall、setVoiceCallPresence、getVoiceCall、isEgressTunnelAvailable。

**双路径关键结构**：62 个 coordinator 方法（sendPrompt、createAgent、getServerAgentRoster、respondToWidget、resolveLocalToolPermission 等，白名单 A14）在 server 路由时由 coordinator 经 `coordinator-control.performServerAgentAction({method,args})` 回到 **main** 执行云端 RPC（A15 switch：sendPrompt→SendGrokBotUserMessage、promptAcceptanceStatus→GetGrokBotSendStatus、interruptAgentRun→Interrupt…、startFreshConversation→StartFresh…、rollBackConversation→RollBack…）；box 路由时走 gateway 命令（coordinator 内 `commandPolicies={sendPrompt:…}`）。路由按 agent harness：temporal→server，box→gateway（`isServerRouted`、`legacyServerActive`、`mirrorGateway:!0` 旁证；运行时判定逻辑静态未完全展开，见局限）。

### 3.4 MVP 最小面 · 四旅程

通用跳（每旅程第一跳均含）：renderer→preload `coordinatorPort.claim`（A1/A2）→ main `ipcMain.handle("sand:coordinator-port-request")`（`assertTrustedRequester`+`postMessage("sand:coordinator-port",[port])`）→ main `attachRendererPort` 转 coordinator（A6）→ coordinator `--bootstrap`（A11）后对 port 发 `{kind:"lifecycle",phase:"ready",protocolVersion:3}` → renderer `Z3n` 进入 serving（A18）。main 边调用跳 = `ipcRenderer.invoke("dune-rpc:main:m:<m>")` → main-app `Jhn` 分发（trust 校验+args 校验+handler）→ `{ok,value}`/`{ok:false,failure}` 信封返回。

#### J1 建 bot→发消息→收流式回复（方法 7）

| 跳 | 调用方锚点 | 方法/通道 | 处理方锚点 | 返回/事件 |
|---|---|---|---|---|
| 1 | renderer `index.eager-app…js#"ensureDefaultMainAgent()"`（首次主 bot）或 `#".createAgent({name"`（harness:`vm=\"temporal\"`） | ensureDefaultMainAgent / createAgent | coordinator 表 A12（server 路由→main A14→云端 `{name:"EnsureGrokBotDefaultMainAgent",I:` / `{name:"CreateGrokBotAgent",I:`） | record：GrokBotAgent（字段引 proto-fields.tsv 行 `GrokBotAgent\|`） |
| 2 | `#"w.sendPrompt({agentId:K,prompt:T"` （composer 主路径，含 `sessionId`/`richText`/`attachments`/`replyToId`） | sendPrompt | coordinator `nse`（demand=person；双路径见 §3.3） | reply=`send-result`（SendGrokBotUserMessageResponse：`1 dispatched 8\|2 mode\|4 delivery\|5 refusal`，delivery∈ACCEPTED_BOX/ACCEPTED_TEMPORAL/DUPLICATE/REFUSED，A15） |
| 3 | renderer transcript store `#"transcript.snapshotsFor"`（per agentId+sessionId） | 事件族 `transcript` | coordinator `Ce.postEvent(\"transcript\",…)`（云 Watch 行 + gateway channel 双源） | GrokBotTranscriptWatchFrame（rows/cleared/turn_failed/…） |
| 4 | `#"promptAcceptanceStatus("` | promptAcceptanceStatus | 同跳 2 | GetGrokBotSendStatus（重发去重补偿） |
| 5-7 | `#"getServerAgentRoster()"`、`#"listAgents("`、`#"noteMountedAgent({` | getServerAgentRoster / listAgents / noteMountedAgent | coordinator（roster→云端 ListGrokBotAgents/SetGrokBotAgentClientState） | roster 快照 / array / void |

**「每个 bot 选 agent 配置」= 新（复刻自建）**。负证据：① proto-fields.tsv `CreateGrokBotAgentRequest|1 legacy_agent_id…|9 harness #0|10 kickstart_requested…` 与 `UpdateGrokBotAgentRequest|1 id 9|2 name 9?|3 description…|9 partial_update 8?` 全字段无 model/system-prompt/config；② renderer 建 bot 调用仅传 `{name,description:"",harness:"temporal"}`；③ 0.18 main 边的 `getAgentDefaultModel/setAgentDefaultModel/getAvailableModels/getComputerUseModel/setComputerUseModel` 在 0.78.1 preload 0 命中（main-app 仅残留 `getComputerUseModel` 内部读，onboarding step）。

#### J2 多 session 并存与切换（方法 6）

| 跳 | 调用方锚点 | 方法 | 处理方 | 返回/事件 |
|---|---|---|---|---|
| 1 | `#"listGrokBotAgentSessions({"` | listGrokBotAgentSessions（main 边） | main-app `e.grokBot.sessions.listSessions` → 云 `{name:"ListGrokBotAgentSessions",I:`（Request=`1 agent_id 9`） | sessions（`GrokBotServiceAccountSession\|` 形态） |
| 2 | `#"openAgentTail({"`（带 `sessionId`，args=Bne） | openAgentTail / getAgentTranscriptTail | coordinator（server tail 或 gateway） | reply=`transcript-page`（`ListGrokBotTranscriptEntriesResponse\|`） |
| 3 | `#"startFreshConversation({"` | startFreshConversation | coordinator→云 StartFreshGrokBotConversation / gateway | void |
| 4 | `#"interruptAgentRun({"`（`{agentId,sessionId}`，会话粒度打断） | interruptAgentRun | 云 InterruptGrokBotAgentRun（reason="user_interrupt"） | `{hadActiveRun}` |
| 5 | `#"setViewingAgent("`（main 边） | setViewingAgent | main-app（窗口聚焦态） | void |
| 6 | renderer store `#"retain(e.agentId,a)"`+`snapshotsFor(agentId,{sessionId})` | 事件族 transcript（按 payload.agentId/sessionId 分流） | coordinator postEvent | 同 J1 |

#### J3 市场装 MCP→启用→bot 调工具→审批卡（方法 9 + 1 事件族）

| 跳 | 调用方锚点 | 方法 | 处理方 | 返回/事件 |
|---|---|---|---|---|
| 1 | `#"installEntry(rJn(t,r))"` | installEntry（main 边，args `{entryId,values,hasTeamConfiguredVariables,omitsSecretFields,deferListing}`） | main-app `catalogFlow.writeInstall`+`reloadAfterPluginWrite`（本地 plugin store 写入+MCP 重载，@2110343/@3132850） | 安装后 servers 列表 |
| 2 | `#"updatePluginInstall("` | updatePluginInstall（main 边） | main-app `getManager().updatePluginInstall` | 同上 |
| 3 | `#"setGrokBotAgentPlugins({agentId"`（main 边启用到 bot） | setGrokBotAgentPlugins | main-app `n().setGrokBotAgentPlugins`→云 `{name:"SetGrokBotAgentPlugins",I:`（`1 agent_id\|2 plugins #0*`） | Gm 信封 |
| 4 | `#"getGrokBotAgentPlugins({agentId"` | getGrokBotAgentPlugins（main 边） | 云 Get（`1 agent_id\|2 include_mcp_config`） | plugins |
| 5 | `#"listMcpServerTools("` / `#"toggleMcpToolDisabled"` | listMcpServerTools（main+coordinator 双面）/ toggleMcpToolDisabled（coordinator） | main-app `instructionsAndToggles` / coordinator | array |
| 6 | （bot 实际调工具：host/云端执行，**边界外推定**；MCP 配置随 sendPrompt `mcpConfigJson` 字段（SendGrokBotUserMessageRequest #14）与 agent plugins 下发） | — | host in box / temporal runtime | — |
| 7 | 审批卡到达：事件族 `transcript` 内 widget/tool-permission entry | — | coordinator postEvent | widget entry（`respondToWidget:["respondToWidget",…]` 白名单） |
| 8 | `#"respondToWidget("` / `resolveLocalToolPermission`（`chunk-view-Bbgcfm9R.js` 亦有调用） | respondToWidget / resolveLocalToolPermission / resolveAutoReviewApproval / resolveConnectorGrant | coordinator（server→云 `{name:"RespondGrokBotWidget",I:`（`1 agent_id\|2 entry_id\|3 value\|4 session_id`）/ `{name:"ResolveGrokBotLocalToolPermission",I:`；gateway→host） | `{accepted}` / void |
| 9 | `#"readMcpAppResource("`、`#"callMcpAppTool("`（MCP app 面） | readMcpAppResource / callMcpAppTool | coordinator→云 Read/CallGrokBotMcpAppDocument/Tool | record |

#### J4 冷启动恢复 bot 列表与历史（方法 8）

| 跳 | 调用方锚点 | 方法/通道 | 处理方 | 返回/事件 |
|---|---|---|---|---|
| 1 | preload `#"sendSync(\"sand:boot-snapshot-sync\")"` | 同步快照（experiments/theme/language/…/**mainEdge**/rosterPhotos） | `main-core.cjs#"sand:boot-snapshot-sync"`（ipcMain.on+returnValue） | 快照对象 |
| 2 | 通用 port 建链（§3.4 头） | sand:coordinator-port-request | main-app A2 handler | MessagePort |
| 3 | `#"listAgents("` | listAgents | coordinator（云 ListGrokBotAgents：`1 role 9?\|2 include_team_agents 8?\|3 added_team_agents_only 8?`） | array |
| 4 | `#"getServerAgentRoster()"` | getServerAgentRoster | main A14→云（temporal bot 列表/状态） | record |
| 5 | `#"getAgentTranscriptTail({"`（unreadBoundaryAt 支持未读定位） | getAgentTranscriptTail / openAgentTail | coordinator | transcript-page |
| 6 | `#"readClientPersistence({"` | readClientPersistence（main 边） | main-app（本地加密持久层） | record |
| 7 | `#"getOnboardingSeen("` | getOnboardingSeen（main 边） | main-app | boolean |
| 8 | `#"restoreTemporalAgentRouting({"` | restoreTemporalAgentRouting | coordinator（temporal 路由恢复） | void |

### 3.5 参数/返回口径

旅程方法参数**优先引 proto-fields.tsv**（云 RPC 已逐条内联如上；本地 dune-rpc/coordinator 方法在调用点列字段名）：sendPrompt args（coordinator `mB`）= `prompt,agentId,directAddressedAcceptance,clientNonce,attachmentPaths,attachmentNames,richText,replyToId,replyQuote,automationWriteProvenance,isFork,traceparent,enterEpochMs,composedAtMs,source,sendSource,mcpConfigJson,sessionId,machineId,onePasswordAppInstalled,rendersMcpElicitationForms,taskId,initiator,firstSentAtMs,language`；getAgentTranscriptTail args = `id,beforeSeq,limit,sessionId,unreadBoundaryAt,background`；createAgent args = `name,description,title,avatarShape,avatarColor,avatarPngBase64,creationRoute,origin,purpose,isIntroductionSuppressed,isKickstartRequested,isAutomatic,language,templateId,clientNonce,supportsTemporalHarness,harness(∈{box,temporal})`。

## 4. Q3 流式事件

1. **传输格式**：coordinator port 上 postMessage JSON 帧（A18）——client→coord：`{kind:"lifecycle",phase:"hello",protocolVersion:3}`、`{kind:"request",requestId:"r-<n>",method,args,demand?("person"|"background")}`、`{kind:"cancel",requestId}`、协议错误时 `{kind:"lifecycle",phase:"shutdown",reason:"protocol-error",detail}`；coord→client：`ready`（v3 校验）、`{kind:"reply",requestId,outcome:{status:"ok",value}|{status:"failed",failure}}`、`{kind:"event",family,payload}`。reply 容器校验表 `U3n`（`transcript-page` 要求 `entries[]+nextBeforeSeq` 等）。云侧 connect 协议（`application/connect+proto`、SSE `text/event-stream`，@820759）。
2. **事件族 29 个**（coordinator `Fz` 表）：`transcript, agents, agent-upserted, tray, subagents, async-tasks, forever-box, teach-recording, box-disk-pressure, computer-action, voice-call-nudge, messages-grants, agent-activity, outline, host-settings, cloud-agent-update, server-roster-changed, server-page-title-changed` + 映射组 `workflows, automations, todos, bot-skills, bot-secrets, agent-tasks, agent-meetings, library-docs, agent-automations-changed, mcp-servers, mcp-auth`；另有内建族 `coordinator-transport-state`（connected/down）、`coordinator-transcript-source`（gateway/server 切换）。
3. **多 session 多路复用**：单 renderer↔coordinator port 承载全部请求（requestId 递增）与全部事件；事件 payload 按 `agentId`+`sessionId` 分流（renderer `transcript.snapshotsFor(agentId,{sessionId})` per-session store；`GrokBotTranscriptWatchRows|1 agent_id|2 generation|3 entries|4 deletes|5 replay|6 session_id`）。云端仅**一条** `WatchGrokBotTranscripts` 流（coordinator `yield* h(...).watchGrokBotTranscripts(...)`，@848310），请求带 per-agent 游标 `GrokBotTranscriptCursor|1 agent_id|2 generation|3 after_updated_seq|4 session_id`；`inline_body_max_bytes` 控制行体内联，大 body 走 blob（`"blobs/"` 前缀+server-transcript-blob-read 超时策略）。
4. **断线重连与补发**：
   - gateway（box host）：SSE 重连退避 `gateway-sse-reconnect-backoff`（until-signal、倍增）+ `gateway-sse-stall` 空闲看门狗 + `gateway-return-watch` 探活 + DNS 诊断（`sand-dns-probe-<uuid>.<cluster>.cursorvm.com` 通配解析）。
   - 云 watch：`cursor_too_old` 帧（`GrokBotTranscriptWatchCursorTooOld|`）触发全量 resync；`cleared` 帧换 generation；`heartbeat` 保活；断流后以 cursor 重订阅，`rows.replay=true` 行为补发标记。
   - coordinator 进程级：main-app `qlt` 自动重启 + `transport-connected/down`（generation 去重）+ renderer `beginIdentityChange/completeIdentityChange` **port 热替换**（`replacesPort:"port-replacement"`）。
   - 发送侧：renderer send journal（nonce=`clientNonce`、`sentWhileOfflineAtMsByEntryId`、失败重发 `resendFailed`、`sendStates`）+ `promptAcceptanceStatus`→云 `GetGrokBotSendStatus` 幂等补偿（A15 catch 分支：网络错后查状态，非 rejected 即视为已受理）。

## 5. 与 0.18 对照（同 / 改 / 新 / 删）

**同**：五层拓扑与角色划分；coordinator port 帧语法（hello/ready/request/cancel/reply/event/shutdown）；MessagePort 交付方式（`sand:coordinator-port-request`/`sand:coordinator-port` 两通道同名同向）；main 边 RPC 信封 `{ok,value|failure}`；gateway SSE+POST 命令面（方法名 sendPrompt/getAgentTranscriptTail/listAgents… 0.18 `gateway-protocol.ts` 与 0.78.1 `commandPolicies` 一致）；host S3 自更新 + supervisor 文件协议。

**改**：通道前缀 `sand-rpc:`→`dune-rpc:`（+probe 通道、+per-method trust、+request.demand；协议 v1→v3）；main 边 117→431、coordinator 85→146；MCP 面 0.18 preload 12 条 flat `sand:mcp-*` 通道 → main 边方法（市场安装）+ coordinator 方法（盒侧状态）两套；host 安装位 `/home/box/sand-host`→`/opt/sand/sand-host`；host 本地 bundle 随包→纯云端 box（§2.2/2.3）；secrets 面 0.18 `sand:secrets-*` 5 通道 → main 边 listSecrets/putGrokBotSecret/deleteGrokBotSecret 等。

**新**：temporal harness 全链（`CreateGrokBotTemporalAgent`、harness∈{box,temporal}、`restoreTemporalAgentRouting`、`mirrorGateway`、server transcript source——0.18 树 `temporal` 0 命中）；session 维度（sessionId 贯穿 sendPrompt/tail/interrupt/watch rows、`ListGrokBotAgentSessions`）；`AgentStoreService`(25)、`SandBoxService`(55)；审批卡新族 resolveConnectorGrant/resolveMessagesGrants/resolveVirtualCardApproval/beginSpendApproval；事件族 29（0.18 未逐一比对，按表新增计）；旅程①「每 bot 选 agent 配置」——0.78.1 无此能力，复刻需自建。

**删**：0.18 的 57 条 flat 通道族（保留 11 条基础设施通道）；模型选择 5 方法（§3.4 J1 负证据）；coordinator 房间/共享 18 方法（createRoom*/joinSharedRoom/leaveSharedRoom/setSharedRoomTyping/broadcastToAgents/isAgentNetworkEnabled/isGlobalSearchEnabled/getSharingState/duplicateAgent/requestDiskSaverAudit/portAgentLocalSkills/setAgentWorkflowEnabled/setAgentNotificationsEnabled/respondToRoomJoinRequest/addOwnAgentToSharedRoom/removeOwnAgentFromSharedRoom）；`dist/host/`、`dist/electron-dev-controls/`+`preload-dev-controls.cjs`、4 个 host worker（W05 轴②）。

## 6. owners.tsv 归属 ipc-rpc 的 212 行处置（每行必有归属）

- **具名 8 行**：`electron-main/proto.cjs`→本报告 §3.1 云端字典（保留 ipc-rpc）；`local-exec-daemon/main.cjs`、`node-agent-coordinator/main.cjs`→§2.1 拓扑（保留 Q1）；`local-exec-daemon/messages-worker.cjs`→Q3 消息管线（本报告仅拓扑登记，语义未展开，保留兜底）；`electron-preload/preload.cjs`→§3.1/§3.2 面（保留）；`electron-preload/preload-webview.cjs`→computer-use 边界（**改判 非 MVP:computer-use**，与 desktop-mount 同族）；`contextBridge:sandPopout`→popout 窗口句柄（**改判 ui-shell**）；`proto:message 新增全集`→Q2 字段字典引用（保留，按 proto-fields.tsv 引用不展开）。
- **deps 26 行**：`@sand/host`→Q1 host 交付（保留）；`@sand/local-exec-daemon`、`@sand/local-exec-protocol`→Q1 daemon（保留）；`@sand/primitives`、`@sand/shared-node`、`pele`、`tldts`、`qrcode`→跨 bundle 共享库（**改判 RE-unpack/依赖面**，本报告只证无独立 IPC 面）；`@anysphere/dune`、`dune-reliability`、`attention-count`、`draft-revision`、`usage-banner`、`xai-commerce-prepaid`、`orbit-client`、`link-preview`、`card-photo-text`、`slack-app-setup`、`browser-smoke`、`sand-playwright-runtime`、`@sand/sand-eval-runner`、`sand-address-lookup`、`sand-card-text-recognition`、`sand-devicecheck`、`sand-window-capture`、`@anysphere/device-local-tools`→功能库，消费既有通道（**改判 features/对应功能组**；本报告已核其不在 preload/Id 表新增通道）。
- **chunks 178 行**：renderer 懒加载 chunk 不定义新通道/RPC（面由 preload+Id 表固定，本报告已核 `dune-rpc:`/`GrokBotService` 在 renderer 仅 eager-app 命中）。分组改判：**语言文法/文本（shiki 及 77 个语言名：app-copy,asm,astro,c,clojure,cmake,cpp,crystal,csharp,css,csv-parse,dart,diff,dockerfile,dotenv,elixir,elm,erb,erlang,fish,fsharp,glsl,go,groovy,haml,haskell,hcl,hlsl,html,html-derivative,iamcal,ini,java,javascript,json,json5,jsonc,jsx,julia,kotlin,latex,lean,less,lisp,lua,makefile,mdx,nginx,nim,objective-c,objective-cpp,ocaml,perl,php,postcss,powershell,prisma,python,r,regexp,rst,ruby,rust,sass,scala,scss,shellscript,sql,svelte,swift,terraform,tlaplus,toml,tsx,typescript,vue,xml,yaml,zig,character-entities,compact,xlsx,pdf）→改判 ui-shell(编辑器)**；**shiki 4 件（grammars/incremental-tokenizer/sync/token-cache）→ui-shell**；**会话/消息 UI（chat,chat-widget,messages,new-chat-bar,thread-card,widget,notice,draft-send-error,elevated-draft-fields,file-stage,form-values,inline-user-form,list-item,code-body,card-field,card-item,heading-link,pane-header,scroll-pane,window-chrome,layout,lazy,lib,core,shared,dist,model,view,general-pane,fullscreen-file-viewer-body,text-viewer,document-page,library-visual-viewer,presentation,visualization-d3-runtime.gen,visualization-three-runtime.gen,visualization-document,pointer-release,use-active-option-scroll,wipe-navigation,scale-layer,mac-app-tile,settings,settings-row,auto-review-rule-notice,auto-review-selector,sand-auto-review-instructions,sand-rule-text-diff,review-item-seed,review-usage-button,see-usage-button,usage-review-gate,member-chip,team-setup-pills,team-setup-row,teams-integration-shown,onboarding-flow,place-facts,places-stage,people-search-menu-live,phone-call,teach-recording-controls,computer-screen-preview,device-action,x-brand-logo,brand-marks,link-brand-logo,top-up-modal-host,top-up-recipe,order-checkout,virtual-card-checkout,user-custom-connector,connector,native-connector-card,connector-card,connector-card-view,connector-data-center,connect,listener-integrations,onepassword-previous-vault-note）→改判 features/ui-shell（按名归入 chat/marketplace/账号/computer-use 各组）**；**入口 bundle（index.eager-app, index.eager-common, index.eager-platform, index.eager-vendor, chunk-proto, chunk-rolldown-runtime, main-app, main-core, messages-worker, onepassword-connection-service）→保留 ipc-rpc**（本报告 §2-§4 即其 IPC 面）。fullscreen-file-viewer-body（去前缀重名行）同上 viewer 组。

## 7. 局限与未验证项

1. **边界外推定**（客户端边界内逐跳已核，标注为推定的仅边界外段）：coordinator→云端 connect 调用（baseUrl 运行时注入，静态只见 `api2.cursor.sh` 作 DNS 诊断常量 1 处）；coordinator↔box host gateway（SSE/POST/forever-box 均为常量与解析器证据，未连接 box）；host 在 box 内的启动细节（supervisor 不在产物内，证据来自 0.18 同源模块）。
2. **sendPrompt 双路径的运行时路由判据**（server vs gateway）只见到结构（`isServerRouted`、`legacyServerActive`、`mirrorGateway`、harness 字段），未展开判定函数全貌；temporal/box 混合账号的实际分流未验证。
3. **同名双面方法**（getMcpState/getMcpCatalog/listMcpServerTools 同时在 main 边与 coordinator 表）：renderer 市场 store 的 `e` 经结构判定为 main 边（coordinator 表无 installEntry 而该 store 调用它），但 getMcpState 的两个消费 store 未逐一区分。
4. **minified 变量还原**（Id/nse/mB/Bne/Fz/ese/Syt/mlt 等）基于双端镜像与结构比对，无 sourcemap 校验；方法计数（431/146/62/29）随之有 ±1 级误差（重名/别名已按唯一名去重）。
5. 431 main 边方法未逐个双侧核验（抽样 13 个全 PASS：preload 声明+main-app handler 双 =1/≥2）；coordinator 146 方法抽样 17 个三侧（renderer 表/coordinator 表/renderer 调用点）全 PASS。
6. 0.18 对照为 win-x64 Setup.exe（平台差，W05 §7）；0.18 renderer 方法表 85 名提取自信任 `args:"object"` 正则，若存在其它 args 形态会略低估。
7. `messages-worker.cjs`（Q3 归属）内部消息管线未深挖（local-exec 消息 app 数据面，非 renderer RPC 面）；`sand-dev` 边与 dev-only preload 未展开（packaged 不生效，`main-core.cjs#"preload-sand-dev.cjs"` 双门槛）。
8. 复刻脚本与中间产物在 `/dev/shm/grok-re/ipcrpc/`（findci/fam*/coord*/main* 等 node 脚本 + id-table/m78/m18 方法名单），可复跑；未写入 work/ 副本。
