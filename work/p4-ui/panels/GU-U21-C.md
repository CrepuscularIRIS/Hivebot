# GU-U21 · 席 C（6.1 Sol）

> 主会话代录：本席运行约束禁止写文件，以下为其回报原文，未经改写。

seat: C
verdict: REVISE
confidence: high
findings:
- [MEDIUM] /home/lingxufeng/bot/app/ui/renderer/plugins/session/Conversation.tsx:70–76 — 断线丢草稿须修后接受 GU，但不构成 BLOCK — 证据: 对实际 send 函数的内存探针确认，Promise reject 后草稿为空且无错误提示；失败返回还会覆盖等待期间的新输入 — 建议: 捕获异常，保留待发送文本，恢复时不得覆盖新草稿。
- [LOW] /home/lingxufeng/bot/app/ui/renderer/plugins/session/Conversation.tsx:68–91 — 永久停止态不阻塞本次 GU，可归 U-22 — 证据: 实际按钮回调探针确认 cancelTurn reject 后 stopping=true、无复位；切换 bot 可通过组件重挂恢复 — 建议: 捕获拒绝并复位，补失败路径测试。
- [MEDIUM] /home/lingxufeng/bot/work/p4-ui/VERIFY-U-21.md — 指定验收报告不存在，不能独立确认其 SHA、实测结果与已知 FIX 全文 — 证据: Read 返回不存在，fs.existsSync=false — 建议: 补交报告；D2/D4 收口仍按已定范围归 U-22，不冒认本次已验。
reverse_take: 已亲验并排封面、亮暗会话与审批截图，视觉整体接近原版；token 表除来源注释外完全一致，D9 未见权限切换入口；最大风险是正常路径漂亮、断线路径丢用户输入。
