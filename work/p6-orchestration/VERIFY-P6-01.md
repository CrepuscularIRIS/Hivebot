# VERIFY · P6-01 三段式折叠纯函数

verdict: PASS
commit: c43dcaabed17d0d21d73ecf92a05425e1ef90570（基 5b4b16e，worktree /tmp/bot-wt/P6-01，验收时 HEAD 一致、树干净）
验收日期：2026-11-03 · 验收员独立复跑（HOME=/tmp/bot-vfy-P6-01/home，app/ui + app/sdk 均先 `pnpm setup`）

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| 独立复跑：`vitest run tests/unit/fold` 33 例 | PASS | 实跑 `Tests 33 passed (33)`（evidence/p6-01/vfy-commands.txt [3]） |
| 独立复跑：全量 29 files / 278 tests | PASS | 实跑 `Test Files 29 passed (29) · Tests 278 passed (278)`（vfy-commands.txt [4]） |
| 独立复跑：`pnpm build` | PASS | `✓ built in 1.57s`（vfy-commands.txt [5]） |
| PLAN ⑥ tsc 无新错误 | PASS | head 与基点 5b4b16e（detached worktree 对照）输出 diff 为空，TS2688 @types/node 为存量（vfy-commands.txt [6]） |
| ① D2 七格抽读非空转：(f) 两变体 | PASS | turn-fold.test.ts:87-99——(f)1 断言 reasoning id `t1-s0-r` 仍 thinking/from:'reasoning'、0 气泡、(d) notice 触发；(f)2 断言 (c) 升的是正文 `t1-s1`→message result 而 reasoning 不动。两变体都落到具体 id/kind/from，非空转 |
| ① (g) 拼合重算 | PASS | test.ts:101-110——片段页（hasMore）断言 0 气泡、两段正文全进 thinking(from:'text')、无 (d)；拼合更早一页后重算：ack 气泡 + T2 result、T1 仍 thinking。语义是重算不是缓存 |
| ① (e) 三枚举 | PASS（带注记） | test.ts:77-85 三个用例输入同形——reduce.ts:97-99 在 fold 之前就把 aborted\|interrupted\|cancelled 合并为同一条 muted「已停止」，fold 层无输入差异可测；断言本身是真的（source:'reduce' 透传、尾段不升、仅 ack 气泡）。builder 已主动披露，非偷懒 |
| ② 不变量抽验：混合输入亲调 foldTurns | PASS | 验收员自造 fixture（3 回合、reasoning/正文/工具交错、含全程无正文回合），6/6 绿：每 id 恰现 1 次、reasoning 恒 thinking(from:'reasoning')、(c) 升正文非 reasoning、(d) fold notice、streamingAs=thinking（evidence/p6-01/vfy-invariant.test.ts） |
| ③ 红基线：(d) 条件去掉 → 红，恢复 → 绿 | PASS | 副本（sha256 同 worktree）把 turn-fold.ts:84 改 `const emptyNotice = false`：恰 2 红——(d) 用例与 (f)1（其断言 (d) 触发），31 绿；恢复后 33 绿、sha256 复核一致（vfy-commands.txt [7]）。worktree 全程未被改动 |
| ④ 恰 2 新文件、reduce.ts 未改 | PASS | `git diff 5b4b16e..c43dcaa --name-status`＝A×2（turn-fold.ts、turn-fold.test.ts）；reduce.ts diff 0 行；`renderer/plugins/` 零改动（vfy-commands.txt [1][1b]） |
| ⑤ ponytail 注释在位 | PASS | turn-fold.ts:25-28——写明决策 6 上限（无 user 触发、首条目为工具的回合归上一段，污染兜底判定）与闭合路径（P6-12，reduce 加 turn 字段，签名不变） |
| 坏路径（额外） | PASS | 空 items 不崩（输出空、streamingAs=message）；工具开头无 user + hasMore → 片段段不出 (d)，与 ponytail 上限一致（evidence/p6-01/vfy-badpath.test.ts，3/3 绿） |

新问题（每条一行，可直接成为修复任务）：
- 无阻断项。

非阻断观察（不构成本任务 FAIL，供派发参考）：
- [OBS] (e) 三枚举的枚举级回归防护在 reduce 侧缺位：`tests/unit/session/reduce.test.ts` 只直接测了 `aborted`，interrupted/cancelled 仅靠 reduce.ts:98 单行三合一覆盖——若上游改这行，现有测试网抓不住。建议在 reduce 测试补两枚举（归 P5-12 域或立小任务），严重度低。
- [OBS] 验收探针首跑的 1 红是验收员 fixture 错（running:true 误期望回合三升 result），实为「只有 completed 升级」守卫正确工作的证据，已修正后 6/6 绿。
- [OBS] builder 自报两条品味项（(c) 升级停原位不贴回合尾；多段正文不合并）保持转 GU。
