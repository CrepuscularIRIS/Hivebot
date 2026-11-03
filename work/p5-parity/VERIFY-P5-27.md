# VERIFY · P5-27 中途打断（A12，轻量抽验）

2026-11-03 12:28–12:52 · verifier（GLM 5.3）· 分支 `feat/P5-27` @ worktree `/tmp/bot-wt/P5-27`

```
verdict: PASS
commit: 91a498855858bfcaff4592a25f6d2bfbc745d0a4（基 c6aba1b，验收时 HEAD 未漂移）
```

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| ① cancel 发起 → bash 进程树（含 bwrap）≤5000ms 全退，PID 查 /proc 不用 pkill | PASS | 断言 `interrupt.test.ts:302/351` `expect(exitMs).toBeLessThanOrEqual(5000)`；树含 bwrap+sleep 断言 L249-250；退出判据 `/proc/<pid>` 全消失（含防僵尸，L203-211）。独立复跑 2 次全绿：`pnpm -C /tmp/bot-wt/P5-27/app/sdk test tests/e2e/interrupt.test.ts --disableConsoleIntercept` → 2 passed，实测行 5.82/5.84 ms（12:28）与 6.53/4.72 ms（12:52），证据 `evidence/P5-27/vfy-interrupt-rerun.log` |
| ② 之后 0 新工具调用 | PASS | L311 `tool/call` 恒 2、L312 模型请求恒 2、L310 审批卡恰 2 已代答、L308 取消后 1s 宽限、L307 turn/end = `{kind:'aborted',reason:{kind:'user'}}`；harness 辅助为真实现（`waitForTurnEnd`/`processTree` 走真实帧与 /proc children），非空转断言 |
| ③ 会话可继续发消息并收到回复 | PASS | L316 `waitForDelta('P527_CONTINUED')`（逐字 text-delta 匹配）、L329 续发后请求恰 +1（=3）、L330 tool/call 仍 2、L331 已记录 PID `/proc` 查询不复活 |
| 时限数据真实性（抽验项） | PASS | 我的 4 个独立样本 4.72–6.53 ms，与申报 8 样本 4.70–6.25 同量级且数值各异 → 活测量非硬编码；每值 ≈阈值 1/800。计时口径复核：t0 在 `client.call('session/cancel')` 之前、/proc 轮询 5ms（L252-255），与 R4b 同口径 |
| 区域：仅 1 个新测试文件，产品零改动 | PASS | `git diff --name-status c6aba1b..91a4988` → `A app/sdk/tests/e2e/interrupt.test.ts`（唯一改动，359 行）。UI 等价入口申报属实：`store.ts:375-377` 原文 `cancelTurn → api('session/cancel',{request:{sessionId}})` 与测试同参 |
| 独立复跑全量（期望 32/251） | **有保留** | interrupt 在 4 次全量中均绿（251 总数含其 2 条、从不进失败列表）；但全量在本机 load 6-10 下间歇红（5/6/9 个失败，另有 1 轮无失败行），失败全在预存文件（guard-fs/sandbox-hardened/approval/stream/never-roots）。**基点对照：c6aba1b 同样复现**（交替跑 guard-fs+sandbox-hardened 两文件：基点 6 轮 2 红，P5-27 侧 6 轮 3 红，interrupt 未加载）→ 与本任务无因果，builder 的 32/251 全绿是真实但负载相关的结果 |

**截图说明**：本任务为 SDK e2e 测试实测类，无 UI 界面，按派发单不适用浏览器截图；证据为命令输出与日志文件（`evidence/P5-27/`：vfy-interrupt-rerun.log、vfy-p527-full3.log、vfy-p527-full4.log）。

新问题（每条一行，可直接成为修复任务）：

- [FIX] app/sdk 全量测试在高负载（load≥6，GPU 训练期间）下间歇红，失败集每轮漂移（guard-fs ②③④⑥⑧、sandbox-hardened ⑨、approval D8、stream ①、never-roots toolchainDirs），日志可见 `p2sdk: no ready line within 1ms` 后 SIGTERM 的竞态线索；基点 c6aba1b 同样复现，非 P5-27 引入 | 复现：负载 >6 时 `pnpm -C app/sdk test` 连跑 3 轮以上观察失败漂移 | 疑似位置：`app/sdk/tests/support/runtime.ts`（ready-line 等待）及 guard-fs 等用例的紧时限断言 | 严重度 M（「合并后全量绿」闸门在训练时段不可靠，建议：ready 等待加宽容时限或标记 load-sensitive 重试，报告中记录负载）
- [FIX] interrupt.test.ts 的 fakeOverlay mkdtemp 目录（/tmp/p5-27-patch-*）afterAll 不清理，沿 sandbox-hardened 同模式，/tmp 已积同类残留 2411 项（p5-01-* 等） | 复现：`ls /tmp \| grep -cE 'p5-01|p5-27'` → 2411 | 疑似位置：`interrupt.test.ts:63 fakeOverlay()`（及同模式各 e2e） | 严重度 L

观察项（不阻断）：builder 的 evidence/ 无 P5-27 目录，8 样本实测表在 REPORT 文件内；实测行由测试 console 打印（需 --disableConsoleIntercept）且已被我独立复现 4 次，视为足够。测试文件无 pkill/kill 调用（唯一 "pkill" 出现在 L9 注释「不用 pkill」），teardown 走 launchRuntime.stop 自管子进程，符合 LEARNINGS 与 §5。
