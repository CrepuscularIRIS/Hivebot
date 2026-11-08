# T32：onboarding B 段——编舞对齐 0.79.3（退场动画 + 三页版心 + 引导盖住侧栏）+ 版式断言收口

> 开单：manager (Opus 5.5) | 日期：2026-11-07 | 施工：main (GLM 5.3)
> 来源：queue U5c/T32 计划行 + 提议⑩（T28c 终验）+ T26 合并时记的两条遗留（LOG.md:1150、review-T26.md:34「引导期间侧栏未盖 / create 版式散」）
> 分支 / 作业目录：feat/T32 @ /tmp/bot-wt/T32（从 docs/rebuild-p6-p5-plan 本立项提交起；T28b/T28bb 已并入）
> claimed：2026-11-07 main (GLM 5.3) @ feat/T32（施工开始时由主 agent 填：日期、起点 SHA）
> accepted：（经理验收通过时填：日期、HEAD）
> 验收 1：2026-11-07 @42be0b33 **返修** → T32b（见 receipts/review-T32.md）
> 验收 2：2026-11-07 @9eeed1e7 **返修** → T32c（第 2 次不过；T32c 再不过挪 blocked 重拆）

## 目标
首启引导的画面和 0.79.3 一致：换步时旧页淡出，三页（role / attribution / connect）的标题、选项块、底栏落在 0.79.3 的位置，3 个演示 bot 停在标题上方的空白处、不压卡片，引导整窗盖住侧栏。另外把提议⑩列出的 e2e 断言补上，做到删掉 css 时测试会红。

## 现状结论（经理只读探针，施工不必重跑）
1. **SCENE_AS 的效果已经生效，只是常量没人用。** `onboarding-view.tsx:179` 用内联三元把三页映射成 `'tools'`；`onboarding-walk.ts:18 SCENE_AS` 没有任何调用方。实证：`ours/onboarding-role.dark.png` 里红、青、蓝三个演示 bot 停在 TOOL_POSITIONS 上，并且在浮动（bob）。这和 0.79.3 一致：`chunk-onboarding-flow-D-TfK2Rr.js@7703` 中 `case attribution/role/connect/tools` 是同一个分支（teammate 状态 idle、过渡 standard、带 bob；hero 走 default 分支隐藏）。
2. **编舞撞版，根因在版心，不在编舞。** TOOL_POSITIONS（y 在 -328 到 -255 之间）是按 tools 版心设计的：标题 top 在 50%-264，内容 top 在 50%-147。T28c 的三页版心是自己拟的（标题顶在 y≈51，选项从 y≈97 起排成单列），结果 dark 图里红 bot 夹在标题和「Engineering」之间。
3. **没有退场动画。** Walk 只渲染当前步（`onboarding-view.tsx:171-183`），没有 exitingStep 状态，`Framed`（:188）也没有 exiting 形态。上游 `view.tsx:69` 的 FramedStep 退场形态是：`aria-hidden` + 内联 `animation: sand-onboarding-step-exit .1s ease-in both` + `pointerEvents: none`，`view.tsx:197` 在 `ONBOARDING_STEP_EXIT_MS`（200）后卸载。0.79.3 做法相同：`stepExit delayMs Zn=200`（@57670）；退场层的 key 是 `exit-${step}`，当前层 key 是 step（@64939）；退场类是 opacity 1→0、ease-in、`--cursor-duration-fast`、pointer-events none。
4. **beat 传参**：`:180-182` 给 SceneCast 的三个 beat 传的是同一个 `beat`，上游是分开传的（`view.tsx:223`）。目前看不出差异（每步只读自己的 beat），按上游改一行。beat 间隔 35/900/800 ms、退场 200 ms 都与 0.79.3 相同（@57670），不用改。
5. **侧栏没被盖住，根因是层叠顺序。** `production.css:33-35` 的 `.sand-agents-sidebar{position:relative;z-index:1}` 画在了 `.sand-onboarding`（fixed、z-index auto）上面。0.79.3 的引导是整窗接管：根节点自带 WindowControls 和 app-region drag（@64587）；attribution 网格宽 744px，在 1280 宽的窗口里左缘在 268px，如果侧栏还在就会压到 280px 宽的侧栏下面。所以应该盖住。
6. **create 版式散：作废。** create 步已经不在 walk 里（T28，Q-033 默认 A）。`ours/onboarding-create.light.png` 是 T26 的旧图，已不代表现状。
7. **④ 的 visCheck 有两处空转。** `onboarding.spec.ts:117-118` 是在 connect 页才调用的，这时 role 和 attribution 的元素已经卸载，`evaluateAll` 拿到 0 个元素，`bad=[]` 永远通过。所以「role 卡可见」「attribution 12 卡可见」其实从来没测过，这也是 T28c 的 Vb 变异能幸存的另一半原因。
8. **0.79.3 三页版心**（静态抽取，`/tmp/grokbot-0.79.3/extracted/dist/renderer/assets/` 里的 chunk-onboarding-flow + `index-FlssbLEI.css`，没有执行产物）：
   - 标题：`hgroup.sand-onboarding__heading` absolute、inset-inline:0、top:calc(50% - 264px)（`Rt=-264`）、flex 居中；h1 28px/34px、letter-spacing -.02em。与 `view.css:12` 的 tools 标题位置相同。
   - 选项块：`Ut pin=top y=-147`（`gn`/`bn`=-147），即 absolute、left:50%、top:50%、`transform: translate(0px,-147px) translate(-50%,0)`。
   - role（layout stacked）：grid 3 列 `repeat(3,minmax(0,1fr))`、gap 12px、宽 624px。卡片 flex column、align-items flex-start、box-sizing border-box、width 100%、min-height 96px、padding 16px、圆角 12px、1px solid 边框；label 16px/20px。**「stacked」指卡片里图标在上、文字在下，不是排成单列**，T28c 的单列是误读。
   - attribution（layout inline）：grid 3 列、grid-auto-rows 1fr、gap 12px、宽 744px；label 字号 `var(--cursor-font-size-lg)`。
   - connect：flex column、gap 12px（宽度类 `sand-1peuizl` 没解出来，保留现在的 400px）。
   - 底栏：外层 absolute、inset-inline 0、top calc(50%+200px)；三页内层再加 `translateY(40px)`（`sand-t9j73`）；按钮 288×36，前进在上、Back 在下。
9. **S5 参照图**：T20 回执 :26 记的是「引导面 RPC（step 机）未接」，当时止损跳过了；桩里只备好了 getOnboardingSeen 翻转。要出图得先补桩里的 step 机 RPC，估计 ≥1h，能不能成不确定。本单把它列为可选，时间盒 1h，出不来就在回执标「未对照」，不阻塞。第 8 条已经有静态数值，几何断言不依赖参照图。

## 范围
1. **编舞对齐**
   a. 去掉 :179 的内联三元，改用 `SCENE_AS` 映射（三页→`'tools'`，其它步原样）。SceneCast 的 `meetBeat/demoBeat/jobsBeat` 按 `view.tsx:223` 分开传。
   b. **恢复退场动画**：Walk 加 `exitingStep` 状态。换步统一走一个 `transition(next)`，它先 `setExitingStep(step)` 再 `setStep(next)`，并用 `ONBOARDING_STEP_EXIT_MS` 计时清空 exitingStep。这个常数从上游 model 引入，不要抄数字。goNext 进 hand-off 和 goBack 也走 transition。渲染改成：`{exiting && <Framed exiting key={`exit-${exiting}`} step={exiting}>{bodyOf(exiting)}</Framed>}<Framed key={step} step={step}>{bodyOf(step)}</Framed>`。Framed 的 exiting 形态逐字照 `view.tsx:69`。把 :175-178 的分支抽成 `bodyOf(s)`，三页和四步共用这一个函数。
   c. **三页版心改成第 8 条的 0.79.3 数值**：重写 `onboarding-steps-0793.css`；删掉 `ChoiceGrid`（steps.tsx:20）的内联 `style`（现在内联 grid/flex + gap 8 会压过 CSS，layout 只保留 `data-layout`）；三页的 section 和 h1 套用 `view.css:11-12` 同款规则（把三个选择器加进我们的 css，不改上游 view.css）；选项块按 pin top -147 定位；三页底栏下移 40px。
   d. **盖住侧栏**：在 `onboarding-steps-0793.css` 里给 `.sand-onboarding` 加 z-index，取能盖住侧栏的最小值（预计 2），不改 `production.css`。施工确认不会压住 UpdateRequired / AccessCover 等 z≥3000 的层，回执写一句。
2. **断言补齐**（提议⑩ + 第 7 条），见验收 2。
3. **T26 遗留两条**：侧栏由 1d 解决；create 版式作废（第 6 条），回执写一句，不改代码，旧图不删。

## 不做（已记 queue 提议⑪）
- 0.79.3 的 hand-off 编舞：invoice-chaser 回到 job 位、recolor 成 black、其余 exit，另有 handOffBeat 500ms（@7703、@57670）。这要 `recolor` 字段，上游 SceneCast 不支持，得整个复制 SceneCast，另行评估。
- 根背景：0.79.3 用 `--sand-bg-chrome`，我们用 `--cursor-bg-editor`。
- role 图标（T28c F4 已记存疑）。

## 边界
1. 只动 `app/ui/renderer-grok/overrides/modules/` 下的 `onboarding-view.tsx`、`onboarding-steps-0793.tsx`、`onboarding-steps-0793.css`（`onboarding-walk.ts` 只在 SCENE_AS 类型需要放宽时动），以及 `app/ui/tests/e2e/onboarding.spec.ts`，另加 `work/**` 下的回执和截图。**零改动**：上游 `frontend/src/recovered/**`（scene.ts / view.tsx / view.css / model.ts，只读）、`production.css`、`shim/**`（含 data.ts）、`entries.ts`。
2. **先红**：在起点 HEAD 上只改 spec，跑一次 ④，贴红的输出。预期至少红在以下几处：退场层记录为空、侧栏命中点落在侧栏、三页标题 top 几何、attribution 3 列或 744 宽。之后再改实现。
3. 隔离 `HOME`/`TMPDIR`，`DBUS_SESSION_BUS_ADDRESS=unix:path=/nonexistent`。load>10 不跑 e2e。ui e2e 同一时刻只跑一套，用 `run_in_background` 跑一次等通知。
4. 改造中途先 commit 再做变异，不要 checkout 单文件。
5. 退场层存在的 200ms 内，`.first()` 可能匹配到 aria-hidden 层里的旧按钮。出现 flaky 时，把定位器限定在 `.sand-onboarding__step:not([aria-hidden])` 里。这属于测试写法，允许。

## 验收（命令在 `app/ui` 下）
1. `pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/grok-shim tests/unit/fold` → passed 数不少于施工前基线（先跑一次贴数，LOG 记为 225），且全部通过。
2. `HOME=/tmp/bot-T32h TMPDIR=/tmp/bot-T32t DBUS_SESSION_BUS_ADDRESS=unix:path=/nonexistent pnpm --config.verify-deps-before-run=false test:e2e tests/e2e/onboarding.spec.ts` → 6 passed。④ 改写如下：
   - **用例标题**改为「④ 走完 walk：landing → meet → computer-demo → jobs → role → attribution → connect → hand-off 自动建主 bot + 2 模板 bot + 介绍延后」，同时删掉 :81 过时的「tools→create」注释。
   - **⑩a**：`#sand-onboarding-meet-heading` 的计算 opacity 等于 `'1'`。
   - **⑩b**：`.sand-onboarding__computer-demo .sand-onboarding__footer button` 第一个按钮文字是 `Next`，第二个是 `Back`。
   - **可见性（修空转）**：visCheck 加一个必传的 `expectCount` 参数，先断言 `count === expectCount`，再做中心点命中和视口检查；只在各页是当前页时调用，范围限定在非 aria-hidden 层。role 页检查 h1 和 9 张卡，attribution 页检查 h1 和 12 张卡，connect 页检查 h1 和 2 个 listitem。
   - **版心几何**（专门咬 Vb）：三页各自检查，以下误差都 ≤2px。h1 box top 等于 `innerHeight/2 - 264`；h1 水平中心等于 `innerWidth/2`；选项块（radiogroup 或 list）top 等于 `innerHeight/2 - 147`，水平中心等于 `innerWidth/2`；role 选项块宽 624、attribution 宽 744；role 和 attribution 的前 3 张卡 top 相同、第 4 张更低（3 列）；底栏首钮 top 等于 `innerHeight/2 + 240`。
   - **编舞**：三页各自等 900ms，让 spring 过渡结束（最长 bounce 约 747ms）。然后断言：三个 `.sand-onboarding__cast-{invoice-chaser,weekly-standup,sales-forecast}` 的计算 opacity 为 `'1'`、`data-character-state='idle'`；`.sand-onboarding__cast-hero` 的计算 opacity 为 `'0'`；三个 teammate 的 bounding box 与本页每张选项卡、每个底栏按钮都不相交。
   - **cast 不重挂**：在 meet 页给 `.sand-onboarding__cast` 节点挂一个 JS 标记（如 `el.__t32 = 1`），到 connect 页时 `.sand-onboarding__cast` 仍然是同一个节点、标记还在。节点重挂会让角色直接跳位，不会走过渡。
   - **退场动画**：点 Next 之前在 `.sand-onboarding` 上装一个 MutationObserver，记录出现过的每个 `.sand-onboarding__step[aria-hidden="true"]` 的 `style.animation` 和它里面 heading 的 id。meet→computer-demo、role→attribution 各测一次：记录里要有对应旧步的 heading id，animation 含 `sand-onboarding-step-exit`；并且 1s 内 `.sand-onboarding__step[aria-hidden="true"]` 的数量归 0。
   - **侧栏覆盖**：meet 页和 role 页各测一次。`document.elementFromPoint(140, innerHeight/2)` 的 `closest('.sand-onboarding')` 非空，`closest('.sand-agents-sidebar')` 为空。
   - ④ 后半段（建主 bot、模板 bot、介绍延后、creatorContext）以及 ①-③、⑤、⑥ 的原断言都不变。
3. 回归：`test:e2e tests/e2e/kickstart.spec.ts tests/e2e/bots.spec.ts` 的 passed 数与施工前基线相同（先跑一次贴数）。
4. `cd renderer-grok && pnpm --config.verify-deps-before-run=false check` → upstream diff=0。
5. **变异四刀**（回执贴红的原样输出；改造前先 commit，还原后复绿）：
   - Vc：不渲染 exiting 层 → ④ 红在退场记录
   - Vd：sceneStep 不映射、直接传 step → ④ 红在 teammate opacity
   - Ve：删掉 `onboarding-steps-0793.css` 的 import → ④ **必须**红在几何（T28c Vb 当时幸存，这次要咬住）
   - Vf：删掉 `.sand-onboarding` 的 z-index → ④ 红在侧栏覆盖
6. **截图**：亮暗两套，每套 meet、computer-demo、jobs、role、attribution、connect 六页，共 12 张，覆盖 `work/grok-0.79.3-re/ours/onboarding-*.png`。等 heading 可见后再等 900ms 才截，**不能截在淡入过程中**（T28 的 light 图就是这么截坏的）。截整窗，以便证明侧栏被盖住。回执逐张写一句看到了什么：标题全文和位置、卡片几列、三个演示 bot 是否在标题上方且不压卡、侧栏是否被盖住。
   - **S5 参照（可选，时间盒 1h）**：补 T20 桩（`work/grok-0.79.3-re/harness/r3/`）的引导 step 机 RPC，跑 `drive.mjs --scene onboarding-*` 出 `ref/onboarding-*.{light,dark}.png`，与 ours 拼版存到 `work/grok-0.79.3-re/compare/`。出不来就在回执写「未对照（S5 卡点：…）」，不算失败。
7. **覆盖**：工具链里没有 coverage 插件。回执手工列出 Walk 新增的分支（exitingStep 的设置和清空、SCENE_AS 映射、bodyOf 的各个分支）分别由哪一格覆盖，要求 ≥80%。
8. `git diff <起点>..HEAD --stat` 只包含边界 1 列出的文件和 `work/**`。

## 为什么这样验收
- T28c 的可见性断言统一放在 connect 页调用，那时 role / attribution 的元素已经卸载，`evaluateAll` 拿到空数组，永远通过。所以这次要求在各页当场调用并带数量，断言不能空转。
- 版心靠截图守了两轮都没守住（Vb 幸存）。0.79.3 的数值已经静态抽出来了，直接断几何；删掉 css 必须红。
- 编舞对不对，要看演示 bot 是否落在标题上方的空白里、不压卡片，这是 TOOL_POSITIONS 和版心之间的契约。只断言「cast 有子节点」证明不了这一点。cast 节点不重挂，才能保证换步时角色是滑过去的，而不是跳过去的。
- 退场层只存在 200ms，轮询会漏掉。用 MutationObserver 记录出现过的层，才能确定地断言「有退场，而且会卸载」。
- 侧栏覆盖要用 elementFromPoint 断言：截图里看得出来，但测试不咬住的话，以后就会退回去。

## 存疑预记
- 0.79.3 三页标题字重是 regular（`sand-1k6tqyu`），`view.css:12` 是 500。本单沿用 view.css 同款，和前三步保持一致；回执记一笔。
- `data-step` 在三页上写的是 `'tools'`（T28c 定的），本单不改。

## 产出
- `onboarding-view.tsx`、`onboarding-steps-0793.tsx`、`onboarding-steps-0793.css`（都改）；`tests/e2e/onboarding.spec.ts`（改 ④）
- 截图 12 张（S5 出图的话再加拼版）；回执 `work/tickets/receipts/T32.md`
