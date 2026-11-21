# RE-TOOL-PERMS-1.1.0 — 工具权限模型取证（1.1.0 基线迁移 M4 / R3）

日期：2026-11-15 · 材料：`deb110/asar`（1.1.0）、`deb0781/asar`（0.78.1）解包产物，全部只读静态分析（grep + 上下文摘录，无 REA 引擎）。

## 结论（先读这个）

1. **MIGRATION-DELTA §2「工具审批」行的前提是错的**：per-tool 四档（`auto_review / always_allow / needs_approval / blocked`）**0.78.1 就有**，数据面 schema 两版逐字同构（仅压缩名不同）。1.1.0 的真实增量是：(a) 读豁免层「Allow reads」（`sand_mcp_allow_reads` flag + 推导逻辑 + 4 条新 i18n）；(b) MCP allowlist 拦截文案；(c) bulk 四档对话框（mcp_apps 安装流）。`localToolPermissionCeiling` **没有消失**——两版都是设置 `local-execution` 控件的 `adminLocks` 判据 + 审批卡按钮门控，逐字同构。
2. 权限是**两套并存系统**：本地工具（run-command 等）用三档 `always/ask/never`（`localToolPermission` + team ceiling）；MCP 工具用 per-server per-tool 四档（`setMcpToolPermissions`）。运行时审批卡只属于前者；MCP 四档只在设置面写，运行时按档执行在 host/server 侧。
3. 对我方：要做 per-tool 四档缺的是 MCP 侧整条链（存储/桥/设置 UI），本地工具三档我们有意用 sdk 档位表替代（P5-31），审批卡少了 always 写入路径。差距清单见 §5，共 7 条。

---

## 1. 四档模型形状（存储/数据面）

**Schema 锚（1.1.0）**：`deb110/asar/dist/renderer/assets/index.eager-app-DNSDeodN.js`，唯一串 `setMcpToolPermissions:J().args(MYe)`（约 @774512）。其上方定义：

```
Gx=Qr(On(`auto_review`),On(`always_allow`),On(`needs_approval`)),
MYe=ze({serverId:hx, tools:ee(Qr(Gx,On(`blocked`))), reads:P(Gx), writes:P(Gx)})
```

- **四档枚举字面量**：`auto_review | always_allow | needs_approval | blocked`。`tools` 是 Record（值域 = 四档）；`reads`/`writes` 是可选的三档（**无 blocked**）。
- **per-tool key**：schema 只证明是 record；key 为工具名是从 `listMcpServerTools:J().args({serverId:ve(),demand:P(On(`background`))})` 返回的 members + 详情页逐行渲染推断的（推断，非 schema 直证）。
- 同一命令表里还有 `adoptServerMcpToolPermissions:J().noArgs`（采纳 server 侧默认档）。

**0.78.1 对照锚**：`deb0781/asar/dist/renderer/assets/index.eager-app-iGTgHP_Q.js`，唯一串 `setMcpToolPermissions:J().args(_Ne)`（@580221）：`tb=xr(kt(`auto_review`),kt(`always_allow`),kt(`needs_approval`))`，`_Ne=yn({serverId:My,tools:Ut(xr(tb,kt(`blocked`))),reads:Kt(tb),writes:Kt(tb)})` —— 与 1.1.0 完全同形。

**「Allow reads」与四档的关系（1.1.0 新增）**：`chunk-plugin-detail-view-B7XJD7kY.js`，唯一串 `function Kr()`（@~49600）：

```
i=ve()?.approvalMode===`read_only`, o=D(`sand_mcp_allow_reads`)&&D(`sand_tool_allowlist`),
l=o&&r&&s!==`pending`&&n===!0   → {lock, autoReview, readsAllowed:l}
```

读豁免 `readsAllowed` 是**推导态**（server 级 `reads` 档 + auto-review instructions 的 `approvalMode==='read_only'` + 两个 feature flag + autoReview 开），不是独立持久开关。豁免判定：`Jr(e,t){return t.readsAllowed&&e.isReadOnly===!0}`（只读工具免卡）；`Yr(e,t)`（读豁免但非只读 → 走审批）。「Allow reads」按钮文案 key `w3p+ZT`，同 chunk `$r` 组件（唯一串 `w3p+ZT`，@~50900）——读豁免语境下行选择器选项集为 `[...(f||r===`always_allow`?['always-allow']:[]),`needs-approval`,`blocked`]`，且 onChoose 有 `u(t===`always_allow`?`auto_review`:t)` 的档位映射。**「Allow reads」点击后具体写 `reads:'always_allow'` 的调用点未取到**（`qr` 函数后半截截断）——未配对。

i18n 佐证：`Read-only is on. Grok Bot runs reads and blocks anything that would make changes.` = key `6eTy2j`（`index.eager-common-DcDxc78C.js`，唯一串 `6eTy2j`）。四条新串（`Allow reads` / `Read-only is on…` / `Blocked by the team's MCP allowlist` / `Choose Auto-review…`）经 `i18n-added-110-vs-0781.txt` 行 15/309/35/55 确认为 110 新增。

## 2. 设置 UI（四档选择器挂哪、粒度、拦截态）

- **挂载点不在 Settings general 区**，而在 **MCP 连接器详情页**：`chunk-plugin-detail-view-B7XJD7kY.js`（1.1.0）/ `chunk-plugin-detail-view-BgPF1Rqs.js`（0.78.1 同款）。分组锚：`Ur=[{group:`reads`,label:{id:`bxj38a`}},{group:`writes`,label:{id:`0uua0a`}}]`，按工具 `isReadOnly` 分两组；每组 `role:"group"` 容器逐工具一行（`ti({dispatch,group,label,labels,members,serverId,state,asksBeforeWrites})`）。行选择器 `$r` props：`{label,value,state,alwaysAllow,offersAutoReview,offersAllowReads,readsAllowed,placeholder,onChoose}`。
- **bulk 对话框**：`index.eager-app-DNSDeodN.js` 唯一串 `Rsr={id:`pW1/69`}`（@~4157140）——「Choose Auto-review, Needs approval, Blocked, or Always allow for each tool」是一个 alertdialog 的描述，内含 `choose`/`confirm` 两态与 lazy 加载的 `PluginToolPermissionsList`（mcp_apps 安装/授权流，未深挖）。
- **Settings general 区**仍是本地工具三档下拉：`index.eager-app-DNSDeodN.js` 唯一串 `` anchor:`local-execution` ``（@~4804751）：`{kind:'pick', adminLocks:e=>e.localToolPermissionCeiling!==void 0, values:kx, ...}`，`kx=[`always`,`ask`,`never`]`（唯一串 `` kx=[`always` `` @744091）。0.78.1 对应锚：`deb0781/.../index.eager-app-iGTgHP_Q.js` 唯一串 `` anchor:`local-execution` ``（@3969129），`Wy=[`always`,`ask`,`never`]` —— 两版同构。
- **MCP allowlist 拦截态**：`chunk-team-bot-service-accounts-dialog-MOenlI2W.js` 唯一串 `` case`mcp-allowlist` ``：block reason 映射 `mcp-allowlist → 9y/Dt9`（"Blocked by the team's MCP allowlist"），其余 reason → `OYx6pi`。呈现在连接器列表（服务账号对话框）的禁用原因行。
- **admin 锁呈现**：plugin-detail 页脚 `sag80m`（"Auto-review required by your admin"，条件 `lock==='locked'&&!readsAllowed`）；`xGRmq1`（"Auto-review is off"）行，label key `iMkWoF`。这两个 key 0.78.1 已有（38 个 catalog chunk 载有），非新增。

## 3. 审批卡联动（运行时 Allow / Always allow / Don't allow）

锚：`deb110/.../chunk-view-BRnPy8TC.js`，组件 `Ge`（审批卡）与 `Ue`（提交函数），唯一串 `` resolveLocalToolPermission({entryId `` （@~15175）：

- **resolution 枚举**：`always | allow-once | deny`。锚：`` r===`always`?`allow-once`:M `` 与 `` `deny` `` 字面量（`M` 为 import 别名绑定，**M 的 import 来源未展开**——推断 M=deny）。
- **「Always allow」去向按动作作用域分流**（`P(action)` ∈ `global`/`subject`）：
  - `global`：`await e.setPermission(r,t.machineId)` —— 直接写本地工具全局档 `localToolPermission`（`always`/`never`），失败或回读不一致降级 `allow-once`；
  - `subject`（如 use-app）：`e.recordStandingGrant({action,recipient,recipientName?,machineId?})`（对应桌面桥 `recordLocalToolStandingGrant:J().args({action,recipient,...})`，eager-app 唯一串 `recordLocalToolStandingGrant`），未存成功降级 `allow-once`。
  - 之后一律 `recordApproval(requestId,action,target[,machineId])`（= `recordLocalToolApproval`）+ `resolveLocalToolPermission({entryId,requestId,resolution,agentId,sessionId?})` 送回 transcript。
- **与 MCP 四档无写联动**：审批卡不写 `setMcpToolPermissions`；renderer 全目录 grep `needs_approval` 仅 `chunk-plugin-detail-view-B7XJD7kY.js`（4 处）消费——运行时按档执行不在 renderer。main 进程认识这些值（`deb110/asar/dist/electron-main/main-app.cjs` `needs_approval`×3、`main-core.cjs` ×2 且有 `setMcpToolPermissions`×1）——host 桥有此通道，**执行语义在 main/server 侧，未取证**。Auto-review 档时审批卡形态变化：未见 renderer 侧对应卡种（auto_review 由服务端自动审，renderer 只有 `auto_review_approval` 的 summary 类 transcript 项，锚 `T_t` 函数唯一串 `` kind!==`auto_review_approval` `` @1516926）——**部分未配对**。
- **team 锁门控**：`Ae(e,t){return n?.kind===`unavailable`&&n.reason===`team-policy`||e===`call`||e===`global`&&T(`always`,t)?`forbidden-by-team`:`offered`}`（同 chunk 唯一串 `forbidden-by-team`）——standing grant 被团队策略禁用、call 类动作、或 global 动作且 ceiling 禁 `always` 时，卡上不出「Always allow」。

## 4. localToolPermissionCeiling 去向

- **0.78.1 它做什么**：team policy snapshots 里的字段（`deb0781/.../index.eager-app-iGTgHP_Q.js` 唯一串 `` mce(e){return e.localToolPermissionCeiling??null} `` @235883），两个消费点：(1) 设置 `local-execution` 控件的 `adminLocks`（见 §2 锚）；(2) 审批卡 global 动作「Always allow」的门控。
- **1.1.0 同样两个消费点，逐字同构**：设置锚 @4804751（§2）；审批卡锚 `deb110/.../chunk-view-BRnPy8TC.js` 唯一串 `` Ae(Ye,fe?.localToolPermissionCeiling `` (@16938)。第三个读取点在 eager-app selector（唯一串 `` .localToolPermissionCeiling??null}function Qde `` @310998）。
- **被什么取代**：没被取代。MIGRATION-DELTA「消失」应为 i18n 层误判（设置区相关文案增删），机制两版一致。
- **我方复刻了吗**：部分。`app/ui/renderer-grok/overrides/modules/settings-panels.tsx:33` 把 `localToolPermission={undefined}` 整卡剥除（P5-31 决策：真源在 sdk 档位表）；`app/ui/renderer-grok/shim/src/desktop.ts:3` `localToolPermission：恒 "ask"`、`shim/src/coordinator.ts:6`「setPermission 拒存后上游降级 allow-once，shim 永不发 always」。即：UI 面=原版有卡我们无卡，数据面=原版可写 always/ask/never 我们恒 ask。team ceiling 概念我方没有（单机无团队策略面）。

## 5. 对照我方：做 per-tool 四档要动的面（差距清单，7 条）

我方现状锚：审批卡 `app/ui/renderer-grok/overrides/modules/local-tool-view.tsx:126-127,153-154`（只有 `submit('allow-once')` / `submit('deny')`，无 always 路径）；设置 `settings-panels.tsx`（general 剥 local-execution，加了 connector preferences Clear）；sdk 档位模型 `app/sdk/src/policy/shell-ask.mjs:77` `TIER_KINDS = {'allow','ask','sandbox-allow','workspace-read','workspace-write'}` + `app/sdk/profile/tiers.json`，且 `shell-ask.mjs:36-37`「连接器（mcp__ 前缀）→ ask：一律出卡」。

| # | 面 | 差距 | 要动什么 |
|---|---|---|---|
| 1 | sdk 数据面 | 无 per-server/per-tool 权限存储；MCP 工具一律 ask | tiers.json/查表逻辑扩 serverId+tool 维度，或新增 MCP 权限表；kind 集需映射 auto_review/always_allow/needs_approval/blocked |
| 2 | shim 桥 | 桌面桥无 `setMcpToolPermissions`/`listMcpServerTools`/`adoptServerMcpToolPermissions` 通道 | shim desktop.ts 加三个桥端点（真实现或桩） |
| 3 | 设置 UI | 恢复前端 `features/plugins/` 只有 `overlay/`，无连接器详情页四档选择器 | 按原版 plugin-detail-view 复刻 reads/writes 分组 + 行选择器（UI 骨架两版同构，可按 0.78.1 锚复刻再叠 1.1.0 读豁免层） |
| 4 | 审批卡 | 我方无「Always allow」钮及写入路径（allow-once/deny 二钮） | local-tool-view.tsx 加第三钮 + global/subject 分流（setPermission 或 standingGrant），或维持现状明示不支持 |
| 5 | 审批持久化 | 无 `recordLocalToolApproval`/`recordLocalToolStandingGrant`/`clearLocalToolApprovals` 对应物 | sdk 侧 approval 记录与 standing grants 存储（connector standing grants 已有：`p2sdk/connector_grants_clear`，模式可复用） |
| 6 | 本地工具三档设置 | general 区 local-execution 卡被有意剥除（P5-31，真源在 sdk） | 若按 1.1.0 补卡需重开 P5-31 决策（renderer 写入口 vs sdk 档位真源的归属） |
| 7 | 团队/admin 面 | 无 ceiling / autoReviewTeamEnforced / mcp-allowlist 概念 | 单机产品可整体不做（决策点，非缺口）；若做需伪 team policy 快照 |

## 局限与未配对

- 均为**静态字符串/结构取证**，未运行两个产物；压缩名（`Gx/MYe/tb/_Ne/Ue/M` 等）仅在本文件标注的 chunk 内有效。
- 未配对 4 项：①「Allow reads」的持久化写入调用点（`qr` 后半截）；② `M`（deny）的 import 绑定来源；③ MCP `needs_approval` 档运行时弹卡形态（renderer 无对应卡种，main/server 执行语义未取证）；④ bulk 四档对话框（`PluginToolPermissionsList`，mcp_apps 安装流）内部结构。
- main 进程只查了字符串存在性（main-app.cjs/main-core.cjs），未展开语义。
- 我方 `frontend/src/recovered/features/plugins/overlay/` 内部是否有可复用的工具行组件未逐一核过。
