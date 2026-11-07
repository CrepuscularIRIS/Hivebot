# T21：「Full conversation」侧板接上数据——shim 实装 `getConversationOutline` + `outline` 推送

> 开单：manager (Opus 5.5) | 日期：2026-11-07 | 施工：main (GLM 5.3)
> 来源：BRIEF §用户体验反馈 1（「grok bot 是没有 cot 的，只有第一次回答和最后一次回答」）；RE-UI-0.79.3 题 1(e)、差距表 #4
> 分支 / 作业目录：feat/T21 @ /tmp/bot-wt/T21；**T22 在同一分支接着做，两单验收后一起合并**
> 排期：UI 链第 1 张，现在开（与 T20 并行）
> claimed：
> accepted：
> 失败计数：0

## 为什么先做它
用户要的是「主聊天里没有过程」（T22）。但过程不能直接扔掉：0.79.3 把它放进了可选的「Full conversation」侧板，而且我们现有十来个 e2e 的工具状态断言（`toolRows`）也得有地方迁过去。侧板的视图、provider、订阅逻辑 0.18 移植里**全都已经有**（`conversation-outline-view.tsx` / `conversation-outline-provider.ts`，ProductionRenderer 已接线，侧栏行菜单已有「Show full conversation」）——缺的只是 shim 现在对 `getConversationOutline` 回 `[]`（`shim/src/coordinator.ts:32`），面板永远是空的。本单只补数据，纯加法，不改主聊天。

## 动手前先读
1. `app/ui/renderer-grok/frontend/src/recovered/features/conversation/workspace/conversation-outline-provider.ts:7-23`（item 形状：user / assistant-text / thinking / send-message / tool-call，tool-call status 只有 `pending|failed|done`）、`:45-75`（解析器——不合格的 item 会被丢掉）、`:300-310`（订阅 `outline` 事件族，`{type:'snapshot',agentId,items}` 整体替换）
2. `.../conversation-outline-view.tsx:100-110`（DOM：`.sand-outline-item[data-kind][data-status]`）、`:180-195`（面板 `aside.sand-outline-panel[aria-label="Full conversation: <名字>"]`）
3. `app/ui/renderer-grok/shim/src/entries.ts`（`toolSummary`，可导出复用）、`app/ui/renderer/fold/turn-fold.ts:11-21`（FoldEntry：message 的 role ack/result、thinking 的 from text/reasoning）
4. `app/ui/renderer-grok/shim/src/data.ts:259-287`（`entriesOf` / `pushTranscript` / `onFollowItem`——outline 推送挂在同一处）、`shim/src/coordinator.ts:28-45, 80-82, 98-140`（defaultReply、`pushEvent`、RPC 分派）
5. `app/ui/tests/support/ui.ts:140`（`toolRows` 现在是全页选择器）

## 映射（写成纯函数 `toOutlineItems(out: FoldOutput, streaming)`，新文件 `shim/src/outline.ts`）
| fold 条目 | outline item |
|---|---|
| user | `{kind:'user', id, text}` |
| message（ack / result） | `{kind:'assistant-text', id, text}` |
| thinking from:'text'（中间轮正文） | `{kind:'assistant-text', id, text}` |
| thinking from:'reasoning' | `{kind:'thinking', id, text}` |
| tool-call（含编排工具） | `{kind:'tool-call', id, name, status, summary: toolSummary(...)}`；status：running/pending→`pending`，done→`done`，failed/error/aborted→`failed` |
| notice / peer | 不进 outline（0.79.3 outline 行 kind 里没有） |
| 流式尾条 | reasoning 流 → `thinking` id `live-reasoning`；正文流 → `assistant-text` id `live-stream` |

范围上限：只覆盖当前已载入的窗口（`view.items`），更早分页不进 outline。在 `outline.ts` 里写一行 `ponytail:` 注释说明这个上限与升级路径（按需取全量）。

## 边界
1. 只动：新建 `shim/src/outline.ts`；改 `shim/src/coordinator.ts`（`getConversationOutline` 从 defaultReply 移出，按 `{id}` 回 items）、`shim/src/data.ts`（推 `outline` 快照，与 `pushTranscript` 同时机）、`shim/src/entries.ts`（只允许 `export` 掉 `toolSummary`，不改逻辑）、`app/ui/tests/support/ui.ts`（加 helper）；新建测试 `app/ui/tests/unit/grok-shim/outline.test.ts`、`app/ui/tests/e2e/outline.spec.ts`。**不改** 上游 `frontend/**`、`source/**`（`pnpm check` 上游 diff=0）、不改主聊天渲染。
2. 不做 subagent tab（`agent.raw.subagents`）——编排层等用户。
3. 隔离 HOME / TMPDIR、e2e 经 `scripts/run-e2e.sh`；与 T7bd 的 ui e2e 错开。

## 先红
先提交两份测试再写实现，各跑一次贴输出：
- `outline.test.ts` 红（`outline.ts` 不存在 → import 失败即可）
- `outline.spec.ts` ① 红：面板打开后 `.sand-outline-panel .sand-outline-item` 计数为 0（期望 6）

## 验收（命令）
前置：作业目录内 `pnpm --config.verify-deps-before-run=false -C app/ui build`（LEARNINGS：run-e2e 不重建 dist）。
1. `pnpm -C app/ui --config.verify-deps-before-run=false exec vitest run tests/unit/grok-shim/outline.test.ts` → 全绿，格子至少：上表每一行一格；tool status 五个取值的映射各断言一次；`toolSummary` 结果与主聊天一致（同一 args 两边相等）；空 fold → `[]`；**每个产出 item 都能过 provider 解析器**（测试里 import 上游 `conversation-outline-provider` 的解析函数——若未导出，就用 `createConversationOutlineProvider` 喂一个假 coordinator 拿 snapshot，断言 items 数不变；不得复制解析器）
2. `pnpm -C app/ui --config.verify-deps-before-run=false test:e2e tests/e2e/outline.spec.ts` → 全 passed：
   - ① fake LLM 一轮：reasoning「R」+ 首答「A」+ bash `ls`（done）→ 第二次调用正文「E」收尾。完成后经侧栏行菜单「Show full conversation」打开面板 → items 顺序与 kind 恰为 user / thinking / assistant-text(A) / tool-call(done, 含 `ls`) / assistant-text(E)（中间轮正文按实际 fold 结果计，回执贴 DOM 序列）
   - ② 进行中：bash 用 gate 卡住（照 `p6-fold.spec.ts:112` 的 gate 写法）→ 面板已开着的情况下，tool-call 行 `data-status="pending"` 出现（证明 `outline` 推送是活的，不靠重开面板）→ 放行 → 同一行变 `done`
   - ③ 失败工具：bash 退出码非 0 → `data-status="failed"`
   - ④ 切到另一个 bot 再打开 → 只有那个 bot 的条目（`aria-label` 含其名字）
3. 新 helper：`ui.ts` 加 `openOutline(page, botTitle)`（走真实菜单点击，不 evaluate 调函数）与 `outlineToolRows(page)`（作用域 `.sand-outline-panel`）。**不改** 现有 `toolRows`（T22 才迁）。
4. `pnpm -C app/ui/renderer-grok check` → 上游 diff=0
5. 回归：`pnpm -C app/ui --config.verify-deps-before-run=false exec vitest run tests/unit/grok-shim tests/unit/fold` → 全绿；`test:e2e tests/e2e/session.spec.ts tests/e2e/p6-fold.spec.ts` → 与施工前同数 passed（本单不该影响主聊天）
6. 变异（各改一处、跑对应格、贴输出、还原）：M1 data.ts 去掉 outline 推送 → ② 红（只有重开面板才更新）；M2 status 映射把 running 映射成 `done` → ② 红；M3 reasoning 映射成 assistant-text → unit 对应格红
7. 截图：`outline.{light,dark}.png`（面板打开、① 完成态，并展开一条 thinking）存 `work/grok-0.79.3-re/ours/`；**截图必须出自已提交 HEAD 的构建**（回执写构建时的 `git rev-parse HEAD`）。T20 若已出 S3 参照，做 ours|ref 拼版存同目录；没出就在回执标「参照待 T20」
8. 收尾：`pgrep -af 'bot-T21' | grep -v pgrep` → 空；隔离 TMPDIR 无遗留

## 为什么这样验收
要保住的是「过程没丢，只是挪了地方」：②（活推送）和 M1 防止「面板只在打开那一刻对」；解析器格防止「我们产出的 item 被上游静默丢掉、面板看着空」；回归格证明本单零影响主聊天，破坏性变更全部留给 T22 一处。

## 回执（`work/tickets/receipts/T21.md`）
先红输出、每条验收原样输出、变异三刀、截图路径与 HEAD、存疑项（尤其：中间轮正文在 fold 里实际落成什么、outline 里 tool 名用 dsh 名而非原版名是否显眼）。
