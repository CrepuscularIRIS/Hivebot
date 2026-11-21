# 回执 T2c：T2 夹具侧返修

> 施工：main (GLM 5.3) | 完成时间：2026-11-06 03:12（实测）
> 分支 / 提交：feat/T2 @ 18dd541（在 T2b dd63eed 上继续，worktree /dev/shm/bot-T2）
> 工单：留在 work/tickets/doing/（T2+T2b+T2c 都验收后一起挪 done）

## 1. 做了什么（工单四处）

1. **HOME/cwd**：`SetEnv` 并成一行 `PBOTS_SSH_MARK=<mark> HOME=<remoteHome> PBOTS_REMOTE_HOME=<remoteHome>`（sshd 只认第一条 SetEnv，经理 `sshd -T` 实测）；`force-command.sh` 加 `cd '<remoteHome>' || exit 97`。新格 ①b：`ssh pbots-ssh-test 'printf "%s;%s" "$HOME" "$PWD"'` → `<remoteHome>;<remoteHome>`。
2. **setup 失败回滚**：sshd 起来之后全部步骤（写 wrapper/ssh_config、改 PATH、解析 helper、组合、ready）包进一个 `try`，`catch` 先 `stop()`（还原 PATH+收 sshd）再抛。
3. **内核级兜底**：sshd 经 `setpriv --pdeathsig TERM /usr/sbin/sshd …`；`bin/ssh` 包装 `exec setpriv --pdeathsig TERM /usr/bin/ssh -F … "$@"`。未加任何信号钩子（工单边界 4）。
4. **附加**：ready 后把本轮新建的 `/tmp/dsh-ssh-*` 目录收进 H1 登记簿（`trackTmpDir`），exit 路径可清。
另：新证据脚本 `work/tickets/evidence/T2c/interrupt-driver.mjs`（起夹具→写 state→exit/挂起）与 `run-interrupt.mjs`（spawn 驱动→按模式中断→10s 轮询断言）。

## 2. 先红后绿

- ①b 初版 RED 用了带 `|` 的 printf，远端 shell 把 `|` 当管道——**假红，作废**。重取：checkout 回 T2b 版夹具跑修正后的 ①b：
```text
× ①b 远端会话 HOME 与 cwd 都收在夹具 remote-home（不落真实家目录） 212ms
AssertionError: expected '/tmp/bot-T2c-Gdax/tmp/bot-T2-ssh-N1De…' to be '/tmp/bot-T2c-Gdax/tmp/bot-T2-ssh-N1De…'
（前缀相同、PWD 半边不同：真实家目录 vs remote-home）
```
- T2c 夹具版 GREEN：`Tests 10 passed (10)`。

## 3. 验收证据

### 3.1 验收 1（全绿）
```text
env … vitest run tests/e2e/ssh-host.test.ts
 Test Files  1 passed (1)
      Tests  10 passed (10)      ← T2b 的 9 格 + ①b
exit=0；TMPDIR 残留 0
```

### 3.2 验收 2（strace 0 次真实启动文件）
```text
SHELL uid=1000 home=/tmp/bot-T2c-IIZu/tmp/bot-T2-ssh-OvPF3E/remote-home cwd=…/remote-home
真实家目录启动文件打开计数（.bashrc/.profile/.bash_profile/.bash_login/.ssh，排除 ENOENT）：0
```

### 3.3 验收 3（setup 失败回滚）
```text
PATH_RESTORED true
CHILDREN_ALIVE []      ← 无 REAP 行（改前基线：PATH_RESTORED false + sshd 存活被外部 reap）
```

### 3.4 验收 4（三种中断；`node run-interrupt.mjs <mode>`）
```text
mode=exit  clean=YES at 0.1s  dsh-ssh-new=0  dir=absent(应absent)   exit_code=0
mode=term  clean=YES at 0.1s  dsh-ssh-new=1  dir=present(允许)      exit_code=2*
mode=kill  clean=YES at 0.1s  dsh-ssh-new=1  dir=present(允许)      exit_code=2*
```
*clean = 端口拒连 + 无 `PBOTS_SSH_MARK` 进程 + 无夹具目录进程，全部在 runner 死后 0.1s 内达成（改前基线：SIGTERM 后监听器仍开）。exit_code=2 仅由 dsh-ssh-new=1 触发，见 §5-1。

### 3.5 验收 5（无遗留）
`pgrep -af bot-T2c | grep -v pgrep` → 无输出。施工窗口产生的全部 `/tmp/dsh-ssh-*`（含三模式中断各 1 + 当晚调试期 12 个）已按字面路径清零（`ls -d /tmp/dsh-ssh-*` → 0）。

### 3.6 验收 6（改动面）
```text
git diff --stat dd63eed..HEAD：
 app/sdk/tests/e2e/ssh-host.test.ts | （+①b 一格）
 app/sdk/tests/support/ssh-host.ts  | （四处返修）
 2 files changed, +74/−54；驱动脚本在 work/tickets/evidence/T2c/（不进 app/）
```

## 4. 施工过程记录（如实）

- 一次字符串手术事故：用 substring 切片重组函数尾部时 `'  try {'` 匹配进缩进咬错位置，产生双层 try——改整个文件重写干净版解决。
- 一次 TDZ 笔误（filter 参数 n 写成 name）、一次漏 import readdirSync——均即时修复，无残留。

## 5. 风险与存疑

1. **SIGTERM/SIGKILL 模式各留 1 个空 `/tmp/dsh-ssh-*` socket 目录**：dsh-ssh 模块的清理只挂在连接 dispose 上，宿主进程被硬杀时无任何用户态路径可跑（工单同时禁止信号钩子）。安全属性（端口/进程）不受影响；目录为 0700 空 socket 壳。已在夹具侧做到：exit 模式残留 0（登记簿）。硬杀残留属 dsh-ssh 模块级限制（PLAN §3-4 类），请经理裁决口径（接受 / 立小任务在下次全量前做陈年空目录清扫）。
2. `setpriv --pdeathsig` 绑定 spawn 所在线程：vitest forks 池在主线程 spawn，无影响（工单已注）；若未来换 threads 池，worker 线程结束时也会被收，语义可接受。
3. pdeathsig 需 util-linux 的 setpriv（本机有）；若换机器跑此测试需确认存在（可加检测，未加——YAGNI）。

## 附记（修复复核轮，2026-11-06 03:14）

- §1 附加项的 dsh-ssh 目录登记有并发误删（复核席 CONFIRMED/高：全局 /tmp 差集会把并发实例的目录收进本进程 sweeper）。已改为归属式：只登记本夹具 ssh 客户端 PID 命令行 `-S` 套接字路径指向的目录（@01b4dc6）；ownership.mjs 复验外部哨兵幸存（REGISTERED_FOREIGN_DIR false / SENTINEL_AFTER_SWEEP true）。
