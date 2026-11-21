# RE-visual-078-values · 0.78.1 视觉数值与动效（AUD「0.78.1 值」列）

日期：2026-11-03 · R2（p5-parity BRIEF §10.2）· 方法：纯静态分析（CSS 规则拆分 + bundle 字面量交叉引用），未运行任何目标代码，HOME 未触碰
对象：`/dev/shm/grok-re/0.78.1/app/dist/renderer/assets/index-Dh7EWA8t.css`（766,413B stylex，单行，已拆为 `evidence/078-css-rules-split.txt` 8,871 条规则）+ `index.eager-app-iGTgHP_Q.js`（4.5MB，下称 APP）+ 市场 lazy chunk `chunk-view-kcheXZ65.js`（186KB）+ 审批卡 lazy chunk `chunk-view-Bbgcfm9R.js`（28KB）
行号引用 = `work/p4-ui/RE-visual-audit.md`（AUD）。class 值证据 = `evidence/078-css-rules-split.txt`；JS 结构证据 = APP/chunk 内偏移（下文 `APP@offset`）。

## 结论（先行）

1. **AUD 的 [78] 项全部有了具体值**（下表），可直接当 U3/U4 规格。其中有 **3 处修正了 RE-ui-shell/AUD 的旧判读**：
   - ①侧栏头部不是「New chat / New section 文本按钮」，而是 **icon 按钮行**（折叠钮 + Tasks 钮 + 搜索钮 + New Bot plus 钮/菜单）；
   - ②市场入口文案不是「Marketplace」，而是 footer 的 **"Connect apps" 药丸**（`grid-plus` 图标 + 已连接 app logos + 计数）；
   - ③未读角标颜色 0.78.1 = **accent 蓝**（status `info` → `--sand-text-accent-primary`），AUD A11 里「0.18 是 neutral 灰」的疑虑解除：当前实现的 accent 蓝才是 0.78.1 行为。
2. **两个非 [78] 项被 0.78.1 证据推翻**，U3 落地时不要按 0.18 修：
   - B6 tool-call 行：0.78.1 = **无边框裸行**（radius 8、高 28、padding 7/8-12、hover 7% 底），不是 0.18 的 1px 描边卡片；chevron 是 `chevron-right/down` xs 图标切换，无 CSS 旋转。
   - B8 审批卡：0.78.1 = elevated 卡壳 **radius 24**（不是 0.18 的 10）、段落 padding 16（inline）/16（首段 top、末段 bottom）、按钮 = 药丸文本钮（见 §B9）。0.18 的「radius 10 / 6 9 / radius 6」不应再作为依据。
3. **动效三件套全量提取**：命名时长字典 `yx`（APP@679700，49 个命名值）、全部 145 个 `@keyframes`（按 16 类分组，`evidence/078-keyframes-inventory.txt`）、reduced-motion 机制 = `@media` 设 `--ui-reduced-motion:reduce` + 容器样式查询批量替换 animation/transition（时长 0s/.01ms/1ms、名字换成 fade 或 none）——U4 的「reduce 下 ≤0.01s」在原版是系统化机制不是逐条覆盖。

---

## 一、AUD 逐行「0.78.1 值」

### A. 侧栏

**A1（AUD L29）头部** — 0.78.1 实测结构（APP@1197900 起，组件 J4e）：
```
sand-agents-sidebar__header（root）
  min-height: var(--sand-titlebar-block, 38px)   ← 跟随 titlebar 档（见「titlebar」节）
  padding: 12px 16px 12px 16px；justify-content: space-between；gap 8px
  -webkit-app-region: var(--sand-app-region)（拖拽区）
  折叠(≤130px 容器查询)：min-height → --sand-titlebar-collapsed-block、padding 收到 4px、justify-center
  ├─ 多选态：selection-actions = [移入分区(folder icon)] [删除(trash)] [清除选择(close)]，均 sm icon 钮
  └─ 常态 new-actions（gap 2px）：
     [collapse 钮 icon=layout-sidebar-left sm，tooltip "Collapse sidebar"(mkMLq4)/aria "Toggle compact sidebar"]
     [tasksButton（入口条件渲染）]
     [搜索钮 icon=search sm，aria "Search"(A1taO8)，任意可打印键触发；class sand-agents-sidebar__search]
     [New Bot 钮 icon=plus sm，tooltip "New Bot"(2hjDEV)；
       有动作时改为菜单(hw)：菜单项 "Create a Bot"(rbO+df, plus) / "Browse shared Bots"(wV9Rp/, building)]
```
- 按钮规格（VS 体系，APP@810400）：icon 钮尺寸 xs20/sm**24**/md28/lg44；transition `background-color,color .12s ease-out`；square 半径 6 / circle 9999。
- **GrokMark 无**：头部无品牌位（0.18 判断成立，未登录封面才有 logo）。
- 修正①：AUD A1 与 RE-ui-shell §3.1 的「New chat/New section 文本按钮」判读有误——"New chat"(hIQkLb) 是会话容器 ariaLabel，"New section"(SagCAA) 是分区命名/多选移动动作，都不在头部。头部 = 上述 icon 行。

**A15（AUD L43）市场入口** — 实测在 **footer**（APP@1137775 b2e + APP@1166400 a4e）：
- footer 结构：账号行（avatar + 名字 + AccountMenu）+ **"Connect apps" 药丸**（`data-sidebar-marketplace`，aria/文案 id h8AWBN = "Connect apps"）。
- 药丸规格：高 **36px**、min-width 36、radius 9999（药丸）、bg `--sand-bg-elevated` + **1px solid border-tertiary-translucent**、hover 叠 `bg-hover` 渐变、icon `grid-plus`（lg）、正文 body1 medium；label 通过 `--sand-reveal-label` hover 展开（收起时只显示 icon+logos）；显示已连接 app logos 与计数徽标（connectedAppCounter）。
- 动效：`transition: background-color,flex-grow,padding .3s cubic-bezier(.2,0,0,1)`（药丸伸缩）。
- 侧栏折叠态：同一入口退化为 rail icon 钮（`sand-agents-sidebar__rail-new` 区，layout-sidebar-left 展开钮 + plus）。
- AUD 修复建议方向（维持可接受）应更新为：**入口放 footer、形态 = Connect apps 药丸**，不是头部菜单行；文案建议改「连接应用 / Connect apps」语义。

### B. 会话流

**B3/结论4 反转气泡（AUD L55）** — 0.78.1 实测（IX 样式对象，APP@2683000 区）：
| 属性 | 值 |
|---|---|
| 气泡 max-width | 消息族 `min(80%, 560px, 100% - 82px)`（`.sand-1q8iv8g`）；容器单位版 `min(80cqi,560px,100cqi-82px)`（`.sand-1v92of1`），内容宽再 −24px=536 |
| padding | block `var(--sand-transcript-prose-block-padding)`=**7px**；inline **12px** |
| radius | `var(--sand-transcript-prose-bubble-radius)`=**18px**；连续消息相邻角收 **6px**（user: start-end/end-end；agent: start-start/end-start） |
| user 气泡 | `align-self:flex-end`（右对齐）；bg `var(--sand-transcript-bubble-user-fill)`→`--sand-fill-bubble-user`（light `#1c1c1c` 全黑 / dark `#f5f5f52e` 18% 白）；文字 `--sand-transcript-bubble-user-text`→`--sand-text-on-primary`（反白）；specular 渐变 `linear-gradient(to bottom,var(--sand-specular-quaternary),transparent)` |
| agent 气泡 | bg `--sand-transcript-bubble-agent-fill`（6%/4% tint）；specular-secondary 渐变 + inset 玻璃描边 `inset 0 .5px 0 specular-secondary, inset 0 -.5px 0 …, inset 0 0 0 .5px border-quaternary-translucent` |
| 分组 | `data-group-start` → margin-top `--cursor-spacing-3`(12px)；连续消息靠 6px 小角表达 |
| 单行气泡 | min-width `--sand-transcript-prose-one-line-height`=36px |
| 对侧缩进 token | `--conversation-opposed-inset: clamp(0px,(100%-480px)*.4,20%)`；human 侧 `max(32px, …)` |

**B9（AUD L61）审批卡 local-tool-permission** — 0.78.1 实测（chunk-Bbgcfm9R + APP 卡壳 ZS@815271）：
- **位置**：transcript 内 send-message 卡（`surface:"elevated"`），不在 composer 上方 dock——当前 inline 方案方向正确 ✓。
- 卡壳（elevated 档）：radius **24px**；bg `--sand-bg-elevated`；阴影 `0 0 0 .5px var(--sand-border-secondary-translucent), 0 2px 8px var(--sand-shadow-card)`；宽随消息列 `min(80%,560px,100%-82px)`；root flex column + overflow hidden。
- 内部分段：gap 10px；section padding-inline **16px**、首段 padding-top 16、末段 padding-bottom 16（`:last-child` 规则）。
- 标题条（titlebar 变体）：padding **14px** 16px；标题 medium 字重；摘要 ellipsis；展开指示钮 hover 才显（`--sand-titlebar-disclosure-reveal` 0→1，transition bg/color/opacity .12s ease-out）。
- **按钮**（hC 文本钮体系，APP@835332）：药丸 radius 9999；sm `padding 4px 8px` / md `6px 12px` / lg `8px 16px`；press = 12% currentcolor 叠层；pending/disabled 主钮 = inset 1px ring。审批卡动作：主钮 "Allow"(h7peZQ，neutralSecondary 底)、"Always allow"(NoKBgy)、"Don't allow"(zOxKTV，tertiary 透明底)；键盘 `Deny once (Esc)`(g3D+vR)。
- **终态**：pending→已决后卡片不再出按钮，状态行文案 = "Allowed once"(gk2v4K) / "Allowed for this turn"(/IKCH1) / "Always allowed"(gBhy/k) / "Not allowed"(OvnLyF) / "Denied"(JsY1p5) / "Expired"(M1RnFv) / "Permission given"(foxyPB)，success=muted 色系（AUD B8「已决收单行」方向被证实，且 0.78.1 连卡壳一起简化）。
- 范围说明文案：`Allow lasts for this turn`×3 变体、`Allow covers every {name}`×2、`Your team asks before each on-device tool runs`（团队 ceiling 存在时降级）。
- 结果色：`.sand-local-tool-permission-outcome`（类名在 chunk 内，样式随 elevated 卡标题色 text-primary/secondary）。

**结论4 prose** — `:root` 直读（`evidence/078-css-rules-split.txt` :root 块）：
```
--sand-transcript-prose-line-height: 22px（flag sand_chat_prose_15px 关时降为 --sand-line-height-base 18px）
--sand-transcript-prose-block-padding: 7px
--sand-transcript-prose-one-line-height: 36px
--sand-transcript-prose-bubble-radius: 18px
正文字号：默认 body1 14px；flag on → 15px + letter-spacing lg
```

**B5 相关补充（typing 指示器，供 B5 参照）**：dots **6px**（md）/5px（sm）、radius 9999、色 `--sand-text-tertiary`、容器高 = 行高 lg(22px)；动画 `sand-cqmojk-B`（opacity .35→1→.35 + translateY −2px）、**1.4s** ease-in-out infinite、三点半相位 delay 0/−.16s/−.32s；"working" 平静变体 2.4s + delay 0/−.3s/−.6s。

**B6 修正（见结论 ②）**：`sand-outline-item` 行高 28、padding 7px 8px 12px、radius 8、hover `color-mix(text-primary 7%,transparent)`、transition background .12s ease；icon 色映射（变体位运算）：user/assistant-text=tertiary、thinking=thinking-medium(**accent**)、send-message=send(**绿** `--sand-text-green-primary`)、tool-call pending=loading(spin)/failed=x-circle(**红**)/正常=**wrench(tertiary)**——与 0.18 的 wrench-tertiary 一致；label medium；preview 13px ellipsis（**非 mono**）；chevron `chevron-right↔down` xs；detail 面板 padding-inline-start 30px / end 10px。

**结论4 corner-ring / 角标族（AUD A11 相关）** — APP@710000 区：
- 几何（cUe）：expanded 条目 running/marker dot **8×8 right:2 bottom:2**；collapsed 同尺寸；pinned dot **10×10**；ring **14×14 right:0 bottom:0**（pinned 18×18）；main 徽标基准 16×16×scale（expanded 0.6≈9.6px）。
- 形态：ring = **kit spinner（indeterminate）**，8 段 45° conic-gradient 蒙版弧 + 线性 360° 旋转（`ui-1wc8ddo-B`/`sand-1wc8ddo-B`），色 text-secondary；main = **star 图标 filled**（bg `--sand-bg-yellow-bright` 圆片 + inset .5px ring + on-primary 色）——AUD 局限 2「star 与否未知」解除：**就是 star**；running/marker dot = 状态点 8×8：working=绿 `--sand-bg-success-primary`、blocked(needs-attention)=`--sand-bg-warn-primary`、unread(**info**)=`--sand-text-accent-primary`（accent 蓝）、offline=`--sand-icon-tertiary`、error=danger。
- 布局规则（dUe）：expanded 时 corner=running|main、trailing=marker；collapsed/pinned 时全部收 corner。
- 出现动效：cornerReveal = `sand-18re5ia-B`（fade 0→1）**.13s cubic-bezier(.22,1,.36,1)**；workingDot 显隐 = opacity 过渡 **.13s**。
- 条目本体（rS.root）：radius `--sand-agent-item-radius`=12 ✓、hover bg-hover、selected bg-active + avatar 蒙层 active、**高度 54px**（expanded：padding-block 8、padding-inline 8、gap `--sand-agent-item-avatar-gap`（CSS 默认 8 / XVF 10）；collapsed 宽 54、padding 9；pinned 列方向 gap 6）、body 折叠过渡 `flex-grow,opacity .2s cubic-bezier(.22,1,.36,1)`、time 列 = tertiary 色 trailing（宽 72px）。侧栏条目**无 0.18 的 min-height 58 语义**——A4 的 58 锚只在 0.18 成立，0.78.1 用固定 54。

**结论4 titlebar** — `--sand-titlebar-block` 三档（APP@3658800 shell 样式对象）：
- 基础 fallback **38px**；`shellTitlebar`（常态标题条）→ **44px**；`shellWindowControls`（自绘窗口控件，linux/win）→ **52px**；fullscreen 44。
- `--sand-titlebar-inset`：titlebar 档 72px / 基础 0。
- 侧栏头 min-height 跟随同一 token（见 A1）。RE-theme §3「titlebar 38px」应修正为 **44/52（38 仅 fallback）**。
- 顶部拖拽：`--sand-app-region` 注入，覆盖 header（A1 的 app-region）。

### D. 市场

**D1（AUD L86）容器** — 实测（chunk-kcheXZ65@182432 Bc + 平台 dialog）：
- **是模态对话框**：平台 Dialog（fixed 居中、z=modal+1、bg `--cursor-bg-elevated`、**1px solid `--cursor-stroke-secondary` 四边**、radius `var(--cursor-radius-xl)`=**14**、max `calc(100vw−32px)×calc(100vh−32px)`）。
- 市场覆写：宽 **`min(900px, 100vw−32px)`**（custom-connector 表单态收窄 `min(560px,100vw−32px)`）、内容高 **`min(700px, 100vh−96px)`**、padding 0、overflow clip。
- 开场动画：`ui-9ekpj0-B`（translate(-50%,-50%) scale .97→1 + fade），时长 `--cursor-duration-slow`=**200ms**、曲线 `--ease-sharp`=**cubic-bezier(.165,.84,.44,1)**、fill forwards；退场 `ui-fh2zsw-B` 反向同规格。
- 宽度切换（列表/详情/表单）动效：`transition: width .3s` + 自定义 `linear(…)` 分段缓动（`.sand-1r6a6jf`）。
- 0.18 的 min(820,100vw−32)×min(620,100vh−32)/radius 14/阴影 0 24 80 → 0.78.1 = **900×(100vh−96) / radius 14 / 仅 1px 描边、无 box-shadow**（Am.base 无阴影类；dark 模式阴影 alpha 本就全 0——「描边代替投影」延续）。

**D2（AUD L87）Back/标题** — 实测：
- Back 钮：icon `chevron-left`、shape **circle**、size **md**、variant **ghost**（28px 圆钮、透明底 hover bg-secondary）；容器高 **48px**、padding 10px 10px 10px **48px**（右留窗口控件位）。
- 标题：heading id `sand-plugins-modal-heading`，aria「Connect Apps」(g/jm+8)；列表态标题条随 tab 语境（"Marketplace" Zt5PUS 仅作分类 fallback 文案出现）。
- 右上角浮动 **Close** 钮（icon close、circle、md、ghost，class `sand-plugins-dialog__close`）+ "Import Bot"（7++OwZ）文本钮（size lg，禁用态随能力）。

**D3（AUD L88）tabs** — 实测：路由驱动 `/v1/marketplace?tab=plugins|bots`（bee=[plugins,bots]，APP@166576）；tab UI 为通用 tablist 组件（role=tab、aria-selected、"All"+分类、计数徽标、More 溢出菜单、搜索框，body2 字号，tab padding 5px 10px 药丸）。AUD 的语义判断（plugins/bots 两 tab）成立；视觉按 tablist 组件规格落地即可。

### [78=] 复核项（AUD 已判一致，本报告补充数值）
- **A7** agent-item radius 12 ✓（`--sand-agent-item-radius`）。
- **A17** 侧栏 280 默认 / 240–400 ✓（RE-theme §3，本次未推翻）。折叠≠88px 固定：折叠=grid 首列 0，容器查询 ≤130px 触发条目收缩（宽 54）。
- **E1** 窗口控件三按钮 ✓（titlebar 52px 档承载）。
- **B3** 反转气泡右对齐 ✓（见上表）。

---

## 二、@keyframes 全量（145 个）与组件对应

完整原始表：`evidence/078-keyframes-all.txt`；分类清单：`evidence/078-keyframes-inventory.txt`。按动画类型归组（`sand-`=应用层，`ui-`=平台组件库）：

| 类别 | 数量 | 代表 keyframe（内容） | 组件对应 |
|---|---|---|---|
| slide（进出场上滑） | 57 | `sand-1rqlz9z-B` translateY 12→0；`sand-1im2lgs-B` opacity+Y12+scale.94（55% 峰值）；`sand-168qp9p-B` Y8+scale.985 | **transcript 行进入**（`data-enter=new`/`after-collapse`，见下）；菜单/popover/notice 进出场；`sand-1098us9/31zqhw` ±40px 页面切换 |
| scale | 19 | `sand-aj6w25-B` scale .985→1（配 fade） | 行内卡片出现、徽标 pop |
| fade | 22 | `sand-18re5ia-B` 0→1 | 角标 reveal、各种淡入淡出 |
| slide+scale | 13 | `ui-9ekpj0-B`/`ui-fh2zsw-B` 居中 .97↔1 | **对话框开/关** |
| gridrows/gridcols | 7 | `sand-r6vku5-B` rows 0fr→1fr+fade | 折叠区块展开（卡片折叠、grid 动画） |
| bgpos(shimmer/sweep) | 5 | `sand-1fny1my-B` 200%→−200% | **shimmer 文字**（2.2s steps(60)）；加载 sweep |
| bgpulse | 3 | `sand-anchor-flash` 12% 底闪 60% 后消退 | 锚点/高亮闪（**1.6s ease-out**）；warn 提醒 |
| rotate | 2 | `sand/ui-1wc8ddo-B` 0→360° | **spinner 旋转**（corner-ring、loading 图标） |
| rotate+scale | 1 | `sand-9wdec0-B` 分段 cubic-bezier 旋转缩放 | 装饰 spinner（非默认 UI） |
| ringpulse | 1 | `sand-zzcn73-B` box-shadow 0→3px 扩散环 | **消息定位高亮**（`[data-highlighted]`） |
| slide+size | 3+1 | `sand-15rdj90/165dm8x/1qxssdl` height 0↔auto + Y−4 + blur | 折叠行收起（带 −22px margin 补偿） |
| fade+filter / scale+filter | 4 | blur 0↔2-4px | 浮层柔化退场 |
| 其他 | 6 | `sand-6nj1zq-B` stroke-dashoffset | SVG 走线、number-roll、tray |

**transcript 行进入（会话流动效核心，U4 主对象）**：
- 行容器 `data-enter=new`：内容 `sand-1rqlz9z-B`（Y12→0）**.24s** + 卡片内容 `sand-aj6w25-B`（fade+scale.985）同拍；曲线 **cubic-bezier(.23,1,.32,1)**、fill backwards。
- `data-enter=after-collapse`：`sand-1im2lgs-B`（fade+Y12+scale.94，55% 峰值）**.24s**、**delay .38s**（`yx.cardStepEnterDelay`）、transform-origin 底部中点（RTL 感知 `--sand-inline-sign`）。
- widget/宽卡：**.32s**（`yx.widgetEnterDuration`）。
- 行锚点高亮：`sand-zzcn73-B` 扩散环（0→3px text-primary→透明）。
- reduced-motion：以上 duration→0s/.01ms/1ms，见下节。

## 三、transition 全量（token 层 + 组件层）

**token 层**（RE-theme §2.4 已提取，本报告确认消费方式）：`--cursor-duration-{instant50,fast100,normal150,slow200,slower300,drawer500,1s,2s}`；easing `--ease`(ease)/`--ease-sharp` `cubic-bezier(.165,.84,.44,1)`/`--ease-heavy`/`--ease-drawer` `cubic-bezier(.32,.72,0,1)`/linear。

**命名动效字典 `yx`**（APP@679700，JS 侧直接引用，U4 断言可按名取值）：
```
cursorFade 90ms · hintFade 90ms · menuRise 100ms · rowHoverReveal 100ms · hoverIntentDelay 100ms
feedback 120ms · quickFade 120ms · rowReveal 130ms · buttonHover 140ms · findBarEnter 140ms
hoverFade 140ms · noticeFade 150ms · cardToggleFade 80ms · cardToggleFadeIn 120ms
cardToggleResize cubic-bezier(0.2,0,0,1) · glyphSwap 200ms cubic-bezier(0.22,1,0.36,1)
thumbHover 150ms · enter 160ms · fade 160ms · imageHover 160ms · imageLoadFade 180ms
trayEnter 180ms · noticeCollapse 200ms · reveal 200ms · rowEnter 240ms · cardToggle 240ms
cardCollapse 300ms · cardStepEnterDelay 380ms · paneCrossfade 260ms · sectionReveal 260ms
widgetEnter 320ms · reactionBump 240ms · reactionPop 500ms(linear(…) 弹性曲线) · reactionExit 200ms
reactionShift 300ms · spin 700ms · glyphSpin 1000ms · sendProgressSweep 1000ms
runningSpin 1200ms · bounce 1400ms · shimmer 1400ms · bounceReduced 1600ms · sweep 2200ms · breathe 2400ms
```

**CSS 组件层实测值**（U4 逐条断言用）：
| 组件 | transition |
|---|---|
| 按钮（icon+text 全系） | `background-color,color .12s ease-out`；press 无过渡（瞬时叠层） |
| 卡 titlebar 展开钮 | `background-color,color,opacity .12s ease-out`（reveal 变量） |
| agent-item body 折叠 | `flex-grow,opacity .2s cubic-bezier(.22,1,.36,1)` |
| 侧栏宽度（grid 列） | `grid-template-columns .2s cubic-bezier(.22,1,.36,1)`，仅 `[data-sidebar-animating]` 拖拽中生效（平时 `--sand-sidebar-anim-duration:0s`） |
| corner 角标 reveal / workingDot | opacity **.13s**（ease 默认）；cornerReize 用 cubic-bezier(.22,1,.36,1) |
| footer Connect apps 药丸 | `background-color,flex-grow,padding .3s cubic-bezier(.2,0,0,1)` |
| 市场对话框宽切换 | `width .3s linear(…分段)` |
| typing dots | 1.4s（calm 2.4s）ease-in-out infinite |
| shimmer 文字 | 2.2s steps(60,end) infinite（paused 态切 play-state） |
| anchor flash | 1.6s ease-out |
| 对话框开关 | 200ms `--ease-sharp`（keyframes，见 D1） |
| 侧栏列表重排（JS/framer-motion） | spring mass1 stiffness1000 damping63；备选 `.3s [.2,0,0,1]` / `.3s [.1,.9,.2,1]` / `.1s [.2,0,.2,1]`（APP@1198600 lA/uA/dA/Y4e） |

**prefers-reduced-motion 机制（U4 条款依据）**：
1. `@media (prefers-reduced-motion:reduce)` 设 `--ui-reduced-motion:reduce` + `--ui-press-scale:1`（取消按压缩放）。
2. 大量 `@container style(--ui-reduced-motion:reduce)` 块把 animation-name 换成纯 fade（`ui-13kz0yu-B` 等）或 `none`、duration→`.01ms`/`0s`/`1ms`、spinner 保留但改 delay 同步、迭代转 infinite 静态。
3. sand 侧总规则（`.sand-hj7x8a…` 一条 mega-rule）：transition-duration→`0s,.12s,.15s,.15s` 白名单、90ms/.12s 保留项、property 收窄为 background-color/color/opacity（纯色变仍允许）、位移类全部归零。
4. 复刻建议：同构实现（media 查询设变量 + 少量覆盖），而不是逐组件 if。

---

## 四、局限与未验证

1. **全部为静态推导**：class→组件映射靠 bundle 字面量共现（stylex 编译产物里 class 名成串内联在组件代码附近），主要组件（头部/条目/角标/气泡/卡壳/对话框/药丸）逐一回溯到渲染代码，但未运行 DOM computed-style 核验。值与选择器文本一一对应，置信度高；共现推断处已标注。
2. **市场 tabs 的视觉细节未钉死**：tablist 组件规格取自通用 tab 组件（chunk-view-Bx8u2sOw），plugins|bots 由路由参数证实；市场内 tab 具体选用的 padding/选中态未逐字提取（不影响 D3 语义结论）。
3. **agent-item 头像直径**：JS prop 传入，CSS 无值；由角标蒙版数学（16px 圆心）推断 **32px**（推断，非实测）。AUD A4/A6 若要 0.78.1 值需运行态截图（R3/§9-Q2）确认。
4. **`ui-`（平台库）keyframes 中约 40 个未能逐一归属到具体组件**（菜单/tooltip/number-roll/tray 等原语），已按类型归组并列出内容，可按需再深挖。
5. 4 个 keyframes 无同文件消费者（`sand-1cva32/14ob7dc/15lbet6/181xojf-B`）——14ob7dc/181xojf 经 reduced-motion 替换规则引用（`ui-6gsvvc→ui-14ob7dc-B` 等），另两个疑似死代码或跨文件（inline style）引用。
6. 拆分脚本与中间产物在 `/tmp/r2-visual/`（易失）；关键原始证据已存 `work/p5-parity/evidence/078-*.txt` 三份。
7. `sand_chat_prose_15px` 等 feature flag 的默认开关值在静态包中不可见（服务端 gate），prose 默认按 14px/22 报告。
