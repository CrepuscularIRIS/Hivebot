# T26：onboarding 引导流程——首次启动走 0.79.3 七步分镜（0.18 组件接线 + landing 前奏 + 演示 bot 不 kickstart）

> 开单：main (GLM 5.3)（经理 agent 立项超时 75min 被 TaskStop，主 agent 按模板补开——探针数据已备：RE 题 2 序列 + 0.18 组件树 + T25 kickstart:false）| 日期：2026-11-07
> 来源：queue U5/T26 计划行；RE-UI-0.79.3.md :99（ONB chunk）；T20 S5 止损记录
> 分支 / 作业目录：feat/T26 @ /tmp/bot-wt/T26
> claimed：
> accepted：
> 失败次数：0

## 已定事实（探针已跑掉的部分）
- **0.79.3 七步**（RE :99，`Fe={step:'landing'` 锚点）：`landing → meet → computer-demo → jobs → attribution/role/connect/tools → create → handoff`；初始态含 createColor:'blue'/createShape:'blob'（与 T24 随机初值不同——onboarding 的 create 步是固定默认）
- **0.18 组件树在仓完整**：`frontend/src/recovered/features/onboarding/signed-in/`（view.tsx 224 行+model.ts 的 step 机+scene.ts 编舞+suggestions.ts+character.tsx+computer-readiness.ts）——六步 `meet→computer-demo→jobs→tools→create→hand-off`（`SIGNED_IN_ONBOARDING_STEPS`），接线路径 `bridge.onboarding`（getSeen/setSeen/onSkip）
- **shim 断点**：`shim/src/desktop.ts:197` `getSeen: () => true` 恒真——onboarding 永不进
- **T25 已备**：createBot `kickstart:false`（onboarding 的 create 步建演示 bot 不自我介绍）
- **T20 桩已备**：`scene=onboarding` 翻转 getOnboardingSeen（stub-init-0793.js）

## 范围（分两段，一段一验收）
**A 段（本单主体）——接线与七步**：
1. desktop.ts:197 的 onboarding 面接真：getSeen 读 localStorage（key `pbots.shim.onboarding-seen`，先例 avatars.ts）、setSeen 写、onSkip 转发（0.18 语义：skip=提前 seen）
2. 0.18 六步基础上补 **landing 前奏**：覆盖层喂 `SIGNED_IN_INITIAL_STEP` 前插 landing（0.79.3 的 landing 是问候页——RE ONB chunk `Fe` 初始态即 landing；形态探针：bundle 搜 landing 文案/资产，参照 T20 S5 补图或标未验证）
3. jobs→tools 之间的 `attribution/role/connect` 若为一步内多页（RE 逗号并列）：0.18 的 jobs/tools 之间是否已有对应 tab——施工探针定；缺则 jobs 步内加页签（最小实现）
4. create 步建演示 bot 走 `kickstart:false` + 固定 blue/blob 默认（0.79.3 初始态）
**B 段（本单不做，拆 T32）**：3 个演示 bot 的编舞动画（scene.ts 现有编舞够用与否待 B 段）、beat 轴逐帧对照、onboarding 参照图全套

## 边界
1. 只动：`shim/src/desktop.ts`（onboarding 面）、新建 `renderer-grok/overrides/modules/onboarding-view.tsx`（若 landing 需覆盖；尽量只接 props 不覆盖）、`shim/src/data.ts`（若 create 步走 shim createBot 需传 kickstart:false 的通道）、测试。**不改** `frontend/src/recovered/features/onboarding/**`（上游零改动——覆盖层包一层走 MODULE_OVERRIDES 若必须）
2. e2e 首次启动（清 localStorage）进 onboarding→逐步走到 create→建演示 bot（无 kickstart）→handoff→seen 落盘→重启不进；skip 路径
3. 变异：getSeen 恒真→e2e 红；kickstart 没传 false→演示 bot 介绍出现红；setSeen 不落盘→重启再进红
4. 参照图：T20 桩跑 `--scene onboarding`（step RPC 若桩缺就补 stub——harness/r3 只写），出图存 ref/；出不来标「未验证」不阻塞

## 先红
`tests/e2e/onboarding.spec.ts` ①：清 localStorage 启动 → onboarding 容器（0.18 view 的根 class，探针定）计数 0（现在 getSeen 恒真）。

## 验收
1. e2e `onboarding.spec.ts` 全 passed（①-⑤：进入/逐步/建演示 bot 无介绍/seen 持久/skip）
2. 回归：`vitest run tests/unit/grok-shim`；`test:e2e tests/e2e/kickstart.spec.ts tests/e2e/bots.spec.ts` 同数 passed
3. `renderer-grok check` → diff=0
4. 截图：onboarding 首步+create 步亮暗存 ours/；T20 参照在则拼版
5. 回执：探针结论（landing 形态/attribution 是否多页/0.18 编舞现状）、变异、存疑

## 存疑预记
- 0.18 view 的 props 依赖 bridge/client 两路——shim 侧 client 为 null 时 onboarding 是否可跑（探针 view.tsx 的 client 用途）
- computer-demo 步需要 computer readiness（computer-readiness.ts）——shim 无 computer，探针其降级路径
