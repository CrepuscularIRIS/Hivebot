# G1-r2 · 席 B（6.1 Sol）

> 代录，未经改写（席 B 运行约束禁写文件，主会话机械转录自其最终回报，2026-11-03）

seat: B
verdict: REVISE
confidence: high
reverse_take: 最可能事故是用户为联网批准一次 bash，执行却绕过整个 wrapper，凭证 NEVER 随之失效；先保留不可绕过的拒读底线，再开放自主执行。
findings:
- [HIGH] /home/lingxufeng/bot/work/p5-parity/BRIEF.md:116-120 — 升权 ASK 与凭证 NEVER 尚未形成兼容的执行方案：批准联网可能同时解除 HOME 遮蔽、网络和写保护 — 证据: /home/lingxufeng/bot/repos/deepseek-harness/packages/sandbox/sandbox/src/escalation.ts:30-31 中 workspace-write 只能升为 danger-full-access；/home/lingxufeng/bot/repos/deepseek-harness/packages/shell/bash-sandbox/src/index.ts:92-100 对该模式直接绕过 confine，runnerCommand 不会执行 — 建议: PLAN 首批明确受控联网/越界执行路径，始终保留凭证隔离；落地前拒绝这种裸升权。A4 增加「批准升权后仍不能读取哨兵」，Q-013 同步真实权限后果。
- [HIGH] /home/lingxufeng/bot/work/p5-parity/BRIEF.md:124、152-158、180 — R4 已回报的模型侧持久改配置入口未被纳入 NEVER 的明确实现与验收，不能仅沿用 UI 的 D9 — 证据: /home/lingxufeng/bot/work/p5-parity/reuse/r4-tool-gates.md:25、71 揭示默认 plugin_manager；/home/lingxufeng/bot/repos/deepseek-harness/packages/boot/plugin-manager/src/tools.ts:104-110、140-152 允许一次升权批准后持久启停插件、安装宿主代码，后者不受工作区沙箱约束 — 建议: 首批任务显式禁用或硬拒绝模型侧插件/策略修改操作，不能由 allowed-once 放行；补「尝试停用策略插件、安装 bundle，均无配置变化」测试。
- [MEDIUM] /home/lingxufeng/bot/work/p5-parity/BRIEF.md:51、92、95 — wrapper 挂载方案与验收互相矛盾 — 证据: cwd 位于 PBOTS_DATA_DIR/workspaces 下，重新 bind cwd 后其祖先 PBOTS_DATA_DIR 必然存在，A0②却要求不存在；HOME 上可写 tmpfs 也可能允许创建影子 outside 文件，A3 却要求返回错误；/home/lingxufeng/bot/work/p5-parity/reuse/r5-sandbox-probe.md:85 明确此区别 — 建议: 验收改测具体 token/grant 哨兵不可见、宿主内容不变；若确实要求影子写也失败，显式设计只读遮蔽。
- [MEDIUM] /home/lingxufeng/bot/work/p5-parity/BRIEF.md:152、210 — R4/R5/R6 尚未被实际吸收，仍写「未回报」；R7/R8 吸收充分，未发现新增 HIGH — 证据: 三份 reuse 报告已存在；R6:200-207 还要求稳定工具身份、落盘成功后放行、写失败无内存授权 — 建议: PLAN 前更新输入状态，并把这些存储不变量写入授权任务验收，不必再开 G1。
r1 核验：A-H1、B-H2 为部分回应（上述 HIGH 仍须补齐）；A-H2 已修正测试方法，但存在上述验收冲突；A-H3、A-H4、B-H1、B-H3 已充分回应。以上为终轮有条件通过项。
落盘说明：本席运行约束禁止写评审文件；请主会话将本回报全文代录至 /home/lingxufeng/bot/work/p5-parity/panels/G1-r2-B.md，并标注「代录，未经改写」。
