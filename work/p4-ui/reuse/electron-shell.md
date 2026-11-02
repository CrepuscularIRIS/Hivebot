# P4 Electron 壳与 MessagePort E2E 复用决策

调研日期为 2026-11-02；“最近六个月”按 2026-05-02 至调研日计算。本文仅作源码和官方资料核查，没有安装依赖、运行 Electron 或验证 M2 实现。`D/` 指 `/home/lingxufeng/bot/repos/deepseek-harness/`，本地参考仓 SHA 为 `ce7073d51254c26cd63b22a60835b8f948deb447`。本次遵照任务要求保持 `repos/` 只读，未 clone、未修改 MANIFEST。已有 `work/*/REUSE.md` 检索未发现可共用的汇总文件；相关 client 结论在 `work/p3-contract/reuse/dsh-client-packages.md:136`，其 MessagePort carrier 也明确尚未实现和验收。

## 可直接合并的决策行

| 能力 | 候选（repo / 包） | 阶梯级别 | 许可证 | 维护（最近 commit / release） | 决策 | 理由与适配工作量 |
|---|---|---|---|---|---|---|
| P4 Electron 构建壳。 | 使用 `alex8088/electron-vite` 的 npm 包 `electron-vite@6.0.0`，官方脚手架为 `@quick-start/create-electron@1.0.31`。 | 第 1 级。 | 上游 LICENSE 为 MIT。[E1] | 最近 commit 为 2026-10-14，v6.0.0 release 为 2026-10-14；owner 于 2026-10-22 回复安装问题。[E1][E3] | **集成**。 | 推荐锁定构建依赖并配置 main/preload/renderer 三个入口；保留 dsh 的 Vite 6、React 18 和模块表约定，而不是迁移整个 dsh desktop。预估适配为少量构建配置、受限 preload 和现有 P3 的 M1/M2/M3 接线；M2 是本产品协议工作，不是模板已有能力。版本兼容有包声明证据，但端到端尚未验证。[E1][D1][D2] |
| 完整 dsh desktop 宿主。 | `deepseek-ai/deepseek-harness@ce7073d51254c26cd63b22a60835b8f948deb447:apps/desktop/` 及 `apps/desktop-host/`。 | 整仓原样运行属于第 2 级；拆出安全窗口或 preload 片段属于第 3 级，不能把后者记成整仓集成。 | 两个 app 的 package.json 均声明 MIT。 | 本地 desktop 最近 commit 为 2026-10-29，desktop-host 最近 commit 为 2026-10-28；本次未核验 dsh issue 响应，严格的维护资格仍有这一项未验证。 | **改造**。 | 有现成 main+preload，但不推荐整体作为 P4 宿主：原版自己管理后台、账户、更新、欢迎页，并把 `streamBaseUrl` 交给 renderer，不能原样满足 P3 main-only mux。仅在需要时复制具体小片段，保留来源 URL@SHA:path；不要搬 1400 多行 main 及其整套项目管理。没有宣称第 3 级片段已复制。[D1][D3] |
| 包含打包发布流水线的备选壳。 | `electron/forge` 的 `@electron-forge/plugin-vite@8.0.1` 与 `@electron-forge/template-vite@8.0.1`。 | 第 1 级。 | 上游 LICENSE 为 MIT。[F1] | 最新 commit 为 2026-11-02，v8.0.1 release 为 2026-09-29；安装问题有 contributor 回复与上游修复 PR。[F1][F3] | **集成**。 | 作为备选而非本次首选。Forge 8 的 Vite 插件已稳定，但要求 Vite 8，dsh 当前为 Vite 6；此外其模板关闭 inspector fuse，会阻止 Playwright `_electron` 启动打包产物。需要迁移构建配置、加入 React 插件并分离测试构建 fuse 策略；首个 demo 比 electron-vite 多出迁移工作。[F1][F2][P1] |
| Electron 与真实端口 E2E。 | 使用 `playwright@1.64.1` 的 `_electron`，Electron 首轮建议锁定 `44.7.0`。 | 第 1 级。 | Playwright 为 Apache-2.0，Electron 为 MIT；官方仓的许可证可追溯于 [P6]。 | npm 查询 Playwright 最新版本为 1.64.1、修改时间为 2026-11-02；Electron 44.7.0 在 npm 可解析，且 dsh 当前声明 `^44.7.0`。 | **集成**。 | 使用真实 main/preload/page 消息通道；`page.exposeFunction` 仅回传可序列化的观测结果，不拿它传端口或冒充 preload。Electron 44.7.0 + Playwright 1.64.1 的实际组合尚未运行验证，不能记为已通过兼容矩阵。[D1][P1] |

## 1. dsh 自带的宿主与现成骨架

### apps/ 不是只有 Web 和 CLI

| 目录 | 源码证实的技术栈与职责 | 本地最近维护与证据 |
|---|---|---|
| `apps/desktop/`。 | 它是完整 Electron 桌面壳，不是 Tauri。入口是 `lib/main.js`，TypeScript 先经 `tsc`、再经 tsdown 构建；使用 electron-builder 和 electron-updater。其欢迎页等局部 UI 也使用 React 与 Vite；主进程并非 electron-vite 构建。[D1] | `git log -1 -- apps/desktop` 返回 `bc705e0ff1`，时间为 2026-10-29T14:31:22+08:00，主题为开发者工具菜单本地化。 |
| `apps/desktop-host/`。 | 它是 Electron 桌面应用的私有 Node-mode 后台，不是另一个可见窗口壳；入口为 `lib/index.js`，依赖 dsh、Cordis、host-webserver、connection、workspace 等工作区包。它不是可以独立替换 main/preload 的模板。证据为 `D/apps/desktop-host/package.json:2-29`。 | `git log -1 -- apps/desktop-host` 返回 `00d541438b`，时间为 2026-10-28T02:03:15+08:00，主题为 0.2.2-alpha.2 发布。 |
| `apps/web/`。 | 它是 Vite 构建入口，真正的壳库是 `@deepseek-ai/dsh-client-web`；构建产物由 `dsh web` 服务。它使用 React 18、`@vitejs/plugin-react` 和 Vite 6，并通过 workspace 引入 client 包。证据为 `D/apps/web/package.json:2-4,24-27,33-44,55-64`。 | `git log -1 -- apps/web` 返回 `6397b4e59c`，时间为 2026-10-29T23:54:15+08:00，主题为 mobile sidebar title 修复合并。 |
| `apps/cli/`。 | 它是 TypeScript/ESM 的 Node CLI，而不是桌面窗口；bin 为 `lib/bin.js`，使用 commander，Node 要求为 `>=24.9.0`，负责 profile、插件与配置。证据为 `D/apps/cli/package.json:2-15,92-94,178-179`。 | `git log -1 -- apps/cli` 返回 `341ea6eea4`，时间为 2026-10-29T18:11:48+08:00，主题为 schedule 与 WebUI 集成。 |
| `apps/plugin-market-generator/`。 | 本地 apps/ 目录还存在这个构建辅助 app；它不是本次 desktop/web/cli 宿主候选，本次没有继续评估其技术栈。 | 该目录是否近期独立维护未验证，不以仓库整体时间替代它的时间。 |

以上四个宿主目录均在最近六个月有本地 commit，但“在维护”规则还要求 issue 有人回应；该项对 dsh 未验证。参考仓整体最近 commit 为 2026-10-30T00:13:15+08:00，并不表示每个 app 都在同一天改过。

### main+preload 的确存在，但不是可原样接 P3 的空壳

1. `D/apps/desktop/src/main.ts:259-286` 的 `createWindow()` 已设置 preload、`nodeIntegration:false`、`contextIsolation:true`、`sandbox:true`；`D/apps/desktop/tsdown.config.ts:99-111` 明确把 sandbox preload 打成单文件 CommonJS。这些是可以参考或小范围复制的现成骨架，不需要重新摸索 Electron 的隔离配置。
2. `D/apps/desktop/src/preload-app.ts:79-118` 已提供按协议/域名与主 frame 限制的 `contextBridge.exposeInMainWorld`，但公开的是 onboarding、directory-picker、boot、platform 和 product API，并没有 P3 的 `pbots:mux-port` 协议。`D/apps/desktop/src/ipc.ts:10-42` 的原版 IPC 表也不是 P3 三通道表。
3. 原版 desktop boot 在 `D/apps/desktop/src/main.ts:786-790` 返回 `{injections, streamBaseUrl}`；`D/apps/web/src/main.ts:21-35` 再将它写入 renderer 的 `__DSH_TRANSPORT__`。P3 要求 renderer 不自行建立物理 mux socket，并用 requestId→MessagePort carrier，因此原版壳不能“不改上游、只链接 workspace”就满足本项目。P3 已定要求见 `work/p3-contract/CONTRACT.md:23,63-74`。
4. 原版 main 的依赖包含后台控制器、项目管理器、欢迎页、账户连接、更新与强制更新策略，证据为 `D/apps/desktop/src/main.ts:26-69`；将整套 desktop-host 原样带入会引入第二套后台生命周期，而不是仅复用一个 BrowserWindow。
5. `D/apps/desktop/package.json:5` 标为 private，`npm view @deepseek-ai/dsh-desktop version --json` 本次得到 E404。因此没有已验证可直接 `pnpm add` 的 desktop 发布包；现成源码存在，不应把 npm 不存在误写成“没有 Electron 壳”。
6. 若以后确实复制窗口或 preload 片段，来源应记录为 `https://github.com/deepseek-ai/deepseek-harness@ce7073d51254c26cd63b22a60835b8f948deb447:apps/desktop/src/main.ts`、`apps/desktop/src/preload-app.ts` 或 `apps/desktop/tsdown.config.ts`，并在实际文件头、commit 正文保留准确的所用路径。

[D1] 的本地证据为 `D/apps/desktop/package.json:2-16,49-54,56-89`、`D/apps/desktop/tsdown.config.ts:35-112`。[D2] 为下节的 dsh client 构建约定。[D3] 为本节第 2–4 条的启动与后台证据。

## 2. 在维护的 Electron+Vite 候选比较

### 候选 A：electron-vite，推荐

- 仓库为 [alex8088/electron-vite](https://github.com/alex8088/electron-vite)，本次 GitHub MCP 返回 5,638 stars，属于约 5.6k 的量级。最新 commit 为 `23d7bfc8ba4a0f877ed4ef8ab193f2baedea50c2`，日期为 2026-10-14；最近 release 为 [v6.0.0，2026-10-14](https://github.com/alex8088/electron-vite/releases/tag/v6.0.0)。它是持续依赖的构建工具，不应把工具仓误当成含所有产品桥接代码的模板。
- [固定版本 package.json](https://github.com/alex8088/electron-vite/blob/23d7bfc8ba4a0f877ed4ef8ab193f2baedea50c2/package.json) 声明兼容 Vite `^6 || ^7 || ^8`，Node 要求为 `^20.19.0 || >=22.12.0`；所以可保留 dsh 的 Vite 6，不必为了换壳先迁移 Vite 8。npm 实查得到 `electron-vite=6.0.0`，`time.modified=2026-10-14T16:05:05.896Z`。这些是 [E1] 的版本证据。
- 已读 [固定版本构建插件源码](https://github.com/alex8088/electron-vite/blob/23d7bfc8ba4a0f877ed4ef8ab193f2baedea50c2/src/plugins/electron.ts)：其 `electronMainConfigPresetPlugin`、`electronPreloadConfigPresetPlugin` 和 `electronRendererConfigPresetPlugin` 接受并合并 Vite 配置，renderer 默认根目录为 `src/renderer`，main/preload 按 package type 推断 ESM/CJS。我们应显式配置 sandbox preload 为单文件 CJS，不能照 ESM 默认输出直接交给 sandbox preload。
- [官方脚手架文档](https://electron-vite.org/guide/) 给出的 React TS 命令为 `pnpm create @quick-start/electron my-app --template react-ts`，对应 npm 包实际是 `@quick-start/create-electron`，本次查到版本 1.0.31、修改日期 2026-10-14。它的源码位置是 [alex8088/quick-start/packages/create-electron](https://github.com/alex8088/quick-start/tree/master/packages/create-electron)。不要安装 npm 上名叫 `create-electron` 的无关老包；后者本次查到的修改时间是 2022-06-14。为了版本可复现，实际生成时应锁脚手架版本，而不是保留 `latest`。
- [E3] 为 [issue 927 的 owner 回复](https://github.com/alex8088/electron-vite/issues/927#issuecomment-6346902877)，日期为 2026-10-22；它证明近期 issue 有维护者回应。该问题也提醒 Electron 42 起二进制下载机制改变，不能沿用旧模板的 postinstall 假设。
- [MIT LICENSE](https://github.com/alex8088/electron-vite/blob/23d7bfc8ba4a0f877ed4ef8ab193f2baedea50c2/LICENSE) 已读；本次推荐的是依赖工具而非复制其内部构建插件。

### 候选 B：Electron Forge + Vite，备选

- 仓库为 [electron/forge](https://github.com/electron/forge)，本次 GitHub MCP 返回 7,169 stars，属于约 7.2k 的量级。最新 commit 为 [04bdd4c829b8cc3aab84eed55821b9e6792c6173，2026-11-02](https://github.com/electron/forge/commit/04bdd4c829b8cc3aab84eed55821b9e6792c6173)。最近 release 为 [v8.0.1，2026-09-29](https://github.com/electron/forge/releases/tag/v8.0.1)。
- [F1] 为上述 release、[MIT LICENSE](https://github.com/electron/forge/blob/48f38bb11debbd16737071f20784ff9c09ec502c/LICENSE) 以及 npm 实查结果：`@electron-forge/plugin-vite=8.0.1`、`@electron-forge/template-vite=8.0.1`，两者修改日期均为 2026-09-29。Forge 8 已把 Vite 插件升为稳定支持，要求 Node >=22.17 并面向 Vite 8；不可沿用“Forge Vite 仍是实验插件”的旧结论。
- 已读 [ViteConfig.ts](https://github.com/electron/forge/blob/48f38bb11debbd16737071f20784ff9c09ec502c/packages/plugin/vite/src/ViteConfig.ts)：插件分别加载 main/preload/renderer 用户配置，能承载 dsh client 构建约定。已读 [模板 main.ts](https://github.com/electron/forge/blob/48f38bb11debbd16737071f20784ff9c09ec502c/packages/template/vite/tmpl/main.ts)，其中已有 BrowserWindow、dev URL/production file 分流与 `preload.cjs` 路径。
- [F2] 为 [模板 forge.config.mts](https://github.com/electron/forge/blob/48f38bb11debbd16737071f20784ff9c09ec502c/packages/template/vite/tmpl/forge.config.mts)：它已有 main/preload 双入口、renderer 入口和 deb/rpm 等 makers，但默认 `EnableNodeCliInspectArguments:false`。Playwright 官方列明关闭此 fuse 会导致 Electron launch 超时，因此测试产物不能直接使用这一默认配置；不能为了 E2E 把正式分发产物的安全 fuse 无条件放开。
- 已读 [模板 preload.ts](https://github.com/electron/forge/blob/48f38bb11debbd16737071f20784ff9c09ec502c/packages/template/vite/tmpl/preload.ts)，其内容只有注释，因此这里没有现成 M2 桥。Forge 不会比 electron-vite 少写产品 IPC；它的优势是已有打包发布流水线，而不是已实现 dsh 适配。
- [F3] 为 [issue 4420 的回复与 PR 4421 链接](https://github.com/electron/forge/issues/4420#issuecomment-5848521211)。这是 contributor 回应而非本次独立核验其 maintainer 身份；结合近期 release 和上游修复记录，存在活跃处理 issue 的证据。

### 两者接 dsh client 都必须保留的约定

1. **CSS Modules 和 `?inline` 无须自建 loader。** 它们是 [Vite 内建能力](https://vite.dev/guide/features.html#css-modules)；`?inline` 返回处理后的 CSS 字符串且不自动注入样式，见 [官方说明](https://vite.dev/guide/features.html#disabling-css-injection-into-the-page)。dsh 实例见 `D/packages/client/ui-chat/src/client/chat/ContextBody.tsx:12` 与 `D/packages/client/ui-theme/src/client/styles.ts:2-5`。这两种 Vite 工具都能配置该流水线，但本次未做实际 bundle 验证。
2. **workspace 链接应消费各包的 exports 和构建产物，不要粗暴 alias 所有 client 包到 src。** `D/apps/web/vite.config.ts:232-252` 明写 workspace 包按各自 exports 取 built `lib`，CSS 仍经过 Vite；运行时插件通过 client module system 加载，并不都进入 renderer 静态图。把模板拷入任意目录再直接导入几份源码，不能等同于接上 dsh。
3. **React 必须单一 identity。** `D/apps/web/vite.config.ts:232-240` 使用 `dedupe:['react','react-dom']`；包中注释说明应该从 renderer 的 node_modules 解析，且 `react/jsx-runtime`、`react-dom/client` 也属于这两个 package identity。模板若默认 React 19，应按 dsh 的 React 18 版本对齐，不应直接采纳模板最新大版本。
4. **平台模块表不仅是 Vite alias。** `D/packages/client/web/src/platform.ts:1-15` 规定 React、Cordis、store、slots、primitives、dockkit 等共享模块；`D/packages/client/web/src/seed.ts:1-42` 用静态 imports 建立 `getStaticModules()`，供运行时插件共享同一实例。应复用上游 web shell/seed，而不是另造一张不完整的 registry。
5. **完整 apps/web 配置不能直接拿给模板的 Vite dev server。** `D/apps/web/vite.config.ts:12-14,47-54` 主动拒绝裸 `vite serve`，因为缺少 `__DSH_BOOT__`；正式入口需要 dsh boot/injections。应在自己的 renderer 配置中保留必要 dedupe、环境定义和 `node:module` stub，并按 P3 注入受限 transport；不是简单 `mergeConfig(apps/web)` 后就宣称能启动。已有 desktop-web boot 路径见 `D/apps/web/src/main.ts:17-37`。
6. **依赖 externalization 必须按进程区分。** electron-vite [官方依赖说明](https://electron-vite.org/guide/dependency-handling) 明确 main/preload 的 dependencies 可外置，而 renderer 应打包；sandbox preload 不能任意 externalize 普通 Node 包。workspace 的 built lib、运行时 client bundle 及最终打包资源必须分别确认，不能用“pnpm 已链接”推定离线产物完整。

因此推荐第 1 级 `electron-vite@6.0.0`，不选择第 5 级自建构建器，也不为了复用一个窗口而引入完整 dsh desktop-host。上述适配量为源码判断，不是已完成工时或 W0 spike 结果。

## 3. Playwright `_electron` 能否断言 M2 的 requestId→port

### 能测真实链路，但不能把端口交给测试 runner

1. [P1] [Playwright Electron 官方 API](https://playwright.dev/docs/api/class-electron) 仍标为实验支持，当前写明支持 Electron v21+；它支持 `_electron.launch()`、main 的 `electronApp.evaluate()`、`firstWindow()` 和普通 Page 操作。它不保证所有 Electron 版本组合都稳定，且要求 `EnableNodeCliInspectArguments` 不为 false。
2. [P2] [ElectronApplication.evaluate 官方 API](https://playwright.dev/docs/api/class-electronapplication#electron-application-evaluate) 在 Electron main 执行代码，返回可序列化结果；[browserWindow(page)](https://playwright.dev/docs/api/class-electronapplication#electron-application-browser-window) 可得到对应 BrowserWindow 的 JSHandle。因此可以在 main 内保留 `MessagePortMain`、在 page 内保留 DOM `MessagePort`，只把 requestId、帧内容、计数、关闭/超时状态传回测试 runner。不要把 port 从 evaluate 的返回值拿到 Node 测试进程再转交。
3. [P3] [page.exposeFunction 官方 API](https://playwright.dev/docs/api/class-page#page-expose-function) 把一个函数安装到页面 window，调用时回到 Playwright 侧，并且跨导航保留。它适合 `report({requestId, frame, outcome})` 之类观测；文档没有提供 transferable MessagePort 的传输约定，不能把它作为 M2 carrier。即使测试里给页面暴露一个假的请求函数并返回成功，也绕过了真正的 ipcRenderer、preload isolated world 和 Electron 端口转交，不能证明 M2。
4. [P4] [`contextBridge.exposeInMainWorld`](https://www.electronjs.org/docs/latest/api/context-bridge) 是 Electron preload API，不是 Playwright API。它代理函数、复制冻结数据；不能用它直接返回一个仍保留原生能力的 MessagePort，也不要暴露整个 ipcRenderer。官方明确 Electron 29 起 ipcRenderer 不能通过 contextBridge 传过去。正确用法是公开窄的“申请端口”函数，而让端口本身沿 postMessage 转移。
5. [P5] [Electron MessagePorts 官方教程](https://www.electronjs.org/docs/latest/tutorial/message-ports) 明确 `send`/`invoke` 不能转移端口，main 应经 `webContents.postMessage(...,[port])` 发送；context-isolated preload 再通过 `window.postMessage(..., event.ports)` 交给 main world。教程还要求页面检查 `event.source===window`，并演示在 preload 等待页面加载后转交。它覆盖的是本项目所需的真实传输手段，而不是一项 Playwright 特殊支持。

### 对现有 M2 的最小可断言方法

以下是建议的验收设计，不是已执行结果；依据为 `work/p3-contract/CONTRACT.md:63-74` 与 [P1]–[P5]。

- 测试应启动实际 Electron main 和实际 preload，在页面先安装 message 观测器，再通过产品公开的窄 API 申请端口。页面观测 `{pbotsMux:requestId}`、`event.source===window`、恰好一个 `event.ports[0]`，并在页面 realm 内 `start()` 和监听消息；runner 只读取结构化结果。`page.evaluate()` 可以留在页面里等待 Promise 结果，因此 `exposeFunction` 并非必需。
- main 侧用 `electronApp.evaluate()` 设置确定性的响应或观测，保留真实 MessageChannelMain；通过实际 `event.sender.postMessage('pbots:mux-port',{requestId,ok:true},[port2])`、实际 preload relay 走到页面。必要时为 lower-level 桥测试设置同样窄的测试请求通道，但 D2/D4 的集成验收仍必须调用真实产品通道，不能全部换成 mock。
- 至少同时申请两个不同 requestId，并对两个端口返回不同的帧；必须断言请求与端口不串线、成功后才从 CONNECTING 到 OPEN、双向帧可达，以及页面不会接收错误 source 或未知 requestId。只看 UI 最终出现一句文本，不足以证明 requestId→port 映射正确。
- D2 应在真实 UI 触发两 bot 并发流式并验证各自归属；D4 应验证 renderer reload 后旧 port/stream 已清理、新 generation 端口重新就绪，旧 requestId 或迟到端口不接到新 W。失败不带 port、等待超时和 socket 断开也要断言关闭/失败，而不只覆盖成功 transfer。
- 不应把 dsh 的 `D/apps/desktop/tests/preload.e2e.ts` 直接算作这类真机 E2E：它在 `:1-5,51-70` 使用 Vitest、VM 和假的 Electron globals，能验证 preload bundle 在受限 require 下加载，但不验证 Chromium/Electron 的原生 MessagePort transferable 语义。

### 版本与启动注意

首轮建议选与本地 dsh 对齐的 **Electron 44.7.0**，而非仅为 `_electron` 的最低支持去降到 Electron 21，也不必直接追 npm 当前 latest 45.2.1。Playwright 可先锁 **1.64.1**；本次 npm 已验证这两个具体版本存在，Playwright engines 为 Node >=20。构建用 Node 仍应满足 dsh 的 >=24.9.0，不能因为 Playwright 支持 Node 20 就降低 dsh 要求。这个组合尚待 W0 的冷启动、真实端口双向传输与重载 smoke；本调研不宣称已经验证通过。

Electron 42 起不再依靠 postinstall 下载二进制，[官方公告](https://www.electronjs.org/blog/electron-42-0#electron-no-longer-downloads-itself-via-postinstall-script) 给出显式 `install-electron` 或首次启动下载的方式。CI/E2E 应在受控准备阶段确认二进制已下载，避免把网络等待误诊为 `_electron.launch` 或 MessagePort 的兼容性问题。所有实际运行都应采用临时 HOME、临时 PBOTS_DATA_DIR；不触碰真实用户目录，也不为测试更改正式构建的安全隔离。

[P6] 的许可证出处为 [microsoft/playwright/LICENSE](https://github.com/microsoft/playwright/blob/main/LICENSE) 和 [electron/electron/LICENSE](https://github.com/electron/electron/blob/main/LICENSE)。该项仅记录许可证出处，不代表本次已深读这两个仓的实现。
