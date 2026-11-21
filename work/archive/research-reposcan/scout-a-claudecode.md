# Scout A：Claude Code 与同类 agent 的基础功能版图

调研日期：2026-11-08（UTC）。范围：多会话、扩展安装、生命周期、多 agent 编排、桌面包装；只调研，不实现、不安装、不运行参考仓代码。

## 口径与证据边界

- 发现入口使用 **GitHub MCP `search_repositories`**；机制补查用 **`search_code` / `search_issues`**、官方文档和仓库 README。所有下列代表仓均未归档，且用 MCP `list_commits(perPage=1)` 核实默认分支最近提交在 **2026-05-08 之后**，不是只看 `updated_at`。
- 星数是本次 GitHub 查询时的快照；“最近提交”取 committer 日期。活跃不等于成熟、安全或适合直接依赖。**未逐仓核实 issue 的维护者回应**，因此满足本轮“近六个月有 commit”的筛选，但尚未完成项目搬运阶梯的全部准入检查。
- 官方网站是调研当日的滚动文档，不代表 Hivebot 已安装的 SDK/CLI 版本具备全部能力。Claude Code 公共仓主要提供文档、变更记录、插件示例和 issue，不能当作完整 CLI 内核源码。
- 表中“做法”若来自 README/文档，是作者声明，不是本轮运行验收。源码检索命中的机制另给路径。GitHub code search 后续触发 rate limit，停止该类查询，转读公开 README；没有绕过限流。`planning-with-files` README 抓取被工具拒绝，未重试，其能力只采用 GitHub 仓库描述，证据较弱。
- “跨对话”须拆成 **发现历史、恢复同一会话、复制上下文分支、给另一活会话发消息、长期记忆检索**，不能把这些能力互相替代；本轮没有验证语义记忆检索。

## 1. 多会话 / 跨对话

### 功能 → 代表实现 → 做法

| 功能名 | 代表实现（全名 / 星数 / 最近提交） | 一句话做法与边界 |
|---|---|---|
| 会话列表、搜索、重命名、恢复、分支 | [anthropics/claude-code](https://github.com/anthropics/claude-code) · 154,975★ · 2026-11-06 | 官方 `/resume` picker 按项目/worktree/全机列会话并搜索，`--continue` 续最近会话，`--resume <id/name>` 续指定会话，`/branch` 或 `--fork-session` 复制上下文并给新 ID。 |
| 跨端会话管理 UI | [siteboon/claudecodeui](https://github.com/siteboon/claudecodeui) · 14,502★ · 2026-11-07 | CloudCLI 自托管 Web UI 发现本机 Claude 会话，提供多会话、历史、恢复与浏览器/手机入口；共享原生会话配置，不是独立重写一个 agent 内核。 |
| 跨终端、多供应商 agent 通信 | [aannoo/hcom](https://github.com/aannoo/hcom) · 645★ · 2026-10-21 | hooks 把活动和消息写入本地 SQLite，再由接收方 hooks 投递，实现不同终端里的 Claude/Codex 等相互 message/watch/spawn。 |

**官方特性细分**（同属上述 `anthropics/claude-code`，不重复计仓）：

- **活会话发现与点对点消息** → `ListAgents` + `SendMessage` → 同机通过每会话 Unix socket / Windows named pipe，不经 Anthropic；跨机依赖 Remote Control 和账户条件。官方文档要求 macOS/Linux ≥2.1.224、Windows ≥2.1.234；部分 provider/关闭 flag fetching 的同机场景 ≥2.1.248。
- **收到消息后继续工作** → 忙时工具调用之间读入，闲时触发新 turn → 消息是纯文本，不自动带历史、文件附件或执行 slash command。
- **空闲一次性通知** → `notify_when_idle` → 不轮询，对方下一次 idle/exit 回一条通知；适用于同机主会话之间，有版本和时限约束。
- **后台独立会话** → agent view / `claude agents` / attach → 区别于同一会话里的后台 subagent；恢复一个仍活着的后台会话可直接 attach，而非重复运行同一 transcript。
- **Agent teams** → lead + 独立上下文 teammates + 共享任务板 + mailbox → 支持互发消息、任务依赖、领取任务；默认关闭，需 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`，仍是实验特性。
- **权限边界** → inbound accept/hold/refuse + 接收方自己的工具权限 → peer 的请求不是用户授权，不得借别的会话完成本会话被拒绝的操作；跨机消息还可强制出机前审批。

**不能混淆的限制**：Agent teams 的 in-process teammates **不会随 `/resume` / `/rewind` 恢复**；会话恢复并不意味着整支团队恢复。对普通 subagent，官方文档另有保留 transcript 并在同一恢复会话内继续的机制。SDK / `-p` 会话默认不出现在普通 session picker，也不等于未持久化。

证据：
- [官方 sessions](https://code.claude.com/docs/en/sessions)
- [官方 cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging)
- [官方 agent teams](https://code.claude.com/docs/en/agent-teams)
- [CloudCLI README](https://github.com/siteboon/claudecodeui/blob/main/README.md)
- [hcom README：hooks → db → hooks](https://github.com/aannoo/hcom/blob/de33e31a0cdbba4c5863f7cc050d8b79aa50bcdf/README.md)

## 2. 自装插件 / 技能 / 自更新

### 功能 → 代表实现 → 做法

| 功能名 | 代表实现（全名 / 星数 / 最近提交） | 一句话做法与边界 |
|---|---|---|
| 官方 plugin marketplace | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) · 46,433★ · 2026-11-06 | 用 `.claude-plugin/marketplace.json` 登记插件来源，插件作为 skills、agents、hooks、MCP 等组件的版本化安装单元。 |
| 标准化 skill 内容与示例 | [anthropics/skills](https://github.com/anthropics/skills) · 189,323★ · 2026-11-06 | 用目录里的 `SKILL.md` 描述触发条件和工作指令，需要时加载正文，支持附带脚本/资源；这是内容/格式生态，不是完整安装器。 |
| 第三方跨工具 skill 包管理 | [vercel-labs/skills](https://github.com/vercel-labs/skills) · 38,582★ · 2026-11-06 | `npx skills` 提供 add/list/check/update/remove，也支持 `use <source>@<skill>` 临时使用，把 skill 管理从单一 agent 产品抽出来。 |
| 桌面 skill 管理器 | [farion1231/cc-switch](https://github.com/farion1231/cc-switch) · 152,734★ · 2026-11-08 | Tauri/Rust + React 的技能面板从 GitHub/ZIP/skills.sh 发现安装，按工具启停并用 symlink/copy 分发，更新/删除前备份。 |
| 官方管理的社区目录（补充生态入口） | [anthropics/claude-plugins-community](https://github.com/anthropics/claude-plugins-community) · 4,836★ · 2026-11-08 最近 push（未独立核 default-branch commit） | 社区插件只读镜像，投稿走目录提交入口；官方默认注册 official marketplace，不默认注册 community。此行为目录补充，不计入上述已核 commit 的代表仓。 |

**官方安装闭环**：

1. **发现/审阅** → `/plugin` Discover → 显示将增加的组件；官方市场还提供上下文成本估计。
2. **登记来源** → `/plugin marketplace add owner/repo` → 市场本质是 catalog，可来自 Git/GitHub、本地目录或托管 JSON；支持 ref 固定。
3. **安装与范围** → shell `claude plugin install <name>@<marketplace> --scope user|project|local` → 项目设置里的 enabled 不代表协作者机器已经下载。
4. **启停/移除/检查** → `claude plugin list/enable/disable/uninstall` → 安装状态、启用状态、磁盘内容、当前会话加载状态是不同层次。
5. **热加载** → `/reload-plugins` → 新插件可能即时生效，也可能需要 reload；不能笼统要求整个 app 重启，reload 可能打破 prompt cache。
6. **更新** → `claude plugin update <plugin>@<marketplace>`；marketplace 可独立开自动更新 → official 默认多数开启，第三方/community 默认关闭；运行会话保持已经加载的版本，reload/下次启动才切换。
7. **市场更新 ≠ 插件更新** → shell `claude plugin marketplace update` 刷新市场列表，不保证升级已安装插件；UI 的 Update marketplace 行为还包括更新来源插件，不能仅凭命令名推断。
8. **客户端自更新是另一层** → `claude update` 更新 CLI，本身不等于 skill/plugin update。

**“agent 自己安装”应如何理解**：有可脚本调用的 shell installer，因此能接到 agent 的工具链；但官方资料不支持“模型不经授权任意安装并自动扩大权限”的结论。安装的 hooks/MCP 能以当前用户身份执行代码，必须保留来源、版本、作用域、用户授权和撤销入口。技能文本、含可执行脚本的技能、MCP/插件不能共用一个风险等级。

证据：
- [官方 plugins overview](https://code.claude.com/docs/en/plugins)
- [官方 install/manage/update](https://code.claude.com/docs/en/plugins/install)
- [官方 CLI reference](https://code.claude.com/docs/en/cli-reference)
- [vercel-labs/skills README](https://github.com/vercel-labs/skills/blob/d3701c11b1101251af14c9d148f026e1a47ebe17/README.md)
- [CC Switch README](https://github.com/farion1231/cc-switch/blob/main/README.md)

## 3. 重启 / 恢复 / 断线重连

### 功能 → 代表实现 → 做法

| 功能名 | 代表实现（全名 / 星数 / 最近提交） | 一句话做法与边界 |
|---|---|---|
| CLI 进程重开后恢复会话；远程断线恢复 | [anthropics/claude-code](https://github.com/anthropics/claude-code) · 154,975★ · 2026-11-06 | 持续保存 transcript，重启后 resume；Remote Control 保留本地执行进程并重连传输，远端服务模式的 crashed session 可由下一条消息重新服务。 |
| 网关服务重启、崩溃后的 root 续跑 | [openclaw/openclaw](https://github.com/openclaw/openclaw) · 394,186★ · 2026-11-08 | SQLite run identity + boot ledger 判断中断 root，优雅重启记录待处理输入，启动后注入 continuation 并按序接回输入，而不是重放旧工具调用。 |
| 手机/桌面与 agent 链路重连 | [slopus/happy](https://github.com/slopus/happy) · 24,543★ · 2026-11-08 | Socket/同步引擎恢复连接后重新登记 RPC handler、补取遗漏状态，并提供手动立即 reconnect 以跳过退避等待；不把 UI 断线直接等同于杀掉 agent。 |
| 长任务的可读状态恢复 | [OthmanAdi/planning-with-files](https://github.com/OthmanAdi/planning-with-files) · 27,951★ · 2026-11-07 | 仓库描述声明以文件化计划对抗 `/clear`、compaction 和中断后的上下文丢失；属于计划/进度恢复，不应理解为恢复进程或 exactly-once 执行（README 未取到，需二次核实）。 |

**必须拆开的生命周期操作**：

- **重新连 UI/网络**：执行器仍在则 reconnect / 状态补同步，不重启执行器。Claude Remote Control 交互模式在网络恢复后自动续连；server mode 长断网约十分钟可退出，不能套用同一个超时策略。
- **重载 skill/plugin/config**：尽量 reload；提示“已安装但当前会话尚未加载”，而不是静默不生效。
- **重启 agent/SDK 服务**：先持久当前 run 和输入、明确停止原因，再服务级重启并按 session ID 恢复；旧工具副作用不自动重放。
- **重启桌面 app**：需区分关闭窗口、退出 app、停止后台服务/任务；界面重开应能重新附着，而不是复制一份运行。
- **机器重启**：本轮没有执行，亦不建议作为 agent 自主工具；产品的“重启能力”先限制为自有服务级。

**恢复的可信边界**：OpenClaw 文档明确不还原执行快照、不独立复活 subagent/background process、不保证 exactly-once；continuation 需要核查已经发生的外部副作用，并重新校验当前权限。Claude resume 不自动重跑被中断的 tool call，也不复活 background Bash/monitor。仅“聊天记录还在”远不等于“任务安全续跑”。

证据：
- [Claude sessions：what a resumed session restores](https://code.claude.com/docs/en/sessions)
- [Claude Remote Control：reconnection / crashed sessions / limitations](https://code.claude.com/docs/en/remote-control)
- [OpenClaw restart recovery](https://github.com/openclaw/openclaw/blob/main/docs/gateway/restart-recovery.md)
- [OpenClaw service gateway](https://github.com/openclaw/openclaw/blob/main/docs/gateway/index.md)
- [Happy realtime sync/RPC](https://github.com/slopus/happy/blob/44feb06f2153662bf885c1b9713452d37ffeb48d/docs/realtime-sync-and-rpc.md)
- [Happy SyncEngine](https://github.com/slopus/happy/blob/44feb06f2153662bf885c1b9713452d37ffeb48d/packages/happy-ios/Sources/HappyCore/AgentConnection/SyncEngine.swift)

## 4. Subagent / workflow / 多 agent 编排

### 功能 → 代表实现 → 做法

| 功能名 | 代表实现（全名 / 星数 / 最近提交） | 一句话做法与边界 |
|---|---|---|
| 委派 worker、teams、脚本化 workflow | [anthropics/claude-code](https://github.com/anthropics/claude-code) · 154,975★ · 2026-11-06 | Agent 工具创建独立上下文 worker，teams 协调会话 peers；dynamic workflow 用 JS `agent()/parallel()/pipeline()` 把扇出、分支和中间结果放进脚本运行时。 |
| 带验证/修复循环的团队工作流 | [Yeachan-Heo/oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) · 40,687★ · 2026-11-08 | Claude 插件定义 `team-plan → team-prd → team-exec → team-verify → team-fix`；原生 Team 与 tmux 外部 CLI workers 两条入口，状态/日志落 `.omc/`。 |
| 桌面协调器 + 隔离 workers | [stablyai/orca](https://github.com/stablyai/orca) · 119,081★ · 2026-11-08 | coordinator 拆任务并拉起独立 workspace/worktree workers 汇总结果，同一界面管理聊天、CLI、终端和 diff；README 未解释调度/恢复内部实现。 |

**基础原语应该逐一对齐**：

- **Task / Agent 不同名同类历史**：旧资料把启动 subagent 的工具叫 Task；当前官方文档叫 Agent；`TaskCreate/TaskUpdate/TaskList` 则是任务板，不是“运行子代理”的同一工具。
- **角色定义**：agent Markdown frontmatter 定模型、tools、skills、隔离等；普通新 worker 不带主会话全部历史，fork 才复制上下文。
- **前后台与继续工作**：后台结果通知、查看 transcript、取消；`SendMessage` 可继续已有可恢复 worker，避免每次新建丢掉调查上下文。
- **隔离与资源**：worktree 分离文件写入、并发/预算上限、每任务模型选择；权限不因 subagent 自动放宽。
- **显式编排状态**：任务依赖、blocked/working/completed/failed、验证关卡、有限次修复，而非只在 prompt 里说“你们合作”。
- **workflow 恢复**：官方保存已完成 agent 结果，同一恢复会话可重启脚本并复用结果；失败/提示发生变化后，后续已完成项也可能重跑。不是持久化事务引擎，必须防副作用重复。

**负面旁证（不是已确认复现）**：MCP `search_issues` 找到 [Claude #23620](https://github.com/anthropics/claude-code/issues/23620)（team lead compaction 后丢队伍，open，2026-11-05 更新）与 [#98252](https://github.com/anthropics/claude-code/issues/98252)（named teammate 污染 resumeSessionId 的报告，open，2026-09-29 更新）。本轮只核标题/状态，没有复现，作用是提醒验收要覆盖“压缩/断连/重启 × 多 worker”，不能把 issue 标题当已证实根因。

证据：
- [官方 subagents](https://code.claude.com/docs/en/sub-agents)
- [官方 dynamic workflows](https://code.claude.com/docs/en/workflows)
- [官方 teams](https://code.claude.com/docs/en/agent-teams)
- [OMC README](https://github.com/Yeachan-Heo/oh-my-claudecode/blob/main/README.md)
- [Orca README](https://github.com/stablyai/orca/blob/main/README.md)

## 5. 桌面化封装 / CLI 外壳

### 功能 → 代表实现 → 做法

| 功能名 | 代表实现（全名 / 星数 / 最近提交） | 一句话做法与边界 |
|---|---|---|
| 以真实 CLI 为内核的 Conductor 类桌面台 | [simion/termic](https://github.com/simion/termic) · 329★ · 2026-11-08 | Tauri/Rust + xterm.js PTY 直接启动已安装 CLI，无 SDK 中间层，任务配 worktree，agent tabs 可自动 resume；README 自称开源 Conductor.build 替代。 |
| 多端 agent 遥控/管理 | [slopus/happy](https://github.com/slopus/happy) · 24,543★ · 2026-11-08 | 应用与运行端通过实时同步/RPC 管理会话，手机/桌面可以接续操作；可借鉴 UI 与连接生命周期，鉴权必须独立审计。 |
| gateway + 多平台客户端助手 | [openclaw/openclaw](https://github.com/openclaw/openclaw) · 394,186★ · 2026-11-08 | 常驻 gateway 分离客户端和 agent/channel 生命周期，原生/网页只是入口；不是单纯把 Claude CLI 嵌进 Electron。 |
| 桌面扩展/配置控制面 | [farion1231/cc-switch](https://github.com/farion1231/cc-switch) · 152,734★ · 2026-11-08 | Tauri 2 + Rust + React + SQLite 管多 CLI 的 provider/MCP/skills 配置；是辅助控制面，不等同于完整聊天执行外壳。 |
| 桌面并行 agent 工作台 | [stablyai/orca](https://github.com/stablyai/orca) · 119,081★ · 2026-11-08 | 同屏 chat/raw CLI、终端、浏览器、diff 与 worktrees；远程 SSH/cloud runtime 让执行器和笔记本睡眠解耦。 |

**Conductor 消歧**：本轮 `search_repositories` 未找到可确认的 `meltylabs/conductor` 公共实现，不能杜撰 star/源码。搜索中的 `conductor-oss/conductor` 是工作流引擎，`gemini-cli-extensions/conductor` 是 spec-driven 插件，都不是 Conductor.build 桌面 app；本节用已核实的 `simion/termic` 代表同类开源路线。

**对 Hivebot 的架构启示**：优先复用当前 dsh 执行器与已有桌面壳，补“会话/任务/安装/生命周期控制面”，不为追求某个桌面外形而替换内核。Happy 的公钥领 token、OpenClaw 的 exec 默认不审批是项目已有明确安全反例；本轮不复用这些权限设计，也没有重审其最新安全状态。

证据：[Termic README](https://github.com/simion/termic/blob/main/README.md)、[Happy](https://github.com/slopus/happy)、[OpenClaw](https://github.com/openclaw/openclaw)、[CC Switch README](https://github.com/farion1231/cc-switch/blob/main/README.md)、[Orca README](https://github.com/stablyai/orca/blob/main/README.md)。

## 6. Hivebot 视角的功能清单建议

“我们有没有”只按已读项目记录保守填写，**不是重新跑产品验收**。有＝记录明确已有；部分＝已有底座但完整产品链未证明；待核＝当前材料不能判定，不冒充没有。优先级是 scout 建议，不是立项授权；已有项的“高”表示应保留为基础验收，不是要求重写。

本地依据：
- `/home/lingxufeng/bot/work/HANDOFF.md`：2026-11-07 最新快照，T7b skill picker、T7c 写入审阅卡等完成链；Q-034（SSH 断连后整体/SDK 重启或不做）仍等用户；T27 编排等研究结论。
- `/home/lingxufeng/bot/work/p9-dsh-integration/PLAN.md:19-32,42-45`：名册/持续会话、主 bot 委派、SKILL.md 底座、MCP 市场、独立顶层 bot session、Room/跨设备的边界。
- `/home/lingxufeng/bot/work/QUESTIONS.md:73-94`：preset.ensure 重启恢复、3 session 并发与历史验收记录。

### 多会话与通信

| Checklist / 功能 | 我们有没有 | 建议优先级 |
|---|---|---|
| - [ ] 多 bot/会话列表与持久会话 | 有：名册 + session persistence；完整搜索体验待核 | 高 |
| - [ ] 按标题/内容搜索、重命名与最近会话恢复 | 部分：会话底座有，搜索/命名/恢复入口需盘点 | 高 |
| - [ ] 从指定会话 fork 上下文，不混写原历史 | 待核 | 中 |
| - [ ] 跨 bot 活会话发现、ID/名称寻址 | 部分：名册与独立 session 有，统一 live registry 待核 | 高 |
| - [ ] 主 bot 委派/子 bot 回报 | 部分：P6/P7 有实现与闸门，不等于全量可用 | 高 |
| - [ ] bot 对 bot 点对点消息、闲时唤醒 | 部分：跨 bot 编排底座有，通用 peer mailbox 未确认 | 高 |
| - [ ] 忙/闲/离线/失败状态 + 一次性完成通知 | 部分：任务/UI 底座有，统一语义待核 | 高 |
| - [ ] peer 消息与用户授权严格分离 | 有安全/审批底座；跨会话消息专项待核 | 高 |
| - [ ] 多 bot Room / 多人共享任务板 | 规划/待做：p9 L12 不是现有 liveshare | 中 |
| - [ ] 跨历史语义记忆检索 | 待核；不能用会话 resume 冒充 | 低 |

### 自装扩展与技能

| Checklist / 功能 | 我们有没有 | 建议优先级 |
|---|---|---|
| - [ ] Skill 库、按 bot 启停/快照、skill picker | 有：T7 系列与 HANDOFF 完成记录 | 高 |
| - [ ] agent 提议/写入 skill → 用户审阅 → 生效 | 有相关写入审阅卡；完整提议入口仍需按产品核对 | 高 |
| - [ ] 搜索市场 → 查看来源/组件 → 安装连接器 | 部分：MCP 市场 UI + wrapper 已有；通用 plugin 市场非同一能力 | 高 |
| - [ ] agent 自主发起安装请求，用户审批后执行 | 待核；不等于现有人工市场安装 | 高 |
| - [ ] 安装版本/ref、范围、来源、能力/权限预览 | 部分：连接器已有；统一扩展清单与固定版本待核 | 高 |
| - [ ] 已安装/已启用/当前已加载状态分开显示 | 待核 | 高 |
| - [ ] reload 技能/插件，不强制重启整个 app | 部分：dsh skill 文件变化刷新底座有，产品提示待核 | 高 |
| - [ ] 扩展更新检查、手动升级、删除/回滚 | 待核；有库不代表有版本管理 | 中 |
| - [ ] 自动更新按来源开关，默认不静默升级高风险代码 | 待核 | 中 |
| - [ ] app/SDK 自更新与插件更新分层、失败回退 | 待核 | 中 |
| - [ ] 临时使用 skill、不永久安装 | 待核 | 低 |

### 生命周期与恢复

| Checklist / 功能 | 我们有没有 | 建议优先级 |
|---|---|---|
| - [ ] 重开 app 后历史/连接器 preset 恢复 | 有：JSONL + preset.ensure 的历史验收记录 | 高 |
| - [ ] 网络/SSH 断连可诊断，连接重试不重复启动执行器 | 部分：SSH 已接入；断连后恢复方案 Q-034 待用户，不预判实现 | 高 |
| - [ ] UI 重新附着运行中的任务，而非重建一次任务 | 待核 | 高 |
| - [ ] 取消单任务 / 优雅停止 bot / 停止 SDK 分层 | 部分：已有生命周期底座，统一产品动作待核 | 高 |
| - [ ] 仅自有 agent/SDK 服务重启入口 | 未定：Q-034 待用户；不得扩展为机器重启 | 高（先定语义） |
| - [ ] 中断 run 标记、恢复提示、待发送输入保全 | 部分：已有持久化/回报语义工作，通用 run recovery 待核 | 高 |
| - [ ] 恢复不重放未知副作用、权限重新校验 | 部分：已有相关安全边界，通用恢复专项待核 | 高 |
| - [ ] 限流/临时网络错的退避与显式重试 | 待核 | 中 |
| - [ ] 窗口关闭≠退出 app≠停止后台任务 | 待核 | 高 |
| - [ ] 机器级 reboot/shutdown 自动化 | 不做：项目硬约束禁止 | 低（明确排除） |

### 编排与桌面控制面

| Checklist / 功能 | 我们有没有 | 建议优先级 |
|---|---|---|
| - [ ] 可复用 subagent 角色/模型/工具权限定义 | 部分：dsh subagent 与 P6 委派，产品定义编辑待核 | 高 |
| - [ ] 前后台 worker、看 transcript、继续已有 worker | 部分：subagent 呈现已有工作，resume/cancel 闭环待核 | 高 |
| - [ ] 并发/预算上限、失败可见，不默默全开 | 部分：多 session 并发已测，统一预算控制待核 | 高 |
| - [ ] worktree/workspace 隔离与 diff 验收 | 部分：运行时插件可复用，p9 L10 产品闭环尚非已完成 | 中 |
| - [ ] 任务依赖/blocked/领取/验证/有限次修复 | 部分：编排底座有，用户级统一任务板待核 | 中 |
| - [ ] 可保存/复跑 workflow 与完成结果检查点 | 部分：dsh workflow 底座，产品 UI 与恢复语义待核 | 中 |
| - [ ] 团队跨 compaction/重启的状态一致性验收 | 待核；官方同类也有明确限制 | 高 |
| - [ ] 桌面聊天壳 + 审批 + 连接器 + 运行状态 | 有：现有产品，不建议换壳重建 | 高 |
| - [ ] 终端/diff/worker 明细统一控制台 | 部分：outline/UI 已有工作，终端/diff 全链待核 | 中 |
| - [ ] 手机/浏览器遥控与跨设备接续 | 规划/待评估：p9 L14；不优先另造 Happy | 低 |
| - [ ] 云端/远端常驻、笔记本休眠后持续执行 | 部分：SSH 是执行环境底座，不等于客户端退出后任务常驻 | 低 |

### 最小推进建议

1. **优先补“可控的基础动作”**：能找会话、给指定 bot 发消息、查看任务状态、请求安装并批准、清楚区分 reload/reconnect/restart。
2. **先盘已有底座再立项**：本项目已经有多 session、技能库/按 bot 启用、MCP 市场、重启 preset 恢复、跨 bot 委派，不应把这些重复写成“全新能力”；未知项要现场盘点，不拿旧 PLAN 当实时功能真相。
3. **恢复正确性比团队规模更重要**：先定义 side effect、输入持久化与权限恢复，再考虑 teams/复杂 workflow；官方现状也没有让任意团队跨重启无损恢复。
4. **复用候选而非搬仓结论**：hcom 看同机通信，vercel skills/CC Switch 看扩展安装，OpenClaw 看 continuation 恢复边界，Termic 看 CLI/PTY 外壳；正式依赖前还须复核 issue 响应、安全、许可证与 dsh 兼容性。

## 附：已核默认分支提交锚点

用于把“最近活跃”落到 commit；星数仍是调研快照而非 commit 内容。

| Repo | 调研时默认分支提交 |
|---|---|
| anthropics/claude-code | [0ed94698](https://github.com/anthropics/claude-code/commit/0ed94698aa0aeee471465fc9c867c2e8434c4d68) |
| siteboon/claudecodeui | [2053f3d7](https://github.com/siteboon/claudecodeui/commit/2053f3d7a086fd44f7fe373c913da487629b0a95) |
| aannoo/hcom | [de33e31a](https://github.com/aannoo/hcom/commit/de33e31a0cdbba4c5863f7cc050d8b79aa50bcdf) |
| anthropics/skills | [2c5958ec](https://github.com/anthropics/skills/commit/2c5958ecac7cee2b583967a2c4981d0f4a75c579) |
| anthropics/claude-plugins-official | [0412be76](https://github.com/anthropics/claude-plugins-official/commit/0412be76f50ab4f4f8abff3753efa9269fbbca5b) |
| vercel-labs/skills | [d3701c11](https://github.com/vercel-labs/skills/commit/d3701c11b1101251af14c9d148f026e1a47ebe17) |
| farion1231/cc-switch | [8656ebd9](https://github.com/farion1231/cc-switch/commit/8656ebd91f3eba631837126e29df71e8353b7e43) |
| openclaw/openclaw | [2198d6f4](https://github.com/openclaw/openclaw/commit/2198d6f49c24f993348b486a524ac5e05317ff54) |
| slopus/happy | [44feb06f](https://github.com/slopus/happy/commit/44feb06f2153662bf885c1b9713452d37ffeb48d) |
| OthmanAdi/planning-with-files | [2362ca38](https://github.com/OthmanAdi/planning-with-files/commit/2362ca385ad74f061aa0e7b73f56543a4b7e6df2) |
| Yeachan-Heo/oh-my-claudecode | [d10c1653](https://github.com/Yeachan-Heo/oh-my-claudecode/commit/d10c16530a13c8e0f2b994ac0447190f71296082) |
| stablyai/orca | [a964c9e0](https://github.com/stablyai/orca/commit/a964c9e0b549cc955db372ced79d1a8838d801e3) |
| simion/termic | [b0609b8d](https://github.com/simion/termic/commit/b0609b8d1a4b02168f2357b45bfc8f23b52db3dc) |
