# T45c：T45a 返修——一次动画回 idle、拖动松手、e2e 真状态链、六态截图真驱动

> 开单：manager (Opus 5.5) | 日期：2026-11-09 | 施工：main (GLM 5.3)
> 来源：T45a 修复单。审查 `receipts/T45a.review.md` M1–M4 已经核实全部属实，另有经理补查的漏交验收项，见 `receipts/T45a.acceptance.md`
> 分支 / 作业目录：继续 feat/T45a @ /tmp/bot-wt/T45a（在 e2662092 上追加提交）
> claimed：2026-11-09 main (GLM 5.3) @ feat/T45a 续
> accepted：2026-11-09 manager (Opus 5.5) @ feat/T45a 7749653b（见 receipts/T45c.acceptance.md）

## 目标
宠物页的行为符合 T45a 规格：一次动画播完回 idle，松手后停止跟随。e2e 和截图真能区分各个状态，「恒 idle」实现必须红。

## 动手前先读
1. `receipts/T45a.acceptance.md`（核实证据与探针 `/tmp/t45a-mgr/probe.mjs`：用 node vm 执行 pet.js 的写法可以直接改成单测）
2. T45a 工单的「规格」「验收 6、7」
3. `tests/e2e/p6-notify.spec.ts`：测试插件投任务、挂审批的写法

## 修复项
1. **M1**（`pet/pet.js`）：error/success 的 `ended` 触发后，在页面内把 `current` 切成 `idle`，同步 `body.dataset.state='idle'`，再 render 待机循环。点击动画结束时回到当前 state，行为不变。
2. **M2**（`pet/pet.js`）：pointerup 的所有路径都先 `down = null`。加 `pointercancel` / `lostpointercapture`，与 pointerup 同样处理。pointerdown 时 `setPointerCapture`。
3. **M4**（`preload/pet.ts`）：删掉 `__petListenersInRenderer` 测试钩子，产品 preload 里不留测试口。e2e 改为在 main 进程驱动：`shell.app.evaluate(({ BrowserWindow }, s) => …webContents.send('pet:state', { state: s }))`，按 URL 找宠物窗。
4. **M3 + 验收 6 补全**（`tests/e2e/pet.spec.ts`）：用测试插件给 bot 投一个会挂审批的任务，然后**轮询**等待各个状态依次出现（不靠固定 sleep 采样）：`idle` →（`thinking` 或 `working`）→ `waiting` → 批准 → `success` → `idle`。每一档都断言 `currentSrc` 解码后的文件名等于规格表里该档的动画，并且 `readyState≥2`。点宠物窗后断言主窗 focus：Xvfb 拿不到焦点时，改为断言 main 侧 show/focus 调用计数，回执写明用的是哪一种。
5. **六态截图**：每张截图前先断言 `data-state`、`currentSrc` 文件名、`readyState≥2`，再截图。error/success 要在 ended 之前截。

## 边界
1. 只动：`app/ui/pet/pet.js`、`app/ui/preload/pet.ts`、`app/ui/tests/e2e/pet.spec.ts`，以及新单测 `app/ui/tests/unit/pet/pet-page.test.ts`（vm 执行 pet.js + 假 video/window）。e2e 要借用测试插件时，只能复用已有的 support，不改 SDK。
2. 先写失败测试：`pet-page.test.ts` 的 ⑪ success ended 后 `data-state==='idle'` 且 src 变为待机呼吸；⑫ 按下 → 移动 → 松开 → 再 move 时不发 `pet.move`；⑬ pointercancel 同 ⑫。三格在 e2662092 上必须红，回执贴红尾。
3. 测试走隔离 HOME / TMPDIR，DBus 指向不存在路径。只跑下面列出的 e2e。

## 验收（写命令，不写感觉；均在 app/ui 下）
1. `pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/pet/pet-page.test.ts tests/unit/grok-shim/pet.test.ts tests/unit/shell/pet-ipc.test.ts` → 13 passed
2. 变异（每把刀各改一处，跑对应格必须红，回执贴红尾后还原）：
   - V5：把 M1 修复还原成 `overriding=null; render()` → ⑪ 红
   - V6：pointerup 拖动分支里删掉 `down=null` → ⑫ 红
   - V7：把 e2e 驱动的宠物页 `onState` 改成恒 `current='idle'` → `pet.spec.ts` 红（**这一刀直接证明 M3 已修**）
3. `pnpm exec sh scripts/run-e2e.sh tests/e2e/pet.spec.ts` → 1 passed；`pnpm exec sh scripts/run-e2e.sh tests/e2e/p6-notify.spec.ts tests/e2e/p6-workers.spec.ts` → 原样通过。贴命令和输出尾部。
4. `pnpm --config.verify-deps-before-run=false build && ls out/renderer/pet/assets/fish/*.webm | wc -l` → `8`（T45a 工单写的 9 是笔误）；`ls out/preload/` 下有 pet 产物。
5. 覆盖：`@vitest/coverage-v8` 没装，照 T23 先例手工核算，列出 `shim/src/pet.ts`、`main/pet/*.ts`、`pet/pet.js` 的每个分支分别由哪一格触达，未触达的写明理由。
6. 截图：重生成 `work/exp-polish/evidence/T45a/*.png`，经理亲自打开看，六张动作必须不同。

## 为什么这样验收
- ⑪–⑬ + V5/V6 钉住页面行为，T45a 的 10 格只管推导和 IPC，碰不到页面。
- V7 证明 e2e 能分辨状态。上一版就是「过了检查却没达到目的」的典型：恒 idle 也全绿。
- 截图前先断言 currentSrc，免得文件名声称是六态、画面其实全是待机。

## 产出
- `pet/pet.js`、`preload/pet.ts`、`tests/e2e/pet.spec.ts`、`tests/unit/pet/pet-page.test.ts`
- 回执 `work/tickets/receipts/T45c.receipt.md`；截图更新
