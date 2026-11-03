# BRIEF · p5-parity（UI 对齐原版 + 审批自主化）

v1 · 2026-11-03 · director（Opus 5.5）· MVP 后第一个 slug
输入：QUESTIONS Q-012 答复（用户 2026-11-03 原话，见 §1）、`p4-ui/BRIEF.md` v1.3（下称 P4B）、`p4-ui/RE-visual-audit.md`（下称 AUD）、`p1-re/RE-features.md` L91、`p3-contract/CONTRACT.md` v1.4（下称 C）§4/§8、`p2-sdk/PLAN.md` T-07/T-12、Q-008/Q-009、`app/sdk/profile/patches/approval.yml`、`app/sdk/src/policy/shell-ask.mjs`、LEARNINGS。
编号说明：roadmap 原「P5 远程与云端 / P6 其他功能」顺延一位，由主会话更新 `roadmap.md`。

## 1. 目标与需求证明

用户原话（2026-11-03，Q-012）：「现在我们打算把UI先打磨到Grok Bot一致的level. 然后主bot部分, 现在覆盖了哪些功能? 我记得Personal Agent是不会比如说权限也好, 这些其实是不会给Grok Bot去做的……一般是bot自己去完成, 只有一些问题会询问. 这种调整, 可能是我们要去做的.」

两条主线，用户给的优先级是 **UI 先、审批后**：
- **L-UI 视觉对齐**：把 P4 的 4 页 + 审批卡从「token 级对齐」（P4B §1 当时的口径）推进到「与原版并排对照看不出明显差异」。
- **L-AP 审批自主化**：bot 在自己的边界内直接动手，只有越界时才问用户。对应原版的分级模型（RE-features L91）。

**需求证明**
- **谁用**：用户本人，私用。
- **现在怎么凑合**：默认 preset 下每条 bash 都要点一次「仅批准这一次」（shell-ask，approval.yml；P4B D3 写明「UI 没有始终允许入口」）。让 bot 做一件 5 步的小事，用户就得点 5 次，bot 等于被拴在人手上。这正是用户说的「不会给 Grok Bot 去做」的反面。
- **凭什么换**：原版把安全边界放在档位（ceiling NEVER/ASK/ALWAYS）和常驻授权（standing grants）上，不靠每次弹窗。我们的 dsh 自带 bwrap/Landlock 沙箱（`repos/deepseek-harness/packages/sandbox/sandbox/src/roots.ts:9`，本机有 `/usr/bin/bwrap`），可以把「人点一下」换成「OS 拦得住」。后者能自动化证伪，比人工确认更可靠。
- **没证明的部分**（写进 §9 和 §10，不假装成立）：① 沙箱在本机是否真的拦得住写越界、网络和凭证读取（R5）；② 原版的默认档位到底是什么（R1）；③ 原版登录后的真实外观，目前没有运行态截图（AUD 局限 2，RE-ui-shell L3），L-UI 的「一致」缺少基准（§9-Q2、R3）。

**附：用户问「主 bot 现在覆盖了哪些功能」**（答复给主会话转述，不在本 slug 范围内）
| 能力 | 原版 0.78.1（RE-features §1） | 我们现在（C §5 思路②） |
|---|---|---|
| 主 bot 指针 / 保底创建 | `main_agent_id` + ensureDefaultMainAgent | 有：`bots.json.mainBotId`，冷启动没有就建（#3 + #20） |
| 置顶、不可删 | 未见删除保护（RE 未知项 b） | 有：置顶，UI 不提供删除 |
| 建 / 管子 bot（CreateAgent、MessageSubagent、SendToAgent） | 运行时工具 | 无 |
| 记忆（RecallMemory、记忆列表） | 有 | 无 |
| 自主执行 / 分级审批 | 有（ceiling + standing grants） | 无：每条 bash 都要问，**本 slug L-AP 补上** |
| 设主 bot（SetPrimaryBot 工具） | 有 | 只能由冷启动自动指定 |

结论：目前主 bot 只是带标记的普通 bot。协作类工具（建子 bot、跨 bot 发消息、记忆）属于 P6 候选，不进本 slug。

## 2. 范围模式：HOLD（两条线各自加硬边界）
用户点了两件事，照单做好；不扩到 Spend、autoReview、协作工具，也不砍掉其中任何一条线。之所以不选 EXPAND，是因为两条线都有「没有基准就会无限打磨」的风险（§4），需要的是收口，而不是找 10 星体验。
- **L-UI 的边界：只修有证据的项。** 范围 = AUD 的残余项（U-27 之后仍未修的，R8 给出闭集）+ 0.78.1 特有项（R2 给出数值）+ 动效（R2）+ §2.1 准入的「静息态可见、纯前端」缺口。没有锚点（0.18 源码 / 0.78.1 bundle / 参照截图）的改动一律不做。
- **L-AP 的边界：只做本地工具这一层。** 包括档位、卡片三态、常驻授权的持久化 / 列表 / 撤销、每个 bot 独立工作目录。不做 autoReview、连接器 OAuth 授权、Messages 授权、虚拟卡、花费仪式（云依赖），也不做团队 ceiling 管理。

### 2.1 L-UI 范围外缺口的准入规则（机械，不逐项讨论）
U-27 判为「范围外」的 19 项，满足以下全部条件才准入：① 4 页静息态下可见；② 只改前端，不需要新增后端能力或接口；③ 有锚点。
据 AUD 预判准入：A2 搜索（只过滤本地 bot 列表）、A13 侧栏折叠态、B7 thinking 行、B13 独立会话头 + Working 小标（推翻 PAB R0 的 38px 合并，属品味项，交 GU）、B14 时间分隔 / 未读线、B15 代码块复制、E5 0.5px 细边。
预判不准入：A12 pin 拖拽、A16 账号 footer、B11 mic / 附件、B16 消息 hover 菜单（Reply 没有后端）、C3/C6 字段编辑与头像、D5 过滤菜单、D11/D12 私有技能。
最终清单以 R8 的残余表为准。

## 3. 路线（强制双方案，针对 L-AP；L-UI 没有路线之争，只有基准问题，见 §9-Q2）

| | 路线 1 · 沙箱即边界（**选**） | 路线 2 · 问 + 学（Claude Code 式 allow 规则） |
|---|---|---|
| 做法 | 新 bot 的 cwd 固定为它自己的工作目录 `$PBOTS_DATA_DIR/workspaces/<botId>`。沙箱内的普通 bash 和文件读写直接执行（ALWAYS）；越界时（`sandbox_permissions` 升权、写到工作目录外、联网，视 R5 结果）走 ASK；凭证路径和权限 preset 切换为 NEVER。连接器工具按读写分档（读 ALWAYS、写 ASK），ASK 卡片提供「始终允许」，按 bot × 工具记住；bot 设置页可以列出、撤销 | 保持全部 ASK，只给卡片加「始终允许」，持久化命令前缀 / 工具规则，用户点一阵子之后逐步变安静 |
| 对上原版 | ceiling 档位 + 卡片 APPROVED/DENIED/ALWAYS + standing grants + 读写分开（RE-features L91） | 只对上卡片三态 |
| 代价 | 安全性取决于沙箱真的生效（R5）；要把 shell-ask 从「必问」改成按档位查表（SDK 策略泛化）；cwd 要由 main 强制（契约变更） | 第一天的体验和现在一样；bash 前缀规则有已知坑（`git status && rm -rf …`），要做复合命令拆分，等于自建一个小解析器 |
| 可证伪性 | 越界、凭证、联网都能用 E2E 自动打（A2–A4） | 「点得够多就安静了」没法证伪 |

**放弃路线 2 的理由**：它保留了用户抱怨的摩擦，等于没回应 Q-012。前缀匹配还要多造一个解析器，安全上也更脆。路线 2 里有用的那部分（ASK 卡片上的「始终允许」）已经并进路线 1，只按 bot × 工具名记，不做命令前缀，所以没有解析器。
**路线 1 的前提**：R5 必须证实本机 bwrap/Landlock 能拦住写越界，并且有办法拒读凭证路径。R5 否定的话，路线 1 退化为「沙箱内 ASK + 始终允许」，带着数据回 G1，不硬上。

**上游复用（已查）**：dsh 的 `ApprovalOutcome = 'allowed-once'|'rejected'|'cancelled'|'unavailable'`（`user-approval/src/types.ts:32`），**没有 always**。`ui-approval` 的 `onAlways` 只有 experimental/cua 一个调用方（`cua/src/client/ApplicationApproval.tsx:44`）。所以「始终允许」的持久化和匹配要我们自己写一层，正确位置是现有的 `tools/pre-execute` 策略（shell-ask 泛化）。规则格式先让 scout 找在维护的上游（R6），不凭空设计。

## 4. 逆向一问：三个月后失败，最可能的死因
1. **自主权漏出去**（L-AP，最致命）：bot 免审批地 `cat` 到凭证、把 key 带进 transcript，把文件写到工作目录外，或者改写自己的授权文件（自己给自己加「始终允许」）。还有一个隐患：现在 session/create 不传 cwd（`app/ui/main/m3-meta/orchestrate.ts:118` 只在调用方给了才传），沙箱根可能是 HOME 甚至本项目仓。防线：A1 独立工作目录；A3 凭证哨兵用 T-08 扫描器复用；A4 授权文件不在 bot 的可写范围；A8 旧 bot（cwd 不在 workspaces/ 下）一律保持全 ASK；A9 策略文件损坏时退回全 ASK（fail closed）。
2. **没有基准的无限打磨**（L-UI）：没有登录后的截图，GU 席只能凭感觉判「像不像」，一轮接一轮。防线：§2 证据准入、R8 闭集残余表、U2 数值断言、GU 只跑 1 轮（CLAUDE.md §3 UI 档）、§9-Q2 请用户给参照截图。
3. **改了还是很吵**：沙箱把常见操作（`pip install` 要联网、写 `/tmp`）都判成越界，用户照样点个不停，体感没变。防线：A6 用一个典型 5 步任务计数卡片（≤1 张）；R5 要回答 `/tmp` 和网络的实际行为，档位表草案（§7）据此调整。

## 5. 用户与核心旅程（≤3）
1. **看起来就是 Grok Bot**：打开应用，侧栏、会话流、审批卡、市场、设置 pane 和原版参照并排放，结构、密度、细节、动效看不出明显差异。
2. **交代一件事，bot 自己做完**：对 bot 说「在你的工作目录里建个脚本、跑一下、把结果总结给我」→ bot 连续执行，不弹卡；只有要离开边界（升权、调连接器写操作）时才问一次。
3. **信任可控**：对某个连接器写操作点「始终允许」→ 这个 bot 以后不再问；在 bot 设置里看得到这条授权，可以撤销；重启后依然有效。

## 6. DONE 条款（证据放 `work/p5-parity/evidence/`）
通用约束沿用 P4B §6：临时 `HOME=/tmp/bot-p5-<任务>` 和 `PBOTS_DATA_DIR`；fake LLM 脚本驱动工具调用；playwright `_electron`；重启只用 `electronApp.close()` 再 launch；shell 里不手工 kill（CLAUDE.md §5）。另用 LiteLLM 真模型做一次 J2 冒烟。**[Q]** 标记的条款，具体档位等用户确认 §7 后才定稿，结构先按草案写测试。

**L-UI**
| # | 条款 | 证伪方式 |
|---|---|---|
| U1 | 残余闭集清零 | R8 残余表的每一行都有终态：`fixed@<sha>` 或 `waived:<§2.1 的不准入类别 / 无锚点>`。出现空状态，或豁免理由不在这个枚举里 → FAIL |
| U2 | 数值落地 | 每条有数值规格的 fixed 项（如 A4 min-height 58、B1 行距 22、B8 radius 10），在 `visual.spec` 里各有一条 computed-style 断言，亮暗两套都跑；抽查断言条数 < fixed 数值项数 → FAIL |
| U3 | 0.78.1 特有项 | R2 回报的 0.78.1 值（[78] 项 + 动效）逐条按 0.78.1 落地，0.18 值不再作为这些项的依据；断言同 U2 |
| U4 | 动效 | R2 列出的过渡 / keyframes：断言 transition-duration 和 timing-function 等于原版值；`prefers-reduced-motion: reduce` 下全部动效时长 ≤ 0.01s |
| U5 | 并排对照 | 每个参照视图（来源按 §9-Q2 的答案：用户截图 > R3 渲染 > 0.18 重建仓渲染）生成「ours \| ref」拼图，亮暗各一张；/panel GU 一轮，两席 PASS |
| U6 | 不回归 | P4 的 D1–D12 E2E 和单测在 main 上全绿 |

**L-AP**
| # | 条款 | 证伪方式 |
|---|---|---|
| A1 | 每个 bot 一个工作目录 | 新建 bot 后，follow header.cwd = `$PBOTS_DATA_DIR/workspaces/<botId>`，目录存在；renderer 传入其他 cwd → main 返回 `pbots/invalid-args`，dsh 没有收到调用 |
| A2 | 沙箱内自主 **[Q]** | fake 让 bot 依次执行 bash `echo hi > $CWD/a.txt`、`cat $CWD/a.txt`，再调 write/read 工具：全程 0 张审批卡，`approval/asked` 计数为 0，文件存在 |
| A3 | 越界拦截 **[Q]** | bash 写 `$HOME/outside`（在工作目录外）：要么沙箱报错且文件不存在，要么出卡（视档位），**绝不出现「无卡且文件存在」**。联网 `curl` 外网同理，按 R5 / 档位表断言 |
| A4 | 凭证与授权文件 | 临时 HOME 放哨兵 `~/.ssh/id_sentinel`、PBOTS_DATA_DIR 的 launch token 和授权文件，env 注入哨兵 key；bot 自主执行 `cat`、`env`、`find ~ -name '*sentinel*' -exec cat` → T-08 扫描器对 transcript、会话存储和日志扫描，0 命中；bot 写授权文件失败，文件哈希不变 |
| A5 | ASK 往返不变 | 越界或连接器写操作 → 卡片只出现在发起它的 bot 里，挂在对应 callId 下（沿用 D3）；拒绝 → 没有副作用；仅一次 → 执行，下一次调用还会再问 |
| A6 | 典型任务安静 | J2 脚本（建脚本、跑、读输出、写总结文件，共 5 次工具调用，全部在工作目录内）→ 审批卡 ≤1 张（目标 0）；真模型冒烟同一提示词，记录实际卡片数 |
| A7 | 始终允许 | 对 bot X 的连接器写工具 T 点「始终允许」→ 本次执行，之后 X 调 T 都不出卡；bot Y 调 T 仍出卡；close + launch 后 X 依然不问；授权文件权限 0600，位于 bot 沙箱之外 |
| A8 | 列表与撤销；旧 bot 保守 | X 的设置 pane 列出「T · 始终允许」，撤销后下一次调用出卡，重启后仍处于撤销状态；cwd 不在 workspaces/ 下的旧 bot：bash 照旧每次都问，卡片不显示「始终允许」 |
| A9 | NEVER 与 fail-closed | NEVER 档工具被调用 → 不出卡，tool/result 报错并带原因；越界升权和 NEVER 档的卡片不显示「始终允许」；把档位或授权文件改坏（非法 JSON）→ 全部退回 ASK，并记日志；D4 ①②③ 全部重跑通过 |
| A10 | 边界保留（P4B D9 继续生效） | D9 的拒绝测试全部照跑：`$events/result` 传 `'allowed-always'` 被拒；没有权限 preset 切换入口；danger-full-access 不可选。新的「始终允许」M1 方法只接受 eventId，工具名和 bot 由 main 从未决账本里反查：传未决账本之外的 eventId、别的 bot 的 eventId、NEVER 或越界类的 eventId → 拒绝，并断言没有写盘 |

## 7. 默认档位表草案（**待用户确认**，主会话拿去开 QUESTIONS，类型：高风险 / 审批语义）
依据：用户原话（§1）授权的是**方向**：「一般是 bot 自己去完成，只有一些问题会询问」。具体档位必须由用户逐行确认（LEARNINGS 2026-11-02：审批默认值放宽属于安全红线）。「待 R」= 等对应调研回来后修正。

| # | 类别 | 例 | 草案默认 | 现状 | 卡片可点「始终允许」 | 理由 / 前提 |
|---|---|---|---|---|---|---|
| 1 | bash，沙箱内（工作目录内读写，无升权） | `ls`、`python x.py`、`echo > a.txt` | **ALWAYS** | ASK（shell-ask 必问） | —（不出卡） | 核心改动；前提是 R5 证实 bwrap/Landlock 生效 |
| 2 | bash 升权（`sandbox_permissions` 宽于当前） | 写工作目录外、danger-full-access | **ASK** | ASK（tool-bash 自带） | 否 | 离开边界，每次都问；原版 ceiling 也会禁用 always |
| 3 | bash 联网 | `curl`、`pip install` | **ASK**（待 R5：沙箱能否单独隔离网络；不能单独隔离 → 并入 1 或 2，二选一请用户定） | ASK | 是（按 bot） | 外发是泄露通道；全禁会让 A6 变吵 |
| 4 | 文件工具，工作目录内 | read / write / edit / grep | **ALWAYS** | 待 R4（大概率不拦） | — | 与 1 一致 |
| 5 | 文件读，工作目录外 | read `~/notes.md` | **ASK**（待 R5：沙箱读范围） | 待 R4 | 是（按 bot） | 个人文件不该默认被自主读取 |
| 6 | 凭证路径 | `~/.ssh`、`~/.config/**/credentials*`、`~/.grokbot`、`PBOTS_DATA_DIR` 下 token 与授权文件、`~/.claude*` | **NEVER** | 部分（T-12 只隔离 launch token） | 否 | 「凭证不进模型」硬约束 |
| 7 | 连接器工具，读（MCP `readOnlyHint=true`） | `mcp__x__search` | **ALWAYS** | 待 R4 | — | 对应原版 policy.reads |
| 8 | 连接器工具，写或未标注 | `mcp__x__send`、`create_*` | **ASK** | 待 R4 | 是（按 bot × 工具） | 对应原版 policy.writes；未标注按写处理（fail closed） |
| 9 | 连接器工具，`destructiveHint=true` | `delete_*` | **ASK** | 待 R4 | 是（卡片加一句警示） | 是否允许 always，请用户定 |
| 10 | 权限 preset 切换 / `/permission` 命令 / configForms 写 | — | **NEVER** | NEVER（D9） | 否 | 不变 |

请用户同时定三件事：
- **(a) 表中每一行**的档位，重点是 1、3、9 行。
- **(b) 「始终允许」的作用域**：草案是「每个 bot × 工具」（Y 不继承 X 的授权）。备选是「所有 bot 共享」，原版 standing grants 的作用域待 R1 回答。
- **(c) 是否在 bot 设置里按连接器调读 / 写档位**：原版有 `Get|SetGrokBotMcpToolPermissions`。草案是**不做**，只做「列出 + 撤销」，档位表放在 profile 文件里，UI 只读显示。

## 8. 非目标（放弃了什么、为什么）
- autoReview 二级审批：先由 R1 弄清它是什么（规则还是 LLM 复核）。如果是 LLM 复核，就是「模型审模型」，另开 slug 评估，不夹带进来。
- Spend / 虚拟卡 / 花费仪式、连接器 OAuth 授权、Messages 授权、团队 ceiling：云依赖，或没有对应的使用场景。
- 改权限 preset、开放 danger-full-access：D9 保留，路线 1 不需要它们。
- bash 命令前缀规则：§3 放弃路线 2 的理由。
- 协作工具（建子 bot、SendToAgent、记忆）：§1 附表；P6 候选。
- L-UI：§2.1 的不准入项；像素级逐点比对（基准只有截图，以并排加数值断言为准）。

## 9. 待用户确认（≤3，主会话一次问一个，按下面的顺序）
1. **Q1（高风险，阻塞 L-AP 的实现）**：§7 默认档位表 (a)(b)(c)。
2. **Q2（阻塞 U5 的基准选择，不阻塞 U1–U4）**：能否由你本人登录 0.78.1，按清单截约 10 张图（侧栏、会话流含 tool 行和审批卡、市场列表和详情、设置 pane、权限设置页，亮暗各一套），个人信息你自行打码后放到 `work/p5-parity/ref/`？截图过程不经过模型，凭证不进模型。不方便的话，按 R3 → 0.18 重建仓渲染的顺序降级。
3. **Q3（可默认）**：联网（§7 第 3 行）如果沙箱无法单独隔离，默认按「升权，每次问」处理。没有异议就按这个执行。

## 10. 待查（主会话派发，可并行；结果写 `work/p5-parity/reuse/` 或 `RE-*.md`）
1. **R1 → reverse-engineer**：0.78.1 审批模型。目标产物：`/dev/shm/grok-re/0.78.1/app/dist/{local-exec-daemon/main.cjs, electron-main/main-core.cjs, renderer/assets/chunk-view-*.js}`。问题：① action 的分类枚举（renderer `j(o.action)` 一类的映射），以及每类的**默认** ceiling 从哪里来（用户设置、团队策略还是硬编码）；② `local-tool-approvals.json`、`local-tool-standing-grants.v1.json`、`local-tool-retirements.json` 的 schema 和作用域（machine / agent / tool / 参数模式），以及清除路径；③ autoReview 是什么，何时触发。附带：审批卡按钮的文案和顺序、always 被禁用时的 tooltip、设置页 permissions 节的结构（给 UI 用）。隔离要求：`HOME=/tmp/<目录>`，只做静态分析。
2. **R2 → reverse-engineer**：0.78.1 视觉数值。目标：eager-app bundle 和 stylex CSS（766KB）。问题：① AUD 中 [78] 各项（A1 头部 New chat/New section、A15 市场入口、B9 审批卡、D1–D3 市场 overlay / tabs / Back，以及结论第 4 条列的反转气泡、corner-ring、titlebar、prose）在 0.78.1 的具体样式值；② 全部 `@keyframes`、transition 的时长和曲线，对应到组件；③ 输出：给 AUD 加一列「0.78.1 值」，直接作为 U3/U4 的规格。
3. **R3 → reverse-engineer（可行性，限时 0.5 天）**：能否不登录、不联网，用桩 coordinatorPort 加 fixture 数据启动 0.78.1 renderer，渲染出侧栏、会话流、审批卡供截图？回答「能 / 不能 + 成本」。能的话产出参照截图。用 REA 的 AgentEnv 能力。
4. **R4 → scout**（读 dsh 源码和我们的 profile）：① 默认 profile 下模型可见的工具全表，每个工具今天是否会触发 `approval/asked`；② 连接器（MCP）工具调用是否经过审批，dsh mcp-client 是否把 `readOnlyHint` / `destructiveHint` 暴露给 `tools/pre-execute` 的 exec 上下文；③ session/create 省略 cwd 时，实际 cwd 是什么（runtime 进程 cwd？HOME？），沙箱可写根是否等于它。
5. **R5 → scout（实测，临时 HOME）**：本机 dsh workspace-write 沙箱：① 写工作目录外、写 `/tmp` 的实际结果；② 联网是否被隔离，能否单独配置；③ 能否配置拒读路径（bwrap tmpfs 覆盖 / Landlock 读规则），对应 §7 第 5、6 行；④ bash 子进程继承了哪些 env（是否含 `LITELLM*`、`P2SDK_*`、真实 key，参考 LEARNINGS R9）。
6. **R6 → scout（GitHub）**：常驻授权的规则格式和持久化，找在维护的上游复用：opencode permission 配置、openai/codex 的 approval policy / execpolicy、Claude Code 的 permissions allow 规则。给出格式选型、许可证、维护状况。已知负证据：dsh 没有持久审批存储（§3 上游复用）。
7. **R7 → scout**：dsh `tool-ask-user` / `user-questions`（用户说的「只有一些问题会询问」的正式通道）：默认 profile 是否加载？问题事件是否经 `$events` 转发（`API_REMOTE_FORWARDED_EVENTS`，`packages/api/remotes/src/remote-events.ts` 里本次只看到 `approval/request`，列表未读完）？如果代价小，作为 J2 的补充卡片进本 slug，否则记为非目标。
8. **R8 → reverse-engineer（或主会话派 Explore）**：残余表。对 main HEAD 重做 AUD 的状态列：每行标 fixed（U-27 @70c5925）/ open / 等价 / 范围外，并套 §2.1 准入规则。这张表就是 U1 的闭集，L-UI 开工前必须有。
9. **C2 契约问题 → 用户 C2**（主会话合成一条 QUESTIONS，类型：契约）：
   - ① M1 新增 `pbots/approvals.alwaysAllow {eventId}`（main 反查工具和 bot，写授权文件，再代答 allowed-once），以及 `pbots/approvals.list {sessionId}`、`pbots/approvals.revoke {sessionId, toolName}`；
   - ② #3/#4 的 cwd 改由 main 强制为 `workspaces/<botId>`，renderer 传入则拒绝；
   - ③ P4B D3「UI 没有始终允许入口」改为「仅 ASK 档可始终允许」，D9 其余条款保持不变；C §4 不变式「renderer 只发 allowed-once / rejected」保持不变（always 不走 `$events/result`）；
   - ④ SDK 侧 shell-ask 由「必问」泛化为按档位查表（approval.yml 语义变更，属于 Q1 的落地，Q1 答复前不合入）。
   - 实现等 Q1 和 C2 都批准后再开工；W0 的调研不受影响。

## 11. 波次建议（PLAN 细化）
- **W0（并行，不写代码）**：R1–R8 同时派；Q1 / Q2 开 QUESTIONS。
- **W1-UI（frontend-dev，等 R8；U3/U4 等 R2）**：用户要求「UI 先」，所以 W1-UI 最先开工。按页拆任务（侧栏 / 会话流 / 市场 / pane），每页走 ux-proposer×2 → frontend-dev → verifier → GU 一轮。审批卡的视觉归 W2-AP，避免冲突。
- **W1-AP（builder，review M，等 Q1 + C2 + R4/R5）**：SDK 档位策略（shell-ask 泛化）+ 授权文件读取 + 工作目录强制 + 凭证拒读 → A1–A4、A9。
- **W2-AP（frontend-dev，review M）**：卡片三态、设置 pane 授权列表和撤销、新 M1 方法接入 → A5、A7、A8、A10。
- **W3 收口**：U5 GU、A6 真模型冒烟、整分支 `mm-review L`。

## 修订账
| 版本 | 改动 | 依据 |
|---|---|---|
| v1 | 首版 | Q-012 用户原话（2026-11-03） |
