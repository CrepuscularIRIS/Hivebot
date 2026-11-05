# G2-r1 席 B（6.1 Sol）

> 代录，未经改写。该席未能写文件，以下为其最终回报原文。

seat: B
verdict: REVISE
confidence: high
reverse_take: 最可能失败的是定时消息已开始执行、授权历史尚未完整提交；先把可信投递身份与准入时序闭环，再铺管理能力。

- [HIGH] `/home/lingxufeng/bot/work/p7-admin/BRIEF.md:55,201` — Q-2b②不是只影响实现细节：查不到 history 就无 Mandate，会让合法 J2-b 触发被永久拒绝；无限等待又可能挂死。证据：已装 `dsh-schedule/lib/index.js:1584–1611` 明确先 followup，再 await flush，最后 commit history，中间崩溃还会留下持久消息但无历史关联。建议：将②升级为定时授权桥接任务的阻塞前置，明确有界等待、超时失败记录、崩溃恢复及成功正例；不需 BLOCK 整份 BRIEF。
- [HIGH] `/home/lingxufeng/bot/work/p7-admin/BRIEF.md:55,173,289` — 多 routine 合并投递后的授权归属与重叠防护没有定义，正文伪造 id 单例不足。证据：已装 `dsh-schedule/lib/index.js:1560,1599–1613` 将多个任务放入同一 messageId，却逐项 await commit；反查可能只看到部分集合。正文又不能可信地将动作绑定回某 routine。建议：明确集合完整性判据与批次授权规则，禁止跨 Mandate 拼接动作/目标；增加「A 忙、B 闲」「A 撤销、B 有效」「第二条历史提交前 claim」三例及合法派工正例。
- [MEDIUM] `/home/lingxufeng/bot/work/p7-admin/BRIEF.md:45,54,171,209` — D-1 C 要求非人类回合不经模型，却同时保留唯一 goal round-driver、模型核验续派的固定 DONE；不是只换工具暴露面的等价选项。建议：写明 C 若胜出需重开哪些范围与 DONE，不能称三案共同接线不会返工；D-2/D-4 的事实锚点与取舍总体充分。
- [MEDIUM] `/home/lingxufeng/bot/work/p7-admin/BRIEF.md:45,64,183` — 7a-L/7a-M 不能按整阶段直接并行：共享操作记录、恢复 owner、SDK→main 通道与重启路径。建议：PLAN 先单列共享底座并合并，再按具体文件白名单并行；现有文字不能作为区域不交叠的证明。
- 修订账核对：G1-r1 九条及 G1-r2 两组 HIGH、五条 MEDIUM 均有回应落点，未发现偷偷放宽；但 Q-2 的新增授权桥尚不足以支撑「就绪交 G2」。依本席上级禁止写评审报告文件的约束，未写入 panels/G2-r1-B.md。
