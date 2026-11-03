seat: A
vote: ②(a) · ③(a)，附带序列更正 · ④(b) · ⑤(a)，收窄为「main 常驻订阅 SDK 自有端点 + main 用 rpc 应答」
confidence: medium（S-2(f)(h) 尚未回报；④⑤ 都依赖它，下面写明条件）

## ② BotsMeta `bots[id].createdBy` → (a)
- 理由：D9② 的权限判定和侧栏标记共用一个真源；main 是唯一写者，与 C:24「BotsMeta 只由 main 写」一致。原版也把归属挂在父 agent 上（RE-sendmessage-ui §0-8：`GrokBotAgentTask.subagent_ids`），没有放在 runtime 侧另建映射。(b) 在 SDK 重启时会丢失，或者需要再设计一份持久化。
- 写序：P5-25 已经在调 dsh 之前生成 botId（feat/P5-25 `orchestrate.ts:80-85`），所以 `createdBy` 可以照「recipe 先于 session」（C:97）的做法**先落盘、再建会话**。崩溃最多留下一条没有对应 session 的 createdBy，list 会过滤掉它，不会留下「已建成却没有 createdBy、等同用户创建、不受容量与 send_to_bot 约束」的 worker。
- **最关键的坑**：#20 `patch({mainBotId})` 必须拒绝把 mainBotId 设成一个带 `createdBy` 的 bot。否则 worker 被提升成主 bot，拿到协调者工具，再委派深度 1 的约束失效。另外，换主 bot 后旧 worker 归属旧 id，新主 bot 发不了消息给它们。这一点要写进契约，作为已知行为（属可接受的孤儿，不迁移）。
- 次要：SDK 侧的 D9② 判定要跨进程读 bots.json。数据根不一致或文件读不出来时一律拒绝（与 P5-29 决策 13⑤ 同一口径），不能回退成「允许」。

## ③ worker cwd → (a) 无接口增量，但 B §4-3 / P6-10 的编排序列写错了，须更正
- 理由：feat/P5-25 已把 #3 `session/create` 和 #4 都改由 main 编排（`main/index.ts:108-109`，`orchestrate.ts:195-222`），cwd 统一为 `workspaces/<botId>`，客户端传入即拒（`CWD_DENIED`，:67）。create_bot 回到 main 后天然复用这一套，不需要新接口。
- **最关键的坑**：D4 要求「无连接器」，但 P6-10 写的是「putRecipe → createWithConnectors」，而 #4 会拒绝空 connectors（main `orchestrate.ts:72-76`；C §2.2:62）。正确路径是 **P5-25 的 #3 编排**（不写 recipe；不带连接器的普通 preset 冷启动后不会只读，C §7.1 的只读问题只出在 p2temp-* 上），再接 **#6 `session/rename`** 设置 title=name。rename 是第二步，不是原子的：失败时 worker 已建成但没有名字，需要规定是把它当成功处理（名字留空，工具结果带 warn），还是当作失败。

## ④ 协调者工具的判定 → (b) 运行时按 `mainBotId` 判定
- 理由：mainBotId 本来就是运行时可改的（#20），原版的主 bot 同样是客户端的 `mainAgent` store（`getMainAgent/setMainAgent`，RE §1.6 APP@245204），不是 preset。选 (a) 会让 preset 和 mainBotId 两个真源并存：用户在 #20 换主 bot 后，preset 跟不上，还把 P5-26 迁移拖进 1b 的关键路径（B 死因 9）。上游 tools 已有「scoped restriction」（`repos/deepseek-harness/packages/core/tools/src/index.ts:38-56`，events.ts:51），可以按作用域隐藏。
- 条件：S-2(f) 要证实这个 restriction 能按会话动态生效。如果只能在注册时确定，执行层拒绝仍然成立，但 D4/D9③「工具列表里没有」会失败，届时回到 (a) 重议。
- **最关键的坑**：执行时那一次判定才是权限真源，工具隐藏只是外观。必须**在每次调用时读当前的 mainBotId**，不能缓存插件加载时读到的值；读不出来就拒绝。否则 #20 换主 bot 之后，旧主 bot 在其进程生命周期内仍然能 create_bot 和 send_to_bot。

## ⑤ SDK→main 的 create_bot 通道 → (a)，收窄为：SDK 新增自有流端点，main 常驻订阅，main 经 rpc 回应答
- 事实：main 是纯客户端（`main/index.ts:196-205` 读 handoff 后连 SDK，`dsh/connect.ts` 只有 rpc 与 openStream），SDK 没有可以「调用 main 方法」的载体，所以 **(b) 不成立**，除非 main 新开一个监听端口，而那是一个新的鉴权面。现成的 `$events` 也走不通：waterfall 事件的白名单是上游编译期常量（`packages/api/remotes/src/remote-events.ts` `API_REMOTE_FORWARDED_EVENTS`，只有 approval/request 与 user-questions/request 两个 waterfall），借用它就得改上游，所以 (c) 走 $events 的路线不成立，除非 S-2(h) 找到别的通道。剩下的路是照 U-16 已有的模式（`m2-mux/index.ts:193-240` main 常驻 `$events` 订阅、每代 socket 重开）：订阅一个 SDK 插件自有的请求流，main 编排完后用一个 SDK 方法 `respond{requestId, result}` 回应答。
- sessionId 的返回方式：respond 的 ok 分支带回 `{sessionId}`，SDK 的工具 await 到它为止。错误码分四类，前三类即题干要求的越权参数、容量满、编排失败：`invalid-args`（越权参数，main 侧再校验一次，作纵深防御）、`capacity`（SDK 在发请求前就判掉，不进通道）、`orchestration-failed`（原样透传 #3 / #6 / 存储的 code），以及**第 4 类 `main-unavailable`**：没有 main 订阅者（UI 没开、重连间隙）时立即失败，不排队、不挂起。
- 在途语义：同意推荐的做法（SDK 重启时在途请求作废、占位释放、main 已建的 bot 保留并带上 createdBy，这一点由 ② 的先写序保证）。再补一条：**流断开不重放**。main 重连后新一代订阅收不到旧请求，SDK 在流关闭时把在途请求按 `main-unavailable` 失败处理；main 按 requestId 去重。
- **最关键的坑**：这个端点和 respond 方法必须是 **main 专用**的。不能进 M2_ENDPOINTS（`m2-mux/index.ts:15` 是 renderer 的转交白名单，现在恰好 3 个），也不能进 M1 白名单。SDK 侧还要把 respond 绑定到持有该请求流的 Peer（同「gateway 只认 active client」的口径）。否则 renderer 或任何拿到 cookie 的客户端都可以伪造应答，把任意 sessionId 当作「新 worker」回给主 bot。

## findings
- [HIGH] PLAN §2.2 P6-10 / BRIEF §4-3 — 编排序列「putRecipe → createWithConnectors」与 D4「无连接器」矛盾，#4 会拒绝空 connectors — 证据: `app/ui/main/m3-meta/orchestrate.ts:72-76`；CONTRACT §2.2:62 — 建议: 改成「P5-25 #3 编排（先写 createdBy）→ #6 rename」，并去掉 putRecipe
- [HIGH] D-2⑤ 选项 (b) — 没有载体，main 是纯客户端 — 证据: `app/ui/main/index.ts:196-205`、`dsh/connect.ts` — 建议: 删掉 (b)，或注明它需要 main 开监听端口，因此不推荐
- [HIGH] D-2⑤ 通道鉴权 — 题干没有要求通道只供 main 使用，存在伪造应答的风险 — 证据: `m2-mux/index.ts:15`、`m1-api` 白名单 — 建议: 写进契约：端点与 respond 不进 M1/M2 白名单，并绑定 Peer
- [MEDIUM] D-2② — 缺「mainBotId 不得指向 worker」这条约束 — 证据: CONTRACT #20（C:48）只校验 id 在 session/list 里存在 — 建议: #20 加拒绝条件，D9 加一格
- [MEDIUM] D-2④ — 判定读的 mainBotId 可能是缓存，换主 bot 后有窗口期 — 建议: 每次调用都读，读不出来就拒绝；加一格「#20 换主后旧主 bot 调 create_bot 被拒」
- [MEDIUM] D-2⑤ — 错误码缺 main 离线这一类 — 建议: 加 `main-unavailable`，立即失败、不排队

reverse_take: 最可能的失败方式是 create_bot 的应答通道被 renderer 或其他客户端伪造，或者 main 不在线时请求一直挂着，主 bot 卡死在一次工具调用里。更笨更稳的替代是：通道只供 main 使用，绑定 Peer，没有订阅者时立即失败，所有状态都先写 createdBy 再建会话。
