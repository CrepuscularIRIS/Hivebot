# BRIEF · p6-orchestration（主 bot 编排 + personal agent 三段式交互）

v1 · 2026-11-03 · director（Opus 5.5）· 首版
输入：QUESTIONS Q-001 / Q-003 / Q-012 / Q-017（用户原话）、`p2-sdk/reuse/superagent-compat.md`（下称 SC）、`p1-re/RE-features.md`（下称 RF）、`p3-contract/CONTRACT.md` v1.4 §3.1 / §5（下称 C）、`p5-parity/BRIEF.md` v2.1 与 PLAN（下称 P5）、只读核实 `repos/dsh-superagent-prototype@6337fc8`（下称 SA/）、`repos/deepseek-harness@ce7073d5`（下称 D/）、`repos/grok-bot-0.18-reconstructed@a9f633e`（下称 G18/）、`app/sdk/src/start.ts`、LEARNINGS。

## 1. 需求证明

**用户原话（Q-017，2026-11-03）**：「之前我们提到了dsh的superagent, 其实这些是也要被放到主grok bot中的. 可以采用这种思路去做其他的编排, 例如跨session之类的内容. 每一个都是一个personal agent. personal agent的行为, 就不应该每一条信息都回复, 而是只要一开始的收到, 以及打算怎么做, 以及最后的结果. 目前从个人使用体验上, 肯定superagent会好很多. dsh可能是一个核心吧.」

演变：Q-001「总 Grok Bot 是 SuperAgent？大部分日常 bot 是 DSH？一种分工」→ Q-003「①主 bot 用 dsh+superagent、其余用 dsh；②先跑通再决定」→ C §5 当时定「默认②，切①是新 slug」→ Q-017 明确要做。

- **谁用**：用户本人，私用；主要入口是主 bot。
- **现在怎么凑合**：每个 bot 都是一条孤立的 dsh 会话（C §3.1，Bot.id = sessionId）。①**刷屏**：一个 5 步任务里，模型在每次工具调用之间说的话都作为一条气泡出现（C §3.3 把每个 `assistant/message` 都渲染成定稿气泡），用户要从一串碎话里找结论；②**阻塞**：交代一件长活，只能盯着那个 bot 等，想并行就得自己手动开新 bot、复制上下文、回头逐个查看；③**主 bot 只是带标记的普通 bot**（P5 §1 附表：建子 bot、SendToAgent 都是「无」）。
- **凭什么换（体验动机）**：用户的对照物是 superagent，它的设计原则正好写着用户要的行为：「It confirms a request once and names what it will do. It stays quiet while it works. It writes again when a result is ready, when it needs a decision, or when it cannot finish.」（SA/docs/000-philosophy.md:12）。**关键发现：这也是 Grok Bot 自己的设计**，也就是我们复刻的对象：G18/source/packages/agent/prompts/project-prompt.ts:112「The `SendMessage` tool is your only user-visible communication channel. Regular assistant text is treated as internal thinking and is not shown to the user.」；同文件 :121-129 的协调者工具集为 CreateAgent / GetAgentStatus / SendToAgent / ReadAgentTranscript / StopAgent，且「automatically notifies you when each of its turns finishes — do NOT poll」（:123）。0.78.1 的工具名枚举里也有 SendToUser、SendToAgent、CreateAgent、MessageSubagent、CheckSubagent（RF:45）。所以「三段式 + 主 bot 派活」不是外加功能，而是原版 personal agent 的本来面目，我们 MVP 漏了。
- **没证明的部分（不假装成立）**：①用户说的「superagent 好很多」指的是哪一部分：安静、后台并行，还是事件源驱动的主动性。三者对路线的要求完全不同（§9-Q1）；②0.78.1 里普通 assistant 文本是否同样对用户隐藏、没调 SendToUser 时怎么兜底，目前只有 0.18 重建仓的提示词证据，没有 0.78.1 渲染路径证据（§10 RE-1）；③在 GLM 5.3 这类模型上，「只经 send_message 说话」的遵从率有多高，没有实测（§6 D3 用数据证伪）。

## 2. 范围

**范围模式：REDUCE（第一批砍到最小闭环）**。理由：用户这次给的是方向（superagent 进主 bot、跨 session 编排、每个 bot 都是 personal agent），不是功能清单；全量编排（群聊、记忆、定时、事件源、多层委派）每一块都能单独成一个 slug。最小闭环能最快验证用户的体验判断，也符合 LEARNINGS「先把 demo 跑出来」。不选 EXPAND：p5-parity 的 L-AP / L-UI 还在路上（§8），在没落地的地基上扩不动。

**第一批（本 slug）= 两件事，缺一件闭环就不成立**
1. **三段式交互，所有 bot 生效**。每个回合用户默认只看到：一条「收到 + 打算怎么做」（合成一条，照 superagent 做法：SA/prompts/replies.md:13）→ 中间过程折叠 → 一条结果。简单问题直接一条回答。需要用户决定或卡住时可以多发一条，此外不发。
2. **主 bot 编排（跨 session）的最小闭环**。主 bot 可以：新建 worker bot 并交代任务；给已有 bot 发消息；查看 worker 状态或读取其尾部记录；停止 worker。worker 每个回合结束，**自动**通知主 bot（不轮询），主 bot 再用一条消息把结果告诉用户。worker 卡住（审批卡或提问）同样通知主 bot，由主 bot 告诉用户去哪里处理。

**三段式落在哪一层（定）：框架级为主，提示词只管内容**
| 层 | 做什么 | 理由 |
|---|---|---|
| 框架 · SDK | 新增 `send_message` 工具，作为唯一对用户可见的说话通道（G18 :112 同语义）；所有 bot 都挂载 | 「用户看到几条」由工具调用次数决定，能用 fake provider 机械证伪；只靠提示词时，GLM 是否闲聊无法控制 |
| 框架 · UI | 回合内的普通 assistant 文本和 tool 行折叠进「工作过程」块，可展开；`send_message` 渲染成气泡；**兜底**：整个回合没调 send_message → 最后一段 assistant 文本当作结果显示 | 折叠而不是删除，保住透明度（§4 死因 6）；兜底防止回合静默（§4 死因 1） |
| 提示词 | preset 指令写清：先 ack 并点名计划、过程中不说话、结果 ≤100 字等（文本按搬运阶梯第 3 级取自 G18 :110-119 与 SA/prompts/replies.md:13-27） | 只决定说什么，不决定说几条 |

不选「纯提示词」：无法证伪，换模型就失效。不选「纯 UI 折叠」：模型不在开头说「收到/打算」，UI 也凭空变不出来。

## 3. 路线候选

| | R1 · superagent 包直接集成（第 3 级改造） | R2 · 自建编排层，只借用 dsh session（推荐） | R3 · dsh 原生 agent-team / subagent 原样用（第 1 级） |
|---|---|---|---|
| 做法 | 把 SA bundle 装进我们现有的 dsh profile；新写一个「pbots 本地聊天」Source kind 和 Channel（接口 SA/src/sources/kind.ts，115 行）；主 bot = superagent 的 orchestrator Session，worker = `worker-<ticket>` Executor Session | 一个 cordis 插件（app/sdk）提供 G18 同名同义的工具：`send_message`（全部 bot）+ `create_bot / send_to_bot / bot_status / read_bot / stop_bot`（只给主 bot）；底层只调 dsh 的 sessionController create / prompt / cancel / events 和 Agent inbox；工具语义和提示词从 G18、SA 复制改造（第 3 级，注明来源） | 主 bot 挂 `dsh-experimental-tool-agent-team`（9 个工具，inbox 直发）或现有 tool-subagent 系列（web-app 已装，D/packages/bundle/web-app/cordis.patch.yml:562-568） |
| 已核实的事实 | ①**SC 的头号阻断已不成立**：我们本来就跑 `dsh web` profile（app/sdk/src/start.ts:116），不是 headless 或 sdk；②`sessionController.inspect` 仍被调用（SA/src/app/resources.ts:115），dsh 里已没有该方法，只剩 `events`（D/packages/api/session-controller/src/index.ts:540），**SC 结论仍准**；③HTTP 硬要求 host 字面等于 `127.0.0.1`（SA/src/app/http.ts:231）；④SA 仓只有 **1 个 commit**（研究原型一次性提交）；⑤「Executor Sessions run commands without approval」（SA/docs/003-execution.md:27） | dsh 原语都在已装的 0.2.2-alpha.2 里；G18 有完整的参照实现（host/agents/agent-messaging.ts 141 行、host/runner/tools/sand-agent-management-tools.ts 170 行） | agent-team 自述「Separate working directories, coordination across processes … are unsupported」（D/packages/experimental/agent-team/README.md:32），与 C2 ②「每个 bot 一个 workspaces/<botId>」冲突；subagent 子会话的 approvalPolicy 被钉成 never，P5-05 之后 ASK 一律拒绝，worker 什么升权都做不了；子会话也不是侧栏里的一等 bot |
| 代价 | 多出 Source / Policy / Eval / admission / 白名单 / SQLite stateDir 一整套**团队工单**概念，单用户私用基本是噪音；worker 免审批，直接撞 CLAUDE.md §4 安全反例（openclaw exec 默认不审批），也撞 P5 的 L-AP 档位表；1 个 commit 的原型不满足「在维护」，只能走第 3 级，**上游的修复我们拿不到**；superagent 的三段式只约束 IM Channel 回复，管不到我们的 transcript UI | 回合结束通知、去重、重启恢复这几处要我们自己写和测（SA 的 delivery.ts / runtime 可以复制改造）；新增 1 个插件约 6 个工具 | 改造量最小，但满足不了「每个 bot 都是 personal agent、各自独立工作目录、可以直接对话」 |
| 依赖 p5-parity 的成果 | 同 R2，另加：worker preset 要过 guard / shell-ask，必须改掉「免审批」 | **P5-25**（cwd 由 main 强制为 `workspaces/<botId>`：SDK 侧建 bot 必须走同一套分配规则）、**P5-21**（沙箱内 bash ALWAYS：后台 worker 不用每步弹卡）、**P5-28**（提问作答通道：worker 卡住时的提问要能答）、**P5-05**（子代理里 ASK 改拒：所以 worker 必须是完整 session，不能是 subagent）、**L-UI 0.18 移植路线**（Q-014：折叠渲染要做在新 renderer 上） | 同 R2 |

**选 R2，放弃 R1 的理由**：用户要的是 superagent 的**体验**（安静、后台、主动回报），不是它的**领域模型**（为团队在 GitHub / 飞书上接工单）。体验部分由提示词纪律和「回合结束通知」承载，这两样按第 3 级照样能拿到；而 R1 带进来的 Policy/Eval 层对单用户是负担，免审批 worker 违反安全底线，原型仓又拿不到上游维护，正好抵消了「搬运工优先」的初衷。R2 的工具语义直接对齐 Grok Bot 原版（G18），同时满足用户长期的「和原版一致」要求。**放弃 R3**：工作目录和审批模型都与已定稿的 C2 ②、P5-05 冲突。R3 的 Agent inbox 投递原语若 scout 证实可用，作为 R2 的底层复用（第 1 级），不算 R3。
**例外**：若 §9-Q1 用户答「要的是 (c) 主动盯事件源」，R1 的 Source 机制才有不可替代的价值，届时回到本节重选。本选择**须过 /panel D-route**（§10 D-1），R1 / R2 的取舍属于架构决定。

## 4. 死因预判（三个月后失败，最可能因为什么）

1. **模型不守规矩**：GLM 不调 send_message，用户什么都看不到；或者每一步都调，刷屏换了个形式又回来了。→ 防：UI 兜底（D2）；`send_message` 带 `kind: ack|result|question` 参数，每回合 ack ≤1、result ≤1，超出的调用由工具返回错误（SA 的 reply 工具也按 purpose 强制，SA/prompts/replies.md:1）；D3 用真模型测遵从率，不只用 fake。
2. **编排黑洞**：worker 在后台卡在审批卡或提问上，主 bot 傻等，用户只看到一句「收到」之后再没下文。→ 防：卡住状态和回合结束一样必须通知主 bot（D8）；L-AP 的 ALWAYS 档（P5-21）落地前，D8 是唯一的保障。
3. **借道提权**：bot 在 SDK 侧建 bot，绕过 main 对 cwd 的强制（C2 ②）；或者建出带 danger preset、带连接器的 bot。→ 防：create_bot 只接受 `{name, prompt}`，preset 固定为默认值、不带连接器，cwd 由与 P5-25 同一个分配函数给出；越权参数直接拒绝（D9）。
4. **递归失控**：A 给 B 发、B 再给 A 发，token 烧穿；或者主 bot 一口气建出十几个 bot，侧栏淹没。→ 防：协调者工具只给主 bot，worker 拿不到（深度 1）；同时运行的 worker 上限 3（D9）。
5. **老 bot 不生效**：preset 在建会话时就冻结了（SA/docs/003-execution.md:29 同一机制），已有 bot 和已有主 bot 拿不到新工具，用户感觉「没变化」。→ 防：§10 S-2(f) 先查 profile 级插件能否给已有会话加工具；不能，就与 P5-26 迁移合并处理，在 BRIEF 修订账中写明。
6. **透明度崩塌**：只看到两条消息，用户不知道 bot 干了什么，信任下降。→ 防：折叠而不删除，一键展开看到全部 tool 行（D1）。
7. **在要被替换的 renderer 上返工**：L-UI 已改为 0.18 前端 1:1 移植（Q-014），现在动 transcript 渲染等于白做。→ 防：UI 任务排在移植之后；0.18 renderer 很可能本来就按 SendMessage 渲染（§10 S-4），能搬就不写。

## 5. 核心旅程（≤3）

- **J1 派活不阻塞**：用户对主 bot 说「把 X 项目的测试跑一遍，失败的修掉」→ 主 bot 一条「收到：……打算……」→ 侧栏出现 worker bot（标「主 bot 创建」）并显示运行中 → 用户接着和主 bot 聊别的，有正常回复 → worker 结束 → 主 bot **主动**发一条结果，附 worker 链接。变体：「让『写作助手』写……」→ 发给已有 bot，流程相同。
- **J2 任意 bot 三段式**：用户给普通 bot 一个多步任务 → 默认视图是 ack 一条、「工作过程」折叠块一个、结果一条；问一个简单问题 → 只有一条回答。
- **J3 卡住有人管**：worker 遇到审批卡或提问 → 主 bot 发一条「X 需要你确认：……」并附跳转 → 用户到 worker 里作答 → worker 继续 → 结果回到主 bot。

## 6. DONE 条款（证据放 `work/p6-orchestration/evidence/`，每条都能被一条命令或一次浏览器操作证伪）

| # | 条款 | 证伪方式 |
|---|---|---|
| D1 | fake provider 脚本（send_message:ack → 3 次工具调用，中间夹 3 段 assistant 文本 → send_message:result）：默认视图**恰好 2 个**消息气泡，3 段中间文本不可见；点「工作过程」后 3 段文本和 3 个 tool 行全部出现 | e2e spec，按 DOM 计数断言 |
| D2 | 兜底：回合内没调 send_message → 最后一段 assistant 文本显示为 1 个气泡；同一回合第 2 次 `kind:ack` 或第 2 次 `kind:result` → 工具返回错误，界面不多出气泡 | e2e + SDK 单测 |
| D3 | 真模型遵从率（本地 LiteLLM GLM 5.3，Q-002）：固定 10 条提示（5 条多步任务 + 5 条简单问题），多步任务里 ≥4/5 满足「第一个工具调用之前有 ack，且恰好 1 条 result」；简单问题 5/5 只有 1 条可见消息；全部 10 条里，不计 question，每回合可见消息 ≤2 | `evidence/D3/run.mjs` 与结果 JSON，可重跑 |
| D4 | 主 bot 调 `create_bot{name,prompt}` → 10s 内 `session/list` 出现新 session：title=name、cwd = P5-25 规则下的 `workspaces/<id>`、默认 preset、无连接器；侧栏不重载即可看到；非主 bot 的工具列表里没有 create_bot | SDK e2e + UI e2e |
| D5 | worker 回合结束 → 5s 内主 bot 会话里**恰好 1 条**通知记录（`source.kind ≠ 'user'`，不渲染成用户气泡），随后主 bot 回合产出 1 条 result；worker 运行中重启 SDK → 重启后通知照样到，不丢、不重复 | SDK e2e（重启用例只停自己 spawn 的 SDK 子进程，见 CLAUDE.md §5） |
| D6 | worker 运行期间，用户给主 bot 发一条消息 → 主 bot 正常回复（主 bot 的回合不等 worker） | e2e 时序断言 |
| D7 | `send_to_bot` 发给已有 bot → 目标 transcript 出现一条标明「来自主 bot」的消息并开始一个回合；该回合结束同样触发 D5 的通知 | SDK e2e |
| D8 | worker 触发 ASK 审批卡或提问 → 5s 内主 bot 收到「卡住」通知，并发出 1 条点名该 worker 的消息；用户在 worker 里作答后，worker 继续直到结果回到主 bot | e2e |
| D9 | 安全边界：create_bot 带 preset / connectors / cwd 参数 → 拒绝；worker 的工具列表里没有协调者工具；同时运行的 worker 已有 3 个时，第 4 次 create_bot 返回错误；worker 继承全部 guard（NEVER 路径拒读，沿用 P5-06 矩阵的一个子集复跑） | SDK 单测 + e2e |
| D10 | `stop_bot` → worker 当前回合被取消（`turn/end reason=interrupted`），主 bot 收到一条「已停止」通知 | SDK e2e |

## 7. 非目标（放弃了什么、为什么）

- superagent 的 Source / Policy / Eval / admission / 白名单 / 飞书与 GitHub 事件源 / orchestrator 面板：团队工单模型，单用户用不上（§3）。§9-Q1 答 (c) 时再议。
- 非主 bot 之间互相编排（P2P SendToAgent）、多层委派：防递归（§4-4），第二批再说。
- 群聊（ROOM）、记忆（RecallMemory）、定时与自动化、steer（向运行中的回合插话）、云端 / 自有机器上的 worker：各自独立 slug。
- 改审批档位：沿用 P5 定稿的档位表（Q-013），本 slug 不放宽。

## 8. 与 p5-parity 的依赖和排期

- **现在就能开**：§10 的全部 scout / RE / panel；SDK 插件的 `send_message` 和 fake provider 测试（不依赖 P5）。
- **P5-25 合并后**：create_bot、send_to_bot、通知链路（D4–D7、D9、D10）。
- **P5-21 + P5-28 合并后**：D8 真实链路；在此之前用 fake 审批事件测通知本身。
- **L-UI 0.18 移植落地后**：D1 / D2 的 UI 部分，以及侧栏的「主 bot 创建」标记。
- 契约：新增工具的事件形状、BotsMeta 增加 `createdBy`、SDK 侧建 bot 的 cwd 规则，属于 C2（§10 D-2）。

## 9. 待用户确认（≤3，主会话一次问一个，按顺序）

1. **你说的「superagent 好很多」主要指哪种体验？** (a) 安静：收到+计划 → 结果，不刷屏；(b) 后台并行：交代完能接着聊，做完主动回报；(c) 主动性：自己盯 GitHub、飞书等事件源找活干。**默认 (a)+(b)**，走 R2；选了 (c)，才需要 superagent 原包（R1）。
2. **主 bot 建出来的 worker bot 放在哪？** 默认：侧栏可见，作为普通 bot，可以直接对话，带「主 bot 创建」标记（契合「每一个都是一个 personal agent」）。备选：收在主 bot 里面，只能经主 bot 查看。
3. **第一批只给主 bot 编排权？** 默认：是。其他 bot 都有三段式，但不能建 bot，也不能给别的 bot 发消息（防递归）。备选：全部 bot 都能互发。

## 10. 待查（主会话并行派；scout 结果写 `reuse/<能力>.md`，RE 写 `RE-<topic>.md`）

- **S-1 → scout · superagent 维护状况与可依赖性**：SA 仓 commit / release / issue 响应情况（本地只有 1 个 commit：是一次性导入，还是 GitHub 上另有活跃分支）；是否满足 CLAUDE.md「在维护」标准，能不能作第 1、2 级依赖；有没有其他在维护的项目在 dsh 上做 personal agent 编排。给出决策行。
- **S-2 → scout · dsh 跨会话原语（R2 的地基）**：(a) 跑在我们 web profile 里的 cordis 插件，能否对**另一个** session 调 sessionController create / prompt / cancel，并让消息的 `source.kind` 不是 `user`；Agent inbox 的 API（SA/src/app/delivery.ts:45-84 用法），对 idle 或冷会话是否会唤醒或冷恢复；(b) 插件内怎么订阅「某个 session 回合结束」和「审批 / 提问挂起」两类事件（用来做 D5、D8）；(c) 有没有 steer 模式（只调研，不进第一批）；(d) subagent 子会话会不会出现在 `session/list`，会不会污染侧栏；(e) agent-team 的 inbox 投递能否脱离 shared workspace 单独用；(f) **profile 级插件注册的工具，已有 preset 的旧会话能不能拿到**（死因 5）；按会话限制工具可见性的现成机制（D/packages/core/tools 的 restrict）。给出集成、改造、自建的决策行。
- **S-3 → scout · R1 在我们 profile 下的真实成本**（供 panel 对比，不代表会选）：SA bundle 能否通过 `--patch` 装进 start.ts 的启动链；我们 webserver 的 host 是否满足 :231 的字面要求；worker preset「免审批」与 guard / shell-ask / P5-05 叠加后实际是什么行为；写一个本地聊天 Source kind 的工作量估计。
- **S-4 → scout · G18 参照实现的可搬性**：`host/agents/agent-messaging.ts`、`host/runner/tools/sand-agent-management-tools.ts`、`sand-subagent-management-tools.ts`、`turn-toolset.ts` 中 SendToAgent / CreateAgent 的 schema、通知机制（`AGENT_INBOUND_WAKE_CUE = "[agent]"`，agent-messaging.ts:4）、代理目录提示词（`renderAgentDirectorySystemPrompt`），映射到 dsh 原语要改哪些；**G18 renderer 是否已经按 SendMessage 渲染、隐藏普通 assistant 文本**（如果是，随 L-UI 移植免费带来）。G18 无 LICENSE，仅私用，第 3 级。
- **RE-1 → reverse-engineer · 0.78.1 的 personal agent 交互**（目标：`/dev/shm/grok-re/0.78.1/app/`，解包按 RE-unpack §0 复现）：① 普通 assistant 文本是否对用户隐藏、只有 SendToUser 可见？渲染分支的锚点在哪？回合内没调 SendToUser 时怎么兜底？② CreateAgent / SendToAgent / MessageSubagent / CheckSubagent 的参数 schema，哪些 bot 拿得到（只有主 bot，还是全部）？③ worker 回合结束如何呈现给父 bot 和用户（通知条目类型、`[agent]` 唤醒标记、UI 卡片）？
- **D-1 → /panel D · 路线**：R1 / R2 / R3（§3）。材料：本 BRIEF §3 + S-1 / S-2 / S-3 回报。
- **D-2 → /panel D → 用户 C2 · 契约增量**：① `send_message` 的事件形状（沿用 tool/call 帧，还是新增帧类型）与 renderer 渲染规则；② BotsMeta 增加 `bots[id].createdBy`；③ SDK 侧建 bot 的 cwd 分配与 P5-25 共用一个函数（C2 ②的延伸）；④ 协调者工具只给主 bot 的判定方式（是 preset，还是运行时按 `mainBotId` 判定）。等 S-2 回来后出题。

## 修订账

| 版本 | 改了什么 | 依据 |
|---|---|---|
| v1 | 首版 | Q-017 |
