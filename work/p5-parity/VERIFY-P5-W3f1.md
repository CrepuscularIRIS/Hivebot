# VERIFY P5-W3.f1

> 代录，未经改写。验收员（6.1 Sol，GLM 限流期间改派）没有写文件，以下是它最终回报的原文。证据目录：`evidence/P5-W3f1/`。

- **SHA**：`f3d5560efe3c4108264de148e421b33e25f76541`（收尾时再核对一次，未变；worktree 干净）
- **总结论：FAIL**。共 13 项，9 项 PASS，4 项 FAIL
- **全量回归**：SDK 318/319，UI 单测 399/399，UI E2E 67/68。数量都不低于基线。E2E 跑之前重新 build 过（见 `ui-build.log`）

| 项 | 结论 | 证据与锚点 |
|---|---|---|
| R1 | PASS | 稀疏 tiers 缺 mcp 行时按 default 处理；S:47–49 三例；`shell-ask.mjs:263` |
| R2 | **FAIL** | 直接投影有 toolResult，但聚合 feed 和 tail 投影都是 null（probe）。`R2-expanded.png` 展开后只有命令摘要，没有输出卡。疑似位置 `overrides/modules/model.ts:8–56`：聚合函数内部仍绑定上游投影。major |
| R3 | PASS | U:96–97；对 45 条真实历史做「滚顶 → 切到另一个 Bot → 切回 → 滚顶」，最早一条消息仍可见（`R3-return-A.png`）；`pagination.ts:44–58` |
| R4 | **FAIL** | probe：新消息还没到时，历史里同文本的 `old-u` 被补上了新 nonce，ack 从 1 变成 0。只按文本匹配，证明不了是哪次发送。疑似位置 `shim/src/entries.ts:80–89`、`shim/src/data.ts:178–184`。major |
| R5 | **FAIL** | probe：真实控制器连续重试，wire requestId 依次是 N1、N1、N2，第三次没有复用 N1。第二次重试只回退了一跳，有重复执行的风险。疑似位置 `overrides/modules/acknowledgement.ts:26`、`coordinator-client.ts:21`。major |
| R6 | PASS（文件能力恢复项） | S:50–54；`shell-ask.mjs:199–203`。偏离情况见下文 |
| O1 | PASS | S:80；`start.ts:153–167` |
| O2 | **FAIL** | 与 R4 同一个根因 |
| O3 | PASS | S:55–57；`shell-ask.mjs:220–226` |
| O4 | PASS | U:100 + `O4-notice.png`；`data.ts:164–185` |
| O5 | PASS | S:58–60；`shell-ask.mjs:245–255` |
| O6 | PASS | U:52 + `O6-mark-unread.png`；`coordinator.ts:132` |
| O7 | PASS | U:14–15 + `O7-dark-after-reload.png`；`desktop.ts:44,103` |

## R6 与 Q-013 的偏离（只记事实，留给 L-8）

Q-013 的答复是：工作区内的文件操作 ALWAYS 放行，工作区外的读取要 ASK。PLAN 决策 16 另外规定，missing 等状态下所有 ALWAYS 都退回 ASK。本实现把「候选文件当前都不存在」改成文件工具直接放行，bash 仍然 ASK。状态探针 `r6-state-probe.log` 实测：missing 时是 next，invalid 时是 ask，删除后又是 next。所以这里依据的是文件当前状态，并不是记住「从未 provision 过」。

## [FIX]

- `[FIX] R2`：工具执行完后刷新或切到基线，再展开，看不到输出卡；聚合投影仍然绑定上游。疑似位置 `model.ts:8–56`
- `[FIX] R4/O2`：已有同文本的历史消息时发送新消息，如果先处理历史快照，旧消息会被补上新 nonce。不能只靠文本匹配，要用身份来确认。疑似位置 `entries.ts:80–89`、`data.ts:178–184`
- `[FIX] R5`：N1 失败，用 N2 重试也失败，第三次重试时 requestId 应该始终复用 N1。疑似位置 `acknowledgement.ts:26`、`coordinator-client.ts:21`
- `[FIX] 真模型回归`（SDK 1 例、E2E `d1-real-model` 1 例）：没有 text-delta，live-stream 等了 30s 超时。**主会话注**：这两例走的是 `glm-5.3`，同一时段 GLM 正被 LiteLLM 限流（429，持续约 3h），所以环境原因的可能性最大。GLM 恢复后先复跑这两例，仍然失败才转为修复任务。
