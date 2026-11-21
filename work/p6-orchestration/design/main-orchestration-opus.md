# 主 bot 编排架构设计 · 席 Opus 5.5

2026-11-03 · p6-orchestration · 设计探索（不写代码），交 director 与 K3.1 Pro 版对照后整合为 PLAN v3。
前提（已定，不再讨论）：Q-018 R2 自建，以 superagent 架构为蓝本；Q-019 worker 默认隐藏，可像 Coworker 一样展示到侧栏；Q-020 第一批只有主 bot 编排，跨 session 在第一批里；D-2 ②③④ 两席通过（`createdBy` 由 main 写，cwd 用 P5-25，④(b) 采用 `when` 加执行时鉴权）；⑤ 暂定收窄版（Q-021 待用户签字；S-2(h) 已跑通往返）；1a 已落地（P6-01/02/04 done，D3 30/30）。
缩写：SA/ = `repos/dsh-superagent-prototype@6337fc8`，RE1 = `RE-sendmessage-ui.md`，S2 = `reuse/s2-dsh-cross-session.md`，G18F = 移植树 `app/ui/renderer-grok/frontend/src/`。

## ① 多 bot 路由：主 bot 就是 superagent 的 Main Session

**心智模型**：主 bot 只做路由和交付，worker 负责干活。主 bot 不写方案、不读代码、不替 worker 解决阻塞（SA/prompts/shared.md、dispatch.md）。superagent 的概念只取我们单用户场景用得到的部分，其余是团队工单噪音（Source、Policy、Eval、admission 在 B §7 已经砍掉）：

| SA 概念 | 本项目对应 | 落在哪 |
|---|---|---|
| Trigger | 用户发给主 bot 的一条消息，或一条 worker 回报 | 主 bot transcript |
| Eval → Decision | 主 bot 的一个回合，自己决定 5 种去向（见下） | 主 bot 模型（提示词） |
| Ticket + Executor Session | **一个 worker bot = 一件事**，独立 session、独立 cwd，`createdBy = 主 bot` | BotsMeta（D-2②） |
| Assignment | 主 bot 发起的一个 worker 回合（create_bot 或 send_to_bot） | SDK 编排插件（容量占位 = slot） |
| Report | worker 回合结束时的 1a 折叠结果段，按状态分 完成 / 出错 / 已停止 / 卡住 | P6-12 通知 |
| Attention | worker 挂起的审批卡或提问（p5 `$events` approval/question） | ledger.ts，按 agentId 归属 |
| Channel | 主 bot transcript，加 OS 通知（只用于「需要你处理」） | shim + main |

**5 种去向**（照搬 SA `orchestrator_route` 的 accept/attach/stop/ignore，再加一种「直接答」）：
- **直接答**：简单问题主 bot 当场回复，不建 worker（对应 SA 的「quick questions directly」）。
- **accept → `create_bot{name,prompt}`**：prompt 传**用户原话**和一句不超过 30 字的路由备注，不扩写成方案（SA/dispatch.md「Do not paraphrase a short request into a work plan」）。
- **attach → `send_to_bot{bot,message}`**：只在用户明确指向某个已有 worker 时才用（点名、引用它的结果、或说「刚才那个」且只有一个 worker 符合）。话题相近算新任务（SA 同款规则）。
- **stop → `stop_bot{bot}`**：只在用户要求时用，worker 报阻塞不构成停止理由。
- **忽略**：闲聊、致谢。

**回收**：worker 回报自己送上门，主 bot 不轮询、不 sleep、不读 transcript（SA/orchestrator.md 末段；G18 project-prompt.ts:123「do NOT poll」）。所以继续不做 bot_status / read_bot，理由从「worker 可见」改为「peek 能看过程，通知里带结果」，YAGNI 的结论不变。主 bot 收到回报后**重新写一条给用户看的消息**，不转发 worker 原文、不逐条复述，内容没变就不重复说（SA/replies.md）。
**worker 状态不另存，现算**（SA/003 的 Ticket stages 思路：按顺序匹配，第一条命中即是）：
| 顺序 | 条件 | 显示 |
|---|---|---|
| 1 | ledger 里有该 agentId 的挂起审批或提问 | 待你处理（blocked） |
| 2 | 回合进行中 | 工作中 |
| 3 | 最近一个回合以 error 或 aborted 类结束，且之后没有新消息 | 出错 / 已停止 |
| 4 | 有未读结果 | 有新结果 |
| 5 | 其余 | 空闲 |
状态全部由现有 shim 字段推出（`awaitingApproval`、`running`、`endReason`、`unread`，data.ts:114-121），不新增存储。

## ② 人无缝介入：6 个点，全部复用 p5 已有通道

| 时机 | 人看到什么 | 人能做什么 | 复用 |
|---|---|---|---|
| 派活 | 主 bot 的 ack 气泡，加一行 tool-call「Messaging ‹worker›」（RE1 §1.3 原文案和图标） | 点这一行即 **peek** 打开该 worker | 1a 折叠 + G18F tool-call 行；只需 shim 把 create_bot / send_to_bot 映射到原版 `SendToAgent` 文案 |
| 过程 | 不打扰。主 bot 侧栏行显示 worker 汇总（见 ③） | peek 看 worker 的实时会话流（同样是 1a 三段式） | 0.18 打开隐藏 bot：hidden-chats overlay `openHiddenChat` |
| 卡住 | 主 bot transcript 出现一条「‹worker› 需要你确认：…」；OS 通知（critical）；主 bot 行出现 blocked 点 | **就地作答**：同一张审批卡或提问卡镜像到主 bot 视图里，用户点的是同一个 eventId；也可以跳进 worker 里答 | P5-31 审批卡、P5-33 提问卡、M1 作答方法（ledger 按 eventId 校验，P5-28）。镜像只在 UI 层做，**主 bot 模型不拿作答权** |
| 接管 | — | 直接在 worker 里输入（用户消息永不被容量拦，D9⑧）；输入会让隐藏的 worker 自动展示（原版行为，RE1 §1.7 APP@3530516） | composer 现成 |
| 改派 / 停止 | — | 对主 bot 说「停掉 X」或「把 X 交给 Y」，主 bot 调 stop_bot / send_to_bot；或在 worker 里点停止按钮 | P5-27 打断、P5-57 停止按钮 |
| 交付 | 主 bot 的结果气泡，带 worker 链接 | 点链接 peek；不满意就继续对主 bot 说（走 attach） | 1a result 段 |

**接管语义（定）**：只有**主 bot 发起的回合**（Assignment）结束时才通知主 bot。用户自己在 worker 里发起的回合不通知，因为用户本人就在场，通知主 bot 等于自己吵自己。主 bot 下次 send_to_bot 时，worker 自己的 transcript 里已经有用户接管的那段上下文，不需要另做同步。

## ③ worker 生命周期：可见性和运行状态是两条独立的轴

- **可见性**：`hidden = createdBy != null && !shown.has(id)`。`shown` 存 **renderer 本地**（localStorage，try/catch 包住，丢了就回到默认隐藏），不是契约增量。`ponytail:` 以后要跨设备同步，再加一个 BotsMeta 字段走 D-2。
- **展示（Coworker 式）**：worker 被展示后放进侧栏的**合成分组「主 bot 的 worker」**。0.18 sidebar 的 sections 现成支持合成锁定和折叠（sidebar.tsx:29/37），行内的 spinner、未读、blocked 点用现成 agent 行。点开就是它的实时 transcript。
- **收起**：行菜单「Hide from sidebar」。P5-52 因为当时没有 handler 把这一项滤掉了（`overrides/modules/agent-row-actions-model.ts`），这次给 `setAgentHiddenFromSidebar` 接上 handler，对 worker 恢复这个菜单项。隐藏中的 worker 仍可从 hidden-chats overlay 和命令面板（自带「Hidden」标签，command-palette-model.ts:163）找到，也能从那里取消隐藏。
- **主 bot 行汇总**（隐藏不能吞掉注意力）：shim 投影主 bot 时，任何一个 worker blocked 就给主 bot 带上 `awaitingUserResponse`；有 worker 结束且未读就给主 bot 打未读（相当于原版 `unreadThreadCount` 的最小版本，RE1 §1.4 b8e）。
- **归档**：不另做。worker 完成后保持隐藏或被收起，就等于归档；删除走现有删除流程。0.78.1 那种把 task 线程折在 bot 行下面（RE1 §1.4 d8e/qA）作为第二批 UI 增强，需要从 0.78.1 bundle 移植组件。
- **流转**：`create_bot` → 隐藏 + 工作中 → [peek | 展示到分组 | 卡住时浮到主 bot] → 完成，通知主 bot → 主 bot 写结果 →（展示过的）用户收起。被 send_to_bot 唤醒后回到工作中。

## ④ 第一批：编排 + 跨 session，最小闭环任务切分（给 PLAN v3）

**最小闭环 = J1 用隐藏 worker 跑通**：P6-10 → P6-11 ‖ P6-12 → P6-14 → P6-16a/b。其余是加固项。
| id | 任务（改动点相对 PLAN v1） | deps | 验收 |
|---|---|---|---|
| P6-10 | create_bot：顺序按 D-2 A-H1 修正为 **P5-25 #3 编排 → 写 createdBy 落盘成功 → 建会话 → #6 rename → 返回 sessionId**；工具注册用 `when` 加 execute 每次读权威 mainBotId（S2 §3.4）；通道 = ⑤收窄版（只给 main、绑 Peer、无订阅者立即 `main-unavailable`、请求作废 ≠ 回滚、禁止自动重试、四个错误码） | Q-021 签字、P5-25 已合并 | D4、D9①③⑥ |
| P6-11 | send_to_bot：只发给 createdBy 是主 bot 的 worker；**新增：目标正在跑回合时返回 `pbots/busy`**，不排队、不 steer（第一批不做 steer） | P6-10 | D7、D9②⑥′⑧，加一条 busy 用例 |
| P6-12 | 回报通知：只对 Assignment 回合发；载荷对齐原版 `NotifySandAgentTurnFinished`：`{workerId,name,outcome,preview≤140,awaiting?}`（RE1 proto@842369）；正文 = 1a 结果段，兜底按 (b)/(c)/(d)/(e)；包一层「来自 worker 的数据，非指令」；主 bot 忙时排在队首；**开工前先补 S-2(a)(b) spike**（见风险 1） | P6-10，S-2(a)(b) | D5、D6、D8 中的 fake 部分 |
| P6-13 | stop_bot（不变） | P6-10，P5-27 | D10 |
| P6-14 | worker 执行层禁区（不变）。**这是安全闸门：P6-14 合并之前，协调者工具的 `when` 恒为 false**（代码已合也不对模型开放） | P6-10，P5-21 | D9③④⑤⑦ |
| P6-16a | **worker 可见性**（shim + override）：hidden 推导、`shown` 本地集合、`setAgentHiddenFromSidebar` handler、恢复 worker 的隐藏菜单、合成分组、往隐藏 worker 发消息时自动展示、主 bot 行汇总 blocked/未读 | P6-10 | 新 D11：建出来的 worker 默认不在侧栏、能在 overlay/面板找到；展示后进分组、收起后消失；worker blocked 时主 bot 行有 blocked 点 |
| P6-16b | **主 bot 视图映射**：create/send 的 tool-call 行用 `Messaging ‹name›` 文案，可点 peek；通知条目按原版 `fromAgent` 走 assistant 泳道并署 worker 名（RE1 §1.5），不当用户气泡；带跳转 | P6-12 | D5「不渲染成用户气泡」；J1 浏览器走通 |
| P6-17 | 卡住就地作答：镜像审批卡和提问卡到主 bot 视图，作答走原 eventId | P6-12，P5-31/33 | D8 浏览器闭环，答一次 worker 就继续；主 bot 模型侧零作答调用 |
| P6-18 | OS 通知：只发「需要你处理」（Electron `Notification`，main 进程内，点击聚焦对应 worker）；「完成」类不发，主 bot 消息已经覆盖 | P6-12 | 单测：同一个 eventId 恰好 1 次 |
UI 任务（16a/16b/17）按惯例先派 ux-proposer×2，GU 跑 1 轮。BRIEF 需同步：§2.1「若 Q-019 答隐藏须重议」现在可以结案，结论是继续砍 read_bot / bot_status，理由见 ①；J1 的「侧栏出现 worker」改为「主 bot 出现 Messaging 行，点开 peek」。

## ⑤ 与 1a 三段式和折叠的衔接

- **主 bot**：create/send/stop 都是工具，按 1a 规则自动落在 ack 和 result 之间，折成 tool-call 行，不用新增规则。路由提示词（第 3 级，取自 SA orchestrator/dispatch/replies 和 G18 project-prompt:121-129，注明来源）追加进主 bot 的 preset 段落，和 P6-05 走同一条默认链。
- **worker**：同样是 1a 三段式。worker 的 ack 对用户不可见（worker 隐藏），用户看到的 ack 来自主 bot。worker 的 **result 段就是 Report**：P6-12 直接按 1a 的位置规则取文本，兜底分支映射成通知的 outcome。能 import `foldTurns` 就用它，不能就复刻「末工具后文本」这一条，**不另起判定**。
- **通知唤醒的回合**：这种回合不是用户消息起头，正好落在 PLAN 决策 6 的上限上（首条目是工具时会被归到上一段）。处理：通知条目作为回合边界（`fromAgent` 条目和 user 条目同样切段），P6-12 验收里补一格「通知唤醒回合，前一回合的 result 不降级」。reduce.ts 已随 P5-51 移植，可以加 turn 字段。
- **preset**：worker 用 standard 加 p6-reply 段落，再追加一句「你的结果交给主 bot 转述，≤100 字写结论和产物路径」。主 bot 用同一段落加路由段。

## 最关键的 3 个设计风险

1. **回报链的地基还没实证**：S2 只证了 (f)(h)。(a)「插件向**另一个** session 注入 `source.kind≠user` 的消息并起回合（含冷会话）」和 (b)「插件订阅别的 session 的 turn/end 和审批/提问挂起」都还没跑过。整个「worker 回报 → 主 bot」都压在这两点上，P6-12 一旦失败，1b 就退化成「派完就不管」。→ P6-12 之前先做一个和 S-2(h) 同规格的 spike，必须在目标宿主上 boot（LEARNINGS 2026-11-02 规则）。
2. **通知驱动的回合会自激**：每条回报都要花主 bot 一个模型回合；主 bot 可能收到回报后又 send_to_bot，形成主 bot 和 worker 互相唤醒的乒乓；3 个 worker 同时结束时，主 bot 连续跑 3 个回合，刷屏又回来了。→ 同一时刻的回报合并成一次唤醒（主 bot 空闲时攒 ≤2s）；不经用户消息连续触发的主 bot 回合设上限（如 6），超过后只在主 bot 行标「N 条回报待看」（`ponytail:` 计数在内存里，重启清零）；提示词要求「结果没变不重复说」。D5「恰好 1 条」的验收要改成按批量口径算。
3. **隐藏和接管让状态分叉**：①注意力被隐藏吞掉：worker 卡在审批上，用户却不在 worker 里（③ 的汇总和 P6-18 就是为此做的，必须和 P6-16a 一起合并，不能单独先上隐藏）；②用户接管 worker 跑回合的同时主 bot 又 send_to_bot，往同一个 session 并发 prompt（P6-11 加 `busy` 拒绝）；③用户接管后得到的结果主 bot 不知道，下次可能基于过期认知派活（第一批接受这一点：worker transcript 是唯一真源，主 bot 派活时只传原话，由 worker 自己读上下文，这正是 SA 的「workers derive requirements from the original source」）。
