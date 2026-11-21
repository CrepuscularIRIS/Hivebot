# RE-BOT-MANAGE-1.1.0 · Bot 管理/技能面（0.78.1 → 1.1.0）

> R1 取证单 · 2026-11-15 · 逆向员（reverse-engineer agent）。C4（Bot settings 五区，等 Q-061）开单前置 + T98（info pane skill 入口文案）映射依据。
> 材料（只读）：`deb110/asar/`（1.1.0）、`deb0781/asar/`（0.78.1 对照）。路径均相对 `work/grok-1.1.0-re/`。
> 方法：纯静态 grep + python 定点取上下文（`/tmp/bm-resolve.py`，i18n id → en 串）。**未运行产物**，无运行时证据。

## 0. 结论先行

1. **五串删除实锤**：0.78.1 en 表（`index.eager-common` / `index.eager-app`）里的 `EBwmRD`(Add custom skill) / `c4iggE`(Import existing skill) / `wV9Rp/`(Browse shared Bots) / `oT1yCy`(Bot label) / `yqS7HA`(Shared with others) 五个 key 在 1.1.0 两张 en 表中**全部消失**（逐 key grep 零命中）。
2. **skill 入口重组**：一个 "+" 下拉菜单里两项变两项，语义重排——"写新的"从 `kind:'new'` 改名 **Write a new skill**（`5mcm73`，`kind:'write'`），"从已有挑"从 `kind:'list'` 改名 **Add from your skills**（`pPuDYN`，`kind:'pick'`），挑选列表里新增搜索框 **Search your skills**（`A2EXbV`，aria+placeholder 同串）。载体同一个 chunk 家族（bot-manage-knowledge）。
3. **Browse shared Bots → Browse Team Bots**：同一菜单项位改名（`RA+ad7`），加 building 图标 + `browse_opened` 埋点 + spotlight 命令关键字 `['browse','shared','team','bots']`；浏览页独立成 `chunk-shared-bots-browse`（"Popular / More / results" 三段 + 搜索 + 空态）。
4. **Bot 管理页 0.78.1 三 tab → 1.1.0 五 tab**：`['general','knowledge','analytics']` → `['general','knowledge','analytics','updates','outcomes']`，导出 `BOT_MANAGE_TABS` / `botManageTabsOf`，`isUpdatesFirst` 时重排为 updates 打头，analytics 受 `isAnalyticsShown` 门控。四新串各归其位（见 §4）。**Learned rules 是 agent 对象上的 `learned[]` 数组（`{factId,text,learnedAtMs}`）**，未见独立 store。
5. **T98 只需改一条**：我方 "Pick from your skills" → "Add from your skills"；我们从未落 "Add custom skill / Import existing skill"，无第二条要改。

## 1. 锚点方法论（可复现）

- i18n 机制：组件经 `` r({id:`KEY`}) ``（模板字面量）取串；en 表在 `dist/renderer/assets/index.eager-common-DcDxc78C.js` 和 `index.eager-app-DNSDeodN.js`（0.78.1 对应 `index.eager-common-DbK3Oi_r.js` / `index.eager-app-iGTgHP_Q.js`），表项格式 `"KEY":["文案"]`。**每个组件 chunk 还内嵌非 en locale 表**，所以按 key 全局 grep 会命中几十个文件——消费锚必须用 `` id:`KEY` `` 模式：
  ```bash
  grep -rlP "id:`KEY`" deb110/asar/dist/renderer/assets/*.js
  # 例： grep -rlP 'id:`hiNukf`' … → chunk-bot-manage-screen-D4rckV9n.js
  ```
- 复现基目录：`work/grok-1.1.0-re/`。id → 串解析脚本 `/tmp/bm-resolve.py`（临时，未入 harness；逻辑可并进 `harness/probe.py`）。

## 2. Q1 · 五串删除的确切位置与同位替换

| 0.78.1 串 (key) | 0.78.1 载体（可 grep） | 1.1.0 同位替换 | 1.1.0 锚 |
|---|---|---|---|
| Add custom skill (`EBwmRD`) | `deb0781/…/chunk-bot-manage-knowledge-Cciz9jNH.js`：`c.Item` 下拉菜单项，onSelect → `C({kind:'new'})`（新建 skill 流） | **Write a new skill**（`5mcm73`，pencil 图标，onSelect → `C({kind:'write'})`） | `deb110/…/chunk-bot-manage-knowledge-BJlHl6vJ.js`，`grep -oP ".{80}id:\`5mcm73\`.{80}"` |
| Import existing skill (`c4iggE`) | 同上 chunk：`c.Item` 菜单项，onSelect → `showPane({kind:'list'})` | **Add from your skills**（`pPuDYN`，book 图标，onSelect → `C({kind:'pick'})`；`i!==null` 时禁用+tooltip） | 同上 chunk，`id:\`pPuDYN\``；列表 pane 内标题 kind=`new` 时 "Write a new skill"、编辑时 "Edit skill"（`0NuXpZ`） |
| Browse shared Bots (`wV9Rp/`) | `deb0781/…/index.eager-app-iGTgHP_Q.js` 两处：① `hw.Item` 菜单项（onSelect → 打开 shared Bots 浏览）；② `seeAll` 三级按钮（`variant:'tertiary'`，`m1.seeAll` 样式）。**不在 Bot label 附近**（Bot label 是另一组件，见下） | **Browse Team Bots**（`RA+ad7`）：菜单项（building 图标、onSelect 发 `{action:'browse_opened',entrypoint}` 埋点）；并注册进 spotlight 命令表（`Lbr=['browse','shared','team','bots']` 关键词、`case 'browse-shared'` 命令 kind） | `deb110/…/index.eager-app-DNSDeodN.js`，`id:\`RA+ad7\``（两处：菜单项 + 命令表 `var Ibr={id:\`RA+ad7\`}`） |
| Bot label (`oT1yCy`) | `deb0781/…/index.eager-app-iGTgHP_Q.js`：Bot 名可编辑框的 ariaLabel，组件 `kind:'title'`（`isEditable` + `onCommit`）与内联编辑 `YM`（initialValue=n.title） | **Bot name**（`RFtRvq`）/ **Group name**（`WcF1uL`）条件二选一；组件改 `kind:'name'`，placeholder `6YtxFj`="Name" | `deb110/…/index.eager-app-DNSDeodN.js`，grep `kind:\`name\`,onCommit` 前文 `_ = a(c?{id:\`WcF1uL\`}:{id:\`RFtRvq\`})` |
| Shared with others (`yqS7HA`) | 同上文件：分享状态函数 `M$e(e,t,n)` 的 default 分支（输入 agent 可见性状态，输出状态文案） | 同函数改为多态文案：unpublished→`Flye3f`"Draft: only you can see it until you publish"；published→`4I7dxd`"Published to your team"；hidden_in_setup→`2y53nC`；默认→`yImZrf`"Team Bot"；另有 `Jr4ciL`"by {ownerName}" | 同上文件，grep `case\`unpublished\`:return e(\{id:\`Flye3f\`\}\)` |

## 3. Q2 · skill 入口重组（T98 依据）

载体：**一个对话框内的多 pane**（不是分栏）。`chunk-bot-manage-knowledge-BJlHl6vJ.js`（42.9KB，1.1.0）：

- "+" 菜单（`O.Item` 列表）：**Write a new skill**（pencil，`kind:'write'`）+ **Add from your skills**（book，`kind:'pick'`）。
- `kind:'pick'` 打开列表 pane：pill 形搜索框（`shape:'pill',size:'lg'`，search 图标），aria-label 与 placeholder **同为 "Search your skills"**（`A2EXbV`），onChange 过滤。
- pane 标题：`kind==='new'` → "Write a new skill"，编辑既有 → "Edit skill"（`0NuXpZ`）；`motion:'back'` 时显示 `stepBack` 返回件——即 pane 栈式导航。
- 空态："No skills yet"（`l9hqdu`，也在 chunk-view 与 screen 中复用）。

映射关系（0.78.1 → 1.1.0）：

| 0.78.1 | 动作 | 1.1.0 | 动作 |
|---|---|---|---|
| Add custom skill（菜单项） | `C({kind:'new'})` 打开新建 | Write a new skill | `C({kind:'write'})` 打开新建（**语义等价，改名**） |
| Import existing skill（菜单项） | `showPane({kind:'list'})` 打开选择列表 | Add from your skills | `C({kind:'pick'})` 打开选择列表 + 内置搜索（**语义等价，改名+加搜索**） |
| —（无） | | Search your skills | 列表 pane 的搜索框（**新增能力**） |

## 4. Q3 · Browse Team Bots vs Browse shared Bots

- **入口**：见 §2 第三行。1.1.0 多了两个挂点：spotlight 全局命令（关键词 browse/shared/team/bots）与 `browse_opened` 埋点（entrypoint 参数）。
- **浏览页**：`chunk-shared-bots-browse-Bci_AqFO.js`（12.0KB），导出 `SharedBotsBrowseDialog` / `SharedBotsBrowseBody`：
  - 搜索框："Search Team Bots..."（`Ydw09Q` placeholder）/ "Search Team Bots"（`rekS+N` aria）。
  - 分段：section id `recommended` → 标题 **Popular**（`gL/sdV`）；其余 → **More**（`2FYpfJ`）；`results` → 无标题（搜索结果直接顶替）。sectionLabel 仅在非首段渲染（`sectionLabelAfterSection`）。
  - 空态三串："No Team Bots yet"（`8OEFkJ`）、"No matching Bots"（`12i8o8`）、"Try a different search instead"（`0sEUbf`）。
  - **行/卡片与权限标不在本 chunk**（grid/card/badge 类名零命中，行组件从共享 UI 导入）——权限标角色串在 `chunk-team-bot-details-rows-D6khe9VC.js`（Owner `LtI9AS` / Teammate `3suhu0` / Collaborator `sylWod` / Manager `31RMxV`）。行级权限标的实际渲染位**未配对**（§9）。

## 5. Q4 · Bot 管理五区（C4 骨架）

**顶层是 tab，不是侧栏**。`chunk-bot-manage-screen-D4rckV9n.js`（106KB，1.1.0）导出 `_s as BOT_MANAGE_TABS, Ds as BotManageScreen, xs as botManageTabsOf`：

```js
_s=[`general`,`knowledge`,`analytics`,`updates`,`outcomes`]   // BOT_MANAGE_TABS
vs=`grok_bot_profile_tabs`                                    // 状态持久 key
ys=[`general`,`knowledge`,`analytics`]                        // 默认序（0.78.1 就是这三 tab）
bs=[`updates`,`outcomes`,`knowledge`,`analytics`,`general`]   // isUpdatesFirst 序
botManageTabsOf(e)=(e.isUpdatesFirst?bs:ys).filter(t=>t!=='analytics'||e.isAnalyticsShown)
```

tab 标题（screen chunk 内）：General `Weq9zb` · Knowledge `Ev5qq2` · Analytics `ZlwDi6` · Updates `qIrtcK` · Outcomes `ZU3zZC`。活动 tab 不在列表时回落 `A[0]??'general'`。0.78.1 对照：`deb0781/…/chunk-bot-manage-screen-DrDJNBmv.js` 只有 `` [`general`,`knowledge`,`analytics`] ``、无 BOT_MANAGE_TABS 导出——**updates/outcomes 两 tab 是 1.1.0 新增**。

四新串归属：

| 串 (key) | 位置 | 证据锚 |
|---|---|---|
| **Bot details** (`+kKG1d`) | ① 共享 Bot 信息视图的导航行标签（info 图标）：`deb110/…/chunk-view-ByC7ni_4.js`，同文件还有 Vault `GAYFP2` / Skills `PCSkw2` / Resources `s+MGs7` / Files `sER+bs` / Connectors `Jkj2bb` / "Used by everyone with access" `QsnEIn`；② eager-app 活动流渲染器 `case 'bot-resources'` 的条目标签 | `grep -rlP 'id:`\+kKG1d`'`（注意 `+` 要转义） |
| **Bot configuration** (`aJEqEK`) | "Share this Bot" popover（`chunk-bot-share-popover-Ck33Xl2_.js`，72.8KB）内的菜单项：settings-gear 图标 + 文案，从分享面进 Bot 配置；popover 同文件含 "Who has access" `qlM7mp`、"Files, skills, credentials, and connectors get shared with collaborators by default" `XVxyUk`、角色/受众选择（Only you / People you invite / Everyone on your team / Your organization） | `id:\`aJEqEK\`` |
| **Bot's vault** (`epNUBE`) | BotManageScreen 内 section：`testId:'bot-manage-section-vault'`，条件渲染（vault 开关 w）；相邻 `-connectors` section。vault 登录行/对话框在 `chunk-team-bot-vault-C7BZhyxQ.js`（导出 `TeamBotVaultLoginDialog/TeamBotVaultLoginRow/TeamBotVaultPage`…） | screen chunk `testId:\`bot-manage-section-vault\`,title:o({id:\`epNUBE\`})` |
| **Learned rules** (`hiNukf`) | screen chunk section，`testId:'bot-profile-learned-rules'`；数据 = agent 对象 `learned[]`，每项 `{factId, text, learnedAtMs}`（`Kn` 列表 + `U` 行，meta 显示时间）；空态 "Nothing learned yet"（`aQRwOR`）。**专用 store 未定位**（learned 来自 agent 对象，读写链路未追） | screen chunk `e.learned.length===0?…:(0,Z.jsx)(Kn,{items:e.learned,…e.factId…e.learnedAtMs` |

screen 内全部锚定容器 testId（grep `testId:\`bot-manage-` 仅命中 screen chunk）：`section-vault` / `section-routines`("Routines" `dmYV6f`) / `section-connectors`("Bot's connectors" `Y4VGvR`) / `section-settings`("Settings" `Tz0i8g`) / `section-channels`("Channels" `lfFsZ4`) / `outcomes-list`("Outcomes") / `how-it-works`；另有 `bot-profile-skills` / `bot-profile-files` / `bot-profile-people` / `bot-profile-learned-rules`。

## 6. Q5 · chunk 清单（1.1.0，`deb110/asar/dist/renderer/assets/`）

35 个目标 chunk + 关联 bot-share-* 家族（"Bot configuration" 在其中）。格式：文件名 | 字节 | 首要 export。

**team-bot-\*（28 个）**
- chunk-team-bot-line-render-L9RAoBCQ.js | 925725 | `TEAM_BOT_HELLO_EXAMPLE_COUNT, TEAM_BOT_INTRO_INVITE_COUNT, joinTeamBotSentenc…`（内嵌全部 locale 表，体积由此而来）
- chunk-team-bot-overview-section-CmobRDkx.js | 71273 | `BotActivityEmptyGate, BotSetupWrenchLive, BotSlackStatusLive…`
- chunk-team-bot-service-accounts-dialog-MOenlI2W.js | 54961 | 服务账号对话框（多导出）
- chunk-team-bot-teams-flow-dialog-live-Cmv3Ga7Y.js | 55107 | Teams 接入流（多导出）
- chunk-team-bot-details-rows-D6khe9VC.js | 29696 | Bot 详情行 + Teams/Slack 连接状态（`B as C,j as D,…`）
- chunk-team-bot-context-dialog-NWcwnclo.js | 22676 | 上下文对话框
- chunk-team-bot-plugins-dialog-BokN6juo.js | 23667 | 插件对话框
- chunk-team-bot-details-dialog-C1bpQk4M.js | 36232 | 详情对话框（`dt/ut/pt`）
- chunk-team-bot-share-card-BVL2HgYN.js | 16376 | 分享卡（10 导出）
- chunk-team-bot-custom-plugins-DQhhUYOA.js | 6427 | `TeamBotCustomPluginForm, TeamBotCustomPluginAction, …`
- chunk-team-bot-memories-list-vU-YKTNE.js | 6341 | 记忆列表（`y as t`）
- chunk-team-bot-vault-C7BZhyxQ.js | 7036 | `TeamBotVaultLoginDialog, TeamBotVaultLoginRow, TeamBotVaultPage…`
- chunk-team-bot-plugins-dialog-list-CMmvoU3U.js | 11846 | 插件列表
- chunk-team-bot-preview-page-YpmcxjVV.js | 11937 | `TeamBotPreviewPage`
- chunk-team-bot-overview-panel-BIwMrgyW.js | 1086 | `TeamBotOverviewPanel`
- chunk-team-bot-teammate-intro-DA7qjwCJ.js | 2825 | `TeamBotTeammateIntro`
- chunk-team-bot-setup-dialog-shell-N5fDKhkj.js | 9517 | setup 壳
- chunk-team-bot-setup-flow-dialog-VkJU2R-7.js | 6758 | setup 流
- chunk-team-bot-access-plan-Dnd8WuLM.js | 3132 | access 计划
- chunk-team-bot-access-alerts-TAtISeFZ.js | 2882 | access 提醒
- chunk-team-bot-carry-over-plugin-selection-B9eWc80g.js | 1585 | 插件携带选择
- chunk-team-bot-vault-slot-CQZrwiU8.js | 1706 | vault 槽
- chunk-team-bot-service-accounts-DOoUuV0L.js | 2989 / -dialog MOenlI2W 54961 / -shown Ceo18pTM 903 / -tiles oa18pEgF 1735 | 服务账号家族
- chunk-use-team-bot-access-Bpc0fd_D.js | 5452 | access hook

**shared-bots / bot-manage / bot-share（13 个）**
- chunk-shared-bots-browse-Bci_AqFO.js | 12044 | `SharedBotsBrowseBody, SharedBotsBrowseDialog`
- chunk-bot-manage-screen-D4rckV9n.js | 106179 | `BOT_MANAGE_TABS, BotManageScreen, botManageTabsOf`
- chunk-bot-manage-knowledge-BJlHl6vJ.js | 42919 | 技能/知识 pane（`Vt/zt/an`）
- chunk-bot-manage-automation-drilldown-BJjyG8qp.js | 25489 | `AutomationDrilldownRow`
- chunk-bot-manage-section-LzHDrZnt.js | 4652 | section 壳（9 导出）
- chunk-bot-manage-warm-up-BH7_H4Pe.js | 2358 | `BotManageWarmUp`
- chunk-bot-manage-automation-meta-pSvD21uY.js | 873 / chunk-bot-manage-ready-C_VphjZP.js | 803 | 小件
- chunk-bot-share-popover-Ck33Xl2_.js | 72758 | "Share this Bot" popover（含 Bot configuration 入口）
- chunk-bot-share-invite-popover-C6gBxc87.js | 32569 | `BotShareInvitePopover`
- chunk-bot-share-interruption-Db0w-eEJ.js | 17000 / -availability M-2YUkue 12199 / -trigger nahJhzZz 13193 / -control Ch-8fVMF 7856（`BotShareControl`）/ -state-line B9rjCZjF 6234（`BotShareStateLine`）/ -state-gate Bs7w-dmO 612（`BotShareStateGate`） | 分享面家族

0.78.1 对照：同家族 28 个（无 shared-bots-browse、无 share-popover/invite/control 系；hash 不同）；`chunk-bot-manage-screen-DrDJNBmv.js` 只导出 `BotManageScreen` 且无五 tab。

## 7. T98 映射表（我方 → 1.1.0，逐条）

我方载体：`app/ui/renderer-grok/overrides/modules/skills-dialog.tsx`（SkillsSection 由 `agent-settings.tsx:129` 挂载）。

| # | 我方字面量（位置） | 1.1.0 字面量 (key) | 动作 |
|---|---|---|---|
| 1 | "Pick from your skills"（skills-dialog.tsx:44 dialog aria-label） | "Add from your skills"（`pPuDYN`） | **改** |
| 2 | "Pick from your skills"（:47 对话框标题） | （1.1.0 挑选列表无独立标题串；入口即 "Add from your skills"） | 改为 "Add from your skills" 或保留——建议随入口统一 |
| 3 | "Pick from your skills"（:109 入口按钮） | "Add from your skills"（`pPuDYN`） | **改** |
| 4 | "Skills"（段标题） | "Skills"（`PCSkw2`） | 不变 |
| 5 | "Remove"（:104） | "Remove"（`t/YqKh`） | 不变 |
| 6 | "Close"（:48 aria） | "Close"（`yz7wBu`） | 不变 |
| 7 | —（我们无新建入口） | "Write a new skill"（`5mcm73`） | 不动（新能力，是否做归需求） |
| 8 | — | "Search your skills"（`A2EXbV`） | 不动（若 T98 顺手给对话框加搜索可用此串） |

注：我方 overrides 里没有 "Add custom skill" / "Import existing skill"（仅 vendor-078 资产副本里有），所以 T98 实际只改第 1/3 条（第 2 条随行）。

## 8. C4 拆单输入

- **导航骨架**：tab 制。`BOT_MANAGE_TABS=['general','knowledge','analytics','updates','outcomes']`；默认序 general→knowledge→analytics；`isUpdatesFirst` 时 updates 打头；analytics 需 `isAnalyticsShown`；持久 key `grok_bot_profile_tabs`；无效 tab 回落 general。
- **锚定容器**（全在 chunk-bot-manage-screen）：`bot-manage-section-{vault,routines,connectors,settings,channels}`、`bot-manage-outcomes-list`、`bot-manage-how-it-works`、`bot-profile-{skills,files,people,learned-rules}`。
- **区→标题串**：General `Weq9zb` · Knowledge `Ev5qq2` · Analytics `ZlwDi6` · Updates `qIrtcK` · Outcomes `ZU3zZC` · Bot's vault `epNUBE` · Bot's connectors `Y4VGvR` · Channels `lfFsZ4` · Routines `dmYV6f` · Settings `Tz0i8g` · Skills `PCSkw2` · Learned rules `hiNukf`。
- **数据面清单**（已观察）：learned → `agent.learned[] {factId,text,learnedAtMs}`；vault 登录 → team-bot-vault chunk（`TeamBotVaultLoginRow/Dialog/Page`）；分享面 → bot-share-popover（受众枚举 + `Who has access` + "Files, skills, credentials, and connectors get shared with collaborators by default"）；技能 pane → bot-manage-knowledge（write/pick/edit pane 栈）。
- **进 Bot 配置的入口**：share popover 的 "Bot configuration" 菜单项（settings-gear）。
- **0.78.1→1.1.0 delta**：+updates/outcomes 两 tab、+BOT_MANAGE_TABS 导出、+learned rules 区、share 面独立成 chunk 家族。

## 9. 未配对 / 局限

1. **未运行产物**：全部结论来自静态字符串与 testId，无渲染截图佐证；tab 视觉形态（顶部 tab 条样式）未取证。
2. **learned 的写入链路**（谁往 `agent.learned` 写、是否本地 store）未追；`chunk-team-bot-memories-list` 与 learned 的关系未配对。
3. **shared-bots-browse 的行级权限标**：角色串在 details-rows chunk，但浏览列表行的实际渲染组件（图标/badge 摆放）未定位。
4. "Bot details" 在 chunk-view 的导航（Bot details/Vault/Skills/Resources/Files）与 BotManageScreen 的关系（ teammate 视图 vs owner 视图？）是**推断**（由 "Used by everyone with access" 串推为共享/团队视图），未验证。
5. 0.78.1 的 shared Bots 浏览页载体未定位（eager-app 菜单项之后打开的页面在哪个 chunk 未追，1.1.0 才有独立 chunk）。
6. `2y53nC`（hidden_in_setup 分支）= "Rename this Bot or add a description so your team can see it again"，与 0.78.1 同 key 同文，取自 en 表非 simple 模式时偶有漏解——解析脚本对多元素/复数数组条目（如 `pkIIls`）覆盖不全，个别 id 显示 `??`（EtvyNT/GAYFP2 已解，VphsQP/xwhIY/vdqLKN/l9hqdu/8Ri8tN/As8DXc 未解全）。
7. 时间盒 40 分钟内完成，`harness/` 未沉淀新脚本（`/tmp/bm-resolve.py` 为临时件，建议并入 harness 后删）。
