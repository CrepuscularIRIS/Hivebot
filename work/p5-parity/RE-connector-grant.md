# RE · R-02 · 0.78.1 connector-grant 卡 + MCP 工具权限面

任务：RE-COVERAGE §4.4 R-02（→ P5-23 / P5-24 / P5-32）。目标 `/dev/shm/grok-re/0.78.1/`。
方法：纯静态（bundle + proto + coordinator/daemon cjs），i18n 从 eager-app 内嵌 en 表提取（沿用 /tmp/re-r1 工具）。

## 0. 结论速览

1. **原版连接器授权有两层，语义不同**，p5 的「连接器写=ASK 可始终允许」对应的是第二层：
   - **connector-grant 卡**（S28，消息流内）＝「授权 bot 使用**我的连接器账号**」——"This uses your {server} account only for your own messages. Others can't use it."。作答 `allowed / skipped / always_this_bot / always_all_team_bots`，**无工具维度**，持久化在云端（账号级），本地一键清除。
   - **toolPermissions**（连接器详情页 + settings.json）＝「工具执行档位」四值 `auto_review / always_allow / needs_approval / blocked`，粒度 server×(reads|writes)组 + 单工具覆盖，**无 bot 维度**，云权威（Get|SetGrokBotMcpToolPermissions RPC）+ 本地 settings.json 缓存（云同步字段）。
2. **needs_approval 档没有本地审批卡**：本地审批卡族只有 local-tool-permission（bash/文件/Messages，R1 已逆）与 connector-grant（账号授权）；连接器工具执行的逐次判定（auto_review 放行/needs_approval 出卡）在云端，客户端 bundle 不含该卡组件。
3. **默认档是 auto_review 不是 needs_approval**（UK 判定函数 fallback `"auto_review"`）；auto-review 关闭时详情页把 auto_review 组档**自动升为 always_allow**（xr 函数）——即原版关 auto-review 后默认全放行。
4. `ClearGrokBotConnectorAlwaysAllow` 是**云 RPC 一键清空**（无参数，返回 cleared_count），UI 入口在**设置 → General pane → Team Bots 节**（destructive 确认对话框），不是 bot 运行时工具、不在连接器详情页。
5. 团队策略 `connectorWritesNeedApproval`（TeamMemberPolicy 云字段）强制 writes 组出卡：UI 隐藏 always-allow 选项（holdsAlwaysAllow）并把 always_allow 强制降 needs_approval（Cr 函数）；`connectorWriteTrustedUrls` 白名单豁免 cursor-served URL。

## ① connector-grant 卡全貌（chunk-view-EpEVD5Q5.js，9.5K 全文已读）

### 1.1 卡参数与作答集

组件 `fe`（export `y` 为 view），props `{entryId, ask, agentId, groupChat?}`；`ask` 字段（云端 transcript 事件直接下发，本地无 codec）：`{serverName, requestId, status: pending|allowed|skipped|interrupted|expired…, remembered?: this_bot|all_team_bots, interruptedBy?:{name}, interrupted?, waitingOn?}`。

作答集（renderer 枚举 `OKe=["allowed","skipped","always_this_bot","always_all_team_bots"]`，main-app:1363339；proto 枚举 `GrokBotConnectorGrantResolution=[UNSPECIFIED,ALLOWED,SKIPPED,ALWAYS_THIS_BOT,ALWAYS_ALL_TEAM_BOTS,ALLOW_IN_CHANNEL]` 多一个 `ALLOW_IN_CHANNEL`，renderer 未暴露）：

| 作答 | 按钮 | 文案 id → 英文 |
|---|---|---|
| `always_this_bot`（默认选中） | **Always allow**（split button primary，点即提交当前选项） | NoKBgy "Always allow"；下拉项 ueQqG1 "Always allow for your messages to this Bot" |
| `always_all_team_bots` | 同上下拉第二项（radio） | 4YBx5X "Always allow for your messages to every Team Bot" |
| `allowed` | Allow once | pFfO26 |
| `skipped` | Skip（trailing） | 6Uau97 |

- 卡标题 `uzODrR` "Allow {serverName}?"；描述 `KSpl+f` "This uses your {serverName} account only for your own messages. Others can't use it. Always allow keeps that for later messages; Allow once covers this reply."；图标 `plug`，surface `elevated`；提交失败 note 复用 `sSMHtl`（同 R1 §4.1）。
- 结果态：allowed `aHsc5f` "Allowed {server} for this reply only. Others can't use it."；remembered=this_bot `ExgTPW` "…for their own messages to this Bot…"；all_team_bots `EB91V4`；skipped `ZDcAvU` "Skipped {server} for this turn"；interrupted `iiL695`/`xOEYeg`；expired `w0CbH9`。
- 群聊（groupChat.waitingOn ≠ ∅ 时本机禁答）：`wiJDLs` "Only {waitingOn} can answer this"（tooltip）/ `DnmsLb` "This uses {waitingOn}'s {server} account, never yours" / `wShbj+` "Waiting on {waitingOn}"。同 roomLine 的多张卡有去重合并逻辑（`Tpn`：优先取已 answered 的那张，eager-app:3135496 一带）。

### 1.2 RPC 链

renderer approvals 域 `resolveConnectorGrant{entryId, requestId, resolution, agentId, sessionId?}`（"person" 级，main-app:2336912）→ main `resolveGrokBotConnectorGrant` → 云 `ResolveGrokBotConnectorGrant{agent_id, request_id, resolution, session_id?, entry_id?}`（proto:1182225）→ `{dispatched, workflow_id?, refusal?}`。refused 时 gateway 降级映射 `mWn.resolveConnectorGrant`（main-app:2808084）。

## ② 连接器安装/首用的授权流（mcp-auth 之外的本地授权面）

三层各管一件事，全部互相独立：

| 层 | 管什么 | 入口 | 存储 |
|---|---|---|---|
| **mcp-auth（OAuth）** | 连接器账号**登录** | bot 工具 `AddMcpServer / AuthenticateMcpServer`（运行时工具枚举 main-core `ae`）；renderer mcp 域 `addMcpServer / authenticateMcpServer`（loopback） | 凭证（mcp-auth，R-RE-marketplace 已有） |
| **connector-grant** | bot 能否用**我的账号**发消息类动作 | 云端在 transcript 插 `connector-grant` 事件（ask 云端生成，判定时机本地不可见） | 云端账号级 |
| **toolPermissions** | 连接器**工具执行**要不要审批 | 连接器详情页权限节；安装（`InstallPlugin` 工具 / `installEntry` IPC）时不弹任何授权——新 server 无条目即默认 auto_review | 云权威 + settings.json 缓存（§③） |

首用即问的「卡」是 connector-grant（账号层）；工具层的默认是 auto_review（云端 LLM 复核，allow 规则可自动放行，R1 §③），不是逐次出卡。

## ③ 持久化与 settings.json 结构联动

### 3.1 settings.json `toolPermissions`（main-core:624008 schema、617373 `DK`、617672 `wK`、642869 get/set）

```json
{ "toolPermissions": { "scopes": {
  "mcp:<serverId>": {
    "tools":  { "<toolName>": "always_allow" | "needs_approval" | "blocked" },
    "reads":  "<三值之一>",
    "writes": "<三值之一>"
  } } } }
```

- scopes 键带 `mcp:` 前缀（`Oh(t)`，main-core:618159 一带）；空 policy 的 server 条目在 set 时被删除（`MK`）；server 卸载清理时整组重置 `reads/writes/tools=auto_review`（main-app:3127330 `le`）。
- 序列化值域 3 值（`NFt=["always_allow","needs_approval","blocked"]`，未知值→needs_approval；scope 非对象→`{reads:"needs_approval",writes:"needs_approval"}`，daemon 镜像 main.cjs:2058000 一带）。UI patch 可写 `auto_review` 字符串表达「回落组档/重置」（`$e`，plugin-detail:4260）。
- 属云端同步 UserSettings 字段（`qp` 列表，main-core:621010；daemon 侧同一 schema，daemon main.cjs:2063390）。

### 3.2 有效档位判定（main-core:618524 `UK`/`FK`，每工具每次调用）

```
disabled 或 renamedToolDenial=blocked            → blocked
policy.tools[toolName]                           → 该值（auto_review 也可能显式在）
  否则 replacedToolPermission → 否则 (isReadOnly ? reads : writes) → 否则 "auto_review"
renamedToolDenial=needs_approval 且结果≠blocked   → needs_approval
```

**auto_review 是第四个运行档**（UI 四选项 `vr={auto_review,always_allow,needs_approval,blocked}`，plugin-detail:44800），不在 proto 枚举里（`GrokBotToolPermission=[UNSPECIFIED,ALWAYS_ALLOW,NEEDS_APPROVAL,BLOCKED]`，proto wa）。

### 3.3 云权威写入流（main-app:3125400–3131600）

renderer mcp 域 `setMcpToolPermissions{serverId, tools, reads?, writes?}` → main `Se`：云 RPC `SetGrokBotMcpToolPermissions`（proto:1021594）成功且本地代际仍最新 → 回写本地 settings.json（`te`）+ `syncHostSettings`；失败/过期 → 标脏，等 adopt。`adoptServerMcpToolPermissions`（noArgs）＝从云拉全量（Get RPC）覆盖写本地 settings（`Ee`，main-app:3131216）。proto 侧另有 `GrokBotUserRuntimeSettings|14 tool_permissions`（daemon:3328054）只读回带，Update 请求不带它。

### 3.4 详情页 UI（chunk-plugin-detail-view-BgPF1Rqs.js，R1 §4.4 补全）

- 权限节两组：`reads`（bxj38a "Reads"）/ `writes`（0uua0a "Writes"），按工具 `isReadOnly` 分组；组级选择器（`Er`）+ 展开后单工具选择器（`wr`，`A8qJ3K` "Permission for {toolLabel}"）；组内不一致显示 `8Tg/JR` "Custom" 并展开。
- 组档 patch `$e`：`{serverId, tools:{全部工具: blocked|auto_review}, [group]: blocked?'auto_review':permission}`；单工具 patch：`{serverId, tools:{[name]: v}}`。
- **auto-review 开关联动**（`xr`）：locked（autoReviewTeamEnforced）→ always_allow 全降 auto_review；free 且 autoReview off → auto_review 组档全升 always_allow。
- **团队 connectorWritesNeedApproval**（`Sr`/`Cr` + footer `HrUSV3` "Required by your admin. You can't turn this off."）：隐藏 always-allow 选项（`holdsAlwaysAllow`）、把 always_allow 强制降 needs_approval；豁免 = `servedBy==='cursor'` 且 URL 在 TeamMemberPolicy `connectorWriteTrustedUrls` 白名单（eager-app:4290809，j1n 校验、M1n 默认表）。
- 其余 footer 文案沿用 R1 §4.4：locked `sag80m`、free+on `RmzpYm`、free+off `xGRmq1`。

### 3.5 ClearGrokBotConnectorAlwaysAllow 的 UI 入口

- 云 RPC（服务注册 proto:1381930；`ClearGrokBotConnectorAlwaysAllowRequest` **无字段**，`Response{cleared_count}`）。
- 链路：设置 **General pane**（chunk-general-pane-YXy_8X5a.js `yi` 组件，anchor `team-bot-connectors`，gate = `grok_bot_multiplayer` flag + hasTeam）→ 按钮 `xCJdfg` "Clear"（描述 `FTN9h/` "Remove any preferences you have set with Team Bots which give them access to your personal connectors"）→ destructive 确认（`dei+5f` "Clear connector preferences?" / `7O7nXp` "Team Bots you allowed to use your personal connectors will ask again the next time they need one" / `ubqkP9` "Clearing…"）→ main-app `clearGrokBotConnectorPreferences`（main-app:1278912，需已登录）→ 清空后按钮变 `FWxdTT` "Cleared"。
- **无逐条列表、无逐条撤销**：原版对 connector-grant always 只有这一键全清；工具档位的调整在详情页（§3.4）。

## ④ 与 p5「连接器写=ASK 可始终允许（bot×工具）」对照

p5 基线：BRIEF.md:53（连接器读 ALWAYS / 写 ASK，仅连接器写卡提供「始终允许」，按 bot×工具记，bot 设置页列出+撤销）；P5-24 schema `{version:1, grants:[{botId, serverName, rawName}]}`。

| 维度 | 原版 connector-grant always | 原版 toolPermissions always_allow | p5 方案（P5-24/31/32） |
|---|---|---|---|
| 授权对象 | 我的连接器**账号**（"for your own messages"） | 工具**执行**（跳过审批/auto-review） | 工具写执行（近似 toolPermissions 层） |
| 粒度 | user × bot（或 all team bots）× **server** | server × 工具（reads/writes 组 + 单工具），**无 bot 维度** | bot × server × 工具（三键，两边都没有的组合） |
| 作答集 | allowed / skipped / always_this_bot / always_all_team_bots | 无卡，四档下拉（auto_review/always/needs_approval/blocked） | allowed-once / rejected / always（卡上三键，P5-31） |
| 默认 | 无记录 → 出卡（云端判定） | **auto_review**（云端 LLM 复核，可自动放行）；关 auto-review 后默认升 always_allow | 写一律 ASK 出卡（无 auto-review 层） |
| 存储 | 云端账号级 | 云权威 RPC + 本地 settings.json `toolPermissions` 缓存 | 本地 `standing-grants.json`（dataDir） |
| 撤销 UI | General pane 一键全清（无列表） | 详情页改档位（组/单工具） | bot 设置 pane 逐条列出+逐条撤销（比原版细，是增强） |
| 团队约束 | —（卡上无） | connectorWritesNeedApproval 强制 needs_approval + trustedUrls 豁免 | 未规划（可记 v2 项） |
| 作用域语义 | 「我发给这个 bot 的消息」可用我的账号 | 该 server 该工具全局放行（跨 bot） | 该 bot 该工具写放行（跨会话） |

要点：p5 的 always 键（bot×server×tool）在原版两处都不存在——原版要么粗（server 级账号授权）、要么无 bot 维度（工具档）。QUESTIONS-OPEN (b) 备选「所有 bot 共享=原版做法」的注记需修正：原版 toolPermissions 是 server×工具共享（正确），但 connector-grant always 是 per-bot 的；p5 选 per-bot 与原版 connector-grant 方向一致。

## 证据清单

| 结论 | 锚点 |
|---|---|
| 卡组件/作答/文案 | `app/dist/renderer/assets/chunk-view-EpEVD5Q5.js`（9.5K 全文；`fe`/`OKe` 消费处）；en 表 `index.eager-app-iGTgHP_Q.js` 内嵌 |
| resolution 枚举 | proto `_w`（GrokBotConnectorGrantResolution，proto.cjs）；renderer `OKe` main-app:1363339 |
| Resolve RPC | proto:1182225（req）/1182664（resp）；服务注册 proto:1381836；main-app:2819484（case 绑定） |
| toolPermissions schema/判定 | main-core:624008（zod schema）、617373（DK）、618524（UK/FK）、642869（get/set）、618159（LK/MK/`mcp:` 前缀）；daemon 镜像 main.cjs:2058000 |
| Get|Set|proto | proto:1020843/1021594；`GrokBotToolPermission` 枚举 wa；服务注册 proto:1370322/1370412、coordinator:776241/776331 |
| 云权威写流/adopt | main-app:3130215（Se）、3131009（De/Ee adopt）、3137046（surface）；eager-app:4050461（store mcp 域） |
| 详情页 UI | chunk-plugin-detail-view-BgPF1Rqs.js:4200–57000（`Qe/$e/et/tt/xr/Cr/Sr/Er/wr`）；i18n 在 index.eager-common-DbK3Oi_r.js |
| 团队策略字段 | eager-app:4290809（j1n/M1n TeamMemberPolicy 校验与默认）；plugin-detail `Sr/Cr`、footer HrUSV3 |
| Clear 入口 | main-app:1278912（BAn→云 RPC）、3075313（cursorAccount 面）；renderer hook vVe（eager-app:653973，导出名 Jb）；UI chunk-general-pane-YXy_8X5a.js `yi`（Jb as ee） |
| transcript 事件为云端产物 | coordinator/daemon `connectorGrant` 0 命中；renderer 无 remembered/waitingOn 重建点（仅 EpEVD5Q5 消费） |
| needs_approval 无本地卡 | renderer 审批卡族仅 local-tool-permission/connector-grant/auto-review-approval 等（bXt 35 型，eager-app:2618367）；无连接器工具执行卡组件 |
| 工具名枚举（无 Clear 工具） | main-core:276729 `ae` 全枚举已 dump：无 ClearGrokBotConnectorAlwaysAllow（RE-features.md:45 该句需修正） |

## 局限与未验证项

1. **纯静态**：未运行 0.78.1。connector-grant ask 的触发时机（何种 bot 动作会触发云端插卡）、auto_review 逐次判定、needs_approval 云端出卡形态（是否复用 widget/question 通道）都在云端，本地 bundle 无法回答。
2. `auto_review` 字符串可写进 settings.json tools map（`$e`），但读入规范化（DK/YC）只认 3 值——两段的精确交互（保留原值 vs 规范化）未逐字节推演，结论按「序列化以 3 值为准、auto_review 表达回落」表述。
3. `ALLOW_IN_CHANNEL`（proto 第 5 个 resolution）无本地消费点，语义按字面推断为 channel 场景授权，未验证。
4. `yWn`/`jKe`（resolution→proto 映射与 refused 文案）定义为跨模块 minified 名，未追到函数体；枚举映射本身已由 OKe + `_w` 双侧确认。
5. e.serverToolPermissions() 的云端装配（Get RPC 的确切包装）只从调用面推定（read/readToolPermissions/setToolPermissions 三方法），未追到构造点。
