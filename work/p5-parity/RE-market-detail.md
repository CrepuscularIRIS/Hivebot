# RE-market-detail · 市场列表行 / 插件详情页 / 自定义 MCP 表单 / connector 卡（R-04）

2026-11-03 · R-04（RE-COVERAGE §2.2 P15–P18、§3 R-04）· 目标 `/dev/shm/grok-re/0.78.1/app/dist/renderer/assets/` · 纯静态（js-beautify 后逐组件精读）+ grok-r3 桩参照图。下游：**P5-57**（列表行/详情页规格）、P5-23/24/32（权限档位参照）。
锚点 = `文件@字节偏移`（原始 minified 文件；组件名旁附 beautify 副本行号 `/tmp/bot-r04/*.beauty.js`，本机易失，丢失后用 `npx -y js-beautify <原始文件> -o <副本>` 重建）。缩写：APP=`index.eager-app-iGTgHP_Q.js`、COMMON=`index.eager-common-DbK3Oi_r.js`、VIEW=`chunk-view-kcheXZ65.js`、PDV=`chunk-plugin-detail-view-BgPF1Rqs.js`、NPD=`chunk-native-plugin-detail-mHF04USK.js`、CMF=`chunk-custom-mcp-form-IGQv-nwH.js`、CCV=`chunk-connector-card-view-CrTQkW_M.js`、SPW=`chunk-plugin-detail-sharepoint-write-CDvU6iFa.js`、UCC=`chunk-user-custom-connector-Bi0ew0AX.js`、NCC=`chunk-native-connector-card-tEGjQXOY.js`、BM=`chunk-marketplace-browse-model-_4v46oGV.js`。
文案解码：en catalog = COMMON 内嵌（2 段 2,601 条）+ APP 内嵌（3 段 2,902 条），R-04 涉及的 390 个 id 全部解码（表在 `harness/grok-r3/r4-i18n-decode.json`）。

## 0. 结论（先行，含对旧报告的更正）

1. **市场把「安装」一律叫「连接」**。列表行/详情页按钮三态 = **Connect（iSLIjg）→ Connecting…（JrFTcr）→ ✓Connected（QHcLEN）**；完成通知 hp8OtS = "Added"（仅用作另一个 ✓ 徽标文案）。**更正 RE-ui-shell §3.3**：QHcLEN 不是 "Installed"，是 **"Connected"**；iSLIjg 不是 "Add"，是 **"Connect"**（各语言 catalog 实证：no 册 QHcLEN="Tilkoblet"）。
2. 列表行是一套组件 `sand-plugins-row`（APP `function FAt`@2133145）通吃三种实体：**目录插件行 / 已装 server 行（per-app connector）/ native 插件行**，差异只在 trailing（右侧动作区）与 subtitle 的取值。
3. 详情页不是 tabs 页，是单列滚动页 `PluginDetailView`（PDV 导出，结构 §2）；「权限 tabs」实为两块：**Tool permissions（reads/writes 两组 × 每组 4 档选择器）** + **SharePoint Additional Permissions（Enable/Disable/Reopen 按钮）**。auto-review 本体不在详情页——详情页只有「Auto-review is off → Turn on」链接跳 settings。
4. 自定义 MCP 表单双模式（Form 字段 / Editor JSON）+ HTTP/STDIO 两型；**没有「测试连接」按钮**——保存后靠 server 状态轮询（settle-after-add，30s）驱动行内 Connecting…→Connected/Authorize。
5. per-app connector 卡 = **已装 grok 内建 server 的行**（"From Grok" 节），点击进 installed-server 详情；`chunk-connector-card(-view)` 是详情页的**账号槽/OAuth 授权卡族**，不在列表里；`native-connector-card` 是 1Password 断开确认。
6. 桩参照图：市场列表 light/dark 各一张已归档 `evidence/r4-market-list-{light,dark}.png`（真实 renderer + fixture 渲染）；详情页/表单帧未取得（§7 局限）。

## 1. 市场列表行（P15）

### 1.1 数据模型（BM，371 行，全读）

- **11 个规范分类**（顺序固定，即 chip 顺序）：`credentials, productivity, communication, design, code, data, sales, marketing, finance, research, support`；label i18n id：credentials=P+nzjE … support=XYLcNv（BM beauty 238–272 全表）。过滤 key = `marketplace:category:<id>`（BM@3133）。
- **分类归一三层**（优先级从高到低）：① 硬编码插件名覆盖表（BM beauty 143–160）：slack→communication、notion/notion-workspace/linear→productivity、figma/tldraw→design、github/github-plugin/runlayer/superpowers/compound-engineering/create-plugin→code、langfuse→data、parallel→[research,data]、context7(-plugin)→research；② 服务端 `categoryKeys` 大写枚举映射（LOGIN_AND_CREDENTIAL_MANAGEMENT→credentials、INBOX_AND_COLLABORATION/SCHEDULING→communication、PAYMENTS/FINANCE_AND_LEGAL→finance、DATA_ANALYTICS→data、CANVAS→design、DOCUMENTS_AND_FILES→productivity、INFRASTRUCTURE→code …）；③ bot 侧 category 小写串映射（engineering→code、product/operations/"recruiting & people"→productivity…）。归一化：trim→upper→`&`→` AND `→非字母数字→`_`。
- **通信类置顶 bot**：`{communication:['email']}`——communication 分类下 email native 排最前（BM beauty 273–275 + APP `as` 排序器，APP beauty 611）。
- **推荐区（Team picks）算法**（BM `y` 函数，beauty 84–113）：信号 = team（teammateCount=teamInstallCounts[id]）与 affinity（同类已装强度）；取 6 个：先 team 信号按 count 降序取前 floor(6×0.5)=3，affinity 补位，再 team 兜底；tie-break = popularity（`KS` 谓词）+ `Intl.Collator(locale).compare(displayName)`；区排序 team(0) → affinity(1)。
- **homepage/搜索状态机**（BM `deriveMarketplaceBrowseModel`，beauty 321–351）：`isHomepage` = 无 detail + 无 section + 无 query；`isUnifiedSearch` = unified &&（有 query || detail.kind===category-filter）时 browseItems 置空；`showsPluginCatalogStatus` = unified && homepage && catalog.length===0（空目录态文案 GqVWTG "Couldn't load the marketplace"）。
- **logo 预取**（BM `marketplaceHomepageLogoUrls`）：推荐 6 + 每分类前 6 + team 前 6 的 iconUrl 去重。

### 1.2 行组件（APP `FAt`@2133145，beauty 99683）

```
<li aria-labelledby={nameId} class="sand-plugins-row">        // 纵向 stack，padding/半径见 stylex 类
  <button type=button aria-label="Open {name}"（T9mwDN；openNameDetail 存在则 "{name}, {detail}"）>
    [ <ToolIcon iconId/iconUrl name size=40 tint/>,           // 图标 40px（详情页 56px）
      <span class=sand-plugins-row__main>
        [ <span>[ <span class=__name>{displayName}</span>,    // 名称（wrapsName 两态：单行/换行）
            byline（可选，"by {marketplace}"，t490IT，斜体式 class）,
            badge（可选，team 徽标 Fq：icon+title） ] ,
          <span class=__subtitle>{subtitle}</span> ] ]        // 副标题：推荐信号 or description
  </button>
  <span class=sand-plugins-row__trailing>{trailing}</span>    // 动作区，4 布局态（stacksTrailing × opensRow）
</li>
```

- subtitle 规则（VIEW `as` 组件，beauty 5328）：推荐区行 = **DKYhCi**（ICU 复数："Used by 1 teammate" / "Used by {n} teammates"，VIEW@98925）；非推荐行 = entry.description；placeholder 行 IAt（`sand-plugins-row-placeholder`）。
- **trailing 态机**（VIEW beauty 5380–5509，优先级从上到下）：
  1. `nativeInstalled(entry)===true`（1Password 已连 / email 已开）→ ✓Connected 徽标 HAt（`check` icon 12px + QHcLEN，class `sand-plugins__added`）；
  2. `===false`（native 未连）→ Connect 按钮（zn：size sm、variant secondary、aria-label 5ZzgbQ "Connect {name}"，内容 = DT 三态切换器，labels add=iSLIjg/adding=JrFTcr/added=QHcLEN）；
  3. admin 禁用（V0e：server/grokTwin.status===disabledByTeamAdminPolicy 或 catalogBlocked）→ 状态徽标 BAt（OYx6pi "Disabled by team admin"，role=status）；
  4. accountUnavailable 且未装 → VAt（O+Zenh "Not available"…实文 "Not available"，role=status）；
  5. server needsAuth → mr 授权按钮（idleLabel=Connect）→ 该行视为 `connect` 态；
  6. 普通插件：state = os(有授权,已装) = 有授权→`connect` / 已装→`added` / 未装→`add`。add 态 = Connect 按钮（aria-busy、disabled=isBusy，activity kind==='adding' 时 active='adding'）。
- **actedOn 堆叠态**（VIEW `ss`，beauty 5555）：刚点过的行 trailing 渲染三层 [Connect 按钮, ✓Connected 徽标（HAt 或 Hn(label)）, Connect 按钮]，用 `sand-lshs6z`（visibility hidden）切换显隐——**布局不跳**，为「点击→✓淡入」动效服务。
- **安装判定**（APP `Ik`@1123883，beauty 46918）：effectivePluginsById 有且非摘除 → 已装；否则 servers 里 pluginId 匹配（排除 grok 系）任一即已装；产出 `{isInstalled, plugin, server, grokTwin, catalogBlocked, accountUnavailable}`；builtin 走 `builtinServerIdentifier` → server ready = `status!=='needsAuth'`（zb，APP beauty 26079）。
- **安装后 settle**（APP@631528 `sand-plugin-row-settle-after-add`，timeoutMs **30_000**）：轮询 server status，`initializing/disconnected/error`→settling（保持 Connecting…），needsAuth→authenticate（出 Authorize），就绪→✓；另有 `whenListedAfterPluginWrite` 等插件出现在列表。
- **已装预览条**（VIEW `Oo`，beauty 4218，`sand-plugins__installed-preview`@78022）：`[图标堆叠（≤wo=4 个，ToolIcon 18px 或 mac app mini icon，重叠 margin）, 计数 E6HC8r "{n} connected", chevron-right 12]`，aria-label KtaVdF "Your plugins"@77923；排序：有 icon 的 → mac apps → 无 icon。
- **分类 chips**（VIEW `jo`，beauty 4345，`sand-plugins__chips/__chip`）：标题 jj4zKl "Plugin categories"@60576 + "All" chip（N40H+G）+ 分类 chips；选中/未选中两套 stylex 类（选中带 `sand-9r1u3d sand-fwqdrz sand-1n4gmbt`）。
- 空态：ZyWE2h "Nothing installed yet. Find plugins in the marketplace."；搜索无果 mLyVIn `No plugins match "{trimmed}"`；加载中 ts()→"Loading…"（role=status，色 tertiary）。

### 1.3 native 插件（客户端硬编码目录）

APP beauty 585–622 + 26089–26149：native 类型集 `Zo=['onepassword','email']`；entry id = `native:<type>`（如 `native:email`）；构造 `Vb`（APP@460330）：name 映射 {onepassword:'1password', email:'email'}、displayName/description/category 走 i18n（1Password=categoryKey LOGIN_AND_CREDENTIAL_MANAGEMENT，email=INBOX_AND_COLLABORATION）、publisher {1password: '1Password', email: 'Grok Bot'}。**email 是否入列**由 builtin server `grok_bot_agent_mail`（APP@163461）状态决定；1Password 的描述受 `sand_new_1pass` gate 切 brokered 文案；行上 `nativeInstalled` 判定（chunk-native-plugin-state）：onepassword→凭证连接状态、email→邮箱存在；builtinServerIdentifier 存在时改查 server ready。

### 1.4 列表节顺序（homepage，VIEW 主 view + 桩图证实）

头部（D2 已逆）→ tabs（plugins|bots，D3）→ 列表态 `No`：installed-preview 条 → 「From Grok」节（RbPE3L "From {name}"，name=dlHT84 "Grok"；上限 to=8）→ 推荐节（Team picks：Vr 推荐算法，pluginLimit r / overflowLimit v，"View all" N6Pxr9）→ 分类节（每类 ≤On 条 + View all）→ 底部 "Add a custom connector"（qLe/7o）。unified 搜索态 `ls`（VIEW beauty 5670）：grok connector servers 过滤后**排在插件行前**，节标题 kx0s+n "Results"。

## 2. 插件详情页（P16）

### 2.1 结构（PDV `PluginDetailView` qr，beauty 3785–4139）

单列滚动（`PluginDetailLayout` Gr：header + 纵向 children，无 tabs）。children 顺序（条件渲染）：

1. accountUnavailable → 不可用视图（Vr，文案 Se(name)）；
2. 个人 bot 已装 → 个人账号槽管理 Tn；
3. 有 accountSlots（团队/多账号连接器）→ 账号连接卡槽 Bt（含 discovery chips：`sand-connector-card__chip`，icon 18 + 名 + `plus` xs；"Browse more" Lrv2Lo → arrow-right，CCV `ge`，beauty 242）+ 账号槽列表 Je（aeo+Um 区见 §2.4）；
4. 已装且无槽 → 已装服务视图 Hr；
5. 非单连接器 → **PluginToolsSection**（工具/权限，§2.2）；
6. 已装 + 有 setup 字段 → "Setup Values" 按钮（mrRDVU）→ Br；
7. **Apps 卡**（VDvaN2，zr DetailsList：noun='connector'，icon `plug` 16px，label+计数，默认 On 条折叠 + 展开剩余，class `sand-plugins-detail__connectors`）；
8. **Skills 卡**（PCSkw2 "Skills"，noun='skill'，icon `cube` 16px，`sand-plugins-detail__skills`；grok 系 server 存在时整卡禁用）；
9. 单连接器 → 工具区（Or）；
10. **Information 列表**（nSkB8g，DetailsList Fn）：行 = Capabilities（Qx7DM7，值 = connectors 数 Yb5NVb + skills 数 VdObnj 拼接）、Developer（7aDnUb=publisher.displayName）、Category（K7tIrx）、Team adoption（20QE6w，值 bCbNMB {count}）、Website（On0aF2）、Availability（lXkUEV：builtin→+7fBMP "Built-in"；team marketplace→vhSOwR "Your team"；isPublicListed→7d1a0d "Public"；否则空）；
11. 发布者自发布 → Unpublish 按钮（4DLZUa，sentiment danger、variant secondary、size lg）。

**头部**（`PluginDetailHeader` Kr，beauty 3656）：`[ToolIcon size=56 tint, 标题块, action]`；标题块 = h3 displayName（`data-detail-hero-title`）+ 仓库链接（bXJKzj "Copy link to this plugin"，点击复制而非跳转）+ 副行（marketplace.displayName · teammateCount，`·` 分隔）；下方 description p（body1）。图标 56px（列表行 40px）。

### 2.2 安装按钮态机（PDV beauty 3913–4006，`Yn` 按钮）

- labels = {add: **Connect**（iSLIjg），adding: **Connecting…**（JrFTcr），remove: `Ie(installMode|'user')` 动态文案，removing: **Removing…**（APfagk）}；state 机：activity.adding→`adding` / activity.removing→`removing` / 未装→`add` / 已装→（isUninstallPending? `removing` : `remove`）。
- disabled = isBusy || disabledTitle；disabledTitle：admin 禁用（OYx6pi）/ 账号不可用（displayName）；blockedReason = Kvsbal "You are the publisher of this plugin. To remove it, unpublish the plugin."。
- onAction：未装 → onAdd(entry)（entryPoint `plugin_detail`，可带 slackThread）；已装 → 卸载（installedPlugin→uninstallPlugin(pluginId)，server→uninstall(serverId)）。
- intent==='add' 且 state==='add' 时 autoFocus。
- remove 动作同时挂在 pr 的 removeMenuItem（下拉菜单项），移除等待态显示 Gn spinner（afterLabel）。
- **grok_connector_user_toggle** gate（beauty 3865，3898）：开时已装行额外渲染 qn 用户级开关组件。
- 安装动作链（VIEW `Qs`，beauty 7234–7560）：add = pe(actedOn) + activity{kind:'adding',pluginId,run} → install mutation（APP `yze`：mcp.install）；完成后 skills 同步（syncPluginSkills，成功通知 MunE46 "Added {n} skills from {name}"，失败重试一次）；OAuth：authenticate（dataCenters 选择 → Me(serverId,accountKey,…,forceReauth,{entryPoint,microsoftAccountType,dataCenter,slackThread})）→ status==='started' → 打开授权页 ht({connector,displayName,authorizationUrl,portConflictDetail?,authorizationUrlLifetimeMs?})；装完等待 §1.2 的 settle。

### 2.3 工具权限区（PDV `Lr`/`Nr`，beauty 2983–2918；核心状态机 beauty 2487–2622）

两版实现（选择器 `jr`，beauty 2812），`Ar(serverId)`：gate **sand_tool_allowlist** 且 serverId 为纯数字 → 完整版 Lr（beauty 2983），否则简化版 Nr（beauty 2839）：

- **简化版 Nr**（默认）：节 = hr 容器（label xdA/+p "Tools"）+ summary **bWyJ+b "{enabledCount} of {total} enabled"**；每工具一行：名称（title=description，友好名 `Ae` 映射）+ Switch 开关，开=Enable {name}（FZtBeR）/关=Disable {name}（y5UgU8），toggle 写 `{serverId, tools:{[tool]: 'auto_review' | 'blocked'}}`（开=auto_review，关=blocked），乐观更新（useOptimistic+useTransition），失败 role=alert。
- **完整版 Lr**：标题 h3 **1VLdqN "Tool permissions"**（PDV@54644）；工具按 `isReadOnly` 分两组渲染：**Reads（bxj38a）/ Writes（0uua0a）**，组容器 role=group + aria-label；每组一个 4 档选择器（`wr`→`Er`，PDV beauty 2596）：档位顺序 **[always-allow, auto-review, needs-approval, blocked]**（内部值 auto_review/always_allow/needs_approval/blocked，映射表 vr@2490 区域，`needs_approval`@44958）；组档 + 成员工具档；**heldModes（禁用档）**：lock==='free' 且未持有 always-allow → always-allow 禁用；autoReview!=='on' → auto-review 禁用。
- **auto-review 全局状态**（`br`，PDV beauty 2523，`autoReviewTeamEnforced`@45294）：lock = free/pending/locked（团队强制）；autoReview = on/off/pending。联动：locked 时 always_allow 显示并回写为 auto_review（xr 映射）；autoReview off 时选中 auto_review 回写为 always_allow。
- footer 文案：locked → sag80m "Auto-review required by your admin"；connectorWritesNeedApproval → HrUSV3 "Required by your admin. You can't turn this off."；**autoReview off && free → Ir footer：xGRmq1 "Auto-review is off" + 按钮 iMkWoF "Turn on"** → 打开 settings 并 focusSetting anchor `auto-review`（带 sand_permissions_panel/grok_bot_messaging gate 分支）。RmzpYm "Always allow skips your own Ask first rules for this app. Your team's rules still apply."（always-allow 档说明）。
- 写审批判定 `Sr`：settings.connectorWritesNeedApproval===true 且 (servedBy==='cursor' 且 url 不在 connectorWriteTrustedUrls) → writes 组按审批处理。
- connector-grant 授权相关（R-02 范围）在本区相邻：每工具权限选择器 onChoose 最终写 setMcpToolPermissions 一类 RPC（写链在 PDV `Tr` 助手，beauty 2887）。

### 2.4 Accounts 区与 SharePoint（SPW + PDV 引用）

- **Accounts 卡**（SPW `Se`，beauty 324，标题 bPwFdf "Accounts"）：多账号连接器的槽列表。每槽：账号名（grok default 账号显示 dlHT84 "Grok" + title 提示）、状态徽标（sand-plugins__status，data-status 属性，色 map connected/warn/danger/neutral，APP `LAt`）、Default 标记（ovBPCi）、等待授权态文案（wfJAKj "Waiting for {displayName} authorization…" / d660An / j7klSo）、编辑（改名，XHpefl "Account label"）、Add another account（O5JHbm）/ Add Account（5a1gAl）；微软连接器先选账号类型（m9XLGJ "Connect a work or school account"、5ZLlSZ 个人账号选项，gate rest_mcp_microsoft_account_type_choice）；加账号输入新标签（不在已有 accountKey 集内）。
- **Additional Permissions 区**（SPW `De`+`ke`，beauty 937–1114，标题 aeo+Um@19908）：仅当已连 SharePoint（`rowServerIdentifier==='user-SharePoint-xai'` 且 connected，SPW@20272）。查询 query `sharepoint-write-access`（失败 mmzR7e "Couldn't load this setting"）。按钮三态：未启用 → **Enable**（PaQ3df）→ 走 OAuth（forceReauth、entryPoint plugin_detail，失败 TZFIGB）；已启用 → **Disable**（cO9+2L，失败 mkcO2d）带确认（Confirm Disconnect → Reopen M7SqjM 确认态）；错误 role=alert。
- 授权等待/失败 UI（CCV 全套，§3）：0FVrvJ/eifFQq "Authorization failed/didn't finish. Click to retry."、9EUU+T/Vvllg0 重开授权、Cm4nAb 浏览器打不开重试、nVjuaq 复制签到链接（y1eoq1 Copy link/6V3Ea3 Copied）、53BCFs/qB6nFC「签到页已开在那里」两变体（box vs desktop）、YZO2wi 桌面等待、5ZLlSZ 微软个人账号。

### 2.5 native 插件详情（NPD `NativePluginDetail` Fe，beauty 2544）

复用 PluginDetailHeader/Layout + DetailsList（Information：Developer/Category/Website）；action = 已连时 ✓Connected 徽标。body 按 nativeId 分支：

- **onepassword → be**（NPD beauty 1913）：连接引导（Timamj "Connect 1Password"，wF9KAc 前言）两路：本机 1Password app（3FXl04 浏览器 approve 等待、故障步骤列表：9vXkA2/dY0atl/g7GiX4/KM+S+M/dY0atl、0fHJU3 版本要求、SDUL4S 未安装、7hvNMc 连不上重试 6gRgw8）或 **service account token**（3kACLg@15618，8n0E3W 说明、ZXpmme token 输入、VJ6pK2 创建步骤、2QKGtQ 校验中、VZZ5g2 审批、kJTcYz 更新 token）；已连：3khQqh "Connected to {accountLabel}"、4PxcyL 说明、vault 共享管理（yNDjKk、55UuKo 条目数、LhoDam 空态、VclML5 Refresh vault、f9XSNs "Synced {0}"、同步失败三态 T1HX80/FKdxEj/fs0ZUQ/vANlhH、断开 +K0AvT、重连 gcoiFh/mHVPm5/hcqAkx）。
- **email → Pe**（NPD beauty 2518）：gate grok_bot_agent_mail_multiple_inboxes → 多收件箱 Ne / 单收件箱 je（domain 按生产后端切换）；流程：zmsQYr "Add an email" → 2j4Igv "Choose a name" + ATGYL1 "Email address"（cyvZe6 "Create address"）→ e2H5I3 一次性说明 → 就绪 XPE6v4（routine 建议）；未开启提示 22f8Ks。

### 2.6 installed-server 详情（PDV `InstalledServerDetailView` Ur，beauty 3357）

已装 server（含 per-app connector）点行进入。头部同款；Availability 覆盖：builtin→Built-in、servedBy==='grok'→"Grok"、isTeamServer→"Your team"；Information 行含 Command/URL（stdio 型列 Command sjVfrA，HTTP 列 9rG25a）等；主体 = 工具权限区 + Accounts + 移除按钮（+K0AvT Disconnect）。

## 3. connector 卡三件套（P18）

三层，别混：

1. **市场列表的 per-app connector 行**（VIEW `$a`，beauty 3547）：= §1.2 同一 `sand-plugins-row`，icon = resolveIcon(name,url)（ToolIcon 40）、name = server.name、subtitle = resolveSubtitle（server 状态）、trailing **恒 ✓Connected**（HAt）、onOpen → detail kind `installed`（serverId）。「From Grok」节（RbPE3L "From {name}"）即此物——**grok 内建 per-app 能力 server（Messages/Mail/Routines/Memories…）的已装清单**，上限 8；unified 搜索时与插件行混排（排前，节标题 "Results"）。
2. **chunk-connector-card-view（CCV，16 导出）**：详情页 Accounts/OAuth 交互卡族——授权按钮组（Connect iSLIjg / Authorize yIVrHZ / t4Dt8N "Authorize {0}"）、等待与失败重试全套（§2.4）、账号 pill（accountPill 样式族、Default 标记、Disconnect +K0AvT）、discovery chips、tailnet 专项（0lPOT3 "Personal tailnet"、v3+2Gk tag:grokbot、gV6Ksq 公司 tailnet、DHk9GO 工作账号未找到、wGekUX/UbWDoA 团队设备说明、Cfg0eW "Open computer"）、Add Account 5a1gAl@24352 / Add another O5JHbm@22145。
3. **chunk-connector-card（19K）+ native-connector-card（NCC）**：前者是账号槽数据/动作封装（含 DHk9GO、m9XLGJ 微软选型、v8gRp+ "Let Grok Bot use {connectorName}"）；后者 NCC = **1Password 断开确认卡**（8U6a8X@3466 "Disconnect {providerName}?"、uG9dXc 停用说明、Confirm=+K0AvT/Cancel=dEgA5A、完成 ZYnwzF "Disconnected"）。

**与详情页的关系**：列表行/详情页是宿主；CCV 的卡渲染在详情页 Accounts 槽位（Bt/Je）与授权等待浮层（ht 打开的 connector 授权页）里。

## 4. 自定义 MCP 表单（P17）

### 4.1 宿主与入口（UCC，194 行全读）

- 入口按钮 `UserCustomConnectorAction`（qLe/7o "Add a custom connector"，size md、variant secondary）：点击先打遥测 customConnector{stage:'started', entrypoint:'connect_apps'}（UCC@1228）再进表单。
- 表单页 `UserCustomConnectorForm`（UCC beauty 96）：页头 = `plug` icon md + h1（heading3/medium，qLe/7o）；表单 = CustomMcpForm chrome=`catalog`；底部 ActionBar（`sand-jp7ctv` ref 槽 = dialogActionsHost，Save 按钮通过 portal 渲染进底部条）；失败 D2AZQg "Something went wrong. Try again."（role=alert，red）；addServer = `mcp.addServer` mutation（APP `vze`，add({name, configJson})）；nameProblem = 与 existingServerNames 重名（BMJU7y）；onCreated 打遥测 stage:'connected'。

### 4.2 表单本体（CMF `Y`，beauty 1009–1182）

- **kind**：create / edit（edit 锁 name+type，需要 config 有变化才可存；updateServer(pluginId, config)；edit 对象无 mcpConfigJson → D2AZQg 错误页）。
- **chrome**：legacy / catalog（市场内用 catalog：label 布局 above、Type 用下拉框、无 Form/Editor 切换、placeholder "Add a name" kA37Oh）。
- **双视图**（legacy chrome，SegmentedControl）：**Form（QRAWTO）/ Editor（uBAxNB）**；切到 Editor 时 `text = m(draft)`（序列化 `{[name]: mcpServers 条目}`）；切回时文本未变用原 draft、变了则重新解析；JSON 校验（K，beauty 894）：NjG+x8 "Enter valid JSON"（@5033）→ ARSuTm "The JSON must be an object keyed by the server name" → kMkfSS "Add one server to the JSON" / Q6t+vO "Add one server at a time" → Ra3OR9 "The server name cannot be blank"；name 冲突 BMJU7y "A server named \"{name}\" already exists"。
- **Form 字段集**（G+U，beauty 799/440）：
  - **Name**（6YtxFj；placeholder kA37Oh）：aria-invalid、问题消息行（AUlCmR "Name must contain at least one letter or number" / BMJU7y）；
  - **Type**（+zy2Nq）：Remote HTTPS（fy6XDM，值 HTTP）/ Command（sjVfrA，值 STDIO）；catalog=下拉框（secondary/lg/matchAnchorWidth），legacy=分段控件（fullWidth/lg）；
  - HTTP 型：**Server URL**（9rG25a，input type=url）、**HTTP headers**（VPpyHp，Key 7sMeHQ / Value wMHvYH 行编辑器 V）、**Client ID**（b9Y4up，placeholder 9IZdhX "OAuth Client ID (optional)"，非 catalog）、**Client Secret**（Bdj4LI，type=password，placeholder roPPU9；catalog chrome 下仅当 clientId/secret 已非空才显示）；
  - STDIO 型：**Command**（sjVfrA）、**Arguments**（OgB1k4，逐条 list H，placeholder tTh1LD）+ 安全警告 p（S6uAcw@12346："A command runs on the box each conversation uses, including teammates' conversations…Use Remote HTTPS for a server that needs secrets."，色 secondary、size sm）。
  - 必填校验 MbjbEk "{label} is required"、YH8mbG "The server needs a URL or a command"（二选一）。
- **按钮**：edit 态 Cancel（dEgA5A，secondary/sm）+ **Save**（tfDRzk，primary/sm，disabled=!canSave）；create 态经 dialogActionsHost 渲染 **Add plugin**（tZF1VG）。
- **保存后**（无测试按钮）：addServer → onCreated/onBack + 通知 w({serverName, serverUrl?, transport: 'stdio'|'http'})；server 进入 initializing，靠 §1.2 settle-after-add（30s 轮询）驱动行/详情状态；needsAuth 时出 Authorize。
- bot 级编辑同款（chunk-grok-bot-team-custom-mcp，29K = 共享 draft 模型/序列化库，m/h/b/C 等被 CMF import；另有 validate 钩子）。

## 5. 数据与 RPC（renderer 侧）

- 市场数据全部走 **coordinator 面**（APP 方法表 `getMcpCatalog:{args:'none',reply:'array'}`@258821 同段）：`getMcpState`（→{servers:[…]}，server 关键字段 serverIdentifier/**rowServerIdentifier**/status/statusDetail/toolCount/pluginId/servedBy/accountKey/isTeamServer/builtinServerIdentifier/holdsNoCredential/cursorScmProvider）、`getMcpCatalog`（目录数组）、`getEffectivePlugins`（{plugins,marketplaces}，条目 pluginId/installMode/isEnabled/configuredVariables/servedBy）、`getMcpTeamPopularity`、`refreshMcpCatalog`、`listMcpServerTools`、`getPluginSyncStatus`、`getGrokBotAgentMcpServers`（包装层 s8n）。写路径（install/addServer/uninstall/权限）经 mcp.* mutation（APP beauty 26650 段）。query key：`mcp-servers`@632483 / `mcp-catalog`(GqVWTG) / `team-plugin-popularity`(gA2wlC) / `effective-plugins`(p/LMeU) / `mcp-server-tools`(jXgUGq)。
- 桩 fixture 形状（已验证可渲染列表）：见 `harness/grok-r3/stub-init-market.js`（catalog 6 条 + servers 2 条 + popularity + tools；server 必须带 rowServerIdentifier，缺了会在 tailnet 谓词 `Cs` `rowServerIdentifier.startsWith` 崩）。

## 6. 桩参照图（grok-r3）

- `evidence/r4-market-list-light.png` / `r4-market-list-dark.png`：fixture 目录下的真实列表（1440×900@2）。视觉实证：行 = 40px 图标 + 名称 + 描述副题 + Connect secondary 药丸钮；「From Grok」节（Email ✓Connected）→ 「Team picks」（Figma "Used by 3 teammates"、Notion "Used by 1 teammate"）→ 分类节（Code & infrastructure：GitHub ✓Connected + Context7/Langfuse/…Connect）；已装行无按钮只有 ✓ 徽标；dark 下 ✓/按钮描边对比清晰。
- 驱动：`CLICK_SEL=[data-sidebar-marketplace]`（真实 CDP Input 点击）+ market fixture stub（`stub-init-market.js` 放 `/tmp/grok-r3-work/stub-init.js` 位置）；drive.mjs 已加 click2/after 截图/DOM probe（harness 内保留）。

## 7. 更正旧报告

| 旧结论 | 更正 |
|---|---|
| RE-ui-shell §3.3「Installed/QHcLEN、Sync/Nu4DdT」 | QHcLEN = **Connected**（en/no 双册实证）；安装动词是 **Connect**（iSLIjg）/Connecting…（JrFTcr）。Nu4DdT 是 "Sync"（GitHub 同步条目，本次未展开） |
| RE-COVERAGE §2.2 P16「权限 tabs、auto-review 开关」 | 详情页无 tabs、无 auto-review 开关本体：权限 = Tool permissions（reads/writes × 4 档）+ SharePoint Additional Permissions（Enable/Disable）；auto-review 只有 footer 链接（"Auto-review is off → Turn on" → settings） |
| RE-COVERAGE §2.2 P15「安装态角标」 | 角标 = ✓Connected 徽标（check 12 + QHcLEN）；admin 禁用/账号不可用各有独立 status 徽标（OYx6pi / O+Zenh） |
| RE-approval-model §3（权限文案） | 归位：四档枚举 auto_review/always_allow/needs_approval/blocked 的 UI 选择器在插件详情 Tool permissions 区（档序 always-allow→auto-review→needs-approval→blocked，held 档禁用逻辑见 §2.3） |

## 8. 局限与未验证

1. **详情页/表单的桩截图未取得**：市场 overlay 在桩下渲染时序竞态（React cache/Suspense），列表帧成功两次（light/dark），但点行进详情的二次点击在 probe 时 DOM 尚空（`els:0`）；且 headless compositor 存在 stale frame 复用（md5 证实多张 after 帧相同，RE-stub-boot 已知坑）——已归档的两张列表帧来自真实渲染，但「每次都能稳定复现」不成立。详情页规格以静态精读为准（组件树/文案/态机完整）。
2. stylex 的语义 label（如 `sand-plugins-row__open`）在 DOM 里不存在（编译为哈希类）；报告中的视觉值只到组件/类名族级，像素值需按 R-33/主题 token 落地时再取。
3. 市场打开的时序竞态未根治（boot restore deep-link 抢跑）；未验证 bots tab、skills 管理、团队发布流的渲染。
4. `listMcpServerTools` 返回的工具对象按 UI 读取字段（name/description/isDisabled/isReadOnly/isProbe）构造，完整 reply schema 未逐字段验证。
5. 深链 `/v1/marketplace` 在桩下时灵时不灵（§1），真实客户端行为未测（不登录不联网原则）。
6. i18n 解码依赖 en catalog 内嵌段（COMMON 2,601 + APP 2,902 条）；R-04 的 390 id 全覆盖，但不排除个别 id 在其他 lazy en 段（已证 0 缺失）。
