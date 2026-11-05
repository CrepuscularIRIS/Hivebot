# G1-r1 席 B（6.1 Sol）

> 代录，未经改写。该席未能写文件，以下为其最终回报原文。

seat: B
verdict: REVISE
confidence: high
reverse_take: 最可能失败于把"可信来源的新回合"误当成"干净上下文"，让旧回报中的指令借自主续派重新获得管理权限。

findings:
- [HIGH] `/home/lingxufeng/bot/work/p7-admin/BRIEF.md:82–88,108` — **三分类没有覆盖跨回合污染**：即使新受托消息只含结构化字段，先前回报正文仍留在同一 session 上下文，后续开放工具时仍能影响模型；"只看结构化字段"目前只是行为约定 — 证据：`work/p6-orchestration/PLAN.md:50` 明确记录"回报文本留在上下文，可影响之后的用户回合"；p7 将之后的回合改为无人值守 — 建议：D-1 必须明确正文不进入自主决策上下文的执行边界，并增加"先投递恶意回报、再由 goal/schedule 唤醒"的跨回合反例，断言越出预授权范围的管理执行为 0。
- [HIGH] `/home/lingxufeng/bot/work/p7-admin/BRIEF.md:84–86,105–108` — **把"未知来源拒绝"误写成 P6 已有保障**，导致安全改动范围和回归基线不准确 — 证据：`app/sdk/src/orchestration/turn-origin.mjs:3–7,19–21` 及 PLAN:229 的最终口径是只认 `pbots-worker`；实际运行 `classifyTurn(['unknown-source'])` 返回 `tainted:false`，`schedule` 同样不拦 — 建议：以 R2-1 为实际基线，把新增事件来源、未知来源拒绝及内部来源兼容明确列进 D-1 改动与验收，而非声称"保持决策29"即可。
- [HIGH] `/home/lingxufeng/bot/work/p7-admin/BRIEF.md:163,171` — **自动续派既写成需用户 C2，又与限制性措施一起写成"默认按收口执行"**；扩展自主权限不是收口，实施闸门存在冲突 — 证据：QUESTIONS.md:206 仍告知不会自动派下一步；BRIEF:163 要用户 C2，:171 却未要求答复前禁止启用 — 建议：拆开 U-3：构建脚本/密钥限制可默认执行；自动续派须明确替代原告知及授权状态，在确认前只能开发和隔离验证，不进入默认自主链。
- [HIGH] `/home/lingxufeng/bot/work/p7-admin/BRIEF.md:56,76,141,162` — **自重启要求代际就绪，却没有把地址/凭据重新交接写成强制条件或 DONE**；同地址重连通过不足以证明真重启可用 — 证据：`reuse/admin-reuse.md:147–152` 已确认 main 启动时读取固定地址/token，新代变化必须安全交接；M6 仅测新代 restore 与 M1/M2 门控 — 建议：M6 增加新端口、新 token 的真实重启，验证 main 切到新代、旧代连接/回执不得开闸、模型结果不含 token；补 SDK 意外退出及副作用已发生但完成回执未落盘的恢复反例，验证 J3 不重放。
- [HIGH] `/home/lingxufeng/bot/work/p7-admin/BRIEF.md:74,94–98,143` — **核心"可回退"承诺与验收相互矛盾**：新建撤销为归档，安装撤销为停用，均不会回到操作前完整状态，M8 的"diff为空"无法按字面通过；停用也不撤销安装期副作用 — 证据：`reuse/admin-reuse.md:88,120–125` 明确安装是宿主代码执行面、文件/构建副作用不保证回滚 — 建议：按操作定义可恢复的业务状态投影及允许残留，不承诺全状态恢复；新增撤销前后能力/引用状态对照，并说明已执行代码及外部副作用不属于撤销保证。
