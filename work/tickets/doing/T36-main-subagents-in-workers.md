# T36：主 bot 的 subagent helper 显示进 Workers 分组

> 开单：manager (Opus 5.5) | 日期：2026-11-08 | 施工：main (GLM 5.3)
> 来源：`work/bot-product-awareness/BRIEF.md`「二次澄清（定案）」第 3 条 + 协调者转达的用户补充（2026-11-08）：**只有主 bot 的 subagent 进 Workers；其他 bot 的 subagent 不显示**
> 分支 / 作业目录：feat/T36 @ /tmp/bot-wt/T36（自当前主线开；T34b 不碰同文件，可并行）
> claimed：2026-11-08 06:3x main (GLM 5.3) @ feat/T36（起点 a68b966b）
> accepted：

## 目标
主 bot 用 dsh `subagent` 工具开出的 helper 会话，出现在侧栏主 bot 的 Workers / Done 分组里，和 `create_bot` 建的 worker 同一套呈现（运行中 / 卡住 / 未读 → Workers，读完 → Done 折叠）。

**与原版的偏离（用户定案，不是遗漏）**：0.79.3 的 subagent 不进侧栏，只在 outline 侧板分 tab + 任务卡里看（`work/grok-0.79.3-re/RE-UI-0.79.3.md` 题 3）。本单按用户定案把它放进 Workers；outline tab / 任务卡仍归 T27，本单不做。

## 经理探针结论（已核，直接用）
1. **helper 在 session/list 里，且永久留存**：dsh-subagent `childSessionMeta`（`app/sdk/node_modules/.pnpm/@deepseek-ai+dsh-subagent@0.2.2-rc.1_*/…/lib/index.js:347-358`）写进**持久化**会话头 `parentSession / origin:'subagent' / delegationDepth`；session-controller `listFields`（`dsh-api-session-controller…/lib/index.js:2922-2927`）把它们摊成 list item 顶层 `parentSessionId / origin`。helper 回合结束不销毁（`dsh-tool-subagent-control` 描述：inactive 后可 `send_message` 续聊）。→ **不存在「闪一下就没」的问题；问题反过来是只增不减**，靠 Done 默认折叠兜住。
2. **名字**：helper 没有 title；身份在 projection `subagent`（`dsh-subagent…index.js:2745-2759`，wire view = `{mode,label}` 或 null），`label` = 调用时的 `description` 实参（`dsh-tool-subagent…index.js:468`）。list item 里应在 `projections.values.subagent.label`——**先探针确认**（见边界 2a）。
3. **shim 现状**：`data.ts:342` roster 直接滤掉 `origin==='subagent' || parentSessionId!==undefined`；worker 判定只认 `createdBy`（`:180-181`、`:199`）。`:130` 注释「subagent 等永远不在 list 里」与事实不符（它们在 list，只是被滤）——顺手改注释。
4. **新 helper 出现的通道已经有**：`:413-419` 收到未知 sid 的 `api-session/status` 会重拉一次 roster（`unknownTried` 防反复）。放开过滤后，主 bot 的新 helper 走这条自动进侧栏；别的 bot 的 helper 仍被滤，`unknownTried` 保证只白拉一次。
5. **防提升缺口**：M3 `patch mainBotId`（`app/ui/main/m3-meta/index.ts:114-125`）只拒 `createdBy`；helper sid 在 session/list 里，所以现在 M3 **会接受把 helper 设为主 bot**。以前 helper 不在侧栏、UI 够不着；本单让它出现在侧栏后，agent-settings 的「Set as main bot」（`overrides/modules/agent-settings.tsx:79-98`）就够得着了。必须同单补上。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. `app/ui/renderer-grok/shim/src/data.ts:119-235`（worker 投影）、`:318-380`（summaryOf / doLoadRoster）、`:409-427`（未知 sid 重拉）
3. `app/ui/renderer-grok/shim/src/workers.ts`（sectionsOf / WorkerFacts / Done 规则——不改）
4. `app/ui/tests/unit/grok-shim/kickstart-queue.test.ts`（`createShimData` + mock api 的现成写法，照它写新测试）
5. `app/ui/main/m3-meta/index.ts:105-135`、`app/ui/tests/unit/m3/p610.test.ts:209-240`（防提升格的写法）

## 边界
1. 只动：`app/ui/renderer-grok/shim/src/data.ts`、`app/ui/main/m3-meta/index.ts`（防提升一处）、新测试 `app/ui/tests/unit/grok-shim/main-helpers.test.ts`、`app/ui/tests/unit/m3/p610.test.ts`（加一格）、`work/**`。`workers.ts`、`sidebar.tsx`、SDK 侧（awareness 名册滤保持不动——helper 不是 bot，不进 bot 名册）都不碰。超出就停下写回执存疑项。
2. 做法（最短路径）：
   a. **先探针**（临时脚本，不提交）：生产或 live 测试里让主 bot 调一次 `subagent`，原样打印该 helper 的 session/list item，确认 `projections.values.subagent.label` 的确切位置与 `running` 字段；贴回执。位置不同就按实际读，不猜。
   b. roster 过滤改为：顶层会话照旧；`origin==='subagent' && parentSessionId === <当前 mainBotId>` 的 helper 也收进来，记进一个 `helperOf: Record<sid, parentId>`。**嵌套 helper（parent 是 helper）、worker 的 helper、其他 bot 的 helper 一律仍滤掉**。mainBotId 要在过滤前定（`:344` 的 `listed`）；补建 main 的分支下新 main 没有 helper，不用特殊处理。
   c. 「是不是 worker / 创建者是谁」统一成一个函数：`creatorOf(id) = createdBy[id] ?? helperOf[id]`，`isWorker / workersOf / creators` 改用它。别处不要再各写一遍判断。
   d. summaryOf 的名字：`title` 空时取 subagent label；都没有回落 `'Subagent'`。
   e. M3 防提升：session/list item 带 `origin==='subagent'` 或 `parentSessionId` 的拒，错误码同 worker（`invalidArgs`，文案写 subagent）。
   f. ponytail 天花板写成注释：helper 与 worker 一样全部常驻 follow（`:377`），主 bot 用久了 helper 只增不减，follow 流数随之增长；超过约 30 个再改成只 follow 非 Done 的。
3. 先写失败测试，看它红了再实现：
   - `main-helpers.test.ts` ①：mock session/list 含 main、一个普通 bot B、main 的 helper H1（running）、B 的 helper H2、H1 的子 helper H3 → sections 里 main 的 Workers 含且只含 H1；H2、H3 不在任何 section、不在 order。
   - ②：H1 `running:false` 且已读 → 落 Done；名字 = label；label 缺失 → `'Subagent'`。
   - ③：未知 sid（H4，parent=main）的 `api-session/status` → 重拉后 H4 进 Workers；未知 sid（parent=B）→ 只拉一次、不进侧栏。
   - `p610.test.ts` 新格：list item 带 `origin:'subagent', parentSessionId` 的 sid 设为 main → `ok:false`、bots.json 的 mainBotId 不变。
4. 测试走隔离 HOME / TMPDIR，DBus 指向不存在路径；不跑全量 e2e。
5. 只在 feat/T36 提交。本单碰 M3 存储鉴权口径，施工完属「安全 / 存储」单，主 agent 须派 reviewer 再找经理验收。

## 验收（写命令，不写感觉）
（`app/ui` 下，`VR` = `pnpm --config.verify-deps-before-run=false exec vitest run`；隔离 env 照 LEARNINGS）
1. `VR tests/unit/grok-shim/main-helpers.test.ts --reporter=verbose` → 3 passed（①②③）
2. `VR tests/unit/m3/p610.test.ts` → 全绿，含新格
3. 回归：`VR tests/unit/grok-shim tests/unit/m3` → 全绿，passed 数 = 施工前基线 + 新增格数（基线数贴回执）
4. 变异（各贴红输出后 cp 还原，不 stash / reset）：M1 去掉 `parentSessionId === mainBotId` 条件（任意 helper 都收）→ ① 红；M2 删 M3 新加的拒绝分支 → p610 新格红；M3 `creatorOf` 改回只读 `createdBy` → ① 红
5. 定向 e2e 回归一套：`pnpm --config.verify-deps-before-run=false test:e2e tests/e2e/p6-workers.spec.ts` → 与施工前同（基线贴回执）
6. **生产旁证（主 agent 在合并前做）**：生产实例里对主 bot 说一句需要它调 subagent 的话（如「用 subagent 帮我数一下工作区里有几个文件」），截侧栏：Workers 里出现 helper 行、名字是 label；回合结束后读过它 → 进 Done。再对一个非主 bot 做同样的事，截图证明侧栏**没有**它的 helper。截图放 `work/bot-product-awareness/evidence/T36/`，回执里写亲眼看过的内容。另在 helper 行里打一句话发出，原样记录结果（回答了 / 报错原文）——这是 Q-037 第 2 点默认 A 的事实依据；报错就写进存疑项，**不要**自己加只读或拦截。
7. 改动行覆盖 ≥80%：`VR tests/unit/grok-shim/main-helpers.test.ts tests/unit/m3/p610.test.ts --coverage --coverage.include=renderer-grok/shim/src/data.ts --coverage.include=main/m3-meta/index.ts`，回执贴改动行区间的覆盖情况

## 为什么这样验收
- 用户要的是「主 bot 背后干活的小助手看得见」，且**只要主 bot 的**。所以 ① 同时断「H1 在」和「H2/H3 不在」，M1 变异专咬「放太宽」这个最容易犯的错。
- ③ 守的是真实时序：helper 是运行中才冒出来的，不是启动时就在；只测首载会漏掉用户日常看到的那条路径。
- 防提升格守的是「helper 进侧栏」带出来的新攻击面：helper 被设成主 bot 后会拿到路由提示与主 bot 权限，而它本身是权限收窄、审批自动拒的会话，主 bot 从此不可用。
- 生产截图守的是「过了单测、用户眼里还是看不到」（比如 label 不在探针以为的位置，名字全是 Subagent）。

## 用户补充
（用户实测后补的 bug / 要求写在这里，主 agent 照抄原话 + 日期。）

## 产出
- `app/ui/renderer-grok/shim/src/data.ts`、`app/ui/main/m3-meta/index.ts`
- `app/ui/tests/unit/grok-shim/main-helpers.test.ts`（新）、`app/ui/tests/unit/m3/p610.test.ts`（加格）
- `work/tickets/receipts/T36.receipt.md`、`work/bot-product-awareness/evidence/T36/*.png`
