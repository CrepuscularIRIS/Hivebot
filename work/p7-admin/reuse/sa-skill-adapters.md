# P7-R2 · SA 文本与验证技能最小适配

2026-11-05；按现有 PLAN v1.1 P7-R2 执行，不新增方案、不修改 PLAN/REUSE/产品。主仓与探针基点均为 `e5ff286e686994b489766ea7d3bd1f74614a342b`。探针树 `/tmp/bot-wt/P7-R2` 为 detached；主仓仍在 `docs/rebuild-p6-p5-plan`。

## 结论与解锁边界

- **F3：可以解除 R2 这一项阻塞**。SA stored work、Restart、Report 的固定来源/许可证已核实；只改造说明和语义，执行沿用已合并 F1/F2 与 P6 Assignment/delivery。未知副作用先查现场、不自动重放，不启 SA runtime。不是声称 F3 已实现或验收通过。
- **L5：当前精确白名单下不能直接解锁完整实现**。两份文本可搬，真实 dsh 宿主已证明加载成功，但仅写 `app/sdk/profile/skills/...` 不会自动发现；需要把该目录接到已有 bundled root。此外原文禁模型调用，P6 `pbots-main` 的 `/skill` 正文不会变成人类显式调用。最小适配见下文，先按 PLAN:72 要求回写接线白名单。
- **P6 §12.3 执行者契约未验证**：当前主仓 `work/p6-orchestration/PLAN.md` 只有162行且没有 §12.3；对该 PLAN、BRIEF 和现存 r4.5 snapshot 的限定检索退出码1。现有真实接口是 dsh worker Assignment→tool→turn/end→Report；不是可把模型自报转换为可信测试退出码的结构化执行者接口。不能用旧聊天记录或推测补这个前提。

## 可并入 REUSE 的精确决策行

| 能力 | 候选（owner/repo@path 或 npm 包名） | 阶梯级别（1～5） | 许可证 | 维护（最近 commit / release） | 决策 | 理由 / 适配工作量 |
|---|---|---|---|---|---|---|
| R8 · 先存后做 / 恢复说明 / Report 文本 | `deepseek-ai/dsh-superagent-prototype@6337fc823ce20251c8de8085948165c81aaa701e:docs/003-execution.md`、`src/core/assignments.ts`、`prompts/work.md`；本仓 F1 + P6 delivery/report | 3 | MIT，DeepSeek Harness Team；[S-L] | 本地 shallow HEAD 2026-10-31；release/issue响应本次未验证，不以此批准新1/2级依赖 | 改造 | 只取 [S1–S4] 最小文本/语义，映射现有 operationId/Assignment/worker；保留先查现场与不重放；不搬 SA Ticket/Mandate/SQLite Effects/runtime，不引第二状态机。F3 的 R2 前提齐；实际代际恢复仍由 F3 测试证明。 |
| R9a · 两份验证 playbook | `cursor/plugins@bb68f2365eceafa0cb2d253112f675acf5f144cc:pstack/skills/{create-verification-skill,maintain-verification-skill}/SKILL.md` | 3 | MIT，Lauren Tan；[P-L] | 本地 shallow HEAD 2026-11-03；LT 已记 pstack 路径 commit 2026-10-27；本次不重查远端/issue | 改造 | 只搬 [P1][P2] 两份文本；改 `.cursor/skills` 为 dsh 已验证目录、取消 `disable-model-invocation` 的模型禁用以供受托 worker 加载、维护 source wave 顺序执行（不新增子代理权限）、删首批 PR/外发要求；内联所需 Feature Map 四节，不搬额外平台。保持好仓真跑、坏仓FAIL、证据跨cleanup保留。 |
| R9b · 技能发现/加载 | 已装 `@deepseek-ai/dsh-skill-filesystem@0.2.2-alpha.2` + `@deepseek-ai/dsh-tool-skill@0.2.2-alpha.2` | 1（复用既有锁定依赖，非新增上游） | MIT；已装 package.json:30；[D-L] | 本地 dsh shallow HEAD 2026-10-30；既有 LT/AR 有较新维护记录，本次不重查；完整issue响应标准未验证 | 集成 | 不加包/不升级。真实 web profile + approval preset 已证实 `.agents/skills` 默认发现、`DSH_BUNDLED_SKILL_DIR` 挂载加载与模型 `skill` 调用。裸 `profile/skills` 不自动发现；L5先回写 `app/sdk/src/start.ts`（childEnv设置固定bundled目录）及该处现有单测的接线白名单；本次未修改。 |

候选取舍已在限定本地材料内完成：SA 整仓运行时相比 P6/F1 会多状态机且其执行器默认无审批（[S1]:27,80），不作第1/2级集成；pstack 原样插件依赖 Cursor 路径与调用入口，不能直接作为 dsh 插件；已装 dsh 加两份文本已经覆盖当前需求，不自建技能平台。LT:118 已核实 npm 同名 `pstack@0.1.5` 属 `26medias/pstack`，不是 Lauren 的插件，本次不安装、不重复查询。任务明确本地足够即不外搜，因此未调用 GitHub/npm/WebSearch，未修改参考仓或 MANIFEST。

## 固定来源清单（url@完整SHA:path）

以下链接均为本地真实 checkout 的完整 SHA，不把旧 Q1 的另一 SHA 混进来。行号以所列固定文件为准。

- **[S1] Restart / Stored work**：`https://github.com/deepseek-ai/dsh-superagent-prototype@6337fc823ce20251c8de8085948165c81aaa701e:docs/003-execution.md`。可浏览 [固定源码](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/6337fc823ce20251c8de8085948165c81aaa701e/docs/003-execution.md#L144-L161)：144–152运行中 Assignment 终结及恢复说明；153–161先存后做及消息顺序。只取“持久化后执行”，**不照搬其通用失败重试到未知副作用**。
- **[S2] 恢复实际文案与状态判定**：`https://github.com/deepseek-ai/dsh-superagent-prototype@6337fc823ce20251c8de8085948165c81aaa701e:src/core/assignments.ts`，见 [21、79–91行](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/6337fc823ce20251c8de8085948165c81aaa701e/src/core/assignments.ts#L21)。原句要求检查 worktree/git history/GitHub，避免重复已完成外部操作；首批改为“工作区、操作记录、已有成果”，GitHub 不引入。79–91为 SA 自身 settled 逻辑，不照搬为 P6 paused 自动恢复规则。
- **[S3] Report 文本**：`https://github.com/deepseek-ai/dsh-superagent-prototype@6337fc823ce20251c8de8085948165c81aaa701e:prompts/work.md`，见 [34、46–49行](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/6337fc823ce20251c8de8085948165c81aaa701e/prompts/work.md#L34)：报告真实阻塞、尝试与缺少前提；写 changes/tests actually run/risks；ready意为reviewed且相关检查通过。首批仅取这些句子，不搬PR要求、外发/merge措辞和 orchestrator_report 工具名。
- **[S4] 先存后做源码佐证**：`https://github.com/deepseek-ai/dsh-superagent-prototype@6337fc823ce20251c8de8085948165c81aaa701e:src/app/effects.ts`，见 [43–65、79–87、98–118行](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/6337fc823ce20251c8de8085948165c81aaa701e/src/app/effects.ts#L43)。语义依赖 SA Store/事务和Effects，不是独立可直接复制的说明加载器；不搬代码。
- **[S-L] SA LICENSE**：`https://github.com/deepseek-ai/dsh-superagent-prototype@6337fc823ce20251c8de8085948165c81aaa701e:LICENSE`，[正文](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/6337fc823ce20251c8de8085948165c81aaa701e/LICENSE):1–21，已读。
- **[P1] 创建验证 playbook**：`https://github.com/cursor/plugins@bb68f2365eceafa0cb2d253112f675acf5f144cc:pstack/skills/create-verification-skill/SKILL.md`，[正文](https://github.com/cursor/plugins/blob/bb68f2365eceafa0cb2d253112f675acf5f144cc/pstack/skills/create-verification-skill/SKILL.md):1–44。1–5为frontmatter；25–32为Launch/Doctor/Drive/Evidence/Cleanup/Helpers；36列Feature Map四H2；40要求实际端到端执行且清理后证据仍在。
- **[P2] 维护验证 playbook**：`https://github.com/cursor/plugins@bb68f2365eceafa0cb2d253112f675acf5f144cc:pstack/skills/maintain-verification-skill/SKILL.md`，[正文](https://github.com/cursor/plugins/blob/bb68f2365eceafa0cb2d253112f675acf5f144cc/pstack/skills/maintain-verification-skill/SKILL.md):1–39。21禁修改产品掩盖回归；29原版并行subagent需降为现有执行者能做的顺序source pass；33每feature真跑与doctor/cleanup不变量；37的PR交付不在首批。
- **[P-L] pstack LICENSE**：`https://github.com/cursor/plugins@bb68f2365eceafa0cb2d253112f675acf5f144cc:pstack/LICENSE`，[正文](https://github.com/cursor/plugins/blob/bb68f2365eceafa0cb2d253112f675acf5f144cc/pstack/LICENSE):1–21，已读。
- **[D-L] dsh LICENSE**：[固定MIT正文](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/LICENSE):1–21，已读；安装版本另按下述 I-F/I-T 核对，未用参考仓新源码代替制品实测。

## 本仓实际加载接口与最少接线

路径约定：`SDK=/home/lingxufeng/bot/app/sdk`。

- `I-F=SDK/node_modules/.pnpm/@deepseek-ai+dsh-skill-filesystem@0.2.2-alpha.2_@deepseek-ai+cordis@4.0.6-alpha.1_@deep_b17095e1b059d1eede2d4d90ede35d25/node_modules/@deepseek-ai/dsh-skill-filesystem`。
- `I-T=SDK/node_modules/.pnpm/@deepseek-ai+dsh-tool-skill@0.2.2-alpha.2_@deepseek-ai+cordis@4.0.6-alpha.1_@deepseek-a_0b71c0b68398be711b3c42a6d526d786/node_modules/@deepseek-ai/dsh-tool-skill`。

| 已核事实 | 证据 / 本次运行结果 |
|---|---|
| 当前 standard preset 已有 filesystem provider 与 skill tool | `SDK/profile/patches/approval.yml:99–102`；base `cordis.patch.yml:311–315`，不必另建注册器 |
| 默认根是项目 `.dsh/skills`、`.agents/skills`，另有配置的custom/user/bundled根 | `I-F/lib/index.js:160–195`；`.agents/skills`真实发现PASS；单纯在旁边放 `profile/skills` 不发现PASS（负例） |
| bundled接缝现成可用 | `I-F/lib/index.js:83–84,191–195`；本次额外env `DSH_BUNDLED_SKILL_DIR=<临时profile/skills>`，真实 web boot 后原版/适配版共4份发现PASS；适配版两份通过真实skill工具读取正文PASS |
| 为什么原文不能直接给worker用 | `I-T/lib/index.js:875–878,1119`：模型调用检查isModelInvocable，显式slash仅认user；运行证实 `pbots-main` 中 `/create-verification-skill` 不注入，强调原skill得到 not available for model invocation；真正人类user slash则注入正文 |
| 不伪造用户来源的最短办法 | 两份被选中的适配文本去掉 `disable-model-invocation: true`（探针用false，等效）；worker仍走 `pbots-main` 并显式 `skill{name}`。这只准加载文本，不授予bash、目录、审批或子代理权限 |
| PLAN白名单缺口 | `SDK/src/start.ts:147–174` 已转发 `DSH_*`，但没有把 `PKG_ROOT/profile/skills` 设作默认bundled root。最少在该childEnv设置固定bundle目录并扩展现有 `tests/unit/start.test.ts` 的对应测试白名单；本次仅验证env接缝，未写生产默认值。需主会话先回写L5区域，不能暗改approval.yml/node_modules |

首批改造边界：生成的验证技能仍使用 dsh认可的项目 `.agents/skills/verify-<app>/SKILL.md`；不注册 `.cursor/skills`，不改生产worker身份，不把全部profile设为技能根。P1引用的Feature Map目录不在两份白名单内，故只内联P1:36已列的四节格式即可，不扩搬额外模板资产。Cleanup只清理自身spawn/临时目录，证据目录独立，不清系统进程或真实桌面。

## P6执行者与Report：证实了什么、没有证实什么

**实际接口链，基点e5ff286：**

1. `SDK/src/orchestration/create.mjs:57–72,89–106,128–147`：`create_bot{name,prompt}`，身份从权威文件读取；cwd/preset/connectors不接受模型提供。真正UI main创建/工作区继承不是本次新增或验证范围。
2. `SDK/src/orchestration/assignment.mjs:37–43`：`buildAssignMessage({assignmentId,mainBotId,text})` 生成 `pbots-assign:*`、`source.kind='pbots-main'`；`Delivery.send(agent,message)`（`delivery.mjs:147–`）复用落盘投递；`readLog`见113–127。本次真宿主已走这条接口，**没有走create_bot→UI main建worker**。
3. `assignment.mjs:63–122` 的 `foldAssignments(events)` 还原消费回合和终止原因；`report.mjs:37–46` 的 `resultTextFor(events,turn)` 取末工具后正文。探针每次都以真实投影日志证明Assignment完成且尾文等于 `MODEL_CLAIM_ONLY`。
4. `pending.mjs:27–30,68–75,107–117`：`completed`是回合终结映射，不是业务核验PASS；回报源为 `pbots-worker`，数据非指令。`report.mjs:196–229`重算再投递。本次没有启动生产Reporter→主bot通知全链，不能拿纯读取/投递成功冒充它已验收。

**不能给模型自报盖 verified：** 本次原版skill加载失败，fake模型仍能说 `MODEL_CLAIM_ONLY` 并正常turn/end；P6 fold同样得到 `completed`。这给出一个实际反例：正常结束/尾文不等于测试已跑、更不等于退出码0。当前已读三模块没有可信执行退出码/受限证据存在性校验输出；`work/p6-orchestration/reuse/s7-confined-fs-executor.md:7,55` 仅静态推荐PTC集成与未验证项，不能当作 §12.3 已存在的验证执行器。

因此本次只解除F3所需来源和恢复说明缺口。L5的接线白名单、P6 §12.3 契约定位/恢复需先落实；之后builder仍必须跑PLAN要求的同技能好仓PASS/坏仓FAIL及launch→doctor→drive→evidence→cleanup。此报告不新增执行者设计、不自行自建验证服务。

## 运行证据与未验证项

- 可重跑脚本：`/home/lingxufeng/bot/work/p7-admin/evidence/P7-R2-probe.mjs`；脱敏实录：`/home/lingxufeng/bot/work/p7-admin/evidence/P7-R2.txt`。
- `/home/lingxufeng/bot/app/sdk/node_modules/.bin/node .../P7-R2-probe.mjs` **退出码0，14断言PASS，两次真实mock web profile启动ready；两次自spawn launcher停止退出码均0**。Node `v24.22.2`；未用系统Node22启动产品。
- 临时HOME、handoff、模型输入、session日志、fake脚本与observer全部在随机 `/tmp/bot-P7-R2-*`，本次已删；evidence只有脚本/报告/脱敏结果，没复制临时token或runtime。仅给自己spawn的launcher发SIGTERM，由现有launcher收尾自己的child，未操作外部PID、真实桌面或凭证目录。
- 未验证：F3代际/崩溃/未知副作用恢复；L5实际fixture好坏仓；真模型是否正确选择/遵守技能；P6 §12.3可信执行者接口；新增默认bundle接线测试；完整生产create_bot/main建worker→Report投递链；上游issue维护响应/远端最新release。无任何一项因本次文本加载PASS而被标完成。
