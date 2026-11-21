# T76：字阶体系（两刀 + 二批遗留两断言）

> 开单：补记（原单未落盘，范围以 queue.md 第 12 行 / U3 与 receipts/T76.receipt.md 为准）| 施工：main (GLM 5.3)
> 分支：feat/T76 @ /tmp/bot-wt/T76（fee966a4→10e1b623）
> accepted：2026-11-15 10e1b623（主线 e455bf59）

## 经理验收（2026-11-15）
- 改动范围：仅 `overrides/p5-55-layout.css`（+24）与 t83-enter / t83-session-motion 两条断言；未碰 recovered，check 14 不变。
- 重跑：t83-motion + t83-enter + t75 + t74 → **4 passed**；巡检 tour → **2 passed (2.7m)**（approval 面 locator 报 ERROR，与本单无关、既有）。
- 巡检数字未逐一复现回执口径：本次 probes 16px/normal 合计 n=17（回执称 35），distinct（字号/行高/字重）38、（字号/行高）29。方向成立（下降），口径差记 T79 巡检时统一。
- alpha 口径认可：底字 60% mix × 文本色 68% = 0.408，区间 (0.35, 0.6) 既排除不透明也排除只算一层。
- 遗留小毛（不返修，T79 顺带）：`@keyframes t83-status-fade-reduced` 重复一行；email 注释写「11→xs」实设 sm；`.sand-command-palette__group-label` 选择器未命中（palette `small` 仍 10.83px ×14）；`[role="menuitem"]` 全局选择器偏宽。
