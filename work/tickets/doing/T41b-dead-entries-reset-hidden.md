# T41b：dead-entries 遍历的 reset 清掉隐藏偏好 + 补 T41 验收 5（T41 返修）

> 开单：manager (Opus 5.5) | 日期：2026-11-09 | 施工：main (GLM 5.3)
> 来源：`receipts/T41.acceptance.md`「回执 §5 核实结论」
> 分支 / 作业目录：feat/T41 @ /tmp/bot-wt/T41（接着同一分支提交）
> claimed：2026-11-09 main (GLM 5.3) @ feat/T41 续
> accepted：

## 根因（经理已定，不用再查）
段② 遍历会**点**行菜单里每一项。T41 放回的「Hide from sidebar」排最后一项，点了就真把 `P5-52 probe` 藏了（`u4-traverse.tsv`：`Hide from sidebar … rpc=setAgentHiddenFromSidebar … ok`），下一个视图的 `reset()` reload 后找不到该行 → 超时。不是上游自动发帧，不是产品缺陷。

## 边界
1. 只动测试：
   - `app/ui/tests/e2e/grok-dead-entries.spec.ts` 的 `reset()`：`page.reload()` 前加一行 `page.evaluate(() => localStorage.removeItem('pbots.shim.hidden-agents'))`（本单授权改这一处，别的断言不动）。
   - 验收 5 的新段：加在 `grok-dead-entries.spec.ts` 末尾新 `test(...)` 或新文件 `tests/e2e/grok-hidden-bots.spec.ts`（二选一，T41 工单原文）。
2. 不改 `shim/src/**`、overrides；产品代码 T41 已验过。
3. 先红：改 `reset()` 前先跑一次 dead-entries 看段② 红（贴尾，含 `.sand-agent-item` 超时那行）；改后绿。
4. 隔离 HOME / TMPDIR，DBus 指向不存在路径；只跑下面列的 e2e；改完要 `cd renderer-grok && pnpm build` 的话产物不入库。

## 验收
（`app/ui` 下）
1. `pnpm --config.verify-deps-before-run=false exec playwright test tests/e2e/grok-dead-entries.spec.ts tests/e2e/p6-workers.spec.ts` → 全 passed；新 `u4-traverse.tsv` 里有 `agent row menu … Hide from sidebar … rpc=setAgentHiddenFromSidebar … ok`，且其后各视图都有行（遍历走完）。
2. T41 验收 5：右键某 bot → Hide from sidebar → 该行消失、出现 `[aria-label="1 hidden bots"]` → 点开对话框 → Unhide → 行回来；中途 `page.reload()` 一次，隐藏仍在。截图 `work/exp-polish/evidence/T41/{hidden,dialog}.{light,dark}.png`（只截目标窗口，亲眼打开确认）。
3. 新段的变异：把 `data.ts` 的 `writeHidden` 临时改空函数 → 新段在 reload 后那步红（贴尾），`git checkout` 还原。

## 为什么这样验收
- 验收 1 守「入口活着、背后有 handler」（U4′ 口径），同时证明 reset 清偏好后遍历能走完全部视图——Hide 本身被点到且算 ok。
- 验收 2 在真页面上走完整一圈「藏 → 重启还藏着 → 拿回来」，这是用户要的东西；单测 ④ 里抄的那行 visibleAgents 过滤也靠它在真渲染层兜底。
- 验收 3 证明新段的 reload 那步真在测持久化，而不是什么都没断言。

## 产出
- `app/ui/tests/e2e/grok-dead-entries.spec.ts`（reset 一行 + 可选新段）或新 `grok-hidden-bots.spec.ts`
- `work/exp-polish/evidence/T41/*.png`
- 回执 `work/tickets/receipts/T41b.receipt.md`
