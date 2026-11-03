# G1-r2 · 席 B（6.1 Sol）

> 代录，未经改写（席 B 运行约束禁写文件，主会话机械转录，2026-11-03）

seat: B
verdict: REVISE
confidence: high
reverse_take: 最可能失败于只在建 worker 时限制并发，已有 worker 经 send_to_bot 同时恢复后突破资源上限；应在启动回合的共用入口原子限流。
findings:
- [HIGH] /home/lingxufeng/bot/work/p6-orchestration/BRIEF.md:75,102,104 — HIGH #5 的委派侧门已回应，但并发防线仍不闭合 — 证据: :75 声明 running worker ≤3，D7 允许 send_to_bot 启动已有 worker，D9⑥ 却只测第4次 create_bot；依次创建并完成4个 worker，再同时 send_to_bot，不触发已定义的拒绝条件 — 建议: create_bot/send_to_bot 启动回合共用原子容量检查，补"4个空闲 worker 同时追加任务，最多3个运行"的断言；明确侧栏人工启动是否计入。
- [MEDIUM] /home/lingxufeng/bot/work/p6-orchestration/BRIEF.md:92 — 0.18 原生折叠行带文本预览，D1 的"B、C全文不可见"不能直接由原组件保证 — 证据: repos/grok-bot-0.18-reconstructed/frontend/src/recovered/features/conversation/workspace/transcript.tsx:602,608 在收起状态仍渲染 entry.text 的 preview；短文本可能完整出现 — 建议: 若接受原生预览，将断言限定为"详情未展开"；若要求完全隐藏，明确最小覆盖，不宣称免费复用即可满足。
- [MEDIUM] /home/lingxufeng/bot/work/p6-orchestration/BRIEF.md:94,156 — 1a 两条可以并行开发，但②完整验收并非无依赖 — 证据: D3 指标明确按折叠纯函数输出计算，该函数由①交付 — 建议: ②提示词与事件采集现在开，D3评分/验收依赖①；DOM验收继续依赖P5-51，不必等待整个UI移植。
核验结论：原7条HIGH中，#1–4、#6–7回应充分；#5执行层禁止委派方向正确，但须补上述并发入口闭环。R2暂定、等待S-1/S-3与D-1再定案的处理充分。
