verdict: PASS
commit: 97d8cb95f9017ef9886f729916c229a2890d7380（feat/P5-12 @ /tmp/bot-wt/P5-12，基 32f2a1c；验收期间 HEAD 未漂移，worktree 干净）

独立复跑（HOME=/tmp/bot-vfy-p512，不信 builder 输出，全部自跑）：
- `pnpm -C app/{ui,sdk} setup` exit 0（/tmp/vfy-p512-setup-{ui,sdk}.log）
- `pnpm -C app/ui build` exit 0，产物 1.28s 构建完成（/tmp/vfy-p512-build.log）
- `vitest run`：**28 files / 237 tests 全过**（/tmp/vfy-p512-vitest.log），与申报一致
- `pnpm test:e2e`（run-e2e.sh，Xvfb）：**56 passed / 0 failed，5.5m**（/tmp/vfy-p512-e2e.log），含 visual-session 2 条新用例

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| ① thinking 行：fake reasoning → 独立行、0xf429 accent、11px/600、键鼠开合、aria；live「思考中」无空气泡；定稿「思考」 | PASS | e2e visual-session.spec.ts:56（本仓 97d8cb9 文件，53 号用例过）：同一帧原子取样 `{label:'思考中',bubbles:0,dots:0}`；定稿 count 1、非 live、label「思考」、气泡前独立行；鼠标 click + Enter/Space 开合、aria-expanded/controls 与 detail id 相等；icon textContent === U+F429、color === `--sand-text-accent-primary` computed、label 11px/600。截图 evidence/P5-12/vfy-thinking-{open-light,sep-light,sep-dark}.png |
| ② 分隔：899999/900000/跨日/缺时四态单测；e2e 首条上方恰 1 条、之间 0 条、几何 22±1 | PASS | 自跑 `vitest run tests/unit/session/markers.test.ts` 13/13 绿；抽读断言：Δ=899999 两行 0 分隔、Δ=900000 出 1 条（含等号）、跨 0 点 60s 出、缺时不触发也不更新 prev、首条恒 1 条。bundle 锚点实证：@1734517 `var emt=9e5` 属实；`function vmt` 实际在 @1739294（`n>=emt||!HR(r,i)`，与实现逐语义一致）。e2e：全流 `[data-time-sep]` 恰 1 且 nextSibling 是「问题一」、`今天 \d\d:\d\d`、gap(sep,first)=22±1、sep 顶=chat-col 上内边距 28±1 |
| ③ 未读线：切走→新到→切回恰 1 条在首条未读前、停留不动、再回 0 条；超一屏滚到线（修复后 build） | PASS | e2e 54 号用例过：切 main → X 收「第二轮回复」→ 切回 `[data-unread-line]` count 1、跳过 time-sep 后 next 是「第二轮回复」；线距视口顶 28±2（不贴底，60 段长文超一屏）；停留期 send「三」线不动不长第二条；离开再回 count 0；首进无基线 0 条。滚动修复在验：build 后产物 `out/renderer/assets/index-*.css` 实含 `grid-template-rows: minmax(0, 1fr)`（grep 实证），e2e 跑的正是这份 build |
| ④ 亮暗两套数值断言 | PASS | e2e 两用例各含 THEMES 循环：sep（11px/center/margin 0/tertiary token 色）、icon（accent token 色 + cursor-icons）、label（11px/600/label-secondary）、行（min-height 34px/padding 7px 9px）、unread（11px/gap 10px/margin 0/accent token 色），亮暗各断言一遍 |
| ⑤ 区域：diff 恰 7 文件、app.css 恰 1 行（追认） | PASS | `git diff 32f2a1c..97d8cb9 --stat` 恰 7 文件：reduce.ts、Conversation.tsx、session.css（新）、store.ts（import/字段/初值/markRead 四处）、app.css、markers.test.ts、visual-session.spec.ts。app.css 为 1 行功能改动（`.shell` grid-template-rows）+1 行同 hunk 注释（无行为，见注记 2）；store.ts 与申报行列一致 |
| ⑥ 红基线：SEP_GAP_MS 改 60000 必红、恢复绿 | PASS | sed 改 900_000→60_000 → markers.test.ts **2 红**（阈值断言 + 899999/900000 边界断言）；`git checkout` 还原 → 13/13 绿，worktree 干净 |

截图核验（2026-10-28 规则）：本环境 Read 图片仅回 CDN 引用、视觉 MCP 不可用，改用来源+像素双重核验：5 张截图均为**我本轮 e2e** 的 `page.screenshot` 产物（只含 Electron 页面内容，物理上拍不到桌面），02:50 复制带 vfy- 前缀存 evidence/P5-12/。像素实证：1280×820（=spec setContentSize）；亮图底 (255,255,255)、暗图底 (22,22,22)；unread-light 在 row 74（=视口顶+28）有全宽 accent 细线 (170,204,240)、中心 745-799px 文字断口（居中「新消息」）；sep-light 在 rows 70-77 有居中 ~54px 短文本簇（今天 HH:MM）；open 图内容行 123 < sep 图 185，与「open 在第二轮消息前拍、sep 在其后拍」的用例时序吻合。结论：截图确为被验收界面。

新问题（每条一行，可直接成为修复任务）：
- [FIX] markers.test.ts:3 与 reduce.ts withMarkers 注释的 vmt 锚点 @1739705 实际落在 unread-divider 拼接代码上，vmt 函数真实偏移 @1739294 | 复现：python 提取 bundle 两偏移字节对比 | 疑似位置：app/ui/tests/unit/session/markers.test.ts:3、app/ui/renderer/plugins/session/reduce.ts:232 | 严重度 low（语义实证成立，仅注释偏移 ~400 字符不准，P5-16 前顺手修）

注记（不阻断）：
1. 已知上限与申报一致：未读线不持久化（重启不出线）、live→定稿换一次节点、thinking 字形未进 theme 图标表（留 P5-16）——定稿明示，非遗漏。
2. app.css 追认口径：PLAN 修订写「一行越区」，实际 diff 是 1 行功能 + 1 行纯注释（同 hunk、零行为）。按追认意图判 PASS；若从严按「字面恰 1 行」需主会话表态。
3. chunkCount 口径（reasoning-delta 不计入）有单测锁定（markers.test.ts:88-100），既有 e2e 的 text chunk 计数不受影响。
