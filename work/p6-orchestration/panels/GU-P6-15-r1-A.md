seat: A
verdict: PASS
confidence: medium
findings:
- [MEDIUM] evidence/P6-15/*-dark.png（7 张）+ app/ui/tests/e2e/p6-workers.spec.ts:92-100 — 暗色截图拍在主题过渡中途：bothThemes 切 colorScheme 后立刻截图，带 background transition 的上游元素停在半路。顶栏搜索 / + 按钮、`Connect apps`、composer 在 7 张暗色图里都是浅灰底（`worker-task-dark.png`、`main-report-single-dark.png` 的 composer 是 #7f7f7f 灰条，占位文字几乎看不见）；P5-57 同一批元素在 `work/p5-parity/evidence/P5-57/market-list-dark.png` 里是深色。market.spec.ts:104 专门写了 `waitForTimeout(600) // 主题过渡`，这个 spec 没照做。新卡片本身没有 transition，所以这些图仍能用来评 P6-15/16 自己的元素，但暗色整屏不能作为暗色品质的证据。verifier 的 dHash 是拿复跑图和交付图比，两边带同样的伪影，查不出来；而且验收人没有视觉通道（VERIFY-P6-15.md:25），本闸门之前没有人真正看过这 14 张图 — 建议：bothThemes 在切主题和截图之间加 `waitForTimeout(600)`（与 market.spec 同口径），重拍 7 张暗色图；E20 的 computed 值断言同样要在过渡结束后取
- [MEDIUM] evidence/P6-15/main-report-single-light.png 对比 -dark.png；shim/src/data.ts:161、:376 — 同一时刻的亮暗两张图状态不一样。亮色图里 Doc writer 在 Workers 组，没有任何点（不在跑，也没有未读），预览是 `Pushed.`；几百毫秒后的暗色图里它变成了蓝色未读点。原因是两个真相源：`running` 优先取 follow 视图（turn/end 先到），未读只在 `$events` 的 `api-session/status` 结束沿上标记（晚到，spec:187 的注释也承认「结束帧晚于 follow 的 turn/end」）。两者之间有一段窗口：Workers 组里的行没有任何标记，而按 rank 它要么该进 Done，要么该有点。用户看到的是 worker 完成那一刻状态先消失再冒出未读点，正好削弱了「完成可感知」 — 建议：running 与未读用同一事件源判定（例如未读也由 follow 的 turn/end 打标，或 running 只认 summaries），并补一条断言：完成过渡期间 Workers 组里的行始终带 running 或 unread 标记
- [MEDIUM] shim/src/data.ts:555-565（askPending）、REPORT-P6-15.md:36、FINAL §2-5 — ask 项的 eventId 两路都对不上时，退回 `mine.length > 0`（这个 worker 现在是否卡着）。如果 P6-12 用的是 `$events` 的 eventId：作答后 asks 删掉这一项，view.asked 又不认这种 id，于是历史里已作答的 ask 项会在这个 worker 下一次卡住时重新显示 `Needs you` + warn 底，点进去落到的是另一张卡。这违反 A §7「历史不显示当前状态」和席 C ⑥「旧 ask 不能代答」。FINAL 说「P6-12 用哪一种 id，UI 都能处理」，REPORT 说「两者都行」，这个交接说法不准确。C ⑥ 的「第二次 ask」半条也没有测试（spec 里没有第二次 ask），REPORT:26 却写「席 C ①–⑥ 已覆盖」 — 建议：eventId 非空且两路都查不到时返回 false（Answered），只有 eventId===null 才退回「是否卡着」；或者把交接改成 P6-12「必须用 approval/asked.id」。在 P6-17 补「同一 worker 第二次 ask：旧项保持 Answered，新项 Needs you」
- [MEDIUM] BRIEF.md:118（D11「行状态……各一例」，UI e2e）、REPORT:29、VERIFY 3② — failed/stopped 未读这一档（rank 2）只有单测，没有 e2e，也没有截图。而品味项 ⑩（文字前缀代替红点）恰好要 GU 裁这一档的视觉，GU 却没有图可看。从代码推断，它的样子是：Workers 组里一个蓝色 `Unread activity` 点，加 12px 三级灰的 `Failed: …`，和普通未读只差一个词 — 建议：⑩ 可以接受（不 fork 上游行组件、状态不只靠颜色），但条件是 P6-17 的真链路 e2e 要造出一个 error 回合，给这一档补 DOM 断言和亮暗截图；`Failed:` 前缀可以考虑用 `--sand-text-danger-primary`（只改预览文字颜色，不碰点，仍是覆盖 CSS）
- [MEDIUM] 品味项 ⑦（FINAL §1-11；workers.ts:87-94）— 打开主 bot 不清 worker 未读，这一点我同意（读主 bot ≠ 读 worker）。但主 bot 已经在回报卡里贴出预览，又转述过一遍，用户实际上已经知道结果，主 bot 行的蓝点仍然要逐个打开 worker 才会消失。worker 一多，主 bot 行几乎常亮，用户会学会无视它，而它和 blocked 共用这一行的注意力。席 A 自己留过退路：「汇总只计还没投递回报的 worker」 — 建议：本轮保留现状，在 P6-17 真链路上观察。如果 J1 走完主 bot 行仍然常亮，就切到 A 的退路（worker 的回报卡已渲染 = 不计入主 bot 未读，worker 行自己的未读点不变）
- [LOW] evidence/P6-15/sidebar-workers-4states-light.png、sidebar-workers-folded-light.png — Workers header 带着灰色 hover / 按下底：spec:145/149 刚点过 header 就截图，Done header 没有这层底，两个组标题看起来不一致。这是证据伪影，不是产品问题 — 建议：截图前把鼠标移开（`page.mouse.move(0,0)`）
- [LOW] main-report-batch-*.png、notice-view.tsx:87-88 — 回报卡里的 ask 项只显示泛化的 `Needs your approval`，同一时刻侧栏写的是可读原因 `git push origin…`。shim 已经有 `askReason`（data.ts:153），item.result 为空时可以用它 — 建议：pending 的 ask 项预览优先取 shim 的 askReason，取不到再用泛化文案
- [LOW] worker-dock-focused-light.png、notice-view.tsx:31-33 — 焦点交给了 dock 容器（tabindex=-1），不是 Allow 按钮，这个防误按的取舍正确。但容器没有可见的焦点或高亮，dock 也没有 role，读屏只读出 aria-label。鼠标用户问题不大（dock 本来就显眼），键盘用户却看不出焦点到了哪里 — 建议：给 `[aria-label="Local tool permissions"]:focus` 加 `--sand-border-focus-primary` 外描边（覆盖 CSS，一行），或者短暂闪一下高亮
- [LOW] main-report-single-dark.png 主 bot 行 — 主 bot 自己在跑（corner running 点），同时又有 worker 汇总的未读，同一行右侧出现上下两个点。这是上游 projectSidebarAgentStatus 允许的组合（expanded 布局下 marker 和 running corner 共存），只是 0.78.1 的主 bot 从来不会有未读，这个组合是 P6-15 的汇总带出来的新形态。可以接受，记一笔 — 建议：不改；P6-17 截图里如果反复出现、显得杂乱，再考虑汇总未读时压掉 corner
- [LOW] PLAN.md:91 — P6-15 行的表格坏了：行首是 `| **done** || P6-15 |`，状态列是 `**running** | **done**`，顺序描述还是那句笔误 `**done** → running → unread → done`（FINAL §2-2 已确认是笔误，但 PLAN 没改） — 建议：drafter 修行格式，把顺序改成「blocked > running > failed/stopped 未读 > unread > done」，状态列只留 done
reverse_take: 最可能的失败方式是「好看的骨架，跑在假数据上」：14 张图、70 条 e2e 的回报全部由测试插件按 wire 形状注入，侧栏状态和回报内容互不对应（Test fixer 在侧栏是已读，回报卡却写 Failed）；真链路的时序（follow 与 $events 双源、两种 eventId）到 P6-17 才第一次碰到，而本轮已经从截图里看到双源时序造成的标记空窗。更笨更稳的做法是：worker 状态只认一个事件源，ask 活状态只认一种 id；P6-17 用真链路把本闸门的 4 张关键图（4 态侧栏、合批卡、dock 聚焦、failed 行）重拍一次，作为开放闸 P6-14b 的前置证据。

---

## 评审正文

### 1. 视觉语言一致性（对 0.18 移植版）

- **token**：p6-15.css 全部使用 `--sand-*`，没有 `--dsw-*` 和 `--cursor-*`。这兑现了 FINAL §2-1；席 C 的 dsw 映射已被明确拒收（FINAL §2-1），理由成立，因为 renderer-grok 里 grep 不到 dsw。E20 用 computed 值核对过卡片边框、底色和任务卡左边线（spec:341、:357-358），但取值有过渡伪影的风险，见 MEDIUM 第 1 条。
- **密度**：worker 行用的是上游 `AgentSidebarItem`，md 头像、行高与普通 bot 一致；组标题 12px 三级灰、高 28；缩进 14+6 加 1px 竖线（`sidebar-workers-4states-light.png`）。与 r05 / P5 的侧栏密度一致，没有另造一种行。品味项 ⑧（不缩头像，只用 1px 竖线）**同意**：worker 是独立 bot，用完整行是对的（A §1.2）。
- **状态点**：blocked 用橙色 needs-attention，unread 用蓝色 info，running 用绿色 corner 点加 accent 色的 `Working`，全部是上游现成的 `SidebarStatusDot`。running 点在行右下角，比其他点低一截（4states 里的 Test fixer），这是 P5 移植版本来就有的样子（P5-57 `compare-conv-running.light.png` 的 APP 列一样），不属于本任务。
- **transcript**：Messaging 行和工具行同形（`main-report-batch-light.png` 和 `worker-dock-focused-light.png` 里的 Bash 行对照：图标、字号、尾部 chevron 位置一致）；失败行用 danger 色、不可点。回报卡是 elevated 底加 1px 边框、圆角 12、≤560，和灰色 assistant 气泡区分得开，读起来是「记录」，不像「主 bot 在说话」。任务卡是 accent 浅底加 2px 左边线，和回报卡同宽同列。三种视觉自成一族，不刺眼。
- **两份提案的取舍**：FINAL §1 有 18 条逐条定稿，§2 处理了席 A 的 6 处读码出入，§3 是新发现 F10–F15，取舍理由都写清楚了，实现也逐条兑现。核对结果：合成 section（sidebar.tsx:27-37）、`Workers` / `Done` 英文组名、Done 取反（sidebar.tsx:34、:46）、rail 去掉 worker（:30）、section 编辑回调剥掉（:21-25）、平局按 sessionId（workers.ts:84、sidebar.tsx:35）、预览不露 JSON（workers.ts:76-80）、主 bot 侧没有审批按钮（spec:291）、焦点给容器不给按钮（notice-view.tsx:31-33）、纯文本（全部是 React 文本节点）。席 C 有三条没采纳：「父 bot 名 + 的工作」组名、离线横幅、已读 failed 始终可见。各条都有理由（FINAL §1-2、§1-18、§1-7），我接受。

### 2. 交互旅程

- **出现**：E1 走通（spec:199-205），不重载、不进顶层。席 C 提的「首次出现时自动展开」被 A ④ 否决，理由是会和用户的折叠选择打架，而信号已经由主 bot 行承担。**同意 ④**。
- **卡住**：worker 行和主 bot 行都显示 needs-attention，主 bot 行写 `Waiting for you: Doc writer: git push…`，Workers 收起后信号仍在（`sidebar-workers-folded-light.png`）。主 bot 行的预览在 240px 处截断，worker 名加前缀占了一半宽度，不过原因在 worker 行里能读全，可以接受。
- **完成**：unread 用蓝点，主 bot 汇总也是蓝点，打开 worker 后清除，离开后才归档进 Done（不会在用户眼前跳进折叠组，这个细节做得好）。问题是双源时序造成的标记空窗，见 MEDIUM 第 2 条。
- **ask 跳回原卡**：从回报项或单项的 `Review in ‹name›` → focus(worker) → dock 容器获得焦点（`worker-dock-focused-*.png`；spec:303-309 断言 tagName≠BUTTON），作答只发 worker 原 eventId（spec:313-315）。主 bot 区域 Allow/Deny 按钮数为 0（spec:291-292）。决策 22 兑现。剩下的缺口是 ask 活状态的退回分支，见 MEDIUM 第 3 条。
- **回报卡不冒充用户消息**：卡在左列（spec:286 做了几何断言），`closest('[data-role="user"]')===null`，署 worker 头像和名字，头像和侧栏一一对得上（batch 图里 teal cloud = Test fixer、蓝三角 = Doc writer，品味项 ⑪ **同意**）。worker 侧的任务卡在左列、accent，标 `From Main Bot · Task`，排在 worker 回答之前（spec:334-338）。D5 UI 部分和 D7 UI 部分都兑现了。

### 3. 降级三条

1. **红点改文字前缀**：可以接受。要画红点就得 fork 上游行组件，代价和收益不成比例；用文字表达状态反而满足「状态不只靠颜色」。条件是这一档要补 e2e 和截图（MEDIUM 第 4 条），可选再把前缀染成 danger 色。
2. **真链路等 P6-10/12**：属于 P6-17 的范围，不在本闸门。但有两处 UI 侧的交接需要在 P6-12 之前改准：eventId 的选型（MEDIUM 第 3 条），以及 running/未读的双源（MEDIUM 第 2 条，真链路下只会更明显）。
3. **离线沿用上游**：可以接受。席 C 要求「离线时不得凭最后一次 running 断言仍在运行」，上游 offline 行为下 worker 的 running 角标是否会冻结，这一点没有验证，记为 P6-17 观察项，不升级。

### 4. 证据是否支撑结论

- 70 条 e2e、439 条单测由验收人在干净 worktree 先 build 后跑（VERIFY #2），可信。p6-workers 两条 spec 的断言密度高，覆盖 E1–E21，基本是可证伪的 DOM 和几何断言。
- dHash 证明的是「截图能从该 HEAD 复现」，**不能**证明「截图内容正确」。验收人没有视觉通道，三层程序化验证都碰不到渲染伪影。本席目检发现：暗色图拍在过渡中途（MEDIUM 第 1 条）；亮暗两张图状态不一致（MEDIUM 第 2 条）；hover 残留（LOW）。另外，侧栏状态和回报内容来自两套独立的假数据：`main-report-single` 里 Test fixer 在侧栏是已读、进了 Done，回报卡却写 Failed。所以这批图能评「组件长什么样」，不能评「旅程是否连贯」，后者要等 P6-17 真链路。
- 结论：证据足以支撑「P6-15/16 的 UI 组件与交互达标」，不足以支撑「暗色整屏品质」和「完成过渡的时序」，两者都列为 MEDIUM 跟进项。

### 5. 品味项逐条（FINAL §6，沿用 A §10）

| 项 | 裁 |
|---|---|
| ③ Done 默认折叠 | 同意 |
| ④ Workers 始终展开，不自动展开 | 同意 |
| ⑥ 合成 section | 同意（嵌套折页是第 4/5 级，未复现，要 fork 509 行） |
| ⑦ 打开主 bot 不清汇总 | 有条件同意（MEDIUM 第 5 条：P6-17 观察是否常亮） |
| ⑧ md 头像、1px 竖线 | 同意 |
| ⑨ 英文文案，沿用中文 notice | 同意；`Failed:` 预览已剥掉 `回复失败：`（workers.ts:60），侧栏不会中英混排 |
| ⑩ failed 用文字前缀不用红点 | 有条件同意（MEDIUM 第 4 条：补 e2e 和截图） |
| ⑪ 回报项带 worker 头像 | 同意，和侧栏对得上号 |

### 6. 结论

PASS。核心旅程都走得通：出现、卡住、作答回原卡、完成、回报不冒充用户、任务卡标明来源。视觉语言与 0.18 移植版一致，两份提案的取舍有理有据，上游零改动。5 条 MEDIUM 都是一两行的修复或交接措辞，或者是 P6-17 的跟进项，不需要本闸门再跑一轮；建议主会话把 MEDIUM 第 1、3 条（bothThemes 等过渡、askPending 退回分支）作为 S 档小修派掉，其余并进 P6-17 的验收清单。
