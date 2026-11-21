# T73b2：待答随审批结局即清——挂 dsh `approval/request` waterfall，删死代码 next 重绑定

> 开单：manager (Opus 5.5) | 日期：2026-11-12 | 施工：main (GLM 5.3)
> 来源：T73b 终验不通过（`receipts/T73b.acceptance.md` 发现 1/2）；Q-057 经理推荐 B
> 分支 / 作业目录：feat/T73b @ /tmp/bot-wt/T73b（续做，与 T73b 同验同合）
> claimed：2026-11-12 main (GLM 5.3) @ feat/T73b=eb074a42
> accepted：2026-11-12 manager (Opus 5.5) @ feat/T73b=b7906447（与 T73b 同验；终验见 receipts/T73b.acceptance.md）
> **安全单**：动准入生命周期，完成后派 reviewer 只审本单 diff。

## 目标
「始终允许」只能在**卡仍挂着、未作答**时写入：卡一旦有结局（allowed-once / rejected / cancelled / unavailable），同 bot×连接器的待答立即失效。批准侧和拒绝侧都要清。

## 现状（经理核过，@f6a16899）
- `app/sdk/src/policy/shell-ask.mjs:374` 的 `next = () => { consumePending…; return rawNext() }` **是死代码**：handler 在 :376 `return asked` 后不再有人调局部 `next`；dsh 侧 `dsh-tools/lib/pipeline.js:386-388` 拿到 `{kind:'ask'}` 后走 `serviceAsk`（:602 起），`allowed-once` 只回 `{decision:{kind:'allow'}}` 再 `dispatch`，**不回调中间件的 next**。
- 可绑定的 dsh 面**现成且公开**：`dsh-user-approval/lib/index.js:201` 触发 `ctx.waterfall(agent, "approval/request", req, () => "unavailable")`，返回结局字符串；`dsh-sdk-jsonrpc-server/lib/index.js:381`、`dsh-acp/lib/index.js:1093` 都用 `ctx.on("approval/request", async (request, next) => …)` 挂钩。`request` 带 `agent`（同 exec.agent → `session.header.id`）和 `toolName`。

## 方案
1. shell-ask 加一个 `ctx.on('approval/request', async (req, next) => { try { return await next() } finally { 若 toolName 以 mcp__ 开头且 grants!==null → grants.consumePending(sid, serverName) } })`。`finally` 覆盖结局返回和抛错两条路径。
2. **顺序**：这个中间件必须在 UI 应答者（jsonrpc-server / client-ui-approval，都不调 next）**外层**，否则永远跑不到。用 cordis 的 prepend（`ctx.on(name, fn, true)`，施工时到 `node_modules/@deepseek-ai/cordis/lib` 确认签名）或其他办法，以下面 e2e ⑤⑥ 能过为准。
3. 删 :265 `let next = rawNext` 与 :371-374 的重绑定（参数名改回 `next`）；`connector-grants.mjs` 头注释 / :31-33 / :105-107 里「dsh 审批事件对 SDK 插件面不可见」「拒绝侧残留=TTL」改成实际情况。90s TTL 留着当兜底（比如审批服务卸载、结局永远不来）。

## 边界
1. 只动：`app/sdk/src/policy/shell-ask.mjs`、`app/sdk/src/p2sdk/connector-grants.mjs`（只改注释）、`app/sdk/tests/e2e/connector-grants.test.ts`、`app/sdk/tests/unit/policy.test.ts`（如需单测中间件）。
2. 先写失败测试（在当前 f6a16899 上必须红）：
   - e2e ⑤：真出卡 → **不调 remember**，直接 `allowed-once` → 等工具执行完 → `remember` 必须 refused。（现状：待答在 90s 内还有效 → remember 成功 → 红）
   - e2e ⑥：真出卡 → `rejected` → `remember` 必须 refused，`judge` 仍出卡（下一轮还会弹出 approval/request）。
   - ④ 不改语义（活卡期 remember → 答卡 → 直放）。④ 里「答完后 refused」那条断言现在是因为 remember 自己会清待答才过的，测不到消费；可以留着，但回执里不得再拿它当消费证据。
3. 测试走隔离 HOME / TMPDIR，DBus 指向不存在路径；load>10 不跑 e2e。

## 验收
1. `cd app/sdk && ./node_modules/.bin/vitest run tests/unit/connector-grants.test.ts tests/unit/policy.test.ts` → 全绿（≥83）
2. `cd app/sdk && ./node_modules/.bin/vitest run tests/e2e/connector-grants.test.ts tests/e2e/market.test.ts` → connector-grants 6 passed（含新 ⑤⑥）+ market 6 passed
3. `cd app/ui && ./node_modules/.bin/vitest run tests/unit/m1` → 86 passed
4. 回执贴：⑤⑥ 在 f6a16899 上的红输出（原样）；`grep -n "rawNext" app/sdk/src/policy/shell-ask.mjs` 无输出。

## 为什么这样验收
要保住的是「授权只能来自还挂着的卡」。⑤⑥ 只靠 dsh 真结局驱动、不经 remember 自清，所以测的是消费接线本身，不是存储函数。直接调 `consumePending` 的单测（⑩）证明不了接线，这一轮的问题就出在这里。

## 产出
- 上列 4 个文件；`receipts/T73b2.receipt.md`
