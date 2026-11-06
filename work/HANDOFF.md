# HANDOFF · 2026-11-05 18:50

新会话从这里接手。先读本文件，再读 `work/REPORT-2026-11-05.md`（额度诊断 + 今日成果 + 待办全表）。

## 1. 开发架构

见 `CLAUDE.md` §1–§2（工单制，改编自 yanauto/opus-manager）。要点：
- 主 agent（GLM 5.3）= 施工 + 调度：记需求、按工单 TDD 施工、写回执、按节点派经理和审查、只合并经理验收过的单。
- `manager`（Opus 5.5）：立项拆单 / 验收与核实 / 重规划 / 阶段报告。`reviewer`（6.1 Sol）：一批单施工完后只读审查。派发都**不传 model**。
- 工单在 `work/tickets/`，模板在 `_templates/`。
- 旧 agents / grok-orchestrate / panel 已归档到 `docs/harness/archive/`，不要再用。
- 不用 GLM flash（会整席 429 阵亡）；GLM 429 时等几秒重试即可。

## 2. 当前状态

- 分支 `docs/rebuild-p6-p5-plan`（集成分支，非 main），tracked 干净。
- 没有在跑的 agent，没有 cron。`work/tickets/` 刚建，还没有工单。

## 3. 待办（按顺序）

工单队列在 `work/tickets/queue.md`（manager 维护，状态以工单所在目录为准）。当前第一批：**T2（L8-a ssh 测试夹具）→ T3（L4-a RE skills，派 reverse-engineer）→ T1（P5-H5a tmkdir）**；其后 T4（ssh 真组合）、T5（architect 组合设计）。P5-H7 双全量实证等 load<8 窗口。

阻塞（不要动）：P7-F3 等 **Q-027**；P7-F2 冻结；P6-24 等原版删除语义；Q-023 等用户确认。

## 4. 踩过的坑（直接照做）

- pnpm 跑 vitest 必须带 `--config.verify-deps-before-run=false`，否则隔离 HOME 下报 deps 错。
- 测试环境：`TMPDIR=<私有> HOME=<私有> DBUS_SESSION_BUS_ADDRESS=unix:path=<不存在路径>`，跑完删目录。
- 清进程只用 `~/bot/scripts/bot-reap <PID...>`（hook 会拦裸 kill 带重定向的写法、拦 pkill -f）。
- **主仓 checkout 跑 `orchestration-create-live.test.ts` 有 3 格确定性红**（③′/⑫/②′，⑫=another main client holds create channel），worktree 里同内容全绿——是 P5-H6 的排查对象，不是你的回归。回测这类文件用 worktree。
- sdk e2e 全量单跑约 30 分钟；guard-fs① / w1ap0-matrix①⑦ 600s 超时在基点也红（P5-H8）。两套全量同时跑会互压，别并行跑全量。
- 判断一个任务做没做完：先查分支 `git log`、`evidence/`、`VERIFY-*`，今天连发现 4 个「做完了但没记账」的旧任务。
- 合并：默认 `git merge --no-ff`；commit 不加 Co-Authored-By（用户 attribution 已关）。

## 5. 文件地图

- 各需求状态：`work/<slug>/PLAN.md`、`LOG.md`；全局日志 `work/LOG.md`；问题 `work/QUESTIONS.md`。
- 经验：`work/LEARNINGS.md`（开工前扫一遍）。
- review 覆盖：`work/review-coverage.txt`。
- 旧编排已归档：`docs/harness/archive/`（项目路线 `skills/grok-orchestrate/references/roadmap.md` 仍可参考）。
