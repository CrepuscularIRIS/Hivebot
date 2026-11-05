# p7-admin · 当前派工复用决策

以 PLAN v1.1 为范围；旧调研中更重的 Mandate/SB 设计不生效。总索引见 PLAN §2；原管理复用证据见 [admin-reuse](reuse/admin-reuse.md)。本表仅登记已具证据的派工决策，不把未完成项写成完成。

| 行 | 能力 | 决策与固定来源 | 边界 / 证据 |
|---|---|---|---|
| R1/R4（F3） | 身份、受限通道、恢复投影 | 复用本仓已合并 F1 operations 与 F2 origin/channel，以及现有 P6 Assignment/delivery/M3 restore；不增加第二授权数据库或状态机 | F1/F2 原模块范围 PASS 不等于 PLAN v1.1 分层权限全部完成；F3 不扩大授权，管理动作尚未接线 |
| R8（P7-R2） | 先存后做、恢复说明、Report 文本 | 第3级改造：`deepseek-ai/dsh-superagent-prototype@6337fc823ce20251c8de8085948165c81aaa701e:docs/003-execution.md`、`src/core/assignments.ts`、`prompts/work.md`；MIT。只取最少文本/语义，执行沿用 F1/P6 | [固定来源、许可证与适配](reuse/sa-skill-adapters.md) §固定来源；[探针](evidence/P7-R2.txt) 退出码0，14检查通过。F3调研前置齐；不启SA runtime、不搬Ticket/Mandate/SQLite Effects、未知副作用不自动重放 |
| R9（暂不派L5） | 两验证playbook与技能加载 | pstack文本第3级改造，已装dsh skill包现成接口复用；详细来源见R2报告 | 裸profile/skills不加载；需先把start.ts及对应测试加入L5白名单。旧P6 §12.3契约未找到，不能冒充可信退出码接口已存在；L5未解锁 |

补充复用决策（2026-11-05）：F1.f2沿F1/R4修现有OperationsLedger持久化与close生命周期；F2.f2沿F2/R1/R4修authority既有H1/单grant动作目标关系及consumer既有回复过滤；两者都是本仓现有能力缺陷修正，不新增框架/授权数据库/依赖。发现与复现见 `evidence/review-e5ff286/{A,B}-REVIEW.txt`。

R6/R7（P7-R1，限定调研）：集成现有锁定 `@deepseek-ai/dsh-schedule@0.2.2-alpha.2`（MIT），仅复用持久投递与提交后归属查询；正常真实投递成功。claim/pre-step早于receipt、合批删除后仅剩部分history、删除不撤回旧inbox均实测；逐routine安全自动准入仍blocked，不复活SB、不加授权数据库/第二scheduler。证据 `evidence/P7-R1.txt`；本轮未重查上游维护，未产出q2b Markdown，产品扩展白名单为空。

本地浅仓日期不等于完整上游维护核验；本次仅批准文本改造及现有锁定依赖复用，不新增第1/2级依赖。参考仓只读，复制文本须注明来源URL@完整SHA:path与许可证。
