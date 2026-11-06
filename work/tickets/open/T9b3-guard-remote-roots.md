# T9b3：guard 远端根 + remoteHome 校验接进产品 + ssh-product ②

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：T9b 终验不通过（第 1 次）receipts/T9b.md §6；DESIGN-ssh-composition §D2（结论 + 验证 ②）；queue 5a′ 行「guard 远端根 + `ssh-product.test.ts` ②」
> 分支 / 作业目录：feat/T9b @ /tmp/bot-wt/T9b（**T9b2 提交后**同分支接着做，两单都动 start.ts）
> claimed：
> accepted：

## 目标
D2 剩下的一半：远端凭证根归 guard 管（读也拒），remoteHome 配错真的启动失败。

## 现状（经理核实）
- `guard.mjs` 有 remoteHome 校验，但 `start.ts` guardRow（:289-304）从不写 `remoteHome` → 产品里是死代码。
- guard roots 不含 `remoteRoots(remoteHome).hardRoots`，也没有 remoteHome 软遮蔽 → 远端 `~/.ssh` 的 **read** 无人拒（fs-zone-ssh 只管写）。
- 校验是 `void ssh.ready.then(...)` fire-and-forget；会不会让运行时启动失败没人证过。
- 比对是 `actual.targetKey !== config.remoteHome` 原串比较（DESIGN 写「规范化后比对」）。

## 边界
1. 只动：`src/start.ts`（guardRow / fs-zone-ssh 行）、`src/policy/guard.mjs`（必要时）、`tests/unit/start.test.ts`、`tests/unit/guard.test.ts`、`tests/e2e/ssh-product.test.ts`、回执。`never-roots.mjs` 已有 `remoteRoots`，不改签名。
2. 先红：②b、②d 照 DESIGN §D2 验证节先跑红再实现。
3. 隔离 HOME/TMPDIR/DBus；e2e 同刻一套；ssh-product 跑后查残留。

## 要做的
1. ssh 模式且给了 remoteHome：guardRow 写 `remoteHome:`；`hardRoots` = 宿主 hardRoots ∪ `remoteRoots(remoteHome).hardRoots`；remoteHome 进软遮蔽（guard 的 `homes` 语义：整棵遮蔽、例外 = 会话 cwd 子树，guard.mjs:13-15）。
2. fs-zone-ssh 行 `neverRoots` 与 guard hardRoots 同一份（「一个清单多个消费者」，本机 fsSandboxRow 同取 guardRoots.hardRoots）——不再只放远端项。
3. 校验 fail loud：比对前两边去尾 `/`；②d 证明配错时运行时**起不来或会话建不出**且 stderr/日志含 `does not match the remote home`。若 fire-and-forget 的拒绝态不能让运行时失败，改成能失败的形态（写明用了哪种、为什么），不要只靠 unhandledRejection 日志。
4. `ssh-product.test.ts` 加：
   - ②b 夹具 `remoteHome/.ssh/id_sentinel`（ssh-host.ts:86 一带）→ `read` 被拒、正文不出现。先红 = 不加远端根时读到正文（贴原样）。
   - ②d remoteHome 故意给夹具 ws 路径 → 启动失败，含固定串。先红 = 不接 remoteHome 进 guardRow 时照常启动（贴原样）。
5. start 单测：给 REMOTE_HOME → guardRow 含 `remoteHome:` 与 `<remoteHome>/.ssh`；不给 → 两者都不出现。

## 验收（写命令，不写感觉）
1. 先红两段原样（②b 读到正文、②d 照常启动）。
2. `… vitest run tests/e2e/ssh-product.test.ts` → 全绿（格数照实写），跑后 `pgrep -af bot-wt/T9b` 无输出。
3. `… vitest run tests/unit/start.test.ts tests/unit/guard.test.ts tests/e2e/ssh-fs-zone.test.ts` → 全绿。
4. 变异：去掉 guardRow 的远端 hardRoots → ②b 红；去掉 guardRow 的 `remoteHome:` → ②d 红（贴原样，cp 还原）。
5. 回归：`tests/e2e/guard-plugin-manager.test.ts` 7、`tests/e2e/ssh-headless.test.ts`、`tests/unit/fs-zone-write-entries.test.ts` 3 全绿。
6. `git diff --stat <T9b2 终点>..HEAD` 只含边界 1。回执 §8。

## 为什么这样验收
远端 `~/.ssh` 是用户真钥匙（D2 原版意图：bot 看不到用户凭证）。只拦写不拦读等于没拦；配错 remoteHome 若只在日志里吐一行，就是「配错静默失守」——D2 要的是起不来。

## 产出
- 修改：src/start.ts、（必要时）src/policy/guard.mjs、tests/unit/{start,guard}.test.ts、tests/e2e/ssh-product.test.ts
- 回执：receipts/T9b.md §8
