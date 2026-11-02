# Code Review 报告 · T-01.f2

verdict: FAIL
base: 513dcf169849bcbf116873bc56cf996f337406ec  head: f8cb0062d272b2fa98305d6d78b88aa0f3bdbf83

> 分支 head 一变（不再指向上述 headSha），本报告作废。

## 阻塞问题

### R1 · 陈锁回收会删除正在被其他启动器持有的新锁，因此不能保证同一 home 的启动器排他。

- **file:line**: /home/lingxufeng/bot/app/sdk/src/start.ts:197
- **severity**: major
- **verdict**: CONFIRMED
- **finder**: sol:后端逻辑

**触发条件**

两个启动器并发使用同一 P2SDK_HOME 时，A 在 start.ts:190 创建锁文件后、在 start.ts:209 写入 PID 前被调度暂停；B 在 start.ts:193 读取空文件，被 lockHolder 判为陈锁，随后在 start.ts:197 删除它并成功取得自己的锁。即使锁已完整初始化，两个竞争者先后读取同一陈锁，再交错执行删除和重建，也会发生同样的问题，因为删除前没有验证路径仍对应此前检查的锁。

**失败表现**

A 恢复后仍会向已被删除的文件描述符写入 PID 并返回成功，B 也已成功取得锁，随后两者都会通过 start.ts:312 启动 dsh，并覆盖共享的 runtime-patch.yml 和 handoff 文件。已用实际 acquireHomeLock 函数复现创建与写入之间的交错：竞争者和原调用均返回成功；竞争者释放后，原调用仍持锁但 launcher.lock 已不存在，第三次获取也成功。start.ts:215 的无条件删除还可能进一步删除其他持有者的锁。

**verifier 证据**

CONFIRMED against the real acquireHomeLock, with all three interleavings reproduced (experiment run in /dev/shm/mm-review-eI0Z importing /home/lingxufeng/bot/app/sdk/src/start.ts via node --experimental-strip-types; temp dir deleted afterwards). Introduced by this diff: start.ts:156-225 (lockHolder/acquireHomeLock/release) are all + lines in 513dcf1..f8cb006.

Premise audit (file:line from /home/lingxufeng/bot/app/sdk/src/start.ts):
1. Concurrent callers on one home reachable: sole caller main() start.ts:305-306; home from resolveConfig start.ts:46 (P2SDK_HOME env or default). No cross-process serialization exists — mutual exclusion is this lock's only job (docstring start.ts:176-182). No guard.
2. Window between openExcl start.ts:190 and writeFileSync(fd) start.ts:209 is straight-line sync code with no re-check; OS preemption between the two syscalls is possible on another core. No guard.
3. Empty (created-but-unwritten) lock judged stale: lockHolder start.ts:162 Number(''.trim())=0 fails pid<=0 at start.ts:166 → returns null. No guard.
4. Stale reclaim is check-then-unlink TOCTOU: unlinkSync at start.ts:197 is unconditional — nothing re-validates between the pid check at start.ts:193 and the unlink; the EEXIST retry at start.ts:201-207 and the comment at start.ts:195-196 only cover a racer winning between :197 and :202, not a racer that created before the reader's check, nor a reader unlinking a fresh post-reclaim lock. No guard.
5. writeFileSync(fd, pid) start.ts:209 succeeds on an fd whose inode was unlinked (Linux keeps the inode while the fd is open) — A returns a thunk believing it holds the lock. Confirmed by reproduction.
6. Both holders proceed: both receive a thunk (not a string), pass the refusal check at start.ts:307, register release at start.ts:311, and both call startRuntime at start.ts:312 → both overwrite the shared runtime-patch.yml (start.ts:103/127) and replay-override.json (start.ts:258) and spawn dsh on one home — exactly the clobbering R4/T-01.f2 acceptance ① built this lock to prevent.
7. Bonus confirmed (start.ts:215 claim): release() start.ts:211-218 unlinks lockPath unconditionally with no ownership/inode check, so a holder whose lock was stolen deletes the next holder's live lock on exit.

Reproduction outputs:
- Empty-window (candidate's exact trigger): "B: acquireHomeLock RETURNED SUCCESS (thunk) while A is live mid-create" (real function, after A's openSync 'wx' at the :190-equivalent and before its :209-equivalent write); then "A: wrote pid to fd -> acquireHomeLock would RETURN SUCCESS (thunk)" — two simultaneous holders.
- Initialized stale lock (dead pid 2147483647, kill→ESRCH): A read stale (:193-equivalent) and paused; real B reclaimed and became live holder (its live pid 1565594 in the file); A's resumed :197-equivalent unlink SUCCEEDED deleting B's live lock, and A re-created — "Both A and real B returned success".
- :215 chain: after a live holder's lock file was removed (the steal proven reachable above), the holder's :215-equivalent exit-unlink deleted the next holder's live lock, and a third real acquireHomeLock call SUCCEEDED while the second holder still ran.

Severity major is correct (kept from candidate): the diff's core guarantee — one launcher per home — is bypassable under concurrent start, leading to duplicate dsh children and clobbered runtime-patch.yml/handoff/replay files in the shared home; impact is confined to the runtime home and requires a concurrent-start race (plausible in scripts/CI, not the everyday path), so not critical.

## 上轮未修

无（unfixedFromLastRound 为空）。

## 其他发现

### O1 · forward() 的跳过条件判不出「被信号杀死」的 dsh

- **file:line**: /home/lingxufeng/bot/app/sdk/src/start.ts:318
- **severity**: minor
- **verdict**: CONFIRMED
- **finder**: glm:正确性+合规

**summary**

forward() 的跳过条件 handle.child.exitCode !== null 判不出「被信号杀死」的 dsh：Node 中子进程死于信号时 exitCode 恒为 null、signalCode 才有值（本机 node 实测：after exit: exitCode=null signalCode=SIGTERM），而本启动器的正常关闭路径恰恰是转发信号致死。

**触发条件**

用户 Ctrl-C：dsh 收到转发的 SIGINT 死于信号（exitCode 保持 null），在启动器 await handle.exited 返回、进程退出之前（清场、dispose 等待期间）再按一次 Ctrl-C 或发 SIGTERM，守卫不生效。ready 超时路径同理：dsh 若已被信号杀死，forward('SIGTERM') 对死进程调用。

**失败表现**

守卫在其最常见的目标场景（信号致死后重复信号）从不触发：多打一条误导性的 `p2sdk: forwarding SIGINT to dsh`，并对已死子进程调 kill()（实测返回 false，无实际信号发出，不会误杀 pid 复用进程）。功能上仅日志噪音，但该守卫等于死代码。正确写法：exitCode !== null || signalCode !== null。

**verifier 证据**

新增守卫 /home/lingxufeng/bot/app/sdk/src/start.ts:318 只检查 exitCode，无法识别 signalCode 非空的信号退出。存在无需重复按键即可到达的路径：子进程在 ready 前死于信号，/home/lingxufeng/bot/app/sdk/src/start.ts:290-294 将 exited 及 ready(false) 兑现，随后 main 在第 324-326 行对已经退出的子进程调用 forward('SIGTERM')。在 /dev/shm/mm-review-XXXX 临时目录中运行实际 main，仅将 spawn 替换为启动自发 SIGTERM 的 Node 子进程，实测打印了 forwarding SIGTERM to dsh，而 exitCode=null、signalCode=SIGTERM、killResult=false，main 返回 1；临时目录已删除。因此确认本次新增守卫遗漏信号退出状态，并引入误导性转发日志，但不构成实际重复发信号或误杀。候选所述正常退出后的长时间清场窗口不成立：/home/lingxufeng/bot/app/sdk/src/start.ts:329 直接返回 exited，/home/lingxufeng/bot/app/sdk/scripts/start.mjs:1 随即 process.exit，没有额外异步清理等待。基线已存在 ready 前退出后调用 kill 的行为，本次新增问题限于守卫遗漏及错误日志，维持 minor；守卫应同时检查 signalCode !== null。

### O2 · lockHolder 用 kill(pid,0) 探活但不校验该 pid 是否仍是 launcher

- **file:line**: /home/lingxufeng/bot/app/sdk/src/start.ts:168
- **severity**: minor
- **verdict**: CONFIRMED
- **finder**: glm:正确性+合规

**summary**

lockHolder 用 kill(pid,0) 探活但不校验该 pid 是否仍是 launcher：SIGKILL/OOM 杀死的启动器来不及走 'exit' 释放，陈锁残留；pid 被任意无关进程复用后锁被永久判为「持有」。

**触发条件**

kill -9 启动器（或 OOM-killer，GPU 训练机上现实存在）→ launcher.lock 留下 pid P；OS 回收并复用 P 给任意长命进程；下一次对同一 P2SDK_HOME 启动 → lockHolder 探活成功 → 拒绝启动。

**失败表现**

该 home 在手动删除 launcher.lock 前永久不可用，且报错信息误导（「already in use by launcher pid P」——P 并非 launcher），用户可能去杀一个无辜进程。pidfile 类锁的已知代价，可用锁文件记 pid+启动时间戳或 liveness 心跳收敛，报 minor 供取舍。

**verifier 证据**

此次新增的 /home/lingxufeng/bot/app/sdk/src/start.ts:209 仅将 process.pid 写入锁文件，且 main 在 :311 仅通过 process 的 exit 事件释放锁，因此 SIGKILL 等不会执行 exit 回调的终止方式会留下锁文件。PID 后续被无关进程复用时，:162–173 的 lockHolder 只检查 PID 是否存在，不验证进程身份或启动时间；:193–194 据此直接拒绝启动，不进入 :195–207 的陈锁回收路径。小实验在临时 /dev/shm/mm-review-XXXX 目录中写入一个无关存活 Node 验证进程的 PID，再调用实际导出的 acquireHomeLock，确实返回"already in use by launcher pid"并保留锁文件，实验目录已删除；该实验模拟复用后的磁盘状态，未实际强制操作系统复用 PID。故候选中的误拒绝和误导报错成立，但"永久不可用"应收窄为无关进程存活期间持续拒绝：该进程退出后，后续启动可以回收锁。触发需要异常终止与 PID 复用的组合，维持 minor。

### O3 · 新增 107 行并发关键逻辑缺少提交内回归测试

- **file:line**: /home/lingxufeng/bot/app/sdk/src/start.ts:183
- **severity**: minor
- **verdict**: CONFIRMED
- **finder**: glm:正确性+合规

**summary**

本次 diff 新增 107 行并发关键逻辑（acquireHomeLock/dshSpawnOptions），仓库内零测试覆盖，验收测试只存在于 /tmp（commit message 自述「kept out of tests/ per task boundary」），违背 CLAUDE.md 方法论「先写测试（TDD）」与 PROTOCOL「证据绑定 commit SHA，分支 head 一变，旧证据就作废」的落地要求。

**触发条件**

grep -rn 'acquireHomeLock|dshSpawnOptions' /home/lingxufeng/bot/app/sdk/tests/ 无任何命中（本机已验证）；/tmp/T-01.f2-tests 随重启即失，无法从 commit 复跑。VERIFY-T-01.f2.md 行 32 已自记此债「随 T-02 补」，但 T-02（76150fc）在该 diff 之前已合并且未补，债务实际悬空。

**失败表现**

未来任何人重构锁/信号逻辑（例如修上面第 1、2 条时）vitest 全量 24 个测试不会红，互斥破坏可无声合入；验收 PASS 的证据不可从提交树复现。最小修法：把 test-r4/test-r5 的核心断言迁入 tests/unit/start.test.ts（对 acquireHomeLock 陈锁/活锁/竞争路径做直接单测）。

**verifier 证据**

确认本次新增互斥与信号语义缺少提交内的针对性回归断言，但应修正候选的"零测试覆盖"为"缺少行为断言"。/home/lingxufeng/bot/app/sdk/src/start.ts:183-224 新增取锁、活 PID 拒绝、陈锁接管和释放逻辑，:238-243 新增 detached 派生选项，:317-323 新增重复信号转发；目标提交只修改该源码文件，未增加测试。/home/lingxufeng/bot/app/sdk/tests/unit/start.test.ts:5-17 未导入两个新增函数，:162-181 的 main 测试仅触发校验失败，不能到达取锁路径。现有集成测试确实间接执行部分新增逻辑：/home/lingxufeng/bot/app/sdk/tests/e2e/mock-demo.test.ts:61-78 调用 startRuntime 和 main，因此不能称为零覆盖；然而 /home/lingxufeng/bot/app/sdk/tests/support/runtime.ts:33-42 每次启动均创建独立 home，整个目标提交的 tests 树没有同 home 第二实例、陈锁、launcher.lock、进程组或 SIGINT 次数的断言，无法保护这次修复的关键语义。/home/lingxufeng/bot/work/p2-sdk/VERIFY-T-01.f2.md:11-14 将关键验收绑定到临时脚本，:16、:32 明确承认没有新增函数的 unit 回归覆盖并延期补齐。可确认的是新增行为的持久化防回归检查缺失，不是当前功能必然运行失败，也不能由此证明从未执行过 TDD；保留 minor，不作为功能阻断。

## 超出预算未验证

无。

## 已被否定

无。

## 统计

- finders: 2
- candidates: 5
- verified: 4
- refuted: 0
- dupes: 1
- overBudget: 0
