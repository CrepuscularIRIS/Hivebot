# T32b：T32 返修——cast 挡点击的根因（pointer-events）+ 恢复空转/缺失的断言

> 开单：manager (Opus 5.5) | 日期：2026-11-07 | 施工：main (GLM 5.3)
> 来源：T32 经理终验（feat/T32 @ 42be0b33）不通过，见 `receipts/review-T32.md`
> 分支 / 作业目录：继续 feat/T32 @ /tmp/bot-wt/T32（从 42be0b33 起）
> claimed：2026-11-07 main (GLM 53) @ feat/T32 续修（施工开始时填：日期、起点 SHA）
> accepted：

## 目标
修掉 attribution 中列卡「被盖」的真因：隐形角色挡住了点击。同时让 T32 工单要求的每条断言真的存在、真的会红。

## 终验发现（经理亲查，证据）
- **F1 HIGH · 断言写死**：`onboarding.spec.ts:141` 的 `const overlap = false as boolean`，:146 又 `expect(r.overlap).toBe(false)`，恒过；:140 算出的 `cards` 没被使用。「teammate 不压卡/底栏」这条编舞契约等于没测。
- **F2 HIGH · 「中列被 SVG 盖」的根因是 pointer-events，不是编舞位置**：
  - 上游 `view.css:20` 写死了 `.sand-onboarding__cast > div { pointer-events: auto }`。
  - 0.79.3 不是这样：cast 容器 pointer-events:none（`chunk-onboarding-flow` @13822，`sand-47corl`）；角色只有在 `opacity>0 && isGazing` 时才加 `sand-67bb7w{pointer-events:auto}`（@11376）。tools 映射的三页上没有任何角色 isGazing，所以三页上角色在 0.79.3 里**不接收指针**。
  - 我们这边，隐形的 hero（HIDDEN：(0,-20)、scale .3、opacity 0，约 24px 方框）和角色仍然挡在卡片中心。这是**真实的用户 bug**：点到这个位置，卡片收不到点击。
  - 所以「visCheck 把命中 cast 当作可见」是把 bug 合法化，不认可；attribution 宽改 624 也没用（施工自己也说改了照样盖），退回 744。
  - 另：施工报告说「role 侧 visCheck 仍咬」，不成立——豁免写在 visCheck 本体里，role 页同样被豁免。
- **F3 HIGH · 回执与代码不符**：回执 :14 称已加「⑩a meet 标题 opacity=1、⑩b computer-demo 底栏 Next 先 Back 下」，但 spec 里找不到这两条（grep `meet-heading` 只有 :80 的 toBeVisible，computer-demo 底栏没有任何断言）。
- **F4 MED · 工单验收 2 缺项**：
  - connect 页没做 geo 和 castOk
  - 退场只测了 role→attribution，缺 meet→computer-demo；也没断「1s 内 aria-hidden 层归 0」和「记录里有旧步 heading id」
  - 侧栏覆盖缺 meet 页
  - 没断 teammate 的 `data-character-state='idle'`。回执存疑 3 说这个属性在容器上，不成立：`view.tsx:96` 把它放在 `.sand-onboarding__cast-${id}` 这个 div 自身
  - cast 标记应在 meet 页挂、connect 页查（现在是 role 页挂、attribution 页查，没覆盖 meet→jobs→role 这段）
  - :81 的过时注释「tools→create」还在
- **F5 LOW**：attribution 卡的 padding 用了 8/12（回执存疑 1），没有断言防止最后一排压到底栏。
- **F6 · shot-t32.spec.ts 追认（有条件）**：有 `PBOTS_SHOT` 门，可以追认，但 `OUT` 写死了主仓绝对路径（提议⑦同病），要改成仓内相对路径（`new URL('../../../../work/grok-0.79.3-re/ours/', import.meta.url)` 或等价写法）。12 张截图是 M1 修复前拍的，要以修复后的 HEAD 重拍。

## 改法
1. `onboarding-steps-0793.css` 加一条：`.sand-onboarding[data-step="tools"] .sand-onboarding__cast > div { pointer-events: none; }`。理由：三页在 0.79.3 里没有 gazing 角色，这条与 0.79.3 等价；不改上游 view.css。
2. attribution 宽度恢复 744（CSS 和 geo 断言都改），删掉 CSS 里「744 假定 900 视口」那句没有依据的注释。
3. visCheck 删掉 `castCovered` 豁免。失败信息里带上命中元素的 `className`，方便看清是谁挡的。
4. castOk 恢复真实的相交计算（teammate 的 box 与 `cards` 逐个求交），并加 `data-character-state === 'idle'`。
5. 补齐 F3、F4 列的每一项。F5：attribution 和 role 最后一张卡的 bottom ≤ 底栏首钮 top − 8。

## 边界
1. 只动：`overrides/modules/onboarding-steps-0793.css`、`tests/e2e/onboarding.spec.ts`、`tests/e2e/shot-t32.spec.ts`、`work/**`。上游零改动。
2. **先红**：只做第 3、4 步（删豁免、恢复真实 overlap），跑 ④，把红的原样输出贴进回执，要能看到命中元素的 className（预期是 `sand-onboarding__cast-*`）。然后再加第 1 步的 CSS，看它转绿。
3. 环境要求同 T32：隔离 HOME/TMPDIR，DBus 指向不存在路径；load>10 不跑；ui e2e 同时只跑一套；做变异前先 commit。

## 验收（`app/ui` 下）
1. T32 验收 1-4、7、8 全部重跑并贴原样输出：onboarding 6 passed、grok-shim+fold ≥233、kickstart+bots 13、check diff=0。
2. `grep -n "overlap = false\|castCovered" tests/e2e/onboarding.spec.ts` → 无输出。
3. ④ 含 T32 工单验收 2 的全部条目，回执逐条给出行号；F4 列的每一项都要有对应行号。
4. **变异六刀**，每刀贴红的原样输出，还原后复绿：
   - Vc / Vd / Ve / Vf：同 T32
   - Vg：删第 1 步的 pointer-events 规则 → ④ 红在 attribution 的 visCheck，失败信息里能看到 cast 的 className
   - Vh：把 role 选项块的 `-147px` 临时改成 `-330px`，让卡片上移进角色区 → ④ 红在 castOk 的 overlap（证明这条断言会咬）
5. 截图 12 张以修复后的 HEAD 重拍（shot-t32 改相对路径后跑），回执逐张写一句看到了什么；attribution 那张要写清是 3 列、744 宽。

## 为什么这样验收
- 「被盖」原先是靠放宽断言解决的。真正要保住的是：用户点卡片任何位置都能选中。0.79.3 靠 pointer-events 做到这一点，我们照抄这一条，断言就不需要豁免。
- 写死的 `false` 和缺失的断言都属于「检查过了，目的没达到」。所以这次用 grep 和行号逐条核对，Vh 专门证明 overlap 断言会咬。

## 产出
- 上面 3 个文件的改动；回执追加到 `receipts/T32.md` 的「T32b 返修」节
