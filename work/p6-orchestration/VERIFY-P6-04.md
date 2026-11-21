verdict: PASS
commit: 4a7600c1d20d6c780c2f4ae6d8054920279997af   # worktree /tmp/bot-wt/P6-04，HEAD 与申报一致，工作树干净

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| 1. 计分器自跑：--selftest 11 例 | PASS | 亲跑 `node score.mjs --selftest`：11/11 `ok`（含 ack-only 计失败、(c)/(d) 兜底、send_message 非工作工具、超时计失败） |
| 1. 重算 result.json 字节一致 | PASS | 备份后重跑 `node score.mjs`，sha256 前后均 680049aebe8a3dd627c7107471d121ea2dde0b4b66561a294648f6390ab8dd83，`diff` 空（BYTE-IDENTICAL） |
| 2. 抽样真模型复测 2 回合（正式 d3 集，--only，key 经 env 不落盘） | PASS | `run.mjs --only m5-run-python,s1-env-var` 两回合 outcome=turn/end。计分：m5 ok=true ack=true result=true workTools=3/3 bubbles=2 completed；s1 ok=true bubbles=1 toolCalls=0 completed——与 builder 同条目结构性一致（multi 有 ack+result，simple 恰 1 气泡）。preset sha c7c53cd4e281…b356 两跑一致。raw 存 `evidence/D3-verify/` |
| 3. prompts.json 冻结（与 main 一致，git diff 空） | PASS | worktree sha256 8b556b858713763b0c5e42b6b0229c3acb71ec6180dbf0ed509fba900d6a218f == `git show main:…prompts.json` 同值，`git diff main -- prompts.json` 空（P6-02 commit 0a18b2a 落地版本） |
| 3. 区域 38 文件 ⊆ evidence/D3 | PASS | `git diff --name-only c9c2520..4a7600c` 恰 38 行，grep 非 D3 前缀为空 |
| 4. 口径抽查：raw 亲核（独立探针，不经 score.mjs） | PASS | m1-create-todo-1：ack 29 字→write→空文→read→result 67 字→completed，fold=`user|thinking|message|tool:write|tool:read|thinking|message`，raw sha 28dcee9f4bb8 与 result.json 一致；m3-date-note-2：中间正文 t1s2（32 字）夹在 bash/write 之间保持折叠（thinking），message 层恰 ack+result 2 气泡，midFolded=true walkC=false；s2-arithmetic-2：恰 1 正文 0 工具。全批 multi bubbles=2×15、simple=1×15、每个 multi 尾段 message 恰 1 |
| 4. ack-only 计失败的实现 | PASS | score.mjs:75-76 multi ok 必含 `tailResult !== null`；自检第 2 例（合成 ack-only）断言 ok=false，亲跑 `ok` |
| 5. 报告数字表 vs result.json | PASS | 2716 行；30/30 outcome=turn/end 且 endReason=completed；multi pass/ack/result 15/15、(c)/(d)=0/0、midFolded 8/8（withMidText=8，另 7 回合零中间正文）；simple pass/oneBubble/noTool 15/15；nonWorkTools 全批空（报告「三者零调用」属实） |
| 坏路径：缺回合文件 | PASS | 抽走 1 个 raw jsonl 后计分器不崩溃：`missing:1` 计入分母（multi 14/15, n=15），result.missing 记录文件名（在 D3 副本中做，主证据未动） |
| 合规：凭证/残留 | PASS | evidence/ 内 grep `sk-…`/`P2SDK_LLM_API_KEY=` 零命中；/tmp/bot-p6-d3 由 run.mjs 自清理已不存在；无残留 SDK 进程；复测后 worktree git status 干净 |

新问题（每条一行，可直接成为修复任务）：
- [NIT] REPORT-P6-04.md 内 preset 段落 sha 摘要笔误「c7c53c4e…356」（实际 c7c53cd4e281…b356，漏 'd'）| 复现：对照 REPORT-P6-04.md 第 7 行与 raw/run-meta.json | 严重度：trivial（result.json 内为完整正确值，不影响判定）
- [备注·无需修复] 「prompts.json 先于 preset 调词提交」在 git 历史不可证（P6-02 以 squash 式单提交 0a18b2a 落地，两文件同提交）；因 D3 一次达标、调词轮从未发生，held-out 性质未被破坏
