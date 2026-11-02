# dsh 依赖引入与离线 fake LLM 查证

查证日期为 2026-11-01。源码基线是 `repos/deepseek-harness` 的 `ce7073d51254c26cd63b22a60835b8f948deb447`（本地最近提交时间为 2026-10-30 00:13:15 +08:00；GitHub 返回 UTC 时间为 2026-10-29 16:13:15Z）。本文件只回答 BRIEF S4、S5，不代替 D1、D7 的执行验收。

## 决策行

| 能力 | 候选（owner/repo@path） | 许可证 | 维护（最近 commit） | 决策 | 理由 / 适配工作量 |
|---|---|---|---|---|---|
| dsh 作为 app/sdk 的运行时依赖。 | `deepseek-ai/deepseek-harness@apps/cli`，npm 包为 `@deepseek-ai/dsh@0.2.2-alpha.2`；按消费者需求配同版本 `dsh-sdk-client`、`dsh-sdk-protocol`。 | MIT，已实读根 LICENSE；vendor/native 的具体许可仍以各包文件为准。 | `ce7073d`，2026-10-29T16:13:15Z。 | 集成 | npm 已发布 CLI、SDK 和 profile bundle，而且 tarball 已含编译后的 JS 和声明文件，不需要为了 D1 链接或构建只读参考仓。工作量是 app/sdk 的精确版本依赖、lockfile、一次性 setup 及 profile/patch 配置；不是裁剪 fork。证据为下表 registry URL 与 tarball 实读，以及 `packages/sdk/client/src/launch.ts:55–76,128–149`。 |
| 无外部网络、无真实 API key 的固定场景回放。 | `deepseek-ai/deepseek-harness@packages/test-support/llm-replay`，npm 包为 `@deepseek-ai/dsh-llm-replay@0.2.2-alpha.2`。 | MIT。 | 同上。 | 集成 | 已有可加载插件、按 session 绑定脚本、逐 chunk 回放及 `paceMs`，直接复用，不另写 provider 框架。工作量是 P2 自有 fixture、测试专用 patch、独立 DSH_HOME 与禁外联检查。证据为 `packages/test-support/llm-replay/src/index.ts:129–167,974–1005,1026–1110`。 |
| 需要按 prompt/session 动态计算返回、工具调用或错误的 fake LLM。 | `deepseek-ai/deepseek-harness@packages/core/agent-loop/tests/mock-adapter.ts` 与 `packages/test-support/loader-smoke/tests/fixtures/cli-mock-llm.ts`。 | MIT。 | 同上。 | 改造 | 只在固定 fixture 不足时，把现有 MockAdapter 的最小脚本逻辑复制进 app/sdk 的测试插件并注明出处；复用 `LlmAdapter` 和 `registerAdapter`，不修改 repos。现成 MockAdapter 支持函数脚本、错误/挂起、按字符 text-delta；Loader fixture 给出了插件注册方式。需补测试级分 session 脚本状态和可选异步 pacing，不直接共享一个全局 shift 队列冒充并发隔离。证据为 `packages/core/agent-loop/tests/mock-adapter.ts:5–12,63–104,133–137`、`packages/test-support/loader-smoke/tests/fixtures/cli-mock-llm.ts:70–83`。 |

许可证证据为 [LICENSE](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/LICENSE)。维护证据为 [固定提交](https://github.com/deepseek-ai/deepseek-harness/commit/ce7073d51254c26cd63b22a60835b8f948deb447)，同时用 GitHub MCP `list_commits(perPage=1)` 核验了远端最近提交与本地一致。没有发现需要逆向或自建整套 fake provider 的理由。

## 1. npm 发布现状

### 查证过程与边界

1. 先读了 `work/LEARNINGS.md` 和 `work/p2-sdk/BRIEF.md`。当前 checkout 没有 `cards/`，所以主卡、案例、SUBCARD_INDEX 均无可检索的本地语料；两个源码目录均未发现 `.codegraph/`，直接检索了本地源码。
2. 读了根 `package.json`、各 SDK/bundle/test-support manifest、SDK 启动源码及测试替身。根包 `@deepseek-ai/dsh-root` 的 `private: true` 不能推导子包未发布（根 `package.json:2–5`）。真正 CLI 包名是 `@deepseek-ai/dsh`（`apps/cli/package.json:2–4`）。
3. 用 GitHub MCP 实读固定 SHA 的 `packages/sdk/client/package.json` 和 LICENSE，并核验最近提交。SDK manifest 明确导出 `lib/index.js` 和声明文件，源码 workspace 依赖并不代表发布包仍含 workspace 协议（`packages/sdk/client/package.json:13–38`）。
4. 用 Python 标准库直接请求公共 `registry.npmjs.org` 元数据（不读取本地 npm 凭证），再下载下面 10 个 `0.2.2-alpha.2` tarball，**只在内存中读取归档目录及 package.json，未执行安装脚本、未解压进 repos**。十个包都返回成功，tarball manifest 都不再含 `workspace:`。

### 实际版本与编译产物

“最新版本”必须区分 npm `latest` 标签和预发布标签。当前所有下列包的 `alpha` 都指向 **0.2.2-alpha.2**，`next` 都指向 **0.2.1-rc.5**；不能无版本安装后假定拿到本地基线。下表给出本次查到的 `latest` 标签和与本地匹配的 alpha。没有把 `latest` 当成全部历史版本的时间排序。

下表包名统一加 `@deepseek-ai/` 前缀。每个 registry 链接都是实际查询的元数据入口；其中 `versions["0.2.2-alpha.2"].dist.tarball` 指向本次读取的归档。

| 包名 | npm latest 标签 | 本次核验的 alpha | alpha tarball 实际文件 |
|---|---|---|---|
| [`dsh`](https://registry.npmjs.org/@deepseek-ai%2fdsh) | `0.2.1-rc.5`。 | `0.2.2-alpha.2`。 | 含 7 个 JS 和 8 个声明文件；可执行入口是 `lib/bin.js`，bin 名为 `dsh`。 |
| [`dsh-sdk-client`](https://registry.npmjs.org/@deepseek-ai%2fdsh-sdk-client) | `0.0.1-rc.1`。 | `0.2.2-alpha.2`。 | 含 `lib/index.js` 和 6 个声明文件。 |
| [`dsh-sdk-protocol`](https://registry.npmjs.org/@deepseek-ai%2fdsh-sdk-protocol) | `0.0.1-rc.1`。 | `0.2.2-alpha.2`。 | 含 `lib/index.js` 和 3 个声明文件。 |
| [`dsh-sdk-jsonrpc-server`](https://registry.npmjs.org/@deepseek-ai%2fdsh-sdk-jsonrpc-server) | `0.0.1-rc.5`。 | `0.2.2-alpha.2`。 | 含 `lib/index.js` 和 3 个声明文件。 |
| [`dsh-headless`](https://registry.npmjs.org/@deepseek-ai%2fdsh-headless) | `0.0.1-rc.1`。 | `0.2.2-alpha.2`。 | 含 3 个 JS 和 5 个声明文件，包括 `lib/startup.js`。 |
| [`dsh-sdk-app`](https://registry.npmjs.org/@deepseek-ai%2fdsh-sdk-app) | `0.1.2-alpha.2`。 | `0.2.2-alpha.2`。 | 含 `lib/index.js`、1 个声明文件、`cordis.patch.yml`。 |
| [`dsh-sdk-minimal`](https://registry.npmjs.org/@deepseek-ai%2fdsh-sdk-minimal) | `0.1.2-alpha.2`。 | `0.2.2-alpha.2`。 | 含 `lib/index.js`、1 个声明文件、`cordis.patch.yml`。 |
| [`dsh-llm-mock-server`](https://registry.npmjs.org/@deepseek-ai%2fdsh-llm-mock-server) | `0.0.1-rc.1`。 | `0.2.2-alpha.2`。 | 含 `lib/index.js` 和 3 个声明文件。 |
| [`dsh-llm-replay`](https://registry.npmjs.org/@deepseek-ai%2fdsh-llm-replay) | `0.0.1-rc.1`。 | `0.2.2-alpha.2`。 | 含 `lib/index.js` 和 1 个声明文件。 |
| [`dsh-agent-loop-testkit`](https://registry.npmjs.org/@deepseek-ai%2fdsh-agent-loop-testkit) | `0.0.1-rc.1`。 | `0.2.2-alpha.2`。 | 含 `lib/index.js` 和 4 个声明文件，但并不是完整 fake LLM。 |

例如 CLI 归档为 <https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-0.2.2-alpha.2.tgz>，SDK bundle 为 <https://registry.npmjs.org/@deepseek-ai/dsh-sdk-app/-/dsh-sdk-app-0.2.2-alpha.2.tgz>。因此问题不是“没有 npm 发布”，而是“要精确选择同一预发布版本”。客户端会比较自身和 dsh 的版本，不相等即抛错（`packages/sdk/client/src/launch.ts:55–60`）。

`headless`、`sdk`、`sdk-minimal` 是 CLI profile 选择，不应通过猜测包名寻找 `dsh-sdk-profile`。`sdk-app/cordis.patch.yml:11–21` 明确把 profile 标记设为 sdk 并加载 JSON-RPC server；`packages/sdk/client/src/launch.ts:128–149` 默认选择 sdk，通过 `--profile`、`--patch` 启动 dsh。bundle 已发布不等于所有 profile 都适合 D3–D6，本次未扩大到接口选型或完整 headless 启动验收。

## 2. 满足 D1 且不修改 repos 的引用方式

**实际推荐是 npm 精确版本依赖，不使用下面任一本地链接作为默认交付路径。** D1 的 setup 可以是一个脚本入口，内部完成 lockfile 安装、app/sdk 自有产物构建和隔离 profile 初始化；一次 setup 后 start 不应再隐式下载依赖。D1 不要求 setup 本身断网；D7 要求完成 setup 后测试断外网、清除真实 API key 仍可运行（`work/p2-sdk/BRIEF.md:38,44`）。

下表是“npm 不可用”的条件性比较，不代表四种办法都已经执行成功。事实依据包括本地根工作区配置（`pnpm-workspace.yaml:1–20,110–122`）、子包 `workspace:` 依赖、SDK 的 lib 导出和源码启动回退（`packages/sdk/client/package.json:13–38`；`packages/sdk/client/src/launch.ts:86–108`）。pnpm 的 pack 会把 workspace 依赖改成普通版本要求，官方说明见 <https://pnpm.io/workspaces>；本地目录和 git/subdirectory 安装支持见 <https://pnpm.io/cli/add>。

| 方式 | 在只读参考仓约束下的适用性 | 对 D1 的代价与结论 |
|---|---|---|
| pnpm workspace / link。 | `workspace:` 强制解析为本地工作区包，`link:` 指向目录，不自动把完整 monorepo 转成一个普通依赖。直接把 repos 包纳入安装/构建会产生 node_modules、lib 等文件，不满足“不修改 repos 的任何文件”。源码还依赖 vendor override、patch 与众多 workspace 包。 | 不推荐直接链接 repos。可以先把固定 SHA 复制到 app/sdk 管理的构建缓存再作为独立 workspace 安装，但这已经是源码构建路线，setup 更重，还需维护两个工作区的解析。只创建 app/sdk 侧 symlink 不解决目标缺 lib 和依赖树的问题。 |
| git 依赖。 | 固定 SHA 能钉源码，但根包是 private root，不是 `@deepseek-ai/dsh`；即使用 pnpm 的 git 子目录选择，也不能从 `apps/cli` 单个目录凭空得到完整 workspace 编译闭包。 | 不推荐直接 `git+...#sha` 作为 CLI 包。若 setup 拉取完整固定 SHA 到 app/sdk 的缓存再安装构建，可以不碰 repos，但脚本必须承担构建与 pack，而不是一条 git dependency 就完成。 |
| pack tarball。 | 是最接近正式发布的产物路径。pack 改写 workspace 依赖，**但不替代构建**；必须提供 lib、bundle patch、native 等必需资产，而且未打包的内部依赖还会落回 registry。上游 `scripts/release/pack.ts:23–34,46–64` 就检查 payload 并调用 pnpm pack。 | 如果 npm 版本确实不可取得，优先在 app/sdk 的缓存副本上构建固定 SHA，再 pack 所需完整闭包到 app/sdk 管理的 artifacts，lockfile 固定 tarball/integrity。可由一条 setup 编排，也可预先提供已核验 tarball，避免最终用户构建。禁止在 repos 内先 build 再 pack。此后备方案尚未实跑，不声称已过 D1。 |
| `file:` 本地目录或 tarball。 | `file:` 是依赖来源声明，并不会自动把原始源码变成发布产物。`file:../../repos/deepseek-harness` 指到错误的 root 包；指到子包还存在 workspace 和缺 lib 的问题。 | 不推荐 file: 源码目录。推荐把 **file: 已构建的 tgz** 作为上一个方案的消费方式；它不是与 pack 对立的另一条构建路线。仍要闭包完整且路径随 clone 可重建，不能引用某台机器上的绝对路径。 |

条件性后备推荐为“app/sdk 管理的固定 SHA 副本 → 构建 → pack → `file:*.tgz`”，不是裁剪 fork；没有 npm 缺失这个前提时不应付出这笔成本。本次 `git ls-files repos/deepseek-harness` 没有返回跟踪条目，不能假定本机参考仓天然存在于干净 clone 内。因此 D1 默认应完全不依赖该目录；若采用后备 setup，必须显式获取/校验 SHA，不能要求用户手动准备参考仓。

## 3. fake / mock LLM 是否存在，以及能否产生增量与结束事件

### 注入点已经存在，不需要改 dsh

`LlmAdapter` 是正式扩展接口（`packages/llm/llm/src/index.ts:204–208`）。`ctx.llm.registerAdapter(providers, adapter)` 注册 provider 路由并随 fiber 清理，重复路由报错（同文件 `393–417`）。SDK initialize 先查已注册 adapter；仅当 deepseek-official 没有 adapter 时才挂真实 provider，因此测试插件注册 `mock` 路由并初始化选择 `mock`，不需要真模型密钥（`packages/sdk/server/src/server.ts:235–247`）。

上游单测直接加载真实 AgentLoop、SessionStore、ToolRuntime，再注册 MockAdapter（`packages/core/agent-loop/tests/agent.spec.ts:23–34`），并用 `provider: 'mock', model: 'mock'` 驱动真实回合（同文件 `127–138`）。这与“只模拟 SDK JSON-RPC 服务端”不同。

### 现成候选的区别

| 候选 | 已核验的能力 | 对 P2 的使用建议 |
|---|---|---|
| `dsh-llm-replay`。 | `installLlmReplay` 按 sessionId 维护绑定和调用 cursor；可注册指定 provider，也能截获 llm/stream；读取本地 fixture 后逐 chunk yield，支持 paceMs（`src/index.ts:1026–1110`）。 | 首选固定场景集成；构造/选取含至少两个 text-delta 和 stop finish 的 fixture，设置正的 paceMs 让输出不全挤在同一同步批次。多 session 按首次调用顺序绑定脚本，D3 测试必须控制绑定或使用可区分的脚本断言，不能假定按 session 名自动映射。 |
| `agent-loop/tests/mock-adapter.ts`。 | `textResponse('ok')` 会发出两个 text-delta、block-end、usage、finish stop（`5–12`）；MockAdapter 可消费固定数组或基于 GenerateOptions 计算的函数脚本，并逐项 yield（`79–104,133–137`）。 | 测试目录源码不是包的公开导出，不应从 npm 假定能 deep-import。需要时复制最小逻辑到 app/sdk 测试插件，并沿用现成注册方式；为并发与重启场景明确脚本归属。 |
| `loader-smoke/.../cli-mock-llm.ts`。 | 无密钥 adapter 会先发 reasoning 和 shell tool call，第二次调用返回文本；插件导出 name/inject/apply 并注册 cli-mock（`19–66,70–83`）。 | 可复用其 Loader 插件形式和工具调用序列。原样只有一个最终 text-delta，不能直接宣称满足“至少两个文本增量”；需要用现有 textResponse 分块方式替换输出。不要照抄自动允许 shell 的测试环境。 |
| `dsh-llm-mock-server`。 | 已发布的 Messages HTTP/SSE 本地服务器；默认 loopback，successText/chunkSize/chunkDelayMs 可配，支持工具调用和错误（`src/index.ts:116–153,204–213`）。按 chunkSize 分割并写 content_block_delta，随后 message_stop（同文件 `327–334,416–437`）。 | 可用于真实 provider HTTP 适配器集成测试，允许 loopback 时不需要外网。不过它不是纯内存 provider；其 apiKey 可省略，不代表上游真 provider 的 key 校验也消失。严格“无 API key”优先使用 replay/内存 adapter，不走真实 provider。 |
| `dsh-agent-loop-testkit`。 | `src/model.ts:4–12` 的 unsupportedModel 只是结构性 Agent stub，model 操作直接抛错。 | 不能作为可聊天的 fake LLM，虽然名字像 testkit。 |
| `sdk/client/tests/fake-runtime.ts`。 | 文件级说明和实现表明它是 SDK 传输测试的替身进程，而不是生产 AgentLoop 的 provider（`1–10`，以及其自行构造 fake assistant 事件的 `163–168`）。 | 适合客户端超时/异常帧单测，不适合用来证明 D3–D6 的真实 dsh session、工具、审批或持久化链路。 |

### “两个增量 + 一个结束”的准确结论

**在 LLM adapter 和真实 AgentLoop 层，可以无外网、无 API key 产生至少两个文本增量及一次成功结束；源码证据完整。** `textResponse('ok')` 的两个字符正好给出两个 text-delta 和 finish stop。AgentLoop 对每个 yield 调用 live.push（`packages/core/agent-loop/src/agent.ts:479–496`），`AssistantStreamAttempt.push` 为每个 chunk 发布实时 chunk frame（`packages/core/agent-loop/src/assistant-stream.ts:59–70`），最终回合会 append `turn/end`（`packages/core/agent-loop/src/agent.ts:422`）。

**但不能把这个结论直接扩大为“现成 SDK JSON-RPC 客户端一定收到至少两个实时文本通知”。** 当前 SDK server 注册并转发的是 durable `session/event`、agent/status 等通知（`packages/sdk/server/src/server.ts:171–215`）；本次对 `packages/sdk/server/src/` 全目录检索 `agent/assistant-stream` 没有匹配。实时增量是进程内 `agent/assistant-stream`，而 durable assistant 消息保存完整 stream 后再提交（`packages/core/agent-loop/src/agent.ts:486,494–496,505–519`）。SDK 的 `session.event` 能收到 `turn/end`，并不自动证明能够实时逐 chunk 收到文本。若 P2 最后选 stdio JSON-RPC，D2 的传输级增量要求需要接口 scout/实现者进一步确认或补最小桥接；不能把最终 assistant/message 内嵌的两个 chunk 拆开打印当成真正实时流。

上游已有通过真实 sdk profile + loopback Messages 服务完成回合并断言 `session.event` / `turn/end` 的测试（`apps/cli/tests/profiles/sdk/keyless-smoke.e2e.ts:73–105,122–170`），但它设置了一个占位 `DEEPSEEK_API_KEY`，且该段测试没有断言至少两个实时文本通知，因此它不能直接当作本任务严格条件的完成证据。其 `danger-full-access` 环境也不能带入 D8。

### D7 接入时的最低动作与未验证项

- 测试专用 profile/patch 应加载 replay 或 mock adapter 并选择 mock provider，清除真实 API key，隔离 DSH_HOME，避免读用户真实配置；sdk bundle 自己已禁用 session-title-llm（`packages/bundle/sdk-app/cordis.patch.yml:8–9`），其他模型调用也必须纳入 fake 脚本。
- setup 阶段需准备测试所需依赖、profile 和 fixture，测试阶段不再联网安装包或拉取市场内容。npm tarball 存在不是安装闭包、native 依赖和 profile 启动已经通过的证明。
- 本次只做只读源码、公共 registry 与 tarball 核验；没有安装 npm 包、运行 dsh、修改 repos，未执行断网无 key 的 app/sdk 回合。**D1 实际 setup/start、D7 全绿、传输层实时两个增量仍是后续 builder/verifier 的执行验收，当前均未验证。**

## 给主会话的结论

S4 可以收敛为“集成 npm 精确版本，默认不链接只读参考仓”；S5 可以收敛为“优先集成现成 replay，动态场景才改造现有 MockAdapter”。不要因为 SDK 的事件名字包含 event 就默认已经满足实时流式条件；把上述 JSON-RPC 增量缺口交给接口选型 scout/director 对照处理。本次三个问题已答完，无需再派逆向或自建 LLM 服务。
