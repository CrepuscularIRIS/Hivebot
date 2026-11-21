# REPORT · P5-05（0e 子代理与根会话同表）

- 分支：`feat/P5-05`（worktree `/tmp/bot-wt/P5-05`，基于 main@9c89e64）
- Commit：`158f0b0`
- 改动文件：
  - `app/sdk/src/policy/shell-ask.mjs`（实现：never 会话原 ask 情形改 `{kind:'deny', reason:'approval unavailable in this session'}`，不再 next()；`approvalNever` fail-closed 读取不变；严格更宽升权仍委托 tool-bash 自有审批——never 下确定性 rejected，非放行）
  - `app/sdk/tests/unit/policy.test.ts`（T-12.f1 三放行用例反转，测试名注明 G1-r2 #1；补 never+模式未解析→deny、never+严格更宽→仍委托；fail-closed 各格不动）
  - `app/sdk/tests/e2e/approval.test.ts`（:408 R2 用例按 PLAN 反转，测试名注明 G2-r1 A-M；原因按枚举集 {shell-ask 原因, P5-04 guard 原因} 断言，P5-04 后合时 guard 先拦本用例照绿）
  - `app/sdk/tests/e2e/subagent-policy.test.ts`（新：subagent / subagent_fork / workflow 三工具委派探针 + 根会话照旧出卡对照）
  - `app/sdk/tests/support/fake/plugin.mjs`（per-session 脚本 ENOENT 时兜底 `scripts/default.json`——运行时才分配 sessionId 的子会话由此驱动；无 default 时原报错不变）

## 验收对照（PLAN P5-05）

| 项 | 结果 | 证据 |
|---|---|---|
| ① 单测 never→deny（反转，注明 G1-r2 #1）；overrideOf 抛错→仍 ask | 绿 | `tests/unit/policy.test.ts` describe 'P5-05 (G1-r2 #1)'，18 用例全过 |
| ② R2 用例反转：canary 不存在、approval/request 0 条、原因∈枚举集、测试名注明 | 绿 | `tests/e2e/approval.test.ts` 'R2 inverted (G2-r1 A-M, P5-05)' |
| ③ 三工具子会话 bash deny、m 不存在；根会话同命令照旧出卡 | 绿 | `tests/e2e/subagent-policy.test.ts` 3 用例（deny 原因、0 出卡、根会话 asked=1 均断言） |
| ④ 差分正对照：未打补丁时子会话 bash 会执行（m 存在） | 已做 | 实现前红跑：三用例均 `expected true to be false`（m-subagent / m-fork / m-workflow 存在）＝侧门真实 |
| ⑤ `pnpm -C app/sdk test` 全绿 | 绿 | `Test Files 21 passed (21) / Tests 153 passed (153)`，35.37s |

## 复测命令

```
pnpm -C /tmp/bot-wt/P5-05/app/sdk test
→ Test Files  21 passed (21)
→ Tests  153 passed (153)
```

## 新发现 / 环境适配（供派发者参考，未扩范围）

1. **/tmp worktree × bwrap workspace-write**：上游 profile（sandbox-local profiles.ts:17-20）在 workspace-write 模式 `--tmpfs /tmp` + 只 bind 工作区。/tmp worktree 下 pnpm node 与 PTC bootstrap（pnpm store 内）被遮蔽，workflow PTC 报 `sandbox-unavailable` / `worker-exit MODULE_NOT_FOUND`。本测试的适配：overlay 把 PTC 解释器钉 `/usr/bin/node`、bootstrap 复制进被 bind 的会话工作区（沙箱/委派/审批语义不动）。主检出（~/bot，非独立挂载）无此问题。**P5-01/P5-06 从 /tmp worktree 测任何依赖默认沙箱挂载的链路时需注意同类遮蔽。**
2. gateway 拒绝对子代理会话直接 `session/follow`（`session/agent-busy: subagent Sessions require their durable parent address`）→ 子会话行为观测改走 fake provider 的 requests.jsonl。
3. `workflow` 工具参数为 `{script, meta:{name,description}}`，`meta` 必填（缺省报 `INVALID_ARGS: missing required property "meta"`）。
4. P5-04 guard 原因字面串已在 ② 的枚举集里占位（`danger-full-access session mode is not supported`，取自 PLAN P5-04 行 v2.1 定死值）；P5-04 合入后无需改本文件。

待 verifier 验收。
