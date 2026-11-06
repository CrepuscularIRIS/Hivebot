# T9b2：fs-zone-ssh 收口（白名单真格 / moveFile 源 / 每调用 policy / 执行期复判 / start 接线格）

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：T9b 终验不通过（第 1 次），`/tmp/bot-wt/T9b/work/tickets/receipts/T9b.md` §6；DESIGN-ssh-composition §D1
> 分支 / 作业目录：feat/T9b @ /tmp/bot-wt/T9b（同分支续提交，起点 fefd99b3 + 经理 §6）
> claimed：（施工方未填、未挪 doing/——施工 commit 02bad7da，回执 §7）
> accepted：2026-11-06 @ 6556ac85（manager 终验通过，receipts/T9b.md §9）

## 目标
把 T9b D1 半成品补成真闭环：每一刀拆掉保护都有一格红。

## 动手前先读
1. 回执 §6（经理变异 M3/M4/M5 存活原样、③ 空断言、设计偏差两条）
2. `app/sdk/src/policy/fs-zone.mjs:45-73`（applyZoneRecheck）、`:207-224`（checkedTarget 每调用取 policy 的写法）
3. `app/sdk/tests/unit/fs-zone.test.ts:80-100`（tools/execute 复判的测试组合）、`app/sdk/src/policy/resolve.mjs:24`（noteZoneVerdict）

## 边界
1. 只动：`src/policy/fs-zone-ssh.mjs`、`tests/e2e/ssh-fs-zone.test.ts`、`tests/unit/start.test.ts`、回执。
2. 每项先写格看红（或先做变异看红），再改实现。
3. 隔离 HOME/TMPDIR/DBus；e2e 同刻一套。

## 要做的五件
1. **③ 白名单改成全量分类**（替换 :130-132）：
   ```ts
   const READS = ['constructor', 'sandboxMode', 'resolve', 'processPath', 'fileUrl', 'contains', 'stat', 'lstat',
     'readText', 'streamText', 'readBytes', 'readByteRange', 'listDir', 'call']
   const upstream = Object.getOwnPropertyNames(SshFileSystem.prototype)
   const unknown = upstream.filter((m) => !READS.includes(m) && !WRITES.includes(m))
   expect(unknown, `上游新增方法未分类（写入口须进 WRITES 并在本类覆盖）：${unknown}`).toEqual([])
   const uncovered = WRITES.filter((m) => !Object.getOwnPropertyNames(proto).includes(m))
   expect(uncovered, `写入口未被覆盖：${uncovered}`).toEqual([])
   ```
   证伪：从 READS 删 `'listDir'` → 本格红（贴原样后还原）。
2. **moveFile 源区外格**（加进 ②）：用 `node:fs` 在远端 `/tmp/t9b-src-<rand>`（夹具远端=本机）先写一个文件，`moveFile(源=该文件, 目标=ws 内)` → rejects `OUT_MARK`；断言源文件仍在、ws 目标不存在。经理 M3（删 `zoneGuardSsh(fs_, guard)`）下本格必须红。
3. **可写根改每调用取 policy**（DESIGN D1「`policy.workspaceRoot`」，与本机孪生同写法）：每个入口 `const policy = sandboxPolicy ?? this.ctx.sandboxPolicy.resolve()`，可写根 = `this.resolve(policy.workspaceRoot)` 的 targetKey（可按原串 Map 缓存，写 `ponytail:`）。删掉实例级「首写永久缓存」与 `config.additionalWritableRoots`（start 从不传，YAGNI；本机孪生同样不用追加根）。格：组合级 ws = `server.workspace`，**每调用**传 `{ mode: 'workspace-write', workspaceRoot: <ws>/a }` 写 `<ws>/b/x` → rejects `OUT_MARK`（`expected` 参数照 `@deepseek-ai/dsh-fs-ssh` schema 给合法值，不要传 undefined）。变异：改回取 `this.ctx.sandboxPolicy.resolve()` → 本格红。
4. **构造器挂 `applyZoneRecheck(this.ctx, this.p2sdkNeverRoots)`**（DESIGN D1 第三点）。格：在 composeZoned 的 ctx 上造一个带 `noteZoneVerdict(exec, { kind: 'workspace-read', allInside: true })` 的 `read` 调用，目标 `<remoteHome>/.ssh/x`，走 tools/execute（照 fs-zone.test.ts:80-100 的派发法，或 cordis 真 ctx 的等价入口）→ 结果 `isError` 且消息含 `never-root denied`。变异：删构造器这一行 → 本格红。
5. **start 接线格**（工单 T9b 验收 6 欠账，`tests/unit/start.test.ts`）：
   - 六变量齐（含 `P2SDK_SSH_REMOTE_HOME=/r/home`）→ yaml 含 `p2sdk-fs-zone-ssh` 行且 `neverRoots` 下有 `- /r/home/.ssh`；
   - 正则断言原版行被禁：`/- id: fs-ssh\n\s+name: .+\n\s+disabled: true\n/`；
   - `childEnv` 输入 env 带 `P2SDK_SSH_REMOTE_HOME` → 输出不含该键。
   经理 M4（sshKeys 删 REMOTE_HOME）与 M5（fs-ssh 行删 `disabled: true`）下各至少一格红。
6. 顺手：①b′ 注释改实（夹具 remoteHome 在 TMPDIR=/tmp 下，原版围栏放行——这格其实也是先红格，不是回归格）。

## 验收（写命令，不写感觉）
1. `pnpm --config.verify-deps-before-run=false exec vitest run tests/e2e/ssh-fs-zone.test.ts` → 全绿（格数照实写）。
2. `… vitest run tests/unit/start.test.ts tests/unit/containment.test.ts tests/unit/guard.test.ts tests/unit/fs-zone-write-entries.test.ts` → 全绿。
3. 变异五刀各贴红的原样输出 + 还原后 `git status --short` 干净：③ 删 READS 的 listDir / M3 / 每调用 policy 改回全局 / 删 applyZoneRecheck / M4+M5。
4. 回归：`tests/e2e/ssh-product.test.ts` 3 passed，跑后 `pgrep -af bot-wt/T9b` 无输出；`tests/e2e/guard-plugin-manager.test.ts` 7 passed。
5. `git diff --stat fefd99b3..HEAD` 只含边界 1 文件（加经理 §6 那一个回执改动）。
6. 回执写 `receipts/T9b.md` §7，对号表从 diff 写（LEARNINGS 2026-11-06 第一条）。

## 为什么这样验收
T9b 的五处保护里有三处拆掉照绿（moveFile 源、start 删除表、原版 fs-ssh 禁用），白名单格只在已知名字里找新名字——这些格保护不了任何东西。每调用 policy 是 T11 一 bot 一 ws 的前提，现在不改，T11 会把跨 bot 写藏进缓存里。

## 产出
- 修改：src/policy/fs-zone-ssh.mjs、tests/e2e/ssh-fs-zone.test.ts、tests/unit/start.test.ts
- 回执：receipts/T9b.md §7
