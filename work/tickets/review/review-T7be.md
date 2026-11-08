# T7be Sol 审查代录（2026-11-07 20:22，主会话机械代录）

范围：01a5e63f；纯静态阅读，未改文件、未跑构建/e2e。
总评：高 0、中 1（静态确认，未实测）；撤除已开引导的修法合理，但「删除独立哨兵等价」的依据不成立，D10c1 尚不能定责。

## CONFIRMED
- 中｜ui.ts:110-112：独立哨兵删除并不等价。ready:false 时既不执行 waitProductReady，也不再检查引导计零，削弱已有验收保护；应保留 !onboardingFirst 路径的独立哨兵。
- 同条证据：提交内确有 resilience.spec.ts:16 和 theme-flash.spec.ts:172 两个 ready:false、未设 onboardingFirst 的调用；后者随后自行调用 helper，前者没有。回执 T7be.md:31 的 grep 结论错误。

## REFUTED
- 「onboardingFirst:true 被强制跳过引导」：ui.ts:110 明确绕过 ensureOnboardingSeen；onboarding.spec 六处均带 ready:false。
- 「吞错后引导残留也能直接绿」：ui.ts:94-95 仍要求侧栏首行可见、引导节点为零。
- 「新 spec 等引导出现是无意义脆弱性」：spec:17 是工单明确要求的竞态前置条件。

## UNKNOWN
- 超时吞错：ui.ts:77-80 确会在等待超时后继续写 storage、reload；:88-93 也会吞 reload 失败。建议让同步失败直接抛出，保留根因。
- D10c1：data.ts:338-365 支持「成功但缺失 main 的 roster 导致补建」，不证明 SDK 启动曾返回空列表；另一候选在 shell1（__pbotsDev 在 index.ts:73-74 start 前发布，旧文档 seen 写入后建 main+紧接 reload；data.ts:331-335 单飞只覆盖单文档）。运行证据缺。
- 回执真实性：计数内部一致（9=2+1+6、每批5=1+2+2、11=3+8）、先红行对应新 spec:19；但回执只有节选无逐轮日志；验收 3 未达工单要求全绿。

## 施工修复（同轮）
- 哨兵恢复（CONFIRMED 中1）→ 提交见 receipts/T7be.md「review 修复」节；grep 结论更正；D10c1 候选补充。

## T7be 终验（manager Opus 5.5，2026-11-07 20:4x，HEAD 5db7d1d9，load 4.7）

**结论：不通过 第 1 次 → 修复单 `open/T7beb-ensure-seen-settle.md`。** 核心目标（已开引导被撤）达成且复验；中1 修复真落；但验收 3 未绿，且 D10c1 双 main 有指向 T7be helper 自身的代码级机制，修法在 T7be 边界（ui.ts）内，不能当「产品侧遗留」放行。

### 重跑（app/ui，隔离 HOME/TMPDIR/DBus，先 build）
- `wait-product-ready.spec.ts` → `1 passed (3.4s)`
- `resilience.spec.ts theme-flash.spec.ts` → `10 passed (1.4m)`（回执 11=1+10，一致）
- `onboarding.spec.ts` → `6 passed (29.5s)`
- `git status --short app/ui` → 空
- D10c1 未复跑（见裁定 1：回执 11 轮数据够定性，定责交 T7beb 先红）

### 中1 修复核实：CONFIRMED 已修
- `761eb33e --stat` 只动 `app/ui/tests/support/ui.ts`（+2/-1）。
- ui.ts:112 恢复行与 T7be 前原句（`01a5e63f~1` 的 launchProduct 末行）逐字同义：`if (!onboardingFirst) await expect(...'.sand-onboarding').toHaveCount(0)`。
- grep `ready: *false`：resilience.spec:16、theme-flash.spec:172 两个非 onboardingFirst 调用方现在都过独立哨兵；其余 7 处都带 `onboardingFirst: true`（onboarding×6、shot-t32×1）。
- T7be 两个代码提交合计只动 ui.ts + 新 spec，边界合规。

### 裁定 1：D10c1 双 main —— 算 T7be 返修项（开 T7beb）
机制（读码，比回执两个候选更具体）：
- shim `index.ts:73-74`：`__pbotsDev` 与 `data.start()` 同步发布；旧文档里 roster 会拉两次——`start()` 立即一次（`data.ts:739`）、socket open 后再一次（`:445`，前一次已结束则单飞不合并）；且 `doLoadRoster` 在 `await session/list + meta`（`:338`）**之后**才读 seen（`:351`）。
- 新 `ensureOnboardingSeen`（ui.ts:76-81）等到 `__pbotsDev`（几乎立即就有）就写 seen 并整页 reload——**写入常落在旧文档某次 doLoadRoster 读 seen 之前**（窗口宽：两次拉取任一次都行）。旧文档于是读到 seen=1+空 roster → `session/create`（`:361`）；reload 把它砍在 create 与 meta patch 之间 → 新文档 list 里有一条无主的未命名会话、meta 无 mainBotId → 再建一个。持久层留下两个 "New chat"。
- D10c1 的 shell1 是裸 `launchShell + waitProductReady`（settings.spec:137/141），正好走这条；shell2 同 home、seen 已=1，helper 不 reload，新旧 helper 行为相同——所以**新增的暴露在 shell1，由 T7be helper 引入**；shell2 只是第一个按 `MAIN_TITLE` 点主 bot 的地方，把它显出来（strict 2 elements）。
- 旧 helper 在同一文档里 `reloadRoster`，单飞（`:331-335`）合并到首次拉取，不会双建——与「旧 0/1」相符（样本小，只作旁证）。
- `launchProduct` 自 T26b 起就有同一窗口（同样等 `__pbotsDev` 就写+reload），只是没有 spec 在重启后点主 bot 才没暴露；修在 `ensureOnboardingSeen` 一处两边都受益。
- 产品侧（create 与 patch 非原子、跨文档无幂等）是真问题但生产触发要「首启置 seen 当口刷新」，低优先；**不在 T7be/T7beb 修**，写进 queue 提议。
- T7beb 先红会判真伪：若「立即调 helper 后 session 数=1」5 次跑不红，说明机制不对，按单内分支处理（T7be 放行、D10c1 转产品单）。

### 裁定 2：UNKNOWN 超时吞错 —— 不改，不算返修项
- `page.evaluate(...).catch(() => false)` 防的是导航瞬间「Execution context was destroyed」，保留合理。
- `waitForFunction(__pbotsDev).catch` 吞超时：吞后末尾 `sand-agent-item` 可见 + `sand-onboarding` 计零两条断言照样红，只是报错位置往后挪、少了根因。属诊断质量，不影响正确性；不单独开单。T7beb 若顺手改 ensureOnboardingSeen 的等待，**不要求**、也不禁止把这两个 `.catch` 去掉（去掉时回执写一句）。

## T7be 终裁（manager Opus 5.5，2026-11-07 21:3x，HEAD eb22fe16，load 2.5–3.5）

**结论：预案不执行——T7be 不放行，T7beb 不改判，继续施工（修法照单）。** T7be 失败计数维持 1（本轮不是新失败：T7beb 是按单停手待裁，不是返修失败）。

### 经理加跑（app/ui，隔离 HOME/TMPDIR/DBus，PATH 前置本地 .bin，先 build；原样见 `evidence/T7beb/`）
```
wpr1:   1 failed   1 passed (11.7s)      ← T7beb 格「第3轮 New chat 行数 Expected: 1 Received: 2」(spec:43)
wpr2:   2 passed (17.0s)
batch1..5 (grok-dead-entries+settings+market): 5 passed ×5
```
- **先红成立**：helper 未改、全新 home、只走「立即 helper → reload → helper」就出两个 "New chat"——正是 T7beb 机制预言的失败形态（侧栏计 2），不是别的红。施工方 3 次（15 home）全绿只是没抽中：合计 1/25 home ≈ 4%/home，0/15 的概率 ≈ 0.54，不能据此说机制不对。
- 预案「3 次都绿 → 机制不对」写的门槛太松（3 次 15 home 对 4% 级事件没有鉴别力），这是经理上轮的错，不是施工方的。
- D10c1 批跑本轮 0/5 红，合计 3/16 ≈ 19%；数据支持「低频、时序敏感」，不改裁定。

### 裁定 1：T7be 不放行
T7be 自身目标（撤已开引导）复验仍通过；但它的 helper 整页 reload 制造的双 main 已被 T7be 自己的 spec 抓到红，修法在 ui.ts 边界内且很小（T7beb 边界第 2 条）。放行等于把一个已证实、可在测试侧修掉的 4%/home 双建带进所有裸壳 spec。T7be+T7beb 仍按原单「通过后一起挪 done」。

### 裁定 2：D10c1 / 产品侧——维持 queue 提议（7b⁵′），不开单
- 测试侧双建由 T7beb 消；产品侧（`data.ts:359-365` create 与 meta patch 非原子、跨文档无幂等）生产触发要「建主 bot 当口刷新/崩溃」，面窄，仍低优先。
- 触发开单的条件（任一）：① T7beb 修后 D10c1 批跑 10 轮仍有「New chat 2 elements」红（说明双建另有非 helper 源，如 shell2 重启路径）；② 任何真实使用出现重复主 bot / 多个未命名 "New chat"；③ T8 e2e 收口或对外发布前清账。

### T7beb 施工补充（已写进工单「经理终裁补充」节，覆盖原边界 3 末条「3 次都绿就停」）
1. 先红以经理证据为准（`evidence/T7beb/manager-rerun-wpr1-red.log`），不再因施工方未复现停手。
2. 新格循环 5 → 10（同格，提高单次灵敏度）；改 helper 前跑该 spec 最多 5 次，见红即止，原样贴；5 次都绿也照样往下修（回执写一句）。
3. 验收 2 改为：改后连跑 **5 次**每次 `2 passed`（50 个全新 home）。验收 3（10 轮批跑）、4、5 不变。

## T7beb 终验（manager Opus 5.5，2026-11-07 22:0x–22:3x，HEAD 87e517c0，load 5.4–7.6）

**结论：不通过 → 修复单 `open/T7bec-settle-skip-ready-false.md`。T7be、T7beb 都留在 open，不挪 done，不放行合并。**
T7be 链失败计数到 2（T7be 1 次，T7beb 本轮 1 次）：本段兼做 C 重规划——根因已查清，方案不变，只把范围收窄到一处，不需要重拆。

### Sol 中1 核实：CONFIRMED，已修且语义正确
- `playwright-core@1.64.1/lib/coreBundle.js:25707` `const success = predicate(); if (success) fulfill(success)`——没有 await，async predicate 返回的 Promise 恒 truthy，第一次调用就 fulfill。8469b3b1 的轮询其实只发了一次 `reloadRoster`，然后立即 reload。
- 修复 a31b1ea5：`expect.poll`（`playwright/lib/matchers/expect.js:4754 pollAgainstDeadline` 每轮 `await raceAgainstDeadline(callback)`）→ 回调里 `await page.evaluate(async …)` → 页面内 `await reloadRoster()`（单飞会并入进行中的那次拉取）→ 读 `state.meta.mainBotId`（`data.ts:686` 实时 getter）。`mainBotId` 只在 `metaApi patch` ok 之后才赋值（`data.ts:363-367`），所以「非 null」等价于「主 bot 已持久化」，之后的拉取都幂等——判据成立。`expect` 从 `playwright/test` 导入（ui.ts:4），`.poll` 可用。死代码已删。
- 改动面：`git diff f6e95a5a..HEAD -- app/` 只有 ui.ts（+11）和 wait-product-ready.spec.ts（循环 5→10），合规。

### 经理重跑（expect.poll 版；原样见 `evidence/T7beb/final/`、`final-summary.txt`）
```
build exit 0
wpr1..5:   2 passed (31.8/32.0/32.7/31.9/31.5s)        ← 验收 2 ✓（50 个全新 home）
batch1..10 (grok-dead-entries+settings+market): 5 passed ×10，New chat 计 2 = 0   ← 验收 3 ✓
acc4 (resilience+theme-flash+onboarding):  1 failed  15 passed (2.4m)            ← 验收 4 ✗
  ✘ resilience.spec.ts:15 [GU-1] pbots:api 全路径注入抛错 (32.0s)
    Expected: true / Received: false — Timeout 30000ms exceeded while waiting on the predicate
    at ensureOnboardingSeen (ui.ts:89) ← launchProduct (ui.ts:121) ← resilience.spec.ts:16
git status --short app/ui → 空
```
- 关于「3 轮 + 首轮 10 轮」怎么采信：**首轮 10 轮不采信**（它跑的是假轮询版，相当于「发一次 reloadRoster 就 reload」，证明不了修复）。本轮在真轮询版上补满 10 轮，0 红；再加上 wpr 修后 10 次（施工 5 + 经理 5，共 100 个 home，按修前 4%/home 算全绿概率 ≈0.017），双 main 消除的证据够了。**D10c1 这部分算通过**，queue 7b⁵′ 开单触发条件 ① 没有触发。

### 验收 4 失败：真回归，必现，不是抽样问题
- GU-1 注入所有 api 抛错 → `reloadRoster` 永远失败 → `mainBotId` 永远 null → 新加的 settle 轮询必定超时 30s 并抛出（这正是 T7beb 要求的「超时要抛」）。`launchProduct` 对 `!onboardingFirst` 的调用方无条件走 `ensureOnboardingSeen`（ui.ts:121），连 `ready:false` 也一样。
- 首轮假轮询版恰好绕过了这个问题：只发一次就 reload，不等结果；回执里的「16 passed」就是在那一版上跑的。review 修复后施工方只重跑了验收 2 和 3 轮批跑，**验收 4 没重跑**——流程缺口：改了 helper 语义，就得重跑全部验收。
- 根因是语义：`ready:false` 的意思是「调用方不要求产品就绪」（GU-1 要的就是 roster 起不来），而 settle 的前提恰好是「主 bot 能建成」。对 ready:false 做 settle 本身就是错的，问题不在超时长短。

### 修法（T7bec，最小）
`ensureOnboardingSeen(page, settle = true)`；`launchProduct` 传 `settle: ready`；`waitProductReady` 照旧 settle。ready:false 的两个调用方：resilience:16（roster 故意起不来）不需要 settle；theme-flash:172（同 home 第二次启动，主 bot 早已持久化，没有双建窗口）也不需要。ready:true 的路径和裸壳路径不受影响，所以验收 2、3 的结论直接沿用，不重跑 10 轮。

## T7bec 终验（manager Opus 5.5，2026-11-07 22:44–22:53，HEAD 27f0bc40，load 5.9–7.6）

**结论：通过。T7be + T7beb + T7bec 三张一起挪到 done/（accepted 2026-11-07 27f0bc40），T7be 链结束，可以合并。**

### 经理重跑（隔离 HOME/TMPDIR/死 DBus，先 build；原样见 `evidence/T7bec/`）
```
build exit 0
res    (resilience):                           4 passed (43.8s)；GU-1 :15 ✓ 3.1s     ← 验收 2 时长门槛 <15s ✓
acc2a  (resilience+theme-flash+onboarding):   16 passed (1.9m)；GU-1 3.5s
acc2b  (同上第 2 次):                          16 passed (1.9m)；GU-1 3.0s          ← 验收 2 ✓
wpr1/wpr2 (wait-product-ready):                2 passed (31.6s) ×2                  ← 验收 3 ✓
batch  (grok-dead-entries+settings+market):    5 passed (1.9m)                      ← 验收 4 ✓
git status --short app/ui → 空                                                       ← 验收 5 ✓
```
和回执逐项一致（回执 GU-1 3.1s / 16×2 / 2×2 / 5）。验收 1 的先红没有重跑：修复前的必现红经理已有自己的证据（`evidence/T7beb/final/acc4.log`，GU-1 在 ui.ts:89 处 32.0s 超时），回执 32.2s 的形态与之相同。

### 审点
1. **改动范围**：`git diff 87e517c0..HEAD -- app/` 恰好是 `tests/support/ui.ts`（settle 参数 + `if (settle)` 包裹 + launchProduct 传参）和 `wait-product-ready.spec.ts:28` 注释「5 次→10 次」一行，后者与 `i <= 10` 对齐。没有动产品代码，没有动其他 spec。✓
2. **ready:true 路径逐字等价**：diff 里 expect.poll 的回调、`timeout: 30_000`、`intervals`、`.toBe(true)` 都没改，只是外面套了一层 `if (settle)`，缩进跟着变。launchProduct 的 ready:true 调用传 true；waitProductReady:104 的调用不带参数，走默认 true。✓
3. **settle=false 时其余步骤照旧**：首次等 `__pbotsDev`、写 seen、`page.reload()`、再等 `__pbotsDev` 都在 if 外面，照常执行。GU-1 之后的断言（session/list 调用 ≥3、`.sand-shell` 可见、没有 "Couldn't render"、事件循环活着）和 launchProduct:125 的引导计零哨兵，靠的正是 seen 加 reload，不靠被跳过的 settle。theme-flash:172 在同一 home 第二次启动，主 bot 早已持久化，不需要 settle。onboarding 系列走 `onboardingFirst:true`，根本不进 ensureOnboardingSeen。✓
4. **超时不被吞**：if 块里的 expect.poll 没加 `.catch`，ready:true 路径超时照旧抛到 launchProduct。（附注，不阻塞：waitProductReady:101-106 原本就有 `try{…}catch{}` 包住 ensureOnboardingSeen，裸壳路径的 settle 超时会被吞掉。这一段是 T7be/T7beb 时期就有的，不是本单引入的。被吞以后，后面还有 `.sand-agent-item` 可见和 `.sand-onboarding` 计零两道断言兜底，所以测试不会假绿。不开单。）
5. **流程缺口已补**：回执贴了 1–5 的全部输出，改了 helper 语义之后重跑了全部验收，T7beb 时漏掉的那一步这次补上了。

### 沿用
D10c1 双 main 消除的证据沿用 T7beb 终验：wpr 共 100 个 home 加 10 轮批跑，0 红。queue 7b⁵′（产品侧主 bot 建立非原子）维持提议，开单触发条件都没有触发。
