# VERIFY · P6-03 D1/D2 DOM 层验收（新 renderer）

verdict: PASS
commit: 3a361ef480fdd7ad39bd1f3ff038b4af129c492e（基 9c3f8a6，worktree /tmp/bot-wt/P6-03，验收全程 HEAD 未漂移、树干净、结束时复核一致）
验收日期：2026-11-03 21:44–22:04 · 验收员独立复跑（HOME=/tmp/bot-vfy-P6-03/home；命令与输出尾部全录 evidence/P6-03-vfy/vfy-commands.txt）

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| 安装+构建从干净态 | PASS | ui+sdk `pnpm install --frozen-lockfile` 均 Already up to date；`pnpm build` ✓（e2e 前自建 dist，LEARNINGS 2026-11-03） |
| ① `pnpm test:e2e p6-fold`（无 `--`）自跑 2 例 | PASS | 实跑 2 passed (19.8s)，过滤生效只跑 p6-fold 两例（vfy-commands.txt [4]） |
| ① vitest grok-shim+fold 含新 2 例全绿 | PASS | 7 files / 102 tests 全绿；`-t "流式落点"` 按名确认新增 2 例通过（[3][3b]） |
| ① 全量 e2e = 64 | PASS | `64 passed (7.1m)`（[5]）；全量单测 365/365 也复核绿（[6]） |
| ② 红基线：撤 entries.ts streamingAs 修复 → D1 红 | PASS | 还原 9c3f8a6 版 + rebuild → 2 例全红，红点正是 streamingAs 断言（:128 live thinking 行 count 0、:229 (e) 尾段 thinking 0）；恢复（sha256 与备份一致、树 0 改动）→ rebuild → 2 passed（[7][8]，无 stash，备份+checkout 法） |
| ③ 断言抽读：进行中恰 1 气泡（含 gate 卡流式段） | PASS | spec :121-123 t1 卡审批时 tool running + 气泡恰 1；:127-130 B 流式被 gate 时 live thinking 行恰 1、气泡 ≤1（BRIEF D1 原文即「进行中 ≤1」）、live-stream message 行 0。红基线证明这两处断言真咬合 streamingAs |
| ③ (c) 移动非复制 | PASS | spec :199-200 bubbleTexts==['收到。','中间结论 B…'] 且 thinkingRows==0——B 在气泡、thinking 行清空，非复制 |
| ③ (d) 0 气泡+notice | PASS | spec :214-216 notice 含「已完成，没有文字结果 · 展开查看过程」恰 1、assistantRows==0 |
| ③ reload 重放段在 | PASS | spec :141-145 page.reload() 后 assertD1Ended+expandAll 全套复跑；实跑绿（[4] 用例 1 内） |
| ④ 区域：产品改动恰 entries.ts 5 行 + 测试 | PASS | `git diff 9c3f8a6..3a361ef --stat`＝entries.ts 5 行（+4/−1，streamingAs==='thinking' 时 live-stream 落 thinking 行）+ p6-fold.spec.ts 新增 254 行 + entries.test.ts +17 行，共 3 文件 |
| 坏路径（本任务最相关：撤修复，即派发点 ②） | PASS | 见 ②；(b) turn/end error 与 (e) abort 的 DOM 坏路径本身在用例 2 内实跑绿 |
| 独立内容确认（verifier 自写断言+DOM dump，不经 builder spec） | PASS | evidence/P6-03-vfy/probe.spec.ts 实跑 1 passed：同一 D1 事件脚本重放，innerText 逐项＝用户行→A 气泡→Bash→Thinking B（收起仅首行预览）→Read×2→Thinking C→E 气泡恰现 1 次（probe-transcript.txt / probe-aria.txt / probe-ended.png） |

新问题（每条一行，可直接成为修复任务）：
- 无阻断发现。

非阻断观察（不构成本任务 FAIL，供主会话/GU 参考）：
- [OBS] PLAN P6-03 验收命令写的 `pnpm test:e2e -- p6-fold` 中 `--` 会使 pnpm 过滤失效（跑成全量）——builder 已在报告披露；建议下次修订 PLAN 时顺手更正为无 `--` 写法。位置：work/p6-orchestration/PLAN.md:40。
- [OBS] 截图视觉核对通道：本验收会话 Read 仅返回 CDN 链接、analyze_image MCP 三连 1210，无法直接看图。已用两条独立文本通道替代确认（probe innerText + ARIA snapshot，另像素统计证非空白、亮暗主题真实切换），spec-run 14 张亮暗截图已归档 evidence/P6-03-vfy/spec-run/ 供 GU 轮有视觉的席位核看。此为验收环境限制，非交付缺陷。
- [OBS] builder 报告披露的暗色 composer/Plugins 按钮对比度问题与两条品味项（收起态逐行显示、降级 thinking 首行预览）归 GU 1 轮，不在本验收范围。
