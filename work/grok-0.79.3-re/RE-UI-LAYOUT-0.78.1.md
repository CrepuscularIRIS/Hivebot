# RE-UI-LAYOUT · 0.78.1 设置 / 市场 / 连接器 UI 布局像素规格 + Windows 平台分支

日期：2026-11-11 · 派工单 `work/ui-polish-win/REA-TASK-layout.md`（BRIEF 要求 1，PLAN R1）
方法：①静态——CSS 规则拆分表（`work/p5-parity/evidence/078-css-rules-split.txt`，8,871 条，下称 **CSSR L行号**）+ 两套主题 token（`work/p1-re/evidence/theme-tokens.css`，静态求值生成，下称 **TT**）+ bundle 精读；②运行时——免登录渲染脚手架（loopback HTTP + preload 桩 + headless Chrome CDP，方法承 `work/p5-parity/RE-stub-boot.md`；新驱动 `work/ui-polish-win/harness/drive2.mjs` 与 `setprobe`，1280×800@1）。产物未执行原版 Electron 主进程、未登录、未联网。

锚点缩写：**APP** = `renderer/assets/index.eager-app-iGTgHP_Q.js`（@字节偏移）· **GPANE** = `chunk-general-pane-YXy_8X5a.js` · **MAINC** = `electron-main/main-core.cjs` · **MAINA** = `electron-main/main-app.cjs`。token 值格式 `light / dark`（均取自 TT 的 `[data-theme=cursor-light|dark]` 块，静态求值已抽样核对源码规则）。

---

## 0. 结论先行

1. **T56「暗色 primary 白底白字」定论（CSS 级）**：原版默认按钮 = `sentiment:neutral × variant:primary`（`_C` 组件默认值，APP@837800 区），底色 `--sand-bg-primary`（dark **#f5f5f5 白**）而**字色用 `--sand-text-inverted`（dark #121212 黑）**，不是 `--sand-text-on-primary`。`--sand-text-on-primary` 只配 **accent/danger/warning 的深色底** primary（dark #116dd2/#cf2b35），此时它= #f5f5f5 白字才成立。**我们的修法：neutral 语义 primary 的字色必须换成 `--sand-text-inverted`（或等价地让我们的 `text-on-primary` 在 dark 取深色），白底白字即消除**（§2.2 表 + 证据行）。
2. **设置对话框 = 900×min(700px,100vh−96px) 模态**，与市场浮层同一个 `sand-dialog` 体系、同一内容高度 token；左导航 **198px**；外壳底色是 **`--sand-bg-chrome`（窗框色，dark #121212）不是 bg-elevated**（渲染实测 rgb(18,18,18)，§1.1）。General 区实际行序已由渲染 DOM 钉死（§1.5）。
3. **Windows 分支**：Windows 用 **titleBarOverlay（系统自绘窗口控件）**：`{height:51, color:主题chrome色, symbolColor:亮度自动黑白}`，全屏切 43px+#141414；Linux 用**自绘三钮 36×28**（右侧 12px 边距、hover=text-primary 8%）；两者 titlebar 块都取 52px 档、`isWindowControlsVisible = !darwin && !fullscreen`。差异清单见 §6（可直接对照 T54 错位表）。
4. 渲染参照图 7 张归档 `work/ui-polish-win/ref/`（1280×800：设置 General/Updates × 亮暗 + 市场外壳；1440×900@2：市场列表亮暗复制自 R-04 归档）。

---

## 1. 设置对话框（第 1 面）

### 1.1 外壳（modal）

| 组件 | 属性 | light | dark | 变量名 | 锚点 |
|---|---|---|---|---|---|
| dialog surface | 宽 | `min(900px,100vw−32px)` | 同左 | — | CSSR L8675 `.sand-1sdb7ul`；chunk-layout `k.dialog.kzqmXN=sand-1sdb7ul`（渲染实测 rect 900×696 @1280×800） |
| | 高（内容） | `min(700px,100vh−96px)` | 同左 | — | CSSR L7980 `.sand-xe7e0x`（设置/市场共用；实测 694~696） |
| | 底色 | `#fcfcfc` | `#121212` | `--sand-bg-chrome` | TT；渲染实测 bg rgb(18,18,18)=#121212 ✓ |
| | 圆角 | 14px | 同左 | — | CSSR L5495 `.sand-ixl9f9` |
| | 边框 | 四边 `.5px` `--sand-border-secondary-translucent`（#1c1c1c1f 12% / #f5f5f51a 10%） | 同左 | — | CSSR L7814 等 6 条；渲染实测 border-top rgba(245,245,245,0.1) ✓ |
| | padding | 0 | 同左 | — | CSSR L5423 `.sand-1717udv` |
| scrim | 底色 | `#00000080`(50%) | `#000000b2`(69.7%) | `--sand-bg-scrim` | TT；CSSR L6110 `.sand-azoy5u`；solid 变体纯黑 L6014 |
| 打开动画 | 200ms `--ease-sharp` scale .97→1（平台 dialog 通用） | | | | RE-visual D1（`ui-9ekpj0-B`） |
| 平台 dialog 通用 | size sm/md/lg = `min(320/440/560px,100vw−32px)` | | | | CSSR L8660/8681/8665 |

设置专用壳层组件：`chunk-layout-DBVKePVV.js`（`k={dialog,coverEnter,coverExit,navItem,navItemActive,paneHeader}`；`data-sand-settings-covered` inert 遮罩机制）。

### 1.2 左导航（nav rail）

| 属性 | 值 | 锚点 |
|---|---|---|
| 宽 | **198px**（`sand-tqaf1t`）；容器 padding **16px 12px**（`sand-yamay9`(16/上) `sand-pdmqnj`(12/右) `sand-1l90r2v`(16/下) `sand-1g0dm76`(12/左)） | CSSR L8543、L8393/7001/8334/7056；渲染实测 nav rect [191,53,198,694] |
| nav 项 | inline-flex、padding **7px 9px**、gap 9px、icon **15×15**、label 13px/18px；行距实测 **34px**（76→110→144） | CSSR L8413/7025/8349/7085/5592；渲染实测 |
| 选中态 | bg `--sand-bg-active`（light `#1c1c1c14` 8% / dark `#f5f5f50a`→实测 rgba(245,245,245,0.08)）、**radius 8px**（渲染实测选中项 rect 173×32） | CSSR L6082 `.sand-kr7fhf`；渲染实测 |
| hover/transition | `background-color,color .12s ease-out` ×2 | CSSR L7298/7399（navItem 类） |
| 七区（真实客户端） | general/integrations/computer/permissions/vault/usage/updates；**桩下只出 General/Computer/Updates**——integrations 需 flag `grok_bot_messaging`、vault 需 `grok_bot_vault`、usage 需 `VCe()`（服务端）、permissions 需 `sand_permissions_panel`（过滤函数 `x1t` APP@2720309） | RE-SETTINGS §1；渲染实测 |
| 右分隔线 | `.5px` border-secondary（`sand-128c8uf`/`sand-18b5jzi`） | CSSR L6214/6213 |

### 1.3 pane 头部与分组标题

| 组件 | 值 | 锚点 |
|---|---|---|
| pane 标题（h2） | **17px / 500 / text-primary**（实测 24px 行高盒）；旁有 "Copy link to the X section" icon 钮 **20×20** | 渲染实测；`chunk-pane-header` |
| 分组标题（h3） | **12px / 400 / text-secondary**(68%/66%)、实测高 16、锚点钮 20×20 在左 | 渲染实测；CSSR `sand-dj266r` 族 |
| pane 右侧留白 | `padding-inline-end: calc(10px + spacing-8 + spacing-3)` = 10+32+12 = **54px**（给 pane 头动作钮列） | CSSR L7027 `.sand-1xvoj0v`（paneHeaderPad） |
| Close 钮 | 右上 icon 钮 **32×32**（实测 [1047,63,32,32]）、色 tertiary(56%) | `sand-settings-panel__close`；渲染实测 |

### 1.4 设置行（settings-row，`chunk-settings-row-Bk3z5Uty.js`）

| 属性 | 值 | 锚点 |
|---|---|---|
| 行容器 | flex、align stretch、gap **8px**(spacing-2)、padding-block **8px**、padding-inline **14px/4px**(spacing-3-5/1)、radius **`--cursor-radius-xl`=14px（运行时 kRn 注入值；静态 CSS 文件里同名变量是 12px，被运行时 `<style>` 覆盖——渲染实测分组容器 14px，复刻勿抄静态值）** | CSSR L7614 区（`sand-1qjc9v5/sand-ehausa/sand-13ly8rp/sand-cssynl/sand-1tlft3r/sand-1pkpdue`）；注入表 APP 搜 `--cursor-radius-xl: 14px`（kRn 序列化） |
| 行焦点环 | outline `.5px` `--sand-border-tertiary-translucent`、offset −.5px | CSSR L6988/6982/6970/6978 |
| 行高（含间距） | 实测 **~48px**（Theme y=324 → Language y=372）；紧凑行（label+控件）高 28（控件列） | 渲染实测 |
| label | **13px / 400 / text-primary**、行内左列 | 渲染实测；`sand-1rnznto` 族 |
| description | **13px / text-tertiary**(56%/54%)，label 下（Security Key 行实测 desc 高 18） | 渲染实测 |
| 分组容器 | gap **6px**(spacing-1-5) | CSSR L5594 `.sand-pkkfsy` |
| 分组间锚点显隐 | `--sand-anchor-reveal` 0/1 切换 | CSSR L5233/5394 |

### 1.5 General 区实际行序（运行时 DOM 实测，RE-SETTINGS 局限 4 的补全）

fixture 下（已登录 Stub Dev、flags 全关）General 区自上而下：

```
General (h2)
├─ Account
│   头像 44×44（"SD"） · 名字 13px("Stub Dev") · email · Copy email address 钮 20×20 · Sign Out（secondary/sm 药丸，实测值区 54×20）
├─ Appearance
│   Theme        label 13px + Select（56×28，值 "Light"）
│   Language     label + Select（111×28，值 "Follow System"）
├─ System
│   Microphone   label + Select（115×28，值 "System Default"）
├─ Bot           （分组标题在，行未渲染——Bot color 行依赖更多 fixture，见局限 3）
└─ Security Key
    Use hardware security keys   label + Switch（32×20，未选中）
    "Security keys from Grok Bot's computer aren't supported on this platform yet"（desc，13px tertiary；platform!=='darwin'&&!passkey 可用时文案不同，GPANE `Hr=['darwin','win32']`）
```

锚点：渲染 probe `work/ui-polish-win/ref/settings-general-light.deep-probe.txt`（DEP=16 全量）；GPANE `chunk-general-pane-YXy_8X5a.js`（组件树顺序一致）。与 RE-SETTINGS §4 类目对应：Account=§4a、Appearance=§4b 前半（Theme/Language）、System=§4b 的 Hardware acceleration/Network debugger/Notification 组（本 fixture 下未渲染）、Bot=§4b 的 Bot color/Open threads、Security Key=§4d。

### 1.6 行内控件（运行时 computed style 实测 + CSS 印证）

| 控件 | 规格 | 锚点 |
|---|---|---|
| **Select（下拉，`ui-select-trigger`）** | 高 **28**、padding `4px 5px 4px 7px`、**radius 10**、字 13/18/−0.08px、透明底 + **1px 边 `--sand-border-quaternary-translucent`**（light #1c1c1c0f 6% / dark #f5f5f50a 6%；实测 rgba(28,28,28,0.06) ✓）、gap 4（值+chevron） | 渲染实测（Theme/Microphone 两处一致） |
| **Switch（md 档）** | 轨道 **32×20**、radius 9999、未选中 bg `--sand-bg-secondary-disabled`（#1c1c1c0a 4% / #f5f5f505 4%；实测 rgba(28,28,28,0.04) ✓）+ `inset 0 0 0 .5px --sand-border-quaternary-translucent`；knob **16px 圆**（实测 [1013,678,16,16]）、bg `--sand-bg-luminous`（#fff / #f5f5f5）、`box-shadow:0 1px 3px 0 --sand-shadow-control`、位置 top 2 / start 2 → 选中 start **14**；sm 档 knob 12px / 选中 start 12px（静态，轨道尺寸未实测） | 渲染实测 + CSSR（xD 样式对象 APP@985630：`sand-smyaan`(12)/`sand-1kky2od`(16)/`sand-s7f9wi`(top2)/`sand-aoy8p5`(start2)/`sand-1r4y97`(12)/`sand-9p6ekw`(14)/`sand-7qiiw0`(bg-luminous)/`sand-1gdvyqu`(阴影)/`sand-2k1e5v`(inset ring)） |
| hover 叠层 | 轨道 hover `--sand-bg-secondary-hover`（10%/8%） | CSSR L7522 `.sand-19jy9ex` |
| checkbox（复选） | 方形勾选（`RS check/minus xs`），消费 `sand-10l6tqk` 族 | APP@833800 区（mC 组件） |

### 1.7 Updates 区

外壳同上；**桩下 pane 行未渲染**（update 行依赖 host 更新状态 RPC，桩回值不驱动行；见局限 4）。文案/键序（update-status / update-channel / automatic-updates）沿用 RE-SETTINGS §6 与 RE-FULL-0.79.3 §6。参照图 `settings-updates-{light,dark}.png`（导航选中态 + 空 pane 可对照暗色与布局）。

---

## 2. 按钮体系（第 2 面；kit 按钮 `_C`，APP@837800 区 `hC` 样式对象）

### 2.1 几何（全 variant 共用）

| 尺寸 | padding | 字号 | 高（推算） | radius |
|---|---|---|---|---|
| sm | `4px 8px` | label 12px | ~26 | 9999（药丸） |
| md | `6px 12px` | body1 14px | ~30 | 9999 |
| lg | `8px 16px` | body1 14px（icon md） | ~34 | 9999 |

锚点：CSSR L8406/7023/8344/7083（sm）、L8410/7001/8347/7056（md）、L8414/7005/8351/7060（lg）、L5540 `.sand-ymw2ht`（9999）；root `display:inline-flex align-center gap 4px` + `transition: background-color,color .12s ease-out`（L6465/5783/5587/7329/7300/7392）。press = `linear-gradient(currentcolor 12%, currentcolor 12%)` 叠层（CSSR L7535 `.sand-fxdvfh:active:not(:disabled)`）。

### 2.2 变体颜色表（**T56 的直接答案**；class → CSSR 行 → token → light/dark 值）

| variant（sentiment×variant） | 底色 token | light | dark | 字色 token | light | dark | CSSR 锚 |
|---|---|---|---|---|---|---|---|
| **neutralPrimary（默认！）** | `--sand-bg-primary` | `#1c1c1c` | **`#f5f5f5`（白）** | **`--sand-text-inverted`** | `#fcfcfc` | **`#121212`（黑）** | bg L6103 `.sand-8rotk8`；**color L6394 `.sand-sa7k8x`** |
| neutralPrimary hover | `--sand-bg-primary-hover` | `#363636` | `#dbdbdb` | — | | | L7519 `.sand-5b9xvv:is(:hover,[aria-haspopup][aria-expanded=true])` |
| neutralPrimary disabled | `--sand-bg-primary-disabled` | `#1c1c1c26`(15%) | `#f5f5f521`(13%) | text-primary 30% mix | | | bg L7669；color L7681 `.sand-g7klql` |
| neutralSecondary | `--sand-bg-secondary` | `#1c1c1c0f`(6%) | `#f5f5f50a`(4%) | `--sand-text-primary` | `#1c1c1c` | `#f5f5f5` | bg L6114；color L6397 |
| neutralSecondary hover/disabled | `--sand-bg-secondary-hover`/`-disabled` | `#1c1c1c1a`/`#1c1c1c0a` | `#f5f5f514`/`#f5f5f505` | | | | L7522 / L7671 |
| neutralTertiary（ghost） | `#0000` 透明，hover `--sand-bg-secondary` | — | — | `--sand-text-primary` | | | L6070 `.sand-jbqb8w`、L7523 |
| accentPrimary（蓝） | `--sand-bg-accent-primary` | `#1680f3` | `#116dd2` | `--sand-text-on-primary` | `#ffffff` | `#f5f5f5` | bg L6078；color L6395 `.sand-xcaa6e` |
| accentPrimary hover | `--sand-bg-accent-primary-hover` | `#126fd4` | `#1784fb` | | | | L7509 |
| accentSecondary | `--sand-bg-accent-secondary` | blue/0+9% `#1e86fc17` | `#1884fc12` | `--sand-text-accent-primary` | `#0b6dd3` | `#4d9bff` | L6080；L6390 |
| accentTertiary | 透明，hover accent-secondary | | | accent-primary 字 | | | L7511 |
| dangerPrimary | `--sand-bg-danger-primary` | `#e72e3b` | `#cf2b35` | `--sand-text-on-primary` | `#ffffff` | `#f5f5f5` | L6088；L6395 |
| dangerPrimary hover | `--sand-bg-danger-primary-hover` | `#c82532` | `#f73643` | | | | L7514 |
| dangerSecondary | `--sand-bg-danger-secondary` | red/0+9% `#fb2b3e17` | `#fc2c3e12` | `--sand-text-danger-primary` | `#cd2834` | `#ff6463` | L6089；L6392 |
| dangerTertiary | 透明，hover danger-secondary | | | danger-primary 字 | | | L7516 |
| warningPrimary | `--sand-bg-warn-primary` | `#da830e` | `#c8770c` | `--sand-text-on-primary` | `#ffffff` | `#f5f5f5` | L6119 |
| warningSecondary/Tertiary | warn/0+9%（`#f5931217`/`#f6941212`）；tertiary 透明 | | | `--sand-text-warn-primary`（`#aa6300`/`#e28600`） | | | L8378 区 |
| held/pending 态 | `cursor:not-allowed` + `inset 0 0 0 1px --sand-border-quaternary-translucent`（主钮 pending） | | | | | | L6451、L6295 `.sand-pmb8bl` |
| 卡内 elevated 变体 | `cardLabel/cardPrimaryDisabled/cardPress/cardPendingFrame`（surface=elevated 卡宿主时换色；审批卡上即此态） | | | | | | hC 对象后半（APP@837800 区） |

**默认值**：`sentiment` 缺省 `neutral`、`variant` 缺省 `primary`、`size` 缺省 `md`（`_C` 解构：`b=f===void 0?\`neutral\`:f; x=p===void 0?\`primary\`:p; S=m===void 0?\`md\`:m`，APP@837800 区）。→ **「一个裸 Button」= neutralPrimary = 黑底白字（light）/ 白底黑字（dark）**。

### 2.3 icon 按钮（`VS` 体系，APP@810400 区；RE-visual A1 已记，补全）

xs **20** / sm **24** / md **28** / lg **44**；square 半径 6 / circle 9999；transition 同上。市场 Back/Close 钮 = circle md ghost 28（RE-visual D2）。设置 pane 的锚点/复制钮 = 20×20（渲染实测）。

---

## 3. 输入框体系（第 3 面；`ui-input-group` 平台组件，`index.eager-platform-C2su3Zzb.js`@130500 区 `bo`/`So` 样式对象）

| 属性 | 值 | light / dark | 锚点 |
|---|---|---|---|
| 容器（GROUP） | flex、`width:100%`、四边 `1px solid var(--ui-input-group-stroke)`、bg `--cursor-bg-input-field` = `color-mix(base 3%,transparent)`（light `#1c1c1c08` / dark `#f5f5f508`） | | CSSR L1776/4182/3367 等；bg 定义 L88 块 `--cursor-bg-input-field` |
| padding（size） | md：block `spacing-1`=4、inline `spacing-1-25`=5、gap 4；lg：block 4、inline `spacing-2`=8、gap 6；xl：block `spacing-1-5`=6、inline 8、gap 8；**基础（无 size）：0**（由内层补） | | CSSR L687/690/1022（md）、L687/692/1021（lg）、L686/692/1027（xl）、L684/688 |
| stroke（边色） | rest `--cursor-stroke-tertiary` = `--sand-border-tertiary-translucent`（light `#1c1c1c14` 8% / dark `#f5f5f50f` 6%） | | L694/695；TT 别名层 L1046 |
| focus-within | stroke → `--cursor-stroke-primary` = `--sand-border-primary-translucent`（`#1c1c1c3d` 24% / `#f5f5f538` 22%） | | L866 `.ui-1t42qcl:focus-within` |
| aria-invalid | stroke 与 focus ring → `--cursor-stroke-red-primary` = `color-mix(--cursor-red-fill 56%)`（light≈`#e72e3b8f` / dark≈`#cf2b358f`） | | L879/880 `:has([aria-invalid=true])` |
| focus ring | `--cursor-focus-ring-color`=`--sand-border-focus-primary`（`#1e86fc`/`#1884fc`）、**宽 2px、offset 1px**（`--cursor-focus-ring-offset`）、`outline:solid`，focus-visible 触发 | | L93 `.ui-quchfr`；TT L1049/1059；L2916-2925 族 |
| input 元素 | 无自身边框/背景、`flex:1`、字 `--cursor-font-size-base`=13/`--cursor-line-height-base`=18、color `--cursor-text-primary`（=base：`#1c1c1c`/`#f5f5f5`） | | L2214-3237 各条、L1686 |
| placeholder | `--cursor-text-secondary`（=base 74%：`#1c1c1cbd`/`#f5f5f5bd` 近似 `--sand-text-secondary`）；disabled 时 `--cursor-text-quaternary`（36%） | | L4860 `.ui-19ovir5::placeholder`、L4859 |
| disabled | 容器 `opacity:.5`、边色回 stroke-tertiary、cursor not-allowed | | L2171 `.ui-byyjgo`、L1765 |
| transition | `color,background-color,border-color` `--cursor-duration-normal`(150ms) `--ease` | | L2476/2457/2521 |
| 带图标 | 图标放 GROUP flex 流内（gap 即上表 size gap），无额外内边距类 | | So.base 无 icon 专属类 |
| 搜索框 | 同体系 + 搜索 icon；市场搜索在 tabs 行（RE-market-detail §1.4） | | |

---

## 4. 市场浮层（第 4 面）

容器/开场动画/tabs/Back/Close 的值**不重做**，沿用 `work/p5-parity/RE-visual-078-values.md` §D（D1–D3：900×(100vh−96) 对话框、radius 14、1px 描边、200ms sharp 开场、tab 5/10 药丸、Back circle md ghost）与 `RE-market-detail.md`（列表行 40 图标/详情单列/表单 catalog chrome/ActionBar）。本轮增量：

| 项 | 值 | 锚点 |
|---|---|---|
| 列表容器实测 | `sand-plugins-layout` 与设置同壳：rect [191,53,898,694]（1280×800 下） | 渲染 probe（market-shell 帧） |
| 列表行图标 | 40px（详情 56px） | RE-market-detail §1.2/§2.1 |
| 行 trailing Connect 钮 | `size sm、variant secondary`（zn）→ §2.2 neutralSecondary：**高 26、padding 4/8、药丸、bg 6%/4%、字 text-primary 13→12px(label)** | RE-market-detail §1.2 + 本表 §2 |
| ✓Connected 徽标 | `check` icon **12px** + 文案（QHcLEN） | RE-market-detail §1.2 |
| 自定义 MCP 表单 | label 在上、字段间距 = 表单组 gap 6(spacing-1-5)、Type 下拉 secondary/lg/matchAnchorWidth、ActionBar = actions 类（flex-end、gap 8、padding 16/12 行为） | RE-market-detail §4 + CSSR L6736/5591/8332/8334 |

**补拍状态**：市场列表亮暗用 R-04 归档帧（真实渲染，1440×900@2）；本轮市场渲染在桩下时序竞态未根治（点行进详情仍拿不到稳定帧，与 RE-market-detail §8 局限 1 同因——market 数据 fixture 已定位走 `desktop.main.getMcpState/getMcpCatalog/getMcpTeamPopularity`（非 coordinator），但条目形状未完全复原，boot 期崩溃/挂起，见局限 2）。**详情页/表单渲染帧仍未取得，规格以静态精读为准**。

---

## 5. 连接器卡三态（第 5 面）

| 态 | 视觉 | 锚点 |
|---|---|---|
| Connect（未连） | 列表行 trailing = **Connect** 药丸（sm/secondary，§2.2）；详情页主钮 = Connect（labels.add=iSLIjg，`size lg` 主钮位） | RE-market-detail §1.2/§2.2；RE-CONNECTORS §4.1 |
| Connecting… | 同钮文案切换 `JrFTcr`、`aria-busy`、disabled=isBusy；settle 轮询 30s | RE-market-detail §1.2 |
| Connected to {account} | 行 = ✓Connected 徽标（check 12 + QHcLEN）；详情/卡上副标 **"Connected to {accountLabel}"**（`3khQqh`）、按钮 **Reconnect**（`gcoiFh`） | RE-CONNECTORS §4.1；NCC |
| needsAuth | 出 **Authorize** 授权钮（mr idleLabel=Connect） | RE-market-detail §1.2 |
| 断开确认 | destructive 对话框（标题 `Disconnect {providerName}`、Confirm=Disconnect、后果文案按 provider） | RE-CONNECTORS §4.2 |
| 已连接计数徽标（侧栏 footer） | "Connect apps" 药丸：**高 36、min-width 36、radius 9999、bg `--sand-bg-elevated` + 1px tertiary 边、hover 叠 bg-hover 渐变、`grid-plus` lg icon、body1 medium**；label 由 `--sand-reveal-label` hover 展开；已连 logos 堆叠（≤4）+ 计数；动效 `background-color,flex-grow,padding .3s cubic-bezier(.2,0,0,1)`；渲染实测整钮 36×203 | RE-visual A15 + 本轮渲染实测（rect 203×36） |

---

## 6. Windows 平台分支差异清单（第 6 面；供 T54 对照）

### 6.1 窗口 chrome（BrowserWindow 创建）

```js
// MAINC@732362 function Qh(e)  (= windowChromeOptions)
isMac     → { frame:true,  titleBarStyle:"hiddenInset", trafficLightPosition:{x:16,y:15} }   // wZ = MAINC@731786
isWindows → { frame:false, titleBarStyle:"hidden",  titleBarOverlay:BZ(backgroundColor) }    // ← Windows 分支
linux     → { frame:false, titleBarStyle:"default" }                                          // 自绘控件
```

- BrowserWindow 其它（MAINA@3321578）：min **512×520**（`rr`，MAINC@731660 区）；`backgroundColor` = 主题 chrome 色；webPreferences `contextIsolation:true, nodeIntegration:false, sandbox:true, webviewTag:true`；linux+wayland 时 additionalArguments 加 `SAND_WAYLAND_CLIENT_ARG`。
- **titleBarOverlay 完整规格**（MAINC `BZ/URe`）：
  - 常态 `{height:51, color:getWindowBackgroundColor(), symbolColor:FZ(color)}`——`FZ` = 亮度公式 `(r*299+g*587+b*114)/1000 < 128 ? "#FFFFFF" : "#000000"`；light bg #fcfcfc → **黑符号**，dark bg #121212 → **白符号**。
  - 全屏（`URe(bg,true)`）→ `{height:43, color:"#141414"}`（`LZ.cover`）。
  - 主题切换时同步：`themeChanges.install → setBackgroundColor(getWindowBackgroundColor())` + overlay `syncFromTheme()`（MAINA@3451700 区）；renderer 侧另有 `setTitleBarOverlayTone(isOverlayTone:boolean)` RPC（APP@561872，args `{isOverlayTone}`）在布局变化时触发。
  - 常量：`DRe=52`（overlay 档基准）、`bk=51`、`wRe=44`、`LRe=43`（MAINC@731660 区）。

### 6.2 renderer 平台分支（`C8n` 平台归一 APP@4443233：darwin/win32/linux/other）

| 分支点 | darwin | **win32** | linux | 锚点 |
|---|---|---|---|---|
| 窗口控件宿主（A6 组件 APP@3550700） | **null**（系统红绿灯） | **隐藏占位 div**（`sand-window-controls`，display:none）——只为 ref 回调：设置 CSS 变量 + `setTitleBarOverlayTone` | **自绘三钮**（min/max/close） | APP@3551222 区 |
| 窗口控件布局变量（GAn APP@3549900） | — | `--sand-window-controls-block: calc(51px/zoom)`（UAn）、`--sand-window-controls-inset: calc(140px/zoom)`（HAn）、非全屏再加 `--sand-native-window-controls-inset` | `--sand-window-controls-block: 52px`（WAn，字面量）；inset 同 140px | APP@3549900 区 |
| shell titlebar 档 | `isTitlebarVisible = darwin && !fullscreen` → **44px** 档 + inset 72px | `isWindowControlsVisible = !darwin && !fullscreen` → **52px** 档（`--sand-titlebar-block`） | 同 win 52px | APP@3777695 区（`jn/Mn/Nn`）+ APP@3659300（`h8.shellTitlebar/shellWindowControls/shellFullscreen`）；CSSR L5280/5281（52/44px）、L5285（inset 72）、L5282（collapsed fallback 38） |
| 自绘控件按钮尺寸 | — | —（无） | **36×28、radius 8、hover bg = color-mix(text-primary 8%,transparent)（非 bg-hover！）、active 13%、色 text-primary、focus ring 蓝 offset 2、容器 right:0 + padding-right 12px/zoom、z-index 5000、no-drag**；`zoom: calc(1/max(zoom-factor,28/52))` 保物理高 | APP@3551450 区 x/S；CSSR L8579/7905/5518/7705/7755/6447/6967/8447/8001/7449/8382/5988/7456 |
| inset 消费点 | — | 右侧避让：`calc(12/16/20px + var(--sand-window-controls-inset,0px))`（notice/popover/toolbar 右端）；面板顶部 `padding-block:max(40px,var(--sand-window-controls-block,0px))`；对话框高 `min(500/560px, 100vh − 2*max(48px,block))`；infoPane margin 补偿；modal 上下文 inset 取 `var(--sand-native-window-controls-inset,0px)`（win=140、linux=0） | 同变量（linux 值不同） | CSSR L6680/6681/7028/7030/5681/6896/7956/7958/5290 |
| 字体栈 | -apple-system | **落 "Segoe UI"**（栈 `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`；mono 落 Consolas） | 同栈（Linux 落 sans-serif 默认） | CSSR L94 `--cursor-font-family-sans/mono` |
| 字重 | regular 微调 **420/425**（`Ojn`） | 400 | 400 | APP@3575595 `Ojn` |
| 滚动条 | 全平台同：overlay 式 thin——thumb `color-mix(text-quaternary 45%,transparent)`、hover 70%、四边 2px 透明 padding、track 透明、radius full；`scrollbar-width:thin`/`none` 按区域 | | | CSSR L2330/2331、L4822-4838、L4764、L4930 |
| DevTools | — | `{useWindowControlsOverlay:true}` → detach 模式 | toggle | MAINA@2893367 |
| 菜单 | Quit=⌘Q | **"Exit"（ydzS9x）无加速键**（win32 显式去掉 CommandOrControl+Q） | "Quit"（sQoLn0）+ ⌘Q | MAINA@2253095（`vse/T5e`） |
| Passkeys/Security Key | 支持文案 `rmVuan` | **同 darwin 支持**（`Hr=['darwin','win32']`，GPANE@66014） | "aren't supported on this platform yet"（`TmxDiI`，渲染实证） | GPANE；渲染实测 |
| 原生窗口句柄 | — | `zDn`：win32 读 HWND（`getNativeWindowHandle` BigUInt64LE） | — | MAINA@2540250 |
| 沙箱 flag | — | `sandbox_force_disable_win32` **default:true**（win 沙箱默认关）、`mcp_user_extension_stdio_unsandboxed_win32` default:false | — | MAINA@1642601/1643246 |
| 通知 | — | 权限映射 enabled→granted 等（hBt.win32 表）、平台枚举 WINDOWS、系统设置 URI `ms-settings:notifications` | LINUX | MAINA@3183303/3199680/3201128 |
| 更新器 | autoUpdater | **squirrel windows 更新器**（powershell 签名校验、staged installer quit 语义 `YAt`、重试放置 Shr） | appimage/package-managed | MAINA@2924723/3370979/3411999+ |
| keychain 类能力 | 支持 | 支持（`n8t=['darwin','win32']`） | 不支持 | MAINA@2179569 |
| zoom-factor | `--sand-zoom-factor` 由入口 chunk 启动写入 + `zoom-factor-changed` 事件更新（全平台）；win 的 51px/140px inset 都除以它 | | | index-CxzQ4vjO.js@2463 区 |

### 6.3 「原版 Windows 与 Linux 的 UI 差异」速查（T54 对照用）

| 维度 | Windows（原版） | Linux（原版） |
|---|---|---|
| 窗口控件来源 | **系统 titleBarOverlay**（Electron/OS 自绘） | **renderer 自绘三钮 36×28** |
| 控件区高度 | overlay 51px（全屏 43） | titlebar block 52px |
| 右侧控件占位 | CSS `--sand-window-controls-inset` = 140px/zoom（浮层避让用） | 同变量 140px（容器同样设 inset；modal 内取 native inset=0） |
| 字体 | Segoe UI / Consolas | 系统 sans / mono 默认 |
| 菜单退出 | "Exit"，无快捷键 | "Quit" + Ctrl+Q |
| Security Key 行 | 正常开关文案 | "…aren't supported on this platform yet" |
| 其余（对话框/按钮/设置/市场） | **无平台分支**（同一套 token/组件） | 同左 |

> 错位修复提示：原版 Windows 不自绘控件——若我们在 Windows 自绘了控件/或未实现 140px 右侧 inset 避让/或 titlebar 档取错（44 vs 52），都会产生 Windows 特有错位；DPI（zoom-factor）参与 inset 换算，非整数缩放下 140/51 的除法舍入是首要嫌疑。

---

## 7. 参照图清单（`work/ui-polish-win/ref/`）

| 文件 | 尺寸 | 内容与 fixture | 复拍 |
|---|---|---|---|
| `settings-general-light.png` | 1280×800 | 设置 General 区完整（Account/Appearance/System/Bot/Security Key 行序 + Select/Switch 实控） | `cd work/ui-polish-win/harness && DEP=16 AFTER_SET=8000 node setprobe.mjs stub-base.js "http://127.0.0.1:8890/?theme=light" <out> light`（server：`node serve.mjs /dev/shm/pbots-re/gb0781/extracted/dist/renderer 8890`；点击链 = 账号菜单 → Settings；**内容行需 ~6s 后才渲染，等待 <5s 会得到空 pane**） |
| `settings-general-dark.png` | 1280×800 | 同上暗色（Theme=Dark 实证暗主题生效） | 同上 `?theme=dark` |
| `settings-updates-light.png` / `-dark.png` | 1280×800 | Updates 区外壳（行未渲染，见局限 4） | setprobe 第 6 参 `Updates` |
| `market-shell-light.1280x800.png` | 1280×800 | 市场对话框外壳（空态；竞态限制） | `node mktprobe.mjs stub-market.js "http://127.0.0.1:8890/?theme=light" <out>` |
| `market-list-light/dark.1440x900@2.png` | 1440×900@2 | 市场列表真实渲染（R-04 归档复制：From Grok ✓/Team picks/分类节/Connect 药丸） | 见 `work/p5-parity/harness/grok-r3/`（fixture 版 stub 已丢失，无法直接复拍——本轮 market fixture 重建未竟，见局限 2） |
| `settings-general-light.deep-probe.txt` | — | 设置 DOM 深probe（全部行 rect+computed style） | 同 setprobe |

驱动与 stub 存档：`work/ui-polish-win/harness/`（`drive2.mjs` 通用驱动、`setprobe.mjs` 设置点击链探测、`mktprobe.mjs` 市场探测、`panecheck.mjs`/`menuprobe.mjs` 辅助、`serve.mjs`、`stub-base.js`=r3 桩、`stub-settings.js`=+设置值试验版、`stub-market*.js`=市场 fixture 尝试版：A=catalog-only/B=基线/C=空 catalog）。

---

## 8. 局限与未验证

1. **静态值与运行时值的置信分级**：表中标「渲染实测」的来自真实 renderer 的 computed style（置信最高）；标 CSSR/TT 的为静态推导（RE-theme 的求值器抽样核对过，未逐条运行时比对；本轮十余处抽检全部吻合）。icon 按钮 lg=44、按钮高度推算（26/30/34）非实测（无显式 height，由 padding+字号推出）。
2. **市场 fixture 重建未竟**：R-04 当时的 market fixture stub 存在 `/tmp` 已丢失；本轮重建发现市场数据走 `desktop.main.getMcpState/getMcpCatalog/getMcpTeamPopularity`（非 coordinator），但 catalog 条目精确形状未复原——带条目的 fixture 使 boot 崩溃（ErrorBoundary "Something went wrong"）或挂起（外网 iconUrl 的 fetch 在不联网环境悬挂，改 null 后仍卡），**详情页/自定义 MCP 表单的渲染帧仍未取得**（与 RE-market-detail §8 局限 1 同）。其规格以静态精读为准（RE-market-detail §2/§4 完整）。后续复刻条目形状可从 APP `Ik`/BM 模型的字段读点继续逆。
3. **设置 Bot 分组行未渲染**（Bot color 等依赖更多 fixture）；Updates 行未渲染（依赖 host 更新状态）。两处行文案/键序沿用 RE-SETTINGS；布局规格与本区其它行同体系（§1.4/1.6）。
4. **flag 门控区未全渲染**：桩下 gates 全关，设置导航只出 General/Computer/Updates；integrations/vault/usage/permissions 的渲染态未取得（导航七区结构与文案由 RE-SETTINGS §1 静态钉死）。
5. **Windows 分支全部静态**：未在 Windows 实机运行原版（0.78.1 deb 是 Linux 包；win32 分支从 MAINC/MAINA/APP 代码读出）。titleBarOverlay 的实际渲染效果（符号颜色/间距）未目验——T54 的 Win11 VM 实机对照可补。
6. **1280×800 截图为 @1 deviceScaleFactor**（与 Win11 VM 窗口同逻辑尺寸）；@2 高清套未拍（r4 两张市场图是 1440×900@2，逻辑尺寸不同，对照时注意）。
7. stub-settings.js 的额外 fixture（getSpellCheckEnabled 等）未证实改变渲染（设置行渲染时序与 fixture 无关，等 6s 即出）；保留在 harness 供后续用。
8. 残留进程：本轮所有 chrome 均随机端口+独立 profile 且脚本退出即 kill；`serve.mjs` 8890 一个 server 仍在跑（`pgrep -f 'serve.mjs.*8890'`），后续复拍直接用，长期不用请 kill。
