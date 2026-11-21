# T54 MATRIX：Win11 VM vs Linux 同屏对照（2026-11-11）

- 采集：CDP 双平台同一脚本（`t54.spec.ts` + `geo.ts`）；win=VM 内 0.1.0（hbtest-cdp 实例，9229 经 ssh -L 转出），linux=主仓 HEAD（`git diff 202f0c48..HEAD -- app/` 为空 → 产品代码与 VM 同版），窗口对齐 win 实测 innerW/H（1280×752）。
- 产物：24 png（10 屏 + 4 ★暗 ×2 平台，02-rail 折叠钮选择器两平台均未命中、记跳过）+ 24 json（每屏每平台，含 rect/computed font/dpr/platform/innerW/H/loadedFonts）+ 6 张 pair-*.png 并排对照。
- 环境实测（win 侧 window metrics）：`screenX:-8, screenY:0, outerW:1296, outerH:760, screenW:1280, screenH:800, availH:752, dpr:1`；linux dpr:1。

## 原生窗口层（T54b 补，VNC 整屏像素）

| 项 | 结论 | 证据 |
|---|---|---|
| —□× 系统控件 | 窗口化在右上黑条内（白钮）；最大化不存在（右上仅应用 … 圆钮） | 01-restored.vnc.png / 01-maximized.vnc.png |
| 控件盖住的页面元素 | 还原态右上 120×40 扫描（elementsFromPoint 20×10 网格）：全部命中 `sand-chat-stage`（页面 overlay 层），无具体交互控件被盖 | t54b-drive.mjs 输出（24 采样点） |
| 四边裁切 | 最大化：y=0 一条 1px 蓝灰线（窗口边线），左/右/底均为应用像素、无截断（对照 CDP 同屏 json：innerW/H=1280×752 内容完整） | 01-maximized.vnc.png + 01-main.win.json |
| 标题栏背景与应用接缝 | 窗口化黑条与应用白色头部硬切（双头部感）；原版 overlay 无此条（titleBarOverlay 颜色随主题 chrome 色） | 01-restored.vnc.png vs RE-UI-LAYOUT §6 |
| 02-rail 折叠侧栏 | **两平台均无折叠钮**——0.78.1 有（icon 行 layout-sidebar-left，tooltip "Collapse sidebar"，mkMLq4）；我们的 sidebar.tsx 只有 New 钮 → 复刻缺失（非 Windows 特有），另列打磨单 | RE-visual-078-values.md 结论① vs sidebar.tsx:124-140 |
| 10-900×600 | 窗口 resize 需拖拽边缘，VNC PS/2 鼠标不可靠（CLAUDE 既有教训：click 从未生效）——未取；页面视口 900×600 两平台一致已由 T54 json 证（10-900x600.*） | T54 10-900x600.{win,linux}.json |

## 差异表

| 屏 | 差异 | 量化 | 候选原因类 | 证据 |
|---|---|---|---|---|
| 全部（核心错位 A·改写） | **窗口化（还原态）出现系统标题栏**：黑色横条 y0-59 全宽 + 右上 —□× 白色系统控件，应用自绘白色头部在其下方并存（双头部）；**最大化时干净**（y=0 仅 1px 蓝灰边线，右上只有应用自己的 … 菜单钮）。win-metrics 的 −8/1296 为最大化不可见边框（Windows 常态，非错位，T54 原判断撤回） | 黑条 60px 全宽（像素实测）；对照原版 0.78.1 win32 = `frame:false + titleBarStyle:"hidden" + titleBarOverlay(h51)`（RE-UI-LAYOUT §6，无系统标题栏、自绘 overlay 控件、浮层避让 inset 140px） | **平台分支样式**：我们 main 的 BrowserWindow 在 win32 未走 titleBarOverlay 分支（默认 frame）——修法=照原版 win32 分支配置（等 T55/T56 单落地） | screen/01-restored.vnc.png（黑条+白钮）、screen/01-maximized.vnc.png（干净）、/tmp/t54b-tr.png 裁图（最大化右上仅 … 钮） |
| 05-market（亮暗同） | 市场浮层标题宽 win 窄 7.3px | Δw=−7.3（#sand-plugins-modal-heading；x/y/h 一致） | 字体度量（Segoe UI vs Linux 默认，同字号文本宽度差） | 05-market.{win,linux}.json |
| 08-onboarding-connect | 连接器行高 win 高 3px | Δh=+3（[role=listitem]；x/y/w 一致） | 字体度量（行高随实际字体 ascent/descent 微差） | 08-onboarding-connect.{win,linux}.json |
| 01-main / 01-dark / 03-session / 04-titlebar / 06-settings(含 dark) / 07-newbot / 09-infopane / 10-900x600 | **一致**（对齐视口后几何 Δ≤1.5px，dpr 均 1） | — | — | 各 json |
| 02-rail | 未采（折叠钮选择器两平台均未命中——非 Windows 特有） | — | — | spec skipped 记录 |

## 结论（给修单）

1. **主修单方向**：窗口层而非页面层——main 的 BrowserWindow win32 最大化路径（8px 边框补偿）；原版 0.78.1 有 win32 标题栏/窗口控件分支（REA 派工单第 6 面在查），修法定型等 REA 对照。
2. **次级**：两处字体度量微差（−7.3px/+3px）属同参渲染的字体差异，量级小不构成"错位"，打磨单可顺手对齐（如显式 font-family 栈）。
3. 缩窗（900×600）无平台特有溢出；暗色模式几何与亮色一致。


## 第三轮取证（T54c 返修二，vnc2 帧——会话重建+像素校验链）

- 链路：注册表 AutoLogon+重启 VM（会话注销导致前两轮死屏的根因）→ 键盘登录 → CDP 切状态 + vncdo 整屏拍（**每帧 PIL 均值+md5 校验**，六帧全非黑、无重复、1280×800；Sticky Keys 弹窗污染一轮已用 Enter 关闭+改鼠标移动唤醒）。
- **结论收敛（推翻第二轮"黑条双头部"读图——那批帧是坏图）**：
  1. **窗口层正常**：窗口化=自绘头部与 titleBarOverlay 的 —□× 系统控件**同排**（window.ts:68-76 早已配置，T55 判断"未走分支"系误读）；侧栏/主区对齐正常，无重叠/截断；最大化正常。**无"错位"实据。**
  2. **真可见 bug=T60**：`<bot_introduction_request>` 提示原文显示在**三处**——会话标题（顶部+任务栏）、侧栏会话项、composer 占位（`Message <bot_introduction_request>You were just`）。c2-01restored.vnc2.png 亲检+OCR 双证。**这大概率就是用户说的"UI 问题"主体。**
  3. c2-05market 显示死路空态旧文案（0.1.0 未含 T51 修复——主线已修，发版即消）。
- 帧清单：c2-01max-light/dark、c2-05market、c2-06settings、c2-07newbot、c2-01restored（均 .vnc2.png，均值 32-248、hash 各异）。
