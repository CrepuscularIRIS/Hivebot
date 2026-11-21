# DESIGN · 产品启动器（本机日常使用第一阶段）

> 执笔：manager (Opus 5.5) | 2026-11-06 | 任务 A
> 来源：主 agent 派发（用户目标：本机日常使用体验 Grok Bot 同级，一条命令 / 双击拉起；后续 Windows exe 客户端连 ssh ubuntu 远端、测试走 tailscale）。用户原话由主 agent 补记进 `work/product-launcher/BRIEF.md`。
> 工单：T17（`work/tickets/open/T17-product-launcher.md`）；后续计划行 T18 / T19 见 `queue.md`。

## 0. 结论

1. **形态 = 一个 bash 脚本 `app/launcher/hivebot`**，只做拼接：起 SDK（`app/sdk/scripts/start.mjs`，原样走 `start.ts` 默认 patch 链）→ 等 ready 行 → 带 `PBOTS_DSH_HANDOFF` 起 Electron（`app/ui/out/main/index.js`）→ 任一侧退出就收另一侧。没有新的 Node 代码、没有新依赖。
2. **启动器不加任何 patch**。「全链」= `start.ts` 默认链（p2sdk / approval / market + 生成的 runtime patch）。orchestration.yml（P6 委派）在默认链之外是因为 **P6-14b 开闸未过**（`p6-orchestration/PLAN.md:74`）——启动器若自己叠加就绕过了那道闸。哪项能力不在默认链，就去走它自己的开闸单，不是启动器的事。`presets.yml` 是测试夹具，也不进。
3. **凭证只进 SDK 进程**：环境变量优先，次选 `~/.config/hivebot/env`（必须 0600，只认白名单键，不 `source`）。Electron 进程的 env 显式剥掉五个凭证键。
4. **Windows 第二阶段**：形态有两种走法，含义差别很大（谁跑 SDK、T9–T13 的 ssh 链给谁用），写成 **Q-031** 交用户拍板；本期只保证「Electron main 只认 `PBOTS_DSH_HANDOFF`」这一条接口不被破坏，不提前写任何 Windows 代码。

## 1. 现状（已核实）

| 事实 | 锚点 |
|---|---|
| Electron main 是纯客户端：读 `PBOTS_DSH_HANDOFF/{base-url,launch-token}` 连 SDK；没有就退化 | `app/ui/main/index.ts:206-221` |
| main 有 app 级单实例锁（第二个实例聚焦第一个窗口后退出） | `main/index.ts:180-193`；`tests/e2e/shell/single-instance.spec.ts` |
| SDK launcher 已有 home 级单实例锁（`$P2SDK_HOME/launcher.lock`，记 launcher+dsh 两个 pid） | `app/sdk/src/start.ts:548-830` |
| SDK launcher 收到 SIGINT/SIGTERM 转发给 dsh（dsh `detached: true`，launcher 被 SIGKILL 时 dsh 故意存活） | `start.ts:984-992`；LEARNINGS 2026-11-06 T9ab 条 |
| ready 判定：handoff 插件写完 token 与 base-url（0600）后才在 stdout 打 `[p2sdk] ready <origin>` | `profile/plugins/handoff.mjs` |
| SDK stderr 打 `p2sdk: dsh pid <N>`、`p2sdk: handoff <dir>`（运维元数据，不含 token） | `start.ts:978,982` |
| real 模式 key 只认 `P2SDK_LLM_API_KEY`；缺则 `validateStart` 报错退出 1 | `start.ts:116-119` |
| 默认 LLM：`http://127.0.0.1:4001`（本机 LiteLLM）、`glm-5.3-flash` | `start.ts:33-34` |
| 默认 `P2SDK_HOME = app/sdk/.dsh`（仓内），默认数据根 = `$HOME/.config/pbots-ui`，不读 XDG；Electron userData 读 XDG → 两侧可能分叉 | `start.ts:69,85-87`；queue「提议」生产两侧数据根条 |
| 沙箱 / guard 遮蔽根 = HOME ∪ 数据根 ∪ `P2SDK_SANDBOX_MASK` ∪ dsh home ∪ handoff ∪ `p2sdk-handoff-*` 兄弟目录 | `src/policy/never-roots.mjs:119-143` |
| 产品 Node 版本：`devEngines` 要 24.9+，系统 node 是 22；pnpm 装的 24 在 `app/sdk/node_modules/.bin/node` | 本机实测 v22.23.4 / v24.22.2 |
| 唯一真模型 e2e 先例：`tests/e2e/journeys/d1-real-model.spec.ts`（key = env `LITELLM_MASTER_KEY` 或 `app/ui/.env`） | `tests/support/creds.ts` |

## 2. 启动器设计（T17）

### 2.1 路径约定（全部按 XDG，可被环境变量覆盖）

| 用途 | 路径 | 说明 |
|---|---|---|
| 数据根 `PBOTS_DATA_DIR` | `${XDG_CONFIG_HOME:-$HOME/.config}/pbots-ui` | = Electron 缺省 userData，已有数据照用；**启动器给两侧显式设同一个值**，顺手消掉「两侧数据根靠约定对齐」那条提议在启动器路径上的分叉 |
| dsh home `P2SDK_HOME` | `${XDG_STATE_HOME:-$HOME/.local/state}/hivebot/dsh` | 不再落仓内 `app/sdk/.dsh`；跨启动稳定（会话恢复要它） |
| 日志 | `…/hivebot/logs/sdk.log`、`ui.log` | 每次启动把上一份挪成 `.1`，只留一代（ponytail：不做轮转，要了再加） |
| 启动器锁 | `…/hivebot/launcher.lock` | `flock -n` |
| 用户配置 | `${XDG_CONFIG_HOME:-$HOME/.config}/hivebot/env` | 见 §2.3 |
| handoff | `mktemp -d "${TMPDIR:-/tmp}/p2sdk-handoff-XXXXXXXX"` | 每次随机（T-12 R1：不可推导）；**前缀必须是 `p2sdk-handoff-`**，never-roots 的兄弟目录遮蔽认这个前缀；退出时删 |
| SDK 工作目录 | `…/hivebot/`（state 根） | 不让 runtime 的缺省 cwd 落在仓内或 `$HOME` 根 |

启动器额外传 `P2SDK_SANDBOX_MASK="$CONFIG_DIR:$STATE_DIR"`（与用户已有值用 `:` 拼接）：配置文件（含 key）与日志进 bash 沙箱遮蔽和 guard 根。HOME 已整体在遮蔽根里，这是给 guard 文件工具的显式一层，成本一个变量。

### 2.2 流程

```
0 预检：node(app/sdk/node_modules/.bin/node)、electron(app/ui/node_modules/electron/dist/electron)、
       app/ui/out/main/index.js、app/ui/out/renderer/shim.iife.js 都在；缺哪个就打印对应的
       `pnpm -C app/<x> setup|build` 命令，exit 2。不自动构建。
1 锁：  exec 9>launcher.lock; flock -n 9
       拿不到 = 已有实例在跑 → 用同一套（剥凭证的）env 直接起 Electron，不带 handoff；
       main 的单实例锁让它聚焦已有窗口后退出 → 启动器 exit 0。零新逻辑。
       之后起的所有子进程都带 9>&-：锁只代表「启动器本身活着」。启动器被 SIGKILL 后锁即释放，
       残留的 dsh 由 SDK 自己的 home 锁挡住下一次启动并报出 pid（已有行为）。
2 凭证：§2.3
3 SDK： (cd STATE_DIR; env P2SDK_HOME P2SDK_HANDOFF P2SDK_PORT=0 PBOTS_DATA_DIR P2SDK_SANDBOX_MASK
        [P2SDK_LLM_API_KEY …] node app/sdk/scripts/start.mjs) >sdk.log 2>&1 9>&- &
4 等：  轮询 sdk.log 出现 `[p2sdk] ready http`，上限 90s。SDK 先退出 / 超时 → 把 sdk.log 尾 20 行
       打到 stderr（validateStart 的报错就在这里，启动器不重复做校验）→ 收尾 → exit 1。
5 UI：  env -u P2SDK_LLM_API_KEY -u LITELLM_MASTER_KEY -u DEEPSEEK_API_KEY -u OPENAI_API_KEY
        -u ANTHROPIC_API_KEY PBOTS_DSH_HANDOFF PBOTS_DATA_DIR electron "$@" app/ui/out/main/index.js
        >ui.log 2>&1 9>&- &
       （"$@" 放在入口前：透传 --disable-gpu、--remote-debugging-port 等 Chromium 开关）
6 等：  wait -n UI SDK。trap INT TERM HUP → 给 UI 发 TERM（走正常退出路径）。
7 收尾（trap EXIT，幂等）：
       UI 活着 → TERM；SDK(start.mjs) 活着 → TERM（它转发给 dsh 并等 dsh 退）；
       合计等 ≤20s；仍活 → KILL start.mjs，再 KILL dsh pid（取自 sdk.log 的 `p2sdk: dsh pid N`，
       且 /proc/N/cmdline 含 dsh 的 bin.js 才杀——防 pid 复用）。不用进程组 / pkill。
       rm -rf handoff（变量非空且以 `p2sdk-handoff-` 结尾才删）。
       退出码：UI 先退 → UI 的码；SDK 先退 → 1。
```

**不做**（ponytail，到时再加）：SDK 崩了自动重启（现在是整体退出、用户重开）；日志轮转；自动构建；守护进程化 / systemd unit（Windows 第二阶段要远端常驻时再做，见 §4）。

### 2.3 凭证与 provider

- key 取值顺序：`P2SDK_LLM_API_KEY` → `LITELLM_MASTER_KEY`（本机交互 shell 已有它，VERIFY-U-31）→ `~/.config/hivebot/env` 文件。
- env 文件：dotenv 形态 `KEY=VALUE`，**只读白名单键** `P2SDK_LLM_API_KEY P2SDK_LLM_BASE_URL P2SDK_LLM_MODEL P2SDK_MARKET_INDEXES`，其余行忽略；**不 `source`**（不执行文件内容）。文件属主不是当前用户、或 mode 有 group/other 位 → 拒绝启动，提示 `chmod 600 <path>`。环境变量覆盖文件值。
- key 只出现在 SDK 进程 env 里（start.ts 再按既有 allowlist 交给 dsh；模型侧 shell 看不到它由 `tests/e2e/security.test.ts` 已有格保证）。Electron env 剥五键（同 `tests/support/sdk-env.ts` 的 `SANDBOXED_CREDENTIAL_KEYS` 清单）。
- key 不进日志、不进命令行参数（`ps` 可见）——只经 env。
- `P2SDK_PROVIDER=mock` 透传，免 key，供 e2e 与无网时冒烟。
- keyring（libsecret）不做：本机 0600 文件与 `~/.ssh` 同级；第二阶段若走方案 B，key 留在服务器上，Windows 侧根本不碰 key（§4）。

### 2.4 构建 → 可双击

- 本期：`pnpm -C app/sdk setup && pnpm -C app/ui setup && pnpm -C app/ui build` 之后，`app/launcher/hivebot` 一条命令。
- 双击：T18（计划行）只加一个 `.desktop` 模板 + 一行安装说明，用户自己拷到 `~/.local/share/applications/`（测试不碰真实桌面）。
- 打包（electron-builder）本期不做：本机用源码树跑就够；它只在 Windows 第二阶段有消费者。

## 3. 验收设计（落在 T17）

e2e：`app/ui/tests/e2e/launcher.spec.ts`，经 `scripts/run-e2e.sh`（Xvfb + 死 DBus）跑。测试用 `child_process.spawn` 起启动器（拿到启动器 pid 与退出码），传 `--disable-gpu --remote-debugging-port=<空闲端口>`，用 `chromium.connectOverCDP` 拿页面。**退出 = 关窗口**（`page.close()` → `window-all-closed` → `app.quit()`），这正是用户的退出路径，所以不用 `_electron.launch`。

隔离：每格新建 `HOME / XDG_CONFIG_HOME / XDG_STATE_HOME / XDG_CACHE_HOME / TMPDIR`（`tmkdir('bot-T17-…')`），env 显式构造，不 spread `process.env` 的凭证。

残留判定照 LEARNINGS 2026-11-06 T9ac 条：关窗**前**从 `/proc/*/stat` 收启动器后代 pid 集合，先断言集合非空且含 electron 主进程、start.mjs、dsh 三类，退出后断言集合内 pid 全不在；不用 `ppid==1` 计数（本机 systemd --user subreaper 收养孤儿）。

格子（详见工单）：① mock 生命周期 ② 双开 ③ 缺 key / 坏权限 ④ SIGTERM ⑤ 凭证不外泄 ⑥ 真模型一轮（默认 preset，不叠 presets.yml）。变异 M1–M4 各令一格红。

## 4. 第二阶段：Windows exe 客户端（只记方向与约束，不开工）

用户定调（2026-11-06，经主 agent 转述）：后续做 Windows exe 客户端，连到 ssh 可达的 ubuntu 远端电脑；测试可能走 tailscale；Windows 侧由用户自己连过来测。本机 Linux 是第一阶段。

### 4.1 关键分歧：谁跑 SDK（→ Q-031）

| | **A：exe 内含 SDK，工具经 ssh 在 ubuntu 上执行** | **B：exe 只是 UI，SDK 以本机模式跑在 ubuntu 上，经隧道连** |
|---|---|---|
| ssh 链 T9–T13 | **就是为它设计的**（fs-zone-ssh / sandbox-zone-ssh / T11 远端工作区） | Windows 客户端**不消费** ssh 链；ubuntu 本身就是 bot 的电脑（L8 由「SDK 跑在那台机器上」直接满足）。ssh 链只剩「再操控另一台机器」的用途 |
| dsh 跑在 Windows | 要：node-pty / koffi 等原生依赖的 Windows 构建、bwrap 不存在（本机工具必须全禁或全走 ssh）、T4 §5 那批宿主直连插件（tool-fs-search、attachment-local、spill-local、agent-instructions、skill-filesystem）会在 Windows 上跑 | 不用：Windows 上只有 Electron |
| LLM key | 在 Windows 机器上 | 只在服务器上 |
| 关掉 Windows 后 bot 还跑吗（BRIEF L14） | 不跑 | 跑 |
| main 的本机文件职责（bots.json、`workspaces/<botId>` 建目录 + cwd 注入〔`m3-meta/orchestrate.ts`〕、skill 启用复制〔`main/skills`〕、`admin-operations.jsonl`、theme） | 留在 Windows 本地即可；工作区走 T11 的远端分支 | **必须迁到 SDK 侧**（主题等纯 UI 状态除外）——Windows 路径的 cwd 发给 Linux SDK 必坏。T11 的 `p2sdk/workspace.ensure` RPC 正是这一步的第一块，可复用 |
| 粗估 | 移植 dsh 到 Windows + 宿主直连插件逐个处理，量大、风险在上游 | main 文件职责迁移约 3–5 张单 + 隧道接入 1–2 张 |

经理推荐 **B**：key 不离开服务器、bot 常驻（L14）、沙箱用现成 bwrap、不用把 dsh 移植到 Windows；代价是 main 的文件职责迁到 SDK 侧，而 T11 已经在铺这条路。B 下 T11 照常做完（它的 RPC 两种方案都用得上），T12/T13 是否继续随 Q-031 定。

### 4.2 B 方案下的约束（第一阶段要守住的）

1. **Electron main 只认 `PBOTS_DSH_HANDOFF`**（base-url + launch-token 两个文件）。Windows 客户端 = 建 ssh 隧道 → 在本地写一个 handoff 目录（base-url 指向隧道本地端口）→ 起 Electron。main 不用改连接代码。本期任何单不得给 main 加「必须与 SDK 同机」的新假设（新增本机 fs 职责要在工单里点名并说明第二阶段去向）。
2. **传输 = ssh 本地转发，tailscale 只管可达**：Windows 自带 OpenSSH 客户端；`ssh -L P:127.0.0.1:P <tailnet 主机>`。dsh web server 继续只听 loopback，网络上没有新监听口，token 走 ssh 加密通道。两侧用**同一端口号**，Host 头不变，绕开可能的 origin/Host 校验（第二阶段先实测 dsh 对 Host 头的处理）。备选 `tailscale serve`（tailnet 内 HTTPS，token 是唯一门槛）——不推荐作为第一选择。
3. **远端 headless 模式**：启动器拆出「只起 SDK」一档（不起 Electron），远端常驻（systemd --user）需要固定端口（`P2SDK_PORT`）。token 的交付方式要重新设计：现在的随机 handoff 目录对远端客户端不可知；候选 = 客户端 `ssh host <命令>` 读取（ssh 通道内一次性交付），落点必须在遮蔽根里。这条撞 T-12 R1 / T-01 ⑤ 的既有约束，第二阶段单独设计、过审。
4. **打包**：electron-builder win 目标，`files` 只含 `app/ui/out/**`；`app/sdk` 不进 exe。Linux 上交叉构建 Windows 安装包需要哪些工具（wine / rcedit）第二阶段先查证，不凭记忆。
5. **断连**：DshConnection 已有指数退避重连（U-17）；隧道断了等同 SDK 暂不可达。T12 的「重新连接」体验在 B 下改为「重建隧道」。

### 4.3 A 方案下的约束（若用户选 A）

T9–T13 原计划照走；另需一张 RE/评估单：dsh 9 依赖在 Windows 上能否装、能跑哪些插件、本机工具全禁后的 preset 是否可用。启动器第一阶段设计不变。

## 5. 风险

- **默认链能否直接用**：现有 e2e 建 bot 都叠了 `presets.yml` 夹具；默认 preset（standard）+ 真模型的完整一轮还没有 e2e 证据。T17 ⑥ 就是这条证据；若红，按「先查根因」另开单，不在启动器里补 patch。
- **out/ 过期**：启动器不检查构建是否是最新提交的产物。日常使用前 `pnpm -C app/ui build`；提议记在 queue。
- **单模型**：p2sdk.yml 只注册一个模型 id（`P2SDK_LLM_MODEL`），UI 里切模型能力有限。日常体验若需要，另起需求。
- **LiteLLM 依赖**：真模型依赖本机 `127.0.0.1:4001` 的 LiteLLM 在跑；启动器不管它，SDK 首轮报错会落 sdk.log。
