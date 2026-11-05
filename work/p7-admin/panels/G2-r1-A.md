# G2-r1 席 A（6.1 Sol 代 Opus，用户 2026-11-05 授权）

> 代录，未经改写。该席未能写文件，以下为其最终回报原文。

seat: A（席 A=Sol 代）
verdict: REVISE
confidence: high
reverse_take: 最可能失败的是定时回合先开始、授权关联后提交，合法任务被拒或合并任务串权；先证明可信投递身份闭环，再铺管理能力。

- [HIGH] `/home/lingxufeng/bot/work/p7-admin/BRIEF.md:55,173,201` — Q-2b②影响核心定时链是否可完成，不只是反查时序细节，同意席 B 升级为阻塞前置。证据：已直接核对安装制品 `dsh-schedule/lib/index.js:1584–1611`，顺序为 followup → await flush → commit history；中间崩溃可留下持久消息而永久缺失授权关联。「查不到即无 Mandate」安全但会丢合法任务，单纯等待也补不回崩溃缺口。建议：将可信投递—routine 授权桥列为 J2-b/L4 的阻塞前置，规定有界等待、失败记录与恢复策略；增加正常触发成功、history 延迟、flush 后崩溃三条验收，不阻塞无关管理任务。
- [HIGH] `/home/lingxufeng/bot/work/p7-admin/BRIEF.md:55,173,286,289` — 合并投递只取得 taskId 集合，尚未定义集合何时完整、一次派工归属哪个 routine；重叠防护因此也不能闭环。证据：安装制品 `dsh-schedule/lib/index.js:1560,1599–1613` 将同会话周期任务合并，再逐项 await commit 同一个 messageId；查到一条不能证明集合齐全。现有 L4 只测正文伪造 id，未覆盖部分集合和跨 Mandate 拼接。建议：明确可信批次完整性与派工归属规则，每次动作须完整满足同一有效 Mandate，不能拼接不同 Mandate 的动作、目标、参数；覆盖「A 忙/B 闲」「A 撤销/B 有效」「第二条 history 提交前 claim」及合法派工成功正例。
