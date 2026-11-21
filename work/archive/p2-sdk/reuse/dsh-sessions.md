# dsh session 持久化、生命周期与进程模型

## 查证范围与证据口径

本次只读检查 `/home/lingxufeng/bot/repos/deepseek-harness`，基线为 `ce7073d51254c26cd63b22a60835b8f948deb447`。下文所有 `packages/…` 路径均相对此目录，均为该基线的源码行号。先读了 `work/LEARNINGS.md`；项目根目录没有 `cards/`，因而没有可检查的主卡、案例卡或 `SUBCARD_INDEX.tsv`。参考仓没有 `.codegraph/`，使用源码检索。没有读取真实用户 home、凭证或真实 session 内容，也没有启动模型或运行上游测试。

GitHub MCP 已用 `search_code` 定位 server 实现，并按同一 SHA 实读 `packages/sdk/protocol/src/types.ts` 与 `LICENSE`；`list_commits` 返回的远端最新 SHA 与本地相同。最近提交时间是 **2026-10-29 16:13:15 UTC / 2026-10-30 00:13:15 +08:00**。维护证据为 https://github.com/deepseek-ai/deepseek-harness/commit/ce7073d51254c26cd63b22a60835b8f948deb447 ，许可证证据为 `LICENSE:1-21`（MIT）。本次判断面向源码基线，不等于验证了某个 npm 发布包的实际行为。

## 决策行

| 能力 | 候选（owner/repo@path） | 许可证 | 维护（最近 commit） | 决策 | 理由 / 适配工作量 |
|---|---|---|---|---|---|
| Session 持久化与崩溃恢复。 | `deepseek-ai/deepseek-harness@packages/session/session-persistence-jsonl`、`packages/core/agent-loop`。 | MIT，见 `LICENSE:1-21`。 | `ce7073d`，2026-10-30 +08:00。 | 集成 | 直接沿用现有 JSONL/Zstandard 日志、跨进程写锁和中断轮次修复，不自建数据库或历史格式。P2 需固定 `DSH_HOME` 并保留 session id；恢复链路见 `packages/core/agent-loop/src/index.ts:763-827`。 |
| 重启后的列表与历史读取。 | `deepseek-ai/deepseek-harness@packages/api/session-controller`、`packages/session-query`。 | MIT，同上。 | 同上。 | 集成 | 现有 Remote API 已提供 cold-safe 的 list 与 events，能够在不激活 Agent 的情况下读持久化数据。若最终选择 stdio SDK，则必须改造其协议以暴露这些已有服务；原样 SDK 缺少 list/history，不能单独交付 D5。证据为 `packages/api/session-controller/src/index.ts:272-281,521-541` 与 `packages/sdk/protocol/src/types.ts:210-219`。 |
| 单进程的 per-session preset / 模型配置。 | `deepseek-ai/deepseek-harness@packages/api/session-controller`、`packages/preset/agent-preset-registry`；对照候选为 `packages/sdk/server`。 | MIT，同上。 | 同上。 | 集成 | 优先复用 API 的 `create(agentPreset)` 与 `selectModel(sessionId, …)`。原样 stdio SDK 只有进程级初始化配置，且创建代码明确不做 preset composition；若接口决策必须选择 stdio，应将这行改为对 SDK server 的局部「改造」，复用既有 Agent/preset 服务，而不是自建 session 后端。证据为 `packages/api/session-controller/src/types.ts:264-291`、`packages/api/session-controller/src/commands.ts:103-168`、`packages/sdk/server/src/server.ts:563-592`。 |
| 多 session 执行与进程生命周期。 | `deepseek-ai/deepseek-harness@packages/sdk/client`、`packages/sdk/server`、`packages/core/agent-loop`。 | MIT，同上。 | 同上。 | 集成 | 推荐一个常驻 dsh runtime 承载多个 session，而不是每个 session 重启一整套 profile。现有 server 已按 id 管理 Agent，协议支持并发请求和带 sessionId 的事件，普通 Agent 错误有局部收敛。这样复用最多、重复运行时最少；代价是接受进程级共同故障域。证据为 `packages/sdk/server/src/server.ts:103-118,171-186,543-595`、`packages/sdk/protocol/src/transport.ts:186-194`、`packages/core/agent-loop/src/agent.ts:230-280`。 |

上述是侦察推荐，不替代 S3/S9 的接口与架构拍板。最重要的边界是：**「底层已有能力」不等于「默认 sdk profile 已把能力暴露给 SDK client」。**

## 1. 持久化目录、文件格式、重启后的接口

### 1.1 权威数据存放在哪里

默认 home 是 `~/.dsh`，可用 `DSH_HOME` 覆盖；显式配置优先于环境变量，环境变量优先于默认值。证据为 `packages/util/home-paths/src/index.ts:11-18,66-72,93-109,124-130`。SDK client 的 `dshHome` 选项最终通过子进程环境变量 `DSH_HOME` 传入，见 `packages/sdk/client/src/launch.ts:132-150`。

基础 bundle 将持久化根目录配置为 `dshHomePath('sessions')`，见 `packages/bundle/base/cordis.patch.yml:138-141`；`sdk-minimal` 也显式配置该根目录，见 `packages/bundle/sdk-minimal/cordis.patch.yml:172-175`。因此默认落盘结构是：

```
$DSH_HOME/sessions/<project-key>/<encoded-session-id>/session.v4.jsonl.zstd
```

其中 `<project-key>` 由会话 header 的 cwd 转换而来，没有 cwd 时使用 `_no-cwd`；session id 必须编码成安全路径段，不能直接拼接。对应实现是 `packages/session/session-persistence-jsonl/src/format.ts:225-287`。当前逻辑格式版本为 4，见 `packages/core/session/src/types.ts:90`；规范文件名为 `session.vN.jsonl`，见 `packages/session/session-format/src/filename.ts:5-16`；压缩后缀为 `.zstd`，见 `packages/session/session-persistence-jsonl/src/format.ts:34-59`。

默认物理编码是 Zstandard，而不是可直接逐行读取的裸文本；可配置 `compression: none` 得到 `.jsonl`。默认值与 schema 见 `packages/session/session-persistence-jsonl/src/index.ts:69,84-88,103`。解码后的首条记录是带 `type: 'session'`、version、id、createdAt、cwd、可选 agentPreset 等字段的 header，其后是 session events；header 结构见 `packages/session/session-persistence-jsonl/src/format.ts:79-98`。持久化 batch 首次写入时物化文件，后续追加，见 `packages/session/session-persistence-jsonl/src/index.ts:904-936`。不要把「每个格式版本的 generation 文件」误解成「每次对话都重写一个不可变完整文件」：当前 generation 仍有追加路径。

POSIX 下同目录还有 `session.lock`，它使用内核 flock 持有整个写 handle 生命周期，竞争时拒绝，进程死亡后由内核释放；它不是依赖超时清理的租约。见 `packages/session/session-persistence-jsonl/src/lease.ts:1-27,39-40,70-96`。可以多个 dsh 进程共享 sessions 根目录并读取历史，但不能同时写入同一个 session id。

### 1.2 重启后的 API 现状

| 需求 | TypeScript stdio SDK 的实际接口 | 现有 Remote / `/api` 能力 | 结论与证据 |
|---|---|---|---|
| 列出重启前的会话。 | 没有 `listSessions` 及对应 JSON-RPC 方法。 | `session.list`，HTTP carrier 对应 `POST /api/session/list`。 | API 可行。`SessionController.list` 调用列表服务；列表服务读取 attached 与 persisted session，不需要恢复 Agent。见 `packages/api/session-controller/src/index.ts:272-281`、`packages/api/session-controller/src/list.ts:132-160`。SDK 请求全集见 `packages/sdk/protocol/src/types.ts:210-219`，server 对未知方法报错见 `packages/sdk/server/src/server.ts:498-539`。 |
| 恢复已有会话继续运行。 | `await harness.resumeSession(savedId)`，底层为 `session/resume`。 | 没有同名 Remote `resume`；需要 Agent 的操作通过 `resolveAgent` 按需恢复，例如 `selectModel`、发 prompt 的执行路径。 | SDK 已有真正的恢复，不必自建。高级方法见 `packages/sdk/client/src/api.ts:109-118`；低级方法见 `packages/sdk/client/src/client.ts:363-369`；API 恢复实现见 `packages/api/session-controller/src/agent.ts:294-328`、`packages/api/session-controller/src/commands.ts:149-162`。 |
| 读取旧历史消息。 | 没有 history/events-page 请求；`session.event` 是运行中的事件通知，不是历史查询。 | `session.events`，HTTP 为 `POST /api/session/events`；兼容旧方法 `POST /api/session/page`，但该方法已 deprecated。 | API 可行，返回按消息对齐、按时间顺序的事件页，而非只返回纯文本聊天数组。见 `packages/api/session-controller/src/index.ts:521-541`。分页接受 address、throughSeq、beforeSeq、maxMessages，见 `packages/api/session-controller/src/types.ts:467-483`；默认消息预算为 50，见 `packages/api/session-controller/src/history.ts:25-27`。 |

这些 HTTP 地址由 `/api` channel 与 Remote namespace/method 组合得出：namespace 为 `session`，见 `packages/api/session-controller/src/index.ts:178-180`；gateway 注册 `/api`，见 `packages/api/gateway/src/index.ts:248-253`；HTTP carrier 要求 POST、JSON Content-Type，并校验 RPC envelope 的 method 与 URL endpoint 一致，见 `packages/client/connection/src/rpc-host.ts:305-343,361-367`。**它们不是裸 REST JSON body 接口**；调用方应使用现成 Remote client 或匹配该 envelope。

历史读取的 `address` 应为普通 session address（类型见 `packages/api/session-controller/src/types.ts:468-469`，具体 address 校验见 `packages/api/session-controller/src/history.ts:50-78`）。历史 controller 通过 `ctx.sessionQuery.observeSession` 取得日志，见 `packages/api/session-controller/src/history/controller.ts:164-172`；读取历史不等于恢复 shell、浏览器等外部进程。

必须显式区分 SDK 的两种操作。`harness.session(savedId)` 只产生惰性句柄，没有 wire traffic，也不会请求从磁盘恢复；见 `packages/sdk/client/src/api.ts:99-118`。`session/resume` 会保留已有 identity 和 directory、修复中断轮次，不发送输入；session 不存在、已打开、损坏或被其他 writer 占用时会失败，不会悄悄新建替代会话，见 `packages/sdk/server/src/server.ts:342-364`。底层先获取写 ownership、读取日志，再追加缺失的工具错误、step/end、turn/end 等合成收尾记录，见 `packages/core/agent-loop/src/index.ts:785-827`。

默认 sdk profile 的 sdk-app patch 装入 JSON-RPC server，并明确不启动 Web server，见 `packages/bundle/sdk-app/cordis.patch.yml:11-21,46-50`；`api-session-controller` 是 web-app bundle 装入的组件，见 `packages/bundle/web-app/cordis.patch.yml:117-118`。因此不能只执行默认 SDK 启动命令，就假定上述 HTTP API 同时存在。P2 若选 `/api`，需要组合对应 gateway/controller 及依赖；若选 stdio，需要暴露已有查询服务。两条路都不需要重新发明历史存储。

**对 D5 的判断：现有持久化和恢复实现可复用；原样 stdio SDK 尚不满足「重启后 list 并取历史」这一完整验收。** D5 的落地工作是接口装配或局部协议改造，不是写第二套 session 数据库。未运行 kill/restart 测试，不能把上述静态结论记为 D5 PASS。

## 2. 建 session 时是否能指定 preset、模型或配置

### 2.1 原样 stdio SDK：不能按 session 在创建请求指定这些项

`InitializeParams` 是**进程级**握手，其 cwd、provider、model、reasoningEffort、maxTokens 被定义为所有 SDK-created Agent 的配置，见 `packages/sdk/protocol/src/types.ts:17-33`。高级 `DeepSeekHarness` 在 constructor 保存这些选项，并在 `start()` 中只握手一次，见 `packages/sdk/client/src/api.ts:24-46,70-81`。

没有独立的 `session/create` wire 方法。未知 id 首次 prompt/query 时惰性创建；请求只有 sessionId 与 contentBlocks，见 `packages/sdk/protocol/src/types.ts:70-76,98-104,210-219`。server 的 query handler 还会拒绝这两项之外的字段，见 `packages/sdk/server/src/server.ts:504-511`。

更直接的证据是 `createSession`：它明确写了 **No preset composition**，使用 `this.provider`、`this.model`、`this.reasoningEffort`、`this.maxTokens` 建 Agent，见 `packages/sdk/server/src/server.ts:563-592`。SDK resume 的 setup 也主动用本次 initialized route 替换已恢复 Session 的模型选择，见该文件 `574-586`。因此「模型曾在日志中记录」不代表默认 SDK resume 会继续沿用旧模型。

可以改变单个 session 的有效 working directory，因为已有 `session/working-directory/get|set`，见 `packages/sdk/protocol/src/types.ts:130-145,216-217`。但是 cwd 的特例不等于通用 per-session 配置。

### 2.2 现有 API / 底层：能力已经存在

`SessionCreateRequest` 接受 `agentPreset`，以及 cwd、workspaceId、可选 sessionId，见 `packages/api/session-controller/src/types.ts:264-281`。创建路径将 preset 交给 `composeAgent`，后者 resolve 后向 Agent 的私有作用域 mount preset，见 `packages/api/session-controller/src/commands.ts:103-141`、`packages/api/session-controller/src/agent.ts:239-242,271-281`。这要求部署实际装入 preset registry 和相应 roster；没有 roster 不能靠传一个名字使 preset 生效。

创建 request 本身不接受直接 model 字段；模型使用单独的 `session.selectModel` 请求按 sessionId 设置，见 `packages/api/session-controller/src/types.ts:285-291` 与 `packages/api/session-controller/src/commands.ts:149-168`。`agent.model.select` 将配置写为该 session 的 `model/selection` 事件，且 current 优先读取已记录选择，见 `packages/core/agent/src/model-selection.ts:98-120`。这是现成的 per-session 模型状态，不是修改全局变量后碰运气。

需特别注意 API 的副作用：`selectModel` 同时异步保存 host 默认模型，见 `packages/api/session-controller/src/commands.ts:162-166`。尚未记录自身选择的 session 会跟随 default 变化，见 `packages/api/session-controller/src/agent.ts:464-471`。D4 的测试必须给两个 session 都显式 selectModel，或者选择明确不同的 preset；不能把「只设了 X、Y 没设」作为严格隔离用例。

查询配置时不要假设 `session.state` 返回 model/preset；其结构只有 cursor、active、running、queue、pendingInput，见 `packages/api/session-controller/src/types.ts:596-606`。应复用 `session.projections` / 列表附带 projections，或检查持久化 `model/selection` 与实际请求记录；对应 Remote projections 入口见 `packages/api/session-controller/src/index.ts:617-620`，列表附带 projections 见 `packages/api/session-controller/src/types.ts:151-164`。如果 P3 要求固定字段的 session-info 响应，那是后续契约题，不应宣称 SDK 已有该接口。

**对 D4 的判断：原样 stdio SDK 单进程多 session 不满足要求；现有 API + preset/model 服务能覆盖主要能力。** 如果必须用 stdio，最小改造是给 session 创建/恢复增加明确的 session 配置入口，并在 setup 中复用现有 preset/model 能力；同时补一个已有投影的读取入口，而不是重新实现 Agent 或配置存储。

## 3. 进程模型、并发与隔离

### 3.1 SDK client 实际启动什么

公开 `HarnessClient.start()` 使用 Node `spawn` 启动 dsh，stdin/stdout/stderr 都是 pipe，见 `packages/sdk/client/src/client.ts:219-228`。命令参数是 `--profile <profile>` 加 patch，profile 默认是 `sdk`，见 `packages/sdk/client/src/launch.ts:132-148`。这不是 SDK 把 Agent loop 直接加载到调用方进程。

但 **一个 SDK client 的 child 可以承载多个 session**：server 内部用 Map 保存多个 session/创建中的 promise；创建只调用 `ctx.agents.create/resume`，不再为每个 session spawn 一套 dsh，见 `packages/sdk/server/src/server.ts:103-118,543-595`。所以准确模型是「宿主进程 → 一个 client 对应一个 runtime 子进程 → 该 runtime 内多个 Agent/session」，不应把「SDK 会 spawn」误写成「每个 session 必然 spawn」。工具和某些插件仍可能另起进程，这不改变 session 本身的模型。

### 3.2 两种模式的比较

| 维度 | 一个 dsh runtime 承载 N 个 session。 | 每个 session 各建一个 SDK client / dsh runtime。 |
|---|---|---|
| 并发调度与上限。 | 所检查的 SDK server、Agent loop 与 LLM 主服务路径没有发现 session 数的硬编码配额或全局串行锁。transport 逐行收到请求后用 `void handleLine` 并发处理；每个 Agent 自己维护 phase 和 driver。相同 session 的工作由自己的 inbox/phase 顺序消费，不会每条 prompt 起独立线程。依据为 `packages/sdk/protocol/src/transport.ts:186-194`、`packages/core/agent-loop/src/agent.ts:230-257`。这支持异步 I/O 并行，不保证无限并发；实际限制仍是模型限流、事件循环、CPU、内存和插件资源。 | 宿主创建 N 个 client 即起 N 个 runtime，依据为 `packages/sdk/client/src/client.ts:190-195,219-228`。不同 runtime 可以使用不同 initialize 配置和进程事件循环；没有发现 SDK 提供自动进程池或容量控制。总并发仍受同一机器和模型账户限制，不会因为多进程自动绕过配额。 |
| 内存。 | 一套 runtime/profile、provider 与共享服务，另加每个活跃 session 的日志和 Agent 状态。server 的 sessions Map 一直保留记录到全局 shutdown，SDK 方法表没有 session-close/unload 方法，见 `packages/sdk/server/src/server.ts:462-479,593-595`、`packages/sdk/protocol/src/types.ts:210-219`；Session 自身保存事件数组，见 `packages/core/session/src/index.ts:526`。因此活跃/已打开 session 增多仍会增长内存。 | 每个 session 重复运行整套 profile 和 Node runtime，通常增加重复常驻成本，但可以通过关闭对应 client 结束整套 runtime。两种模式的 RSS/MB 没有实测，不能凭源码给固定节省比例。 |
| 普通会话错误。 | 已报告的 Agent failure/cancellation 在该 Agent 的 driver 边界 catch，回到 idle；SDK 按 session id 保存 failure，见 `packages/core/agent-loop/src/agent.ts:260-280`、`packages/sdk/server/src/server.ts:171-184`。因此普通模型/工具异常不等于整个 runtime 崩溃。单个 JSON-RPC handler 异常也转换为该请求的 error response，见 `packages/sdk/protocol/src/transport.ts:232-243`。 | 普通错误同样有上述局部处理。每个 runtime 只承载目标 session，宿主只需处理该 client 的失败。 |
| 致命故障与强制取消。 | OOM、进程退出、原生模块崩溃、同步死循环会影响同一个 runtime 内全部 session；client 在 child exit 时失败其全部 subscriptions，见 `packages/sdk/client/src/client.ts:262-272`。现有 wire 没有 cancel；请求 timeout 不会停止服务端工作，只能关 runtime，见该文件 `181-188`，因此这种强制处置会波及同进程其他 session。 | 一个 runtime 被 kill/OOM/卡死时，其他 runtime 不因这一个 child 的 exit 回调而自动退出；这是 OS 进程故障隔离，不是安全沙箱。相同机器整体 OOM、共享文件或共享凭证服务故障仍可能关联。关闭某个 client 只针对它拥有的 runtime，见 `packages/sdk/client/src/api.ts:131-139`、`packages/sdk/client/src/client.ts:190-195,262-272`。 |
| 配置与数据隔离。 | 原样 stdio 的创建配置是进程级；采用现有 API 或局部改造后可按 session 明确选择。session events 本身带 sessionId，见 `packages/sdk/server/src/server.ts:171-186`；client 的 `subscribeSessionTree` 按 session 及后代过滤，见 `packages/sdk/client/src/client.ts:469-478`。 | 不同 client 可以各用 provider/model/home/patch，但整个 home 若分开，list/history 的聚合也要宿主自己负责。共享 home 时可以复用持久化目录，但同 session 的 writer 仍受内核锁排他限制，见 `packages/session/session-persistence-jsonl/src/lease.ts:1-27`。不同进程并不天然隔离同一用户可访问的文件。 |

内存可以用概念模型表达为单进程 `B + ΣSᵢ`、多进程 `Σ(Bᵢ + Sᵢ)`，其中 B 是 profile/运行时开销、S 是会话日志与 Agent 状态。这只是解释重复开销，不是测量结果；共享库页、不同 plugin 的 lazy 初始化、工具 worker 等都会改变实测值。本次**没有可报告的最大 session 数、三会话 RSS 或额外进程数的实测数据**，也未把 session-corpus 历史查询 benchmark 当作 SDK 三会话并发数据。

### 3.3 推荐与验收边界

我推荐 P2 使用**一个常驻 dsh runtime 承载多个 session**，优先组合现成 Remote API 的会话管理与查询能力，并由 S3 决定对外载体。理由是目标只有同机 3 个 session 并发，现有运行时已经具备独立 Agent driver、按 session 标识的事件与持久化；重复启动整套 profile 并不能补齐 SDK 的 list/history 缺口，却会增加生命周期管理和重复常驻资源。若 S3 选 stdio，按上文局部改造接口即可，不应把原样 stdio 错记为 D4/D5 已满足。

只有在实测证明单个插件经常令整个 runtime 崩溃/阻塞，或者产品明确要求硬取消某个 bot 而不影响其他 bot 时，才值得切到每 session 一个 runtime。该模式确实增强进程故障隔离，但仍需复用同一持久化实现，并解决跨 runtime 列表/历史访问，不应另造历史格式。

D3 的现成结构支持并发与过滤，但静态阅读不是事件不串线的实测证据。后续最小验证应使用同一 profile、相同 fake provider、独立临时 DSH_HOME，对照「一个 runtime 三个 session」与「三个 runtime 各一个 session」：等待三条请求同时进入 provider，再交错放行，记录 sessionId 和事件归属，采集 runtime 与工具进程的 RSS/进程树，并分别模拟单 Agent 抛错与单 runtime 退出。D5 则必须单独验证写入完成后 kill/restart/list/events；不能把 SDK 仅恢复已有 id 的测试当作列表查询测试。这些验证尚未执行，应由主会话纳入 verifier/实现验收，不应现在声称 PASS。
