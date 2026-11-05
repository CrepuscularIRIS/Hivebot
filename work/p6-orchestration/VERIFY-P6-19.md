# VERIFY-P6-19 · 冻结路由提示集（D3′ 前置）

verdict: **PASS**
commit: `c1d9b1961fc51345ee6aa374a7132f37249f43a2`（feat/P6-19，单 commit，base=main 6abbbc0）
验收人：verifier（GLM 5.3），2026-11-04。校验脚本与输出：`work/p6-orchestration/evidence/P6-19/{verify-check.py,clean-run.txt,tamper-run.txt}`

| # | 验收项 | 结果 | 证据 |
|---|---|---|---|
| 1 | 只新增 `evidence/D3-orch/prompts.json`（195 行），无产品代码改动 | PASS | `git diff main...HEAD --name-status` 仅 `A work/p6-orchestration/evidence/D3-orch/prompts.json`；`wc -l` = 195；worktree `git status --short` 为空；`git merge-base --is-ancestor main HEAD` 通过 |
| 2 | 16 条 = 直接答 4 / 单派 4 / 并行 2 / 追加 2 / 停止 2 / 闲聊 2；追加与停止为两回合条目，expect 用结构化字段，计分点在 turn[1] | PASS | 独立脚本输出 `total=16 kinds={'direct': 4, 'single': 4, 'parallel': 2, 'attach': 2, 'stop': 2, 'chat': 2}`；attach/stop 均 `turns` 恰 2，expect 均含 route/createCalls/stopCalls（attach: send/0/0，stop: stop/0/1，直接答+闲聊: 0/0，单派 create/1/0，并行 create/2/0）；note 明文「turn[1] 是计分回合…turn[0] 仅作前置铺垫（期望恰 1 次 create）」，4 条两回合条目的 detail 同义重申 |
| 3 | 提示全中文口语、每条 ≤2 句、不含工具名或路由实现措辞 | PASS | 脚本逐条断言 CJK 存在、句数 ≤2（按 。！？切分）、禁词表（create_bot/stop_bot/worker/bot/agent/session/工具/路由/委派/调度/派工…）零命中；人工通读 16 条确认口语自然（「对了，刚才那份计划里再补一条」「算了，归档那个不用弄了，停了吧」），任务句均为空目录可完成的文件类多步任务 |
| 4 | 独立复跑校验（python3 -I） | PASS | `python3 -I -m json.tool` → JSON-PARSE-OK；自写校验器（不复用 builder 输出）clean-run.txt exit=0。坏路径：篡改副本（par1 createCalls=3、single1 塞「create_bot/worker」、stop1 砍成单回合、chat2 三句）→ tamper-run.txt exit=1，8 条违规全被抓，证明检查非空转；worktree 事后仍干净且 HEAD 未动 |
| 5 | 口径差异核对 | PASS | 主仓 PLAN.md:95 =「2 attach（两回合…期望 send 到同一 worker、0 次新 create）」；BRIEF.md:119 =「4 直接答、4 单派、2 并行、2 追加、2 停止、2 闲聊」。**口径差异已按文件裁决**：派发清单的「边界 ×2（自选）」在两份权威文件中均为「追加 ×2」，builder 按文件执行正确 |

补充证据：
- 冻结时序前提满足：`app/sdk/src/orchestration/` 尚不存在，main 与分支上触及该路径的 commit 数均为 0，c1d9b19 天然早于其未来首次提交（P6-10 为 todo）。
- frozenAt=2026-11-04 与验收日一致；note 声明 held-out 语义（先于工具 description 提交、之后不得据条目调平措辞）。
- 无 UI，不适用截图规则。

新问题：无。

进程回收：`bot-reap --dry-run --match P6-19` 无匹配（本任务只跑 python/git，无长驻进程）。
