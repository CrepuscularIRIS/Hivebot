# R4 · dsh 工具清单与审批门现状

日期：2026-11-03。范围：BRIEF §10.4；只读源码与已安装 npm 产物，不修改策略，不启动真实模型，不读取用户凭证。

## 0. 证据口径

- 下文 `D/` = `/home/lingxufeng/bot/repos/deepseek-harness/`，参考仓 SHA `ce7073d51254c26cd63b22a60835b8f948deb447`；`A/` = `/home/lingxufeng/bot/app/`。本次主仓读取时 HEAD 为 `f8253c55be98f362ea26a8ddaff477b94e406c78`（工作区 profile 文件按读取时内容）。
- SDK 实际依赖是 npm `@deepseek-ai/dsh@0.2.2-alpha.2`，不是直接运行参考仓（`A/sdk/package.json:21`；`A/sdk/src/start.ts:493-495,528`）。下文另外核对已安装产物，避免把参考仓新增功能误报为现状。
- 「默认」限定为 Linux、全新 standard agent preset、默认 workspace-write + ask、没有用户额外覆盖配置。`A/sdk/profile/patches/presets.yml:1-6` 是 **D4 测试 fixture**，不是产品默认 preset；只有经 `P2SDK_PATCH` 显式加载才增加 p2-alpha / p2-beta。默认 standard 来自 `D/packages/bundle/web-app/cordis.patch.yml:586-593`。
- 启动必带 p2sdk.yml、approval.yml、runtime patch，额外 patch 在它们之后（`A/sdk/src/start.ts:86-98`）。所以后层/已有 profile 覆盖仍可改变结果；这里不声称所有历史 session 都与默认相同。
- 静态追踪结论，不是本次执行工具得出的运行实测。沙箱实际可用性、网络/环境/凭证效果归 R5；本文不给这些项目伪造 PASS。

## 1. 决策行（问题 → 证据 → 结论）

| 问题 | 证据 | 结论 |
|---|---|---|
| 默认 approval=ask 是否等于所有工具必问？ | `D/packages/core/tools/src/pipeline.ts:190-205` 默认终点是 allow，只有返回 ask 才进入 serviceAsk；`:432-456` 调 approval.request；`A/sdk/src/policy/shell-ask.mjs:43-58` 仅匹配 bash | **不是。** 当前我们只给普通 bash 加了必问策略；绝大多数其他工具默认不问。保留现有上游 pipeline，后续策略应在这个扩展点集成，不重写执行器。 |
| 普通 bash 与升权 bash 会不会双问？ | `shell-ask.mjs:43-58`；`D/packages/shell/tool-bash/src/index.ts:228-246,479-484`；`D/packages/sandbox/sandbox/src/escalation.ts:172-203` | 普通/重复当前模式在我们的 pre-execute 问；严格更宽模式让上游工具体问，正常有效调用只问一次。非法参数或在问之前取消等情况不能按“每次一定产生 asked”理解。 |
| 文件 write/edit 是不是永远不问？ | `D/packages/fs/tool-fs/src/sandbox.ts:88-112`；`D/packages/fs/fs-sandbox/src/index.ts:156-177` | 普通写不问；越界普通写是沙箱拒绝，不自动弹窗；**显式严格升权会问**。不能把文件工具统一标成永不审批。 |
| MCP 调用是否绕过 tools/pre-execute？ | `D/packages/mcp/mcp-client/src/tools.ts:131-150,225-246` 注册普通 ToolDefinition；`pipeline.ts:190-205,272-275` 同一门禁后才进入 execute | **不绕过通用链，但现有策略不问它。** 普通 MCP tools/call 默认直接执行；连接器工具自己在服务器端交互是另一回事，不能当成 dsh approval/asked。 |
| MCP 注解能否从 exec 读取？ | `D/packages/mcp/mcp-client/src/tools.ts:131-142,196-216,229-246` 没有把 annotations 带入定义；`D/packages/core/tools/src/contracts.ts:174-223`；`pipeline.ts:130-157` | **不能。readOnlyHint / destructiveHint 没有被桥接给 exec，也没有可依靠的 exec MCP 身份字段。** 不可直接实现 `exec.readOnlyHint` 或 `exec.schema.annotations` 分档。需在 bridge 注册时保留可信归属的 `(serverName, rawName, annotations)` 元数据，再让策略查询；未接线前应按未知处理，不能以工具名猜读写。 |
| cwd 省略是 HOME 吗？ | `D/packages/api/session-controller/src/index.ts:194` 捕获 process.cwd；`commands.ts:103-122` 使用 workspace.path ?? request.cwd ?? defaultCwd；`agent.ts:447-457` 建目录、写 header.cwd | **是 runtime 进程启动时 cwd，不是自动 HOME，也不是 DSH_HOME / PBOTS_DATA_DIR。** HOME 恰好等于启动 cwd 才会相等。 |
| 沙箱全部可写根是否只有 cwd？ | `D/packages/sandbox/sandbox-policy/src/index.ts:197-204`；`D/packages/sandbox/sandbox/src/roots.ts:82-99` | **workspaceRoot 等于不可变 session.header.cwd；完整可写集合不只它**，还包括显式 extra roots 和后端规定的临时区域。不要用“只允许写 cwd”描述 workspace-write。 |
| 改 working_directory 会不会扩大 workspaceRoot？ | `D/packages/session/tool-working-directory/src/index.ts:20-39`；`D/packages/session/working-directory/src/index.ts:163-191`；sandbox-policy `:201` 始终读 header.cwd | **不会。** 改的是会话投影 cwd，不是 header.cwd；执行位置可变，初始沙箱工作区边界不随之扩大。 |
| D9 是否已经让模型不能修改 profile？ | `D/packages/bundle/web-app/presets/standard.patch.yml:125-127`；`D/packages/boot/plugin-manager/src/tools.ts:87-110,140-156` | **不能如此推断。** standard 仍带 plugin_manager，所有动作（连 list）通过一次 danger-full-access 升权审批后可进入操作；UI/RPC 的 D9 白名单限制不等于模型工具被移除或设为 NEVER。这是 §7 第10行需要覆盖的额外入口。 |

## 2. 默认模型工具全表

### 2.1 共同语义

`问`列指 dsh **approval/asked 审计事件**，不是“任意用户交互”。在有效 session/turn、未提前取消、参数通过相关校验的正常路径下：

- `是`：会调用 approval.request；`条件`：仅指定条件问；`否`：该工具直接调用自身不问。
- asked 是审计事件，不等于已经向 UI 成功显示卡片：`user-approval.request` 先 append asked，再 decide；没有 answerer 也会记录 asked 后 unavailable，policy=never 则记录 asked 后 rejected，不派发 approval/request（`D/packages/interaction/user-approval/src/index.ts:242-260,293-310`）。
- 所有普通工具都经过公共 pre-execute。当前 shell-ask 对非 bash 调用 next；tool-jobs 的 pre-execute 只是记录输出限制并 next（`D/packages/jobs/tool-jobs/src/index.ts:285-290`），并非审批策略。
- standard 插件清单依据 `D/packages/bundle/web-app/presets/standard.patch.yml:10-130`。全新默认会话有 **32 个固定工具**；另有 `exit_plan_mode` 按状态可见（合计33个名字），外加所选连接器动态工具/资源工具。下表每个名字单列，条件工具另外说明。

| # | 模型工具名 | 问 | 当前行为与源码锚点（D/ 下） |
|---|---|---|---|
| 1 | working_directory | 否 | 读/改当前工作目录；没有批准请求。`packages/session/tool-working-directory/src/index.ts:20-39`；host 基础层保留此工具：`packages/bundle/base/cordis.patch.yml:166-170`。 |
| 2 | bash | 是/条件 | 上游普通命令本来不问；**我们的 patch 后普通必问**。严格升权由上游审批；同模式仍由 patch 问，未知/更窄模式先问后可能被工具校验拒绝。`A/sdk/src/policy/shell-ask.mjs:43-58`；`packages/shell/tool-bash/src/index.ts:369,479-484`。 |
| 3 | read | 否 | 包括工作区外读取，没有 read-approval 门。`packages/fs/tool-fs/src/read.ts:78`；fs-sandbox 只覆盖写/改/删/移，不覆盖读：`packages/fs/fs-sandbox/src/index.ts:80-142`。 |
| 4 | read_image | 否 | 默认附件存储存在，工具被注册；模型图像能力等后续校验可能拒绝，但不是审批。`packages/fs/tool-fs/src/index.ts:86-92`；`packages/fs/tool-fs/src/read-image.ts:211`；附件默认挂载：`packages/bundle/base/cordis.patch.yml:143-147`。 |
| 5 | write | 条件 | 普通写0问；严格升权问；越界普通写沙箱报错，不自动问。`packages/fs/tool-fs/src/write.ts:74,114-118`；`packages/fs/tool-fs/src/sandbox.ts:88-112`。 |
| 6 | edit | 条件 | 同 write。`packages/fs/tool-fs/src/edit.ts:86,121-125`；`packages/fs/tool-fs/src/sandbox.ts:88-112`。 |
| 7 | glob | 否 | 路径搜索不问。`packages/fs/tool-fs-search/src/glob.ts:322`。 |
| 8 | grep | 否 | 内容搜索不问。`packages/fs/tool-fs-search/src/grep.ts:287`。 |
| 9 | job_output | 否 | 读取既有 job 输出不问。`packages/jobs/tool-jobs/src/index.ts:433`。 |
| 10 | job_list | 否 | 列 job 不问。`packages/jobs/tool-jobs/src/index.ts:541`。 |
| 11 | job_kill | 否 | 停自己可访问的 job；不单独审批。`packages/jobs/tool-jobs/src/index.ts:561`。 |
| 12 | schedule_create | 否 | 创建提醒/后续任务不问；将来触发的工具另算。`packages/schedule/tool-schedule/src/index.ts:372`。 |
| 13 | schedule_list | 否 | 列计划不问。`packages/schedule/tool-schedule/src/index.ts:394`。 |
| 14 | schedule_view | 否 | 查看计划不问。`packages/schedule/tool-schedule/src/index.ts:417`。 |
| 15 | schedule_edit | 否 | 编辑计划不问。`packages/schedule/tool-schedule/src/index.ts:431`。 |
| 16 | skill | 否 | 加载技能本身不问；技能提示词引发的后续工具各自判断。`packages/skill/tool-skill/src/index.ts:85`。 |
| 17 | get_goal | 否 | 读目标不问。`packages/goal/tool-goal/src/index.ts:196`。 |
| 18 | create_goal | 否 | 写目标不问。`packages/goal/tool-goal/src/index.ts:208`。 |
| 19 | update_goal | 否 | 改目标不问。`packages/goal/tool-goal/src/index.ts:235`。 |
| 20 | list_agents | 否 | 列子代理不问。`packages/subagent/tool-subagent-control/src/list-agents.ts:82`。 |
| 21 | send_message | 否 | 代理间发消息不问；这里不是外部连接器的发信工具。`packages/subagent/tool-subagent-control/src/index.ts:30`。 |
| 22 | interrupt_agent | 否 | 中断子代理不问。`packages/subagent/tool-subagent-control/src/index.ts:76`。 |
| 23 | subagent | 否 | 派生代理动作本身不问。`packages/subagent/tool-subagent/src/index.ts:163,209,335`；standard 选 spawn：`packages/bundle/web-app/presets/standard.patch.yml:94-100`。 |
| 24 | subagent_fork | 否 | fork 动作本身不问；子代理内工具另算。`packages/subagent/tool-subagent/src/index.ts:163,209,335`；standard 选 fork：`packages/bundle/web-app/presets/standard.patch.yml:101-105`。 |
| 25 | list_subagent_models | 否 | 配了 modelDiscovery=true，注册模型发现工具；授权路由限制不是审批。`packages/subagent/tool-subagent/src/index.ts:196`；`packages/subagent/tool-subagent/src/list-models.ts:109-132`。 |
| 26 | workflow | 否 | 编排动作不问；内部派生代理/工具各自判断。`packages/workflow/tool-workflow/src/index.ts:331-377,409-417`。 |
| 27 | ask_user_question | 否 | **会问用户问题，但走 userQuestions，不是 approval/asked**。`packages/interaction/tool-ask-user/src/index.ts:39-40,100-107`。 |
| 28 | todo_write | 否 | 更新 todo 不问。`packages/todo/tool-todo/src/index.ts:137`。 |
| 29 | web_search | 否 | 搜索请求没有审批门；provider/key 可用性是另一层，缺凭证可能失败。`packages/web/tool-web/src/search.ts:363`；默认 provider：`packages/bundle/base/cordis.patch.yml:466-480`。 |
| 30 | web_fetch | 否 | HTTP fetch 不问；有目的地址安全校验，但不是 approval。`packages/web/tool-web/src/fetch.ts:459`；默认启用：`packages/bundle/web-app/presets/standard.patch.yml:118-122`。 |
| 31 | present | 否 | 展示产物不问。`packages/deliverables/tool-present/src/index.ts:38-39`。 |
| 32 | plugin_manager | 是 | 默认 profileContext 存在，所以在 standard 启用。**所有 action（包括只读 list）都请求 danger-full-access 单次升权**。`packages/bundle/web-app/presets/standard.patch.yml:125-127`；`packages/boot/plugin-manager/src/tools.ts:85-110`。 |
| 条件 | exit_plan_mode | 否 | 全新普通会话不可见；selectedActive 或曾进入 plan mode 后可见。执行仅在当前 plan active 时成功；以 userQuestions 做计划确认，非 approval/asked。`packages/plan/plan-mode/src/index.ts:280-316,375`。 |

**不在默认名单的常见误判**：

- `apply_patch`：参考仓注册开关默认为 false，standard 明确 false（`D/packages/fs/tool-fs/src/index.ts:36-53,101`；standard `:29-31`）；**已装 alpha.2 的 tool-fs 产物尚无这个工具**，见 §5，不能把它写进今天可见工具表。
- `pwsh`（Windows 条件）、persistent shell/terminal、`run_code`（PTC preset/executor）、cordis 工具、plugin_market 均不是本 Linux standard 默认工具：standard `:21-26,125-130`；native 默认/PTC 禁用见 `D/packages/bundle/base/cordis.patch.yml:496-505`。
- 子代理 bash 不宜沿用“全部 bash 必问”结论：dsh 派生子代理会 pin `approvalPolicy='never'`（`D/packages/subagent/subagent/src/child-agent.ts:243-274`）；我们的 shell-ask 对有效 never 直接 next（`A/sdk/src/policy/shell-ask.mjs:45,85-103`）。因此该子代理普通 bash 不经本策略 ask；若其工具体显式升权请求 approval，则 asked 被记下后自动拒绝。这是 root 默认会话与派生会话的差异，不等于关闭沙箱。

## 3. MCP 连接器调用和注解

| 问题 | 证据 | 结论 |
|---|---|---|
| 连接器增加哪些工具？ | `A/sdk/src/p2temp/index.mjs:73-79,190-196,233-260` 取基础 preset 行并附连接器行；`D/packages/mcp/mcp-client/src/tools.ts:81-86,121-150` 发现后注册 | 名字是 `mcp__<serverName>__<rawName>`；非法字符/长度需归一化并带 hash，不能按字符串反拆来恢复 MCP 原身份。准确动态名单由该 session 选中的服务器 tools/list 决定，不存在通用固定全表。 |
| 调用会触发 asked 吗？ | mcp-client `tools.ts:225-246,272-287` 的 execute 调 callTool；通用 pipeline `:190-205` 默认 allow；shell-ask `:44` 对非 bash next | **当前不会仅因是连接器而触发 asked，读/写/破坏性/未标注全部一样。** 要求连接器写 ASK 是新策略，而不是启用现成开关。任意第三方 bundle 自己附加策略的情况需另审。 |
| toolDefinition: tool 已经保存 annotations 吗？ | mcp-client `tools.ts:131-142` 把完整 tool 只闭包给 MCP SDK callTool 的 options；`createMcpToolDefinition` `:229-246` 返回的 harness 定义没有 annotations | 这是 MCP SDK 调用参数，**不是** harness tools/pre-execute 的 exec 元数据；SDK 内部拥有原始 tool 不代表策略可以读取它。 |
| exec.schema 能否作为兜底？ | `D/packages/core/tools/src/contracts.ts:182-183` 标注它是 PTC inner binding-time schema；`pipeline.ts:139` 只透传调用方提供的 schema；mcp-client `:231-246` 从未注入 hint | 不可靠。native 常规调用甚至不保证有 schema；即使有也未接 MCP hints。不能据此实现 BRIEF §7 第7–9行。 |
| MCP resources 呢？ | `D/packages/mcp/mcp-resources/src/index.ts:85-99,107-125` 首个 provider 注册时挂资源工具；`src/tools.ts:34,43,52` | 有资源 provider 时还会出现 `list_mcp_resources`、`list_mcp_resource_templates`、`read_mcp_resource`；三者当前也不问。没有 provider 时这三者不属于全新默认32个工具。 |
| 我们的 marketplace wrapper 是否另加审批？ | `A/sdk/src/market/wrapper.mjs:150-165` 只生成 dsh-mcp-client stdio 行；p2temp `:190-196` 直接创建 session | 没有。MCP 服务器可有自己的目录/权限约束，但不能当成 dsh approval，也不能假定它继承 bash 的 OS 沙箱。 |

**复用结论：集成既有 dsh pipeline（阶梯1）+ 最小 bridge 适配；不要新建 MCP 执行器。** 当前上游 seam 足够承载按工具名查表/返回 ask，但按 hints 分档的输入缺失，必须先补元数据路径或先统一按未知=写；本报告不授权放宽默认审批值。

## 4. session/create 省略 cwd：端到端与沙箱根

| 问题 | 证据 | 结论 |
|---|---|---|
| UI #4 传了什么？ | `A/ui/main/m3-meta/orchestrate.ts:114-119` 只有调用方传 cwd 才放入 request；`A/sdk/src/p2temp/index.mjs:190-196` 原样转 sessionController.create | 当前没有按 bot 分配目录，也没有在这里把缺省 cwd 改成 HOME/workspaces。 |
| 普通 #3 session/create 呢？ | `D/packages/api/session-controller/src/index.ts:194`；`commands.ts:103-122` | 同样使用 controller 构造时捕获的 runtime process.cwd()。显式 workspaceId 优先用 workspace.path；显式 cwd 用该值。 |
| runtime 为什么继承 cwd？ | `A/sdk/scripts/start.mjs:1` 只 import；`A/sdk/src/start.ts:504-509,528` spawn options **没有 cwd**；CLI 初始化使用 process.cwd：`D/apps/cli/src/profile-boot.ts:320` | 从启动 SDK launcher 的父进程继承。`P2SDK_HOME` / `DSH_HOME` 设数据目录不会自动 chdir；不能仅凭仓库所在路径断言线上运行时绝对 cwd。 |
| 当前究竟是 /home/lingxufeng/bot 还是 app/sdk？ | `A/ui/tests/support/sdk-runtime.ts:68-76` 测试专门支持 opts.cwd；本报告未读取活进程 /proc/cwd 或具体启动服务工作目录 | **具体运行中绝对路径未验证**。`pnpm --dir app/sdk start` 类启动可能在 app/sdk；从其他工作目录启动则是其他路径，不能硬写为 HOME。静态上可确定的是继承关系与回退公式。 |
| header.cwd 与可变当前 cwd 是否一样？ | `D/packages/api/session-controller/src/agent.ts:447-457` 建目录并写 header；`D/packages/session/working-directory/src/index.ts:163-191` 变更写 working-directory/change；sandbox-policy `:197-204` 用 header.cwd | 新建时相同；working_directory.cd 后可不同，沙箱仍按初始 header.cwd。bash workdir 只是命令执行目录，不构成新写权限。 |
| 默认可写集合？ | `D/packages/bundle/base/cordis.patch.yml:243-247` 默认 workspace-write、process.cwd，无 extra roots；`sandbox-policy/src/index.ts:201-202`；`sandbox/src/roots.ts:82-99` | 工作区基根 = session.header.cwd（省略时是 runtime 初始 cwd）；fs fence 的集合 = canonical workspaceRoot + additionalWritableRoots + `/tmp` + os.tmpdir()，默认 extra roots 空。 |
| bash 的临时区域与 fs 完全一致吗？ | `D/packages/sandbox/sandbox/src/roots.ts:1-11,70-77` 明确 bwrap/Landlock 自有 temp 机制 | 不能只凭 roots.ts 声称“bash 可写宿主全部 /tmp”；bwrap 是临时挂载，其他后端有自己的 temp grants。实际后端与可访问区域由 R5 验证。 |

**对 BRIEF 的纠偏**：§4 的担心成立，但精确说法应是“现在缺省 cwd 继承 SDK runtime 启动目录，初始沙箱工作区可能覆盖仓库/SDK目录；并非必然 HOME”。A1 要在 main 创建时显式强制独立目录，并验证 header.cwd；只改变模型提示词或后续 working_directory 不能缩小初始工作区根。

## 5. 已安装 npm 产物交叉核对（防源码/发布差异）

以下绝对路径为本机实际产物，均只读检查；表中行号可直接定位，不依赖 README。

| 产物路径/锚点 | 核对结果 |
|---|---|
| `/home/lingxufeng/bot/app/sdk/node_modules/.pnpm/@deepseek-ai+dsh-web-app@0.2.2-alpha.2_17b2e48b78ef39fb520c787ba13e6ea3/node_modules/@deepseek-ai/dsh-web-app/presets/standard.patch.yml` | 与参考仓的唯一区别为 tool-fs 行没有 applyPatch:false 配置；其他 standard 插件清单一致。 |
| `/home/lingxufeng/bot/app/sdk/node_modules/.pnpm/@deepseek-ai+dsh-tool-fs@0.2.2-alpha.2_4ddf23c76af33848b24300991507a126/node_modules/@deepseek-ai/dsh-tool-fs/lib/index.js:1197-1235` | 默认 read/readImage/write/edit；没有 apply_patch 注册实现。该产物 `:1129-1157` 仍有 resolvePolicy → approveEscalation，因此 write/edit 显式升权会问的结论成立。 |
| `/home/lingxufeng/bot/app/sdk/node_modules/.pnpm/@deepseek-ai+dsh-mcp-client@0.2.2-alpha.2_ae3c7983d072d76e13b58b7b6d93451a/node_modules/@deepseek-ai/dsh-mcp-client/lib/index.js:127-153,179-197` | 完整 MCP tool 只留在 callTool 闭包，注册定义没有 annotations，与参考源码结论一致。 |
| `/home/lingxufeng/bot/app/sdk/node_modules/.pnpm/@deepseek-ai+dsh-tools@0.2.2-alpha.2_d570a50fd9051dfa7084c71da173b036/node_modules/@deepseek-ai/dsh-tools/lib/pipeline.js:386-387,608-634` | pre-execute 默认 allow，仅 ask 走 serviceAsk。 |
| `/home/lingxufeng/bot/app/sdk/node_modules/.pnpm/@deepseek-ai+dsh-api-session-controller@0.2.2-alpha.2_6510dac094c05b9dc1a7e8bee5d04e7b/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js:673,3798` | 缺省 cwd = process.cwd，与参考源码一致。 |
| `/home/lingxufeng/bot/app/sdk/node_modules/.pnpm/@deepseek-ai+dsh-sandbox-policy@0.2.2-alpha.2_8bea2fd5758beb21221f1e201a3f020d/node_modules/@deepseek-ai/dsh-sandbox-policy/lib/index.js:134,170` | workspaceRoot 使用不可变 header.cwd，缺省回退部署 root。 |
| `/home/lingxufeng/bot/app/sdk/node_modules/.pnpm/@deepseek-ai+dsh-plan-mode@0.2.2-alpha.2_89bae4dcf8833d9ebf505cb13beef854/node_modules/@deepseek-ai/dsh-plan-mode/lib/index.js:324` | exit_plan_mode 状态条件与参考源码一致，不应算全新会话固定可见工具。 |

本次是对已有依赖实际行为的源码调查，不是新依赖选型；未做无关 GitHub 候选/npm 竞品搜索，没有新增依赖、自建组件、修改产品文件或启动服务。
