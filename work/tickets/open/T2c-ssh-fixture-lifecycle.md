# T2c：T2 夹具侧返修——不读真实 .bashrc、setup 失败回滚、进程被中断也不留 sshd

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：T2 验收不通过（review/T1-T3-security.md 发现 1/2、审点④异常路径；经理核实新增：第二条 SetEnv 无效）。**T2c 是 T2b 拆出的另一半，不是 T2 的第二次失败。**
> 分支 / 作业目录：feat/T2 @ /dev/shm/bot-T2（在 T2b 的提交上继续）
> 依赖：**T2b 先提交**（两单都改 `ssh-host.ts`，不并行）
> claimed：
> accepted：

## 目标
夹具 `tests/support/ssh-host.ts` 三个缺口：① 远端 shell 在包装脚本改写 HOME 之前，已经用真实 HOME 读了 `~/.bashrc`，且命令 cwd 是真实家目录；② 起 sshd 之后、`try` 之前的任何异常会留下活 sshd 并且不还原 PATH；③ 测试进程被 `process.exit` / SIGTERM / SIGKILL 打断时，sshd 继续监听、有效密钥留在盘上。本单把三处补上。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md、review/T1-T3-security.md 末尾「经理核实」
2. `ssh-host.ts:84-139`（包装脚本、sshd_config、spawn）、`:158-215`（PATH、组合、stop、try）
3. `repos/deepseek-harness/packages/ssh/ssh/src/index.ts:299-302`：ssh master 是 node 的**直接子进程**（`-M`、`ControlPersist=no`），所以对它设 pdeathsig 有效
4. 事实：sshd_config 里 `SetEnv` **只认第一行**（经理用 `sshd -T` 实测：两行 `SetEnv A=1` / `SetEnv B=2` 只输出 `setenv A=1`）。现在 `:114` 的 `PBOTS_REMOTE_HOME` 从未生效
5. 探针（审查席原件，已拷入仓）：`work/tickets/evidence/T2b/probes/bot-rvS-security.mjs`（`normal` / `setup-failure` / `exit-without-stop` 三种模式）、`bot-rvS-signal.{mjs,py}`

## 边界
1. 只动：`app/sdk/tests/support/ssh-host.ts`；为新增断言可改 `app/sdk/tests/e2e/ssh-host.test.ts`。中断验收用的驱动脚本放 `work/tickets/evidence/T2c/`（证据，不进 `app/`）。
2. 先写失败测试：先在 `ssh-host.test.ts` 加「远端 HOME 与 cwd」格（见改动 1），在未改夹具时跑红，贴原样输出。
3. 测试走隔离 HOME / TMPDIR（`/tmp/bot-T2c-*`），DBus 指不存在路径；只跑本文件。
4. 杀进程只用自己拿到的 PID；中断验收后的残留一律 `~/bot/scripts/bot-reap <PID>`，回执贴 PID。不读真实 `.bashrc` 等文件内容。

## 要改的四处
1. **HOME 与 cwd**：sshd_config 只留**一条** `SetEnv`，同一行带 `PBOTS_SSH_MARK=<mark> HOME=<remoteHome> PBOTS_REMOTE_HOME=<remoteHome>`；`force-command.sh` 在 `exec` 前加 `cd '<remoteHome>' || exit 97`。新格：经 PATH 包装 `ssh pbots-ssh-test 'printf "%s|%s" "$HOME" "$PWD"'` → stdout 等于 `<remoteHome>|<remoteHome>`。
2. **setup 失败回滚**：sshd spawn 之后的**全部**步骤（写 ssh_config、改 PATH、解析 helper、组合、ready）都在同一个 `try` 里，`catch` 走 `stop()`（还原 PATH + 收 sshd）后再抛。
3. **中断兜底（内核级）**：`/usr/sbin/sshd` 改为经 `setpriv --pdeathsig TERM /usr/sbin/sshd -D -e -f <cfg>` 启动；`bin/ssh` 包装改为 `exec setpriv --pdeathsig TERM /usr/bin/ssh -F <cfg> "$@"`。测试进程以任何方式死掉，sshd 监听与 ssh master 都会收到 SIGTERM；master 断开后远端会话与 helper 随之结束。注：pdeathsig 绑定到 spawn 所在线程；vitest 默认 forks 池在主线程 spawn，无影响——若改成 threads 池，sshd 会在 worker 线程结束时被收，也可接受。
4. 正常退出路径不变（`stop()` 仍先 dispose fibers 再 SIGTERM sshd 并等退出）。不加 `process.on('SIGTERM')` 之类信号钩子——setpriv 已覆盖，目录残留由下面验收界定。

## 验收（写命令，不写感觉）
统一前置：
```sh
T=$(mktemp -d /tmp/bot-T2c-XXXX); mkdir -p $T/tmp $T/home
ls -d /tmp/dsh-ssh-* 2>/dev/null | sort > $T/dsh-ssh.before
ENV="HOME=$T/home TMPDIR=$T/tmp DBUS_SESSION_BUS_ADDRESS=unix:path=$T/nonexistent"
RH=$(getent passwd $USER | cut -d: -f6)
cd /dev/shm/bot-T2/app/sdk
```
1. `env $ENV pnpm --config.verify-deps-before-run=false exec vitest run tests/e2e/ssh-host.test.ts` → 全部 passed（T2b 的格子 + 本单 HOME/cwd 格），exit 0。
2. **不读真实启动文件**（改前基线：经理实测 2 次打开真实 `.bashrc`）：
   `cd /tmp && env $ENV strace -f -qq -e trace=openat -o $T/trace pnpm --dir /dev/shm/bot-T2/app/sdk --config.verify-deps-before-run=false exec node /home/lingxufeng/bot/work/tickets/evidence/T2b/probes/bot-rvS-security.mjs normal | grep SHELL; grep -E "\"$RH/(\.bashrc|\.profile|\.bash_profile|\.bash_login|\.ssh)" $T/trace | grep -vc ENOENT`
   → `SHELL` 行 `home=` 与 `cwd=` 都是夹具的 remote-home；计数 **0**。
3. **setup 失败回滚**：`cd /tmp && env $ENV pnpm --dir /dev/shm/bot-T2/app/sdk --config.verify-deps-before-run=false exec node /home/lingxufeng/bot/work/tickets/evidence/T2b/probes/bot-rvS-security.mjs setup-failure` → `PATH_RESTORED true`、`CHILDREN_ALIVE []`，且没有 `REAP` 行（改前基线：`PATH_RESTORED false`、sshd 存活被 reap）。
4. **三种中断**：写 `work/tickets/evidence/T2c/interrupt-driver.mjs`（照 `bot-rvS-signal.mjs`：起夹具后把 `{runner: process.pid, dir, port, mark}` 写进 `$HOME/state.json`；参数 `exit` 时直接 `process.exit(17)`，否则挂起等信号）。三种模式各跑一次：`exit`；挂起后 `kill -TERM <runner>`；挂起后 `kill -KILL <runner>`。每次在 runner 死后 **10 秒内**检查：
   - 端口：`bash -c "exec 3<>/dev/tcp/127.0.0.1/<port>"` 失败（连接被拒）；
   - 进程：`grep -l "PBOTS_SSH_MARK=<mark>" /proc/[0-9]*/environ 2>/dev/null` 为空，且 `grep -l "<dir>" /proc/[0-9]*/cmdline 2>/dev/null` 为空；
   - `/tmp/dsh-ssh-*` 相对 `$T/dsh-ssh.before` 无新增；
   - 目录：`exit` 模式下 `<dir>` 不存在；SIGTERM / SIGKILL 模式允许 `<dir>` 残留（只能在 `$T/tmp` 下），回执写明。
   回执贴三次的原样输出。改前基线（审查席实测）：SIGTERM 后 `LISTENER_OPEN_AFTER_SIGTERM True`。
5. `pgrep -af "$T" | grep -v pgrep` → 空。
6. 改动面：`git diff --stat <T2b 提交>..HEAD` 只含 `tests/support/ssh-host.ts`、`tests/e2e/ssh-host.test.ts`（中断驱动脚本在 `work/` 下）。

## 为什么这样验收
这个夹具起的是一台**用你的账户、凭钥匙就能登录的 sshd**。要保住的是：它不碰你的真实家目录（启动文件、cwd、`~/.ssh`），以及**无论测试怎么死**，这台 sshd 都不会继续监听。所以第 2 条用 strace 直接数真实文件的打开次数，第 4 条分别模拟正常退出、被终止、被强杀三种死法，看端口和进程，而不是看 `stop()` 有没有被调到。

## 产出
- 修改：`app/sdk/tests/support/ssh-host.ts`、`app/sdk/tests/e2e/ssh-host.test.ts`
- 新建：`work/tickets/evidence/T2c/interrupt-driver.mjs`
- 回执：`work/tickets/receipts/T2c.md`
