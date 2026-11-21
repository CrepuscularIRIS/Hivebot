# Scout C · agent 跨对话通信与多 agent 编排开源版图

调研日期：2026-11-08；GitHub 数据采样约 16:40–17:00 UTC。星数为采样值，不代表质量。近六个月窗口：2026-05-08 至 2026-11-08。

**方法与边界**：使用 GitHub MCP `get_me`、`search_repositories`、`search_code`、`get_file_contents`、`list_commits`；Claude Code 补查官方产品文档。没有安装、启动任何外部产品，没有复制产品代码。以下“实证”指源码/官方文档证据，不指运行验证；只有搜索片段的机制标注为片段级证据，不推断完整可靠性。OpenClaw `session-tool.md` 已分三段完整读完；其余大仓仅阅读所列文件/搜索片段，未做全仓审计。Hivebot 基线来自本次任务及 `work/HANDOFF.md`，差距表是待验收清单，不是本地代码缺陷判定。

**先说结论**：最接近“多个持久 bot 各有会话、可以互发消息”的是 **OpenClaw**；最接近“桌面监督多种 coding agent”的是 **agent-orchestrator / Paseo**；最值得学习“小型协作工具面”的是 **Routa**。不要把 workflow handoff、共享记忆、跨会话投递、进程隔离混为同一种能力。

## 1. 多 agent 会话编排：优先看产品，再看库

### 主样本：3 个活跃产品仓

| Repo / star | 活跃度：默认分支最近 commit | 形态与一句话做法 | Hivebot 借鉴点 / 证据边界 |
|---|---|---|---|
| [OrchestratorInc/agent-orchestrator](https://github.com/OrchestratorInc/agent-orchestrator) · **14,272** | **2026-11-08** · `5a713c419b` | 桌面+移动端 agent fleet 产品：以长期 session / daemon 托管 orchestrator 和 worker，保留 native agent conversation、worktree 及会话恢复入口。 | 产品区分“session 仍存在”与“agent process 仍在协调”；不能把历史 running 标签当活性证明。[状态显示源码](https://github.com/OrchestratorInc/agent-orchestrator/blob/5a713c419b8122fc91bc41b8f39d1d16942790b7/packages/mobile/lib/orchestratorView.ts)、[恢复路由](https://github.com/OrchestratorInc/agent-orchestrator/blob/5a713c419b8122fc91bc41b8f39d1d16942790b7/packages/mobile/lib/session/sessionRoute.ts)。代码搜索片段已核实，未审消息可靠性。 |
| [getpaseo/paseo](https://github.com/getpaseo/paseo) · **23,502** | **2026-11-08** · `01888dc5de` | 桌面+手机多 coding agent 控制台：项目下创建 workspace/worktree，再连接 agent 会话，而不是要求用户先写 DAG。 | 看“项目→工作区→会话”的信息架构、worktree 目的路径验证；它是管理多个 agent 的产品，不因 UI 多开就能断言 agent 会自主互发消息。[工作区示例](https://github.com/getpaseo/paseo/blob/01888dc5deb7c964491f784f260cb64378a7c4ed/assets/store-screenshots/demo/stage.mts)、[路径验证](https://github.com/getpaseo/paseo/blob/01888dc5deb7c964491f784f260cb64378a7c4ed/packages/server/src/utils/worktree-path.ts)。 |
| [google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli) · **108,781** | **2026-11-06** · `62bab5b232`（仓库 push 11-08） | CLI 产品：本地/远端 subagent 都包进 AgentProtocol，活动事件和最终结果走统一协议，方便主会话观察委派。 | [LocalSubagentProtocol](https://github.com/google-gemini/gemini-cli/blob/62bab5b232c15b925d31e655ce844ab939c882b7/packages/core/src/agents/local-subagent-protocol.ts)、[RemoteSubagentProtocol](https://github.com/google-gemini/gemini-cli/blob/62bab5b232c15b925d31e655ce844ab939c882b7/packages/core/src/agents/remote-subagent-protocol.ts)、[事件类型](https://github.com/google-gemini/gemini-cli/blob/62bab5b232c15b925d31e655ce844ab939c882b7/packages/core/src/agents/types.ts)。**搜索到的 context/pipeline/orchestrator.ts 是上下文处理编排，不应误报为多 agent 调度器**；caretaker-agent 也主要是仓库运维工具。 |

### 点名框架与重要排除项

下表是覆盖题目点名对象的旁证，不把它们都算作产品候选；星数、push 和归档状态来自同轮 GitHub MCP 查询。

| 对象 / star / 最近 push | 做法与结论 |
|---|---|
| [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph) · **44,649** · 2026-11-08 | 状态图/持久化执行框架，适合做调度底座，但不是现成的多持久 bot 桌面产品。其 [agent-chat-ui](https://github.com/langchain-ai/agent-chat-ui) · **3,253** · push 11-03，**API 已标 archived**，不作为活跃 UI 依赖推荐。此轮没有展开 checkpoint 具体实现。 |
| [crewAIInc/crewAI](https://github.com/crewAIInc/crewAI) · **60,643** · 2026-11-08 | 角色化团队协作框架；本轮未证明其开源仓自带满足本题的持久多 bot 产品壳，亦不能把商业平台功能算成开源实现。只列框架参照。 |
| [microsoft/autogen](https://github.com/microsoft/autogen) · **61,748** · 2026-10-28 | Core 提供消息传递/事件驱动 runtime，AgentChat 提供团队模式，Studio 提供 agent/workflow/session UI；**当前根 README 明确宣布不再维护，建议迁到 Microsoft Agent Framework**，即使 API `archived=false` 且六个月内仍有文档 commit，也不能算活跃推荐。Studio 自身还明确“非 production-ready”。[根声明](https://github.com/microsoft/autogen/blob/d07c667a3239ea4ab7af62a53b0f4ff205a1f23d/README.md)、[Studio 声明](https://github.com/microsoft/autogen/blob/d07c667a3239ea4ab7af62a53b0f4ff205a1f23d/python/packages/autogen-studio/README.md)。 |
| [ag2ai/ag2](https://github.com/ag2ai/ag2) · **5,053** · 2026-11-08 | 与微软 AutoGen 分开追踪的活跃仓；定位 AgentOS / multi-agent 框架，本轮未核到可直接复用的桌面壳，不视为 AutoGen Studio 的维护继任者。 |
| [openai/swarm](https://github.com/openai/swarm) · **22,116** · 2026-04-15 | README 明确 educational、调用间无状态、由函数返回 agent 做 handoff，并已被 [openai-agents-python](https://github.com/openai/openai-agents-python) · **30,556** · push 11-08 替代；**Swarm 不满足近六个月活跃要求，也不是长期会话总线**。[证据](https://github.com/openai/swarm/blob/6af0b4caf37dca4526dfd98e9fbd8ce36e7eeb22/README.md)。 |
| [anthropics/claude-code](https://github.com/anthropics/claude-code) · **154,975** · 2026-11-06 | **产品行为参照，不是可搬运的开源调度核心**：公开仓 README 提供安装/反馈/插件入口，不能把它当 Agent teams 内核源码仓。官方 [Agent teams 文档](https://code.claude.com/docs/en/agent-teams) 公开了 mailbox / task list 等机制，详见 §2。 |
| [FlowiseAI/Flowise](https://github.com/FlowiseAI/Flowise) · **55,562** · 2026-08-13 | 虽有近期 push，API 已标 **archived**，不进入活跃主样本。[Dify](https://github.com/langgenius/dify) · **160,674** · push 11-08、[Sim](https://github.com/simstudioai/sim) · **30,074** · push 11-08 是活跃 workflow 产品旁证，但本轮未核源码证明“每个长期 bot 有独立会话且可互发消息”，不拿来替代 §2 的样本。 |

## 2. 跨对话 / 跨 bot 通信：持久 session 才是核心

### 活跃样本：2 个直接命中，2 个相邻能力

| Repo / star | 活跃度 | 一句话做法 / 命中程度 |
|---|---|---|
| [openclaw/openclaw](https://github.com/openclaw/openclaw) · **394,186** | 默认分支 commit **2026-11-08** · `2cc0141677` | **直接命中**：Gateway 统一寻址持久 session，`sessions_create` 建独立会话，`sessions_spawn` 建受监督 child，`sessions_send` 向已有 session 投递并唤醒/排队；输入、run、回复的归属分开记录。 |
| [phodal/routa](https://github.com/phodal/routa) · **1,838** | 默认分支 commit **2026-10-14** · `9dc7b7be8f` | **直接命中协作工具面**：Web/desktop workspace 产品以 MCP 暴露 `list_agents`、`read_agent_conversation`、`delegate_task_to_agent`、`send_message_to_agent`、`report_to_parent`，共享 note/artifact 与点对点通信并存。未验证断电恢复/重复投递保障。 |
| [letta-ai/letta-code](https://github.com/letta-ai/letta-code) · **3,805** | push **2026-11-08** | **相邻能力**：当前 Letta 产品 runtime，覆盖 terminal、App Server、desktop/web 和 channels，以长期 agent 身份/记忆连接多个入口；**本轮未核到可靠的 peer mailbox，不冒称完整 bot↔bot 总线**。旧 [letta-ai/letta](https://github.com/letta-ai/letta) · **25,388** 的默认 README 已将源码指向这里，旧 V1 server 在 archive 分支。 |
| [elizaOS/eliza](https://github.com/elizaOS/eliza) · **19,792** | 默认分支 commit **2026-11-08** · `29f1958d9f` | **相邻能力**：app/agent host/core runtime + connector registry，`sendMessageToTarget` 把消息交给指定 connector/relay source；有持久记忆及 Web/desktop/mobile 产品，但本轮证据不足以宣称内部任意 agent 间都有可靠 mailbox。 |

**机制锚点**：

- OpenClaw：[完整 session 工具规格](https://github.com/openclaw/openclaw/blob/2cc0141677127329666cceb3487411cff7ae05cd/docs/concepts/session-tool.md)、[发送实现入口](https://github.com/openclaw/openclaw/blob/5fe1403b94d74f8a933ca50a778e6c9bfdfd7b78/src/agents/tools/sessions-send-tool.ts)、[session 状态感知](https://github.com/openclaw/openclaw/blob/5fe1403b94d74f8a933ca50a778e6c9bfdfd7b78/docs/concepts/session-state.md)。搜索索引与文件读取命中不同 commit，因此链接各自锁定，不假装同一原子快照。
- Routa：[MCP profile](https://github.com/phodal/routa/blob/9dc7b7be8fa92b760f6ebf0ac7f8b44db1b4dc34/src/core/mcp/mcp-server-profiles.ts)、[工具分发到 tools.messageAgent](https://github.com/phodal/routa/blob/9dc7b7be8fa92b760f6ebf0ac7f8b44db1b4dc34/src/core/mcp/mcp-tool-executor.ts)、[specialist 协作提示](https://github.com/phodal/routa/blob/9dc7b7be8fa92b760f6ebf0ac7f8b44db1b4dc34/src/core/orchestration/specialist-prompts.ts)。另有 [A2A HTTP 入口](https://github.com/phodal/routa/blob/9dc7b7be8fa92b760f6ebf0ac7f8b44db1b4dc34/crates/routa-server/src/api/a2a.rs)，但 MCP 工具和 A2A 协议不能因此视为同一种传输实现。
- Letta：[迁移声明](https://github.com/letta-ai/letta/blob/8816d3a8516893bfdc0fa14bfb1235226012e295/README.md)；未核实的 peer 通信不作为推荐依据。
- Eliza：[app/runtime 产品组成](https://github.com/elizaOS/eliza/blob/29f1958d9f7798ffd0b4601cdda3e4b4043513ca/README.md)、[消息发送适配](https://github.com/elizaOS/eliza/blob/1e43c7b6e354eaa57c756e674bda74e69facd087/packages/agent/src/services/client-chat-sender.ts)、[runtime 委托 connector](https://github.com/elizaOS/eliza/blob/1e43c7b6e354eaa57c756e674bda74e69facd087/packages/core/src/runtime.ts)。

### 最可借鉴的可靠性契约：OpenClaw

1. **agent / session / run / external conversation 四者分离**：一个持久 bot 能有多个 session；一次 run 结束不代表 session 消失；外部收件地址也不是本地上下文 key。
2. **接收成功不等于执行完成**：`targetDisposition=queued|steered`、回复 `delivery.status`、终态结果分别表达；`timeoutSeconds=0` 是不等回复，不是丢弃结果。
3. **忙时语义显式化**：followup 排为独立 turn；steer 给当前 run 输入；notify 不启动新 turn；wait 超时不等于目标失败。避免“发送方超时→再发一遍→目标做两次”。
4. **持久投递归属**：普通 peer 输入在入队后有持久 custody，恢复用原 input identity、目标顺序与消费去重；启动恢复重查原 source/target session、当前权限及 requester 身份。旧 transcript 的拷贝本身不能授权重放。
5. **可发不等于可读**：send-only agent policy 可允许发消息但不允许列会话/读历史/watch；watch 另需 status visibility。被授权的目标仍可能泄露数据或代执行，因此 send-only 不是 confused-deputy 防护的全部。
6. **其他 agent 的话不是用户授权**：消息携带 inter-session provenance，不能通过 agent 中转升级权限；原 requester 权限需要延续并在副作用前复核。
7. **watch 是廉价失效通知**：stateVersion + changesSince、合并 stale notice，让协调者知道“用户刚改过 worker 目标”，而非每轮把所有会话历史灌给主 agent。

安全反例：该版本文档写明默认 session visibility 为 `all`、跨 agent 可见默认开启，可能含其他用户 transcript；**Hivebot 不照搬此默认值，也不照搬本项目禁用的 exec 默认免审批策略**。

### Claude Code：透明产品机制，但不计入开源实现候选

官方 [Agent teams](https://code.claude.com/docs/en/agent-teams) 公开：每个 teammate 独立上下文，直接消息；mailbox 为 `~/.claude/teams/{team-name}/inboxes/{agent-name}.json`，**写入收件箱成功才报告 sent**，读取验证格式；共享 task list 用文件锁抢单，任务依赖完成自动解锁。会话结束会清理 team config，而 task 目录保留。

这是一种可解释的轻量本地 mailbox + task registry，不一定需要 Redis/Kafka。边界同样明确：teams 仍是实验功能；in-process teammate 不随 `/resume` 恢复；一会话一 team、不支持 nested teams，因此它不是“永久 bot 社会”的完整模板。当前官方文档还指出 named subagents 可互发消息，不能沿用“subagent 永远只能向父返回”的过时概括。跨独立会话另有官方 [cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging) 入口，本轮未进一步审其底层实现。

## 3. bot 自管理：skill 学习、插件安装、派生会话、服务重启要拆开

### 3 个活跃产品样本

| Repo / star | 活跃度：默认分支最近 commit | 一句话做法 | 已核实 / 没有核实 |
|---|---|---|---|
| [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) · **261,666** | **2026-11-08** · `444f980868` | 经验→可编辑 skill→后续调用的学习闭环，配套跨会话检索、隔离 subagent 和 desktop model/limit 配置，不把自改模型权重当卖点。 | [README](https://github.com/NousResearch/hermes-agent/blob/444f980868937926562fe5652d26364d45550960/README.md)、[skill_manage 工具](https://github.com/NousResearch/hermes-agent/blob/444f980868937926562fe5652d26364d45550960/tools/skill_manager_tool.py)、[写删 guard](https://github.com/NousResearch/hermes-agent/blob/444f980868937926562fe5652d26364d45550960/tools/skill_manager_guards.py)、[原子批处理入口](https://github.com/NousResearch/hermes-agent/blob/444f980868937926562fe5652d26364d45550960/tools/skill_manager_batch.py)。支持用户执行 `hermes plugins install` / `hermes update`，**不据此声称 agent 默认获准自主安装任意代码或自重启**。 |
| [openclaw/openclaw](https://github.com/openclaw/openclaw) · **394,186** | **2026-11-08** · `2cc0141677` | session 生命周期工具创建独立/子会话，maintenance 工具把 update/restart 作为显式操作，而非只能让模型在 shell 猜服务命令。 | [gateway-tool.ts](https://github.com/openclaw/openclaw/blob/5fe1403b94d74f8a933ca50a778e6c9bfdfd7b78/src/agents/tools/gateway-tool.ts) 的 `MAINTENANCE_ACTIONS` 含 `update.run`、`restart`、`update.cleanup`；§2 的完整工具文档确认 create/spawn 生命周期。这里只确认工具入口，**未完整审核 restart 的授权/恢复闭环**。 |
| [elizaOS/eliza](https://github.com/elizaOS/eliza) · **19,792** | **2026-11-08** · `29f1958d9f` | 第一方插件向统一 runtime 注册 actions/providers/evaluators/services/routes/events/app views，使 bot 能力与产品界面一起扩展。 | [当前 README](https://github.com/elizaOS/eliza/blob/29f1958d9f7798ffd0b4601cdda3e4b4043513ca/README.md) 确认产品+插件栈，且已停止接收第三方 registry 列表；**不是“任何 agent 可无审批 npm install 并热加载”的证据**。 |

**AutoGPT 检查结果**：[Significant-Gravitas/AutoGPT](https://github.com/Significant-Gravitas/AutoGPT) · **187,942** · push **2026-11-08**，是活跃平台候选；本轮只核元数据，未取得“运行时安全自改/自重启”实现证据，故不把早期 self-improve 叙事当事实、不进入前三推荐。

**Hivebot 可学但不扩权**：skill 变更应是“候选→diff/审阅→版本快照→按 bot 启用→失败回滚”；重启只触及本产品服务、先记录 pending input / run 状态再重启，不重启机器、不注销桌面；创建 child 继承父的隔离与权限上限，受深度、并发和预算约束。前三是调研后建议，并非断言样本已完整实现这些安全要求。

## 4. 沙箱与工作区：文件冲突隔离、进程隔离、硬件隔离分层

### 3 个活跃仓 / 真实产品化路径

| Repo / star | 活跃度：默认分支最近 commit | 一句话做法 | 对 bwrap 路线的意义 |
|---|---|---|---|
| [OpenHands/OpenHands](https://github.com/OpenHands/OpenHands) · **92,955** | **2026-11-08** · `cc99322a1e` | 当前 README 的 Agent Canvas 产品提供 local 与 Docker sandbox 启动路径，文档明确本地模式可访问用户 workspace，推荐 laptop 使用 Docker。 | 可借鉴 UI 明示“本地/沙箱”的风险差异及 workspace scope；本轮不沿用旧版 Python runtime 架构推定当前仓。[README](https://github.com/OpenHands/OpenHands/blob/cc99322a1efd0f4be8d6934ae93a4d1d4bc33e05/README.md)、[security posture](https://github.com/OpenHands/OpenHands/blob/cc99322a1efd0f4be8d6934ae93a4d1d4bc33e05/docs/architecture.md) 为搜索片段级证据，未验证每 bot 独立容器。 |
| [e2b-dev/runtime](https://github.com/e2b-dev/runtime) · **1,822**；配套 [e2b-dev/E2B](https://github.com/e2b-dev/E2B) SDK/CLI **14,769** | runtime commit **2026-11-08** · `6dd55395ad`；SDK push **11-06** | E2B Cloud 的实际开源后端：每 sandbox 一 Firecracker microVM，从 snapshot 恢复，pause/resume/fork、持久卷、envd 进程/文件 API 与控制面生命周期分离。 | 硬件隔离+快照不是 bwrap 已有能力；但要 KVM/额外控制面，不能为了多 bot UI 就立刻搬入。[完整 README](https://github.com/e2b-dev/runtime/blob/6dd55395ad530c72e7d433016c0a1c9cad7e78b9/README.md) 确认单机 Embed、nftables egress、COW、持久卷及控制/数据面；不把 SDK 仓误报为 Firecracker 实现仓。旧 infra 搜索解析到现在的 runtime。 |
| [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) · **261,666** | **2026-11-08** · `444f980868` | 同一产品提供 local / Docker / SSH / Modal / Daytona / Vercel Sandbox 六类 terminal backend，desktop 可配置 subagent 路由和限制；按需选择运行位置而非把编排绑定某一沙箱。 | 借鉴“逻辑 bot/session 身份稳定，执行后端可换”，优先保留 bwrap，加 workspace 生命周期/预算约束即可；README 的“isolated subagents”不能自动证明六后端都实现同等隔离。[证据](https://github.com/NousResearch/hermes-agent/blob/444f980868937926562fe5652d26364d45550960/README.md)。 |

**Daytona 必须单独提示**：[daytonaio/daytona](https://github.com/daytonaio/daytona) · **71,348** · push **2026-07-24**，采样时 GitHub API **`archived=true`**。六个月内有更新不等于仍在维护；Hermes 当前文档仍列 Daytona 后端，也不推翻原仓已归档的事实。本轮没有证据定位新的开源主仓，因此只作容器/远端 workspace 路线参考，**不进入活跃依赖推荐**。

**三层不要混用**：Git worktree 是并行写代码的冲突管理，不是安全边界；Docker/bwrap 通常仍共享宿主内核，不能当 microVM；microVM 也不会天然解决跨 bot 授权、message provenance 或共享挂载数据泄露。无论哪个后端，message broker 不应靠把其他 bot 工作区整树挂入沙箱来实现通信。

### Hivebot 视角：已有基础、差距清单、最值得借鉴的 top 5

基线按用户提供：**编排层已建未开闸 / bwrap 沙箱 / ⑤ 通道可建 bot**；HANDOFF 还指出 T27 等用户编排结论。以下“差距”应理解为开闸前需要证明的产品契约，不是要求重写 dsh/SuperAgent，也不冒称本轮审了本地实现。

| 已有基础 | 业界补齐的关键层 | Hivebot 开闸前验收问题 |
|---|---|---|
| 已有多个 bot 和建 bot 通道 | agent/session/run/task/input 稳定 ID、会话目录、独立创建与受监督 spawn 分离 | 创建到底生成永久 bot、永久会话还是临时 run？同名 bot 如何寻址？继续已有 bot 是否会误建重复 bot？ |
| 编排层已建未开闸 | 发送、入队、执行、结果投递分别回执；忙时 followup/steer 分离 | “已送达”准确指哪一步？发送方退出/超时后谁还负责交付？目标 busy 是否排队？ |
| 已有持久聊天 | durable inbox/outbox、input ID 去重、run/input custody、恢复时重新授权 | SDK/Gateway 重启后有没有丢信/重复执行？旧 target reset 后消息会否投给新会话？ |
| 已有 bot 名册认知 | 可发、可读历史、可 watch、可控制为不同权限 | A→B 消息能否间接取得 B 的高权限？agent 冒称“用户同意”会否穿透审批？默认能否读其他 bot 私有历史？ |
| 已有主聊天与子任务展示基础 | session 存活与 worker 活性分离、idle/blocked/error 区分、用户随时直达 worker | UI 能否看到“谁交给谁、运行在哪、在等谁、如何取消/继续”？失败是否显示成 idle/done？ |
| bwrap 沙箱 | 独立 workspace/worktree、生命周期清理、预算/深度/并发限制 | 临时 child 的文件如何交付、保留或清理？同仓写冲突怎么解决？共享结果能否只传 artifact 引用而非放宽挂载？ |
| ⑤ 通道建 bot；已有 skill 能力 | 受控能力变更、版本快照/回滚、隔离策略不降级 | child 是否继承最低隔离？skill 修改是否经审阅再按 bot 生效？服务重启前是否有恢复契约？ |

**可借鉴机制 top 5（按优先级，不是新开五套系统）**：

1. **OpenClaw 式稳定寻址 + 明确回执**：复用现有编排工具，先定义 bot/session/run/input ID 及 queued/running/succeeded/failed/cancelled；发送接口要支持“发给既有 bot”，不是每次重新 spawn。
2. **轻量 durable mailbox + 去重/结果归属**：Claude teams 说明本地文件 mailbox 也能起步；OpenClaw 说明真正难点在 custody 和恢复。沿用现有存储就够，先证明 crash/timeout/reset 下不丢、不重复、不投错人，不先引消息中间件。
3. **消息 provenance + send-only ACL + 权限重新校验**：peer 内容是数据，不是用户授权；默认限制可见范围，禁止权限洗白。独立控制“可发消息”和“可读历史/控制对方”。
4. **worker 可观察/可接管 + 变化通知**：采用 agent-orchestrator 的“会话仍在≠进程仍活”语义，结合 Gemini 活动事件和 OpenClaw stateVersion/watcher；主聊天只收简报，用户可点击打开 worker 原会话并继续。
5. **workspace 与能力变更的受控生命周期**：保留 bwrap；需要并行改代码时加 worktree，需要远程执行时再接 backend。借鉴 Hermes 把经验固化成 skill，但候选/审阅/快照/回滚走现有通道；不开放无审批插件执行或全机自重启。

**搬运结论**：当前优先搬“接口语义、事件结构、可靠性用例和 UI 状态”，不是替换整个执行栈。优先进一步定位 OpenClaw `sessions-send-tool` / pending-input custody、Routa `tools.messageAgent`、agent-orchestrator 会话状态投影。只有要实际深读/搬代码时，再依项目规则查 `repos/MANIFEST.tsv`、浅克隆只读仓并锁 SHA、逐文件检查许可证；本轮未克隆，未添加依赖，未改产品代码。
