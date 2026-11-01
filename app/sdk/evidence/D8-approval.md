# D8 证据 · 审批（T-07，2026-11-01）

## 红用例：纯 preset 配置表达不了「普通 shell 必问」（写 src/policy 前跑出）

命令（worktree /tmp/bot-wt/T-07，feat/T-07）：

```sh
P2SDK_T07_PRESET_ONLY=1 pnpm -C app/sdk vitest run tests/e2e/approval.test.ts
```

`P2SDK_T07_PRESET_ONLY=1` 只挂 fake provider overlay，不挂 `profile/patches/approval.yml`
——组合即 dsh 默认权限行（`approval` policy=ask + `permission` 默认表，默认
preset=workspace-write）。结果：**2 个用例都在 ① 段超时红**（10s 内没有
approval/request 到达 `$events`）：

```
FAIL  tests/e2e/approval.test.ts > D8: ordinary shell asks for approval; ...
Error: timed out after 10000ms waiting for approval/request for session-b61753f5-...
FAIL  tests/e2e/approval.test.ts > D8: an approval granted in session Y does not release ...
Error: timed out after 10000ms waiting for approval/request for session-6f0c8ab8-...
      Tests  2 failed (2)
```

关键：红不是「工具没跑」，而是「没问就跑了」。会话日志
（session-b61753f5…，`unzstd -dc` 解码）事件序列：

```
permission/preset {preset: workspace-write}
sandbox/mode      {mode: workspace-write}
approval/policy   {policy: ask}
turn/start … tool/call {name: bash, arguments: {"command":"touch …/canary-denied","description":"…"}}
tool/result       isError: false, "(no output)"      ← touch 成功执行
turn/end
approval/asked   —— 整个日志 0 条
```

`workspace/canary-denied`、`canary-x`、`canary-y` 全部未经审批直接创建。
即：preset 的 ask 只覆盖 tool-bash 显式 `sandbox_permissions` 升权
（approveBashEscalation），普通 shell 调用直通。依据 ext-mapping.md:34 判断，
据此自建最小 `tools/pre-execute` 插件（src/policy/shell-ask.mjs）。

## 绿：五段验收（插件落地后）

命令：`pnpm -C app/sdk vitest run tests/e2e/approval.test.ts` → **2 passed**。
全套（串行，GPU 约束）：`pnpm -C app/sdk vitest run --no-file-parallelism` →
**13 files / 61 tests 全绿**（2026-11-01 16:23，feat/T-07）。

- ①普通 bash 调用（无 sandbox_permissions）→ `$events` waterfall 帧
  `approval/request`，`agentId` = 发起 session 的 sessionId（Agent.id 即
  SessionId，gateway 投影剥掉 agent 只转发 agentId），`request.toolName` =
  bash；会话日志同时落 `approval/asked` 审计事件。
- ②answer `rejected` → tool/result isError（"the user rejected tool bash"）、
  canary 不存在、turn/end；日志落 `approval/decided {rejected}`。
- ③双活 session X/Y 同时挂起（各自独立 prompt + 脚本）：批准 Y 的 eventId →
  canary-y 存在、canary-x 仍不存在；再拒 X → canary-x 始终不存在。
- ④answer `allowed-once` → 命令执行、canary 存在；日志落
  `approval/decided {allowed-once}` + tool/result 成功。
- ⑤`permissionPresets/catalog`.defaultPreset = workspace-write、session 投影
  `permissions.currentValue` = workspace-write、落账事件 `sandbox/mode` =
  workspace-write + `approval/policy` = ask——非 bypass、非
  danger-full-access（断言逐条负向 + 实际值）。

## 覆盖率注记（本任务外发现）

`pnpm test:coverage` 在 main 基线（不含 T-07 文件实测）即 **71.58% stmts /
74.37% lines，低于 80% 阈值**；缺口来自 `src/p2temp/index.mjs`（67%，服务类
只在子进程运行，v8 覆盖率看不见）与 `src/start.ts`（72.99%）。T-07 新增
`src/policy/shell-ask.mjs` 100% 覆盖（单测 5 条 + e2e），把全局拉到
72.63/75.3，仍不达阈值——旧问题，需派发修复任务（涉及在途文件
src/start.ts，本任务不越界处理）。

