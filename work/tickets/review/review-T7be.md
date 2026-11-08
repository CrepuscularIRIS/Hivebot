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
