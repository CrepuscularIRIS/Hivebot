verdict: PASS
commit: a9efa0714ce8a9f6d6fabca674b1d8531ba2b1dd（验收时 worktree /tmp/bot-wt/T-17 HEAD，工作树干净；head 若已变更本证据作废）

验收时间：2026-11-02 11:18（date +%H:%M 实测）

# T-17 · shell-ask overrideOf 抛错时 fail-closed（最终 L 复审 R1）

## 验收项

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| 1a 全量复跑 128/128 | PASS | `cd /tmp/bot-wt/T-17/app/sdk && HOME=/tmp/vfy-T-17-home pnpm test` → Test Files 18 passed (18)，Tests **128 passed (128)**；evidence/T-17/full-suite-rerun.txt |
| 1b 新用例亲跑（overrideOf 抛错 + config.policy=never → ask） | PASS | `pnpm exec vitest run tests/unit/policy.test.ts -t 'still asks when overrideOf throws and the deployment config policy is never'` → 1 passed；evidence/T-17/newcase-green.txt（用例位于 policy.test.ts:194-198，替身 `approvalSvc('ask','never',true)`） |
| 2 语义矩阵 5 格（见下） | PASS | 自写探针 `node matrix.mjs` 直接 import 真实 shell-ask.mjs，5/5 PASS；evidence/T-17/matrix.out + matrix.mjs |
| 3 红验证（detach 还原 shell-ask.mjs 单文件 → 新用例应红） | PASS | `git worktree add --detach /tmp/vfy-T-17-red a9efa07` + `git checkout a9efa07^ -- app/sdk/src/policy/shell-ask.mjs`（git status 仅此一文件，evidence/T-17/red-area.txt）→ 该用例 1 failed，Received `Symbol(next)`（放行），正是 R1 缺陷；evidence/T-17/red-old-code.txt。验证后 worktree 已删净 |
| 4 区域：diff 恰 2 文件 | PASS | `git show a9efa07 --stat`：shell-ask.mjs (+15/-5 内含)、policy.test.ts (+12)，共 2 files changed；evidence/T-17/commit-area.txt |

## 语义矩阵（探针实测，2026-11-02 11:18）

| # | 场景 | 实测 | 期望 |
|---|---|---|---|
| 1 | override=never 可读 | NEXT（放行） | 放行 |
| 2 | overrideOf 抛错 + config 未设 | ASK | ask |
| 3 | 无 session + config=never | NEXT（放行） | 放行 |
| 4 | 默认 preset pin 的 override=ask | ASK | ask |
| 5 | overrideOf 抛错 + config=never（本次修复） | ASK | ask |

格 3 边界正当性核实：上游 `effectivePolicy = overrideOf(session) ?? config.policy ?? 'ask'`（repos/deepseek-harness/packages/interaction/user-approval/src/index.ts:270-272，本机 sed 实读）。无 session 时不存在 session 级意图可折叠，部署 config 就是该调用会落到的有效策略；且 config=never 下 user-approval 对任何 ask 确定性 rejected（T-12.f1 死锁论据），此时问 = 无弹窗必拒。放行与上游折叠语义一致。有 session 而 overrideOf 抛错则不同：session 意图存在但不可证（可能是 pin 的 ask），部署默认不能代言它 → ask。两者非对称有据。另经 diff 核对：本次改动仅落在 `session !== undefined` 分支的 catch 里（旧代码吞异常置 undefined），格 1/3/4 路径未动。

## 坏路径（额外）

本任务本身即坏路径验收（异常 → fail-closed）。红验证即坏路径复现：旧实现下 overrideOf 抛错 + config=never 放行普通 bash（Received Symbol(next)），新实现 ask。矩阵格 2（服务可读但 config 未设）与「无 approval 服务」（policy.test.ts:179-186 既有用例）均 fail-closed 到 ask。

## 新问题

无。
