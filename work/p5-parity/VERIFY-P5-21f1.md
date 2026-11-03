verdict: PASS
commit: 8a47a645415d9315916dc5765c0642bca1088fff  （worktree /tmp/bot-wt/P5-21f1，基 34da8f9；head 变了本证据作废，须重验）

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| 两文件自跑：market.spec 2/2 + journeys/d4-d5-d6 1/1（Xvfb，先 build） | PASS | evidence/P5-21f1-vfy/run-log.md §0–2：15:09 `pnpm build` ✓ 后 xvfb-run（run-e2e.sh 自带）跑 market.spec **2 passed (26.7s)**、journey **1 passed (14.4s)**，verifier 自跑非转述 |
| 区域：3 处 +12 行恰在申报位置；产品零改动 | PASS | `git diff 34da8f9..8a47a64 --stat` = 2 文件 +12/-0；hunk 位置 market@260 / journey@90 / journey@126 与申报 :263/:93/:129 一致，每处 +4 行；无产品文件 |
| 全仓无遗漏第 4 处（grep mcp__ 实调模式复核） | PASS | 正向 `grep mcpCall(` 全 e2e 恰 3 处（market:260、journey:90/131）即已改 3 处；反向 `tool-row[data-status="done"]` 全仓 4 处，第 4 处 journey:118 为 D6a 历史回放（读 D4 已批准定稿，非实调）；workspaces p25-x/y 用 bashCall 且自带答卡；settings/bots/d10b-d7 无 writeScriptCalls。run-log.md §4 |
| 断言保留：enabled:false / Y 无工具 / 结果内容 / 完成语 | PASS | enabled:false market:237-238、journey:73-74；Y 工具表无 mcp__* market:276；结果内容 market:269（HELLO_TEXT）/journey:99（u31-d5-journey-evidence）；完成语 market:270（'D5 读取完成'）/journey:119（'已执行。'）——均在 HEAD 文件中现行存在，diff 仅插入不删改 |
| 坏路径（抽验加做）：撤答卡复现红 | PASS | run-log.md §3：checkout 基点版 market.spec 单跑 P-C ② → :263 等 done 60s 超时红（element not found），与申报红一致；还原后 worktree 干净。红/绿双向差分坐实改动必要、非假绿 |

新问题（每条一行，可直接成为修复任务）：
- 无本任务范围内新问题；grok-shim 存量红已立案 P5-51.f2，不范围。
- [范围外观察，非本分支问题] /tmp/bot-wt/P5-52 worktree 残留 5 个 Electron 进程（PID 2522481 起）+ 3 个 Xvfb（:99/:100/:101，PID 2625528/2646829/2522184，归属不明，含可能为本轮 xvfb-run 泄漏）| 复现：pgrep -ax electron; pgrep -ax Xvfb | 疑似位置：其他并行任务收尾未 reap | 严重度：低（空转占资源，不影响测试结果），建议主会话 `bot-reap --match` 统一清
