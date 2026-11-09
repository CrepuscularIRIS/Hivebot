# T39：侧栏点 Done 里的 worker 行，行不再被拽到 Workers（修「点进去只剩 2 个 + worker 跳」）

> 开单：manager (Opus 5.5) | 日期：2026-11-09 | 施工：main (GLM 5.3)
> 来源：`work/exp-polish/BRIEF.md` 第 1 项（用户原话「我这怎么在ui里面点击里面, 就显示2个, 而且worker还在跳跃? 这个是不合理的」）
> 分支 / 作业目录：feat/T39 @ /tmp/bot-wt/T39（从集成分支 docs/rebuild-p6-p5-plan 起）
> claimed：2026-11-09 main (GLM 5.3) @ feat/T39
> accepted：

## 目标
侧栏里**点一下**某个 worker / helper 行，只是打开它，不让它换组。现在点 Done 里的行，它会立刻跳到上面的 Workers 组（Workers 组凭空出现、Done 少一个）；再点另一个，前一个掉回 Done、新的又跳上去。

## 根因（经理探针，纯读 + 生产会话文件旁证）
1. `app/ui/renderer-grok/shim/src/workers.ts:108-109` `sectionsOf(…, activeId)`：`rankOf(w) < 4 || w.id === activeId` 进 Workers——**不管它被打开前在哪组**，只要是当前打开的就放进 Workers。
2. `app/ui/renderer-grok/shim/src/data.ts:208` 把 `active`（chat-header 每次打开都会 `setActive`，`overrides/modules/chat-header.tsx:38`）原样传进去；`data.ts:704-712` 的注释写明这是 GU-P6-15-r1 f1 的修法：**从回报卡「Open」打开一个已读 worker 时**，行在折叠的 Done 里看不见，所以挪到 Workers 尾。这个修法没有区分「从回报卡打开」和「在侧栏 Done 里直接点」，后者就成了跳。
3. 单测把跳写成了预期：`tests/unit/grok-shim/workers.test.ts:94-97`（'d' 本来就是已读 Done，active='d' → 进 Workers）。
4. 生产旁证（2026-11-09 读 `~/.local/state/hivebot/dsh/sessions/*3815aef0*` 会话头 + `~/.config/pbots-ui/bots.json`，未读对话正文）：主 bot 名下 4 个：T34 Probe（create_bot worker）+ 3 个 helper（统计文件 ff2e1966、研究 linux.do 3d06bc5d、统计 txt 2433bf84），4 个都已 `turn/end`。runtime 启动于 1794193344，只有 txt helper 是启动后才建的（1794193400），所以它是「结束时 UI 开着 → 未读 → 留 Workers」，其余 3 个是「重启前就结束 → 已读 → 折叠的 Done」。用户展开 Done 看到 3 个，点其中一个，它就跳上 Workers，Done 只剩 2 个，Workers 变 2 个——和「点击里面就显示 2 个、worker 在跳」对得上。

## 定案（自定，不问用户）
- **规则：行换组只能因为它自己的状态变了（开跑、结束、要审批、读完离开），不能因为被点了一下。**
- 打开一个 worker 时，只有两种情况让它留在 Workers（「hold」）：
  a. 打开那一刻它本来就在 Workers（rank < 4）——读完不当场掉进折叠的 Done，离开后再归档（现行为，保留）；
  b. 是从侧栏以外打开的：`pbotsUi.focus(id)`（回报卡 Open / Messaging 行 / 「From main bot」——`overrides/modules/notice-view.tsx:25`；新建/克隆后 focus 的对象不是 worker，不影响）——保 GU-P6-15-r1 f1。
- 其余（侧栏里点 Done 行）：不 hold，行留在 Done 原位。
- 改法提示（最小改动，施工可更简）：`data.ts` 加 `held`（被 hold 的 worker id）与 `focusedFrom`（`ui.focus` 里记下 id）；`setActive` 在 `unread.delete` **之前**算 `held = isWorker(id) && (rankOf(factsOf(id)) < 4 || focusedFrom === id) ? id : null`，然后清 `focusedFrom`；`sections()` 传 `held` 不传 `active`。`active` 的其他用途（结束不算未读 `data.ts:463`）不动。`sectionsOf` 签名不变，只把参数名 / 注释改成 hold 语义。
- 不改：Done 默认折叠、组内排序（决策 21）、离开后归档——这三条是状态驱动，用户若也嫌，走 Q-038。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. `work/p6-orchestration/ui/P6-15-16-FINAL.md` §1 决策 4-7（Workers/Done 语义）
3. `app/ui/renderer-grok/shim/src/workers.ts:98-112`、`data.ts:184-208, 455-466, 696-712`、`overrides/modules/sidebar.tsx`（只读，确认不用动）
4. rig 照抄 `app/ui/tests/unit/grok-shim/main-helpers.test.ts:10-33`

## 边界
1. 只动：`app/ui/renderer-grok/shim/src/data.ts`、`app/ui/renderer-grok/shim/src/workers.ts`（只改 `sectionsOf` 的参数名与注释，逻辑不动）、新测试文件 `app/ui/tests/unit/grok-shim/workers-hold.test.ts`。sidebar.tsx、上游 recovered、M3 都不碰。超出就停下写进回执存疑项。
2. 先写失败测试（新文件，rig 同 main-helpers：main M + 已结束 helper H1/H2（`running:false`，从未未读 → Done）+ 一个在跑的 H3），四格：
   - ① **侧栏点 Done 行不跳**：`data.ui.setActive(H1)` 后 `data.sections` 里 H1 仍在 `pbots:done:M`、`pbots:workers:M` 的 agentIds 与点之前逐字相同。**施工前必红**（现行为 H1 进 Workers）。
   - ② **连点两个 Done 行，sections 签名不变**：记 `JSON.stringify(data.sections)`，`setActive(H1)`、`setActive(H2)`、`setActive(M)` 每步后都等于初值。**施工前必红**。
   - ③ **回报卡 Open 保 f1**：`data.ui.focus(H1)` 再 `data.ui.setActive(H1)` → H1 在 Workers 末尾；`setActive(M)` 后回 Done。施工前后都绿（守卫格，回执注明）。
   - ④ **Workers 里的行读完不当场掉**：`setActive(H3)`（此刻 running → rank 1，在 Workers）→ 把 rig 里 H3 改成 `running:false` 再 `data.dev.reloadRoster()`（unit rig 没有 $events 通道，用 roster 重拉让它变 rank 4）→ H3 仍在 Workers；`setActive(M)` → H3 进 Done。守卫格。
   - 先跑红 ①② 贴原样输出，再实现。
3. `workers.test.ts:94-97` 那格**不改**（`sectionsOf` 纯函数的 hold 语义没变，变的是 data.ts 传什么）。若施工发现非改不可，停下写存疑项，不要自己改断言。
4. 测试走隔离 HOME / TMPDIR，DBus 指向不存在路径；不跑全量 e2e。
5. 只在 feat/T39 提交；纯 UI 行为单，可与下一批攒着派 reviewer。

## 验收（写命令，不写感觉）
（`app/ui` 下，`VR` = `pnpm --config.verify-deps-before-run=false exec vitest run`；隔离 env 照 LEARNINGS）
1. `VR tests/unit/grok-shim/workers-hold.test.ts --reporter=verbose` → 4 passed（①②③④）
2. 回归：`VR tests/unit/grok-shim` → 全绿，passed 数 = 施工前基线 + 4（基线贴回执）
3. 变异（各贴红输出后 cp 还原，不 stash / reset）：V1 `sections()` 改回传 `active` → ①② 红；V2 hold 条件删 `focusedFrom === id` → ③ 红；V3 hold 条件删 `rankOf(…) < 4` → ④ 红
4. 定向 e2e 回归：`pnpm --config.verify-deps-before-run=false test:e2e tests/e2e/p6-workers.spec.ts` → 与施工前同（基线贴回执；该 spec :164/:179-193 覆盖「打开期间留 Workers / 离开归档」，必须仍过）
5. 改动行覆盖 ≥80%：`VR tests/unit/grok-shim/workers-hold.test.ts --coverage --coverage.include=renderer-grok/shim/src/data.ts`，回执贴改动行区间的覆盖情况
6. **生产旁证（主 agent 合并、重启实例后做）**：侧栏展开主 bot 的 Done，依次点 3 个行，每点一次截侧栏（3 张，`work/exp-polish/evidence/T39/click-{1,2,3}.png`，只截目标窗口），断言：Workers 组的行数和顺序 3 张一致、点的那行仍在 Done 里高亮。截图亲眼打开确认后记 LOG。

## 为什么这样验收
- 用户要的是「点一下不会让列表变样」。①② 直接断「点之前 = 点之后」，比断「H1 在哪」更难被空绿糊过去——任何因点击引起的成员变化都会让签名变。
- ③④ 守的是改动最容易误伤的两条已有语义：f1（从回报卡打开时行别藏在折叠里）和「读完不当场掉进折叠」。V2/V3 变异保证这两格真的咬得住 hold 条件的两半。
- 生产截图守的是「单测过了、真实侧栏还在跳」（比如上游另有一处按 active 重排）。

## 用户补充
（用户实测后补的 bug / 要求写在这里，主 agent 照抄原话 + 日期。）

## 产出
- `app/ui/renderer-grok/shim/src/data.ts`、`app/ui/renderer-grok/shim/src/workers.ts`（注释 / 参数名）
- `app/ui/tests/unit/grok-shim/workers-hold.test.ts`（新）
- `work/tickets/receipts/T39.receipt.md`、`work/exp-polish/evidence/T39/*.png`
