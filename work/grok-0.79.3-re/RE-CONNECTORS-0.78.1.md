# RE-CONNECTORS：Grok Bot 0.78.1 Connected apps 全量规格

日期：2026-11-11。方法：同 `RE-SETTINGS-0.78.1.md`（0.78.1 deb 静态解包）。0.79.3 既有结论引用处标注（`RE-FULL-0.79.3.md`、`onboarding-0793-extract.json`）。

锚点缩写（SETTINGS 文档的 APP/COMMON/MAINE/DAEMON/COORD 沿用），新增：
- **VIEW** = `renderer/assets/chunk-view-kcheXZ65.js`（Connect apps 页主视图，185KB，@偏移均指此文件除非另注）
- **PDV** = `renderer/assets/chunk-plugin-detail-view-BgPF1Rqs.js`（插件/连接器详情，80KB）
- **NCC** = `renderer/assets/chunk-native-connector-card-tEGjQXOY.js`（native 连接器卡）
- **CCC** = `renderer/assets/chunk-connector-card-DcGxh_HK.js`、**CCV** = `chunk-connector-card-view-CrTQkW_M.js`（连接卡组件+handoff 视图）
- **MBM** = `renderer/assets/chunk-marketplace-browse-model-_4v46oGV.js`（市场浏览模型）
- **CMF** = `renderer/assets/chunk-custom-mcp-form-IGQv-nwH.js`（自定义 MCP 表单）
- **UCC** = `renderer/assets/chunk-user-custom-connector-Bi0ew0AX.js`（自定义连接器入口）
- **GRANT** = `renderer/assets/chunk-view-EpEVD5Q5.js`（ConnectorGrant 审批卡）

---

## 0. 结论先行

0.78.1 的 Connected apps 不是独立小页，而是一个**统一的 Apps/Tools/Marketplace 页面**（路由 `Zq`）：同一 catalog 里混排「连接器」（OAuth 账号连接，native/grok-served）与「可安装插件」（installEntry），加 Mac 本地 7 能力连接器、自定义 MCP 表单。入口在**侧栏 footer 的 "Connect apps" 按钮**（带已连接数徽标）与命令面板 `connect-apps`（快捷键 `sand.openTools`）；onboarding 的 "Connect your apps" step 是 **0.79.3 新增**（gate `onboardingConnectorStepEnabled`），0.78.1 没有。连接流 = `authenticateMcpServer` RPC → 系统浏览器 OAuth → 轮询等待 + `grokbot://mcp/oauth/callback` 深链 → `completeMcpOAuth{code,state}`；无 key 输入（key 只出现在自定义 MCP/插件安装表单的 secret 字段）。状态在 `getMcpState`（server.status：connected/needsAuth/…），安装记录写**服务端账号作用域**（`requireAccountWriter`）。聊天里已连接对象以 27 种 doc 引用类型渲染，bot 使用连接器前弹 **ConnectorGrant 审批卡**（Allow once / Always allow this bot / every Team Bot）。

---

## 1. 入口全貌（B.1）

| 入口 | 证据 |
|---|---|
| **侧栏 footer "Connect apps" 按钮** | APP `b2e`/`x2e` 组件（搜 `function x2e(`）：title = `aO()` = i18n `h8AWBN` "Connect apps"；点击 `openConnectorBrowse()` → 路由 `Zq.link({focusBrowseQuery:''})`。props 含 `connectedAppCounter`（§4.4）。侧栏组装处 `connectedAppCounter:ljt`（搜 `onOpenPlugins:ee,connectedAppCounter`）。 |
| **命令面板命令 `connect-apps`** | APP 搜 ``{id:`connect-apps`,label:{id:`h8AWBN`},keys:[t8(`sand.openTools`)]}``，与 details/bot-settings/skills 并列在命令分组。 |
| **onboarding Connect step** | **0.79.3 新增**（`onboarding-0793-extract.json` connect 节：Gmail/Google Calendar 或 Outlook/Outlook Calendar 按邮箱域名分发，gate `onboardingConnectorStepEnabled`）。0.78.1 的 onboarding chunk（`chunk-onboarding-flow-CX7HFdkW.js`）无 gmail/outlook/connect 内容，gates 仅 attribution/jobRole/roleUseCaseBots——0.78.1 无此步。 |
| **聊天内引导** | (a) @ 提及未连接 plugin → `startConnecting`（0.79.3 RE-FULL §3；focus 参数 `IPn` 的 ``case`plugin`` 分支带 `startConnecting:e.startConnecting===!0`，0.78.1 同）；(b) 会议邀请场景 "Connect Google Calendar or Outlook to send this invite"（i18n `AR+YGU`）；(c) ConnectorGrant 卡（§5.2）。 |
| **深链** | `grokbot://` → Connect apps：focus 参数 `focusPlugin{pluginId,arrival,startConnecting}` / `focusBrowseQuery` / `focusServerId` / `marketplaceFocus`（APP 搜 `focusPlugin:{kind`）。 |

页面自身模式机（VIEW 搜 ``it=J==null?nt?{kind:`manage`}:{kind:`front`}:{kind:`detail`,target:J,depth:Xe.length}``）：`front`（首页：Installed + 分类浏览 + 团队插件）→ `manage` → `detail`（栈式导航，支持 search）；二级 `custom-connector`（Add a custom connector）与 `marketplace` 浏览。

## 2. 连接器列表与分类（B.2）

### 2.1 数据模型：连接器 = grok-served MCP server

- 列表项 union：`{kind:'plugin', pluginId}` / `{kind:'connector', plugin, server}`；**connector 判定**：`server.servedBy==='grok'`（一方连接器）。已连接计数谓词（APP 搜 `function fMt(`）：`kind==='connector' && plugin==null && server.servedBy==='grok' && server.status==='connected'`。
- 一方 server id 形态 `user-*-xai`：`user-SharePoint-xai`、`user-Finance-xai`（APP 搜 `rowServerIdentifier` 上下文）+ `user-bot-memories`。
- catalog 来自服务端 RPC `getMcpCatalog`（本地无静态清单——0.78.1 静态可见的连接器名只出现在文案与 onboarding/聊天映射里）。
- 「市场安装 app」vs「连接器」：**同页同 catalog，无概念墙**——浏览模型（MBM）里 plugins（可安装）与 bots 同列 11 分类；`nativeMarkerOf:e=>e.native` 给 native 连接器打标；Installed tab 混排两者。连接器卡有 Connect/Reconnect/账户，插件卡有 Install/variableFields 表单。

### 2.2 市场 11 分类（MBM `b` 数组 + `F` i18n 映射，全部逐字）

**Password Managers / Productivity / Communication / Design / Code / Data / Sales / Marketing / Finance / Research / Support**（MBM ``var b=[`credentials` `` @2,024，i18n 反查 COMMON）。
- 服务端 17 个 categoryKey → 11 分类映射（MBM `x`：LOGIN_AND_CREDENTIAL_MANAGEMENT→credentials、INFRASTRUCTURE→code、CANVAS/DESIGN→design、INBOX_AND_COLLABORATION/SCHEDULING→communication、PAYMENTS/FINANCE_AND_LEGAL→finance、DATA_ANALYTICS→data、DOCUMENTS_AND_FILES→productivity…）。
- 客户端硬编码 override（MBM `C`）：slack→communication、notion/notion-workspace/linear→productivity、figma/tldraw→design、github/github-plugin/runlayer/superpowers/compound-engineering/create-plugin→code、langfuse→data、parallel→research+data、context7/context7-plugin→research。
- 推荐 signal：team 安装数（teammateCount）/affinity；communication 分类固定 `email` 顶置（MBM `I={communication:['email']}`）。

### 2.3 Mac 本地能力连接器（7 个，VIEW `ti` 数组 @5,458）

搜 ``ti=[`messages`,`mail`,`notes`,`reminders`,`calendar`,`location`,`contacts`]``。各卡副标（逐字）：
- **Messages** "Read and reply to texts"（开关三件 + 名单，§4.3）
- **Mail** "Find and read your email"（bullets："Find and read your email" / "Draft emails in Mail" / "Send email you approve"）
- **Notes** "Find and read your notes"（+"Save new notes and add to existing ones"）
- **Reminders** "See your reminders and what's due"（+"Add, change, and check off reminders"）
- **Calendar** "See your schedule and free time"（+"Add, move, and remove events"）
- **Location** "Find where this Mac is"
- **Contacts** "Look up names, numbers, and emails"

卡上下文标签："This Mac" / "Mac" / "Works while it's online"；"Your other devices are in Settings › Manage devices"。

### 2.4 聊天可引用的已连接对象类型（27 种，APP `q_n` @3,240,358）

搜 ``var q_n={notion:``：notion、google-docs、google-sheets、google-slides、google-drive、onedrive、sharepoint、figma、figjam、figma-slides、linear-issue、linear-document、confluence-page、jira-issue、github-file、github-gist、github-issue、slack-canvas、box、dropbox、airtable、coda、miro、canva、hex、**gmail-draft**、**google-calendar-event**、slack-message、github-pull-request → 显示名（Gmail / Google Calendar / Slack / GitHub…）；web/other。同文件 `X_n` 把类型映射回 server 名（如 gmail-draft→workspace、onedrive→microsoft-365），doc key 形如 `` `doc:${e.key}` ``（`Y_n`）。

### 2.5 OAuth broker

`connectionKind==='oauth-broker'`（NCC `k(e)` 判 `brokerState??'connected'`）——Slack 等走 broker 代理连接（卡面与直连 OAuth 相同）。

## 3. 连接流（B.3）

### 3.1 主流程（OAuth，无 key 输入）

1. 卡上 Connect → RPC **`authenticateMcpServer({serverId, accountKey?, trigger:'connector_card', entryPoint:'chat_card'|'marketplace'|…})`**（MAINE @1,447,695，args 定义搜 `Bie=(0,f.rpcObject)({serverId`；`installMcpServer` 类操作是 "person" 权限级 RPC）。
2. 主进程 `openExternal(oauthUrl)` 打开**系统浏览器**（MAINE 搜 `waitForBrowserLogin` @1,238,353：`loginBrowserWait.run(... openExternal(r) ... waitForResult(n,a)`，结果 `stopped-waiting` / `unreachable` / 成功）。
3. 回调双通道：轮询等待 + 深链 **`grokbot://mcp/oauth/callback`**（MAINE @14,719）→ RPC **`completeMcpOAuth({code, state})`**（MAINE @1,450,807，授权码换 token）。
4. UI 提示逐字："Opened the OAuth flow in your browser. Return here once it completes."（i18n `Ea8un6`）。
5. handoff 态（CCV `Oe` 组件）：`waiting`（`stillSigningIn`）/ `computerSignIn`（在 Grok Bot 的电脑上登录）+ `copyableSignInUrl`（可复制登录 URL 按钮）。

### 3.2 变体

- **两段式（Mail）**：连上即可读；发送要二次授权——"Grok Bot can already find, read and draft your email. Finish setup to send."（VIEW，`connection==='not-connected'` 时的 description）+ 发送策略开关 "Grok Bot asks before each email"。
- **数据中心选择**（`chunk-connector-data-center-D7GAVfda.js` 全文 1.1KB）：确认式单选对话框 "Choose your {connectorName}"，choices label "Data centers"，空选保护 "Choose a data center to continue"，Confirm "Continue"。
- **SharePoint 写**：`sharepointSignIn({access:'read'|'write'})` RPC；失败文案 "SharePoint write sign-in was not saved"（PDV/VIEW）。
- **多账户**：卡带 `canAddAccount` → onAddAccount（再加一个 `accountKey`）；账户管理 `renameMcpAccount` / `removeMcpAccount`（RPC 面 APP 搜 `mcp:[`getMcpState`` 域，全部方法：getMcpState、getMcpCatalog、getMcpPluginLogo、removeMcpServer、authenticateMcpServer、renameMcpAccount、removeMcpAccount、setMcpCustomInstructions、listMcpServerTools、toggleMcpToolDisabled）。

### 3.3 自定义 MCP（唯一出现「key 输入」处）

入口 "Add a custom connector"（i18n `qLe/7o`，UCC，遥测 `customConnector({stage:'started'|'connected', entrypoint:'connect_apps'})`）→ CMF 表单：
- 双模式 **Form / JSON**（"Form" / "JSON"，JSON 面板 "MCP server JSON" + "Add one server to the JSON"）。
- Form 字段（英文逐字，COMMON 反查）：**Name**、**Server URL**（"Remote HTTPS"）、**Command** + **Arguments**、HTTP headers（Key / Value 行）、**OAuth Client ID (optional)** / Client Secret（OAuth 型）。
- 安全警示逐字（`S6uAcw`）："A command runs on the box each conversation uses, including teammates' conversations. Teammates can use the shell there, so a command with environment variables runs only in your own conversations. Use Remote HTTPS for a server that needs secrets."
- 校验："The server needs a URL or a command"、"Server name must not be empty"、名字须含字母数字、"Enter valid JSON"、"Add one server at a time"。
- 提交 → RPC `addMcpServer({name, configJson: JSON.stringify(config)})`。
- 插件安装表单的 variableFields：类型 text/number/integer/**isSecret→`<input type="password">` 掩码**/select 下拉/format:url；placeholder 默认字段 key；`aria-invalid` 校验态；`omitsSecretFields` 选项控制回显（MAINE 搜 `variableFields`）。

## 4. 状态存储与显示（B.4）

### 4.1 状态机

- `getMcpState`（RPC）→ servers 列表；server `status`：**`connected` / `needsAuth`（细节 `{kind:'sign_in_pending',…}`）/ `initializing` / `disconnected` / `idle` / `error`**（APP 搜 ``case`connected`:return``、PDV ``Zn=new Set([`initializing`,`disconnected`])``）。
- 内置 gating（`chunk-native-plugin-state-CbU4YlLg.js` 全文 1.1KB）：`builtinServerIdentifier` 存在时用谓词——`onepassword` → 1Password 服务 isCredentialsConnected；`email` → hasEmailInbox。
- 卡面三态（NCC）：`disconnected`（按钮 **"Connect"** `iSLIjg`）/ `connected`（按钮 **"Reconnect"** `gcoiFh`，副标 "Connected to {accountLabel}" `3khQqh`）/ `checking`。列表页标签 "Connected" / "Not connected"（VIEW `QHcLEN`/`S33tz3`）、"Server is not configured"（`E0z8bW`）。

### 4.2 断开

- 断开确认（destructive 对话框）：标题 "Disconnect {providerName}"（`8U6a8X`），后果文案按 provider（SCM：**"Grok Bot and Cursor cloud agents lose access to the repositories on {providerName} until you connect it again"** `/rs6zp`；1Password："Grok Bot will stop signing in with your 1Password logins until you connect again" `uG9dXc`），Confirm **"Disconnect"**（`+K0AvT`）→ `disconnect(connectionId)` / `removeMcpAccount`。金融类有 `institutionName/accounts` 与 `status:'error'|'disconnected'`（PDV `Ot`）。
- 断开后状态："Disconnected"（`ZYnwzF`）、toast "Disconnected {name}"（`SVNn3I`）、"Grok Bot can no longer use {0}"（general pane 治理区）。
- 移除插件/连接器：`removeMcpServer` / `uninstallMcpPlugin`。

### 4.3 Messages 连接器开关（状态即设置）

VIEW `Yi`/`Xi`（搜 ``Yi={read:{label:{id:`xNdDnA`}``）三开关 + 名单，对应 settings computer 区键：
- **"Read Texts"**（"Catch up and find old messages"）→ `messages`
- **"Send Texts"**（"Grok Bot asks before each text"）→ `messages-send`
- **"Show Contact Names"**（"Know who \"Mom\" is"）→ 联系人解析
- **"Always allowed"**（"Grok Bot can text these people without asking first"）→ `messages-allowed-recipients`（名单管理）

### 4.4 已连接计数（侧栏徽标）

`countConnectedApps()`（APP `uMt`，搜 ``nMt=t({countConnectedApps:()=>uMt``）：`qq(e).length`——已连接 grok-served server 数（§2.1 谓词）。侧栏 footer 传入 `connectedAppCounter:ljt`（懒加载 store：peek/subscribe/preload，miss 时触发 `connected-app-counter-import`）。折叠状态受服务端 flag **`sand_connect_apps_collapse`**（`Ice()` 读 dynamicConfig）+ client persistence 影响；摘要文案 `tK2iFA`（"{count}: {joinedNames}" 形态）。
安装/连接记录写**服务端账号作用域**：`installEntry` → `requireCachedPlugin(entryId)` + `core.requireAccountWriter()` + `inPluginWriteOrder(...)`（MAINE 搜 `installEntry(t,n,r=`）——换账号不共享；本地 catalog 有缓存。数据目录 `~/.grokbot`（`SAND_DATA_ROOT`，MAINC 常量 `.grokbot`）。

## 5. 聊天内使用（B.5）

### 5.1 引用已连接对象

聊天里已连接 app 的产物 = 文档/草稿引用，类型即 §2.4 的 27 种（Gmail 邮件 = `gmail-draft`、日历事件 = `google-calendar-event`、Slack 消息 = `slack-message`、GitHub PR = `github-pull-request`…），渲染为显示名 + 图标，doc key `` `doc:${key}` ``。

### 5.2 ConnectorGrant 审批卡（bot 用连接器前的授权）

GRANT chunk（9.5KB）+ transcript `ask` entry（`{status:'pending'|'skipped'|…, requestId, serverName, interruptedBy}`）：
- 选项：**Allow once**（"Allow {0}"）；**Always allow**——`always_this_bot`（"Always allow for your messages to this Bot"）/ `always_all_team_bots`（"Always allow for your messages to every Team Bot"，"Choose which Bots to always allow {0}"）。
- 说明行 "This uses your {0}"（如 This uses your Gmail）。
- 群聊协同："Waiting on {waitingOn}" / "Only {waitingOn}" / "This uses {waitingOn}"（chunk-group-chat-connect-waiting 联动）。
- Skip（"Skipped {0}"）；失败重试 "Your answer didn't go through. Check your connection and try again."
- 提交 RPC `resolveConnectorGrant({entryId, requestId, resolution, agentId, sessionId?})`（approvals RPC 域，与 resolveLocalToolPermission/resolveMessagesGrants 并列）。

### 5.3 未连接引导与遥测

- 聊天卡/提及未连接 connector：NativeConnectorCard `connectsInPlace` → 直接 `connectOAuth()`；否则带 `startConnecting:true` 跳 Connect apps 页定位到该 plugin（NCC `G` 回调）。
- 遥测（APP shipReport，搜 `shownConnectorCards`）：`connector_card_shown{serverName,serverId,cardId,cardSource,cardOrigin,entryPoint:'chat'}`（512 条去重持久化）、`connector_auth_clicked`。
- 团队治理：Team Bot 用个人连接器要 general 区 connector preferences 授权（RE-SETTINGS §4f）。

---

## 复刻优先级建议（Connected apps）

必需（复刻完整 Grok Bot 的最小集）：
1. **Apps 页骨架**：侧栏 footer "Connect apps" 按钮 + 计数徽标 + 命令面板命令；页模式 front/installed/detail。
2. **连接器卡三态**（Connect / Reconnect / Connected to {account}）+ 连接流（authenticateMcpServer → 系统浏览器 → completeMcpOAuth）+ 状态机（connected/needsAuth/disconnected）。
3. **ConnectorGrant 审批卡**（Allow once / always this bot / every team bot）——这是 bot 安全使用连接器的门，规格已逐字。
4. Installed 视图 + getMcpState。

P1（完整体验）：
5. 自定义 MCP 表单（Form/JSON 双模式 + secret 掩码 + Command 安全警示）。
6. 多账户（accountKey/rename/remove/add）、断开确认（后果文案）、两段式 Mail、数据中心对话框。
7. 聊天引用渲染（27 类型映射表）与 meeting 邀请引导。

后置：
8. 市场 11 分类浏览 + 团队推荐 signal + 发布流（publish/unpublish）。
9. Mac 本地 7 能力连接器（平台专属，Linux 版应裁剪或映射到等价本地能力）。
10. onboarding Connect step（0.79.3 行为，gate 控制显隐——我们的 ConnectStep 桩对齐 0.79.3 是对的，0.78.1 本无此步）。
11. SharePoint 写、Finance broker、1Password native gating、团队 connector preferences 治理。

对照我们现状：
- `onboarding-steps-0793.tsx` ConnectStep 恒 disabled 的桩：规格上 0.79.3 的 connect step 只列 Gmail/Google Calendar（google 邮箱）或 Outlook/Outlook Calendar（MS 邮箱）四卡 + Connect 按钮（`chunk-connector-card variant=connect`），连上即 Continue、否则 "Skip for now"——复刻开闸时按此实现，不依赖 0.78.1。
- `market-store.ts`（市场=安装非连接）：原版两者同页同 catalog，区别只在卡行为（连接 vs 安装）——建议后续把「连接」卡并入同一页而不是分家。

## 局限与未验证项

1. 全部静态结论，未运行产物；OAuth URL 构造与 token 交换在服务端/主进程深层，只见 openExternal + completeMcpOAuth 两端。
2. grok 一方连接器的**完整 catalog 清单**来自服务端 `getMcpCatalog`，静态只能从文案/引用类型旁证（§2.4 的 27 类型 + onboarding 4 项 + SharePoint/Finance/Slack broker）；不能声称 0.78.1 上线连接器全集就是这些。
3. `x$.integrations` 等导航 label 的 i18n 文本未逐个反查（id 引用链在 flag 容器内，文案为 "Integrations"/"Usage and billing" 级别的常规词，0.79.3 已确认 "Texting"）。
4. ConnectorGrant ask 的 transcript entry 精确 kind（send-message 内嵌 or notice）未逐字段确认（组件从 entry props 读 ask 对象，形态与 local-tool-permission 同族）。
5. connectedAppCounter 折叠 store（N0e 键）的持久化文件未定位。
