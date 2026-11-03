# VERIFY · P5-25 工作目录强制

verdict: PASS
commit: 0ee79766325523206dedda446f9738efe6df83e5（feat/P5-25，基 5bd36e0，worktree /tmp/bot-wt/P5-25）
验收时间：2026-11-03 13:10–13:36 · verifier 独立复跑（HOME=/tmp/bot-P5-25-vfy，dist 亲重建后跑 e2e）

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| 0 现场：stash 事故后 worktree 只含本任务改动 | PASS | `git status --short` 空、HEAD=0ee7976；`git diff --stat 5bd36e0..0ee7976` = 7 文件 +466/-39，与申报一致（orchestrate/index/p2temp+测试 5 份），无串位残留 |
| 1 单测 41/41 | PASS | `vitest run tests/unit/m3/orchestrate.test.ts tests/unit/shell/wire.test.ts` → 41 passed（34+7，恰为本任务两份改动单测） |
| 2 ui 全量 | PASS | `pnpm test` → 28 files / 254 passed（3.9s） |
| 3 e2e 全量（期望 63） | PASS | `pnpm build` 亲重建 + `pnpm test:e2e`（Xvfb）→ **63 passed (6.7m)**。注：visual-hairline 里 1 格显示 ✘ 是 `test.fail` 预期失败标记（P5-14.f1 既有偏差，exit 0、计入 passed，文件不在本任务 7 文件内） |
| 4 ① header.cwd 强制，非 mock-only | PASS | `tests/e2e/workspaces.spec.ts:30-45`：真实 launcher（launchSdkRuntime start.mjs 全链 + P5-01 wrapper）+ 生产 build 壳；断言 `devState(page).views[bot].cwd === join(dataDir,'workspaces',bot)` 且 `existsSync` 真目录。views.cwd 来源亲核：`renderer/plugins/session/reduce.ts:189` 从真实 follow snapshot `header.cwd` 归约，非本地推导。亲跑绿 |
| 5 ② 传 cwd 即拒 + 红基线 | PASS | 红基线亲做：摘掉 `createSessionForcedWorkspace` 的 cwd 注入退回可传 → 单测恰 1 红（`② renderer 传 cwd → pbots/invalid-args` 33 passed/1 failed）；e2e 同红（`session/create 传 cwd 必须被拒（got {"ok":true,…}）`，证明断言非空转）。`git checkout` 恢复 + 重建 → 单测 41/41、e2e workspaces 2/2 绿。worktree 终态干净 |
| 6 ③ 交叉不可见亲跑 | PASS | workspaces.spec ③ 单独亲跑 2 轮绿：X 批准 bash `test -e` Y 哨兵得 y-unseen + 自工作区 self-seen 正对照（防全瞎），反向 x-unseen/self-seen 对称。截图亲验（Read 打开）：真实 Grok Bot 壳、侧栏主 Bot+两探针 bot、Bash 卡「✓ 已批准一次」、探针命令指向 `/tmp/bot-p5-25-*/data/workspaces/session-*`。evidence/P5-25/p25-3-cross-invisible-vfy.png |
| 7 p2temp 透传对既有调用方零影响 | PASS | `p2temp.proc.mjs` 新用例断言三分支：sessionId 透传 deepEqual / **缺省 `'sessionId' in calls.created[1] === false`** / 非法类型 reject；`node tests/unit/p2temp.proc.mjs` 亲跑全 ok、exit 0。renderer 既有调用只传 `{}` 或 `{agentPreset}`（store.ts:258、NewBotDialog.tsx:87），不受影响 |
| 8 sdk 并发红按 H1/H2 判别（单跑复核） | PASS | 三轮全量红各不相同（8 红 w1ap0-matrix 哨兵 / 1 红 start.test / 1 红 guard-fs），run3 崩溃栈=旧 `never-roots.mjs:75` 未守卫 `statSync` 的 handoff ENOENT——即 H2 race 本体，且 H2 修复 d1a7ed1 合入 main **晚于**基点 5bd36e0（`git merge-base --is-ancestor 5bd36e0 d1a7ed1` 成立，基点确不含修复）；单跑全绿：start 32/32、w1ap0-matrix 10/10；diff 与红文件零交集；机器 load 4.8–8.8（并行 agent 在跑，符合 H1/H3 互踩画像）。与本任务无关，判既有 |
| 9 ④ 生产布局 | 范围外 | 派发明示 ①–③；报告如实标注「④ 未做（派发范围外）」 |

新问题：无。既有问题（不属本任务）：sdk 并发 flaky 三源 = H3 TEST_HOME 硬编码互踩（H1 报告已立）、H2 race 修复已合 main 但基点不含（合并 P5-25 时自然带入 d1a7ed1 的修复，无需动作）。

证据文件：
- /home/lingxufeng/bot/work/p5-parity/evidence/P5-25/p25-1-header-cwd-vfy.png、p25-3-cross-invisible-vfy.png（本轮独立复跑，均已 Read 亲验）
- 红基线日志：单测 `1 failed | 33 passed`；e2e `session/create 传 cwd 必须被拒（got {"ok":true,…}）`（输出在验收会话记录，worktree 已恢复 0ee7976 干净态）
