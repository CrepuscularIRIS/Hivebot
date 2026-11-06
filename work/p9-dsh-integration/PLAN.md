# PLAN · p9-dsh-integration

> manager (Opus 5.5) · 2026-11-06 · 任务 A（立项拆单）。需求见 `BRIEF.md`。
> 本地参考：`repos/deepseek-harness@ce7073d512`（MANIFEST 已记，2026-10-30），产品钉版 `@deepseek-ai/dsh@0.2.2-alpha.2`（`app/sdk/package.json:20`）。
> 第三方检索：GitHub MCP `search_repositories`（dsh-plugin ssh remote / skill library / slack / vault secrets / group chat room），2026-11-06。

## 0. 一句话结论

- dsh 插件能覆盖的是**运行时能力**（ssh 执行、skill 目录、定时、MCP、goal、浏览器），Grok Bot 的**产品层**（多 bot 名册、人格编辑、库与按 bot 启用、Room、审批 UI）仍要我们写胶水。
- **L8 不是「装上插件就能用」**：dsh `ssh` 族在**进程级**替换 `ctx.fs` / `ctx.subprocess` / `ctx.sandbox`，而我们 P5/P6 的安全层（`fs-zone` 替换 fs-sandbox、`guard` 的 NEVER 宿主路径、`shell-ask` 档位）正是挂在这三件上的本机实现。所以第一批 L8 只做到「隔离环境里真组合跑通 + 证据」，接进产品要先由 `architect` 定组合方案（T5）。
- L4 的格式与原版一致（都是 `SKILL.md` 目录包），每个 bot 的私有 skill 目录天然存在（`workspaces/<botId>/.dsh/skills`）；缺的是「账户库 + 按 bot 启用 + 对话里存成 skill」三段胶水，语义先按 0.78.1 RE 定（T3）。

## 1. L1–L14 逐行核对

判定：**直接用** = 装上 / 已装、配置即可；**插件+胶水** = 插件提供运行时，我们补产品层；**需自建** = 无可用插件；**不做** = BRIEF 已排除或本期不做。

| # | 判定 | dsh 依据（锚点） | 第三方（GitHub，2026-11-06） | 我们这边 / 卡点 |
|---|---|---|---|---|
| L1 名册+人格+持续会话 | 插件+胶水 | `preset/persona/README.md` §Summary：preset 内挂 persona 行即可给单个 agent 独立 prefix/suffix，全局挂会 fail loud；`preset/agent-preset-registry/README.md`：一进程多组合。持续会话 = base 的 `session-persistence-jsonl`（`bundle/base/cordis.patch.yml:138`） | 未检索（插件现成） | 名册已有（`app/ui/main/m3-meta/store.ts` recipes）。人格编辑 = 每 bot 一个 preset（`p2temp/index.mjs:259` 已在用 `ctx.agentPresets.register`）里带 persona 行 + UI。不进第一批 |
| L2 主 bot 委派 | 已做大部分（自建，保持） | `experimental/agent-team/README.md` §Summary：单 session 内 Lead + 队友 + 收件箱 + 任务板；`subagent/subagent` | — | P6 已做；**P6-14b 开闸前置三件未完**（48 组定案、启动顺序核对、persona/section 断言，`p6-orchestration/PLAN.md:66,74`）。agent-team 不替换 P6，见 §2 |
| L3 bot 建 bot | 需自建（P7-M1） | 无 CreateAgent 插件；`api/session-controller` 只管 session 生命周期 | 未检索（依赖链卡住，检索推迟） | **阻塞**：P7-M1 依赖 P7-F2（冻结）/ P7-F3（等 Q-027）。不排进可做区 |
| L4 Skill 库 / 按 bot 启用 / Teach | 插件+胶水 | 已装 `dsh-skill` / `-skill-filesystem` / `-tool-skill`（`app/sdk/node_modules/.pnpm`），已在 preset（`app/sdk/profile/patches/approval.yml:307-312`）。格式 = `<name>/SKILL.md` + YAML frontmatter（`skill/skill-filesystem/README.md` §Skill format）；根目录 `<projectRoot>/.dsh/skills`，无 `.git` 时 projectRoot = cwd（同 README §Roots），而 bot cwd = `$PBOTS_DATA_DIR/workspaces/<botId>`（`app/ui/main/m3-meta/orchestrate.ts:4`）→ **每 bot 私有 skill 根天然存在**；写工具写入 skill 根后下一步即刷新（同 README §Change detection） | ZiYuan258/dsh-skill-router（3★，大库按需检索，不需要）；lengrufeng2008/dsh-skill-library（内容包）——不采用 | 原版：per-agent `Add/Update/Remove/ListGrokBotAgentSkills`，`AddGrokBotAgentSkillRequest{agent_id,name,description?,content?}`、`GrokBotAgentSkill{id,name,description,body,source}`、用户级 `PublishGrokBotUserSkillsSnapshot{fingerprint}`、模型工具名 `ProposeSkills`（均在 `/dev/shm/grok-re/0.78.1/app/dist/local-exec-daemon/main.cjs`，grep 上述字符串）；UI「Pick from your skills / Add new skill」（`work/p1-re/evidence/chunks/index.eager-app-iGTgHP_Q.js` 键 `76J7mZ`/`C/t3EV`）、「Teach a task」= 录屏示教（`renderer/assets/chunk-teach-recording-controls-*.js`）。**泄漏点**：`agentsHome` 默认 `~/.agents`（真实 HOME），当前该目录不存在但随时可能被别的工具建出 |
| L5 定时 / 外部事件 | 插件+胶水（定时直接用） | `schedule/schedule` §Summary：投递到已有会话 / 复用 / 每次新建，重启后补最近一次；`tool-schedule` 已在 preset（`approval.yml:97`）。`experimental/webhook`（npm 0.2.2-alpha.2 已发布）只会「在 Web Workspace 建新 root session」，要映射到 bot 需胶水 | xmanrui/dsh-im（3274★，2026-11-06 有更新，109 open issue，**issue 回应未核**）——Slack/飞书等 9 渠道接入候选 | BRIEF 验收只要「定时任务按时触发投递到指定会话」= schedule 直接用；Slack bug 收集排在 L5-b。与 P7-L3 相关 |
| L6 连接器 / MCP | 直接用（已有） | `mcp/mcp-client`、`boot/plugin-market`（已在 `app/sdk/package.json` 依赖）；`credentials/authorization` 人工引导登录 | — | 市场 UI + `market/wrapper.mjs` 裸 MCP 包装已有 |
| L7 Vault（能用不可见） | 需自建（依赖 L9） | **dsh 不提供**：`credentials/credentials-local/README.md` §Summary 原文「agent tool processes run as that same user, so this store cannot isolate secrets from the agent」；`client/ui-secret-mask` 只改绘制，「the model input keep[s] the original characters」 | yuloop/dsh-secret-vault（0★）、wangxy496/dsh-sensitive-guard（1★，2026-11-05 才建）、luwenjiede/dsh-vaultx（0★）、Jindom/dsh-bitwarden（0★）——都不满足「在维护」判据 | 原版是浏览器里填 1Password（0.78.1 文案键 `yc/lvg`「Filling 1Password login for …」）→ 跟 L9 浏览器一起做。本期不开单 |
| L8 bot 的电脑（ssh） | 插件+胶水（重胶水） | 官方 `ssh` 族：`ssh/README.md` §Packages（ssh / fs-ssh / subprocess-ssh / sandbox-ssh / ssh-helper-runtime）；`docs/subsystems/ssh.md` §Composition scope。npm 已发布同钉版 `0.2.2-alpha.2`（peer 精确等于我们的钉版，`npm view` 实测），**未安装**；`ssh-helper-runtime` 是 private（npm 404），本机测试用 `launch: node-script` + `dsh-ssh/lib/helper.js` | flymysql/dsh-remote（256★，今天有更新，2 open issue）：另起 21 个 `rw_*` 工具 + 本地镜像，且把主机写进**真实 `~/.ssh/config` 受管块**——违反「不碰真实 HOME」、也不透明 → 不采用（只作 UI 参考）。CrazyShout/dsh-ssh-remote、Yan-Zero/dsh-remote-ssh、UynajGI/dsh-ssh（均 ≤18★）不采用 | 约束见 §3；产品接入卡在与 fs-zone / guard 的组合（T5 设计） |
| L9 浏览器 / 电脑操控 | 插件+胶水（p8） | `browser-use/browser-use`（单 provider 注册表）+ experimental playwright-mcp / chrome-devtools-mcp / stagehand；`computer-use` 注册表 + cua-driver | — | p8 范围；Q-026=A（Xvfb）。experimental 包 npm 名带 `dsh-experimental-` 前缀（`dsh-experimental-agent-team@0.2.2-alpha.2` 存在），其余未逐个核 |
| L10 工程 bot 闭环 | 插件+胶水（部分已有） | `goal` + `goal-round-driver` + `tool-goal`（已在 preset）、`workflow`、`subagent`、`experimental/worktree` + `tool-worktree`、`experimental/forge`（PR 读/合并）、`experimental/auto-review` | — | 我们的 P7-L2；不进第一批 |
| L11 语音 | 插件+胶水 | `experimental/voice-input-bundle`（speech 服务 + 本机 SenseVoice + Remote + 浏览器麦克风）；`experimental/api-speech-to-text` 是 Remote | — | 麦克风 UI 是 dsh web 客户端插件，我们用 renderer-grok → UI 要移植；bundle 的 npm 名未核（`dsh-voice-input-bundle` 404） |
| L12 Room 群聊 | 需自建 | `experimental/liveshare` 是「把一个 session 分享给人」，不是多 bot 房间；agent-team 只在单 session 内 | duxingxiake3/dsh-project-room（1★，0 issue，2026-10-18 后无更新）——不满足判据，可读作参考 | p8 簇 8a |
| L13 iMessage 式外壳 / 审批 | 已有（自建，继续打磨） | `client/ui-approval` 是 dsh web 客户端；后端审批 = dsh `user-approval` + 我们的 `shell-ask` | — | renderer-grok |
| L14 后台常驻 / 跨设备 | 待评估 | `api/gateway`、`api/remote-access`（非 owner Peer 的访问策略）、`api/remotes`；产品已走 `/api` + `remote.mux`（`app/sdk/README.md`） | summer1238/dsh-remote-web-gateway（167★）、dsh-im | 不进第一批 |

## 2. 现有自建模块：能否被插件替代

| 模块（`app/sdk/src/`） | 结论 | 理由 / 锚点 | 若替代怎么迁 |
|---|---|---|---|
| `policy/guard.mjs` + `never-roots.mjs`（凭证 NEVER 拒读） | 不可替代 | dsh `fs-sandbox` 只围写不管读（`fs/fs-sandbox/README.md` §How the fence behaves：「reads stay unconfined」） | — |
| `policy/shell-ask.mjs`（Q-013 档位表） | 部分（不迁） | dsh 只有三档 permission preset + experimental `auto-review`（README 自述「can allow unsafe actions」） | 不迁 |
| `policy/fs-zone.mjs` + `containment.mjs` | 已是第 2/3 级复用；**ssh 下需重做** | 已继承 dsh-fs-sandbox（文件头来源行）；start.ts 禁用 stock fs-sandbox 插入它（`src/start.ts:262-282`）。fs-ssh 把每次调用的 policy 送到远端 helper 执行（`ssh/fs-ssh/README.md` §Use），fs-zone 的 Linux fd 绑定只对本机有效 | T5 设计决定：ssh 模式下 fs-zone 改为包 fs-ssh，还是由 sandbox-ssh 远端围栏承担写侧 |
| `policy/request-net.mjs` | 不可替代 | dsh 无「单次联网升权」 | — |
| `orchestration/*`（P6 跨 bot 委派） | 部分重叠，不迁 | `experimental/agent-team`：Lead/队友/收件箱/冷恢复/任务板，但范围是单 session 内的队伍、替换 subagent 工具名；我们的 bot 是名册里的独立顶层 session + 主 bot 权威 + CONTRACT v1.5 已签 | 不迁；L12 Room 设计时把 agent-team 的任务板当参考 |
| `orchestration/report.mjs` / `delivery.mjs`（P7-F3 存储语义） | 不可替代 | agent-team「message persistence follows the target Agent's normal policy」，不提供恰好一次 | — |
| `admin/*`（P7 管家工具） | 不可替代 | 无对应插件 | — |
| `market/wrapper.mjs`（裸 MCP 包包装） | 暂不可替代 | plugin-manager 要求 `dsh.bundle`（`wrapper.mjs:6-10`）；新版本是否补上未核（见 §5） | 若上游支持，删 wrapper、改走 installBundle |
| `p2temp/*`（临时 preset） | 已是上游 API 胶水 | 直接调 `ctx.agentPresets.register`（`p2temp/index.mjs:259`） | L1 人格编辑复用这条路 |

## 3. L8 关键事实（T2/T4/T5 都要遵守）

1. **OpenSSH 不看 `$HOME`**：`HOME=/tmp/x ssh -G localhost` 仍报 `userknownhostsfile /home/lingxufeng/.ssh/known_hosts`（2026-11-06 实测）。dsh-ssh 用 `execFile('ssh', …)` 且不传 `-F`（`repos/deepseek-harness/packages/ssh/ssh/src/index.ts:251,299-303`）→ 隔离 HOME 挡不住真实 `~/.ssh`。**做法**：测试 PATH 最前放一个 `ssh` 包装脚本，`exec /usr/bin/ssh -F <测试目录>/ssh_config "$@"`。附带好处：所有 ssh 客户端进程的命令行都带测试目录路径，`bot-reap --match` 能清。
2. **服务端用私有 sshd，不用系统 :22**：系统 sshd 要往真实 `~/.ssh/authorized_keys` 加公钥 = 碰真实 HOME。普通用户可以起 `/usr/sbin/sshd -D -e -f <私有配置>`（OpenSSH 9.6p1，2026-11-06 实测：127.0.0.1 高端口、`UsePAM no`、`StrictModes no`、`PermitUserRC no`、私有 HostKey / AuthorizedKeysFile、`AllowStreamLocalForwarding yes`、`AllowTcpForwarding no`、`ForceCommand` 包装脚本改写 `HOME`/`TMPDIR`/DBus 后 `exec /bin/sh -c "$SSH_ORIGINAL_COMMAND"`，登录成功且远端 `HOME` 为测试目录）。
3. **测试目录必须在 bot-reap 白名单下**（`/tmp/bot-*` 等，`scripts/bot-reap:19`）：sshd 会 chdir 到 `/`，bot-reap 只能靠命令行里的配置路径认出它。经理本次探针目录用了 `/tmp/mgr-sshd-probe.*`，留下一个 sshd 清不掉（见回报）。
4. **dsh-ssh 写死 `/tmp/dsh-ssh-*`**（控制套接字目录，`ssh/src/index.ts:280`），不随 TMPDIR；只有 `dispose()` 会删 → 测试必须 dispose，验收要数这个前缀的残留。
5. **helper 必须在 bwrap 私有 `/tmp` 之外**（`ssh/ssh/README.md` §Deployment prerequisites）→ 施工 worktree 不能放 `/tmp/bot-wt/`（node_modules 里的 helper.js 会落在 /tmp 下），改放 `/dev/shm/bot-T<N>`（在 bot-reap 白名单内）。
6. helper 用 pnpm 自带的 Node 24（系统 node 是 v22.23.4；`--disable-sigusr1` 等按 Node 24 测）。
7. 连接不重连、不重放（`docs/subsystems/ssh.md` §Process lifetime）：断线后操作报「结果未知」——产品接入时 UI 要能表达。
8. dsh 文档写明 Web workspace 视图假定宿主文件系统（`ssh/ssh/README.md` §Known Limitations），我们关掉了 web UI 行，影响面待 T4 实测。
9. **AllowTcpForwarding 与 streamlocal 耦合（T2 实证，2026-11-06）**：OpenSSH 9.6p1 下 `AllowTcpForwarding no` 会拒绝 direct-streamlocal 的 connect（`channel_connect_to_path` 吃 `do_authenticated` 按 FORWARD_LOCAL 装配的许可集；`allow_streamlocal_forwarding yes` 只放行 channel-open）。私有 sshd 夹具必须 `AllowTcpForwarding local`（最小档：direct 方向放行、远端监听仍拒）。见 receipts/T2.md §5.1。
10. **硬杀留空 `/tmp/dsh-ssh-*` 目录是已接受残留（T2c 裁决，2026-11-06）**：测试进程被 SIGTERM/SIGKILL 时，`setpriv --pdeathsig` 收走 sshd 与 ssh master（端口拒连、无进程），但第 4 条的控制套接字目录无人删，每次留 1 个空 0700 目录。不做启动期清扫：`/tmp/dsh-ssh-*` 不按进程归属命名，扫陈年目录会碰别的测试或将来产品连接的目录。夹具只登记「本实例 ssh 客户端命令行 `-S` 指向的目录」（@01b4dc6），exit 路径清零。产品侧同样存在（宿主被强杀时），T5 设计时一并看。

## 4. 工单计划

见 `work/tickets/queue.md`。第一批开 3 张（三条独立链，各写两张开一张）：

| 工单 | 内容 | 状态 |
|---|---|---|
| T1 | P5-H5a：unit / support / market / examples 裸 mkdtemp → tmkdir，残留计数 RED | **done**（accepted 2026-11-06 @ d9cd458，经理重跑 start 36 绿残留 0；可合并） |
| T2 | L8-a：私有 sshd 测试夹具 + 装 dsh ssh 族 + 连接级验收 | **done**（accepted 2026-11-06 @ 01b4dc6，含 T2b/T2c；ssh-host 10/10、M1/M2 各红一格、strace 0、三种中断端口拒连；可合并 feat/T2 → 集成分支） |
| T2b | T2 测试侧返修：端口只认 ECONNREFUSED、③b 断连后 fs 报传输错、⑥ stop 前必见 helper/master、快照加 mode/ctime/ino、⑤ 注释、三变异各红一格 | **done**（accepted 2026-11-06 @ 01b4dc6） |
| T2c | T2 夹具侧返修：单条 SetEnv 带 HOME + cd remote-home、setpriv --pdeathsig、setup 失败回滚、strace 0 次真实启动文件、三种中断后端口拒连 | **done**（accepted 2026-11-06 @ 01b4dc6；硬杀空目录残留豁免，见 §3 第 10 条） |
| T3 | L4-a：0.78.1 skill 生命周期 RE（派 reverse-engineer） | **done**（accepted 2026-11-06，含 T3b） |
| T3b | RE-skills.md Q6 投递方式降为推断 + 两条反证计数 + 影响节第 6 条收窄 | **done**（accepted 2026-11-06 @ 316b6c9，已在集成分支） |
| T4 | L8-b：headless 真组合 + llm-replay，bash/写文件经 ssh 落到远端 | **done**（accepted 2026-11-06 @ f8d1e00c，`tickets/done/T4-l8b-ssh-headless.md`；待合并） |
| T5 | L8-c：设计单，**manager 执笔** `DESIGN-ssh-composition.md`（D1–D13：fs-zone/guard/shell-ask/bwrap/P6 cwd/isolate/断连 UI/PTC/宿主直连行/helper 安装/残留/每账户或每 bot/产品化 patch + 删 T4 死代码） | **done**（accepted 2026-11-06 @ 10e9951b，r2；实现单 T9a 已开，T9b–T13 见 queue） |
| T6 | L4-b：skill 根收口（关 `~/.agents` 泄漏）+ bot 在对话里存 skill 的真组合 e2e | **done**（accepted 2026-11-06 @ 80958ad0，`tickets/done/T6-l4b-skill-save.md`；待合并） |
| T7a | L4-c：main IPC `pbots:skills` list/enable/disable，启用 = 复制快照到 bot 私有根；库 = 全 bot 并集派生视图 | **open**（`tickets/open/T7a-l4c-skill-enable-api.md`） |
| T7b | L4-c：info pane Skills 段 +「Pick from your skills」，R3 参照图对 0.78.1 | **open**（第 2 步起等 T7a；`tickets/open/T7b-l4c-skill-picker-ui.md`） |
| T8 | P5-H5b：e2e/*.test.ts 裸 mkdtemp | 计划（等 T1） |

## 5. 核实不了 / 存疑（单列）

1. **[已定 2026-11-06，T5 D6：不能，进程级；旧 bot 处理见 Q-029]** **ssh 能否按 preset 隔离**（只给部分 bot 远端电脑）：Loader 支持 `isolate`（`docs/user/develop/framework/service.md` §Service isolation，preset 里也在用，`bundle/web-app/presets/standard.patch.yml:51`），但上游只文档化进程级 ssh 组合；`bash-sandbox`、`sandbox-policy`、`working-directory` 都在顶层，isolate 后是否全链跟着切未知。T4 只测进程级，T5 再决定。
2. **[已证 2026-11-06，T2]** subprocess-ssh 的 env 叠加在远端 helper 环境之上：PBOTS_SSH_MARK 经 sshd SetEnv/ForceCommand 注入 helper 会话，未显式传给 spawn 仍出现在子进程 stdout（receipts/T2.md §5.2）。
3. **[已证 2026-11-06，T2]** npm 版 dsh-ssh 的 helper.js 在 pnpm 布局下 peer 解析正常（realpath 进 .pnpm store 有效，ready/fs/subprocess/sandbox 全通）。
4. **[已核 2026-11-06，T5 D10]** 真实远程主机怎么装 helper：37 个 release 全部 0 asset、npm 无 helper-runtime 包（`tickets/evidence/T5/d10-release-assets.txt`）→ node-script 闭包推送（T13）。
5. **[已定 2026-11-06，T3+T6 开单]** 原版「对话里存 skill」：有两条路——bot 直接写进扫描根（box 内 `.agents/skills` 等，无审批，RE-skills Q1/Q6）与 `ProposeSkills` 审阅项（落 per-agent，Q3）。T6 只做前者；审阅链列 queue 提议，T7 后定。
6. **[已定 2026-11-06，T5 D12：box 按 agentId 记账、共用与否不可见；按每运行时一台]** **原版 bot 的电脑是每账户一台还是每 bot 一台**：BRIEF L8 写「bot 共用一台电脑」，与进程级 ssh 吻合；未在 0.78.1 里核。T5 设计前由 RE 补一句锚点即可，不必问用户。
7. **[已核 2026-11-06，T15 EVAL §7 第 21 条：没修]** `market/wrapper.mjs` 的缺口在 dsh 0.2.2-rc.1 是否已补：plugin-manager 仍拒裸 MCP 包（`not-bundle` 计数两版各 6），wrapper 继续保留。
8. 第三方仓的「issue 有人回应」只看了 open issue 数，没逐个看回应；表里凡标「不采用」的都不影响决策，dsh-im 若要用需先核。
