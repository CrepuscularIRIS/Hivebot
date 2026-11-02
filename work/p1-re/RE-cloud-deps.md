# RE-cloud-deps · 0.78.1 云端端点/服务清单（BRIEF §6）

日期：2026-11-01 · 对象：`/dev/shm/grok-re/0.78.1/app/`（0.78.1 linux-amd64 解包树） · 方法：静态 grep（锚点 `路径#"字面串"`，全部 `grep -cF` 命中≥1，未运行应用、未发网络请求）
辅助输入：`/dev/shm/grok-re/w05/axis4-proto.tsv`、`owners.tsv`（RE-w05）。

## 结论（3 行）

1. 全部云端流量收口在主进程侧：base URL 常量 `https://api2.cursor.sh`（备用 `api.origin.cursor.com`）只出现在 main/daemon/coordinator 四个 bundle，renderer 零命中——renderer 一律经 IPC 走 main（唯一例外：Sentry DSN 在 renderer 也有一份副本、Teams/mcp.shop OAuth 页在 renderer 打开浏览器）。
2. MVP 必须做替身的只有两条：推理（GrokBotService 流式 RPC → 本地 LiteLLM，即项目已定的路线）和 auth 的 `getAccessToken`（假 token 即可）；其余五域全部可 stub/no-op。
3. box 域的 host 已云端化：宿主内无 host 代码（RE-w05 §6），host bundle 从 S3 `sand-host-bundle`（latest/stable/dogfood 三通道）下发，落盘 `/tmp/sand-supervisor/incoming-host-bundle.tgz` 后在云端 box（`/home/box/sand-data`）运行——MVP 用本地 local-exec-daemon 替代，无需复刻。

## 主表（七个域 22 行 + 非 MVP 键显式排除 5 行）

调用方口径：main = 主进程及其 utilityProcess 子进程（local-exec-daemon、node-agent-coordinator，二者内嵌 proto 子集副本并各自持有 api2 常量）；renderer = 渲染进程；host = 云端下发的 host bundle（box 内）。

| # | 域 | 端点或服务名 | 调用方 | MVP 需本地替身 | 非 MVP 键 | 锚点 |
|---|---|---|---|---|---|---|
| 1 | 推理 | aiserver.v1.GrokBotService（414 方法，核心 `SendGrokBotAgentMessage`/`SendGrokBotUserMessage`/`InterruptGrokBotAgentRun` 流式） | main（daemon/coordinator 各内嵌子集副本） | **是**（→ 本地 LiteLLM） | — | `dist/electron-main/proto.cjs#"SendGrokBotAgentMessage"` |
| 2 | 推理 | `https://api2.cursor.sh`（RPC base，变量 Vh；备用 `https://api.origin.cursor.com`） | main+daemon+coordinator | **是**（指向本地） | — | `dist/electron-main/main-core.cjs#"https://api2.cursor.sh"` |
| 3 | 推理 | aiserver.v1.AiService（8 方法：StreamStt/TranscribeAudio/RunGenerateImage 语音图像） | main | 否 | 语音/图像 | `dist/electron-main/proto.cjs#"StreamStt"` |
| 4 | 推理 | aiserver.v1.BackgroundComposerService（10 方法后台合成） | main | 否 | 后台合成 | `dist/electron-main/proto.cjs#"typeName:\"aiserver.v1.BackgroundComposerService\""` |
| 5 | box | aiserver.v1.SandBoxService（55 方法，box 管理独立新服务） | main | 否（本地 local-exec 替代） | box/云电脑 | `dist/electron-main/proto.cjs#"typeName:\"aiserver.v1.SandBoxService\""` |
| 6 | box | S3 host bundle 下发：`https://${bucket}.s3.${region}.amazonaws.com/sand-host-bundle`（latest/stable/dogfood）→ 落盘 `/tmp/sand-supervisor/incoming-host-bundle.tgz` → host 在云端 box（`/home/box/sand-data`）运行 | main 下载，host 执行 | 否 | box/host 下发 | `dist/electron-main/main-app.cjs#"incoming-host-bundle.tgz"`（下载路径 `main-app.cjs#"sand-host-bundle"`） |
| 7 | box | aiserver.v1.AgentStoreService（25 方法，agent-store 云同步） | main | 否（MVP 本地文件即可） | agent-store 同步 | `dist/electron-main/proto.cjs#"typeName:\"aiserver.v1.AgentStoreService\""` |
| 8 | 账号 | `https://prod.authentication.cursor.sh` / `https://authenticator.cursor.sh`（认证；兼网络诊断探针，同组还有 downloads.cursor.com） | main | **是**（getAccessToken 假 token） | 账号 | `dist/electron-main/main-app.cjs#"prod.authentication.cursor.sh"` |
| 9 | 账号 | OAuth 连接器：Start/CompleteOnePasswordOAuth（1Password 本地回调服务独立 bundle）、Start/FinishMicrosoftTeamsAccountLink、Unlink/Disconnect | main（renderer 出 OAuth 页） | 否 | OAuth 连接器 | `dist/electron-main/proto.cjs#"CompleteOnePasswordOAuth"`；本地回调 `dist/electron-main/onepassword-connection-service.cjs#"onepassword"` |
| 10 | 账号 | 计费/支付：GetUserPrepaidBilling/GetTeamPrepaidBilling/ListFinancialAccounts/Stripe Link 支付方法（Get/SetGrokBotDefaultPaymentMethod、ListGrokBotStripeLinkPaymentMethods） | main | 否 | 计费 | `dist/electron-main/proto.cjs#"GetUserPrepaidBilling"` |
| 11 | 遥测 | Sentry DSN `https://9fb7a1b8…@metrics.cursor.sh/4511747394240513`（main-core 与 renderer eager-app 各 1 份常量） | main+renderer | 否（no-op stub） | 遥测 | `dist/electron-main/main-core.cjs#"metrics.cursor.sh"`；renderer `dist/renderer/assets/index.eager-app-iGTgHP_Q.js#"metrics.cursor.sh"` |
| 12 | 遥测 | OTLP traces exporter（`${base}/v1/traces` 拼接，base 为运行时配置，静态未见硬编码默认 URL） | main | 否 | otel | `dist/electron-main/main-app.cjs#"/v1/traces"` |
| 13 | 遥测 | Statsig（statsigapi.net / api.statsigcdn.com；四 bundle 的网络信任域 allowlist 均含其域） | main（daemon/coordinator 同） | 否 | 实验/特性开关 | `dist/electron-main/main-core.cjs#"statsigapi.net"` |
| 14 | 遥测 | aiserver.v1.AnalyticsService（8 方法，0.18→0.78.1 不变） | main | 否 | analytics | `dist/electron-main/proto.cjs#"typeName:\"aiserver.v1.AnalyticsService\""` |
| 15 | 遥测 | 渲染轨迹上报 sandRenderTrace（preload contextBridge 键） | renderer→main | 否 | 渲染遥测 | `dist/electron-preload/preload.cjs#"exposeInMainWorld(\"sandRenderTrace\")"` |
| 16 | 更新 | `https://api2.cursor.sh/updates`（变量 Sk；darwin=squirrel 通道、其他=iupdate 通道，按 stable/dogfood 等通道选 URL） | main | 否（复刻禁自动更新即可） | 自动更新 | `dist/electron-main/main-core.cjs#"https://api2.cursor.sh/updates"`（通道选择 `main-core.cjs#"squirrel"`） |
| 17 | 更新 | `https://downloads.cursor.com`（下载域；同时是网络诊断探针目标） | main | 否 | 下载 | `dist/electron-main/main-app.cjs#"downloads.cursor.com"` |
| 18 | 市场 | DashboardService 市场/MCP 21 方法（ListMarketplacePlugins/ListMarketplaces/InstallUserPlugin/UninstallUserPlugin/CompleteMcpOAuth/ExecuteSandMcpTool/GetAvailableMcpServers/GetMcpConfig/SetMcpConfig 等） | main | 否 | 市场/MCP | `dist/electron-main/proto.cjs#"ListMarketplacePlugins"` |
| 19 | 市场 | connector 静态 OAuth：`https://mcp.shop.com`（shop）、`mcp.slack.com`（slack connector，含 sendTools 配置） | main（配置副本在 renderer platform chunk） | 否 | connector 市场 | `dist/electron-main/main-app.cjs#"mcp.shop.com"`；renderer `dist/renderer/assets/index.eager-platform-C2su3Zzb.js#"mcp.shop.com"` |
| 20 | 团队 | Microsoft Teams：GetTeams/AddGrokBotTeamsAppToTeam/TeamsInstallState + AccountLink 家族；`teams.microsoft.com` OAuth（含 admin_consent 流程） | renderer（OAuth 页）+main（RPC） | 否 | Teams 集成 | RPC `dist/electron-main/proto.cjs#"FinishMicrosoftTeamsAccountLink"`；OAuth 页 `dist/renderer/assets/chunk-team-bot-teams-flow-dialog-live-ajOPiiYC.js#"teams.microsoft.com"` |
| 21 | 团队 | Slack：GetSlackInstallUrl/ClaimGrokBotSlackConnect/GetGrokBotInstallState/SlackUserSettings 等 | main | 否 | Slack 集成 | `dist/electron-main/proto.cjs#"GetSlackInstallUrl"` |
| 22 | 团队 | team-bot-service-accounts 管理 UI（renderer chunk 族 ×5 + billing-dev） | renderer | 否 | 服务账号 | `dist/renderer/assets/chunk-team-bot-service-accounts-*.js`（axis2 W05-2-237 族；成员清单见 owners.tsv） |
| 23 | 非 MVP 键 | 无端点（0 命中）：无 ssh URL 常量、无 Ssh* 云端服务 | — | — | **ssh** | 负证据：`grep -rioE 'https?://[^"[:space:]]*ssh' dist \| wc -l`→0（root=/dev/shm/grok-re/0.78.1/app，下同） |
| 24 | 非 MVP 键 | 无端点（0 命中）：无 remote 连接 URL 常量、无 Remote* 云端服务 | — | — | **远程连接** | `grep -rioE 'https?://[^"[:space:]]*remote' dist \| wc -l`→0 |
| 25 | 非 MVP 键 | 无端点（0 命中）：VNC 不走云端 URL/服务，只有本地 IPC 面（vnc 专项 preload 10 通道 + main `box-vnc` 边，见 RE-ipc-rpc §3.1/§2.1） | — | — | **vnc** | `grep -rioE 'https?://[^"[:space:]]*vnc' dist \| wc -l`→0 |
| 26 | 非 MVP 键 | 无端点（0 命中）：computer-use 无独立云端服务，权限审批走 main 边 dune-rpc 既有方法（见 RE-ipc-rpc §3.2 gd/fg 组） | — | — | **computer-use** | `grep -rioE 'https?://[^"[:space:]]*computer[-]?use' dist \| wc -l`→0 |
| 27 | 非 MVP 键 | 无端点（0 命中）：无 mobile/移动端 URL 常量与服务 | — | — | **移动端** | `grep -rioE 'https?://[^"[:space:]]*mobile' dist \| wc -l`→0 |

注：GrokBotChangelog（Get/Create/UpdateGrokBotChangelogInternal）与 Admin* 家族（服务账号管理/审计）归并进账号域 #9/#10 的服务端配套，未单列。

注 2（非 MVP 键口径，BRIEF D6）：7 个非 MVP 键中 box/云电脑（#5/#6）与账号体系（#8–#10）已有端点行，其余 5 键（ssh/远程连接/vnc/computer-use/移动端）由 #23–#27 显式排除行覆盖（无端点，负证据均为 2026-11-01 修复时实测）。旁证：`grep -oE 'aiserver\.v1\.[A-Za-z]+Service' dist/electron-main/proto.cjs | sort -u` 恰为 7 个服务（#1/#3/#4/#5/#7/#14/#18 所属），无上述 5 键的专属服务。

## 局限

- 清单级静态结论：只证「谁持有端点常量/服务定义」，不追调用链与协议字段（派发明确排除）；RPC 请求是否真发往 api2.cursor.sh 未运行验证。
- 调用方三分类中 daemon/coordinator 并入 main：二者是 utilityProcess 子进程且各内嵌 GrokBotService 子集 proto 副本（SendGrokBotAgentMessage 各 1 处）、各持 api2 常量；host 侧（云端下发 bundle）内部行为不可见。
- host bundle 的 S3 bucket/region（bCe/vCe 变量）静态不可得，疑由 SandBoxService 运行时下发；`/v1/traces` 的 OTLP base 同理未见硬编码默认值。
- renderer 调用方判定基于「api2.cursor.sh/authentication/statsigapi 在 renderer/assets 零命中」的负证据（grep 全量 assets 目录）；renderer 经 preload IPC 的具体通道由 ipc-rpc 轴负责，本表不展开。
- owners.tsv 的 cloud-deps 归属是 RE-w05 关键词规则产物（约 62 行），本表人工改判了个别行（如 AdminListTeamLiveGrokBotAgents 原标「语音端点」应属团队），未回写脚本。
- 平台口径：0.78.1 linux-amd64；squirrel 更新通道仅 darwin 生效（代码 `e.startsWith("darwin")?"squirrel":"iupdate"`），linux 走 iupdate。
