# RE：Connect apps 预设与入口（0.78.1）

> 来源：reverse-engineer agent（REA）2026-11-11 查证。
> 锚点：**APP**=`renderer/assets/index.eager-app-iGTgHP_Q.js` · **VIEW**=`chunk-view-kcheXZ65.js` · **MAINA**=`electron-main/main-app.cjs` · **PROTO**=`electron-main/proto.cjs`。
> 关联既有：RE-CONNECTORS-0.78.1、RE-market-detail（不重复，只补增量）。

## 0. 结论先行

1. **没有内置预置 app 清单**：Connect apps 页的条目 100% 来自服务端目录（`getMcpCatalog` RPC → 后端 marketplace 拉取，内存缓存带 TTL，MAINA@1875039 `GY.getCatalog`）；静态包里不存在 catalog JSON/常量。静态可见的只有五件套：**47 个品牌图标注册表**、11 个分类键、Mac 本地 7 连接器、27 种聊天引用类型、6 条域名→图标映射。
2. **nav 的 integrations 区不是 Connect apps**：设置导航 `integrations`（flag `grok_bot_messaging` 门控）打开的是独立设置 pane——电话/短信集成管理（linked numbers，chunk-view-BLt3J-sA.js）。不展示 app 目录。
3. **免 flag 的 Connect 入口三个**：侧栏 footer "Connect apps" 药丸（`data-sidebar-marketplace`，点击 → Connect apps 路由，与设置/市场同一 900px 模态体系）、命令面板 `connect-apps`、`grokbot://` 深链。
4. 连接语义 = OAuth 走系统浏览器（无 key 输入）。

## 1. 入口矩阵

| 入口 | 门控 | 打开什么 | 锚点 |
|---|---|---|---|
| 设置 nav `integrations` | `grok_bot_messaging`（`x1t` 过滤，APP@2719729） | 设置内 pane：短信/电话集成（**非 app 目录**） | 导航项 `k$` APP@2718359；pane chunk-view-BLt3J-sA.js |
| footer "Connect apps" 药丸 | 无（恒显） | Connect apps 页（路由 `Zq.link({focusBrowseQuery:''})`）= 900px 模态，Installed + 分类浏览 | APP@`data-sidebar-marketplace` 渲染区 |
| 命令面板 `connect-apps` | 无 | 同上 | RE-CONNECTORS §1 |
| 深链 `grokbot://` | 无 | 同上（focusPlugin/focusBrowseQuery/focusServerId） | RE-CONNECTORS §1 |

## 2. 预设数据形态：目录源 + 静态五件套

**目录源**：`getMcpCatalog`（renderer RPC）→ MAINA@3132282 → MAINA@1875039 `fetchMarketplacePlugins(token, machineId)` 拉后端，`catalogViewsCache`（TTL）+ 逐条 `catalogCache.set`。proto：`MarketplacePluginsResponse{plugins*, next_page_token, has_more, superseded_plugin_popularity_ranks}`（PROTO@758952）。**离线无缓存种子**——离线时该页拿不到列表（空态）。

**静态件 1 · 品牌图标注册表 `sWe`**（APP@791421，`ES(name,sizePx)` 组件消费 → `<img>`）：47 键——amplitude, **apollo(.png)**, **ashby(.png)**, **box(.png)**, **calendly(.svg)**, **canva(.svg)**, **clay(.png)**, clickup, cursor, **databricks(.png)**, docusign, dropbox, figma, github, greenhouse, grok, hex, hubspot, intercom, jira, linkedin, loom, **mailchimp(.svg)**, "microsoft-365", mixpanel, monday, netsuite, **nooks(.png)**, notion, outreach, **quickbooks(.png)**, ramp, **rippling(.png)**, **salesforce(.svg)**, salesloft, shopify, slack, **snowflake(.png)**, stripe, **tableau(.png)**, **telegram(.png)**, trello, vercel, **whatsapp(.png)**, **workday(.svg)**, workspace, zendesk, zoom, **zoominfo(.png)**。另有 amex×2、**microsoft-teams(.svg)**、yelp×2 未入 `sWe`（别处用）。
注：连接器条目图标运行时走 `getMcpPluginLogo({url})` RPC + catalog 的 iconUrl 字段；`sWe` 是否兼作 fallback 未证实。

**静态件 2 · 分类**：11 分类键（credentials/productivity/communication/design/code/data/sales/marketing/finance/research/support）+ 服务端 17 categoryKey 映射 + 客户端硬编码 override（slack→communication、notion/linear→productivity、figma/tldraw→design…）——RE-CONNECTORS §2.2 全量。

**静态件 3 · Mac 本地 7 连接器**：`ti=[messages,mail,notes,reminders,calendar,location,contacts]`（VIEW@5,458）。

**静态件 4/5**：27 种聊天引用类型 `q_n`；域名→图标 `DS`（6 条）。

## 3. 条目卡片结构（列表行，VIEW `$a`）

```
[ToolIcon{iconId?, iconUrl?, name, size:40}] [名称 + 副标(resolveSubtitle)] [trailing: Connect 药丸(sm secondary) / ✓Connected 徽标 / needsAuth→Authorize]
```
详情页图标 56px、主钮 Connect（lg）。分类节标题："From Grok ✓"（一方）、"Team picks"、分类名。

## 4. 动词文案（i18n id + en 值）

| id | en |
|---|---|
| `iSLIjg` | Connect |
| `JrFTcr` | Connecting… |
| `gcoiFh` | Reconnect |
| `3khQqh` | Connected to {accountLabel} |
| `QHcLEN` / `S33tz3` | Connected / Not connected |
| `Ea8un6` | Opened the OAuth flow in your browser. Return here once it completes. |
| `qLe/7o` | Add a custom connector |
| `Wtw22s` / `eQkgKV` / `fo0VXg` | Installing / Installed / Uninstall |
| `7++OwZ` / `Zt5PUS` / `g/jm+8` | Import Bot / Marketplace / Connect Apps（对话框标题族） |

安装/连接语义：连接器 Connect → `authenticateMcpServer{serverId,accountKey?,trigger:'connector_card',…}` → 系统浏览器 OAuth → 深链回调 `completeMcpOAuth{code,state}`；**无 key 输入**（key 仅在自定义 MCP/插件 variableFields 的 secret 字段）。插件 Install → `installEntry{entryId,values,…}`（person 权限级 RPC）。

## 5. 复刻要点

1. Connect 页数据源对齐「服务端目录 + 客户端缓存」形态：**离线时给空态，不要伪造静态预置列表（原版没有）**。
2. 若要「预设感」，合法素材只有：47 品牌图标名、11 分类、Mac 7 项、27 引用类型——与 RE-CONNECTORS 复刻优先级建议合并执行。
3. nav integrations（若做）应指向短信/电话 pane 语义，app 目录入口只在 footer 药丸/命令面板——两者不要混。

## 6. 局限
1. Connect apps 页带条目渲染帧未取得（market fixture 重建未竟）；卡片结构为 RE-market-detail 静态精读 + VIEW 组件复核。
2. `sWe` 是否兼作连接器图标 fallback 未证实。
3. catalog 条目完整字段在 proto 里未逐一展开。
4. integrations pane 只抽查 linked-numbers 区块。
