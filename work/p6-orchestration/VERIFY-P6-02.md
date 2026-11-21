# VERIFY · P6-02 冻结提示集 + p6-reply preset + D3 采集器

verdict: PASS
commit: 1a86006e60b2211311493daba5a3f51a11d32565（feat/P6-02 @ /tmp/bot-wt/P6-02，基 98c433d，干净树）

独立复跑环境：HOME=/tmp/bot-vfy-p6-02（临时），全部命令自跑，不信 builder 输出。worktree 现场验收后已还原（我复跑产生的 raw/.prevN 副本已清，git status 干净）。

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| ① json 冻结早于 yml，之后无改动 | PASS | `git log -- evidence/D3/prompts.json`：仅 ef89307（11-03 12:48:57）；yml 首提交 797e38e（13:03:58）> 12:48:57。prompts.json 单一 commit 无后续改动。ef89307 同时含 fixtures/prompts.md（与其自述「同一 commit」一致） |
| ② yml 不含 preset-standard；diff ⊆ 区域；approval.yml/start.ts/tests 零改动 | PASS（附偏差注记） | `grep -c 'id: preset-standard' p6-reply-style.yml` = 0。`git diff 98c433d..1a86006 --name-status` 全部为 A、共 9 文件：yml + evidence/D3/{prompts.json,run.mjs,raw/×6} + fixtures/prompts.md；无任何 M/D → approval.yml/start.ts/tests 零改动。注记：fixtures/prompts.md 不在 PLAN 区域列字面内（见新问题 2）；raw/×6 按 P6-04 的 raw/<id>-<rep>.jsonl 口径属目录级区域。`git diff main --name-only` 含 main 后续合并（P5-27/28）的反向差异，验收按 merge-base=98c433d 执行 |
| ③ 工具表逐 id = preset-standard，plugin_manager 仍禁用，guard 测试绿 | PASS | `run.mjs --check`：22/22 逐 id 一致 + plugin-manager/market 均 disabled:true（--check PASS）。mock 干跑运行时实测 p6 工具 30 个 = standard 30 个、无 plugin_manager（evidence/vfy-p6-02/mock-s2/s2-arithmetic-1.jsonl 的 d3-meta.toolNames）。`pnpm vitest run tests/e2e/guard-plugin-manager.test.ts` 4/4 绿。反向对照：sed 改一个 id（tool-todo→tool-todo-X）后 --check FAIL 并给出精确 diff，证明检查非空转（改后已还原） |
| ④ mock 干跑：turn/start…turn/end、元数据齐 | PASS | `run.mjs --mock --only s2-arithmetic`：outcome=turn/end、25 帧、事件序列含 turn/start…turn/end、mock 自检 PASS 30/30。d3-meta 字段全：promptId/kind/rep/sessionId/cwd/agentPreset/model/temperature/topP/llmBase/presetSectionSha256/outcome/toolNames/metaOk；header.agentPreset=p6-reply。产物存 evidence/vfy-p6-02/mock-s2/ |
| ⑤ 真模型冒烟：header.agentPreset=p6-reply | PASS | `run.mjs --only s5-color-mix`（key 走 env 未打印）：outcome=turn/end，header.agentPreset=p6-reply，model=glm-5.3-flash（litellm）。恰 1 条 assistant/message，含 1 text 块「黄色」（红+绿光加色法正确）+ 1 reasoning 块（按 preset 折叠），0 工具事件。产物存 evidence/vfy-p6-02/real-s5.jsonl、real-run-meta.json。另抽验 builder 提交的 m3-date-note-1.jsonl：3 条 assistant/message（ack→过程→result「完成：date 返回 2026-11-03…」）+ 2 组 tool/call+result，三段式属实 |
| ⑥ 无凭证落盘、无残留 | PASS | `grep -rnE 'sk-\|P2SDK_LLM_API_KEY=' evidence/D3/` 为空（验收原式；run.mjs 仅注释提及变量名，非凭证）。运行后 /tmp/bot-p6-d3 与 /tmp/bot-p6-d3-rec-* 均不存在；本验收两次 run 自 spawn 的 dsh PID 1683723/1691144 已退出（/proc 查证）。坏路径：real 模式缺 key → 干净报错 exit 1，不打印不落盘 |

补充：sdk 全量 `pnpm test`（vitest run）32 文件 / 250 测试首跑全绿，本次未复现 w1ap0-matrix flake。段落 sha256 独立手算（python，yml persona literal block 首空行后）= c7c53cd4e281e361191cbdecf873d2c6c5a5d9d7e56277091bf0d54a9734b356，与 --check 输出、mock/real 产物内 presetSectionSha256 三方一致。

新问题（每条一行，可直接成为修复任务）：
- [FIX] REPORT-P6-02 段落 sha256 前缀笔误（c7c53c4e… 应为 c7c53cd4e2…，代录掉字符「d」） | 复现：`node evidence/D3/run.mjs --check` 输出对比报告 §交付② | 疑似位置：work/p6-orchestration/REPORT-P6-02.md:8 | 严重度：低（P6-05 派发提示词若照抄报告前缀会校验失败，应以本文件或 run.mjs 输出为准）
- [FIX] fixtures/prompts.md 不在 PLAN P6-02 区域列字面内（区域列仅 yml + evidence/D3/{prompts.json,run.mjs}） | 复现：`git diff 98c433d..1a86006 --name-only` 第 9 个文件 | 疑似位置：work/p6-orchestration/PLAN.md:39 区域列 | 严重度：低（纯文档文件、内容已验语义一致；主会话在 PLAN 补记该文件即闭合）

范围外观察（不属本任务，供主会话处置）：机器上存留大量其他任务残留 SDK 进程（/tmp/bot-wt/P5-02、P5-03、P5-06、P5-21、P5-25、P5-H1、T-19 与主仓 app/ui 起的 start.mjs/dsh，数十个，含 11 月 1 日前的老 PID），本次只查不动。
