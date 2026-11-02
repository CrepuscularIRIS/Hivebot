# S8 · 0.18 host 扩展 / runner 与 dsh Cordis 插件映射

## 范围与结论

本次只对照 MVP 的 session 管理、MCP、审批和 per-session 配置，不做 35 个扩展的全量移植。范围依据为 `work/p2-sdk/BRIEF.md:15-23、41-45、52、70`。以下 `G/` 表示 `repos/grok-bot-0.18-reconstructed/`，`D/` 表示 `repos/deepseek-harness/`，均相对于项目根目录 `/home/lingxufeng/bot/`。

**四个能力域都有现成的 dsh 插件基础，不应重写 session runtime、MCP client、审批服务或配置存储。** 确定需要补的是「连接器选择到指定 session 的插件组合」这层产品适配；另外两处增量取决于接口和审批语义：原样使用 stdio SDK server 时缺 per-session preset/model 接线；若 D8 要求普通 shell 调用也先询问用户，则缺确定性的强制询问策略。不能把这些局部缺口扩大成自有 SDK 门面或 fork dsh。

本次做的是源码入口与声明核验，没有运行 dsh、模型、连接器或测试；“可以表达”不等于 D3–D8 已通过实测。

## 1. 0.18 对应的扩展与 runner 入口

下表只列所有者、声明和接线位置，不展开原版实现细节。原版 host 注册表确实包含这些扩展，见 `G/source/host/extensions/registry.ts:1-4`。

| 能力域 | 0.18 host 扩展 / 配套文件 | runner 对应接线及证据 |
|---|---|---|
| Session 管理。 | `source/host/extensions/session/extension.ts` 提供 session store；`source/host/extensions/transcript/extension.ts` 提供会话管理并消费 session store 和 turn-execution；`source/host/extensions/turn-execution/extension.ts` 提供执行注册服务。证据为 `G/source/host/extensions/session/extension.ts:4-7`、`G/source/host/extensions/transcript/extension.ts:24-40、43-65`、`G/source/host/extensions/turn-execution/extension.ts:1-5`。 | `source/host/host-runner-composition.ts` 以 session 和 hooks 创建 runner，并绑定 session 自有 store；配套入口为 `source/host/extensions/transcript/runner-registry.ts`。证据为 `G/source/host/host-runner-composition.ts:900-920、2586-2611`、`G/source/host/extensions/transcript/runner-registry.ts:54、236`。 |
| MCP。 | `source/host/extensions/mcp/extension.ts` 声明 `mcp` 扩展，返回 service API 和 skillPublish；服务入口为 `source/host/extensions/mcp/mcp-service.ts`。证据为 `G/source/host/extensions/mcp/extension.ts:1-10`。 | `source/host/host-runner-composition.ts` 获取 `mcp` 扩展，并向 runner 绑定 `mcp` 与 `mcpManagement`；实际回合组合入口接收 MCP tools。证据为 `G/source/host/host-runner-composition.ts:913、1652-1656、2543-2549、2597-2598`。 |
| 审批（approval）。 | `source/host/extensions/local-tool-permission/extension.ts` 管本地工具权限；`source/host/extensions/auto-review/extension.ts` 管自动审查与人工等待状态。证据为 `G/source/host/extensions/local-tool-permission/extension.ts:12-19`、`G/source/host/extensions/auto-review/extension.ts:24-52`。 | `source/host/runner/auto-review-gate.ts` 和 `source/host/runner/sand-auto-review.ts` 是 runner 侧审查入口；host 组合层调用 `auto-review.bindRunner`、构建 gate，并按 session 转发本地权限请求。证据为 `G/source/host/host-runner-composition.ts:78-82、855-897、950-978`。 |
| Per-session 配置。 | 相关所有者是 `session`、`transcript`、`settings`，并非一个独立的“per-session-config”扩展：session store 的 profile 入口是 `source/host/extensions/session/agent-session.ts`，settings 扩展提供 SettingsService。证据为 `G/source/host/extensions/session/agent-session.ts:96-120`、`G/source/host/extensions/settings/extension.ts:1-5`。 | `source/host/extensions/transcript/runner-registry.ts:236` 传入 session 对应的 `agentProfileProvider`；`source/host/host-runner-composition.ts:1336-1346、1421-1422、1452` 接入 profile / systemPrompt。不要误称原版已经支持任意 per-session 模型：此组合层的模型取自进程环境 `SAND_AGENT_MODEL`，见同文件 `2307、2515-2518`。 |

**这四项不各自对应一个名字含 Middleware 的组件。** 上表所列的是扩展及 runner 接线；原版回合 executor 明确命名的中间件链是 disk-pressure reminder → SendMessage reminder → start-of-turn ack reminder，见 `G/source/host/runner/turn-agent-composition.ts:180-204`，声明文件为 `source/host/runner/send-message-reminder-middleware.ts` 和 `source/host/runner/start-of-turn-ack-reminder-middleware.ts`。这条提醒链不是 session、MCP、approval、配置的实现，也不因本次映射而进入 MVP 必须移植清单。

## 2. dsh 现成对应物与复用决策

表中所有 dsh 候选都来自 `deepseek-ai/deepseek-harness`。许可证为 MIT，依据 `D/LICENSE:1-13`；本地 HEAD 为 `ce7073d51254c26cd63b22a60835b8f948deb447`，最近 commit 为 2026-10-30 00:13:15 +08:00（2026-10-29 16:13:15Z）。维护时间已通过本地 `git log -1` 和 GitHub MCP `list_commits` 交叉核对，[对应 commit](https://github.com/deepseek-ai/deepseek-harness/commit/ce7073d51254c26cd63b22a60835b8f948deb447)。下表“同上”均指该许可证与维护记录，不代表每个子包恰在该日单独改动。

| 能力 | 候选（owner/repo@path） | 许可证 | 维护（最近 commit） | 决策 | 理由 / 适配工作量 |
|---|---|---|---|---|---|
| Session 的生命周期、持久化、查询与并发运行基础。 | `deepseek-ai/deepseek-harness@packages/core/session`、`packages/core/agent`、`packages/core/agent-loop`、`packages/session/session-persistence-jsonl`、`packages/session-query/session-query-sqlite`；对外复用 `packages/api/session-controller` 或 `packages/sdk/server`。 | MIT，同上。 | 同上，`ce7073d5`。 | 集成 | 已有按 SessionId 保存的 Agent registry、create/resume 和持久化后端，不需要新写 session manager。证据为 `D/packages/core/agent/src/index.ts:256、416`、`D/packages/core/agent-loop/src/index.ts:668-691`、`D/packages/session/session-persistence-jsonl/src/index.ts:93-110、522-556`。API controller 已有创建与按 session 解析 Agent 的路径，见 `D/packages/api/session-controller/src/index.ts:298-305`、`src/agent.ts:125-129、156-188`；SDK server 也按 session 保存记录，见 `D/packages/sdk/server/src/server.ts:543-558、588-595`。需要写 profile 组合和验收用例，不应仅因 BRIEF 提到“多 session 编排”就新造运行时。 |
| MCP 连接、工具注册与作用域隔离。 | `deepseek-ai/deepseek-harness@packages/mcp/mcp-client`、`packages/mcp/mcp-resources`，组合使用 `packages/preset/agent-preset`、`packages/preset/agent-preset-registry` 和 `packages/core/scope`。 | MIT，同上。 | 同上，`ce7073d5`。 | 集成 | `mcp-client` 已支持 stdio / Streamable HTTP，并把工具注册到当前组合的 tools 服务；无需复制原版 MCP 管理器。证据为 `D/packages/mcp/mcp-client/src/index.ts:1-13、43-46、51-103、154-184`、`src/server-context.ts:27-38`。独立 scope 可以使用相同 serverName，已有测试声明与断言，见 `D/packages/mcp/mcp-client/tests/apply.spec.ts:246-253`。X / Y 使用不同插件组合可表达“X 有该 MCP、Y 没有”；不要把 MCP 插件全局挂载后声称已隔离。 |
| 市场连接器在指定 session 的启用适配，即 MCP 域中剩余的产品胶水。 | 上述 `mcp-client` / preset 插件，加 `deepseek-ai/deepseek-harness@packages/boot/plugin-manager`。 | MIT，同上。 | 同上，`ce7073d5`。 | 自建 | 只新写连接器配置到目标 session 组合的适配，不新写 MCP 协议或包安装器。现成 plugin-manager 的开关持久化的是 profile entry，入参是插件 entry id 和 enabled，而不是 sessionId，见 `D/packages/boot/plugin-manager/src/index.ts:827-842`；preset 定义是插件列表，见 `D/packages/preset/agent-preset-registry/src/definition.ts:4-11`，且已有会话开始后不能换 preset 的限制，见同包 `src/index.ts:357-375`。因此“profile 已安装插件”不能直接等同于 D6 的“只在 X 启用连接器”。如果仅在新建空白 session 前选定连接器，适配可落到现成 preset，无须再实现热切换；已开始会话的动态启用不能声称开箱即用。市场目录来源与安装适配的完整盘点属于 S7，本条不替 S7 定设计。 |
| 审批请求、按 session 策略、审计与请求往返。 | `deepseek-ai/deepseek-harness@packages/interaction/user-approval`、`packages/interaction/permission-presets`、`packages/core/tools`；传输复用 `packages/sdk/server` 或 `packages/api/remotes`。Shell 升权复用 `packages/shell/tool-bash` 与 sandbox 插件。 | MIT，同上。 | 同上，`ce7073d5`。 | 集成 | 已有 ask / never 策略、按 session 写入的 policy、缺回答方时拒绝，以及只放行一次的结果；不需要重写 approval controller。证据为 `D/packages/interaction/user-approval/src/index.ts:31-45、58-68、117-121、167-172`、`src/types.ts:28-58、78-92`。执行流水线会等待审批，拒绝不会放行，见 `D/packages/core/tools/src/pipeline.ts:432-469`。SDK 已提供客户端审批往返，见 `D/packages/sdk/server/src/server.ts:130-145、258`；API 转发列表也包含审批 waterfall，见 `D/packages/api/remotes/src/remote-events.ts:26-28`。 |
| 若 D8 要求“普通 shell 调用必先问”，则需要补审批触发策略；此项不是审批基础设施缺失。 | `deepseek-ai/deepseek-harness@packages/core/tools` 的 `tools/pre-execute` 扩展点；比较候选为 `packages/shell/tool-bash` 和 `packages/experimental/auto-review`。 | MIT，同上。 | 同上，`ce7073d5`。 | 自建 | 普通 shell 与 sandbox 升权不是同一个行为：tool-bash 现成询问入口是显式 `sandbox_permissions` 升权，见 `D/packages/shell/tool-bash/src/index.ts:217-246、482-483`；auto-review 会让判定为 allow 的调用直接继续，不保证每次询问，见 `D/packages/experimental/auto-review/src/index.ts:741-776`。它们不能直接表达“所有指定 shell 调用均需人工点头”，而 `tools/pre-execute` 的 ask 决策和执行拦截已存在，见 `D/packages/core/tools/src/contracts.ts:350-361`、`src/pipeline.ts:432-469`。这只需一小段确定性策略；若 D8 明确只测试升权调用，则使用现成链路即可，不应创建此插件。 |
| Per-session preset、模型及配置恢复，采用现成 API controller / 同进程服务时。 | `deepseek-ai/deepseek-harness@packages/preset/agent-preset`、`packages/preset/agent-preset-registry`、`packages/core/agent`、`packages/api/session-controller`。 | MIT，同上。 | 同上，`ce7073d5`。 | 集成 | 现成 preset 的 plugins 就是 Cordis 子树，API 创建请求接受 agentPreset 并在 Agent setup 时 mount；模型也有独立的 session-local selectModel。证据为 `D/packages/preset/agent-preset/src/index.ts:8-28`、`D/packages/api/session-controller/src/agent.ts:55-62、271-282`、`src/index.ts:308-315`。preset 选择已写入 session projection 以便恢复，见 `D/packages/preset/agent-preset-registry/src/session.ts:20-47`；模型状态也有持久化 projection，见 `D/packages/core/agent/src/model-selection.ts:14-23、69-75`。D4 不要求任意配置热切换，因此不需要新造 per-session settings 系统；`packages/settings/settings` 实际面向 profile patch 表单，不是本需求的替代物，见其 `src/index.ts:1、19-30`。 |
| 如果 S3 选“原样使用 stdio SDK server”作为唯一入口，per-session 配置需要补接线。 | `deepseek-ai/deepseek-harness@packages/sdk/server`，内部继续复用上述 preset / Agent 服务。 | MIT，同上。 | 同上，`ce7073d5`。 | 自建 | 当前 SDK server 明确不加入 preset composition，并把初始化的 provider / model 用于每个 session，resume 还会用初始化路由覆盖恢复出的模型，见 `D/packages/sdk/server/src/server.ts:563-592`。因此不能把 core 支持 per-session 配置误报成 stdio SDK 已经支持 D4；只有 S3 选这条入口时才补定向接线，不能提前新造产品协议或改用全量 fork。 |

0.18 重构仓仅作为行为和入口参照，不建议复制它的 session / approval 实现进 app/sdk。其 `NOTICE.md:3-15` 明确说明是非官方二进制重构、未授予上游源码许可证；本地最近 commit 是 `a9f633e09d49a85829b8236331b9e21f7e612634`，时间为 2026-08-23 21:52:48 +01:00。许可证仅记录出处，不作为否决私用复用的理由；否决重复实现的原因是 dsh 已提供上述基础能力。

## 3. 新写部分各用一句话说明

| 新写部分 | 要写什么 |
|---|---|
| MCP 连接器的 session 适配。 | 写一个 app/sdk 插件，把已选连接器的 MCP 配置绑定到指定 session 的现成 Cordis 组合，保证未启用的 session 不获得该工具；依据为上表 profile 开关与 session preset 的作用域差别。 |
| 普通 shell 的强制人工审批策略，条件项。 | 如果 D8 要求普通 shell 也必先询问，写一个 `tools/pre-execute` 策略插件，要求目标调用通过现成 approval 服务得到一次性许可后才能执行；依据为上表 tool-bash 升权入口和 auto-review 的行为差别。 |
| stdio SDK 的 per-session preset/model 接线，条件项。 | 如果 S3 选择现有 stdio SDK server，补每个 session 的 preset/model 选择与恢复接线，并继续使用现成 registry、projection 和 Agent 服务；依据为上表 SDK server 的全局初始化配置路径。 |

## 核验记录与未验证项

- 本地 `cards/` 不存在，两仓均没有 `.codegraph/`，因此直接检索本地源码；没有将缺失的卡片语料当作证据。
- GitHub MCP 已查询 dsh 代码索引、最近 commit，并实读锁定 SHA 的 `LICENSE`、`packages/preset/agent-preset/src/index.ts`、`packages/preset/agent-preset-registry/src/session.ts`、`packages/mcp/mcp-client/src/server-context.ts`、`packages/interaction/user-approval/src/types.ts`，与本地对应文件核对；没有依赖 README 下结论。
- 未验证的是组合后的启动、多 session 并发时序、session X / Y 的工具可见性以及审批拒绝后的真实执行结果，这些是后续 D3–D8 的验收，不是本次入口映射已完成的事实。
- 主会话需把 S3 的入口选择与 D8 的 shell 询问语义交给既有决策流程明确；在这两项明确前，两个条件项都不应无条件进入开发清单。
