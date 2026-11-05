# VERIFY · P6-21 投递与 Assignment 地基

verdict: PASS
commit: `9f4cff0853cc5a0a0ff67f9ea5685dbd80a74037`（feat/P6-21，单 commit，base=main@92cb6af）
验收人：verifier（GLM 5.3），2026-11-04。证据目录：`work/p6-orchestration/evidence/P6-21-vfy/`
worktree：`/tmp/bot-wt/P6-21`，验收期间 HEAD 未漂移（`git rev-parse HEAD` = 9f4cff0）。main 已前进 38584ba（P6-09 证据合并，仅 work/ 文档，与本任务零文件交叠，已核对文件清单）。

| # | 验收项 | 结果 | 证据 |
|---|---|---|---|
| 1 | `git diff 92cb6af --name-only` 恰 8 个新文件，全在 `app/sdk/src/orchestration/` + `app/sdk/tests/`，零改现有文件 | PASS | 实测输出：8 条全为 `A`——`src/orchestration/{index,delivery,assignment,pending,turn-origin}.mjs`（511 行）、`tests/unit/orchestration-foundation{,-delivery}.test.ts`（489+130 行）、`tests/support/orchestration-foundation-plugin.mjs`（54 行）。无 M/D 条目。worktree `git status` 仅 `?? app/sdk/node_modules`（主仓 symlink，未提交，builder 已申报） |
| 2 | 定向单测复跑（临时 HOME）：2 文件 51 用例全绿 | PASS | `HOME=/tmp/bot-p6-21v-home ./node_modules/.bin/vitest run tests/unit/orchestration-foundation.test.ts tests/unit/orchestration-foundation-delivery.test.ts` → `Test Files 2 passed (2) / Tests 51 passed (51)`，3.63s。两次运行同绿（第二次存 `evidence/P6-21-vfy/targeted-tests.txt`）。含真 Loader 用例（boot 实 SDK 经 typert remote，120s 超时档） |
| 3 | 全量 sdk 回归 ≥319 全绿 | PASS（见归因说明） | worktree 全量：`Tests 10 failed \| 360 passed (370)`，163s（`evidence/P6-21-vfy/full-regression.txt`）。370 = 基线 319 + P6-21 新增 51，数字闭环。10 个失败**逐条归因为环境性、与本分支无关**（详下）。主会话 2026-11-04 05:33 已在 main 实测基线 **319/319 全绿**（work/LOG.md:942，38584ba 仅追加 work/ 文档，sdk 代码与 92cb6af 相同）；本分支零改现有文件（项 1）+ 新增 51 全绿（项 2）⇒ P6-21 引入的非环境性失败 = 0 |
| 4① | `pending` 已投判定以主 session 日志 fold 为准（非 history+pending 双表、非 flush 回执） | PASS | `pending.mjs` `foldMainLog`（:43-55）重放 `agent/inbox/spliced` + `user/message`：已投 = 落盘 `user/message` 的 `source.items[]` ∪ 重放后仍待处理 inbox 的 items（`computeDue` :94-95）。claim 后无 `user/message` 的键两张表皆不可见 → 判回待投（用例 (iv) 实测）。`delivery.mjs` 头注释明确分工「history + live-inbox 双查只作投递前去重，不作已投依据」，`holds()` 注释同。对账走 `Delivery.readLog`（扫日志）不经 session/event |
| 4② | 同 id 先移除再插入只算重排（不算出队） | PASS | `assignment.mjs` :90-96：claim 的判定 = open turn 内**无 outcome** 的移除；`inbox.remove` 落 `outcome:'canceled'`，不记 claim，重插回到列表。用例 `treats canceled-remove + same-id reinsert as a wake reorder, not consumption`（test:140）断言 `assignments.size===0` 且 `pendingAssigns=['a1']`。另 `delivery.wake()`（:159-165）实现同原语 |
| 4③ | 7 种 reason 映射 + forked/未知 fail closed | PASS | `endOutcomeFor`（pending.mjs:27-31）：completed→completed；aborted/interrupted→stopped；其余（error/blocked/max-tokens/forked/未知）→error + `reason` 保留原值。对照 dsh `TurnEndReasonMap`（dsh-session types.d.ts:170-214，实测 7 种恰为 completed/aborted/blocked/error/max-tokens/interrupted/forked）全覆盖。`it.each` 8 格（7 种 + `unknown-future-reason` fail closed）+ 7 种过 `computeDue` 的 `it.each`，全绿。「无 turn/end 且空闲」→ `endOutcomeFor('interrupted')`→stopped（computeDue:111-114，有专测） |
| 4④ | turn-origin 只认 `pbots-worker` 为污染（R2-1） | PASS | `turn-origin.mjs` `TAINT_KIND='pbots-worker'`，`classifyTurn` 只查该 kind；宿主内部源与未知 kind 仅进 `auditKinds`（审计，不拦截）。用例 test:406 覆盖 user-approval/user-question-reply/working-directory/agent-message/subagent-settled/schedule/runtime-context/brand-new-host-kind 8 组全部 `tainted=false`。PLAN ⑥ 原文「未知 kind → 受污染」与 R2-1 的冲突按派发词取 R2-1（builder 报告发现①同），建议 v4.2 顺笔改 |
| 4⑤ | claim 后崩溃 (iv)、停止撤回 (v) 用例存在且真 | PASS | (iv) test:230：主 session 构造 insert + turnStart + claim splice + turnEnd(interrupted)、无 `user/message` → `due=['a1:end']`（正是 f5-ii 双表盲区）。(v) test:242：insert + turnEnd(aborted) + canceled splice → `due=['a1:end']` 且 `needsWake=[]`（决策 27⑤ 停止撤回）。两用例断言真实非空壳，helper `claim`（无 outcome 移除）/`canceled`（outcome:'canceled'）与 inbox.ts 语义一致 |
| 5 | delivery 模块头部来源注记 | PASS | `delivery.mjs:1` = `来源: https://github.com/deepseek-ai/dsh-superagent-prototype@6337fc823ce20251c8de8085948165c81aaa701e:src/app/delivery.ts`。与 `repos/dsh-superagent-prototype`（实测 HEAD=6337fc8…）`src/app/delivery.ts`（86 行 AgentDelivery）逐段对照：`deliveryIdOf`（去 user rpcId 分支，头部声明）、`readLog/holds`（history+pending 双查）、`send`（去重→followup→flush 回执）均为改造；去掉的 steer/inject/authorize/accepted 与新增的 wake/projectEvent 均在头部声明。`assignment.mjs` 头另注 P6-09 probe `foldAssignments` 来源 |

## 项 3 失败归因（10 个，全部环境性）

**A 类 · worktree 结构性（7 个，确定性复现）**：`security.test.ts` ③④④c⑤⑥ + `w1ap0-scan.test.ts` ③a③b。这些用例内部 `spawnSync('pnpm', ['-C', PKG_ROOT, 'exec', ...])`；worktree 的 `node_modules` 是指向主仓的 symlink，pnpm 的 verify-deps 检查判 modules 目录不匹配，尝试 `pnpm install`（要清 modules 目录），无 TTY 中止 → 子进程 exit 1。与 HOME 无关（单跑复挂）。**对照实验**：主仓 main 同文件单跑 `security.test.ts` **8/8 全绿**、`w1ap0-scan.test.ts` **2/2 全绿**（`evidence/P6-21-vfy/` 附两次输出）；该 7 用例不 import 本分支任何文件，基点 92cb6af 上同样挂。
**B 类 · 高载并发竞争（3 个，单跑全绿）**：`sandbox-hardened` ⑦、`guard-fs` ⑥、`tiers-policy` ①③a。全量跑时外部负载 45-56（wine 游戏 + supermimic + 并行 e2e 37 进程，主会话 06:37 tick 已记录并预判超时假红）。逐用例单独复跑：⑦ 过（3.75s）、⑥ 过（13.89s）、① 过（8.99s）、③a 过（4.44s）。
另外：`pnpm test` 入口本身在 worktree 不可用（pnpm deps 预检欲 purge symlink 的 node_modules，CI=true 会放行真删——已拒绝），故全量用 `./node_modules/.bin/vitest run`（= test 脚本的实命令，仅绕过 pnpm 预检）。

低载复跑：未执行。外部负载（wine 游戏 + supermimic）在验收窗口内维持 37–56，未再出现 ≤24 窗口；重跑预期结果固定（A 类 7 挂不随负载变化、B 类已有单跑全绿豁免），信息增量为零，故不再等待。全量首跑本身已在 load 23.68（≤24）窗口内启动。

## 新问题（可派发）

- [FIX] worktree 内 sdk 的 pnpm-exec 类 e2e（security 7 用例）因 node_modules symlink 必挂，verifier/builder 在 worktree 跑全量永远得不到全绿 | 复现：worktree `vitest run tests/e2e/security.test.ts` → 5 failed，主仓同文件 8/8 绿 | 疑似位置：`app/sdk/tests/e2e/security.test.ts:200`（spawnSync pnpm exec）+ worktree 复原流程（`pnpm setup` 建 symlink） | 严重度：M（每轮验收都要人工归因一遍；可让 start.mjs/测试改用 `node_modules/.bin` 直调或 store 绝对路径）
- [FIX] PLAN v4.1 P6-21 验收⑥ 仍写「含 pbots-worker 或未知 kind 不算污染」的上代口径（决策 29 原文「未知来源 fail closed」），与 §11 R2-1「只认 pbots-worker」并存，靠派发词消歧 | 复现：PLAN.md:84 ⑥ vs :190 R2-1 | 疑似位置：work/p6-orchestration/PLAN.md | 严重度：L（文档，下个任务顺笔改）

进程回收：`bot-reap --dry-run --match p621` 无匹配（本任务进程仅 vitest 自管子进程，均已随测试退出；06:51 实测）。临时目录已清：`/tmp/bot-p6-21v-{home,main}` 验收后删除（实测 `ls -d /tmp/bot-p621-*` 无匹配，测试侧 tmp-sweep 自清）。主仓与 worktree 产品代码零改动。
