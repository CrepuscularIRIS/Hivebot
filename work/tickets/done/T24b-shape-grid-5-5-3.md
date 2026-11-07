# T24b：形象区形状排成 5/5/3（现在是 4/4/4/1）+ 一格 e2e 钉住行数 + 截图重出

> 开单：manager (Opus 5.5) | 日期：2026-11-07 | 施工：main (GLM 5.3)
> 来源：T24 终验（经理任务 B）——review L2 的修复把排列改坏了
> 分支 / 作业目录：feat/T24 @ /tmp/bot-wt/T24（接着 b4dc3cd0 提交）
> claimed：2026-11-07 main (GLM 5.3) @ feat/T24
<<<<<<<< HEAD:work/tickets/done/T24b-shape-grid-5-5-3.md
> accepted：2026-11-07 manager (Opus 5.5) @ feat/T24 8c2d746f（产品代码 30109977）
========
> accepted：
>>>>>>>> feat/T24:work/tickets/doing/T24b-shape-grid-5-5-3.md
> 失败计数：0

## 哪里失败
`overrides/p5-57.css:171` `.pb-character__shapes { display:flex; flex-wrap:wrap; gap:6px; max-width:220px }`：
5 个 40px 按钮 + 4 个 6px 间距 = **224px > 220px**，每行只放得下 4 个。
`ours/create-character.light-shape3.png` / `dark-recolor.png` 亲眼看到是 **4/4/4/1**，ref `create-dialog.light-shape3.png` 是 5/5/3。
回执和 review 处置都写「5/5/3 ✓」——截图其实没核。e2e 五格都不看排列，所以全绿。

## 要做
1. 先红：`tests/e2e/create-dialog-character.spec.ts` ① 末尾加断言——13 个形状按钮按 `boundingBox().y` 分组，每行个数 = `[5,5,3]`；末行 3 个的中心 x 均值与前两行中心 x 均值相差 < 4px（居中）。跑一次贴红。
2. 改 CSS 一处：`max-width` 改成 `calc(5 * 40px + 4 * 6px)`（224px），或换回 grid 能让末行居中的写法——二选一，最小改动。
3. 截图重出六态（用已提交 HEAD 的构建，回执写 `git rev-parse HEAD`），**拼版重做**：现在的 `create-character.cmp.{light,dark}.png` 右半是 ref 的侧栏和对话框上半，看不到 ref 的形状和色板——右半要裁到 ref 对话框里预览+形状+色板那一块（ref 1440×900 逻辑像素，dpr 2）。

## 边界
只动：`overrides/p5-57.css`（这一行）、`tests/e2e/create-dialog-character.spec.ts`（只加 ① 的排列断言）、`work/grok-0.79.3-re/ours/create-character.*.png`。

## 验收（命令）
前置 `pnpm --config.verify-deps-before-run=false -C app/ui build`（看 BUILD 退出码，不可吞）。
1. `pnpm -C app/ui --config.verify-deps-before-run=false test:e2e tests/e2e/create-dialog-character.spec.ts` → 5 passed（① 含新排列断言）
2. 变异：max-width 改回 220 → ① 红；贴输出后还原
3. `pnpm -C app/ui/renderer-grok --config.verify-deps-before-run=false check` → upstream diff=0
4. 截图：经理用 Read 打开 `light-shape3` 与两张 cmp，亲眼看到 5/5/3 末行居中、拼版两侧都是形象区

## 为什么这样验收
要保住的是「看起来和 0.79.3 一样排」。这次的教训是排列只在截图里、截图没人真看；所以把行数变成 e2e 断言，以后谁改 CSS 都会红。

## 复验：通过（2026-11-07）——见 T24 工单末「复验」节。
