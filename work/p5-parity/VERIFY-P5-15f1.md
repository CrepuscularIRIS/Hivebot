verdict: PASS
commit: bc61024（feat/P5-15f1 @ /tmp/bot-wt/P5-15f1，基 4fa028c；验收时 HEAD 与申报一致）

| 验收项 | 结果 | 证据 |
|---|---|---|
| 1. visual.spec.ts 独立复跑（Xvfb）绿 | PASS | `xvfb-run -a … pnpm exec playwright test tests/e2e/visual.spec.ts` → `2 passed (11.4s)`，exit 0。main 上红的 A1 接缝在本分支修复 |
| 2. vitest 全量 243 | PASS | `pnpm -C app/ui test` → `Test Files 28 passed (28)` / `Tests 243 passed (243)`，exit 0 |
| 3. 区域恰 2 文件 + 断言不变量写法 | PASS | `git diff 4fa028c..bc61024 --stat` = `app/ui/tests/e2e/visual.spec.ts`（+12/-2）+ `work/p5-parity/evidence/P5-15/u2-table.md`（work/ 非产品）。断言：min-height 由 `html` 上 `getComputedStyle().getPropertyValue('--sand-titlebar-block')` 运行时读取（spec L80），高 = `Math.max(parseFloat(block), 48)`（L83）——无写死 38/44；u2-table A1 行标 fixed@0c556fa（= P5-11 merge commit，已核实存在）并注明接缝与 P5-16 不连带红 |
| 4. 红基线：旧值必红、恢复绿 | PASS | 临时把 A1 断言换回 `toEqual({ height: '38px', padding: '0px' })` → 同命令 `1 failed / 1 passed`，报错 `Error: A1`（亮、暗 themed 各一处，spec L79）；`git checkout --` 恢复后复跑 `2 passed (11.5s)`。断言非恒真 |

环境：worktree 依赖已就绪（app/ui、app/sdk node_modules 在），Xvfb :99/:100 由 xvfb-run 自动分配。产品代码零改动属实（diff 无 app/ui/src）。

新问题：无。

备注：u2-table.md 在 work/ 下，按派发口径不算产品文件；其内容变更（A1 行 fixed + 接缝说明）与报告一致。
