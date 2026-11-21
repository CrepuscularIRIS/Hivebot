# REA 派工单（给 reverse-engineer agent）：0.78.1 设置 / 市场 / 连接器 UI 布局像素规格 + Windows 平台分支

> 写单：manager (Opus 5.5) 2026-11-11 · 派发：主 agent 原样转给 `reverse-engineer`（不传 model）
> 来源：work/ui-polish-win/BRIEF.md 要求 1；PLAN 行 R1
> 产出：`work/grok-0.79.3-re/RE-UI-LAYOUT-0.78.1.md` + 参照图 `work/ui-polish-win/ref/*.png`

## 目标
给后面的打磨单一份**能直接写成断言的**规格：每个组件的盒子尺寸、内外边距、圆角、边框、字号 / 字重 / 行高、控件形态、亮暗两套颜色（写到 CSS 变量名 + 解析后的值），再附原版真实渲染的参照图。已有的文案 / 流程规格（RE-SETTINGS / RE-CONNECTORS）不重做。

## 已有、直接复用（别重做）
- 解包：`/dev/shm/pbots-re/gb0781/extracted/dist/`（renderer/assets 627 个 js、electron-main 等）；旧解包路径 `/dev/shm/grok-re/0.78.1/` 可能已失效，以前者为准。
- CSS 已拆规则：`work/p5-parity/evidence/078-css-rules-split.txt`（8,871 条 stylex 规则）；方法见 `work/p5-parity/RE-visual-078-values.md`（市场容器 D1–D3 已有值，补缺不重测）。
- **原版 renderer 免登录渲染脚手架**：`work/p5-parity/harness/grok-r3/`（`serve.mjs` + `drive.mjs` + `stub-init.js` / `stub-init-market.js`），方法与坑见 `work/p5-parity/RE-stub-boot.md`（复跑约 2 分钟一张；market fixture 已能出列表；详情页曾因时序竞态没拍到）。i18n 解码表 `harness/grok-r3/r4-i18n-decode.json`。
- 文案 / 流程：`work/grok-0.79.3-re/RE-SETTINGS-0.78.1.md`、`RE-CONNECTORS-0.78.1.md`、`work/p5-parity/RE-market-detail.md`。

## 要提取的面（按优先级）
1. **设置对话框**：外壳（宽高、圆角、遮罩、左导航宽、导航项高 / 图标 / 选中态）、分组标题、设置行（label + 说明 + 右侧控件）的行高与间距、开关 / 下拉 / 分段控件 / 文本框的形态与尺寸、危险按钮、General 区实际行序（RE-SETTINGS 局限 4 说行序没逐行还原——这次用渲染出的 DOM 定）。参照图：General、Updates、任一含开关 + 下拉的区，亮 / 暗。
2. **按钮体系**：primary / secondary / ghost / danger × sm / md / lg 的高、内边距、圆角、字号，**亮暗各自的底色与字色（变量名 + 值）**、disabled 态。特别回答：暗色 primary 按钮的字色用的是 `--sand-text-on-primary` 还是 `--sand-text-inverted` 或别的（我们暗色 primary 白底白字，见 `work/tickets/receipts/T51.acceptance.md` F2）。
3. **输入框体系**：文本框 / 搜索框 / URL 框的高、圆角、边框、focus 环、placeholder 色、带图标的内边距。
4. **市场浮层**：列表行（40 图标、标题 / 副题字号、Connect 药丸）、空态、详情页单列、自定义 MCP 表单（catalog chrome：label 在上、字段间距、ActionBar）。补拍详情页与表单（RE-market-detail §8 局限 1）。
5. **连接器卡三态**（Connect / Reconnect / Connected to {account}）与已连接计数徽标的尺寸。
6. **Windows 平台分支**（BRIEF 的错位线索，高价值）：
   - renderer 里按 `win32` 分支的地方（经理已见 `index.eager-app-iGTgHP_Q.js` 有 `if(l==='win32')` 的标题栏 / 窗口控件分支，`C8n` 平台归一函数；`chunk-general-pane-*.js` 也有 win32 分支）：各分支改了什么（窗口控件位置 / 尺寸、标题栏高度、侧栏顶部留白、字体栈、滚动条样式）。
   - electron-main 的 BrowserWindow 选项在 win32 下的取值（`titleBarStyle` / `titleBarOverlay` 颜色与高度 / `frame` / `backgroundMaterial` 等）。
   - 原版的字体栈（`font-family` 声明，Windows 下落到哪个字体）与滚动条样式（`::-webkit-scrollbar` 或 `scrollbar-width`）。
   - 输出一张「原版在 Windows 与 Linux 的差异清单」，供 T54 取到的我们的错位表对照。

## 产出格式
- `RE-UI-LAYOUT-0.78.1.md`：每节一张表「组件 | 属性 | 亮值 | 暗值 | 变量名 | 锚点（文件@偏移 或 CSS 规则行号）」；Windows 一节单列；末尾「局限与未验证」。
- 参照图 `work/ui-polish-win/ref/`：命名 `<面>-<状态>.<light|dark>.png`，统一 1280×800（与 Win11 VM 窗口同尺寸，方便和 T54 对照），另附 1440×900 一套可选。
- 每张参照图在文档里标明 fixture 与驱动参数，能复拍。

## 边界
- 只读产物、只写 `work/`；不运行原版 Electron 主进程、不登录、不联网（RE-stub-boot 的做法）；不读 `~/.grokbot`。
- 渲染用 headless Chrome 时注意 RE-stub-boot 记的 stale frame 坑（md5 去重）。
