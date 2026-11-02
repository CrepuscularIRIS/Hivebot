# RE-host-ext · 0.18→0.78.1 host 扩展清单级对照

日期 2026-11-01 · 输入：`/dev/shm/grok-re/0.18.0/app/`（win-x64 Setup.exe 解包，dist/host 5 文件 27 MB 实物）、`/dev/shm/grok-re/0.78.1/app/`（linux-amd64 解包树）、`repos/grok-bot-0.18-reconstructed/source/host/extensions/registry.ts`（只读对照）、`RE-w05.md`。全部静态证据，未运行、未登录、未拉 host-bundle。

## 结论（先行）

1. **host 的运行位置两个版本都在 box（云电脑沙箱）内，不在桌面 app 内**。0.18 的桌面 app 通过后端 `EnsureSandBox` 拿 `gateway_url/gateway_token/network_token` 连 box 内 host（0.18 `electron-main/main.cjs` 错误原文 "Broker did not expose the in-box Sand gateway (gateway_url empty); the backend stamps it on every box — check the backend version/logs."；0.78.1 `main-app.cjs` 同串仍 1 命中）。所以「本地 dist/host → 云端下发」的准确表述是：**0.18 asar 里带一份 baked 的 dist/host（27 MB），0.78.1 把这份本地副本删掉了**；host 本体的供给两个版本都走 S3（`public-asphr-vm-daemon-bucket`），由 box 内 host-upgrade 扩展 + supervisor 完成下载/换装/重启。
2. **0.78.1 app 内没有任何进程下载/解包/启动 host bundle**。`main-app.cjs` 里 `/tmp/sand-supervisor`、`incoming-host-bundle.tgz`、`/opt/sand/sand-host/host-main.cjs`、S3 URL 那组常量**只有声明、零使用**（esbuild tree-shake 残留的死常量，变量 YHt/TCe/WHt 各仅 2-3 处出现且全在声明区，offset 22275–22971），W05 报告「0.78.1 的 host 交付走 main-app.cjs#"incoming-host-bundle.tgz" 云端下发」应修正为：该常量是共享模块残留，实际下载方在 box 内（0.78.1 侧不可得）。
3. **0.78.1 的 main/coordinator 里没有 35 个扩展 id 的注册表或枚举引用**。全树 `grep -rlF '"<id>"'`：18 个 id 零命中；17 个命中行逐一看上下文，全部是同形异义（设置分区名、事件 channel、消息类型、遥测标签、OAuth 应用名列表），无一处在扩展注册语义上。客户端侧可观测的扩展痕迹只有 gateway 事件 channel 表（coordinator `main.cjs` 里 `tray/forever-box/teach-recording/host-settings/…` 等）与 host 设置镜像字段。
4. **通道 0.18→0.78.1 不变（HTTP gateway），0.78.1 增量小**：仍是 `/api/<command>` + `/events`（SSE）+ `/health` + `Bearer` + `x-anyrun-network-token` + 反向通道 `/local-exec/requests|/responses`；0.78.1 coordinator 侧新增 `/events/echo` 与 `x-anyrun-port-token`（0.18 两处均 0 命中，grep -cF 判定）。
5. 0.18 的 35 扩展清单（registry.ts 推定）与实物完全吻合：35 个字面串在 0.18 `host/host-main.cjs` 全部 `grep -cF '"<id>"'` ≥2 命中，且 `src/host/extensions/registry.ts` 模块的 35 个 `xxxExtension` 数组实物存在（见 §4 证据）。启动顺序 = 拓扑排序（依赖 peers + id 字母序 tie-break），非固定清单序。

三态口径：**证据** = grep 命中并看过上下文；**推定** = 重建仓源码或 0.18 侧机制外推到 0.78.1；**未知** = 静态不可得（host 云端侧、S3 内容、box 内 supervisor 二进制）。

## 表① host 交付机制

| 环节 | 0.18（证据） | 0.78.1（证据/推定/未知） |
|---|---|---|
| asar 内本地副本 | `dist/host/`：host-main.cjs 24.7 MB + agent-isolation/{transcript-mirror,agent-store}-worker.cjs + extensions/{content-search/search-index,box-store-sync/box-store-vacuum}-worker.cjs（ls 实测） | 无 dist/host（W05 已证；本任务 ls 复核） |
| baked 副本的角色 | 【推定】box 镜像/provision 初始 host 或本地 dev-box（`scripts/dev-box-docker.mjs` 引用在 main.cjs，asar 内无 scripts/ 目录） | 不适用 |
| host bundle 源 | 【证据】host 侧 `host-bundle-source.ts`：`HOST_BUNDLE_BUCKET="public-asphr-vm-daemon-bucket"`、`HOST_BUNDLE_REGION="us-east-1"`、`HOST_BUNDLE_PREFIX="sand-host-bundle"`、版本文件 `sand-host-bundle-latest.version`、`https://<bucket>.s3.<region>.amazonaws.com/<prefix>`（0.18 host-main.cjs 原文） | 同 S3 地址作为死常量在 `main-app.cjs`（offset 22343 区，未使用）；实际拉取方【未知】（box 内，静态不可得） |
| 下载者 | 【证据】box 内运行的 host 的 host-upgrade 扩展自己 fetch（`fetchStageAndReportHostBundle`，日志原文 "staged …; supervisor swaps when idle"） | 【推定】同一机制延续（S3 常量仍在共享模块里） |
| 解包/换装者 | 【证据】box 内 **supervisor**（独立于 host-main 的进程，不在本 asar 内）：host-upgrade 只 stage——写 `/tmp/sand-supervisor/incoming-host-bundle.tgz`（先 `.part` 再 rename）+ 写 `command.json`（`kind:"upgrade", mode:"bundle", version, bundlePath`）；supervisor 读命令后换装并写 `acks/upgrade-<version>`；防崩坏 `post-swap-crash-loop` 检测 + 失败重 stage ≤2 次 | 同左【推定】；0.78.1 app 内确认无此逻辑（死常量证据） |
| 安装落位 | 【证据】常量：`/opt/sand/sand-host/host-main.cjs`、`/opt/sand/sand-host/version`、`/home/box/sand-data/.sand-host-upgrade.json`（0.18 host-main.cjs `SAND_BOX_HOST_VERSION_PATH` 等；同名常量在 0.78.1 main-app 死常量区） | 同左【推定】 |
| 启动者 | 【证据】box 内 supervisor（command.json 驱动；桌面 app 侧 `isSandHostProcess` 只做存活检查，不拉起）。host 进程 cmdline 含 `host-main` | 同左【推定】 |
| `host_bundle_channel` | （0.18 无此设置） | 【证据】`main-app.cjs#\"sand_host_bundle_channel\"` 2 处：statsig 类服务端设置 schema `{channel:string, watchIntervalMs:nullable}`，`client:true`，fallback `{channel:"", watchIntervalMs:null}`；channel 枚举常量 `["latest","stable","dogfood"]`（默认 latest，stable 为内部通道）。它是**客户端可读的通道配置**，不是客户端执行下载的开关 |
| host 自检/watch | 【证据】0.18 侧 watch 间隔 24h±50% jitter（`HOST_BUNDLE_WATCH_INTERVAL_MS=24*60*6e4`）；0.78.1 死常量区另有 `360*60*1e3`（6h，vm-daemon 侧口径） | 【未知】实际间隔由服务端 `watchIntervalMs` 下发 |

## 表② main / coordinator 引用的扩展 id 与能力枚举（0.78.1，字面串锚点，grep -cF 判定）

**结论：证据层面不存在任何「扩展 id 注册/枚举」引用。**

| 出现形态 | 位置与锚点 | 定性 |
|---|---|---|
| 死常量（非扩展） | `main-app.cjs#"sand-host"→"sand-host/host-main.cjs"` 等 supervisor 常量组 | 仅声明未使用（见结论 2） |
| gateway 事件 channel 枚举（最接近「能力枚举」的东西） | `node-agent-coordinator/main.cjs#\"forever-box\"`、`#"teach-recording"`、`#"tray"`、`#"transcript"`、`#"host-settings\"`、`#"agents-automation\"→"automations"` 等（`ese`/`Fz` 两张映射表，~30 个 channel） | 【证据】coordinator 解析 host→客户端事件；channel 名与 0.18 扩展 id 同名/近名的仅 5 个：tray(trays)、forever-box、teach-recording、transcript、host-settings(settings)——这是**事件面痕迹**，不是扩展注册 |
| host 设置镜像字段 | `main-app.cjs#\"local-tool-permission\"`（`jK="local-tool-permission"`，`syncHostSettingsToBox`/machineId 绑定）、`main-app.cjs#\"auto-review\"`（`syncHostSettingsToBox({autoReviewInstructions})`，reportDesktopEdgeFailure 标签 "host-settings","auto-review"） | 【证据】设置同步标签，消费 host 侧 settings/auto-review 扩展暴露的能力，非注册 |
| 其余全部命中 | `"settings"/"auth"/"session"/"memory"/"telemetry"/"mcp"/"experiments"/"notifications"/"attachments"/"automations"/"secrets"/"transcript"/"local-exec"` 等 | 【证据】同形异义：deep-link 路由名（`["agent","bot-template","marketplace",…,"settings"]`）、MCP 配置字段 `"auth"`、TLS `"session"`、OAuth 应用名列表里的 `"memory"`、Sentry egress 域 `"telemetry"`、子域名集 `"mcp"`、启动 phase `"experiments"`、设置分区 `["notifications","general"]`、agent 权限 kind 表 `["plugins","secrets","skills",…]`、消息类型 `type==="local-tool-permission"`。逐条上下文已抽查（本任务 §3 会话记录） |
| 0.18 对照 | 0.18 `electron-main/main.cjs` 同样无扩展注册引用（dist/host 是独立 bundle）；gateway-protocol.ts 打进 main.cjs 是命令表不是扩展表 | 【证据】 |

## 表③ 客户端 ↔ host 通道与方法名（只到边界）

| 项 | 值（证据锚点） |
|---|---|
| 传输 | HTTP(S)：命令 `POST {gatewayUrl}/api/<command>`，事件 `{gatewayUrl}/events`（SSE），健康 `GET /health`。0.18 `host/host-main.cjs#src/shared/gateway-wire.ts`：`GATEWAY_API_PREFIX="/api"`、`GATEWAY_EVENTS_PATH="/events"`、`GATEWAY_HEALTH_PATH="/health"`、另有 `/avatars`；0.78.1 `node-agent-coordinator/main.cjs` 同组常量 minified 后仍字面可读：`wB="/api",cz="/events",pz="/events/echo",fz="/health"` |
| 认证 | `Authorization: Bearer <gatewayToken>` + 可选 `x-anyrun-network-token: <networkToken>`（0.18/0.78.1 两版均命中）；0.78.1 新增 `x-anyrun-port-token`（`main-app.cjs` 1 命中，0.18 两侧 0 命中）。token 来源：后端 `EnsureSandBoxResponse{gateway_url,gateway_token,network_token,…}`（0.18 main.cjs proto 类；0.78.1 `proto.cjs` 同字段 grep 命中），或环境变量直连 `SAND_HOST_GATEWAY_URL/_TOKEN/_NETWORK_TOKEN` |
| 方法名（客户端→host） | 【证据】0.18 `electron-main/main.cjs#SAND_GATEWAY_COMMANDS` 完整 131 个命令名（getTranscript、sendPrompt、listAgents、createAgent、kickstartAgent、ensureForeverBox、getForeverBoxStatus、updateHostNow、getHostStatus、snapshotBoxStoreNow、autoUpdateBoxNow、prepareBoxForRecreate、resumeBoxAfterRecreate、startTeachRecording、stopTeachRecording、getTrays、dismissTray、uploadAttachment、readAttachmentImage、getHostSettings、setHostSettings、completeMcpOAuth、refreshMcp、listBoxMcpServers、requestWebAuthnCeremony、setBoxSecrets、getBoxSecretsStatus、portAgentLocalSkills、publishSkill…全表见 0.18 main.cjs offset≈17716285 起）。0.78.1 coordinator 抽查 `sendPrompt`(21)/`listAgents`(10)/`updateHostNow`(3) 命中，命令面延续【推定：全表等价未逐个验证】 |
| 事件（host→客户端） | 【证据】channel 枚举（0.78.1 coordinator `main.cjs`）：transcript、agents、agent-upserted、tray、subagents、async-tasks、forever-box、teach-recording、box-disk-pressure、computer-action、voice-call-nudge、messages-grants、agent-activity、outline、host-settings、cloud-agent-update、server-roster-changed、server-page-title-changed、workflows、automations、todos、bot-skills、bot-secrets、agent-tasks、agent-meetings、library-docs、agent-automations-changed、mcp-servers、mcp-auth 等（约 30 个） |
| 本地反向通道 | 【证据】0.18 `host-main.cjs#src/shared/local-exec-gateway.ts`：`GATEWAY_LOCAL_EXEC_REQUESTS_PATH="/local-exec/requests"`、`RESPONSES="/local-exec/requests|/responses"`——host 需要跑本地命令时经此让桌面 app 反向执行（配套提示文案 "the Grok Bot desktop app must be open and online…"）。0.78.1 侧该路径字符串在 main-app/coordinator 0 命中【未知：0.78.1 本地反向通道的确切形式未定位，可能改由 SandBoxService/AgentStoreService RPC 或 exec_daemon_url 承担】 |
| 扩展启动顺序（客户端可观测部分） | 客户端不可观测 host 内部启动顺序（【推定】拓扑序，见 §4）；客户端侧可观测的只有 host 就绪后的 gateway 可达性与上述事件流 |

## 表④ 0.18 的 35 扩展回退表（0.78.1 树 grep -rlF '"<id>"' dist，含 *.cjs/*.js）

口径：`grep -rlF "\"<id>\"" --include='*.cjs' --include='*.js' .`（在 `/dev/shm/grok-re/0.78.1/app/dist` 执行）。0 列 = 全树零命中（硬负证据）。命中列给出文件并定性（同形异义 / 事件 channel / 设置字段）。每行「0.78.1 仍存在？」结论均为**推定**（静态只能证明桌面 bundle 无引用，不能证明 box 内 host 没有该扩展；host 云端下发，内容不可得）。

| # | 0.18 扩展 id | 0.18 host-main.cjs 命中 | 0.78.1 dist 命中文件 | 0.78.1 命中定性 | 0.78.1 host 侧 |
|---|---|---|---|---|---|
| 1 | notifications | 4 | main-core, local-exec-daemon | 设置分区路由 `["notifications","general"]` | 推定保留 |
| 2 | content-search | 7 | （0 命中） | — | 推定保留（搜索索引 worker 为 0.18 asar 实物，0.78.1 未随包） |
| 3 | memory | 13 | main-app, preload | OAuth 应用名列表/设置字段 | 推定保留 |
| 4 | cross-user-sharing | 17 | （0 命中） | — | 推定保留（房间/共享方法在 gateway 命令面） |
| 5 | state-backstop | 3 | （0 命中） | — | 推定保留 |
| 6 | source-map | 5 | （0 命中） | — | 推定保留 |
| 7 | telemetry | 50 | main-app, main-core | Sentry egress 域/遥测标签 | 推定保留 |
| 8 | trays | 6 | （0 命中，channel 名为单数 "tray" 在 coordinator 命中） | — | 推定保留（tray 事件 channel 在） |
| 9 | auth | 27 | main-app, main-core, onepassword, daemon | MCP 配置字段/错误 domain | 推定保留 |
| 10 | experiments | 5 | main-app, main-core | 启动 phase 名 | 推定保留 |
| 11 | browser-ua | 2 | （0 命中） | — | 推定保留 |
| 12 | inference | 8 | （0 命中） | — | 推定保留 |
| 13 | local-exec | 5 | main-app, main-core | 遥测 domain 标签（"local-exec","account-pause"） | 推定保留（local-exec-daemon 进程独立存在） |
| 14 | local-tool-permission | 18 | main-app, coordinator | 设置镜像字段 + 消息类型 | 推定保留（审批 UI 在） |
| 15 | attachments | 19 | main-app, main-core, coordinator | 遥测 kind/本地图片缓存标签 | 推定保留 |
| 16 | forever-box | 25 | coordinator, renderer eager | gateway 事件 channel `t.channel==="forever-box"` | 推定保留 |
| 17 | secrets | 7 | main-app, preload, coordinator | agent 权限 kind 表 | 推定保留（Secrets 服务疑似并入 AgentStoreService【未知】） |
| 18 | turn-execution | 5 | （0 命中） | — | 推定保留 |
| 19 | transcript | 20 | main-app, preload, coordinator | UI surface 枚举 + 事件 channel "transcript" | 推定保留 |
| 20 | session | 12 | main-app, main-core, preload, daemon | TLS session/遥测 | 推定保留 |
| 21 | automations | 11 | main-app, preload, coordinator | 权限 kind 表 + 事件 channel "automations" | 推定保留 |
| 22 | settings | 33 | 5 个 bundle | deep-link 路由/事件 channel "host-settings" | 推定保留（setHostSettings 命令面在） |
| 23 | box-lifecycle | 3 | （0 命中） | — | 推定保留（0.78.1 新增独立 SandBoxService 55 方法旁证） |
| 24 | managed-setup | 6 | （0 命中） | — | 推定保留 |
| 25 | mcp | 33 | main-app, daemon | 子域名集 `new Set(["mcp","api",…])` | 推定保留（Dashboard 保留 21 个市场/MCP 方法，W05 轴④） |
| 26 | box-store-sync | 8 | （0 命中） | — | 推定保留（box-store-vacuum-worker 为 0.18 asar 实物） |
| 27 | cloud-agents | 4 | （0 命中；channel "cloud-agent-update" 在 coordinator） | — | 推定保留 |
| 28 | action-audit | 3 | （0 命中） | — | 推定保留 |
| 29 | host-upgrade | 5 | （0 命中；supervisor 死常量组相关） | — | 推定保留（S3 供给机制在，§表①） |
| 30 | auto-review | 10 | main-app, main-core, daemon, coordinator, renderer | 设置分区 + syncHostSettingsToBox 标签 | 推定保留 |
| 31 | codebase-telemetry | 4 | （0 命中） | — | 推定保留 |
| 32 | teach-recording | 6 | coordinator, renderer eager | gateway 事件 channel 枚举 | 推定保留（start/stopTeachRecording 命令面延续【推定】） |
| 33 | webauthn-proxy | 5 | （0 命中） | — | 推定保留（onepassword-connection-service.cjs 10.7 万字节独立 bundle 为 0.78.1 新增旁证【推定】） |
| 34 | notify-bus | 4 | （0 命中） | — | 推定保留 |
| 35 | wallpaper | 2 | （0 命中） | — | 推定保留 |

0 命中合计 18/35：content-search, cross-user-sharing, state-backstop, source-map, trays, browser-ua, inference, turn-execution, box-lifecycle, managed-setup, box-store-sync, cloud-agents, action-audit, host-upgrade, codebase-telemetry, webauthn-proxy, notify-bus, wallpaper。

### 0.18 侧清单与顺序的证据

- registry.ts（重建仓）给出 HOST_EXTENSION_ORDER 35 项与 `HostExtensions.X = "<id>"` 映射；**实物验证**：0.18 `host/host-main.cjs` 内 `// src/host/extensions/registry.ts` 模块的 `hostExtensionRegistry` 数组按完全相同顺序列出 35 个 `xxxExtension` 变量（offset≈23.95M 处，逐名核对一致）；35 个 id 字面串在该文件 `grep -cF '"<id>"'` 全部 ≥2。
- 启动顺序【推定依据为实物代码】：`// dune/src/host-extensions/boot.ts` 的 `resolveHostExtensionBootOrder`——按 `dependencies` peers 做拓扑排序，`[...peersOf.keys()].sort()` 字母序 tie-break，即**实际启动序是拓扑序而非 registry 数组序**；有环/缺 peer/自依赖都会抛 `HostExtensionGraphError`。依赖例证：`webauthn-proxy` 声明 `dependencies:[HostExtensions.Telemetry]`。host 内部各扩展完整依赖图未逐个提取（35 个 defineHostExtension 的 dependencies 字段散在 24 MB bundle 中，本任务未全量抽出——需要时可按 `defineHostExtension({` 定位逐个提）。

## 复刻要点

1. 复刻 host 时不必做「本地 host bundle」：对齐 0.78.1 形态 = 桌面 app 零 host 代码，host 是独立 Node 进程（cmdline 含 host-main），由编排层（我们对应物：后端/daemon）供给与守护；供给产物形态为 tgz + version 文件。
2. 客户端只需要实现 gateway 客户端：`POST /api/<command>`（131 个命令名可直接取自 0.18 main.cjs SAND_GATEWAY_COMMANDS）+ `/events` SSE + Bearer/network-token 头；事件 channel 约 30 个。
3. host 侧插件骨架复刻 boot.ts 即可：拓扑排序 + 字母序 tie-break + GraphError 三种校验，与 registry 数组序解耦。
4. 自升级走「stage + 命令文件 + supervisor 空闲换装 + ack 防回退 + crash-loop 检测」，不要在 host 进程内自替换。

## 局限与未验证项

- 0.78.1 box 内 host 的真实扩展集合、bundle 内容、S3 对象均不可得（云端下发，静态红线内不拉取）——表④「推定保留」全部基于机制延续假设，无一可静态证实。
- 0.18 对照物是 win-x64 Setup.exe（W05 已记录平台差）；host-main.cjs 未 minify 的推断依赖 `// src/...` 注释存在，未逐段验证 24 MB 全部未 minify。
- 0.78.1 `"/api"` 前缀在 main-app 0 命中而 coordinator 命中：main-app 侧 gateway 调用的 URL 构造路径未逐个定位（可能在 minified 变量后拼接）；不影响通道结论（coordinator 持有完整 wire 常量 + 命令名）。
- 0.78.1 本地反向通道（/local-exec/requests 的对应物）未定位，是本报告唯一「该找没找到」的边界项。
- 35 个扩展的完整 dependencies 图未全量提取（只抽样 webauthn-proxy）；启动顺序结论（拓扑序）基于 boot.ts 实现，与具体每扩展的依赖声明无冲突但未交叉全验。
- owners.tsv 无 "host-ext" 归属行（该关键词在 owners.tsv 归属列不存在，实测 `awk '$4~/host-ext/'` 0 行）；本任务以扩展 id 为线索重做归属，未复用 owners.tsv。
- 未运行应用、未连接网络、未读取凭证目录；repos/ 只读，写入仅 /dev/shm（无）与 work/p1-re/RE-host-ext.md。

## 证据锚点索引（可复跑命令）

```
# 35 id 在 0.18 实物
for id in notifications …; do grep -cF "\"$id\"" /dev/shm/grok-re/0.18.0/app/dist/host/host-main.cjs; done   # 全 ≥2
# 0.78.1 负证据/命中
cd /dev/shm/grok-re/0.78.1/app/dist && grep -rlF "\"<id>\"" --include='*.cjs' --include='*.js' .
# 死常量判定（main-app.cjs，offset 22275–22971 区，仅声明无使用）
grep -oF 'YHt' electron-main/main-app.cjs | wc -l   # 2（var 声明 + 赋值）
# supervisor 常量组
grep -oE '.{400}incoming-host-bundle\.tgz.{600}' electron-main/main-app.cjs
# broker 错误原文两版同串
grep -cF 'Broker did not expose' electron-main/main-app.cjs        # 1
grep -cF 'Broker did not expose' ../../0.18.0/app/dist/electron-main/main.cjs  # 1
# gateway wire（0.18 host 侧）
grep -oE 'GATEWAY_[A-Z_]+ = "[^"]*"' host/host-main.cjs 或按 src/shared/gateway-wire.ts 定位
# coordinator wire（0.78.1）
python3 - 打开 node-agent-coordinator/main.cjs 搜 '"teach-recording"' 取上下文（wB="/api",cz="/events",pz="/events/echo",fz="/health",gz="Bearer"）
```
