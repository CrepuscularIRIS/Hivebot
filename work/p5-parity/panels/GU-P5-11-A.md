seat: A
verdict: REVISE
confidence: medium
findings:
- [HIGH] app/ui/renderer/plugins/bots/sidebar.css:26-27 + Sidebar.tsx:206-208 — 折叠态「市场」钮没有可读名称：`.menu-row > span { display:none }` 把唯一的文字「市场」从无障碍树里拿掉了，`<Icon>` 本身是 aria-hidden（theme.tsx:32），按钮上也没有 title 或 aria-label。结果是读屏只念出「按钮」，鼠标悬停也没有提示。这正是评判点②「可达名」要查的东西，而条目、collapse 钮、星标都已经补了名称，只漏了这一处 — 证据: vfy-sidebar-collapsed-{light,dark}.png 里 (38,57) 只剩一个店铺图标；`grep aria-label|title` 在 Sidebar.tsx:206 处为空 — 建议: 给 market 钮加 `aria-label="市场" title="市场"`（一行），或者折叠态把 span 改成复用现成的 `.sr-only`（sidebar.css:22），不要用 display:none。补一条 e2e：78 宽下 `getByRole('button',{name:'市场'})` 能定位到。
- [MEDIUM] sidebar.css:7 vs 折叠规则 :24 — 收起和展开时，头部高度不一样（展开 12+24+12=48，折叠 4+24+4 被 min-height 撑到 38）。所以点下 collapse 后，按钮在指针下面上移 5px、左移约 2px，整个列表上跳 10px — 证据: expanded 图中 collapse 钮中心约 (28,23)、市场图标 y≈67；collapsed 图中分别是 (26,18)、y≈57。按钮挪动后指针仍在 24px 的热区内，连续点击不会失效，所以不算 blocker — 建议: 不在本任务改。跳动的根源是 titlebar 还停在 38 的 fallback 档；P5-16 换成 44/52 后，展开态由 min-height 主导，跳动应该自然消失。请在 P5-16 验收里加一条：两种状态下 collapse 钮中心 y 相等，误差 ≤1px。
- [MEDIUM] Sidebar.tsx:201 — 结果数的 live region 是条件挂载的（`q!=='' && shown.length>0` 时才渲染），挂载时内容已经在里面，Chromium 加 NVDA/Orca 经常不播报。另外无匹配的 `role=status`（:219）和它是两个节点交替出现 — 证据: 代码结构如此；VERIFY 只断言了节点存在，没有用读屏实测 — 建议: 让 `<span class="sr-only" role="status">` 在搜索态常驻，只改它的文本（「N 个结果」或「无匹配」）。不阻塞。
- [LOW] sidebar.css:19-21 — 原位输入框没有边框和底色，聚焦时也没有 focus 样式（`outline:none`），只能靠 ⌕ 图标和光标认出这是输入框。实际影响不大：键入后立刻就有结果过滤，可以作为反馈 — 证据: vfy-sidebar-search-light.png 头部只有「⌕ ALPHA ✕」 — 建议: 以后要补的话，给 `.sidebar-search:focus-within` 加 1px 底线或 `--dsw-alias-interactive-bg-hover` 底色。本轮不必。
- [LOW] 折叠星标 — 现在是灰星（icon 色）衬在 sidebar-fill 圆片上；R2 L89 要求 main 徽标是 filled star、`--sand-bg-yellow-bright` 圆片、on-primary 色。这属于角标族几何，已经归 P5-16，本任务只负责把它挪进角落，这一点做对了 — 证据: collapsed 图 (53,98) — 建议: P5-16 的角标断言要覆盖折叠态。
- [LOW] R2 证据本身有歧义 — R2 L118 写的是「折叠=grid 首列 0」，A15 L47 又写折叠态是「rail icon 钮」，而 aria 文案是 "Toggle compact sidebar"。0.78.1 可能有「隐藏到 0 宽 + rail」和「≤130 紧凑」两种态，定稿把它们并成一种 78 宽的紧凑 rail。按 aria 文案的字面读法站得住，但要明确标成待 R3 确认 — 建议: 在 P5-41 并排对照时，逐条把这一项标为「未验证」。

## 逐问评判

① **展开态与 0.78.1 的差距：可接受。** 能按数值核对的都对上了：头部 padding 12/16、gap 8、组内 gap 2、24×24 r6、三钮同组贴左（R2 L26-38 结构）。剩下的差距都有记录、有去向：头部 48 对 52（titlebar 档，P5-16）、条目 58 对 54（A4，P5-16）、市场文字行对 footer 药丸（A15，P5-16）、没有 Tasks 钮（我们没有这个功能）。从截图看，头部三枚灰色 icon 重量合适，没有抢列表的风头，亮暗两套对比度都正常。

② **折叠态 78px 布局成立。** 条目 54 宽、左右各留 12，选中块 r12 居中；头部 [◧][+] 总宽 50，在 78 里居中，左右余量 14，没有拥挤；星标收进头像右上角，和右下角的状态点不冲突；条目有 `title=名字`，`aria-label` 里带「主 Bot」和状态。唯一缺口是上面的 HIGH：市场钮没有名称。A13「静息态可见」的口径我认为按 BRIEF 预判保留 in：这是用户主动进入、并跨重启保持的常用态，不属于边缘态。

③ **三处偏离的理由站得住。**
- 搜索框原位替换、而不是 0.18 的全宽按钮：0.78.1 实测是头部 icon 加命令面板，两种做法都不是逐字复刻；原位替换的列表零位移，Esc 回来也不跳，是两害取轻。
- 折叠只走按钮、拖拽限制在 240–400：和 R2 A17「240–400 ✓」以及 aria "Toggle compact sidebar" 一致，也保住了 U6 既有断言；@container 断点仍然独立生效，VERIFY 测过 130/131。
- 78 取代 88：88 是 0.18 的值，R2 明确说「无固定 88」；78 是推导值，做成了常量，R3 回来后改一处就行。

④ **没有必须回退的视觉问题。** 唯一要求修改的是 HIGH 那一项，改动一行，补一条断言就能闭环。

reverse_take: 三个月后最可能出问题的地方是 P5-16 把 titlebar 改到 44/52、条目改到 54 时，折叠态头部和条目的几何被连带改坏（当前的 visual-sidebar 断言写死了 padding 4 和 38 的 min-height 推导）。更稳的做法是现在就把断言改成「两种状态下 collapse 钮中心 y 相等」和「折叠条目 = 54 且水平居中」这类不变量，不再断言具体像素。
