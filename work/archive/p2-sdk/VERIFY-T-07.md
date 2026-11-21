verdict: PASS
commit: 0b51fc172d556955a6b459cd0f979df8e7819ac1（worktree /tmp/bot-wt/T-07，验收时实测 HEAD 一致，工作区干净；红 commit d7af87e 仅含 test+evidence，实现 commit 0b51fc1 含 policy/patch/单测）

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| 前置：干净全量 61/61（串行） | PASS | `pnpm install --frozen-lockfile` 后 `vitest run --no-file-parallelism` 两次均 **13 files / 61 tests 全绿**（16:51:54 与 17:11:31 两轮）；evidence/t07-verify-rerun.txt |
| 前置：单跑 approval / policy | PASS | approval.test.ts 单跑 2/2 绿（4.4s）；policy.test.ts 单跑 5/5 绿；evidence/t07-verify-rerun.txt [2][3] |
| ① `$events`（interactions=answer）收到带 sessionId 的审批请求 | PASS | approval.test.ts:150 客户端以 `interactions:'answer'` 连接、`socket.open('$events')`；:243-245 `waitForApproval` 匹配 `waterfall + approval/request + agentId===s1`，断言 `asked1.agentId).toBe(s1)`、`request.toolName).toBe('bash')`。真跨 session 场景（test2 :307-309）X/Y 各自的 agentId 分别等于各自 sessionId 且 eventId 不同——agentId 即 SessionId 的映射经行为证实（上游 user-approval 包 lib/index.js 含 approval/request，pnpm store 实查）。绿跑输出在 evidence/t07-verify-rerun.txt |
| ② 拒绝 → canary 不存在 | PASS | approval.test.ts:246-248 `feed.answer(asked1,'rejected')` → `waitForTurnEnds(…,1)` → `expect(existsSync(canaryDenied)).toBe(false)`；evidence/D8-approval.md ②段引 tool/result isError + approval/decided{rejected} 日志 |
| ③ 真跨 session：批准 Y 不放行 X | PASS | 独立用例 approval.test.ts:289-328：**双活 session 同时挂起**（x/y 各自 prompt、各自脚本、断言 `askedY.eventId ≠ askedX.eventId` :309），`answer(askedY,'allowed-once')` → canaryY 存在、**canaryX 仍不存在**（:314-315）；随后拒 X 收尾 canaryX 始终不存在（:318-320）。这是对「sessionId 不符的批准不放行」的直接构造，不是同 session 顺序近似 |
| ④ 正确批准 → canary 存在 | PASS | approval.test.ts:251-256 `answer(asked2,'allowed-once')`（eventId ≠ 第一次）→ canary-allowed `existsSync===true`；日志 approval/decided{allowed-once}（evidence/D8-approval.md ④段） |
| ⑤ 默认权限非 bypass 非 danger-full-access（逐条） | PASS | approval.test.ts:258-280 四路逐条负向断言：`permissionPresets/catalog`.defaultPreset、`session/projections` permissions.currentValue、落账 `sandbox/mode`、各 `not.toBe('danger-full-access')` + `not.toMatch(/bypass/i)`，另 `approval/policy === 'ask'` 正向。独立解码红跑会话日志实值：preset/sandbox = workspace-write、policy = ask（evidence/t07-red-baseline-repro.txt） |
| 红基线：纯 preset 配置跑出红、证明 preset 路径不可达 | PASS | d7af87e 仅含 approval.test.ts + evidence/D8-approval.md（git show --name-status 核实，无实现文件）。verifier 独立复跑 `P2SDK_T07_PRESET_ONLY=1`：2/2 红（①段 10s 超时无 approval/request），且**零审批交互下 canary 在 prompt 后 1 秒创建**（canary-denied 17:00:45.99、canary-x/y 17:00:57.66，时间戳对齐本次红跑窗口）；会话日志 unzstd 解码：tool/call bash → tool/result isError:false，approval/asked ×0——「没问就跑了」而非「工具没跑」，与 evidence 引文逐条一致。evidence/t07-red-baseline-repro.txt |
| 安全反例：不复用 keyless-smoke / loader-smoke 放权配置 | PASS | 全文读两文件：approval.yml（13 行）只有 `- insert: p2sdk-shell-ask` 插件挂载，**无任何 permission/sandbox/env 行**；shell-ask.mjs 只返回 `{kind:'ask'}` 或委托 next()，无 allow/deny 放权分支。diff 3f167c7..0b51fc1 关键词扫描（danger-full-access/bypass/allow-all/auto-allow/permissions:）：命中全部是测试负向断言或注释，无放权配置。keyless-smoke 的 danger-full-access 环境（reuse/dsh-as-dependency.md:87）与 loader-smoke 的自动允许 shell 环境模式均未出现。挂载后组合结果由 ⑤ + 解码日志证实收敛（workspace-write + ask） |
| 区域：diff = 申报 5 文件 | PASS | `git diff --stat 3f167c7..0b51fc1`：src/policy/shell-ask.mjs(26+)、profile/patches/approval.yml(13+)、tests/e2e/approval.test.ts(328+)、tests/unit/policy.test.ts(70+)、evidence/D8-approval.md(71+)，共 508 insertions，无越界文件 |

坏路径（协议要求额外一条）：③ 本身即对抗路径（批准错误 session）；另有红基线 = 审批层完全缺失路径。均 PASS。

新问题（每条一行，可直接成为修复任务）：
- [FIX] 测试注释指向不存在的文件：approval.test.ts:22 引用 `evidence/D8-preset-only-red.txt`，实际红证据在 `evidence/D8-approval.md` 内节 | 复现：`ls app/sdk/evidence/D8-preset-only-red.txt` → 不存在 | 疑似位置：app/sdk/tests/e2e/approval.test.ts:22 | 严重度 LOW
- [FIX] shell-ask.mjs:10 注释声称「无应答 = fail closed」但无测试覆盖（审批请求悬空不 answer 的超时路径） | 复现：grep approval.test.ts 无 unanswered 用例 | 疑似位置：app/sdk/tests/e2e/approval.test.ts（补一条悬空审批 + 超时后 canary 不存在的用例） | 严重度 LOW
- [FIX] 全局覆盖率低于 80% 阈值（stmts 72.63% / lines 75.3%，缺口在 src/p2temp/index.mjs 67% 与 src/start.ts 73%——v8 看不见子进程；T-07 自身文件 100%） | 复现：`pnpm -C app/sdk test:coverage` | 疑似位置：app/sdk/src/p2temp、src/start.ts（需跨进程覆盖率方案或测试直达） | 严重度 MEDIUM（规则要求 80%，旧债非本任务引入，evidence/D8-approval.md:63-70 已记录）

备注：验收期间同机其他 agent 在跑测试（红跑窗口内新增 18 个 /tmp/p2sdk-runtime-* 中 16 个非本次产物），已用时间戳逐一核对归属，不影响上述结论。
