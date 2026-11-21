# 2026-11-17 · 批 2：A1 草稿链（发送失败卡 + 草稿修订）

## Goal

HiveBot 聊天收尾第一批：发送失败可感知、可重试、可修订——对齐 Grok Bot 1.1.0 草稿域行为（RE-DRAFT-SEND-1.1.0.md 为规格）。

## Architecture / Tech Stack

- 规格锚：work/grok-1.1.0-re/RE-DRAFT-SEND-1.1.0.md（状态机+文案键组+切法已定稿）
- 实施位：app/ui/renderer-grok/shim/src/（数据层）+ overrides/modules/（UI 层）+ tests/（单测+e2e）
- 沿用 0.18 底座组件（frontend/src/recovered）+ 覆盖层模式；e2e 走 pnpm -C app/ui test:e2e（run-e2e.sh 守卫）

## Global Constraints

- 合并 --no-ff；e2e 前 build；隔离 HOME /tmp/bot-b2-*- 前缀；不用 pkill -f/sudo；每任务合并后定向回测记 work/LOG.md
- 文案以 1.1.0 英文基准句为准（键值见 RE 笔记）；iMessage/macOS 专属句映射为通用句
- 修订 diff 编辑器（added/removed/same）后置到下一任务，本批不做

## 任务

### B2.1 shim sendDraft 状态机（数据层）

Files: app/ui/renderer-grok/shim/src/data.ts, coordinator.ts, draft-send.ts（新）, tests/unit/grok-shim/b2-draft-send.test.ts（新）
- entry 增 draftSendState（sending/unconfirmed/refused）/draftSendRetry/draftSendInFlightUntilMs；1s tick 判定 unconfirmed 超时
- coordinator 面 sendDraft/discardDraft 两方法（deps 注入）
- 单测：refused 注入/超时转失败/discard 清态/retry 重发成功清态（rig 照 b1a 模式）
- commit: feat(b2.1): shim sendDraft 状态机

### B2.2 失败卡 UI + retry

Files: app/ui/renderer-grok/overrides/modules/draft-send-card.tsx（新）, composer.tsx, transcript 挂点, tests/e2e/b2-draft-send-card.spec.ts（新）
- 失败卡（Failed to send / Didn't go through / Unconfirmed 文案）+ Retry（under-card/actions 两 placement）+ Discard
- e2e：注入失败 → 卡可见 → Retry 成功卡消 → Discard 清态
- commit: feat(b2.2): 发送失败卡与重试

## Review Focus

1. tick 泄漏（组件卸载不清 interval）→ 单测断言 tick 清理
2. refused 与 sending+retry 分支混淆 → 单测分支矩阵
3. e2e 假绿（卡不弹因时序）→ 注入式失败 + toBeVisible 断言先行
4. 覆盖层遮蔽上游 composer 现有禁用逻辑 → composer.tsx readOnly 分支回归（连接器失效 spec 既有）
5. 文案硬编码无出处 → 每句注释 RE 笔记键名
