# RE-w05 · 0.18 原版 asar 四轴机械 diff + 0.78.1 入口归属

日期：2026-11-01 · 脚本：`work/p1-re/w05/w05.py`（纯 stdlib，`python3 -I w05.py` 复跑） · 产物：`/dev/shm/grok-re/w05/*.tsv`（副本在 `work/p1-re/w05/output/`）

## 结论（先行）

1. **0.18 原版解包完成**：Setup.exe（sha256 与 SHA256SUMS 一致）用 `/tmp/7zb` 的 7za 按 7z 格式直取 `resources/app.asar`（77,815,240 B，sha256 `38e85c0e5042c0257db7925e1e55709d6d155d90d92fe26ad654127d509766e0`），`npx @electron/asar@4.3.1 extract` 解出 726 文件。**dmg 为 UDIF（尾部 koly 签名实测），7za 16.02 打不开（2 次失败）→ 跳过，本报告只用 Setup.exe（win-x64）**。0.18 与 0.78.1 存在平台差（win-x64 vs linux-amd64），影响面见 §8。
2. **四轴 diff 核心数字**：依赖新增 43 / 删除 5；chunk 语义族新增 305 / 删除 34；preload 新增 3 / 删除 1 / 保留 3，contextBridge 新键 5；proto 服务 5→7（新增 AgentStoreService、SandBoxService），GrokBotService 方法 30→414，DashboardService 方法 604→84（市场/MCP 方法保留 21 个）。
3. **proto-fields.tsv 实测 2729 条 message**（派发预估约 2373，以脚本输出为准），其中相对 0.18（main+host-main+daemon 三 bundle 全集 5318 个 message 类名）新增 1564；**重名 22 个**（派发预估 19），消歧形式 `<Msg>|1 <首字段>`。
4. **「host 从本地 bundle 改为云端下发」升级为硬证据的「改」**：0.18 原版 asar 实物含 `dist/host/`（host-main.cjs 等 5 文件、27 MB）；0.78.1 无 dist/host，`main-app.cjs` 含落盘常量 `incoming-host-bundle.tgz`。
5. **D7 自验收 PASS**：W05 新项 id 2420 个，owners.tsv 引用 2420 个，`comm -23` 差集 0（§5 命令与输出）。

## 1. 解包记录（问题 1）

```
Setup.exe sha256 464079a15ef5fa8b61ccea8fffcc78f63cfcf6df65fb0ad5e725d8b95f7e437e  == SHA256SUMS ✓
7za（/tmp/7zb/node_modules/7zip-bin/linux/x64/7za，npm 装，chmod +x）识别 Setup.exe 为 Type=7z（panel 实测复现）
7za e Setup.exe resources/app.asar -o/dev/shm/grok-re/0.18.0/        # app.asar 77,815,240 B
7za x Setup.exe "resources/app.asar.unpacked/*" → /dev/shm/grok-re/0.18.0/app.asar.unpacked/  # 581 文件 51 MB（asar unpacked 外链）
npx -y @electron/asar@4.3.1 extract /dev/shm/grok-re/0.18.0/app.asar /dev/shm/grok-re/0.18.0/app/  # 726 文件
dmg：7za l 报 Can not open the file as archive（第 1 次）；尾部 512B 含 "koly" 签名确认为 UDIF（第 2 次，p7zip 16.02 不支持该格式）→ 跳过
```

坑位记录：asar extract 首次失败（ENOENT app.asar.unpacked/...）——需先平级解出 app.asar.unpacked 再 extract；7za npm 包默认无执行位需 chmod +x。

0.18.0/app 顶层：`dist/{deps,electron-dev-controls,electron-main,electron-preload,host,local-exec-daemon,native,node-agent-coordinator,renderer}` + package.json（name `sand`，version `0.18.0`，main `dist/electron-main/main.cjs`）。

## 2. 四轴 diff 摘要（问题 2，表在 /dev/shm/grok-re/w05/）

### 轴① 依赖（axis1-deps.tsv，48 数据行）

| 类别 | 新增 | 删除 |
|---|---|---|
| @anysphere/* | 24（W05-1-1..24：agent-store-ids、attention-count、browser-smoke、canvas-shared、card-photo-text、device-local-tools、draft-revision、dune、dune-reliability、file-kind-icons、grok-bot-harness、jpeg-napi、link-preview、marketplace-category、mcp-core、messages-mac、metrics、orbit-client、otel-proto、sand-playwright-runtime、slack-app-setup、usage-banner、voice-call-harness、xai-commerce-prepaid） | 0 |
| @sand/* | 6（host、local-exec-daemon、local-exec-protocol、primitives、sand-eval-runner、shared-node） | 1（@sand/dune，迁名至 @anysphere/dune） |
| 外部 | 13（@lingui/core、@lingui/react、@sentry/node-core、@tiptap/extensions、mdast-util-from-markdown、pele、qrcode、tldts、sand-address-lookup、sand-card-text-recognition、sand-devicecheck、sand-notification-settings、sand-window-capture——后 5 个为 file:native/... 的平台 native 包） | 4（@sentry/node→node-core 迁移、highlight.js、mermaid、rehype-katex） |

注：**undici 不在删除清单——0.18 原版 package.json 本无 undici**（RE-unpack §5.3 该行为重建仓推导，被推翻）。

### 轴② chunk 语义名（axis2-chunks.tsv，340 数据行：305 新增 / 34 删除）

聚合规则（脚本内置、可复跑）：文件名尾部迭代剥 `-` + 8 字符 hash 段 `[A-Za-z0-9_$-]{8}`（至多 2 轮，0.18 为双 hash），剥后按语义名聚族；`chunk-<纯HASH>` 类丢弃。

- 删除 34 族里语义显著的：**host-main**（dist/host bundle）、**4 个 host worker**（agent-store-worker、box-store-vacuum-worker、search-index-worker、transcript-mirror-worker）、**preload-dev-controls**、**mermaid 图表族**（classDiagram-v2、stateDiagram-v2、mindmap-definition、timeline-definition、kanban-definition、cose-bilkent）及 better-sqlite3 依赖链（check-napi、compare-build、sqlite-error、readable-browser 等 node polyfill 构建）。
- 新增大族：chunk-view(74)、chunk-shared/settings/core/chat/agents(各 36)、chunk-messages(23)；另有 chunk-visualization-d3-runtime.gen / chunk-visualization-three-runtime.gen（自绘可视化，接替 mermaid 的旁证）与 desktop-mount-panel / desktop-mount-capture-overlay 双页。

### 轴③ preload 入口（axis3-preloads.tsv，7 数据行）

| 入口 | 方向 | contextBridge 键 |
|---|---|---|
| preload-avatar-source.cjs | 新增（W05-3-1） | 无 |
| preload-desktop-mount-capture-overlay.cjs | 新增（W05-3-2） | desktopMountCaptureOverlay |
| preload-desktop-mount-panel.cjs | 新增（W05-3-3） | desktopMount;desktopMountFiles |
| preload.cjs | 保留 | 0.18: coordinatorPort,desktop → 0.78.1 增 desktopMount,sandPopout,sandRenderTrace |
| preload-vnc.cjs / preload-webview.cjs | 保留 | 两版均无 exposeInMainWorld（走 MessageChannel/postMessage） |
| **preload-dev-controls.cjs** | **删除** | 0.18 侧键 `sand`；**原版 0.18 实物存在**（RE-unpack §5.2「重建仓自建」说法被推翻，配套 `dist/electron-dev-controls/main.cjs` 同在原版中，0.78.1 两者皆无） |

### 轴④ proto 服务与方法（axis4-proto.tsv，1437 数据行）

| 服务 | 0.18 方法 | 0.78.1 方法 | 新增 | 删除 | 备注 |
|---|---|---|---|---|---|
| aiserver.v1.GrokBotService | 30 | 414 | 384 | 0 | RPC 面爆炸式扩张 |
| aiserver.v1.SandBoxService | 0 | 55 | 55 | 0 | 新服务（box 管理拆分独立） |
| aiserver.v1.AgentStoreService | 0 | 25 | 25 | 0 | 新服务 |
| aiserver.v1.DashboardService | 604 | 84 | 36 | 556 | 大幅精简；**保留 21 个市场/MCP 方法**（ListMarketplacePlugins、ListMarketplaces、InstallUserPlugin、UninstallUserPlugin、CompleteMcpOAuth、ExecuteSandMcpTool、GetAvailableMcpServers、GetMcpConfig、SetMcpConfig 等） |
| aiserver.v1.AiService | 192 | 8 | 1 | 185 | 语音/图像推理面收敛（保留 StreamStt、TranscribeAudio、RunGenerateImage 等 8） |
| aiserver.v1.BackgroundComposerService | 194 | 10 | 2 | 186 | |
| aiserver.v1.AnalyticsService | 8 | 8 | 0 | 0 | 不变 |

口径：0.18 服务从 `main.cjs` 的 `typeName: "..."` 分段解析（未 minify，方法形态 `name: "X"`）；0.78.1 从 `proto.cjs` 的 `typeName:"..."` 分段解析（minified，方法形态 `name:"X",I:`）。proto.cjs 是主进程完整 RPC 面；0.78.1 daemon/coordinator bundle 各内嵌一份 GrokBotService 子集副本（typeName 各 1 处），DashboardService 仅在 proto.cjs——「删除」即主进程不再定义，不是搬到其他 bundle。

## 3. proto-fields.tsv（问题 3）

- 解析源：`0.78.1 proto.cjs` 的 `static $(){return["<Msg>|<no> <field> <type>|…"]}`，第一个字符串字面量整串入第 4 列；首字段取第 1 个字段段的 name。
- **实测 2729 条**（派发预估约 2373）；**重名 22 个**（派发预估 19）：AskQuestionResult、ComputerUseResult、ConnectScmGithub、ConnectScmGithubRepository、ConnectScmResult、CreatePlanResult、CursorRule、McpAuthResult、McpDescriptor、OutputLocation、Range、ReportBugfixResultsResult、ShellCommandParsingResult(.ExecutableCommand/.ExecutableCommandArg/.Redirect)、SkillDescriptor、SwitchModeResult、TaskResult、TodoItem、WebFetchResult、WebSearchResult——Msg 名列对重名者输出 `<Msg>|1 <首字段>` 消歧。
- 新增判定：message 名不在 0.18 三 bundle（electron-main/main.cjs、host/host-main.cjs、local-exec-daemon/main.cjs）`X = class _X extends Message` 类名并集（5318 个）中 → 新增 1564 条，编 id W05-4-n（与轴④共用编号空间，服务/方法在前、message 在后）。
- 首字段解析抽查验证：`ListAgentStoresRequest|1 n 5|...` 的字段 1 名 `n` 与 0.18 展开 constructor `this.n = 0`（int32 默认值）互相印证——紧凑格式 `<no> <name> <type>` 解析正确。
- 局限：0.18 侧 coordinator bundle 无内嵌 proto（0 类）；0.78.1 侧 proto.cjs 之外 daemon/coordinator 还有 1514/1177 条 static $ 定义（各自的 proto 副本），不在本表范围。

## 4. 入口归属表 owners.tsv（问题 4，874 数据行，列：入口名/类型/锚点/归属/ids）

进程入口行（拉起方锚点，全部 `grep -cF` 命中=1）：

| 入口 | 拉起方锚点 | 归属 |
|---|---|---|
| dist/electron-main/main.cjs（package.json main） | 自身 bootstrap `Module._initPaths()` | RE-unpack |
| main-app / main-core / proto / onepassword-connection-service.cjs | `main.cjs#"main-app"` 等（主进程内部拆分 bundle） | RE-unpack / ipc-rpc / cloud-deps |
| dist/local-exec-daemon/main.cjs | `main-core.cjs#"local-exec-daemon","main.cjs"`（路径拼接）+ fork 经 `main-app.cjs#"utilityFork:(q,V)=>gA.utilityProcess.fork"` 注入；daemon 服务名常量 `main-core.cjs#"sand-local-exec-daemon"` | ipc-rpc Q1 |
| dist/local-exec-daemon/messages-worker.cjs | `main-core.cjs#"messages-worker"`（0.18 原版 daemon 仅 main.cjs，worker 为 0.78.1 新增） | ipc-rpc Q3 |
| dist/node-agent-coordinator/main.cjs | `main-app.cjs#"node-agent-coordinator","main.cjs"` + 服务名常量 `main-app.cjs#"sand-node-agent-coordinator"`；fork 注入同上 | ipc-rpc Q1 |
| 6 个 preload | 见轴③；无 contextBridge 的 vnc/webview 走 MessageChannel | 按键归属 |

归属分布（owner_of 关键词规则固化在脚本，可复跑）：features 361、ipc-rpc 210（含兜底 199 + Q1/Q2/Q3 + proto 字典）、marketplace 81、非 MVP:box/云电脑 72、ui-shell 65、cloud-deps 约 62（账号/计费 28 + 语音 13 + 遥测 9 + mac 12 处分类）、非 MVP:computer-use 11（desktop-mount/截屏覆盖层）、RE-unpack 16、native 1（jpeg-napi）、SSH 2、VNC 1。兜底规则：proto 方法/message 与无语义命中者归 ipc-rpc（renderer 可达面由 ipc-rpc Q2 全量普查），已在脚本注释与规则表标明——**这是机械规则不是逐项人工判断**，并行批 RE 复核时可改判，改判只需改 OWNER_RULES 后复跑。

## 5. D7 自验收（问题 5）

命令（在 /dev/shm/grok-re/w05/ 下）与输出：

```
$ comm -23 <(cat axis1-deps.tsv axis2-chunks.tsv axis3-preloads.tsv axis4-proto.tsv proto-fields.tsv \
    | awk -F'\t' '$1 ~ /^W05-/{print $1}' | sort -u) \
           <(awk -F'\t' 'NR>1{n=split($5,a,";"); for(i=1;i<=n;i++) if(a[i] ~ /^W05-/) print a[i]}' owners.tsv | sort -u) | wc -l
0        # 差集为空，PASS；defined=2420 owned=2420 missing=0（脚本内置 d7-check.txt 同结论）
```

## 6. 与 RE-unpack §5 的对照

| §5 原行 | 判定 | 依据 |
|---|---|---|
| §5.1 新增 jpeg-napi | **证实** | axis1 W05-1-12 + .node 清单（RE-unpack §3） |
| §5.1 新增 5 个 sand-* native | **证实** | axis1 W05-1-38..42 |
| §5.1 tree-sitter「0.18 在 dist/node-deps（verify.mjs），保留（换位）」 | **推翻** | 0.18 原版 tree-sitter/tree-sitter-bash/web-tree-sitter 实物在 **dist/deps/**（find 实测）；原版无 dist/node-deps 目录，verify.mjs 的 node-deps 是重建仓为 daemon Node ABI 重建的构建路径，非原版布局 → 应为「保留（不换位）」 |
| §5.1 删除 better-sqlite3 | **证实** | 0.18 原版 dist/deps/better-sqlite3 存在（Setup.exe 7z 列表）；其依赖链 chunk（check-napi、sqlite-error 等）同在轴②删除族 |
| §5.1 删除 sand-webauthn-signer | **证实（平台注记）** | 0.18 原版 dist/native/sand-webauthn-signer**.exe**（win-x64 形态）；linux 侧原版是否有未验证（本报告只用 win-x64 Setup.exe） |
| §5.2 electron-main 单 main.cjs → 五件套拆分 | **证实** | 0.18 原版 dist/electron-main 仅 main.cjs；0.78.1 五件套 |
| §5.2 preload 0.18 原版为 preload/webview/vnc 三件、「preload-dev-controls 是重建仓自建不算」 | **推翻** | 0.18 原版 preload 共 4 件，**preload-dev-controls.cjs 与 dist/electron-dev-controls/main.cjs 均为原版实物**；0.78.1 删除了它们 |
| §5.2 新增 preload 3 件 + desktop-mount 双页 | **证实** | 轴③ + 轴② desktop-mount-panel/capture-overlay 族 |
| §5.2 删除 dist/host（原标注「原版存在性待复核」） | **证实** | 0.18 原版 dist/host 实物：host-main.cjs + agent-isolation/{transcript-mirror,agent-store}-worker.cjs + extensions/{content-search/search-index,box-store-sync/box-store-vacuum}-worker.cjs，共 5 文件 27 MB |
| §5.2 删除 dist/box-exec-daemon | **推翻（前提不成立）** | 0.18 原版 dist 无 box-exec-daemon 目录；它是重建仓 clean-source 构建产物，非原版产物形态 |
| §5.2 删除 dist/native/、dist/node-deps/ | **部分证实** | native ✓（含 sand-webauthn-signer.exe）；node-deps 原版不存在，该行无效 |
| §5.2 local-exec-daemon 新增 messages-worker.cjs | **证实** | 0.18 原版 daemon 目录仅 main.cjs |
| §5.3 新增 24 个 @anysphere/* | **证实（逐一吻合）** | axis1 W05-1-1..24 |
| §5.3 新增 6 个 @sand/* | **证实（逐一吻合）** | axis1 W05-1-27..32 |
| §5.3 dune 迁名 | **证实** | 删 @sand/dune + 增 @anysphere/dune |
| §5.3 删除 undici | **推翻** | 0.18 原版 package.json 无 undici（两边均无） |
| §5.3 删除 @sand/dune、@sentry/node（→node-core）、highlight.js、mermaid、rehype-katex | **证实** | axis1 删除 5 行；mermaid 另有轴② 6 个图表族删除 + visualization-d3/three 新增的旁证 |
| §5.3 新增外部依赖 7 个 | **证实 + 补 6** | 实测 13：原 7 个全对，另 @sentry/node-core（迁移）、5 个 sand-* native（file:native/...） |
| §5.4 renderer 131 → 697 文件 | **大体证实（口径差 1）** | 0.18 原版 renderer/assets 实测 130 文件（renderer-closure shippedAssets=131 为重建仓清单口径）；0.78.1 697 ✓；0.18 无 src/electron-renderer 子页 ✓ |

**对 BRIEF §6 两问的回答**：
- 0.18 asar 里真有 dist/host 吗？**有**（上文 §5.2 行）。因此「host 从本地 bundle 移到 box 云端下发」从推定升级为硬证据的「改」。
- @sand/host 打进 main/coordinator 多少？**无法按包名切分**：@sand/host 是 0.78.1 新增依赖（0.18 无此包，0.18 host 是 dist/host 独立 bundle）；0.78.1 三个 bundle（main-app/main-core/coordinator）中 grep `@sand/host|sand/host` 均 0 命中（minified bundle 无包名边界），负证据 `grep -c '@sand/host' dist/electron-main/*.cjs dist/node-agent-coordinator/main.cjs` → 全 0。0.78.1 的 host 交付走 `main-app.cjs#"incoming-host-bundle.tgz"` 云端下发，「host 代码 0 字节」仍不可断言，但宿主 bundle 里无本地 host 副本是事实。

## 7. 局限与未验证项

- **平台差**：0.18 对照物是 win-x64 Setup.exe；0.18 macOS 侧（dmg，含可能的 .app 结构差、sand-webauthn-signer 无 .exe 后缀）未验证——dmg 7za 两次失败后按派发跳过。tree-sitter .node 为 win-x64 二进制，未做符号级分析。
- **owner_of 归属是关键词规则**（脚本 OWNER_RULES，机械映射），非逐项人工判断；并行批 RE 可能改判，改判即改规则复跑。ipc-rpc 兜底 199 行的语义合理性未经人工逐行复核。
- proto「删除」口径 = 主进程 proto.cjs 不再定义；被删方法是否移到云端 host 侧执行，静态不可判（host 云端下发，见 §6）。
- proto-fields 只覆盖 0.78.1 proto.cjs（主进程面）；daemon/coordinator 各自 1514/1177 条 static $ 未导出（如需可加 `--bundle all` 扩展，本任务范围外）。
- 0.18 侧 message 类名提取依赖未 minify 的 `X = class _X extends Message` 形态；若同名类在 0.18 某 bundle 中 minify 掉（`e` 变体）会漏计，导致「新增」略偏高。三个已知 bundle 中 host-main.cjs 是否全未 minify 未逐段验证。
- asar extract 的 app/ 树含从 app.asar.unpacked 复制回的外链文件（726 文件 = asar 内 + unpacked 还原），与纯 asar 清单口径差 581 个 unpacked 条目。
- 未运行应用、未抓包（§8 红线）；所有结论均为静态证据。

## 产物清单

- `/home/lingxufeng/bot/work/p1-re/RE-w05.md`（本报告）
- `/home/lingxufeng/bot/work/p1-re/w05/w05.py`（生成脚本，可复跑）
- `/dev/shm/grok-re/w05/`：axis1-deps.tsv(48)、axis2-chunks.tsv(340)、axis3-preloads.tsv(7)、axis4-proto.tsv(1437)、proto-fields.tsv(2729)、owners.tsv(874)、d7-check.txt（副本同步在 `work/p1-re/w05/output/`）
- `/dev/shm/grok-re/0.18.0/`：app.asar + app.asar.unpacked/ + app/（保留不删）
