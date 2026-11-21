# T67：composer 输入框四态描边 + 双圆角 + 拖拽态对齐 0.78.1

> 开单：manager (Opus 5.5) | 日期：2026-11-11 | 施工：main (GLM 5.3)
> 来源：`work/ui-borders-connect/BRIEF.md`；规格 `work/grok-0.79.3-re/RE-BORDERS-0.78.1.md` §2.3（REA 标「最大嫌疑点」）；实测参照 `work/p5-parity/evidence/P5-55/ref-computed/conv-rest.{light,dark}.txt:36-38`
> 分支 / 作业目录：feat/T67 @ /tmp/bot-wt/T67（从当前集成分支开；与 T66 同改 p5-55-layout.css 但不同节，可并行，合并走 `--no-ff` 三方）
> claimed：9b67e058（四态+双圆角+过渡+圆钮环全绿 1p；变异红；回归 5p；截图亲检——doing 待批审）
> accepted：2026-11-12 manager(Opus 5.5) @06153370（集成 HEAD 86f238c7）——spec 1p 重跑绿；Sol MINOR 补强核实（双钮存在+spread .5px 正则；环色只锁 RGB 未锁 alpha，残余已记）；见 receipts/T58-66-67.acceptance.md

## 目标
composer 外框（`.sand-prompt-shell`）按原版四态联动：静息 `.5px secondary` → hover / focus-within 升 `primary` → 拖文件悬停变 `accent`；圆角收起 22 / 展开 18。今天是**恒定 1px primary**（p5-55-layout.css:291），拖拽是另画一个 2px 虚线框（view.css:313）——四态里三态不对。

## 经理定的口径（不用再问）
1. **为什么现在是 1px primary**：P5-55 的 0.78.1 实测（conv-rest:36）读到 `1px solid rgba(28,28,28,.24)`——那是 DPR=1 把 .5 读成 1、且对照台 composer 自动聚焦（focus 态 = primary）。与 REA 静态值（静息 secondary）不矛盾。所以：宽度改 .5px，静息色改 secondary，focus / hover 用 primary。
2. **过渡时长保留实测 .3s / .3s / .15s / .15s**（conv-rest:36 运行时读到的），不按 REA 静态 .12s 改——运行时实测优先于静态推导（REA §6 局限 1）。
3. **展开判定沿用 0.18 的 `data-expanded`**（recovered composer.tsx:163 = `hasPayload`）：有内容 → 18，空 → 22。REA §6 局限 2 说原版 isExpanded 条件未运行验证；0.18 重构源是原版的源码级参照，按它定，不另造条件。展开时高度不能被 `height:44px !important`（p5-55-layout.css:289）锁死：`[data-expanded]` 下 `height:auto; min-height:44px`，多行时外框长高。
4. **拖拽态**：原版是外框边色整体变 accent（`sand-vd4qke` 等），不是内嵌虚线框。用 `.sand-prompt-shell:has(> .sand-chat-drop-overlay)` 改外框边色 = `--sand-border-accent-primary`；overlay 本身去掉 `2px dashed` 边与底色（border 0、背景透明）。overlay 里的「Drop files to add to chat」徽标**保留**（REA 没说原版没有，不删行为；回执存疑项记一笔）。**不改 TSX**。
5. 底色 `--sand-bg-elevated`、三层字面黑阴影已对（:290 / :292），只断言不改。
6. 内层圆钮（mic / attach / send）：原版 `inset 0 0 0 .5px tertiary` 环（§2.3 APP@2818306）。第 0 步实测我方这几个钮的 box-shadow / border，不一致就在同一节补。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md 末条（DPR / 特异性）
2. RE-BORDERS §1 token 表、§2.3
3. `overrides/p5-55-layout.css:286-303`（composer 节）、recovered `view.css:304`（`.sand-prompt-shell`）/ `:313`（drop overlay）、recovered `composer.tsx:160-165`
4. 现有 composer 相关断言：`grep -rn "sand-prompt-shell" app/ui/tests/e2e`（theme-dual / settings / visual 等）——改完要它们仍绿

## 边界
1. 只动：`overrides/p5-55-layout.css` composer 节（:286-303 及紧邻新增行）、新 `app/ui/tests/e2e/t67-composer-frame.spec.ts`。**不碰** view.css、composer.tsx、调色板。
2. 先写失败测试：`t67-composer-frame.spec.ts` 静息格（期望 0.5px + secondary）先跑红。
3. 色值走 token 求值比对，不写死。
4. 测试走隔离 HOME / TMPDIR，DBus 指不存在路径；不跑全量 e2e。

## 验收（写命令，不写感觉）
（先 `pnpm build`；e2e `CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh <spec>`）
1. `… run-e2e.sh tests/e2e/t67-composer-frame.spec.ts` → passed。`extraArgs: ['--force-device-scale-factor=2']`，第一格断言 `devicePixelRatio === 2`；亮暗各一遍，对 `.sand-prompt-shell` 读 computed：
   - 静息（`document.activeElement.blur()` 后、鼠标移到侧栏）：`borderTopWidth '0.5px'`、`borderTopColor` = `--sand-border-secondary-translucent` 求值、`borderRadius '22px'`、`height 44`
   - hover（`page.mouse.move` 到 shell 中心，未聚焦）：边色 = primary 求值
   - focus（点进输入区）：边色 = primary 求值
   - 拖拽：在 shell 上 `dispatchEvent('dragenter', { dataTransfer })`（带一个 File）→ 外框边色 = `--sand-border-accent-primary` 求值；`.sand-chat-drop-overlay` 的 `borderTopWidth '0px'`；dragleave 后回到 focus / 静息色
   - 展开：输入 3 行（Shift+Enter）→ `borderRadius '18px'` 且 rect 高 > 44；清空 → 22 / 44
   - transition：`transitionDuration` 含 `0.3s, 0.3s, 0.15s, 0.15s`（锁实测值）
   - 内层圆钮：按第 0 步结论断言 `inset 0 0 0 .5px` tertiary 环
   - 变异：p5-55-layout.css 静息色改回 primary → 静息格红（变异刀规矩同 T66）
2. 回归：`… run-e2e.sh tests/e2e/theme-dual.spec.ts tests/e2e/settings.spec.ts tests/e2e/t50a-no-key.spec.ts` → 全 passed（composer 被这几条用到；若某格断言了旧 1px / primary 静息值，按新规格改期望并在回执贴前后，列为边界外第三个文件）
3. 截图（Read 亲眼看）：`work/ui-borders-connect/evidence/T67/composer-{rest,hover,focus,drag,expanded}-{light,dark}@2x.png`（只截 composer 区 + 上下 40px）；`rest` / `focus` 与 `P5-55/compare/pairs/conv-rest.*.png` 的 composer 区并排，回执写边线像素灰度
4. `git diff --stat <起点>..HEAD` 只含边界 1 的文件（+ 验收 2 允许的期望修正）

## 为什么这样验收
- 要保住的是「静息时边很淡、一碰就加深、拖文件时整圈变蓝」这个原版手感。四态逐个读 computed 才能证明联动在；只读一个静息值会漏掉 hover / drag 两个今天就错的态。
- DPR=2 是前提：否则 .5px 读回 1px，宽度格恒绿（T57 教训）。
- 展开态要同时看圆角和高度——只改圆角而高度仍锁 44 等于没展开。

## 产出
- 边界 1 的改动；`receipts/T67.receipt.md`（含第 0 步内层圆钮实测、徽标保留的存疑项）；`work/ui-borders-connect/evidence/T67/` 截图
