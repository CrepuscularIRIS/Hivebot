# T68b：T68 返修——spec 没造出 agent 消息，气泡宽 / hover 钮断言落空

> 开单：manager (Opus 5.5) | 日期：2026-11-12 | 施工：main (GLM 5.3)
> 来源：`receipts/T58b-T68.acceptance.md`；父单 `doing/T68-borders-message-tokens.md`
> 分支 / 作业目录：feat/T68 @ /tmp/bot-wt/T68（接 96f176ab）
> claimed：f246e4f3（施工方未回填，经理补记）
> accepted：2026-11-12 manager 复验通过 @f246e4f3（3 轮 1p；两处口径偏离接受、理由更正；见 receipts/T58c-T68b.acceptance.md）

## 目标（CSS 不动，只修 spec）
经理亲看 `evidence/T68/transcript-light.png`：会话里只有 user 气泡「hi」+ 一行「回复失败：p2sdk-fake-llm: no scripted call #0」，**没有 agent 气泡、没有可见 hover 动作钮**。因此：
1. 气泡宽两档断言量的是 `document.querySelector('.sand-virtual-transcript .sand-message')` = user「hi」（35px，且 user 侧 `max-width:none`），≤560 / ≤80% 恒真，**没测到 agent 气泡**。回执称「35px typing 小块」不对。
2. hover 钮大概率走了 :104 注入分支；hover 后底 = elevated-hover（工单验收 1 第 2 条）**未断言**。
3. 截图名为「hover 住消息」，图上无动作钮。

## 修法
- 起会话照 `grok-shim.spec.ts:65` / `d1.spec.ts:100`：`patch: \`${PRESETS_PATCH}:${fakeOverlayPath()}\``，脚本化一条**长回复**（≥2 行宽文本，使 1280 宽下撞 560 上限、700 宽下撞 80% 分支）。
- 宽度断言定位 agent 气泡（`.sand-message:not([data-role="user"])` 或现成 agent 选择器），宽窗断言 `rect 宽 ∈ [555, 561]`（真撞上限，不是恒真的 ≤），窄窗断言 `≤ 转录列×0.8+1` 且 `≥ 转录列×0.8−20`。
- hover 钮：真实消息上 hover，`toHaveCount(≥1)` 硬断言，删掉注入兜底；补 `:hover` 后底 = `--sand-bg-elevated-hover` 求值。
- 附件 / 排队行注入保留（工单允许）。

## 边界
只动 `tests/e2e/t68-message-tokens.spec.ts` + evidence 截图。`p5-55-layout.css` 不动。

## 验收
（`cd /tmp/bot-wt/T68/app/ui && pnpm build`；`CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/t68-message-tokens.spec.ts`）
1. → 1 passed；先红：把 `:189` agent 气泡 max-width 临时改回 `560px`，窄窗格红（回执贴红输出后还原 cmp）。
2. 截图 `transcript-{light,dark}.png`：图上有 agent 长气泡 + 可见 hover 动作钮 + 附件卡。
3. `git diff --stat 96f176ab..HEAD` 只含 spec + evidence。

## 为什么这样验收
- 量一个本来就不受约束的 35px user 气泡，等于没验。宽窗断言改成「贴住上限」才能证明 560 分支真在起作用。
