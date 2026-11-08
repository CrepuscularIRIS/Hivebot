# review-T33

Sol 审查报告未落盘（主 agent 派发时以摘要转述：中1–中4 四条 CONFIRMED + UNKNOWN 两条）。本文件只记经理终验。

## T33 终验（manager Opus 5.5，2026-11-08 10:35–，HEAD a76a5cf9，load 4.2）

**结论：通过。** 工单挪 done/，accepted 填 a76a5cf9。

### 重跑验收（/tmp/bot-wt/T33/app/sdk，隔离 HOME/TMPDIR，DBus 指空）
```
awareness-prompt.test.ts                                  Tests  10 passed (10)
awareness-prompt-live.test.ts（默认链 + p2fake overlay）   Tests  3 passed (3)
start.test.ts                                             Tests  43 passed (43)
orchestration-routing.test.ts + -live.test.ts             Tests  14 passed (14)
coverage（双文件，include src/awareness/**）
  product-prompt.mjs | Stmts 85.39 | Branch 73.01 | Funcs 76.19 | Lines 98.41 | Uncovered 127
  ERROR: functions 76.19% / branches 73.01% < global threshold 80%（进程非零退出）
```
合计 70，与回执「全套五件 70 passed」一致。Lines 98.41% 达工单门（验收 5 口径就是 Lines）；Funcs/Branch 不到 vitest 全局门，命令退出码非零——工单只要求 Lines，**接受**，不另开单。

### 改动范围
`git diff 114bcc5a..HEAD --stat`：只动了工单边界列的 6 个文件，外加工单和回执。t33-probe / t33-probe5 两个探针文件都是提交之后又删掉的，净差为零。start.test.ts 里两处长度断言 5→6 改得对（默认链确实多了一个 patch），新格断言了 awareness 在 market 后、runtime 前。没有删弱测试。

### 变异（经理亲跑，cp 备份 → cp 还原 → cmp 相同）
```
M1 buildArgs 删 awareness 行 → live ✘ 2（②：not contain 'This app and the other bots'；③：0 system/message）  → 复现回执
M4（经理加）名册滤 subagent 那行改成 sessions 原样
   第 1 次：①b ✘ + live ④ ✘（expected 1 to be +0）
   第 2 次：①b ✘，live ④ **绿**
```

### 四条修复逐条核
- **中1 subagent 未过滤 — 修复成立。**
  - 名册滤（product-prompt.mjs:31）读 list item 顶层 `origin` / `parentSessionId`。上游源码锚点：dsh-api-session-controller `lib/index.js:2922-2927` 的 `listFields(header)` 把 `header.parentSession → parentSessionId`、`header.origin → origin` 摊到 item 顶层。所以字段位置不靠已删掉的探针⑤，有源码为证。确定性守卫是 ①b，M4 下两次都红。
  - 挂载滤（:109-110）读 `agent.session.header.origin/parentSession`。路径与 dsh 自用写法一致（index.js:3279 `agent.session.header`；:131-133 `header.origin === "subagent"` / `header.parentSession`）。**这一处没有测试守**：删掉它，所有格照样绿。后果只是 helper 自己的系统提示多一段认知文本，严重度低，接受，记提议 ③。
- **中2 ④格空绿 — 修复成立，但守卫强度只有概率级。** 换成真 p2fake 后，`started subagent <id>` 断言过了，subagent 确实被创建。overlay 只叠 provider，awareness 仍走默认链，M1 复现可证。
  - 问题：M4 下 ④ 两次里只红一次。原因是 helper 的 agent/created 触发的异步 refresh，与同一轮第二次组装 system 之间有竞态；refresh 晚到，名册就没变化，0 条 system/message 照样成立。
  - 名册过滤的确定性证据由 ①b 加上游锚点承担，④ 只算旁证。
  - `not.toContain('help')` 是**空断言**：前一条已断言 systems=0，所以此处 text 恒为 `'[]'`。而且只要将来有任何 system/message 带上本段，它就**必然误红**——正文 subagent 句含 "helper"，"help" 是它的子串。不制造假绿，降为提议 ①②。
  - 回执说的「三证」实际只有两证。
- **中3 createdBy 是 sessionId — 修复成立。** :50-56 按 ID 在过滤后的名册里查 title；查不到或清洗后为 Untitled 时退化成无标注行，不露裸 ID。① 格期望已改为 "Alpha"，①b 的 s-deleted 格守住退化路径。小瑕疵：:53 同一个 find 写了两遍，:32 给参数重新赋值。属外观问题，不返修。
- **中4 单飞刷新丢事件 — 修复成立。** :94-100 的 dirty 标记加 finally 补刷。受控 Promise 格的形态是对的：去掉 dirty 后，head 回 Old 落进缓存，第 128 行 text() 读到的是 Old，必红。

### UNKNOWN 两条口径
- 「48」：经理实跑 start.test.ts 为 **43**。回执原写的 48 是混跑计数的笔误，现在的全套 70 对得上。**接受**。
- M3 先红在 ② 不在 ③：常量冻结在 A 挂载那一刻，名册为空，② 先挡住。②③ 都守名册新鲜度，③ 另外守住「建会话之后新增同伴可见」。**接受**，不另造只让 ③ 红的变异。

### 提议（写入 queue.md 提议行，不开单）
1. live ④ 改成确定性：subagent 轮之后，先轮询 sessionController/session/list 直到 helper 出现，再让 A 发一轮，断言 system/message 不含 helper 的 title。
2. 删掉 `not.toContain('help')`，或改成行级形态 `- \"T33 helper\"`，与 ①b 一致。
3. 挂载滤补一格：在 helper 会话上 follow，断言它的 system 不含 SECTION_MARK。也可以在 mock 单测里给 agent 加 `session.header.origin='subagent'`，断言不挂 section（成本更低）。
