# P5-28.f1 交付报告（双席 review 四发现修复，第 1 轮）

- 分支：`feat/P5-28f1`（worktree `/tmp/bot-wt/P5-28f1`，基 423939c）；commit **01d5190**。
- 改动文件（7）：
  - `app/ui/main/m1-api/index.ts`（F1 在途守卫）
  - `app/ui/main/dsh/ledger.ts`（F2 稀疏槽 + S2 监督入账）
  - `app/ui/main/m2-mux/index.ts`（S1 testAnswerEvent 门控，类型改可选）
  - `app/ui/tests/unit/m1/api.test.ts`（F1×4 + F2×1 + S1×2 新测试）
  - `app/ui/tests/unit/shell/ledger.test.ts`（F2 矩阵 2 行 + S2 重写 1 条 + S2 闭环 1 条）
  - `app/ui/tests/e2e/questions-answer.spec.ts`（q3 注入经 PBOTS_TEST_HOOKS=1 门控安装路径）
  - `app/ui/scripts/run-e2e.sh`（**白名单外 1 行**：`export PBOTS_TEST_HOOKS=1`，见 §5）

## 1. TDD 证据（先红后绿，真实退出码）

命令（worktree `app/ui` 下；node_modules 从主仓符号链接，同 commit 基）：

```sh
TMPDIR=/tmp/bot-p528f1-tmp XDG_CACHE_HOME=/tmp/bot-p528f1-tmp/cache \
  node node_modules/vitest/vitest.mjs run tests/unit/m1/api.test.ts tests/unit/shell/ledger.test.ts
```

- 基线（未改产品代码）：**82 passed / exit 0**。
- RED（仅加测试，产品代码未动）：**7 failed | 85 passed / exit 1**，四条全落红——
  - F1：`并发二答（审批）…`、`并发二答（提问 answers…）`（20s 超时——旧代码第二调用也上 wire、deferred rpc 永不 resolve，即 review 所述「两份均放行」的复现形态）
  - F2：`invalidQuestionAnswersReason > F2 selected 稀疏槽（holes）→ 返回原因`、`F2：稀疏 selected（structuredClone 保留洞）→ pbots/invalid-args`（实际 ok:true）
  - S1：`生产环境（NODE_ENV=production、无 PBOTS_TEST_HOOKS）→ 钩子不安装`（实际已安装）
  - S2：`S2：questions … → 仍入账（questionIds 缺席）…`、`S2 闭环：空串 id 批次越 deadline → 协议级 rejected`（实际不入账、rpc=0、事件挂起）
- GREEN（四条修后）：定向两文件 **92 passed / exit 0**；随后 app/ui **全量 unit 45 文件 / 557 tests / exit 0**（547 基线零回归，净增 10 条）。
  - 全量首跑曾有 4 个文件失败（grok-shim×3、m3/ensure），均为 worktree 缺 `renderer-grok/node_modules`、`app/sdk/node_modules` 的**环境性解析失败**（`Cannot find package 'react'` / `lstat …/app/sdk/node_modules`），补符号链接后该 4 文件 **42 passed / exit 0**，再全量一次 45 文件 557 全绿。与本次改动无关（这些测试不 import 被改模块）。

## 2. 四条修法与取舍

### F1 并发双答（correctness CONFIRMED）
- 修法：`registerM1Api` 闭包内 per-eventId 在途集；`$events/result` 通过 checkArgs 后、上 wire 前查/记，rpc settle（`finally`，含 throw 路径）即解除。第二份本地拒，**不双上 wire**。
- 错误码选 `pbots/forbidden`（非 invalid-args、非新码）：这是「该事件此刻不可由你作答」的**资格/状态**问题，与既有 clientId mismatch / eventId not pending 同族（U-15 ③ 联调口径：资格问题=forbidden）；新增 `pbots/conflict` 属契约错误码增行，需过契约问题，不值得。message 明写 "already in flight"，可区分、可重试。
- 覆盖：审批与提问两分支同守卫（review 指出这是共享发送器的既有空窗，root-cause 一处修）；失败 settle 解除守卫（R10 重试不变）；不同 eventId 并发互不阻塞（各 4 条测试）。

### F2 稀疏 selected（correctness CONFIRMED）
- 修法：`invalidQuestionAnswersReason` 中 selected 由 `every`（跳洞）改为**逐槽 `j in selected` 存在性 + typeof 判定**，洞即拒（消息 `dense string[] (sparse holes rejected)`）。
- answers 与 selected 同规则审查结论：answers 数组的洞**已被既有 `answers.entries()` 覆盖**——数组迭代器逐下标取值、洞为 undefined → `answers[i] must be an object` 即拒（实测 entries 访问洞；review 探针 `new Array(2)` 本就在拒绝格）。补了两行矩阵锁定（selected 稀疏 RED→GREEN；answers 稀疏 lock-in 恒绿）。
- 不用 `Object.keys(selected).length !== selected.length`：带额外自有属性的合法数组会被误拒。

### S1 生产测试钩子（security CONFIRMED）
- 修法：`registerM2Mux` 中 `installTestHooks = process.env.PBOTS_TEST_HOOKS === '1'`，仅此时把 `testAnswerEvent` 挂上 handler（`globalThis.__pbotsM2` 同体）；生产（含 NODE_ENV=production、无 opt-in）**不安装**，断言见 `api.test.ts` S1 describe（含「stats/ledger/testDropSocket 仍在」的观测面回归守卫）。`M2Handler.testAnswerEvent` 类型改可选。
- **门控机制依据**：仓内 main 无现成生产/测试判别——`NODE_ENV` 在 main 全程无人设/读（grep 证实）、无 electron-builder 等打包目标（`app.isPackaged` 恒 false，用作门控即死代码）、`import.meta.env` 在 main 未用过且不 build 无法实证。故取**显式 opt-in**（fail-closed）：生产默认无钩子，测试显式开。`testDropSocket`/stats/ledger 非作答旁路（断链注入与观测面，多个 e2e 依赖），不门控。
- e2e 接线：`questions-answer.spec.ts` 的 launchShell env 加 `PBOTS_TEST_HOOKS: '1'`（q3 注入改走门控安装路径）；`run-e2e.sh` 顶部统一 export 覆盖同样使用该钩子的 `m2-port.spec.ts` / `m2-deadline.spec.ts`（见 §5）。

### S2 非法问题批次挂起（security CONFIRMED）
- **取舍：保留监督记录直到协议拒绝完成**（review 给出的二选一之 A）。
  - 理由：deadline（`createApprovalDeadline`）已具备观察窗口、renderer 在场宽限、rpc 失败重试、幂等下账全套机制，且 P5-07 起提问事件到期就是发协议级 `{kind:'rejected'}`——监督入账后非法批次自动获得与合法批次**完全相同**的拒绝闭环，零新机制。选项 B（接收时立即 rejected）需自建失败处理（rpc 失败的保留/重试）且剥夺在场 renderer 的宽限窗口，diff 更大、语义更怪。
- 修法：`LedgerEntry` 提问条目 `questionIds` 改可选；`record()` 对 `questionIdsOf` 返回 undefined 的批次**仍入账**（warn 一次），`questionIds()` 对这些事件返回 undefined → M1 作答落审批字符串分支拒（invalid-args，无法以 result 放行）；deadline 到期经 main 合法 client 发 `{kind:'rejected', error: QUESTION_DEADLINE_REJECTION}`，ok 后 `record({type:'cancel'})` 下账。
- 闭环测试：假时钟越 deadline，空串 id 批次 → rpc 恰 1 次、outcome 非 result、下账、不挂起（ledger.test.ts `S2 闭环`）。原「不入账」断言测试按新语义重写（该测试此前锁定的正是 review 指出的缺陷行为）。

## 3. 自测汇总

| 项 | 结果 |
|---|---|
| 基线（两定向文件） | 82 passed / exit 0 |
| RED（四条，未修产品码） | 7 failed \| 85 passed / exit 1 |
| GREEN 定向（m1/api + shell/ledger） | 92 passed / exit 0 |
| app/ui 全量 unit（隔离 TMPDIR=/tmp/bot-p528f1-tmp） | 45 文件 / 557 tests / exit 0（547 基线零回归） |
| e2e | **未跑**（load 8~9，GPU 训练在跑）；questions-answer 与全量 e2e 留 verifier |

复跑（主仓依赖；worktree 的 node_modules 为指向主仓的符号链接：app/ui、app/ui/renderer-grok、app/sdk 三处）：
```sh
cd /tmp/bot-wt/P5-28f1/app/ui
TMPDIR=/tmp/bot-p528f1-tmp XDG_CACHE_HOME=/tmp/bot-p528f1-tmp/cache \
  node /home/lingxufeng/bot/app/ui/node_modules/vitest/vitest.mjs run
```

## 4. 边界遵守

- 未动 P5-07 审批语义（deadline 审批代答分支原样）；未建新模块/依赖；未改 dsh/上游；review REFUTED 项未重开。
- 硬约束：未重启/注销；无 pkill（无任何手工 kill，测试只跑 vitest）；未读凭证目录；TMPDIR/XDG_CACHE_HOME 隔离；未 stash；未 merge/push；未写 work/LOG.md。

## 5. 白名单偏差（1 处，供裁量）

`app/ui/scripts/run-e2e.sh` +1 行 `export PBOTS_TEST_HOOKS=1`。原因：除 questions-answer 外，`m2-port.spec.ts`（2 处）与 `m2-deadline.spec.ts`（1 处）也经 `__pbotsM2.testAnswerEvent` 注入审批作答——不在此统一 opt-in，S1 门控会让这三个 e2e 在 verifier 全量 e2e 时 TypeError。备选（逐 spec 加 env）同样是白名单外文件且行数更多。若派发者不收此偏差，回退该行后需给上述三个 spec 各加 env（另一个 3 行偏差）。

## 6. 遗留 / 新发现

- e2e 侧未实证（load）：questions-answer q3 门控路径、m2-port/m2-deadline 经 run-e2e.sh 的钩子可用性——**verifier 需先 `pnpm -C app/ui build` 再跑 e2e**（LEARNINGS：run-e2e.sh 不重建 dist；本分支改了 main 源码，旧 dist 会假绿/假红）。
- review 席自己的 `probe.test.ts` 末条（钩子恒在的兼容锁定）与两条 CONFIRMED 断言（坏行为成立）在修复后按设计不再全绿——那是缺陷复现探针，验收以本报告测试为准。
- `PBOTS_E2E_NO_XVFB=1` 逃生门直跑 `playwright test` 时不经 run-e2e.sh：questions-answer 因 spec 内自带 env 不受影响，m2-port/m2-deadline 在该模式下会缺钩子（既有逃生门为调试用，未为其加逻辑；如需覆盖可改 playwright.config 或逐 spec env，未扩）。

待 verifier 验收。
