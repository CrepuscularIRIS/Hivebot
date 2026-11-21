# RE：0.78.1 边框/描边体系全景（主界面）

> 来源：reverse-engineer agent（REA）2026-11-11 查证，312k tokens / 178 工具调用。
> 锚点约定：**CSS**=`renderer/assets/index-Dh7EWA8t.css`（规则行号 **L** 引自 `work/p5-parity/evidence/078-css-rules-split.txt`，8871 行）· **APP@偏移**=`renderer/assets/index.eager-app-iGTgHP_Q.js` 字节偏移 · **TT**=`work/p1-re/evidence/theme-tokens.css` 行号 · **kRn**=APP 内运行时 `<style>` 注入表（`ARn` 模板，APP@674000 区）。
> 关联既有：RE-UI-LAYOUT-0.78.1（六面规格）、RE-visual（视觉值）、RE-SETTINGS-0.78.1。
> 完整 907 条 border/box-shadow 规则表：`ref/border-rules-0.78.1.txt`（含每类的 JS 消费 chunk）。

## 0. 结论先行

1. **0.78.1 的描边是「四级 hairline token + .5px 优先」体系**：全应用 907 条含 border/box-shadow 的规则里，中性描边只用 4 个 translucent token（primary/secondary/tertiary/quaternary），宽度档位只有 0/.5/1/1.5/2px 五类，**主界面结构线几乎全部是 .5px**；1px 只用于内嵌控件（Select/checkbox/elevated 按钮/输入框）。
2. **暗色模式阴影全灭**：全部 15 个 `--sand-shadow-*` token 暗色值都是 0% alpha（TT L682-694），暗色完全靠 .5px 描边分层；亮色 popover/modal 阴影也只 10%。复刻「暗色发灰、描边感不对」大概率是阴影没清零或边框用了 1px。
3. **主界面六面现值**（亮/暗均为同一 token）：侧栏右缘 `.5px tertiary`；composer 输入框 `.5px secondary→hover/focus 升 primary→拖拽 accent`、radius **22(收起)/18(展开)** 双档；agent 气泡 `inset .5px quaternary 玻璃环`、user 气泡无边纯色块；pane 顶栏 48px **无边**；浮层菜单 `.5px secondary` + menu-radius 16(运行时)；按钮默认无边、pending `inset 1px quaternary`、卡内 elevated 变体 `1px tertiary`。
4. 对既有文档的两处修正：RE-UI-LAYOUT §1.2 设置 nav 右分隔线实为 **tertiary**（非 secondary）；我方 T57 对话框外壳现为 **1px**（原版 .5px，见 §5）。

## 1. token 层全表（描边专用 token，亮/暗值）

| token | light | dark | 语义档位 | TT 锚 |
|---|---|---|---|---|
| `--sand-border-primary-translucent` | #1c1c1c3d (24%) | #f5f5f538 (22%) | 最强（composer hover/focus、输入 focus） | L269/L632 |
| `--sand-border-secondary-translucent` | #1c1c1c1f (12%) | #f5f5f51a (10%) | 强（composer 静息、菜单、对话框壳、tooltip） | L275/L638 |
| `--sand-border-tertiary-translucent` | #1c1c1c14 (8%) | #f5f5f50f (6%) | 中（侧栏右缘、分隔线、popover 环、switch） | L278/L641 |
| `--sand-border-quaternary-translucent` | #1c1c1c0f (6%) | #f5f5f50a (4%) | 弱（agent 气泡环、checkbox、pending 环） | L272/L635 |
| `--sand-border-attachment-card` | #1c1c1c14 (8%) | #f5f5f51f (**12%**) | 附件卡环（暗色比亮色**更浓**，特殊） | L249/L612 |
| `--sand-border-attachment-paper` | #1c1c1c1f (12%) | #f5f5f529 (**16%**) | 附件纸 | L250/L613 |
| `--sand-border-focus-primary` | #1e86fc | #1884fc | 焦点环专用 | L261/L624 |

别名层（平台组件消费）：`--cursor-stroke-primary/secondary/tertiary/quaternary` → 上表前四（TT L1044-1051）；composer 专属变量 `--prompt-input-container-border: stroke-tertiary` / `-hover: stroke-secondary`（CSS L189/190——无任何 JS 消费，属平台库死 CSS，见局限 4）。

**token 使用频率排名**（合并 sand 直用+cursor-stroke 别名）：secondary-translucent **86** > tertiary-translucent **59** > quaternary-translucent 33 > primary-translucent 32 > focus-primary 20 > attachment-paper 3 > attachment-card 2。

## 2. 逐面描边清单（主界面）

### 2.1 窗口 chrome（titleBarOverlay）
沿用 RE-UI-LAYOUT §6.1：Windows `{height:51, color:getWindowBackgroundColor(), symbolColor:亮度公式}`——light chrome #fcfcfc → 黑符号，dark #121212 → 白符号；全屏切 `{height:43, color:"#141414"}`。Linux 无 overlay，自绘三钮 36×28（hover=text-primary 8%，非描边）。

### 2.2 侧栏（面 1）
| 项 | 值 | 锚点 |
|---|---|---|
| 容器右缘 | **`.5px solid tertiary-translucent`**（inline-end），亮 8%/暗 6% | `sand-1jox5e1`(.5px)+`sand-18b5jzi`(solid)+`sand-h1nr2e`(tertiary)；容器 APP@1339577 |
| 侧栏底色 | `--sand-bg-sidebar`：light **#f5f5f5** / dark **#0e0e0e**（主 pane #fff/#161616——暗色侧栏比 pane 更深，靠底色差+右缘 hairline 分层） | TT L224/L587；CSS L6115 |
| 侧栏头部 | **无任何边框**（titlebar 档 52px、拖拽区） | RE-visual A1 |
| 条目（agent-item） | 无边框，radius 12（运行时 kRn 覆盖静态 10px） | RE-visual 结论4；kRn |
| footer "Connect apps" 药丸 | **1px solid tertiary** + bg-elevated + radius 9999（按钮 elevated 变体） | §2.7 |

### 2.3 composer 输入框（面 2，本轮钉死）
组件 `sand-kit-message-input-frame`（APP `Y$`@2772129，样式 `J$`@2771487，`fz=.5`@1754901）：

| 态 | 值 | 锚点 |
|---|---|---|
| 边框 | **`.5px solid`**，静息 **secondary**（12%/10%） | `J$.frame`；`sand-1mw0n95` |
| hover | 边色升 **primary**（24%/22%） | `sand-iv08qi:hover` |
| focus-within / focus-visible / focus-held | 同升 **primary** | `sand-sb55g1`+`sand-139twnn` |
| 拖拽文件悬停 | 边色 → **accent-primary**（#1680f3/#116dd2） | `sand-vd4qke/1bvc0tb/jijg7a` |
| 圆角 | **22px 收起 / 18px 展开**双档（`u?18:22`） | `J$.radius`→`sand-7yrpt8` |
| 底色 | `--sand-bg-elevated` | `sand-10e981r` |
| 阴影 | `0 2px 8px -1px #0000000d, 0 1px 2px #00000008, 0 0 0 1px #e4e4e40a`（**字面黑非 token**；暗底近隐形） | `sand-jmgmaz` |
| 过渡 | height/border-radius/border-color/background-color，.12s/.12s/.15s/.15s | `sand-1iuf8lh` 等 |
| 输入本体 | 无边框；内层 mic/attach 圆钮 = `inset 0 0 0 .5px tertiary` 环 | `sand-ng3xce`；APP@2818306 |
| 新聊天条菜单 | `.5px secondary` + radius 16（运行时）+ 字面黑阴影；行间 `.5px tertiary` | chunk-new-chat-bar |

### 2.4 消息卡/气泡（面 3）
| 项 | 值 | 锚点 |
|---|---|---|
| user 气泡 | **无边框**纯色块（light 全黑 #1c1c1c / dark 18% 白）+ specular 渐变 | RE-visual B3 |
| agent 气泡 | **inset 玻璃环**：`inset 0 .5px 0 specular-secondary, inset 0 -.5px 0 specular-secondary, inset 0 0 0 .5px quaternary` | `sand-ppejb4`（L6308） |
| 气泡 radius | 18px（运行时）；连续消息相邻角收 6px | kRn；RE-visual B3 |
| tool-call 行 | 无边框裸行（radius 8、高 28、hover 7%） | RE-visual B6 |
| 审批卡/卡壳（elevated） | radius **24** + bg-elevated + `0 0 0 .5px secondary, 0 2px 8px shadow-card` | `ZS.elevated` APP@815271 |
| 附件卡 | `0 0 0 .5px attachment-card, 0 1px 4px shadow-secondary, 0 6px 12px shadow-card`；焦点外加 2px focus | `sand-1jf74b8`+`sand-1uhpujf` |
| transcript 行高亮 | `0 0 0 3px bg-elevated, 0 0 0 4px primary` | `sand-tr04a8` |

### 2.5 顶部栏（面 4）
主 pane 头部 = **48px 高、无任何边框**（`sand-sdox4t`）。**主界面没有「顶栏底边 hairline」**——分层全靠背景色（pane #fff/#161616 vs chrome #fcfcfc/#121212）。

### 2.6 面板浮层/菜单/tooltip（面 5）
| 组件 | 描边 | 锚点 |
|---|---|---|
| 菜单/下拉 | `.5px solid secondary` + radius 16（运行时）+ bg-elevated + popover 复合阴影 | `sand-4hv7ue` 等 |
| popover surface | `inset 0 0 0 .5px tertiary` | `sand-hk3lh9`（L6303） |
| 设置/市场对话框壳 | 四边 **`.5px secondary`** | `sand-13nz628`（L7814 等 6 条） |
| tooltip | `.5px secondary` 环 | L5365/4855/5474 |
| 菜单分隔线 | secondary / header 分隔 tertiary | L5294/L5306 |
| popover 阴影 | `0 10px 20px -3px ambient, 0 4px 6px -4px key, 0 0 0 1px ring`；**暗色全 0 alpha** | APP `z6`；TT L682-694 |

### 2.7 按钮与 icon 钮（面 6）
| 项 | 值 |
|---|---|
| 文本按钮（全部） | **无边框** |
| pending/disabled 主钮 | `inset 0 0 0 1px quaternary`（L6295） |
| **elevated 变体**（卡内/审批卡动作钮） | **1px solid tertiary** + bg-elevated + hover 渐变 |
| icon 钮 | 无边框；square radius 6 / circle |
| checkbox | 1px primary + bg-elevated |
| 平台 1px tab 变体 | 死 CSS（无 JS 消费），应用内 tab 全是药丸无边 |

宽度档位类全表：`sand-4hv7ue`=.5px（L5557）、`sand-mkeg23`=1px（L5562）、`sand-c342km`=0、`sand-vndefy`=1.5px、`sand-dh2fpr`=2px（CSS L986-990）；solid=`sand-1y0btm7`。

## 3. 高频消费类 → 组件（摘要）

| token（合并次数） | 代表消费类 → 组件 |
|---|---|
| secondary (86) | `sand-17tbahu`（29 chunks：菜单/对话框/错误条/RTE popup）· `sand-13nz628`（对话框壳）· tooltip 环 · composer frame |
| tertiary (59) | `sand-5fd6op`（32 chunks：卡片/表单容器边）· `sand-h1nr2e`（侧栏+设置 nav 右缘）· 分隔线 · popover 环 |
| quaternary (33) | `sand-14ed0nm`（9 chunks：输入/select 小件边）· switch 轨道 · agent 气泡环 |
| primary (32) | 表单/容器 focus 态 · composer hover/focus |
| focus (20) | `sand-1v39l1b`（19 chunks：outline 焦点环）等 |

## 4. 滚动条
thumb `color-mix(text-quaternary 45%,transparent)`，hover 70%；列表 `scrollbar-color: secondary/tertiary transparent`（L7146/7147）。

## 5. 我方 0.18 复刻 vs 0.78.1 差异清单（施工对齐表）

我方值取自 `frontend/src/recovered/features/conversation/workspace/view.css`（OUR）与 `overrides/p5-57.css`：

| 面 | 我们 0.18 值 | 0.78.1 值 | 差异 |
|---|---|---|---|
| 侧栏右缘 | `1px stroke-tertiary`，bg=chrome（OUR:9） | **.5px** tertiary + bg-sidebar（暗 #0e0e0e） | 宽度 2×；暗底色偏浅一档 |
| 侧栏头部 | 50px + `border-bottom:1px`（OUR:10） | 无边框 52px | 多一条 1px 线 |
| chat 顶栏 | 51px + `border-bottom:1px`（OUR:100） | 48px 无底边 | 多一条 1px 线 |
| **composer** | `1px secondary; radius:16; bg=input-surface; shadow-sm`（OUR:304） | **.5px** secondary→hover/focus **primary**→drag **accent**；radius **22/18**；bg-elevated；字面黑阴影；四态联动过渡 | **最大嫌疑点** |
| agent 气泡 | 纯 bg 无环（OUR:123-129） | inset .5px quaternary 玻璃环+specular | 缺玻璃边 |
| 气泡几何 | max-width min(88%,**640**,−82)、padding **8**/12 | min(**80%**,**560**,−82)、padding **7**/12 | 略宽略高 |
| hover 动作钮 | `1px #343832` 硬编码（OUR:133） | elevated+hairline token | 未 token 化 |
| 附件行 | `1px #343832`+bg `#20231f` 硬编码（OUR:269） | `.5px attachment-card`+shadow | 同上 |
| 设置/市场对话框壳（T57） | `border:1px stroke-secondary`（p5-57.css L10） | **.5px** secondary | 1px→.5px 待修 |
| 拖拽覆盖 | `2px dashed accent`（OUR:313） | composer 边框整体变 accent | 形态不同 |
| typing 气泡 | bg `#20231f` 硬编码（OUR:190） | tertiary 文字点 | 同上 |

**系统级施工要点**：① 全线结构线降 .5px；② 暗色阴影清零；③ 侧栏底色独立 token（暗 #0e0e0e）；④ composer 四态+双圆角重做；⑤ 删侧栏头/顶栏两条 1px 底线；⑥ 硬编码 `#343832/#20231f` 换 token。

## 6. 局限
1. 静态推导为主；RE-UI-LAYOUT 渲染实测过的置信最高，composer/气泡环/菜单值未跑运行时 computed-style 核验（类串→组件归属经 JS 反查）。
2. composer 展开态判定（isExpanded 触发条件）未运行验证。
3. 顶栏滚动时是否出动态 hairline 未查（倾向无）。
4. `--prompt-input-container-border` 系列无 JS 消费（平台库死 CSS）。
5. 我方差异清单基于源码静态值，未运行比对。
