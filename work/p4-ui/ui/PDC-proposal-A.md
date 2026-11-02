# PDC 提案 · 席 A（Opus 5.5）· P-D 设置·bot 配置（U-23）/ P-C 市场（U-24）

2026-11-02 · 基座 main@d175a75（`shell/{App,store}.tsx`、`plugins/bots/Sidebar.tsx`、`theme/sand-tokens.css`），沿用 PAB-final R1–R24。
输入：RE-ui-shell §1.3/§3.3/§3.4、RE-theme §2–3、RE-marketplace §2–3、CONTRACT §2 #1–#20 / §3.1 / §7.1/§7.5、PLAN U-23/U-24、LOG 11.5x（T-19：111 条 = 21 有 npm 坐标 + 90 条 `metadata.keywords:["not-installable"]`）。
一句话主张：**bot 配置不进「设置」overlay，进右侧 info-pane；市场里不存在「启用」，只有「用它新建 Bot」。**

## P-D 设置·bot 配置

**位置判断**：原版个人 bot 配置 = 会话头「View agent settings」→ 右侧 info-pane 的 settings 视图（RE-ui-shell §3.2/§3.4），七节 settings overlay 管的是账号/电脑/计费（BRIEF 不做）。所以 P-D = **info-pane**，用原版主网格第三列 `280px minmax(0,1fr) auto`（RE-theme §3）。

**布局**
```
┌sidebar 280┐┌ titlebar 38 ─────────────────────────────────────┐┌ info-pane 320 ─────────┐
│ ★ 主 Bot  ││ Alpha  🔒standard · filesystem   [⧉ 用此配置新建][⚙]││ (A) Alpha        ★主 Bot │
│ ● Alpha   ││                                                  ││ 模型（可改）             │
│ ◌ Beta    ││  … 会话流（不变）…                               ││ [glm-5.3 ▾]  下一轮生效  │
│ ⊘ Gamma   ││                                                  ││ ── 配置（创建时固定）──  │
│  连接器已失效││                                                  ││ 🔒 基础配置  standard    │
│           ││ ┌ 连接器已失效，请新建 bot   [用此配置新建 →] ┐  ││ 🔒 连接器    filesystem  │
│           ││ └─────────────（只读 bot 替换 composer）─────┘  ││ 配置随 bot 固定，换配置需新建│
└───────────┘└──────────────────────────────────────────────────┘│ [用此配置新建]           │
                                                                  │ ── 主 Bot ──            │
                                                                  │ [设为主 Bot]             │
                                                                  └─────────────────────────┘
```
- 头部：名称 13/18 semibold；只读配置用 `🔒` 12px + `--sand-text-tertiary`（现 `data-chat-meta` 升级，加锁形）；右侧两个 28px icon-btn（`no-drag`，右内边距让出 WCO：`env(titlebar-area-width)` 外侧）。
- info-pane：宽 320、下限 280、上限 400，拖拽持久化 `sand.infoPane.width`（原版键名）；开合状态全局一个（不按 bot），`localStorage` try/catch。主列 < 424px（`--sand-chat-min-width`）时改为覆盖式浮层（elevated + popover 阴影），不挤压会话。

**状态清单**
| 状态 | 呈现 |
|---|---|
| 加载（#2 模型目录未回） | 模型 select 显示当前值 + disabled，旁 `正在加载…`；配置区不依赖网络，立即渲染（数据来自 recipes + header） |
| 正常 | 如上图；当前模型取 follow 快照的 model-selection 投影（C §3.1 `model?`），缺省显示「跟随配置默认」 |
| 改模型中 / 失败 | 选中即调 #5（不设保存按钮）；行尾 `切换中…` → `已切换，下一轮生效`（2 s 淡出）；失败回滚到旧值 + 行内 danger 文案，不弹窗 |
| 运行中改模型 | 允许；文案固定「下一轮生效」，不打断当前回合 |
| **c1 失效态**（`readOnly` = p2temp preset 且 recipe 缺失或 `live===false`，Sidebar.tsx `botInfo`） | 四处同时：侧栏副行 `连接器已失效`（已有）+ 头像角标 `⊘`；头部连接器文字转 `--sand-text-danger-primary`；composer 位换横幅「连接器已失效，请新建 bot」+ 主按钮「用此配置新建 →」（现 `.readonly-bar` 加按钮）；info-pane 失效连接器行加红点「已失效」，模型 select disabled。**不自动重试、无 spinner、历史照常可读可滚动** |
| c2 启动恢复（[T-16]，U-14 allSettled + 30 s 超时） | 无新 UI：ensure 全部 settle 前停在启动封面（BOOT_TIMEOUT 60 s > 单 ensure 30 s，并行不叠加）；settle 后失败/超时的 recipe 以 c1 出现，其他 bot 正常。UI 不区分「超时」与「失败」，一句文案 |
| 主 Bot | 区块显示「这是主 Bot，固定在侧栏顶部，不能删除」，无按钮 |
| 设为主 Bot | 点即调 #20，无确认（可逆、低风险）；成功后该 bot **立即移到侧栏顶**——R9「会话期冻结顺序」的唯一例外，因为「主 bot 置顶」是不变式；失败行内报错 |

**「用此配置新建」与对话框扩展（U-23 ①）**
- 入口三处：头部 icon-btn、info-pane 按钮、c1 横幅。都打开同一个 `NewBotDialog`，标题改「用此配置新建」，副行 `已预填「Alpha」的配置`，preset 预选、连接器预勾，仍可改（这是新 bot）。
- 对话框新增「连接器」fieldset（基础配置之后、模型之前）：候选**只来自 #16 listBundles**，32px checkbox 行（名称 + 一行描述 tertiary）。勾 ≥1 → 提交走 #4 `createWithConnectors`，否则 #3。
- 预填的连接器已不在 #16（D10c 触发方式正是删掉 bundle）→ 该行显示为 disabled 未勾 + `未安装 · 去市场安装 →`；不阻止创建，提交按钮旁提示「将不带 filesystem 创建」。
- 空：`还没有已安装的连接器` + `去市场安装 →`（关对话框、开市场）。#16 失败：`无法读取已安装连接器` + 重试，preset/模型照常可建。
- D7：#4 报错（只可能由测试直调触发）→ 现有 `form-error`，`创建失败：<message>`，不入列表。

**token 要点**：pane 底 `--sand-bg-chrome`、左边线 1px `--sand-border-secondary-translucent`；区块标题 12/16 `--sand-text-tertiary`，行 13/18；行高 32、行圆角 `--sand-menu-row-radius`；失效横幅沿用 `.readonly-bar`（`--sand-bg-danger-secondary` + error 前景），按钮用 R14 反转主按钮；展开动画 grid 列 0.2 s `cubic-bezier(.22,1,.36,1)`（原版侧栏同款）。

**与原版差异**：info-pane 只留设置一视图（overview/routines/media 等 tab 无数据源，空 tab = 死入口）；配置项锁定无编辑控件（D11 / C §7.5，原版可改，我们改了 bot 会失效）；无头像编辑、无重命名（不在 P-D 范围，#6 在白名单，要时再加）。

## P-C 市场

**布局**（对照 RE-ui-shell §3.3：Back / 标题 / 搜索 / tabs / Installed / 空态与错误）
```
┌sidebar────┐┌ ← 返回   市场                                       （titlebar 38）┐
│ + 新建 Bot ││   [🔍 搜索插件                                   ]  来源：MCP official…  │
│ ▣ 市场  ◀ ││   [全部]  [已安装 2]        ☐ 只看可安装              （列宽 ≤760 居中）│
│ ★ 主 Bot  ││   (F) filesystem-mcp            文件读写 MCP…             [安装]          │
│ ● Alpha   ││   (A) @adeu/mcp-server          …                        已安装 ✓        │
│           ││   (P) pretrip-mcp               …                        仅浏览          │
│           ││   …                              已加载 50 / 111   [加载更多]           │
└───────────┘└───────────────────────────────────────────────────────────────────────┘
详情（同列推入，返回保留滚动位置）：← 市场  filesystem-mcp v1.2.29（17/24）   描述 13/18      [安装] | [不可安装]
   ── 说明 ── readEntryDetail 正文，走现有 Markdown.tsx（关 raw HTML、不加载远程图片）
   安装后：✓ 已安装 · 不会全局启用。在新建 Bot 时勾选它。   [用它新建 Bot →]
```
- 市场占**主列**，侧栏保留：其它 bot 正在跑时审批黄点、运行环仍可见可点（原版是盖住的 overlay）；侧栏「市场」行 R23 的 disabled 去掉，打开时该行 `--sand-bg-active`；点任一 bot 即离开市场。
- 来源：#12 返回 1 个 → 只显示来源标题 caption；>1 → 标题旁 select。**没有任何添加/编辑来源入口**（无 setIndexes）。
- 行 56px 两行：monogram 32（R10 botTint 色族，按名称哈希；**不拉 logo**，D12①）+ 标题 13/18 semibold + 描述 12/16 tertiary 单行省略 + 右侧状态。

**三类条目（T-19 分野落到 UI）**
| 判定（「已安装」行优先） | 列表右侧 | 详情 | 安装结果处理 |
|---|---|---|---|
| `metadata.keywords` 含 `not-installable`（90 条） | `仅浏览` 灰标签，**无按钮** | disabled「不可安装」+ 说明块：「目录里没有这个条目的 npm 安装坐标，本应用暂时装不了。」 | — |
| 有 `versions[0].install.spec`（21 条） | `安装` 次按钮 | 主按钮「安装」 | 调 #15 `(spec, {enabled:false})`；`application==='failed'` 且 `error.code==='not-bundle'` → 该条转「无法安装」+「这是一个独立 MCP 包，不是本应用的连接器包」（本次会话记住，不再给按钮，不自动重试）；其它 code → 行内 danger `<code>: <message>` + 「重试」 |
| `listBundles` 中有同名 bundle | `已安装 ✓` | 已安装说明 + 「用它新建 Bot →」 | — |
- 名称匹配只认 entry.name === bundle.name；对不上的已装包仍在「已安装」页签里（数据直接来自 #16），不猜映射。
- **前置提醒（转主会话）**：真实快照的 21 条有坐标条目安装都会停在 dsh `not-bundle`（VERIFY-T-19 ②b），「一键装好」要等 LOG 11.5x 发现 a 的包装层；D5 走 T-09 连接器不受影响，但包装层之前真目录里点「安装」只会得到「无法安装」——须让用户事先知道。

**状态清单**
| 状态 | 呈现 |
|---|---|
| 加载 | 列表 6 行骨架（`--sand-bg-secondary` 块，无闪烁动画）；搜索框可输入 |
| #12 失败 / `pbots/unavailable` | 整页居中「无法加载市场」+ 消息 tertiary + 「重试」（原版 GqVWTG 文案语义） |
| #12 返回 [] | 「还没有配置目录源」+「目录源由 profile 的 market.yml 配置，应用内不能修改。」 |
| 搜索无结果 | 「没有匹配「q」的条目」+「清除搜索」 |
| 已安装为空 | 「还没有安装任何连接器」（原版 ZyWE2h 语义）+ 切回「全部」 |
| 安装中（长任务，pnpm 解析可能数十秒） | 按钮变 `安装中…` + 行内细进度条（不定长）；**可离开详情、可切 bot**，安装在 store 里继续；全局同时只装一个，其余安装按钮 disabled，tooltip「另一个安装进行中」；完成后侧栏无打扰，回到市场时该行已更新 |
| 安装成功 | 行变 `已安装 ✓`；详情出现「用它新建 Bot →」；「已安装」计数 +1 |
| 离线（mux 断） | M1 不受影响，页面照常；安装若需联网，失败按「其它 code」处理 |
| 「只看可安装」 | 客户端过滤已加载条目，并提示「在已加载的 50 / 111 条中」；勾选时自动续拉剩余页（`total ≤ 500` 时），超过只过滤已加载 |

**交互细节**
- 搜索：输入 200 ms 防抖调 #13 `query.text`，`offset/limit=50` 分页，「加载更多」按钮（不做无限滚动：可预测、E2E 好断言）；`Ctrl+F` / `/` 聚焦搜索，Esc 先清空再返回。
- 「用它新建 Bot →」= 打开 P-D 同一对话框，连接器预勾这一项、preset 选默认——J3 的「安装 → 建 bot 时启用」在这里接上，用户不用自己去找勾选框。
- 键盘：行 ↑/↓ 移焦、Enter 进详情，Alt+← 返回。安装按钮永远只发 `enabled:false`；代码里不存在 `enabled:true` 路径（main §2.2 照样强制）。

**token 要点**：页底 `--sand-bg-pane`；搜索框 32 高、`--sand-bg-secondary`、圆角 10、聚焦 `--sand-border-focus-primary`；分段控件 28 高、选中 `--sand-bg-active`；列宽 `max-width:760px`（原版 stylex 档）；行 hover `--sand-bg-hover`、行圆角 `--sand-menu-row-radius`；`仅浏览` 标签 11/16 `--sand-text-quaternary` + 1px `--sand-border-tertiary-translucent`；「已安装 ✓」用 `--sand-text-success-primary`；安装主按钮 R14 黑白反转，列表里的「安装」用 secondary（避免一屏 21 个黑块）。

**与原版差异**：无 plugins/bots tab 栏（单 tab 是死入口，模板市场 C §6 排除）；无分类/logo/热门排序（registry 快照无这些字段，远程 logo 违反 D12①）；无「启用」与「安装并启用」（启用按 bot 在 #4 创建时发生）；无自定义插件/GitHub 同步/技能/发布（BRIEF §2 排除）；不盖住侧栏（审批黄点须一直可达，R8 + D3/D4）。

## 反提案
1. **不要做「设置」overlay 加七节左导航**（哪怕只点亮一节）。大家会照搬 `/v1/settings` 的七节导航，但原版 bot 配置本来就在 info-pane；一个只亮一节的七节导航全是死入口（D12 精神），而且 overlay 会盖住会话流和审批卡。
2. **市场里不要「启用」开关。** 大家会照着原版 Installed 列表加 toggle，但我们的启用只存在于「某个 bot 创建时」：全局开关要么假装生效，要么就得调 `enabled:true`，而它被 §2.2 拒。用「用它新建 Bot →」顶替这个位置，它是旅程里真正的下一步。
3. **不要把 90 条 not-installable 隐藏起来，也不要原地灰掉了事。** T-19 要求它们留在列表里；但 81% 的行都是灰的，等于在浏览时让人不停猜。做法：给它们挂「仅浏览」标签、不给按钮，详情里讲清原因，再加一个「只看可安装」的筛选。

## 可复用（全部仓内，无新依赖）
`NewBotDialog`（原生 `<dialog>`，R12）加 `initial` 预填参数；`.radio-row` 的样式拿来做 checkbox 行；`.menu-row`、`.btn.primary/.secondary`、`.readonly-bar`、`.pane-notice`、`Icon`；`plugins/session/Markdown.tsx`（详情正文）；`botInfo()`（readOnly/connectors 投影）；Sidebar 的拖拽 resizer 抽成 info-pane 共用。行为参照（不 import）：`D@ce7073d:packages/client/ui-plugin-market/src/client/market-store.ts`（分页与搜索状态）、`PluginDetailSection.tsx`（详情分区）、`ui-plugin-manager/src/client/manager-store.ts:1277-1280`（安装调用，我们固定 false）。图标名（`settings-gear`、`storefront`、`lock`、`copy`、`check`）以 RE 图标表核对，没有的字形改用 `settings-gear` / `plus`。
