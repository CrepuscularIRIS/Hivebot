# p2sdk — P2 demo vertical slice on @deepseek-ai/dsh

P2 阶段的 SDK 纵向切片：以 `@deepseek-ai/dsh`（web profile，npm 钉版
`0.2.2-alpha.2`）为 runtime，对外走 `/api` + `/api/remote.mux`（WS，Q-004=B）。
验收证据见 `evidence/`（D1–D8 索引：`evidence/INDEX.md`）。

## setup

一条命令（干净 clone 后在仓库根执行）：

```
pnpm -C app/sdk setup
```

- `setup` = `pnpm install --frozen-lockfile`（package.json scripts）：全部依赖精确钉版
  （`@deepseek-ai/dsh{,-llm-pi-ai,-mcp-client,-plugin-manager,-plugin-market}` =
  `0.2.2-alpha.2`），lockfile 冻结安装，装完不改动 `package.json` / `pnpm-lock.yaml`，
  也不读写 `repos/`。
- Node 由 pnpm 钉定：`package.json` 的 `devEngines.runtime`（`>=24.9.0 <25`，
  `onFail: "download"`）让 pnpm 自动下载并使用 node 24.x（构建许可见
  `pnpm-workspace.yaml` 的 `allowBuilds: node: true`），系统无需预装特定 Node。

## 启动

```
pnpm -C app/sdk start
```

- real 模式（默认）：`P2SDK_LLM_API_KEY` 必填，模型请求经 `dsh-llm-pi-ai` 路由到
  LiteLLM 端点；launch token 经交接目录交给客户端，永不走 stdout。
- mock 模式：`P2SDK_PROVIDER=mock pnpm -C app/sdk start`，不检查 key，回复由
  `dsh-llm-replay` 回放固定 chunk 脚本。
- ready 判据：`P2SDK_READY_TIMEOUT_MS`（默认 60 s）内 stdout 出现
  `[p2sdk] ready http://127.0.0.1:<port>` 并常驻；端口只绑 loopback。凭证交接目录
  以 `p2sdk: handoff <dir>` 打到 stderr。
- 手动冒烟（D2）：`pnpm -C app/sdk exec node examples/min-client.mjs "你好"`——
  默认从 `P2SDK_HANDOFF` 读 token / base-url，也可显式给 `P2SDK_BASE_URL` +
  `P2SDK_LAUNCH_TOKEN`。
- 测试：`pnpm -C app/sdk test`（离线判据 `$OFFLINE` 见 PLAN 表下）；覆盖率
  `pnpm -C app/sdk test:coverage`（只计 `src/`，阈值 80%）。

LiteLLM 指向示例（默认值即本地 LiteLLM，通常无需另设）：

```
export P2SDK_LLM_BASE_URL=http://127.0.0.1:4001   # 默认值：本机 LiteLLM 根地址
export P2SDK_LLM_MODEL=glm-5.3-flash              # 默认值：本地 LiteLLM 上已实测的别名
export P2SDK_LLM_API_KEY=<你的 key>               # real 模式必填，只从环境变量读取
```

### P2SDK_* 环境变量

| 变量 | 默认值 | 作用 |
|---|---|---|
| `P2SDK_PROVIDER` | `real` | LLM provider：`real` 走 pi-ai → LiteLLM；`mock` 走 dsh-llm-replay 回放（不检查 key） |
| `P2SDK_LLM_API_KEY` | （无） | real 模式必填。只从环境变量读取、不进日志，经 handoff 目录（0600）交给 runtime |
| `P2SDK_LLM_BASE_URL` | `http://127.0.0.1:4001` | LiteLLM 根地址（启动器规范化为 `…/v1` 后作为 pi-ai 的 baseURL） |
| `P2SDK_LLM_MODEL` | `glm-5.3-flash` | 模型名（本地 LiteLLM 已验证的别名） |
| `P2SDK_HOME` | `<pkg>/.dsh` | runtime home。仅启动器一侧使用，不进 dsh 子进程环境（模型侧 shell 推导不出它） |
| `P2SDK_HANDOFF` | 每次 launch 的随机 tmpdir | 凭证交接目录（`launch-token` / `base-url`，0600）；路径以 `p2sdk: handoff <dir>` 打到 stderr |
| `P2SDK_PORT` | `0`（OS 分配） | 监听端口；只绑 127.0.0.1 |
| `P2SDK_PATCH` | 空 | 冒号分隔的额外 `--patch` overlay 路径（必须绝对路径） |
| `P2SDK_MARKET_INDEXES` | 空 | 空白分隔的 http(s) 市场索引 URL；配合 `profile/patches/market.yml` 作 plugin-market 的 `indexes` |
| `P2SDK_MARKET_SOURCE_INDEXES` | 空 | 同上，但配合 `profile/patches/market-source.yml`（D6 真实源链路）；同一 runtime 与上一条只挂一个 |
| `P2SDK_READY_TIMEOUT_MS` | `60000` | 等 ready 行的超时（毫秒） |
| `P2SDK_TEST_V8_COVERAGE` | （无） | 内部：把 `NODE_V8_COVERAGE` 目录带进 dsh 子进程（覆盖率管道，测试用，勿日常设置） |

## 临时扩展

P2 阶段唯一新增的对外方法（**P2-TEMP：P3 可推翻**；实现在
`src/p2temp/index.mjs`，全部标记 `P2-TEMP`）：

- `p2temp/session.createWithConnectors({connectors: string[], agentPreset: string, cwd?: string}) → {sessionId}`
- `p2temp/preset.ensure({agentPreset: string, connectors: string[]}) → {presetId}`

- `createWithConnectors` = 注册临时 preset（基础 preset 的插件行 + 各连接器 bundle
  的 insert 行）+ `session/create`；`preset.ensure` 只做注册这一步（幂等，preset id
  由内容决定），main 启动时按 recipes 逐个调用，让重启后旧 session 冻结的 id 重新
  可解析（CONTRACT #21）。
- `agentPreset` 在 SDK 层必填：缺省解析是 main 层的职责（CONTRACT §8 第 2 条）。
- `connectors` 是已安装在 profile 下、`package.json` 带 `dsh.bundle.patch`（JSON）
  的 bundle 名；安装走 `pluginManager.installBundle`（`enabled:false`），SDK 不自建
  安装器、不持久化状态、不做跨 session 调度、不支持对已开聊 session 热启用。
- 错误形状：连接器未安装 / 无 patch / patch 非 JSON / insert 为空时抛结构化错误
  `p2temp/connector-unavailable`（RemoteError：`message` 为人读描述，
  `details.connector` = bundle 名），不影响其他 preset。
- 挂载方式：`P2SDK_PATCH=<repo>/app/sdk/profile/patches/market.yml`（D6 真实源链路
  换 `market-source.yml`）——p2temp 服务行由这两个 overlay 装配，默认不加载。
