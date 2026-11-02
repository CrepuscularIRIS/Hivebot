# G1-r2 · 席 B（6.1 Sol）

> 主会话代录：本席运行约束禁止写文件，以下为其回报原文，未经改写。

seat: B
verdict: REVISE
confidence: high
findings:
- [HIGH] /home/lingxufeng/bot/work/p4-ui/BRIEF.md:52,58 — W0 新增「不做 §2.2 参数约束」，与 D9「全部拒绝为永久判据」冲突；spike 豁免明确保留的只有凭证/account 和 §8-3 两类，未保留 installBundle 强制 enabled:false、审批 outcome/clientId/eventId 校验，可能在真实审批往返中放过 allowed-always 或错配作答 — 证据: BRIEF:58 的直通和豁免原文；BRIEF:52 的无条件拒绝；/home/lingxufeng/bot/work/p3-contract/CONTRACT.md:59-61,125 明确这些约束由 main 强制 — 建议: 转 W0 派发附加要求：spike 也保留上述安全参数校验及拒绝测试；可省业务完整性、重连健壮性等非安全实现，不能省安全边界。
- [MEDIUM] /home/lingxufeng/bot/work/p4-ui/BRIEF.md:47 — D4③ 的「decided≠allowed」不是精确的拒绝断言：上游字段是 outcome，批准值为 allowed-once，按字面不等比较也会通过 — 证据: /home/lingxufeng/bot/work/p3-contract/CONTRACT.md:107,118-120,125 — 建议: 转 W1 验收附加要求：明确接受的拒绝/错误终态集合；禁止用"不等于 allowed"代替，要求实际事件字段可断言且全程零副作用。
reverse_take: D9 与 §2/§8/§9 已同步，W0 前置和一天止损、八项 MEDIUM 均已有落点；最可能失败的是 spike 为求快跳过安全校验，随后被沿用成正式桥，最稳的是从首日保留最小拒绝测试。
落盘说明：本席运行约束禁止写评审文件，请主会话将本原文代录至 work/p4-ui/panels/G1-r2-B.md；不需第三轮，清单转 W0/W1 附加要求。
