# REPORT · P6-04 D3 三段式遵从率实测

> builder 回报，2026-11-03。分支 feat/P6-04（基 c9c2520），commit 4a7600c（38 文件，全部 ⊆ 区域列 evidence/D3/）。工作树 /tmp/bot-wt/P6-04。

## 交付
①score.mjs（283 行）：raw/*.jsonl → `reduce.ts` 归约 → `foldTurns`（P6-01）计分，判定不另写；11 例内嵌自检（--selftest，全绿）；确定性输出（无时间戳，重跑字节一致，diff 验证）。
②全量采集：`node evidence/D3/run.mjs` 10 条 ×3 = 30 回合，glm-5.3-flash @ LiteLLM 127.0.0.1:4001（probe ok），preset p6-reply（段落 sha256 c7c53c4e…356），temperature/topP null（dsh 不传采样，P6-02 口径）。bash 审批经 $events 真实链路自动作答。
③result.json（2716 行，含每回合折叠输出+原文摘要+raw sha256）+ evidence/D3/REPORT.md。

## 结果（BRIEF §6 D3 阈值）
| 指标 | 值 | 阈值 | 判定 |
|---|---|---|---|
| 总回合 | 30/30 turn/end completed（无超时/无 runtime-exit） | | |
| multi pass | **15/15** | ≥12/15 | PASS |
| multi ack 率（首工作工具前非空正文） | 15/15 | | |
| multi result 率（真尾段 result，含 ack-only 计失败口径） | 15/15 | | |
| 兜底 (c)/(d) 触发 | 0 / 0 | | |
| 工具间正文折叠率 | 8/8（另 7 回合中间零话） | | |
| simple pass | **15/15** | ≥14/15 | PASS |
| simple 恰 1 气泡 / 0 工具 | 15/15 / 15/15 | | |
| **D3 判定** | | | **PASS** |

failure 清单：**无**（0/30）。

## 口径落实
- 工作工具 = 排除 send_message / present / ask_user_question（G1-r1-B MEDIUM「ack 自身也可能是工具调用」；本批三者零调用）。
- ack-only 计失败、无工作工具计失败、超时/失败回合计入分母（全记录）。
- .prevN 历史保留不计分；主名 = 最新采集。P6-02 冒烟 3 条已转 .prev2 留档。

## 合规
prompts.json 未动（冻结，git 验证无改动）；凭证不落盘（grep `sk-|P2SDK_LLM_API_KEY=` 空）；/tmp/bot-p6-d3 用后即删；无残留子进程（run.mjs 自清理 SIGTERM→SIGKILL，仅自身 spawn 的 SDK）。本机另有 P5-03/06/21/25 worktree 的 SDK 进程，非本任务产生，未触碰（只查不动，CLAUDE.md §5）。

## 复测
```
cd work/p6-orchestration/evidence/D3
node score.mjs --selftest   # 11 例全绿
node score.mjs              # 重算 result.json（字节一致）
```

未完成项 / 新发现：无。D3 达标，P6-05（preset 段落接入默认链）可按 PLAN 排期（仍 blocked 于 P5-21 合并）。待 verifier 验收。
