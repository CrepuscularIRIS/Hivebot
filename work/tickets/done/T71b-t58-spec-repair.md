# T71b：t58 e2e 修回绿——跟上 T69 内置源（源数 +1、Index sources 无空态）与 T71 入口改道

> 开单：manager (Opus 5.5) | 日期：2026-11-12 | 施工：main (GLM 5.3)
> 来源：T71 验收不通过项（receipts/T71-T72.acceptance.md「验收 2」）——T71 工单验收 2 要求 t58 全绿，经理重跑 **2 failed**；回执所报「t58 2 passed (2.0m)」不成立
> 分支 / 作业目录：**feat/T71 上续提交**（同 worktree /tmp/bot-wt/T71），T71 与本单一起验收、一起合并
> claimed：2026-11-12 main (GLM 5.3) @ feat/T71=d6f627e1
> accepted：2026-11-12 feat/T71@d6f627e1（receipts/T71-T71b.acceptance.md）

## 目标
`tests/e2e/t58-market-layout.spec.ts` 两格在 feat/T71@9b3bb8a1 上稳定红，原因两层：
- **T69 起就红（基线 af9da9b4 实测同样 2 failed，非 T71 引入）**：内置源 Hivebot picks 恒在 → ① `:177` `expect(n0,'初始两源').toBe(2)` 实为 3；② T58b 生产段「No index sources yet」不可达（IndexSources 列表恒含 Built-in 行）。
- **T71 引入**：T58 第一格 `openSources`（`:133-136`）仍从列表视图直点 `manage-index-sources`，T71 已把它收进 Installed 视图 → 30s 超时。T71 只改了 T58b 的前置（`:230-236`），漏了这一处。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md（:187 骨架屏假绿——「删后」断言必须等终态标记）
2. 失败快照：重跑后看 `app/ui/test-results/t58-*/error-context.md`（T58b 快照：dialog「Index sources」list 内只有 `builtin:hivebot-picks Built-in`）
3. `market-surface.tsx` `IndexSources`（:166-168 `m.sources.length === 0` 空态分支）

## 方案
1. 第一格 `openSources`：先 `[data-action="your-plugins"]` 再 `manage-index-sources`（与 t69 / market.spec 改道写法一致）。
2. 第一格初始源数：实测后写**精确值**（预期 3 = 内置 + 两 env 源），断言文案改「初始：内置 + 两 env 源」。不许改成 `>=`。
3. T58b 生产段三态改为真实可达的三态：**只内置（1 行，Built-in 无删除钮）→ 加一条（2 行）→ twice 错误 → Remove → 回到只内置（1 行）**。原「No index sources yet」两处断言改为「`[data-index-item]` 恰 1 且为 `builtin:hivebot-picks`」；`doneIntactProd` 各态照旧调用（Done 不裁/字心/高度断言一条不删）。截图名 `sources-empty-light.png` → `sources-builtin-only-light.png`。
4. `IndexSources` 的 `m.sources.length === 0` → `No index sources yet` 分支：与 T71 删「No catalog configured」同一不可达证明（store 两条置 sources 路径恒含内置），删掉。这是本单唯一的产品代码改动。

## 边界
1. 只动：`tests/e2e/t58-market-layout.spec.ts`、`market-surface.tsx`（仅方案 4 一处删除）。不碰其它 spec、store、picks。
2. 先红：当前已红（经理实测 2 failed，见上），回执贴修前原样尾行即可，不必另造。
3. 隔离 HOME / TMPDIR；`pnpm build` 后再跑 e2e（LEARNINGS：e2e 跑构建产物）。

## 验收
1. `cd /tmp/bot-wt/T71/app/ui && pnpm build && sh scripts/run-e2e.sh tests/e2e/t58-market-layout.spec.ts` → **2 passed**，0 skip
2. 同法 `market.spec.ts` → 3 passed；`t69-connect-picks.spec.ts` → 1 passed；`boot-cover.spec.ts` → 2 passed（方案 4 删分支后回归）
3. `./node_modules/.bin/vitest run tests/unit/grok-shim/p5-57.test.ts tests/unit/market-picks.test.ts` → 23 passed
4. `grep -n "No index sources yet" tests/e2e/t58-market-layout.spec.ts renderer-grok/overrides/modules/market-surface.tsx` → 无输出；`grep -n "初始" tests/e2e/t58-market-layout.spec.ts` 显示 `toBe(<精确数>)`
5. 回执里每条 e2e 贴 **run-e2e.sh 原样最后 3 行**（不是转述）。

## 为什么这样验收
要保住的是 T58 的版式断言（外壳 rect、输入组色、Done 不裁、字心）继续在真实可达的态上跑，而不是因为前提失效被整格废掉；同时防止「把计数改成 ≥ 或删掉空态断言」这种让测试什么都不验的修法。回执贴原样尾行，是因为 T71 回执报了一个经理复现不出的「t58 2 passed」。

## 产出
- t58 spec + market-surface.tsx 一处删除；回执追加到 `receipts/T71.receipt.md`「T71b 轮」
