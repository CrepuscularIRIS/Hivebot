# VERIFY-U-28 · P4 终审 L-5 A 组——m3/main 恢复链 6 条（R1-R6）

verdict: PASS
commit: 0988baa4c5a7f990ef12532009734fd183a78e3f（/tmp/bot-wt/U-28，验收期间无漂移，worktree 干净）
验收时间：2026-11-02 20:41–20:57（verifier GLM 5.3，全部亲自复跑）

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| 复跑：build + 单测 209/209 + e2e 52（--workers=1） | PASS | `rm -rf out && pnpm build` ✓ 1.14s；`HOME=/tmp/bot-vfy-u28 pnpm test` → **23 files / 209 tests 全绿（3.84s）**；`pnpm test:e2e -- --workers=1` → **52 passed (5.3m) + 1 failed**（d1-real-model，见下）。evidence/U-28/rerun-summary.txt |
| ① R1 双开退出 | PASS | 单测 2 条（guardSingleInstance 拿锁/拒锁）；e2e `single-instance.spec.ts` 亲跑 2 次均绿（全量内 813ms + 单跑 883ms）；**测试框架外手工双开**（node spawn 真进程）：同 userData 第二实例 exit=0 + stderr `[pbots] Personal Bots 已在运行（单实例锁），本进程退出。`、首实例存活；反向：不同 userData 两实例均存活（锁按 userData 分键不误杀）。evidence/U-28/manual-dual.txt |
| ② R2 rpc try/catch（两处） | PASS | `m3-meta/index.ts:70-76`（get 的 agentPresets/list）与 `:101-107`（patch 的 session/list）各一 try/catch → `pbots/unavailable` 结构化，handler 不再 reject；单测 2 条（含「不落盘」断言）红→绿。裸 rpc 残查：restore.ts:36 走 allSettled、orchestrate.ts:94/:114 走 M1 路径（renderer api() 已有 catch，U-22 GU-1 兜底）——R2 范围（M3 handler）闭合 |
| ③ R3/R4 重连补跑恢复（onConnected） | PASS | `connect.ts` 新增 onConnected（gen≥1 每次连接成功触发，listener 抛错吞掉不破坏 waiter）；`main/index.ts` wireRestoreOnReconnect：串行链不叠跑 + setDshReady 补调。**U-17 保留**：超时分支仍 `ready.setRestoreSettled`（只放行 M1/M2 闸门、不退出、不挂死），dshStart 派生 promise 带 rejection handler。真 ws 单测：超时 reject 后服务恢复 → onConnected(gen 1) 仍触发；断线 → gen 2 再触发。接线级：首连 ensure 失败 → 重连补跑（ensure 第 2 批）→ failed 清空、M3 get live false→true |
| ④ R5 failed 清除（两条路径） | PASS | restore.ts:52-53（补跑/首跑成功 → `failed.delete`）+ orchestrate.ts:123-125（#4 成功同 presetId → `opts.failed?.delete`；#4 失败保留）；wiring 传同一实例：`wrapM1WithOrchestration(..., m3.store, m3.failed)`。两侧单测红→绿（orchestrate 2 条 + restore 1 条） |
| ⑤ R6 restore-pending + renderer 零改动 | PASS | `M3Deps.restoreSettled`（main 注入 `ready.status().restore !== false`）；未 settle → `{ok:false, code:'pbots/restore-pending'}` 且**不查 #1**（单测断言 dsh.calls===0）；settle 后同句柄返回正常视图。`git diff 70c5925..0988baa -- app/ui/renderer app/ui/preload` = **0 行**；loadRoster 现有逻辑 `!meta.ok → 字符串 → 500ms 循环`（store.ts:208-210、229-233）消化该错误——renderer 零改动成立，R6 确实依赖现有重试 |
| 红基线：新测试 detach 还原后应红 | PASS | 独立 detach worktree @0988baa + `git checkout 70c5925 -- app/ui/main`（只还原 5 个源文件，保留测试）→ **12 failed | 51 passed**：12 条行为测试全红。第 13 条新增（「未传 failed → 行为不变」兼容断言）旧代码上绿——by design。evidence/U-28/red-baseline.txt |
| 区域：12 文件 + renderer 零改动 | PASS | `git show --stat HEAD` 恰 12 文件（main×5 + tests×7，550+/22-），无越界；renderer/preload diff 0 行 |
| showErrorBox 取舍复核 | 合理 | Linux 上 dialog.showErrorBox 模态阻塞至人工确认——「退出」依赖交互会在自动化/远程/无头场景挂死（e2e 双开 spec 的 10s 退出断言本身就会挂死）。注入 alert（生产=console.error）+ exit 0 是 CLI 惯例，取舍正确；代价是无 GUI 弹窗，可接受 |

## e2e 1 failed 的定性（非 U-28 回归）

`d1-real-model.spec.ts` 全量跑红，失败签名 `LITELLM_MASTER_KEY undefined`——与终审 **R9 基线问题**（sdk-runtime.ts:70 在 worker process.env 里删 key，顺序依赖）机制完全一致：①U-28 的 12 文件不含 sdk-runtime.ts/任何 journey 文件；②该 spec **单跑绿（1 passed, 18.3s）**；③R9 属 B 组待修。U-31 合并时该失败已存在（终审范围 d0a8008..70c5925 即已 CONFIRMED）。

## 新问题（每条一行，可直接成为修复任务）

- [FIX] 首连超时→引擎迟恢复的窗口内 `restoreSettled` 为 stale true，M3 get 可给瞬态 live=false 且 renderer boot 期缓存不刷新（refreshRoster 只更新 summaries 丢弃 meta）| 复现：PBOTS_DSH_START_TIMEOUT_MS 调小 + 引擎晚起 → 超时放行闸门 → 重连补跑 restore 期间 renderer 的挂起 loadRoster 恰好放行拿到旧 roster 视图 | 疑似位置：app/ui/main/index.ts（wireRestoreOnReconnect 重跑前重臂 restore 未 settle）+ renderer/shell/store.ts refreshRoster | 严重度 minor（正常 boot 路径已被 restore-pending 保护；此残留只影响超时路径的 UI 缓存，main 侧 live 已会翻回）
- [FIX] e2e 全量时 d1-real-model 恒红（worker env 顺序依赖）| 复现：`pnpm test:e2e -- --workers=1` | 疑似位置：tests/support/sdk-runtime.ts:70（= 终审 R9，B 组归口，此处仅记录验收现场）| 严重度 major（交付闸门 E2E 顺序依赖，但非本任务引入）
- [NOTE] BOOT_TIMEOUT_MS=60s < 多配方恢复最坏时长（N×30s）时 boot 走 failed+重试按钮（可恢复，非挂死；restore-pending 消息会作为 bootError 显示）| 严重度 trivial，可不修

## 备注

- 本任务纯 m3/main 侧，renderer 零改动（diff 0 行已证），故无 UI 截图项；进程级行为以真实双开 + 真实 Electron 进程退出码/stderr 为证（manual-dual.txt）。
- 清理：红基线 worktree /tmp/bot-wt/U-28-red 已 remove；/tmp/vfy-u28-dual 已删；测试进程均为脚本自管子进程（§5）。
