# T30：新建对话框换 0.79.3 版式——名字 + 形象在上，我们的三项收进「More options」，建后改名并在自我介绍里带上名字

> 开单：manager (Opus 5.5) | 日期：2026-11-07 | 施工：main (GLM 5.3)
> 来源：queue.md U4b（T30 计划行）；T24 终验遗留三项（预览尺寸 / 选中态 / Black）；T25「不做」里的「介绍提示带名字」；Q-032（默认 A，未答，按 A 施工）
> 分支 / 作业目录：feat/T30 @ /tmp/bot-wt/T30，起点 = docs/rebuild-p6-p5-plan 21f6127c（已含 T24/T24b、T25、T26、T28 合并）
> 排期：现在开。与 T28b / T32 不同文件；与 T31 的关系见下面「对计划的更正」
> claimed：2026-11-07 main (GLM 5.3) @ feat/T30
> accepted：
> 失败计数：0

## 目标
新建对话框和 0.79.3 默认版长得一样：标题「Create New Bot」，上面是大吉祥物，接着是名字框，再下面是形状和颜色。我们自己的 preset / 连接器 / 模型收进默认折叠的「More options」。不填名字不能建。建好以后侧栏显示这个名字，bot 自我介绍时也知道自己叫什么。

## 经理第 0 步探针（已跑，结论即规格）
产物 `/tmp/grokbot-0.79.3/extracted/dist/renderer/assets/index.eager-app-BXVg2FvL.js`（括号里是字节偏移），文案 `/tmp/grokbot-0.79.3/i18n-en.json`。

**0.79.3 有两个新建对话框，参照图是默认那个。** 外层是 `ie.isOn ? Dhn(...) : whn(...)`（≈3878394）。`ie = c9e()` 要求同时打开 `grok_bot_create_a_bot_dialog` 和 `grok_bot_in_place_share` 两个 flag 并满足 `Kf()`，否则走 `whn → Thn`。T20 的六张参照图标题都是「Create New Bot」(`nHOJ2T`)，json 里 `helpCard=false`，所以图上是 **Thn**。RE-UI 题 2(a) 把两个版本混在一起写了。

| 项 | Thn（默认，本单的规格） | 锚点 |
|---|---|---|
| 标题 | 「Create New Bot」(`nHOJ2T`)；右上角有关闭钮 `Nw.CloseButton` | Thn 体 ≈3093616 |
| Body 顺序 | **预览 → 名字框 → picker → 报错行**，就这四样，没有任何 label | `children:[A,I,z,B]` |
| 预览 | `hT{sizePx:xhn}`，**`xhn=96`**（58 是 Ahn 版的 `Ehn`，T24 存疑项「约 79」也作废） | `var xhn=96` ≈3092422 |
| 名字框 | `<input type=text maxLength=255>`；`aria-label`「Bot name」(`RFtRvq`)；placeholder「Name your Bot」(`2DQ7aH`)；`initialFocus` 指向它（打开就聚焦） | ≈3094339 / 3094620 |
| Create 可用 | `y = name.trim().length > 0 && !isPending`；只有空格也是置灰；提交的是 trim 后的名字 | Thn 头部 |
| Enter | `key==='Enter' && !nativeEvent.isComposing` → preventDefault 后提交（输入法组字时按回车不提交）；提交函数内部再查一次 `y` | `onKeyDown:P` |
| 提交中 | Create 文字变成「Creating…」(`/DwR+n`)；Esc 和点外面都关不掉 | `closeOnEscape:!r` |
| 报错 | `<span role="alert">`，放在 picker 下面、Body 里面 | `B=a==null?null:…role:'alert'` |
| 底栏 | Cancel(`dEgA5A`) + Create(`hYgDIe`, primary) | `Nw.ActionBar` |
| 「Help me create a Bot」卡 | **Thn 里没有**。只有 Ahn 版有，而且还要单独开 `grok_bot_help_create_bot` flag（`Dhn` ≈3097623） | — |
| 建 bot 时的名字 | 作为 `createAgent({name,…})` 的一个字段，原子写入，**不是建完再改名** | `Mt=(e,t)=>…uQn({name:e.name,…})` |

**参照图实测**（T20 harness 是 1440×900、DPR 2，见 `harness/r3/drive.mjs:75`；下面都是 CSS px，正负 4 以内算对上）：对话框宽约 440，左右内边距约 16；头部高约 55，下面有分隔线；名字框宽约 405、高约 35，**文字居中**；形状按钮间距约 57、图形约 36；色板直径约 24、间距约 40，排成 6+5 两行；底栏高约 56，上面有分隔线，两个按钮靠右；Create 置灰时是浅灰底。

**选中态**（看 `ref/create-dialog.light.png`、`-named`、`dark-named`）：
- 形状：图形外面有一圈**沿轮廓走**的贴纸边——先是一圈表面色的宽描边（亮色白、暗色深灰），外面再一条细的灰线。这不是方块底，T24 终验写的「白底描边圆角块」不准，以图为准。
- 色板：一圈表面色的缝，外面一条细灰环。

## 对计划的更正（已同步改 queue）
1. **「Help me create a Bot」卡本单不做，T31 搁置。** 这张卡只在 flag 版 Ahn 里有；默认版 Thn 没有，我们要对齐的参照图上也没有。只渲染、不接线的卡是一个点了没反应的按钮，比不放还糟。T31 的前提（「T30 先把卡渲染出来」）不成立，改成搁置；用户要的话，要连 Ahn 整套一起做（标题「Create a Bot」、use 卡等），那是另一张单。
2. **建后的「名字」不是 0.79.3 的做法，是我们的映射**：dsh 的 `session/create` 没有 name 槽，所以先建会话，再调 `session/rename`。仓里已经有两处这样写的先例：`data.ts:535`（onboarding）和 `data.ts:564`（无 chooser 的 createAgent）。
3. **顺带修一个现存 bug（同一个根因）**：`data.ts:550` 拼 onboarding 介绍提示时写的是 `` `${KICKSTART_PROMPT}${desc}` ``，`desc` 被接在**闭合标签后面**。只要用户在 onboarding 选了 role（`creatorContext` 非空），`isKickstartPrompt` 的 `endsWith('</bot_introduction_request>')` 就不成立，这条提示会作为 user 消息露在主聊天里。T30 本来就要往标签里加名字，所以统一改成「一个构造函数，所有内容都放在标签里面」，两个调用点都改用它。

## 方案（照做；有更短、同样过验收的做法可以换，回执写理由）
1. **`shim/src/entries.ts`**：新增 `kickstartPrompt(o: { name?: string; setup?: string }): string`。产出 `<bot_introduction_request>` + (`name` 非空时加 `Your name is ${name}. `) + 原来的正文 + (`setup` 非空时加 ` Your setup: ${setup}`) + `</bot_introduction_request>`。
   - `KICKSTART_PROMPT` 改成 `kickstartPrompt({})`，**结果必须和现在的字符串逐字节相同**（单测钉住），这样 T25 之后建的旧会话照样认得出来。
   - 谓词 `isKickstartPrompt` / `isKickstartEntry` **不动**。它们只看开头和结尾的标签（加上 rpcId 前缀），中间的正文换成什么都兼容。
2. **`shim/src/bots.ts`**：`createBot` 的 req 加 `name?: string`。
3. **`shim/src/data.ts createBot`**：
   - 改名放在 `session/create` 成功之后、**selectModel / openFollow / kickstart 之前**，并且要 await：`name = req.name?.trim()`，非空就调 `api('session/rename', { request: { sessionId: sid, title: name } })`。
   - 改名成功：`summaries[sid].title = name`。
   - 改名失败：bot 照样建（`ok:true`）；`createNotices` 写 `Bot created, but the name wasn't saved: <msg>`，和已有 notice 用 `\n` 拼在一起，与 model notice、介绍失败 notice 同一个模式；title 留 null。
   - kickstart 的文本改成 `kickstartPrompt({ name: renamed ? name : undefined })`。**名字没存上就不往介绍里写**，否则侧栏显示默认名，bot 却报另一个名字。
   - onboarding 分支（`:550`）改成 `kickstartPrompt({ setup: a.description })`，删掉手写的 `desc` 拼接。
4. **`overrides/modules/new-bot-dialog.tsx`**（版式按 Thn 重排）：
   - 标题默认改成 `'Create New Bot'`。`init.title` 仍可覆盖（市场、配置面板入口自己的标题），关闭钮不动。
   - 去掉「Character」legend 和外层 fieldset 的标题。Body 顺序：**预览（`sizePx={96}`）→ 名字 input → 形状 → 色板 → More options → 报错**。
   - 名字 input：受控、`maxLength={255}`、`aria-label="Bot name"`、`placeholder="Name your Bot"`、文字居中；打开时聚焦它，**替换掉现在聚焦 preset radio 的那句 rAF**。Enter 走 `<form>` 原生的隐式提交即可：提交钮 disabled 时原生不会提交，组字中的回车浏览器也不会触发 submit。`submit()` 里自己再查一次 trim 后不为空。施工时用 e2e ② 证明这条路通；不通再补 onKeyDown，写进回执。
   - Create 的 disabled 条件：`name.trim() === '' || presetId === '' || bundles === null`；busy 时照旧。
   - **More options = 原生 `<details>`**，`<summary>More options</summary>` 里面放现在的 Preset / Connectors / Model 三组、「Configuration is locked…」说明和 missing 提示。`open` 的初值是 `init.preset ?? init.connectors?.length ?? init.model` 有值（预填入口自动展开）。`init.note` 留在 details 外面，紧跟标题下方。
   - `createBot` 请求加上 `name: name.trim()`。
5. **样式（`overrides/p5-57.css`）**：按上面「参照图实测」调尺寸：形状钮 pitch 约 57、图形约 36，色板 24 / 间距 40 并保持 6+5，名字框，对话框宽 440。**T24b 的 5/5/3 断言必须继续绿**，max-width 跟着新尺寸重算。
   - 选中态：形状按钮去掉灰底，在 `ShapeGlyph` 里同一条 path 先画两层描边（外层细灰、内层表面色宽边），再画填充，只在 `aria-pressed` 时画。色板用 `outline: 1px solid <灰>; outline-offset: 2px`，或者等价的双层 box-shadow。
6. **Black 预览（`overrides/modules/character.tsx`）**：现在 `COLORS.black = {light:'#000', dark:'#FFF'}` 被当成渐变两端，所以 Black 吉祥物在任何主题下都是黑到白的渐变。改成：color 是 black 时 fill 用 `personaInk('black', surfaceTheme)` 的纯色，其他颜色不动。
   - 注意：`surfaceTheme` 没传时要有确定的回落。对话框调用处要把主题传进去。侧栏的 `AgentAvatar` 走不走这里，施工时 grep 确认后写进回执。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md（e2e 先 build；`pnpm -C app/ui --config.verify-deps-before-run=false test:e2e <file>`）
2. 上面的探针表和三张参照图：`ref/create-dialog.light-empty.png`、`light-named.png`、`dark-named.png`
3. `overrides/modules/new-bot-dialog.tsx` 全文；`overrides/p5-57.css:131-176`
4. `shim/src/data.ts:524-571`（createAgent 两个分支）、`:598-633`（createBot）、`:677-683`（finishKickstart）；`shim/src/entries.ts:34-48`
5. `tests/e2e/create-dialog-character.spec.ts`（开对话框、Create 的写法，以及 ① 的 5/5/3 断言）、`tests/e2e/kickstart.spec.ts`（requests.jsonl 和 default.json 的写法）

## 边界
1. 只动：`overrides/modules/new-bot-dialog.tsx`、`overrides/p5-57.css`、`overrides/modules/character.tsx`（只改 Black 预览一处）、`shim/src/entries.ts`（加构造函数）、`shim/src/bots.ts`（只改类型）、`shim/src/data.ts`（只改 createBot 和 `:550` 一行）。
   - 测试：`tests/unit/grok-shim/entries.test.ts` 加格；新建 `tests/e2e/create-dialog-0793.spec.ts`；新建 `tests/e2e/shot-create-dialog.spec.ts`，**带 `test.skip(!process.env.PBOTS_SHOT)` 门**（queue 提议⑦的口径）。
   - **回归 spec 例外**：经对话框建 bot 的 spec（`bots`、`create-dialog-character`、`kickstart`、`market`、`settings`、`resilience`、`workspaces`、`journeys/d10b-d7`、`shot-character`、`shot-kickstart`），**只有**因为「Create 置灰（没填名字）」或者「preset / 连接器 / 模型折叠看不见」而红时，才允许在点 Create 之前加一行填名字，或者加一行点开 More options。每处都列进回执，附改前的红输出。别的改法一律不允许。
2. **不碰**：上游 `frontend/**`、`source/**`、main 进程、`onboarding-*.tsx/ts`（onboarding 只靠 data.ts 那一行修好）、`outline.ts`、isKickstart 两个谓词。不做 Help 卡。`pnpm -C app/ui/renderer-grok check` → upstream diff=0。
3. 先红，先提交测试，各跑一次贴输出：
   - `entries.test.ts`：`kickstartPrompt` 导不出来，红。
   - `create-dialog-0793.spec.ts` ①：标题不是「Create New Bot」、找不到 `textbox[name="Bot name"]`，红。
4. 隔离 HOME / TMPDIR，DBus 指向不存在路径；e2e 走 run-e2e；ui e2e 同一时刻只跑一套；机器 load 高时先停，回归分批跑。
5. 只在 feat/T30 上提交，经理验收通过后才合并。

## 验收（命令）
前置：在作业目录跑 `pnpm --config.verify-deps-before-run=false -C app/ui build`，退出码 0，build 输出不能吞（T24 的教训：build 失败时跑的是旧 dist，结果是假绿）。

1. `pnpm -C app/ui --config.verify-deps-before-run=false exec vitest run tests/unit/grok-shim/entries.test.ts` → 全绿。新格：
   - a. `kickstartPrompt({}) === KICKSTART_PROMPT`，而且等于 T25 的原字符串字面量（测试里写死原串）
   - b. `kickstartPrompt({name:'Research Helper'})`：`isKickstartPrompt` 为真，含 `Your name is Research Helper.`
   - c. `kickstartPrompt({setup:'X'})`：`isKickstartPrompt` 为真（这一格就是 `:550` bug 的回归格）；`{name:'',setup:''}` 的结果等于 `KICKSTART_PROMPT`
   - d. 旧格（T25 谓词 a/b/c）全部不变
2. `pnpm -C app/ui --config.verify-deps-before-run=false test:e2e tests/e2e/create-dialog-0793.spec.ts` → 全 passed：
   - ① **版式**：侧栏 New 真实点击打开。断言：
     - 标题「Create New Bot」
     - `getByRole('textbox',{name:'Bot name'})` 有 `placeholder="Name your Bot"`、`maxlength="255"`，并且是 `document.activeElement`
     - y 坐标顺序：预览 < 名字框 < 第一个形状钮 < 第一个色板 < `summary`「More options」
     - 预览外框宽高在 96±4
     - 对话框里没有文字「Help me create a Bot」
     - `details` 没有 open；Preset radio 不可见
     - Create 是 disabled；填 `"   "` 后仍是 disabled；填 `Research Helper` 后可用
   - ② **Enter 建 + 名字到位 + 介绍带名字**：先写 default.json 介绍脚本（kickstart.spec 的写法）→ 开对话框 → 选 `house` + `orange` → 在名字框里填 `Research Helper` 后按 **Enter**（不点 Create）。断言：
     - 对话框关闭；新 bot 的侧栏行名字 = `Research Helper`，头像 `[data-avatar-shape="house"][data-avatar-color="orange"]`；会话头名字也一样
     - `requests.jsonl` 里新 sid 那一行的 `userTexts` 同时含 `<bot_introduction_request>` 和 `Your name is Research Helper.`
     - 主聊天 user 行计数 0，body 不含 `bot_introduction_request`
     - 介绍正文出现后再等 3s，侧栏名字仍是 `Research Helper`（防 dsh 拿首条消息自动起标题、把名字盖掉）
     - `page.reload()` 后侧栏名字仍在
   - ③ **折叠**：点开 More options → 能看到 preset radio、连接器区、Model 下拉；选一个非默认 preset 再建 → 新 sid 的 preset = 所选（证明折叠里的选择真的提交了）。读法由施工选最短的一条：M1 `session/list` / 设置面板 / `__pbotsDev.state`，回执写明用的哪条；如果 fake 的 preset 列表只有一项，就改成：给 `pbotsUi.createBot` 包一层记录实参，断言 `connectors`/`model` 来自折叠区里的选择
   - ④ **预填自动展开**：`page.evaluate(() => window.pbotsUi.chooser({ connectors: ['<已装的 bundle 或任意名>'] }))` 打开 → `details[open]`；在没有预填的打开方式下（① 已证）是收起的
   - ⑤ **报错行**：`__pbotsDev.failNext('session/create')` → 填名字 → Create。断言：对话框内出现 `[role="alert"]`，含 `Couldn't create the bot`；对话框不关；名字框里的值还在
   - ⑥ **改名失败**：`__pbotsDev.failNext('session/rename')` → 填名字 `Zed` → Create。断言：bot 照常建好；会话里出现 `Bot created, but the name wasn't saved`；`requests.jsonl` 新 sid 那一行**不含** `Your name is`
3. 变异（各改一处，跑对应的格，贴输出；用 cp 还原，不用 stash/reset/checkout）：
   - M1：disabled 条件去掉 trim → ① 红
   - M2：createBot 不调 rename → ② 侧栏名字红
   - M3：kickstart 不传 name → ② requests 红
   - M4：构造函数把 setup 拼到闭合标签后面 → unit c 红
   - M5：details 的 open 恒为 false → ④ 红
   - M6：改名失败不写 notice → ⑥ 红
   - M7：把 rename 挪到 kickstart 之后 → 记录 ② 红不红，**不要求一定红**。fake 不会自动起标题，所以这一刀很可能咬不住；红不红都写进回执，经理据此判断时序风险有没有被测试盖住
4. `pnpm -C app/ui/renderer-grok check` → upstream diff=0；`git diff 21f6127c..HEAD --stat` 只含边界 1 列出的文件。
5. 回归（施工前先跑一次记基数，分批跑，不和别的 e2e 同时跑）：
   - `vitest run tests/unit/grok-shim` → 全绿
   - `test:e2e tests/e2e/create-dialog-character.spec.ts tests/e2e/kickstart.spec.ts tests/e2e/bots.spec.ts tests/e2e/market.spec.ts tests/e2e/settings.spec.ts` → 与基数同数
   - 第二批：`resilience workspaces journeys/d10b-d7 onboarding` → 与基数同数
   - 例外处理见边界 1
6. 覆盖：改动行 ≥80%。coverage 工具链缺件时照 T23/T25 的办法，手工逐行列出每个改动行由哪一格覆盖。
7. **截图对照**（必须用已提交 HEAD 的构建，回执写 `git rev-parse HEAD`；`PBOTS_SHOT=1` 跑 shot spec；viewport 设成 1440×900、`deviceScaleFactor: 2`，和参照台一致）：
   - 照 ref 六图的状态各拍一张，存 `work/grok-0.79.3-re/ours/create-dialog.{light,dark}{-empty,-named,-shape3}.png`：
     - empty = 刚打开、没填名字（为了能对照，先点成 flower + gray）
     - named = house + orange + 名字「Research Helper」
     - shape3 = 选 square
   - 再拼 `create-dialog.cmp.{light,dark}.png`：左 ours、右 ref，裁到对话框区域
   - 对照项逐条写进回执（对上 / 差多少）：标题和关闭钮、头部与底栏分隔线、预览大小、名字框宽度和居中、5/5/3、6+5、两种选中态、Create 置灰的样子、暗色 Black 色板是白的
   - 「More options」是 ref 里没有的东西，回执里注明「这是有意的增量（Q-032 A）」
8. 收尾：`pgrep -af 'bot-T30' | grep -v pgrep` → 空；隔离 TMPDIR 无遗留。

## 为什么这样验收
要保住三件事：默认看到的对话框和 0.79.3 一样；起的名字真的落到 bot 身上（侧栏、重启以后、bot 自己嘴里一致）；我们自己的三项配置折起来以后还能用。
- ② 用 Enter、不点按钮：钉住「Enter 提交」，而且走的是原生隐式提交那条路。requests.jsonl 那一格防的是名字只改了侧栏，模型却不知道。「等 3s 名字仍在」和 reload 防的是 rename 被后来的同步或自动标题悄悄盖掉。
- ⑥ 和 M7：rename 不是原子的（0.79.3 是），这是我们和原版唯一的结构性差异，所以失败路径和时序都要有证据。M7 如实记录测试能不能咬住，不硬凑。
- ③ 防的是折叠以后，里面的选择没有进提交。
- unit c 防的是 onboarding 那条提示露出来。它和 T30 是同一个构造函数，不另开单。
- ① 的位置顺序和预览尺寸断言：T24 的教训是排列只在截图里、截图没人真看，所以把关键排版写成断言。

## 不做
- 「Help me create a Bot」卡与 Ahn 版整套（见「对计划的更正」1；T31 搁置）
- 形状钮的 3D 引擎（T24 的有意偏差，照旧）
- 名字长度、非法字符的额外校验：maxLength 255 + trim，与原版一致
- 0.79.3 选形状自动配色 `tf()`：这 13 个形状都返回 null（T24 探针 b），不做

## 回执（`work/tickets/receipts/T30.md`）
需要包括：先红输出；每条验收的原样输出；M1–M7（M7 如实写红或不红）；截图路径和 HEAD；对照逐条；回归基数前后对比和例外清单；P1——② 跑完后贴新 sid 在 requests.jsonl 的全部行（含 `purpose` 字段），看有没有起标题之类的额外调用；`surfaceTheme` 的 grep 结果；Enter 走原生隐式提交是否成立。
