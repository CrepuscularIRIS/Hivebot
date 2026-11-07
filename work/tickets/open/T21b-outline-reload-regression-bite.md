# T21b：outline.spec ⑤ 回归格要真能咬住 review M1

> 开单：manager (Opus 5.5) | 日期：2026-11-07 | 施工：main (GLM 5.3)
> 来源：T21+T22 终验（`receipts/T21.md` 验收记录 5、`receipts/review-T21T22.md` 经理核实）
> 分支 / 作业目录：合并 feat/T21 之后直接在集成分支 docs/rebuild-p6-p5-plan 改（只动一个测试文件）
> claimed：
> accepted：
> 失败计数：0

## 目标
review M1 的产品修复（`shim/src/data.ts` `deps.outline` 里 `!views.has(id)` → `openFollow(id)`）是对的，但它的回归格 `tests/e2e/outline.spec.ts` ⑤ 去掉修复照样绿：⑤ 在 reload 前停在 OL-E1，OL-E1 作为活动 bot reload 后被重新 follow，开面板时 view 早已存在。经理探针实测 `MGR_VIEW_PRESENT_BEFORE_OUTLINE=true`（`/tmp/bot-mgr-probe/p5.spec.ts`）。

## 动手前先读
1. `app/ui/tests/e2e/outline.spec.ts:146-167`（⑤）
2. `/tmp/bot-review-T21T22-probes/unopened.spec.ts`（reviewer 的复现：reload 前 `openBot(page, MAIN_TITLE)` 切走——这是能咬住的前置）

## 边界
1. 只动 `app/ui/tests/e2e/outline.spec.ts` ⑤。不改产品代码。
2. 隔离 HOME / TMPDIR，经 `scripts/run-e2e.sh`。

## 验收（命令）
1. ⑤ 改为：reload 前切到另一个 bot（`MAIN_TITLE` 或 OL-E2），reload 后、开面板前断言 `devState(page).views[a]` 为 undefined（把前置写成断言，防止以后又悄悄失效），再开 OL-E1 面板断言历史出现。
2. 变异：注释掉 `data.ts` 里 `if (!views.has(id)) openFollow(id)` → `test:e2e tests/e2e/outline.spec.ts -g "⑤"` **红**（贴输出）→ 还原 → 绿。
3. `test:e2e tests/e2e/outline.spec.ts` → 5 passed。

## 为什么这样验收
回归格的价值只在于修复被拿掉时它会红；前置断言（view 不存在）让「场景已不再复现 bug」这种失效变成显式失败。

## 产出
- `app/ui/tests/e2e/outline.spec.ts`；回执 `receipts/T21b.md`（变异前后输出）
