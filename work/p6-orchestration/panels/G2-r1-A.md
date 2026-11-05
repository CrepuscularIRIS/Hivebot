# G2-r1 · 席 A（Opus 5.5）· p6-orchestration PLAN v3

seat: A
verdict: REVISE
confidence: medium-high（关键代码锚点已逐一核实：reduce.ts、orchestrate.ts、store.ts、dsh agent.ts、P5-W3f1 diff）

## 总评

v3 的骨架是对的：先做 spike，P6-09 (a)(b)(c) 任一为否就停；协调者 patch 不进默认链，作为生产闸门；createdBy 先落盘；决策 15「通知回合禁协调者工具」在结构上消除了乒乓。第 0 波五项的前置条件基本成立。问题集中在四处：①回报链的「不丢」和注入面没有闭合，而这两点正是 DK 和 DO 各自列的头号风险；②一处与现有代码冲突的前提（reduce.ts 丢弃非 user 来源）；③通道缺超时；④流程闸门，包括 DONE 改动不进修订账、②④ 契约增量没有经用户 C2。这些都能在 PLAN 文本层修掉，不需要重新设计，所以判 REVISE，不判 BLOCK。

## findings

- [HIGH] PLAN.md:30（决策 15）、:85（P6-12 ③）— **通知唤醒回合只禁了 create/send/stop，主 bot 其余工具（bash、文件写、连接器）照常可用。** worker 回报最长 4000 字（决策 17），内容可能来自 worker 读到的不可信材料（仓库文件、网页）。这些内容进入主 bot 的上下文，而主 bot 可能挂着带凭证的连接器（BRIEF.md:83 死因 4 原文就是「经主 bot 扩散到带凭证的 bot」）。「来自 worker 的数据，非指令」只是一句提示词，DK §4 和决策 15 自己都写了「提示词不是安全边界」。另有一个结构漏洞：dsh 的 inbox 是 FIFO，同一批 splice 进去的消息会在同一回合里 drain（`repos/deepseek-harness/packages/core/agent-loop/src/agent.ts:170-176`）。如果回报和用户消息落进同一回合，这个回合按决策 15 会被判为「用户发起」，协调者工具随之放开，被注入的回报就能驱动 create/send。决策 15 宣称的「乒乓在结构上不可能」在这种混合回合下不成立。— 证据：PLAN.md:30、:32；BRIEF.md:83；agent.ts:170-188 — 建议：引入污染语义，回合输入里只要含非 user 来源，就按「通知回合」处理。通知回合在执行层禁掉**全部**有副作用的工具：主 bot 转述结果、点名卡住都不需要工具，所以这是更小也更稳的规则，可以复用 P6-14 envelope 的 pre-execute 层，或用 S2 §3.1 的 scoped restrict。P6-09 (c) 加一格「回报与用户消息同回合 drain 时的来源判定」；P6-12 ③ 改为「通知或混合回合内任一副作用工具 execute → 拒」，并补连接器写工具的用例。

- [HIGH] PLAN.md:31-32、:85（P6-12）— **回报会丢，而验收测不出来。** 决策 16 要求回报等主 bot 空闲，所以排队只能放在两处：插件内存，或 dsh inbox。两处都会丢。①dsh inbox 在内存里，并且 `cancel()` 默认 `inbox.clear()`（agent.ts:190-195）：用户按停止键打断主 bot，排在 next-turn 的回报就跟着清掉。②插件内存队列遇到 SDK 重启会清零。P6-12 ⑤ 只覆盖「worker 回合中途重启 → 已停止」，没有覆盖「worker 已 completed、回报还在等主 bot 空闲时重启」和「排队中主 bot 被 cancel」。此外，重启后插件怎么知道某个 worker 回合属于 Assignment（决策 14），以及它的 assignmentId 是什么，PLAN 没有写；决策 9 的占位又明确只在进程内。DK §4 和 DK 风险 1 要求的「重启后按持久 turn 与 requestId 对账补投」在 v3 里消失了。worker 默认隐藏，回报是用户获知结果的主通道，丢一份就等于静默失败。— 证据：PLAN.md:20、:31、:32、:85 ⑤；agent.ts:190-195；design/main-orchestration-k3.md:82-83、:111 — 建议：assignmentId 写进注入消息本身（requestId 或 source 字段），重启后从 worker transcript 推导，不新建库，符合决策 17 的口径。插件启动时扫一遍「createdBy worker 最后一个 Assignment 回合已终止，但主 session 里没有对应 requestId」的情况并补投，同 id 幂等。P6-09 加一问 (f)：主 session cancel 后 followup 队列是否保留，持久 requestId 跨重启是否仍然去重。P6-12 加两格：worker completed、回报排队时重启，恰 1 项且不丢；排队时用户 cancel 主 bot，回报在下一次空闲时仍然送达。

- [HIGH] PLAN.md:13、:40（决策 2、25）、:90（P6-16 区域）— **前提与代码冲突：reduce.ts 直接丢弃 `source.kind !== 'user'` 的 user/message。** `app/ui/renderer/session/reduce.ts:110` 写着 `if (rec(data.source).kind !== 'user') return view`，而 shim 管线是 reduceFollow → foldTurns → serialize（`shim/src/data.ts:179`、`entries.ts:57`）。后果有两个。①主 bot 侧：`pbots-worker` 回报条目根本到不了 fold 和 entries，所以 P6-16 要求的「回报条目走 assistant 泳道、作为切段边界，只改 fold 和 shim、不改 reduce 输出结构」做不到，P6-16 的区域里也没有 reduce.ts。②worker 侧：create/send 注入的任务消息（非 user 来源）同样被丢掉。用户从折页打开 worker（P6-15 ④）时，只能看到 worker 在回答，看不到它在回答什么，D7「目标 transcript 出现一条标明『来自主 bot』的消息」在 UI 层不成立，而且没有任务认领这件事。决策 2「只 import 不改」原本是因为 P5-12 在改同一目录，现在 P5 已全部合并（PLAN.md:55），这条约束已经失效，路径也从 `renderer/plugins/session/` 移到了 `renderer/session/`（314b998）。— 证据：reduce.ts:109-111；data.ts:11、:179；entries.ts:57；PLAN.md:13、:40、:90 — 建议：P6-16 区域加 `app/ui/renderer/session/reduce.ts`，reduce 为 `pbots-worker` 和「来自主 bot」两种来源产出新的 item kind。决策 25 改写为「改 reduce + fold」。P6-15 或 P6-16 验收加「worker transcript 中可见来自主 bot 的任务消息」（D7 的 UI 部分）。

- [HIGH] PLAN.md:83（P6-10 验收 ③）— **create 通道没有超时。** 验收覆盖了「无订阅者 ≤100ms」和「断流」，但没有覆盖「main 在订阅、可编排卡住或丢掉了请求」（例如 mintWorkspace 或 session/create 挂住）。这时工具无限 await：主 bot 回合卡死，`reserveSlot` 的占位永不释放，容量被永久吃掉一格，直到重启。S2 §4.4 把「明确超时……不能让工具无限挂起」列为生产必须项，D2-A 的 reverse_take 也点名了这一失败方式。— 证据：reuse/s2-dsh-cross-session.md:95；panels/D2-p6-r1-A.md:34；PLAN.md:83 — 建议：P6-10 加常量超时（`ponytail:`），超时返回 `main-unavailable`，并按「结果未知」处理：不重试，释放占位，迟到的 respond 被拒，main 侧若已建出 bot 则保留。验收加一格：main 订阅后不 respond，在超时时限内返回、占位释放，且之后第 4 次 create 不报 capacity。

- [HIGH] PLAN.md:4、:79、:105；BRIEF.md:161 — **②④ 契约增量没有经过用户 C2，且 P6-10 合并即生效，不在 P6-14b 闸门之内。** PLAN v1 自己写了「1b 接口改动全部 blocked 到 D-2 经 /panel D 并交用户 C2 批准」（PLAN.md:4），BRIEF §10 D-2 也写「→ 用户 C2」，先例 Q-015 是逐件给用户签字。v3 把 D-2 写成「已解除」（:79），QUESTIONS 里只有覆盖 ⑤ 的 Q-021，没有覆盖 ②（BotsMeta v2、`createdBy`）和 #20 拒绝条件的条目。问题在于 P6-10 的 main 侧改动（store v2、#20、deriveBots、orch-channel 订阅）一合并就进了用户真实 app，盘上的 bots.json 会在下一次写入时升到 v2，而 P6-14b 只拦 SDK patch。还有一点：现有读取器遇到 version≠1 直接抛错（`app/ui/main/m3-meta/store.ts:64-65`），一旦回滚到旧版，main 读不了 bots.json，D-2 的可逆性论证（PLAN §5）没有覆盖这一点。— 证据：PLAN.md:4、:79；QUESTIONS.md:156-164（Q-015 先例）、:202-207（Q-021 只问 ⑤）；store.ts:64-65 — 建议：把 Q-021 扩成「D-2 ②③④⑤ 契约 C2 一次签字」，C-1 契约文本同步。二选一：P6-10 的 main 侧合并也挂 Q-021；或者保持 version 1，`bots` 作为可选字段加入（旧读取器会忽略它，见 store.ts:67）。后者对回滚无害，但旧写入器会抹掉 createdBy，需要写进契约，作为已知降级。

- [HIGH] PLAN.md:132-138（§6）；PROTOCOL.md:81 — **DONE 条款的改动只写在 PLAN 里，交给主会话同步。** D4（侧栏可见改为折页可见）、D5（恰 1 条改为按批计、排队首改为在用户消息之后、只报 Assignment）、新增 D9⑨⑩、D11、D3′、改 J1，这些都是挪球门。PROTOCOL §3 规定：「任何修改都必须在 BRIEF 末尾的修订账里写清楚……哪次 panel 批准的。没有记录的修改，G3 一律判 BLOCK。」§0-2 又规定主会话不写方案。BRIEF 现在停在 v2.1（BRIEF.md:171-197），没有这些行。不补的话，G3 必然被机械判为 BLOCK。— 证据：PROTOCOL.md:12、:81；PLAN.md:132-138；BRIEF.md:171-197 — 建议：由 director 或 drafter 出 BRIEF v2.2，修订账逐行引用「G2-r1 批准」。这一步在 G2 汇总之后、P6-10 派发之前完成。

- [MEDIUM] PLAN.md:88（P6-14b deps）— 从安全面看开放闸前置是够的（P6-11/12/13/14 + Q-021 + C-1），从产品面看不够。P6-15 不在 deps 里，意味着生产上 worker 会出现在侧栏顶层，与用户 Q-019 原话「默认不可见」相反（QUESTIONS.md:193）。P6-16 不在 deps 里，意味着回报在主 bot 视图里完全不可见（见 reduce.ts:110 那条）。P6-20 不在 deps 里，意味着路由自然率未知，主 bot 可能对闲聊也建 worker，白耗 GLM 额度和 session。§3 把 P6-17/18/20 列为「第一批验收前必须补齐」，却没有挂到闸门上。— 建议：P6-14b deps 加 P6-15、P6-16、P6-20，或者明写「接受先暴露」并进 QUESTIONS 告知用户。

- [MEDIUM] PLAN.md:83-86、:117 — 1b-2 波把 P6-11 和 P6-12 并行，但两者之间存在真实的横向依赖，PLAN 没有排明。①Assignment 记录（assignmentId 的生成，「这一回合是不是 Assignment」的判定）由 create/send 写、report 读，PLAN 没有指定归属：应由 P6-10 产出导出函数，P6-11 和 P6-12 只调用。②P6-12 ③ 要测「通知回合调 send / stop → forbidden」，但 send 属于并行中的 P6-11，stop 属于更晚的 P6-13，P6-12 合并时这一格无法证伪。③P6-13 的验收缺「通知回合调 stop_bot → forbidden」这一格（P6-11 有对应格）。④P6-11 验收引用 D7 全条，其中「回合结束同样触发 D5」依赖 P6-12。— 建议：P6-10 验收加「导出 assignment 登记与回合来源判定，供 send/report 共用」。P6-12 ③ 只测 create，send/stop 两格分别放进 P6-11、P6-13。P6-11 的 D7 去掉「触发 D5」半句，挪到 P6-12。

- [MEDIUM] PLAN.md:83（P6-10）— rename（#6）失败的语义没有定。worker 已建、createdBy 已落盘，但没有名字，这时工具算成功还是失败？D2-A 已经点过（panels/D2-p6-r1-A.md:13）。如果按失败返回，主 bot 可能会再 create 一次，出现重复 worker，这正是「禁止自动重试」要防的情况。— 建议：rename 失败按成功返回，名字留空，结果带 warn；加一格单测。

- [MEDIUM] PLAN.md:93（P6-19）— 冻结提示集只覆盖了 5 个去向（决策 11）里的 3 个：直接答、create、send，缺 stop 和忽略（闲聊、致谢）。冻结不可逆，事后补 stop 用例会破坏 held-out。另外，P6-19 的验收要求「提交早于 orchestration/ 下任何 description 文案」，但 P6-10 的 deps 里没有 P6-19，两者顺序全靠派发时机。— 建议：派发前补 stop ×2（期望恰 1 次 stop_bot）、闲聊或致谢 ×2（期望 0 次工具），把 P6-10 的 deps 加上 P6-19。

- [MEDIUM] PLAN.md:35（决策 20）、:89（P6-15 捷径）— 搬运阶梯写得含糊。捷径列写的是「0.18 移植树侧栏 sections 与 agent 行」，但 sections 是并列分组，不支持挂在某个 bot 行下面的嵌套折页（`frontend/src/recovered/features/conversation/workspace/sidebar.tsx:58` 只有 section 级的 collapse）。原版的 d8e/qA 在 0.78.1 的 bundle 里，RO §8 写明「在桩下未复现」，DO ③ 也因此把它排到第二批。按现在的写法，frontend-dev 实际上是在自建一个嵌套折页组件（第 5 级），PLAN 里没有对第 2 级方案（合成 section「‹主 bot› 的 worker」：现成的 collapse、agent 行、状态点）给出不行的理由。— 证据：RE-outline-tasks.md:133；design/main-orchestration-opus.md:55、:58 — 建议：UX-1 题干明确要求两席比较「合成 section（第 2 级）vs 行下嵌套折页（第 4/5 级）」。若选后者，P6-15 写明阶梯理由，并改由 RE 先补 d8e/qA 的可移植性。

- [MEDIUM] PLAN.md:30（决策 15 代价）— 「worker 完成后主 bot 不能自动接着派下一步」是用户可感知的能力削减。用户 Q-018 原话强调「整个 harness 的流程……让人无缝去做」，这一点 PLAN 只写在决策表里，没有告知用户。— 建议：在 QUESTIONS 记一条告知型 FYI，默认按决策 15 执行，不阻塞。

- [LOW] PLAN.md:13、:14、:48 — 仍引用 `renderer/plugins/session/reduce.ts` 和「P5-12 正在改」，这两项已经过时，实际路径是 `app/ui/renderer/session/reduce.ts`（P5-54 314b998）。建议在决策 2 加一行注明已解除。
- [LOW] PLAN.md:55 — P5-W3.f1 的文件清单不全。实际 diff 还包括 `app/ui/tests/e2e/p6-fold.spec.ts`、`tests/unit/grok-shim/{coordinator,desktop,entries,p5-w3f1}.test.ts`（`git -C /tmp/bot-wt/P5-W3f1 diff --name-only main...HEAD`）。P6-15 和 P6-16 已经排在它后面，结论不变；但 W3.f1 改了 p6-fold.spec，P6-16 合并时应把 `pnpm test:e2e p6-fold` 列为回归项。
- [LOW] PLAN.md:110 — 计数有误：「todo 10」实际是 todo 8（10/11/12/13/16/17/18/20）加 done 4（01–04）。
- [LOW] PLAN.md:92（P6-18）— 区域只有 `main/notify/`，但要接上 ledger 事件和 createdBy，必然要改 main 的接线点（`main/index.ts` 或 `dsh/ledger.ts`），这些不在区域内。建议把接线文件补进区域。
- [LOW] PLAN.md:86（P6-13 / 决策 26）— 占位只在 `turn/end` 释放。如果 worker 回合一直不结束（bwrap 挂住），容量会永久少一格，直到重启。上限由 P5-27 的超时兜底，建议写一行 `ponytail:` 说明。
- [LOW] PLAN.md:85 ④（D8）— BRIEF D8 要求「5s 内（主 bot 空闲时）……发出 1 条点名消息」，P6-12 ④ 没有断言时限，建议补上。
- [LOW] QUESTIONS.md:205 — Q-021 的选项 B「等 S-2(h)」已经失效（S-2(h) 已经实证）。建议并入上面 C2 那条，改成单一签字题。

## 关注点逐项回答

1. **可证伪与 DONE 覆盖**：D4→P6-10 ②、P6-15 ①；D5→P6-12 ①⑤⑥、P6-16 ②；D6→P6-12 ⑦；D7→P6-11（UI 部分无人认领，见 HIGH-3）；D8→P6-12 ④、P6-17；D9 ①⑥→P6-10，②⑥′⑧→P6-11，③④⑤⑦→P6-14；D10→P6-13；J1→P6-16 ④；J3→P6-17。每一条都有任务覆盖，缺口在 D5「不丢」的两种场景（HIGH-2）和 D7 的 UI（HIGH-3）。验收整体写得好：有计数 === 0、同 tick 并发、`git diff ⊆ 区域`。
2. **区域与并行**：SDK 侧 P6-11/12/14 文件不重叠，但存在逻辑耦合（MEDIUM：Assignment 登记、P6-12 ③）。P6-15 和 P6-16 串行是对的。P6-16 漏了 reduce.ts（HIGH-3），P6-18 漏了接线文件（LOW）。第 0 波：P6-09、P6-05、C-1、UX-1 的前置成立，P6-05 改的 approval.yml 不在 W3.f1 的 diff 里，已核实。P6-19 的前置成立，但要先补 stop 和忽略两类再冻结（MEDIUM）。C-1 的范围要扩到 ②④ 加 C2（HIGH-5）。P6-09 建议在派发前加 (f)（inbox 在 cancel 和重启下的持久性）和 (c′)（混合回合的来源判定），成本只是多几条断言。
3. **搬运阶梯**：SDK 侧每行都有级别和锚点（dsh 第 1 级：when、Remote stream、followup；G18 和 SA 第 3 级：只搬语义），没有未声明的自建。唯一含糊的是 P6-15 的折页组件（MEDIUM）。
4. **风险**：Q-021 只影响通道，限定在两个文件内，可逆性论证成立；但契约里的 ②（v2 盘格式）不在可逆论证之内（HIGH-5）。P6-14b：安全前置够，产品前置不够（MEDIUM）。安全面：worker 侧（envelope 加 direct execute 验证、bots.json 在 NEVER 根，见 `app/sdk/src/policy/never-roots.mjs:140-146` 的 dataDirs）是扎实的；短板在主 bot 侧的通知回合（HIGH-1）。凭证面：worker 无连接器，回报不带凭证，没有发现问题。
5. **与 P5-W3.f1 的交叠**：PLAN 的处理正确（P6-14、14b、15、16 排在其合并后），只是文件清单漏了测试文件（LOW）。

reverse_take: 三个月后最可能的失败方式：用户在主 bot 正忙时停掉它，或者重启了 app，某个隐藏 worker 的结果静默丢失。用户以为没做完，又让主 bot 重派了一次，于是出现两个 worker 改同一个东西。另一种失败：某份回报里夹带的指令，在混合回合里借主 bot 的连接器执行出去。更笨更稳的替代：通知回合禁掉全部副作用工具；assignmentId 写进注入消息、从 transcript 推导，启动时对账补投。这两条都不新增存储。
