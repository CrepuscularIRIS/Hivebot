# G1-r1 · 席 A（Opus 5.5）· p3-contract CONTRACT v1.1

```
seat: A
verdict: REVISE
confidence: high
findings:
- [HIGH] §3.1 BotsMeta / #4 / #21 — J3×J4 的接口没有闭环：preset.ensure 需要 {agentPreset, connectors}，但 bots.json 只记 connectors，基础 preset 在建 bot 之后就没有地方能查到了；另外「由内容确定的 id」没有说清内容指什么，ensure 的幂等也没有落点 — 证据: app/sdk/src/p2temp/index.mjs:125-133（agentPreset 缺省为 'standard'，只拼进临时 preset 的 rows，不回写任何地方）；CONTRACT.md:73（BotsMeta.bots 条目只有 connectors?/runtime?）；registry index.ts:99（同 id 再 register 抛 `Duplicate agent preset`）；Q-008 仍是 open — 建议: 不管 Q-008 怎么答，现在就做三件事：① BotsMeta 条目加 `agentPreset: string`（基础 preset）；② #4 的临时 id 现在就改成由 (agentPreset, 排序后的连接器名) 派生，不用 rows 内容，否则 bundle 一升级 id 就变；创建前先查 definitions.has，有就跳过 register。这一步在 Q-008=B 时也没有坏处，在 Q-008=A 时能保住过渡期建的 bot。③ #21 只剩「启动时逐个 ensure」这一件事等 Q-008
- [HIGH] §2 M1 返回形状 — `error:{code,message}` 缺了 `details`，上游客户端要原样拿到 ConnectionRpcFailure 才能重建 RemoteError；契约又冻结了形状（改形状要过 QUESTIONS），P4 第一天就会撞上 — 证据: D/packages/client/connection/src/rpc.ts:19-28（failure 含 details:object）；D/packages/api/gateway/src/client/index.ts:458-461,870-871（rebuiltFailure 读 error.details）— 建议: M1 改为「原样返回 dsh 的 `result`（ConnectionRpcResult），main 不改写」，白名单拒绝时也按这个形状回 `{ok:false,error:{code:'pbots/forbidden',message,details:{}}}`
- [MEDIUM] §2 拓扑「main 直接复用 examples/lib/{client,mux}.mjs」不成立，两条通道都要改造 — 证据: mux.mjs:156-165 `rpc()` 遇到 !ok 抛 MuxError(JSON 串)，code 和 details 被压平（违背上一条）；mux.mjs:116-120 MuxSocket 遇到未知 streamId 的帧直接丢弃，renderer 的流过不了原帧桥；连接断开后没有自动重连（PLAN T-01.f1 只做到 finish）— 建议: 写成「复用 connect()，另加：raw result 版 rpc、MuxSocket 原帧 tap（未知 streamId 交给桥）、重连循环」，并按这三件估 P4 工作量
- [MEDIUM] §2 M2 main 行为 — 原帧桥只限制了 open.endpoint，没有限制 renderer 发出的 item/end/cancel 和 renderer 自选的 streamId。renderer 渲染模型输出（markdown 或 XSS 面），一旦失守，就能 cancel 或劫持 main 自己开在同一 socket 上的流 — 证据: GW/client/stream-client.ts:120,133（streamId 由客户端生成）；mux.mjs:133（main 的流同在一个 socket）— 建议: 补三条规则：① open 的 streamId 与现有流冲突时拒绝；② item/end/cancel 只放行经本 port open 过的 streamId；③ 下行帧只转发属于本 port 的 streamId。另外把「main 唯一 mux 客户端」改成「main 是唯一的物理 socket 和凭证持有者；renderer 是这条 socket 上的逻辑 mux 客户端」
- [MEDIUM] §2 M2 白名单 {session/follow,$events} — 读代码已经能确定不够：ClientSessions 每个 generation 都会开 session/control 流，这不需要等 spike 才知道 — 证据: D/packages/api/session-controller/src/client/index.ts:128-138（createSessionControlStream + connected() → control.start()）— 建议: v1.1 直接把 `session/control` 加进 M2，§7.4 只留真正未知的项
- [MEDIUM] §3.1「建 bot 成功后 renderer 立即调 #20」— #4 和 bots.json 两步写入不是原子的，中间崩溃或 renderer 重载就会留下一个没有 meta、无法恢复的连接器 bot；而且 M3 允许 renderer 任意写某个 bot 的 connectors，这在信任边界上多开了一个写口 — 证据: CONTRACT.md:23,48,75 — 建议: 由 main 拦截 M1 的 #4，成功后在 main 内写入 {agentPreset, connectors}；M3 patch 只保留 mainBotId，bots-meta 的 connectors 改成只读
- [MEDIUM] §7.1 只读态判定 — 现在靠 resume 失败后匹配 message 文本（code 是 gateway/internal），用户第一次发消息才知道失败，而且依赖文案 — 证据: VERIFY-T-15.md:10；CONTRACT.md:120 — 建议: 冷启动时 main 和 renderer 用 #1 agentPresets/list 对比 follow header.agentPreset，id 不在列表里就直接标只读，不用匹配文本，也不用先失败一次
- [MEDIUM] §7.4 spike — 方向对，但缺止损线和退路。B′ 能不能启动起来，到这里才第一次被真实验证（scout:139「最小服务闭包尚未通过真实启动测定」）— 建议: 写明 ① 时限（1 个工作日）；② 预先定好批量加行的判据：凭证/account/workspace 写/setIndexes 一律拒，其余列清单就批，免得这条 QUESTIONS 阻塞；③ 止损：闭包拖进 workspace-controller 这类深度绑定的供应者，或者白名单拒绝项超过约 30 个，就回 G1 评估 scout 决策表 :18 的第 3 级改造
- [LOW] #1 agentPresets/list — 建过连接器 bot 之后，roster 里会出现 p2temp-* 条目，ui-agent-preset 的选择器会把它们显示出来 — 证据: registry index.ts:210-213（list 返回全部 definitions）+ p2temp index.mjs:132（临时 preset 不注销）— 建议: main 在 M1 响应里滤掉 `p2temp-` 前缀
- [LOW] §2.1 installConnection — 没有写 `interactions:'answer'`。不传 location 时默认是 'none'，$events 和审批都会静默失效 — 证据: C/connection/src/client/index.ts:224 — 建议: 组装时显式传 interactions:'answer'
- [LOW] §7.5 品味项 — 成立（见正文）；建议在 bot 头部把锁定的配置显示为只读，并提供「用此配置新建」入口
reverse_take: 最可能的失败方式：P4 第一天的 spike 发现保留集要拖进一大片深度绑定的供应者，白名单一路补下去，最后 renderer 实际上能调动 dsh 的大半个 API。更笨更稳的办法：spike 先定时限和止损线；凭证类方法一律拒绝，这条不可协商；其余按清单一次批完。
```

## 正文

### 1. 完整性（4 旅程 + 审批 + 冷启动）
- J1、J2、A、J4 的接口闭环：J1 是 #1/#2/#3/#5/#6/#7/#8；J2 靠每个 bot 各开一条 follow 流（M2），#10 打断回合；审批是 #17/#18 加上 §4 的时序，补发由 T-15② 实测（events-replay 绿），不变式由 T-07 守护；J4 由 #9 + #8 snapshot + #11 + M3 覆盖。
- **J3×J4 不闭环**（HIGH-1）。即使 Q-008=A，现有数据模型也没法重新算出 ensure 需要的入参。
- 三条通道的形状大体自洽：M1 是 unary，M2 是原帧，M3 读写本地文件，分工清楚。缺口有三处：M1 少了 details（HIGH-2）；M2 缺 streamId 归属规则（MEDIUM）；M3 的 connectors 不该由 renderer 来写（MEDIUM）。
- 对照 §6 的 22 个云 RPC 去向表：没有发现漏映射。

### 2. carrier 接缝分歧：裁定支持 director（`transport.rpc.call` + `createWebSocket` 包 MessagePort），不注入 `rpc.open`
证据：
1. 上游明确把 `rpc.open` 定位为进程内载体（in-process carrier），而说浏览器类载体走 Gateway 自己的 WebSocket mux。`C/connection/src/rpc.ts:311-313`：「Open an in-process logical stream when the selected carrier supplies one. Browser transports omit this method; API Gateway owns their WebSocket mux.」`C/connection/src/client/index.ts:84-88`：`rpc` 用来接「an in-process Host such as a test mock」。`createWebSocket` 则是给 desktop / Node 认证 socket 准备的正式接缝（index.ts:114-115，socket.ts:42-47）。走 socket 工厂是上游的产品路径；走 rpc.open 走的是测试 mock 的路径。
2. 注入 rpc.open 之后，gateway 跳过 `streams.start()`，`onReconnectRequested` 也变成空操作（`GW/client/index.ts:172,177,182`）。RemoteStreamMuxClient 承担的那些语义（answer 客户端等待重连、uplink pump、abort 时发 cancel，见 stream-client.ts:65-70,102-160,241-295）就得由 main 和 IPC 层重新实现一遍。这违背搬运阶梯：能用上游的部分要用上游的。
3. 帧形状不变：上游 mux 客户端连上 socket 之后不发握手帧（stream-client.ts:241-295，直接 open/item/end/cancel），generation 由 `$events` 的 ready 驱动（remote-events.ts:78,118-127）。所以 M2 原帧桥只要提供 open/close/message 三个事件和 readyState 就够了，包装层大约 40 行。工厂是同步签名 `(url)=>ConnectionWebSocket`，先返回 readyState=0，等 invoke 拿到 port 之后再派发 open 事件，这和上游的重连路径相容。

安全边界：
- 两种方案都满足「renderer 不持凭证」：/connect 的 cookie 和 launch token 只留在 main（client.mjs:66-81），renderer 只碰到 MessagePort。也都满足「一个 API Peer 一条物理 socket」（rpc-host 409 约束）。
- director 方案多出一块攻击面：renderer 可以自选 streamId、可以发任意帧。scout 方案由 main 生成 streamId，天然没有这个问题。但这块面只需在 main 加三条规则就能封住（MEDIUM-4 的 ①②③），换来的是不用重写上游的重连和取消语义。
- 结论：选 director 的接缝，同时把三条归属规则写进 M2 的 main 行为，并把「main 唯一 mux 客户端」改为「main 是唯一的物理 socket 和凭证持有者」。
- scout:136 说要「不要只改 streamBaseUrl」，这一点两种方案都做到了，不构成分歧。

### 3. preset.ensure 标 pending Q-008
- 标 pending 本身是对的。用户在 Q-008 的答复确实没有回答 A/B（QUESTIONS.md:79-80），不能替用户定。
- 不妥的地方：契约把「内容确定的 id」也一起挂在 Q-008 上（CONTRACT.md:75）。这样一来，P4 在等待期间用计数 id 建的连接器 bot，以后就算 Q-008=A 也救不回来。而改成内容 id、在 bots.json 记基础 preset，在 B 下零成本，在 A 下是前提。这两项应该从 Q-008 里拆出来，现在就做（HIGH-1）。
- 内容 id 应该用 (agentPreset, 排序后的连接器名) 派生，不要用 rows 内容：rows 来自 bundle 的 patch 文件（p2temp index.mjs:86-108），bundle 一升级 rows 就变，id 跟着变，就对不上 header 里冻结的 id。
- 幂等要靠先检查 `definitions.has`，因为 register 遇到重复 id 会抛错（registry index.ts:99）。
- 只读态的判定改用 roster 对比（MEDIUM-7）。

### 4. §7.4 P4 首日 spike
- 风险管理的方向是对的：把整条路线最大的未知项（保留集能不能真正启动，scout:139 原话「最小服务闭包尚未通过真实启动测定」）放在 P4 第一天，失败也失败得早；白名单缺口一次合成一条 QUESTIONS，不逐条过，也合理。
- 不足有两点：
  - 有些「已知超出」其实读代码就能确定，比如 `session/control`（session-controller client index.ts:128-138）。这类应该直接写进 v1.1，不必留给 spike。
  - 缺时限、批量判据和止损线（MEDIUM-8）。没有止损线的话，spike 很容易变成白名单无限扩张，等于在 renderer 和 dsh 之间默认全透传，main 的白名单名存实亡。

### 5. 品味项：首轮后锁定 preset 和连接器，换配置就新建 bot
产品上成立：
- 上游本身就在首轮后锁定 preset（registry index.ts:364-369 的 `agent-preset/locked`）。连接器在本项目里就是 preset 组合的一部分（p2temp 用 base rows + connector rows 拼出临时 preset），锁连接器是同一条约束，不是额外加的限制。
- 「bot = 创建时定型的角色」这个心智对用户好理解；模型仍然可以随时换（#5），覆盖了最常见的调整需求。
- 代价是想给已有 bot 加连接器的用户会丢掉对话连续性。缓解：在 bot 头部把配置显示为只读并说明原因，再提供「用此配置新建」（LOW-11）。MVP 不需要更多。

### 其他核对（无问题）
- `$events` 补发、ready 先于补发、clientId 更新：已由 VERIFY-T-15 §② 和 gateway 源码佐证。§4「main 不缓存」成立。
- 多窗口时 streamId 原样透传会冲突，契约已经标为 ponytail 并给出升级路径，可以接受。
- §2.1 用同 SHA 的 workspace 集成、不用 npm latest，有 scout:17 的版本证据支撑。
