verdict: PASS
commit: 83a39ab2f7cf4b16afbd6c861f2b3e1cfee15270

独立复跑（不信自述；HOME=/tmp/bot-vfy-p515，worktree 全程干净、HEAD 无漂移）：
build ✓（1.14s）· vitest **224/224**（27 文件）· e2e **54/54**（5.8m，自带 Xvfb）· NewBotDialog 族单跑 bots.spec **6/6**（16.5s，零 flaky）。实录 `evidence/P5-15/verify-rerun.txt`。

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| ① 区域：仅 visual.spec.ts，产品代码零改动 | PASS | `git diff f65b4df..83a39ab --stat` → `app/ui/tests/e2e/visual.spec.ts | 164 +++…（+121/−43）`，无其他文件 |
| ② u2-table 22 行齐全 + 数值断言 ≥40 亮暗成对 + 抽 5 条值一致 | PASS | u2-table.md 22 行 = 主表 19 + 规则 5/9/15（按派发 22 行口径，REPORT 已注明与 PLAN v2.1 18 行口径的出入）；具名断言 31 位，themed() 亮暗成对，b6b8 收起/展开两轮 → 执行 **70** 条 ≥ 40。抽 5 条全对表：A1 `height 38px/padding 0px`、B2 `28px 30px/750px`、B6 detail `0 10 10 25/220`、D6 行 `12/56/12`、规则 15 `8px 0px/13px/18.2px/secondary 亮暗`（visual.spec.ts L78/91/123/196-197 ↔ u2-table 行 1/10/11/18/22） |
| ③ 红基线抽查：3 条改错必红、恢复后绿 | PASS | sed 改 A1 `38→39`、B10 shell `9→10`、D4 `32→33` 后单跑 visual.spec：**2 failed / exit 1**，三条断言名各亮暗红一次；`git checkout --` 恢复后单跑 **2 passed (12.0s)**（verify-rerun.txt §4） |
| ④ 「偏差记现值不红」处置如实（抽 2 个待回修行） | PASS | **A1（f1）**：断言 `38px/0px`，绿跑证明 = main 现值；R2 文档 RE-visual-078-values.md L24-41 头部 = icon 行（min-height titlebar token 44/52，L97）→ 非 R2 值；代码 L77 注释、表行 1 均指向 P5-15.f1 → P5-11。**B8（f4）**：断言 `r10/14px 16px/钮 6px 9px r6`；R2 L15 明确 r24/padding 16/药丸钮且「0.18 r10/6 9/r6 不应再作依据」→ 断言为 0.18-main 值；注释（b6b8 上方）、表行 12 指向 P5-15.f4 → P5-31 |

新问题：无。

备注（不构成 FAIL）：
- PLAN v2.1 ②原文「偏差断言以 test.fail 标记」，实际按派发指令改为「断言 main 现值保持全绿 + .f 注释」，REPORT「与 PLAN 出入」一节已如实记录；下次修订 PLAN 时把 ②的口径改成现值法即可。
- 表格计数「断言执行条数 70」经静态推算（24×2 + 5×4 + 2）与红基线亮暗各红一次的行为互证，成立。
- 验收期间对 visual.spec.ts 的三处 sed 改动已用 `git checkout --` 完全恢复，结束时 worktree git status 为空（验收手段，非代码改动）。
