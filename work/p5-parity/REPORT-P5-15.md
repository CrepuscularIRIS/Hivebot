# REPORT-P5-15 · U2 fixed 项数值断言

> frontend-dev 回报，主会话代录（其写报告被 hook 拦截），2026-11-03

分支 feat/P5-15 @ 83a39ab（基 main f65b4df），worktree /tmp/bot-wt/P5-15。只改 `app/ui/tests/e2e/visual.spec.ts`，产品代码零改动。

## 自验
- build ✓；vitest 224 全绿；`pnpm test:e2e` **54 passed (5.7m)**；visual.spec 连跑 3 遍绿，零 flaky。
- 断言：22 项有数值的 20 项，亮暗各一，共 **70 条**（要求 ≥40）。A8/A14 无数值不断言。逐行表 `work/p5-parity/evidence/P5-15/u2-table.md`。
- 颜色断言先写占位值确认会红，再回填实测值（红基线证据）。
- 与 PLAN 出入：按派发指令 22 行、偏差处断言写 main 现值保持全绿（PLAN v2.1 原文 18 行 + test.fail 标记）；A6 保持 34（注释「R2 推断 32 未实测，待 R3」）。

## 待回修清单（当前值 → R2 期望值；主会话已按序立 .f 行）
- **P5-15.f1 · A1**（Sidebar.tsx:131、app.css:40；排 P5-11 后）：38px 空拖拽区/padding 0 → icon 行（collapse/search/New Bot 24px r6；min-height --sand-titlebar-block；padding 12px 16px；gap 8）
- **P5-15.f2 · A4+A5 gap**（app.css:50；排 P5-16 后）：min-height 58、gap 9 → 固定高 54、padding 8、gap 8
- **P5-15.f3 · B6**（app.css:131-154、Conversation.tsx:68；排 P5-16 后）：1px 描边卡 r9/行高 34/箭头旋转±45° → 无边框裸行（高 28、padding 7px 8px 12px、r8、hover 7%；chevron right/down 不旋转；detail 左右 30/10；preview 13px 非等宽）
- **P5-15.f4 · B8**（app.css:156-172；排 P5-31 后）：r10/padding 14 16/按钮 6px 9px r6 → elevated 卡 r24 阴影 0 0 0 .5px…,0 2px 8px…；段 padding 16 gap 10；标题条 14px 16px；药丸按钮 r9999（sm 4 8 / md 6 12）
- 规则 15 不算偏差（数值不冲突，终态文案集差异归 P5-31）
- 回修时同步把 visual.spec.ts 对应断言改 R2 值；样式搬进各 visual-<任务>.spec.ts 后从本文件删对应断言。
