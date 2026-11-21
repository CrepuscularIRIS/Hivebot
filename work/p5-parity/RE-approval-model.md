# RE · R1 · 0.78.1 审批模型（local tools approval model）

v1 · 2026-11-03 · reverse-engineer（GLM 5.3 + 静态分析）
对象：Grok Bot 0.78.1 解包树 `/dev/shm/grok-re/0.78.1/app/dist/`。只读静态分析，未运行原版，未读任何凭证文件。
方法：bundle 字节级定位（固定字符串上下文提取）+ i18n 表解码。锚点格式 `文件:行:列`（minified bundle，行内列号是唯一可靠定位）。本次未跑 REA 语义图——所有结论直接锚定 bundle 原文字节，可复现命令：`python3 /tmp/re-r1/ctx.py <file> <needle>`。

缩写：
- `daemon` = `local-exec-daemon/main.cjs`（3.9MB，本地工具执行守护）
- `core` = `electron-main/main-core.cjs`（0.99MB）
- `app` = `electron-main/main-app.cjs`（3.5MB，renderer→main IPC 面）
- `eager-app` = `renderer/assets/index.eager-app-iGTgHP_Q.js`（en i18n 内嵌）
- `卡chunk` = `renderer/assets/chunk-view-Bbgcfm9R.js`（审批卡组件）
- `coordinator` = `node-agent-coordinator/main.cjs`（云端同步 protobuf）

## 0. 结论速览

1. **审批模型是「分类 × 档位」查表，不是逐命令规则引擎**。11 种 action 分 4 类（global/setting/subject/call），每类走完全不同的授权路径；bash 类（global）的档位是**每台机器三档**（Never/Ask/Always）持久在 settings.json，**没有命令内容/参数模式匹配**——`allow-once` 的复用键是 `(machineId, action, target 精确字符串)`，1 小时 TTL。
2. 三个 JSON 文件都是**机器本地、无参数模式**：approvals = 一次性批准账本（1h TTL）；standing grants = 仅限 iMessage/use-app 两类、按 accountScope+recipient 的常驻授权；retirements = 已退休 approval id 的负账本。MCP 连接器工具权限不在这三个文件里，在 settings.json `toolPermissions`。
3. **autoReview = 用户写的自然语言 allow/block 指令列表，由云端 agent（LLM）执行复核**，客户端只存储/同步/展示，本地无匹配引擎。团队规则可整体替换个人规则。
4. UI：卡片按钮 **Allow (primary) → Always allow (secondary, 条件出现) → Don't allow (tertiary/trailing)**；always 三种语义按分类不同（全局改设置 / 写 standing grant / 不可用）。

底座事实：该 app 是 **Cursor "sand" 代码库的 fork**（`daemon:1158` 一带大量 `.cursor`、`SAND_*` 残留，域名白名单含 cursor.sh + x.ai + grok.com：`Rre`/`Cre`，daemon:1158）。数据根 `vs()`（daemon:1158，`function vs(`）：`$SAND_DATA_ROOT` > `$SAND_USER_DATA_DIR/sand-data` > packaged 时 `~/.grokbot`（`DCe()=="sand"`，`SLt=".grokbot"`）。以下文件都在该目录下：
`local-tool-approvals.json`、`local-tool-retirements.json`、`local-tool-standing-grants.v1.json`、`local-tool-spent-sends.json`、`settings.json`、`computer-use/`（daemon:1158 `ENe/wNe/xNe/bNe/wp` 五个 path 构造函数）。

## ① action 分类枚举 + 每类默认 ceiling 来源

### 1.1 枚举与分类表

action 全集 `HBt`（daemon:1158:26805）与分类表 `VBt`（daemon:1158，紧邻；renderer 侧同表 `CMe`，eager-app:12:184790 附近，分类函数 `wMe` 即 BRIEF 说的 `j(o.action)` 的等价物）：

| action | 分类 `IC()` | 工具调用来源（`XDe`，daemon:1159:5281 前段） |
|---|---|---|
| run-command | **global** | shellStreamArgs / backgroundShellSpawnArgs（target=命令文本；后台命令带 `outlivesScope:true`，attach 到 resourcePath） |
| send-input | **global** | writeShellStdinArgs（target=输入字符） |
| read-file | **global** | readArgs / redactedReadArgs（target=路径） |
| list-directory | **global** | lsArgs |
| write-file | **global** | （写文件工具，另一构造函数） |
| read-ai-tool-setup | **global** | AI 工具配置读取 |
| read-messages | **setting** | Messages 读取 |
| send-imessage | **subject** | iMessage 发送（recipient） |
| use-app | **subject** | Mac app 自动化 |
| run-phone-tool | **call** | 手机端工具（在手机上批） |
| send-mail | **call** | Mac Mail 发送（草稿卡审批） |
| 其他/未知 | **subject**（兜底） | — |

### 1.2 档位序与合成

`wMe={never:0,ask:1,always:2}`；`PC(t,e)`（daemon:1158）= 取更严者。**有效 permission = min(用户设置, ceiling)**（daemon:1159 `getLocalToolPermission(){return PC(e.localToolPermission??"ask", e.localToolPermissionCeiling)}`）。

### 1.3 每类默认值与来源

| 类 | 默认 | 来源 |
|---|---|---|
| 用户档位 | **"ask"**（硬编码默认，`localToolPermission??"ask"`，daemon:1159） | settings.json `localToolPermission`（当前机）+ `localToolPermissionByMachineId`（每台连接电脑一行，coordinator:73 同步 schema） |
| ceiling | **undefined（=不限制）**（无默认值） | settings.json `localToolPermissionCeiling`；渲染端从 team policy 下发的 settings 快照读（卡chunk:2 `se?.localToolPermissionCeiling`；设置页 ODc_03uE.js:2 显示 "Your team's admin allows at most \"{ceiling}\"" `68SHzZ`）。`setLocalToolPermissionCeiling` 本地拒绝设为 always（`PC("always",e)!=="always"` 断言，daemon:1159）——ceiling 只能收紧 |
| 团队/服务端权威 | credential 属性 `serverAuthoritative`（daemon `aMe` schema：credential/machineId/expiresAtMs/accountScope/serverAuthoritative；daemon:1158 一带） | 后端下发。为 true 时**本地 permission/ceiling 全部旁路**，改用后端 `authorization={kind:approval→allow; standing→仅 global 类 allow; none→继续走后续链}`（`vFt`，daemon:1159） |
| setting 类开关 | `messagesEnabled`（settings.json，Messages 总开关） | 与档位无关的独立开关 |
| global 类 + always | 直接放行，**不查任何审批文件**（daemon:1159 `bae`：`r==="always"&&n==="global"→allow`） | 硬编码 |
| call 类 | 永远无 standing/always（`Te`，卡chunk:2:10332：`e==="call"→"forbidden-by-team"`） | 硬编码 |

### 1.4 主判定函数 `bae`（daemon:1159）全文语义

```
async bae(t):                       # t = {describes?, permission, ceiling, messagesEnabled,
  n = describes ? IC(action) : "global"     #   approvalsPath, retirementsPath, standingGrantsPath,
  if serverAuthoritative:                   #   accountScope, approvalId, authorization, terminalsFolder}
     if vFt(authorization, n) == allow → allow
  else:
     if ceiling=="never"        → refuse(y0)   # y0："Local tools are turned off. The user has set
     if permission=="always" && n=="global" → allow    #  local tool access to Never…Settings→Bot→
     if permission=="never"  && n!="global" → refuse(y0) #  Execution on Local Computer…"（daemon:1159）
  if n=="setting"  → messagesEnabled ? allow : refuse(U5)   # U5 = "Messages is turned off…"
  if n=="subject"  → RFt(standing grant 命中) ? allow
  if 无 approvalId 或无 describes → ask
  i = approvals(读文件,滤1h过期,减retired).get(approvalId)
  return i 存在（且 serverAuthoritative 时 accountScope 也相等）
         && Eage(i, describes) ? allow : ask
```

`Eage`（daemon:1159:5281）匹配规则：`machineId` 相等 **且**（`action+target` 精确相等 **或** 审批的 resourcePath == 本次调用的 attachToResourcePath，即同一 terminals folder / 同一 scope 内的复用）。

ask 之后（`lLe`，daemon:1159）：`permission=="never"` → 返回 y0 文本；否则返回 `F5`（模型可见）："That action was not approved on the user's computer, so nothing ran. Ask the user to approve it (or to set Settings → Bot → Execution on Local Computer to \"Always allow\"), and use your own c[omputer]…"。

### 1.5 「always」的三种语义（renderer `Re`，卡chunk:2:13370）

| 分类 | 用户点 Always allow 后发生什么 |
|---|---|
| **global**（bash/文件） | `setLocalToolPermission('always')` **改 settings.json 全局档位**（对该机器所有 bot 生效），不写 grant；失败降级 allow-once。卡片描述明示 "This applies to Grok Bot and every Bot. It can always be changed in Settings."（`a9tTHW`） |
| **subject**（iMessage/use-app） | `recordLocalToolStandingGrant` 写 standing-grants 文件 + `recordApproval` 记本次；standingGrant 非 offered（如 forbidden-by-team）时降级 allow-once |
| **call**（mail/phone） | **always 不可用**：`r==="always"&&(n==="call"||…)→r="allow-once"`（硬编码降级）；send-mail 再叠加一次性 spent-send 消费（`spendSendApproval`，core:66 一带：approvalId 进 `spentIds` 后 `{kind:"already-spent"}`，防同一条审批重发邮件） |

`allow-once` 一律 `recordApproval(requestId, action, target[, machineId])` 写 approvals 文件。

## ② 三个 JSON 文件的 schema、作用域与清除路径

### 2.1 `local-tool-approvals.json`（一次性批准账本）

schema（写方 `cce`，core:1092 / app:1092 一带；条目校验 `yFt`，读方 `nLe`，均 daemon:1159）：

```json
{ "approvals": [
  { "id": "<approvalId=requestId>", "action": "<11 枚举之一>", "target": "<精确字符串: 命令文本/路径/收件人>",
    "resourcePath"?: "<terminals folder 等 scope>", "accountScope"?: "<账号域>", "recordedAtMs"?: 1730000000000 }
] }
```

- **作用域键**：`(machineId, action, target)` 三元组精确匹配 + resourcePath 复用（`Eage`）。**没有参数模式/glob/前缀**；`target` 是原始命令文本。
- **TTL**：`recordedAtMs` 距今 > 36e5 ms（1 小时）即失效（`EFt`，daemon:1159）。读时惰性过滤，不主动清文件。
- **写**：renderer 点 Allow/Always → IPC `recordLocalToolApproval{approvalId,action,target,machineId?}`（app:1111；参数 schema `Mh.isSandLocalToolAction` 校验）→ `dU`（core:66:1614）合并写盘，空 Map 时**删除文件**。
- **清除**：① IPC `clearLocalToolApprovals`（app:1111，设置页按钮）；② `removeLocalToolApproval(id)`（retireMacMailSendApproval 等用）；③ 1 小时自然过期。
- **send-mail 例外**：只能从草稿卡批准（`recordMacMailSendApproval`，input=完整邮件内容做 target，且 `machineId===getMachineId()` 断言），消费后进 spent-sends。

### 2.2 `local-tool-standing-grants.v1.json`（常驻授权）

schema（`RMe`/`eUt`，daemon:1159）：

```json
{ "version": 1,
  "grants": [
    { "scope": "action",  "action": "send-imessage|use-app", "accountScope": "<账号域>", "grantedAtMs": 1730000000000 },
    { "scope": "subject", "action": "...", "recipient": "<精确收件人>", "recipientName"?: "<显示名>",
      "accountScope": "...", "grantedAtMs": ... }
  ] }
```

- **只允许 subject 类 action**（`IC(action)!=="subject"` → 条目丢弃，`eUt`）；即 standing grant 只存在于 iMessage 和 use-app，**bash/文件读写永远没有 standing grant**。
- **匹配键** `AMe`：`[accountScope, scope, action]` 或 `[accountScope, "subject", action, recipient]`（`RFt`，daemon:1159）。粒度 = 账号域 × (整个 action 或 具体 recipient)，**无参数模式**。
- **准入前提** `xMe`（daemon:1158）：ceiling 为空或 "always" 且 permission ≠ never 且（messagesEnabled 或 action ∉ {read-messages,send-imessage}）。
- **machine 绑定**：`recordLocalToolStandingGrant` IPC 强校验 `machineId===await getMachineId()`（app:1111，非本机 `{stored:false}`）——grants 是**本机**的，不跨电脑。
- **写/撤销**：`standingGrants.grant/revoke`（app:1111 `setLocalToolActionGrant{action,granted}` 走 revoke；`isSandLocalToolPermissionAdminEnforced("always",ceiling)` 时拒绝设 grant——**团队 ceiling=never/ask 时 UI 层也禁止添加 standing**）。查询：`getLocalToolActionGrant{action}`。
- 版本不符/字段非法 → 整文件按空处理（`RMe` 返回空表，fail-quiet）。

### 2.3 `local-tool-retirements.json`（退休负账本）

schema（`aLe`/`sLe`/`oLe`，daemon:1159）：

```json
{ "retiredIds": ["<approvalId>", ...] }
```

- 语义：把某条 approval 标记作废（撤销"仅此一次"的未过期批准）。读方 `AFt` = approvals − retiredIds。
- 写入会做**一致性收敛**：加入 id 后，若该 id 不在 approvals 里则不保留（`n.has(i)||s.delete(i)`）；集合为空 → **删除文件**。
- 无独立 UI 入口的话它是内部账（MacMail retire / clear 流程使用）。

### 2.4 附带：MCP/连接器工具权限不在以上文件

settings.json `toolPermissions`（coordinator:73:62156 `Qne`）：`{scopes:{<serverId>:{tools:{<toolName>:"always_allow"|"needs_approval"|"blocked"}, reads:同枚举, writes:同枚举}}}`。RPC 面 `getLocalToolActionGrant` / `setLocalToolActionGrant`（app:1111）+ plugin 详情页 UI（见 ④）。对应 BRIEF 提到的 `Get|SetGrokBotMcpToolPermissions`：读/写分档就在这里（reads/writes 字段），与我们 §7 第 7/8 行的设想一致。

## ③ autoReview 是什么、何时触发

**定义**：`autoReviewInstructions = {isEnabled: bool(默认 true), allowInstructions: string[≤20 条、每条 trim 后 ≤1000 字符], blockInstructions: 同}`（settings.json 字段；默认值 `Tae={isEnabled:!0,allowInstructions:[],blockInstructions:[]}`，daemon:1159；清洗 `WC/pLe`，daemon:1159）。UI 术语：allow 规则 = "Allow rules"，block 规则 = "Ask first"（`4YjKLA`）。

**执行者**：云端 agent（LLM 复核，"模型审模型"）。证据链：
1. 它是 coordinator 同步到云的 UserSettings 字段（coordinator:70:26953 `Wb=["mcpServers","timeZone","autoReview",…]`，protobuf 字段 3；schema `Zne`，coordinator:73:61989）——每会话带给后端。
2. **本地 bundle 中不存在 allowInstructions 的运行时匹配引擎**，只有编辑/校验 helper（`chunk-sand-auto-review-instructions-CoXp1wDA.js` 全文：normalize、`allowIncludes`（精确字符串包含）、add/update/evict 规则维护，供审批卡"存为规则"用）。
3. 结果回显在会话流："Auto-approved by your rule"（`ESjU66`，chunk-auto-review-rule-notice-DX8kPPBt.js:2:2634 的状态插值，另有 added/updated/adding/updating/deleting 状态文案 `XCrhku` "Added to your Ask first rules" 等）。

**团队维度**：`autoReviewTeamEnforced` / `autoReviewTeamRules` / `autoReviewRulesInEffect:{kind:"replaces"}`（eager-app:4 `vce/Sce`）——团队规则可**整体替换**个人规则；连接器详情页 lock 状态：locked 显示 "Auto-review required by your admin"（`sag80m`）。团队 enforced 时全局 autoReview 开关被 adminLocks（eager-app `anchor:"auto-review",kind:"toggle",risk:"consequential",adminLocks:e=>e.autoReviewTeamEnforced`）。

**触发面**（客户端可见）：
- 连接器详情页的 `auto-review` 开关/tab 与 "Always allow" 并列（chunk-plugin-detail-view-BgPF1Rqs.js:2：`autoReview==="on"?"":["auto-review"]` 拼进权限节 tabs；footer `RmzpYm` "Always allow skips your own Ask first rules for this app. Your team's rules still apply."、`xGRmq1` "Auto-review is off"）。
- 审批卡流程中「存为规则」：subject 类 always 时可写 Allow 规则（`o(e,{rule,replaces,evicts})`）。
- 具体每次工具调用是否被 auto-approve，由云端按指令判断——**客户端 bundle 无法回答逐次判定的精确时机**（见局限）。

## ④ UI 附带（给 L-UI / W2-AP 用）

### 4.1 审批卡按钮（卡chunk:2，`Be` 组件 + `Re` 提交器）

出现顺序与变体（turn 级卡）：
1. **Allow** — primary，`h7peZQ`；resolve `allow-once`
2. **Always allow** — secondary，`NoKBgy`；**仅 `canAlways`（standingGrant offered）时渲染**（`T=d?[L,te]:[L]`）；resolve `always`
3. **Don't allow** — tertiary，`zOxKTV`；trailing 位置（`actionsTrailing`）；resolve `deny`

手机/机器卡（`Ce` 组件）：[Allow, Deny once]；Deny once = `g3D+vR` "Deny once (Esc)" / `rek4Fs` "Deny once"。pending 态 = 各自 resolution 提交中；失败 note `sSMHtl` "Your answer didn't go through. Check your connection and try again." / `QqKsGg` "Couldn't save. Try again."。

状态徽标（`ce`）：Allowed once（`gk2v4K`）/ Allowed for this turn（`/IKCH1`）/ Always allowed（`gBhy/k`）/ Not allowed（`OvnLyF`）/ Expired（`M1RnFv`）。

### 4.2 always 受限时的文案/tooltip

- standingGrant **offered**（可用）：`mFJh/I` "Allow lasts for this turn. You can remove Always allow in Settings."
- **team-policy 禁用**：`z6H5uV` "Allow lasts for this turn. Your team requires approval for each turn."；`forbidden-by-team` 判定 = `分类==="call" || (分类==="global" && ceiling 级别 < always)`（`Te`，卡chunk:2:10332）
- 默认：`3w8V6a` "Allow lasts for this turn"
- Allow 按钮禁用（需在别的设备上回答）：tooltip `ykDLyL` "Answer on {targetMachineDisplay}"
- run-command 卡的详情按钮：`oWoQSS` "View the command"（其他 action：`OStQrX` "View the details"，`ke`）

### 4.3 卡片标题/描述（按分类，`Ie`）

| 分类 | 标题 | 描述 |
|---|---|---|
| global | `svTEGM` "Allow Grok Bot and all Bots to run commands on your local computer?" | `a9tTHW` "This applies to Grok Bot and every Bot. It can always be changed in Settings." |
| setting | `2ltcq2` "Allow Grok Bot to use Messages on your local computer?" | `2pfonj` "This applies to Messages only, not to commands or files" |
| subject | `2ltcq2`（同标题） | `TDaQFx` "This applies to this message only" |
| call | `ZNr4b5` "Allow Grok Bot to use an on-device tool on your phone?" | `S1GhTD` "Your team asks before each on-device tool runs" |

action→摘要（`Ae`，无 description 时）：send-input `tH+U6E` "Send input to a running command on your computer"；read-file `kQzX+T` "Read {target}" / `RK5AcV` "Read a file on your computer"；list-directory `KbFZpy`/`BKLcD+`；write-file `j0vvBP`/`EF1t/Y`；read-messages `Htzxqs`；send-imessage `RmCL2p`；use-app `8ffgqX`；run-phone-tool `PklaJw`；send-mail `GohvVN`；run-command 无摘要（看命令详情）。

结果行（`Le`）：global — `0dyBiF` "Grok Bot can run commands on your computer" / `HHczaN` "…cannot…" / `2PF7X0` "…was not allowed…" / `U3KtfK` "…this time"；subject Messages — `UJAP1D`/`oxUMTM`/`cdGXuM`/`f9pa67` 同构；use-app — `Q`：`TsmRYW` "Grok Bot can use {app}" / `NV+jvp` / `I0xt82` / `mk09HK`。

### 4.4 设置页 permissions 节（chunk-view-ODc_03uE.js:2）

- 结构：**每台已连接电脑一行**（`localToolPermissionByMachineId`；当前机 `localToolPermission`），行内下拉三档：`wvd4WD` "Never allow" / `6CTZeX` "Ask every time" / `iPJV+y` "Always allow {grantRecipient}"；stored 缺省 `ask`；提交 `setLocalToolPermission{permission,machineId}`。
- ceiling 提示行：`68SHzZ` "Your team's admin allows at most \"{ceiling}\""（ceiling 文案 select：always→"Always allow"，ask→"Ask every time"…），`localToolPermissionCeiling!==undefined` 时显示。
- standing grants 行（`tn`）：`3qTGok` "Skips the approval card for every text"（subject 类 grant 的说明）。
- 连接器（plugin）详情页：toolPermissions 节，tabs `always-allow` / `auto-review`，`lock: locked|free`；locked footer `sag80m`，free+autoReview on footer `RmzpYm`，off footer `xGRmq1`。

### 4.5 给 C2/M1 的映射建议（从原版行为反推）

- 我们的「始终允许」若要贴原版语义：bash 类应改 per-bot/per-machine 档位而非命令规则（原版 even 连 target 精确复用都只给 1 小时）；连接器写操作按 `writes` 档位三值（always_allow/needs_approval/blocked）对应我们 §7 第 7/8 行。
- 原版卡片 deny 是 tertiary（次要样式）放行按钮是 primary，"Always allow" 只在 subject 类出现——我们 A5/A7 的三态卡与原版一致。

## 证据清单（主要锚点）

| 结论 | 锚点 |
|---|---|
| 数据根与文件名 | daemon:1158 `function vs(`/`ENe/wNe/xNe/bNe`（`.grokbot`、`SLt`、`SAND_DATA_ROOT`） |
| action 枚举/分类 | daemon:1158:26805 `HBt`、`VBt`/`IC`；eager-app:12 `CMe`/`wMe` |
| 档位合成与默认 | daemon:1159 `wMe/PC`、`getLocalToolPermission`（`??"ask"`） |
| 主判定 | daemon:1159 `function bae(`、`lLe`、`vFt`、`Eae`(1159:5281)、`XDe` |
| approvals schema/TTL/写盘 | daemon:1159 `yFt/EFt/nLe`；core:1092 `cce`、core:66 `dU`；app:1111 `recordLocalToolApproval:async` |
| grants schema/匹配/准入 | daemon:1159 `eUt/RMe/AMe/$oe/RFt`；daemon:1158 `xMe`；app:1111 `recordLocalToolStandingGrant/setLocalToolActionGrant/getLocalToolActionGrant` |
| retirements | daemon:1159 `aLe/sLe/oLe/AFt` |
| spent-sends | core `spendSendApproval`（`already-spent`）、`xFt`（`spentIds`） |
| always 三语义 | 卡chunk:2:13370 `async function Re(` |
| always 禁用判定 | 卡chunk:2:10332 `function Te(` |
| 按钮/文案 | 卡chunk:2（`Be/Ce/Re` 段）；eager-app 内嵌 en i18n 表（id：h7peZQ/NoKBgy/zOxKTV/g3D+vR…） |
| 设置页 | chunk-view-ODc_03uE.js:2（`localToolPermissionCeiling` 三处）；app:1111 IPC |
| autoReview | daemon:1159 `Tae/WC/pLe`；coordinator:70:26953 `Wb`、coordinator:73:61989 `Zne`、73:62156 `Qne`；chunk-sand-auto-review-instructions-CoXp1wDA.js 全文；chunk-auto-review-rule-notice-DX8kPPBt.js:2:2634；chunk-plugin-detail-view-BgPF1Rqs.js:2；eager-app:4 `autoReviewTeamEnforced` |
| serverAuthoritative | daemon:1158 `aMe` schema；daemon:1159 `bae` 分支；core:919 一带 |

i18n 提取工具：`/tmp/re-r1/loc.py`（locale cjs）、`/tmp/re-r1/ctx.py`（bundle 上下文）。英文文案以 eager-app 内嵌 en 表为准，chunk-core-*.js 各语言表交叉验证过 id 一致性（af/fi/es 等）。

## 局限与未验证项

1. **纯静态**：未启动 0.78.1，文件写盘时机、TTL 惰性清理、supervised 模式行为均未运行时验证。
2. **approvalId 的生成方**：daemon 侧只接收（`approvalId:e.approvalId` 来自 RPC 请求），推断由 coordinator/云端随请求下发，未追到生成点（proto.cjs 1.4MB 未解码）。
3. **autoReview 逐次判定时机在云端**，bundle 内无本地执行证据；"何时触发"的客户端答案限于存储/同步/UI 三层。若需要精确判定语义（指令如何匹配动作），需运行态抓包或后端证据。
4. app（main-app.cjs，3.5MB）只做了审批相关关键字定位；`izt`（standingGrants store 包装）等少量符号未逐行展开。
5. minified 局部名（如 `$5`=allow、`VC`=ask、`i`='deny'）为上下文推断，但都有直接调用证据。
6. i18n 中 `4YBx5X` 等 id 出现在多处，选项文案以设置页上下文（wvd4WD/6CTZeX/iPJV+y）为准。
7. 未跑 REA 语义图（6MB minified 树图收益低于字节级锚定）；所有引文可用 ctx.py 复现。
