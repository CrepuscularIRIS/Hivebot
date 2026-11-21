# T73c：连接器审批卡 UI（Always allow / Allow once / Skip）+ 设置一键 Clear

> 开单：manager (Opus 5.5) | 日期：2026-11-12 | 施工：main (GLM 5.3)
> 来源：queue.md「Q-055 落实」G5；Q-056 用户拍板（2+3=A 去假话、4=A 单次调用）；T73b/T73b2 已合并 @76dedcc1（门语义冻结：出卡→活卡窗内 remember 合法→任何结局即消费）
> 分支 / 作业目录：feat/T73c @ /tmp/bot-wt/T73c（从 main 开，基点须含 76dedcc1）
> claimed：2026-11-12 main (GLM 5.3) @ feat/T73c=cfc8fc80
> accepted：2026-11-12 manager (Opus 5.5) 终验 @ feat/T73c=7274ebed

## 目标
用户装了连接器后，bot 调它时弹的是原版形态的连接器卡：主钮「Always allow」（记住这个 bot 对这个连接器）、次钮「Allow once」、「Skip」；记住的偏好在设置里能一键清空。只消费 T73b 已有的两个 RPC，不碰门本身。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md（:112 e2e 数据根对齐、:191 T73b 那条：PBOTS_DATA_DIR 必设 / bot 真实路径 = createWithConnectors / `$events` 应答用 `connect({interactions:'answer'})`）
2. 形态锚：`work/grok-0.79.3-re/RE-CONNECTOR-GRANT-0.78.1.md` §2.2（选项与默认）、§2.3（Clear 只有一键、无 per-bot 列表）。文案以 `work/QUESTIONS.md` Q-056-3 为准（去掉「account」「Team Bot」）。
3. 现状链路（经理已核）：
   - 投影：`app/ui/renderer-grok/shim/src/data.ts:491-503` approval/request → `Ask{agentId, callId, toolName, reason}`；:321 `permissionEntry(...)` 只带 `command`，**卡拿不到 toolName/serverName**。
   - entry 形状：`shim/src/entries.ts:168-188` `permissionEntry`（`ask.action = {kind:'run-command', command}`）。
   - 卡：`app/ui/renderer-grok/overrides/modules/local-tool-view.tsx`（`LocalToolPermissionPrompt`，现只有 Allow once / Deny once，:90 关闭钮 = Deny once）。
   - 应答：`shim/src/coordinator.ts:57-58` `dshValueOf`——`'always'` 已映射为 `allowed-once`，coordinator 不用改。`data.ts:675-683` 答完即 `asks.delete`，卡消失（**今天没有回显态**）。
   - RPC：`p2sdk/connector_grants_remember{botId, serverName}` / `p2sdk/connector_grants_clear` → `{clearedCount}`（`app/sdk/src/p2sdk/connector-grants.mjs:166-180`；M1 白名单 `app/ui/main/m1-api/index.ts:31-32,196-206` 已放行）。renderer 侧调法 = `overrides/modules/pbots-ui.ts:31` `api(method, args)`。
   - 身份：**botId = 投影里的 `agentId`**（shell-ask 用 `exec.agent.session.header.id`，orchestrate 以 botId 建 session，T73b 回执 :13 已证）；**serverName = `toolName.split('__')[1]`**（shell-ask.mjs:387 同口径）。两样都已在 `Ask` 里，只是没投到 entry。
   - 设置：`overrides/modules/settings-panels.tsx:10` `GeneralSettingsPanel` 包上游。
   - 注意 serverName 不是包名：wrapper 的是 `mcp-server-filesystem-3408f957` 这种带哈希的（`app/ui/tests/support/connector-call.ts:9`）。

## 做什么
1. **投影补只读字段**（entries.ts + data.ts）：`toolName` 以 `mcp__` 开头时，entry 的 `ask` 上多带 `connector: { serverName, displayName }`；非 mcp 不带，bash / 文件卡零变化。不加任何写面。
   - `displayName`：serverName → 已装 bundle 反查（按 wrapper 的 serverName 推导规则，见 `app/sdk/src/market/wrapper.mjs` 附近）→ picks title → 都查不到用 serverName。反查放 shim 里一个小函数，有单测。
2. **卡**（local-tool-view.tsx，`ask.connector` 存在时走连接器分支）：
   - 标题「Allow {displayName}」；不放描述行；不放下拉（Q-056-2=A）。
   - 主钮「Always allow」（primary）、次钮「Allow once」、「Skip」。关闭钮 / Esc = Skip。
   - **Always allow 时序**：先 `api('p2sdk/connector_grants_remember', {botId: agentId, serverName})`；`ok` 后才 `resolveLocalToolPermission(resolution:'always')`。remember 失败（含 refused / 网络）→ 卡上显示「Your answer didn't go through. Check your connection and try again.」，**不作答**、按钮恢复可点。提交中三钮全禁用（防双击两次 remember / 答）。
   - Allow once → `allow-once`；Skip → `deny`。
3. **回显**（data.ts）：连接器卡作答成功后不直接消失，留一条只读回显 entry（内存态即可）：
   - Always allow →「Allowed {displayName} for your messages to this Bot.」
   - Allow once →「Allowed {displayName} once」
   - Skip →「Skipped {displayName}」
   - dsh 侧 `cancel`（卡被撤）不出回显。bash / 文件卡照旧答完即消失。
4. **设置**（settings-panels.tsx）：General 面板加一行「Connector preferences」+ 右侧「Clear」钮 → 确认框标题「Clear connector preferences?」、正文「Bots you always allowed to use your connectors will ask again the next time they need one.」、钮「Clear」/「Cancel」。确认 → `api('p2sdk/connector_grants_clear')`；成功关框，失败框内显示错误不关。确认框复用代码库里现成的确认对话框组件（先找，市场 Remove 那类），不新写。

不做：per-bot / per-连接器的列表或编辑（原版也没有）；「仅本条回复」放行（Q-056-4=A）；Team Bot 共享空间 allowlist；改门 / 改 RPC / 改 coordinator。

## 边界
1. 只动：`app/ui/renderer-grok/shim/src/{entries,data}.ts`、`app/ui/renderer-grok/overrides/modules/{local-tool-view,settings-panels}.tsx`（样式如需加进现有 `p5-55-layout.css` 的 `.pb-ask__*` 段）、测试文件、`app/ui/tests/support/connector-call.ts`（若卡改形让它的选择器失效）。`app/sdk/**`、`app/ui/main/**`、coordinator.ts 不碰——碰到就停下写存疑项。
2. 先写失败测试，看红再实现：
   - `app/ui/tests/unit/grok-shim/entries.test.ts` 新格：mcp toolName → entry.ask.connector.serverName 正确；bash toolName → 无 connector 字段。
   - 卡单测（新文件 `app/ui/tests/unit/grok-shim/t73c-connector-card.test.ts`，mock `api` 与 `resolveLocalToolPermission`）：①连接器卡渲染三钮、无下拉、无「Team」「account」字样；②Always allow：remember 先于 resolve 调用，参数 `{botId, serverName}`，resolution `'always'`；③remember 失败：resolve 调用计数 0、出现重试文案、按钮可再点；④Allow once / Skip / Esc 分别 `allow-once` / `deny` / `deny`，remember 计数 0；⑤非 mcp 卡仍只有 Allow once / Deny once。
3. 测试走隔离 HOME / TMPDIR，`DBUS_SESSION_BUS_ADDRESS=unix:path=/nonexistent`；e2e 起 runtime 一律带 `PBOTS_DATA_DIR`（否则 standing-grants.json 写进真用户目录）。
4. 凭证不进代码、文档和日志。只在 feat/T73c 提交。
5. **边界扩一行（经理裁决 2026-11-12，T73b 遗留 wire 修正，方案 A 收紧版）**：允许改 `app/ui/main/m1-api/index.ts` 的 `connector_grants_remember` 分支 + `app/ui/tests/unit/m1/api.test.ts` 对应两格，其余 `app/ui/main/**` 仍不碰。
   - 已核实：SDK `connector_grants_remember(request)` 单参，gateway 要求 `{request:{botId,serverName}}`（orchestrate.ts:100 `workspace_ensure` 先例）；M1 现读裸 `args.botId`（index.ts:198），真机必炸。
   - **只收 request 形，不兼容裸形**：裸形到 gateway 必失败，兼容它没意义，还会出现「校验 A、转发 B」的歧义（例如 `{request:{坏}, botId:好}`）。要求 `args` 只有 `request` 这一个键，形状在 `args.request` 上校验；原样转发。
   - 单测：好形状改成 `{request:{botId,serverName}}`；坏列表补上旧裸形 `{botId,serverName}` 和 `{request:{好}, botId:'x'}`（多余键），都必须 `pbots/invalid-args`，且不进 dsh。
   - 真证据在 e2e：T73c 的 Always allow 必须经 M1 走到 SDK 并 remember 成功（不是 rt.client 直连），这一格同时守 wire 形。
   - 回执单列一节「T73b 遗留修正（wire 形状）」，贴先红后绿；reviewer 审 T73c 时点名这一行。

## 验收（写命令，不写感觉）
1. `cd app/ui && pnpm vitest run --config.verify-deps-before-run=false tests/unit/grok-shim/entries.test.ts tests/unit/grok-shim/t73c-connector-card.test.ts` → 全 passed，新格 ≥7。
2. 变异：把卡里「先 remember 后 resolve」改成并发 / 颠倒（或删 `ok` 判断）→ ②③至少一格红；回执贴红输出后还原。
3. 新 e2e `app/ui/tests/e2e/t73c-connector-grant.spec.ts`（真 Electron + 真 SDK runtime，fake 模型脚本发 mcp 调用，bot 经 createWithConnectors 路径建）：
   - ① bot A 调连接器 → 出连接器卡（断言标题 Allow {名}、三钮）→ 点 Always allow → 回显「Allowed … for your messages to this Bot.」→ `<PBOTS_DATA_DIR>/standing-grants.json` 含 `{A: [serverName]}` → A 再调同连接器**不出卡**、工具行定稿；
   - ② 新 bot B 调同连接器仍出卡；点 Skip → 回显「Skipped …」→ 文件里没有 B；B 再调仍出卡（证明 Skip 后待答已消费、没被记住）；
   - ③ 设置 General → Connector preferences · Clear → 确认 → 文件里 connectors 为空 → A 再调又出卡。
   - 命令：`cd app/ui && pnpm exec playwright test tests/e2e/t73c-connector-grant.spec.ts` → 3 passed（或按格拆的条数全 passed），无 skip。
4. 回归（卡改形可能伤到旧答 dock 的 spec）：`pnpm exec playwright test tests/e2e/market.spec.ts tests/e2e/journeys/d4-d5-d6-journey.spec.ts tests/e2e/session.spec.ts` → 与 main @76dedcc1 同口径（回执贴两边结果；基线已红的格写明）。
5. 截图：亮 / 暗、DPR=2，各一张 ①连接器卡 pending ②Always allow 回显 ③Clear 确认框，存 `work/ui-borders-connect/evidence/t73c-*.png`。原版无实拍参照图，对照基准 = 同会话里 bash 卡（`.pb-ask`）的外壳 / 间距一致 + RE §2.2 钮序（主钮在前）。经理亲检。
6. 覆盖：`pnpm vitest run --coverage ... ` 对 entries.ts / data.ts / local-tool-view.tsx 改动行 ≥80%（回执贴数字）。

## 为什么这样验收
- 要保住的是「授权只能由用户点 Always allow 产生，而且只对那一个 bot」。所以 e2e 断言**落盘文件**和**下一轮是否出卡**，不只看按钮点了没；B 格证明粒度是 bot 而不是全局；Skip 格证明拒绝不会留下可被 remember 的活卡。
- 时序（先 remember 后答）是门语义的前提：先答再 remember 会撞上「结局即消费」，remember 必被 refused，表现为点了 Always allow 但下次还问——变异格就是防这个假绿。
- remember 失败不作答：否则用户以为记住了、其实只放行了一次。
- 回归格防卡改形把旧 dock 选择器打断、让别的 spec 静默变红。

## 产出
- 修改：shim/src/entries.ts、shim/src/data.ts、overrides/modules/local-tool-view.tsx、overrides/modules/settings-panels.tsx（±p5-55-layout.css、tests/support/connector-call.ts）
- 新建：tests/unit/grok-shim/t73c-connector-card.test.ts、tests/e2e/t73c-connector-grant.spec.ts、evidence 截图 6 张
- 回执：work/tickets/receipts/T73c.receipt.md

## 经理终验（任务 B，2026-11-12）：返修（只差落账，内容已核实）
- 亲跑：`vitest run tests/unit/grok-shim/` → 24 files / **252 passed**（派发说 338，实为 252；workers.test 25 passed 含四审两新格）；`run-e2e.sh tests/e2e/t73c-connector-grant.spec.ts` → **1 passed (19.0s)**。
- 改动范围 b6dd12c5..HEAD（排除 work/）14 文件：两处边界扩行已在回执记档；另有 `recovered/.../workspace/model.ts` 一行类型（status 联合加 `skipped`）回执未列，属扩行①同链，接受，补记。
- 截图亲检 t73c-card-pending-light.png：三钮顺序 Always allow（深色实底反白）/ Allow once / Skip 正确；次钮灰字可读，亮图偏淡**可接受**。
- 返修项（不改代码）：
  1. 四审修正（data.ts `asks` 类型补 `outcome?`、workers.test.ts 两格）**仍是未提交改动**（`git status` 见 M），HEAD 7d963089 不含——提交到 feat/T73c。
  2. 回执缺「四审轮」一节：贴提交 sha、改动、上面两条命令原样输出。
  3. 验收 5 要求亮暗各三张，缺 `t73c-card-pending-dark.png`——补拍（DPR2）。
- 合并提示：T75 也改 `overrides/modules/local-tool-view.tsx`（font 一行），与本单同文件——合并须三方合并，不得整树覆盖。

## 终验（manager Opus 5.5，2026-11-12）——通过
- 提交链：7d963089..HEAD = 68500399（四审类型修正+两格）→ 7274ebed（补拍暗色卡）；工作区干净。增量只动 shim/data.ts 1 行 + spec + workers.test.ts，范围内。
- 亲跑：`vitest run tests/unit/grok-shim/` → **24 files / 252 passed**（与回执口径一致）；`run-e2e.sh t73c-connector-grant.spec.ts` → **1 passed (20.0s)**。
- 亲检 t73c-card-pending-dark.png：暗色卡「Memory / Allow Memory?」三钮 Always allow·Allow once·Skip，主钮 Always allow 反白，次钮无底——符合。截图里「回复失败 no scripted call #0」是 fake 脚本噪声，不在本单。
- 合并：与 T75 同改 `overrides/modules/local-tool-view.tsx`，三方合并。
