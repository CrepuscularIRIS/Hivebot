# REPORT · P6-01 三段式折叠纯函数

> 主会话代录（builder 写报告被拦），2026-11-03

分支 feat/P6-01 @ c43dcaa（基 5b4b16e）。2 新文件 +303：app/ui/renderer/fold/turn-fold.ts + tests/unit/fold/turn-fold.test.ts（33 例）。plugins/ 零改动。

## 语义（三件套全落实）
输入=reduce.ts 归约结果 items+{hasMore,running}，只 import type 不改 reduce.ts。输出 FoldEntry[]（user/message(ack|result)/thinking(text|reasoning)/tool-call/notice）+streamingAs。只折正文 text 块；reasoning（id -r）永不升气泡不参与判定。回合终态从 end-<turn> notice 推断（danger=error、muted=stopped 原样透传）；只有 completed 升 result：尾段位移升气泡；(c) 升最后一段中间正文（移动不复制）；(d) 仅「有工具且全程无正文」触发（ack-only 边界钉死）；(g) 页首片段全按中间文本不判 ack。决策 6 上限有 ponytail: 注释（通知唤醒首步即工具的回合，P6-12 兜底）。

## 验收
①D1 函数层 ②D2 七格（(e) 三枚举 post-reduce 同形属预期 reduce.ts:99 三合一、(f) 两变体、(g) 片段+拼合重算）③不变量 15 例（每 id 恰 1 次、reasoning 恒 thinking）④多回合——全 PASS。build 绿；全量 29 files/278 绿（需先装两包依赖）；tsc 与 main 逐字节一致。

## 非阻断观察
①(c) 升级位置停原位不贴回合尾（GU 可裁）②多段 pre-tool/尾正文逐条 1:1 不合并（未被验收约束）。
对后序输入：P5-51/P6-04 直接 import foldTurns；EMPTY_RESULT_NOTICE 已导出。
