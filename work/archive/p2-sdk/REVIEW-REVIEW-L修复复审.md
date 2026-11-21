verdict: FAIL
base: d373b6b8f750ea95dc9126f7e9b728647dbeb991  head: f9dfc45c64a574f2584781e747bf1654618c4729

（注：head 变了本报告作废）

任务 REVIEW-L修复复审 · 档位 L · 范围 d373b6b..f9dfc45 · incrementalFrom: null

## 阻塞问题

### R1 · /home/lingxufeng/bot/app/sdk/src/start.ts:545

**severity**: major ｜ **verdict**: CONFIRMED ｜ **finder**: sol:后端逻辑

**summary**：正常退出后永久保留的双 PID 锁没有记录进程身份，PID 被复用时会把已停止的实例误判为仍在运行。

**触发条件**：实例正常退出后，新的 main() 路径不再删除 launcher.lock（/home/lingxufeng/bot/app/sdk/src/start.ts:539–545）。随后发生 PID 回绕或机器重启，锁中任一个 PID 被无关进程占用，再用同一个 P2SDK_HOME 启动；新增的 lockHeld() 对 runtime PID 也只执行 kill(pid, 0)，没有核对启动时间或 boot ID（同文件:246–260）。

**失败表现**：即使旧 launcher 和 dsh 都已结束，acquireHomeLockDetailed() 仍会在 /home/lingxufeng/bot/app/sdk/src/start.ts:373 返回 already in use，导致该 home 无法自动恢复，必须等待无关进程退出或人工删除锁。轻量探针将双行锁的 runtime PID 设置为当前无关探针进程的 PID，已观察到拒绝启动；此前正常退出会通过 exit handler 删除锁，因此这次永久保留锁把该问题引入了正常停止后的重启路径。

**verifier 证据**：

```text
CONFIRMED via code reading + sandbox probe. Premises: (1) Lock persists after normal exit — /home/lingxufeng/bot/app/sdk/src/start.ts:519-567 (main): hold.release() only on the lost-race branch (line 536); success path `return await handle.exited` (line 566) leaves the lock on disk, and the comment at lines 540-544 states the lock is deliberately not deleted on exit; line 545 (the flagged line) records the dsh pid, making a permanently retained two-pid lock. (2) Identity-blind liveness — start.ts:246-261: pidHeld is only process.kill(pid,0) with EPERM counted as held; lockHeld applies it to both recorded pids; no process starttime, boot-id, or cmdline check exists anywhere in the file. (3) Immediate refusal — start.ts:373 `if (lockHeld(view)) return refuse(view)` returns before any reclaim attempt; the recovery hint (remove the lock) appears only in the uninitialized-lock message (line 371), not in the refuse message (lines 299-300). (4) No guard against pid reuse by an unrelated process — empirically reproduced in /dev/shm/mm-review-XXXX (deleted afterwards): calling the real acquireHomeLockDetailed with a stale `launcher.lock` whose runtime-pid line held the probe's own live pid returned `REFUSED: ... already in use by launcher pid 978966 and its runtime pid 978953`; control with both pids dead acquired normally (stale reclaim itself works). (5) Introduced by this diff — base d373b6b main() had `const release = acquireHomeLock(...)` + `process.on('exit', release)` (base start.ts lines ~431-436), so every normal exit unlinked the lock and left nothing to be falsely held; head f9dfc45 (T-13) removed exit-time deletion, added the dsh-pid line and lockHeld. Severity kept major (not critical): failure direction is fail-closed (refuses to start), no security/correctness breach, but the home is bricked with a misleading error until the unrelated pid dies or the operator manually deletes <home>/launcher.lock, and the trigger (pid reuse after reboot/wraparound against a persistent lock file, default home <pkg>/.dsh) is realistic over time since every stop-then-start now passes through stale reclaim.
```

### R2 · app/sdk/src/start.ts:94

**severity**: major ｜ **verdict**: CONFIRMED ｜ **finder**: opus:跨文件深度

**summary**：approval.yml (shell-ask) is now part of the default patch chain, and it returns {kind:'ask'} for every ordinary bash call and for any sandbox_permissions call that is not strictly wider. Under the selectable danger-full-access preset (approval: never), user-approval rejects every ask deterministically, so bash becomes completely unusable.

**触发条件**：A client or user switches a session to the base bundle's danger-full-access preset (sandbox danger-full-access + approval never), e.g. with `/permission danger-full-access`, or runs headless with approval policy never. The model then issues any bash call. With effective mode danger-full-access, STRICTLY_WIDER is empty, so even sandbox_permissions calls get 'ask'.

**失败表现**：Every bash call is denied with `the user rejected tool "bash"`, and nobody is ever prompted. Before this change that only happened when approval.yml was opted in through P2SDK_PATCH; now a stock launch breaks a preset the catalog advertises as selectable. The e2e tests only cover the default workspace-write/ask preset.

**verifier 证据**：

```text
该候选成立，且由本次把审批 overlay 加入默认启动链引入。/home/lingxufeng/bot/app/sdk/src/start.ts:86-95 无条件加载 approval.yml，后者在 /home/lingxufeng/bot/app/sdk/profile/patches/approval.yml:13-16 注册 shell-ask；此前此策略需要额外 opt-in。触发条件确实可达：已安装基础 bundle 的 /home/lingxufeng/bot/app/sdk/node_modules/.pnpm/@deepseek-ai+dsh-base@0.2.2-alpha.2_01465288dceca7eaaa661770e359c71c/node_modules/@deepseek-ai/dsh-base/cordis.patch.yml:264-276 仍配置 danger-full-access → sandbox=danger-full-access、approval=never；权限命令实现 /home/lingxufeng/bot/app/sdk/node_modules/.pnpm/@deepseek-ai+dsh-permission-presets@0.2.2-alpha.2_d3d8b3608dd16beeeebc92e4a48b417c/node_modules/@deepseek-ai/dsh-permission-presets/lib/index.js:212-234 允许选择该预设，且 :355-365 实际更新 sandbox 与审批策略，没有排除它的守卫。切换后，/home/lingxufeng/bot/app/sdk/src/policy/shell-ask.mjs:27-30 的 danger-full-access 更宽集合为空，:35-49 因而对普通 bash 和任何显式 sandbox_permissions 的 bash 均返回 ask。工具管线 /home/lingxufeng/bot/app/sdk/node_modules/.pnpm/@deepseek-ai+dsh-tools@0.2.2-alpha.2_d570a50fd9051dfa7084c71da173b036/node_modules/@deepseek-ai/dsh-tools/lib/pipeline.js:385-390 将 ask 送入 serviceAsk；审批服务 /home/lingxufeng/bot/app/sdk/node_modules/.pnpm/@deepseek-ai+dsh-user-approval@0.2.2-alpha.2_@deepseek-ai+cordis@4.0.6-alpha.1_@deepsee_703d6fd5061fd2c4ff55c9f4f8876083/node_modules/@deepseek-ai/dsh-user-approval/lib/index.js:197-201 在 never 下直接返回 rejected，尚未派发 approval/request，因此客户端无法通过弹窗批准。随后上述 pipeline.js:637-640 将其映射成 deny 和 the user rejected tool "bash"，:402-410 返回错误而不执行工具。故默认启动仍公开可选择的预设会使所有 bash 调用确定性失败，而不是实现该预设的无提示执行语义。判定依据为当前 HEAD f9dfc45 的源码及实际安装依赖调用链，未运行全量测试或修改仓库。
```

### R3 · app/sdk/src/start.ts:258

**severity**: major ｜ **verdict**: CONFIRMED ｜ **finder**: opus:跨文件深度

**summary**：main() no longer deletes launcher.lock on exit, so every clean shutdown now leaves a lock with two recorded pids. lockHeld() treats any live pid as the holder, including the caller's own pid and recycled pids, so a later start can be refused permanently.

**触发条件**：Run the launcher with a persistent home in an environment with deterministic pids, for example a container whose entrypoint is `node scripts/start.mjs` (PID 1 or a fixed low pid on every start) with the default `<pkg>/.dsh` home on a volume. Stop it cleanly and start it again: the recorded launcher pid equals process.pid, so pidHeld(self) is true. The same refusal happens when either recorded pid is later reused by an unrelated long-lived process, for example after a host reboot.

**失败表现**：Start fails with `P2SDK_HOME ... is already in use by launcher pid <own pid>` on every attempt until someone deletes launcher.lock by hand, and that message, unlike the uninitialized-lock one, gives no removal hint. Before this change a clean exit unlinked the lock, so the exposure existed only after a crash.

**verifier 证据**：

```text
该问题在持久化 home 且启动器 PID 重用的条件下成立，并非所有普通重启都会失败。/home/lingxufeng/bot/app/sdk/src/start.ts:305-306 将 process.pid 写入锁，:545 追加运行时 PID；:561-566 的正常结束路径只返回退出码，不调用 release，/home/lingxufeng/bot/app/sdk/scripts/start.mjs:1 随即 process.exit，因此正常退出也会留下锁。本次 diff 明确移除了 base 中 start.ts:436 的 process.on('exit', release)，所以正常退出后新增的暴露面属于此次改动。下一次启动时，/home/lingxufeng/bot/app/sdk/src/start.ts:247-254 仅通过 process.kill(pid, 0) 判断数字 PID 是否存在，未核验进程启动时间、boot ID 或其他归属信息；:258-260 对任意一个存活 PID 都判定占用，:373 直接拒绝，最终由 :526-529 返回启动失败。因此，当容器以启动器作为 PID 1、home 位于持久卷并在容器重建后再次以 PID 1 启动时，旧锁中的 launcher PID 必然等于新启动器自身，检查必然成功，启动会持续被拒绝，直到锁被人工移除。普通主机上旧 PID 被无关长寿命进程复用时也会误拒绝，但仅持续到该 PID 消失，不能笼统称为永久锁死。现有 inode 检查只保护锁文件身份，不能识别 PID 的跨生命周期复用。小实验调用被权限系统拒绝，未运行实验；上述裁决依据完整调用链和本次 diff 的代码证据。
```

## 上轮未修

无（unfixedFromLastRound 为空）。

## 其他发现

### O1 · app/sdk/examples/min-client.mjs:19

**severity**: minor ｜ **verdict**: CONFIRMED ｜ **finder**: glm:安全

**summary**：Partial-credentials guard tests the wrong condition: exporting exactly one of P2SDK_BASE_URL / P2SDK_LAUNCH_TOKEN (without P2SDK_HANDOFF) passes the guard, then join(undefined, 'launch-token') throws a cryptic TypeError.

**触发条件**：Operator runs the client with only P2SDK_BASE_URL set (or only P2SDK_LAUNCH_TOKEN set) and no P2SDK_HANDOFF — the guard `!handoff && !P2SDK_BASE_URL && !P2SDK_LAUNCH_TOKEN` passes because one variable is truthy, leaving `handoff` undefined for the readFileSync fallback on line 23 or 24.

**失败表现**：Instead of the intended guidance message and exit 1, the operator gets 'TypeError [ERR_INVALID_ARG_TYPE]: The "path" argument must be of type string' with no hint of which variable is missing — an unhandled crash in the documented credential-entry path (violates the project's explicit error-handling rule 'user-friendly error messages in UI-facing code'); at base the same input produced a clear ENOENT naming a real path.

**verifier 证据**：

```text
候选成立。/home/lingxufeng/bot/app/sdk/examples/min-client.mjs:18 在本次 diff 中移除了 handoff 的默认目录，而 :19 的守卫仅在 handoff、BASE_URL 和 LAUNCH_TOKEN 三者全部缺失时退出。因此没有 P2SDK_HANDOFF 且仅设置两个直接凭证之一时，守卫不会拦截，:23 或 :24 的回退表达式会执行 join(undefined, ...)。在 /dev/shm/mm-review-XXXX 临时目录中直接运行实际示例，使用模拟环境变量复现了两条路径：仅设置 P2SDK_BASE_URL 时在 :24 抛出 ERR_INVALID_ARG_TYPE，仅设置 P2SDK_LAUNCH_TOKEN 时在 :23 抛出同一异常；三者都未设置时则正常输出 :20 的配置指导。异常发生在 :27 建立连接之前，没有调用方可以补齐或验证这些环境变量。base 版本会使用非空默认目录，不存在本次新增的 undefined 路径参数异常。影响限于示例客户端面对不完整配置时的错误提示，保持 minor；实验临时目录已删除，仓库未修改。
```

### O2 · app/sdk/examples/min-client.mjs:23

**severity**: minor ｜ **verdict**: CONFIRMED ｜ **finder**: glm:正确性+合规

**summary**：The no-credentials guard only covers the all-three-unset case, so partial combinations fall through to join(undefined, ...) and crash with a TypeError instead of the intended friendly error.

**触发条件**：Run with P2SDK_BASE_URL set but P2SDK_LAUNCH_TOKEN and P2SDK_HANDOFF unset (or the mirror case: token set, no base-url/handoff) — the guard at line 19 passes because one variable is set, then line 23/24 calls join(handoff=undefined, 'base-url'/'launch-token').

**失败表现**：The documented env-pair usage degrades to an uncaught TypeError instead of the intended friendly exit; the user gets no hint which of the three variables to set.

**verifier 证据**：

```text
在 /home/lingxufeng/bot/app/sdk/examples/min-client.mjs:18–21，handoff 直接取自环境变量，而友好报错守卫仅在三个变量全部未设置时触发。因此，仅设置 P2SDK_BASE_URL 时会执行 /home/lingxufeng/bot/app/sdk/examples/min-client.mjs:24 的 join(undefined, 'launch-token')；仅设置 P2SDK_LAUNCH_TOKEN 时会在该文件第 23 行执行 join(undefined, 'base-url')。两者均在第 27 行连接服务之前抛出未捕获的 TypeError [ERR_INVALID_ARG_TYPE]，没有其他调用方守卫。本次 diff 删除了 handoff 的默认目录，所以 undefined 路径异常是此次改动引入的。已将 head f9dfc45 的原始前 24 行复制到 /dev/shm 临时目录，仅移除未使用的 RPC 导入，在 Node.js v22.23.4 下复现两种组合，均退出 1，分别定位第 24、23 行；临时目录已删除。问题仅影响示例客户端对不完整配置的错误提示，保持 minor。
```

### O3 · app/sdk/src/start.ts:545

**severity**: minor ｜ **verdict**: CONFIRMED ｜ **finder**: glm:正确性+合规

**summary**：T-13 removed process.on('exit', release), so the dual-pid lock is never unlinked on any exit path. Reclamation now always depends on both recorded pids testing dead; on pid wraparound a recycled pid makes lockHeld() true and the next start is refused, with no cleanup hint.

**触发条件**：Cleanly stop a runtime (lock file stays with both dead pids), then after the system's pid space wraps (long-lived busy box, pid_max ~4M), a new unrelated process reuses the recorded launcher or dsh pid: pidHeld() returns true (EPERM counts as held too if the pid landed on another user's process) and acquireHomeLockDetailed returns the refuse string.

**失败表现**：A healthy home can refuse all future starts with a misleading 'in use by launcher pid X' message until someone manually deletes <home>/launcher.lock — and the message never names the lock file, so the operator has no pointer to the fix; stale lock/captured files also accumulate in every home.

**verifier 证据**：

```text
确认正常退出后遗留锁导致 PID 复用误拒绝启动的问题，本次改动扩大了其触发范围。/home/lingxufeng/bot/app/sdk/src/start.ts:539-545 记录 runtime PID，但成功启动后不再注册原 base 版本 start.ts:436 的 exit release；当前 start.ts:566 等待 runtime 退出后返回，/home/lingxufeng/bot/app/sdk/scripts/start.mjs:1 随即 process.exit，因此正常结束也会留下 launcher.lock。之后只要原 launcher 或 runtime 的任一 PID 被不相关进程复用，/home/lingxufeng/bot/app/sdk/src/start.ts:247-260 就会仅凭 kill(pid, 0) 成功或 EPERM 判为仍持锁，没有进程启动时间或身份校验；start.ts:373 会在进入陈旧锁回收前直接返回拒绝信息，start.ts:526-529 使启动失败。start.ts:299-300 的错误信息确实未指出 launcher.lock 或人工恢复方法。严重性维持 minor，因为需要遗留锁与 PID 复用相遇；候选所称“所有未来启动都被拒绝直到人工删除”应收窄为“复用该 PID 的进程存活期间持续拒绝，待两个记录 PID 均不存在后可自动回收”。每次正常停止通常只留下一个固定名称锁文件，并非每次退出都会累积 captured 文件；captured 文件遗留来自 start.ts:408-423 的既有并发回收分支，不作为本候选确认内容。
```

### O4 · /home/lingxufeng/bot/app/sdk/src/start.ts:62

**severity**: minor ｜ **verdict**: CONFIRMED ｜ **finder**: sol:后端逻辑

**summary**：默认 handoff 临时目录在配置解析时就被创建，却没有任何对应的回收路径。

**触发条件**：不设置 P2SDK_HANDOFF 时，每次 resolveConfig() 都在 /home/lingxufeng/bot/app/sdk/src/start.ts:62 创建新的目录；即使没有配置真实 provider 的 API key，main() 也只会在同文件:520–523 返回错误，不删除刚创建的目录。锁被占用、运行时启动失败以及正常退出的路径同样没有回收它。

**失败表现**：重复启动、自动重试和调用配置解析函数会持续积累 p2sdk-handoff-* 目录；成功启动还会留下不再使用的 launch-token 和 base-url 文件，而旧实现仅复用一个固定目录。实测 resolveConfig({}) 后调用 main(cfg) 返回 1，handoff 目录仍然存在。需要区分自动创建和用户指定的目录，并为自动创建的目录安排适当的生命周期清理。

**verifier 证据**：

```text
Candidate issue verified premise by premise; all premises hold and the behavior was reproduced.

P1 (unguarded creation at resolveConfig time): /home/lingxufeng/bot/app/sdk/src/start.ts:62 — `handoff: env.P2SDK_HANDOFF || mkdtempSync(join(tmpdir(), 'p2sdk-handoff-'))`. No guard, no memoization: every resolveConfig() call without P2SDK_HANDOFF creates a fresh tmpdir. The directory is created before any validation, lock acquisition, or spawn decision.

P2 (validation-failure path leaks): start.ts:519-524 — main() runs validateStart() first; provider 'real' without P2SDK_LLM_API_KEY returns 1 with no cleanup of cfg.handoff (the default param at :519 `main(cfg = resolveConfig())` already created the dir before main body runs).

P3 (no cleanup on any path): read the whole file. The only rmSync is start.ts:487, removing the generated runtimePatch FILE, never the handoff dir. Exit paths: lock refused start.ts:526-529 (return 1), lost-lock start.ts:534-537 (return 1), ready-timeout start.ts:561-564, normal exit start.ts:566 — none touch cfg.handoff. Grep confirms nothing else cleans it: profile/plugins/handoff.mjs only writes launch-token/base-url into the dir; examples/min-client.mjs:18-24 only reads from it. There is no reclamation path anywhere for the auto-created dir.

P4 (introduced by this diff): git diff d373b6b..f9dfc45 on app/sdk/src/start.ts shows `- handoff: env.P2SDK_HANDOFF || join(PKG_ROOT, '.dsh-handoff'),` → `+ handoff: env.P2SDK_HANDOFF || mkdtempSync(join(tmpdir(), 'p2sdk-handoff-')),`. The old default was one fixed reused directory (no accumulation); the per-call mkdtemp default is new in this range.

Empirical repro (in /dev/shm/mm-review-ZW6l, since deleted): resolveConfig({}) created /tmp/p2sdk-handoff-qnNK3z; main(cfg) returned 1 (P2SDK_LLM_API_KEY not set); the dir still existed after return; p2sdk-handoff-* count went 456 → 457. Stronger live evidence: /tmp already held 456 p2sdk-handoff-* dirs, all created today 01:33-01:52 by this branch's own test/dev runs (sampled ones mode 0600, empty) — accumulation is actively happening, not hypothetical. Note tests/support/runtime.ts:60 also mkdtemps its own p2sdk-handoff-* dirs without cleanup, so the pile mixes launcher-default and harness dirs; the code-level facts for start.ts stand regardless.

Verdict: CONFIRMED, severity minor is correct. It is resource hygiene (unbounded /tmp accumulation between OS tmp cleanups/reboots) plus a mild credential-hygiene smell: dirs are 0600 and the launch token is useless after the runtime dies, but token/base-url files do linger after successful boots. Design nuance for the eventual fix: cleanup on launcher exit is not trivially correct — dsh is detached (start.ts:453) and the operator client may consume the dir after the launcher exits — but the early-exit paths (validation failure :521-523, lock refused :527-529, lost lock :534-537) never spawn a runtime so they have no such consumer, and there is no reclamation at all for the general case.
```

### O5 · /home/lingxufeng/bot/app/sdk/tests/unit/launcher-lock.test.ts:61

**severity**: minor ｜ **verdict**: PLAUSIBLE ｜ **finder**: sol:并发与数据完整性

**summary**：新增的测试清理会对已经退出并可能被复用的历史 PID 再次发送 SIGKILL。

**触发条件**：/home/lingxufeng/bot/app/sdk/tests/unit/launcher-lock.test.ts:54-56 将启动器和运行时 PID 加入集合，但 114-124、149-150 行已经终止并等待这些进程消失后，没有从集合删除它们。若这些 PID 在 afterEach 执行到 59-61 行之前被系统复用，清理就会命中新进程；三方竞争用例也会在子进程已经自行退出后于文件后段重新登记它们的历史 PID。

**失败表现**：/home/lingxufeng/bot/app/sdk/tests/unit/launcher-lock.test.ts:61 不检查进程身份，直接向所有登记的数值 PID 发送 SIGKILL，因而可能杀死同用户的其他测试、训练任务或桌面进程，而不只是本测试仍存活的子进程。等待旧 PID 消失并不能保证后续再次使用该 PID 时仍指向原进程。

**verifier 证据**：

```text
All code-level premises verified in /home/lingxufeng/bot/app/sdk/tests/unit/launcher-lock.test.ts (whole block newly added in d373b6b..f9dfc45, confirmed via git diff of the range): :54-57 spawnedPids set + track(); :84 launcher pid tracked, :98 dsh pid tracked in bootForLockTest; :114-124 test ① SIGKILLs launcher and dsh and waits both dead (waitClose/waitPidDead) leaving them in the set; :138-150 test ② launcher dies of EPIPE, dsh killed and waited dead, same; :402-417 + comment at :415-417 test ③'s B/C holders exit on their own after writing gate files; :526-528 test registers their historical pids from marker files without waiting for exit; :58-67 afterEach sends SIGKILL to every tracked numeric pid with no identity check — try/catch only swallows ESRCH; :66 is the ONLY mutation of the set (clear() inside afterEach), so no removal-on-death exists anywhere. Nothing in code blocks the stale-kill. However the stated failure requires the OS to reuse a just-freed pid before afterEach runs, and the windows are milliseconds (test ①: pid dies at :124, only in-process acquireHomeLock/assertions remain before afterEach; test ②: dies at :150 → :151-153; test ③: tens of ms of 25ms waitFile polls). Host is x86_64 with /proc/sys/kernel/pid_max = 4194304 and Linux allocates pids sequentially, so reuse of a specific freed pid needs ~4.19M forks inside that sub-second window — not demonstrable and effectively impossible on this machine, including under the repo's process rules (the process_guard hook governs agent shell kills, not in-test process.kill, so it neither blocks nor mitigates this path). Verdict: mechanics real and diff-introduced, but the pid-reuse premise cannot be confirmed as occurring → PLAUSIBLE, severity downgraded major→minor (near-zero likelihood on this host; high blast radius if it ever hit, per the project's own 2026-11-01 incident history). Trivial hardening if desired: delete pids from spawnedPids inside waitPidDead, or gate the afterEach kill on a pidAlive/identity check.
```

## 超出预算未验证

无（unverifiedOverBudget 为空）。

## 已被否定

- ``work/p2-sdk/evidence/T-12-verify/c -c)`,|``:1 — An accidentally created file with a garbage name — 'c -c)`,|', 75 bytes containing a mangled shell-probe fragment — was committed to the repo as part of this range.（finder: glm:正确性+合规）
- app/sdk/src/start.ts:62 — The R1 fix moves the launch token into /tmp/p2sdk-handoff-XXXXXX and counts on the random suffix to keep it hidden. But /tmp is a shared, listable directory, and the upstream dsh-fs-sandbox only fences mutations, so the model's tool-fs / tool-fs-search read and list tools can find and read the token with no approval (shell-ask only gates `bash`).（finder: opus:跨文件深度）

## 统计

- finders: 6
- candidates: 16
- verified: 10
- refuted: 2
- dupes: 6
- overBudget: 0
