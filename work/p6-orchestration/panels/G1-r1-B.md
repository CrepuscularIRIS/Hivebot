# G1-r1 · 席 B（6.1 Sol）

> 代录，未经改写（席 B 运行约束禁写文件，主会话机械转录，2026-11-03）

seat: B
verdict: REVISE
confidence: high
reverse_take: REDUCE 方向成立；最可能失败于把"回合结束"误当"任务完成"，以及模型只发收到、最终结果却被框架藏掉。
findings:
- [HIGH] /home/lingxufeng/bot/work/p6-orchestration/BRIEF.md:29,48,67 — 兜底漏掉"发了 ack、没发 result"的关键失败路径；此时最后的普通 assistant 结果仍被折叠，用户只看到收到 — 证据: 兜底仅在整个回合没有 send_message 时触发，D2 同样只测零调用 — 建议: 按"缺少成功的 result"触发终态兜底；增加 ack→普通最终文本、ack→模型报错两格测试，并避免重复展示。
- [HIGH] /home/lingxufeng/bot/work/p6-orchestration/BRIEF.md:50-51,74 — "默认 preset + 不给协调者工具"不能保证委派深度 1、总并发 ≤3；worker 仍可通过原生 subagent/workflow 再派活 — 证据: repos/deepseek-harness/packages/bundle/web-app/presets/standard.patch.yml:86-111 挂载 subagent、subagent_fork、workflow；work/p5-parity/PLAN.md:99 明确子会话 ALWAYS 类允许执行 — 建议: worker 在执行层禁用原生委派入口，或明确限制只针对顶层 bot，并重新定义资源防线及验收。
- [HIGH] /home/lingxufeng/bot/work/p6-orchestration/BRIEF.md:23,58,70 — 每次 turn/end 都驱动主 bot 发 result，会把仍有后台任务的回合当成交付，并可能连续刷屏 — 证据: repos/deepseek-harness/packages/jobs/tool-jobs/README.md:40-42 明确后台完成会唤醒后续回合；repos/dsh-superagent-prototype/docs/003-execution.md:33-35 专门区分"回合结束但后台仍工作" — 建议: 区分回合通知与任务终态；第一批可禁止委派任务遗留后台作业，否则补测"后台仍运行→不发最终结果→真正完成只报一次"。
- [HIGH] /home/lingxufeng/bot/work/p6-orchestration/BRIEF.md:41,87-89 — p5 依赖不完整，所列里程碑不足以支撑 D8 的浏览器闭环及 ALWAYS 行为 — 证据: work/p5-parity/PLAN.md:106 仅交付 P5-28 main 作答分支，:114 的 P5-33 才交付提问卡；:99,107 表明 P5-21 在缺少 P5-29 写入的有效 policy-state 时全部退 ASK — 建议: 明列 P5-33 为提问旅程依赖、P5-29 为后台免逐步审批依赖；D10 的停止清理与 P5-27 对齐，不能只验 interrupted 帧。
- [MEDIUM] /home/lingxufeng/bot/work/p6-orchestration/BRIEF.md:39-44 — R3 的共享目录阻断有直接依据；R1 的"一个 commit→不维护"和"默认免审批→不能集成"尚不足以成为确定排除理由 — 证据: 同文 :100,102 仍要求 S-1 查维护、S-3 查叠加 guard 后的真实行为；work/p2-sdk/reuse/superagent-compat.md:9-13 原有 scout 建议改造复用，记录上游最近提交为 2026-10-31 — 建议: R2 标为暂定推荐；D-route 前用维护核验及受现有 guard 约束的最小集成实测，明确推翻旧决策的证据。
- [MEDIUM] /home/lingxufeng/bot/work/p6-orchestration/BRIEF.md:68 — D3 能检验一次运行，但"遵从率"目前可因提示集、重跑挑选及工具计数口径不同而改变 — 证据: 尚无冻结的十条输入；"第一个工具调用之前有 ack"未排除 ack 自身也是工具调用 — 建议: G2 前冻结提示集、模型标识及配置；明确指首个工作工具，保存全部运行与失败记录，并把 ack-only 失败纳入指标。
