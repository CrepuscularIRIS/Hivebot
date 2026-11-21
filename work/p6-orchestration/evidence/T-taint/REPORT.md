# T-taint — goal/schedule 来源回合对协调者工具计污染

时间：2026-11-05 11:56（实测 `date`）。分支 `feat/T-taint`，基点 ec42304，HEAD **e5286df9a16504e6aa7c65a46c5c76312244126a**（1 commit）。工作树 /tmp/bot-wt/T-taint，未切主仓分支、未 stash、未 merge/push。

## 问题与修法

问题（G1-r2 A 席 R2-1 发现，PLAN T-taint 行）：turn-origin 的污染判定只认 `pbots-worker`（R2-1），goal/schedule 来源回合不算污染，create_bot 在其中可见——与 Q-021 定稿语义（用户 2026-11-05：「我发布一个任务, 他就直接去执行了, 缺少信息, 不确定的时候再询问我」；附带告知：回报回合只转述不调工具）矛盾。

修法（两级污染、一个账本）：
- `turn-origin.mjs`：新增 `COORDINATOR_TAINT_KINDS = ['pbots-worker', 'goal', 'schedule']`；`classifyTurn` 返回值增加 `coordinatorTainted` / `coordinatorTaintKinds`。**`tainted`（全工具污染，taint-guard 消费）零变化**，仍只认 pbots-worker——R2-1 的「审批档位切换、提问迟到答复、schedule 触发不得误拒（全工具）」语义保留：schedule/goal 回合普通工具照常可用（orchestration-report-live R2-1 反向用例原样绿）。两级判定来自同一 TurnOrigin 账本、同一 claim 集，无第二账本/状态机；账本 append-only，回合内天然单调（一旦污染不因后续 claim 解除，下一回合按新 claim 集复位）。
- `create.mjs`：`when` 与 execute 2.5 检查改读 `coordinatorTainted`；execute 拒绝文本与 `details.taintKinds`（命中的污染 kind 列表）覆盖 goal/schedule 触发；`details.taintKind: 'pbots-worker'` 保留（既有断言原样通过）。goal/schedule 回合内 create_bot 不可见（when 隐藏，真实模型工具表里没有）、强 execute 拒 `pbots/forbidden`（0 次建 bot 请求、不占容量）。

**dsh 原生 guard 是否接线**：未新增接线。执行层拒绝沿用 P6-10.f1 ① 既有双读模式（`when` 每 step 由 dsh `tools.resolve` 原生评估 + execute 内自查，S2 §3.4 fail-closed）；P6-12 taint-guard 的 `tools/pre-execute` 全工具 guard 原样不动、仍只认 pbots-worker（goal/schedule 不进全工具拒——进的话 schedule 自主回合将无法执行任何工具，违背 Q-021「直接执行」）。未自建执行管线、未动依赖/锁、未新建文件。

## 白名单与改动清单（5 文件，+105/−7）

| 文件 | 改动 |
|---|---|
| `app/sdk/src/orchestration/turn-origin.mjs` | 头注 + `COORDINATOR_TAINT_KINDS` + classifyTurn 两级返回（+25/−2） |
| `app/sdk/src/orchestration/create.mjs` | 头注 + when/execute 改读 coordinatorTainted + 拒绝文本/details（+12/−2） |
| `app/sdk/tests/unit/orchestration-foundation.test.ts` | turn-origin describe 新增 T-taint 用例（classify 纯函数 + 账本级单调/复位）（+19） |
| `app/sdk/tests/unit/orchestration-create.test.ts` | 新增 goal/schedule 隐藏 + execute 拒用例；既有 R2-1 反向用例仅移除其中 `claim(...,'schedule')` 一行（见下）（+23/−1） |
| `app/sdk/tests/unit/orchestration-create-live.test.ts` | f1 describe 新增 ①′ goal 注入回合 visible 探针用例（+33） |

**既有测试口径的唯一改动**（`orchestration-create.test.ts` 原「host-internal and unknown kinds do not taint (R2-1)」用例）：删除 `claim('session-main', 1, 'schedule')` 一行。该子断言（schedule 回合协调者工具可见）正是 T-taint 定案要推翻的行为（PLAN 行原文即「goal/schedule 来源回合当前不算污染……与 Q-021 告知矛盾」），schedule 移入新用例按新口径断言。同用例其余断言（user-approval、mystery-kind 不污染；pbots-worker 污染且回合内单调；下一干净回合恢复）逐字未动。正常用户回合与 pbots-worker 语义零变化：foundation 的 R2-1 audit-only 循环、p7-authority 的 delegated 三分、report/report-live、taint-guard、send/stop 相关既有用例全部原文件未改且全绿。

## TDD 证据（真实命令 + 退出码；全文见本目录 *.txt）

命令公共前缀：`env HOME=/tmp/bot-ttaint-tmp/home TMPDIR=/tmp/bot-ttaint-tmp/tmp PATH=/home/lingxufeng/.npm-global/bin:/usr/bin:/bin DBUS_SESSION_BUS_ADDRESS=unix:path=/tmp/bot-T-taint-no-dbus pnpm -C /tmp/bot-wt/T-taint/app/sdk --config.verify-deps-before-run=false exec vitest run --maxWorkers=1 --no-file-parallelism <args>`（依赖安装：`pnpm -C /tmp/bot-wt/T-taint/app/sdk setup`，frozen lockfile，参考 P7-F3，exit 0）。

1. RED 单测（`… tests/unit/orchestration-foundation.test.ts tests/unit/orchestration-create.test.ts`）→ **exit 1**，`red-unit.txt`：2 failed / 97 passed。失败点即修前真实行为：`classifyTurn(['goal']).coordinatorTainted` 为 undefined；goal claim 后 `when()` 仍 true（工具可见）。
2. RED live（`… tests/unit/orchestration-create-live.test.ts -t 'T-taint'`）→ **exit 1**，`red-live.txt`：visible 探针（真实 tools.resolve+when）在 goal 回合后 = true ≠ false。
3. GREEN 单测（同 1）→ **exit 0**，`green-unit.txt`：2 files / 99 passed。
4. GREEN live 单用例（同 2）→ **exit 0**，`green-live.txt`：1 passed（visible=false、0 次建 bot 请求、slots 0）。
5. create-live 全文件 → **exit 0**，`green-create-live-full.txt`：12 passed（既有 ①/②/②′ 无回归）。
6. **app/sdk 单测全量**（`… tests/unit`）→ **exit 0**，`green-sdk-unit-full.txt`：**29 文件 / 572 用例全绿**（3 分 35 秒，私有 HOME/TMPDIR + 死 DBus；未跑 tests/e2e、tests/market，遵守「不跑 e2e」约束）。

## 探针过程中的独立发现（转派发者，未自行扩范围）

**followup 唤醒的回合里，when 注册的工具被调时一律 UNKNOWN_TOOL，与污染无关**：live 注入 `user-approval`（不污染任何口径）回合，fake 模型调 create_bot 仍得 `ToolNotFoundError: unknown tool "create_bot"`；回合外 visible 探针 = true。推论：既有 live 用例 ①（pbots-worker）的「execute 拒」断言（isError + 不含 reached-main）实际被 UNKNOWN_TOOL 空转满足，execute 层拒绝只在单测层被真正验证（本任务的新用例直接调 execute 证实拒绝路径本身工作）。根因在 dsh step admission 与 followup 路径的交互（dsh-tools `resolve`/`executable`，只读核查未改），超出本任务白名单，建议立小任务查证；不影响本修复的正确性（区分性断言走了真实 when）。

## 遗留 / 未完成

1. **send_to_bot / stop_bot 未接 coordinatorTainted**（仍读 `.tainted`，即只在 pbots-worker 回合拒）：两文件不在本任务白名单，改动各一行（when + execute 各读 coordinatorTainted）。建议派发者加一行任务再合并。P6-14b 开闸前应收口，否则 goal/schedule 回合仍可 send/stop。
2. 上述 UNKNOWN_TOOL 现象根因查证（独立小任务）。
3. `COORDINATOR_TAINT_KINDS` 未进 orchestration barrel 导出面（barrel 有整键集断言，create.mjs 直接从 turn-origin.mjs 导入，无需扩面）。

安全合规：无手工 kill/pkill/reboot；未读凭证；测试全走私有 HOME/TMPDIR + env 白名单 + 死 DBus；机器负载 ~7（GPU 训练 + 单 worker 测试），未跑 e2e、未并行。

待 verifier 验收。
