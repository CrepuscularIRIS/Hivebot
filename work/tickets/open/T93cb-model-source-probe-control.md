# T93cb：T93c 返修——模型来源只看内存 / 重拉绕过单飞 / F2 对照无效 / 边界算法抄在探针里

> 开单：manager (Opus 5.5) | 日期：2026-11-16 | 施工：main (GLM 5.3)
> 来源：T93c 验收（feat/T93 @ b97afa1f）不通过，见 `reviews/T93.review.md` 末「T93c 验收」
> 分支 / 作业目录：feat/T93 @ /tmp/bot-wt/T93
> claimed：
> accepted：

## 失败点（经理复跑确认）
1. **重启后 Edit 模型悄悄回默认**（产品 bug）：`data.ts` dev 口 `modelOf: (id) => models.get(id) ?? null`。`models` 只在本次渲染进程里 selectModel 成功时写入；重启后为空 → 不重放 → 子会话跑默认模型。同文件 `data.ts:235` 已有正确口径 `models.get(id) ?? views.get(id)?.model ?? null`（快照 `projections.values.modelSelection`，持久的）。
2. **重拉绕过单飞**：dev 口 `void doLoadRoster().catch(() => {})`。`data.ts:464-470` 注释写明 doLoadRoster 必须经 `loadRoster()` 单飞，双跑会双建主 bot；且错误被静默吞掉。
3. **F2「model inherited=no」是无效对照**：探针预置 `session/selectModel` 失败（`session/model-unavailable`，被 `.catch` 记一行就继续），父本来就没选模型，「子没继承」等于什么都没测；FACTS_OK 照打。经理复跑同样输出。
4. **边界算法抄在探针里**（`T93-fork-facts.mjs:71-72`），T93c 第 3 条明写「导出成函数复用，别抄」——现在测的是探针那份，不是产品那份。

## 要做
1. data.ts 抽一个 `currentModel(id)` = `:235` 现有表达式，`:235` 和 dev 口 `modelOf` 都用它。
2. dev 口改 `await loadRoster()`（或 `void loadRoster().catch((e) => log(...))`，照 setMain `:921` 写法）。
3. rollback.ts 导出 `rollbackBoundary(records, lastUser): number`（含 `-1 → 0` 兜底），`rollBackLastTurn` 与探针都调它。
4. 探针预置模型改用 fake 环境**可用**的模型（先查 runtime 的模型清单，或 fake provider 的 id）；预置失败 → 不打 FACTS_OK、非零退出。F2 输出父快照 modelSelection 与子快照 modelSelection 两行原样。继承与否都可以结案（重放幂等）；只要对照有效。
5. 单测加 1 格：`models` 里没有、只有 view 快照里有模型时，dev.rollBackLastTurn 对子调 selectModel（经 testFollowItem 灌快照帧，或施工自选能真走 dev 口的方式；**不许**只测 rollback.ts 传参）。

## 先红
第 5 格在 b97afa1f 上红，贴输出。探针第 4 条：现脚本下 FACTS_OK 必须消失（预置失败分支），贴一次。

## 边界
只动 `shim/src/{data.ts,rollback.ts}`、`t93-rollback.test.ts`、`work/tickets/evidence/T93-fork-facts.*`。

## 验收
1. `node work/tickets/evidence/T93-fork-facts.mjs; echo exit=$?` → 无「预置失败」行、有父/子 modelSelection 两行、FACTS_OK、exit=0。
2. `grep -n "turn/end" work/tickets/evidence/T93-fork-facts.mjs` → 无匹配（边界只在 rollback.ts）。
3. `cd app/ui && node_modules/.bin/vitest run tests/unit/grok-shim/t93-rollback.test.ts` → ≥14 passed；`… tests/unit/grok-shim` → 不新增红（基线 273p）。
4. `grep -n "doLoadRoster()" app/ui/renderer-grok/shim/src/data.ts` → 只剩 loadRoster 单飞里那一处。
5. `node work/tickets/evidence/T93-mgr-probe.mjs` → MGR_PROBE_OK；`/tmp/t93-roster-probe.mjs` 仍断言失败。

## 为什么这样验收
目的是「Edit 后还是同一个脑子」。只认内存，等于只在没重启过的那次会话里成立——用户隔天打开点 Edit 就换了模型，且没有任何提示。探针对照必须先让父真的有一个非默认模型，否则 yes/no 都不是事实。
