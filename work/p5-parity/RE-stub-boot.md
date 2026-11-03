# RE-stub-boot · R3：不登录不联网启动 0.78.1 renderer 供截图

日期：2026-11-03 · 结论：**能，成本中等（本次约 0.5 天走到可用），参照截图已产出**

## 结论（先行）

1. **能**。不需要桩 Electron 主进程，也不需要碰原版安装：把解包树里的 renderer（`/dev/shm/grok-re/0.78.1/app/dist/renderer/`）当静态站点用 **loopback HTTP** 起给普通 Chrome（`/usr/bin/google-chrome --headless=new`，CDP 驱动），在页面脚本运行前注入一段 **preload 桩**（`window.desktop` / `window.coordinatorPort` / `window.sandRenderTrace` / `window.sandPopout`），再加一个 **fake coordinator**（纯页面内 MessagePort 对端），renderer 就能完整挂载：侧栏（真字体/真图标/真配色）、会话流（用户气泡 + tool-call 紧凑行 + assistant markdown）、**审批卡（local-tool-permission，含 Allow/Deny 按钮）**。全程无登录、无外联（唯一网络是 127.0.0.1 静态文件服务）。
2. 已产出参照截图（`work/p5-parity/ref/`，2880×1800 = 1440×900@2x）：
   - `r3-conv-light.png` / `r3-conv-dark.png`：侧栏（3 个 fixture bot + 账号 footer "SD / Stub Dev" + Connect apps）+ 会话流（用户消息、Bash/Read 工具行、assistant 消息）+ 审批卡（Ask 图标 + 标题 + 描述 + Allow/Deny），亮暗各一张。
   - `r3-sidebar-light.png` / `r3-sidebar-dark.png`：侧栏区域特写（从上面两张裁切）。
3. 成本：首通 ≈ 0.5 天（本报告即首通产物）；**复跑成本 ≈ 2 分钟一张**（起 server + `node drive.mjs`）。给 U5 并排对照用够了；要更多场景（市场、设置、更多卡片类型）是「加 fixture 值」的线性工作量，每个新卡片类型约再加 0.5–2h 逆 payload 字段。

## 方法（复刻要点）

1. **不跑原版 Electron**。`--user-data-dir` 不可信（LEARNINGS）与登录墙都绕不开；直接渲染 renderer 静态树。file:// 会被 ES module CORS 拦，用 loopback HTTP（`harness/grok-r3/serve.mjs`，含 `/v1/*` 深链 fallback 与资源路径重写）。
2. **preload 桩**（`harness/grok-r3/stub-init.js`，CDP `Page.addScriptToEvaluateOnNewDocument` 注入，跑在 app 脚本之前）：
   - `desktop.main`：Proxy，未知方法 log 后 resolve undefined；已知方法回 fixture。关键的引导面（逐个从崩溃日志逆出来的）：`getSandAccessFresh→{state:'granted'}` 过登录门；`getThemeState/getLanguageState→{preference,resolved}`；`getCursorAuthStatus→{kind:'logged-in',authId,…}`（账号 footer、roster 绑定都靠它）；`getGrokBotTermsRecord→{seenAtMs:1}`、`getOnboardingSeen→true` 跳 onboarding；`getWindowState/isWindowShown/getCursorLoginFlight/getCursorSelectedTeam/getHostSidebarSections({sections,base})/getHostPinnedAgents/[]`；`readManyClientPersistence` 必须回 `{键:值}` 且带 `client-meta.account-slot=stub-auth`（否则账号槽位翻转引发主题订阅竞态崩溃）。
   - `desktop.boot`：状态对象 `{theme:{preference,resolved},language,isEgressTunnelEnabled}`（不是方法表）。
   - `desktop.local`：`getZoomFactor()→1` 等 5 个方法。
   - `coordinatorPort.claim(holder)`：**同步**交付一个 `MessageChannel` port（异步交付会输给 identity restore 状态机，port 被封存、永远不发 hello——这是最大的一个坑）。
   - `main.subscribe(handlers)`：真实实现（存 handler、返回 dispose），支持事后 `__pushEvent` 推事件（深链等）。
3. **fake coordinator**（同文件内）：协议是裸 MessagePort 上的 JSON 帧（`index.eager-app…js` 的 `L3n`/`Z3n` 与 `node-agent-coordinator/main.cjs` 双向印证）：
   - lifecycle：client 发 `{kind:'lifecycle',phase:'hello',protocolVersion:3}` → 回 `{phase:'ready',protocolVersion:3}`。
   - RPC：client 发 `{kind:'request',requestId,method,args}` → 回 `{kind:'reply',requestId,outcome:{status:'ok',value}}`（失败为 `{status:'failed',failure:{code,message}}`）。
   - 推送：`{kind:'event',family,payload}`（本次未用到——roster 走 RPC 就够）。
   - RPC 方法表在 `index.eager-app-iGTgHP_Q.js` 内（`countAgents:{args:'none',reply:'count'}` 那张表，约 200+ 方法）；回值有 per-reply 校验器（同文件 `"transcript-page":e=>…` 一段），null 会报 `source/malformed-reply`。本次用到的：`listAgents`(agent 记录数组，**主侧栏来源**，`getServerAgentRoster` 只是 overlay)、`getHostStatus{hostVersion,latestHostVersion,hostUpdateAvailable,isBusy,capabilities}`、`getMainAgent{agentId}`、`getTrays[]`、`getSubagents[]`、`getAsyncTasks[]`、`getForeverBoxStatus→null(box-status 允许 null)`、`getAgentTranscriptTail/openAgentTail→{entries[],nextBeforeSeq,cloudAgentPeerIds[]}`。
4. **transcript entry 形状**（逆出来的）：每条必须有 `id`（缺了会在 `mU(e){e.id.startsWith('optimistic:')}` 崩）；`message` 用 `role+content`（不是 text）；tool-call 行用 `name+summary+status`；**审批卡**是 `kind:'send-message'` + `message:{type:'local-tool-permission', ask:{status:'pending',requestId,description}}`（`ic(e)` 判定式即证据；卡组件 `chunk-view-Bbgcfm9R.js` 只读 ask 的 action/description/status/title）。agent 记录最小集 `{id,name,description,createdAtMs,updatedAtMs,status,serverId}`。
5. **驱动**（`harness/grok-r3/drive.mjs`，Node22 原生 WebSocket 的 150 行 CDP 客户端）：随机 `--remote-debugging-port`（**不要用固定端口**——孤儿 chrome 会劫持后续所有 run，本次踩过，表现为截图帧跨 run 复用）、每 run 独立 `--user-data-dir`、`Emulation.setDeviceMetricsOverride 1440×900@2`、stub 注入、navigate、可选按文本点击侧栏项、可选推事件、`Page.captureScreenshot`。主题用 URL 参数 `?theme=light|dark`（桩读它设 THEME）。

## 证据

- 截图与 bodyText：`/tmp/grok-r3-work/out/r4-conv-light.*`、`r3-conv-dark.*`（DOM 文本含 "Revenue is up 12% QoQ" / 卡片 "Install a dependency…"）；归档副本在 `work/p5-parity/ref/`。
- 协议与桥面静态锚点（`/dev/shm/grok-re/0.78.1/app/`）：preload 桥 `dist/electron-preload/preload.cjs#exposeInMainWorld("coordinatorPort",Om)` 与 `claim/deliver`；端口转发 `dist/electron-main/main-app.cjs#"sand:coordinator-port"`（spawn `node-agent-coordinator/main.cjs`）；帧校验 `dist/renderer/assets/index.eager-app-iGTgHP_Q.js#function L3n` / `z3n(outcome)` / `"transcript-page":e=>`；审批卡判定 `#function ic(e)`；登录门 `#getSandAccessFresh` + `Bne(e)`（state:'granted' 直接过）；boot 任务链 `dist/renderer/assets/index-CxzQ4vjO.js#tasks:[()=>void B.load(),…]` + `performance.mark('sand.boot.*')`。
- 未登录封面（对照）：`work/p1-re/evidence/01-boot.png`。

## 局限与未验证

- **审批卡交互未验证**：Allow/Deny 按钮出现但没点过（点击走 `onResolve`→RPC `answerLocalToolPermission` 一类，未逆）。卡片 title/action 字段带上会崩（entry 级 boundary "Couldn't render this"），只用 description+status+requestId 稳定。
- **截图帧疑云（已绕过）**：调试过程中多张亮色截图字节级相同，根因高度疑似固定调试端口下孤儿 chrome 劫持 CDP 连接；改随机端口 + 独立 profile 后按需重截。归档四张均为重截验证过的。
- 市场页、设置页、其余 32 类 send-message 卡未渲染（每个都是加 fixture 的线性工作，市场/设置还依赖更多 main RPC fixture）。
- transcript 只展示了 tail 页；`nextBeforeSeq` 分页、event 卡、unread 线未试。
- fake coordinator 与真实 daemon 的行为差异：所有未列出的 RPC 回 null（多数被客户端校验器拒并上报 malformed，不影响已渲染区域，但日志会有噪音）。
- 残留进程：`/tmp/grok-r3-work` 下若干孤儿 headless chrome 与 4 个静态 server（端口 8877–8880）因 process_guard 沙箱规则（cwd 不在 bot 沙箱目录）无法由我清理，**请用户择机清理**：`pgrep -af 'grok-r3|serve.mjs'` 后按 PID kill（或移到 bot 沙箱目录重跑）。临时目录 `/tmp/grok-r3-*`、`/tmp/grok-r3-work` 可删（报告与 harness 已归档）。
- 主题竞态（`Y.theme.snapshots.get().resolved` 偶发 undefined → 未捕获 rejection）在账号槽位预置后基本消失，但未根因；如复跑遇到偶发空白帧，重跑即可。
