# RE-KEYBINDINGS-0.78.1 · 0.78.1 键盘快捷键系统全规格

日期：2026-11-13。任务：F8 键盘快捷键/命令系统（覆盖度地图确认零覆盖域）逆向。只读静态分析，未执行产物。

## 0. 方法与锚点总表

- 主证据文件（0.78.1 解包 `/tmp/t78-asar/`）：
  - `dist/renderer/assets/index.eager-app-iGTgHP_Q.js` — renderer 命令注册表、keybinding 核心、帮助弹层、i18n 消费（下称 **APP**）
  - `dist/renderer/assets/index.eager-vendor-BwKbmZU5.js` — react-hotkeys-hook v4 完整实现（下称 **VENDOR**）
  - `dist/renderer/assets/index.eager-common-DbK3Oi_r.js` — keyboard-nav a11y（`$v`/`data-sand-keyboard-nav`）
  - `dist/renderer/assets/chunk-prompt-editor-DpaS0rI9.js` — prompt 内 Enter/菜单键（下称 **PROMPT**）
  - `dist/electron-main/main-app.cjs` — 应用菜单、before-input-event、globalShortcut、menubar-tray（下称 **MAIN**）
  - i18n：`work/grok-0.79.3-re/harness/t78/t78-i18n-en-flat.json`（2307 串）
- 我们的树：`app/ui/renderer-grok/`，核心接线 `frontend/src/recovered/features/window-chrome/global-keyboard-shortcuts.ts`（0.18 重建版，evidence 锚点指向 0.18 的 index-UbX-y3il.js）+ `frontend/src/production/ProductionRenderer.tsx` L2848-2928。
- 定位法（可复查）：`grep -oE '\{id:`sand\.[a-zA-Z]+`[^}]*\}'` 提取注册对象；`var hNn=` 附近为 keybinding 核心模块；`function Fkn` 为菜单模板；`function $fe|Qht` 为 before-input-event 解析。

## 1. 结论先行

1. **命令注册表**：21 个唯一 `sand.*` 命令 id（focusAgent1-9 展开 29 个实例），全部硬编码于 APP 一处 React hook，经 **react-hotkeys-hook v4** 的 `useHotkeys` 逐命令注册；每个命令带 `isEnabledInContentEditable` 位决定输入区内是否生效。
2. **完全不可配置**：无改键 UI、无设置区、i18n 全表仅 1 条 shortcut 串（帮助页标题）。键位是编译期常量。
3. **三层架构**：renderer 命令层（29 实例）→ 主进程菜单/before-input-event 层（zoom、devtools、fullscreen、reload、quit、Pop Out）→ 系统级 globalShortcut 1 个（Alt+Shift+Space 桌面截图）+ 托盘菜单槽位键（Cmd+Shift+1..5）。
4. **帮助面**：mod+/（及 mod+shift+/）打开「Keyboard shortcuts」双列弹层，六组 22 行；帮助页键位**从命令注册表实时解析**（非独立文档），另有命令面板与菜单 Help 两个入口（IPC `open-keyboard-shortcuts`）。
5. **我们现状**：0.18 重建系统已接线 14 命令（键位与 0.78.1 一致），Enter/Escape/IME 保护齐；缺 8 个命令 + 帮助弹层 + 主进程层 + a11y 键盘导航。0.18 与 0.78.1 有两处键位语义漂移（mod+l、agent→Bot 文案）。
6. **原版缺口实证**：帮助页宣传的 **Ctrl+Tab「Switch Bots」在 0.78.1 产物中找不到任何实现**（全 assets 唯一命中即帮助页数据本身）——复刻时可不做，或在施工时超越原版。

## 2. 命令全表（renderer 注册表，APP 实测）

键位格式：`mod` = mac `meta` / 其他 `ctrl`。「CE」= `isEnabledInContentEditable:true`（contentEditable 输入区内仍触发；未标注即 false）。条件 = 命令按运行时能力动态进数组。

| # | 命令 id | 键 | CE | label（i18n id → en） | run / 备注 | 我们现状 | 差距 |
|---|---|---|---|---|---|---|---|
| 1 | `sand.keyboardShortcuts` | `mod+/`（另绑 `mod+shift+/`） | ✅ | `77Emn0` "Keyboard shortcuts" | 帮助弹层 toggle（`st.toggle`） | 无 | **P0** |
| 2 | `sand.commandPalette` | `mod+k` | ✅ | `NiZZRh` "Jump to" | palette toggle/open | ✅ 有同键 | — |
| 3 | `sand.focusSearch` | `mod+shift+f` | ✅ | `YjO4Og` "Search Bots" | 打开搜索 | ✅ 有同键（label "Search agents"） | 文案 P2 |
| 4 | `sand.previousAgent` | `alt+up` | ✅ | `DqivxS` "Previous Bot" | 侧栏 bot stepper(-1)（含 pinned 与当前任务线程，t[18]-t[32]） | ✅ 有同键 | — |
| 5 | `sand.nextAgent` | `alt+down` | ✅ | `0xPkT8` "Next Bot" | stepper(+1) | ✅ 有同键 | — |
| 6 | `sand.navigateBack` | `mod+[` | ✅ | `iH8pgl` "Back" | 导航历史后退 | ✅ 有同键 | — |
| 7 | `sand.navigateForward` | `mod+]` | ✅ | `rxWGWX` "Forward" | 前进 | ✅ 有同键 | — |
| 8-16 | `sand.focusAgent1`..`9` | `mod+1`..`mod+9` | ✅ | `aldadB` "Focus sidebar Bot {ordinal}" | 聚焦侧栏第 N 个 bot（`i[N-1]`） | ✅ 有同键（label "Focus sidebar agent N"） | 文案 P2 |
| 17 | `sand.send` | `mod+enter` | ❌ | `pi1oME` "Send message" | 发送 | ❌ 无（仅 Enter） | **P0** |
| 18 | `sand.newAgent` | `mod+n` | ✅ | `2hjDEV` "New Bot" | 新建 bot | ✅ 有同键 | — |
| 19 | `sand.newGroupChat` | `mod+shift+n` | ✅ | `yqxI6O` "New group chat" | 条件：群聊能力（`ct`） | ❌ 无 | P1 |
| 20 | `sand.openSettings` | `mod+comma` | ✅ | `Yp+Hi/` "Open settings" | 设置 | ✅ 有同键 | — |
| 21 | `sand.toggleAgentSettings` | `mod+shift+comma` | ✅ | `GQMjqk` "Toggle Bot settings" | 注入式（`k.toggleAgentSettingsAction`，可能条件化） | ❌ 无 | P1 |
| 22 | `sand.openTools` | `mod+shift+m` | ✅ | `srRMnJ` "Customize"（帮助页行文案 `h8AWBN` "Connect apps"——两文案并存） | 打开工具/连接器面板 | ✅ 有同键 | — |
| 23 | `sand.focusInput` | `mod+i` | ❌ | `k4TqK/` "Focus prompt" | `A.focusPrompt` | ✅ 有（0.18 为 `mod+i, mod+l` 双键） | 见 #24 |
| 24 | `sand.addSelectionToPrompt` | `mod+l` | ❌ | `WWv1+v` "Add selection to prompt" | `A.addSelectionToPrompt`（把界面选中文本加入输入） | ⚠️ 0.18 把 mod+l 当 focusPrompt | **P1**（键位语义升级） |
| 25 | `sand.findInChat` | `mod+f` | ✅ | `pF1b7U` "Find in chat" | 先向 canvas stage 派发自定义事件 `sand-stage-find`（`[data-canvas-stage-open]`），未拦截才走聊天内搜索 | ✅ 有同键（无 stage 分流） | stage 分流 P2 |
| 26 | `sand.openSkills` | `mod+shift+w` | ✅ | `PCSkw2` "Skills" | Skills 面板 | ❌ 无 | P1 |
| 27 | `sand.toggleSidebar` | `mod+b` | ✅ | `+OFRL2` "Toggle compact sidebar" | 条件：桌面侧栏形态（`M!=null`） | ✅ 有同键 | — |
| 28 | `sand.toggleInfo` | `mod+alt+b`（mac 前缀另绑 `mod+shift+i`，即 mac 双键 `` `${P?`mod+shift+i, `:``}mod+alt+b` ``） | ✅ | `xz9eAw` "Toggle details" | 详情面板开关 | ❌ 无 | P1 |
| 29 | `sand.togglePageCommentMode` | `mod+shift+c` | ✅ | `rBSlIP` "Comment on the page" | 条件：page/comment 能力（`Se`）；run 先判 canvas stage | ❌ 无（无 page stage 域） | P2 |

数组组装锚点（APP）：`an=[kt,jt,Nt,...Pt,Ft,Rt,...zt,Vt,Ut,Gt,Jt,Yt,...Xt,...Zt,$t,...en,rn]`；其中 `Ft=St.jumpToAction`、`Yt=St.searchAction` 为 palette 内部 action（无独立 hotkey，供 paletteCommands 列表），`Zt=j.actions` 为基础命令组（含 #2/#3/#8-16）。

口径说明：覆盖度地图记「25 个可执行命令」；本报告实测 21 唯一 id / 29 注册实例（focusAgent×9 展开），差异源于计数口径（是否展开 focusAgent、是否含条件命令）。

## 3. 非命令固定键（不走注册表）

| 键 | 行为 | 锚点 | 我们现状 | 差距 |
|---|---|---|---|---|
| `Enter` | prompt 内发送（`!shift && !isComposing`） | 帮助页 `n8('enter')` + 多处 `e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing` | ✅ rich-text-editor.tsx L743 | — |
| `Shift+Enter` | 换行（帮助页 hint `8xEOPI` " for new line"） | ENn() send entry | ✅ | — |
| `mod+d` | 听写，**push-to-talk**：keydown 开录；keyup 时若按住 ≥500ms 则停录，短按为 toggle（再按停）；仅 prompt 聚焦时；isProcessing 时不响应；Escape 取消 | APP `Qwt`/`Zwt`（d=2917 附近）；帮助页 hint `lO8IrZ` "Hold to talk" | ⚠️ 有 voice 按钮无键 | **P1** |
| `mod+shift+v` | 无格式粘贴（prompt-editor） | APP `$3t`（`isComposing||keyCode===229||!(meta||ctrl)||!shift||alt` 反向判定 + key==='v'），PROMPT 消费 | ❌ 无 | P1 |
| `Ctrl+Tab` | 帮助页宣传「Switch Bots · Hold ⌃」 | **全 assets 唯一命中即帮助页数据 `n8('ctrl+tab')`，无实现代码**——文档性条目或未发布功能 | ❌ 无 | 不做（原版实证缺失） |
| `Escape` | 各弹层/面板就地关闭（dialog、info 面板 `e.key!=='Escape'||e.defaultPrevented||…`、palette、dictation） | APP 多处 | ✅ 有全局关闭链（findInChat→palette→overlay→asyncTasks，ProductionRenderer L2916-2928） | — |
| `Tab`/方向键 | **键盘导航模式**：按下即在 `<html>` 根切换 `data-sand-keyboard-nav` 属性（focus ring 显隐），纯 Tab/无修饰箭头触发 | common `$v`/`ey`；i18n keyboard/a11y 9 串 | ❌ 无 | P2（a11y） |

## 4. 机制节：注册 / 分发 / 可配置性

### 4.1 renderer 侧（react-hotkeys-hook v4，VENDOR 实证）

- **库**：VENDOR 内为 react-hotkeys-hook v4 全量实现（`HotkeysProvider`、scopes、`enableOnFormTags`、`enableOnContentEditable`、`ignoreEventWhen`、序列键 `>`/sequenceTimeoutMs 1000、held-modifier Set 在 window blur/contextmenu 时清空）。特征函数链：`IP`（useHotkeys 主体）→ `DP`（chord 匹配）→ `_P/vP/yP`（held 键集合）。
- **命令对象**：`{id, label, hotkey, isEnabledInContentEditable?, run}`。hotkey 为逗号分隔多 chord 字符串（如 `mod+slash, mod+shift+slash`、mac 的 toggleInfo）。
- **绑定组件**（APP，混淆名可按 d= 编号定位）：
  - `lNn`（d=2919）：`{actions, isMacPlatform, children}` → 过滤 `hotkey!=null`，把 chords 解析结果放进 Context（`Qw` d=2863 / `Zw` / `kGe()` 消费——tooltip 等处显示键位），并为每个命令渲染 `<mNn>`。
  - `mNn`（d=2918）：单命令绑定。`$6(hotkey, isMac)` 把 `mod` 展开为 `meta`/`ctrl`；handler `e.preventDefault(); run()`；options 恒为：
    ```
    {enableOnFormTags: true,           // input/textarea/select 等 form 元素内仍触发
     enableOnContentEditable: action.isEnabledInContentEditable ?? false,
     ignoreEventWhen: pNn,             // e.isComposing || e.key==='Process' || 纯修饰键 → 忽略（IME 安全）
     preventDefault: true}
    ```
- **input 内外判定**：分两级——form tags（react-hotkeys-hook 白名单：input/textarea/select/searchbox/slider/spinbutton/menuitem*/option/radio/textbox）恒放行；contentEditable 需命令显式 `isEnabledInContentEditable`。
- **修饰键冲突**：`pNn` 吞掉纯修饰键按下；held-modifier set 防止修饰键残留（blur 清空）。无用户级冲突检测 UI。
- **与 canvas/page stage 协调**：findInChat 与 togglePageCommentMode 的 run 先向 `[data-canvas-stage-open]` 元素派发自定义事件（`sand-stage-find` 等，可 cancelable），stage 拦截则不再走聊天内逻辑。
- **可配置性**：无。键位为代码常量；设置七区（RE-SETTINGS-0.78.1）无快捷键区；i18n 全表唯一 shortcut 串即帮助页标题。

### 4.2 主进程层（MAIN 实证）

**应用菜单**（`function Fkn`，mac 与 win/linux 差异，全部经 `applyWindowShortcut(kind)` 或 emit 到 renderer）：

| 菜单项 | accelerator | 备注 |
|---|---|---|
| Settings | `CmdOrCtrl+,` | `emitOpenSettings` |
| Quit | `CommandOrControl+Q` | **win32 不设 accelerator**（`vse`：`win32?{}`），仅 mac/linux |
| Close Window | role close（mac） | |
| Edit 全组 | role editMenu | 原生 C/C/V/X/Z/A/Shift+Z |
| View→Reload | `CmdOrCtrl+R` | |
| View→Unread filter | 无键（checkbox） | |
| View→Pop Out Chat | `CmdOrCtrl+Shift+O` | 条件 `canPopOutChat()`；`emitPopOutChat` |
| View→DevTools | mac `Cmd+Alt+I` / 其他 `Ctrl+Shift+I` | 条件 `canUseDevTools()` |
| View→Full screen | mac role / win `F11` | |
| Help→Keyboard Shortcuts | **无 accelerator** | IPC `open-keyboard-shortcuts` → renderer `ingestOpenIntent()` 打开帮助弹层 |

**before-input-event**（`attachChordForwarding`，`Qht`=zoom 解析、`$fe`=window shortcut 解析；主进程 preventDefault 后直接执行，不经 renderer）：

| 键 | 动作 |
|---|---|
| `mod+=`（含 `+`）/ `mod+-` / `mod+0` | zoom in/out/reset（步进 0.1，clamp 0.5–3.0，`Ght/R2n/w2n`） |
| `F11`（全平台）+ mac `ctrl+meta+f` | fullscreen |
| `F12`（全平台）/ mac `mod+alt+i` / 其他 `ctrl+shift+i` | toggledevtools（过 `canUseDevTools` 门） |
| `mod+r`（无 shift、无 alt） | reload |
| `mod+q` | quit |

**globalShortcut**（唯一 1 处）：`Alt+Shift+Space`（`dQn` 默认）→ desktop-mount capture overlay；feature gate `sand_desktop_mount`；注册失败上报 Sentry（「sand desktop-mount capture hotkey unavailable」）。

**menubar-tray**（托盘菜单）：置顶前 5 个 bot 各带 `CommandOrControl+Shift+${slot}`（slot=1..5，`BNt().slice(0,Ucr)`，`Ucr=5`）→ `showApp()+openAgent()`；Settings `CmdOrCtrl+,`；Open app / Quit 无键。

### 4.3 帮助面（Keyboard Shortcuts 弹层）

- 触发三入口：mod+/（renderer 命令）、命令面板条目（id `open-keyboard-shortcuts`，icon `keyboard`，带 keywords/detail）、菜单 Help（IPC）。
- UI（APP `PNn` d=3071 / `MNn` d=3072）：dialog（aria-label "Keyboard shortcuts"），标题 + x 关闭钮，**内容按行数对半分双列**（`NNn`），keycap 徽章样式（`r8.keyCap`），mac 显示 ⌃⌥⇧⌘、其他显示 Ctrl/Alt/Shift/Meta（`bNn` 映射），特殊键映射 `xNn`（enter↵ escape⎋ tab equal+ minus− comma, slash/ bracket[] up↑ down↓）。
- 数据（`ENn`）：六组 22 行——Essentials（Search / New Bot / Send+hint / Go to Bot range ⌘1–9 / Compact sidebar / Settings / Keyboard shortcuts）、Chat（Focus chat / Find in chat / Dictate+hint / Add selection）、Navigation（Previous/next Bot requiresAll、Back/forward requiresAll、Switch Bots Ctrl+Tab）、Panels（Details / Bot settings / Skills / Connect apps）、Pages（Comment on the page）、Window（Zoom 三键 / Full screen mac `ctrl+meta+f`·其他 `f11`）。
- **键位实时解析**（`jNn`）：帮助页从当前命令注册表 build `Map(id→hotkey)` 再格式化——条件命令不可用时该行整行隐藏（`requiresAll` 组两键缺一即隐藏）。`t8(id)`=action 条目、`n8(fixed)`=固定键条目、`{kind:'range',ids}`=⌘1–9 连续段显示（`ONn` 合成 `⌘1–9`）。

## 5. 我们现状对照汇总

已有同键同语义（0.18 重建系统，`global-keyboard-shortcuts.ts` + ProductionRenderer L2848-2928 全接线，含 Escape 关闭链与 document 级订阅）：#2 commandPalette、#3 focusSearch、#4/#5 prev/next、#6/#7 back/forward、#8-16 focusAgent1-9、#18 newAgent、#20 openSettings、#22 openTools、#23 focusInput（mod+i）、#25 findInChat、#27 toggleSidebar，及 Enter 发送/Shift+Enter/IME 保护。

语义漂移两处：
1. `mod+l`：0.18=focusPrompt 第二键；0.78.1=独立命令 addSelectionToPrompt（focusInput 仅 mod+i）。
2. 文案：0.18 用 "agent"（Previous agent / Focus sidebar agent / Search agents），0.78.1 全面改 "Bot"（Previous Bot / Focus sidebar Bot / Search Bots）。

完全没有：#1 帮助弹层、#17 mod+enter、#19/#21/#26/#28 面板命令四件、#24 addSelectionToPrompt、#29 page comment、mod+d 听写键、Cmd+Shift+V、keyboard-nav a11y、主进程层全部（菜单/before-input-event/globalShortcut/托盘——DSH 侧栏形态部分天然不适用）。

## 6. 建议施工分组

1. **第一批（纯 renderer、小工单，行为收益最大）**：
   - `mod+enter` 发送（对齐 #17，注意 CE 语义：0.78.1 该命令无 CE 位=输入区内也触发，但 Enter 本身已发送，mod+enter 主要服务于多行编辑时免聚焦末行发送）；
   - Keyboard Shortcuts 帮助弹层（mod+/ + 双列六组数据文件 + keycap 渲染 + 从我们注册表实时解析——规格全在 §4.3；palette 加 `open-keyboard-shortcuts` 条目）；
   - `mod+l` 语义拆分（focusInput 收窄为 mod+i；mod+l 挂 addSelectionToPrompt 的最小实现：把 window.getSelection() 文本插入 prompt）。
2. **第二批（面板开关命令四件）**：toggleInfo（mod+alt+b）、toggleAgentSettings（mod+shift+comma）、openSkills（mod+shift+w）、newGroupChat（mod+shift+n，能力门控）。
3. **第三批（输入体验）**：mod+d push-to-talk（500ms 阈值规格 §3，接现有 voice）、Cmd+Shift+V 无格式粘贴。
4. **第四批（形态判定后再做）**：keyboard-nav a11y（`data-sand-keyboard-nav`）、主进程 zoom/devtools/fullscreen（DSH 形态裁剪——我们无 menubar 应用菜单，可选 Electron 菜单或省略）、ctrl+tab（**原版无实现，建议不做**）、addSelectionToPrompt 全量（transcript 选区源）、findInChat 的 canvas-stage 分流（依赖 page stage 域，随 H 域一起）。

## 7. 局限与未验证项

1. 全部静态结论，未执行 0.78.1 产物；「按下会发生什么」由代码路径推出，未做按键级运行时验证。
2. run 实现只溯源到 stepper/handler 边界（如 previousAgent 的 `R(-1)` 内部排序细节、`St.jumpToAction/searchAction` 的 palette 行为未逐行展开），不影响键位表结论。
3. `k.toggleAgentSettingsAction`、群聊门 `ct`、page 门 `Se`、侧栏门 `M` 的具体 feature gate 值未逐一解析（条件存在性已证，取值未证）。
4. 帮助页 openTools 行文案（"Connect apps"）与命令 label（"Customize"）不一致为原版实况，未判定哪个是最新意图。
5. `Ctrl+Tab`「无实现」是 4.5MB renderer assets + 4.5MB electron-main 全文检索的否定结论（多种拼写形式均查）；若实现藏在 native 层或服务端下发，本方法不可见。
6. 0.18 重建版（global-keyboard-shortcuts.ts）与 0.18 原产物的等价性按其自带 evidence 注释采信，未重验 0.18 产物。
7. 本报告未覆盖 0.78.1 各 lazy chunk 内的局部快捷键（如文件查看器、pdf viewer、代码块内部键）——它们不属于全局命令系统；如需可另做 chunk 级扫描。
