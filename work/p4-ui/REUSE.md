# REUSE · p4-ui（P4 开工前置汇总）

v1.1 · 2026-11-02 · drafter 汇总（不重做调研，全部摘自已有结论）；v1.1 按 G2-r2 A 席 MEDIUM 把 PLAN v1 旧口径同步为 v2。口径：`ES` = `work/p4-ui/reuse/electron-shell.md`；`scout-C` = `work/p3-contract/reuse/dsh-client-packages.md`；`C` = `work/p3-contract/CONTRACT.md` v1.3；`B` = `work/p4-ui/BRIEF.md` v1.2；`PLAN` = `work/p4-ui/PLAN.md` v2；`D/` = `repos/deepseek-harness@ce7073d`。接口形状一律以 C 为准，本文件不改任何接口。

## 决策表

| 能力 | 决策 | 来源锚点 | 备注 |
|---|---|---|---|
| Electron 构建壳 | **集成**：`electron-vite@6.0.0`（第 1 级），脚手架 `@quick-start/create-electron@1.0.31` react-ts 锁版 | ES:9,44-48；PLAN 决策 1 | MIT、维护中；保留 dsh 的 Vite 6 / React 18 / 模块表约定；sandbox preload 显式配单文件 CJS（ES:45） |
| Electron 宿主形态 | **改造**：不整体搬 `D/apps/desktop`，必要时只小片段复制并记 URL@SHA:path | ES:10,30-35；PLAN v2 决策 7、U-00 捷径 | 弃因：原版 boot 把 streamBaseUrl 交给 renderer，违反 main-only mux（C:17）；门控整套抄 D 并记来源：窗口构造 `main.ts:259-286`（改 webviewTag/devTools）、`setWindowOpenHandler` :292-295、`will-navigate` :356-364（去掉 http 同源放行）、preload 门控 `preload-app.ts:79`、ipc 来源校验 `ipc.ts:108-115` + `main.ts:492-497`；origin 用特权协议 `pbots-app://app/`，不用 `file://` |
| 打包发布备选 | **集成（备选，不选）**：Electron Forge 8.0.1 | ES:11 | 弃因：要求 Vite 8（dsh 现为 6）；模板默认关 inspector fuse，`_electron` 起不来打包产物（ES:55） |
| E2E 框架 | **集成**：`playwright@1.64.1` `_electron` + Electron 44.7.0，Node ^24.9.0 | ES:12,92；PLAN 决策 3 | 组合未实测，U-00 冷启动当场验；端口只活在 Electron/page realm，`exposeFunction` 只回传观测不作 carrier（ES:74-87） |
| renderer 组装 | **集成**：第 2 级，git submodule `app/ui/vendor/deepseek-harness` @ce7073d，submodule 内 build lib | PLAN 决策 2；scout-C:15,167 | `repos/` 被 gitignore 且未 build，workspace 链接不可行；npm latest 版本不符（scout-C:17）；69 包三档：可直接复用 4 / 需适配壳 24 / 深度绑定 41（scout-C §1） |
| 会话列表 / bot 导航 | **改造**（产品壳自建）：`ui-workspace` 是 session browser，不是 bot roster | scout-C:114；C §2.1 | bot 列表页 = 产品插件，数据取 #9+#19，动作复用 ClientSessions；不把 bot 伪装成 workspace |
| M1 `pbots:api` | **集成**：白名单透传 dsh `/api`，原样返回 `ConnectionRpcResult` | C:22 | #1 滤 `p2temp-*`；凭证/account 一律拒；raw-result rpc 自写（`mux.mjs:156-165` 会压平 code/details，C:18①） |
| main 桥基座 | **改造**：专用模块，只复制 `client.mjs:67-75` 的 cookie 交换；socket 自建（tap、重连、generation——原 `connect()` :77 的 MuxSocket 会丢未知 streamId 帧，不 import），另写 raw-result rpc / 原帧 tap / 断线重连 | C:18；PLAN v2 :34、决策 6 | 不直接复用 `examples/lib`（保持 P2 测试替身，不改）；socket 层（tap、重连、generation、ledger 类型冻结）归 U-00 交付 `main/dsh/{socket,connect,ledger}.ts`，U-11/U-12 只消费、不改 `main/dsh/` |
| M2 `pbots:mux-port` | **集成**：`transport.rpc.call('/api')` + `createWebSocket` 包 MessagePort（约 40 行包装 W） | C:23,55；C §2.3 | 不注入 `rpc.open`（上游定位为进程内载体，rpc.ts:311-313）；不改 streamBaseUrl、不设 ownsHost；streamId 归属三条 (a)(b)(c) |
| M3 `pbots:bots-meta` | **自建**：main 本地 `bots.json`，无 dsh 锚点 | C:24；PLAN v2 U-13⑥ | 原子写（tmp+rename）+ 单一 Promise 队列；renderer 只写 `mainBotId`；`get` 返回的 `recipes[*].live` = 未过滤 #1 是否含该 id（U-13 ⑥，U-23 ③ 的数据源） |
| $events 补发 | **集成**：gateway 原生补发语义，main 不缓存不补发 | C:126 | T-15② 已验绿（events-replay L139-150）：重连重挂 `$events` 即补发全部未决项 |
| D4③ deadline（条件任务） | **自建**：Q-spike 定 main 代答时，main 以 ledger 中的 clientId 发 `$events/result` value `'rejected'`（只此一种 outcome）；U-00 ④(4) 实测已有终态 → U-16 标 skipped；定 SDK 超时 → 转 p2-sdk T-xx，本行转引用 | PLAN v2 :40（U-16）；U-22 ④ | 用 ledger 未决 eventId 与 port 挂载状态，不另存状态；假时钟单测；U-22 观察窗口 = 2× 实测超时或 deadline（skipped 视为满足） |
| theme / 样式 | **改造**：新 theme 插件把 Grok 色板/间距/圆角映射 `--dsw-*`，字体映射 `--dsh-font-family-text/code`，wordmark 走独立变量 | B §3；scout-C:160-162 | 不引 Tailwind；不全局导入 Grok 766KB stylex CSS；品牌换掉 `ui-brand-official`；token 表待 RE-theme（见缺口） |
| 图标 | **集成**：按 icon id 替换 sprite SVG（namespace/viewBox 按 dsh 约定） | scout-C:163 | SVG 由 RE 用 fonttools 从 woff2 导出（B 待查 1④，在途）；不用 primitives 而不启动主题时须自供 sprite |
| p2temp #4 createWithConnectors | **集成**：复用 P2，main 编排（先原子写 recipe 再调 dsh） | C #4（:32）；PLAN v2 §6-3、U-13⑤⑦ | preset id = `presetIdOf(agentPreset, connectors)`；「Duplicate agent preset」判重未决（待查 3 二选一：T-16 改按 id 的 in-flight 表，或接受 C:32 现状），U-13 ⑤ 按结论验；交付 env 门控的 #4 编排屏障供 U-23 ⑥（U-13 ⑦） |
| p2temp #21 preset.ensure | **集成**：复用 P2 T-16 交付 | C #21（:49）；PLAN v2 :38 | main 启动按 recipes 逐个 ensure，每个套超时（默认 30 s，超时按失败）再 `allSettled`，失败标 `live=false` 不写盘；全部 settle 前 M1/M2 不就绪（经 `ready.ts` 闸门，U-14 ①） |
| presetIdOf 共用模块 | **集成**：直接 import `app/sdk/src/p2temp/preset-id.mjs`，不复制第二份 | C:94；PLAN U-13 | #4/#21/main 三方共用；对缺省 agentPreset 抛错（§8-2 单点解析） |
| W3 L 档范围 | **已定**：`work/review-coverage.txt` 已记 `P4-BASE 01c6921`（W0 开工基线），mm-review L 范围 = P4-BASE..当前 main HEAD，head SHA 记回 review-coverage | PLAN v2 §1 前置②；U-31 ⑤ | 不再用聚合分支引用 |

## 缺口（无结论或未就绪项）

- **RE-theme 在途**（B 待查 1）：`pa[light|dark]` 色值表、布局常量、`--dsw-*` 候选映射、woff2 图标 SVG 均未产出 → U-21、D12③ 与 W2 ux-proposer 输入都等它（PLAN v2 :41,56）。
- **T-16 未合入 main**（`feat/T-16@798206a`，已含 preset-id.mjs）：U-14 依赖「T-16 合入 main」；U-13 可基于 feat/T-16 开 worktree（PLAN v2 :37-38）。
- **T-09 市场验收 todo**：目录源与条目映射以 T-09 为准（C §7.3），D5 / U-24 等它；派发仍被权限系统拦（PLAN v2 :57）。
- **Electron 44.7.0 + Playwright 1.64.1 组合未实跑**：有决策无验证，U-00 冷启动 smoke 当场验（PLAN 决策 3）。
- **W0 最小插件闭包未实测**：scout-C:139 明确不应提前承诺插件数或工期，U-00 spike 产出（C §7.4）。
- **dsh「issue 有人回应」维护判据未核验**（ES:10；scout-C:20）：不影响集成决策，但严格维护资格未全部证实，记录在案。
