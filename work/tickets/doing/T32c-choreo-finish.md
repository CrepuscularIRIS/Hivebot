# T32c：T32 收尾——侧栏底部没盖住 + 退场 heading id + 末排间距 + 回执补证

> 开单：manager (Opus 5.5) | 日期：2026-11-07 | 施工：main (GLM 5.3)
> 来源：T32b 终验（feat/T32 @ 9eeed1e7）不通过，见 `receipts/review-T32.md` 的「T32b 终验」段
> 分支 / 作业目录：继续 feat/T32 @ /tmp/bot-wt/T32（从 9eeed1e7 起）
> 失败计数：T32 组第 2 次不过（42be0b33、9eeed1e7）。**本单再不过，T32 挪 `blocked/` 重拆**
> claimed：2026-11-07 19:4x main (GLM 5.3) @ feat/T32（起点 9eeed1e7）
> accepted：

## 目标
引导页真正整窗盖住侧栏，包括左下角的账号圆和 Connect apps 药丸；补上 T32/T32b 写明却没做的两条断言。

## 改法
1. **R1 侧栏底部（MED）**：`p5-55-layout.css:73-74` 把 `.sand-agents-sidebar__account` 设成了 abs + `z-index:3 !important`，而且它是侧栏的兄弟节点（见 :125），不受侧栏 z1 的层叠上下文约束，所以盖过了 `.sand-onboarding{z-index:2}`。
   - 修法：在 `onboarding-steps-0793.css` 里把 `.sand-onboarding` 的 z-index 抬到能盖住它的最小值（预计 4）。不改 `p5-55-layout.css`。
   - 回执写一句：`grep -rn "z-index" renderer-grok/overrides renderer-grok/frontend/src/production` 里，介于 3 和 3000 之间、本该在引导层之上的层有没有。
   - 原 :5 的注释「T32 #1d：盖住侧栏…」挪回 z-index 那一行，说明改成「≥ account z3」。
2. **侧栏覆盖断言补点**：meet 页和 role 页在原来 (140, ih/2) 之外，再测两个点：(34, ih-32)（账号圆中心）、(160, ih-34)（药丸中心）。两个点的 `closest('.sand-onboarding')` 都非空，并且 `closest('.sand-agents-sidebar, .sand-agents-sidebar__account')` 都为空（药丸的实际类名施工自查，一并排除）。
3. **退场 heading id（MED）**：
   - exitsCd（spec:94）改成和 role→attribution 一样记 `{anim, heading}`
   - 两处都断言：记录里有对应旧步的 heading id（`sand-onboarding-meet-heading` / `sand-onboarding-role-heading`），并且 anim 含 `sand-onboarding-step-exit`
   - 如果退场层里取不到 heading id，回执写清楚在 DOM 里实际取到的是什么，不要放宽成只断长度
4. **F5（LOW）**：role 和 attribution 两页都断言最后一张卡的 `bottom ≤ 底栏首钮 top − 8`
5. **LOW 顺手**：
   - visCheck 失败信息改用 `hit.getAttribute('class')`，命中 SVG 时再取 `hit.closest('[class^="sand-onboarding__cast-"]')?.className`，让失败输出能看到是哪个角色
   - 删掉 spec:159 的死变量 `idleOk`

## 边界
1. 只动 `overrides/modules/onboarding-steps-0793.css`、`tests/e2e/onboarding.spec.ts`、`work/**`。上游零改动，`p5-55-layout.css` 不动。
2. **先红**：先只改 spec（第 2、3、4 步），跑 ④。R1 的新点应该红，命中元素是 account 或药丸，贴原样输出。然后改 CSS 转绿。
3. 环境同 T32：隔离 HOME/TMPDIR，DBus 指向不存在路径；load>10 不跑；e2e 同时只跑一套。

## 验收（`app/ui` 下）
1. 全部贴原样输出尾部：
   - onboarding 6 passed
   - `pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/grok-shim tests/unit/fold` ≥233 全过
   - `test:e2e tests/e2e/kickstart.spec.ts tests/e2e/bots.spec.ts` 13 passed
   - `cd renderer-grok && pnpm --config.verify-deps-before-run=false check` 显示 upstream diff=0
2. 变异三刀，每刀贴红的原样输出，还原后复绿：
   - **Vi**：z-index 改回 2 → ④ 红在新的侧栏底部点，失败信息能看到 account 或药丸
   - **Vj**：exitsCd 里把 heading 写死成 `''` → ④ 红在 meet→cd 的 heading id
   - **Vg 重跑**：删 pointer-events → 失败信息里能看到 `sand-onboarding__cast-*` 字样
3. 回执给一张表，每个改法对应 spec / css 的行号，附 `grep -n` 原样输出。只写已经存在的东西。
4. 12 张截图用修复后的 HEAD 重拍，逐张写一句：标题、几列、teammate 位置、**左下角有没有 P 圆和 Connect apps**。经理会抽看。

## 为什么这样验收
- 侧栏覆盖只测了中间一个点，左下角漏出来的 z3 元素就测不到，截图回执也没看出来。所以这次多测两个点，用 Vi 证明这两个点的断言会红。
- 前两轮都出现过回执说做了、spec 里却没有的情况（⑩a/⑩b；「无侧栏」）。所以这次每条都要附行号和 grep 原样输出。
