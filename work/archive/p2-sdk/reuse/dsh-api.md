# SDK 对外接口选型：dsh 三条通道

## 结论与复用决策

**建议将 B「HTTP `/api` + WebSocket `/api/remote.mux`」提交用户作为 MVP 首选契约。** 原因不是 SDK 不支持多 session，而是 B 已经同时覆盖面向前端的多逻辑流、会话快照与持久事件游标、可选实时 assistant chunk、浏览器鉴权和连接生命周期。A「SDK stdio JSON-RPC」适合后台单宿主客户端；若用来承接浏览器，仍要补网络桥接、客户端管理和实时 chunk 桥接。本建议尚未获得用户批准，不是接口定稿。

本地参考仓根为 `/home/lingxufeng/bot/repos/deepseek-harness/`。下文所有源码 `路径:行` 均相对此根。核对版本为 `ce7073d51254c26cd63b22a60835b8f948deb447`；本地最近提交与 GitHub `list_commits` 一致，UTC 时间为 **2026-10-29 16:13:15Z**。GitHub 提交证据：https://github.com/deepseek-ai/deepseek-harness/commit/ce7073d51254c26cd63b22a60835b8f948deb447 。许可证实读本地和上游 `LICENSE:1–13`，为 MIT，Copyright (c) 2026 DeepSeek。私用复用遵循项目规则，后续实现 commit 正文注明出处；对外分发另审。

| 能力 | 候选（owner/repo@path） | 许可证 | 维护（最近 commit） | 决策 | 理由 / 适配工作量 |
|---|---|---|---|---|---|
| 面向前端的多 session 命令与流式推送（推荐） | deepseek-ai/deepseek-harness@packages/client/connection；packages/api/gateway；packages/api/session-controller | MIT，LICENSE:1–13 | ce7073d，2026-10-29T16:13:15Z | 集成 | 直接复用 HTTP unary、WS mux 和 session/follow，显式开启 assistantStream。主要适配是部署 profile、前端状态映射、凭证入口和重连，不应另写一套 WS 协议。证据：connection/src/index.ts:119–164；gateway/src/index.ts:248–323；session-controller/src/web/controller.ts:32–76。 |
| 后台单宿主进程使用的多 session SDK（备选） | deepseek-ai/deepseek-harness@packages/sdk/client；packages/sdk/server；packages/sdk/protocol | MIT，LICENSE:1–13 | ce7073d，2026-10-29T16:13:15Z | 集成 | 原有客户端已拥有子进程、请求关联和通知订阅；不能将它误判成单 session。用于前端时需额外网络和多客户端桥接；源码未发现 SDK 转发 transient assistant chunks，逐 token 目标还需补事件桥。证据：sdk/client/src/client.ts:181–227；sdk/server/src/server.ts:171–215、543–595。 |
| 单任务命令行执行，不作为 MVP 常驻接口 | deepseek-ai/deepseek-harness@packages/bundle/headless | MIT，LICENSE:1–13 | ce7073d，2026-10-29T16:13:15Z | 集成 | 可以直接用于一次性任务或 smoke，而不承担常驻前端服务。现成实现输出结果或 JSONL 后退出；另用进程池包装它会绕开已有 SDK/API 的会话与连接管理。证据：headless/src/startup.ts:56–68；headless/src/index.ts:316–322、408–443。 |

没有提出自建方案：现成实现已覆盖核心能力。调研范围按派发限定为 dsh，未扩展成通用框架选型。未发现本地 cards 目录或 CodeGraph 索引；没有因此假设其他候选不存在。

## 1. 三条通道现状、入口与启动

这里的三条通道指 SDK stdio、宿主 HTTP `/api`、宿主 WS mux；后两者属于同一 Web 部署的命令与流式两条传输。headless 是额外的单任务 CLI，不应与常驻 SDK server 混为一谈。

### 1.1 SDK profile：newline-delimited JSON-RPC 2.0 over stdio

- 支持的启动路径是 `dsh --profile sdk`。`apps/cli/src/bin.ts:26–42` 将 profile 调用交给 `runProfile`；`packages/bundle/sdk-app/cordis.patch.yml:11–21` 装配 SDK startup 与 JSON-RPC server。profile 明确保留 stdout 给协议，且不启动 Web server（同文件:1、46–49）。不能因为该 profile 装载 connection service，就认为 `/api` 已监听。
- 传输入口为 `packages/sdk/server/src/index.ts:45–60`：默认 `process.stdin`、`process.stdout`，构造 `JsonRpcLineTransport` 与 `HarnessSdkJsonRpcServer`。input/output 可注入是测试或内部组合能力，不代表生产默认有进程内直接调用 API。
- 协议为每行一个 JSON-RPC 2.0 消息，消息结尾是换行。请求 id 与 pending map 关联；逐行处理没有等待前一请求结束的全局串行门。证据：`packages/sdk/protocol/src/transport.ts:1–4、126–165、186–194、232–243、266–267`。
- 方法包括 `initialize`、`session/prompt`、`session/query`、`session/resume`、`session/wait`、`session/working-directory/get`、`session/working-directory/set`、`shutdown`。证据：`packages/sdk/server/src/server.ts:498–540`。一次 initialize 配置 server 的 cwd/provider/model 等默认值，不是每个 session 各自启动一套 runtime（同文件:223–262）。
- Server 持有 session Map，并合并同 session 的并发创建；不同 session 可分别创建或恢复 Agent。证据：同文件:91–118、543–595。同 session 的并发输入应由该 session 的队列/运行语义处理，不意味着同一 Agent 并行执行两个 turn。
- 通知包含 `session.event`、`session.status`、子 agent 生命周期等。`session.event` 是会话日志被记录时推送的事件（`sdk/protocol/src/types.ts:151`；`sdk/server/src/server.ts:171–215`），不能等同逐 token 文本。对 SDK server 源码的检索未发现 `agent/assistant-stream` 转发；这是当前版本的源码结论，不是证明所有历史版本或插件都不支持。
- 官方 TS 客户端会启动并拥有一个子进程，而非默认进程内直连。`sdk/client/src/client.ts:190–227` 使用 pipe stdio；`sdk/client/src/launch.ts:128–150` 默认 profile 为 sdk，并构造 `--profile` argv。该客户端还校验 dsh 与客户端版本一致（同文件:55–65）。
- `shutdown` 管整个 root runtime 的清理和退出，不只是某一个 session（`sdk/server/src/index.ts:48–74、89–103`）。共享该子进程的上层使用者必须由宿主统一管理其生命周期。

### 1.2 宿主 `/api`：HTTP unary RPC，不是 SDK JSON-RPC

启动使用 `dsh web` 或 `dsh --profile web`，别名见 `apps/cli/src/args.ts:92–98`。Web profile 在 `packages/bundle/web-app/cordis.patch.yml:175–184` 装配 webserver，默认 bind `127.0.0.1`、port `3080`；在 :230–245 装配 connection 和 api-remotes。由 dsh profile 启动，不直接跑 package bin 或测试 fixture。

`packages/client/connection/src/index.ts:119–164` 创建 HostConnectionService、BrowserAuth；存在 webServer 时才挂 `/api` 与 `/connect`。HTTP 入口先做 admission，再转 RPC/fetch registry。`rpc-host.ts:207–230` 先匹配 exact fetch route，再处理 namespace/method；exact fetch route 还检查 owner。常规 RPC 使用 `POST /api/<namespace>/<method>`、JSON content-type 和自定义 envelope，URL endpoint 必须与 body method 一致（同文件:304–347）。请求形态是：

```json
{"type":"client-request","rpcId":"unique-id","method":"session/list","payload":{"args":{}}}
```

响应是 `type: "server-response"`，携带同一 rpcId 以及成功/失败 result；还存在 multipart 二进制附件路径（`rpc-host.ts:376–392`）。因此不能用 JSON-RPC 2.0 SDK client 直接打 `/api`，也不应把它描述成通用 REST CRUD API。

主要已核验业务入口如下，具体参数应复用生成类型，不根据此清单手写第二套 schema。

| 类型 | 路由或逻辑 endpoint | 源码证据 |
|---|---|---|
| 会话发现与创建，HTTP unary | `/api/session/list`、`/api/session/search`、`/api/session/create` | packages/api/session-controller/src/index.ts:278–341 |
| 模型相关，HTTP unary | `/api/session/selectModel`、`/api/session/initializeDefaultModel`、`/api/session/modelCatalog` | 同上:278–341 |
| 会话命令与读取，HTTP unary | session/rename、fork、prompt、attachment、updateQueue、cancel、events；page 已标 deprecated | 同上:433–540；上述 endpoint 的 URL 均加 `/api/` |
| 状态与等待，HTTP unary | session/state、wait、projections | 同上:550–628 |
| 会话流，走 WS mux | session/observeEvent、observeProjections、observeState、follow、control | 同上:550–628 |
| 工作区命令，HTTP unary | workspace/create、initializeDefault、rename、delete、insertBefore、insertSessionBefore、archiveSession、unarchiveSession、pinSession、unpinSession | packages/api/workspace-controller/src/index.ts:72、90–189 |

不要将 `session/follow` 当作普通 HTTP POST 返回 SSE 的路由。Gateway 对 unary/stream 误用会拒绝（`packages/api/gateway/src/index.ts:428–469`）。profile 中一处旧注释写 fetch/SSE（web-app patch:226–227），实际源码是下面的 WebSocket mux，不能以旧注释定协议。

#### 鉴权与安全边界

- HostConnectionService 先检查 Host/Origin，再检查 cookie 与 live Peer（`connection/src/rpc-host.ts:128–160`）。Host 必须有效；接受 loopback、listener bind IP 或 trustedHosts；拒绝 `sec-fetch-site: cross-site`，带 Origin 时检查 authority，无 Origin 仍检查 Host（`api-request-trust.ts:121–175`）。这不是可以省略鉴权的“本机端口”。
- 每个 root owner 有进程 launch token。浏览器访问 `GET /?token=...` 换签名 browser cookie，再 303 去掉 URL token；响应设置 no-store / no-referrer（`browser-auth.ts:61–66、263–305`）。
- 独立程序使用 `GET /connect?token=...&interactions=none|answer`，创建独立 API operator，签发含 Peer id 的 cookie，然后 302 指向 `./api/remote.mux`。默认 interactions 是 none（同文件:307–348）。调用者应正确处理 redirect 和 cookie，而不是把 `/connect` 当 WebSocket 本身。
- cookie 采用 HMAC-SHA256，属性为 HttpOnly、SameSite=Strict；安全传输时加 Secure（同文件:130–148、356–382）。检查的是源码，没有读取任何真实 signing secret 或凭证文件。
- 当前所读 admission 不是 Authorization Bearer 校验；不能把 launch token 当作每次 `/api` 请求的 Bearer token。API cookie 还依赖进程内 live peers，不能假设重启后旧 cookie 自动恢复 operator。
- 这是 owner/operator 体系，不是开箱即用的互联网多租户隔离方案。若目标部署跨机器、跨用户，凭证引导、TLS、trustedHosts、代理与授权边界必须另作契约和验证，不能直接暴露端口。

### 1.3 `/api/remote.mux`：WebSocket 多路复用流

它与 `/api` 使用同一个 Web profile 和 Connection admission。入口为 `packages/api/gateway/src/index.ts:255–310`，服务在 appReady 后开放 upgrade（:312–323）。固定路径为 `/api/remote.mux`（`stream-protocol.ts:7`）。每个物理 socket 绑定一个 Peer，每个 socket 内按 streamId 保存多个独立活动流（`stream-server.ts:94–113、161–163`）。只接受 JSON 文本帧；二进制帧与坏消息会被拒绝（同文件:187–196）。这不是 Socket.IO、SSE 或 JSON-RPC 2.0。

wire 消息定义见 `packages/api/gateway/src/stream-protocol.ts:234–257`：

```text
客户端 -> {type:"open", streamId, endpoint, payload}
客户端 -> {type:"item", streamId, value?} | {type:"end", streamId} | {type:"cancel", streamId}
服务端 -> {type:"item", streamId, value?} | {type:"error", streamId, error} | {type:"end", streamId}
```

业务请求的 payload 使用 `{args: ...}`。前端可以在一个 socket 为多个 session 分别打开 `session/follow` 逻辑流。`packages/api/session-controller/src/web/controller.ts:32–76` 实现 follow：先建立监听，再取得 opening snapshot、设置 durable cursor，输出 snapshot 后持续输出增量。请求带 **`assistantStream: true`** 时才绑定实时 assistant 流，并把 baseline 纳入 opening snapshot；不是只要连上 mux 就自动收到所有 token。

实时 assistant 帧是独立的 `start / chunk / end`（`packages/core/agent/src/runtime-types.ts:154–188`），由全局 `agent/assistant-stream` 按 sessionId 过滤转发（`packages/api/session-controller/src/history/assistant-stream.ts:11–25、69–96`）。durable event cursor 与 transient assistant frame 是两套语义；恢复依赖 snapshot/baseline 与持久事件游标，不能承诺断线期间每个未持久化 token 都原样重放。

另有特殊 endpoint `$events`，负责 Cordis 广播与 waterfall 交互，不等于 session/follow。它先发 ready，再发 emit / waterfall / cancel；waterfall 结果通过 `$events/result` 返回（`gateway/src/stream-protocol.ts:10–16、34–71`；`gateway/src/index.ts:544–726`）。API operator 使用 `$events` 需要 interactions=answer（同文件:1242–1247）；被动 none operator 与无法订阅任何会话流不是同一回事。

多客户端有明确限制：独立 API operator 的一个 Peer 只能 claim 一个 mux socket，第二个返回 409；socket 释放会 dispose 并删除其 live Peer，后续持旧 cookie 的 HTTP 请求失效。不同 operator 可各自连接；browser cookie 对应 shared browserPeer，不受同一 API Peer 的 one-socket claim 限制。证据：`packages/client/connection/src/rpc-host.ts:70–101、128–187`；`packages/api/gateway/tests/operator-connect.host.spec.ts:63–85`。这些规则需要原样纳入重连实现，而不是强行复用已失效的 API cookie。

## 2. A / B 五维对比

| 维度 | A：SDK stdio JSON-RPC | B：HTTP `/api` + WS mux |
|---|---|---|
| 多 session 并发 | 一个 server 有多个 session record；逐请求 id 关联，transport 无全局串行等待，同 session 创建可合并。高层 `session(id)` 可以取得独立句柄。不能据此保证任意模型后端的无限并发。证据：sdk/server/src/server.ts:91–118、543–595；sdk/protocol/src/transport.ts:186–194；sdk/client/src/api.ts:99–107。 | Session controller 按 sessionId resolve Agent，resumes/claims 按 SessionId 管理；socket 按 streamId 多路复用，不要求为每个 session 开一个服务器。证据：session-controller/src/agent.ts:125–162；gateway/src/stream-server.ts:161–163。 |
| 流式事件 | 有 session.event/status/subagent 通知，已经可事件驱动。当前所读 SDK server 未发现 transient assistant chunk 转发，不能把日志事件等同逐 token 输出。证据：sdk/server/src/server.ts:171–215；sdk/protocol/src/types.ts:151。 | follow 有 snapshot、durable cursor 和可选 assistantStream；适合前端实时文本及断线恢复基线。证据：session-controller/src/web/controller.ts:32–76；history/assistant-stream.ts:69–96。 |
| 鉴权 | stdio 由宿主对子进程和管道的所有权控制；没有可直接给浏览器使用的网络鉴权入口。要接浏览器仍需宿主提供边界。证据：sdk/client/src/client.ts:190–227；sdk/server/src/index.ts:45–60。 | 现成 token 入口换签名 cookie，并有 Host/Origin admission；部署适配仍需验证，不能称为多租户服务。证据：connection/src/browser-auth.ts:263–382；api-request-trust.ts:121–175。 |
| 多客户端连接 | 一个 stdio transport peer；同一 HarnessClient 的多个 notification subscription 是本地 fanout，不等于多个外部客户端能直接接同一管道。证据：sdk/server/src/server.ts:91–118；sdk/client/src/client.ts:73–178。 | 支持多个连接/Peer；API 每独立 operator 一个 mux，browser peer 规则不同；关闭 API socket 会终结 operator，需要重新握手。证据：connection/src/rpc-host.ts:128–187；operator-connect.host.spec.ts:63–85。 |
| 实现成本 | 后台 Node/Python 单宿主调用时最短。用于当前前端目标则要补 stdio↔网络、会话订阅分发、鉴权和可能的 chunk 转发，不应因 SDK 名称就认定总成本更低。 | Web profile 组合依赖更多，但目标传输与生命周期已实现；复用生产 client/协议比自建桥接更短。证据：web-app/cordis.patch.yml:175–245；gateway/src/client/stream-client.ts:47–71、101–118。 |

完整推荐是：**在“多 session 并发 + 流式事件推送到前端”的 MVP 下优先集成 B，沿用现成客户端类型与 session/follow，而不是在 A 外再造网络协议。** 如果用户把“流式”明确限定为持久日志事件，且已有可靠网络网关承担鉴权、fanout 和进程托管，A 也可能成为较短路径；因此应由用户明确流式粒度并拍板契约，而不是把 A 排除为技术上不支持并发。

## 3. 现成最小客户端与可复用位置

### 3.1 SDK stdio

1. **Python 最短真实入口**：`python/sdk/examples/minimal.py:13–46`。它使用 `DeepSeekHarness` context manager，传 cwd/dsh_home/profile，调用 harness.run 后打印 final_response。默认 profile 是 sdk-minimal（:24），是单次最终结果示例，不是逐 token 示例。示例调用方式是 `python python/sdk/examples/minimal.py "任务" --dsh-home <隔离的配置目录> --workspace <工作目录>`；此命令仅说明用法，本调研没有运行。
2. **TS 现成客户端**：`packages/sdk/client/src/api.ts:70–128` 的 DeepSeekHarness 负责 initialize、session(id)、resumeSession 与 run；低层 `client.ts:73–178、190–227` 已有通知 AsyncIterable、子进程与 pipe。优先使用这些实现，不手写 JSON 行读取器。
3. **协议+真实 profile smoke**：`apps/cli/tests/profiles/sdk/keyless-smoke.e2e.ts:89–123` 展示 execa 启动 `--profile sdk`、逐行解析 stdout、发送 initialize。测试审批配置只是 fixture，不能照抄为产品默认放权。
4. **最小通知回调示例**：`packages/sdk/client/tests/run.spec.ts:53–74` 展示 session.run 的 onNotification；:149–151 有同 session 并发调用的 Promise.all 测试。这是测试源码证据，不代表本次运行通过，也不等同真实模型跨 session 吞吐测量。

### 3.2 HTTP `/api`

最易提取的现成客户端不在独立 demo，而在 `packages/api/gateway/tests/operator-connect.host.spec.ts`：

- :249–258 演示 `/connect` token exchange、interactions 与提取 set-cookie；不要在日志中输出实际 token/cookie。
- :332–339 演示 `fetch('/api/'+endpoint)`，POST，cookie 与 application/json header，body 为 client-request / rpcId / method / payload.args。
- :63–85 证明测试设计涵盖 HTTP 可以先于 socket attach 使用，以及 API socket 关闭后 cookie 失效。

浏览器同源客户端应让浏览器管理 HttpOnly cookie，不尝试 JS 读取 cookie；非浏览器程序应复用 cookie jar 或按测试的显式 Cookie header 方式承载。

### 3.3 WebSocket mux

同一个测试是可直接缩减的最小示例：

- :260–279 使用 `new WebSocket(wsOrigin+'/api/remote.mux', {headers:{cookie}})`；这是 Node ws 客户端示例，不是浏览器构造器允许自定义 header 的承诺。
- :303–305 发送 `{type:'open',streamId,endpoint,payload:{args}}`。
- :312–316 打开 `$events` 并等待 ready；实际会话流应把 endpoint 换为 session/follow，并按该方法生成请求类型构造 args，不能照搬 `$events` 的空 args。
- :176–200 覆盖 none/answer/browser 与交互所有权差异。

生产前端已有 `packages/api/gateway/src/client/stream-client.ts:47–71、101–118` 的 `RemoteStreamMuxClient`，共享一个物理 socket 承载独立可取消流，并提供可注入的已认证 carrier；该代码比测试中的手写收发更适合作为正式集成起点。其重连会使既有逻辑流失败/重建，业务端需按 follow 的 snapshot/cursor 恢复，不能只调用 socket.reconnect 就声称完整恢复了会话。

## 核验边界与给主会话的输入

- 本次为固定 SHA 的源码与上游 LICENSE/commit 调研，没有启动 runtime、没有运行测试、没有实际模型请求，也未测吞吐、负载、慢消费者和网络断线。
- 已直接实读关键 server、transport、admission、follow、客户端与测试；GitHub 另实读固定 SHA 的 `packages/api/gateway/src/stream-protocol.ts`，与本地一致：https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/api/gateway/src/stream-protocol.ts 。不把 README 或旧注释作为实际协议的唯一依据。
- headless 的单任务退出性质用于排除误用，不构成对其全部 flags/事件 schema 的完整调研。其余插件的完整业务 API 清单也不在本次三问范围。
- 请主会话将 A/B 契约与“流式是否必须逐 token/chunk”送入 QUESTIONS 由用户决定；推荐 B。若选 B，后续 verifier 至少验证两个 session 同时运行并各自收到正确 follow 事件、assistantStream:true 实时 chunk、snapshot/cursor 重连、API operator socket 关闭后的重新认证，以及跨 Origin/未授权请求拒绝。若选 A，则先验证 chunk 缺口及桥接成本，再定前端承诺。
