# Review · T26（reviewer 6.1 Sol，2026-11-07）

范围：docs..feat/T26（bacf173e）。结论：**HIGH 1 / MEDIUM 3** → 全部修复验证（见末）。

| 严重度 | 位置 | 问题 | 处置 |
|---|---|---|---|
| HIGH · 已复现 | desktop.ts:201 | 「真首启无 bot 才进」忽略生产自动建 main bot（data.ts 空 roster 也建）→ countAgents=1 → gate 判老用户 → landing/六步**生产首启也不可达**；countAgents=0 变异掩盖此点 | **已修**：doLoadRoster 在「未 seen+空 roster」不建 main 直接返回；DevSurface.reloadRoster 补建入口；onboarding 完成/skip 统一经 finish() 补建；boot 门首启放开 |
| MEDIUM | onboarding-view.tsx:21 | Skip 只 setSeen+onStart（进六步）不退出 | **已修**：Skip=setSeen 后 onComplete(null) 直接退 |
| MEDIUM | data.ts:513-523 | create 步 description（职责+日常工具）被丢 | **已修**：并入 kickstart 提示（dsh 无槽最小落地） |
| MEDIUM | t26-landing-probe | 依赖源码变异的探针进默认 e2e 收集（还原后必红） | **已修**：移 tests/probe/ |

无发现：侧栏实参 isKickstartRequested:false 不误入；export * 完整；kickstart 与 T25 同型；①poll 时序真实。
reviewer 实跑：check diff=0、轻量探针三件（mock 传输/React hook/数据层）。
修复验证：onboarding 三态 3 passed + suite 连锁修复（launchProduct 置 seen+reloadRoster，三败法存档回执）→ **bots+kickstart+onboarding 16 passed**；unit 211；check diff=0。
