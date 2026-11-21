# T50ab 回执：t50a-no-key.spec 失败路径清理

> 施工：main (GLM 5.3) | 2026-11-11 | 集成分支 @ 0c475ffe（机械单，按工单不派 reviewer）

## 改动（1 文件 9+/6-）

`app/ui/tests/e2e/t50a-no-key.spec.ts`：`stub.listen` 后立刻进 `try`；`rt`/`shell` 声明 `let … | undefined` 在 try 外、try 内赋值（`launchSdkRuntime`/`launchShell` 均挪入）；finally 逆序 `shell?.stop().catch` → `rt?.stop().catch` → `stub.close`，各步吞错不阻断；:118 注释改「终态 DOM + 监听注册后 console」（原文「全程」夸大，Sol 核实）。

## 验收原样输出

1. 探针（`node /tmp/bot-t50a-sol-probe/bootstrap-cleanup.cjs; echo EXIT=$?`——探针 spec 路径已从 worktree 改指主仓一行）：
   ```
   injected shell launch failure
   {"stubOpen":false,"runtimeOpen":false,"stubCloses":1,"runtimeStops":1}
   EXIT=1
   ```
   修前同探针：`{"stubOpen":true,"runtimeOpen":true,"stubCloses":0,"runtimeStops":0}` EXIT=0（先红，原样在工单边界 2）。
2. `CI=true PATH=… run-e2e.sh tests/e2e/t50a-no-key.spec.ts` → **1 passed (9.6s)**，正常路径未破。
3. `git diff`（提交时）只含该 spec 一个文件（提交 0c475ffe stat 原样：`1 file changed, 9 insertions(+), 6 deletions(-)`）。

## 施工踩坑

- 首次 Edit 后括号配平多一层（playwright 报 `Unexpected token (128:0)`）——去掉 finally 后多余 `}` 后过。
- 探针硬编码读 worktree 旧路径（/tmp/bot-wt/T50a），主仓修复后探针不变红——sed 一行改指主仓后即反转。
