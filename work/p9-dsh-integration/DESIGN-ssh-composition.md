# DESIGN · ssh 族 × 我们安全层的组合（T5 / L8-c）

> manager (Opus 5.5) 执笔 · 2026-11-06 · 起点 HEAD b3983512 · 工单 `work/tickets/open/T5-l8c-ssh-composition-design.md`
> 输入：p9 `PLAN.md` §2/§3/§5、`work/tickets/receipts/T4.md` §5 与经理核实、上游 `repos/deepseek-harness@ce7073d`（与产品钉版 0.2.2-alpha.2 语义一致处引源码，行号以 repos 为准；装包实物另引 `app/sdk/node_modules/@deepseek-ai/*`）。
> 原版锚点：0.78.1 解包树 `/dev/shm/grok-re/0.78.1/app/dist/`，用 `LC_ALL=C grep -a -c -F '<字面串>' <文件>` 复核。
> 当前消费者只有一个：BRIEF 验收第 1 条「工程 bot 在 ssh 主机（先是本机）上改代码跑测试，结果回到对话」（`work/p9-dsh-integration/BRIEF.md:37`）。真实远程主机不是当前消费者，凡只为它的结论都标「真实远程」并落到最后一张实现单。

## 0 结论表

| D# | 一句结论 | 落到 |
|---|---|---|
| D1 | fs-zone 不换不丢：照现有「继承上游 provider」写法新增 `fs-zone-ssh.mjs` 继承 `SshFileSystem`，复用 `applyZoneRecheck` 与 zoneGuard 判定；可写根只认远端会话 ws（不放远端 /tmp）；包含判定在 ssh 模式只走词法 | T9 |
| D2 | guard 保留宿主 NEVER 根（远端=本机时它们就是远端路径），另加一套**远端根**：由 ssh 配置的 `remoteHome` 套同一份 `CREDENTIAL_HOME_ENTRIES` + 整棵 remoteHome 软遮蔽（会话 ws 例外）+ helper 根写保护；判定继续用 `ctx.fs.resolve`（ssh 下即远端规范化） | T9（文件工具）、T10（bash 同源） |
| D3 | shell-ask 代码不动：文件档位经 `ctx.fs.resolve` 天然按远端判；bash 的 sandbox-allow（免卡）以 D4 远端 wrapper 生效为前提，wrapper 起不来即 `SANDBOX_UNAVAILABLE` fail closed，不存在无卡裸跑 | T10 |
| D4 | 远端 bash 必须套我们的 bwrap wrapper：新增 `sandbox-zone-ssh.mjs` 继承 `SshSandboxProvider`，把远端返回的 bwrap argv 改写成「`python3 -I <wrapper> --home/--mask/--never … <profile> -- cmd`」；远端非 bwrap（Landlock 等）→ 拒。联网升权本机测试照旧可用，真实远程默认断网 | T10 |
| D5 | ssh 模式下 bot 工作区 = `<remoteRoot>/workspaces/<botId>`（字符串由 main 算），建目录走 SDK 侧 `ctx.fs`（fs-ssh），main 不持 ssh；worker 按 Q-024 继承发起者 cwd，同样是远端路径 | T11 |
| D6 | **进程级**：一个 dsh 运行时 = 一台电脑；preset `isolate` 做不到（consumer 与 `agent.ctx` 仍取 Host realm）。既有本机 bot 在切换后怎么办 → **Q-029** | T9 起全部；Q-029 |
| D7 | 断连：工具行 failed 原文 +「回复失败」通知已诚实（现状）；补一条专用通知「电脑连接已断开，这一步可能已执行也可能没执行」，并由 launcher 重启 dsh 运行时重建连接，不重放任何回合 | T12 |
| D8 | PTC / workflow 在 ssh 模式继续禁用（含 approval.yml 各 preset 里嵌套的 `workflow-ptc` / `tool-workflow` 行）；当前消费者不需要，上游也没有可用的 executable 包 | T9 |
| D9 | 逐行：`tool-fs-search` 禁（rg 路径取宿主）；`attachment-local` 留；`spill-local` 留（真实远程需另写后端）；`agent-instructions` 留（走 ctx.fs）；`skill-filesystem` 留但 watcher 失效、靠 write/edit 直接失效；`shell-env` 留。**ssh bot 的 skill 启用副本落点 = 远端 `<remoteRoot>/workspaces/<botId>/.dsh/skills/<name>/`，T7a 的 main 侧本机复制在 ssh 模式下必须拒（`pbots/unavailable`），改由 SDK 侧经 ctx.fs 复制** | T9（禁行）、T11（skill 落点） |
| D10 | 实测 37 个 release **全部 0 个 asset**，npm 也没有 helper-runtime 包 → 真实远程用 node-script：宿主侧 `npm install --prefix` 出 dsh-ssh 依赖闭包、整目录推到远端版本化目录、远端 Node 24、hash 由 dsh 连接时校验 | T13 |
| D11 | 维持「不扫」（PLAN §3-10）：强杀只留空 0700 目录、无套接字；加一条回归格证明这一点，不加清扫 | T9（回归格） |
| D12 | 0.78.1 box 状态按 agentId 记账、按槽内 boxId 查询；是否多 bot 共用同一 box 静态不可见。与 BRIEF L8「bot 共用一台电脑」及 D6 进程级一致，不问用户 | — |
| D13 | ssh 行由 `start.ts` 的 `writeRuntimePatch` 按启动配置生成（`P2SDK_SSH_*`，launcher 侧消费），不进静态 profile；身份只用 OpenSSH 别名，私钥留在 OpenSSH；**T9 第一步删 `ssh-headless.test.ts:111-122` 的重复 llm-replay** | T9 |

---

## D1 fs 层：fs-zone 换成 fs-ssh 还是包一层

**原版**：原版 bot 的文件工具跑在云 box 里（local-exec-daemon 在 box 内，`RE-skills.md` 背景段），box 是 bot 专用机，没有「区外写出卡/拒」这一层可对照。我们的区域语义（区内写零卡、区外写一律拒、执行期复判）是 P6-25 的自定规格（Q-013 / 决策 37），ssh 模式下照旧适用。

**备选**：
1. **直接换成 fs-ssh**（只靠 shell-ask 预执行判定 + 远端 fs-sandbox 围栏）。拒：远端 helper 用上游 fs-sandbox（`app/sdk/node_modules/@deepseek-ai/dsh-ssh/lib/helper.js:535`），它的可写根照样含 `/tmp`（P6-25 决策 37 的那个洞，`app/sdk/src/policy/shell-ask.mjs:21`）；本机测试时远端 `/tmp` 就是宿主 `/tmp`。预执行判定与真正写入之间换链（TOCTOU）也没人兜。
2. **只在 tools/execute 包一层**（不碰 provider）。拒：`writeText/editText` 的最终目标只在 provider 的 `checkedTarget` 里 fresh resolve 一次，外层拿不到「写入时的身份」，复判不住换链。
3. **（选）继承 fs-ssh 的 provider 类**，与现有 `ZoneCheckedFileSystem extends SandboxedFileSystem` 同一写法（第 2 级集成）。

**结论**：新增 `app/sdk/src/policy/fs-zone-ssh.mjs`：`class ZoneCheckedSshFileSystem extends SshFileSystem`（`app/sdk/node_modules/@deepseek-ai/dsh-fs-ssh/lib/index.js:25`）。
- 构造器里照样 `applyZoneRecheck(this.ctx, neverRoots)`——它只用 `ctx.get('fs').resolve`（`app/sdk/src/policy/fs-zone.mjs:45-73`），换成 fs-ssh 后自动按远端规范化。
- 覆盖 mutation 入口：先 `this.resolve(target)`（远端），再跑与 `zoneGuard` 同一判定（`app/sdk/src/policy/fs-zone.mjs:218-224`），通过才 `super`。**可写根只认 `policy.workspaceRoot`（远端会话 ws）**，不调 `workspaceWritableRoots`（它会补宿主拼写的 /tmp 与 tmpdir）。
- 读侧不做 Linux fd 绑定（`openReadTarget` 的 `/proc/self/fd` 只对本机有效，`app/sdk/src/policy/fs-zone.mjs:103-121`）：ssh 下读侧 = 执行期 resolve 复判。写 `ponytail:` 注释：resolve 与远端读之间仍有换链窗口，远端 bash 已在 D4 wrapper 视图里看不到 NEVER 根，残余窗口只剩区内↔区外，不涉凭证。
- **包含判定只走词法**：`isPathUnder` 词法不中时会退到宿主 `stat` 比身份（`app/sdk/src/policy/containment.mjs:43-52`），对远端路径没有意义甚至误判。给它加 `lexicalOnly` 参数，ssh 后端恒传 true（输入已由 fs-ssh 远端规范化）。
- start.ts：ssh 模式下 `fsSandboxRow` 插 `fs-zone-ssh` 而不是 `fs-zone`（同一个 `disabled: true` + `insert` 形状，`app/sdk/src/start.ts:271-290`）。

**锚点**：`app/sdk/src/policy/fs-zone.mjs:1-7`（继承写法与 fd 绑定的 ponytail 注释）、`app/sdk/src/policy/fs-zone.mjs:91-100`、`app/sdk/src/policy/fs-zone.mjs:207-224`、`app/sdk/node_modules/@deepseek-ai/dsh-fs-ssh/lib/index.js:25`、`repos/deepseek-harness/packages/ssh/fs-ssh/README.md:70`（远端 fs 无 watch）、`app/sdk/src/policy/containment.mjs:43`。

**验证**（T9 先红）：新文件 `app/sdk/tests/e2e/ssh-product.test.ts`（产品组合 = web profile + approval/market + 生成的 runtime patch，夹具复用 `startSshServer()`）：
- ①a 区内写：bot `write ws/a.txt` → 远端 ws 出现、宿主 cwd 空、0 张卡（对应本机 `write-outside.test.ts` 的区内格）。
- ①b 区外写拒：`write /tmp/bot-T9-*/x`（远端=本机的 /tmp）与 `write <remoteHome>/x` → 结果含 `write-outside-workspace denied`，文件不存在。**先红法**：T9 先只插 fs-ssh（不插 fs-zone-ssh）跑一次，①b 的 /tmp 格应写成功（红）。
- 变异：fs-zone-ssh 的可写根改回 `workspaceWritableRoots` → ①b /tmp 格红。

## D2 guard 的 NEVER 宿主路径在远端的语义

**原版**：box 是 bot 专用机，用户凭证在 Vault（浏览器里填，`PLAN.md` L7 行），box 上没有用户自己的 `~/.ssh`。我们的远端是**用户自己的服务器账户**（本机测试时就是这台机器），远端 `~/.ssh` 是真钥匙——按原版「bot 看不到用户凭证」的意图，远端凭证必须同样是 NEVER。

**备选**：
1. **只保留宿主根**。拒：真实远程时宿主路径在远端多半不存在，远端 `~/.ssh` 完全没人管。
2. **把判定挪到远端**（helper 里做）。拒：helper 是上游私有协议，我们不改上游代码（搬运阶梯第 2 级）。
3. **（选）宿主根照留 + 加一套远端根，判定仍在宿主 guard，路径来自 `ctx.fs.resolve`（ssh 下 = 远端规范化）**。

**结论**：
- 宿主根不动：远端=本机时宿主 NEVER 根就是远端可达路径，必须继续拒（本机测试就是这个情形）；真实远程时这些路径无害。
- 新配置 `remoteHome`（ssh 目标的远端 HOME，绝对路径，随 ssh 配置给，D13）。`computeRoots` 加一个纯函数分支 `remoteRoots(remoteHome, helperRoot)`：
  - 硬 NEVER：`CREDENTIAL_HOME_ENTRIES` 逐项拼到 remoteHome 下（`app/sdk/src/policy/never-roots.mjs:11-14`）。宿主侧不能 `existsSync` 远端路径，所以不展开通配：非通配项按字面进根；通配项（`.claude*`、`.config/**/credentials*`）交 guard 的模式匹配，wrapper 侧由整棵 remoteHome 遮蔽兜底（`ponytail:` 注释）。
  - 软遮蔽：整棵 remoteHome（例外 = 会话 header.cwd 子树，与宿主同规则，`app/sdk/src/policy/guard.mjs:13-15`）。
  - 写保护：helper 根（`Hello.root`，`app/sdk/node_modules/@deepseek-ai/dsh-ssh/lib/schemas.js:125`），防 bot 改写自己的执行器。
- guard、fs-zone-ssh（D1）、远端 wrapper（D4）三者用同一份远端根，照「一个清单两个消费者」的现规矩（`app/sdk/src/start.ts:233-241`）。
- guard 内的 `isPathUnder` 同 D1 走词法。

**锚点**：`app/sdk/src/policy/guard.mjs:9-22`（判定与 `ctx.fs.resolve` 规范化）、`app/sdk/src/policy/never-roots.mjs:119-122`（computeRoots 用宿主 HOME + `existsSync`）、`repos/deepseek-harness/docs/subsystems/ssh.md:9`（路径以 SSH 主机为准，policy resolver 不在宿主解析远端路径）、`repos/deepseek-harness/packages/ssh/sandbox-ssh/README.md:68`（ssh 主机是可信基础设施，不是敌对主机边界）。

**验证**（T9 先红）：`ssh-product.test.ts`：
- ②a 宿主哨兵：测试 HOME 下 `.ssh/id_sentinel`（宿主=远端）→ `read`、`grep` 均拒，正文不出现在结果里。
- ②b 远端哨兵：夹具 `remoteHome/.ssh/id_sentinel`（`app/sdk/tests/support/ssh-host.ts:86`）→ `read` 拒。**先红法**：T9 先不加远端根跑一次，②b 应读到哨兵正文（红）。
- ②c `write` 到 helper 根 → 拒。
- 变异：去掉远端根 → ②b 红。bash 侧同一组哨兵在 T10 验（D4）。

## D3 shell-ask 档位挂哪层

**原版**：原版档位语义已由 Q-013 定稿（用户逐行确认），与执行位置无关；原版 box 内命令的审批在 local-exec-daemon 里，同属工具层。

**备选**：
1. **ssh 模式下 bash 一律 ASK**（不给免卡）。拒：当前消费者是「工程 bot 跑测试」，每条命令出卡等于不可用；且 D4 落地后远端 bash 与本机同等受 wrapper 约束，没有理由降档。
2. **改 shell-ask 代码加 ssh 分支**。拒：不需要——见结论。
3. **（选）代码不动**。

**结论**：
- 文件档位（第 3/4 行）用 `ctx.fs.resolve` + 会话 workspaceRoot 判区内外（`app/sdk/src/policy/shell-ask.mjs:15-20`），ssh 下 resolve 即远端规范化、workspaceRoot 即远端 ws，语义自动正确。
- bash 第 1 行 sandbox-allow 的成立条件写在 shell-ask 头注释里：「launcher 恒写 sandbox 行，wrapper 坏 → bash 执行失败，不存在无卡且裸跑路径」（`app/sdk/src/policy/shell-ask.mjs:8-14`）。ssh 模式下这句话改由 D4 的 `sandbox-zone-ssh` 兑现：它改写不了远端 argv 就抛 `SandboxUnavailableError`，上游 sandbox-ssh 本身也是 fail closed（`app/sdk/node_modules/@deepseek-ai/dsh-sandbox-ssh/lib/index.js:34-37`）。
- `permitDir` 照旧是宿主路径：本机测试时远端 wrapper 跑在同一台机器上，读得到；真实远程见 D4。
- 档位表、policy-state 实例校验都在宿主（main / launcher 侧），不动。

**锚点**：`app/sdk/src/policy/shell-ask.mjs:1-45`、`app/sdk/src/start.ts:303-311`（shellAskRow 的 permitDir / policyStatePaths 推导）、`app/sdk/tests/e2e/tiers-policy.test.ts:1`（现有档位回归文件）。

**验证**（T10 先红）：新文件 `app/sdk/tests/e2e/ssh-bash.test.ts`：
- ③a policy-state 门开时 bash `printf %s "$PBOTS_SSH_MARK" > m.txt` → 0 张卡，远端 ws 的 `m.txt` = 本轮 mark（执行位置证明照 T4）。
- ③b 同一调用在 `sandbox-zone-ssh` 被替换成原版 `sandbox-ssh` 时（变异）→ ④ 的 wrapper 断言红，证明「免卡」靠的是 wrapper 而不是巧合。
- ③c policy-state 门关 → bash 出卡（与本机 `tiers-policy.test.ts` 同格）。

## D4 sandbox runner 与联网升权

**原版**：box 内命令由 local-exec-daemon 的 `sand-*` 原生沙箱约束（`RE-skills.md` 背景段）；box 是专用机。我们的远端是用户账户，必须有和本机同等的读遮蔽。

**备选**：
1. **用远端 helper 自带的 sandbox**（上游默认 bwrap profile）。拒：helper 以无配置方式挂 `LocalSandboxProvider`（`app/sdk/node_modules/@deepseek-ai/dsh-ssh/lib/helper.js:541`），上游 bwrap profile 是「只读的宿主根」（`repos/deepseek-harness/packages/sandbox/sandbox-local/README.md:77`）——**读不设防**。本机测试时远端就是宿主，bot 的 bash 能直接 `cat` 宿主 `~/.ssh`，A4 凭证矩阵整组倒退。
2. **给 helper 配 runnerCommand**。拒：helper 构造时不收任何 sandbox 配置（同上锚点），要改上游。
3. **（选）在宿主侧继承 `SshSandboxProvider`，改写远端返回的 argv**：远端算好的是 `[<bwrap>, …profile…, --, cmd]`，把 argv[0] 换成 `python3 -I <远端 wrapper> --home <remoteHome> --mask <remoteHome> --never <远端硬根>… --policy <helper 根>`，其余原样接上（wrapper 的调用形态本来就是「bwrap profile 参数 -- 命令」，`app/sdk/sandbox/bwrap-wrap.py:6-9`，它自己 exec `/usr/bin/bwrap`，`app/sdk/sandbox/bwrap-wrap.py:35`）。

**结论**：
- 新增 `app/sdk/src/policy/sandbox-zone-ssh.mjs`（约 40 行，上游类本身 41 行，`app/sdk/node_modules/@deepseek-ai/dsh-sandbox-ssh/lib/index.js:16-38`）。`confine()` = `super.confine()` → 校验 argv[0] 基名是 `bwrap` 且 `enforcement === 'full'`，否则抛 `SandboxUnavailableError`（远端只有 Landlock 时不降级）→ 改写 argv，`runnerFailureRules` 追加 `bwrap: ` 前缀（与本机 sandbox 行同一错误方言，`app/sdk/src/start.ts:226-229`）。
- 远端 wrapper 路径：本机测试 = 宿主 `app/sdk/sandbox/bwrap-wrap.py` 原路径（同一台机器）；真实远程 = 随 helper 一起推到远端并校验 sha256（D10 / T13）。远端要有 `python3` 与 `/usr/bin/bwrap`，缺则 fail closed。
- `danger-full-access` 时上游 consumer 绕过 `confine()`（`repos/deepseek-harness/packages/ssh/sandbox-ssh/README.md:30`）——与本机同语义（升权由 Q-013 管，不在此改）。
- **联网**：wrapper 恒 `--unshare-net`，只在 `--permit-root` 下有许可时由 wrapper 内的 supervisor 接 slirp4netns（`app/sdk/sandbox/bwrap-wrap.py:19-25`）。本机测试：permit-root 与 slirp 都是同机路径，request_network 照常可用。真实远程：许可写在宿主、远端看不到 → 远端 bash 恒断网（fail closed，命令失败不会裸奔）。真实远程要联网时把 permit 目录与 slirp 推到远端，记入 T13。

**锚点**：`app/sdk/node_modules/@deepseek-ai/dsh-ssh/lib/helper.js:541`、`repos/deepseek-harness/packages/ssh/ssh/src/helper.ts:34`（源码同一行为）、`repos/deepseek-harness/packages/sandbox/sandbox-local/README.md:77`、`app/sdk/node_modules/@deepseek-ai/dsh-sandbox-ssh/lib/index.js:16`、`app/sdk/src/start.ts:202-231`（本机 wrapper 行）、`app/sdk/tests/e2e/w1ap0-matrix.test.ts:1`（A4 矩阵现有回归）。

**验证**（T10 先红）：`ssh-bash.test.ts`：
- ④a bash `cat <测试 HOME>/.ssh/id_sentinel`（宿主哨兵，远端=本机）→ 退出非零、输出不含哨兵正文。**先红法**：T10 先用原版 `sandbox-ssh`（T9 的组合）跑，④a 应读到正文（红）——这一格就是选项 1 被拒的实证。
- ④b bash `cat <remoteHome>/.ssh/id_sentinel` → 同上被挡。
- ④c bash `test -w <helper 根>` → 退出 1（写保护）。
- ④d 变异：`sandbox-zone-ssh` 不改写 argv（直通 super）→ ④a/④b 红。
- ④e 远端 argv[0] 非 bwrap（测试里用一个假 helper 回包不现实 → 改为单测 `tests/unit/sandbox-zone-ssh.test.ts` 直接喂 `confine` 的 super 返回值）→ 抛 `SandboxUnavailableError`。

## D5 P6 worker cwd 与远端 ws

**原版**：原版 bot 的工作目录在各自 box 里（box 状态按 agent 记账，D12）；我们的 P5-25 约定是「cwd 由 main 强制为 `$PBOTS_DATA_DIR/workspaces/<botId>`，header.cwd 不可变」（`app/ui/main/m3-meta/orchestrate.ts:4-7`），Q-024 定 worker 继承发起者 cwd 或其子目录。

**备选**：
1. **远端也用宿主同名路径**（让 `$PBOTS_DATA_DIR/workspaces/<botId>` 在远端照抄）。拒：远端账户不一定有这个目录、也不该在远端复刻宿主数据根布局；本机测试时还会和宿主数据根（guard 的 mask 根）重叠，测不出「判错侧」。
2. **main 自己 ssh 上去建目录**。拒：main 要多持一条 ssh 连接和一份身份，第二个 ssh 客户端面，凭证面变大。
3. **（选）路径字符串由 main 算、目录由 SDK 侧经 `ctx.fs` 建**。

**结论**：
- ssh 配置给 `remoteRoot`（绝对，D13）。ssh 模式下 `mintWorkspace` 的路径 = `<remoteRoot>/workspaces/<botId>`，**不在宿主 mkdir**（现在是宿主 `mkdir`，`app/ui/main/m3-meta/orchestrate.ts:81-91`）。
- 建目录：先探上游 session 创建是否会经 `ctx.fs` 建 cwd（T11 第一格）；会 → 什么都不加；不会 → 在已有的 `p2temp/session.createWithConnectors`（`app/ui/main/m3-meta/orchestrate.ts:172-179` 的调用点）SDK 侧实现里先 `ctx.fs.mkdir(cwd, {recursive:true})`，不另开插件。
- worker：`createWorkerBot` 同一路径（继承发起者 cwd 时不建目录；新开子目录时同上经 SDK 建）。
- 远端 ws 与宿主数据根分开：本机测试里 `remoteRoot` 放夹具目录下，不放 `$PBOTS_DATA_DIR`。

**锚点**：`app/ui/main/m3-meta/orchestrate.ts:80-91`、`app/ui/main/m3-meta/orchestrate.ts:166-179`、`repos/deepseek-harness/docs/subsystems/ssh.md:27`（headless 经挂载的 fs 记录与检查 cwd；Web 视图假定宿主 fs）、`work/QUESTIONS.md` Q-024 答复。

**验证**（T11 先红）：app/ui e2e `tests/e2e/ssh-workspace.spec.ts`（产品 + 夹具 sshd）：
- ⑤a 建 bot → 远端 `<remoteRoot>/workspaces/<botId>` 存在，宿主 `$PBOTS_DATA_DIR/workspaces/<botId>` **不存在**。先红：现状 main 在宿主建目录，后半句红。
- ⑤b 该 bot 的 bash 写 marker → 落在远端 ws。
- ⑤c 主 bot 委派 worker（P6 现有路径）→ worker 的写入落在发起者远端 ws（Q-024 A），宿主无新目录。

## D6 进程级 vs preset `isolate`

**原版**：box 按 agent 记账（D12），是否多 bot 共用一台不可见；BRIEF 目标 3 / L8 的需求原话是「把一台 ssh 主机当作 bot 的电脑」「bot 共用一台电脑」（`work/p9-dsh-integration/BRIEF.md:10`、`work/p9-dsh-integration/BRIEF.md:26`）。

**备选**：
1. **preset 里 `isolate` 出一组 fs/subprocess/sandbox**，只给部分 bot 远端电脑。拒：上游明文「preset 的服务提供者和消费者必须在同一个 `cordis:group` 隔离域；Entry 级隔离不穿过 Agent 注册作用域，`agent.ctx` 等普通查找仍取 Host realm」（`repos/deepseek-harness/packages/preset/agent-preset-registry/README.md:58`）。而 tool-bash、tool-fs、working-directory、sandbox-policy、bash-sandbox 全在 base 顶层（`repos/deepseek-harness/packages/bundle/base/cordis.patch.yml:234-249`），要把它们整套搬进每个 preset 组，还要过「泄漏服务即拒挂载」的审计——等于重写组合，且上游只文档化进程级 ssh 组合（`repos/deepseek-harness/docs/subsystems/ssh.md:27`）。
2. **两套 dsh 运行时（本机 + 远端）**，bot 按所属电脑分进程。拒（本期）：P6 编排、跨 bot 投递、M1/M2 连接都假设一个运行时；跨运行时委派是新的大块。
3. **（选）进程级：一个运行时一台电脑**，开 ssh 模式 = 这个运行时的所有 bot 都在那台电脑上。

**结论**：进程级。代价写明：①不能「部分 bot 本机、部分远端」；②切换电脑影响所有已有 bot（它们的 header.cwd 是宿主路径且不可变）——这是用户可见的取舍，写成 **Q-029**，T11 以前默认 A（切换后旧 bot 的工具调用 fail closed 并提示，新建 bot 在远端）。

**锚点**：`repos/deepseek-harness/packages/preset/agent-preset-registry/README.md:58`、`repos/deepseek-harness/docs/user/develop/framework/service.md:111-139`（isolate 只对同组插件生效的示例）、`repos/deepseek-harness/packages/bundle/base/cordis.patch.yml:234`。

**验证**：进程级本身由 T9 的 `ssh-product.test.ts` 覆盖（两个 bot 的 bash marker 都落远端）。Q-029 的 A 方案由 T11 加格：⑥ 一个 header.cwd 在宿主（不在 `remoteRoot` 下）的旧会话发 bash → 被拒且结果含固定提示串，远端与宿主都无新文件；先红 = 不加判定时命令在远端以不存在的 cwd 失败、报错文本不是提示串。

## D7 断连「结果未知」在 UI 怎么表达

**原版**：0.78.1 有「Connection lost」（`xIgsFr`）与「Reconnecting」（`BakXLg`）文案，box 重连由服务端管，客户端没有「结果未知」专用文案（实测计数见 `work/tickets/evidence/T5/d7-disconnect-copy.txt`）。

**备选**：
1. **维持现状**（工具行 failed + 「回复失败：SSH connection is closed」）。拒：文案没告诉用户「那一步可能已经做了」，用户直接重发可能重复执行；而且连接是不重连的（`repos/deepseek-harness/docs/subsystems/ssh.md:23`），之后**所有 bot 的每一轮**都会失败，用户只看到一串红字。
2. **自动重连并重放**。拒：上游刻意不重放（同锚点），重放一个可能已执行的 `rm`/`git push` 是数据风险。
3. **（选）专用通知 + 运行时重启 + 不重放**。

**结论**：
- 形态（T4 实测，`work/tickets/receipts/T4.md` §5-1）：在跑工具的 tool_result `status:"error"`、`Error: SSH helper disconnected; outcome is unknown`；随后 turn/final `reason.kind:"error"`、`SSH connection is closed`；同一回合后续调用不执行。
- 渲染：reduce 已把错误回合变成 danger 通知「回复失败：…」（`app/ui/renderer/session/reduce.ts:132-139`），工具行已是 failed（`app/ui/renderer/session/reduce.ts:196`）。只加一处：`endNotice` 认出 `SSH connection is closed` / `outcome is unknown` 两个固定串时，通知文本换成「电脑连接已断开。上一步可能已执行，也可能没执行——先看看结果再决定要不要重试。正在重新连接…」。工具行原文不改（保留上游诚实措辞）。
- 恢复：launcher 监控 dsh 子进程；ssh 连接丢失后由 launcher 重启 dsh 运行时（新连接），会话从 jsonl 恢复，**不重放任何回合**；用户手动重试。重启期间 UI 按现有离线态（`useOnline()`）处理。
- 原版「Reconnecting」文案可复用为重启期间的状态提示。

**锚点**：`work/tickets/receipts/T4.md:59`（§5-1 实测形态）、`app/ui/renderer/session/reduce.ts:132`、`app/ui/renderer/fold/turn-fold.ts:73-76`（danger 通知 → 回合 error 态）、`repos/deepseek-harness/packages/ssh/ssh/README.md:66`（不自动重连重放）。

**验证**（T12 先红）：
- ⑦a 单测 `app/ui/tests/unit/session/end-notice-ssh.test.ts`：喂 T4 回执里的两条原样事件 → 通知文本含「可能已执行」；普通错误仍是「回复失败：…」。先红：现状是「回复失败：SSH connection is closed」。
- ⑦b e2e（sdk 侧，夹具 sshd）：杀 ssh master 后 30s 内 launcher 起了新 dsh（新 PID）、下一条消息能正常完成；断连那一回合在恢复后的 transcript 里没有被重放（调用计数 = 1）。

## D8 PTC：接 `ctx.ssh.ptcLaunch` 还是继续禁用

**原版**：原版的 workflow / 程序化工具调用跑在 box 内，与执行位置一致；我们没有对应的远端 worker。

**备选**：
1. **node-script + 推 bootstrap**（`launch.bootstrapPath/bootstrapHash`）。拒（本期）：要多部署一份脚本并配 hash，当前消费者不用 workflow。
2. **executable 部署取内嵌 worker**。拒：上游 release 没有任何 asset（D10），要自己用 musl-gcc 等工具链构建（`repos/deepseek-harness/packages/ssh/ssh-helper-runtime/README.md:45`）。
3. **（选）继续禁用**，并且禁全。

**结论**：ssh 模式下禁用 base 的 `ptc-runtime`、`workflow-ptc`、`tool-workflow`、`tool-executor-ptc`（T4 已验这四行，`app/sdk/tests/e2e/ssh-headless.test.ts:88-95`），**另加** approval.yml 里各 preset 嵌套的 `workflow-ptc` / `tool-workflow` 行（`app/sdk/profile/patches/approval.yml:165-170`、`app/sdk/profile/patches/approval.yml:288-293`）和 `preset-ptc`（`app/sdk/profile/patches/approval.yml:323`）——T4 用 headless profile 没碰到这些，产品组合里它们是一条回落本机执行的路。接 PTC 的时机：用户要 workflow 时，随 T13 自建 helper 可执行包一起做。

**锚点**：`repos/deepseek-harness/packages/ssh/ssh/README.md:50`、`repos/deepseek-harness/packages/bundle/base/cordis.patch.yml:396-404`、`app/sdk/profile/patches/approval.yml:149`（preset 内 `workflowEngine: true`）。

**验证**（T9）：`ssh-product.test.ts` ⑧：ssh 模式下各 preset 的模型可见工具清单（fake 记录的首请求 tools）不含 `workflow`；变异：去掉 preset 嵌套行的禁用 → ⑧ 红。

## D9 宿主直连行逐条去留（含 ssh bot 的 skill 启用落点）

**原版**：原版这些能力都在 box 内（文件、搜索、skill 扫描 `.agents/skills`，`work/p9-dsh-integration/RE-skills.md:24`）；按「执行坐标在哪台电脑就在哪台电脑上看」定去留。逐包 grep 见 `work/tickets/evidence/T5/d9-host-direct.txt`（实测）。

**备选**（对每行都在三者里选）：留（宿主语义本来就对 / 已走 ctx.fs）、禁（ssh 下会错且有替代）、换远端版（自建或等上游）。

**结论**：

| 行 | 做什么 | ssh 下 | 理由 / 锚点 |
|---|---|---|---|
| `tool-fs-search` | glob/grep：在宿主解析 `@vscode/ripgrep` 路径，再经 `ctx.subprocess` 起 | **禁** | 宿主 rg 路径交给远端执行；本机测试会「碰巧能用」，真实远程必挂。上游自述「远程/虚拟 fs 需要同址工作区或别的搜索消费者」（`repos/deepseek-harness/packages/fs/tool-fs-search/README.md:228`；`repos/deepseek-harness/packages/fs/tool-fs-search/src/search-core.ts:171`、`repos/deepseek-harness/packages/fs/tool-fs-search/src/search-core.ts:239`）。模型改用远端 bash 的 grep/rg |
| `attachment-local` | 用户上传图片存 `DSH_HOME/attachments`（宿主） | 留 | 附件属于会话存储，会话本来就在宿主（`repos/deepseek-harness/docs/subsystems/ssh.md:5`）|
| `spill-local` | 超长工具结果落宿主 tmpdir，回给模型一个路径 | 留（本机测试正确）；真实远程需换后端 | 上游自述「locator 需要同址 fs 消费者」（`repos/deepseek-harness/packages/spill/spill-local/README.md:127`）：真实远程时模型拿宿主路径去远端 `read` 读不到。T13 写一个经 `ctx.fs` 落远端的 SpillStore |
| `agent-instructions` | 读 AGENTS.md | 留 | 有 `ctx.fs` 时走 provider（`fileSystem.stat` 等），node:fs 只是无 provider 回退 |
| `skill-filesystem` | 扫 skill 根、读 SKILL.md | 留 | 发现与读取走 `ctx.fs`（`repos/deepseek-harness/packages/skill/skill-filesystem/README.md:99`），project 根即远端 ws；watcher 是宿主 chokidar（`repos/deepseek-harness/packages/skill/skill-filesystem/src/index.ts:498`），对远端路径无效，fs-ssh 也不支持 watch（`repos/deepseek-harness/packages/ssh/fs-ssh/README.md:70`）→ 只剩「write/edit 直接失效」这条刷新路（T6 的存 skill 场景正是这条） |
| `shell-env` | 给 bash 注入 `DSH_*` 事实 | 留 | 只是 `DSH_*` 变量，不读写文件（`repos/deepseek-harness/packages/bundle/base/cordis.patch.yml:278`）|

**ssh bot 的 skill 启用副本落点**：= 远端 `<remoteRoot>/workspaces/<botId>/.dsh/skills/<name>/`（D5 的远端 ws 下，skill-filesystem 的 project 根）。约束给 T7a 的后续：
1. T7a 的 main 侧本机 `fs.cp` 在 ssh 模式下**必须拒**（`pbots/unavailable`，提示「远程电脑模式下暂不支持」），否则会把副本写进宿主一个 dsh 根本不扫的地方，UI 显示成功、bot 却用不到。
2. 真正支持时（T11）：复制挪到 SDK 侧，经 `ctx.fs`（fs-ssh）读源写目标，main 只发「从 bot A 的 name 复制到 bot B」；校验规则（符号链接、256,000 字符、250 条、`-2`）原样搬过去。
3. 由于没有 watcher，启用后目标 bot 在**已开始的会话**里要等下一次失效才看到；T7a 的 e2e 让 B 首请求前启用正好绕开，ssh 版沿用同一测法，并加一格「已开始会话的 B 下一轮能否看到」，看不到就如实写进 UI（「新会话生效」）。

**锚点**：表中各行；`work/tickets/doing/T7a-l4c-skill-enable-api.md:1`（T7a 当前范围）。

**验证**：
- T9：`ssh-product.test.ts` ⑨ 首请求 tools 里没有 `glob`/`grep`；变异：不禁 `tool-fs-search` → ⑨ 红。
- T11：⑨b ssh 模式下 `pbots.skills({op:'enable'})` → 先红（T7a 现状会在宿主复制并返回 ok），修后返回 `pbots/unavailable` 或（SDK 侧复制完成后）远端出现副本、宿主无新目录。

## D10 真实远程主机怎么装 helper

**原版**：原版 box 由 xAI 托管，无对应。

**备选**：
1. **用上游 release 附的 `dsh-ssh-helper-<ver>-<platform>-<arch>.tar.gz`**（`repos/deepseek-harness/packages/ssh/ssh-helper-runtime/README.md:45`）。拒：**实测 37 个 release 全部 `assets=0`**，发布工作流默认 `publish=false`；npm 上也没有 `@deepseek-ai/dsh-ssh-helper-runtime`（E404）——原样输出见 `work/tickets/evidence/T5/d10-release-assets.txt`。
2. **自己构建 executable 包**（`build-exe-for-ssh-helper.ts`，要 Node 24 + C/C++ 编译器 + musl-gcc）。拒（本期）：工具链重，只有接 PTC（D8）时才值。
3. **远端 `npm install`**。拒：远端要 npm 与外网，且装出来的东西在远端，hash 要远端算再回传。
4. **（选）node-script 闭包推送**：宿主 `npm install --prefix <stage> @deepseek-ai/dsh-ssh@<钉版>`（与 `app/sdk/package.json` 同版本，现装为 0.2.2-alpha.2，exports 含 `./helper`，见证据文件），整目录推到远端版本化目录（在远端 workspace 与 bwrap 私有 /tmp 之外，`repos/deepseek-harness/packages/ssh/ssh/README.md:36`），远端只需 Node 24；`helperHash` 在宿主对 `lib/helper.js` 算，连接时 dsh 自己校验（不符拒连）。D4 的 wrapper 与将来的 spill 后端同一次推送、同样记 hash。

**结论**：选 4，落 T13；T13 开单前要用户给一台真实主机（届时写 Q）。远端 Node 版本由安装脚本 `node --version` 校验，不是 24 就停。

**锚点**：`work/tickets/evidence/T5/d10-release-assets.txt`、`repos/deepseek-harness/packages/ssh/ssh/README.md:32-48`（部署前提与字段表）、`repos/deepseek-harness/packages/ssh/ssh-helper-runtime/README.md:28-45`。

**验证**（T13）：安装脚本对一台临时远端（先用夹具 sshd，远端目录与宿主 node_modules 不同路径）推送 → `startSshServer` 改指推送后的 helper → T4 的 headless 四格照跑全绿；变异：推送后篡改远端 `helper.js` 一个字节 → 连接被拒（hash 不符），测试断言报错文本。

## D11 宿主强杀残留 `/tmp/dsh-ssh-*`

**原版**：无对应（云 box）。

**备选**：
1. **启动期清扫陈年目录**。拒：目录名不带进程归属，扫的时候会碰到别的测试或正在建立中的产品连接（PLAN §3-10 原裁决理由，`work/p9-dsh-integration/PLAN.md:59`）。
2. **改 dsh-ssh 把目录放进我们自己的根**。拒：路径在上游写死（`work/p9-dsh-integration/PLAN.md:53`），不改上游。
3. **（选）维持不扫**，用测试钉住「残留只是空目录」。

**结论**：维持。产品被强杀时 dsh 子进程随 launcher 退出（pdeathsig / launcher 停止升级），ssh master 随之消失，留下的是空 0700 目录、无套接字、无进程，无安全面。

**锚点**：`work/p9-dsh-integration/PLAN.md:59`、`work/tickets/receipts/T4.md:43`（正常退出零残留）。

**验证**（T9）：`ssh-product.test.ts` ⑪：对 launcher 发 SIGKILL 后，相对跑前新增的 `/tmp/dsh-ssh-*` ≤ 1 个、目录为空（`readdir` 长度 0）、端口拒连。

## D12 一台电脑每账户还是每 bot

**原版**：box 状态按 agentId 记账（`ingestForeverBox` 以 `e.agentId` 取槽），查询/确保用该槽的 `boxId`；同一 boxId 是否被多个 agent 共用**静态不可见（未找到）**。实测计数见 `work/tickets/evidence/T5/d12-box-per-agent.txt`（`getForeverBoxStatus({id:n.boxId}` 1 次、`lB={id:y()}` 1 次）。

**备选**：
1. **每 bot 一台**（每个 bot 配自己的 ssh 目标）。拒：需要 D6 选项 2（多运行时）；BRIEF 原话是「共用一台电脑」。
2. **（选）每运行时（= 每账户）一台**。
3. **再做 RE 定论**。拒：box 分配在服务端，客户端产物里没有更多可挖的。

**结论**：每运行时一台，与 D6、BRIEF L8 一致，不问用户（PLAN §5-6 已预判「不必问用户」，`work/p9-dsh-integration/PLAN.md:87`）。若将来要每 bot 一台，走 D6 选项 2。

**锚点**：`work/tickets/evidence/T5/d12-box-per-agent.txt`、`work/p9-dsh-integration/BRIEF.md:26`。

**验证**：无独立测试（结论 = D6 的进程级，由 T9 两个 bot 都落远端的格覆盖）。

## D13 产品化形态

**原版**：无对应（用户不配置 box）。我们需要一个「这台电脑是哪台」的配置入口。

**备选**：
1. **静态 `profile/patches/ssh.yml`**。拒：行里要绝对 file URL、helper 路径与 hash、远端 ws/HOME 这些运行时值；静态 profile 写不了，`writeRuntimePatch` 就是为此存在的（`app/sdk/src/start.ts:331-336`）。
2. **每 bot 配置（bots.json recipe 字段）**。拒：D6 进程级，配置是运行时级的。
3. **（选）`start.ts` 生成**：`resolveConfig` 读 launcher 侧 env（`P2SDK_SSH_HOST` 别名、`P2SDK_SSH_REMOTE_ROOT`、`P2SDK_SSH_REMOTE_HOME`、`P2SDK_SSH_HELPER`、`P2SDK_SSH_HELPER_HASH`、`P2SDK_SSH_NODE`），全部给齐才进 ssh 模式、缺一个就启动失败（不半开）；`writeRuntimePatch` 追加 `sshRows(cfg)`。设置 UI 后做（Q-029 答复后）。

**结论**：
- 生成的行 = T4 已验证的那组（`app/sdk/tests/e2e/ssh-headless.test.ts:76-131`）减去重复 llm-replay，加 D1 `fs-zone-ssh`、D4 `sandbox-zone-ssh`（代替原版 `fs-ssh` / `sandbox-ssh` 两行）、D8 preset 嵌套禁用、D9 禁 `tool-fs-search`、`sandbox-policy.workspaceRoot` 指 `remoteRoot`。本机 `sandbox` 行（bwrap wrapper）在 ssh 模式下不生成（`sandbox` 被禁用）。
- 这些 env 名都是 launcher-only，不进 dsh 子进程 env（照 `P2SDK_SANDBOX_MASK` 的处理，`app/sdk/src/start.ts:160-168`）。
- 身份：只给 OpenSSH 别名，私钥、known_hosts 留在用户自己的 OpenSSH 配置里，dsh-ssh 开 `BatchMode`、严格 host key、关 agent forwarding（`repos/deepseek-harness/packages/ssh/ssh/README.md:34`）；凭证不进模型、不进容器、不进我们的配置文件。注意 OpenSSH 不看 `$HOME`（PLAN §3-1，`work/p9-dsh-integration/PLAN.md:50`），产品就是要用用户真实的 ssh 配置，测试才用 PATH 包装隔离。
- **T4 死代码**：`app/sdk/tests/e2e/ssh-headless.test.ts:111-122` 在 ssh.patch.yml 里重复插了 llm-replay（`replay.patch.yml` 另有一份，`app/sdk/tests/e2e/ssh-headless.test.ts:133-148`），经理实测删后 14/14（`work/tickets/receipts/T4.md` 经理核实第 5 条）。**T9 的第一步就是删这 12 行**并在回执里贴删后 `ssh-headless + ssh-host` 14 passed；顺带复核 `warning: 1 entry did not activate` 是否随之消失（消失 = 就是它；不消失 = 另有原因，写进回执，不据此下「插件失败不致命」的普遍结论）。

**锚点**：`app/sdk/src/start.ts:336-370`、`app/sdk/tests/e2e/ssh-headless.test.ts:111`、`repos/deepseek-harness/packages/ssh/ssh/README.md:34`。

**验证**（T9）：单测 `app/sdk/tests/unit/start.test.ts` 加格：① 全部 `P2SDK_SSH_*` 给齐 → runtime patch 含 `fs-zone-ssh`、`sandbox-zone-ssh`、`- id: subprocess\n  disabled: true`，不含 `id: sandbox\n  config`（本机 wrapper 行）；② 缺一个 → `validateConfig` 报错；③ `childEnv` 不含任何 `P2SDK_SSH_*`。e2e 由 `ssh-product.test.ts` 整体承担。

---

## 实现单拆分

写进 `work/tickets/queue.md` 当计划行，只有 T9 标「可开」（写两张开一张）：

| 单 | 内容 | 覆盖 D | 依赖 |
|---|---|---|---|
| **T9** | 产品组合进 ssh 模式（本机 sshd 夹具）：先删 T4 重复 llm-replay；`P2SDK_SSH_*` 配置 + `sshRows`；`fs-zone-ssh`（词法包含、只认远端 ws）；guard 远端根；禁 PTC 全族（含 preset 嵌套）与 `tool-fs-search`；`ssh-product.test.ts` ①②⑧⑨⑪ + 变异 | D1 D2 D8 D9(禁行) D11 D13 | T5 验收 |
| T10 | 远端 bash 套 wrapper：`sandbox-zone-ssh` + 单测；`ssh-bash.test.ts` ③④（先红 = T9 组合下 bash 读到宿主哨兵） | D3 D4 | T9 |
| T11 | main 侧：远端工作区（不在宿主 mkdir）、worker 远端 cwd、Q-029 的旧 bot 处理、T7a 在 ssh 模式拒 / SDK 侧复制 | D5 D6 D9(skill) | T10、T7a、Q-029 |
| T12 | 断连：`endNotice` 专用文案 + launcher 重启运行时、不重放 | D7 | T9 |
| T13 | 真实远程：helper 闭包推送 + hash、wrapper/slirp 推送、spill 远端后端、远端 PATH 核对 | D4(联网) D9(spill) D10 | 用户提供真实主机（届时写 Q） |

## 新 Q

- **Q-029**（`work/QUESTIONS.md`）：开启「远程电脑」后，已有的本机 bot 怎么办（D6）。

## 未核实到底（如实）

1. D5「上游 session 创建会不会经 ctx.fs 建 cwd」没探，留作 T11 第一格（两条路都已写明）。
2. D7 原版「Connection lost」在 APP 里的使用点没追到（计数 1，未定位上下文）。
3. D9 bash 工具传给远端 spawn 的 env 是否带宿主 PATH 只从 T2 §5.2「env 叠加在远端 helper 环境之上」推得，本机测试无影响，列入 T13 核对。
4. D4 远端 wrapper 在「远端=本机」下复用宿主路径是成立的，但 T10 要确认 sshd ForceCommand 改写的 HOME/TMPDIR 不影响 wrapper 的 `--home` 推导（wrapper 只认显式参数，预期无影响）。
