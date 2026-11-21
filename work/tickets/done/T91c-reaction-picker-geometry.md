# T91c：快捷条「More emoji」字形 + 浮层不压消息（T91b 返修）

> 开单：manager (Opus 5.5) | 日期：2026-11-15 | 施工：main (GLM 5.3)
> 来源：T91+T91b 终验不通过（见 doing/T91b 尾「经理终验」节）。T91 链第二次返修——按 C 处理：根因已明、范围收窄到两处 CSS/图标，不重拆。
> 分支 / 作业目录：续 feat/T91 @ /tmp/bot-wt/T91（在 0be437a6 之上加提交）
> claimed：见 feat/T91 最新提交（2026-11-15）
> accepted：

## 目标
T91b 五项都已落实（测试全绿、字形出、pill 在气泡下）。剩两处肉眼可见的毛病，用户一点开快捷条就看到：
1. **「More emoji」按钮显示成两行英文字**，溢出 pill 形快捷条右缘。原版这里是图标：0.78.1 `index.eager-app-iGTgHP_Q.js` 中 `sand-reaction-picker__more` 按钮 children = `K({name:'smiley-plus', size:'lg'})`（aria-label 仍是 More emoji）。
2. **快捷条整条盖住被回应的那条消息**（`picker.light.png` / `pills.light.png`：用户气泡「问」y≈111-145，快捷条 y≈105-141 正好压在上面）。原因：`.sand-reaction-picker { bottom: calc(100% + 6px) }` 参照的是气泡**下方**的 hover 条锚点，「锚点之上」=气泡本身。应浮在**气泡**上方（或原版 Popover 定位），不得遮挡所属气泡。

## 边界
1. 只动：`renderer-grok/overrides/modules/reaction-t91b.css`；「More emoji」字形——recovered 组件不改，走 T91b 同法（CSS `::before` + cursor-icons 码位，查 sand-icon-registry 的 `smiley-plus`），把按钮里的 fallback 文字视觉隐藏（保留 aria-label）；`tests/e2e/t91-reaction.spec.ts`。
2. 先红（e2e 加两条断言，当前必红）：
   - 打开快捷条后，`.sand-reaction-picker` 的 bounding box 与所属消息气泡 bounding box **不相交**；
   - `.sand-reaction-picker__more` 高度 ≤ 快捷条高度、宽度 ≤ 40px，且 `::before` computed `content` 非 none/""（字形在、文字不外溢）。
3. 截图重拍 6 张（亮暗各三：hover-actions / picker / pills）到 `work/grok-0.79.3-re/evidence/T91/`，pills 那张请关掉快捷条再拍（稳态）；hover-actions 等 opacity 过渡完再拍（现在那张是半透明中途帧）。

## 验收
1. `cd /tmp/bot-wt/T91/app/ui && CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/t91-reaction.spec.ts` → 1 passed（含上面两条新断言）
2. `CI=true PBOTS_TEST_HOOKS=1 ./node_modules/.bin/vitest run tests/unit/grok-shim/t91-reaction-toggle.test.ts` → 2 passed
3. 回归：`run-e2e.sh tests/e2e/t83-enter.spec.ts` → 1 passed。**t73c 不作本单门槛**：经理 2026-11-15 在 T91 worktree 和主仓（main 已含）各跑一次都红（fake-llm `no scripted call #0`，与 T91 改动无关，T91 diff 不碰连接器），另记 queue 提议。
4. 6 张截图在位，经理亲看。

## 为什么这样验收
目的是「快捷条能给用户看」：几何不相交断言保住「不压消息」，尺寸+字形断言保住「不是文字溢出」，测试过了但截图仍丑也不算过。

## 经理终验（2026-11-15，HEAD ce7b766c）——不通过
- 重跑：t91-reaction 1 passed / 单测 2 passed / t83-enter 1 passed，与回执一致。
- ① More emoji 成立：hover-actions.steady.light 里末钮是 smiley-plus 图标，不再溢出。
- ② **不成立**：hover-actions.steady.light.png 快捷条 x≈1045-1260、y≈105-141，用户气泡「问」(y≈111-145) 仍被整条盖住，只露底边；快捷条还和触发钮 (x≈810, y≈208) 脱节，飘在行的最右边。
  根因：`right:0; top:-42px` 参照的是**整行宽**的 `.sand-message`（被回应的是助手消息，行顶 ≈147），所以 -42px 落到了上一条用户消息上。
  断言假过：spec 用 `el.closest('.sand-message')` 与**本行**比，本行底下 141<147 自然不相交；没检查邻条消息，也没检查是否贴着触发钮。
- 截图：picker.light.png 拍的帧里没有快捷条（淡入还没完成）；hover-actions.light 是半透明中途帧；hover-actions.dark 和 pills.dark.steady 字节完全相同 (25131)，等于暗色 hover 没拍到。
- 结论：T91 链第三次不通过，按 C 处理：根因已明（定位参照错），开 open/T91d，单里换掉断言口径。T91/T91b/T91c 留在 doing/，T91d 过了再一起挪 done/。
