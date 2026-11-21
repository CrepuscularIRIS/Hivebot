verdict: PASS
commit: e50f44988c90d6bcde2359c2179fa063dbb14978（worktree /tmp/bot-wt/P5-51f2，验收全程 clean）

验收时间：2026-11-03 15:33（spec 自跑 15:31–15:32）。基 97f1f77，diff 仅 `app/ui/tests/e2e/grok-shim.spec.ts` +13/-7。

| 验收项 | 结果 | 证据（命令/文件/亲读内容） |
|---|---|---|
| ① 取证复核：argv 位置序 + 真实 exec 正对照 | PASS | 亲读 `work/p5-parity/evidence/P5-51f2/bwrap-argv-order.txt`：`--tmpfs /tmp` 参数位 38 < 工作区 `--bind .../workspaces/session-aaaa` 参数位 40；正对照 `touch 工作区内 → rc=0 宿主可见: true` 在案（行 72–73），负对照 rc=1 同 e2e 错字在案（行 74–75）。**独立核对薄弱环**：order.mjs 的 profile 数组声称逐字来自 dsh-sandbox-local——亲读 `app/sdk/node_modules/.pnpm/@deepseek-ai+dsh-sandbox-local@0.2.2-alpha.2*/lib/index.js:34-38`：`args.push("--tmpfs","/tmp"); for(root of workspaceWritableRoots) args.push("--bind",root,root)`，顺序一致，取证链闭环。方向②：亲读 `/tmp/bot-P5-51f2/runner-argv.json` 确含 permit-root×1/slirp×2 |
| ② spec 自跑（两包 build 后） | PASS | 自跑 `pnpm build`（ui，✓ built 1.08s）+ `renderer-grok pnpm build`（shim.iife.js ✓ built 28ms），再 `HOME=/tmp/bot-vfy-51f2 xvfb-run … pnpm exec playwright test tests/e2e/grok-shim.spec.ts` → `1 passed (6.6s)` RC=0，与申报同秒级。（注：PATH 里 miniconda 的 Python 版 `playwright` 无 `test` 子命令，必须 `pnpm exec`） |
| ③ 区域 + launchAligned 同模式 | PASS | `git diff --stat 97f1f77..e50f449` = 1 文件 +13/-7。与 `workspaces.spec` `launchAligned` 逐行同款：`sandboxHome('P5-51')` → `dataDir=join(home,'data')` → `launchSdkRuntime({dataDir})` + `launchShell({…, home})`；两侧同源经 `sdk-env.ts` 亲证（`shellChildEnv` 设 `PBOTS_DATA_DIR:join(home,'data')`＝`sdkDataDirEnv(dataDir)` 同值）。语义点核销：`createSessionForcedWorkspace`（`app/ui/main/m3-meta/orchestrate.ts:227-229`）以 `sessionId: ws.botId` 发 rpc → spec 用 `join(dataDir,'workspaces',sid)` 即真工作区，注释语义正确 |
| ④ 其余 e2e「仅 grok-shim 中招」抽验 | PASS | 全扫 e2e 目录 `touch` canary：session/visual/d4-deadline/journeys-d4-d5-d6 均从 `devState(page).views[x].cwd` 派生（journeys:52-54 亲读）；m2-deadline/m2-port 走 `createApprovalSession` 直连 SDK 显式 cwd（不经 UI main 的 P5-25 拦截，cwd 即沙箱 workspace root，不中招）；grok-persona `cwd:ws` 仅作 runtime 进程 cwd、全文件无 canary/touch 断言（grep 亲证）；workspaces.spec 本按 `$dataDir/workspaces` 取路径。结论成立 |
| 坏路径（独立复现） | PASS | 独立重跑 `node /tmp/bot-P5-51f2/order.mjs`（fresh 目录，非读存档）：tmpfs(36)<bind(38) 相对序与存档一致；工作区内 touch rc=0 宿主可见 true；**工作区外（旧 canary 位）touch rc=1 ENOENT 同 e2e 错字**——修复前稳定红的根因级行为独立复现，与修复方向自洽 |

无新增 [FIX]。canary 断言链亲读完整（`expect.poll(() => existsSync(okCanary), 30s)`），canary 不落地必红。evidence 目录卫生：仅 3 个取证文件，无 handoff/runtime/lock 泄漏。

观测（builder 已报、非本任务缺陷，交主会话）：/tmp 堆积 2335 个 `bot-U-00-*` 目录共 6.4G（launchShell 临时 HOME，崩溃进程的无人清扫），建议立小任务。
