# REPORT · P5-52 死入口隐藏（U4′）

> 主会话代录（builder 写报告被拦），2026-11-03。完整 23 条隐藏清单见本文件 git 历史 or e2e spec ① 段——此处存机制与要点。

分支 feat/P5-52 @ cd8a3c8（基 048bc03，rebase 后），19 文件 +471/-7，上游树 diff=0。

## 机制（优先级：开关→模块覆盖→CSS）
- 开关：仅 1 条（titlebar 控件——shim platform:'win32' 走上游 win32 分支只留拖拽层；**P5-54 接 preload 时 platform 必须保持 win32 语义否则自绘控件复活**）
- **模块覆盖（新机制）**：overrides/vite.config.ts 的 resolveId 插件整模块替换（export * + 剥 prop/滤列表），让上游自己的 null 门控收起——16 条；P5-55「只写覆盖文件」直接复用
- CSS：display:none !important（stylex 三重 id 特异性压不过）——6 条，含 2 条按位置（前提注释+e2e 钉死）

## 修活的 3 个（死于版式非能力）
拖拽层 pointer-events:none+header no-drag；设置 Close 位置恢复；info pane 临时右浮（**P5-55 按 0.78.1 定稿版式时替换**）。

## U4′ 验收
15 视图×reload 静息态，42 项可见可点全响应（判死=DOM 无变化且 shim 无 RPC，或触发无 handler RPC——新增观测面 __pbotsShim.requests/unhandled），死入口 0；跳过 1 外链（断言 target=_blank）。证据 evidence/P5-52/（u4-traverse.tsv+截图）。

## 回归
ui 365/365（+3 新单测）；sdk 304/304；mount 亮暗 PASS；全量 e2e 66/1（visual.spec 旧 renderer 审批等待 flake，单跑×2 绿，本分支未触碰）。

## 交后续
L-AP 文案/Execution 下拉→P5-31；输入类无实底（description/drop file）→小任务；CSS 隐藏的键盘可达未验；版式残留（侧栏高度/气泡折行/标题游离）→P5-55。
