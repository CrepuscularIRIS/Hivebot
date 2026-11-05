# HANDOFF · 2026-11-05 18:50

新会话从这里接手。先读本文件，再读 `work/REPORT-2026-11-05.md`（额度诊断 + 今日成果 + 待办全表）。

## 1. 开发架构（2026-11-05 起，取代 grok-orchestrate 一层派发）

| 角色 | 谁 | 怎么用 |
|---|---|---|
| 开发 | **主 agent（GLM 5.3）** | 直接读码、写测试、写代码、跑测试、合并、记账。不派 builder / verifier |
| 方案 | **Opus 5.5**，按需 | 只在真要做设计决策时派 `director`（frontmatter 已锁 Opus），给目标与约束，要它把方案写进 `work/<slug>/` 文件、回报 ≤15 行 |
| 审查 | **6.1 Sol 独立 subagent** | 攒一批合并后派 `Agent(subagent_type=general-purpose, model="sonnet")`，2 个方向并行（如正确性 + 安全）；发现必须 CONFIRMED（有复现）或 REFUTED；只修 CONFIRMED |

规则：
- TDD：先写失败测试，再最小实现。合并前跑定向测试；改动大时用 worktree `/tmp/bot-wt/<task>`。
- 不建 cron；长测试 `run_in_background` 跑一次等通知，不轮询。
- 上下文控制：一个阶段一个会话，阶段结束写 handoff 换新会话。
- 不用 GLM flash（会整席 429 阵亡）；GLM 429 时等几秒重试即可。
- 问用户只问需求与品味；行为语义先查原版（0.78.1 / 0.18 源码）。

## 2. 当前状态

- 分支 `docs/rebuild-p6-p5-plan`（集成分支，非 main），HEAD `110d465`，tracked 干净。
- 没有在跑的 agent，没有 cron。

## 3. 待办（按顺序）

1. **合 H1 补漏 `f2831a8`**：`git cherry-pick f2831a8`（mock-demo.test.ts + start.test.ts，+18/−1）。之前误判为已合并。跑这两个文件定向测试。PLAN P5-H1 行改回 done。
2. **P5-H7**：`app/sdk/vitest.config.ts` 读 `PBOTS_TEST_WORKERS` 给 maxWorkers 设上限（默认不变）。几行。
3. **P5-H5**：`app/sdk/tests/e2e/*.test.ts` 约 60 处裸 `mkdtempSync` + 各文件 fakeOverlay 本地副本 10 处 + `mock-demo.test.ts:52` + `examples/min-client.mjs:28` 改用 `tests/support/tmp-sweep.ts` 的 `tmkdir`。机械替换，先做残留计数 RED。
4. **攒批 Sol 审**：上面 1–3 合并后派一次。
5. 之后看 PLAN：P6-14b 剩余前置（48 组定案、启动顺序核对、persona/section 断言）、P5-H6 / P5-H8 排查。

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
- 旧编排手册 `.claude/skills/grok-orchestrate/` 只作参考，不再按它派发。
