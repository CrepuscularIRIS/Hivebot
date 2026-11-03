# REPORT · P5-27 中途打断（A12）

2026-11-03 12:26 · builder（GLM 5.3）· worktree `/tmp/bot-wt/P5-27` · 分支 `feat/P5-27` · commit `91a4988`

**结论：上游达标，未改产品代码**（PLAN 捷径列「先测上游打断链路」）。默认档即含 P5-01 最终 wrapper（`writeRuntimePatch` 的 `id: sandbox` 行 → `python3 -I bwrap-wrap.py` 后 `os.execv` bwrap，信号路径保持）+ guard/shell-ask 全链，实测 cancel 发起 → bash 进程树全退 **4.70–6.25 ms**，远低于 R4b 验收阈值 **5000 ms**。

## 验收对照（PLAN P5-27 ①②③）

| 项 | 验收 | 结果 | 证据 |
|---|---|---|---|
| ① | fake 第 2 步 `sleep 600`，停止后 ≤R4b 时限（5000ms）内 bash 进程树（含 bwrap 子进程）退出（按自身 spawn 记录的 PID 查 `/proc`，不用 pkill） | **PASS**（4.70–6.25 ms） | `interrupt.test.ts` 两条用例；PID 记录 = `processTree(runtimeDshPid)` + PPid 上溯到 dsh 为止的链 + 链根整棵子树；退出判据 = 记录 PID 的 `/proc/<pid>` 全消失（zombie 也有 `/proc/<pid>`，故含防僵尸）；作业树断言含 `bwrap` 与 `sleep` |
| ② | 之后 0 个新工具调用 | **PASS** | 取消后 1s 宽限：`tool/call` 事件恒 2、该会话模型请求（fake requests.jsonl）恒 2、审批卡恰 2 张均已代答；turn/end reason = `{kind:'aborted', reason:{kind:'user'}}` |
| ③ | 会话可继续发消息并收到回复 | **PASS** | 同一 session 续发 → 收到第 3 条脚本文本 `P527_CONTINUED`、模型请求恰 +1（=3）、无新工具调用、已记录 PID 不复活 |

测试侧打断入口与 UI 等价：`cancelTurn(sessionId)` → `api('session/cancel', {request:{sessionId}})`（`app/ui/renderer/shell/store.ts:375-377`，本次已复核），测试直接 `client.call('session/cancel', ...)` 同参；ack 断言 `accepted:true`（R4b：ACK 非全树退出承诺，计时以 /proc 轮询为准）。

## 实测数据表（cancel 发起 → 进程树全退，ms；阈值 5000）

worktree `/tmp/bot-wt/P5-27`（node 24 via pnpm devEngines），2026-11-03 12:21–12:24，load average 7.5–12（GPU 训练在跑，非空载）。时钟 `performance.now()` 取在 `client.call('session/cancel')` 之前（R4b 同口径）；`/proc` 轮询间隔 5 ms，结果为观测上界。

| 轮次 | 命令 | 全退耗时 ms | turn/end |
|---|---|---:|---|
| 1 | `sleep 600 & wait` | 5.16 | aborted/user |
| 2 | `sleep 600 & wait` | 6.25 | aborted/user |
| 3 | `sleep 600 & wait` | 5.86 | aborted/user |
| 4 | `sleep 600 & wait` | 5.42 | aborted/user |
| 5 | `trap '' TERM; sleep 600 & wait` | 4.79 | aborted/user |
| 6 | `trap '' TERM; sleep 600 & wait` | 4.70 | aborted/user |
| 7 | `trap '' TERM; sleep 600 & wait` | 6.15 | aborted/user |
| 8 | `trap '' TERM; sleep 600 & wait` | 5.78 | aborted/user |

- 范围 **4.70–6.25 ms**，与 R4b（默认 bwrap argv，4.5–6.3 ms）同量级——P5-01 最终 wrapper 不劣化取消路径（`os.execv` 保持信号路径）。
- trap 变体与普通树同速：PID namespace 清理（外层 bwrap TERM 退出连带 namespace 内进程），非 dsh 3s TERM→KILL 宽限路径，与 R4b 结论 3 一致。
- 进程树形（断言 `含 bwrap` 通过）：dsh → bwrap（python exec 替换，P5-01 wrapper）→ bwrap（namespace 内层）→ `bash -c` → sleep。

## 交付

- 文件：`app/sdk/tests/e2e/interrupt.test.ts`（新，359 行，唯一改动）
- 分支：`feat/P5-27`（基于 main `c6aba1b`），commit `91a4988`
- 复测命令：
  - `pnpm -C app/sdk test tests/e2e/interrupt.test.ts --disableConsoleIntercept`（实测行打印需该 flag；vitest 5 默认拦截 console 输出）→ 2 passed
  - `pnpm -C app/sdk test`（全量）→ **Test Files 32 passed (32) / Tests 251 passed (251)**

## 边界与已知限制（沿 R4b 注意事项，未扩范围）

- 单活动 prompt、无排队输入（`keepInbox:true` 语义下「停止后不再开工具」限定本轮及无其他已排队输入）；排队队列清空语义不在本任务。
- 已显式后台 / 已移交后台的 job 不等同当前前台调用，「cancel 杀尽历史后台 job」未验证、不暗含。
- 5000 ms 是有证据的验收阈值，非对任意宿主负载的性能承诺（本轮 load 7.5–12 下仍 ~6 ms）。
- vitest 5 默认不显示用例内 console（实测行要 `--disableConsoleIntercept`），已写进测试头注释与复测命令。

## 未完成项 / 新问题

无未完成项。无产品改动 → 不触发合并回归；如需合并：本分支仅新增一个测试文件，`pnpm -C app/sdk test` 已在 worktree 全绿。

待 verifier 验收。
