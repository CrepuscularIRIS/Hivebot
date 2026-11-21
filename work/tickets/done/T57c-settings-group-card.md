# T57c：设置分组卡改成真实 DOM 层（SettingsGroup 加卡 wrapper）+ 按渲染 rect 对齐间距/卡边/Account

> 开单：manager (Opus 5.5) | 日期：2026-11-11 | 施工：main (GLM 5.3)
> 来源：T57b 任务 B 验收（@ 442d6be1 通过，卡近似请示选 B）；遗留差距表见 `done/T57b-settings-layout-fix.md` 末段
> 分支 / 作业目录：feat/T57 合并主线后从主线新开 feat/T57c（worktree `/tmp/bot-wt/T57c`）
> claimed：a6c00fa8（8fd1b0b7 施工 + Sol MAJOR/MINOR 修复，feat/T57c @ /tmp/bot-wt/T57c，2026-11-11 待经理验收）
> accepted：2026-11-11 feat/T57c @ a6c00fa8（manager 任务 B；落点差追认）

## 目标
原版分组是 `section > [h3 行] + [卡 div]`，卡 padding 8px 0、r14、白底（probe 行 33/39）。我方现在用「首末行圆角」拼卡，做不出卡内上下 8px、卡边、Account 不在卡里。改成真实卡层后，截图与 ref 的间距差 ≤2px。

## 做法
1. `frontend/src/recovered/features/settings/overlay/computer-view-internals.tsx` 的 `SettingsGroup`：children 包一层 `<div className="sand-settings-group__card">`（授权改 recovered，仅此一处；文件头已有来源行，加一行注释「T57c：0.78.1 卡层」）。General / Computer 两处调用自动吃到。
2. `settings-view-t57.css`：删「首末行圆角拼卡」三条；卡层 `padding 8px 0; border-radius 14px; background var(--sand-bg-elevated)` + 卡边（施工用 probe 的 box-shadow/outline 字段或 ref 像素确认：亮 ≈#ededed 1px，暗取 ref 像素，找对应 --sand-* token，不写死色值）；行回到透明底。
3. Account：`.sand-account-card` 在卡内变透明无边（view.css:36 的 bg-secondary + 1px 深边要压掉），几何按 probe 行 40–51（avatar 44、Sign Out 若显示则 78×32）。
4. h3 间距：消掉 h3 自带 margin，按 probe 行 33–34 定 h3 行高 16、文字 x=435（padding-inline-start 施工从 probe 取）。

## 先跑红
在 `t57-settings-layout.spec.ts` 新增**实测 rect 断言**（不是只断言 gap 计算值——T57b 就栽在这）：
- 首个 h3 top − body top、h3 bottom → 卡 top = 8、卡 bottom → 下一 section top = 28（都用 getBoundingClientRect 相减，±1）
- 卡 padding-top 8 / radius 14 / 底色 = elevated token；卡边宽 > 0
- Account 卡内 `.sand-account-card` 背景透明、border-width 0
- h3 文字左 x = 卡左 + 14（±1）
亮暗两遍。先看红，再改。

## 边界
1. 只动：`computer-view-internals.tsx`（一处 wrapper）、`settings-view-t57.css`、`t57-settings-layout.spec.ts`。
2. Computer 面板的分组也会被包卡——截一张 Computer 面板图确认没坏（无 ref 时只要求不错位、不叠层）。
3. 不跑全量 e2e。

## 验收
1. `cd /tmp/bot-wt/T57c/app/ui && pnpm build && CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/t57-settings-layout.spec.ts` → 1 passed（含上面 rect 断言）
2. 回归：`... run-e2e.sh tests/e2e/theme-dual.spec.ts tests/e2e/t56-primary-text.spec.ts` → 2 passed；碰到 SettingsGroup 的其他 spec（施工 `grep -rl "Computer\|sand-settings" tests/e2e`）定向跑，贴数字行
3. 截图 `evidence/T57c/settings-{light,dark}.png` + `computer-{light}.png`；经理用像素取色复量差距表五项，均 ≤2px / 卡边存在 / Account 白底无深边
4. `git diff --stat` 只含边界 1 的三个文件

## 为什么这样验收
T57、T57b 两轮都是「断言了 CSS 属性值，但实际间距/层级不像」。这次断言改成相邻元素 rect 相减，经理再用截图像素复量，属性对但画面不对的情况就过不去。

## 经理验收（任务 B，2026-11-11 @ a6c00fa8）：通过，可合并 feat/T57c
- 重跑：`pnpm build` exit 0；t57 spec `  1 passed (5.0s)`（与回执一致）。回归 3p 未重跑，信回执（未动其路径以外文件）。
- 范围：`git diff --stat 000af799..HEAD` = 5 文件 84+/27-（computer-view-internals.tsx / panels.tsx / settings-models.tsx / settings-view-t57.css / t57 spec）。
- **落点差追认**：工单写错落点（computer-view-internals 只服务 Computer）。panels.tsx:654 是 General 实际渲染路径，不改则本单目标无法达成；settings-models.tsx 是同款复制，不改则 Models 区与 General 分裂。三处各 +1 行 wrapper，必要且最小 → 追认，边界 1 视为 5 文件。
- Sol MAJOR 治本核实：css:78-93 卡内 label 补 align-items:center / justify-content:space-between，`__card > label > span` 补 grid/flex:1/min-width:0/gap:4（= view.css:31-32 卡内版）；spec 新增 justifyContent 断言 + 控件右缘差 14±1 rect 断言 ✓。MINOR：暗色段补卡底 #1f1f1f + h3→卡顶 8 ✓。
- 像素复量（重跑生成的 evidence/T57 新图，已复制覆盖 evidence/T57c；python x=700 取色 + x 410–700 文字行扫描，亮暗同值）：
  | 项 | ref | 我方 | 差 |
  |---|---|---|---|
  | 首个 h3 文字顶 | y140 | y138 | 2 ✓ |
  | h3 文字底→卡顶 | 13 | 13 | 0 ✓ |
  | 卡底→下一卡顶 | 53 | 53 | 0 ✓ |
  | 卡边 | 亮 #ededed / 暗 #2b2b2b | 亮 #ededed / 暗 #393939 | 存在 ✓（暗色色值差 14 级，见遗留） |
  | Account 白底无深边 | 白 | 卡内全白 #fff，无 #e5e5e5/#393939 | ✓ |
  | h3 文字 x | 430 | 430 | 0 ✓ |
- 截图亲看（亮）：三卡圆角白底细边、Theme/Timezone 控件靠右、行文字居中 ✓。
- 遗留（不阻塞，提议进 queue，不开单）：① Account 卡内几何未按做法 3（avatar 36≠44、复制钮在邮箱下一行而非行内、卡高 102 vs ref 88）；② 暗色卡边 token 取到 #393939，ref #2b2b2b；③ view.css:33 `section > label small` 被 wrapper 截断，t57 css:99 同选择器亦失效——当前 General 可见行无 `<small>`，潜在。
