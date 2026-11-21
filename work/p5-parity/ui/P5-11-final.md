# P5-11 定稿 · 侧栏 A1 头部 icon 行 + A2 搜索 + A13 折叠态（frontend-dev，Opus 5.5）

输入：`P5-11-A.md`（席 A）、`P5-11-C.md`（席 C）、PLAN P5-11 行 ①–⑥、RE-visual-residual A2/A13、R2 `RE-visual-078-values.md` A1/A15/条目本体、0.18 重建仓 `sidebar-layout-state.ts:25-34`、`view.css:91-96`、`sidebar-search-trigger.ts`（只参照）。

## 两席已收敛（照做）
折叠宽 78 常量（54 + 列表 padding 12×2，推导值非实测）· 容器 `@container (max-width:130px)` 断点 · 折叠条目宽 54 / padding 9 / 只剩头像 · 头部钮 24×24 r6 · 敲字即搜（`isComposing` 不截获）· 子串过滤大小写不敏感 · 无匹配文案 · 市场行本任务保留（A15 归 P5-16）· 不改 App.tsx。

## 分歧取舍（一行一条）
| # | 分歧 | 定稿 | 理由 |
|---|---|---|---|
| 1 | 头部按钮排布：A 左两钮 + New Bot 贴右；C 三钮一行 | **R2 实测：三钮同组贴左**（`new-actions` 组 gap 2，header `space-between` 只有一个子组 → 贴左） | R2 L27-38 实测结构；A 的偏离理由（右侧空）是审美推断，无证据；PLAN ① 字面也是「从左到右三钮」 |
| 2 | 「新建 Bot」文字行 | **由 + 钮接手**，`data-action="new-bot"` 挪到 + 钮；文字行删除；Ctrl+N 进 tooltip | R2 头部即 plus 钮；bots.spec:52/82/92 及 settings/d1/resilience/journeys 全部按 `[data-action="new-bot"]` 点击，:92 读 activeElement 的 data-action，原生 `<dialog>` 关闭回焦到 opener，+ 钮同样成立 |
| 3 | 折叠态主 Bot 标记 | **采纳 C**：移入头像区域（trailing 在折叠态绝对定位到条目右上角，只露 star，time 隐藏） | R2 dUe「collapsed 时全部收 corner」；纯 CSS，不复制 DOM（bots.spec:45 `.corner-main` 单元素 strict 定位不破） |
| 4 | 搜索框位置：A 头部原位替换；C 头部下另起一行 h32 | **A 原位** | 列表不位移、Esc 零跳动（A §7）；0.78.1 无输入框值（打开的是命令面板），C 的 h32/r8 也是设计值，没有证据优势 |
| 5 | Esc：A 一次清空并关闭；C 先清空再关闭 | **A** | 少一态；✕ 钮已覆盖「只清空」 |
| 6 | Enter / 选中后：A 打开首条并退出；C 选中后保留查询 | **Enter 选首条匹配并保留查询（C）**；↓ 进列表 | 保留查询便于连续切换；不退出则少一条焦点归还路径 |
| 7 | 拖拽能否折叠：A/C 都要越阈值吸附 compact | **否：拖拽只在 240–400 夹紧；折叠只经 collapse 钮**；折叠态下向外拖越过 (78+240)/2 恢复展开 | 0.18 `sidebar-layout-state` 是 `isCollapsed` 布尔 + expandedWidth、拖拽只夹紧 expandedWidth；bots.spec:119「拖 −200 → 240」是 U6 既有断言，吸附会把它弄红 |
| 8 | 持久化：A 同键存 78；C 恢复上次展开宽 | **C 的语义，用 0.18 的键**：`sand.sidebar.collapsed`=1/0 另存，`sand.sidebar.width` 只存展开宽 | 0.18 `LEGACY_UI_LAYOUT_KEYS` 实有此键；展开回原宽，重启保持折叠；改动全在 Resizer.tsx 的 read/saveColumn，App.tsx 不动 |
| 9 | 折叠态敲字：A 不触发；C 先展开再搜 | **A** | 折叠态 search 钮隐藏，隐式入口一并关闭，行为一致；需要再加 |
| 10 | 折叠头部：A 一行 [◧][+] 居中；C 两行 | **A 一行居中**，padding 4 | 78−8=70 ≥ 24+2+24，放得下；R2 折叠 justify-center |
| 11 | 无匹配：A「没有名字含「q」的 Bot」；C 另带「清空搜索」钮 | **A 文案**，不另加清空钮 | 头部 ✕ 就在同一视线 |
| 12 | collapse 图标 | `layout-sidebar-right` + `scaleX(-1)` | 字体 ICONS 无 left 码位，theme 不在本任务区域；P5-14 可补 |
| 13 | 读屏 | 搜索态挂一个 `role=status` 视觉隐藏的结果计数；折叠态条目 `title=名字`；collapse 钮 `aria-expanded` | 两席共识的可达性底线 |

## 数值（亮暗共用，颜色全走现有 token）
头部：`min-height: var(--sand-titlebar-block)`、`padding: 12px 16px`、`gap: 8px`、border-box；组内 gap 2。钮 24×24 r6，`background-color,color .12s ease-out`。折叠头部 padding 4、居中、隐藏 search。折叠条目 width 54、min-height 54、padding 9、单列居中；`.bot-text` 与 time 隐藏。
