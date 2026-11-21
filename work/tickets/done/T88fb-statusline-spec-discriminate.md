# T88fb：t88f spec 加判别断言（现 spec 对旧 import 也绿）

> 开单：manager (Opus 5.5) | 日期：2026-11-16 | 施工：main (GLM 5.3)
> 来源：T88f 验收（queue 18e）——产品改动核实正确，spec 不判别
> 分支 / 作业目录：feat/T88f @ /tmp/bot-wt/T88f（在 29893ae8 上追加一提交）
> claimed：
> accepted：2026-11-16 feat/T88f @ b1c0abe4（经理直验：三连 1p、diff 只 spec、旧 import 红证见回执、merge-tree main 干净）

## 目标
让 `t88f-statusline-engine.spec.ts` 在旧 import（上游 0.18 agent-avatar）下必红。

## 为什么现 spec 不判别（经理读码核实）
旧路径 `frontend/src/recovered/.../agent-avatar.tsx:82-97` PersonaMark → `OnboardingCharacter`（`onboarding/signed-in/character.tsx:315` 直接 `return <svg …>`）：
- `hasSvg`=true、`inCanvas`=false、`svgW`>0 —— 旧版同样成立；
- `out.state` 取的是 mark span 的 `data-grok-state`，旧版 span 上**没有**此属性 → `undefined`，`not.toBe('idle')` 恒过；
- color 两边同源，一致恒过。
五条断言没有一条能区分新旧。

## 边界
1. 只动 `app/ui/tests/e2e/t88f-statusline-engine.spec.ts`，产品代码不碰。
2. 加两条（任一即可判别，两条都加）：
   - `expect(out.state).toBe('thinking')`（覆盖版 span 才挂 `data-grok-state`；经理探针实测运行态=`thinking`）
   - `svg.parentElement !== el`（覆盖版 svg 挂在内层容器 span 里；旧版 svg 是 mark 的直接子节点）
3. 先红：worktree 内临时把 `transcript.tsx:12` 改回旧全路径 → build → 跑 spec 看红（贴失败断言行）→ 改回 → build → 绿。临时改动不提交。

## 验收
1. 回执贴旧 import 下的红输出（断言消息含 thinking 或 parent）。
2. `cd /tmp/bot-wt/T88f/app/ui && PATH="$PWD/node_modules/.bin:$PATH" sh scripts/run-e2e.sh t88f-statusline-engine.spec.ts` ×2 → 1 passed
3. `git diff 29893ae8..HEAD --stat` → 只有该 spec 一个文件。

## 为什么这样验收
t88f 是「状态行别再画旧吉祥物」的回归闸；对旧代码也绿的闸等于没有（L202 类坑：modules 内 import 指回上游）。

## 产出
- `app/ui/tests/e2e/t88f-statusline-engine.spec.ts`（+2 断言）
- `work/tickets/receipts/T88fb.receipt.md`

## 2026-11-16 直验：不通过 @ 491414c9
- diff 范围合格（只 spec，+3/-2），svgParentIsMark 断言合格。
- **经理复跑 3 次全红**：`运行态=thinking … Expected: "thinking" Received: "working"`。根因：本 spec 走默认 fake 回复（无 reasoning 块），覆盖版 `agent-avatar.tsx` 状态推导 L84-88 在 `isComposingMessage` 未置时落 `isRunning→"working"`；thinking/working 取决于采样时刻，和负载有关（施工方两连绿、经理三连红）。断言 `toBe('thinking')` 场景不保证，是我开单时写的口径错（我的截图探针走 shot-statusline 的 reasoning 脚本才是 thinking）。
- 返修（仍只动该 spec）：把 state 断言改为「已定义且非 idle」——`expect(out.state, …).toBeDefined()` + `expect(out.state).not.toBe('idle')`（旧版 undefined 仍红）；svgParentIsMark 保留。
- 验收：旧 import 下红（贴断言行）；改回后 `run-e2e.sh t88f-statusline-engine.spec.ts` **三连** 1 passed。
