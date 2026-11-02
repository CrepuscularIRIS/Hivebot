# VERIFY-T-18 · p2temp 注册规范化 + broken 不缓存（最终 L R2+R3+R4+R5）

verdict: PASS
commit: 24a901a297a9a038119862b157a80430a0ea1067
worktree: /tmp/bot-wt/T-18（验收期间 HEAD 无漂移，树干净；红基线在独立 detach worktree /tmp/bot-wt/T-18-red 做完已删）

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| ④ 全量 132/132 | PASS | 干净树亲跑两轮：`pnpm vitest run` → Test Files 19 passed / Tests 132 passed（11:28:08，30s）；`pnpm vitest run --coverage` → 同 132/132。evidence/T-18/coverage-tail.txt |
| ④ p2temp 覆盖率 ≥85 | PASS | src/p2temp 100 Stmts / 96.55 Branch / 100 Funcs / 100 Lines（门槛 85，vitest.config 硬门槛放行）。coverage-tail.txt |
| ① ['a','a'] 与 ['a'] 一致（语义） | PASS | 亲读 src：`normalizeConnectors` 返回 `[...new Set(connectors)].sort()`（index.mjs:69）；`ensurePreset` 规范化一次后 id（presetIdOf(names)）与注册内容（registerPreset(names)）同源（index.mjs:207-210）；两个远端入口均经 ensurePreset，无原始数组绕过路径。活体检查：evidence/T-18/normalize-idempotence-live.txt——id(['a','a'])===id(['a']) 为 true、normalize 去重排序、不改输入、['a',''] 拒绝。单测 T-18① 断言 ['a','a'] 与 ['a'] 注册 plugins 完全一致且 register 仅 1 次 |
| ① 红侧证明（旧码确实两份行） | PASS | detach worktree 回退 index.mjs 到 24a901a^ 后 T-18① 红：`AssertionError: ['a','a'] and ['a'] register exactly the same plugins`。evidence/T-18/red-baseline.txt |
| ② broken→抛错→修复后同 id 重试成功（真实链路，亲跑） | PASS | `pnpm vitest run tests/e2e/preset-broken.test.ts --reporter=verbose` → ✓ 2599ms（真实 dsh runtime）：缺 name patch 行 → ensure 抛 p2temp/preset-broken → 修已装 bundle patch → 同 id 重试成功（registerAttempts=2 的单测同步证明重注册）→ createWithConnectors 建 session 成功（真实 retain() 过）。evidence/T-18/e2e-preset-broken-verbose.txt |
| ② fake registry 忠实镜像上游 | PASS | 逐点对照 repos/deepseek-harness/packages/preset/agent-preset-registry/src/index.ts:97-136：①Duplicate throw（:100）②definitions.set 先于激活（:102）③激活失败 catch 进 record.broken、不 reject（:133-137）④返回注销器（删 definitions + await ready，:107-113）⑤register await activate 后才返回 → broken 检查读到终值。fake 四点全镜像，且用安装包的真实 entryListProblem 校验（createRequire 锚点与 src 相同）；真实 activate 还含 mountPreset 失败面，fake 只镜像 entryListProblem——是忠实子集，注释如实声明 |
| ③ presetIdOf 恒等保持 | PASS | preset-id.mjs 不在 diff（`git diff 24a901a^..24a901a --name-only` 恰 3 文件：src/p2temp/index.mjs、tests/e2e/preset-broken.test.ts、tests/unit/p2temp.proc.mjs）；活体检查 id(['b','a'])===id(['a','b']) 为 true |
| 红基线：红 5 + e2e 红（缺 name 返回「成功」） | PASS | 独立复现：红 worktree 跑 p2temp.test.ts + preset-broken.test.ts → 单测 5 红（normalize 去重、T-18①、broken 抛错、遗留 broken、无注销器）+ e2e 红且签名精确：`AssertionError: promise resolved "{ presetId: 'p2temp-5c78e7627507' }" instead of rejecting`——旧码对 broken preset 返回「成功」id，正是 R2/R4。red-baseline.txt |
| ④ 区域恰 3 文件 | PASS | git diff --name-only 见上行 ③ |
| ④ has-check：broken 注销后不服务 | PASS | 逻辑核对 registerPreset（index.mjs:216-236）：has-check 遇 `existing.broken !== undefined` → throw presetBroken（绝不作为成功返回）；register 后读 record.broken → 调用注销器删死记录 → 抛 p2temp/preset-broken（details: presetId+diagnostic）→ 同 id 重试命中空 has-check 走完整路径。单测三情形全绿：broken 抛错+注销+同 id 重注册（registerAttempts=2）、遗留 broken 不服务（registerAttempts=0）、无注销器仍响亮失败 |
| ⑤ T-16 链保持绿 | PASS | `pnpm vitest run tests/e2e/preset-broken.test.ts tests/e2e/connector-restart.test.ts tests/e2e/events-replay.test.ts` → 3 files / 3 tests passed。evidence/T-18/e2e-t16-chain.txt |

## 坏路径探查（额外）

- 遗留 broken 记录（如进程在 register 与注销间崩溃）：has-check 抛 presetBroken、不 re-register（上游同 id register 会 Duplicate throw，重注册本就不可行）——响亮失败而非旧码的静默「成功」，单测显式锁定该设计。
- register 无注销器（旧式包装）：每次重试都响亮报错，绝不返回成功 id（单测 2 次尝试全拒）。
- 无效输入 ['a',''] / 非数组：normalizeConnectors 抛错（活体检查）。
- 进程卫生：测试自带 SIGTERM 转发清理，`bot-reap --match T-18 / p2sdk-t18` 无残留（U-00 在途任务的 dsh 进程未触碰）。

## 备注（非缺陷）

- 红基线的「红 5」= 4 个新增单测 + 1 个改写断言的既有 normalize 用例；e2e 红独立第 6 个。与 builder 申报一致。
- fake registry 只镜像 entryListProblem 失败面，未镜像 mountPreset 失败面——真实 runtime 的 mount 失败由 e2e 的真实链路兜底覆盖，且 SDK 层对两类失败的处理点相同（register 后读 record.broken），无分叉风险。

新问题：无。
