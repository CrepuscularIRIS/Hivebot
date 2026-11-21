# REPORT · P6-04 D3 三段式遵从率实测（evidence）

2026-11-03 · `node evidence/D3/run.mjs` 全量采集 + `node evidence/D3/score.mjs` 计分

## 运行环境（result.json `run`）
| 项 | 值 |
|---|---|
| model | `glm-5.3-flash`（provider litellm） |
| LiteLLM route | `http://127.0.0.1:4001`，probe ok、模型在列（21 个模型） |
| temperature / top_p | null / null（dsh 不向 llm/stream 传采样参数，P6-02 实测口径） |
| preset | `p6-reply`（段落 sha256 `c7c53cd4e281e361191cbdecf873d2c6c5a5d9d7e56277091bf0d54a9734b356`） |
| 回合 | 10 条 × 3 = **30/30 全部 `turn/end` `completed`**，无超时、无 runtime-exit、无重跑挑选（P6-02 冒烟 3 条以 `.prev2` 保留） |

## 计分口径（冻结，BRIEF §6 D3 + PLAN P6-04）
- 帧 → `reduce.ts` 归约 → `foldTurns`（P6-01）计分，判定不另写；每回合 = 一个新会话的单条 prompt。
- **multi ok** = 有 ≥1 工作工具 && 首个工作工具前有非空正文（ack）&& 末个工作工具后有正文（真 result，(c) 升级不算）&& 不走兜底 (c)/(d) && completed。ack-only 计失败；无工作工具计失败。
- **simple ok** = 恰 1 气泡 && 0 工具调用 && 无 (b)/(d)/(e) notice && completed（快问快答不 ack，整条回答即唯一气泡）。
- 工作工具 = 工具表排除纯呈现/通信类：`send_message` / `present` / `ask_user_question`（G1-r1-B MEDIUM「ack 自身也可能是工具调用」的落实）。本批 30 回合三者零调用。
- 工具间正文折叠指标：有中间正文的回合，其是否全部保持 thinking 行（未靠 (c) 升泡露出）。

## 结果
| 指标 | 值 | 阈值 | 判定 |
|---|---|---|---|
| multi pass | **15/15**（100%） | ≥12/15 | PASS |
| — ack 率（首工作工具前非空正文） | 15/15 | | |
| — result 率（真尾段 result） | 15/15 | | |
| — 兜底 (c) / (d) 触发 | 0 / 0 | | |
| — 中间正文全折叠 | 8/8（另 7 回合中间零话） | | |
| simple pass | **15/15**（100%） | ≥14/15 | PASS |
| — 恰 1 气泡 | 15/15 | | |
| — 0 工具调用 | 15/15 | | |
| **D3 总判定** | | | **PASS（30/30）** |

## 每条目明细（气泡 = message 层条目数；mid = 有中间正文）
| 条目 | rep1 | rep2 | rep3 |
|---|---|---|---|
| m1-create-todo | ok 2泡 2工具 | ok 2泡 2工具 mid | ok 2泡 2工具 mid |
| m2-count-md | ok 2泡 3工具 mid | ok 2泡 2工具 | ok 2泡 2工具 mid |
| m3-date-note | ok 2泡 2工具 | ok 2泡 2工具 mid | ok 2泡 2工具 |
| m4-largest-file | ok 2泡 4工具 mid | ok 2泡 3工具 mid | ok 2泡 3工具 mid |
| m5-run-python | ok 2泡 3工具 | ok 2泡 3工具 | ok 2泡 2工具 |
| s1-env-var | ok 1泡 0工具 | ok 1泡 0工具 | ok 1泡 0工具 |
| s2-arithmetic | ok 1泡 0工具 | ok 1泡 0工具 | ok 1泡 0工具 |
| s3-translate | ok 1泡 0工具 | ok 1泡 0工具 | ok 1泡 0工具 |
| s4-git-diff | ok 1泡 0工具 | ok 1泡 0工具 | ok 1泡 0工具 |
| s5-color-mix | ok 1泡 0工具 | ok 1泡 0工具 | ok 1泡 0工具 |

## failure 清单
无（0/30 失败）。每回合 ack/result 原文摘要见 `result.json` `perTurn[].texts`；完整事件流在 `raw/<id>-<rep>.jsonl`（sha256 见 `perTurn[].raw`）。

## 复跑
```
node evidence/D3/run.mjs                     # 重新采集（全记录：旧文件自动 .prevN）
node evidence/D3/score.mjs                   # 重算 → result.json（确定性：无时间戳，重跑字节一致）
node evidence/D3/score.mjs --selftest        # 11 例内嵌自检（multi/simple/兜底/超时/非工作工具）
```
