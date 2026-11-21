# 功能普查补齐审计与 dsh 生态对照

> 侦察员 E；检索日期：2026-11-09。只调研，未改产品代码、安装插件、启动外部项目或操作真实桌面。本文是对 scout A/B/C/D 的补充审计，不是上线验收，也不是依赖准入报告。
>
> **回答「muse、dots、grok bots、claude code 的所有功能都统计出来了吗」：没有。** 四份报告覆盖了编排、持久化、插件和体验的重要部分，但不能叫全功能普查；Muse 的 dsh 社区身份、电脑/浏览器使用的具体呈现、语音、头像、产物页面和连接器细节有实质遗漏。本次补齐公开证据，不宣称封闭产品所有隐藏功能已穷尽。

## 一、缺口补齐清单

### 1.1 审计口径与原报告合并清单

证据分级：**官**＝产品官方文档；**仓**＝维护方 README/源码自述，未实测；**媒**＝媒体报道；**本地**＝本仓配置/既有研究；**未知**＝没有足够证据。搜索摘要、topic、stars、`updated_at` 不算功能已经实现的证据。相同文档的几条事实不是几次独立验证。

审计输入：同目录 `scout-a-claudecode.md`、`scout-b-grok-dots.md`、`scout-c-orchestration.md`、`scout-d-experience.md`，另读 `SUMMARY.md`。A 是 5 面向和 42 项 Hivebot checklist，B 是竞品/架构比较，C 是编排可靠性，D 是体验证据；四者从未形成逐产品、逐平台、逐版本的完备功能登记表。SUMMARY 仍只汇总 A/B/C，应视为旧快照。

| 已知功能域（合并去重） | 已覆盖的具体功能面 | 原报告 | 仍须补的边界 |
|---|---|---|---|
| 身份与 bot 生命周期 | 主 bot/协调者、独立 bot、创建与稳定身份、角色模板、独立历史 | A/B/D | 头像生成/上传、模板分享、复制是否带记忆、删除后共享文件残留 |
| 会话与工作区 | 多会话、切换、搜索、resume/fork、目录/工作树隔离、桌面入口 | A/C/D | 搜索范围、文件回退限制、设备/平台可用性 |
| 跨会话通信 | 稳定寻址、bot→bot、群聊、mailbox、回执、消息来源、ACL | A/B/C | Room 与 dashboard/LiveShare 的区分、群聊中卡片和权限限制 |
| 委派与团队 | subagent、fork/spawn、teams、任务板、工作流、独立上下文 | A/B/C | 临时 worker 与长期 teammate 不同；实验开关、团队恢复限制 |
| 运行中交互 | 忙闲、blocked/error、不中断追问、steer/stop、完成通知 | A/C/D | stop 不是撤销；已发出的外部动作不能靠回退取消 |
| 可恢复性 | 本地记录、重启恢复、断线、queued/steered 输入、结果归属 | A/B/C | 历史恢复≠活进程恢复≠外部副作用 exactly-once |
| 扩展与安装 | skills、plugins、市场、MCP、自装、更新、版本锁定 | A/B/C | 安装后是否激活/认证，哪个 profile，构建脚本审批与回滚 |
| 定时与主动性 | routines、提醒、后台目标、事件触发、云端常驻 | B/D | 时区、失败/限流、邮件/webhook、示教生成 skill 的完整链 |
| 文件与开发 | 文件读写、终端、git/PR、SSH、coding agent、产物引用 | A/B/C | Office/媒体、Pages/Library、产物更新/共享/评论 |
| 电脑与浏览器 | 云电脑、应用连接、审批、少量 preview/动画问题 | B/D | 本机 CU、DOM 浏览器与截图桌面差异、接管/隔离/回传 |
| 记忆与个性化 | 持久人格、学习 skill、用户偏好、跨会话经验 | B/C/D | 自动召回、inspect/forget、跨 bot 共享范围；Muse 世界书/角色卡 |
| 多账号与渠道 | app/connector、多账号、Slack/手机、低配置上手 | B/D | 具体服务、账号上限/重授权、OAuth 与 secret 输入 |
| 安全与透明度 | 审批、沙箱、凭证隔离、成本、权限洗白、防无限协作 | A/C/D | app/site 粒度、群聊禁止卡片、共享电脑实际安全边界 |
| 陪伴与内容生态 | 少量替代产品、模板、桌面体验线索 | B/D | MuseAI 本体/插件、桌宠、语音伴侣、社区目录/分享 |

**不能从旧报告推当前施工状态。** 本轮上下文已有 T36 主 bot subagent 进入 Workers 的提交；不能再照抄旧 SUMMARY 的「T34 开闸中」或「尚未有 Workers」。下文对 Hivebot 用「配置中发现」「未发现明确挂载证据」「待功能实测」，不以旧报告替代当前验收。

### 1.2 Muse：先消歧，再补功能

已找到与 dsh 有明确联系的候选，**不是先把 Muse 当 Meta 产品**：

1. **[仓] [yejiming/MuseAI](https://github.com/yejiming/MuseAI)**：角色/伴侣、创作与冒险产品；本次 GitHub 快照 692★。README 描述世界书、角色卡、长记忆、陪伴、冒险、穿书，以及写作文件、备份、参考库、大纲生成/评价/逆向提取、长小说并行分析和去 AI 味另存。可局域网手机访问，宿主需在线。它不是工作 bot 群聊产品。
2. **[仓] [yejiming/dsh-museai-tavern](https://github.com/yejiming/dsh-museai-tavern/tree/caec6f9fc6e608e3c80befed1e81cfa15c9f910a)**：明确叫 MuseAI 的 DSH 插件，npm 名 `@yejiming/dsh-museai-tavern`；28★、MIT；最低 dsh `>=0.2.0-rc.1`（README 自述，不代表已验证兼容本仓 rc.1）。挂 `conversation.view`，背景/聊天/冒险/羁绊/设置五页；JSON/MuseAI/SillyTavern 导入导出、文风预设、记忆浓缩、Markdown/Thinking 流式聊天、停止/历史、关系时间线；复用 dsh provider/model。数据在 `$DSH_HOME/storages/museai.json`，localStorage 仅离线镜像。
3. **[仓] 本体与插件不是同一功能集。** 插件 README 明说不含主 MuseAI 的 AI 自动世界书/角色卡提取。多角色 GM 冒险不等于多个工作 agent 的持久 mailbox/Room；上述两个 README 也未确证产品内社区市场、真实多人房间、桌面悬浮宠物或语音通话。
4. **[未知] 同名产品仍应分栏。** [Stella-Mira/muse_vtuber](https://github.com/Stella-Mira/muse_vtuber) 的仓库描述涉及 Live2D/音视频事件流，[panzeyu2013/dsh-muse](https://github.com/panzeyu2013/dsh-muse) 也是检索命中；本轮未深读，不能并入 MuseAI。Meta Muse 的搜索命中未取得可核官方正文，不纳入已确认清单。用户说的 Muse **很可能存在上述 dsh 关联候选，但尚不能替用户确认指代**。

**补入普查**：世界书/角色卡、角色内容导入导出、关系时间线、长记忆浓缩、GM/多角色冒险、写作/参考库/大纲。工作产品是否需要这些，由用户取舍；不把小说/陪伴整套搬进 Hivebot。

### 1.3 Grok Bot：从「有 bots」补到可见的产品契约

以下均来自当前滚动官方文档，不等于本机 0.18/0.78.1 产物的相同版本。不要与普通 Grok 聊天、第三方同名 bot 混淆。

| 缺口组 | 新增官方实据（每组 2–5 条） | 证据链接 |
|---|---|---|
| bot 身份、头像、记忆与社区 | ①命名/形象；头像可 Bot/Generate/Upload（<25MB、裁剪）。②pin/section/hide，隐藏不停止 routine。③复制不带历史/记忆/附件；删 bot 不清共享电脑残留。④同 bot 跨 chat 记忆，部分事实跨本人 bots；通过聊天 inspect/correct/forget。⑤模板分享/社区 gallery；模板副本不带凭证/设备权；同一 team bot 共享不是复制 | [Bots](https://docs.x.ai/grok-bot/bots)、[总览](https://docs.x.ai/grok-bot) |
| 语音与聊天协作 | ①一对一 voice call，desktop/mobile，转写、mute/hangup、语速/voice/language。②一次一通，不支持群组通话。③voice memo 与仅输入转写的 dictation 不同。④@bot/@everyone、threads/reactions、跨消息/文件/链接/routine/settings 搜索。⑤群聊不呈现审批/secret/login/邮件-Slack draft 卡，bot→group handoff 为纯文本 | [Chat and collaboration](https://docs.x.ai/grok-bot/chat-and-collaboration)、[Bots](https://docs.x.ai/grok-bot/bots) |
| 电脑、浏览器与连接器 | ①账号持有持久云电脑，所有本人 bots 共享文件/browser cookies/CLI credentials，但各 bot 独立 screen；screen 不是安全边界。②右侧 preview 看导航/输入/click/status；关闭预览/客户端不停止云任务。③CAPTCHA/SSO/passkey/二维码等需用户接管。④本机 Mac/Windows 与云分离，本机命令 Ask/Always/Never 独立。⑤OAuth token 由 backend 保管，不给 bot；secure form/vault 而非聊天明文密码/OTP | [Computer and apps](https://docs.x.ai/grok-bot/computer-and-apps)、[安全入口](https://docs.x.ai/grok-bot/approvals-security-and-privacy)（后者为索引入口；细节依据前页） |
| skills、定时、事件与示教 | ①skill 含 inputs/validation/output/approval，个人跨 bots，team 可 publish/sync。②routine 归一个 bot、云端执行；每 bot 50、至少 5 分钟、20 条历史；时区/next run/test/pause/edit/delete。③Slack/GitHub/Linear/Sentry/PagerDuty/Bot email/webhook 触发，trigger connection 不等于 app connection。④Teach a task 在一对一 computer view 录浏览器示范≤10分钟，不录麦克风，产出 draft skill 待审阅测试。⑤webhook 200 只表示 accepted/start；限流失败不自动 retry | [Skills, routines and automations](https://docs.x.ai/grok-bot/skills-routines-and-automations)、[Computer and apps](https://docs.x.ai/grok-bot/computer-and-apps) |
| 文件、Pages 与 Library | ①附件拖拽/粘贴/预览/保存/来源/修订，Office/PDF/代码/媒体。②图像/视频与 Library。③Pages 可为 report/dashboard/tracker/filter，旁栏展示、原 URL 更新、默认 private、对人/team/public 分享。④只有 bot 改页面内容，viewer 控件变化不保存。⑤Cloud Agent 交付附件/PR/open Cursor；`/workspace` 跨 bots 文件交付 | [Files and results](https://docs.x.ai/grok-bot/files-and-results)、[Chat and collaboration](https://docs.x.ai/grok-bot/chat-and-collaboration) |

**连接器应按服务登记，不能写一个「有 MCP」就算全覆盖。** 官方 computer/apps 页点名 Calendar、Sheets、Drive、Docs、Slides、Gmail、Outlook、Slack、Notion、Linear、X、SharePoint、Zoom、1Password、Agent Email、Link/X Money 及 custom MCP。当前 Gmail 文档说同一时间一个 mailbox，切换需断开重授权；旧体验里的「四个 Gmail」不可无解释泛化。Slack 额外 workspace 单独连接；Notion 有第二账号例；1Password 是渐进开放、每次 login 批准且有限制；Bot email 每账户永久一个地址，incoming 需 routine，非用户当下要求的发送保留 draft。**不是所有集成都已给所有账号开放。**

### 1.4 Claude Code：不能只查 CLI 编排，也不能拿 Claude 聊天网页替代

以 [官方 overview](https://code.claude.com/docs/en/overview) 和 [官方文档目录](https://code.claude.com/docs/llms.txt) 为普查入口；产品 surface 必须单独登记：CLI、VS Code、JetBrains、Desktop、Web、Mobile。账户、模型路由、平台与版本会改变可用性。

| 缺口组 | 新增实据 | 链接与边界 |
|---|---|---|
| 原生 computer use | ①CLI 为 macOS research preview，Pro/Max/Ultra，interactive，不支持 `-p`；非所有计划。②内置 MCP `computer-use` 默认关，按项目开，需系统 Accessibility/Screen Recording；per-session app 授权。③browser/trading view-only、terminal/IDE click-only；一次一个 session 持桌面锁。④Esc/Ctrl+C 停当前动作，结束 turn 恢复 apps；未批准窗口隐藏、terminal 不截图。⑤Desktop 文档覆盖 macOS/Windows，不能外推 Linux CLI 可用 | [Computer use](https://code.claude.com/docs/en/computer-use.md)。官方订阅可用性不能外推至本仓第三方 LiteLLM 路由 |
| 浏览器专用路径 | ①Chrome 扩展≥1.0.36，Chrome/Edge/Chromium 可见窗口。②DOM/console/form/extract/upload/screenshot/GIF，复用已登录浏览器。③site 权限、session tabs/group ownership；登录/CAPTCHA 停给用户。④要求适用的 Anthropic 账户登录，不等于 API key/第三方 provider 可用；不是 WSL 路径。⑤GIF 可能含账号资料，分享前审阅 | [Chrome](https://code.claude.com/docs/en/chrome.md)、[Computer use](https://code.claude.com/docs/en/computer-use.md)。Chrome≠整个桌面 CU |
| MCP 与插件/团队 | ①MCP stdio/HTTP，OAuth、scope、项目信任和企业策略。②配置写入成功不代表认证/连接成功；`/mcp` 看状态。③skills/plugins/hooks/LSP 属不同扩展面。④teams 是共享 tasks+mailbox、独立 session，实验默认关；`-p`/SDK 不启动 teammates。⑤resume/rewind 不恢复 in-process teammates；普通 named subagent 与 team 不可只凭面板认定 | [MCP](https://code.claude.com/docs/en/mcp.md)、[Agent teams](https://code.claude.com/docs/en/agent-teams.md)、[Overview](https://code.claude.com/docs/en/overview) |
| 原生产物 artifacts | ①**当前 Claude Code 有官方 artifacts**，并非只有 Claude 聊天网站。②private 默认、稳定 URL 更新/版本/gallery `/artifacts`、Ctrl+]。③组织/public 分享、editor 冲突、评论 activate/reply/resolve/watch。④live connector 按 viewer 身份授权；下载 capability。⑤Slides/Design/Docs 模板、页面 CSP/大小/运行环境有限制 | [Artifacts](https://code.claude.com/docs/en/artifacts.md)、[Overview](https://code.claude.com/docs/en/overview)。本次不发布 artifact，只按要求写本地报告；本文不穷举滚动 runtime 全部 capability |
| 语音、记忆与回退 | ①CLI `/voice` hold/tap，转写入可编辑 prompt，可取消，不等于双向语音通话。②claude.ai 登录与本地麦克风；非 API-key/第三方路由，非 SSH/cloud；VS Code Remote 也受限。③CLAUDE.md/AGENTS.md、auto-memory 与 skills 分开。④checkpoint/rewind 可选恢复代码/对话或压缩，保留量有限。⑤shell-only 未跟踪文件、某些 subagent/外部编辑不保证恢复，不能撤销网络副作用 | [Voice dictation](https://code.claude.com/docs/en/voice-dictation.md)、[Checkpointing](https://code.claude.com/docs/en/checkpointing.md)、[Overview](https://code.claude.com/docs/en/overview) |
| 常驻与入口 | ①cloud schedule/API/GitHub event、Desktop schedule、本地 loop 是三个运行位置。②Remote Control/Dispatch/teleport/handoff 是入口/控制迁移，不等于活进程迁移。③Channels、Slack、SDK/headless/CI 是另外几类入口。④终端、git/PR、code intelligence、sandbox/devcontainer/managed policy、usage/cost/模型选择也应列普查 | [Overview](https://code.claude.com/docs/en/overview)、[文档目录](https://code.claude.com/docs/llms.txt)。后者只用于发现遗漏面，未逐页实测全部功能 |

**全量性声明的正确写法**：已覆盖公开官方功能域；每项还需 `surface / plan / OS / version / auth / rollout / evidence / last-checked` 字段，不能说「在本机都能用」。

### 1.5 OpenAI dots：把已证实、愿景和未知分开

官方 [Introducing dots](https://openai.com/index/introducing-dots/) 本轮仍返回 403；未绕过访问控制。因此下列是 **媒体证据，不升级成已核官方规格**，也不把 ChatGPT agent/Codex 的功能整套归给 dots。

1. **[媒] [TechCrunch，2026-09-29](https://techcrunch.com/2026/09/29/openai-launches-dots-its-bubbly-agentic-avatar/)**：常驻后台目标、primary dot 命名/定制、bubbly 浮动 avatar，ChatGPT/Codex 入口以及 Slack/Teams；specialist dots/teams 等存在未来计划表述，不能算已交付工作房。
2. **[媒] [TechCrunch，2026-10-26](https://techcrunch.com/2026/10/26/how-openai-turned-its-coding-tools-into-dots-an-always-on-personal-assistant/)**：桌面/移动 ChatGPT、持续单对话、calendar/email/computer resources、主动研究和冲突/deadline/outage提醒；报道同时举频繁权限询问、Drive 只读粒度不足、提醒太迟等问题，并讨论训练/隐私开关。
3. **[未知]** 两文不足以核定 browser DOM 工具、完整桌面动作集、screenshot 回传 UI、voice call/voice memo、app/site 授权、恢复/撤销、dot teams 正式可用性。也未取得一手 connector 全目录。不能为满足数量凑造 2–5 条官方来源。

补入普查的是「常驻/avatar/主动性/连接资源/权限体验/隐私」，其他栏保留未知，等可访问官方文档或用户提供产物再查。

### 1.6 computer use / browser use 专项：有能力不等于有好用回传

| 产品/实现 | browser use | computer use | 用户看到什么 | 必须保留的限制 |
|---|---|---|---|---|
| Grok Bot 当前官方 | 云 browser；本机 apps 路径另列 | 持久云电脑；本机 Mac/Windows | 右侧 computer preview、screen/status、login 接管 | 多 screen 共享账号级数据；每 bot 一次一个 CU 任务；关窗不停止云任务；群聊卡片受限 |
| Grok Bot 本地产物 0.78.1 | 以既有 RE 为版本锚点，不拿当前云页替代 | 本仓既有研究确认本机 sidecar/14个 `computer_*`、grants/应用黑名单 | 原版工具轨迹/预览，具体以本地 RE 截图为准 | terminal 硬黑名单；没有证据说有独立 panic 热键或操作日志；stop 不撤销已执行动作 |
| Claude Code Chrome | DOM/console+截图/GIF，用户登录态 | 不是全 OS provider | 可见 Chrome 窗口、tabs/group、权限/接管 | site/账户/extension/platform限制；录屏可能含敏感数据 |
| Claude Code 原生 CU | browser 在 CU 中 view-only，另走 Chrome 可操作网页 | CLI macOS preview；Desktop macOS/Windows | 屏幕操作、app审批、桌面锁、Esc/Ctrl+C | 不支持 Linux CLI/所有计划/所有第三方路由；默认关；不等于无监督后台 |
| OpenAI dots | 未取到具体 browser 动作证据 | 媒体提 computer resources，完整 CU 未核 | 浮动 avatar/持续对话已报道；操作预览未知 | 不外推 ChatGPT agent 的 visual browser/can take over |
| MuseAI / tavern | 无网页自动化实据 | 无桌面控制实据 | 角色聊天/冒险/关系/写作页 | 扮演 browser/computer 行为不算实际工具执行 |
| dsh 官方 | `browser-use` registry + Playwright MCP/Chrome DevTools MCP/Stagehand 实验 provider | `computer-use` registry + experimental CUA/Cua Driver | 取决于 provider 与 client UI，registry 自身不生成 Hivebot 预览 | registry 排他，一个 provider；CUA macOS bundle 不等于 Linux Xvfb 开箱即用 |
| Hivebot 当前代码抽查 | SDK source/profile 未发现明确 browser provider 挂载 | SDK source/profile 未发现明确 CU provider 挂载 | protobuf 的 computer/browser 类型不是可达 UI/回传证明 | 按既有 p8 方案做隔离环境验收，不因 lock 有依赖就认定启用 |

本地锚点：`work/p8-parity-full/RE-computer-use.md`、`work/p8-parity-full/reuse/t20-dsh-computer-use.md`、`work/p8-parity-full/SCOPE.md`。它们是既有研究，非本轮重新逆向。Linux 已选方向是隔离屏+trycua 评估、浏览器 isolated launch，避免用户 Chrome cookie；**本轮没有验证最新 Cua Driver 的 Xvfb/headless 兼容**，当前 README 也不足以确认，不能直接写「Linux 已打通」。

建议补入 computer/browser use 验收表（这里只研究，未执行）：

- **入口与归属**：主 bot→worker→工具实际执行，run/session/tool ID 可追到同一 worker；点 Workers 不换组；截图落回发起者，不落另一个 bot。
- **可见回传**：真实网页/隔离桌面做一次点击和输入，截图/预览确实变化；附件/文件/结果能预览和下载；不以工具文本 `success` 代替实图。
- **安全边界**：app/site allow/deny、无授权 fail-closed；隔离 HOME/TMPDIR/浏览器 profile；不读真实 cookies/密钥；工具输出是数据不是授权。
- **用户介入**：登录/CAPTCHA 用模拟页面；Ask/批准/拒绝/超时/停止；停止后新动作不再发生，但不声称撤销既成副作用。
- **生命周期**：关预览/切 bot/worker失败/SDK断线/取消后的状态和投递归属；恢复可读记录不等于恢复活工具；并发屏/浏览器不串号。
- **平台区分**：Linux Xvfb、真实桌面、云电脑三列；截图隐私/脱敏和保存期限；本机真桌面不在无人值守调研范围内。

## 二、dsh 生态对照与匹配表

### 2.1 官方包、版本和 example/plugin 地图

**两份快照必须分开**：本仓 `app/sdk/package.json:21–29` 固定 `0.2.2-rc.1`；本地只读 `repos/deepseek-harness` 的既有参考 SHA 为 `ce7073d512`（MANIFEST 与 p9 PLAN）。在线官方 [packages 地图](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/README.md) 本轮读到 SHA `fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159`，已经有 `team/` 分组；不能把新布局当成本仓已升级。

用标准库只读扫描本地 `packages/**/package.json`，发现 **372 个 `name` 以 `@deepseek-ai/dsh` 开头的清单**。这不是 372 个已发布 npm 包，更不是 372 个独立产品功能。官方实验目录明确区分 experimental（能力仍评估，无产品支持承诺）、optional（显式选择）和 official（项目维护，不代表成熟）：[experimental README](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d512/packages/experimental/README.md)。

| 能力族 | 精确包名/官方源码例子 | 本仓判断 |
|---|---|---|
| browser use | `@deepseek-ai/dsh-browser-use`；`dsh-experimental-browser-use-playwright-mcp` / `…chrome-devtools-mcp` / `…stagehand-native` / `…runtime`；[registry README](https://github.com/deepseek-ai/deepseek-harness/tree/ce7073d512/packages/browser-use) | 有官方接口与实验实现，未发现 Hivebot source/profile 显式接 provider；别再自写一套 browser 内核 |
| computer use | `dsh-computer-use`、`dsh-cua`、`dsh-cua-bundle`、`dsh-experimental-cua-macos`、`dsh-experimental-computer-use-cua-driver-mcp/native`；[源码族](https://github.com/deepseek-ai/deepseek-harness/tree/ce7073d512/packages/computer-use) | 有 registry/适配器；macOS bundle 与 Linux 隔离屏不是同一件事；provider/app/window协议不是几十行胶水 |
| subagent/workflow/team | `dsh-subagent`、`…-acp/claude-code/codex/dsh-sdk/fork-in-process/spawn-in-process`、`dsh-tool-subagent/control`、`dsh-workflow/ptc`；实验 `dsh-experimental-agent-team/profile/tool-agent-team` | 本仓已自有主 bot 编排与 Workers 链，先保留接口/归属契约；team/task/mailbox 可借，不整套替换 |
| 定时/事件 | `dsh-schedule`、`dsh-tool-schedule`；experimental 目录中的 `dsh-webhook`、`dsh-webhook-github` | schedule 工具已在 approval/p6 patch roster 中；事件 webhook 未找到明确挂载。执行成功/重启安全仍需回执 |
| 会话查询/记录 | `dsh-session-query`、`dsh-session-query-sqlite`、`dsh-tool-session-query`、`dsh-session-log-export` | lock/restart测试能见 session-query；这不是自动语义记忆召回证明 |
| 插件自管理/市场 | `dsh-plugin-manager/market`、`dsh-tool-cordis`、`dsh-cordis-host-runner/client-runner`、client UI 对应包 | app/sdk 明确依赖 manager/market，start.ts 默认 market patch；不能说完全没有。`tool-plugin-manager` 审批策略另外受控 |
| 文件产物/预览 | `dsh-tool-present`、`dsh-deliverable-file-references`、`dsh-workspace-changes`、`dsh-office-to-pdf` | 有底座，不等于 Grok Pages/Claude hosted artifacts 的分享/评论/版本全栈 |
| voice | `dsh-experimental-voice-input-bundle`、`dsh-experimental-client-ui-voice-input`、`dsh-experimental-speech-to-text/sensevoice` | lock 有 voice-input，未发现显式产品接线；STT≠TTS≠语音通话 |
| 协作分享 | `dsh-experimental-liveshare`、`…-protocol` | 分享一个 session 给人，不等于多 bot 工作房。lock 出现不等于启用 |
| 代码智能/研发 | `dsh-lsp/stdio/tool-lsp`；experimental terminal、worktree/forge PR、hooks Claude Code/Codex、PTC、auto-review、inspector | 原报告未逐项普查；按需要选服务，不启动全部实验功能 |
| 个性化 UI/观测 | experimental action cards、personalized UI、plugin recommendations、stats/cost、team UI | 底座存在；本仓自有 renderer 是否可消费需单独适配 |
| 桌宠/角色内容/社区房间 | 本地官方包图没有证据证明提供完整产品 | 社区 dsh-pet/MuseAI/worktable/team 各解决不同层，不能都叫官方「房间」 |

官方资料入口：[主仓](https://github.com/deepseek-ai/deepseek-harness)、[文档](https://deepseek-harness.github.io/deepseek-harness/)、[包图](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/README.md)。实验包目录本身就是可读实现样例；**本轮未核到一个独立、穷尽的官方 example 仓目录**。社区 [dsh-plugin topic](https://github.com/topics/dsh-plugin) 是发现入口，不是官方认证列表。

#### npm 发布核验（2026-11-09，直接 registry JSON）

以下十包均在 npm 的 `versions` 中实际存在 `0.2.2-rc.1`，发布时间均为 **2026-11-04 UTC**；只核元数据，未下载安装/执行。特别注意 `latest` 并不一致，不能裸装后假定拿到 rc.1。

| 包（均 `@deepseek-ai/`） | `latest` | `next` | registry 实据 |
|---|---|---|---|
| dsh | 0.2.2-rc.1 | 0.2.2-rc.1 | [JSON](https://registry.npmjs.org/@deepseek-ai%2Fdsh) |
| dsh-browser-use | 0.1.6-alpha.1 | 0.2.2-rc.1 | [JSON](https://registry.npmjs.org/@deepseek-ai%2Fdsh-browser-use) |
| dsh-computer-use | 0.1.6-alpha.1 | 0.2.2-rc.1 | [JSON](https://registry.npmjs.org/@deepseek-ai%2Fdsh-computer-use) |
| dsh-experimental-browser-use-playwright-mcp | 0.1.6-alpha.1 | 0.2.2-rc.1 | [JSON](https://registry.npmjs.org/@deepseek-ai%2Fdsh-experimental-browser-use-playwright-mcp) |
| dsh-cua-bundle | 0.2.2-alpha.2 | 0.2.2-rc.1 | [JSON](https://registry.npmjs.org/@deepseek-ai%2Fdsh-cua-bundle) |
| dsh-experimental-agent-team | 0.1.5-alpha.2 | 0.2.2-rc.1 | [JSON](https://registry.npmjs.org/@deepseek-ai%2Fdsh-experimental-agent-team) |
| dsh-schedule | 0.0.1-rc.3 | 0.2.2-rc.1 | [JSON](https://registry.npmjs.org/@deepseek-ai%2Fdsh-schedule) |
| dsh-experimental-voice-input-bundle | 0.1.7-alpha.1 | 0.2.2-rc.1 | [JSON](https://registry.npmjs.org/@deepseek-ai%2Fdsh-experimental-voice-input-bundle) |
| dsh-experimental-liveshare | 0.2.2-alpha.2 | 0.2.2-rc.1 | [JSON](https://registry.npmjs.org/@deepseek-ai%2Fdsh-experimental-liveshare) |
| dsh-tool-cordis | 0.0.1-rc.1 | 0.2.2-rc.1 | [JSON](https://registry.npmjs.org/@deepseek-ai%2Fdsh-tool-cordis) |

源码中另外看到的包没有逐一查 registry；尤其不要按 `experimental/` 目录机械拼 `dsh-experimental-*` 名称，`dsh-cua`、`dsh-webhook` 等没有该前缀。

#### Hivebot 启用证据：有后端≠有原版 UI

- `app/sdk/src/start.ts:148–165` 默认链含 `p2sdk.yml`、`approval.yml`、`market.yml`、`awareness.yml`、`orchestration.yml`；`orchestration.yml:1–16` 明确 T34 已开闸，主 bot 有 create/send/stop 通道。
- `app/sdk/profile/patches/p2sdk.yml:52–169` 主动关掉上游 client roster，包括 `cordis-client-runner`、`ui-cordis`、`ui-deliverables`、`ui-schedule`、`ui-subagent`、`ui-workflow-run` 等：**是 backend-only 方案，不是上述后端能力统统没有，也不证明 Hivebot 自有 UI 缺失。** 新插件依赖 dsh client slot 时，直接装 npm 可能完全不显示。
- 本轮针对 SDK source/profile 检索未发现 browser/computer provider、MuseAI、dsh-pet 明确挂载；UI 里命中的是搬运的 protobuf 定义，不能当功能可达。未读运行时私有配置/凭证，所以一律写「未发现显式接线」，不写「所有生产环境都关着」。
- `pnpm-lock.yaml` 中 voice-input/liveshare/session-query 仅是依赖图证据；`tests/e2e/restart.test.ts` 的 query 冷读是历史可读证据，不是团队活进程恢复。

### 2.2 社区实现：先分清 pet / room / community

1. **[仓] [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)**：5,923★。Web overlay、DSH Electron 透明置顶、standalone；100+动画、拖拽/碰撞/多宠、自定义素材、session状态/通知回跳、聊天记忆、STT/TTS、to-do提醒、余额反应。Linux无display会跳过桌面窗，不等于无头有桌宠。代码MIT，**角色资产 CC BY-NC-SA 4.0**，并非官方吉祥物；localhost HTTP API 自述无认证，接 Hivebot 前需检查来源校验/调用权限/可泄露状态，不能因此对外暴露。
2. **[仓] [huxint/dsh-team](https://github.com/huxint/dsh-team)**：14★。named长期teammates、独立会话/记忆、shared tasks/blackboard、private notes、mailbox、可展开头像卡与小世界；README 0.2.10 适配 **dsh 0.1.7-rc.2**，不是 rc.1兼容保证。黑板/私有笔记持久化，mailbox重启持久性未明确；teammate不能再建team，默认8成员、对话hop/round-trip有限制。它比泛搜大star「room」更命中任务，但仍不是人类多人群聊产品的直接证明。
3. **[仓] [Aisland-SJL/dsh-worktable](https://github.com/Aisland-SJL/dsh-worktable)**：848★。项目抽屉、dock/split/tab/自定义窗口、conversation绑定与 live control room；运行快照仪表盘，不调用模型。README明确 run ended≠成功；localStorage/IndexedDB本机状态、不跨机器同步。**control room不是multi-bot对话房间或多人协作**。
4. **[仓] [dsh-market/dsh-market](https://github.com/dsh-market/dsh-market)**：11,565★，实际 npm 名 **`dshmarket`**（不是官方 `@deepseek-ai/dsh-plugin-market`）。安装/批量更新/源归属/备份恢复/渠道；Desktop/web不同profile，build脚本需批准；目录收录≠背书；不能说已支持通用任意版本pin/降级。导出profile可能含凭证，不能把示例导出上传模型；本轮未读取任何真实导出。
5. **[仓] [nexu-io/open-design](https://github.com/nexu-io/open-design)**：106,695★。是可直接启动 dsh CLI 的独立设计工作台，不是装一个UI插件即可变Hivebot。HTML/preview/真实文件、PDF/PPTX/ZIP/Markdown/MP4、持久项目/模型选择；可借产物工作流。README未确证完整实时共编/细粒度分享权限，不等于Claude/Grok托管页面服务。

「社区」至少分三项：插件市场/索引、角色内容分享、产品内人类/多bot社交。前两者有候选，第三项本轮**没有发现满足高star+语义匹配+安全验证的 dsh 即装实现**。Android Room数据库、环境音 watch room、token/context browser、手机 remote UI 都是词面误匹配，已排除。

### 2.3 高 stars 匹配：相关性优先，不冒充全网最高

检索范围：GitHub `topic:dsh-plugin`，以及带 pet / room / browser / computer / community 的子查询；另查 `desktop pet archived:false`、`AI companion archived:false`、`browser automation stars:>20000 archived:false`、`computer-use stars:>10000 archived:false`，按 stars 排序。下面是**本次样本中的相关候选**，非穷尽排名。stars 是 2026-11-09 元数据快照，会变动。

本轮逐仓核了默认分支实际最新 commit 时间（不是 `updated_at`），表内均不归档且在 2026-05-09 之后。**活跃提交不等于已满足本项目「issue有人回应」准入**；最后一列必须一起看。功能证据为各行 README（可点仓名），不是topic标签。

| Hivebot/普查缺口 | 高star相关实现及 stars | 最新实际 commit（UTC日期/短SHA） | dsh首选/匹配判断 | 准入状态 |
|---|---|---|---|---|
| browser执行/截图/结构化回传 | [browser-use/browser-use](https://github.com/browser-use/browser-use) **120,374**；[microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp) **39,356** | [10-30 b49a68e406](https://github.com/browser-use/browser-use/commit/b49a68e406)；[11-06 404be8eb89](https://github.com/microsoft/playwright-mcp/commit/404be8eb89) | 优先既有dsh Playwright provider；browser-use是另一个browser agent栈，不是desktop driver，不因stars替换 | browser-use有近期维护回应；Playwright样本未找到回应，未准入 |
| 复用真实登录态browser | [Tencent/BrowserSkill](https://github.com/Tencent/BrowserSkill) **10,205** | [11-09 a929080d68](https://github.com/Tencent/BrowserSkill/commit/a929080d68) | 有dsh插件 `@wxg-prc-cpg/browser-skill-dsh-plugin`、预览和截图；真实profile Agent Window**非安全沙箱**，本轮只参考，不碰用户cookie | commit已核；issue回应未查完；非本项目隔离默认方案 |
| Linux CU/预览/接管 | [bytedance/UI-TARS-desktop](https://github.com/bytedance/UI-TARS-desktop) **39,582**；[trycua/cua](https://github.com/trycua/cua) **32,030** | [10-09 3ac2cb8d94](https://github.com/bytedance/UI-TARS-desktop/commit/3ac2cb8d94)；[11-09 6285c481d2](https://github.com/trycua/cua/commit/6285c481d2) | UI-TARS借交互参考，README未保证Linux Desktop；dsh已有Cua Driver adapters，trycua更接近driver复用；Xvfb需另证 | 两者commit已核、issue回应小样本未找到，未准入 |
| 任务状态桌宠 | [ayangweb/BongoCat](https://github.com/ayangweb/BongoCat) **24,556**；[PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet) **5,923** | [10-28 47a73ed176](https://github.com/ayangweb/BongoCat/commit/47a73ed176)；[11-09 c25386848f](https://github.com/PC2005-cloud/dsh-pet/commit/c25386848f) | 前者更高star但不证明agent状态整合；后者有直接dsh状态/通知/动画链，优先核后者 | dsh-pet有OWNER回应；代码/资产分证、无认证API仍需审 |
| Muse式角色/陪伴/语音 | [moeru-ai/airi](https://github.com/moeru-ai/airi) **51,230**；[SillyTavern/SillyTavern](https://github.com/SillyTavern/SillyTavern) **35,436** | [11-08 a0d1b2ce03](https://github.com/moeru-ai/airi/commit/a0d1b2ce03)；[09-14 06bde939fb](https://github.com/SillyTavern/SillyTavern/commit/06bde939fb) | dsh MuseAI tavern是更薄直接入口；AIRI有VRM/Live2D/STT/TTS/Discord，**完整memory/plugin仍WIP**；SillyTavern只列备选，不把其全功能算tavern插件 | AIRI有COLLABORATOR回应、MIT；不采用需sudo开发路径；SillyTavern AGPL、回应未核 |
| 多bot Room/任务板/mailbox | [openclaw/openclaw](https://github.com/openclaw/openclaw) **394,213**；直接dsh命中[huxint/dsh-team](https://github.com/huxint/dsh-team) **14** | [11-09 b59c593cb0](https://github.com/openclaw/openclaw/commit/b59c593cb0)；[09-28 3ac69851af](https://github.com/huxint/dsh-team/commit/3ac69851af) | OpenClaw仅参考既有C报告消息协议，不当即装Room；dsh官方team/低star dsh-team更贴接口，必须验证版本与持久性 | dsh-team有OWNER回应；OpenClaw未补到近期回应，安全反例禁止继承 |
| 社区插件发现/安装更新 | [dsh-market/dsh-market](https://github.com/dsh-market/dsh-market) **11,565** | [11-08 3616c431d7](https://github.com/dsh-market/dsh-market/commit/3616c431d7) | 已有官方manager/market底座，先补自有UI安装→审批→激活→更新→回滚回执；不叠装两套控制面 | commit已核；未找到近期维护者issue回应，目录不是安全认证 |
| Pages/交互产物/设计交付 | [nexu-io/open-design](https://github.com/nexu-io/open-design) **106,695** | [11-06 87a4f91c30](https://github.com/nexu-io/open-design/commit/87a4f91c30) | 优先dsh present/file refs；借独立项目的预览/导出流程，不整仓替换Hivebot；托管/ACL/评论仍需自有服务或现成服务 | commit已核、Apache-2.0；issue回应未补到，未准入 |
| 跨会话自动记忆召回 | [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) **261,835**；[mem0ai/mem0](https://github.com/mem0ai/mem0) **68,662** | [11-09 b766b76988](https://github.com/NousResearch/hermes-agent/commit/b766b76988)；[11-06 f1791daa86](https://github.com/mem0ai/mem0/commit/f1791daa86) | Hermes借FTS5/session search/skills；mem0有add/search+调用方注入，不等于本地无模型成本；先查dsh session-query够不够 | commit已核；两者近期issue回应样本未找到，未准入 |
| 定时/触发/渠道/主动通知 | [openclaw/openclaw](https://github.com/openclaw/openclaw) **394,213**；[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) **261,835** | 同上 | dsh schedule/webhook优先；Hermes README有cron+多平台通知/voice memo，OpenClaw只借已核渠道/配对/状态，不默认exec免批 | 尚未完成维护回应/安全准入；不因为高star用第二套daemon |
| 成本/上下文/失败可观察 | [bowenliang123/dsh-context](https://github.com/bowenliang123/dsh-context) **4,696** | [11-09 45a8a212c4](https://github.com/bowenliang123/dsh-context/commit/45a8a212c4) | 概览/趋势/请求/成本/缓存/跳会话，直接dsh观测参考；**不是自动长期记忆** | 有OWNER回应，Apache-2.0；仍需检查自有renderer适配 |
| 多账号/provider配置体验 | [farion1231/cc-switch](https://github.com/farion1231/cc-switch) **152,859** | [11-09 cdca098423](https://github.com/farion1231/cc-switch/commit/cdca098423) | 只参考A报告的配置/可用性设计；与Google/Slack OAuth账号连接不是同一能力，不用于替代connector auth | 有OWNER回应，MIT；不读取其真实用户配置/凭证 |

**维护回应证据（不是只看 stars）**：

- dsh-pet：[issue #326 / OWNER 2026-11-08](https://github.com/PC2005-cloud/dsh-pet/issues/326#issuecomment-6721622151)。
- dsh-team：[issue #1 / OWNER 2026-09-05](https://github.com/huxint/dsh-team/issues/1#issuecomment-5552991949)。
- dsh-context：[issue #233 / OWNER 2026-11-07](https://github.com/bowenliang123/dsh-context/issues/233#issuecomment-6705352486)。
- cc-switch：[issue #9352 / OWNER 2026-11-09](https://github.com/farion1231/cc-switch/issues/9352#issuecomment-6733484101)。
- AIRI：[issue #3180 / COLLABORATOR 2026-11-03](https://github.com/moeru-ai/airi/issues/3180#issuecomment-6598324481)。
- browser-use：[issue #5747 / COLLABORATOR 2026-09-10](https://github.com/browser-use/browser-use/issues/5747#issuecomment-5624888765)。

其余为抽样未找到，不等于项目无人维护。抽样先查最近8条issues/PR列表，再对未命中者搜最近4条有评论的真issue、前30条评论内 OWNER/MEMBER/COLLABORATOR；这是有限样本。MuseAI tavern 28★、最近提交09-30，也未找到维护回应，**不满足现有证据下的完整准入条件**；主MuseAI元数据未给明确SPDX，不能用插件MIT覆盖本体许可证。

**排除与降级**：

- [n8n](https://github.com/n8n-io/n8n) 209,875★、11-09真实提交，可参考1500+集成/human approval，但 README 是 Sustainable Use/Enterprise **fair-code**，不是已核OSI开源；不拿它充「最高star开源实现」。
- [OpenViking](https://github.com/volcengine/OpenViking) 41,832★、11-09提交、AGPL；可作记忆/context备选，但本轮未深读功能，不认定自动召回符合本仓契约。
- [petdex](https://github.com/crafter-station/petdex) 4,348★、10-10提交；可作跨agent宠物图库候选，未深读/核issue，不替代dsh-pet已读证据。
- topic检索虽有几十万star通用仓，不代表真dsh插件；免费无key模型路由、jailbreak/purge等不因排名进入推荐。AutoGen/Swarm/已归档项目沿用旧报告排除，不以近期文档提交洗成活跃产品。

### 2.4 搬运路线与工作量：不重做已有内核

估量只用于方案排序，**不是验收承诺或开工授权**。S＝约0.5–2人日；M＝3–5人日；L＝1–2人周；XL＝更长/外部服务与权限范围未知。包括薄适配与定向测试的粗估，不含完整跨平台发布。`repos/`参考仓只读，真要深读/复制再依项目MANIFEST和来源声明流程。

| 能力 | 第一层：现成依赖/插件 | 若第一层不能用 | 不能省的部分 |
|---|---|---|---|
| browser | rc.1官方Playwright provider+隔离profile | 借已有MCP client适配，才考虑另建driver | tool→worker归属、截图/下载回传、stop与权限；S/M，不另起browser agent栈 |
| Linux CU | 官方Cua Driver适配器+trycua兼容性探针 | Linux隔离driver薄桥，不改上游 | Xvfb/窗口协议/坐标/失败状态/审批；最小driver接线既有研究1–3人日，完整体验M/L+ |
| 桌宠 | dsh-pet兼容性/事件接线 | 只借动画/状态协议到已有Electron | 资产许可、无认证API、安全窗/可退出；自有renderer不消费slot时M起 |
| Room | 官方team/消息服务+已有Hivebot编排 | 借dsh-team任务/消息UI，不换bot身份模型 | durable mailbox、ACL、并发claim、来源、恢复与群聊语义；L/XL |
| 社区/插件 | 已装官方manager/market+可信索引 | 参考dshmarket安装/更新UX | 来源/版本锁定、审批/失败/回滚、不可自授权；M |
| 产物 | present/file refs+已有预览 | 借OpenDesign导出，不搭第二产品 | 内容隔离、下载/更新、分享ACL；本地预览M，托管Pages L/XL |
| 语音 | dsh voice-input/SenseVoice bundle | 只做STT输入；TTS/双向以后独立选型 | 用户授权、录音指示/取消/隐私；STT M，通话L/XL |
| 记忆 | session-query+明确用户可控事实 | 确有召回需求才接mem0/借Hermes | 作用域/来源/forget/误召回/成本；M/L |

### 2.5 差价清单：最值得做的 Top 10

这里的「差价」是复用价值/体验收益对施工量的比，不是把所有竞品能力同时立项。排序先补可达性与安全回传，再考虑新表面；用户已推迟的 SSH 不在本轮推荐内。

| 排名 | 功能与最小交付 | 来源 | dsh 有无 / Hivebot 状态 | 工作量级 |
|---|---|---|---|---|
| 1 | **browser use 真执行→截图/文件回到正确worker**：先做隔离浏览器一条完整链 | Grok preview、Claude Chrome、dsh Playwright MCP | 有实验provider；未发现显式挂载；不等于lock有就可用 | S/M：薄接线+回传/取消/隔离测试 |
| 2 | **computer use Linux隔离屏探针与可见回传**：先证driver/坐标/截图/stop，不碰真实桌面 | 既有T20研究、trycua、Grok本机CU | 有registry/Cua Driver adapters；不是macOS bundle搬来即用 | M/L；最小接线1–3人日，完整权限/预览另计 |
| 3 | **Workers/工具过程可追踪**：running/blocked/failed区分、归属/投递、可接管 | Claude teams、scout C/D、dsh-context/worktable | 已有T36，不重写；补失败与computer/browser工具回传契约 | S/M，先盘现有测试和UI |
| 4 | **插件安装闭环**：找→审→装→激活→失败说明→更新/撤销 | 官方manager/market、dshmarket | 底座已装、默认market patch；自有UI与可信目录是重点 | M；不无审批放开agent自装 |
| 5 | **产物卡与本地交互预览**：Office/图片/HTML可预览、下载、修订并回到会话 | Grok files/Pages、Claude artifacts、OpenDesign | 有present/file refs；上游UI关闭，自有renderer需核 | M；先不做公网托管/分享服务 |
| 6 | **定时运行的诚实可视化**：时区/next run/test/pause/history/failure+来源 | Grok routines、Hermes cron | schedule有且在tool roster；事件webhook另核 | S/M；不要将accepted当完成 |
| 7 | **上下文/成本与恢复边界可见**：成本趋势、history可读、重连≠重跑 | dsh-context、Claude checkpoint、scout C | 有query/log与stats实验底座，部分已测；非跨会话自动记忆 | S/M；不改执行内核 |
| 8 | **可关闭的任务状态桌宠**：thinking/needs-you/done+点回相应bot | dsh-pet，BongoCat只作动画参考 | 官方未核到完整产品；直接插件需适配backend-only架构 | M；许可/API安全先过，不整套搬余额/聊天 |
| 9 | **语音输入而非先造通话**：push/tap录音→可编辑文字→取消/发送 | Claude dictation、dsh STT、Grok voice memo | 有实验voice-input/SenseVoice；lock不是启用 | M；TTS/通话明确后置 |
| 10 | **小范围持久协作房试验**：稳定bot+shared task+可追溯mailbox | Grok群聊、官方dsh team、dsh-team | 有team底座/自有编排，未有已验完整Room；LiveShare不是它 | L/XL；先定权限/恢复契约，再做空间化UI |

**暂不挤进 Top10**：Muse整套写作/冒险/关系系统（目标差异大，只留角色卡/长记忆借鉴）；高star记忆新框架（先用已有query）；全套语音伴侣/3D avatar；多人社区社交；公网Pages后台；第二套OpenClaw/Hermes守护进程。它们有参考价值，不代表现在需要施工。

**本轮已做到/未做到**：完成四报告覆盖审计、公开功能域补齐、关键10包npm rc.1验证、候选真实commit核验与维护回应抽样、Hivebot配置锚点和Top10。未宣称dots官方功能核全、Muse用户指代已定、所有372包已发布、所有候选满足准入、任何computer/browser路径已经实测可用；没有改产品/参考仓、读凭证、装依赖、运行全量或操控桌面。
