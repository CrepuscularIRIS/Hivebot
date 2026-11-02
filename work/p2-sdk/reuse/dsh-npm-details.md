# T-01 的 dsh npm 接入细节核验

## 范围与结论口径

本次于 2026-11-01 先读 `work/LEARNINGS.md`，只读本地 `/home/lingxufeng/bot/repos/deepseek-harness/`、manifest 与已有 reuse 报告，并查询 npm registry。没有改动参考仓、产品代码或其他报告，没有读取用户凭证、打印真实 key/token、启动 dsh 或请求 LiteLLM。下文“源码”路径相对参考仓根目录；“tarball”路径是对应 npm 归档内的实际文件，行号不等同源码行号。tarball 在内存中读取，没有执行其中代码。

**供主会话纠偏：T-01 不应等待本报告或据此重写。builder 就地检查已安装 `node_modules` 的证据优先；只在实现确实假定了公开 mux 类导出、环境变量注入 admission token，或把源码行号当成发布包证据时纠正。纯 npm 路径仍可继续。**

## 决策行

| 能力 | 候选（owner/repo@path 或 npm 包名） | 阶梯级别（1～5） | 许可证 | 维护（最近 commit / release） | 决策 | 理由 / 适配工作量 |
|---|---|---|---|---|---|---|
| T-01 的运行时版本固定与证据绑定。 | `@deepseek-ai/dsh@0.2.2-alpha.2`；对照为本地 `deepseek-ai/deepseek-harness@ce7073d51254c26cd63b22a60835b8f948deb447`。 | 1。 | npm 元数据声明 MIT。 | 此 npm 版本发布于 2026-10-27T19:10:28.529Z；本地 HEAD 提交于 2026-10-29T16:13:15Z。 | 集成 | 应固定 npm 版本及 lockfile integrity，不从参考源码仓构建。packument **没有 `gitHead` 字段**，不能宣称它等于 ce7073d，也不能编造一个不同 SHA。旧报告四类接口证据需要按安装包重核；本报告已核实其中 profile、provider 配置、mux 导出及 token 的关键发布包事实。证据为 §1 的命令与 packument。 |
| 通过 npm 装配 Web profile。 | `@deepseek-ai/dsh`、`@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`、`@deepseek-ai/dsh-web-frontend`，均固定 `0.2.2-alpha.2`。 | 1。 | 所查四包的 npm 元数据均声明 MIT。 | 同版本已发布；CLI 发布时间见上一行，本次未分别查询各依赖的发布时间。 | 集成 | `web` 模板只指定 base 与 web-app，CLI 已把两者列为同版本运行时依赖，web-app 也已依赖同版本 frontend。静态依赖解析可成立，不需要复制 bundle；这不等于已经实跑启动、原生组件加载或真实模型回合。证据为 §2。 |
| 复用现有 mux 客户端，而不是重写协议。 | `@deepseek-ai/dsh-api-gateway@0.2.2-alpha.2/client`；对照为该包内部 `lib/types/client/stream-client.js`。 | 1；若复制内部类则降为 3，当前不建议仅因报告措辞而复制。 | npm 元数据声明 MIT。 | 同版本已发布；单包最近发布时间未单独查询。 | 集成 | 公共 `/client` 在 Node 条件下解析 `lib/client.node.js`，但它**不具名导出 `RemoteStreamMuxClient`**。该类仅存在于内部文件和打包实现中。应优先保留 builder 已确认可用的公共插件集成路径；不能写 `import { RemoteStreamMuxClient } from '@deepseek-ai/dsh-api-gateway/client'`。Node 条件入口存在不等于内部类成为公开 SDK。证据为 §2.2。 |
| 将 glm 模型接到 OpenAI 或 Anthropic 兼容 endpoint。 | 首选 `@deepseek-ai/dsh-llm-pi-ai@0.2.2-alpha.2`；对照为已有 `@deepseek-ai/dsh-llm-deepseek-api-key`。 | 1。 | pi-ai 适配包的 npm 元数据声明 MIT；对照源码属于 MIT 仓。 | pi-ai 同版本已发布；本地参考 HEAD 时间见首行。 | 集成 | pi-ai 原生支持两类协议和显式 `baseURL`、`models`、`apiKeyEnv`，无须写 provider。DeepSeek 专用适配器虽能改 endpoint，却要求 Messages 兼容且包含专用协议行为，不是通用 OpenAI 路由的首选。应显式选定模型路由，不沿用 `deepseek-official/deepseek-flash` 默认值。证据为 §3.1。 |
| 不经 stdout 取得 launch 凭证并进行 API admission。 | `@deepseek-ai/dsh-client-connection@0.2.2-alpha.2` 的宿主 `connection.authenticatedUrl()` 与 `/connect`；对照为 web-app 的默认 URL stdout 宣告。 | 1，外加很薄的宿主交接适配。 | npm 元数据声明 MIT。 | 同版本已发布；单包最近发布时间未单独查询。 | 集成 | token 在进程内随机生成，所查路径不支持外部 env 指定，也没有现成 launch-token 文件或无需认证的 HTTP 读取接口。可由受控宿主插件调用现有方法，将结果写入私有文件或独立 IPC；必须同时关闭 `web-runtime.config.printUrl`，不能只传 `--no-open`。不自建鉴权，不读取 credentials 文件猜 token。证据为 §3.2。 |

## 1. packument 的 gitHead 与旧报告重核范围

以下命令已实际执行，未访问任何凭证。

```text
npm view @deepseek-ai/dsh@0.2.2-alpha.2 gitHead --json
=> stdout 为空。

npm view @deepseek-ai/dsh@0.2.2-alpha.2 --json
=> 解析结果中的 gitHead 为 <absent>。

git -C /home/lingxufeng/bot/repos/deepseek-harness rev-parse HEAD
=> ce7073d51254c26cd63b22a60835b8f948deb447
```

直接读取完整 packument <https://registry.npmjs.org/@deepseek-ai%2fdsh> 的 `versions['0.2.2-alpha.2']`，得到 `has_gitHead: false`、`gitHead: null`，`time['0.2.2-alpha.2']` 为 `2026-10-27T19:10:28.529Z`。其 `dist.integrity` 为 `sha512-mdcpgF8D1eFQV8Gu3T/sYLkBwfw9h/Li0uPIxXyby1VybJgrFg8BU1Le40FiMnN+heL7k3zOMuAVe7sFq/JO4w==`。registry 的全包 `time.modified=2026-10-29T16:01:29.872Z` **不是该版本的发布时间**。

所以准确答案是“无法由 gitHead 证明相等，发布版本缺失该字段”，而不是“已证实等于 ce7073d”或“已证实某个别的提交”。发布时间也不能代替源码到产物的映射证明。本次还看到了确切的行号漂移：源码 `packages/bundle/web-app/cordis.patch.yml:193–198` 的 web-runtime 配置，在 npm tarball 同名文件中位于 `189–194`。

| 旧报告中的证据类别 | 必须重核的具体引用与风险 | 本次核验状态 |
|---|---|---|
| provider 注入与测试 provider。 | `dsh-as-dependency.md` 所引 `packages/llm/llm/src/index.ts:204–208,393–417`、`packages/sdk/server/src/server.ts:235–247`，以及 replay 的 `src/index.ts:1026–1110`，分别涉及扩展接口、注册规则、初始化回退和回放绑定；不能用本地源码行号声称 npm 完全一致。 | 本次核实了发布版 pi-ai 的配置与凭证解析，未复核 SDK fallback 或 replay 的完整实现。 |
| `follow` 与 `assistantStream`。 | `dsh-api.md` 所引 `packages/api/session-controller/src/web/controller.ts:32–76`、`history/assistant-stream.ts:11–25,69–96`、`packages/api/gateway/src/client/stream-client.ts:47–71,101–118`，涉及开流参数、baseline、实时 chunk 与客户端可用性。 | 本次确认发布版 mux 类不是公共具名导出；follow 的完整请求/响应、assistant baseline 与 chunk 行为仍以 builder 已安装包及运行证据为准。 |
| session list/events。 | `dsh-sessions.md` 所引 `packages/api/session-controller/src/index.ts:272–281,521–541`、`list.ts:132–160`、`types.ts:467–483`，以及 HTTP envelope 的 `connection/src/rpc-host.ts:305–343,361–367`，涉及方法、参数、cold-safe 语义与 carrier。 | 本次未重核这些发布包的完整业务实现，不能给重启历史验收 PASS。 |
| plugin-market 路由与装配。 | `market-backend.md` 所引 `packages/boot/plugin-market/src/index.ts:108–135,179–251`、`packages/boot/plugin-manager/src/index.ts:827–873,1248–1285`，以及该报告“对前端 / SDK 的路由”部分，涉及 namespace、可调用方法、bundle 开关及载入条件。 | 本次未重核市场 tarball 路由，不扩大为 T-01 必改项；此类功能不应阻塞 demo。 |

上述“重核”不是宣布旧结论错误，而是限定证据适用对象；已有 node_modules 证据不应被重复劳动覆盖。

## 2. Web profile 与 mux 的 npm 可用性

### 2.1 Web profile 的静态解析可以成立

已查询下列版本 URL，均返回 `version: '0.2.2-alpha.2'`，并实际读取所需 tarball 的 package.json 或 JS/patch 文件。

- <https://registry.npmjs.org/@deepseek-ai/dsh/0.2.2-alpha.2>。
- <https://registry.npmjs.org/@deepseek-ai/dsh-base/0.2.2-alpha.2>。
- <https://registry.npmjs.org/@deepseek-ai/dsh-web-app/0.2.2-alpha.2>。
- <https://registry.npmjs.org/@deepseek-ai/dsh-web-frontend/0.2.2-alpha.2>。
- <https://registry.npmjs.org/@deepseek-ai/dsh-official-bundles/0.2.2-alpha.2>。

发布版 `dsh-official-bundles` 的 `package/lib/index.js:6` 为 `web: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] }`。本地对应证据为 `packages/util/official-bundles/src/bundles.ts:14–16`。CLI 版本元数据的 `dependencies` 包含上述两个同版本 bundle；web-app 的 `dependencies` 明确包含同版本 `@deepseek-ai/dsh-web-frontend`、`dsh-client-connection`、`dsh-host-frontend-static`。因此 CLI 正常依赖安装即可带入这些 bundle，不需要用户从源码仓构建 Web。

进一步从 base 与 web-app 的 registry 版本记录递归遍历 `dependencies` 下全部 `@deepseek-ai/*` 包，对精确版本或去除 `~`/`^` 后的版本逐一请求 registry，实际输出如下。

```json
{
  "resolved_scoped_runtime_packages": 243,
  "failed": [],
  "unhandled_ranges": []
}
```

此检查覆盖了这两棵运行时依赖树中的 scoped 包，包括它们引用的 Cordis 包。没有遍历外部非 scoped、peer 或 optional 依赖，也没有运行 npm/pnpm 安装、原生模块加载和 dsh 进程。因此，按题目所限的“模板引用的包能否从 npm 解析”判定为**可以**；不能把这个结论写成“安装和启动已通过”。CLI registry 的 `engines.node` 为 `>=24.9.0`，环境还需满足这一要求。

### 2.2 `RemoteStreamMuxClient` 存在于发布包，但不是公开导出

版本记录为 <https://registry.npmjs.org/@deepseek-ai/dsh-api-gateway/0.2.2-alpha.2>。tarball 为 <https://registry.npmjs.org/@deepseek-ai/dsh-api-gateway/-/dsh-api-gateway-0.2.2-alpha.2.tgz>。

1. 该类的发布包归属是 **`@deepseek-ai/dsh-api-gateway`**；实际带 `export class RemoteStreamMuxClient` 的文件为 **`package/lib/types/client/stream-client.js:23`**，声明为 `package/lib/types/client/stream-client.d.ts`。`lib/types` 在这里不只有声明，也含 JS。
2. 但 package.json 的 `exports` **没有映射这个内部 JS 文件**。公共子路径 `./client` 的 Node 分支为 `./lib/client.node.js`，browser/default 分支为 `./lib/client.browser.js`；发布版 `lib/client.node.js:1990` 的 export list 只有 `RemoteJournalStream, RemoteSnapshotStream, RemoteStream, RemoteStreamCarrierError, apply, cancelledFailure, carrierFailure, inject, isRemoteFailure`，没有 mux 类。映射中的 `./src/*` 也救不了它：本次 tarball 文件清单没有 `src/`。
3. 因此不存在本版本支持的 `@deepseek-ai/dsh-api-gateway/...` 公共具名导入路径能直接取得该类。绕过 exports 解析 package.json 后构造内部 file URL 属于内部文件依赖，不能称为稳定公开 SDK。若 builder 已采用此办法，应明确这项版本耦合，而不是仅因本报告重新改造。
4. **Node 端可用性需要分两层回答。** 公共 `/client` 明确提供 Node 条件入口；内部 mux 类的构造器也接受认证 socket 工厂，代码不是浏览器专属，但其默认工厂调用 `new WebSocket(remoteStreamUrl())`，不能在 Node 不提供 URL/carrier 就直接使用。发布版内部文件 `stream-client.js:36–43` 与本地 `packages/api/gateway/src/client/stream-client.ts:64–71` 均给出这一注入点。Node 端还必须携带 `/connect` 换取的 cookie；不能把 Node 原生 WebSocket 与可传 Cookie header 的 `ws` 构造器混为一谈。本次只做静态判断，未运行 Node 客户端。

## 3. LiteLLM provider 与不经 stdout 的 admission

### 3.1 应使用现成 pi-ai adapter 的显式路由

`@deepseek-ai/dsh-llm-pi-ai@0.2.2-alpha.2` 已发布，元数据为 <https://registry.npmjs.org/@deepseek-ai/dsh-llm-pi-ai/0.2.2-alpha.2>。发布版 `package/lib/index.js:836–838` 映射 `openai-completions`、`openai-responses`、`anthropic-messages`；`1049–1061` 定义 provider profile，包含 **`apiKeyEnv`、`api`、`baseURL`、`models`、`headers`**。本地对应为 `packages/llm/llm-pi-ai/src/provider.ts:23–25,48–50`、`src/config.ts:91–110,327–335`。

具体接入字段应配置为 `config.providers.<route>.api`、`config.providers.<route>.baseURL`、`config.providers.<route>.apiKeyEnv`、`config.providers.<route>.models[].id`；模型还可明确给出 `contextWindow` 与 `maxTokens`。例如自定义 route 可命名 `litellm`，OpenAI 路径使用 `api: openai-completions` 与 `baseURL: http://127.0.0.1:4001/v1`；Anthropic Messages 路径使用 `api: anthropic-messages` 与该服务器支持的 API 根地址（通常为 `http://127.0.0.1:4001`，由 provider SDK 添加 `/v1/messages`）。这些是适配器配置建议，不是本次已经探测 LiteLLM 接口的结果。

`apiKeyEnv` 是**保存凭证引用名称**，不是把 key 本文写入配置。可使用已有且被批准的环境变量名称，例如 `LITELLM_API_KEY`；发布版 `lib/index.js:2909–2915` 先经 `credentials.resolve(ref)`，缺少 credentials 服务时读取 `launchEnvironmentOf(ctx).get(ref)`，不存在或为空会报错。不要为了“无 key”而把假密钥写死到产品代码，也不要把远端返回错误当成 key 配置正确的证据。本地源码证据为 `src/index.ts:209–231`。

base bundle 已加载 `llm-pi-ai`，但它默认没有 provider route；发布版 `dsh-base/package/cordis.patch.yml:128–136` 与本地同名文件同段均说明需由配置或 `llm-pi-ai:` settings section 提供 routes。因此“只设置 OPENAI_API_KEY/ANTHROPIC_API_KEY 就自动选中本机 LiteLLM”并不成立。只用 env 推断 endpoint 也不稳，建议显式 `baseURL`。默认模型仍为 `deepseek-official/deepseek-flash`，见发布版 base patch `90–94`；必须由部署配置或 `session.selectModel` 选择自己的 route/model。

**glm 的实际 model ID 未验证。** 用户描述“glm 5.3 flash”不是 registry 或 LiteLLM `/v1/models` 的实测标识，本报告不猜测具体字符串；应沿用 builder 从本机配置确认的 ID，或由有权限的执行者只查询模型列表、仅记录 ID，不打印 key。

对照适配器 `dsh-llm-deepseek-api-key` 的 `apiKeyEnv` 默认 `DEEPSEEK_API_KEY`（本地 `packages/llm/llm-deepseek-api-key/src/config.ts:20–28`）。共享 DeepSeek config 支持 `baseURL`，未设置时读 `DEEPSEEK_BASE_URL`，但显式拒绝 configurable protocol，要求 Messages-compatible endpoint（`packages/llm/llm-deepseek/src/config.ts:20–21,115–119,228,311–317`）。因此它可以作为 Messages 路径的备选，**不能替代通用 OpenAI Chat Completions adapter**；本次没有重核此备选的完整 npm 实现，不推荐为 T-01 改用它。

### 3.2 没有现成 env token 注入或 token 文件；应由宿主服务私下交接

发布版 `@deepseek-ai/dsh-client-connection` 的 `package/lib/index.js:294–299` 为进程 owner 生成 `encodeBase64Url(randomBytes(SECRET_BYTES))` 并保存在 WeakMap；这里没有环境变量参数。其 `440–443` 提供 `authenticatedUrl(baseUrl)`，向 URL query 放入该 token。本地对应为 `packages/client/connection/src/browser-auth.ts:61–66,240–247`。宿主公开服务的委托方法为 `packages/client/connection/src/rpc-host.ts:197–200` 的 `connection.authenticatedUrl(baseUrl)`。

在已读的 Connection、browser-auth 与 web-app 启动路径中，**没有发现可指定 launch token 的 env/config、自动写出的 launch-token 文件，或无需已知 token 就返回它的 HTTP 接口**。持久 browser signing secret 与进程 launch token 不是同一个值；不能读取 credentials store 代替 launch-token 交接。此结论限定于本次已读启动路径，不声称审计了全仓所有插件。

`GET /connect?token=<launch-token>&interactions=none` 是**交换接口而非读取 token 的接口**。发布版 Connection `lib/index.js:517–537` 要求已提供正确 token，然后创建 operator、返回 302、`Set-Cookie` 与 `Location: ./api/remote.mux`；这个 cookie 后续才用于 HTTP 和 WS admission，不是 `Authorization: Bearer <launch-token>`。默认或显式 `interactions=none` 适合被动 demo 客户端，只有需要回答交互才申请 answer；不应为图省事扩大权限。

默认 `dsh web` 会把完整 authenticated URL 打进 stdout，发布版 `dsh-web-app/package/lib/index.js:156–165` 可见 `if (config.printUrl) console.log(...)`。发布版 patch 的 `web-runtime` 行位于 `189–196`，其中 `printUrl: true`。**`--no-open` 只阻止浏览器打开，不会关闭这一打印。**

满足“不让 token 进入 stdout”的最小建议是：部署 patch 将 `web-runtime.config.printUrl` 设为 `false`，同时设置 `openBrowser: false` 或传 `--no-open`；受控宿主插件在 Connection 就绪后调用 `ctx.connection.authenticatedUrl(...)`，通过独立私有 IPC 或权限为 0600 的专用交接文件交给监督进程。这个文件是我方需实现的很薄适配，**不是 dsh 已存在的文件路径**；写入和读取方不得输出 URL/token/cookie，交接文件应位于隔离运行目录且及时清理。不要为了取得 token 改造密码算法、暴露未认证 getter 或把 token 重新放入 stdout 再过滤。

若 builder 已使用另一条满足这些约束、且已由发布包实证的私有交接方式，应保留其实现；本报告不授权自行触发产品代码变更。三问均已答完，后续真实进程和模型行为验证交给 T-01 的现有 builder/verifier。
