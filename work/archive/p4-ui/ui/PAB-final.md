# PAB 定稿 · P-A 侧栏 + 建 bot 对话框 / P-B 会话流（frontend-dev，Opus 5.5）

2026-11-02 · 输入：PAB-proposal-A.md（席 A）、PAB-proposal-C.md（席 C）、RE-theme / RE-ui-shell / 01-boot.png、dev-min（U-15）、dsh@ce7073d。
裁决口径：与原版一致优先 > 证据充分者优先 > 验收要求。实现文件头注释引用本表行号（R#）。

## 0. 路线（**须 director 追认**）
| R | 裁决 | 理由 / 证据 |
|---|---|---|
| R0 | 产品页 = 自写 React，数据层沿用 dev-min 的 carrier/$events/follow 归约（升级为产品 store）；**不 boot dsh client**（Cordis/SlotRegistry/ClientSessions）。dsh 组件只在行为层抄（审批卡语义、tool 行图标映射），外观按原版 | ① dsh 浏览器 boot 依赖服务端注入的 `__DSH_BOOT__` 清单与 `__ModuleLoader__` 门面（`packages/client/web/src/boot.ts:56-66`），我们的 main 只发静态文件；② ClientSessions 注入 `typert / remote.commands / remote.subagents`（`api/session-controller/src/client/index.ts:98-106`），远超 M1 白名单 16 个方法；③ spike 与 U-15 都未在 renderer boot 过 dsh UI（spike-data §4：M1 只用到 3 个方法），dev-min 是唯一跑通三桥的消费端。这等于 PLAN 决策 2 在 **UI 层**回退到路线 B；三桥接口（M1/M2/M3）一字未改。两席提案里依赖 dsh 组件的条目（`[data-message-bubble]`、`renderFactorySlot`、composer 回退）按「同语义自实现」落地 |

## 1. 分歧裁决
| R | 分歧点 | 采纳 | 理由 |
|---|---|---|---|
| R1 | 审批卡位置 | A+C：inline 挂在 callId 的 tool 行下；composer 位 36px 提示条（A） | 两席一致；D3 字面要求 |
| R2 | 缺 callId 的审批 | C：本 bot 流末尾独立审批块，不挂「最近一行」 | A 的回退是 dsh composer 行为，R0 下不存在；C 不猜关联 |
| R3 | 卡内 Enter=批准 | C：不设默认 Enter 批准，只有原生按钮激活；不自动抢焦点 | 防误批；A 引的 dsh 键盘行为属可选便利，安全优先 |
| R4 | 批准按钮文案 | C：「仅批准这一次」 | 明示 once 语义；无「始终允许」 |
| R5 | 作答后状态 | C：「正在提交决定…」→「已批准，等待工具结果」；决议后 A：收成一行 `✓ 已批准一次` / `✕ 已拒绝` | C 解「批准≠已执行」；A 给终态几何 |
| R6 | 侧栏调宽 | C：280 默认、240–400 可调（持久化 `sand.sidebar.width`） | 原版有（RE-theme §3）+ 验收①；A 的 YAGNI 被验收否决 |
| R7 | 侧栏项是否两行 | A：48px 两行（标题 + 副行） | 原版 token `--sand-agent-item-title-gap: 1px` 证明有副行；C 的单行无证据 |
| R8 | 角标 | A：ring=running、黄点=审批、蓝点=未读完成、星=主 bot；附文字 aria | 原版 `corner-{ring,dot,main}`；C「轻量主 Bot 标记」并入 aria/tooltip |
| R9 | 排序 | 两席一致：首载按 updatedAt 降序、主 bot 置顶，会话期冻结；新建插主 bot 下 | — |
| R10 | 头像 | A：monogram + botTint 九色族 | 无头像数据；色族来自 theme-tokens.css |
| R11 | preset 选择控件 | A：radio 行（32px） | 便于比较；候选少 |
| R12 | 对话框宽度 / 关闭 | A 宽 440；C：提交中 Esc/背景不关、关后焦点回新建按钮、成功焦点给 composer；原生 `<dialog>` 承担焦点困陷 | 平台原生能力优先 |
| R13 | 模型候选 | #2 无需 sessionId（核实③），对话框直接列；#5 失败按 C：「Bot 已创建，模型未切换」并进入该 bot，不允许二次创建 | — |
| R14 | 主按钮颜色 | A：黑白反转（light `#1c1c1c`，dark `#f5f5f5`），蓝只留链接/焦点/运行环 | 01-boot.png 与原版单色系统 |
| R15 | 启动封面 | A：复刻 01-boot.png，「Sign in →」位换「正在启动本地引擎…」，60 s 后「引擎没有响应  重试 →」；去 Terms | D12② + 用户「尽量一致」 |
| R16 | 窗口控件 | A：`titleBarStyle:'hidden'` + `titleBarOverlay`（38px，随 nativeTheme 换色），不加 IPC | U-00.fN 追认（window.ts 一处） |
| R17 | 运行指示 | A：首块前 36px 单行气泡三点呼吸；不逐 chunk 淡入 | 替换 dsh 鲸尾；D1 要看到增长步 |
| R18 | 自动跟随 | 两席一致：底部 80px 内跟随，否则「↓ 新消息」胶囊；审批不强拉滚动（C） | — |
| R19 | 打断 | A：只用停止按钮，Esc 不绑定；C：点击后到 turn/end 前防重复 | wire 实测取消后 `turn/end.reason.kind === 'aborted'`（PLAN U-22⑤ 写的 `interrupted` 与实测不符，两者都按「已停止」） |
| R20 | 离线 | M1 不走 mux socket → 发送保持可用（A）；审批按钮离线时禁用（C：旧 clientId 失效，重连后补发新卡） | 拓扑：C §2 |
| R21 | 草稿 | C：按 bot 隔离 | — |
| R22 | 头部 | 两席一致：bot 名 + preset/连接器只读文本（D11）；不挂 ui-agent-preset chip（核实④） | — |
| R23 | 市场入口 | A：顶部「市场」行，未就绪 disabled + 「即将开放」 | 原版 Header 有 Marketplace 入口 |
| R24 | 失败 / 终态 | A：工具失败 x-circle；回合失败 danger notice，无重试；C：只读降级横幅占位（U-23 定稿） | — |

## 2. 席 A 四核实项
1. assistant 正文的 `data-chat-flow-kind` = **`assistant-step`**（`ui-chat/src/client/chat/register-node-renderers.ts:58`，写入点 `ChatNodeSeat.tsx:161`）。用户 = `user`。
2. turn-process 折叠**不可配置**：`foldable` 由 `processWindowReady && (liveProcess || processMember || ownsDisclosure)` 推导（`ChatNodeSeat.tsx:99-117`），开合存读者选择（`stores.ts:29`）。R0 下自绘 tool 行，每个 call 常驻一行。
3. `session/modelCatalog` **无参**（`session-controller/src/index.ts:340-343`），不需要 sessionId；实测返回 `{default, routableProviders, groups, failures}`。
4. ui-agent-preset 的 session chip **可写**：选择即调 `agentPresets.select`（`ui-agent-preset/src/client/seat-store.ts:244`），不在白名单。D11：不挂载，头部只显示只读文本。

## 3. 推迟（ponytail）
侧栏折叠 / Ctrl+B、`session/events` 更早历史分页（#11 wire 壳待查，U-23 D6a）、头部改模型（U-23）、只读横幅定稿（U-23）、cursor-icons 之外的 SVG 表。

## 4. 实现中发现（回报主会话）
- **main/index.ts（U-00 区，未改）**：首个文档 load 完成前若 renderer 发起导航，`mainWindow.loadURL` 以 ERR_ABORTED 拒绝 → `main().catch` → `app.exit(1)`。U-21 首屏加载本地字体后 load 变慢，origin-gate (c) 在 (b) 之后稳定复现「Target page closed」；测试侧已先 `waitForLoadState('load')`，产品侧建议 U-00.fN 把 loadURL 失败与进程退出解耦。
- PLAN U-22⑤ 写 `turn/end.reason.kind === 'interrupted'`，真 wire 取消后为 `'aborted'`（`reason.reason.kind === 'user'`）。
- 未带 cwd 建的 session 的 cwd = runtime 进程 cwd；E2E 的 `launchSdkRuntime` 加 `cwd` 选项，副作用不落仓内。
- `tests/unit/shell/wire.test.ts` 桩补 `ready()`（1608d10 基线 unhandled rejection，LOG 14.4x 记档项 a）。
