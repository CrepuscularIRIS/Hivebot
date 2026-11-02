# D-route-r1 · P3 契约路线（panel 汇总）

2026-11-02 00:50 · 主会话机械汇总 · 两席制（D 题两席一致才通过）

## 两席结论

| 席 | 模型 | 投票 | 置信 | 原文 |
|---|---|---|---|---|
| A | Opus 5.5 | B | medium-high | [D-route-r1-A.md](D-route-r1-A.md) |
| B | 6.1 Sol | B | high | [D-route-r1-B.md](D-route-r1-B.md) |

**两席一致投 B → 通过：重写 renderer 直连 SDK（B′ 变体）**。待 Q-007 用户确认后契约定稿。

## 投票依据要点（两席综合）

1. **路线 A 三条硬伤（席 A HIGH）**：①MVP 第一条「每 bot 选 agent 配置」在 0.78.1 无 UI 无协议字段——走 A 要改闭源 minify bundle；②适配层 = 帧协议 v3 + dune-rpc 信封 + GrokBot proto ↔ /api+mux 的双向翻译，搬运阶梯第 5 级自建（无上游无 sourcemap）；③29 方法只是旅程最小面，启动面（AccessGate/boot-snapshot/Statsig/onboarding 登录门控）无运行态证据，总面 431+146。
2. **B 的 UI 成本被高估（两席）**：dsh `packages/client/` 有 74 个 React 18 包（ui-chat/session/sidebar/approval/plugin-market/agent-preset/model-selection），MIT、2026-10-29 仍在维护、本来就直连 /api+mux——**B′ = dsh client 包做骨架 + Grok 字体/图标/CSS 资产 + 只做 4 页**（bot 列表/会话流含审批与 tool-call/市场/设置），不照搬 75 个 lazy entrypoint。
3. **契约形状（席 A，对 Q-003）**：bot 记录只加 `mainBot` + `preset/runtime` 两字段，主 bot 分工两思路都能装下、默认思路②（先跑通再定）；IPC = 「/api 透传 + mux carrier 桥（MessagePort）」——renderer 经 IPC、main 唯一 mux 客户端、token 只留 main（与 P2 已定约束一致）。
4. **共同风险**：B 膨胀成完整 UI 重建。防护：P4 严格只做 4 页 + 审批卡 + tool-call 行。

## 后续动作

- scout 核实 dsh client 包能否脱离 Cordis 壳独立组合（席 A 建议）。
- director 起草 work/p3-contract/CONTRACT.md（输入：本汇总 + ARCH-0.78 §4 + Q-003 分工思路）。
- Q-007 提请用户确认路线 B/B′。
