# RE-MOTION-0.78.1 · 原版动效 / 过渡 / 微交互 / 行为流取证

> 工单 T82 · 2026-11-12 · reverse-engineer（REA 流程，静态取证）
> 材料：`/tmp/t78-asar/`（0.78.1 deb 解包 asar，只读）；对照 `app/ui/renderer-grok/`
> 格式学 RE-BORDERS-0.78.1：每条带原版值、锚点、我们的现值、差异定级。
> 分母：原版 CSS **147 个 @keyframes**（`grep -oh '@keyframes [A-Za-z0-9_-]*' /tmp/t78-asar/dist/renderer/assets/*.css | sort -u | wc -l` = 147，全部在 `index-Dh7EWA8t.css` 145 + `desktop-mount-panel-NgyehdlN.css` 2）。**147 = 正文清单 + 附录 B 排除表，逐名可核。**

## 0. 体系解读与总账（先读这个再看表）

**原版动画是三层结构，不是散装 CSS：**

1. **`sand-*`（84 个）**：Grok 自家设计系统（Panda CSS 原子化产物）。每个动画的 keyframes 定义体 + `animation-name` / `animation-duration` / `animation-timing-function` / `animation-fill-mode` 各是一个原子 class（如 `.sand-1ujtcca{animation-name:sand-aj6w25-B}`、`.sand-j3mb0h{animation-timing-function:cubic-bezier(.22,1,.36,1)}`），组件 JS（样式字典，如 `chunk-widget-DEsXv4qw.js` 的 `elevatedCard:{kKVMdj:\`sand-1ujtcca sand-xnp86f\`}`）把 3~6 个原子 class 拼成一个完整动画。**时长/缓动不在 CSS 规则里，必须去 JS 组合串里配对**——本报告的参数全部来自这条配对管线。
2. **`ui-*`（60 个）**：Cursor 系 ui 组件库（变量名 `--cursor-*` 暴露来源），同样原子化，另有**独立的容器级降级** `@container style(--ui-reduced-motion:reduce)`。
3. **语义名（3 个）**：`sand-anchor-flash`（1.6s ease-out，锚点定位闪烁）、`hover-preview-in` / `hover-preview-fade-in`（panel css，`.14s var(--panel-ease-out)`）。

**原版 motion token（值已解析，`index-Dh7EWA8t.css` :root）：**

| token | 值 | 用途 |
|---|---|---|
| `--cursor-duration-fast/normal/slow/slower` | .1s / .15s / .2s / .3s | 通用时长档 |
| `--ease` / `--ease-sharp` / `--ease-linear` | ease / cubic-bezier(.165,.84,.44,1) / linear | 通用缓动 |
| `cubic-bezier(.22,1,.36,1)` | — | **最高频专用缓动**（入场，出现 4 处 transition + 大量 animation） |
| `cubic-bezier(.2,0,0,1)` / `(.23,1,.32,1)` / `(.16,1,.3,1)` | — | 次高频（exits / 位移） |
| `linear(0, .01588 2%, … 1 100%)` | 33 档 spring 曲线 | 展开类（grid/height）专用物理缓动 |
| `--cursor-spinner-sync-delay` + -0.125s 步进 ×8 | 多 spinner 同步相位 | 多个 spinner 视觉同步 |

**我们的现状（构建产物 `.build/frontend-shell/assets/index-Bii1kipe.css`）：16 个 @keyframes（其中仅 6 个与原版同名）、9 条 animation 声明、16 条 transition 声明。** 原版对应量级：147 keyframes / 344 animation 规则 / 327 transition 规则。0.18 底座与 0.78.1 同属 Panda 原子体系（我们 CSS 里已有 `.sand-*`/`.ui-*` 原子 class 约 600 个），但动画层基本没跟上——这是「感觉没有动画」的定量根源。

**三态总账：**
- **已有（同名 keyframes，定义体一致，Panda 同 recipe）**：6 个 —— `sand-9wdec0-B`（thinking spinner）、`sand-1im2lgs-B`（消息入场 after-collapse）、`sand-18re5ia-B`（fade-in）、`sand-1wc8ddo-B` + `ui-1wc8ddo-B`（spin）、`sand-m8u80m-B`（4px pop）。但其中数个**我们只有定义体、没有挂到组件上**（见 §1）。
- **语义近似但参数不同**：pb-dialog-in、pb-pulse、sand-onboarding-* 等 10 个自建。
- **完全没有**：约 131 个。

差异定级：**P0** 用户每天见、缺失体感明显；**P1** 高频面但小缺失；**P2** 低频/装饰/内部 gate。可见面用 `work/ui-quality/evidence/tour/` 的面名（conversation、empty-chat、sidebar-menu、palette、settings-general、market-list、new-bot、account-menu、info-pane、onboarding-0..5）。

---

## 1. 会话区（transcript · 面名 conversation / empty-chat）

| # | 条目 | 原版参数 | 锚点 | 我们的现值 | 定级 |
|---|---|---|---|---|---|
| 1.1 | 新消息行入场（普通） | `.sand-transcript-row[data-enter=new]` 双段：`sand-aj6w25-B`（scale .985→1，opacity）+ `sand-1rqlz9z-B`（translateY 12px→0），缓动 `cubic-bezier(.22,1,.36,1)`（`.sand-j3mb0h` 同选择器组） | index.css@621890 区域；offset 430821 / 435863 | **缺失**（transcript-row 无 data-enter=new 动画；我们有 `data-enter=after-collapse` 的 1.1.2） | **P0** |
| 1.2 | 折叠后展开入场 | `sand-1im2lgs-B`：0%{op:0; ty12px; scale.94} 55%{op:1} to{}；参数 `.24s cubic-bezier(.23,1,.32,1) backwards` | offset 431740；我们 `view.css:256` 起有同名定义 + `.sand-1x1dhk...` 挂载（view.css 中 `.sand-nh2nfu...[data-enter=...]` 组） | **已有（同名）**——需核对挂载覆盖所有 data-enter 值 | 一致 |
| 1.3 | typing 指示（三点） | 浮动版 `sand-cqmojk-B`：{op .35; ty0}→30%{op1; ty-2px}，`1.4s ease-in-out infinite both` + **逐点 delay 60ms 交错**（`animation-delay:60ms` ×4 档：22/44/66/88ms 系列）；纯 opacity 版 `sand-tru6e3-B`；reduced-motion 替代版 `sand-14ob7dc-B`（只 fade） | `index.eager-app-iGTgHP_Q.js`（`sand-16wv3z2` 组合：1.4s ease-in-out both infinite）；CSS delay 原子 60ms 系列 | **无动画**——`.sand-message-typing__dot` 静态 5px 圆点（`workspace/view.css:191`） | **P0** |
| 1.4 | thinking/工作中 spinner | `sand-9wdec0-B`：17.857% 分档 timing-function 链（三段 cubic-bezier 旋转+缩放循环），`.28s both` 入场（`.sand-18imfhs` 组合，`chunk-computer-screen-preview`） | offset 433650 | **已有（同名）**（view.css 有定义 + `.sand-18imfhs` 挂载） | 一致 |
| 1.5 | 消息 hover 动作钮 | 出现：`transition: opacity .12s ease` 近似；**另有 hover 锚点背景闪现 `sand-1ozwp7x-B`**：bg color-mix(text 8%) 40% 峰值，`2.5s ease-out`；选择器 `.sand-1soy34:not(:has(.sand-message-action-anchor))` | offset 426504；`index.eager-app` | hover opacity .12s ease 我们有（`view.css:129`）；**锚点 flash 缺失** | P1 |
| 1.6 | 定位/高亮消息（跳转锚点） | `sand-zzcn73-B`：box-shadow ring 0→3px 8%→40% 收缩脉冲，`:where(.sand-transcript-row[data-highlighted]) .sand-8vq1ef`；加 `sand-anchor-flash`（语义名）1.6s ease-out bg 闪 | offset 426980 / 766119 | **缺失**（无 data-highlighted 动画） | **P0**（跳转定位是高频动作，无反馈=「点了没反应」） |
| 1.7 | 滚动到底按钮出现条件 | JS：`distanceFromBottomPx > 80 && !isCovered && !showsJumpToLatestPill` 才显示；未读时有 **jumpToLatestPill**（替代按钮）；跟随模式 `scrollToEntry(id,'smooth')` + 新消息 `scrollToBottom()`；上下文对象含 `isScrolling`、`dockInsetPx` | `index.eager-app-iGTgHP_Q.js`（搜 `distanceFromBottomPx>80`）；`index.eager-platform-C2su3Zzb.js` scroll 状态源 | 未取证到等价阈值逻辑（transcript.tsx 覆盖模块无 scrollToBottom/distanceFromBottom）——**需在 pagination/view 实现侧复核** | **P0**（行为流，不止样式） |
| 1.8 | 未读分隔/提示 | 未读 pill（jumpToLatestPill）+ 未读分隔线样式；入场走通用 fade/位移原子 | `index.eager-app`（`showsJumpToLatestPill`） | 有静态 `.sand-unread-divider`（view.css），无 pill、无出现动画 | P1 |
| 1.9 | 工具卡 / 提示卡展开收起 | 高度展开族：`sand-2u9j2r-B`（blur4px+height0+ty12px→展开，`.24s cubic-bezier(.23,1,.32,1) backwards`）、`sand-165dm8x-B` / `sand-1qxssdl-B`（height0+margin-22px，`linear(...)` 33 档 spring）、`sand-15rdj90-B`（收起 height→0）；grid 轨道族 `sand-r6vku5-B` / `sand-17hk15m-B`（rows/cols 0fr→1fr，.3s spring）、收起 `sand-1ml5ke1-B` / `sand-15lbet6-B` / `sand-1cva32-B` | offset 433447 / 433205 / 427387 / 427289 / 430232 / 427963 | **缺失**（我们的工具卡 notice 直接出现，无展开动画） | **P0** |
| 1.10 | 消息/气泡出场（删除、收起） | fade 族：`sand-1jn504y-B`（.15s ease-out forwards）、`sand-1eysfap-B`（.18s ease-out both +visibility）、`sand-1mi9bte-B`（.16s）；位移族 `sand-12uhc3t-B`（.14s cubic-bezier(.4,0,1,1) ty8px forwards）、`sand-14y3t1f-B`（ty10px）、`sand-1uvc5f5-B`（scale .92）；blur 族 `sand-18gwwlv-B`（blur4px scale1.18） | offset 427752 / 429731 / 427805 / 429637 / 429381 / 428460 / 428774 | **缺失** | P1 |
| 1.11 | 流式文字呈现 | 静态取证未见逐字/逐词 typewriter 机制（JS 无 typewriter/throttle-append）；流式期间占位/加载用 **text-shimmer 扫光**（`--ui-text-shimmer-base/highlight` token + `ui-f4slbi-B`/`ui-1fny1my-B` background-position 100%→-100% / 200%→-200% 循环；sand 侧 `sand-1i4k03n-B`/`sand-1fny1my-B`/`sand-1ofn8cw-B` 后者 2.2s steps(60,end) 离散步进） | `index.eager-platform`（textShimmer）；offset 2047/2132/426716/426804/426892 | **缺失**（我们的流式是直接 append，加载占位用 pb-pulse 呼吸，非扫光） | **P0**（shimmer 是「AI 在打字」的核心视觉） |
| 1.12 | 撤回/时间线分隔等微件 | `sand-1fiuodg-B`（margin-top -20px→0，.24s cb(.23,1,.32,1) backwards）；`sand-181xojf-B`（visibility 保持，配 reduced） | offset 427575 / 436246 | 缺失 | P2 |

**§1 拆单建议**：①「typing 三点 + text-shimmer 流式扫光」一组（P0，纯 CSS + 少量组件挂载，预估 1 张单）；②「消息入场/出场/高亮锚点三件套」（P0，transcript.tsx + view.css，1 张单）；③「工具卡高度展开族」（P1，与 T81 卡片结构联动，建议等 T81 落地后开）。滚动到底 80px 阈值 + 未读 pill 是行为流，建议并入 ② 同单（同一文件）或单开 T8x-scroll。

---

## 2. composer（面名 conversation / empty-chat）

| # | 条目 | 原版参数 | 锚点 | 我们的现值 | 定级 |
|---|---|---|---|---|---|
| 2.1 | 输入区/面板聚焦过渡 | transition 原子族：`background-color .15s`、`opacity .14s var(--panel-ease-out), transform .16s` 等 composer 区规则 7 条 | index.css（`.ui-15nvkio .ProseMirror .ui-prompt-input-link` 等组） | composer.tsx 覆盖模块无显式 transition；输入区聚焦态样式见 T74/T76 系列 | P1（聚焦环颜色归 T77，此处只记过渡时长缺失） |
| 2.2 | 发送按钮按压反馈 | 原版按压反馈走 scale 脉冲族：`sand-a3n0u-B`（1→1.06→1，`.5s` + `linear(0 0%, .0334 2.5%, … 1.078 37.5%, … 1 100%)` 43 档 spring，组合 `sand-80g9vb`）；onboarding 侧 `sand-twfdbq-B`（.72 收缩，.36s ease-out both） | `index.eager-app`（`sand-80g9vb` 组合，exiting 语境）；offset 434091 / 434186 | **缺失**（按钮无按压动画，仅 :active 态颜色） | **P0**（发送是全应用最高频按压动作） |
| 2.3 | 发送后清空/回位 | 未在静态层取证到专门动画（清空即时；队列提示 `.sand-queued-send-notice` 静态出现） | — | 我们有静态 queued/failed notice（view.css） | P2（记缺口：无证据，运行态可复测） |
| 2.4 | 附件拖入/移除 | chip 级 fade/位移原子（`sand-1ej958t-B` ty7px .22s cb(.2,0,0,1) both 等） | offset 432340 | 未取证到我们的附件 chip 动画 | P2 |
| 2.5 | composer 涨高（多行） | grid-rows 展开族同 §1.9（`sand-r6vku5-B` 等） | 同 §1.9 | 无 | P1 |

**§2 拆单建议**：单开一张「按压反馈 spring 曲线 + composer 聚焦过渡」小单（纯 CSS 变量 + 原子 class 注入，改动面小）；附件/涨高并入 §1③ 展开族同单。

---

## 3. 侧栏（面名 sidebar-menu / new-bot / info-pane）

| # | 条目 | 原版参数 | 锚点 | 我们的现值 | 定级 |
|---|---|---|---|---|---|
| 3.1 | bot 行 hover/active | `transition: background-color .12s ease`（我们同参数）；原版 hover 出现动作钮走 opacity 原子 `.09s`/`.16s ease`（`.sand-pzuper`/`.sand-qwldcu`，0.18 底座同款） | index.css `sand-pzuper` 组 | `view.css:37` background-color .12s ease——**一致**（0.18 同源） | 一致 |
| 3.2 | 侧栏宽度拖动/收起 | `[data-sidebar-animating]` 期间 `grid-template-columns` `.2s` 过渡（`.sand-1r800kn`/`.sand-jxnji7`） | index.css | 无（我们侧栏固定宽） | P1 |
| 3.3 | 未读标记出现 | 未读 corner-dot：`animation-duration:.13s` + `cubic-bezier(.22,1,.36,1)`（`.sand-agent-item__corner-dot` 组 `.sand-1jq8d06`/`.sand-1lfcbla`——0.18 已有同款原子） | view.css 引用 + 原版同 | 我们 view.css 已有该原子组（0.18 同源），**待确认组件侧是否挂载** | P1（核对挂载即可） |
| 3.4 | 视图切换（wipe） | **slide 族整组**：入 `sand-1098us9-B`（±40px，.26s cb(.22,1,.36,1)）/ `sand-31zqhw-B`；出 `sand-1724jg8-B`（100%，.26s 同缓动 forwards）；swipe 退场 `sand-1ajgydi-B`/`sand-1dth2ep-B`（28px @70%，.26s）；settle `sand-10cei6v-B`/`sand-od1efq-B`/`sand-1m9yt3f-B`（±30%/100%，.2s/.26s）；全部用 `var(--sand-inline-sign)` 做 RTL 镜像 | `chunk-wipe-navigation-Dwh56xw6.js`（sand-vi7102 出现处）；offset 434542/434677/435236/434892/435655/434312/435102/434427 | **缺失**（我们切换视图瞬时替换） | **P0**（切换会话/市场/设置是每次点击都发生的） |
| 3.5 | 拖动排序/swipe 手势 | `sand-18i4fvi-B`/`sand-1m23z4y-B`（±14px/±28px 循环 1s ease-in-out infinite——拖动中的活体反馈） | offset 435351 / 435503 | 无 | P2 |
| 3.6 | 列表滚动装饰 | `sand-11mlbbd-B`（ty→79.8881%，6.9s linear infinite）、`sand-hyntne-B`（→89%，11s）、`sand-1n8urz4-B`（inset-inline 0→66%）——长循环滚动/位移动画 | offset 436030 / 434812 / 427498 | 无 | P2（装饰） |

**§3 拆单建议**：wipe slide 族是最大缺口也是最有辨识度的动效——单开一张「视图切换 slide/wipe 过渡」单（需要 router 层配合，改动中等）；corner-dot/侧栏宽度过渡可并入 T76 侧栏单。

---

## 4. 浮层：菜单 / 对话框 / 命令面板 / toast（面名 palette / settings-general / market-list / account-menu / new-bot / info-pane）

原版这层最厚：入/出/居中/上弹/下弹各有 3~6 档位移变体，配套遮罩 fade。参数全部来自 JS 组合串配对。

| # | 条目 | 原版参数 | 锚点 | 我们的现值 | 定级 |
|---|---|---|---|---|---|
| 4.1 | 对话框/气泡入场（scale） | `sand-11nrck8-B`（op0 scale.92→1，**`.18s cubic-bezier(.22,1,.36,1) backwards`**，组合 `sand-14uqnkc`，JS 语境 "awning…bubble"）；变体 `.94`（`sand-1xy63tl-B`）、`.985`（`sand-168qp9p-B` ty8px，widget/elevatedCard：`sand-jocqv1 sand-n4un0z`） | `index.eager-app`（sand-14uqnkc 组合）；`chunk-widget-DEsXv4qw.js`；offset 430544/430728/431618 | **参数不同**：我们的 `pb-dialog-in` = `200ms cubic-bezier(.165,.84,.44,1)`（=--ease-sharp）scale(.97)（`overrides/p5-57.css:15` 区）——时长/easing/起点三处都不同 | **P0**（肉眼可辨：原版更弹、更快、起点更小） |
| 4.2 | 菜单/popover 入场（位移） | `sand-ef87bi-B`（ty-6px scale.98，**`.16s cubic-bezier(.16,1,.3,1)`**）；`sand-finfha-B`（ty+2px scale.98）；`sand-gcq4cg-B`（ty4px，**`.18s cb(.22,1,.36,1) backwards`**）；`sand-hw0koq-B`（ty-2px，**`.1s cb(.23,1,.32,1)`**）；`sand-m8u80m-B`（ty4px scale.98——**我们已有定义**）；`sand-lbo9vm-B`（tx±6px scale.96，.16s cb(.22,1,.36,1) backwards） | offset 431876/431997/432754/432856/432117/431229 | **缺失**（菜单瞬时出现） | **P0** |
| 4.3 | 上方弹出（tooltip/menu up） | `sand-117yj9g-B`（ty-50% scale.8→1）；`sand-iekrje-B`（scale.6）、`sand-qestwo-B`（scale.4，**`.5s linear(…43 档 spring，过冲 1.078)**）；`sand-hw0koq-B`（-2px） | offset 431494/430914/431005 | 缺失 | P1 |
| 4.4 | 底部/侧面板入场 | `sand-1kjvg8k-B`（ty-60%，**`.26s cb(.23,1,.32,1)`**）；`sand-x1hx13-B`（ty20px，.3s spring both）；`sand-1aw1ihd-B`（ty6px+pointer-events，.3s spring both） | offset 432443/432959/433062 | 缺失 | P1 |
| 4.5 | 居中定位浮层 | `sand-10dagxi-B` / `sand-13qd1cp-B`（translate(-50%) ty0↔6px，**`.15s cubic-bezier(.2,0,0,1) backwards`**） | offset 428992/431096 | 缺失 | P1 |
| 4.6 | 浮层退场 | `sand-12uhc3t-B`（.14s cb(.4,0,1,1) ty8px forwards）；`sand-1eysfap-B`（.18s ease-out both）；`sand-nficoj-B`（ty-7px+visibility，.22s cb(.2,0,0,1) both）；scale 退场 `sand-196fsjt-B`(.6)/`sand-is4ffh-B`(.3)/`sand-jdeiqf-B`(.9)；底部退场 `sand-1p3jh78-B`（ty20px，.3s spring both）/`sand-2is9k8-B`（.3s spring） | offset 429637/429731/429260/428277/428186/428369/429485/429552 | **缺失**（我们关浮层瞬时消失；pb-dialog 无退场） | **P0**（退场缺失比入场更显廉价） |
| 4.7 | toast/notice 行为 | ui 库 toast：`--ui-toast-transition-duration: var(--cursor-duration-slow)`(.2s)，property `transform,opacity,height,box-shadow`（`.ui-i9r6s1`/`.ui-14xgp1n`）；**tray 滑入** `ui-1ci7j24-B`（`--ui-tray-closed/open-transform` 之间）；`[data-tray-motion=suppressed]` 时 `transition-duration:0s`（连发抑制） | index.css `.ui-i9r6s1` 组；offset 5545 | 我们 notice 卡无进出场动画 | **P0** |
| 4.8 | toast 进出场计数器（number-roll） | `ui-1fwv1gf-B`/`ui-16dd3bt-B`：数字上下滚动替换（`--ui-number-roll-enter/exit-offset`） | offset 4766/3644 | 无（我们的未读计数直接跳变） | P1（「3 条新消息」翻滚很有辨识度） |
| 4.9 | hover 预览浮窗（panel） | `hover-preview-in`：`.14s var(--panel-ease-out)` scale(.96)→1；reduced 版 `hover-preview-fade-in` 只 fade | `desktop-mount-panel-NgyehdlN.css:6553/6708` | 无 | P1（desktop-mount 面板功能我们整体未复刻，见 RE-UI-LAYOUT） |
| 4.10 | market 面板内位移 | `sand-1ej958t-B`（ty7px，**`.22s cb(.2,0,0,1) both`**）、`sand-1bzi508-B`（ty6px）、`sand-1uknk9t-B`/`sand-rngkwq-B`（ty8px，.3s spring backwards）、`sand-1kjvg8k-B` | offset 432340/432237/432651/430351 | pb-market 抄了静态布局，动画未抄 | P1 |
| 4.11 | 命令面板（palette） | palette 走 4.2/4.6 同款原子（menu 位移族）；内部列表项走 fade `sand-18re5ia-B` 族 + `ui-1kfb3go-B`/`ui-1lgszu9-B`(=ui 侧 ty-4px/-6px) | `production/CommandPalette.tsx` 覆盖层（我们） | 我们的 palette 无进出场动画 | **P0**（palette 面名 tour 有专门取证） |
| 4.12 | blur 入场族 | `sand-k8pbt6-B`（blur4px→0 + fade，组合 `.2s both + delay var(--x-animationDelay)`——**级联 stagger**）、`ui-173awqc-B`（blur2px）；出场 blur `sand-18gwwlv-B`（blur4px scale1.18） | `index.eager-app`（sand-14htkg4 组合，reveal 语境）；offset 430044/3883/428774 | 缺失 | P1（stagger 级联是列表入场的高级感来源） |

**§4 拆单建议**：①「浮层出入场参数对齐 + 退场补齐」一张单（把我们 pb-dialog-in 改为 .18s cb(.22,1,.36,1) scale(.92)，菜单挂 4.2 位移族，退场补 4.6——全是 CSS 层，1 张单）；②「toast tray + number-roll」一张单（需要 notice 组件配合）；③ blur/stagger 级联单独一张（P1 靠后）。

---

## 5. 全局：reduced-motion / 主题 / 声音 / 通知

| # | 条目 | 原版参数 | 锚点 | 我们的现值 | 定级 |
|---|---|---|---|---|---|
| 5.1 | prefers-reduced-motion（sand 侧） | 一个聚合 `@media (prefers-reduced-motion:reduce)` 块（index.css 出现 8 次引用）：把位移类动画**替换为纯 opacity 简化版 keyframes**（如 typing dots 从 cqmojk(浮动)→14ob7dc(只 fade)；fade-in/out 走 `sand-18re5ia-B`/`sand-1jn504y-B`），不是一刀切 none | index.css（`sand-14ob7dc-B`/`sand-15lbet6-B`/`sand-181xojf-B`/`sand-1cva32-B`/`sand-1mi9bte-B`/`sand-1eysfap-B`/`sand-w2c1lr-B` 的 reduced 引用行） | overrides 3 处 `animation:none`（p5-57 ×2、p6-15 ×1）——**一刀切，且只覆盖 3 个组件** | **P1**（无障碍基线，原版是「降级替代」哲学） |
| 5.2 | 容器级 reduced-motion（ui 侧） | `@container style(--ui-reduced-motion:reduce)`：ui 库组件可在容器内独立降级（不依赖系统设置） | index.css（`ui-14ob7dc-B`/`ui-17qceat-B`/`ui-18re5ia-B`/`ui-1jn504y-B`/`ui-w2c1lr-B`/`ui-13kz0yu-B`/`ui-etzqjq-B` 的 container 引用） | 无 | P2 |
| 5.3 | JS 侧 motion 感知 | `window.matchMedia('(prefers-reduced-motion: reduce)')` 在 eager-app/eager-platform/vendor 多处；`chunk-dist` 30 处 prefers-reduced-motion（动画运行时）；framer-motion 存在于 vendor（`index.eager-vendor-BwKbmZU5.js`） | 各 eager chunk | onboarding 两组件有 matchMedia（0.18 同源）；无全局机制 | P2 |
| 5.4 | 主题切换过渡 | 静态层未见专门的 theme crossfade 动画（token 即时切换；transition-property 直方图里无 color-scheme 专用规则） | —（负向证据：transition 值直方图无 theme 项） | 同样无 | 一致（都无，负向证据两边对称） |
| 5.5 | 通知声音 | **有完整声音系统**：5 个 ping 音效 `ping-1-open-blip`…`ping-5-chime-b`（资产 `tmp-1-open-blip-D1y74m9N.wav`…`tmp-5-chime-b-B3aR0Am-.wav`，均 ~几十 KB）；单例 `new Audio` 播放；设置键 `notifications`/`notification-sound`/`notification-sound-enabled`（general-pane 有 `playSound` 开关）；**featureGate `sand_notification_sounds` + `isAnysphereUser===true` 双门控——默认仅内部用户开启**；i18n label（id BnX6kI/XPT37m/TS5vYS/8rSWEN/QN4KVA）；遥测 `sand.telemetry_report: notification_sound` | `index.eager-app-iGTgHP_Q.js`（搜 `ping-1-open-blip`、`t1t` 单例、`pse` gate 函数）；`chunk-general-pane-YXy_8X5a.js`；wav 在 assets 根目录 | **无**（0.18 底座 notification-host 无声音） | P1（注意：外部用户默认听不到——gate 关闭，复刻时建议同样默认关，资产需自行生成避免版权问题） |
| 5.6 | 系统通知 | 静态层未见 `new Notification` / `requestPermission`（grep 0 命中）——桌面通知可能走主进程或不存在 | —（负向） | 无 | 一致（负向证据） |
| 5.7 | 通用 spin / 进度 | `sand-1wc8ddo-B`+`ui-1wc8ddo-B`（360° 循环——**我们已有**）；不确定进度条 `ui-16nwce-B`/`ui-1hshd39-B`（-75%→-25% 循环）+ RTL 镜像 `ui-17grcni-B`/`ui-1ulpqlm-B`（-100%→294.118%，`var(--cursor-duration-1s) var(--ease-linear) infinite`）；倒计时 `ui-17fe05u-B`（scaleX 1→0） | offset 434013/5726/6222/5873/6582/6494/5802 | sand-status-spinner 自建（`sand-status-primitives.css`，`var(--cursor-spinner-sync-duration,1s) linear infinite` + paused 态）——语义等价，参数同族 | 一致（自建等价）；不确定进度条 RTL 族缺失 → P2 |
| 5.8 | 呼吸/闪烁指示族 | `sand-2t3rfm-B`（op 1↔.55，2.4s ease-in-out infinite）、`sand-1v01xhf-B`（.72↔1）、`sand-1tmrjwl-B`（.3↔.9）、`sand-mbmak-B`（45/55 步进切换 1s infinite）、`ui-13kz0yu-B`（1↔.5，`var(--cursor-duration-2s) var(--ease) infinite`）、`ui-etzqjq-B`（1↔.4，2s）、`ui-z8duxp-B`（1→.15，1s linear infinite）、`ui-fjgjd5-B`（0→.6）、`ui-zlch56-B`（0→.4）、`ui-sshkjk-B`（50% 步进）、`ui-bsv3sl-B`（warn 底色脉冲） | offset 429914/427622/427693/427845/2529/2423/2371/2585/2478/2738/1915 | pb-pulse（1.4s ease-in-out infinite 50% op.5）覆盖 skeleton 一个点 | P1（live 指示的统一「呼吸语言」缺失） |
| 5.9 | 多 spinner 相位同步 | `animation-delay: calc(var(--cursor-spinner-sync-delay,0s) - .125s …)` 8 档负延迟 | index.css delay 原子 | 无 | P2 |
| 5.10 | floating-anchor 定位过渡 | `ui-1j3rbwo-B`：`translate3d(var(--ui-floating-anchor-offset-x/y),0) scale(.98)`，`var(--cursor-duration-fast) var(--ease-sharp)`——浮层跟随锚点移动的平滑过渡 | offset 6088 | 无 | P1 |
| 5.11 | RTL 镜像机制 | 全部位移动画用 `var(--sand-inline-sign,1)` 乘方向（-1 in RTL），一套 keyframes 双向通用 | wipe/pop 族 keyframes 定义体 | 无此机制（我们暂不做 RTL） | P2（记架构要点） |

**§5 拆单建议**：①「呼吸/闪烁指示族统一」（P1，纯 CSS，1 小单）；② reduced-motion 降级替代机制（P1，建议做成全局 mixin，与后续所有动画单配套）；③ 声音系统（P1，但 gate 默认关 + 资产自建，可延后）。

---

## 附录 A · @keyframes 全量清单（147/147）

> 状态三态：**已有** = 我们构建产物同名同体；**近似** = 我们有语义等价自建；**缺失** = 无。
> 参数列 `?` = JS 组合串未配对到（该动画由 CSS-only 组件或运行时 style 挂参，不影响复刻——定义体+常用档已给）。

### A1 消息/内容区（18）
| keyframes | 定义体摘要 | 时长/easing/迭代 | 状态 |
|---|---|---|---|
| sand-1im2lgs-B | ty12px scale.94 op0→1（55% op） | .24s cb(.23,1,.32,1) backwards | 已有 |
| sand-aj6w25-B | scale .985→1 op0→1 | cb(.22,1,.36,1) | 缺失 |
| sand-1rqlz9z-B | ty12px→0 | （配 1.1 组） | 缺失 |
| sand-1ozwp7x-B | 锚点 bg 闪（40% 峰） | 2.5s ease-out | 缺失 |
| sand-zzcn73-B | box-shadow ring 0→3px 脉冲 | ? | 缺失 |
| sand-cqmojk-B | dots 浮动 op.35→1 ty-2px | 1.4s ease-in-out infinite +60ms 交错 | 缺失 |
| ui-cqmojk-B | dots 浮动（ui 库同款，`.ui-gdswny` 挂载） | 同族 | 缺失 |
| sand-tru6e3-B | dots 纯 op | ? | 缺失 |
| sand-14ob7dc-B | dots reduced 只 fade | ?（reduced 分支） | 缺失 |
| sand-9wdec0-B | thinking 三段旋转 | .28s both | 已有 |
| sand-1fny1my-B | shimmer 200%→-200% | ? | 缺失 |
| sand-1ofn8cw-B | shimmer 200%（步进） | 2.2s steps(60,end) infinite | 缺失 |
| sand-1i4k03n-B | shimmer 100%→-100% | ? | 缺失 |
| sand-168qp9p-B | widget 卡 ty8px scale.985 | ? | 缺失 |
| sand-2u9j2r-B | blur4+height0+ty12 展开 | .24s cb(.23,1,.32,1) backwards | 缺失 |
| sand-165dm8x-B | height0+margin-22 展开 | linear(33 档) backwards | 缺失 |
| sand-1qxssdl-B | height0+ty-4 展开 | ? | 缺失 |
| sand-15rdj90-B | 收起 height→0 ty-4 | ? | 缺失 |
| sand-1fiuodg-B | margin-top -20px→0 | .24s cb(.23,1,.32,1) backwards | 缺失 |

### A2 出场/fade 族（14）
sand-1jn504y-B（.15s ease-out forwards）、sand-1eysfap-B（.18s ease-out both+vis）、sand-1mi9bte-B（.16s both）、sand-w2c1lr-B（op0 保持）、sand-1uvc5f5-B（scale.92）、sand-12uhc3t-B（ty8px .14s cb(.4,0,1,1) forwards）、sand-14y3t1f-B（ty10px）、sand-196fsjt-B（scale.6）、sand-is4ffh-B（scale.3）、sand-jdeiqf-B（scale.9）、sand-18gwwlv-B（blur4 scale1.18）、sand-1p3jh78-B（ty20px .3s spring both）、sand-2is9k8-B（ty6px+pe .3s spring both）、sand-nficoj-B（ty-7px+vis .22s cb(.2,0,0,1) both）——全部**缺失**。

### A3 入场位移/缩放族（22）
sand-11nrck8-B（scale.92，**.18s cb(.22,1,.36,1) backwards**）、sand-1xy63tl-B（scale.94）、sand-ef87bi-B（ty-6px s.98，.16s cb(.16,1,.3,1)）、sand-finfha-B（ty2px s.98）、sand-gcq4cg-B（ty4px，.18s cb(.22,1,.36,1) backwards）、sand-hw0koq-B（ty-2px，.1s cb(.23,1,.32,1)）、sand-m8u80m-B（ty4px s.98，**已有**）、sand-lbo9vm-B（tx±6px s.96，.16s backwards）、sand-1bzi508-B（ty6px）、sand-1ej958t-B（ty7px，.22s cb(.2,0,0,1) both）、sand-1uknk9t-B（ty8px）、sand-1lgszu9-B（ty-4px→0）、sand-rngkwq-B（ty8px，.3s spring backwards）、sand-117yj9g-B（ty-50% s.8）、sand-iekrje-B（s.6）、sand-qestwo-B（s.4，.5s linear 43 档 spring）、sand-1ixh1oh-B（s0→1）、sand-1kjvg8k-B（ty-60%，.26s cb(.23,1,.32,1)）、sand-x1hx13-B（ty20px，.3s spring both）、sand-1aw1ihd-B（ty6px+pe，.3s spring both）、sand-10dagxi-B / sand-13qd1cp-B（居中 ±6px，.15s cb(.2,0,0,1) backwards）、sand-1ybdlsg-B（ty7px→0，.18s ease-out both）——除 m8u80m 外**缺失**。

### A4 grid/高度展开族（7）
sand-r6vku5-B（rows 0fr→1fr，cb(.2,0,0,1)）、sand-17hk15m-B（cols+35% op，.3s spring）、sand-1ml5ke1-B（收 cols→0fr 65%op，.3s spring both）、sand-15lbet6-B（cols fade）、sand-1cva32-B（cols fade 收）、ui-g2jgno-B（rows 0fr→1fr）、ui-147arsm-B（rows 1fr→0fr）——**全缺失**。

### A5 wipe/slide 导航族（10）
sand-1098us9-B（tx±40px op，.26s cb(.22,1,.36,1)）、sand-31zqhw-B（反方向同）、sand-1724jg8-B（→100%，.26s forwards）、sand-1m9yt3f-B（from 100%，.2s cb(.22,1,.36,1)）、sand-od1efq-B（→-30%，.26s forwards）、sand-10cei6v-B（from -30%，.2s）、sand-1ajgydi-B / sand-1dth2ep-B（28px@70% swipe，.26s）、sand-18i4fvi-B / sand-1m23z4y-B（±14/28px 循环 1s infinite）——**全缺失**。

### A6 通用 fade/blink/指示族（16）
sand-18re5ia-B（fade-in，**已有**）、ui-18re5ia-B（`var(--cursor-duration-slow) var(--ease-sharp)` forwards）、ui-1jn504y-B（同参 fade-out forwards）、ui-17qceat-B（fade-out）、ui-w2c1lr-B（op0）、ui-13kz0yu-B（1↔.5，2s ease infinite）、ui-etzqjq-B（1↔.4，2s infinite）、ui-z8duxp-B（1→.15，1s linear infinite）、ui-fjgjd5-B（0→.6）、ui-zlch56-B（0→.4）、ui-sshkjk-B（50% 步进切换）、ui-bsv3sl-B（warn 底色脉冲）、sand-2t3rfm-B（1↔.55，2.4s infinite）、sand-1v01xhf-B（.72↔1）、sand-1tmrjwl-B（.3↔.9）、sand-mbmak-B（45/55 步进 1s infinite）——除 18re5ia 外**缺失**。

### A7 spinner/进度族（9）
sand-1wc8ddo-B + ui-1wc8ddo-B（360°，**均已有**）、ui-16nwce-B / ui-1hshd39-B（-75→-25 循环）、ui-17grcni-B / ui-1ulpqlm-B（RTL -100→294.118%，1s linear infinite）、ui-17fe05u-B（scaleX 1→0）、ui-16dd3bt-B / ui-1fwv1gf-B（number-roll 出/入，offset 变量）、ui-14pwc4w-B（ripple scale.8→1.6 居中）、ui-bh8efz-B（:after translate(-50%)→0%，进度滑块归位）——进度条/roll/ripple **缺失**。

### A8 ui 浮层/toast/tray 族（12）
ui-1cj6qem-B（ty-7px s.96 op.6）、ui-1kfb3go-B（ty-6px）、ui-1lgszu9-B（ty-4px）、ui-gcq4cg-B（ty4px）、ui-1uknk9t-B（ty8px）、ui-9dx7cf-B（from 100%+1px）、ui-1un21bs-B（ty8px 起）、ui-1uvc5f5-B（scale.92 出）、ui-fh2zsw-B / ui-9ekpj0-B（居中 scale .97 出/入）、ui-ba1olu-B（scale.97）、ui-1ci7j24-B（tray closed→open transform）——**全缺失**。

### A9 ui 微位移族（10）
ui-ugfnoq-B（ty -spacing-1）、ui-xyr9zh-B（出 -spacing-1）、ui-1u6t7kc-B（出 -14px）、ui-dvofgy-B（tx8px）、ui-1681bmk-B / ui-18obijt-B（tx ±spacing-4）、ui-1md0cy6-B（tx -spacing-12）、ui-nxcaz9-B（from 100%+spacing-1.5）、ui-z38a3v-B（出 -100%-spacing-1.5）、ui-1vmpo8v-B（出 -100%-1px）、ui-1yi8y4s-B（scaleY .4→1）——**全缺失**（这族是 ui 库小组件的档位，复刻时按组件需要取用）。

### A10 blur/focus 族（4）
sand-k8pbt6-B（blur4→0 + stagger delay `var(--x-animationDelay)`，.2s both）、ui-173awqc-B（blur2→0）、ui-1ivl2lv-B（出 blur2 scale.6）、ui-1r52p4e-B（outline-color→transparent）——**全缺失**。

### A11 装饰/品牌族（10）
sand-18b1hnq-B（cast bob ±amp，ease-in-out infinite——onboarding 角色浮动）、sand-6fenen-B（float up -12px s.6→1，2.4s ease-out infinite）、sand-1mf3uwn-B（hue-rotate 360+saturate1.25，14s linear infinite）、sand-1prvx64-B（squish 20/50/70% 多段，2.4s ease-in-out both）、sand-12vywve-B（pulse s1.04，2.4s infinite）、sand-a3n0u-B（按压 s1.06，.5s linear 43 档 spring）、sand-twfdbq-B（按压 s.72，.36s ease-out both）、sand-mj95pu-B（ripple s2.3 op.7→0，.56s ease-out both）、sand-6nj1zq-B（stroke-dashoffset 100px）、sand-11mlbbd-B / sand-hyntne-B / sand-1n8urz4-B（长循环位移 6.9s/11s）——我们有自建 sand-onboarding-cast-bob/step-enter/step-exit/suggestion-enter（**语义近似**，参数需对 0.78.1 复核），其余**缺失**。

### A12 语义名/panel（3）
sand-anchor-flash（1.6s ease-out，**缺失**）、hover-preview-in（`.14s var(--panel-ease-out)` scale.96，缺失）、hover-preview-fade-in（reduced 版，缺失）。

### A13 ui shimmer/reduced 配套（2）
ui-f4slbi-B（100%→-100%）、ui-1fny1my-B（200%→-200%）——**缺失**（text-shimmer 扫光）。

**A1~A13 逐名核对**：原版 147 个 keyframes 名全部出现在附录 A（脚本核对 `原版名集合 ⊆ 报告提及名集合`，输出 147/147，见回执）；分组行数与 147 的差额来自 A2/A3/A5 等段落式罗列（一行多个名）。

## 附录 B · 「不相关（理由）」排除表

以下 keyframes **不是不相关**，而是已计入附录 A；本表列出的是**建议不施工**的子集（P2 冻结项）及理由，供经理裁剪：

| 冻结建议 | 条目 | 理由 |
|---|---|---|
| 不施工 | ui-* A9 微位移族 10 个 | ui 库内部小组件档位，我们复刻面未用到对应组件；等具体组件对齐单再取 |
| 不施工 | A5 中 sand-18i4fvi-B / sand-1m23z4y-B（拖动活体） | 拖动排序手势我们未复刻 |
| 不施工 | A11 长循环装饰 3 个（11mlbbd/hyntne/1n8urz4） | 壁纸/营销面装饰 |
| 不施工 | ui-1ulpqlm-B / ui-17grcni-B RTL 进度条 | 无 RTL 计划；机制已记 §5.11 |
| 不施工 | ui-16dd3bt/1fwv1gf（number-roll）暂缓 | 依赖 toast 计数组件（§4.8），随该单带上 |
| 谨慎 | 声音 5 wav | 版权资产不可直接搬；gate 默认关（§5.5），建议自建资产 |
| 谨慎 | desktop-mount hover-preview 2 个 | 所属 panel 功能整体未复刻（RE-UI-LAYOUT 结论），不单独补动画 |

## 建议施工分组（汇总）

| 组 | 内容 | 定级 | 预估 |
|---|---|---|---|
| G1 会话动效三件套 | typing dots（1.4s+60ms 交错）+ text-shimmer + 消息入场 aj6w25/1rqlz9z + 高亮锚点 zzcn73/anchor-flash | P0 | 1 张单（view.css + transcript 组件挂载） |
| G2 浮层参数对齐 | pb-dialog-in 改 .18s cb(.22,1,.36,1) scale.92；菜单挂 A3 位移族；退场补 A2 | P0 | 1 张单（纯 CSS 层） |
| G3 wipe 视图切换 | A5 slide 族 8 个 + inline-sign 变量 | P0 | 1 张单（需 router 配合） |
| G4 按压反馈 + toast tray | a3n0u spring 按压 + ui toast tray/number-roll | P0-P1 | 1 张单 |
| G5 展开族 | A4 grid/height 7 个（工具卡/composer 涨高） | P1 | 1 张单，建议 T81 后 |
| G6 指示呼吸族 + reduced-motion 降级 | A6 + §5.1 降级替代机制 | P1 | 1 张小单 |
| G7 声音系统 | 5 ping + 设置开关（默认关） | P1 | 单独单，资产自建 |
| 并入既有单 | corner-dot 挂载核对→T76；composer 聚焦过渡→T77；market 内位移→T78/T79 | — | — |

## 局限与未验证项

1. **静态取证，未运行 0.78.1**：所有「触发条件」来自 JS 静态配对（minified），未逐条在运行态验证时序；`?` 参数项 = JS 组合串未配对到时长（CSS-only 挂载或运行时 style），复刻时以定义体+同族档位为准。
2. minified chunk 名为 hash，组件归因基于 class 字符串唯一命中（如 wipe-navigation chunk 内 `sand-vi7102`），个别归因可能偏到同 class 的其他使用处。
3. 我们侧「现值」取自源码 + 构建产物静态读取，未起 Xvfb 跑 computed style 对照（工单允许源码锚点；如需 computed 读数可后补 probe）。
4. 流式呈现（§1.11）的负向证据（无 typewriter）基于关键词 grep，不能排除混淆后的逐字逻辑；shimmer 机制本身有 token+keyframes 双重实证。
5. 系统通知（§5.6）grep 主进程代码未做（本单只取 renderer asar）；主进程侧待后续。
