verdict: FAIL
base: 7c2524fac105f162b44e4816ef0a122a04e0cf2c  head: d373b6b8f750ea95dc9126f7e9b728647dbeb991（head 变更则本报告作废）

- 档位：L · 任务：阶段收尾 · 范围：7c2524f..d373b6b

## 阻塞问题（verdict=CONFIRMED 且 severity 为 critical / major）

### R1 · critical · app/sdk/src/start.ts:101

- **severity**: critical
- **finder**: glm:安全
- **summary**: 默认配置下 operator launch token 可被模型经普通 shell 读取：launcher 把 P2SDK_HOME 显式注入 dsh 子进程 env（start.ts:101），而默认 handoff 目录是默认 home 的确定性兄弟目录（start.ts:50 home=<pkg>/.dsh → handoff=<pkg>/.dsh-handoff）；token 文件 0600 但 bash 工具子进程与 dsh 同用户（上游 scrubbedParentEnv 只清 KEY/PASSWORD/SECRET/TOKEN 与 DSH_* 名，保留 P2SDK_HOME），且 workspace-write 沙箱只限写不限读（上游 sandbox/index.ts:24-28「File-effect policy…permits」均指写根）。T-01.f3 的隔离（P2SDK_HANDOFF 不进 env、ready 后删 runtime-patch.yml）只挡住了 printenv 直读，挡不住路径推导或 find。
- **触发条件**: 默认 `pnpm -C app/sdk start`（real 模式，未设 P2SDK_PATCH/P2SDK_HANDOFF）后，模型在会话里发起一次普通 bash 调用：`cat "$(dirname "$P2SDK_HOME")/.dsh-handoff/launch-token"`（P2SDK_HOME 在 printenv 可见且上游 scrub 不清除该名），或 `find / -name launch-token`（读不受沙箱限制、同用户可读 0600 文件）。无需任何用户交互。
- **失败表现**: 模型侧对抗性/被注入的 bash 调用即可取得全权 operator token：用该 token 经 /connect 换 cookie 后可开 interactions=answer 连接、自行应答 approval waterfall（连挂上 approval.yml 也能自批）、跨 session 操作——T-01.f3 凭证隔离与 T-07 审批闸门被整体绕过。违反 CLAUDE.md 硬约束「凭证不进模型，也不进容器」及安全反例「slopus/happy：凭公钥即可领取 token」的教训。
- **verifier 证据**: 默认启动路径下的凭证泄漏成立，且是本次新增 SDK 引入的问题。/home/lingxufeng/bot/app/sdk/src/start.ts:49-50 将默认运行目录与 handoff 目录固定为同一个 PKG_ROOT 下的 .dsh 和 .dsh-handoff，:100-101 又将运行目录作为 P2SDK_HOME 注入 dsh；/home/lingxufeng/bot/app/sdk/profile/plugins/handoff.mjs:20-25 将真实 launch token 写入该 handoff 目录的 launch-token 文件。下游 /home/lingxufeng/bot/repos/deepseek-harness/packages/subprocess/subprocess/src/index.ts:47-69 仅擦除凭证形状及 DSH_ 环境变量，P2SDK_HOME 会保留；/home/lingxufeng/bot/repos/deepseek-harness/packages/subprocess/subprocess-local/src/spawn.ts:467-473 以继承用户身份启动工具进程，没有 uid/gid 隔离。因此模型能通过 P2SDK_HOME 推导默认 token 路径，0600 不会阻止同用户工具读取。实际 Linux 沙箱也没有读取隔离：/home/lingxufeng/bot/repos/deepseek-harness/packages/sandbox/sandbox-local/src/profiles.ts:16-21 将整个根目录只读挂载，:30-35 的 Landlock 后端同样显式授权读取 /。默认调用不需要审批：/home/lingxufeng/bot/app/sdk/src/start.ts:75-82 仅自动加载 p2sdk.yml 与 runtime patch，approval.yml 只能由 extraPatches 额外挂载；/home/lingxufeng/bot/repos/deepseek-harness/packages/shell/tool-bash/src/index.ts:478-497 对未带 sandbox_permissions 的普通调用不请求升权审批，工具流水线在没有拦截器时默认放行（/home/lingxufeng/bot/repos/deepseek-harness/packages/core/tools/src/pipeline.ts:200-201）。因此默认 real 模式的普通 bash 读取即可把 operator token 带入工具结果，而不需要用户批准。该凭证确实可升级为能回答交互的 operator：/home/lingxufeng/bot/repos/deepseek-harness/packages/client/connection/src/browser-auth.ts:320-345 接受 launch token 与 interactions=answer 并签发 operator cookie。需要修正候选的一处范围表述：如果从启动时就挂载 approval.yml，/home/lingxufeng/bot/app/sdk/src/policy/shell-ask.mjs:17-24 会先阻断普通 bash 并要求审批，所以不能声称此时同一次普通 bash 仍可无交互窃取 token；但这不否定默认配置下已成立的严重凭证隔离失效。以上结论基于源码调用链，未读取任何真实凭证，未运行完整端到端复现。

### R2 · major · app/sdk/src/start.ts:436

- **severity**: major
- **finder**: glm:安全
- **summary**: 排他锁经 process.on('exit', release) 在 launcher 任意退出路径（含未捕获异常的正常退出）删除 lock 文件，但 dsh 子进程是 detached: true（:358）：launcher 崩溃退出时 dsh 仍存活并持有 $DSH_HOME 与 handoff 目录，锁已被 release 删除，下一个 launcher 判 home 空闲直接启动。
- **触发条件**: launcher 在 dsh 存活期间异常退出：如 `pnpm -C app/sdk start | head` 类场景下 stdout 管道先关，stdout 转发 process.stdout.write 触发未处理 EPIPE → 未捕获异常 → exit 处理器执行 release() 删锁，而 detached 的 dsh 继续运行；随后再启动一个同 home 的实例即通过 acquireHomeLock。
- **失败表现**: 第二个 launcher 顺利起在同一 home 上，两个 dsh 运行时并发覆盖 runtime-patch.yml、handoff 的 launch-token/base-url 与 $DSH_HOME 存储——恰是 T-01.f2 加锁要防的相互践踏；孤儿 dsh 继续持有端口与凭证文件。
- **verifier 证据**: 该问题由本次新增启动器引入。/home/lingxufeng/bot/app/sdk/src/start.ts:436 将 release 注册到 launcher 的 exit 事件；release 在同文件:269-270 删除自己发布的锁，但不终止或等待子进程。dsh 使用 detached: true（同文件:358），而 main 仅为 SIGINT/SIGTERM 注册转发（同文件:446-447），未覆盖未捕获异常退出。子进程输出直接写入 process.stdout（同文件:399-400），没有 stdout error 处理器，因此下游关闭管道后的一次输出可触发未处理 EPIPE，使 launcher 退出并删锁。已在 /dev/shm 的临时目录导入实际 start.ts，仅将 dsh 替换为保持存活并输出两次的最小子进程，保留实际 spawn options、main、stdout 转发及锁逻辑；关闭 launcher stdout 的读端后，得到 launcherExit=1、unhandledEpipe=true、childAlive=true、lockExists=false、secondAcquire=function。实验目录已删除，子进程已清理。实际 dsh 依赖未安装，因此没有执行完整 dsh 双实例测试；但代码和实验已直接证明孤儿运行时存活时第二次 acquireHomeLock 能成功。第二个 main 随后会执行 startRuntime，重写同一 home 的 runtime-patch.yml 和 mock replay 文件（同文件:374-379），启动另一个共享存储的运行时，破坏排他保护，故上调为 major。

### R3 · major · app/sdk/src/start.ts:78

- **severity**: major
- **finder**: glm:正确性+合规
- **summary**: T-07「普通 shell 必问」审批策略默认不挂载：buildArgs 只装 p2sdk.yml + runtime patch + P2SDK_PATCH extras，profile/patches/approval.yml 在 src/ 与 scripts/ 中零引用，只有测试经 P2SDK_PATCH 挂它，产品默认入口 `pnpm start` 起的 runtime 普通 bash 直通
- **触发条件**: P2SDK_LLM_API_KEY=… pnpm -C app/sdk start（不设 P2SDK_PATCH），模型发起一次普通 bash 工具调用（无 sandbox_permissions）——正是 evidence/D8-approval.md 红用例的 preset-only 组合，命令未经任何 approval/request 直接执行
- **失败表现**: 默认形态复刻了 CLAUDE.md 明令不得照抄的安全反例「openclaw：exec 默认不审批」；叠加 real 模式下 P2SDK_LLM_API_KEY 经 childEnv（start.ts:97-98）留在 dsh 子进程 env（p2sdk.yml apiKeyEnv 需要），无审批的普通 shell 一句 printenv 即可读到 LLM key 并外传，同时违反「凭证不进模型，也不进容器」。shell-ask 插件本身 fail-closed 正确，问题只在它不在默认启动路径上
- **verifier 证据**: 默认启动路径确实漏装普通 shell 审批策略。/home/lingxufeng/bot/app/sdk/package.json:16 的 pnpm start 调用 /home/lingxufeng/bot/app/sdk/scripts/start.mjs:1，再进入 main；/home/lingxufeng/bot/app/sdk/src/start.ts:52 在未设置 P2SDK_PATCH 时得到空 extraPatches，:75-83 仅加载 p2sdk.yml 与 runtime patch，而 :117-145 生成的 runtime patch 仅注册 mock replay（mock 模式）及 handoff，不注册 shell-ask。真正实现普通 bash 必问的监听器位于 /home/lingxufeng/bot/app/sdk/src/policy/shell-ask.mjs:16-25，仅由 /home/lingxufeng/bot/app/sdk/profile/patches/approval.yml:10-13 挂载。因此有效凭证下正常启动并产生一个不含 sandbox_permissions 的 bash 调用，即可绕过该审批。上游 /home/lingxufeng/bot/repos/deepseek-harness/packages/core/tools/src/pipeline.ts:199-205 的 pre-execute 缺省决策是 allow；/home/lingxufeng/bot/repos/deepseek-harness/packages/shell/tool-bash/src/index.ts:482-484 仅在显式升权参数齐备时申请审批，否则沿 :488-527 的执行路径运行命令。仓库已有的行为证据 /home/lingxufeng/bot/app/sdk/evidence/D8-approval.md:24-37 明确记录相同缺失 overlay 组合下 touch 成功、canary 已创建且没有审批事件。当前绿测掩盖了集成遗漏，因为 /home/lingxufeng/bot/app/sdk/tests/e2e/approval.test.ts:80-86 主动通过 P2SDK_PATCH 注入 approval.yml，而不是验证默认启动配置。该遗漏属于本次新增 SDK 的安全默认值缺陷，保留 major。未实际重跑 e2e，当前 app/sdk 未安装依赖；上述结论由入口、配置、执行路径与已有红用例相互印证。候选附带的 printenv 可直接泄漏真实 LLM key 的说法未独立确认：/home/lingxufeng/bot/app/sdk/src/start.ts:93-106 只能证明 key 留在真实模式的 dsh 环境，不能单凭此证明 shell 最终环境，因此不将该外传链作为确认或定级依据。

### R4 · major · app/sdk/vitest.config.ts:11

- **severity**: major
- **finder**: glm:正确性+合规
- **summary**: 覆盖率阈值设为 80 但全套实测仅 72.63% statements / 75.3% lines（evidence/D8-approval.md 自记），`pnpm test:coverage` 是红的；缺口正来自本 diff 新增的 src/p2temp/index.mjs 与 src/start.ts
- **触发条件**: pnpm -C app/sdk test:coverage —— v8 覆盖率低于本文件自己声明的 thresholds:{lines:80,…}，vitest 直接判 FAIL
- **失败表现**: 违反项目规则「Minimum Test Coverage: 80%」（~/.claude/rules/common/testing.md）与「先有证据再宣布完成」；且 evidence/D2.md 复测命令注释称 `pnpm test` 含「覆盖率阈值」与 package.json 不符（test = vitest run，无 coverage），阶段收尾的整分支闸门实际过不去
- **verifier 证据**: 覆盖率命令确实可达：/home/lingxufeng/bot/app/sdk/package.json:18 将 test:coverage 定义为 vitest run --coverage，/home/lingxufeng/bot/app/sdk/vitest.config.ts:8-11 对 src/** 启用 V8 覆盖率，并将 statements、lines、functions、branches 的阈值全部设为 80。当前提交纳入的 /home/lingxufeng/bot/app/sdk/evidence/D8-approval.md:65-70 明确记录加入 T-07 后全套覆盖率仅为 72.63% statements、75.3% lines，因此即使用例全部通过，该覆盖率命令仍会因低于阈值而失败。该记录称其为“旧问题”仅相对于 T-07；相对于本轮 7c2524f..d373b6b 审查范围，整个 SDK、覆盖率配置和相关证据均为新增，不能据此排除。另 /home/lingxufeng/bot/app/sdk/evidence/D2.md:42 声称 pnpm test 包含覆盖率阈值，但 /home/lingxufeng/bot/app/sdk/package.json:17 实际仅执行 vitest run，普通测试通过不能证明覆盖率闸门通过。故维持 major：明确声明的覆盖率验收门槛未满足，而非已证实的运行时功能故障。本次核验依据配置和该提交自带的实测证据，未重新运行覆盖率套件。

### R5 · major · /home/lingxufeng/bot/app/sdk/src/start.ts:78

- **severity**: major
- **finder**: sol:后端逻辑
- **summary**: 默认启动链没有加载强制 shell 审批插件，因此正常启动的 SDK 仍会未经审批执行普通 shell 命令。
- **触发条件**: 用户直接运行规定的启动命令且未设置 P2SDK_PATCH 时，/home/lingxufeng/bot/app/sdk/src/start.ts:75-83 只加载 p2sdk.yml 和生成的 runtime patch，而 /home/lingxufeng/bot/app/sdk/profile/patches/approval.yml:10-13 中的策略插件不会加载；随后模型发起普通 bash 调用即可触发。
- **失败表现**: 默认运行时不会发出所要求的审批请求，普通命令可以直接执行。/home/lingxufeng/bot/app/sdk/evidence/D8-approval.md:24-37 已记录这种基础组合未经审批创建 canary 的行为，而 /home/lingxufeng/bot/app/sdk/tests/e2e/approval.test.ts:82-86 仅在测试中显式补上 approval.yml，掩盖了实际默认启动链的缺口。
- **verifier 证据**: CONFIRMED. Every precondition holds and none is guarded. (1) Default chain: package.json scripts.start → scripts/start.mjs:1 → main() → resolveConfig() with extraPatches sourced only from env P2SDK_PATCH (app/sdk/src/start.ts:52); the launcher never sets P2SDK_PATCH itself. buildArgs (app/sdk/src/start.ts:75-83) mounts only profile/patches/p2sdk.yml + the generated runtime patch + extras. writeRuntimePatch (app/sdk/src/start.ts:117-146) inserts only llm-replay (mock) and p2sdk-handoff. p2sdk.yml (read in full) contains no shell-ask insert and no permission/approval row. (2) The shell-ask plugin is reachable only via approval.yml (app/sdk/profile/patches/approval.yml:10-13 inserts p2sdk-shell-ask), whose header (line 2) states it is mounted through the launcher's P2SDK_PATCH; repo grep shows approval.yml is referenced only by tests/e2e/approval.test.ts. (3) Runtime behavior proven by the project's own red evidence: app/sdk/evidence/D8-approval.md:24-37 — under the preset-only composition (identical to the default boot's permission rows: approval policy=ask + preset workspace-write), an ordinary bash tool/call returned isError:false and created canary files with zero approval/asked events ("红不是「工具没跑」，而是「没问就跑了」"). (4) Masking confirmed: app/sdk/tests/e2e/approval.test.ts:82-86 explicitly appends approval.yml to P2SDK_PATCH, so the green suite never exercises the default chain. (5) Introduced by this diff: git diff --stat 7c2524f..d373b6b shows app/sdk/src/start.ts (455+), profile/patches/approval.yml (13+), src/policy/shell-ask.mjs (26+), scripts/start.mjs (1+) all pure insertions. Requirement basis: work/p2-sdk/BRIEF.md:46 (死因 4: 默认自动审批 exec is the openclaw anti-example D8 must prevent), BRIEF.md:64 (`pnpm -C app/sdk start` is the prescribed command), BRIEF.md:71 (D8: 默认权限不是 bypass, LLM-issued shell call must produce an approval request — stated as default behavior, not conditioned on P2SDK_PATCH), and repo CLAUDE.md hard constraint listing "openclaw：exec 默认不审批" among 安全反例不得照抄. The P2SDK_PATCH mounting is only the builder's own choice recorded in approval.yml's header; no BRIEF/PLAN/user decision makes the approval policy opt-in. Severity major (not critical): escalated calls still ask and the workspace-write sandbox confines writes, but the default boot violates the project's own D8 baseline.

### R6 · major · /home/lingxufeng/bot/app/sdk/src/policy/shell-ask.mjs:20

- **severity**: major
- **finder**: sol:后端逻辑
- **summary**: 只要传入 sandbox_permissions 就跳过策略，会让重复当前沙箱模式的普通命令绕过审批。
- **触发条件**: 即使加载了 approval.yml，模型在默认 workspace-write 会话中发送包含 command、description 和 sandbox_permissions:"workspace-write" 的 bash 参数时，/home/lingxufeng/bot/app/sdk/src/policy/shell-ask.mjs:20-22 会直接调用 next()。该参数是上游允许的模式，且 /home/lingxufeng/bot/repos/deepseek-harness/packages/shell/tool-bash/src/index.ts:83 明确允许它重复当前模式而不提供 justification。
- **失败表现**: 该调用既不会由新增策略询问，也不会由上游升权逻辑询问，命令将按原沙箱权限直接执行。上游 /home/lingxufeng/bot/repos/deepseek-harness/packages/shell/tool-bash/src/index.ts:482-484 在没有 justification 时不调用升权审批，即使提供 justification，/home/lingxufeng/bot/repos/deepseek-harness/packages/sandbox/sandbox/src/escalation.ts:174 也会对重复模式直接返回，因此两条路径都能违反普通 shell 必问的要求。
- **verifier 证据**: Bypass of the T-07 "ordinary shell must ask" policy, model-triggerable with one extra argument. Premises verified: (1) app/sdk/src/policy/shell-ask.mjs:20-22 returns next() whenever exec.arguments.sandbox_permissions !== undefined — the only condition is key presence, no check that the mode differs from the effective one; file is new in this diff (git diff 7c2524f..d373b6b --stat: 26 insertions, new file). (2) next() yields the waterfall default {kind:'allow'} (repos/deepseek-harness/packages/core/tools/src/pipeline.ts:199-202) and the call dispatches to tool-bash's execute (pipeline.ts:229) with no other gate. (3) Default SDK sessions run at effectiveMode='workspace-write' (app/sdk/evidence/D8-approval.md:26-35 session log 'permission/preset {preset: workspace-write}', 'sandbox/mode {mode: workspace-write}'; ⑤ assertions at D8-approval.md:57-61; app/sdk/profile/patches/approval.yml:3-4). (4) 'workspace-write' is a schema-valid, model-sendable value (packages/sandbox/sandbox/src/escalation.ts:42 ESCALATION_TARGETS=['workspace-write','danger-full-access']; advertised per packages/shell/tool-bash/src/index.ts:207-208 since a sandboxing executor is mounted; index.ts:221-225 comment confirms unadvertised keys would also reach execute). (5) validateBashArgs accepts a repeated mode with no justification (index.ts:83 early-returns when sandbox_permissions === effectiveMode, skipping validateEscalationArgs). (6) Without justification, execute never calls the escalation approval (index.ts:482-484: approvedMode = undefined, standing workspace-write policy applies and the command runs). (7) With a justification, approveEscalation returns early for a repeated mode without any approval request (packages/sandbox/sandbox/src/escalation.ts:172-174 'if (mode === effectiveMode) return effectiveMode'). Net effect: a bash call carrying sandbox_permissions:'workspace-write' in the default session executes under the standing sandbox with zero user interaction, neither asked by the new policy nor by upstream escalation — exactly the unapproved-execution outcome T-07 exists to prevent (D8 red case, D8-approval.md:24-40). Severity kept at major rather than critical because the command still runs confined to the standing workspace-write sandbox; strictly wider modes (danger-full-access) remain routed through approveBashEscalation and still require approval. Fix direction: in shell-ask.mjs, only skip the ask when the requested mode is strictly wider than the session's effective mode (or drop the skip and let the ask flow dedupe); the upstream repeat-mode acceptance (index.ts:83 / escalation.ts:174) is upstream behavior and out of scope.

### R7 · major · /home/lingxufeng/bot/app/sdk/src/start.ts:331

- **severity**: major
- **finder**: sol:后端逻辑
- **summary**: 陈旧锁回收中的捕获与恢复窗口仍允许两个启动器同时成功持有同一个 home。
- **触发条件**: 三个启动器竞争同一个陈旧锁时，A 先读到陈旧锁并暂停，B 回收成功并开始持有；A 随后在 /home/lingxufeng/bot/app/sdk/src/start.ts:301 将 B 的有效锁移到 aside，而 C 在 A 执行第 331 行恢复前通过第 240 行发布新锁。用同步文件系统调用的可控交错执行现有 acquireHomeLock，已复现 B、C 均返回 release 函数且尚未释放的状态。
- **失败表现**: A 的恢复遇到 EEXIST 后只保留 aside 文件，不会撤销 C 的成功获取或停止 B，导致 B、C 同时继续启动并写入同一个 runtime home。/home/lingxufeng/bot/app/sdk/src/start.ts:322-335 虽注释了这个窗口，但它实际破坏排他锁的不变量，使配置文件和持久化运行时状态重新出现并发写入。
- **verifier 证据**: Premise-by-premise against app/sdk/src/start.ts (entire file new in 7c2524f..d373b6b: git diff --stat shows 455 insertions, 0 deletions — diff-introduced premise satisfied).

  P1 stale lock possible: start.ts:282-287 — publish fails, readLock returns a dead pid, pidHeld=false; stale reclaim is the designed path, no guard prevents a crashed launcher from leaving this state.

  P2 A pauses between the stale judgment and the rename: lines 287 (pidHeld) and 301 (renameSync) are separate syscalls with no atomicity; nothing re-validates lockPath's identity between them, and rename(2) at :301 is unconditional — it moves whatever is at lockPath, including a fresh live lock. No guard.

  P3 B reclaims and holds: :301→:306→:310-315 (captured matches stale view)→:317 (unlink aside)→:336 (continue)→:279-281 (publish succeeds) — B's acquireHomeLock returns a thunk; main() at :431-437 then proceeds straight to startRuntime with NO post-acquisition re-check of lockPath.

  P4 A's captured-vs-view check fails → else branch: :306,:310-314 — captured is B's lock (different pid/dev/ino from the stale view), deterministically takes the restore path at :321.

  P5 C publishes inside A's rename→link gap: after A's rename (:301) lockPath is absent; A's gap before linkSync (:331) spans readLock(aside) (:306, i.e. open/fstat/read/close per :184-204) plus the compare; C's publish (:235-259) is openSync/writeFileSync/linkSync/unlinkSync and its linkSync at :240 succeeds whenever lockPath is absent (EEXIST checked at :252). Schedulable (µs window right after a syscall return) and deterministically arrangeable.

  P6 A's restore loses: :331-335 — linkSync throws EEXIST, catch keeps the aside file (unlinkSync at :332 is inside the same try and is skipped); A continues (:336) and refuses at :287 on the next iteration. A fails cleanly, but nothing revokes B or stops C.

  Failure state reproduced experimentally (mktemp dir under /dev/shm, deleted afterwards): real acquireHomeLock run in two child processes; A's pre-pause steps (:279-287) and post-pause steps (:298-335) executed in verbatim syscall order. Output: B=ACQUIRE and holding, C=ACQUIRE and holding, lockPath contains C's pid, one stranded .launcher-lock.captured.<A>.* file containing B's pid, and A's continuation via the REAL acquireHomeLock returns the refuse string ("already in use by launcher pid …"). Both B and C pass start.ts:431 with a release thunk, so both enter startRuntime and concurrently write runtime-patch.yml (:117-146), replay-override.json (:374), the shared handoff dir (launch-token, per header :5-6) and spawn two dsh children on the same home — the exact invariant the lock exists to enforce (:217-227 "concurrent launches would overwrite runtime-patch.yml and the handoff files").

  Corroborating: the code's own comments at :322-329 concede the window ("µs capture→restore gap … needs ≥3 racers", "ponytail: userspace floor") but mis-assess the harm as "a leaked inert file is the lesser evil" — the stranded inode belongs to a live, still-running launcher, so the actual harm is a mutual-exclusion break, not a leaked file. The existing suite cannot catch it: tests/unit/launcher-lock.test.ts covers only 2-racer cases (:61-82 sequential A-after-B, which reads B's live lock and refuses before any rename; :144-235 races exactly two children), so the three-racer interleaving is untested.

  Severity major (kept): breaks the T-01.f2 acceptance-① invariant this branch spent multiple review rounds (R1 interleaves, T-01.f2.f1 TOCTOU fix) hardening; failure is silent concurrent writers to one home plus handoff-dir credential cross-talk between two runtimes; but gated behind a low-probability conjunction (stale lock + ≥3 simultaneous launchers + preemption inside the µs gap), so not critical.

### R8 · major · /home/lingxufeng/bot/app/sdk/src/start.ts:301

- **severity**: major
- **finder**: sol:并发与数据完整性
- **summary**: 陈旧锁回收会暂时移走仍有效的锁，使第三个启动者与原持有者同时获得同一个 home。
- **触发条件**: 三个启动者共享同一个 home，且最初存在死 PID 锁。A 在 /home/lingxufeng/bot/app/sdk/src/start.ts:282–287 读到陈旧锁后暂停；B 回收并成功发布自己的锁；A 恢复，在第 301 行把 B 的有效锁 rename 到 aside；C 在第 301 行与第 331 行恢复锁之间执行 publish，成功获取锁。这个交错已通过拦截实际 acquireHomeLock 的 renameSync、在两个边界调用真实 acquireHomeLock 复现，B 和 C 同时返回释放函数。
- **失败表现**: A 的 linkSync 恢复因 EEXIST 失败，但 B 不会收到失去锁的通知，C 也已认为自己成功获得排他锁。两个运行时因而能同时修改 runtime-patch.yml、replay-override.json 和 handoff 文件；第 322–335 行保留 aside 只保护了 inode，没有恢复互斥性。
- **verifier 证据**: Code is this diff's: app/sdk/src/start.ts does not exist at base 7c2524f (git cat-file fails); created 8db50bf, the rename-capture reclaim scheme added by d696f0e (T-01.f2.f1 lock TOCTOU fix). Function read in full: acquireHomeLock, start.ts:229-340.

  Premise ledger (all satisfied, no guard blocks any):
  1. Stale dead-pid lock at lockPath: reachable when a holder dies without release (SIGKILL); readLock parses it (start.ts:184-204), pidHeld=false routes to the reclaim path (start.ts:287-288). The repo's own unit tests seed exactly this state (tests/unit/launcher-lock.test.ts:64,127).
  2. A pauses between the stale read (start.ts:282-287) and renameSync (start.ts:301): plain userspace read-then-act, no atomicity between them.
  3. B reclaims and publishes: B's path 280→301→306→310-315→317 (stale inode captured, confirmed, unlinked), then loop attempt 1 publish at 280 succeeds — B holds (thunk). No re-validation of the lock by A between its read and its rename: rename(2) at 301 is unconditional, so A's resumed rename captures B's LIVE lock; the identity check at 310-315 runs only after lockPath has already been vacated.
  4. C publishes inside the 301→331 gap: lockPath is absent, so C's publish (start.ts:236-254) links successfully. The code's own comment at start.ts:322-329 admits a third racer can publish in this exact capture→restore gap — but frames the outcome as only "a leaked inert file" (start.ts:325, 334), understating it.
  5. A's restore linkSync throws EEXIST (caught start.ts:330-335); B's lock stays as an inert aside file; A loops, finds C's live pid and refuses (start.ts:287) — A behaves correctly.

  Reproduced deterministically (in /dev/shm/mm-review-CBP1, since deleted): byte-identical copy of start.ts, its 'node:fs' import redirected via module.register loader hook to a wrapper firing callbacks at the two boundaries (before renameSync:301 run B's real acquireHomeLock; before the restore linkSync:331 run C's real acquireHomeLock; re-entrant calls pass through). Output: A refused ("already in use by launcher pid 2516144"), B ACQUIRED(thunk), C ACQUIRED(thunk), lockPath carries C's inode, B's lock inert as .launcher-lock.captured.*. Exactly the reporter's claimed repro: two simultaneous release thunks.

  Consequence: acquireHomeLock's contract is one launcher per P2SDK_HOME (doc comment start.ts:217-220: concurrent launches would overwrite runtime-patch.yml and handoff files). main() (start.ts:431-437) proceeds for both holders: B and C each run startRuntime writing the same runtime-patch.yml (start.ts:117-145), replay-override.json (start.ts:373-374), and the same handoff dir holding the 0600 launch token — the exact cross-contamination the lock exists to prevent; B receives no notification it lost exclusivity.

  Severity major (not critical): needs ≥3 concurrent launchers on one home plus a pre-existing dead-pid stale lock, with C's publish landing in the µs-scale 301→331 gap (any preemption stretches it); single-operator CLI launcher context, no direct credential exposure to an attacker. The in-code ponytail note (start.ts:326-329) documents the window as a userspace floor but its consequence analysis is wrong — the harm is broken mutual exclusion between B and C, not a leaked inert file — so this stands as a real defect of this diff, with the fix direction the comment itself names (flock/kernel arbitration).

### R9 · major · /home/lingxufeng/bot/app/sdk/src/start.ts:50

- **severity**: major
- **finder**: sol:并发与数据完整性
- **summary**: 不同 home 的运行时默认共用同一个 handoff 目录，导致凭证和连接目标互相覆盖。
- **触发条件**: 同时启动两个实例，只分别设置不同的 P2SDK_HOME，而不设置 P2SDK_HANDOFF。/home/lingxufeng/bot/app/sdk/src/start.ts:49–50 为它们返回不同的 home，却返回相同的 <pkg>/.dsh-handoff；第 431 行的锁只保护各自的 home，因此两个实例都可以启动。已直接调用 resolveConfig 确认这一配置组合会得到相同 handoff 路径。
- **失败表现**: /home/lingxufeng/bot/app/sdk/profile/plugins/handoff.mjs:24–25 会把两个实例的 launch-token 和 base-url 写到相同文件。后启动者覆盖前者，使用 /home/lingxufeng/bot/app/sdk/examples/min-client.mjs:17–19 默认读取方式的客户端可能连入另一个实例；在两次写入交错时，还可能读取不匹配的 token 与 base-url 并鉴权失败。
- **verifier 证据**: All premises hold; verified by direct execution of the real module plus code reading. (1) Shared default handoff: /home/lingxufeng/bot/app/sdk/src/start.ts:49-50 — home and handoff resolve independently from env; with different P2SDK_HOME and no P2SDK_HANDOFF, executed resolveConfig returned identical handoff = <pkg>/.dsh-handoff for both instances while homes differed. (2) No cross-home exclusion: main() locks only the home — start.ts:431 acquireHomeLock(cfg.home), lockPath = join(home,'launcher.lock') at start.ts:230; experiment: locks on two distinct homes were both ACQUIRED concurrently (same-home second attempt correctly refused), so both instances start. (3) Both write the same files: start.ts:372 mkdirSync(cfg.handoff); writeRuntimePatch start.ts:137-143 injects the identical handoff dir into handoff.mjs, which writes fixed filenames launch-token and base-url via two separate writeFileSync calls (profile/plugins/handoff.mjs:24-25) — later instance overwrites the earlier one's credentials/connection target; interleaving the two writes can yield a mismatched token/base-url pair. (4) Client default reads that same dir: examples/min-client.mjs:17-19, so a default-env client connects to whichever instance wrote last, or fails auth on the mismatched pair. (5) No guard anywhere: validateStart (start.ts:58-66) checks only apiKey and absolute patch paths; P2SDK_HANDOFF is not even documented in the launcher's header env list (start.ts:8-15), and the SDK's own tests avoid the collision only by convention — always setting P2SDK_HANDOFF to a fresh mkdtemp (tests/support/runtime.ts:39,46, tests/e2e/mock-demo.test.ts:83, tests/e2e/restart.test.ts:54) — so the launcher's default-path concurrent behavior is untested. (6) Introduced by this review range: app/sdk/src/start.ts does not exist in base 7c2524f (git show errors "exists on disk, but not in '7c2524f'"); whole app/sdk tree is new. Severity stays major: credential/connection crosstalk between concurrent same-user instances (files are 0600, so no cross-user leak), requires the documented-env combination of per-instance P2SDK_HOME without the undocumented P2SDK_HANDOFF, and is deterministically avoidable by setting P2SDK_HANDOFF — but it silently breaks the credential-handoff integrity that T-01.f3 was built for, and multi-instance distinct-home operation is an explicitly supported pattern (concurrency tests T-04/T-05).

### R10 · major · /home/lingxufeng/bot/app/sdk/src/start.ts:358

- **severity**: major
- **finder**: sol:并发与数据完整性
- **summary**: 排他锁只记录启动器 PID，而 detached 的 dsh 子进程能在启动器死亡后继续占用同一个 home。
- **触发条件**: 实例启动完成后，只对 start.mjs 启动器发送 SIGKILL，或启动器被 OOM 杀死，而不是像重启测试那样显式杀掉整棵进程树。/home/lingxufeng/bot/app/sdk/src/start.ts:238 写入锁的是启动器 process.pid，第 358 行却把 dsh 设置为 detached，且第 436 行的 exit 回调不会在 SIGKILL 时执行。随后对同一个 P2SDK_HOME 再次启动。
- **失败表现**: 第 287–317 行只检查已死亡的启动器 PID，允许回收锁，未确认原 dsh 已停止。新实例因此可以覆盖旧实例的 handoff 和运行时文件，并与仍存活的旧 dsh 同时操作同一个 profile；使用端口 0 时也没有固定端口冲突可以阻止第二个实例启动。现有 /home/lingxufeng/bot/app/sdk/tests/e2e/restart.test.ts:84–88 主动杀掉父子进程，无法覆盖这个故障恢复场景。
- **verifier 证据**: All premises verified in code; start.ts is entirely new in this diff (+455/-0 per git diff --stat 7c2524f..d373b6b). P1 lock stores only the launcher pid: src/start.ts:236-238 (publish writes `${process.pid}\n`); the dsh child pid is only printed to stderr at src/start.ts:438, never persisted — no child-pid file exists to check. P2 child survives launcher SIGKILL: src/start.ts:358 `detached: true` puts dsh in its own process group; Node spawn has no PDEATHSIG, so kill -9 of the launcher pid only kills the launcher; the author's own comment at src/start.ts:439-441 names the "leaving the detached dsh orphaned" outcome but only guards the SIGINT/SIGTERM forwarding path (src/start.ts:442-448), and SIGKILL is uncatchable. P3 lock survives SIGKILL: src/start.ts:436 `process.on('exit', release)` never runs on SIGKILL (kernel destroys the process; no userland hooks), leaving a stale lock naming a dead pid. P4 stale reclaim ignores the live dsh: src/start.ts:282-287 reads the dead pid and does not refuse; src/start.ts:207-215 pidHeld returns false on ESRCH (only EPERM counts as held); src/start.ts:298-337 captures/unlinks the stale lock and the next publish succeeds — no step in acquireHomeLock (src/start.ts:229-340) or main (src/start.ts:424-455) checks runtime liveness. P5 no other guard: default port 0 (src/start.ts:51) yields OS-assigned ports so no EADDRINUSE; dsh upstream has no home-level boot lock (grep of repos/deepseek-harness apps/web, apps/cli for flock/instance-lock: no hits; the per-session flock lease in packages/session/session-persistence-jsonl/src/lease.ts is acquired only at write-open of a session artifact, so a second instance boots and cold-reads unimpeded — collision surfaces only as SessionAlreadyOwnedError if both later write the SAME session). Consequence matches the claim: the second startRuntime overwrites home runtime files (src/start.ts:117-118,144 and 373-375) and the new boot's handoff plugin overwrites the live old instance's launch-token/base-url (app/sdk/profile/plugins/handoff.mjs:24-25), breaking the lock's stated guarantee "One launcher per P2SDK_HOME ... would overwrite runtime-patch.yml and the handoff files" (src/start.ts:217-220) silently in the exact crash-recovery path (launcher OOM/SIGKILL, then restart) the stale-reclaim branch exists for. Test gap confirmed: tests/e2e/restart.test.ts:84-93 killTree9 kills parent AND child pids; tests/unit/launcher-lock.test.ts exercises acquireHomeLock with fake pids only, never a live detached dsh. Not reproduced at runtime (node_modules not installed in this checkout); the reclaim path is statically decidable and child-survival is POSIX/Node spawn semantics the code itself relies on. Severity kept major: core acceptance invariant (T-01.f2 ①) silently violated under a plausible ops action, though session-log corruption is bounded by dsh's kernel per-session leases.

### R11 · major · app/sdk/tests/e2e/security.test.ts:104

- **severity**: major
- **finder**: opus:跨文件深度
- **summary**: T-08 的 boot() 仍然从 `join(home,'base-url')` 和 `join(home,'launch-token')` 读凭证，而且不设 P2SDK_HANDOFF。但先合并的 T-01.f3 已经把 handoff 插件的落盘位置改成 cfg.handoff（默认 `<PKG_ROOT>/.dsh-handoff`），home 下再也不会出现这两个文件。
- **触发条件**: 在 HEAD 上跑 `pnpm -C app/sdk vitest run tests/e2e/security.test.ts`：②③⑥ 用例（以及有真实 key 时的 ⑤）都会走到 boot()，等到 ready 行后执行 readFileSync(home/base-url)。
- **失败表现**: 这些用例抛 ENOENT 失败，T-08 的鉴权和哨兵验收在合并后的主线上从来没跑通过（D8 证据记的 13 files，来自不含 security.test.ts 的 feat/T-07 分支）。另外这些用例会把 token 写进共享的默认 `.dsh-handoff`，开发者正在跑的 `pnpm start` 的 launch-token/base-url 会被覆盖。
- **verifier 证据**: HEAD 的启动与读取路径确实不一致。/home/lingxufeng/bot/app/sdk/tests/e2e/security.test.ts:87-105 的 boot() 只设置 P2SDK_HOME，没有为该实例设置 P2SDK_HANDOFF，却在 ready 后读取 home/base-url 和 home/launch-token。/home/lingxufeng/bot/app/sdk/src/start.ts:49-50 将 home 与 handoff 分开解析，未设置 P2SDK_HANDOFF 时 handoff 固定为包目录下的 .dsh-handoff；同文件:137-142 将该 handoff 传给插件。/home/lingxufeng/bot/app/sdk/profile/plugins/handoff.mjs:24-26 只向此目录写两个文件，写完才输出 ready。因此正常未设置 P2SDK_HANDOFF 的环境下，使用全新 mkdtemp home 的②、③、⑥会在 security.test.ts:104 确定抛出 ENOENT，尚未执行鉴权或泄漏扫描断言；⑤满足密钥和端点条件时同样受影响。该文件是本次范围内新增测试，属于本次引入的问题。此外，不同 home 的启动仍共用默认 handoff，而 /home/lingxufeng/bot/app/sdk/src/start.ts:430-437 的排他锁仅按 home 获取，因此这些测试可以覆盖正在使用默认 handoff 的开发实例的凭证文件。以上为代码路径核验，未启动运行时以避免覆盖真实 handoff；不据此断言历史上是否有人跑过合并后的完整测试。

### R12 · major · app/sdk/src/policy/shell-ask.mjs:20

- **severity**: major
- **finder**: opus:跨文件深度
- **summary**: 只要 bash 调用带了 sandbox_permissions，策略就整体放行。但上游 tool-bash 和 approveEscalation 在 sandbox_permissions 等于当前有效模式时直接返回、不发审批（validateBashArgs 提前 return，escalation.ts 里有 `if (mode === effectiveMode) return effectiveMode`）。所以模型只要带上和当前模式相同的值，就能执行普通 shell 而不被询问。
- **触发条件**: 默认 preset 是 workspace-write 时，模型发出 `bash {command:'touch x', description:'d', sandbox_permissions:'workspace-write', justification:'j'}`。
- **失败表现**: 「普通 shell 必问」(D8) 被模型自行绕过：命令不经 approval/request 直接执行。单测只覆盖了 danger-full-access 这一种升权值。
- **verifier 证据**: 该候选成立，属于本次新增审批策略的可达绕过。/home/lingxufeng/bot/app/sdk/src/policy/shell-ask.mjs:20-22 对任何带 sandbox_permissions 的 bash 调用直接 next()，没有检查其是否真正升权；/home/lingxufeng/bot/repos/deepseek-harness/packages/core/tools/src/pipeline.ts:199-205 的默认决策是 allow，只有 ask 才调用审批服务。默认沙箱模式在 /home/lingxufeng/bot/repos/deepseek-harness/packages/bundle/base/cordis.patch.yml:246 为 workspace-write，而 /home/lingxufeng/bot/repos/deepseek-harness/packages/shell/tool-bash/src/index.ts:391-394 暴露的参数枚举允许 workspace-write。因此模型提交 {command:'touch x',description:'d',sandbox_permissions:'workspace-write',justification:'j'} 是合法且可达的调用。该调用在 /home/lingxufeng/bot/repos/deepseek-harness/packages/shell/tool-bash/src/index.ts:83 通过同模式参数校验，随后在 :482-483 调用 approveBashEscalation；该函数在 :237-239 将当前模式传给共享审批函数，而 /home/lingxufeng/bot/repos/deepseek-harness/packages/sandbox/sandbox/src/escalation.ts:174 在请求模式等于当前模式时直接返回，跳过 :189 的审批请求。执行器随后在 /home/lingxufeng/bot/repos/deepseek-harness/packages/shell/tool-bash/src/index.ts:485-496 构造正常 shell 执行请求，故工作区内的命令不经 approval/request 即可执行，违反 D8 的普通 shell 必问要求，但不会因此突破原沙箱权限，严重性为 major。/home/lingxufeng/bot/app/sdk/tests/unit/policy.test.ts:50-56 只测试 danger-full-access 的委托路径，没有覆盖同模式绕过。结论依据实际调用链的代码证据，未运行端到端复现，也未修改仓库。

### R13 · major · app/sdk/src/start.ts:75

- **severity**: major
- **finder**: opus:跨文件深度
- **summary**: shell-ask 审批策略只写在 profile/patches/approval.yml 里，只能靠 P2SDK_PATCH 挂载，buildArgs 默认只带 p2sdk.yml 和运行时 patch。照文档 `pnpm start` 启动的运行时没有这条策略。
- **触发条件**: 不设 P2SDK_PATCH，执行 `pnpm -C app/sdk start`（D2 演示路径），模型发起一次普通 bash 调用。
- **失败表现**: 按 D8 红用例证据，普通 shell 不问用户直接执行，等于默认 exec 不审批，正是 CLAUDE.md 列出的 openclaw 安全反例。只有测试里挂了 approval.yml 才是绿的。
- **verifier 证据**: 默认启动路径确实漏挂审批策略：/home/lingxufeng/bot/app/sdk/package.json:17 的 start 执行 scripts/start.mjs，而 /home/lingxufeng/bot/app/sdk/src/start.ts:52 在未设置 P2SDK_PATCH 时生成空 extraPatches；同文件:75-83 的 buildArgs 只挂 p2sdk.yml、runtimePatch 和显式 extras，:117-145 的 runtimePatch 也仅插入 replay/handoff，不会加载 approval.yml。普通 shell 必问的唯一插件注册位于 /home/lingxufeng/bot/app/sdk/profile/patches/approval.yml:10-13，其 tools/pre-execute 拦截逻辑见 /home/lingxufeng/bot/app/sdk/src/policy/shell-ask.mjs:16-25，因此默认启动没有这道守卫。对应执行链在 /home/lingxufeng/bot/repos/deepseek-harness/packages/core/tools/src/pipeline.ts:199-205 默认 allow，仅在决策为 ask 时询问；/home/lingxufeng/bot/repos/deepseek-harness/packages/shell/tool-bash/src/index.ts:482-487 对不含 sandbox_permissions 的普通调用跳过升权审批，随后在:526-527 执行 shell。仓库已有直接反证：/home/lingxufeng/bot/app/sdk/evidence/D8-approval.md:11-39 记录不挂 approval.yml 时 touch 成功、canary 创建且没有审批事件；而 /home/lingxufeng/bot/app/sdk/tests/e2e/approval.test.ts:79-86 在绿测中特意通过 P2SDK_PATCH 加入该文件，未覆盖默认部署配置。因此这次新增 SDK 的文档默认启动路径仍允许普通 bash 未经用户批准执行，属于 major 安全缺陷。本次未运行动态复现，app/sdk/node_modules 尚未安装；结论基于启动链、执行链及已有红用例证据。

### R14 · major · /home/lingxufeng/bot/app/sdk/src/p2temp/index.mjs:85

- **severity**: major
- **finder**: sol:sweep
- **summary**: 读取连接器 patch 时丢失相对模块路径的 bundle 锚点，合法 JSON 连接器无法加载。
- **触发条件**: 已安装的连接器使用 JSON patch，insert 行的 name 为 './lib/index.mjs' 等相对路径。readConnectorRows 原样返回该路径，createWithConnectors 随后直接注册这些行，却没有保留 patch 所在目录。已用临时 bundle 实测返回值仍为 './lib/index.mjs'。
- **失败表现**: 上游 AgentPresetRegistry.register/activate 和 mountPreset 按注册上下文的 baseUrl 解析插件，而不是连接器 patch 的目录，因而导入错误位置，导致临时 preset 加载失败、createWithConnectors 无法创建会话。现有 fixture 全部使用绝对 file:// 模块路径，掩盖了该问题；应像上游 bundle patch loader 一样按每份 patch 的位置解析相对模块路径（含嵌套行）。
- **verifier 证据**: All premises verified against code and the released dsh-v0.2.2-alpha.2 tag (the exact version app/sdk pins, package.json:21); tmpfs experiment reproduced both halves.

  Premise 1 — legal input, no guard: a connector bundle's JSON patch with a relative insert name is valid upstream. packages/boot/app-boot/src/index.ts:543-554 (anchorInsertedPluginNames, docstring "anchoring relative paths beside the patch") rewrites './'/'../'/absolute insert names (recursing into nested group rows via entry.config.forEach(visit)) to file:// URLs beside the patch file; applied by parsePatchList (:590) which loadOverlayPatches runs on every bundle patch (packages/boot/app-boot/src/profile.ts:701-702). So such a connector works when enabled through the normal profile path. readConnectorRows only checks JSON-parseable + non-empty inserts (app/sdk/src/p2temp/index.mjs:76-87) — nothing rejects or anchors relative names.

  Premise 2 — anchor lost: app/sdk/src/p2temp/index.mjs:85-87 returns patch.flatMap(row => row.insert ?? []) verbatim; experiment (function extracted verbatim from the repo file, run in /dev/shm/mm-review-*) returned [{"id":"conn-plugin","name":"./lib/index.mjs"}] unchanged.

  Premise 3 — registered without base: app/sdk/src/p2temp/index.mjs:110-114 pushes the rows and calls this.ctx.agentPresets.register({id: tempId, plugins: rows}) with no baseUrl/path information.

  Premise 4 — upstream resolves by registration context, not patch dir: packages/preset/agent-preset-registry/src/index.ts:125 (scope.ctx.extend({baseUrl: record.context.baseUrl}) — the registry's own context); src/mount.ts:209 (prepareProfileEntries(ctx, plugins, ctx.baseUrl)); vendor/loader/src/config/tree.ts:113-132 (internal.import(name, this.ctx.baseUrl!) / new URL(name, this.ctx.baseUrl)). Experiment: './lib/index.mjs' resolves to <profileDir>/lib/index.mjs (nonexistent — the fixture comment itself notes the profile workspace has no node_modules, tests/market/support.ts:48) instead of <profile>/node_modules/<bundle>/lib/index.mjs.

  Premise 5 — stated failure occurs: wrong-location import → auditRows failed row → mountPreset throws (mount.ts:212) → record.broken set (agent-preset-registry/src/index.ts:133-136, register itself does not throw) → sessionController.create composes the agent via composeAgent → presets.mount → retain throws RemoteError('agent-preset/invalid') (index.ts:248-264; packages/api/session-controller/src/agent.ts:272-281) → createWithConnectors rejects. Matches the claimed failure exactly.

  Premise 6 — introduced by this diff: git diff 7c2524f..d373b6b shows app/sdk/src/p2temp/index.mjs as +127 new lines (added in commit 3f167c7, inside the range).

  Premise 7 — tests mask it: all fixtures use absolute file:// specifiers (tests/market/support.ts:49 pathToFileURL(...).href with explicit comment "Absolute specifier: the $DSH_HOME profile workspace has no node_modules"; observer patch support.ts:70 likewise), so no test exercises a relative insert name.

  Fix direction (for the caller, not applied): readConnectorRows should replicate upstream anchoring — rewrite './'/'../'/absolute insert-row names (including nested group rows) to pathToFileURL(resolve(dirname(patchFile), name)).href, mirroring anchorInsertedPluginNames.

  Severity major (kept): breaks the p2temp API's documented contract (any installed dsh bundle) for an input class upstream explicitly supports, and the same connector works via the normal dsh enable path but fails via createWithConnectors; bounded to the temporary P2 API and fails loud (no silent corruption), so not critical.

## 上轮未修

无（unfixedFromLastRound 为空）。

## 其他发现

### O1 · minor · app/sdk/tests/e2e/mock-demo.test.ts:46

- **severity**: minor
- **finder**: glm:正确性+合规
- **verdict**: CONFIRMED
- **summary**: 用例名声称「boots … with a 0600 launch token」但从未断言文件权限位：变量名叫 mode，实际只检查内容不含 'token='；handoff.mjs 的 writeFileSync mode 仅在创建时生效，预存文件不会被收紧
- **触发条件**: 在 handoff 目录预创建一个 0644 的 launch-token（或上一异常残留被 chmod 过）再启动：writeFileSync(join(dir,'launch-token'),…,{mode:0o600}) 不改既有文件权限，测试仍然全绿
- **失败表现**: 0600 这条凭证隔离验收（handoff.mjs:24-25）实际处于无守护状态，launch token 权限回退不会被任何测试发现
- **verifier 证据**: 候选成立，保留 minor，定位为凭证权限验收缺口。/home/lingxufeng/bot/app/sdk/tests/e2e/mock-demo.test.ts:39 声称验证 0600，但 :46-47 实际读取文件内容并检查不含 token=，没有检查权限位。触发条件可达：/home/lingxufeng/bot/app/sdk/src/start.ts:50 允许指定或复用固定 handoff 目录，:371-372 仅递归创建目录，没有删除既存文件或收紧权限；/home/lingxufeng/bot/app/sdk/profile/plugins/handoff.mjs:24 使用 writeFileSync 的 mode: 0o600，该选项仅在创建文件时生效，覆盖既存 0644 文件会保留其权限，随后 :26 仍宣布 ready。在 /dev/shm/mm-review-XXXX 临时目录中预建 0644 launch-token，以合成 token 和模拟 ctx 调用真实 apply，实测写入后权限仍为 644，且 :46-47 对应的内容检查通过；实验目录已删除。新建文件的正常路径不受此问题影响，但现有用例无法守护其名称承诺的 0600 要求，也无法捕获上述既存文件场景。

## 超出预算未验证

- **minor** /home/lingxufeng/bot/app/sdk/tests/e2e/concurrency.test.ts:97（sol:并发与数据完整性）— 并发测试没有等待 follow 的初始快照，首块进入快照时会把正确实现判成屏障超时。
- **major** /home/lingxufeng/bot/app/sdk/src/start.ts:50（opus:跨文件深度）— handoff 目录默认是 `<PKG_ROOT>/.dsh-handoff`，正好是默认 home `<PKG_ROOT>/.dsh` 的同级目录。P2SDK_HOME 和 DSH_HOME 一起传给 dsh，而上游 scrubbedParentEnv 只剔除 KEY/SECRET/TOKEN 和 DSH_ 前缀，P2SDK_HOME 会留在模型 shell 的环境里。workspace-write 只限写不限读，所以 launch-token 路径从运行时内部可以推出来，也能读到。T-01.f3 的测试只用随机 mkdtemp 的 handoff 目录，读的是不存在的 home/launch-token，覆盖不到这个默认配置。
- **minor** /home/lingxufeng/bot/app/sdk/src/start.ts:358（opus:跨文件深度）— dsh 用 detached（setsid）启动，但排他锁里记的是 launcher 的 pid。launcher 被 SIGKILL，或者收到它没处理的 SIGHUP 死掉后，dsh 作为孤儿进程继续服务，而锁会因为 pid 已死被下一次启动当作陈旧锁回收。
- **minor** /home/lingxufeng/bot/app/sdk/tests/e2e/security.test.ts:261（opus:跨文件深度）— ③ 用 mock provider 注入哨兵，但 T-01.f3 的 childEnv 在 mock 模式下会删掉 P2SDK_LLM_API_KEY。断言里的 childEnvHas 检查的是 launcher（rt1.child.pid）而不是 dsh 进程，所以「哨兵真的到达运行时」这条断言实际检查的是错误的进程。
- **minor** /home/lingxufeng/bot/app/sdk/src/p2temp/index.mjs:68（opus:跨文件深度）— connectors 只检查了是不是非空字符串，就直接 join 到 `profileDir/node_modules/<name>`，没有限制路径穿越。任意目录下只要有带 dsh.bundle.patch 的 package.json，它的 insert 行（含 file:// 插件）都会被注册进临时 preset 并加载执行。
- **major** /home/lingxufeng/bot/app/sdk/src/p2temp/index.mjs:114（sol:后端逻辑）— 连接器会话持久化了仅存在于内存中的随机 preset 标识，运行时重启后该会话无法继续对话。
- **minor** /home/lingxufeng/bot/app/sdk/src/start.ts:142（glm:正确性+合规）— writeRuntimePatch 把 cfg.handoff / cfg.home / replay overrideFile 直接嵌进 YAML 单引号标量而不转义：路径含单引号时 YAML 语法被破坏（YAML 单引号内 ' 须写成 ''），同文件 overrideFile(行127) 同病。
- **minor** /home/lingxufeng/bot/app/sdk/src/start.ts:451（glm:正确性+合规）— ready 超时路径只转发一次 SIGTERM 后无限 await handle.exited，无升级无兜底：dsh 若卡在不可中断状态（原生模块挂起、进程不可杀）则启动器在超时后仍永久挂住。
- **minor** /home/lingxufeng/bot/app/sdk/tests/support/runtime.ts:65（glm:正确性+合规）— launchRuntime 的 ready 等待循环超时后不抛错直接落到 readFileSync(handoff/base-url)：冷机启动超 60s 时测试失败信息是莫名的 ENOENT 而非「no ready line」。

## 已被否定

无（refuted 为空）。

## 统计

| 项 | 值 |
|---|---|
| finders | 6 |
| candidates | 30 |
| verified | 15 |
| refuted | 0 |
| dupes | 6 |
| overBudget | 9 |
