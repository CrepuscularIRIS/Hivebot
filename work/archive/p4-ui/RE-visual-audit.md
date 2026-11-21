# RE-visual-audit · 0.18 视觉规格 vs 当前实现（P4 四页差异清单）

日期：2026-11-02 · 方法：源码对比审计（0.18 重构仓为可读源码，普通仓库工具读取，未用 REA 引擎）
对象：`repos/grok-bot-0.18-reconstructed/frontend/src/`（只读，下称 **0.18**）↔ `app/ui/renderer/`（只读，下称**当前**）
0.78.1 覆盖判定全部引自 `work/p1-re/RE-ui-shell.md`（§1–§3）与 `work/p1-re/RE-theme.md`，未重做逆向。

**锚点约定**：`文件:行` 相对 `repos/grok-bot-0.18-reconstructed/frontend/src/`。不可变 CSS 证据在 `recovered/features/computer/shell/view.css:4`（单行大文件，正文引 utility 类名）。

---

## 结论（先行）

1. **骨架层基本对**：网格 `侧栏 280(240–400) / 1fr / info-pane 320(280–480)`、气泡 640/18px 圆角、tool-call 紧凑行、composer 圆形 30px 发送钮、审批卡 560 宽——这些都和 0.18/0.78.1 一致或由 0.78.1 token 覆盖。
2. **最大缺口在侧栏条目规格**：0.18 条目 min-height 58px / padding 8 / 头像 34px / grid 三列（带相对时间戳），当前是 48px / padding 0 10 / 头像 28px / 无时间戳。0.78.1 未提取条目高度，0.18 是唯一锚。
3. **会话流行距偏差大**：0.18 行间 margin-bottom 22px，当前 gap 8px——视觉密度差近 3 倍，是最显眼的整体差异。
4. **0.78.1 已改、不按 0.18 修的项**（以 RE-ui-shell/RE-theme 为准）：侧栏头部按钮形态（New chat/New section 文本按钮）、用户反转气泡+右对齐+botTint、corner-ring/corner-main 角标族、市场 tabs 与 Back、agent-item 圆角 12、titlebar 38px、prose 行高 22/padding 7。当前实现这些方向都对。
5. **当前多出/缺失的条件显示**：0.18 侧栏列表有 loading/empty/all-hidden/error 四态（当前全缺）；0.18 composer 空态显示 mic 钮、有负载时 mic+send 并存（当前无 mic，send 有停止态——停止态是 PAB R19 决定，0.18/0.78.1 均无）。

---

## 一、差异清单（按页分组，修复粒度）

标记说明：`[78]` = 0.78.1 已确认改动（以 0.78.1 逆向结论为准，0.18 值仅底图）；`[78=]` = 0.78.1 覆盖且当前实现已符合；无标记 = 0.18 规格适用。

### A. bot 列表 / 侧栏

| # | 组件 | 0.18 规格 | 当前实现 | 修复建议 | 0.18 锚点 |
|---|---|---|---|---|---|
| A1 | 头部高度/结构 | header 50px、padding 0 12px 0 16px、border-bottom stroke-tertiary；内含图标按钮行（Broadcast megaphone / Agent network / New plus，SandIconButton sm） | `sidebar-head` 38px（titlebar-block）放 GrokMark，下面独立 `sidebar-menu`（新建 Bot/市场 两行 32px） | `[78]` 0.18 的 Broadcast/Network 已删（grep 0），0.78.1 header = "New chat"/"New section" 文本按钮。当前"新建 Bot"菜单行方向正确；GrokMark 品牌位 0.18/0.78.1 头部均无（0.78.1 未登录封面才有 logo），建议移除或仅留拖拽区 | `recovered/features/conversation/workspace/view.css:9`；`sidebar.tsx:123-142` |
| A2 | 搜索入口 | SandButton md secondary，icon=search，宽 calc(100% - 24px)，margin 4px 12px，inset .5px border-weak 阴影；容器 ≤130px 时隐藏 | 无搜索入口 | MVP 范围外（BRIEF D12② 明确去 Search），不修；登记缺口 | `view.css:156-170`；`sidebar.tsx:139` |
| A3 | 列表容器 | `sand-agents-list` grid、row-gap 0.75 spacing、padding **4px 12px 24px**、overflow auto | `bot-list` padding 8px、gap 2px | 对齐 0.18：padding 4 12 24（左右 12 给条目 hover 底色留边） | `view.css:17` |
| A4 | 条目高度 | min-height **58px**、padding **8px** | height 48px、padding 0 10px | 改 min-height 58 / padding 8（0.78.1 无此值，0.18 是唯一锚） | `view.css:48` |
| A5 | 条目布局 | grid `34px minmax(0,1fr) auto`、gap **9px**；trailing 列 = 相对时间 + 状态点 | flex、gap 10px（token）、无 trailing | trailing 加相对时间戳（见 A8）；gap 9↔10 差异可留 | `view.css:48`；`sidebar.tsx:279-282` |
| A6 | 头像尺寸 | **34px**（条目）/ 28px（chat header）/ 30px（账号行） | 28px | 条目头像 28→34 | `view.css:51` |
| A7 | 条目圆角 | var(--cursor-radius-lg) | 12px（--sand-agent-item-radius） | `[78=]` 0.78.1 常量 agent-item-radius=12（RE-ui-shell §2.1），不改 | `view.css:48` |
| A8 | 相对时间戳 | `<time>` now/Xm/Xh/Xd，xs 号 tertiary 色，右对齐 trailing | 无 | 补：更新时间相对显示于条目右侧 | `sidebar.tsx:99-106,280` |
| A9 | 副行内容优先级 | `Draft: X` > `Waiting for you: Y` > lastMessage；working 时整行替换为 SidebarAgentActivity（accent 色） | 等待批准/回复中/失效/preset·连接器数 | 产品文案已本地化（PAB 裁决），结构等价；可考虑 working 时副行用 accent 色呼应 | `sidebar.tsx:210-214,275-277`；`view.css:61` |
| A10 | hover/active | hover bg-secondary（ghost-hover）；active = data-active + `--sand-agent-selected-fill`（ghost-selected） | hover --sand-bg-hover；selected --sand-bg-active | 语义等价（token 层对齐），不改 | `view.css:49`；token 映射 `runtime-theme-token-installer.ts:19` |
| A11 | 状态角标形态 | expanded 布局：running=corner dot（8px accent）、blocked/unread=trailing 点（warning/neutral 色）；collapsed/pinned：一律 corner dot 8px（pinned 10px），right:2 bottom:2 | ring=running 旋转弧；warn dot=待批准；accent dot=未读；off=失效；main=star | `[78=]` corner-ring/corner-main 是 0.78.1 角标族（RE-ui-shell §3.1），旋转环合法。0.18 未读点=**neutral 灰**（info），当前=accent 蓝——按 0.78.1 无细化值，可保留；登记差异 | `sidebar-agent-status.ts:88-125`；`view.css:66-84` |
| A12 | pinned 区 | 独立 `sand-agents-pinned` 分组容器 + data-pin-slot-id 拖拽排序 | 无 pin/拖拽（排序冻结 R9 是 PAB 裁决） | MVP 范围外，不修；主 bot 置顶+分隔线即其简化形态 | `sidebar.tsx:222-249,459` |
| A13 | 折叠态 | 容器查询 ≤130px：条目只留 34px 头像列、min-height 44、padding 5；header 只留最后一个按钮；搜索隐藏；折叠宽 88px | 无折叠态 | MVP 范围外；登记 | `view.css:91-96`；`sidebar-layout-state.ts:30-34` |
| A14 | 列表空/错态 | 四态：loading "Connecting to your computer…" / empty "No saved agents yet." / all-hidden + Show Hidden Bots 按钮 / unreachable "Can't reach your computer" + Retry | 无任何列表态（空列表直接空白） | **补**：至少 empty + error（含重试）两态；本地引擎场景 loading 态可映射"正在连接引擎" | `recovered/features/roster/status.tsx:15-47` |
| A15 | 市场入口位置 | footer：`sand-agents-sidebar__plugins` 行（min-height 38px、pill 形 md secondary、leadingIcon=plug、hover bg-secondary、外层 padding 4px 8px），文案 "Plugins" | 头部 menu 第二行（"市场" storefront icon，32px 菜单行） | `[78]` 0.78.1 市场入口文案 Marketplace、位置在侧栏（RE-ui-shell §3.1 diff 行：header 改 section 管理 + Marketplace/Import Bot 入口）。0.78.1 未细化 header 还是 footer——维持当前头部位置可接受，建议文案/图标按 0.78.1（storefront 图标 0.78.1 icon 表里有） | `production/production.css:47-63`；`production/ProductionRenderer.tsx:3453` |
| A16 | 账号 footer | `sand-agents-sidebar__footer`（padding 2px 12px 12px）：账号行 40px、头像 30px（initials、accent 底）、名字 base/600、菜单 Sign in/Settings/Sign out | 无账号 footer | MVP 单用户本地引擎无账号概念（PAB 裁决），不修；登记 | `production.css:67-153` |
| A17 | 侧栏宽度边界 | 默认 280、240–400、可折叠 88 | 默认 280、240–400、不可折叠 | `[78=]` 数值一致（RE-theme §3 同） | `sidebar-layout-state.ts:30-34` |
| A18 | 调宽手柄 | 绝对定位 right:-6px、宽 12px、透明、col-resize、touch-action none | `.resizer` right:-3px 宽 6px | 行为等价；hot zone 12px 更好点，低优先 | `view.css:87-89`；`sidebar.tsx:302-346` |
| A19 | 滚动条 | 原生（无自定义 scrollbar 规则） | 原生 | 一致，不改 | 全仓 grep scrollbar=0（computer 壳除外） |

### B. 会话流

| # | 组件 | 0.18 规格 | 当前实现 | 修复建议 | 0.18 锚点 |
|---|---|---|---|---|---|
| B1 | 行间距 | `.sand-transcript-row` margin-bottom **22px** | `.chat-col` gap **8px** | **改 22px**（最大视觉密度差异；时间分隔行同 22px margin） | `view.css:109,194` |
| B2 | transcript 容器 | padding 28px max(30px, calc((100% - 690px)/2))，即内容列 690 居中 | padding 16 24 24 + max-width 708（--dsh-chat-content-width）居中 | 近似；可把内容列改 690 或维持 708（0.78.1 无容器宽值），低优先 | `view.css:107` |
| B3 | 气泡形态 | 单一样式：max-width min(**88%**, 640px, 100%-82px)、padding 8px 12px、radius 18、bg bubble-agent（浅 #eee/暗 #262626）、无边框 | user/assistant 两态：user 右对齐 + bubble-user 反转底 + opposed inset；assistant 左 + bubble-agent；padding 7 12（prose token）、radius 18、max-width min(640px,100%) | `[78=]` 用户反转气泡/右对齐/botTint 是 0.78.1 确认特性（RE-theme §2/§4：specific-bubble、"grok 标志性反转气泡"、opposed-inset token）；padding 7/行高 22 也是 0.78.1 prose token。不改；88%/100%-82px 上限是 0.18 值，可忽略 | `view.css:118-126`；token 证据 `computer/shell/view.css:4`（--sand-fill-bubble-user #070707/#5a5a5a） |
| B4 | 气泡文字色 | —（单一样式） | user 气泡内 label-primary 在 light 下被 `[data-message-bubble]` 覆写为 #fcfcfc（`theme/dsw.css:57`） | 已处理，非 bug；登记验证结论 | — |
| B5 | 流式指示 | 空文本流式=三点气泡（padding 10 12、radius 14、点 5px）；回合级 running=底部 typing indicator（同款） | thinking 三点气泡（56px 宽、6px 点、breathe 动画）；streaming 气泡原位增长 | 等价；点径 5↔6、圆角 14↔18 差异随 0.78.1 prose token（radius 18）可保留 | `view.css:189-190,290-291`；`transcript.tsx:226-232,796` |
| B6 | tool-call 行 | 卡片式：`.sand-outline-item` 1px stroke-tertiary 边框、radius 9、行 min-height 34、padding 7 9、图标 16px（pending=loading 旋转 0.9s、failed=x-circle 红、else=wrench tertiary）、name 11px/600、preview 10px tertiary mono 截断、chevron 6px 边框旋转（收 -45°/展 45°）；展开 detail padding 0 10 10 25、pre max-height 220 | `.tool-row` 无边框裸行：行 padding 2 6、radius 8 hover、name sm/500 secondary、summary mono、展开 `<pre>` bg-layer-3 radius 10 max-height 240 | **改**：tool 行加 1px 边框 + radius 9 卡片壳（0.18 是描边卡片不是裸行）；图标映射一致（loading/x-circle/wrench ✓）；chevron 语义当前用 aria-expanded 无视觉箭头，补 6px 旋转箭头 | `view.css:249-262`；`transcript.tsx:571-598` |
| B7 | thinking 行 | 独立 Thinking 行（thinking-medium 图标 accent 色、"Thinking" 11px/600、可展开） | 无独立 thinking 行（仅三点气泡） | 可选补充；低优先 | `transcript.tsx:600-614` |
| B8 | 审批卡 | inline 卡：maxWidth 560、gap 8、padding **14px 16px**、bg elevated、border 1px cursor-border-secondary、radius **10**、shadow 0 12px 28px rgba(0,0,0,.25)、font 13px/1.4；strong 标题；按钮行 flex-end wrap gap 8：主钮填充色（Always allow，浅色 #c5f467 系）padding **6px 9px** radius **6**，次钮 #353535/#494949 同规格；已决后整卡替换为 outcome 一行文本（padding 8 0、secondary 色）；dock 居中 padding 12 16 | `.approval-card`：min(80%,560px,100%-82px)、padding 12 14、radius 14、gap 6、bg layer-1、border l3、shadow inline；按钮 `.btn` 28px 高 radius 8；终态=status 文本留在卡内 | 改：radius 10、padding 14 16、按钮改小尺寸（6 9 / radius 6）形态；已决卡建议整体收成 outcome 单行（0.18 消失式反馈）。按钮文案/数量是产品裁决（R4 仅批准这一次），保留 | `recovered/features/permissions/local-tool/view.tsx:141-160`；`view.css(local-tool)` outcome/dock 规则 |
| B9 | 审批入口位置 | LocalToolPermissionDock 悬浮居中于 composer 上方（不在 transcript 内）；旧 permission-request 卡仅渲染 title 一行（retired） | inline 挂对应 callId 行下 + 缺 callId 时流末尾 + composer 位 36px 提示条 | `[78]` 0.78.1 local-tool-permission 是 transcript 卡（RE-ui-shell §3.2 send-message 卡族），当前 inline 方案更贴近 0.78.1；提示条为本产品补充（R1），保留 | `local-tool/view.tsx:163-171`；`cards/permission-request/view.tsx:73-87` |
| B10 | composer 外框 | dock padding 8px max(24px,(100%-700px)/2) **18px**；shell padding **9px**、bg input-surface、border 1px stroke-secondary、radius **16**、box-shadow-sm；输入 min-height **48px** | `.composer-wrap` padding 0 24 16；shell padding 8 8 8 14、radius 18、textarea min-height 20 field-sizing | 改：shell padding 9、radius 16、输入区给一个更接近 48 的静息高度（或维持 field-sizing 但加 min-height ≥44）；dock 底距 16→18 | `view.css:293-315,303` |
| B11 | composer 动作行 | 左：attach 圆钮 30px（plus、secondary 底）；右：空态=mic 圆钮 30px（有负载时 mic+send 并存）、send=submit 圆钮 30px（accent 底 sand-fill-primary、on-color 图标）、disabled opacity .4；mic↔arrow-up 图标随负载切换（同一 send 钮内） | 无 attach/mic；单一 send 圆钮 30px（primary 底）；running 时换 stop 方形图标钮 | attach/mic 属 MVP 范围外（语音/附件未实现），登记；**send 钮尺寸/形态一致 ✓**；停止态是 PAB R19 裁决（0.18/0.78.1 无 stop），保留但登记为有意偏离 | `view.css:322-329`；`composer.tsx:199-216` |
| B12 | placeholder | "Ask anything, or drop a file." / 回复态 "Message {agentName}" | `给 {name} 发消息` | 等价（本地化），不改 | `composer.tsx:71`；`ProductionRenderer.tsx:3521` |
| B13 | chat header | 独立 51px 头：identity=avatar 28px+名字+"Working" small（**按钮**，aria "View agent settings" 开 info-pane）、右侧 controls（computer/channels） | 并入 38px titlebar：名字+锁形 meta+两个 icon-btn | 0.78.1 ChatHeader 延续（RE-ui-shell §3.2 "View agent settings"→info-pane）。**当前 38px 合并是 PAB R0 裁决**；若追视觉还原度，建议恢复独立 ≥51px 会话头（avatar+名字+Working），identity 可点击开 pane | `view.css:99-105`；`chat-header.tsx:29-39` |
| B14 | 时间分隔/未读线 | time-separator 居中 11px tertiary（margin 22）；unread divider：两侧 1px 线 + accent 文案 "N new messages" | 无时间分隔/未读线（有"新消息"胶囊） | 低优先补充；未读线对多 bot 场景有价值 | `view.css:194-196`；`transcript.tsx:701-702` |
| B15 | 代码块 | padding 11 12、radius 8、1px 边框、mono 11px/1.55、copy 钮绝对定位 top 6 right 6（悬浮显现） | `.md pre` padding 10 12、radius 8、边框 ✓、无 copy 钮 | 补 copy 按钮（hover 显现，0.18 有 Copied 1.2s 反馈）；字号随 markdown 层可留 | `view.css:138-141`；`transcript.tsx:435-456` |
| B16 | 消息 hover 动作 | hover 显示 Reply/更多菜单（toolbar absolute right 0 bottom -30，opacity 过渡） | 无 | MVP 范围外；登记 | `view.css:127-134`；`transcript.tsx:196-224` |

### C. 设置 info-pane

| # | 组件 | 0.18 规格 | 当前实现 | 修复建议 | 0.18 锚点 |
|---|---|---|---|---|---|
| C1 | pane 尺寸 | 默认 320、**280–480** 可调、`--sand-info-pane-width` | 默认 320、280–**400** | 放宽 max 到 480（与 0.18 边界一致；0.78.1 无新值） | `sidebar-layout-state.ts:36-45` |
| C2 | 头部 | `sand-info-pane__top`：高 38（titlebar-block）、padding-top 0、padding-right calc(12px + 窗口控件 inset)、padding-left **12**、flex 两端、gap 8；关闭钮=chevrons-right 图标钮 md，aria "Close details" | `pane-head`：高 38 ✓、padding 0 8 0 16、avatar 24+名字+badge+x 钮 | `[78=]` 高度/拖拽语义一致；左 padding 12（当前 16）、关闭图标 0.18 用 chevrons-right（当前 x）——按 0.18 改 chevrons-right 更贴 | `ProductionRenderer.tsx:352-360`；utility 值 `computer/shell/view.css:4`（sand-14kp3v7/sand-j9b1aj/sand-f18ygs） |
| C3 | 内容结构 | section-heading（"Name"/"Title"/"Description"）+ 行内可编辑 input（blur 提交、Esc 还原）；Title 仅 !isGroup 且有值时显示；Notifications switch 卡（!isGroup）；错误行 aria-live | 只读 pane-section（配置/模型/主 Bot 三节，锁形 row + select + 按钮） | **有意偏离**：D11 锁定只读是 PDC 裁决（MVP 无编辑）。0.18 的 Name/Title/Description 可编辑字段结构留作后续；登记不修 | `recovered/features/agent-info/settings/view.tsx:53-70`；`view.css:2-11` |
| C4 | 输入件样式 | input：bg-input、1px stroke-secondary、radius **4**、min-height 30、padding 6 8；textarea min-height 72；focus outline 2px accent offset 2；switch：pill min-width 48、checked accent-secondary | select：radius 10、高 32、bg layer-2 | 只读态无输入件；将来开编辑时按 0.18 值（radius 4/30px） | `agent-info/settings/view.css:2-11` |
| C5 | 模型选择 | 0.18 无（agent settings 无 model 字段；模型设置在 settings overlay general/model） | pane 内 select + 状态行 | 产品新增（PDC D8），无 0.18 对应；0.78.1 settings 有 model 节（68 id 含 model）。保留 | —（0.78.1：RE-ui-shell §1.3 ss 表 model） |
| C6 | 头像编辑入口 | "Edit agent avatar" SandButton sm secondary + AvatarEditorView | 无 | MVP 范围外；登记 | `ProductionRenderer.tsx:3560-3568` |
| C7 | pane 互斥 | settings/group/routines/channels/computer 五 pane 互斥（开一个关其余），全部条件渲染 | 单一配置 pane + 浮层态 | 当前单 pane 已覆盖 MVP；登记结构差异 | `ProductionRenderer.tsx:3548-3617` |

### D. 市场

| # | 组件 | 0.18 规格 | 当前实现 | 修复建议 | 0.18 锚点 |
|---|---|---|---|---|---|
| D1 | 容器形态 | 模态对话框：min(820, 100vw-32) × min(620, 100vh-32)、radius 14、深底 #202020、阴影 0 24 80 | 主列整页（侧栏保留） | `[78]` 0.78.1 也是 overlay（plugins/overlay lazy，RE-ui-shell §3.3），但当前"占主列"是 PDC P1 裁决（审批黄点可达）。保留整页，登记 | `recovered/features/plugins/overlay/browser.css:2` |
| D2 | 标题/Back | 无 Back（模态内切换列表/详情）；标题 h2 "Plugins" | titlebar 内 back-btn + "市场" | `[78]` 0.78.1 有 Back（iH8pgl）+ 标题 Marketplace（Zt5PUS）——当前形态贴 0.78.1 ✓ | `browser.tsx:206-212` |
| D3 | tabs | Marketplace / Yours 两 tab（role=tablist） | 全部 / 已安装 两 tab | `[78]` 0.78.1 = plugins / bots（bot 模板市场）。MVP 无 bot 模板，"全部/已安装"是对 plugins 侧 installed 过滤的合理子集；文案建议对齐 0.78.1 语义（插件类），保留结构 | `browser.tsx:208-211` |
| D4 | 搜索框 | flex-1、bg #292929、1px #444、radius 6、内 padding 0 9、icon ⌕、placeholder "Search plugins"、type=search | `.m-search` 高 32、radius 10、bg layer-3、focus 边框 | 形态近似（token 化）；可把 radius 收到 6–8 更贴 0.18。低优先 | `browser.css:7-8`；`browser.tsx:216-219` |
| D5 | 过滤菜单 | Filter 按钮 + Type(connectors/skills)×Ownership(team/public) 两组 menuitemradio | 无过滤器（目录源下拉替代） | MVP 简化；登记 | `browser.tsx:440-480` |
| D6 | 列表行 | grid `36px 1fr auto`、gap 12、margin-bottom 7、padding 12、按钮壳 #303030/#454545/radius 6；图标位 36px（◇/⌁/⚡ 字符）；名称 strong + 描述 + 状态 small（#aaa）；右 chevron › | `.m-row` flex min-height 56、padding-right 8、hover 高亮（无按钮底壳）、monogram 32px、右侧状态/安装钮 | 改：行加 12px 内边距与 7px 行距节奏（当前 gap 2 过密）；0.18 行是**按钮卡**（有底色壳），当前是 hover 高亮行——0.78.1 无细化值，按 0.18 加浅底壳或保持 hover 行（择一，建议保持 hover 行但补 padding/行距） | `browser.css:10-12`；`browser.tsx:226-235` |
| D7 | 状态行文案 | installed="Added"/publisher；server 状态 Connected/Starting/Disconnected/Error/Authentication required/Disabled by team admin；workflow Enabled/Disabled | 已安装（success）/仅浏览 tag/无法安装/安装中 | 语义覆盖（MVP 无 server/workflow 类）；保留 | `browser.tsx:416-429` |
| D8 | 详情页 | article padding 24、header=Back+标题+状态 small、描述 p（max-width 620、#bbb）、动作区（Add 仅未装、Authenticate 仅 needsAuth、Uninstall/Remove 按团队策略、Edit Values 已装且有字段） | `.m-detail`：头（monogram 40+标题+包名版本）、描述、动作卡（安装/已装/仅浏览三态）、说明 markdown | 结构等价（0.78.1 详情含 Readme/skills 列表，RE-ui-shell §3.3）；当前说明 markdown 已对应。保留 | `browser.css:13-16`；`browser.tsx:525-543` |
| D9 | 安装钮状态 | busy 禁用；表单型安装（PluginSetupForm 字段向导） | 安装中 progress + 重试 | MVP 无字段插件；登记 | `browser.tsx:509-524,606-643` |
| D10 | 空态 | marketplace 不可用 "The marketplace isn't available right now. Check back later."；yours 空 "Nothing installed yet. Find plugins in the Marketplace tab."；过滤空 "No plugins match the current filters" | 无法加载市场+重试 / 还没有安装任何连接器+浏览全部 / 无匹配+清除搜索 | 语义覆盖 ✓；文案可对齐"稍后再来看看"口吻，低优先 | `browser.tsx:431-436` |
| D11 | Private 技能区 | yours tab 底部 Private 分节（行 40px 图标位、radius 16、6% 主色底、On/Off switch） | 无 | MVP 范围外；登记 | `browser.css:78-120`；`browser.tsx:237-256` |
| D12 | 私有技能行 | flex、icon 40×40 radius 6、开关仅 workflow 来源 | — | 同上 | `browser.tsx:240-254` |

### E. 顶栏 / 全局

| # | 组件 | 0.18 规格 | 当前实现 | 修复建议 | 0.18 锚点 |
|---|---|---|---|---|---|
| E1 | 窗口控件 | Linux 自绘：右上 fixed、高 52（--sand-titlebar-block 52? 实际 titlebar-block 38、窗口控件区 52）、钮 36×28、radius 8、gap 2、hover 8% 主色底、close hover 红底；win32 走 TitleBarOverlay；darwin 只有拖拽区 | WCO 原生绘制（R16 裁决） | `[78=]` 0.78.1 AX 树同为三按钮；原生 WCO 是 Electron 推荐做法，保留 | `recovered/features/window-chrome/view.css`（sand-window-controls 段）；`view.tsx:38-50` |
| E2 | 顶部拖拽区 | `sand-cover-drag` fixed 高 52px z-4999 | titlebar 38px drag + boot-cover drag | 高度 38（0.78.1 titlebar-block 38 ✓）；拖拽覆盖一致。不改 | `window-chrome/view.css:3-10` |
| E3 | 字体渲染 | :root font-synthesis none、font-family sans（XVF）；`:root color-scheme light dark`；暗色 tone 常驻 style 注入 | theme.tsx 注入 data-theme + XVF/XMono/cursor-icons 本地字体 | 机制一致（0.78.1 RRn 运行时注入同构）；补 `font-synthesis: none` 防伪粗体，低优先 | `production/production.css:10-19` |
| E4 | 根布局 | html/body/#root 100% overflow hidden；shell color text-primary bg-editor | 同 | 一致 | `production.css:17-25` |
| E5 | 暗色边缘 | 边框 .5px（sidebar border-right .5px border-weak；palette .5px stroke-secondary）+ shadow-ring | 边框统一 1px（token 层） | 0.18 大量用 .5px 细边（hidpi）；可在 token 层把 L1/L2 边框降到 .5px 提精致度，中优先 | `production.css:43`；`view.css:8` |

---

## 二、条件显示规则（0.18 源码逐条）与当前实现对照

| 规则 | 0.18 条件 | 当前实现 | 判定 |
|---|---|---|---|
| 登录封面 | 未登录 → AccessGate + SignInLanding 全窗封面；onboarding 登录后首启 | boot 未就绪 → BootCover（本地引擎启动态） | 等价替换 ✓（登录墙→引擎墙，R15 裁决） |
| 侧栏头部协作钮 | onBroadcast/onOpenNetwork 传入才渲染（0.78.1 已删） | 无 | `[78]` 一致 ✓ |
| 搜索钮 | 未折叠且 onOpenSearch 存在 | 无 | 范围外，缺 |
| 条目 trailing 状态点 | expanded 且 marker!=null（blocked→warning/unread→neutral） | 常驻角标 | 形态差异（见 A11） |
| 条目 working 副行 | isWorking 时副行替换为 activity | running→副行"回复中" | ✓（色差异见 A9） |
| pinned 分组 | orderedPinned>0 渲染分组容器 | 主 bot 恒置顶+分隔线 | 简化 ✓（R9） |
| 折叠态 | sidebarLayout.isCollapsed（≤130px 容器查询） | 无 | 缺（范围外） |
| Hidden Bots 行 | hiddenAgents>0 且 visibleAgents>0 | 无 | 缺（范围外） |
| 会话头 Working 小标 | agent.isRunning | titlebar meta 无运行态 | **缺**：titlebar 可加运行中状态（与 A9/B13 联动） |
| 会话头 identity 按钮 | onToggleSettings 存在→整 identity 变按钮开 info-pane | icon-btn 开 pane | 交互等价，形态差异（B13） |
| transcript 空流式 | isStreaming && text 空 → 三点气泡 | thinking 三点气泡 | ✓ |
| 回合运行指示 | isAgentRunning → 底部 typing indicator | thinking 气泡（无底部指示） | 等价 ✓ |
| 排队/失败发送 | delivery=queued→Cancel 行；failed→Resend/Delete；离线编发→"Sent while offline · 时间" | 发送失败保留草稿+错误行 | 语义差异但覆盖（GU-2 裁决） |
| 未读分隔线 | unread-divider entry | "新消息"胶囊 | 形态差异（B14） |
| 审批挂起 | pending → 卡片；已决 → outcome 单行替换 | pending 卡内 status 行 | **差异**（B8：建议已决收成单行） |
| Always allow 降级 | 团队策略 ceiling 阻止 → 钮禁用+tooltip | 无 always 选项（R4 仅一次） | 产品裁决 ✓ |
| composer 空态 | 无负载→mic 钮（有负载→mic+send） | 无 mic | 缺（范围外） |
| composer 禁用 | disabled（busy/client 空）→ 全禁 | readOnly→横幅替代；offline→发送禁 | 等价替换 ✓（D5/U-23） |
| 附件区 | draft.attachments>0 → chips | 无 | 缺（范围外） |
| 拖放遮罩 | isDragOver → 虚线遮罩+badge | 无 | 缺（范围外） |
| info-pane 开合 | agentSettingsOpen && !isGroup && bridge && controller；与 group/routines/channels/computer 互斥 | paneOpen && page=chat && selected；<424 浮层 | 等价简化 ✓ |
| 市场列表空态 | tab×query×filter 三维决定文案 | sources/error/empty/query 四态 | ✓ |
| 市场安装钮 | item.busy 禁用；装完 Add→(Uninstall/Remove) | installing 占用全局单槽禁其他 | 语义差异（单任务安装是产品行为）✓ |
| Private 区 | tab=yours 且（无过滤 或 有可见技能） | 无 | 缺（范围外） |

---

## 三、局限

1. **0.18 重构仓本身是恢复产物**：部分样式来自带 @evidence 注释的重建 CSS（workspace/view.css、production.css），非原始 bundle 逐字节；`sand-info-pane__section-heading/section-content`、`.sand-message[data-role]` 变体在恢复 CSS 中无规则（原文在未收录的 stylex 生成块），这些元素的 0.18 视觉值不可考，只能给类名与挂载结构。
2. **0.78.1 只有静态证据**：RE-ui-shell L3 明言登录墙后界面无运行态截图；本报告引用的 0.78.1 结论（corner-ring/corner-main 形态、market tabs、header 按钮文案）均来自 bundle 文案/类名 grep，未经 DOM 核验。corner-main 的具体视觉形态（星形与否）未知——当前用 star 图标是实现自由。
3. **不可变 CSS 是单行大文件**：`computer/shell/view.css:4` 的 utility 类值用脚本抽取，个别类（如 `.sand-9c3od3` 宽度公式）只找到一条消费者证据；不排除存在未被抽取的同名变体。
4. **0.18 的 XVF 字体、cursor-icons 连字与 0.78.1 同源但版本可能不同**：本审计未比对两版字体差异（RE-theme L6 已覆盖版权约束）。
5. **0.18 气泡 user/assistant 无分化**是恢复 CSS 的结论（单一 `.sand-message` 规则 + 无 bubble-user 消费者）；不排除原始 0.18 存在未恢复的 user 变体样式，但 0.78.1 已确认反转气泡，该不确定性不影响修复方向。
6. 未审计：notice 卡视觉（0.18 `sand-notice` utility 串无展开值）、timeline-event 卡、reaction/线程系（MVP 范围外）。
