# T91d：快捷条锚定到触发钮（T91c 返修，T91 链 C 重规划）

> 开单：manager (Opus 5.5) | 日期：2026-11-15 | 施工：main (GLM 5.3)
> 来源：doing/T91c 尾「经理终验」。T91 链第三次不通过，根因是定位参照，不是数值。
> 分支 / 作业目录：续 feat/T91 @ /tmp/bot-wt/T91（在 ce7b766c 之上加提交）
> claimed：
> accepted：

## 目标
快捷条贴着触发它的 Add reaction 钮弹出，不盖住**任何**消息（本条和邻条都不行）。
不要再调 top/right 的数值：原版是 Popover，锚点就是触发钮。
做法：给 hover 条容器（`.sand-message-hover-actions` 或 `.sand-message-action-anchor` 里装 reactionActions 的那层，施工方查实）加 `position:relative`；快捷条相对它定位，放在钮**下方**（`top: calc(100% + 6px)`），右缘对齐钮。hover 条本来就在气泡下，所以往下开不会碰到本条气泡。

## 边界
只动 `renderer-grok/overrides/modules/reaction-t91b.css` 和 `tests/e2e/t91-reaction.spec.ts`。recovered 组件不改。

## 先红（替换 T91c 的几何断言，先跑一次看它红）
1. 快捷条 bbox 与页面上**所有**消息气泡（施工方查明气泡选择器，写进 spec 注释；不能用整行的 `.sand-message`）都不相交；
2. 快捷条与 Add reaction 触发钮的距离 ≤ 12px（两个 bbox 间的最短间距），并且快捷条右缘与钮右缘相差 ≤ 16px；
3. 截图前先 `await expect(picker).toHaveCSS('opacity','1')`，必要时再加等待，保证拍到稳态帧；pills.dark.steady 和 hover-actions.dark 不能是同一张（暗色 hover 要拍到 hover 条可见）。

## 验收
1. `cd /tmp/bot-wt/T91/app/ui && CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/t91-reaction.spec.ts` → 1 passed
2. `CI=true PBOTS_TEST_HOOKS=1 ./node_modules/.bin/vitest run tests/unit/grok-shim/t91-reaction-toggle.test.ts` → 2 passed；`run-e2e.sh tests/e2e/t83-enter.spec.ts` → 1 passed
3. 7 张截图重拍，经理亲看：picker.light 里能看到快捷条且贴着钮；暗色三张可读。
4. 附带核一项（不改代码也行，回执写结论）：pills 现在落在行的右端（x≈1193-1260，夹在用户气泡和助手气泡之间），看起来像是回应了用户消息。对照 0.78.1 看助手消息的 pill 是否应在气泡下方左对齐；如果确实错位，就在本单一并修。

## 为什么这样验收
T91c 的断言只拿本行比，所以测试过了，用户看到的却还是被盖住的消息。改成和所有气泡比、和触发钮比，测的就是用户实际看到的样子。本单再不过，T91 链挪 blocked/ 改走 Popover 组件方案。

## 经理终验（2026-11-15，manager Opus 5.5，HEAD feat/T91 @ 85f1f31d）——产品过，测试不过 → T91e
重跑：t91-reaction 1p / 单测 2p / t83-enter 1p（与回执一致）。diff 只动 css+spec，范围合规。
**产品**：picker.light / picker.dark 亲看——快捷条在 Add reaction 钮正下方、右对齐、不压任何气泡；暗色可读。用户可见目标达成，blocked 规则不触发。
**附带核（pills）**：结论认可（不错位），但回执理由写错——截图里点的是 user 消息「问」的钮（Add reaction first()），pill 挂在 user 气泡下，所以在行右；不是「最后一条 assistant」。
**测试不过（转 T91e，只改 spec）**：
1. 「触发钮」取的是 `el.parentElement`=hover 条容器，picker 定位就是相对它的 → gap=6 恒成立，同义反复；须量 `button[aria-label="Add reaction"]`。
2. 右缘阈值写 40，消息文案写 ±16，工单要求 ±16——量真钮后按 ±16 断言。
3. `toHaveCSS('opacity','1').catch(()=>undefined)` 吞掉失败=没断言；去掉 catch。
4. 删了 T91c 的 More 钮断言（宽≤40/高≤32/字形非空）——T91c 修复失去保护，恢复。
5. md5 实测 hover-actions.dark == pills.dark.steady、hover-actions.steady.light == pills.light（同字节）——违反本单验收 3；hover 帧须拍到 hover 条可见且与 pills 帧不同。
另见（不阻塞，记 queue）：pill 👍 落在 user 消息 hover 条「···」位置上，两者叠放。
