seat: A
vote: B（`/api` + `/api/remote.mux`）
confidence: high
findings:
- [HIGH] dsh-api.md §1.2「鉴权」/ 选项 B 描述 — B 并不能让 Electron renderer 直连：Origin 栅栏拒绝 `file:`、`null` 和任何非 http(s) 自定义 scheme，Origin 必须与监听地址同 authority — 证据: repos/deepseek-harness/packages/client/connection/src/api-request-trust.ts:147-150（`origin === "null"` 拒绝、只认同 authority）、:166-171（非 http(s) scheme 一律 false）— 建议: 契约里写明 renderer 接入走二选一：(1) main 进程用 `/connect?token=` 拿 operator cookie，持有 mux socket 后经 IPC 转发（Node ws 不带 Origin，可过栅栏，见 :145 `origin === undefined` 返回 true）；(2) renderer 页面从 dsh 同源（127.0.0.1:3080）加载。不要用 webRequest 改写 Origin 头绕过栅栏。「A 要 main 转发、B 不用」这个对比不成立，两边都要经过 main，所以 B 胜在下面几条，不在接入路径。
- [HIGH] 选项 A / dsh-as-dependency.md:85 — A 当前满足不了 MVP 的「流式推送」：SDK server 只转发 durable 事件，没有 assistant chunk 桥接 — 证据: `grep -rn "assistant-stream\|assistantStream" packages/sdk/` 在 ce7073d 上 0 匹配（本席实跑）；sdk/server/src/server.ts:171-215 只转发 session.event/status — 建议: 不选 A；要选 A 的话，这块得算新写的协议代码，不是「补缺口」。
- [MEDIUM] 选项 A / dsh-sessions.md:14-15,42-44,60-64 — A 要补的不是 1 项，至少 4 项：chunk 桥接、per-session preset/model（createSession 写明 "No preset composition"，server.ts:563-592；query 只接受 sessionId+contentBlocks，server.ts:504-511）、list、history（server.ts:498-539 方法表里没有）。B 对应的能力全在：session-controller/src/index.ts:278-341、521-541，commands.ts:103-168，web/controller.ts:32-76（follow 有 snapshot、cursor、`assistantStream===true` 时绑定实时流）— 建议: 4 项都在 dsh 自有协议里做，等于在 A 上重写一个 B 的子集，违反「复用 > 自写」。
- [MEDIUM] dsh-api.md:84 — B 的重连语义比较脆：一个 API operator 只能有一个 mux socket（第二个返回 409），socket 一关 Peer 就作废，旧 cookie 失效，必须用 launch token 重新 `/connect` — 证据: connection/src/rpc-host.ts:70-101、128-187；gateway/tests/operator-connect.host.spec.ts:63-85 — 建议: main 进程持有 launch token（不进 renderer、不进日志），重连流程固定为「重新 /connect → 新 socket → 对每个 session 重新 follow（用 snapshot + cursor 恢复）」；D7 加一条「socket 断开后重连并追平事件」的用例。断线期间的 transient chunk 不承诺重放（dsh-api.md:80）。
- [LOW] dsh-sessions.md:74 — selectModel 会顺带改 host 默认模型，没显式设置模型的 session 会跟着变 — 证据: session-controller/src/commands.ts:162-166、agent.ts:464-471 — 建议: D4 的两个 session 都显式调用 selectModel。
- [LOW] dsh-sessions.md:52 / sdk-app cordis.patch.yml:46-50 — 选 B 后 app/sdk 的 profile 要基于 web-app 组合（webserver + connection + gateway + session-controller），不能直接用 sdk profile；同时要去掉 dsh 自带的 web UI 静态资源，或者不让它暴露 — 建议: PLAN 里单列一个任务：「最小 web-api profile，只要 /api 和 mux，127.0.0.1」。

## 结论
投 B。MVP 的两项硬需求是多 session 并发和实时流式推送到前端。B 两项都现成：WS mux 按 streamId 在一个 socket 上为每个 session 开一路 follow，请求带 `assistantStream:true` 就推实时 chunk。D4/D5 要用的 per-session preset/model、list、history 也在 B 侧现成。A 的多 session 本身没问题，但实时 chunk、per-session 配置、list、history 四块都得在 SDK 协议上新写，实际是在 stdio 上重造一个 B 的子集。

## 理由（≤5 行）
1. 流式粒度：A 0 实现（packages/sdk 里 grep assistant-stream 0 匹配）；B 现成（web/controller.ts:38-40、53-57；history/assistant-stream.ts:69-96）。
2. D4/D5：A 缺 preset/model/list/history（server.ts:498-539、563-592）；B 全有（session-controller/src/index.ts:278-341、521-541）。
3. 接入路径：两者都要 main 进程中转（Origin 栅栏 api-request-trust.ts:147-171），这一项打平，不构成选 A 的理由。
4. 鉴权与 D8：B 默认 bind 127.0.0.1（web-app cordis.patch.yml:175-184），HMAC cookie + Host/Origin 栅栏现成，D8 的「无 token 拒绝」可以直接测。
5. 代价是多维护一个 loopback HTTP/WS 服务和 operator 重连逻辑，这部分 dsh 自己的 RemoteStreamMuxClient 已经实现（gateway/src/client/stream-client.ts:47-71、101-118），可以直接复用，不用自写。

## 最担心的风险
operator 生命周期：一个 Peer 只能挂一个 socket，socket 一关就作废。如果 main 进程的重连没按「重新 /connect → 重新 follow → snapshot/cursor 追平」来实现，P4 会出现断线后列表还在、流却静默不推的问题，而且不会报错。

reverse_take: 三个月后最可能的失败是 renderer 直连 /api 被 Origin 栅栏拒绝，有人为了绕过去改写 Origin 头、放宽 trustedHosts，把 D8 打穿。更笨但更稳的做法是：renderer 只和 main 通过 IPC 通信，main 是唯一的 mux 客户端，launch token 只留在 main 里。
