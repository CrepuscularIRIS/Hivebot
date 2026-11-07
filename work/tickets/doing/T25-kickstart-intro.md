# T25：建 bot 后自我介绍（kickstart）——新 bot 先开口，引导提示不显示

> 开单：manager (Opus 5.5) | 日期：2026-11-07 | 施工：main (GLM 5.3)
> 来源：queue.md U6（原计划行编号 T26，本次与 onboarding 互换：kickstart = **T25**，onboarding = **T26**）；RE-UI-0.79.3 题 2(b)、差距表 #3；经理第 0 步探针（下节，已跑）
> 分支 / 作业目录：feat/T25 @ /tmp/bot-wt/T25，起点 = 含 T24 合并（8f60a7d1）的集成分支 HEAD
> 排期：现在开。T26（onboarding）、T30（对话框版式）排在本单**合并之后**：T30 会改 `data.ts createBot`（建后 rename），与本单同函数，不并行
> claimed：2026-11-07 main (GLM 5.3) @ feat/T25
> accepted：
> 失败计数：0

## 目标
用户在新建对话框点 Create 之后，新 bot 不等用户开口，自己先发一条自我介绍。触发它的那条引导提示在主聊天、outline 侧板、侧栏里都不出现。介绍发不出去时，会话里显示 0.79.3 原文 notice「Your Bot couldn't introduce itself」。

## 第 0 步探针（经理已跑，结论即规格）
产物 `/tmp/grokbot-0.79.3/extracted/dist/`，文案表 `/tmp/grokbot-0.79.3/i18n-en.json`。括号里是搜索串。

| 问题 | 结论 | 锚点 |
|---|---|---|
| 介绍的文案从哪来 | **模型实时生成**，不是 i18n 文案。i18n 里和介绍有关的只有两条：失败 notice `G4TlI/` "Your Bot couldn't introduce itself"，onboarding 的 `rMNow6` "Introducing your primary Bot" | i18n-en.json grep `introduc` |
| 消息长什么样 | 一条普通的 assistant `message` 条目，没有专门的 kind，也没有卡片。真实 bot 走 temporal harness，提示由服务端注入；renderer 对 temporal 不发 IPC（`kickstartAwaitingFirstMessage:async t=>{if(...harness===\`temporal\`){E(t);return}`），coordinator 对 temporal 回 `{isIntroductionInFlight:!1}`（COORD 搜 `D==="kickstartAgent"&&Be==="temporal"`）。所以客户端的 transcript 里**没有那条引导用的 user 消息** | eager-app `kickstartAwaitingFirstMessage:async` |
| 等介绍时界面显示什么 | launcher 把 agentId 放进 `awaitingFirstMessage`。会话没有条目时，`Re=xle(i)&&!ie&&c` 让 `isChatStarting=true`，状态行显示 working（`DFn({setup,isChatStarting:Re,…})`）。安全看门狗 90s（`sdr=9e4`）后清掉 | eager-app `function xle(` |
| 失败怎么呈现 | notice code `introduction_failed` → `G4TlI/`（`var j8={…introduction_failed:{id:\`G4TlI/\`}`）；dedupeKey `introduction-failed:${agentId}`（`function yZn(`） | eager-app `introduction_failed` |
| 抑制开关在哪 | **没有 UI 开关**，queue 原文「建 bot 时可关掉」的说法不成立。是否抑制在代码里自动决定：①新建对话框创建期间用户已经排了一条首消息（`isKickstartRequested:()=>!at.current`，`at` 在提交 prompt 时置 true）；②new-chat-bar 带着首句建 bot（`createAgent(…,{isKickstartRequested:!u})`，u = 有首句）；③plugin-auth、team-bot 等内部建 bot 写死 `isIntroductionSuppressed:!0`。main 侧规则：`introductionSuppressed: isIntroductionSuppressed===!0 \|\| isKickstartRequested!==!0`，也就是**不显式请求就不介绍** | eager-app `isKickstartRequested:()=>!at.current`；main-app.cjs `introductionSuppressed:n.isIntroductionSuppressed` |
| 什么时候发 | createAgent 成功、选中新 bot 之后立刻发，不等用户的第一轮（`uQn` 里 `setAgentId → onAgentCreated → await kickstartAwaitingFirstMessage`）。onboarding 是例外：等 `markOnboardingSeen()` 之后才发（T26 用） | eager-app `markOnboardingSeen().then(` |

**对我们的映射**：
- 我们的 bot 是本地 dsh 会话，没有服务端代发，只能由 shim 往新会话发一条 `session/prompt`。这条提示会作为 user 消息进入 dsh 历史，所以要在显示层隐藏。
- 隐藏的方式照 0.79.3 自己隐藏系统注入 user 消息的写法：内容用专用标签包起来，再按内容匹配（`function NF(`：`startsWith('<flight_travelers_reply>')&&endsWith(…)`，由 `wxt` 在主聊天隐藏）。按内容匹配，reload 重放历史后照样能认出来，不依赖 rpcId 是否持久化。
- 注意：queue 原文把这条隐藏规则对到 `wxt`，这个说法不准。`wxt` 只认 flight 表单回复，我们借的是它的写法，不是它本身。
- 我们的 UI 建 bot 只有新建对话框一个入口（侧栏 New / 市场 / 配置面板 → `new-bot-dialog.tsx:130` → `pbotsUi.createBot`）。对话框是模态的，创建期间排不了首消息，所以上面的①②在我们这里不会出现，默认就是介绍。抑制只做成 `createBot` 请求上的一个参数 `kickstart?: boolean`（缺省 true），留给 T26：onboarding 要先建 bot、等走完引导再介绍。
- `createBots` 测试 helper 直接调 M1 `session/create`，不经过 createBot，不会触发介绍。编排 `create_bot` 工具建的 worker 也不经过 createBot，同样不介绍（它们本来就带着任务）。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. 上面的探针表
3. `app/ui/renderer-grok/shim/src/data.ts:249-273`（`createNotice` / `entriesOf`，L-7 O4 的建后 notice 先例）、`:482-492`（`sendPrompt`，`session/prompt` 的调法）、`:549-576`（`createBot`）
4. `app/ui/renderer-grok/shim/src/entries.ts:86-93`（user 条目序列化）、`shim/src/outline.ts:47-49`（outline 的 user 行）
5. `app/ui/renderer-grok/shim/src/bots.ts:62`（`createBot` 请求类型）
6. `app/sdk/tests/support/fake/plugin.mjs:103-141`：先找 `scripts/<sid>.json`，找不到退到 `scripts/default.json`，两个都没有就抛错，且这时 cursor 不前进；每次调用都往 `requests.jsonl` 记一行 `userTexts` 和 `purpose`
7. `app/ui/tests/e2e/create-dialog-character.spec.ts:60-88`（经对话框建 bot 的 e2e 写法）、`tests/support/ui.ts:22`（`textCall`）、`tests/e2e/session.spec.ts:117`（`__pbotsDev.failNext`）

## 设计（照做；有更短、同样过验收的做法可以换，回执写理由）
1. **`entries.ts`**：
   - 导出常量 `KICKSTART_PROMPT`：`<bot_introduction_request>You were just created. Greet the user and introduce yourself in two or three short sentences: your name if you have one, your personality, and what you can help with. Don't use any tools.</bot_introduction_request>`
   - 导出谓词 `isKickstartPrompt(text)`：trim 之后以 `<bot_introduction_request>` 开头、以 `</bot_introduction_request>` 结尾。只认标签不认正文，以后 T30 往里加名字时旧会话照样能认。
   - `toRawEntries` 的 `user` 分支：命中谓词就 `break`，不产出条目。
2. **`outline.ts`**：`user` 分支同样跳过。0.79.3 客户端 transcript 里本来就没有这条，「Full conversation」应该从 bot 的介绍开始。
3. **`data.ts createBot`**：在 `openFollow(sid)` 和 `push.agents()` 之后，`req.kickstart !== false` 时调用 `api('session/prompt', { request: { requestId: \`kickstart-${sid}\`, sessionId: sid, mode: 'queue', content: [{ type: 'text', text: KICKSTART_PROMPT }] } })`。
   - 要 await 这次调用，但它失败不影响建 bot：`createBot` 仍然返回 `ok:true`。
   - 失败时往 `createNotices` 写 `Your Bot couldn't introduce itself`（0.79.3 原文）。如果这个 sid 已经有一条 model notice，就用 `\n` 把两条拼起来，两条都要看得见。
4. **`data.ts createNotice`（真 bug 预防，必须改）**：现在的撤除条件 `view.items.some((i) => i.kind === 'user')` 会被介绍提示本身触发，model 失败的 notice 一闪就没。撤除条件改成「存在一条 **不是** kickstart 提示的 user 条目」。
5. **`bots.ts`**：`createBot` 请求类型加 `kickstart?: boolean`。
6. 不新开 IPC、不加 store、不碰对话框。等介绍时的状态行由 T23 现有逻辑给：bot 在跑，状态行就出来，不需要另做 `isChatStarting`。

## 边界
1. 只动：`shim/src/entries.ts`、`shim/src/outline.ts`、`shim/src/data.ts`（只改 `createBot` 和 `createNotice` 两处）、`shim/src/bots.ts`（只改类型）。测试：`tests/unit/grok-shim/entries.test.ts`、`outline.test.ts` 加格；新建 `tests/e2e/kickstart.spec.ts`。超出这些就停下，写进回执存疑项。
   - 例外：回归里如果有经对话框建 bot 的 spec，**只因为**介绍那一轮没有脚本（fake 报 `no scripted call #0`）而红，允许在该 spec 里写一份 `default.json` 介绍脚本。每处都在回执里列出来，并贴改前的红输出。别的改法一律不允许。
2. **不碰** `new-bot-dialog.tsx`、`character.tsx`（T30 / T24 的文件）、`desktop.ts`（T26）、`frontend/**`、`source/**`、main 进程。`pnpm -C app/ui/renderer-grok check` → 上游 diff=0。
3. 隔离 HOME / TMPDIR，DBus 指向不存在路径；e2e 走 `scripts/run-e2e.sh`。ui e2e 同一时刻只跑一套，机器负载高时先停。
4. 只在 feat/T25 上提交，经理验收通过后才合并。

## 先红
先提交测试，跑一次，贴输出，再写实现：
- `entries.test.ts` 新格：输入 user 文本 = `KICKSTART_PROMPT`，后面跟一条 assistant，期望 raw 里只有那条 assistant。现在因为 `KICKSTART_PROMPT` 导不出来而红。
- `kickstart.spec.ts` ①：Create 之后 30s 内，主聊天出现介绍脚本的正文。现在不发提示，所以超时红。

## 验收（命令）
前置：在作业目录跑 `pnpm --config.verify-deps-before-run=false -C app/ui build`（run-e2e 不会重建 dist）。

1. `pnpm -C app/ui --config.verify-deps-before-run=false exec vitest run tests/unit/grok-shim/entries.test.ts tests/unit/grok-shim/outline.test.ts` → 全绿。新格至少包括：
   - a. 谓词：标签包裹的文本命中，前后带空白也命中；正文完全相同但没有标签的不命中；只有开头标签的不命中；用户消息里引用了标签但没有包住整段的不命中
   - b. `toRawEntries`：kickstart user 不出条目，紧跟的 assistant 照常出；同一个窗口里还有一条普通 user 时，那条照常出
   - c. `toOutlineItems`：kickstart user 不出行，普通 user 出 `kind:'user'` 行
2. `pnpm -C app/ui --config.verify-deps-before-run=false test:e2e tests/e2e/kickstart.spec.ts` → 全部 passed：
   - ① **介绍出现**：开对话框之前，把 `[textCall(['Hi! I am your new bot, happy to help.'])]` 写进 `env.rt.home/fake/scripts/default.json`，然后侧栏 New → Create。断言：
     - 30s 内 `finalAssistant(page)`（`tests/support/ui.ts:154`）里有这句正文
     - 主聊天 `.sand-transcript-row[data-role="user"]` 计数为 0
     - 页面 `body` 文本不含 `bot_introduction_request`
     - `requests.jsonl` 里该 sid 那一行的 `userTexts` 含 `<bot_introduction_request>`：证明提示真的到了模型，不是本地伪造的一条消息
     - 截一次图给验收 6 用
   - ② **reload 后仍隐藏**：同一环境 `page.reload()`，新 bot 仍是 active。断言介绍还在、user 行计数仍为 0。这一格保的是按内容匹配在历史重放后依然有效。
   - ③ **outline**：对新 bot 打开「Show full conversation」。断言没有 `[data-kind="user"]` 行，有一行 assistant-text 含介绍正文。
   - ④ **用户接着说话**：给该 sid 写脚本 `[textCall(['reply'])]`。注意：介绍那一轮用的是 default.json，这个 sid 的 cursor 已经是 1，所以脚本第 0 项要放一个占位调用，或者整份写成两项，以施工实测为准，回执写明。然后 `send` 一句 `hello there`。断言主聊天正好 1 条 user 行，内容是 `hello there`；介绍仍在它上方。
   - ⑤ **抑制**：`page.evaluate` 调 `window.pbotsUi.createBot({ preset: <默认 preset>, connectors: [], kickstart: false })`。preset 取法和对话框相同：`list.find(isDefault)`。等 5s，断言 `requests.jsonl` 里**没有**这个新 sid 的行，它的主聊天没有 assistant 行。
   - ⑥ **失败 notice**：Create 之前 `__pbotsDev.failNext('session/prompt')`。断言 bot 照常建好（侧栏多一行、active），会话里出现 notice `Your Bot couldn't introduce itself`。
3. 覆盖：本单改动行覆盖 ≥80%。工具链缺 `@vitest/coverage-*` 时（T23 验收已核实缺件），在回执里手工逐行列出改动行由哪一格覆盖，同 T23 的处理。
4. 回归：
   - `vitest run tests/unit/grok-shim` → 全绿
   - `test:e2e tests/e2e/create-dialog-character.spec.ts tests/e2e/bots.spec.ts tests/e2e/market.spec.ts tests/e2e/grok-persona.spec.ts tests/e2e/outline.spec.ts tests/e2e/status-line.spec.ts` → 与施工前同数 passed。施工前先跑一次记下基数，例外处理见边界 1。
5. `pnpm -C app/ui/renderer-grok check` → upstream diff=0；`git diff <起点>..HEAD --stat` 只含边界 1 列出的文件。
6. **截图对照**：用 ① 的截图出亮暗各一张 `work/grok-0.79.3-re/ours/kickstart-intro.{light,dark}.png`，和 `ref/conv-done.{light,dark}.png` 左右拼成 `kickstart-intro.cmp.{light,dark}.png`（ours|ref）。T20 没有「建后介绍」的专门参照图：0.79.3 介绍就是一条普通 assistant 消息，没有 kind 也没有卡片，所以对照 conv-done 里 assistant 行的样式就够了（左侧、bot 头像、正文样式）。不同点在于 ours 上方没有 user 气泡，这是预期。回执注明「参照为 conv-done 的 assistant 行，介绍态无专门参照，等待态（isChatStarting）未验证」。**截图必须来自已提交 HEAD 的构建**，回执写 `git rev-parse HEAD`。
7. **探针（施工时顺手跑，不阻塞，回执必须有）**：
   - P1：① 跑完后贴新 sid 在 `requests.jsonl` 里的全部行（`purpose` 字段）。如果 dsh 有起标题之类的额外调用（purpose≠null），它会吃掉 default.json，甚至用介绍提示起标题。再贴 `devState(page).views[sid]` 和侧栏行的 `aria-label`：名字里不能含 `bot_introduction_request`；含了就写进存疑项，不要自己修。
   - P2：⑥ 之后会话里除了我们的 notice，还有没有 dsh 自己的失败条目，原样贴出。
8. 收尾：`pgrep -af 'bot-T25' | grep -v pgrep` → 空；隔离 TMPDIR 无遗留。

## 变异（各改一处，跑对应格，贴输出；用 cp 还原，不用 stash/reset/checkout）
- M1：`toRawEntries` 去掉 kickstart 跳过 → unit b 红，e2e ① 红（user 行计数≠0）
- M2：`outline.ts` 去掉跳过 → unit c 红，e2e ③ 红
- M3：谓词改成正文完全相等（不认标签）→ unit a 里「前后空白」那格红
- M4：`createBot` 忽略 `kickstart:false` → e2e ⑤ 红
- M5：`createNotice` 撤除条件改回 `some(kind==='user')` → 补一格 unit 或 e2e：model notice 加介绍同时存在时 notice 仍在。没有现成的 model 失败注入时，施工自己选最短的格子，回执写明哪格咬住
- M6：失败分支不写 notice → e2e ⑥ 红

## 为什么这样验收
要保住两件事：新 bot 真的先开口（模型收到了提示，生成了正文）；用户永远看不到那条提示。
- ①的 `requests.jsonl` 断言防的是用本地伪造一条 assistant 消息来过检查。0.79.3 的介绍是模型现写的。
- ② 防的是只在内存里隐藏、重启就露馅。
- ③ 防的是主聊天藏住了，「Full conversation」侧板却露了出来。
- ④ 和 M5 防的是隐藏规则误伤用户自己的消息，以及 L-7 O4 的建后 notice 被介绍提示顶掉。
- ⑤ 防的是开关写了却不生效。T26 的 onboarding 要靠它先建 bot 再延后介绍。

## 不做
- 等待态（`awaitingFirstMessage` / `isChatStarting` 和 90s 看门狗）：bot 在跑时，T23 状态行已经给了等价反馈
- 介绍提示带上 bot 名字：等 T30 有了名字字段再做，记在 T30 计划行
- 「Help me create a Bot」接线（`isBotBuilderRequested`）：拆成 T31 计划行，等 T30 把卡片渲染出来以后
- onboarding 主 bot 走完引导再介绍：T26，用本单的 `kickstart:false`，并把内部的 kickstart 暴露出来
- 用户在创建期间排首消息 → 自动抑制：我们的对话框是模态的，没有这个路径

## 回执（`work/tickets/receipts/T25.md`）
需要包括：先红输出；每条验收的原样输出；6 刀变异；截图路径和 HEAD；P1/P2 探针原文；回归基数前后对比和例外清单；存疑项，尤其是 ④ 的 cursor 写法，以及介绍那一轮跑起来时用户立刻发消息（queue 模式）的表现。
