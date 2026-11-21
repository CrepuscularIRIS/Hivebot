# G2-r1 · 席 A（Opus 5.5）· p4-ui PLAN v1

seat: A
verdict: REVISE
confidence: high
findings:
- [HIGH] PLAN.md:34（U-00 捷径「窗口隔离配置抄 `D/apps/desktop/src/main.ts:259-286`」+ ⑥ 骨架）— 抄的范围只有 BrowserWindow 构造，dsh 真正守边界的三件都在范围外：preload 按协议/域名门控才 expose（`D/apps/desktop/src/preload-app.ts:79` `if (location.protocol === \`${SCHEME}:\` && location.hostname === 'app')`）、`setWindowOpenHandler`（main.ts:292）、`will-navigate`（main.ts:356）；且 259-286 原样带 `webviewTag: primary`（主窗口为 true）和 `devTools: true`。preload 对该 webContents 的每次导航都会执行，⑥ 只写「只暴露三个窄函数」不限来源。会话流渲染的是 LLM 输出（markdown 链接）：一次点击把主窗口导到外部页，或 `target=_blank` 开出继承父 webPreferences 的子窗口，外部页就拿到 `pbots:api` / `pbots:mux-port`——它能自开 `$events` 拿到合法新 clientId 和补发的未决 waterfall（C:122），再走 M1 `$events/result allowed-once`，§2.2 的 clientId/eventId 校验全过。即从远程内容绕过审批，打穿 D9/C §4 不变式 — 证据: 上述 dsh 行号；PLAN.md:34 ⑥ 仅列 nodeIntegration/contextIsolation/sandbox；CONTRACT.md:60,122 — 建议: U-00 ⑥ 补四条并各一条 E2E/单测：(a) `webviewTag:false`，生产 `devTools:false`；(b) `setWindowOpenHandler(() => ({action:'deny'}))`（http(s) 链接改 `shell.openExternal`）；(c) `will-navigate` 拒绝一切非本应用 origin；(d) preload 仅在 `location.protocol` 为本应用协议且为主 frame 时 expose，main 的三个 ipc handler 再校验 `event.senderFrame.url` 来源。验收：页面内 `location.href='https://example.com'` 与 `window.open(...)` 后 `typeof window.pbots === 'undefined'` / 窗口数不变；捷径改为「抄 main.ts:259-292,356-370 与 preload-app.ts:79 的门控模式，删 webviewTag」
- [MEDIUM] PLAN.md:26,34,36（区域：`main/dsh/` 仅 U-00 可改）— C:18 规定 main 桥另写三件：① raw-result rpc（U-11 有）② 原帧 tap socket ③ 断线重连循环。②③ 都长在 socket/`/connect` 上，也就是 `main/dsh/connect.ts`（U-00 独占），但 U-00 合入清单与验收没写 tap 钩子和重连循环，U-12 ②④⑤ 却要用它们且无权改 `main/dsh/`。另：捷径「main 只复用 `client.mjs:66-81` 的 `connect()`」——该函数在 :77 直接 `new MuxSocket(...)`，而 `mux.mjs:116-120` 会丢未知 streamId 帧（C:18），原样 import 得到的正是要避开的那个 socket — 证据: `app/sdk/examples/lib/client.mjs:66-81`；PLAN.md:26 独占表；U-12 ② ⑤ — 建议: 明确二选一：U-00 交付 `main/dsh/` 的 socket 层（cookie 交换只抄 client.mjs:67-75 写来源、自建 tap socket、重连循环 + generation 事件、ledger 类型冻结），U-12 只消费；或把 `main/dsh/socket.ts` 划给 U-12。U-00 验收加一条「断开 socket 后自动重新 /connect，generation+1」
- [MEDIUM] PLAN.md:37-38,42（U-13/U-14 vs U-23 ③）— D10c1（失效态显示，**不 blocked**）靠 `BotsMetaView.recipes[*].live`（C:92：main 用未过滤的 #1 判定是否在 registry）+ roster 比对（C:97）。U-13 ①–⑤ 没有 live 计算与单测；唯一提 live 的是 U-14 ①（[T-16] 之后的 ensure 失败标记）。T-16 合入前 U-23 ③ 没有数据来源，c1 实际被 U-14 连带锁住，重演 G1-r2 A MEDIUM-1 — 证据: CONTRACT.md:92,97；PLAN.md:37 U-13 验收全文无 `live`；:42 ③ 写「T-16 合入前 = 任一连接器 bot close→launch」 — 建议: U-13 加 ⑥「`get` 返回的 live = 未过滤 #1 是否含该 id；单测：registry 无此 id → live=false，不写盘」
- [MEDIUM] PLAN.md:38（U-14 ①②）— `Promise.allSettled` 只隔离 reject，不隔离挂起：任一 ensure 永不 settle，「全部 settle 前 M1/M2 不就绪」就让所有 bot 冷启动卡死——正是 BRIEF §4 死因 2「一次失败的创建卡住所有 bot 的冷启动」 — 证据: PLAN.md:38 ①「全部 settle 前 M1/M2 不就绪」；BRIEF.md:32 — 建议: 每个 ensure 套超时（超时按失败、标 live=false），加一条单测：mock 一个 ensure 永不返回 → 超时后 M1/M2 就绪、其余 bot 可用
- [MEDIUM] PLAN.md:41,§3 无对应行（D4③ 修复归属）— 已知 gateway 断连后 pending 保留、无已知超时（C:121-123），U-00 ④(4) 大概率得出「无超时」，Q-spike 再二选一定方案；但任务图里没有实现该 deadline 的任务（SDK 超时 → app/sdk 任务；main 代答 rejected → M1/M2 桥），只在 U-22 ④ 写「到期仍 pending → FAIL，转修复任务」。等于把可预见的 FAIL 推到 W2 才开工，G1-r2 A MEDIUM-2「W1 前定归属」只落了「定」没落「做」 — 证据: PLAN.md:41 ④；CONTRACT.md:121-123 — 建议: 加条件任务行 U-16「D4③ deadline 实现」，deps = Q-spike，owner 按 Q-spike 结论（main → builder/M 档；SDK → p2-sdk T-xx），U-22 ④ 依赖它
- [MEDIUM] PLAN.md:42（U-23 ⑥⑦）、:41（U-22 ②–④）— 区域与验收不匹配：W2 任务区域只有 `renderer/plugins/<页>/`，但验收含 D2/D3/D4/D10b/D7 E2E（文件落 `tests/e2e/`，未列入区域），U-22 还要「删除 dev-min」（U-15 区域）；D10b E2E 要求「屏障停在 recipe 已落盘、session 已建、#4 未返回」，这个 #4 屏障只能由 main（U-13 的 m3-meta 编排）提供测试钩子，U-13 没有交付它，frontend-dev 又无权改 main — 证据: PLAN.md:37 U-13 无测试钩子；:42 ⑥；BRIEF.md:53 D10b — 建议: U-13 加交付「env 门控的 #4 编排屏障（复用 runtime.ts 的 gates 文件机制，`app/sdk/tests/support/runtime.ts:4`）」；W2 各行区域补 `tests/e2e/<页>*.spec.ts`，U-22 区域补 `renderer/dev-min/`（删除）
- [MEDIUM] PLAN.md:44（U-31 ②）— D12① 判据写成「只有本地资源（file:// 或 127.0.0.1）」，把 127.0.0.1 列为允许，恰好放过最该抓的拓扑违规：renderer 直连本机 dsh（C:17「renderer 不联网、不持 token」，C:55「不改 streamBaseUrl」）。上游包里任何残留的 fetch/ws 到 dsh 端口都会被判通过 — 证据: CONTRACT.md:17,55；PLAN.md:44 ② — 建议: 改为「renderer 网络日志里除应用自身 origin（file:// 或 app 协议）外请求数 === 0；任何 http(s)/ws(s) 请求即 FAIL」，dev server 只用于开发不用于该 spec
- [MEDIUM] PLAN.md:36（U-12 deps）— U-12 ③ 的 endpoint 白名单 = 固定三项 ∪「Q-spike 批准项」，但 deps 只写 U-00，不含「Q-spike 落实」（U-11 有）。按 deps 机械派发，U-12 会在批准项未定时开工，要么漏 endpoint 要么自行放行 — 证据: PLAN.md:35 vs :36 deps 列；BRIEF.md:58「批之前不开工依赖新增接口的…任务」 — 建议: U-12 deps 加「Q-spike 落实（仅 ③ 依赖，其余可先做）」
- [LOW] PLAN.md:43（U-24 deps）— D5 要「在 U-23 对话框勾选后建 bot X」，deps 只有 U-21、T-09，缺 U-23（§4 顺序里有，deps 列没有） — 建议: deps 补 U-23
- [LOW] PLAN.md:10,34（submodule 版本锚定）— 决策行写了 @ce7073d，U-00 验收没有锚定检查；BRIEF §3 / C §2.1:53 仍写「workspace 链接 `repos/deepseek-harness`」 — 证据: BRIEF.md:25；CONTRACT.md:53 — 建议: U-00 验收加 `git -C app/ui/vendor/deepseek-harness rev-parse HEAD` === `ce7073d51254c26cd63b22a60835b8f948deb447`；决策 2 补实据「`repos/*/` 被 .gitignore（.gitignore:1），/tmp/bot-wt 里的 worktree 根本没有 repos/，workspace 链接不可行」，并在 C/B 修订账记一行依赖方式更正
- [LOW] PLAN.md:10（submodule 在并行 worktree 的成本）— 每个 W1 worktree 都要 `submodule update --init` + 在 dsh monorepo 里 install/build lib，三条并行时 I/O 叠加（CLAUDE.md §4 GPU 训练期盯 iowait）— 建议: U-00 交付一条 bootstrap 命令并在 SPIKE.md 记耗时；worktree 用 `git submodule update --init --reference <主仓 submodule>` 复用对象
- [LOW] PLAN.md:34（U-00 ④(4)）— 「审批未决时关 renderer」不明确：Linux 下关最后一个窗口默认 quit，main 和 dsh 子进程一起退出，测到的不是 D4③「交互客户端断开、后端仍在」 — 建议: 写成「main 存活（window-all-closed 不退出或 renderer 导到空白页），只关 $events 端口」
- [LOW] PLAN.md:34（U-00 ② 最小拒绝测试）— 3 条里没有 eventId 不匹配，也没有显式 `enabled:true` — 建议: 补 2 条，成本几行
- [LOW] PLAN.md:35,39（ledger 联调）— U-11 用 ledger 桩测，「合入后联调」没有落到任何验收行；U-15 ② 只要求单测 — 建议: U-15 加一条集成断言：真实 `$events` ready 后用错误 clientId 调 `$events/result` → `pbots/forbidden`，dsh 计数 === 0
- [LOW] PLAN.md:40（U-21 ①）— 主 bot 重建条件只写「mainBotId 为空」，C:129 还有「指向的 session 已不在 list 里」 — 建议: 补此分支与一条 E2E
reverse_take: 最可能的失败不是桥写不出来，而是骨架阶段照抄窗口构造却漏了 dsh 的来源门控，P-B 把模型输出的链接渲染出来后，一个外部页面就能拿到 pbots:api 替用户点「批准」；更笨更稳的做法是 U-00 第一天就把「窗口只认本应用 origin、禁新窗口、禁导航」写成三条红绿测试，再谈别的。

## 关注点逐项核对

### 1. 任务拆分
- U-11/12/13 区域在目录层面不重叠（m1-api / m2-mux+preload/mux-relay+renderer/carrier / m3-meta），可同时派。但共享底座 `main/dsh/` 被 U-00 独占，而 tap socket 与重连循环没有写进 U-00 交付——U-12 开工即需 U-00.fN（MEDIUM-1）。
- U-00「只有它能改 package.json」纪律写明（PLAN.md:26），配 U-00.fN 补丁机制，合理。建议 U-00 的 package.json 一次装齐 C §2.1:53 保留集（含 ui-plugin-market/manager、ui-agent-preset、ui-model-selection），避免 W2 每页回头开 fN（未计分）。
- U-2x 均写「ux-proposer×2 → frontend-dev → verifier → /panel GU 一轮」（PLAN.md:40-43，§4:47），与 B:60 / CLAUDE.md §3 UI 档一致。区域缺 tests/e2e（MEDIUM-5）。

### 2. 附加要求 6 条与 LOW×5 落点
| 项 | 落点 | 判定 |
|---|---|---|
| +1 spike 保留安全校验 | U-00 ②：enabled:false、outcome∈{allowed-once,rejected}、clientId、eventId；/permission、configForms、凭证在 spike 也拒；3 条拒绝测试 + 计数 0 | 到位（LOW：测试补 eventId、enabled:true） |
| +2 D10c 拆分 | U-23 ③ c1 不 blocked、④ c2 [T-16]；U-14 ① 桥级 c2 | 文字到位，但 c1 的 live 数据来源无主（MEDIUM-2） |
| +3 无人应答实测 | U-00 ④(4) + Q-spike 附 deadline 方案；U-22 ④ 窗口取实测 | 到位；「关 renderer」需澄清（LOW）；实现任务缺（MEDIUM-4） |
| +4 精确断言 | §2:29 全局口径，例子 `expect(['rejected','cancelled','unavailable']).toContain(outcome)`；ApprovalOutcome 已核实为 `'allowed-once' \| 'rejected' \| 'cancelled' \| 'unavailable'`（`D/packages/interaction/user-approval/src/types.ts:32`） | 到位 |
| +5 勘误 + D9 原文 | C:162 勘误已在；U-11 行首「派发时附 B D9 原文」 | 到位 |
| +6 L1–L5 | L1 U-11 ④、L2 U-11 ②、L3 U-00 ③、L4 U-22 ②、L5 §4 全路径 | 到位 |

### 3. 依赖正确性
- U-00→U-11/12/13：正确。
- T-16→U-13（基于 `feat/T-16@798206a` worktree，`preset-id.mjs` 已在该提交，已核实 `git log feat/T-16`）/U-14（T-16 合入 main）：正确。注意 feat/T-16 已前进到 c1dc6fc，且待查 3 可能让 T-16 在合入前改 `index.mjs:190`，U-13 需准备 rebase。
- T-09→U-24：正确；U-24 缺 U-23（LOW）。
- RE（待查 1）→U-21：正确，§6-1 写明不影响 U-00/W1。
- U-12 缺 Q-spike（MEDIUM-7）；D4③ deadline 无任务（MEDIUM-4）。

### 4. submodule 决定
- 与「repos/ 只读」一致：submodule 是独立 clone，`lib/` 在 dsh 的 .gitignore（`repos/deepseek-harness/.gitignore:7`）里，submodule 内 build 不会弄脏 gitlink；CLAUDE.md §3 搬运阶梯第 2 级明文允许 submodule。且 `repos/*/` 被本仓 .gitignore（:1），/tmp/bot-wt worktree 里没有 repos/，原 BRIEF 写的 workspace 链接 repos/ 在并行 worktree 下本就走不通——submodule 是对的，PLAN 应把这条实据写进决策 2（LOW）。
- 版本锚定：决策行写了 ce7073d，验收无检查；BRIEF §3 / C §2.1 文本未同步（LOW）。

### 5. 验收可证伪性
- U-00 止损三条（闭包拖进深度绑定供应者 / 拒绝项 >~30 / 用时 >1 工作日）与 B:58 一致，触发动作明确（回 G1 评估路线 B）。
- U-15 ① D1 全文 + agentPreset 精确值，可证伪。
- U-31 ①–⑤ 可证伪；② 的 127.0.0.1 放行削弱了 D12①（MEDIUM-6）。

### 结论
REVISE。一条 HIGH（窗口来源门控 / 导航 / 新窗口，安全红线级但修法是 U-00 ⑥ 加四条 + 测试，不改路线），七条 MEDIUM 均为一行到三行的任务表补丁。路线、拆分、submodule 决策本身成立。
