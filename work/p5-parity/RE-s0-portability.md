# RE-S0+R9 · 0.18 前端可移植性（S0）与运行时资产（R9）

2026-11-03 · reverse-engineer · 任务：BRIEF §12.8 S0 + R9（U0 验收）
证据目录：`work/p5-parity/evidence/s0-portability/`（截图 / 状态 JSON / 桩日志 / harness）、`work/p5-parity/evidence/r9-assets/`（63 个资产 + MANIFEST.json）

## S0 结论：能（U0 全条通过）

0.18 `frontend/` 在 `/tmp/bot-s0-build/`（隔离副本，repos/ 未动）pnpm + vite build 成功，headless Chrome + 协议 v1 桩挂载，走通完整旅程：

| U0 条款 | 结果 | 证据 |
|---|---|---|
| vite build | 成功 | 产物 `/tmp/bot-s0-build/.build/frontend-shell/`（7.8MB，343 模块，base './'，自带 sourcemap + cursor-icons 字体） |
| 侧栏 3 个 fixture bot | PASS | `run-state1.json`：agentItems=3，persona SVG 4 个，`data-grok-state` = idle/thinking/working（currentActivity 映射生效） |
| 点开 bot，transcript 渲染 | PASS | 截图 `run-1-sidebar.png`（boot 主 bot 全量）+ `run-3-switched-bot.png`（点击 Research Bot 后）：用户消息、Thinking 行、Bash/Read tool 行、assistant markdown（含代码块）、`local-tool-permission` 卡（boot agent 上出现，含 Always allow / Allow once / Never 按钮组） |
| composer 发消息，coordinator 收到合法帧 | PASS | `run-stateSend.json`：sendPromptSeen=1；帧 `run-stublogs.txt`（v1 hello→ready→request/reply） |
| entry 级 boundary = 0 | PASS | 全程 "Couldn't render this" 计数 0（state1/2/3/Send 四次采样） |
| 暗色 | PASS | `dark-*.png`（?theme=dark） |

构建要点（P5-51 前置）：Node 22.23.4 可建（engines ≥26.5 只约束整仓打包链）；依赖仅 react/react-dom/@tiptap/*/@bufbuild/protobuf + vite/@vitejs/plugin-react/sirv（vite.config 顶层 import sirv）。**必须把全部 @tiptap/* 钉死 3.14.0**（starter-kit 的 `^` 范围会把 extension-list 拉到 3.32.x，rolldown 报 `getPreviousBlockSibling` missing export）。跨目录引用仅 `source/` 4 个模块（28MB 整树复制即可，实际只打包到 proto 闭包）。

## 桩清单（实底，P5-51 shim 规格）

### window.desktop（0.18 是**扁平桥**，不是 0.78.1 的 desktop.main.*；启动校验 openExternal/getWindowState/mcp/cursorAccount/update 五个键）
旅程中实际调用（去重，完整列表 `run-stublogs.txt` / `run-stubcounts.json`）：
- **启动必须有正确回值**：`cursorAccount.getStatus`（logged-in，否则登录墙）、`cursorAccount.getSandAccessFresh`、`onboarding.getSeen`=true（否则 onboarding）、`update.getStatus`（完整 DesktopUpdateStatus 形状）、`mcp.list`、`mcp.catalog`、`agent.getPinnedAgents`、`agent.getSidebarSections`、`theme.onChanged`/`cursorAccount.onStatusChanged`/`mcp.onAuthCompleted`/`update.onStatusEvent`/`experiments.onChanged`/`foreverBox.onVncUserPresence` 等 on* 订阅（返回 unsubscribe）、`desktop.getZoomFactor`（**同步**数值）、`platform`/`isDev`（同步属性）、`getWindowState`、`deepLinksReady`、`getBoxMigrationStatus`
- **旅程外按需**：`agent.clientPersistence.read/write`（选中 bot 与 composer 草稿持久化，key 形如 `sand.client.slice.account.<authId>.selection.last-agent` / `.composer-drafts`）、`localToolPermission.clearApprovals`
- 未命中任何未实现方法（MISSING=0）；`telemetry.*` 全部为 fire-and-forget

### coordinator（协议 v1，帧型与 0.78.1 同构，只差版本号）
- 实际调用：`listAgents` `openAgentTail` `sendPrompt` `getAgentWorkflows` `getAsyncTasks` `getForeverBoxStatus`（含 `{id:'forever-box'}`）`getSubagents` `getListenerIntegrations` `getTeachRecordingStatus` `getTrays` `isAgentNetworkEnabled` `isGlobalSearchEnabled` `listAllAutomations`
- **回值校验器实打实会炸**：`getTeachRecordingStatus` 必须回 `{state:'idle', agentId:null, startedAtMs:null, maxDurationMs:<number>}`（回 `{recording:false}` → `requireTeachRecordingStatus` throw TypeError，transcript 整个不挂）——这是 12.5 死因①「shim 序列化不对」的第一个实例
- `sendPrompt` 实参形状（已捕获）：`{agentId, prompt, directAddressedAcceptance, attachmentPaths, attachmentNames, clientNonce, enterEpochMs, composedAtMs, richText}`（richText = tiptap JSON doc）
- **transcript 填充走事件不回值**：`transcript` 事件族 `{type:'snapshot', activeAgentId, entries}` / `{type:'appended', agentId, entry}` / `updated` / `cleared`（transcript-feed-source.ts）。只回 RPC 不推 snapshot，agent 切换后 transcript 为空（见坑 2）

### 坑（0.18 重构码自身的行为，P5-51 要绕）
1. **openAgent 世代竞态**：`openAgent` 在 early-return 路径上也会 `++requestGeneration`；点击切 bot 时「点击 handler + activeAgentId effect」各调一次，第二次把第一次在途的 openAgentTail 回作废，且 `selectionStore` 的 isLoadPending 永不 settle → 空会话死锁。**解法（已验证）**：coordinator 在回 openAgentTail 时同步推 `transcript snapshot` 事件，entriesByAgent 由事件路径填充，与 RPC 回值无关。
2. **切换 agent 后 composer 草稿不接输入**：切 bot 后 ProseMirror DOM 能打进字但 React draft 不更新（send 钮不出现）；boot agent 上完全正常（sendPrompt 已发出）。未深挖，疑似与坑 1 的 pending 态相关；真实 host 的 settle/事件序列可能不复现。U0 的发送步骤在 boot agent 上验收。
3. 权限卡在 boot agent 渲染、切 agent 后不重复出现（每 ask 只在所属上下文渲染一次），非缺陷。

### 0.18 vs 0.78.1 transcript entry 形状（§12.8 ①，实测）
0.18 直接消费 `kind` 判别：`message`（assistant，含 `author`）、`send-message`（用户侧，`message.type` = text/widget/…/local-tool-permission）、`tool-call`（`status: pending|running|done|failed|error|aborted`）、`thinking`、`notice`、`timeline-event`、`computer-handoff` 等（model.ts）。与 0.78.1（R3）同族，字段级差异已知一处：**权限 ask 卡 0.18 = `{requestId, status, action, target}`（action/target 为 unknown，卡片文案通用），0.78.1 = `{requestId, status, description}`**。fixture 序列化层（12.7 第 2 条）按此映射。
能力开关（§12.8 ③）：`isAgentNetworkEnabled` / `isGlobalSearchEnabled` / `isEgressTunnelAvailable` / `getTrays`→[] 已确认被启动期消费；computer/org-chart/routines/voice 入口能否全隐藏**未逐一验证**（U4′ 范围）。

## R9 结论：18/18 资产由 0.78.1 树 100% 平替，dmg 无需解

- **关键发现**：`frontend/manifests/renderer-runtime-assets.json` 列的 18 个资产（app-icon、connector logos、壁纸）在 0.78.1 解包树 `/dev/shm/grok-re/0.78.1/app/dist/renderer/assets/` 中**同名同 sha256，全部 MATCH**（逐个校验，脚本内嵌于本任务会话）→ 平替路径完整。
- dmg / Setup.exe 未解：dmg 是 UDIF(koly+zlib)，本机 bsdtar 不认（libarchive 无 DMG 支持）、无 7z/dmg2img、无 sudo；Setup.exe 是 NSIS 需要 7z。**缺的工具：p7zip-full 或 dmg2img（装上即可解 0.18 原包，但按上述发现已无必要）**。
- **bot 头像不是资产**：0.18 persona 是代码内绘 SVG（character.tsx：8 形状 × 11 色，rAF 状态机 thinking/searching/working/loading/orbit/sending，`data-grok-state` 属性），S0 截图中已带动画状态渲染，无需提取。
- 字体：0.18 token 用系统字体栈（-apple-system 等，token-installer 实测），**X-VF/XMono-VF 是 0.78.1 新增**；cursor-icons 字体 0.18 仓源码自带（build 已内嵌）。已按 0.78.1 提取 X-VF/XMono/cursor-icons/KaTeX 共 22 个 woff2 备用。
- 产出：`work/p5-parity/evidence/r9-assets/`（renderer-runtime-assets/ 18、fonts/ 22、sounds/ 6（tmp-1..5 wav + gallery-loop mp3）、imagery/ 17（壁纸、灯、频道 logo），MANIFEST.json 逐文件 sha256 + 出处）。

## 复刻要点
1. build：钉死 @tiptap 3.14.0 全家（直接依赖列出，勿用 `@tiptap/*` wildcard override，pnpm 11 不生效）；vite.config 的 sirv 依赖别漏。
2. shim 最小面 = 上面两张清单 + 三个关键形状（teach status、update status、transcript snapshot 事件）；审批作答走 `resolveLocalToolPermission`（`sendPrompt` 同端口）。
3. 挂载 = serve dist + `Page.addScriptToEvaluateOnNewDocument` 注入 stub（CSP 不拦 CDP 注入）；harness 已存 `evidence/s0-portability/{stub-init.js,drive.mjs}`。

## 局限与未验证
- persona 动画的 rAF 推进 / reduced-motion 分支未断言（U3′ 范围，本任务只验 `data-grok-state` 有值且随 currentActivity 变化）。
- 坑 2（切换后 composer）只记录未根治；真实 host 行为下是否复现未知。
- 0.78.1 与 0.18 的 immutableAssets（JS chunk）只有 1/8 同名——属代码非资产，未提取。
- 市场 overlay / 设置页 / computer / voice 等视图未走（U0 只要求侧栏+会话+composer）。
- S0 全程 fake coordinator，无真实 dsh 事件流（那是 P5-51 的 e2e）。
