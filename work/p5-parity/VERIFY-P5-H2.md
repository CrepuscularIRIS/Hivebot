# VERIFY · P5-H2 · never-roots flaky 修复（轻量抽验）

verdict: PASS
commit: 1f134d55d83de8b7b5608739d551613b546eb03a（feat/P5-H2，基 92d0cc8）
验收时间：2026-11-03 12:16–12:21（实测时间戳）

| 验收项 | 结果 | 证据（命令/文件） |
|---|---|---|
| 独立复跑 race 回归 + never-roots 两文件，期望 11/11 | PASS | `vitest run tests/unit/never-roots-race.test.ts tests/unit/never-roots.test.ts` → `Test Files 2 passed (2) / Tests 11 passed (11)`（12:16:04，416ms） |
| 全量连跑 3 次，期望每次 32 files / 250 tests | PASS | 3 次 `vitest run`：每次输出 `Test Files 32 passed (32) / Tests 250 passed (250)`，零红 |
| 红基线：退回两遍实现 → race 红，恢复绿 | PASS | `git show 92d0cc8:...never-roots.mjs >` 覆盖后跑 race：`1 failed` —— 失败用例正是「readdir 与 stat 之间被并发 teardown 删除时不抛 ENOENT」（精确命中 TOCTOU）；`git checkout --` 恢复后 11/11 绿，HEAD 仍 1f134d5、`git status` 干净 |
| 区域：分支仅 2 文件；never-roots.mjs 改动仅 handoffSiblings | PASS | `git diff --stat 92d0cc8..HEAD` = never-roots.mjs (+14/-6) + never-roots-race.test.ts (+64)，无第三文件；never-roots.mjs 仅一个 hunk、全在 handoffSiblings 函数体内（单遍 statSync + try/catch + 注释），无其他函数被触碰 |
| evidence 压力脚本存在且形状真实 | PASS | 主仓 `work/p5-parity/evidence/P5-H2/stress-race.mjs`（72 行）：跨进程 racer 持续创建/删除 `/tmp/p2sdk-handoff-*` 打真实 TOCTOU 窗口，注释指明同线程 rmSync 无法打断同步循环必须跨进程——与报告根因一致 |

坏路径（本任务最相关）：红基线即坏路径——并发 teardown 删除窗口下旧实现 ENOENT 抛出、computeRoots 整体失败；新实现 try/catch 跳过 + 下游 existsSync 兜底，实测红转绿闭环。

新问题：无。
