# T2b：T2 测试有效性返修——让六格每一格在「被测性质不成立」时会红

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：T2 验收不通过（review/T1-T3-test-validity.md + T1-T3-security.md 末尾「经理核实」节）。T2 留 doing/，T2b 与 T2c 都验收后一起挪 done。
> 分支 / 作业目录：feat/T2 @ /dev/shm/bot-T2（在 63f3f70 上继续提交）
> 顺序：先做 T2b，再做 T2c（两单都改 `ssh-host.ts`，不并行）
> claimed：
> accepted：

## 目标
`tests/e2e/ssh-host.test.ts` 现在六格全绿，但其中四处在被测性质不成立时**照样绿**（端口没关、fs 走本机、helper 残留、权限被改）。本单把这几格改成「性质不成立就红」，并各带一个自检，证明断言本身不是空的。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md、本单来源两份 review 文末「经理核实」
2. `repos/deepseek-harness/packages/ssh/ssh/src/index.ts:288-320`：helper 命令行只有 `node <helper>`，workspace 走 RPC hello（不在 argv）；`:308` 断连报 `SSH helper disconnected; remote outcomes and cleanup are unknown`；`:316` digest 在 hello 回包后才校验
3. 审查探针参考：`work/tickets/evidence/T2b/probes/rv-local-fs.test.ts`（审查席把 SshFileSystem 换成 dsh-fs-local 后原六格仍全绿）

## 边界
1. 只动：`app/sdk/tests/e2e/ssh-host.test.ts`；`app/sdk/tests/support/ssh-host.ts` 只允许为本单加**最小**观测点（如 `bin/ssh` 包装把自己 PID 追加到夹具目录下的 `ssh-client.pids`、把 sshd child pid 暴露在返回值上）。夹具的生命周期 / 安全改动属于 T2c，本单不做。
2. 先写失败测试：先加下面的自检格（端口自检、快照自检）和 ③b，在**未改断言**时跑一次，贴原样输出（自检格应红，证明旧断言是空的），再改断言。
3. 测试走隔离 HOME / TMPDIR（`/tmp/bot-T2b-*`），DBus 指不存在路径；只跑本文件。变异副本放 `tests/e2e/.mut-T2b/`，跑完 `rm -r`，不得提交。
4. 杀进程只杀测试自己拿到的 PID（child handle 或包装脚本登记的 PID），不按名字/模式杀；清理残留用 `~/bot/scripts/bot-reap <PID>`。

## 要改的五处
1. **⑥ 端口断言**：抽成 `expectPortRefused(port)`，**只接受** `err.code === 'ECONNREFUSED'`；连上、超时、其他错误都必须失败。另加**自检格**：对一个在测试里 `net.createServer().listen(0,'127.0.0.1')` 的活端口调用它 → 必须 reject。
2. **③b fs 必须经 ssh**：新增一格，用**独立的第二个** `startSshHost()` 实例（不影响共享 host）：先 `ctx.fs.writeText` / `readText` 成功；再杀掉该实例的 ssh master（`bin/ssh` 包装登记的 PID，SIGKILL）；之后同一路径 `ctx.fs.readText` 必须 reject，且错误信息匹配 `/SSH helper disconnected|SSH .*(closed|disconnect)/`，**不得**是 `TypeError`（防止靠插件已卸载蒙混）。若 dsh-ssh 实际会自动重连导致读成功，停下，把现象写进回执存疑项，不要换证明方式。
3. **⑥ 残留扫描要能看见 helper 和 master**：抽成 `scanLeaks(host)`，命中条件 = `/proc/<pid>/environ` 含 `PBOTS_SSH_MARK=<本轮 mark>`（helper 与远端 shell 继承它，T2 回执存疑 2 已实证）**或** `/proc/<pid>/cmdline` 含 `host.dir`（sshd 监听进程与 ssh master）。⑥ 改为：**stop 前**扫描结果必须同时含至少 1 个 mark 命中（helper）和至少 1 个 cmdline 命中（master 或 sshd）——这是正对照；**stop 后**结果为空。读不到的 /proc 项当不存在。
4. **② 快照加强 + 收窄口径**：快照字段改为 `相对路径|mode|size|mtimeMs|ctimeMs|ino`，并递归子目录（只 `lstat`/`readdir`，**不读内容**）。加**自检格**：对 `tmkdir` 建的假目录（含一个子目录里的文件）做快照 → `chmod 600→644` 或改子目录里的文件后快照必须不等。测试名与注释收窄为「真实 ~/.ssh 元数据未变」，不要写「一字未动 / 未被读取」。
5. **⑤ 注释**：`ssh-host.test.ts:111` 改为「ssh 已认证连接、helper 已启动并回 hello；digest 在 ready 放行前校验」，删掉「连接建立前」。

## 验收（写命令，不写感觉）
统一前置：
```sh
T=$(mktemp -d /tmp/bot-T2b-XXXX); mkdir -p $T/tmp $T/home
ls -d /tmp/dsh-ssh-* 2>/dev/null | sort > $T/dsh-ssh.before
ENV="HOME=$T/home TMPDIR=$T/tmp DBUS_SESSION_BUS_ADDRESS=unix:path=$T/nonexistent"
cd /dev/shm/bot-T2/app/sdk
```
1. `env $ENV pnpm --config.verify-deps-before-run=false exec vitest run tests/e2e/ssh-host.test.ts` → 全部 passed（6 原格 + ③b + 两个自检格，共 ≥9），exit 0。
2. 先红证据：回执贴「自检格在旧断言下红」的原样输出（端口自检、快照自检各一条）。
3. 三个变异各红指定格（副本在 `tests/e2e/.mut-T2b/`，每个变异只改一处，回执贴 sed/diff 与 vitest 输出）：
   - **M1 fs 换本机**：夹具副本里 `SshFileSystem` 换成 `dsh-fs-local`（做法同 `evidence/T2b/probes/rv-local-fs.test.ts` 对应的 ssh-host-local.ts）→ **③b 红**。
   - **M2 stop 不杀 sshd**：夹具副本 `stop()` 里跳过 sshd kill 分支 → **⑥ 红**（端口或扫描任一断言失败）；跑完用 `bot-reap` 清掉该 sshd，回执贴 PID。
   - **M3 stop 不 dispose fibers**：夹具副本 `stop()` 跳过 `disposeFibers()` → **⑥ 红**，且失败信息里是 mark 命中（helper 残留被看见）；跑完 `bot-reap` 清掉残留 PID。
4. `ls -d /tmp/dsh-ssh-* 2>/dev/null | sort | comm -13 $T/dsh-ssh.before -` → 空；`pgrep -af "$T" | grep -v pgrep` → 空；`ls tests/e2e/.mut-T2b 2>&1` → 不存在。
5. 改动面：`git diff --stat 63f3f70..HEAD` 只含 `tests/e2e/ssh-host.test.ts`，以及（若加了观测点）`tests/support/ssh-host.ts`。

## 为什么这样验收
T2 的问题不是测试红了，而是「性质被破坏时测试仍然绿」。所以这里不看通过数，看**反过来能不能红**：自检格证明断言函数本身会失败；三个变异分别模拟「fs 其实走本机」「sshd 没关」「helper 没清」，每一个都必须让对应格红。③b 用「断开传输后 fs 报传输错」证明 fs 依赖 ssh 通道——同机同文件系统下，读写一致证明不了路由。

## 产出
- 修改：`app/sdk/tests/e2e/ssh-host.test.ts`（必要时 `app/sdk/tests/support/ssh-host.ts` 最小观测点）
- 回执：`work/tickets/receipts/T2b.md`
