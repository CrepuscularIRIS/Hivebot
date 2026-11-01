---
description: 多模型盲评 / 决策投票（A=Opus 5.5 · B=6.1 Sol · C=6.1 Sol），最多 2 轮，机械汇总并落盘
argument-hint: '<G1|G2|GU|G3|D> <slug> <要审的文件或决策题> [关注点]'
---

按 `docs/harness/PROTOCOL.md` §5 跑一轮 panel。参数：`$ARGUMENTS`

1. 确定轮次 n：看 `work/<slug>/panels/` 下同一 gate 已有几轮，新一轮为 n+1。**最多 2 轮**：第 2 轮仍为 REVISE → 记为「有条件通过」，必须回应清单原样转成 PLAN 的首批任务（或 BRIEF 修订账），不再开第 3 轮；第 2 轮为 BLOCK → 停止，交用户拍板。
2. **同一条消息里并行派 3 个 `judge`**，提示词逐字相同，只改 seat 字母：
   - seat A → `model: "fable"`
   - seat B → `model: "sonnet"`
   - seat C → `model: "sonnet"`（原 K3.1 Pro，2026-10-28 起无额度，改用 6.1 Sol）

   提示词内容：闸门 id、slug、待审文件路径（或 D 题干 + 选项）、关注点、本席原文的落盘路径 `work/<slug>/panels/<gate>-r<n>-<席>.md`。不要加入你自己的看法。
3. 汇总，**机械执行，不加判断**：
   - 裁决席：GU 用 A+C，其余用 A+B
   - 任一裁决席 BLOCK 且附证据 → BLOCK；两个裁决席都 PASS → PASS；否则 → REVISE
   - D 题：多数票。涉及安全或不可逆操作时须 A 与 B 一致；三票各不相同 → 交 director 裁定
   - 所有席位带证据的 BLOCKER/HIGH → 列入「必须回应清单」
4. 写入 `work/<slug>/panels/<gate>-r<n>.md`，内容依次为：三席结论表（含原文文件链接）、汇总结论、必须回应清单。**不要转录三席原文**，原文已由各席自己落盘。在 `LOG.md` 记一行。
5. 结论处理：PASS → 进入下一阶段；REVISE/BLOCK → 把清单交回作者（director / frontend-dev）修改，改完重新跑 `/panel`。
