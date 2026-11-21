# AUDIT：原版功能面穷举 × 我们的接线现状（exp-polish BRIEF 2026-11-09 追加段）

> manager (Opus 5.5)，2026-11-09，任务 A。纯读 + grep，未跑构建 / e2e，未派 agent，未改产品代码。
> 结论全部是**静态判定**（读代码路径推出「用户看到什么」）；标「静态」的行没有实跑过。

## 0. 口径（先更正一个前提）

1. **`frontend/src/recovered/` 不是 0.79.3 源码。** 它是 `b-nnett/grok-bot-0.18-reconstructed@a9f633e` 的重构树（每个文件第 1 行 `来源:` 头，`SOURCES.tsv` 276 行，实数 276 个文件，不是 332）。0.79.3 只有打包产物：`/tmp/grokbot-0.79.3/extracted/dist/`（renderer 716 个 asset，minified）+ 既有普查 `work/grok-0.79.3-re/RE-FULL-0.79.3.md`（330 desktop RPC / 253 coordinator RPC / 181 agent 工具 / 5568 条 en 串）。
   所以本表是两层对照：**0.79.3 有什么**（规格，来自 RE-FULL + i18n 串 + bundle 定点 grep）× **0.18 重构树里有没有现成零件**（recovered）× **我们接没接**（overrides + shim + main）。
2. 关键事实：0.18 的 `ProductionRenderer.tsx` 已经**挂载了 recovered 里几乎所有 feature**（hidden-chats、routines、async-tasks、avatar-editor、channels、org-chart、teach-recording、find-in-chat、voice……都有 import）。所以「没集成」几乎都不是缺 UI，而是**三种掐法之一**：
   - shim 回空 / 能力关：`shim/src/desktop.ts`（`transcribeAudio→''` :256、`pickAvatarFile→null` :259、`stageAttachmentBytes→failed` :272、`getLinkMetadata→null` :265、`mcp.*` 全空 :170-187）、`shim/src/coordinator.ts:30-48`（`getAsyncTasks/listAllAutomations/getSubagents→[]`，其余未知方法 `unknown-method`）
   - 模块覆盖剥 prop：`overrides/modules/{sidebar,transcript,chat-header,agent-row-actions-model,computer-view,settings-view,settings-panels,CommandPalette}.*`
   - CSS 藏：`overrides/dead-entries.css`（附件 / 语音钮 :17-18、账户菜单 :23、搜索 tab :30-31、通知开关与头像编辑 :43-44）
3. 四层（照 scout E 口径，本表自定义如下）：
   - **已接线**：我们的数据层让原版行为成立（含「按设计收窄」，如审批卡只两钮）
   - **部分**：入口在、行为缺块
   - **未接线**：原版有，我们被掐掉或从没接；**用户可感知**
   - **不适用**：依赖 xAI/Cursor 服务端、macOS 专属、或被既有硬决策排除（D9 凭证永拒、L-AP 审批语义）；或 0.79.3 已删
4. 「零件」列：**R** = recovered 里有现成 UI/逻辑；**79** = 只有 0.79.3 产物有（要逆向搬或自建）；**dsh** = dsh 已有后端包。**成本「低」= R 在 + 只差 shim/override 接线；「中」= 还要 main 侧新口子或 M1 白名单外的 dsh 能力；「高」= 79-only 或要新后端。**

## 1. 大表

### C 对话与输入

| # | 功能面 | 原版做什么（证据） | 零件 | 我们现状 | 层 | 用户场景 | 量级 |
|---|---|---|---|---|---|---|---|
| C1 | 发送 / 排队 / 失败重试 / 停止 | queue 模式发、失败卡 Resend、运行中 Stop | R | P5-W3 R5（acknowledgement/coordinator-client 覆盖）、P5-57 chat-header Stop | 已接线 | — | — |
| C2 | 草稿 | 每 bot 草稿跨切换 / 重启保留 | R `draft-state.ts` | `ProductionRenderer:775` 经 `clientPersistence`（desktop.ts:235-243 落 localStorage） | 已接线（静态） | — | — |
| C3 | **附件：图片 / 文件** | composer Attach / 粘贴 / 拖放，staging 管线（RE-FULL §3「附件」；i18n `x9ecE4` Attach file、`N7m8E+` Attach files） | R composer + media-viewer；dsh `dsh-attachment`（图片 PNG/JPEG/WebP/GIF 进 prompt、文件按路径读） | 钮被 `dead-entries.css:17` 藏；`desktop.ts:272` stage 恒 failed；`data.ts:545` 只发 `{type:'text'}` | 未接线 | 「把这张截图 / 这份 PDF 发给 bot 看」 | 中 |
| C4 | 听写（语音转文字输入） | composer 麦克风「Click or hold to dictate」（`mwHVVa` Dictate）+ 麦克风选择 | R `voice.tsx`（487 行） | 钮被 `dead-entries.css:18` 藏；`transcribeAudio→{text:''}` desktop.ts:256 | 未接线 | 「按住说话，松开变文字」 | 中（STT 后端未定 → Q-041） |
| C5 | TTS / 语音条 / 28 音色 / 语音通话 | voice-memo-bubble、phone-call 卡（RE-FULL §3） | 79 | 无 | 不适用（服务端合成） | — | — |
| C6 | @ 提及 bots / plugins | prompt-editor mention 菜单 + recents（RE-FULL §3） | 79（R 只有 MCP/PR 引用 provider，`mcp.list→[]`） | 无 | 未接线 | 「@某个 worker 让它接手」 | 高 |
| C7 | 斜杠命令 | flag `sand_hide_slash_commands` 门控 | 79 | 无 | 不适用（原版默认藏） | — | — |
| C8 | Emoji picker | composer emoji + recents（`Choose an emoji`/`Search emoji`） | R `emoji-picker-content.tsx`（**无任何文件 import**） | 无 | 未接线 | 输入框插 emoji | 低价值 |
| C9 | 回复 / 引用某条消息 | 悬浮 Reply、composer「Replying to」、消息上「In reply to」（`ImOQa9`、`N+hFIL`） | R `reply-preview.tsx` `reply-thread-controller.ts` | `overrides/modules/transcript.tsx:114` `onReply={undefined}` | 未接线 | 「针对上面那条回复」 | 低-中（dsh 不懂引用：引用文本拼进 prompt + 本地记引用关系） |
| C10 | 线程（Reply in thread） | createThreadFromMessage | R | `onStartThread={undefined}`（同上） | 未接线 | 从一条消息开支线 | 高（要 dsh 会话分叉语义） |
| C11 | 回滚 / Start fresh | rollBackConversation / startFreshConversation（`Start fresh`） | 79 | 无 | 未接线 | 「从这里重来」 | 高（暂不排） |
| C12 | 表情回应 | Add reaction / Quick reactions；**回应会唤醒 bot**（`Bot failed to resume after reaction`、触发器「On a reaction」） | R reaction-picker / reaction-actions | `transcript.tsx:114` 剥 `renderMessageReactionActions` | 未接线 | 给 bot 的回答点 👍 让它继续 | 中 |
| C13 | 👍 反馈投票 | voteFeedback / SendFeedback | 79 | 无 | 不适用（训练反馈回服务端） | — | — |
| C14 | 复制消息 | More → Copy | R | transcript.tsx 保留 | 已接线 | — | — |
| C15 | 聊天内查找 Ctrl+F | `pF1b7U` Find in chat | R `find-in-chat*` | `ProductionRenderer:2830` 不门控 | 已接线（静态） | — | — |
| C16 | Markdown / 代码 / mermaid / 数学 | 0.79.3 另有 shiki 60+ 语言高亮 + 代码 Copy | R transcript.tsx（mermaid/math）；高亮 79 | 0.18 级渲染在 | 部分 | 代码块有语法高亮 | 中 |
| C17 | 链接预览卡 | url-card（`Link previews`） | R `url-card.ts` | `getLinkMetadata→null` desktop.ts:265 | 未接线 | 贴链接出卡片 | 中（main 抓 OG 有 SSRF 面，需审） |

### K 对话流里的卡片

| # | 功能面 | 原版做什么 | 零件 | 我们现状 | 层 | 用户场景 | 量级 |
|---|---|---|---|---|---|---|---|
| K1 | 审批卡 | in-flow 卡，Allow / Deny | R | P5-31 `local-tool-view.tsx` 只两钮（L-AP） | 已接线（按设计收窄） | — | — |
| K2 | **提问卡（bot 问你选项）** | widget 卡：选项点即交 / 自定义输入 / Dismiss；0.79.3 输入框提示「Type your answer, or talk about something else」（`Sdkx2e`）；规格 `work/p5-parity/RE-question-card.md` | R `views/widget.tsx` + `widget-interactions.ts`（respondToWidget / dismissWidget）；M1 结构化作答分支已在 `main/m1-api/index.ts:100-106`；ledger 已入账 | **shim 不消费 `user-questions/request`**（`data.ts:425` 只认 `approval/request`）；`coordinator.ts` 无 respondToWidget/dismissWidget；生产工具表**有** `ask_user_question`；renderer 挂着时 deadline 不代答（`main/m2-mux/deadline.ts:56` 只在无端口时）→ **bot 一提问，界面什么都不出，回合挂住** | 未接线（现网是坏的） | 「bot 问我选 A 还是 B，我点一下」 | **低** |
| K3 | user-form 表单卡 | RequestUserForm 工具（字段表单） | 79 | dsh 无该工具 | 不适用（并入 K2 覆盖的 ask_user_question） | — | — |
| K4 | **交付卡（bot 交给你的文件）** | 附件卡：图片缩略图点开大图、PDF / 表格内嵌查看、Download（`Download file`/`Download all`）；全屏文件查看器 | R `cards/transcript-card/views/attachment.tsx`、`attachment-data.ts`（kind media/file）、`media-viewer.tsx` `pdf-viewer.tsx` `spreadsheet-viewer*`；dsh `dsh-tool-present`（生产工具表有 `present`） | `entries.ts:124-128` 普通工具行不进主聊天 → present 只在 outline 里一行；`readAttachmentBytes/resolveAttachmentMedia→null` desktop.ts:261-263 | 未接线 | 「写个 hello.html / 出张图表交给我，我直接在聊天里看、下载」 | 中（main 要有路径围栏的读文件口） |
| K5 | bot 回传图片（截图、read_image） | box 卡 boxSnapshot、图片进结果 | R attachment-data `kind:'box'` | `renderer/session/reduce.ts:202-206` 丢 image 块（CU 清单 B3/B4） | 未接线 | 「截个图给我看」 | 中（= queue E2a，等 E2 实测） |
| K6 | 编排条目（Messaging / 回报卡 / 任务行） | — | 自建 | P6-16 `notice-view.tsx` | 已接线 | — | — |
| K7 | 任务卡（Subagent / Shell / Cloud 三类） | RE-UI 题 3d/e | 79 | 无 | 未接线 | 「主 bot 派的活一张卡一张卡看」 | 中（= T27，阻塞） |
| K8 | 跨 bot 消息作者归属 fromAgent/toAgent | RE-UI 题 3 | 79 | 自定义 report/task | 部分 | — | 中（T27） |
| K9 | 连接器卡（bot 请你连一个 app） | connector-actions / views/connector.tsx | R | 依赖 `desktop.mcp.*`（全空） | 未接线 | 「bot 说要连 GitHub，卡上一点就去连」 | 中（要接 P-C 市场安装链） |
| K10 | secret 请求卡 | submitSecret | R | `secrets.*` 桩 | 不适用（D9 凭证永拒） | — | — |
| K11 | email / slack 草稿卡、listener-connect、cloud-agent 卡、box 卡 | — | R | 无 | 不适用（服务端 / 无 box） | — | — |
| K12 | 时间分隔 / 未读线 | — | R 渲染、生成器自建 | `overrides/modules/markers.ts` | 已接线 | — | — |
| K13 | 系统 notice | — | R | entries.ts:134 | 已接线 | — | — |

### S 侧栏与会话管理

| # | 功能面 | 原版做什么 | 零件 | 我们现状 | 层 | 用户场景 | 量级 |
|---|---|---|---|---|---|---|---|
| S1 | bot 列表 / 选中 / 运行点 | — | R | agents.ts | 已接线 | — | — |
| S2 | 置顶 / 拖序 | host pins | R | desktop.ts:103-112（localStorage） | 已接线 | — | — |
| S3 | 未读 / Mark as unread | — | R | coordinator.ts `setAgentUnread`（L-7 O6） | 已接线 | — | — |
| S4 | 重命名 | — | R | session/rename | 已接线 | — | — |
| S5 | Workers / Done 分组 | 0.79.3 无（自建） | 自建 | P6-15 / T36 / T39 | 已接线 | — | — |
| S6 | 用户自建分组 | New section / Move to section / Rename / Delete（`Create section`、`Configure sections`；RE-FULL §1 Yat） | R sidebar-sections-state 等 | `desktop.ts:226-229`：无 worker 时写入原样回但**不落盘**（重启丢），有 worker 时一律回推导值 | 部分 | 「把几个 bot 收进『工作』组，重启还在」 | 中（与 Workers 合成段共存） |
| S7 | **隐藏 bot + Hidden Bots 恢复** | 行菜单 Hide from sidebar；侧栏底「Hidden Bots N」钮 + 对话框可恢复；全隐藏时空态引导（0.79.3 roster `isHiddenFromSidebar??!1`，main-app.cjs @3282068；i18n `JuesWZ`） | R `hidden-chats/overlay/*` + `ProductionRenderer:3053/3322/3452/3631` + `model.ts:168` 读 `isHiddenFromSidebar` | `agent-row-actions-model.ts` 滤掉 Hide；coordinator 无 `setAgentHiddenFromSidebar`（→ unknown-method） | 未接线 | 「试验用的 bot / 干完的 worker 不删也能收起来」——**删除被 P6-24 卡住，隐藏是现在唯一的清理办法** | **低** |
| S8 | 删除 bot | 确认对话框 | R `AgentDeleteConfirmation.tsx` | `sidebar.tsx` 覆盖剥 `onRequestDeleteAgent` | 阻塞（P6-24 删除语义） | — | — |
| S9 | 复制 bot（Duplicate） | 0.79.3 i18n 无「Duplicate」串（RPC 残留） | R | sidebar.tsx 剥；我们有「New bot with this configuration」 | 不适用（原版 UI 已删） | — | — |
| S10 | 广播 / Agent network（org-chart） | 0.79.3 无 org-chart、仅残串「Broadcast message failed」 | R org-chart 8 文件 | sidebar.tsx 剥 | 不适用（原版已删） | — | — |
| S11 | 命令面板 / 搜 bot | Mod+K Jump to | R | CommandPalette 覆盖滤掉无实底命令 | 已接线 | — | — |
| S12 | 全局搜索（消息 / 文件 / 链接 tab） | searchConversation / searchMedia | R tab 在 | `isGlobalSearchEnabled→false` coordinator.ts:37；tab 被 dead-entries:30 藏 | 未接线 | 「搜我上周跟 bot 聊过的某句话」 | 中-高（要 dsh 会话检索；M1 白名单外） |
| S13 | 快捷键（Mod+N/K/,/I/1..9、Alt+↑↓、Mod+B…） | — | R `global-keyboard-shortcuts.ts` | 挂载未门控 | 已接线（静态） | — | — |
| S14 | 侧栏行预览 / 宽度拖拽 / 紧凑 | — | R | — | 已接线（静态） | — | — |
| S15 | 群聊 / 共享房间 / 群成员 | group-members、shared-room | R | 无引擎 | 不适用（L12 Room 自建提议） | — | — |
| S16 | Pop Out Chat 独立窗口 | Cmd+Shift+O（MAINE 菜单） | 79 | 无 | 未接线 | 把一个 bot 单独开窗 | 中，价值低 |
| S17 | 每 bot 多会话 / 自动标题 | listGrokBotAgentSessions / seedConversationName | 79 | bot = 会话 | 不适用（模型不同） | — | — |

### B Bot 面（info pane / 设置 / 形象）

| # | 功能面 | 原版做什么 | 零件 | 我们现状 | 层 | 用户场景 | 量级 |
|---|---|---|---|---|---|---|---|
| B1 | 建 bot 对话框 | — | R + 79 | T30 | 已接线 | — | — |
| B2 | 吉祥物形象 / 状态动画 | — | R + 79 | T24 / T23 | 已接线 | — | — |
| B3 | kickstart 自我介绍 | — | 79 | T25 | 已接线 | — | — |
| B4 | info pane：名字 / 描述 / 配置 / 模型 / 主 bot | — | R + 自建 | P5-57 `agent-settings.tsx` | 已接线 | — | — |
| B5 | **每 bot「Notifications」开关 + bot 有新消息时系统通知** | info pane 开关（0.79.3 `aN` @index.eager-app 1596551，label `iDNBZe`「Notifications」，失败「Couldn't save. Try again.」）；**默认开**（main-app.cjs `DNn={notificationsEnabled:!0,notifyOnUpdatesEnabled:!0}` @2697464，roster `notifyEnabled:…??!0`） | R `agent-info/settings/view.tsx:66` 开关 + `ProductionRenderer:1288-1293` | 开关被 `dead-entries.css:43` 藏；coordinator 无 `setAgentNotifyOnUpdates`；main 只有 worker 挂起通知（`main/notify/worker-notify.ts`，决策：worker 完成不发） | 未接线 | 「我切去别的窗口，bot 回完了弹个通知，点一下回到它」 | 低-中 |
| B6 | 通知声音 | 设置「Play Sound for Notifications」（`6EhUT7`） | 79 | 无 | 未接线 | — | 低（B5 之后） |
| B7 | 头像编辑器 | 上传 / 拖放 / 粘贴 <25MB、拖动定位、缩放、Reset、AI 文生（`Describe your avatar`） | R `avatar-editor/*`（715 行） | `pickAvatarFile→null` `generateAgentAvatarImage→''` desktop.ts:258-260；入口 dead-entries:44 藏 | 未接线 | 「给 bot 换张真照片当头像」 | 中（上传）；AI 生成要图像模型 → Q-042 |
| B8 | Skills 管理 | 名称+步骤编辑、从库添加、私有、发布 | 79（R 无） | T7b「Pick from your skills」 | 部分 | 在 UI 里写一个 skill | 中 |
| B9 | Learnings 审批 | bot 学到的进待审队列 | 79 | 无 | 未接线 | — | 中（**Q-028 已问，默认不做**） |
| B10 | **Routines（定时例行）** | 设置面 Routines 区 + 详情面板 + 运行历史 + 对话流里「automation」时间线卡（38 条 i18n：`Create a routine`、`Couldn't pause this routine`…） | R `automations/routines/*`（2.3k 行）+ `timeline-event-automation.tsx`；dsh `dsh-tool-schedule`（生产工具表有 `schedule_*`） | coordinator.ts:32-33 `listAllAutomations/getAgentAutomations→[]`；搜索 Routines tab 被 dead-entries:31 藏；M1 白名单无 schedule 方法 | 未接线 | 「bot 每天早上 9 点给我发日报，我能在面板看到、暂停、手动跑」 | 中-高（M1 增行 → Q-039） |
| B11 | Analytics / Bot 文件库 / Bot vault 账号 / Channels / 分享 / 发布 / 团队 bot | RE-FULL §2 | 79 / R（channels） | chat-header 剥 Channels | 不适用（服务端 / 团队） | — | — |

### P 过程呈现与「bot 在干什么」

| # | 功能面 | 原版做什么 | 零件 | 我们现状 | 层 | 用户场景 | 量级 |
|---|---|---|---|---|---|---|---|
| P1 | 主聊天只留首答 + 终答 | — | 79 | T22 | 已接线 | — | — |
| P2 | 状态行短语 | — | 79 | T23 | 已接线 | — | — |
| P3 | 头像状态随工具变 | — | R + 79 | agents.ts:57-66 | 已接线 | — | — |
| P4 | Full conversation outline 侧板 | per-subagent tab + 2s 轮询；工具行可展开看结果 | R + 79 | T21；tab 缺（T27 阻塞）；展开只有 120 字实参摘要（CU C3） | 部分 | — | 中 |
| P5 | Async tasks 面板（后台 shell / subagent 列表） | 行菜单「Show async tasks」→ 面板，kind subagent / shell / cloud-agent | R `async-tasks/*`；dsh `dsh-api-job-controller`（job.list）+ subagent（session/list 已有） | `ProductionRenderer:3450` 门 `isAnysphereUser===true`（我们 false）；`getAsyncTasks→[]` | 未接线 | 「这个 bot 后台还挂着哪些任务，点开看 / 停掉」 | 中（shell 部分要 M1 增行 → Q-039） |
| P6 | bot 自己的电脑（会话头电脑钮 → 面板 + VNC 实时画面 + 接手） | ForeverBox；0.18 box 卡写「Linux desktop」 | R `computer/shell/*`（1.8k 行，含 `vnc-webview.tsx`） | `computer-view.tsx` 置空 | 不适用（当前无 box）→ Q-040 | 「看着 bot 在它电脑上开浏览器」 | 高 |
| P7 | 在你电脑上操作（光标覆盖层） | computer/overlay | R | 无 | 不适用（dsh CUA 仅 macOS） | — | — |
| P8 | Teach 录制 | teach-recording | R | 桩 idle | 不适用 | — | — |
| P9 | web_search / 浏览器点击 / 截图工具 | WebSearch / Computer / Screenshot / BrowserSecureFill | 79 | 工具表只有 web_fetch | 能力缺口（queue E2b，非接线问题） | — | 高 |

### D 通知与桌面

| # | 功能面 | 原版 | 零件 | 我们现状 | 层 |
|---|---|---|---|---|---|
| D1 | worker 挂起（审批 / 提问）OS 通知 | — | 自建 | P6-18 | 已接线 |
| D2 | 托盘 roster / Dock 菜单 / badge 计数 | macOS 为主，flag 默认关 | 79 | 无 | 不适用 |
| D3 | 深链 `grokbot://` | — | R 桩 | onDeepLink 空转 | 不适用 |
| D4 | 自动更新 | — | R | not-packaged | 不适用 |
| D5 | 标题栏 / 主题跟随 / 缩放 | — | R | P5-54 / P5-61 | 已接线 |
| D6 | boot 占位 / 断线恢复 / 错误托盘 | — | R | boot-cover.ts；RootShellNotificationHost 挂着 | 已接线（静态） |

### G 设置与账号

| # | 功能面 | 原版 | 零件 | 我们现状 | 层 | 场景 | 量级 |
|---|---|---|---|---|---|---|---|
| G1 | 外观（主题） | — | R | L-7 O7 落盘 | 已接线 | — | — |
| G2 | 账户卡 / 菜单 | Help / Feedback / Log out | R | dead-entries:23,25 只留 Settings / About | 部分（按设计） | — | — |
| G3 | 默认模型 | General「model」键 | R | `getDefaultModel→null` desktop.ts:230；每 bot 模型在 info pane | 部分 | 「新建 bot 默认用哪个模型」 | 低 |
| G4 | 语言 / i18n | 39 语言含简 / 繁中文 + Language 设置 | 79 | 全英文 | 未接线 | 「界面改中文」 | 高 → Q-043 |
| G5 | 时区覆盖 | — | R | 只读检测 desktop.ts:210 | 部分 | — | 低（Routines 之后才有意义） |
| G6 | Onboarding | — | R + 79 | T26-T32 | 已接线 | — | — |
| G7 | About | — | R | 保留 | 已接线 | — | — |
| G8 | Router / Usage / Updates / Vault / Texting / Permissions / Security key / Egress 区 | — | R / 79 | settings-view / settings-panels 覆盖剥 | 不适用 | — | — |
| G9 | Auto-review / Always-allow 规则 | — | R | 剥（L-AP） | 不适用（设计） | — | — |

### M 市场与连接器

| # | 功能面 | 我们现状 | 层 |
|---|---|---|---|
| M1 | Connect apps 市场（浏览 / 搜索 / 安装） | P5-57 P-C 整面替换 | 已接线 |
| M2 | 每 bot 连接器配置 | info pane 只读带锁（D11） | 部分 |
| M3 | MCP OAuth / 凭证 / 1Password / Vault | D9 永拒 | 不适用 |

## 2. 统计

| 区 | 行数 | 已接线 | 部分 | 未接线 | 不适用 / 阻塞 / 能力缺口 |
|---|---|---|---|---|---|
| C 对话与输入 | 17 | 4 | 1 | 9 | 3 |
| K 卡片 | 13 | 4 | 1 | 5 | 3 |
| S 侧栏与会话 | 17 | 8 | 1 | 3 | 5（含删除阻塞 1） |
| B Bot 面 | 11 | 4 | 1 | 5 | 1 |
| P 过程呈现 | 9 | 3 | 1 | 1 | 4（含能力缺口 1） |
| D 通知与桌面 | 6 | 3 | 0 | 0 | 3 |
| G 设置与账号 | 9 | 3 | 3 | 1 | 2 |
| M 市场 | 3 | 1 | 1 | 0 | 1 |
| **合计** | **85** | **30** | **9** | **24** | **22** |

（一行一个功能面；B11 / K11 / G8 是同类不适用项并行，算 1 行。）

## 3. 打磨场景清单（未接线 + 部分 → 用户能感到的场景，按 价值 × 成本 排）

| 序 | 场景 | 行 | 价值 | 成本 | 批次 |
|---|---|---|---|---|---|
| 1 | bot 问你选项，你点一下它接着干（现在是挂住） | K2 | 高（坏的） | 低 | **E4 = T40** |
| 2 | 试验 bot / 干完的 worker 收起来不占侧栏，想看再翻出来 | S7 | 中（删除被卡，唯一清理办法） | 低 | **E5 = T41** |
| 3 | 你不在窗口前时 bot 回完弹系统通知，点了跳回它；每 bot 可关 | B5 | 高（多 bot 产品的基本盘） | 低-中 | **E6 = T42** |
| 4 | bot 交付的文件直接在聊天里看（图片 / PDF / 表格）、下载 | K4 | 高（用户原话「他会交付」） | 中 | **E7 = T43** |
| 5 | 把截图 / 文件发给 bot | C3 | 高 | 中（先探针） | **E8 = T44** |
| 6 | bot 截图、读图的结果在 outline / 聊天里看得到 | K5 | 高 | 中 | E2a（等 E2 实测，queue 原行） |
| 7 | 定时例行：建、看、暂停、手动跑 | B10 | 高 | 中-高 | E9（等 Q-039） |
| 8 | 后台任务面板：bot 挂着的 shell / helper | P5 | 中 | 中 | E10（helper 部分可先做；shell 等 Q-039） |
| 9 | 回复 / 引用某条消息 | C9 | 中 | 低-中 | E11 |
| 10 | 表情回应（回应唤醒 bot） | C12 | 中 | 中 | E12 |
| 11 | 自建侧栏分组重启不丢 | S6 | 中 | 中 | E13 |
| 12 | 换真照片头像 | B7 | 中 | 中 | E14（AI 生成等 Q-042） |
| 13 | 按住说话输入 | C4 | 中 | 中 | 等 Q-041 |
| 14 | 代码块语法高亮 | C16 | 中 | 中 | E15 |
| 15 | 链接预览卡 | C17 | 低-中 | 中（安全审） | 提议 |
| 16 | bot 请你连 app 的卡片 | K9 | 中 | 中 | 提议 |
| 17 | 全局搜聊天记录 | S12 | 中 | 中-高 | 提议 |
| 18 | 任务卡 / outline 分 tab / 跨 bot 归属 | K7 K8 P4 | 高 | 中 | T27（阻塞不变） |
| 19 | bot 自己的 Linux 电脑 + VNC 实时看 | P6 | 高 | 高 | 等 Q-040 |
| 20 | 界面中文 | G4 | 用户定 | 高 | 等 Q-043 |
| 21 | @ 提及、Pop Out、emoji、线程、回滚、通知声音、默认模型、时区 | C6 S16 C8 C10 C11 B6 G3 G5 | 低-中 | 中-高 | 提议，不排 |

**为什么第一批是这五张**：
- E4 提问卡是唯一一项「现网是坏的」：生产工具表里有 `ask_user_question`，bot 一调就挂住，用户只看到一直在转。零件三件全在（0.18 widget 卡、M1 作答分支、ledger），只差 shim 一层。同时解掉 P6 设计里「卡住 → 提问卡镜像」一直缺的 P5-33。
- E5 隐藏 bot：上游整套 UI 都挂着，只被一行覆盖滤掉、一个 RPC 没 handler；删除被 P6-24 卡住期间，worker 越积越多，这是唯一的清理办法。最便宜。
- E6 通知：多 bot 产品「去忙别的、回来看结果」的基本盘；0.79.3 默认开；开关 UI 在、只被 CSS 藏；main 已有通知模块可照抄点击聚焦。
- E7 交付卡、E8 附件：用户原话「他会交付电脑」「computer use 显示回传」最直接的两条，dsh 后端（present / attachment）和 0.18 查看器都在；但都要 main 侧开一个**有围栏的读文件口**（E7）或先确认 dsh prompt 收图片块（E8），成本中，所以排在三张低成本单后面。E7、E8 都碰文件读写 → 施工完派 reviewer。
- 没进第一批的高价值项：Routines / 后台任务要 M1 白名单增行（契约问题，Q-039）；bot 电脑要先定做不做（Q-040）；图片回传（E2a）等 E2 实测；任务卡（T27）阻塞不变。

## 4. 局限

1. 全部静态判定，「已接线（静态）」行没实跑；E 系列每张单的先红测试会顺带证伪。
2. 0.79.3 只按 i18n 串 + 定点 grep 取证，没逐 chunk 读；行为细节以各单「动手前先读」里的锚点为准。
3. recovered 的 332 → 276 差额：SOURCES.tsv 与实际文件数都是 276，原派单数字疑含 `frontend/src` 其他目录或 assets。
