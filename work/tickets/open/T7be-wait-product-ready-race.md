# T7be：`waitProductReady` 裸壳兜底竞态根修（引导层残留盖住主区）

> 开单：manager (Opus 5.5) | 日期：2026-11-07 | 施工：main (GLM 5.3)
> 来源：review/review-T7bd.md Sol UNKNOWN 1 → 经理复现 CONFIRMED（「T7bd 终验」节第 3 条）
> 分支 / 作业目录：直接在集成分支 `docs/rebuild-p6-p5-plan`（只改测试 helper + 新增一格 spec，小单）
> 排期：现在可做；ui e2e 与 T32c 等同刻只跑一套
> claimed：
> accepted：（2026-11-07 终验 @ 5db7d1d9 不通过 第 1 次 → T7beb；见 review/review-T7be.md「T7be 终验」）
> 失败计数：2（第 2 次 = T7beb 终验 2026-11-07 @ 87e517c0 不通过 → T7bec；本次 B 兼 C 重规划，方案不变、范围收窄）

## 目标
裸 `launchShell` 后调 `waitProductReady`，不管壳此前是否已用旧 seen 打开引导，返回时引导层必须不在、主区可点。

## 现状（经理 2026-11-07 在 050d9752 实测）
- `tests/support/ui.ts:79-84`：seen 未置时只写 localStorage + `__pbotsDev.reloadRoster()`，然后只等侧栏首行可见。
- 壳侧 `ProductionRenderer.tsx:2750-2753` 启动时用当时的 seen（未置）+ countAgents=0 打开引导；引导只能经 finish/skip 关（`:3165`、`:2774`），storage 与 roster 变化都关不掉它。
- 探针：裸壳立即调 helper，12 次中 5 次 `.sand-onboarding` 留在 DOM 且可见（1280×820）；先等引导打开再调 helper → 必现，此时 `button[aria-label="View agent settings"]` 点击超时。
- `launchProduct`（`ui.ts:99-108`）早已用「置 seen → 整页 reload → 等 `__pbotsDev` → 计零哨兵」规避，裸壳路径没复用。走 `createBots` 的 spec 因其 `page.reload()` 自愈；grok-dead-entries / settings / market 等无 reload 的偶发红。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md（末两条）
2. `app/ui/tests/support/ui.ts:72-110`
3. review/review-T7bd.md「T7bd 终验」第 3 条

## 边界
1. 只动：`app/ui/tests/support/ui.ts`、新建 `app/ui/tests/e2e/wait-product-ready.spec.ts`、新建 `work/tickets/receipts/T7be.md`。不改产品代码、不改其他 spec。
2. 做法（最小）：把 `launchProduct` 里 `:102-105` 的四行抽成一个函数（置 seen + reload + 等 `__pbotsDev`），`launchProduct` 与 `waitProductReady` 的 seen 未置分支共用；`waitProductReady` 末尾加 `await expect(page.locator('.sand-onboarding')).toHaveCount(0)`（`launchProduct:108` 的哨兵随之可删，等价）。seen 判定前先等 `__pbotsDev` 就绪，避免在应用加载前读到别的文档。不再调 `reloadRoster`（reload 后 gate 自然建 main）。
3. 先 grep 确认所有 `onboardingFirst: true` 调用方都带 `ready: false`（经理已查 onboarding.spec 6 处都带）；若出现不带的，停下写存疑。
4. 先写失败测试：新 spec 一格——裸 `launchShell`（照 skills-picker 起 fake runtime）→ `await expect(page.locator('.sand-onboarding')).toHaveCount(1, { timeout: 30_000 })`（确定性进入竞态态）→ `waitProductReady(page)` → 断言 `.sand-onboarding` 计 0 且 `button[aria-label="View agent settings"]` 可见。改 helper 前跑它 **必红**，原样贴回执。
5. 隔离 HOME / TMPDIR / DBus；`PLAYWRIGHT_BROWSERS_PATH=/home/lingxufeng/.cache/ms-playwright`；`PATH="$PWD/node_modules/.bin:$PATH"`（miniconda playwright 抢 PATH）。收尾 bot-reap 自己的进程。

## 验收（写命令，不写感觉）
统一前置同 T7bd（`cd ~/bot/app/ui`，`$E` 隔离环境，先 `pnpm --config.verify-deps-before-run=false build`）
1. 先红：helper 未改时 `$E sh scripts/run-e2e.sh tests/e2e/wait-product-ready.spec.ts` → 1 failed（贴失败行：计零断言或按钮不可见）
2. 改后同命令 → 1 passed；**连跑 3 次**均 passed
3. `$E sh scripts/run-e2e.sh tests/e2e/grok-dead-entries.spec.ts tests/e2e/settings.spec.ts tests/e2e/market.spec.ts` → 全 passed
4. `$E sh scripts/run-e2e.sh tests/e2e/skills-picker.spec.ts tests/e2e/t7b-shot.spec.ts tests/e2e/onboarding.spec.ts` → 全 passed（onboarding 证 `onboardingFirst` 不受影响）
5. `git diff <起点>..HEAD --stat` 只含边界第 1 条三个文件
6. `git status --short app/ui` → 空（证明跑的是已提交代码）

## 为什么这样验收
竞态约 4 成概率，普通回测绿不说明修好。验收 1 用「先等引导打开」把竞态钉成必现，红→绿才证明 helper 真能把已打开的引导撤掉；2 连跑防偶然；3 覆盖今天没有 reload 自愈、真正暴露的调用方；4 防新流程误伤 onboarding 专项与本链截图。修在共享 helper 一处，所有裸壳调用方一起受益。

## 产出
- `tests/support/ui.ts`、`tests/e2e/wait-product-ready.spec.ts`、`receipts/T7be.md`（先红原样 + 验收 1–6 原样输出）
