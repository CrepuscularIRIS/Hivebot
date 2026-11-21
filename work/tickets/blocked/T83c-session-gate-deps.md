# T83c：T83 会话门是死代码——observer effect 依赖缺 activeAgent.id

> 来源：2026-11-15 经理终验（第二次）T83 三批+T83b（feat/T83-batch3 @09c4fd4d）。分支续在 /tmp/bot-wt/T83c。
> T83 第二次不通过（T83b 是第一次）。本单再不过 → 走 C，T83 消息行入场整段挪 blocked。
> 边界：只动 `app/ui/renderer-grok/overrides/modules/transcript.tsx`、`app/ui/tests/e2e/t83-enter3.spec.ts`（或新增一个 vitest 单测文件，二选一）。

## 问题（已核实，transcript.tsx 三批 observer effect）

T83b 的会话门写在 effect 体内（`if (bootSessionRef.current !== sessionKey) {...}`），但 effect 依赖仍是 `[isMainLine]`；ProductionRenderer:3516 的 `<ConversationTranscript>` 无 key，切会话不重挂载 → effect 只在挂载时跑一次，会话门永远只比较一次，`seen`/`bootedRef`/`settleUntilRef` 切会话不重置。切到一个本页从未显示过的、有历史的会话，1200ms 稳定窗早已过期，历史行批量进 DOM → 全部入场动画。这正是 T83b 第 2 项要修的问题，T83b「做法」里明写了「effect 依赖加 activeAgent.id」，施工未做。

## 做法（最小）

effect 依赖改为 `[isMainLine, activeAgent.id]`（`activeAgent` 是 markers 的模块对象，render 期读 `.id` 进依赖数组即可）。cleanup 已 disconnect + cancelAnimationFrame，重跑时 `seen` 新建、会话门重置 boot、稳定窗重开。其余不改。

## 先红的测试（在 09c4fd4d 上必须红，回执贴红输出）

⑤ 换会话：切到一个**本页从未显示过、已有 ≥2 条历史**的会话，历史行进 DOM 时从未带 `data-enter`（预装 MutationObserver 记 attributes，或进 DOM 后立即查）。
- 注意：「A 发消息 → 切 B → 切回 A」在现码上也会绿（A 的行 id 已在 `seen` 里），**不算数**。
- 上轮卡在「在 B 里发消息等回复」的链路——绕开它：用 fake runtime 在页面打开前预置第二个会话的历史；或改写 vitest 单测（jsdom 渲染 ConversationTranscript，改 `activeAgent.id` 后 rerender，稳定窗外批量插入 ≥2 行 `[data-entry-id]`，断言无 `data-enter`）。施工方二选一，回执写理由。
- 删掉 spec 里 `if (false) {...}` 冻结段。

## 验收命令

- `cd /tmp/bot-wt/T83c/app/ui && CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/t83-enter3.spec.ts` → passed（含 ⑤）
- 回归 `tests/e2e/t83-enter.spec.ts tests/e2e/t91-reaction.spec.ts` → 2 passed
- 若走 vitest：`pnpm vitest run <文件> --config.verify-deps-before-run=false` 绿，且贴出在旧依赖下红的输出

## 为什么这样验收

要保住的是「历史加载的行不打」。这个 bug 只在「从没见过的会话历史」上出现，所以测试必须用没见过的会话，否则又是假过。

> 2026-11-15 经理：随 T83 三批挪 blocked（T83d 终验 2/3），不合并。
