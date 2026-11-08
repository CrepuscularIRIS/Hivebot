# Scout B：Grok Bot、dots 与桌面多 bot 助手公开资料扫描

调研日期：2026-11-08。范围：公开网页、GitHub 仓库 README、代码搜索与公共 issue；不拆本地产物、不运行外部代码、不实现功能。检索使用 GitHub MCP `search_repositories` / `search_code` / `search_issues` / `issue_read` 与 WebSearch、WebFetch。

## 0. 阅读口径与主要结论

- **dots 最有证据支持的身份是 OpenAI 的 always-on personal assistant**，不是已确认的 `dots.lovelive` 产品。TechCrunch 2026-09-29 发布报道指向 OpenAI 官方公告；10-26 实测报道讨论其真实使用形态。`https://dots.lovelive` 本次访问返回 DNS `ENOTFOUND`，精确名称检索无可用资料；不能据此断言这个域名从未存在，也不能把 LoveLive 角色聊天机器人当成同一产品。
- **Grok Bot 复刻生态并不空白**：找到 0.18.0 研究性重建、从头实现的 OpenBOT，以及 OpenMausBot、Rakazo、OpenBot 等较完整替代品。没有在本次样本中证实一个完整、可替代原版的 **0.78.1/0.79.3 开源重建**。
- 最重要的语义区分：多 bot 名册 ≠ 多 bot 同群共同响应；记住历史 ≠ 跨会话自动召回；保存数据 ≠ 正在执行的任务可重启续跑；可调用 MCP ≠ bot 可自行安装插件；有 CreateAgent 类工具 ≠ 默认生产路径已启用。
- 证据标签：**[官]** 官方网页/文档；**[仓]** 作者 README 自述，未运行验真；**[媒]** 二手报道或媒体试用；**[议]** issue 的需求/故障报告，不代表已实现；**[本]** Hivebot 本地现有工单/计划。`?` 为未证实，不等于没有。
- 搜索索引与网页内容可能滞后。仓库 `updated_at`、星数不能证明最近有代码提交或 issue 获得维护者回复；本报告不是依赖准入或安全审计。

## 1. Grok Bot 本体

### 身份、发布页与可见功能

产品为 xAI/Grok Bot；下载基础设施和部分安全文档同时出现 Cursor/Anysphere 品牌，不能把它简单等同于普通 Grok 聊天客户端。**[官]** [发布公告](https://x.ai/news/introducing-grok-bot)、[产品页](https://x.ai/bot)、[桌面下载页](https://cursor.com/download/bot)。产品页本次 WebFetch 返回 403，但公告、下载页和安全文档可读。

下载页当前链接标出 **0.79.3**；macOS Apple Silicon/Intel、Windows x64/ARM64、Linux x64/ARM64（deb/RPM/AppImage）。这证明下载页的当期包版本，不证明 0.78.1 与 0.79.3 每项行为一致。

| 功能 | 公开证据与限制 |
|---|---|
| 长期存在的命名 bot、多任务并行 | 公告称内部常用多个 bot 并行，其中一个管理其他 bot；能记住对话、学习偏好。属产品宣称，未做持久性压力实测。[官] |
| bot 间消息、跨线程传上下文 | 原文：`Bots can independently message each other and share context in threads.` [官] |
| 群聊协作、分工、移交 | 公告明确可以把 bot 放入 group chat，互相协调、分派 ownership，必要时找用户判断。[官] |
| 主 bot 创建 worker / CreateAgent | 公开第三方 CLI 有创建、编辑 bot 与组的命令；公开提示词语料出现工具定义线索。但不能仅凭第三方代码确定 0.79.3 内部工具准确名称、参数和授权语义。[仓] |
| Workers / My Machines | 代码搜索命中公开提示词语料中的 `workers`：列出用户私有 worker 和机器、工作区、repos，用于机器 launch。**这里的 workers 是执行机器资源，不应自动等同 UI 的 bot Workers 分组。** [仓] |
| Connect apps / 连接器 | 插件/MCP 与已登录浏览器两条路径；GitHub、Jira、Slack、Google Workspace 是媒体列举案例。报道引用的「220 插件」是 2026-08 的历史快照，不能作当前数量。[媒] |
| 没有 API 的网站也能操作 | 公告明确称可在没有 clean API 或 MCP 的平台登录并完成工作。[官] |
| 演示转 routine、修正后重用 | 公告：观看步骤，保存 workflow 为 routine，吸收用户修正；计划执行见媒体报道。没有公开可靠性保证。[官/媒] |
| 后台云电脑、文件/终端/浏览器 | 可在本机关闭时继续跑云端任务；需区分远端继续跑与桌面进程恢复。[媒] |
| 审批与权限 | 安全文档有 Allow once / Always allow / Deny、Auto Review、网络/MCP 限制、企业审计等；内存写和大部分设置不在同一审查范围。[官] |
| bot 之间的隔离 | 安全文档只支持用户/成员层面的隔离叙述；同一成员的持久电脑、文件和浏览器会话不能视为逐 bot 安全隔离。删除 bot 不等于删除电脑上的文件/登录态。[官] |
| 重启、hibernate、恢复 | 成员磁盘和浏览器会话可持久；不应据此宣称任意中断的工具调用会 exactly-once 恢复。[官] |

关键资料：
- [安全文档](https://docs.x.ai/grok-bot/security)：尤其注意 MCP allowlist 的独立开关默认关闭；本地 shell 默认逐命令审批，与云电脑审查不是一回事。
- [OpenReplay 功能与边界评述](https://blog.openreplay.com/grok-bot-xai-agent-problem/)：协调、220 插件历史快照、审批和共享电脑边界；文章承认长期无人值守的独立验证不足。
- [用户指南仓](https://github.com/xianyu110/grokbot)、[资源索引](https://github.com/RongleCat/awesome-grok-bot)、[用例/插件目录](https://github.com/ZeroPointRepo/GrokBotDev)、[中文配方](https://github.com/sit-in/awesome-grokbot-playbooks)：可找截图、配方和用户场景，不能把目录收录当产品已实现证明。
- 可直接查看的研究截图：[0.18 重建 Router 设置图](https://github.com/b-nnett/grok-bot-0.18-reconstructed/blob/main/docs/assets/router-settings.png)。**它是重建版扩展 UI，不是 0.79.3 官方截图。** 本轮未下载截图做像素核验；公告有视频占位但提取文本未给可用视频地址。

### 相关开源、复刻、研究仓清单

| 仓库 | 身份/可借鉴部分 | 边界 |
|---|---|---|
| [b-nnett/grok-bot-0.18-reconstructed](https://github.com/b-nnett/grok-bot-0.18-reconstructed) | 0.18.0 macOS/arm64 非官方 source-oriented reconstruction；Electron、host、coordinator、协议边界；扩展 Claude/Codex/OpenRouter router、Docker sandbox。[仓] | 搜索元数据为 **archived**；保留校验固定的原版 renderer，只重建运行时与有限前端，不是原始源码泄漏，也不是完整开源前端。README 读取时仓库提交 `a9f633e09d49a85829b8236331b9e21f7e612634`。 |
| [ashhart/OpenBot](https://github.com/ashhart/OpenBot) | 从头实现、local-first Electron；五类 agent CLI、同聊天多 agent、@点名/交棒、后台委派、可复用 skill/routine、审批；MIT。[仓] | README 自称 0.1.0 early；本地执行无 OS sandbox，未承诺任务跨 app 重启自动恢复。不能同其他 OpenBot 混称。 |
| [milind-soni/OpenMausBot](https://github.com/milind-soni/OpenMausBot) | 较完整 Grok Bot alternative；本地/云电脑、群组、连接器、定时、MCP、团队包。[仓] | Apache-2.0 主体，`enterprise/` 另有 source-available 条款；见 §3。 |
| [elie222/rakazo](https://github.com/elie222/rakazo) | 自选模型与 sandbox、持久 bots、peer/subagent 委派、连接器；Apache-2.0。[仓] | beta；不是照搬原版 UI，见 §4。 |
| [nightly-labs/openbot](https://github.com/nightly-labs/openbot) | 本地持久 AI teammates、队列、工作区、共享频道、skill 生命周期。[仓] | 当前 PolyForm Noncommercial；旧版 ≤0.1.11 是 Apache-2.0。审批默认策略不适合直接搬用，见 §5。 |
| [ScriptedAlchemy/grok-bot-cli](https://github.com/ScriptedAlchemy/grok-bot-cli) | 第三方 `gbot`：bot/group CRUD、send、thread、Codex/Claude/ChatGPT Desktop 桥接；MIT。[仓] | 依赖本机已登录 Grok Bot；是自动化/桥接，不是复刻；不会替用户自动批准命令。 |
| [unicodef1wn/grokbot-field-notes](https://github.com/unicodef1wn/grokbot-field-notes) | 72 小时现场构建的角色、流程、失败记录；窄职责、验证闭环、routine 成本审计。[仓] | 不是运行时或复刻；README 的 69 roles/40 breakdowns 为目录自述，本轮未逐条复核。 |
| [tiagovilasboas/grok-bot-architecture](https://github.com/tiagovilasboas/grok-bot-architecture) | 九类角色合同、typed handoff、MCP、人审门、持久审批生命周期示例；MIT。[仓] | 明示非官方、非逆向、非产品后端；示例无模型调用、无真实外部副作用，不是可直接替换的引擎。 |
| [robbin/grokbot-local-agent](https://github.com/robbin/grokbot-local-agent) | 描述为 Grok Bot 向本机 Pi agent 交重活并 webhook 唤醒。[搜索元数据] | 本轮未深读，属于下一步桥接候选，不认定安全/可用。 |
| [pftq/GrokBot](https://github.com/pftq/GrokBot) | 创建于 2025，描述为 Grok/ChatGPT 驱动鼠标键盘的桌面机器人。[搜索元数据] | 同名旧项目，不是 2026 Grok Bot 产品复刻。 |
| [fanghui-li/Grok-Desktop](https://github.com/fanghui-li/Grok-Desktop) | Grok Build agent 的 Electron 客户端。[搜索元数据] | Grok Build 与 Grok Bot 不可混为同一产品。 |

## 2. dots（OpenAI）及同名开源实现

### 身份与功能版图

- **[媒]** [TechCrunch 发布报道，2026-09-29](https://techcrunch.com/2026/09/29/openai-launches-dots-its-bubbly-agentic-avatar/)：dots 是 ChatGPT/Codex 可启动、后台持续工作的个人 agent；给 primary dot 命名；可对接 Slack/Teams。报道指向[官方 Introducing dots](https://openai.com/index/introducing-dots/)，但本次直接抓取官方页 403，故未把媒体转述标成亲自读过的官方原文。
- **[媒]** [TechCrunch 跟进试用，2026-10-26](https://techcrunch.com/2026/10/26/how-openai-turned-its-coding-tools-into-dots-an-always-on-personal-assistant/)：桌面和移动 ChatGPT 内一个持续助手/持续线程，连接日历、邮件、电脑等资源；周期性思考正在进行的目标，主动提示冲突/期限/机会。试用中有会前仅三分钟才提醒的时机问题，存在权限请求疲劳和 read-only 粒度不足。
- **当前多 bot 协作须降级标注**：发布报道引述“Over time, we envision teams of Dots working together on your behalf.” 是愿景；10-26 叙述仍以单一助手为重心。可存在 specialist dots 的产品叙述，但不能据此给“已交付 Grok 式多 bot 群聊自主协作”打勾。
- **跨对话**：持续线程/长期上下文有媒体证据；跨任意独立对话统一自动召回未证实。后台云端工作不等于桌面 app 自己承载运行时。
- **自装插件/重启**：连接已有应用与资源是已报道能力；bot 自主安装任意插件、精确重启恢复/重试语义均未证实。连接器数量、定价、地区和计划快速变化，本报告不作当前购买指南。
- [MindStudio 使用文章](https://www.mindstudio.ai/blog/chatgpt-dots-how-to-use)提供周期监测、收件箱整理、scheduler 等案例，但缺少一手链接和可重放测试，只作为弱证据补充，不据此覆盖上面的媒体实测限制。

### 相关 repo

1. **[ahpah-dev/dots-desktop](https://github.com/ahpah-dev/dots-desktop)**：明确声明独立开源、受 OpenAI dots 启发，**非 OpenAI 官方、不含 hosted dots service**。MIT；本地 Dot 配置/工作区/对话/结构化记忆/预算/权限、多个 recurring jobs、durable wakeups；Teamwork 2–8 dots、并行/串行、可选 review、lead 汇总、dot-to-dot consultation；Codex CLI 或兼容 API。[仓]
   - 本地电脑必须开机且 app 运行；内建文件工具的目录约束不是 shell OS 隔离；headless Codex 不能实现交互式逐工具审批，会拒绝需要该模式的配置。
   - README 有 2.3.1 Windows x64 下载；macOS/Linux 为配置层支持，不能等同已发布安装包；只有 2 stars/1 fork 的小样本，不因功能表长就视为成熟首选。README 引用的测试数字对应 2.0.0，不能当 2.3.1 已验收证据。
2. **[pdparchitect/noodle](https://github.com/pdparchitect/noodle)**：自称 dots/Grok Bot/muse/duet alternative，独立产品，见 §6。
3. **[satiricalguru/OpenBot](https://github.com/satiricalguru/OpenBot)**：搜索描述为本地 Ollama、独立电脑与视频知识助手，dots/Grok alternative；本轮只筛到，未深读，不把描述中的“100% local”当审计结果。
4. 排除 **studio-dots-ai / dots.tts** 等 TTS/OCR 模型与 Love Live 角色 bot：不是本次常驻多 agent 桌面产品。

## 3. OpenMausBot

身份：[milind-soni/OpenMausBot](https://github.com/milind-soni/OpenMausBot)，README 自称 early but real 的开源 Grok Bot alternative。[仓]

功能清单：
- macOS、Windows、Ubuntu 桌面；bot 各有 persona/model/instructions/computer/connections，channel 有独立 transcript/工作目录/成员与 responder rules。
- rooms 自动选一个 responder，并可回落 lead；**不能由“有 room”推断每条消息全部 bot 同时回答**。
- Boat 云 Linux、隔离本地 VM，部分平台可控宿主电脑；Composio apps/custom MCP；对外 stdio MCP 可管理 bots/tasks/turns，但刻意不能授予审批、访问凭证、任意改设置。
- one-off / 工作日 / interval 定时、webhook/app event，历史、pause/resume/manual run；interval 重叠会跳过；webhook 本地接收器需要 host 在线。
- reviewed Markdown team 安装、department 包导入；普通导入默认 skills 关闭、routine 暂停、connections 不开，组织库包策略不同。值得借鉴的是**导入不等于立即授权执行**。
- 本地存储 transcript/settings；没有“所有执行中 turn 重启必续”的保证。CLI 某些密钥以权限 0600 的明文 config 保存，不应直接照搬凭证方案。
- 主体 Apache-2.0，enterprise 目录另一许可证；应单独核许可证清单。

公开需求信号：[外部持久 agent 联邦 #2083](https://github.com/milind-soni/OpenMausBot/issues/2083)明确区分“选择 Grok 模型”和“联系一个已有身份/记忆/工具/任务的 Grok Bot”；要求异步派活、进度/问题/完成/失败回调、cancel、信任边界。另有 [群组 timer #3485](https://github.com/milind-soni/OpenMausBot/issues/3485)。两者本次查询为 open，不能写成已有功能。

## 4. Rakazo

身份：[elie222/rakazo](https://github.com/elie222/rakazo)，Apache-2.0，beta；Web/Electron 连接同一 API，可本机 Docker Compose 或自托管。[仓]

功能清单：持久 bot/conversations/memory/routines/history；peer 与临时 subagent 委派；共享电脑；HTTPS MCP/Treg/OpenAPI 接入，可选 Composio/Pipedream；浏览器/终端/文件/图形桌面。服务器 bot 可继续运行；Railway computer stop 保存 portable home、下次 start 恢复。本机 stack 可以 app 关闭后继续跑。

未证实：多人多 bot 同一群聊的准确产品语义、每种运行环境的全量 restart matrix、README 未明确的人审链和 arbitrary skill 自装。

需求信号：[每轮自动召回记忆 #1966](https://github.com/elie222/rakazo/issues/1966)正文说明现默认 retrieval 路径的新线程不会自动触发 memory provider recall，得模型主动调用；希望可选每轮 recall，但需限制成本、超时和不相关事实注入。**这比简单“有 memory”更接近用户真正需要的跨对话能力。** [MCP discovery/page limits #3651](https://github.com/elie222/rakazo/issues/3651)已 closed，提示连接器规模与发现开销也是用户摩擦点，关闭不自动证明已修进当前 release。

## 5. OpenBot（nightly-labs）

身份：[nightly-labs/openbot](https://github.com/nightly-labs/openbot)，与 ashhart/OpenBot、satiricalguru/OpenBot 都不同；macOS/Windows/Linux、headless/Docker、远程 iPhone/browser。[仓]

功能清单：每 agent 独立工作区、conversation/provider session/settings；本地 FIFO crash-safe 队列、pause/resume/cancel；共享频道、owner/delegate/stop/reassign；本地 skill create/read/revise/install，共享库修订不暗改已安装副本；持久 provider session ID、恢复部分 runtime；webhook routine；嵌入浏览器。

两个关键限制：
- [#3172](https://github.com/nightly-labs/openbot/issues/3172)正文明确现 group 的消息交给一个 agent 回答，要求多个角色共同参与，状态 open。README 的“共享频道”不能被扩张成全员自主群聊。
- README 明示本地 provider 使用 unrestricted execution、`approvalPolicy: never`；workspace 不是硬 sandbox。即使另有 MCP consent，**也不能继承为 Hivebot 的默认 shell 安全策略**。仅作为风险评述，不运行或复制该配置。
- 当前 **PolyForm Noncommercial 1.0.0**；≤0.1.11 才保留 Apache-2.0。私用与未来对外分发必须分开核。

需求信号：[打断与 steering #3529](https://github.com/nightly-labs/openbot/issues/3529)、[同 agent 并行处理 Slack/Discord 会话 #5424](https://github.com/nightly-labs/openbot/issues/5424)、[多人在同一会话修正 agent #5703](https://github.com/nightly-labs/openbot/issues/5703)、[reaction 唤醒 #5460](https://github.com/nightly-labs/openbot/issues/5460)。这些来自标题级检索，未逐条复现；#3172 已读正文。

## 6. Noodle

身份：[pdparchitect/noodle](https://github.com/pdparchitect/noodle)，Swift、Apache-2.0，自称 Grok/dots/muse/duet alternative。[仓]

功能清单：命名 bot 的 workspace/role/backstory/history；多 bot 同一 conversation 分工；共享电脑；保留登录态的浏览器 profile；MCP、Mac 工具 app、Calendar/Reminders/Shortcuts、OCR/听写；Codex/Claude Code/OpenCode 等既有 harness 和本地模型；Noodle Hub 在常开 Mac 上托管 bot，手机远控；可产出 Applet。

边界：主套件需 macOS 26 / arm64 下载，Applet macOS 15；iOS 26 TestFlight；“Linux/Windows computer”指 agent 的电脑环境，不等于 Linux/Windows 原生 Noodle host。heartbeats/通知/Shortcuts 不等同已验证 cron scheduler；手机使用需 host 保持醒着，不能作云端无人值守。未验证 shell/文件隔离强度。

## 7. OpenClaw

身份：[openclaw/openclaw](https://github.com/openclaw/openclaw)，MIT；本地 Gateway + 多消息渠道/设备 companion，不宜笼统叫 Grok Bot UI clone。[仓/官文档]

功能清单：多个独立 agent，workspace/agentDir/auth/session store 隔离；按 channel/account/peer 路由；多 messaging connector；tools/skills/plugins、ClawHub；`openclaw automations` 持久 job，可 main/current/isolated/custom session，投递 chat/webhook；设备 camera/screen/voice 等节点。

- [多 agent 官方文档](https://docs.openclaw.ai/concepts/multi-agent)：跨 agent session 访问、agentToAgent 和 sessions.visibility；subagents.allowAgents 定委派对象；团队 preset 是 coordinator→specialists 的 hub-and-spoke，`delegationMode: prefer` 是提示，不是调度保证。
- [定时文档](https://docs.openclaw.ai/automation/cron-jobs)：明确 job 持久，但本次取得的是导航型页，**未证实**重启漏跑到底补发、跳过还是重放。
- workspace 仅 cwd、不是 hard sandbox；主 session host 工具除非另配 sandbox；DM pairing 防陌生发信者，不等于每个 exec 都审批。不得搬其默认宽授权。

公开问题：[多 agent 并发配置覆盖/锁超时/脱离子进程 #43367](https://github.com/openclaw/openclaw/issues/43367)有四 worktree 的具体复现；16 comments，现 closed / `not_planned`，相关修复链接存在但不据此断言全链已修。重点需求是“失败后仍能知道谁在运行、取消真的收掉、并发不覆盖配置”。另有 [Agent Teams #10010](https://github.com/openclaw/openclaw/issues/10010)（closed，14 comments）与 [restart recovery 回归 #118839](https://github.com/openclaw/openclaw/issues/118839)（open，14 comments）。

## 8. Happy

身份：[slopus/happy](https://github.com/slopus/happy)，MIT；该仓含移动/Web 客户端、原 CLI、relay；桌面客户端在独立 `happy-desktop` 仓，运行在 `happy-agent` 上。定位更接近远程 coding sessions/agent harness，不是从一开始就有 Grok 式人格 bot 名册。[仓]

功能清单：Claude/Codex/Grok 等既有订阅或 ACP agent；手机接管终端会话、push、多人 watch/steer、子 agent 委派。README 宣称 E2EE 只是作者安全主张，本轮未做协议/身份认证审计，尤其**不得照抄项目已列入禁例的凭公钥领 token 设计**。

未证实：完整的长期人格 bot 生命周期、自装 skill/插件、cron、任意 app 重启恢复。主要信号不是模型数量，而是会话连续性：
- [历史 Claude/Codex session 从 app 恢复 #147](https://github.com/slopus/happy/issues/147)：已读正文，open，5 comments / 6 rocket reactions。
- [不经移动 app 管理的 session 也要通知 #78](https://github.com/slopus/happy/issues/78)：open，6 comments。
- [自定义 session 名称 #290](https://github.com/slopus/happy/issues/290)：open，6 comments。
- [跨 session 语音控制/项目切换 #305](https://github.com/slopus/happy/issues/305)：open，4 comments。
- [remote→local 丢原会话 #932](https://github.com/slopus/happy/issues/932)：closed，3 comments；不是已确定现版仍坏。

## 9. ChatGPT desktop 的 agent mode（与 dots 分开）

身份：2025-07 的 ChatGPT agent 模式，ChatGPT 内的任务执行能力，不是独立开源桌面 bot runtime。[官方入口](https://openai.com/index/introducing-chatgpt-agent/)本次 403；[发布时媒体报道](https://www.testingcatalog.com/openai-unveils-agent-mode-in-chatgpt-for-complex-task-handling/)、[当日直播摘要](https://www.tomsguide.com/news/live/openai-july-17-announcement)、[权限与交互报道](https://www.thurrott.com/a-i/323508/new-chatgpt-agent-can-perform-complex-tasks-on-its-own)供核查。

已报道基础能力：虚拟电脑、visual/text browser、terminal、代码执行、文件与 slides/spreadsheets 产出、邮箱/文件等连接器；重要外部动作前确认；用户可 interrupt/redirect/take over；完成的任务可安排 recurring。**这些是发布时基线，不是 2026-11 当前产品可用性承诺。** 本轮未确认命名多 bot 名册、任意 bot 间群聊、用户可装自定义 runtime plugin。不要把 Codex 的 multi-agent 内部执行自动标成 ChatGPT 桌面多 bot 产品。

## 10. 用户最常要什么：公共讨论信号（非统计排行）

检索为目标关键词抽样，部分按 comments 降序；没有抓完整 issue 总集，**不能声称全市场“最常要”排名**。以下是跨产品反复出现、可回访的需求簇；机器人提交、AI 生成 issue 和单用户长建议也不能当广泛民意。

| 需求簇 | 可追溯信号 | 给 Hivebot 的研究提示（不是实现决定） |
|---|---|---|
| 真正多角色同场协作，而非一个群聊外壳 | OpenBot #3172（已读正文）；OpenClaw #10010；OpenMausBot #2083 | 把成员、owner、谁能回答、交棒、回报分别定义；不要单靠多头像判断完成。 |
| 跨产品“已有 agent”联邦 | OpenMausBot #2083（已读正文） | 模型路由、subagent、独立 personal bot、远端 external agent 是四层不同对象。 |
| 历史 session 可接续、稳定身份 | Happy #147/#932；OpenClaw #118839 | 先区别数据恢复、provider session 恢复、进行中副作用恢复。 |
| 跨线程记忆真能自动生效 | Rakazo #1966（已读正文） | 除保存/检索工具，还要测新 thread 是否自动带入偏好，考虑成本/无关注入。 |
| 打断、纠偏、cancel 后不留活 | OpenBot #3529；OpenClaw #43367（已读具体复现） | 展示真实运行态；不要把 UI stopped 等同子进程停止。 |
| 定时/事件唤醒与通知的可靠性 | OpenMausBot #3485；Happy #78；OpenBot #5460；dots 媒体试用提醒过晚 | trigger/delivery/主机离线/错过执行应分别描述。 |
| 多会话可识别与并发 | Happy #290/#305；OpenBot #5424/#5703 | 命名、会话归属、并行容量、多人纠偏比“模型下拉框更多”更接近产品使用问题。 |
| 权限细粒度与审批疲劳 | dots 10-26 试用；Grok 安全文档；OpenBot 宽授权警示 | read-only、一次授权/长期授权、可信工具边界不应合成一个全局 auto 开关。 |

## 11. Hivebot 视角：竞品功能对照大表

口径：`✓`=官方/README 明确列出，**不是本轮实测**；`△`=部分、受限或有相反证据；`愿景`=不是已交付；`?`=本次未证实；`本地`=要 host 在线。Hivebot 是按本地文件的**默认产品可达性**打分，不把未开放代码算已交付。

### 11.1 闭源本体与主要开源替代

| 功能 | Grok Bot | OpenAI dots | ChatGPT agent 基线 | OpenMausBot | Rakazo | nightly OpenBot | Hivebot 目前有没有 |
|---|---|---|---|---|---|---|---|
| 桌面入口 | ✓ Win/Mac/Linux | ✓ ChatGPT 内 | ✓ ChatGPT 内 | ✓ Win/Mac/Ubuntu | ✓ Electron/Web | ✓ Win/Mac/Linux | ✓ Electron |
| 多个命名持久 bot | ✓ | △ primary/specialist 叙述 | ? | ✓ | ✓ | ✓ | ✓ 名册/人格/独立会话 |
| bot 知道同伴与建 bot 路径 | ✓ 协作产品叙述 | ? | ? | △ 路由/编排 | △ 委派 | △ 通信/编排 | ✓ T33；真实回复旁证见近期日志 |
| 独立 bot 间委派/发消息 | ✓ | 愿景/未确认同等交付 | ? | ✓ 内部；联邦仍请求 | ✓ peer/subagent | ✓ | △ 代码已建，默认闸门未开；P6-14b/T34 |
| 同一群聊多 bot 自主协作 | ✓ 公告明说 | 愿景 | ? | △ room responder rules | ? | △ 当前单消息单 responder，#3172 | 未交付 Room；L12 仍需产品胶水 |
| 临时内部 subagent | △ 公开工具线索 | △ Codex 来源，不等同多 bot | △ 与产品 bot 分开 | ✓ | ✓ | △ 各 harness/委派 | ✓ 默认 subagent；可视化 T27 未交付 |
| 可用 connectors/MCP | ✓ | ✓ 连接已有 apps | ✓ 发布基线 | ✓ | ✓ | ✓ | ✓ 连接器/按 bot 绑定；不声称目录规模相当 |
| bot 任意自装插件（非仅调用已有） | ? | ? | ? | △ 用户配置/包导入 | △ 用户集成入口 | △ skill 可安装≠任意插件 | △ skill 自存可用；无证据支持任意 runtime 插件自装 |
| skill 库、按 bot 启用 | △ routine/plugin，权限语义不同 | ? | ? | ✓ 团队/skill 包 | ? README 未详述 | ✓ 版本/快照 | ✓ T6/T7 链；启用=复制快照 |
| 演示转 routine | ✓ 公告宣称 | ? | ? | △ routine，不证示教 | △ routine，不证示教 | △ routine，不证示教 | 未证实示教产品链 |
| 定时执行 | ✓ 媒体/产品资料 | △ 次级案例 | ✓ 发布基线 | ✓ | △ routine，细节不足 | △ routine/webhook，细节不足 | ✓ dsh schedule；不等同完整自动化管理 UI |
| 外部事件/webhook | ? 本轮未查清 | △ 主动监测，非 webhook 证明 | ? | ✓ host 在线/中继要求 | ? | ✓ host 在线 | △ dsh 插件存在，bot 映射仍需胶水 |
| 跨对话长期记忆 | △ 记忆承诺，范围须核 | △ 单持续线程；跨独立对话未知 | ? | △ thread history | △ 有记忆，但自动 recall 有缺口 | △ 持久 conversation/compaction | △ 不把会话持久误算为自动跨对话召回；本轮未验此链 |
| 关本机继续干活 | ✓ 云端 | ✓ 云端报道 | ✓ 云端任务基线 | △ 云端/需客户端链路分别看 | ✓ server-hosted | △ headless host 必须在线 | △ SSH 远端能力有，不能承诺 SDK 退出后仍自主调度 |
| app 重启后配置/会话仍在 | ✓ disk/sessions，非逐工具保证 | △ persistent 服务，不详契约 | ? | ✓ 配置/数据 | ✓ bot/memory；部分电脑 home | ✓ 数据/队列/provider session | ✓ 持久 bot/连接器 preset ensure；非执行中 turn 重放保证 |
| 中断任务自动续跑且不重副作用 | ? | ? | ? | ? | ? | △ crash-safe queue，非全 turn 保证 | 未证实；SSH 断开有提示，不自动重连 |
| SSH 断连一键重连/服务重启 | ? | ? | ? | ? | ? | ? | 未交付；Q-034/T12b 等用户，当前手动重开 |
| shell/外部动作人审 | ✓ 多层但有例外 | △ 有审批/粒度摩擦 | ✓ 发布基线 | ✓ inline Allow/Deny | ? README 未详述 | △ 本地 unrestricted，不能当逐调用保护 | ✓ 审批/隔离链；不继承他家宽默认 |

### 11.2 另三项直接参考候选

| 功能 | ashhart/OpenBot | Dots Desktop（非官方） | Noodle | Hivebot 差距/不可误算 |
|---|---|---|---|---|
| 独立持久 bots | ✓ | ✓ | ✓ | 已有 |
| 多 bot 同聊/交棒 | ✓ @点名、bounded handoff | ✓ Teamwork 2–8、consult | ✓ README 分工案例 | Room 未交付；主 bot 委派默认未开 |
| skill/MCP/连接器 | ✓ SKILL.md 库；可安装 | △ 自定义 tools/providers；未证 MCP 目录 | ✓ MCP/Mac tools | skill 库已有；不要混成任意插件自装 |
| 定时/后台 | △ routine replay，无 cron 证明 | ✓ recurring + wakeups，本地 | △ heartbeat/Shortcuts | dsh schedule 有；事件到 bot 映射部分待接 |
| 恢复 | ✓ JSON/VM files；turn 重启未知 | ✓ durable jobs/Teamwork 部分断点 | △ history/host 在线 | 保存配置与恢复进行中动作要分别验 |
| 用户审批/隔离 | ✓ ask 默认；host 执行无 OS sandbox | ✓ API tools；Codex headless 有审批限制 | △ 可配置文件访问，未验隔离 | 不能因桌面相似放宽 Hivebot 硬约束 |
| 分发与成熟度限制 | MIT，0.1.0 early | MIT，小样本，已发布 Win x64 为主 | Apache-2.0，Mac 新系统要求 | 均是候选资料，不是本报告准入背书 |

### Hivebot 本地判断锚点

- `/home/lingxufeng/bot/work/HANDOFF.md`：现有 UI/skill/SSH 工单收口摘要、T27/Q-034 待办。
- `/home/lingxufeng/bot/work/tickets/queue.md`：T33 产品认知、T34 代建 bot、T27 呈现、T12b reconnect 状态；队列与 QUESTIONS 部分行有不同步，以默认链仍未开和最终答复分开看。
- `/home/lingxufeng/bot/work/p6-orchestration/PLAN.md`：P6-14b default orchestration gate blocked；不要把 create/send/stop 已写好说成用户现可使用。
- `/home/lingxufeng/bot/work/p9-dsh-integration/PLAN.md`：L5 schedule/webhook、L12 Room、skill 复用/验收记录。
- `/home/lingxufeng/bot/work/QUESTIONS.md`：Q-008 连接器 preset 重启恢复；Q-034 reconnect；Q-035/Q-036 编排与 subagent 的区别及用户后续答复。

### 可直接接着查的最小顺序（不实施）

1. 需要原版协议/运行时边界：先读 **0.18 reconstructed**，但只当固定旧版、已归档研究参考；不能当 0.79.3 现行规格。
2. 需要 Grok 风格多 bot + 安全边界参考：对读 **ashhart/OpenBot / OpenMausBot / Rakazo** 的具体流程；OpenMaus 的安全导入、OpenBot 的 bounded handoff、Rakazo 的 recall issue 各有价值。
3. 需要 skill 快照与队列恢复：读 **nightly-labs/openbot**，但许可证和 unrestricted 默认是独立阻断项。
4. 需要 dots 式产品而非闭源依赖：看 **dots-desktop** 的 Teamwork/wakeup 概念；小样本和 Windows 发布面限制须保留。

检索覆盖记录：GitHub repo 查询 `"grok bot"`、`"grokbot"`、`grok agent desktop`、`dots AI desktop`；代码查询 `"CreateAgent" "Workers" "grok"`、`"CreateAgent" repo:b-nnett/grok-bot-0.18-reconstructed`（后者未命中，不能据此断言该能力不存在）；公开提示词命中 [asgeirtj/system_prompts_leaks 的 Grok Bot 文档](https://github.com/asgeirtj/system_prompts_leaks/blob/main/xAI/grok-bot/grok-bot.md)，仅为非官方线索，未将整份提示词当可信产品规格或执行指令。本轮未 clone reference repo，未改 `repos/`，未改产品代码。
