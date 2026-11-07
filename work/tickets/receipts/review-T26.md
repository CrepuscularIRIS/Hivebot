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

## 经理核实（任务 B，2026-11-07 12:4x，feat/T26 HEAD 8ba0b66c）
- 重跑：unit grok-shim+fold **211 passed**；e2e onboarding+bots+kickstart **16 passed**；check **diff=0: 332 files**——与回执一致。
- HIGH（首启自动建 main 架空 gate）：**成立，修法成立**。经理探针「升级用户」（roster 有 main、seen key 缺失、reload ×3）：3/3 不进 landing、gate 自动落 seen=1，老用户不被拖进引导。
- M Skip 直接退：成立，已修（onboarding-view Landing onSkip→finish(null)）。
- M description 丢：成立，已修（并入介绍提示）；但介绍时机本身偏离 0.79.3，见 T26b #4。
- M 探针进默认收集：成立，已修（tests/probe 不在 testDir）。
- **审查漏掉、经理新发现（→ open/T26b）**：
  1. landing 在视口外（box y=820=视口高，elementFromPoint null）：Landing 缺 `.sand-onboarding` 覆盖层根；`toBeVisible` 不查视口所以绿；回执 landing 截图实际不含 landing。**阻塞**。
  2. 常规 e2e 的 evaluate 置 seen 方案有竞态：launchProduct() ×3 中 1 次 onboarding 节点残留；现靠 landing 不可见才不挡。
  3. create 步直建不 setMain → finish→reloadRoster 再建空 main，用户得两个 bot。
  4. 介绍应在 seen 之后发（T25 工单 :24 锚点），回执「笔误」判断不成立。
- reloadRoster 借 `__pbotsDev`（回执存疑）：判**可接受**——index.ts:73 无条件安装、生产可达；T26b 只要求加注释标明生产在用。
