# 工单队列

顺序由 manager 维护；`open/` 只放现在就能做的单。下表是计划，状态以工单所在目录为准。
更新：2026-11-06 11:30 manager 任务 B（T7bb 终验**不通过**〔T7b 链第 2 次，任务 C 重拆 → T7bc〕；T7c 终验**不通过 第 1 次** → T7cb；feat/T7b、feat/T7c 均不合并）。再上一轮：2026-11-06 10:35 manager 任务 B（T7b 终验**不通过 第 1 次**：功能链全过、截图两处破版 → `open/T7bb-skill-picker-visual.md`；降级参照接受；feat/T7b 暂不合并）。再上一轮：2026-11-06 10:10 manager 任务 B（T7ac 终验**通过**〔附合并前置一行断言〕→ T7a/T7ab/T7ac 三单 done，accepted @ 296a66c9；**feat/T7a 可整枝合并**；T7b 第 2 步在合并后解锁）。再上一轮：2026-11-06 09:45 manager 任务 B（T7a 二验 + T7ab 终验：三个原探针场景已堵死，T7a 本单项全过；T7ab 不通过（第 1 次）→ `open/T7ac-skills-list-staging-layers.md`：list 目标未过逐层检查〔读外部 frontmatter〕+ `.skills-staging` 链接未查〔经理前提错〕+ ⑥ 补断言未落；**feat/T7a 暂不合并**，T7ac 过后三单一起 done/合并）。再上一轮：任务 B（T14 验收 → done，结论 REFUTED 非产品缺陷，**feat/T14 可合并**；T7a 不通过（第 1 次）→ 开 `open/T7ab-skills-path-symlink.md`：main 顺 bot 工作区内符号链接写/删出界（CONFIRMED）+ 两处漏测分支 + 回执补正文；T7b 第 2 步改等 T7a+T7ab 合并）。再上一轮：任务 B（T15 验收通过 → done；升级单转计划行 T16，插 T9a 与 T9b 之间；T9b 改依赖 T16）。再上一轮：任务 A（用户新决策：开 T7c〔Q-028=B〕、T15〔rc.1 评估〕；T13 改「等用户」；T11 去掉 Q-029 依赖）。再上一轮：任务 B（T5 r2 验收通过；开 T9a；T14 补验收 5b）。上一轮：任务 A（开 T5、T7a、T7b；新 Q-028）。

**主 agent 待办（11:30 起，取代下段）**：⓪ `~/bot/scripts/bot-reap 2430035 2445309 2481864`（T7c 施工残留 dsh runtime）① 并行施工 T7bc（feat/T7b）与 T7cb（feat/T7c），GLM ≤2 并发、e2e 同刻一套 ② T9ab 照常 ③ 三单回执齐 → 经理任务 B ④ 合并顺序不变：feat/T7b → feat/T7c → T9a（T9ab 过后）→ T16 → T9b。

~~10:35 待办~~：⓪ `~/bot/scripts/bot-reap 2149395`（T7b 施工残留 Xvfb :99）① 施工 T7bb（feat/T7b 续提交，小单）→ 经理任务 B ② 过后 feat/T7b 整枝 `--no-ff` → `docs/rebuild-p6-p5-plan`；回测（主仓 app/ui，隔离 HOME/TMPDIR/DBus + `PLAYWRIGHT_BROWSERS_PATH`）：`pnpm build` + `run-e2e.sh tests/e2e/skills-picker.spec.ts tests/e2e/skills-enable.spec.ts tests/e2e/ws-write.spec.ts` + `vitest run tests/unit/skills tests/unit/m3` ③ T9a 照常并行 ④ 之后：T7c（T7b 合并后）→ T9a 合并 → T16（低负载）→ T9b。GLM ≤2 并发、e2e 同刻一套。

~~10:10 待办~~：① 合并前置（在 /tmp/bot-wt/T7a 上一个小提交，只动 `app/ui/tests/unit/skills/index.test.ts` 与 `work/tickets/receipts/T7a.md`）：`index.test.ts:141` 后加 `expect(skillCount(dataDir, 't'), 'SKILL.md 链接格目标无新增').toBe(0)`；回执对号表 ⑥ 行改成如实（贴 `git diff 296a66c9..HEAD -- app/ui/tests/unit/skills/index.test.ts` 原样）；跑 unit → 11 passed。② feat/T7a 整枝 `git merge --no-ff feat/T7a` → `docs/rebuild-p6-p5-plan`（三方合并，不整树覆盖）；回测（主仓 app/ui，隔离 HOME/TMPDIR/DBus + `PLAYWRIGHT_BROWSERS_PATH=/home/lingxufeng/.cache/ms-playwright`）：`pnpm build` + `pnpm --config.verify-deps-before-run=false exec sh scripts/run-e2e.sh tests/e2e/skills-enable.spec.ts tests/e2e/ws-write.spec.ts` → 2 passed + `vitest run tests/unit/skills tests/unit/m3` 全绿；合并后 `git diff 296a66c9 feat/T7a --stat` 只含 ① 两文件。③ T7b 第 2 步解锁（第 1 步参照图可并行先做）④ T9a 可与 ③ 并行（不碰 skills 文件）⑤ 之后按序：T7c（T7b 后）→ T9a 合并 → T16（低负载窗口）→ T9b。GLM 并发 ≤2；同一时刻 e2e 只跑一套。

~~09:45 待办~~：① 施工 T7ac（feat/T7a 续提交，小单，最优先）→ 经理任务 B ② 过后 feat/T7a 整枝 `--no-ff` → `docs/rebuild-p6-p5-plan`，回测：主仓 `app/ui` `pnpm build` + `pnpm --config.verify-deps-before-run=false exec sh scripts/run-e2e.sh tests/e2e/skills-enable.spec.ts tests/e2e/ws-write.spec.ts` + `vitest run tests/unit/skills tests/unit/m3` ③ T7b 第 1 步（参照图）现在可做，第 2 步等 ② ④ T9a 可与 ① 并行（不碰 skills 文件）⑤ Q-028 已答 B（T7c 排 T7b 后）。

~~旧待办~~：⓪ 先 `~/bot/scripts/bot-reap 548446 1737983 1704151`（T7a/T14 施工残留 dsh runtime + 2 个 Xvfb）① **合并 feat/T14**（b8b243c5）→ 集成分支 `docs/rebuild-p6-p5-plan` `--no-ff`，回测见 T14 行 ② **施工 T7ab**（在 feat/T7a 上续提交；小单，优先）→ 经理任务 B → 通过后 feat/T7a 整枝 `--no-ff` 合并 ③ T7b 第 1 步（参照图）现在就能做；第 2 步起等 ② 合并 ④ T9a 可与 ② 并行（T14 无产品改动，guard.mjs 不再冲突）。GLM 并发 ≤2；同一时刻 e2e 只跑一套。⑤ 把 Q-028 转给用户（不阻塞，默认 A）。

## 可做区（按序；三条链互不依赖，可并行施工，但同一时刻全量测试只跑一套）

| 序 | 工单 | 来源 | 依赖 | 状态 |
|---|---|---|---|---|
| — | T1 P5-H5a unit/support/market/examples 裸 mkdtemp → 受管，残留归零 | HANDOFF §3-3 | — | **done**（accepted 2026-11-06 @ d9cd458，可合并） |
| 1 | T2b T2 测试有效性返修：端口只认 ECONNREFUSED + 自检、③b 断连后 fs 报传输错、⑥ stop 前必见 helper/master、快照加 mode/ctime/ino + 自检、⑤ 注释、三变异各红一格 | review 两席 + 经理核实 | — | **done**（accepted 2026-11-06 @ 01b4dc6） |
| 2 | T2c T2 夹具侧返修：单条 SetEnv（mark+HOME+REMOTE_HOME）+ cd remote-home、sshd/bin/ssh 走 `setpriv --pdeathsig TERM`、起 sshd 后全进 try、strace 0 次真实启动文件、三种中断 10s 内端口拒连（T2b 拆出的另一半，不计 T2 失败次数） | security 席发现 1/2 + 经理核实 | T2b 提交（同改 ssh-host.ts） | **done**（accepted 2026-11-06 @ 01b4dc6；硬杀空目录残留豁免） |
| 3 | T3b RE-skills.md Q6 投递方式降为推断，引 `agentSkills:` 0 次 / `.agentSkills=` 仅构造器两条反证，影响节第 6 条收窄 | test-validity 席第 6 条 + 经理核实 | — | **done**（accepted 2026-11-06 @ 316b6c9，已在集成分支） |
| — | T2 L8-a 私有 sshd 测试夹具 + dsh ssh 族连接级验收 | p9 PLAN §1 L8、§3 | — | **done**（accepted 2026-11-06 @ 01b4dc6，含 T2b/T2c；**可合并** feat/T2 → 集成分支 --no-ff） |
| — | T3 L4-a 0.78.1 skill 生命周期 RE | p9 PLAN §1 L4 | — | **done**（accepted 2026-11-06，含 T3b；已在集成分支） |
| 4 | **T4** L8-b headless 真组合（`done/T4-l8b-ssh-headless.md`）：上游 headless profile + 测试生成的 ssh patch（禁 fs-sandbox/subprocess/sandbox/session-title-llm/PTC 行、插 ssh 四件、sandbox-policy 指远端 ws）+ llm-replay；① bash 写 sshd 独有 marker、write 落远端 ws；② 断连后 15s 内报错、不回落本机；M1–M3 变异各红一格；夹具拆出 `startSshServer()` | p9 PLAN §3 | T2 系（已合并） | **done**（accepted 2026-11-06 @ f8d1e00c，**可合并**） |
| 5 | **T5** L8-c 设计单（`open/T5-l8c-ssh-composition-design.md`，**施工 = manager 执笔**）→ `work/p9-dsh-integration/DESIGN-ssh-composition.md`：D1–D13（fs-zone 换/包 fs-ssh、guard NEVER 远端语义、shell-ask 档位、bwrap runner/request-net、P6 worker cwd、进程级 vs isolate、断连 UI、PTC、宿主直连行去留含 skill 根、真实远程装 helper（先核 release assets）、强杀残留、每账户/每 bot 一台电脑、产品化 patch 形态 + **删 T4 重复 llm-replay**）；产出实现单计划行与新 Q | p9 PLAN §2 fs-zone 行、§3、§5-1/4/6；receipts/T4 §5 | T4 验收（已过） | **done**（accepted 2026-11-06 @ 10e9951b；r2 + 小勘误并入 T9a/T9b/T10） |
| 5a | **T9a** ssh 组合骨架：**第一步删 `ssh-headless.test.ts:111-122` 重复 llm-replay**（贴删后 14 passed）；`P2SDK_SSH_*` + `start.ts` `sshRows`（先插原版 fs-ssh/sandbox-ssh）；禁 `ptc-runtime` 等；guard 工具名拒 `glob`/`grep`（tool-fs-search 嵌在 5 个 preset 里）；`ssh-product.test.ts` ⑧⑨⑪（从组合后 profile 枚举全部 preset）+ start 单测 | DESIGN-ssh-composition D8 D9 D11 D13 | T5 验收 | **doing，验收不通过（第 1 次，2026-11-06 @ 64bc35c9）**→ `open/T9ab-ssh-skeleton-e2e-real.md`：D8 前提证伪（禁 `ptc-runtime` 致默认 preset `agent-preset/invalid`，ssh 模式建不出会话；M1 实测只禁 T4 三行会话可建）→ 改走「更早断」分支；⑨⑪ 为 `expect(true)` 空断言；`tests/support/runtime.ts` 越界。**feat/T9a 不合并**；T9ab 若见 `workflow` 仍出现 → architect 重定 D8。只开测试入口，产品/UI 不设 `P2SDK_SSH_*` 直到 T10 验收 |
| 5a″ | **T16** dsh 9 依赖一次升到 0.2.2-rc.1（EVAL-dsh-rc1 §8 草案）：① 备份 `$DSH_HOME` 会话目录 + 回退步骤（`dffda31215` 迁移 jsonl）② 一次升齐 + `pnpm why @deepseek-ai/cordis` 只一份 4.1.0（peer 不相交）③ 三件安全修补各先红：envelope `JOB_TOOLS`/`ENTRY_ANNOTATIONS` 换 `schedule_edit`/`schedule_view`（先红=worker 调 `schedule_edit` 被放行）；guard `NEVER_TOOLS` 加 `apply_patch` + approval.yml 三段 preset 副本按 rc.1 逐字重抄并显式 `applyPatch: false`（先红=overlay 开 applyPatch 后 `apply_patch` 写 `/tmp/x` 不被预执行层拦）；执行层 `patchText/deleteFile/moveFile` 经 fs-zone `checkedTarget` 拒区外写与 NEVER 的证明格④ 锚点重定（envelope/request-net/p2temp 注释、DESIGN-ssh-composition §6 表、D1 改五入口、T9b 验收同步、p9 PLAN 钉版）⑤ 全量回归对照升级前基点（含 P5-04 ⑤ 顺序证明格） | T15 EVAL §8 | T14（done）、T7a+T7ab、T7b 验收；T9a 合并；**低负载窗口**（全量回归） | 计划（排 T9a 后、T9b 前；T7c 不必等它——rc.1 下 apply_patch 默认关，且 T16 的 NEVER_TOOLS 补齐 T7c 的绕过面） |
| 5a′ | T9b 文件工具安全：`fs-zone-ssh`（覆盖 writeText/editText）、guard 远端根 + `remoteHome` 启动校验、containment 纯词法开关（`P2SDK_SSH_MODE`）；`ssh-fs-zone.test.ts` 绕开 pre-execute 直测 provider ①（若 ①b 先红不成立，兜底先红用 ①d dfa 下 NEVER，**不是** ①c——原版围栏也拒 remoteHome 链）、加 `P2SDK_SSH_REMOTE_HOME`、`ssh-product.test.ts` ②、containment 单测 | DESIGN-ssh-composition D1 D2 | T9a、**T16**（对着 rc.1 一次写五个写入口 writeText/editText/patchText/deleteFile/moveFile，moveFile 源与目标都过 zoneGuard） | 计划 |
| 5b | T10 远端 bash 套 wrapper：`wrapperArgv` 抽取（宿主 computeRoots 全套 ∪ 远端根）+ `sandbox-zone-ssh` + 单测；`ssh-bash.test.ts` ③④（先红 = T9 组合下 bash 读到宿主哨兵）；**④d 必须加变异「Hello.root 当 `--policy` 传 → ④c 红」**——基线 profile 自带 `--tmpfs /tmp`，④c 在 T9 下也绿，只有这个变异能证伪它 | DESIGN-ssh-composition D3 D4 | T9b | 计划 |
| 5c | T11 main 侧远端工作区：`p2sdk/workspace.root/ensure` RPC、`mintWorkspace` 按模式分支（#3/#4/worker 共同入口）；worker 远端 cwd；Q-029 旧 bot 处理；T7a 在 ssh 模式拒 → SDK 侧复制 | DESIGN-ssh-composition D5 D6 D9 | T10、T7a、P6-24（Q-029=A 已定：整机切换，旧 bot 工具调用拒+提示） | 计划 |
| 5d | T12 断连体验：`endNotice` 专用「可能已执行」文案 + 「重新连接」按钮（触发 = main 事件流见 `SSH connection is closed`；dsh 进程仍活，launcher 看不到）+ 复用 launcher 重启路径、不重放 | DESIGN-ssh-composition D7 | T9 | 计划 |
| 5e | T13 真实远程：helper 闭包推送（release 0 asset，D10 实测）+ hash、wrapper/slirp 推送、远端 SpillStore、远端 PATH 核对 | DESIGN-ssh-composition D4 D9 D10 | **等用户**（2026-11-06 用户定调：本地体验稳固后再测真实远程；届时向用户要主机） | 计划 |
| 6 | **T6** L4-b skill 根收口 + 存 skill 真组合（`done/T6-l4b-skill-save.md`）：`childEnv` 无条件设 `DSH_AGENTS_HOME=<cfg.home>/agents`（skill-filesystem 与 agent-instructions 一并收住）；e2e 四格：bot A 用 write 存 `.dsh/skills/t6-flow/SKILL.md` → A 新会话目录出现且 `skill` 加载全文 → bot B 看不到 → 隔离 HOME 的 `.agents` 探针不出现、新根正对照出现。审阅链不进本单（理由见工单） | p9 PLAN §1 L4、RE-skills | T3 系（已在集成分支） | **done**（accepted 2026-11-06 @ 80958ad0，**可合并**） |
| 7a | **T7a** L4-c main 侧 skill 启用 API（`open/T7a-l4c-skill-enable-api.md`）：IPC `pbots:skills` list/enable/disable；**启用 = 复制快照**到 `workspaces/<botId>/.dsh/skills/<name>`（staging 后 rename，拒符号链接/穿越，256,000 字符、每 bot 250、撞名 -2 并改 frontmatter name）；「你的 skills」= 全部 bot 私有根的**派生并集视图**，不另建库目录（无写入方；共扫根约束自然满足）；e2e：A 在对话里 write 存 → B 启用 → 先改 A 源 → B 首次 load 拿到旧正文 → disable 只删 B 副本；M1 符号链接冒充复制必红 | BRIEF 验收第 2 条；RE Q2/Q4/Q7 | T6（已合并） | **done**（accepted 2026-11-06 @ 296a66c9，与 T7ab/T7ac 一并；合并前置一行断言后整枝合并。旧注：二验 2026-11-06 @ d44ee165：本单项全过，等 T7ac 后与 T7ab/T7ac 一起 done/合并；首验 @ 7bccb802 **不通过 第 1 次**：功能链全绿〔unit 8/8、m3 103、e2e 1 passed、M1–M3 各红〕，但 main 顺 `.dsh` 链接写/删工作区外 CONFIRMED + M4/M5 变异存活 + 回执无正文 → T7ab；**未合并**） |
| 7a′ | **T7ab** T7a 返修（`open/T7ab-skills-path-symlink.md`）：`.dsh`、`.dsh/skills` 逐层 lstat 拒链接（源/目标/disable/list 四处）+ ⑨ 出界格（断言外部目录不变）+ ⑩ 补 M4/M5 漏测分支 + M6 变异 + 回执补正文 | 经理任务 B 探针 | — | **done**（accepted 2026-11-06 @ 296a66c9 经 T7ac；旧注：验收 @ d44ee165 不通过 第 1 次 → T7ac；原三探针已堵死）（feat/T7a 上续提交；过后 T7a+T7ab+T7ac 一起合并，回测：主仓 app/ui `pnpm build` + `pnpm exec sh scripts/run-e2e.sh tests/e2e/skills-enable.spec.ts tests/e2e/ws-write.spec.ts` + `vitest run tests/unit/skills/ tests/unit/m3`） |
| 7a″ | **T7ac** T7ab 返修（`open/T7ac-skills-list-staging-layers.md`）：`assertSkillLayers` segments 加 `.dsh/.skills-staging`、list 分支对目标 bot 也调；⑪abc + ⑥ 补断言；M7/M8 变异；回执给原样输出 | 经理探针 P4/P5/P6 | — | **done**（accepted 2026-11-06 @ 296a66c9；①② 成立、M7/M8 咬合；③ ⑥ 断言第 2 次虚记，风险低，降为合并前置一步，不转 C） |
| 7b | **T7b** L4-c info pane Skills 段 +「Pick from your skills」对话框（`open/T7b-l4c-skill-picker-ui.md`）：第 1 步 R3 桩渲 0.78.1 Context 对话框 skills 两态亮暗参照图（约 2h 止损）；接 `pbots.skills`；e2e 以 B 磁盘副本为准 + 250 上限提示；8 张图（含 ours\|ref 拼图）；`pnpm check` 上游 diff=0 | BRIEF 验收第 2、4 条；RE Q4 | 第 1 步无；第 2 步起 T7a+T7ab 合并 | **doing**（T7bb 终验 2026-11-06 @ f0a14235 **不通过 第 2 次** → T7bc，再不过挪 blocked 交用户；终验 2026-11-06 @ 0c9bd212 **不通过 第 1 次**：功能链全过〔e2e 2 passed、M1 红、check diff=0〕；截图两处破版 → T7bb；降级参照接受、compare 免做） |
| 7b′ | **T7bb** T7b 返修（`open/T7bb-skill-picker-visual.md`）：对话框 `t7b.css`（候选行名字/来源/描述分开、×换 SandIconButton）、Pick 按钮 secondary（暗色字可读）、删 pbots-ui 死 re-export、Remove 失败可见、pick 截勾选态 | T7b 终验 | — | **doing，不通过**（@ f0a14235：pick.dark Add 不可读；pbots-ui 死行回执虚报未删；×/void SandIcon/Remove 失败可见漏做；回执文件撞合并）→ T7bc |
| 7b″ | **T7bc** T7bb 返修（`open/T7bc-skill-picker-visual-2.md`）：暗色 Add 可读（作用域一条规则）+ 计算样式「字色≠底色」先红断言 + 补三项漏做 + 删死行 + 回执挪回集成分支 | T7bb 终验 | — | **open**（feat/T7b 续提交；过后 T7b+T7bb+T7bc 一起 done、整枝合并） |
| 7c | **T14** 缺陷：产品组合下 bot `write` 自己工作区被 guard 软遮蔽拒（`sandboxPolicy.resolve` 无 workspaceRoot；首要嫌疑 = M1 带 sessionId 的 claim 建会话）（`open/T14-ws-write-guard-mask.md`）：sdk 层三格最小复现（claim / mint 对照 / 去 presets.yml）→ 根因 → 根因处修，不放宽遮蔽；验收含 T7a e2e 解阻 | receipts/T7a 附记；T5 复审附带初判 | — | **done**（accepted 2026-11-06 @ b8b243c5；**REFUTED 非产品缺陷**＝spec 两侧数据根分叉；无产品改动。**可合并** feat/T14 → `docs/rebuild-p6-p5-plan` `--no-ff`；合并后回测：`app/sdk` `vitest run tests/e2e/ws-write-claim.test.ts`→3 passed；`app/ui` `pnpm build && pnpm exec sh scripts/run-e2e.sh tests/e2e/ws-write.spec.ts`→1 passed） |
| 7d | **T7c** L4-d bot 写 / 改自己 skill 根（`.dsh/skills`、`.agents/skills`）出确认卡（`open/T7c-l4d-skill-write-card.md`，Q-028=B）：shell-ask workspace-write 分支一条判定 + 原因串，自主门开也出卡；子代理拒；T6 `skill-save.test.ts:222` 与 T7a `skills-enable.spec.ts` 的旧断言明着修订（回执列对照表）；bash 路径为已知缺口 → T7d | Q-028 答复 B；RE-skills Q3 | **T7b 之后**（T7a 合并后才能修订其 spec） | **doing，不通过 第 1 次**（@ b0ee442a：⑦ 空断言、⑧ 未进有效门开态、skill 根未规范化；**feat/T7c 不合并**）→ T7cb |
| 7d′ | **T7cb** T7c 返修（`open/T7cb-skill-write-card-cells.md`）：⑦ 照 write-outside ⑦ 造 never 子代理；⑧ provision 后对照 0 卡 + skill 1 卡；⑨ 工作区经链接且根未建 → 先红再定是否 `canonicalPath`；M1/M3 | T7c 终验 | — | **open**（与 T7bc 并行；合并仍 T7b 先） |
| 7e | T7d 补 bash 缺口：bot 工作区建出时预建 `.dsh/skills`、`.agents/skills`，bwrap wrapper 对会话工作区下这两个目录（或整个 `.dsh`/`.agents`）ro-bind，使 bash 写不进 skill 根（挂载点不可 rename/rm）；先红 = T7c 后 bash `cat > .dsh/skills/x/SKILL.md` 零卡写成 | T7c 回执 | T7c | 计划 |
| 7f | **T15** 上游评估 dsh 0.2.2-alpha.2 → rc.1（`done/T15-dsh-rc1-upgrade-assessment.md`）→ `p9-dsh-integration/EVAL-dsh-rc1.md` | 主 agent 上游巡检 2026-11-06 | — | **done**（accepted 2026-11-06 @ 2ee87e18；§2 结论无关，T14 继续在 alpha.2 上查；升级单转正式计划 = 5a″ T16） |
| 8 | T8 P5-H5b `tests/e2e/*.test.ts` 裸 mkdtemp → tmkdir（约 25 个文件）；验收用 `vitest list tests/e2e`（只收集不跑）抓 import 错 + 抽 3 个快文件跑残留计数 | HANDOFF §3-3 | T1 验收（已通过，可开；照 T1 的写法；已知残留源含 `tests/e2e/market.test.ts:108` 的 `p2sdk-t09-patch-`） | 计划 |
| 9 | L5-a 定时投递 e2e：schedule 一次性任务按时投递到指定 bot 会话（BRIEF 验收第 3 条；`tool-schedule` 已在 preset，预计只要测试 + 少量胶水） | BRIEF 验收第 3 条 | — | 计划（T2–T4 后开，避免同时三条以上链） |
| 10 | P5-H7 实证：`PBOTS_TEST_WORKERS` 下双全量并行一次（代码侧已完成 2c20a2c） | HANDOFF §3-2 | **load < 8 的窗口**（GPU 训练中不跑） | 等低负载 |

## 待排查（先查再拆，不开单）

| 项 | 内容 | 下一步 |
|---|---|---|
| P6-14b 前置 | 48 组定案（先修采集器等待条件）、启动顺序核对（f4 遗留③）、persona/section 在场断言（`p6-orchestration/PLAN.md:66,74`） | manager 下次任务 A 拆成 3 张；L2 端到端（BRIEF 验收第 1 条）依赖它 |
| P5-H6 | 主仓 checkout 跑 `orchestration-create-live.test.ts` 三格确定性红（③′/⑫/②′），worktree 全绿 | 先做差异探针（cwd / `.git` 祖先 / 残留 home）再定单 |
| P5-H8 | guard-fs① / w1ap0-matrix①⑦ 600s 超时在基点也红 | 低负载窗口单跑定性后再定单 |

## 阻塞（不要动）

| 项 | 在等什么 |
|---|---|
| ~~P7-F3~~ | **已解锁**（Q-027=A 定稿 2026-11-06：最小存储契约批准 → P7-F3.f3 可开，按 `p7-admin/evidence/P7-F3/REPLAN.txt` §6 验收；待 manager 任务 A 拆单） |
| P7-F2 | 冻结 |
| P6-24 | 原版删除语义（0.78.1 RE） |
| ~~P6-23 后续 / Q-023~~ | **已定稿**（Q-023=A 2026-11-06，已实施的「直接拒绝」保持，无后续单） |
| L3 CreateAgent（P7-M1） | P7-F2 / P7-F3 |

## 已完成（不再排）

- P5-H1：cherry-pick 048c082 + 补丢失 hunk 31595d9，定向 36+9 绿、handoff 残留 0（HANDOFF §3 第 1 条已过时）。
- P5-H7 代码侧：2c20a2c（vitest.config.ts 读 `PBOTS_TEST_WORKERS`，单测三格）。实证见可做区第 10 行。

## 提议（未开单）

- ~~升级单（T15 草案）~~ → 已转正式计划 5a″ T16（2026-11-06 任务 B）。
- **生产两侧数据根靠约定对齐**（T14 验收旁证，未实测）：runtime 缺省 `$HOME/.config/pbots-ui`（`sdk/src/start.ts:78-83`，不读 `XDG_CONFIG_HOME`），Electron `userData` 按 XDG 规则取 `${XDG_CONFIG_HOME:-~/.config}/pbots-ui`。用户设了非缺省 `XDG_CONFIG_HOME` 时两侧分叉＝T14 现象进生产，且真实 bots.json/工作区落在 runtime 遮蔽根之外。建议一张小单：先写探针（设 `XDG_CONFIG_HOME` 起 shell，比 `app.getPath('userData')` 与 runtime mask 根），成立再定修法（runtime 也按 XDG，或启动时一侧校验另一侧）。
- T14 遗留清理（低优先）：`app/ui/tests/e2e/ws-write.spec.ts` 删 `[T14-ins]` 插桩与 3 秒 follow，读 `requests.jsonl` 改轮询（LEARNINGS 规范），改正「main 缺省 userData」注释；可并入下一张碰 UI e2e 的单。
- ~~T4 残留~~ → 已并入 T5 D13（第一张 ssh 实现单删 `ssh-headless.test.ts:111-122`）。
- L4 独立账户库 + 「Add new skill」手填 + 文件导入（RE Q4：7 种扩展名 txt/md/markdown/csv/json/yaml/yml、非 UTF-8/空/超限各报 skip）：T7a 的库是派生视图，有了这些写入方再建 `$PBOTS_DATA_DIR` 下独立库目录（不能放共扫根）。届时 A 删除自己的 skill 不再让它从库里消失。
- L4 其余入口（建 bot 向导、bot 复制带 skill、聊天内挑选卡）：T7b 只做 info pane 一个入口。
- （T7b 终验提议）暗色 neutral primary 按钮字色疑与底色同为浅色（`p5-55-palette.css` cursor-dark `--sand-text-on-primary: #f5f5f5`）：核 new-bot-dialog「Create」、market「New bot with this app」暗色截图，成立则改调色板一处。
- （T7b 终验提议）0.78.1 Context 对话框参照补渲：R3 桩直接挂 `chunk-team-bot-context-dialog` 组件（绕开 team 面入口），可与 T16 后一并做；做出后补 compare 拼版。
- L4 扁平 `<name>.md` skill 的列出/启用：T7a 扫描跳过（T6 存的是目录形态），出现真实需求再加。
- L4 ssh bot 的 skill 启用落点：工作区在远端，T7a 只管本机工作区；按 T5 D9 结论另开。
- L1 人格编辑：每 bot preset 带 persona 行（复用 `p2temp` 的 `ctx.agentPresets.register`）+ 设置 UI。
- L4 审阅链（**已转 Q-028**，默认 A 不做；答 B/C 再拆单）：原版 `ProposeSkills` → `GrokBotTeamReviewItem`（PENDING→APPROVE/REJECT，携 agent_id + action/name/description/content）+ 聊天内「Pick from your skills」挑选卡（RE-skills Q3）。批准后写 bot 副本 = 复用 T7 的 enable 路径；参数 schema 原版在服务端，自定义不违反原版即规格。
- L4 project 根守卫（看 T6 回执）：bot cwd 祖先若有 `.git`，skill project 根会上移、多 bot 共享；产品数据根默认不在仓内，若 T6 回执认为需要再开单。
- L7 Vault：dsh 不提供「能用不可见」，随 L9 浏览器一起设计。
- L12 Room：无可用插件，p8 簇 8a 时自建；agent-team 任务板作参考。
