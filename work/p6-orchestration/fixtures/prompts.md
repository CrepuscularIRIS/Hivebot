# P6-02 · D3 冻结提示集（prompts.md）

冻结于 2026-11-03，与 `work/p6-orchestration/evidence/D3/prompts.json` 同一 commit（`feat(p6): 冻结 D3 提示集`），早于 `app/sdk/profile/patches/p6-reply-style.yml` 的首个提交。**提示全文（唯一数据源）见 prompts.json**；本文只写冻结语义与预期要点，不重复全文，防双写漂移。

## 冻结语义（BRIEF v2.1 §6 D3 口径）

- **10 条 D3 集**（5 multi + 5 simple），每条 ×3 = **30 回合**，全部是 **held-out**：P6-04 未达标后的 preset 调词轮**不得看、不得用** d3 条目，只能用 dev 集。
- **dev 集 3 条**（2 multi + 1 simple）仅供调词轮验证，不计入 D3 指标。
- prompts.json 冻结后不得改动（PLAN P6-02 验收 ①：其提交早于 preset 文件首提交，且之后无改动）。
- 采集全记录（失败与重跑都留，禁止挑选）由 `evidence/D3/run.mjs` 保证：raw 帧按 `raw/<id>-<rep>.jsonl` 落盘，重跑时旧文件改名为 `.prevN` 保留。
- 指标口径（P6-04 计分，不在本任务）：multi = 首个工作工具调用之前有非空正文 **且** 回合不走兜底 (c)/(d)（ack-only 计失败）；simple = 恰 1 个气泡；阈值 multi ≥12/15、simple ≥14/15。

## 条目与预期要点

prompt 全文见 prompts.json（id 一一对应）。

### D3 · multi（预期：ack 气泡 → 工具过程（折叠）→ result 气泡）

| id | 预期 ack（含打算） | 预期 result |
|---|---|---|
| m1-create-todo | 提到创建 todo.txt 并读回核对 | todo.txt 已建、三行（买牛奶/寄快递/还书）无误 |
| m2-count-md | 提到建 a.md/b.md、统计、写 count.txt | count.txt = 2 |
| m3-date-note | 提到查日期、写 note.txt | note.txt 含今日日期 |
| m4-largest-file | 提到建两文件、比大小、写 largest.txt | largest.txt = data.txt |
| m5-run-python | 提到写 hello.py、运行、存输出 | out.txt = hello |

multi 条目自包含：每回合会话 cwd 是新建空目录，任务只需 fs/bash 即可完成；bash 调用触发 shell-ask 审批卡，采集脚本经 `$events` 自动作答 `allowed-once`（真实链路，不出卡卡死）。

### D3 · simple（预期：不调工具，恰 1 个气泡直接回答）

| id | 预期结果 |
|---|---|
| s1-env-var | 一句话定义环境变量 |
| s2-arithmetic | 42 |
| s3-translate | 仅英文译文 |
| s4-git-diff | 一句话：本地入库 vs 推到远端 |
| s5-color-mix | 黄 / yellow |

### dev（调词轮可用，不计入 D3）

| id | kind | 预期 |
|---|---|---|
| d1-notes-md | multi | notes.md 首行「会议记录」，ack/result 同 multi 规则 |
| d2-boiling | simple | 恰 1 气泡：100 |
| d3-sum | multi | sum.txt = 15 |

## 冻结时环境（供复现对照）

- 模型：本地 LiteLLM `glm-5.3-flash`（P2SDK_LLM_MODEL 缺省即它，start.ts:34）。
- preset：`p6-reply`（`app/sdk/profile/patches/p6-reply-style.yml`，P6-02 新增 insert preset；段落 sha256 由 run.mjs 记入每回合元数据）。
