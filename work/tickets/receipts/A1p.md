# A1p 回执：T33 测试加固三小件（2026-11-08 03:1x）

提交：随本回执 commit（件3 挂载滤格+件1/2 ④确定性化同一提交）。

## 三件落点
1. **④确定性化**：subagent 轮（断言 `started subagent <id>`）→ 轮询 session/list 至 helper 出现（带 origin/parentSessionId，≤15s）→ rename Bravo 触发名册变化 → A 新一轮 system/message **必重发** → 断言含 `Bravo2-T33`（现取健康）且**不含 helper sid 前 12 位**（滤守卫）——消「两跑一红」竞态
2. **删空断言**：`not.toContain('help')`（systems=0 时恒 '[]' 恒过、有 system 时必撞正文 "helper"）已删，由 helper sid 断言替代
3. **挂载滤格**：mock 三 agent（普通/header.origin='subagent'/header.parentSession）→ 恰 1 段挂上

## 验收原样
```
awareness-prompt.test.ts：11 passed（+挂载滤格）
awareness-prompt-live.test.ts：3 passed（④确定性化版）
M4 刀（删名册滤 roster0）：✘ 1 failed——红在 ①b 'not to contain - "helper"'（helper 入名册被咬）；还原 → 14 passed
```
注：M4 先红在 ①b（纯函数格）而非 ④——两格同守名册滤，先红者挡（与 T33 M3/②③ 同口径，冗余守卫）。
