# 工单队列

顺序由 manager 维护；`open/` 只放现在就能做的单。下表是计划，状态以工单所在目录为准。
更新：2026-11-06 manager 任务 A（用户新决策：开 T7c〔Q-028=B〕、T15〔rc.1 评估〕；T13 改「等用户」；T11 去掉 Q-029 依赖）。再上一轮：任务 B（T5 r2 验收通过；开 T9a；T14 补验收 5b）。上一轮：任务 A（开 T5、T7a、T7b；新 Q-028）。

**主 agent 待办**：⓪ **T14 缺陷单优先**（doing；可能所有 bot 写不了自己工作区；经理已补验收 5b「写别的 bot 工作区仍拒」），与 T7b 第 1 步可并行 ① T5 已验收（done/）；**T9a 已开**（`open/T9a-l8d-ssh-skeleton.md`），排在 T14 之后施工（同改 guard.mjs，后合者三方合并）② 施工 T7a（`open/T7a-l4c-skill-enable-api.md`）。③ T7b（`open/T7b-l4c-skill-picker-ui.md`）第 1 步（0.78.1 参照图）可与 T7a 并行；第 2 步起等 T7a 合并。GLM 并发 ≤2；同一时刻 e2e 只跑一套。④ 把 Q-028 转给用户（不阻塞，默认 A）。

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
| 5a | **T9a** ssh 组合骨架：**第一步删 `ssh-headless.test.ts:111-122` 重复 llm-replay**（贴删后 14 passed）；`P2SDK_SSH_*` + `start.ts` `sshRows`（先插原版 fs-ssh/sandbox-ssh）；禁 `ptc-runtime` 等；guard 工具名拒 `glob`/`grep`（tool-fs-search 嵌在 5 个 preset 里）；`ssh-product.test.ts` ⑧⑨⑪（从组合后 profile 枚举全部 preset）+ start 单测 | DESIGN-ssh-composition D8 D9 D11 D13 | T5 验收 | **open**（`open/T9a-l8d-ssh-skeleton.md`；只开测试入口，产品/UI 不设 `P2SDK_SSH_*` 直到 T10 验收） |
| 5a′ | T9b 文件工具安全：`fs-zone-ssh`（覆盖 writeText/editText）、guard 远端根 + `remoteHome` 启动校验、containment 纯词法开关（`P2SDK_SSH_MODE`）；`ssh-fs-zone.test.ts` 绕开 pre-execute 直测 provider ①（若 ①b 先红不成立，兜底先红用 ①d dfa 下 NEVER，**不是** ①c——原版围栏也拒 remoteHome 链）、加 `P2SDK_SSH_REMOTE_HOME`、`ssh-product.test.ts` ②、containment 单测 | DESIGN-ssh-composition D1 D2 | T9a | 计划 |
| 5b | T10 远端 bash 套 wrapper：`wrapperArgv` 抽取（宿主 computeRoots 全套 ∪ 远端根）+ `sandbox-zone-ssh` + 单测；`ssh-bash.test.ts` ③④（先红 = T9 组合下 bash 读到宿主哨兵）；**④d 必须加变异「Hello.root 当 `--policy` 传 → ④c 红」**——基线 profile 自带 `--tmpfs /tmp`，④c 在 T9 下也绿，只有这个变异能证伪它 | DESIGN-ssh-composition D3 D4 | T9b | 计划 |
| 5c | T11 main 侧远端工作区：`p2sdk/workspace.root/ensure` RPC、`mintWorkspace` 按模式分支（#3/#4/worker 共同入口）；worker 远端 cwd；Q-029 旧 bot 处理；T7a 在 ssh 模式拒 → SDK 侧复制 | DESIGN-ssh-composition D5 D6 D9 | T10、T7a、P6-24（Q-029=A 已定：整机切换，旧 bot 工具调用拒+提示） | 计划 |
| 5d | T12 断连体验：`endNotice` 专用「可能已执行」文案 + 「重新连接」按钮（触发 = main 事件流见 `SSH connection is closed`；dsh 进程仍活，launcher 看不到）+ 复用 launcher 重启路径、不重放 | DESIGN-ssh-composition D7 | T9 | 计划 |
| 5e | T13 真实远程：helper 闭包推送（release 0 asset，D10 实测）+ hash、wrapper/slirp 推送、远端 SpillStore、远端 PATH 核对 | DESIGN-ssh-composition D4 D9 D10 | **等用户**（2026-11-06 用户定调：本地体验稳固后再测真实远程；届时向用户要主机） | 计划 |
| 6 | **T6** L4-b skill 根收口 + 存 skill 真组合（`done/T6-l4b-skill-save.md`）：`childEnv` 无条件设 `DSH_AGENTS_HOME=<cfg.home>/agents`（skill-filesystem 与 agent-instructions 一并收住）；e2e 四格：bot A 用 write 存 `.dsh/skills/t6-flow/SKILL.md` → A 新会话目录出现且 `skill` 加载全文 → bot B 看不到 → 隔离 HOME 的 `.agents` 探针不出现、新根正对照出现。审阅链不进本单（理由见工单） | p9 PLAN §1 L4、RE-skills | T3 系（已在集成分支） | **done**（accepted 2026-11-06 @ 80958ad0，**可合并**） |
| 7a | **T7a** L4-c main 侧 skill 启用 API（`open/T7a-l4c-skill-enable-api.md`）：IPC `pbots:skills` list/enable/disable；**启用 = 复制快照**到 `workspaces/<botId>/.dsh/skills/<name>`（staging 后 rename，拒符号链接/穿越，256,000 字符、每 bot 250、撞名 -2 并改 frontmatter name）；「你的 skills」= 全部 bot 私有根的**派生并集视图**，不另建库目录（无写入方；共扫根约束自然满足）；e2e：A 在对话里 write 存 → B 启用 → 先改 A 源 → B 首次 load 拿到旧正文 → disable 只删 B 副本；M1 符号链接冒充复制必红 | BRIEF 验收第 2 条；RE Q2/Q4/Q7 | T6（已合并） | **doing**（unit 全绿；e2e 阻塞于产品缺陷 → 等 T14） |
| 7b | **T7b** L4-c info pane Skills 段 +「Pick from your skills」对话框（`open/T7b-l4c-skill-picker-ui.md`）：第 1 步 R3 桩渲 0.78.1 Context 对话框 skills 两态亮暗参照图（约 2h 止损）；接 `pbots.skills`；e2e 以 B 磁盘副本为准 + 250 上限提示；8 张图（含 ours\|ref 拼图）；`pnpm check` 上游 diff=0 | BRIEF 验收第 2、4 条；RE Q4 | 第 1 步无；第 2 步起 T7a 合并 | **open**（第 1 步可与 T7a 并行） |
| 7c | **T14** 缺陷：产品组合下 bot `write` 自己工作区被 guard 软遮蔽拒（`sandboxPolicy.resolve` 无 workspaceRoot；首要嫌疑 = M1 带 sessionId 的 claim 建会话）（`open/T14-ws-write-guard-mask.md`）：sdk 层三格最小复现（claim / mint 对照 / 去 presets.yml）→ 根因 → 根因处修，不放宽遮蔽；验收含 T7a e2e 解阻 | receipts/T7a 附记；T5 复审附带初判 | — | **doing**（优先；claimed 06:18 @ 5972d24d；验收 5b 已补） |
| 7d | **T7c** L4-d bot 写 / 改自己 skill 根（`.dsh/skills`、`.agents/skills`）出确认卡（`open/T7c-l4d-skill-write-card.md`，Q-028=B）：shell-ask workspace-write 分支一条判定 + 原因串，自主门开也出卡；子代理拒；T6 `skill-save.test.ts:222` 与 T7a `skills-enable.spec.ts` 的旧断言明着修订（回执列对照表）；bash 路径为已知缺口 → T7d | Q-028 答复 B；RE-skills Q3 | **T7b 之后**（T7a 合并后才能修订其 spec） | **open**（排 T7b 后） |
| 7e | T7d 补 bash 缺口：bot 工作区建出时预建 `.dsh/skills`、`.agents/skills`，bwrap wrapper 对会话工作区下这两个目录（或整个 `.dsh`/`.agents`）ro-bind，使 bash 写不进 skill 根（挂载点不可 rename/rm）；先红 = T7c 后 bash `cat > .dsh/skills/x/SKILL.md` 零卡写成 | T7c 回执 | T7c | 计划 |
| 7f | **T15** 上游评估 dsh 0.2.2-alpha.2 → rc.1（`open/T15-dsh-rc1-upgrade-assessment.md`）：只出报告 `p9-dsh-integration/EVAL-dsh-rc1.md` 不升级；npm tarball 实物比对、五个 patch 文件 110 个行 id 逐个对照、cordis 4.1.0 peer 波及、`8f798da97d` 与 T14 关系单列（若修了 T14 根因，回执顶部标出供主 agent 定 T14 走向）、`7bd189b3b5` 对 DESIGN D1 前提的影响、踩坑对照表、升级时机建议（默认：T14+T7a+T7b 落地后专单升级 + 全量回归） | 主 agent 上游巡检 2026-11-06 | — | **报告已交**（`p9-dsh-integration/EVAL-dsh-rc1.md` + `evidence/T15/*` + `receipts/T15.md`，自检 1–7 过；待 manager 任务 B）——§2 结论**无关**；时机维持并微调为「T9a 后、T9b 前」 |
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

- **升级单（T15 草案，EVAL §8）**：dsh 9 依赖一次升到 rc.1（cordis peer 不相交）；必做三件安全修补——envelope `JOB_TOOLS` 换 `schedule_edit/schedule_view`、guard `NEVER_TOOLS` 加 `apply_patch` + approval.yml preset 副本显式 `applyPatch: false`、执行层 patch/delete/move 经 checkedTarget 的证明格；备份 `$DSH_HOME`（会话日志迁移）；锚点重定；全量回归。排位：T14+T7a+T7b 落地、T9a 合并后，**T9b/T7c 开工前**（T9b 的 fs-zone-ssh 改五入口）。
- ~~T4 残留~~ → 已并入 T5 D13（第一张 ssh 实现单删 `ssh-headless.test.ts:111-122`）。
- L4 独立账户库 + 「Add new skill」手填 + 文件导入（RE Q4：7 种扩展名 txt/md/markdown/csv/json/yaml/yml、非 UTF-8/空/超限各报 skip）：T7a 的库是派生视图，有了这些写入方再建 `$PBOTS_DATA_DIR` 下独立库目录（不能放共扫根）。届时 A 删除自己的 skill 不再让它从库里消失。
- L4 其余入口（建 bot 向导、bot 复制带 skill、聊天内挑选卡）：T7b 只做 info pane 一个入口。
- L4 扁平 `<name>.md` skill 的列出/启用：T7a 扫描跳过（T6 存的是目录形态），出现真实需求再加。
- L4 ssh bot 的 skill 启用落点：工作区在远端，T7a 只管本机工作区；按 T5 D9 结论另开。
- L1 人格编辑：每 bot preset 带 persona 行（复用 `p2temp` 的 `ctx.agentPresets.register`）+ 设置 UI。
- L4 审阅链（**已转 Q-028**，默认 A 不做；答 B/C 再拆单）：原版 `ProposeSkills` → `GrokBotTeamReviewItem`（PENDING→APPROVE/REJECT，携 agent_id + action/name/description/content）+ 聊天内「Pick from your skills」挑选卡（RE-skills Q3）。批准后写 bot 副本 = 复用 T7 的 enable 路径；参数 schema 原版在服务端，自定义不违反原版即规格。
- L4 project 根守卫（看 T6 回执）：bot cwd 祖先若有 `.git`，skill project 根会上移、多 bot 共享；产品数据根默认不在仓内，若 T6 回执认为需要再开单。
- L7 Vault：dsh 不提供「能用不可见」，随 L9 浏览器一起设计。
- L12 Room：无可用插件，p8 簇 8a 时自建；agent-team 任务板作参考。
