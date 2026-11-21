# computer use / browser use 显示回传：测试清单（BRIEF 第 2 项）

> 立项：manager (Opus 5.5)，2026-11-09，任务 A。只是清单，不是修：每行是「bot 用了某种能力 → UI 上看到什么」的一条链。
> 用户原话：「一一去测试剩下的, 比如computer use, browser use的显示回传等等一系列的问题. 他会交付电脑.」
> 「他会交付电脑」= 原版 Grok Bot 给每个 bot 一台自己的电脑（ForeverBox，VNC 可看），bot 在上面开浏览器、截图、操作，用户能实时看、能接手。

## 0. 先说结论（探针事实，均纯读）

1. **我们现在没有 computer use，也没有 browser use 工具。** 生产主 bot 首个 request header 的工具表（`~/.local/state/hivebot/dsh/sessions/*3815aef0*/session-*` 第一条 `request/header`）共 31 个：`ask_user_question bash create_goal edit get_goal glob grep interrupt_agent job_* list_agents list_subagent_models present read read_image request_network schedule_* send_message skill subagent subagent_fork todo_write update_goal web_fetch workflow working_directory write`（T34 后另加 create_bot / send_to_bot / stop_bot）。没有 `web_search`，没有任何点击、截图、导航类工具。生产全部会话里实际调过的：web_fetch 34、glob 7、bash 5、send_message 4、subagent 4、write 3、read 2、create_bot 1、list_agents 1、working_directory 1。
2. **dsh 自己的 computer use 只支持 macOS**：`@deepseek-ai/dsh-cua-bundle@0.2.2-alpha.2` README「Computer Use is available only on a macOS DSH Host」，`cordis.patch.yml` 里 `disabled: !!js process.platform !== 'darwin'`，而且只装进 PTC preset 的会话。本机是 Linux，这条路走不通（Windows「in development」）。
3. **dsh 的「浏览器」是给人用的**：`dsh-client-ui-sidebar-browser` 是右侧栏网页标签（人看），不是模型工具；在 `app/sdk/profile/patches/p2sdk.yml:144` 已关（我们用的是 Grok 渲染层，不是 dsh web UI）。模型侧的 web 只有 `dsh-tool-web` 的 `web_search`/`web_fetch`，生产只拿到 `web_fetch`（`web_search` 没进工具表，原因未查，疑似依赖 `dsh-web-search-deepseek` 的账号搜索后端；`ui-settings-web-search` 也关着）。最新 header 34 个工具已核（含 create_bot / send_to_bot / stop_bot）。
4. **原版（0.79.3 / 0.18 重构源码）的呈现件，我们大多有零件、没数据**：
   - 工具：`Computer`、`Screenshot`、`UiMap`、`BrowserSecureFill`（`/tmp/grokbot-0.79.3/agent-tools.txt`；RE-FULL-0.79.3.md:182）。
   - computer-use subagent（`subagentType==='computerUse'`）绑定 ForeverBox，卡片动作 `openBox/handBack/dismiss`，打开即 VNC 实时画面（RE-UI-0.79.3.md:139）。
   - 0.18 重构源码里在的：`frontend/src/recovered/features/computer/shell/{view,controller,model,vnc-webview}.tsx`（会话头电脑按钮 + info pane + VNC）、`computer/overlay`（在**用户自己电脑**上操作的光标覆盖层）、`computer/teach-recording`、transcript 的 box 卡（`cards/transcript-card/attachment-data.ts:37` `kind:'box'` 带 `boxSnapshot` 截图）、头像状态 `on-its-computer` / `on-your-computer`（`workspace/agent-avatar.tsx:44-45`）。
   - 我们：`overrides/modules/computer-view.tsx` 把 `ComputerHeaderControl` / `ComputerInfoPane` 置空（P5-52，「我们没有 ForeverBox」）。
5. **我们这边已有的「过程回传」链**（T21-T23 做的）：主聊天只留首答 + 终答；过程进 outline 侧板（`shim/src/outline.ts`：tool-call 行 = 工具名 + 状态 pending/done/failed + 120 字摘要，摘要取实参文本）；状态行短语 + 头像状态由 `shim/src/agents.ts:57-66` 把 dsh 工具名映到原版名（web_fetch→WebFetch→searching，bash→Shell→working…）。
6. **图片回传是断的**：`renderer/session/reduce.ts:202-206` 的 tool/result 只取 `type:'text'` 块（`contentText`，`:119-125`），图片块整块丢；outline 摘要只取实参。所以就算 bot 截了图、或 `read_image` 读了图，UI 里也看不到图。

## 1. 测试清单

**测法**：生产实例里对主 bot 说「提示词」一栏那句话（新建一个普通 bot 测也行，避免主 bot 强制委派把活派给 worker——派了也照测，记下派没派）。看三处：主聊天、状态行 / 头像、outline 侧板（会话「…」菜单 → Show full conversation）。记原样回复 + 截图。**原版**列是 0.79.3 / 0.18 的呈现；**猜测**列是经理按代码推的，测之前的预期，测出来不一样就是发现。

### A. browser use（看网页、搜索、操作网页）

| # | 测什么 | 提示词（示例） | 原版呈现 | 我们现状猜测 | 依据 |
|---|---|---|---|---|---|
| A1 | 读一个网页 | 「打开 https://example.com 告诉我标题」 | 状态行 browsing/searching 短语，头像 reading；过程在 outline | **能用**：web_fetch → 状态行 searching 短语；outline 一行 `web_fetch` + URL；终答正常 | 生产 34 次 web_fetch；agents.ts:61 |
| A2 | 网页搜索 | 「搜一下今天的 GPT 新闻」 | WebSearch 工具，状态行 searching | **工具不存在**：bot 改用 web_fetch 抓搜索引擎页，或说做不到；要记它怎么说（有没有假装搜过） | 工具表无 web_search |
| A3 | 需要 JS 渲染 / 登录的页面 | 「看看 linux.do 首页最新的帖子」 | 在 bot 电脑的浏览器里开 | **多半拿不到或拿到空壳**：web_fetch 只是 HTTP GET；记返回内容是否像真页面 | dsh-tool-web 描述 |
| A4 | 网页上点按钮 / 填表 | 「去 example.com 点 More information 链接，告诉我跳到哪」 | Computer / BrowserSecureFill，VNC 可看 | **做不到**：无点击类工具；看 bot 是否诚实说做不到，还是在 bash 里装 playwright 硬来 | 工具表 |
| A5 | bash 联网要审批 | 「用 curl 抓一下 https://example.com 的响应头」 | 审批卡 | **能用**：request_network 审批卡显示完整原因（P5-31）；允许后结果进 outline | entries.ts:64-68 |
| A6 | 终答里的链接 | A1 的终答里带链接时点它 | 外部浏览器打开 | 待测（markdown.spec 覆盖过渲染，没覆盖点击去向） | — |

### B. computer use（bot 自己的电脑 / 你的电脑）

| # | 测什么 | 提示词（示例） | 原版呈现 | 我们现状猜测 | 依据 |
|---|---|---|---|---|---|
| B1 | bot 有没有「自己的电脑」 | 看会话头 | 会话头电脑按钮 → info pane（电脑状态、升级、重置） | **没有**：按钮被置空 | computer-view.tsx |
| B2 | 让 bot 在它电脑上开浏览器 | 「在你的电脑上打开浏览器搜一下天气，截图给我」 | computer-use subagent → 任务卡 → 点开 VNC 实时画面；可 handBack 接手 | **做不到**：无 box、无 VNC；看 bot 怎么回（bash 里找 chromium？有没有 DISPLAY？沙箱里大概率没有） | §0-1/2 |
| B3 | 截图回传 | 「截一张你当前屏幕的图发我」 | box 卡带截图（`boxSnapshot`） | **图出不来**：就算 bash 截到文件，tool 结果图片块被丢；最好情况是终答里给一个文件路径 | reduce.ts:202-206 |
| B4 | 读图 | 给 bot 一张图（附件）让它描述 | — | **模型能读、UI 不显示 read_image 的图**；outline 只有一行 `read_image` + 路径 | contentText 只收 text |
| B5 | 交付文件 | 「写一个 hello.html 交给我」 | 交付卡（文件 + 打开） | 待测：`present` 工具（dsh-tool-present）在我们 UI 里只会是 outline 一行；有没有交付卡 / 可点文件链接 | 我们 shim 里无 present 特判 |
| B6 | 操作**你**的电脑 | 「帮我把桌面上的截图文件夹整理一下」 | `on-your-computer` 态 + 用户屏幕上的光标覆盖层（overlay），每个应用先问权限 | **没有**：只有 bash 在工作区沙箱里；看 bot 是否说清楚它碰不到桌面 | computer/overlay 未接 |

### C. 过程回传（A、B 共用的那条链）

| # | 测什么 | 怎么测 | 原版 | 现状猜测 |
|---|---|---|---|---|
| C1 | 状态行短语随工具变 | A1 / A5 时盯状态行 | 新活动停 ≥800ms 才切，working 5s 轮换，满 60s 加 elapsed | T23 已做，**能用**；记 web_fetch 时显示的是哪句 |
| C2 | 头像状态 | 同上 | searching / reading / working / on-its-computer | web_fetch→searching、bash→working；**没有 on-its-computer**（无对应工具） |
| C3 | outline 工具行 | A1 后开 Show full conversation | 每个调用一行，可展开看结果 | 行有、状态对；**展开后看不到结果正文**（只有 120 字摘要，取的是实参）——要确认 |
| C4 | 工具失败 | 「抓一下 https://nonexistent.invalid」 | 失败态 + 原因 | outline 行 failed；主聊天是否有提示、终答是否如实说失败 |
| C5 | 长任务 | 让它抓 5 个网页做对比 | elapsed、可中断 | 满 60s 显示 elapsed；中断按钮是否可用 |
| C6 | 派给 helper 去做 | 对主 bot 说 A1 | 任务卡 + outline 每个 subagent 一个 tab | helper 进 Workers（T36）；**outline 没有 per-subagent tab**（T27 阻塞），要点进 helper 行才看得到过程 |

## 2. 怎么用这份清单

1. 主 agent 在生产实例逐行跑（建议一个普通 bot 跑 A/B，主 bot 跑 C6），每行记：原样回复（≤3 行）、截图路径、实测 vs 猜测（一致 / 不一致）。结果写回本文件新加的「实测」列，或 `work/exp-polish/evidence/CU/` 下截图 + `RESULTS.md`。一次跑完再回来找经理，不要边测边开单。
2. 预计结论分三类，经理按实测拆单：
   - **呈现断点（小单）**：B3/B4 图片块被丢（reduce + outline 收图片块、outline 行展开显示缩略图）；C3 结果正文看不到；B5 交付卡。这些不依赖新能力，测完就能开。
   - **能力缺口（要立项）**：A2 web_search、A3/A4 浏览器操作、B2 bot 自己的电脑、B6 你的电脑。按搬运阶梯，先查：dsh-mcp-client 接一个在维护的浏览器 MCP server（如 Playwright MCP）能不能当 A4/B2 的第 1 级；Linux 上无头浏览器 + 截图能不能顶 B2/B3 的「看得见」。这一类写进 BRIEF 第 4 项（功能匹配）一起排，不在本清单里定。
   - **诚实性（提示词）**：A2/A4/B2/B6 bot 是否假装做到。若假装 → 归 BRIEF 第 5 项「系统提示词微调」。
3. 测试不跑 e2e、不改代码；生产实例照常用，回合中不重启。
