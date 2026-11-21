verdict: PASS
commit: d6809bf96b17b50857c0330d39791a6305dea2d4

独立复跑环境：worktree /tmp/bot-wt/P5-58 @ feat/P5-58，干净检出 d6809bf，自跑 `pnpm build` 后全部实测（LEARNINGS：改源码必须先 build 再 e2e）。临时 HOME=/tmp/bot-vfy-p558*，报告与探针证据在主仓 evidence/（探针 spec 在 /tmp/bot-vfy-p558/probe/，不污染 worktree）。

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| ① ui vitest 367 | PASS | `cd app/ui && pnpm test` → Test Files 33 passed, Tests 367 passed（2026-11-03 23:07 复跑输出） |
| ① theme-dual.spec 单跑 | PASS | `pnpm test:e2e tests/e2e/theme-dual.spec.ts` → 1 passed (8.5s)（自 build 后跑，非旧 dist） |
| ① 全量 e2e 65 | PASS | `pnpm test:e2e` → 65 passed (7.4m) |
| ① sdk 全量 305 | PASS | `cd app/sdk && pnpm test` → 37 files, 305 passed (81s) |
| ② settle 结论复核 | PASS（机理主张见 OBS-1） | 探针 CDP `Page.captureScreenshot` 零稳定化立即截图 ×10（evidence/P5-58-vfy/probe-immediate-{0..9}.png，ffmpeg YAVG 全=31=settled-dark）vs settle 后（probe-settled-dark.png YAVG=31，probe-settled-light.png YAVG=232）。暗色无对比度缺陷：cmp-composer.dark.png（深底 #2a2a2a+近白「草稿」+浅底深箭头发送钮，亲算 15.12）与 cmp-plugins-entry.dark.png（深底浅字 Plugins，15.12）均视觉确认无浅底浅字；P6-03 OBS 两指认部件在 settle 后无缺陷 → OBS=假象定性成立 |
| ③ 市场默认挂载亲验 | PASS | 探针（launchProduct 不链 MARKET_PATCH、不设 P2SDK_MARKET_INDEXES）：runtime 层 `rt.client.call('pluginMarket/listIndexes')` → `OK []`（非 404）；`p2temp/preset.ensure` → 业务错误 `p2temp/connector-unavailable`（方法路由成功=p2temp 在默认链）；UI M1 `api(page,'pluginMarket/listIndexes')` 非 404/白名单拒，到达 gateway（参数形状报错归 P5-57 UI 面，见 OBS-2） |
| ④ 置顶落盘 | PASS | 真实 UI 旅程：右键 T58V-Zeta → Pin → 顺序 ["Alpha","Zeta"]→["Zeta","Alpha"] → `page.reload()` → 仍 ["Zeta","Alpha"] 且行菜单显示 Unpin（探针 console 输出 + probe-settled-dark.jpg 视觉确认 Zeta 第一）；损坏值回 [] 由单测 desktop.test.ts 覆盖（含在 367 内） |
| ⑤ WCAG 抽 5 值亲算 | PASS | evidence/P5-58/contrast.tsv 抽 7 组（任务要 5）：侧栏条目名 light 15.63/dark 17.71、Plugins 药丸 dark 15.12、正文链接 light 4.94/dark 6.64（全表最低 4.94 ≥4.5）、审批卡命令 dark 16.6、composer 编辑器 dark 15.12——独立按 WCAG 公式重算全部与申报值一致（MATCH，误差<0.01） |
| ⑥ 区域 6 文件 | PASS | `git diff --stat d24cf6c..d6809bf`：恰 6 文件（sdk/src/start.ts +6、connectors.test.ts、start.test.ts、shim desktop.ts、theme-dual.spec.ts +234、desktop.test.ts +20），与申报一致；无区域外文件 |
| ⑥ connectors.test ③ 语义 | PASS（合理） | 读新断言：旧「market 挂载 vs bare 差集恰 2 个 p2temp」在 market.yml 进默认链后两侧同集必红；新断言=默认链(bare) p2temp 恰 2 + bare 含 pluginMarket/* + market 挂载侧对 bare 差集空——把「挂载增量」语义升级为「默认链锁定 + 显式再挂载零副作用」，强度不低于旧断言，且正是 P5-58 的功能主张 |

## 视觉确认记录（截图亲验，非全屏、仅应用窗口）
Read 在本会话不呈现图片（仅回传 CDN 链接），改用 analyze_image 对 CDN 链接核验并交叉像素统计：probe-settled-dark.jpg = 整窗暗色、左栏 3 条目（TSBV-Zeta[OCR 小误差]=T58V-Zeta 第一/置顶恢复、Alpha、New chat）、Zeta 行 Unpin 菜单、composer 占位 "Message T58V-Zeta"、无不可读缺陷；cmp-composer.dark.jpg = 深底输入条 + 「草稿」近白字 + 发送钮；cmp-plugins-entry.dark.jpg = 深底浅字 Plugins 药丸清晰。视觉模型称「草稿字对比度不高」系 44px 裁片误判，亲算 15.12 推翻。

新问题（每条一行，可直接成为修复任务）：
- [OBS] settle 机理主张「立即截图拍到旧亮帧」未复现：CDP 零等待立即帧 10/10 已是新暗帧（YAVG 31=稳态暗帧），旧帧窗口若有亦 <1 次协议往返 | 复现：probe vfy-p58.spec.ts 循环 emulateMedia dark→CDP 立即截图 | 疑似位置：app/ui/tests/e2e/theme-dual.spec.ts settle() 注释 | 严重度：低（settle 是无害防御，不产生假绿；仅注释里的机理表述缺直接证据）
- [OBS] UI M1 直调 `pluginMarket/listIndexes` 到达 gateway 但参数形状报错（无参→"exactly one plain-object args field"，{request:{}}→"unexpected request"）；runtime 层 `rt.client.call` 无参即 OK | 复现：探针 [vfy-market] 两行输出 | 疑似位置：shim M1 api 通道的 remote 方法参数封装（P5-57 市场面域） | 严重度：低（P5-57 做 UI 面时需对齐形状，先记在此）
