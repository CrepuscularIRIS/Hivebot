# D-iface-r1 · P2 SDK 对外接口通道（panel 汇总）

2026-11-01 11:33 · 主会话机械汇总 · 规则：两席一致才通过（2026-11-01 起 panel 双席制；本轮三席已完成投票，按 A、B 两席裁决、C 席参考汇总）

## 投票结论

| 席 | 模型 | 投票 | 置信 | 原文 |
|---|---|---|---|---|
| A | Opus 5.5 | B | high | [D-iface-r1-A.md](D-iface-r1-A.md) |
| B | 6.1 Sol | B | high | [D-iface-r1-B.md](D-iface-r1-B.md) |
| C（参考席） | 6.1 Sol | B | high | [D-iface-r1-C.md](D-iface-r1-C.md) |

**两席一致投 B → 通过：`/api` + `/api/remote.mux`（WebSocket）**。与 scout 推荐（dsh-api.md）一致。契约定稿仍待 Q-004 用户答复。

## 投票依据要点（写 PLAN 时必须吸收）

1. **renderer 不直连 /api**（席 A HIGH）：Origin 校验拒绝 `null`/`file:`/非 http(s)（`connection/src/api-request-trust.ts:147-171`）。→ 架构约束：renderer 只经 IPC 与 Electron main 通信，main 是唯一 mux 客户端，launch token 只留在 main 进程。
2. **stdio 无实时流**（席 A/B HIGH）：`packages/sdk/` grep `assistantStream` 0 命中（ce7073d）；`server.ts:171-215` 只转发 durable 事件。A 需新写 4 块（实时 chunk 桥接、per-session preset/model（`server.ts:563-592` "No preset composition"）、session 列表、历史）= 在 stdio 上重写 B 的子集。B 的 `session/follow` + `assistantStream:true` 现成（`session-controller/src/web/controller.ts:38-40,53-57`）。
3. **断线重连风险**（席 A/B/C）：一个 API operator 只能挂一个 mux socket，socket 关闭 operator 作废（`rpc-host.ts:70-187`）。→ D7 需加重连用例：重连 → 重新 follow → snapshot/cursor 补齐；不得承诺 transient chunk 完整重放。
4. **B 侧验收补强**（席 B/C MEDIUM）：Electron renderer 鉴权引导、断线重认证、follow 重建均未实测，进 D7/验收。

## 处置

Q-004 保持 open 待用户答复（契约类）；答复前通道接线类实现任务阻塞。B 席建议的「renderer 接入冒烟」等验证类结论交 director 写 PLAN 时编排。
