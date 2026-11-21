# T69b：T69 返修——Memory 数据落到 DSH_HOME、market.spec 删源断言改正、builtin: 前缀全拒、补截图与覆盖

> 开单：manager (Opus 5.5) | 日期：2026-11-12 | 施工：main (GLM 5.3)
> 来源：T69 验收（`receipts/T69.acceptance.md`）——reviewer 意见 1（MAJOR）、2（MAJOR）、3（MINOR）、4（记录），经理逐条核实成立
> 分支 / 作业目录：feat/T69 @ /tmp/bot-wt/T69（在 73e1295d 之上追加提交，不另开分支）
> claimed：2026-11-12 main (GLM 5.3) @ feat/T69=f8357d5b（73e1295d 之上）
> accepted：2026-11-12 manager (Opus 5.5) @ feat/T69=54dd3eda（T69+T69b 合验；见 receipts/T69-T69b.acceptance.md）

## 目标
把 T69 验收挡下的四件事修完：Memory 连接器的数据不再写进依赖目录；market.spec 的删源断言改成内置源在的正确结论并真跑绿；任何 `builtin:` 输入都不交给 dsh；补齐工单要求的 6 张截图与覆盖核算。

## 动手前先读
1. `receipts/T69.acceptance.md`（每条意见的核实证据与行号）
2. `app/sdk/src/market/wrapper.mjs:79-86`（REQUIRED_ARGS 参数表）、`:118-165`（marketWrapperDirFor，`env: {}` 在 :159）
3. `@modelcontextprotocol/server-memory@2.1.1` `dist/index.js:20-50`（不设 `MEMORY_FILE_PATH` 时落在包自己的 dist/memory.jsonl）
4. `app/ui/tests/e2e/market.spec.ts:350-356`、`market-surface.tsx:168-182`（内置行也带 `data-index-item`）
5. `market-store.ts:136-141`（addIndex）

## 修什么（引用审查意见编号）
1. **意见 1**：wrapper 生成 mcp 行时，按包给 env（与 REQUIRED_ARGS 同形的一张小表即可，不另造机制）：`@modelcontextprotocol/server-memory` → `MEMORY_FILE_PATH = <dshHome 下的持久目录>/…/memory.jsonl`（路径由 `dshHome` 派生，不得落在 `sdkRoot` / `node_modules` 下；目录在生成时创建）。表外包仍 `env: {}`。
2. **意见 2**：`market.spec.ts` T51 删源后改为精确断言只剩内置源：`[data-index-item]` 计数 **1**、`[data-index-item="builtin:hivebot-picks"] [data-builtin-source]` 可见、页面无 `[data-action="remove-index"]`。原 `toHaveCount(0)` 只可能在 `enterMarket(true)` 把 `sources` 置 null 的骨架屏瞬间被采样到才过——是假绿，不许保留。
3. **意见 3**：`addIndex` 对 `trimmed.startsWith('builtin:')` 一律在提交前拒绝（文案沿用现有拒绝口径，不调 `setIndexes`）。`removeIndex` 同理对任何 `builtin:` 前缀 no-op。
4. **意见 4**：t69 spec 补 3 张暗色截图，凑齐 `connect-{list,signin-detail,sources}-{light,dark}.png`。

## 边界
1. 只动：`app/sdk/src/market/wrapper.mjs`、`app/sdk/tests/market/` 下现有或新增一个测试文件、`market-store.ts`、`tests/unit/market-picks.test.ts`、`tests/e2e/market.spec.ts`（仅 :350-356 那段）、`tests/e2e/t69-connect-picks.spec.ts`（仅加截图）。超出就停。
2. 先写失败测试看红：
   - sdk：两个不同 `dshHome` 生成 memory wrapper → 读回 `cordis.patch.yml`，`config.env.MEMORY_FILE_PATH` 两者不同、都以各自 `dshHome` 开头、都不含 `node_modules`；filesystem 包 env 仍为 `{}`。
   - 单测：`addIndex('builtin:other')` 与 `addIndex(' builtin:x ')` → 返回非 null 且 mock 的 `setIndexes` **未被调用**；`removeIndex('builtin:other')` → 未调用。
   - e2e：先改 :352 断言，在修前代码上它本来就该过（这是断言纠错，不是功能红）——回执写明这一格的性质。
3. 测试走隔离 HOME / TMPDIR，DBus 指不存在路径；不跑全量 e2e。**跑 e2e 前 `uptime`，load > 10 不跑，等降下来**（GPU 训练机）。

## 验收（写命令，不写感觉）
1. `cd app/ui && ./node_modules/.bin/vitest run tests/unit/market-picks.test.ts` → 全 passed，含意见 3 的两格负例。（本机 node 22，`npx vitest` 会因 devEngines 报 EBADDEVENGINES，用本地 bin。）
2. `cd app/sdk && ./node_modules/.bin/vitest run tests/market/` → 全 passed，含意见 1 的不同 HOME 不同路径格。
3. 隔离 HOME 真跑一次：wrapper 安装 memory → mcp 起 → 调一次 `create_entities` 写一条 → 断言 `<dshHome>/…/memory.jsonl` 存在且含该条、`app/sdk/node_modules/.pnpm/@modelcontextprotocol+server-memory@2.1.1/node_modules/@modelcontextprotocol/server-memory/dist/memory.jsonl` **不存在**（`ls` 原样贴回执）。可放 sdk 测试里，也可一次性探针（探针贴全文）。
4. `CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/market.spec.ts` → 3 passed；`… tests/e2e/t69-connect-picks.spec.ts` → 1 passed。**回执贴两次 run 的末 15 行原样输出**（不是转述）。
5. 截图 6 张齐，经理 Read 亲看。
6. 覆盖：T69 + T69b 改动的 `market-store.ts` / `market-picks.ts` / wrapper env 分支，按 LEARNINGS 手工核算表列出改动行与覆盖它的测试格，≥80%（T69 回执漏了这项）。
7. `git -C /tmp/bot-wt/T69 diff --stat 73e1295d..HEAD` 只含边界 1 的文件。

## 为什么这样验收
- 意见 1 的真实目的：用户在 Memory 里存的东西要跟着用户的 HOME 走、升级不丢、不同账户不串；打包后 node_modules 可能只读，写不进去就是功能直接坏。所以要「真写一条、看落在哪」，而不只是看 patch 文件里有个字符串。
- 意见 2 的真实目的：删完最后一个用户源，用户看到的应该是内置目录、内置源一行且不可删。断言必须写出这个正确结论；骨架屏瞬间采样过的绿不算证据。
- 意见 3：dsh 会拒 `builtin:other`（`invalid-index-url`），实际不会弄脏设置，但 T69 工单承诺「提交给 dsh 的 urls 不含任何 builtin: 前缀」，一行守卫兑现承诺，避免以后 dsh 放宽校验时出事。

## 产出
- 上述改动；`receipts/T69b.receipt.md`（贴原样命令与输出、覆盖核算表）；`work/ui-borders-connect/evidence/T69/` 6 张截图
