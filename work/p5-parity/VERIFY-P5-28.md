# VERIFY-P5-28 · 提问作答 main 分支（C2 ⑥）

verdict: PASS
commit: eb6e73a0db58f7fd5173fc655cb4ff506a0b1d96（feat/P5-28 @ /tmp/bot-wt/P5-28，基 c6aba1b，验收后现场干净）

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| 独立复跑：build | PASS | `pnpm build` ✓ built in 1.18s（HOME=/tmp/bot-P5-28-vfy） |
| 独立复跑：vitest 全量（期望 271） | PASS | 271 passed / 28 files（evidence/P5-28-vfy-commands.txt §2） |
| 独立复跑：全量 e2e（期望 62） | PASS（带 1 既有 flake，见新问题） | 第一遍 61+1 failed、第二遍 **62 passed (7.1m)**（evidence/P5-28-e2e-full-run{1,2}.log） |
| ① 合法 answers 透传 + 同批 id 进工具结果 | PASS | 单测 m1/api.test.ts「① 合法 answers」断言 `dsh.calls[0]` 与 args toEqual（逐字段）+ 下账且审批条目不动；e2e questions-answer.spec.ts:103 ✓（两批：q1/q2 走 renderer `window.pbots.api`→M1→dsh 生产路径，q3 走扩展 testAnswerEvent main peer 注入；tool/result 轮询含 q1/q2/note-42 与 q3/via-hook 同批 id，收尾 turn/end 不卡死） |
| ② invalid 矩阵 dsh 计数 0 | PASS | api.test.ts it.each（id 缺/多/类型错/selected 非数组/answers 非数组）→ `pbots/invalid-args` + `dsh.apiCount===0` + 不下账；「对审批事件传 answers」→ invalid-args（P5-07 反向）；ledger.test.ts 纯函数矩阵 13 条拒因（含重复 id、额外字段、custom 非串）；e2e 漏答 q2 → error.code==='pbots/invalid-args' |
| ③ 同 eventId 二答拒 + reload 场景 | PASS | 单测：二答 `second.ok===false` 且 `dsh.apiCount===1`；e2e：`page.reload()` → 新 clientId（≠旧），对已消费 first.eventId 再答 → `pbots/invalid-args`（成功即消费，重连不重复提交） |
| 红基线（摘 m1 分支 → ① e2e 红 → 恢复绿） | PASS | 摘 questionIds 分支恢复 P5-07 占位拒绝 → rebuild → spec ✘ 1 failed（good.ok 断言红）；还原 → worktree 无 diff → rebuild → ✓ 1 passed（evidence/P5-28-vfy-commands.txt §5） |
| 区域：6 文件 vs 申报 | PASS | `git diff --stat c6aba1b..eb6e73a` 恰 6 文件 +419/-16：ledger.ts、m1-api/index.ts、m2-mux/index.ts、e2e questions-answer.spec.ts（新）、unit m1/api.test.ts、unit shell/ledger.test.ts，与申报一致 |
| testAnswerEvent 旧调用点兼容（string 形态） | PASS | m2-deadline.spec.ts:175、m2-port.spec.ts:305/354 仍传 'allowed-once'（联合类型向后兼容）；两遍全量这些 spec 全 ✓（run2 log #18-23） |

补充：视觉截图不适用（纯 main 进程改动，无 UI 面；renderer 提问卡是 P5-33 范围外，报告已注明）。fail-closed 设计核过：questions 形状不合法的 waterfall 不入账 + warn 恰 1 次，交 deadline 协议级拒绝（P5-07 ③）。

新问题（每条一行，可直接成为修复任务）：
- [FIX] 全量 e2e 偶发 visual.spec:55 启动崩：`ENOENT stat '/tmp/p2sdk-handoff-*'` | 复现：`pnpm test:e2e` 全量（2 遍中 1 遍命中；隔离复跑该 spec 过） | 疑似位置：`app/sdk/src/policy/never-roots.mjs:75`（handoffSiblings 对 /tmp/p2sdk-handoff-* 先 isDir 过滤再裸 statSync，目录在两步之间被上一测试 teardown 删除 → TOCTOU；P5-02@e964f6f 既有，P5-28 新 e2e 增加一次 handoff 生灭周期加大暴露面） | 严重度：低（测试基建 flake；修法：statSync 包 try/catch 跳过已消失目录）
