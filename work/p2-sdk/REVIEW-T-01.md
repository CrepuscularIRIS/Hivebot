verdict: FAIL
base: 927b5148b11ee15db89f14c758ec2ddaed8936f4  head: 8db50bfdccd02d3c536b79478dcfbd135cb0e5cc

> 范围：`927b514..8db50bf`（任务 T-01，M 档，target 8db50bf）。head 变了本报告作废。

## 阻塞问题

CONFIRMED 且 severity 为 critical / major 的发现。

### R1 · app/sdk/examples/min-client.mjs:19

- **severity**: major（CONFIRMED）
- **summary**: Agent session cwd is placed inside $P2SDK_HOME (join(home,'workspace')), making the live launch-token/base-url files siblings of the workspace, so the model-driven agent's own file/shell tools can read the operator credential into its transcript — contrary to project hard constraint 「凭证不进模型，也不进容器」.
- **触发条件**: Create a session via min-client (or the e2e client at tests/e2e/mock-demo.test.ts:34, same pattern) and send any prompt that induces the agent to list or read the parent directory (e.g. 'cat ../launch-token', a glob that walks up, or a prompt-injected instruction from untrusted content); dsh's file tools run as the same user and the 0600 bit does not block the session's own process owner.
- **失败表现**: The operator token — full control of the dsh server including shell-bearing sessions — enters the tool-output stream, i.e. the model context, and is forwarded off-box through LiteLLM to the upstream provider (glm-5.3-flash). Fix is free: put the session cwd outside $P2SDK_HOME.
- **verifier 证据**: 本次新增的 /home/lingxufeng/bot/app/sdk/examples/min-client.mjs:19 将 session cwd 设为 $P2SDK_HOME/workspace，而 /home/lingxufeng/bot/app/sdk/profile/plugins/handoff.mjs:21-22 将有效 launch-token 和 base-url 写在其父目录。已核对本地上游仓库的 dsh-v0.2.2-alpha.2 标签，而非用较新的 HEAD 推断：/home/lingxufeng/bot/repos/deepseek-harness/packages/bundle/base/cordis.patch.yml:518-521 启用 fs-sandbox；该标签下 /home/lingxufeng/bot/repos/deepseek-harness/packages/fs/fs-sandbox/src/index.ts:2-8 明确说明读操作完全继承本地实现、所有模式均允许读取，实际类也只覆盖写入和编辑。模型 read 工具经该标签下 /home/lingxufeng/bot/repos/deepseek-harness/packages/fs/tool-fs/src/read-target.ts:24-33 解析 session 相对路径并检查文件类型，随后 /home/lingxufeng/bot/repos/deepseek-harness/packages/fs/tool-fs/src/read.ts:137-158 读取正文，:107-119 将正文渲染为模型可见文本。因此，一旦模型调用 read 读取 ../launch-token，路径可达且没有读范围隔离；0600 不能阻止同一用户运行的宿主文件服务读取，token 会进入工具结果和后续模型上下文，违反凭证不进模型的硬约束。确认 major，但候选中的“只把 cwd 移到其他目录即可修复”不成立：此上游文件服务同样允许绝对路径和父目录读取，需要实际的读取隔离或凭证路径拒绝策略。未读取任何真实凭证，也未向真实模型发送复现请求。
- **finder**: glm:安全

### R2 · /home/lingxufeng/bot/app/sdk/examples/lib/mux.mjs:77

- **severity**: major（CONFIRMED）
- **summary**: MuxSocket handles 'error' only via `once('error', reject)` on the pre-open ready promise and has no 'close' handler, so after the socket opens, a server-side close or first error leaves every in-flight MuxStream's next() promise unsettled forever (and a second 'error' event becomes an unhandled-exception crash)
- **触发条件**: Start examples/min-client.mjs against a runtime, then the server side of the WebSocket drops mid-stream: kill/Ctrl-C the dsh runtime before turn/end arrives, or an idle/keepalive timeout closes /api/remote.mux — the ws 'close' event fires with no listener, streams stay in this.waiters
- **失败表现**: min-client (and every later task reusing examples/lib, per the module's own header) hangs indefinitely instead of surfacing a connection error; the ws listener only resolves pre-open failures, so post-open failures are indistinguishable from a slow turn
- **verifier 证据**: 确认核心问题，但收窄候选中的失败描述。/home/lingxufeng/bot/app/sdk/examples/lib/mux.mjs:75-79 仅将 open/error 连接到 ready Promise 并监听 message，没有 close 处理；连接成功后 ready 已兑现，后续首次 error 的 reject 不会再产生作用。/home/lingxufeng/bot/app/sdk/examples/lib/mux.mjs:45-55 将等待帧的 next() 挂在 MuxStream.waiters；只有收到协议 item/end/error 或显式调用本地 close() 才能推进它（同文件:89-95、112-114），因此服务端进程被杀、底层连接关闭且没有协议结束帧时，待处理迭代不会完成，也不会报告连接错误。实际调用链可达：/home/lingxufeng/bot/app/sdk/examples/lib/client.mjs:19-28 将该流直接返回给调用方；/home/lingxufeng/bot/app/sdk/examples/min-client.mjs:24-30 消费它，并在:43 等待 turnEnded，唯一的 client.close() 在:45，无法解除该等待。该文件在指定提交中为新增，属于本次引入的问题。准确后果是流 Promise 永久悬置：宿主仍有活动句柄时会一直等待；独立 Node CLI 在活动句柄耗尽后可能因未完成的顶层 await 非零退出，而非必然无限挂起。未证明真实 ws 会连续产生第二个 error，因此不以候选中的二次 error 崩溃说法作为确认依据。本次为代码调用链验证，未运行依赖缺失的端到端实验。
- **finder**: glm:正确性+合规

### R3 · /home/lingxufeng/bot/app/sdk/examples/lib/mux.mjs:79

- **severity**: major（CONFIRMED）
- **summary**: WebSocket 意外断开时不会结束逻辑流，正在等待的消费者会永久挂起。
- **触发条件**: 连接成功并调用 open('session/follow', ...) 后，服务端重启、退出或网络断开。/home/lingxufeng/bot/app/sdk/examples/lib/mux.mjs:75-79 仅处理初始 open/error 和 message，没有给 close 事件注册结束逻辑流的处理器。
- **失败表现**: 已经进入 /home/lingxufeng/bot/app/sdk/examples/lib/mux.mjs:55 的 next() Promise 不会完成，而 /home/lingxufeng/bot/app/sdk/examples/min-client.mjs:43 无超时地等待 turnEnded，因此断线不会得到明确失败结果。断线后再次 open() 也会通过已经完成的 ready Promise，并在 mux.mjs:99 静默丢弃 open 帧，产生另一个永远没有响应的逻辑流。用事件桩触发 close 后，已复现 next() 仍处于 pending 状态。
- **verifier 证据**: All premises verified against /home/lingxufeng/bot/app/sdk/examples/lib/mux.mjs (new file in this diff — `git show 927b514:app/sdk/examples/lib/mux.mjs` errors "exists on disk, but not in 927b514"; diffstat shows +135 added in 8db50bf).

  P1 consumer pends in next(): mux.mjs:43-62; when queue empty and not done, next() awaits a Promise (mux.mjs:55) resolved only by _push (mux.mjs:25-31) or _finish (mux.mjs:33-40). Consumers iterate it at min-client.mjs:24-30 (`for await` on the follow stream, awaited at min-client.mjs:43 with no timeout) and client.mjs:28 (follow onFrame path). No guard blocks entry.

  P2 unexpected close has no handler: MuxSocket constructor mux.mjs:71-80 registers only ws.once('open') (75), ws.once('error', reject) (77, a no-op after the ready promise resolves at 76), and ws.on('message') (79). Grep over the whole file: no ws 'close' listener anywhere. The only callers of stream._finish() are _receive on item/error/end frames (mux.mjs:89-95, driven by the message event) and the consumer-initiated MuxSocket.close() (mux.mjs:112-115). So a server restart/exit/network drop (ws emits 'error'+'close' post-open) never finishes logical streams.

  P3 no caller backstop: tests/support/runtime.ts:52-57 timeout only polls the ready line during boot; min-client.mjs:43 awaits turnEnded with no timeout; tests/e2e/mock-demo.test.ts covers only the happy path (46-59) and never exercises a mid-stream disconnect.

  P4 post-close open(): mux.mjs:104 `await this.ready` passes through the already-settled promise; mux.mjs:98-100 _send silently drops the open frame when readyState !== OPEN; the stream is registered at mux.mjs:107 and never receives a frame — another permanently pending stream.

  Repro executed in /dev/shm/mm-review-XXXX (cleaned up) loading the real /home/lingxufeng/bot/app/sdk/examples/lib/mux.mjs with real ws 8.13.0 sockets: server terminate() mid-turn -> first stream next() still pending after 500ms; subsequent open() resolved and its next() also still pending after 300ms. Output: "REPRO: hang CONFIRMED".

  One manifestation nuance: in a bare min-client process whose dead ws is the last event-loop handle, Node exits with code 0 silently instead of hanging — violating the script's own contract "Exit code 0 only when both assertions hold" (min-client.mjs:1-4), i.e. a false pass under CI. In any context with a live handle (vitest, reused DshClient) it hangs indefinitely with no clear failure. Same root defect either way: mux.mjs registers no ws 'close' handler to _finish() all logical streams (and no dead-socket guard in open/_send). Severity major (not critical): this is examples/ demo-slice client code meant for reuse by later tasks, not the src/start.ts launcher itself; but it breaks failure reporting on any server restart and yields silent exit-0 false passes in the D2 acceptance script.
- **finder**: sol:并发与数据完整性

### R4 · /home/lingxufeng/bot/app/sdk/src/start.ts:174

- **severity**: major（CONFIRMED）
- **summary**: 启动器没有为运行目录建立独占机制，并发启动会覆盖其他实例尚未读取的配置和连接交接文件。
- **触发条件**: 两个启动器同时使用默认 P2SDK_HOME，或显式使用相同目录，例如分别以 real 和 mock 模式启动。/home/lingxufeng/bot/app/sdk/src/start.ts:103,127 将生成配置覆盖到同一个 runtime-patch.yml，:174-175 则把这个共享路径传给异步启动的子进程，没有锁定目录或为每次启动分配独立路径。
- **失败表现**: 如果实例 A 写完 overlay 并 spawn 后、其子进程读文件前，实例 B 覆盖该文件，A 将加载 B 的 overlay；mock 实例可能因此缺失 replay 插件，无法按所选模式处理请求。两个实例随后还会在 /home/lingxufeng/bot/app/sdk/profile/plugins/handoff.mjs:21-22 分别覆盖同一组交接文件，使已宣布 ready 的实例不再对应磁盘上的连接信息；/home/lingxufeng/bot/app/sdk/examples/min-client.mjs:14-15 也可能跨两次更新读取到不匹配的地址和 token。
- **verifier 证据**: All premises satisfiable in code; no guard exists. P1 shared home: src/start.ts:46 (default home = fixed join(PKG_ROOT,'.dsh')), :47 (port 0, OS-assigned, no port clash blocks concurrency); grep over src/scripts/examples/profile/tests finds no lock/flock/O_EXCL/wx/exclusive anywhere (only 'block-start'/'block-end' substrings and test-side mkdtemp); startRuntime start.ts:169-213 and main :216-232 acquire no lock. Test isolation is caller discipline only (tests/support/runtime.ts:34,40; tests/e2e/mock-demo.test.ts:63,75), and the documented zero-env invocation (examples/min-client.mjs:6) uses the shared default. P2 TOCTOU on runtime-patch.yml: fixed name start.ts:103, plain writeFileSync :127, written at :174 immediately before spawn :175 passes the path via --patch (buildArgs :75); the dsh child reads the file asynchronously during its own boot, so a second launcher's write can land in the window and the first child loads the wrong overlay. Consequence chain verified: llm-replay insert exists only in the mock branch of writeRuntimePatch (start.ts:105-121) defining provider id 'mock' (:114-119); profile/patches/p2sdk.yml:40-41 selects provider 'mock' from the child's own env (P2SDK_PROVIDER set per child at start.ts:88), so a mock child that loaded a real-mode overlay gets a default model pointing at an undefined provider and its model calls fail — exactly the claimed failure. replay-override.json (start.ts:172) is a further fixed shared path. P3 deterministic clobber: profile/plugins/handoff.mjs:21-22 write launch-token and base-url to fixed names in the same $P2SDK_HOME; whichever instance's plugin runs last wins, so an already-ready instance no longer matches disk. P4 torn reads: examples/min-client.mjs:13-15 falls back to the same shared default home and reads base-url then launch-token in two separate readFileSync calls; with OS-assigned ports the origins differ, so a mixed pair (base-url from A + token from B) fails auth or silently points the client at the wrong-mode instance (live LiteLLM spend where a mock replay was intended). Introduced by this diff: confirmed via git diff --stat 927b514..8db50bf — src/start.ts (+232), profile/plugins/handoff.mjs (+27), examples/min-client.mjs (+75) are all new files in commit 8db50bf. Verdict CONFIRMED at major: default no-env path shares a fixed home and dual-mode (real+mock) operation is the documented demo flow, and the failure is silent config/mode confusion; not critical because no security boundary is crossed (tokens stay in 0600 files under the user's own home), no data loss, and it requires an operator to launch two instances concurrently, which no repo tooling currently does.
- **finder**: sol:并发与数据完整性

### R5 · app/sdk/src/start.ts:224

- **severity**: major（CONFIRMED）
- **summary**: main() sends SIGINT/SIGTERM on to the dsh child, but the child was spawned in the same process group, so a terminal Ctrl-C already reaches it directly. The pinned dsh createProcessShutdown().interrupt() force-exits on a second signal while shutdown is pending (profile-boot-e2mS45fC.js:64-67), so graceful dispose never runs.
- **触发条件**: `P2SDK_PROVIDER=mock pnpm -C app/sdk start` in a terminal, then Ctrl-C (the stop method D2.md documents). The TTY's SIGINT and the one start.ts forwards both reach the dsh process.
- **失败表现**: dsh calls process.exit(130) right away and skips fiber/profile dispose: in-flight session writes and cleanup are cut off, and spawned tool subprocesses or MCP children can be left orphaned. The documented graceful stop never happens.
- **verifier 证据**: 触发路径成立。/home/lingxufeng/bot/app/sdk/src/start.ts:176-179 的 spawn 未设置 detached，因此 dsh 子进程继承启动器的进程组；同文件:223-225 又将启动器收到的 SIGINT 转发给该子进程。终端 Ctrl-C 向前台进程组发信号，所以 dsh 可以先收到终端 SIGINT，再收到转发的 SIGINT。钉版依赖 /tmp/bot-wt/T-03/app/sdk/node_modules/@deepseek-ai/dsh/lib/profile-boot-e2mS45fC.js:275-285 将每次 SIGINT 都接到 shutdown.interrupt(130)，而该文件:64-69 在 pending 已设置时立即强制退出；:22-23 的默认实现是 process.exit(code)。该文件:262-265 的 fiber.dispose() 是异步清理，因此第二个信号能在清理结束前中断它。已在 /dev/shm/mm-review-* 隔离目录，用目标提交的原始 start.ts、从钉版依赖逐字提取的 shutdown 控制器及耗时 500ms 的测试 disposer，经 PTY 输入一次真实 Ctrl-C，连续三次均得到『SIGINT → dispose-start → SIGINT』、exit 130，未出现 dispose-done；实验目录已删除，没有修改仓库。此实验验证的是信号重复与清理被截断，不是声称已复现真实会话损坏或工具孤儿进程。另外，候选的『dispose never runs』措辞过强：dispose 可以开始执行，但无法保证完成。/home/lingxufeng/bot/app/sdk/evidence/D2.md:43 明确把 Ctrl-C 列为停止方式，因此这是新增启动器在正常使用路径上引入的清理可靠性问题，维持 major。
- **finder**: opus:跨文件深度

### R6 · app/sdk/examples/min-client.mjs:23

- **severity**: major（CONFIRMED）
- **summary**: min-client calls session/prompt over HTTP right after sending the WS `open` frame, without waiting for the follow stream's opening `snapshot`. Upstream follow() (dsh-api-session-controller index.js:2509-2535) puts everything that happened before the snapshot into `snapshot.entries`/`assistantStream` baseline, which the client never inspects.
- **触发条件**: The HTTP prompt starts the turn before the server finishes `await usingObservation(...)` for the follow, e.g. on a loaded host (this box runs GPU training with high iowait), or with the fast mock replay (6 chunks at paceMs 25).
- **失败表现**: If turn/end falls inside the snapshot, the `for await` loop waits for a `type:'event'` turn/end that never comes, and min-client hangs with no timeout (the vitest e2e times out at 120s and leaves the process behind). If only chunks fall inside the baseline, the run fails falsely with 'no assistant chunk arrived before turn end'.
- **verifier 证据**: 竞态可达，且会导致 demo 永久等待。/home/lingxufeng/bot/app/sdk/examples/lib/mux.mjs:103–109 的 open() 仅发送 WS open 帧便返回，不等待服务端确认或首个 snapshot；/home/lingxufeng/bot/app/sdk/examples/lib/client.mjs:19–27 没有补充就绪屏障。因此 /home/lingxufeng/bot/app/sdk/examples/min-client.mjs:23–41 可以在服务端完成 follow 初始化之前，通过独立 HTTP 连接发起并完成 prompt，两条连接之间没有处理顺序保证。
  已核对 npm 发布的 @deepseek-ai/dsh-api-session-controller@0.2.2-alpha.2，其 lib/index.js:2501–2535 在 await usingObservation 后生成 snapshot、设置事件 cursor 和 assistant ordinal cut，然后才输出后续增量；与 /home/lingxufeng/bot/repos/deepseek-harness/packages/api/session-controller/src/web/controller.ts:41–76 一致。快照内历史实际字段是 records，而非候选描述的 entries，见 /home/lingxufeng/bot/repos/deepseek-harness/packages/api/session-controller/src/history/controller.ts:213–226。被快照覆盖的 durable 事件不会再次发出，assistant 帧也会按 ordinal 去重，见 /home/lingxufeng/bot/repos/deepseek-harness/packages/api/session-controller/src/history/listener.ts:67–76 及 /home/lingxufeng/bot/repos/deepseek-harness/packages/api/session-controller/src/history/assistant-stream.ts:85–96。
  /home/lingxufeng/bot/app/sdk/examples/min-client.mjs:25–28 只识别顶层 event/turn-end，不处理 snapshot.records 或 assistantStream，:43 又无限等待 turnEnded。因此结束事件已进入 opening snapshot 时会挂住；只有文本 chunk 被基线吸收时，则可能在 :63–69 错误报告失败。使用真实、未修改的 min-client/client/mux 配合隔离的模拟 HTTP/WS，安排 HTTP prompt 先完成、WS 随后仅发送包含 turn/end 的 snapshot，进程在 2 秒超时后以 124 退出，验证了客户端等待行为；这是受控传输实验，不是实际 dsh 压测。实验文件均已删除。/home/lingxufeng/bot/app/sdk/tests/e2e/mock-demo.test.ts:46–59 也没有在超时后清理该客户端子进程。建议至少等到 opening snapshot 后再发 prompt，消除该 demo 的订阅建立竞态。
- **finder**: opus:跨文件深度

## 上轮未修

（无）

## 其他发现

其余 findings（PLAUSIBLE / minor / UNVERIFIED）。

### O1 · app/sdk/profile/plugins/handoff.mjs:21

- **severity**: minor（CONFIRMED）
- **summary**: writeFileSync mode 0o600 only applies at file creation; on a pre-existing launch-token/base-url with wider perms the new token is written without any chmod/fchmod, so the 0600 invariant is unenforced against pre-existing files in the persistent default home app/sdk/.dsh.
- **触发条件**: The default home (P2SDK_HOME unset → app/sdk/.dsh) persists across runs; if launch-token pre-exists as 0644 (restored from a backup/tarball, created by older tooling, or touched by the user), every later handoff write keeps 0644 while evidence D2 ⑤ keeps claiming 0600.
- **失败表现**: Credential file readable by any same-account process without the 0600 gate; on hosts with group/world-traversable home dirs (not this box — /home/lingxufeng is 750) other local users could read the live operator token. Defense-in-depth gap, not directly exploitable in the normal fresh-creation flow.
- **verifier 证据**: 存在条件性权限加固缺口。/home/lingxufeng/bot/app/sdk/src/start.ts:46 默认复用持久目录 .dsh，:169–176 启动时仅递归创建目录并传给子进程，没有清理既有交接文件或收紧其权限。/home/lingxufeng/bot/app/sdk/profile/plugins/handoff.mjs:21–22 使用 writeFileSync 的 mode: 0o600，但该参数仅影响新建文件，覆盖既有 0644 文件时不会修改权限。已在 mktemp 创建的 /dev/shm/mm-review-XXXX 目录中用合成 token 调用实际 apply 函数复现：预建 launch-token 和 base-url 为 0644，调用后 token 已更新、两文件权限仍为 0644，且输出 ready；实验目录已删除。因此 /home/lingxufeng/bot/app/sdk/evidence/D2.md:29 的 0600 断言不适用于既有宽权限文件。维持 minor：正常首次创建为 0600，风险还依赖既有文件权限被放宽及其他本地用户可遍历父目录；0600 本身也不能阻止同 UID 进程读取，候选中关于同账户进程的描述不成立。
- **finder**: glm:安全

### O2 · app/sdk/tests/e2e/mock-demo.test.ts:29

- **severity**: minor（CONFIRMED）
- **summary**: The test titled 'boots in a mkdtemp home with a 0600 launch token…' reads the file CONTENT into a variable named `mode` and asserts only `.not.toContain('token=')`; it never stats the permission bits, so the credential-permission invariant of acceptance ⑤ / evidence D2 is not actually verified.
- **触发条件**: Run the e2e suite after handoff.mjs drops or changes the mode option (e.g. writes 0644, or the pre-existing-file case above); the assertion still passes.
- **失败表现**: False green on a security acceptance criterion — a perms regression ships unnoticed, and the misleading variable name (`mode` holding content) hides the gap from later readers. One `statSync(...).mode & 0o777` assertion would close it.
- **verifier 证据**: 本次新增的 /home/lingxufeng/bot/app/sdk/tests/e2e/mock-demo.test.ts:26-30 虽以“0600 launch token”为测试名，但第 29 行 readFileSync 读取的是文件内容，第 30 行仅断言内容不含 'token='，没有检查权限位。调用链也没有补偿检查：/home/lingxufeng/bot/app/sdk/tests/support/runtime.ts:59-61 只读取 base-url、launch-token 并连接客户端；/home/lingxufeng/bot/app/sdk/src/start.ts:185-188 只根据 ready 行判定启动成功。因此，如果 /home/lingxufeng/bot/app/sdk/profile/plugins/handoff.mjs:21 的创建权限回归为 0644，只要令牌内容和连接行为不变，该测试的所有断言仍会通过，确实无法发现所声称覆盖的权限回归。当前该写入使用 0o600，不能据此认定新建文件已经泄露；确认的是新增测试的安全验收覆盖缺口，维持 minor。应添加 statSync(tokenPath).mode & 0o777 等于 0o600 的断言。
- **finder**: glm:安全

### O3 · /home/lingxufeng/bot/app/sdk/tests/e2e/mock-demo.test.ts:29

- **severity**: minor（CONFIRMED）
- **summary**: The test named "boots in a mkdtemp home with a 0600 launch token" never checks permission bits: it reads the launch-token file CONTENT into a variable misleadingly called `mode` and asserts `not.toContain('token=')` (a substring the bare token never contains), so the 0600 acceptance claim rests on a vacuous assertion — against CLAUDE.md 方法论「先有证据再宣布完成」and testing.md coverage requirements, while evidence/D2.md §⑤ presents 0600 as verified
- **触发条件**: Remove `{ mode: 0o600 }` from writeFileSync in app/sdk/profile/plugins/handoff.mjs:22 (file then created 0644 by umask) and rerun `pnpm -C app/sdk test`
- **失败表现**: The suite stays green and D2 evidence stays uncorrected while the launch token becomes group/world-readable, silently losing the only file-permission guarantee in the credential handoff; fix is statSync(join(rt.home,'launch-token')).mode & 0o777 === 0o600
- **verifier 证据**: 这是本次新增测试的真实覆盖缺口，而不是当前实现已泄露 token 的证据。/home/lingxufeng/bot/app/sdk/tests/e2e/mock-demo.test.ts:26-31 宣称验证 0600，但第 29 行读取的是文件内容，第 30 行只检查内容不含 token=，没有读取或断言权限位；/home/lingxufeng/bot/app/sdk/tests/support/runtime.ts:60-62 也只读取文件并连接客户端，没有权限守卫。/home/lingxufeng/bot/app/sdk/profile/plugins/handoff.mjs:21 当前确实指定 mode: 0o600，因此维持 minor。已在 /dev/shm/mm-review-XXXX 隔离目录使用该提交的插件和合成 token 做最小变异实验：umask=0022 时原实现生成 0600；仅删除 launch-token 写入的 mode 选项后生成 0644，但两者均通过现有的内容断言并打印 ready。实验目录已删除，未修改仓库，也未运行完整测试套件。/home/lingxufeng/bot/app/sdk/vitest.config.ts:10 的覆盖率范围仅包含 src/**，不能补足插件权限的验证；/home/lingxufeng/bot/app/sdk/evidence/D2.md:29 所述 0600 保证没有被该命名测试实际检验。应在测试中断言 statSync(tokenPath).mode & 0o777 等于 0o600。
- **finder**: glm:正确性+合规

### O4 · /home/lingxufeng/bot/app/sdk/examples/lib/mux.mjs:64

- **severity**: minor（CONFIRMED）
- **summary**: cancel() 只发送取消帧，没有结束本地迭代器或释放等待者。
- **触发条件**: 调用者正在等待 session/follow 的下一帧时调用 stream.cancel()。/home/lingxufeng/bot/app/sdk/examples/lib/mux.mjs:64-65 没有调用本地 _finish；上游 /home/lingxufeng/bot/repos/deepseek-harness/packages/api/gateway/src/stream-server.ts:284-291 对普通取消直接返回，不会再发送 end 或 error 帧。
- **失败表现**: 取消后 stream.done 仍为 false，已经等待的 next() 永远不兑现，使用 /home/lingxufeng/bot/app/sdk/examples/lib/client.mjs:28 消费该流的异步任务无法退出。实际复现确认 cancel 帧已经发出，但本地 next() 仍悬挂。
- **verifier 证据**: All code-level premises verified and mechanically reproduced. P1: app/sdk/examples/lib/mux.mjs:64-66 — cancel() only calls mux._send({type:'cancel'}); it never calls _finish() nor releases this.waiters; its only guard is !this.done which is false mid-stream. P2: mux.mjs:45-55 — next() parks on this.waiters when queue empty and !done; nothing in the class prevents a concurrent cancel() while a next() is pending. P3 (upstream sends no terminal frame on cancel): repos/deepseek-harness/packages/api/gateway/src/stream-server.ts:227-229 maps a client cancel frame to active.stop(new Error('Remote stream cancelled')) (a plain Error); repos/deepseek-harness/packages/typert/protocol/src/remote-error.ts:40-49 returns undefined for it (no isDSHRemoteError marker); stream-server.ts:284-291 then returns in the aborted branch without sending end or error. P4: _finish is reachable only via a server end/error frame (mux.mjs:82-96) or MuxSocket.close() (mux.mjs:112-115); MuxSocket has no ws 'close' handler (mux.mjs:79), so after cancel nothing ever settles a pending next(). Isolated repro in /dev/shm (cleaned up) against a byte-identical copy of MuxStream: pending next() + cancel() → cancel frame sent, stream.done stays false, promise unresolved after 100ms; only a subsequent _finish() resolved it to {done:true}. Introduced by this diff: git diff 927b514..8db50bf shows examples/lib/mux.mjs entirely new (+135). Mitigating context kept at minor: the diff's own callers do not hit the concurrent order today — min-client.mjs:24-44 returns from inside the for-await (iterator return() → cancel() at mux.mjs:57-60 runs with no pending waiter) and awaits turnEnded before stream.cancel() and client.close(); client.mjs:28 same-task break also exits safely. But mux.mjs is the exported reuse library for later tasks and follow(sessionId,{onFrame}) blocks indefinitely on a stream with no natural end, so cancel() invoked from another task (the natural stop path, e.g. a timeout) hangs the consumer permanently — the public cancel() API does not settle local iteration state.
- **finder**: sol:后端逻辑

### O5 · /home/lingxufeng/bot/app/sdk/examples/lib/mux.mjs:89

- **severity**: minor（CONFIRMED）
- **summary**: 已结束的逻辑流一直留在 streams 映射中，长连接重复订阅会持续占用内存。
- **触发条件**: 同一个 MuxSocket 多次打开并正常结束逻辑流，或者通过 for-await 提前退出订阅。/home/lingxufeng/bot/app/sdk/examples/lib/mux.mjs:107 每次向 streams 添加对象，但第 89-95 行处理终止帧以及第 57-65 行处理取消时均没有删除对应条目。
- **失败表现**: 只要客户端保持连接，历史流对象及其尚未消费的 queue 内容就无法被回收。实际复现连续结束 100 个流后，mux.streams.size 仍为 100；这会影响文件首行声明供后续任务复用的长生命周期客户端。
- **verifier 证据**: Code-trace plus live repro both confirm the leak; every premise holds. (1) mux.mjs:105-107 — open() mints a fresh randomUUID per call and this.streams.set(streamId, stream); no size cap or eviction exists anywhere in the file (grep shows `streams` used only at :73 new Map, :90/:92/:94 get, :107 set, :114 values — no .delete). (2) mux.mjs:89-95 — _receive dispatches item/error/end frames via streams.get(...)?._push/_finish; neither terminal branch removes the entry, and _finish (mux.mjs:33-40) only mutates the stream object itself. (3) mux.mjs:57-65 — iterator return()/cancel() only _send a cancel frame; no removal. (4) mux.mjs:112-115 — even close() finishes streams without clearing the map (moot once the socket dies). (5) No caller/type guard: the client mints its own streamIds (:105), so entries cannot be deduped away. (6) The trigger is designed usage, not hypothetical: client.mjs:21 (follow() → this.socket.open on the one shared socket per call) and the mux.mjs:1 header declaring the module "reused by later tasks" — a long-lived client is the stated intent. Live repro against a byte-identical copy of the file (ws stubbed, /dev/shm, cleaned up): after 100 normally-ended AND fully-drained streams, mux.streams.size === 100; early for-await exit + cancel leaves the entry present; a server 'error' terminal frame also leaves the entry present. Introduced by this diff: git log --diff-filter=A and the 927b514..8db50bf diff show mux.mjs is a new +135-line file in 8db50bf. Severity stays minor: current callers (min-client.mjs:23-45) open one stream per run then close the socket, so present-day impact is nil; impact is prospective growth on the long-lived client (~small object per ended stream, plus unconsumed queued frames in the early-exit/never-iterated case — for fully-drained streams the queue is empty and only the stream shell is retained, a slight overstatement in the original report that does not change the verdict). Fix is one line — this.streams.delete(msg.streamId) in the end/error branches of _receive (:91-95) — and safe, since consumers hold the stream reference returned by open() and drain through it, not through the map.
- **finder**: sol:后端逻辑

### O6 · /home/lingxufeng/bot/app/sdk/examples/lib/mux.mjs:55

- **severity**: minor（CONFIRMED）
- **summary**: 远端流错误是否抛出取决于消费者与错误帧的到达顺序，等待中的消费者会把错误误认为正常结束。
- **触发条件**: 消费者先调用 next() 并进入 /home/lingxufeng/bot/app/sdk/examples/lib/mux.mjs:55 的等待分支，随后服务端发来 error 帧，触发同文件:92 的 _finish(err)。同文件:36-38 将带 error 字段的结果直接 resolve 给等待者，而没有执行 :47-49 对队列元素所做的错误检查。
- **失败表现**: for await 收到 done:true 后直接正常退出，忽略额外的 error 字段，因此 /home/lingxufeng/bot/app/sdk/examples/lib/client.mjs:28-29 的回调式 follow() 会正常返回，而非拒绝 Promise。同样的错误若先于 next() 到达则会抛出，造成依赖时序的不一致错误语义。最小复现中，先 next() 再 _finish(error) 得到正常 resolve，反过来则得到 reject。
- **verifier 证据**: All preconditions verified in code and by experiment; both files introduced by this diff (+135/+53 lines, git diff 927b514..8db50bf).

  Precondition analysis (file:line → conclusion):
  - mux.mjs:43-56 (asyncIterator next): queue empty + not done → consumer parks at :55 (`this.waiters.push(resolve)`). No guard prevents this state.
  - mux.mjs:91-92 (_receive): `msg.type === 'error'` → `_finish(new MuxError(...))`. No filter or suppression; any error frame on an open stream routes here.
  - mux.mjs:33-40 (_finish): :36 builds `{value: undefined, done: true, error}`; :37-38 resolve the parked waiter with it. Never rejects. The throw check exists only on the queue-pop path mux.mjs:46-49 (`if (queued.error) throw queued.error`) — the waiter path bypasses it. Asymmetry confirmed.
  - Async-iteration protocol: a resolved result object's extra `error` property is invisible to `for await`; only a rejected next() promise propagates.
  - Consumers: client.mjs:27-29 (`for await (const frame of stream) onFrame(frame); return stream`) — on waiter-path error the loop exits normally and follow() resolves instead of rejecting. min-client.mjs:24-30 — turnEnded resolves false, :58-61 reports "no turn/end event", masking the real server error (gate still fails, so the demo does not false-pass).
  - Third ordering mux.mjs:51-52 (done set, queue drained, next()) throws `this.failure` — so identical server errors produce throw vs silent-normal-end purely by frame/consumer timing, exactly as claimed.

  Repro (in mktemp /dev/shm/mm-review-XXXX, deleted after): copy of MuxStream logic. (A) parked next() then _finish(err): next() RESOLVED with {done:true, error set}. (A2) same via for-await: loop exited normally, error swallowed. (B) _finish(err) before next(): next() THREW. (C) normal end via waiter unaffected.

  Diff attribution: git -C /home/lingxufeng/bot diff 927b514..8db50bf -- app/sdk/examples/lib/mux.mjs app/sdk/examples/lib/client.mjs → both all-insertions (135/53), introduced by this change.

  Severity minor (upheld): defect lives in demo examples/ client code, not runtime src/; the D2 acceptance gate still fails via a different check, so no false PASS — but error cause is masked and follow() callers never see the failure. Fix is one line: in _finish, reject-side handling for waiters (e.g. waiter({throw: err}) style or resolving a rejected promise) mirroring the :46-49 check.
- **finder**: sol:并发与数据完整性

### O7 · app/sdk/examples/lib/mux.mjs:71

- **severity**: minor（CONFIRMED）
- **summary**: MuxSocket handles 'open' and 'message' but not 'close', and only one 'error' via once(). When the socket drops, open MuxStreams are never _finish()ed and their iterators wait forever.
- **触发条件**: The dsh runtime crashes, is killed, or restarts while min-client (or a later task using examples/lib/client.mjs) is iterating a session/follow stream.
- **失败表现**: The client hangs forever instead of failing, so the D2 acceptance check gives no verdict. A second socket 'error' after the once-listener is used up is unhandled and crashes the process.
- **verifier 证据**: 该问题由本次新增代码引入。/home/lingxufeng/bot/app/sdk/examples/lib/mux.mjs:75-79 只订阅 open、一次 error 和 message，没有订阅底层 close；:89-94 只在收到协议级 error/end 时终结流，而 :112-114 的清理仅在调用者主动执行 MuxSocket.close() 时发生。因此运行时被杀或连接中断、未发送协议 end 时，:55 保存的 next() 等待者不会被唤醒。实际调用链可达：/home/lingxufeng/bot/app/sdk/examples/lib/client.mjs:19-28 返回该流或直接迭代它，没有超时或断线兜底；/home/lingxufeng/bot/app/sdk/examples/min-client.mjs:24-30 等待 turn/end，且 :43-45 要先等 turnEnded 才主动 close，无法补救断线。已在 /dev/shm/mm-review-XXXX 临时目录中用原模块源码替换为 EventEmitter 合成套接字复现：触发 close 后，next() 仍未完成、stream.done=false、保留一个 waiter，主动调用 mux.close() 后才完成；实验目录已删除。需要限定候选表述：确认的是流永久 pending，不能断言独立 min-client 进程必然永远存活，因为 Node 在没有活动句柄但顶层 await 未完成时可能以退出码 13 退出；无论哪种情况均无法走到预期验收输出。:77 的 once(error) 被消耗后，再次 emit error 会抛异常也经合成实验验证，但未证明真实 ws 连接会连续产生两次 error，因此不以该附带主张提升严重性。影响限于异常断线下的示例及复用客户端，维持 minor。
- **finder**: opus:跨文件深度

### O8 · app/sdk/src/start.ts:85

- **severity**: major（PLAUSIBLE）
- **summary**: childEnv spreads the launcher's entire process.env (`...env`) into the dsh child, so every credential present in the user's shell — not just P2SDK_LLM_API_KEY — is inherited by the LLM agent runtime and readable by its tools/plugins, against /home/lingxufeng/bot/CLAUDE.md 硬约束「凭证不进模型，也不进容器」
- **触发条件**: Run `pnpm -C app/sdk start` from a shell that has any secret exported (this machine's standard shell carries ANTHROPIC_AUTH_TOKEN / LiteLLM keys per the claude-kimi setup); the spawned dsh web runtime executes session tools and plugins (node-pty terminal, MCP client) whose subprocesses can read /proc/self/environ, e.g. a session tool printing $ANTHROPIC_AUTH_TOKEN
- **失败表现**: All shell credentials land inside the plugin-executing agent process, defeating the diff's own isolation posture (D2 §⑤ routes only the launch token via 0600 file and never prints the key); an allowlist env (PATH/HOME/P2SDK_*/DSH_*) would close it
- **verifier 证据**: 已确认 /home/lingxufeng/bot/app/sdk/src/start.ts:85 的 ...env 和 :180 的 childEnv(cfg, process.env) 会把启动 shell 的所有环境变量交给 dsh 主进程；但是，这不等于凭证必然进入模型或工具子进程，候选所举的直接读取 $ANTHROPIC_AUTH_TOKEN 或 /proc/self/environ 的路径存在过滤守卫。核对依赖版本 dsh-v0.2.2-alpha.2 的源码，/home/lingxufeng/bot/repos/deepseek-harness/packages/subprocess/subprocess/src/index.ts:47、:66–69 会过滤名称匹配 KEY|PASSWORD|SECRET|TOKEN 的环境变量，/home/lingxufeng/bot/repos/deepseek-harness/packages/subprocess/subprocess-local/src/spawn.ts:44–46 在启动工具子进程前调用该过滤函数；因此 ANTHROPIC_AUTH_TOKEN 不会仅因启动器的环境继承而出现在普通 shell 工具自身的环境中。该版本 /home/lingxufeng/bot/repos/deepseek-harness/packages/sandbox/sandbox-local/src/profiles.ts:17 的 bwrap 路径还使用独立 PID namespace 和 /proc，但 :30–35 的 Landlock 后备路径没有相同的 PID 隔离，故不能据此全面排除读取宿主进程环境的其他途径。目前 /home/lingxufeng/bot/app/sdk/node_modules 不存在，未完成钉版运行时从模型工具读取 dsh 主进程凭证的端到端验证。结论是环境过度继承属实，但候选主张的模型可见泄漏尚未证实；需要用虚构哨兵变量验证实际执行后端上的宿主进程环境读取路径，才能确认 major。上述上游行号均按 dsh-v0.2.2-alpha.2 标签核对，而非直接采用其当前 HEAD。
- **finder**: glm:正确性+合规

### O9 · app/sdk/examples/min-client.mjs:23

- **severity**: minor（PLAUSIBLE）
- **summary**: 发送 prompt 前没有等待 follow 的首个快照，跨 HTTP 与 WebSocket 的竞争可能漏掉回复事件。
- **触发条件**: WebSocket 的 open 帧已在本地发送，但服务端尚未建立 follow 订阅时，独立 HTTP 连接上的 session/prompt 已先处理并产生回复。/home/lingxufeng/bot/app/sdk/examples/lib/mux.mjs:103-109 的 open() 发送帧后立即返回，/home/lingxufeng/bot/app/sdk/examples/min-client.mjs:23-41 随即提交 prompt，没有等待服务端的 snapshot 作为订阅就绪屏障。
- **失败表现**: 上游 /home/lingxufeng/bot/repos/deepseek-harness/packages/api/session-controller/src/web/controller.ts:35-55 在订阅真正建立后才绑定实时 assistant 流并构建 snapshot；此前发生的回复可能只存在于 snapshot 的历史或 baseline 中。min-client 第 25-27 行忽略 snapshot，只接受后续增量事件，因此可能漏掉 text-delta 并误报失败，或者漏掉 turn/end 后在第 43 行永久等待。
- **verifier 证据**: Code-level mechanism fully confirmed, timing premise not. P1 (no barrier): app/sdk/examples/lib/mux.mjs:103-110 open() sends the 'open' frame and returns without waiting for any server frame; app/sdk/examples/lib/client.mjs:21-27 follow() returns the stream without consuming the first frame; app/sdk/examples/min-client.mjs:23 then 33-41 sends session/prompt immediately. P2 (pre-cut content is snapshot-only): repos/deepseek-harness/packages/api/gateway/src/stream-server.ts:212-217,239-257 dispatches 'open' synchronously on read; packages/api/session-controller/src/web/controller.ts:35-40 binds EventListener and AssistantStreamListener synchronously, :41-58 builds the opening from history and sets listener cursor (:53) and assistant ordinal cut (:57); packages/api/session-controller/src/history/listener.ts:67-69,112-116 drops events with seq < cursor+1 from increments; packages/api/session-controller/src/history/assistant-stream.ts:85-97 drops chunks with ordinal <= cut; controller.ts:75-76 yields snapshot then post-cut increments only. P3 (client ignores snapshot): min-client.mjs:25-27 resolves turnEnded only on an increment 'event' turn/end; :47-53,62-69 all assertions count only 'assistant-stream'/'event' frames — the snapshot frame (type 'snapshot', session-controller/src/types.ts:554-565) with its history and assistantStream baseline is never inspected; a pre-cut turn/end leaves the queue silent and mux.mjs:55 blocks the for-await forever (line 43 hang, no timeout anywhere in min-client.mjs; would also flake tests/e2e/mock-demo.test.ts:46-59 which spawns min-client with only a 120s vitest timeout). P4 (window reachable) NOT confirmed: the WS open frame is written strictly before the HTTP prompt (min-client.mjs:23→mux.mjs:108, then line 34), so the gateway binds listeners before the prompt is processed under normal scheduling; after binding, the window closes when usingObservation resolves (local SQLite observation, ms-scale), while the first text-delta requires a model call — mock mode paces each chunk at paceMs:25 (app/sdk/src/start.ts:113, ≥25ms; hang mode needs the whole ~150ms 6-chunk turn inside the ms window), real mode routes through LiteLLM with far higher latency. No hard guard exists (upstream comment on paceMs: 'correctness must never depend on it' — and min-client does lean on timing), so the premise is not code-blocked either; it stays theoretically open only under an event-loop stall of 150ms+ exactly inside a ms-scale window. All three files are new in 927b514..8db50bf (+263 lines, no deletions) — introduced by this change. Mechanism real, occurrence timing-dependent and heavily mitigated → PLAUSIBLE, severity downgraded major→minor: blast radius is a flaky/hanging examples client and its e2e, not a product defect; a one-line fix (consume the first snapshot frame before sending the prompt, or read the baseline out of it) closes it.
- **finder**: sol:后端逻辑

## 超出预算未验证

- app/sdk/tests/support/runtime.ts:59 · minor · glm:安全 · launchRuntime's ready-poll loop falls through when the deadline passes while the child is still alive, and readFileSync(base-url) at line 59 then throws before `rt` is ever assigned, so afterAll's `rt?.stop()` no-ops and the spawned start.mjs→dsh process tree is left running orphaned with a live launch token.
- app/sdk/tests/support/runtime.ts:59 · minor · glm:正确性+合规 · launchRuntime's poll loop (line 53) exits at the deadline without throwing when the ready line never arrived, then falls through to readFileSync(join(home,'base-url')) which throws ENOENT because handoff has not written the files yet — and since the error propagates out of beforeAll, `rt` is never assigned so afterAll's rt?.stop() is a no-op and the spawned start.mjs→dsh process tree is never killed.
- app/sdk/src/start.ts:49 · minor · glm:正确性+合规 · resolveConfig applies Number() to env strings without validating the result: an exported-but-empty P2SDK_READY_TIMEOUT_MS yields 0 ('' is not nullish, Number('')===0) so the setTimeout at line 204 fires immediately and kills a healthy booting runtime, and a non-numeric P2SDK_PORT (line 47) yields NaN passed to dsh as literal `--port NaN` — an input-validation gap at the env boundary (coding-style rule: "Validate all user input at system boundaries").
- app/sdk/tests/unit/start.test.ts:178 · minor · glm:正确性+合规 · The 'main exits 1 before spawning' test deletes process.env.P2SDK_PROVIDER unconditionally (line 178) but saves/restores only the keys listed in the local `env` object (just P2SDK_LLM_API_KEY, via `previous` at line 174), so P2SDK_PROVIDER's prior value is permanently dropped from the vitest worker's environment.
- app/sdk/src/start.ts:95 · minor · opus:跨文件深度 · fileUrl() builds `file://${p}` by string concatenation instead of url.pathToFileURL. writeRuntimePatch also puts PKG_ROOT and cfg.home inside single-quoted YAML scalars without escaping.
- app/sdk/src/start.ts:85 · minor · opus:跨文件深度 · childEnv spreads the full parent env, so P2SDK_LLM_API_KEY reaches the dsh child even in mock mode. The unit test 'never carries the key or derived secrets' only passes because it uses an empty base env `{}`.

## 已被否定

（无）

## 统计

| 项 | 值 |
|---|---|
| finders | 5 |
| candidates | 24 |
| verified | 15 |
| refuted | 0 |
| dupes | 3 |
| overBudget | 6 |
