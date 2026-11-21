# T83d：t83-enter3 ④ reduced 段不稳（1/3 过）+ ⑤ 补防空过

> 来源：2026-11-15 经理终验第三次（T83c @76956b14，worktree /tmp/bot-wt/T83c）。走 C 的最后一张：**本单再不过 → T83 三批（消息行入场）整段挪 blocked，只合并二批。** 时间盒一轮。
> 边界：只动 `app/ui/tests/e2e/t83-enter3.spec.ts`；若查实是产品回归，只许动 `app/ui/renderer-grok/overrides/modules/transcript.tsx` observer effect。

## 现象（经理重跑，隔离 HOME/TMPDIR，load≈3）

t83-enter3 连跑三次：passed / failed / failed。两次都卡 spec:97 ④：
`expect.poll(animOf(row4)).toContain('t83-enter-fade-reduced')` → Received `"none"`。⑤ 在通过那次两断言都绿。回归 t83-enter+t91 2 passed。
T83b 轮 ④ 两连绿；本轮新增的是预置 B 会话 + deps 加 `activeAgent.id`——两候选：
1. **测试竞态**：等到 assistant「第四条回复」可见才去查 user 行 row4，240ms 动画 + animationend 摘 data-enter 可能早已结束 → 读到 none。
2. **产品回归**：`activeAgent.id` 在 ④ 期间抖动（预置 B 进列表/发送时 active 重算）→ effect 重跑 → boot 门把 row4 当存量标 seen → 根本没入场。

## 做法

- ④ 改成与 ⑤ 同法：**发送前**预装 attributes observer，记 `entryId:data-enter` 及当时 `getComputedStyle(target).animationName`；断言 row4 的记录里出现 `:new` 且 animationName 含 `t83-enter-fade-reduced`，然后断言 1s 内摘除。不再事后 poll computed。
- 同一 observer 期间记 `activeAgent.id` 变化次数（可从 `__pbotsDev.state()` 或 markers 读，施工方定），回执贴出：若 ④ 期间有变化 → 候选 2 成立，修产品（effect 仅在 id 真变化时重置，或比较前值），不是改断言。
- ⑤ 防空过：点 B 后先 `expect(…hasText:'B 预置二').toBeVisible()`，再读 log 断言无 `:new`（否则 B 历史没渲染也会绿）。
- **真红证据**：临时把 deps 改回 `[isMainLine]` 跑一次，⑤ 第一条断言必须红，贴红输出后改回（不提交）。

## 验收（经理会重跑）

`cd /tmp/bot-wt/T83c/app/ui && CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/t83-enter3.spec.ts` **连跑 5 次全 1 passed**（回执贴 5 次尾部）；回归 t83-enter + t91-reaction 2 passed；回执附 deps 回退时 ⑤ 的红输出。

## 为什么这样验

要保住的是「新消息入场、历史不入场」在真实时序下稳定成立；三次一过的测试等于没有门。5 连是为排除竞态，真红是为证明 ⑤ 断言确实咬住会话门。

> 2026-11-15 经理：随 T83 三批挪 blocked（T83d 终验 2/3），不合并。
