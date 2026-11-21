# T37：术语修正——worker 不叫 bot，subagent 的「看不见」说法改掉

> 开单：manager (Opus 5.5) | 日期：2026-11-08 | 施工：main (GLM 5.3)
> 来源：`work/bot-product-awareness/BRIEF.md`「二次澄清（定案）」第 2 条（bot = 用户自己建的独立会话；主 bot 派生的 = worker / subagent，create_bot 建的不叫 bot）+ 第 3 条（主 bot 的 subagent 要显示在 Workers，见 T36）
> 分支 / 作业目录：feat/T37，小改动不开 worktree（只碰 SDK 文案 + 一处 M3 错误文案；`m3-meta/index.ts` 与 T36 都碰但不同行，后合并的一方三方合并）
> claimed：2026-11-08 07:2x main (GLM 5.3) @ feat/T37
> accepted：2026-11-08 8c95ed03（经理追认：主 agent 未审先并，见回执「终验」；漏网两句转 T37b）

## 目标
模型看到的提示词与用户能看到的报错里，不再把 `create_bot` 建出来的东西叫「bot」；也不再说「subagent 在 Workers 里看不见」（T36 之后主 bot 的 subagent 看得见了）。

## 定案（经理已评估，施工照做）
1. **工具名不改**：`create_bot / send_to_bot / stop_bot` 保持。理由：① 这是模型面 API，`app/ui/renderer-grok/shim/src/workers.ts:118,132,163`（`ASSIGN_TOOLS`）按工具名渲染历史会话里的派活卡，改名后旧会话的卡全掉回原始工具行；② `app/sdk/src/admin/authority.mjs`、`slots.mjs`、`delivery.mjs` 等按名识别；③ T35 复测 harness（`work/p6-orchestration/evidence/D3-orch/run.mjs:294,393`）按 `create_bot` 判分，P6-22 的 48 组历史数据也是这个名。改名收益只是模型面一个词，代价是兼容层 + 复测作废。用户要的是「叫法」，叫法在文案里改。
2. **只改文案**，逐字如下（施工不要自己发挥；这几段影响路由质量，T35 会在改后的文本上复测）：
   - `app/sdk/src/orchestration/routing-prompt.mjs` `ROUTING_PROMPT`：
     - 第一句 `hand their hands-on work to worker bots.` → `hand their hands-on work to workers.`
     - `Each worker runs as an independent bot, visible to the user in the Workers group,` → `Each worker runs in its own conversation, visible to the user in the Workers group,`
     - 末段 `The \`subagent\` tool remains available for ordinary internal scoped subtasks, which are not visible to the user in Workers. Use \`create_bot\` for the user's task that should run as a visible worker, not \`subagent\` as a substitute.` → `The \`subagent\` tool starts a scoped helper for internal subtasks; it cannot ask the user for approval, so it is not a substitute for a worker. Use \`create_bot\` for the user's hands-on task, not \`subagent\`.`（该段其余句子不动）
   - `app/sdk/src/orchestration/create.mjs` `CREATE_BOT_DESCRIPTION`：
     - `:32` `Create a visible worker bot whenever` → `Start a visible worker whenever`
     - `:35` `subagent is for internal scoped subtasks and is not visible in Workers.` → `subagent starts a scoped helper that cannot ask the user for approval; use it only for internal subtasks.`
   - `app/sdk/src/orchestration/stop.mjs:28` `Stop a worker bot when` → `Stop a worker when`
   - `app/sdk/src/awareness/product-prompt.mjs`：
     - `:64` `Bots in this app right now (` → `Bots and workers in this app right now (`
     - `:69` `Subagents are not bots and do not appear in the sidebar.` → `Subagents are not bots. The main bot's subagents appear in the sidebar's Workers group; other bots' subagents are not shown.`
     - 名册行 `(worker created by "X")` **不改**（「worker」本身就是对的叫法）
   - `app/ui/main/m3-meta/index.ts:124` 报错 `is a worker bot (createdBy set); workers cannot be promoted` → `is a worker (createdBy set); workers cannot be promoted`（用户在「Set as main bot」失败时会看到这句）
3. 施工完再 `grep -rn "worker bot" app/sdk/src app/ui/main app/ui/renderer-grok/shim/src app/ui/renderer-grok/overrides`，剩下的只许在注释里；有用户可见或模型可见的漏网，写进回执存疑项，不要自己改措辞。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. 上面列的五个文件的对应行
3. 会受影响的断言：`app/sdk/tests/unit/orchestration-routing.test.ts:49-59`、`orchestration-routing-live.test.ts:31`（marker 用了第一句原文）、`orchestration-default-chain-live.test.ts:32`（同）、`awareness-prompt.test.ts`（heading / subagent 句若有断言）

## 边界
1. 只动：上面五个产品文件 + 受影响的测试文件 + `work/**`。不改工具名、参数 schema、错误码、路由逻辑。
2. 先写失败测试：`orchestration-routing.test.ts` 加一格「ROUTING_PROMPT 与 CREATE_BOT_DESCRIPTION 都不含 `worker bot`、不含 `not visible`」；`awareness-prompt.test.ts` 加一格「段落不含 `do not appear in the sidebar`、含 `Workers group`」。先跑红，再改文案。
3. live 测试里引用旧第一句的 marker 跟着改成新句子（改 marker 不算改弱测试，但回执要列出改了哪几处）。
4. 测试走隔离 HOME / TMPDIR，DBus 指向不存在路径；不跑全量 e2e。

## 验收（写命令，不写感觉）
（`app/sdk` 下，`VR` = `pnpm --config.verify-deps-before-run=false exec vitest run`）
1. `VR tests/unit/orchestration-routing.test.ts tests/unit/awareness-prompt.test.ts --reporter=verbose` → 全绿，含两格新断言；先红输出贴回执
2. `VR tests/unit/orchestration-routing-live.test.ts tests/unit/orchestration-default-chain-live.test.ts tests/unit/awareness-prompt-live.test.ts` → 全绿（证明默认链里挂上去的是新文本）
3. `VR tests/unit/orchestration-create.test.ts tests/unit/orchestration-stop.test.ts` → 全绿（描述改了，schema 没动）
4. `grep -rn "worker bot" app/sdk/src app/ui/main app/ui/renderer-grok/shim/src app/ui/renderer-grok/overrides` → 只剩注释行（原样贴输出）
5. `git diff --stat main...feat/T37` → 只有上面列的产品文件与测试文件
6. M3 那一行：`pnpm -C app/ui --config.verify-deps-before-run=false exec vitest run tests/unit/m3/p610.test.ts` 全绿（断言若匹配旧文案，随之改）

## 为什么这样验收
- 目的有两个：模型对用户说话时不把 worker 叫成 bot；模型不再相信「subagent 用户看不见」——T36 之后这句是假的，而它原本正是路由提示区分 create_bot / subagent 的理由。新理由换成真实差别（subagent 不能向用户要审批），这样路由判断的依据仍然成立。
- 文案逐字给定、grep 兜底：这几段是调过路由质量的提示词，施工自由改写会让 T35 复测测的不是定稿文本。
- 工具名不动由验收 3、5 守住（schema 测试绿 + diff 不出范围）。

## 用户补充
（用户对叫法还有别的要求，主 agent 照抄原话 + 日期写在这里。）

## 产出
- 上面五个产品文件的文案改动；受影响测试的新格与 marker
- `work/tickets/receipts/T37.receipt.md`
