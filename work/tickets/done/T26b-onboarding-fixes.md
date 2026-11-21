# T26b：onboarding A 段返修——landing 不在视口 / 常规 e2e 引导残留 / create 步双 main / 介绍时机

> 开单：manager (Opus 5.5) | 日期：2026-11-07 | 施工：main (GLM 5.3)
> 来源：T26 终验（经理任务 B，验收时 feat/T26 HEAD 8ba0b66c）——验收命令全绿，但实物与探针打穿四处
> 分支 / 作业目录：继续 feat/T26 @ /tmp/bot-wt/T26（同分支续修，T26 验收时一起看）
> claimed：2026-11-07 main (GLM 5.3) @ feat/T26 续修
> accepted：2026-11-07 feat/T26 @ 145c784d（经理任务 B，与 T26b 合并验收）

## 目标
让真首启的用户**真的看得见** landing 并能走完六步，走完后 roster 只有他建的那一个 bot，介绍时机对齐 0.79.3。

## 经理已核实的事实（证据，不用再探）
1. **landing 在视口外**：HEAD 下 `launchProduct({ready:false,onboardingFirst:true})`，`#sand-onboarding-landing-heading` boundingBox `y=820`、视口高 820，`elementFromPoint` 为 null；截图只有空侧栏「No saved agents yet.」+ 空白主区（经理探针图 `/tmp/bot-T26t/probe/first-start.png`）。根因：`overrides/modules/onboarding-view.tsx` 的 `Landing` 只渲染裸 `<section class="sand-onboarding__landing">`，没有上游的 `.sand-onboarding` 根（`view.css:8` / `production.css:176`，`position:fixed; inset:0` 的覆盖层），于是落进文档流底部。e2e 用 `toBeVisible` 只查盒子非空，不查视口——所以绿。回执里的 `ours/onboarding-landing.light.png`（11:13，review 修复前）同样**不含 landing**，只有主界面+Starting…，不能当证据。
2. **常规 e2e 引导残留（竞态）**：`tests/support/ui.ts` 的 `launchProduct` 在页面起来后才 evaluate 置 seen+reloadRoster；ProductionRenderer 的 gate（`ProductionRenderer.tsx:2750` 起 `getSeen`→`resolveOnboarding`）可能已按 seen=null+countAgents=0 判 onboarding。经理探针 `launchProduct()` 默认参数 ×3：**1/3 次 onboarding 节点仍挂着**（agents=1）。现在套件绿只因 landing 在视口外不挡点击；修好 #1 后该竞态会让 bots/kickstart 等套件随机红。
3. **create 步走完会多出一个空 main bot**：`data.ts` onboarding 直建分支（`a.origin==='user' && a.isKickstartRequested===true`）不 patch meta `mainBotId`；`finish()`→`reloadRoster`→`doLoadRoster` 见 `listed` 不在 roster → `session/create` 再建一个空 main。结果用户有两个 bot（他的 + 一个空的 New chat）。0.79.3 里 onboarding 建的就是主 bot（queue U5 行原文「onboarding 主 bot」）。
4. **介绍时机偏离 0.79.3**：回执称工单「kickstart:false」是笔误——不成立。锚点：`done/T25-kickstart-intro.md:24`「onboarding 是例外：等 `markOnboardingSeen()` 之后才发（T26 用）」+ queue U5「建时传 kickstart:false，hand-off 后调 kickstart」。即：create 步建 bot **不发**介绍，onboarding 结束（seen 落盘）后再发。现在是 create 步当场发。

## 边界
1. 只动：`overrides/modules/onboarding-view.tsx`、`shim/src/data.ts`（onboarding 直建分支 + 暴露一个「延后介绍」入口，可复用现有 kickstart 发送代码，不复制）、`tests/support/ui.ts`、`tests/e2e/onboarding.spec.ts`。上游 `frontend/src/recovered/**`、`frontend/src/production/**` 零改动。
2. 先写失败测试（看红再改）：
   - onboarding.spec ① 加 `await expect(landing).toBeInViewport()` → 现在红（#1）
   - 新格 ④ 真首启 Get started → 逐步 Next 到 create → 填名建 bot → 走到 hand-off 完成：断言 `.sand-agent-item` **恰好 1 个**且名字是填的那个 → 现在红（#3）；同格断言：hand-off 之前该 bot 的 session 没收到 `kickstart-` 前缀 prompt，hand-off 之后收到（观测用 `__pbotsShim.requests` 或现有 kickstart.spec 的观测法）→ 现在红（#4）
3. 修法提示（不强制，最短的那条）：
   - #1：Landing 外包 `<div className="sand-onboarding" role="main">`（与 production.css 的 SignInLanding 同形，样式现成）
   - #2：launchProduct 置 seen 后 `page.reload()` 再 `waitProductReady`（getSeen 读 localStorage，reload 后 gate 必判 shell）；并在 launchProduct 末尾断言 onboarding 节点计数 0，让竞态以后显式红而不是静默绿
   - #3：onboarding 直建分支在 `mainBotId == null` 时走现成 `setMain(sid)`（同文件 `async setMain`），不新写 patch
   - #4：直建分支不发介绍，记下 sid；`finish(agentId)` 里（seen 已落）调介绍。注意 skip 路径无 agentId 不发
4. `__pbotsDev.reloadRoster` 当生产入口：**经理判可接受**（`shim/src/index.ts:73` 无条件安装，生产可达），但须在 `data.ts` 的 `reloadRoster` 处加一行注释「onboarding-view 生产调用，非仅测试」，防日后当测试面删掉。不要求另开通道。
5. 测试走隔离 HOME/TMPDIR；e2e 前 `pnpm build`；load>15 只跑 unit。

## 验收（写命令，不写感觉）
（cd /tmp/bot-wt/T26/app/ui，HOME=/tmp/bot-T26h TMPDIR=/tmp/bot-T26t）
1. `pnpm --config.verify-deps-before-run=false build && pnpm --config.verify-deps-before-run=false test:e2e tests/e2e/onboarding.spec.ts --repeat-each 3` → 全 passed（①含 toBeInViewport、②skip、③老用户、④六步走完单 bot+介绍延后）
2. `pnpm --config.verify-deps-before-run=false test:e2e tests/e2e/bots.spec.ts tests/e2e/kickstart.spec.ts tests/e2e/onboarding.spec.ts --repeat-each 2` → 全 passed（竞态修掉的证据：重复跑不随机红）
3. `pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/grok-shim tests/unit/fold` → ≥211 passed
4. `cd renderer-grok && pnpm --config.verify-deps-before-run=false check` → upstream diff=0
5. 变异（回执贴红输出）：V-a 去掉 Landing 外层 `.sand-onboarding` → ① 红；V-b 直建分支去掉 setMain → ④ 计数红；V-c 介绍挪回 create 步 → ④ 时机红；V-d launchProduct 去掉 reload → 末尾断言在 ×3 内至少一次红（拿不到就写明跑了几次）
6. 截图（重拍，覆盖旧图）：`ours/onboarding-landing.light.png`、`onboarding-landing.dark.png`、`onboarding-create.light.png`——**亲眼确认** landing 标题/Get started/Skip 在画面里

## 为什么这样验收
旧验收全绿却漏掉「用户根本看不到 landing」——因为 `toBeVisible` 不查视口、截图没人看。这次用 `toBeInViewport` + 亲眼看图堵住；④ 是 onboarding 存在的意义（用户第一次建出自己的 bot），之前没有任何一格走过它，双 main 和介绍时机都藏在这条没走过的路上；`--repeat-each` 是为了把 1/3 概率的竞态逼出来。

## 产出
- 上述四个文件改动；回执追加到 `receipts/T26.md` 末尾（「T26b 返修」节）

## 不在本单
- 引导期间侧栏是否该被覆盖（现在 meet 步主区居中、侧栏可见）——0.79.3 参照未出，归 T32 对照
- attribution/role/connect 三页 → T28（回执称 T26c，与 queue 已有 T28 同一件，并入 T28）
