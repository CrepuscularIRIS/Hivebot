# RE-FULL：Grok Bot 0.79.3 全量功能面普查

日期：2026-11-07。方法：静态分析 `/tmp/grokbot-0.79.3/extracted/dist/`（只读，未执行产物）。广度优先：preload RPC 面 → main/coordinator/daemon 聚类 → renderer chunk 名 + i18n 表 → 定点取证。UI 三题（`RE-UI-0.79.3.md`）的结论直接引用不重复。

锚点缩写（新增，UI 三题的 APP/COMMON/ONB/COORD/PROTO 沿用）：
- **PRELOAD** = `electron-preload/preload.cjs`（143KB）
- **MAINE** = `electron-main/main-app.cjs`（3.5MB，RPC 实现 + 菜单/托盘/更新/账号）
- **MAINC** = `electron-main/main-core.cjs`（1.16MB，含主进程 i18n 表）
- **DAEMON** = `local-exec-daemon/main.cjs`（4MB）+ `messages-worker.cjs`
- **1PW** = `electron-main/onepassword-connection-service.cjs`（107KB）
- 辅助产物（可复查）：`/tmp/grokbot-0.79.3/rpc-methods.txt`（330 条 desktop RPC）、`rpc-methods-mainapp.txt`（253 条 coordinator RPC）、`agent-tools.txt`（181 个 agent 工具）、`proto-messages.txt`（2520 条 proto 消息）、`i18n-en.json`（5568 条英文 UI 串）、`i18n-main-en.json`（主进程菜单串）

## 0. 架构总图（RPC 面完整索引）

PRELOAD 尾部（`exposeInMainWorld` 调用，idx≈142521）暴露 5 个 world：

| world | 内容 | 规模 |
|---|---|---|
| `desktop` | `main`（330 方法，见下）、`boot`（`sand:boot-snapshot-sync` sendSync 快照）、`environment`（platform/isDev/isWaylandClient/usesProductionBackend/devVoiceHarness）、`local`（getZoomFactor/stageAttachmentFile/noteRendererAlive/noteBootGateLanded/Opened） | 330 |
| `coordinatorPort` | MessagePort RPC（renderer↔coordinator），通道 `sand:coordinator-port-request` / `sand:coordinator-port` | 253 方法（MAINE `rpcMethod()` 注册表） |
| `desktopMount` | desktop-mount 面板 overlay（computer 控制面）：mount/unmount/offerChoices|Preview|MarkState|History/read*|startCapture|takeCapture/submitPrompt/planMenu/reachForMenu/movePanel 等 | 31 方法 |
| `sandPopout` | `{agentId}`（弹出窗口知道自己是哪个 bot） | — |
| `sandRenderTrace` | 渲染追踪（配 `startRpcTraceWindow`） | — |

**desktop.main 330 方法按域分组**（PRELOAD `Vf=be("main",{methods:{...gl,...Vl,...Jd,...Yl,...Wl,...Fl}})`，idx 108257–137840）：
- 窗口/外观：getWindowState/isWindowShown/minimize/focus/toggleMaximize/close/resizeWindowWidth/openChatPopout/setTitleBarOverlayTone/setViewingAgent/setComposingAgent/setComputerViewOpen/signalBoxIntent/getThemeState/setThemePreference/getBotColorInChatEnabled/setSpellCheckEnabled/getHardwareAcceleration
- 更新：getUpdateStatus/checkForUpdates/setUpdateTrack/quitAndInstallUpdate/getPendingRestartToUpdate/confirmRestartToUpdate/setAutoUpdateWhenIdle
- Bot/团队（GrokBot 前缀 ×~90）：Agent CRUD/share/invite/access/managers/skills/plugins/files/secrets/voice/meetings + Slack/Teams install 全套 + vault + secrets + marketplace + template
- MCP/连接器（×25）：addMcpServer/installEntry/authenticateMcpServer/listMcpServerTools/setMcpToolPermissions/getMcpCatalog/getEffectivePlugins/setGrokConnectorEnabled/Sharepoint
- 凭证：getCredentialsState/syncCredentialProvider/approveCredentialRequest/startCredentialMint/1Password 系
- 本机能力（×35）：transcribeAudio/dictation 四件套/synthesizeSpeech/attachments 十件套/pickAvatarFile/generateAgentAvatarImage/getLinkMetadata
- Computer/Box：forceRecreateComputer/updateComputer/getComputerUpgradeSchedule/schedule/reschedule/cancelComputerUpgrade/attachProdBoxStatus/readComputerUsePermissions/listComputerUseAllowedApps/Obsidian 三件套
- Messages/Mail（Apple）：checkMessagesPermissions/getMessagesCapabilities/setMacMailSendEnabled/listMessagesAllowedRecipients/retryMessagesPermissionCard
- 金融：getFinanceOverview/startFinanceLink/cart 四件套/virtual card（screenGrokBotCardImage/suggestAddresses/resolveAddress/generateShoppingTryOnImage）
- 网络：egress tunnel 四件套/webauthn proxy/runNetworkDiagnostics/team tailnet 四件套
- 杂：getExperimentsSnapshot/applyFeatureFlagOverride/refreshFeatureFlags/applyExperimentOverride + 6 个实验曝光日志、clientPersistence 六件套、getHostPinnedAgents/setHostPinnedAgents、getHostSidebarSections/setHostSidebarSections、canvas 十件套、document/library 七件套、botAnalytics/reviewItems/automations

**coordinator 253 方法**（MAINE）补齐对话域：sendPrompt/submitPrompt/sendDraft/discardDraft/interruptAgentRun/getAgentTranscript{,Page,Tail,Window}/conversationOutlineGet/resolveServerTranscriptTail/rollBackConversation/startFreshConversation/createThreadFromMessage/seedConversationName/reactToMessage/voteFeedback/getSubagents{,Get}/getAsyncTasks/kickstartAgent/ensureForeverBox/handBackForeverBox/getTrays/dismissTray/agentAutomations 全套/agentWorkflows 全套/teachRecording 三件套/voiceCall 六件套/cloudAgent 全套/deepLinkEmit/searchAgents/searchConversation/searchMedia/isGlobalSearchEnabled/webAuthn 五件套/clipboard 读写/readMainAgentContext/spawnLocalExecDaemon/mintLocalExecDaemonCredential/sealLocalExecFile/terminateProcess/isProcessAlive/report* 遥测。

**proto 词表 2520 条消息**（PROTO，按前缀：GrokBot* 345、Admin* 182、Sand* 49、Mcp* 37、Shell/exec 36、Agent/Session 58、Voice 17…）。Shell 结果五态：`ShellSuccess/Failure/Timeout/Rejected/PermissionDenied`（字段含 output_head/tail/elided_chars/oom_kill/pid/ms_to_wait/background_reason）。

CSP 自定义协议（renderer/index.html）：`sand-avatar:` `sand-favicon:` `sand-product-image:` `sand-media:` `sand-html-preview:` `sand-canvas:` `sand-mcp-app:` `sand-visualization:`；connect-src 仅 `ws:` + `https://grok.com`。

---

## 1. 主界面布局

| 功能 | 原版行为 | 锚点 | 我们 gap（`app/ui/renderer-grok/`，0.18 移植底） |
|---|---|---|---|
| 侧栏分区 | 用户自建 section：重命名/删除/上移/下移/折叠/拖拽排序（dnd） | APP `function Yat(` @1392649（onStartRename/onRenameSection/onDelete/onMoveUp/onMoveDown/onToggleCollapsed）+ RPC getHostSidebarSections/setHostSidebarSections | **缺失**（0.18 侧栏无分区） |
| 置顶 | host pins + server pins 双源；库 pin（listLibraryPins/setLibraryPin/mergeLibraryPins） | MAINE `getHostPinnedAgents`；PRELOAD @227-232 | **缺失** |
| 未读 | 未读过滤菜单（setUnreadFilterMenuChecked）、mark read/unread、dock「View Unread」、badge 计数 | PRELOAD @38；MAINE `View Unread`(5G1/yr)+`setBadgeCount`（dock-badge 报错护栏） | **缺失** |
| 隐藏 bot | 从侧栏隐藏不删除 | setAgentHiddenFromSidebar（APP @303389） | **缺失** |
| 新聊天栏 | 「To:」收件人 + 搜 Bot/Team Bot + 就地建 Bot（Type a name to create a Bot）+ 建 group chat + 加入群；限制「Only shared Bots can join group chats」「Bots on your machine can't share a room with a teammate's Bot」 | `chunk-new-chat-bar-CwYRlQ8d.js` 全部串 | **部分**（0.18 有 new-bot-dialog override；无收件人/群） |
| 聊天头部菜单 | copy_conversation_id、copy_link、delete、rename、mark_read/unread、retry、show_full_conversation、show_async_tasks、share_in_place、open_computer | APP @1310000–1326000 事件名 | **部分**（0.18 头部菜单子集） |
| 右侧面板 | ① Full conversation outline（per-subagent tab，见 UI 题3）② Async tasks ③ automation-detail-panel ④ team-bot-overview-panel ⑤ Bot exchange ⑥ computer view（desktop-mount panel + VNC） | chunk 名 + APP @1320205 | **缺失**（仅 0.18 自带面） |
| 弹出聊天 | Pop Out Chat（Cmd+Shift+O）独立窗口，`sandPopout.agentId` 绑定 | MAINE 菜单 60WFT5 + PRELOAD sandPopout | **缺失** |
| 窗口宽度 | resizeWindowWidth（deltaWidth）——窄/宽两档布局（CSS 断点 640/768/1024/1280 全响应式） | PRELOAD @25-31 + index.html 内联响应式 CSS | **部分**（响应式布局有，无显式调宽 RPC） |
| boot 体验 | #sand-boot-shell 占位 + boot gate（landed/opened）+ 渲染存活心跳 | PRELOAD 尾部 noteBootGateLanded/noteRendererAlive | 已有类似（shim boot-cover.ts） |

## 2. Bot 生命周期

创建流三入口、对话框、素材、动画：见 UI 题2（不重复）。其余：

| 功能 | 原版行为 | 锚点 | gap |
|---|---|---|---|
| 编辑 | updateAgent/updateGrokBotAgent（PROTO `UpdateOrCreateGrokBotAgentRequest` 同构）；头像编辑器（上传/拖/贴 <25MB、拖动定位、缩放、Reset、群头像拼合、AI 文生） | chunk-agent-avatar-editor + `pickAvatarFile/generateAgentAvatarImage/setAgentAvatarBytes` | **缺失**（无头像概念） |
| 声音 | 28 个命名音色（Altair…Zenith，`jdt` 数组 @APP ~3093k）+ 播放速度 0.5–2x | APP `var jdt=[{id:\`altair\`…}]`；setGrokBotAgentVoice/synthesizeSpeech | **缺失** |
| 删除 | deleteAgents/agentsDeleteMany，确认对话框 | MAINE + 我们已有 AgentDeleteConfirmation.tsx | 已有 |
| 复制 | duplicateAgent（RPC 存在；renderer 入口未定位，推测在 agent row actions） | MAINE rpc-methods-mainapp.txt | **缺失** |
| 归档 | **无归档功能**（"archive" 仅是文件类型词） | 全量 grep 证实 | —（原版即无） |
| 分享 | ① in-place share（shareGrokBotAgentInPlace + invite：create/preview/accept/revoke + eligibility）② publish 到 marketplace（publishGrokBotAgent/listPublicBotMarketplace/getPublicBotTemplate/unpublish）③ cloneGrokBotAgentToTeam ④ access 管理（get/update/removePerson + managers）⑤ setGrokBotAgentVisibility ⑥ share 卡（bot-share-* 七个 chunk + pre-share + use-bot-sharing + use-share-candidate-pages） | PRELOAD @168–202 | **缺失** |
| kickstart | 创建后自我介绍（可抑制 introduction_suppressed） | UI 题2(b) | **缺失** |
| Bot 设置面 | 五区：**Tools / Skills / Learnings / Routines / Analytics** + 「Configure sections」自选显示 | chunk-bot-configure-dialog（分区名串）| **部分**（我们 agent-settings.tsx 是 0.18 版） |
| Skills 管理 | 名称+步骤指令编辑、从我的技能库添加、设为私有、发布（publishSkill/getSkillPublishTargets/skillsCatalog） | chunk-bot-manage-knowledge | **部分**（0.18 有 skills-dialog） |
| Learnings 审批 | bot 学到的记忆/技能进待审队列：Approve/Reject/Review in chat/Review all；个人记忆 + 团队共享记忆（promoteGrokBotMemoriesToTeam） | bot-configure-dialog + listBotReviewItems/resolveBotReviewItem/summarizeBotReviewItems | **缺失** |
| Analytics | Messages、Hours saved（AI 估算）、DAU/WAU、Top users、每日消息图、累计节省时长 | bot-configure-dialog + getBotAnalytics | **缺失** |
| Bot 账号 | 「Bot's vault login」给 bot 存独立账号密码；service accounts（团队）；「Connect an app as this Bot」 | bot-manage-screen + putGrokBotVaultCredential/listTeamBotVaultLogins | **缺失** |
| Automations | 定时/触发例行：create/update/delete/enable/listAll/runNow/rerunFromCard/webhook（getAutomationWebhookCredential/runAutomationWebhook） | MAINE + chunk-automation-detail-panel | **缺失** |
| Workflows | createAgentWorkflow/import from URL/text/runNow | MAINE + chunk-agent-workflow* | **缺失** |
| Bot 文件库 | listGrokBotAgentFiles/upload/delete/makePrivate + user store files + bot-store-files-library chunk | PRELOAD @220–226 | **缺失** |
| 团队 Bot | team-bot-* 全家：overview/details/access plan/alerts/service accounts/memories/context/plugins/teammate intro/share card | 20+ chunk | **缺失** |

## 3. 消息与输入

| 功能 | 原版行为 | 锚点 | gap |
|---|---|---|---|
| @ 提及 | @ 菜单提 bots 和 plugins（未连接插件直接 startConnecting），有 recents | chunk-prompt-editor @74221（`sand-mention-menu-item`、flag `sand_hide_at_mentions`/`grok_bot_mention_unconnected_plugins`、mentionRecents/recordMentionRecent） | **缺失**（0.18 编辑器无 mention） |
| 斜杠命令 | 存在，flag `sand_hide_slash_commands` 门控（具体命令清单静态未枚举，见局限） | prompt-editor @74866 | **缺失** |
| Emoji | picker + recents（flag `sand_emoticon_to_emoji`）+ 40 语言 emoji 数据 | prompt-editor + chunk-emoji-messages.*（40 文件） | **缺失** |
| 附件 | staging 管线：stage→commit/discard/preupload（预上传）/precaption（预字幕）→ resolveMedia/readText/readBytes/readChunk/readImage/download | PRELOAD @88–100（十件套） | **部分**（0.18 有基本附件） |
| 听写 | start/push/stop/cancelDictation + transcribeAudio（语音转文字输入） | PRELOAD @238–242 | **缺失** |
| TTS/语音条 | synthesizeSpeech 28 音色；voice-memo-bubble；播放 0.5–2x | jdt 数组 + chunk-voice-memo-bubble | **缺失** |
| User form | bot 用 RequestUserForm 工具向用户要结构化输入；inline-user-form chunk；submitUserForm/dismissUserForm | DAEMON 工具枚举 + chunk-inline-user-form | **缺失** |
| 草稿 | sendDraft/discardDraft + draft revisions（use-draft-revision-highlight）+ elevated-draft-fields + 发送失败卡（draft-send-error） | MAINE + 3 chunk | **部分** |
| 回应 | reactToMessage（表情）；SendFeedback 工具 + voteFeedback（👍反馈） | APP @301120/@301217 + chunk-reaction? 我们已有 reaction-root.tsx | 已有（0.18 底） |
| 分支 | 从消息开新线程 createThreadFromMessage | APP @301164 | **缺失** |
| 回滚 | rollBackConversation（回滚到某消息重走） | APP @302309 | **缺失** |
| 搜索 | new-chat-bar 搜 Bot；global search RPC（isGlobalSearchEnabled/searchConversation/searchAgents/searchMedia）在 coordinator 面；**未见 renderer 内全局搜索 UI 入口**（静态） | chunk-new-chat-bar + MAINE | **缺失** |

## 4. 会话管理

| 功能 | 原版行为 | 锚点 | gap |
|---|---|---|---|
| 多会话 | 每 agent 多 thread：listGrokBotAgentSessions/getAgentThread/getAgentTranscript{Page,Tail,Window}/openAgentTail（分页拉取） | MAINE | **缺失**（0.18 单会话/简单列表） |
| 自动标题 | seedConversationName；可 rename | APP @302058 | **缺失** |
| 新会话 | startFreshConversation（不清历史） | APP @302257 | **部分** |
| 已读 | mark read/unread + setAgentUnread + 未读过滤 | PRELOAD/APP | **缺失** |
| transcript 一致性 | 多源 transcript（server tail + 本地）带 parity/rowLoss/source 上报 | resolveServerTranscriptTail/reportTranscriptParity/reportTranscriptRowLoss（MAINE） | **缺失** |

## 5. 工具与过程呈现

主聊天 + outline + 任务卡 + subagent：**全部见 UI 题1/题3，不重复**。补充面：

| 功能 | 原版行为 | 锚点 | gap |
|---|---|---|---|
| 文件预览 | 全屏查看器（fullscreen-file-viewer-body）、text-viewer、document-page、pdf、xlsx、图片、library-visual-viewer；附件按类型计数（markdown/spreadsheet/JSON/text/document/archive） | chunk 名 + APP @294452（ife 类型表） | **部分**（0.18 基本渲染） |
| 可视化 | d3/three 运行时（visualization-d3/three-runtime.gen）+ visualization-document + stageVisualizationDocument + sand-diagram-render；`sand-visualization:` iframe 隔离 | chunk 名 + CSP | **缺失** |
| Canvas | EditCanvas/ListCanvases/WriteCanvasAsset 工具 + `sand-canvas:` iframe + canvas 分享（getCanvasShare/setCanvasVisibility/rename/delete） | 工具枚举 + PRELOAD @5–14 | **缺失** |
| 代码/数学渲染 | shiki 语法高亮（60+ 语言 chunk：clojure…zig）+ incremental tokenizer + token cache；katex 数学 | chunk-shiki-* / chunk-markdown-math-katex | **部分** |
| HTML/MCP app | `sand-html-preview:` / `sand-mcp-app:` iframe 嵌第三方 app 面 | CSP + readMcpAppDocument/callMcpAppTool/stageMcpAppDocument | **缺失** |
| 图片呈现 | `sand-media://image` 协议 + resolveAttachmentMedia/readAttachmentImage；购物 try-on 生成图 | CSP + PRELOAD @88 | **部分** |

## 6. 桌面集成

| 功能 | 原版行为 | 锚点 | gap（我们 dsh/壳层） |
|---|---|---|---|
| 菜单栏/托盘 roster | macOS 菜单栏显示 bot 头像 roster（全部 24 形状 PNG + working 态图）；点击 showApp/openAgent；flag `sand_menubar_tray`（默认关） | MAINE `qxt(...)`（@~尾部，assetsDir=menubar-tray/assets, roster, rosterPhotos, openAgent, openSettings）+ menubar-tray/assets/（30+ PNG） | **缺失** |
| Dock 菜单 | bot 项带 `CommandOrControl+Shift+1..9` 快捷槽 + open-app + Settings(Cmd+,) + Quit；working 态 glyph | MAINE `uir`（accelerator:`CommandOrControl+Shift+${shortcutSlot}`） | **缺失** |
| Dock badge | roster 未读计数投影 setBadgeCount | MAINE `a4`/`Za` | **缺失** |
| 应用菜单 | App 子菜单（Services/Hide/HideOthers/ShowAll/Quit）；File：Reload(Cmd+R)、View Unread、Pop Out Chat(Cmd+Shift+O)、Toggle DevTools；Edit 角色（cut/copy/paste/selectAll）；View：F11/Toggle Full Screen；Help：Help Center（docs.x.ai/grok-bot）、Keyboard Shortcuts、Send Feedback；更新项（Check for Updates/Restart to Update） | MAINE `wEn` 菜单模板（accelerators: CmdOrCtrl+,/Q/R/Shift+O/F11/Z/X/C/V/A） | **部分**（我们有自己的菜单） |
| 通知 | 权限申请 + 偏好（get/setDesktopNotificationPreferences）+ 每通知声音开关（notification-sound-enabled/sound 设置键）+ 通知头像（getAgentNotificationAvatar）+ 桌面空闲时才推（flag grok_bot_hold_push_until_desktop_inactive） | PRELOAD @1–3/@47–48 + settings map | **部分**（有通知无此细度） |
| 电源感知 | powerMonitor suspend/resume/lock-screen/unlock-screen/user-did-resign/become-active（活跃/离场判定） | MAINE powerMonitor×6 | **缺失** |
| 深链 | `grokbot://` scheme：开 app、focus-agent、`grokbot://mcp/oauth/callback`（MCP OAuth 回环）；cursor MCP OAuth 走 cursor://+localhost:8787 | MAINE @16036/@1175085 + deepLinkEmit RPC | **缺失** |
| 自动更新 | track 可选（setUpdateTrack）、quitAndInstall、pending restart 确认、空闲时自动更（setAutoUpdateWhenIdle） | PRELOAD @59–65 | **部分** |
| 剪贴板 | readClipboard/writeClipboard（coordinator，供 computer-use）+ 本机 clipboard 读写 | MAINE | **部分** |
| 屏幕捕获 | capture-overlay（区域选择、pointerAt、takeCapture、pickRegion）——computer-use 的取屏面 | preload-desktop-mount-capture-overlay + desktopMount 31 方法 | **缺失** |
| 单实例/网络 | second-instance、`sand:network-online`、Wayland client 适配、硬件加速开关、拼写检查、zoom | MAINE/PRELOAD | 已有等价 |
| WebAuthn 代理 | bot 可用用户 passkeys 登网站：requestWebAuthnCeremony/Consent/Pin + finishConsent + 设置开关 | MAINE + settings(`security-keys`,`passkeys`) | **缺失** |
| Egress tunnel | 本地流量路由（egress tunnel claim/status）；团队管理员可禁用（「Your team admin has turned off local traffic routing…」） | PRELOAD @52–55 + MAINC 串 | **缺失** |
| 网络诊断 | runNetworkDiagnostics + network-debugger-dialog chunk | PRELOAD @58 | **缺失** |

## 7. 设置面

设置对话框导航 7 区（APP `var js` 映射 + 分区定义 @1848–1853k）：

**General / Texting / Computer / Permissions / Vault / Usage and billing / Updates**（图标 settings-gear/chat-bubbles/display/shield/vault/chart-bars/cloud-download；permissions/integrations/vault 有 flag 门控：`sand_permissions_panel`/`grok_bot_messaging`/`grok_bot_vault`）

settings key→区 完整映射（43 键，APP `var js=[[`account`,`general`]…]`）：
- **general**（14）：account、theme、accent、language、spell-check、microphone、hardware-acceleration(+restart)、network-debugger、notification-sound-enabled、notification-sound、model、timezone、auto-review(+rules)、import-memory；另挂 security-keys、passkeys、team-bot-connector-preferences、team-bot-connector-shared-space-allowlist、team-bot-link-previews、team-bot-slack-link、team-bot-microsoft-teams-link
- **computer**（11）：local-execution、computers、messages、messages-send、messages-send-without-asking、messages-allowed-recipients、egress、update-computer、reset-computer
- **vault**（1 区）：vault
- **usage**（6）：usage、plan、cancel-trial、on-demand、billing + usage 子面（usage-breakdown、personal-usage、grok-bot-usage、usage-resets、manage-plan、my-plan、usage-limits、additional-usage、unified-plan）
- **updates**（3）：update-status、update-channel、automatic-updates
- 子标题层：appearance、notifications、threads、system、bot、contacts、linked-numbers、your-computer、manage-devices、computer-use、bot-computer、always-ask-rules、allow-without-asking-rules、reference-photos

其它设置面证据：数据共享开关（general-pane：「Improve Grok Bot and other products…适用于 Grok Bot、Grok 和 Cursor」）；profile 自拍照（<2MB）；语言偏好（get/setLanguagePreference）；时区覆盖；自动审查指令上限 `SAND_AUTO_REVIEW_INSTRUCTION_MAX_ENTRIES`。

**我们 gap**：0.18 settings-panels/settings-view 移植存在但键面远小于此；Texting/Permissions/Vault/Usage 区整区缺失。

## 8. 账号与团队

| 功能 | 原版行为 | 锚点 | gap |
|---|---|---|---|
| 账号 | getGrokBotUserProfile + 自拍设置/删除（<2MB）；账号刷新状态机（reloadAccount/auth refresh/scope ready）；devLogin（dev 环境） | PRELOAD @157–160 + MAINE `noteAuthStatus` 状态机 | **部分**（pbots 账号自有） |
| 团队切换 | selectedTeamId + fallback notice（acknowledgeFallback）；team member policy；ConvertToTeam 工具；invite teammates 实验 | MAINE + 工具枚举 | **缺失** |
| 团队 Bot | 见 §2 team-bot 行 | 20+ chunk | **缺失** |
| Slack | install/reinstall/uninstall app、账号连接、加入团队列表、reconnect URL、automation workspace 绑定、bot added-to-Slack 面 | PRELOAD @170–174 + chunk-grok-bot-slack-dialog-live/bot-slack-copy | **缺失** |
| Microsoft Teams | 等价全家（install/join/add-to-team/link/unlink） | PRELOAD @129–139 + team-bot-teams-flow-dialog | **缺失** |
| 手机短信 | 手机 link code 绑定（issueGrokBotMessagingLinkCode/linkedPhones/unlink）、SMS 回退文案、联系人卡 | PRELOAD @163–167 + settings 串 | **缺失** |
| 1Password | 独立连接服务进程（1PW 107KB）+ RequestOnePasswordConnect/Logins 工具 + vault 迁移预览 + previous-vault-note + browser 内填 | 1PW + 工具枚举 + chunk-onepassword-previous-vault-note | **缺失** |
| SCM | RequestScmConnect/completeGithubConnect/disconnectScmConnection | MAINE | **缺失** |
| 凭证 | credential mint/approve/deny + provider OAuth + bot 委托凭证 + FillCredential/BrowserSecureFill/ListAvailableSecureValues/ListCredentials 工具 | PRELOAD @256–277 + 工具枚举 | **部分**（dsh 有凭证概念，无此面） |
| Vault | 个人/团队 vault：logins/cards/contacts CRUD + 过期提醒（「access expires in …」）+ vault-card-dialog/editor | PRELOAD @140–152 + chunk-vault-* | **缺失** |

## 9. Agent 编排面

| 功能 | 原版行为 | 锚点 | gap |
|---|---|---|---|
| coordinator 协议 | MessagePort RPC + boot snapshot + 心跳 + 断线重连 + transport stage/parity/rowLoss 上报 + backend reachability + gateway（resolveGatewayConnection/forceReconnect/setGatewayPaused/DNS 诊断） | MAINE report* 系列 | **部分**（我们 coordinator.ts shim 是协议 v1 子集） |
| subagent 协议 | 工具创建（CheckSubagent/MessageSubagent/StopSubagent/WakeParent）+ 注册表快照/推送 + outline tab + 任务卡 | UI 题3 全文 + COORD @1030302–1036032 | **缺失** |
| **agent 工具枚举 181 个**（COORD `var Fe={AddMcpServer:…}` @1029900） | 聚类：OS（Computer/Screenshot/Shell/UiMap + IOS×7 + Mac×6 + DeviceGetLocation）；通讯（Slack/Teams/iMessage/Email/Meeting/place_phone_call/PresentCallQuestion）；搜索（WebSearch/WebFetch/PlacesSearch/RestaurantSearch/Flight*/ProductSearch/WeatherForecast）；subagent×4；CloudAgent；文件（Copy Bot/Box 间、Upload/Download、SaveToLibrary）；Canvas/Document×8；记忆（RecallMemory/UpdateMemory/SortMemories）；MCP×12；凭证×8；任务（Create/Read/UpdateTask）；支付（RequestVirtualCard/PayTextedOrder/ReserveTable）；团队（PublishToTeam/ConvertToTeam/SearchTeamBots/ProposeCarryOver）；交互（RequestUserForm/Offer*/SendPoll/ReportSignInAttempt/ReportSiteBlocked/SetPageData/UpdateAppHome）；bot 自管理（CreateAgent/UpdateAgent/UpdateAvatar/SetPrimaryBot/UpdateRoutine/ProposeRuleChange/ProposeSkills/UpdateSkill/SearchBotTemplates） | `/tmp/grokbot-0.79.3/agent-tools.txt` | 我们 dsh 工具面 ≪ 此（这是我们工具面差距的总目录） |
| ForeverBox/computer-use | ensure/update/handBackForeverBox + VNC（preload-vnc 49KB + `vncUrl`）+ box-desktop-modal + computer-screen-preview + computer 权限（readComputerUsePermissions/allowedApps/revoke）+ signalBoxIntent/noteBoxAsleep/Hibernated/Running | MAINE + COORD @1027465 + PRELOAD | **缺失**（我们 dsh 无 box 概念） |
| Cloud agent | openCloudAgent/stopCloudAgent/info/conversation/artifacts + 发布提案（confirm/dismiss proposals）+ published apps（list/unpublish/update + app secrets + gate ticket）+ elevated 卡 + Open exchange 面板 | MAINE + chunk-cloud-agent-* + UI 题3(f) | **缺失** |
| 语音通话 | getVoiceCall/nudge/setPresence/record/readSentMessages/previewVoice + phone-call/phone-call-send-card/voice-call-feedback-card chunk + unrequested-meeting-approval | MAINE + 4 chunk | **缺失** |
| Teach 模式 | start/stop/getTeachRecordingStatus + teach-recording-controls（教 bot 做事并录制） | MAINE + chunk | **缺失** |
| Channels | getAgentChannels/connect/disconnect/refreshChannel（bot 接入 Slack/Teams 频道）；listener integrations（getListenerIntegrations/ConnectUrl/disconnect） | MAINE | **缺失** |
| Widgets | dismissWidget/respondToWidget + chunk-widget/chat-widget（bot 推卡片交互） | MAINE + chunk | **缺失** |
| 建议 | dismissAgentSuggestions + bot 主动建议面 | MAINE | **缺失** |
| Trays | getTrays/dismissTray/clearTrays（独立于 dock 的托盘通知队列） | MAINE | **缺失** |

## 10. 本地执行（local-exec-daemon ↔ 我们的 dsh 对应层）

| 功能 | 原版行为 | 锚点 | gap（dsh） |
|---|---|---|---|
| 生命周期 | spawnLocalExecDaemon + mint credential（mintLocalExecDaemonCredential）+ sealLocalExecFile（文件封印）；退出原因枚举：superseded（发现记录指向新 daemon）/unsupervised（桌面失联）/SIGTERM/SIGINT；heartbeat；supervisor 失败上报 | DAEMON `l$t={superseded:…}` @1974800 + MAINE spawn/mint/seal | **部分**（dsh 进程模型自有，无凭证封印） |
| 路径围栏 | root = `SAND_LOCAL_EXEC_ROOT` ‖ `SAND_AGENT_PROJECT_DIR` ‖ home；越界路径拒绝（含 symlink 逃逸 realpath 检查，`SandLocalExecPathError`）；cwd 不存在回退 root 并附 notice | DAEMON `n9/Tft` @~3005900（`Path is outside the allowed local-exec root and was refused`） | **缺失**（dsh 无路径围栏语义） |
| 团队 repo 策略 | getTeamRepos → repo 清单 + allowedRepos glob 白名单；按 git remote URL 匹配 + 文件相对路径 glob；非 repo 路径按白名单；`disableLocalExecAllowlistEnforcement` 可关；cursor 数据目录豁免 | DAEMON `isRepoBlocked/checkRepoBlocked` @2565000（gitRemoteUrlCache/gitRootCache） | **缺失** |
| Shell 执行 | 流式 shell（shellStream）+ 后台 shell（backgroundShellSpawn，keepBackgroundJobs）+ AwaitShell；结果五态（Success/Failure/Timeout/Rejected/PermissionDenied）+ output head/tail/elided_chars + oom_kill + pid + 本地/daemon 双计时 | PROTO Shell* 消息 + DAEMON case 表 | **部分**（dsh 有 shell，无五态契约/输出截断协议） |
| 审批面 | local tool permission：ask/allow 规则（settings `always-ask-rules`/`allow-without-asking-rules`）、一次性/长期授权（recordLocalToolApproval/StandingGrant/ActionGrant/clear）、resolveLocalToolPermission、auto-review（指令集+规则+usage-review-gate/request） | PRELOAD @73–85 + settings + chunk-auto-review-*/sand-auto-review-instructions/sand-rule-text-diff | **部分**（我们只有 Allow once/Deny once，P5-31） |
| MCP/WebFetch 门 | daemon 侧钩子：shouldBlockMcp/isMcpFullyAllowlisted/isWebFetchFullyAllowlisted/addToAllowList/addToDenyList/shouldBlockShellCommand | DAEMON @3005100 | **缺失** |
| Apple Messages/Mail | messages-worker.cjs（121KB）：iMessage 发送审批（send-imessage-approval）、Mac Mail 发送审批、权限（contacts/fullDiskAccess/automation）、允许收件人名单、RCS/SMS 回退 | DAEMON worker + PRELOAD @305–324 + settings computer 区 | **缺失**（平台专属） |
| agent 环境 | `CURSOR_AGENT=1`/`SAND_AGENT=1` env；`~/.grokbot` 数据目录；`/home/box/{sand-data,agent-data,reference,sand-reference}`；agent 参考文档三份（debugging-the-box.md / app-ui.md / app-actions.md）——**给 agent 看的 box 自述文档** | DAEMON @1974900 + MAIN 入口常量 | 有趣对照：我们 dsh 有 CLAUDE.md 体系，等价物已有 |

## 11. 其它

| 维度 | 原版 | 锚点 | gap |
|---|---|---|---|
| 集成图标 28 | amex apollo ashby box calendly canva clay databricks google-maps mailchimp microsoft-teams nooks quickbooks rippling salesforce snowflake tableau telegram whatsapp workday yelp zoominfo + link/x 品牌标 | renderer/assets/*.svg/png 清单 | **缺失**（无连接器生态） |
| MCP 生态 | catalog + team popularity + custom form + user-custom-connector + grok connectors + sharepoint 写 + plugin install/uninstall/sync/reconcile | PRELOAD @278–300 + 5 chunk | **部分**（pbots 有 MCP 概念，面小） |
| 金融/购物 | finance overview + 银行连接、virtual card（申请/审批 resolveVirtualCardApproval/结账 virtual-card-checkout/order-checkout/receipt-shell/cart/top-up/top-up-recipe）、购物 try-on 图、ReserveTable/FlightSearch/PayTextedOrder 工具 | PRELOAD @233–235/@301–303 + 7 chunk + 工具枚举 | **缺失** |
| i18n | 主进程 37 locale 目录 + renderer 39 个 settings locale chunk + 40 个 emoji locale + 语言偏好设置 | electron-main/locales/ + chunk-settings-*（逐个确认 pt/mr/ru/fi/th/it/de/nl/ta/cs/tr/bn/te/ur/vi/es/ja/hu/pl/sl/hi/sv/pt-pt/sw/ar/id/da/fr/uk/el/ko/no/ha/zh-Hant/he/zh-Hans/af…） | **缺失**（我们仅英文） |
| 无障碍 | aria-label 全覆盖（role:alert 错误、aria-hidden 图标、aria-label 输入）、Keyboard Shortcuts 帮助页 | 各组件 + 菜单 h7MgpO | 未系统审计（见局限） |
| 性能行为 | 641 chunk 懒加载（eager 只装 app/common/vendor/platform 四个）；per-locale 懒加载；shiki incremental tokenizer + token cache；transcript 分页（Page/Tail/Window）；boot gate；Sentry 接入；render trace | assets 结构 + chunk 名 | 我们构建粒度较粗 |
| Feature flags | 数十个 `sand_*`/`grok_bot_*`/`glass_*` flag（client 默认值 + 服务端覆盖 + 本地 override + 实验曝光日志）——pumpkin/invite_teammates/menubar_tray/hold_push_until_desktop_inactive/away_park/client_pause 等 | MAINE flag 表 @开头 + PRELOAD @108–118 | **缺失**（无 flag 体系） |

---

## 体验差距 Top 20（用户可感知面，按影响排序）

1. **程序化吉祥物体系**（24 形状×11 色、53 状态、眼随指针、poke）——贯穿侧栏/菜单栏/托盘/状态行/onboarding 的人格载体，是「Grok Bot 感」的最大单一来源（UI 题2）。
2. **过程呈现模型**：thinking/tool-call 不进聊天流，改由状态行短语引擎（800ms/5s/2.5s/60s 节奏）+ 头像状态动画呈现，中间轮次 `suppressed` 隐藏——「首答+终答」形态的直接原因（UI 题1）。
3. **Full conversation outline 侧板**：opt-in 看全部过程，per-subagent tab + 2s 轮询 + 状态点（UI 题1e/3c）。
4. **任务卡面板**：Subagent/Shell/Cloud agent 三类卡 + working 判定 + computer-use 直开 VNC（UI 题3d/e）。
5. **Bot 设置面五区**（Tools/Skills/Learnings/Routines/Analytics）+ learnings 审批流 + 用量分析图表——bot 是有「经营面」的对象。
6. **Onboarding 电影化分镜**（7 step × beat 轴 × 3 演示 bot 编舞）+ 42 模板目录 + Help me create（UI 题2）。
7. **桌面集成包**：菜单栏 roster + dock 菜单（Cmd+Shift+N 开 bot）+ badge + 通知（声音/按 bot/空闲感知）+ Pop Out Chat + View Unread。
8. **分享体系**：in-place share/invite 链接/publish marketplace/clone to team + 分享披露横幅 + 预览页（10+ chunk）。
9. **@ 提及 + 群聊**：@bots/@plugins（未连接即引导连接）、群头像堆叠 typing、群成员管理。
10. **输入面**：附件 staging（预上传/预字幕）、听写、语音条、TTS 28 音色 0.5–2x、emoji picker、user form。
11. **跨 bot 消息呈现**：fromAgent/toAgent 归属 + cloud-agent 分组 + Bot exchange 面板（UI 题3f）。
12. **Computer view**：desktop-mount 面板（capture overlay、planMenu/reachForMenu）+ ForeverBox VNC 观看 + 升级/重置调度。
13. **Cloud agent**：elevated 卡、发布提案、artifacts、published apps + secrets。
14. **消息操作集**：表情回应、👍反馈、从消息开线程、回滚会话、retry、copy link。
15. **会话面**：多会话 + 自动标题 + 未读/pin/过滤 + start fresh。
16. **Slack/Teams/手机短信**：bot 进团队通讯工具 + 手机 link code 短信可达。
17. **Automations/Workflows**：定时例行 + webhook + 从 URL/文本导入工作流。
18. **Vault/凭证面**：1Password、bot 自有账号、安全填充、passkeys 代理、团队 vault + 过期。
19. **180+ agent 工具面**（§9 表）——bot 能做的事的边界，远超当前 dsh（尤其通讯/会议/金融/记忆/团队类）。
20. **i18n 39 语言 + 主题/accent/model/timezone 等 General 设置细度**。

（21–25 备选：可视化 d3/three、canvas、shiki 代码高亮细度、feature flag 体系、egress tunnel。）

## 遗漏声明（没查到/没查透）

1. **斜杠命令清单**：只确认存在与 flag 门控，具体命令枚举需跑运行时或深挖 prompt-editor 数据流，未做。
2. **全局搜索 UI**：RPC 面有 searchConversation/isGlobalSearchEnabled，但 renderer 静态未找到入口组件——可能在 flag 后或命令面板内，未证实。
3. **主题枚举值**（light/dark/system 具体集合）与 accent 色集：正则没抓到枚举定义，未列。
4. **a11y**：只确认 aria 惯例存在，未按组件审计。
5. **desktop-mount panel.html / capture-overlay.html**（未压缩源码在 renderer/src/electron-renderer/）未逐行读——computer 控制面的交互细节（planMenu/reachForMenu 的具体编排）只有方法名级证据。
6. **proto 2520 消息**只做了前缀聚类和 Shell 深读；各域字段级 schema 未逐个展开（后续单点 RE 的素材在 `/tmp/grokbot-0.79.3/proto-messages.txt`）。
7. **1PW 服务进程**（107KB）与 `preload-vnc.cjs`（49KB）只确认职责，未读内部协议。
8. **服务端行为**（suppressed 打标、outline 生成、模板实例化、推送策略）照旧不可见——产物内只有消费端。
9. **运行时验证**：全部为静态结论，未执行产物；「用户看到什么」由代码路径推出。
10. 我们的 gap 列基于 `app/ui/renderer-grok/`（0.18 移植 + 24 个 override 模块）文件面与 shim 能力面的对照，未逐模块核对 0.18 上游已有的细节（如 0.18 transcript 已有什么渲染分支）。
