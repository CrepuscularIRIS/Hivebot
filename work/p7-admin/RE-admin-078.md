# RE-admin-078 · Grok 桌面 0.78.1 管理能力逆向（补录报告）

补录日期：2026-11-05。原逆向当时只回报未落盘，本报告对当时的结论逐条回到解包树重新核实，并补齐缺口。**全部锚点已于 2026-11-05 重新核实过**（脚本 `/tmp/re078/verify_anchors.py`、`pass2-4`，只读）。

## §0 目标与核实状态

- 目标：Grok 桌面应用 0.78.1（deb 解包），解包树 `/dev/shm/grok-re/0.78.1/app/`（若丢失按 `work/p1-re/RE-unpack*.md` §0 重建）。
- 涉及文件（锚点均为**文件内字节偏移**）：
  - `COORD` = `app/dist/node-agent-coordinator/main.cjs`（1,193,881 B，桌面 bot 协调进程）
  - `MAIN` = `app/dist/electron-main/main-app.cjs`（3,470,507 B，Electron 主进程）
  - `EAGER` = `app/dist/renderer/assets/index.eager-app-iGTgHP_Q.js`（4,491,154 B，renderer 主 bundle）
  - `PLUG` = `app/dist/renderer/assets/chunk-plugin-detail-view-BgPF1Rqs.js`（80,267 B）

| 原结论锚点 | 核实结果 |
|---|---|
| updateAgent@COORD:987246 | 已核实（精确命中） |
| deleteAgents@COORD:987364 | 已核实（精确命中） |
| performServerAgentAction/deleteAgent@COORD:1141277 | 已核实（±26：1141251/1140871） |
| agent-upserted@EAGER:4360901 | 已核实（4360879，±22） |
| SearchPlugins 等@renderer:357484 | 已核实（index.eager-app:357484 精确） |
| installEntry@MAIN:2110337 | 已核实（2110343，±6） |
| 策略分层@PLUG:44944 | 已核实（44904–44990） |
| relaunch 退避@MAIN:2669134 | 已核实（2669140，精确到 retryPolicy 定义） |
| relaunchDesktop@MAIN:3443434 | 已核实（精确命中） |
| 自动更新空闲@MAIN:3365275 | 已核实（函数群 3365164 起） |
| quitAndInstall@MAIN:3386802 | 已核实（3386808） |
| 删除失败恢复乐观UI@EAGER:4167409 | 已核实（store 实现 4167231–4167409） |
| trigger schema@COORD:981215 | 已核实（slack@981230 起） |
| cron exact/flexible@COORD:982147 | 已核实（cron@982155） |
| routines 云端列举@MAIN:2831967 | 已核实（2831983） |
| cloud-agent-launched@EAGER:4361980 | **偏移漂移**：实际 7 处（198236 等）；4361980 处是事件路由表（`"cloud-agent-update"` 条目），见 §5.4 |

## §1 长期 bot：生命周期 CRUD

**结论**：长期 bot 的增删改走「renderer 乐观 store → COORD RPC schema → 三路执行拓扑」。agent 侧工具字典只有创建/更新/设主 bot，**没有删除工具**——删除是客户端能力（person 级 RPC），bot 本身不能删 bot。

证据（均已核实）：
- **RPC schema 定义**（COORD:987246/987364）：`updateAgent:I().args({id:W(),profile:$ne,editedFields:T(ue(y()))})`、`deleteAgents:I().args({ids:ue(W())})`，同区还有 `createAgentFromTemplate`、`duplicateAgent`、`setGroupMembers` 等（COORD:987364 窗口）。
- **person 权限字典**（COORD:930500）：`deleteAgents:"person",updateAgent:"person",...` —— 删除是 person（用户）级 RPC，不出现在 agent 工具面。
- **三层删除拓扑**（COORD:1140871–1141300）：先对 box agents 批量 `dispatchCommand("deleteAgents")`（失败仅记 `box_agent_delete_failed`，返回 `{transcript:[],failedAgentIds}`）；对 server agents 逐个 `t.performServerAgentAction({method:"deleteAgent",args:{id:Ne}})`，结果按 `ok/refused/其他` 分流（日志 `server_agent_delete_failed`）；server 侧成功者再镜像回 box：`dispatchCommand("deleteAgents",{ids:me},{demand:"background"})`（失败记 `box_delete_mirror_deferred`）。
- **工具字典**（COORD:936594/941112/940680）：`CreateAgent`、`UpdateAgent`、`SetPrimaryBot` 字面存在；`DeleteAgent` 全文件无命中（已核实为无，非未查）。
- **roster 事件接线**（EAGER:4360879）：renderer 事件路由表 `"agent-upserted":e=>ue.ingestAgentUpserted(e)`，与 `agents`（全量 roster）、`agent-activity`、`server-roster-changed` 等并列——服务端变更经事件流增量回灌本地 roster。

## §2 插件 / MCP 管理

**结论**：插件与 MCP server 的安装/卸载是「renderer 工具面 → MAIN 写序锁 → catalog 落盘 → 热 reload（不重启 Electron）」；每个插件/工具有四档审批策略分层。

证据（均已核实）：
- **renderer 工具面**（EAGER：`SearchPlugins@357484`、`InstallPlugin@354996`、`UninstallPlugin@358324`、`RestartMcpServers@357242`；另有 `UninstallPlugin` 于 chunk-plugin-detail-view:72012、chunk-view:168832）。
- **写路径**（MAIN:2110343 `installEntry`）：`this.inPluginWriteOrder(t.entryId,o,()=>this.catalogFlow.writeInstall(t,n,o))` → `this.reloadAfterPluginWrite({kind:"installed",pluginId:a},r.reload)`。即同账号同插件写入串行化（写序锁），写完按需 reload；`deferListing!==!0` 时等待 reload 完成，否则（`deferListing`）把 reload 挂后台、先用 `lastListedStateView()` 缓存视图应答。`updatePluginInstall` 紧随其后（MAIN:2110675；另有 1877501/2134021 等引用）。
- **热 reload 不重启**：`reloadServers` 一族在 MAIN:1862686–1864330、2098601 等 8+ 处；无 `app.relaunch()` 参与插件路径。
- **策略分层**（PLUG:44904–44990）：`auto_review / always_allow / needs_approval / blocked` 四档枚举字面紧凑排列在 plugin-detail-view 的 schema 里（工具粒度策略配置 UI）。

## §3 重启与自动更新

**结论**：三类重启各有一套独立机制——COORD 崩溃自动拉起（指数退避）、用户手动 relaunchDesktop、自动更新「空闲才装」。

证据（均已核实）：
- **COORD 拉起退避**（MAIN:2669140）：`createRetryPolicy({name:"sand-coordinator-relaunch",initialDelayMs:250,backoffFactor:2,maxDelayMs:1e4,mode:"until-signal"})` —— 250ms 起、×2 退避、封顶 10s、直到收到停止信号。周边还有退出分类：`uptimeMs<30000` 记 error 否则 warn（`eGn=3e4,Kce=3e4`），outcome 分 `exited/relaunched`。
- **relaunchDesktop**（MAIN:3443434）：`relaunchDesktop:()=>{let z=be.environment.restartExitCode;if(z!=null){MVt(z);return}PD.relaunchFor("settings_relaunch")}` —— 设置变更触发的整进程重启，可携带 restartExitCode。
- **自动更新空闲条件**（MAIN:3365164 起，`uQt/fQt`）：`autoUpdateWhenIdle && updateStaged && (screenLocked||screensaverActive) && systemIdleSeconds>=idleThresholdSeconds && hostIdle.kind==="confirmed-idle"`，阈值 `pQt=600`（10 分钟）；满足才 `quitAndInstall()`（quitAndInstall 字面另见 MAIN:3386808）。`confirmed-idle` 是宿主侧探针（`probeHostIdle`）显式确认，不是单纯计时。

## §4 删除回退与数据保护

**结论（窄）**：删除走乐观 UI，失败有明确的内存恢复路径。**回收站/保留期/删除审计/主 bot 保护均未证实**——这四项当时就没找到，本次复查仍未找到，维持「未证实」，不是「不存在」（见局限）。

证据（已核实）：
- **乐观删除与恢复**（EAGER:4167231–4167409，store 的 `deleteAgents` 实现）：
  - 删除前逐个乐观移除（`VYn(u,t,e)`，含 `isTemporal` 判断），`ve()` 通知订阅者；
  - RPC 成功后按 `refusedAgentIds`/`failedAgentIds` 分流：被拒/失败的条目保留（`u.delete(n)` vs `r.delete(n)` 两个集合），temporal agent 变更再触发 `refresh`；
  - **抛异常时逐个恢复**（`catch` 分支 `HYn(u,t)`），再 `ve()` 重渲染。
  - `HYn` 定义（EAGER:4116431）：`n.count<=1 ? e.delete(t) : e.set(t,{...n,count:n-1})` —— 引用计数式恢复；其前一个函数尾部（`count??0)+1`）即配对的乐观移除侧。紧随的 `UYn={slice:"roster.agent-avatars",...}` 表明这对函数至少服务 roster/avatar 缓存的引用计数。
- **未证实清单**（复查仍无命中）：软删除/回收站标记、保留期字段、删除审计事件、删除时主 bot/在用 bot 保护。COORD 的删除路径只区分 refused/failed，没有二次确认或白名单逻辑。

## §5 Routines / 自动化

**结论**：routines 的 trigger 是云端事件驱动的富 schema（10 种来源 + group 复合），cron 支持 exact/flexible 两种计时与容错窗口；**桌面端只做列举/开关/配置的 RPC 透传，没有本地调度循环**——触发执行在云端。

证据（均已核实）：
- **trigger schema**（COORD:981230–982147 区间，`pre/mre/fre/gre/yre/hre/Are/Ere/_re/Tre`）：
  - `slack`（channel + match：mention/keyword/message/reaction）
  - `github`（repo、事件、pr、userAllowlist、ciBranch）
  - `origin`（同 github 形态）
  - `microsoftTeams`（tenantId/teamIds/channelIds/messageContains、`blockUnauthenticatedTeamsUsers`）
  - `linear`（issueCreated/statusChanged/endOfCycle）
  - `sentry`、`pagerduty`（各带事件 case 枚举）
  - `email`（inbox/from/requireAuthPass）
  - `webhook`
  - `cron`（见下）
  - `H3 = union(上述10种)`；`Rre` 校验「at least two triggers」（group listener 至少两个触发器）；`wre={type:"group",listeners:Rre}` 允许组合。routine 本体 `G3={name,prompt,trigger,isEnabled}`。
- **cron 形态**（COORD:982155）：`{type:"cron",schedule, firesAt?, window:{earlyMinutes,lateMinutes}?, timing:"exact"|"flexible"}` —— flexible 配合 window 做容错窗口。
- **云端列举/管理**（MAIN:2831983）：`kfe={list:"listGrokBotAgentRoutines",setEnabled:"setGrokBotAgentRoutineEnabled",setCollaboratorCreation:"setGrokBotAgentAllowCollaboratorAutomationCreation",id:"routineId",policy:"routinePolicy",updated:"routine"}`，调用带 `timeoutMs:2e4` 与 `x-grok-bot-refusal` 头，拒绝码 `routine_not_manageable`。纯 RPC 透传（另有 MAIN:1619231 起 automations 一族）。
- **无桌面调度循环**：COORD 全文 0 处 `setInterval`；MAIN 的 6 处全部是 rxjs `intervalProvider` 封装（MAIN:36146–37111，库代码）、statsig 日志 flush（MAIN:1549965）、AsyncAction——与 routine 调度无关。renderer 事件面有 `"agents-automation"`/`"agents-automations-changed"` 事件（EAGER:4360879 表）接收云端通知。
- **CloudAgent**：RPC 侧 `getCloudAgentInfo` 在 COORD:930690（person 权限字典）、987662（schema）等 5 处，MAIN:1443220 等 4 处；`CloudAgent` 字面 MAIN:124033/1443223 等。事件 `cloud-agent-launched` 在 EAGER 有 7 处：198236（团队 feed 事件类型数组，与 `name-changed`、`team-shared`、`desktop-goal` 并列）、1897216、2389872、2760814、2766444、3478774、3485938。原锚点 4361980 处实际是 renderer 事件路由表（该表含 `"cloud-agent-update":e=>ht.ingestUpdate(e)`），当时应为路由表附近的近似记录。

## §6 未命中与归属澄清

- **`/goal` `/loop` `/swarm`**：三大 bundle 字面无命中；全 app 树（js/cjs/html/json）`grep -rln` 无命中。这三个命令**不属于 Grok 桌面 0.78.1**（当时的判断成立，归属 Cursor/pstack 侧）。注意 EAGER:198236 的事件数组里有 `desktop-goal` 字样，与 `/goal` 命令无关（是事件 kind 名）。
- **cloud-agent-launched@EAGER:4361980**：偏移漂移，正确锚点见 §5。

## §7 对我们的启示

1. **删除不给 bot 工具是设计立场不是遗漏**：管理动作（删 bot、装/卸插件）全部收敛为 person 级 RPC，agent 工具面只放 Create/Update/SetPrimaryBot。我们的 bot 管理面照抄：破坏性操作只走用户会话，模型永远拿不到 `DeleteBot` 工具。
2. **删除是拓扑操作不是单点操作**：本地 box、服务端、镜像回写三路各有独立失败分支与日志 tag（`box_agent_delete_failed`/`server_agent_delete_failed`/`box_delete_mirror_deferred`），UI 侧 refused/failed 分流保条目。我们的多宿主 bot 删除需要同样的 per-target 结果聚合，不能一个布尔失败码打包。
3. **乐观 UI 配引用计数恢复**：删除前移除、异常恢复用 count 语义（count<=1 才真删），天然支持批量与并发快照。简单实现可以直接抄这对函数的形状。
4. **写序锁 + 写后热 reload**：插件安装用 per-(account,plugin) 写序锁串行化，写完 reload MCP servers 而不重启进程，还留 `deferListing` 逃生门（先回缓存视图，reload 后台化）。比「装完提示重启」体验好一档，代价是要维护 `lastListedStateView` 缓存。
5. **策略四档（always_allow/auto_review/needs_approval/blocked）按工具粒度挂在插件 schema 里**，与我们 P3 契约的审批档位可以对齐复用同一套枚举。
6. **routines = 云端事件驱动，桌面零调度**：10 种 trigger + group(≥2) 复合 + cron exact/flexible 容错窗口，执行全在云端，桌面只做 RPC 透传 + 事件通知。我们若做 routines，桌面侧同样不该起调度循环，避免与云端重复触发。
7. **自动更新「双保险空闲判定」**：屏幕锁/屏保 + 系统空闲≥10min + 宿主探针 `confirmed-idle` 三条件与才装。抄条件不抄阈值，600s 可配置。
8. **COORD 拉起退避 250ms×2 封顶 10s `until-signal`**：崩溃自动恢复的标准形状，我们 sandbox 协调进程直接复用这套参数。

## 局限与未验证项

- 静态逆向（minified bundle 字面与结构），**未运行目标**：RPC 实际网络行为、云端 routine 执行、CloudAgent 生命周期均未观测。
- 未证实 ≠ 不存在：回收站/保留期/删除审计/主 bot 保护（§4）可能在服务端实现，bundle 内无证据；需要抓包或云端 API 逆向才能定论。
- 偏移针对本次解包的具体文件（文件名带 hash，版本升级即失效）；引用时同时给关键词字面。
- `HYn/VYn` 的引用计数语义是从两个函数体及紧随的 `roster.agent-avatars` slice 推断的，未逐个追所有调用点；「乐观移除 = count+1」的读法基于函数尾片段，精确语义以完整反混淆为准。
- deb 解包只覆盖 `app/`（asar 解包产物），未含原生 `.node` 模块内部与云端服务端。
