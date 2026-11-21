# CONTRACT · Grok 风格前端 ⇄ P2 SDK

**v1.3 · G1-r2 有条件通过** · v1 2026-11-02 00:59 · v1.1 05:05 · v1.2 2026-11-02 · v1.3 2026-11-02 · director
输入：panels/D-route-r1{,-A,-B}.md、panels/G1-r1{,-A,-B}.md、p1-re/ARCH-0.78.md §4、RE-ipc-rpc.md §3.4、RE-marketplace.md §2–3、p2-sdk/PLAN.md §1、QUESTIONS Q-003/Q-007/Q-008/Q-009、`reuse/dsh-client-packages.md`（scout）、`VERIFY-T-15.md`。
锚点口径：`D/` = `repos/deepseek-harness@ce7073d`（与运行时 npm `0.2.2-alpha.2` 对照，PLAN §6 Q1）；`C/` = `D/packages/client`；`SC` = `D/packages/api/session-controller/src/index.ts`；`GW` = `D/packages/api/gateway/src`；T-15 测试 = `feat/T-15@a3758e0:app/sdk/tests/e2e/{connector-restart,events-replay}.test.ts`（尚未合入 main）。改动本契约里的任何接口形状 → 写 QUESTIONS（契约类），不得在 P4 任务里就地改。

## 1. 范围
| 旅程 | 页（B′ 4 页封顶） | 完成即可证伪的一句话 |
|---|---|---|
| J1 建 bot（选 preset/模型/连接器）→ 发消息 → 流式回复 | bot 列表、会话流 | 两个 bot 用不同 preset 建成，各自回复逐 chunk 出现 |
| J2 多 bot 并存与切换（MVP：bot:session = 1:1） | bot 列表、会话流 | A 在流式输出时切到 B 发消息，A 的流不中断、不串线 |
| J3 市场浏览 → 安装 → 建 bot 时启用 → bot 调工具 | 市场、会话流 | 只有选了该连接器的 bot 能看到并调用它的工具 |
| A 审批往返（J3 与普通 shell 共用） | 会话流（审批卡 + tool-call 行） | 拒绝后命令不执行；批准后执行；只对发起它的 bot 生效 |
| J4 冷启动恢复 bot 列表与历史 | bot 列表、会话流、设置 | 退出重开后 bot 列表、主 bot、各 bot 历史都还在 |

## 2. 接口表（renderer → main → SDK）
**拓扑**：renderer 不联网、不持 token。main 是**唯一的物理 socket 与凭证持有者**：持 launch token（`app/sdk/src/start.ts:41,62` handoff），以 `interactions=answer` 走 `/connect`，开**一条** mux socket（一个 API Peer 只能 claim 一条，第二条 409，`D/packages/client/connection/src/rpc-host.ts:70-101`）；renderer 是这条 socket 上的逻辑 mux 客户端。
**main 桥是专用模块，不直接复用 `examples/lib`**：只复用 `client.mjs:66-81` 的 `connect()`（/connect + cookie）；另写三件（P4 按此估工作量）：① raw-result 版 rpc，返回 dsh 的 `body.result` 原样（`mux.mjs:156-165` 的 `rpc()` 遇 !ok 抛 JSON 串，code/details 被压平）；② 原帧 tap socket，未知 streamId 的帧交给 M2 桥（`mux.mjs:116-120` 会丢弃）；③ 断线重连循环。`examples/lib` 保持为 P2 测试替身，不改。
**3 条 IPC 通道（都是需新增的 main 桥）**：renderer 用上游 `RemoteStreamMuxClient`（接法见 §2.1）；M2 的 streamId 原样透传，前提是只有一个 renderer 窗口（ponytail：开多窗口时 main 改成按窗口重映射 streamId）。
| 通道 | renderer 侧形状 | main 行为 | dsh 锚点 |
|---|---|---|---|
| M1 `pbots:api` | `invoke({method, args})` → dsh 的 `ConnectionRpcResult` **原样**：`{ok:true,value}` \| `{ok:false,error:{code,message,details}}`（`C/connection/src/rpc.ts:19-28`；上游 `rebuiltFailure` 读 `details`，`GW/client/index.ts:458-461,870-871`） | ① method 不在白名单 → `{ok:false,error:{code:'pbots/forbidden',message,details:{}}}`；② 参数约束（§2.2）不过 → 同形状，code `'pbots/invalid-args'`；③ 通过后调 `POST /api/<method>`，返回值不改写（唯一例外：#1 过滤，见表）；凭证/account 类 remote 一律拒，不可协商 | `rpc-host.ts:304-347` |
| M2 `pbots:mux-port` | 每次上游 `createWebSocket(url)` 换一个 MessagePort，跑 dsh mux wire 原帧（`open/item/end/cancel` ↔ `item/error/end`）；转交时序见 §2.3 | open.endpoint ∈ {`session/follow`,`$events`,`session/control`}；streamId 归属三条：(a) open 的 streamId 与 socket 上任一现有流（含 main 自己的）冲突即拒；(b) 上行 item/end/cancel 只放行经本 port open 过的 streamId；(c) 下行帧只转给拥有该 streamId 的 port；port 关闭 → 对本 port 的每个 streamId 发 `cancel`；socket 断开 → 关闭所有 port，重新 `/connect` 就绪前不转交新 port | `GW/stream-protocol.ts:234-257`；`GW/stream-server.ts:161-163`；session/control 读码已定必需：`D/packages/api/session-controller/src/client/index.ts:128-138`、`client/transport.ts:115-122` |
| M3 `pbots:bots-meta` | `invoke({op:'get'})` → `BotsMetaView`；`invoke({op:'patch', mainBotId})` → `BotsMetaView` | 读写 `$PBOTS_DATA_DIR/bots.json`（§3），原子写（tmp + rename）；renderer 只能写 `mainBotId`，recipes 只由 main 在 #4 编排里写 | 无（main 本地） |

**业务接口（M1 = /api unary，M2 = mux stream，M3 = main 本地）**
| # | 旅程 | 端点 / 操作 | 通道 | 入参 → 返回（要点） | 来源 | 锚点 |
|---|---|---|---|---|---|---|
| 1 | J1 | `agentPresets/list` | M1 | → preset 名单 + defaultId；main 滤掉 `p2temp-*`；Q-009（`danger-full-access` 是权限 preset，不在本表过滤）处置见 §8 第 3 条 | 复用 dsh | `D/packages/preset/agent-preset-registry/src/index.ts:210` |
| 2 | J1 | `session/modelCatalog` | M1 | → 可选模型 | 复用 dsh | `SC:340` |
| 3 | J1 | `session/create` | M1 | `{cwd, agentPreset}` → `{sessionId}`（不带连接器时用） | 复用 dsh | `SC:303`；types.ts:265-274 |
| 4 | J1/J3 | `p2temp/session.createWithConnectors` | M1（main 编排，§3.1） | `{connectors:string[]≥1, agentPreset?, cwd?}` → `{sessionId}`；preset id = `presetIdOf(agentPreset, connectors)`；registry 已有该 id 则跳过 register（`Duplicate agent preset` 也视为已存在，registry `index.ts:99`） | **P2-TEMP** | `app/sdk/src/p2temp/index.mjs:124-137` |
| 5 | J1 | `session/selectModel` | M1 | `{sessionId, model…}`，只对本 session 生效 | 复用 dsh | `SC:313` |
| 6 | J1 | `session/rename` | M1 | `{sessionId, title}`；bot 名 = title 投影 | 复用 dsh | `SC:433`；`D/packages/session/session-title/src/index.ts:269` |
| 7 | J1 | `session/prompt` | M1 | `{requestId, sessionId, mode:'queue', content:[{type:'text',…}]}` → receipt；`requestId` 客户端生成，重发靠它去重 | 复用 dsh | `SC:464`；types.ts:321-329 |
| 8 | J1/J2/J4 | `session/follow` | M2 | `{request:{address:{kind:'session',sessionId}, assistantStream:true}}` → 帧见 §3.3 | 复用 dsh | `SC:606`；`D/.../session-controller/src/web/controller.ts:32-76` |
| 9 | J2/J4 | `session/list` | M1 | `{cursor?}` → `{items:SessionSummary[]}` | 复用 dsh | `SC:278`；types.ts:151-164 |
| 10 | J2 | `session/cancel` | M1 | `{sessionId…}`，打断当前回合 | 复用 dsh | `SC:516` |
| 11 | J4 | `session/events` | M1 | 分页取 follow 快照窗口之外更早的历史（`hasMore`） | 复用 dsh | `SC:539` |
| 12 | J3 | `pluginMarket/listIndexes` | M1 | → 已配置的目录源（profile `market.yml` 配，renderer 不可写） | 复用 dsh | `D/packages/boot/plugin-market/src/index.ts:179` |
| 13 | J3 | `pluginMarket/search` | M1 | `(url, {query, offset…})` → 条目分页 | 复用 dsh | 同上 :228 |
| 14 | J3 | `pluginMarket/readEntryDetail` | M1 | `(url, name, version, language)` → 详情 | 复用 dsh | 同上 :285 |
| 15 | J3 | `pluginManager/installBundle` | M1 | `(spec, {enabled:false})`：只装不全局启用，启用走 #4；main 强制（§2.2） | 复用 dsh | `D/packages/boot/plugin-manager/src/index.ts:873,1002`；types.ts:195 |
| 16 | J3 | `pluginManager/listBundles` | M1 | → 已装 bundle（建 bot 时的连接器候选） | 复用 dsh | 同上 :488 |
| 17 | A | `$events` | M2 | `{}` → `ready{clientId}` / `waterfall` / `cancel` / `emit`；每次 open 都补发全部未决项（§4） | 复用 dsh | `GW/stream-protocol.ts:10-75`；`GW/index.ts:574-589,1242-1247` |
| 18 | A | `$events/result` | M1 | `{clientId, eventId, outcome:{kind:'result', value:ApprovalOutcome}}`；main 校验（§2.2） | 复用 dsh | `GW/stream-protocol.ts:13,98`；`GW/index.ts:497` |
| 19 | J1/J4 | `bots-meta.get` | M3 | → `BotsMetaView` | **需新增** | — |
| 20 | J1/J4 | `bots-meta.patch` | M3 | 只设主 bot：`mainBotId` 必须是 `session/list` 里存在的 id | **需新增** | — |
| 21 | J3×J4 | `p2temp/preset.ensure` | main 内部（不进白名单） | `{agentPreset, connectors}` 幂等，id 用与 #4 同一个 `presetIdOf`；main 启动时按 `recipes` 逐个调用，全部完成前 M1/M2 不就绪 | **P2-TEMP · pending Q-008（只有本行的实现等 Q-008；数据模型与 #4 的 id 算法已定稿）** | VERIFY-T-15 ① |
不进白名单（YAGNI，P4 用到再加，加行须过契约问题；P4 spike 的批量加行见 §7.4）：`agentPresets/select`（首轮前才能调，`registry index.ts:364-369` 的 `agent-preset/locked`）、workspace/*、session/fork、pluginManager 的其余方法、`setIndexes`、一切 credentials/account 类 remote。

### 2.1 renderer 组装（第 2 级集成，`reuse/dsh-client-packages.md` 决策行 :167）
- **依赖方式**：git submodule 接入 `repos/deepseek-harness@ce7073d` 到 `app/ui/vendor/deepseek-harness`（repos/ 只读未 build，submodule 内 build），workspace 引用其 `packages/client/*` 与 `packages/api/*/src/client` 浏览器半部，原样不改。不用 npm latest：npm 上 web=`0.0.1-rc.1`、ui-chat=`0.1.2-alpha.2`，与已核实源码 `0.2.2-alpha.2` 不一致（scout :17）。**保留**：浏览器 Cordis、模块表（`C/web/src/platform.ts:8-15`）、SlotRegistry（`C/ui-renderer/src/client/index.ts:89-96`）、store、ClientSessions 对象层（`D/packages/api/session-controller/src/client/index.ts:98-148`），以及 ui-session / ui-conversation / ui-chat / ui-approval / ui-tool / ui-plugin-market + ui-plugin-manager / ui-agent-preset / ui-model-selection。
- **替换**（用外部插件和包装层）：root/layout 产品壳、bot 导航、品牌 slot（替换 `ui-brand-official`）、theme 插件（Grok 的颜色/间距/字体映射成 `--dsw-*` token，图标按 id 替换 sprite，`C/ui-theme/src/client/index.ts:72-96`），以及 Connection carrier。
- **carrier 映射（G1-r1 两席支持）**：`installConnection` 显式传 `interactions:'answer'`（不传 location 时默认 `'none'`，$events 与审批会静默失效，`C/connection/src/client/index.ts:232`）。`transport.rpc.call('/api', endpoint, {args})` → M1 `invoke({method:endpoint, args})`（`C/connection/src/client/rpc.ts:295-309`；`GW/client/index.ts:458`）。不提供 `transport.rpc.open`（上游定位为进程内载体，`rpc.ts:311-313`），gateway 继续用 `RemoteStreamMuxClient`（`GW/client/index.ts:171,240-245`），其 socket 由 `transport.createWebSocket` 造（§2.3 的包装对象，`C/connection/src/client/socket.ts:12,47`；`index.ts:113,273`）。不改 `streamBaseUrl`，不设 `ownsHost`。
- **bot 导航在产品壳自建**：dsh 的会话列表在 `ui-workspace`（深度绑定 workspaces/directoryPicker，`C/ui-workspace/src/client/index.ts:103-142`），是 session browser，不是 bot roster。bot 列表页 = 产品插件，数据取 #9 + #19，动作复用 ClientSessions（打开/rename），不把 bot 伪装成 workspace。**包分档**：`packages/client/` 共 69 包 = 可直接复用 4 / 需适配壳 24 / 深度绑定 41（scout §1）。chat 硬依赖 sidebarRight/fileDrag，conversation 依赖 fileUpload，uiSession 依赖 remoteAccess（scout :137），这些供应者照常装载，不用空 stub。不加载：ui-settings-account、ui-settings-models、ui-settings-web-search（凭证类）、product-analytics。**ui-plugin-manager 的「安装并启用」**：上游会传 `enabled:subject.selection`（`C/ui-plugin-manager/src/client/manager-store.ts:1277-1280`），产品壳须固定为 false 并隐藏该选项，否则按 §2.2 被拒。

### 2.2 main 参数约束（不靠隐藏按钮守边界）
- `pluginManager/installBundle`：`args[1]` 必须是对象且 `enabled === false`；省略、`true`、非布尔一律拒（`plugin-manager index.ts:1002`：`enabled !== false` 即启用）。
- `$events/result`：`outcome` 必须恰为 `{kind:'result', value:'allowed-once'|'rejected'}`；`clientId` 必须等于本 renderer 当前 `$events` 流 ready 帧里的值；`eventId` 必须是该流已下发、尚未 `cancel` 的 waterfall 的 eventId（main 在原帧桥上旁听这两类帧即可）。
- `#3/#4`：`agentPreset` 不得是 #1 过滤掉的 preset；`#4` 的 connectors 须为非空字符串数组（与 `normalizeConnectors` 一致，`p2temp/index.mjs:46-56`）。**P4 验收必含拒绝测试**（都断言 dsh 未收到调用）：① installBundle 省略 enabled；② installBundle `enabled:true`；③ `$events/result` 的 value 为非允许值（如 `'allowed-always'`）或 clientId/eventId 不匹配。

### 2.3 M2 端口转交时序（Electron `invoke`/`send` 不能转移 MessagePort，只有 `postMessage` 能，见 electronjs.org/docs/latest/tutorial/message-ports）
```
页面 createWebSocket(url) ─同步返回包装对象 W（readyState=0）─preload 桥─▶ ipcRenderer.send('pbots:mux-port', {requestId})
main 等 socket 就绪 ─▶ new MessageChannelMain()，port1 留 main 接原帧桥 ─▶ event.sender.postMessage('pbots:mux-port', {requestId, ok:true}, [port2])
  （失败：postMessage(…, {requestId, ok:false, error}) 不带端口）
preload 收到 e.ports[0] ─▶ window.postMessage({pbotsMux:requestId}, location.origin, [port]) ─▶ 页面校验 event.source===window 与 requestId
  ─▶ W 绑定 port：start() → readyState=1 → 派发 open；W.send(text)=port.postMessage(text)；port message → W 派发 message{data}
W.close()/页面卸载 ─▶ port.close() ─▶ main port1 'close' ─▶ 对本 port 的 streamId 全发 cancel
失败或超时（10 s）─▶ W readyState=3，派发 error 再 close；迟到的端口立即 close
dsh socket 断开 ─▶ main 关闭全部 port1 ─▶ W close ─▶ 上游 RemoteStreamMuxClient 自行重连，新一轮 createWebSocket
```
包装对象约 40 行：只实现 open/close/message/error 事件、readyState、send、close（上游连上 socket 后不发握手帧，`GW/client/stream-client.ts:241-295`）。

## 3. 数据模型
**3.1 Bot（renderer 视图，由 main 和 dsh 两处拼成，不另建存储）**
```ts
type Bot = {
  id: SessionId            // = dsh sessionId（MVP 1:1；以后要 1:N 就改成 sessionIds，属于契约问题）
  name: string             // session-title 投影（#6）
  preset: string           // 普通 bot = follow header.agentPreset（types.ts:439）；p2temp bot = recipes[header.agentPreset].agentPreset
  model?: string           // model-selection 投影（D/packages/core/agent/src/model-selection.ts:14-23）；#5 随时可改
  connectors: string[]     // = recipes[header.agentPreset]?.connectors ?? []
  readOnly: boolean        // header.agentPreset 以 p2temp- 开头，且无 recipe 或 recipe.live=false
  mainBot: boolean         // = (id === meta.mainBotId)
  runtime: 'dsh' | 'superagent'  // 缺省 'dsh'；MVP 只出现 'dsh'（§5）
  running: boolean; updatedAt: number   // SessionSummary
}
type Recipe = { agentPreset: string; connectors: string[] }   // connectors 规范化：去重、按码点排序
type BotsMeta = { version: 1; mainBotId: SessionId | null; recipes: Record<PresetId, Recipe>; bots: Record<SessionId, { runtime?: 'superagent' }> }
type BotsMetaView = BotsMeta & { recipes: Record<PresetId, Recipe & { live: boolean }> }  // live = 该 id 当前在 registry 里（main 用未过滤的 #1 判定），不写盘
```
- **`presetIdOf(agentPreset, connectors)`** = `'p2temp-' + sha256(JSON.stringify([agentPreset, 规范化 connectors])).slice(0,12)`，放在 `app/sdk/src/p2temp/preset-id.mjs`，p2temp（#4/#21）与 main 共用这一个模块。不用 rows 内容派生：rows 来自 bundle 的 patch 文件（`p2temp/index.mjs:86-108`），bundle 一升级 id 就会变、对不上 header 里冻结的 id。单测：连接器换序同 id、基础 preset 不同则 id 不同。
- **agentPreset 单点解析（§8 第 2 条）**：agentPreset 由 main 唯一显式解析（缺省 → #1 的 defaultId）后下传；p2temp 与 presetIdOf 拒绝缺省输入。
- **#4 由 main 编排**（renderer 只发一次 M1）：main 校验参数 → 算 presetId → **先**原子写 `recipes[presetId]`（同 key 同值，重复写无害）→ 调 dsh #4 → 原样返回。recipe 先于 session 存在，所以任何时刻崩溃或重载都不会留下「有 session、无配方」的 bot。验收：在 recipe 已写、#4 未返回时重载 renderer，重开后该 bot 带连接器显示。
- **只读态判定**：冷启动时用 roster 比对（`BotsMetaView.recipes[*].live` + header.agentPreset），不匹配错误文案，也不必先发一次消息失败。按 v1.2 改造前的 #4 用计数 id（`p2temp-N-xxxxxx`）建的 bot 没有 recipe，永久只读。

**3.2 Session**：dsh 原生 `SessionSummary`（types.ts:151）和 `SessionWireHeader`（types.ts:429）。持久化、重启存续和断线补齐都由 dsh 承担（PLAN 决策 6，T-06 已验）。**3.3 事件族 = follow 帧**（`SessionFollowFrame`，types.ts:554-563）
| 帧 / 事件 | wire 形状（T-06 实测：user/message 平铺、assistant/message 嵌套） | UI 用途 | 锚点 |
|---|---|---|---|
| `snapshot` | `{type, header, cursor, records[], hasMore, projections, assistantStream?}`；records 与增量同形 | 打开 bot / 重连 / 冷启动 | types.ts:554-562；`client.mjs:13-22` |
| `event: user/message` | `event.data = {id, role, content, source:{kind}}`，只把 `source.kind==='user'` 的显示为用户气泡 | 用户气泡 | `D/packages/core/session/src/types.ts:315`；`app/sdk/tests/e2e/restart.test.ts:101-125` |
| `event: assistant/message` | `event.data = {turn, step, message:{…}, stream, usage?, interrupted?}` | 定稿气泡（替换实时流） | types.ts:349-357 |
| `assistant-stream` | `{type:'assistant-stream', frame:{type:'start'\|'chunk'\|'end', attemptId, …}}`，仅本进程，不重放 | 逐 chunk 实时文本 | `D/packages/core/agent/src/runtime-types.ts:154-188` |
| `event: tool/call` / `tool/result` | `{callId, name, arguments(原始 JSON 串)}` / `{message:{toolCallId, isError?}, error?, meta?}` | tool-call 紧凑行（按 callId 配对） | types.ts:369,383；`D/packages/llm/llm/src/message.ts:173-179` |
| `event: approval/asked` / `approval/decided` | `{id, toolName, callId?, reason?}` / `{id, outcome}`，只作审计 | 审批卡的历史态 | `D/packages/interaction/user-approval/src/types.ts:44-58` |
| `event: turn/start` / `turn/end` | `{turn}` / `{turn, reason:{kind:'completed'\|'interrupted'\|…}}` | 运行态、结束 | types.ts:294,303 |

## 4. 审批协议（时序）
```
renderer 启动 ─M2 open $events─▶ main socket（interactions=answer）─▶ dsh ─▶ item {type:'ready', clientId}   ← renderer 与 main 都记下 clientId
bot X 的模型发 bash ─▶ tools/pre-execute（app/sdk/src/policy/shell-ask.mjs，普通 shell 必问）
  ─▶ session.append approval/asked{id,toolName,callId}（user-approval index.ts:252）─▶ follow(X) 收到审计事件
  ─▶ waterfall 'approval/request'（index.ts:307；转发白名单 D/packages/api/remotes/src/remote-events.ts:28）
  ─▶ $events item {type:'waterfall', event:'approval/request', eventId, agentId=X 的 sessionId, request:{toolName, callId?, reason?, displayReason?}}
renderer：按 agentId 把卡片放进 bot X 的会话流，按 callId 挂到对应的 tool-call 行下
用户点击 ─M1 $events/result {clientId, eventId, outcome:{kind:'result', value:'allowed-once'|'rejected'}}（main 按 §2.2 校验）─▶ dsh
  ─▶ approval/decided{id,outcome} ─▶ follow(X) ─▶ 执行（或给出拒绝结果）─▶ tool/result
撤销：回合被打断或取消 ─▶ $events {type:'cancel', eventId} ─▶ 卡片移除；decided.outcome='cancelled'
重连/重载 ─▶ port 关 → main 对 $events 发 cancel → gateway 摘掉该 client 的投递，pending 保留（GW/index.ts:729-737）
  ─▶ 重新 open $events ─▶ 新 clientId；ready 之后立即补发全部未决 waterfall（:574-589，无 cursor）
无人应答 ─▶ fail-closed 'unavailable' = 拒绝（ext-mapping.md:33）；与「断连期间 pending 保留、重连补发」的边界（宽限/超时）列为 P4 验收项
```
不变式（T-07 已验，`app/sdk/tests/e2e/approval.test.ts:245-338`）：批准绑定在 eventId 上，Y 的批准放不了 X 的调用；默认 policy 是 ask，不是 bypass。renderer 只发 `allowed-once`/`rejected`（`ui-approval` 的 `onAlways` 不接），main 强制同一约束（§2.2）。
renderer 侧不手写：`$events` 由上游 `ClientRemoteEvents` 开（`GW/client/index.ts:163-168`、`GW/client/remote-events.ts:63`），卡片与作答由 `ui-approval` 负责（`C/ui-approval/src/client/index.ts:38-71,90-109`）。补发已由 T-15② 实测（绿，`events-replay.test.ts` L139-150）：M2 重连后重新挂 `$events` 即可，**main 不缓存、不补发**。renderer 重载（同一 socket 新开流）走同一注册路径，目前是读码推定，列 P4 验收。

## 5. 主 bot 分工两思路（Q-003）
- **装法**：两个字段 `mainBot`（由 `meta.mainBotId` 推出，唯一）和 `runtime`。思路① =「主 bot `runtime:'superagent'`，其余 `'dsh'`」；思路② = 全部 `'dsh'`，主 bot 只是一个带标记的普通 dsh bot。两种思路都不改 renderer 类型。**默认②**：冷启动时 `mainBotId` 为空或指向的 session 已不在 list 里 → renderer 调 #3 建一个默认 preset 的 bot → 调 #20 `patch({mainBotId})`。主 bot 在侧栏置顶，UI 不提供删除。`runtime` 不写盘（缺省 `'dsh'`），MVP 不提供改它的接口。
- **切到①的成本**（新 slug，CONTRACT v2，过契约问题）：① main 按 bot 路由，`runtime==='superagent'` 的 M1/M2 调用转给 superagent bundle；② 写推送桥：superagent 只有 loopback HTTP、没有推送（roadmap 素材表），要合成 §3.3 形状的 follow 帧；③ 兼容改造：peer 依赖 dsh 0.2.1，见 `work/p2-sdk/reuse/superagent-compat.md`；④ 深挖跨会话消息。renderer 按 §3.3 收帧即零改动。数据上只改 `bots.json` 的一个字段；已有主 bot 的 dsh 历史不迁，保留为普通 bot，另建新主 bot。**现在不做**：路由层、superagent 适配、role 枚举（席 A/B 一致：YAGNI）。

## 6. 明确排除
- 0.78.1 renderer 的 75 个 lazy entrypoint：只做 4 页 + 审批卡 + tool-call 行（ARCH §2 的 MVP=Y 行）；其余 29 种 send-message 卡、12 种 event 卡、widget 都不做。云电脑 / box / SSH / VNC / computer-use / 账号（登录、AccessGate、onboarding 门控、getAccessToken），以及计费、语音、Teams/Slack/OAuth 连接器、bot 模板市场。
- 原版 coordinator/host 兼容层：帧协议 v3、`dune-rpc` 431 个 main 边方法、146 个 coordinator 方法、29 个事件族、gateway 131 个命令、`sand:boot-snapshot-sync`、Statsig/Sentry/OTLP/更新。29 个方法的最小面不实现，旅程语义改由 §2 承担。**ARCH §4.1 的 22 个云 RPC 在 B′ 下需要替身的 = 0**。EnsureDefaultMainAgent→#9+#3+#20；CreateAgent→#3/#4；SendUserMessage→#7；GetSendStatus→不需要（#7 requestId 去重）；ListAgents→#9；SetAgentClientState→不需要；ListAgentSessions→#9（1:1）；ListTranscriptEntries→#8 快照 + #11；StartFresh→不需要（新对话 = 新 bot）；Interrupt→#10；WatchTranscripts→#8；GetAgentPlugins→#19（recipes）；SetAgentPlugins→#4（只在建 bot 时）；RespondWidget→不需要；ResolveLocalToolPermission→#18；ListMarketplaces→#12；ListMarketplacePlugins→#13；InstallUserPlugin→#15；UpdateUserPluginInstall→不需要（启用按 bot 走 #4）；GetEffectiveUserPlugins→#16；GetMcpConfig、SetMcpConfig→不需要（MCP 配置随 bundle 带）。auth 假 token 与 Statsig 默认值（ARCH §4.3 ②④）也不再需要。

## 7. 遗留（P4 开工前或开工首日要定）
1. **连接器 bot 跨重启（J3×J4）—— T-15① 红，数据侧已闭环（§3.1），只差 #21**：重启后 follow 快照仍绿，`session/prompt` 的 resume 报 `Unknown agent preset: p2temp-…`（code 是 `gateway/internal`）。根因：header.agentPreset 冻结临时 id，registry 只在内存（`index.ts:97-115,223`）。v1.2 已定稿、不等 Q-008：recipes 落盘、`presetIdOf`、#4 幂等、roster 判只读。等 Q-008 的只有 #21 的实现：Q-008=A → 实现 #21，T-03③「p2temp 恰 1 个方法」改为 2；Q-008=B → 只读态即终态。未实现 #21 前，J3×J4 不算完成，UI 对只读 bot 显示「连接器已失效，请新建 bot」，不自动重试。
2. **审批卡重载补发 —— T-15② 已结案**：gateway 原生补发，见 §4。剩 renderer 重载路径和 fail-closed 边界两项 P4 验收。
3. **市场目录源与条目映射**：Grok 的条目（MCP server / claude-plugin marketplace.json）怎么映射到 `installBundle` 的 spec，以 T-09 / `work/p2-sdk/reuse/market-backend.md` 为准；#12–#16 形状不变。ui-plugin-market 覆盖 dsh 插件索引生态，不覆盖 bot 模板（scout :151），与 §6 一致。
4. **P4 首日 spike（P4 第一条任务，时限 1 个工作日）**：用 §2.1 保留集起最小闭包，跑**冷启动、两 bot 并发流式、一次审批往返、renderer 重载**四个场景（不只看启动日志），main 白名单每拒绝一次就记下 endpoint。产出：① 最小插件清单；② 实际需要的 M1 方法与 M2 endpoint（已知候选：`session/page|projections|attachment|search|updateQueue`、`api-session/*` 转发事件，`session-controller/src/client/index.ts:116-133`）；③ Connection generation 如何就绪。**批量判据（预先定好）**：凭证/account、workspace 写、`setIndexes`、通配加行一律拒；其余逐个列名、一次批完。② 合成**一条** QUESTIONS（契约类）作为增补审批闸门：批之前不开工依赖新增接口的 UI 任务；被拒的请求不因 spike 记录而自动获得授权。**止损线**：闭包拖进 workspace-controller 这类深度绑定的供应者，或白名单拒绝项超过约 30 个 → 停，回 G1 评估 scout 决策表 :18 的第 3 级改造。
5. **品味项（G1-r1 两席判成立）**：bot 配置在**创建时**确定（preset、连接器不可再改，模型可改），要换就新建 bot；对应 ext-mapping.md:32 与 registry :364-369。创建页明示「配置随 bot 固定，换配置需新建」；bot 头部把锁定的配置只读显示，提供「用此配置新建」；不展示不能工作的编辑入口。

## 8. P4 首批附加要求（G1-r2 有条件通过清单）

两席 REVISE → 有条件通过，剩余发现均为实现级细化，转为本节附加要求，不开第 3 轮（panels/G1-r2.md）。第 2、3 条在本文档的落点已同步（§3.1 agentPreset 单点解析行、#1 改指本节，见修订账 1.2→1.3）。清单原文 4 条，P4 首批任务须逐条落实：

1. [B-HIGH] 失败配方隔离：未安装连接器的失败创建不得毒化全局恢复屏障——恢复失败隔离（单配方失败不阻断其他 bot）、孤儿处理不删共享 recipe；验收「失败创建→重启→其他 bot 仍可用」。
2. [A-HIGH + B-MEDIUM] preset id 单点解析：agentPreset 缺省由 **main 唯一**显式解析为 #1 defaultId 后下传；p2temp 与 presetIdOf 拒绝缺省输入；同一值贯穿校验/presetIdOf/recipe/dsh 请求；验收「省略与显式 standard 同 id、重启后非只读」。
3. [A-MEDIUM·安全] Q-009 过滤错位：danger-full-access 是权限 preset（不在 agentPresets/list，#1 过滤无效）——spike 判据加：拒绝 `/permission` 开头命令行、拒绝 configForms 写；删 #1 错位文案；Q-009 答 A 前保持默认拒绝。
4. [A-LOW×5] Duplicate 文案匹配原则、重载验收可证伪化、#21 按 allSettled、bots[].runtime 与「不写盘」矛盾、bots.json 写入串行化。

## 修订账
| 版本 | 改动 | 依据 |
|---|---|---|
| 1→1.1 | Q-007 定稿；§2.1 第 2 级同 SHA 集成与 carrier 接缝；遗留 2 结案；#21 入表标 pending Q-008 | QUESTIONS Q-007；`reuse/dsh-client-packages.md`；`VERIFY-T-15.md` |
| 1.1→1.2 HIGH-1 | 已改：BotsMeta 增 `recipes{agentPreset, 规范化 connectors}`；`presetIdOf`(preset, 排序连接器名) #4/#21 共用；#4 register 前 has-check 幂等；数据模型定稿，只有 #21 实现 pending Q-008（§3.1、#4、#21、§7.1） | G1-r1 A+B；`p2temp/index.mjs:125-137`；registry `index.ts:99` |
| 1.1→1.2 HIGH-2 | 已改：M1 原样返回 dsh `ConnectionRpcResult`（含 details），拒绝也同形状（§2 M1） | G1-r1 A；`rpc.ts:19-28`；`GW/client/index.ts:870-871` |
| 1.1→1.2 HIGH-3 | 已改：§2.2 新增 main 参数约束（installBundle 强制 `enabled:false`；`$events/result` outcome/clientId/eventId 校验）+ 三条拒绝测试进 P4 验收 | G1-r1 B；`plugin-manager index.ts:1002`；`manager-store.ts:1277-1280` |
| 1.1→1.2 HIGH-4 | 已改：§2.3 端口转交时序（requestId → `webContents.postMessage` → preload 桥 → CONNECTING 包装 → 失败/超时/断线清理）；M2 从 invoke 改为 send + postMessage | G1-r1 B；Electron message-ports 文档 |
| 1.1→1.2 MEDIUM 9/9 吸收 + LOW 3/3 | main 专用桥模块、不直接复用 examples/lib（§2）；M2 streamId 归属三条；`session/control` 直接入 M2；#4 改 main 编排、M3 只写 mainBotId（§3.1，配方先于 session 落盘，取代「两步写入补偿」）；只读态 roster 比对；spike 时限/四场景/批量判据/止损/审批闸门（§7.4，A+B 合并）；Q-009 never preset 滤除并说明（#1、§2.2）。LOW：#1 滤 `p2temp-*`；`interactions:'answer'`（§2.1）；品味项文案与「用此配置新建」（§7.5） | G1-r1 A MEDIUM×6 + LOW×3、B MEDIUM×3 + product_ruling |
| 1.2→1.3 | 新增 §8（G1-r2 清单，panels/G1-r2.md）；#1 删 danger-full-access 错位过滤文案、改指 §8 第 3 条；§3.1 补 agentPreset 单点解析行 | panels/G1-r2.md |
> 勘误（2026-11-02，G1-r2 A 席第 3 条）：§8-3 中「Q-009 答 A 前保持默认拒绝」的条件句作废——两条拒绝（/permission 命令行、configForms 写）为 **P4 永久判据**，与任何问题答复无关（Q-009=A 仅指 SDK 侧 shell-ask 行为）；放宽须另开安全红线问题并引用用户原话。P4 边界以 p4-ui/BRIEF v1.2 D9 为准。
