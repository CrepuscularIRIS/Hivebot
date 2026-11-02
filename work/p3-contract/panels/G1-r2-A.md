# G1-r2 · 席 A（Opus 5.5）· p3-contract CONTRACT v1.2

```
seat: A
verdict: REVISE
confidence: high
findings:
- [HIGH] §3.1「#4 由 main 编排」+ #4 行 + §2.2 — main 在调用 dsh 之前用 presetIdOf(agentPreset, connectors) 算出 recipe 的 key，但 #4 的 agentPreset 是可选参数，而 p2temp 在参数缺省时自己补 'standard'。契约没有规定 main 用什么值算 id。如果 main 拿 undefined 算，p2temp 拿 'standard' 算，两边得到的 id 不同：recipe 写在一个 key 下，session header 里冻结的是另一个 id。后果是，用默认 preset 建的连接器 bot 在**刚建成时**就满足 `readOnly = p2temp- 前缀 && 无 recipe`，`connectors = recipes[header.agentPreset]?.connectors ?? []` 得到 []，不用等重启 J3 就失效。这样「recipe 先于 session 落盘」的保证也就不成立了 — 证据: app/sdk/src/p2temp/index.mjs:125（`agentPreset = 'standard'`）；CONTRACT.md:32（`agentPreset?`）、:84-85（connectors 和 readOnly 都按 header.agentPreset 查 recipes）、:95（main 先算 id 再写盘）；registry 的默认 id 来自配置（web-app cordis.patch.yml:590-592 `default: standard`），和 p2temp 里写死的值是两个来源 — 建议（P4 附加要求）: main 在校验阶段就把 agentPreset 解析成显式值（缺省时取 #1 的 defaultId），**显式**传给 dsh；p2temp 和 presetIdOf 都不再接受缺省值，缺省直接抛错；main 把规范化之后的 connectors 原样传给 dsh，算 id 和拼 rows 用的是同一份列表。验收加一条：不传 agentPreset 建连接器 bot，断言 `header.agentPreset === presetIdOf(defaultId, sorted)`，且该 bot 的 readOnly=false
- [MEDIUM] #1 过滤 + §2.2「#3/#4 agentPreset 不得是 #1 过滤掉的 preset」（Q-009 吸收）— danger-full-access 是**权限 preset**（dsh-permission-presets，通过 `/permission <name>` → `commands/execute` 或 configForms 按 session 切换），不是 agent preset。它不会出现在 agentPresets/list 里，所以这条过滤实际上什么也没拦住，选择器下面的说明文案也写错了地方。目前真正挡住它的是白名单默认拒绝（commands/execute、configForms 都不在白名单里），但 §7.4 的 spike 很可能为了 ui-chat 的 slash 命令申请加 `commands/execute`，一旦加了，`/permission danger-full-access` 就能打通；如果 Q-009 再答 A（never 放行），这就成了审批绕过 — 证据: D/packages/bundle/base/cordis.patch.yml:264-276（permission presets: read-only / workspace-write / danger-full-access(approval: never)）；D/packages/client/ui-permission-presets/src/client/index.ts:133-141（`live.command('/permission ${preset}')`）；D/packages/api/session-controller/src/client/sessions/session.ts:410-411（`remote.commands.execute`）；app/sdk/tests/e2e/approval.test.ts:13,283（测试按 permissionPresets/catalog 的 defaultPreset 断言）— 建议: 删掉 #1 里针对 danger-full-access 的过滤和对应文案（`p2temp-*` 的过滤保留）；§7.4 的批量判据增加一条：`commands/execute` 如果要加，main 必须拒绝以 `/permission` 开头的行；configForms 的写操作一律拒绝；不加载 ui-permission-presets 的切换入口（或者固定只读显示）
- [LOW] #4「`Duplicate agent preset` 也视为已存在」— 靠匹配错误文案判断，和 §3.1「不匹配错误文案」的原则自相矛盾；而且两个并发的 #4 请求同一个 id 时，第二个请求会在第一个的 register 激活完成（registry index.ts:111-112 `await record.ready`）之前就去 create — 证据: registry index.ts:99；p2temp/index.mjs:61 已经在运行时读 `registry.definitions` — 建议: 用 `definitions.has` 判断，再加一张按 id 的 in-flight Promise 表串行化（ponytail：单进程内存表即可）
- [LOW] §3.1 验收「recipe 已写、#4 未返回时重载 renderer」— renderer 重载时 main 的编排照常跑完，所以这条测试必然通过，证明不了窗口已经消除。真正要防的是 main 进程在写盘和 dsh 返回之间崩溃 — 建议: 换成编排顺序的单测：mock dsh #4 让它抛错或挂起，断言 recipe 已经落盘；dsh 抛错时留下孤儿 recipe 无害，断言它不出现在 bot 列表里
- [LOW] #21「全部完成前 M1/M2 不就绪」— 如果某个 recipe 对应的 bundle 已经卸载，ensure 会失败，「全部完成」可能被理解成全部成功，结果整个 app 起不来 — 建议: 写明按 allSettled 处理，失败的 recipe 标 live=false（只读），不阻塞就绪
- [LOW] §3.1 BotsMeta.bots[].runtime 和 §5「runtime 不写盘」互相矛盾 — 证据: CONTRACT.md:91 vs :128 — 建议: v1 的类型里去掉 `bots` 字段（YAGNI），切到思路①时随 CONTRACT v2 一起加回来
- [LOW] M3 写盘 — renderer 的 `patch(mainBotId)` 和 #4 编排写 recipes 都会对 bots.json 做 read-modify-write，原子 rename 只能防止文件写坏，防不了两次写互相覆盖丢更新 — 建议: main 内用单个写队列串行化（ponytail：一个 Promise 链）
reverse_take: 最可能的失败方式不在桥上，而在「两处各自补默认值」这类隐式约定：main 和 p2temp 对同一个 id 各算一次，只要输入差一个字段，J3 就会在建成的那一刻静默降级成只读。更笨更稳的做法：id 只在 main 里算一次，然后作为显式参数传给 p2temp（p2temp 只校验 `id === presetIdOf(...)`），这样两侧不可能算出不同的值。
```

## 正文

### 1. G1-r1 四条 HIGH 落实情况

| HIGH | 落实 | 核对 |
|---|---|---|
| 1 恢复数据 | **基本到位，有一个新缺口（见 HIGH）** | Recipe{agentPreset, 规范化 connectors}，按 presetId 建索引（:90-92）；`presetIdOf` 由 (preset, 排序后的连接器名) 派生，不用 rows，并抽成共用模块（:94）；register 之前做 has-check（:32）；只有 #21 的实现等 Q-008（:49, :136）。按 presetId 而不是 sessionId 建索引，是这一版最关键的设计：同一个配置的多个 bot 共用一份 recipe，配方也可以在 session 创建之前写盘。缺口在 agentPreset 的缺省值，见 finding 1 |
| 2 M1 原样返回 | 到位 | :22 原样返回 `ConnectionRpcResult`，拒绝时也用同一个形状，`details:{}`；上游 `rebuiltFailure` 读 `error.details`（GW/client/index.ts:870-871），已核对 |
| 3 参数约束 | 到位 | §2.2：installBundle 要求 `args[1].enabled === false`，省略或 true 都拒（与 plugin-manager index.ts:1002 的 `!== false` 即启用对得上）；`$events/result` 的 outcome 用精确集合，clientId 和 eventId 都要和旁听到的帧一致；三条拒绝测试都断言 dsh 没有收到调用；ui-plugin-manager 的「安装并启用」入口隐藏，固定 false（:56） |
| 4 端口转交 | 到位 | §2.3：send + requestId → `event.sender.postMessage(…, [port2])` → preload `window.postMessage(…, [port])` → 页面校验 `event.source===window` 和 requestId；包装对象 W 先同步返回 readyState=0；失败、10 秒超时、迟到端口、断线都有清理；port 关闭时对该 port 的所有 streamId 发 cancel。这和 Electron message-ports 文档里 preload 转交到主世界的写法一致 |

### 2. 偏离 B 席「两步写入补偿」：成立（有前提）
- B 席担心的是「session 已经创建、metadata 还没写」这个窗口。v1.2 让 recipe 的 key 只依赖输入（presetId），不依赖 sessionId，于是可以先写 recipe 再创建 session，窗口在结构上就没有了：在写盘和调用之间崩溃，只会留下一个孤儿 recipe（没有 session 引用它，无害）；在调用之后崩溃，recipe 已经在盘上。bot 和 recipe 的关联走 dsh 冻结在 header 里的 agentPreset，不需要第二次写盘。这比「补偿 + 重试识别」少一整套状态机，属于更好的做法。
- renderer 重载时，编排在 main 里照常完成，renderer 回来后从 #9 看到新 bot。M3 收紧到只能写 mainBotId，A 席上一轮提的信任边界问题也一起解决了。
- **前提**：main 和 p2temp 必须用逐字节相同的输入算 id。目前 agentPreset 的缺省值由两边各自补，这个前提不成立（finding 1）。修好它之后，这次偏离完全成立。验收用例也要换成能真正证伪这个窗口的写法（LOW-4）。

### 3. MEDIUM 吸收
- 专用桥模块（:18）：只复用 `connect()`，另写 raw rpc、原帧 tap、重连三件，`examples/lib` 保持测试替身的身份不动。到位（mux.mjs:116-120、:161-163 已核对）。
- streamId 归属三条规则，加上「main 是唯一的物理 socket 和凭证持有者」（:17, :23）：到位。
- `session/control` 直接加进 M2（:23）：到位（session-controller client index.ts:128-138 已核对）。
- spike（§7.4）：1 天时限、四个场景、预先定好的批量判据、凭证类一律拒、止损线（workspace-controller 或拒绝项超过约 30 个）、审批闸门、拒绝不因 spike 记录而自动授权：A 和 B 两席的要求都已合并。**补一条**：判据要显式覆盖 `commands/execute` 和 `/permission`（finding 2）。
- 只读态改为 roster 比对（:96），用未过滤的 #1 判断 live（:92）：到位。
- never 组合过滤：**方向对，作用对象错了**（finding 2）。B 席上一轮的表述是「可选 preset 名单」，director 照字面落在了 agent preset 上；实际上要守的是权限 preset 的切换入口。
- LOW 三条（`p2temp-*` 过滤、`interactions:'answer'` 写进 §2.1 :55、品味项文案与「用此配置新建」写进 §7.5）：都已到位。

### 4. v1.2 新引入的不一致
1. agentPreset 缺省值两边各补（HIGH，见上）。
2. 规范化 connectors 只用在 recipe 上，传给 dsh 的列表是否也用规范化后的版本没有写明：p2temp 的 `normalizeConnectors` 只做校验，不去重也不排序（p2temp/index.mjs:46-56）。重复的连接器名会让 rows 重复，导致 create 和后续 ensure 拼出的 rows 不一致。已并入 HIGH 的建议。
3. 用 Duplicate 错误文案判断已存在，和 §3.1 的原则矛盾（LOW-3）。
4. `bots[].runtime` 写在类型里，§5 却说不写盘（LOW-6）。
5. 修订账 :150 写的是「Q-009 never preset 滤除」，但这个过滤落在了错误的命名空间上（finding 2）。

### 5. 结论
四条 HIGH 都已落实，director 的偏离在结构上优于原建议。新发现的 HIGH 是一处一行就能写清的口径缺口，不需要重新设计，所以判 REVISE（有条件通过）：finding 1 和 2 作为 P4 派发的附加要求（#4 编排任务和 spike 任务各带一条），不开第 3 轮。没有 BLOCK 级问题：没有触碰安全红线（当前白名单默认拒绝挡住了 danger-full-access），核心旅程可以完成，方案也没有建立在被证伪的事实上。
