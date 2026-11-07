# T24：建 bot 对话框加形象选择——13 形状 + 11 色 + 实时预览，选中的形象落进 bot 记录

> 开单：manager (Opus 5.5) | 日期：2026-11-07 | 施工：main (GLM 5.3)
> 来源：queue.md U4（T24 计划行，按 T20b 实测更正）；RE-UI-0.79.3 题 2(a)(c)、差距表 #1；T20b 事实表（`receipts/T20.md`「T20b · 事实表」S4）
> 分支 / 作业目录：feat/T24 @ /tmp/bot-wt/T24，起点 = **T23 合并后**的集成分支 HEAD（状态行头像要读 T23 在 `chat-header.tsx` 写进 `markers.activeAgent` 的 avatarShape/avatarColor）
> 排期：T23 合并后开工；与 T29 不同文件，可并行
> claimed：
> accepted：
> 失败计数：0

## 目标
新建 bot 时能选形状（13 个）和颜色（11 个），预览实时变；建好后侧栏、会话头、状态行的吉祥物都用选中的形状和颜色，重启后不变。

## 已定的事实（json 为准，旧计划作废的地方标了）
| 项 | 定稿 | 依据 |
|---|---|---|
| picker 形状 | **13 个，DOM 序** `blob, cloud, square, sparkle, clover, heart, flower, teardrop, tablet, wedge, house, star, hex`；每行 5 个（5/5/3 居中） | 0.79.3 COMMON `pn=[…]`（`index.eager-common-B73tST-1.js` 字节 ≈184919）+ `mn=5` 分行；与 `ref/create-dialog.light.png` 三行逐个对上。24 是全集 `cn`，旧计划「8 个则零素材」作废 |
| 颜色 | **11 个，含 Black**，DOM 序 Black/Brown/Red/Orange/Yellow/Green/Cyan/Blue/Violet/Magenta/Gray；按钮 `aria-label="<Label> character color"` + `aria-pressed` | T20b json `swatches`；APP picker `la.map(...)`（`index.eager-app-BXVg2FvL.js` ≈1213393）。RE 文的「picker 去掉 black」与旧计划「颜色 10」作废——`on` 只用于未选时的哈希回落 |
| 形状按钮 | `aria-label="<shape> character shape"` + `aria-pressed`；图标用**当前颜色**画 | APP 同处 `UyDncJ` 文案、`hT{color: tf(e) ?? r}` |
| 选形是否改色 | **不改**（旧计划「选形自动配色」作废） | T20b 双主题实测；源码 `tf(shape)` 只给季节形状（pumpkin，门控关）配色，13 个里没有 |
| 初值 | 每次打开对话框，形状、颜色**各自随机**（颜色从 11 个里抽，含 Black） | T20b `initials` ×3 双主题 |
| 暗色下 Black | 色板和吉祥物都显示为白（`ref/create-dialog.dark-empty.png`） | 现有 `character.tsx` COLORS `black.dark = #FFFFFF` 已是这样 |
| 预览 | 名字框上方一个大吉祥物，随形状/颜色即时重绘（RE 记 `Ehn=58`；尺寸以参照图为准） | RE 题 2(a) |

**颜色体系对齐结论：纯接线，不加颜色。** 我们已有两张表且都已是 11 个 id：`agent-info/avatar-editor/model.ts` 的 `AVATAR_COLORS`（id/label/value 与 0.79.3 `rn` 逐字相同）和 `onboarding/signed-in/character.tsx` 的 `COLORS`（11 个 id 的亮/暗吉祥物墨色）。`AgentAvatar`→`resolvePersonaColor` 认这 11 个 id；`data-avatar-color` 就是 id。

**形状缺口：7 个。** 现有 `character.tsx` 只有 8 个形状（`blob pebble squircle tablet wedge hex cloud teardrop`），picker 13 个里有 6 个是现成的，缺 `square sparkle clover heart flower house star`。`resolvePersonaShape` 只认这 8 个，不认识的一律按 agentId 哈希回落——**不补形状，选了也白选**。

**真正的断点：键名错了。** 上游投影 `production/model.ts:147-148 projectRendererAgent` 读的是 `value.avatarShape / value.avatarColor`；我们的 `shim/src/agents.ts:42-43 toAgentRecord` 写的是 `color: null, shape: null`——键名对不上，就算填了值也到不了侧栏。

## 方案（每块写了选这一级的原因）
1. **7 个形状的几何：复制改造（第 3 级）。** 0.79.3 的 2D 轮廓构造器在 COMMON 的 `Hs` 表（字节 ≈290762）：`square: ws(107,28)`、`house: Ts(100,110,78,29)`、`clover: ks(38,58)`（`ks` 是 `ms` 的四圆版，`ms` 对应我们已有的 `cloudPath`）、`heart: Es`、`sparkle: Os`、`star: Ds`（后三个是现成的 path 字面量，Os ≈281309、Ds ≈280531）；`flower` 不在 `Hs` 里，名字映射到 `starFlower`，轮廓由 `function Lc()`（≈299284：中心圆 + 6 个圆的并集，在 240 个角度上二分求边界）生成。做法与 0.18 移植这 8 个形状时一样：把构造器和它们用到的辅助函数抄过来，用现有 `normalizeArtifactPath` 归一到我们的 259 viewBox；flower 把 `Lc` 的单位坐标点换算到 `CENTER`/半径后，交给现有 `sampledPath` 或 `smoothPath`。
   - **为什么点完按钮 path 会变（T20b `shapesSameOrder=false`）**：0.79.3 的形状按钮画的是 `hT` 吉祥物引擎（canvas 带 3D 轮廓采样，`cc`/`yawPeriod`），不是一张静态 SVG，所以每一帧的 path 都可能不同。我们沿用 0.18 的 SVG 吉祥物（`OnboardingCharacter`），按钮里画静态、暂停的形状。**有意的偏差：不移植 3D 引擎**，回执里写一行说明。
   - **放在哪**：`character.tsx` 在上游 `frontend/**` 里，不能改（`pnpm check` 要求 diff=0）。而且只包一层 re-export 不够：`OnboardingCharacter` 内部直接调本文件的 `personaShapePath`，外面替换不到。所以整模块覆盖：把上游 `character.tsx` 原样复制成 `overrides/modules/character.tsx`，在 `overrides/vite.config.ts` 的 `MODULE_OVERRIDES` 里加一行，然后在副本上补形状。文件头写 `来源:`（0.18 文件 + 0.79.3 COMMON 的偏移）。
   - `resolvePersonaShape` 认的形状改成 8 ∪ 13（去重后 15 个）；**未选时的哈希回落仍然只在原来 8 个里选，颜色仍然在 10 个里选**，这样现有 bot 的样子一个都不变。
   - 副本导出 `PICKER_SHAPES`（上表 13 个，按顺序）。另外导出一个按主题取墨色的函数（例如 `personaInk(color, theme)`），给色板用，保证暗色下 Black 是白的。
2. **对话框：在现有 P5-57 对话框上加一段「形象」区。** 文件 `overrides/modules/new-bot-dialog.tsx`，放在 Preset 之前：预览 → 13 个形状（5/5/3）→ 11 个色板（参照图是 6/5 两行）。aria 照上面的表。初值写成纯函数 `initialCharacter(rand: () => number)`，导出给单测用。选形状只改形状，选颜色只改颜色。
   - 预览元素要带 `data-preview` 和 `data-avatar-shape` / `data-avatar-color`，e2e 靠它判断。可以直接用 `OnboardingCharacter` 外面包一层 span，也可以用 `AgentAvatar` 的 `PersonaMark` 那一套写法。
   - **本单不做**：名字输入、标题改成「Create New Bot」、Q-032 的「More options」折叠、「Help me create a Bot」卡——这些拆到 T30（下面「后续」）。所以截图只对照形象区，不对整个对话框。
3. **持久化：存 localStorage（第 4 级，用平台自带的）。** 新文件 `shim/src/avatars.ts`：key 是 `pbots.shim.avatars`，值是 `{[sessionId]: {shape, color}}`。读写都包 try/catch；读出来的值要校验：形状必须在 15 个里、颜色必须在 11 个里，不合格就丢掉（丢掉后按哈希回落，不会报错）。先例是 `shim/src/desktop.ts:104` 的置顶列表——同一类按 bot 存的界面偏好，丢了不致命。
   - 不放 M3 `bots.json`：要改 main 的严格 patch 校验（`m3-meta/index.ts:104-109`）、CONTRACT 和存储格式，换来的只是「清掉渲染进程存储后形象还在」。留一行 `ponytail:` 注释写明这个上限：将来要跨设备、或 avatar 编辑器要写回时，再迁到 `bots.json`。
   - `bots.ts`：`createBot` 的 req 加可选字段 `avatar?: {shape, color}`。`data.ts`：createBot 成功拿到 sid 后写入 store；`recordOf` 从 store 取值传给 `toAgentRecord`。`agents.ts`：`AgentInput` 加可选的 `avatarShape` / `avatarColor`，记录里输出 `avatarShape` / `avatarColor`（没有就输出 null），**删掉没人读的 `color` / `shape` 两个键**（删之前先 grep 确认没有读它们的地方，结果贴进回执）。
4. **侧栏、会话头、状态行：不用改。** 侧栏 `sidebar.tsx:270` 和会话头 `chat-header.tsx:26` 本来就把 `agent.avatarShape/avatarColor` 传给 `AgentAvatar`；状态行头像读 T23 写进 `markers.activeAgent` 的同名字段（`feat/T23` 的 `transcript.tsx:75`）。记录的键名修好后，这三处自动跟着变。本单**不碰** `chat-header.tsx`、`markers.ts`、`transcript.tsx`、`status-line.ts`。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md（e2e 先 build；`pnpm -C app/ui --config.verify-deps-before-run=false test:e2e <file>`；chromium 路径）
2. 上面「已定的事实」「方案」里列的每个锚点；`frontend/src/recovered/features/onboarding/signed-in/character.tsx` 全文（330 行）
3. `overrides/modules/new-bot-dialog.tsx`、`shim/src/data.ts:209-226, 547-575`、`shim/src/agents.ts`、`frontend/src/production/model.ts:130-150`
4. `tests/e2e/bots.spec.ts:64` 一带（现有 e2e 怎么开这个对话框、怎么按 Create）

## 第 0 步：探针（只读，结论写进回执，不写代码）
在 `/tmp/grokbot-0.79.3/extracted/dist/renderer/assets/`（只读，不复制进仓）里搜：
- a. `Hs={pebble:` 找到 `ws` `Ts` `ks` `Es` `Os` `Ds` 的定义，再顺着找出它们调用的辅助函数（如 `ms` `ps` `ds` `Ns` `Bs`），列出要抄哪些、和我们 `character.tsx` 里已有的哪个函数等价；`function Lc(` 记下 flower 怎么生成
- b. `limitedShapes` / `UyDncJ`：确认按钮用 `hT` 画（这就是 path 会变的原因），确认 `tf()` 对这 13 个形状都返回 null
- c. 0.79.3 未选形象时的哈希回落用的是 `fn`（8 个）还是别的：只记录结果；不一样也不改我们的回落，写进回执存疑项，由经理决定要不要另开提议

## 边界
1. 只动：新建 `overrides/modules/character.tsx`、`shim/src/avatars.ts`；改 `overrides/vite.config.ts`（只加一行 MODULE_OVERRIDES）、`overrides/modules/new-bot-dialog.tsx`、`overrides/p5-57.css`（形象区样式）、`shim/src/agents.ts`、`shim/src/bots.ts`（只改类型）、`shim/src/data.ts`（createBot + recordOf）。测试：新建 `tests/unit/grok-shim/avatars.test.ts`、`tests/unit/grok-shim/character-shapes.test.ts`、`tests/e2e/create-dialog-character.spec.ts`；`tests/unit/grok-shim/agents.test.ts` 只在断言 `color/shape` 旧键时跟着改，并在回执说明。**不改** `frontend/**`、`source/**`、main 进程、`avatar-editor/**`（它的 8 形状 `AVATAR_SHAPES` 不动）、T23 的文件。
2. 先红（先提交测试，各跑一次，贴输出）：
   - `character-shapes.test.ts` 红：从覆盖模块 import `PICKER_SHAPES` 失败（模块不存在）
   - `agents.test.ts` 新增一格红：`toAgentRecord({..., avatarShape:'heart', avatarColor:'black'})` 的结果里 `avatarShape === 'heart'`（现在是 undefined）
   - e2e ① 红：对话框里 `button[aria-label$=" character shape"]` 数量是 0，期望 13
3. 隔离 HOME / TMPDIR，DBus 指向不存在路径；同一时刻只跑一套 ui e2e（T29 若同时在做，错开）。
4. 只在 feat/T24 上提交；等经理验收通过后才合并。

## 验收（命令）
前置：在作业目录跑 `pnpm --config.verify-deps-before-run=false -C app/ui build`（run-e2e 不会自己重新构建）。
1. `pnpm -C app/ui --config.verify-deps-before-run=false exec vitest run tests/unit/grok-shim/character-shapes.test.ts tests/unit/grok-shim/avatars.test.ts tests/unit/grok-shim/agents.test.ts` → 全绿。至少要有这些格：
   - `PICKER_SHAPES` 和上表 13 个**逐项相等且顺序一致**
   - 13 个形状逐个调 `personaShapePath`：都是非空字符串，**两两不同**，而且除了 blob 以外都**不等于** blob 的 path（防止找不到形状时悄悄回落成 blob）；7 个新形状的 path 只用 `M/L/C/Q/A/Z` 命令、坐标都是有限数
   - `resolvePersonaShape('x', s)` 对 13 个形状都原样返回；对 `'nope'` 返回值落在原来 8 个里，且与覆盖前（上游函数）对同一批 agentId（固定 20 个）的结果**完全相同**；`resolvePersonaColor` 同样拿 20 个 id 对比上游，结果相同
   - `initialCharacter` 注入假随机数：rand 取 0 时得到 `blob` + `black`，取 0.999 时得到 `hex` + `gray`；形状和颜色**各调一次 rand**（两次取值不同时，结果分别对应各自的取值）
   - avatars store：写入后能读回；坏 JSON、未知形状、未知颜色 → 当作没有；`getItem` 抛异常 → 当作没有、不抛出
   - `toAgentRecord`：给了值就输出 `avatarShape/avatarColor`，没给就输出 null；输出里没有 `shape`、`color` 键；输出再经过上游 `projectRendererAgent`，结果带上同样的 `avatarShape/avatarColor`（真走一遍上游投影，不是只看我们自己的对象）
2. `pnpm -C app/ui --config.verify-deps-before-run=false test:e2e tests/e2e/create-dialog-character.spec.ts` → 全 passed：
   - ① 打开对话框（走侧栏 New 的真实点击）→ 形状按钮 13 个、色板 11 个；形状 aria-label 的顺序 = 上表；色板 aria-label 的顺序 = 上表；形状、色板各恰好 1 个 `aria-pressed="true"`
   - ② 记下预览的 `data-avatar-color` = C、`data-avatar-shape` = S → 点一个不是 S 的形状 T → 预览 shape 变成 T、color **仍是 C**，被按下的色板仍是 C → 再点一个不是 C 的颜色 D → 预览 color 变成 D、shape 仍是 T
   - ③ 选好 `heart` + `violet` → Create → 新 bot 的侧栏行头像 `[data-avatar-shape="heart"][data-avatar-color="violet"]`，会话头头像也一样 → `page.reload()` 后侧栏头像仍然是这样（证明真的存下来了）
   - ④ 暗色主题下：Black 色板的计算背景色是 `rgb(255, 255, 255)`
   - ⑤ 关掉再打开对话框 5 次，记下每次的初值（形状, 颜色）：**至少出现 2 种不同组合**（证明初值是随机的；概率上几乎不会误判）
3. 变异（每处改一下、跑对应的格、贴输出、再还原）：M1 选形状时顺手把颜色也改了 → e2e ② 红；M2 `toAgentRecord` 改回输出 `shape/color` 键 → unit 投影格红、e2e ③ 红；M3 `resolvePersonaShape` 的接受列表去掉 `heart` → unit 红、e2e ③ 红；M4 data.ts 不写 store → e2e ③ reload 那一步红
4. `pnpm -C app/ui/renderer-grok check` → 上游 diff=0
5. 回归：`pnpm -C app/ui --config.verify-deps-before-run=false exec vitest run tests/unit/grok-shim` → 全绿；`test:e2e tests/e2e/bots.spec.ts tests/e2e/market.spec.ts tests/e2e/grok-persona.spec.ts` → 通过数与施工前相同（施工前先跑一次，记下数字）
6. 改动行覆盖 ≥80%：`avatars.ts`、`agents.ts` 改动部分、`initialCharacter`（vitest `--coverage` 输出贴回执）
7. 截图（**必须用已提交 HEAD 的构建**，回执写 `git rev-parse HEAD`）：拍对话框的形象区，亮/暗各三态——刚打开、选了第 3 个形状 `square`、再换一个颜色——存到 `work/grok-0.79.3-re/ours/create-character.{light,dark}-{open,shape3,recolor}.png`；再做一张形象区和 `ref/create-dialog.{light,dark}{,-shape3}.png` 对应区域的左右拼图 `create-character.cmp.{light,dark}.png`。要对照的项：13 形状的排列（5/5/3）、轮廓像不像、色板顺序、选中圈的样式、暗色下 Black 是白的
8. 收尾：`pgrep -af 'bot-T24' | grep -v pgrep` → 空；隔离 TMPDIR 里没有遗留

## 为什么这样验收
真正要保住的是「选的形象最后真出现在 bot 身上，而且不会悄悄变成别的样子」。
- 「path 两两不同、不等于 blob」那一格：防止新形状没接上时回落成 blob，picker 看起来能点、其实是一排一样的圆。
- 「回落和上游完全相同」那一格：防止补形状时顺手改了哈希，让所有已有 bot 一夜之间换了样子。
- 投影格和 e2e ③：直接打到这次发现的真断点（键名对不上）。光看我们自己输出的记录对不对，抓不到这个问题。
- e2e ②：钉住「选形不改色」，这条推翻了旧计划。
- e2e ⑤：只证明初值确实是随机的，不对分布做断言。

## 回执（`work/tickets/receipts/T24.md`）
先红的输出、第 0 步探针结论（a/b/c）、每条验收的原样输出、四刀变异、截图路径和 HEAD、grep `\.shape\b|\.color\b` 读取方的结果、存疑项（尤其：flower 的轮廓和参照图差多少；哈希回落是否与 0.79.3 一致；预览尺寸取了多少）。

## 后续（写在 queue 里当计划，不开单）
- **T30** 对话框换成 0.79.3 版式：标题「Create New Bot」、名字输入（maxLength 255，占位「Name your Bot」，按 Enter 提交，没填名字时 Create 置灰——对照 ref 的 empty/named 两张图；`createBot` 成功后走 `session/rename`）；Q-032 默认 A，把 preset/连接器/模型收进默认折叠的「More options」，「用此配置新建」入口自动展开；「Help me create a Bot」卡只渲染、不接线；行内 `role=alert` 报错；整个对话框做截图对照。依赖 T24。
