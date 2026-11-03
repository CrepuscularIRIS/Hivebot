# REPORT-P5-28 · 提问作答 main 分支（C2 ⑥）

> 主会话代录（builder 写报告被拦），2026-11-03

分支 feat/P5-28 @ eb6e73a（基 c6aba1b），6 文件 +419/-16：ledger.ts（问题 id 集入账 + invalidQuestionAnswersReason 纯校验）、m1-api（$events/result 按事件类别分支，id 集合恰等、无序）、m2-mux（testAnswerEvent 签名扩 answers）、单测×2、e2e questions-answer.spec（新）。

## 验收 ①②③全过
① 合法 answers 原样透传（dsh.calls[0] 逐字段相等）+ tool/result 含同批 id；e2e 走 renderer 生产路径两批（window.pbots.api 与扩展钩子）② id 缺/多/类型错/对审批传 answers → pbots/invalid-args 且 dsh 计数 0（it.each + e2e 抽验）③ 同 eventId 二次作答拒（成功即消费；e2e 含 reload 重连）

## 测试
build ✓；vitest 271/271；e2e 62 passed (6.9m)；TDD 实现前 20 红基线。复测：全量 e2e 须前台 xvfb-run（后台任务系统吞输出无 last-run）。
新发现：无。renderer 提问卡=P5-33 范围外。
