# B1.A：批量删除接线（deleteAgents 实装）· 批 1.A

- claimed: 2026-11-17 · 分支: docs/rebuild-p6-p5-plan · 执行: 主 agent（native）
- 来源: docs/superpowers/plans/2026-11-17-grok110-parity.md 批 1.A；Q-064 用户已批 A（加行实装）
- 等价: P6-24 removeBot 生产接线收口（probe-p624 REPORT-f1 L115-121 核心缺口）

## 需求

0.78.1 侧栏多选 Delete 与行菜单 Delete 均被 T96b 门控（onDeleteSelectedAgents/onRequestDeleteAgent=undefined），因 shim deleteAgents 是 unknown-method 无实底。本单实装后端链路并恢复两处透传。

上游契约（0.78.1 产物锚点）：
- ProductionRenderer.tsx:3152 `client.call("deleteAgents", { ids: [agentId] })`——批量形参 `{ids: string[]}`，回复 `record`（rpc/coordinator.ts:114）。
- 删后本地 reconcile：remaining 过滤 + selectionStore.reconcile。

DSH 实底：`session/delete`（ACP DeleteSessionRequest，required:["sessionId"]），wire 壳 `{request:{sessionId}}`（与 session/rename 同型）。

## 方案（四层接线）

1. `app/ui/main/m1-api/index.ts`：M1_ALLOW 加 `'session/delete'` + checkArgs 窄门校验（恰 `{request:{sessionId: string}}`，多余键拒——照 connector_grants_remember 写法）。
2. `app/ui/renderer-grok/shim/src/coordinator.ts`：CoordinatorDeps 加 `deleteAgents(ids: string[]): Promise<unknown>`；handleRequest 加 case（实参 `{ids}`）。
3. `app/ui/renderer-grok/shim/src/data.ts`：实装 deleteAgents——逐 id `api('session/delete', {request:{sessionId}})`；本地状态清理（summaries/order/views/unread/hidden/createdBy/avatar）+ `push.agents()`；被删 id 是当前激活 bot 时切到存活首只；删的是 worker 时不动其 creator；删除链失败即抛（上游 Deleting failed 路径）。**每删一只 worker 需级联判断：删主 bot 时其名下 worker 全删（0.78.1 语义：主 bot 删除带全窝）？——按上游 deleteAgents 单调 {ids} 批量接口，本单实装「传啥删啥」，级联语义不在本单范围（worker 是 shim 侧概念，DSH 无 worker 关系）。**
4. `app/ui/renderer-grok/overrides/modules/sidebar.tsx`：`onDeleteSelectedAgents` 恢复透传（删多只循环调用），`onRequestDeleteAgent` 恢复透传（单删）。

## 验收（DoD）

1. 单测：m1-api checkArgs session/delete 窄门（合法/缺 sessionId/多余键/非字符串）四态。
2. 单测：shim deleteAgents 实底（成功删本地状态/当前激活 bot 被删切换/api 失败抛错）。
3. e2e t96-sidebar-selection.spec.ts：`Delete 2 selected agents` 钮从 count(0) 改正断言（可点、点击后两行消失、selection actions 退场）。
4. e2e 回归：t96 原三测全绿（多选/区间/pinned 区间）。
5. pnpm build 全链绿（renderer-grok 含 overrides/shim 产物）。
