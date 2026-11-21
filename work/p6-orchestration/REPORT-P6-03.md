# REPORT · P6-03 D1/D2 DOM 验收（新 renderer）

> 主会话代录（builder 写报告被拦），2026-11-03

分支 feat/P6-03 @ 3a361ef（基 9c3f8a6）。单测 365/365 + e2e 64/64（含新 2 例）。

## 现状盘点（P5-51 已覆盖大半）
foldTurns 已在 shim serialize()（实时+分页双路）；fold 33 例+shim 形状单测+B7 开合+每类 entry 渲染均在。**缺口 1 处已补**：shim 未读 streamingAs——工具后流式正文被画成第 2 气泡违反 D1「进行中 ≤1」；entries.ts 5 行修复（streamingAs==='thinking' 时 live-stream 落 thinking 行），红基线（撤修复 D1 e2e 红：live thinking=0）。

## 新增
p6-fold.spec 2 例：D1 主链（进行中 ①tool running ②流式 B 落 thinking 气泡恰 1/结束后 [A,E]+3 tool+双 thinking 收起/E 恰现 1 次/展开全文/reload 重放）+无工具恰 1 气泡+兜底 (b)(c)(d)(e aborted)(f) DOM 格。(e)interrupted/cancelled 与 (g) 留 fold 单测（fake 造不出）。1a 前旧会话重放=同格式等价证据（渲染期改动零存储变更）。

## 备注
PLAN 验收命令 `-- p6-fold` 的 `--` 使过滤失效，单跑应为 `pnpm test:e2e p6-fold`。GU 材料 14 张（亮暗）+两品味项现状（逐行显示不合并/降级 thinking 露首行预览）。**OBS 范围外**：暗色下 composer 与 Plugins 按钮浅底字不清（疑 emulateMedia 过渡或真暗色问题）→ p5-parity 视觉。
