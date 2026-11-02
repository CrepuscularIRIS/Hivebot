# VERIFY · U-12 M2 pbots:mux-port 端口转交桥（W1 最后一桥）

verdict: PASS
commit: 250c91fd0f516fea0422dc918600fe2d5bf32378（worktree /tmp/bot-wt/U-12，验收期间无漂移）
验收人：verifier（GLM 5.3）· 2026-11-02 12:45–13:05 · 测试环境 HOME=/tmp/bot-p4-U-12v（PLAN §2 隔离）

## 验收项

| 验收项 | 结果 | 证据（命令/文件/路径） |
|---|---|---|
| ① 转交时序：并发不串线 / 失败不带端口 / 10s 超时 / 迟到端口 / 重连间隙 | PASS | 单测 `pnpm test` 7 文件 53/53 绿（tests/unit/m2/bridge.test.ts：转交、两并发 requestId 各回各帧、失败 `{ok:false,error}` 无端口、80ms 注入超时、sender 销毁不回执）；carrier-socket.test.ts：CONNECTING(0) 即发申请、收端口才 start→1→open、error 先于 close、失败/超时后迟到端口立即 close 不复活；亲跑复现见下「e2e 亲跑」 |
| ② streamId 归属 (a)(b)(c) + port 废弃清理 | PASS | bridge.test.ts：(a)×2（跨 port 冲突 ws 只见一次 open；与 main 自开流冲突也拒——main 归属靠 tap up 登记）、(b) B 冒充 A 的 item/end/cancel + 未知 streamId 共 4 帧全部不上 ws（uplinkDropped +4，A 自己的仍放行）、(c) sa 只进 A 的 sink、B 收到 `[]`；port close → 对 s1,s2 发 cancel（`portCancels=2`）且归属清空可重用同 id；socket 断开 → 全部 port close + 重连间隙死 socket 不转交（rd2 posts 空）+ 新 generation 就绪后可转交。「红绿」以断言可证伪性核对：删 owners 检查则 (a) open 计数 2≠1 红、删 (b) 检查则 backend.received.length 增、删 (c) 路由则 sinkA 空——三条各自独立见红 |
| ③ 白名单恰 {session/follow, $events, session/control} + typert 壳原样 | PASS | 实现 main/m2-mux/index.ts:13 `M2_ENDPOINTS = new Set([...])` 是唯一放行判据（grep 全 app/ui 非 vendor 仅此一处）；单测表外 3 例拒（error 帧 code `pbots/forbidden` + ws 不见 open + rejectedEndpoints 记录）、表内 3 例放行；运行时快照断言（/tmp/vfy-U-12/snapshot.test.ts，vitest 真跑）`[...M2_ENDPOINTS].sort() === ['$events','session/control','session/follow']`、size=3、`PORT_TRANSFER_TIMEOUT_MS === 10_000` → evidence/U-12/whitelist-snapshot.txt 2/2 绿。typert 壳：onPortFrame 只读 type/streamId/endpoint，payload 原样 sendRaw（bridge.test.ts ① 断言 backend.received open 帧逐字段相等）；e2e 测试 1 以 `{request:…}` 壳 payload 真实走通 session/follow 并收到流式 chunk（SPIKE §5.2 的壳经 dsh 接受） |
| ④ 双侧来源校验 | PASS | main 侧：senderAllowed（senderFrame null 拒、URL 非 `pbots-app://app/` 拒，单测 3 例 rejectedSenders=3 + requestId 非字符串忽略）+ main/index.ts assertPbotsSender 主窗口断言（U-00 层）；e2e 第 4 条：第二窗口（同 preload、pbots-app://app/ 页）requestMuxPort → `transfers` 精确不变、第二窗口 `__pbotsMuxSeen === []`。页面侧：mux-socket.ts:103-106 `event.source !== windowRef` 拒 + `data.pbotsMux !== requestId` 拒（carrier-socket.test.ts「ES:86」条：不绑定、readyState 保持 0）；preload relay 对 main→page 方向校验 origin（Electron 44 实测 senderFrame 为 undefined 非 null，读不出放行——本通道只有 main 能发，页面拿不到 ipcRenderer，注释在位） |
| ⑤ 全量（单测 53/53 + e2e 15/15 含 shell 回归 9 + build） | PASS | `pnpm build` 绿（main/preload/renderer 三段产物）；`pnpm test` 53/53；`pnpm test:e2e` 15/15（m2-port 6 + shell 9），30.4s |
| ⑥ e2e 六条语义核对 + 亲跑超时/断链 | PASS | 六条断言语义逐一读核（见下节）；亲跑 `--grep "10s 超时"` 1 passed 10.6s（真 10s 计时）、`--grep "D4②"` 1 passed → evidence/U-12/e2e-replay-timeout.txt、e2e-replay-drop.txt |
| ⑦ ledger：ready clientId + 未决 eventId 写入（供 U-11 作答下账） | PASS | tap 的 asEventsItem 窄判别喂 `ledger.record(EventsItem)`；单测：ready→`readyClientId='cl-1'`、waterfall+cancel→`pendingEvents()=[]`；e2e 第 5 条：pending 含 eventId 经 electronApp.evaluate 读出（不开新 IPC 通道，`globalThis.__pbotsM2`）。消费关系见「U-11 接口匹配性」节 |
| ⑧ D4①② 桥级（重载 / 断链重连） | PASS | e2e 第 5、6 条：reload 与 testDropSocket（反射 terminate 私有 ws，遵守 LEARNINGS「不用 socket.close 预置」）两路都验证新 clientId ≠ 旧、同 eventId waterfall 重新下发、经 main 自己的 peer 作答（gateway 同 Peer 校验）后副作用文件 canary 出现（expect.poll 30s） |
| ⑨ 坏路径（额外一条） | PASS | 无效 launch-token 的 handoff（gateway 拒握手，区别于已有的「连不上 9 端口」）：main 存活（`app.evaluate 1+1 === 2`）、申请走 10s 超时 `error = mux port transfer timed out after 10000ms`、任何时点不带端口、`transfers === 0` → evidence/U-12/badpath-badtoken.txt 1 passed 12.3s |

## e2e 六条语义核对（m2-port.spec.ts）

1. **成功转交+并发不串线**：boot `$events` 与显式 newSocket 的 `session/follow` 两 requestId 并发，断言 `followGotEventsReady:false / eventsGotSnapshot:false`、readyStates `[0,1]`、relays `[{ok:true,ports:1}]`、tap downlink items ≥1（electronApp.evaluate 读）、`ledger.readyClientId === bootClientId`。
2. **失败不带端口**：无 PBOTS_DSH_HANDOFF → error 含 `dsh connection not configured`、relays `[{ok:false,ports:0}]`、`transfers === 0`。
3. **真 10s 超时**：坏 handoff（127.0.0.1:9）→ 实跑 10.6s、error 含 `timed out`、`relays.filter(ports>0) === []`、`timeouts ≥ 1`。
4. **非主窗口拒**：第二窗口同 preload 载 `pbots-app://app/`，requestMuxPort 后 `transfers` 前后精确相等、窗口内收不到任何 `{pbotsMux}` 消息。
5. **D4① 重载**：`page.reload()` → 新 clientId、同 eventId 重发 → `testAnswerEvent` 批准 → canary 文件出现；ledger 为旁听台账（作答不经 U-11 validateResult 时条目仍在——注释写明下账归 U-15 ③）。
6. **D4② 断链重连**：`testDropSocket()` → 页面 W close → debug-boot 300ms 重开 → 新 clientId、同 eventId 重发 → 批准 → canary 出现。

## 步骤 4 裁定：renderer/main.tsx +3 行

**追认（最小接缝），不转 U-00.f。** diff 恰 3 行（1 注释 + 1 import + 1 调用 `installCarrierDebug()`）：
- PLAN 决策 4 明确「E2E 走真 main/preload/page 通道」，page 侧入口是该验收项的必要条件，无它六条 e2e 全部无法走真 preload——不是可选接线而是验收依赖；
- 无依赖、无产品行为变化（debug-boot 只挂 `window.__pbotsCarrier` 观察面）；PLAN §2 的 U-00.f 触发条件是「加依赖或接线」，此处属测试驱动面的最小接缝；
- 删除条件标注在位：debug-boot.ts 文件头「产品化由 U-15/U-21 的 installConnection + ClientRemoteEvents 替代（届时删除）」+ main.tsx 注释「U-15 起由真 carrier 替代」。
- 建议主会话合并时在 LOG 记一行追认；U-15 交付时删 debug-boot 连同 main.tsx 这 3 行一并回收。

## 步骤 5：区域核对（11 文件）

`git diff --numstat 22f806f..250c91f` 恰 11 文件：区域内 9（main/m2-mux/index.ts、preload/mux-relay.ts、renderer/carrier/{index,mux-socket,debug-boot}.ts、tests/unit/m2/{bridge.test,carrier-socket.test,support}.ts、tests/e2e/m2-port.spec.ts）+ 区域外 2（renderer/main.tsx +3 已裁定追认；tests/support/sdk-runtime.ts 纯新增 127 行——PLAN §2 排他清单不含 tests/support，且 launch.ts 未动，属 e2e 真 runtime 的支撑基建）。排他区逐一 `git diff --quiet` 验证 **UNCHANGED**：main/index.ts、preload/index.ts、main/dsh/、main/m1-api/、main/m3-meta/。

## 步骤 6：U-11 m1Ledger 与本任务 tap 的消费关系（接口匹配性抽查）

在主仓 main（已合并 U-11 6b84490）核对：m1-api `$events/result` → `ledger.validateResult(clientId, eventId, outcome.value)`（m1-api/index.ts:84），模块单例 `m1Ledger`，`registerM1Api({ dsh })` 时启用；U-11 单测（tests/unit/m1/api.test.ts）用真 `EventsLedger` 的 `record({ready/waterfall/cancel})` 喂桩——与 U-12 tap 写入侧（`asEventsItem` 窄判别 → `record(EventsItem)`）**同一类同一接口，匹配**。`validateResult` 成功即 `pending.delete`（作答下账在 U-11，语义正确）。`M2Deps.ledger` 可注入，联调入口已备。
**交接提醒（计划内，非缺陷）**：main/index.ts 里 m1（m1Ledger 单例）与 m2（内部 `new EventsLedger()`）目前是**两个实例**，共享接线按 PLAN 归 U-15 ③——届时必须把同一实例传给 `registerM2Mux({ dsh, ledger })`，否则 $events/result 校验读不到 tap 写入的 pending。

## 说明

- 本任务无产品 UI 交付物（renderer 仅 U-00 最小 Boot 页 + debug-boot 驱动面，无视觉面），全部验收项为桥级语义，证据形态为真实 Electron/SDK 环境的测试输出与代码核对，不适用浏览器截图（LEARNINGS 截图规则针对有界面的验收）。
- 测试进程清理全部经 `electronApp.close()` / rt.stop()（测试框架自管），无手工 kill。

新问题（每条一行，可直接成为修复任务）：
- [FIX] 单测缺 M2_ENDPOINTS 快照断言：现有 it.each（3 表内放行 + 3 表外拒）测不出「白名单被静默加第四项」｜复现：改 M2_ENDPOINTS 加一项后 `pnpm test` 仍全绿｜疑似位置：app/ui/tests/unit/m2/bridge.test.ts｜严重度 LOW（验收探针 /tmp/vfy-U-12/snapshot.test.ts 已证当前恰三，建议两条断言并入 bridge.test.ts）
- [HANDOFF] U-15 ③ 共享 ledger 接线：m1 的 m1Ledger 单例与 m2 内部 EventsLedger 是两个实例，$events/result 的 clientId/eventId 校验在接线前读不到 tap 台账｜复现：合并 U-12 后（未接 U-15）直接经 pbots:api 发合法 $events/result → `eventId not pending`｜疑似位置：app/ui/main/index.ts（registerM2Mux 调用处）｜严重度 MEDIUM（阻塞 U-15 ③ 联调，PLAN 已排期，不阻塞本任务）
