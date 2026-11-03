# G1-r1 · 席 B（6.1 Sol）

> 代录，未经改写（席 B 运行约束禁写文件，主会话机械转录自其最终回报，2026-11-03）

seat: B
verdict: REVISE
confidence: high
reverse_take: 最可能失败的是把「限制写入」当成完整安全边界；更稳的做法是先证明所有工具入口都拒读凭证，再逐类开放免审批。
findings:
- [HIGH] /home/lingxufeng/bot/work/p5-parity/BRIEF.md:92 — A9 的「全部退回 ASK」会把 NEVER 降为用户可批准，策略损坏反而放宽权限 — 证据: L105、L109 规定凭证和权限切换 NEVER，L92 却没有保留这些拒绝底线 — 建议: 固定拒绝项优先于配置、常驻授权和故障回退；增加「损坏配置后尝试批准 NEVER 调用仍失败、无副作用」验收。
- [HIGH] /home/lingxufeng/bot/work/p5-parity/BRIEF.md:87、134 — 凭证验收只覆盖 bash 和输出扫描，不能证明文件工具不能直接读取凭证，也不能证明凭证未先进入执行环境 — 证据: `/home/lingxufeng/bot/repos/deepseek-harness/packages/fs/fs-sandbox/src/index.ts:3-8` 明确所有读取不受限制；BRIEF A4 没有 read/grep 等入口的拒绝测试，R5 也只要求调查 bash 环境 — 建议: R4/R5 输出完整执行入口与凭证隔离矩阵；A4 对每个可读入口断言读取被拒、子进程环境无哨兵，扫描仅作为补充，并覆盖工作目录内指向凭证的符号链接。
- [HIGH] /home/lingxufeng/bot/work/p5-parity/BRIEF.md:93、102-104 — 「越界类不能始终允许」与联网、工作目录外读取可始终允许互相冲突；单纯 bot×工具名也无法表达 bash 的不同授权类别 — 证据: A10 拒绝越界类 eventId 写盘，表第 3、5 行却允许常驻授权；L53 明确只按工具名匹配 — 建议: 先统一越界类别与授权语义；最小方案是本期仅连接器工具支持始终允许，bash 联网和目录外读取保持逐次 ASK，并同步 C2/A7/A10。
- [MEDIUM] /home/lingxufeng/bot/work/p5-parity/BRIEF.md:54、134 — R5 准入只要求写隔离和拒读凭证，没有明确不同实际后端、不可用状态的验收矩阵 — 证据: `/home/lingxufeng/bot/repos/deepseek-harness/packages/sandbox/sandbox-local/src/profiles.ts:17-35` 中 bwrap 使用独立 PID 和临时目录，而 Landlock 使用宿主 `/tmp`、全根只读授权，二者不是等价边界 — 建议: R5 记录实际选中后端；对备用后端及沙箱不可用分别验证，不满足本期隔离要求时拒绝自主执行，不能仅凭安装了 bwrap 判准入。
- [MEDIUM] /home/lingxufeng/bot/work/p5-parity/BRIEF.md:91 — 旧 bot 保守合理，但当前主 bot 很可能因此完全得不到本阶段的自主化体验 — 证据: L59 明示当前 session/create 可不传 cwd；A8 对旧 bot 永久每次询问，核心旅程 L65 未说明必须新建 — 建议: 明确旧 bot 的提示与「新建自主工作区 bot」入口，不做隐式迁移；验收现有主 bot 保守、新建 bot 自主两条旅程。
- [MEDIUM] /home/lingxufeng/bot/work/p5-parity/BRIEF.md:78、126 — 基准降级后仍可能按 U5 宣布与 0.78.1 同 level，但 0.18 渲染只能证明与旧版一致 — 证据: L19 承认缺少真实运行态基准，U5 允许降级至 0.18，U3 只覆盖 R2 已列出的差异 — 建议: Q2 明确让用户确认降级后的验收口径；旧版参照无法覆盖的 0.78.1 项标为未验证，不能由 GU PASS 自动消除。
