# 工单队列

顺序由 manager 维护；`open/` 只放现在就能做的单。下表是计划，状态以工单所在目录为准。
更新：2026-11-06 03:20 manager 任务 B（T2/T2b/T2c、T3/T3b 验收通过挪 done；T2c 硬杀空目录残留裁决 A 豁免，见 p9 PLAN §3 第 10 条）。

**主 agent 待办**：`feat/T2`（/dev/shm/bot-T2 @ 01b4dc6）→ 集成分支 `git merge --no-ff`（merge-tree 已核无冲突）；合并后定向回测（隔离 HOME/TMPDIR、DBus 指不存在路径）：`cd app/sdk && pnpm --config.verify-deps-before-run=false exec vitest run tests/e2e/ssh-host.test.ts tests/unit/start.test.ts` → 10 + 36 passed，`/tmp/dsh-ssh-*` 无新增。T3/T3b 已在集成分支，无需合并。下一步开单：T4、T6（manager 任务 A，见下表）。

## 可做区（按序；三条链互不依赖，可并行施工，但同一时刻全量测试只跑一套）

| 序 | 工单 | 来源 | 依赖 | 状态 |
|---|---|---|---|---|
| — | T1 P5-H5a unit/support/market/examples 裸 mkdtemp → 受管，残留归零 | HANDOFF §3-3 | — | **done**（accepted 2026-11-06 @ d9cd458，可合并） |
| 1 | T2b T2 测试有效性返修：端口只认 ECONNREFUSED + 自检、③b 断连后 fs 报传输错、⑥ stop 前必见 helper/master、快照加 mode/ctime/ino + 自检、⑤ 注释、三变异各红一格 | review 两席 + 经理核实 | — | **done**（accepted 2026-11-06 @ 01b4dc6） |
| 2 | T2c T2 夹具侧返修：单条 SetEnv（mark+HOME+REMOTE_HOME）+ cd remote-home、sshd/bin/ssh 走 `setpriv --pdeathsig TERM`、起 sshd 后全进 try、strace 0 次真实启动文件、三种中断 10s 内端口拒连（T2b 拆出的另一半，不计 T2 失败次数） | security 席发现 1/2 + 经理核实 | T2b 提交（同改 ssh-host.ts） | **done**（accepted 2026-11-06 @ 01b4dc6；硬杀空目录残留豁免） |
| 3 | T3b RE-skills.md Q6 投递方式降为推断，引 `agentSkills:` 0 次 / `.agentSkills=` 仅构造器两条反证，影响节第 6 条收窄 | test-validity 席第 6 条 + 经理核实 | — | **done**（accepted 2026-11-06 @ 316b6c9，已在集成分支） |
| — | T2 L8-a 私有 sshd 测试夹具 + dsh ssh 族连接级验收 | p9 PLAN §1 L8、§3 | — | **done**（accepted 2026-11-06 @ 01b4dc6，含 T2b/T2c；**可合并** feat/T2 → 集成分支 --no-ff） |
| — | T3 L4-a 0.78.1 skill 生命周期 RE | p9 PLAN §1 L4 | — | **done**（accepted 2026-11-06，含 T3b；已在集成分支） |
| 4 | T4 L8-b headless 真组合：dsh headless profile + ssh patch（禁 `fs-sandbox`/`subprocess`/`sandbox` 行、插 ssh 四件）+ llm-replay；一轮对话里 bash 工具与写文件工具都经 ssh 落到远端 ws，用 T2 的 marker 证明执行位置；断开 sshd 后工具报结构化失败、不回落本机 | p9 PLAN §3 | T2（含 T2b/T2c）验收 | 计划（T2 已验收；合并回测绿后开） |
| 5 | T5 L8-c 派 `architect` 出 `work/p9-dsh-integration/DESIGN-ssh-composition.md`：ssh 模式下 fs-zone / guard（NEVER 宿主路径）/ shell-ask 档位 / P6 worker cwd 怎么组合；进程级 vs preset `isolate`；断线「结果未知」在 UI 怎么表达。可能产出给用户的 Q | p9 PLAN §2 fs-zone 行、§5-1 | T4 验收 | 计划 |
| 6 | T6 L4-b skill 根收口（skill-filesystem 的 `agentsHome`/`dshHome` 指到数据根内，关掉真实 `~/.agents` 泄漏）+ 真组合 e2e：bot A 在对话里把流程存成 `<cwd>/.dsh/skills/<name>/SKILL.md`（是否经审阅按 T3 定），下一轮 catalog 出现、`skill` 工具能 load | p9 PLAN §1 L4 | T3（含 T3b）验收 | 计划（T3 已验收，可开） |
| 7 | T7 L4-c 账户库 + 按 bot 启用：main 侧 list/enable/disable（复制 or 引用按 T3 定）+ renderer-grok「Pick from your skills」，真实浏览器截图对 0.78.1；e2e：bot A 存的 skill 被 bot B 启用后 B 能 load | BRIEF 验收第 2 条 | T6 验收 | 计划 |
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
| P7-F3 | Q-027（open） |
| P7-F2 | 冻结 |
| P6-24 | 原版删除语义（0.78.1 RE） |
| P6-23 后续 / Q-023 | 用户确认（已按纯收紧实施） |
| L3 CreateAgent（P7-M1） | P7-F2 / P7-F3 |

## 已完成（不再排）

- P5-H1：cherry-pick 048c082 + 补丢失 hunk 31595d9，定向 36+9 绿、handoff 残留 0（HANDOFF §3 第 1 条已过时）。
- P5-H7 代码侧：2c20a2c（vitest.config.ts 读 `PBOTS_TEST_WORKERS`，单测三格）。实证见可做区第 10 行。

## 提议（未开单）

- L1 人格编辑：每 bot preset 带 persona 行（复用 `p2temp` 的 `ctx.agentPresets.register`）+ 设置 UI。
- L7 Vault：dsh 不提供「能用不可见」，随 L9 浏览器一起设计。
- L12 Room：无可用插件，p8 簇 8a 时自建；agent-team 任务板作参考。
