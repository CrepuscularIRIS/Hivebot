verdict: PASS
commit: d5f290f358dc38be851ef3b8c6215f2fd5dbfbb2（分支 feat/T-20，worktree /tmp/bot-wt/T-20，验收时 HEAD 与申报一致，树干净）

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| 1. 复跑全量 136/136，③⑤⑥ 转绿 | PASS | `pnpm -C app/sdk exec vitest run --no-file-parallelism` → `Test Files 19 passed (19)` / `Tests 136 passed (136)`，Duration 125.39s。evidence/T-20/full-run-tail.txt。⑤为真实运行而非 skip（红复现里 ⑤ 跑 13.5s 且可红，证明 REAL_KEY 在场、真实路径被测） |
| 2. 红复现：还原 scan.mjs → 红（EISDIR 签名） | PASS | `git checkout d5f290f~1 -- app/sdk/tests/e2e/security/scan.mjs` 后单跑 security.test.ts → 4 红（既有 ③⑤⑥ + 新增 ④c），全部签名 `unreadable (EISDIR)`，exit 2（`FAIL 0 hits, 1 unrecognized files`）；同文件 ④④b 仍绿。随后 checkout d5f290f 恢复，`git status --short` = 0 行。evidence/T-20/red-repro.txt |
| 3a. EISDIR 跳过与 ENOENT 对称 | PASS | 手工同场景混合传入（目录项 + 不存在路径）：`SCANNED files=2 pids=0` / `CLEAN` / exit=0，两分支行为一致（不进 unrecognized、不 HIT、不 FAIL）。evidence/T-20/semantics-eisdir-enoent.txt |
| 3b. 目录不计入 unrecognized | PASS | scan.mjs L111 `if (e.code === 'EISDIR') return` 在 unrecognized.push 之前直接返回（L110-113），红复现反向证明无此行则进 unrecognized。注：`SCANNED files=` 为扫描集合计数，目录项仍计入——与 ENOENT 的已删 tracked 文件完全同口径（报告行未改，③/④c 断言均不依赖该计数），见下方 NOTE |
| 3c. ④c 断言核对 | PASS | security.test.ts L365-376：mkdtemp 建真实空目录入 `--file` 扫描集，断言 `status===0`、stdout 含 `CLEAN`、不含 `UNRECOGNIZED`——固化「目录被跳过且不判不可识别」，红复现中该测试在旧代码上确实变红 |
| 3d. gzip FAIL 与 guard 未动 | PASS | diff 仅 scan.mjs L111 一行 `+`；guard（L23-36）与 zstd/gzip 分类路径（L116-141）零改动；红复现（旧 scan.mjs）下 ④（含 gzip `status 2` + `UNRECOGNIZED` 断言）与 ④b（裸 node `GUARD status 3`）保持绿 = 不受影响的双向证据；全量绿再证一次 |
| 4. 区域：恰 2 文件 +15 行 | PASS | `git diff d5f290f~1 d5f290f --stat`：`security.test.ts +14`、`security/scan.mjs +1`，`2 files changed, 15 insertions(+)`；d5f290f~1..d5f290f 单 commit，无 deletions，验收后工作树干净 |

坏路径验证：红复现本身（submodule gitlink 目录进 --tracked 集）+ 手工混合集（目录 + ENOENT）；修复方向为白名单式跳过（仅 EISDIR 精确匹配，其余错误码仍判 unrecognized），未引入静默吞错面的扩大。

过程说明：验收全程未漂移 HEAD、未动 builder 现场（临时 checkout 的 scan.mjs 已按原 SHA 恢复并确认干净）；测试内进程清理均为测试框架自管子进程。

新问题（每条一行，可直接成为修复任务）：
- [NOTE] `SCANNED files=N` 集合计数仍含被跳过的目录项（与 ENOENT 同口径），报告行语义略偏「集合大小」而非「实际读取数」| 复现：`pnpm -C app/sdk exec node tests/e2e/security/scan.mjs --file <目录>` → `SCANNED files=1` 但未读任何文件 | 疑似位置：app/sdk/tests/e2e/security/scan.mjs L162 | 严重度：低（如需精确计数，ENOENT 应同改，属报告口径微调，非本回归范围）
