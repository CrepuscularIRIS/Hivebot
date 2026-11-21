# T96c：侧栏多选——选中行视觉 + 区间序取实传 sections

> 开单：manager (Opus 5.5) | 日期：2026-11-16 | 施工：main (GLM 5.3)
> 来源：T96/T96b 验收不通过（`reviews/T96.review.md` 末「经理核实」）
> 分支 / 作业目录：feat/T96 @ /tmp/bot-wt/T96（接 5f0ff9b8 续提交）
> claimed：
> accepted：2026-11-16 18f6d4bc（manager 任务 B 第三轮复验，T96 链整体收口：T96+T96b+T96c+T96d）——rebuild 后 t96 3p / 回归 4p；multiselect 亮暗重拍亲看：A/C 蓝调、B 无底、active 灰底三者可分；hover 选中行 50~800ms 采样与静止值完全相同

## 目标
多选后被选的行要看得出来；区间序与实际渲染的行一致。

## 动手前先读
1. `reviews/T96.review.md` 末段；证据图 `work/ui-quality/evidence/T96/multiselect.light.png`（A/C 已选但无底）
2. 原版锚点：0.78.1 `work/p1-re/evidence/chunks/index.eager-app-iGTgHP_Q.js` 行组件 props 有 `"data-selected":Rt`、`isSelected:D`——追到 isSelected 落到哪个原子类，再在 `work/p5-parity/evidence/078-css-rules-split.txt` 查该类的底色 token。查不到就用 `--sand-bg-active`（与 RE-UI-LAYOUT 选中态同 token）并在回执写明「未取得原版锚」
3. `overrides/p5-55-layout.css:65`（active 行 `--sand-bg-active !important` 写法，同族）

## 边界
1. 只动：`overrides/modules/sidebar.tsx`、`overrides/p5-55-layout.css`、`tests/e2e/t96-sidebar-selection.spec.ts`。上游零改动
2. 先写失败测试：t96 spec 第一格加断言——已选且非 active 的行 computed backgroundColor ≠ 未选行（现状两者都是 `rgba(0, 0, 0, 0)`，必红）
3. visualOrder 改读实际传给 Upstream 的 sections（`worker.sections ?? props.sections`），一行改动，不另写排序
4. 隔离 HOME/TMPDIR、死 DBus

## 验收
1. `sh scripts/run-e2e.sh t96-sidebar-selection.spec.ts` → 3 passed（含新断言）
2. 回归 `sh scripts/run-e2e.sh t77-option-feedback.spec.ts t59-sidebar-collapse.spec.ts grok-hidden-bots.spec.ts` → 4 passed
3. 截图亮暗：3 bot 选 A/C，存 `work/ui-quality/evidence/T96/multiselect.{light,dark}.png`（覆盖旧图），回执写确认点：A/C 有底、B 无底、active 行仍可区分

## 为什么这样验收
T96 原测只断 `data-selected` 属性，属性在、视觉无，过了检查用户却看不出选中——这次断 computed 值。

## 产出
- 上述 3 文件；回执追加到 `receipts/T96.receipt.md` 的 T96c 段

## 经理复验（2026-11-16 · 任务 B 续 · feat/T96 @ e3991b8b）→ **不通过，写 open/T96d**

重跑：t96 3 passed；回归 t77/t59/hidden 4 passed。visualOrder 读 `worker.sections ?? props.sections`（sidebar.tsx:55）核过：`worker` 在 :79 声明，闭包只在点击时调用，无 TDZ，取的就是传给 Upstream 的 sections——**④通过**。

1. **截图亲检（重拍覆盖 evidence/T96/multiselect.{light,dark}.png）**：A/C 有底、B 无底——达成；但 **active 行（New chat）与 A/C 同色**（computed 三行同为亮 `rgba(28,28,28,0.08)` / 暗 `rgba(245,245,245,0.08)`），验收③「active 行仍可区分」不成立。
2. **「未取得原版锚」不追认**：锚可取。eager-app `F6e(o.highlight)` 拆出 `isActive`/`isMultiSelected`；行的 `isSelected` 其实是 active（→ `--sand-bg-active`），多选另挂 `BS.accentSelected` = `color-mix(in srgb, var(--sand-text-accent-primary) 20%, var(--sand-bg-active))`（078-css :6043，hover :7502 同值）。T96c 用的 `--sand-bg-active` 恰是原版 active 色，所以撞色。
3. 回执缺：`receipts/T96.receipt.md` 没有 T96b/T96c 段（工单要求追加）。
4. 本链第二次不通过 → 按 C 收窄：T96d 只改一条 CSS + 两条断言，锚已写进单里。
