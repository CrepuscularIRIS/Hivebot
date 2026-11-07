# T23：状态行——主聊天进行中的 typing 三点换成 0.79.3 状态行（吉祥物 + 活动短语）

> 开单：manager (Opus 5.5) | 日期：2026-11-07 | 施工：main (GLM 5.3)
> 来源：queue U3；RE-UI-0.79.3 题 1(d)；T20 S2 参照图与事实表；queue 提议①（EMPTY_RESULT_NOTICE 收口，并入本单）
> 分支 / 作业目录：feat/T23 @ /tmp/bot-wt/T23（起点 = 集成分支含 merge 7ecc083b 的 HEAD）
> 排期：现在开。T24（建 bot 对话框）可以并行：本单**不碰** `shim/src/agents.ts`、`new-bot-dialog.tsx`
> claimed：2026-11-07 main (GLM 5.3) @ feat/T23
> accepted：
> 失败计数：0

## 为什么先做它
T22 合并后，主 transcript 不再渲染 thinking 和工具行。回合进行中，用户在主聊天里唯一能看到的是上游 `transcript.tsx:797` 那三个 typing 点（0.18 构件），另外只有侧栏吉祥物在动。0.79.3 在这个位置放的是一行状态行：bot 吉祥物，加一句随活动变化的短语，比如 "Mulling it over" / "Running a few commands"。见 `work/grok-0.79.3-re/ref/conv-working.light-t0.png`。用户要的就是「没有 CoT，但看得出它在干什么」，本单把这一行补上。

## 规格（经理已读 0.79.3 产物定稿，**以此为准，覆盖 queue U3 原文与 RE 题 1(d) 的「5s 轮换」说法**）

产物：`/tmp/grokbot-0.79.3/extracted/dist/renderer/assets/index.eager-app-BXVg2FvL.js`。搜索串见每条括号。

**轮换语义（关键更正）：没有按时间的轮换。** 下面每条都有代码依据：
- 短语只在活动切换时重选。`tZ` 新建状态时抽一次随机数 `phraseDraw`（搜 `function tZ(`），再由 `Jpt(列表, phraseDraw)` 取第 `floor(draw×len)` 句（搜 `function Jpt(`）。活动不变，短语就不变。这和 T20 实测 thinking 态 12s 内固定一致。
- `Gjn=5e3` / `Kjn=2500`（搜 `var Gjn=5e3`）**不是轮换周期，是「静默期」**。`Jjn` 算出静默时长：当前活动属于泛 working 类，或还没有活动，取 5000；thinking 只在门 `sand_side_model_status` 开时取 2500；其他情况为 null。从状态行出现起，静默期内 `isStatusQuiet=true`，渲染端 `statusReveal==='quiet'` 时**不出文字**（搜 `if(a===\`quiet\`)return null`），只显示吉祥物。
- 门 `isAgentStatusOn` = feature gate `sand_side_model_status`（搜 `function qle(`），默认关。**本单只实现门关语义**：thinking 无静默；跨活动不保留 phraseDraw。
- 活动切换防抖（`ren`，搜 `function ren(`）：比较新活动和当前显示的活动，判据是短语类 textKind 加图标是否相同（`nen`）。相同就保持原 `shownAtMs` 和 `phraseDraw`。不同时：当前已显示 ≥800ms 就立即切换，并重新抽签；不足 800ms 就进 `queued`，在 `shownAtMs+800` 时切到最新排队的活动（`ien`）。
- elapsed（`aen`/`oen`/`sen`）：同一活动显示满 60s 后，文字后加 `· {n}m`；满 60 分钟改为 `{h}h` 或 `{h}h {m}m`。每过一个整分钟边界重绘一次。
- 退场：回合结束（mode 变成 none）后，状态行带 `data-exiting` 再保留 140ms，然后卸载（`Yjn` 里 `exitUntilMs:g+140`）。
- typing 模式（`isAgentComposing` → "Typing…"）**本单不做**：我们的 agent 记录没有 composing 信号，补它要改 agents.ts，会和 T24 撞文件。只在纯函数里写一行 `ponytail:` 注释说明这个上限，以后有消费者再加。

**活动 → 短语类（`mO` 的子集，搜 `function mO(`）**，只搬我们 `activityOf` 产得出的工具名（`agents.ts ORIGINAL_TOOL` 映射之后的值）：

| activity | textKind | 短语 |
|---|---|---|
| `{kind:'thinking'}` | thinking | 列表 3 选 1（附录 A） |
| tool `Shell`（无 detail） | running_commands | Running a few commands |
| tool `Read` / `Skill` | reading_file | Reading the file |
| tool `WebSearch` | searching_web | Digging around |
| tool `WebFetch` | reading_web | Doing some reading |
| tool `SendToAgent` | messaging_assistant | Checking with another Bot |
| tool `Task`、其他名字（write/edit/glob/grep/…）、tool 为空 | working | 列表 5 选 1（附录 A），**有 5s 静默** |
| `null`（running 但没有活动） | working | 同上 |

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. 上面的规格节，以及附录 A/B
3. `app/ui/renderer-grok/frontend/src/recovered/features/conversation/workspace/transcript.tsx:617`（props 里有 `isAgentRunning`）、`:700`（根节点 `.sand-virtual-transcript` 本身就是滚动容器）、`:797`（typing 点）
4. `app/ui/renderer-grok/overrides/modules/transcript.tsx`（覆盖层，直接包上游）、`overrides/modules/markers.ts:71-74`（`activeAgent` 模块变量，先例）、`overrides/modules/chat-header.tsx:31`（header 覆盖在渲染期写 `activeAgent.id`；它的 props.agent 带 `isRunning` / `currentActivity`，类型见上游 `chat-header.tsx:14`）
5. `app/ui/renderer-grok/shim/src/agents.ts:64-72`（`activityOf`，只读，不改）
6. `app/ui/renderer-grok/frontend/src/recovered/features/conversation/workspace/agent-avatar.tsx:66`（`personaStateFromAgent`，状态行吉祥物复用它，不新画）
7. `app/ui/tests/e2e/p6-fold.spec.ts:20-64`（fake LLM `stepCall` + gate 写法）
8. `app/ui/renderer/fold/turn-fold.ts:25`（EMPTY_RESULT_NOTICE）

## 设计（施工照做；有更短而且同样满足验收的做法可以换，回执写理由）
1. **纯函数** `overrides/modules/status-line.ts`：
   - `phraseOf(activity, draw)`：上表加附录 A
   - `begin(activity, now, rand)` 对应 `tZ`
   - `step(state, activity, now, rand)` 对应 `ren`
   - `render(state, now, visibleSince)` → `{ text: string | null /* null = 静默 */, elapsed: string | null }`
   - `nextWakeMs(state, now, visibleSince)` → 下一个需要重绘的时刻，取排队切换、静默结束、整分钟边界三者的最小值；没有就返回 null
   - 常数 800 / 5000 / 60000 / 140 写成具名常量，注释里注上原名 `Gjn` 等

   不依赖 React，也不读 `Date.now()`，时间和随机数全部由参数传入。
2. **活动传递**：`markers.ts` 的 `activeAgent` 加 `running` / `activity` 两个字段；`chat-header.tsx` 覆盖在写 `id` 的同一处一起写。沿用已有的 ponytail 先例，不新开 IPC，也不新开 store。
3. **渲染**：`overrides/modules/transcript.tsx` 给上游传 `isAgentRunning={false}`，让 typing 点不再出现，然后自己渲染 `<StatusLine>`。它必须是 `.sand-virtual-transcript` 的**最后一个子元素**，这样随转录一起滚动、跟底时也看得见。推荐 `createPortal` 挂进该节点（notice-view 覆盖已有 querySelector 找宿主节点的先例）。
   - DOM 用 0.79.3 的类名：行是 `div.sand-status-line[data-role="assistant"][data-activity=<textKind>]`，退场时加 `[data-exiting]`；文字放在 `span.sand-activity-label__text`；elapsed 是另一个 span。
   - 吉祥物复用 `AgentAvatar` / `PersonaMark`，颜色和形状与侧栏同一个 bot 一致。
   - 一个 `setTimeout(nextWakeMs - now)` 驱动重绘，卸载时清掉。
4. **EMPTY_RESULT_NOTICE（提议①）**：文案改成 `已完成，没有文字结果`，删掉「· 展开查看过程」。T22 之后主聊天已经没有可展开的过程，过程入口在侧栏行菜单「Show full conversation」；文案里不指菜单名，免得提议② 挪入口时又要改。同步改 `tests/unit/fold/turn-fold.test.ts:74`、`tests/e2e/p6-fold.spec.ts:240,279` 三处断言。
5. **ToolResultCard 死路径（提议⑤）不进本单**：它和状态行无关，一张单只做一件事。已在 queue 记为 T29 计划行（机械删除，主 agent 可以直接按模板写单）。

## 边界
1. 只动：
   - 新建 `overrides/modules/status-line.ts`
   - 改 `overrides/modules/transcript.tsx`、`overrides/modules/markers.ts`（只加两个字段）、`overrides/modules/chat-header.tsx`（只加写入）
   - 必要的 CSS：放进现有的 overrides css，或者新建 `overrides/status-line.css`
   - 改 `app/ui/renderer/fold/turn-fold.ts`（只改常量文案）
   - 新建测试 `app/ui/tests/unit/grok-shim/status-line.test.ts`、`app/ui/tests/e2e/status-line.spec.ts`
   - 改上面设计 4 列出的三处断言

   超出这些就停下，写进回执存疑项。
2. **上游 `frontend/**`（含 `recovered/**`、`production/**`）、`source/**` 零改动**：`pnpm -C app/ui/renderer-grok check` 上游 diff=0。`shim/src/agents.ts`、`data.ts` 不改。
3. 隔离 HOME / TMPDIR，DBus 指向不存在路径；e2e 经 `scripts/run-e2e.sh`。ui e2e 和其他单错开，同一时刻只跑一套。
4. 只在 feat/T23 提交；等经理验收后才合并。

## 先红
先提交两份测试，再写实现。各跑一次，贴输出：
- `status-line.test.ts`：因 `status-line.ts` 不存在，import 失败即算红
- `status-line.spec.ts` ①：回合卡在 gate 时，`.sand-virtual-transcript .sand-status-line` 计数为 0（当前只有 `.sand-typing-indicator`）

## 验收（命令）
前置：在作业目录跑 `pnpm --config.verify-deps-before-run=false -C app/ui build`（run-e2e 不会重建 dist）。

1. `pnpm -C app/ui --config.verify-deps-before-run=false exec vitest run tests/unit/grok-shim/status-line.test.ts` → 全绿。格子至少包括：
   - a. **短语表**：上表每行一格，断言原文逐字相等。thinking 的 draw 取 0 / 0.34 / 0.99，分别得到附录 A 的第 1 / 2 / 3 句；working 的 draw 取 0 和 0.99，得到第 1 / 5 句。
   - b. **不轮换**：thinking 状态从 now=0 推进到 now=600000，`render().text` 始终是同一句。这一格保住的就是「T20 实测 12s 固定」。
   - c. **800ms 防抖**：t=0 thinking；t=300 切 Shell，仍显示 thinking 短语，且 `nextWakeMs` 为 800；t=800 推进后显示 "Running a few commands"。另一路：t=900 才切，立即生效。
   - d. **排队取最新**：t=100 Shell、t=200 WebSearch，t=800 显示 "Digging around"。
   - e. **同类不重抽**：Shell → Shell（新调用）时，`shownAtMs` 和 draw 不变；注入的 rand 只被调用 1 次（用 spy 计数）。
   - f. **5s 静默**：一出现就是泛 working，t<5000 时 `text===null`，t=5000 出文字，且 `nextWakeMs` 恰为 5000。thinking 在 t=0 就有文字。thinking 3s 后切 write，静默只到出现后 5000（从 visibleSince 起算，不是从切换起算）。
   - g. **elapsed**：同一活动在 59999 时 `elapsed` 为 null；60000 时为 `1m`；125000 时为 `2m`；3600000 时为 `1h`；3720000 时为 `1h 2m`。`nextWakeMs` 落在下一个整分钟边界。
   - h. **退场**：用纯函数，或者提一个 `exitUntil(now)` 小函数，断言 140ms 的边界。
2. 覆盖：`pnpm -C app/ui --config.verify-deps-before-run=false exec vitest run tests/unit/grok-shim/status-line.test.ts --coverage --coverage.include='**/overrides/modules/status-line.ts'` → 行覆盖 ≥90%（纯函数，没有理由低）。
3. `pnpm -C app/ui --config.verify-deps-before-run=false test:e2e tests/e2e/status-line.spec.ts` → 全部 passed：
   - ① **thinking**：fake LLM 一轮，reasoning 流在 gate 处卡住。断言：
     - 状态行出现，且是 `.sand-virtual-transcript` 的最后一个元素子节点
     - 文字 ∈ 附录 A thinking 三句
     - `.sand-typing-indicator` 计数为 0
     - 截一次图（给验收 6 用）
   - ② **切换可见**：同一轮放行后，模型调用 bash，bash 再按 p6-fold 的 gate 卡住。断言：
     - 文字变成 "Running a few commands"，`data-activity="running_commands"`
     - 记录 ① 文字最后一次出现到 ② 文字首次出现的间隔，回执贴出（应 ≥800ms 减去轮询粒度；不对它做硬断言，硬断言放在 unit）
   - ③ **退场**：放行 bash，终答出现后 2s 内状态行计数为 0；终答正文可见。
   - ④ **切 bot**：回合进行中切到另一个空闲 bot，那里没有状态行；切回来，状态行还在。
4. 回归：
   - `pnpm -C app/ui --config.verify-deps-before-run=false exec vitest run tests/unit/grok-shim tests/unit/fold` → 全绿（含改过文案的 turn-fold 格）
   - `test:e2e tests/e2e/p6-fold.spec.ts tests/e2e/session.spec.ts tests/e2e/outline.spec.ts` → 与施工前同数 passed（施工前先跑一次，记下基数）
5. `pnpm -C app/ui/renderer-grok check` → 上游 diff=0；`git diff <起点>..HEAD --stat` 只含边界 1 列出的文件。
6. **截图对照**：用 ① 的卡住态各出亮暗一张 `conv-working.{light,dark}.png`，覆盖 `work/grok-0.79.3-re/ours/` 下同名文件。再和 `ref/conv-working.{light,dark}-t0.png` 做左右拼版 `conv-working.cmp.{light,dark}.png`（ours|ref）。**截图必须来自已提交 HEAD 的构建**，回执写 `git rev-parse HEAD`。要对上的是：行的位置在首条消息下方、靠左；吉祥物是 bot 色的三点；文字为次级色。短语可以不同句（随机抽签），但必须属于同一组。
7. **working 态复测（规格的实测核对，不阻塞实现，但回执必须有）**：
   - 若 T20b 已终验：贴 `ref/conv-working.*.json` 的 `phrasesAcrossMounts`（应 ⊆ 附录 A thinking 组）和 `toolPhrases`（WebSearch 应恒为 "Digging around"、12s 内不变）
   - 若 T20b 未终验：在 T20 桩上跑 `node work/grok-0.79.3-re/harness/r3/drive.mjs --scene conv-working-tool --theme light`（`stub-init-0793.js:270` 已经有这个 scene，currentActivity = WebSearch），贴 t=0/5/10/12 的采样
   - 再把 scene 的 tool 改成 `'Write'`（泛 working）跑一次，贴采样。预期：t=0 无文字（静默），t≥5 为附录 A working 组里的一句，之后不变。

   实测和规格不符时，以实测为准改常数和格子，并在回执写明。改桩只在 feat/T20 的 harness 里做，不改 renderer 树。
8. 收尾：`pgrep -af 'bot-T23' | grep -v pgrep` → 空；隔离 TMPDIR 无遗留。

## 变异（各改一处，跑对应格，贴输出，还原用 cp，不用 stash/reset/checkout）
- M1：防抖阈值 800 改成 0 → unit c、d 红
- M2：`step` 在同一活动时也重抽签（rand 每次都调用）→ unit b、e 红
- M3：静默判定对 thinking 也给 5000 → unit f 红；如果 e2e ① 在 gate 前就截图，① 也应红（回执写明是否咬住）
- M4：transcript 覆盖把 `isAgentRunning` 原样传给上游 → e2e ① 红（typing 点计数≠0）
- M5：EMPTY_RESULT_NOTICE 还原成旧文案 → turn-fold 那一格红

## 为什么这样验收
要保住的是：过程期间用户看得到它在干什么，而且行为和 0.79.3 一致。
- unit b、e 加 M2 防的是按照 queue 原文去实现「5s 轮换」。那是对 `Gjn` 的误读，产物代码和 T20 实测都不支持。
- f 加 M3 防的是把静默期写反。
- e2e ① 加 M4 防的是两套指示同时出现。
- 「最后一个子元素」那条断言防的是状态行挂在滚动容器外面，长对话时看不见。
- 第 7 条用实物核对经理从代码读出的规格。经理读的是 minified 代码，回执里的实测才算证据。

## 不做
- typing 模式 / "Typing…"：没有 composing 信号，见规格节
- 门开（`sand_side_model_status`）分支：2.5s thinking 静默、跨活动保留 draw、SetStatus 自定义文案
- `messaging_named`（"Checking with {name}"）：我们的 activity 不带 target
- 头像状态动画的 14 动词全表：侧栏已有，本单只复用
- ToolResultCard 死路径删除（T29）

## 回执（`work/tickets/receipts/T23.md`）
需要包括：
- 先红输出
- 每条验收的原样输出
- 五刀变异
- e2e ②的切换间隔
- 截图路径和 HEAD
- 第 7 条实测采样
- 存疑项，尤其是：portal 挂载和上游虚拟列表的跟底 / 滚动是否冲突；切 bot 时 `activeAgent` 写入有没有一帧滞后

## 附录 A：短语原文表（来源 `/tmp/grokbot-0.79.3/i18n-en.json`；代码锚点 `var Gpt=[{id:\`np8SXe\`}`，在 eager-app 偏移约 1648.4k）
| 组 / textKind | i18n id | 原文 |
|---|---|---|
| thinking[0] | np8SXe | Thinking it through |
| thinking[1] | h3LL7E | Mulling it over |
| thinking[2] | Px2Nkv | Putting it together |
| working[0] | dfCCPD | Getting it done |
| working[1] | ZVMmJH | Making progress |
| working[2] | RQqcwV | Working on it |
| working[3] | 2z3X8R | Handling it |
| working[4] | p0demG | Chipping away |
| searching_web | LUow7U | Digging around |
| reading_web | Pi4ViD | Doing some reading |
| reading_file | 0oaMjP | Reading the file |
| drafting_file | 2QaEvy | Jotting it down |
| on_your_computer | TabDN8 | Working on your computer |
| running_commands | iX9Vlm | Running a few commands |
| organizing_files | KM/bWC | Moving files over |
| waiting_on_command | MsZyH5 | Waiting on results |
| generating_photo | DaFZJR | Sketching something up |
| generating_video | Hmg5kP | Filming a clip |
| coding | X5aLcA | Writing some code |
| waiting_for_you | 1OU+O9 | Needs your input |
| on_its_computer | FwyCjk | Clicking around |
| messaging_assistant | DJ8H5l | Checking with another Bot |
| messaging | V8soHw | Sending a message |
| connecting_app | NWAD+P | Working in a connected app |
| browsing_web | D3pv/7 | Clicking through pages |
| checking_usage | GOPPxK | Checking your usage |
| connecting_service（带参） | hC6cg6 | Working in {service} |
| messaging_named（带参） | d8xB/v | Checking with {name} |
| typing 模式 | PxYAul | Typing… |
| elapsed 包装 | e95M0z | · {0} |
| elapsed 分 / 时 / 时分 | ZSWUwq / /oqig9 / AgDSOa | {0}m / {hours}h / {hours}h {rest}m |

只搬上表里本单用得到的行（thinking 3 句、working 5 句、5 个单句类、elapsed 三式）。其余行留在附录里供以后对照，不进代码。

## 附录 B：锚点索引（eager-app-BXVg2FvL.js 字节偏移，renderer 树只读）
`Gpt/Kpt/qpt/Jpt/PN` ≈1648.4k · `mO` 1186552 · `tZ` 2723183 · `ren` 2723506 · `sen` 2724176 · 行渲染 `rtn` / `cZ`（quiet→null）≈2738.3k–2737.0k · `Gjn/Kjn/Jjn/Yjn` 3360515 · 行挂载（`statusReveal:o.kind===\`working\`&&o.isStatusQuiet?\`quiet\`:\`shown\``）≈3005.6k · 门 `qle`→`sand_side_model_status`
