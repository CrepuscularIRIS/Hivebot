# REPORT-P5-12 · 会话流 B7 thinking 行 + B14 时间分隔 / 未读线（frontend-dev，Opus 5.5）

> 主会话代录（builder 写报告被拦），2026-11-03

分支 feat/P5-12 @ 97d8cb9（基 main 32f2a1c），worktree /tmp/bot-wt/P5-12。定稿 ui/P5-12-final.md（15 分歧）；截图 evidence/P5-12/（5 张）。

## 定稿取舍
- 阈值/首条恒 1 条/「未读线→时间分隔→消息」顺序/复用 tool 行外壳/margin 0：采纳席 A（0.78.1 实证 @1734517/@1739705）；席 C 阈值系未确认拟定值不采纳
- 推理阶段两席合并：有推理没正文→「思考中」行；两样都没有→三点（修掉 start 帧后空流式气泡）
- 自定：已读边界在会话视图卸载时 markRead（覆盖去市场页再回来）；空 bot 基线记 0
- 展开正文复用 .tool-detail（12/16）字体改正文；预览 13px 非 mono（R2 B6）

## 改动
- reduce.ts：thinking 类型、可选 at（event.time）、streaming.reasoning、SEP_GAP_MS/withMarkers/timeLabel/firstUnreadId/latestAt
- Conversation.tsx：ThinkingRow、「思考中」行、空气泡修复、分隔/未读渲染、进入冻结、超一屏滚到线、卸载 markRead
- session.css（新）；store.ts（已追认）：L11/L42-43/L54/L279-285（readMark 字段 + markRead）
- app.css 越区 1 行（**主会话已追认**）：.shell { grid-template-rows: minmax(0,1fr) }——原隐式 auto 行被内容撑高，820px 窗口 transcript 实测 2142px 从不滚动，不修则「超一屏滚到线」做不出，且 80px 跟随/新消息胶囊失效
- 测试：tests/unit/session/markers.test.ts（13 条）、tests/e2e/visual-session.spec.ts（2 条）

## 验收自测
①思考中/思考行（0xf429 accent、11px/600、键鼠开合、aria-controls）②阈值/跨日/缺时单测 + e2e 全流 1 条分隔在首条上、之间 0 条、margin 0、间距 22±1 ③未读线恰 1 条、超一屏线距视口顶 28±2、停留不动、离开再回 0 条 ④亮暗各断言 ⑤build 绿 + 单测 237 + e2e 56/0 失败/0 flaky ⑥GU 待评

## 已知上限
未读线不持久化（重启不出线）；「思考中」定稿换一次节点；thinking 字形未进 theme 图标表（P5-16 并入）
