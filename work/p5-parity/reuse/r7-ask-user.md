# R7 · ask-user 正式通道

2026-11-03。范围：BRIEF §10.7；只读源码调研，不改产品代码、不启动服务。

## 结论（三档判定）

**第二档：事件在，但我们的作答/UI 链路要补。** dsh 已完整提供 `ask_user_question → userQuestions.ask → user-questions/request → $events → $events/result`；M2 可以原帧收到问题，不需新增 M2 endpoint。但本项目 renderer 只处理审批、M1 只准审批字符串结果、ledger 把所有 waterfall 都当审批，故**不是加一张 JSX 卡片就能跑通**。

建议：可作为本 slug 的独立 J2 补充任务，由 director 决定预算；保留默认 legacy/blocking 工具，复用现有 M2 与上游答案协议，适配最小 composer 问答卡。**估计 1–2 工程日（含定向单测/E2E，未实测估算）**。不同时启用 timed/迟答，也不重启 dsh client 全套。若预算仅容纳纯 UI 小修，则本 slug 暂不实现，不能将其归因为“不在转发列表”。

## 决策行

`D/` = `/home/lingxufeng/bot/repos/deepseek-harness/`，固定 SHA `ce7073d51254c26cd63b22a60835b8f948deb447`。`B/` = `/home/lingxufeng/bot/`，调查时主仓 HEAD `f8253c55be98f362ea26a8ddaff477b94e406c78`；工作区有既有未提交改动，以下行号以读取时文件为准。

| 能力 | 候选（owner/repo@path 或 npm 包名） | 阶梯级别（1～5） | 许可证 | 维护（最近 commit / release） | 决策 | 理由 / 适配工作量 |
|---|---|---|---|---|---|---|
| 模型提问与 Host 答案协议 | 已有 dsh `@deepseek-ai/dsh-tool-ask-user` + `@deepseek-ai/dsh-user-questions` | 1 | MIT | 仓 commit 2026-10-29 UTC / 10-30 +08；npm modified 10-29 | 集成 | 已在默认 standard preset/base 内，不另写工具或协议；见 D/packages/bundle/web-app/presets/standard.patch.yml:112–113、D/packages/bundle/base/cordis.patch.yml:79–80、D/packages/interaction/tool-ask-user/src/index.ts:99–117。 |
| 问题运输 | 已有 dsh api-remotes/gateway + 本项目 M2 | 1 | MIT（上游） | 同上 | 集成 | allowlist 最后一项即问题 waterfall；M2 原帧透传，无事件名过滤；只补 main/renderer 消费与作答校验，见下文。 |
| 问答 UI（推荐路线） | deepseek-ai/deepseek-harness@packages/client/ui-user-questions/src/client/{QuestionComposer.tsx,QuestionComposer.module.css,QuestionReplyView.tsx} | 3 | MIT | 同上 | 改造 | 复制所需问答片段后接本项目 store/主题；不要复制整套 Slot/Session/Remote 生命周期。来源 https://github.com/deepseek-ai/deepseek-harness @ ce7073d51254c26cd63b22a60835b8f948deb447 : 上述路径。总闭环约 1–2 日，不是仅卡片工时。 |
| 问答 UI（整插件候选，不选） | npm `@deepseek-ai/dsh-client-ui-user-questions` | 1 | MIT | npm modified 2026-10-29 | 集成 | 可发布依赖，但不建议在当前 renderer 直接启用：依赖 sessions/remote.userQuestions/uiSession/slots/locale/uiConversation；本项目已放弃 dsh client 运行时。若走此路需另做真实 boot spike，成本高于局部改造，未验证可运行。 |
| 超时后继续工作、迟到答案（候选，不选） | 同工具 `mode: timed`，D/packages/interaction/tool-ask-user/src/timed.ts | 1 | MIT | 同上 | 集成 | 非默认、也非最小 J2：需 `userQuestions.attachWait` stream、`userQuestions.answer` RPC 与 projection/inbox 同步，现有 M1/M2 没有这些入口。保留为后续集成选项，本 slug 不跟进。 |

许可证出处：D/LICENSE:1–21；client 包 package.json:47。维护证据：GitHub MCP `list_commits(perPage=1)` 返回上述 SHA/时间；`list_issues(state=CLOSED,perPage=3)` 返回空，**issue 有人回应这一条件仍未验证**（与 B/work/p4-ui/REUSE.md:37 一致），不把“近期 commit”写成维护判据已全部满足。沿用已选 dsh 底座，不引入第二个问答服务。

npm 查询均为 `npm view <pkg> version time.modified repository --json`：tool-ask-user 的 dist-tag 为 `0.0.1-rc.1`，user-questions 与 client-ui-user-questions 为 `0.0.1-rc.3`，modified 均为 2026-10-29；另查 tool/client 的 `@0.2.2-alpha.2`，均存在。**不要据此安装 latest**：源码 package.json（如 client:4）为 `0.2.2-alpha.2`，应跟项目既有 dsh 锁版走；npm 元数据不证明不同版本行为等价。

## ① 默认 profile 是否加载

- SDK 实际启动 `web` profile，再加 p2sdk/approval/runtime/extra overlays，B/app/sdk/src/start.ts:86–99。
- web 的默认 preset 是 `standard`，D/packages/bundle/web-app/cordis.patch.yml:586–593；bundle patch 明确加载 standard/ptc/minimal/cordis，D/packages/bundle/web-app/package.json:46–54。
- standard 显式加载 `tool-ask-user`，D/packages/bundle/web-app/presets/standard.patch.yml:112–113。本地搜索也确认 ptc:114–115、cordis:111–112 加载；不能推及 minimal 或用户自定义 preset。
- 基础服务 `user-questions` 在 base，D/packages/bundle/base/cordis.patch.yml:79–80。
- **禁用的是 UI，不是工具/服务**：B/app/sdk/profile/patches/p2sdk.yml:164–165 设置 `ui-user-questions.disabled: true`；该 node 插件本身也是空 `apply()`，模型工具归 preset 管，D/packages/client/ui-user-questions/src/index.ts:1–11。因此“关了 Web UI，所以没有提问工具”是错误推断。
- 无配置时 `mode=legacy`，不是 timed；D/packages/interaction/tool-ask-user/src/index.ts:15–40。模型名为 `ask_user_question`，字段为 questions/id/question/header/options/multi_select；调用服务时转为 `multiSelect`，答案为 `{answers:[{id,selected,custom?}]}`，同文件:42–117。

以上确认的是默认配置源码；未在临时 HOME 启动运行态 dump，extra patches/用户配置可以覆盖默认值，不能声称所有现存 bot 都一定有该工具。

## ② 完整转发列表与真实路径

已通读 **D/packages/api/remotes/src/remote-events.ts:26–57 整个数组**，不是只读 approval 项。列表全部如下（`W`=waterfall，其余 emit）：

- :27 `agent-preset/selected`
- :28 `approval/request`（W）
- :29–33 `api-session/activity`、`api-session/added`、`api-session/error`、`api-session/removed`、`api-session/status`
- :34 `commands/change`
- :35–36 `deepseek-account/session-expired`、`deepseek-account/model-sign-in-required`
- :37–38 `credentials/record-updated`、`credentials/reference-updated`
- :39 `goal/activation-changed`
- :40–45 `cordis/request-run`、`cordis/request-run-resolved`、`cordis/dynamic-package`、`cordis/dynamic-retract`、`cordis/inspect-query`、`cordis/inspect-query-resolved`
- :46–47 `llm/adapters-updated`、`llm/models-updated`
- :48 `permission-presets/catalog-changed`
- :49–52 `plugin-manager/changed`、`plugin-manager/install-log`、`plugin-manager/install-state`、`plugin-manager/update-state`
- :53 `plugin-market/changed`
- :54 `settings/document-updated`
- :55 `schedule/changed`
- **:56 `user-questions/request`（W）**

该文件另由 GitHub MCP `get_file_contents` 按固定 SHA 交叉读取，问题项一致：
https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/api/remotes/src/remote-events.ts#L26-L57

真实链路：
1. 工具将 `exec.agent`/signal 放入服务请求，D/packages/interaction/tool-ask-user/src/index.ts:99–109。
2. 服务在 live root agent 作用域 waterfall 发 `user-questions/request`，D/packages/interaction/user-questions/src/index.ts:292–353；不是 approval/asked，也不是普通聊天消息。无 answerer 会 `NO_PROVIDER`，:341–343；owned 子 agent 不可直接问人，:137–149。
3. api-remotes 为数组中每个 waterfall 注册 listener，验证 request.agent 与 carrier 相同，交给 Gateway，D/packages/api/remotes/src/index.ts:48–78；返回的 result.value 直接 resolve 原 waterfall，:136–159。
4. 线上帧结构是 `{type:'waterfall',event,eventId,agentId,request}`，D/packages/api/gateway/src/stream-protocol.ts:51–58；问题 request 中保留 questions/wait，agent/signal 被移除，:146–171。下行用 `$events`、作答用 `$events/result`，同文件:10–13。
5. 答案是 `{clientId,eventId,outcome:{kind:'result',value:{answers:[...]}}}`，不是 `'allowed-once'`。协议支持 result/next/rejected，:87–137；Gateway resolve 到 Host 原调用，D/packages/api/gateway/src/index.ts:708–762。答案类型见 D/packages/interaction/user-questions/src/types.ts:72–86。
6. 上游已有专门的 scoped question 转发 result/next/rejection 测试，D/packages/api/remotes/tests/remote-events.host.spec.ts:208–265；本次**只读，未运行**。

## ③ M2 能收到，但当前产品在哪断

| 环节 | 现状 / 证据 | 必补内容 |
|---|---|---|
| M2 下行 | B/app/ui/main/m2-mux/index.ts:15 放行 `$events`；:143–175 tap 不按 event 名过滤并将完整 JSON 发回 port | 不新增 endpoint，不改运输协议 |
| main 常驻订阅 | 同文件:193–204 无 renderer 时仍订阅并记 waterfall | 问题也会进入本地台账，不能继续假设都是 approval |
| ledger | B/app/ui/main/dsh/ledger.ts:6–9 类型仅声明 approval；实际 M2 :74–78 只查 type 并强转；ledger :34–39 对任何 waterfall 读 request.toolName/callId | 按事件判别入账。问题不能成为 toolName=undefined 的假审批；验证 eventId/agentId/问题与答案批次 |
| renderer | B/app/ui/renderer/shell/store.ts:131–169 仅为 `approval/request` 建卡，忽略问题 waterfall；:373–387 作答仅审批字符串 | 独立 question 状态/卡片、取消、重连去重、错误/已提交态；按 agentId 只呈现在对应 bot |
| M1 回答 | B/app/ui/main/m1-api/index.ts:97–108、B/app/ui/main/dsh/ledger.ts:45–54 只准 allowed-once/rejected | 必须按账本里的事件类别分支：审批仍只接受原二值；问题才可提交严格校验的 answers，不能全局放开 arbitrary outcome.value |
| 离场 deadline | B/app/ui/main/m2-mux/deadline.ts:63–74、:102–116 遍历所有账本项，代答字符串 rejected | 问题与审批分离，问题不得代答“拒绝审批”的字符串。显式定义离场取消/委托/等待策略并测试，不能顺手改变审批默认值 |

特别注意：**默认 legacy 请求没有 callId**（tool/index.ts:99–110），字段也不是 `request.callId`；带 wait 的调用才是 `request.wait.callId`（user-questions/types.ts:153–162）。最省方案把问题卡放对应 bot 的 composer 区，按 eventId 去重，不猜它属于哪个 tool call。若要求挂在精确工具行，需另评估配置为 timed 的无限等待变体（timed.ts:195–208）或补明确关联，不能用“当前最后一条 tool”猜测。

## ④ renderer 现成 UI 与候选比较

- 有成熟形态，不需逆向：`QuestionComposer` 接管输入区；普通问题为逐题流程，支持选项单选/多选、自由文本、跳过/下一题/整批提交、已答只读回看；plan-review 走独立面板。D/packages/client/ui-user-questions/src/client/QuestionComposer.tsx:139–168、:173–200、:350–395、:450–460、:554–719。
- 上游并不是简单 `<QuestionCard request onAnswer>`：插件依赖 `sessions/remote/remote.userQuestions/uiSession/slots/locale/uiConversation`（client/index.ts:55–56），注册 composer/会话节点并监听 waterfall（:368–403）；timed 场景还有 attachWait claim（:215–273）、projection/迟答 RPC（:286–358）。直接 npm add 并不能替本项目补齐宿主服务。
- 候选 A“整插件直接集成”优于复制的前提在当前宿主不成立：本项目 renderer 已停用 dsh client，历史 boot 失败与超白名单依赖已有证据，B/work/p4-ui/REUSE.md:14。不能为了这张卡重新引整套 client。
- 候选 B“复用 Host+运输，局部改造 UI”最短：现有依赖继续维护协议；只适配缺失消费层。不是另造提问工具、问答服务或持久库。
- 候选 C“timed 全形态”功能更全但不是零成本：client/index.ts:222–227 需要 `remote.userQuestions.attachWait`；:294–295 需要 `answer`；现有 M2 白名单只有三个 endpoint，不能直接运行这一模式。建议后续需求出现再加，不为 J2 一并做。

## 最小实施边界与验证清单（建议，不是已实现）

1. main 事件台账判别 + 严格答案校验 + 仅 question 可走结构化结果 + 事件级 deadline 策略：约 0.5 日。
2. renderer 问题状态、composer 卡、选项/自填/跳过/批量提交与 cancel：约 0.5–1 日；复用上游行为，套当前主题。
3. 定向单测与 fake LLM E2E：约 0.5 日，允许与实现重叠；合计约 1–2 日，受当前测试夹具复用程度影响。
4. 必证伪：默认 standard 模型工具列表含 ask_user_question；fake 发问后对应 bot 出卡并将同批 id/答案交回工具结果；另一 bot 不出现；取消/重连不重复提交；问题不能用 allowed-once 作答、审批不能用 answers 作答；离场不得将 rejected 字符串当问题答案。整个旅程不读真实凭证。

局限：本次完成固定源码及 GitHub/npm 元数据核查，未启动 Electron/SDK，未跑上游或本项目测试，**“M2 可收到”是源码可达性结论，不是已完成运行态 E2E**。没有 clone 新仓或修改 MANIFEST（目标仓已存在并有记录）；没有修改 REUSE.md、产品代码或任何审批策略。
