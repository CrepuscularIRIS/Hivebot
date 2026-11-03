# REPORT · P5-11.f1（GU-P5-11 必须回应 2 条）

> 主会话代录（builder 写报告被拦），2026-11-03

分支 feat/P5-11f1 @ /tmp/bot-wt/P5-11f1，基 9450740，commit 61bf31d（Sidebar.tsx +1/-1、sidebar.css +2/-1、visual-sidebar.spec.ts +34/-4）

| # | 必须回应 | 处理 | 证据 |
|---|---|---|---|
| 1 | 折叠态市场钮无可达名 | market 钮加 aria-label="市场" title="市场"，span 仍由折叠 CSS display:none | 新 e2e visual-sidebar.spec.ts:117：78 宽 getByRole('button',{name:'市场',exact:true}) 可见、data-action=market、title=市场、span 隐藏、.icon aria-hidden=true、点击后 aria-current=page；改前红（not found），改后绿 |
| 2 | 断言改不变量 | 删折叠头部 padding 4px、条目 min-height 54 字面断言；新增 collapse 钮中心 y 两态差 ≤1px（亮暗各一次）、折叠条目宽 54 且中心距列表内容区中心 ≤1px | 改前红：中心 y 差 5px（展开 48 / 折叠 38） |

CSS 说明：折叠规则 padding: 4px 改 padding-inline: 4px（横向保留 R2 的 4，纵向 12 与展开一致）——不改则 y 不变量红，且 P5-16 的 44 档下仍差 4px。
自验：build 0；vitest 27 files/230 passed；e2e（Xvfb）58 passed/1 failed = visual.spec.ts:78 A1（main 既有接缝，归 P5-15.f1，与本改动无关）；hairline:58 ✘ 为既有 test.fail。
截图：evidenceOut('P5-11')（gitignored）。
