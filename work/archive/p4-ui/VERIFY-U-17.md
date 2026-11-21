verdict: PASS
commit: bf65da70593d38da03fb10a5386fc2d4be6e0c91

验收环境：/tmp/bot-wt/U-17（feat/U-17），验收时 HEAD 与申报一致，worktree 干净，
父 commit 1608d10。所有命令以 HOME=/tmp/vfy-U17-home（临时 HOME，LEARNINGS 规则）复跑。

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| ④-a 全量单测 166/166 | PASS | `cd /tmp/bot-wt/U-17/app/ui && HOME=/tmp/vfy-U17-home pnpm vitest run tests/unit` → `Test Files 18 passed (18)` / `Tests 166 passed (166)` / `Errors 1`（该 error = 发现 a，见下，测试全过） |
| ④-b 全量 e2e 21/21 | PASS | `pnpm build`（vite 30 modules ✓）后 `HOME=/tmp/vfy-U17-home pnpm test:e2e` → `21 passed (1.1m)`，含 m2-port ① 10s 超时用例（U-17 适配后） |
| ① 首败指数退避 + 重试期 rpc 排队 | PASS | 单测 connect.test.ts 用例1/用例4（重试期 rpc 排队放行 apiCount===1；gaps ≥35/70/140 即 2^n）；独立探针 evidence/U-17/probe.mjs（bf65da7 的 connect.ts esbuild bundle，非 builder 测试）→ P1a `gaps=55,102,202`（精确 50/100/200 = 2^n）、P1b `gap=82ms`（基数 2000 被 cap 80 封顶）、P3 排队 rpc 恢复后 `apiCount=1 httpRpcCalls=1` → `PROBE PASS` |
| ② rpc 有界等待 → 结构化 pbots/unavailable，不发请求 | PASS | 单测用例2（`rejects.toThrow('dsh connect timed out after 200ms')` + rpc 返回 `{ok:false,error:{code:'pbots/unavailable',…}}` + `apiCount===0`）；探针 P2 同构断言过（250ms 版）；实现 connect.ts:155-171 `Promise.race` + `rpcTimeoutMs ?? 30_000` |
| ③ onDead 清 socket，ready() 挂起等新代不返死柄 | PASS | 单测用例3（terminate 后 ready() 300ms 仍 pending、apiCount===0、generation 仍 1 未伪造新代）；探针 P2：`dead=true earlyReady=pending gen=1 apiCount=0`；实现 connect.ts:123-128 onDead `this.socket = undefined` |
| 红基线：4 新用例对旧实现红 | PASS | `git worktree add --detach /tmp/vfy-U17-red 1608d10` + 拷入新 connect.test.ts + 全 workspace 依赖 → `Tests 4 failed | 162 passed (166)`，4 失败恰为 4 新用例，红因正确（旧 start() 首败直接 reject：`token exchange failed: HTTP 500`、无 timed-out 路径）；旧 4 用例与基线 162 全绿 |
| 区域：connect.ts、index.ts、两测试、m2-port 适配；m2-mux 未动 | PASS（一处申报口径差异） | `git show --stat bf65da7` = 4 files（connect.ts 87+、index.ts 8+、m2-port.spec.ts 13+、connect.test.ts 107+）。派发与 LOG:450 记「5 文件」，实际 4 文件（「两测试+m2-port 适配」中 m2-port.spec.ts 即两测试之一）——笔误，实际范围 ≤ 申报，无范围外改动。`git diff 1608d10..bf65da7 -- app/ui/main/m2-mux/` = 0 行（纵深守卫未动） |

发现 a/b/c 核对（builder 记档，均确认属实、不阻塞）：
- a（wire.test:107 假 dsh 缺 ready() → m2-mux:222 常驻循环 unhandled rejection）：主 worktree 复现（Errors 1）；红基线 worktree（父 commit 1608d10）同样报 wire.test.ts:107 → **基线既有实证**，非 U-17 引入。一行测试修，归 U-21（在途改该文件顺带），LOG:450 已记。
- b（迟到恢复不补发）：main/index.ts `void dshStart.then(() => ready.setDshReady(), () => {})` —— start() 超时 reject 后 dshStart 已 settle，后台重连成功不会再调 setDshReady，UI ready 状态迟到不恢复。代码确认；闸门已走失败分支放行（U-14 纵深），不阻塞。
- c（rpcRaw 网络裸抛，R13 剩余）：实测 `rpcRaw('http://127.0.0.1:1/',…)` → `THROW-BARE: TypeError fetch failed`（非结构化，实证脚本同 probe bundle）。rpc() connect.ts:167 无包裹。m2 消费面有守卫（triage R13 注明），新消费者会踩——已记档。

补充核对：
- env 可配性：index.ts `Number(process.env.PBOTS_DSH_START_TIMEOUT_MS ?? '') || 30_000` —— 未设/非法值回落 30s，'500' 生效（e2e 用例实证）。
- e2e m2-port 适配语义：PBOTS_DSH_START_TIMEOUT_MS=500 收紧首连超时以保持「观察 M2 自身 10s 超时」原意图；stats 改 5s 有界轮询是消除毫秒级竞态，断言不变（timeouts≥1）。
- 本任务无 UI 验收项（dsh 连接层），不适用截图规则。
- 坏路径已覆盖：首连持续失败（Infinity 注入）、socket 死亡间隙、死端口 rpcRaw 裸抛——分别对应用例2/3/探针P2/发现c实证。
- 清理：/tmp/vfy-U17-red worktree 已 remove，out/probe-*.mjs 已删，U-17 worktree 验收后干净、HEAD 未漂移。

新问题（每条一行，可直接成为修复任务）：
- [FIX] 迟到恢复 ready 状态不补发（b 项升级为任务） | 复现：PBOTS_DSH_START_TIMEOUT_MS 内 dsh 未就绪 → start reject → 此后 dsh 恢复，setDshReady 永不调用 | 疑似位置：app/ui/main/index.ts dshStart.then 分支（重连成功回调缺二次通知通路） | 严重度：M
- [FIX] rpcRaw 网络级异常裸抛 TypeError（c 项，R13 剩余） | 复现：连接就绪但 /api 网络不可达（如断网窗口）→ ipcMain.handle 收到非结构化 rejection | 疑似位置：app/ui/main/dsh/connect.ts:26-39 rpcRaw（fetch 无 try/catch 包结构化） | 严重度：L
- [FIX] wire.test 假 dsh 缺 ready() 致 unhandled rejection（a 项，基线既有） | 复现：pnpm vitest run tests/unit → Errors 1（wire.test.ts:107） | 疑似位置：app/ui/tests/unit/shell/wire.test.ts:107 附近假 dsh 工厂补 ready(): Promise.reject | 严重度：L（U-21 在途可顺带）
