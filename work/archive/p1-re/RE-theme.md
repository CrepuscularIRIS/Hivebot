# RE-theme · Grok Bot 0.78.1 设计调色板与布局常量（P4 theme 插件输入）

日期：2026-11-02 · 解包树：`/dev/shm/grok-re/0.78.1/app/`（本次已按 RE-unpack §0 重建，app.asar sha256 `78af6f9d…34eb` 校验通过，897 文件）
产物：`work/p1-re/evidence/theme-tokens.css`（1170 行，两套主题 230 个 `--sand-*` 语法层 token + 125 个 `--cursor-*` core 槽 + 共享非颜色层 + 别名层 + dataviz + syntax + 布局常量）

## 结论（先行）

1. **主题是三层 token 系统，运行时由 `RRn(theme)` 注入一个 `<style id="sand-cursor-theme">`**：palette（79 个原始色 × light/dark）→ 语义层 `--sand-<path>`（`tv()` 把 `bg/pane` 转成 `--sand-bg-pane`）→ 别名层 `--cursor-*`（`xRn` 映射表 + stylex 消费）。另有 `<style id="sand-dark-tone">`（`wRn`，选择器 `[data-sand-tone="dark"]`）支持局部暗色区域。
2. **颜色值全部可静态推导**：mix token 输出 8 位 hex（`#rrggbb + round(α%·255/100)`），over token 输出合成后的 6 位 hex。`theme-tokens.css` 由自写静态求值器生成（`evidence/gen-tokens.py`，数据零转录、正则直读 chunk 字面量），抽样 6 项全部与源码规则吻合。**未执行任何目标代码**（权限拦截了 Node 重放，改走纯静态解析，结论不受影响）。
3. **布局骨架**：shell 为 CSS grid `280px minmax(0,1fr) auto`（侧栏列默认 280、可持久化 240–400、可折叠为 0），会话气泡 `max-width:min(640px,100%)`，聊天列最小宽 424px，titlebar 38px。
4. **P4 映射方案**：grok 的 `--sand-*` 语义层与 dsh 的 `--dsw-alias-*` 语义层一一对应度高，映射表见 §5；dsh 的 `--dsw-static-*` 原始色板不需要替换，替换 alias/specific 层即可整体换肤。

## 1. 主题注入链（锚点）

```
RRn(theme, opts)                              eager-app chunk，offset 3,766,736（function RRn）
 ├─ documentElement.dataset.theme = 'cursor-light' | 'cursor-dark'   （MRn 映射表）
 ├─ style#sand-cursor-theme.textContent = FRn(theme, opts)
 │    FRn = F({core:ERn(pa[theme]), nonColor:{...He,fontFamily,syntax}})   offset 3,766,120
 │         + kRn(radius) + bRn(pa) + CRn() [+ ARn/jRn（XVF 字体模式）]
 ├─ style#sand-dark-tone.textContent = wRn(pa.dark)   （[data-sand-tone="dark"] 暗区覆盖）
```

| 环节 | 内容 | 位置（minified 标识符） |
|---|---|---|
| palette | `pa = W_ = {light:V_, dark:H_}`，共享语义色 `B_` | common chunk offset 370,306–370,967 |
| 原始色板 | `y_ = {light:{...},dark:{...}}`，9 色系×8 档 + neutral×7 = 79 色/套 | common 366,996 起 |
| 透明度表 | `h_`（light 53 键）/`g_`（dark 53 键） | common 362,775 / 364,045 |
| 语法 token 表 | `q_` 通用 + `Y_(role)` 每色系 13 条 → `X_` | common 371,150 起 |
| 值计算 | `ev`/`Q_`(mix→hex8)/`$_`(over→hex6)/`Z_`(递归解析)/`R_` | common 369,700–371,150 |
| 变量命名 | `tv(path) = '--sand-' + path.replaceAll('/','-')` | common（ev 后） |
| core 槽 | `ERn(pa[e])`：sidebar/chrome/pane/elevated/base/accent/…/terminalAnsi*/diff* → `--cursor-<kebab>` | eager-app 3,762,478 后 |
| core 序列化 | `MF=EF(core)+jF(nonColor)`（platform `H as F`） | platform 604,474–606,100 |
| 别名层 | `xRn`（手写表）+ `SRn`（9 色系×4）→ `CRn()` 注入 `:root` | eager-app 3,758,837–3,762,400 |
| 非颜色层 | `jF`：duration/spacing/radius/height/font-size/line-height/letter-spacing/font-weight/font-smoothing/easing/elevation | platform 604,968 |

## 2. 调色板（两套）

### 2.1 关键语义色速览（完整 230 token 见 theme-tokens.css）

| 语义 | light | dark | 源 |
|---|---|---|---|
| `--sand-bg-chrome`（窗框） | `#fcfcfc` | `#121212` | neutral/2 |
| `--sand-bg-pane`（会话区） | `#ffffff` | `#161616` | neutral/1 |
| `--sand-bg-sidebar` | `#f5f5f5` | `#0e0e0e` | neutral/3 |
| `--sand-bg-elevated`（浮层） | `#ffffff` | `#1f1f1f` | neutral/0 |
| `--sand-text-primary` | `#1c1c1c` | `#f5f5f5` | base=neutral/5 |
| `--sand-text-secondary` | `#1c1c1cad`(68%) | `#f5f5f5a8`(66%) | mix |
| `--sand-text-tertiary` | `#1c1c1c8f`(56%) | `#f5f5f58a`(54%) | mix |
| `--sand-text-quaternary` | `#1c1c1c66`(40%) | `#f5f5f561`(38%) | mix |
| `--sand-bg-hover` | `#1c1c1c0f`(6%) | `#f5f5f50f`(6%) | mix |
| `--sand-bg-active` | `#1c1c1c14`(8%) | `#f5f5f514`(8%) | mix |
| `--sand-bg-secondary`（卡片底） | `#1c1c1c0f`(6%) | `#f5f5f50a`(4%) | mix |
| `--sand-bg-secondary-hover` | `#1c1c1c1a`(10%) | `#f5f5f514`(8%) | mix |
| `--sand-bg-accent-primary` | `#1680f3` | `#116dd2` | blue/1 |
| `--sand-text-accent-primary` | `#0b6dd3` | `#4d9bff` | blue/3 |
| `--sand-border-secondary-translucent` | `#1c1c1c1f`(12%) | `#f5f5f51a`(10%) | mix |
| `--sand-border-primary-translucent` | `#1c1c1c3d`(24%) | `#f5f5f538`(22%) | mix |
| `--sand-fill-bubble-user` | `#1c1c1cff`(100%) | `#f5f5f52e`(18%) | mix；light 全黑/暗半透明白 |
| `--sand-fill-bubble-agent` | `#1c1c1c0f`(6%) | `#f5f5f50a`(4%) | mix |
| `--sand-border-focus-primary` | `#1e86fc` | `#1884fc` | focus=blue/0 |
| `--sand-shadow-popover-ambient` | `#1c1c1c1a`(10%) | `#f5f5f500`(0%) | dark 阴影全 0 |

设计语言要点：light/dark 是**同一语义反转**（base 在 light=neutral/5 深色、dark=neutral/5 浅色），中性面档位 0–3 按主题反向取用；彩色系每系 8 档，语义档位固定：Fill=1、FillHover=2、FillPressed=7、FillBright=0、Foreground=3、ForegroundHover=4、ForegroundBright=1（`k_` 表，common 369,540 前）；accent=danger/success/warn 无 FillPressed/ForegroundHover 变体（`T_`）。

### 2.2 原始色板（79 色 × 2，theme-tokens.css 未重复展开，按档位表引用）

完整 hex 表在 `theme-fns`/`palette-full` 证据与 theme-tokens.css 的 core 槽中（每色系 Fill/FillHover/FillPressed/FillBright/Foreground/ForegroundHover/ForegroundBright 已解析为 hex）。示例（blue 系 light）：0 `#1e86fc` / 1 `#1680f3` / 2 `#126fd4` / 3 `#0b6dd3` / 4 `#085ab2` / 5 `#054991` / 6 `#033872` / 7 `#0d5eb6`。dark blue：0 `#1884fc` / 1 `#116dd2` / 2 `#1784fb` / 3 `#4d9bff` / 4 `#7cb5ff` / 5 `#a3caff` / 6 `#c8dfff` / 7 `#0c58aa`。

### 2.3 品牌色与 dataviz

- `brand = #f54e00`（`TRn`，eager-app 3,762,469，core 槽 `--cursor-brand`）
- dataviz 8 色分类板 + other `#777777` + negative + sequential 6 + diverging 5（`Sjn`/`Cjn` 静态表，eager-app 3,573,753/3,574,080；CSS 中 `--sand-dataviz-*`）
- 用户气泡按 agent hue 动态换色（botTint：`--sand-transcript-bubble-user-fill` 等运行时覆盖，eager-app 2,354,100）

### 2.4 非颜色 token（共享层，与主题无关）

- **圆角**双套：`_F` 表 none0/xs2/sm4/base6/lg8/xl12/2xl14/3xl16/4xl18/full9999；`kRn` 注入层 base8/lg10/xl14/2xl16/3xl18（后者覆盖同名）；stylex 侧另有 `cLt` r0–r22 步进 2
- **间距**：0.25 步进 ×4px（1=4px … 20=80px），负档 `ne-*`
- **字号**：`--cursor-font-size-*` xs11/sm12/base13/lg14；`--sand-font-size-*` xxs11…base14…xxxl26
- **行高**：xs14/sm16/base18/lg22（`--cursor-`）；`--sand-` xxs16…xxxl32
- **字距**：xs+0.07/sm0/base−0.08/lg−0.15/xl+0.08/2xl−0.46/3xl−0.26 px
- **字重**：normal400/medium500/semibold600/bold700（darwin 下 regular 微调 420/425，`Ojn`）
- **动效**：duration instant50/fast100/normal150/slow200/slower300/drawer500/1s/2s；easing `--ease`（ease）、sharp `cubic-bezier(.165,.84,.44,1)`、heavy、drawer `cubic-bezier(.32,.72,0,1)`、linear
- **阴影组合**：`--sand-shadow-inline/popover/modal/window`（z6，多层 ambient+key+1px ring）；dark 模式阴影色 alpha 全 0（纯描边式）
- **模糊**：`--sand-blur-background: 24px`
- **排版语义表** `R6`：heading-1 26/32/−0.015em、heading-2 22/28/−0.012、heading-3 17/24/−0.008、body-1 14/20、body-2 13/18、label 12/16、caption 11/16/+0.005（含 iconSize 与可用字重）
- **字体栈**：sans `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`；mono `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace`；XVF 模式前缀 `'XVF'/'XVF Mono'`
- **tooltip**：字 12/16px、padding 4/6px、radius 6px、边 0.5px
- **syntax 高亮**：light=PF oklch 板（keyword `oklch(0.488 0.195 13.082)` 等 12 基础键 + NF/TF 别名），dark=mF.syntax（keyword `oklch(0.811 0.079 191.639)` 等）；均已写入 CSS

## 3. 布局常量（问题 2）

| 常量 | 值 | 锚点 |
|---|---|---|
| shell 主网格 | `280px minmax(0,1fr) auto`（侧栏/内容/infoPane 三列） | `.sand-1g5hyr8`（index-Dh7EWA8t.css） |
| 折叠网格 | `0 minmax(0,1fr) auto` | `.sand-14fal1x` |
| 侧栏宽 | 默认 **280**，用户可调 **240–400**（持久化键 `sand.sidebar.width`）；JS 默认对象 `FT={expandedWidth:280}` | eager-app 912,516 / 916,780（`$T()` fallback/min/max） |
| infoPane 宽 | 默认 **320**，下限 280（键 `sand.infoPane.width`）；`IT={width:320}` | 同上 |
| 聊天列最小宽 | `--sand-chat-min-width: 424px` | `.sand-1fiktjy` |
| titlebar 高 | 38px（`--sand-titlebar-block` 默认） | `.sand-14mu8d4` |
| 会话气泡最大宽 | `min(640px, 100%)`（`--conversation-bubble-max-width`） | index-Dh7EWA8t.css |
| 对侧缩进 | `clamp(0px, (100% - 480px) * .4, 20%)`，human 消息 `max(32px, …)` | 同上 |
| 会话排版 | 字 14px / 行高 22px；glass 圆角规则 15px（radius-xl+1）；面圆角 14px | 同上 |
| 卡片缩略宽规则 | `min(80%, 560px, 容器-82px)`（`rF={widthPercent:80,maxWidthPx:560}` + `lF`）；内容扣边 `kW=560-24=536` | eager-app 1,653,965 / 1,912,600 |
| canvas 卡 | 708×372（`JP`） | eager-app 1,653,543 |
| 侧栏动画 | grid-template-columns 过渡 **0.2s** `cubic-bezier(.22,1,.36,1)` | `.sand-1r800kn/.sand-1w7tg8r` |
| 菜单（XVF 模式） | menu 圆角 16 / 行圆角 10 / 行高 32 / 行距 6；command palette 圆角 18 / 行距 10；CSS 静态版行距 8 | `ARn`/`jRn`（eager-app 3,766,019 区）+ CSS |
| transcript prose（XVF） | 行高 22 / 块 padding 7 / 单行高 36 / 气泡圆角 18 | `ARn` |
| stylex max-width 档 | 624/640/680/700/708/756/760/828/860/880/920（原子类，按组件选用） | CSS 700,200–701,000 区 |

## 4. dsh 侧 token 现状（映射输入）

`repos/deepseek-harness/packages/client/`：
- `ui-theme/src/styles/design-platform.css`：**static 层**（`--dsw-static-*`，bluish 中性 00–1000 + deepseek/blue/green/red/amber/violet，light/dark 值几乎相同）+ **alias 层**（`--dsw-alias-*` ~120 条，light `body` / dark `body[data-ds-dark-theme]` 真分叉：bg-base/layer-1..3/border-l1..l4/label-primary..caption/interactive-hover/active/button 族/markdown/state 族/toast/tooltip）
- `ui-theme/src/styles/base.css`：`--dsw-radius-xs4/sm8/md12/lg16/xl20/panel28`、`--dsw-font-family`（系统栈+中文）、`--ds-transition-duration` 0.2/0.1/0.3s
- 组件级：`--dsw-specific-sidebar-fill`、`--dsw-specific-bubble`、`--dsw-menu-surface-fill`、`--dsw-mask-blur` 等

## 5. 映射建议：grok → `--dsw-*`（P4 theme 插件替换 alias/specific 层）

原则：dsw 的 static 原始色板不动；theme 插件在 `body` / `body[data-ds-dark-theme]` 覆盖 alias/specific 值为 grok 对应 token（值直接抄 theme-tokens.css）。

| `--dsw-*`（dsh） | grok token | light 值 | dark 值 | 备注 |
|---|---|---|---|---|
| `alias-bg-base` | `--sand-bg-chrome` | `#fcfcfc` | `#121212` | 窗底 |
| `alias-bg-layer-1` | `--sand-bg-elevated` | `#ffffff` | `#1f1f1f` | 浮层浅于 dsw 习惯（dsw dark 用 875） |
| `alias-bg-layer-2` | `--sand-bg-pane` | `#ffffff` | `#161616` | |
| `alias-bg-layer-3` | `--sand-bg-elevated` 混 `bg/secondary` | `#1c1c1c0f` 叠加 | `#f5f5f50a` | 或直接用 `--sand-bg-secondary` |
| `alias-bg-overlay` | `--sand-bg-secondary-active` | `#1c1c1c2e`(18%) | `#f5f5f533`(20%) | |
| `alias-bg-mask-1` | `--sand-bg-scrim` | `#00000080`(50%) | `#000000b2`(69.7%) | grok scrim 更深 |
| `specific-sidebar-fill` | `--sand-bg-sidebar` | `#f5f5f5` | `#0e0e0e` | |
| `alias-label-primary` | `--sand-text-primary` | `#1c1c1c` | `#f5f5f5` | |
| `alias-label-secondary` | `--sand-text-secondary` | `#1c1c1cad` | `#f5f5f5a8` | 68%/66% |
| `alias-label-tertiary` | `--sand-text-tertiary` | `#1c1c1c8f` | `#f5f5f58a` | |
| `alias-label-caption` | `--sand-text-quaternary` | `#1c1c1c66` | `#f5f5f561` | |
| `alias-border-l1` | `--sand-border-quaternary-translucent` | `#1c1c1c0f`(6%) | `#f5f5f50a`(6%) | |
| `alias-border-l2` | `--sand-border-tertiary-translucent` | `#1c1c1c14`(8%) | `#f5f5f50f`(6%) | |
| `alias-border-l3` | `--sand-border-secondary-translucent` | `#1c1c1c1f`(12%) | `#f5f5f51a`(10%) | |
| `alias-border-l4` | `--sand-border-primary-translucent` | `#1c1c1c3d`(24%) | `#f5f5f538`(22%) | |
| `alias-interactive-bg-hover` | `--sand-bg-hover` | `#1c1c1c0f` | `#f5f5f50f` | 6% |
| `alias-interactive-bg-active` | `--sand-bg-active` | `#1c1c1c14` | `#f5f5f514` | 8% |
| `alias-interactive-bg-hover-accent` | `--sand-bg-accent-secondary` | `#1e86fc17`(blue/0+9%) | `#1884fc12`(blue/0+7%) | bg/{role}-secondary |
| `alias-link` | `--sand-text-accent-primary` | `#0b6dd3` | `#4d9bff` | |
| `alias-button-info-fill` | `--sand-bg-accent-primary` | `#1680f3` | `#116dd2` | |
| `alias-button-info-hover` | `--sand-bg-accent-primary-hover` | `#126fd4` | `#1784fb` | blue/2 |
| `alias-state-error-primary` | `--sand-text-danger-primary` | `#cd2834` | `#ff6463` | red/3（Foreground 档） |
| `alias-state-success-primary` | `--sand-text-success-primary` | `#00854a` | `#00ba69` | green/3（Foreground 档） |
| `alias-state-warn-primary` | `--sand-bg-warn-primary` | `#da830e` | `#c8770c` | yellow/1 |
| `alias-state-done-primary` | `--sand-text-purple-primary` | `#7547d0` | `#a582ff` | purple/3（Foreground 档） |
| `alias-code-diff-added` | `--sand-bg-success-secondary` | `#14c16f17`(green/0+9%) | `#14c37012`(green/0+7%) | |
| `alias-code-diff-deleted` | `--sand-bg-danger-secondary` | `#fb2b3e17`(red/0+9%) | `#fc2c3e12`(red/0+7%) | |
| `alias-tooltip-bg` | `--sand-bg-chrome`（grok tooltip=inline 阴影+ring，无实底） | `#fcfcfc` | `#121212` | 保留 dsw 实底更实用 |
| `alias-toast-bg` | `--sand-bg-elevated`+ring | `#ffffff` | `#1f1f1f` | grok 用描边式（elevated light 恰为 #ffffff） |
| `specific-bubble`（用户气泡） | `--sand-fill-bubble-user` | `#1c1c1c` | `#f5f5f52e`(18%白) | grok 标志性反转气泡 |
| `specific-input-major` | `--sand-bg-elevated` | `#ffffff`(neutral/0) | `#1f1f1f` | |
| `menu-surface-fill` | `--sand-bg-elevated` + popover 阴影组 | `#ffffff` | `#1f1f1f` | |
| 圆角 `radius-xs` | grok `_F.sm` | 4px | | dsw xs4=grok sm4 |
| `radius-sm` | grok `_F.lg`/`kRn.base` | 8px | | |
| `radius-md` | `kRn.xl`/menu-row | 12–14px | | 取 12 保 dsw 档 |
| `radius-lg` | `--sand-menu-radius` | 16px | | |
| `radius-xl` | `--sand-command-palette-radius` | 18px | | |
| `radius-panel` | 无对应 | 保留 28px | | grok 无 28 档 |
| 过渡 | `--cursor-duration-fast/normal` + `--ease-drawer` | 100/150ms | | dsw 0.1/0.2 对应良好 |
| 侧栏宽（若插件可设） | shell grid 首列 | 280px（240–400） | | |
| 气泡/内容最大宽 | `--conversation-bubble-max-width` | 640px | | |

未映射（保留 dsh 现状合理）：`--dsw-static-*` 原始板、`--dsw-alias-brand-*`（dsh 品牌黑/DeepSeek 蓝；P4 若要 grok 观感可把 brand-primary 换 `#f54e00` 或 accent 蓝）、`--dsw-alias-illustration-*`、login-input。

## 6. 局限与未验证项

- **未做运行时验证**（约束禁运行应用）：所有值来自静态推导；`gen-tokens.py` 的规则与源码逐条核对（68%→0xad 等抽样吻合），但未在真实 DOM 上比对 computed style。**权限系统拦截了「执行提取代码」的 Node 重放方案**，改用自写静态求值器，数据由正则直读 chunk 字面量（零手工转录 hex）。
- **core 高阶层（`tF`/`sF`/`dF` 的 ~300 条 `--cursor-*` color-mix 组合）未全量展开**：theme-tokens.css 提供了它们的基础槽（125 个已解析 hex）+ 别名层；高阶组合规则已逆向（`mixTransparent` 74/66/52/36% 等）但未逐条生成。P4 若需要可按 `tF` 表（platform 572,968 起）补。
- **light syntax 的 `Ge(u)` 变换未逐字节验证**：假定 `Ge`≈`NF`（键重命名）+ 直值；写入 CSS 的 light syntax 值取自 PF 源板字面量，若 `Ge` 含 oklch 数值变换则个别值会偏差。dark syntax 为 `He.syntax` 原值，无此问题。
- **XVF 字体模式的排版变量是条件值**（`ARn`/`jRn` 仅在 `isXvfTypeface` 时注入）；CSS 静态层另有略不同的默认（如 agent-item avatar-gap 8px vs XVF 10px、menu-row-gap 6 vs 8）。CSS 中已双标注。
- **756px/708px 等 stylex 原子 max-width 档未逐一归属到组件**（hash 无语义名）；若 P4 需要精确复刻某个具体卡片宽度，需按组件再解。
- dataviz、气泡动态色（botTint）、`--sand-transcript-*` 运行时覆盖层的完整触发逻辑未逆向（超出本次三问范围）。
- 解包树在 `/dev/shm`（易失）；`evidence/chunks/` 已存三个 chunk 副本（共 5.5MB），报告可脱离解包树复核。

## 7. 复刻要点（P4 落地顺序）

1. 把 `theme-tokens.css` 的两套 `[data-theme=...]` 块改成 dsh 的 `body` / `body[data-ds-dark-theme]` 选择器（或插件内 `--dsw-` 重命名导入）。
2. 按 §5 表覆盖 `--dsw-alias-*`/`--dsw-specific-*`（~35 条即可整体换观感），static 层不动。
3. 布局：侧栏默认 280（clamp 240–400）、气泡 `min(640px,100%)`、聊天列 min 424、圆角走 `--sand-menu-radius` 16 / row 10 / palette 18。
4. 阴影：light 用 popover 组合（ambient 10%+key+ring），dark 改为 1px ring 式（ambient alpha 0）——grok dark 的「描边代替投影」是观感关键。
