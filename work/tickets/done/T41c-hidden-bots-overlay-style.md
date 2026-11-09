# T41c：Hidden Bots 对话框与侧栏徽标排版坏了（T41 视觉返修）

> 开单：manager (Opus 5.5) | 日期：2026-11-09 | 施工：main (GLM 5.3)
> 来源：`receipts/T41b.acceptance.md`「截图核实」
> 分支 / 作业目录：feat/T41 @ /tmp/bot-wt/T41（接着同一分支提交）
> claimed：2026-11-09 main (GLM 5.3) @ feat/T41 续
> accepted：2026-11-09 dd93ac50（经理任务 B，见 receipts/T41d.acceptance.md）

## 现象（经理亲眼看 T41b 四张截图，`work/exp-polish/evidence/T41/`）
1. **对话框**（`dialog.{light,dark}.png`）：标题/说明贴边无内边距；关闭钮 × 掉到正文下方单独一行；条目行只剩头像缩写「HM」与「Unhide」叠在一起，**bot 名字看不见**，底部被裁。藏两个以上 bot 时用户分不清哪个是哪个。
2. **侧栏徽标**（`hidden.{light,dark}.png`）：「Hidden Bots」按钮被底部 Connect apps 栏压住，只露出徽标「1」的上半截。

## 已知线索（不用再查，施工时先验证）
上游 `recovered/features/hidden-chats/overlay/view.tsx` 用的原子类有一部分**不在构建产物 CSS 里**：`out/renderer/assets/*.css` 里 `.sand-1348h9v`（dialog）、`.sand-z9dl7a`（header）、`.sand-yamay9`（list）为 0 条；`.sand-78zum5`、`.sand-euugli`、`.sand-2lah0s` 在。疑似原子样式表只收了别处用到的类。徽标按钮在 `ProductionRenderer.tsx:3452`，看它在侧栏 footer 里的位置与 0.78.1 / 0.79.3 原版是否一致。

## 边界
1. 按「原版即规格」：样式值从 0.18 重构源码 / 0.78.1 或 0.79.3 产物里找（原子类定义、footer 布局），**补齐缺的原子类定义或改正挂载位置**；不自己设计新样式。
2. 可动：renderer-grok 的样式表 / overrides、T41 相关 shim。不动对话框逻辑与 T41/T41b 已过的测试断言。
3. 先红：在 `tests/e2e/grok-hidden-bots.spec.ts` 加断言（只加不改）后跑红——①对话框里 bot 名字可见（`getByText('Hide me bot')` 在 dialog 内 visible）；② dialog `padding` 或 header 的 computed style 与原版值一致（取一个原版有的数值）；③徽标按钮整块在视口内且不被 footer 遮挡（`elementFromPoint` 取按钮中心点命中的是按钮自身或其子孙）。
4. 隔离 HOME / TMPDIR，DBus 指向不存在路径；改 renderer 后 `pnpm build` 再跑（变异/验证都要带 rebuild）。

## 验收
（`app/ui` 下）
1. `pnpm --config.verify-deps-before-run=false exec playwright test tests/e2e/grok-hidden-bots.spec.ts` → 1 passed（双层），新增三条断言都在。
2. `pnpm --config.verify-deps-before-run=false exec playwright test tests/e2e/grok-dead-entries.spec.ts tests/e2e/p6-workers.spec.ts` → 3 passed（样式改动没碰坏别处）。
3. 截图覆盖 `work/exp-polish/evidence/T41/{hidden,dialog}.{light,dark}.png`，回执写清与原版参考图（或原版样式值）的对照；经理会亲眼看。

## 为什么这样验收
T41 的目的是「不删也能把 bot 收起来、要时能找回」。找回的界面看不见名字、入口被压住，功能链 e2e 绿也等于没交付。断言 ①③ 守「能认出、能点到」，② 守样式确实来自原版而不是随手补的 padding。

## 产出
- 样式修复（文件按根因定）+ `grok-hidden-bots.spec.ts` 新断言
- 四张截图
- 回执 `work/tickets/receipts/T41c.receipt.md`
