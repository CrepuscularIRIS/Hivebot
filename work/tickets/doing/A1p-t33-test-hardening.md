# A1p：T33 测试加固三小件（机械单，T33 终验遗留提议转实体）

> 开单：main（纯机械测试加固，跳过立项）| 日期：2026-11-08 | 施工：main (GLM 5.3)
> 来源：queue A1p 行（T33 终验「不挡合并」遗留）
> 分支 / 作业目录：集成分支直接改
> claimed：2026-11-08 03:0x main (GLM 5.3)
> accepted：

## 三件
1. live ④ 确定性化：subagent 轮后**等 helper 进 list**（轮询 session/list 至 4 项，≤15s）再让 A 发一轮断言 system/message 的名册不含 helper title——消「两跑一红」竞态（M4 删名册滤后此格必红）
2. 删 ④ 的 `not.toContain('help')` 空断言（systems=0 时 text 恒 '[]' 恒过；有 system 时必撞正文 "helper" 误红）
3. 挂载滤补格：mock agent 带 `session.header.origin='subagent'` → 不挂 section（product-prompt.mjs 挂载滤现在无测试守）

## 先红
- 件 3：先写格（现在没有）→ 跑——绿（滤已在）——**先红用 M4 刀**（删名册滤→④确定性化后必红，一石二鸟）
- 件 1 的红=M4 刀同一次跑出

## 验收
- vitest run awareness-prompt.test.ts awareness-prompt-live.test.ts 全绿
- M4 刀（awarenessText 名册滤行删掉）→ ④红 + ①b 红；还原复绿
- 回执 receipts/A1p.md 原样输出
