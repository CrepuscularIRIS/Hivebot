# T85d：t85-scroll ④ 回归护栏补实（只改 spec）

> 开单：manager (Opus 5.5) | 日期：2026-11-16 | 施工：main (GLM 5.3)
> 来源：T85c 验收核实（reviews/T85c.review.md 末段「处置等价性」）
> 分支 / 作业目录：T85 合并后在集成分支直接改（单文件 spec）
> claimed：2026-11-16 主 agent（GLM 5.3）· 集成分支 d6e03490
> accepted：2026-11-16 集成分支 @ d6e03490（经理任务 B）

## 目标
spec ④ 现在是空断言：等待 locator 被前 6 条命中、且没有分块流式。改成真能挡住 Sol M1（单条回复分块长高杀 stick）的回归。

## 边界
1. 只动 `app/ui/tests/e2e/t85-scroll.spec.ts` 第 ④ 段（L72-82）。产品代码不碰。
2. ④ 改为：点「Jump to latest」钮回底（替 L73 赋值）→ 单条回复 `textCall(16 块，每块 '块<i>。'+'长内容测试。'.repeat(120), {paceMs:150})` → 等 `hasText:'块15。'` attached → 1.5s 后断距底 <2（照 /tmp/T85c-mgr-probe/follow.spec.ts）。
3. 再加一轮：滚轮上 350 → 钮出 → 点钮 → 12 块再流 → 距底 <2。
4. 每个等待的 locator 必须用本轮唯一标记（不得复用前文已出现的文本）。

## 验收
1. `cd <ui> && CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh t85-scroll.spec.ts` 两连 1 passed
2. 红证：把 transcript.tsx T85c 段 effect 临时恢复 `check()` + deps `props.entries`（d44b93dd 形态）重 build，④ 挂且报距底 >1000；贴输出后还原、重 build、复跑绿。临时改动不提交。
3. `grep -n "nth(i)" tests/e2e/t85-scroll.spec.ts` 在 ④ 段为空

## 为什么这样验收
T85c ④ 过了却什么也没证：回归测试必须在修前形态上红过一次才算护栏。

## 产出
- `app/ui/tests/e2e/t85-scroll.spec.ts`、回执 `receipts/T85d.receipt.md`

## 施工记录（2026-11-16 @ d6e03490）

- ④ 主测内=点钮回底（钮→stick 复活链）；分块护栏拆独立 test（16 块+点钮+12 块两连 2p）
- 两轮 script 一次灌队列（中途覆盖 default.json 消费竞态实锤）
- 红证：变异恢复 d44b93dd 形态 → d=6151（Sol 探针同值）挂 →还原复绿

## 经理验收（2026-11-16，任务 B）
- t85-scroll 两遍：2 passed / 2 passed（主测 + T85d 格）。
- 红证复现：主仓 transcript.tsx 临时恢复 d44b93dd 形态（effect 内加回 `check()`、deps 加回 `props.entries`）后重 build，T85d 格失败：`16 块分块流式跟随（实际距底 6151）Expected < 2 Received 6151`；`git checkout` 还原、重 build、复跑 2 passed；`git status app/` 干净。
- `grep -n "nth(i)"` 只命中 L40（①段，原有），④ 段与 T85d 格里没有。
- 结论：**通过**。
