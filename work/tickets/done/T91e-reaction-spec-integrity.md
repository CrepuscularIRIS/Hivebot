# T91e：T91 spec 断言补实（T91d 返修，只改测试）

> 开单：manager (Opus 5.5) | 日期：2026-11-15 | 施工：main (GLM 5.3)
> 来源：open/T91d 尾「经理终验」。产品几何已过，这张只修测试。
> 分支：续 feat/T91 @ /tmp/bot-wt/T91（85f1f31d 之上）
> claimed：
> accepted：

## 边界
只动 `app/ui/tests/e2e/t91-reaction.spec.ts`。不改 css / 组件。

## 要做
1. 触发钮改量 picker 所属消息的 `button[aria-label="Add reaction"]`（不是 parentElement）：bbox 最短间距 ≤12，右缘差 ≤16；文案与阈值一致。
2. `toHaveCSS('opacity','1')` 去掉 `.catch`。
3. 恢复 T91c 的 More 钮断言（高≤32、宽≤40、::before content 非空）。
4. hover-actions.dark / hover-actions.steady.light 拍到 hover 条可见：拍前 `expect(hover条).toBeVisible()`+opacity 1；spec 末尾断言这两张与 pills.dark.steady / pills.light 的文件字节不同（读文件比 Buffer）。

## 先红
先只做第 4 条的字节比对断言，跑一次看它红（现状两对同字节）。

## 验收
1. `cd /tmp/bot-wt/T91/app/ui && CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/t91-reaction.spec.ts` → 1 passed
2. `md5sum work/grok-0.79.3-re/evidence/T91/*.png` 八张两两不同
3. `git diff 85f1f31d..HEAD --stat` 只有 spec 一个文件

## 为什么
T91d 的 gap 断言量的是 picker 自己的定位锚点，永远过；More 断言被删、稳态等待被吞。这张让测试真能在回归时变红。过后 T91/T91b/T91c/T91d/T91e 一起挪 done。

## 经理终验（2026-11-15，任务 B 第四轮，b36b34db）
重跑：e2e 1p；单测 2p；t83-enter 1p；md5 重复 0（8 张）；diff 仅 spec。②③④⑤ 过。
**① 不过——条件断言恒跳过，「menu-open 钮 display:none」不成立**：
- picker 在 `.sand-message-hover-actions` 内，hover 条是 `.sand-message` 的**兄弟**（transcript.tsx:208-210，同在 `.sand-message-action-anchor` 下；`.sand-message` 在 :776 另一层）→ `el.closest('.sand-message')` 恒 null → triggerBox 恒 null → 距离/右缘两断言从不执行。
- 钮本身不随 open 卸载（reaction-picker.tsx:192-201 钮恒渲染，picker 是 `{open ? ...}` 兄弟）；且 display:none 元素 querySelector 照样查得到（rect 全 0 会让 gap 断言炸红，而测试是绿的）——所以 triggerR=-1 是选择器错，不是 0.78.1 行为。
转 T91f。
