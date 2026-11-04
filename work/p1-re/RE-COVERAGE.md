# RE-COVERAGE · Grok Bot 0.78.1 逆向覆盖全量审计

2026-11-03 · director（Opus 5.5）· 用户指令（2026-11-03）：「我们感觉GLM逆向的还是不够. 应该全部逆向的. 看看有没有什么遗漏的」
输入：`work/p1-re/` 九份 RE + ARCH-0.78、`work/p4-ui/RE-visual-audit.md`、`work/p5-parity/RE-{approval-model,stub-boot,s0-portability,v3-toolrow,visual-078-values,visual-residual}.md`、`work/p6-orchestration/RE-sendmessage-ui.md`；本次对 `/dev/shm/grok-re/0.78.1/app/dist/` 补做了静态枚举（lazy 注册表、卡型集合、source 域表、preload 431 方法、harness 工具枚举）。不改代码。
锚点格式：`文件@字节偏移`。`APP`=`renderer/assets/index.eager-app-iGTgHP_Q.js`，`COMMON`=`index.eager-common-DbK3Oi_r.js`，`PROTO`=`electron-main/proto.cjs`，`DAEMON`=`local-exec-daemon/main.cjs`，`G18`=`repos/grok-bot-0.18-reconstructed/`。

## 0. 结论

1. **总面数 198**（§2.1–§2.8 逐行，其中卡片 59 行逐型）：已逆 39 · 部分 56 · 未逆 97 · 边界外 6。复数命令：在 §2.1–§2.8 范围内跑 `grep -cE '\| (已逆|部分|未逆|边界外) \|'`。未逆的 97 行里有 32 行属于非目标域（计费、云 box/computer-use、团队/Slack/Teams、电话），列出来是为了「全部」，但排在清单末尾。
2. **核心旅程的面（侧栏、会话流、审批、市场容器、主题、IPC）已经逆透**。缺口集中在三处：①**卡片**：35 个 send-message 协议型里只有 3 型逆到 payload/UI 级（text、local-tool-permission、已退休的 permission-request），15 个 event 型一型都没逆；②**在途 slug 直接要用但没逆的面**：提问卡（widget/user-form → P5-33）、MCP 连接器授权卡（connector-grant → P5-23/24/32）、outline 面板与任务线程（→ P6-16）、跨 session/线程（→ P6 第一批，Q-020）、市场列表/详情（→ P5-57）；③**P6 候选功能的 UI 面**：记忆、群聊、自动化目前只有清单级证据。
3. **需要更正的旧结论**：
   - 卡型数：协议集合 `bXt`（APP，`xXt` 定义之前）共 **35 型**，其中 `permission-request` 已退休、没有 body，所以 lazy body 是 **34 个**；event 集合 `jie` 共 **15 型**。RE-ui-shell §1.3 的「33 类 / event 12 类」、ARCH §2 的「其余 29 型 + event 12 型」作废。
   - ARCH §5 第 1 行「0.78.1 本地反向通道未定位」改为**部分**：`DAEMON@2349816` 有 `pFe="/local-exec/requests"`、`mFe="/local-exec/responses"`，同段可见 messages 请求的 kind 与超时（send 180s，其余 30s）。
   - **harness 工具参数（MessageSubagent/CheckSubagent/WakeParent/ReadTranscript/SearchTranscripts/ReadAgentActivity/CreateTask 等）在 0.78.1 客户端里读不到**：每个 bundle 只有工具名枚举（键 + 值各 1 次）。PROTO 的 75 个 `*Args` 是 Cursor 云 agent 的工具集，只覆盖 SendToUser/SendToAgent/CreateAgent/StopAgent/ReadAgentTranscript/GetAgentStatus。所以 p6 需要的子 agent 工具 schema 对 0.78.1 是**边界外**，唯一可读的实现在 **G18 `source/host/runner/tools/*`**（471 个 ts 文件的 host 源码，之前只读过 storage/registry/prompt）。
   - 0.78.1 的 bot 头像是一套程序化动画引擎（`sand-grok-bot-mark`，APP@896379；引擎在 COMMON@~300K–362K，body blob→sphere，约 21 个动效 case，poke spin/bounce，跟随指针，seed，maxFrameRate）。P5-56 用的是 0.18 的 persona，两者之间没有做过差异核对。
4. **方法上的杠杆**：①RE-stub-boot 的 `work/p5-parity/harness/grok-r3/` 已经能在不登录、不联网的情况下渲染 0.78.1 renderer，每加一种卡型约 0.5–2h，因此卡片波次应当做成「静态抽 payload + 桩下截参照图」，产物可以直接给对照台用；②边界外的行为（记忆合成、autoReview 判定、自动化触发、subagent 工具）改读 G18 host 源码（属于普通源码阅读，按 CLAUDE.md 不派 REA，派 scout）。
5. **前提**：0.78.1 解包树目前在 `/dev/shm`（易失，丢了按 RE-unpack §0 重建）；0.18 原包解包树和 `/dev/shm/grok-re/{w05,ipcrpc}` 已随重启丢失，w05 的 tsv 有副本在 `work/p1-re/w05/output/`。需要 0.18 原包对照时，先从 `G18/research-archives/original/0.18.0/windows-x64` 按 RE-w05 §1 重解。

## 1. 口径

| 状态 | 含义 |
|---|---|
| 已逆 | 有 RE 报告，结论精确到字段/锚点，可以直接当规格用 |
| 部分 | 有清单级或语义级结论，缺 payload 字段、UI 结构或视觉值，或只逆了一个分支 |
| 未逆 | 只有名字，或名字都没进报告 |
| 边界外 | 0.78.1 客户端里没有实现，只能靠运行抓包、云端，或 G18 源码推定 |

证据途径：S = 0.78.1 静态（REA / grep）；R = stub 运行截图（grok-r3）；G = G18 源码阅读（非 REA）。

## 2. 覆盖矩阵

### 2.1 transcript 卡片（逐型；body = 0.78.1 lazy chunk / 字节；「移植」= G18 frontend 移植树里有没有对应 view）

entry kind（APP `rc`，9 种）：

| # | 面 | body | 移植 | 状态 | 依据 / 缺口 | 任务 |
|---|---|---|---|---|---|---|
| C1 | tool-call（不走卡表，可见行在 outline） | eager | 有 | 已逆 | RE-v3-toolrow §1；RE-sendmessage-ui §1.3 | — |
| C2 | message:message | B2FzGpIY 4.4K | 有 | 部分 | RE-sendmessage-ui §1.5 只到角色/署名；链接卡、语音备忘分支没逆 | R-12f |
| C3 | notice:notice | BsAInvcy 1.3K | 有 | 未逆 | 只有名字 | R-12f |
| C4 | mcp-app:mcp-app | BRIAZ8ul 12.7K | 无 | 部分 | RPC 有（readMcpAppResource/callMcpAppTool）；卡 UI 没逆 | R-12f |
| C5 | user-attachment | BS1asw3e 2.6K | 有 | 未逆 | — | R-12f |
| C6 | feedback:feedback | CQrxHlDU 9.1K | 无 | 未逆 | voteFeedback 只有名字 | R-12f |
| C7 | voice-call:voice-call | BCgrkxOh 19.1K | 无 | 未逆 | 非目标 | R-25 |
| C8 | event:*（壳、frame=timeline） | — | 有（timeline-event） | 部分 | 帧规则见 RE-sendmessage-ui §1.1；15 型逐型见下 | R-12g |
| C9 | send-message:*（壳、frame=message、BXt 派发） | — | 有 | 已逆 | RE-sendmessage-ui §1.1 | — |

send-message 35 型（`bXt`）：

| # | type | body | 移植 | 状态 | 依据 / 缺口 | 任务 |
|---|---|---|---|---|---|---|
| S1 | text | CKIKFjF_ 279K | 有 | 已逆 | RE-sendmessage-ui §1.2（7 分支 + 默认气泡）；分支内视觉值没取 | — |
| S2 | attachment | CChBiJL6 2.2K | 有 | 未逆 | — | R-12d |
| S3 | widget（提问：options/multiSelect） | BnT48mMZ 24.1K | 有 | 未逆 | respondToWidget/dismissWidget；P5-33 提问卡 | **R-01** |
| S4 | cursor-agent | YjbJE-jo 1.4K（+cloud-agent-card-elevated 17K） | 有（cloud-agent） | 部分 | 只有声明高度（RE-sendmessage-ui §1.1） | R-12d |
| S5 | secret-request | pQ-2bxLy 14.0K | 有 | 未逆 | submitSecret | R-12c |
| S6 | credential-request | yi69_8ne 20.8K | 无 | 未逆 | vault/1P | R-12c |
| S7 | user-form | lxKSMA-f 22.5K（+inline-user-form 46K） | 无 | 未逆 | submitUserForm/dismissUserForm、RequestUserForm | **R-01** |
| S8 | email-draft | Bu9ETj1Z 25.4K | 有 | 未逆 | sendDraft/discardDraft | R-12b |
| S9 | slack-draft | 4gH-NXtD 16.1K | 有 | 未逆 | — | R-12b |
| S10 | meeting-chat-draft | nKMRFjLY 8.3K | 无 | 未逆 | — | R-12b |
| S11 | imessage-draft | Beq5n-NF 25.6K | 无 | 未逆 | — | R-12b |
| S12 | calendar-event | BQsUvw4u 20.9K | 无 | 未逆 | — | R-12b |
| S13 | visualization | 9XAPZnJe 14.0K（+d3 277K / three 679K runtime） | 无 | 未逆 | — | R-12d |
| S14 | permission-request（已退休） | 无 body | 有 | 已逆 | BXt 退休分支（RE-sendmessage-ui §1.1） | — |
| S15 | connector | B1WM5Ikl 3.0K | 有 | 未逆 | — | R-12a |
| S16 | connectors | CthkhaZx 3.3K | 有 | 未逆 | — | R-12a |
| S17 | listener-connect | CRl5qXMT 1.6K | 有 | 未逆 | — | R-12a |
| S18 | scm-connect | BZ0n1N-2 2.0K | 无 | 未逆 | — | R-12a |
| S19 | onepassword-connect | B-k6RzYu 1.4K | 无 | 未逆 | — | R-12a |
| S20 | notifications-enable | CySVijdt 5.2K | 无 | 未逆 | 和 P6-16 OS 通知相关 | R-12a |
| S21 | appearance-picker | BnWMhsyB 9.1K | 无 | 未逆 | — | R-12a |
| S22 | email-offer | BuVdKOTd 5.2K | 无 | 未逆 | — | R-12b |
| S23 | team-access | BB4uiBe7 12.0K | 无 | 未逆 | 团队，非目标 | R-12a |
| S24 | slack-connect | A5D-4RKx 1.2K | 无 | 未逆 | — | R-12a |
| S25 | bot-template-share | D6vJyZeT 7.2K | 无 | 未逆 | — | R-12d |
| S26 | auto-review-approval | o1Du8A_z 2.5K | 有 | 部分 | 语义见 RE-approval-model §3；卡 body 没读 | R-12c |
| S27 | meeting-join-consent | B75H9t_S 4.9K | 无 | 未逆 | — | R-12c |
| S28 | connector-grant（MCP serverName 授权 + always） | EpEVD5Q5 9.5K | 无 | 未逆 | resolveConnectorGrant；P5-23/24/32 | **R-02** |
| S29 | local-tool-permission | Bbgcfm9R 28.5K | 有 | 已逆 | RE-approval-model §1–§4；RE-visual-078 B8/B9；R3 截图 | — |
| S30 | virtual-card-approval | Be_TJB7a 15.2K | 无 | 未逆 | 支付，非目标 | R-30 |
| S31 | cookie-origin-approval | j6BzC4-h 6.2K | 无 | 未逆 | 浏览器 | R-12c |
| S32 | publish-approval | CVEMTYA4 3.6K | 无 | 未逆 | — | R-12c |
| S33 | app-secrets-request | CF5ipRxC 11.4K | 无 | 未逆 | — | R-12c |
| S34 | mobile-tool-permission | DgwOjGyI 23.3K | 无 | 未逆 | — | R-12c |
| S35 | phone-call | CTDnFpX- 2.1K（+phone-call 25K） | 无 | 未逆 | 非目标 | R-25 |

event 15 型（`jie`）：

| # | type | body | 状态 | 任务 |
|---|---|---|---|---|
| E1 | name-changed | 1O3TimTF 0.8K | 未逆 | R-12g |
| E2 | channel-connected | BmB610H2 0.8K | 未逆 | R-12g |
| E3 | channel-disconnected | 9ZZNeaQK 0.8K | 未逆 | R-12g |
| E4 | automation-changed | Ba5V5NT9 1.6K | 未逆 | R-08 |
| E5 | task-changed | 7PKdecmC 4.1K | 未逆 | **R-05** |
| E6 | cloud-agent-launched | DAABt7yR 1.9K | 未逆 | R-12g |
| E7 | team-shared | CZFaUvTL 87.5K | 未逆 | R-28 |
| E8 | team-bot-publish | BjAuvRqj 8.7K | 未逆 | R-28 |
| E9 | person-added | B4uk2qyQ 0.8K | 未逆 | R-09 |
| E10 | person-removed | f_BQNsgp 0.8K | 未逆 | R-09 |
| E11 | person-left | B7eNWfF1 0.8K | 未逆 | R-09 |
| E12 | bot-added | Bme4lVkV 0.8K | 未逆 | R-09 |
| E13 | bot-removed | BsFPRKc0 0.8K | 未逆 | R-09 |
| E14 | dev-event | B0UyDBz4 1.0K | 未逆 | R-12g |
| E15 | desktop-goal | 5agQVYpZ 1.0K | 未逆 | R-31 |

### 2.2 页面 / overlay / 面板

| # | 面 | 0.78.1 位置 | 状态 | 依据 / 缺口 | 任务 |
|---|---|---|---|---|---|
| P1 | 未登录封面 | eager + onboarding-flow | 已逆 | RE-ui-shell §1.5；01-boot.png | — |
| P2 | onboarding 流（模板引导、40+ 预置 bot 文案） | chunk-onboarding-flow 64K | 部分 | 只解了文案 id，流程/步骤/gate 没逆 | R-16 |
| P3 | 主窗口骨架 / 自绘窗口按钮 / titlebar | index-CxzQ4vjO | 已逆 | RE-ui-shell §1.1；RE-theme §3 | — |
| P4 | 侧栏 AgentsSidebar（分区/角标/footer/Connect apps） | eager | 已逆 | RE-ui-shell §3.1；RE-visual-078 A 组 | — |
| P5 | 侧栏任务线程折页 / unread / blocked | eager | 已逆 | RE-sendmessage-ui §1.4 | — |
| P6 | 会话流 rows 折叠器 / 虚拟列表 / 分组署名 | eager | 已逆 | RE-v3-toolrow；RE-sendmessage-ui §1.5 | — |
| P7 | ChatHeader（View agent settings、语音控件） | eager | 部分 | 结构有，视觉值和语音控件没逆 | R-17 |
| P8 | Composer / prompt-editor（附件 staging、mention、voice、new-chat-bar） | chunk-prompt-editor 80K、new-chat-bar 34K | 部分 | RE-visual-078 B 组只到形态 | R-18 |
| P9 | Outline「Full conversation」面板（tool 行的真实宿主） | getConversationOutline APP@258250/@4295955 | 部分 | RE-v3-toolrow 证明 tool 行在这里；面板 UI 和 reply 形状没逆 | **R-05** |
| P10 | tasks/workspace overlay | DICrypK2 16.3K | 部分 | 排序/上限见 RE-sendmessage-ui；面板 UI 没逆 | **R-05** |
| P11 | info-pane overview / settings | eager | 部分 | AUD C 组；P5-57 自定 | R-15 |
| P12 | info-pane routines / media / computer / meetings / members | eager | 未逆 | 只有 tab 名（RE-ui-shell §1.3） | R-15 |
| P13 | avatar-editor | chunk-agent-avatar-editor 22K | 未逆 | — | R-15 |
| P14 | 市场 overlay 容器 / 头 / tabs | kcheXZ65 186K | 已逆 | RE-visual-078 D1–D3；RE-marketplace §3 | — |
| P15 | 市场列表行 / 分类 / 安装态 / 空态 | kcheXZ65 + marketplace-browse-model 6K | 部分 | 只有文案 id（RE-ui-shell §3.3） | **R-04** |
| P16 | 插件详情页（含权限 tabs、auto-review 开关） | plugin-detail-view 78K、native-plugin-detail 49K、sharepoint-write 22K | 部分 | RE-approval-model §3 只摘了权限文案 | **R-04** |
| P17 | 自定义 MCP 表单 / 自定义 connector | custom-mcp-form 21K、user-custom-connector 3K | 未逆 | — | **R-04** |
| P18 | connector 卡（市场内 per-app） | connector-card 19K、connector-card-view 24K | 未逆 | — | **R-04** |
| P19 | settings overlay 壳 / 左导航 7 节 | Bby8YSO7 + layout DBVKePVV 10.7K | 部分 | 导航与 68 个 id 已列，壳视觉没逆 | R-03 |
| P20 | 命令面板 palette（link/message provider） | eager | 未逆 | 只有一句话 | R-17 |
| P21 | 全局浮层：notice-host / update-prompt / feedback / network-debugger / tray | eager + network-debugger-dialog 11K | 未逆 | tray 已作排除项登记 | R-17 |
| P22 | 弹出单 agent 窗（sandPopout、openChatPopout） | eager | 未逆 | 只知道 isSidebarShown 规则 | R-17 |
| P23 | bot-templates overlay + 模板详情 dialog | DEZrYCXT + template-details-dialog 35K | 未逆 | 要登录 | R-28 |
| P24 | team-agents overlay | CANKD5iS 24.7K | 未逆 | — | R-28 |
| P25 | grok-bot-team overlay + manage-files/plugins/skills | uarqZOWP / IWU0STVe / k8xlyBcg / DFPBjR6E | 未逆 | — | R-28 |
| P26 | bot-manage-screen / configure-dialog / team-bot-* 约 30 个 chunk | 66K / 33K / … | 部分 | RE-ui-shell §3.4 只到节名 | R-28 |
| P27 | grok-bot-slack overlay + slack/teams 流 dialog | Cg7LMpXC、slack-dialog-live 40K、teams-flow 65K | 未逆 | 非目标 | R-29 |
| P28 | passkey-enrollment overlay | DAK_-E-H 11.6K | 未逆 | 非目标 | R-30 |
| P29 | unified-billing / top-up / order-checkout / virtual-card-checkout | DQ8WyIKj、70K、26K | 未逆 | 非目标 | R-30 |
| P30 | computer overlay / desktop-mount ×2 / box-desktop-modal / VNC | D7xvH3FM、32K、26K | 未逆 | 非目标（云 box） | R-31 |
| P31 | voice-call 浮层 | eager | 未逆 | 非目标 | R-25 |
| P32 | Library / 文档页 / canvas / fullscreen viewer / text-viewer | document-page 229K、viewer 79K、text-viewer 18K | 未逆 | 整块没进过任何报告 | R-24 |
| P33 | places-stage / place-facts（地点搜索 UI） | 122K | 未逆 | — | R-24 |
| P34 | agent-invite / bot-share 系列 | invite-dialog 15K、share-popover 45K … | 未逆 | 团队 | R-28 |
| P35 | vault dialog 系列 | vault-card-dialog 140K、vault-login-dialogs 128K | 未逆 | — | R-30 |
| P36 | markdown / 代码块 / shiki / KaTeX / mermaid(diagram) | markdown 58K、shiki-sync 141K、katex 251K | 部分 | 只列了 chunk；渲染规格以 0.18 移植树为准 | R-18 |

### 2.3 设置页逐节

| # | 节 | 0.78.1 chunk | 状态 | 依据 / 缺口 | 任务 |
|---|---|---|---|---|---|
| T1 | general（账号/主题/语言/拼写/麦克风/硬件加速/网络调试/通知音/模型/时区） | chunk-general-pane 103K | 未逆 | 只有 id 列表（RE-ui-shell §3.4） | R-03 |
| T2 | integrations | BLt3J-sA 46K | 未逆 | — | R-23 |
| T3 | computer（local-execution / messages / egress） | ODc_03uE 68.6K | 部分 | RE-approval-model 只摘了 ceiling 文案 | R-23 |
| T4 | permissions（auto-review 规则 / always-ask / allow-without-asking） | DLupEaB5 19.6K | 部分 | RE-approval-model §4.4 有结构起点，没有视觉和交互 | R-03 |
| T5 | vault | Bx8u2sOw 79.6K | 未逆 | 只当 tablist 规格来源用过 | R-30 |
| T6 | usage（plan / billing / breakdown） | D6kXWFjx 66.8K | 未逆 | 非目标 | R-30 |
| T7 | updates | DSY1HXfk 9.2K | 未逆 | 非目标 | R-23 |

### 2.4 RPC 域

coordinator 端口 146 方法（APP@261500 `Gd`，22 域，合计 146 已复核）：

| # | 域（方法数） | 状态 | 依据 / 缺口 | 任务 |
|---|---|---|---|---|
| D1 | transcript (9) | 部分 | tail/open/noteMounted 已逆；getConversationOutline、readMainAgentContext、voice 3 个没逆 | R-05 |
| D2 | send (5) | 部分 | sendPrompt/promptAcceptanceStatus 已逆；reactToMessage/createThreadFromMessage 只有名字 | **R-10** |
| D3 | widgets (9) | 部分 | 只有 respondToWidget 签名 | **R-01** |
| D4 | approvals (8) | 部分 | localTool/autoReview 已逆；connectorGrant 没逆；messagesGrants/virtualCard/spend/outboundCall 非目标 | R-02 |
| D5 | roster (29) | 已逆 | RE-features §1.2；RE-sendmessage-ui §1.6 | — |
| D6 | search (1 searchMedia) | 未逆 | — | R-24 |
| D7 | cloud_agents (13) | 未逆 | 非目标 | — |
| D8 | listeners (3) | 未逆 | — | R-12a |
| D9 | workflows (7，含 importAgentWorkflowText/Url) | 未逆 | 和 automations 是两套，语义不明 | R-08 |
| D10 | skills (9) | 部分 | 只有名字 + 市场文案 | R-04 |
| D11 | mcp (10) | 已逆 | RE-marketplace §3；RE-ipc-rpc §3.3 | — |
| D12 | mcp_apps (2) | 部分 | 只到 RPC | R-12f |
| D13 | media (3) | 未逆 | — | R-25 |
| D14 | subagents (2) | 部分 | 只有名字和事件族 | **R-05** |
| D15 | computer (5) | 未逆 | 非目标 | R-31 |
| D16 | teach (3) | 未逆 | 非目标 | R-31 |
| D17 | trays (3) | 部分 | RE-sendmessage-ui §1.4 排除项 | R-17 |
| D18 | channels (4) | 未逆 | — | R-29 |
| D19 | secrets (1) | 未逆 | — | R-30 |
| D20 | automations (13，含 agent tasks 4) | 部分 | tasks 已逆；automation 只到清单 | R-08 |
| D21 | capabilities (1 getHostStatus) | 未逆 | — | R-19 |
| D22 | sharing (6) | 未逆 | — | R-28 |

main 边 431 方法（preload 声明，305 args + 126 noArgs，复核 = 431；按关键字分族）：

| # | 族（约数） | 状态 | 依据 / 缺口 | 任务 |
|---|---|---|---|---|
| M1 | 市场 / MCP / 插件 / 技能 (44) | 部分 | install/update/getEffective 已逆；skill、Slack/Teams 安装没逆 | R-04 |
| M2 | bot / agent 杂项（sessions、files、managers、access、analytics、review items）(44) | 部分 | sessions/setViewingAgent 已逆；其余只有名字 | R-35 |
| M3 | 持久化 / 偏好 / 附件 staging / experiments (39) | 部分 | 持久化已逆（RE-features Q2）；附件 staging 7 个方法没逆 | R-18 |
| M4 | 窗口 / computer / box / egress / tailnet (48) | 部分 | 窗口类简单；computer 非目标 | R-31 |
| M5 | 账号 / 登录 (11) | 部分 | 桩的启动面已逆（RE-stub-boot）；登录流非目标 | — |
| M6 | 遥测 report* / log* (25) | 已逆 | 全部 no-op（ARCH §3） | — |
| M7 | vault / secrets / credentials / 1P / passkey (41) | 未逆 | — | R-30 |
| M8 | 团队 / 分享 / Slack / Teams (47) | 未逆 | 非目标 | R-28 |
| M9 | 计费 / 用量 (14) + finance / card (10) | 未逆 | 非目标 | R-30 |
| M10 | email (6) + messages / phone (14) | 未逆 | — | R-27 |
| M11 | 语音 / 听写 (7) | 未逆 | — | R-25 |
| M12 | 更新 (9) | 未逆 | 非目标，禁用更新 | — |
| M13 | 本地工具审批（record/clear/setLocalToolPermission…） | 已逆 | RE-approval-model §2 | — |
| M14 | Library / canvas / document / pins (约 20) | 未逆 | — | R-24 |
| M15 | feature flag / gate（exposeFeatureGate、applyFeatureFlagOverride） | 部分 | 只提到 2 个 gate 默认值 | R-36 |
| M16 | 记忆（listGrokBotUserBotMemories、getBotSharedMemories、promote…、reportMemoryImportAction） | 部分 | RE-features §4 只到清单 | R-07 |

云端服务（PROTO，7 服务 604 方法）：

| # | 服务 / 方法族 | 状态 | 依据 / 缺口 | 任务 |
|---|---|---|---|---|
| K1 | GrokBot · agent CRUD / roster / client state / main agent / PrimaryBot 迁移 | 已逆 | RE-features §1；RE-ipc-rpc §3.4 | — |
| K2 | GrokBot · Send / Watch / transcript / sessions | 已逆 | RE-ipc-rpc §4 | — |
| K3 | GrokBot · plugins / widget / local tool 审批 | 已逆 | RE-ipc-rpc J3 | — |
| K4 | GrokBot · tasks（ListGrokBotAgentTasks / Mark* / Pinned） | 已逆 | RE-sendmessage-ui §1.4 | — |
| K5 | GrokBot · Room / 群聊（PROTO@1037429） | 部分 | 只到清单 | R-09 |
| K6 | GrokBot · 记忆（PROTO@1127351） | 部分 | 只到清单 | R-07 |
| K7 | GrokBot · 自动化 / webhook（PROTO@994653） | 部分 | 只到清单 | R-08 |
| K8 | GrokBot · 跨线程（CreateGrokBotThreadFromMessage PROTO@1177671） | 部分 | 只到 Request 形状 | **R-10** |
| K9 | GrokBot · MCP 工具权限（Get/Set PROTO@1020843、ToolPermissionPolicy @1020042） | 部分 | 只到字段名 | **R-02** |
| K10 | GrokBot · 模板 / 市场 listing / 发布 | 部分 | RE-marketplace §2.1 | R-28 |
| K11 | GrokBot · 团队 / 分享 / Slack / Teams / messaging / email / vault / spend / voice / canvas 其余 | 未逆 | 414 个方法没有按族归档 | R-35 |
| K12 | Dashboard 84（市场/MCP 21 已逆，其余 63） | 部分 | RE-marketplace §1 | — |
| K13 | AgentStore 25 | 边界外 | host 存储推定（ARCH §4.5 #9） | R-06 |
| K14 | SandBox 55 / BackgroundComposer 10 / Ai 8 / Analytics 8 | 未逆 | 非目标 | — |

### 2.5 daemon / main 能力

| # | 面 | 状态 | 依据 / 缺口 | 任务 |
|---|---|---|---|---|
| A1 | 进程拓扑 / fork / coordinator 崩溃自愈 | 已逆 | RE-ipc-rpc §2 | — |
| A2 | boot-snapshot-sync / 客户端持久化 sand-client-persistence | 已逆 | RE-features Q2 | — |
| A3 | 本地工具审批引擎（分类 × 档位、三个 JSON、ceiling） | 已逆 | RE-approval-model | — |
| A4 | autoReview（指令存储/同步/UI） | 部分 | 判定在云端（RE-approval-model 局限 3）；0.18 host 有 auto-review-service + smart-mode classifier 没读 | R-06 |
| A5 | 本地工具执行语义（Shell/Read/AwaitShell/文件传输上限/terminals 目录/ListMachines） | 未逆 | DAEMON 3.9MB 只读过审批段；同段有 100MiB 文件上限、手机机型拒绝等文案 | R-19 |
| A6 | 本地反向通道 /local-exec/requests\|responses | 部分 | 本次定位 DAEMON@2349816（更正 ARCH §5） | R-19 |
| A7 | messages-worker（121K）/ Messages / Mail 本地能力 | 未逆 | ARCH §5 | R-20 |
| A8 | MarketplaceCacheManager（daemon 内未接线） | 部分 | RE-marketplace §2.4 | — |
| A9 | tree-sitter + bash 解析 | 部分 | 只知道「daemon 解析 shell 命令」，用途（摘要？分类？）没逆 | R-21 |
| A10 | native ×9 用途 | 已逆 | ARCH 裁决 4 | — |
| A11 | OS 通知（agent-done / needs-input，5s 轮询 diff） | 已逆 | RE-sendmessage-ui §1.4 | — |
| A12 | 通知音 5 个 WAV 的事件映射 / 通知权限 native | 部分 | 只有资产清单 | R-22 |
| A13 | 深链 22 路由 | 已逆 | RE-ui-shell §1.2 | — |
| A14 | MCP OAuth（静态/动态注册、loopback 8787、mcp-auth.json） | 部分 | 流程已逆（RE-marketplace §3）；mcp-auth.json schema 和 mcp-auth 事件族没逆 | R-02 |
| A15 | secrets 本地存储（sand-secrets.json / user-secrets.json） | 未逆 | 不读真实文件，只逆 schema | R-30 |
| A16 | 更新 / 遥测 / Sentry / Statsig | 已逆 | ARCH §3（no-op 判定） | — |
| A17 | gateway 131 命令 / box host 运行 | 边界外 | ARCH §4.5 #6 | — |
| A18 | host 扩展 35 个（0.18） | 已逆 | RE-host-ext 清单级 | — |
| A19 | host 运行时行为（memory synthesis、automation trigger、subagent 工具、send-message 编码） | 边界外 | 0.78.1 不可得；G18 `source/host/` 可读，从没读过 | R-06 |
| A20 | harness 工具参数 schema（165 个工具，MessageSubagent 等） | 边界外 | §0-3；客户端只有名字枚举（main-core `ae={AddMcpServer:…}`） | R-06 |
| A21 | NotifySandAgentTurnFinished 调用方 | 边界外 | RE-sendmessage-ui §3 | R-06 |

### 2.6 资产 / 视觉

| # | 面 | 状态 | 依据 / 缺口 | 任务 |
|---|---|---|---|---|
| V1 | 色板 / 语义 / 别名 token（两套主题） | 已逆 | RE-theme（theme-tokens.css） | — |
| V2 | 布局常量 | 已逆 | RE-theme §3；RE-visual-078 | — |
| V3 | 字体 XVF / XMono / KaTeX | 已逆 | RE-ui-shell §2.2 | — |
| V4 | 图标连字 818 名 | 部分 | 解码是启发式（RE-ui-shell L4） | R-34 |
| V5 | keyframes 145 / transitions / reduced-motion | 已逆 | RE-visual-078 §二–§三（约 40 个 ui- 原语没归属） | — |
| V6 | bot mark 动画引擎（body / 21 个动效 / poke / 跟随指针） | 部分 | P5-56 用 0.18 persona 做了状态映射；0.78.1 引擎没比对 | R-13 |
| V7 | i18n en catalog 3,880 条 + lazy catalog | 部分 | 只做到计数与抽样；没有导出成可查表 | R-33 |
| V8 | 图片 / 品牌 logo / 壁纸 | 已逆 | RE-ui-shell §2.5；RE-s0 R9 | — |
| V9 | stylex class → 组件映射（卡片、设置、市场详情） | 部分 | 只覆盖 AUD 行 | 随各卡片 / 页面任务 |
| V10 | 卡片声明表（icon / placeholderHeight） | 已逆 | RE-sendmessage-ui §1.1 | — |

### 2.7 协议

| # | 面 | 状态 | 依据 / 缺口 | 任务 |
|---|---|---|---|---|
| W1 | 端口帧 hello/ready/request/cancel/reply/event，v1 → v3 | 已逆 | RE-ipc-rpc §4；RE-s0「同构，只差版本号」 | — |
| W2 | transcript entry 字段 v1（0.18）↔ v3（0.78.1） | 部分 | 只确认了一处差异（权限卡 action/target → description） | R-11 |
| W3 | 事件族 29 个的 payload | 部分 | transcript/agents/roster 已逆；其余 25 族只有名字 | R-11 |
| W4 | 云 Watch 多游标 / cursor_too_old / replay | 已逆 | RE-features Q3；RE-ipc-rpc §4 | — |
| W5 | send journal / nonce / GetSendStatus 补偿 | 已逆 | RE-ipc-rpc §4 | — |
| W6 | reply 容器校验表 U3n（每个 reply 类型的结构约束） | 部分 | 只举了 transcript-page 一例 | R-11 |
| W7 | server vs gateway 路由判定函数 | 边界外 | ARCH §5（不复刻 box，判定无需展开） | — |

### 2.8 0.18 ↔ 0.78.1 对照

| # | 面 | 状态 | 依据 / 缺口 | 任务 |
|---|---|---|---|---|
| H1 | 四轴机械 diff（依赖 / chunk / preload / proto） | 已逆 | RE-w05 | — |
| H2 | feature 级同 / 改 / 新 / 删 | 已逆 | RE-ui-shell §与0.18对照；RE-ipc-rpc §5 | — |
| H3 | 组件级：G18 移植树 `recovered/features/*`（249 文件）逐模块 → 0.78.1 entry / eager 模块 | 部分 | 只到 feature 粒度；P5-52/57 靠模块覆盖逐个判断 | R-32 |
| H4 | 卡片：移植树 13 个 view ↔ 0.78.1 34 个 body | 部分 | §2.1「移植」列给了存在性；字段差异没逆 | R-11 |
| H5 | host 存储 / 扩展 | 已逆 | RE-host-ext；RE-features §5 | — |
| H6 | 0.18 host 运行时代码（runner/tools、extensions/memory/auto-review/automations） | 未逆 | 471 个 ts 文件，可读源码 | R-06 |

### 2.9 已知缺口逐项核对（派发列出的 ③）

| 缺口 | 现状 | 状态 | 处理 |
|---|---|---|---|
| 33 型卡只逆 2 型 | 实为 35 型 / 34 body；已逆 3 型（含退休型），部分 2 型 | 未逆为主 | R-01、R-02、R-12a–g |
| autoReview | 客户端三层已逆；判定在云端；0.18 host 有实现 | 部分 | R-06（源码读）、R-12c（卡 body） |
| 记忆 | RPC + 字段 + 工具名 + 1 个 chunk 名 | 部分 | R-07；行为读 G18 extensions/memory（R-06） |
| Main Agent store | 已逆（mainAgent / ensureDefault / gate），残留 UI 特权未知 | 已逆 | R-15 顺带 |
| Room / 群聊 | 清单级 | 部分 | R-09 |
| webhook / 自动化 | 清单级；workflows 与 automations 两套没区分 | 部分 | R-08 |
| Spend / 虚拟卡 | 清单级，非目标 | 未逆 | R-30（不建议做） |
| mcp-auth | 流程已逆，文件 schema 和事件族没逆 | 部分 | R-02 |
| 语音 | 只有名字 | 未逆 | R-25 |
| 浏览器（BrowserSecureFill、sand-playwright-runtime、webview） | 只有名字 | 未逆 | R-26 |
| bot 邮箱 | 只有名字 | 未逆 | R-27 |
| 0.18 ↔ 0.78.1 架构系统对照 | 机械 / feature 级已做，组件级和 host 运行时没做 | 部分 | R-32、R-06 |
| daemon 细节 | 审批已逆；执行语义 / messages-worker / tree-sitter 没逆 | 部分 | R-19、R-20、R-21 |

## 3. RE 任务清单（按优先级；一行一派）

派发统一要求（照抄进提示词）：只读 `/dev/shm/grok-re/0.78.1/app/dist/`，丢了按 RE-unpack §0 重建；不读凭证文件；临时目录用 `/tmp/bot-<任务>`；不用 pkill，进程清理走 bot-reap；报告写主仓 `work/<slug>/RE-<topic>.md`，锚点格式 `文件@偏移`；凡是卡片/页面类任务，在 `work/p5-parity/harness/grok-r3/` 桩下加 fixture 出亮暗参照图（RE-stub-boot 方法）。派给列写「scout」的是源码阅读，不派 REA。

| 优先 | ID | 目标 | 入口锚点 | 途径 | 量 | 下游 | 派给 |
|---|---|---|---|---|---|---|---|
| 1 | **R-10** | 跨 session / 线程：thread-from-message、replyQuote/replyToId/isFork、rollBack、reactions UI、session 列表在 UI 的位置、`task:<id>` 线程 composer 槽位 | APP createThreadFromMessage@4226185、reactToMessage@4226138、rollBack@3750897、listGrokBotAgentSessions@3904356；PROTO@1177671；chunk-thread-card 5K | S+R | M | **P6 第一批「跨 session」（Q-020）** | reverse-engineer |
| 2 | **R-05** | 编排可见面：outline 面板 + getConversationOutline reply、tasks/workspace overlay、task-changed 卡、getSubagents/getAsyncTasks reply、subagents/async-tasks/agent-tasks 事件 payload | APP@258250/@4295955、getSubagents@3827245、getAsyncTasks@3812168；DICrypK2；7PKdecmC | S+R | M | **P6-16 1b UI（Q-019 默认隐藏、coworker 式展示）**；P5 tool 行 | reverse-engineer |
| 3 | **R-01** | 提问卡：widget + user-form 的 payload（options / multiSelect / 自由文本 / 跳过）、提交与撤销流程、widgets 域 9 个方法的参数 | BnT48mMZ 24K、lxKSMA-f 22.5K、inline-user-form 46K、chunk-widget 17K；APP `Gd.widgets`@~263000 | S+R | M | **P5-33 提问卡、P5-28** | reverse-engineer |
| 4 | **R-02** | MCP 连接器授权：connector-grant 卡（serverName + always）、GrokBotToolPermissionPolicy{tools,reads,writes}、setMcpToolPermissions/adoptServer…/ClearConnectorAlwaysAllow、settings toolPermissions、mcp-auth.json 与 mcp-auth 事件族 | EpEVD5Q5 9.5K；PROTO@1020042/@1020843；plugin-detail-view 权限段 | S+R | M | **P5-23 / P5-24 / P5-32** | reverse-engineer |
| 5 | **R-04** | 市场列表行 / 分类 / 安装态 / 详情页 / 自定义 MCP 表单 / per-app connector 卡 + skills 9 方法 | kcheXZ65 186K（D1–D3 之外）、plugin-detail-view 78K、native-plugin-detail 49K、custom-mcp-form 21K、connector-card(-view) | S+R | M | **P5-57**（目前列表行是自定） | reverse-engineer |
| 并行 | **R-06** | G18 host 源码读：runner/tools（agent / subagent 管理、send-message tool/schema/encoding、turn-toolset）、agents/agent-messaging、sand-multitask、extensions/{memory,auto-review,automations,notifications}、system-prompt；产出工具 schema 表 + 行为要点，标「0.18 推定」 | `G18/source/host/runner/tools/*`、`host/extensions/*` | G | M | **P6-10~13 工具 schema（0.78.1 边界外）**、autoReview、记忆 / 自动化 slug | scout（非 REA） |
| 6 | R-14 | tool-call 状态行全表：165 个工具 → verb / textKind / 文案 / icon | APP@1059420 `function lO(` | S | S | P5 tool 行、P6 SendToAgent 行 | reverse-engineer |
| 7 | R-33 | i18n 导出：en catalog 3,880 条 + lazy catalog，导成 `id→string` TSV | eager common/app/platform + chunk-* locale | S | S | 所有 UI 文案保真（P5-57 自定的英文文案可直接核对） | reverse-engineer |
| 8 | R-03 | settings 壳 + general + permissions 节：结构、行组件、视觉值、交互 | layout DBVKePVV、general-pane 103K、DLupEaB5 19.6K；RE-approval-model §4.4 | S+R | M | P5-32、P5-57 配置面 | reverse-engineer |
| 9 | R-11 | wire 字段对照：9 种 entry kind 的 v1↔v3 字段级 diff、29 个事件族 payload、U3n reply 校验表 | APP U3n、Fz 表；harness/compare/stub-v1.js vs stub-v3.js | S | M | P5-51 shim 维护；从 0.78.1 往移植树补任何新功能 | reverse-engineer |
| 10 | R-07 | 记忆面：ListGrokBotUserBotMemories / Fact / Folder、shared memories / promote、settings import-memory、team-bot-memories-list、RecallMemory/UpdateMemory/SortMemories 行文案、个人记忆 UI 在哪里 | APP@468699/@575167；PROTO@1127351；chunk-team-bot-memories-list 6K | S+R | M | 记忆 slug（RE-features 候选） | reverse-engineer |
| 11 | R-08 | 自动化 / routines / webhook / workflows：两套的区分、automation-detail-panel、info-pane routines tab、recurrence、webhook credential、automation-changed 卡 | APP getAgentAutomations@3813581、runAutomationWebhook@3819620；PROTO@994653；automation-detail-panel 16K；Ba5V5NT9 | S+R | M | 自动化 slug | reverse-engineer |
| 12 | R-09 | 群聊 Room：create / add people / cancel member turn、groupTurns、members tab、person-* / bot-* 事件 5 型、people-search-menu、群聊 canvas、gate grok_bot_multiplayer | PROTO@1037429；APP createGroup@2789884/@4167144、setGroupMembers@4168320；people-search-menu-live 68K | S+R | L | 群聊 slug、P6 跨 bot | reverse-engineer |
| 13 | R-13 | bot mark 动画引擎 0.78.1 ↔ 0.18 persona 差异表（body、动效 case、poke、跟随指针、seed、帧率、reduced-motion）+ 桩下逐态录帧 | APP@896379 `sand-grok-bot-mark`；COMMON@~300000–362000（`p_`/`f_`） | S+R | M | 用户「bot 动画不太行」；P5-56 后续 | reverse-engineer |
| 14 | R-15 | info-pane 其余 5 个 tab + overview 深挖 + avatar-editor + main agent UI 特权（ARCH §5 (b)） | APP `ps=[overview,routines,…]`；agent-avatar-editor 22K | S+R | M | P5-57 配置面、后续 info-pane | reverse-engineer |
| 15 | R-18 | composer / prompt-editor / 附件 staging 7 方法 / new-chat-bar / markdown 渲染规格 | prompt-editor 80K、new-chat-bar 34K、markdown 58K | S+R | M | composer 保真 | reverse-engineer |
| 16 | R-17 | 全局浮层：命令面板、notice-host、update-prompt、feedback、network-debugger、tray、popout 窗口、ChatHeader 细节 | eager APP；network-debugger-dialog 11K | S+R | M | 外观保真 | reverse-engineer |
| 17 | R-12c | 审批类卡其余 8 型：auto-review-approval、secret-request、credential-request、cookie-origin、publish、app-secrets、mobile-tool-permission、meeting-join-consent | §2.1 S5/S6/S26/S27/S31–S34 | S+R | M | P5 审批面补全 | reverse-engineer |
| 18 | R-12a | 连接器类卡 10 型（connector(s)、listener / scm / slack / onepassword-connect、notifications-enable、appearance-picker、team-access）+ listeners 域 | §2.1 S15–S21/S23/S24 | S+R | M | 市场 → 会话连接流 | reverse-engineer |
| 19 | R-12f | 非 send 卡：message 分支、notice、mcp-app、user-attachment、feedback | §2.1 C2–C6 | S+R | S | 会话流保真 | reverse-engineer |
| 20 | R-12d | 富卡：attachment、visualization、cursor-agent、bot-template-share | §2.1 S2/S4/S13/S25 | S+R | M | — | reverse-engineer |
| 21 | R-12g | event 卡剩余（name-changed、channel-*、cloud-agent-launched、dev-event） | §2.1 E1–E3/E6/E14 | S+R | S | — | reverse-engineer |
| 22 | R-16 | onboarding 流程 / 步骤 / gate + 封面 | chunk-onboarding-flow 64K | S+R | S | P5-57 启动封面 | reverse-engineer |
| 23 | R-36 | Statsig gate / experiment 全清单 + 客户端默认值 | APP exposeFeatureGate@566415/@3963797、`sand_*` / `grok_bot_*` 串 | S | S | 本地 gate 默认值（ARCH §4.3④） | reverse-engineer |
| 24 | R-19 | daemon 本地工具执行语义 + /local-exec 反向通道请求 kind 全表 + getHostStatus | DAEMON@2349816 起；`gt.Shell/Read/AwaitShell` 文案段 | S | L | dsh 工具行为对齐、P5 沙箱 | reverse-engineer |
| 25 | R-21 | tree-sitter bash 在 daemon 里的用途 | DAEMON `tree-sitter` 3 处 + CURSOR_TREE_SITTER_STUBBED | S | S | P5-21 档位策略（是否有命令分类） | reverse-engineer |
| 26 | R-22 | 通知音映射 + 通知权限 / 偏好 | assets/*.wav、getDesktopNotificationPreferences | S | S | P6-16 OS 通知 | reverse-engineer |
| 27 | R-32 | 组件级对照矩阵：移植树 249 文件 → 0.78.1 模块（同 / 改 / 新 / 删 + 覆盖点） | `app/ui/renderer-grok/frontend/src/recovered/features/*` ↔ APP | S+G | M | L-UI 后续覆盖决策 | reverse-engineer |
| 28 | R-35 | GrokBotService 414 + main 边 431 方法按族归档成 TSV（族、用途、MVP、字段引 proto-fields） | PROTO；`work/p1-re/w05/output/proto-fields.tsv`；preload.cjs | S | S | 后续 slug 选面 | reverse-engineer |
| 29 | R-34 | 图标名表精确解码（穷举校验器） | platform `var Kr=` | S | S | 图标保真 | reverse-engineer |
| 30 | R-12b | 草稿类卡 6 型（email / slack / meeting / imessage draft、calendar-event、email-offer） | §2.1 S8–S12/S22 | S+R | M | 渠道 slug（暂无） | reverse-engineer |
| 31 | R-24 | Library / canvas / document / places 面：先做 S 级盘点，产品面明确后再深挖 | document-page 229K、M14 方法族、library-docs 事件族、places-stage 122K | S | S→L | 未知 | reverse-engineer |
| 32 | R-27 | bot 邮箱（inbox store、email 工具、mac-mail-setup） | M10；mac-mail-setup-dialog 11K | S | M | 暂无 | reverse-engineer |
| 33 | R-20 | messages-worker / iMessage / Mail 本地管线 | `local-exec-daemon/messages-worker.cjs` 121K | S | M | 暂无（mac 专属） | reverse-engineer |
| 34 | R-26 | 浏览器：BrowserSecureFill、cookie-origin、sand-playwright-runtime、preload-webview | deps + preload-webview.cjs 6.6K | S | M | 暂无 | reverse-engineer |
| 35 | R-23 | settings 其余节：integrations、computer、updates | BLt3J-sA、ODc_03uE、DSY1HXfk | S+R | M | 低 | reverse-engineer |
| 36 | R-25 | 语音 / 听写 / voice-call / phone-call | AiService、M11、BCgrkxOh、phone-call 25K | S | L | 低（composer mic 钮只需 R-18） | reverse-engineer |
| 37 | R-28 | 团队 bot / 分享 / 模板市场 / 管理屏 | §2.2 P23–P26/P34、D22、M8 | S | L | 私用不需要 | 不建议派 |
| 38 | R-29 | Slack / Teams / channels | P27、D18 | S | L | 非目标 | 不建议派 |
| 39 | R-30 | 计费 / vault / 1P / passkey / 虚拟卡 / spend / secrets 存储 schema | P28/P29/P35、T5/T6、M7/M9、A15 | S | L | 非目标（分发前重审） | 不建议派 |
| 40 | R-31 | computer-use / box / desktop-mount / VNC / teach-recording | P30、D15/D16、M4、E15 | S | L | 非目标（云 box） | 不建议派 |

清单共 41 条：36 条可派 REA，1 条 scout 并行（R-06），4 条不建议派（R-28~R-31）。

## 4. 建议第一波（REA ≤5 条，可同时派）

1. **R-10** 跨 session / 线程 → P6 第一批（用户已定，Q-020）
2. **R-05** outline + 任务线程 + subagents 面 → P6-16（Q-019 的 coworker 式展示）
3. **R-01** widget / user-form 提问卡 → P5-33 / P5-28
4. **R-02** connector-grant + MCP 工具权限 → P5-23 / 24 / 32
5. **R-04** 市场列表 / 详情 / 自定义 MCP → P5-57（最好在 P5-57 动列表行之前回来）

同时让 scout 跑 **R-06**（G18 host 源码读），它是 P6-10~13 工具 schema 的唯一证据来源，不占 REA 名额。第二波：R-14、R-33（都是 S，收益覆盖所有 UI）、R-03、R-11、R-13。

## 5. 不建议逆的面（及理由）

- 非目标域（R-28~R-31）：私用不分发、不复刻云 box、不做计费和团队。用户说的「全部」在本表里体现为「已登记、有锚点」，可以随时派，但不进前两波。
- 边界外（A17、A19–A21、K13、W7）：0.78.1 客户端里没有实现，REA 也拿不到。A19–A21 改走 R-06；其余在不复刻 box 的路线下无需求。

## 6. 局限

- 本审计的新增事实都来自静态枚举（lazy 注册表 75 条、bXt/jie 集合、Gd 22 域合计 146、preload 431 = 305+126、工具枚举 165），每条都可在锚点处复跑；main 边的分族是关键字启发式，族内条数是约数。
- 「已逆」判定以报告是否给出字段 / 锚点为准，没有逐条复验旧报告的正确性（P5 对照台与 R3 截图已对核心面做过实证）。
- §2 的总数会随 R 任务回报变化，回报后改对应行的状态列即可，不另开表。
