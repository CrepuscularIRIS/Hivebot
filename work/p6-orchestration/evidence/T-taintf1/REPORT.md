# T-taint.f1 交付报告（builder）

任务行：`work/p6-orchestration/PLAN.md` T-taint.f1 —— send_to_bot / stop_bot 的 when/execute 从读 `.tainted` 改读 `coordinatorTainted`（与 create.mjs 同一双读 fail-closed 模式）；turn-origin.mjs classify 无 claim 早返回补 `coordinatorTainted` / `coordinatorTaintKinds` 字段。P6-14b 开闸硬前置收口。

- 分支：`feat/T-taintf1`（worktree `/tmp/bot-wt/T-taintf1`，基 3cd4c41）
- commit：7dc1bd0（`fix(sdk): T-taint.f1 send_to_bot/stop_bot 接 coordinatorTainted + classify 早返回补字段`，6 files +204/-12）
- 改动文件：
  - `app/sdk/src/orchestration/send.mjs` —— when（原 :80）与 execute（原 :110-111）改读 `coordinatorTainted`；execute 错误文案与 details 对齐 create 口径（`taintKinds: coordinatorTaintKinds`）
  - `app/sdk/src/orchestration/stop.mjs` —— 同上两处（原 :67 / :96-97）
  - `app/sdk/src/orchestration/turn-origin.mjs` —— `classify` 无 claim 早返回由 `{ tainted, auditKinds }` 补齐为四字段（与有 claim 路径同形状）
  - `app/sdk/tests/unit/orchestration-taintf1.test.ts` —— 新增，8 用例（goal/schedule 回合 send/stop 隐藏且拒、execute 不触 delivery/cancel、干净回合与 user-approval 回合零变化、下一干净回合恢复、classify 早返回 toStrictEqual 全字段）
  - `app/sdk/tests/unit/orchestration-send.test.ts` / `orchestration-stop.test.ts` —— R2-1「不拦」用例移除 schedule claim（f1 后 schedule 对协调者工具拦，该 kind 的拦截断言移入新测试文件；user-approval 继续代表宿主内部来源不拦；foundation 的 R2-1 全工具口径 `['user','schedule'] tainted=false` 未动）

## TDD 证据（真实退出码）

- RED（未修代码，仅新测试文件）：`red-unit.txt` + `red-unit.exit` —— exit 1，5 failed / 3 passed。失败点即 T-taint VERIFY 项 6 的残留：goal 回合 send when=true 且 execute 直达 delivery（sends=1）、goal/schedule 回合 stop when=true、classify 早返回缺 `coordinatorTainted`/`coordinatorTaintKinds` 两字段（toStrictEqual 锁出）。3 个通过用例是干净回合对照（本就该绿）。
- GREEN（修复后定向）：`green-unit.txt` —— exit 0，7 files / 186 tests（新文件 8 + send/stop/foundation/create-live/p7-authority/report 全部 taint 消费方）。
- 全量：见下节。

## 全量（tests/unit，隔离 HOME=/tmp/bot-ttaintf1-tmp）

- 第一次 `vitest run tests/unit`（green-sdk-unit-full.txt，exit 1）：30 文件，578 passed | 2 skipped，唯一失败为 `orchestration-create-live.test.ts > P6-10 live RT2` 的**套件级 `socket hang up`**（live dsh 连接，非断言失败；本任务未改 create/identity/loader）。单跑该文件 12/12 exit 0。
- 第二次全量（green-sdk-unit-full-r2.txt + green-sdk-unit-full.exit，exit 0）：**30 文件 580/580 全绿**（572 基线 + 8 新增）。
- 判定：唯一一次失败为高负载（load ~6，GPU 训练在跑）下 live socket flake，非本改动引入（同内容复跑全绿）。
- 另：初次全量误用 `pnpm test`（vitest run 无过滤，会扫 tests/e2e），发现后 TaskStop 停掉并改用 `vitest run tests/unit`（与 T-taint verifier 全量口径一致：29→30 文件 572→580）；未跑 e2e，符合「只跑 unit」约束。

## 语义零变化论证

- `coordinatorTainted = pbots-worker ∪ goal/schedule`（turn-origin.mjs 常量，T-taint 主任务已定稿）。send/stop 改读它后：pbots-worker 回合行为不变（原 `.tainted` 只认 pbots-worker，两集合在 pbots-worker 上重合）；新增拦截仅 goal/schedule 回合——正是本任务目标。
- 正常用户回合 / user-approval 等宿主内部来源：classify 结果 coordinatorTainted=false，when=true、execute 放行（新测试「clean user turns」+ 既有 send/stop R2-1 用例锁住）。
- create.mjs 及其测试零改动（`git diff` 不含 create.mjs）。
- taint-guard（全工具污染，消费 `.tainted`）口径零变化：foundation :437 `['user','schedule'] tainted=false` 原样通过。

## 遗留

- 无。PLAN T-taint 残留实证（VERIFY 项 6）与 classify 缺字段（低）两项均在本任务收口。
