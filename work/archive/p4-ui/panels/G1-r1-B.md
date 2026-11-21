# G1-r1 · 席 B（6.1 Sol）

> 主会话代录：本席运行约束禁止写文件，以下为其回报原文，未经改写。

seat: B
verdict: REVISE
confidence: high
findings:
- [MEDIUM] /home/lingxufeng/bot/work/p4-ui/BRIEF.md:52,69 — D9 仍写「Q-009 暂定 B」「答 A 之前」，与同文 §9 的「已答 A」矛盾，验收人员无法确定 never preset 的过滤要求是否仍有效 — 证据: /home/lingxufeng/bot/work/QUESTIONS.md:86-90 已明确 A 定稿；BRIEF:69 也确认 A — 建议: D9 删旧状态，明确区分「SDK 尊重用户显式 never」与「P4 不提供权限切换入口、main 继续拒绝 /permission 与 configForms 写」，写出 T-12.f1 未合入时仅哪些验证 blocked。
- [MEDIUM] /home/lingxufeng/bot/work/p4-ui/BRIEF.md:53 — D10b 的 mock 抛错/挂起单测不能替代上游要求的创建过程中 renderer 重载验收；D6 只覆盖创建完成后的退出重开，遗漏了 §8 五条 LOW 中的「重载验收可证伪化」 — 证据: /home/lingxufeng/bot/work/p3-contract/CONTRACT.md:96 明确要求「recipe 已写、#4 未返回时重载 renderer，重开后该 bot 带连接器显示」；同文件:150 将此项列入附加要求 — 建议: D10b 增 Electron E2E：屏障停在 recipe 已落盘、session 已创建而响应未返回时，重载 renderer，断言同一 session 被恢复且连接器配置完整；保留现有失败隔离单测。
- [MEDIUM] /home/lingxufeng/bot/work/p4-ui/BRIEF.md:47 — D4③ 只要求测时并断言命令未执行，没有要求无人应答最终产生拒绝结果；永久 pending 同样可在任意有限观察窗口内通过，不能证伪审批卡永远卡住 — 证据: /home/lingxufeng/bot/work/p3-contract/CONTRACT.md:123 要求无人应答 fail-closed 为 unavailable/拒绝，并验收宽限/超时边界 — 建议: 为无人作答且交互客户端断开的场景设有限测试 deadline，断言最终拒绝/错误终态与零副作用；将宽限内重连补发与超时后不得执行分开验证。
reverse_take: 最可能的失败不是范围扩张，而是桥看似跑通却遗漏创建中重载和审批终态；保留四页、第 2 级集成及 theme 映射路线，补这两条屏障式 E2E 比新增架构更稳。
