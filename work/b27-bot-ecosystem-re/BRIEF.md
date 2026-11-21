# B27 · Grok Bot bot 生态深度调研（0.78.1 产物挤出，2026-11-18）

用户指示（m03842 附近）：「基于Grok Bot先把所有的UI全部1比1复刻，然后再基于DSH Superagent、DSH把Grok Bot的一些后端功能做适配。比如说跨bot、创建bot、bot的互动以及一些特色功能……这块你可以用github mcp去搜索」——调研自主做，不问用户。

方法：ecoscan.py（新工具，本批产）按关键词查 en 母表（index.eager-common）× eager-app 主包 i18n id 位置；直接读 bundle 上下文。

## 一、挤出规格总表（0.78.1 bot 生态）

### 1. 个人 bot 创建（Create New Bot 对话框 @2801959）
- 入口 i18n：nHOJ2T 'Create New Bot'、RFtRvq 'Bot name'、2DQ7aH 'Name your Bot'（placeholder）、hYgDIe 'Create'（主按钮）、dEgA5A 'Cancel'、/DwR+n（pending 文案）
- 对话框：rw.Root sand-create-bot-dialog size:md variant:rich；CloseButton+Header(Title)+Body+ActionBar(Cancel + Create primary)
- 表单：name input（maxLength 255，aria-label=Bot name，Enter 提交 isComposing 忽略）+ 头像预览 dT{color,shape} + VO 颜色/形状选择器（onSelectColor/onSelectShape，limitedShapes 时受限）
- 创建链 n3t（@2804900）：beginCreation({name, expectsContent:!0, kind:'teammate'}) → createAgent({clientNonce, name(≤255 trim), description??'', origin:xm, isKickstartRequested:!0, avatarShape?, avatarColor?, templateId?}) → setAgentId → onAgentCreated → kickstartAwaitingFirstMessage(agentId)
- 名称清洗 c1()：trim+collapse spaces+slice(0,72)（新聊天收件人路径）

### 2. 新聊天单收件人 bot 即建（Zkn @3524700）
- 分支：已有 agent → selectAgent+sendFirstMessage；否则 beginCreation(kind:'single-recipient')
- **kickstart 判定 m4t(name)**：name 以 .?! 结尾 / >5 词 / ≥40 字符 → 视为 prompt（l=name 作为首条消息），否则空消息走 kickstartAwaitingFirstMessage
- createAgent({clientNonce, name:c1(name), description:''}, {isKickstartRequested:!u})

### 3. 团队 bot 创建（Qkn @3525400）
- beginCreation(kind:'team-bot') → isSharingHeld 检查 → createAgent({name, description:'', harness:vm('temporal')}, {isIntroductionSuppressed:!0}) → setVisibility(agentId, Bc.team) → …
- Team Bot 全流程走云端 temporal harness——**deferred 维持**（B25 判定）

### 4. 群聊创建（@2788999/2790349）
- 收件人列表 people+agents 混合；未存在 agent 收件人 → createAgent({name, description:'', harness:vm}) 即席创建（失败回滚 deleteAgents）
- createGroup({name, description:'', memberAgentIds, humanMemberUserIds?})；成员上限 h4t：human<19、agent<6
- 失败态：RBYZnv 'Retry group creation'、lTdUnW（草稿保留提示）、orCYvu（不确定态提示）——**群聊=createGroup 云端，deferred；即席 agent 创建的 UI 形态可参考**

### 5. bot 交互/子代理（A_/sg @452888/1544893）
- getSubagents({id}) → rows：{subagentId, status:'running'|…, freshUntilMs}
- 契约：subagents family getSubagents:{args:'object',reply:'array'}；ingestSubagentsEvent{parentAgentId, subagents} 推送
- 状态机 sg()：agent.awaitingSessionIds∋threadSessionId → blocked；agent.workingTaskSessionIds∋ 或 task.subagentIds 有 running → isWorking；unreadEntryId!==undefined → unread dot
- task 线程 key ug()：`task:{taskId}:{parentSessionId}`（dm:N 会话）；taskSession 校验 kve=/^[0-9a-f]{10}$/
- **T36/T37 已闭环我方 Workers 分组（同构判定 origin==='subagent'&&parentSessionId===mainBotId）**

### 6. bot 市场模板（Npe yl bot-marketplace @327561）
- featuredListings+listings（slug 索引）；EuTQUZ 市场不可用提示
- 契约：publishBotTemplate/getBotTemplateVersion/getBotTemplateForSourceAgent/getBotTemplateExportPolicy/deleteBotTemplate/setBotTemplateVisibility（Id 组 @253317）
- createAgentFromTemplate({shareId, agentId, name, avatarShape, avatarColor, expectedActiveVersion:1, isAutomatic:!0, creatorContext})（@4183022）
- 模板发布=云端市场——**deferred**；但「从模板创建」的 RPC 形态可映射 dsh preset

### 7. 其他已确证
- deleteAgents({ids}) → {refusedAgentIds, failedAgentIds}（部分失败报告）
- setAgentHiddenFromSidebar：owner=false 走 desktop.setGrokBotAgentSidebarHidden，否则 roster.toggle
- reactToMessage / createThreadFromMessage（消息级交互：表情回应+从消息岔开新线程）
- voteFeedback；searchAgents/searchMedia

## 二、DSH 侧映射判定

| 0.78.1 面 | DSH 实底 | 判定 |
|---|---|---|
| Create New Bot 对话框（name+avatar+description） | session/create（M1 已白名单）+ 我们 m3-meta botsMeta 档案层 | **可接 B27a**：建 session+写 meta（name/color/shape/description），侧栏即现 |
| kickstart（无首条消息时引导） | 无——首条消息即 session/prompt | 可接简化版：创建后 composer 聚焦（不假发消息） |
| 新聊天单收件人即建+name-as-prompt 判定 m4t | session/create+session/prompt | **可接 B27a**（把 m4t 判定抄过来：name 像 prompt 时直接当首条消息发） |
| getSubagents/running 状态 | dsh session 状态投影（T36/T37 Workers 已做） | 已闭环 |
| createGroup 群聊（多 bot+人混聊） | 无群聊概念（session 是 1:1） | **不接**（无后端；DSH 无 multi-agent session） |
| team-bot temporal 创建 | 云端 | deferred 维持 |
| bot 市场模板 CRUD | pluginMarket（M1 已白名单）形态相近但语义不同（市场是 bot 模板，我们的是插件） | **候选 B28**：评估 agentPresets 映射（M1 已白名单 agentPresets/list！） |
| reactToMessage | 无 | 不接 |
| createThreadFromMessage | 无（session 不可从消息岔开） | 不接 |

## 三、候选队列（B27 起）
1. **B27a Create New Bot**：新建 bot 对话框（name 255/avatar color+shape 预览+VO 选择器）→ session/create+botsMeta patch；新聊天单收件人路径加 m4t kickstart 判定。e2e：点 New Bot→填名→Create→侧栏新行+会话开。
2. **B28 bot 模板面评估**：agentPresets/list ↔ bot-template 深度对比（预设=模板的最小等价？）；能接则做「从模板创建」入口。
3. 后续再排：voice-memo、team-bot-line-render 视觉、Calendar 壳评估。

## 证据锚
- 全部 offset 指向 work/grok-1.1.0-re/gb0781/extracted/dist/renderer/assets/index.eager-app-iGTgHP_Q.js（4.5MB）
- en 母表：index.eager-common-DbK3Oi_r.js
- 新工具：work/grok-1.1.0-re/harness/ecoscan.py（关键词→母表×主包交叉）
