# G2-r1 席 B（6.1 Sol）

> 代录，未经改写。该席受运行约束不能写文件，以下为其最终回报原文。

seat: B
verdict: REVISE
confidence: high
reverse_take: 最可能失败在“worker 已结束、回报尚未持久送达”的重启窗口；先闭合非 user 投递与恢复，再把安全、可见性和真链路验收一起作为开放闸前置。

findings:
- [HIGH] `/home/lingxufeng/bot/work/p6-orchestration/PLAN.md:32,82,85` — **“非 user 回报直接复用 dsh 持久 requestId 去重”的依据不成立，恢复协议也未闭合。** — 证据：所引 dsh 源码 `/home/lingxufeng/bot/repos/deepseek-harness/packages/api/session-controller/src/commands.ts:542-552` 的去重仅匹配 `source.kind === 'user' && source.rpcId === requestId`；Agent 的 `followup/inject` 本身只是插入 inbox（`packages/core/agent-loop/src/agent.ts:170-188`）。反而 SA `/home/lingxufeng/bot/repos/dsh-superagent-prototype/src/app/delivery.ts:40-84` 明确自行读取历史、检查 pending、使用稳定 messageId 并 flush。PLAN 尚未规定 Assignment→worker turn 的持久关联，以及“worker 已终态但回报未投递”如何恢复；P6-09(d) 和 P6-12⑤只覆盖运行中重启。— 建议：把非 user 幂等投递列为 P6-09 独立硬结果；不足时按第 3 级改造 SA delivery。明确利用现有会话事件持久记录的 Assignment/turn/投递关联，不必新建数据库；补“终态后投递前、持久接受后回执前、合批投递中”三个崩溃点及重复恢复断言。该地基未通过应回 director，不能仅视为 P6-12 内部路径调整。

- [HIGH] `/home/lingxufeng/bot/work/p6-orchestration/PLAN.md:34,88-94,119` — **P6-14b 可在 worker 可见性、通知呈现、真审批闭环及真模型路由验收之前开放生产工具。** — 证据：开放闸 deps 不含 P6-15、P6-16、P6-17、P6-20；这些任务可能与开放闸同时执行或尚未完成。此时主 bot 已可创建 worker，但默认隐藏、回报非用户气泡、跳转原审批卡等用户旅程尚无完成保证。设计输入 `/home/lingxufeng/bot/work/p6-orchestration/design/main-orchestration-opus.md:88` 也明确要求隐藏与注意力保障不能拆开上线。— 建议：P6-14b 至少依赖 P6-15/16/17/20；若 OS critical 通知是第一批承诺，再依赖 P6-18。显式 patch 继续承担开发/demo 入口，无须提前开放生产默认链。

- [HIGH] `/home/lingxufeng/bot/work/p6-orchestration/PLAN.md:32,85` — **“每个 Assignment 恰 1 项回报”与 blocked 后继续完成的必需流程相矛盾，去重键也无法区分同一 Assignment 的多个待人工事件。** — 证据：P6-12①要求每个 Assignment 恰 1 项；④又要求挂起时产生 blocked 项；P6-17/D8要求作答后最终结果再回主 bot，因此同一个 Assignment 至少可能有 blocked、completed 两项。决策 17 的投递键仅为 `<assignmentId>:<kind>`，未包含审批/提问 eventId，而④又声称按 eventId 去重。— 建议：分开定义“终态回报恰一次”和“每个待人工 eventId 通知恰一次”；规定 kind 的枚举及去重键，补同一 Assignment 连续两次提问、一次审批后完成的测试。合批的一条消息如何承载和恢复多个去重项也须明确。

- [MEDIUM] `/home/lingxufeng/bot/work/p6-orchestration/PLAN.md:67,83-87,92,117` — **声明的文件隔离与真实接线需求不一致，第二波并非可直接按当前区域机械并行。** — 证据：通用约定已承认各任务要改 `orchestration/index` 注册行，但 P6-11/12/14 的区域只允许各自新文件；P6-18只允许新建 `main/notify/` 和测试，却要获取 ledger、窗口及打开 worker 的实际能力。现有主进程组装在 `/home/lingxufeng/bot/app/ui/main/index.ts:234-255`，其中创建 M3、组装 M1/M2并共享 ledger，不能靠新增一个无人调用的目录完成通知接线。— 建议：将共享注册/启动接线明确归给一条集成任务，或给各任务补准确共享文件并串行合并；不要把三方对照当作“区域零交叠”的替代。

- [MEDIUM] `/home/lingxufeng/bot/work/p6-orchestration/PLAN.md:83,93,115-116` — **D3′冻结顺序只有波次约定，没有任务图依赖。** — 证据：P6-19验收要求 prompts 的提交早于任何工具 description 文案；P6-10负责注册工具及路由 description，却只依赖 P6-09。第 0 波允许 P6-19与 spike 并行，若 spike 先返回，P6-10即可按 deps 开工，破坏 held-out 的时间前置。— 建议：P6-10增加 P6-19依赖，或将“冻结提交已存在”设为工具文案任务的可执行前置检查。第 0 波的文件隔离成立，但后续依赖尚未保证冻结先行。

- [MEDIUM] `/home/lingxufeng/bot/work/p6-orchestration/PLAN.md:7,18,33,83-87` — **复用引用覆盖了多数原语，但不足以宣称所有自建剩余能力已完成搬运阶梯反向确认。** — 证据：`/home/lingxufeng/bot/work/p6-orchestration/reuse/r06-host-tools.md:239` 明言“没有自建结论”“没有声称 GitHub 搜遍没有现成方案”，并要求 director 对剩余自建适配说明现有能力在哪个可证伪需求上不够；`reuse/s1-superagent-maintenance.md:47` 同样声明未另找候选、不构成自建许可。用户已批准 R2，所以不应重新争论总路线，但身份/容量、Assignment恢复、合批投递等剩余自建责任仍需要逐项映射。— 建议：补一张简短能力索引，列“现有复用位置／缺口／最少自建内容／反向确认依据”；优先补可靠回报部分，而非再做一轮框架大选型。

- [MEDIUM] `/home/lingxufeng/bot/work/p6-orchestration/PLAN.md:55-61,76,132-138` — **P5交叠清单及验收基准尚未完全同步。** — 证据：现场 `git -C /tmp/bot-wt/P5-W3f1 diff --name-only main...HEAD` 还包含 `app/ui/tests/e2e/p6-fold.spec.ts`，PLAN列举中遗漏；`/home/lingxufeng/bot/work/p5-parity/REPORT-P5-W3f1.md:65,70` 说明该文件因 R6 审批语义变化已被修改。另 PLAN §6仍把 D4/D5/D9及新 D11/D3′列为“需同步”，当前 BRIEF D4仍写 main #4、D5仍写排队首，与新计划不一致；协议 `/home/lingxufeng/bot/docs/harness/PROTOCOL.md:81` 要求 DONE变更进入 BRIEF修订账。— 建议：以 W3.f1最终 SHA更新完整文件清单，把 p6-fold适配纳入合并后回归；在本轮回应中同步 BRIEF及批准依据，形成唯一验收基准。P6-05的单行 approval.yml改动与现场 W3.f1文件清单没有直接交叠，可以独立推进。
