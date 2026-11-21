# RE-visual-residual · AUD 残余闭集表（U1 验收基准）

日期：2026-11-03 · 方法：对 main HEAD（80439b3）静态读码，逐行核对 `work/p4-ui/RE-visual-audit.md`（下称 AUD，59 项主表 + 24 条条件显示规则）
读码范围：`app/ui/renderer/{shell/app.css, shell/App.tsx, shell/Resizer.tsx, plugins/bots/Sidebar.tsx, plugins/session/Conversation.tsx, plugins/session/Markdown.tsx, plugins/settings/InfoPane.tsx, plugins/market/Market.tsx, theme/dsw.css, theme/sand-tokens.css, theme/theme.tsx}`
未用 REA 引擎（普通源码仓分析）。未跑 app。

## 结论（先行）

1. **U-27（@70c5925）之后 renderer 视觉零改动**：`git diff 70c5925..HEAD -- app/ui/renderer/` 只有 reduce.ts / NewBotDialog.tsx / shell/store.ts 三个非视觉文件。所有 fixed 项统一 `fixed@70c5925`。
2. **主表 59 行**：fixed 19 · 等价 24 · open 6 · 范围外（waived）10。**规则表 24 行**：fixed 3 · 等价 12 · open 3（全部并入主表 A2/A13/B14）· 范围外 6。合计 83 行闭集。
3. **open 6 项全部准入（in）**：A2 搜索、A13 折叠态、B7 thinking 行、B13 独立会话头、B14 时间分隔/未读线、E5 细边残余——与 BRIEF §2.1 预判完全一致（预判中的 B15 已修，不残留）。
4. **范围外 10 项**全部有豁免依据：A12/A16/B11/B16/C3/C4/C6/D5/D11/D12，逐条落在 §2.1 的不准入类别（需新增后端能力 / 功能数据模型不存在 / 静息态无可应用对象）或既有产品裁决（R9/D11/P1/R19）。

---

## 一、主表（AUD §一，59 行）

状态列：`fixed@70c5925` = U-27 已修 · `open` = 未实现 · `等价` = 形态/语义已覆盖（含 [78] 方向与有意偏离已接受）· `范围外` = waived。
准入列仅对 open 行给判定；其余行给 `—`。

### A. bot 列表 / 侧栏（19 行）

| AUD# | 描述 | 状态 | 准入 | 规格 / 锚点 |
|---|---|---|---|---|
| A1 | 头部结构：去品牌位、New chat 型文本按钮入口 | fixed@70c5925 | — | `Sidebar.tsx:131` sidebar-head 只留拖拽区；`app.css:40` |
| A2 | 搜索入口（过滤本地 bot 列表） | open | **in**（①侧栏静息可见 ②纯前端 ③锚点全） | SandButton md secondary、宽 calc(100%-24px)、margin 4 12；`view.css:156-170`、`sidebar.tsx:139` |
| A3 | 列表容器 padding 4 12 24 | fixed@70c5925 | — | `app.css:49` bot-list padding 4px 12px 24px |
| A4 | 条目 min-height 58 / padding 8 | fixed@70c5925 | — | `app.css:50` |
| A5 | 条目 grid 34px·1fr·auto / gap 9 + trailing 列 | fixed@70c5925 | — | `app.css:50,65-67` |
| A6 | 条目头像 34px | fixed@70c5925 | — | `Sidebar.tsx:92` Avatar size=34 |
| A7 | 条目圆角 12（0.78.1 常量） | 等价 | — | `--sand-agent-item-radius`（RE-ui-shell §2.1） |
| A8 | 相对时间戳 now/Xm/Xh/Xd | fixed@70c5925 | — | `Sidebar.tsx:58-65,103`（本地化「刚刚/N 分钟/N 小时/N 天」） |
| A9 | 副行优先级 + working accent 色 | 等价（accent @70c5925） | — | `Sidebar.tsx:67-74` bot-sub.accent；文案本地化为 PAB 裁决 |
| A10 | hover/active 语义 | 等价 | — | token 层对齐（`--dsw-alias-interactive-bg-*`） |
| A11 | 状态角标族 corner-ring/dot/off/main | 等价 | — | 0.78.1 角标族（RE-ui-shell §3.1）；未读点 accent↔neutral 差异无 0.78.1 细化值，豁免 |
| A12 | pinned 分组 + 拖拽排序 | 范围外 | — | 本产品无 pin 功能（PAB R9 排序冻结）→ §2.1① 不成立 |
| A13 | 侧栏折叠态（≤130px 容器查询，折叠宽 88） | open | **in**（②纯前端容器查询 ③锚点全；BRIEF §2.1 预判准入） | `view.css:91-96`、`sidebar-layout-state.ts:30-34` |
| A14 | 列表空/错态（四态） | fixed@70c5925 | — | `Sidebar.tsx:142-148` empty + unreachable（自动重连，重试在 boot-cover 失败态）；loading 映射 boot 封面；all-hidden 依赖隐藏功能不适用 |
| A15 | 市场入口（storefront 图标 + 侧栏内） | 等价 | — | `Sidebar.tsx:137` storefront ✓；位置头部（AUD 判可接受） |
| A16 | 账号 footer | 范围外 | — | 单用户本地引擎无账号数据源（②需新增能力）+ PAB 裁决 |
| A17 | 侧栏宽 280 / 240–400 | 等价 | — | `Sidebar.tsx:110` SIDEBAR 常量 |
| A18 | 调宽手柄 12px 热区 right:-6 | fixed@70c5925 | — | `app.css:90` resizer right:-6px width 12px |
| A19 | 滚动条原生 | 等价 | — | 无自定义 scrollbar 规则 |

### B. 会话流（16 行）

| AUD# | 描述 | 状态 | 准入 | 规格 / 锚点 |
|---|---|---|---|---|
| B1 | 行间距 22px | fixed@70c5925 | — | `app.css:104` chat-col gap 22px |
| B2 | transcript 内容列 690 居中、padding 28 | fixed@70c5925 | — | `app.css:102-103` --chat-col 690、padding 28px 30px |
| B3 | 气泡形态（user 反转 + botTint） | 等价 | — | 0.78.1 确认特性（RE-theme §2/§4）；`app.css:107-108` |
| B4 | user 气泡文字色覆写 | 等价 | — | `dsw.css` data-message-bubble 覆写，非 bug |
| B5 | 流式三点气泡 | 等价 | — | `app.css:109-113` breathe 动画 |
| B6 | tool-call 描边卡 + 旋转箭头 | fixed@70c5925 | — | `app.css:133-154` tool-card 1px r9、行 34/7·9、chevron 6px ±45°、detail 0 10 10 25 / max-h 220 |
| B7 | 独立 Thinking 行（accent 图标可展开） | open | **in**（②纯前端 ③锚点 `transcript.tsx:600-614`；运行必然态，BRIEF §2.1 预判准入） | thinking-medium 图标 accent、11px/600 |
| B8 | 审批卡 r10 / 14·16 / 小按钮 / outcome 单行 | fixed@70c5925 | — | `app.css:158-170`；`Conversation.tsx:31-37` submitted 收成 approval-outcome 单行 |
| B9 | 审批入口位置（inline 挂 callId） | 等价 | — | 0.78.1 transcript 卡方向（RE-ui-shell §3.2）；提示条为 R1 补充 |
| B10 | composer 外壳 9px / r16 / 输入 ≥48 / dock 底距 18 | fixed@70c5925 | — | `app.css:193-198` |
| B11 | composer attach/mic 钮 | 范围外 | — | 语音/附件需新增引擎能力（②不成立）；stop 态保留（PAB R19 有意偏离） |
| B12 | placeholder 文案 | 等价 | — | `给 {name} 发消息`（本地化） |
| B13 | 独立 ≥51px 会话头（avatar+名字+Working，identity 可点开 pane） | open | **in**（品味项交 GU 一轮，BRIEF §2.1：推翻 PAB R0 合并；working 小标已 `App.tsx:83` fixed@70c5925） | `view.css:99-105`、`chat-header.tsx:29-39` |
| B14 | 时间分隔行（22 margin 居中）/ 未读线 | open | **in**（①历史流静息可见 ②纯前端 ③锚点全） | `view.css:194-196`、`transcript.tsx:701-702` |
| B15 | 代码块 copy 钮（hover 显现 + 已复制反馈） | fixed@70c5925 | — | `Markdown.tsx:25-50`、`app.css:261-265` top/right 6/6 |
| B16 | 消息 hover 动作（Reply/菜单） | 范围外 | — | Reply 需消息回复链后端（②不成立） |

### C. 设置 info-pane（7 行）

| AUD# | 描述 | 状态 | 准入 | 规格 / 锚点 |
|---|---|---|---|---|
| C1 | pane 宽 280–480 | fixed@70c5925 | — | `InfoPane.tsx:12` INFO_PANE max 480 |
| C2 | pane 头 padding-left 12 / 关闭钮 chevrons-right | fixed@70c5925 | — | `app.css:280`、`InfoPane.tsx:123` |
| C3 | Name/Title/Description 可编辑字段 | 范围外 | — | PDC D11 只读裁决；编辑需 bot 元数据写接口（②不成立） |
| C4 | 输入件样式（input r4/30px 等） | 范围外 | — | 只读态无输入件（①无可应用对象）；值留档 `agent-info/settings/view.css:2-11` |
| C5 | 模型选择 | 等价 | — | 产品新增（PDC D8），无 0.18 对应，保留 |
| C6 | 头像编辑入口 | 范围外 | — | 需上传/存储能力（②不成立） |
| C7 | 多 pane 互斥 | 等价 | — | 单 pane 已覆盖 MVP（简化） |

### D. 市场（12 行）

| AUD# | 描述 | 状态 | 准入 | 规格 / 锚点 |
|---|---|---|---|---|
| D1 | 容器形态 | 等价 | — | 0.78.1 为 overlay，本产品占主列是 PDC P1 裁决（审批黄点可达），有意偏离 |
| D2 | 标题/Back | 等价 | — | 0.78.1 Back + Marketplace 方向，当前 titlebar back-btn 已贴 |
| D3 | tabs 全部/已安装 | 等价 | — | 0.78.1 plugins/bots 的合理子集（本地化） |
| D4 | 搜索框 r8 / h32 / padding 0 9 | fixed@70c5925 | — | `app.css:314` m-search |
| D5 | Filter 菜单（Type×Ownership） | 范围外 | — | 过滤维度字段（team/public 等）在本地目录源不存在，功能数据模型缺口非视觉缺口 |
| D6 | 列表行 padding 12 / 行距 7（保持 hover 行） | fixed@70c5925 | — | `app.css:326-330` m-list gap 7、m-main padding 12 min-h 56 |
| D7 | 状态行文案 | 等价 | — | 语义覆盖（无 server/workflow 类） |
| D8 | 详情页结构 | 等价 | — | `Market.tsx:57-118` 头/描述/动作三态/说明 markdown |
| D9 | 安装钮状态 | 等价 | — | busy 禁用 + 单槽 + 重试；字段向导属功能缺口（无字段插件） |
| D10 | 空态文案 | 等价 | — | 四态语义覆盖 |
| D11 | Private 技能区 | 范围外 | — | 无技能系统（功能不存在，①不成立） |
| D12 | 私有技能行 | 范围外 | — | 同 D11 |

### E. 顶栏 / 全局（5 行）

| AUD# | 描述 | 状态 | 准入 | 规格 / 锚点 |
|---|---|---|---|---|
| E1 | 窗口控件 WCO 原生 | 等价 | — | R16 裁决；0.78.1 AX 树同构 |
| E2 | 拖拽区 38px | 等价 | — | titlebar-block 38（0.78.1 ✓） |
| E3 | font-synthesis none + color-scheme | fixed@70c5925 | — | `dsw.css:69` :root font-synthesis none；sand-tokens.css:10/373 color-scheme |
| E4 | 根布局 | 等价 | — | 一致 |
| E5 | .5px 细边 | open（部分 fixed@70c5925） | **in**（残余 = token 层 L1/L2 全面降 .5px） | 已做：`app.css:39`（侧栏右缘）、`app.css:277`（pane 左缘）；残余锚点 `production.css:43`、`view.css:8` |

## 二、条件显示规则表（AUD §二，24 行）

| 规则# | 规则 | 状态 | 关联 / 依据 |
|---|---|---|---|
| 1 | 登录封面 → 引擎墙 | 等价 | R15 裁决（boot-cover） |
| 2 | 侧栏协作钮（0.78.1 已删） | 等价 | [78] 一致 |
| 3 | 搜索钮 | open → in | = A2 |
| 4 | 条目 trailing 状态点 | 等价 | = A11（形态差异豁免） |
| 5 | working 副行 accent | fixed@70c5925 | `Sidebar.tsx:69` |
| 6 | pinned 分组 | 范围外 | = A12 |
| 7 | 折叠态 | open → in | = A13 |
| 8 | Hidden Bots 行 | 范围外 | 无隐藏 bot 功能（MVP 外，①不成立） |
| 9 | 会话头 Working 小标 | fixed@70c5925 | `App.tsx:83` chat-working「回复中」 |
| 10 | 会话头 identity 按钮 | 等价 | icon-btn 开 pane，交互等价 |
| 11 | transcript 空流式三点 | 等价 | ✓ |
| 12 | 回合运行指示 | 等价 | thinking 气泡 |
| 13 | 排队/失败发送 | 等价 | GU-2 裁决 |
| 14 | 未读分隔线 | open → in | = B14 |
| 15 | 审批已决 → outcome 单行 | fixed@70c5925 | `Conversation.tsx:31-37` |
| 16 | Always allow 降级 | 等价 | R4 仅一次（L-AP 将另立规格，不属本表） |
| 17 | composer 空态 mic | 范围外 | = B11 |
| 18 | composer 禁用 | 等价 | readOnly 横幅 / offline 禁发（D5/U-23） |
| 19 | 附件区 chips | 范围外 | = B11 |
| 20 | 拖放遮罩 | 范围外 | 附件功能不存在 |
| 21 | info-pane 开合/互斥 | 等价 | 简化覆盖 |
| 22 | 市场列表空态 | 等价 | 四态 ✓ |
| 23 | 市场安装钮 busy | 等价 | 单槽产品行为 |
| 24 | Private 区 | 范围外 | = D11/D12 |

## 三、统计与 U1 对接

| 类别 | 主表 | 规则表 | AUD# |
|---|---|---|---|
| fixed@70c5925 | 19 | 3 | A1 A3 A4 A5 A6 A8 A14 A18 B1 B2 B6 B8 B10 B15 C1 C2 D4 D6 E3；规则 5/9/15 |
| 等价 | 24 | 12 | 其余 |
| open → in | 6 | 3（并入主表） | **A2 A13 B7 B13 B14 E5** |
| 范围外（waived） | 10 | 6（并入主表或独立豁免） | A12 A16 B11 B16 C3 C4 C6 D5 D11 D12；独立豁免：规则 8（Hidden Bots）、规则 20（拖放遮罩） |

U1 验收口径：上表 83 行即闭集。fixed 19 项按 U2 出 computed-style 断言（A4 min-height 58、B1 行距 22、B8 r10/padding 14·16 等数值已在规格列）；6 个 in 项是 W1-UI 的工作清单；10 项范围外的豁免类别已逐条写明（§2.1 不准入类别或产品裁决编号），无「空状态」行。

## 四、局限

1. **纯静态读码**：未运行 app，未做 computed-style 实测；「fixed」判定依据是源码中的规则值（`app.css` 等），U2 断言落地时可能暴露 token 解析链（--dsw-alias-* → sand-tokens.css）的间接偏差。
2. **fixed 项的 sha 统一为 70c5925**：U-27 是唯一视觉轮次；若后续 cherry-pick 或 rebase 改写历史，需重验。
3. **等价判定沿袭 AUD 的 [78] 结论**（RE-ui-shell/RE-theme 静态证据），本表未重做 0.78.1 逆向；[78] 项的最终数值以 R2 回报为准（U3）。
4. A13 折叠态、B7 thinking 行的「静息态可见」按 BRIEF §2.1 预判口径（正常使用必然出现的界面态）执行，未逐字抠「打开即见」；若 GU 认为口径应更严，这两项移入 out 不影响其余判定。
5. E5 的「部分 fixed」：U-27 只落了侧栏右缘与 pane 左缘两处 .5px，token 层 L1/L2 全面降 .5px 是残余工作，故 E5 整行计 open（in）。
