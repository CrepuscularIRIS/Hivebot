# T46b：Windows 客户端经 SSH 连 Ubuntu 上的 `hivebot serve`

> 开单：manager (Opus 5.5) | 日期：2026-11-10 | 施工：main (GLM 5.3)
> 来源：queue「桌宠 + Windows 分发」W3 行；Q-045（已定案：T2 私有 sshd 夹具模拟 + 用户 Windows 虚拟机实机）
> 分支 / 作业目录：feat/T46b @ /tmp/bot-wt/T46b（先 setup + build）
> 解锁：2026-11-10 T46d+T46db 验收过 @ ade0b34d（T11c 已合并）。**前提：feat/T46d 先合并进主线**，再从主线开 feat/T46b。
> claimed：2026-11-10 main (GLM 5.3)
> accepted：2026-11-10 c7a2e967（manager 任务 B 第 3 轮，见 receipts/T46b.acceptance.md 末节）

## 目标
Electron main 在没有 `PBOTS_DSH_HANDOFF`、但数据目录里有 `remote.json` 时：用一条固定 ssh 命令拿到 base-url / token / 远端根，起一条 ssh 本地端口转发，把现成的 `DshConnection` 指到转发端口上。token 只在内存里，ssh 隧道的生命期 = 应用的生命期。

## 立项核对（原案两个判断 + 一处修正）
1. 「T9 系 ssh 组合不适用」——**成立**。`main/dsh/connect.ts` 只做 HTTP（`/connect?token=` 换 cookie）+ mux WebSocket，main 不需要 SDK、dsh-ssh、key；Windows 侧只多一个 ssh 端口转发。
2. 「T11 远端工作区分支正好复用」——**成立，但有两个缺口**，已分别拆出：SDK 只在 ssh 模式挂 `p2sdk/workspace_ensure` → T46d 让 serve 也挂；`mintWorkspace` 靠 handoff 目录里的 `ssh-mode` 文件判断 → T11c 把判定收成一处 `remoteRoot()`，本单给它加内存来源。
3. 「断开走 T12a 提示」——**不成立**。T12a 认的是 SDK 发来的 turn/end 帧（dsh-ssh 断连串）；Windows 隧道断了是 `DshConnection` 的 HTTP/WS 断开，根本没有帧。本单改为：隧道进程退出 → 同端口自动重起隧道，`DshConnection` 现成的重连（U-17 退避）随之接上。不加新 UI。
4. 原计划「再跑一次 `ssh host cat <handoff>/launch-token`」改为 T46d 的一条固定命令 `serve --connect`，不拼远端输出。

## 定案
**新文件 `app/ui/main/remote/ssh.ts`**（一个文件，纯函数 + 一个 `openRemote`）：
1. `readRemoteConfig(dataDir)`：读 `<dataDir>/remote.json`。文件不存在 → `undefined`（走原路径）。必须是 `{"host": "<别名>"}`，**只允许 host 一个键**（多了任何键都拒，免得用户以为 port / command 生效了）。host 形状 `^[A-Za-z0-9._][A-Za-z0-9._@-]{0,252}$`——**首字符不许 `-`**（否则 `-Fxxx` / `-oXxx` 会被 ssh 当选项）。
2. `sshBin(platform)`：`win32` → `${SystemRoot ?? 'C:\\Windows'}\\System32\\OpenSSH\\ssh.exe`（绝对路径，不走 PATH）；其他 → `'ssh'`（Linux e2e 靠 PATH 换成夹具包装）。
3. 两组 argv，**写死成数组常量**，host 只出现在 `--` 之后：
   - 取连接信息：`['-o','BatchMode=yes','-o','ConnectTimeout=10','--', host, '~/.local/bin/hivebot serve --connect']`
   - 隧道：`['-N','-o','BatchMode=yes','-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3','-L',`127.0.0.1:${L}:127.0.0.1:${P}`,'--', host]`
4. `parseConnectLine(stdout)`：找 `^HIVEBOT-CONNECT (\{.*\})$` 行；`base_url` 必须是 `^http://127\.0\.0\.1:(\d{1,5})$`（端口 1–65535）；`token` 必须 `^[A-Za-z0-9._~-]{16,512}$`；`remote_root` 必须以 `/` 开头、无 `..` 段、无控制字符。任何不符 → 抛**固定文案**的错，**错误消息和日志里绝不带 stdout 原文**（里面可能有 token）。stdout 只收前 64 KiB，命令 20s 超时。
5. `openRemote(cfg)`：跑取连接信息 → 在 127.0.0.1 上拿一个空闲端口 L → 起隧道 → 等 L 可连（≤15s）→ 返回 `{ baseUrl: 'http://127.0.0.1:L', token, remoteRoot, close() }`。隧道进程意外退出且未 close → 同一个 L 重起，退避 1s 起翻倍封顶 30s。`close()` 杀隧道并停止重起。
   - `// ponytail:` 注释写明两处上限：空闲端口「先 listen 再 close」有竞态；应用被强杀时 Windows 上 ssh.exe 会成孤儿（要根治得上 Job Object）。
6. token 不进 env、不进 argv、不写文件、不进日志；只作为参数交给 `new DshConnection(...)`。

**`app/ui/main/remote-root.ts`**（T11c 建的）：加 `setRemoteRoot(root)`，`remoteRoot()` 先返回内存值，再按原 handoff 文件判定。`mintWorkspace` 和 skills 拒绝因此自动覆盖 Windows 模式。

**`app/ui/main/index.ts`**：
1. 在 `createReadyGate()`（第 195 行）之前算出 `dataDir`（与第 262 行同式）和 `remoteCfg = handoff ? undefined : readRemoteConfig(dataDir)`；`createReadyGate({ dshConfigured: Boolean(handoff) || remoteCfg !== undefined })`（否则 ready.ts 按 env 判成「没配 dsh」）。有 handoff 时一切照旧（handoff 优先）。
2. 第 222 行分支加 `else if (remoteCfg)`：`openRemote` 成功 → `setRemoteRoot`、`new DshConnection({ baseUrl, token, … })`，`app.on('will-quit', close)` 并 `process.on('exit', close)` 兜底。失败（serve 没在跑、ssh 认证失败、坏行）→ `console.error` 一行固定文案（可含 host，不含 stdout）、dsh 保持 undefined、`ready.setRestoreSettled([])`——M1/M2 不能挂死（U-17 同义）。
3. 不动 preload、renderer、`connect.ts`。

**不做**：断开时的新提示 UI；serve token 变了之后的自动恢复（serve 重启后要重开应用）；自动在 Ubuntu 上起 serve（Q-046）；多台主机 / 主机选择 UI。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. `app/ui/main/index.ts:190-235, 260-311`、`app/ui/main/ready.ts`、`app/ui/main/dsh/connect.ts`
3. `app/ui/main/remote-root.ts`、`app/ui/main/m3-meta/orchestrate.ts:96-118`
4. `app/ui/tests/support/ssh-fixture.ts`（私有 sshd 夹具）、`app/ui/tests/e2e/ssh-workspace.spec.ts`（⑤a 是本单 e2e ① 的模板：#3 直调建 bot、远端有 / 宿主无）
5. `app/ui/tests/e2e/launcher-serve.spec.ts`（起 serve 的现成做法）
6. T46d 回执（`serve --connect` 的实际输出）

## 边界
1. 只动：`app/ui/main/remote/ssh.ts`（新）、`app/ui/main/remote-root.ts`、`app/ui/main/index.ts`、`app/ui/tests/unit/remote/ssh.test.ts`（新）、`app/ui/tests/e2e/remote-ssh.spec.ts`（新）、`app/ui/tests/support/ssh-fixture.ts`（只许加可选参数 / 导出，不改既有行为——ssh-workspace.spec 必须照绿）。
2. **第 0 步探针**：夹具起 sshd + 起 serve，手工 `ssh -N -L 127.0.0.1:<另一个端口>:127.0.0.1:<P>` 之后，用 `exchangeLaunchToken('http://127.0.0.1:<另一个端口>', token, 'answer')` 换 cookie 并打开 mux。dsh 若校验 Host 头 / 端口导致失败 → 停，回执贴原样输出，派经理任务 C。
3. 先写失败测试：单测全部先红（模块不存在）；e2e ① 先红（现状：没有 handoff 时 main 不连任何 dsh）。
4. 隔离 HOME/TMPDIR/XDG、死 DBus；ui e2e 一律 `run-e2e.sh`、与 sdk e2e 错开。

## e2e 接法（`tests/e2e/remote-ssh.spec.ts`，Xvfb，一个 describe 串行）
- **「Ubuntu」端**：`startUiSshServer(root)`。夹具的 ForceCommand 把远端命令的 `HOME` 设成 `server.remoteHome`，所以：
  - `ln -s <repo>/app/launcher/hivebot <remoteHome>/.local/bin/hivebot`
  - 用 `HOME=<remoteHome>` 起 `hivebot serve`，**显式删掉 `XDG_STATE_HOME`/`XDG_CONFIG_HOME`**（要和 sshd 那边的默认路径一致，否则 `--connect` 找不到 serve.json），`P2SDK_PROVIDER=mock`、死 DBus。远端根 = `<remoteHome>/.config/pbots-ui`。
- **「Windows」端**：另一个 dataDir（`<root>/win-data`），写 `remote.json` = `{"host":"pbots-ssh-test"}`；`launchShell` **不传** `PBOTS_DSH_HANDOFF`，`PATH` 前面放本 spec 自己写的 ssh 包装目录。
- **ssh 包装用本 spec 自己的，不用夹具的 `bin/ssh`**：夹具版带 `setpriv --pdeathsig TERM`，Electron 一退 ssh 就跟着死，会把「产品没杀隧道」的 bug 盖住（Windows 上没有 pdeathsig）。本 spec 的包装：`echo "$$ $*" >> <root>/ssh-argv.log; exec /usr/bin/ssh -F <夹具 ssh_config> "$@"`。spec 的 finally 用日志里的 pid 兜底收（`bot-reap`），再 TERM serve（照 W2b 写法），再 `stopServer()`。
- 格：
  - ① 连上：#3 `session/create` ok；`<远端根>/workspaces/` 下出现新目录且 `<win-data>/workspaces/<botId>` 不存在；用 mock 走一轮到 turn/end（照 launcher.spec 的做法；serve 下 mock 出不了一轮就停下写存疑）。
  - ② token 不外泄：读 serve handoff 的 `launch-token` 真值，断言以下全部不含：`<win-data>` 下所有文件、Electron 的 stdout+stderr、`ssh-argv.log`、Electron 主进程与每个 ssh 子进程的 `/proc/<pid>/cmdline` 和 `/proc/<pid>/environ`；Windows 端 TMPDIR 下没有新的 `p2sdk-handoff-*`。
  - ③ argv 钉死：启动后 `ssh-argv.log` 恰两行，分别与定案 3 的两组数组逐项相等（L、P 取实际值）。
  - ④ skills：`pbots:skills` list 返回 `pbots/remote-mode` + T11c 原文。
  - ⑤ 关应用：`shell.stop()` 后 5s 内日志里的隧道 pid 不在了；serve 仍活（`--status` exit 0）。
  - ⑥ 隧道被杀：kill 日志里的隧道 pid → 30s 内日志出现第 3 行（同 L 的新隧道），之后 M1 调用（如 `session/list`）成功。
  - ⑦ 坏配置：`{"host":"-Fevil"}` → `ssh-argv.log` 为空（一个 ssh 都没起）、stderr 有固定错误、M1 调用 15s 内返回（不挂死）。
  - ⑧ serve 没在跑：配置正确但不起 serve → 日志只有取连接信息那一行、没有隧道、stderr 固定错误、M1 15s 内返回。

## 验收（app/ui 下）
1. `pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/remote` → 全 passed。至少覆盖：remote.json 缺文件 / 正常 / 首字符 `-` / 含空格 / 含 `=` / 多余键 / 非对象 / 超长；connect 行正常 / 非回环地址 / https / 端口越界 / token 坏字符 / remote_root 相对路径或含 `..` / 前面有杂行 / 没有该行；**带 token 的坏行抛出的错误消息不含 token**；两组 argv 逐项相等；`sshBin('win32')` 与 `sshBin('linux')`。
2. 覆盖：`pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/remote --coverage --coverage.include=main/remote/** --coverage.include=main/remote-root.ts` → 行覆盖 ≥80%
3. `pnpm --config.verify-deps-before-run=false exec sh scripts/run-e2e.sh tests/e2e/remote-ssh.spec.ts` → 全 passed（①–⑧）
4. 变异（回执各贴原样）：去掉 host 首字符检查 → 单测红；去掉 `will-quit` 的 close → ⑤ 红；不调 `setRemoteRoot` → ① 与 ④ 红；去掉重起 → ⑥ 红；失败分支不 `setRestoreSettled` → ⑦ 或 ⑧ 红
5. 回归：`… run-e2e.sh tests/e2e/ssh-workspace.spec.ts` → 3 passed；`… run-e2e.sh tests/e2e/launcher-serve.spec.ts` → 1 passed；`vitest run tests/unit/skills tests/unit/m3` → 全 passed
6. 跑完：`ps -eo cmd= | grep -E 'pbots-ssh-test|bot-t46' | grep -v grep` 为空

## 为什么这样验收
- 真正要保住的是三件事：**token 只在内存里**（②查的是进程 env/argv 和所有落盘面，不只是日志）；**ssh 只按我们写死的形状被调用**（③逐项相等，⑦证明坏 host 连 ssh 都起不来）；**隧道跟着应用走**（⑤⑥——所以必须用不带 pdeathsig 的包装，否则 ⑤ 永远绿）。
- ① 证明这条路真能用（建 bot 落在 Ubuntu、真走一轮），不是只连上了 HTTP。
- ⑦⑧ 防止「连不上就整个界面卡死」——Windows 用户最常见的失败就是 serve 没开或 key 没配。

## 安全面
remote.json → ssh argv、token 生命周期、子进程生命周期都在本单。施工完**单独派 reviewer**（不与别的单同批），给它本单、T46d 回执和 commit 区间；重点：argv 注入面（host、remote_root 回流到哪里）、token 是否有任何落盘 / 日志 / 子进程 env 路径、重起循环在 close 后是否真停。

## Windows 实机（用户在虚拟机做，主 agent 只写清单进回执，不代做）
1. Ubuntu：`ln -s ~/bot/app/launcher/hivebot ~/.local/bin/hivebot`；`hivebot serve` 常驻（另开终端或 tmux）。
2. Windows：`~/.ssh/config` 写 Host 别名 + 私钥；`ssh <别名> ~/.local/bin/hivebot serve --connect` 在 PowerShell 里不弹密码、能打出 `HIVEBOT-CONNECT` 行。
3. 用 T46a 的安装包装好；在应用数据目录（`app.getPath('userData')`，施工时在回执写清 Windows 上的实际路径）放 `remote.json`。
4. 打开 → 建一个 bot、问一句；Ubuntu 上 `~/.config/pbots-ui/workspaces/` 出现新目录。
5. 关掉应用 → 任务管理器里没有 ssh.exe。
6. 开着应用时在任务管理器结束 ssh.exe → 30 秒内能继续对话。
7. 已知上限（不算失败）：应用被强杀时 ssh.exe 会留下。

## 产出
- `app/ui/main/remote/ssh.ts`、`app/ui/main/remote-root.ts`、`app/ui/main/index.ts`
- `app/ui/tests/unit/remote/ssh.test.ts`、`app/ui/tests/e2e/remote-ssh.spec.ts`（必要时 `tests/support/ssh-fixture.ts` 小改）
- 回执 `work/tickets/receipts/T46b.receipt.md`（含 Windows 实机清单）

## 任务 C 重规划（manager Opus 5.5，2026-11-10，@ 566d53fb）——**方向不变，单点修复；失败计数 1**

### 根因（经理亲自复现，两轮探针）
不是 Electron spawn 怪癖，是 `main/remote/ssh.ts` 的 **`canConnect` 只连一次**：隧道刚 spawn、端口还没绑，`net.connect` 立刻 `ECONNREFUSED`（实测 2ms）→ `on('error')` 直接 `resolve(false)` → `openRemote` 抛 ERR 并 SIGTERM 隧道。15s 超时形同虚设。
- 证据 1：e2e 全程 3.5s 就在 ① 红——等不了 15s 的「等端口」。
- 证据 2：wrap 包装给隧道加 `-vvv -E sshv-$$.log`，**隧道的 -vvv 日志根本没生成**（进程起来就被杀）；connect 那条 `-vvv` 日志 Exit status 0，stdout（token 打码后 od 过）形状完全合法，parse 通过；sshd 侧这一轮隧道连 TCP 都没到——上一轮的「[preauth] closed」只是 kill 落在握手中途。
- 「手动三连全通」是因为手动/探针自己轮询了端口，没走 `canConnect`。回执的三个方向（Electron 最小复现 / node:net 自建 proxy / e2e 降级）**全部驳回**：问题不在子进程层。

### 修复（原单内施工，不开新单号）
1. **先红**：`tests/unit/remote/ssh.test.ts` 加两格（导出等待函数，如 `waitPort(port, deadlineMs)`）：
   - 端口 600ms 后才 listen → 在 deadline（给 3000ms）内返回 `true`（**现状红**：立即 false）；
   - 从不 listen → deadline（给 800ms）后返回 `false`，且耗时 ≥ 700ms（防「立即 false」回潮）。
2. **绿**：`canConnect` 改成截止时间内每 ~200ms 重试一次，连上即 true；另外隧道进程已退出时提前放弃（不必傻等满 15s）。最少代码，别引依赖。
3. **spec 卫生（实锤泄漏）**：`remote-ssh.spec.ts` 的 finally 只 kill 本地 ssh 客户端，远端 ForceCommand 下的 `serve.sh → hivebot serve → start.mjs → dsh web` 整串成孤儿（经理查到 13 组 `/tmp/bot-t46b-e2e-*` / `/tmp/bot-t46b-probe-*` 残留）。finally 在 `rmSync` 前加 `execFileSync(join(REPO,'scripts','bot-reap'), ['--match', root])`（root 必须在 `/tmp/bot-` 下——tmkdir 用默认 TMPDIR 即可，别把 TMPDIR 指到沙箱白名单外）。
4. 其余定案、argv、验收 1–6 **全部不变**。

### 追加验收
- 变异（并入验收 4）：`waitPort` 改回单次连接 → 新单测「延迟 listen」红；去掉「隧道已退提前放弃」→ 不要求红（只是快慢）。
- 跑完 spec 后验收 6 必须真为空（先清旧孤儿：`~/bot/scripts/bot-reap --match bot-t46b-`，再跑）。

### 已知上限（记 ponytail 注释，不在本单修）
`await openRemote` 在 `loadURL` 之前：Windows 上 ssh 慢时主窗口最长 ~35s 不出现（20s connect + 15s 隧道），无任何提示。常见情况 1–3s，先接受；提议已记 queue。

## 任务 C（二）（manager Opus 5.5，2026-11-10，@ 9b157da0）——**终验不过；失败计数 2；方向不变，单点修**
详见 `receipts/T46b.acceptance.md`。两处根因都在 `openRemote` 的隧道监听，外加 e2e 跑在旧构建上。

### 修复（原单内施工）
1. **先红**（`tests/unit/remote/ssh.test.ts`，用 `openRemote({host:'h'},{bin:<临时假 ssh 脚本>})`，脚本按 argv 含 `-N` 分流；connect 分支打印合法 `HIVEBOT-CONNECT` 行；同时挂 `process.on('uncaughtException')` 计数，断言为 0）：
   - 慢绑定：隧道分支 `sleep 0.6` 后才 listen `-L` 的本地端口 → `openRemote` **resolve**（HEAD 红：313ms reject）；
   - 隧道秒退：隧道分支 `exit 255` → **reject 固定 ERR**、uncaught 0；
   - 隧道 ENOENT：connect 分支末尾 `rm -f "$0"` → 隧道 spawn ENOENT → **reject 固定 ERR**、uncaught 0（HEAD 红：resolve 死端口 + uncaught 1）。
2. **绿**（最少改动）：
   - alive 去掉 `tunnel.connected`（那是 IPC 标志，无 IPC 恒 false）。改成一个 `gone` 标志：`error`/`exit` 都置 `gone = true`，alive = `() => !gone`；`startTunnel` 每次起新进程先 `gone = false`。
   - `onTunnelGone` **不 throw、不碰 `closed`**：`if (closed || !firstUp) return`，首起失败只靠 waitPort 返回 false 后 `openRemote` 自己的 throw（async 内，能传到 await 者）。`:141` 条件改为 `if (!up)`。
3. **e2e 必须跑在当前构建上**：回执里 e2e 前贴 `pnpm build`（或 `electron-vite build`）原样尾部，再贴 `grep -l "<本次改动独有的标识串>" out/main/*.js` 命中。
4. **②/⑦/⑧ 补**：`shell.app.process()` 的 stdout/stderr 监听挪到 `launchShell` 返回后立即挂（启动期 openRemote 那段要收进来）；⑦⑧ 各断言 stderr 含 `remote: ssh connect to` 固定前缀且不含 token。

### 追加验收（并入验收 4/3）
- V7：alive 恢复 `&& tunnel?.connected !== false` → 慢绑定格红；V8：onTunnelGone 恢复 `throw` → ENOENT 格红。
- 验收 3 八格全绿（当前构建）；验收 5 回归三件全跑；验收 6 残留 0。
- V5 已裁：接受空刀，不再要求。
