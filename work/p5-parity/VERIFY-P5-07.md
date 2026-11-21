verdict: PASS
commit: b839f6a（feat/P5-07 @ /tmp/bot-wt/P5-07，基 9c89e64；验收时 HEAD 与申报一致，worktree 干净）

独立复跑（HOME=/tmp/bot-vfy-p507，不信任 builder 输出，全部自跑）：
- `pnpm build` → `✓ built in 1.11s`
- `./node_modules/.bin/vitest run` → `Test Files 27 passed (27) / Tests 230 passed (230)`（与期望 27/230 一致）
- `pnpm test:e2e`（Xvfb）→ `54 passed (5.7m)`（与期望 54 一致，含 m2-deadline.spec ②③、d4-deadline、D9 全集）
- 证据：`evidence/P5-07/{rerun-and-redline.txt, e2e-full.log, changed-files.txt}`

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| ① 单测三条：提问 waterfall → pendingEvents `event==='user-questions/request'` 且无 toolName；未知 event 不入账；审批原行为不变 | PASS | `tests/unit/shell/ledger.test.ts` 新 describe「P5-07 按事件类别判别」三条：断言 `'toolName' in question === false`、`'callId' in question === false`（无 toolName 字段）；未知 event `api-session/error` → `pendingEvents()` 空 + warn 恰 1 次（含事件名与 eventId）+ cancel 幂等；审批条目 event 标注与 validateResult 原行为断言不变。vitest 230 全量绿 |
| ② 提问 eventId 调 `$events/result` 传 'allowed-once' → `pbots/invalid-args` 且 dsh 计数===0；审批 eventId 照旧（D9 拒绝全集照跑） | PASS | `tests/unit/m1/api.test.ts` it.each(['allowed-once','rejected'])：断言 code `pbots/invalid-args`、`dsh.apiCount === 0`、条目不下账；同 ledger 审批 eventId `allowed-once` 照旧放行（apiCount 1）。D9 硬拒层 describe 原样保留（api.test.ts:89），在全量 230 内跑绿。实现：m1-api/index.ts checkArgs 在资格判定前先 `pendingEventKind(eventId)==='user-questions/request'` → invalid（invalid helper 即 `pbots/invalid-args`，index.ts:58） |
| ③ 假时钟双未决：审批到期收字符串 'rejected' 恰 1 次；提问到期收 {kind:'rejected'} 恰 1 次、{kind:'result'} 0 次 | PASS | `tests/unit/m2/deadline.test.ts` 新 describe：setup 默认 `mounted:false`（无端口挂载）+ 假时钟，审批+提问同时到期 → `outcomeOf('ev-approval')` toEqual `{kind:'result',value:'rejected'}`；提问 `q.kind==='rejected'`、`q.value===undefined`（绝无字符串值）；error.name 非空 string + message string（上游 parseRemoteEventRejection 形状）；advance(10_000)+review 后 calls 仍 2、stats.answers===2（恰 1 次）；两条都下账。协议形状对照上游 `repos/deepseek-harness/packages/api/gateway/src/stream-protocol.ts:91-94`（outcome 三型）+ `:349-357`（name 非空+message，可选 code）——`QUESTION_DEADLINE_REJECTION = {name:'PbotsQuestionDeadline', message:…, code:'pbots/deadline'}` 合法 |
| ④ 区域：diff 仅 ledger.ts、m1-api/index.ts、deadline.ts + 三处单测（m2-mux/index.ts 不动）；判别单点在 ledger.record | PASS | `git diff 9c89e64..b839f6a --name-only` 恰 6 文件（changed-files.txt），`m2-mux/index.ts` 与 renderer 均未动；入账判别单点在 `ledger.record`（两类 waterfall 之外记 warn 并 return），m1-api/deadline 只消费已判别的 `entry.event`，不重复解析 waterfall |
| ⑤ 红基线：摘掉 deadline.ts 判别（提问改走字符串 'rejected'）对应单测必须红，恢复绿 | PASS | 实测（rerun-and-redline.txt）：python 精确替换掉三元判别 → `vitest run tests/unit/m2/deadline.test.ts` → `1 failed | 7 passed`，失败点 deadline.test.ts:255 `expect(q.kind).toBe('rejected')`（提问 outcome 退化为 {kind:'result'}）；`git checkout --` 恢复 → `8 passed`，worktree CLEAN |

补充核对：
- 上游 `projectRemoteEventRequest`（stream-protocol.ts:144-171）证实提问 request 投影后保留 questions/wait、移除 agent/signal、无 toolName——ledger 对提问不读 request.toolName 的设计与上游一致。
- builder 环境注属实：新 worktree 不跑 `pnpm -C app/sdk setup` 时 m3/ensure.test.ts 会因缺 `app/sdk/node_modules` 误红；本 worktree 依赖已在，未复现该红，230 全绿。
- 本任务无 UI 改动（renderer 零 diff），无浏览器截图项。

新问题（每条一行，可直接成为修复任务）：
- [FOLLOW-UP] testAnswerEvent（m2-mux/index.ts:66,354-356 测试钩子）签名二值 `'allowed-once'|'rejected'` 且实现硬编码 `outcome:{kind:'result',value}`，无法模拟提问作答 | 复现：读 m2-mux/index.ts:354 并在 e2e 中尝试对提问 eventId 发结构化 answers | 疑似位置：app/ui/main/m2-mux/index.ts | 严重度：低（归属 P5-28 前置：其验收若含 e2e 提问作答，需扩签名或另开注入通道；builder 发现属实，已核实）
