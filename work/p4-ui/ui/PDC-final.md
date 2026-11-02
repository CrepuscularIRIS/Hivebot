# PDC 定稿 · P-D 设置·bot 配置（U-23）+ P-C 市场（原 U-24，已改自写）

2026-11-02 · frontend-dev（Opus 5.5）· 基座 main@d175a75 · 输入：PDC-proposal-A.md（席 A）/ PDC-proposal-C.md（席 C）、PLAN v2.1 U-23/U-24、CONTRACT §2、T-19 21/90 分野、PAB-final R1–R24（沿用）。
用户总则：「尽量和原来的 UI 保持一致」（LEARNINGS 2026-11-02 11:00）→ 位置/层级以原版为第一参照。

## 分歧裁决（每行：采纳 + 理由）

| # | 分歧点 | 裁决 | 理由 |
|---|---|---|---|
| D1 | P-D 位置：A info-pane 第三列 vs C 主区覆盖 | **采纳 A**（info-pane，主网格第三列 320，可调 280–400，键 `sand.infoPane.width`） | 原版 bot 配置就在会话头「View agent settings」→ 右侧 info-pane（RE-ui-shell §3.2/§3.4），与原版一致优先。C 的「挤压会话」论证用 A 的兜底消解：主列 < 424（`--sand-chat-min-width`）时 pane 改为覆盖式浮层。自写成本可控：网格多一列 + 复用侧栏拖拽（抽成 `Resizer` 共用），无新依赖 |
| D2 | pane 开合 | 全局一个状态（A），`sand.infoPane.open` 持久化 | 原版行为；按 bot 记忆无数据源支持，YAGNI |
| D3 | pane 内容层级 | **采纳 C 的顺序**：名称+主 Bot 标 → 失效提示 → 配置（锁定）→「用此配置新建」→ 模型 → 主 Bot | C：首要信息是「这是哪个 bot、配置是否可用」；A 把模型放最上，与「配置随 bot 固定」的认知顺序相反 |
| D4 | 七节 settings overlay | 两席一致不做 | 死入口（D12 精神） |
| D5 | c1 失效态呈现 | **采纳 A 四处全套**：侧栏副行「连接器已失效」+ 头像角标 ⊘；头部连接器文字转 danger；composer 位换横幅 +「用此配置新建 →」；pane 连接器行红点「已失效」+ 模型 select disabled | 派发定稿要点；C 补充「不能只靠颜色」→ 角标用 slash-circle 字形 + 文案 |
| D6 | c1 无证据时是否点名连接器 | 采纳 C：pane 只把 recipe 里的连接器整体标「已失效」，不猜哪一个 | main 只给 recipe 级 live，没有逐连接器证据 |
| D7 | c2 | 两席一致：无新 UI（启动封面期间 U-14 allSettled 处理，settle 后失败者以 c1 出现） | — |
| D8 | 改模型交互 | A：选中即调 #5，无保存按钮；行尾「切换中…」→「已切换，下一轮生效」；失败回滚 + 行内 danger。叠加 C：提交中 disabled、离线 disabled | 两席不冲突，合并 |
| D9 | 设主 Bot | A：无确认、成功后立即移到侧栏顶（R9 冻结顺序唯一例外）；C：M3 patch 成功才置顶。合并为「成功才置顶，失败行内报错」 | 主 bot 置顶是不变式；可逆低风险无需确认 |
| D10 | 对话框连接器栏 | A：基础配置之后、模型之前，候选只来自 #16（installed===true）；勾 ≥1 走 #4，否则 #3 | 派发要点 |
| D11 | 预填连接器已不在 #16 | 采纳 A：该行 disabled 未勾 +「未安装 · 去市场安装 →」+ 提交旁「将不带 X 创建」 | 显式告知 = 满足 C「不静默丢掉」 |
| D12 | #16 读取失败 | **自定**：显示「无法读取已安装连接器」+ 重试；预填的连接器保留勾选（标「未能确认」），提交照走 #4，由 main/SDK 校验（未装 → D7 报错不入列表） | C：失败≠零连接器、不让用户无意建成无工具 bot；A：preset/模型照常可建。保留预填 + 交给权威校验两者都满足，且不多造一个「禁止提交」分支 |
| D13 | 未知配方（无 recipe 的旧 bot）新建 | 采纳 C：打开对话框不预填 preset/连接器，副行「原配置无法完整恢复，请重新选择」 | 不猜原配置 |
| D14 | 预填模型 | 采纳 C：只预填能在 #2 目录里确认的当前模型，否则跟随默认 | — |
| D15 | 「用此配置新建」入口 | A 三处：头部 icon-btn、pane 按钮、c1 横幅；都开同一 `NewBotDialog`（标题「用此配置新建」），**预填不提交** | 派发要点 |
| P1 | 市场位置 | 两席一致：占主列，侧栏保留（审批黄点可达）；侧栏「市场」行去 disabled，打开时 active；点任一 bot 离开市场 | — |
| P2 | 子导航 | A「全部 / 已安装 N」（C 叫「浏览 / 已安装」）→ 用 A 文案 | 原版 Installed 区语义 |
| P3 | 无「安装并启用」/ 无「启用」开关 | 两席一致 | 启用只在 #4 建 bot 时发生；main §2.2 强制 enabled:false |
| P4 | 三分类 | 「已安装」优先（entry.name ∈ #16 installed 名）→ ✓ +「用它新建 Bot →」；否则 keywords 含 `not-installable`（精确匹配，即使有 install.spec 也不覆盖，C）→「仅浏览」灰标签、无按钮、详情常驻原因；否则有 `install.spec` →「安装」次按钮 | T-19 分野；C 的「标记优先于 spec」 |
| P5 | not-bundle 等失败 | A：`application==='failed'` 按 code 分类显示；`not-bundle` →「无法安装 · 此包不是受支持的连接器包」并本次会话记住（不再给按钮、不自动重试）；其它 code → `code: diagnostic` + 「重试」；M1 `pbots/unavailable`（断链/响应丢失）→ C 的「安装结果尚未确认」，先重拉 #16 核对再允许重试 | 派发「尝试安装→失败显示分类原因」；U-25 包装层落地后同一路径自然变绿 |
| P6 | 安装成功判据 | 采纳 C：不凭 M1 ok:true，看业务 `application` + 成功后重拉 #16 核实再显示 ✓ | — |
| P7 | 长任务 | A：全局串行（store 内单槽），可离开详情/页面/切 bot，其余安装按钮 disabled + tooltip「另一个安装进行中」；C：不做假进度条/取消/日志 → 只显示「安装中…」+ 不定长细条（A 的细条是不定长，不是假百分比，保留） | 合并 |
| P8 | 21 条「可装」文案 | 采纳 C：详情说明「安装时会校验是否为受支持的连接器包」，不称「已验证可用」 | 包装层未落地前的诚实度 |
| P9 | 「只看可安装」筛选 | **否掉**（A 提议） | 「仅浏览」标签已把可装行区分开；客户端筛选要么只筛已加载页（误导），要么自动续拉（多一条状态机）。等用户反馈再加 |
| P10 | 分页 | A：limit 50 +「加载更多」按钮（不做无限滚动，E2E 可断言）；C：切源/改 query 重置分页、迟到响应不覆盖（序号守卫） | 合并 |
| P11 | 来源 | #12 返回 1 个 → caption；>1 → select；无添加/编辑入口（无 setIndexes） | 两席一致 |
| P12 | 详情 | 同列推入（A），返回保留 query/已加载结果/滚动；#14 readEntryDetail 走现有 Markdown.tsx（关 raw HTML、不加载远程图片）；失败/none →「暂无详细说明」不阻断安装 | — |
| P13 | logo | 不拉远程 logo，monogram（R10 tint 按名称哈希） | D12① |
| P14 | 离线 | C：保留已读内容 + 注明「连接已断开」，禁安装与新建 | — |
| P15 | 「用它新建 Bot →」 | 打开 P-D 同一对话框，连接器预勾该项、preset 默认，不提交 | 两席一致 |
| P16 | 键盘 | `/` 聚焦搜索；Esc 先清空搜索再返回；行可 Tab/Enter 进详情。否掉 A 的 ↑/↓ 行间移焦与 Alt+← | Tab 已覆盖可达性，少一套焦点管理 |

## 实现中补的裁决
- I1 连接器候选再加一条：#16 行 `availability === 'missing'`（manifest 还在、包文件已删）不算已装。D10c1 实测：`removeBundle` 只改 manifest、链接留存，真实「删 bundle」= 删 profile 的 node_modules 链接，此时 #16 仍报 `installed:true` + `availability:'missing'`。
- I2 #12 只在源读成功过后才带 title：用 #13 返回的 title 补齐，来源 caption/select 不显示裸 URL。
- I3 E2E 故障注入 `__pbotsDev.failNext(method)`（与 U-22 `closeEvents` 同类观测面钩子）：验证 #5 失败回滚。
- I4 E2E「产品按钮装成功」：本地目录源 + loopback 假 npm registry（packument + tgz，条目 `source.registry` 指向它），UI 透传 `install.registry`；包装层（U-25）前真目录 21 条仍走 not-bundle 分类。

## 不做（本轮明确）
info-pane 其它 tab（overview/routines/media）、重命名/头像编辑、市场分类/热门/技能/发布/同步、安装取消与日志流、「只看可安装」。
