# T73b：连接器用时准入门——记住「始终允许这个 bot」（SDK 存储 + 判定 + M1 窄门）

> 开单：manager (Opus 5.5) | 日期：2026-11-12 | 施工：main (GLM 5.3)
> 来源：Q-055-3=A；`work/grok-0.79.3-re/RE-CONNECTOR-GRANT-0.78.1.md` §2.1（何时弹）、§2.2（选项 / 默认 always_this_bot / 粒度 user×bot）、§2.3（偏好持久 + 一键 Clear → `{clearedCount}`）、§5-2
> 分支 / 作业目录：feat/T73b @ /tmp/bot-wt/T73b
> claimed：2026-11-12 main (GLM 5.3) @ feat/T73b=dba2902a
> accepted：2026-11-12 manager (Opus 5.5) @ feat/T73b=b7906447（与 T73b2 同验；终验见 receipts/T73b.acceptance.md）
> **安全单**：动工具准入，施工完单独派 reviewer（可与 T73c 同批）。

## 目标
bot 调连接器工具时：这个 bot 对这个连接器有「始终允许」记录 → 直接放行；没有 → 照旧出卡。记录只能由用户在一张**正在等答复**的卡上产生，bot 自己写不进去；设置里能一键清空。

## 现状（经理核过，@8999af14）
- 准入点已存在：`sdk/src/policy/shell-ask.mjs:349-354` 档位表第 7 行，`mcp__*` 工具一律 `ask(ASK.mcp)`（:87），经 dsh 审批 waterfall 出卡；dsh 审批只有 `allowed-once / rejected` 两值（`ui/renderer-grok/shim/src/coordinator.ts:57-58`），**没有 always 通路**——「记住」必须我们自己存。
- 会话标识：`exec.agent.session.header.id`（shell-ask :255-258），= bot id（`orchestrate.ts` 以 `ws.botId` 作 sessionId 建 session）。粒度 user×bot 在单用户本机即 **bot × 连接器**。
- 存储落点有现成保留位：`sdk/src/policy/never-roots.mjs:173-176` 把 `<dataDir>/standing-grants.json` 列为 guard **硬 NEVER**（bot 文件工具读写都拒），数据根对 bash 整棵 tmpfs 遮蔽（request-net.mjs 头注释）。签发侧 SDK、读取侧 SDK 的文件模式先例 = `request-net.mjs` 许可目录。
- SDK 自有 RPC 先例：`sdk/src/p2sdk/workspace.mjs`（`p2sdk/workspace_ensure`，main 经 dsh.rpc 调，远端模式也通）。

## 方案
1. **存储**：`<dataDirs[0]>/standing-grants.json` = `{"version":1,"connectors":{"<botId>":["<serverName>",…]}}`，SDK 独占读写（0600、写临时文件 + rename）。坏 JSON / 版本不符 → 当空（fail closed = 回到出卡），记一行 console.error。路径经 start.ts 生成的 shell-ask 行 config 传入（同 `permitDir` :382 推导）。
2. **判定**（shell-ask mcp 分支）：`serverName` = 工具名 `mcp__<serverName>__<tool>` 的中段；`(sessionId, serverName)` 在存储里 → `next()`；否则登记一条**待答**（内存 Map，键 sessionId+serverName，TTL 10 分钟）再 `ask(ASK.mcp …)`。档位表把 mcp 配成 `allow` 的 overlay 行为不变。
3. **SDK RPC**（新文件 `sdk/src/p2sdk/connector-grants.mjs`，照 workspace.mjs 注册方式）：
   - `p2sdk/connector_grants_remember({botId, serverName})` → 只有存在该键的**未过期待答**才写入并清待答，否则 `refused`（防 renderer 侧被注入的脚本无卡造授权）；
   - `p2sdk/connector_grants_clear({})` → 清空，回 `{clearedCount}`（= 被清的 bot×连接器条数，§2.3）。
   - 两方法都校验 botId / serverName 形状（serverName 复用 mcp-client SERVER_NAME_PATTERN，见 wrapper.mjs:38）。
4. **M1 窄门**（`ui/main/m1-api/index.ts`）：白名单放这两个方法，checkArgs 做同样形状校验；不回显存储内容。
5. **不做**：Allow once 的「仅本条回复」——dsh allowed-once 只放行这一次调用，本单按单次实现（Q-056-4 默认 A；偏离原版 §2.2「for this reply only」，回执存疑项写明；按回复放行需要 turn 标识与作答回传，进 queue 提议）。Team Bot 档（always_all_team_bots）不做（我们无 Team Bot）。

## 边界
1. 只动：`sdk/src/policy/shell-ask.mjs`、`sdk/src/start.ts`（shell-ask 行 config 加一个路径）、新 `sdk/src/p2sdk/connector-grants.mjs` + 其注册处、`ui/main/m1-api/index.ts`、对应测试。不碰 renderer（卡是 T73c）。
2. **第 0 步**：确认 shell-ask 拿到的 exec 里 `exec.name` 对 wrapper 连接器确为 `mcp__<serverName>__*`、`header.id` 等于 bot id——用 `sdk/tests/e2e/market.test.ts` 现成链路打印一次，输出贴回执。不成立即停，交经理任务 C。
3. 先写失败测试（看红再写）：
   - `sdk/tests/unit/connector-grants.test.ts`：①无记录 → ask 且登记待答；②remember 后同 bot 同连接器 → next()；③**另一个 bot** 同连接器 → 仍 ask；④同 bot **另一个连接器** → 仍 ask；⑤无待答直接 remember → refused 且文件未变；⑥待答过期后 remember → refused；⑦clear → `{clearedCount: N}` 且之后回到 ask；⑧坏 JSON → ask（fail closed）。
   - `app/ui/tests/unit/m1/api.test.ts` 加格：两方法放行、坏 botId / serverName 拒且 dsh 调用计数 0。
   - SDK e2e 一格（加在 `sdk/tests/e2e/market.test.ts` 或新 spec）：真 runtime 里 bot 的 **bash 写** `standing-grants.json` 失败、**write 工具**写它被 deny（证 bot 自己造不出授权）。
4. 隔离 HOME / TMPDIR，DBus 指向不存在路径；不跑全量 e2e。凭证不进日志。

## 验收（写命令，不写感觉）
1. `cd app/sdk && pnpm vitest run --config.verify-deps-before-run=false tests/unit/connector-grants.test.ts tests/unit/shell-ask*.test.ts` → 全 passed，新格 ≥8
2. `cd app/ui && pnpm vitest run --config.verify-deps-before-run=false tests/unit/m1` → 全 passed
3. `cd app/sdk && pnpm vitest run --config.verify-deps-before-run=false tests/e2e/market.test.ts`（或新 e2e 文件）→ passed，含「bot 写不进授权文件」格
4. 覆盖：`cd app/sdk && pnpm vitest run --coverage --config.verify-deps-before-run=false tests/unit/connector-grants.test.ts` → connector-grants.mjs 与 shell-ask 改动行 ≥80%
5. 变异两格（回执贴输出）：去掉「必须有待答」检查 → ⑤红；判定键去掉 sessionId → ③红。

## 为什么这样验收
这是安全门。要保住三件事：①记住的是 **bot×连接器**，不外溢到别的 bot / 别的连接器（③④）；②授权只能来自用户对一张活卡的作答，renderer 被注入或 bot 自己都造不出来（⑤⑥ + e2e 写不进）；③存储坏了退回出卡，不退回放行（⑧）。变异格证明这些测试真的在看守对应的那行代码。

## 产出
- 上列文件 + 回执 `receipts/T73b.receipt.md`（含第 0 步原样输出、变异输出、偏离原版的存疑项）
