# RE · R-01 · 0.78.1 提问卡（widget + user-form）渲染面规格

v1 · 2026-11-03 · reverse-engineer（GLM 5.3 + 静态分析，REA 未跑引擎——纯 JS 树直接字节级读）
对象：`/dev/shm/grok-re/0.78.1/app/dist/`（易失，丢失按 RE-unpack §0 重建）。只读，未运行原版成品（r3 桩跑了但见 §8 回归）。
下游：**P5-33 提问卡**、P5-28。锚点格式 `文件@字节偏移`（minified 单行文件，字节偏移是唯一可靠定位；`函数名()` 为 minified 名）。

缩写：APP = `renderer/assets/index.eager-app-iGTgHP_Q.js`；WCH = `chunk-widget-DEsXv4qw.js`；WV = `chunk-view-BnT48mMZ.js`；UFV = `chunk-view-lxKSMA-f.js`；IUF = `chunk-inline-user-form-DX_81oNY.js`。en 文案内嵌 APP；lazy 翻译在 `chunk-chat-*.js`（§5 表为 en 原文）。

## 0. 结论速览（四问）

1. **两条提问通道，两个组件族**：`send-message:type=widget`（WV+WCH，选项/多选/自定义输入/多步问卷）和 `send-message:type=user-form`（UFV+IUF，结构化表单/电话提问）。widget 内还复用三种特殊 payload：`order`（结账单）、`ruleChange`（auto-review 规则卡）、`automation_spend_guard_*`（选项文案走 i18n 的机器键）。
2. **「widget 型卡」不在 15 型事件卡里**。15 型 event（`jie`，APP@197656：name-changed/channel-*/automation-changed/task-changed/cloud-agent-launched/team-*/person-*/bot-*/dev-event/desktop-goal）无任何提问卡；提问卡全部是 send-message 35 型（`bXt`，APP@2617964）中的 `widget` 与 `user-form` 两型。dev-event 卡（chunk-view-B0UyDBz4）只是图标+一行描述。
3. **作答交互**：widget 单问卡＝选项行（单选即点即交、多选勾选后 Submit、自定义输入 Enter/Submit）；多步问卷＝逐题 Next、末题 Done、Back/Skip、全空提交＝dismiss；user-form＝字段表单 Submit（+可选 vault 保存勾选）/Cancel（本地收起，不撤回）；电话问卡＝输入框 Send/Skip。RPC：`respondToWidget{entryId,value,agentId,sessionId?}` / `dismissWidget{entryId,agentId,sessionId?}` / `submitUserForm{entryId,values,agentId,sessionId?,saveToVault?}` / `dismissUserForm{entryId,agentId,sessionId?,mode:'dismissed'}`。
4. **与审批 Dock 无关**：0.78.1 renderer 里没有 LocalToolPermissionDock（全库 grep 无此名；APP 只有 inputDockRef/underDock 等无关词）。提问卡与审批卡一样都是 **transcript 内 in-flow 卡**（`sand-message-card` 外包 frame variant `question`/`widget`，APP@2532316 `zGt` 表）。P5-51 的 composer Dock 是 0.18 移植树实现；**P5-33 提问卡应放 transcript，不进 Dock**。

## 1. wire 形状（renderer 读到的字段，全部有消费点）

### 1.1 widget entry（`kind:'send-message'`，`message.type:'widget'`）
```
entry: {
  id, seq, timestampMs, kind:'send-message',
  message: { type:'widget', widget: {
    prompt: string              // 必有；无 prompt → 渲染成普通卡壳（IF 分支）
    helpText?: string           // 单问卡副标题（markdown）
    options?: [{label, description?, value?}]   // 单问卡选项；value??label 为答案键
    multiSelect?: true          // 多选
    allowCustom?: true          // 自定义输入
    steps?: [{prompt, options:[{label,description?}], multiSelect?, allowCustom?}]  // 多步问卷
    ruleChange?: {kind:'add|update|delete|replace', effect:'allow|ask_first', text, replaces?}
    order?: object              // → chunk-order-checkout 订单卡（WV@Je 首分支）
    dismissOnMoveOn?: true      // stale(isStale) 时自动转 dismissed
  }},
  respondedValue?: string|string[],   // 已答（服务端回填）
  respondedValueEchoed?: true,        // 已答且回显 → 降级为普通 assistant 气泡
  widgetDismissed?: true,             // 已跳过
}
```
- 选项键 = `value ?? label`（WCH@75 `A(e)`）；比较前规范化（小写去空白，APP `Io=MQ`）。
- 多步判定 `zYt`（APP@2613800）：`steps` 是数组且 **length ≥ 2**、每题 prompt:string + options 非空 → 多步问卷；否则（含 1 步）走单问卡。

### 1.2 presentation 状态机 `IF`（APP@1657484，导出名 vm）
```
type≠widget 或 prompt 缺 → {kind:'card'}
respondedValue==null:
    widgetDismissed → dismissed
    本地乐观答案(kind answered) → resolved{answer}
    本地 dismissed 或 isStale → dismissed
    否则 → card（可作答）
respondedValue!=null:
    respondedValueEchoed → question（整体降级为 assistant 气泡，仅 prompt）
    否则 → resolved{answer:respondedValue}
```
isStale 传参 = `entry 已被后续回合越过 && widget.dismissOnMoveOn===true`（WV@Je：`z(n,p, i===!0&&m.dismissOnMoveOn===!0)`）。

### 1.3 user-form entry（`message.type:'user-form'`）
```
message: { type:'user-form',
  formRequest: {                  // 卡即读此对象为 form
    title: string, instruction?: string,
    fields: [{id, label, type:'text|email|password|checkbox|select|textarea', required?, placeholder?, options?:[{label,value}], secret?, secretFromAccountLabel?}],
    domains?: string[], domain?: string, liveHost?: string,          // 站点确认/安全脚注
    destination?: url,             // 自动填充目标页（卡片显示站点 favicon/brand）
    secureValues?, saveAvailable?, saveToVault?:'card'|'contact'|'contact_delete'|'contact_update', vaultSaveOnly?, defaultChoice?:'use_once'?
  },
  phoneCallQuestion?: { prompt?, askedBy, deadlineAtMs, callConnectedAtMs?, closed?, placeholder? }  // 电话问卡分支
}
entry.formResolution?: 'sending'|'submitted'|'stale'|'failed'|'fill_failed'|'escalated'|'dismissed'|…
entry.formFieldOutcomes?: [{id, submittedValue?, filled?, secureValueStorage?:'stored'|'replaced'}]
entry.formSubmissionEffect?: {kind:'settled', wakeDelivery:'pending'}   // 唤醒对账重试
```
电话问卡状态机 `pcn`（APP@3018056 前）：closed 优先；否则 resolution submitted→sent、dismissed→skipped、now≥deadline→timed_out、否则 open。

### 1.4 RPC（APP@263250 widgets 域 9 方法 + APP `Id` 表签名）
`respondToWidget{args:object→record-or-null}`（回 `{accepted?:false}` 时客户端回滚乐观态）、`dismissWidget{→record}`、`submitSecret`、`submitUserForm{→void}`、`dismissUserForm{→void}`、`voteFeedback`、`sendDraft`、`discardDraft`、`searchPlacesArea`。
- 作答值：单选 = 选项键字符串；多选/含自定义 = `string[]`（选项键 + 原样文本）；多步 = `UYt` 格式化文本 `"题干\n答案\n…"` 空行分隔各题（APP@2614163，与复制文本同构；逆向解析 `KYt` APP@2614494）。
- 乐观层：`localAnswers` 按 `(agentId,entryId)` 记 `{kind:'answered'|'dismissed', value}`，RPC `accepted===false` 或失败时回滚并记 `widget-failure`（hook `yye` APP@430163）。多选草稿存 `widget-selection`、自定义文本存 `widget-draft`。
- user-form 错误码：`user-form/stale`（已被越过 → 显示 stale、本地复位）、`user-form/refused`（拒绝信息文本，>200 字符截断加 …，`"user-form/refused"` 字面量跳过）。
- **唤醒对账**：`formSubmissionEffect={kind:'settled',wakeDelivery:'pending'}` 时后台退避（1s→5s→15s，3 倍 backoff）重发 `submitUserForm(entryId, values:{})` 直到落地（UFV@nt 内 `user-form-wake-reconciliation`）。

## 2. 单问卡渲染规格（WCH `R`→`be`，surface=elevated）

结构（外→内）：
1. frame：`questionCardWrap`（WV 用 variant `question`）+ elevated 卡壳 `L`（WCH@15338）：`surface:'elevated'`、`inset:'compact'`、radius 24 / bg `--sand-bg-elevated` / 卡宽随消息列 `min(80%,560px,100%-82px)`（值同 RE-visual-078 §B9 审批卡——两卡同壳）。dismissed 态加 `skippedCard` 类。卡壳带 ResizeObserver 高度缓动动画（cardToggleDuration/cardCollapseDuration）。
2. 题头 `M`（WCH@3190）：title=prompt（markdown 渲染，`dir=auto`）；subtitle=helpText（markdown）+ 多选时追加 **“Choose all that apply”**（08KMGH）。已决态题头降透明（`sand-169k319`）。
3. 选项组：每行 `se`（option row，elevated）：前导字母圈 `a`（A/B/C…，`String.fromCharCode(65+i)`，lg 尺寸，选中态高亮）；label；可选 description（次行）；行按钮 `pressed/selected`；键盘可达时行右侧显示 `keyShortcut`（小写字母）。
   - **单选**：点行即 `respondToWidget([value])`，无提交按钮。
   - **多选**：点行 toggle（本地 `widget-selection` 持久），底部出 primary **Submit**（DPfwMq="Done"…见 §5 表；多选 footer 恒在）。
   - **allowCustom**：选项列表后附自定义输入行 `oe`（elevated 内联 input），aria "Custom answer"（dN9Fia），placeholder **“Something else”**（aQyGJc），快捷键 = 下一字母（如 3 个选项 → D）。Enter（非 shift/非 IME 组合中）提交；单选+已输入时 footer 出 primary **Submit**（hQRttt）。
   - bubble 模式（非 transcript，如主 bot 选择器）差异：选中行尾打勾徽标（“Selected” ylXj1N）、textarea placeholder “Type your own answer”（ovrcCJ）。transcript 卡用 elevated 模式。
4. 撤销：题头右侧 X 图标钮（iconSize sm）：title **“Dismiss without answering”**（ZNqNak）→ `dismissWidget`。失败态 footer 出 secondary **“Try again”**（KDw4GX）重放；失败文案 role=alert body2：dismissed 失败=“Couldn't skip this question”（2pAqMH）、提交失败=“Your answer didn't go through”（LG8OOT）。
5. 键盘：卡为键盘目标且有选项时监听 keydown：字母键=选项序号（输入框聚焦时忽略），自定义槽位字母聚焦输入框（WCH `me`@66）。
6. 特殊选项值 `sand:choose-main-agent`：gate `sand_grok_main_agent` 且允许时，点它不答题而触发 `replaceMainAgent()`。
7. 已决视图（`R` resolved 分支 → `F`）：只渲染被选行（字母圈+label，selected 样式），组标签 **“Your answer”**（Vtq6ex）；原始文本答案同样成行。dismissed → 只读选项列表（灰）+ 标签 **“Dismissed”**（J6hrEy）。复制（entry 菜单 onCopy）= `prompt\n答案`。
8. 只读/不可作答（非本 bot 或 viewer 非主人）：`Ce` 只读卡（题头 + 灰选项列表 + 说明注记）。

### 尺寸预算（APP 自带虚拟化高度估算器 @2615838 起，authoritative）
- 题头：`18 + ceil(len(prompt)/70)*22 + (helpText 行数 + multiSelect?1:0 ===0?0: 2+行数*20)`。
- 选项行 **40px**（+description 18px），行间 gap **1px**，选项块上下 pad **16px**（`LQ`）。
- 自定义输入行 **42px**；单问卡顶部基线 24（bubble 面 14）+ 题头 22/行。
- 多步卡整卡 = max(各步 高) + footer **62px**；进度行 20px（sXt=2,cXt=20）。

## 3. 多步问卷卡（WV `ke/we/Oe`）

- 进入条件：`steps` ≥2（§1.1）。外壳同 elevated 壳（`ue`=WCH `L`），`aria-label=prompt, role=group`。
- 一次只显示当前步（其余步 `aria-hidden` 收起）；每步 = 题头（含 multiSelect 提示）+ 选项行（同 §2，单选即进下一步）。步内多选需 Submit？否——多选在步内 toggle，**末步 footer 的 Done/Next 承担提交**。
- footer（`m` 行）：leading=进度指示 `s`（`{activeIndex,count}`，圆点/步数）或失败注记；trailing 按钮排：`[Back(iH8pgl, secondary, lg, 仅 stepIndex>0)] [Skip(6Uau97, secondary, lg)] [Next(hXzOVo)/Done(DPfwMq), primary, lg]`。
  - Next：`stepIndex+1`；Done（末步）：全部选择为空 → `dismissWidget()`；否则 `respondToWidget(UYt(steps,picks))`。
  - Skip：清空当前步并提交空 → 等效 dismiss（`I(M([]),P(''))`）。
- 进度状态 `{stepIndex, picks[][], typed[]}` 按 entry 持久（刷新续答，`ds=JZ` 存取）。
- 键盘：字母=当前步选项；allowCustom 的输入槽=下一字母；Enter 在输入框提交当前步。
- 已决视图 `Oe`：全部步展开、只显示被选行（含 typed 原文行，序号=选项数位字母）；无选择 → 组标签 **“Skipped”**（9NyAH9），有选择 → **“Your answer”**（Vtq6ex）。footer 退化 Back/Next 翻步（secondary）。复制文本 = `UYt` 全文。
- `respondedValueEchoed` / presentation `question` → 整卡降级为 assistant 文本气泡（只 prompt），无选项。

### widget 的三种复用 payload（顺带，非 P5-33 主线）
- `ruleChange`（WV `qe`@16507）：auto-review 规则卡。题头=确认句（Add/Update/Remove custom rule?），正文=规则句式（“Allow without asking: {rule}” 等 4 式，句首智能小写），pending=两钮 `Allow`（3/XRac→dismiss）/主钮 Add/Update/Remove Rule；终态单行 Added/Updated/Removed/Not saved/Cancelled；团队规则锁（aoONzQ）不可操作；保存走 `setInstructions({surface:'chat_card',textSource:'chat_request'})`。
- `order`：chunk-order-checkout 组件，variant `widget`（本次未深挖，P6 需要再派）。
- `automation_spend_guard_nudge/paused`（APP@2614673）：选项值是机器键（`spend-guard:keep` 等），label 由 i18n 表替换——复刻时注意这类选项值≠文案。

## 4. user-form 卡渲染规格（UFV `ot→tt/nt`，IUF 字段件）

三种形态（UFV `nt` 分派）：
- **A. 内联表单**（简单表单：非卡/非 vault/无特殊字段，判定 `dcn` APP@3018056）：elevated 卡（titlebar=站点行：favicon/brand 图标 14px（brand 32/24 比例≈19px）+ 确认域名或 “Secure Form” q//tqW；有 `destination` 时先加载站点元数据）→ title → instruction（level sm）→ 字段区 → vault 勾选 → footer。
- **B. 收起瓦片 + 对话框**（复杂表单：卡号/billing/vault/联系人，`Ct/Nt/It` 分派）：卡片收成一行 tile（图标+title+副题 “Opens a secure form” fdCop9）+ secondary **Open**（1TNIig）打开大对话框（vault 卡捕获表单/通讯录表单走 vault-card-dialog 组件族）。
- **C. 电话问卡**（`message.phoneCallQuestion`，frame variant `widget`）：titlebar=“Phone call”+通话计时/状态徽标（Sent/Skipped/Timed out/Ended）；title=prompt??instruction；subtitle=`"{calleeName} is asking · Respond in {remaining}"` 倒计时；单行输入（placeholder `“Message {agentName} for {calleeName}…”` By//1f）+ **Skip**（6Uau97）/ **Send**（JlFcis）主钮；Details 折叠展开已答/未答（“Nothing sent” 2C+6zf）。Skip→`dismissUserForm(mode:'dismissed')`。

字段控件映射（IUF `We/He`）：
| type | 控件 |
|---|---|
| text/email/其他 | `<input>`（spellCheck=false, dir 由字段 id 判，cc_number=卡号校验错 “Enter a valid card number” w4wCgl，电话字段带国家前缀组件，地址字段带 street 自动完成） |
| password | `<input type=password>` + 显隐切换（isRevealed） |
| select | 原生 `<select>`（无空 option 且必填时首项即值）；可搜索选项（如国家）→ Combobox |
| textarea | `<textarea rows=3>` |
| checkbox | 复选行（值 'true'/'false' 字符串，asterisk 必填标） |

行布局：非 checkbox 先、checkbox 后；固定并排对：`cc_exp+cc_csc`、`billing_city+billing_region`、`billing_postal_code+billing_country`（IUF `at` 表）；billing 组可折叠（“Billing address” gzEjAL + 摘要=已填值逗号连接 + “Use a saved address” AUlTme 下拉回填）。
footer：security 脚注（caption）：vault 表单=“Grok Bot vault”（FwkNa+）；无域名=“Never shown to your Bot”（JPJhlO）；有域名=“Never shown to your Bot. Only filled on {hosts}”（puLVa7）/“Filled directly to {host}”（RoJiIB）；`{host} Secure Form`（ExBtzx）。vault 保存勾选（saveToVault 可用时）：label **“Securely save to Bot's vault”**（oxg1so），锁定态注记 o9/1q2；contact 模式附 Label 输入。按钮：secondary **Cancel**（dEgA5A，仅收起/复位，**不调 RPC**）+ primary **Submit**（hQRttt；saveToVault='card' 对话框为 “Save card” xGekty / “Continue” xGVfLh；contact_delete=“Delete” cnGeoo / contact_update=“Update” EkH9pt / vaultSaveOnly=“Save” tfDRzk）。
提交门槛：必填空（checkbox 未勾/text 空）或 contact 全空 → Submit 禁用；提交中 aria-busy + 钮 pending。提交值 = 非空字段 `{id:value}`（checkbox 'true'；vault 提供的字段跳过；contact 附 label）；`saveToVault:true` 时另存 vault。提交失败 → 卡内 role=alert 错误（sqv7nV “This form wasn't accepted” / 3CYbcR “Couldn't submit this form. Check your connection and try again.”），保持可改可重交；stale → 收起并标 “No longer needed”（+wKZ4h）。
终态卡（`Xe`）：titlebar 状态徽标（Sending 9bG48P 带 spinner / Submitted ZU3JQG 勾 / Not filled z0Dv36 / On screen dRUzl8 / No longer needed +wKZ4h / Dismissed J6hrEy），submitted 展开为禁用字段行（值或 `••••••••`，secureValueStorage stored/replaced 或 filled 也显示掩码），可 Disclosure 展开明细；简单终态=收起 tile（Qe：title+状态徽标）。
只读（他人 bot / 无 agentId）：不可输入。

## 5. en 文案表（渲染必需，P5-33 直接用）

| id | en | 用途 |
|---|---|---|
| 08KMGH | Choose all that apply | 多选题头提示 |
| aQyGJc | Something else | 自定义输入 placeholder |
| dN9Fia / irCsCY | Custom answer / Your own answer | 输入 aria / 多步版 |
| ovrcCJ | Type your own answer | bubble 面 textarea |
| ylXj1N | Selected | 选中徽标 title |
| iH8pgl / hXzOvo / DPfwMq | Back / Next / Done | 多步 footer |
| 6Uau97 | Skip | 跳过（多步/电话/user-form 语音） |
| hQRttt | Submit | 表单主钮 |
| JlFcis | Send | 电话问卡 |
| KDw4GX | Try again | 失败重试 |
| 2pAqMH / LG8OOT | Couldn't skip this question / Your answer didn't go through | dismiss/提交失败 |
| i+D6RG / ZNqNak | Dismiss question / Dismiss without answering | X 钮 |
| 9NyAH9 / Vtq6ex / J6hrEy | Skipped / Your answer / Dismissed | 已决标签 |
| dEgA5A / 1TNIig / piOaUk | Cancel / Open / Open secure form | 表单 |
| ejvwTz / fdCop9 | Secure form / Opens a secure form | 表单卡副题 |
| SGsZyD | Submitted form | 表单终态摘要 |
| 9bG48P / ZU3JQG / z0Dv36 / dRUzl8 / +wKZ4h | Sending / Submitted / Not filled / On screen / No longer needed | 表单状态 |
| sqv7nV / 3CYbcR | This form wasn't accepted / Couldn't submit this form. Check your connection and try again. | 表单错误 |
| oxg1so / o9/1q2 / 87a/t/ | Securely save to Bot's vault / Saved securely and kept private / Label | vault |
| FwkNa+ / JPJhlO / puLVa7 / RoJiIB / q//tqW / ExBtzx | Grok Bot vault / Never shown to your Bot / Never shown to your Bot. Only filled on {hosts} / …Filled directly to {host}. / Secure Form / {host} Secure Form | 安全脚注 |
| By//1f / emKTy2 / URmyfc / tGA80P / kHOGmb / f8vZT3 / h69WC6 / 01Zgfk / 237hSL / 2C+6zf / bfgr/e | Message {agentName} for {calleeName}… / Phone call / Details / {calleeName} is asking · Respond in {remaining} / {calleeName} asked · No reply in time / Call ended / Sent / Timed out / Ended / Not sent / Question | 电话问卡 |
| gzEjAL / AUlTmE / sRag9r / LLAa/9 / w4wCgl | Billing address / Use a saved address / Enter a new address / Optional / Enter a valid card number | billing |
| TJ2z5E / 7ZzuSf / /2PjFe | Add/Update/Remove custom rule? | ruleChange 题头 |
| bmQLn5 / cSX/Kr / 8lCgih | Add Rule / Update Rule / Remove Rule | ruleChange 主钮 |
| hp8OtS / +b7T3G / eps54V / qzsXzo / vv7kpg | Added / Updated / Removed / Not saved / Cancelled | ruleChange 终态 |
| T4eACc / HcxiaU / Qcljnf / 4KtqjJ | Always ask first: {rule} / Allow without asking: {rule} / Grok Bots will always ask before {rule} / Grok Bots won't ask before {rule} | 规则句式 |
| aoONzQ / kYursO / BoZ7tV / I3NrRD / cVbFyD | Required by your admin… / Couldn't load your permissions / Couldn't save the rule… / This rule changed… / Manage Permissions | ruleChange 附注 |

（hXzOvo="Next" 在 eager-common catalog；其余在 APP 内嵌 en 表。）

## 6. 与 dsh（deepseek-harness）wire 的对照与移植建议

dsh `tool-ask-user`/`user-questions`（repos/deepseek-harness `packages/interaction/user-questions/src/types.ts`）↔ 0.78.1 客户端面：
- `AskUserQuestionItem{id,question,detail?,header?,options?,multiSelect?}` ≈ widget 单问卡 `{prompt, helpText, options, multiSelect}` + **allowCustom 对应 dsh 的 `custom` 自由文本**（0.78.1 由 `allowCustom` 开输入槽，答案混入 value 数组；dsh `AnswerItem{selected[], custom?}` 是显式分开的结构）。
- dsh 多问题一批 ≈ 0.78.1 的 `steps` 问卷（≥2 题才走多步 UI；1 题渲染成单问卡）。
- dsh `intent{plan-review|approval}` 无 0.78.1 对应——0.78.1 的「approval」是 local-tool-permission/connector-grant 独立卡型，不在 widget 里。
- 0.78.1 答案值是**扁平字符串/字符串数组**（多步为格式化文本），dsh 是结构化 `answers[]`。P5-33 若在移植树上走 dsh wire，渲染层映射：`selected+custom → picks+typed`、`custom 文本命中选项(规范化比较)→并入选项键`（Se 函数语义，WV@201）。

## 7. 证据清单

| 结论 | 锚点 |
|---|---|
| send 35 型含 widget/user-form；event 15 型无提问 | APP@2617964 `bXt`；APP@197656 `jie` |
| widget 分派（order→ruleChange→question→steps→单问） | WV `Je`@20350 |
| presentation 状态机 | APP `IF`@1657484 |
| steps 判定（≥2） | APP `zYt`@2613800 |
| 单问卡交互/键盘/草稿 | WCH `be`@5361、`me`@66、`R`@16122 |
| 多步卡（footer/进度/持久化/提交值） | WV `we`@3710、`Oe`@10250、`ke`@12267；APP `UYt`@2614163、`KYt`@2614494、`BYt`@2613963 |
| 高度常量（40/18/42/62/22/16/1…） | APP@2615838–2616300（`QYt…uXt`、`pXt/mXt/hXt/dXt/LQ`） |
| widgets 域 9 方法 + RPC 签名 | APP@263250；`respondToWidget:{args:object,reply:record-or-null}` 等（APP `Id` 表） |
| 乐观作答/回滚/settle | APP `yye`@430163 |
| user-form 分派/终态/唤醒重试 | UFV `ot`@21339、`tt`@13130、`nt`@13395；APP `dcn`@3018056、`pcn` |
| 字段控件/行布局/vault/footer | IUF `We`@14596、`He`@13276、`je`@8745、`Rt`@34490、`at`/`_t`/`Ze` |
| 电话问卡 | UFV `je`@4222、`at`、`it` |
| frame variant 表 | APP `zGt`@2532316、`YZ`@2532827 |
| elevated 卡壳视觉值 | RE-visual-078 §B8/B9（radius 24、min(80%,560px,100%-82px) 等，本卡同壳） |
| en 文案 | APP 内嵌 catalog（id 串逐个 grep 可复现）；lazy 翻译 `chunk-chat-*.js` |
| fixture（已加进桩，复跑用） | `harness/grok-r3/stub-init.js` getAgentTranscriptTail e15–e20 |

## 8. 局限与未验证

- **r3 参照图未产出（环境回归）**：RE-stub-boot 方法本次复跑失败——页面 boot 完整（marks 全过、tail RPC 正常回），但 transcript 恒空态（“No messages yet”），连原始 fixture（git 22d7558 版 stub）也一样；早上同 harness 成过，疑似 Chrome 156 自动更新改变启动时序。7 次截图字节级相同（含 1 次带探针标记），轮询 30s 未见消息闪现。**建议**：修 stub 时先 diff 晨间 vs 现在的 chrome 版本/启动参数；fixture 已就位（见 §7 末行），修好即 `node drive.mjs …?theme=light|dark` 出图。
- px 数值来自 APP 自带高度估算器（虚拟化预留高度），非 CSS 直读；与实际渲染差 ≤1–2px（估算器含 0.5px 余量项 tXt）。
- `order` widget（结账单）只确认分派与 chunk（chunk-order-checkout），payload/UI 未逆（属 R-12 系，未列入本任务）。
- `automation_spend_guard_*` 选项 i18n 键只取证到映射表存在（APP@2614673），未穷举 label 文案（非 P5-33 范围）。
- 多步卡「步内多选 + Skip 清空」语义从代码推演（`I(M([]),P(''))` → 全空 → dismiss），未实机点验（同 stub 回归原因）。
- user-form B 模式（vault 卡捕获对话框）视觉细节在 chunk-vault-card-dialog-BsPYIg-g.js，只读了接口（addTitle/mode/status/fields{holderName,securityCode,nickname,billing}），深挖留给 R-02/后续。
- 未验证：respondedValueEchoed 实际出现条件（推断为「答案已被模型作为回合输入回显」）；steps 中某步 options 为空的容错路径。
