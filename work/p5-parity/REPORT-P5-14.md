# REPORT-P5-14 · E5 细边 token

> frontend-dev 回报，主会话代录（其写报告被拦截），2026-11-03

分支 feat/P5-14 @ b1b5ad6（基 main f65b4df），worktree /tmp/bot-wt/P5-14。改动：theme/dsw.css 新增 `--dsw-alias-border-l1-width: .5px` / `--dsw-alias-border-l2-width: .5px`；新测试 tests/e2e/visual-hairline.spec.ts。

## 自验
- 验收①②③全过：两 token 画出的边框 0.5px（亮暗各一）；侧栏右缘/pane 左缘仍 0.5px；build ✓ + vitest 224 绿 + e2e **56 passed**（含 1 条 test.fail 标记的 f1 用例，不算红）。
- **DPR 2 要求**：Electron 44 实测 `.5px` 在 DPR 1 计算值是 1px，DPR 2 才是 0.5px。测试用 `--force-device-scale-factor=2` 启动并先断言 DPR===2。**所有断言 .5px 的任务（P5-15.f、P5-16 等）都要这样跑**。
- 锚点出入：0.18 view.css:8 是 1px；.5px 依据只有 production.css:43。
- 截图：work/p5-parity/evidence/P5-14/hairline-{light,dark}.png。

## P5-14.f1（接线，另立行）
app.css 第 41、55、134、338、361 行的 `1px` 换 width token；第 134 行（tool-card）交 P5-16；app.css 与 P5-11/P5-12/P5-16 交叠 → f1 排 P5-11、P5-12 之后。f1 落地前 E5 不标 fixed@sha；落地后删 test.fail 标记。
