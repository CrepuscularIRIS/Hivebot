# T40：bot 提问时聊天里出提问卡，点选项就作答（修「bot 一提问就挂住」）

> 开单：manager (Opus 5.5) | 日期：2026-11-09 | 施工：main (GLM 5.3)
> 来源：`work/exp-polish/BRIEF.md` 2026-11-09 追加段（「原版即规格…找出没集成的完整清单」）→ `work/exp-polish/AUDIT-0.79.3.md` K2 / 场景 1（queue E4）。顺带落地 P5-33（`work/p5-parity/RE-question-card.md` 的下游）。
> 分支 / 作业目录：feat/T40 @ /tmp/bot-wt/T40（从集成分支 docs/rebuild-p6-p5-plan 起）
> claimed：2026-11-09 main (GLM 5.3) @ feat/T40
> accepted：

## 目标
bot 调 `ask_user_question` 时，它的对话流里出现原版的提问卡（问题 + 选项按钮 + 自定义输入 + 关闭）；点一个选项或输入后回车，答案经已有的 M1 结构化作答分支交给 dsh，bot 接着干。现在什么卡都不出，回合一直挂着。

## 现状（经理探针，纯读）
1. 生产工具表**有** `ask_user_question`（`work/exp-polish/COMPUTER-USE-TEST-PLAN.md` §0-1 列的 31 个工具）。dsh 的 legacy 模式是阻塞等作答（`dsh-tool-ask-user` README「Legacy and `timeout: -1` calls wait for an answer or cancellation」）。
2. main 侧已全：ledger 入账 `user-questions/request`（`app/ui/main/dsh/ledger.ts:131-145`），M1 `$events/result` 有结构化作答分支，严格要求 `{kind:'result', value:{answers:[{id, selected:string[], custom?}]}}` 且 id 集合**恰等于**该批问题 id（`main/m1-api/index.ts:100-106`、`ledger.ts:43-70`）。e2e `tests/e2e/questions-answer.spec.ts` 证过这条链（但它直接调 api，没有卡片——注释写明「P5-33 卡片前的观测面」）。
3. 断点在 shim：`renderer-grok/shim/src/data.ts:425` 的 `onEventsItem` 只认 `approval/request`，`user-questions/request` 的 waterfall 被忽略；`coordinator.ts` 没有 `respondToWidget` / `dismissWidget` handler（会回 unknown-method）。renderer 挂着时 deadline 不代答（`main/m2-mux/deadline.ts:56` 只在没有端口时），所以回合永远挂住。
4. UI 零件全在 0.18 树：`recovered/features/conversation/cards/transcript-card/views/widget.tsx`（单问卡：≤6 个选项、`allowCustom` 自定义输入行、Dismiss 钮 aria「Dismiss question」）、`widget-interactions.ts`（调 `respondToWidget{entryId,value,agentId}` / `dismissWidget{entryId,agentId}`）、`protocol.ts:244-268` `projectWidget`（**要求 1–6 个选项**，否则不当 widget）。entry 形状：`{kind:'send-message', id, timestampMs, message:{type:'widget', widget:{prompt, helpText?, options:[{label,value?,description?}], allowCustom?}}, respondedValue?, widgetDismissed?}`（protocol.ts:186-193；RE-question-card.md §1.1）。

## 定案（自定，不问用户）
- **一题一张卡**，按批内顺序排在该 bot 对话流末尾（和审批卡同处：`askEntries` 旁边加 `questionEntries`）。
- 映射（dsh 问题 → widget）：`prompt = question`；`helpText = header`（有才带）；`options = dsh options` 的 `{label, description}`；**`allowCustom: true` 恒开**（dsh 每题都收 `custom`）。
  - 0 个选项（纯文本题）：`options = [{label:'Skip', value:<shim 私有哨兵>}]` + 自定义输入——用户打字回车 = custom，点 Skip = 跳过。
  - 超过 6 个选项：取前 6 个，其余靠自定义输入；回执记一条降级。
  - `multiSelect: true`：0.18 widget 无多选，按单选 + 自定义输入呈现；回执记一条降级（多选卡留作后续，queue E4b 提议）。
- 作答值 → dsh：点选项 `value` 命中某选项 → `{id, selected:[该选项 label]}`；不命中（自定义输入）→ `{id, selected:[], custom:<文本>}`；点 Skip 哨兵或 Dismiss → `{id, selected:[]}`（dsh「A skipped item has empty selected and no custom」）。
- **整批一次交**：一批多题时，shim 先把每题答案攒着，最后一题答完 / 跳过才发一次 `$events/result`（M1 要求 id 集合恰等）。已答的卡立刻显示已答态（`respondedValue` / `widgetDismissed`），不等整批。
- 发出成功 → 该批卡保留为已答态（历史可见）；`cancel` 事件（`data.ts:439`）→ 该批卡转 Dismissed 态并停止接受作答。M1 回失败 → 卡回可作答态，错误走 widget 自带的失败提示（widget-interactions 的 reply 失败分支），不吞。
- 0.79.3 输入框「Type your answer, or talk about something else」（composer 直接答题）**不做**——本单只做卡；记 queue E4b 提议。
- `agents()` 的 `awaitingApproval` 不扩成提问（侧栏 blocked 点另议）；不动 main / M1 / ledger。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md（裸 `launchShell` 的 spec 首启进 onboarding——e2e 用 `waitProductReady`；T26b 那条）
2. `work/p5-parity/RE-question-card.md` §0、§1.1、§3（作答交互）、§5（en 文案）
3. `app/ui/renderer-grok/shim/src/data.ts:236-262`（askEntries）、`:417-445`（onEventsItem）、`:547-560`（resolvePermission）；`shim/src/coordinator.ts` 全文；`shim/src/entries.ts:157-179`（permissionEntry）
4. 上面「现状」第 4 条列的 recovered 文件（只读）
5. `app/ui/tests/e2e/questions-answer.spec.ts:36-75`（fake LLM 发 `ask_user_question` 的 `askCall` 帧，照抄）

## 边界
1. 只动：`app/ui/renderer-grok/shim/src/{data.ts,entries.ts,coordinator.ts}`，可新增 `shim/src/questions.ts`（映射 + 攒答案的纯函数）；新测试 `app/ui/tests/unit/grok-shim/questions.test.ts`、`app/ui/tests/e2e/grok-question-card.spec.ts`。recovered、overrides、main、M1、ledger 都不碰。要碰就停下写进回执存疑项。
2. 先写失败测试（单测，纯函数 + coordinator 内存端口，照 `tests/unit/grok-shim/coordinator.test.ts` 的 rig）：
   - ① **waterfall → widget entry**：喂一条 `{type:'waterfall', event:'user-questions/request', eventId:'ev1', agentId:'s1', request:{questions:[{id:'q1', question:'Proceed?', header:'Confirm', options:[{label:'Yes (Recommended)'},{label:'No'}]}]}}` → s1 的 transcript 里恰有 1 条 `kind:'send-message'`、`message.type:'widget'`、`widget.prompt==='Proceed?'`、`options.map(o=>o.label)` 逐字等于两项、`allowCustom===true`。**施工前必红**（现在 0 条）。
   - ② **单题点选项 → 一次 `$events/result`**：对 ①的卡 `respondToWidget{entryId, value:'No', agentId:'s1'}` → mock api 恰收到 1 次 `$events/result`，`outcome` 逐字 `{kind:'result', value:{answers:[{id:'q1', selected:['No']}]}}`。**施工前必红**（unknown-method）。
   - ③ **两题一批**：第 1 题作答后 api 0 次调用、第 1 张卡带 `respondedValue`；第 2 题 Dismiss 后 api 恰 1 次，answers 按题序 `[{id:'q1',selected:[…]},{id:'q2',selected:[]}]`。
   - ④ **自定义输入**：`value:'blue please'`（不命中任何选项）→ `{id, selected:[], custom:'blue please'}`。
   - ⑤ **0 选项题**：卡的 options 恰 1 项且点它 → `selected:[]`、无 `custom` 键。
   - ⑥ **cancel 收卡**：waterfall 后来一条 `{type:'cancel', eventId:'ev1'}` → 卡带 `widgetDismissed`，再 `respondToWidget` 不触发 api、回失败。
   - ⑦ **M1 失败不吞**：mock api 对 `$events/result` 回 `{ok:false}` → `respondToWidget` 的 reply 为失败、卡回可作答（无 `respondedValue`）。
   - 先跑红 ①②，贴原样输出，再实现。
3. 测试走隔离 HOME / TMPDIR，DBus 指向不存在路径；只跑下面列的 e2e。
4. 只在 feat/T40 提交。碰 `$events/result` 作答路径（协议类）→ 施工完单独派 reviewer，不攒批。

## 验收（写命令，不写感觉）
（`app/ui` 下，`VR` = `pnpm --config.verify-deps-before-run=false exec vitest run`；隔离 env 照 LEARNINGS）
1. `VR tests/unit/grok-shim/questions.test.ts --reporter=verbose` → 7 passed（①–⑦）
2. 回归：`VR tests/unit/grok-shim tests/unit/m1 tests/unit/shell` → 全绿，passed = 施工前基线 + 7（基线贴回执）
3. 变异（各贴红输出后 cp 还原，不 stash / reset）：V1 攒答案改成「每题答完立即发」→ ③ 红；V2 自定义值也塞进 `selected` → ④ 红；V3 `onEventsItem` 删掉 user-questions 分支 → ① 红
4. 新 e2e：`pnpm --config.verify-deps-before-run=false test:e2e tests/e2e/grok-question-card.spec.ts` → passed。内容：fake 发一批 2 题（照 questions-answer.spec.ts 的 `askCall`）→ 页面上恰 2 个 `.sand-widget`（或 widget.tsx 的根 class，施工核对）→ 点第 1 题选项 B、第 2 题自定义输入「hello」回车 → fake 下一步收到的工具结果 JSON 含 `"selected":["<B 的 label>"]` 与 `"custom":"hello"` → 回合继续出终答；截图 `work/exp-polish/evidence/T40/{asked,answered}.{light,dark}.png`（只截目标窗口，亲眼打开确认）
5. 定向回归：`pnpm --config.verify-deps-before-run=false test:e2e tests/e2e/questions-answer.spec.ts tests/e2e/grok-shim.spec.ts` → 与施工前同（基线贴回执）
6. 改动行覆盖 ≥80%：`VR tests/unit/grok-shim/questions.test.ts --coverage --coverage.include='renderer-grok/shim/src/{questions,data,coordinator}.ts'`，回执贴改动行区间
7. **生产旁证（合并、重启实例后，主 agent 做）**：对一个普通 bot 说「用 ask_user_question 问我想要红色还是蓝色，然后按我的回答写一句话」→ 卡出现 → 点「蓝色」→ bot 终答提到蓝色。截卡片前后两张，记 LOG。

## 为什么这样验收
- 用户感到的是「bot 问了，我答了，它继续」。②④ 逐字断 wire 上的 `answers`，因为 M1 对形状是严格校验（多一个键、少一个 id 都拒），形状错了单测绿、真机照样挂。
- ③ 守「整批一次交」：M1 要求 id 集合恰等，逐题发会被拒——V1 证明这格咬得住。
- ⑥⑦ 守两个最容易漏的退路：bot 取消了问题卡还能点（发出去被拒、用户以为答了），M1 失败被吞（卡显示已答、bot 还挂着）。
- e2e 走真页面真点击，防「entry 对了但 widget 没渲染」（`projectWidget` 选项数 / 字段不合规会静默退回普通卡）。

## 用户补充
（用户实测后补的 bug / 要求写在这里，主 agent 照抄原话 + 日期。）

## 产出
- `app/ui/renderer-grok/shim/src/{data.ts,entries.ts,coordinator.ts}`、可选新 `shim/src/questions.ts`
- `app/ui/tests/unit/grok-shim/questions.test.ts`、`app/ui/tests/e2e/grok-question-card.spec.ts`（新）
- `work/tickets/receipts/T40.receipt.md`、`work/exp-polish/evidence/T40/*.png`
