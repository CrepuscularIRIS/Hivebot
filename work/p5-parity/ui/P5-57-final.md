# P5-57 定稿 · 新 renderer 承载 P-C 市场 / P-D 配置 / 停止钮 / 启动封面

2026-11-03 · frontend-dev（Opus 5.5）· 本任务主会话直派（未派 ux-proposer×2），无 A/C 提案可比：下表「采纳」列一律「自定」，依据写在理由列。
参照：REPORT-P5-54「不等价归口」、REPORT-P5-55、RE-visual-078-values（A15 / D1 / D2 / D3 / B9 按钮体系）、旧 renderer 的 Market / NewBotDialog / InfoPane（4500cd2^，PDC-final P1–P16、D7–D15 的已审语义）。

## 总原则

| # | 分歧点 | 采纳 | 理由 |
|---|---|---|---|
| 0.1 | 怎么挂进 0.18 树 | 自定：**整模块覆盖 + shim 数据面**，上游 diff=0 | 沿 P5-52 规则（能力开关 → 模块覆盖 → CSS）。市场 = 覆盖 `plugins/overlay/desktop-surface.tsx`（ProductionRenderer 已有 footer 入口、overlay 帧、Ctrl 快捷键、命令面板项，全复用）；配置 = 覆盖 `agent-info/settings/view.tsx`（View agent settings 的 info pane）；停止 = 已有的 `chat-header.tsx` 覆盖的 `trailing` 槽；失效禁发 = 覆盖 `composer.tsx` |
| 0.2 | 文案语言 | 自定：**英文** | 0.18/0.78.1 整壳英文（「View agent settings」「Connect apps」）；用户定「尽量和原来的 UI 保持一致」（LEARNINGS 2026-11-02）。旧 P-D 的中文文案按语义译 |
| 0.3 | 数据从哪来 | 自定：shim 新增 `window.pbotsUi`（`shim/src/bots.ts`） | shim 已持有 roster / views / mainBotId，再补 recipes 与 summary.preset 就能给出 bot 配置投影；建 bot、设主 bot、改模型、停止都在这里收口（roster 插入 + agents 推送同一处）。覆盖模块只拿它，不碰 `__pbotsDev`（E2E 观测面） |
| 0.4 | 逻辑搬运 | 自定：旧 renderer 的 `market/store.ts` 与 NewBotDialog / InfoPane 的状态机**复制改造**（第 3 级，本仓 4500cd2^） | 那份语义已过 PDC-final + U-26 GU；`wrapperNameOf` 仍单点 import `app/sdk/src/market/wrapper-name.mjs` |

## ① 市场（P-C）

| # | 分歧点 | 采纳 | 理由 |
|---|---|---|---|
| 1.1 | 入口 | 自定：沿用 0.18 footer 药丸，文案 `Plugins` → **`Connect apps`**（覆盖 `production/evidence.ts` 的 UI_TEXT.plugins） | A15：0.78.1 = footer「Connect apps」药丸（R2 L43-48）；药丸几何 P5-55 已对齐，不再动 |
| 1.2 | 药丸 logo / 计数 | 自定：**不做**，记豁免 | 0.78.1 显示「已连接 app logos + 计数」；我们无 logo 数据源（PDC P13：renderer 不拉远程 logo），计数需改 ProductionRenderer 的 children（非模块边界）。REPORT 记「数据缺席」 |
| 1.3 | 容器 | 自定：D1 模态 `min(900px,100vw−32px)` × `min(700px,100vh−96px)`、r14、1px `--cursor-stroke-secondary`、`--cursor-bg-elevated`、无阴影；开场 scale .97→1 + fade 200ms `cubic-bezier(.165,.84,.44,1)`；reduced-motion 关 | R2 D1 |
| 1.4 | 头部 | 自定：高 48；详情态左侧 Back 圆钮（chevron-left、28、ghost）；标题 `Connect Apps`（id `sand-plugins-modal-heading`）；右上 Close 圆钮（close、28、ghost） | R2 D2。「Import Bot」不做（无 bot 市场） |
| 1.5 | tabs | 自定：`All` / `Installed N` 药丸 tablist（padding 5px 10px、body2） | R2 D3 tablist 规格；plugins/bots 两 tab 的 bots 侧我们没有，改为 0.18/旧 P-C 的「全部 / 已安装」 |
| 1.6 | 列表 | 自定：搜索框（200ms 防抖、`/` 聚焦、Esc 清空→再 Esc 关）、多源 select / 单源 caption、行 = monogram 36 + 标题 + 描述 + 右侧状态；`Showing N of M` + `Load more`（limit 50） | 旧 P-C P10/P12 语义；monogram（P13） |
| 1.7 | 三分类 | 自定：installed（源名或 wrapper 名 ∈ #16）> browse（not-installable / 无 install.spec）> unsupported（本会话 not-bundle）> installable | 旧 store.classify 原样（U-26 ①） |
| 1.8 | 安装 | 自定：全局串行；`enabled:false` 恒定；进度条 + `Installing…`；看业务 application 不看 M1 ok；完成重拉 #16；断链 = 「unconfirmed」；关掉市场安装照常（模块级 store） | 旧 P5/P6/P7 |
| 1.9 | 用它新建 | 自定：详情 / 已安装行 `New bot with this app` → 打开 ②的新建对话框（预勾实际 bundle 名）→ 成功后关市场、聚焦新 bot | 旧 D13–D15 + U-26 ① |
| 1.10 | not-bundle 文案 | 自定：`This package isn't a supported connector bundle.` | 旧 outcomeText 英译 |

## ② 新建对话框 + 配置面板（P-D）

| # | 分歧点 | 采纳 | 理由 |
|---|---|---|---|
| 2.1 | 新建入口 | 自定：**侧栏 New（+）不再直建**，shim `createAgent` 先等对话框（覆盖层注册的 chooser）；取消 = 回 null（不建、不报错） | 0.18 无此 UI；建 bot 时选 preset + 连接器是 D10/D11 的前提，不能绕过。ProductionRenderer 的 createAgent → refreshRoster → openAgent 链路原样复用 |
| 2.2 | 对话框形态 | 自定：原生 `<dialog>` showModal（焦点陷阱 / Esc 原生），外观同市场 D1 卡（r14、1px 描边、elevated、无阴影） | 平台原生优先；旧 R12 |
| 2.3 | 字段 | 自定：Preset（radio）→ Connectors（checkbox，只列 #16 installed 且未 missing；预填但未装 → disabled +「Not installed · Open Connect apps」+ 提交旁「Will be created without X」；#16 失败 → 保留预填、标「Couldn't confirm」）→ Model（select，缺省「Preset default」）→ 固定说明「Configuration is locked when the bot is created.」 | 旧 NewBotDialog D10–D12 |
| 2.4 | 名字字段 | 自定：**不加** | 0.18 设置面板已有 Name（updateAgent → session/rename） |
| 2.5 | 配置面板位置 | 自定：View agent settings 的 info pane，上游 Name/Description 之后追加 `Configuration` / `Model` / `Main bot` 三段 | D11 头部 = 原版会话头 → info pane；不新开面板 |
| 2.6 | 只读配置 | 自定：Preset / Connectors 两行带锁图标、无编辑控件；`New bot with this configuration`（预填，未知配方要求重选） | D11；旧 cloneInit |
| 2.7 | 改模型 | 自定：保留 select（#5 只对本 bot、下一轮生效、失败回滚显示原值） | P-D ① 已有契约，D11 只锁 preset / 连接器 |
| 2.8 | 设主 bot | 自定：`Set as main bot`（#20 成功才置顶；失效 bot 禁用 + 原因）；主 bot 显示说明行 | 旧 D9 + U-26 ④ |
| 2.9 | 失效显示（D10c） | 自定：三处——侧栏行预览行「Connector unavailable」（shim `lastMessagePreview`）、info pane 横幅、composer 禁发 + notice「This bot's connector is no longer installed. Create a new bot to keep going.」 | D10c「角标 / 横幅 / composer 禁发」；侧栏走数据面不改 sidebar 模块；只读历史照常可读 |

## ③ 停止钮

| # | 分歧点 | 采纳 | 理由 |
|---|---|---|---|
| 3.1 | 位置 | 自定：**会话头**（`chat-header` 覆盖的 trailing 槽，`Working` 右侧），运行中才出现 | header 覆盖已在、手上就有 `agent.isRunning` 与 id；composer 内换钮要重写上游 actions 行。0.18/0.78.1 本无 stop（AUD B11 登记的 PAB R19 有意偏离） |
| 3.2 | 形态 | 自定：SandButton secondary sm 药丸、leadingIcon `stop`、文案 `Stop`；点后 `Stopping…` 禁用；失败 → 复位 + 会话头 `Couldn't stop` 提示可再点 | 旧 GU-3 停止复位口径 |
| 3.3 | 链路 | 自定：`session/cancel {request:{sessionId}}`（P5-27 同参） | P5-27 |

## ④ 启动封面

| # | 分歧点 | 采纳 | 理由 |
|---|---|---|---|
| 4.1 | 形态 | 自定：**最简品牌封面**——全窗 `--sand-bg-chrome` 底、居中 app 图标（`assets/runtime/app-icon`，原版资产）48px + `Grok Bot`、下方细 spinner；整面可拖拽 | 0.18 无封面；R2 头部无品牌位，品牌只在封面出现 |
| 4.2 | 谁挂 / 何时收 | 自定：shim（defer 经典脚本，先于 bundle）挂 DOM；首个 roster 成功即 160ms 淡出（立即 pointer-events:none）；reduced-motion 直接移除 | 不等 React；不挡 e2e 点击 |
| 4.3 | 长等 / 失败 | 自定：8s 未就绪 → 「Still connecting to the engine…」；shim 放弃重试（≈60s）→「Couldn't connect to the engine.」+ `Reload` | 状态全集；无死封面 |
