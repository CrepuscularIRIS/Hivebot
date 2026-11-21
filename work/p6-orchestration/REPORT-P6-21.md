# REPORT · P6-21 投递与 Assignment 地基
2026-11-04 · builder（GLM 5.3）· `feat/P6-21` @ 9f4cff0 · 基点 main@92cb6af

> 代录，未经改写。builder 写报告文件被系统限制拦下，正文为其最终回报原文。

- **分支** `feat/P6-21` @ **9f4cff0**（基点 main@92cb6af），worktree `/tmp/bot-wt/P6-21`。8 新文件 1184 行，零改现有文件，`git diff 92cb6af --name-only` 全在区域列：`app/sdk/src/orchestration/{index,delivery,assignment,pending,turn-origin}.mjs`、`app/sdk/tests/unit/orchestration-foundation{,-delivery}.test.ts`、`app/sdk/tests/support/orchestration-foundation-plugin.mjs`
- **测试**：`cd /tmp/bot-wt/P6-21/app/sdk && HOME=/tmp/bot-p6-21 ./node_modules/.bin/vitest run tests/unit/orchestration-foundation.test.ts tests/unit/orchestration-foundation-delivery.test.ts` → `Test Files 2 passed (2) / Tests 51 passed (51)`（TDD 先红后绿；真 Loader 用例 boot 实 SDK 经 typert remote）
- **验收**：①来源头 PASS（SA `delivery.ts@6337fc8` + P6-09 探针 foldAssignments）②(i)–(v) 全 PASS（含 v4.1 的 claim-后-崩溃 (iv) 与 canceled 撤回 (v)，已投判定以主日志 fold 为准）③ask 三快照 PASS ④7 reason 全映射 + forked/未知 fail closed + worker 待处理 assign needsWake PASS ⑤同键两投恰 1 条 + 用户 user 消息不算已投 + flush 后回执 PASS ⑥turn-origin PASS ⑦区域 PASS
- **未完成**：全量 sdk 回归未跑（load 23–36 > 20，留给 verifier：`cd app/sdk && pnpm test`）；e2e 未跑（派发约束）；报告文件由派发者代录
- **发现**：①PLAN ⑥ 原文「未知 kind → 受污染」与 §11 R2-1 冲突，按派发词取 R2-1（只认 pbots-worker），建议 v4.2 顺笔改；②main 已前进 38584ba（P6-09 合并，仅 work/ 文档，与本任务零文件交叠，无需 rebase）；③决策 17 的 result ≤4000 字归 P6-12（投影已备 `tool/result` 文本）
- **卫生**：`bot-reap --dry-run --match p621/p2sdk` 无残留（`--match P6-21` 会自匹配 reap 自身命令行误报）；临时目录 `/tmp/bot-p621-*` tmp-sweep 登记；node_modules 是主仓 symlink 未提交

待 verifier 验收。
