# RE-CONNECTOR-GRANT：0.78.1 连接器作用域与 ConnectorGrant 审批全规格

日期：2026-11-12。方法：同 `RE-CONNECTORS-0.78.1.md`（0.78.1 deb 静态解包，`/dev/shm/pbots-re/gb0781/extracted/dist/`）。回答一个问题：**用户 Connect 一个 app 后，这个 app 对哪些 bot 生效？**

锚点缩写（沿用前几篇）：
- **APP** = `renderer/assets/index.eager-app-iGTgHP_Q.js`、**COMMON** = `index.eager-common-DbK3Oi_r.js`
- **VIEW** = `renderer/assets/chunk-view-kcheXZ65.js`（Connect apps 页）
- **GRANT** = `renderer/assets/chunk-view-EpEVD5Q5.js`（ConnectorGrant 审批卡，9.5KB）
- **GPANE** = `renderer/assets/chunk-general-pane-YXy_8X5a.js`（settings general 区）
- **SADLG** = `renderer/assets/chunk-team-bot-service-accounts-dialog-b4h461Q0.js`（Team Bot service accounts 对话框）
- **TBPDL** = `renderer/assets/chunk-team-bot-plugins-dialog-list-BG7BjvIV.js`（Team Bot plugins 列表）
- **CCC** = `renderer/assets/chunk-connector-card-DcGxh_HK.js`（连接卡组件）
- **MAINE** = `electron-main/main-app.cjs`、**MAINC** = `electron-main/main-core.cjs`、**PROTO** = `electron-main/proto.cjs`
- i18n 反查：APP/COMMON 内 id→文本；中文对照 `chunk-chat-blA0OBsh.js`。

---

## 0. 结论先行

**连接是账号作用域：一次 Connect 对账号内所有 bot 生效，没有「装上等挑选」的中间态；准入控制发生在使用时（ConnectorGrant 审批卡），不在配置时。** 具体分四层：

1. **连接记录（OAuth token）存服务端、账号作用域**。客户端 `getMcpState` 拉的是账号级全量列表（RPC 不带 agentId）；换账号不共享。
2. **per-bot 维度只有三样，全都不是「开关式挑选」**：(a) 服务端按 agent 返回「该 bot 可用的 server 子集」`GetAvailableMcpServers({grokBotAgentId})`，过滤条件是 enabled/团队策略，不是用户勾选；(b) 用时审批 ConnectorGrant（记住粒度 user×bot）；(c) Team Bot 模板的 plugins 集合（管理员配置，成员不参与）。
3. **用户侧唯一的「关闭」开关是账号级**：`setGrokConnectorEnabled({serverId, enabled})`，关掉的连接器显示 disabledByUser，对所有 bot 一致。
4. **插件（installEntry）与连接器（OAuth）在这点上行为不同**：带 connector 的插件全局装；**纯 skill 插件必须在 bot 上下文里装**（装完 `syncPluginSkills(agentId)` 同步给该 bot），全局页面装会报 "Open a Bot to add skills"。

**复刻决策**：应该把我们的「装上后等建 bot 挑选」改成「Connect 后直接可用 + 用时审批卡」——这是原版行为。保留「建 bot 时挑选」形态的只有 Team Bot 模板配置（我们没有这个概念可暂不做）。

---

## 1. 连接作用域：账号级，一次 Connect 全局有效（Q1）

### 1.1 连接记录在服务端、账号作用域

- **`fetchAccountMcpServers`（MAINE mdr @2,129,019）**：`getAvailableMcpServers(new GetAvailableMcpServersRequest({}))` **不带 agent**，返回账号级全量 server 列表；`cacheScope = accountScopeOfToken(accessToken)`——缓存键就是账号。这就是 `getMcpState` 的数据源。
- **server 行字段**（PROTO `McpServerInfo`）：`enabled`、`is_team_server`、`user_has_access_token`、`needs_grant`、`disabled_by_team_admin_policy`、`served_by`、`is_unseen` 等 31 个字段。**没有 per-agent 的用户勾选字段**。
- **本地写也是账号作用域**：`installEntry` → `requireAccountWriter()`（RE-CONNECTORS §4.4 已证）；`setMcpCustomInstructions` 的 owner = `settings.getActiveAccountScope()`（MAINE @3,132,326 附近）。

### 1.2 per-bot 视图：服务端按 agent 过滤，用户不参与

- **`listGrokBotAgentServers(agentId)`（MAINE @2,109,284）** → `fetchGrokBotAgentMcpServers`（gdr @2,130,823）→ **`GetAvailableMcpServersRequest({grokBotAgentId})`**（PROTO：`GetAvailableMcpServersRequest|1 grok_bot_plugin_scope #0?|2 grok_bot_agent_id 9?|3 team_tailnet_rows_per_team 8`）。gdr 里逐条 `if(!s.enabled)continue`——过滤的是 enabled 与服务端策略。
- renderer 的 store（APP @4,040,884 `I=r7({read:t=>e.getGrokBotAgentMcpServers({agentId:t})…})`）按 agentId 懒加载——**bot 侧看到的连接器集合由服务端决定**，UI 无「给某 bot 开/关某连接器」的操作。
- **连接时可以带 bot 上下文**：`authenticateMcpServer` RPC 参数含 `grokBotAgentId?`（APP @579,585 args 定义；store `_e` @4,043,904 → 公开方法 `authenticate(serverId, accountKey, grokBotAgentId, forceReauth, options)` @4,049,660；CCC 聊天卡 `Yt(…, ft??void 0, …)` entryPoint `chat_card` @CCC 9,305——**在某个 bot 的聊天里点 Connect 会带该 bot 的 agentId**，但那只影响服务端记账/归因，不产生 per-bot 挑选状态）。
- MAINE `authenticateServer`（@1,806,006）用 `rowScope={grokBotAgentId}` 调 `resolveDisplayServer`——同一 server 在不同 agent 上下文解析（服务端语义）。

### 1.3 账号级关闭开关

`setGrokConnectorEnabled({serverId, enabled})`（APP @579,700 args；MAINE 实现 @2,117,641）：

```js
async setGrokConnectorEnabled(t,n){let r=await this.resolveListedDisplayServer(t),
  o=r?.servedBy==="grok"?r.serverIdentifier?.trim():"";
  if(r==null||o==null||o.length===0)throw new At("Only a connector served through Grok can be turned off here.");
  await this.requireAccountWriter().setGrokConnectorEnabled({serverIdentifier:o,enabled:n});
  …commitGrokConnectorEnabled…}
```

→ 服务端 `SetGrokConnectorEnabledRequest{server_identifier, enabled}`（PROTO）。关闭后 mdr 把该 server 标 `disabledByUser:!0` 仍显示（MAINE @2,126,000 附近 `!S.enabled&&servedBy===GROK→{…disabledByUser:!0}`）。**粒度是 (账号, server)，对所有 bot 一致**。

---

## 2. ConnectorGrant 审批卡完整行为（Q2）

### 2.1 何时弹

ask entry 是**服务端 transcript 下发**的（renderer GRANT chunk 只渲染+回传，无本地判定逻辑；MAINE 无 grant 产生逻辑，只有转发 @2,819,608 `resolveGrokBotConnectorGrant`）。可静态确证的语义：

- **没有记住的偏好时，bot 每次要用连接器都会发 ask**——"Allow once" 的回显文案是 **"Allowed {0} for this reply only"**（APP aHsc5f）："仅本条回复"，不是"本次会话"。即 allow once 不留任何状态，下次再用再问。
- 有 remembered 偏好（this_bot / all_team_bots）时不再问；清除偏好后恢复再问——GPANE 清除确认文案（APP 7O7nXp）：**"Team Bots you allowed to use your personal connectors will ask again the next time they need one"**。
- 群聊里 ask 等**该条消息的发送者**作答（waitingOn 协同，GRANT 引 chunk-group-chat-connect-waiting）；其他成员看到的是 "This uses {waitingOn}'s {0} account, never yours"（DnmsLb）。

### 2.2 三（四）个选项与状态机

GRANT chunk 全文（9.5KB）逐行读得：

- **选项集**（resolution 值）：`allowed`（Allow once）/ `skipped` / `always_this_bot` / `always_all_team_bots`。proto 枚举（PROTO @912,743）：`GrokBotConnectorGrantResolution|0 UNSPECIFIED|1 ALLOWED|2 SKIPPED|3 ALWAYS_THIS_BOT|4 ALWAYS_ALL_TEAM_BOTS|5 ALLOW_IN_CHANNEL`——**第 6 个值 ALLOW_IN_CHANNEL 在 0.78.1 UI 未使用**（协议预留）。
- **UI 形态**：主按钮是 **split control**——左主按钮文案 **"Always allow"**（NoKBgy），直接提交当前选中的记住级别；右侧 chevron 下拉两个 radio item：**"Always allow for your messages to this Bot"**（ueQqG1）/ **"Always allow for your messages to every Team Bot"**（4YBx5X），aria-label "Choose which Bots to always allow {0}"（E3r31F）。次按钮 **"Allow once"**（pFfO26）→ resolution `allowed`；三按钮 **"Skip"**（6Uau97）→ `skipped`。
- **默认选中 `always_this_bot`**：GRANT @785 `[b,me]=(0,h.useState)(\`always_this_bot\`)`——radio 默认勾 this bot，**主按钮默认提交的就是 always_this_bot**（点主按钮 = "Always allow for this Bot"）。原版引导用户记住，Allow once 是次按钮。
- **语义粒度是 (user, bot)**，不是 (bot,)：记住文案均带 "for **your messages**"；描述行（pending 态）"This uses your {0} account only for your own messages. Others can't use it."（KSpl+f）。群聊中每个成员各自授权各自的账号。
- **回显状态**（ask.status / ask.remembered）：`allowed+remembered=this_bot` → "Allowed {0} for their own messages to this Bot. Others can't use it."（ExgTPW）；`allowed+remembered=all_team_bots` → "…to every Team Bot…"（EB91V4）；`allowed` 无 remembered → "Allowed {0} for this reply only…"（aHsc5f）；`skipped` → "Skipped {0}"（ZDcAvU）；`interrupted` / `interruptedBy` / "ask expired"（iiL695/w0CbH9/xOEYeg）。失败重试 "Your answer didn't go through…"。
- **提交 RPC**：`resolveConnectorGrant({entryId, requestId, resolution, agentId, sessionId?})`（"person" 权限级，MAINE @2,816,000 附近 RPC 面与 resolveLocalToolPermission/resolveMessagesGrants 并列）→ proto `ResolveGrokBotConnectorGrantRequest{agent_id, request_id, resolution, session_id?, entry_id?}`（PROTO @1,182,239），response `{dispatched, workflow_id?, refusal?}`。

### 2.3 持久化与事后修改

- **记住的偏好存服务端**（本地 main 无存储；偏好随账号）。清除 RPC：`clearGrokBotConnectorAlwaysAllow`（空请求）→ `{clearedCount}`（MAINE @1,279,000 附近 `BAn`）。
- **设置入口（GPANE，general 区 Team Bots）**：
  - `team-bot-connector-preferences` 卡（GPANE yi 组件）：**只有一键 "Clear"**（确认标题 "Clear connector preferences?" dei+5f；描述 FTN9h/ "Remove any preferences you have set with Team Bots which give them access to your personal connectors"；后果 7O7nXp）。**没有 per-bot / per-连接器的查看或编辑 UI**。
  - `team-bot-connector-shared-space-allowlist` 卡（GPANE fi 组件 @73,641）："Add connector" 下拉（"Add all connectors" + 逐连接器，"Allow all connectors?" 二次确认 EQ0ynd "Team Bots can then use all your connectors for you in shared channels and group chats without asking, even when someone else asks them to"）；已选可逐个 Remove（kLf4Qs）。注记 **"Bots will never ask for permission to use these plugins, even in shared channels"**（MwhJ02，原文即写 plugins）。数据 RPC：`get/updateGrokBotConnectorSharedSpaceAllowlist({addServerIds, removeServerIds})`（serverIds 粒度，服务端存，proto `UpdateGrokBotConnectorSharedSpaceAllowlistRequest|1 add_server_ids 9*|2 remove_server_ids 9*`）。
  - 两键均登记在 MAINC settings 分类表（@27,642 附近，group=general）。

---

## 3. 「装上但等建 bot 挑选」的中间态：个人 bot 没有（Q3）

- **个人 bot 创建对话框**（0.78.1 实拍 `/home/lingxufeng/bot/work/grok-0.79.3-ref/../ref/create-dialog.dark.json` facts）：文本只有 "Create New Bot / Cancel / Create" + 形状/颜色选择。**没有连接器或工具挑选步骤**。
- **连接器**：Connect 即账号级生效（§1），无任何「对哪些 bot 打开」的用户操作；准入全靠用时 grant 卡。
- **插件**（VIEW Qs 组件安装 handler @148,512（id:`3IrDfA` 处），逻辑逐行）：
  ```
  if (需要填 variableFields) → 打开 install 表单
  else if (插件无 connectors) {            // 纯 skill 插件
    if (agentId == null) → 报错 "Open a Bot to add skills"（3IrDfA）
    else → install + syncPluginSkills(agentId)   // skills 同步进该 bot
  } else → 直接 install（账号级）
  ```
  即 **VIEW（Connect apps 页）持有 agentId prop（@VIEW 140,583 `{agentId:n, catalog, servers,…}`），在某个 bot 会话里打开时是 bot 上下文**；纯 skill 插件必须 bot 上下文装，装完 `Ye.syncPluginSkills(agentId)`（+先 remove 旧 skills）把插件的 skills 同步给该 bot（成功 toast "Added 1 skill from {1}" MunE46）。带 connector 的插件无此限制。
- **Team Bot 是唯一「配置时挑选」形态**：bot-configure-dialog（"Configure {agentName}" / "Configure sections"：Skills / Learnings / Vault / **Service accounts** / Tools / Analytics）与 SADLG/TBPDL（"Add plugins for everyone using this Bot. The setup is shared, but teammates must connect their own plugin accounts."；两种模式标签 **"Connect once and every member can use"** vs **"Members connect their own accounts"**；不可用原因枚举 `admin_disabled/warning_outdated/has_service_account/not_single_server/not_hosted_oauth/static_credential/no_server_url/no_login/plugin_not_allowed`）。Team Bot 还可配独立 service account（SADLG 里 `authenticate(…, {entryPoint:'other', shareWithBot:{agentId, pluginId, acknowledgedWarningVersion:1}})` @43,436，以及 "Share my account"/"Use your own account"）。

**结论：原版个人 bot 无「装上等挑选」中间态；等价物只有 Team Bot 模板配置与纯 skill 插件的 bot 上下文安装。我们的 dsh「等建 bot 挑选」机制在原版没有对应物，是纯差异。**

---

## 4. 插件（installEntry）vs 连接器（OAuth）行为差异（Q4）

| 维度 | 插件（installEntry 可安装类） | 连接器（OAuth / grok-served） |
|---|---|---|
| 安装/连接记录 | 本地安装记录 + `requireAccountWriter()`（账号作用域）+ 服务端同步 | OAuth token 存服务端（账号作用域），本地只有 catalog 缓存 |
| 装上后对 bot 生效 | 账号级；**纯 skill 插件需 bot 上下文装并 `syncPluginSkills(agentId)`**；Team Bot 由模板 plugins 集合限定 | 账号级，全部 bot 可用（服务端 `GetAvailableMcpServers({grokBotAgentId})` 按 enabled/策略过滤） |
| 用时审批 | **不走 ConnectorGrant 卡**；Team Bot 共享频道免批由 shared-space allowlist 管（文案用 "plugins" 一词） | **走 ConnectorGrant 卡**（默认每次问；可记 this bot / all team bots） |
| per-bot 用户操作 | 无（除 bot 上下文装 skill 插件） | 无；账号级 `setGrokConnectorEnabled` 总开关 + disabledByUser 显示 |
| 特殊通道 | 表单 variableFields / secret 掩码 | 聊天卡连接带 `grokBotAgentId`；Team Bot service account 带 `shareWithBot{agentId, pluginId, acknowledgedWarningVersion}`（**shareWithBot 全产物只出现在 SADLG**，普通个人流程不带） |

---

## 5. 复刻决策建议

**采纳：改成「Connect 后直接可用 + 用时审批卡」，对齐原版。**

1. **去掉「装上等建 bot 挑选」**：原版 Connect/安装即账号级生效，创建 bot 对话框（名字+形状）不涉及工具。保留挑选机制等于发明原版没有的步骤。
2. **审批卡按原版规格做**（这是安全门，值回票价）：
   - 触发：bot 要用用户连接器且无记住偏好时发 ask（我们即 server 侧 per-agent 判定：无 grant 记录即弹）。
   - UI：主按钮 split control "Always allow"（默认提交 this bot）+ 下拉两 radio + 次按钮 "Allow once"（仅本条回复）+ "Skip"。**默认选中 always_this_bot**。
   - 记住粒度：(user, bot) 与 (user, all team bots)；服务端存；设置里给一键 Clear（"…will ask again…"）即可，不必做逐条管理 UI。
   - 描述行带账号归属："This uses your {Gmail} account only for your own messages."
3. **保留一个真差异豁免**：若我们的 dsh「挑选」承担的是 per-bot skills 注入（纯 skill 插件），那在原版有对应物——bot 上下文安装 + syncPluginSkills；把它实现成「装时选 bot / 从 bot 里装」而不是「装上后挂着等」。
4. 后置：ALLOW_IN_CHANNEL（协议预留未启用）、shared-space allowlist、Team Bot 模板 plugins、service account（shareWithBot）。

---

## 6. 证据索引（关键偏移）

| 事实 | 文件@偏移 |
|---|---|
| grant 默认 `useState('always_this_bot')`，split control 提交 | GRANT @1,196（`[b,me]=(0,h.useState)(\`always_this_bot\`)`）、主按钮 NoKBgy "Always allow" |
| 三个动作 + 提交 resolveConnectorGrant | GRANT 组件 fe（`ie({entryId, requestId, resolution, agentId, sessionId?})`） |
| 分辨率枚举（含未用 ALLOW_IN_CHANNEL=5） | PROTO @912,743 |
| resolve 转发 + proto 请求 | MAINE @2,819,608（resolveGrokBotConnectorGrant）、@2,808,678（yWn 枚举映射）、PROTO @1,182,239 |
| 回显文案全集 | APP：ExgTPW/EB91V4/aHsc5f/ZDcAvU/KSpl+f/DnmsLb/w0CbH9/iiL695/xOEYeg；中文对照 chunk-chat-blA0OBsh.js |
| 账号级 server 列表（不带 agent） | MAINE mdr @2,129,019（fetchAccountMcpServers） |
| per-agent server 列表 | MAINE @2,109,284（listGrokBotAgentServers）→ gdr @2,130,823（GetAvailableMcpServers{grokBotAgentId}）；PROTO GetAvailableMcpServersRequest |
| authenticateMcpServer 带 grokBotAgentId / shareWithBot | APP @579,585（args）、@4,038,484（yJn）、@4,043,904（_e）/@4,049,660（authenticate）；CCC @9,305（chat_card 带 ft=agentId）；MAINE @1,806,006（authenticateServer rowScope） |
| shareWithBot 仅 Team Bot service accounts | SADLG @43,436（唯一 UI 调用点） |
| setGrokConnectorEnabled（账号级开关） | MAINE @2,117,641（impl，报错文案 "Only a connector served through Grok…"）、@2,133,383 后段 proto client；APP @579,700 |
| disabledByUser 显示 | MAINE mdr 内 `!S.enabled&&servedBy===GROK→{…disabledByUser:!0}` |
| 偏好清除 RPC / allowlist RPC | MAINE BAn @1,279,220（clearGrokBotConnectorAlwaysAllow→{clearedCount}）及同模块 get/update…SharedSpaceAllowlist（@1,278,900 附近）；PROTO Update…AllowlistRequest |
| settings 两卡（Clear-only + allowlist） | GPANE yi（team-bot-connector-preferences，Clear）、fi @73,641（allowlist，Add connector/Add all/Remove）；MAINC @27,642 键分类表 |
| 纯 skill 插件必须 bot 上下文装 | VIEW Qs @148,512（connectors===0 && agentId==null → 3IrDfA "Open a Bot to add skills"）；syncPluginSkills(agentId)（VIEW @143,779） |
| VIEW 持 agentId prop | VIEW @140,583（`{agentId:n, catalog,…}`）、@182,467（Bc modal props） |
| 个人 bot 创建无工具步骤 | 实拍 `work/grok-0.79.3-re/ref/create-dialog.dark.json`（facts.text 仅 "Create New Bot\nCancel\nCreate"） |
| Team Bot 配置挑选 | bot-configure-dialog（"Configure sections"/"Service accounts"）、TBPDL（"Connect once and every member can use"/"Members connect their own accounts"）、SADLG（shareWithBot、不可用原因 9 枚举 dn 数组） |

## 7. 局限与未验证项

1. **ask 的产生条件在服务端**，产物内无判定代码；「无偏好时每次用都弹」由 UI 文案（"for this reply only"、"will ask again the next time they need one"）反推，未运行动态验证。同理 always_all_team_bots 是否只覆盖 Team Bot（不含个人 bot）也只能从文案（"every Team Bot"）推断——个人 bot 的记住选项就是 this_bot，没有「all personal bots」形态。
2. `GetAvailableMcpServers({grokBotAgentId})` 的服务端过滤全集（Team Bot 模板、is_unseen、needs_grant 的具体语义）未验证；静态只能看到 enabled 过滤与字段名。
3. ALLOW_IN_CHANNEL=5 与 `grok_bot_plugin_scope`（{agent_id, session_kind} 消息体）是协议预留，0.78.1 客户端无使用点。
4. ConnectorGrant 的 transcript entry 精确 kind（send-message 内嵌 or 独立 notice）与 RE-CONNECTORS 局限 4 相同，未逐字段确认。
5. shared-space allowlist 卡文案用 "these plugins" 而 RPC/键名是 connector/serverIds——原版文案与数据名的措辞差异照实记录，语义按 serverIds（连接器）理解。
