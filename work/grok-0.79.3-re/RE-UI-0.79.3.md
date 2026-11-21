# RE-UI：Grok Bot 0.79.3 三题规格取证

日期：2026-11-07。方法：静态分析已解包产物（`/tmp/grokbot-0.79.3/extracted/dist/`，只读），minified chunk 用关键词定位 + 上下文窗口抽取；i18n 哈希 id 用英语言表（`index.eager-common-B73tST-1.js` 与 `index.eager-app-BXVg2FvL.js` 内嵌表）反查。未执行任何产物代码。

主要锚点文件（下文简称）：
- **APP** = `renderer/assets/index.eager-app-BXVg2FvL.js`（主 bundle，4.87MB）
- **COMMON** = `renderer/assets/index.eager-common-B73st-1.js`（公共/吉祥物系统）→ 实名 `index.eager-common-B73tST-1.js`
- **ONB** = `renderer/assets/chunk-onboarding-flow-D-TfK2Rr.js`（onboarding + 模板目录）
- **COORD** = `node-agent-coordinator/main.cjs`（本地 dsh 代理协调器，内嵌同一套 transcript 谓词）
- **PROTO** = `electron-main/proto.cjs`（protobuf 契约）

minified 函数名（如 `LF`、`NAt`）是产物内的混淆名，直接可 grep；本文引用处均给出可复现的搜索串。

---

## 题 1：回复呈现——「没有 CoT，只有第一次回答和最后一次回答」

### 结论（先说机制）

0.79.3 的主聊天流里，**思考和工具调用根本不是可渲染的聊天条目**；中间过程只通过两个动态通道呈现（状态行动画 + 头像状态动画），完整过程藏在可选的「Full conversation」侧板里。用户看到的「首答 + 终答」形态 =

1. user message（正常渲染）
2. 运行中：transcript 尾部的**动态状态行**（"Thinking / Searching / …" 短语轮换）+ 发送对象 bot 的**吉祥物头像状态动画**（眼睛、morph、工作状态）
3. assistant message（正常渲染）——中间模型轮次作为 `message` entry 携带 `suppressed` 标记进入 transcript，被两端一致地隐藏；未被抑制的 message（对用户可见的首条与最终条）正常渲染。

### 证据

**(a) 序列化 entry kind 全集里没有 `thinking`**。APP 内 `var Cc=[`message`,`tool-call`,`send-message`,`user-attachment`,`notice`,`event`,`feedback`,`labeler-question`,`voice-call`,`mcp-app`]`（搜索串：``var Cc=[`message`,`tool-call``）。思考不是 transcript 条目；它只存在于两个派生结构：activity status（见 d）与 outline 面板（见 e）。

**(b) 主聊天隐藏谓词（renderer）**。搜索 ``function LF(e){return IF(e)||bF(e)||e.kind===`tool-call```，完整函数体：

```
LF(e) = IF(e)              // send-message streaming 且 text 内容为空（空流占位）
      || bF(e)             // message 且 e.suppressed != null   ← 中间轮次抑制
      || e.kind===`tool-call`                                  ← 工具调用无条件隐藏
      || Mxt(e)            // notice 以 "A background task was stopped " 开头
      || wne(e)            // local-tool-permission 且 ask.status===expired
      || Dc(e)             // auto-review-approval 且 surface===bot_share
      || jc(e)             // 发给非 agent/cloud-agent 目标的消息（内部路由消息）
      || wxt(e)            // message role=user 且内容匹配 NF()（系统注入的用户提示）
      || Pc(e)             // 连接器/授权类杂项
      || send-message type=user-form 且 id 前缀 phone-call-question:
      || event type===desktop-goal / 特定集合 / team-shared
```

**(c) 同一套谓词在协调器端复刻**。COORD 搜索 ``function Qz(n){return $re(n)||IL(n)||n.kind==="tool-call"``；`IL(n){return n.kind==="message"&&n.suppressed!=null}`（搜索串 `function IL(n)`）。渲染端和代理端对「什么算可见消息」的契约一致：**tool-call 永不显示；suppressed 消息永不显示**。

**(d) 运行中的动态呈现 = 状态行 + 头像状态机**（这就是用户看到的"过程"）：
- 状态行状态机 `Yjn`（搜索串 `function Yjn(`）：mode = `working`（agent 运行）/ `typing`（ composing）/ `none`；活动短语引擎（`ren`/`tZ`，`function ren(`）——新活动至少停留 800ms 才切短语，working 短语 5s 轮换（`Gjn=5e3`）、thinking 短语 2.5s（`Kjn=2500`），显示满 60s 加 elapsed 文案（`sen`），退场 140ms。它渲染成 transcript 最后一行（`kind:'working'`/`kind:'typing'` row，锚点 `isStatusQuiet` 附近 3370xxx 偏移）。
- 活动来源：`currentActivity` 对象（`mO`，搜索 ``function mO(e,t={}){if(e.kind===`thinking`)``）——活动有 `kind:'thinking'` 或 `tool`（工具名 WebSearch/PlacesSearch/…）+ `detail`，映射为动词标签图标；动词→头像状态映射 `v5e`（搜索 `var v5e={thinking:`thinking``）：thinking→thinking、searching→searching、browsing→reading、reading→reading、connecting→orbit、writing→writing、coding→coding、generating→progress、running-commands→running、on-its-computer→computing、on-your-computer→controlling、working→working、messaging/sending→sending、waiting→waiting。
- 头像状态机 `bO`（搜索 `function bO(e,t)`）：流式中→`streaming`；运行中→按 currentActivity 映射；`awaitingUserResponse`→`blocked`；结算后 `finished`/`failed` 保持 8s（`y5e=8e3`）回 `idle`。
- 隐藏的 tool-call 若夹在两条可见消息之间，会作为 `pendingBreakEntry` 挂到下一条可见行上（`NAt` 内 `gAt(t)&&(e.pendingBreakEntry=t)`）——即「它刚才干了活」的痕迹只作为行间元数据，不渲染内容。

**(e) CoT 的唯一可见处 = 「Full conversation」outline 侧板**（题 3 详述）：`LNn`（搜索 `function LNn(`），aria-label `"Full conversation: {title}"`（id `iiUmLA`）。行 kinds：`user / thinking / assistant-text / tool-call / send-message`（`CNn`/`SNn`/`TNn`，搜索 ``case`thinking`:return`thinking-medium``），行首图标 person-circle / thinking-medium / sparkle / wrench（pending=loading 旋转，failed=x-circle）/ send；行预览截首行 80 字符（`z2`/`bNn=80`），chevron 展开 `<pre>` 详情（`kNn`）。该数据来自 `conversationOutline` store（IPC `getConversationOutline` + 推送 `outline` 事件，锚点 ``Rl(`conversation-outline```）。

**(f) `suppressed` 契约**：wire 层 `TranscriptEntry{seq, entry_kind, body}`（PROTO，搜索 `TranscriptEntry|1 seq 4|2 entry_kind 9`），`suppressed` 在 message body 内；生产端在服务端（产物内只有消费端，`local-exec-daemon/messages-worker.cjs` 无 suppressed 逻辑）。「典型运行会抑制哪些中间消息」是服务端策略，**本产物无法证明**——但字段存在 + 渲染端/协调端双端一致隐藏，与用户观察「只有首答和终答」吻合。

### 对我们复刻层（`~/bot/app/ui/renderer-grok/`）的差距清单

| # | 0.79.3 规格 | 我们现状（`shim/src/entries.ts`） |
|---|---|---|
| 1 | thinking 不进主聊天；tool-call 在主聊天无条件隐藏 | 我们产出 `kind:'thinking'` 与 `kind:'tool-call'` entry 并按 0.18 逻辑渲染进流 |
| 2 | 中间模型轮次 = `message.suppressed`（隐藏），首/末条正常 | 我们没有 suppressed 概念，所有轮次都渲染 |
| 3 | 过程呈现 = 底部状态行（短语引擎 800ms/5s/2.5s/60s）+ 头像状态动画（14 动词→状态） | 我们无状态行、无头像状态联动 |
| 4 | 完整过程在 opt-in 的 outline 侧板（user/thinking/assistant-text/tool-call 行，可展开 pre 详情） | 无此面板 |
| 5 | notice 隐藏 "A background task was stopped *"；desktop-goal/team-shared 事件隐藏 | 无对应规则 |

复刻建议（最小集）：聊天流只渲染 message（含 fromAgent/toAgent 归属）+ notice 子集；thinking/tool-call 改喂状态行与 outline 数据源；给 message 加 `suppressed` 透传与隐藏规则。

---

## 题 2：创建 bot 流程——「很多动画」「很多素材可配置」

### 结论

创建入口有三：侧栏 New Bot、new-chat-bar 键入名字就地「Create new Bot」、模板创建（`createAgentFromTemplate`）。核心对话框 = 名字 + 吉祥物实时预览 + 形状(24) + 颜色(11) 选择器（或「Help me create a Bot」交给主 bot 代建）；创建后 bot 自动打招呼（kickstart）。**动画的主体是程序化吉祥物**（53 个状态、眼随指针、帧率可限），onboarding 是一段完整的电影化分镜演出；**素材面** = 24 形状 × 11 颜色 + 上传图/AI 生成头像 + 42 个 bot 模板目录。

### 证据

**(a) 创建对话框**（APP 偏移 ~3093-3097k，class `sand-create-bot-dialog`，`Nw.Root` variant `rich` size `md`）：
- 58px（`Ehn=58`）实时吉祥物预览 `hT{color,shape,sizePx:58}`，随选择即时重绘；
- name input `maxLength:255`，placeholder「Name your Bot」（id `2DQ7aH`），Enter 提交；
- 形状/颜色选择器 `qO{color,shape,limitedShapes,onSelectColor,onSelectShape}`——**选形状时自动换配套色**（`tf(shape)`）；
- ActionBar：Cancel（`dEgA5A`）+ Create（`hYgDIe`）；错误以 `role:alert` 行内显示；
- 可选「Help me create a Bot」卡（`DBVg3J`，副标 `rNm1vd` "Answer a few questions and get a Bot built for what you need"，sparkles+chevron 图标，`onHelpCreate`）。

**(b) createAgent 契约**（APP 搜索 ``await t.createAgent({clientNonce``）：`{clientNonce, name, description, purpose, avatarColor, avatarShape, templateId?, teamBotTeamId?, isBotBuilderRequested?, isKickstartRequested?}`。PROTO `UpdateOrCreateGrokBotAgentRequest` 同构（含 `kickstart_requested`、`introduction_suppressed`、`bot_builder_requested`，搜索 `avatar_shape 9|6 avatar_color`）。创建成功 → `kickstartAwaitingFirstMessage(agentId)` → IPC `kickstartAgent({id})`（temporal harness 专属，box harness 跳过）→ bot 发自我介绍开场；`isIntroductionSuppressed:true` 时跳过（错误文案 `G4TlI/` "Your Bot couldn't introduce itself"）。

**(c) 素材配置面**：
- **形状 24 + 季节 1**（COMMON 搜索 ``var cn=[`blob`,`pebble``）：blob, pebble, bean, egg, squircle, tablet, capsule, cylinder, hex, gem, crystal, wedge, shield, dome, arch, cloud, teardrop, leaf, square, sparkle, clover, flower, heart, house, star；pumpkin 藏在 flag `sand_pumpkin_2026` 后。picker 用受限子集 `fn`(8) 与 `pn`(13)（`Ale(e)` 按 gate 过滤）。
- **颜色 11**（COMMON 搜索 ``var rn=[{id:`black``）：black #000, brown #936439, red #FF263C, orange #FF6700, yellow #FF9800, green #00C972, cyan #00BCA6, blue #1084FE, violet #9159FE, magenta #FF309B, gray #777777；picker 去掉 black（`on=rn.filter(...)`）。
- **未选择时确定性随机**：形状/颜色由 agentId 哈希决定（FNV-1a `xn` + 种子 PRNG `Cn`/`wn`，COMMON），同 id 永远同外观。
- **头像编辑器**（`chunk-agent-avatar-editor-D7wLDXJr.js` + 文案）：上传/拖放/粘贴图片（<25MB）、拖动重定位（"Drag to reposition"）、缩放（Zoom in/out）、导出、Reset；**AI 生成**：「Describe your avatar…」→ Generate → "Generating…"（IPC `media.generateAgentAvatarImage`）；群头像支持成员头像拼合（"Reset to the members' avatars"）。
- **模板目录 42 个**（ONB `var je=[{id:'bug-reproduction',...}]`）：9 个 role——engineering(5)/design(5)/marketing(5)/customer-support(4)/product(5)/ops-finance(5)/recruiting-people(4)/sales(5)/productivity(4)，每个含 id+名+一句话职责（如 `cloud-agent-orchestrator | Cloud Agent Orchestrator | Kicks off cloud agent runs, chases what's stuck, and summarizes`）。

**(d) 动画体系**：
- **吉祥物是程序化实时动画**（非 lottie/序列帧）：`hT`（APP 搜索 `function hT(`）包一层 canvas 组件 `bn{body,appearance,fill,isEmphasized,isFollowingPointer,isPlaying,maxFrameRate,state}`，ref 暴露 `poke('spin')`；DOM `<span class="sand-grok-bot-mark" data-grok-state=... data-paused=...>`，CSS 变量 `--grok-bot-ink/--grok-bot-eye`。
- **状态目录 53 个**（COMMON 搜索 ``var sn=[{label:`Lifecycle``）：Lifecycle 17（idle, listening, thinking, streaming, searching, reading, working, coding, running, computing, controlling, waiting, blocked, finished, failed, sleeping, waking）；Reactions 17（happy…approving）；Morphs 13（orbit, radar, progress, spawning, loading, dictating, sending, receiving, uploading, writing, alerting, bouncing, powering-down）；Product 3（humming, notifying, dragging）；Brand 3（logo, showcase, turntable）。
- **Onboarding 电影化流程**（ONB）：step 机 `landing → meet → computer-demo → jobs → attribution/role/connect/tools → create → handoff`（初始态 `Fe={step:'landing',meetBeat:-1,demoBeat:-1,demoCursor:{x:0,y:30},jobsBeat:-1,handOffBeat:-1,avatarTarget:null,isAvatarLanded:!1,createColor:'blue',createShape:'blob'}`，搜索 ``Fe={step:`landing``）：
  - hero = 黑色 blob 吉祥物；landing 时隐藏在屏上方 `y:-75`；
  - meet：逐 beat 弹入（transition `bounce`），眼随指针 `isGazing`，状态按 beat 走 `waking→…`；
  - computer-demo：头像缩小 .55 **跟随演示光标** `demoCursor` 移动（`x:He.x+e.demoCursor.x-Ue.x*We`），状态 thinking→working；
  - jobs：3 个演示 bot 吉祥物（invoice-chaser 红 / weekly-standup 青 / sales-forecast 蓝，`Ge={...}`）从 `sleeping`（scale .3 opacity 0）逐 beat 弹醒 `excited/happy`，末 beat `celebrate` 放大 1.2 淡出（transition `exit`）；各 bot 有独立 idle 浮动参数 `Ve`（amplitudePx/periodMs/delayMs，如 3px/5200ms/-1200ms）；
  - attribution/role/connect/tools：各 bot 按布局位 `Be` 摆开 idle 浮动；
  - create：用户选的 color/shape 变体从模板位飞落目标位（`avatarTarget`/`isAvatarLanded`），其余模板 bot `sleeping` 退场；
  - handoff：invoice-chaser 变黑色（`recolor:Xe='black'`）交接退场。
- 运行期联动见题 1(d)：activity 动词直接驱动吉祥物状态（`v5e`/`bO`）。

### 复刻差距清单

| # | 0.79.3 | 我们 |
|---|---|---|
| 1 | 创建对话框含实时吉祥物预览 + 24 形状 + 11 色（选形自动配色） | 无形状/色系概念 |
| 2 | 头像可上传（拖/贴/缩放/定位）、AI 文生头像、群头像拼合 | 无 |
| 3 | 创建后 kickstart 自我介绍（可抑制） | 无 |
| 4 | Help me create a Bot（主 bot 代建，isBotBuilderRequested） | 无 |
| 5 | 42 模板目录（9 role 分组，含一句话职责） | 无模板 |
| 6 | 程序化吉祥物 53 状态 + 眼随指针 + poke('spin') | 无 |
| 7 | onboarding 分镜演出（7 step × 4 beat 轴 × 3 演示 bot 编舞） | 无 |

---

## 题 3：subagent / superagent / 跨 bot 呈现

### 结论

**0.79.3 不存在 "superagent" 一词**（全产物 `superagent|superAgent|super-agent` 0 命中）。对应能力拆为三个一等概念：**subagent**（bot 运行中自建的子代理，无用户创建 UI）、**cloud-agent**（云执行体）、**group chat**（多 bot 群聊 = 用户可感知的「跨 bot 交流」主形态）。看 subagent 内部过程的窗口就是题 1 的 outline 侧板（每个 subagent 一个 tab）。

### 证据

**(a) subagent 由 bot 用工具创建**，工具枚举（APP 搜索 `CheckSubagent:`）：`CheckSubagent`、`MessageSubagent`、`StopSubagent`（与 CloudAgent/Computer/Shell 并列的 agent-side 工具）。**UI 无创建入口**。

**(b) subagent 注册表**：`subagents` store（APP ``Rl(`subagents`,{id:`3Icnt6`})``，IPC 面 `subagents:[getSubagents, getAsyncTasks]`），快照 + 推送 `subagents` 事件（`ingestSubagentsEvent`）；读取失败指数退避重读（`subagents-failed-reread`，10s–60s）。

**(c) outline 面板 = subagent 观察窗**（`LNn`）：tab 集 = 主 bot + 每个 subagent，tab 标签 `` `${subagentType}: ${title}` ``（`INn`，无 title 时只显示类型）；subagent 运行中该 tab 轮询加密到 **2s**（`NNn=2e3`）且有 running 状态点（`tabStatusRunning/Done/Error` CSS，`R2.tab*`）。选中 subagent tab 即看它的 user/thinking/assistant-text/tool-call 大纲（含思考，可展开）。入口：会话「...」菜单 `show_full_conversation`（分析事件名即此），**有 flag 门控**（`r?...:null`）。

**(d) 任务卡**（async-tasks store，面板 `showAsyncTasks`）：kind 三种——`subagent`（icon `agent`，文案 "Subagent" id `9heN6q`）、`shell`（icon `terminal-rectangle`）、`cloud-agent`（icon `cloud-arrow-up`，文案 "Cloud agent" id `006KCk`）；detail 行如 "reattached after a host restart"（`6YftFn`）、"from the durable pending-wake ledger"（`YFMpjb`，可拼 subagentType）。任务 working 判定 `cg`（APP 搜索 `function cg(e){if(e.agent?.awaitingSessionIds`）：`agent.workingTaskSessionIds ∋ session` 或 `task.subagentIds ∩ runningSubagentIds` 或 `task.cloudAgentBcIds ∩ workingCloudAgentBcIds`。

**(e) computer-use subagent 实时观看**：`subagentType==='computerUse'`（`_sn`，搜索 ``var gsn=`computerUse```）的 subagent 绑定 ForeverBox（`ensureForeverBox`/`handBackForeverBox`/VNC `vncUrl`）；卡片动作 `openBox/handBack/dismiss`，打开即 computer overlay 实时画面（`isComputerOverlayCurrent` 等锚点 3788k 附近）。

**(f) 跨 bot 消息**：序列化为**带 `fromAgent`/`toAgent` 的普通 `message` entry**（`Ac(e)`，`hAt` 归属键 `agent:${id}:${name}` / `human:${authId}`），在主 transcript 渲染并带作者归属；`jc` 隐藏发给非 agent 目标的内部路由消息。**cloud-agent 的消息在主聊天被分组隐藏**（`cAt(e)=Mc(e)!=null`，配合 `groupsCloudAgentRuns` 与 bcId 集合）。transcript 中的跨 bot 卡可「Open exchange with {name}」（`NqAR3l`）打开 **Bot exchange** 面板（"Bot exchange transcript" / "Bots in this exchange" / "Agents in this exchange"，`openAgentExchange({kind:'cloud-agent',id})`）。

**(g) group chat**：`createGroup`/`setGroupMembers` IPC；new-chat-bar「Create group chat」（`hRyPRc`），限制「Only shared Bots can join group chats」「Bots on your machine can't share a room with a teammate's Bot」。群内 typing 指示为成员头像堆叠（`typingMembers`）。

### 「dsh 也有 subagent 而且看不了」的对照答案

0.79.3 的解法不是把 subagent 塞进聊天流，而是：主聊天只留归属消息；过程（thinking/tool-call）进 outline 侧板按 subagent 分 tab；运行态进任务卡（Subagent/Shell/Cloud agent 三种 icon + working 点）；computer-use 直接给 VNC 实时画面。且 outline 入口藏菜单后、有 flag——「不容易看到」在原版同样存在。

### 复刻差距清单

| # | 0.79.3 | 我们 |
|---|---|---|
| 1 | 跨 bot 消息 = message entry + fromAgent/toAgent + 作者归属；cloud-agent 消息分组隐藏 | 我们用自定义 `report`/`task` entry kind |
| 2 | subagent 无创建 UI（bot 工具自建）；注册表由 getSubagents+推送维护 | 我们无 subagent 概念 |
| 3 | outline 侧板 per-subagent tab（2s 轮询、状态点、思考可展开） | 无 |
| 4 | 任务卡三 kind + working 规则（session/subagent/cloud 三源并集） | 无 |
| 5 | computer-use subagent 的 ForeverBox VNC 观看 | 无 |
| 6 | group chat（多 bot 群聊，仅 shared bots） | 无 |

---

## 局限与未验证项

1. **静态分析**：未运行产物；所有「用户看到什么」的描述由渲染代码路径推出，未截图验证。
2. **服务端策略不可见**：`message.suppressed` 的打标规则、outline 的服务端生成细节、模板选择后的实际创建体，都在服务端/云端，产物内只有契约与消费端。`local-exec-daemon/messages-worker.cjs` 无 suppressed 逻辑（已查）。
3. minified 内联英语言表的正则抽取可能漏个别 id（`<missing>` 项），不影响本文结论。
4. `desktop-mount/panel.html`、`capture-overlay.html`（未压缩源码）未逐行对照；本题三问证据已足。
5. 0.78.1 既有结论（`~/bot/work/` RE 文档）未逐条比对，仅对照了我们 shim 的 `entries.ts` kind 集。
6. 动画为程序化 canvas 渲染的证据是组件 props 与 ref API（`poke('spin')`、`maxFrameRate`、`isFollowingPointer`）；具体绘制管线（WebGL/2D）未深挖。
