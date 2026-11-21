# REPORT-P5-07 · W1-AP-q ledger 按事件类别判别

- 时间：2026-11-03 02:21（date 实测）
- 分支：`feat/P5-07`（worktree `/tmp/bot-wt/P5-07`，基于 main@9c89e64）
- Commit：`b839f6a`（fix(p5)，6 文件，+201/−34）
- 改动文件：
  - `app/ui/main/dsh/ledger.ts` — `EventsItem` waterfall 拆 approval/question 两型；`LedgerEntry` 改为按 `event` 判别的联合（提问条目无 toolName/callId）；`record` 只入账两类，其他 waterfall 记 warn（构造器可选 `warn`，默认 console.warn；main 走共享 `m1Ledger` 无需改接线）；新增 `pendingEventKind()`；`validateResult` 对提问条目拒
  - `app/ui/main/m1-api/index.ts` — `$events/result` 分支：提问 eventId 传 `allowed-once`/`rejected` → `pbots/invalid-args`（参数错，先于 clientId/eventId 资格判定）
  - `app/ui/main/m2-mux/deadline.ts` — `answer(entry)` 按类别分支：审批 `{kind:'result', value:'rejected'}`（原行为）；提问 `{kind:'rejected', error:QUESTION_DEADLINE_REJECTION}`（name/message/code，上游 parseRemoteEventRejection 可解析，GW index.ts:708-762 会以异常收场 Host waterfall）
  - 测试：`tests/unit/shell/ledger.test.ts`（①×3）、`tests/unit/m1/api.test.ts`（②×2，it.each）、`tests/unit/m2/deadline.test.ts`（③×1）
- 未动 `m2-mux/index.ts`：PLAN 涉及文件含它，但 `asEventsItem` 只验 `type`、tap 只转交，判别集中在 `ledger.record` 单点（更小 diff）；`testAnswerEvent` 保持审批专用。renderer 不动（store.ts:139 本就只认 `approval/request`，提问卡 = P5-33）。
- 验收对照（PLAN P5-07 ①②③④）：
  - ① 提问 waterfall 入账 `event === 'user-questions/request'`、无 `toolName` 字段；未知 event 不入账 + warn 恰 1 次 —— `shell/ledger.test.ts` 新 describe，先红后绿
  - ② 提问 eventId 传 `'allowed-once'`/`'rejected'` → `pbots/invalid-args`、dsh 计数 0、不下账；同 ledger 审批 eventId 原行为不变 —— `m1/api.test.ts` 新 it.each
  - ③ 假时钟：审批+提问各一条未决、无端口挂载满 deadline → 审批收 `{kind:'result',value:'rejected'}` 恰 1 次，提问收 `{kind:'rejected'}` 恰 1 次、`{kind:'result'}` 0 次（并断言 error.name/message 形状合法）—— `m2/deadline.test.ts` 新 describe
  - ④ app/ui 全量绿
- 测试命令与结果：
  - `pnpm build` → `✓ built in 1.13s`
  - `./node_modules/.bin/vitest run` → `Test Files 27 passed (27) / Tests 230 passed (230)`
  - `pnpm test:e2e` → `54 passed (5.1m)`，含 `d4-deadline.spec.ts`、`m2-deadline.spec.ts` ②③ 与宽限用例
- 复测注意：新 worktree 需 `app/ui` 与 `app/sdk` 各跑一次 `pnpm setup`，否则 `m3/ensure.test.ts` 因 `app/sdk/node_modules` 缺失而红（环境问题，非代码）。
- 未完成项 / 新发现：无范围遗留。备注一条：`testAnswerEvent`（m2-mux 测试钩子）签名仍是审批二值，P5-28 若要 e2e 提问作答需另开注入通道或扩签名——留给派发者决定是否加任务。

待 verifier 验收。
