# MIGRATION-DELTA · Grok Bot 0.78.1 → 1.1.0（Q-063=B 迁移地图）

> manager 任务 A · 2026-11-15 · 时间盒 20 分钟，只做「已 RE 的 10+1 面」机械对照 + i18n 聚类 + keyframes/token diff。
> 材料：`deb0781/asar/`、`deb110/asar/`（只读）、`i18n-added-110-vs-0781.txt`。
> 脚本与中间产物：`harness/`（`delta.py` keyframes/CSS 变量/原子类；`anchors_generic.py` RE 文档反引号/引号锚 → 1.1.0 是否仍在；`named_classes.py`；`probe.py` 定点取上下文）。输出在 `harness/out/`（`summary.txt`、`keyframes.tsv`、`tokens.tsv`、`anchors-*.tsv`、`generic-*.tsv`、`chunks-*.txt`）。
> 复跑：`python3 -I harness/delta.py deb0781/asar deb110/asar harness/out ../grok-0.79.3-re/RE-*-0.78.1.md ../persona-stop-gap/RE-STOP-0.78.1.md`

## 0. 结论先行

1. **我们已 RE 的面，1.1.0 基本没动。** 10+1 份 RE 文档的真实锚（在 0.78.1 产物里能找到的字符串/类名/token）共 ~2600 条，1.1.0 里消失的除 chunk 文件名（哈希换了）和压缩变量名外，**真消失只有约 20 条**，集中在：Bot 管理/技能入口文案、Microsoft 组织登录、对话框入场 keyframes、设置面板关闭钮类名。滚动跟随、审批卡、connector grant、stop、composer、设置七区导航、描边 token **逐字未变**。
2. **所以已验收合并的单一律不返工**；0.78.1 锚继续有效，RE 文档不重写，只在受影响处加「1.1.0 增补」节（见 §3）。
3. **1.1.0 的变化主要是新增面**，不是改旧面：tasks（任务岛/侧栏任务列表/routine/outcome/factory）、spotlight 全局搜索、Team Bot、手机/iMessage 绑定、用量重置与邀请、购物/出行卡、反馈（Good/Bad response）、数据共享/Privacy Mode、per-tool 四档权限。这些在我们这边全部「未做」，不存在返工问题，只存在要不要做（→ 需求问题，不是迁移问题）。
4. **一个需要注意的全局变化**：`--cursor-*` 调色板整体换值（ui 库侧，含暗色 `--cursor-sidebar #181818→#101010`、`--cursor-accent`、diff 色、terminal ansi）。`--sand-*` 描边/文本 token 不变。我方源码消费 `var(--cursor-*)` 约 1330 处（recovered 树），但**值定义集中在 `app/ui/renderer-grok/overrides/p5-55-palette.css`**（+ `runtime-theme-token-installer.ts` 4 处）——迁移只改定义处，做一次值迁移（单 T97，见 §4）。

## 1. 机械对照总账

| 指标 | 0.78.1 | 1.1.0 | 变化 |
|---|---|---|---|
| @keyframes | 147 | 188 | 同名同体 143 / **改体 0** / 删 4 / 增 45 |
| CSS 自定义属性 | 1564 | 1607 | 同 1451 / 改值 111 / 删 2 / 增 45 |
| 原子类（sand-/ui-） | 9583 | 10349 | 保留 9205 / 删 378 / 增 1144 |
| 语义类名（非哈希） | 44 | 43 | 删 `ui-prompt-input-editor__content` |

删掉的 4 个 keyframes：`ui-9ekpj0-B` / `ui-fh2zsw-B`（ui 对话框入/出：translate(-50%,-50%) scale .97↔1）、`sand-1bzi508-B`（market 面板 ty6px）、`sand-1fiuodg-B`（撤回微件 margin-top -20px）。1.1.0 新增同形态体 `sand-cyaqxc-B`（opacity 0 scale .97→1，无 translate）/ `sand-n0m8po-B`（退场 scale→.97）、`sand-rk560n-B`（margin-top -10px）——**推定**是同一处换实现（定位方式改了，参数仍 .97），哪个组件消费未配对。

## 2. 面对照表（核心交付）

锚命中率 = 该文档在 0.78.1 产物里能找到的锚，1.1.0 仍能找到的比例（`harness/out/generic-*.tsv` / `anchors-*.tsv`）。

| 面 | 0.78.1 锚（文档） | 1.1.0 锚 | 结论 | 影响的单 | 优先级 |
|---|---|---|---|---|---|
| 边框/描边 | RE-BORDERS：4 级 hairline token、composer `.5px`、radius `${u?18:22}px` | token 43/43 值全同；composer 仍 `radius(${d?18:22}px)`，**新增 `frameRaised` 态**（`isRaised` prop） | 不变；+1 新态 | 已合并的描边单不返工；frameRaised 记提议 | P2 |
| 设置 | RE-SETTINGS：七区 nav `general/computer/vault/usage/updates…`、路由表 | nav 映射逐字同；**usage 区新增子节** `my-plan/usage-limits/additional-usage/usage-resets/grok-bot-usage`；**删** Microsoft 组织登录四串（Guest organization / Link another organization / Microsoft organization ID / Organization tenant ID），新增 `Microsoft Entra application ID:`；新增 Data sharing / Privacy Mode / Help improve Grok Bot | 骨架不变；usage 与账号区有增删 | 「设置七区骨架」提议（未开单）开单时按 1.1.0 锚；我们没做 MS 组织登录，无返工 | P2 |
| 连接器 | RE-CONNECTORS：Connect 页分节、预设表 | 309/329 命中；删 `Your other devices are in Settings › Manage devices`（实为 `›` 转义，**仍在**）；新增 Google/Microsoft apps 分组、per-Bot connectors、`Use individual accounts` / `Each person connects their own`、`chunk-mcp-server-connector`、`chunk-blocked-connectors-gate`、连接器错误文案（stdout / PATH / mcp-remote） | 主体不变；新增「按账号组分组」+ 团队管控 | **T73d 按 0.78.1 锚开，不受影响**；MCP 错误文案三条可顺手对齐（提议） | P1（错误文案）/ P3（分组） |
| connector grant 审批卡 | RE-CONNECTOR-GRANT：split「Always allow」默认 `always_this_bot` + Allow once + Skip | `useState(\`always_this_bot\`)` 逐字同；`always_all_team_bots` 同；删 `Use your own account` | 不变 | 已合并 T73b/T73c 不返工 | — |
| 工具审批（approval model） | p5 RE-approval-model：Allow / Always allow / Don't allow、`localToolPermissionCeiling` | 按钮文案同；`localToolPermissionCeiling` **消失**；新增「Choose Auto-review, Needs approval, Blocked, or Always allow for each tool」「Allow reads」「Read-only is on…」「Blocked by the team's MCP allowlist」 | 卡片不变；**设置侧权限模型改成 per-tool 四档**（未深挖） | 现有审批卡不返工；per-tool 四档 → 新 RE 单 | P1（先 RE） |
| 提问卡 | p5 RE-question-card | 120/125 命中，仅 `m.dismissOnMoveOn` 压缩名变 | 不变 | **T40c 按 0.78.1 锚继续** | — |
| 消息操作 | RE-UI-FACES §4：hover 条 Add reaction + More、Reply 在 More 菜单 | `Add reaction` 同；**新增** `Good response` / `Bad response` / `How was this response?`（反馈）、CSS 变量 `--sent-message-actions-pointer-events` | 主体不变；**多了点赞/点踩反馈**（是否在 hover 条未配对） | T91 系列 / T95 不返工；反馈钮 → 新 RE 后再定 | P2 |
| Bot 管理/技能 | RE-UI-FACES §3：Add custom skill / Import existing skill / Browse shared Bots / Bot label / Shared with others | **以上五串删除**；换成 `Add from your skills` / `Search your skills` / `Write a new skill` / `Browse Team Bots` / `Bot details` / `Bot configuration` / `Bot's vault` / `Learned rules`；新 chunk `team-bot-*`、`shared-bots-browse`、`bot-manage-*` | **改了**（文案 + 入口重组） | **C4（Bot settings 五区，等 Q-061）须按 1.1.0 重新 RE 再拆**；我们现有 info pane skill 入口（T7b）文案按 1.1.0 改（小） | P1（C4 开单前） |
| 快捷键 | RE-KEYBINDINGS：21 命令 | 185/199 命中，消失项全是压缩名；**新增 spotlight**（`chunk-spotlight`、`Search Bots, Chats, Settings...`） | 21 命令不变；+全局搜索面 | **T94 已合并不返工**；spotlight 的快捷键未取证 | P2 |
| 动效 | RE-MOTION：147 keyframes、G1-G7 | 143 同体；删 4（§1）；+45（多为 tasks 岛 clip-path、spring 弹出、抖动） | 已 RE 的动效不变；对话框入场换实现（仍 .97 scale） | T83/T84/T86/T87 不返工；**T87 遗留提议「pb-dialog 是 scale 不是 wipe」在 1.1.0 同样成立**，T87b 按 `sand-cyaqxc-B` 参数 | P2 |
| 布局 | RE-UI-LAYOUT：六面、`sand-settings-panel__close`、`--sand-view-stage-top: calc(60px+24px)` | 113/115；`sand-settings-panel__close` 删（改为 `sand-settings-panel-${id}` 动态 id）；**新增** `--sand-sidebar-rail-width:88px`、`--sand-floating-controls-start`、`--sand-leading-chrome-inset`、`--sand-nav-bar-inset`、`--sand-view-stage-top:48px` 新档、tasks 岛 `--tasks-peek-*` | **侧栏新增 rail 形态 + 浮动控件**（收起侧栏时？未配对） | 已合并布局单不返工；T96（侧栏多选）开单前查 rail；设置关闭钮选择器若写死 `__close` 的 spec 要改 | P1（rail 先 RE） |
| stop | RE-STOP：`Your Bot stopped what it was doing.` | 154/157，文案同 | 不变 | T81b/c 不返工 | — |
| 滚动跟随 | RE-MOTION 1.7：`!isPinnedToBottom && distanceFromBottomPx>80 && !isCovered && !showsJumpToLatestPill` | **逐字同**（`Njn`），`scrollToBottom` 跟随状态机 `revealing/following` 同 | 不变 | **T85c 按原方案继续**（阈值 80 仍对） | — |
| 覆盖度地图 | RE-COVERAGE-MAP | 62/67，消失项全是 chunk 名 | 地图需加 1.1.0 新面行 | 见 §3 | P2 |
| 调色板 | （RE-visual / p5-55-palette） | `--cursor-*` 111 处改值（见 `harness/out/tokens.tsv`） | **改了** | 定义处 `overrides/p5-55-palette.css`；新单 T97 | P1 |

## 3. i18n 新增 535 条按面聚类（关键词启发式，`harness/` 内联脚本，数字是近似）

| 面 | 条数 | 代表串 | 我们是否有实底 |
|---|---|---|---|
| Team Bot / 分享 / 技能 | ~55 | Browse Team Bots、Add from your skills、Learned rules、Team Bots work alongside your team | 有一部分（skill 入口）→ 文案迁移 |
| 手机 / iMessage / SMS 绑定 | ~59 | What's your number?、Link your phone、Now in iMessage | 无 |
| 连接器 / MCP | ~48 | Connect more Google apps、Use individual accounts、mcp-remote 错误、Privacy Mode | 有（Connect 页）→ 错误文案可对齐 |
| 任务 / routine / outcome / factory | ~46 | New task、Filter tasks、Needs you、New routine、Run by hand、Your Bots can work as a factory | 无（新面） |
| 购物 / 出行 / try-on | ~34 | Add to cart、Cheapest nonstop、Creating your try-on | 无（不做） |
| Teams / Slack | ~32 | Add to Teams、Search Slack channels | 无 |
| 用量 / 重置 / 邀请 | ~32 | Use a reset to keep going now、You can send up to 20 invites a day | 无（我们无计费） |
| 搜索 / 导航 / 离线 | ~19 | Search Bots, Chats, Settings...、You're offline、Back to chat | 无 → spotlight 候选 |
| 语音 / 通话 / 录制 | ~15 | Live transcript、Microphone isn't recording | 无 |
| 设置 / 隐私 / 反馈 | ~13 | Data sharing、Good response、How was this response? | 无 |
| 审批 / 工具权限 | ~7 | Choose Auto-review, Needs approval, Blocked, or Always allow for each tool | 有（审批卡）→ 先 RE |
| 其他（未归类） | ~176 | 杂项与占位键（appCount、skillName…） | 未对照 |

**i18n key 迁移**：1.1.0 的 i18n 是同一套 id→文案表（`"vHRDVH":["Your Bot stopped what it was doing."]` 两版同 id）。我们落了实底的面（stop、审批卡、connector grant、提问卡、reaction、快捷键帮助）抽查文案全部同 id 同文案，**无需映射**。要改的只有 Bot 管理/技能入口五串（§2 Bot 管理行），按 1.1.0 新串直接换，不做 key 映射表（我们没有 id 体系，只有字面量）。

## 4. 处置（写进 queue.md 2026-11-15 节）

- **RE 文档**：不删 0.78.1 版。全部「不变」面不加任何东西（本表即证据）。改了的三面写**新文件**而不是增补节，因为都是新内容不是修订：`RE-BOT-MANAGE-1.1.0.md`（C4 前置）、`RE-RAIL-TASKS-1.1.0.md`（侧栏 rail + tasks 岛）、`RE-TOOL-PERMS-1.1.0.md`（per-tool 四档）。调色板不写 RE，直接是 T97 的输入（`tokens.tsv`）。
- **在途单逐单判定**：T85c 继续（锚逐字同）；T40c 继续；T73d 按 0.78.1 锚开（锚同）；T90b/T90c（composer 建议面板/@）继续（composer 只多 frameRaised）；T63 与 UI 无关；T83 三批 blocked 不变；T91 系列/T95/T94 不返工；T87b 提议按 1.1.0 `sand-cyaqxc-B` 定参；T96 开单前先等 RE-RAIL；C4 等 Q-061 且须先 RE-BOT-MANAGE。
- **未对照待后续**：① 新 45 个 keyframes 的组件配对；② `sand-cyaqxc-B` 实际消费组件（推定对话框）；③ spotlight 快捷键；④ 反馈钮位置；⑤ 侧栏 rail 何时出现；⑥ 删掉的 378 个原子类逐个归属（除已列面外未查）；⑦ 「其他」176 条 i18n；⑧ electron-main / coordinator / local-exec-daemon 未 diff（只 diff 了 renderer + main 字符串）。

## 5. 更正节（2026-11-15 深夜，R1/R2/R3 与 T97① 落地后）

本文件 §0-§4 是时间盒 20 分钟的机械对照，后续深挖推翻了三处，以本节为准：

1. **§1/§2 T87b 参数行**：`sand-cyaqxc-B`/`sand-n0m8po-B` 是 **spotlight 对话框**专属（chunk-spotlight-app-FTVveRyH.js），不是通用对话框换实现；设置对话框 1.1.0 仍用 `translate(-50%,-50%) scale(.95→1)` spring 内联（RE-RAIL-TASKS §4）。已执行侧：T84 按此修（pb-dialog 回 scale 族）。
2. **§2 工具审批行**：per-tool 四档（setMcpToolPermissions schema）**0.78.1 就有**（非 1.1.0 新增，两版逐字同构锚 _Ne/MYe）；`localToolPermissionCeiling` 也没消失（两版同构消费）。1.1.0 真实增量=读豁免层+allowlist 文案+bulk 对话框（RE-TOOL-PERMS）。**后续开单口径：按 0.78.1 锚复刻+叠读豁免层**。
3. **§0/§2 调色板行 + §4 M1**：tokens.tsv 的 111 changed 全是 index css **chrome 层**（ui 库），与 palette 真源（eager-app/common JS **sand 主题**）两套无交集；sand 主题 0.78.1→1.1.0 **零漂移**（tokens-diff-0781-vs-110.tsv：primitives 79×2/opacity 53/语法层 61/组合函数全同构）。T97 原「换 111 值」使命不成立；已执行侧=T97a（修 0.78.1 求值器 2 bug：bright-black 2 错值+补 12 条，palette ≡ 1.1.0 求值 0 差 @ 0b32b9b0）。chrome 层判「不适用」的准确理由（经理核实）：palette 自带 chrome token 41 条重叠里 38 条 [data-theme] 覆盖已 0 差、剩 3 条 :root 1.1.0 只是改间接引用算值不变——3 条记提议不开单。
4. **§4 R1/R2/R3**：三份 RE 已 done（RE-BOT-MANAGE / RE-RAIL-TASKS / RE-TOOL-PERMS，均本目录）。R2 附 rail=easy-mode 分层状态机（solo 隐藏/few rail/many 传统）；R1 附 T98 映射（3 处已执行 @ 333561c5）。
