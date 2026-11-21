# RE-marketplace · 0.78.1 市场与 MCP（BRIEF §6 深挖）

日期：2026-11-01 · 目标：`/dev/shm/grok-re/0.78.1/app/`（linux-amd64 deb 解包树）· 方法：纯静态（grep + 上下文抽取），未运行、未联网、未登录。
输入：`work/p1-re/RE-w05.md`、`/dev/shm/grok-re/w05/owners.tsv`、`/dev/shm/grok-re/w05/proto-fields.tsv`、0.18 地图 `repos/grok-bot-0.18-reconstructed/`（只读，仅作对照与「推定」）。
锚点格式：`路径#"字面串"`，计数一律 `grep -cF` 实测（§5 附表）。相对根 `dist/` 省略写在前缀里。

## 0. 结论（先行）

1. **Q1 目录来源**：插件/MCP 市场目录走 **ConnectRPC 到默认后端 `https://api2.cursor.sh`**（`main-core.cjs#"https://api2.cursor.sh"`=2，env 覆盖链 `SAND_BACKEND_URL`→`CURSOR_API_BASE_URL`→默认），方法为 DashboardService 的 `ListMarketplaces` + `ListMarketplacePlugins`（分页 + marketplaceId 过滤），客户端工厂 `marketplaceBackendClientOptions` 显式 `authMode:"best-effort"`（`main-app.cjs#"authMode:"best-effort""`=1）。**无内置/离线目录文件**（app 树内除依赖 manifest 外无市场 JSON；renderer 目录页空态才显示 catalog status）。**第三方源**：① GitHub / 任意 git 仓的自定义 marketplace（`.cursor-plugin/marketplace.json`、`.claude-plugin/marketplace.json` 双格式，daemon bundle 内有完整解析+克隆+物化库）；② `Marketplace` proto 消息自带 `git_url/git_ref/last_indexed_commit_sha/auto_reindex`——市场本体就是被服务端索引的 git 仓。
2. **Q1 登录（D4）**：**部分**。目录浏览客户端按「无 token 也能发」实现：无 token 时降级 anonymous、带 `x-ghost-mode: true`、不带 Authorization（证据见 §2.3）；但服务端是否放行匿名请求静态不可判定，且团队市场/安装写账号必然要登录。**不需账号的替代源候选（≥1）**：GitHub 自定义市场（owner/repo 直装，daemon 内置 git 克隆，见 §2.4）。
3. **Q2 安装/启用**：安装=账号侧 RPC 写（`InstallUserPlugin{plugin_id, pinned_git_ref, variables, allow_missing_secrets}`），启用=`UpdateUserPluginInstall{is_enabled}`，配置存账号侧（`GetMcpConfig/SetMcpConfig`，`configJson` 即 `{mcpServers:{...}}`），**客户端本地无 MCP 配置落盘**；插件内容（skills/rules/commands/hooks/mcpServers）由 git 源克隆物化（daemon 侧有 MarketplaceCacheManager，`<cacheRoot>/<host>/<owner>/<repo>/<sha>`）。OAuth 连接器：静态/动态客户端注册表 + loopback 8787 回调 + `CompleteMcpOAuth(code,state)` 后端换 token（多数 provider `backendOnlyTokenExchange`）。详见 §3。
4. **Q3 MCP 进程归属**：**客户端（asar 内）无任何 MCP stdio spawn**。三处负证据 + 两处正证据：`StdioClientTransport`/`@modelcontextprotocol` 在 main/main-core/proto/daemon/coordinator 全部 0 命中；main-app 里有两条**显式拒绝执行的错误文案**（`"MCP tools run on Grok Bot"`、`"MCP resources are read on Grok Bot"`）。主进程只做：拉取配置 → 经 `coordinator-main` RPC（`refreshMcp`/`setBoxSecrets`/`carryBoxSecretsToBot`/`completeMcpOAuth`/`listBoxMcpServers`）转交。**MCP server 进程实际由谁拉起：运行归属未知**（host bundle 云端下发进 box，见 §4.3 路径证据；「box 内 host 拉起」是基于 0.18 地图的推定，不是定位结论）。

---

## 1. 分析对象与口径

- 范围：`/dev/shm/grok-re/0.78.1/app/dist/` 下 `electron-main/{main,main-app,main-core,proto}.cjs`、`local-exec-daemon/main.cjs`、`node-agent-coordinator/main.cjs`、`renderer/assets/`。全部 minified，结论以字面串锚点 + 上下文阅读为准。
- 复核了 W05 axis4 的「DashboardService 保留 21 个市场/MCP 方法」：直接从 `proto.cjs` DashboardService 段重抽 84 个方法名，市场/MCP 相关恰 21 个：GetMcpConfig、SetMcpConfig、GetAvailableMcpServers、ListSandMcpTools、ExecuteSandMcpTool、ReadSandMcpResource、DeleteMcpOAuthToken、ValidateMcpOAuthTokens、CheckHttpMcpStatus、RenameMcpOAuthAccount、DeleteMcpOAuthAccount、CompleteMcpOAuth、GetPluginMcpConfig、ListMarketplacePlugins、InstallUserPlugin、UpdateUserPluginInstall、UninstallUserPlugin、GetTeamPluginPopularity、GetEffectiveUserPlugins、ListMarketplaces、GetManagedSkills。（W05 axis4-proto.tsv 该行单元格在生成时被截断至 21/48，本报告以重抽为准。）
- 进程拉起关系复核（owners.tsv 交叉验证）：coordinator 由主进程 fork，`electron-main/main-app.cjs#"sand-node-agent-coordinator"`=1（`utilityProcess.fork(artifactPath,{serviceName:"sand-node-agent-coordinator"})`）；daemon 同法 fork（`main-app.cjs#"utilityFork"` 处 `gA.utilityProcess.fork(...)`）。与 owners.tsv Q1/Q3 行一致。

## 2. Q1 市场目录来源

### 2.1 RPC 面（插件/MCP 市场）

调用链（main-app.cjs，函数 d8n/c8n，上下文已抽读）：

```
listMarketplaces({})                          → marketplaces[]（含 teamId/isDefault/name/allowUserPublish）
  └ 对每个 marketplace: listMarketplacePlugins({marketplaceId, excludeCloudAgentPlugins:true})
listMarketplacePlugins({excludeCloudAgentPlugins:true})   // 不带 marketplaceId = 默认市场
→ 合并去重（pluginId 键），私有市场条目标 fromPrivateMarketplace:true
```

- 超时常量 `CURSOR_MARKETPLACE_REQUEST_TIMEOUT_MS`（IA=12e3ms 段内定义）。
- 失败路径打点 `marketplace-fetch`；token 获取失败打点 `marketplace-token`。
- 渲染层入口：host RPC 面 `getMcpCatalog`/`refreshMcpCatalog`（main-app.cjs 中 `getMcpCatalog:()=>manager.getCatalog(peekAccessToken,{forceRefresh:!1})`）。
- 目录条目 proto 消息 `Plugin`（46 字段）：id/name/display_name/description/status/repository_url/tags/logo/primary_color/is_published/publisher{id}/is_deprecated/replaced_by_plugin_id/marketplace_id+marketplace/git_url+git_ref+git_path+full_ref/**skills/subagents/hooks/rules/mcp_servers/commands**（内容清单）/release_repo+release_asset+release_tag（二进制发布物）/curated_category_keys/variables/team_marketplace_install_mode/min_client_versions/lifecycle_state/popularity_rank/team_admin_install_block_reason/account_unavailable_reason。
- 第二个市场族（bot 模板，非插件）：GrokBotService `ListPublicGrokBotMarketplaceListings`（分页 pageSize=100，featuredListings+listings+allCategoriesOrder；经标准 `createSandCursorBackendClient(GrokBotService,…)`，无 authMode 键 → required 模式，且捕获 PermissionDenied），用于从 web 分享导入 bot 模板（shareId → GetGrokBotTemplateImportDetails → presigned recipe 下载）。**这个族要登录**（required 客户端 + PermissionDenied 处理）。

### 2.2 后端地址

`main-core.cjs`（fAe/iY/$2 链）：`backendUrl = new URL(env.SAND_BACKEND_URL ?? env.CURSOR_API_BASE_URL ?? "https://api2.cursor.sh")`。Connect 传输 `createSandBackendTransport`：`baseUrl=backendUrl`，二进制格式，POST 到 `{backendUrl}/aiserver.v1.DashboardService/<Method>`。另有 managed deployment 钉选（pinned backendUrl/websiteUrl，https-only 校验）与 dev 后端拒绝逻辑（`SAND_BACKEND_URL`=localhost 才允许 devLogin）。

### 2.3 登录/token（D4 证据）

- `marketplaceBackendClientOptions`（UIt）：`{backend, authMode:"best-effort", getAccessToken:bestEffortToken, getTeamId, getMachineId, resolveGhostModeHeader:()=>"true"}`。
- 鉴权解析（W9t）：`authMode==="anonymous"`→anonymous；否则取 token，**token 为空 → anonymous**，非空 → required（Bearer + x-cursor-team-id）。
- 请求头组装（fOe）：required 才设 `authorization: Bearer <t>`；anonymous 恒 `x-ghost-mode: true`。marketplace 的 resolveGhostModeHeader 恒返回 "true"（即该客户端的请求永远声明 ghost 模式）。
- 未发现 renderer 目录页的登录门控（chunk-marketplace-browse-model-*.js 内无 signedIn/requireAuth 命中；空目录显示 `showsPluginCatalogStatus` 状态而非登录提示）。
- **结论**：目录拉取客户端在未登录时也发请求（匿名 + ghost 头）；「服务器是否真的给匿名客户端返回目录」静态不可判定。安装/写配置（`b_e(e)` 工厂创建的账号客户端，无 authMode 键 → required）必须登录。
- D4 判定：**部分**——浏览按免登录设计，写操作要登录，匿名服务端行为未验证。

### 2.4 第三方源 / 离线目录

- **无离线目录**：`/dev/shm/grok-re/0.78.1/app/` 内除 package.json 与 deps manifest 外无市场/插件 JSON；未发现任何 fallback 目录常量（目录为空即显示状态 UI）。
- **GitHub/git 自定义市场**（唯一在客户端 bundle 中发现的第三方源机制，位于 daemon bundle）：
  - 发现路径：`local-exec-daemon/main.cjs#".cursor-plugin/marketplace.json"`=1、`#".claude-plugin/marketplace.json"`=1（兼容 Cursor 与 Claude Code 两种插件市场格式）。
  - 源 schema（zod）：`{source:"github",repo:"owner/repo",ref?,sha?(40hex)}` | `{source:"url",url:"….git",ref?,sha?}` | `{source:"git-subdir",url,path,ref?,sha?}` | 纯字符串（本地相对路径）。
  - 克隆 URL 组装：`local-exec-daemon/main.cjs#"https://github.com/${s.repo}.git"`=1；kind 标记 `external-github/external-url/external-git-subdir/local`。
  - git 主机识别支持 github/gitlab/bitbucket/gitea/codeberg/azure-devops/generic（daemon 内 provider 判定函数）。
  - MarketplaceCacheManager：staging clone（`--filter=blob:none` 稀疏 + `fetch --depth 1` + sparse-checkout）→ `moveToCanonicalDir` → `<cacheRoot>/<host>/<owner>/<repo>/<sha>`，`_staging/<uuid>` 暂存，指标 `marketplace_cache_manager.ensure_cloned.cache_miss` 等（=1）。
  - **注意**：该类在 daemon bundle 内**无实例化调用**（`new D1`=0，ensureCloned/readManifest/discoverPlugins 均只有定义命中）——库随 daemon bundle 分发但本 bundle 内未接线，**谁在运行时用它：运行归属未知**（见 §7）。
- **服务端索引模型**：`Marketplace` proto 消息含 `git_url/git_ref?/last_indexed_at?/last_indexed_commit_sha?/auto_reindex/distribution_git_url?/is_default/allow_user_publish/grok_bot_linked/required_plugin_installs[]`——市场=git 仓 + 服务端索引；`GetPluginMcpConfigResponse` 带 `config_json + commit_sha`（插件 MCP 配置从特定 commit 物化）。`InstallUserPluginRequest.pinned_git_ref`、`UpdateUserPluginInstallRequest.pinned_git_ref` 支持钉 ref。
- **不从 MCP registry（modelcontextprotocol 等）拉目录**：无 registry.modelcontextprotocol.io / npmjs 目录类锚点；`mcp.cloudflare.com` 等出现仅作为 OAuth 连接器端点（§3.3），不是目录源。
- Web 直装 deep link：`main-app.cjs#"grok-bot/link/v1/"`=2，路由族 `["agent","bot-template","marketplace","plugin/add","plugin/native","prompt","referral","settings"]`（cursor.com 网页 → grokbot:// 打开），配合 daemon 字符串 `/v1/marketplace`、`/v1/plugin/add`、`/v1/plugin/native`。

## 3. Q2 安装、启用、manifest、OAuth

### 3.1 安装/启用步骤（客户端可见部分）

1. 目录浏览（§2.1）→ 详情页（renderer `chunk-plugin-detail-view-*.js` 等）。
2. 安装写路径（SandMcpCatalogFlow.writeInstall + 账号写入器 Adr，main-app.cjs）：
   - `requireCachedPlugin(entryId)` 取缓存条目 → 校验 `variableFields`（isSecret 分流，secret 字段省略时 `allowMissingSecrets`）；
   - `installUserPlugin(new InstallUserPluginRequest({pluginId, variables, allowMissingSecrets}))`（`main-app.cjs#"installUserPlugin(new A.InstallUserPluginRequest"`=1）；
   - 变量更新 `updateUserPluginInstall(UpdateUserPluginInstallRequest{plugin_id,is_enabled?,pinned_git_ref?,variables,merge_with_stored})`；卸载 `uninstallUserPlugin`；
   - 兜底：`account-install-backfill` 把生效插件回填安装到账号。
3. 手工配置编辑：`getConfigForEdit()` = `getMcpConfig(GetMcpConfigRequest{teamScope:false,redactSecrets:true})` → `configJson` 解析为 `{mcpServers:{}}` + `serverMetadataByName`；`setConfig` = `setMcpConfig(SetMcpConfigRequest{teamScope:false,configJson:JSON.stringify(config),serverIdsByName})`（锚点 =1 各一）。**配置的持久层在账号（后端），不在本地磁盘**。
4. 生效集：`getEffectiveUserPlugins(GetEffectiveUserPluginsRequest{useReplica,excludeConfiguredVariables})` → `plugins[] + marketplaces[]`，条目含 installMode（user/team-default/team-required）、is_enabled、pinned_git_ref、configured_variables、inline_content_json（内联内容插件可无 git 源）、served_by。
5. Bot 级启用/变量：`GetGrokBotAgentPlugins`/`SetGrokBotAgentPlugins`/`SetGrokBotAgentPluginVariables{agent_id,plugin_id,variables,merge_with_stored}`；Bot 级自定义 MCP：`Get/UpdateGrokBotAgentCustomMcp{agent_id,plugin_id,name?,http{url,header_names,has_oauth_client_id/secret} | stdio{command,args,has_env}}`（proto 消息 GrokBotAgentCustomMcpHttp/Stdio，daemon 与 coordinator bundle 各有 proto 副本）。
6. 变更通知主机：经 coordinator RPC `refreshMcp({completion?})`（background 线程）；OAuth secret 经 `setBoxSecrets({secrets})` / `carryBoxSecretsToBot({serverId,names})`（person 线程）推给 box。

### 3.2 manifest 格式样例

(a) **marketplace.json**（daemon zod schema 重建，≤10MiB）：

```json
{
  "name": "my-marketplace",              // kebab-case；缺省回退 cursor-marketplace-<uuid>
  "owner": {"name": "Alice", "email": "a@b.c"},
  "description": "…",
  "metadata": {"description": "…", "version": "1", "pluginRoot": "./plugins"},
  "plugins": [
    {
      "name": "figma-mcp",               // 必填，kebab-case
      "displayName": "Figma", "description": "…", "version": "1.0.0",
      "author": {"name": "Alice"},
      "source": {"source": "github", "repo": "owner/repo", "ref": "main", "sha": "<40hex>"},
      "capabilities": ["canvas"], "category": "design", "tags": ["figma"],
      "minClientVersions": {"cursor": "1.2.3", "sand": "0.78.0", "sandMobile": "never"},
      "strict": true,
      "commands": ["cmd1"], "agents": [], "skills": ["skills/figma"],
      "rules": [], "hooks": {"event": "…"},
      "variables": {"type": "object", "properties": {"API_KEY": {"type": "string", "writeOnly": true}}, "required": ["API_KEY"]},
      "mcpServers": [{"figma": {"type": "http", "url": "https://…", "http_headers": {"a": "b"}, "placement": "server"}}]
    }
  ]
}
```

(b) **mcpServers 条目**（main-app.cjs 与 daemon 两处 schema 一致；JSON 键为 snake_case，容器键 `mcpServers`）：

```json
{ "mcpServers": {
    "my-stdio": {"type": "stdio", "command": "npx", "args": ["-y", "some-mcp"],
                  "env": {"K": "V"}, "env_file": ".env", "cwd": ".",
                  "enabled_tools": ["t1"], "startup_timeout_sec": 30, "enabled": true},
    "my-http":  {"type": "http", "url": "https://mcp.example.com/mcp",
                  "http_headers": {"X": "Y"},
                  "auth": {"client_id": "…", "client_secret": "…", "scopes": ["read"]},
                  "tls": {"ca_bundle": "-----BEGIN…"},
                  "placement": "server",        // "server"(主机侧拨号) | "client"(客户端侧)
                  "enabled_tools": []}
} }
```

(c) **物化后插件目录清单**（daemon，`schemaVersion` 起）：`{schemaVersion:int, displayName, description, authorName, skills[{path,name,description,argumentHint,content}], rules[], agents[], commands[], mcpConfig{mcpServers, mcpServerSourcePaths{name:path}}, hooks{config,sourcePath}, capabilities[], variablesSchema}`；skills 扫描目录族：`.cursor/skills-cursor`(builtin)、`.cursor/skills`、`.claude/skills`、`.codex/skills`、`.grok/skills`、`.agents/…`（第三方=其他 agent 工具目录直接复用）。

(d) 兼容导入：daemon 读 Claude Code `~/.claude.json` + `~/.claude/plugins/installed_plugins.json`（`local-exec-daemon/main.cjs#"installed_plugins.json"`=1）、Codex `~/.codex/config.toml` 的 mcpServers/projects/skills/commands——第三方工具已有 MCP 配置可被发现导入。

### 3.3 OAuth 连接器授权（形状）

- **回调受体**：loopback `http://localhost:8787/callback`（IPv4 变体 127.0.0.1；端口族 8787/18787/28787/31787，URL 内以 `.t<port>` 标记消歧）；自定义 scheme `grokbot://mcp/oauth/callback`；托管回调 `https://grok.com/connectors-oauth-exchange-code/`、`https://x.com|i/connectors/oauth_callback`（x.com / chat.x.com / lite.x.com 三域）；Cursor 血缘残留：`cursor://anysphere.cursor-mcp/oauth/return`、`https://www.cursor.com/agents/mcp/oauth/callback`、`https://cursor.com/oauth/mcp-client.json`（客户端描述 well-known）。状态码超时 900s。
- **静态客户端注册表**（host→配置，main-app.cjs aCe Map）：gmail/drive/calendar/docs/sheets/slides/bigquery.googleapis.com（google-workspace，静态，unauthenticatedConnect）、api.x.com、mcp.money[-staging|-dev].x.com（x-money，backendOnlyTokenExchange）、connectors-gateway.grok.com + connectors-gateway.grok.gcp.mouseion.dev（grok-connectors，scopes `grok-plugins:access offline_access`）、mcp.hubspot.com、mcp.box.com、mcp.asana.com（configuredSecretStaysOnBackend）、mcp.quickbooks.intuit.com（requiresHostedCallback）、setup.shopify.com、mcp.shop.com、**mcp.cloudflare.com（clientRegistration:"dynamic"——唯一动态注册）**。每项开关：rejectsCustomSchemeRedirects / unauthenticatedConnect / backendOnlyTokenExchange / pinsScopesOverConfiguredScopes / authorizationParams / entra 管理员同意（`cursor-entra-admin-consent`，AADSTS 错误串处理）。
- **完成**：回调 code+state → 主进程 → coordinator `completeMcpOAuth({code,state})`（coordinator-main RPC，person 线程）/ DashboardService `CompleteMcpOAuth`；多数 provider 后端换 token（client_secret 不落客户端）。token 状态经 `DeleteMcpOAuthToken/ValidateMcpOAuthTokens/RenameMcpOAuthAccount/DeleteMcpOAuthAccount` 管理。
- 授权 UI：主进程 loopback HTML 应答（"Authorization received. Go back to the app…"、adminConsentUrl 链接）；诊断事件 `auth-watch-poll`。

## 4. Q3 MCP 进程拉起（仅客户端证据）

### 4.1 负证据（客户端 bundle 无 stdio spawn）

`StdioClientTransport`、`@modelcontextprotocol`、`mcp-core`（包名）在 main.cjs / main-app.cjs / main-core.cjs / proto.cjs / daemon main+messages-worker / coordinator 全部 **0 命中**（`grep -cF` 实测；daemon 的 2 处 "Stdio" 为 proto 消息名 GrokBotAgentCustomMcpStdio）。coordinator 仅有的 spawn 是 WebAuthn 安全密钥签名子进程（binaryPath，stdio 管道，与 MCP 无关）；daemon 的 child_process 属 local-exec 本职与 local-cua 协议（control/release、tools/call 走自有 socket RPC，非 MCP）。

### 4.2 正证据：主进程显式声明「不在我这跑」

- `electron-main/main-app.cjs#"MCP tools run on Grok Bot"`=1：desktop 端 boxMcpExec.executeTool 恒返回错误 `"MCP tools run on Grok Bot's computer, not the desktop app (tool …)"`；
- `electron-main/main-app.cjs#"MCP resources are read on Grok Bot"`=1：readResource 同样返回错误；
- `listTools` 仅经 `listBoxMcpServers(serverIdentifiers)` 列 box 侧 server（不含 tools 明细）。
- main-app 内嵌 MCP 协议 zod schema（tools/list、tools/call、resources/read、notifications/initialized、ping…）与 server 配置 schema——是配置解析/展示用协议库，无 Transport/spawn 实现（该区段 spawn/child_process/Transport 0 命中）。

### 4.3 客户端边界处的转交（RPC 方法名）

主进程 → coordinator（service `coordinator-main`，`node-agent-coordinator/main.cjs#"coordinator-main"`=1；fork 锚点 `main-app.cjs#"sand-node-agent-coordinator"`=1）：

| 方法（coordinator 定义 `I().args` 形态） | 语义（客户端侧可证） | 线程 |
|---|---|---|
| `refreshMcp({completion?})` | 通知主机 MCP 配置已变（配置本体在账号侧，由后端读） | background |
| `setBoxSecrets({secrets})` | 推 OAuth secret 进 box | background |
| `carryBoxSecretsToBot({serverId,names})` | 把某 server 的 secret 交给 bot | person |
| `completeMcpOAuth({code,state})` | OAuth 回调结果转交 | person |
| `listBoxMcpServers({serverIdentifiers})` | 列 box 内 MCP server | background |
| `readMcpAppResource` / `callMcpAppTool` | MCP App（托管连接器）读写 | person |

工具调用/审批往返只追到这里（客户端边界）：审批 UI（tool permission）经 `GetGrokBotMcpToolPermissions/SetGrokBotMcpToolPermissions`（账号级）+ host 工具名 `AddMcpServer/AuthenticateMcpServer/RestartMcpServers`（daemon 工具名字典中），box 内执行细节不可见。

box 侧路径证据（main-app.cjs，客户端管理 box 时可见的字面常量）：`/tmp/sand-supervisor`（command.json/status.json/acks/desktop-health.json）、`/tmp/sand-supervisor/incoming-host-bundle.tgz`、`/opt/sand/sand-host/host-main.cjs`、`/home/box/sand-data`、`/opt/sand/onepassword…`。即 host bundle 由 supervisor 机制送进 box 后于 `/opt/sand/sand-host` 运行——与 W05「host 云端下发」结论互证。**stdio MCP server 由 box 内 host 拉起**这一步在客户端无正证据，只能标「推定」（0.18 地图 `source/host/extensions/mcp/` 有此设计，但 0.18 该目录亦无 spawn 锚点，推定强度弱）：**运行归属未知（倾向 box 内 host，待 host bundle 实证）**。

## 5. 锚点计数表（grep -cF，root=/dev/shm/grok-re/0.78.1/app/dist）

见 §0 与正文内联；汇总关键项：

```
electron-main/main-app.cjs#"listMarketplacePlugins"                      1
electron-main/main-app.cjs#"listMarketplaces"                            1
electron-main/main-app.cjs#"authMode:"best-effort""                      1
electron-main/main-app.cjs#"x-ghost-mode"                                4
electron-main/main-app.cjs#"MCP tools run on Grok Bot"                   1
electron-main/main-app.cjs#"MCP resources are read on Grok Bot"          1
electron-main/main-app.cjs#"sand-node-agent-coordinator"                 1
electron-main/main-app.cjs#"/tmp/sand-supervisor"                        1
electron-main/main-app.cjs#"incoming-host-bundle.tgz"                    1
electron-main/main-app.cjs#"/opt/sand"                                   1
electron-main/main-app.cjs#"/home/box/sand-data"                         1
electron-main/main-app.cjs#"http://localhost:8787/callback"              1
electron-main/main-app.cjs#"grokbot://mcp/oauth/callback"                1
electron-main/main-app.cjs#"grok.com/connectors-oauth-exchange-code/"    1
electron-main/main-app.cjs#"mcp.cloudflare.com"                          2
electron-main/main-app.cjs#"gmailmcp.googleapis.com"                     4
electron-main/main-app.cjs#"connectors-gateway.grok.com"                 2
electron-main/main-app.cjs#"grok-bot/link/v1/"                           2
electron-main/main-app.cjs#"installUserPlugin(new A.InstallUserPluginRequest" 1
electron-main/main-app.cjs#"setMcpConfig(new A.SetMcpConfigRequest"      1
electron-main/main-app.cjs#"getMcpConfig(new A.GetMcpConfigRequest"      1
electron-main/main-core.cjs#"https://api2.cursor.sh"                     2
electron-main/main-core.cjs#"SAND_BACKEND_URL"                           3
electron-main/proto.cjs#"ListMarketplacePlugins"                         1
local-exec-daemon/main.cjs#".cursor-plugin/marketplace.json"             1
local-exec-daemon/main.cjs#".claude-plugin/marketplace.json"             1
local-exec-daemon/main.cjs#"https://github.com/${s.repo}.git"            1
local-exec-daemon/main.cjs#"marketplace_cache_manager.ensure_cloned.cache_miss" 1
local-exec-daemon/main.cjs#"installed_plugins.json"                      1
node-agent-coordinator/main.cjs#"coordinator-main"                       1
node-agent-coordinator/main.cjs#"setBoxSecrets:I().args"                 1
node-agent-coordinator/main.cjs#"completeMcpOAuth:I().args({code:y(),state:y()})" 1
（StdioClientTransport 全 bundle 0 命中，见 §4.1）
```

## 6. 与 0.18 对照

| 维度 | 0.18（地图，重建仓） | 0.78.1（本报告实测） | 判定 |
|---|---|---|---|
| 目录拉取 | `desktop-mcp-manager.ts`→`account-mcp.ts` fetchCatalog（DashboardService + getAccessToken） | 同构：marketplaceBackendClientOptions + listMarketplaces/listMarketplacePlugins，且显式 best-effort/匿名降级 | 演进保留（0.78.1 明确了免登录浏览路径） |
| MCP 工具执行 | boxMcpExec.executeTool 返回 "MCP tools run on Grok Bot's computer…" | 同文案仍在（=1），另增 resources 同款 | 保留 |
| 配置存储 | accountMcpWriter（账号侧） | GetMcpConfig/SetMcpConfig configJson，账号侧 | 保留 |
| OAuth | mcp-oauth-loopback-provider.ts + CompleteMcpOAuth | loopback 8787 + 静态注册表（grok/x/hubspot/box/asana/quickbooks/shopify/cloudflare/google）+ grok.com 托管换码 | 扩张（新增 x.com/grok.com 域、entra 管理员同意、cloudflare 动态注册） |
| host 本地 bundle | dist/host 实物在 asar | 无 dist/host；box 路径常量 + incoming-host-bundle.tgz | 证实 W05「改」 |
| 自定义 git 市场 | 地图中无此目录证据（0.18 DashboardService 有 MigrateTeamMcpServersToDefaultMarketplace 等，已删） | daemon 内完整 marketplace.json/git 克隆库 | 0.78.1 新增面（随 GrokBotService 市场 Internal 方法群扩张） |
| proto 面 | DashboardService 604 方法 | 84 方法，市场/MCP 保留 21 | 证实 W05 |

## 7. 局限与未验证项

1. **未运行、未联网**：匿名目录请求是否被服务端接受、安装全链路是否如静态推断、box 内 host 是否拉起 stdio server，均未验证。「运行归属未知」处已明标。
2. minified bundle 内变量名不可读，函数边界靠上下文窗口判断；`SandMcpCatalogFlow`/`MarketplaceCacheManager` 等名字来自 bundle 内错误文案与日志指标（自证可信），其余归组是推断。
3. MarketplaceCacheManager 在 daemon bundle 无调用点：库随包分发但消费者不明（候选：box 内 host bundle 同源库 / daemon 动态入口，静态不可分）。cacheRoot 具体绝对路径未定位（构造参数注入，未见字面值）。
4. renderer 只深读了 marketplace-browse-model 一个 chunk；plugin-detail-view/custom-mcp-form 等未逐块展开（对 Q1–Q3 无增量必需）。
5. `GetManagedSkills` 仅在 proto.cjs 定义，main-app 无调用（消费方可能在 host/云端，未验证）。
6. 0.18 对照物是重建仓（reconstructed），其还原度本身有 W05 已记录的偏差；「host 拉 MCP」在两版都无直接 spawn 证据，只能弱推定。
7. 平台差：本树为 linux-amd64 deb；macOS/win 侧行为未验证（OAuth loopback 端口、路径常量或不同）。
