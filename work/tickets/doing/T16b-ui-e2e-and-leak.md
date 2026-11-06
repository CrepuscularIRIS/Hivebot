# T16b：T16 终验返修——app/ui e2e 对照补跑 + 新测试 /tmp 残留 + 陈旧注释

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：T16 终验不通过（receipts/T16.md §7，验收 HEAD 74802b5f）
> 分支 / 作业目录：feat/T16 @ /tmp/bot-wt/T16（续提交，不开新分支）
> claimed：2026-11-06 15:5x main (GLM 5.3) @ feat/T16 续
> accepted：

## 目标
补齐 T16 验收 5（app/ui e2e 对照）与验收 6（/tmp 残留归零）两个红项，顺手改一行陈旧注释。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. `work/tickets/receipts/T16.md` §5、§7（经理终验，红项原文与证据）
3. `app/ui/tests/support/sdk-runtime.ts:26,75`——ui e2e 经 `SDK_ROOT=../../../sdk` 真起 sdk runtime（`scripts/start.mjs`），所以「ui 零 @deepseek-ai 依赖 → e2e 恒等」的前提不成立

## 边界
1. 只动：`app/sdk/tests/unit/fs-zone-write-entries.test.ts`（残留修）、`app/sdk/tests/e2e/schedule-delivery.test.ts:3`（注释）、`work/tickets/receipts/T16.md`（§8 返修节）。产品代码不碰。e2e 若出现非噪音红，停下写回执，不在本单修。
2. 先红：残留格——修前跑 `fs-zone-write-entries.test.ts` 后 `ls $T/tmp/bot-t16-we-outside` 存在 = 红，原样贴。
3. 测试走隔离 HOME / TMPDIR，DBus 指向不存在路径。ui e2e 两套**串行**跑（主仓基点一套、worktree 一套），不与 sdk 全量同刻；T7ce/T9ae 施工的 e2e 也错开。
4. worktree 的 `app/ui` 当前无 node_modules：`pnpm install --frozen-lockfile` + `pnpm build` 后再跑；不改 ui lockfile。

## 验收（写命令，不写感觉）
前置：`T=$(mktemp -d)`，`E="env HOME=$T/home TMPDIR=$T/tmp DBUS_SESSION_BUS_ADDRESS=unix:path=$T/nonexistent"`，`PLAYWRIGHT_BROWSERS_PATH` 照 T7b 回测惯例。
1. **ui e2e 对照**：`cd app/ui && $E pnpm build && $E sh scripts/run-e2e.sh`——主仓（alpha.2 @ 主线 HEAD）与 /tmp/bot-wt/T16（rc.1）各一次，回执贴两边 `N passed / M failed` 汇总 + 逐条失败 spec 名。判据：worktree 侧失败集 ⊆ 基点失败集；多出的每一条单跑复现一次，复现即停下写回执（那是 rc.1 行为漂移，开新单），不复现记噪音。
2. **残留**：`cd app/sdk && $E pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/fs-zone-write-entries.test.ts` → 3 passed，且之后 `ls $T/tmp | grep bot-t16` 空（修前非空，红格原样贴）。
3. `grep -n "不用 rrule/target" app/sdk/tests/e2e/schedule-delivery.test.ts` → 0 行。
4. 收尾（T16 验收 6 原文）：`pgrep -af 'bot-T16'` 空；`ls $T/tmp` 只余 node-compile-cache；回执贴原样输出。
5. `git diff --stat 74802b5f..HEAD` 只含边界 1 三个文件。

## 为什么这样验收
T16 的核心风险是「9 个依赖一起升带来的静默行为漂移」。ui 的 Electron main（`main/dsh/*`、`m1-api`、`m3-meta`）是 sdk 协议的另一个消费者，sdk 自测覆盖不到它对事件形状、投影字段的读取方式——ui e2e 是这条线唯一的运行时证据，不能靠「ui 代码没改」推出来。残留项是验收 6 的字面要求：新测试把固定目录写进真 /tmp 不清，每跑一次留一份。

## 产出
- 修改：fs-zone-write-entries.test.ts（outside 目录加清理，或改放 `root` 下的区外子目录，二选一）、schedule-delivery.test.ts:3
- 回执：`work/tickets/receipts/T16.md` §8（ui e2e 两边原样汇总、残留红绿、收尾输出）
