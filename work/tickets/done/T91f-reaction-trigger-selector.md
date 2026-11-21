# T91f：T91 spec 触发钮选择器修正（T91e 返修，只改测试）

> 开单：manager (Opus 5.5) | 日期：2026-11-15 | 施工：main (GLM 5.3)
> 来源：open/T91e 尾「经理终验」①。其余四项已过。
> 分支：续 feat/T91 @ /tmp/bot-wt/T91（b36b34db 之上）
> claimed：
> accepted：

## 做什么（只改 tests/e2e/t91-reaction.spec.ts）
1. 触发钮改为 `el.closest('.sand-message-hover-actions')?.querySelector('button.sand-message-hover-actions__button[aria-label="Add reaction"]')`。
2. 删掉 `if (pickGeo.triggerBox !== null)` 条件：先 `expect(triggerBox, '找到触发钮').not.toBeNull()`，再无条件断言 gap ≤12、右缘差 ≤16。
3. 删 menu-open display:none 注释。若钮真的被 CSS 隐藏（rect 宽高 0），不许跳过：把 `getComputedStyle(btn).display` 与 rect 贴进回执，停下等经理定，不要自改阈值。

## 先红
先只做第 1 条、保留条件块，在 evaluate 里临时打印 triggerBox，证明它现在非 null（旧选择器恒 null）；再做第 2 条。若右缘超 16 而红，照实贴数，不放宽。

## 验收
1. `cd /tmp/bot-wt/T91/app/ui && CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/t91-reaction.spec.ts` → 1 passed
2. `grep -n "triggerBox !== null" tests/e2e/t91-reaction.spec.ts` → 无输出
3. md5 重复 0；`git diff b36b34db..HEAD --stat` 只有 spec 一个文件

## 为什么
旧断言恒跳过=没测。这张让「快捷条贴着钮」在回归时真能红。过后 T91/b/c/d/e/f 一起挪 done。再失败一次走任务 C。

## 经理裁决（2026-11-15，回执 T91f 节：gap=6，右缘差 33=picker 对齐 hover 条容器右缘）
选 a 的变体——**不放宽阈值，换参照**：
1. 右缘断言改为对 hover 条容器：`|pick.right - container.right| ≤ 2`（container = `el.closest('.sand-message-hover-actions')`）。
2. 加横向覆盖：`pick.x ≤ btn.right && pick.right ≥ btn.x`（快捷条横向罩住钮）。
3. 钮 gap ≤12 保留；全气泡不相交保留。
4. 回执记「锚 hover 条容器右缘」定案；0.78.1 Popover 对齐语义未取证，记 queue 提议，不开单。不动 recovered 组件（b 否决：越边界且无原版证据）。
验收同上（e2e 1p、md5 重复 0、diff 仅 spec）。
