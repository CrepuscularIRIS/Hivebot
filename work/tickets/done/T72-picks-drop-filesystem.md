# T72：Filesystem 从 Hivebot picks 目录撤下（启动配置留着）

> 开单：manager (Opus 5.5) | 日期：2026-11-12 | 施工：main (GLM 5.3)
> 来源：Q-055-5（用户 2026-11-12 = A）
> 分支 / 作业目录：feat/T72，小改动可在 /tmp/bot-wt/T72
> claimed：2026-11-12 main (GLM 5.3) @ feat/T72=1cf325e9
> accepted：2026-11-12 feat/T72@1cf325e9（manager 验收，见 receipts/T71-T72.acceptance.md）

## 目标
Connect 目录里不再出现「Filesystem」（它读写的是 bot 看不见的 `$DSH_HOME/workspace`，原版也没有；bot 自带文件工具已覆盖）。

## 为什么不是「删 picks.json 一行」（经理核过，@8999af14）
picks.json 同时是**目录数据**（renderer `market-picks.ts:15-23`）和 **wrapper 启动配置表**（`sdk/src/market/wrapper.mjs:79-93`）。删整行 → wrapper 对 filesystem 零参数启动 → `@agent-infra/mcp-server-filesystem` 的 allowedDirectories 为空，每次调用「Access denied」。而 D5 链路测试（`ui/tests/e2e/market.spec.ts` ③、`journeys/d4-d5-d6-journey.spec.ts`、`sdk/tests/e2e/market.test.ts`、`tests/support/connector-call.ts`）正是用 real 源 fixture 里**唯一预置**的 filesystem 做「装上 → 实调 read_file」，会全红；换 canonical 连接器要改 fixture + 4 个 e2e，代价远大于收益。
**所以：目录撤、启动配置留**——picks.json 该行加 `"listed": false`，`market-picks.ts` 生成 installable 时滤掉。用户只能经自己加的第三方源装到它（那时仍按原配置启动，行为不变）。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. `app/sdk/src/market/picks.json`、`app/ui/renderer-grok/overrides/modules/market-picks.ts:15-41`、`app/ui/tests/unit/market-picks.test.ts`、`app/sdk/tests/market/wrapper-launch.test.ts:36-60`、`app/sdk/tests/unit/market-wrapper.proc.mjs:100-110`

## 边界
1. 只动：`picks.json`（filesystem 行加 `"listed": false`）、`market-picks.ts`（filter 一行 + 类型加 `listed?: boolean`）、`market-picks.test.ts`。sdk devDependencies 里的包**不撤**（预置无害，D5 测试要用）。wrapper.mjs 不动。
2. 先写失败测试：`market-picks.test.ts` 加格——`PICKS` 里无 `@agent-infra/mcp-server-filesystem`、`PICKS.length === 17`（4 能装 + 14 要登录 → 3 + 14）、`searchPicks({text:'filesystem'}).total === 0`；看它红。
3. 既有自适应格不改断言：`wrapper-launch.test.ts` ① 遍历 picks（含 listed:false 行——启动配置仍要正确替换，这正是要保住的）；`market-wrapper.proc.mjs` T70 格同理。若它们因新字段报错，回执写原样输出再改。
4. 隔离 HOME / TMPDIR；不跑全量 e2e。

## 验收（写命令，不写感觉）
1. `cd app/ui && pnpm vitest run --config.verify-deps-before-run=false tests/unit/market-picks.test.ts tests/unit/grok-shim/p5-57.test.ts` → 全 passed
2. `cd app/sdk && pnpm vitest run --config.verify-deps-before-run=false tests/market/wrapper-launch.test.ts tests/market/wrapper-env.test.ts && node tests/unit/market-wrapper.proc.mjs` → 全 passed（filesystem 启动配置仍生效）
3. `cd app/ui && pnpm exec playwright test tests/e2e/t69-connect-picks.spec.ts tests/e2e/market.spec.ts` → 全 passed（t69 若断言条目数，跟改为 17；market.spec real 源 filesystem 链路不变绿）
4. 截图（DPR=2 亮）Connect 主页 picks 列表首屏，`work/ui-borders-connect/evidence/T72/picks-no-filesystem.png`，亲看无 Filesystem。

## 为什么这样验收
目的二合一：用户目录里看不到 Filesystem；**D5 真链路（装 → 实调）不因此断**。只验第一条会诱导「删整行」把 D5 打穿，所以验收 2、3 把 filesystem 启动配置和 real 源链路钉住。

## 产出
- 三个文件改动 + 回执 `receipts/T72.receipt.md`
