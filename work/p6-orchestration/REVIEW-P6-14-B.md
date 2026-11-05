# REVIEW P6-14 · 方向 B（并发、幂等与状态同步）

> 转正自 evidence/P6-14-rvw/REVIEW-B.txt（txt 兜底）。

# P6-14 review · B 并发、幂等与状态同步

范围：944afa0..09f627b
commit：09f627b656962b891ef759fbebd0a263b34da81f
结论：本方向无 CONFIRMED（critical 0 / major 0 / minor 0）。

仅检查指定范围 diff，以及理解调用顺序所需的 createWorkerBot、已安装 dsh-agent / dsh-tools 生命周期与执行流水线。未改产品代码，未跑全量回归或 UI/e2e。
当前运行约束禁止写报告 .md，故直接使用派发指定的 evidence/P6-14-rvw/REVIEW-B.txt 兜底；没有声称尝试写 .md 后被拒。

## 对抗探针与结论

探针使用项目锁定的实际 Cordis、AgentRegistry、ToolsService、ToolExecutionPipeline 和生产 registerEnvelope / registerWorkerRestriction；工具体替换为计数 stub，不启动真实委派或 shell。全部创建文件在 /tmp/vfy-r-p614-b/，HOME 隔离。真实 Loader 用例另行执行。

1. REFUTED | app/sdk/src/orchestration/envelope.mjs:217 | agent/created 中位于 restrict 监听器之前的监听器直接调用 subagent | 人为把实际流水线调用放进较早的 serial 监听器，此时 subagent 确实还在可见表；但 registerEnvelope 已在 main-channel.mjs:220 先行安装，pre-execute 返回 pbots/forbidden，工具体副作用计数 0。该调用返回后 restrict 完成，可见表删除 subagent。P6-10 createWorkerBot:352-366 先 await putBotIfMain，再 session/create；正常首回合不会先于创建 serial 完成。 | /tmp/vfy-r-p614-b/probe.mjs

2. REFUTED | app/sdk/src/orchestration/envelope.mjs:196-222 | 引导扫描命中 worker 后又重复收到 created，以及 disposer 调用两次 | 实际 scoped tools 的 restriction 不会重复挂载；bootstrap 后额外发一次 created，再两次 disposer，可见工具恢复，没有残余 restriction。用实际 AgentRegistry detach 再以相同 id 注册新 scope，旧 scope restriction 撤掉，新 scope 正常挂载，最终撤销也正确。此处验证的是同进程会话实例重建，非整 SDK 进程重启。 | /tmp/vfy-r-p614-b/probe.mjs

3. REFUTED | app/sdk/src/orchestration/envelope.mjs:216-218 | agents.list 引导与 worker created 事件交错，漏处理或重复处理 | registerWorkerRestriction 整段同步、没有 await；实际 agents.list 是同步快照。将真实注册安排到 Promise microtask，在 bootstrap 返回后执行，监听器已安装，新 worker 被限制。已经在快照内的重复事件由 applied.has(id) 去重；实际 registry 禁止同 id 并存，disposed 在旧条目移除时同步发出，不会出现旧事件异步清除新实例的时序。 | /tmp/vfy-r-p614-b/probe.mjs

4. REFUTED | app/sdk/src/orchestration/envelope.mjs:178-181 | subagent 调用在 restrict 之前完成 prepare，restrict 挂好之后才 dispatch | 探针刻意先摘 envelope，让真实 pipeline.prepare 返回 dispatch，再挂 worker restrict，最后调用 pipeline.dispatch。dispatchToolBody 会重新 resolveExecution，工具不可用，副作用 0。另做正对照：无限制的普通 bash stub 正常执行且副作用恰好 1，排除流水线未真正工作的假阴性。 | /tmp/vfy-r-p614-b/probe.mjs

5. REFUTED | app/sdk/src/orchestration/envelope.mjs:126-136 | restrict 尚未挂载时调用参数级 bash run_in_background | 即使没有 restrict，已安装的 envelope 在 pre-execute 直接拒，副作用 0。bash 不在按名 deny 中并不造成此窗口的绕过。生产初始化本身先注册 envelope 后注册 workerRestriction。没有将“插件安装前已经启动的工具体会被撤销”作为保证。 | /tmp/vfy-r-p614-b/probe.mjs

## 实跑命令和结果

1. HOME=/tmp/vfy-r-p614-b/home /home/lingxufeng/bot/app/sdk/node_modules/node/bin/node /tmp/vfy-r-p614-b/probe.mjs
   输出：
   PASS early-created listener: visible before restriction, actual pipeline denies; side effects=0; order=early,early-complete
   PASS bootstrap + duplicate-created + double disposer: final tool restored, no leaked extra restriction
   PASS same-id recreate: old lifted; new instance restricted; remount disposer restores new instance
   PASS prepared-before-restrict subagent: dispatch re-resolves current tools and refuses; side effects=0
   PASS background before restrict: pre-execute denies; side effects=0
   PASS bootstrap microtask interleave: queued worker is restricted exactly within same registry lifecycle
   PASS positive control: unrestricted foreground bash stub dispatches exactly once

2. HOME=/tmp/vfy-r-p614-b/home /home/lingxufeng/bot/app/sdk/node_modules/node/bin/node /home/lingxufeng/bot/app/sdk/node_modules/vitest/vitest.mjs run --root /home/lingxufeng/bot/app/sdk tests/unit/orchestration-envelope.test.ts
   结果：1 file passed，25 tests passed，148ms。

3. env -i PATH=/home/lingxufeng/bot/app/sdk/node_modules/node/bin:/usr/local/bin:/usr/bin:/bin HOME=/tmp/vfy-r-p614-b/home TMPDIR=/tmp/vfy-r-p614-b/tmp /home/lingxufeng/bot/app/sdk/node_modules/node/bin/node /home/lingxufeng/bot/app/sdk/node_modules/vitest/vitest.mjs run --root /home/lingxufeng/bot/app/sdk tests/unit/orchestration-envelope-live.test.ts -t '⑥|⑦'
   结果：1 file passed，3 tests passed / 4 skipped，3.36s。匹配生产建立顺序工具表格⑥、首回合13入口拒绝格⑦，另匹配标题内 D9⑦ 的 worker P5 guard 子集格⑤。真实 Loader 内 worker 的普通工具仍可见、主 bot 不受影响，13 项调用拒绝且未新增子会话。

4. /home/lingxufeng/bot/scripts/bot-reap --dry-run --match vfy-r-p614-b
   /home/lingxufeng/bot/scripts/bot-reap --dry-run --match bot-p614-live
   两次均无匹配输出，没有需要手工清理的本任务进程；未使用其他清理命令。

5. 收尾 git rev-parse HEAD 仍为上述 SHA；git diff --quiet 09f627b -- app/sdk/src/orchestration app/sdk/tests/unit/orchestration-envelope.test.ts app/sdk/tests/unit/orchestration-envelope-live.test.ts 返回 0。

## 持久证据

/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-14-rvw/probe.mjs
/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-14-rvw/probe.log
/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-14-rvw/unit.log
/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-14-rvw/live.log
/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-14-rvw/cleanup.log

新问题：无本方向实际复现成立的问题。
