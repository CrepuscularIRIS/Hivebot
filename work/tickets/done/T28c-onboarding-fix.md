# T28c：T28 返修——三页版式落位 + 复制骨架补全（SceneCast/标题/底栏序/hand-off 头）+ 单测缺格

> 开单：manager (Opus 5.5) | 日期：2026-11-07 | 施工：main (GLM 5.3)
> 来源：T28 经理任务 B 验收（HEAD 7c22aadb）不通过。编号说明：T28b 已被 queue U8b（roleUseCaseBots）占用，本修复单用 T28c
> 分支 / 作业目录：继续 feat/T28 @ /tmp/bot-wt/T28（从 7c22aadb 起）
> claimed：2026-11-07 main (GLM 5.3) @ feat/T28 续修（起点 7c22aadb）（施工开始时由主 agent 填：日期、起点 SHA）
> accepted：2026-11-07 feat/T28 @ 7f6cb06d（经理任务 B，T28+T28c 合并验收；见 receipts/review-T28.md「经理终验」）

## 目标
三页在画面里真的看得见、居中、和前三步同一套版式；前三步与 hand-off 恢复 T26 时就有的上游画面（角色 cast、可见标题、Next 在上 Back 在下、hand-off 图标+名）。

## 验收发现（经理亲查，证据）
- **F1 三页版式坏（截图实证）**：`ours/onboarding-{role,attribution,connect}.*.png` 里标题被截成「working on most?」「hear about Grok Bot?」「s」；attribution 只露出 8/12 张卡；**connect 页 Gmail/Google Calendar 卡完全不在画面里**（工单验收 6「三页确实在画面里」不成立；回执称「亲眼看」与图不符）。根因：`onboarding-view.tsx:167` 用自造 `sand-onboarding__step-wrap`（无 CSS）替掉上游 `FramedStep`（view.tsx:68-69 的 `.sand-onboarding__step` 网格格子 + `<main aria-labelledby>`）；三页的 section 类 `sand-onboarding__{role,attribution,connect}` 无任何样式（view.css:11-12/28 只给 meet/computer-demo/jobs/tools 定位），内容落到左上、被侧栏压住。e2e 的 `toBeVisible`/`toHaveCount` 不看遮挡，所以 6 passed 照样过
- **F2 复制骨架丢件（对比上游 view.tsx:171-181/223 与 T26 meet 截图）**：① `SceneCast` 整个没渲染（T26 时 meet 页中间的角色就没了；工单范围 2 的 `SCENE_AS` 至今无使用方）；② meet/computer-demo/jobs 标题被改成 `opacity:0` 视觉隐藏（上游可见，view.css:12 专门给它们定位，回执没给理由）；③ computer-demo/jobs 底栏写成 Back 在前、Next 在后（上游 `Footer`：前进钮在上、Back 在下面的 span 里——列式布局下顺序反了）；④ hand-off 丢了 APP 图标 +「Grok Bot」字样；⑤ 根节点丢 `data-step/data-step-index/data-platform/data-theme`
- **F3 单测缺格（工单 T28 验收 1 明文要求的）**：`creatorContext('ops-finance')` 逐字全等没测（只 `toContain('Engineering')`）；attribution 用 sort 后集合比，**原始 id 顺序**没比；底栏文案（Next/Back/Continue/Skip/Skip for now）没和 extract `nav` 比；洗牌「同种子稳定 + 是排列」没测（洗牌写在 view.tsx:87-91 内联 `Math.random`，不可测）；`prev('meet')===null` 没测
- F4（低）：role 卡图标（extract 给了 keyboard/brush/… 字形名）没做也没进回执存疑——工单 T28 范围 3 要求「有就用，没有回执记一笔」

## 改法（按搬运阶梯，能复用上游导出就别再抄）
1. 上游 `SignedInOnboardingStep`（view.tsx:166）和 `SceneCast`（:86）**都是导出的**。Walk 里 meet/computer-demo/jobs/hand-off 四步直接渲染 `<SignedInOnboardingStep step=… meetBeat/demoBeat/jobsBeat computer error onBack onForward onCreate={()=>void create()} …>`（draft 传 `INITIAL_ONBOARDING_DRAFT`，tools 用 `[]`，onDraftChange/onDailyToolsChange 传空函数）——标题、底栏顺序、hand-off 图标自动回来，本地那三行手写 JSX 删掉
2. 根节点按 view.tsx:223 原样：`data-platform/data-step/data-step-index/data-theme` + `<SceneCast step={step 映射：role/attribution/connect→SCENE_AS[step]} …/>`（draft 传 normalize 后的初始 draft，avatarTarget=null，isAvatarLanded=false）；每步包一层与 `FramedStep` 同形的 `<div className="sand-onboarding__step"><main aria-labelledby={`sand-onboarding-${step}-heading`}>…</main></div>`（FramedStep 未导出，本地 2 行复制；退场动画仍归 T32）。`data-step-index` 若 `onboardingStepIndex` 不认新 step，三页给 tools 的 index
3. 三页版式：新建 `overrides/modules/onboarding-steps-0793.css`（在 steps.tsx 里 import），三页 section 套用 view.css:11-12 的 meet/tools 定位与标题规则，选项区参照 :28 的 tools 网格（居中、`top:50%` 附近）；role stacked、attribution inline 换行，connect 卡列表居中。0.79.3 无参照图，**目标是「居中、完整可见、与前三步同一版心」**，不追像素
4. `onboarding-walk.ts`：加 `NAV`（next/back/continue/skip/skipForNow，逐字）供 steps 使用；加纯函数 `shuffle<T>(xs, rand: () => number): T[]`（Fisher-Yates，不改入参），view 用 `shuffle(ATTRIBUTION.choices, Math.random)`
5. role 图标：先查 `cursor-icons` 字体有没有 keyboard/brush/megaphone/headset/hammer/banknotes-stack/people-3/chart-line/brain 的码点表（本仓或 0.79.3 产物）；有就照 view.tsx:79 `SearchIcon` 先例接，没有就只留文字并在回执存疑写明查过哪里

## 边界
1. 只动：`overrides/modules/onboarding-view.tsx`、`onboarding-steps-0793.tsx`、`onboarding-walk.ts`、新建 `onboarding-steps-0793.css`、`tests/unit/grok-shim/onboarding-walk.test.ts`、`tests/e2e/onboarding.spec.ts`。上游 `frontend/src/recovered/**`、`shim/**` 零改动
2. 先红：单测新格（`shuffle` 未导出即红；`NAV` 未导出即红）；e2e ④ 新增的「可见且未被遮挡」断言在当前 7c22aadb 上应红在 connect 页（先跑一次贴红输出）
3. 隔离 HOME/TMPDIR、DBus 指向不存在路径；load>10 不跑 e2e；ui e2e 同时只一套
4. **改造中途先 commit 再变异，别 checkout 单文件**（T28 回执施工坑 2 再犯过）

## 验收（`app/ui` 下）
1. `pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/grok-shim/onboarding-walk.test.ts` → 全 passed，新增至少：`prev('meet')===null`；`creatorContext('ops-finance')` 逐字 `The user primarily works in Ops & Finance — tailor suggestions and work to that area.`；attribution `ATTRIBUTION.choices` 的 `[id,label]` **按顺序**等于 extract（不 sort）；`NAV` 五项逐字等于 extract `nav` 的 `next_default/back/continue/skip/skip_for_now`；`shuffle` 同一确定性 rand 两次输出相同、输出排序后等于输入、入参未被改
2. `pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/grok-shim tests/unit/fold` → ≥ 217+新增 且全 passed
3. `HOME=/tmp/bot-T28h TMPDIR=/tmp/bot-T28t DBUS_SESSION_BUS_ADDRESS=unix:path=/nonexistent pnpm --config.verify-deps-before-run=false test:e2e tests/e2e/onboarding.spec.ts` → 全 passed，④ 新增：
   - meet 页 `.sand-onboarding__cast` 存在且有子节点；`#sand-onboarding-meet-heading` 计算 opacity 为 1
   - computer-demo 底栏第一个按钮文字是 Next
   - role / attribution / connect 三页：标题、每张选项卡（attribution 12 张全部）、connect 的 Gmail 与 Google Calendar 卡，**中心点 `document.elementFromPoint` 命中自身或其后代，且 bounding box 完整落在视口内**（这一条专抓「被侧栏压住 / 截出画面」，`toBeVisible` 抓不到）
   - ①-③、⑤、⑥ 原断言不变
4. 回归：`test:e2e tests/e2e/kickstart.spec.ts tests/e2e/bots.spec.ts` passed 数与基线相同（T28 原验收 3 后半，T28 回执未贴，这次补）
5. `cd renderer-grok && pnpm --config.verify-deps-before-run=false check` → upstream diff=0
6. 截图在修复 HEAD 重拍：`ours/onboarding-{role,attribution,connect}.{light,dark}.png` 覆盖旧图，另加 `ours/onboarding-{meet,computer-demo,jobs}.light.png`（meet 覆盖 T26 旧图）。回执逐张写一句「看到了什么」（标题全文、卡数、cast 是否在）——经理会逐张打开核对
7. 变异两刀（回执贴红输出，还原复绿）：Va 删 `<SceneCast>` → ④ 红在 cast 断言；Vb 删 css import → ④ 红在 elementFromPoint/视口断言
8. `git diff 7c22aadb..HEAD --stat` 只含边界 1 的文件（及 work/ 下回执、截图）

## 为什么这样验收
- T28 的 6 个 e2e 全绿而页面实际看不见：Playwright 的可见性不管遮挡和出框。所以这次必须有「中心点命中 + 完整在视口」的断言，且截图要写清看到了什么
- 「复制上游」的目的是保住 T26 已有的画面。直接复用上游导出的 `SignedInOnboardingStep`/`SceneCast` 比手抄更不容易漏，代码也更少
- 文案和顺序要和 extract 逐条比，手抄常量不能只比集合

## 产出
- 上述 4 个源文件 + 2 个测试文件；截图 9 张；回执追加到 `work/tickets/receipts/T28.md` 的「T28c 返修」节
