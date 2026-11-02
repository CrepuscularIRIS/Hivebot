verdict: PASS
commit: 549938eb7dc817eeed1f4918074218c7e9c1ace6（分支 feat/T-01.f2.f1，worktree /tmp/bot-wt/T-01.f2.f1；红测试 commit 7c1a5e1）

验收对象：REVIEW-T-01.f2.md R1（launcher 锁 TOCTOU，唯一 CONFIRMED major）的修复。方案 = O_EXCL 临时 + link(2) 原子发布、rename 捕获 + (inode AND pid AND 死亡) 三重验身、release 只删自己发布的 inode。

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| 0. 干净复跑全量（应 44/44，--no-file-parallelism） | PASS | `pnpm -C app/sdk exec vitest run --no-file-parallelism`：`Test Files 6 passed (6)` `Tests 44 passed (44)` EXIT=0 23.46s → evidence/t01f2f1-full-regression.txt |
| ① 空锁拒绝（空窗口交错） | PASS | verbose 亲跑：`refuses on an empty lock file…` / `refuses on a malformed (non-pid) lock file…` 均 ✓，且断言锁文件字节不变（:38/:46）→ evidence/t01f2f1-race-verbose.txt；红基线上此二测红（旧实现把空/坏锁当陈锁回收成功，`expected [Function] to be type of 'string'`）→ evidence/t01f2f1-red-commit.txt |
| ② 陈锁回收交错不删活锁 | PASS | `a stale-reclaimer resuming after another racer reclaimed must refuse, not delete the live lock` ✓（断言 B 的锁 inode 不变 :76 + 内容 pid 不变 :77 + 无 leftover :78）；同文件 verbose 输出。inode 复用防御见下「断言修正/设计依据」与 D1 探针 |
| ③ release 属主 | PASS | `a stolen holder releases without deleting the next holder's lock (same-pid steal proves inode check)` ✓：同进程两次 acquire → pid 相同仅 inode 不同，inode 检查是唯一判别（:91-96）；红基线上此测红（旧 release 无条件 unlink，`expected false to be true`） |
| ④ f2 原场景保持 | PASS | `T-01.f2 acceptance ① behavior preserved` 3 测试全 ✓（活锁拒绝+不动、死 pid 陈锁接管、释放后可重启）；e2e concurrency.test.ts / mock-demo.test.ts 在全量 44/44 内 |
| ⑤ 双子进程竞速 barrier 5×2 轮 | PASS | 亲跑 3 次（全量 1 次 + 单文件 2 次）：`real multiprocess race > two child processes racing on one home…5 rounds` ✓ 3416ms；持锁区间两两不相交断言（journal ACQUIRE/RELEASE 时间戳 :209-225）；奇数轮双竞速陈锁回收路径含在内 → evidence/t01f2f1-race-verbose.txt |
| 红路径复核（7c1a5e1 旧实现 3 红 7 绿，红的是 TOCTOU 场景） | PASS | detached worktree 于 7c1a5e1 亲跑：`Tests 3 failed | 7 passed (10)`，失败 = ①×2 + ③×1，逐条核对均为 R1 交错断言非无关断言；`git diff f8cb006 7c1a5e1 -- app/sdk/src/start.ts` = 0 行（红基线实现 = REVIEW 声称的 f8cb006 旧实现）→ evidence/t01f2f1-red-commit.txt |
| 区域检查（diff 仅 start.ts 锁段 + launcher-lock.test.ts；childEnv/main 未动） | PASS | `git diff 5ca48f2..549938e --stat`：仅 2 文件；start.ts 2 个 hunk（imports + :156-326 锁段，`@@ -155,73 +156,171 @@` 止于 `function dshEntry`），childEnv/dshSpawnOptions/main 无 hunk |
| 断言修正复核（「轮末锁必须不存在」→「人人退出后 home 必可重新获取」） | PASS（修正正当） | 探针2（真实子进程持有者）：捕获间隙释放+退出 → aside 放回 → 残留死 pid 陈锁 → `acquireHomeLock` 自愈成功、新 pid 入锁、释放后无残留 → evidence/t01f2f1-probe2.txt 全 PASS。即赢家在 robber 的 µs capture→restore 间隙释放会合法残留死 pid 陈锁，「轮末锁必须不存在」是伪不变量，修正后的断言（:229-231 人人退出后可重新获取）才是互斥的实质不变量 |
| 额外坏路径（verifier 自选） | PASS | 探针1（evidence/t01f2f1-probe.mjs/.txt）：A1 持有者间隙释放不删 aside ✓、B1 活锁被捕获期间路径空可获取并正常释放（与文档化 µs 间隙取舍一致）✓、C1/C2 leftover 大杂烩不阻碍获取且不被误清 ✓、D1 同目录 200 轮建删 inode 复用 199 次 ✓（inode-only 身份在本机完全不安全 → 实现的 pid 三重验身必要且方向正确）。注：探针1 的 A3/A4 FAIL 是探针自身设计错误（探针进程 pid 活着，拒绝才是正确行为），由探针2 用真实已退出子进程重测替代，非实现问题 |

新问题（每条一行，可直接成为修复任务）：
- [FIX] restore 分支（rename 捕获到活锁→身份不符→link 还原）无确定性回归测试，仅靠多进程竞速概率命中 | 复现：launcher-lock.test.ts 无任何用例驱动 capture 到 mismatch 的路径（公共 API 无法在 readLock 与 rename 间注入暂停）| 疑似位置：app/sdk/tests/unit/launcher-lock.test.ts（可注入 fake fs 或导出内部钩子）| 严重度 low
- [FIX] 陈锁竞速 3 次尝试全耗尽时报 `lock is contended; retry`，与「锁文件不可读（权限/异常类型）」场景共用同一文案，略误导 | 复现：锁文件 chmod 000 后 acquireHomeLock 返回 contended | 疑似位置：app/sdk/src/start.ts readLock 返回 null 与 rename 失败共用 continue | 严重度 low

过程记录：验收在 15:53–15:58（本机 date 实测）；红 worktree 用后已移除（`git worktree list` 确认）；测试均 --no-file-parallelism 串行（GPU 训练约束）；未用 pkill -f；探针脚本存 evidence/t01f2f1-probe*.mjs 可复跑（`node --experimental-strip-types`）。
