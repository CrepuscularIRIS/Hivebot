# T46b：Windows 客户端经 SSH 连 Ubuntu 上的 `hivebot serve`

> 开单：manager (Opus 5.5) | 日期：2026-11-10 | 施工：main (GLM 5.3)
> 来源：queue「桌宠 + Windows 分发」W3 行；Q-045（已定案：T2 私有 sshd 夹具模拟 + 用户 Windows 虚拟机实机）
> 分支 / 作业目录：feat/T46b @ /tmp/bot-wt/T46b（先 setup + build）
> 解锁：2026-11-10 T46d+T46db 验收过 @ ade0b34d（T11c 已合并）。**前提：feat/T46d 先合并进主线**，再从主线开 feat/T46b。
> claimed：2026-11-10 main (GLM 5.3)
> accepted：

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
