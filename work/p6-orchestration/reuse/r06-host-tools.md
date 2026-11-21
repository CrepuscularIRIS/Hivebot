# R-06 · 0.18 host 编排工具与 dsh 映射

核验日期：2026-11-03。范围为本地指定重构源码，只读；未运行产品、未修改参考仓、未重新进行 GitHub/npm 选型。此文是 **0.18 推定**，不是 0.78.1 服务端实证，也不是 P6 新接口定稿。

## 0. 证据版本与结论

全文锚点采用下列路径前缀；`文件:行` 均相对于对应前缀。

- **G** = `/home/lingxufeng/bot/repos/grok-bot-0.18-reconstructed/source/`；本地 SHA `a9f633e09d49a85829b8236331b9e21f7e612634`。来源 https://github.com/b-nnett/grok-bot-0.18-reconstructed 。MANIFEST 记为 2026-08-23 快照、无 LICENSE（重构自闭源产物，私用），不能把重构提交时间当原版服务发布时间。
- **D** = `/home/lingxufeng/bot/repos/deepseek-harness/`；本地 SHA `ce7073d51254c26cd63b22a60835b8f948deb447`，MIT。
- **S** = `/home/lingxufeng/bot/repos/dsh-superagent-prototype/`；本地 SHA `6337fc823ce20251c8de8085948165c81aaa701e`，MIT；不要与 S-1 核验的远端 `8c32a9d…` 混用。
- 基线证据 `/home/lingxufeng/bot/repos/MANIFEST.tsv:2-4`；维护/npm 核验沿用本目录 `s1-superagent-maintenance.md:15-47`、`s2-dsh-cross-session.md`，不是本次重新联网核验。

**关键结论**

1. 找到两套不同生命周期：`CreateAgent/UpdateAgent/SendToAgent` 管持久 teammate；`Task/CheckSubagent/MessageSubagent/StopSubagent` 管临时后台任务。不能将二者的 id、回报、停止语义混成一套。
2. 临时 worker 结束由 host runtime 自动回灌父 bot 隐藏回合，**不是调用 WakeParent**；主 bot 派工主要由 system prompt 驱动，host 提供工具供应、排队和生命周期执行。
3. `WakeParent/SetPrimaryBot/StopAgent` 在本次 0.18 host 源码中未找到定义，**无可提供的原版 schema**。`StopSubagent` 不是 `StopAgent`。
4. G18 显式停止子任务不再回报；peer 入站写 `role:user`；本项目 P6 要求停止回报一次、来源不是用户，不能照搬。
5. DSH 已有后台 activation、完成通知、发送与中断原语；优先集成其机制，不应根据 G18 名称差异另造 runner。

## 1. 枚举边界与共用返回/错误

### 1.1 编排类工具全集（本次可读证据范围）

| 工具 | 状态/对象 | 定义锚点 |
|---|---|---|
| CreateAgent / UpdateAgent / SendToAgent | 已实现；持久 teammate profile 与异步通信 | G `host/runner/tools/sand-agent-management-tools.ts:38-81,99-169` |
| Task | 已实现；通用 Task schema + host 后台 adapter | G `packages/agent/tools/task-tool-schema.ts:82-150`；`host/runner/agent-adapters.ts:34-40` |
| CheckSubagent / MessageSubagent / StopSubagent | 已实现；当前 runner 的临时子任务 | G `host/runner/tools/sand-subagent-management-tools.ts:26-45,84-143` |
| TodoWrite / SendMessage | 支撑能力：进度清单 / 对用户输出，不是创建或唤醒父 bot | G `host/sand-multitask.ts:46-82`；`host/runner/tools/send-message-tool.ts:101-132` |
| WakeParent / SetPrimaryBot / StopAgent | host 树无实现命中；全 source 排除 proto/redacted-protos 后也未找到对应实现 | 检索范围 G `host/**/*.ts`、G `**/*.ts`（排除生成协议）；不能以生成的 StopAgentArgs 代替 host schema |
| ListAgents / ListGroups | SendToAgent 文案引用，但没有找到同名 host 工具定义；存在文件式 discovery 提示和内部 listAgents 方法 | G `host/runner/tools/sand-agent-management-tools.ts:105`；`host/agents/agent-messaging.ts:35-80`；`host/host-runner-composition.ts:1222-1224` |
| ReadTranscript / SearchTranscripts / ReadAgentActivity / CreateTask | 同样未找到本树同名 host 工具实现；CreateAgent 的内部 id 为 CREATE_TASK，不代表另有 CreateTask 工具 | G `host/runner/tools/sand-agent-management-tools.ts:130-141`；上述检索范围 |
| CloudAgent / update_state | 邻接能力，分别为云 Cursor agent 管理、profile/routine/workflow/project 状态；不等于本地 StopAgent/SetPrimaryBot | G `host/cloud-agents/cloud-agent-tool.ts:5-45`；`host/runner/tools/sand-state-tool.ts:25,131-139,297-326` |

这里的“全集”限于 R-06 的本地编排/父子通信，不将 MCP、浏览器、文件传输、automation 全量工具列为编排接口。任务提及的 471 个 TS 文件是 host 全树量级，`runner/tools/` 本身不是 471 个文件。缺失是**证据缺口**，不是宣称其他版本不存在。

### 1.2 管理工具的共用 envelope

除 Task、SendMessage、TodoWrite 另述，六个管理工具经 `defineCommunicateTool`：

```text
ToolCall.tool.case = "communicateUpdateToolCall"
args.currentStep = JSON.stringify({__sand_tool__:true, ...activity})
result.result =
  {case:"success", value:{currentStep: JSON.stringify({__sand_tool__:true,result:<string>})}}
  或 {case:"error", value:{error: JSON.stringify({__sand_tool__:true,error:<string>})}}
```

以上为 protobuf 对象的可读字段表示，不是声称网络裸 JSON 固定如此。模型 render 取成功字符串；error render 为 `Error: <message>`，空成功文本兜底 `Tool completed.`。业务拒绝（例如 self-send/not-running/not-found）多数**仍是 success 中的文本**，不是统一 `{ok:false,error:{code}}`。执行抛错才由 wrapper 捕获为 error oneof。

证据 G `host/runner/tools/communicate-tool.ts:15-78,113-181`。输入 JSON 解析失败抛 `ToolCallArgParseError`；Zod 失败文本为 `Invalid arguments:\n<path>: <message>`，多错误逐行；这发生在 execute 回调之前，不能误写成回调直接返回该对象。证据 G `packages/agent/tools/common.ts:185-218`。

下列 JSON schema 是**去描述的字段摘录**，不是运行工具生成的完整模型请求快照。实际 `createZodAgentTool` 先 zodToJsonSchema，再递归去掉 `$schema/default/definitions/markdownDescription/additionalProperties`；因此这里不虚构 `additionalProperties:false` 或模型侧 default。trim、refine、preprocess 等运行约束另写。证据 G `packages/agent/tools/common.ts:77-83,114-125`。

## 2. 核心 schema 逐个

### 2.1 CreateAgent

```json
{"type":"object","properties":{"name":{"type":"string","minLength":1},"description":{"type":"string"}},"required":["name"]}
```

- 参数：name trim 后非空；description trim，省略默认为空串。
- 成功模型文本：`Created agent "<name>" (id: <id>). Message it with SendToAgent using that id.`；依赖方法返回 `{id,name}`，不是直接把该 JSON 返回模型。
- 创建**不接收任务 prompt，不自动发任务**。host 接 `transcript.createBackgroundAgent({name,description}, "user")`；第二参的内部 attribution 不能推定为已满足 P6 createdBy 主 bot 鉴权。
- 错误：字段验证/依赖抛错走 §1.2；本层没有专用容量/重名错误码可引用。
- 锚点 G `host/runner/tools/sand-agent-management-tools.ts:70-75,130-143`；`host/host-runner-composition.ts:1202-1217`。

### 2.2 UpdateAgent

```json
{"type":"object","properties":{"agent_id":{"type":"string","minLength":1},"name":{"type":"string"},"description":{"type":"string"}},"required":["agent_id"]}
```

- 全部字符串 trim；仅非空 name/description 进入 patch，因此不能清空 profile。
- 无有效 patch：`Nothing to update: provide a new name and/or description.`；不存在：`No agent found with id <id>.`；成功：`Updated agent "<name>" (id: <id>).`，均为普通结果文本。
- host update 排除 group；未给字段沿用旧值。不存在删除/设主 bot 的分支。
- 锚点 G `host/runner/tools/sand-agent-management-tools.ts:77-81,146-169`；`host/host-runner-composition.ts:1218-1236`。

### 2.3 SendToAgent

```json
{"type":"object","properties":{"target_id":{"type":"string","minLength":1},"message":{"type":"string","minLength":1},"images":{"type":"array","items":{"type":"object","properties":{"url":{"type":"string","minLength":1},"alt":{"type":"string"}},"required":["url"]}},"priority":{"type":"boolean"}},"required":["target_id","message"]}
```

- 字符串 trim；每张图片 URL 必须可由 URL 解析且 protocol 为 `file:` 或 `https:`；失败 issue path 为 `images.<index>.url`。alt 可省略，空 alt 不透传。priority 只有 true 才传给依赖。
- self-send 返回普通拒绝文本 `You can't message yourself with SendToAgent. Use SendMessage to talk to the user, or pick a different target id.`。
- 服务端裁 message 至 8000 字符，检查空、自发、已删除/未知目标、remote room 等；返回投递确认或拒绝文本，**不是收件人的回答**。group 走 postToGroup，当前不递图片、不做 priority 中断，回执告知限制。
- 1:1 普通消息 push 队尾；priority prepend，且可打断对方非 user lane；对方当前 user lane 不打断。图片解析异常走 wrapper error。
- 锚点 G `host/runner/tools/sand-agent-management-tools.ts:38-68,99-128`；`host/extensions/transcript/agent-to-agent-messaging.ts:52-147`；`host/agents/agent-messaging.ts:9,23-25`。

### 2.4 Task（host 实际配置，不混入云 coordinator schema）

```json
{"type":"object","properties":{"description":{"type":"string"},"prompt":{"type":"string"},"subagent_type":{"type":"string"},"model":{"type":"string"},"resume":{"type":"string"},"file_attachments":{"type":"array","items":{"type":"string"}},"run_in_background":{"type":"boolean"}},"required":["description","prompt","subagent_type"]}
```

- `subagent_type` 的模型侧枚举/必填呈现受 build options 控制，以上展示字符串分支；运行期省略/空白会选 general-purpose 或首个配置，按配置名单归一 canonical 名。multitask executor 的配置见 G `host/sand-multitask.ts:24-40`。本报告不伪造部署时完整 enum。
- prompt 必须含非空白字符，但不 trim 其内容；description 运行解析可 default 空串；model null 预处理为 undefined；run_in_background 接受字符串 true/false 的宽松输入。resume 可选，但 running id 不允许 resume，应 MessageSubagent/StopSubagent。
- host 在非 subagent、非 shared room 且有 configs 时启用 Task；配置 `useClientSideSubagent:true`、`enableJobCompletionNotifications:true`、`allowCustomModelId:false`。未在此开启 cloud/environment/machine、interrupt/self-fork 等泛用可选 schema，不将这些当本地工具必有字段。
- **实际 host adapter 总是后台运行**：dispatch 后返回 `{status:"background",backgroundReason:AGENT_REQUEST,toolCallCount:0}`，不能由 schema 的 run_in_background:false 推断有同步等待实现。
- adapter 内部错误 `{status:"error",error:<string>}`；running resume 抛 `SandSubagentDispatchError`。client 转为 TaskResult success/error oneof；成功字段含 `conversationSteps,durationMs(BigInt),agentId?,isBackground,backgroundReason,transcriptPath?`；错误 `{case:"error",value:{error:<string>}}`。后台 render 返回已启动/agent id/不要等待、结束后自动通知说明；不是工作最终结果。同步通用路径 render response + Agent ID；错误 render `Error: …`。
- runtime settle 会从 sessions map 删除 runner；通用 Task 文案虽承诺 resume，**本 host 已结束任务的完整上下文恢复没有在 adapter 中得到证明**，不把 id 可复用等同 transcript 已恢复。
- 锚点 G `packages/agent/tools/task-tool-schema.ts:82-150`；`packages/agent/tools/task.ts:363-365,414-501`；`packages/agent/tools/task-client.ts:98-164,280-410`；`host/runner/tools/turn-toolset.ts:1324-1363`；`host/runner/agent-adapters.ts:25-40`；`host/runner/subagent-runtime.ts:292-317`。

### 2.5 CheckSubagent

```json
{"type":"object","properties":{"subagent_id":{"type":"string"}}}
```

- trim 后空或未传即列全部 running；不返回所有历史任务列表。
- 无任务：`No background subagents are running right now.`；有任务为格式化文本列表；指定 id 返回详细文本，素材字段 `{subagentId,subagentType,title,elapsedMs,toolCallCount,recentActivity:string[],transcriptPath?:string|null}`。
- 指定非 running 返回 `No subagent "<id>" is currently running. It may have already finished (you're revived automatically with a finished subagent's result), or the id is wrong.` 并附当前 running 情况。
- 锚点 G `host/runner/tools/sand-subagent-management-tools.ts:5-30,55-109`；`host/runner/subagent-runtime.ts:394-423`。

### 2.6 MessageSubagent

```json
{"type":"object","properties":{"subagent_id":{"type":"string","minLength":1},"message":{"type":"string","minLength":1}},"required":["subagent_id","message"]}
```

- trim 后均非空；可选 reviewSteer 鉴权先行，拒绝直接返回 reason；not-running 与 CheckSubagent 共用拒绝文本。
- 成功为“Message delivered … interrupt … keep working … revived … don't wait”说明文本，不返回 worker 立即答复。
- 实现将 message 写进该子任务**单槽** pendingSteer，interrupt 当前 run；settle 时优先消费 steer 并再 run，尚不通知父。连续 steer 后写覆盖，不应宣传为可靠多消息 FIFO。
- 锚点 G `host/runner/tools/sand-subagent-management-tools.ts:15-24,32-39,110-129`；`host/runner/subagent-runtime.ts:268-290,425-438`。

### 2.7 StopSubagent

```json
{"type":"object","properties":{"subagent_id":{"type":"string","minLength":1}},"required":["subagent_id"]}
```

- trim 后非空；not-running 与上相同。
- 成功：`Stopping subagent <id>. It will be torn down and won't report back.`；是接受停止，不是同步证明资源已回收。
- abort 标记 aborting、删除 pending steer、disarm pending wake、interrupt；settle 检测显式 abort 后不调用父 completion。**与 P6-13“主 bot 收一条已停止”相反**。
- 锚点 G `host/runner/tools/sand-subagent-management-tools.ts:41-45,130-141`；`host/runner/subagent-runtime.ts:364-391,441-461`。

## 3. 支撑工具（不与派工混同）

### 3.1 TodoWrite

常规模型参数摘录：

```json
{"type":"object","properties":{"merge":{"type":"boolean"},"todos":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"content":{"type":"string"},"status":{"type":"string","enum":["pending","in_progress","completed","cancelled"]}},"required":["id","content","status"]}}},"required":["merge","todos"]}
```

不同 promptVersion 会调整字段顺序、content optional 和 minTodos；不要假设所有模型都 min2。运行期 merge 省略默认 true，接受宽松 boolean/array/enum；merge=true 允许 content 不填，merge=false 要 content。成功 render 为 `Successfully updated TODOs…` 加当前清单/提醒；参数与成功文本证据 G `packages/agent/tools/core/todo/schema.ts:9-115,120-151`。本次未穷举 Todo executor 的存储失败分支，不补统一错误码。multitask wrapper 复用既有 Todo 工具；completed 的提示定义是已向用户交付，不只是 worker 算完。G `host/sand-multitask.ts:46-70`。

### 3.2 SendMessage

此工具给用户/连接的 channel 送输出，不是父 worker 回报工具。字段摘录（widget 引用单独定义于下文）：

```json
{"type":"object","properties":{"type":{"type":"string","enum":["text","attachment","widget","cursor-agent","secret-request"]},"content":{"type":"string"},"url":{"type":"string"},"images":{"type":"array","items":{"type":"object","properties":{"url":{"type":"string","minLength":1},"alt":{"type":"string"}},"required":["url"]}},"alt":{"type":"string"},"reply_to":{"type":"string"},"channel":{"type":"string"},"widget":{"$ref":"#/$defs/widget"},"bcId":{"type":"string"},"secret":{"type":"object","properties":{"label":{"type":"string","minLength":1},"description":{"type":"string"},"connector":{"type":"string","minLength":1},"field":{"type":"string","minLength":1}},"required":["label","connector","field"]}},"required":["type"],"$defs":{"widget":{"type":"object","properties":{"prompt":{"type":"string","minLength":1},"helpText":{"type":"string","minLength":1},"options":{"type":"array","minItems":1,"maxItems":6,"items":{"type":"object","properties":{"label":{"type":"string","minLength":1},"value":{"type":"string","minLength":1},"description":{"type":"string","minLength":1},"style":{"type":"string","enum":["default","primary","danger"]}},"required":["label"]}},"allowCustom":{"type":"boolean"},"dismissOnMoveOn":{"type":"boolean"}},"required":["prompt","options"]}}}
```

- 此处 `$defs` 为阅读整理，不是声称上游序列化产物原样含此定义。字符串 trim。运行 refine 要 text 有 content、attachment 有 url 且 file/https；images 仅 text，channel 仅 text/attachment；跨 type 附带专属有效字段会拒绝而非静默丢弃。
- schema 文案说 widget/bcId/secret 对应 type 必需，但 `refineSendMessage` 只显式补验 text/attachment 的缺字段；不要把文案当已经实现的 required-if 验证。更深 build 路径是否补验，本次未作全套提问/凭证审计。
- 成功内部 `{case:"success",value:{timestamp:BigInt,messageId?}}`；render `Message sent to user. (id: …)` 或无 id 版本。error 为 error oneof，render `Failed to send the message to the user: …`。已有待回答选择时返回 blocked error，不继续送消息。这里只描述凭证字段名，未读取任何真实凭证。
- 锚点 G `host/runner/tools/send-message-schema.ts:3-53`；`shared/sand-widgets.ts:3-35`；`host/runner/tools/send-message-tool.ts:67-132`。

## 4. worker 回报：host 自动复活父 session 的真实链路

```text
Task → SandSubagentHostAdapter.runSession
  → subagent-runtime.dispatchBackgroundSubagent / runner.run
  → run promise completed/error/aborted
  →（如有 steer，先再 run；显式 stop 则 disarm 且不通知）
  → registry terminal / outline / freeWindow / 删除子 runner
  → onBackgroundSubagentCompletion({parentAgentId,subagentAgentId,subagentType,
      toolCallId,title,status:"completed"|"error",result,quietOrigin?})
  → runner-registry.wireRunnerLifecycle
  → backgroundWakes.handleBackgroundSubagentCompletion
  → completion-revivals 队列
  → resolveBackgroundSession(parentAgentId)
  → enqueueExclusiveRun(lane:"background",source:"subagent-revival")
  → parent.runner.run(prompt,{hidden:true,isSilenceAllowed:true,autoReviewEpoch:"continue",…})
```

逐段证据：

| 环节 | 要点 | G 锚点 |
|---|---|---|
| 后台启动 | 建 registry/meta、派发事件与 pending-wake 标记，再 run | `host/runner/subagent-runtime.ts:195-265` |
| steer / settle | steer 可续跑；terminal 清理 runner 与资源；显式 stop 不回报 | 同文件 `268-317,364-391,425-461` |
| completion 数据 | 结果 trim，空输出有 fallback，异常结果标 error | 同文件 `61-77,374-391` |
| 回调接线 | runner 回调转交 backgroundWakes | `host/extensions/transcript/runner-registry.ts:130-148,182-189` |
| 合批/去重 | 按 parent 排队、同 pending 队列按 subagentAgentId 去重、reviving set 防并发 | `host/extensions/transcript/completion-revivals.ts:91-153` |
| 自动父回合 | 隐藏 background lane，带未答问题提示；执行后 emit update | 同文件 `156-217` |
| 失败结果 | delivered/superseded/session_unavailable/quiesced/error；错误有 telemetry/tray | 同文件 `156-217,332-348` |

完成提示以 `[A background task just completed]` 开头，聚合 finished/failed 和结果，再让父 bot review/继续/收尾；并不要求每次都给用户发通知。quietOrigin 可触发静默要求。G `host/extensions/transcript/completion-revivals.ts:28-46`。

**可靠性上限**：队列内去重不是跨进程全局 exactly-once；本次未完整审计 pending-wake store/rearm 的 crash 恢复，不把正常 completion 链路当 P6“重启打断恰一条通知”已实现证据。`NotifySandAgentTurnFinished` 是移动 push sender/通知去重器调用，不是这条父回合回灌路径，证据 G `host/extensions/notifications/mobile-push-notifier.ts:3-5`。

持久 teammate 的回信走另一条链：`sendToAgent → pendingInbound → reviveForAgentInbound → lane:"agent" → hidden runner.run(buildAgentInboundWakePrompt(...))`。G `host/extensions/transcript/agent-to-agent-messaging.ts:52-123,149-273`。这不是 Task settle 回调，创建 teammate 也不会自动建立与某主 bot 的 P6 createdBy 所有权。

## 5. 主 bot 路由 harness：模型决定，host 执行

- **派发策略在提示词**：主 bot 是 dispatcher、turn 短、多步重活给 executor、独立任务并行、纠偏 MessageSubagent 不重复派；executor fresh context、没有父历史/memory/routines/channels，需要自包含 prompt；wake 先对齐 TODO；group room 例外 inline。G `host/sand-multitask.ts:16-40,72-82`。未发现 host 为任务自动打技能分/选择最佳 bot 的确定性路由算法，不应从 prompt 文案推导存在。
- **工具供应层隔离**：Task 仅父 runner 且非 shared room；multitask 受 gate 和 system-prompt override 条件限制；SendMessage/SendToAgent/CreateAgent/UpdateAgent 等仅非 subagent；Check/Message/Stop 也仅父层；shared room 最终走受限 whitelist。G `host/runner/tools/turn-toolset.ts:1293-1388,1483-1504`。
- **不能把工具隐藏当执行层鉴权完成**：本项目 P6-14 仍须检查 alternate caller/direct execute 拒绝，G18 gating 证据本身不证明绕过调用无效。
- **主会话排队**：`RunLane = user|agent|background`，一个 scheduler 的 active 未释放不 pump；优先 user，然后 agent，再 background。因此普通 worker completion 不是“忙时插队首”，更不打断用户 turn。G `host/extensions/transcript/run-scheduler.ts:3,23-31,62-115,199-206`。
- **peer priority**：可打断非 user lane；普通 peer 稍后运行；父 completion 不使用该 priority 模式。G `host/extensions/transcript/agent-to-agent-messaging.ts:125-147,169-273`。
- **数据权威风险**：peer wake 明示另一个 assistant 非用户，但 priority 文案含 follow-it-now 式要求；入站 transcript 仍为 `role:"user",fromAgent:…`。G `host/agents/agent-messaging.ts:83-118`；`host/extensions/transcript/agent-to-agent-messaging.ts:275-303`。不能原样移植为本项目“来自 worker 的数据、非指令”策略。

## 6. 与 dsh 宿主的映射（优先现成原语）

| G18 能力 | dsh 可用对应 | 差异 / P6 尚需适配 | 源码证据 |
|---|---|---|---|
| Task 临时后台派发 | `@deepseek-ai/dsh-tool-subagent` → `ctx.subagents.startActivation({delivery:"parent",…})`，立即 `{kind:"activation",subagentId}` | 对 Task 风格最接近；P6 worker 若必须是 UI 持久 bot，则先明确 botId/sessionId/parent lineage 对应，不直接把 activation 当 teammate | D `packages/subagent/tool-subagent/src/index.ts:205-331` |
| CreateAgent | `sessionController.create` → `agents.createSession({agentPreset,cwd,…})` → `{sessionId,agentPreset?}` | session 不是本项目 bot/profile；复用已选的 S-2 RPC 通路与 bot 创建服务，补 reserveSlot/createdBy/失败回滚；不要实现第二个 runner | D `packages/api/session-controller/src/commands.ts:103-141`；本目录 `s2-dsh-cross-session.md:38-98` |
| UpdateAgent / SetPrimaryBot | preset/profile 管理与应用 bot 状态 | G18 Update 只是 profile patch，SetPrimaryBot 没 schema；started session 不可任意热换 preset。主 bot 身份/所有权为应用契约，不能据猜测补“原版参数” | G management `146-169`；D `packages/preset/agent-preset-registry/src/index.ts:357-382`（亦见 S-2） |
| SendToAgent / MessageSubagent | `dsh-tool-subagent-control` 的 `send_message({agent_id,message})` → `{messageId}`；service 管 lineage、continuation | 原生限制 direct continuable child/parent，不是任意 teammate 广播；P6 createdBy guard 不可省略，不能直接给全局 botId 越权投递 | D `packages/subagent/tool-subagent-control/src/index.ts:29-73` |
| StopSubagent / P6 stop_bot | `interrupt_agent({agent_id})` → `{accepted:true}`，service 校验 live caller/后代 lineage | 接受中断不是完成回收；外部 provider 永久结束、本地 child 可继续；子孙不会自动全停。P6停止一次回报和容量释放要绑定 terminal，不绑定 accepted | D 同文件 `75-111` |
| CheckSubagent / ListAgents | 已有共享 `registerListAgents` 与子任务状态服务 | 沿用可见性/lineage 限制；G18 elapsed/recentActivity/transcriptPath 不是 dsh 同名保证，UI 必要字段逐项投影 | D 同文件 `18,27-28`；G subagent-management `5-13,55-109` |
| worker 自动结束通知 / WakeParent 效果 | 原生 `createSettlementMessage` + manager notifySettlement | dsh 不仅“显式 report 才能通知”：runtime 本来就有 terminal notice；正常结束/aborted/refusal/error 等有区分。本地 continuable child 另提示 send_message 回结果，settlement 会避免重复 closing text | D `packages/subagent/subagent/src/continuation-messages.ts:80-172`；`manager.ts:1205-1224` |
| 主忙时回灌 | 原生 settlement：idle→queue、busy→steer；Agent followup/steer/inject | steer 是 next-step inbox，不等于 G18 interrupt-run，也不等于 P6“队首”。确切顺序需适配测试，不照搬三 lane scheduler | D `packages/subagent/subagent/src/manager.ts:678-689,1205-1218`；`packages/core/agent-loop/src/agent.ts:170-197` |
| 非用户来源与幂等投递 | dsh settlement `source.kind:"subagent-settled"`；SA AgentDelivery `source.kind:"dsh-superagent"`、稳定 messageId、持久历史+pending inbox去重、flush | 模型 wire 的 role 仍可为 user，必须区分 **source.kind≠user** 与 **role≠user**。若产品真要求后者须另定契约；不能仅看到 UserMessage 就认定伪装人类。SA不等于已满足所有 crash exactly-once | D continuation `153-171`；S `src/app/delivery.ts:8-29,40-85` |
| 显式 progress/ready/blocked 回报 | SA `orchestrator_report` + effects relay | 可改造严格 report schema/持久 outbox，勿全搬 GitHub PR/Ticket 工作流；与 dsh原生settlement去重/聚合，避免一回合双通知 | S `src/app/tools/executor.ts:75-101`；`src/app/sessions.ts:166-185`；`src/app/delivery.ts:61-85` |
| 限制 worker 二次派发 | dsh maxDepth/agentPreset/tools restrict + execute guard | 配置 maxDepth=0/应用角色 guard 优先；不得只从模型工具列表移除。provider 必须支持 depthLimit，否则启动失败而非静默失效 | D `packages/subagent/tool-subagent/src/index.ts:70-80,160-174,313-329`；本目录 S-2 工具鉴权锚点 |

DSH manager 在 cleanup 中释放 slot，之后发 settlement；notice 只发给同一个 live parent，delivery=caller 或未 announced 不发，closing teardown 时 inject；异常记录 warn，不能据此宣称父重启后必补发。D `packages/subagent/subagent/src/manager.ts:1194-1224`。这也说明应优先研究原生 activation 能否覆盖 P6，而不是先搬 G18 pending-wake 系统。

## 7. 搬运阶梯决策与 P6 实现输入

| 能力 | 候选（owner/repo@path 或 npm 包名） | 阶梯级别（1～5） | 许可证 | 维护（最近 commit / release） | 决策 | 理由 / 适配工作量 |
|---|---|---|---|---|---|---|
| worker 生命周期、通信、中断、回报 | `@deepseek-ai/dsh-tool-subagent`、`@deepseek-ai/dsh-tool-subagent-control`、`@deepseek-ai/dsh-subagent`，项目现有 dsh 链 | 1（既选底座，维护资格沿用既有核验；issue响应仍以 S-2 为准） | MIT | MANIFEST：2026-10-30 活跃；本次未重查远端或 npm 新版本 | 集成 | 优先配置/调用原生 activation 与控制 API，避免复制 scheduler；需核验生产 profile 是否已装配、与持久 bot 生命周期是否匹配。是路线建议，不声称本次完成运行兼容验收 |
| P6 持久 bot 的主会话请求桥 | dsh sessionController / Typert Remote，S-2 已选通路 | 1（沿用） | MIT | 同上 | 集成 | 复用已有 session/create RPC 探针方案；补 bot 元数据、createdBy、容量事务和断流 unknown 处理。精确工作量未验证 |
| schema/自动 completion 的产品语义参照 | `b-nnett/grok-bot-0.18-reconstructed@source/host/runner/tools/*`、`subagent-runtime.ts`、`completion-revivals.ts` | 3 | 无 LICENSE；闭源产物重构，按私用规则记录出处 | 2026-08-23 快照；非原版持续维护源码 | 改造 | 只按必要文件/语义搬，不能作为第1/2级维护依赖。G18停止不通知、peer角色/权威措辞、持久化去重与P6不同，整仓搬会多出第二个runner。来源 https://github.com/b-nnett/grok-bot-0.18-reconstructed@a9f633e09d49a85829b8236331b9e21f7e612634:source/host/ （实际复制须按本报告锚点列具体文件） |
| 显式报告与幂等 inbox relay | `deepseek-ai/dsh-superagent-prototype@src/app/tools/executor.ts,src/app/delivery.ts,src/app/sessions.ts` | 3 | MIT | 2026-10-31 首次导入；无release，Issues关闭，持续维护边缘；无同名npm公开包（S-1） | 改造 | 最小搬 report/relay，不搬 PR/Ticket 全系统；与现有宿主alpha版本兼容和原生settlement重叠需验证。来源 https://github.com/deepseek-ai/dsh-superagent-prototype@6337fc823ce20251c8de8085948165c81aaa701e:src/app/ |
| WakeParent / SetPrimaryBot / StopAgent 的 0.78.1 原版 schema | 已发布闭源产物/云端 harness；0.18 无实现可读 | 4 | 闭源产物，私用 | 不适用；0.78.1行为未验证 | 逆向 | 建议后续 RE 回答：工具是否真实注册、完整参数/结果/错误；StopAgent停止对象/是否回报/释放槽时点；主身份是否设置工具还是应用配置；若服务端不可得，明确证据止于客户端，不能捏造 schema |

本次**没有“自建”结论**，也没有声称“GitHub 搜遍没有现成方案”。这是指定快照源码审计；既有 dsh 与 SA 已覆盖大量原语，不需要为补齐名字而新建基础设施。若 director 最终选择自建剩余适配，仍须单独说明现有能力在哪个可证伪需求上不够。

给 P6-10~13 的直接输入（不是新 schema 定稿）：

- P6-10 `create_bot{name,prompt}` 是本项目接口；G18 CreateAgent 没 prompt，须明确“创建持久 bot + 首条投递”事务/回滚，不能声称原版同参。
- P6-11 `send_to_bot` 的 createdBy=主 bot 与容量占位属于应用执行鉴权；G18 任意 teammate/group 语义不满足。
- P6-12 正常 completion 可优先用 dsh原生 notice；来源标记、队首、阻塞/重启打断恰一条需要专门验证。别把 G18队列内去重当持久 exactly-once。
- P6-13 G18显式stop不回报，不能直接复刻；用 dsh accepted/terminal 两阶段和统一 report owner，确保“停止”通知与资源释放不双发/不提前。

需求依据 `/home/lingxufeng/bot/work/p6-orchestration/PLAN.md:48-54`。本调研未运行测试、未采集线上请求、未读取凭证，未证明 0.78.1 与 0.18 一致。
