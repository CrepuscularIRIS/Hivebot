# REPORT · P5-25 工作目录强制（A1，C2 ②）

> 主会话代录（builder 写报告被拦），2026-11-03

分支 feat/P5-25 @ 0ee7976（基 5bd36e0），7 文件 +466/-39。

## ⚠️ stash 互踩事故（已处置）
refs/stash 跨 worktree 共享，与 P5-21 重叠窗口互 pop 双向串位；13:02 双向恢复（P5-21 自己 7 文件未动；本任务改动重 apply 重验绿）；备份 /tmp/bot-p5-25-stash-mixup/。LEARNINGS 已立规：多 worktree 禁 stash。

## 实现
orchestrate.ts：createSessionForcedWorkspace（#3 编排）+ mintWorkspace/resolveDataDir/mintBotId（session-<uuid> 同形）；#4 注入 sessionId+cwd；传 cwd 即 pbots/invalid-args 且 dsh 计数 0；dataDir 缺失 fail loud（pbots/unavailable）、mkdir 失败 pbots/storage。index.ts：dataDir 与 m3 store 同源，session/create 一并路由（wrap 在 checkArgs 外层故复刻拒口径）。p2temp/index.mjs：sessionId 透传（上游 claim 按传入 id+cwd 新建，agent.ts:239-243 已核）。与 P5-01 协同：wrapper 以 header.cwd 为 workspaceRoot 重 bind，兄弟工作区不挂回（e2e ③ 证实）。

## 验收 ①②③绿
①follow header.cwd===$PBOTS_DATA_DIR/workspaces/<botId> 且目录存在（真实 launcher e2e）②传 cwd 拒+dsh 0（单测 mock + e2e 直调）③X 批准 bash 探 Y 哨兵 y-unseen + 自工作区 self-seen 正对照，反向对称。④未做（派发范围外）。

## 测试
单测 41/41（TDD 14 红先）；ui 全量 254/254；e2e 63 passed（Xvfb，含新 workspaces.spec 两格）；p2temp.proc 绿。sdk 全量并发红=既有 H1/H2 类（stash 基线对照同红、单跑全绿、与本 diff 零交集）。截图 evidence/P5-25/ 两张（主会话已抢救）。
