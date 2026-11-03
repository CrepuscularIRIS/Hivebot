# R4b · dsh 中途打断实际时限

2026-11-03 · p5-parity · 输入 BRIEF v2.1 A12 / R4⑤、PLAN P5-27。结论基于真实已安装 SDK 实测，不是真模型，不改产品或参考仓源码。

## 决策行

| 能力 | 候选 | 阶梯级别 | 许可证 | 维护（最近 commit / release） | 决策 | 理由 / 适配工作量 |
|---|---|---|---|---|---|---|---|
| 当前前台 bash 的停止、会话继续 | `@deepseek-ai/dsh@0.2.2-alpha.2` 及其 session-controller / agent-loop / tool-bash / bash-sandbox / subprocess-local | 1（沿用已锁定依赖） | MIT，`repos/deepseek-harness/LICENSE:1-13` | GitHub 最新 commit `ce7073d51254c26cd63b22a60835b8f948deb447`，2026-10-29T16:13:15Z；npm modified 2026-10-29T16:01:29.872Z；issue 人工响应未验证（查询 closed issues 返回空，不能据此断言无人维护） | **集成** | 当前真实链路已满足这条固定场景，无需自建进程终止器；P5-27 接现有 `session/cancel`，加真实进程树回归即可。建议 A12 保留 **5,000 ms 验收阈值**，不是上游硬实时保证；必须在 P5-01 最终 wrapper 上重跑。 |

本任务是指定上游既有行为的事实核验，不是另选执行后端，故不为比较而引入第二套 session / subprocess 包。已有依赖优先，未复制上游实现。

## 核心结论

1. **UI 的实际 RPC 是 `session/cancel`，不是 `session/abort`。** `cancelTurn()` 直接发 `session/cancel`（`app/ui/renderer/shell/store.ts:366-368`）。本文“session abort”指此 RPC 引起的 turn AbortSignal；没有用关闭 WebSocket、取消 follow 流或杀 SDK 冒充点击停止。
2. 三次正常 `sleep 600` 进程树，从调用停止 RPC 之前计时，到 `/proc` 检测全树不再运行为 **4.536–6.330 ms**；同三次从 SDK 真正发送 SIGTERM 系统调用开始，到树内最后一个进程退出为 **0.400–0.752 ms**。第四次 bash / sleep 忽略 TERM，也在 **5.504 ms** 内全树退出。
3. 上游清理升级参数 **`graceMs = 3,000 ms`**：先 TERM，仍存活再 KILL。但本次默认 bwrap PID namespace 下，无一轮等到 3 秒升级；外层 bwrap 的 TERM 退出使 namespace 内残留进程被立即清掉。不能把“树内见到 KILL”误写成“dsh 的 3 秒升级触发”。
4. 四轮均无留存进程（包括 zombie），均有 `turn/end.reason = {kind:'aborted', reason:{kind:'user'}}`。同一 session 发下一条 prompt，四轮都收到 `R4B_CONTINUED`；取消后、续发前模型请求数固定为 2，续发后才变成 3；整段只有原来的两个 `tool/call`，没有新工具调用。
5. **未发现默认每 turn 的工具调用总数 / step 数硬上限。** `maxParallelToolCalls` 是单 step 并发数，不是总调用数；repeat-tool-reminder 是提醒，不是停止器。不能用它们替代 A12。

## 实测设置与原始证据

- Node `v24.22.2`，Linux `7.0.0-42-generic`，启动前 load average `2.05, 2.81, 4.02`。
- 使用 `app/sdk/scripts/start.mjs` 一条命令起真实 dsh 已发布包；`P2SDK_PROVIDER=mock`，仅通过既有 fake LLM 插件替换外部模型。session、审批、工具 pipeline、jobs、bash-sandbox、subprocess 和 bwrap 均为真实实现。
- 每个 session 的 fake 第一轮调用 `printf R4B_STEP1`，第二轮调用 `sleep 600 & wait`（保留显式 bash 父进程和 sleep 子进程，而不是让 bash exec 优化成 sleep）。第四个 session 用 `trap '' TERM; sleep 600 & wait`。tool 参数 `timeoutMs:600000`，实际停止发生在进程启动后几十毫秒，排除了自然超时和转后台。
- 审批按既有 `$events` 协议对这两个测试命令回答 `allowed-once`，没有放宽真实产品审批默认值。
- 固定 `HOME=/tmp/r4b-probe`；env 是独立 allowlist，未展开 `process.env`，未读取真实凭证。token 仅在临时 handoff 内生成并由 connect 消费，从未打印；退出后删除 runtime / handoff，证据目录无它们。
- 自有 strace 子进程启动 SDK，只跟踪 `kill,wait4,waitid,exit_group` 和 TERM/KILL，不跟踪 exec 参数或环境。PID 来源为该 child 的 `/proc` 后代树；存活判断结合 PID + starttime 防复用。无 pkill / killall，无手工批量终止；finally 只对确认为自有 tracer 直接子进程的 launcher 发 TERM，由 SDK 自行释放其工具进程。
- 原始证据目录：`work/p5-parity/evidence/r4b-run-G1ZP7V/`；`summary.json` 含各 PID、命令、开始时间、退出观测、cancel ack 与 turn/end；`frames-0.json` 至 `frames-3.json` 是完整 session/follow 帧；`signals.trace` 是系统调用和退出信号原文。另在探针完成后独立检查全部 16 个工具树 PID，`/proc/<pid>` 全不存在。

### 耗时表（ms）

| 轮次 | 命令 | RPC 发起 → cancel ack | RPC 发起 → 全树停止 | RPC 发起 → 已观察 turn/end | TERM syscall → 树内最后退出 | 最终残留 | 原 session 续发 |
|---|---|---:|---:|---:|---:|---:|---|
| 0 | `sleep 600 & wait` | 11.778 | 6.330 | 11.815 | 0.752 | 0 | 成功 |
| 1 | 同上 | 6.952 | 4.536 | 6.963 | 0.400 | 0 | 成功 |
| 2 | 同上 | 8.765 | 4.860 | 8.778 | 0.611 | 0 | 成功 |
| 3 | `trap '' TERM; sleep 600 & wait` | 3.303 | 5.504 | 10.670 | 0.761 | 0 | 成功 |

RPC 发起时钟为 `performance.now()`，在 `client.call('session/cancel', ...)` 前取值；`/proc` 轮询间隔目标 5 ms，结果是观测上界，不能解读为微秒级精度。turn/end 列为探针读取帧的时刻，不是服务器内部单独打点；ACK 与退出并行观测，所以 ACK 可能早于或晚于退出。信号系统调用到退出一列取 strace 的 epoch 时间，保留 3 位仅便于对照。

### 信号不是单选题

真实树形为 SDK → 外层 bwrap → namespace 内 bwrap → bash → sleep；每轮树形完整参数在 `summary.json` 的 `observed`。

- 第 0 轮 PID：bwrap 外层 `1378026`、内层 `1378028`、bash `1378029`、sleep `1378035`。
- `signals.trace:41-56`：dsh 对**自己管理的** PGID 发 SIGTERM；bash、sleep、外层 bwrap 均 `killed by SIGTERM`，内层 bwrap 最后 `killed by SIGKILL`。该窗口约 0.752 ms，没有 3 秒后的显式 KILL syscall。
- 第 3 轮 PID：bwrap 外层 `1378394`、内层 `1378395`、bash `1378396`、sleep `1378397`。
- `signals.trace:171-186`：外层 bwrap TERM 退出，忽略 TERM 的 bash / sleep 和内层 bwrap 都最终 SIGKILL；同样没有 dsh 的显式 KILL syscall，符合 PID namespace 清理行为，不能说“忽略 TERM 导致等待 3 秒”。
- 末尾 `signals.trace:192` 起是**实验完成后** finally 的 launcher 清理，不属于点击停止耗时。

## 源码链路与各类时限

以下 `D/` 表示 `/home/lingxufeng/bot/repos/deepseek-harness/`，只读 SHA `ce7073d51254c26cd63b22a60835b8f948deb447`；已安装包中也核对了同一逻辑，非仅凭 README。

| 层 | 实际行为 / 值 | 证据 |
|---|---|---|
| UI | `cancelTurn(sessionId)` → `session/cancel` | `app/ui/renderer/shell/store.ts:366-368` |
| RPC | `agent.cancel({kind:'user'}, {keepInbox:true})`，同步返回 `{accepted:true}`；**ACK 不是全树已退出承诺** | `D/packages/api/session-controller/src/commands.ts:459-478`；安装包 `@deepseek-ai/dsh-api-session-controller/lib/index.js:960` 起 |
| turn | 取消活动 turn 的 AbortController；后续 step 在 `signal.throwIfAborted()` 停止，finally 记录 aborted 的 turn/end | `D/packages/core/agent-loop/src/agent.ts:191-197,344-360,394-425` |
| 前台 job | 等待 exec.signal 被取消后，停止该 job，并等待其 settle 后抛 TOOL_ABORTED | `D/packages/shell/tool-bash/src/index.ts:296-320` |
| sandbox | 继承 LocalBashExecutor；把 `bash -c` 包进 sandbox 的 argv，没有另一套特殊取消机制 | `D/packages/shell/bash-sandbox/src/index.ts:45-50,89-114,187-189` |
| shell | `graceMs` 默认 **3000 ms**，随 spawn spec 传下去；没有在本项目 profile 覆盖 | `D/packages/shell/bash-local/src/index.ts:34-35,99-107,149-168`；安装包 `@deepseek-ai/dsh-bash-local/lib/index.js:28-29,75,120` |
| subprocess | Abort → 立即 TERM；启动 **graceMs** timer，届时仍有受管进程则 KILL；观测 range 清空后取消 timer | `D/packages/subprocess/subprocess-local/src/spawn.ts:337-380`；已安装 `lib/runner-launch-B2zsQ1Dz.js:914-955` |
| stdout/stderr drain | direct child 已退出但管道未关闭时，再允许最多 **graceMs = 3000 ms** 后 settle collect 输出；不是额外的进程终止倒计时 | `D/packages/subprocess/subprocess-local/src/spawn.ts:389-420` |
| job 停止后的等待 | `registry.wait(..., spec.timeoutMs, ...)`，不是固定 3 秒清理超时；本实验请求 **600000 ms**。shell 默认 timeout **120000 ms**、可配置请求 cap **600000 ms**，不能把这两个值写成用户停止 SLA | `D/packages/shell/tool-bash/src/index.ts:298-319`；`D/packages/shell/bash-local/src/index.ts:99-107` |
| managed range 观测 | fallback 轮询 **15 ms**；`waitForExit` 自身没有固定墙钟总上限 | `D/packages/subprocess/subprocess-local/src/spawn.ts:83-89,243-250,337-349,424-427` |

因此 **3 秒是信号升级宽限，不是整个取消路径的硬截止**；调度拥塞、额外管道等待、不可中断内核睡眠、网络断链都不能据此保证 5 秒。本文证实的是本机、可连接 SDK、前台 sleep、默认 bwrap 这组条件下远低于 5 秒。

## 单轮调用上限与 P5-27 注意事项

- `D/packages/core/agent-loop/src/index.ts:252-269,295-307` 的 Config 只有并发工具数、启动 agents 等，不含 maxSteps / maxToolCallsPerTurn；`agent.ts:344-400` 按完成 / abort / 插件决策继续 step，没有内置总次数比较。`agent.ts:584-597` 的 max-tokens 是单次模型输出结束原因，也不是工具次数上限。
- `D/packages/guard/repeat-tool-reminder/src/index.ts:196-230` 到阈值只注入提醒，明确 observe-and-enrich / never veto；`D/packages/guard/timeout-policy/src/index.ts:55-75` 是每工具声明的预算，不是每 turn 总预算。结论限于已读默认栈，不能泛指所有第三方扩展。
- `keepInbox:true` 保留已排队输入，故“停止后绝不再开工具”要限定为**本轮及无其他已排队输入**。本实验每个 session 只有一个活动 prompt；确认 turn/end 后才续发。UI 若同时存在 queue，需要另外定义是否清空，不能误认为 cancel 自动清队列。
- 已显式后台 / 已因等待超时移交后台的 job 不等同于当前前台调用。本次没有验证“session cancel 杀尽此前所有后台 job”，P5-27 不应暗含这个保证。
- 未运行尚未落地的 P5-01 最终受控 wrapper；本实验的实际 argv 包含默认 `bwrap --unshare-pid --die-with-parent`。建议 wrapper 用 exec 保持信号路径，最终仍应按 P5-27 对 wrapper 全树重测，不要把默认 argv 的数据冒充最终 wrapper 验收。
- 建议 P5-27 固定 **5000 ms（RPC 发起 → 全树退出）**、断言所有已记录 PID 最终消失（不只 zombie）、断言 aborted/user 的 turn/end、无第 3 次模型请求 / 新工具调用，最后同 session 续发收到文字。这是有证据支持的测试阈值，非对任意宿主负载的性能承诺。

## 复现

在 `/home/lingxufeng/bot` 运行下列唯一启动命令（无需真实 key，无需 pnpm install / 全量测试）。脚本内部给 SDK 设置临时 HOME，并自动清理自有 launcher、runtime、handoff；每次生成新的 evidence 子目录，不覆盖本次证据。

```sh
/home/lingxufeng/bot/app/sdk/node_modules/.bin/node \
  /home/lingxufeng/bot/work/p5-parity/evidence/r4b-probe.mjs
```

成功应输出四行 JSON（每行 continued=true、survivors=0）及 `R4B_EVIDENCE=...`，exit code 0。复现脚本：`work/p5-parity/evidence/r4b-probe.mjs`，包含断言，不是只打印成功标志。

外部核验：GitHub MCP `list_commits(perPage=1)` 返回上述 SHA / 日期；`get_file_contents` 对同 SHA 的 `packages/shell/bash-local/src/index.ts` 返回相同 3000 ms 常量；`npm view @deepseek-ai/dsh@0.2.2-alpha.2 version time.modified repository --json` 返回上述版本与 modified。来源 URL：https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/shell/bash-local/src/index.ts 。
