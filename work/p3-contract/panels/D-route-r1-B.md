# D-route-r1 · 席 B（6.1 Sol）

> 主会话代录：本席运行约束禁止写文件，以下为其回报原文，未经改写。

seat: B
vote: B
confidence: high
findings:
- [MEDIUM] /home/lingxufeng/bot/work/p2-sdk/PLAN.md:9,13-15 — 复用已定稿的 dsh 会话、持久化、市场与审批契约，比额外维持原版接口形状更稳；B 的「直连」必须指业务契约直达 SDK，不是 renderer 持有凭证 — 证据: 同文件:9 规定 renderer 经 IPC、main 唯一 mux 客户端、token 只留 main — 建议: 保留该安全边界，不建设原版 coordinator/host 兼容层。
- [MEDIUM] /home/lingxufeng/bot/work/p1-re/ARCH-0.78.md:91-118 — A 确实可行，不能拿全部 431+146 方法或 12 项推定夸大成本；但最小面仍有 29 方法、事件族及基础设施映射，走原云服务替身方案另需约 22 个 RPC — 证据: §4.1、§4.5；renderer 云 RPC 直连为 0，server 路线仅碰 3 项推定且可替代 — 建议: 不因逆向不确定性否决 A；因新增兼容语义维护成本选择 B。
- [MEDIUM] /home/lingxufeng/bot/work/p1-re/ARCH-0.78.md:8,102,120；/home/lingxufeng/bot/work/QUESTIONS.md:31-32 — 原版没有 per-bot model/prompt 配置，也没有总控 bot；保留 renderer 不能免掉这些产品改造 — 证据: ARCH 裁决 3、§4.4、备注；Q-003 允许先跑通再决定主 bot 分工 — 建议: B 先接现有 agentPreset/model/session 能力，不把 superagent 调度或角色枚举提前固化进契约。
- [MEDIUM] /home/lingxufeng/bot/work/p1-re/RE-ui-shell.md:93-119,218-222 — B 最大风险是 UI 重写膨胀、视觉还原失真；资产能复用不等于页面已经可运行验证 — 证据: 66 项非 JS 资产可提取，token 运行时注入、图标为连字字体；登录后页面只有静态证据 — 建议: 提取字体/图标/token，按四条核心旅程实现最小页面；不照搬 75 个 lazy entrypoint，先验聊天流、审批与恢复。
reverse_take: 最可能失败于把 B 做成完整 UI 重建工程；更笨更稳的是复用原版视觉资产、沿用 main 的安全传输边界，只实现四旅程所需页面与现有 SDK 操作。
