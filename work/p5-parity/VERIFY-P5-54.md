# VERIFY · P5-54 切换 renderer-grok + 删除旧 renderer

verdict: **PASS**
commit: 4500cd2b523ffe4270e6651f230816e9fba839cd（feat/P5-54 @ /tmp/bot-wt/P5-54，基 8e94b67，worktree 全程干净无漂移）
验收人：verifier（GLM 5.3），2026-11-03；环境：HOME=/tmp/bot-p5-54-vfy 隔离复跑，共享 pnpm store，Xvfb

## 验收项与证据

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| U6 全链：frozen install → build → vitest → e2e | PASS | 删 node_modules 后 `pnpm install --frozen-lockfile`（1m38s，exit 0）→ `pnpm build` 三步全过（electron-vite → renderer-grok → stage-renderer；out/renderer 含 index.html/shim.iife.js/override-dead-entries.css）→ `pnpm test` = **356/356**（33 files, 4.09s）→ `pnpm test:e2e`（Xvfb）= **61 passed (6.7m)**，含真模型 d1-real-model（LiteLLM）。日志尾部：`work/p5-parity/evidence/P5-54/verify/e2e-tail.txt` |
| 旧树真删 | PASS | `ls app/ui/renderer/` = carrier/fold/session/theme 四目录（fold=turn-fold.ts、session=reduce.ts、theme=fonts+sand-tokens.css，均被 renderer-grok/shim 引用）；`git show --shortstat 4500cd2` = **29 files, +19 −3898**（与申报逐字一致）；main/preload/electron.vite.config 无旧 renderer 残留引用（grep 零命中）；根依赖删 5 个（react、react-dom、@vitejs/plugin-react、react-markdown、shiki） |
| 上游 diff=0 | PASS | `node renderer-grok/scripts/check-upstream.mjs` → `upstream diff=0: 332 files`（SOURCES.tsv 逐文件剥头后 sha256 对上游 a9f633e，脚本自带 provenance 头校验） |
| D3 审批值域+副作用 | PASS | 亲跑（全量内 #38）：session.spec.ts:17 — dock 仅本 bot、侧栏 Needs attention 出现/消除；Deny → 不执行；Allow once → 执行；Always 禁用；值域断言另在 grok-shim.spec #15（⊆ {allowed-once,rejected}） |
| D5 wrapper 建连 X 实调 | PASS | 亲跑（全量内 #31）：market.spec.ts:40 — filesystem 经 #15 安装（enabled:false 精确等值）→ #4 建 X → X 在新 renderer 实调 read_file（真实 stdio server）→ 审批 → 工具行 done |
| D6b 重启恢复+翻页 | PASS | 亲跑两条：journeys/d4-d5-d6-journey #20（close→launch：列表/主 bot/历史在；连接器 bot 重启后仍调工具）；session.spec #41 `#11 分页`（45 轮 > 首窗 40；重载首窗有限；滚顶逐页补全到最早轮；注入一次性失败只重试该页、无重复拼接） |
| D12 零外网+token | PASS | 亲跑（全量内 #19）：journeys/d11-d12.spec — 生产 build 挂 request 监听后整轮重载+开 Plugins/Settings：pbots-app:// 以外请求数=0；window+DOM 全文搜 launch token 命中 0；禁区词零命中；另有 #2（D12② DOM）、#46 origin-gate |
| F1 切 bot composer 输入+发送 | PASS | 亲跑（全量内 #39）：session.spec:71 — 非 bot 隔离场景输入两行、IME 组字 Enter 不发送、Enter 发送成功、草稿按 bot 隔离（切走清空/切回恢复）后仍可续输发送 |
| F5 时间分隔/未读线 | PASS | 单测亲跑：`pnpm exec vitest run tests/unit/grok-shim/markers.test.ts` = **12/12**（阈值 900000 含等号、跨日、文案 en-US、未读线起点/恰 1 条/tracker 冻结语义=0.78.1 vmt/UR/Emt）；e2e 亲跑：#56（首条 1 条、阈值内 0 条、几何 22）+ #57（切走回复→切回恰 1 条、停留期不动、再进 0 条） |
| F4 emulateMedia 暗色跟随 | PASS | 亲跑（全量内 #40）：session.spec:113 — emulateMedia light/dark → `html[data-theme="cursor-light|dark"]` 断言逐项过；另 #6 bots.spec「随系统切换」 |
| U2′ 基线 | PASS | visual.spec #59 亲跑绿（亮暗逐项对 tests/e2e/visual-baseline.json）。抽 5 断言核对基线值（light/dark 同值）：A6 头像 box:width=34px、B1 会话列 row-gap=normal、B8 审批卡 border-top-left-radius=0px、B10 composer 壳 padding=9px、E4 正文字体 font-size=13px |
| U2′ diff.tsv | PASS | `work/p5-parity/evidence/P5-54/e2e/U2p/diff.tsv` 在档，`wc -l` = **32**（表头+31 数据行，new≠was 差异交 P5-55） |
| 对照台第三列 | PASS | 双证：①`pnpm test:compare-app` 亲跑 = 1 passed（8 张 app singles + styles/app.json + app-summary.json，boundary=0，hasUserMsg/hasToolBash/hasThinking/hasPermCard/hasUser2 全 true；证据 `evidence/P5-54/verify/{app-summary.json,app-singles/}`，截图亲验：3 bot 侧栏+未读点、bash 工具行、审批卡 Always 禁用、composer）；②在档 `evidence/P5-54/compare/pairs/` 5 视图×亮暗=**10 张**三联拼图，Read 亲验确为 REF 0.78.1｜OURS 0.18-port｜APP 三栏；u1-diff.tsv 含 app-vs-ours 122 行 |
| 行为不回归（single-instance/restore/origin-gate） | PASS | 三条全亲跑绿：#54 shell/single-instance（双开第二实例拿不到锁退出 code 0，第一实例不受影响）、#37 restore（好/坏 recipe、gate 时序）、#46 shell/origin-gate |
| 坏路径（追加） | PASS(软失败可接受) | 探针 `evidence/P5-54/verify/probe-missing-index.out`：删 out/renderer/index.html 后启动（隔离 HOME，Xvfb）——进程不退、零日志刷屏、无崩溃循环（fail-soft 白窗；20s 超时截停后还原，后续 compare-app 同一 out/ 正常）。套件内另有三条注入型坏路径全绿：分页 failNext、ERR_ABORTED 容忍、双开锁 |

## 与申报的偏差（不构成 FAIL）

- 报告行文「27 锚点 66 属性 264 断言」与实物不符：visual.spec ANCHORS=31 条（26 有 sel + 5 个 sel:null 断不存在），基线 63 属性/主题 ×2 = 126 条实测断言。数值夸大但机制与产物（baseline/diff.tsv/spec）真实自洽。
- diff.tsv「32 行」= 含表头的总行数；数据行 31。口径无碍 P5-55 消费。
- vitest 365→356、e2e 66→61 的**旧值**未复算（需 checkout 基点跑一遍，不值得）；现值 356/61 亲测一致，删测试目录 unit/renderer、unit/market 属实。

新问题（每条一行，可直接成为修复任务）：
- [FIX] REPORT-P5-54 的 U2′ 计数失实（27/66/264 vs 实物 31/63/126） | 复现：数 visual.spec.ts ANCHORS 与 visual-baseline.json | 疑似位置：work/p5-parity/REPORT-P5-54.md | 严重度 low（P5-55 以 diff.tsv 为准不受影响）
- [FIX] 报告自报范围外缺陷①：live 连接器 bot 标题（#rename）重启丢失、普通 bot 不丢（本验收未复验，d4-d5-d6 旅程未覆盖 rename 持久） | 复现：建 live 连接器 bot → rename → 重启 | 疑似位置：连接器 bot 元数据落盘链路 | 严重度 medium
- [FIX] 报告自报范围外缺陷②③：仅首次打开的 bot 能翻更早页（上游 setScope 重置游标）；工具行结果内容未映射（P5-51⑧） | 详见 REPORT-P5-54「发现（范围外）」 | 疑似位置：renderer-grok transcript window / shim | 严重度 low-medium
