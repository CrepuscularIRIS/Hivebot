# T2：L8-a 私有 sshd 测试夹具 + dsh ssh 族连接级验收

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：work/p9-dsh-integration/BRIEF.md 目标 3、L8；PLAN.md §1 L8 行、§3（必读）
> 分支 / 作业目录：feat/T2 @ **/dev/shm/bot-T2**（不要放 /tmp/bot-wt：helper.js 会落进 bwrap 私有 /tmp，PLAN §3 第 5 条）
> claimed：
> accepted：

## 目标
在完全隔离的本机环境里，用官方 `@deepseek-ai/dsh-ssh` 族（ssh / fs-ssh / subprocess-ssh / sandbox-ssh）连上一个**测试专用**的 sshd，证明文件与进程确实经 ssh 在「远端」执行，且全程不碰真实 `~/.ssh`、不留进程和目录。这是 T4（真组合）和以后换真实远程主机的地基。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md、work/p9-dsh-integration/PLAN.md §3（八条事实，尤其 1–5）
2. `repos/deepseek-harness/packages/ssh/ssh/README.md`（Config 字段、Deployment prerequisites）
3. `repos/deepseek-harness/packages/ssh/ssh/tests/live.e2e.ts:27-48`（上游的手搭组合 `setup()`，照这个结构搭；repos/ 只读，要抄就抄进本仓并在文件头写 `来源: https://github.com/deepseek-ai/deepseek-harness@ce7073d512:packages/ssh/ssh/tests/live.e2e.ts`）
4. `app/sdk/tests/support/tmp-sweep.ts`（建目录一律走它）

## 边界
1. 只动：`app/sdk/package.json` + `app/sdk/pnpm-lock.yaml`（加依赖）、新建 `app/sdk/tests/support/ssh-host.ts`（夹具）、新建 `app/sdk/tests/e2e/ssh-host.test.ts`。**`src/**`、`profile/**` 不碰**——本单不接产品。
2. 依赖：`dependencies` 加 `@deepseek-ai/dsh-ssh`、`-fs-ssh`、`-subprocess-ssh`、`-sandbox-ssh`，全部精确钉 `0.2.2-alpha.2`（peer 精确等于现钉版，已用 `npm view` 核过）。测试直接 import 的其余包（`@deepseek-ai/cordis`、`dsh-sandbox-policy`、`dsh-session-projection` 等）若 pnpm 严格布局下解析不到，加进 `devDependencies` 同样精确钉版。不加别的包。
3. 夹具 `ssh-host.ts` 必须做到：
   - 所有文件放在 `tmkdir('bot-T2-ssh-')` 下，**且** 测试 TMPDIR 本身在 `/tmp/bot-T2-*` 下（sshd 会 chdir 到 `/`，bot-reap 只能靠命令行里的路径认出它）。
   - `ssh-keygen` 现场生成 host key 与 client key；`authorized_keys`、`known_hosts`（`[127.0.0.1]:<port> <hostkey>`）、`ssh_config`（Host 别名 `pbots-ssh-test`，`IdentitiesOnly yes`、`UserKnownHostsFile` 指本目录、`GlobalKnownHostsFile /dev/null`）都在本目录。
   - 私有 `sshd_config`：`ListenAddress 127.0.0.1`、随机空闲高端口、`UsePAM no`、`StrictModes no`、`PermitUserRC no`、`PasswordAuthentication no`、`KbdInteractiveAuthentication no`、`AllowStreamLocalForwarding yes`、`AllowTcpForwarding no`、`X11Forwarding no`、`PidFile` 本目录、`SetEnv` 传入远端 HOME 路径与一个**每次运行随机**的 `PBOTS_SSH_MARK`、`ForceCommand` 指向本目录的包装脚本（改写 `HOME`/`TMPDIR` 为本目录下的 remote-home、`DBUS_SESSION_BUS_ADDRESS` 指不存在路径，然后 `exec /bin/sh -c "$SSH_ORIGINAL_COMMAND"`）。`/usr/sbin/sshd -D -e -f <cfg>` 作为测试进程的子进程启动，拿 child handle。经理已实测这套配置在本机可登录（PLAN §3 第 2 条）。
   - PATH 最前放本目录 `bin/ssh`：`exec /usr/bin/ssh -F <本目录>/ssh_config "$@"`（OpenSSH 不看 `$HOME`，PLAN §3 第 1 条）。dsh-ssh 用 `execFile('ssh')` 走 PATH，所以测试进程自己的 `process.env.PATH` 要在建 `SshConnection` 前设好，结束时还原。
   - `stop()`：先 dispose 所有 dsh fiber，再 SIGTERM 自己的 sshd child 并等退出（只杀自己 spawn 的 child handle，不按名字/模式杀）。
4. SshConnection 配置：`host: 'pbots-ssh-test'`、`launch: { kind: 'node-script', node: process.execPath }`（pnpm 的 Node 24；系统 node 是 22）、`helper` = `@deepseek-ai/dsh-ssh/helper` 解析后的 **realpath**、`helperHash` = 该文件 sha256、`workspace` = 夹具目录下 `ws`（预先建好）。
5. 凭证：测试生成的私钥只在夹具目录，不打印、不写进回执和日志；回执里贴输出前确认不含 key 内容。
6. 先写失败测试：先建 `tests/e2e/ssh-host.test.ts` 全部格子，夹具未实现时跑一次看它红（贴原样输出），再实现。
7. 测试走隔离 HOME / TMPDIR，DBus 指向不存在路径；只跑本文件，不跑全量 e2e。
8. 本单分支提交；经理验收后再合并。

## 验收（写命令，不写感觉）
统一前置：
```sh
T=$(mktemp -d /tmp/bot-T2-XXXX); mkdir -p $T/tmp $T/home
ls -d /tmp/dsh-ssh-* 2>/dev/null | sort > $T/dsh-ssh.before
cd /dev/shm/bot-T2/app/sdk
env HOME=$T/home TMPDIR=$T/tmp DBUS_SESSION_BUS_ADDRESS=unix:path=$T/nonexistent \
  pnpm exec vitest run --config.verify-deps-before-run=false tests/e2e/ssh-host.test.ts
```
1. 上面命令 → **6 passed**, exit 0。六格：
   - ① 夹具起来后，`ssh -o BatchMode=yes -o StrictHostKeyChecking=yes pbots-ssh-test true`（走 PATH 里的包装）exit 0。
   - ② 真实 `~/.ssh` 未被改动：取 `os.userInfo().homedir + '/.ssh'`，测试前后各做一次「目录项名 + size + mtimeMs」快照（只 `stat`，**不读文件内容**），两次相等；目录不存在时两次都记为不存在。
   - ③ `SshConnection` ready 后：`ctx.fs.writeText` 写 `ws/hello.txt`，`ctx.fs.readText` 读回一致；`ctx.subprocess.spawn` 跑 `/bin/sh -c 'printf %s "$PBOTS_SSH_MARK"'`，stdout 等于本次随机 marker（只有经 sshd ForceCommand 启动的进程才有这个值 → 证明在「远端」执行）。若 marker 拿不到（env 被覆盖），**停下**把实际 env 现象写进回执存疑项，不要换成别的证明方式（PLAN §5 第 2 条）。
   - ④ `ctx.sandbox.confine` workspace-write 下：bash 写 `ws/in.txt` 成功；写远端 HOME 下 `outside.txt` 失败且文件不存在。
   - ⑤ `helperHash` 故意写错一位 → 连接 ready 拒绝，错误信息含 `SSH helper digest differs`。
   - ⑥ 全部 stop 之后：`/proc/*/cmdline` 里没有任何进程含夹具目录路径；sshd 端口 connect 被拒。
2. `/tmp/dsh-ssh-*` 无新增残留：`ls -d /tmp/dsh-ssh-* 2>/dev/null | sort | comm -13 $T/dsh-ssh.before -` → 空。
3. 无遗留进程：`pgrep -af "bot-T2" | grep -v pgrep` → 空。
4. 锁文件一致：`cd /dev/shm/bot-T2/app/sdk && pnpm install --frozen-lockfile` → exit 0。
5. 改动面：`git diff --stat <起点>..HEAD` 只含边界第 1 条列出的四个文件。
6. 覆盖率：本单不改 `src/`，不适用。

## 为什么这样验收
要保住两件事：**真的走了 ssh**，和**测试绝不碰你的真实 ssh 配置与账户数据**。远端就是本机，同一个文件系统，所以「文件写进去了」证明不了走 ssh——③ 用只有 sshd 会话里才存在的随机环境变量来证明执行位置；② 用 stat 快照证明真实 `~/.ssh` 一字未动（OpenSSH 不认 `$HOME`，光隔离 HOME 不够）；⑤ 证明完整性校验真在生效；⑥ 和第 2、3 条防止留下清不掉的 sshd / ssh master（dsh-ssh 写死 `/tmp/dsh-ssh-*`，sshd chdir 到 `/`，两者都不会被常规清理带走）。

## 风险
- pnpm 布局下 `dsh-ssh/lib/helper.js` 解析 peer 失败（PLAN §5 第 3 条）→ 回执贴原样错误，停下，不要改 node_modules。
- 远端 bwrap：sandbox-ssh 在远端用本机 sandbox-local（`/usr/bin/bwrap` 存在）；若 ④ 因 bwrap 在本机受限而红，贴原样输出写进存疑项。
- 端口竞争：取空闲端口后再起 sshd 有竞态，允许重试一次。
- 机器在跑 GPU 训练：本单只跑一个 e2e 文件，不受全量约束；load > 20 时等一等再跑。

## 产出
- 修改：`app/sdk/package.json`、`app/sdk/pnpm-lock.yaml`
- 新建：`app/sdk/tests/support/ssh-host.ts`、`app/sdk/tests/e2e/ssh-host.test.ts`
- 回执：`work/tickets/receipts/T2.md`
