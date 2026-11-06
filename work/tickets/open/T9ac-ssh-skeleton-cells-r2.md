# T9ac：T9a 链返修（第 2 次不通过，任务 C 重拆）——⑧ 空断言 + D11 前提证伪 + T9ab 未落项

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：T9ab 经理终验（2026-11-06 @ 1395281b，/dev/shm/bot-T9a feat/T9a）；DESIGN-ssh-composition.md r3（缩进修复，已落 387b1d6d）与 r4（D11 改定）
> 分支 / 作业目录：feat/T9a 续提交 @ /dev/shm/bot-T9a
> claimed：
> accepted：
> 失败计数：T9a 链第 2 次（T9a → T9ab → 本单）。本单再不过 → 三单挪 blocked/，交 architect。

## 经理实测（原样，2026-11-06 13:36–13:45）
- unit `start.test.ts + guard.test.ts` → `Tests 64 passed (64)`；e2e `ssh-product.test.ts` → `Tests 3 passed (3)`；`grep -rn 'P2SDK_SSH_' ../ui/ profile/` → 空；`grep -n 'expect(true)'` → 空。
- **M2**（start.ts:297 改成 `? ``\``）→ `× ⑨ … AssertionError: expected 'Error: grep search failed (exit 2): r…' to contain 'not available in ssh mode'`，**成立**（T9ac 缩进修复是真的）。
- **MW**（删 sshRows 里 `workflow-ptc`/`tool-workflow`/`tool-executor-ptc` 三禁行）→ `-t '⑧'` → `Tests 1 passed | 2 skipped`，**⑧ 照绿**。原因：⑧ 拿 `requests.jsonl` 的 `userTexts` 断言「不含 workflow」，而 fake 插件（`tests/support/fake/plugin.mjs:132-150`）根本不记工具清单，`userTexts` 永远只是 `T9a`。⑧ 关于工具面的结论是空断言；DESIGN r3 表中「首请求工具面无 `workflow`（T9ab ⑧ 绿）」没有证据。
- **还原 `tests/support/runtime.ts` 到 03251ea2** → `Error: socket hang up`、`Tests 3 skipped`。重试确实需要。
- **⑪ 名不副实**：验收后 `pgrep -af bot-T9a` 有 7 套 dsh runtime（11:09/11:12/11:13/11:26/13:34 施工期 + 经理 2 套）各带 ssh master + 远端 helper，ppid 全是 2050（孤儿）；`/tmp/dsh-ssh-MXCL4p` 内有活的 `master` 套接字。根因：`start.ts:795` `dshSpawnOptions` 故意 `detached: true`（T-13：launcher 崩了 dsh 照活、锁护住 home），所以 SIGKILL launcher **本来就不会**带走 dsh。⑪ 的 `added` 以 kill 前为基线，而 dsh-ssh 目录早在建会话时就有了 → 恒为空集；端口格 `rejects.toThrow()` 任何错都过。经理 reap 自己的 dsh（优雅退出）后 master 与目录一起消失。

## 目标
让 ⑧⑨⑪ 三格真的断言工单原意，并把 T9ab 未落的小项补齐。产品代码（sshRows / extraNeverTools / childEnv / validateStart）不改，除非下面某格先红证明它错了。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md（末两条：断言载体、detached 子进程）
2. `work/p9-dsh-integration/DESIGN-ssh-composition.md` r3、r4 两节
3. `doing/T9ab-ssh-skeleton-e2e-real.md`「要做的事」2、4、6 条（本单补齐的就是它们）
4. T4 写法：`tests/e2e/ssh-headless.test.ts:283` ④（「无夹具路径进程、端口只以 ECONNREFUSED 拒」）
5. `tests/support/runtime.ts:24`（`stderr` 已暴露；launcher 打印 `p2sdk: dsh pid N`，`start.ts:916`）

## 边界
1. 只动：`app/sdk/tests/e2e/ssh-product.test.ts`、`app/sdk/tests/unit/start.test.ts`、`app/sdk/tests/support/fake/plugin.mjs`（**只加**一个记录字段，见第 1 步）、`work/tickets/receipts/T9a.md`。
2. **`tests/support/runtime.ts` 的 15s 连接重试经理批准进边界**（还原即 socket hang up，已实测）。它掩盖的「ssh 模式 ready 后 HTTP 短暂不可用」另立提议行（queue 5a⁗），本单不查。
3. 先清残留（不是本单产生的也要清，都是 T9a 链施工的）：`~/bot/scripts/bot-reap 2524794 2547519 2557756 2648601 3459505`；2 秒后 `pgrep -af 'bot-T9a' | grep -v pgrep` → 空，不空再 reap 剩下的 PID。
4. 测试走隔离 HOME / TMPDIR，DBus 指不存在路径；只跑下面列的文件。

## 要做的事
1. **⑧ 可观测**：`plugin.mjs` 的 requests.jsonl 行加一个字段 `toolNames`（模型请求里工具定义的名字数组；字段名照 dsh provider 实际 options——查 `node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js` 怎么读 tools；查不到就停下写回执）。只加字段，不改已有字段，不改游标逻辑。
2. **⑧ 重写断言**：首请求 `toolNames` 含 `bash`（正对照，防空数组恒绿）且不含任何 `/workflow/i` 名。先红：MW（删三禁行）→ ⑧ 红，贴原样。**若 MW 下 `toolNames` 仍无 workflow** → 停下写回执（贴 MW 下的 `toolNames` 原样），不要改断言凑红；那说明 standard preset 本来就不带 workflow，经理再定 ⑧ 改测哪个 preset。
3. **preset 全集**（T9ab 第 2 步原文）：查 `session/create` 能否选 preset（dsh 源码锚点写进回执）。能 → ⑧⑨ 对从 `--patch` 收集到的 `dsh-agent-preset` 全集（⊇ `{standard, cordis, ptc}`）逐个跑；不能 → 回执写「不能选」+ 锚点，⑧⑨ 只测默认 preset，经理接受。
4. **⑪ 按 D11 r4 重写**：
   - 前半（launcher 被强杀，T-13 原设计）：SIGKILL `rt.child` → 断言 dsh pid（从 `rt.stderr` 解析 `p2sdk: dsh pid N`）**仍活**，`/proc/<pid>` 存在。这一条是钉住「launcher 崩了 dsh 不跟着死」这一既有设计，不是缺陷。
   - 后半（dsh 被强杀，D11 真正要证的）：`process.kill(dshPid, 'SIGKILL')` → 轮询 ≤15s 直到该 dsh 名下的 ssh master 与远端 helper 都不在（`/proc` 查 PID，取法照 T4：`server.clientPids()` 基线差）；本格基线 = **建 ⑪ 自己的会话之前**的 `/tmp/dsh-ssh-*` 列表（不是 kill 前），新增 ≤ 1 且 `readdirSync` 为空；dsh 端口 `net.connect` 错误码 `toBe('ECONNREFUSED')`。
   - ⑪ 要自己 `launchRuntime` 一套（不复用 beforeAll 那套，避免基线被前两格污染），格末若仍有存活 PID 就 `process.kill` 兜底并让格失败。
5. **T9a-① 改成层级断言**（r3 原定，未落）：用已装的 yaml 解析器（先查 `package.json`/`node_modules` 里有哪个，没有就用 dsh 依赖里的；都没有停下）解析 runtime patch，断言 guard 行 `config.extraNeverTools` 等于 `['glob','grep']`、`config.roots` 不含 `extraNeverTools`。先红：把 start.ts:297 临时改回 6 格 → 该格红，贴原样，还原。
6. **T9a-② 补逐字对照**：五个全空时 `writeRuntimePatch` 产出 == `git show 03251ea2:app/sdk/src/start.ts` 版本的产出（把改前产出固化为字面量写进测试即可；路径相关的部分用同一 cfg 生成）。
7. **回执 `receipts/T9a.md` 加 §T9ab/T9ac 一节**：每格先红原样、M1′/M2/M3/MW 变异原样、覆盖未覆盖行号（验收 3 实跑输出）、D8 结论按第 2 步实测重写、§4.8 改动面照 `git diff --stat 03251ea2..HEAD` 原样贴。对号表照 LEARNINGS「从 diff 写」。

## 验收
统一前置：
```sh
T=$(mktemp -d /tmp/bot-T9ac-XXXX); mkdir -p $T/tmp $T/home
cd /dev/shm/bot-T9a/app/sdk
E="env HOME=$T/home TMPDIR=$T/tmp DBUS_SESSION_BUS_ADDRESS=unix:path=$T/nonexistent"
V="pnpm --config.verify-deps-before-run=false exec vitest run"
```
1. `$E $V tests/unit/start.test.ts tests/unit/guard.test.ts` 全绿；`$E $V tests/e2e/ssh-product.test.ts` 全绿。
2. 变异（cp 备份还原，各贴原样）：MW → ⑧ 红；M1′ 加回 `- id: ptc-runtime\n  disabled: true` → ⑧ 红；M2 → ⑨ 红；M5 start.ts:297 改回 6 格 → T9a-① 红**且** ⑨ 红；M6 ⑪ 后半删掉 `process.kill(dshPid,…)` 那行 → ⑪ 红。
3. 覆盖：`$E $V tests/unit/start.test.ts tests/unit/guard.test.ts --coverage --coverage.include=src/start.ts --coverage.include=src/policy/guard.mjs` → 回执贴本链改动行的未覆盖行号。
4. 回归：`$E $V tests/e2e/ssh-headless.test.ts tests/e2e/ssh-host.test.ts` → 14 passed；`$E $V tests/unit/start.test.ts tests/e2e/guard-fs.test.ts tests/e2e/write-outside.test.ts tests/e2e/skill-save.test.ts` → 与起点同数。
5. 改动面：`git diff --stat 03251ea2..HEAD -- app/` 只含 T9a 边界 1 + `tests/support/runtime.ts` + `tests/support/fake/plugin.mjs`；`git diff 1395281b..HEAD -- app/sdk/src` → 空（本单不改产品代码；若某格先红逼出产品改动，停下写回执）。
6. 收尾：独立 shell `pgrep -af 'bot-T9a' | grep -v pgrep` → 空；`ls -d /tmp/dsh-ssh-* | sort | comm -13 <施工前列表> -` 只剩 ⑪ 产生的空目录。

## 为什么这样验收
T9a 要保住的是「ssh 模式会话可用，且 PTC / glob / grep 在其中不可用，强杀不留活物」。现在只有 glob/grep 那条真被证明了（M2 咬合）。⑧ 的断言对象装不下工具名，删光 PTC 禁行照样绿；⑪ 的基线取错、杀错了进程，绿的同时机器上挂着 7 套孤儿。MW 和 M6 两个变异就是用来证明这两格以后不会再是空的；`toolNames` 含 `bash` 的正对照防止「记了个空数组」恒绿。
