# RE-UI-FACES-0.78.1 · 下批 RE 四面：侧栏 / 输入面 / Bot 设置 / 消息操作

日期：2026-11-14。任务：覆盖度地图「下一批 RE」剩余四面（B1 侧栏、A8 输入面、C4 Bot 设置、A5 消息操作），逐面差距表 + 施工建议。只读静态分析，未执行产物。

## 0. 方法与新锚点

- 产物：`/tmp/t78-asar/`（0.78.1，与既有报告同源）。
- **新发现（本批最重要的方法学锚点）**：`index.eager-app-iGTgHP_Q.js`（下称 APP）**自带一张内嵌 i18n 表**（约 byte 16k–60k，格式 `"哈希":["en 串",…]`，ICU 数组），共 **2244 条**，与 `index.eager-common` 的 2307 条核心表（t78-i18n-en-flat.json）**互不重叠**。侧栏菜单/消息操作/composer 的文案几乎全在这张表里。已导出：`harness/t78/t78-eager-app-i18n.json`（下称 APP 表；核心表下称 CORE 表）。此前报告只用了 CORE 表——这就是为什么侧栏菜单串一直「找不到」。
- 定位法（可复查）：APP 表条目 `"id":["…"]` 与消费点 `{id:\`…\`}` 各出现一次；`grep -bo '<符号>' index.eager-app-iGTgHP_Q.js` 拿字节偏移后 `dd` 切片。关键区：侧栏 UI ≈ byte 1.05M–1.33M、侧栏状态引擎 ≈ 4.28M–4.31M、消息操作/emoji ≈ 2.49M–2.53M、tray ≈ 3.74M–3.76M、composer 工具条 ≈ 2.80M–2.86M、Details 面板 ≈ 1.42M–1.47M、创建/发布对话框 ≈ 1.08M–1.13M。
- 我们的树：`app/ui/renderer-grok/`（overrides + frontend/src/recovered 0.18 重建 + `frontend/src/production/ProductionRenderer.tsx` 接线）。
- i18n 键格式：下表「APP `qVkGWK`」= APP 表键；「CORE `a63vL0`」= 核心表键。均可 `grep -o '"qVkGWK":\[[^]]*\]'` 或查两张 JSON 复查。

---

## 1. B1 侧栏（分区 / 置顶 / 未读）

### 1.1 数据模型与同步（0.78.1 行为规格）

- **分区模型**（APP byte≈224657 `Cu=class`）：`{id, name, agentIds:[]}` 有序列表；合成区 `__agents__`（默认区，恒在最后）；一个 bot **至多属于一个区**（`assignAgents` 先从全部区移除再加入目标区）；`normalize` 去重 id/清空 agentIds、`carryFolds` 折叠态跨重载保留（`isCollapsed` 不入库，localStorage 式另存）。
- **持久化**（APP byte≈4289–4.30M `E1n`）：`getHostSidebarSections({accountSlot})` 读 / `setHostSidebarSections({sections, base, accountSlot})` 写，**带 base 版本的 CRDT**：warm 阶段本地编辑挂 `held` 队列、写冲突（`consecutiveConflicts`）达上限回滚重读、`__agents__` 视图投影。诊断回调 `onSidebarSectionsDiagnostic`。**per-account slot**（多账号各自一套分区）。
- **置顶**：`getHostPinnedAgents/getServerPinnedAgents/setHostPinnedAgents({pinnedAgentIds})`（同一 `mKe` store）；另有 `listLibraryPins/setLibraryPin/mergeLibraryPins({agentId,pin,isPinned})`（每 bot 库内 pin，非侧栏）。
- **未读**：查看即清——RPC `setViewingAgent({agentId, taskId, viewedAtMs})`（preload 方法表，APP byte≈575996 附近）；手动 Mark as Read/Unread 走行菜单；View 菜单「Unread filter」勾选态与 renderer 镜像（`setUnreadFilterMenuChecked({isChecked})`，APP byte≈576213 后方法表）。
- **自动命名**：新区名 `New section`/`New section 2`…（CORE `a63vL0`，值带 `{number}`，APP byte≈1170600 `d4e` 去重函数）。

### 1.2 行菜单 / 分区菜单全集（APP byte 1.18M–1.22M 实测）

行右键/`⋯` 菜单（analytics `entrypoint:'context_menu'`，动作名全表）：

| 项 | 文案（键） | 动作名 | 备注 |
|---|---|---|---|
| Pin/Unpin | `Pin`(APP `qVkGWK`)/`Unpin`(APP `nWMRxa`) | `pin`/`unpin` | 0.18 同 |
| Rename | `Rename`(APP `2wxgft`)，双击行同 | `rename` | 0.18 同 |
| Delete | `Delete`(APP `cnGeoo`) | `delete` | 走确认流 |
| Mark as Read/Unread | APP `tItpYj`/`RQeLV2` | `mark_read`/`mark_unread` | 0.18 有 seam |
| Move to section | APP `GYkPNu`（子菜单列各分区） | `move_to_section` | |
| Create section | APP `XCRrpy` | `move_to_new_section` | 创建并移入 |
| Full conversation | APP `bSTUoz` | `show_full_conversation` | outline 侧板 |
| Async tasks | APP `6T0tbB` | `show_async_tasks` | |
| Copy conversation ID | CORE `la8mWk` | `copy_conversation_id` | |
| Copy link | APP `y1eoq1` | `copy_link` | 复制 bot 分享链 |
| Remove/Show in sidebar | CORE `9VZ6f0` / APP `rf+5cn` | `hide_from_sidebar`/`unhide_from_sidebar` | 隐藏≠删除 |
| Replace with different Bot | APP `EmmHd+` | `replace_main_agent` | primary Bot 换绑（错误串 APP `RhQRR3`/`amFmKN`） |
| Mount/Unmount from Desktop | APP `kYXD41`/`iN6NVv` | — | desktop-mount 窗口（feature 域 H4） |

**0.78.1 无 Duplicate、无 Open profile 行菜单项**（analytics 全表 14 动作无此二者；APP 表无 `Duplicate`/`Profile` 串）——0.18 的 `onDuplicateAgent/onOpenProfile` seam 在 0.78.1 已退场。

分区头菜单（`Section actions` APP `8gtQoG`）：Rename section（APP `wcgxIB`）/ Move up（`QyioBP`）/ Move down（`3Ib6FN`）/ Delete（`cnGeoo`）。空区文案 `Drag Bots here`（APP `+/x6DF`；0.18 是 "Drag chats here"，**措辞已改**）。分区错误态 `This section hit an unexpected error.`（CORE `lXHsrk`）。

### 1.3 置顶区 / 未读 / 线程行呈现

- **置顶区**：顶部 `Pinned Bots` 组（APP `vPVg0Q`）+ 空 drop zone `Drag here to pin`（`0UW++c`）/`Pin drop zone`（`EDqnIQ`）；tile 网格（`sand-pinned-grid__tile-drop`），拖动 glide 动画（framer-motion，scale 0.85）；行宽上限用 CSS 变量 `--sand-pin-row-cap`（`e*99-4px`，按 tile 数算宽，非固定个数）；托盘取前 5（RE-KEYBINDINGS §4.2）。
- **未读呈现**：行角标 dot（`sand-agent-item__corner-dot/-ring`，样式区 byte≈706415）+ `Unread activity`（CORE `IoGjXZ`）/`Needs attention`（CORE `fAUSZy`）aria；hover 卡（`sand-agent-hover-card`，byte≈1225799）显示 `Waiting for you: {reason}`（APP `fZI5Tx`）、`Draft:`（`dFX5dn`）、最后消息预览 `{0} chat preview`（`ZzZyTW`）、`No messages yet`（`+52YnJ`）、You/Teammate 归属。
- **任务线程行**：区内嵌 `data-agent-thread-row` 按钮（byte≈1294129），aria `Open task {name}`（APP `/2GgU4`/`wnXRn7`）、X = `Unpin {name}`（`RoCpWx`）；线程未读同样 dot。置顶线程区 `data-pinned-thread-section`，头 `Threads`（APP `rcAfoR`）。
- **行徽章**：`shortcut-badge`（⌘1–9 提示，byte≈1245206）、`dev-badge`、`title-badge`（bot label）、`draft-label`、`voice-call-chip`（`Voice chat in progress` APP `Eh6fai` + 时长）。
- **头部/底栏**：`New Bot`/`Create a Bot`（`2hjDEV`/`rbO+df`）、`Browse shared Bots`（`wV9Rp/`）、`Search Bots`+`No matching Bots`（`YjO4Og`/`12i8o8`）、`Collapse sidebar`（`mkMLq4`）；底栏账号菜单 `Open account menu`（`6h5QdE`，更新可用变体 `8xGP9s`）+ 账号名编辑（`sand-agents-sidebar__account-name-input`）。
- **多选**：header 换 `selection-actions` 条（`sand-agents-sidebar__move-selected/__delete-selected/__clear-selection`），`Clear selection`（APP `FBIuPX`）；cmd/shift 点选、批量移动/删除（0.18 recovered 同构）。
- **共享 bot 区**：`Bots people have shared with you. Add one to keep it in your sidebar.`（CORE `67k+2V`，org 变体 `9nliFO`）。

### 1.4 B1 差距表

| 项 | 0.78.1 锚点 | 我们现状 | 差距 |
|---|---|---|---|
| 分区模型/折叠/改名/删除/上下移 | `Cu` @APP 224657；APP 表 5 键 | recovered 全有 + ProductionRenderer 已接线（rename/delete/move/section collapsed） | 文案差异（Rename section/Drag Bots here）P2 |
| 分区持久化 CRDT+多账号 slot | `E1n` @APP 4.29M | shim 本地推导（workers 合成区，LOCKED 不可编辑） | 单机无冲突场景够用 P2 |
| 置顶开关/拖拽排序/空 drop zone | APP `qVkGWK` 等；`--sand-pin-row-cap` | 已有（pinnedAgentIds + reorder） | drop zone 文案/动画 P2 |
| Mark as Read/Unread | APP `tItpYj`/`RQeLV2` | 有（onSetAgentUnread→shim） | — |
| 查看即清未读（setViewingAgent） | preload 方法表 | shim 未读追踪在 renderer（markers.ts unread tracker） | 语义等价 P2 |
| Unread activity/Needs attention 角标 | CORE `IoGjXZ`/`fAUSZy` | 0.18 `SidebarAgentStatusCorner` 有 | — |
| hover 卡（Draft/Waiting/预览） | APP `fZI5Tx`/`ZzZyTW` @1.22M | 0.18 `AgentPreviewCompositor` 有（isPreviewEnabled） | — |
| Copy link（bot 分享链） | APP `y1eoq1`，动作 `copy_link` | 无 | P1（依赖 C5 分享链） |
| Hide/Show in sidebar | CORE `9VZ6f0`/APP `rf+5cn` | 有 hide（onHideAgent）；无「再显示」入口 | P1（Show in sidebar 缺恢复入口） |
| Replace with different Bot（primary） | APP `EmmHd+`+确认流 `EE2rtW`/`dEgA5A`/`7VpPHA` | 无（我们的 Main bot 是 pbots 自有语义） | P2（概念映射到 setMain） |
| Mount/Unmount from Desktop | APP `kYXD41`/`iN6NVv` | 无（无 desktop-mount 域） | 不做（平台域） |
| 任务线程行（Threads 区/Open task/Unpin） | APP `/2GgU4`/`RoCpWx`/`rcAfoR` | 无（worker 区是我们自己的合成区） | P2 |
| 行 shortcut-badge ⌘N | APP @1245206 | 无 | P2 |
| voice-call chip | APP `Eh6fai` | 无 | 不做（H1 域） |
| 多选批量移动/删除 | selection-actions @APP 1.199M | recovered 有 seam，**ProductionRenderer 未接线**（0 处） | P1（接线即可用） |
| Duplicate/Open profile | **0.78.1 已删除** | override 主动置 undefined | 对齐原版=现状 ✓ |
| 账号名编辑底栏 | `account-name-input` @1.056M | 无（无多账号） | 不做 |
| Browse shared Bots 头部入口 | APP `wV9Rp/` | 市场入口在别处 | P2 |

**施工建议**：接线多选（recovered seam 已全）+ 补 Hide 的恢复入口（Show in sidebar，隐藏 bot 列表可从 new-chat-bar 复用）为 P1；文案对齐（Rename section/Drag Bots here/dot 串）随下次侧栏工单顺手改；其余 P2/不做。

---

## 2. A8 输入面

### 2.1 编辑器本质与扩展全集（chunk-prompt-editor-DpaS0rI9.js，82KB）

TipTap/ProseMirror。扩展名实测（`name:\`…\`` 全表）：`mention`、`command`、`todoReference`、`sandEmojiSuggestion`、`sandPlainTextPasteAfterRules`、`sandListAfterLineBreak`、`sandScrollCaretIntoView`、`sandDocumentToken`、`sandMacEmacsLineMotion`、`sandComposerDirection`、`dictationProvisional`、`sandAriaPlaceholder`、`sandQuoteEditing`、`cube`、`clock`。

引用节点（span data-type）：`mention`、`quote-reference`、`canvas-reference`、`canvas-selection`、`pr-reference`、`review-item-reference`、`skill-reference`、`workflow-reference`、`todo-reference`。

**触发字符**（实测）：`@` mention（allowSpaces:true，@APP-chunk byte≈36951）、`:` emoji 行内建议（`recordRecent` 记最近，byte≈46471）、`/` 命令菜单（byte≈74521）。

### 2.2 @ 提及菜单（autocomplete）

- 实体类型：**Bot**（`ixkTse`）、**Skill**（`OZJeTZ`，`Reference a skill` `gtdpBF`）、**Plugin**（`fOuPPd`，带连接状态 chip：`connected`/`needs auth`/`needs your approval`/`error`/`connecting`/`disconnected`/`disabled`，APP `hYTBlk`/`8nZIsU`/`KVyQVW`/`cs+QV+`/`PHjHa8`/`ALFe2s`/`Og2SKn`）、**Routine**（`aAnCaW`）、**Group**（`L8fEEm`）、**Person**（`OZdaTZ`）、**Emoji**（`tKlWWY`）、**Action**（`bwRvnp`）。
- 空态 `Nothing to mention yet`（`vI1YCx`）/`Nothing to reference yet`（`1E6CXB`）；无匹配 `No matches for "…"`（`NQSKOV`）；`Press Esc to close`（`iiP6uW`）。
- 键盘：Enter/Tab 接受、ArrowUp/Down 移动、Escape 关闭（chunk 内 key 全表）。
- 命令项图标：action=command 图标、工具=renderToolIcon、skill trigger=clock、默认 cube（chunk byte≈5958）。
- DOM：`sand-mention-listbox`/`sand-mention-menu-item`/`sand-mention-empty`/`sand-skill-listbox`/`sand-skill-option`。

### 2.3 emoji 体系（三层）

1. **行内 `:` 建议**（prompt-editor chunk）：打 `:smile:` 式补全，记录最近。
2. **emoji picker 弹层**（APP byte≈2.49M）：`Search emoji`（`EarrCe`）、`Choose an emoji`（`hfdJWr`）、空 `No emoji found`（`quWMra`）、载入 `Loading emoji…`（`wYwIBL`）、`Results`（`kx0s+n`）；**Quick reactions 行 + More emoji**（`TffoiF`/`gVI+Vx`）；**emoji 可右键 pin/unpin**（`Right-click to pin` `vwyvFw`/`unpin` `hv+HTQ`，`Pinned {name}` `F57QaY`/`Unpinned` `6Nn/K1`）。数据 = `chunk-emojibase-BVpGez-n.js`（170KB）+ 36 语言 `chunk-emoji-messages.*`。
3. **消息 Add reaction**（见 §4 A5）复用同一 picker。

### 2.4 粘贴 / 拖放 / 附件

- **粘贴文件**（APP byte≈2837078）：clipboard 有文件（`h1(clipboardData)`）→ preventDefault → 全部走附件 staging（A7 十件套）；纯文本带 html → `pasteHTML`，否则 `pasteText`；`gK(text)` 命中特殊文本（链接/引用式）→ 转 reference。**窗口级粘贴**（焦点不在输入区，byte≈2853934）：文件照样进附件。
- **无格式粘贴**：`Cmd+Shift+V`（RE-KEYBINDINGS §3）+ `sandPlainTextPasteAfterRules` 扩展（clipboard 无 text/html 时强制纯文本路径，priority 1）。
- 附件条：`Attachments`（`w/Sphq`）、`Remove {…}`（`HLazKQ`）、`Attach file(s)`（`x9ecE4`/`N7m8E+`）、`Drop to attach`/`Drop files to add to chat`（CORE `abHE7q`/`nmT7ws`）、`Changed since attached`（`e+Z9H6`）。

### 2.5 工具条与状态（APP byte 2.80M–2.86M）

| 控件 | 文案（APP 键） |
|---|---|
| 发送 | `Send message`（`pi1oME`） |
| 附件 | `Attach file`/`Attach files`（`x9ecE4`/`N7m8E+`） |
| 听写 | `Start voice input`（`47NkIo`）；`Click or hold {key} to dictate`（`JxtjNA`）；状态机 `Listening…`/`Transcribing…`/`Recording voice memo`/`Transcribing voice input…`/`Stop dictation`（`ZVCRHy`/`e5xZRK`/`+rJuax`/`nvOFfg`/`9QwrMz`，@1.94M–1.96M） |
| 语音通话 | `Start voice chat`（`ejM5Ai`） |
| 语音留言 | `Record a voice memo`/`Discard recording`/`Send voice memo`（`3yD7nZ`/`joVvhG`/`gGYTub`） |
| Teach | `Teach a task`（`yrMloC`） |
| 溢出 | `Composer actions`（`scgxhp`） |
| 回复态 | `Cancel reply`（`AnRu/j`）+ `Jump to replied message`（`i/GPhL`）+ quote-reference 节点 + `sandQuoteEditing` |
| 占位符 | 默认 `Ask anything, or drop a file`（`HOCPPm`）；追问 `Type your answer, or talk about something else`（`Sdkx2e`）；群聊 `Message group`（`pxk5Ic`）；未登录 `Sign in to Cursor in settings, then ask anything`（`3as2Ge`）；表单 `Add a message, or hit send`（`gXTDg7`） |
| 禁用态 | 无独立「禁用文案」串——靠 placeholder 变体 + notice（我们 override 的 Read only 同型） |

草稿：`sendDraft/discardDraft`（coordinator，已录覆盖度地图 A1）；`dictationProvisional` 扩展把听写文本以临时态插入。

### 2.6 A8 差距表

| 项 | 0.78.1 锚点 | 我们现状 | 差距 |
|---|---|---|---|
| @ 提及菜单 | prompt-editor chunk @36951 + APP 表 8 实体键 | 无 | **P0**（Bot/Skill 两类先行） |
| `:` emoji 行内建议 | chunk @46471 `recordRecent` | 无 | P1 |
| emoji picker（搜索/Quick reactions/pin） | APP @2.49M 8 键 + emojibase chunk | 无 | **P0**（与消息 reaction 共用一个 picker） |
| `/` 命令菜单 | chunk @74521；Action/Skill/工具图标 | 无 | P1 |
| 粘贴文件→附件 | APP @2837078（窗口级 @2853934） | 有 onStageFiles（0.18 基本路径） | 窗口级粘贴 P2 |
| 无格式粘贴 mod+shift+v | RE-KEYBINDINGS §3 | 无 | P1（键位随键盘批） |
| 引用回复（quote-reference/Cancel reply/Jump to） | APP `AnRu/j`/`i/GPhL` | 无（onReply 已剥） | **P0**（依赖 dsh 语义，见 A5） |
| 听写状态机五态 | APP @1.94M–1.96M | 有 voice 三态（recording/processing/idle） | 文案补齐 P2 |
| 语音通话/语音留言/Teach 按钮 | APP `ejM5Ai`/`3yD7nZ`/`yrMloC` | 无 | 不做/P2（H1/H2 域） |
| 占位符变体 | APP 5 键 | 仅默认 1 条 + Read only | P2 |
| 附件条/移除/上限 | APP `HLazKQ`/`w/Sphq` | 有（COMPOSER_ATTACHMENT_LIMIT） | — |

**施工建议**：第一批 = emoji picker 组件（搜索 + Quick reactions 固定行 + 近期；right-click pin 可后置）+ 消息 Add reaction 共用；第二批 = @ 提及（Bot 实体：插入 `span[data-type="mention"][data-id][data-label]`，发送侧平文本 + meta，dsh 需要新字段则先 shim 内部消化）；quote 回复与 A5 Reply 同一张单。

---

## 3. C4 Bot 设置

### 3.1 面的层级（0.78.1 实测结构）

三层，不是单面板：

1. **Details 信息面板**（APP byte≈1.42M–1.47M，侧栏/头部的 info pane）：
   - 字段：`Bot name`（`RFtRvq`）/`Group name`（`WcF1uL`）、**`Bot label`**（`oT1yCy`，`Add a label` `d85lwh`）、`About` = 描述（`uyJsf6`/`NDq8h1`/`vzJ7AQ`）。
   - 发布态：`Draft: Only you can see it`/`Published to your team`/`Shared with others`（`HzACNJ`/`4I7dxd`/`yqS7HA`）。
   - 页签：`Details`/`Tasks`/`Library`/`Computer`/`Meetings`/`Members`（群）（`URmyfc`/`GtycJ/`/`exYcTF`/`9lzViG`/`jzmguI`/`wlQNTg`）。
   - per-bot 设置区：**Voice**（`Voice`/`Voice chat`/`Language`/`Speed`，`KAXSwC`/`MAnFFY`/`vXIe7J`/`l9wI00`）+ **Notifications**（`Get notified when this Bot finishes or is waiting for you`，`ttdOeI`）。
   - `Bot settings` 按钮（CORE `q/EMCC`）→ 打开第 2 层五区对话框；`Back to details`（`9Nvo1i`）。
   - 头像：`Edit Bot avatar`（APP `fopc9x` @1418381）→ `chunk-agent-avatar-editor-CDfEUvTS.js`（`Avatar editor` `p9Xy+W`、`Avatar source` `ciFwRi`、AI 生成 `Describe your avatar…` `7KrBp7`/`IVpf8Z`、`Generating avatar` `lhKkFq`、`Set avatar` `eCtMfe`）；群头像 `Edit group avatar`（`+VqhIo`）、`Reset to the members' avatars`（`bpkpZv`）。
   - 形状/颜色：**创建时选**（`Character shape`/`Character color` APP `dcNGHT`/`QVyyXb` @1.084M；24 形状 blob…pumpkin + 11 色 Black…Gray 全键在 APP 表）；设置里**没有 per-bot 改色/改形**——`Bot color`（APP `p7v5PZ`）是全局设置 General 区的偏好（`chunk-general-pane-YXy_8X5a.js`，主题 Light/Dark/Black 旁，即「bot 消息着色」开关的实体）。
   - 群：`Leave this conversation?`/`Leave`（`o3iylT`/`Mv8CyJ`）。
2. **Bot settings 五区对话框**（`chunk-bot-configure-dialog-DoyeGyea.js`，33KB）：tab 值 `tools/skills/memories/automations/analytics`，标签 `Tools`（`xdA/+p`）/`Skills`（`PCSkw2`）/`Learnings`（`suK/+A`）/`Routines`（`dmYV6f`）/`Analytics`（`ZlwDi6`）；tab 条自身 aria 标签 = `Configure sections`（CORE `m4pEDm`——**不是侧栏功能**，是这条 tab 条的 accessible name，前报未解之处）。深链路由：`slack`→tools、`files`/`plugins`/`secrets`/`service-accounts`/`teams`→tools。
   - **Tools**：连接器/插件 + secrets + files（bot 文件库）+ service accounts + Slack 子面板（`Add to Slack`/`Added to Slack` `cOlI3u`/`1AqbgK`）。
   - **Skills**：库勾选（`Add skills from your library that {bot} can use…` `nYwHT5`）、`Add custom skill`/`Import existing skill`（`EBwmRD`/`c4iggE`）、skill 编辑器 `Name`+`Instructions`（`How {bot} should do this, step by step` `NxHkkp`/`ekoX61`，校验 `Use at least one letter (a–z) or number` `MEJR0H`、重名 ` is already listed` `YNjRIY`）、`Written by {…}`（`xFRlhB`）。
   - **Learnings**：个人 `What this Bot learns about you shows up here`（`OBYL8w`）/团队 `What this Bot remembers for everyone on your team`（`wjgPd3`）+ `Shared memories`（`AmK0iB`）；审阅流 `Pending review`/`Recently learned`/`To review`/`Review all`/`Approve`/`Reject`/`Review in chat`/`Review all in chat`（`2WtL62`/`fpJRVq`/`i1FCIq`/`TOWanl`/`Z7ZXbT`/`1t/NnN`/`EdpjwO`）；条目类型 chip `Team memory ·`/`Forgets a team memory ·`/`New skill ·`/`Updates the skill ·`/`Removes the skill ·`（`bAbAaU`/`cgJEoC`/`pT0VDT`/`YcKYlR`/`QeMLPB`）；一键审阅提示词两条（`Kzfpvn`/`gVqdHb`——**把审阅清单发给 bot 自己走查**）。
   - **Routines**：`Pause`/`Resume`/`Test`/`Edit`/`Delete`（确认 `This deletes the routine and stops its future runs. This can't be undone.` `VAgxC4`）、`Webhook`（`TRDppN`）、空态 `Ask in chat to set a routine`（`uUGtMZ`）、失败 `Couldn't pause/resume this routine`（`JKdhhI`/`v+fmj9`）。详情面板（APP @1.43M）内嵌同一套。
   - **Analytics**：7/30/90 天（bot-manage-screen `rJe6vw`/`P9cEa2`/`h28hXf`）；`Messages`/`Hours saved`/`Messages per day`/`Cumulative hours saved`/`Weekly active users`/`Daily and weekly active users`/`Top users, last 90 days`（`t7TeQU`/`f13RAK`/`ThYXzB`/`5NDySv`/`+tV4fQ`/`RXEdhS`/`rx3zDK`）；估算注记 `Estimated, all time`/`Still being estimated...`/`An AI estimate of the time this Bot saved your team…`（`xdHsyQ`/`u3ZaYt`/`y6y0HQ`）；空态 `Usage shows up here once teammates message this Bot`（`MdbaWI`）。
3. **团队 bot 管理页**（`chunk-bot-manage-screen-DrDJNBmv.js`，67KB）：tab `General`/`Knowledge`/`Analytics`/`Channels`/`Service accounts`/`Slack`/`Microsoft Teams`（`Weq9zb`/`Ev5qq2`/`ZlwDi6`/`lfFsZ4`/`wzclHT`/`lyjq5X`/`MxACj5`）；角色 `Owner`/`Manager`/`Collaborator`/`Teammate`（`LtI9AS`/`31RMxV`/`sylWod`/`3suhu0`）；**Shared connectors**（`Share my {connector} account`/`Stop sharing`/`Reconnect`/`Switch to service account`，`u7NG+J`/`YRwdh4`/`cXK9EQ`/`/rIELk`；`Set up tools once for the whole team…` `bIIFX5`）。Knowledge tab = `chunk-bot-manage-knowledge-Cciz9jNH.js`（skills 编辑器 + Learning 审阅，键见上）。

**关键否定结论**：**0.78.1 没有 per-bot model 选择**（bot-configure-dialog/bot-manage-screen 0 处 `model`；`Model`/`Choose which AI model Grok Bot thinks with` `scu3wk`/`2RPCms` 在**全局**设置 General 区，APP @2.71M）。也没有 per-bot persona/instructions 自由文本——「Instructions」只存在于 **skill 编辑器**（How {bot} should do this, step by step）。我们的 per-bot ModelPicker 是 pbots 自有扩展（多 provider 需要它），**保留但记为有意超越原版**。

### 3.2 C4 差距表（我们 = agent-settings.tsx + skills-dialog.tsx + character.tsx/new-bot-dialog.tsx）

| 区/字段 | 0.78.1 锚点 | 我们现状 | 差距 |
|---|---|---|---|
| Name/Description（Details） | APP `RFtRvq`/`uyJsf6` | 有（recovered Name/Description） | — |
| **Bot label**（副标签） | APP `oT1yCy`/`d85lwh` | 有 Title 字段（0.18 同构） | 文案 Bot label P2 |
| About 折叠 `Show more/less` | APP `fMPkxb`/`6lGV3K` | 无（多行直出） | P2 |
| 发布态（Draft/Published/Shared） | APP `HzACNJ`/`4I7dxd`/`yqS7HA` | 无 | P2（依赖 C5 分享） |
| 头像编辑器 + AI 生图 | APP `fopc9x` + chunk-agent-avatar-editor | avatars.ts shim 部分 | P1（C3 域已列） |
| Voice 四件（Voice chat/Lang/Speed） | APP `KAXSwC` 等 | 无 | 不做（C3/H1 域） |
| per-bot Notifications 开关 | APP `ttdOeI`/`iDNBZe` | 有（notifyOnUpdatesEnabled） | — |
| 五区对话框骨架（tab 条） | chunk-bot-configure-dialog `Te` 数组 | 无统一对话框（各区散在 info pane） | P1（Learnings/Routines/Analytics 无容器） |
| Tools 区（连接器/secrets/files/SA/Slack） | 同 chunk 深链路由 | Configuration 只读展示 + 市场浏览 | P1（展示型先做） |
| Skills 区：库勾选/添加/移除 | APP `nYwHT5` + knowledge chunk | 有（Pick from your skills + Remove） | — |
| Skills 区：skill 编辑器（Name+Instructions） | `NxHkkp`/`ekoX61`/`MEJR0H`/`YNjRIY` | 无（skill 只读列表） | P1 |
| **Learnings 区（审阅流）** | APP `2WtL62` 等 15 键 | 无 | **P0**（覆盖度地图点名的行为重点） |
| Routines 区（pause/resume/test/webhook/edit/delete） | APP @1.43M + `VAgxC4` | 无 | P1（后端 routine 语义缺） |
| Analytics 区 | bot-manage-screen 13 键 | 无 | P2（需服务端统计） |
| per-bot model | **无此功能**（全局 `scu3wk`） | 有 ModelPicker（pbots 扩展） | 保留，记超越原版 |
| persona/instructions 自由文本 | **无**（只在 skill 内） | 无 | 对齐原版=不做 ✓ |
| 团队 bot 管理页 | bot-manage-screen 全 chunk | 无 | 不做（C9 域） |
| 群 Members/Leave | APP `wlQNTg`/`o3iylT` | 无群 | 不做（H7 域） |

**施工建议**：先立「Bot settings 五区容器」（tab 条 + Tools/Skills 两个现有区搬入 + Learnings 空态文案），Learnings 审阅流单开一张 P0 工单（服务端 learnings 队列没有就先做 UI + shim 存储顺带把「一键审阅提示词」两条 i18n 抄上）；skill 编辑器（Name+Instructions+校验三键）P1 跟进；Voice/Routines/Analytics 视后端再排。

---

## 4. A5 消息操作全集

### 4.1 hover 工具条与菜单结构（APP byte 2.518M–2.53M 实测）

**hover 工具条**（`sand-message-hover-actions`，toolbar role）只有**两个按钮**：
1. `Add reaction`（APP `9OEgyT`，icon smiley-happy）→ 直接弹 emoji 快捷条（`VZ` reaction bar）→ `onExpandPicker` 进全量 picker（`HZ`，锚定 popup）。
2. `More message actions`（`3x+XhI`，icon dots-3-horizontal）→ 菜单。

**菜单**（`gw` 菜单组件，逐项条件渲染，byte≈2526300）：

| # | 项 | 文案（APP 键） | 条件/备注 |
|---|---|---|---|
| 1 | Open page | `IAwDz9`（arrows-expand-simple） | 有 page 上下文时**替换** Reactions 子菜单位 |
| 2 | Reactions 子菜单 | `ztIp/Z`（hw.Trigger） | 展开 reaction bar → More emoji |
| — | 分组头 | `More message options` `Zv/GS5` | |
| 3 | Copy link | `y1eoq1`（link） | |
| 4 | Reply | `ImOQa9`（icon je） | **在菜单里，不在 hover 条**（0.18 是 hover 按钮——形态漂移） |
| 5 | Create Thread | `WUaPrq`（chat-bubbles） | 线程根消息才有；RPC `createThreadFromMessage` |
| 6 | Download / Download all | `mzI/c+`/`3YP/Ra`（desktop-download） | 附件>1 时 all |
| 7 | Copy | `he3ygx`（copy） | |
| 8 | Copy（动态标签 m(FD)） | copy | 第二个 copy 变体（标签函数渲染，源未解析） |
| — | Artifacts | `4/xiC/` | 工件类消息 |

菜单 aria：`Message actions`（`+nYs0G`）。**无菜单内快捷键提示**（无 kbd/hint 结构）。

### 4.2 其余操作面

- **reaction 机制**：hover smiley → 快捷条（Quick reactions）→ 全量 picker（搜索/近期/右键 pin）；已反应项 `React with {label}`/`Remove {label}`（`RuZquS`/`4MtagZ`）aria；本地乐观 `toggleReaction` → RPC `reactToMessage`（send lane，冲突 `resync`+`marks` 回填，APP @4.31M）。
- **引用回复**：菜单 Reply → composer 进 reply 态（`Cancel reply` `AnRu/j`、引用预览 + `Jump to replied message` `i/GPhL`、quote-reference 节点、`Reply to attachment…` `tObPuA`）；用户消息上的 Reply aria = `Reply to your message`（0.18 同构）。
- **线程**：Create Thread → 侧线程（thread 行回侧栏 Threads 区，见 §1.3）；`Reply in thread`/`Reply in thread…`（APP `jhOiFA`/`EgrqR3`）。
- **编辑（roll-back 型）**：tray（`sand-tray__action-group`，APP @3.74M–3.76M）`data-sand-tray-action` 全集 = **`roll-back` / `start-fresh` / `buy-credits`** 三种；`Edit`（`ePK91l`）即 roll-back——编辑最近一条用户消息并回滚重跑；`start-fresh` = `Reset this conversation?` 确认（`T1rcxH`/`8agLZa`/`OfhWJH`）；失败 chip `Something went wrong. Try again.`（`D2AZQg`）。**没有逐条 Edit/Delete 已发送消息的菜单项**（无 `editMessage/deleteMessage` RPC、无对应 i18n）。
- **发送失败卡**（APP @2.67M）：`Failed message actions`（`BTFLv+`）= **Resend**（`MyjAbr`）+ **Delete**（`cnGeoo`）；状态 `Sending…`/`Not delivered yet`/`Failed to send`/`This message is already sending and can't be canceled`（`Sad2tK`/`qq3pY2`/`lDjxmT`/`bC9a5W`）。
- **Pin 消息：不存在**（无 Pin message/Unpin message 串；`Right-click to pin` 是 emoji pin）。
- **voteFeedback**：RPC 在 send lane bundle（@263344/@4225463），**无可见 thumbs UI**（无 feedback/helpful 文案）——widget/user-form 内部用。
- 通知 tray：`Clear all`/`Weekly usage limit reached.`/`Increase limits`/`Dismiss notification`（`yYxB17`/`rr7l0H`/`B8A6ut`/`dj2xTE`，H6 域）。

### 4.3 A5 差距表（我们 = transcript.tsx override + recovered message-actions.tsx）

| 操作 | 0.78.1 锚点 | 我们现状 | 差距 |
|---|---|---|---|
| hover 工具条（Add reaction + More 两钮） | APP `9OEgyT`/`3x+XhI` | recovered 有三钮（reaction/reply/dots），**override 剥到只剩 More→Copy** | 形态对齐 P2（0.78.1 只两钮） |
| Add reaction + picker | APP @2.49M picker 全套 | 无（renderMessageReactionActions=undefined） | **P0**（与 A8 emoji picker 同单） |
| 菜单 Copy | APP `he3ygx` | 有（Copy + clipboard 兜底） | — |
| 菜单 Copy link | APP `y1eoq1` | 无 | P2（消息 permalink 需服务端） |
| 菜单 Reply（引用回复） | APP `ImOQa9` + reply 态三键 | 无（onReply=undefined） | **P0**（dsh 发送侧需带 quote 字段，shim 先内部标记） |
| Create Thread | APP `WUaPrq` + RPC | 无（onStartThread=undefined） | P1（线程树大工单，配合侧栏 Threads 区） |
| Download/Download all | APP `mzI/c+`/`3YP/Ra` | 无 | P2 |
| Open page / Artifacts | APP `IAwDz9`/`4/xiC/` | 无 | 不做（page/artifact 域） |
| 逐条 Edit/Delete 已发消息 | **不存在**（无 RPC 无文案） | 无 | 对齐原版=不做 ✓ |
| tray Edit（roll-back 重编） | APP `ePK91l` + `roll-back` @3.75M | 无 | **P0**（= 「编辑上一条重发」；dsh 可用 supersede/cancel 实现，T81a 已有底） |
| tray start-fresh（Reset conversation） | APP `T1rcxH`/`8agLZa` | 无 | P1（seedConversationName/startFreshConversation RPC 在表） |
| 失败卡 Resend/Delete | APP `MyjAbr`/`cnGeoo` | 无独立失败卡 | P1（A1 域 draft-send-error 同批） |
| Pin 消息 | **不存在** | 无 | ✓ |
| thumbs（voteFeedback UI） | **无可见 UI** | 无 | ✓ |

**施工建议**：P0 三件 = tray Edit（roll-back：把上一条用户消息装回 composer + 会话回滚标记，走 T81a supersede 通道）+ Reply 引用（composer reply 态三键 + 发送带引用，dsh 字段缺则 shim 元数据先行）+ Add reaction（复用 A8 emoji picker）。Create Thread/失败卡 P1 随后；形态对齐（hover 两钮化）在做 reaction 时顺手。

---

## 5. 局限与未验证项

1. 全静态，未执行产物；「点了会发生什么」由代码路径+i18n 推出。菜单项的**渲染条件**（如 Copy link 何时出现、Create Thread 的线程根判定）只溯源到条件表达式存在，未逐 feature-gate 解值。
2. APP 内嵌 i18n 表提取用 `"id":[…]` 正则（2244 条），个别含嵌套数组/转义的条目可能漏收；本报告引用键均已单独验证存在。
3. 菜单第 8 项「第二个 Copy 变体」的动态标签函数（m(FD)）未解析出文案源；`gK(text)`（粘贴特殊文本→引用）的命中规则未展开。
4. bot-configure-dialog 的 Tools 子面板（plugins/secrets/files/service-accounts）只在深链路由层证实，各子面板内部字段未逐一枚举（属 C4×D 交叉域，RE-CONNECTORS 已覆盖大半）。
5. analytics 动作名（`pin`/`unpin`/`mark_read` 等 14 个）来自 APP 1.185M–1.22M 切片的正则并集，侧栏区外的误纳可能极小（同片内均为侧栏组件）。
6. 「0.78.1 无 per-bot model」「无逐条 Edit/Delete」「无 Pin message」为否定结论，检索范围 = APP 全文（4.5MB）+ bot-configure/bot-manage 两 chunk + agents 全簇 37 chunk（仅 locale 词条命中 model/Opus）+ 两张 i18n 表（4551 串）；若功能在服务端 feature gate 后动态注入则不可见。
7. 我们侧「现状」按 overrides + recovered 源码 + ProductionRenderer 接线核对；0.18 recovered 与 0.18 原产物的等价性沿用其自带 evidence 注释，未重验。
