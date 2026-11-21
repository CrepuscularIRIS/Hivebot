# Review · T21+T22（reviewer 6.1 Sol，2026-11-07）

范围：`docs/rebuild-p6-p5-plan..feat/T21`（T21 outline 侧板 + T22 主聊天只留首答终答）。
结论：HIGH 0 / MEDIUM 2（均已复现）→ 已由主 agent 修复并回归（commit d1e85205）。

| 严重度 | 位置 | 问题 | 修复 |
|---|---|---|---|
| MEDIUM | shim/src/data.ts:437 | reload 后未先进聊天、直接从菜单开非活动 bot 的 Full conversation 面板：outline 只读 `views.get(id)` 不启动 follow → 面板恒空「No conversation activity yet.」 | deps.outline 里 `!views.has(id)` 时 `openFollow(id)`（幂等）；快照到 → pushTranscript 同机推 outline 事件活填充。回归格 outline.spec ⑤（reload 后直接开有历史 bot 的面板 → 历史出现） |
| MEDIUM | tests/e2e/p6-fold.spec.ts:97-113 | D1 迁移丢掉 C 正文与展开全文的旧 oracle（expandAll 只展开 B；删掉 C 行 oracle 后测试仍 1 passed——覆盖削弱） | expandAll 恢复 B/C 双行：各自收起（aria-expanded=false）→ 点击展开 → detail 含全文 |

其余维度（A 过滤语义 / B T21 数据面与竞态 / C 测试咬合与空绿 / D 上游完整性）：查过，无发现。
reviewer 实跑：定向 unit 14 文件 198 passed；`renderer-grok check` → upstream diff=0（332 files）。
复现探针（reviewer 留档）：/tmp/bot-review-T21T22-probes/{unopened,c-oracle}.spec.ts。

修复后回归：unit grok-shim+fold 184 passed；outline.spec ①-⑤ + p6-fold D1/D2 全绿（7 passed）。

## 经理核实（manager Opus 5.5 · 任务 B · 2026-11-07 · HEAD d1e85205）

| 条目 | 核实 | 结论 |
|---|---|---|
| MEDIUM-1 data.ts outline 不启动 follow | 读 data.ts:437-442 修复代码；重跑 reviewer 探针 `unopened.spec.ts` → 1 passed | 成立，**修复属实**。但回归格 outline.spec ⑤ 空绿：⑤ reload 前没切走，目标 bot 是活动 bot、reload 后已被 follow（经理探针 `/tmp/bot-mgr-probe/p5.spec.ts` → `MGR_VIEW_PRESENT_BEFORE_OUTLINE=true`）。→ 修复单 **T21b**（只改测试） |
| MEDIUM-2 p6-fold expandAll 丢 C oracle | 读 p6-fold.spec.ts expandAll：B、C 各自 收起→点开→全文 | 成立，**已闭环** |
