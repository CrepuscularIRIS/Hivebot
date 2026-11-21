# T93c：rollBackLastTurn 收口——侧栏不留父壳 + 子保原位次 + 模型继承定事实 + 探针内容级断言

> 开单：manager (Opus 5.5) | 日期：2026-11-16 | 施工：main (GLM 5.3)
> 来源：T93 任务 B 验收（`reviews/T93.review.md` 末「经理核实」）：Sol M2 / M4 / M5 成立；T93 工单自己的验收「roster 不再出父、出子」未达成
> 分支 / 作业目录：feat/T93（续在同分支）@ /tmp/bot-wt/T93
> claimed：
> accepted：—（2026-11-16 @ b97afa1f 验收不通过：M2 过；模型来源/单飞/F2 对照/边界复用四条 → T93cb）

## 目标
T93 交付「Edit 后还是同一个 bot、只少最后一轮」。现在少两样：①侧栏重拉后父壳以「New chat」残留、子排到末尾（不是原位次）；②模型是否跟过去没证据。外加 T93 验收 1 要的切点**内容**断言没做。

## 要做
1. **M2 侧栏**（经理已复现：`/tmp/t93-roster-probe.mjs` 修后仍输出 order `["child","parent"]`、parent 名 `New chat`）。根因 `data.ts:539` 把旧 `order` 并回，superseded 只滤了 summaries。
   - `doLoadRoster`：order 里剔除 superseded（或剔除 nextSummaries 没有的 id——施工挑一种，回执写理由，别破 T36b helper 双清）。
   - `dev.rollBackLastTurn` 接线：成功后 order 里父**原位替换**成子（置顶列表 rollback.ts 已原位换），再 `loadRoster()`。
2. **模型事实（M4 口径）**：扩 `evidence/T93-fork-facts.mjs`：发第一轮前对父 `session/selectModel` 选一个**非默认**模型；fork 后读子会话快照 `projections.values.modelSelection`（reduce.ts:244 同口径）与父比。
   - 继承 → rollback.ts 注释与回执写「模型由 fork 继承，不挪」，结案。
   - 不继承 → rollback 对子 `session/selectModel {sessionId, provider, model}`（provider+model 从父快照取，失败即停同 M3 口径），加单测格。
3. **M5 探针内容级**：探针两轮真会话后，**import rollback.ts 的 `lastUserMessage` + 同一边界算法**（把边界计算导出成函数复用，别在探针里抄一份）算 atSeq 去 fork；断言子 events 含 `source.kind==='user'` 的「问一」、不含「问二」；F2 cwd/标题、F3 续发任何一条 false → 不打印 `FACTS_OK`、非零退出。
4. 单测补格：真包壳记录 `{type:'event', event:{…}}`；`pbots-worker` 源 user/message 不算用户消息；主 bot 带 worker（bots.createdBy 指父）时 botsMeta 非 get 调用恰 1 次且 mainBotId=子。

## 先红
- 新格「rollback + reloadRoster 后 order 不含父、子在父原下标、agentsPayload 无 New chat」：现基线红，贴输出。
- 探针第 3 条：先在现脚本上加断言跑（若 F1 本就切对会直接绿——那就贴绿，并贴一次故意把 atSeq 改成 lastUser.seq 时的红）。

## 边界
只动 `renderer-grok/shim/src/{rollback.ts,data.ts}`、`tests/unit/grok-shim/t93-rollback.test.ts`、`work/tickets/evidence/T93-fork-facts.*`。不碰 main / sdk / overrides / transcript。worker 归属换绑**不在本单**（要动 main m3-meta，见 queue T93d）。

## 验收
1. `node work/tickets/evidence/T93-fork-facts.mjs | tee work/tickets/evidence/T93-fork-facts.out; echo exit=$?` → 末行 `FACTS_OK`、exit=0；`.out` 可 grep 到 `F1 含 问一`、`F1 不含 问二`、`F2 model inherited=yes|no` 原样行。
2. `cd app/ui && node_modules/.bin/vitest run tests/unit/grok-shim/t93-rollback.test.ts` → 全 passed（≥13 格）。
3. `node_modules/.bin/vitest run tests/unit/grok-shim` → 不新增红（基线 269p）。
4. `node /tmp/t93-roster-probe.mjs` 应**断言失败**（它断言 bug 存在）；`node work/tickets/evidence/T93-mgr-probe.mjs` → `MGR_PROBE_OK`。
5. `git diff f8b8db78..HEAD --stat` 只含上面边界内文件。

## 为什么这样验收
用户点 Edit 后看到的是侧栏：两个同名/一个 New chat、或 bot 跳到末尾，都等于「bot 变了」。模型回默认是悄悄换脑子，比侧栏更糟，所以要实测不能靠推。探针断言用 rollback.ts 自己的边界函数，才证明的是产品代码切对了，而不是探针里另一份算法切对了。
