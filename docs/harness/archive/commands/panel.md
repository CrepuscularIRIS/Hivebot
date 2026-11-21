---
description: 双模型盲评 / 决策投票（A=Opus 5.5 · B=6.1 Sol，两席都是裁决席），最多 2 轮，机械汇总并落盘
argument-hint: '<G1|G2|GU|G3|D> <slug> <要审的文件或决策题> [关注点]'
---

按 `docs/harness/PROTOCOL.md` §5 跑一轮 panel。参数：`$ARGUMENTS`

决策核心只有两个模型：Opus 5.5 和 6.1 Sol（用户 2026-11-01 定）。K3.1 Pro 不用；GLM 只写代码和做 code review，不进 panel。

1. 确定轮次 n：看 `work/<slug>/panels/` 下同一 gate 已有几轮，新一轮为 n+1。**最多 2 轮**：第 2 轮仍为 REVISE → 记为「有条件通过」，必须回应清单原样转成 PLAN 的首批任务（或 BRIEF 修订账），不再开第 3 轮；第 2 轮为 BLOCK → 停止，写进 `work/QUESTIONS.md`（类型：卡住）。
2. **同一条消息里并行派 2 个 `judge`**，提示词逐字相同，只改 seat 字母：
   - seat A → `model: "fable"`（Opus 5.5）
   - seat B → `model: "sonnet"`（6.1 Sol）

   提示词内容：闸门 id、slug、待审文件路径（或 D 题干 + 选项）、关注点、本席原文的落盘路径 `work/<slug>/panels/<gate>-r<n>-<席>.md`。不要加入你自己的看法。judge 写不了文件时，你把它的回报原样代录到该路径，并标注「代录，未经改写」。
3. 汇总，**机械执行，不加判断**：
   - G1 / G2 / GU / G3：任一席 BLOCK 且附证据 → BLOCK；两席都 PASS → PASS；否则 → REVISE
   - D 题：两席投同一个选项 → 通过。两席不一致 → 写进 `work/QUESTIONS.md`（类型：取舍），附两席理由；如果两个选项都可逆，先按「改动更小、更容易回退」的那个做，标「暂定 Q-xx」，否则阻塞相关任务
   - 两席所有带证据的 BLOCKER/HIGH → 列入「必须回应清单」
4. 写入 `work/<slug>/panels/<gate>-r<n>.md`，内容依次为：两席结论表（含原文文件链接）、汇总结论、必须回应清单。**不要转录两席原文**。在 `LOG.md` 记一行。
5. 结论处理：PASS → 进入下一阶段；REVISE/BLOCK → 把清单交回作者（director / frontend-dev）修改，改完重新跑 `/panel`。
