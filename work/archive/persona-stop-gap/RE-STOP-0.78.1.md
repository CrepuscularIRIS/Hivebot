# RE-STOP：原版 Grok Bot 0.78.1「停下 bot」交互全链取证（T81）

> 取证：reverse-engineer | 日期：2026-11-12 | 工单：`work/tickets/open/T81-probe-stop-flow.md`
> 产物只读锚点：`/tmp/t78-asar/`（0.78.1 app.asar 解包）、`repos/grok-bot-0.18-reconstructed`（0.18 重建源码，参考）
> 本文只取证不写修法；改法由经理定案。锚点均为可复查 grep（文件 + 搜索串）。

## 结论先行

1. **原版 0.78.1 桌面文字聊天没有任何「停止当前回合」的 UI 入口**——没有 Stop generating 按钮、没有消息菜单停止项、没有 Esc 停止。经理线索 2 **证实**：我们的 `StopButton` 是自加的。
2. 原版用户叫停一个正在干活的 bot 的方式是**再发一条消息**：消息照发不排队（在线时），服务端把正在跑的 turn supersede（interrupt + 新 turn 排队），新 turn 先 ack 用户最新消息再继续（0.18 系统提示与 host 实现双向印证）。
3. 显式的「停」能力存在于三处，但都不是聊天停止钮：外部消息渠道（Slack/Teams/SMS，停后显示 "Your Bot stopped what it was doing."）、bot 自己的工具 StopSubagent、更新/重置 box 前的批量 interrupt。
4. `## When they talk over you` / `[Interrupted mid-reply after: …]` 是**语音通话专用**（提示词开头即 "on a live phone call"），文字聊天不用。经理线索 1 **证实**。

---

## 1. 原版 UI 上有什么「停止」入口？

**结论：文字聊天无停止入口。仅有的 "Stop" 字样 UI 是听写按钮、远程接管弹窗、短信退订文案。**

逐一排除（`/tmp/t78-asar/dist/renderer/assets/`，下称 `R/`）：

| 搜到的入口 | 文案 | 场景 | 锚点（可复查） |
|---|---|---|---|
| 无 | "Stop generating" 等聊天停止文案 | — | `grep -rl 'Stop generating' R/` → **0 个文件**。同法搜 "Stop response/replying/streaming/task" 均 0 |
| Stop（i18n key `ygCKqB`） | "Stop" | **box 远程接管弹窗**的停止控制按钮 | `grep -o '"ygCKqB":\["Stop"\]' R/index.eager-common-DbK3Oi_r.js`；唯一消费点 `grep -l 'onStopControl' R/*.js` → 只有 `chunk-box-desktop-modal-CN4iwwJC.js`（`E,{id:\`ygCKqB\`}` + `Button variant:secondary size:sm onClick:n.onStopControl`，与 `onHandBack`/`onTakeControl`/`hasControl` 同组件 = take-control 场景） |
| Stop dictation（`9QwrMz`） | "Stop dictation" | composer 语音听写停止 | `grep -o '"9QwrMz":\["Stop dictation"\]' R/index.eager-app-iGTgHP_Q.js` |
| Cancel reply（`AnRu/j`） | "Cancel reply" | 取消「回复引用」的 X 钮（quote pill），非停止 | `grep -o '.\{60\}"Cancel reply"' R/index.eager-app-iGTgHP_Q.js`；组件 `sand-reply-quote-pill` + `icon:\`close\`` |
| 消息行菜单 | Copy / Edit / Delete / Pin / Retry | 无 Stop 项 | `grep -oE '"(Copy|Edit|Delete|Pin|Retry)"' R/index.eager-app-iGTgHP_Q.js`，无 stop 类项 |
| aria-label | 无含 stop 的 aria-label（DOM 事件除外） | — | `grep -oE 'aria-label="[^"]*[Ss]top[^"]*"' R/*.js` → 0（打包后 aria-label 多为变量，已配合字面量双重排除） |

`StopSubagent` 出现在 preload 的 command 枚举里，但那是 **bot 的工具**（见 §4），不是 UI。

快捷键：未找到 Esc→停止的绑定（搜 renderer 键盘处理无 stop 分支；产物内未找到，搜过的串：`Escape`+`stop`、`stopDictation` 之外的 `stop` 调用）。

## 2. 点击后的行为链（原版的「停」到底走什么通道）

**结论：桌面 renderer 唯一的停止 RPC 是 `interruptAgentRun`，但聊天 UI 从不调用它；它的唯一调用场景是「更新/重置 bot 电脑」前停掉所有在跑的 agent。真正的叫停通道是发新消息（supersede）。**

链路一：`interruptAgentRun` RPC（存在但聊天 UI 不用）。

- renderer RPC 客户端表：`grep -o 'interruptAgentRun:{args' R/index.eager-app-iGTgHP_Q.js` → `{args:'object',reply:'record'}`，同表还有 updateAgent/deleteAgents/kickstartAgent/startFreshConversation/rollBackConversation。
- 服务端 proto（本地只有定义、无实现——0.78.1 的 turn 运行时在云端）：`grep -o 'InterruptGrokBotAgentRunRequest|1 agent_id 9|2 reason 9|3 session_id 9?' /tmp/t78-asar/dist/local-exec-daemon/main.cjs` → 请求 `{agent_id, reason, session_id?}`、响应 `hadActiveRun`（`grep -o 'InterruptGrokBotAgentRunResponse|1 had_active_run'` 同文件）。coordinator/daemon 内无 handler 实现（`grep -c 'interruptGrokBotAgentRun' …/node-agent-coordinator/main.cjs` 仅服务定义表与 initiator 分类）。
- initiator 分类：`grep -o 'interruptAgentRun:"person"' /tmp/t78-asar/dist/node-agent-coordinator/main.cjs`（同表 `openAgent:"background"` 等）。
- renderer 唯一调用点：`grep -o 'async function DJt' R/index.eager-app-iGTgHP_Q.js` → 遍历 `isRunning` 的 agents 逐个 `interruptAgentRun({agentId})`（有 runningSessionIds 时带 sessionId）。它的唯一消费者：`chunk-view-ODc_03uE.js`（import `Zo as de`），调用处上下文是 `computerRebuild`/`onUpdateBox`/`data-sand-update-status`/`update-computer`——**更新/重置电脑流程**，非聊天。

链路二：发新消息 = 叫停（0.18 host 源码，0.78.1 同概念的服务端实现不在产物内）。

- renderer 侧证据（0.78.1）：turn 运行中发送**不排队**——`grep -c 'isAgentRunningAtSendStart' R/index.eager-app-iGTgHP_Q.js` = 10 处；发送时若 agent 在跑仅打标记 `isAgentRunningAtSendStart:!0` 并正常发出；只有**离线**才进 `queued` 状态（`T(m?\`queued\`:...)` 分支，`queuedAtMs` = sentWhileOfflineAtMs）。离线队列可撤回：`cancelQueued({nonce})`，失败文案 "Couldn't cancel your message. Try again."（i18n `8gi/JY`）。
- host 侧机制（0.18 重建源码 `repos/grok-bot-0.18-reconstructed/source/host/extensions/transcript/send-turn-dispatch.ts`）：
  - `:126-131` 群成员 run 被 `interrupt("superseded by a direct user message")`；
  - `:132-136` `runner.interrupt("superseded by a new user message", { carriesRecovery })`——**正在跑的 turn 被 abort**（实现见 `runner/sand-agent-runner.ts:1127-1142`：`controller.abort({ intentional: true, reason })`）；
  - `:146-160` 新 turn `enqueueExclusiveRun`（同会话互斥排队），telemetry 上报 `reportTurnInterrupt({reason:"superseded"})`。
- 被打断的 turn 怎么收尾（`extensions/transcript/turn-runtime.ts:390-404`）：`recoverable` 分支直接 `turn.finalize("cancelled")` + trace outcome `"superseded"` 并 return——**不 settle**，已流出的半截文本留在 transcript。

## 3. transcript 呈现 + 被停后下一轮怎么恢复

**结论：桌面端没有「已停止」的系统行；turn 状态徽章有 stopped/interrupted 两态（interrupted 其实是陈旧推断）；被打断的半截消息保留；下一轮靠「新 turn 看到完整 transcript（含半截）+ recovery prepend」无缝续上，bot 会被要求先 ack 新消息。**

- turn 状态徽章（desktop-control 面板）：`grep -o 'case\`stopped\`:return{label:{id:\`NnvXp5\`}' R/index.eager-app-iGTgHP_Q.js`；状态机 `running/succeeded/failed/stopped/interrupted`，文案 "Stopped"（`NnvXp5`，希腊语译文 "Διακόπηκε από χρήστη"＝被用户中断）、"Interrupted"（`dxyEjQ`）。
- `interrupted` 的真实语义是**陈旧推断**：`function u0t(e,{isAgentRunning:t,nowMs:n}){if(e.status!==\`running\`)return e.status;let r=n-e.startedAtMs;return r>36e5||t===!1&&r>6e4?\`interrupted\`:\`running\`}`——running 超 1 小时、或 agent 已不 running 超 60 秒才显示 interrupted。
- 后台任务/子任务卡有终止原因徽章：`l0t` 表（`grep -o 'terminate_success:{id:\`4dQFvz\`}' R/index.eager-app-iGTgHP_Q.js`）：`cancelled`→"Cancelled"、`review_interrupted`→"Review could not finish"、`turn_limit`→"Ran out of steps"、`episode_timeout`→"Timed out" 等，挂在任务卡 `endedBy` 字段上。
- **外部消息渠道**有明确的停止回执行（`R/chunk-team-bot-line-render-DBs7eslj.js`，key 表 `grep -o '"messaging.turnStopped"'`）：
  - `messaging.turnStopped` → **"Your Bot stopped what it was doing."**（`vHRDVH`）
  - `messaging.turnNotRunning` → "Your Bot isn't doing anything right now."（`Vzhfmq`）
  - `messaging.replyStop` → "Reply STOP to stop texts."（`Xk2FSz`）——注意这是**短信退订**文案，不是停 turn。
- 下一轮恢复（0.18 源码）：`send-turn-dispatch.ts:113-121` 保存 `latestRecoverySends`（含 recentUserMessages 快照）；`sand-agent-runner.ts:1003-1028` `wouldRecoverViaPrepend`——目标消息未被确认（`confirmed !== true`）时新 turn 以 prepend 恢复上下文。新 turn 的行为约束在系统提示里：`source/host/runner/system-prompt.ts:84`（"a user message, a burst of them, a ping while you work"→第一动作必须是文本 SendMessage）与 `:105`（"pings again while you're mid-task … never silently diving back into the work"）。**无「上回被打断」专门提示词**——bot 靠 transcript 里的半截消息自然看到。

## 4. 语音 "When they talk over you" 是否作用于文字聊天

**结论：不作用。它是语音通话 prompt 的固定段，配套的打断注入/丢弃机制全在语音栈。**

- 归属：`/tmp/t78-asar/dist/electron-main/main-app.cjs` 搜 `"## Role & Persona"` 唯一一处，其后第二行即 `You are ${n}, on a live phone call with the person you work for.`；`## When they talk over you` 段（`grep -c 'interruptedLines' main-app.cjs` = 1）与 `voiceLoopLines`、`overheardLine`、"This whole text is your instruction for this call"、工具 `stay_silent / end_the_call` 同属该 prompt（与 T80 取证一致，见 PLAN.md:7）。
- 语音打断机制在语音循环里：事件枚举含 `caller-interrupted`（`grep -o 'rpcLiteral)("caller-interrupted")' main-app.cjs`）；发送结局枚举含 `dropped_caller_barged_in`、`dropped_superseded`（`grep -o 'dropped_caller_barged_in' main-app.cjs`）——用户插话时 bot 当前未说出的句子被丢弃。
- `[Interrupted mid-reply after: … Unheard remainder: …]`：`grep -c 'Interrupted mid-reply' main-app.cjs` = 2，**两处都是提示词文本**（教 bot 遇到该注记怎么续说）；产物内没有运行时构造该字符串的代码（注入方在服务端语音栈）。文字聊天的 prompt 与 transcript 机制（§2/§3）完全没有这套东西。

## 5. 主 bot 停 worker（原版 StopAgent ≈ 我们的 stop_bot）在 UI 上的呈现

**结论：原版没有用户直接停 worker 的 UI；停 worker 是主 bot 的工具 StopSubagent，UI 上只有后台任务卡的 Cancelled 徽章与状态流转。**

- 工具枚举：`grep -o 'StopSubagent:"StopSubagent"' /tmp/t78-asar/dist/electron-preload/preload.cjs`（command 表，与 Shell/Skill/ShareProject 并列）。
- 0.18 实现：`source/host/runner/tools/sand-subagent-management-tools.ts`——`StopSubagent` 参数 `subagent_id`（"The Agent ID of the running subagent to abort"）；另有 `MessageSubagent`（"interrupts its current step … continues from where it was"）即 steering。落地：`runner/subagent-runtime.ts:437` `runner.interrupt("Steering message from the parent agent.")`、`:460` `runner.interrupt("Stopped by the parent agent.")`。
- UI 呈现：任务卡 `endedBy:"cancelled"` → "Cancelled" 徽章（§3 的 `l0t` 表）；卡片有 Check/进度/steps（`grep -o 'Check how a background subagent you dispatched' …/sand-subagent-management-tools.ts`，0.18 工具描述佐证任务卡形态）。
- 另一个批量停：删除 agent 时 `extensions/transcript/agent-lifecycle.ts:482` `runner.interruptAll("agent deleted")`。

## 经理线索核实

| 线索 | 判定 | 关键证据 |
|---|---|---|
| 1. `When they talk over you` 是语音专用 | **证实** | §4：prompt 开头 "on a live phone call"；打断事件 `caller-interrupted`/`dropped_caller_barged_in` 全在语音循环 |
| 2. 原版无聊天停止钮、StopButton 是自加 | **证实** | §1：六路搜空；原版无 `session/cancel`（`grep -r 'session/cancel' /tmp/t78-asar/dist/` → 0） |
| 3. 原版靠发消息叫停（无按钮） | **证实（桌面侧）** | §2 链路二：`isAgentRunningAtSendStart` 直发 + 0.18 `interrupt("superseded by a new user message")`；外部渠道另有停止命令（服务端，产物内只见回执文案） |

## 差距清单（我们 vs 原版）

我们锚点：`app/ui/renderer-grok/overrides/modules/chat-header.tsx`（StopButton）、`app/ui/renderer-grok/shim/src/data.ts:879`（cancel）、`app/ui/tests/e2e/session.spec.ts:112`、`app/sdk/tests/e2e/interrupt.test.ts`、`app/sdk/tests/unit/orchestration-stop.test.ts`。建议列只给方向，定案在经理。

| 项 | 原版（锚点） | 我们（锚点） | 差异 | 建议（方向，由经理定） |
|---|---|---|---|---|
| 聊天停止钮 | 无（§1 六路搜空） | 会话头 StopButton，仅运行中出现（chat-header.tsx:13,37） | 多了一个原版没有的入口；用户感知「跟原版不一样」的第一来源 | 决定去留：去掉更贴原版；保留则对齐原版语义（见下行） |
| 叫停方式 | 发新消息 → 服务端 supersede 当前 turn + 新 turn 排队（§2 链路二） | 显式 session/cancel → TERM→KILL 进程树（interrupt.test.ts：≤5s 全退）→ aborted | 原版停 = 换个新任务顶掉旧的（对话连续）；我们的停 = 杀掉、无后续 turn | 补「turn 运行中再发消息」路径：并发消息不排队直达（或 supersede 旧 turn），而不是等上一轮跑完 |
| 被停呈现 | 渠道行 "Your Bot stopped what it was doing."；桌面 turn 徽章 Stopped/Interrupted（muted）；半截文本保留（§3） | 无 transcript 停止标记；仅按钮态（Stopping…/Couldn't stop，chat-header.tsx:19-28） | 用户停完看不到「发生了什么」的回执 | 打断时在 transcript 落一条可读标记（对齐渠道行口径） |
| 半截消息 | 保留、不 settle，新 turn 可见（0.18 turn-runtime.ts:390-404） | cancel→aborted（session.spec.ts:112），半截去留未见专门处理 | 打断瞬间的流文本处置未对齐 | 验证我们 aborted 时已流出文本是否保留，必要时补 |
| 下一轮恢复 | supersede 后新 turn 先 ack 再继续（system-prompt.ts:84,105）；recovery prepend 带未确认消息 | cancel 后同 session 续发可收回复（interrupt.test.ts ③），但无「先 ack」约束、无被打断上下文 | 恢复得到，但行为话术没跟（这半边是 T80 persona 的范畴） | 与 T80 的 prompt 差异一并处理 |
| 主 bot 停 worker | 无用户入口；是 bot 工具 StopSubagent（preload 枚举；0.18 abortSubagent），UI 仅任务卡 Cancelled 徽章（§3 `l0t` 表、§5） | 我们等价物 stop_bot 为主 bot 工具（orchestration-stop.test.ts：白名单 + cancel{kind:'user'},{keepInbox:true}），另有会话头 StopButton 可直接停任何运行中 bot（含主 bot） | 机制对齐（都是 bot 工具）；差别在我们的 StopButton 让**用户**也能直接停主 bot——原版用户停不了主 turn | 并入第一行「入口去留」一起定 |

## 局限与未验证项

1. 0.78.1 的 turn 运行时在**服务端**：supersede/recovery 的 0.78.1 版实现、外部渠道停止命令的解析（Slack 里用户到底输入什么触发）、`InterruptGrokBotAgentRun` 的云端 handler 均不在本机产物内，本文以 0.18 重建源码 + 0.78.1 renderer/proto 残迹交叉印证；0.18 与 0.78.1 之间的行为漂移无法排除。
2. `[Interrupted mid-reply…]` 的运行时注入方未在产物内找到（只有提示词引用），推断在服务端语音栈。
3. 打包产物是 minified：`onStopControl`（take-control 停止）触发的下游行为只追到组件层，未追到它的 IPC 全链；工单问题 2 的「点击后行为」对该按钮以组件语义为准（take-control 面板的 stop control）。
4. 我们侧的逐项实测（演示实例截图）未做——本单只做静态取证；实测在经理验收阶段补（对照上表「我们」列的代码锚点已可复现行为）。
5. 0.78.1 外部渠道（Slack/Teams）里用户停止命令的具体触发词（如斜杠命令或纯文本）产物内无解析代码，只有回执文案，未下结论。
