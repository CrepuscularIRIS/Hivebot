# VERIFY · P5-57 市场 / 配置 / 停止钮 / 启动封面（新 renderer 承载）

verdict: PASS
commit: 984cce8f165b99486838f6e4d45b52d03d6c4d8a74（feat/P5-57 @ /tmp/bot-wt/P5-57，基 b0e0b25；验收时 worktree 干净、HEAD 与申报一致）

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| ① 干净复跑：两包 build | PASS | `pnpm -C app/ui build`（electron-vite + renderer-grok：frontend ✓ 981ms + shim.iife.js 36.17 kB）成功 |
| ① vitest 376 | PASS | 独立复跑 `pnpm -C app/ui test` → `Test Files 34 passed, Tests 376 passed (376)`（evidence/P5-57-vfy/vitest-full.txt） |
| ① 全量 e2e 65（Xvfb） | PASS | `pnpm test:e2e` → `65 passed (8.0m)`（evidence/P5-57-vfy/e2e-full.txt；`--list` 确认 market.spec×2 / boot-cover×2 / d10b-d7×2 在内：e2e-testlist-relevant.txt） |
| ① renderer-grok check | PASS | `pnpm -C app/ui/renderer-grok check` → `upstream diff=0: 332 files`，exit 0 |
| ② 市场 UI 亲验（列表/搜索/预览条） | PASS | playwright-cli attach CDP 9333 亲驱真实 Electron（Xvfb，页面级截图=仅目标窗口）。列表：`Showing 50 of 111`，单组件行 `<li>`+`Open {name}` 钮（图标+名称+副题）+ trailing 态，browse 行 0 个动作钮 + `Not available`；搜索 `filesystem`→`Showing 11 of 11`、FS 行 installable+`Connect`；无果 `No plugins match "zzqqxxnomatch"`+Clear search；Your plugins 预览条计数 1→（装后）2，`PREVIEW_MAX=4`（market-surface.tsx:20,67 ≤4 图标+计数+chevron12）；已装列表视图 pretrip `✓Connected` + Back `Back to Marketplace`。截图 shots/02,03,04,05 |
| ② Connect 旅程 | PASS | 亲点 local 源 Demo connector Connect → 按钮即时 `Connecting…`（截图 07，视觉确认）+ 另一可装条目 Connect disabled（全局串行）→ 完成后行 `installed`+`✓Connected`（截图 08）、#16 重拉计数=2 |
| ② 用它新建 X（预勾）+ 实调工具（答审批卡） | PASS | 详情 `New bot with this app` → 对话框预勾 `@bot-u23/demo-connector`（checked=true，pretrip 未勾）、preset 单选 6 项、Create（截图 09,10）→ 建成市场关、单 active、新 session。实调：我 hands-on 用 demo 连接器的 `mcp__demo__ping`（read_file 属 FS wrapper，我连的是 demo 源）：审批卡「Allow Grok Bot to run this on your computer?」→ Allow once → 工具行 done、结果 `pong`、终稿「demo ping 调用成功」（截图 13,14）；read_file 全链（含 wrapper 名/X-Y 工具表/enabled:false）由 market.spec ②③ 在我复跑的 65 里覆盖（截图 11 为我首次 read_file 尝试的审批卡——该轮工具点名错误故行状态 failed，系我脚本失误非产品缺陷） |
| ② browse-only Not available（截图） | PASS | 行 `data-kind=browse`、无动作钮、`.pb-status`=Not available（shots/02 局部 + market.spec ① 断言同款在 65 内） |
| ③ 新建对话框：取消不建 / preset+连接器 / 失败复位 | PASS | 取消：亲按 Esc → 对话框与市场关、bots 仍 1（不建不报错）；preset+连接器：亲读对话框 DOM（见上）；失败复位：d10b-d7 D7 `failNext 真实 UI 报错` 定向抽跑 ✓ |
| ④ 停止钮 + 封面三态 | PASS | session.spec 定向抽跑 ✓（`会话头 Stop → aborted → 可继续` 4.6s）；亲测空闲态无 Stop 钮（`stopIdle:false`，运行中才出现）；boot-cover.spec 定向抽跑 2/2 ✓（就绪淡出+空态 / 引擎不可达 Starting→Still connecting→Couldn't connect+Reload）。evidence/P5-57-vfy/e2e-targeted.txt 8 passed |
| ⑤ R-04 文案 5 处 | PASS | r4-i18n-decode.json 对照 + 亲验 live：iSLIjg=`Connect`（按钮亲见）、QHcLEN=`Connected`（✓徽标亲见，check12+文字）、0BvlbM=`Not available`（browse 行亲见）、S4qZX0=`Search plugins`（placeholder 亲见）、R7wvKw=`Back to Marketplace`（aria-label 亲见）；另 JrFTcr=`Connecting…` 亲见；mLyVIn/ZyWE2h 空态亲见 |
| ⑥ 对照台：app 列 market 三联 + open=0 | PASS | 分支内 evidence/compare：pairs/market.{light,dark}.png 存在（984cce8 tree 实核），singles/market.*.app.png 由 app-column.spec.ts:149-156 新增截图逻辑生成；u1-appref.tsv 91 行全部 waived（computed-equiv 10 / data 16 / subpixel 12 / arch 40 / fixture 12 + 头行），无 open 行；run-summary.md「app-vs-ref 处置…无 open 键」 |
| ⑦ 区域 vs 申报 | PASS（含交叠记录） | 代码改动 27 文件全在 app/ui/renderer-grok/{overrides(10),shim(7)} + app/ui/tests(10)，与申报一致；上游树 diff=0。**与 P5-58 在途交叠**：①shim/src/desktop.ts（P5-57 仅 +2 行 onFocusAgent 选项，b0e0b25→984cce8 diff 已核）恰在 P5-58 指定区域内；②overrides/p5-57.css 新文件落在 P5-58 的 overrides/*.css 域——合并任一支前按 LEARNINGS 2026-11-03 规则对 desktop.ts 做三方合并核对 |
| 附：坏路径 | PASS | 两条：boot-cover ② 引擎不可达→Couldn't connect+Reload（定向 1.0m ✓，断网类）；d10b-d7 D7 创建失败→真实 UI 报错 ✓；另亲测对话框取消不建 |

## 亲验方法备注
驱动脚本 evidence/P5-57-vfy/（vfy-barrel.ts + driver.cjs）：`vfy-barrel.ts`（复用 e2e support）+ esbuild 打包 + `driver.cjs`（serveMarket + SDK mock runtime + 预装 pretrip + 生产 build Electron `--remote-debugging-port=9333`，命令文件循环下发达 writeScriptCalls）。截图 15 张（shots/01-15，均页面级=仅目标窗口）经视觉模型逐张确认内容与 DOM 探针一致（例：02=Connect Apps 模态+单组件行+Your plugins 1；07=Demo connector 行 Connecting…；08=✓Connected+计数 2；10=预勾对话框；11/13=审批卡 Allow once/Deny once；14=ping→done/pong/终稿；15=Configuration/Model/Main bot 三段带锁图标）。驱动 exit 0 CLEAN，临时目录全清扫（进程零残留，pgrep 核）。

新问题（每条一行，可直接成为修复任务）：
- [NOTE] ping 审批卡命令描述显示开发期占位文案「p2sdk policy: connector tools require user approval (metadata bridge pending)」直接露给用户（read_file 卡显示路径正常） | 复现：装 demo connector → 发 ping → 看审批卡 | 疑似位置：connector 工具描述 metadata（P5-31 metadata bridge 待接） | 严重度：low，建议归 P5-31/P5-58 处置
- [NOTE] 首屏控制台 1 error：`pbots-app://app/__reconstructed_health` 405（不影响功能，本任务 UI 全程正常） | 复现：启动 app 看 console | 疑似位置：dead-entries 健康探针（grok-dead-entries.spec 域） | 严重度：info
- [NOTE] /tmp 下历史 `bot-u23-*` 测试临时目录 2129 个未清扫（跨多次 e2e 累积，非本次引入；我的运行已全部自清） | 复现：`ls /tmp/bot-u23-* \| wc -l` | 疑似位置：xvfb-run/playwright 被中断路径下 tmp-sweep 不触发 | 严重度：info，可立沙箱清理小任务
