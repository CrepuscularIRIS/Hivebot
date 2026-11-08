# T7bec：`ensureOnboardingSeen` 的主 bot 落定轮询对 `launchProduct({ready:false})` 跳过（修 GU-1 必现超时）

> 开单：manager (Opus 5.5) | 日期：2026-11-07 | 施工：main (GLM 5.3)
> 来源：T7beb 终验不通过（review/review-T7be.md「T7beb 终验」）；T7be 链失败计数 2，本单即重规划结果
> 分支 / 作业目录：直接在集成分支 `docs/rebuild-p6-p5-plan`
> claimed：2026-11-07 22:3x main (GLM 5.3) @ 集成分支（起点 87e517c0 后）
> accepted：
> 失败计数：0（T7be 链：2——本单再失败就停手、整链挪 blocked 交用户）

## 目标
保留 T7beb 的 settle（D10c1 双 main 已证消除），但 `launchProduct({ready:false})` 不再 settle，让 resilience GU-1（roster 故意起不来）重新变绿。

## 动手前先读
1. review/review-T7be.md「T7beb 终验」整段
2. `app/ui/tests/support/ui.ts:76-123`；`tests/e2e/resilience.spec.ts:15-30`；`tests/e2e/theme-flash.spec.ts:165-175`

## 边界
1. 只动 `app/ui/tests/support/ui.ts`（必须）；`tests/e2e/wait-product-ready.spec.ts:28` 注释「重复 5 次」改成 10 次（可选，顺手）；回执 `work/tickets/receipts/T7bec.md`。不改产品代码、不改其他 spec。
2. 修法：`ensureOnboardingSeen(page: Page, settle = true)`，`settle` 为 false 时跳过 expect.poll 这一段（写 seen、reload、等 __pbotsDev 照旧）；`launchProduct` 调用改成 `ensureOnboardingSeen(shell.page, ready)`；`waitProductReady` 里的调用不变（默认 settle）。settle 为 true 时超时照旧要抛，**不许加 `.catch` 吞掉**。
3. 先红：不用另写——经理已有必现红（`evidence/T7beb/final/acc4.log`：GU-1 在 ui.ts:89 超时）。改前跑一次 `resilience.spec.ts` 确认红，贴失败行。
4. 隔离 HOME / TMPDIR / DBus 同 T7beb；`PATH="$PWD/node_modules/.bin:$PATH"`；收尾 bot-reap 自己的进程。

## 验收（app/ui，先 build，`$E` 同 T7beb）
1. 改前 `$E sh scripts/run-e2e.sh tests/e2e/resilience.spec.ts` → GU-1 failed（ui.ts:89 超时）
2. 改后 `$E sh scripts/run-e2e.sh tests/e2e/resilience.spec.ts tests/e2e/theme-flash.spec.ts tests/e2e/onboarding.spec.ts` 连跑 **2 次** → 每次 `16 passed`，且 GU-1 用时 <15s（不再白等 30s 轮询）
3. `$E sh scripts/run-e2e.sh tests/e2e/wait-product-ready.spec.ts` 连跑 2 次 → 每次 `2 passed`
4. `$E sh scripts/run-e2e.sh tests/e2e/grok-dead-entries.spec.ts tests/e2e/settings.spec.ts tests/e2e/market.spec.ts` 1 轮 → `5 passed`
5. `git diff 87e517c0..HEAD --stat -- app/` 只含 ui.ts（加可选的 spec 注释一行）；`git status --short app/ui` 空
6. **回执必须贴 1–5 全部原样输出**；只要改了 helper 语义，就重跑全部验收（T7beb 就是在这里漏的）

## 为什么这样验收
ready:true 和裸壳路径的 settle 行为不变，D10c1 的 10 轮统计和 wpr 100 个 home 的证据直接沿用，所以 3、4 只做冒烟，确认没改坏。2 是这次真正要修的地方：GU-1 变绿，而且不是靠「等满 30s 再吞掉」变绿的——这一点用时间门槛卡住。

## 产出
`tests/support/ui.ts`、`receipts/T7bec.md`；通过后 T7be + T7beb + T7bec 三张一起挪 done。
