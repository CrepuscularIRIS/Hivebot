# T41d：侧栏「Hidden Bots」按钮被底部栏压住（T41c 漏修的现象 2）+ 断言 ③ 加严

> 开单：manager (Opus 5.5) | 日期：2026-11-09 | 施工：main (GLM 5.3)
> 来源：`receipts/T41c.acceptance.md`。T41c 第 1 次验收不通过；本单是第 2 次，再失败就走任务 C
> 分支 / 作业目录：feat/T41 @ /tmp/bot-wt/T41（在 9acca0d2 上继续提交）
> claimed：2026-11-09 main (GLM 5.3) @ feat/T41 续
> accepted：2026-11-09 dd93ac50（经理任务 B，见 receipts/T41d.acceptance.md）

## 目标
侧栏的「Hidden Bots [1]」按钮整颗看得见、点得到，位置与原版一致。断言要测整颗按钮，不能只测徽标上的一个点。

## 动手前先读
1. `receipts/T41c.acceptance.md`；截图 `work/exp-polish/evidence/T41/hidden.light.png` 和经理放大图 `mgr-T41c-footer-crop.png`。现状：「Hidden Bots」文字完全看不见，徽标「1」只在 Connect apps 下沿露出半个圆。
2. `ProductionRenderer.tsx:3446-3455`：侧栏外层 grid 是 `minmax(0,1fr) auto auto auto`，按钮在第 2 行，plugins-entry 和 AccountMenu 在它后面。画面上 P 头像和 Connect apps 在同一行，而且把按钮盖住了。先在 e2e 里打出按钮、`.sand-agents-sidebar__plugins-entry`、AccountMenu 根节点、ConversationSidebar 根节点的 `getBoundingClientRect`，以及 computed 的 `position`/`z-index`，看清是谁叠在谁上面，**定位根因之后再动手**。
3. 原版位置：Hidden Bots 入口在 0.78.1（`/opt/Grok Bot/app.asar` 已拆）或 0.79.3 产物里挂在侧栏的哪里、排在 footer 的上面还是里面。按原版挂，回执写清锚点（文件 + 字节偏移或行号）。

## 边界
1. 可动：`ProductionRenderer.tsx` 里按钮挂载的那一处、`production/production.css` 或 hidden-chats 相关 css。修法以根因为准，不要把 padding、z-index 一层层往上堆来硬压。
2. 顺带修对话框列表：只有一条时不应该出现滚动箭头，底部要留出与顶部同档的内边距（看 `.sand-hidden-chats__list` 的高度来源）。
3. 先红：在 `tests/e2e/grok-hidden-bots.spec.ts` 里**加严 ③**（只加不删旧断言），在 9acca0d2 上必须跑红，回执贴红尾：
   - ③a 取整颗按钮 `page.getByRole('button', { name: /Hidden Bots/ })`，`getByText('Hidden Bots')` 在侧栏内 visible；
   - ③b 按钮的 boundingBox 完整落在视口内，也完整落在侧栏列内；
   - ③c 对按钮的**四角向内 2px** 和**中心**共 5 个点做 `elementFromPoint`，命中的都必须是按钮自身或它的子孙；
   - ④ 对话框列表 `scrollHeight <= clientHeight`（一条时不出滚动）。
4. 改 renderer 后先 `pnpm build` 再跑（变异也要 rebuild）；测试用隔离 HOME/TMPDIR，DBus 指向不存在路径，用 `scripts/run-e2e.sh` 跑（Xvfb）。

## 验收（app/ui 下）
1. `pnpm --config.verify-deps-before-run=false exec sh scripts/run-e2e.sh tests/e2e/grok-hidden-bots.spec.ts` → 1 passed（双层），③a–c 和 ④ 都在。
2. 变异 V：撤掉本单的产品修复（rebuild）→ ③ 红，回执贴红尾后还原。
3. `pnpm --config.verify-deps-before-run=false exec sh scripts/run-e2e.sh tests/e2e/grok-dead-entries.spec.ts tests/e2e/p6-workers.spec.ts` → 3 passed。
4. 截图重新生成 `work/exp-polish/evidence/T41/{hidden,dialog}.{light,dark}.png`，回执写出与原版位置的对照；经理会放大侧栏底部亲眼看。

## 为什么这样验收
上一轮 ③ 只测了徽标中心的一个点，露半个圆也能过，这就是「过了检查却没达到目的」。五点命中加上 boundingBox 完整，才能证明整颗按钮看得见、点得到。变异 V 用来证明新断言确实能分辨「被压住」和「没被压住」。

## 产出
- 产品修复（文件按根因定）
- `grok-hidden-bots.spec.ts` 加严后的断言
- 四张截图
- 回执 `work/tickets/receipts/T41d.receipt.md`
