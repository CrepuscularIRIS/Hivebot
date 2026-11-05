# VERIFY P6-13

> 转正自 evidence/P6-13/VERIFY.txt。

verdict: FAIL
commit: 79899b028e7eeb2405d4d6b26c78c439ea559d9b
分支：feat/P6-13；工作树：/tmp/bot-wt/P6-13；验收日期：2026-11-04。
报告使用 TXT：本会话开发者约束禁止写报告 .md，故落 evidence/P6-13/VERIFY.txt。

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
| 1a 定向 20/20 | PASS | vfy-targeted.log：2 files / 20 tests passed，18.25s；含 5 条真 Loader 场景 |
| 1b 全量抽跑一次 | FAIL（缺证据/未执行） | 验收员开发者约束禁止跑全量回归，留主会话运行；不把 builder 的 522 绿算自己的证据 |
| 1c approval.test.ts 既报闪红 | PASS（仅此次单跑） | vfy-approval.log：正确路径 tests/e2e/approval.test.ts，1 file / 5 tests passed，12.01s，未再现闪红；不能据此证明不存在 flake |
| 2a 真 Loader Assignment 停止 → 恰 1 项 end:stopped，无双发、无失效 ask，进程树退出后无新工具/模型请求 | PASS | 定向 live ①，orchestration-stop-live.test.ts:243-293；vfy-targeted.log；额外 vfy-ask.log 对未决审批覆盖 |
| 2b accepted 后未落 turn/end，第 4 次 create 仍 capacity；释放后成功 | PASS | 定向 live ③，orchestration-stop-live.test.ts:328-383；paceMs=300000 确认 worker 无 turn/end，stop accepted/create capacity/通道未触达；停 bash worker 等其 turn/end 后 create 成功；vfy-targeted.log |
| 3 空闲幂等且 cancel 零调用 | FAIL | vfy-guards.log:7：accepted=true、wasRunning=false，但 sessionCalls=1 / cancelCalls=1；产品 stop.mjs:109-110 无条件 cancel；builder 单测 :139-145 反而锁定 cancel=1，与此次明确要求冲突 |
| 4 非 createdBy/污染回合/身份不符/坏参数均拒且 session/cancel=0 | PASS | 独立 vfy-guards.mjs + vfy-guards.log:1-6；每格断言 agentOf(session 解析)=0、cancel=0；实现 stop.mjs:75-104 先校验后解析 session；live ④ 另验证污染回合 worker 树仍存活 |
| 5 stop 不注册事件、不直接动 slots | PASS | stop.mjs 全文实读（146 行）：唯一宿主目标调用为 agentOf + agent.cancel；vfy-guards.mjs 注册 ctx.on 即抛陷阱未触发、源码 ctx.on/slots 访问检查通过；容量释放在既有 slots.mjs:67-82 / create.mjs:147-151，回报由 main-channel.mjs:217-218 的 Reporter 监听负责 |
| 6 坏路径：worker 等 ask 未决时 stop，不投递失效 ask | PASS | 独立真 Loader vfy-ask.mjs / vfy-ask.log：worker approval/asked 后未作答、无 turn/end；main gate 持有 2600ms 让 Reporter 观察 ask，再排用户 stop 开 gate；approval/decided=cancelled、turn/end=aborted；3500ms 观察后 items 恰 1 项 end:stopped、0 ask；待审批 touch canary 不存在 |
| 非 Assignment 回合停止 → 0 回报 | PASS | 定向 live ②，等待 4s 后 0 pbots-worker；vfy-targeted.log |
| 临时 HOME、不改产品代码、HEAD 不漂移、任务残留自查 | PASS | HOME=/tmp/bot-p613-vfy-home；git status --short 空，HEAD 末次核对仍为以上 SHA；vfy-cleanup.log：bot-reap --dry-run --match p613 无匹配且 exit=0；仅测试 helper 自管 SIGTERM/SIGKILL SDK 子进程，未 shell 批量 kill |

证据根目录（以下文件名均相对这里）：
/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-13/

实际复跑命令（产品目录 /tmp/bot-wt/P6-13/app/sdk）：
1. HOME=/tmp/bot-p613-vfy-home PATH="$PWD/node_modules/.bin:$PATH" ./node_modules/.bin/vitest run tests/unit/orchestration-stop.test.ts tests/unit/orchestration-stop-live.test.ts
输出尾：Test Files 2 passed (2)；Tests 20 passed (20)；Duration 18.25s。
2. HOME=/tmp/bot-p613-vfy-home PATH="$PWD/node_modules/.bin:$PATH" ./node_modules/.bin/vitest run tests/e2e/approval.test.ts
输出尾：Test Files 1 passed (1)；Tests 5 passed (5)；Duration 12.01s。
注：首次误用 tests/unit/approval.test.ts 得到 No test files found（非断言闪红），定位真实路径后按上面命令运行通过。
3. HOME=/tmp/bot-p613-vfy-home /tmp/bot-wt/P6-13/app/sdk/node_modules/.bin/node /home/lingxufeng/bot/work/p6-orchestration/evidence/P6-13/vfy-guards.mjs
退出 1（预期捕获本任务不符）；六格拒绝均 PASS；idle cancelCalls=1，expectedCancelCalls=0，FAIL。
4. HOME=/tmp/bot-p613-vfy-home PATH="/tmp/bot-wt/P6-13/app/sdk/node_modules/.bin:$PATH" /tmp/bot-wt/P6-13/app/sdk/node_modules/.bin/node /home/lingxufeng/bot/work/p6-orchestration/evidence/P6-13/vfy-ask.mjs
退出 0；输出尾：PASS pending ask interrupted: no stale ask delivery, exactly one stopped end, unapproved command never ran。
5. /home/lingxufeng/bot/scripts/bot-reap --dry-run --match p613
输出空，exit 0。
运行负载抽样 vmstat：iowait=0，空闲 CPU=92%；无 UI 变更，不涉及浏览器截图。

新问题（每条一行，可直接成为修复任务）：
- [FIX] 空闲 stop_bot 仍调用 cancel 一次，违反本次验收明确的 cancel 零调用要求 | 复现：运行上述 vfy-guards.mjs，idle 行 accepted:true/wasRunning:false/cancelCalls:1，进程退出 1 | 疑似位置：/tmp/bot-wt/P6-13/app/sdk/src/orchestration/stop.mjs:109-110；冲突断言 /tmp/bot-wt/P6-13/app/sdk/tests/unit/orchestration-stop.test.ts:139-145 | 严重度：major（明确验收条件不符）

待主会话补证：本 SHA 的全量回归未在本验收会话执行；需要主会话按职责运行并记录。即使补证全绿，空闲 cancel 不符仍需修复后重验。
