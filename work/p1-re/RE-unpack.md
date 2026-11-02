# RE-unpack · grok-bot 0.78.1 解包与路径地图

日期：2026-11-01 · 目标：`/home/lingxufeng/Downloads/grok-bot_0.78.1_amd64.deb`（112,144,372 B）

## 0. 产物身份（D2 锚点）

```
sha256: 55d2a34cfff762342251ffa9b1321a70f08b603f227f886e18b2c1c5e73ded1d  /home/lingxufeng/Downloads/grok-bot_0.78.1_amd64.deb
```

### 可复现解包命令序列（从 deb 到 app/ 树）

```bash
# 前置：/dev/shm 有足够空间（解出约 380 MB）；源 deb 全程只读
ROOT=/dev/shm/grok-re/0.78.1
DEB=/home/lingxufeng/Downloads/grok-bot_0.78.1_amd64.deb

# 1) deb 成员（ar 归档：debian-binary / control.tar.xz / data.tar.xz）
mkdir -p "$ROOT/deb" && cd "$ROOT/deb" && ar x "$DEB"

# 2) data.tar.xz → 安装目录（产出 "$ROOT/data/opt/Grok Bot/"）
mkdir -p "$ROOT/data" && cd "$ROOT/data" && tar -xf "$ROOT/deb/data.tar.xz"

# 3) app.asar → 可读源码树（产出 "$ROOT/app/"，897 文件）
npx -y @electron/asar@4.3.1 extract "$ROOT/data/opt/Grok Bot/resources/app.asar" "$ROOT/app"
```

校验点：`ar t` 应列出 `debian-binary control.tar.xz data.tar.xz`；`app.asar` 应为 52,649,984 B（sha256 `78af6f9dfda8f60f195cd81902261ccb8da61be6698f1e94be7673a64c2b34eb`，主会话 2026-11-01 12:35 实测于 `data/opt/Grok Bot/resources/app.asar`）；解包工具锁定 `@electron/asar@4.3.1`（与 RE-w05 §1 一致，不锁版本会拉 latest、不可复现）；`app/package.json` 的 `"version": "0.78.1"`、`"main": "dist/electron-main/main.cjs"`。app.asar.unpacked 内的 9 个 .node 与 `app/dist/deps/runtime-deps-manifest.json` 的 `nodeFiles` 一一对应（asar extract 会把它们一并还原进 app/ 树）。

## 结论（先行）

1. **解包完成**。deb → `data.tar.xz` → `/opt/Grok Bot/` → `resources/app.asar`（52,649,984 B）已用 `npx -y @electron/asar extract` 解成可读目录，全部保留在 `/dev/shm/grok-re/0.78.1/`。源 deb 只读未动。
2. **这是一个 Cursor 系（Anysphere/sand）产品**：package.json `name: "sand"`、author SpaceXAI、homepage cursor.com、依赖全是 `@anysphere/*` workspace 包。主进程为 CJS bundle（非 ESM），renderer 为 Vite/rolldown 风格 hashed-chunk 的 React SPA。
3. **native 模块共 9 个 .node 文件**，与 app 自带的 `deps/runtime-deps-manifest.json`（`required`/`nodeFiles` 字段）逐条一致，无遗漏。
4. 应用内嵌 `/home/box` 沙箱路径体系（`sand-data`、`agent-data`、`reference/` 下有 `debugging-the-box.md` / `app-ui.md` / `app-actions.md`），后续 RE 找 agent 沙箱逻辑从 `electron-main/main.cjs` 的常量入手。

## 1. 解包目录结构（/dev/shm/grok-re/0.78.1/）

```
/dev/shm/grok-re/0.78.1/
├── deb/                          # ar 解出的 deb 成员（data.tar.xz 112MB 等）
│   ├── control.tar.xz / data.tar.xz / debian-binary
├── data/opt/Grok Bot/            # data.tar.xz 解出的安装目录（Electron 运行时 + app.asar 原件）
│   ├── grok-bot                  # Electron 主二进制 220,163,288 B
│   └── resources/
│       ├── app.asar              # 52,649,984 B（原件，勿动）
│       ├── app.asar.unpacked/    # asar 外置的 .node（9 个，与下方 app/ 内一致）
│       ├── apparmor-profile / icon.png
└── app/                          # ★ asar 解出的可读源码树（897 文件，56 MB）
    ├── package.json              # 5,153 B
    └── dist/
        ├── electron-main/        # 主进程：149 文件，8.1 MB
        ├── electron-preload/     # 预加载：6 文件，232 KB
        ├── renderer/             # 渲染进程：697 文件，39 MB
        ├── deps/                 # native 模块 + JS 依赖：41 文件，3.9 MB
        ├── local-exec-daemon/    # 本地执行守护：2 文件，3.9 MB
        └── node-agent-coordinator/  # agent 协调器：1 文件，1.2 MB
```

## 2. 路径地图（后续 RE 要找 X 去哪里）

所有路径相对 `/dev/shm/grok-re/0.78.1/app/`。

### main（主进程，CJS bundle，已 minify）

| 文件 | 大小 | 说明 |
|---|---|---|
| `dist/electron-main/main.cjs` | 11,952 B | **package.json `main` 入口**。bootstrap：设 `NODE_PATH=../deps` 并 `Module._initPaths()`，再加载 main-core/main-app；内含 `/home/box` 路径常量（`sand-data`、`agent-data`、`reference/debugging-the-box.md` 等） |
| `dist/electron-main/main-app.cjs` | 3,470,507 B | 主进程主体（app 生命周期、窗口） |
| `dist/electron-main/main-core.cjs` | 989,495 B | 主进程核心逻辑 |
| `dist/electron-main/proto.cjs` | 1,429,117 B | protobuf 定义（connectrpc/@bufbuild） |
| `dist/electron-main/onepassword-connection-service.cjs` | 107,436 B | 1Password 集成 |
| `dist/electron-main/locales/` | 36 文件 | i18n（lingui） |
| `dist/electron-main/menubar-tray/assets/` | png | 托盘图标（bot-arch/bean/blob 等表情） |

找主进程行为 → `main.cjs`（bootstrap/常量）→ `main-app.cjs` / `main-core.cjs`（3.5MB/1MB minify，需 beautify 后 grep）。

### preload（6 文件，均 .cjs）

`dist/electron-preload/`：`preload.cjs`（133,662 B，主 preload）、`preload-vnc.cjs`（49 KB）、`preload-desktop-mount-panel.cjs`、`preload-desktop-mount-capture-overlay.cjs`、`preload-webview.cjs`、`preload-avatar-source.cjs`。IPC 面孔（contextBridge 暴露了什么）→ 这里。

### renderer（React SPA，Vite/rolldown 产物，697 文件 39 MB）

- 入口：`dist/renderer/index.html` → `assets/index-CxzQ4vjO.js`，eager 预载 `index.eager-{common,vendor,platform,app}-*.js`（app 4.3 MB / vendor 700 KB / platform 752 KB）。
- `dist/renderer/assets/`：626 个 js chunk + 22 woff2 + 14 png + 11 svg + 7 webp + 5 wav + 5 css + 1 mp3 + 1 mjs（pdfjs worker）。
- `dist/renderer/src/electron-renderer/desktop-mount/`：2 个独立小页面 HTML（`panel/panel.html`、`capture-overlay/capture-overlay.html`，桌面挂载/截屏覆盖层）。
- 找 UI 功能 → assets 里按 chunk 文件名 grep（如 `chunk-team-bot-line-render-*.js`、`chunk-prompt-editor-*.js`、`chunk-cpp-*.js`，命名保留了语义）。

### 其他进程

- `dist/local-exec-daemon/main.cjs`（3,945,762 B）+ `messages-worker.cjs`（121 KB）：本地命令执行守护进程（`@sand/local-exec-daemon`）。
- `dist/node-agent-coordinator/main.cjs`（1,193,881 B）：agent 协调器（疑似独立 Node 进程）。

### deps（`dist/deps/`，41 文件 3.9 MB）

native 模块运行时目录（`NODE_PATH` 指向这里）+ `runtime-deps-manifest.json` + `node-addon-api`/`node-gyp-build` 辅助包 + `web-tree-sitter`（纯 wasm）。

## 3. native 模块清单（9 个 .node，已交叉印证）

来源三处一致：`find app -name "*.node"`、`data/.../app.asar.unpacked/`、`dist/deps/runtime-deps-manifest.json` 的 `nodeFiles`。

| .node 路径（相对 app/dist/deps/） | 包名（package.json 实名） | 大小 B |
|---|---|---|
| `@anysphere/jpeg-napi/jpeg-napi.linux-x64-gnu.node` | `@anysphere/jpeg-napi` | 1,190,840 |
| `cursor-proclist/build/Release/cursor_proclist.node` | `cursor-proclist` | 148,632 |
| `tree-sitter/build/Release/tree_sitter_runtime_binding.node` | `@cursor/node-tree-sitter`（目录名与包名不同） | 678,240 |
| `tree-sitter-bash/prebuilds/linux-x64/tree-sitter-bash.node` | `tree-sitter-bash` | 1,383,184 |
| `sand-address-lookup/build/Release/sand_address_lookup.node` | `sand-address-lookup` | 27,144 |
| `sand-card-text-recognition/build/Release/sand_card_text_recognition.node` | `sand-card-text-recognition` | 18,848 |
| `sand-devicecheck/build/Release/sand_devicecheck.node` | `sand-devicecheck` | 31,352 |
| `sand-notification-settings/build/Release/sand_notification_settings.node` | `sand-notification-settings` | 22,952 |
| `sand-window-capture/build/Release/sand_window_capture.node` | `sand-window-capture` | 23,016 |

另有 1 个 wasm：`dist/deps/web-tree-sitter/tree-sitter.wasm`（185,642 B，非 .node）。全部为 linux-x64。

## 4. package.json 关键字段（/dev/shm/grok-re/0.78.1/app/package.json 原文摘录）

```json
"name": "sand",
"productName": "Grok Bot",
"desktopName": "grok-bot.desktop",
"version": "0.78.1",
"description": "Grok Bot desktop agent",
"author": "SpaceXAI",
"homepage": "https://cursor.com",
"private": true,
"type": "module",
"main": "dist/electron-main/main.cjs",
"sandTrack": "stable",
"sandBuiltAt": "2026-10-28T02:30:43.089Z"
```

依赖概貌（约 100 项，三类）：
- **`@anysphere/*` workspace 包约 50 个**（agent / agent-core / agent-exec / mcp-core / chat-inference / proto / grok-bot / voice-call-harness / browser-smoke …）——monorepo 内部包，不发布。
- **`@sand/*` workspace 包 9 个**（client / host / local-exec-daemon / local-exec-protocol / primitives / sand-eval-runner / shared …）。
- **外部依赖**：UI（react、@tanstack/react-query、@tiptap 全家桶、@stylexjs/stylex、motion、@dnd-kit、@base-ui/react、lingui）、RPC（@connectrpc/connect*、@bufbuild/protobuf）、观测（@sentry/electron 7.4.0、@opentelemetry/*、@statsig/js-client）、文档解析（pdfjs-dist 5.4.296、mammoth、xlsx、katex）、`ws` 8.21.3、`zod`、native 包（`cursor-proclist: "file:../vscode/native-modules/cursor-proclist"`、5 个 `sand-*: "file:native/..."`）。

## 5. 与 0.18 的模块清单 diff（D7 输入）

**本节已由 RE-w05.md §6 取代（2026-11-01）：以下原推导行降级为『推导，已被 W0.5 取代』，仅保留 W0.5 解不出来的行。**

对照物：`/home/lingxufeng/bot/repos/grok-bot-0.18-reconstructed/`（0.18.0 macOS 版的源码重建仓）。0.18 侧证据取自其 `src/app/package.json`（重建的 0.18 产物清单）、`scripts/lib/clean-build.mjs`（dist 划分，标注每项是 "从 0.18 checksum-pinned runtime 拷贝" 还是 "clean-source 重建"）、`scripts/verify.mjs`、`scripts/lib/macos-package-verification.mjs`（`RUNTIME_ROOTS = ["dist/deps","dist/native","dist/node-deps"]`）、`manifests/reconstruction/renderer-closure.json`（shippedAssets 131）。注意：0.18 侧是重建仓推导的产物结构，非原版 asar 直接解包（research-archives 里只有 dmg/exe 未解），删除侧结论置信度略低，已逐条标注证据模式。

### 5.1 native 模块（0.18 → 0.78.1）

| 状态 | 模块 | 证据 |
|---|---|---|
| 新增 | `@anysphere/jpeg-napi` | 0.78.1 实测 .node；0.18 两份 package.json 均无 |
| 新增 | `sand-address-lookup` / `sand-card-text-recognition` / `sand-devicecheck` / `sand-notification-settings` / `sand-window-capture`（5 个，均为 `file:native/...`） | 同上 |
| ⚠ 已被 RE-w05 推翻：0.18 原版 tree-sitter/tree-sitter-bash/web-tree-sitter 实物在 **dist/deps/**（find 实测）；原版无 dist/node-deps 目录，verify.mjs 的 node-deps 是重建仓为 daemon Node ABI 重建的构建路径，非原版布局 → 应为「保留（不换位）」〔原判：保留（换位）〕 | tree-sitter 系 | 0.18 在 `dist/node-deps/tree-sitter{,-bash}/build/Release/*_binding.node`（verify.mjs L97-98，为 daemon 的 Node ABI 重建）；0.78.1 在 `dist/deps/`（tree-sitter 为包名 `@cursor/node-tree-sitter`，bash 改用 `prebuilds/linux-x64/tree-sitter-bash.node` prebuild 形态） |
| 保留 | `cursor-proclist` | 两版 package.json 均有 `file:../vscode/native-modules/cursor-proclist` |
| 删除 | `better-sqlite3`（0.18 `dist/deps/better-sqlite3/build/Release/better_sqlite3.node`，verify.mjs L53） | 0.78.1 全树无 better-sqlite3 / .sqlite 相关 native；artifact-runtime 模式（原版拷贝），删除结论较硬 |
| 删除 | `sand-webauthn-signer`（0.18 `dist/native/sand-webauthn-signer`，macOS 原生可执行，verify.mjs L58） | 0.78.1 无 dist/native；linux 版是否曾有未验证 |

### 5.2 dist 顶层结构

| 状态 | 目录/bundle | 说明 |
|---|---|---|
| 新增 | `electron-main` 拆分：0.18 单个 `main.cjs`（半 minify，约 50 万行，bindings manifest 锚点 line 506728）→ 0.78.1 五件套 `main / main-app / main-core / proto / onepassword-connection-service.cjs` | proto 单独成 1.4MB bundle，RPC 面显著扩大 |
| ⚠ 已被 RE-w05 推翻（针对本行括注「preload-dev-controls 是重建仓自建不算」）：0.18 原版 preload 共 4 件，**preload-dev-controls.cjs 与 dist/electron-dev-controls/main.cjs 均为原版实物**；0.78.1 删除了它们〔原状态：新增〕 | `electron-preload` 新增 3 个：`preload-avatar-source.cjs`、`preload-desktop-mount-panel.cjs`、`preload-desktop-mount-capture-overlay.cjs`（0.18 原版 preload 为 preload / preload-webview / preload-vnc；preload-dev-controls 是重建仓自建不算） | desktop-mount 对应 0.78.1 renderer 新增的 `src/electron-renderer/desktop-mount/{panel,capture-overlay}.html` 双页面 |
| 新增（目录级） | 无全新顶层目录；新能力都装进既有目录 | — |
| 删除 | `dist/host/`（0.18 `host-main.cjs` + agent-isolation 2 个 worker + extensions 2 个 worker；clean-build.mjs L60-64，host-main 为 artifact-fallback 从原版 recovered） | 0.78.1 dist 下无 host 目录；host 逻辑疑似并入 main 或 node-agent-coordinator（待 D7 归属） |
| ⚠ 已被 RE-w05 推翻（前提不成立）：0.18 原版 dist 无 box-exec-daemon 目录；它是重建仓 clean-source 构建产物，非原版产物形态〔原状态：删除〕 | `dist/box-exec-daemon/`（0.18 重建自 `source/box-exec-daemon/`，clean-source 模式） | 0.78.1 无；原版 0.18 是否有此目录未直接验证 |
| 删除 | `dist/native/`、`dist/node-deps/` 两个 runtime 根消失，native 收敛到 `dist/deps/` 一处 | 0.78.1 实测；0.18 侧 RUNTIME_ROOTS 证据 |
| 保留 | `electron-main` / `electron-preload` / `renderer` / `local-exec-daemon` / `node-agent-coordinator` / `deps` | local-exec-daemon 0.78.1 还多了 `messages-worker.cjs` |

### 5.3 依赖（workspace 包名）diff

新增 workspace 包（24 个 @anysphere/* + 6 个 @sand/*，即后续 RE 要逐个找归属的「新」项）：
- **@anysphere/***：agent-store-ids、attention-count、browser-smoke、canvas-shared、card-photo-text、device-local-tools、draft-revision、dune、dune-reliability、file-kind-icons、grok-bot-harness、jpeg-napi、link-preview、marketplace-category、mcp-core、messages-mac、metrics、orbit-client、otel-proto、sand-playwright-runtime、slack-app-setup、usage-banner、voice-call-harness、xai-commerce-prepaid
- **@sand/***：host、local-exec-daemon、local-exec-protocol、primitives、sand-eval-runner、shared-node（另有 dune 从 `@sand/dune` 迁到 `@anysphere/dune`）

> ⚠ 已被 RE-w05 推翻（针对下行 `undici` 项）：0.18 原版 package.json 无 undici（两边均无）。原行保留不删，`undici` 项仅作历史记录。

删除：`@sand/dune`（迁名）、`@sentry/node`（→ `@sentry/node-core`）、`highlight.js`、`mermaid`（0.78.1 用自绘 chunk 如 `chunk-visualization-three-runtime-*` 替代？未验证）、`rehype-katex`、`undici`。

新增外部依赖：`@lingui/core+react`（对应 `electron-main/locales/` 36 文件 i18n，0.78.1 新增国际化）、`pele`、`qrcode`、`tldts`、`mdast-util-from-markdown`、`@tiptap/extensions`。

### 5.4 renderer 规模

0.18 shippedAssets 131（renderer-closure.json）→ 0.78.1 renderer 697 文件（626 js chunk + 71 静态资源），约 5.3 倍；0.18 时代无 `dist/renderer/src/electron-renderer/` 子页面。

## 局限与未验证项

- **代码全部 minify**：main/renderer 均为打包压缩产物，无 source map（asar 内未发现 .map）；后续 RE 需 beautify（如 `npx prettier` / webcrack）后再读。
- **0.18 侧非原版直接解包**：diff 基于 0.18 重建仓的推导（package.json 重建 + 脚本内 pinned runtime 清单 + manifests），dmg/exe 原件未解；「删除」项中 box-exec-daemon、dist/host 原版存在性依赖重建仓的 artifact-fallback/clean-source 标注，建议 D2 复核时解 0.18 dmg 一次做硬对齐。
- **平台差**：0.18 对照物是 macOS-arm64 重建，0.78.1 是 linux-amd64 实物；`sand-webauthn-signer`（macOS 原生可执行）与 `sand-devicecheck`/`messages-mac` 的平台对应关系未验证。
- 未做 native .node 的导出符号/反编译分析（本任务只到清单级；且本机无 Ghidra/IDA，.node 深度分析需 objdump 级或另配引擎）。
- `local-exec-daemon` / `node-agent-coordinator` 与主进程的拉起关系（谁 spawn 谁、协议）未验证，仅确认文件存在与规模。
- Electron 版本号未从 `grok-bot` 二进制提取（LICENSE.electron.txt 存在但未读版本行）；如需要可补 `strings` 一步。
- asar 内 897 文件 vs asar 52.6MB 解出 56MB：差值为 unpacked 外置文件在 extract 时被复制进 app/ 树，属正常。
