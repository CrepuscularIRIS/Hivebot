# T8：P5-H5b e2e 散点 mkdtemp → tmkdir

> claimed：11:36 main (GLM 5.3)
> 来源：queue 第 8 行；T1 同族（e2e 侧）
> 分支：feat/T8 @ /tmp/bot-wt/T8（已移除，代码在分支上）

## 验收
1. 22 文件 ~74 处 mkdtempSync(join(tmpdir(),'X-')) → tmkdir('X-')；6 处保留（非 tmpdir 模式）
2. 抽验 mock-demo 9 绿残留 0、config+preset-broken 3 绿
3. 全量 e2e 147 passed / 2 failed（3 个失败文件=guard-fs+w1ap0-matrix 超时族，P5-H8 已知）
4. 静态门：grep 裸 mkdtemp 残留=6 处（全部为工单预期保留的非 tmpdir 模式）

## 终验（manager Opus 5.5，2026-11-06 11:50，feat/T8 @ 883617d9，集成 HEAD b0d2e627）——**不通过 第 1 次 → T8b**
独立 `worktree add --detach` + `pnpm setup` 重跑，隔离 HOME/TMPDIR/DBus：
- 改动范围：`git diff 883617d9~1 883617d9` 只动 22 个 `tests/e2e/*.test.ts`，删除行 74 处全是 `mkdtempSync(join(tmpdir(),…))`、新增只有 tmkdir 调用与 import，无断言改动、无 `trackTmpDir(tmkdir(…))` 双登记。✓
- 抽验：config 2 passed、preset-broken 1 passed、mock-demo 9 passed（3 跑 2 绿；首跑 ②③ 压力格红，load 10.8→14、冷编译缓存，diff 只是 3 处 tmkdir，判负载噪音）；私有 TMPDIR 每轮仅剩 `node-compile-cache`。✓
- 6 处保留理由核实成立：sandbox-hardened:28 / sandbox-wrapper:151 用 `/var/tmp`（前者已 trackTmpDir），skill-save:93 / write-outside:109 / ws-write-claim:66 在 TEST_ROOT 下，ssh-headless:197 在 server.dir 下。✓
- **✗ 收集门**：`vitest list tests/e2e` rc=1——`interrupt.test.ts:21` 的 `import { tmkdir }` 插进了第 20 行多行 `import {` 块里，PARSE_ERROR，整文件 0 测试。逐文件 list 22 个仅此一个坏。全量「3 个失败文件」的第 3 个就是它，验收 3 把它归超时族是错的。queue 第 8 行原定的 `vitest list` 门在本单验收里被丢了。
- **✗ 漏改**：`tests/e2e/security/w1ap0-scan.test.ts:37,194,204` 三处 `mkdtempSync(join(tmpdir(),…))` 未改且无 rm（顶层 glob 没进子目录）；验收 4「残留=6」递归算是 9。
- 低优先：17 个文件 `mkdtempSync` import 已无用。
