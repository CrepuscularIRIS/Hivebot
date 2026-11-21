# RE-RAIL-TASKS · 1.1.0 侧栏 rail / floating controls / tasks 岛 + settings 关闭钮改名

日期：2026-11-15 · R2 取证单（1.1.0 基线迁移 M3），T96（侧栏多选）开单前置
方法：纯静态。1.1.0 解包 `deb110/asar/`（renderer JS/CSS），对照组 `deb0781/asar/`。工具：`harness/cssprobe.py`（CSS 字节偏移+上下文）、`harness/appprobe.py`（JS 偏移+上下文）、`harness/kfmap.py`（keyframe→消费类→chunk）。未运行原版，无渲染实测。

锚点缩写：
- **APP** = `deb110/asar/dist/renderer/assets/index.eager-app-DNSDeodN.js`（@字节偏移，或给唯一串 grep 锚）
- **CSS** = `deb110/asar/dist/renderer/assets/index-BkOHlEB9.css`（单行压缩文件，@字节偏移；复现用 `python3 -I harness/cssprobe.py deb110/asar/dist/renderer/assets '<串>'`）
- **L** = `deb110/asar/dist/renderer/assets/chunk-layout-90tUhSzr.js`
- **TSL** = `deb110/asar/dist/renderer/assets/chunk-tasks-sidebar-list-C6Zq7qhV.js`
- **APP078** = `deb0781/asar/dist/renderer/assets/index.eager-app-iGTgHP_Q.js`
- **T** = `harness/out/tokens.tsv`、**KF** = `harness/out/keyframes.tsv`

---

## 0. 结论先行

1. **88px rail 不是 1.1.0 新形态**——0.78.1 折叠侧栏就是 88px（`APP078@948803` 区 `eqe(e){return e==null?0:e.isCollapsed?88:e.expandedWidth}`；1.1.0 同款在 APP@1248022 区 `Hat/Uat`）。1.1.0 新增的是：①把 88 提成 token `--sand-sidebar-rail-width`（CSS@471978）；②**easy mode 分层状态机**（solo/few/many 三档 + 用户 choice + 全隐藏 `hidden` 模式，experiment `sand_easy_mode` 门控）；③**浮动控件列**（solo 档无栏时的左上浮岛）；④tasks 岛/peek。MIGRATION-DELTA §2「rail 何时出现未配对」至此配对完成。
2. **rail 出现条件**（§1）：可见会话数分档 tier（≥5 many / 2-4 few / 1 solo）× 用户选择 choice × `sand_easy_mode` 开关。many 档=传统展开/折叠(88)；few 档默认 rail；solo 档默认整个侧栏**隐藏**（不是 rail），可切 rail。会话列表在 rail 态不消失——rail 上是图标钮，点开**右挂 popover 列表**（`NM`/`Zbt`，placement right-end）。
3. **floating controls**（§2）＝ `kxt` 组件、语义类 `sand-sidebar-floating-controls`，`position:fixed; top:0; inset-inline-start:0; padding-inline-start:var(--sand-floating-controls-start)`，仅 solo 档渲染（`n===solo`），内含 侧栏开关钮 + 新建 Bot 钮（rail 不显示时）+ 更新点 + tasks 岛按钮。`--sand-leading-chrome-inset` 由 chat header 的 grid 列消费（`sand-chat-header`）。
4. **tasks 岛是 peek**（§3）：常驻一个 40px 高的 count 药丸（island，`data-tasks-peek-island`），点击展开成卡片（card，`--tasks-peek-card-width: min(max(island+10,360px),100cqi-16px)`），**clip-path 从药丸形揭开幕布**（4 个 keyframes，含 .5px 描边修正对）+ **计数药丸在两位置间平移**（4 个 keyframes）。8 个 keyframes 全部配对，见 §3 表。
5. **tasks 侧栏列表是新组件族**（§4）：独立 chunk（TSL），数据不是会话 roster，而是 per-agent 任务 + automation run + pending 提交（行 kind: `task`/`automation-run`，key `${agentId}/${taskId}`）。与 chat roster（`agents.rows`，tier 计算用）是两条数据链。
6. **`sand-settings-panel__close` 确认消失**（§5）：面板根 id 改为 `` `sand-settings-panel-${id}` ``（+`-heading`），关闭钮换成通用对话框件 `re.CloseButton`（圆 ghost icon `close`，aria-label i18n `cu6iol`）。我们 spec 共 **7 个文件 9 处**写死 `__close`，列在 §5.3。

---

## 1. rail 何时出现（tier × choice 状态机）

### 1.1 状态机核心（全在 APP）

| 角色 | 代码 | 锚点 |
|---|---|---|
| 模式枚举 | `hidden` / `rail` / `expanded`；每档合法集 `Rce={solo:['hidden','rail'], few:['rail','expanded']}` | APP@274349 `` var Rce={solo:[`hidden`,`rail`],few:[`rail`,`expanded`]} `` |
| 分档 | `zce(n)`: `n>=5?'many':n>=2?'few':'solo'`（n=排除 `Fd(e)` 后的 roster 行数；输入来自 `MMt()` 的 `agents.rows`，loading/恢复态返回 null） | APP@274349 区 `function zce`、`function Bce`；调用侧 `` KEr `` 内 `Bce({loadState:…,rows:i.agents.rows})`（grep `sand_easy_mode`） |
| 求解当前模式 | `Vce({tier,layout,choice})`: many→`layout.isCollapsed?'rail':'expanded'`；否则 choice 命中本档合法集则用 choice，否则默认 solo→`hidden`、few→`rail` | APP@274630 `` function Vce `` |
| 写回 | `Hce({tier,current,next})`: many→`{layout:next,choice:null}`；solo→只写 `choice={tier,mode:'rail'}`；few→`choice={tier,mode:isCollapsed?'rail':'expanded'}` | APP@274712 `` function Hce `` |
| hook | `Bp()`：tier=`Gfe()`（easy-mode context），null→回退旧二态 `isCollapsed?'rail':'expanded'`；否则 `Vce`。返回 `{expandedWidth,isCollapsed,tier,mode,setLayout,toggleSoloRail}` | APP@318157 `` function Bp(){let e=(0,Q.c)(23),{uiState:t}=$(),n=Gfe() `` |
| solo 档切换 | `n==='solo'&&t.setEasySidebarChoice({tier:n,mode:o==='hidden'?'rail':'hidden'})`（hidden↔rail 翻转） | APP@318810 |
| easy mode 门 | `` GEr=`sand_easy_mode` ``；`KEr`: `f = yp('sand_easy_mode') ? tier : null` 供 `Wfe`（=context `Ufe`）下发；`Gfe()=use(Ufe)` | APP grep `` var GEr=`sand_easy_mode` `` 与 `` function Gfe(){return(0,X.use)(Ufe)} ``（@317984）；`yp`=experiment 取值、`wp`=exposure（KEr 内 `l(GEr)`） |
| hidden=整栏不渲染 | `qEr`: `a = n&&i!==\`hidden\`` 才挂 `cst`（sidebar context provider） | APP grep `` function qEr(`` |
| 持久化 | 旧键沿用：settings map `sand.sidebar.width` / `sand.sidebar.collapsed`（0.78.1 APP078@912043 区 `BT={sidebarWidth:\`sand.sidebar.width\`,sidebarCollapsed:\`sand.sidebar.collapsed\`}`，expandedWidth 夹 240-400 默认 280）；1.1.0 另加 `uiState.easySidebarChoice`（`t.easySidebarChoice`/`t.setEasySidebarChoice`，0.78.1 为 0 处 → 1.1.0 9 处，probe.py 实测） | APP@318157 区；`harness/probe.py deb0781/asar deb110/asar easySidebarChoice` → `[0->9]` |

### 1.2 宽度与网格

| 项 | 值 | 锚点 |
|---|---|---|
| rail 宽 token | `--sand-sidebar-rail-width: 88px`（utility 类 `.sand-gma4bb`，挂在 shell 根 `S8.shell`） | CSS@471978；APP `var S8=`（grep `var S8={shell:`，@4416900 区） |
| 实际列宽 | JS 侧仍是 88 字面量：`Hat(e,t)=JD(e,t)?88:e.expandedWidth`、`Uat(e)=e.isCollapsed?88:e.expandedWidth`（+chat 最小宽 424 数学 `Wat/YD/Gat`） | APP@1248022 区；0.78.1 同构 `eqe` APP078@948803 区 |
| 列宽落地 | aside 经 stylex 注册属性 `--x---sand-sidebar-width` → `--sand-sidebar-width`，消费端 `var(--sand-sidebar-width,280px)` | @property 声明 CSS@436098；别名类 `.sand-1ocdamo` CSS@472023；消费例 CSS@749479（chat 列 max-width 公式） |
| shell 网格 | 有侧栏 `.sand-1g5hyr8{grid-template-columns:280px minmax(0,1fr) auto}`；无侧栏（sidebar prop null）`.sand-14fal1x{grid-template-columns:0 minmax(0,1fr) auto}` | CSS@581197 / @580328；切换点 APP `C8` 内 `n==null&&S8.shellWithoutSidebar`（grep `shellWithoutSidebar`，@4419985 区） |
| `--sand-view-stage-top` | 新档 48px（`.sand-gqqidp`，stage 覆盖层 `gSr` 用）与旧 84px（`.sand-1y0k1wl`=`calc(60px+24px)`，旧 chat-header 舞台用）并存 | CSS@472794 / @472835；48px 消费：`.sand-1s9bup3{height:calc(var(--sand-view-stage-top)+40px)}` CSS@729247（chunk-bot-manage-screen / chunk-team-bot-preview-page 用）、`.sand-1k4d2j0{top:…}` CSS@776224（chunk-cart-stage-0 用）、`.sand-p80t6e{padding-top:…}` CSS@770367 |

### 1.3 rail 态会话列表去哪了

rail 列上每个条目是图标钮（`AM` 组件，`variant:'rail'`），点击弹**右挂 popover** 渲染完整列表：

- 条目渲染分两路：`$bt({entry,rail})` → 无 renderList 时 `MM({entry,variant:'rail'})`（纯钮+count 徽标 `jM`），有 renderList 时 `NM({entry,rail,renderList})`（popover 内嵌列表）。solo 档 floating controls 里用 `Qbt`（chrome 变体）。锚点：APP@1654121 区 `` function Qbt`` / `` function $bt``、APP@1650678 `` function MM(``、其后 `` function Zbt(``（popover 锚：`getBoundingClientRect` 合成 anchor，`placement: SD()==='rtl'?'left-end':'right-end'`）与 `` function NM(``。
- rail 上的具体成员（展开的侧栏组件，@1672321 区）：新建钮 `Vbt`（`onClick:()=>i('rail')` 入口、entrypoint 枚举 `Jre=['sidebar','rail','search']` APP@225414）、tasks 钮 `$bt({entry,rail})`、礼物 `KA({placement:'rail'})`（@1672321 区 `Ht&&!qe?Vbt…`）。

---

## 2. floating controls（浮岛）

### 2.1 组件与锚定

| 项 | 值 | 锚点 |
|---|---|---|
| 组件 | `kxt({isRailShown,isUpdateDotVisible,newBotMenu,tasksEntry,onNewBot,onToggleSidebar})`，仅 solo 档挂载：`Qs = n==='solo' ? kxt({isRailShown:r==='rail',…,tasksEntry:En,…}) : null` | APP `` function kxt(``（@1673987）；挂载点 APP@4619765 |
| 语义类 | `sand-sidebar-floating-controls`（1.1.0 新增，0.78.1 为 0 处） | APP@1673987 区 `` rw(`sand-sidebar-floating-controls`,{className:`sand-ixxii4…`}) ``；probe.py `[0->3]` |
| 定位 | `position:fixed`（sand-ixxii4）· `top:0`（sand-13vifvy）· `inset-inline-start:0`（sand-1o0tod）· `z-index:5`（sand-1u8a7rm）· `padding-inline-start:var(--sand-floating-controls-start,12px)`（sand-1bs7rai）· `padding-block:10px`（sand-196oxwk）· `min-height:var(--sand-titlebar-block,38px)`（sand-1btmrwh）· `gap:6px`（sand-15xphe）· `pointer-events:none`+子级 auto（sand-47corl / sand-67bb7w） | CSS@624756 / @771873 / @589405 / @653638 / @492324 / @756523 / @498051 / @624498 / @623406（`padding-inline-start:var(--sand-floating-controls-start,12px)`） |
| 内容 | ①侧栏开关钮 `sand-sidebar-floating-controls__toggle`（icon `layout-sidebar-left`，aria-expanded=isRailShown，aria-label i18n `+OFRL2` "Toggle compact sidebar"）；②新建 Bot 钮（icon `plus`，i18n `2hjDEV` "New Bot"，`FM.button`，**rail 显示时隐藏**：`b=n?null:d`）；③更新点 `sand-sidebar-floating-controls__update-dot`（`r&&!n` 才显示，i18n `OaoXkB`）；④tasks 岛 `Qbt`（`n||a==null?null:Qbt`，即 rail 显示时不重复渲染） | APP@1673987 区全部四个分支；i18n 值查荷兰语包 `chunk-core-BalR1HP0.js`（`+OFRL2`="Compacte zijbalk in- of uitschakelen"） |

### 2.2 inset 值链（三个变量怎么联动）

```
--sand-sidebar-rail-width: 88px                                    (.sand-gma4bb, shell 根默认)
--sand-floating-controls-start:
  默认(shell 无标题栏): calc((rail-36)/2) = 26px                   (.sand-j9uk2m)      CSS@470369
  titlebar 态(mac):     max(88px, rail+8px) = 96px                 (.sand-tsht73)      CSS@470471
--sand-leading-chrome-inset:
  over-chat:            calc(fcs + 2*36px + 6px) = 104px           (.sand-5eu4uf)      CSS@470663
  over-chat-with-tasks: calc(fcs + 3*36px + 2*6px) = 146px         (.sand-13tgf9u)     CSS@470767
  over-rail:            max(0px, calc(fcs + 36px - rail)) = 0      (.sand-2lkz7f)      CSS@470930
  over-rail rtl:        calc(fcs + 36px)                           (.sand-48qsqq:dir)  CSS@479985
```
36px = 浮岛按钮直径。模式选择点（APP@4605938）：`To=null; n==='solo'&&r==='rail' ? 'over-rail' : n==='solo' && (En==null?'over-chat':'over-chat-with-tasks')`——即**只有 solo 档才产生 leading chrome inset**（`En`=tasks 岛 props，见 §3.1）；few/many 档 `To=null`（侧栏自身占位）。

消费端：
- `.sand-1bs7rai{padding-inline-start:var(--sand-floating-controls-start,12px)}` CSS@623406（浮岛本体）；
- `.sand-ejw4f8{padding-inline-start:var(--sand-leading-chrome-inset,0px)}` CSS@623879；
- **chat header** `rw('sand-chat-header', …sand-1vyfm7a…)`：`grid-template-columns:minmax(var(--sand-leading-chrome-inset,0px),1fr) auto minmax(min-content,1fr)` CSS@583618 —— 聊天头把第一列最小宽设为 inset，给浮岛让位（APP@3534288 / @3537762 两处 `sand-chat-header`）；
- win 控件合并避让 `.sand-edxkzs:dir(rtl){padding-left:calc(var(--sand-window-controls-inset,0px)+var(--sand-leading-chrome-inset,0px))}` CSS@791333。

### 2.3 `--sand-nav-bar-inset`（10/16px）

`:root,.sand-ywd4n6{--sand-nav-bar-inset:10px}` CSS@463691（root 默认）；`.sand-v3k96g,.sand-v3k96g:root{--sand-nav-bar-inset:16px}` CSS@464723。16px 覆盖组 `J5e={"sand-ywd4n6":"sand-v3k96g sand-ywd4n6"}` 在带返回钮的对话框内页头部使用（APP@2675129 `` Ga(J5e,TK.header) `` + `tE.BackButton`）。消费规则族：`.sand-rrgm8r{padding-inline:var(--sand-nav-bar-inset)}` CSS@500751、`.sand-7h0p70{padding-inline-start:var(--sand-nav-bar-inset)}` CSS@623977（chunk-pane-header 消费）、`.sand-11iys7l{top:calc(var(--sand-nav-bar-inset)-2px)}` CSS@774528、`.sand-1my42ui{height:calc(28px+2*var(--sand-nav-bar-inset))}` CSS@728979 等。

---

## 3. tasks 岛（peek）与 8 个 keyframes

### 3.1 结构：island（药丸）↔ card（卡片）

| 元素 | 说明 | 锚点 |
|---|---|---|
| island | 常驻药丸 `div[data-tasks-peek-island]`，内含 count 钮 `button[data-tasks-peek-count]`（`aria-expanded:!1`，disabled 当 count=0，文案 `GtycJ/`="Tasks"，count 徽标 `OF({count,isWorking})`）+ tail | APP@1942500 区 `` "data-tasks-peek-island":!0 `` 与 `` "data-tasks-peek-count":!0 ``；组件 `` function wAt(`` |
| card | 展开卡 `EAt({peek,isOpen,listId,onClosed,onReturnFocus,renderIdentity})`：外层 hairline ring 层 `div[data-tasks-peek-ring]`、内层 clip 层、卡片内容（rows、identity、"Done" `DPfwMq`）；Escape/外点关闭（`TAt` abort 语义、`pointerdown` capture 外点、`[data-tasks-peek-trigger]` 例外） | APP `` function EAt(``（@1942 区）、`` function TAt(``；ring 标记 APP@1947089 区 |
| 尺寸联动 | `CAt(el)`：ResizeObserver 把 island 实宽写进元素 `--tasks-peek-island-width`（`${t}px`），keyframes 公式全部引用它 | APP@1941471 `` e.style.setProperty(`--tasks-peek-island-width`,`${t}px`) `` |
| 状态 | peek props `{count,isOpen,onToggle,renderList}`；`renderList` = `({surface,scrollMemory,onTaskOpened})=>Egr({rows:cn,openTaskKey:bn,…})`（即 §4 列表）。开关：`_n/vn` useState，点 island `setExpanded(!0)`，点 ring/外点收回 | APP@4591400 `` En=J?{count:Cn,isOpen:_n,onToggle:()=>vn(IEr),renderList:xn}:Tn ``、APP@4591103 `` xn=e=>{…Egr,…rows:cn…} `` |
| 变体装配 | StyleX 帧映射 `[!r<<1|!r]`（0/3=稳态，1/2=过渡帧）：expanded 态挂 reveal 类，collapsed 态挂 collapse 类 | APP@1946778 / @1949410 区两处帧表 |

`--tasks-peek-*` 全量（4 个，T "added" 行全对齐）：

| 变量 | 值/语义 | 定义锚（CSS） | 消费锚 |
|---|---|---|---|
| `--tasks-peek-island-width` | JS 按实测写入（见上） | 元素级内联 | 8 个 keyframes 公式（CSS@438970-450050）+ card-width |
| `--tasks-peek-card-width` | `min(max(calc(island+10px),360px),calc(100cqi-16px))` | `.sand-hfaihg` CSS@473065（card 根类，APP card 帧表首类 `sand-hfaihg`） | 卡片容器宽 + 4 个平移 keyframes |
| `--tasks-peek-pill-ring` | 默认 `transparent`（`.sand-4t93y2` CSS@473186）；`:focus-visible` → `var(--sand-border-focus-primary)` | `.sand-h5wex8:focus-visible` CSS@479731 | `.sand-vhybuq::before{box-shadow:0 0 0 2px var(--tasks-peek-pill-ring)}` CSS@807128 |
| `--tasks-peek-pill-tint` | 默认 0（`.sand-1a8sydg` CSS@473235）；`:hover:not(:disabled)`/`:focus-visible` → 1 | `.sand-1sb1zs9:hover,.sand-4t4vbl:focus-visible` CSS@479849 | `.sand-1okx1wz::before{opacity:var(--tasks-peek-pill-tint)}` CSS@812350（hover 遮罩） |

### 3.2 8 个 keyframes 逐个配对（定义=KF "added" 行；animation-name 挂接规则在 CSS@517227-521899 区）

两组各 4 个：**A 组 clip-path 揭示**（card 容器与 ring 层的幕布，从「island 药丸形 inset(0 侧切 … 100%-40px 高 round 20px)」变全开）、**B 组计数药丸平移**（island 位置 ↔ card 位置，dx=±(island与card宽差/2±4~6px)，dy=-6px）。每对含一个 `.5px` 修正版（描边半像素内缩，给 hairline ring 用）。

| keyframe | 帧体（要点） | 挂接类（animation-name） | 用在哪 |
|---|---|---|---|
| `sand-1x3wqqu-B` | `0%` 药丸形 clip → 全开 | `.sand-yka2fr` | **展开**：card clip 层从药丸形揭出（CSS@518354 挂接） |
| `sand-e226pz-B` | `to` 全开 → 药丸形 clip | `.sand-1xky30n` | **收起**：card clip 层收回药丸形（CSS@519749） |
| `sand-vgj3hv-B` | `0%` 药丸形 clip（`.5px` 内缩） | `.sand-1hhdyg` | 展开态 **ring 层**（`data-tasks-peek-ring` 的 div，APP@1947089 区帧表含此类） |
| `sand-76djpu-B` | `to` 药丸形 clip（`.5px`） | `.sand-j18k1z` | 收起态 ring 层（CSS@519191） |
| `sand-6v2as7-B` | `0%` translate = island 位置 | `.sand-1saz2z2` | 展开时 **count 药丸**从 island 位置起跳（APP@1949410 区帧表） |
| `sand-u4wwqd-B` | `to` translate = card 位置 | `.sand-1bkpaji` | 展开末态药丸到 card 位置（CSS@521761） |
| `sand-1mm3x9-B` | `to` translate = island 位置 | `.sand-16hgwl1` | 收起末态药丸回 island 位置 |
| `sand-1xenzp7-B` | `0%` translate = card 位置 | `.sand-k8m165` | 收起时药丸自 card 位置起跳（CSS@518424） |

定性回答提问：**是 clip-path 揭示（A 组）+ 位置平移（B 组），无 spring 弹出、无抖动**——spring/抖动类的其余新 keyframes 属别的面（§3.3）。duration/easing 未取（见局限 3）。

### 3.3 其余 37 个新增 keyframes 的归属（kfmap.py 全量跑过，摘要）

- **spotlight**：`sand-cyaqxc-B`（scale .97→1）/ `sand-n0m8po-B`（退场）→ 消费类 `.sand-13jkfic`/`.sand-8bqd1u`，**只在 `chunk-spotlight-app-FTVveRyH.js`**。→ MIGRATION-DELTA §1 的推定「对话框换实现」应更正为 **spotlight 对话框**；设置对话框 1.1.0 仍用 `translate(-50%,-50%) scale(${be})` 内联 spring（L@4802 区 `` Ve=`translate(-50%, -50%) scale(${be})` ``，`be=S?.95:1` 为 covered 收缩），T87b 参数表按此修。
- **手机通话**：`sand-rk560n-B`（margin-top -10px）→ `chunk-phone-call-zY9vkhaV.js`。
- **bot-manage 知识库**：`sand-i9a8ls-B`/`sand-uve8n3-B`（±12px 滑入）→ `chunk-bot-manage-knowledge-BJlHl6vJ.js`。
- **link 对话框**：`sand-104c5bk-B`/`sand-1d3ojud-B`（抖动 shake）→ `chunk-link-dialog-DUS-BP1b.js`。
- **view 舞台**：`sand-13k04ah-B`（24px 滑入）→ `chunk-view-Bhq2eDF7.js`；`sand-1cwcegj-B`（stroke-dashoffset 24→0 勾划）/`sand-1ii3gp8-B`（粒子抛物线 -30%,40%→70%,-110%）→ `chunk-view-DjqSqTWE.js`。
- **APP 内未配对到具名面的 24 个**（opacity/scale/translate/±56px 滑出/眨眼等，消费类在 APP 但无 tasks 邻近标记）：见 `harness/out/keyframes.tsv` added 行 + kfmap 输出；tasks 岛附近仅 `sand-1roi1zs`（opacity 1→0，APP@1950622，peek 关闭淡出 ring 尾帧，task-nearby=True）——归 tasks 岛第 9 个候选，其余未配对（§局限 4）。

---

## 4. tasks-sidebar-list（数据形状与组件族）

| 问题 | 答案 | 锚点 |
|---|---|---|
| 独立 chunk？ | 是：`chunk-tasks-sidebar-list-C6Zq7qhV.js`（0.78.1 无任何 tasks chunk；`ls deb0781/asar/dist/renderer/assets | grep -i task` 为空） | 目录对照 |
| 组件签名 | `C({rows, openTaskKey, surface, scrollMemory, onTaskOpened, onAddToChat})`，surface 取 `'sidebar'`（另有页面态）；行经 `f(c({rows,filter:'all',pending,automationRuns}))` 过滤；滚动位置记忆 `_e(scrollMemory)`（attach/reveal，`scrollTop` 双向同步） | TSL@2716 行组件头；同文件 `function _e(` |
| 行数据形状 | 扁平化行 kind：`'task'`（`key:hgr(agent.id,row.task.id)`=`${agentId}/${taskId}`，带 `isFirstInSection`）、`'automation-run'`（`key:row.key`）、节头 `'status'`（`key:\`status:${status}\``）、`'pending'`（`key:\`pending:${submission.nonce}\``） | APP `` function ggr(``（@4339308 区）、`` function _gr(``、`` function hgr(``（`` return\`${e}/${t}\`` ） |
| rows 从哪来 | `rgr({isEnabled})`：`Z6(isEnabled)` agents → `wv(ids)` tasksByAgent → `LOe()` archive → `Fhr({agents,tasksByAgent,archive,tagsByAgent})` 组装（分组、pending、归档过滤 `Hhr`=非归档且组可用计数）；`isEnabled = isPageOn || isSidebarViewOn`；`watchSidebarThreads(ids)`（`Dv()`）订阅线程 | APP@4337530 `` function rgr(``；count APP@4334730 `` function Hhr(``；使能 APP@4590496 区 `` on=$t||J,…cn=rgr(sn) `` |
| 功能开关 | `Zt=Tp()` = `{isOn,isPageOn,isComposerOn,isSidebarViewOn}`（tasks feature state）；入口 props `En = J(isSidebarViewOn) ? {count,isOpen,onToggle,renderList} : isPageOn ? {…,renderList:null} : null` | APP@4590232 `` Zt=Tp(),{isOn:Qt,…}=Zt ``；APP@4591400 `` En=J?{… `` |
| 与会话列表关系 | **新组件族**：不消费 chat roster；roster（`MMt().agents.rows`）只用来算 §1 的 tier。共用件是 automation 行（`chunk-automation-run-rows-BqsEMpKU.js` 的 `c/n/o/r/s/t` 导入）与 APP 的 entry 抽象（`MM`/`NM`/`Qbt`，见 §1.3/§2.1） | TSL import 表（文件头）；APP@274349 区 `Bce({…rows:i.agents.rows})` |

---

## 5. `sand-settings-panel__close` → 动态 id

### 5.1 1.1.0 新写法

| 项 | 值 | 锚点 |
|---|---|---|
| 面板根 id | `` Fe=`sand-settings-panel-${i.id}` ``（i=当前 section），heading id `` `${Fe}-heading` `` | L@3691 区 `` Fe=`sand-settings-panel-${i.id}` `` |
| 导航 aria | nav 按钮 `` "aria-controls": n?`sand-settings-panel-${e.id}`:void 0 ``（+`aria-current:'page'`） | L@4802 区 |
| 对话框类 | `className:'sand-settings-dialog'`（语义类；沿用 coverEnter/coverExit/`data-sand-settings-covered` inert 机制） | L@7581 区 |
| 关闭钮 | 不再有 `__close` 类。改为通用件 `re.CloseButton`（=`nnt`）：`dT` 圆形 ghost icon 钮，icon `close`，aria-label i18n `cu6iol`（荷语包 "Dialoogvenster sluiten"，英语约 "Close dialog"），挂 `M.closeFloating`（top:10px 浮层位） | L@5895 区 `` re.CloseButton,{onClose:s,style:M.closeFloating} ``；APP `` function nnt(``（`label:d=s({id:\`cu6iol\`})`、`style:[$T.close,a]`）；i18n `chunk-core-BalR1HP0.js` `"cu6iol":["Dialoogvenster sluiten"]` |
| 定位换算 | 0→1：`sand-settings-panel__close`、`sand-settings-panel-${`、`aria-controls:\`sand-settings-panel-` 均 0.78.1 为 0 处（probe.py） | `python3 -I harness/probe.py deb0781/asar deb110/asar 'sand-settings-panel__close' 'sand-settings-panel-${'` |

### 5.2 迁移含义

面板根不再是「一个滚动容器配专属关闭钮」，而是每 section 一个带 id 的面板 + 对话框件级关闭钮。可 grep 的新锚串：`sand-settings-panel-${`（模板串）、`sand-settings-dialog`、`cu6iol`（i18n id）。注意 `nnt`/`dT` 是哈希名，别写进 spec。

### 5.3 我方 spec 写死 `__close` 的位置（grep `app/ui/tests/e2e/*.spec.ts`，共 7 文件 9 处）

| 文件:行 | 用法 |
|---|---|
| `app/ui/tests/e2e/grok-dead-entries.spec.ts:172` | `page.locator('.sand-settings-panel__close')` |
| `app/ui/tests/e2e/grok-dead-entries.spec.ts:174` | `elementFromPoint(...)?.closest('.sand-settings-panel__close')` |
| `app/ui/tests/e2e/theme-dual.spec.ts:184` | `.click()` |
| `app/ui/tests/e2e/t50a-no-key.spec.ts:107` | `.click()` |
| `app/ui/tests/e2e/t50-models.spec.ts:52` | `.click()` |
| `app/ui/tests/e2e/t75-font-stack.spec.ts:58` | `.click()` |
| `app/ui/tests/e2e/t73c-connector-grant.spec.ts:167` | `.click()` |
| `app/ui/tests/e2e/t57-settings-layout.spec.ts:68` | `pick(q('.sand-settings-panel__close'),[])` |

（我们自研 UI 若沿用 `__close` 类名则 spec 不必改；只有对齐 1.1.0 选择器时才动。这 9 处是「若对齐」的清单。）

---

## 6. 未配对 / 局限

1. **未运行时验证**：全部结论来自静态读包；tier 阈值（5/2）、easy mode 实验放量、hidden 档视觉未实机确认。`sand_easy_mode` 是否默认全量（`yp()` 返回值）未取证——flag 求值在运行时。
2. **rail 列内部布局细节未逐类解析**：rail 态条目行（`AM` variant rail）的尺寸/间距类（哈希名）未展开；只有入口/开关/宽度/网格配对。T96 若需要 rail 行像素规格，需再开单（可用 0.78.1 collapsed 行规格起步——`w8e({…isRail…})` 同构在 APP078@1288585 已存在）。
3. **peek 动效的 duration/easing 未取**：8 个 keyframes 只配对了名字→挂接类→帧体；时间曲线在伴随类（帧表中的 `sand-tcomo0`/`sand-19usayd` 等）里，未解析。
4. **APP 内 24 个新 keyframes 未配对到具名面**（§3.3 末）：消费类在 APP（无邻近 tasks/具名 chunk 标记），涉及面待 spotlight/反馈/用量等后续 RE 单；另有 `sand-1roi1zs` 疑似 peek 尾帧（task-nearby）。
5. **`--sand-view-stage-top:48px` 的 `gSr` 归属**只到「stage 覆盖层」（labelledBy/cover/onClose 包装），它对应哪个产品面（bot-manage？cart？）未追；其 84px 旧档消费组件同未逐个命名。
6. tasks 岛在 **rail 变体**下的摆放（`$bt({entry,rail})` 的 popover 行为）只有入口证据，popover 内容宽度/行规格未取。
7. i18n 引证用了荷兰语包（`chunk-core-BalR1HP0.js`）反查文案（英语主包未定位到独立文件）；语义按 key 对应，英文措辞可能有差异（`cu6iol` 推定 "Close dialog"）。
