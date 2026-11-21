# T59：侧栏折叠钮（0.78.1 有、我们缺）

> 开单：manager (Opus 5.5) | 日期：2026-11-11 | 施工：main (GLM 5.3)
> 来源：work/ui-polish-win/PLAN.md 行 P6；`evidence/T54/MATRIX.md:15`（02-rail：两平台均无折叠钮，复刻缺失，非 Windows 特有）
> 分支 / 作业目录：feat/T59 @ /tmp/bot-wt/T59
> claimed：23cd8f58（feat/T59 @ /tmp/bot-wt/T59，2026-11-11 施工完待审；第 0 步查证见 receipts/T59.step0.md）
> accepted：2026-11-11 6e98af80（feat/T59；manager 任务 B 复验：t59 1 passed 重跑、四截图 Read 过、Sol MINOR 修复核实）

## 目标
侧栏头部 icon 行出现原版的折叠钮；点它侧栏收成窄轨（rail），再点展开。

## 已知
- 原版：icon 行首个钮 `layout-sidebar-left`，tooltip「Collapse sidebar」（MATRIX 引 0.78.1 `mkMLq4`）。
- 我们：recovered `features/conversation/workspace/sidebar.tsx:124-140` 的 `AgentSidebarHeader` **已有 `isCollapsed` 分支**（窄轨 New 钮 `sand-agents-sidebar__rail-new`，行投影 `data-collapsed`，:31/:33 注释）——折叠态的渲染大概率已在，缺的是开关钮与状态源。

## 第 0 步（写回执；查不到的找经理，不臆造）
1. 我们这边 `isCollapsed` 由谁传、状态存在哪（grep `isCollapsed` / `collapsed` 于 ProductionRenderer 与 overrides）。
2. 原版钮的位置、tooltip、展开钮的样子（折叠后 rail 上是哪个 icon / tooltip）、状态是否持久化、有无快捷键：先查 0.18 recovered 源码与 `repos/`；查不到 → 让主 agent 派 `reverse-engineer` 查 0.78.1 产物，**本单等结果，不猜**。
3. 0.78.1 rail 宽度与折叠动画（REA 或 reverse-engineer 结果）。

## 边界
1. 优先只动 overrides（`overrides/modules/sidebar.tsx` 等）与 css；需要改 recovered 源码时回执说明理由。
2. 新 spec `app/ui/tests/e2e/t59-sidebar-collapse.spec.ts`，先红后绿。

## 验收
1. `run-e2e.sh tests/e2e/t59-sidebar-collapse.spec.ts` → 全过：钮存在且 `aria-label`/tooltip 文案与原版一致；点击后侧栏宽 = 原版 rail 宽（±1px）、行变 `data-collapsed`；再点恢复原宽；若原版持久化，reload 后状态保持。
2. 亮暗 × 展开 / 折叠四张截图到 `work/ui-polish-win/evidence/T59/`，经理 Read。
3. 回归：`onboarding.spec.ts`、`t60` 相关 shim 单测不新增红（回执贴数字行）。

## 为什么这样验收
缺的是一个原版就有的日常操作；要保住的是「和原版一样的开关语义」，所以第 0 步要先把原版行为查实再做，验收按原版行为断言。
