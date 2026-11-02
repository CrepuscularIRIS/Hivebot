# 插件 / MCP 市场后端复用决策

## 结论与决策行

**应集成 dsh 的现有市场和插件管理后端，不应另写安装器。题目列出的三个目录本身不足以构成完整市场：还必须接入仓库已经存在的 `packages/boot/plugin-market`。** 插件管理器已经有程序 API、可导出的远程方法和现成前端消费者，不是只有 CLI。MCP 的运行时桥接也已有，但“任意 MCP 市场条目一键安装并填写配置”不是这三个目录已经实现的通用能力。最短路径是先把连接器作为 dsh bundle 提供，再沿用同一套市场、安装与启停流程；裸 MCP 服务器的可执行文件安装及连接参数映射仍需补齐。逐步证据见后文。

| 能力 | 候选（owner/repo@path） | 许可证 | 维护（最近 commit） | 决策 | 理由 / 适配工作量 |
|---|---|---|---|---|---|
| 插件市场目录、安装、启用 / 禁用。 | `deepseek-ai/deepseek-harness@packages/boot/plugin-market` + `packages/boot/plugin-manager`。 | MIT；根目录 `LICENSE:1-13`，两个包的 `package.json:52`、`package.json:65`。 | 本地市场包路径最近记录为 `00d541438b`，2026-10-28；管理器路径最近记录为 `8b8c9d9eea`，2026-10-29。仓库 HEAD 为 `ce7073d51254c26cd63b22a60835b8f948deb447`，2026-10-29 16:13:15 UTC，GitHub MCP 已核对。 | 集成 | 直接复用 `pluginMarket.search`、`pluginManager.installBundle`、`setBundleEnabled` 和 `setPluginEnabled`。需要把相关服务、Gateway / Connection、profile 与可选 HMR 组装进宿主，并提供有效市场索引 URL；不需要自建包管理后端。证据为 `packages/boot/plugin-market/src/index.ts:108-135,179-251` 和 `packages/boot/plugin-manager/src/index.ts:827-873,1248-1285`。 |
| 市场目录的离线生成。 | `deepseek-ai/deepseek-harness@apps/plugin-market-generator`。 | MIT；`package.json:10` 与根目录 `LICENSE:1-13`。 | 本地该路径最近记录为 `00d541438b`，2026-10-28。 | 集成 | 原样复用 source list → format-1 JSON 生成器，并另行把产物放到 HTTP(S) 可访问地址。它是目录生产工具，不是在线市场服务，也不执行安装。证据为 `src/cli.ts:46-92`、`src/generate.ts:323-360`；本应用 `package.json:5-9` 标为 private 且以 source script 启动，不应假设已有可直接安装的公开 npm SDK。 |
| 已配置 MCP 连接器的运行与释放。 | `deepseek-ai/deepseek-harness@packages/mcp/mcp-client` + `packages/mcp/mcp-resources`。 | MIT；两包 `package.json:30` 与根目录 `LICENSE:1-13`。 | 本地 `packages/mcp` 最近记录为 `00d541438b`，2026-10-28。 | 集成 | 直接复用 stdio / Streamable HTTP 连接、工具注册和 resource 工具。连接器若包装成 `dsh.bundle`，可复用上行安装启停；但这两个包不提供 MCP 市场目录或通用服务器安装接口。需要提供 bundle 与配置，不重写 MCP 协议客户端。证据为 `mcp-client/src/index.ts:1-13,51-104,154-203`、`mcp-resources/src/index.ts:20-34,74-104`，以及本文所列真实组合测试源码。 |

维护字段来自只读 `git log -1 -- <path>`；它记录路径最近可见提交，不表示该提交一定是独立功能更新。GitHub 最新提交证据为 <https://github.com/deepseek-ai/deepseek-harness/commit/ce7073d51254c26cd63b22a60835b8f948deb447>。许可证另已通过 GitHub MCP 实读根目录 LICENSE。所有下文相对证据路径均以 `/home/lingxufeng/bot/repos/deepseek-harness/` 为根，固定到上述 HEAD。`work/LEARNINGS.md` 已先读；当前项目根目录没有 `cards/`，没有可用的该处主卡或案例。本次问题可由本地源码完整回答，没有扩展成其他候选库选型。

## 1. 三个目录的职责、接口与数据来源

### 1.1 `packages/mcp` 是运行时子系统，不是市场包

`packages/mcp` 下实际有 `mcp-client` 和 `mcp-resources` 两个包。`mcp-client` 是 Cordis 函数插件，导出 `name`、`inject`、`Config` 与异步 `apply(ctx, config)`；每个实例连接一个外部 MCP server，把工具注册到 `ctx.tools`，公开名称为 `mcp__<serverName>__<rawName>`。它依赖工具服务，实例被释放时会断开连接、移除工具并释放命名空间。证据为 `packages/mcp/mcp-client/src/index.ts:1-13,30-34,154-203`。

其输入是**连接配置而不是目录记录**：stdio 配置含 `serverName`、`command`、`args`、`env`、`cwd`；HTTP 配置含 `serverName`、`url`、`headers`，另有超时、重连及启动失败策略。两种配置均有 schema。这里的 Streamable HTTP 是连接外部 MCP server 的传输协议，不是向我们前端提供的市场管理 HTTP API。证据为 `packages/mcp/mcp-client/src/index.ts:51-142`。

`mcp-resources` 是 Cordis service，程序 API `register(server, provider)` 注册带 `request()` 的 resource provider，释放回调会清理注册；它提供模型侧 resource 工具，操作是 `resources/list`、`resources/templates/list`、`resources/read`，不是市场目录浏览。证据为 `packages/mcp/mcp-resources/src/index.ts:20-34,46-49,74-125`。

因此，这两个包不拉取插件 / MCP 市场目录；它们处理已配置 MCP server 的工具发现与资源访问。不能把 MCP 的 `resources/list` 当成“浏览市场目录”，也不能把 `apply()` 当成安装软件包。实际参考配置还明确要求先安装 `mcp-server-memory` 可执行文件，DSH 只启动它而不运行包管理器，见 `apps/cli/config/examples/mcp-memory/mcp-reference-memory.cordis.yml:1-13`。

### 1.2 `packages/boot/plugin-manager` 是当前 profile 的安装与组合管理服务

这是 `PluginManager extends TypertRemoteService`，服务名为 `pluginManager`，注入 `loader` 与 `profileContext`。它不是独立无状态 npm 安装函数；需要 dsh profile / loader 宿主。包根入口导出服务，另有 `/operations`、`/types`、`/remote` 与 `/typert` 等入口。证据为 `packages/boot/plugin-manager/src/index.ts:304-358`、`packages/boot/plugin-manager/package.json:14-46`。

已经存在以下程序 / 远程 API，均带 `@Remote`：

| 方法 | 当前行为与证据 |
|---|---|
| `listPlugins()`、`listBundles()`。 | 返回当前 runtime 插件、bundle 清单与安装 / 启用 / 只读状态。见 `src/index.ts:461-502`。 |
| `inspect(spec, options?, signal?)`。 | 检查 npm registry、绝对本地路径、Git 或 tarball spec；registry 与路径目标必须声明 `dsh.bundle`。见 `src/index.ts:596-650`。 |
| `installBundle(spec, options?)`。 | 使用与 `dsh plugin` 共用的 pnpm 路径安装 bundle；可传 `enabled`、registry、requestId、构建脚本批准项等。见 `src/index.ts:858-873,935-1009`。 |
| `setBundleEnabled(name, enabled)`、`setPluginEnabled(id, enabled)`。 | 持久化 bundle 选择或插件 patch，并尝试更新 live profile。见 `src/index.ts:827-855`。 |
| `waitForInstall(requestId)`、`cancelInstall(requestId)`。 | 可恢复活跃安装的等待结果，或取消仍处安装阶段的请求。见 `src/index.ts:1014-1038`。 |

`listBundles()` 的数据来源是本机 profile 的 `package.json` 中已选择 bundles 与 dependencies、安装目录 manifest 的 dependencies，以及编译时的 `OFFICIAL_ON_DEMAND_CATALOG`。它**不是从远程市场索引下载完整第三方目录**。见 `packages/boot/plugin-manager/src/index.ts:494-524`。离线官方目录本身是生成的 TypeScript 常量，其中含 Claude Code、Codex 与 CUA bundle 记录，见 `packages/util/official-bundles/src/catalog.generated.ts:1-33`。

npm 查询是另一条数据路径：`inspect()` 通过 `pnpm view` 查询指定包的 `name/version/description/dsh`，解析 JSON；registry 默认遵循 pnpm 配置，并有可配置 fallback。它不是“搜索整个 npm 市场”。证据为 `packages/boot/plugin-manager/src/index.ts:100-101,602-650,783-825`；registry URL 与回退规则见 `src/registry.ts:13-17,39-75`。

安装时实际执行 `pnpm add`，随后验证包的 `dsh.bundle`、兼容性和 bundle patches；失败会恢复之前的 `package.json` 与 lockfile。默认会选择启用新 bundle，但可通过 `enabled:false` 先安装再单独启用。证据为 `packages/boot/plugin-manager/src/index.ts:935-1009`。

### 1.3 `apps/plugin-market-generator` 是目录生产工具，不是目录服务器

该应用的公开使用形态是命令行：`--input`、`--output`、`--title` 必填；可配置 registry、cache、concurrency 和 timeout。默认 npm registry 为 `https://registry.npmjs.org/`。`main(argv)` 和 `generate(options)` 虽然是源码导出的程序函数，但此应用 `package.json` 为 `private:true`，没有提供一个已经发布的浏览器市场 SDK。证据为 `apps/plugin-market-generator/src/cli.ts:20,46-58,65-100`、`src/generate.ts:323-360`、`package.json:1-10`。

输入是用户维护的**纯文本 source list**，每行一个 npm 包名或 HTTPS Git 仓库 URL；空行与 `#` 开头行忽略，并去重。它没有自动从 Grok Bot、Smithery 或某个公共 MCP registry 拉完整连接器清单。证据为 `apps/plugin-market-generator/src/sources.ts:1-7,15-47`；该文件也已用 GitHub MCP 按 HEAD 实读。

生成器对 npm source 拉取 packument，保留非 deprecated、非 private 且声明 `dsh.bundle` 的版本；从最高版本 tarball 提取展示信息。对 Git source 读取默认分支和发布标签，在仓库中发现 bundle 包，版本 source 固定到 commit，可含子目录 path。证据为 `apps/plugin-market-generator/src/generate.ts:156-183,200-265`。

输出为 UTF-8 JSON 的 **format 1 索引文件**和必要的 `icons/` 文件，不在运行中提供 HTTP 服务。顶层含 `format:1`、`title`、可选 `description`、`plugins`；条目含 `name`、展示字段与 `versions`，版本含 `version`、Unix 秒 `publishTimestamp`、`source`、可选 `engines.dsh`。source 是 `{type:'npm',registry?}` 或 `{type:'git',url,commit,path?}`；市场格式还允许分类、标签等 metadata。证据为 `apps/plugin-market-generator/src/generate.ts:12-49,353-360`、`src/cli.ts:83-92`、`packages/util/plugin-market-index/src/types.ts:19-33,43-102`。

### 1.4 浏览运行时是第四个已经存在的包，不能漏掉

`packages/boot/plugin-market` 就是所缺的在线消费层。它注入 `pluginManager`，通过 `config.indexes` 读取索引 URL，默认值是空数组；`listIndexes()` 只列配置，不联网；`search(url, query)` 从配置的 source 拉取并缓存文档，分页、过滤与排序，再附上安装状态、兼容性与安装参数。`setIndexes(urls)` 通过 Settings 写配置，需要 Settings service 与 profile entry。证据为 `packages/boot/plugin-market/src/index.ts:108-135,175-251,363-378`。

拉取使用 `fetch(url)` 与 `Accept: application/json`，拒绝跳转，带超时、体积限制；正文按严格 UTF-8、JSON 和 format-1 验证。证据为 `packages/boot/plugin-market/src/index.ts:424-452`、`src/parse.ts:15-41`。因此，如果需要市场在线浏览，现成后端是**这个包**，不是 generator。最小部署仍需要选定已有可用索引 URL，或将 generator 产物发布为可访问的静态文件；本次未验证任何真实市场 URL 的可达性或内容。

## 2. 浏览 → 安装 → 启用 / 禁用是否走得通

| 步骤 | 仅用题目指定三个目录的判断 | 加上仓库现成能力后的判断与缺口 |
|---|---|---|
| 浏览普通插件市场。 | 不完整。manager 只能提供本地 / 离线官方 inventory 和指定包 inspection；generator 只写目录文件，MCP 包不负责目录。依据为 `packages/boot/plugin-manager/src/index.ts:494-524,602-650`、`apps/plugin-market-generator/src/cli.ts:65-92`、`packages/mcp/mcp-client/src/index.ts:1-13`。 | 接入 `plugin-market` 后可复用在线目录浏览，`search` 已返回分页结果和安装目标。还需要配置非空的索引 URL，并提供实际内容。依据为 `packages/boot/plugin-market/src/index.ts:111-115,217-251,476-494`。 |
| 安装目录中的 dsh 插件。 | 可以安装已知 spec 指向的 dsh bundle，但三个目录未提供完整目录消费链路。manager 检查 `dsh.bundle`，不是无差别安装任意 npm 插件。依据为 `packages/boot/plugin-manager/src/index.ts:942-987`。 | 市场 `versions[].install` 已生成可交给 manager 的参数；npm 转为 `name@version`，Git 转为固定 commit 的 spec。现有 UI 已把选中版本转交安装流程，再调用 `remote.pluginManager.installBundle()`。依据为 `packages/boot/plugin-market/src/index.ts:476-483`、`packages/util/plugin-market-index/src/index.ts:325-329`、`packages/client/ui-plugin-market/src/client/DiscoverSection.tsx:604`、`packages/client/ui-plugin-manager/src/client/manager-store.ts:1265-1289`。 |
| 启用 / 禁用 bundle 或其插件。 | 已有。`setBundleEnabled()` 修改 profile 的 bundle 选择；`setPluginEnabled()` 写入持久 patch，均尝试 reload。不是所有系统插件都可关闭，受保护 / 无法定位条目会拒绝。依据为 `packages/boot/plugin-manager/src/index.ts:465-480,827-855,1169-1189`。 | 带 HMR 时重组 live profile；没有 HMR 会返回 `application:'restart-required'` 和 `restartReason:'no-hmr'`，因此不能把“保存配置成功”显示成“已即时生效”。现有前端已有启停调用。依据为 `packages/boot/plugin-manager/src/index.ts:1248-1285`、`packages/client/ui-plugin-manager/src/client/manager-store.ts:820,857`。 |
| 安装并启用 MCP 连接器。 | **仅当它已经是可安装的 dsh bundle 时可复用上述链路。** 裸 MCP server 的 npm 包、HTTP URL 或普通 mcpServers JSON 不是 manager 接受的 bundle 成品；client 需要明确的连接配置。依据为 `packages/boot/plugin-manager/src/index.ts:982-987`、`packages/mcp/mcp-client/src/index.ts:51-142`。 | 已有组合测试源码以包含 `mcp-client` 配置的 bundle 安装进真实 Web profile，检查工具出现、进程重启后保留及移除后工具消失。依据为 `apps/cli/tests/profiles/web/tests/creator-plugin-manager.expected.e2e.ts:28-41,73-103`。这证明现有设计已有 MCP bundle 路径，但本次未运行该测试。若需求是通用 MCP 市场，还缺条目到 bundle / 配置的映射、参数 / 凭证接入以及本地 server 可执行文件的安装策略，不能据此宣称任意 MCP server 都能一键装好。 |

因此，“今天能否走通”的准确回答是：**普通 dsh bundle 插件，以及已经包装成 dsh bundle 的 MCP 连接器，可以复用现成后端走完整链路；严格限定三个目录时缺在线市场消费者，而这个消费者在同仓 `plugin-market` 已存在。任意第三方 MCP 市场的通用适配不在当前已证实链路里。** 本结论是源码可行性确认，不是当前 Bot MVP 已跑通的验收结论。

## 3. 给前端调用的接口不是只有 CLI

### 3.1 首选复用现成远程客户端方法

manager 已导出 `/remote` 和 `/typert`，市场包同样导出 `/remote`。现成前端就是通过 `ctx.remote.pluginMarket.search(...)`、`setIndexes(...)`、`ctx.remote.pluginManager.inspect(...)`、`installBundle(...)`、`setBundleEnabled(...)`、`setPluginEnabled(...)` 调用。证据为 `packages/boot/plugin-manager/package.json:29-36`、`packages/boot/plugin-market/package.json:29-36`、`packages/client/ui-plugin-market/src/client/market-store.ts:380-405`、`packages/client/ui-plugin-manager/src/client/manager-store.ts:820,857,1243-1289`。

这是 dsh 的类型化远程服务客户端能力，而非要求前端启动 CLI 子进程。需要在宿主装配远程服务与其客户端命名空间；不能只 `import PluginManager` 就期待得到脱离 profile / Cordis 的独立浏览器 SDK。manager 的服务依赖见 `packages/boot/plugin-manager/src/index.ts:312-358`，市场服务依赖见 `packages/boot/plugin-market/src/index.ts:108-135`。

### 3.2 已有 HTTP 承载，但属于 RPC，不是独立 REST CRUD

Connection 在存在 `webServer` 时挂载 `/api` 前缀；会先进行 admission，拒绝请求时返回 401 / 403。RPC 使用 `POST /api/<namespace>/<method>` 与 `Content-Type: application/json`，请求带 `type:'client-request'`、`rpcId`、`method`、`payload`；payload 使用 `{args:{...}}` 的命名参数对象，方法名必须与 URL 后缀一致。依据为 `packages/client/connection/src/index.ts:119-125,140-164`、`src/rpc-host.ts:304-345,361-369`、`src/rpc-schema.ts:34-47`、`packages/api/gateway/src/index.ts:1261-1282,1535-1536`。

由此，装配并导出上述服务后，前端可用的 RPC 地址包括 `POST /api/pluginMarket/listIndexes`、`/api/pluginMarket/search`、`/api/pluginManager/listBundles`、`/api/pluginManager/installBundle`、`/api/pluginManager/setBundleEnabled` 与 `/api/pluginManager/setPluginEnabled`。namespace 分别由两个服务构造器注册，方法由对应 `@Remote` 声明；证据为 `packages/boot/plugin-market/src/index.ts:134-135,179-229` 和 `packages/boot/plugin-manager/src/index.ts:357-358,488-490,832-873`。这些是按现有承载实现确定的地址，不是本次已经访问成功的部署 URL；前端应优先使用现成 remote 客户端处理编码与结果，不另造一套未经鉴权的 REST 安装接口。

此外有明确的专用 GET 端点：`/api/plugin-manager/detail-file` 与 `/api/plugin-market/detail-file`，用来返回详情文档旁的图片，**不是**安装或启停接口。证据为 `packages/boot/plugin-manager/src/index.ts:91-92,385-388,415-427`、`packages/boot/plugin-market/src/index.ts:85-86,154-157`。

### 3.3 真正只有离线工具形态的是 generator

generator 没有在所读源码中启动 HTTP server；`main(argv)` 读取输入文件，调用 `generate()` 并写 JSON / 图标。最接近前端可用的形态不是“HTTP 包一层 CLI”，而是**托管生成的静态索引，再让现成 `pluginMarket` 拉取，前端调用它的 remote 方法**。证据为 `apps/plugin-market-generator/src/cli.ts:65-100` 与 `packages/boot/plugin-market/src/index.ts:424-443`。

## 核验边界及主会话接续

- 已完成三问的源码核验与决策；未修改 `repos/`，未运行安装、构建、网络市场拉取或端到端测试。所引测试均明确是仓库已有测试源码，而非本次执行结果。
- 最短接续是把 `plugin-market` 补入依赖 / 宿主装配，复用 manager + remote API，并选择一个有效 format-1 索引来源。只有需要自行维护目录时才运行 generator。
- MCP 的接续需要明确内容范围：若 MVP 接受精选 dsh bundle 连接器，复用现有链路即可；若要求任意外部 MCP 市场条目，先确定目录来源、条目格式与配置 / 可执行文件交付方式。当前没有证据支持把这部分标为现成完成，也没有理由重写已有目录浏览器、pnpm 安装器或 MCP 协议客户端。

## 无账号替代源核实（2026-11-01）

### 1. 格式对照与兼容性结论

**结论是「需转换器」，不是直接兼容，也不是目录信息在结构上无法映射。** dsh generator 生成的是供 `pluginMarket.search` 消费的 format-1 安装索引，而 Grok 的 `marketplace.json` 是 Git 仓内的 Claude/Cursor 插件清单；Grok 的 `Marketplace` proto 又是服务端的市场记录，不能把这三个层次当成同一个 JSON。dsh 不会因为文件名叫 `marketplace.json` 就识别它。dsh 原文是 `readonly format: 1`、`readonly title: LocalizedText`、`readonly plugins: readonly MarketPlugin[]`，条目原文是 `readonly name: string` 与 `readonly versions: readonly MarketVersion[]`；生成结果明确为 `{format: 1, title, description?, plugins}`。证据为本仓只读参考源码 `packages/util/plugin-market-index/src/types.ts:76-102`、`apps/plugin-market-generator/src/generate.ts:44-49,353-360`；本节 dsh 相对路径均以 `/home/lingxufeng/bot/repos/deepseek-harness/` 为根，SHA 沿用本文前述 `ce7073d51254c26cd63b22a60835b8f948deb447`。

| Grok 字段或文件层次。 | dsh 格式原文及位置。 | 映射难度与限制。 |
|---|---|---|
| 仓内 `.cursor-plugin/marketplace.json` 或 `.claude-plugin/marketplace.json` 含 `name/owner/description/plugins`。 | `MarketIndex` 含 `format/title/description/metadata/plugins`，见 `types.ts:94-102`。 | 需要转换器；市场名称可以转成 `title`，但 dsh 没有市场 owner、市场 id 或账号/团队语义。Grok 格式证据为 `/home/lingxufeng/bot/work/p1-re/RE-marketplace.md:85-108`。 |
| `Marketplace.git_url/git_ref/last_indexed_commit_sha` 描述被索引的市场仓库。 | `MarketIndex` 没有这些字段；`MarketSource` 的原文为 `{type:'git',url,commit,path?}`，见 `types.ts:43-58,94-102`。 | 需要在快照来源记录中保存市场仓 URL、ref 和解析后的 SHA；不能将市场的 SHA 无条件写成每个插件的 `source.commit`，因为插件可能来自外部仓。Grok proto 证据为 RE 文档 `:64`。 |
| `Marketplace.last_indexed_at/auto_reindex/distribution_git_url/is_default/allow_user_publish` 等是服务端索引或发布策略。 | dsh 索引没有对应策略字段；`MarketVersion.publishTimestamp` 原文要求版本发布时间为 Unix 秒，见 `types.ts:66-73,94-102`。 | P2 静态快照不实现这些策略，也不能把索引时间冒充上游版本发布时间。来源抓取时间应另记，版本时间优先取 registry 发布元数据或 Git commit 时间。Grok 字段证据为 RE 文档 `:64`，dsh Git 时间取值见 `generate.ts:263-265`。 |
| `Plugin.name/display_name/description/repository_url/tags/logo` 是展示字段。 | `MarketPlugin.name/title/description/repository/icon/metadata`，见 `types.ts:76-91`。 | 这些字段转换成本低；但 dsh 的 `name` 必须是 npm 包名，registry 的反向域名式 server name 或 Grok id 不能不校验就透传。应保留源 id 到 bundle 包名的确定性映射。Grok Plugin 字段证据为 RE 文档 `:38`。 |
| `Plugin.git_url/git_ref/git_path` 和 manifest 的 `source:{source:'github'|'url'|'git-subdir',…}` 或相对目录指定插件内容。 | Git source 固定 `url/commit/path?`；npm source 只有 `type:'npm',registry?`，具体包名和版本分别在条目与 `versions[]`，见 `types.ts:43-73`。 | 需要解析 ref 为 40 位 commit，将 GitHub 简写展开为 URL，并正确区分市场内相对路径与外部仓路径。只转换这几个字段不等于插件可安装。Grok source 证据为 RE 文档 `:58-62,98`。 |
| manifest 的 `version/mcpServers/variables` 与 proto 的 `mcp_servers/variables` 是插件内容和输入定义。 | `versions[]` 必须非空且含精确 SemVer、`publishTimestamp/source/engines`，而 format-1 没有 `mcpServers` 或变量 schema 字段，见 `types.ts:66-91`。 | MCP 配置必须随实际 dsh bundle 交付，而不是塞进索引后期待执行。dsh generator 仅接受 `dsh.bundle.patch` 为字符串或字符串数组的 package manifest，见 `apps/plugin-market-generator/src/packages.ts:56-64`。Grok 内容证据为 RE 文档 `:95-105,111-124`。 |

generator 原样不能把 Claude 市场仓或 MCP registry 直接变成可安装目录：npm 路径过滤未声明 `dsh.bundle` 的版本，Git 路径也只发现声明该字段的 package；这分别有 `generate.ts:164-173,258-265,287-300` 的直接证据。因此最少新增工作是**外部记录到 MCP bundle 的转换和快照生产**，继续使用现成 format-1 parser、generator、`pluginMarket`、`pluginManager` 和 `mcp-client`；不重写市场浏览器或安装器。已有 MCP bundle 的最小组成可以直接沿用仓内测试的 `package.json` 加 `cordis.patch.yml`，见 `apps/cli/tests/profiles/web/tests/creator-plugin-manager.expected.e2e.ts:34-41`；该测试 `:87-88` 还明确让另一个 agent 同样看到工具，所以它不能作为 D6 的 X/Y 隔离证明。

另须保留 RE 的限定：Grok daemon 虽带自定义市场解析/稀疏克隆库，但其运行时消费者尚未定位；“源码可识别此格式”不等于原版客户端自定义市场已经实际跑通。证据为 RE 文档 `:57-64,222-224`。本节并未对原版匿名 RPC 或安装登录限制增加运行时证明。

### 2. 已核实的公开无账号目录源

本次以不带 Authorization、Cookie 或 API key 的 Python 标准库 HTTPS GET 实测公开 API 和 GitHub raw URL，均收到 HTTP 200。只读 GitHub MCP 另外核对了源码、许可证与最新提交。目录 JSON 已全量解析以计数和筛选字段；**没有逐项审阅 315 个插件的实现或所有外部仓**，大体积 GitHub MCP 返回也没有逐字通读，以下只对实际读取的字段和 MCP 配置样例作结论。未写入 `repos/`，未执行下载内容。

| 公开源与 URL。 | 条目数与格式。 | 许可证与维护证据。 | 对 P2 的判断。 |
|---|---|---|---|
| MCP 官方 registry 的匿名列表 API 为 <https://registry.modelcontextprotocol.io/v0.1/servers?limit=100&version=latest>，源码仓为 <https://github.com/modelcontextprotocol/registry>。 | 实测前 10 页得到 **1,000 个互异的 latest server name，仍有 nextCursor**，所以确认规模至少千条，完整总数未验证，不能把单页 `metadata.count=100` 写成全库总数。响应是 `{servers:[{server:{name,version,description,repository?,packages?,remotes?},_meta}],metadata:{nextCursor?,count}}`。不加 `version=latest` 会包含同一 server 的历史版本。 | 当前仓库 LICENSE 是 Apache-2.0/MIT 过渡，非规格文档为 CC-BY-4.0；这不代表各 server 软件都使用同一许可证，也未核实独立目录数据授权。证据为 <https://github.com/modelcontextprotocol/registry/blob/01e5c936ad3048d16562be503d879e523e36d267/LICENSE>。最近 commit 为 `01e5c936ad3048d16562be503d879e523e36d267`，2026-10-31，见同仓 commit URL。 | 它已经是 MCP 专用目录，不需要识别 skills/hooks/agents，适合作为首选上游；仍需 dsh bundle 转换，不能把 API 响应直接设置为 dsh 索引。分页、latest 和最多 100 条的源码证据为 <https://github.com/modelcontextprotocol/registry/blob/01e5c936ad3048d16562be503d879e523e36d267/internal/api/handlers/v0/servers.go>。 |
| Anthropic 官方 Claude 插件市场的固定快照为 <https://raw.githubusercontent.com/anthropics/claude-plugins-official/a7ba5b93db0c7c8d17f3f1d25853adca79598a1a/.claude-plugin/marketplace.json>。 | 实测为 **315 个 plugins**，格式含 `$schema/name/description/owner/renames/plugins`，plugin source 同时出现市场内相对目录和外部 Git URL+SHA。315 是全部插件数，不是 MCP 数；其中包含非 MCP 插件。实际 MCP 样例为 `context7`，其配置见 <https://github.com/anthropics/claude-plugins-official/blob/a7ba5b93db0c7c8d17f3f1d25853adca79598a1a/external_plugins/context7/.mcp.json>，含 `mcpServers.context7.type='http'` 与真实 remote URL。 | 根 LICENSE 为 Apache-2.0，外部仓和 server 软件须保留各自许可证，不能用根许可证覆盖；证据为同 SHA 的 <https://github.com/anthropics/claude-plugins-official/blob/a7ba5b93db0c7c8d17f3f1d25853adca79598a1a/LICENSE>。最近 commit 为 `a7ba5b93db0c7c8d17f3f1d25853adca79598a1a`，2026-10-30，见同仓 commit URL。 | 它与 Grok RE 的 Claude manifest 家族接近，是有效备选；但转 dsh 仍要读取每个插件的 MCP 文件并过滤非 MCP 内容，不能因有 `marketplace.json` 就省去转换。市场的 Cloudflare 条目实际指向 `cloudflare/skills`，所以仅见该名字不能断言它就是 Grok 的 Cloudflare MCP 连接器。 |

官方 registry 的具体无账号 MCP 目录样例已核实为 `com.cloudflare.mcp/mcp@1.0.0`，其源仓为 `https://github.com/cloudflare/mcp-server-cloudflare`，含 15 个 Streamable HTTP remote 和相应 SSE remote，其中 `https://docs.mcp.cloudflare.com/mcp` 的记录未声明 headers，其他多项声明可选 API token header。可复核 URL 为 <https://registry.modelcontextprotocol.io/v0.1/servers?limit=100&version=latest&search=cloudflare>；这个搜索本次返回 34 条，但只有精确 name 等于 `com.cloudflare.mcp/mcp` 的一条属于本段样例，不能把其余包含 cloudflare 字样的第三方条目当成 Cloudflare 官方。目录可读不代表所有 remote 调用都免账号，也不代表 30 个 remote 是 30 个独立市场条目。

运行时映射可以保留 server name、description、version 与来源记录，把选定 `remotes[].type='streamable-http'` 的 `url` 映射到 dsh `transport:'streamable-http',url,headers`。dsh 配置原文见 `packages/mcp/mcp-client/src/index.ts:79-104`。registry 的 header 记录是输入描述，不能把 `description` 当作 header value；秘密必须运行时注入。`packages[]` 中的 npm/PyPI/MCPB 等交付方式不是 dsh bundle，需分别处理，旧 SSE 也不能假装是当前 dsh 的 Streamable HTTP。该限制直接来自上述 API 样例和 dsh 的配置联合类型，而不是已存在的通用安装适配器。

包仓库核验也支持继续依赖现成后端：`npm view @deepseek-ai/dsh-plugin-market version time.modified repository --json` 本次返回 `0.2.1-alpha.4`、`2026-10-29T14:01:04.486Z` 与 `deepseek-ai/deepseek-harness` 的 `packages/boot/plugin-market` 路径。目录源本身用匿名 HTTP 读取即可，不需要为 registry 拉取再增加 npm 客户端库。

### 3. P2 D6 推荐与决策行

**推荐 MCP 官方 registry，优先将其 Streamable HTTP 条目投影为 dsh MCP bundles，再产出 format-1 快照。** 相比 Claude 官方市场，它的条目已是 MCP，remote 类型与 URL 可以直接落到现有 `mcp-client`，无需先恢复 Claude 插件的 skills/hooks/commands 语义；相比直接扫描任意 Git 市场，公开 API 还提供版本与发布元数据。这个推荐仅覆盖本题的目录来源，不声称任意 npm/PyPI/MCPB server 已能通用安装。证据为前述匿名 API 实测、`types.ts:43-91`、`mcp-client/src/index.ts:79-104` 和 `generate.ts:164-173,258-265`。

| 能力。 | 候选。 | 阶梯级别。 | 许可证。 | 维护。 | 决策。 | 理由与适配工作量。 |
|---|---|---|---|---|---|---|
| D6 无账号 MCP 目录与离线快照。 | `modelcontextprotocol/registry` 的公开 `/v0.1/servers` API，加已有 dsh `plugin-market-index`、generator、`plugin-market`、`plugin-manager` 和 `mcp-client`。 | 第 1 级，因为直接使用被维护的公开目录与已发布 dsh 包。 | registry 为 Apache-2.0/MIT 过渡，dsh 为 MIT；server 和独立目录数据授权按各自来源记录。 | registry 最近 commit 为 2026-10-31 的 `01e5c936…`；dsh 市场 npm 包修改时间为 2026-10-29。 | **集成**。 | 集成现有目录和完整浏览安装后端，只补外部条目到真实 MCP bundle 的转换。先支持 Streamable HTTP 是最小可行范围；不能把非 bundle 包交给 generator，也不能把快照上游 Git SHA当成下游 bundle 的安装 SHA。来源和限制见本节前两部分。 |

一句话落地路径是：**匿名拉取 registry latest 分页快照并保存原始响应/抓取时间/内容哈希 → 将可支持的 Streamable HTTP 记录转换成带 MCP 配置的真实 dsh bundle，用现成 generator 生成 format-1 `index.json` → 将原始快照、bundle 及索引纳入计划中的 `app/sdk/tests/fixtures/market/`，由测试静态 HTTP 服务提供索引与安装包，让 `pluginMarket` 的 indexes 和 `search(url,query)` 指向该服务。** HTTP 而非 `file://` 是因为现有消费层使用 `fetch(url)`；证据为 `packages/boot/plugin-market/src/index.ts:424-443,476-483`。离线 setup 必须同时缓存 dsh 依赖和 bundle 安装产物，只存目录 JSON 不能保证断网安装。

**D6 的验收边界还没有解除。** 完整 registry latest 总数尚未拉完，不能现在填写全量 N；若接受仅支持 Streamable HTTP 的投影，应先在 BRIEF 明写这个范围，再以实际生成快照的条目数定 N，不能静默过滤后声称等于全库。若要求原样全量目录，需要另外表达不可安装条目，而现有 dsh format-1 强制非空版本列表，不能伪造可安装版本。依据为 `/home/lingxufeng/bot/work/p2-sdk/BRIEF.md:69` 和 `types.ts:66-91`。

**Grok 基础市场同款连接器也仍需核对真实条目。** RE 已在 Cloudflare OAuth 表中定位 `mcp.cloudflare.com`，本次 registry 定位的是 `com.cloudflare.mcp/mcp` 及其 `docs/observability/…` 子域 URL；这证实同厂商的候选交集，却没有证明它们是原版基础市场同一条目/同一连接配置。因此不能直接选 Context7 或 Cloudflare Docs 就宣布满足 D6；Context7 虽在公开市场含 MCP 配置，但 RE 没证实它在 Grok 基础市场。后续应先以原版目录真实记录核对 name、remote URL 和认证方式，再锁定验收连接器。依据为 RE 文档 `:134`、上述 Cloudflare registry 响应和 BRIEF `:69`。本次完成的是“无账号目录源可行、格式需要转换”的核实，不是运行工具、OAuth 或 X/Y session 隔离验收。
