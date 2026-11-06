# T9b4：guard remoteHome 校验随插件释放而停（Sol C1）

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：`work/tickets/review/T9b-chain-security.md` C1（经理核实成立，两条路径均复现退出码 86）；另含 P1 的一处注释更正
> 分支 / 作业目录：feat/T9b4 @ /tmp/bot-wt/T9b4（从 `docs/rebuild-p6-p5-plan` 切；与 T10 无共享文件，可并行，见边界 4）
> claimed：2026-11-06 18:4x main (GLM 5.3) @ /tmp/bot-wt/T9b4
> accepted：

## 目标
guard 插件被 cordis 释放后，remoteHome 启动校验不再校验、不再 `process.exit(86)`。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. `app/sdk/src/policy/guard.mjs:241-271`（校验 + 轮询）
3. 本仓已有的两种释放登记写法：`src/policy/request-net.mjs:194`（`ctx.effect(() => dispose)`）、`src/orchestration/routing-prompt.mjs:74`（`ctx.on('dispose', …)`）——照其一，不自造
4. 经理复现步骤（探针已删，步骤与输出见审查报告「## 经理核实」C1 节；新增格 ⓐⓑ 就是那两段探针的测试版）

## 边界
1. 只动：`app/sdk/src/policy/guard.mjs`（remoteHome 段）、`app/sdk/src/policy/fs-zone-ssh.mjs:47-48`（**只改注释**，见「要做的」3）、`app/sdk/tests/unit/guard.test.ts`（只加格，不改不删现有格）、`work/tickets/receipts/T9b4.md`。
2. 先红：新格 ⓐⓑ 在现 HEAD 上跑红（贴原样），再改代码。
3. 隔离 HOME / TMPDIR，`DBUS_SESSION_BUS_ADDRESS` 指向不存在路径；pnpm 跑 vitest 带 `--config.verify-deps-before-run=false`。
4. 唯一一条 e2e（验收 4）避开 T10 的 e2e 窗口跑，同刻一套。
5. 只在 feat/T9b4 提交；合并等经理验收。

## 要做的
1. 释放即停，两条路径都要堵：
   - 轮询路径：`setTimeout` 句柄登记到插件生命周期，释放时 `clearTimeout`；
   - 已发出的 `ssh.ready.then(verify)` 撤不回——回调入口（`verify` 开头与 `.catch` 里）先判 disposed，已释放直接返回，不打 stderr、不退出。
   - disposed 标志在释放钩子里置位；用 `ctx.effect` 或 `ctx.on('dispose')`（二选一，照仓内先例）。
2. 未释放时行为逐字不变：配错 → exit(86)；60s 等不到 ssh → exit(86)；相等 / 未配置 → 零动作。
3. P1 注释更正（不改代码）：`fs-zone-ssh.mjs:47-48` 的 ponytail 注释前提「上游 resolve 结果对同一拼写稳定」不成立。改为如实写语义：**首次解析即钉住**——ws 原串事后被换链，可写根仍是首次的 realpath（拒新目标、不跟随放宽）；上限 = 首次解析前就被换链会钉错，根治在 T11 建 ws 时存远端 canonical 路径。

## 新增测试格（`tests/unit/guard.test.ts`，用真 cordis `Context`，不用手搓 ctx）
`import { Context } from '@deepseek-ai/cordis'`；`root.plugin({ name: 'g', apply: plugin.apply }, { roots: configRoots(), remoteHome: '/configured' })`；`process.exit` / `console.error` 照现有 :269-270 spy。
- ⓐ 轮询路径：不提供 ssh 服务；`await fiber` → `await fiber.dispose()` → 前移 61s（`vi.useFakeTimers()` 放在 `await fiber` 之后，防 cordis 加载卡在假时钟上；用 `vi.advanceTimersByTimeAsync(61_000)`）→ `expect(exit).not.toHaveBeenCalled()`。先红 = 现 HEAD `toHaveBeenCalledWith(86)`。
- ⓑ ready 路径：`root.provide('ssh'); root.provide('fs'); root.set('ssh', { ready })`（ready 为手动 resolve 的 Promise）、`fs.resolve` 返回 `/actual`；`await fiber` → `await fiber.dispose()` → resolve ready → 冲刷微任务（`await new Promise((r) => setImmediate(r))` 两次）→ `exit` 未被调用。先红 = 现 HEAD 被调 86。
- ⓒ 对照（保住 fail closed）：同 ⓐ 但**不释放**，前移 61s → `toHaveBeenCalledWith(86)` 且 stderr 含 `timed out waiting for the ssh service`。防修法把轮询整个弄没。
- 每格 finally 里 `vi.useRealTimers()`、restore spy、释放 root（`root.registry`/fiber 无需额外清理时注明）。

## 验收（写命令，不写感觉）
（前缀 `cd app/sdk && env HOME=$T TMPDIR=$T DBUS_SESSION_BUS_ADDRESS=unix:path=/nonexistent pnpm --config.verify-deps-before-run=false exec`）
1. 先红：现 HEAD 上 `vitest run tests/unit/guard.test.ts -t 'T9b4'` → ⓐⓑ 红、ⓒ 绿（贴原样）。
2. `vitest run tests/unit/guard.test.ts tests/unit/start.test.ts tests/unit/containment.test.ts tests/unit/fs-zone-write-entries.test.ts` → 全绿，格数 = 77 + 新增格数（照实写）。
3. 变异（各贴原样，`cp` 还原）：
   - 去掉 `clearTimeout`（disposed 判断留着）→ 预期仍绿或红照实写；去掉 disposed 判断（clearTimeout 留着）→ ⓑ 红；两者都去 → ⓐⓑ 红。
   - 把 disposed 判断改成恒 true → ⓒ 红（证 ⓒ 不是空格）。
4. 回归 e2e 一条：`vitest run tests/e2e/ssh-product.test.ts -t '②d'` → 1 passed（配错仍起不来），跑后 `pgrep -af bot-wt/T9b4` 无输出。
5. 改动行覆盖 ≥80%：`vitest run tests/unit/guard.test.ts --coverage --coverage.include=src/policy/guard.mjs`，回执贴 remoteHome 段（:241 起）未覆盖行号。
6. `git diff --stat docs/rebuild-p6-p5-plan..HEAD` 只含边界 1 的文件；`git diff … -- app/sdk/src/policy/fs-zone-ssh.mjs` 只有注释行。

## 为什么这样验收
要保住的是两件事同时成立：**释放后的旧实例不能杀掉进程**（热重载 / plugin-manager 停用 guard 行后，旧配置的旧实例 60s 后误杀，或 ssh 晚到时用旧 remoteHome 误判），**未释放时配错仍必须起不来**（D2 的 fail closed，ⓒ 与 e2e ②d 守着）。手搓 ctx 没有 dispose 语义——终验漏网正因单测只用 `{on,get}` 假 ctx，所以新格必须用真 Context。ⓑ 是单靠 `clearTimeout` 堵不住的那条路，变异 3 证它真在测。

## 产出
- 修改：`app/sdk/src/policy/guard.mjs`、`app/sdk/src/policy/fs-zone-ssh.mjs`（注释）、`app/sdk/tests/unit/guard.test.ts`
- 回执：`work/tickets/receipts/T9b4.md`（照 `_templates/receipt.md`）
