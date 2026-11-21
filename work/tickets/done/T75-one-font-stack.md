# T75：全应用一套字体栈（设置 / 市场 / 建 bot 对话框字体与主界面不一致）

> 开单：manager (Opus 5.5) | 日期：2026-11-12 | 施工：main (GLM 5.3)
> 来源：work/ui-borders-connect/BRIEF.md 2026-11-12「…很多的字体大小…」；立项取证 work/ui-quality/PLAN.md 主题 A1
> 分支 / 作业目录：feat/T75 @ /tmp/bot-wt/T75
> claimed：2026-11-12 main (GLM 5.3) @ feat/T75=d48a9f3d
> accepted：2026-11-12 manager (Opus 5.5) 终验 @ feat/T75=f007d447

## 目标
所有界面（主壳、设置、Connect 市场、建 bot 对话框、命令面板、菜单、onboarding）计算后的 font-family 都是 0.78.1 的系统栈 `var(--cursor-font-family-sans)`（= `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`）。

## 根因（经理取证，`work/ui-quality/evidence/tour/probe2.json`）
现在一个应用里三套字体栈，Linux 上落到两种不同字形（截图里设置 / 市场 / 建 bot 明显是另一种字体）：
| 面 | computed font-family | 来源 |
|---|---|---|
| 主壳 / 会话 / 侧栏 / 面板 / 菜单 | `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` | 正确（production.css:13） |
| 设置对话框 | `Inter, ui-sans-serif, system-ui, sans-serif` | `recovered/features/settings/overlay/view.css:14` `font: 13px/1.4 Inter…` |
| 市场 / 建 bot 对话框 | `system-ui, sans-serif` | `overrides/p5-57.css:11` `var(--sand-font-family, system-ui, sans-serif)`（`--sand-font-family` 从未定义，回落）；`recovered/features/plugins/overlay/browser.css:3` 同类 |
规格：`work/grok-0.79.3-re/RE-UI-LAYOUT-0.78.1.md` §6「字体栈」行——全平台同栈，Linux 落 sans-serif 默认。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md（T57 设置域 `font:inherit` 简写连 line-height 一起继承那条）
2. 上表三处；先 `grep -rnE "font(-family)?:[^;]*(Inter|system-ui|--sand-font-family)" app/ui/renderer-grok/{overrides,frontend/src}` 列全，回执贴原样输出
3. 注意 `font:` 简写同时设了字号 / 行高：只换族、**不改字号行高**（字号体系是 T76 的事，别在这张单里顺手改）

## 边界
1. 只动：上面 grep 列出的 CSS 声明（只改 family 部分）。新增 `app/ui/tests/e2e/t75-font-stack.spec.ts`。
2. 先写失败测试：spec 在当前主线跑红（设置 / 市场 / 建 bot 三格）。
3. 隔离环境；不跑全量 e2e。只在 feat/T75 提交。

## 验收（写命令，不写感觉）
1. `cd app/ui && pnpm build && sh scripts/run-e2e.sh tests/e2e/t75-font-stack.spec.ts` → passed。spec 打开设置、Connect 市场（列表 + 详情）、建 bot 对话框、命令面板、侧栏右键菜单、账户菜单，对每个面的**容器和其内全部可见文字元素**取 computed fontFamily，断言全部等于 `getComputedStyle(documentElement).getPropertyValue('--cursor-font-family-sans')` 规范化后的值（icon font `cursor-icons` 元素排除）。
2. 同 spec 内断言字号未变：设置 h2 仍 17px、市场 h2 仍 15px、建 bot 名字输入仍 15px（防顺手改字号）。
3. 回归：`sh scripts/run-e2e.sh tests/e2e/t57-settings-layout.spec.ts tests/e2e/t58-market-layout.spec.ts tests/e2e/create-dialog-0793.spec.ts` → 全 passed。
4. 截图 `work/ui-quality/evidence/T75/{settings,market,new-bot}.{light,dark}.png`（DPR2），与 `work/ui-quality/evidence/tour/` 同名图前后对比；经理亲看字形一致。

## 为什么这样验收
用户说的「字体」第一眼就是同一窗口里两种字形。断言「全部文字元素」而不是只抽容器，是因为子元素各自的 `font:` 简写会把族再覆盖一遍；断言字号不变是把这张单和字阶单（T76）隔开，免得一张单里混两种改动、出了问题分不清。

## 产出
- 上述 CSS 声明（family 部分）
- `app/ui/tests/e2e/t75-font-stack.spec.ts`
- `work/ui-quality/evidence/T75/*.png`、`work/tickets/receipts/T75.receipt.md`

## 经理验收（任务 B，2026-11-12）：返修（只差证据，代码与断言通过）
- 亲跑：`run-e2e.sh tests/e2e/t75-font-stack.spec.ts` → **1 passed (5.3s)**；抽查回归 t57 → **1 passed (5.1s)**。改动范围 d8669f67..13ac55c4：七处 font 声明只换族 + spec，符合边界；字号锚点 17/15/15 有断言。
- 核实 Sol 审补三面：市场详情 `[data-market-detail]` toBeVisible + sawText + offenders=[]；侧栏右键菜单 `[data-component="menu-popup"]` toBeVisible 是硬门 + sawText；composer 输入区 fontFamily===token。三条都在 spec 里，不空转。
- 返修项：验收 4 未做——`work/ui-quality/evidence/T75/` 目录不存在，回执也没提。补拍 `{settings,market,new-bot}.{light,dark}.png`（DPR2），与 `evidence/tour/` 同名图对照，回执贴路径；经理亲检后通过。不需要改代码。
- 合并提示：与 T73c 同改 `overrides/modules/local-tool-view.tsx`（queue.md 里写的「文件互不相交」不成立），合并须三方合并。

## 终验（manager Opus 5.5，2026-11-12）——通过
- 提交链：7c8fd9ca → d48a9f3d → 13ac55c4 → f007d447（补拍六张）；工作区干净。改动七处 font 声明只换族 + spec，范围内。
- 亲跑：`t75-font-stack.spec.ts` → **1 passed (7.1s)**（六张截图由本次亲跑重生成）。
- 亲检：settings.light/dark 与 tour/settings-general.light 对照——tour 是另一族（字面更宽的 Noto/Inter 系），T75 后设置与主壳同一无衬线；market.dark 标题/列表名/描述/按钮同一族；new-bot.dark 标题与输入占位同一族。无混族。
- 证据瑕疵（不挡）：market.light / new-bot.light 拍在对话框淡入中途（半透明、市场列表还是骨架），字形可读的只有标题；字体结论以同面暗色图 + settings.light 为准。T76 起截图前等动画结束（等 `[data-open]` 稳定或列表首项可见）。
- 合并：与 T73c 同改 `overrides/modules/local-tool-view.tsx`，三方合并。
