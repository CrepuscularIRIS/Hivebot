# Hivebot × Grok Bot 1.1.0 复刻需求文档

> 目标：1:1 复刻 Grok Bot 正式版（1.1.0）的产品体验到 Hivebot，达 C 端可用水准。
> 本文档是本轮开发（2026-11-17 起）的需求总纲与进度台账。

## 1. 需求来源

用户拍板（2026-11-17）：
- 把 Grok Bot 所有功能调研出来，REA 最新版 deb（1.1.0），1:1 复刻到 Hivebot。
- 不按旧工单编号驱动，按功能域竖切推进，每批一个可演示闭环。
- 后端不可达面（语音/金融/团队）全部纳入计划，能复刻 UI 壳的先复刻壳。
- 对齐目标版本：**1.1.0**（0.78.1 已复刻面锚点不变不返工；新面按 1.1.0 锚做）。

架构映射：DSH Superagent = Grok Bot 主 Bot；DSH = 每个独立 bot。

## 2. 现状基线（0.78.1 底座，约 70% 已复刻）

已复刻（0.78.1 规格，e2e 全绿）：消息收发、过程呈现（状态行/头像动画）、composer 基础（@提及+emoji 面板）、侧栏（分区/置顶/隐藏/多选）、连接器市场+grant 审批卡、onboarding、设置 General+Models、快捷键基础批、persona 语气、发消息即顶掉(supersede)、状态行 shimmer、键盘 14 命令、远程连接链（hivebot serve/--connect/Windows 客户端）。

## 3. 批次台账（本轮 17 批，全部合并主线 e2e 回测绿）

| 批 | 功能 | 来源 | 状态 |
|---|---|---|---|
| B1.A | 批量删除后端（软删+archived 持久） | Q-064 → DSH session/delete | ✅ 合并 |
| B2 | 草稿发送失败卡（refused/timed-out + Retry/Discard） | 1.1.0 RE-DRAFT-SEND | ✅ 合并 |
| B3 | outline 全量化（翻页回补并全量 outline） | 0.78.1 A3 | ✅ 合并 |
| B4 | 斜杠命令（new-bot/search/market/keys） | 1.1.0 A8 | ✅ 合并 |
| B5 | Reply 引用回复链（标记协议+预览+线程） | 0.78.1 A5 | ✅ 合并 |
| B6 | Spotlight quick-chat（Alt+Space 全局呼出） | 1.1.0 新面 | ✅ 合并 |
| B7 | bot 经营面（knowledge 三合一入口） | 0.78.1 RE-botmanage | ✅ 合并 |
| B8 | 调色板 1.1.0 迁移（76+78 token 换值） | 1.1.0 全局视觉 | ✅ 合并 |
| B9 | Good/Bad 反馈卡（thumbs+Thanks+本地持久） | 1.1.0 新面 | ✅ 合并 |
| B10 | per-tool 三档权限（always/never/ask 设置面） | 1.1.0 新面 | ✅ 合并 |
| B11 | 视觉基准图组（对话/outline/agent-settings） | 自检 | ✅ 合并 |
| B12 | 听写 Dictate（webkitSpeechRecognition） | 0.78.1 A2 | ✅ 合并 |
| B12.1 | 语音 stub 诚实化（transcribe 拒绝+可重试） | — | ✅ 合并 |
| B13 | outline subagent tabs（shim raw.subagents） | 0.78.1 | ✅ 合并 |
| B14 | async tasks 面板开闸（Show async tasks） | 0.78.1 | ✅ 合并 |
| B15 | 设置 Updates 区开闸（General/Updates/Models） | 0.78.1 | ✅ 合并 |
| B16 | 代码块 shiki 高亮（17 语言+github-dark） | 1.1.0 A9 | ✅ 合并 |
| B17 | 附件发送链（staging→发送→📎 行） | 0.78.1 A7 | ✅ 合并 |
| B17b | 图片附件缩略图（UserMessageContent images 修复 + staging data URL） | 0.78.1 A7 | ✅ 合并 |
| B18 | General 区行序对齐 0.78.1（Bot 区更名+Language/Spell check/通知音/硬件加速+SecurityKey 恢复） | 0.78.1 GPANE | ✅ 合并 |
| B19 | transcript 分页细化（sentinel+observer 触发/loading/failed 状态行/页大小 200） | 0.78.1 eager-app | ✅ 合并 |
| B20 | i18n 框架评估（结论：不做 catalog 重建；语言切换消费端最小接线 lang/dir） | 0.78.1 FormatJS | ✅ 合并 |
| B21 | Tasks 任务岛（侧栏行+跨 agent 看板；progress-only 落地，done/review/attention 无数据源恒空——shim 只有 running worker 投影） | 1.1.0 chunk-view | ✅ 合并 |
| B22 | 视觉收官：B18–B21 新面基准图组（e2e 截图 5 张入 evidence，目检过 RE 布局锚） | 自检 | ✅ 合并 |

进行中：无（B22 已合并收尾，2026-11-18）。

## 4. 明确 deferred（记档不做）

- 语音通话/金融虚拟卡/团队 bot 后端/Slack-Teams 真集成/1Password vault/手机 iMessage：行为在 xAI 云端或 macOS 守护进程，UI 壳可复刻但后端不可达——按「复刻壳+接 dsh 能接的」处置，纯后端面暂不做。
- i18n 36 语：主线零 i18n 框架，2300 串×36 语超单批——候选批次。
- Data sharing 账号级开关：DSH 无对应后端，假开关不如不做。
- Dock/托盘：macOS 平台域。
- 消息 regenerate/retry：0.78.1 与 1.1.0 均无此面（RE 实证），B2 草稿重发已覆盖传输层。

## 5. 后续候选批次

i18n 框架评估（✅ B20：结论不做 catalog 重建，消费端已接线）→ tasks 任务岛（✅ B21：progress-only 落地）→ 视觉打磨收官轮（✅ B22：新面基准图组入 evidence，候选清空）。

## 6. 验收口径

每批：TDD（单测先行）→ e2e（真实浏览器 DOM 断言）→ 跨批回归 → 主线合并后回测 → work/LOG.md 记档。
安全单（T73d/T93 链）等经理终验，不走代偿路。
