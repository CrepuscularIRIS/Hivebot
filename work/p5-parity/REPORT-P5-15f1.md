# REPORT-P5-15.f1 · A1 头部接缝修复

> 主会话代录（builder 写报告被拦），2026-11-03

分支 feat/P5-15f1 @ bc61024（基 main 4fa028c），worktree /tmp/bot-wt/P5-15f1。产品代码零改动；改 app/ui/tests/e2e/visual.spec.ts（A1 断言）+ work/p5-parity/evidence/P5-15/u2-table.md（A1 行）。

## ① P5-11 头部 vs R2 A1：逐项一致无需补（钮 24×24 r6、gap 2、padding 12 16、gap 8、min-height 用 --sand-titlebar-block 未动 token 归 P5-16）；折叠态 R2 要 --sand-titlebar-collapsed-block（token 不存在，归 P5-16）
## ② 断言更新：复现红（期望 38px/0px 实得 48px/12px 16px）→ 新断言亮暗各一：A1 min-height=运行时 token 值/padding 12 16/gap 8/space-between；A1 高=max(token,48)；A1 组 gap 2；A1 钮三钮 24×24 r6——不变量写法，P5-16 改 44/52 不连带红。u2-table A1 行 → fixed@0c556fa（注明接缝）
## ③ A4/A5 未受 P5-11 影响（修前 soft 断言只报 A1）；无其他接缝红

## 自验
build ✓；vitest 28 files/243 全绿；e2e（Xvfb）**60 passed** exit 0（hairline:58 ✘ 为 test.fail 预期失败计 passed）；visual.spec 单文件修前 1 failed/修后 2 passed。注：新 worktree 需 app/{ui,sdk} 各 pnpm setup。
