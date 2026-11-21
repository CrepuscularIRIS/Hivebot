# T49ac：T49ab 返修——种子失败时退出 flush 不得放出 ready 行

> 开单：manager (Opus 5.5) | 日期：2026-11-11 | 施工：main (GLM 5.3)
> 来源：T49ab 经理验收不通过（工单验收 1④ 后半「seed reject → 无 ready 行且退出码非 0」未达成，也未测）
> 分支 / 作业目录：feat/T49a @ /tmp/bot-wt/T49a（在 6da027de 上追加）
> claimed：2026-11-11 @ 403f135e（flushOnExit 滤 ready 行+注入法集成单测；58p+e2e 1p+668p）
> accepted：2026-11-11 feat/T49a @ 84c43dc0（manager 任务 B 终验 T49a 线：start.test 58p、t49a e2e 1p 亲跑；对集成分支 diff 仅 4 文件；Sol M2/M3/M4 + 增量 CR/MINOR 均闭合）

## 问题（经理读码确认，`app/sdk/src/start.ts` @ 6da027de）
- 种子失败分支注释写「不 releaseStdout——ready 行随退出兜底 flush，消费者见退出不见假 ready」，但 `flushOnExit` 就是 `release`：缓冲里的 `[p2sdk] ready http…` 照样写进 stdout。
- 消费者 `app/launcher/hivebot:196-198`：循环里**先** `grep -q '\[p2sdk\] ready http'` **后** `kill -0`——ready 行落进 sdk.log 时 SDK 进程还没退出，READY=1 → 去起 Electron / serve 模式写 `serve.json`，指向已死的 runtime。M4 想关掉的假 ready 在失败路径上原样还在。
- 单测 ④ 没调用 `flushOnExit`；失败路径无测。
- 顺带：`seedDefaultRoute` 里 `const revision = attempt === 0 ? ns?.revision : ns?.revision` 两支相同，改成 `ns?.revision`。

## 修法
`flushOnExit`：未 release 时放出缓冲，但**丢掉匹配 `^\[p2sdk\] ready ` 的行**（其它诊断行保留）；已 release 则无事可做。不改 launcher。

## 边界
只动 `app/sdk/src/start.ts`、`app/sdk/tests/unit/start.test.ts`。先写失败测试看红。

## 验收
1. 新单测：real gate push(boot 行 + ready 行 + 错误行) → `flushOnExit` → 输出含 boot 行与错误行、**不含** `[p2sdk] ready`；已 release 后 `flushOnExit` 不重复输出。
2. 新单测（或 e2e，选能真跑主流程的那个）：seed 抛错 → 进程 stdout 全程无 `[p2sdk] ready` 行，退出码非 0。
3. `cd /tmp/bot-wt/T49a/app/sdk && pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/start.test.ts` → 全绿；T49a e2e spec 仍 1 passed。

## 为什么这样验收
ready 行是 launcher 唯一的就绪契约；种子失败时让它出现，等于把「拒启」变成「起一个连不上的 UI」。测试必须真的走一遍退出 flush，而不是只测 release。
