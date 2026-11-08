# T7beb：`ensureOnboardingSeen` 整页 reload 前先让旧文档把主 bot 落定（消 D10c1 双 main）

> 开单：manager (Opus 5.5) | 日期：2026-11-07 | 施工：main (GLM 5.3)
> 来源：T7be 终验不通过 第 1 次（review/review-T7be.md「T7be 终验」裁定 1）
> 分支 / 作业目录：直接在集成分支 `docs/rebuild-p6-p5-plan`（只改测试 helper + 已有新 spec 加一格）
> 排期：现在可做；ui e2e 同刻只跑一套
> claimed：
> accepted：（2026-11-07 终验 @ 87e517c0 不通过 第 1 次 → T7bec：D10c1 双 main 已消（10 轮 0 红），验收 4 resilience GU-1 必现超时；见 review/review-T7be.md「T7beb 终验」）
> 失败计数：1（T7be 链：2）

## 目标
裸 `launchShell` 后立即调 `waitProductReady`（以及 `launchProduct`），持久层只留**一个**顶层会话；同 home 重启后侧栏只有一个 "New chat"。

## 机制（经理读码，待你先红证实）
- 旧文档 roster 拉两次（`data.ts:739` start 立即、`:445` socket open 再拉），`doLoadRoster` 在 `await list+meta`（`:338`）之后才读 seen（`:351`）。
- `ensureOnboardingSeen`（ui.ts:76-81）一见 `__pbotsDev` 就写 seen 并 reload：旧文档某次拉取读到 seen=1+空 roster → `session/create`（`:361`），reload 砍在 create 与 meta patch 之间 → 新文档再建一个 → 两个 "New chat"。
- 旧 helper 同文档 `reloadRoster` 不会双建；T7be 改成整页 reload 后暴露。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md 末两条
2. review/review-T7be.md「T7be 终验」
3. `app/ui/tests/support/ui.ts:72-113`、`app/ui/renderer-grok/shim/src/data.ts:329-370、:435-446、:735-748`

## 边界
1. 只动：`app/ui/tests/support/ui.ts`、`app/ui/tests/e2e/wait-product-ready.spec.ts`（加一格）、`work/tickets/receipts/T7beb.md`。不改产品代码、不改其他 spec。
2. 修法（最小，在 `ensureOnboardingSeen` 一处，launchProduct 与 waitProductReady 同受益）：写 seen 后、`page.reload()` 前，在旧文档里轮询 `await __pbotsDev.reloadRoster()` 直到 `__pbotsDev.state.meta.mainBotId !== null`（≤30s，用 `expect.poll` 或 `waitForFunction`；超时要**抛**，不吞）。理由：主 bot 建好且 meta 已 patch 后，旧文档之后任何拉取都幂等，reload 再也砍不出孤儿；单飞会合并进行中的那次拉取。
3. 先写失败测试：`wait-product-ready.spec.ts` 加第二格——循环 5 次（每次新 `sandboxHome` + 新 runtime）：裸 `launchShell` → **不等引导**立即 `waitProductReady(page)` → `page.reload()` → `waitProductReady(page)` → 断言 `page.locator('.sand-agent-item[aria-label="New chat"]')` 计 1，且 `api(page, 'session/list', { _request: {} })` 的顶层项（滤掉 `origin==='subagent'` 与带 `parentSessionId` 的）恰 1 个。
   - 改 helper 前跑这一格 3 次，**至少 1 次红**才算先红成立，原样贴失败行。
   - **3 次都绿**：机制不对，停下，不改 helper，回执写「先红未复现」+ 3 次原样输出，交经理（届时 T7be 放行、D10c1 转产品侧单）。
4. 隔离 HOME / TMPDIR / DBus；`PLAYWRIGHT_BROWSERS_PATH=/home/lingxufeng/.cache/ms-playwright`；`PATH="$PWD/node_modules/.bin:$PATH"`。收尾 bot-reap 自己的进程。

## 验收（app/ui，先 `pnpm --config.verify-deps-before-run=false build`，`$E` 同 T7be）
1. 先红：helper 未改、新格已加 → `$E sh scripts/run-e2e.sh tests/e2e/wait-product-ready.spec.ts` 3 次中 ≥1 次 failed（贴失败行：计 2 或 session 数 2）
2. 改后同命令连跑 3 次 → 每次 `2 passed`
3. `$E sh scripts/run-e2e.sh tests/e2e/grok-dead-entries.spec.ts tests/e2e/settings.spec.ts tests/e2e/market.spec.ts` 连跑 **10 轮** → 每轮 `5 passed`，D10c1 0 红（旧比例 3/11，10 轮全绿 p≈0.04）
4. `$E sh scripts/run-e2e.sh tests/e2e/resilience.spec.ts tests/e2e/theme-flash.spec.ts tests/e2e/onboarding.spec.ts` → `16 passed`
5. `git diff <起点>..HEAD --stat` 只含边界第 1 条三个文件；`git status --short app/ui` → 空

## 为什么这样验收
D10c1 只在批跑里约 1/4 红，单看它绿说明不了修好。新格把「立即调 helper」重复 5 次并直接数持久层会话，比等 D10c1 的 strict 报错更快、更直接；先红失败就说明机制猜错了，不能拿一个碰巧变绿的改动交差。验收 3 的 10 轮是统计门槛；4 保住 T7be 已修好的两个 ready:false 调用方与 onboardingFirst。

## 产出
- `tests/support/ui.ts`、`tests/e2e/wait-product-ready.spec.ts`、`receipts/T7beb.md`（先红原样 + 验收 1–5 原样输出，验收 3 列 10 轮逐轮计数）
- 通过后 T7be + T7beb 一起挪 done

## 经理终裁补充（2026-11-07 21:3x，HEAD eb22fe16；见 review/review-T7be.md「T7be 终裁」）
- 先红**已成立**：经理重跑该 spec 2 次，1 次红「第3轮 New chat 行数 Expected: 1 Received: 2」（`work/tickets/evidence/T7beb/manager-rerun-wpr1-red.log`）。边界 3 末条「3 次都绿就停」作废——施工方 0/15 是没抽中（约 4%/home）。
- 新格循环次数 5 → **10**。改 helper 前跑该 spec 最多 5 次，见红即止并原样贴；5 次都绿也继续修（回执写一句，先红以经理证据为准）。
- 验收 2 改为：改后同命令连跑 **5 次**，每次 `2 passed`。其余验收不变。
- 回执 `receipts/T7beb.md` 在现有内容后追加，不删「先红未复现」节（如实保留）。
