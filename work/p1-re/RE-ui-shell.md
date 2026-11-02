# RE-ui-shell · 0.78.1 路由/页面/设计token/组件树（BRIEF §6 Q1–Q3）

日期：2026-11-01 13:23 · 对象：`/dev/shm/grok-re/0.78.1/app/`（0.78.1 解包树，linux-amd64）· 方法：静态分析为主 + 未登录截图辅助（见 §局限 L1 事故记录）

## 结论（先行）

1. **没有 URL 路由器**。0.78.1 与 0.18 一样用「store-handle 导航 + 自定义 scheme 深链」：主窗口永远是一个 React 树（roster 侧栏 + 主区栈），页面切换靠 overlay/entrypoint 挂载；深链路由表 `hs`（authority=CSP 里的自定义 scheme）定义 22 条 `/v1/*` 路由。0.18 的 5 个 lazy feature surface 膨胀为 **75 个 lazy entrypoint**（Dune 插件运行时注册表）。
2. **未登录只能到达一个界面**：全窗口 Sign-in 封面（heading "Grok Bot"、副标题、Sign in 按钮、Terms 链接、自绘窗口控制按钮），AX 树仅 46 节点，无侧栏无设置。截图 `work/p1-re/evidence/01-boot.png`。
3. **设计系统完整可提取**：色板/字号/间距 token 在 JS 里运行时注入（`sand-cursor-theme` style 元素 + `documentElement.dataset.theme=cursor-light|cursor-dark`），静态 CSS（766KB stylex）只含组件样式与 370 个 `--sand-*` 变量引用；图标是 **cursor-icons 连字字体**（woff2，818 个命名字形）；正文字体 **XVF/XVF Mono** 可变字体（weight 200–800）+ KaTeX 数学字体，全部本地文件可直接复制。
4. **MVP 四页全部有静态证据**：bot 列表=sand-agents-sidebar（pinned/分组/搜索/账号脚部）；会话流=transcript entry 9 种 kind + tool-call 紧凑行（eager 渲染）+ 33 类 send-message 卡（全部 lazy）；市场=plugins overlay（tabs plugins/bots + 技能/发布/团队共享）；设置=7 节 overlay + agent info-pane（overview/settings 等标签）+ 团队 bot 管理屏。
5. **相对 0.18**：同骨架（sidebar+store 导航+overlay）、改导航与卡片架构（卡片 lazy 化 + Dune 注册表）、新增大量 surface（tasks workspace、unified-billing、vault、passkey、grok-bot-team、bot-templates 市场、voice-call、meetings/channels、visualization）、删除 hidden-chats / org-chart / terminal-output / Broadcast 入口（grep 0 命中）。

---

## Q1 路由 / 页面 / 顶层面板清单

### 1.1 主窗口结构（bootstrap，全部 eager）

`dist/renderer/assets/index-CxzQ4vjO.js`（10.5KB 入口）挂载：

```
StrictMode > SentryProvider? > I18nProvider > ErrorBoundary(app) > MenuRoot(md)
> ClientProvider > AccessGate > ... > RootChrome(ot) 子树:
  [boot-shell, window-chrome, notice-host, update-prompt, ..., SidebarShell(Se){ CreditStack(Ve){ MainView(v) } }]
```

- `SidebarShell` 的 `isSidebarShown = W.popoutAgentId == null`（弹出单 agent 窗时隐藏侧栏）→ `index-CxzQ4vjO.js#"isSidebarShown:W.popoutAgentId==null"`。
- 自定义标题栏：AX 树见 Minimize/Maximize/Close 三按钮（=0.18 window-chrome 的延续）。
- 命令面板（palette）、反馈、更新提示等全局浮层均在根级。

### 1.2 深链路由表（0.78.1，22 条）

`index.eager-app-iGTgHP_Q.js`（下称 APP）中 `hs=mt({authority,schemes,routes:{...}})`，全部 `路径#"字面串"` 锚点已 grep -cF 验证：

| route | path | 参数 | 锚点（APP#…） | 命中 |
|---|---|---|---|---|
| agent | `/v1/agent` | id | `agent:An(\`/v1/agent\`` | 1 |
| agent-invite | `/v1/agent-invite` | id,token | `"agent-invite"` | 1 |
| bot-template | Ro.path | id,open | `"bot-template":An(` | 1 |
| **marketplace** | `/v1/marketplace` | tab∈{plugins,bots},id | `marketplace:An(\`/v1/marketplace\`` | 1 |
| plugin-add | `/v1/plugin/add` | id,team,channel,threadTs | `"plugin-add":An(` | 1 |
| plugin-native | `/v1/plugin/native` | id | `"plugin-native":An(` | 1 |
| github/gitlab/bitbucket/azure-devops-connect-callback | `/v1/*-connect-callback` | state,code… | `github-connect-callback` | 1 |
| onepassword-oauth/approval-callback | `/v1/onepassword-*-callback` | … | `onepassword-oauth-callback` | 1 |
| open | `/v1/open` | — | `open:An(\`/v1/open\`` | 1 |
| prompt | `/v1/prompt` | id,text(≤1000) | `prompt:An(\`/v1/prompt\`` | 1 |
| create-team-bot | `/v1/create-team-bot` | — | `"create-team-bot"` | 1 |
| referral | `/v1/referral` | — | `referral:An(\`/v1/referral\`` | 1 |
| messages | `/v1/messages` | — | `messages:An(\`/v1/messages\`` | 1 |
| **settings** | `/v1/settings` | id∈ds(68 个节 id) | `settings:An(\`/v1/settings\`` | 1 |
| thread / task | `/v1/thread`,`/v1/task` | agent,id | `thread:An(\`/v1/thread\`` | 1 |
| vault | `/v1/vault` | id | `vault:An(\`/v1/vault\`` | 1 |
| sidebar | `/v1/sidebar` | target/automation/agent/tab | `sidebar:An(\`/v1/sidebar\`` | 1 |

另外 `Fee=[settings,messages,plugin-add,sidebar,bot-template,agent,vault]` 是「侧栏可直达」路由集合（APP#``var Fee=[`settings`,`messages`,`plugin-add`,`sidebar`,`bot-template`,`agent`,`vault`]`` 命中 1）。外部市场 URL：APP#``ROt=`https://x.ai/bot/marketplace```（命中 1）。

### 1.3 lazy entrypoint 注册表（75 项，页面/卡片全景）

APP 内 `/src/electron-renderer/features/...` → chunk 映射共 **75 条**（74 chunk-view + 1 chunk-layout），经 `h6=pt(m6,{...})`（Dune 运行时）注册。按 surface 归类（锚点统一为 APP#`"/src/electron-renderer/features/<路径>"`，每条 grep -cF=1）：

**顶层面板/overlay（14）**：plugins/overlay（=市场）、settings/overlay（+computer/integrations/permissions/updates/usage/vault/layout 七个子 view）、computer/overlay、bot-templates/overlay、grok-bot-slack/overlay、grok-bot-team/overlay（+manage-files/manage-plugins/manage-skills）、passkey-enrollment/overlay、tasks/workspace、team-agents/overlay、unified-billing/overlay。

**会话流卡片（58）**：chat/cards/send-message/**33 类**（text、attachment、widget、cursor-agent、secret-request、credential-request、user-form、email-draft、slack-draft、meeting-chat-draft、imessage-draft、calendar-event、visualization、permission-request、connector、connectors、listener-connect、scm-connect、onepassword-connect、notifications-enable、appearance-picker、email-offer、team-access、slack-connect、bot-template-share、auto-review-approval、meeting-join-consent、connector-grant、local-tool-permission、virtual-card-approval、cookie-origin-approval、publish-approval、app-secrets-request、mobile-tool-permission、phone-call）；chat/cards/{message,notice,mcp-app}、user-attachment、feedback 卡、voice-call 卡；event 卡 12 类（automation-changed、task-changed、channel-connected/disconnected、bot-added/removed、cloud-agent-launched、desktop-goal、dev-event、name-changed、person-added/left/removed、team-bot-publish、team-shared）；agents/cards/event 2；channels/cards/event 2。

**transcript entry 类型（eager）**：APP#``rc=[`message`,`tool-call`,`send-message`,`user-attachment`,`notice`,`event`,`feedback`,`voice-call`,`mcp-app`]``。tool-call 不走 lazy 注册表（APP#``case`tool-call`:return null`` 命中 1），由 eager 组件渲染成紧凑步骤行：图标映射 APP#``Bfn(e){switch(e.kind){case`user`:return`person-circle``` → pending=loading / failed=x-circle / 其他=wrench；行文本=summary。

**settings 节 id（68：ss 41 + cs 27）**：`ss`（41 个行级 id：account/theme/accent/language/spell-check/microphone/hardware-acceleration/network-debugger/notification-sound/model/timezone/local-execution/computers/messages*/auto-review*/security-keys/team-bot-*/passkeys/vault/usage/plan/cancel-trial/on-demand/billing/egress/update-status/update-channel/automatic-updates/update-computer/reset-computer/import-memory）+ `cs`（27 个导航 id：general/integrations/computer/permissions/usage-and-billing/updates/unified-plan/appearance/notifications/threads/system/bot/team-bots/contacts/linked-numbers/your-computer/manage-devices/computer-use/bot-computer/always-ask-rules/allow-without-asking-rules/personal-usage/usage-breakdown/grok-bot-usage/usage-resets/manage-plan/grok-bot-updates）。锚点 APP#``cs=[[`general`,`general`]`` 命中 1。

**settings overlay 左侧导航（7 节，带图标/entrypoint）**：general(settings-gear)/integrations(chat-bubbles)/computer(display)/permissions(shield)/vault(vault)/usage(chart-bars)/updates(cloud-download)，按 flag 过滤（integrations←messaging、permissions←sand_permissions_panel、vault←flag）。锚点 APP#``k$=[{id:`general`,label:x$.general`` 命中 1。

**agent info-pane 标签**：APP#``ps=[`overview`,`routines`,`media`,`computer`,`meetings`,`members`]``（命中 1）；变体 `[overview,media,members]`、`[overview,media,computer]`、`[overview,media]`（按 agent 类型裁剪）。语音通话浮层另有 settings/transcript 两态。

### 1.4 MVP 标注（BRIEF 定义的四页）

| 页面 | 0.78.1 位置 | MVP |
|---|---|---|
| bot 列表/侧栏 | eager（sand-agents-sidebar） | ✔ |
| 会话流（工具卡+审批卡） | eager 主干 + lazy 卡片 | ✔ |
| 市场页 | plugins/overlay lazy（chunk-view-kcheXZ65.js, 186KB） | ✔ |
| 设置·bot/agent 配置 | settings/overlay + info-pane + bot-configure-dialog/bot-manage-screen | ✔ |
| 未登录封面 | eager + chunk-onboarding-flow | ✔（前置） |
| 其余（computer、voice-call、unified-billing、tasks workspace、team-agents、passkey、grok-bot-team、desktop-mount 双页） | — | 非 MVP（部分属 box/computer-use 主题） |

### 1.5 未登录可达界面（截图 + 静态双重证据）

- 运行态（CDP AX 树，46 节点）：`main[Grok Bot]` 下仅窗口控制 3 按钮 + Sign in 按钮 + heading "Grok Bot" + "Your team of always-on Bots that you can give real work to" + Terms 链接。无侧栏、无菜单内容。
- 静态门控：bootstrap `se({roster,boot,readFreshAccess:()=>W.getSandAccessFresh(),report:reportAccessBlocked...})`（APP#`readFreshAccess` 命中 3）；boot gate phase `checking`（`noteBootGateLanded`）；登录文案 `"Sign In with Cursor"`（APP 命中 1）/`"Welcome to Grok Bot"`（catalog `index.eager-common-DbK3Oi_r.js#"Welcome to Grok Bot"` 命中 1）；onboarding landing 在 lazy chunk-onboarding-flow-CX7HFdkW.js（该 chunk#`yvjVU9` 命中 1，127 个文案 id 全部可解，含模板市场引导 "Meet Grok Bot"/"Set up this account"/40+ 预置 Bot 模板文案）。

## Q2 设计 token / 字体 / 图标 / CSS

### 2.1 主题与 token 机制

- **运行时注入**：`RRn(theme)`（APP#``function RRn(e,t={}){let n=document.documentElement`` 命中 1）设 `dataset.theme=cursor-light|cursor-dark`、`style.colorScheme`，并把 JS 调色板（`pa[light|dark]`，含 terminalAnsi* 16 色、red/orange/yellow/green/cyan/blue/magenta/purple/brown 8 色系 × primary/secondary/bright/hover/disabled、diff* 语义色）序列化进 `<style id="sand-cursor-theme">`。暗色 tone 常驻 `<style id="sand-dark-tone">`。
- **字重/字体切换**：`--sand-font-weight-{regular,medium,semibold}` + 镜像 `--cursor-font-weight-*`（LRn）；typeface 由 feature gate `sand_xvf_typeface` 切 XVF vs 系统 sans；`sand_chat_prose_15px` 切正文行高。
- **静态 CSS**：`index-Dh7EWA8t.css`（766,413 B，stylex 产物）含 370 个 `--sand-*` 自定义属性消费点（bg 350/text 171/border 157/icon 51/shadow 38/font 27）+ 布局常量（radius 8/10/14/16/18、menu-row-height 32、agent-item-radius 12 等，在 APP 的 ARn/jRn 模板串里）。
- **结论：色板值不能只抄 CSS**——需从 APP 的 JS 调色板对象或运行时 computed style 取值；CSS 文件本身可原样复用（类名即样式）。

### 2.2 字体（全部本地，可原样复制）

| 文件（assets/） | 大小 | 用途 |
|---|---|---|
| X-VF-C7NyO54W.woff2 | 82,620 B | 正文字体 XVF，可变 weight 200–800（css#`font-family:XVF` 命中 1） |
| XMono-VF-K4lk0ar0.woff2 | 24,704 B | 等宽 XVF Mono |
| cursor-icons-16-QUmxS7q3.woff2 | 126,980 B | 图标连字字体 |
| KaTeX_*.woff2 ×19 | 5–28KB/个 | 数学排版（markdown-math-katex css 26KB 配套） |

### 2.3 图标集

- 形式：**icon font 连字**（非 SVG sprite）。CSS#`font-family:cursor-icons`（index-Dh7EWA8t.css 命中 1）；`@anysphere/ui/icon-source-context` 提供 svgHost 覆盖点（`index.eager-platform-C2su3Zzb.js#"@anysphere/ui/icon-source-context"`）。
- 名称表：`index.eager-platform-C2su3Zzb.js#`var Kr=`0account``（命中 1）打包编码，解码后 **818 个图标名**（含 outline/filled 双 variant，`ai(e,'filled')`）；填充解码脚本见 §局限 L5（前缀长度启发式，个别名字需人工校对）。
- 常用 77 个在 APP 有 `icon:` 引用（settings-gear、search、plus、chevron-*、wrench、x-circle、loading、person-circle、sparkle、send、display、shield、vault、chart-bars、cloud-download、storefront 等）。

### 2.4 i18n

英文源 catalog 内嵌 eager bundle（common+app+platform 合并 3,880 条 id→string）；36 个 chunk-core-*/37 个 chunk-chat-*/36 个 chunk-settings-* 等约 110 个 locale chunk 为非英文翻译。复刻可先只做 en。

### 2.5 资产清单（非 JS，共 66 个文件 / 约 1.9MB）

字体 22（上表）· CSS 5（index 766KB、desktop-mount-panel 20.7KB、markdown-math-katex 26KB、desktop-mount-capture-overlay 1.2KB、fullscreen-file-viewer-body 0.6KB）· PNG 14 · SVG 11 · WebP 7 · WAV 5（通知音 open-blip/tick/double-tick/chime-a/chime-b）· JPG 2（grok-bot-wallpaper 76KB、demo-computer-wallpaper 97KB）· MP3 1（gallery-loop）· pdf.worker.min.mjs 1.0MB。品牌 logo（slack/teams/telegram/whatsapp/salesforce/…）与"灯"系列营销图（hudson-lamp 等 7 张 webp，onboarding 用）。全部路径在 `/dev/shm/grok-re/0.78.1/app/dist/renderer/assets/`，**可原样提取**（字体/图标受上游版权约束，复刻需换资产或确认许可，见局限 L6）。

## Q3 MVP 页面组件树与 0.18 差异

### 3.1 bot 列表/侧栏（sand-agents-sidebar，eager）

```
AgentsSidebar
├─ Header（"New chat" hIQkLb / "New section" SagCAA；多选态→ sand-agents-sidebar__selection-actions
│    ├─ move-selected（folder icon → New section / 既有 section）
│    └─ 其他批量动作（删除等）
├─ Search 入口（icon=search, class sand-agents-sidebar__search → command palette）
├─ Agent 列表：分区 pinned / collapsed / main（lUe），项=sand-agent-item
│    ├─ 状态角标 sand-agent-item__corner-{dot,ring,main}（running/marker）
│    ├─ 拖拽排序 + pin（0.18 sidebar-model.ts 的 partition/movePinned 语义保留）
│    └─ 项动作（重命名/删除/设置 → info-pane settings）
└─ Footer sand-agents-sidebar__footer
     ├─ 账号行 sand-agents-sidebar__account（avatar+name；viewing/editing 两态改名 sand-agents-sidebar__account-name(-input)）
     └─ AccountMenu：Sign in / Settings / Sign out（0.18 同名组件延续）
```

差异 vs 0.18（component-names.json：AccountMenu/AgentSidebarItem/AgentSidebarHeader/ComposerActions/ConversationComposer/ChatHeader）：类名与职责全部延续；0.18 header 的 "Broadcast to agents"/"Agent network" 在 0.78.1 无对应文案（grep 0），改为 section 多选管理 + Marketplace/Import Bot 入口（"Marketplace" Zt5PUS、"Import Bot" 7++OwZ、"Create a Bot" rbO+df）。

### 3.2 会话流（transcript + 卡片）

```
ConversationWorkspace（eager）
├─ ChatHeader（延续 0.18；含 "View agent settings"→info-pane、voice-call 控件）
├─ Transcript 列表（entry kinds: message/tool-call/send-message/user-attachment/notice/event/feedback/voice-call/mcp-app）
│    ├─ message（lazy chunk-view-B2FzGpIY: 链接/文件卡内嵌）
│    ├─ tool-call → eager 紧凑行（wrench/loading/x-circle + name→Title Case + summary）
│    ├─ send-message 33 型 lazy 卡（见 §1.3）——审批卡家族：
│    │    local-tool-permission（Bbgcfm9R, 28KB, class sand-local-tool-permission-outcome）
│    │    auto-review-approval（o1Du8A_z）、publish-approval（CVEMTYA4）
│    │    virtual-card-approval（Be_TJB7a, passkey）、credential-request（yi69_8ne, vault/1Pass）
│    │    secret-request（pQ-2bxLy）、cookie-origin-approval（j6BzC4-h）、app-secrets-request（CF5ipRxC）
│    ├─ event 12 型 lazy 卡（timeline events，0.18 timeline-event-registry 的延续）
│    └─ feedback / voice-call / mcp-app 卡
├─ Composer（eager + chunk-prompt-editor）：Attach / Send / Voice chat / widget 选项卡
└─ info-pane（右侧，--sand-info-pane-width 可拖拽）：tabs overview|routines|media|computer|meetings|members
```

占位高度表 `xXt`（send-message 33 型 + event 12 型 → placeholderHeight）用于虚拟滚动。diff vs 0.18：0.18 只有 transcript-card/permission-request/notice + tool-results 五类，0.78.1 全部卡片 lazy 化并经 Dune `transcriptCardsByProtocolKey` 按 `kind:type` 寻址；tool-call 从 0.18 的 tool-results view 改为轻量步骤行 + 详细结果折叠进 message/visualization。

### 3.3 市场页（plugins/overlay → chunk-view-kcheXZ65.js，186KB）

```
Marketplace
├─ 顶部：Back（iH8pgl）/ 标题 Marketplace（Zt5PUS）/ 搜索（"Search plugins"/"Search across apps and skills"）
├─ tabs：plugins | bots（路由参数 tab∈bee=[plugins,bots]）
├─ plugins 侧：分类（Categories/NUrY9o、jj4zKl "Plugin categories"、More categories）、安装态（Installed/QHcLEN、Sync/Nu4DdT）、
│    自定义插件（"Add custom plugin" Q+gixK、MCP server 配置）、GitHub 同步（NRJNSR）
├─ bots 侧：Bot 模板（"From template"/"From this Bot's template"/"Loading Bots…"）、Import Bot、分享/发布
│    （Publish/Unpublish/Publishing…/Published、"Publish to" VmT3pr、"Copy link to this Bot" ZjAU9n、团队市场下架文案 ×3 变体）
├─ 技能（Skills PCSkw2 / Skill OZJeTZ / "Private skill" V1Vjra / "Skill publishing" rYZrJD / Delete Skill）
├─ 连接器 per-app 卡（Read Texts/Send Texts/Read and reply to texts/Messages/Routines/Memories/Notes/Mail/Calendar/
│    Contacts/"Show Contact Names"/"Grok Bot can text these people without asking first"…+ 权限态 Always allowed/Managed by Cursor）
└─ 空态/错误（"Couldn't load the marketplace" GqVWTG、ZyWE2h "Nothing installed yet…"）
```

实验 flag 串（class 常量）证实迭代中：`grok_bot_marketplace_instant_add_remove`、`grok_bot_marketplace_back_resets_connect`、`grok_bot_plugin_add_opens_sign_in`（chunk#"grok_bot_marketplace_back_resets_connect" 命中 1）。diff vs 0.18：0.18 plugins overlay 只是插件列表；0.78.1 并入 bot 模板市场 + 技能管理 + 团队发布流。

### 3.4 设置·bot/agent 配置

- **settings/overlay**（7 节 §1.3）：general（账号/主题/语言/拼写/麦克风/硬件加速/网络调试/通知音/模型/时区）、integrations（contacts/linked-numbers/团队连接器偏好/Slack·Teams 链接）、computer（local-execution/computers/messages 发送策略/egress/update-computer/reset-computer）、permissions（auto-review 规则/always-ask/allow-without-asking）、vault、usage（plan/billing/on-demand/usage-breakdown）、updates（channel/automatic）。
- **agent（个人 bot）配置**=info-pane settings 视图（overview|settings 切换，APP#``if(e===`overview`||e===`settings`)return e`` 命中 1）+ avatar-editor（chunk-agent-avatar-editor-CDfEUvTS.js，0.18 agent-info/avatar-editor 延续）+ channels（Slack/Teams/iMessage/email 连接，0.18 agent-info/channels → 0.78.1 integrations+channels 卡）。
- **团队 bot 管理**=chunk-bot-manage-screen-DrDJNBmv.js（General/Knowledge/Channels/Analytics/Status/Collaborators/Service accounts，用 grok-bot-wallpaper 做空态底图）+ chunk-bot-configure-dialog-DoyeGyea.js（Configure sections：Analytics/Usage/Hours saved/Learnings 审批(Approve/Reject)/Skills/Vault/Tools/Add to Slack）+ team-agents overlay（CANKD5iS）。
- diff vs 0.18（agent-info/{async-tasks,avatar-editor,channels,group-members,settings,shared-room}）：avatar-editor 保留为 chunk；async-tasks→tasks/workspace 独立 overlay；group-members/shared-room→team-agents+meetings；settings 面板并入 info-pane。

## 与 0.18 recovered 对照（同/改/新/删）

| 0.18 features/* | 判定 | 0.78.1 去处（证据） |
|---|---|---|
| roster、window-chrome、error-boundary、deep-links、access、account、update、feedback、root-resilience、onboarding | **同**（骨架延续） | sidebar 类名族；AX 窗口按钮；ErrorBoundary(app)；hs 路由表扩充；sand-access-blocked；account-switched；update-status/channel；feedback 卡+improve dialog；connection-state；onboarding-flow landing |
| plugins、settings、computer、conversation、agent-info、permissions、automations | **改** | plugins→市场（tabs+技能+发布）；settings→7 节 overlay+68 id；computer→overlay+settings/computer+desktop-mount 新双页；conversation→卡片 lazy/Dune；agent-info→info-pane+tasks 拆分；permissions→local-tool-permission 卡族+settings/permissions；automations→routines（info-pane tab+automation-changed 卡） |
| （无） | **新** | tasks/workspace、unified-billing/overlay、vault（settings+卡+dialog）、passkey-enrollment、grok-bot-team（+3 manage overlay）、grok-bot-slack、bot-templates 市场、team-agents、voice-call（卡+浮层）、meetings、mcp-app 卡、visualization（d3/three）、33 型 send-message 卡、命令 palette link/message provider 扩充 |
| hidden-chats、org-chart、terminal/output、runtime-theme-token-installer(名)、Broadcast 入口 | **删** | APP/全部 chunk grep hidden-chats/org-chart/orgChart=0；无 terminal output chunk；token installer 改为 RRn 运行时注入（机制在，旧名不在）；Broadcast 仅剩失败遥测文案 |

lazy 边界数量：0.18 = 5（computer/hidden-chats/org-chart/plugins/settings）→ 0.78.1 = 75。

## W0.5 归属补全（ui-shell 主题）

W0.5 owners.tsv 65 行 ui-shell 已核对；本报告新增发现按 RE-w05 §4 规则提出**改判建议**（只列证据，不改脚本）：

| owners.tsv 现归属 | 建议改判 | 依据 |
|---|---|---|
| chunk-view 族（W05-2-274，74 文件）→ ipc-rpc 兜底 | **ui-shell** | 全部是 features/*/cards|overlay 的 lazy view（§1.3 注册表逐条对应） |
| chunk-onboarding-flow（W05-2-167）→ ipc-rpc 兜底 | **ui-shell** | 未登录封面/onboarding landing（§1.5） |
| chunk-settings 族（W05-2-210，36 文件）→ ipc-rpc 兜底 | **ui-shell** | settings overlay 的 36 个非英 locale chunk（§2.4） |
| proto:GrokBotService.ReadGrokBotGroupChatCanvas（W05-4-338）等 3 条 proto 行 | 维持 ui-shell | canvas/multiplayer 群聊画布与 avatar 链接直接服务会话流 UI |

其余 62 行（Button/CodeBlock/ComboboxItemIndicator/CompositeRoot/DefaultCode/SegmentedControl/ToggleIconButton 等 UI 原语族、markdown/math/markdown-math-katex、prompt-editor、transcript-markdown、file-markdown*、get-file-icon、emoji-messages.* locale、emojibase、card/vault/template/team-bot dialog 族、avatar-source preload）归属正确，本报告补充语义：Button/ToggleIconButton/SegmentedControl/CompositeRoot = @anysphere/ui kit 原语（platform bundle `@anysphere/ui/icon-source-context` 一证）；vault-card-*/template-editor-dialog = 3.4 的 vault/技能编辑配套。

说明（查单项归属的路径）：renderer chunk 类新项在 RE 报告中多为**组级归属行**（如 RE-ipc-rpc §6 兜底 178 行的分组改判），无逐项字面行；要查单个 chunk/依赖 id 的具体归属，走 `/dev/shm/grok-re/w05/owners.tsv`（W05-<轴>-<序号> id → 归属报告，RE-w05 §5 自验收差集=0），chunk 组级改判的裁决依据另见 ARCH-0.78 裁决 2。

## 局限与未验证项

- **L1 运行事故（必须报告）**：首次启动尝试 `--user-data-dir=/tmp/grok-p1-profile` 被主进程覆盖，实际写入了用户真实目录 `~/.config/Grok Bot`（SingletonLock 指向该实例；运行约 6.5 分钟，期间只读了 CDP AX 树，未登录、未点击 UI，之后 kill）。改用 `HOME=/tmp/grok-p1-home` 环境隔离后完全干净（SingletonLock 落在 /tmp/grok-p1-home）。结论：**该应用会忽略 --user-data-dir 强制固定路径**，任何人做隔离实验都必须用 HOME/XDG_CONFIG_HOME 覆盖。真实目录可能留下了少量 Cache/锁残留（未清理，避免误删用户数据）。
- **L2 过程失误**：一次 `pkill -f "grok-p1-home"` 匹配到自身 shell 导致 exit 144（已知坑重犯），未影响目标产物；已改按 PID kill。
- **L3** 未登录截图仅 1 张（01-boot.png）：登录墙后所有界面（侧栏/会话/市场/设置）**未做运行态截图**——不登录到不了，登录被禁止。组件树结论全部来自静态 bundle 解析，未经运行态 DOM 逐一核验。
- **L4** 图标名表解码为前缀长度启发式（`Kr` 打包串 818 token），抽样 30 个人工核对正确，个别长名可能有 1–2 字符误差；如需精确表可写穷举校验器。
- **L5** i18n 合并 catalog 3,880 条，市场 chunk 177 id 中 140 条已解（其余 37 条在未加载的 lazy catalog 或运行时拼接）。
- **L6** 字体/图标/品牌 logo 为 x.ai/Cursor  copyrighted 资产：私用研究可复用（项目硬约束），对外分发必须替换。
- **L7** 调色板具体色值（JS 对象 minified）未逐色提取成表；复刻时可运行时 dump `getComputedStyle` 或解 APP 的 `pa` 对象，本报告只给出结构与机制。
- **L8** 0.18 对照基于 repos/grok-bot-0.18-reconstructed 的 recovered/manifests（只读），其 lazyBoundaries=5/features 清单口径与 RE-w05 §6 一致；未重新解 0.18 asar 复核。
- **L9** desktop-mount 双页、computer overlay、voice-call、unified-billing 属其他主题（box/computer-use/cloud-deps），此处只登记入口不展开。

## 产物

- 本报告：`/home/lingxufeng/bot/work/p1-re/RE-ui-shell.md`
- 截图：`/home/lingxufeng/bot/work/p1-re/evidence/01-boot.png`（未登录封面，CDP Page.captureScreenshot）
- 临时脚本：`/tmp/grok-shot/shot.mjs`（CDP 截图/AX dump，Node 22 原生 WebSocket）；隔离 HOME：`/tmp/grok-p1-home`（可删）
