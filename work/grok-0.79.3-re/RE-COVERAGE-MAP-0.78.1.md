# RE-COVERAGE-MAP-0.78.1 · 0.78.1 功能域全集 × RE 深度 × 我们实现 覆盖度地图

日期：2026-11-13。任务：枚举 0.78.1 全部功能域（从产物提取），对照 9 份既有 RE 报告与 `app/ui/renderer-grok` 实现，产出零覆盖/浅覆盖缺口清单。只读分析，未执行产物。

## 0. 方法与锚点

- 产物：`/tmp/t78-asar/`（0.78.1 deb 的 asar 解包，与 RE-SETTINGS 用的 `/dev/shm/pbots-re/gb0781/` 同源同版本，文件 hash 一致，如 `index.eager-app-iGTgHP_Q.js`）。
- 本次新提取的可复查辅助产物（脚本与输出都在 `work/grok-0.79.3-re/harness/t78/`）：
  - `t78-preload-main-methods.txt` — preload `desktop.main` world 方法 **431 个**（`index.eager-app-iGTgHP_Q.js` 同款提取法：`name:XX().args|noArgs` 正则）。
  - `t78-mainapp-all-methods.txt` — `electron-main/main-app.cjs` 全部 RPC 方法 **640 个**（含 coordinator/desktop-mount/gateway/box-vnc 各 edge；edge 名：`jo("…")` 注册，共 8 个 edge：`main / coordinator-main / coordinator-control / box-vnc / gateway / desktop-mount / desktop-mount-capture-overlay / sand-dev`；gateway edge 直接 brace-match 到 173 方法）。
  - `t78-i18n-en-flat.json` — renderer 核心 en ICU 表 **2307 条**（`index.eager-common-DbK3Oi_r.js` 的 `JSON.parse(\`…\`)`，键为哈希）。
  - chunk 功能簇统计、`sand.*` 命令 id 全集（见 §1）。
- 既有报告（9 份）：RE-FULL-0.79.3 / RE-UI-0.79.3 / RE-UI-LAYOUT-0.78.1 / RE-CONNECTORS-0.78.1 / RE-CONNECT-PRESETS-0.78.1 / RE-CONNECTOR-GRANT-0.78.1 / RE-SETTINGS-0.78.1 / RE-BORDERS-0.78.1 / RE-MOTION-0.78.1 / RE-STOP-0.78.1（persona-stop-gap）。
- 我们的实现：`app/ui/renderer-grok/`（0.18 上游 119 tsx + 34 个 overrides 模块 + 13 个 shim 模块）；UI 面参照 `work/ui-quality/evidence/tour/`（18 面）。

### 0.1 0.78.1 功能面规模总账（本次实测）

| 维度 | 0.78.1 实测 | 对比 |
|---|---|---|
| renderer JS chunk | 626 个（懒加载；eager 仅 4 个） | RE-FULL 0.79.3 记 641，同量级 |
| preload desktop.main 方法 | 431 | 0.79.3 记 330（提取口径不同，0.78.1 含 spread 全展开） |
| main-app 全 RPC 方法 | 640（8 edge） | 0.79.3 记 330+253=583，0.78.1 略多（口径差） |
| i18n en 核心表 | 2307 串 | lazy chunk 另有 36 个 `chunk-core-*.js` locale（36 语言）+ 23 个 `chunk-messages-*` |
| chunk 功能簇 | shiki 语言 107、懒视图 74、settings 37、agents 37、chat 37、team-bot 30、connector/marketplace 14、文件预览 13、bot-share 8、金融 7、可视化 4、automation 4、computer/box 4、voice/phone 4、onboarding 1 | — |
| 桌面集成域验证 | powerMonitor 2、Tray 1、menubar 5、autoUpdater、setBadgeCount 2、globalShortcut 1、Notification 12（main-app.cjs grep 计数） | 与 RE-FULL §6 一致，0.78.1 均在 |

## 1. 0.78.1 功能域全集（产物证据）

分十个域（A–J）。每行给一个可复查锚点。i18n 值域聚类（2307 条 core 表）佐证规模：team/workspace 286 串、slack/teams-im 181 串、computer/box 103 串、share/marketplace 99 串、memory/learning 73 串、vault/passkey 48 串、voice/phone 40 串、automation/routine 40 串、billing 36 串、search 21 串、keyboard/a11y 9 串。

**A 聊天主流程**
- A1 消息收发/草稿：coordinator `sendPrompt/sendDraft/discardDraft`（t78-mainapp-all-methods.txt）+ `chunk-draft-send-error-*`、`chunk-use-draft-revision-highlight-*`、`chunk-elevated-draft-fields-*`。
- A2 过程呈现（状态行短语引擎/头像状态动画/suppressed）：RE-UI-0.79.3 题1 全规格。
- A3 Full conversation outline 侧板：`chunk-view-*`（outline 组件）+ RE-UI-0.79.3 题1e。
- A4 subagent/任务卡/async tasks：`getSubagents/subagentsGet/getAsyncTasks`（mainapp 640）+ RE-UI-0.79.3 题3。
- A5 消息操作：`reactToMessage/voteFeedback/createThreadFromMessage/rollBackConversation`（mainapp 640）。
- A6 transcript 分页/一致性：`getAgentTranscript{,Page,Tail,Window}/resolveServerTranscriptTail/reportTranscriptParity`。
- A7 附件 staging：preload `stageAttachmentFile/commitAttachment…` 十件套（RE-FULL §3 同）。
- A8 输入面：@ 提及（`chunk-prompt-editor-*` `sand-mention-menu-item`）、斜杠命令、emoji picker（40 locale）、听写四件套（`startDictation` preload）、TTS `synthesizeSpeech`+28 音色、user form（`chunk-inline-user-form-*`）。
- A9 内容渲染：shiki 107 语言 chunk、katex（KaTeX_* 15 字体）、`chunk-transcript-markdown-*`、pdf.worker、xlsx、可视化 d3/three、canvas、`sand-html-preview:`/`sand-mcp-app:` iframe。
- A10 文件预览：`chunk-fullscreen-file-viewer-body-*`、`chunk-text-viewer-*`、`chunk-document-page-*`、`chunk-library-visual-viewer-*`。

**B 会话与侧栏**
- B1 侧栏分区/置顶/未读/隐藏：`getHostSidebarSections/setHostSidebarSections/getHostPinnedAgents/setAgentHiddenFromSidebar`（preload 431）。
- B2 多会话/标题：`listGrokBotAgentSessions/seedConversationName/startFreshConversation`。
- B3 new-chat-bar 收件人/群聊：`chunk-new-chat-bar-*`（RE-FULL §1）。
- B4 Pop Out Chat（Cmd+Shift+O）：`openChatPopout`（preload 431 有）+ `sandPopout` world。
- B5 搜索：`searchConversation/searchAgents/searchMedia/isGlobalSearchEnabled`（mainapp）+ 命令 `sand.focusSearch`。

**C Bot 生命周期**
- C1 创建流（对话框/24 形状×11 色素材/动画）：RE-UI-0.79.3 题2。
- C2 头像编辑器/AI 生图：`chunk-agent-avatar-editor-*` + `pickAvatarFile/generateAgentAvatarImage/setAgentAvatarBytes`。
- C3 声音：`setGrokBotAgentVoice/setAgentVoice`（preload/mainapp 均在）。
- C4 Bot 设置面五区（Tools/Skills/Learnings/Routines/Analytics）：`chunk-bot-configure-dialog-*` + `getBotAnalytics/listBotReviewItems/promoteGrokBotMemoriesToTeam`（preload 431）。
- C5 分享体系：`shareGrokBotAgentInPlace/createGrokBotAgentInvite/publishGrokBotAgent/listPublicBotMarketplace`（preload）+ bot-share-* 8 chunk。
- C6 模板：`chunk-bot-template-details-dialog/-focus/-share-card-frame` + `chunk-template-editor-dialog`。
- C7 Automations/Workflows：`runAutomationWebhook/getAutomationWebhookCredential` + `createAgentWorkflow/importAgentWorkflowUrl/Text/runAgentWorkflowNow`（mainapp）+ `chunk-automation-detail-panel-*`。
- C8 bot 文件库：`listGrokBotAgentFiles/upload/delete/makePrivate`（preload）+ `chunk-bot-store-files-library-*`。
- C9 团队 bot：team-bot-* 30 chunk（overview/access/alerts/service accounts/memories/context/plugins/vault/teammate-intro/share-card/teams-flow）。

**D 连接器/插件/MCP**：RE-CONNECTORS-0.78.1 全量（11 分类市场 + Mac 本地 7 能力 + 27 引用类型 + OAuth broker + ConnectorGrant）+ RE-CONNECT-PRESETS + RE-CONNECTOR-GRANT。chunk 簇 14 个。

**E 设置**：RE-SETTINGS-0.78.1 七区（General/Texting/Computer/Permissions/Vault/Usage and billing/Updates）43 键 + RE-UI-LAYOUT 像素规格。settings chunk 37 个（其中 36 为 locale）。

**F 桌面集成**
- F1 托盘/dock/菜单/badge：main-app.cjs `Tray(/menubar×5/setBadgeCount×2`（grep 实测）+ `menubar-tray/` 资产目录（149 文件之一）。
- F2 通知：`get/setDesktopNotificationPreferences/getAgentNotificationAvatar`（preload）+ 偏好/声音/空闲感知（RE-FULL §6）；bot 管理页有 per-bot Notifications 行（i18n `iDNBZe` "Notifications"，chunk-agents-* 消费）——**无独立通知中心收件箱的证据**，收件箱语义由 trays 承担（见 H6）。
- F3 更新：`checkForUpdates×4/autoUpdater`（main-app grep）+ `setUpdateTrack/quitAndInstallUpdate`。
- F4 深链：`grokbot://` + `grokbot://mcp/oauth/callback`（main-app grep 实测）+ `deepLinkEmit/markDeepLinksReady`。
- F5 电源感知：powerMonitor×2（main-app/main-core）。
- F6 WebAuthn/passkey 代理：`requestWebAuthnCeremony/Consent/Pin/finishWebAuthnConsent/beginPasskeyRegistration/listPasskeys/revokePasskey`（mainapp 640）。
- F7 网络域：`runNetworkDiagnostics` + `chunk-network-debugger-dialog-*` + egress tunnel 四件套。
- F8 键盘快捷键/命令系统：`sand.*` 命令 id 全集 25 个可执行命令（toggleSidebar/toggleInfo/toggleAgentSettings/send/previousAgent/nextAgent/openTools/openSkills/openSettings/newAgent/newGroupChat/navigateBack/navigateForward/focusSearch/focusInput/focusAgent/findInChat/commandPalette/addSelectionToPrompt/keyboardShortcuts/togglePageCommentMode 等，全 assets grep）+ 应用菜单 accelerators + `sand.keyboardShortcuts` 帮助入口。

**G 账号/团队/IM**
- G1 账号/profile：`getGrokBotUserProfile` + 自拍照。
- G2 团队：selectedTeamId/ConvertToTeam 工具/invite teammates。
- G3 Slack：install/reinstall/uninstall 全套（RE-FULL §8）+ `chunk-grok-bot-slack-dialog-live-*`。
- G4 Teams：`addGrokBotTeamsAppToTeam`（preload）+ `chunk-team-bot-teams-flow-dialog-live-*`。
- G5 手机短信 texting：`issueGrokBotMessagingLinkCode/linkedPhones`（RE-SETTINGS §5）+ `chunk-mac-mail-setup-dialog-*`。
- G6 1Password/vault：`onepassword-connection-service.cjs`（107KB）+ `chunk-vault-card-dialog/-editor` + `chunk-grok-bot-vault-login-dialogs` + `chunk-onepassword-previous-vault-note`。

**H Agent 编排**
- H1 语音通话：`getVoiceCall/nudgeVoiceCall/setVoiceCallPresence/recordVoiceCall/readVoiceCallSentMessages/previewVoice/mintVoiceCallCredential`（mainapp 640）+ `chunk-phone-call-*`/`chunk-voice-call-feedback-card-*`/`chunk-voice-memo-bubble-*`/`chunk-unrequested-meeting-approval-*`。
- H2 Teach 模式：`startTeachRecording/stopTeachRecording/getTeachRecordingStatus` + `chunk-teach-recording-controls-*`。
- H3 Cloud agent：`openCloudAgent/stopCloudAgent` + `chunk-cloud-agent-card-elevated-*`/`chunk-cloud-agent-artifact-open-telemetry-*`。
- H4 ForeverBox/computer-use/VNC：`ensureForeverBox/readComputerUsePermissions` + `preload-vnc.cjs`（49KB，9 个 `sand:vnc-*` 通道）+ `chunk-box-desktop-modal-*`/`chunk-computer-screen-preview-*` + desktop-mount panel/capture-overlay（renderer/src 有未压缩 html）。
- H5 Channels/listener integrations：`getAgentChannels/connectChannel/disconnectChannel/refreshChannel/getListenerIntegrations` + `chunk-listener-integrations-*`。
- H6 Widgets/Trays/建议：`dismissWidget/respondToWidget/getTrays/dismissTray/clearTrays/dismissAgentSuggestions`（mainapp）+ `chunk-widget-*`/`chunk-chat-widget-*`。
- H7 跨 bot/群/组：`addGrokBotRoomPeople/group-chat-connect-waiting` + `chunk-group-chat-connect-waiting-*`。
- H8 地点/本地搜索：`chunk-places-stage-*`/`chunk-place-facts-*`（PlacesSearch/RestaurantSearch 工具族消费面）。

**I 本地执行**（local-exec-daemon ↔ dsh）：RE-FULL §10（daemon 生命周期/凭证/路径围栏/repo 白名单/shell 五态/审批规则/auto-review/MCP 门/Messages-Mail worker）。

**J 横切**
- J1 金融/购物：`getFinanceOverview/resolveVirtualCardApproval` + 7 chunk（order-checkout/virtual-card-checkout/top-up/top-up-recipe/unified-billing/receipt）。
- J2 i18n：36 `chunk-core-*` + 23 `chunk-messages-*` locale + 主进程 37 locale 目录。
- J3 Onboarding：`chunk-onboarding-flow-CX7HFdkW.js`（0.78.1 单 chunk；RE-UI 题2 的电影化分镜为 0.79.3 形态，0.78.1 已有 flow）。
- J4 Feature flags：`applyFeatureFlagOverride/applyExperimentOverride/getExperimentsSnapshot`（preload）。
- J5 命令面板：`chunk-view-*` palette + `sand.commandPalette`。
- J6 Sentry/遥测/性能：`chunk-sentry-sdk-*`、render trace、boot gate。

## 2. 覆盖度矩阵（核心表）

排序 = 用户可见痛感（聊天主流程 > 高频面 > 低频面 > 深层）。RE 深度：深=专门报告且到像素/行为级；浅=RE-FULL 一行提及；零=无报告触及。我们现状依据 `app/ui/renderer-grok/overrides+shim+frontend(0.18)` 文件面与 tour 18 面。

| # | 功能域 | 0.78.1 证据锚点 | RE 深度 | 我们现状 | 优先级 |
|---|---|---|---|---|---|
| A2 | 过程呈现（状态行/头像动画/suppressed） | RE-UI-0.79.3 题1；RE-MOTION §1 | **深** | status-line.ts+pet.ts，T88 引擎在做 | **P0** |
| A1 | 消息收发/草稿/发送失败卡 | coordinator sendPrompt/sendDraft；draft-send-error chunk | 浅（RE-FULL §3） | composer.tsx 有；草稿修订/失败卡缺 | **P0** |
| A3 | outline 侧板 | RE-UI 题1e | **深** | shim/outline.ts 部分 | **P0** |
| A4/A5 | subagent 卡/消息操作（react/thread/rollback/retry/copy link） | RE-UI 题3；RE-FULL §3 | **深**（subagent）/浅（消息操作） | reaction 有；thread/rollback/copy link 缺 | **P0** |
| A8 | 输入面（@提及/斜杠/emoji/听写/TTS/user form） | prompt-editor chunk；dictation 四件套 | 浅 | 全缺（composer 无 mention） | **P0**（@提及+emoji 先行） |
| B1 | 侧栏分区/置顶/未读/隐藏 | preload getHost* 系列 | 浅 | sidebar.tsx 无分区/未读 | **P0** |
| B2/B3 | 多会话/自动标题/收件人群聊 | listGrokBotAgentSessions/new-chat-bar | 浅 | 部分（0.18 单会话） | **P0**（多会话）/P1（群聊） |
| C1/C2 | 创建流+素材+动画 | RE-UI 题2 | **深** | character.tsx/new-bot-dialog.tsx 已做大半 | P1（收尾） |
| C4 | Bot 设置面五区 | bot-configure-dialog chunk | 浅 | agent-settings.tsx/skills-dialog.tsx（Tools/Skills 有） | P1（Learnings/Routines/Analytics 缺） |
| D | 连接器/市场/MCP/Grant | RE-CONNECTORS+PRESETS+GRANT 三份 | **深** | market-surface/store/picks 已做浏览；OAuth/Grant 卡缺 | P1 |
| E | 设置七区 | RE-SETTINGS+RE-UI-LAYOUT | **深** | settings-view/panels/models（General 子集+Models） | P1（Texting/Computer/Usage 缺） |
| F8 | 键盘快捷键/命令系统 | sand.* 25 命令+菜单 accelerators | **零**（无专门报告；RE-FULL §6 只列菜单项） | CommandPalette.tsx 有面板；快捷键绑定不齐 | **P1**（高频入口） |
| F2 | 通知（偏好/声音/per-bot/空闲感知） | preload @47-48 | 浅 | 有通知无细度 | P1 |
| A7 | 附件 staging（预上传/预字幕/十件套） | preload @88-100 | 浅 | 0.18 基本附件 | P1 |
| A9/A10 | 内容渲染/文件预览（shiki/katex/pdf/xlsx/可视化/canvas） | 107 语言 chunk+viewer chunk | 浅（RE-FULL §5） | 0.18 基本渲染；可视化/canvas 缺 | P1（shiki/katex）/P2（可视化） |
| C5/C6 | 分享/模板发布 | bot-share 8 chunk+publish RPC | 浅（RE-CONNECTORS §5.3 提 Grant） | 市场浏览有；in-place share/invite/publish 缺 | P1 |
| C7 | Automations/Workflows | runAutomationWebhook 等 | **零**（仅 RE-FULL 一行） | 缺 | P2 |
| B4/B5 | Pop Out Chat/全局搜索 | openChatPopout/searchConversation | **零** | 缺 | P2 |
| F1 | 托盘/dock/菜单/badge | menubar-tray 资产+Tray | 浅（RE-FULL §6） | 缺（Linux 侧栏形态不同） | P2 |
| F3/F4/F5 | 更新/深链/电源感知 | grokbot:// 深链+powerMonitor | 浅 | 部分（更新）/缺 | P2 |
| G1 | 账号/profile | getGrokBotUserProfile | 浅 | pbots 账号自有 | P1（对齐外观） |
| G2 | 团队切换/member policy | selectedTeamId | **零** | 缺 | P2 |
| G3/G4 | Slack/Teams 集成 | install 全套+2 live dialog chunk | **零** | 缺 | P2 |
| G5 | 手机短信 texting | issueGrokBotMessagingLinkCode | 浅（RE-SETTINGS §5） | 缺 | P2 |
| G6 | 1Password/vault/passkey | 1PW 服务+vault chunk+passkey RPC | **零** | 缺 | P2 |
| H1 | **语音通话/电话** | 7 RPC+4 chunk（phone-call/voice-call-feedback/voice-memo/unrequested-meeting） | **零** | 缺 | P2（大面零覆盖） |
| H2 | **Teach 模式** | 3 RPC+teach-recording-controls | **零** | 缺 | P2 |
| H3 | **Cloud agent** | openCloudAgent+2 chunk | 浅（RE-UI 题3f） | 缺 | P2 |
| H4 | ForeverBox/VNC/computer-use 面板 | preload-vnc 9 通道+desktopMount 31 方法 | 浅 | computer-view.tsx 部分 | P2 |
| H5 | Channels/listener integrations | connectChannel 等 | **零** | 缺 | P2 |
| H6 | Widgets/Trays/建议 | dismissWidget/getTrays 等 | **零** | 缺 | P2 |
| H7 | 群聊/跨 bot 房间 | addGrokBotRoomPeople | **零** | 缺 | P2 |
| H8 | Places/地点舞台 | places-stage/place-facts chunk | **零** | 缺 | P2 |
| I | 本地执行契约（五态/围栏/审批规则/auto-review） | DAEMON | 浅（RE-FULL §10 表） | dsh 自有；审批规则缺（P5-31） | P1（审批规则） |
| J1 | 金融/购物（virtual card/checkout/top-up） | 7 chunk+RPC | **零** | 缺 | P2（大面零覆盖） |
| J2 | i18n 36 语言 | chunk-core/messages locale | **零** | 仅英文 | P2 |
| J3 | Onboarding flow | onboarding-flow chunk | **深**（0.79.3 形态，RE-UI 题2；onboarding-0793-extract.json） | onboarding-view/steps-0793/ templates 已做 | P1（收尾） |
| J4 | Feature flags 体系 | applyFeatureFlagOverride | **零** | 缺 | P2（深层） |
| A6 | transcript 分页/一致性上报 | getAgentTranscriptPage/Tail | 浅 | pagination.ts 部分 | P1 |
| C3 | 头像编辑器/AI 生图 | agent-avatar-editor chunk | **零**（RE-UI 题2 只覆盖创建时素材） | avatars.ts shim 部分 | P1 |
| C8 | bot 文件库 | listGrokBotAgentFiles+store-files-library | **零** | 缺 | P2 |
| C9 | 团队 bot 全家（30 chunk） | team-bot-* | **零** | 缺 | P2（最大单一零覆盖簇） |
| F6 | WebAuthn/egress/网络诊断 | requestWebAuthn*+network-debugger | **零** | 缺 | P2 |
| B 桌面（沙箱） | sand: 自定义协议 8 个 | renderer/index.html CSP | 浅 | dsh 自有协议面 | P2 |

## 3. 零覆盖大面清单（RE 完全没碰过的整域）

按 chunk/串规模排：

1. **团队协作簇（C9+G2+H7，30 chunk + 286 i18n 串）**——team-bot overview/access/alerts/service accounts/memories/context/plugins/vault/teammate-intro/share-card/teams-flow + 团队切换 + 群聊房间。既有报告只有 RE-CONNECTOR-GRANT 顺带覆盖「团队 ConnectorGrant 审批」一角。
2. **语音/电话簇（H1，4 chunk + 7 RPC + 40 i18n 串）**——voice call 状态机（presence/nudge/record/preview）、phone-call 卡、voice memo 气泡、unrequested meeting approval。
3. **金融/购物簇（J1，7 chunk + getFinanceOverview/resolveVirtualCardApproval）**——virtual card 申请/结账/top-up/receipt/try-on 生成图。
4. **H2 Teach 模式 / H5 Channels / H6 Widgets+Trays+建议**——三个 bot 主动面，全部零 RE。
5. **G3/G4/G6 Slack/Teams/1Password-vault**——IM 与凭证两大集成族，零 RE（RE-SETTINGS 只碰了 Texting pane 的 UI 壳）。
6. **F8 键盘快捷键系统**——25 个 `sand.*` 命令绑定表 + 菜单 accelerators + Keyboard Shortcuts 帮助页，无专门报告（用户点名怀疑的方向之一，确认零覆盖）。
7. **C8 bot 文件库 / C7 automations+workflows**——bot 经营面两块，零 RE（automations 只在 RE-FULL 一行）。
8. **J4 feature flags / J2 i18n**——横切基础设施，零 RE。
9. **H8 Places 舞台**——地点/餐厅搜索的富呈现（2 chunk），零 RE。

注意（防过度开工）：其中 H1/H3/H4/H8/J1/G3/G4/G6/C9 依赖服务端与 macOS 平台能力（OAuth broker、box 云端、Apple Messages、1PW 服务进程），复刻前要先过「我们的 pbots/dsh 有无对应后端」这一关——RE 可以先做（规格在产物里），施工不一定全部可达。纯 UI/协议面（F8、C7、C8、H6 trays/widgets、G2 团队切换 UI）无此问题。

## 4. RE 深度统计与下一批建议

- 已深 RE（行为/像素级）：A2 过程呈现、A3 outline、A4 subagent、C1 创建流、D 连接器三份、E 设置两份、边框、动效、stop、onboarding（0.79.3 形态）——**集中在聊天主流程 + 设置 + 连接器**。
- 提及未深：A1/A5-A10、B 全部、C3-C8、F1-F5、G1、I、J5。
- 零覆盖整域见 §3。
- 下一批 RE 建议排序（对齐施工优先级）：
  1. **F8 快捷键系统**（P1 高频入口，纯静态可做：`sand.*` 绑定表→keymap 数据 + Keyboard Shortcuts 页规格）；
  2. **B1 侧栏分区/置顶/未读**（P0 面，RPC 协议 + 交互规格一次做齐）；
  3. **A8 输入面**（@提及菜单/emoji picker/听写 UI 形态，prompt-editor chunk 定点）；
  4. **C4 Bot 设置面五区**（bot-configure-dialog + bot-manage-screen 两 chunk，Learnings 审批流是行为重点）;
  5. **A5 消息操作全集**（thread/rollback/retry/copy link 的菜单与确认流）；
  6. 大面按需：团队 bot 簇（若决定做团队）、语音通话（若后端可达）、automations（协议简单 UI 为主）。

## 5. 局限与未验证项

1. 全部为静态结论，未执行 0.78.1 产物；「用户看到什么」由 chunk/RPC/i18n 证据推出。
2. 431/640 方法清单是正则提取（`name:XX().args|noArgs` 口径），可能漏掉非常规注册形态；edge 内 spread 对象（coordinator-main 的 `nCn` 等）未逐一展开，靠全文并集兜底。
3. i18n 聚类基于核心 2307 串（eager-common）；lazy chunk 各自携带的子表未合并（36 locale 文件是同表的翻译，不增功能域）。哈希键无法做键名前缀聚类，聚类按值域关键词，有个别误归（如 voice 桶混入 Slack 串）已人工核对样本。
4. 「我们现状」按 overrides/shim/frontend 文件面 + tour 18 面对照，未逐模块核对 0.18 上游内部已有细节；标注「部分」的域可能低估 0.18 已有能力。
5. 0.78.1 与 0.79.3 的功能差异未系统 diff（已知例：onboarding connector step 为 0.79.3 新增，RE-CONNECTORS §B.3 注）；引用 RE-FULL/RE-UI（0.79.3）的行在矩阵中默认两版本同构，个别行可能含 0.79.3 新增面。
6. renderer「路由」为压缩内部对象（如 `Zq`），无 URL 路由表；页面全集由 chunk 名+报告锚点合成，`chunk-view-*` 74 个懒视图未逐个命名归类。
7. 全局搜索 UI 入口、斜杠命令清单两项在 0.79.3 RE-FULL 遗漏声明中已列，0.78.1 本次同样未解决。
