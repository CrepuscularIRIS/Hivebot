# RE · P5-R10：0.78.1 tool-call 行在桩下静默丢行的根因

> 2026-11-03 · 静态分析 + CDP 复验（bundle：`/dev/shm/grok-re/0.78.1/app/dist/renderer/assets/index.eager-app-iGTgHP_Q.js`，下称 APP；deb `grok-bot 0.78.1`，Nov 2 解包）
> 结论先行：**0.78.1 的会话 transcript 视图对 `kind:'tool-call'` entry 没有任何渲染代码路径**——它被 rows 折叠器无条件归类为「非行 entry」。tool-call 的可视行（wrench 裸行）只存在于「Full conversation」outline 面板，数据源是独立 RPC `getConversationOutline`（不是 transcript entries）。桩返回 `getConversationOutline: []` 且从不打开该面板，所以行永远不会出现；**对 tool-call entry 做任何字段二分当然无效**——行根本不从 entry 渲染。

## 1. 根因与证据链

### 1.1 会话流（transcript rows）路径：tool-call 被三重排除

APP（renderer bundle）内：

1. **`qP(e)`**（次要 entry 判定，@1651585）：成员含 `e.kind==='tool-call'`（**无条件**，无字段可翻转）。
   `function qP(e){return KP(e)||zP(e)||e.kind==='tool-call'||Out(e)||mne(e)||sc(e)||pc(e)||Cut(e)||gc(e)||…}`
2. **rows 折叠器 `Emt(e,t,…)`**（@1741826，fold 归纳每条 entry → row）：
   `if(e.entryIndex+=1, qP(t)) return e.hasEmittedEntryRow && pmt(t) && (e.pendingBreakEntry=t), null;`
   —— qP 为真直接 `return null`，**不产生 row**。tool-call 的唯一遗留是 `pendingBreakEntry`（`pmt` @1738128：tool-call 需 id **不以** `recovered-` 开头才记录，`fut='recovered-'` @1649190），随后作为 `precedingBreakEntry` 挂在下一条主 entry row 上。
3. **`precedingBreakEntry` 无 UI 消费**：全部 16 处引用位于折叠/分组/复用 key 管线（@1742xxx-1753xxx、Gnn row-key @2985240 `break:${…}`）；读取函数 `rW` @1902097 的调用者 `pW/hW` @1908775/@1908863 只供 attribution、分组 gap、chrome 高度计算（`_W/DW/OW` @1910087-1912172、@2655470、@2699669、@2979659）。
4. **卡片注册表无 tool-call 卡**：claim key `RQ(e)` @2618702 `case'tool-call':return null`；卡片渲染器 `WQ(e)` @2628886 `case'tool-call':return null`（同片第二份 dispatch @2629500+）。

CDP 复验（exp3，`/tmp/bot-p5r10/exp3-dom.txt`）：`sand-virtual-transcript` 虚拟列表的 `data-row-key` 序列为 `fx-e10@10:timestamp → fx-e10@10（user）→ fx-e13@13（assistant）`——e11/e12（两条 tool-call）**没有 row-key**。静态结论与 DOM 实测一致。

### 1.2 tool-call 行的真实渲染地：outline 面板（已实证）

- 行 UI 组件链：`epn`（面板根，@3125641，props `{agentId,agentName,onClose}`）→ `Zfn`（tabs，@3124062）→ `Jfn`（`sand-outline-panel__list` 虚拟列表，@3121138）→ **`Gfn`**（item，@3116974，`sand-outline-item` + `data-kind` + `data-status` + chevron + 可展开 detail）。
- 图标/文案：`Bfn` @3115383（tool-call：pending→loading(spin)/failed→x-circle/其余→**wrench**）；`Rfn` @3114966（`'bash'`→`'Bash'`，camelCase 拆词+首字母大写，`…ToolCall` 后缀剥除）；`Hfn` @3115975（summary 取首词截断）；`Ufn` @3116279（detail 行 `{key:'summary', label, text}`，label/正文用 `—` 连接，@3116780）。
- **数据源是独立 RPC**：`getConversationOutline`（coordinator 方法表 @257774；transcript 域方法组 @263041 `Gd={transcript:[…,'getConversationOutline',…]}`；带 poll 的缓存 store @4295206 `e.source.getConversationOutline({id:t.agentId})`）。返回**outline 节点数组**，kind 是独立集合 `user | thinking | assistant-text | tool-call | send-message`（与 transcript entry kind 不同名）。renderer 不从 transcript entries 构造 outline。
- 面板入口：侧栏 agent **右键菜单**项 `L4e` @1183612（i18n `bSTUoz` = "Full conversation"，`list-bullets` 图标），挂 `showFullConversation` → `panels.outlineAgentId`（@1194622/@3664249）→ `rFn` @3664249 渲染 `epn`。
- **exp4 实证**（`/tmp/bot-p5r10/exp4-ctxmenu-outline.png`）：桩补 `getConversationOutline` 返回 5 节点 + CDP 真实鼠标事件右键侧栏→点 "DEV Full conversation"→面板出现，`[data-kind=tool-call][data-status=completed]` 两行渲染出 **"Bash python analyze.py --quarter q3"** 与 **"Read read ~/q3/summary.md"**——与 R3 归档截图（`ref/r3-conv-light.png`）的 tool 行样式（wrench 裸行、RE-visual-078-values.md B6：行高 28/radius 8/hover 7%/wrench tertiary/chevron xs）一致。
- exp1/exp2 反证：不打开面板时 `getConversationOutline` **从未被调用**（coord.request 日志无该方法）；把节点数据塞进桩也不影响会话流。

### 1.3 为什么 R3 归档截图「会话流里有 tool 行」复现不了

R3 图（10-27）中 tool 行位于 user 气泡与 assistant 之间，且权限卡为 Allow/Deny 两钮（当前 bundle+三字段 ask 渲染 Never/Always/Allow once/Deny once 四钮）。P5-53 已认定 R3 图为「更早桩迭代产物」（REPORT-P5-53 发现 1）。本次静态分析证明**当前 bundle 的会话流不存在 tool 行代码路径**，因此 R3 图的会话流内联 tool 行无法由当前 dist + 任何 entry 数据形态产生——R3 图要么来自不同 dist（/dev/shm 重启丢失，两次解包无法逐字节比对；`chunk-view-Bbgcfm9R.js` 同名暗示同构建，但不排除 R3 驱动流程实际落在别的视图），要么是当时驱动流程打开了某视图的产物。该历史问题不再追（对照台以当前 dist 行为为准）。

## 2. 对照台桩的最小补丁（已实证可行）

目标「让 tool 行出现」有两条路：

**A. 会话流内联渲染：不可行（证明，非缺数据）。** bundle 无代码路径（§1.1 三重排除 + DOM 复验），任何 entry 字段组合都改不了 `qP` 的无条件分支。不需要真实 host 提供状态——是渲染器架构如此。

**B. outline 面板渲染：可行，3 处小改（exp4 已跑通）**：
1. `harness/compare/stub-v3.js`（1 行）：`getConversationOutline: [],` → `getConversationOutline: (a) => (Array.isArray(FX?.outline) ? FX.outline : []),`
2. `harness/compare/fixture.mjs` 的 `toV3`（追加序列化器）：按 §1.2 节点形状输出 outline 数组，如
   `{ id:'o1', kind:'user', text }, { kind:'tool-call', name, status:'completed', summary }, { kind:'assistant-text', text }, { kind:'send-message', message:{type:'text',content} }`
   （thinking 节点 `kind:'thinking', text` 同构；节点 kind 用 outline 集合，不是 entry kind）
3. 驱动（`run.mjs`/`views.mjs` 增一个视图，如 `full-conversation`）：在 ref 侧打开会话后，对侧栏第一项 `.sand-agent-item` 发 **CDP `Input.dispatchMouseEvent`（右键 press+release）**，取菜单里 `/full conversation/i` 项的坐标再发左键 press+release。**合成 MouseEvent 无效**（isTrusted=false 被自研菜单忽略，exp4 前两次失败的原因）。
   面板出现即渲染 outline 行；boundary 判定沿用现有探针。

结论：**不需要真实 host**——`getConversationOutline` 的数据可由桩完全提供。

## 3. P5-55/41 差异表该部位的替代取证

- 若对照台维持「会话流」视图口径：该部位直接记**架构性差异**——0.18 移植树会话流每 entry 一行（tool-call 直渲卡片，v1 桩下可见）；0.78.1 会话流对 tool-call **零渲染**（attribution-only），可视行在 Full conversation outline 面板。这不是缺数据，是两代渲染架构差。
- 视觉对照取证用 outline 面板（路线 B 的 `full-conversation` 视图）：类名锚 `sand-outline-item` / `sand-outline-item__preview` / `sand-outline-item__chevron` / `sand-outline-item__detail`（@3117545-3120898 区），属性锚 `data-kind` / `data-status`；静态值已有档：`evidence/078-css-rules-split.txt`（APP 的 CSS `index-Dh7EWA8t.css` 8,871 条规则拆分）+ RE-visual-078-values.md B6（行高 28、padding 7/8-12、radius 8、hover `color-mix(text-primary 7%,transparent)`、wrench→tertiary、pending→loading、failed→x-circle 红、chevron-right↔down xs、preview 13px ellipsis 非 mono）。
- 0.18 侧若也想做「无会话流 tool 行」变体不必做：0.18 有 producer 且直渲，保持现状即可。

## 4. 局限与未验证项

- `getConversationOutline` 节点的完整字段集未穷举（层级/children、`seq`、`timestampMs` 等是否被消费未逐一验证）；exp4 用最小 5 字段已渲染成功，够对照台用。真实 host 返回的节点可能带更多字段（如 detail 行多条）。
- outline 面板 tabs（`Zfn`）在多 subject（agent 间对话）下的分页行为未测。
- R3 归档截图的会话流 tool 行成因未定论（§1.3），仅证明当前 dist 不可复现。
- `epn` 面板挂载的 `showFullConversation` 除右键菜单外是否还有其他入口（info pane 等）未穷举；exp2 中 info pane 未出现该按钮。
- 实验 Chrome profile/端口均临时（`/tmp/bot-p5r10/`），未触碰 harness 代码与产品树；实验脚本在 `/tmp/p5r10-exp{,2,3,4}.mjs`（临时的，未入库）。
