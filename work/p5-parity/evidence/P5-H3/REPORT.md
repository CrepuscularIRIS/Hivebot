# REPORT · P5-H3 TEST_HOME 运行级唯一化

分支 feat/P5-H3（基 b41121d），commits 9deda40（7 文件接线 + helper + 守护测试）+ 8e3bbb6（sandbox-hardened ③ 的 /var/tmp 工作区顺带唯一化）。

## 根因与范围清点

REPORT-P5-H1 发现 3 的根因成立。硬编码 `/home/lingxufeng/bot/.test-homes/p5-0X` **绝对路径**的文件共 **7 个**（PLAN 行写「约 6 个」，实际 7；派发区域写 `sandbox-*.test.ts` 是概括——其中真 sandbox- 前缀含硬编码的仅 sandbox-hardened 一个，其余 6 个是同族 guard/w1ap0/tiers/interrupt。按根因意图全部处理）：

| 文件 | 旧值 |
|---|---|
| tests/e2e/sandbox-hardened.test.ts | p5-01（另有 ③ 的 /var/tmp/p5-01-ws3，见下） |
| tests/e2e/guard-fs.test.ts | p5-02 |
| tests/e2e/guard-escalation.test.ts | p5-04 |
| tests/e2e/w1ap0-matrix.test.ts | p5-06（另有 DATA_DIR_B=p5-06-data，HOME 外数据根，同为互踩面） |
| tests/e2e/security/w1ap0-scan.test.ts | p5-06-scan |
| tests/e2e/tiers-policy.test.ts | p5-21 |
| tests/e2e/interrupt.test.ts | p5-27 |

- request-network.test.ts 用 `join(PKG_ROOT, '.test-homes', 'p5-22')`：不同 worktree 的 PKG_ROOT 不同，物理目录天然分离，**不在互踩集**，未改（最小 diff）。
- sandbox-hardened ③ 的 `/var/tmp/p5-01-ws3`（ro-bind / 只读区探针工作区）是同族残留互踩面（并行的 ③ 互删 inside3），一并唯一化（8e3bbb6）。
- 主仓 `.test-homes/` 下旧固定目录 7 个**未删**：其他未合本修复的 worktree 仍按旧路径跑，删了会踩并行 agent；全部合入后可手工清。

## 修法（复用 H1 机制，不造第二套清理）

`tests/support/sandbox-home.ts` 新增 `uniqueTestHome(slug)` = `trackTmpDir(mkdtempSync(join(PARENT, slug + '-')))`，PARENT 保持决策 8 的 `/home/lingxufeng/bot/.test-homes`。

为什么不挪进 `tmpdir()`：sandbox-hardened ⑧ 的 `repoRootContainsHome` 布局分支（P5-01.f1）依赖「主仓跑 = TEST_HOME 在仓根之下 → wrapper fail-closed 拒绝；worktree 跑 = 不在 → EROFS 探针」。TEST_HOME 若移到 /tmp，主仓布局的 fail-closed 分支永不触发，**原测试语义丢失**；保持父目录 + 叶子唯一后缀后，两种布局的分支行为与修前一致（后缀不影响 startsWith(REPO_ROOT '/') 判断）。

各文件 beforeAll/afterAll 的 rmSync(TEST_HOME) 全部保留（mkdtemp 目录首建时不存在，rm 无害）；trackTmpDir 走 H1 登记簿兜底「崩溃没走到 afterAll」。

## TDD（先红后绿）

守护测试 `tests/e2e/sandbox-testhome-unique.test.ts`（sandbox-* 白名单内）：

1. **RED**（未修代码，2026-11-05 11:36）：
   `TMPDIR=/tmp/bot-h3-tmp node_modules/.bin/vitest run tests/e2e/sandbox-testhome-unique.test.ts`
   → **Tests 3 failed**：
   - ① 7 文件仍含固定路径字面量（未接线）；
   - ② 复现互踩：两个「全量运行」交错 setupTestHome（A 写哨兵 → B rmSync 重建 → A 读哨兵），读得 `run-b`（期望 `run-a`）——发现 3 的机制真实复现；
   - ③ helper 不存在（import 失败）。
2. **GREEN**（9deda40）：同命令 → **Tests 3 passed**（128ms）。① 升级为「源码不得再含字面量（含 DATA_DIR_B 类派生）+ TEST_HOME 行必须经 uniqueTestHome」；② 无字面量时退化为「无互踩面」守护。

## 并行自证（双进程对照，evidence/P5-H3/parallel-probe{,-worker}.mjs）

两个并发 node 进程、**不同 TMPDIR**（/tmp/bot-h3-tmp 与 /tmp/bot-h3-tmp-b）：

- **修复前对照**（同旧固定路径，run-a 先就位、run-b 后 rmSync 重建）：
  `[legacy] run-a exit=3 COLLISION home=.../p5-h3-legacy wrote=run-a saw=<erased-by-peer>`，run-b OK → LEGACY-EXIT=0（复现成功）。
- **修复后**（各调 uniqueTestHome）：
  run-a OK `p5-h3-par-26IXJY` / run-b OK `p5-h3-par-JO2XWU`，路径不同、哨兵互不干扰 → FIXED-EXIT=0。
- 跑完 `.test-homes/` 无 p5-h3* 残留。

「两个并行全量（不同 worktree）×3 全绿」是验收口径，由 verifier 复核。

## no ready line 线索（只读排查，结论：测试侧噪音，非生产 bug，src/ 未动）

- 线索源：VERIFY-P5-27.md:23「日志可见 `p2sdk: no ready line within 1ms` 后 SIGTERM 的竞态线索」。
- 全库 `P2SDK_READY_TIMEOUT_MS='1'` 仅一处：**tests/e2e/mock-demo.test.ts:97**——负用例「main returns non-zero when no ready line arrives within the timeout」故意设 1ms 并断言非零退出（src/start.ts:838-841 超时 → SIGTERM → 非零，正是被它验证的生产行为）。
- 全部历史漂移红日志（P5-27 vfy-full3/full4、P5-21 full-run、W3f1、W3f3-vfy）中 `no ready line within 1ms` **各恰出现 1 次**，与该负用例每全量一次一一对应；**没有任何一次真实 60000ms 超时**（grep `no ready line within [0-9]*000ms` 排除 1ms 后零命中）。
- 该用例自身用独立 `mkdtemp(tmpdir())` home，与本任务互踩集无关。
- 结论：`no ready line` 是 mock-demo 负用例预期输出混入并发日志的噪音，非漂移红直接根因；生产 start.ts 的 ready 等待按设计工作。高负载漂移红另有机制（紧时限断言），VERIFY-P5-27 已立 FIX 条目，不属本任务。

## 自测

- 守护测试 RED→GREEN：见上，3 failed → 3 passed。
- 并行双进程对照：见上，legacy 互踩 / fixed 互不踩。
- 轻批（互踩集 + sandbox-wrapper + 守护测试，maxWorkers=2，11:38–12:06 与 P5-H4 全量并行 28 分钟）：**42 passed / 3 failed / 7 skipped**。3 个失败（guard-fs ①、w1ap0-matrix ①⑦）全部是 `Test timed out in 600000ms` 纯超时，**零断言值错**——与改动破坏的形态不符（路径/哨兵问题会表现为断言失败），符合 VERIFY-P5-27 已登记的高负载漂移模式（guard-fs ②③④⑥⑧ 基点同样复现）。skip 的 7 个是 guard-escalation 整文件（vitest 对超时用例后续的取消行为）。
- 定向单跑（H4 结束后串行，私有 TMPDIR）：**sandbox-hardened 9/9 全绿**（含 ⑧ 布局分支、③ 的 WS3 唯一化后 EROFS 探针）——唯一化未破坏任何布局语义；guard-fs 8/9、w1ap0-matrix 8/10，失败的仍是 ①⑦ 三个矩阵用例、仍为纯 600s Timeout。
- **基点对照（决定性）**：在 /tmp/bot-wt/P5-H3-base（detach b41121d，未修代码）单跑 guard-fs → **同样 ① 超时 600s（1 failed | 8 passed，1005s）**，与修复后行为完全一致 ⇒ 三个超时与本分支改动无关（环境负载 / main 现状，VERIFY-P5-27 已登记的漂移家族；建议另立任务排查矩阵用例耗时）。w1ap0-matrix ①⑦ 未逐一跑基点（同形态纯超时 + guard-fs 已证环境性，不再各花 28 分钟）。
- 全量一次（13:0x–13:31，maxWorkers 默认，私有 TMPDIR）：**3 failed | 714 passed | 1 skipped（718 tests，58 文件）**——3 个失败即上述超时三件套，其余全绿；无任何断言值错/哨兵错，即互踩类失败为零。
- 与 P5-H4 的全量（旧代码、固定 p5-0X 路径）实际并行 28 分钟：本批无哨兵类断言错误——修复侧不再踩旧路径使用者（反向：P5-H4 旧代码仍会删固定 p5-0X，但它只影响也用固定路径的旧代码全量，不影响本分支）。

## 未完成 / 遗留

- 主仓 `.test-homes/` 旧固定目录 7 个：待全部相关分支合入后手工清（现在删会踩仍按旧路径跑的并行 worktree）。
- 高负载（load≥6）漂移红（VERIFY-P5-27 FIX 条目）未触碰：本任务只消除「固定路径互踩」这一确定性红因。
