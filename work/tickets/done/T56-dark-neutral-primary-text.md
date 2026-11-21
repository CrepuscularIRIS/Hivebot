# T56：暗色 neutral primary 按钮白底白字——按原版改用 `--sand-text-inverted`，一处根治

> 开单：manager (Opus 5.5) | 日期：2026-11-11 | 施工：main (GLM 5.3)
> 来源：work/ui-polish-win/PLAN.md 行 P1；`work/grok-0.79.3-re/RE-UI-LAYOUT-0.78.1.md` §2.2（T56 定论）；T51 验收 F2、T7b 提议、T30db / T7bd 两处单按钮补丁
> 分支 / 作业目录：feat/T56 @ /tmp/bot-wt/T56
> claimed：2026-11-11 main (GLM)
> accepted：2026-11-11 feat/T56 @ bcfe6247（manager 任务 B；t56 spec 1p 亲跑；market/theme-dual 回归因 load≈31 留合并后回测）

## 目标
暗色下所有 neutral primary 按钮（默认 primary）字色与原版一致：底 `--sand-bg-primary`（暗 `#f5f5f5`）配字 `--sand-text-inverted`（暗 `#121212`）；accent primary（蓝底）保持 `--sand-text-on-primary` 不变。删掉此前逐按钮打的补丁。

## 原版规格（RE-UI-LAYOUT §2.2，CSSR 锚）
| variant | 底 | 字 | 锚 |
|---|---|---|---|
| neutralPrimary | `--sand-bg-primary` | **`--sand-text-inverted`** | bg L6103 `.sand-8rotk8`；**color L6394 `.sand-sa7k8x`** |
| accentPrimary | `--sand-bg-accent-primary` | `--sand-text-on-primary` | bg L6078；color L6395 |
| neutralPrimary disabled | `--sand-bg-primary-disabled` | text-primary 30% mix | L7669 / L7681 |

## 边界
1. **不改调色板变量的值**（`p5-55-palette.css` 的 `--sand-text-on-primary` 保持原版值；accent 按钮、用户气泡等别的消费者都靠它）。改的是「neutral primary 按钮的字色用哪个变量」——先找到我们 SandButton neutral primary 变体取字色的那一处（0.18 组件的 class / 我们 overrides 里的覆盖），只改那一处。
2. 删补丁：`overrides/t7b.css` 的 `.pb-skills-dialog [data-action="skills-add"]` 暗色字色规则、`overrides/p5-57.css:211` T30db `create-bot` span 字色规则（`p5-57.css:208` 的 transition 规则若只为该补丁服务一并删，回执说明）。
3. 只动：上述三处 + 找到的那一处根规则 + 新单测 / e2e 断言文件。不碰其它视觉。
4. 先写失败测试：一条 e2e（可并入现有亮暗对比 spec，或新建 `app/ui/tests/e2e/t56-primary-text.spec.ts`）——暗色下渲染 ≥4 处 neutral primary 按钮（新建 bot 对话框 Create、市场空态 Add index source、skills 对话框 Add、onboarding 主钮）+ 1 处 accent primary，断言 computed `color` 与 `background-color` 的 WCAG 对比度 ≥ 4.5，且 neutral 的 `color` = `rgb(18, 18, 18)`、accent 的 `color` = `rgb(245, 245, 245)`；亮色同测一遍（neutral 字 `#fcfcfc`）。删补丁后、改根规则前必须红。

## 验收（写命令，不写感觉）
1. `cd /tmp/bot-wt/T56/app/ui && pnpm build && PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/t56-primary-text.spec.ts` → 全绿；回执贴「删补丁、未改根规则」时的红尾。
2. `cd /tmp/bot-wt/T56 && git grep -n -E 'skills-add.*color|create-bot.*span.*color'` → 无输出（补丁已删）。
3. 回归：`theme-dual.spec.ts` 与 `market.spec.ts` → 全绿。
4. 截图亮 / 暗各一张：新建 bot 对话框、市场空态、skills 对话框（放 `work/ui-polish-win/evidence/T56/`）；对照 `work/ui-polish-win/ref/` 里原版按钮参照图，经理 Read 看。
5. `git diff --stat <claimed>..HEAD` 只含边界 3。

## 为什么这样验收
同一个病已经被单按钮补了三次（T30db、T7bd、T51b 改 secondary 绕开），每次新做一个 primary 按钮都会再犯。原版的答案是变体取字色的变量不同，不是调色板值不同——所以修在「取哪个变量」那一处，并且用「删掉补丁后仍然对」来证明是根治而不是第四个补丁。对比度断言保住的是真实目的：字看得清。

## 产出
- 根规则所在文件、删补丁的两个 css、新 e2e、截图、`work/tickets/receipts/T56.receipt.md`
