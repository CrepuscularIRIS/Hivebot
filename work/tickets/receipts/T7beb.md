# T7beb 回执：先红未复现——停手交裁定（2026-11-07 21:0x）

## 工单预案执行
新格已加（wait-product-ready.spec 第二格：立即调 helper ×5 → reload → 再 helper → 断言 New chat 行数 1 + session/list 顶层恰 1）。helper **未改**（先红不成立不动手）。

## 先红 3 次原样输出（helper 未改态）
```
$ for i in 1 2 3; do …run-e2e.sh tests/e2e/wait-product-ready.spec.ts …
  2 passed (19.3s)
  2 passed (17.5s)
  2 passed (18.4s)
```
3/3 全绿——「立即调 helper→reload→再 helper」路径下顶层会话恒 1，D10c1 双 main 机制未在本格复现。

## 与经理推断的关系（供裁定）
经理机制：旧文档 doLoadRoster 在 await list+meta 后读 seen（:351）→ seen=1+空 roster → session/create（:361）→ reload 砍在 create 与 meta patch 之间。本格与 D10c1 shell1 的差别候选：
- 时序：本格「立即调 helper」在引导动画/首拉完成前更早——ensureOnboardingSeen 写 seen 时旧文档首次 doLoadRoster 可能尚未 resolve（读到 seen=1 的窗口更早/更晚，竞态窗口形态不同）
- D10c1 的 shell1 在 waitProductReady 之后还有 createViaDialog（建 C1-X）——其 page 操作时序可能才是触发组合
- 5 次 × 3 轮 = 15 个全新 home 都未复现，说明该路径概率极低或需要 C1-X 类后续操作参与

## 状态
- 新格保留（绿的回归守卫：直接数持久层顶层会话，比 strict violation 直接）
- 按 T7be 终验预案：「先红 3 次都绿 → 机制不对，T7be 放行，D10c1 转产品侧单」——请经理终裁并执行放行/转单

## 终裁后续做（2026-11-07 21:3x–21:4x——先红以经理证据为准）
- 终裁：T7be 不放行——经理重跑复现「第3轮 New chat 行数 Expected: 1 Received: 2」（evidence/T7beb/manager-rerun-wpr1-red.log）；1/25≈4%，施工 0/15 属漏检。T7beb 继续。
- 新格循环 5→10；修前再跑 5 次（50 个全新 home）全绿 `2 passed`×5——仍未抽中（4%/home × 50 抽不中概率 ≈13%，正常范围）；**先红采经理证据**。
- 修（ui.ts ensureOnboardingSeen）：写 seen 后、reload 前 `waitForFunction`（polling 250ms，≤30s）每轮 `await __pbotsDev.reloadRoster()` 至 `state.meta.mainBotId != null`——超时 waitForFunction 直接抛（TimeoutError），reload 前置失败不吞。
- 提交：8469b3b1（helper 修+循环×10 同一提交）；验收 2（修后连跑 5 次）：`2 passed (31.8/31.6/31.4/31.3/31.3s)` ×5
- 验收 3（三 spec 批 10 轮）：后台运行中（~18 分钟），完成后补逐轮计数
- 验收 4/5：排队（批跑完）
- 验收 3（三 spec 批 10 轮，后台跑原样）：`5 passed (1.8m)`×6 + `(1.7m)`×4——**D10c1 0 红**（旧比例 3/11；10 轮全绿 p≈0.04）
- 验收 4：resilience+theme-flash+onboarding → **16 passed (1.9m)**
- 验收 5：`git status --short app/ui` 空；T7beb 自身改动恰 ui.ts+wait-product-ready.spec 两文件（diff 范围内另含 T12a 合并文件，基准说明）
