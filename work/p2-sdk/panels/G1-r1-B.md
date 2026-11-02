# G1-r1 · 席 B（6.1 Sol）

> 主会话代录：本席运行约束禁止写文件，以下为其回报原文，未经改写。

seat: B
verdict: REVISE
confidence: high
reverse_take: 最可能的失败是通过了"假模型＋任意 MCP"的验收，却到 P4 才发现 Grok 市场流程或真实多 session 配置接不上；更稳的是先验证这两条纵向链路再冻结验收边界。
findings:
- [HIGH] /home/lingxufeng/bot/work/p2-sdk/BRIEF.md:43,69 — D6 允许"目录任意一项＋安装任意 MCP"通过，但尚未证明这等价于 roadmap 要求的 Grok Bot 基础市场连接器，可能实现成功却交错产品 — 证据：roadmap.md:7 指定 Grok Bot 市场；S7 仍待确认插件市场与连接器市场是否同类、目录来源为何 — 建议：将 S7 的流程映射及目录来源决策设为 D6 定稿前置；允许测试使用本地镜像，但不能以任意 MCP 样例替代目标市场流程。
- [MEDIUM] /home/lingxufeng/bot/work/p2-sdk/BRIEF.md:39–40 — D2/D3 把模型输出长度和调度时序当成功条件，会误拒正确实现 — 证据："你好"须产生 ≥2 个增量；三条流必须时间交错，但短回复、网络缓冲或调度都可能不满足 — 建议：真模型冒烟只检查流协议与正常结束；离线 fake 用屏障确保三个请求均已进入执行，再释放增量并验证路由。
- [MEDIUM] /home/lingxufeng/bot/work/p2-sdk/BRIEF.md:41,44 — D4 的"确实按各自配置执行"缺少可观测判据，返回配置正确并不证明执行正确 — 证据：未规定如何发现执行器始终使用默认模型或 preset — 建议：fake provider 记录每次实际收到的模型及 preset 派生配置，逐 session 断言；明确测试经过真实 dsh 调用路径而非只测自有封装。
- [MEDIUM] /home/lingxufeng/bot/work/p2-sdk/BRIEF.md:45 — D8 的安全目标正确，但验收不完整 — 证据：只测无 token 被拒和 shell 拒绝执行，未测有效 token 可用、其他 session 不能代答审批；"git grep 找不到 API key"也未定义扫描对象和识别方法 — 建议：使用合成 canary 凭证检查日志及受跟踪文件，增加有效认证与跨 session 审批误配负例，并明确 stdio 路线的适用项。
- [MEDIUM] /home/lingxufeng/bot/work/p2-sdk/BRIEF.md:23,61–71 — 待查问题分得合理，但"按需补派"没有给出关键结果必须收敛的闸门 — 证据：S2/S4 决定 A 是否存在，S5/S6/S7 决定 D4–D7 能否按承诺实现，S9 决定并发实现形态；正文仅规定 S2/S4 失败重返 G1 — 建议：G1 可保留这些待查，不必假装已经证实；明确它们必须在 PLAN/G2 前有结论，改变 DONE 或核心路线时回审，S3 契约须经用户确认后才实现。
理由：非目标与 roadmap 基本一致；D5 是 roadmap.md:82 已有 MVP 要求，不是无依据扩张。A 比提前写产品门面更省代码，但目前只能条件性推荐；B/C 不宜被"代码量最大／全部维护成本"的未验证估计永久排除。superagent 已通过 Q-001 显式征询，没有暗中删项；D9 未获答复前不能标完成。
