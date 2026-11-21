# RE-SETTINGS：Grok Bot 0.78.1 设置面全量规格（重点：Router/API key 调查）

日期：2026-11-11。方法：静态分析 0.78.1 deb 解包产物（`/dev/shm/pbots-re/gb0781/extracted/dist/`，只读未执行；deb = `~/Downloads/grok-bot_0.78.1_amd64.deb`，dpkg-deb -x + `npx -y @electron/asar extract`）。0.79.3 既有结论（`RE-FULL-0.79.3.md` §7）直接引用并标注。

锚点缩写：
- **APP** = `renderer/assets/index.eager-app-iGTgHP_Q.js`（主 bundle）
- **COMMON** = `renderer/assets/index.eager-common-DbK3Oi_r.js`（含英文 i18n 表）
- **GPANE** = `renderer/assets/chunk-general-pane-YXy_8X5a.js`（General pane，105KB）
- **TXTPANE** = `renderer/assets/chunk-view-BLt3J-sA.js`（手机绑定 pane）
- **VIEW** = `renderer/assets/chunk-view-kcheXZ65.js`（Connect apps 页，185KB，见 RE-CONNECTORS）
- **MAINE** = `electron-main/main-app.cjs`
- **DAEMON** = `local-exec-daemon/main.cjs`
- **COORD** = `node-agent-coordinator/main.cjs`

---

## 0. 结论先行（对「Router/API key 段」问题的直接回答）

**Grok Bot 0.78.1（与 0.79.3 同）没有 Router 设置段，没有任何 LLM provider 路由 / API key 输入界面。** 设置导航只有七区：General / Integrations / Computer / Permissions / Vault / Usage and billing / Updates。全产物（renderer 694 assets + electron-main + coordinator + daemon）检索无 OpenRouter、无 `anthropic-api-key`/`api.openai` 类 key、无 provider 列表 UI、i18n 表无 "Router"/"API key" 设置文案（唯一的 "API keys" 字样是记忆系统 prompt 里「never save passwords, API keys, card numbers」的禁令，APP 搜 `API keys, card numbers`）。

「最接近 Router/API key」的四个真实机制（复刻时按需对应）：
1. **General 区 Model 行**——单一默认模型选择（§2.3），非多 provider 路由。
2. **MCP/连接器安装表单的 secret 字段**——这是 Grok Bot 里真正的「API key 输入框」：插件安装时的 variableFields 表单，`isSecret===!0` 的字段渲染为 `<input type="password">` 掩码（见 RE-CONNECTORS §5.4）。
3. **agent 工具 `DiscoverAiTool`**——bot 只读扫描本机已有的 Claude Code / Codex 配置（§3），不做路由。
4. **MCP server 配置内 per-server modelPreferences**（OpenAI 兼容的 temperature/maxTokens 等，MAINE 搜 `modelPreferences:p7n.optional()`）——写在 addMcpServer 的 configJson 里，不在设置 UI。

我们 P5-52 把 Router 段剥掉是对原版的忠实还原，不需要补。

---

## 1. 设置导航七区（0.78.1 逐字）

导航数组 `k$`（APP @2,719,093，搜索串 `k$=[{id:` + 反引号 `general`）：

| # | id | label i18n id | anchor | icon | 备注 |
|---|---|---|---|---|---|
| 1 | `general` | x$.general | `general` | `settings-gear` | |
| 2 | `integrations` | x$.integrations | `integrations` | `chat-bubbles` | **0.79.3 改名 Texting**（RE-FULL-0.79.3 §7） |
| 3 | `computer` | x$.computer | `computer` | `display` | |
| 4 | `permissions` | x$.permissions | `permissions` | `shield` | flag `sand_permissions_panel` 门控（`f1t=Lt({availability:...gates.has(d1t)...})`） |
| 5 | `vault` | b$.vault.label | `vault` | `vault` | |
| 6 | `usage` | x$['usage-and-billing'] | `usage-and-billing` | `chart-bars` | |
| 7 | `updates` | x$.updates | `updates` | `cloud-download` | |

分区可用性容器 `O$={general, integrations, computer, permissions, vault, usage, updates}`（APP @~2,719,000）。**没有第八区。**

### 1.1 flag 重路由

`A$(key,{isPermissionsPanelOn,isMessagingOn})`（APP，搜索串 `y1t=new Set([`）：
- permissions flag 开 → 键 `auto-review / auto-review-rules / team-bot-connector-shared-space-allowlist / permissions / always-ask-rules / allow-without-asking-rules` 从 general/computer 挪进 **permissions** 区；
- messaging flag 开 → 键 `integrations / contacts / linked-numbers` 归 **integrations** 区。

---

## 2. settings key → 区 完整映射（0.78.1，43 键）

搜索映射（`ss` 数组）+ 区内搜索词（`os` 对象，APP @163,959，搜索串 ``var os={general:[`account`,``）：

- **general**：account、theme、accent、language、spell-check、microphone、hardware-acceleration、hardware-acceleration-restart、network-debugger、notification-sound-enabled、notification-sound、**model**、timezone、auto-review、auto-review-rules、security-keys、passkeys、team-bot-connector-preferences、team-bot-connector-shared-space-allowlist、team-bot-link-previews、team-bot-slack-link、team-bot-microsoft-teams-link、import-memory
- **integrations**（区内搜索词）：integrations、phone、text、texting、imessage、sms、contacts、linked-numbers
- **computer**：local-execution、computers、messages、messages-send、messages-send-without-asking、messages-allowed-recipients、egress、update-computer、reset-computer
- **vault**：vault、password、passwords、logins
- **usage**：usage、billing、spend、limit、on-demand、plan、quota、cancel-trial
- **updates**：update-status、update-channel、automatic-updates（区内搜索词：updates、update、beta、release、track）

与 0.79.3 的差异：仅段名 Integrations→Texting；键集合基本一致（0.79.3 增 messages 相关细节键）。

## 2.x 43 键中无任何 `router` / `api-key` / `model-provider` 类键（全列表如上，这是穷举证据）。

---

## 3. 与「外部 AI 工具 / API key」相关的全部实底

### 3.1 General 区 Model 行

- rowMeta（APP，搜索串 ``model:{label:{id:`scu3wk`},description:{id:`2RPCms`}}``）：label **"Model"**，description 逐字 **"Choose which AI model Grok Bot thinks with"**（`"scu3wk":["Model"]`、`"2RPCms":[...]`，APP @110,745）。
- renderer 无硬编码模型清单（`grok-4`/`grok-3` 字符串在 renderer 0 命中）；模型列表来自服务端。主进程 experiment fallback 里出现 `grok-4.5`/`grok-4.6`（MAINE 搜 `effort_first_compact_model_ids`），以及实验 `promote_first_party_variant`（control/grok_primary/pinned_selection/grouped_auto_expand）——模型选择 UX 受服务端实验控制。
- 行控件形态（下拉/单选）未逐行验证（局限 §L2）。

### 3.2 agent 工具 DiscoverAiTool（发现本机 Claude Code / Codex）

- 工具注册表（COORD `DiscoverAiTool` @608,392）与 proto `GrokBotUserComputerDiscoverAiTool|1 source 9|2 approval_id 9?|3 authorized_by_standing 8|4 authorized_by_approval 8`（electron-main/proto.cjs）。
- daemon 侧实现（DAEMON，搜 `var Rqt={claude_code:"Claude Code",codex:"Codex"}`）：
  - `NFe(source,{homeDir,configDirs})`：`claude_code` → root `~/.claude` + globalConfigPath `~/.claude.json`（可被 `configDirs.claudeConfigDir` 覆盖）；`codex` → `~/.codex`（`configDirs.codexHome` 覆盖）。
  - 返回 `{source, found, sessionCount, items:[{kind:'session'|'mcp_server'|'skill'|'plugin', title(≤160), excerpt, occurredAtMs}]}`（≤40 条）。
  - **只读**；输出经密钥 redact（正则集 `Pqt`：sk-/pk-/rk- 前缀、ghp_/github_pat、xox*、AKIA、AIza、Bearer、JWT、32+ hex 等）。
  - 权限描述 `{action:"read-ai-tool-setup", target:"Claude Code"|"Codex"}`，进入 local tool permission 审批（action 列表 `HBt` 含 `read-ai-tool-setup`）。
  - renderer 侧无 UI 消费（`discover-ai-tool`/`claude_code` 在 renderer 0 命中）——由 bot 在对话中调用，结果以工具卡呈现。
- 这不是路由：不能选 provider，不能填 key。

### 3.3 记忆系统禁令（唯一 "API keys" 文案）

APP 搜 `API keys, card numbers`：「…never save passwords, API keys, card numbers, or other secrets」——记忆写入 prompt 的安全规则，与设置无关。

---

## 4. General pane 全量行清单（0.78.1，GPANE 163 条 i18n 反查）

General pane = `chunk-general-pane-YXy_8X5a.js`（105KB）。按文案聚类（全部逐字）：

**(a) Cursor 账号卡（区首）**
- 未登录："Not signed in" / "Connect your Cursor account to Grok Bot"（按钮）/ "Sign In with Cursor"。
- 登录中："Signing in" / "Finish signing in from your browser"（系统浏览器登录 + 轮询，与连接器 OAuth 同机制）。
- 已登录："Signed in to Cursor"、"Cursor account"、displayName/email、Change profile photo（"Choose a PNG, JPEG, or WebP image"、"Choose an image smaller than 2 MB"）、Sign Out、Remove saved account、Add account、Copy email address、Copy team ID、Team。
- 统一计划迁移："Move to the new unified plans" / "The new unified plans bring Cursor, Grok, and Grok Bot together on one plan…" / "Your accounts are being merged" 等。

**(b) 外观/系统**：Theme（Light / Dark / "Follow System" / "System Default"）、Language（Search language）、Timezone（"Auto-detect" / Search timezone）、Spell check（0.79.3 键）、Microphone、Hardware acceleration（"Use hardware acceleration" + "Hardware acceleration changes take effect after Grok Bot restarts" + Restart Now）、Notification Sound（"Play Sound for Notifications"）、Network Debugger（"Check Grok Bot's connection"——原版唯一「测试连接」入口）、Bot color、Open Threads Beside the Main Chat。

**(c) Auto-review（自定义权限规则）**："Grok Bot checks each action before it runs and asks you first when needed. Add rules to customize what it can do automatically."；Add Rule / Custom Rules；"Write one short, natural-language rule for each action. \"Ask first\" takes priority if rules conflict."；Behavior：Ask first / "Allow automatically" / Allow all；规则上限 `SAND_AUTO_REVIEW_INSTRUCTION_MAX_ENTRIES`；"Required by your admin. You can't edit or delete this rule." / "Team rules always apply. Your rules apply only to you. Built-in safety checks always apply."

**(d) Security Key / Passkeys**："Security Key"、"Use hardware security keys"（"Allow Grok Bot to use a security key (such as a YubiKey)…"）、Passkeys（"No passkeys yet. Add one to approve purchases from this computer."、"Grok Bot asks for one of these before it approves a purchase"）。平台限制文案 "…aren't supported on this platform yet"。

**(e) Slack / Microsoft Teams 账号 link**："Link your Slack account to Cursor so Team Bots and Cloud Agents know who you are in Slack"、Unlink Slack（"Team Bots and Cloud Agents you launch from Slack stop until you link Slack again"）；"Link your Microsoft Teams account to Cursor…"、"Microsoft organization ID"、"Organization tenant ID"、"Link another organization"、"Guest organization"、Unlink Microsoft Teams。

**(f) Team Bot connector preferences（连接器治理，general 区）**："Search connectors"、"No connectors yet"、"Add connector"、"Add all connectors" / "Allow all connectors?"（"Team Bots can then use all your connectors for you in shared channels and group chats without asking, even when someone else asks them to"）/ "Clear connector preferences?"（"Remove any preferences you have set with Team Bots which give them access to your personal connectors"）/ "Removed connector"、"Grok Bot can no longer use {0}"。另有插件免批注记 "Bots will never ask for permission to use these plugins, even in shared channels"（team-bot-connector-shared-space-allowlist 键）。

**(g) Import memory**："Copy this prompt into a chat with your other AI assistant" / "Paste the results below to add them to Grok Bot's memory" / "Add these memories from my other AI assistant" / "Create a Bot to import memory" / "That's too long. Paste a shorter export."

**(h) Link previews**（team-bot-link-previews 键）："Show each Team Bot's name, description, color and shape wherever its link is posted"。

## 5. Integrations（Texting）pane（0.78.1）

TXTPANE（46KB）i18n 反查：
- "Link your phone" / "Link your phone to get your Bot's number"；link code 流：`issueGrokBotMessagingLinkCode` → 显示 "Scan the QR code with your phone's camera and send the code to the Bot as a message or send code manually"（QR "that starts a text to {lineNumber}"）、"Click to copy the code"。
- "Linked {linked}"、Unlink 确认 "Unlink this phone?"、"Add to contacts"、"Copy number"/"Copy email"、"Notify Me"。
- SMS 回退提示逐字："Your text arrived as SMS. Turn on iMessage, or RCS chats in Google Messages, and send it again."
- 渠道提及：Messages、WhatsApp、Telegram、Email（后三者标 "Not available yet"）。
- 错误态："Grok Bot doesn't have a number for you yet. Try again later." / "Couldn't get a link code. Try again."

RPC（MAINE/APP 搜 `GrokBotMessaging`）：getGrokBotMessagingLinkStatus / issueGrokBotMessagingLinkCode / listGrokBotMessagingLinkedPhones / unlinkGrokBotMessagingPhone…（0.79.3 同族，RE-FULL §8 手机短信行）。

## 6. Computer / Permissions / Vault / Usage / Updates（概要，0.79.3 详表可沿用）

- computer（11 键）：local-execution、computers、messages 四键（Messages 连接器开关，见 RE-CONNECTORS §4.3）、egress、update-computer、reset-computer。
- permissions：flag 门控，吸收 general/computer 的规则键（§1.1）。
- vault：flag `grok_bot_vault`；logins/cards/contacts（RE-FULL §8 Vault 行）。
- usage：usage/plan/cancel-trial/on-demand/billing + 子面（0.79.3 §7 详）。
- updates：update-status / update-channel / automatic-updates（track 可选、quitAndInstall、pending restart，RE-FULL §6 自动更新行）。

---

## 复刻优先级建议（Settings）

必需（复刻完整 Grok Bot 的最小集）：
1. 七区导航骨架 + flag 重路由（§1）——我们现在只有 General，缺的先是 Updates（成本低：三键已有 RPC 面）和 Integrations（手机绑定）。
2. General 区行序与文案（§4a/b：Cursor 账号卡三态、主题/语言/时区/通知/硬件加速/Network Debugger）。
3. Auto-review 自定义规则（§4c）——我们是权限系统的直接竞品特性，规格已逐字。

后置：
- Vault / Usage（依赖服务端账号面）、Permissions 独立区（可先留在 General）、团队治理键（§4e/f）。
- **Router/API key：原版没有，不立项。** 若要「外部 AI CLI 发现」等价物，按 §3.2 DiscoverAiTool 做（bot 工具 + 审批 + redact），不属于 Settings。

## 局限与未验证项

1. 全部静态结论，未运行产物；「用户看到什么」由代码路径推出。
2. Model 行的具体控件（下拉/分段）与可选值未定位（renderer 无硬编码清单，值来自服务端，静态不可见）。
3. i18n 反查用英语言表（COMMON+APP 内嵌），个别 id 只在非英文 locale 命中时以语义对应标注（本文已尽量避免）。
4. General pane 163 条文案是聚类归纳，行序（视觉顺序）未从组件树逐行还原。
5. 服务端 settings 存储（哪些键走 server、哪些走 clientPersistence）未逐键区分。
