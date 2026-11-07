# T28：onboarding 0.79.3 后半——role / attribution / connect 三页进 walk，hand-off 自动建主 bot（tools/create 退出 walk）

> 开单：manager (Opus 5.5) | 日期：2026-11-07 | 施工：main (GLM 5.3)
> 来源：queue U8/T28（含原 T26c）；T26 回执 :10/:26；RE-UI-0.79.3.md :94/:99/:104；0.79.3 产物探针（本单「探针结论」）
> 分支 / 作业目录：feat/T28 @ /tmp/bot-wt/T28（从 docs/rebuild-p6-p5-plan @ c4e73b9d 起）
> claimed：2026-11-07 main (GLM 5.3) @ feat/T28（施工开始时填：日期、起点 SHA）
> accepted：（经理验收通过时填）
> 验收 1：2026-11-07 @7c22aadb **返修** → T28c（见 receipts/review-T28.md 末「经理核实」）

## 目标
首次启动的引导走 0.79.3 的步骤序列：`landing → meet → computer-demo → jobs → role → attribution → connect → hand-off`，三页的文案和交互 1:1，走完后 hand-off 自动建主 bot（带角色上下文）并按 T26 的延后规则做介绍。

## 探针结论（经理已跑，施工不必重跑；数据：`work/grok-0.79.3-re/onboarding-0793-extract.json`）
**派单前提要改：三页不是插在 jobs 和 tools 之间。0.79.3 已经把 tools 和 create 两步移出了步骤序列。**
- index.eager-app ≈@380k：`dh=[landing,meet,computer-demo,jobs,role,attribution,connect,tools,create]`，`Qge=new Set(['tools','create'])`，`_h(e)=$ge(e).filter(e=>!Qge.has(e))`。所以只要 entry 不是 `setup`，实际走的序列里就没有 tools/create（`bh` 也会把停在 tools/create 的旧状态重定向到 connect/attribution/role/hand-off）。只有 `entry==='setup'`（换账号重走）才走 `[landing, create]`
- 三页各受一个服务端实验开关控制：role=`onboardingJobRoleEnabled`，attribution=`onboardingAttributionSurveyEnabled`，connect=`onboardingConnectorStepEnabled`。我们没有实验服务，**三页都按开处理**（写死，不做开关）
- onboarding chunk @62000 渲染：`case 'tools': case 'create': return null`，两步已经没有 UI
- **hand-off 才建 bot**（app @4.54M `odr`/`bdr`）：`onboardingBot.provision(slot, {creatorContext, isConnectScreenShown})` 调 `createAgentFromTemplate({name/shape/color 用默认值, isAutomatic:true, creatorContext})`，然后依次 `markOnboardingSeen()`、kickstart 主 bot、再建 roleUseCaseBots。用户在引导里不起名、也不挑形象
- creatorContext = `The user primarily works in {Role englishLabel} — tailor suggestions and work to that area.`（没选 role 时为空串；0.79.3 的 tools 恒为 []，所以第二句永远不出现）
- **三页形态**（文案全部取自 i18n-en.json，extract 里逐条有）：
  - **role**：标题「What will you be working on most?」；9 个单选卡（`role=radiogroup` 里放 `button role=radio aria-checked data-choice=<id>`，每张卡是图标+标签，stacked 布局）：Engineering / Design / Marketing / Customer Support / Product / Ops & Finance / Recruiting & People / Sales / Productivity。底栏（0.79.3 `_n` 逻辑）：没选时主钮「Skip」（tertiary）；选了以后，role 是最后一步才显示「Continue」，否则显示默认「Next」（connect 开着时 role 不是最后一步，所以选中后是「Next」）。另有「Back」
  - **attribution**：标题「How did you first hear about Grok Bot?」；12 个单选卡（inline 布局），**每次运行洗牌一次**（Fisher-Yates，`c_e`）：X (Twitter) / Instagram or Facebook / YouTube / TikTok / Reddit / LinkedIn / Search engine / App stores / TV or outdoor ad / Influencer or creator / Friend or colleague / AI assistant。`finishesWalk` 恒为 true，所以没选显示「Skip」（tertiary），选了显示「Continue」；另有「Back」。选择只用于上报遥测（hand-off 时报一次 `{source, sourcePosition}`）
  - **connect**：标题「Connect your apps」；连接器卡列表，按账号邮箱域名决定：微软系域名给 Outlook + Outlook Calendar，其余一律 Gmail + Google Calendar。卡片用 `chunk-connector-card` 的 `variant:'connect'`，按钮文案「Connect」。底栏：列表里有任一已连接显示「Continue」，否则「Skip for now」（tertiary）；另有「Back」。前进直接进 hand-off
- **42 模板**：`je` @1392，42 条，每条有 id、名、一句话职责、所属 role，全文见 extract。**0.79.3 没有浏览模板的 UI**（chunk 只导出 `OnboardingFlow`，`je` 只被 `Me(role,2)` 用到）。它唯一的用途是选了 role 后，在 hand-off 时自动建该 role 的前 2 个模板 bot（受实验开关 `onboardingRoleUseCaseBotsEnabled` 控制），所以 42 条里实际能用到的只有 18 条。另外 RE :94 的分组计数有误：实测 design 4、productivity 5（RE 写的是 5/4），合计仍是 42
- **我们现状**：0.18 的 `SignedInOnboarding`（view.tsx:184）是一整块的组件，步骤状态和 `SignedInOnboardingStep` 都在模块内部互相引用，`advanceSignedInOnboarding` 从 model.ts 引入。只覆盖 model.ts 不够，新加的 step 在渲染时会落进 hand-off 分支（view.tsx:181）。**加页只能把 view 复制过来改**（搬运阶梯第 3 级，T24 character.tsx 有先例），覆盖入口沿用 T26 已挂的 `onboarding-view.tsx`
- 0.18 自己的 create 步模板建议（`suggestions.ts` / `pickedTemplateId`）随 create 步一起退出 walk，不用处理

## 范围
1. **覆盖 view**：把 `frontend/.../signed-in/view.tsx` 的 `SignedInOnboarding` 和 `SignedInOnboardingStep` 复制进覆盖层（文件头写 `来源: grok-bot-0.18-reconstructed@a9f633e:frontend/src/recovered/features/onboarding/signed-in/view.tsx` 和 0.79.3 锚点），T26 的 landing 包裹保留。三页单独放一个新文件 `overrides/modules/onboarding-steps-0793.tsx`，两个文件都控制在 400 行以内
2. **步骤序列**放进一个纯函数小模块 `overrides/modules/onboarding-walk.ts`：`WALK = ['meet','computer-demo','jobs','role','attribution','connect']`，接 `next/prev`，最后一步的下一步是 `'hand-off'`；外加 `creatorContext(roleId|null)`，以及三页的常量表（标题、选项 id 和标签、底栏文案）。上游 `scenePlacements` 不认识这三个新 step，调用时把它们映射成 `'tools'`（0.79.3 编舞 @7708 里 `attribution/role/connect/tools` 本来就是同一个 case），编舞文件不用改
3. **三页**按探针结论的文案和底栏逻辑实现；选择状态存在 SignedInOnboarding 的 state 里，Back/Next 往返时保留。attribution 的顺序在每次运行开始时洗一次（`useState` 初始化）。图标用上游已有的 `cursor-icons` 字形（view.tsx:79 先例）；品牌图标（x/instagram/youtube/tiktok/reddit/linkedin/app-store）先探本地产物有没有 svg 资产，有就用，没有就只显示文字标签，回执记一笔，不阻塞
4. **connect 页**：shim 里没有账号邮箱，固定给 Gmail + Google Calendar。卡片显示名字和「Connect」按钮，点击打开我们现有的连接器入口（施工先探：侧栏或设置里连接器 / market 面板的打开方式；**没有现成入口就把按钮置灰并加 title**，回执存疑）。「已连接」暂时恒为 false，底栏恒显示「Skip for now」；连接器能真正接 Gmail 之后再改，这里加一条 `ponytail:` 注释说明
5. **hand-off 建主 bot**：connect 前进时转入 hand-off，复用 T26 的 create 链（view.tsx:203 那段的 readiness、isAccountOnboarded、setSeen、dwell、onComplete），只把请求体换成 `{origin:'user', isKickstartRequested:true, name:<默认名>, description:creatorContext, avatarShape:<默认>, avatarColor:<默认>}`，走现成的 shim `createAgent` 直建分支（data.ts:530，**shim 不改**）。默认名和形象先探 0.79.3 provision 里 `name:Hn, avatarShape:_n, avatarColor:rr` 引用的常量（在 index.eager-common 或 platform chunk 里按 `createAgentFromTemplate({shareId:` 附近的 import 反查）；查不到就用空名（等于我们 main 的默认标题）加 blob/black（hero 和 hand-off 的 recolor 都是 black），回执写明出处
6. attribution 遥测：我们的 bridge.telemetry 是空实现（desktop.ts:209），**不上报、不持久化**，只保留选择状态
7. 不做（T28b）：roleUseCaseBots（选 role 后自动建 2 个模板 bot）和 42 模板数据入仓

## 边界
1. 只动：`renderer-grok/overrides/modules/onboarding-view.tsx`（改）、新建 `onboarding-steps-0793.tsx` 和 `onboarding-walk.ts`（三页需要样式的话再加一个同名 `.css`）、`overrides/vite.config.ts`（只有新模块需要挂 MODULE_OVERRIDES 时才动，大概率不用）、测试文件。**不改** `frontend/src/recovered/**`（上游零改动）、`shim/src/**`（create 通道现成）、`new-bot-dialog.tsx`（T30）、`scene.ts` 和编舞（T32）
2. 先红：`tests/unit/grok-shim/onboarding-walk.test.ts` ①：`next('jobs')==='role'`、`next('connect')==='hand-off'`，WALK 里不含 tools/create。模块还不存在，import 就会红。再红：e2e ④ 改写后，jobs 的 Next 之后等不到 `#sand-onboarding-role-heading`
3. 测试走隔离 HOME/TMPDIR，DBus 指向不存在路径；**load>10 时不跑 e2e**，`run_in_background` 跑一次等通知
4. ui e2e 同一时刻只跑一套；不跑全量 e2e

## 验收（命令在 `app/ui` 下执行）
1. `pnpm --config.verify-deps-before-run=false vitest run tests/unit/grok-shim/onboarding-walk.test.ts` → 全 passed，至少覆盖：
   - 三页的 next/prev（role 的 prev 是 jobs，connect 的 next 是 hand-off，meet 没有 prev）
   - `creatorContext('ops-finance')` 逐字等于 `The user primarily works in Ops & Finance — tailor suggestions and work to that area.`，`creatorContext(null)===''`
   - **文案逐字对照**：读 `../../work/grok-0.79.3-re/onboarding-0793-extract.json`，逐条断言三页标题、9 个 role 标签、12 个 attribution 标签、底栏文案（Next/Back/Continue/Skip/Skip for now）与常量表**全等**，id 顺序也要一致（attribution 比的是洗牌前的原始顺序）
   - 洗牌：同一个 PRNG 种子输出稳定，输出是原数组的一个排列
2. `HOME=/tmp/bot-T28h TMPDIR=/tmp/bot-T28t DBUS_SESSION_BUS_ADDRESS=unix:path=/nonexistent pnpm --config.verify-deps-before-run=false test:e2e tests/e2e/onboarding.spec.ts` → 全 passed，其中：
   - **④ 改写为全流程**：landing → Get started → meet → computer-demo → jobs → role。先断言主钮是「Skip」，选 Engineering 后主钮变「Next」→ attribution（选「Friend or colleague」，**按文字定位，不按位置**，然后 Continue）→ connect（断言出现 Gmail 和 Google Calendar 两张卡，主钮是「Skip for now」）→ hand-off。之后断言：恰 1 个 bot；全程不出现「What do you use every day?」和 `#sand-onboarding-create-name`；250ms 窗内没有介绍（T26b 口径）；最终 `requests.jsonl` 含 `bot_introduction_request` **和** `The user primarily works in Engineering`
   - **⑤ Back 往返**：connect → Back → attribution（之前的选中仍是 `aria-checked=true`）→ Back → role（Engineering 仍选中）
   - **⑥ 全 Skip**：role 和 attribution 都不选、直接 Skip → connect → Skip for now → 建 bot 成功；`requests.jsonl` 不含 `The user primarily works in`
   - ①-③ 保持原断言不变
3. 回归：`vitest run tests/unit/grok-shim` 数量 ≥211 且全 passed；`test:e2e tests/e2e/kickstart.spec.ts tests/e2e/bots.spec.ts` passed 数与基线相同
4. `pnpm -C app/ui/renderer-grok check` → upstream diff=0
5. **变异四刀**（回执贴红的原样输出，还原后复绿）：V1 WALK 去掉 role → ④ 红；V2 create 请求不带 creatorContext → ④ 红在 `primarily works in`；V3 attribution 常量改一个字 → 单测文案对照红；V4 WALK 尾部补回 tools → ④ 红在「不出现 What do you use every day?」
6. 截图：role / attribution / connect 三页亮暗各一张，存 `work/grok-0.79.3-re/ours/onboarding-{role,attribution,connect}.{light,dark}.png`，施工本人用 Read 打开确认三页确实在画面里。0.79.3 参照图：T20 桩若能翻到这三步就出 ref/，翻不到在回执标「未验证」，不阻塞
7. 覆盖：工具链没有 `@vitest/coverage-*`（T23/T25 已核实），回执里手工逐行列出 onboarding-walk.ts 和三页逻辑分支分别由哪一格覆盖，要求 ≥80%
8. `git diff c4e73b9d..HEAD --stat` 只含边界 1 列出的文件

## 为什么这样验收
- 真正要保住的是首次启动的用户看到的步骤和 0.79.3 一样，而且最后真建出一个知道用户角色的主 bot。所以 ④ 要断言 creatorContext 真的进了模型请求（只看页面渲染出来了不够），也要断言 tools/create 不再出现（防止「三页加上了，旧两步还在」）
- 文案对照必须读 extract 文件逐条比。手抄文案的测试只会验证「代码等于我抄的」，抄错了测试照样过
- attribution 每次洗牌，所以 e2e 一律按文字定位；单测用固定种子证明「是排列」，不断言具体顺序
- ⑥ 保护「什么都不选也能走完」：0.79.3 三页都允许 Skip，引导不能被问卷卡住

## 存疑预记
- 复制 view 后，T32 的编舞工作改在覆盖层的 view 上做（上游 scene.ts 照旧不动）。T32 立项时要注意这一点
- `isAccountOnboarded` 和 computer readiness 的降级沿用 T26 的现状，不在本单处理
- 要不要把 tools/create 移出 walk，写进了 QUESTIONS Q-033（默认 A，按 0.79.3 移出）。用户若选 B，只需在 WALK 尾部补回 tools/create、hand-off 改回读 draft，测试 ④ 相应调整，本单其余部分照常有效

## 产出
- `app/ui/renderer-grok/overrides/modules/onboarding-view.tsx`（改：复制改造上游 view + landing 包裹）
- `app/ui/renderer-grok/overrides/modules/onboarding-steps-0793.tsx`、`onboarding-walk.ts`（新）
- `app/ui/tests/unit/grok-shim/onboarding-walk.test.ts`（新）、`app/ui/tests/e2e/onboarding.spec.ts`（改 ④，加 ⑤⑥）
- 截图 6 张；回执 `work/tickets/receipts/T28.receipt.md`
