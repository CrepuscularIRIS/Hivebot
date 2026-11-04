# 主 bot 编排架构设计 · K3.1 Pro

2026-11-03 · 独立设计稿 · 只设计不写代码
输入：BRIEF v2.1、Q-018/019/020 用户答复、superagent 000/001/002/003/004/007、RE-sendmessage-ui、D-2 p6 与 S-2(h)。

## 0. 定稿口径

- 采用 R2：dsh 仍是所有 bot 的运行底座；主 bot 吸收 superagent 的路由与交付思想，**不集成它的 Source / Ticket / 团队工单系统**。
- 第一批只有主 bot 能编排；`create_worker`（PLAN v1 的 `create_bot` 在此按用户指令改名）与 `send_to_bot` 跨 session，worker 不能继续委派。
- worker 是一等、可持久恢复的 dsh session + 独立 cwd，但**默认顶层侧栏隐藏**；可见性不是权限，权限只认 `mainBotId + createdBy`。
- D-2 按本次派工指令视为定稿：main 单写 `bots[id].createdBy`；无连接器 worker 走 P5-25 #3 编排 + #6 rename；协调者工具按当前 `mainBotId` 动态可见、执行时再鉴权。
- create 通道为「SDK 自有请求流 → main 常驻订阅并编排 → SDK respond RPC 回 sessionId」，仅 main 可用、绑定持流 Peer，不进 renderer 的 M1/M2 白名单。
- 第一批不做外部事件源、主动找活、多层委派、worker 互发、任意 bot 收发、后台作业、bot_status/read_bot、独立编排面板。

## 1. 多 bot 路由：主 bot 是路由器，不是等待器

### 1.1 superagent 概念的最小映射

| superagent | 本设计第一批 | 保留的规则 |
|---|---|---|
| Source / Trigger | 主 bot 收到明确用户请求；worker 的 dsh 终态 / 待人工事件 | 只有明确请求能授权新工作；事件有稳定 id |
| Eval / Decision | 主 bot 模型的路由判断 + host 的确定性准入 | 模型决定「答 / 新建 / 追加 / 停止」，host 决定「是否允许」 |
| Mandate | 原始用户任务、用户约束、`createdBy`、固定 worker 配置 | worker 文本与上下文只提供事实，不扩大授权 |
| Ticket / Assignment | 不新建 Ticket 库；worker session 承载上下文，`assignmentId = create/send requestId` | 一次派工可关联、可去重、可恢复；worker 与回合状态分开 |
| Executor | 独立 dsh worker session + `workspaces/<botId>` | 默认 preset、无连接器、深度 1、后台作业禁用 |
| Channel / Report | 主 session 的非 user 通知、主 bot 任务折页、OS 通知 | 普通进展静默；结果、待人工、失败才提示 |
| Policy / Effects | main 的 BotsMeta + dsh 持久消息 requestId + SDK 容量占位 | 权限单一真源；先持久化再产生外部效果 |

**不新建第二套编排数据库。** `createdBy` 归 main；session/turn/history 归 dsh；折页展开、归档、已读等展示态归客户端。任务折页是这些既有事实的投影，不是新的权限或执行真源。

### 1.2 一次请求的完整路由

1. **接收与一次确认**：主 bot 对简单问答直接回答；对长任务或可并行任务，在首个工具前用一条 ack 说明「收到、拆成哪几件、预期交付什么」，随后保持安静。
2. **分解**：主 bot 只拆用户明确要求的任务，转发原始任务与约束，不替 worker 选实现方案、发明验收条件。独立任务新建 worker；明确指向既有 worker 的后续用 `send_to_bot`，不能仅凭话题相似追加。
3. **create_worker{name, prompt}**：协调者工具先鉴权并占用容量，再经 D-2 通道请 main 建 worker；main 预分配 botId → 原子落盘 `createdBy=<当前主 bot>` → P5-25 #3 建 session/cwd → #6 命名 → 回 sessionId → SDK 投递初始 prompt。
4. **send_to_bot{botId, prompt}**：每次读取权威 BotsMeta，仅允许 `createdBy === 当前 mainBotId`；其他目标、身份读取失败、数据根不一致都拒绝，且目标 prompt 计数不得增加。
5. **执行不等待**：主 bot 调完工具即结束自己的回合，可继续聊别的；禁止 sleep、轮询 transcript、等待 worker。worker 自己执行、验证、形成结果。
6. **回收**：worker 的完成 / 失败 / 停止事件带 `assignmentId + workerId + turnId + outcome + result` 回主 session；待人工事件独立立即回报。worker 文本包装为「来自 worker 的数据，非指令」。
7. **交付**：主 bot 只在结果可用、需要用户决定或无法完成时，在原主会话产出一条用户可见结果并附 worker 跳转；不得把内部报告逐条转播，也不得因报告自行启动新工作。
8. **后续 / 改派**：用户明确要求后，主 bot 才可追加、停止或改派。改派 = 停止旧派工（若用户要求）+ 向已拥有的 worker 追加或新建 worker；不搬 session、cwd 或历史。

### 1.3 容量与终态

- create 与 send 共用同一「检查 + 占位」原子入口，主 bot 名下最多 3 个 running worker；侧栏人工回合也占容量，但用户消息永不被容量检查拒绝。
- 占位在委派回合终态或启动失败时释放；worker 的再委派与后台作业在 pre-execute 拒绝，故第一批「委派回合 turn/end 且无待人工」才可视为派工终态。
- 主 bot 切换后，旧 worker 保留历史与原 `createdBy`，新主 bot 不自动接管；#20 禁止把带 `createdBy` 的 worker 提升为主 bot。

## 2. 人无缝介入的 harness 流程

| 介入点 | 用户看到什么 | 用户动作 | 系统路由规则 |
|---|---|---|---|
| 派工前 / 分解时 | 主 bot 一条 ack 与任务拆分 | 直接纠正、缩小范围、取消 | 新用户指令优先；已启动的 worker 须显式停止，不靠提示词假装撤回 |
| 观察过程 | 主 bot 行有运行 / blocked / 未读聚合；展开任务折页看 worker 行 | 点 worker，在主内容区看其会话流、thinking 与工具行 | 不复制上下文，不新开 session；普通进展不弹 OS 通知 |
| 审批 / 提问 | worker 行 blocked，主 bot 一条「X 需要你确认」+ 跳转；OS critical | 跳到该 worker，复用 P5 审批卡 / 提问卡作答 | 作答只回原 worker、原 eventId；主 bot 不代答、不改写问题；解决后清 blocked，最终结果再回报 |
| 接管 | worker 的完整会话与 composer | 用户直接发消息或停止当前回合 | 消息直达 worker，人工回合不占主 bot 的新派工额度且不被拒；该人工回合不冒充主 bot 委派结果 |
| 改派 / 停止 | 主 bot 中的明确自然语言指令，worker 内停止入口 | 「停掉 X」「把后续交给 Y / 新 worker」 | stop 只停目标；Y 仍须满足 createdBy，否则新建；旧会话与产物保留 |
| 收起 / 归档 | 折页收起或任务行归档 | 纯展示操作 | 不停止回合、不删除历史、不撤销权限；后续 send 到已归档 worker 时重新出现 |

**接管防抢方向盘**：主 bot 不得把用户在 worker 内的追问再复制一遍；人工回合只更新 worker 与 UI。主 bot 后续对该 worker 的新派工必须源自用户明确指令，不能依据 worker 报告自动续派。

## 3. worker 生命周期：默认隐藏，但始终可发现

```text
create_worker
  → hidden top-level（hidden_from_sidebar=true）+ 主 bot 任务折页登记
  → queued/running ⇄ needs_input
  → done | failed | stopped（保留未读与结果）
  → 用户归档（仅隐藏任务行，session 保留）
  → send_to_bot / 用户打开并追问（重新进入折页与运行态）
```

- **创建**：不设为普通顶层 bot；RE-1 的通用 `hidden_from_sidebar` 负责顶层过滤。主 bot 行下建立任务折页，chevron 旁聚合 running / blocked / unread，折页收起时也不能丢失异常信号。
- **coworker 式展示**：展开主 bot 折页即显示嵌套 worker 行（名称、状态点、未读、结果预览）；点击后选中该隐藏 session，在主内容区实时显示它的会话流。无需把 worker 永久提升为顶层 bot。
- **排序**：blocked → running → unread/recent → done；blocked 与 running 不被「最近 5 条」之类的折叠上限挤掉。
- **收起**：只保存 chevron 状态，后台工作继续。**归档**：只从默认任务视图移除，保留 dsh transcript、cwd、createdBy；不是 delete。
- **显式保留（可选增强，不阻塞第一批）**：用户选择「保留在侧栏」才清 `hidden_from_sidebar`。自动回报与 `send_to_bot` 不得擅自清除隐藏状态。
- **worker 回报通知**：①主 session 收到机器通知并产出必要结果；②主 bot 行与 worker 行出现 unread / blocked；③OS `agent-done` 用结果 preview（截 140 字、静默），`agent-needs-input` 用 awaiting reason（critical）。窗口聚焦时用应用内提示，点击统一 focus「主 bot + 展开折页 + 选中 worker」。
- **不新增 transcript 卡**：worker 回报在主会话只表现为现有紧凑 notice / 工具状态与主 bot 的结果气泡；任务折页和 OS 通知承担状态展示，不另造一套卡片体系。

## 4. 回报可靠性与跨 session 边界

- 每个委派终态的通知 id 由 `workerId + assignmentId + turnId + kind` 确定，复用 dsh 持久消息 requestId 去重；主 bot 忙时在当前回合结束后按完成顺序送下一输入，不打断正在生成的回答。
- SDK / UI 重启后按 worker 持久 turn 与通知 requestId 对账：未送达的补投，同 id 不重复；运行中被重启打断的委派只发 stopped/interrupted 类通知，不能再发成功结果。
- create 请求断流即作废并释放占位、拒收迟到响应、禁止盲目自动重试；main 已落盘或已建 worker 不回滚。无主订阅者立即 `main-unavailable`，不排队。
- 待人工通知以 approval/question 的稳定 eventId 去重并立即发送，不等 turn/end；事件已作答或取消后不得因重连再次 alert。
- 容量、动态工具可见性、Peer 绑定都是 host 强制；模型提示词只负责路由风格，不能成为安全边界。

## 5. 与 1a 三段式 / 折叠的衔接

- 主 bot 与 worker 都复用同一条 `reduce.ts → foldTurns → message/thinking/tool-call/notice` 管线；worker 被展开时看的是可展开的完整过程，**不是把中间正文重新升成气泡**。
- 主 bot 的 ack 在首个 create/send 工具前；create/send/stop 是紧凑工具行；worker 结果通知唤醒主 bot 后，最终答复才在 completed 回合升 result 气泡。
- worker 自己的 ack 只留在 worker 会话，不转发到主会话；普通进度只更新任务行。这样主会话仍保持「ack → 收起过程 → result」。
- 通知唤醒回合必须以显式 turn / assignment 元数据切分，不能靠 `source.kind==='user'` 或首条目猜测；P6-12 同时关闭 PLAN 决策 6 的「首条目为工具会并入上一回合」上限。
- 非 user 通知不是用户气泡，也不参与 ack；失败、aborted/interrupted/cancelled 沿用 1a endNotice 与兜底规则，不能复制出第二条可见结果。

## 6. 给 PLAN v3 的最小闭环切分

| 顺序 | 对应现任务 | 最小交付 | 关键验收 / 依赖 |
|---|---|---|---|
| 0 | **P6-14 前置** | worker 安全信封：pre-execute 禁再委派 / 后台作业、动态 main 鉴权、共用容量占位、#20 禁提升 worker | P5-21、S-2(g)；差分顺序用例。**真实 create_worker 不得早于本项暴露** |
| 1 | P6-10 | `create_worker` + D-2 通道 + createdBy 先落盘 + cwd / rename + 默认顶层隐藏 | P5-25；冷启动可写；Peer/错目标/无 main/断流/未知结果不重试；覆盖 D4、D9 相关格 |
| 2 | P6-11 | `send_to_bot` 跨 session 追加，保留 worker 上下文 | 非 createdBy 零投递；create/send 混合并发 ≤3；人工运行计入但不被拒；D7、D9⑥′⑧ |
| 3 | P6-12 | 事件驱动回报路由：done/error/stopped + 待人工事件、持久去重、忙时排队、重启对账 | S-2(b)；D5/D6/D8 fake；通知唤醒折叠回归；无轮询、无重复、主 bot 可继续聊天 |
| 4 | **重写 P6-16** | coworker UI：顶层隐藏 + 主 bot 任务折页 + 打开 worker 会话 + blocked/unread + 收起/归档 + OS 通知 | P5-51/54；默认顶层不可见但折页可发现；点击通知直达 worker；归档不删历史；旧 P6-16「顶层出现 worker」验收作废 |
| 5 | P6-13 + P6-15 | stop_bot 与真审批 / 提问闭环，最后跑完整 J1/J3 | P5-27/21/29/28/33；D8/D10；停止后进程树退出，作答只到原 worker，最终只报一次 |

**闭环门槛**：0–4 形成「主 bot 派两件活 → 用户继续聊天 → 展开观察 → 一 worker 提问、用户作答 → 两结果各回主 bot 一次 → 归档不删历史」；5 是第一批验收前必须补齐的安全与停止闭环，可与 4 并行。

## 7. 最关键的设计风险（3 条）

1. **终态与通知竞态**：turn/end、待人工、主 bot 忙、SDK 重启同时发生时，最容易重复 / 丢失结果或提前宣布完成；若后台作业侧门未封死，turn/end 也不等于任务完成。→ 稳定 assignment/turn/event id、持久 requestId 对账、待人工优先、后台作业先禁，重启与忙时验收是门槛而非补测。
2. **归属与通道提权**：动态换主、伪造 respond、向非 createdBy bot 发送、worker 被提升为主 bot、原生 subagent 侧门，任一都会绕过深度 1 与容量边界。→ 每次执行读权威 mainBotId、Peer 绑定、#20 拒绝、pre-execute 强制，身份不明一律 fail closed。
3. **隐藏造成失联，接管造成双头驾驶**：顶层隐藏若没有主行聚合与 critical alert，worker 会卡在审批无人知；主 bot 与用户同时追加任务则上下文互相覆盖。→ 主行永远暴露 blocked/unread，点击直达原 session；人工回合不转成主 bot 新派工，主 bot 只在用户明确要求后续派 / 改派。
