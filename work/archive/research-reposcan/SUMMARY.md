# Repo Scan 汇总（2026-11-08，3 路 Sol scout）

三份分报告（各自独立、口径注明）：scout-a-claudecode.md（Claude Code 生态 5 面向 13 仓+42 项 checklist）/ scout-b-grok-dots.md（Grok Bot+dots+竞品对照大表）/ scout-c-orchestration.md（编排业界+差距清单+top5 借鉴）。

## 一、我们已有的（不重做）
桌面入口/多 bot 名册/独立会话/T33 bot 认知（今天上线）/skill 库/bwrap 沙箱/审批卡/编排层代码全量（T34 开闸中）/SSH 远端/市场底座。

## 二、按 scout 建议的待做清单（优先级=三报告交集，非立项授权）
### 高（编排开闸后的产品契约——scout C 差距表）
1. **稳定寻址与回执**：bot/session/run/input 永久 ID；发送→入队→执行→投递各步回执；「发给既有 bot」而非每次新建
2. **durable mailbox + 恢复不丢不重**：SDK 重启/断线后消息不丢、不重复执行、不投错人（crash/timeout/reset 用例）
3. **消息 provenance + send-only ACL**：bot 间消息是数据不是授权；禁止权限洗白；「可发消息」与「可读历史/可控制」分离
4. **worker 可观察可接管**：idle/blocked/error 区分、用户可直达 worker 会话继续；失败不得显示成 done
5. **workspace/能力受控生命周期**：child 结果以 artifact 引用传递而非放宽挂载；skill 变更经审阅快照可回滚
### 中
6. 会话搜索/fork/恢复入口盘点（scout A 高但属 UI 细）
7. 自装插件的安装闭环：可审批、可追踪、可撤销（scout A：「自装」≠无审批执行）
8. reload/reconnect/restart 三者分开的恢复语义（恢复聊天≠恢复团队≠安全续跑）
9. bot 间忙/闲/离线状态 + 完成通知语义统一
10. Room/群聊多 bot 自主协作（原版有、我们 L12 未交付——远期）
### 低/待核
11. 头像/AI 生头像、设备同步、联邦（OpenMausBot 请求中）等

## 三、外部事实（scout B）
- dots = OpenAI 常驻个人助手（2026-09 发布）；Grok Bot 复刻生态：0.18-reconstructed（我们已用作参考仓）、OpenBot、OpenMausBot、Rakazo 等——**无完整 0.78/0.79 复刻**
- 维护陷阱：AutoGen 停维护、Swarm 被 OpenAI Agents SDK 替代、Flowise/Daytona 归档——选型时避开
- 原版 Grok Bot 语义锚点：主 bot=协调者（Q-035=A 已拍板对齐）、群聊多 bot、连接器生态

## 四、与在途工单的映射
- T34（开闸）→ 高 1/4 的前置；T35（生产模型复测）
- T27（用户编排研究）→ 高 1-4 全域（scout C top5 是其输入）
- T7bf/T7bg/5d″/7b⁵′ 等既有提议行不变
