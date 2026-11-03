# REPORT P5-01.f1（sandbox-hardened ⑧ 主仓布局红，当场修）

> 主会话代录（builder 写报告被拦），2026-11-03

分支 feat/P5-01f1 @ f7dc17b（基 main 93cbc7b）。仅改 app/sdk/tests/e2e/sandbox-hardened.test.ts（19+/7-）。

## 根因（取证脚本 evidence/P5-01f1/rootcause-main-layout.mjs 复刻 start.ts 组装+实跑 wrapper）
主仓布局 TEST_HOME=.test-homes/p5-01（决策 8）在仓根之下 → cwd=REPO_ROOT 即「工作区是 HOME 祖先」→ wrapper 按决策 13 ④ fail-closed 拒绝（`bwrap: workspace ... contains HOME ...; refusing to run`），探针未执行、RESULT 键全缺。worktree 仓根在 /tmp 不含 HOME 故绿。**产品行为符合设计，未改产品**。

## 修法（只改测试）
frameB 按 repoRootContainsHome 分叉：主仓布局断言拒绝诊断（bwrap: + refusing to run）且无 RESULT；worktree 布局保留原 errno30/errno2/errno20。附带修正 errno 注释笔误（ENOTDIR=20 非 17）。

## 复测（三布局全绿）
主仓检出（修复版临时拷入跑完还原，cmp 一致）⑧ 1 passed；feat worktree ⑧ passed + 全量 24 files/188 passed（31.7s）；detach worktree@f7dc17b ⑧ passed。

## 新问题（不扩范围）
任何「cwd=仓根」主仓布局 e2e 都命中同一拒绝：后续（P5-06 等）写仓根 cwd 用例需同样分叉，或 TEST_HOME 移出仓根（动决策 8，交 director）。
