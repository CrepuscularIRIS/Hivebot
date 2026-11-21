# VERIFY — T-13.f1 锁进程身份验证（增量 L 复审 R1+R3）

verdict: PASS
commit: 04c58d530b20fb25dfbf7aa14c259c126452970f（验收期间 HEAD 无漂移、worktree 干净；GPU 训练中全程 `--no-file-parallelism` 串行）

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| 全量回归 + 覆盖率 | PASS | `pnpm test:coverage --no-file-parallelism`：**105/105（15 files，107s）**；覆盖率 92.25% stmts / 88% branch / 95.83% funcs / 94.55% lines，四项 ≥80，与 commit 声明一致。evidence/T-13.f1-verify/coverage-run-tail.txt |
| ① 锁行 `<pid>:<starttime>` | PASS | src/start.ts：`publish`/`recordChildPid` 均写 `pidRow(pid)`；`/proc` 不可读（死 pid）降级裸 `<pid>`（保守）。测试①断言双行各带**自己的** starttime（子进程不是 launcher 的），含降级行断言。探针 4 种畸形行（`123:abc`/`-3:5`/`0:5`/`123:`）全部按 uninitialized 拒绝、不回收。evidence/probe-badpath.out |
| ② pidHeld 存活+身份双判（R1 复用 / R3 自 PID → 陈锁可回收） | PASS | 红基线重建（独立 detach checkout 父提交 f9dfc45 + 仅覆盖新测试文件）：`5 failed \| 1 passed \| 13 skipped`，其中 ②③ 的失败均为 `expected 'P2SDK_HOME …' to be type of 'function'`——**旧代码把活着的复用 PID 判持有、home 砖死，即 R1/R3 原样复现**；修复后 19/19 绿。真实入口端到端：evidence/probe-badpath.mjs 第 4 节在 vitest 之外调真 `acquireHomeLockDetailed`，runtime 行 = 本探针活 PID + 异物 starttime → 回收成功。evidence/T-13.f1-verify/red-baseline-run.txt |
| ③ 旧格式/不可读回退存活判定 fail-closed | PASS | pidHeld：`starttime===null → true`（旧格式行）；`processStarttime` 返回 null（/proc 不可读，如 hidepid）→ `true`——两个回退方向都是「判持有→拒绝」。EPERM（他人 pid）不再提前返回，继续走身份比对（/proc/<pid>/stat 世界可读），比对不了才回退持有。测试「old-format row … still holds」钉住。probe：旧格式活锁（本探针自身 PID）→ 拒绝且拒信带删除提示 |
| ④ 拒信删除提示 | PASS | refuse 模板追加「（如确认无实例运行，删除 <home>/launcher.lock）」；测试④ + probe 双重验证（提示文本与 lockPath 均断言） |
| ⑤ 既有 13 条锁测试保持 | PASS | verbose 名单 19 条中 13 条既有全绿（T-13 R10①/R2②、interleave 1×3/2/3×2、T-01.f2×3、multiprocess race、R7/R8③）；3 处内容断言从 `<pid>\n` 更新为 `<pid>:<st>\n`，属格式跟进、语义不变。evidence/lock-test-list.txt |
| 红基线复核 | PASS（verifier 重建） | **commit 正文无红跑输出**（本任务单 commit，无 T-13 那样的独立 red commit）；按 LEARNINGS 用 `git worktree add --detach /tmp/bot-wt/T-13.f1-red f9dfc45` + 覆盖新测试独立重建，红与新增语义一一对应（见②）。注：builder 回报「三红」实际 **5 红**（两个①、②、③、④），少报非虚报 |
| 区域检查 | PASS | `git show 04c58d5` 仅 2 文件（src/start.ts、tests/unit/launcher-lock.test.ts）；start.ts 8 个 hunk 逐一核对，全部落在锁段（LockView/toPidRow/processStarttime/readLock/pidHeld/lockHeld/publish/recordChildPid/captured 兜底默认值）与 refuse 模板；childEnv/handoff/main 接线零改动 |
| 取舍复核 | PASS | 两处回退的 doc 注释在位且明说方向（pidHeld：『fall back to alive-only: fail-closed beats reclaiming a possibly-live holder』；pidRow：『bare <pid> when /proc is unreadable』）。旧格式活锁保守拒 + 拒信已给人工删除路径，hidepid 回退同为拒——可接受 |
| 坏路径（额外一条） | PASS | 见①/③/④：畸形新格式行 4 形状、旧格式活锁、vitest 外真实 R1 场景，全部按预期 |

**field-22 解析独立性**：测试 oracle `starttimeOf` 与实现 `processStarttime` 是同一套解析算法（自证风险），故用独立工具交叉验证——`ps -o lstart` 与 `/proc/stat btime + starttime/CLK_TCK` 重建对比，漂移 80ms（时钟粒度内），解析确为 kernel 语义的 field 22。evidence/probe-badpath.out 第 1 行。

## 证据清单（work/p2-sdk/evidence/T-13.f1-verify/）

- coverage-run-tail.txt — 全量 105/105 + 覆盖率四项
- lock-test-run.txt / lock-test-list.txt — 锁测试 19/19 与逐条名单
- red-baseline-run.txt — 父提交 src + 新测试：5 failed | 1 passed | 13 skipped
- probe-badpath.mjs / probe-badpath.out — ps(1) 独立 oracle、旧格式活锁、4 畸形行、真实 R1 回收（8/8 PASS，exit 0）

## 新问题

- [FIX] commit 正文未落盘红跑输出（单 commit，无独立 red commit，与 T-13 先例不一致） | 复现：`git show 04c58d5 -s` 正文只有绿跑与计数 | 疑似位置：builder 收尾流程 | 严重度 low（本次红基线已由 verifier 重建证实，实质无损失）
- [FIX] 测试 oracle `starttimeOf` 复制实现解析算法，字段序号若错会双双错、测试恒绿 | 复现：launcher-lock.test.ts:14-17 与 src/start.ts `processStarttime` 逐字符同构 | 疑似位置：app/sdk/tests/unit/launcher-lock.test.ts | 严重度 low（probe-badpath.out 的 ps(1) 交叉验证已补上独立 oracle；若嫌两条并存，可把该验证收编为常驻测试，否则维持现状即可）

## 结论

五条验收项全 PASS：语义（锁行身份格式、双判、fail-closed 回退、拒信提示、既有测试保持）有代码 + 19 条测试 + 独立红基线 + 真实入口探针四层证据；区域与取舍符合申报。两条 low 为流程/测试卫生问题，不阻塞合并。
