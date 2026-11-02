verdict: PASS
commit: cadf6db336ec50472e5ad262d29687b028d3b786（worktree /tmp/bot-wt/U-22，4 commits：ab1dd28/7074e44/b396645/cadf6db；验收期间 HEAD 未漂移）

验收环境：worktree 干净状态亲跑（不信 builder 输出）。build（vite 1.06s）→ 单测 21 files **193/193**（2.90s）→ e2e **40/40**（3.8m，workers=1，HOME=/tmp/bot-u22-vfy）全绿。resilience 4 坏路径测试（注入全抛 / 杀 runtime SIGTERM / socket drop / reload）即本任务的坏路径验收。

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| ① GU-1 main try/catch + api() 兜底 + 注入 E2E | PASS | `app/ui/main/m1-api/index.ts`（rpc 全路径 try→`{ok:false,pbots/unavailable}`，R10 pending 保留）；`store.ts` api() `.catch` 兜底；单测 `tests/unit/m1/api.test.ts`（3 条新 + R10 回归改写）；E2E `resilience.spec.ts:12`（PBOTS_THROW_API=all：session/list 调用记录 ≥3 = 封面重试循环活着、封面可见、renderer 事件循环活）、`:28`（create-after-first：按钮脱离「创建中」、错误可见、对话框可关） |
| ② GU-2 草稿保留不覆盖 | PASS | `Conversation.tsx:74-80`（失败时 `drafts[id]===''` 才恢复，否则原文进错误提示）；E2E `resilience.spec.ts:49` 亲跑 1.1m **真实 30s rpc 超时**（杀 runtime）：等待期有新输入 → composer 保持「等待期的新输入」、错误提示含原文；无新输入 → 草稿恢复、无「草稿已有新内容」后缀；未发出 user 气泡 0 |
| ③ GU-3 停止复位 | PASS | `Conversation.tsx:97-101`（cancelTurn `.then(!ok)` + `.catch` 双路 `setStopping(false)`）；E2E `resilience.spec.ts:80` 亲跑 33.1s（真实超时路径）：stop 按钮 enabled 复位 + 「停止失败」提示 + 可再点 |
| ④ GU-4 重连重拉 roster | PASS | `store.ts:137-152`（每代 socket open → `refreshRoster`；只 merge 已在 order 的行 R9；running 回落置未读、不扰 selected）；E2E `resilience.spec.ts:101` 亲跑：reload → `testDropSocket` 真断链 → 放 gate → 重连后 `data-running` 消失（20s 内）+ 切回 X 完整定稿「x-流式第一段 x-流式收尾」+ streaming null；截图亲验 `evidence/PAB/gu4-reconnect-roster.png`（亮色，侧栏无任何 bot 带「回复中」指示，无 offline bar） |
| ⑤ markdown（shiki@4.6.0、skipHtml、链接门控、图片零请求、D2 tap 计数） | PASS | lock 锁定 `shiki@4.6.0` / `react-markdown@10.1.0`（pnpm-lock.yaml 精确解析）；`Markdown.tsx`：`skipHtml` + 无 rehype-raw + 无 dangerouslySetInnerHTML（代码核对）、`a` target=_blank 走 U-00 `setWindowOpenHandler` 门控不另写拦截、`img` 不挂载只出 alt；`highlight.ts` 双主题（亮 color 内联 / 暗 `--shiki-dark`）+ `app.css:202` `html[data-theme='cursor-dark']` 切换。E2E `markdown.spec.ts:16`：strong/pre code/a[href] 各 1、行内 code 不进高亮块、`.hl-tok` 可见且 computed color 是 rgb、img count 0、innerText 无 `<img`/`evil.example`、点击外链 getURL 仍 `pbots-app://app/`、窗口数 1、openExternal 桩收到 `https://example.com/`。截图亲验 `evidence/PAB/markdown-dark.png`（暗色主题：粗体「加粗结论」、代码块彩色 token、链接「示例链接」、列表甲/乙——暗色下 token 有色 = --shiki-dark 生效）。**D2 口径复核（探针实测，/tmp 跑后即删）**：同一 A 流 `downlink.items=24`（全 item 帧含 block-start/end 等）≠ `downlink.streamChunks=4` === renderer `chunkCount=4`——证实「wire chunk 帧含非正文增量」，text-delta 过滤口径必要且正确，`d2.spec.ts:59` 断言集合 [1,1,K] 精确等值。**未知语言回退（探针实测）**：\`\`\`python（不在 LANG_ALIASES）→ `pre code.plain` 纯文本、零 hl-tok、内容完整、不阻塞定稿 |
| ⑥ D4 终态 + 链接回归 + aborted | PASS | `d4-deadline.spec.ts`：`PBOTS_APPROVAL_DEADLINE_MS=2500` → `closeEvents()` renderer 离场 → `stats.deadline.answers===1`（可证伪）→ 行 `[data-decision="rejected"]`「已拒绝」+ `data-status="failed"` + 卡收掉 + 末气泡「已按拒绝处理。」+ canary 全程不存在（待决期与终态双时点断言）。截图亲验 `evidence/PAB/d4-deadline-rejected.png`（⛔ Bash touch canary-d4 行 + 已拒绝、无审批卡、末气泡「已按拒绝处理。」）。链接回归在 markdown.spec（上表⑤）；aborted：`markdown.spec.ts:73` stop → 「已停止」notice + `endReason === 'aborted'`（+4 精确等值）+ streaming 气泡消失。D1 在产品页保持绿：`d1.spec.ts`（头注释：U-21 ② 起改走产品页对话框）在全量 40 内通过 |
| ⑦ 全量 | PASS | 亲跑输出：`Test Files 21 passed (21) / Tests 193 passed (193)`；`40 passed (3.8m)`；e2e 一律生产 build |

## 区域例外裁定：m2-mux/index.ts 加 `M2Stats.downlink.streamChunks` —— **追认**

PLAN U-22 派发区域是 `renderer/plugins/session/ + tests/e2e/session*`，m2-mux 属 U-12 区域。裁定追认理由：① PLAN 验收 ② 明文要求「main tap 计数 A 的 chunk === K」，而既有 tap 面（`downlink.items` 按 item 帧计数）口径不同——本验收探针实证 items=24 ≠ K=4，不扩展观测面该断言无法成立，扩展是完成验收的必要手段；② 改动为纯增量观测（接口加 1 字段 + 7 行只读计数 + 注释），不触转发/路由/所有权逻辑，U-12 既有单测全绿（193/193）证明零回归。合并时把 `app/ui/main/m2-mux/index.ts` 列入 U-22 文件清单即可。

新问题（每条一行，可直接成为修复任务）：
- [FIX] shiki 未知语言回退无正式测试覆盖（本验收用临时探针实测通过后即删）| 复现：fake 回复带 ```python 代码块跑 markdown e2e 无对应断言 | 疑似位置：app/ui/tests/e2e/markdown.spec.ts | LOW
- [FIX] D4③ 副作用文件断言为两时点（待决期+终态），非 PLAN 字面「每 10s」；窗口压 2.5s 时语义等价，但生产 20s 窗口的中间段无监控 | 复现：跑 d4-deadline.spec 观察断言位置 | 疑似位置：app/ui/tests/e2e/d4-deadline.spec.ts | LOW
