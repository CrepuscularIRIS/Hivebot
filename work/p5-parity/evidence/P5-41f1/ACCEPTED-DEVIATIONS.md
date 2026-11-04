# P5-41.f1 · 已知偏差签收单（请逐条签收，或打回）

来源：GU-P5-41 必须回应清单（`panels/GU-P5-41.md`）。本单只列**用户看得见、仍与 0.78.1 不同**的地方，以及**低于 WCAG 4.5 的文字**。已修好、和原版一致的项不在签收范围，汇总在文末 §0。

每行末尾的「签收」一栏留空，由你填 ✓（接受）或 ✗（打回，打回的会转成任务）。

「ref」一律指 0.78.1 实测：用对照台 harness 起原版 0.78.1，读 computed color 或 DOM（2026-11-04，探针 `/tmp/bot-p541f1-probe/ref-colors.mjs`，临时文件，用后删除）。对比度用修正后的算法计算：前景先与有效背景合成，背景由祖先向子级逐层合成（`app/ui/tests/support/contrast.ts`，单测含半透明反例）。

---

## §1 低于 WCAG 4.5 的文字（只在亮色出现；暗色全部 ≥4.5）

完整审计表：`contrast.tsv`（theme-dual，共 29 项 × 亮暗两套）和 `contrast-market.tsv`（市场列表态）。下表每一项都在 e2e 里钉了现值（±0.05），值一变测试就红，不会再被算成「全过」。

| # | 位置 | 我们 | 原版 ref | 说明 | 可选的修法 | 签收 |
|---|---|---|---|---|---|---|
| 1.1 | 会话里工具行的预览文字（`Bash  pip install …` 后半段的灰字） | **3.93** | 3.93（同 token text-tertiary） | 照原版。两席 GU 指出的就是这一项（旧审计误报为 16.61） | 改用 text-secondary → 5.8，但会比原版深 | |
| 1.2 | 审批卡里的命令代码块（绿字） | **4.36** | 4.36（green-primary on bg-quaternary，实测同值） | 照原版。本次新加的填充式代码块，用的是原版 token | 换深绿 → 需要新造 token，原版没有 | |
| 1.3 | 搜索面板（⌘K）输入框占位「Search…」 | **3.96** | 3.96（text-tertiary） | 照原版。修之前是 Chromium 默认灰 #757575（暗色只有 3.58，不达标），现已改成原版 token | text-secondary → 5.86 | |
| 1.4 | composer 占位「Message …」 | **3.96** | **2.49**（原版是 .40 透明度） | **比原版更清楚**，但仍低于 4.5。保留现状，没有为了「像」而降到 2.49 | 照原版降到 2.49，或升到 text-secondary 5.86 | |
| 1.5 | 侧栏条目副题（「Waiting for you: …」那行小字，选中行上） | **3.67** | 拿不到（对照台 fixture 里原版不显示副题） | 0.18 上游 token（text-tertiary 11px）。0.78.1 的值未验证 | 一行 CSS 改 text-secondary → 5.26 | |

已修好、不用签收的（同一轮审计查出来的）：
- 正文里的链接：原先是蓝色 accent，亮色气泡上 4.39。实测 0.78.1 气泡内链接是 text-primary，现已改成原版 → 14.76
- 暗色 composer 占位：旧审计在背景过渡动画中途取了样（bg=177，算出 1.47 的假值）。现在等过渡跑完再量，实际 5.34

## §2 审批卡

**本次已做（P5-41.f1）**：按 0.78.1 实测 DOM 补上分段结构：
- 标题条：laptop 徽标、「Computer」、右上 × 关闭钮。原版关闭钮的 aria-label 就是「Deny once」，所以关闭等于拒绝一次
- 标题和说明
- 填充式代码块：浅灰底、绿字、等宽字体，右上 Copy。不再是深色 1px 硬边框
- 按钮段
- 内边距放在各段上（16 / 标题条 14 16 / 末段底 16），与原版同口径

截图：`approval-card.{light,dark}.png`（卡片特写）、`approval-window.{light,dark}.png`（整窗）、`compare-conv-rest.light.{ref,app}.png`（与原版同 fixture 并排）。

**仍不同（请签收）**：

| # | 差异 | 原因 | 签收 |
|---|---|---|---|
| 2.1 | **位置**：原版卡片插在对话流里（跟在最后一条消息后面）；我们的卡片固定在 composer 正上方（dock） | 0.18 架构如此：卡片由 ProductionRenderer 挂在 composer 上方的 dock 位，transcript 行渲染器不产出审批行。挪进对话流要改 0.18 的挂载点和 transcript 的行类型，属于架构改动，不是换皮 | |
| 2.2 | **高度**：原版 252px，我们 224px（修前 180px） | 文案和按钮不同（见 2.3、2.4）；分段的内边距已与原版一致 | |
| 2.3 | **按钮**：原版是 Never · Always allow · Allow once，我们只有 Deny once · Allow once | 产品决定（L-AP A9④，P5-31）：bash/文件类没有「始终允许」；Never 在我们这里等于拒绝一次，不另设按钮 | |
| 2.4 | **文案**：原版标题是全局开关的口吻「Allow Grok Bot and all Bots to run commands on your local computer?」，加一句「This applies to … every Bot」；我们是「Allow Grok Bot to run this on your computer?」，加「Only this time…」 | 我们的作答只作用于这一次调用，照抄原版文案会误导用户 | |
| 2.5 | 原版卡片上方紧贴的「typing 三点」与卡片之间没有空隙；我们的 dock 与上方内容之间可能空出一段 | 和 2.1 是同一个原因：dock 固定在底部，transcript 内容不够长时中间就留空 | |

对照台处置：审批卡的 waiver 从 `waived:arch（属 P5-31）` 改为 `signoff:arch → 本单 §2`，不再指向已关闭的任务。

## §3 配置面板 / 新建对话框（原生表单）

**本次已做**：select、input、textarea 改用 composer 和市场搜索框同一族样式：secondary 填充、无硬边框、圆角 12、半像素描边、自绘下拉箭头、焦点环用主题 token。去掉了 textarea 的 resize 柄。截图：`config-pane.{light,dark}.png`、`new-bot-dialog.png`。

| # | 仍不同 | 原因 | 签收 |
|---|---|---|---|
| 3.1 | 下拉**弹出的选项列表**、新建对话框里的 **radio / checkbox 圆点和勾**仍是系统原生外观 | 原生控件的弹层和字形 CSS 改不了；要改就得换成自绘 listbox 组件（多一个组件和一套键盘逻辑）。0.78.1 的配置面板形态不同，没有这几个控件的直接参照 | |
| 3.2 | 「新建 bot」是我们自己的对话框（选 preset / 连接器 / 模型），0.78.1 没有对应页面 | 产品功能差异（P5-57 ②），只能参照原版 token 做外观 | |

## §4 市场（Connect apps）

**本次已做**：
- 可连接的条目排到列表前面，不再被一百多条「Not available」埋在首屏之下
- 当前页如果全是仅浏览条目，顶部显示一行引导：「Listings marked Not available have no install package…」
- 次级文字（Not available / 副题 / 计数）亮暗都 ≥4.5，见 `contrast-market.tsv`。「Not available」原来是 text-tertiary（亮色 3.96），R-04 没有给这段文字的颜色值，所以改为 text-secondary（5.86）。这是我们自定的，不是照原版

截图：`market-list.{light,dark}.png`（首行是已连接条目，排在一百多条 Not available 之前）。

| # | 情况 | 签收 |
|---|---|---|
| 4.1 | **未验证**：原版参照图是一张空白的过期帧（R-04 已披露），所以「市场三联 open=0」对市场来说是空对比。外观只按 R-04 静态规格对齐，没有可运行的原版画面可比 | |
| 4.2 | 默认 profile 没有目录源时显示空态「No catalog configured」。生产 profile 挂哪些目录源还没定（P5-57 遗留） | |

## §5 对照台覆盖面：两个视图标「未验证」

| # | 视图 | 情况 | 签收 |
|---|---|---|---|
| 5.1 | conv-running（运行中） | app 侧打开的是 Ops Bot 的挂起回合，ref 侧是 Main Bot。会话区不是同一场景，「运行中」观感（侧栏 persona 变三点思考）在对照台上没有可比画面，只靠 P5-56 的 e2e 支撑（9/9 帧 ΔRGB≤2） | |
| 5.2 | sidebar-collapsed（折叠） | ref 侧没打开会话（0.78.1 不点就不出会话），会话区没有可比内容 | |

对照台处置：这两组行从 `waived:data/fixture` 改为 `unverified:*`，**不计入 open=0 的覆盖面**。

## §6 GU 提到但本单未处理的（LOW，请决定是否另开任务）

| # | 项 | 签收（✓=接受现状 / ✗=开任务） |
|---|---|---|
| 6.1 | composer 少了左边「+」和右边麦克风（P5-52「零死入口」的有意取舍：两者都没有后端） | |
| 6.2 | 侧栏副题显示「Waiting for you: local-tool-permissi…」，把内部 kind 名露给了用户。0.78.1 在同场景下不显示副题 | |
| 6.3 | P6-03 的 14 张暗色截图是在 P5-58 settle 修复之前拍的，有过渡帧；d2-b/d2-d 左侧有一个孤立的时间戳 | |
| 6.4 | 折叠 rail 底部「Connect apps」图标：原版是 grid，我们是 plug | |
| 6.5 | 同名 bot 在 ref 和 app 两侧颜色不同（ref Main=蓝，app Main=绿）：头像颜色按 bot id 派生，fixture 的 id 不同。不是缺陷，并排看时请留意 | |

---

## §0 已修好、无偏差的（供核对，不用签收）

- **D2(b) 错误文案**：用户以前看到的是「回复失败：Cannot read properties of undefined (reading 'code')」，现在看到「回复失败：P6-03 boom」（注入的错误文本直接到达用户）。根因：e2e 脚本违反了 dsh 的 FinishReason 契约，写成 `{kind:'error', message}`，契约要求 `{kind:'error', failure:{code,message}}`，dsh-llm-retry 读 `failure.code` 时抛异常。产品链路（reduce → fold → shim → 0.18 渲染）没有丢文本。旧脚本加新断言复跑可以复现原问题。断言已收紧为「含注入文本 + 不含 JS 异常」。截图：`d2-b-error.{light,dark}.png`
- **WCAG 算法**：见 §1 开头；旧的「23 项全过、最低 4.94」作废，以本次 `contrast.tsv` 为准
