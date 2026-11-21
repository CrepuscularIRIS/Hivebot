# T88：bot 吉祥物换成 0.78.1 原版引擎（按活动变形的动画，聊天面三处：侧栏 / 会话头 / 状态行）

> 开单：manager (Opus 5.5) | 日期：2026-11-13 | 施工：main (GLM 5.3)
> 来源：work/session-presence/BRIEF.md（用户：「很多 bot 是会动态的，thinking 部分是 UI 在动态的」）+ 同文件末「经理结论」
> 分支 / 作业目录：feat/T88 @ /tmp/bot-wt/T88
> claimed：960411b1 @ /tmp/bot-wt/T88（2026-11-13，step0+主体完成）
> accepted：2026-11-14 507cf52e（经理任务 B 第三轮：e2e 两连 2 passed，Xvfb svg=1；证据收尾见 open/T88e）
> 失败计数：1（2026-11-13 manager 任务 B 终验不通过 @ 960411b1 → 返修单 `open/T88b-mascot-engine-fix.md`）

## 目标
吉祥物运行中要按活动变形：thinking 变成三点，searching 变成雷达点，working 等各有动作。0.78.1 原版就是这样（不涉及 0.79.3 版本切换）。我们现在用的是 0.18 静态 SVG，只会轻微上下浮动和倾斜。T24 当时说「不移植 3D」，是经理自定的有意偏差，本单撤销它。

**为什么是这一张**：T23 状态行在泛 working 活动的前 5 秒是静默期，按原版只显示吉祥物、不出文字。我们的吉祥物是静态的，所以这 5 秒里屏幕上没有任何东西在动，用户觉得「不动态」的根因就在这里。对照 `work/grok-0.79.3-re/ours/conv-working.cmp.light.png`：左边是我们，橙色 cloud 静止；右边是原版，侧栏和状态行的吉祥物都变成了紫色三点。

## 搬运阶梯（停在第 2 级：整件集成）
- 0.78.1 的引擎在 `index.eager-common-DbK3Oi_r.js`。它是一个独立的 ES module，382KB，唯一的 import 是 `./chunk-rolldown-runtime-BCiCTKAo.js`，文件尾 `export{...}` 带短名。引擎工厂是 `p_`，导出名 `T`（`function p_(` @≈359030，返回 `{attach,update,setState,poke,…}`）。状态目录 `on`（`label:\`Lifecycle\`` @171148，53 个状态）。app 侧 `import{…,D as Nr,E as Fr,…}from"./index.eager-common-DbK3Oi_r.js"`，`Fr(shape)` 产 body，`Nr(ink[,eye])` 产 appearance。
- React 包装 `GrokBotMark`（`function dT(e){dT.d=2848` @app≈892000，`index.eager-app-iGTgHP_Q.js`）。props：color / sourceId / shape / state / isPaused / maxFrameRate / isEmphasized / spinSignal / isFollowingPointer / eyeColor / sizePx。它挂的是 `.sand-grok-bot-mark` 根 + canvas，样式 `--grok-bot-ink` / `--grok-bot-eye`（`uT`）。
- 所以**原文件逐字节拷进来直接 import**，不重写引擎。只有 React 包装（几十行）由我们按 `dT` 复写。
- 0.18 重构仓（`repos/grok-bot-0.18-reconstructed`）只有静态 SVG，没有引擎，第 1 级不成立。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md、本单「搬运阶梯」节
2. 原版：`/tmp/t78-asar/dist/renderer/assets/index.eager-common-DbK3Oi_r.js`。看文件尾的 export 表，以及 `p_` / `f_` 两个函数（props 默认值：fill .6、maxFrameRate 60、IntersectionObserver 不可见即停 rAF、`prefers-reduced-motion` 即 static）。再看 `index.eager-app-iGTgHP_Q.js` 的 `dT`（GrokBotMark）和 `JZe`（`thinking:\`thinking\`` @1062742：动词→状态表，外加 `YZe=8e3` 结算保持）
3. 我们：`frontend/src/recovered/features/conversation/workspace/agent-avatar.tsx`（`PersonaMark` :31 起，`personaStateFromAgent` :66，`activityState` 映射）、`overrides/vite.config.ts` 的 `MODULE_OVERRIDES`、`assets/MANIFEST.json` + `SHA256SUMS` + `package.json` 的 `check` 脚本
4. 发布链：`scripts/publish-hivebot.sh:13` 已排除 `app/ui/renderer-grok/assets`。原版文件**只能**放在这个目录下

## 做法
0. **闸门（先做，过不了就停）**：用 Playwright 起一个最小页面，import 拷来的 common chunk，调 `T`（p_）+ `E`（body）+ `D`（appearance），状态设 `thinking`，attach 到一个 canvas。断言两点：canvas 像素非空；相隔 300ms 的两帧像素不同。原版装配需要的东西不在 common 里（比如还要 app chunk 的符号）就停下，回执写清缺什么，交经理走任务 C。**不要**为了绕过去去拷 app bundle 的片段。
1. 拷 `index.eager-common-DbK3Oi_r.js`、`chunk-rolldown-runtime-BCiCTKAo.js` 到 `app/ui/renderer-grok/assets/vendor-078/`，字节不改。sha256 进 `SHA256SUMS`（或者给 `check` 加一行校验），`MANIFEST.json` 记来源。构建要把它们带进 out/：仿照 `assets/runtime` 的拷贝方式，或者走 vite 静态 import，选改动更小的那种。
2. 新建 `overrides/modules/agent-avatar.tsx`，登记进 `MODULE_OVERRIDES`。只替换 `PersonaMark` 的渲染：改用引擎 mark（按 `dT` 复写的包装），保留 `.sand-agent-avatar.sand-grok-bot-mark` 类名和 `data-grok-state`，现有 e2e 选择器不能失效。其余分支（dataUrl / group / shared-room）原样 re-export。
3. 状态映射对齐 0.78.1 `hO`（`YZe=8e3` 后紧跟）：运行中先看是否在流式输出，是就 `streaming`；否则走 `XZe` = 活动 → `lO(activity).verb`（工具名→动词，`function lO(` @1058900）→ `JZe[verb]`；awaiting→`blocked`。具体到工具：WebFetch→browsing→`reading`（我们现在是 searching），Task→我们现在是 `orbit`，按 lO 实际给的动词改。`personaStateFromAgent` 的映射表在覆盖层里换掉。结算后 `finished`/`failed` 保持 8s 再回 idle，这一步需要回合结局信号，我们的 agent 记录里没有，所以**本单不做**，写一行 `ponytail:` 注释说明上限。
4. 不动：onboarding / 建 bot 对话框的 `OnboardingCharacter`（`character.tsx`）。留给 T88b。

## 边界
1. 只动：`assets/vendor-078/**`（新）、`assets/SHA256SUMS` / `MANIFEST.json`、`package.json` 的 check/build 拷贝步骤（如需要）、`overrides/modules/agent-avatar.tsx`（新）、`overrides/vite.config.ts`（加一行映射）；测试 `app/ui/tests/unit/grok-shim/mascot-state.test.ts`、`app/ui/tests/e2e/t88-mascot-engine.spec.ts`（新）。上游 `frontend/**`、`source/**` 不改（`pnpm check` 上游 diff=0）。
2. 先红：`t88-mascot-engine.spec.ts` ①（下文）现在必红，因为状态行里的 mark 没有 canvas。先提交测试、跑一次贴红输出，再实现。
3. 隔离 HOME / TMPDIR，DBus 指向不存在路径，e2e 经 `scripts/run-e2e.sh`。实现前先 `pnpm --config.verify-deps-before-run=false -C app/ui build`（run-e2e 不重建）。
4. 截图来自已提交 HEAD 的构建，回执写 `git rev-parse HEAD`。

## 验收（命令）
1. `pnpm --config.verify-deps-before-run=false -C app/ui/renderer-grok check` → exit 0（上游 diff=0；vendor 两个文件 sha 与 `/tmp/t78-asar` 原件一致，回执贴 `sha256sum` 两边的对比）
2. `pnpm --config.verify-deps-before-run=false -C app/ui exec vitest run tests/unit/grok-shim/mascot-state.test.ts` → 全绿。内容：JZe 全 15 个动词→状态逐条断言；null 活动 + running → `working`；awaiting → 与原版 `bO` 一致（`blocked`，现为 idle，改正）
3. `app/ui/scripts/run-e2e.sh tests/e2e/t88-mascot-engine.spec.ts` → 全绿，DPR2，亮暗：
   - ① fake runtime 卡在 reasoning：状态行 `.sand-status-line .sand-grok-bot-mark` 内有 `canvas`，`data-grok-state=thinking`；对 mark 元素截两帧（间隔 400ms），像素差 > 0
   - ② 同一时刻侧栏该 bot 行的 mark `data-grok-state=thinking`；会话头 mark 同样是 thinking
   - ③ fake 工具活动 WebSearch → 三处 mark 都是 `searching`；回合结束后回 `idle`
   - ④ `emulateMedia({reducedMotion:'reduce'})`：两帧像素差 = 0（原版 reduced-motion 即 static）
   - ⑤ 有自定义头像（dataUrl）的 bot 仍然渲染 img 分支，没有 canvas
4. 回归：`run-e2e.sh tests/e2e/t23-*.spec.ts tests/e2e/outline.spec.ts tests/e2e/visual.spec.ts` → 与 base 同绿（回执给 base/本单对照）
5. 截图：卡住态亮暗各一张，和 `work/grok-0.79.3-re/ref/conv-working.{light,dark}-t0.png`、`conv-working-tool.light-t0.png` 拼版，产出 `work/grok-0.79.3-re/ours/t88-mascot.cmp.{light,dark}.png`。亲检点：侧栏行和状态行的吉祥物在 thinking 时是三点形态（不是静态形状），工具态是雷达点
6. 性能存疑项（不当闸门，回执里给数）：5 个 bot、全部 idle、10s 内 renderer 进程 CPU 占比（`app.getAppMetrics()`）。原版不可见即停帧，侧栏不可见的行应该不跑 rAF

## 为什么这样验收
要保住的目的是「运行中屏幕上有东西在按活动变」。①④ 用像素差直接量「在动」和「降级时不动」，不看类名，因为光有 class 不代表在动。② 保证三处吃的是同一个状态，原版用 `holdMarkFacts` 共享同一份事实，三处不该各说各话。⑤ 防止把自定义头像也盖成吉祥物。原版文件按 sha 比对：引擎行为不靠我们复述，靠逐字节拷贝。

## 产出
- 上述文件；`work/tickets/receipts/T88.receipt.md`（闸门结果放第一段）；拼版图
