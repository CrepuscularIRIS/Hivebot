verdict: PASS
commit: 514000559dd590c5ad2741fceadc48a13d6659c5

验收环境：worktree /tmp/bot-wt/T-01.f1（分支 feat/T-01.f1，工作区干净），pnpm exec vitest v5.0.5，串行 `--no-file-parallelism`（GPU 训练中；30 核 load≈5.5、iowait≈0）。跑前核对 `git rev-parse HEAD` = 5140005 与派发一致。测试语义逐条比对过 builder 的 tests/e2e/mux-disconnect.test.ts 原文，与 PLAN §2.5 T-01.f1 ①–⑤一致（①的真实 dsh 用 `pgrep -P` 找 PID 后 SIGKILL，race 5s 判挂起、'ended-normally' 判静默；符合不用 pkill -f 的约束）。

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| ① 杀真实 dsh mid-stream → for-await 以连接错误退出（非挂起非 exit 0） | PASS | vitest `tests/e2e/mux-disconnect.test.ts > for-await rejects with a connection error when dsh is killed mid-stream` ✓（evidence/T-01.f1-mux-disconnect-verbose.txt）。**亲跑**（非 builder 测试）：evidence/T-01.f1-hands-on.mjs——真实 start.mjs+mock runtime，session/prompt 后等到**首个 chunk 到达客户端**（frames=11）再 SIGKILL dsh 1424479，for-await 在 22ms 内 reject `MuxError: websocket closed`；脚本对 'ended-normally'（静默）和 8s 超时（挂起）都判 FAIL，均未触发（evidence/T-01.f1-hands-on.out，exit=0） |
| ② close 后 open() 立即抛错 | PASS | vitest `open() on a closed socket rejects with MuxError` ✓。亲跑同脚本：`client.close()` 后 `socket.open('session/follow',{})` 立即抛 `MuxError: mux socket is not open`（同 .out 文件） |
| ③ cancel() 后挂起的 next() 以 done 结束 | PASS | vitest `cancel() ends a parked next() with done`：parked next() 30ms 后 `stream.cancel()` → resolve `{value:undefined,done:true}`（evidence/T-01.f1-mux-disconnect-verbose.txt） |
| ④ 100 个正常结束流后 streams.size===0 | PASS | vitest `100 ended streams leave streams.size at 0`：100 流各收 end 帧、drain 后 `mux.streams.size === 0`（`_finish` 内 `streams.delete`）（同上 verbose 文件） |
| ⑤ 等待者收到 error 帧 → next() reject | PASS | vitest `a parked next() rejects when an error frame arrives`：parked next() 收 `{type:'error'}` 帧 → rejects MuxError（waiter 路径不再吞 error 字段，同上） |
| 干净复跑全套 29/29 | PASS | `pnpm -C /tmp/bot-wt/T-01.f1/app/sdk exec vitest run --no-file-parallelism` → Test Files 3 passed (3), Tests 29 passed (29)，Duration 5.51s（24 旧 + 5 新；我在 worktree 亲跑，非转贴 builder 输出） |
| 区域检查 | PASS | `git -C /tmp/bot-wt/T-01.f1 diff --name-only main..HEAD` → 仅 `app/sdk/examples/lib/mux.mjs`、`app/sdk/tests/e2e/mux-disconnect.test.ts`；`git diff main..HEAD --stat -- tests/e2e/mock-demo.test.ts` 为空（未动） |
| 回归：mock-demo 六条 e2e 未动仍绿（真实 runtime） | PASS | `vitest run --no-file-parallelism tests/e2e/mock-demo.test.ts --reporter=verbose` → 6 passed（含 min-client 自断言、真 spawn start.mjs→dsh 的用例）（evidence/T-01.f1-mock-demo-regression.txt） |

**修复对照 REVIEW-T-01.md**（读改后 mux.mjs diff 逐条核对）：
- R2+R3+O7（无 ws 'close' 处理 → 流永久挂起；死 socket open() 静默丢帧）：`ws.on('error')`+`ws.on('close')` → `_onDead`（幂等，`closed` 标志）对全部逻辑流 `_finish(MuxError)`；`open()` 在 `await ready` 后查 `readyState!==OPEN` 抛错；`_send` 非 OPEN 抛错。error 监听从 `once` 改 `on`（R2 的二次 error 崩溃路径也消除）。①②+坏路径 B 覆盖。
- O4（cancel 不收尾本地）：`cancel()` 发帧后本地 `_finish()`。③覆盖。
- O5（ended 流滞留 map）：`_finish` 里 `streams.delete(streamId)`。④覆盖。
- O6（waiter 路径吞错、时序不对称）：waiter 回调按 `settled.error` reject，全部 waiter 一起结算；queue 路径 throw 保留。⑤覆盖。
- 实现细节核过：`_finish` 幂等（`if(this.done) return`，cancel 后服务端补发终止帧不二次结算）；客户端主动 `close()` 的流以正常 done 收尾（非错误），与②语义一致；`_onDead` 迭代 `Map.values()` 中 delete 符合 JS Map 规范。

**额外坏路径**（自选，与 R3/O6 最相关，evidence/T-01.f1-badpath.mjs/.out，BADPATH PASS）：
- A. error 帧先到、消费者后到（queue 路径）：next() 抛 `MuxError: {"code":"Q"}`——与 waiter 路径语义一致，O6 修复后两条路径不再分叉。
- B. 服务端断开后再 `open()`：抛 `MuxError: mux socket is not open`，不再返回永不响应的死流（R3 P4 场景）。

无 UI，无截图需求。亲跑进程已清理（killDsh 后 start.mjs 父进程 SIGTERM/SIGKILL 兜底；残留检查确认无本人遗留进程；ps 中 T-01.f2 的进程属并行任务，未触碰）。

新问题（每条一行，可直接成为修复任务）：
- [FIX] 测试①用固定 `sleep(150)` 假定服务端已接受 follow 的 open 帧，未像 in-process 用例那样确认（真实 runtime 下足够但不严谨） | 复现：mock-demo.test.ts:55 的 launchRuntime 换高负载启动后跑 mux-disconnect ① | 疑似位置：app/sdk/tests/e2e/mux-disconnect.test.ts:81 | 严重度 LOW（实测 235ms 通过；不影响本次判定）
