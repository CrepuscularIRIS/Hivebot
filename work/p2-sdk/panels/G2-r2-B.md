# G2-r2 · 席 B（6.1 Sol）

> 主会话代录：本席运行约束禁止写文件，以下为其回报原文，未经改写。

seat: B
verdict: REVISE
confidence: high
reverse_take: 最可能失败于"已合并却未 done"的状态歧义，使 mock 已就绪仍被真模型冒烟卡住；显式区分解锁闸门与最终 DONE 最稳。
findings:
- [MEDIUM] /home/lingxufeng/bot/work/p2-sdk/PLAN.md:25–27,41 — 真模型不阻塞下游的意图尚未落实成一致的依赖规则 — 证据: T-01④ 通过前不记 done，但 T-02/T-03 deps 仍为 T-01；/home/lingxufeng/bot/docs/harness/PROTOCOL.md:92 规定依赖全部 done 才 ready — 建议: 派发附加要求明确这两条依赖的是"T-01 mock 合并闸门"，主会话据该证据解锁；T-01④ 保持最终完成必需，不得提前标 done。
- [LOW] /home/lingxufeng/bot/work/p2-sdk/PLAN.md:25,47 — D2 替代命令仍写省略号，工作目录变化可能导致路径重复 — 证据: 原命令包含 app/sdk/examples，替代命令增加 `-C app/sdk` — 建议: R-5 写全 `pnpm -C app/sdk exec node examples/min-client.mjs "你好"`，README 与验收同步。
复核：G2-r1 四条 HIGH 均已完整写入计划，落点为 PLAN:19,25,32,34,36–38；这是计划落实确认，不是执行验收通过。
MEDIUM：七行吸收方向合理；共享 launcher、文件屏障、进程过滤、方法差集、T-10 依赖及批准归属均明确，唯真模型解耦须补上述依赖口径。
限定回审 D1：批准；精确 npm 版本＋lockfile 保留可复现目的，不碰 repos 更稳，允许 pnpm 准备 Node 并验证实际 runtime 版本增强可证伪性（PLAN:48；BRIEF:64）。
限定回审 D7：批准；首块屏障、缓冲负对照、重连、明确断网及最终汇合均增强原判据，未删除 D3–D6 与覆盖率要求（PLAN:26,38,49；BRIEF:70）。
限定回审 D8：批准；fake 哨兵覆盖同一持久化链路，真 key 另扫，解码及检查器正对照堵住压缩漏检；进程树过滤忠实于 SDK 安全范围（PLAN:32,50；BRIEF:71）。
D2 措辞：批准随 R-5 一并修订为上述完整 pnpm 命令；仅更换 Node 启动入口，真模型、增量早于结束、正常结束及退出码要求全部保留（PLAN:25；BRIEF:65）。
落盘：运行约束禁止写评审报告；请主会话将以上全文未经改写代录至 `/home/lingxufeng/bot/work/p2-sdk/panels/G2-r2-B.md`。
