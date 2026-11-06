# DESIGN · ssh 族 × 我们安全层的组合（T5 / L8-c）

> manager (Opus 5.5) 执笔 · 2026-11-06 · 起点 HEAD b3983512 · 工单 `work/tickets/open/T5-l8c-ssh-composition-design.md`
> **r2（2026-11-06 06:20）**：按复审 `work/tickets/review/T5-design.md` 11 条 CONFIRMED 修订（D1/D2/D4/D5/D7/D8/D9 改动最大）；经理先逐条读源码核实了第 1、2、3、9 条（证据锚点已并入各节），再改文。
> 输入：p9 `PLAN.md` §2/§3/§5、`work/tickets/receipts/T4.md` §5 与经理核实、上游 `repos/deepseek-harness@ce7073d`（与产品钉版 0.2.2-alpha.2 语义一致处引源码，行号以 repos 为准；装包实物另引 `app/sdk/node_modules/@deepseek-ai/*`）。
> 原版锚点：0.78.1 解包树 `/dev/shm/grok-re/0.78.1/app/dist/`，用 `LC_ALL=C grep -a -c -F '<字面串>' <文件>` 复核。
> 当前消费者只有一个：BRIEF 验收第 1 条「工程 bot 在 ssh 主机（先是本机）上改代码跑测试，结果回到对话」（`work/p9-dsh-integration/BRIEF.md:37`）。真实远程主机不是当前消费者，凡只为它的结论都标「真实远程」并落到最后一张实现单。

## 0 结论表

| D# | 一句结论 | 落到 |
|---|---|---|
| D1 | fs-zone 不换不丢：新增 `fs-zone-ssh.mjs` 继承 `SshFileSystem`，覆盖它仅有的两个写入口 `writeText`/`editText`，先远端 resolve 再跑 zoneGuard 判定；可写根 = 远端会话 ws + 显式追加根（不用宿主 `canonicalPath`）；复用 `applyZoneRecheck` | T9b |
| D2 | guard 保留宿主根 + 加远端根（`remoteHome` 套凭证清单、整棵 remoteHome 软遮蔽、远端 helper **安装目录**写保护）；启动时用 `ctx.fs.resolve('~')` 校验 `remoteHome`，不一致启动失败；ssh 模式下 `isPathUnder` 一处切纯词法 | T9b |
| D3 | shell-ask 代码不动；bash 免卡以 D4 wrapper 生效为前提，wrapper 不成立即 fail closed | T10 |
| D4 | 远端 bash 必须套我们的 wrapper：`sandbox-zone-ssh.mjs` 继承 `SshSandboxProvider`，把远端 bwrap argv 改写为「wrapper + **宿主 computeRoots 全套参数 ∪ 远端根** + 原 profile」；非 bwrap / 非 full 拒 | T10 |
| D5 | ssh 模式下工作区 = `<remoteRoot>/workspaces/<botId>`；main 开机问 SDK 拿模式与 `remoteRoot`，`mintWorkspace`（#3/#4/worker 三条建会话路径的共同入口）改调 SDK 新 RPC `p2sdk/workspace.ensure`（SDK 侧经 `ctx.subprocess` 跑固定 argv `mkdir -p`，FileSystem 没有 mkdir） | T11 |
| D6 | 进程级：一个 dsh 运行时 = 一台电脑；preset `isolate` 做不到。旧 bot 怎么办 → Q-029 | 全部；Q-029 |
| D7 | 断连专用通知「可能已执行」；**重启触发 = main 在事件流里看到固定串 `SSH connection is closed`**（dsh 进程还活着，launcher 看不到）→ 通知里给「重新连接」按钮，用户点才重启（会打断其他 bot 在跑的回合，所以不自动）；不重放 | T12 |
| D8 | PTC 全族在 ssh 模式禁用：禁 base `ptc-runtime` 即断掉所有 preset 嵌套 `workflow-ptc` 的服务依赖；测试**从组合后 profile 枚举全部 preset** 断言无 `workflow` 工具，不写死清单 | T9a |
| D9 | `tool-fs-search` 在 ssh 模式由 guard 的工具名拒绝挡住（它嵌在 5 个 preset 里，禁 base 行不够）；其余行去留同 r1；**ssh bot 的 skill 副本落远端 `<remoteRoot>/workspaces/<botId>/.dsh/skills/<name>/`，T7a 本机复制在 ssh 模式下拒** | T9a（工具拒）、T11（skill） |
| D10 | 37 个 release 全部 0 asset、npm 无 helper-runtime 包 → 真实远程用 node-script 闭包推送 | T13 |
| D11 | 维持不扫；加回归格证明强杀只留空目录 | T9a |
| D12 | box 按 agentId 记账、共用与否不可见；按每运行时一台 | — |
| D13 | ssh 行由 `start.ts` 按 `P2SDK_SSH_*` 生成；身份只用 OpenSSH 别名；**T9a 第一步删 `ssh-headless.test.ts:111-122` 重复 llm-replay** | T9a |

---

## D1 fs 层：fs-zone 换成 fs-ssh 还是包一层

**原版**：原版 bot 的文件工具跑在云 box 里（local-exec-daemon 在 box 内，`RE-skills.md` 背景段），box 是 bot 专用机，没有「区外写出卡/拒」这一层可对照。我们的区域语义（区内写零卡、区外写一律拒、执行期复判）是 P6-25 的自定规格（Q-013 / 决策 37），ssh 模式下照旧适用。

**备选**：
1. **直接换成 fs-ssh**，只靠 shell-ask 的预执行判定（它已用同一句原因拒所有区外写，`app/sdk/src/policy/shell-ask.mjs:84`、`app/sdk/src/policy/shell-ask.mjs:342`、`app/sdk/src/policy/shell-ask.mjs:383`）。拒：预执行判定与远端真正写入之间可以换链；本机后端为此在执行层又判一次（P6-25 决策 37），ssh 下没理由少这一层。另外不走 tools 管线的写入（内部调用、将来的 T11 skill 复制）只有 provider 层能拦。
2. **只在 tools/execute 包一层**。拒：外层拿不到 provider 最终写入的目标身份。
3. **（选）继承 fs-ssh 的 provider 类**，与 `ZoneCheckedFileSystem extends SandboxedFileSystem` 同一写法（第 2 级集成）。r2 修正理由：`SshFileSystem` **没有** `checkedTarget` 这个统一收口，`writeText`/`editText` 直接把 target 与 policy 发给远端、由 helper 远端 resolve 并写（`app/sdk/node_modules/@deepseek-ai/dsh-fs-ssh/lib/index.js:93-110`）。所以子类做的是「先 `this.resolve()`（一次 RPC）→ zoneGuard → `super.writeText()`（远端再 resolve 一次）」，两次 RPC 之间有换链窗口——与本机已接受的写侧窗口同类（`app/sdk/src/policy/fs-zone.mjs:6-7`）。选 3 的真实收益是「provider 层兜底所有写入调用方」，不是消除 TOCTOU。

**结论**：新增 `app/sdk/src/policy/fs-zone-ssh.mjs`：`class ZoneCheckedSshFileSystem extends SshFileSystem`（`app/sdk/node_modules/@deepseek-ai/dsh-fs-ssh/lib/index.js:25`）。
- **覆盖面 = `writeText`、`editText`**——0.2.2-alpha.2 的 `SshFileSystem` 只有这两个写入口（同文件 :93、:102）；其余 mutation 不存在（基类行为）。T9b 加一格断言：若上游升级新增写入口而本类没覆盖，测试红（枚举原型上的方法名与白名单比对）。
- 每个入口：`fresh = await this.resolve(target)` → zoneGuard（NEVER 根任意 mode 拒；可写档目标须在 `policy.workspaceRoot` 或 `policy.additionalWritableRoots` 下，否则 `WRITE_OUT`）→ `super.*`。**不调** `workspaceWritableRoots`：本机 zoneGuard 用它（只含 ws + 追加根、不含 /tmp，dsh-sandbox lib 225-228），语义正对，但它用宿主 `canonicalPath` 规范化根，远端拼写不能在宿主 realpath——ssh 版取 fs-ssh 远端 resolve 过的 ws 根做词法比较，语义保持「不含 /tmp」。写 `ponytail:` 注释：两次 RPC 间的换链窗口、升级路径（上游给 SshFileSystem 加 checkedTarget 时改为覆盖它）。
- 构造器照样 `applyZoneRecheck(this.ctx, neverRoots)`（`app/sdk/src/policy/fs-zone.mjs:45-73`，只用 `ctx.get('fs').resolve`，fs-ssh 下自动远端规范化）；读侧不做 fd 绑定（`/proc/self/fd` 只对本机有效，`app/sdk/src/policy/fs-zone.mjs:103-121`）。
- 包含判定的词法化统一在 D2 处理（containment 一处切换）。
- start.ts：ssh 模式下 `fsSandboxRow` 插 `fs-zone-ssh` 代替 `fs-zone`（同一 `disabled + insert` 形状，`app/sdk/src/start.ts:271-290`）。

**锚点**：`app/sdk/src/policy/fs-zone.mjs:91-100`、`app/sdk/src/policy/fs-zone.mjs:207-224`、`app/sdk/node_modules/@deepseek-ai/dsh-fs-ssh/lib/index.js:93`、`app/sdk/src/policy/shell-ask.mjs:383`、`repos/deepseek-harness/packages/ssh/fs-ssh/README.md:70`。

**验证**（T9b 先红）：r2 改为**绕开 pre-execute 直测 provider**（经 tools 管线测不出这一层——shell-ask 先拒了）。新文件 `app/sdk/tests/e2e/ssh-fs-zone.test.ts`：照 `startSshHost()` 的进程内组合（`app/sdk/tests/support/ssh-host.ts:212` 起的 server + 进程内 Context），挂 `fs-zone-ssh` 代替 `fs-ssh`，policy `workspace-write` / workspaceRoot = 夹具 ws，直接调 `ctx.fs.writeText` / `ctx.fs.editText`：
- ①a 目标 ws 内 → 成功，远端文件内容正确。
- ①b 目标 `/tmp/<夹具前缀>/x` → 抛 `FS_PERMISSION_DENIED`、消息含 `write-outside-workspace denied`，文件不存在。**先红法**：先挂原版 `fs-ssh` 跑同一调用应**写成功**——远端 helper 的 fs-sandbox 围栏用的是 `writableRoots`（= 会话 ws + 显式追加根 + `/tmp` + `os.tmpdir()`，dsh-sandbox lib 239-246，fs-sandbox 在 lib 160 用它），远端 `/tmp` 在围栏内；这正是 P6-25 决策 37 在本机由 zoneGuard 收掉的那个洞。
- ①b′ 目标 `<remoteHome>/x` → 拒（原版远端围栏也拒，此格是回归不是先红）。
- ①c 目标是 ws 内指向 remoteHome 的符号链接 → 拒（resolve 后判定）。
- ①d NEVER：目标 `<remoteHome>/.ssh/x`，mode = `danger-full-access` → 仍拒。
- **变异**：去掉 `writeText` 里的 zoneGuard 调用 → ①b/①d 红；去掉 `editText` 里的 → 对应 edit 格红。
- 产品层回归（非先红）：`ssh-product.test.ts` 经 tools 管线的区内写零卡、区外写拒，保证组合后语义不变。

## D2 guard 的 NEVER 宿主路径在远端的语义

**原版**：box 是 bot 专用机，用户凭证在 Vault（浏览器里填，`PLAN.md` L7 行），box 上没有用户自己的 `~/.ssh`。我们的远端是**用户自己的服务器账户**（本机测试时就是这台机器），远端 `~/.ssh` 是真钥匙——按原版「bot 看不到用户凭证」的意图，远端凭证同样是 NEVER。

**备选**：
1. **只保留宿主根**。拒：真实远程时宿主路径在远端多半不存在，远端 `~/.ssh` 无人管。
2. **把判定挪到远端 helper**。拒：helper 是上游私有协议，不改上游。
3. **（选）宿主根照留 + 加一套远端根，判定仍在宿主 guard，路径经 `ctx.fs.resolve`（ssh 下 = 远端规范化）**。

**结论**：
- 宿主根不动：远端=本机时它们就是远端可达路径（本机测试正是此情形）；真实远程时无害。
- 新配置 `remoteHome`（D13）。`computeRoots` 加纯函数分支 `remoteRoots(remoteHome, remoteRuntimeDir)`：
  - 硬 NEVER：`CREDENTIAL_HOME_ENTRIES` 中**非通配项**逐项拼到 remoteHome 下（`app/sdk/src/policy/never-roots.mjs:11-14`）；宿主不能 `existsSync` 远端路径，所以不展开。**通配项（`.claude*`、`.config/**/credentials*`）不进根清单，由「整棵 remoteHome 软遮蔽」兜底**（r2 改：guard 的 judgePath 只做根包含，不做模式匹配，`app/sdk/src/policy/guard.mjs:145-175`）。代价：落在会话 ws（软遮蔽例外）之内的通配凭证不受保护——与宿主侧同一 ponytail。
  - 软遮蔽：整棵 remoteHome（例外 = 会话 header.cwd 子树，`app/sdk/src/policy/guard.mjs:13-15`）。
  - 写保护（policyRoots）：**远端 helper 安装目录**（r2 改：不是 `Hello.root`——那是 helper 每次连接 `mkdtemp('/tmp/dsh-ssh-')` 建的 socket 临时目录，`app/sdk/node_modules/@deepseek-ai/dsh-ssh/lib/helper.js:558`（勘误 2026-11-06 T15：原写 557，alpha.2 与 rc.1 实测均为 558），Hello 里的 `root` 字段就是它，`app/sdk/node_modules/@deepseek-ai/dsh-ssh/lib/schemas.js:125`）。安装目录 = 配置 `helper` 路径所在的包闭包目录：本机测试里它在 `app/sdk/node_modules` 下，已在宿主 PKG_ROOT 策略根内；真实远程 = T13 推送的版本化目录，作为 `remoteRuntimeDir` 配进来。
- **`remoteHome` 启动校验**（r2 新增）：只信配置会让配错的 remoteHome 悄悄放过远端 `~/.ssh`。guard 插件在 `ctx.ssh.ready` 之后调一次 `ctx.fs.resolve('~')`（fs-ssh 远端展开，`app/sdk/node_modules/@deepseek-ai/dsh-fs-ssh/lib/index.js:30`），与配置的 remoteHome 规范化后比对，不等 → 插件初始化抛错、启动失败（与「guard 行缺失 fail loud」同一风格，`app/sdk/src/start.ts:239-240`）。
- **词法化一处切换**（r2 改）：`containment.mjs` 的 `isPathUnder` 词法不中时会退到宿主 `stat` 比身份（`app/sdk/src/policy/containment.mjs:43-52`），所有调用方（guard、shell-ask `app/sdk/src/policy/shell-ask.mjs:340`、`applyZoneRecheck` `app/sdk/src/policy/fs-zone.mjs:56-60`、fs-zone-ssh）都经过它。在 containment 里按模块加载时读一次 `process.env.P2SDK_SSH_MODE === '1'` 切成纯词法，launcher 的 `childEnv` 在 ssh 模式下设它（这个变量不含秘密，bash 看见无害）。一处改、全部调用方生效，不逐个传参。
- guard、fs-zone-ssh（D1）、远端 wrapper（D4）用同一份远端根，照「一个清单多个消费者」（`app/sdk/src/start.ts:233-241`）。

**锚点**：`app/sdk/src/policy/guard.mjs:9-22`、`app/sdk/src/policy/guard.mjs:145`、`app/sdk/src/policy/never-roots.mjs:119-122`、`repos/deepseek-harness/docs/subsystems/ssh.md:9`、`repos/deepseek-harness/packages/ssh/sandbox-ssh/README.md:68`。

**验证**（T9b 先红）：`ssh-product.test.ts`（产品组合经 tools 管线）：
- ②a 宿主哨兵：测试 HOME 下 `.ssh/id_sentinel`（宿主=远端）→ `read`、`grep`（若 D9 已拒 grep 则只测 read）均拒，正文不出现。
- ②b 远端哨兵：夹具 `remoteHome/.ssh/id_sentinel`（`app/sdk/tests/support/ssh-host.ts:86`）→ `read` 拒。**先红**：不加远端根时 ②b 读到正文。
- ②c 远端 helper 安装目录：`write <helper 所在包目录>/x` → 拒（本机测试下即 PKG_ROOT 写保护，正对照；真实远程版随 T13）。
- ②d remoteHome 配错（故意给夹具 ws 路径）→ 运行时启动失败，stderr 含固定串；先红 = 不加校验时照常启动。
- ②e 词法化：单测 `app/sdk/tests/unit/containment.test.ts` 加格——`P2SDK_SSH_MODE=1` 下，root 为宿主上存在的目录 A、path 为宿主上经符号链接别名指向 A 下的路径 → 返回 false（纯词法）；不设变量 → true（现行为，正对照）。
- 变异：去掉远端根 → ②b 红；去掉启动校验 → ②d 红。

## D3 shell-ask 档位挂哪层

**原版**：档位语义已由 Q-013 定稿（用户逐行确认），与执行位置无关；原版 box 内命令的审批在 local-exec-daemon 里，同属工具层。

**备选**：
1. **ssh 模式下 bash 一律 ASK**。拒：当前消费者是「工程 bot 跑测试」，每条命令出卡不可用；D4 落地后远端 bash 与本机同等受 wrapper 约束。
2. **改 shell-ask 加 ssh 分支**。拒：不需要。
3. **（选）代码不动**。

**结论**：
- 文件档位用 `ctx.fs.resolve` + 会话 workspaceRoot 判区内外（`app/sdk/src/policy/shell-ask.mjs:15-20`），ssh 下自动按远端；包含判定的词法化由 D2 的 containment 一处切换覆盖到 shell-ask。
- bash 第 1 行 sandbox-allow 的成立条件「wrapper 坏 → bash 执行失败，不存在无卡且裸跑」（`app/sdk/src/policy/shell-ask.mjs:8-14`）由 D4 兑现：`sandbox-zone-ssh` 改写不了就抛 `SandboxUnavailableError`，上游 sandbox-ssh 自身失败也统一转这个错误（`app/sdk/node_modules/@deepseek-ai/dsh-sandbox-ssh/lib/index.js:34-37`）。复审已确认此链闭合，前提是 D4 的参数集修正（r2 已改）。
- `permitDir`、档位表、policy-state 实例校验都在宿主，不动（`app/sdk/src/start.ts:303-311`）。

**锚点**：`app/sdk/src/policy/shell-ask.mjs:1-45`、`app/sdk/tests/e2e/tiers-policy.test.ts:1`。

**验证**（T10）：`app/sdk/tests/e2e/ssh-bash.test.ts`：
- ③a policy-state 门开时 bash 写 `$PBOTS_SSH_MARK` → 0 张卡、远端 ws 的文件 = 本轮 mark。
- ③b 门关 → bash 出卡（同本机 `tiers-policy.test.ts`）。
- ③c 变异：`sandbox-zone-ssh` 换回原版 `sandbox-ssh` → ④a 红（证明免卡靠 wrapper）。

## D4 sandbox runner 与联网升权

**原版**：box 内命令由 local-exec-daemon 的 `sand-*` 原生沙箱约束；box 是专用机。我们的远端是用户账户，必须有和本机同等的读遮蔽。

**备选**：
1. **用 helper 自带的 sandbox**。拒：helper 无配置挂 `LocalSandboxProvider`（`app/sdk/node_modules/@deepseek-ai/dsh-ssh/lib/helper.js:541`），上游 bwrap profile 以只读宿主根起头（`repos/deepseek-harness/packages/sandbox/sandbox-local/README.md:77`）——**读不设防**。本机测试时 bot 的 bash 能 `cat` 宿主 `~/.ssh`，A4 矩阵整组倒退（复审已核实属实）。
2. **给 helper 配 runnerCommand**。拒：helper 构造时不收 sandbox 配置（同锚点），要改上游。
3. **（选）宿主侧继承 `SshSandboxProvider`，改写远端返回的 argv**：远端给的是 `[<bwrap>, …profile…, --, cmd]`，把 argv[0] 换成 wrapper 调用（wrapper 的调用形态正是「bwrap profile 参数 -- 命令」，`app/sdk/sandbox/bwrap-wrap.py:6-9`，自己 exec `/usr/bin/bwrap`，`app/sdk/sandbox/bwrap-wrap.py:35`）。

**结论**：
- 新增 `app/sdk/src/policy/sandbox-zone-ssh.mjs`（上游类 41 行，`app/sdk/node_modules/@deepseek-ai/dsh-sandbox-ssh/lib/index.js:16-38`）。`confine()` = `super.confine()` → 校验 argv[0] 基名 `bwrap` 且 `enforcement === 'full'`，否则抛 `SandboxUnavailableError` → 改写 argv → `runnerFailureRules` 追加 `bwrap: `（`app/sdk/src/start.ts:226-229`）。
- **参数集（r2 改）= 宿主 `sandboxRow` 的完整 wrapper 参数 ∪ 远端根**：把 `sandboxRow` 里组 argv 的那段（`app/sdk/src/start.ts:215-224`：`--home`/`--mask`/`--never`/`--tool`/`--policy`/`--permit-root`/`--slirp`）抽成 `wrapperArgv(cfg)`，本机 sandbox 行与 `sandbox-zone-ssh` 共用；ssh 模式再追加 D2 的远端根（`--home <remoteHome>`、`--mask <remoteHome>`、远端硬根 `--never`、`--policy <remoteRuntimeDir>`）。wrapper 对不存在的路径直接跳过（`app/sdk/sandbox/bwrap-wrap.py:72-81`），所以真实远程时宿主独有路径多传无害；本机测试时宿主根就是要挡的东西（r1 只传远端根，④a 会恒红——复审发现）。
- **不得把 helper 的 socket 临时目录（`Hello.root`）当 `--policy` 传**：wrapper 的 `--policy` 挂回排在 `--tmpfs /tmp` 之后（`app/sdk/sandbox/bwrap-wrap.py:345-353`），会把 `/tmp/dsh-ssh-*` endpoint 目录露回沙箱。它本来在私有 tmpfs 下不可见，保持不可见。
- 远端 wrapper 路径：本机测试 = 宿主 `app/sdk/sandbox/bwrap-wrap.py`；真实远程 = 随 helper 推送并校验 sha256（T13）。远端缺 `python3` 或 `/usr/bin/bwrap` → fail closed。
- `danger-full-access` 时 consumer 绕过 `confine()`（`repos/deepseek-harness/packages/ssh/sandbox-ssh/README.md:30`），与本机同语义。
- **联网**：wrapper 恒 `--unshare-net`，许可命中才由 wrapper 内 supervisor 接 slirp4netns（`app/sdk/sandbox/bwrap-wrap.py:19-25`）。本机测试：`--permit-root` 与 `--slirp` 是同机路径，request_network 照常可用。真实远程：远端无许可 → 恒断网（fail closed）；要联网时把 permit 目录与 slirp 推到远端，记入 T13。

**锚点**：`repos/deepseek-harness/packages/ssh/ssh/src/helper.ts:34`、`app/sdk/node_modules/@deepseek-ai/dsh-sandbox-ssh/lib/index.js:16`、`app/sdk/src/start.ts:202-231`、`app/sdk/tests/e2e/w1ap0-matrix.test.ts:1`。

**验证**（T10 先红）：`ssh-bash.test.ts`：
- ④a bash `cat <测试 HOME>/.ssh/id_sentinel`（宿主哨兵）→ 退出非零、不含正文。**先红**：T9 组合（原版 sandbox-ssh）下读到正文。
- ④b bash `cat <remoteHome>/.ssh/id_sentinel` → 同上被挡。
- ④c（r2 改）bash `ls -d /tmp/dsh-ssh-*` → 沙箱内为空（endpoint 目录不露出）；bash `touch <helper 所在包目录>/x` → 失败（写保护；本机测试下属 PKG_ROOT 策略根）。
- ④d 变异：`sandbox-zone-ssh` 直通 super 不改写 → ④a/④b 红；只传远端根（r1 写法）→ ④a 红。
- ④e 单测 `app/sdk/tests/unit/sandbox-zone-ssh.test.ts`：stub `super.confine` 返回 argv[0] 非 bwrap、或 `enforcement:'partial'` → 抛 `SandboxUnavailableError`；返回 bwrap → 结果 argv 以 `python3 -I <wrapper>` 开头、含宿主与远端两套 `--home`、`--` 之后与原 argv 逐元素相同。

## D5 P6 worker cwd 与远端 ws

**原版**：原版 bot 的工作目录在各自 box 里（D12）；我们的 P5-25 约定 cwd 由 main 强制为 `$PBOTS_DATA_DIR/workspaces/<botId>`、header.cwd 不可变（`app/ui/main/m3-meta/orchestrate.ts:4-7`）。

**备选**：
1. **远端用宿主同名路径**。拒：远端账户未必有该目录；本机测试时与宿主数据根（guard 的 mask 根）重叠，测不出判错侧。
2. **main 自己 ssh 上去建目录**。拒：main 多持一条 ssh 连接与身份。
3. **经 `ctx.fs` 建目录**。拒（r2 新增）：dsh `FileSystem` 没有 mkdir（基类只有 watch 等，`app/sdk/node_modules/@deepseek-ai/dsh-fs-ssh/lib/index.js:25-110` 全部方法里无 mkdir，helper 协议也无）。
4. **（选）SDK 新 RPC `p2sdk/workspace.ensure`**：SDK 侧用 `ctx.subprocess.spawn({argv:['mkdir','-p','--',path]})`（ssh 下即远端执行，固定 argv、无 shell、不经模型），执行前词法校验 path 在 `<remoteRoot>/workspaces/` 下、末段匹配 botId 形状。

**结论**：
- **main 怎么知道 ssh 模式与 remoteRoot**（r2 新增）：同一个 RPC 插件再给一个 `p2sdk/workspace.root` → `{mode:'local'} | {mode:'ssh', root:'<remoteRoot>/workspaces'}`；main 连上 dsh 后问一次缓存（launcher 配置是唯一源，main 不另读 env）。
- **三条建会话路径的覆盖**（r2 改）：#4 走 p2temp（`app/ui/main/m3-meta/orchestrate.ts:172`），#3 直调 `session/create`（`app/ui/main/m3-meta/orchestrate.ts:222`），`createWorkerBot` 也直调（`app/ui/main/m3-meta/orchestrate.ts:366`）——三者**都先调 `mintWorkspace`**（`app/ui/main/m3-meta/orchestrate.ts:81-91`，createWorkerBot 在 :344 起）。所以改一处：`mintWorkspace` 按模式分支——local 照旧宿主 mkdir；ssh 用 `workspace.root` 拼路径并调 `workspace.ensure`，失败 → `pbots/storage`（同现有错误码）。不碰 p2temp。
- **worker 继承发起者 cwd**（Q-024 A）的实现是 P6-24，目前 blocked、未合并（r2 改：r1 写成现状是错的）。T11 依赖 P6-24；P6-24 合并前 worker 仍自建工作区，同样经 `mintWorkspace`，已被上一条覆盖。
- 本机测试里 `remoteRoot` 放夹具目录下，与宿主 `$PBOTS_DATA_DIR` 分开。

**锚点**：`app/ui/main/m3-meta/orchestrate.ts:80-91`、`app/ui/main/m3-meta/orchestrate.ts:344`、`repos/deepseek-harness/docs/subsystems/ssh.md:27`。

**验证**（T11 先红）：app/ui e2e `tests/e2e/ssh-workspace.spec.ts`（产品 + 夹具 sshd）：
- ⑤a 经 #3、#4 各建一个 bot → 远端 `<remoteRoot>/workspaces/<botId>` 存在，宿主 `$PBOTS_DATA_DIR/workspaces/<botId>` **不存在**。先红：现状宿主 mkdir。
- ⑤b 该 bot 的 bash 写 marker → 落远端 ws。
- ⑤c 主 bot 委派 worker → worker 工作区在远端、宿主无新目录（P6-24 合并后再加「继承发起者 cwd」格）。
- ⑤d `workspace.ensure` 传 `<remoteRoot>/workspaces/../x` 或非 botId 形状 → 拒、远端无新目录。

## D6 进程级 vs preset `isolate`

**原版**：box 按 agent 记账（D12），是否多 bot 共用不可见；需求原话「把一台 ssh 主机当作 bot 的电脑」「bot 共用一台电脑」（`work/p9-dsh-integration/BRIEF.md:10`、`work/p9-dsh-integration/BRIEF.md:26`）。

**备选**：
1. **preset 里 isolate 出一组 fs/subprocess/sandbox**。拒：上游明文 preset 的服务提供者与消费者必须同一 `cordis:group` 隔离域，`agent.ctx` 等普通查找仍取 Host realm（`repos/deepseek-harness/packages/preset/agent-preset-registry/README.md:58`）；而 `subprocess`/`sandbox`/`sandbox-policy`/`bash-sandbox` 四行在 base 顶层（`repos/deepseek-harness/packages/bundle/base/cordis.patch.yml:234`、`:240`、`:243`、`:249`），工具行 `tool-bash`（`repos/deepseek-harness/packages/bundle/base/cordis.patch.yml:281`）、`tool-fs`（:295）、`working-directory`（:166）也在顶层。整套搬进每个 preset 组 = 重写组合。
2. **两套 dsh 运行时**。拒（本期）：P6 编排、跨 bot 投递、M1/M2 都假设一个运行时。
3. **（选）进程级**。

**结论**：进程级。代价：不能部分 bot 本机、部分远端；切换电脑影响所有已有 bot（header.cwd 宿主路径、不可变）→ **Q-029**，T11 前默认 A。

**锚点**：`repos/deepseek-harness/packages/preset/agent-preset-registry/README.md:58`、`repos/deepseek-harness/docs/user/develop/framework/service.md:111-139`。

**验证**：进程级由 `ssh-product.test.ts` 覆盖（两个 bot 的 bash marker 都落远端）。Q-029 A 由 T11 加格 ⑥：header.cwd 不在远端 root 下的旧会话发 bash → 被拒、结果含固定提示串、两侧无新文件；先红 = 不加判定时报的是 cwd 不存在类错误而非提示串。

## D7 断连「结果未知」在 UI 怎么表达

**原版**：0.78.1 有「Connection lost」（`xIgsFr`）与「Reconnecting」（`BakXLg`）文案，box 重连由服务端管（实测计数 `work/tickets/evidence/T5/d7-disconnect-copy.txt`）。

**备选**：
1. **维持现状**（工具行 failed + 「回复失败：SSH connection is closed」）。拒：没告诉用户那一步可能已做；连接不重连（`repos/deepseek-harness/docs/subsystems/ssh.md:23`），之后所有 bot 每次远端操作都失败。
2. **自动重连并重放**。拒：上游刻意不重放，重放可能已执行的 `rm`/`git push` 是数据风险。
3. **launcher 监控 dsh 子进程退出就重启**。拒（r2 新增）：ssh 断开后**dsh 进程仍活着**，终止的只是那一轮（T4 回执 §5-1），launcher 看不到任何退出。
4. **（选）main 按事件流识别 + 用户点「重新连接」**。

**结论**：
- 形态（T4 实测，`work/tickets/receipts/T4.md:59`）：在跑工具 `Error: SSH helper disconnected; outcome is unknown`，随后 turn/end `reason.kind:"error"`、`SSH connection is closed`。
- 渲染：`endNotice`（`app/ui/renderer/session/reduce.ts:132-139`）认出这两个固定串时，通知换成「电脑连接已断开。上一步可能已执行，也可能没执行——先看看结果再决定要不要重试。」并带「重新连接」按钮；工具行原文不改。
- **重启触发（r2 定义）**：main 侧已消费每个 bot 的事件流；任一会话出现上述 turn/end 即把运行时标为「电脑断开」（全局一次，所有 bot 共用一条连接），各 bot 的发送按钮进入离线态（`useOnline()` 现有机制）。**不自动重启**：重启 = 停止并重新拉起 dsh 运行时，会打断其他 bot 正在流式输出、尚未碰到远端的回合；由用户点「重新连接」确认。之后可加「全部 bot 空闲时自动重连」（`ponytail:` 注释）。
- 重启实现复用 launcher 现有的停止/启动路径（T12 第一步先定位；没有现成路径就停下回执，不自建进程管理）。会话从 jsonl 恢复，不重放任何回合。原版「Reconnecting」文案用作重启中的状态。

**锚点**：`app/ui/renderer/session/reduce.ts:132`、`app/ui/renderer/fold/turn-fold.ts:73-76`、`repos/deepseek-harness/packages/ssh/ssh/README.md:66`。

**验证**（T12 先红）：
- ⑦a 单测 `app/ui/tests/unit/session/end-notice-ssh.test.ts`：喂 T4 回执两条原样事件 → 通知含「可能已执行」与重连动作；普通错误仍是「回复失败：…」。先红：现状文本。
- ⑦b e2e（夹具 sshd）：杀 ssh master → bot A 的那一轮报断连；bot B 在**同一时刻**处于流式输出中且未调用工具，断连时不被打断；点「重新连接」后出现新 dsh PID、下一条消息能完成；断连那一轮在恢复后的 transcript 里调用计数 = 1（未重放）。

## D8 PTC：接 `ctx.ssh.ptcLaunch` 还是继续禁用

**原版**：原版 workflow / 程序化工具调用跑在 box 内，与执行位置一致；我们没有对应的远端 worker。

**备选**：
1. **node-script + 推 bootstrap**。拒（本期）：当前消费者不用 workflow。
2. **executable 部署取内嵌 worker**。拒：上游 release 无 asset（D10），自建工具链重（`repos/deepseek-harness/packages/ssh/ssh-helper-runtime/README.md:45`）。
3. **逐个 preset 改写嵌套行**。拒（r2 新增）：嵌套行在 preset 的 `config.plugins` 里，不是 loader 条目，按 id 覆盖够不着；要在 ssh 模式重写 approval.yml / presets.yml / p6-reply-style.yml 的整段 preset 行，三份手抄副本易漂移。
4. **（选）禁 base 依赖行**：禁 `ptc-runtime`（及 T4 已验的 `workflow-ptc`、`tool-workflow`、`tool-executor-ptc` 三行，`app/sdk/tests/e2e/ssh-headless.test.ts:88-95`）。preset 嵌套的 `workflow-ptc` 依赖 PTC 运行时服务，服务缺失时等待不激活（agent-preset-registry：等待 Host 服务的行保持挂载、不绑定，`repos/deepseek-harness/packages/preset/agent-preset-registry/README.md:60`）。

**结论**：选 4。嵌套出现处（复审枚举，供测试对照，不写进代码）：`app/sdk/profile/patches/approval.yml:165-170`、`app/sdk/profile/patches/approval.yml:288-293`、`app/sdk/profile/patches/approval.yml:421-427`、`app/sdk/profile/patches/p6-reply-style.yml:128-133`。**测试不写死清单**，从组合后的 profile 枚举全部 preset。

**锚点**：`repos/deepseek-harness/packages/ssh/ssh/README.md:50`、`repos/deepseek-harness/packages/bundle/base/cordis.patch.yml:396-404`、`app/sdk/profile/patches/approval.yml:149`。

**验证**（T9a）：`ssh-product.test.ts` ⑧：从 start.ts 实际传给 dsh 的 `--patch` 列表里收集所有 `dsh-agent-preset` 行的 `config.id`（即组合后 profile 的 preset 全集），每个 preset 建一个会话，fake 记录的首请求 tools 均不含 `workflow`。**先红**：只禁 T4 的三行、不禁 `ptc-runtime` 时，若有 preset 仍出现 `workflow` 即红；若始终不出现（依赖链比预期更早断），回执如实写明并保留该格作回归。变异：恢复 `ptc-runtime` → ⑧ 红。

## D9 宿主直连行逐条去留（含 ssh bot 的 skill 启用落点）

**原版**：这些能力原版都在 box 内（skill 扫描 `.agents/skills`，`work/p9-dsh-integration/RE-skills.md:24`）；按「执行坐标在哪台电脑就在哪台看」定去留。逐包 grep 见 `work/tickets/evidence/T5/d9-host-direct.txt`（实测）。

**备选**（每行三选一）：留 / 禁 / 换远端版。`tool-fs-search` 专门的禁法另列三种：禁 base 行（拒：它还嵌在 5 个 preset 里——`app/sdk/profile/patches/approval.yml:91`、`:218`、`:347`、`app/sdk/profile/patches/p6-reply-style.yml:54`、`app/sdk/profile/patches/presets.yml:38`，r2 复审补全）；重写 preset 行（拒，同 D8 备选 3）；**（选）guard 工具名拒**——guard 已有工具名 NEVER 机制（`NEVER_TOOLS`，`app/sdk/src/policy/guard.mjs:38`、`app/sdk/src/policy/guard.mjs:242`），ssh 模式下由 guard 行配置追加 `glob`、`grep`，pre-execute 最外层直接拒，不出卡。代价：工具仍出现在清单里，模型调用会收到固定拒绝串（提示改用 bash）。

**结论**：

| 行 | 做什么 | ssh 下 | 理由 / 锚点 |
|---|---|---|---|
| `tool-fs-search` | glob/grep：宿主解析 `@vscode/ripgrep` 路径再经 `ctx.subprocess` 起 | **guard 工具名拒** | 宿主 rg 路径交远端执行，本机测试碰巧能用、真实远程必挂；上游自述远程 fs 需要同址工作区（`repos/deepseek-harness/packages/fs/tool-fs-search/README.md:228`；`repos/deepseek-harness/packages/fs/tool-fs-search/src/search-core.ts:171`、`repos/deepseek-harness/packages/fs/tool-fs-search/src/search-core.ts:239`） |
| `attachment-local` | 用户上传图片存 `DSH_HOME/attachments`（宿主） | 留 | 会话存储本就在宿主（`repos/deepseek-harness/docs/subsystems/ssh.md:5`） |
| `spill-local` | 超长结果落宿主 tmpdir、回模型一个路径 | 留；真实远程换后端 | locator 需同址 fs 消费者（`repos/deepseek-harness/packages/spill/spill-local/README.md:127`）；T13 写经 `ctx.fs` 落远端的 SpillStore |
| `agent-instructions` | 读 AGENTS.md | 留 | 有 `ctx.fs` 时走 provider，node:fs 仅无 provider 回退 |
| `skill-filesystem` | 扫 skill 根、读 SKILL.md | 留 | 发现与读取走 `ctx.fs`（`repos/deepseek-harness/packages/skill/skill-filesystem/README.md:99`），project 根即远端 ws；宿主 chokidar（`repos/deepseek-harness/packages/skill/skill-filesystem/src/index.ts:498`）对远端无效、fs-ssh 不支持 watch（`repos/deepseek-harness/packages/ssh/fs-ssh/README.md:70`）→ 只剩 write/edit 直接失效这条刷新路 |
| `shell-env` | 给 bash 注入 `DSH_*` | 留 | 只是变量（`repos/deepseek-harness/packages/bundle/base/cordis.patch.yml:278`） |

**ssh bot 的 skill 启用副本落点**：远端 `<remoteRoot>/workspaces/<botId>/.dsh/skills/<name>/`。约束：
1. T7a 的 main 侧本机 `fs.cp` 在 ssh 模式下**必须拒**（`pbots/unavailable`，提示「远程电脑模式下暂不支持」）——main 用 D5 的 `workspace.root` 判模式。否则副本写进宿主一个 dsh 不扫的地方，UI 显示成功、bot 用不到。
2. 真正支持时（T11）：复制挪到 SDK 侧，经 `ctx.fs` 读源、`writeText` 写目标（走 D1 的 zoneGuard，policy 的 workspaceRoot 取目标 bot 的远端 ws）；目录用 D5 的 `workspace.ensure` 同法建；校验规则（符号链接、256,000 字符、250 条、`-2`）原样搬过去。
3. 无 watcher：已开始的会话要等下一次失效才看到；ssh 版 e2e 沿用「B 首请求前启用」测法，并加一格「已开始会话的 B 下一轮能否看到」，看不到就在 UI 写「新会话生效」。

**锚点**：表中各行；`work/tickets/doing/T7a-l4c-skill-enable-api.md:1`。

**验证**：
- T9a ⑨：同 ⑧ 的 preset 全集，每个 preset 的会话调用 `grep {pattern:'x'}` → 结果为固定拒绝串、夹具 sshd 侧无 rg 进程被拉起（`clientPids()` 之外的远端进程用 `/proc/*/cmdline` 含 `ripgrep` 计数 = 0）。先红：不加工具名拒时 grep 正常返回。变异：去掉 `grep` 名 → ⑨ 红。
- T11 ⑨b：ssh 模式 `pbots.skills({op:'enable'})` → 先红（T7a 现状在宿主复制并返回 ok），修后 `pbots/unavailable` 或（SDK 侧复制完成后）远端出现副本、宿主无新目录。

## D10 真实远程主机怎么装 helper

**原版**：原版 box 由 xAI 托管，无对应。

**备选**：
1. **上游 release 附的 `dsh-ssh-helper-<ver>-<platform>-<arch>.tar.gz`**（`repos/deepseek-harness/packages/ssh/ssh-helper-runtime/README.md:45`）。拒：**实测 37 个 release 全部 `assets=0`**，发布工作流默认 `publish=false`，npm 无 `@deepseek-ai/dsh-ssh-helper-runtime`（E404）——原样输出 `work/tickets/evidence/T5/d10-release-assets.txt`。
2. **自建 executable 包**。拒（本期）：工具链重，只有接 PTC 时才值。
3. **远端 `npm install`**。拒：远端要 npm 与外网。
4. **（选）node-script 闭包推送**：宿主 `npm install --prefix <stage> @deepseek-ai/dsh-ssh@<钉版>`（现装 0.2.2-alpha.2，exports 含 `./helper`，见证据文件），整目录推到远端版本化目录（在 workspace 与 bwrap 私有 /tmp 之外，`repos/deepseek-harness/packages/ssh/ssh/README.md:36`），远端只需 Node 24；`helperHash` 宿主算，连接时 dsh 校验。该目录即 D2/D4 的 `remoteRuntimeDir`（写保护），D4 的 wrapper 同次推送。

**结论**：选 4，落 T13；开单前向用户要真实主机（届时写 Q）。远端 `node --version` 不是 24 就停。

**锚点**：`work/tickets/evidence/T5/d10-release-assets.txt`、`repos/deepseek-harness/packages/ssh/ssh/README.md:32-48`、`repos/deepseek-harness/packages/ssh/ssh-helper-runtime/README.md:28-45`。

**验证**（T13）：安装脚本推到一个与宿主 node_modules 不同路径的远端目录 → 夹具改指推送后的 helper → T4 headless 四格全绿；变异：篡改远端 `helper.js` 一字节 → 连接被拒（hash 不符）。

## D11 宿主强杀残留 `/tmp/dsh-ssh-*`

**原版**：无对应（云 box）。

**备选**：
1. **启动期清扫**。拒：目录名不带进程归属，会碰别的测试或建立中的连接（`work/p9-dsh-integration/PLAN.md:59`）。
2. **改 dsh-ssh 目录位置**。拒：上游写死（`work/p9-dsh-integration/PLAN.md:53`）。
3. **（选）维持不扫**，测试钉住「残留只是空目录」。

**结论**：维持。强杀时 dsh 子进程随 launcher 退出，ssh master 随之消失，留空 0700 目录、无套接字、无进程。

**锚点**：`work/p9-dsh-integration/PLAN.md:59`、`work/tickets/receipts/T4.md:43`。

**验证**（T9a）：`ssh-product.test.ts` ⑪：SIGKILL launcher 后，新增 `/tmp/dsh-ssh-*` ≤ 1、目录为空、端口拒连。

## D12 一台电脑每账户还是每 bot

**原版**：box 状态按 agentId 记账，查询/确保用槽内 `boxId`；多 agent 是否共用同一 boxId **静态不可见（未找到）**。实测计数 `work/tickets/evidence/T5/d12-box-per-agent.txt`。

**备选**：
1. **每 bot 一台**。拒：需 D6 选项 2；BRIEF 原话「共用一台电脑」。
2. **（选）每运行时一台**。
3. **再做 RE**。拒：分配在服务端，客户端无更多可挖。

**结论**：每运行时一台，不问用户（PLAN §5-6 已预判，`work/p9-dsh-integration/PLAN.md:87`）。

**锚点**：`work/tickets/evidence/T5/d12-box-per-agent.txt`、`work/p9-dsh-integration/BRIEF.md:26`。

**验证**：无独立测试（由 D6 的两 bot 落远端格覆盖）。

## D13 产品化形态

**原版**：无对应（用户不配置 box）。

**备选**：
1. **静态 `profile/patches/ssh.yml`**。拒：要绝对 file URL、helper 路径与 hash、远端 ws/HOME 等运行时值（`app/sdk/src/start.ts:331-336`）。
2. **每 bot 配置（bots.json）**。拒：D6 进程级。
3. **（选）`start.ts` 生成**：`resolveConfig` 读 launcher 侧 env——`P2SDK_SSH_HOST`（OpenSSH 别名）、`P2SDK_SSH_REMOTE_ROOT`、`P2SDK_SSH_REMOTE_HOME`、`P2SDK_SSH_HELPER`、`P2SDK_SSH_HELPER_HASH`、`P2SDK_SSH_NODE`、（真实远程）`P2SDK_SSH_RUNTIME_DIR`——给齐才进 ssh 模式，缺一个启动失败；`writeRuntimePatch` 追加 `sshRows(cfg)`。

**结论**：
- 生成行 = T4 验证过的组合（`app/sdk/tests/e2e/ssh-headless.test.ts:76-131`）减重复 llm-replay，改插 `fs-zone-ssh`、`sandbox-zone-ssh`，加禁 `ptc-runtime`、guard 配置追加远端根与 `glob`/`grep` 工具名拒，`sandbox-policy.workspaceRoot` 指 `remoteRoot`。本机 `sandbox` 行不生成（`sandbox` 被禁用）。
- 这些 `P2SDK_SSH_*` 是 launcher-only，**不进 dsh 子进程 env**（照 `P2SDK_SANDBOX_MASK`，`app/sdk/src/start.ts:160-168`）；唯一例外是 D2 的 `P2SDK_SSH_MODE=1`（无值内容，只是开关）。
- 身份：只给 OpenSSH 别名，私钥 / known_hosts 留在用户 OpenSSH 配置；dsh-ssh 开 `BatchMode`、严格 host key、关 agent forwarding（`repos/deepseek-harness/packages/ssh/ssh/README.md:34`）。OpenSSH 不看 `$HOME`（`work/p9-dsh-integration/PLAN.md:50`），产品就要用真实 ssh 配置，测试才用 PATH 包装隔离。
- **T4 死代码**：`app/sdk/tests/e2e/ssh-headless.test.ts:111-122` 重复插了 llm-replay（`replay.patch.yml` 另有一份，`app/sdk/tests/e2e/ssh-headless.test.ts:133-148`），经理实测删后 14/14。**T9a 第一步删这 12 行**，回执贴删后 `ssh-headless + ssh-host` 14 passed，并复核 `warning: 1 entry did not activate` 是否消失（消失 = 就是它；不消失写进回执，不据此下普遍结论）。

**锚点**：`app/sdk/src/start.ts:336-370`、`app/sdk/tests/e2e/ssh-headless.test.ts:111`。

**验证**（T9a）：`app/sdk/tests/unit/start.test.ts` 加格：① `P2SDK_SSH_*` 给齐 → runtime patch 含 `fs-zone-ssh`、`sandbox-zone-ssh`、`- id: ptc-runtime\n  disabled: true`，不含本机 wrapper 的 `id: sandbox\n  config`；② 缺一个 → `validateConfig` 报错；③ `childEnv` 不含 `P2SDK_SSH_HOST` 等，含 `P2SDK_SSH_MODE=1`。

---

## 实现单拆分

写进 `work/tickets/queue.md` 计划行，只有 T9a 标「可开」（r2：T9 按复审建议拆两张）：

| 单 | 内容 | 覆盖 D | 依赖 |
|---|---|---|---|
| **T9a** | 组合骨架：删 T4 重复 llm-replay；`P2SDK_SSH_*` + `sshRows`（先插原版 fs-ssh/sandbox-ssh）；禁 `ptc-runtime` 等；guard 工具名拒 `glob`/`grep`；`ssh-product.test.ts` ⑧⑨⑪ + start 单测 | D8 D9(工具) D11 D13 | T5 验收 |
| T9b | 文件工具安全：`fs-zone-ssh`（writeText/editText）、guard 远端根 + remoteHome 启动校验、containment 纯词法开关；`ssh-fs-zone.test.ts` ①、`ssh-product.test.ts` ②、containment 单测 | D1 D2 | T9a |
| T10 | 远端 bash：`wrapperArgv` 抽取 + `sandbox-zone-ssh` + 单测；`ssh-bash.test.ts` ③④ | D3 D4 | T9b |
| T11 | main 侧：`workspace.root/ensure` RPC、`mintWorkspace` 分支、Q-029 旧 bot、T7a ssh 拒 → SDK 侧复制 | D5 D6 D9(skill) | T10、T7a、Q-029、P6-24 |
| T12 | 断连：`endNotice` 文案 + 「重新连接」+ 复用 launcher 重启路径 | D7 | T9a |
| T13 | 真实远程：helper 闭包推送、wrapper/slirp 推送、远端 SpillStore、远端 PATH 核对 | D4(联网) D9(spill) D10 | 用户提供主机 |

## 新 Q

- **Q-029**（`work/QUESTIONS.md`）：开启「远程电脑」后已有本机 bot 怎么办（D6）。

## 未核实到底（如实）

1. D1 ①b 先红依据是读装包源码（fs-sandbox 围栏用含 `/tmp` 的 `writableRoots`），未实跑；T9b 首跑即实证，若原版 fs-ssh 写 `/tmp` 被拒则改用 ①c（符号链接）作先红并回执说明。
2. D8 嵌套 `workflow-ptc` 在 `ptc-runtime` 禁用后是否真不激活，依据是 agent-preset-registry README 的等待语义，T9a ⑧ 实测定。
3. D7 原版「Connection lost」在 APP 里的使用点没追到；T12 的 launcher 重启路径未定位。
4. D9 bash 传给远端 spawn 的 env 是否带宿主 PATH（T13 核对）；D4 ForceCommand 改写的 HOME 对 wrapper 无影响（wrapper 只认显式参数，T10 实测确认）。
