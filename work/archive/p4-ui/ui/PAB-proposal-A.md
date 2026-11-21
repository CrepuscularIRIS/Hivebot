# PAB 提案 · 席 A（Opus 5.5）· P-A bot 侧栏 + 建 bot 对话框 / P-B 会话流

2026-11-02 · 输入：`work/p1-re/{RE-ui-shell §3, RE-theme §2-5, evidence/01-boot.png, evidence/theme-tokens.css}`、`work/p4-ui/{BRIEF v1.2, PLAN v2, SPIKE}`、`work/p3-contract/CONTRACT.md §2-4`、dsh 源 `repos/deepseek-harness@ce7073d`（只读核对插槽与 CSS 变量）。字段只用 CONTRACT §3.1 的 Bot 和 dsh `SessionStatus{running,pendingInteraction,completionUnread}`（`ui-session/src/client/index.ts:60-67`），不新增后端字段。

## 0. 立场（三条主张，frontend-dev 取舍时请先看这里）
1. **审批卡放在会话流里，挂在 tool-call 行下面，不让它接管 composer。** dsh 默认把 ApprovalPanel 注入 `conversation.composer`（priority 1）接管输入框（`ui-approval/src/client/index.ts:97-106`）。D3 要求卡片「挂在对应 callId 的行下」，原版的 local-tool-permission 也是 transcript 卡片。做法：同一张 `conversation.approval.card` factory 改由 tool-call 行渲染；composer 位置只留 36px 提示条；作答仍然只走 `PendingApproval.answer`，入口只有一个。
2. **换肤只靠 theme 插件，用 CSS 变量加 dsh 的稳定 data 属性选择器，不 fork 组件。** dsh 给了 `[data-message-bubble]`（UserContent.tsx:47）、`[data-chat-flow-kind=…]`（ChatNodeSeat.tsx:161）、`[data-streaming]`、`[data-slot=…]`，Grok 的气泡、行和卡片外观都能在这一层做出来。
3. **侧栏顺序在会话期间冻结。** 三个 bot 同时流式时按 updatedAt 重排，列表会跳，D2 的切换操作会点错。

## 1. 共享壳（两页共用）
```
┌─ 38px titlebar（drag）───────────┬──────────────────────────────────────────────────┐
│ [◐]                     [⇤]      │ bot A · p2-alpha · fs, search    [模型▾]   ─ □ ✕ │ ← WCO 原生控件
├─ sidebar 280 (--sand-bg-sidebar) ┼─ pane (--sand-bg-pane)，chat 列 min 424 ─────────┤
```
- **网格**：`280px minmax(0,1fr)`，没有 infoPane 列。折叠后变成 `0 minmax(0,1fr)`，过渡用 `.2s cubic-bezier(.22,1,.36,1)`，与原版 `.sand-1r800kn` 一致。不做 240–400 的拖拽调宽（YAGNI）。
- **窗口控件**：截图右上角是三颗细线按钮。建议用 `titleBarStyle:'hidden'` 加 `titleBarOverlay:{height:38,color:bg-chrome,symbolColor:text-secondary}`（Linux 也支持 WCO），**不新增 IPC**，preload 仍然只有三个窄函数。这需要改 `main/window.ts`，按 PLAN §2 走 `U-00.fN`；颜色在 main 侧跟随 `nativeTheme`，用 `setTitleBarOverlay` 更新。
- **ChatHeader 并进 titlebar 内容列**：bot 名用 14/20 medium；preset 和连接器以只读的 tertiary 12px 文本显示（D11）；模型 chip 是 ui-model-selection 的 seat。可点控件都要设 `-webkit-app-region:no-drag`。
- **启动封面 = 01-boot.png 的复刻**，覆盖 dsh 未就绪、U-14 的 ensure 未 settle 这段时间（最长约 30 s × recipe 数）。居中放 logo、`Grok Bot` wordmark 和原版英文副标题；原来 `Sign in →` 的位置换成 `正在启动本地引擎…`。60 s 后还没就绪，换成 `引擎没有响应  重试 →`，样式与 Sign in 相同。去掉 Terms（D12②）。冷启动是用户最容易卡住的一步，dev-min 现在在这里是白屏轮询。

## 2. P-A bot 侧栏 + 最小建 bot 对话框
```
│ ＋  新建 Bot            Ctrl+N │ ← menu-row 32px，行圆角 10，行距 6
│ ▦  市场                        │ ← 进 P-C；未就绪时 disabled，tooltip「即将开放」
│ (◉) 主 Bot             ★       │ ← 永远第一（上方有 border-quaternary 分隔），corner-main，没有删除入口
│ (A) 研究助手            ◌      │ ← 48px：头像 28 + gap 10；标题 14/20 medium；
│     p2-alpha · 回复中          │    副行 12/16 tertiary，标题与副行间距 1px（--sand-agent-item-*）
│ (B) bot B              ●黄     │ ← 等待审批          (C) … ●蓝 = 未读完成
│ (D) 旧连接器 bot       ⚠       │ ← readOnly：标题降为 tertiary，副行 danger「连接器已失效」
```
**对照原版 AgentsSidebar（RE-ui-shell §3.1）**："New chat" 改为「新建 Bot」，"Marketplace" 入口保留；Search、palette、section、多选、拖拽、pin 都去掉（B §2）；账号 footer 整块删除（D12②）。角标沿用原版 `corner-{ring,dot,main}` 的语义：**ring** 表示 `running`，头像外加一道 2px accent 弧线，1s 线性旋转，reduced-motion 下改为静止整环；**dot 黄** 表示 `pendingInteraction` 是审批，8px `--sand-bg-warn-primary`，带 2px 侧栏底色描边。D3 规定审批卡只进本 bot 的流，所以在其他 bot 上时，**发现审批只能靠这个黄点**。**dot 蓝** 表示 `completionUnread`，打开该 bot 后清除。**main** 是右下角 10px 星形（以待查 1④ 的 SVG 表为准）。
**头像**：没有头像数据，用单字母 monogram。底色按 `hash(sessionId)%9` 从 `--sand-fill-{red…brown}-bubble-user` 九色族里取（原版 botTint 色族，theme-tokens.css:283-300），字用 `#fff` 13px semibold。只给头像着色，用户气泡不跟随（botTint 的触发逻辑未逆向，RE-theme §6）。
**副行**按优先级取：`等待批准`(warn) > `回复中`(secondary) > `连接器已失效`(danger) > `preset · N 个连接器`(tertiary)。title 投影为空时，标题用 preset 名，绝不显示 sessionId。
**排序**：首次加载时按 #9 的 updatedAt 降序定序，主 bot 置顶；之后会话期间不重排。新建的 bot 插在主 bot 下第一位，背景 accent-secondary 闪 600ms 后淡出。
| 态 | 呈现 |
|---|---|
| 加载（#9+#19 未回） | 3 条骨架行（28px 圆，加 60%/40% 两条 bar，`bg-secondary`），不用 spinner 或 shimmer |
| 空（mainBotId 为空或已失效） | 不显示空态：按 U-21① 自动调 #3 再调 #20，期间主 bot 位置显示骨架行，副行写「正在创建主 Bot」 |
| 失败（列表读取） | 列表区一行 danger 12px：`无法加载 bot 列表`，加文字按钮 `重试`；侧栏其余部分照常 |
| 只读降级 / 断线 | 只读：见线框，点击照常打开，会话页由 P-D 横幅接手（U-23）。断线：角标保持最后已知值，不清空 |

**交互**：hover 用 `bg-hover`（6%），选中用 `bg-active`（8%），item 圆角 12，背景过渡 100ms（`--cursor-duration-fast`）。键盘：列表是 `role=listbox`，↑↓ 移动、Enter 打开；`Ctrl+N` 新建；`Alt+↑/↓` 在任意位置切到上一个或下一个 bot；`Ctrl+B` 折叠侧栏。切换 bot 时 pane 瞬时替换，不做过场：动画只会制造 D2 要排除的中间态。
**建 bot 对话框**（modal 宽 440，`--sand-menu-radius` 16，`bg-elevated` 加 `--sand-shadow-modal`，dark 下只用 ring，scrim 用 `--sand-bg-scrim`）：
```
  新建 Bot                                                      ✕
  基础配置  ● 标准（默认）   ○ p2-alpha  描述取自 #1（如有）     ← radio 行 32px，不用下拉：便于比较
  模型      [ 跟随配置默认 ▾ ]                                  ← #2；创建后有选择才调 #5
  🔒 配置随 bot 固定，换配置需新建。模型以后可在对话里改。      ← D11 原文，12px tertiary
                                              [取消]  [创建 →]
```
首次聚焦落在默认 preset 行；Esc 关闭，Enter 提交，焦点困在对话框内；任何列表都不出现权限 preset 或 never 类（D9）。创建中按钮显示 `创建中…` 并 disabled，对话框不关；失败时按钮上方显示 danger `创建失败：<error.message>`，已选内容保留；成功后关闭、选中新 bot、焦点给 composer。进出动画为 opacity 加 scale .98→1，150ms，`--ease-sharp`；reduced-motion 下只做 opacity。

## 3. P-B 会话流
```
│      ┌ agent 气泡 fill-bubble-agent，圆角 18，padding 7/12 ┐
│      ⚙ Bash  ls -la ./out                         ← tool-call 行 13/18 tertiary
│      ┌ 审批卡 min(80%,560px,100%-82px)，圆角 14 ───────┐
│      │ ● 等待你的批准                    (strip 12px)   │
│      │ 想要运行 Bash                     (14 medium)    │
│      │ ┌ rm -rf ./out   XVF Mono 13 ─────────────────┐ │ ← ApprovalCommand（ui-chat 已有）
│      │                         [拒绝]  [批准一次]     │ ← 不传 onAlways，没有「始终允许」
│      ✕ Bash  已拒绝 · 刚刚                        ← 决议后卡片收成一行（approval/decided 审计态）
│                               ┌ 用户气泡（反转色）右对齐，对侧缩进 max(32px,…) ┐
│  ┌ composer：bg-elevated，圆角 18，border-secondary ─────────────── (↑)/(■ 停止→#10) ┐
```
**对照原版 ConversationWorkspace（RE §3.2）**：只保留 Transcript 和 Composer；ChatHeader 并进 titlebar；info-pane、语音、33 型卡、12 型 event 卡都不做。chat 列宽 `--dsh-chat-content-width: 708px`（原版 stylex 档位）；气泡上限 `--conversation-bubble-max-width`；对侧缩进用原版公式 `clamp(0px,(100% - 480px)*.4,20%)`。
- **气泡**：用户气泡由 dsh 的 `[data-message-bubble]` 承载。**坑**：dsh 用户气泡的文字色是 `--dsw-alias-label-primary`（UserMessageBubble.module.css:8），按 RE §5 把 bubble 映射成 light `#1c1c1c` 后就成了黑底黑字。theme 里必须加 `[data-message-bubble]{--dsw-alias-label-primary:#fcfcfc;--dsw-alias-link:#9ccaff}`，dark 不用覆盖。agent 回复在 dsh 里是无气泡的 prose，原版则有 `--sand-fill-bubble-agent`（6%/4%）和单行 36px、圆角 18 的气泡几何，所以要用 `[data-chat-flow-kind="<assistant kind>"]` 给正文容器加底色和 padding。正文 14/22，块间距沿用 `--dsh-chat-flow-gap`。
- **tool-call 行**：按原版 `Bfn` 映射图标：pending 用 `loading`（1s 旋转），failed 用 `x-circle`（danger），其他用 `wrench`。工具名转 Title Case，后跟单行摘要，超长省略。点击展开 dsh ToolCallTree，高度过渡 200ms `--ease-sharp`。dsh 会在回合结束后把过程折叠成 turn-process（`data-turn-process-hidden`）。我倾向 MVP 不折叠、每个 call 常驻一行：原版如此，D3/D6 的证据也要求这些行在。如果关闭折叠必须改组件，就接受折叠，但运行中和审批挂起期间行必须是展开的。
- **运行指示**：dsh 的 `RunningWhaleTail` 是 DeepSeek 鲸尾（品牌），必须换掉。首块到来前，agent 侧显示 36px 单行气泡，里面三个点按 1.2s 呼吸，首块到来后被正文原地替换。逐 chunk 不加淡入，文字直接增长（D1 要求能看到 ≥3 步增长，动画会把步骤糊掉）。
- **审批卡实现（主张 1）**：tool-call 行渲染时读本 session 的 `SessionStatus.pendingInteraction`，若是 `PendingApproval` 且 callId 相同，就在行下调用 `renderFactorySlot('conversation.approval.card', …)`，props 照抄 `ApprovalPanel.tsx:12-19`（只有 onAllow 和 onReject）。另注册一个 priority>1 的 `conversation.composer`：遇到 PendingApproval 时渲染提示条 `● 研究助手在等待你的批准  查看 ↑`，点击后滚动到卡片并聚焦。**callId 缺省时退回 dsh 原行为**（卡片显示在 composer 位置），不会丢卡。卡片外观：`bg-elevated`，1px `border-secondary-translucent`，圆角 14（`--conversation-surface-border-radius`）；light 用 inline 阴影，dark 只用 ring；出现时 opacity 加 translateY 4px，200ms。
- **键盘**：Enter 发送，Shift+Enter 换行，IME 组字期间不发送（dsh 已处理）。焦点在审批卡内时 Enter 批准、Esc 拒绝（dsh 内置，`ApprovalCard.tsx:39-51`）。卡片出现时，若 composer 为空且不在焦点，自动聚焦卡片 body；用户正在打字时不抢焦点，只显示提示条。Esc **不**绑定打断（会和拒绝冲突），打断只用停止按钮。

| 态 | 呈现 |
|---|---|
| 空（新 bot） | 列中央放 48px 头像、bot 名（17/24）、tertiary 一行 `preset · 连接器`，再写 `发送第一条消息开始`；不放示例 prompt |
| 加载 / 更早历史 | follow 快照未回：两个骨架气泡（左 60%、右 40%）。滚到顶部时按 #11 hasMore 自动取更早记录，顶部显示 12px `加载更早的消息…`，滚动锚点靠 dsh 的 `data-chat-paging-anchor` |
| 流式 | 见运行指示。离底部 80px 内自动跟随；否则在 composer 上方显示 `↓ 新消息` 胶囊（elevated，圆角 full） |
| 审批挂起 | 卡片挂在行下，composer 位置显示提示条，侧栏黄点。重载或重连后由 $events 补发重新出现（D4①②），requestKey 变了就重挂，不加特殊动画 |
| 决议后 | 卡片 200ms 收起成一行：`✓ 已批准一次`（success）或 `✕ 已拒绝`（danger）。main 超时代答也只显示 `已拒绝`：重载后无法区分是谁拒的，不编造原因 |
| 失败 | 工具失败：行图标换成 x-circle（danger）。回合失败：居中 danger 13px notice `回复失败：<message>`，不做重试按钮（契约里没有重发语义） |
| 打断 / 断线 | 打断：半截正文保留定稿，下面显示 tertiary `已停止`。断线：titlebar 下方 28px `--sand-bg-warn-secondary` 条 `与本地引擎的连接中断，正在重连…`，重连后淡出；composer 保持可用（M1 不走 M2 socket） |
| 只读降级 | composer 换成 P-D 横幅（U-23 定稿），本页只预留位置 |

## 4. token 映射要点（只列对 RE-theme §5 表的增补和更正）
| 目标 | 值 | 理由 |
|---|---|---|
| `--dsh-font-family-text` / `-code` | `--sand-font-sans-xvf` / `--sand-font-mono-xvf`，加本地 `@font-face`（X-VF、XMono-VF woff2） | D12③ 断言 XVF |
| `[data-message-bubble]` 内的 `--dsw-alias-label-primary` | light `#fcfcfc` | **更正**：否则黑底黑字（§3） |
| `--dsw-alias-button-primary-fill` / `-hover` | light `#1c1c1c`/`#333`，dark `#f5f5f5`/`#e0e0e0`，文字反转 | 原版是单色系统，截图里没有蓝色主按钮；蓝色只留给链接、焦点和运行环。我不同意 RE 表把 primary 映射成 accent 蓝 |
| `--dsw-focus-ring-color` | `--sand-border-focus-primary`（`#1e86fc`/`#1884fc`） | RE 表漏了这一项 |
| `--dsw-alias-state-business-primary`（dsh 用了 13 处） | `--sand-text-accent-primary` | 不映射就会残留 DeepSeek 蓝 |
| `--dsw-radius-xl`、composer 圆角 | 18px | 原版气泡圆角 18（ARn）；composer 与气泡用同一几何 |
| `--dsh-chat-content-width` | 708px | §3 |
| dark 阴影 | 所有 elevation 只用 1px ring（`--dsw-elevation-stroke-color` 设为 border-secondary-translucent），ambient 为 0 | RE §7-4：观感关键 |

## 5. 与原版的已知差异
| 差异 | 理由 |
|---|---|
| UI 文案用中文；wordmark 和封面副标题保留英文 | 用户私用、母语中文，dsh 组件自带 zh 词典；品牌元素保持原样 |
| 没有搜索、section、pin、拖拽、调宽、账号 footer、info-pane | B §2 范围、D12②、YAGNI；侧栏宽度取原版默认 280 |
| 头像用 monogram 加色族底色 | 没有头像数据，avatar-editor 不在 MVP |
| 回合失败不提供重试；打断只能用按钮 | 契约没有重发语义；Esc 留给审批拒绝 |
| 待查 1④ 的 SVG 表交付前，用 dsh primitives 的同义图标 | 不阻塞；表到了按 id 替换 |
| 角标和气泡几何来自静态逆向 | RE L3：登录墙后没有运行态截图，只能做到 token 和组件树级对齐 |

## 6. 反提案：不要复用 dsh 的「审批接管 composer」
大家默认会照搬它，因为零代码，dsh 自己也论证过流内占位会重复（`ChatView.tsx:264`）。不该照搬的理由：① D3 字面要求卡片挂在 callId 行下，verifier 在行下找不到卡就判 FAIL；② 原版的审批是 transcript 卡片（local-tool-permission，RE §3.2）；③ 一个回合里连调多个工具时，用户要在上下文里看到「批的是哪一行」，放在底部的卡把命令和它在流里的位置拆开了。代价是一个 tool 行装饰加一个 composer 提示条注册，估计不到 60 行，作答路径仍只有 dsh 一条。

## 7. 可复用 / 待核实
- `deepseek-ai/deepseek-harness@ce7073d`（MIT）：`packages/client/ui-approval/src/client/ApprovalCard.tsx`（含键盘、防重复和失败恢复）、`ui-chat/src/client/chat/ApprovalCommand.tsx`、`ui-tool/src/client/tool/ToolCallTree.tsx`、`ui-primitives`（Button、StateDot、对话框原语）、`ui-model-selection`（composer 模型 chip）。原版资产（私用可复用，RE L6）：X-VF / XMono-VF woff2、cursor-icons 字形、logo 和 wordmark。
- 交 frontend-dev 核实（不阻塞定稿）：① assistant 正文的 `data-chat-flow-kind` 字面值（`register-node-renderers.ts`）；② turn-process 折叠能否用配置关掉；③ `session/modelCatalog` 是否必须带 sessionId，若必须，对话框里的模型项改为「创建后在 composer 里选」；④ ui-agent-preset 的 session chip 必须只读或不挂载（D11）。
