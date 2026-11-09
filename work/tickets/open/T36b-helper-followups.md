# T36b：T36 终验返修——换主走生产路径、helper 名字 label 优先、删冗余判定、补空测试

> 开单：manager (Opus 5.5) | 日期：2026-11-08 | 施工：main (GLM 5.3)
> 来源：T36 终验（`receipts/T36.receipt.md`「终验」第 3/4/5/6/7 条）
> 分支 / 作业目录：feat/T36 @ /tmp/bot-wt/T36（接 506cbfa4 继续提交，不新开分支）
> claimed：
> accepted：

## 目标
T36 的 helper 进 Workers 在**生产换主路径**下也只显示当前主 bot 的 helper；helper 名字用 label；测试真的守住名字与换主。

## 动手前先读
1. `receipts/T36.receipt.md`「终验」段（含经理探针原样输出）
2. `app/ui/renderer-grok/shim/src/data.ts:344-418`（doLoadRoster）、`:450-456`（未知 sid 重拉，现成 `void loadRoster().catch((e) => log(...))` 写法）、`:683-691`（ui.setMain）、`:325-330`（summaryOf 名字）
3. `app/ui/tests/unit/grok-shim/main-helpers.test.ts`

## 边界
1. 只动：`data.ts`、`main-helpers.test.ts`、`work/**`。M3、workers.ts、SDK 不碰。
2. 四件事，各自一处：
   1. **setMain 成功后重拉 roster**：`ui.setMain` 在 `res.ok` 后照 `:455` 的写法 `void loadRoster().catch(...)` 或 `await`（二选一，测试要能等到结果）。重拉失败**不改** setMain 的返回值（patch 已落盘），按 `:455` 记一行 log。理由：新主的 helper 不在上次的 summaries 里，本地重算拿不到；且其 sid 可能已在 `unknownTried`，不会再自动触发重拉。
   2. **helper 名字 label 优先**：summaryOf 里有非空 `values.subagent.label` 时取 label，否则 title，否则 null（`agentName` 的 'Subagent' 回落保留）。非 helper（无 subagent projection）行为不变。
   3. **删冗余判定**：filter 阶段对 `origin==='subagent' && typeof parentSessionId==='string'` 的项只收候选、一律 `return false`（不再比 `listedEarly`）；删 `:350 listedEarly`、`:363-365` 第一份 helperOf。helper 入 summaries 只在终值 mainBotId 定后的重筛一处做（重筛处把合格 helper 的 summaryOf 放进 nextSummaries；原「delete 不合格」那段随之可删，order 清保留）。目标：全文件只有一处「parent === mainBotId」判定。
   4. **测试**（先改测试看红，再改实现）：
      - ② 加断言：H1 带 `title:'count files Your parent agent'` + `label:'Count files helper'` → `data.ui.agentName(H1) === 'Count files helper'`（当前实现红）。
      - 中3 格改成真断言：无 title 无 label → `data.ui.agentName(H1) === 'Subagent'`。
      - 中1 守卫格改走生产路径：首载 main=old-main 后调 **`data.ui.setMain('new-main')`**（rig 的 metaApi 在 `op:'patch'` 时更新 currentMain），不手动 reloadRoster；断旧 helper 不在 order、`workers:old-main` section 不存在、`workers:new-main` 恰为 `['helper-new']`（当前实现红）。
      - ③ 改标题为它实际测的内容（「重拉后新 helper 进组；parent=B 的不进」），删「真实通道/自动重拉」字样与注释里的 e2e 覆盖说法。
3. 测试走隔离 HOME / TMPDIR，DBus 指向不存在路径。
4. 只在 feat/T36 提交。

## 验收（`app/ui` 下，`VR` = `pnpm --config.verify-deps-before-run=false exec vitest run`）
1. 先红：改完测试、改实现前跑 `VR tests/unit/grok-shim/main-helpers.test.ts` → ② 与中1 两格红（贴原样）
2. `VR tests/unit/grok-shim/main-helpers.test.ts tests/unit/m3/p610.test.ts` → 全绿（贴尾部）
3. `VR tests/unit/grok-shim tests/unit/m3` → 全绿，passed 数 = 306（格数不变）或说明增减
4. 变异（各贴红输出，cp 还原，不 stash / reset）：
   - V1 唯一的 `parent === mainBotId` 判定改 `true` → ① 红
   - V2 setMain 里删重拉 → 中1 格红
   - V3 summaryOf 改回 title 优先 → ② 红
   - V4 删 agentName 的 'Subagent' 回落 → 中3 格红
5. `grep -n "parentSessionId === \|parent === mainBotId\|=== listedEarly" renderer-grok/shim/src/data.ts` → 只一处判定（贴输出）
6. `pnpm --config.verify-deps-before-run=false test:e2e tests/e2e/p6-workers.spec.ts` → 2 passed（load < 8 时跑；build 先过）

## 为什么这样验收
- 用户规则是「只有**当前**主 bot 的 subagent 进 Workers」。换主是唯一会让这条规则失真的操作，而用户换主只走「Set as main bot」→ `ui.setMain`；守卫格必须走这个入口，否则测的是一条生产不存在的路径。
- 名字：生产里 dsh 自动 title 是拼接串，label 才是主 bot 起的名字；不断 `agentName` 的测试等于没测（T36 Md 变异全绿已证）。
- 删冗余：同一规则写两遍，Ma 变异证明其中一份不承重；留着就是下次换主逻辑改一份漏一份。V1 保证删完后那唯一一处真承重。

## 产出
- `data.ts`、`main-helpers.test.ts`
- `work/tickets/receipts/T36.receipt.md` 追加「T36b」段
