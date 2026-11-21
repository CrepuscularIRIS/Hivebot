# T71c：Installed 预览条露字「Installed」；Installed 错误态也给 Index sources 入口

> 开单：manager (Opus 5.5) | 日期：2026-11-12 | 施工：main (GLM 5.3)
> 来源：T71 验收（receipts/T71-T72.acceptance.md「跟进」①②）
> 分支 / 作业目录：feat/T71c，从 T71(+T71b)+T72 合并后的集成分支起；小改动可直接在集成分支
> claimed：2026-11-12 main (GLM 5.3) @ feat/T71c=53aa65e5（基于 67ec58ec）
> accepted：2026-11-12 manager (Opus 5.5) @ feat/T71c=53aa65e5

## 目标
T71 把 Installed 预览条改成恒渲染后，零安装时主页首行是一个只有「0 ›」的无字小药丸（亲检 `evidence/T71/connect-main-light.png`），用户看不懂、也不知道 Index sources 在它后面。原版首页就是「Installed」字样一栏（RE-CONNECTORS-0.78.1 §1 末 `front`：Installed + 分类浏览；动词表 `eQkgKV` = "Installed"）。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md（:186 比字不只比框）
2. `app/ui/renderer-grok/overrides/modules/market-surface.tsx`：`InstalledPreview`（:71-78）、`mine` 分支（:242-257）
3. `work/grok-0.79.3-re/RE-CONNECTORS-0.78.1.md` §1、§2.1

## 方案
1. `InstalledPreview` 加可见文字「Installed」（在图标堆前），计数保留在后；零安装时只显示「Installed ›」不显示「0」（`data-installed-count` 元素保留，market.spec T51 计数断言读它——零时可渲染空或隐藏，施工前先 grep 该锚的全部断言再定，不改断言语义）。
2. `mine` 分支 `bundlesError !== null` 时也追加 `sourcesBtn`（现只在空态 / 有列表时有——listBundles 失败用户就够不到 Index sources，T71 之前顶部钮恒在，这是 T71 引入的退化）。

## 边界
1. 只动：`market-surface.tsx`、对应 CSS（若需）、`tests/unit/grok-shim/p5-57.test.ts`、`tests/e2e/t69-connect-picks.spec.ts`（只加断言）。
2. 先写失败测试：t69 开箱段加 `expect(page.locator('[data-action="your-plugins"]')).toContainText('Installed')`；p5-57 加源码契约格：`bundlesError` 分支后紧跟 `sourcesBtn`。看红。
3. 隔离 HOME / TMPDIR；不跑全量 e2e。

## 验收
1. `cd app/ui && ./node_modules/.bin/vitest run tests/unit/grok-shim/p5-57.test.ts tests/unit/market-picks.test.ts` → 全 passed，新增 ≥1 格
2. `pnpm build` 后 `sh scripts/run-e2e.sh tests/e2e/t69-connect-picks.spec.ts tests/e2e/market.spec.ts tests/e2e/t58-market-layout.spec.ts` → 全 passed，0 skip
3. 截图 DPR=2 亮暗各一 `work/ui-borders-connect/evidence/T71c/connect-main-{light,dark}.png`：首行可读「Installed ›」、无孤立数字「0」、无 Filesystem。

## 为什么这样验收
要保住的是「用户在主页一眼认得出 Installed 入口，并且 Index sources 在任何数据状态下都够得到」。只断言 DOM 有字不够——截图防字被挤掉或对比度不可读。

## 产出
- `market-surface.tsx` 两处 + 上列测试；回执 `receipts/T71c.receipt.md`
