# VERIFY P5-01.f1（轻量抽验）

verdict: PASS
commit: f7dc17b1ddfa4f73e8f8522eb5f87a781e961966（feat/P5-01f1 @ /tmp/bot-wt/P5-01f1，验收期间 HEAD 未漂移，worktree 干净）

| 验收项 | 结果 | 证据 |
|---|---|---|
| ① worktree 布局 ⑧ 绿 | PASS | `pnpm -C /tmp/bot-wt/P5-01f1/app/sdk exec vitest run tests/e2e/sandbox-hardened.test.ts -t "⑧"` → Tests 1 passed / 8 skipped（4.66s，本机实测 03:54） |
| ② 取证脚本亲跑，拒绝诊断原文一致 | PASS | `node work/p5-parity/evidence/P5-01f1/rootcause-main-layout.mjs` → status:1、stdout 空、stderr=`bwrap: workspace /home/lingxufeng/bot contains HOME /home/lingxufeng/bot/.test-homes/p5-01; refusing to run`（无 RESULT 键，与报告逐字一致） |
| ③ 主仓布局（修复版临时拷入）⑧ 绿 | PASS | 拷入主仓 app/sdk 跑同一命令 → 1 passed / 8 skipped（4.58s）；`git checkout --` 还原后 `cmp` 与原文件 identical，git status 无残留 |
| ④ 区域：仅测试文件，产品零改动 | PASS | `git show --stat f7dc17b` → 仅 app/sdk/tests/e2e/sandbox-hardened.test.ts，19+/7-；无其他文件 |
| ⑤ 分叉逻辑与断言方向 | PASS | 读码：`repoRootContainsHome = [TEST_HOME, PASSWD_HOME].some(h => h === REPO_ROOT \|\| h.startsWith(REPO_ROOT + '/'))`。主仓 TEST_HOME=主仓/.test-homes/p5-01（决策 8 写死路径，:23）在 REPO_ROOT 下 → true → 断言 `bwrap: `+`refusing to run`+not `RESULT`；worktree REPO_ROOT=/tmp 不含两条 HOME → false → 保留 errno30/errno2/errno20。与产品侧 bwrap-wrap.py:117 `is_under(h,b)` 同语义（== 或 startswith root+'/'），`die`（:24）输出 `bwrap: ` 前缀 exit 1，断言与产品输出逐字对齐；`${REPO_ROOT}/` 后缀防 bot/bot2 前缀误判 |

坏路径覆盖：②即坏路径实证（fail-closed 拒绝路径：退出 1、探针不执行、无 RESULT）。
备注（不扩范围，沿用报告）：主仓布局下任何 cwd=仓根的 e2e 都会命中同一拒绝，后续 P5-06 等需同样分叉或移 TEST_HOME（决策 8 归 director）。

新问题：无。
