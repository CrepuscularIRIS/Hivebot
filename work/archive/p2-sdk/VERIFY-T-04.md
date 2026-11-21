verdict: PASS
commit: f990d8e6b22258f25d811d3c3038f46feea98921（worktree /tmp/bot-wt/T-04，feat/T-04）
验收日期：2026-11-01 15:00 前后（date 实测 14:58–15:01）

## 验收项（PLAN T-04 行 + BRIEF §6 D3）

| 验收项 | 结果 | 证据 |
|---|---|---|
| 断言 D3 原文全部内容，文件头注释映射真实 | PASS | BRIEF.md:66 D3 原文 8 个分句与 concurrency.test.ts:3-23 注释逐句核对一致，且测试体确有对应断言（逐句对照见下节）；非只写注释不写断言 |
| 屏障 5s 超时判 FAIL（A-LOW） | PASS | waitAllEntered deadline 5000ms 到点 throw `barrier FAIL: after 5000ms`（test:64-72）；waitForDelta/waitForTurnEnd 默认 5000ms（harness.ts:160,170） |
| 3 个 session 共用 1 条 mux socket、各开一路 follow | PASS | 同一 `rt.client.socket`，`socket.streams.size` 增 3、3 个不同 streamId（test:95-99）；MuxSocket.streams Map + randomUUID streamId（mux.mjs:88,133-135） |
| sessionId=X 的流里只有 X 的标记 | PASS | turnEnd 前 text-delta 精确拼接 `toBe(自己剧本全文)` + `toContain(自己 marker)` + `not.toContain(另两个 marker)`（test:132-140） |
| 复用 T-02 harness 与 T-01⑧ gate 通道 | PASS | import 全部来自 tests/support/fake/harness.ts（T-02）；gate 文件 `$P2SDK_HOME/gates/<id>` 跨进程放行（runtime.ts:69-71、plugin.mjs:123） |
| 单 runtime 多 session | PASS | 一个 launchFakeRuntime + 3 次 createSession，断言 3 个不同 id（test:87-89） |
| 干净复跑：单跑 3 次 + 全量 | PASS | 单跑 3 次全绿（我实跑两轮共 6 次）；全量 5 files / 34 tests 全绿 12.4-12.5s；evidence/t04-verify-rerun.txt（含命令与输出）；跑前跑后 worktree `git status` 干净 |
| 区域检查：diff 只含 tests/e2e/concurrency.test.ts | PASS | `git show --stat f990d8e` 仅 app/sdk/tests/e2e/concurrency.test.ts +153 行 |

## D3 原文逐句对照（真实性核对，非转述）

| D3 分句（BRIEF.md:66） | 测试落点 |
|---|---|
| 3 个 session 同时发不同的 prompt | 3 个 distinct id（:89）+ 3 个 pairwise 不同 prompt（:110）+ Promise.all 同时发（:111） |
| 只用离线测试验证 | 哨兵 key 不进 runtime 子进程：/proc/pid/environ 逐 KEY_VARS 断言 absent（:79-84） |
| 必须走真实 dsh 调用路径 | T-01 launcher 起真实 dsh runtime，客户端走 /api/remote.mux（client.mjs:4,50）；fake 是 dsh 内注册的 LLM adapter（plugin.mjs:140） |
| fake 先挂起，直到 3 个请求都进入执行再放行 | gateAfterChunk=1 首块后挂起（plugin.mjs:122-123）；requests.jsonl 在 stream() 入口、gate 之前记录（plugin.mjs:104-116），所以「已进入执行」可轮询到；waitAllEntered 齐 3 条才 release（test:63-76,125） |
| 断言任何一个回合结束之前 3 个请求都已进入执行 | 放行前 3 条流均无 turn/end（:121-123）；fake 挂在 chunk1 之后，后续 chunk/turn:end 不可能已在途，回执 waitForDelta 已证投递通（:118） |
| 每个 prompt 带唯一标记，fake 原样回显 | prompt 含 marker（:59），剧本首段即 marker 且逐段回显（:54-56），请求侧 userTexts 含 marker（:146） |
| sessionId=X 的流里 assistant 内容只含 X 的标记 | 精确全文拼接 + 自己 marker in + 外 marker not-in（:132-140） |
| 证伪：任一断言失败 | 全部以 expect / 5s throw 落地，任一红即文件 FAIL |

## 红路径推演（未改代码，逻辑推演 + builder 红证据采信条件）

1. **fake 不挂 gate**（gateAfterChunk 失效或 waitForGate 立即返回）：每轮约 5 chunk × 10ms ≈ 50-100ms 跑完，:121-123「放行前无 turn/end」会在任一 lane 提前结束时 FAIL（`must not end before the barrier releases`）。存在极窄竞态（检查跑赢投递），由 builder 红证据 B（gate 永不放行 → waitForTurnEnd 5s 超时 FAIL，证明 fake 真挂起）互补覆盖。
2. **输出侧串线**（lane i 混入 j 的帧）：:134 精确拼接失败（混入外 delta，或 turnEndIndex 被 j 的 turn/end 抢先 → 只拼出前缀）；:139 外 marker not.toContain 直接红。整条 lane 一致换剧本（builder 红证据 A）→ :118 waitForDelta 等不到自己首块，5s 超时 FAIL。
3. **请求侧串线**（i 的 prompt 进 j 的调用）：waitAllEntered 要求 `r.sessionId === ids[i] && userTexts 含 i 的 marker`，凑不齐 3 条 → `barrier FAIL: after 5000ms`；或凑齐但 :146 FAIL。换剧本、串输出、串请求三类破坏都有必挂断言。

## 其他

- 全量跑 stderr 出现一行 `p2sdk: no ready line within 1ms`：来自 T-01.f2 launcher 负例用例的故意 1ms 超时，34/34 全绿，非本任务范围，不立 FIX。
- 无 UI，无截图项。负载检查：跑前 load 4.72 / iowait 0 / CPU idle 78%，测试全部串行（单跑逐次、全量单次）。

新问题：无。
