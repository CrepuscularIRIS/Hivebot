# BRIEF · p5-parity（UI 对齐原版 + 审批自主化）

v3 · 2026-11-03 · director（Opus 5.5）· **L-UI 路线变更**（Q-014 用户答复：不截图，改「0.18 重构仓前端 1:1 移植 + 与 0.78.1 并排对照」）：新增 §12（覆盖 §2 L-UI 边界、§6 U1–U5、§11 W1-UI），文末「附：PLAN 重组指令（v3）」交主会话执行；L-AP 全部条款不变
v2.1 · 2026-11-03 · director（Opus 5.5）· 增补（不重写）：回应 G1-r2 有条件通过（`panels/G1-r2.md` 6 条去重 HIGH），吸收已回报的 R1/R4/R5/R6；R2/R3 仍「待 R」。逐条处置见修订账 v2.1 段
v2 · 2026-11-03 · director（Opus 5.5）· 回应 G1-r1 REVISE（`panels/G1-r1.md` 必须回应清单 7 条 HIGH，逐条处置见文末修订账）
v1 · 2026-11-03 · 首版
输入：QUESTIONS Q-012 答复（用户 2026-11-03 原话，见 §1）、`p4-ui/BRIEF.md` v1.3（下称 P4B）、`p4-ui/RE-visual-audit.md`（下称 AUD）、`p1-re/RE-features.md` L91、`p3-contract/CONTRACT.md` v1.4（下称 C）§4/§8、`p2-sdk/PLAN.md` T-07/T-08/T-12、Q-008/Q-009、`app/sdk/profile/patches/approval.yml`、`app/sdk/src/policy/shell-ask.mjs`、LEARNINGS；v2 新增 `panels/G1-r1{,-A,-B}.md`、`reuse/r7-ask-user.md`（下称 R7）、`RE-visual-residual.md`（下称 R8）；v2.1 新增 `panels/G1-r2{,-A,-B}.md`、`RE-approval-model.md`（R1）、`reuse/r4-tool-gates.md`（R4）、`reuse/r5-sandbox-probe.md` + `evidence/r5-probe.mjs` + 最终证据 `evidence/r5-run-qXloBM/`（R5；早期草稿 `r5-run-5lSrb9`、`r5-run-rFPpjE` 作废，不再引用）、`reuse/r6-grant-format.md`（R6）。
编号说明：roadmap 原「P5 远程与云端 / P6 其他功能」顺延一位，由主会话更新 `roadmap.md`。
上游路径简写：`D/` = `repos/deepseek-harness/packages/`。

## 1. 目标与需求证明

用户原话（2026-11-03，Q-012）：「现在我们打算把UI先打磨到Grok Bot一致的level. 然后主bot部分, 现在覆盖了哪些功能? 我记得Personal Agent是不会比如说权限也好, 这些其实是不会给Grok Bot去做的……一般是bot自己去完成, 只有一些问题会询问. 这种调整, 可能是我们要去做的.」

两条主线，用户给的优先级是 **UI 先、审批后**：
- **L-UI 视觉对齐**：把 P4 的 4 页 + 审批卡从「token 级对齐」（P4B §1 当时的口径）推进到「与原版并排对照看不出明显差异」。
- **L-AP 审批自主化**：bot 在自己的边界内直接动手，只有越界时才问用户；有疑问时用正式的提问通道问一句（R7 的 `ask_user_question`）。对应原版的分级模型（RE-features L91）。

**需求证明**
- **谁用**：用户本人，私用。
- **现在怎么凑合**：默认 preset 下每条 bash 都要点一次「仅批准这一次」（shell-ask，approval.yml；P4B D3 写明「UI 没有始终允许入口」）。让 bot 做一件 5 步的小事，用户就得点 5 次，bot 等于被拴在人手上。这正是用户说的「不会给 Grok Bot 去做」的反面。
- **凭什么换**：原版把安全边界放在档位（ceiling NEVER/ASK/ALWAYS）和常驻授权（standing grants）上，不靠每次弹窗。我们要把「人点一下」换成「OS 拦得住」，因为后者能自动化证伪。**但 dsh 自带的沙箱只拦写，不拦读，也不断网**（G1-r1 A-H1）：bwrap profile 是 `--ro-bind / /` 且没有 `--unshare-net`（`D/sandbox/sandbox-local/src/profiles.ts:17-21`）；Landlock 是 `readOnly:['/']`（同文件 :29-34）；进程内文件栅栏「Reads pass through untouched」（`D/fs/fs-sandbox/src/index.ts:7-8`）；席 A 用相同参数在本机实测，`ls ~/.ssh` 可见。所以本 slug 必须先**加固沙箱**：用上游接缝 `runnerCommand`（`D/sandbox/sandbox-local/src/index.ts:46-55`，「Override the runner argv; bwrap-compatible profile arguments are appended」，属搬运阶梯第 2 级：配置加包装层；**profile overlay 的配置 id 是 `sandbox`**，R5 实测误写 `sandbox-local` 时 overlay 静默不生效）接一个小 wrapper，补上断网和 HOME 遮蔽（§3、A0）。**R5 已实证这条接缝可行**（`evidence/r5-run-qXloBM/`：`--unshare-net` 后 loopback 111、外网 DNS 失败；在 profile 挂载之后追加 `--tmpfs` 遮蔽，原文件 ENOENT；工作目录照常可写）。
- **顺带的事实**：今天用户批准的每一条 bash 同样可以读 `~/.ssh`、可以联网。**v2.1 补（G1-r2，R4 实证）：bash 之外今天还有五个侧门**：① read / read_image / glob / grep 零审批，可读任意路径，包括宿主 `/tmp/p2sdk-handoff-*` 里的 launch token（`app/sdk/src/start.ts:62`）；② web_fetch / web_search 零审批，可出公网；③ 子代理会话 approvalPolicy 被钉成 `never`（`D/subagent/subagent/src/child-agent.ts:243-254`），shell-ask 遇 never 直接放行（`app/sdk/src/policy/shell-ask.mjs:45`），**子代理里的 bash 今天不问**；④ `plugin_manager` 在 standard 默认启用，一次批准就能永久改 profile、装沙箱外的宿主代码（`D/boot/plugin-manager/src/tools.ts:87-104`）；⑤ 批准一次升权 = 这条命令完全没有沙箱（§3「升权不能是裸升权」）。所以 W1-AP-0 扩为**全入口纯收紧**（§11），全部只收紧不放宽，不依赖 Q-013，可以先做。
- **没证明的部分**（写进 §9 和 §10，不假装成立）：① wrapper 接缝 R5 已实证（见上）；仍未实证的是 wrapper 失效时是否 fail closed（A0 ⑥）、工具链挂回之后能否正常用（A0 ⑦）、HOME 外的凭证路径清单（R5 ⑤ 未答）、gateway 是否接受 token 复用（R5 ③ 未答，只作信息），这几项**全部转为 W1-AP-0 的验收**；② 原版默认档位 **R1 已答**：用户档位硬编码默认 `ask`，ceiling 缺省不限制（`RE-approval-model.md` §1.3），差异写进 §7 理由；③ 原版登录后的真实外观，目前没有运行态截图（AUD 局限 2，RE-ui-shell L3），L-UI 的「一致」缺基准（§9-Q2、R3）。

**附：用户问「主 bot 现在覆盖了哪些功能」**（答复给主会话转述，不在本 slug 范围内）
| 能力 | 原版 0.78.1（RE-features §1） | 我们现在（C §5 思路②） |
|---|---|---|
| 主 bot 指针 / 保底创建 | `main_agent_id` + ensureDefaultMainAgent | 有：`bots.json.mainBotId`，冷启动没有就建（#3 + #20） |
| 置顶、不可删 | 未见删除保护（RE 未知项 b） | 有：置顶，UI 不提供删除 |
| 建 / 管子 bot（CreateAgent、MessageSubagent、SendToAgent） | 运行时工具 | 无 |
| 记忆（RecallMemory、记忆列表） | 有 | 无 |
| 自主执行 / 分级审批 | 有（ceiling + standing grants） | 无：每条 bash 都要问，**本 slug L-AP 补上** |
| 向用户提问 | 有 | 工具已加载（R7：standard preset 默认带 `ask_user_question`），但我们的 UI 不处理，**本 slug 补上**（A14） |
| 设主 bot（SetPrimaryBot 工具） | 有 | 只能由冷启动自动指定 |

结论：目前主 bot 只是带标记的普通 bot。协作类工具（建子 bot、跨 bot 发消息、记忆）属于 P6 候选，不进本 slug。

## 2. 范围模式：HOLD（两条线各自加硬边界）
用户点了两件事，照单做好；不扩到 Spend、autoReview、协作工具，也不砍掉其中任何一条线。之所以不选 EXPAND，是因为两条线都有「没有基准就会无限打磨」的风险（§4），需要的是收口，而不是找 10 星体验。
- **L-UI 的边界：只修有证据的项。** 范围 = R8 闭集（83 行）里的 6 个 open→in 项 + 19 个 fixed 项的数值断言 + 0.78.1 特有项（R2 给数值）+ 动效（R2）。没有锚点（0.18 源码 / 0.78.1 bundle / 参照截图）的改动一律不做。
- **L-AP 的边界：只做本地工具这一层。** 包括沙箱加固、档位、卡片三态、连接器常驻授权的持久化 / 列表 / 撤销、每个 bot 独立工作目录、旧 bot 迁移、提问卡。不做 autoReview、连接器 OAuth 授权、Messages 授权、虚拟卡、花费仪式（云依赖），也不做团队 ceiling 管理。

### 2.1 L-UI 范围外缺口的准入规则（机械，不逐项讨论）
U-27 判为「范围外」的项，满足以下全部条件才准入：① 4 页静息态下可见；② 只改前端，不需要新增后端能力或接口；③ 有锚点。
**R8 已按此规则出闭集，v1 预判全部命中**：准入 A2 搜索、A13 侧栏折叠态、B7 thinking 行、B13 独立会话头（推翻 PAB R0 的 38px 合并，属品味项，交 GU）、B14 时间分隔 / 未读线、E5 0.5px 细边残余；v1 预判中的 B15 代码块复制已在 U-27 修掉，不再残留。范围外 10 项（A12 A16 B11 B16 C3 C4 C6 D5 D11 D12）加规则表 8、20，豁免类别 R8 已逐条写明。
R8 局限 4：A13、B7 的「静息态可见」按「正常使用必然出现的界面态」口径执行；GU 如认为口径应更严，这两项移出不影响其余判定。

## 3. 路线（强制双方案，针对 L-AP；L-UI 没有路线之争，只有基准问题，见 §9-Q2）

| | 路线 1′ · 加固沙箱即边界（**选**） | 路线 2 · 问 + 学（Claude Code 式 allow 规则） |
|---|---|---|
| 做法 | ① **先加固**：profile overlay `id: sandbox` 配 `runnerCommand` 指向我们的 wrapper，wrapper 在上游追加的 profile 参数之后、`--` 之前依次插入（v2.1 定序）：`--unshare-net` → `--tmpfs` 遮蔽 `$HOME`、passwd 记录的真实 home、`PBOTS_DATA_DIR`、`DSH_HOME`、`PBOTS_DSH_HANDOFF` → `--ro-bind` 挂回**工具链白名单**（`~/miniconda3`、`~/.local/bin`、`~/.npm-global`，清单放 profile 配置，G1-r2 A-H4）→ 按原顺序**重新 `--bind` 工作区** → 对落在任一工作区根之下的遮蔽路径**再遮一次**，做不到就拒绝运行（fail closed；旧 bot 的 cwd 是 runtime 启动目录，可能是 `DSH_HOME` 的祖先，R4 §4）。bwrap 按顺序挂载：遮蔽排在 `--ro-bind / /` 之后，挂回和重新 bind 排在遮蔽之后。② 新 bot 的 cwd 固定为 `$PBOTS_DATA_DIR/workspaces/<botId>`。③ 加固后的沙箱内，普通 bash 和工作目录内的文件读写直接执行（ALWAYS）；升权（含联网、写工作目录外）以及文件工具读工作目录外，逐次 ASK，**不可始终允许**，升权只走受控路径（本节末「升权不能是裸升权」）；凭证路径（读写都拒）、权限 preset 切换、`plugin_manager` 为 NEVER（代码常量，任何会话、任何 approvalPolicy 下都生效）。④ 连接器工具按读写分档：读 ALWAYS，写 ASK；**只有连接器写工具**的 ASK 卡提供「始终允许」，按 bot × 工具记住，bot 设置页可以列出、撤销 | 保持全部 ASK，只给卡片加「始终允许」，持久化命令前缀 / 工具规则，用户点一阵子之后逐步变安静 |
| 对上原版 | ceiling 档位 + 卡片 APPROVED/DENIED/ALWAYS + standing grants + 读写分开（RE-features L91） | 只对上卡片三态 |
| 代价 | 多一个 wrapper（几行，挂上游接缝，不改上游代码）；HOME 被遮蔽后，依赖 `~/.gitconfig`、用户级 pip 的命令会在沙箱里失效；工具链只读挂回，conda base 环境能跑，但不能 `pip install` / `conda install`；受控升权路径落地之前，联网和写工作目录外都不可用；`/tmp` 在 bwrap 下每次调用都是私有 tmpfs（profiles.ts:19），跨调用经 `/tmp` 传文件会丢；联网只能逐次升权。shell-ask 要从「必问」改成按档位查表（SDK 策略泛化）；cwd 要由 main 强制（契约变更） | 第一天的体验和现在一样；bash 前缀规则有已知坑（`git status && rm -rf …`），要做复合命令拆分，等于自建一个小解析器；而且 stock 沙箱不拦读和网络，前缀规则对 `cat ~/.ssh/x` 的拦截只能靠解析 |
| 可证伪性 | 断网、遮蔽、越界都能用 E2E 自动打，并带正对照（A0、A3、A4、A4b） | 「点得够多就安静了」没法证伪 |

**放弃路线 2 的理由**：它保留了用户抱怨的摩擦，等于没回应 Q-012。前缀匹配还要多造一个解析器，安全上也更脆。路线 2 里有用的部分（ASK 卡上的「始终允许」）已经并入路线 1′，但只给连接器工具，按 bot × 工具名记，所以没有解析器。
**为什么不是 v1 的路线 1**：v1 的前提「dsh 沙箱拦得住」对读取和网络不成立（§1），按 v1 把第 1 行设为 ALWAYS，bot 就能自主读整个 HOME 并外发。v1 的退路「沙箱内 ASK + 始终允许」继承同一个问题（对 bot × bash 点 always 就等于 ALWAYS），v2 删除。
**路线 1′ 的前提与退路**：W1-AP-0（wrapper）的 A0 带正对照通过，第 1 行才能从 ASK 改为 ALWAYS。R5 或 W1-AP-0 证伪 wrapper 方案时，L-AP 降级为「卡片三态 + 连接器始终允许 + 提问卡」，bash 保持逐次 ASK，并带数据回 G1，不硬上。
**wrapper 不可用时 fail closed**：上游文档写明，非空 `runnerCommand`「asserts full enforcement and skips built-in selection and probing」（index.ts:46-55），所以配置了 wrapper 后不会再退到 Landlock。wrapper 拒绝 profile 时由 `runnerFailureSignatures` 识别（同文件 :56-63；R5 实测可用值 `['bwrap: ']`）。R5 没有实测「wrapper 不可执行时 bash 是失败而不是无沙箱执行」，这一条由 W1-AP-0 的 A0 ⑥ 首次验证。
**升权不能是裸升权（v2.1，G1-r2 B-H1；R4 ④ 由此回答）**：上游 `escalation.ts:30-31` 规定 workspace-write 只能升到 `danger-full-access`，而 `bash-sandbox/src/index.ts:92-100` 对这个模式直接跳过 confine，`runnerCommand` 根本不执行。也就是说，今天批准一次升权，这条命令就没有任何沙箱：能读 `~/.ssh`，能联网，能写任何地方。文件工具 write / edit 的显式升权同理（R4 #5/#6）。处置：① **W1-AP-0 起，pre-execute 拒绝所有工具的 `danger-full-access` 升权**，不出卡，tool/result 写明原因（纯收紧）；② **受控升权路径放进 W1-AP 首批设计**，必须做到「放开联网或某个写目录，但凭证遮蔽始终保留」，候选见 §10 D-1；③ 验收见 A4 升权格：批准升权之后，仍读不到任何哨兵。

**上游复用（已查）**：dsh 的 `ApprovalOutcome = 'allowed-once'|'rejected'|'cancelled'|'unavailable'`（`D/interaction/user-approval/src/types.ts:32`），**没有 always**。`ui-approval` 的 `onAlways` 只有 experimental/cua 一个调用方（`cua/src/client/ApplicationApproval.tsx:44`）。所以「始终允许」的持久化和匹配要我们自己写一层，正确位置是现有的 `tools/pre-execute` 策略（shell-ask 泛化）。**R6 已查**：OpenCode V2 授权的主体是 project 而不是 bot；Gemini CLI 自动保存时丢掉了 subagent 字段；Codex execpolicy 做的是命令前缀；Claude Code 闭源。四家都不能原样满足「bot × 工具精确键」，所以**自建最小 schema**（第 5 级，有 R6 的反向确认），持久化复用 `app/ui/main/m3-meta/store.ts` 的单写者 tmp+rename 模式，并补上它没有的 0600。存储不变量见 A7。文件工具的路径判定复用上游 `D/fs/fs-sandbox/src/containment.ts` 的 `isPathUnder` / canonicalize（先 realpath 再判包含），不自写。

## 4. 逆向一问：三个月后失败，最可能的死因
1. **自主权漏出去**（L-AP，最致命）：用户按「沙箱生效」批了第 1 行 ALWAYS，而沙箱实际不拦读、不断网；bot 被连接器内容做了提示注入，自主 `cat` 到 `~/.claude*/settings.json` 再 curl 外发，或者读到 launch token，经 loopback 直连 dsh gateway，绕过 main 侧的全部 D9 守卫给自己升权（main 断线时复用同一个 token 重连，`app/ui/main/index.ts:196-206`，说明 token 可重复使用）。测试却全绿，因为测试 HOME 在 `/tmp` 下，被 bwrap 的 `--tmpfs /tmp` 盖住了。防线：A0 wrapper 带正对照，先于任何 ALWAYS；A4 按「执行入口 × 凭证」矩阵逐格断言，包括符号链接；A4b loopback 必须失败；测试 HOME 移出 `/tmp`；NEVER 是代码常量，配置损坏也不降级（A9）；授权文件在 bot 可见范围之外（A4、A7）；bash 没有任何「始终允许」入口（A9、A10）。**v2.1 补（G1-r2 两席 reverse_take）**：wrapper 把 bash 封好之后，bot 改从侧门出去：子代理里 NEVER 被 `never` 放行；`plugin_manager` 一次批准就永久改掉 profile；read 加 web_fetch 零卡外发；为了联网批准一次升权，结果这条命令完全没有沙箱。防线：W1-AP-0 先把所有入口一起收紧，再谈第 1 行 ALWAYS；A4 加子代理列和升权格，A10 加 `plugin_manager` 格，§7 加 web 行并改写后果说明。
2. **没有基准的无限打磨**（L-UI）：没有登录后的截图，GU 席只能凭感觉判「像不像」，一轮接一轮。防线：§2 证据准入、R8 闭集（83 行）、U2 数值断言、GU 只跑 1 轮，并且 U5 写明 REVISE 之后怎么收口（一次性修复清单，不再开第二轮）、§9-Q2 请用户给参照截图；降级基准下 0.78.1 特有项标「未验证」，不让 GU PASS 自动抹掉。
3. **改了还是很吵，或者主 bot 根本没变**：① 加固后联网和 HOME 都不可用，`pip install`、`git` 用户配置之类的常见操作全变成升权卡，用户照样点个不停；v2.1 补：遮蔽 passwd home 之后连 `python`、`pnpm`、`uv` 都没了（都装在 HOME 下，`/usr/bin/python` 不存在），旅程 2 当场做不成 → 工具链只读挂回（A0 ⑦），A6 的脚本改用 `python`；② 现有主 bot 的 cwd 不在 `workspaces/` 下（创建时没传 cwd，`app/ui/main/m3-meta/orchestrate.ts:118`），按旧 bot 规则永远全 ASK，而用户每天用、这次问的恰恰是主 bot。防线：A6 用典型 5 步任务计数卡片（fake 断言 = 0）；真模型冒烟记录实际卡片数，偏高就回来调档位表；A11 提供用户触发的迁移动作，并作为 Q-013 (e) 交用户选。
4. **自主失控**：本机在跑 GPU 训练（CLAUDE.md §4），bwrap 只有 `--unshare-pid`，没有资源限制；自主连续执行时 bot 跑飞，用户停不下来。防线：A12 中途打断；dsh 单轮工具调用上限交 R4b（R4 ⑤ 没有回答）。

## 5. 用户与核心旅程（≤3）
1. **看起来就是 Grok Bot**：打开应用，侧栏、会话流、审批卡、市场、设置 pane 和原版参照并排放，结构、密度、细节、动效看不出明显差异。
2. **交代一件事，bot 自己做完**（含主 bot）：现有主 bot 在设置里点一次「迁移到独立工作目录」（A11，取决于 Q-013 (e)）之后，对它说「在你的工作目录里建个脚本、跑一下、把结果总结给我」→ bot 连续执行，不弹卡；有疑问时在输入区出一张提问卡，答完继续（A14）；只有要离开边界（升权、联网、读工作目录外、调连接器写操作）时才出审批卡；中途想停，点停止就停（A12）。
3. **信任可控**：对某个连接器写操作点「始终允许」→ 这个 bot 以后不再问；在 bot 设置里看得到这条授权，可以撤销；重启后依然有效。bash 和文件工具没有「始终允许」。

## 6. DONE 条款（证据放 `work/p5-parity/evidence/`）
通用约束沿用 P4B §6：fake LLM 脚本驱动工具调用；playwright `_electron`；重启只用 `electronApp.close()` 再 launch；shell 里不手工 kill（CLAUDE.md §5）。另用 LiteLLM 真模型做一次 J2 冒烟。**[Q]** 标记的条款，具体档位等用户确认 §7 后才定稿，结构先按草案写测试。
**测试 HOME**：L-UI 沿用 `HOME=/tmp/bot-p5-<任务>`。**L-AP 涉及沙箱的用例（A0、A2-A4b、A6）一律用 `HOME=/home/lingxufeng/bot/.test-homes/p5-<任务>`**（在 CLAUDE.md §5 的沙箱目录 `~/bot/` 内，不在 `/tmp` 下，免得被 `--tmpfs /tmp` 盖住而空过；该目录由任务加进 `.gitignore`），`PBOTS_DATA_DIR` 放在这个 HOME 下面。
**正对照规则**：凡是「看不见 / 写不进 / 连不上」的断言，同一探针必须先在**未加固的 stock profile**（不配 `runnerCommand`）下跑一次并成功，证明测试本身能命中；断言要看错误码（EROFS、ENOENT、ENETUNREACH 之类），不只看「文件不存在」。探针只做存在性和连通性检查，不读取真实凭证的内容。

**L-UI**（闭集 = R8，`work/p5-parity/RE-visual-residual.md`）
| # | 条款 | 证伪方式 |
|---|---|---|
| U1 | 残余闭集清零 | R8 的 83 行（主表 59 + 规则表 24）每一行都有终态：`fixed@<sha>`、`等价`（沿用 R8 依据），或 `waived:<§2.1 的不准入类别 / 产品裁决编号 / 无锚点>`。6 个 in 项（A2 A13 B7 B13 B14 E5）必须是 `fixed@<sha>`，或者 B13 / A13 / B7 经 GU 改判 waived 并写明理由。出现空状态，或豁免理由不在这个枚举里 → FAIL |
| U2 | 数值落地 | R8 的 19 个 fixed 项和 6 个 in 项，凡规格列有数值的（如 A4 min-height 58、B1 行距 22、B8 radius 10 / padding 14·16、A13 折叠宽 88、E5 0.5px），在 `visual.spec` 里各有一条 computed-style 断言，亮暗两套都跑；断言条数 < 有数值项数 → FAIL。v2.1 补（G1-r2 A-LOW）：R8 规则表另有 fixed 3 项，有数值的同样各加一条断言，没有数值的在 U2 报告里逐条写「无数值，不断言」。R8 局限 1（token 解析链可能有间接偏差）由这批断言暴露，暴露出的偏差按 fixed 项回修 |
| U3 | 0.78.1 特有项 **待 R2** | R2 回报的 0.78.1 值（[78] 项 + 动效）逐条按 0.78.1 落地，0.18 值不再作为这些项的依据；断言同 U2 |
| U4 | 动效 **待 R2** | R2 列出的过渡 / keyframes：断言 transition-duration 和 timing-function 等于原版值；`prefers-reduced-motion: reduce` 下全部动效时长 ≤ 0.01s |
| U5 | 并排对照 | 每个参照视图（来源按 §9-Q2 的答案：用户截图 > R3 渲染 > 0.18 重建仓渲染）生成「ours \| ref」拼图，亮暗各一张；/panel GU **只跑一轮**：两席 PASS 即通过；REVISE 时，两席发现转成一次性修复清单，修完后以 U2-U4 断言全绿 + 用户目视作为 U5 终态，不开第二轮。基准降级到 R3 或 0.18 时，参照覆盖不到的 0.78.1 项在 U5 报告里标「未验证」，GU PASS 不能消除这一标记 |
| U6 | 不回归 | P4 的 D1–D12 E2E 和单测在 main 上全绿 |

**L-AP**
| # | 条款 | 证伪方式 |
|---|---|---|
| A0 | 沙箱加固（W1-AP-0，不依赖 Q-013） | 用 `id: sandbox` 配置 `runnerCommand` wrapper 后，fake 让 bot 执行的 bash 探针：① `curl` 外网、`curl 127.0.0.1:4001`（LiteLLM）、`curl <dsh gateway base-url>` 全部失败；② **具体哨兵不可见**（v2.1 改，G1-r2 B-M1）：`test -e` 对 `$HOME/.ssh`、`<passwd home>/.ssh`（只查存在性）、`PBOTS_DATA_DIR` 下的 launch token 与授权文件、另一个 bot 工作区里的哨兵、`DSH_HOME` 下的会话日志哨兵、`$PBOTS_DSH_HANDOFF` 全部为假，且这些文件在宿主侧的哈希不变；**不再**断言 `$PBOTS_DATA_DIR` 本身不存在（工作区重新 bind 之后，它的祖先目录必然存在）；③ `$CWD` 可写，且写入在宿主侧可见；④ 宿主 `/tmp` 不可见；⑤ 正对照：同一组探针在 stock profile 下，①有至少一项成功、②有至少一项为真（否则这条测试不算数）；⑥ wrapper 不可执行或拒绝 profile 时，bash 调用失败、命令没有执行（探针命令写一个标记文件，断言标记不存在），不出现「无沙箱执行」（R5 未实测，本条首次验证）；⑦ **工具链**（v2.1，G1-r2 A-H4）：沙箱内 `command -v python` 与宿主相同（本机为 `~/miniconda3/bin/python`），`python -c 'import sys;print(sys.prefix)'` 与宿主相同，向 `sys.prefix` 下写文件失败（只读挂回）；⑧ **cwd 是被遮蔽路径的祖先**（v2.1，A-MEDIUM）：把 cwd 设成 `DSH_HOME` 的祖先（模拟以 runtime 启动目录为 cwd 的旧 bot）后，`DSH_HOME` 下的哨兵仍不可见；否则 wrapper 必须拒绝运行，且命令未执行（标记文件不存在） |
| A1 | 每个 bot 一个工作目录 | 新建 bot 后，follow header.cwd = `$PBOTS_DATA_DIR/workspaces/<botId>`，目录存在；renderer 传入其他 cwd → main 返回 `pbots/invalid-args`，dsh 没有收到调用 |
| A2 | 沙箱内自主 **[Q]** | 前提：A0 绿。fake 让 bot 依次执行 bash `echo hi > $CWD/a.txt`、`cat $CWD/a.txt`，再调 write/read 工具：全程 0 张审批卡，`approval/asked` 计数为 0，文件存在 |
| A3 | 越界拦截 **[Q]** | v2.1 改（G1-r2 B-M1：wrapper 的 tmpfs 遮蔽本身可写，影子写入落在每次调用私有的 tmpfs 里，随调用消失，不改宿主，所以不再要求报错）：bash 写 `$HOME/outside`、写 `$CWD/../outside` → **宿主上文件不存在、宿主内容不变**；bash 写未遮蔽的工作目录外路径 `/var/tmp/bot-p5-outside` → EROFS，且宿主上文件不存在（正对照：stock profile 下写 `$CWD/../outside` 得到 EROFS，证明探针命中了写栅栏）。bash 请求升权（含联网）：受控升权路径落地之前 → 被拒、不出卡、tool/result 带原因（§3）；落地之后 → 出卡，卡片显示完整命令，不显示「始终允许」。**绝不出现「无卡且越界写入宿主成功」** |
| A4 | 凭证：执行入口 × 会话 × 凭证矩阵 | 凭证哨兵：测试 HOME 下的 `~/.ssh/id_sentinel`、`~/.config/x/credentials-sentinel`，`PBOTS_DATA_DIR` 下的 launch token 与授权文件，`DSH_HOME` 下的会话日志哨兵（v2.1），handoff 目录（含宿主 `/tmp/p2sdk-handoff-*` 这种形态，进程内工具看得到宿主 `/tmp`）。**执行入口（R4 全表已回报，v2.1 填实）**：bash（`cat`、`find ~ -name '*sentinel*' -exec cat`、`env`）；读入口 read、read_image、glob、grep；写入口 write、edit（对哨兵路径写 → 拒绝，哈希不变；凭证路径读写都拒）。**会话列（v2.1，G1-r2 A-H1）**：根会话、subagent、subagent_fork、workflow 各发起一次 bash 和一次 read，四列结果一致，wrapper 对子会话的 bash 同样生效。**升权格（v2.1，G1-r2 B-H1）**：W1-AP-0 之后，bash / write 请求 `danger-full-access` → 被拒且命令没有执行；受控升权路径落地之后，批准一次升权的 bash 仍然读不到任何哨兵。**连接器**：v2.1 定为**不在 NEVER 保证范围内**（R4 §3：MCP 服务器进程不继承 bash 的 OS 沙箱；装连接器 = 信任它，写进 §7 后果说明），本矩阵不设连接器列。每一格断言：读取被拒或目标不可见；另加两格符号链接：bash 在工作目录里 `ln -s <哨兵目录> k` 之后，read 工具读 `k/…` 被拒（先 realpath 再判定）；workspace 内预置指向哨兵的链接，同样被拒。env：哨兵经 real provider + loopback stub 注入（T-08 ⑥ 同法；mock 模式会 `delete P2SDK_LLM_API_KEY`，`app/sdk/src/start.ts:129`，证明不了什么），另注入不匹配上游 scrub 正则（`/KEY\|PASSWORD\|SECRET\|TOKEN/i`，`D/subprocess/subprocess/src/index.ts:47,66-69`）的 `X_AUTH`、`X_CREDENTIALS` 哨兵；bash `env` 输出不含任何哨兵。T-08 扫描器对 transcript、会话存储、日志扫描 0 命中，并带扫描器正对照（T-08 ④）。bot 写授权文件失败，文件哈希不变 |
| A4b | 拿到也用不了 | bash 自主连接 dsh gateway 和 LiteLLM（loopback）失败（与 A0 ① 同一断言，单列是为了防止 A0 被放宽时这条被一起放掉）。R5 附带回答「gateway 是否接受第二个连接复用同一个 launch token」，作为纵深防御的信息，不作为本条的通过条件 |
| A5 | ASK 往返不变 | 越界、升权、目录外读、连接器写操作 → 卡片只出现在发起它的 bot 里，挂在对应 callId 下（沿用 D3）；拒绝 → 没有副作用；仅一次 → 执行，下一次调用还会再问 |
| A6 | 典型任务安静 | J2 脚本（建脚本、用 `python` 跑（v2.1：不用 `sh`，验证工具链挂回）、读输出、写总结文件，共 5 次工具调用，全部在工作目录内、不联网）→ fake 断言审批卡 **= 0**；真模型冒烟同一提示词，记录实际卡片数，作为档位表回调的依据 |
| A7 | 连接器始终允许 | 对 bot X 的连接器写工具 T 点「始终允许」→ 本次执行，之后 X 调 T 都不出卡；bot Y 调 T 仍出卡；close + launch 后 X 依然不问；授权文件权限 0600，位于 `PBOTS_DATA_DIR` 且在 wrapper 遮蔽范围内（A0 ②）。**R6 存储不变量（v2.1，三条都要测）**：① **稳定工具身份**：授权键是 main 侧的 `(botId, serverName, rawName)`，serverName 取 main 的连接器配置，不用 dsh 归一化后带 hash 的 `mcp__…` 名；同一个 rawName 换到另一个 server 不继承授权；② **落盘成功才放行**：写盘成功后，才发布内存快照、才代答 allowed-once；③ **写失败没有内存授权**：模拟写盘失败（数据目录只读）→ 本次调用回到 ASK，UI 报错，内存里没有这条授权，下一次调用仍然出卡。另：坏文件不加载任何授权（A9 ②），存储复用 `store.ts` 的单写者队列和 tmp+rename |
| A8 | 列表与撤销；旧 bot 保守 | X 的设置 pane 列出「T · 始终允许」，撤销后下一次调用出卡，重启后仍处于撤销状态；cwd 不在 workspaces/ 下且未迁移的旧 bot：bash 照旧每次都问，卡片不显示「始终允许」，设置 pane 显示迁移入口（A11） |
| A9 | NEVER 优先与 fail-closed | 判定顺序固定为：NEVER（代码常量，不读配置，**在任何会话、任何 approvalPolicy 下都生效**）> 档位配置 > 常驻授权 > 故障回退；结果是 ASK 时，**approvalPolicy=never 的会话（子代理）一律拒绝，不放行**（v2.1，G1-r2 A-H1：现有 shell-ask 遇 never 直接 `next()`，泛化时必须改）。⑦ 子代理里调用 NEVER 类工具、ASK 类工具 → 都被拒，没有副作用；ALWAYS 类照常执行（且仍在 wrapper 内）。① NEVER 档工具被调用 → 不出卡，tool/result 报错并带原因；② 把档位文件或授权文件改坏（非法 JSON）→ ALWAYS 和 ASK 两类全部退回 ASK 并记日志，NEVER 仍是 NEVER；③ 在②的损坏状态下，对 NEVER 类调用尝试 `allowed-once` 批准 → 仍然失败、无副作用；④ bash 和文件工具的卡片上没有「始终允许」；⑤ wrapper 不可用（A0 ⑥）时第 1 行不生效，bash 退回逐次 ASK 或直接失败；⑥ D4 ①②③ 全部重跑通过 |
| A10 | 边界保留（P4B D9 继续生效） | D9 的拒绝测试全部照跑：`$events/result` 传 `'allowed-always'` 被拒；没有权限 preset 切换入口；danger-full-access 不可选。新的「始终允许」M1 方法只接受 eventId，工具名和 bot 由 main 从未决账本里反查，**只有「连接器写工具的 ASK 审批事件」才能写盘**：未决账本之外的 eventId、别的 bot 的 eventId、bash / 文件工具 / NEVER 类 / 提问事件（`user-questions/request`）的 eventId → 拒绝，并断言没有写盘。**`plugin_manager`（v2.1，G1-r2 A-H2 = B-H2）**：我们的 profile patch 从 standard 中移除这个工具，模型工具表里没有它；fake 仍然强行调用 `plugin_manager`（list、停用 shell-ask / 策略插件、安装 bundle 三种 action）→ 不出卡，tool/result 报错，profile 目录和 runtime-patch 的哈希都不变（移除 + NEVER 常量两道，防止后层 patch 把它加回来） |
| A11 | 旧 bot 迁移 **[Q-013 (e)]** | 按用户选项落地，推荐「迁移」：现有 bot（含主 bot）的设置 pane 有「迁移到独立工作目录」按钮，点击后创建 `workspaces/<botId>`，此后新建的会话 cwd = 该目录，A2 对它成立；迁移前的会话保持原 cwd，照旧全 ASK；不复制、不移动旧 cwd 下的任何文件；冷启动和任何自动流程都不触发迁移（断言：不点按钮，重启 3 次，旧 bot 仍是旧 cwd） |
| A12 | 中途打断 | fake 让 bot 自主连续执行（第 2 步是 `sleep 600`）→ 用户点停止，5 秒内（具体上限待 R4b：R4 ⑤ 没有回答，v2.1 补派）该 bash 子进程退出，之后不再发起新的工具调用；会话可以继续发消息 |
| A13 | 暂停自主 **[Q-013 (d)]** | 用户选「做」才有这一条：设置里一个全局开关，只能把 ALWAYS 收窄为 ASK，不能放宽任何一行；打开后 A2 的脚本每步都出卡，关掉后恢复；开关状态重启后保持；开关状态文件损坏时按「已暂停」处理 |
| A14 | 提问卡（R7） | 默认 standard preset 的模型工具表含 `ask_user_question`；fake 发问 → 只在对应 bot 的输入区出提问卡，另一个 bot 不出现；选项单选 / 多选 / 自由文本 / 跳过 / 整批提交，答案按同批 id 回到工具结果；取消、重连不重复提交；提问事件不能用 `allowed-once` 作答，审批事件不能用 answers 作答；离场 deadline 不得把审批用的 `rejected` 字符串当作问题的答案；未决账本不把提问事件记成 `toolName=undefined` 的审批（R7 ③ 的 ledger 隐患） |

## 7. 默认档位表草案 v2.1（**待用户确认**，Q-013 需按文末要点同步修订，类型：高风险 / 审批语义）
依据：用户原话（§1）授权的是**方向**：「一般是 bot 自己去完成，只有一些问题会询问」。具体档位必须由用户逐行确认（LEARNINGS 2026-11-02：审批默认值放宽属于安全红线）。v2.1：「现状」列按 R4 填实，「理由」列加原版对照（R1）。
**给用户的真实后果说明（G1-r1 A-H1 要求；v2.1 按 G1-r2 A-H3 / A-H4 / B-H1 改写；Q-013 必须原样带上）**：
1. dsh 自带的沙箱只拦写，不拦读，也不断网，今天在沙箱里 `ls ~/.ssh` 看得见。第 1 行的 ALWAYS 只有在我们加的 wrapper（bash 断网，遮住 HOME、数据目录和 dsh 运行目录）通过测试之后才生效，在那之前第 1 行保持 ASK。即使生效，bot 仍能只读系统目录（`/usr`、`/etc` 以及 HOME 之外其他对本用户可读的路径）。
2. **「无网络」只针对 bash。** bot 仍可以通过 web_fetch / web_search 访问公网（今天就不问，第 11 行），所以**凡是被 bot 读到的内容**（工作目录里的文件、你批准它读的文件、连接器返回的内容）都可能被它发出去，比如把内容拼进 URL。凭证文件之所以安全，是因为 bot 读不到它们（第 6 行，W1-AP-0 起任何工具、任何会话都读不到），而不是因为断网。
3. 沙箱里只有你的工具链目录（`~/miniconda3`、`~/.local/bin`、`~/.npm-global`）以**只读**方式挂回：conda base 环境里的 `python` 可以跑，但不能 `pip install` / `conda install`；HOME 下的其他配置（`~/.gitconfig`、`~/.config/*`）在沙箱里都看不到。
4. **升权：今天批准一次升权，这条命令就完全没有沙箱**（能读 `~/.ssh`、能联网、能写任何地方）。W1-AP-0 起先拒绝这种裸升权；受控升权路径（放开联网或某个写目录，凭证依然遮住）落地之前，bot 不能联网安装、也不能写工作目录以外的地方。
5. **今天子代理里的 bash 不问**（根会话每条都问）。W1-AP-0 起，子代理和根会话使用同一张表，表里是 ASK 的项目在子代理里直接拒绝。
6. **连接器的服务器进程不在沙箱里**，装连接器 = 信任它；本表只管 bot 调连接器时问不问你，管不了连接器进程自己读什么。
7. 原版的默认是**全部 ask**，你手动切到 always 之后 bot 才自主，而且 always 对这台机器上所有 bot 生效，不带沙箱（R1）。我们的草案是**默认 ALWAYS，但只在加固后的沙箱里**，bash 在卡片上没有 always。

| # | 类别 | 例 | 草案默认 | 现状（R4） | 卡片可点「始终允许」 | 理由 / 前提（含原版对照，R1） |
|---|---|---|---|---|---|---|
| 1 | bash，加固沙箱内（断网；HOME、数据目录、`DSH_HOME` 不可见；工具链只读挂回；只写本 bot 工作目录） | `ls`、`python x.py`（conda base，只读）、`echo > a.txt` | **ALWAYS**（A0 通过前为 ASK） | 根会话 ASK（shell-ask 必问），**子代理会话不问**；今天批准后可读 `~/.ssh`、可联网 | —（不出卡） | 核心改动。`/tmp` 每次调用私有，跨调用不保留；依赖 HOME 配置的命令（git 用户配置、用户级 pip）不可用，不能装包。**原版**：bash / 文件属于 global 类，每台机器三档（Never/Ask/Always），默认 ask；卡片上点 Always = 把整机档位改成 always，对所有 bot 生效，没有命令模式；allow-once 按（机器, action, 原始命令文本）精确复用 1 小时。**我们的差异**：自主边界交给 OS 沙箱，而不是整机开关；不做 1 小时复用（§8） |
| 2 | bash 升权（`sandbox_permissions` 宽于当前，含联网、写工作目录外） | `curl`、`pip install`、写 `~/x` | **ASK，只走受控升权路径**；落地前为**拒绝** | ASK（tool-bash 自带），**批准 = `danger-full-access`，这条命令没有任何沙箱**（escalation.ts:30-31，bash-sandbox index.ts:92-100） | **否** | 离开边界，每次都问，卡片显示完整命令；原版 ceiling 也会禁用 always。受控路径必须保留凭证遮蔽（§3、§10 D-1、A4 升权格） |
| 3 | ~~bash 联网~~ | — | **并入第 2 行** | — | — | wrapper 断网是全有或全无，联网只能走升权（v1 §9-Q3 的默认，v2 定稿） |
| 4 | 文件工具，工作目录内（realpath 后） | read / write / edit / grep / glob | **ALWAYS** | read / read_image / glob / grep 都不问；write / edit 普通写不问，越界写被沙箱拒绝，显式升权会问 | — | 与 1 一致；先 realpath，符号链接指出去的按第 5、6 行判。write / edit 的 `danger-full-access` 升权同第 2 行 |
| 5 | 文件读，工作目录外（realpath 后，非凭证） | read `~/notes.md` | **ASK**（approvalPolicy=never 的会话里为拒绝） | **不问，可读任意路径**（R4 #3/#7/#8） | **否** | 个人文件不该默认被自主读取，而且读到的东西可以经第 11 行发出去；bot × 工具名表达不了「读哪里」，所以不给 always。原版 read-file / list-directory 与 bash 同属 global 类 |
| 6 | 凭证路径（**读写都拒**） | `~/.ssh`、`~/.config/**/credentials*`、`~/.grokbot`、`PBOTS_DATA_DIR` 下 token 与授权文件、handoff 目录（含宿主 `/tmp/p2sdk-handoff-*`）、**`DSH_HOME`**（会话日志、profile、runtime-patch；R5：shell-env 会把它主动注入 bash 环境）、`~/.claude*`、HOME 外凭证（W1-AP-0 列出路径） | **NEVER** | bash 和文件工具今天都能读；文件工具还能写宿主 `/tmp` 下的 handoff | 否 | 「凭证不进模型」硬约束。文件工具：代码常量拒绝清单（realpath 后匹配，读写都拒）；bash：wrapper 遮蔽，看不见。**纯收紧，W1-AP-0 就落地，不等 Q-013** |
| 7 | 连接器工具，读（MCP `readOnlyHint=true`） | `mcp__x__search` | **ALWAYS** | 不问（MCP 调用默认直接执行） | — | **R4：hint 没有桥接到 pre-execute，main 也认不出哪个是读工具**。回退规则：元数据桥（§10 D-2）接好之前，所有连接器工具一律按第 8 行处理。原版：settings.json `toolPermissions` 的 `reads` 档 |
| 8 | 连接器工具，写或未标注 | `mcp__x__send`、`create_*` | **ASK** | 不问 | **是（按 bot × 工具）**，唯一可 always 的一行 | 未标注按写处理（fail closed）；授权键 = `(botId, serverName, rawName)`（A7 ①）。原版：`toolPermissions` 的 `writes` 档，三值 always_allow / needs_approval / blocked，**作用域是整台机器、按 server，所有 bot 共享** |
| 9 | 连接器工具，`destructiveHint=true` | `delete_*` | **ASK** | 不问 | **请用户定**（推荐：否） | 删除类不可逆，推荐逐次问。**回退规则（v2.1）**：元数据桥接好之前分不出删除类；用户若对本行选「否」，则在桥接好之前**任何连接器都不给 always**，否则用户的选择会被悄悄违背 |
| 10 | 权限 preset 切换 / `/permission` 命令 / configForms 写 / **`plugin_manager`（全部 action，含 list）** | — | **NEVER** | preset 等：NEVER（D9，只管 UI / RPC）；`plugin_manager`：ASK，一次批准就能永久改 profile、停用 shell-ask 和 wrapper、安装沙箱外的宿主代码 | 否 | v2.1：`plugin_manager` 从我们的 profile 中移除，另加 NEVER 常量兜底（A10）；**纯收紧，W1-AP-0 落地** |
| 11 | **web_fetch / web_search**（v2.1 新增） | 抓网页、搜索 | **ALWAYS**（= 现状，不放宽）；备选 ASK | 不问；web_fetch 只放行公网地址（`D/bundle/base/cordis.patch.yml:459-460`），连不到 loopback 上的 gateway / LiteLLM | — | **请用户定**。推荐 ALWAYS：调研类任务离不开它，选 ASK 会吵（死因 3）；它的风险在于外发**已读到的内容**，所以防线放在「读」这一侧（第 5、6 行），并在后果说明第 2 条写明。原版的 web 能力在云端，本地审批模型里没有这一类 |
| 12 | 其他进程内工具（v2.1 新增，补全 R4 的 32 个工具）：working_directory、todo、goal、schedule_*、skill、present、job_*、list_agents / send_message / interrupt_agent、subagent / subagent_fork / workflow、list_subagent_models | — | **ALWAYS**（= 现状） | 不问 | — | 只动会话内部状态，或者只派生子会话；子会话里的工具逐个按本表判定（A9 ⑦）。`schedule_create` 将来触发的工具同样逐个判定 |
| — | 向用户提问 `ask_user_question` | — | 不是审批，不进档位表 | 工具已加载，UI 不处理 | — | A14 |

**判定顺序**（A9）：NEVER 常量（任何会话、任何 approvalPolicy）> 档位配置 > 常驻授权 > 故障回退（ALWAYS/ASK → ASK，NEVER 不变）；结果是 ASK 时，approvalPolicy=never 的会话（子代理）直接拒绝，其他会话出卡。

请用户同时定五件事：
- **(a) 表中每一行**的档位，重点是 1、2、9、11 行。
- **(b) 「始终允许」的作用域**：v2 收窄为**只有连接器写工具**可以始终允许，按「每个 bot × 工具」记（Y 不继承 X 的授权）。备选是「所有 bot 共享」，**这就是原版的做法**（R1：`toolPermissions` 按机器 × server 存，对所有 bot 生效）。仍推荐按 bot：被提示注入的影响只限一个 bot。
- **(c) 是否在 bot 设置里按连接器调读 / 写档位**：原版在连接器详情页有 reads / writes 三值档位，外加 auto-review 标签页（R1 §4.4）。草案是**不做**，只做「列出 + 撤销」，档位表放在 profile 文件里，UI 只读显示。
- **(d) 要不要一个「暂停自主」开关**（A13）：全局一个，只能收窄回全 ASK。推荐：**做**（几十行，给用户一个随时收回的手柄）。
- **(e) 现有 bot（含主 bot）怎么办**（A11）：迁移（推荐，设置里点一次，之后新会话自主，旧会话不动）/ 新建一个主 bot 替换 / 保持全 ASK。

## 8. 非目标（放弃了什么、为什么）
- autoReview 二级审批：**R1 已答**，是用户写的自然语言 allow / block 指令，由云端 agent（LLM）复核，客户端只负责存储、同步和展示。属于「模型审模型」加云依赖，**定稿为非目标**；以后要做另开 slug。
- 原版 allow-once 的「同一命令 1 小时内复用」（R1 §2.1）：不做。第 1 行 ALWAYS 已经覆盖沙箱内的重复命令，沙箱外的命令每次都应该看一眼。
- 连接器服务器进程的沙箱化（R4：不继承 bash 的 OS 沙箱）：不做，写进 §7 后果说明第 6 条。
- Spend / 虚拟卡 / 花费仪式、连接器 OAuth 授权、Messages 授权、团队 ceiling：云依赖，或没有对应的使用场景。
- 改权限 preset、开放 danger-full-access：D9 保留，路线 1′ 不需要它们。
- bash 命令前缀规则，以及 bash / 文件工具的「始终允许」：§3 放弃路线 2 的理由，B-H3。
- 沙箱资源限制（cgroup / ulimit）：A12 的打断先兜底；跑飞问题真出现再加。
- 提问的 timed 模式、迟到答案（R7 候选 C）：要新增 M2 endpoint，等需求出现再做。整套 `dsh-client-ui-user-questions` 插件也不引（R7 候选 A，依赖本项目已放弃的 dsh client 运行时）。
- 协作工具（建子 bot、SendToAgent、记忆）：§1 附表；P6 候选。
- L-UI：§2.1 的不准入项；像素级逐点比对（基准只有截图，以并排加数值断言为准）。

## 9. 待用户确认（≤3，主会话一次问一个，按下面的顺序）
1. **Q1 = Q-013（高风险，阻塞 L-AP 中除 W1-AP-0 / W1-AP-q 以外的实现）**：§7 默认档位表 (a)–(e)，带上 §7 开头 v2.1 版的真实后果说明（7 条）。
2. **Q2 = Q-014（阻塞 U5 的基准选择，不阻塞 U1–U4）**：能否由你本人登录 0.78.1，按清单截约 10 张图（侧栏、会话流含 tool 行和审批卡、市场列表和详情、设置 pane、权限设置页，亮暗各一套），个人信息你自行打码后放到 `work/p5-parity/ref/`？截图过程不经过模型，凭证不进模型。不方便的话，按 R3 → 0.18 重建仓渲染的顺序降级；**降级后的验收口径**：参照覆盖不到的 0.78.1 项在 U5 标「未验证」，不算对齐（B-M3）。
3. ~~Q3~~：v2 已定稿（联网并入第 2 行，§7），不再单独问。

## 10. 待查（主会话派发，可并行；结果写 `work/p5-parity/reuse/` 或 `RE-*.md`）
状态（v2.1）：R1、R4、R5、R6、R7、R8 已回报并吸收；**R2、R3 仍在跑**（U3/U4、U5 基准标「待 R」）；新增 R4b 与两道 D 题（见本节末），由主会话派。
1. **R1 → reverse-engineer**（**已回报**，`RE-approval-model.md`）。结论：① 11 个 action 分 4 类（global / setting / subject / call），bash 和文件属于 global 类，每台机器三档，默认 `ask`（硬编码），ceiling 缺省不限且只能收紧；② approvals 是一次性批准账本，键为（机器, action, 精确 target），1 小时 TTL；standing grants 只给 subject 类（iMessage / use-app）；MCP 权限在 settings.json 的 `toolPermissions`（按 server 分 tools / reads / writes 三值）；③ always 有三种语义：global 类 = 改整机档位，subject 类 = 写 standing grant，call 类 = 不可用；④ autoReview = 云端 LLM 复核；⑤ 卡片按钮顺序 Allow（primary）→ Always allow（secondary，条件出现）→ Don't allow（tertiary，靠后），文案见 R1 §4（给 W2-AP）。差异已写进 §7 理由和后果说明第 7 条，非目标见 §8。原始题目如下：0.78.1 审批模型。目标产物：`/dev/shm/grok-re/0.78.1/app/dist/{local-exec-daemon/main.cjs, electron-main/main-core.cjs, renderer/assets/chunk-view-*.js}`。问题：① action 的分类枚举（renderer `j(o.action)` 一类的映射），以及每类的**默认** ceiling 从哪里来（用户设置、团队策略还是硬编码）；② `local-tool-approvals.json`、`local-tool-standing-grants.v1.json`、`local-tool-retirements.json` 的 schema 和作用域（machine / agent / tool / 参数模式），以及清除路径；③ autoReview 是什么，何时触发。附带：审批卡按钮的文案和顺序、always 被禁用时的 tooltip、设置页 permissions 节的结构（给 UI 用）。隔离要求：`HOME=/tmp/<目录>`，只做静态分析。
2. **R2 → reverse-engineer**（待 R）：0.78.1 视觉数值。目标：eager-app bundle 和 stylex CSS（766KB）。问题：① AUD 中 [78] 各项（A1 头部 New chat/New section、A15 市场入口、B9 审批卡、D1–D3 市场 overlay / tabs / Back，以及结论第 4 条列的反转气泡、corner-ring、titlebar、prose）在 0.78.1 的具体样式值；② 全部 `@keyframes`、transition 的时长和曲线，对应到组件；③ 输出：给 R8 表加一列「0.78.1 值」，直接作为 U3/U4 的规格。
3. **R3 → reverse-engineer（可行性，限时 0.5 天）**（待 R）：能否不登录、不联网，用桩 coordinatorPort 加 fixture 数据启动 0.78.1 renderer，渲染出侧栏、会话流、审批卡供截图？回答「能 / 不能 + 成本」。能的话产出参照截图。用 REA 的 AgentEnv 能力。
4. **R4 → scout**（**已回报**，`reuse/r4-tool-gates.md`）。结论：standard 默认 32 个固定工具，只有 bash（我们的 patch）和 plugin_manager 会问，write / edit 只在显式升权时问；read / glob / grep 可读任意路径，web_* 不问；MCP 调用不问，hint 没有桥接到 pre-execute，MCP 服务器进程不在 bash 沙箱里；缺省 cwd = runtime 启动目录；子代理 approvalPolicy 钉成 never。已填进 §7「现状」列、A4 入口表和 §1 的五个侧门。**④ 由 G1-r2 B-H1 的源码证据回答**（升权 = `danger-full-access`，跳过 confine）；**⑤ 没有回答，转 R4b**。原始题目如下（读 dsh 源码和我们的 profile）：① 默认 profile 下模型可见的工具全表，每个工具今天是否会触发 `approval/asked`，并标出**所有能读文件的入口**（A4 矩阵的行）；② 连接器（MCP）工具调用是否经过审批，dsh mcp-client 是否把 `readOnlyHint` / `destructiveHint` 暴露给 `tools/pre-execute` 的 exec 上下文；**连接器子进程是否在沙箱内运行**；③ session/create 省略 cwd 时，实际 cwd 是什么，沙箱可写根是否等于它；④ **v2 新增**：`sandbox_permissions` 升权获批后，这一条命令拿到的是 danger-full-access 还是逐项放宽；⑤ **v2 新增**：dsh 有没有单轮工具调用上限，用户停止时 bash 子进程怎么被终止、多久（A12）。
5. **R5 → scout**（**已回报**，`reuse/r5-sandbox-probe.md` + `evidence/r5-probe.mjs`，最终证据 `evidence/r5-run-qXloBM/`）。结论：wrapper 接缝已实证可行（`--unshare-net` 断网；在挂载之后追加 `--tmpfs` 遮蔽目录；工作目录写不受影响）；配置 id 是 `sandbox`；`runnerFailureSignatures: ['bwrap: ']`；shell-env 会把 `DSH_HOME` 等变量主动注入 bash（已加进 §7 第 6 行和遮蔽清单）；普通 `P2SDK_*` 变量会继承，不得用它们装凭证。**没有回答的**：② 中的 fail closed、③ token 复用、⑤ HOME 外凭证路径，转为 W1-AP-0 的验收或任务内容（A0 ⑥、A4b 附注、§7 第 6 行）。原始题目如下：① `runnerCommand` + wrapper（`--unshare-net`；`--tmpfs` 遮蔽 `$HOME`、passwd home、`PBOTS_DATA_DIR`、handoff 目录；遮蔽之后重新 `--bind` 工作区）在本机能否跑通，A0 ①–⑤ 的探针结果，含 stock profile 正对照。注意：现有草稿 `evidence/r5-run-5lSrb9/bwrap-wrapper.py` 把 `--tmpfs` 插在 profile 的 `--bind` 之后，工作区在 HOME 下时会被一起遮住，必须补上重新 bind；② 配置 `runnerCommand` 后是否确实跳过 Landlock 选择；wrapper 不可执行或拒绝 profile 时，bash 是失败还是不带沙箱执行（A0 ⑥）；③ gateway 是否接受第二个连接复用同一个 launch token；④ env：核对上游 scrub（`D/subprocess/subprocess/src/index.ts:47,66-69`）是否覆盖所有注入点，列出不匹配该正则、但实际注入了的敏感名；⑤ 本机 HOME 之外有哪些凭证路径（只列路径，不读内容），供 §7 第 6 行和遮蔽清单使用。测试 HOME 放在 `/tmp` 之外（§6）。
6. **R6 → scout**（**已回报**，`reuse/r6-grant-format.md`）。结论：自建最小 schema `{version:1, grants:[{botId, …}]}`，持久化复用 `store.ts` 模式（第 5 级，四家逐级否决的理由见 R6 §5）。v2.1 把 R6 的 `toolName` 改成稳定身份 `(serverName, rawName)`（R6 §6 自己也要求「绑定宿主稳定、无歧义的 ID」）；三条存储不变量写进 A7。原始题目如下（GitHub）：常驻授权的规则格式和持久化，找在维护的上游复用：opencode permission 配置、openai/codex 的 approval policy / execpolicy、Claude Code 的 permissions allow 规则。给出格式选型、许可证、维护状况。已知负证据：dsh 没有持久审批存储（§3 上游复用）。v2 只需覆盖「bot × 连接器工具」这一种键。
7. **R7 → scout**（**已回报**，`reuse/r7-ask-user.md`）：结论「第二档：事件在，作答 / UI 链路要补」，估 1–2 工程日。**决定：进本 slug**（用户原话「只有一些问题会询问」就是这个通道），走 R7 推荐路线：Host 和运输集成上游，问答 UI 改造自 `D/client/ui-user-questions/src/client/{QuestionComposer.tsx, QuestionReplyView.tsx}`（第 3 级，文件头写来源 `deepseek-ai/deepseek-harness@ce7073d5…`），不引整插件，不做 timed。R7 ③ 指出的 ledger 隐患（任何 waterfall 都被当成审批，deadline 会给提问代答 `rejected` 字符串）是今天就存在的缺陷，单列一个不依赖 Q 的修复任务（§11）。
8. **R8 → reverse-engineer / Explore**（**已回报**，`RE-visual-residual.md`）：83 行闭集，open→in 6 项，§2.1 预判全部命中。U1 直接引用，W1-UI 任务面据此确定（§11）。
9. **C2 契约问题 → 用户 C2**（= Q-015，v2 有变化，主会话同步修订，见文末）：
   - ① M1 新增 `pbots/approvals.alwaysAllow {eventId}`（main 反查工具和 bot，**只接受连接器写工具的 ASK 审批事件**，写授权文件，**写盘成功后**再代答 allowed-once），以及 `pbots/approvals.list {sessionId}`、`pbots/approvals.revoke {sessionId, …}`（v2.1：撤销键改为稳定身份 `{serverName, rawName}`，不用归一化后的 toolName，A7 ①）；
   - ② #3/#4 的 cwd 改由 main 强制为 `workspaces/<botId>`，renderer 传入则拒绝；
   - ③ P4B D3「UI 没有始终允许入口」改为「**仅连接器写工具的 ASK 卡**可始终允许」，D9 其余条款保持不变；C §4 不变式「renderer 只发 allowed-once / rejected」对审批事件保持不变（always 不走 `$events/result`）；
   - ④ SDK 侧 shell-ask 由「必问」泛化为按档位查表，含 NEVER 常量、文件工具 realpath 判定（approval.yml 语义变更，属于 Q-013 的落地，Q-013 答复前不合入）；
   - ⑤ **v2 新增**：M1 新增 `pbots/bots.migrateWorkspace {botId}`（A11，取决于 Q-013 (e)）；
   - ⑥ **v2 新增**：提问事件的作答——M1 按未决账本里的事件类别分支，审批仍只接受二值，提问事件接受严格校验的 `{answers:[{id, selected, custom?}]}`（R7 ③），不对任意 `outcome.value` 放开；
   - 实现等 Q-013 和 Q-015 都批准后再开工；W0 调研、W1-AP-0（只收紧）和 ledger 判别修复不受影响。
10. **R4b → scout**（v2.1 新增，补 R4 ⑤）：dsh 有没有单轮工具调用上限；用户停止时，bash 子进程（含 wrapper 下的 bwrap 进程树）怎么被终止、需要多久。答案定 A12 的时限。
11. **D-1 → /panel D**（v2.1 新增，W1-AP 首批，PLAN 出题）：**受控升权路径**。题干：上游升权只有 `danger-full-access` 一档，而且这一档跳过 confine；我们需要「放开联网或某个写目录，凭证遮蔽始终保留」。选项：① 我们的插件注册一个受控执行入口（复用同一个 wrapper，按批准内容去掉 `--unshare-net` 或多 bind 一个写目录，遮蔽清单不变），pre-execute 把获批的升权请求改走这个入口；② wrapper 读取 pre-execute 为本次调用写下的一次性许可（由 main 签发，用后作废）；③ 不做，联网和工作目录外写在本 slug 内一直不可用。验收统一为 A4 升权格。
12. **D-2 → scout 先查，再 /panel D**（v2.1 新增，W1-AP 首批）：**MCP 元数据桥**。R4 §3 的结论是「集成 pipeline + 最小 bridge 适配」：在 mcp-client 注册工具时保留可信的 `(serverName, rawName, annotations)`，供策略查询。scout 先查上游 dsh 是否已有，或计划提供这类元数据（复用优先），再定是自建一个 bridge，还是一直按「全部未标注」处理（§7 第 7–9 行的回退规则）。

## 11. 波次建议（PLAN 细化）
- **W0（并行，不写代码）**：R2、R3、R4b、D-2 的 scout 部分在跑；R1、R4–R8 已完成。
- **W1-UI（frontend-dev，现在可开工；U3/U4 部分等 R2）**：用户要求「UI 先」，所以 W1-UI 最先开工。任务面按 R8 定：
  - **侧栏**：A2 搜索（过滤本地 bot 列表）、A13 折叠态（≤130px 容器查询，折叠宽 88）；
  - **会话流**：B7 thinking 行、B13 独立会话头（品味项，交 GU）、B14 时间分隔 / 未读线；
  - **全局 token**：E5 token 层 L1/L2 降 0.5px；
  - **断言**：19 个 fixed 项 + 6 个 in 项的 U2 computed-style 断言（不改样式，只补测试；暴露偏差就回修）。
  每页走 ux-proposer×2 → frontend-dev → verifier → GU 一轮。审批卡的视觉归 W2-AP，避免冲突。
- **W1-AP-0「全入口纯收紧」（builder，review M，R5 已回报，现在可开工，不等 Q-013；v2.1 按 G1-r2 扩大范围，PLAN 可以拆成几条任务，彼此可并行）**。每一项都只收紧、不放宽，在今天的状态下就有收益：
  - **0a wrapper**：`id: sandbox` 的 `runnerCommand` + `runnerFailureSignatures`；挂载顺序按 §3 ①（断网 → 遮蔽 HOME / passwd home / 数据目录 / `DSH_HOME` / handoff → 只读挂回工具链 → 重新 bind 工作区 → 对工作区之下的遮蔽路径再遮一次，做不到就 fail closed）；顺带列出 HOME 外的凭证路径（R5 ⑤，只列路径）→ A0 ①–⑧、A4b、A3 中 bash 的部分；
  - **0b 文件工具 NEVER 常量**：凭证清单，realpath 之后匹配，读写都拒，包括宿主 `/tmp/p2sdk-handoff-*` 和 `DSH_HOME` → A4 读入口、写入口两组格；
  - **0c `plugin_manager`**：从 profile 移除，再加 NEVER 常量 → A10 的 plugin_manager 格；
  - **0d 拒绝裸升权**：所有工具的 `danger-full-access` 升权由 pre-execute 拒绝 → A4 升权格的前半、A3 的升权部分；
  - **0e 子代理与根会话同一套判定**：NEVER 在任何 approvalPolicy 下都生效；ASK 在 never 会话里改为拒绝（今天子代理 bash 不问；在 Q-013 答复前，第 1 行仍是 ASK，所以子代理里的 bash 会被拒）→ A4 会话列、A9 ⑦。
- **W1-AP-q（builder，review M，不等 Q）**：ledger 按事件类别判别、deadline 不给提问代答审批字符串（R7 ③，修今天就有的缺陷）。
- **W1-AP 首批设计（director 出题 → /panel D，不写代码，可以和 W1-AP-0 并行）**：D-1 受控升权路径、D-2 MCP 元数据桥（§10）。
- **W1-AP（builder，review M，等 Q-013 + Q-015 + W1-AP-0 + D-1/D-2 裁决）**：SDK 档位策略（shell-ask 泛化，按 §7 查表；NEVER 常量沿用 0b/0c）+ 受控升权路径 + MCP 元数据桥（如果 D-2 选做）+ 授权存储（R6 schema 和三条不变量）+ 工作目录强制 + 迁移 → A1、A2、A4 升权格的后半、A7 的存储部分、A9、A11、A12（时限等 R4b）。
- **W2-AP（frontend-dev，review M）**：卡片三态、设置 pane 授权列表和撤销、迁移按钮、暂停开关（如选）、提问卡、新 M1 方法接入 → A5、A7、A8、A10、A13、A14。
- **W3 收口**：U5 GU、A6 真模型冒烟、整分支 `mm-review L`。

## 12. v3 增量：L-UI 改为「移植 0.18 前端 + 同数据并排对照」（覆盖 §2 L-UI 边界、§6 U1–U5、§11 W1-UI；L-AP 不变）

### 12.1 用户原话与真实诉求
用户（2026-11-03，Q-014 答复）：「这个逆向出来的不是很准，或者说 UI 风格不太一样，颜色也好，里面的很多 bot 的动画都不太行。重新做，我截图也没有办法全部截出来。你不如直接把这个 grok bot 0.18 的这个，先做出来，然后 1 比 1 对照去对比？我记得前端好像是 opus 5.5 去开发的」。
真实诉求：**整体观感像原版**（配色氛围、构件形态、bot 头像动画），而不是「差异清单逐项打勾」。验收的参照必须是**能跑起来的完整原版渲染**，不能是截图或逐项数值（LEARNINGS 2026-11-03 末条）。「opus 5.5 开发」无法核实是指我们 P4 的 frontend-dev 还是 0.18 重构仓作者；两种情况结论相同：问题出在**视觉来源**，不在执行模型（见 12.3）。

### 12.2 0.18 仓可移植性评估（`repos/grok-bot-0.18-reconstructed` @a9f633e，只读）
| 面 | 事实（全部本次实读） | 对移植的含义 |
|---|---|---|
| 是什么 | `frontend/` 是可编辑的 React/TS 渲染器重构（322 文件、约 5.4 万行，`frontend/README.md`：「selected by the default macOS package」）；入口 `frontend/src/main.tsx` 只挂 `ProductionRenderer`（3734 行，140 个 import），**不依赖**原版 bundle。原版 bundle 只在 `DevShell` / fidelity 诊断路径用（`upstream.ts`、`vite.config.ts` 的 `/upstream`）。仓根 README 自己承认它「not a pixel-perfect replacement」 | 能独立构建运行；保真度高于我们（它直接搬原版样式），但不等于原版，所以仍需 0.78.1 对照收口 |
| 框架 / 依赖 | React 19（我们 18.2）、Vite；外部依赖只有 `react`、`react-dom`、`@tiptap/*`（composer 富文本）；跨目录引用 `source/` 共 7 处（`shared/rpc/coordinator{,-port}`、`shared/sand-timeline-events`、`packages/proto/.../tools_pb`） | 依赖面小；renderer 升 React 19（旧 renderer 本来就要退役，不做兼容）；`source/` 那 4 个模块随树一起复制 |
| 样式体系 | 主题由 `recovered/features/runtime-theme-token-installer.ts` 运行时注入 `:root`（130 色板 + `--cursor-*` 映射 + 半径，**数据驱动**，值是 0.18 的：accent `#1084fe`，0.78.1 为 `#1680f3`）；组件 CSS 直接带原版 stylex 原子类（如 `view.css:79-82` `.sand-1jq8d06`）和 `@evidence` 字节锚点；`color-mix` 15 处、半透明 rgba 23 处 | 换 0.78.1 色板 = 换一张数据表（我们已有 0.78.1 推导表 `app/ui/renderer/theme/sand-tokens.css` 与 `work/p1-re/evidence/gen-tokens.py`），不改组件 |
| 动效 | 14 个 `@keyframes`，曲线族按组件区分（`.16,1,.3,1`、`.77,0,.175,1`、`.22,1,.36,1` 等）；**bot 头像是 SVG persona 引擎**（`onboarding/signed-in/character.tsx` 329 行：8 种形状 × 11 色，rAF 驱动，状态 thinking / searching / working / loading / orbit / sending，跟随指针，reduced-motion 分支；`conversation/workspace/agent-avatar.tsx` 按 dsh 活动映射状态，注释写明「原版没有首字母回退」） | 「bot 动画不行」的主因在这里，整件搬即可，只需在 shim 里提供 `currentActivity` |
| 数据层 | 只认两个窗口对象：`window.coordinatorPort.claim()` 交付 MessagePort，帧格式 `{kind:'lifecycle'|'request'|'reply'|'event'}`，`COORDINATOR_PROTOCOL_VERSION = 1`（`production/coordinator-client.ts:10,99-162`）；`window.desktop` 桥（`recovered/contracts/desktop-bridge.ts`，约 100 个方法）。renderer 调用的 coordinator RPC 共 64 个，事件族约 15 个（agents / agent-upserted / transcript / tray / subagents / async-tasks …） | **帧格式与 0.78.1 相同**，只差版本号（R3 实测 0.78.1 为 3，`RE-stub-boot.md` §3）→ 同一个 shim 可同时喂 0.18 移植版和原版 0.78.1 bundle |
| 与我们三桥的耦合面 | 我们实际用得到的 RPC 约 12 个：`listAgents` `searchAgents` `countAgents` `createAgent` `updateAgent` `openAgentTail` `getAgentTranscriptTail`/`Window` `sendPrompt` `resolveLocalToolPermission` `setAgentUnread`，加 `agents` / `agent-upserted` / `transcript` 三个事件族；其余约 50 个回空集 / null / 能力关（`getTrays→[]`、`getForeverBoxStatus→null`、`isAgentNetworkEnabled→false`）。最重的一块是 **dsh 事件 → coordinator transcript entry 的序列化**（消息 role/content、tool 行 name/summary/status、`local-tool-permission` ask 卡，形状 R3 已逆出） | shim 放 renderer 侧，下接我们现有 carrier（M1/M2），**C2 契约与 main 的 D9 守卫不动**；审批作答仍只发 `allowed-once` / `rejected` |
| 运行时资产 | 字体、图标、图片按原版 hash 名从 0.18 安装包取（`frontend/manifests/renderer-runtime-assets.json`）；仓的 bootstrap 用 `hdiutil`（只有 macOS 能跑）；本机有 `research-archives/original/0.18.0/` 的 dmg 与 Windows `Setup.exe`（LFS 已拉到实体，155MB / 126MB），无 7z | 资产提取交 reverse-engineer（12.8 R9）；退路是用 0.78.1 解包树里的同名资产 |
| 能直接搬（第 3 级，私用不分发） | `frontend/src/**` 整树、`source/` 中被引用的 4 个模块、`frontend/manifests/*` | 文件头写 `来源: github.com/b-nnett/grok-bot-0.18-reconstructed@a9f633e:<path>`，**不改上游文件**，以便日后对比 |
| 要适配 | ① shim（新写，约 1 个 builder 任务）；② 色板数据换成 0.78.1；③ 0.18 → 0.78.1 的构件差异（R2 已列：侧栏头 icon 行、条目高 54、Connect apps 药丸、tool 裸行、审批卡 r24、titlebar 44/52、市场 overlay），用「我们自己的覆盖文件」实现，不就地改上游文件；④ 我们没有的功能（computer、org-chart、routines、voice、sharing、channels…）由 shim 返回能力关来隐藏，隐藏不了的入口才用覆盖文件屏蔽 | 见 12.6 新任务面 |
| 0.18 仓本身能否跑 | 整仓**不能**在本机跑：打包链只支持 macOS（hdiutil、codesign），Node 要求 ≥26.5（本机 22.23），后端 `source/` 依赖 Cursor 云。**前端能跑**：`vite build` 后按 R3 的方法在 headless Chrome 里注入 preload 桩 + fake coordinator 即可挂载（与 R3 跑 0.78.1 同法，未实测 → 12.8 S0 首次验证） | 对照不靠 0.18 的后端，靠我们的 shim / fixture |

**「1:1 移植」的准确含义（定稿）**：**整树搬前端、在它的契约之下换数据层**，不是「以它为视觉源逐组件重做」。理由：逐组件重做就是 P4–P5 一路走过的老路（我们的组件 + 抄来的数值），观感差距正是这样产生的（12.3）；而它的数据契约（coordinatorPort + desktop 桥）很窄、和 0.78.1 同构，在契约下面接 shim，比在 140 个 import 的 `ProductionRenderer` 里替换数据层改动少得多，也让上游文件保持原样。

### 12.3 观感差距根因：「数值对、看起来不对」的系统性原因
（对照依据：0.78.1 R3 渲染 `work/p5-parity/ref/r3-conv-light.png` 与我们的 `vfy-see-exp-light.jpeg`；代码依据如列）
1. **组件来自 dsh 骨架，只是换了 token 皮**。我们的组件消费 `--dsw-*` 别名层（`app/ui/renderer/theme/dsw.css`），token 值是 0.78.1 的，但「哪个面用哪个 token」是推断出来的（文件里有「席 A 更正」「席 A 增补：不映射就残留 DeepSeek 蓝」这样的注释）。值对、指派错，误差会在每个面上累积。0.18 树直接用 `--cursor-*` / `--sand-*`，并带原版的 stylex 原子类。
2. **构件形态不同，而审计的颗粒度是「差异行」**。截图对比：原版侧栏头是 40px 圆形 elevated 按钮，composer 是单行药丸（r9999，左 `+`、右麦克风），底部有 Connect apps 药丸，条目没有副标题和时间列；我们是小 icon 钮、「市场」行、方框 textarea、蓝色选中底。这些都是组件结构，不是 token。R8 的 83 行闭集只收「已识别的差异」，整屏构图从来不在闭集里，所以逐项清零之后仍然不像。
3. **头像内容从未进过审计**。原版头像是 SVG persona 角色并带状态动画（12.2 动效行）；我们是纯色圆加首字母（`app/ui/renderer/plugins/bots/Sidebar.tsx:53-55`）。R8 A6 只量了 34px 尺寸。这是用户「bot 动画不太行」的直接原因，也说明盒模型审计看不见「元素里画的是什么」。
4. **动效是 JS 驱动的，CSS 断言测不到**。persona 用 rAF，状态随活动切换；我们只有 6 个通用 keyframes（flash / breathe / spin / rise / pop / indeterminate，`app/ui/renderer/shell/app.css`），曲线零散。U4 计划只断言 `transition-duration` / `timing-function`，测不到这一类动效。
5. **版本混用**。token 取 0.78.1（accent `#1680f3`），R8 中「fixed」项的依据是 0.18 值（accent `#1084fe`、条目 58 等，PLAN 决策 17 已发现），布局沿用 dsh。三个来源拼在一起，单项都有出处，整体却不属于任何一个版本。
6. **透明叠色依赖底色**。原版大量使用半透明 token（`*-translucent`、rgba、`color-mix`），观感取决于下面那层底；别名映射一旦把某层底换成另一层，同一个 token 的颜色就「对但不像」。
**已排除**：色彩空间。两边主色板都是 sRGB hex，我们的 oklch 只出现在 syntax 高亮 token（`sand-tokens.css:1108-1119`）。字体也已一致（XVF / XVF Mono / cursor-icons，取自原版资产）。
**规则**（写进 LEARNINGS 由主会话执行）：观感对齐以「可运行的完整参照 + 同数据并排」为准；数值断言只用来防回归，不作为「像」的证据。

### 12.4 路线（强制双方案）
| | 路线 U-1 · 移植 0.18 前端 + 共用 shim（**选**） | 路线 U-2 · 直接用 0.78.1 原版 bundle 当我们的 renderer + 同一个 shim | 路线 U-0 · 维持现状继续逐项修 |
|---|---|---|---|
| 做法 | 12.2「1:1 含义」；用 R2 清单和并排差异，把 0.18 往 0.78.1 推 | R3 已证明能挂载（Chrome + 桩）；shim 按 v3 协议实现，原版 bundle 不改 | P5-16 / 17 / 15.f* 继续 |
| 保真度 | 0.18 级，0.78.1 差异要逐项补（有清单） | 0.78.1 原样，构造上就一致 | 已被用户否定 |
| 可改性 | 源码可改：提问卡（A14）、审批卡的 L-AP 语义、隐藏死入口都能做 | 压缩 bundle 改不了：A14 提问卡加不进去，只能在压缩代码上打补丁；出 bug 无法调试；约 200 个 RPC 都有回值校验器（R3 §3），一个形状不对就是 malformed | — |
| 代价 | 移植 + shim + 差异补齐，约 5–7 个任务 | shim 面更大（v3 方法表约 200+），改不了 UI | 无限打磨（§4 死因 2 已发生） |
**放弃 U-2 的理由**：本 slug 的 L-AP 一定要改 UI（提问卡 A14、审批卡只对连接器写工具给「始终允许」），U-2 做不到，或者只能靠给压缩代码打补丁，日后无法维护；它也不是用户点名的方案。**保留 U-2 的价值**：原版 bundle 作为**对照参照**（12.7），以及 S0 失败时的后备，届时作为 D-3 交 /panel。
**放弃 U-0 的理由**：用户已否定；12.3 第 1、2 条说明继续逐项修不能收敛。
**语言（默认，不问）**：原版是英文，「1:1」即英文界面；我们现有中文文案（「市场」「发送第一条消息开始」）随旧 renderer 一起退役。用户反对再加 i18n。

### 12.5 逆向一问（L-UI v3 版）
三个月后失败，最可能的死因：① **shim 序列化不对**，移植版在 fixture 下很漂亮，接上真实 dsh 事件流后大量 entry 显示「Couldn't render this」（R3 局限 1 已见过 entry 级 boundary）→ 防线：S0 必须走通一条真实旅程（LEARNINGS 2026-11-02「能构建 ≠ 能跑」），P5-51 用真实 fake-LLM 事件流做 e2e，并对每类 entry 断言「boundary 计数 = 0」；② **死入口**：大量原版功能入口点了没反应，比旧 UI 还糟 → 防线：U4′「静息态零死入口」；③ **两套 renderer 并存**，旧的迟迟不退役，每个功能写两遍 → 防线：移植启动后旧 renderer 冻结（只修阻断性 bug），切换任务 P5-54 设硬期限：P5-51 合入后即排。

### 12.6 L-UI 的 DONE 条款 v3（替换 §6 的 U1–U5；U6 保留并扩展）
| # | 条款 | 证伪方式 |
|---|---|---|
| U0 | 可行性（S0） | 0.18 `frontend/` 在隔离目录 vite build 成功；在 headless Chrome 中注入桩（协议 v1）后：侧栏列出 3 个 fixture bot（persona 头像 SVG 存在，`data-grok-state` 有值）；点开一个 bot，transcript 渲染出用户消息、tool 行、assistant 消息、`local-tool-permission` 卡；从 composer 发一条消息，fake coordinator 收到 `sendPrompt` 且帧合法；全程 entry 级 boundary（「Couldn't render this」）计数 = 0。任一项失败 → 回 director，按 12.4 改走 U-2 出 D-3 |
| U1′ | 并排差异闭集清零 | 对照台（12.7）对每个参照视图 × 亮暗输出「原版 0.78.1 \| 移植版」截图对和 computed-style 差异表；差异表每一行都有终态：`fixed@<sha>`、`等价`（附理由），或 `waived:<产品没有该功能 / L-AP 产品裁决 / 原版 bug>`；空状态或理由不在枚举内 → FAIL。R2 清单（`RE-visual-078-values.md`）中的每个具名数值都必须出现在差异表里 |
| U2′ | 数值防回归 | R2 / R8 已有数值断言迁移到新 renderer 的选择器，亮暗各一条；断言条数不少于迁移前（`visual*.spec.ts` 计数对比） |
| U3′ | bot 动画 | fake 让 bot 依次思考 → 跑 bash → web_fetch：侧栏与会话头的头像 `data-grok-state` 依次为 `thinking` → `working` → `searching`，空闲时回到静息态；同一 bot 在两次启动之间形状和颜色不变（按 agentId 确定）；`emulateMedia({reducedMotion:'reduce'})` 下 `data-reduced-motion="true"` 且 rAF 不再推进（连续两帧 SVG 节点属性相同）；对照台抽帧：原版与移植版在同一状态、同一时间点的头像帧并排存档 |
| U4′ | 静息态零死入口 | 4 个主视图（侧栏、会话、市场 overlay、设置 / info pane）中可见的每个可点击元素，点击后要么有可观察的效果（DOM 变化或 RPC 发出），要么被隐藏；脚本遍历 `button, [role=button], a`，列出「点击后无 DOM 变化且 shim 未收到 RPC」的元素，结果为 0 |
| U5 | 并排对照（保留，基准变更） | 基准 = 对照台用**同一份 fixture** 驱动的原版 0.78.1 渲染（不再是截图）；GU 只跑一轮，REVISE 转一次性修复清单，终态 = U1′–U4′ 全绿 + 用户目视 |
| U6 | 不回归（扩展） | P4 D1–D12 的行为 e2e 改为指向新 renderer 后全绿；P5-11 / P5-12 已合并的**行为**（侧栏搜索过滤、≤130px 折叠、thinking 行展开收起、时间分隔阈值 ≥900000ms 或跨自然日、未读线恰 1 条）在新 renderer 上各有一条 e2e 并且全绿 |

### 12.7 对照方法（具体流程）
0.18 仓无法整体运行（12.2 最后一行），所以对照台不依赖它的后端，而是**一份 fixture、两个（三个）渲染器**：
1. **对照台 = R3 harness 的泛化**（`work/p5-parity/harness/grok-r3/{serve,stub-init,drive}.mjs`，移入 app 测试支撑目录）：`stub-init` 拆成「桥桩」+「fixture 驱动的 coordinator」，按渲染器发 `protocolVersion` 1 或 3。
2. **fixture 一份**：3 个 bot（含主 bot）、一段会话（用户消息、thinking、bash 与 read 两种 tool 行、assistant markdown 含代码块、待决审批卡、跨 15 分钟的时间分隔、1 条未读），亮暗各一套。对两个协议版本的 entry 形状差异由 fixture 序列化层吸收（S0 时对照两边的 entry 校验器确认）。
3. **左 = 原版 0.78.1**（`/dev/shm/grok-re/0.78.1/app/dist/renderer/`，重启丢失时按 RE-unpack §0 重建）；**右 = 移植版的 build**；两边都用 headless Chrome、1440×900@2、随机调试端口、每次运行独立 profile（R3 踩过的坑）。
4. **每个视图产出**：截图对（拼成「ours | ref」）；对选择器清单逐个做 computed-style dump 并 diff，输出 U1′ 差异表；头像状态抽帧（同一时间点）。
5. **第三列（P5-54 之后加）= 我们真实的 Electron 应用**：由 fake LLM 驱动、产生与 fixture 等价的会话，截同样的视图。它与右列的差异只可能来自 shim 或真实数据，从而把「移植保真」和「数据接入」两类问题分开。
6. 视图清单：侧栏（展开、折叠）、会话（静息、运行中、待决审批）、市场 overlay、设置 / info pane；亮暗各一套。

### 12.8 待查（v3 新增，主会话派）
- **S0 → reverse-engineer（限 0.5–1 天；U0 即其验收）**：在 `/tmp/bot-s0-*` 隔离目录完成 0.18 `frontend/` 的 vite build（独立 node_modules，不碰 `repos/` 树），用 R3 方法以协议 v1 挂载，并走通 U0 的旅程；同时回答：① 0.18 与 0.78.1 的 transcript entry 形状差异（字段级）；② 0.18 前端对 `window.desktop` 实际调用了哪些方法、哪些在启动阶段必须有回值；③ `ProductionRenderer` 中哪些入口（computer / org-chart / routines / voice …）能被能力开关隐藏，哪些不能。
- **R9 → reverse-engineer（可与 S0 合派）**：不用 sudo、不用 hdiutil，从本地 0.18 Windows `Setup.exe` 或 dmg 提取 `frontend/manifests/renderer-runtime-assets.json` 列出的资产，按其中的 sha256 逐个校验；无法提取时，列出可以用 0.78.1 同名资产替代的项。临时目录用 `/tmp/bot-r9-*`（LEARNINGS：沙箱前缀）。
- **D-3 → /panel D（只在 S0 失败时出题）**：U-2「原版 bundle 当 renderer」与「回退 U-0」二选一。

## 修订账
| 版本 | 编号 | 改了什么 | 为什么 |
|---|---|---|---|
| v1 | — | 首版 | Q-012 用户原话（2026-11-03） |
| v2 | A-H1 | 路线 1 改为路线 1′「加固沙箱即边界」：`runnerCommand` + wrapper（断网，遮蔽 `$HOME` / passwd home / 数据目录 / handoff，遮蔽后重新 bind 工作区）；新增 A0 并立为 W1-AP 第一个任务 W1-AP-0（不等 Q-013）；R5 改为验证 wrapper；§1 改写「凭什么换」，补「今天批准的 bash 也能读 `~/.ssh`」；§3 删除 v1 退路「沙箱内 ASK + 始终允许」，改为「wrapper 证伪 → bash 保持逐次 ASK」；§7 开头加「真实后果说明」，第 1 行写明 A0 通过前为 ASK | 上游 profiles.ts:17-21 / :29-34、fs-sandbox index.ts:7-8 证实 stock 沙箱只拦写，席 A 本机实测 `ls ~/.ssh` 可见；R5 草稿数据（外网、loopback 均 200）与之一致；用户不能在错误前提下确认第 1 行 |
| v2 | A-H2 | §6 新增「测试 HOME」规则：L-AP 沙箱用例用 `~/bot/.test-homes/p5-<任务>`，不在 `/tmp`；新增「正对照规则」（stock profile 先跑通、断言看错误码）；A3 加 EROFS 正对照；A4 env 哨兵改走 real provider + loopback stub。「bwrap / Landlock 双跑」改为 A0 ⑥ fail-closed 测试 | `--tmpfs /tmp` 会盖住 `/tmp` 下的测试 HOME，A3 / A4 必然空过；mock 模式删 key（start.ts:129）；配置 `runnerCommand` 后上游跳过 runner 选择（index.ts:46-55），Landlock 不再可达，需要测的是 wrapper 失效时是否 fail closed，这一点交 R5 ② 实测确认 |
| v2 | A-H3 | 新增 A11 旧 bot 迁移（用户触发，不自动；旧会话不动、不搬文件）；§7 新增 (e) 交用户选「迁移 / 新建主 bot / 保持」；A8 加迁移入口；旅程 2 写明主 bot 先迁移；C2 ⑤ 新增 `bots.migrateWorkspace`；§4 死因 3 补「主 bot 没变」 | 现有主 bot 创建时没传 cwd（orchestrate.ts:118），按 A8 永远全 ASK，而 Q-012 问的就是主 bot；B-M2 同指 |
| v2 | A-H4 | 新增 A4b「bash 经 loopback 连 gateway / LiteLLM 必须失败」（与 A0 ① 同断言，单列防放宽）；wrapper 遮蔽清单加 handoff 目录；R5 ③ 问 token 复用；§4 死因 1 写入这条攻击链 | main 断线复用同一 launch token（main/index.ts:196-206），D9 守卫只在 main；`--unshare-net` 从根上断掉 loopback |
| v2 | B-H1 | A9 改写：判定顺序 NEVER 常量 > 配置 > 授权 > 故障回退；损坏时只把 ALWAYS / ASK 退回 ASK，NEVER 不降；加「损坏状态下批准 NEVER 调用仍失败、无副作用」；§7 第 6 行和表下写明 NEVER 是代码常量 | v1「全部退回 ASK」会把 NEVER 降成用户可批准，故障反而放宽 |
| v2 | B-H2 | A4 改为「执行入口 × 凭证」矩阵：bash + R4 列出的全部可读文件工具 + 连接器（待 R4），每格断言拒绝；加两格符号链接（bash 现建、预置）；文件工具判定先 realpath，复用上游 `containment.ts`；R4 ① 要求标出全部读入口，R4 ② 加「连接器子进程是否在沙箱内」 | fs-sandbox 读取不受限（index.ts:3-8），v1 只测 bash；A-M2 符号链接同指 |
| v2 | B-H3 | 「始终允许」收窄为只有连接器写工具（§7 第 8 行，第 9 行请用户定，推荐否）；第 3 行并入第 2 行，第 2、5 行明确「否」；A7 / A10 / C2 ① ③ 同步；A10 加「bash / 文件工具 / 提问事件的 eventId 拒绝写盘」 | v1 中 A10「越界类不可 always」与表第 3、5 行可 always 自相矛盾；bot × 工具名表达不了 bash 的类别；A-M1 同指 |
| v2 | A-M1 授权键缺类别 | 采纳，由 B-H3 一并消解：bash 没有任何 always 入口，键里不需要类别；A9 ④ 断言卡片无按钮，A10 断言方法层拒绝 | 与 B-H3 同根 |
| v2 | A-M2 符号链接 | 采纳，并入 B-H2（A4 两格符号链接 + realpath） | 同上 |
| v2 | A-M3 暂停自主开关 | 采纳为 Q-013 (d)，推荐做；配 A13（只能收窄，状态文件损坏按已暂停） | 只收窄、不违反 D9，几十行代码，给用户一个随时收回的手柄 |
| v2 | A-M4 失控上限 | 采纳：新增 A12 中途打断、§4 死因 4、R4 ⑤；资源限制（cgroup）记入非目标 | 自主连续执行必须停得下来；cgroup 等真出现跑飞再加 |
| v2 | A-M5 U5 REVISE 无出口 | 采纳：U5 写明 GU 只一轮，REVISE 转一次性修复清单，终态 = U2-U4 绿 + 用户目视 | 不改的话 U5 要么不可达，要么变成死因 2 |
| v2 | A-L1 A6 ≤1 | 采纳：fake 断言 = 0，真模型只记录 | 放宽会藏回归 |
| v2 | A-L2 引用错误 | 采纳：§1 改引 profiles.ts 并写明局限，删 roots.ts:9 | roots.ts 只定义可写根 |
| v2 | A-L3 `/tmp` 行为 | 采纳：写进 §3 代价和 §7 第 1 行；R5 ① 删去已有答案的「写 /tmp」问题 | 源码已有答案（profiles.ts:19） |
| v2 | A-L4 env scrub | 采纳：R5 ④ 缩为核对 scrub 覆盖面；A4 加不匹配正则的 `X_AUTH` / `X_CREDENTIALS` 哨兵 | 上游已 scrub，剩下的风险在正则覆盖不到的名字 |
| v2 | B-M1 R5 后端矩阵 | 采纳并改写：配了 `runnerCommand` 后只有 wrapper 一个后端，矩阵缩为「wrapper 生效 / wrapper 失效 fail closed」两格（A0 ⑥、A9 ⑤、R5 ②） | 上游跳过选择，Landlock 不可达；不凭「装了 bwrap」判准入 |
| v2 | B-M2 旧 bot 旅程 | 采纳，并入 A-H3（A11 + A8 迁移入口，不做隐式迁移） | 同根 |
| v2 | B-M3 U5 降级口径 | 采纳：U5 加「未验证」标记规则；§9-Q2 写明降级后的口径，交 Q-014 同步 | 0.18 渲染只能证明与旧版一致 |
| v2 | R7 输入 | ask-user 进本 slug：新增 A14、旅程 2 补提问、§1 附表加一行、C2 ⑥；ledger 隐患单列 W1-AP-q（不等 Q）；A10 加提问事件拒绝；非目标加 timed / 整插件 | 用户原话「只有一些问题会询问」就是这个通道；成本 1–2 天；ledger 把 waterfall 全当审批是今天就有的缺陷 |
| v2 | R8 输入 | U1 闭集改为直接引用 R8（83 行），U2 断言范围定为 19 fixed + 6 in；§2.1 记录「预判全中、B15 已修」；§11 W1-UI 任务面按页列出，现在可开工 | R8 已给闭集与锚点 |
| v2 | 自查 | 发现 R5 草稿 wrapper 把 `--tmpfs` 插在工作区 `--bind` 之后，工作区在 HOME 下会被遮住，写进 R5 ① 要求补重新 bind；wrapper 遮蔽 passwd home 而不只是 `$HOME`（测试 HOME 在真实 home 之下，只遮 `$HOME` 会让真实 `~/.ssh` 在测试中可见） | 读 `evidence/r5-run-5lSrb9/bwrap-wrapper.py` 与 bwrap 挂载顺序 |
| v2 | 待 R | R1–R6 未回报：U3/U4（R2）、U5 基准（R3）、A4 入口全表 / 连接器 hint / 升权语义 / 打断时限（R4）、wrapper 实测（R5）、授权格式（R6）、作用域与默认 ceiling（R1），均标「待 R」，回报后出 v2.x | 不阻塞 v2 |
| v2.1 | G1-r2 #1 A-H1 子代理 never 侧门 | A9 判定顺序改为「NEVER 在任何会话、任何 approvalPolicy 下都生效；结果是 ASK 时 never 会话拒绝」，新增 A9 ⑦；A4 加会话列（subagent / subagent_fork / workflow）；§7 第 1 行「现状」写明子代理 bash 今天不问；§7 后果说明第 5 条；W1-AP-0 0e | `child-agent.ts:243-254` 把子代理钉成 never，`shell-ask.mjs:45` 遇 never 放行；照这个骨架泛化，子代理会绕过 NEVER |
| v2.1 | G1-r2 #2 A-H2 = B-H2 plugin_manager | §7 第 10 行加 `plugin_manager`（全部 action）= NEVER，从 profile 移除并加常量兜底；A10 加「list / 停用策略 / 装 bundle 均不出卡、profile 哈希不变」；§3 ③ 同步；W1-AP-0 0c | standard 默认带它（`standard.patch.yml:125-127`），一次批准就能永久改 profile、装沙箱外宿主代码（`plugin-manager/src/tools.ts:87-104,140-152`）；D9 只管 UI |
| v2.1 | G1-r2 #3 A-H3 read→web_fetch 外发链 | §7 新增第 11 行 web_fetch / web_search（草案 ALWAYS = 现状，备选 ASK，请用户定）和第 12 行（其他进程内工具，补全 32 个）；后果说明改写：「无网络」只针对 bash，读到的内容都可能经 web 外发（第 2 条）；第 6 行凭证 NEVER 拒读清单定为纯收紧，提前到 W1-AP-0 0b；§1 列出五个侧门 | R4 #3/#7/#8/#29/#30 都不问；外发链不经过 wrapper，原说明对用户是错误陈述 |
| v2.1 | G1-r2 #4 A-H4 工具链消失 | wrapper 在遮蔽 HOME 之后 `--ro-bind` 挂回工具链白名单；A0 ⑦（`command -v python`、`sys.prefix` 与宿主一致，且只读）；A6 改用 `python`；§7 第 1 行的例子保留 `python x.py` 并注明 conda base 只读；§3 代价、§4 死因 3、后果说明第 3 条 | 本机 python / pip / conda 在 `~/miniconda3`，pnpm 在 `~/.npm-global`，uv 在 `~/.local/bin`，`/usr/bin/python` 不存在（director 复核 `command -v`） |
| v2.1 | G1-r2 #5 B-H1 裸升权绕过 wrapper | §3 新增「升权不能是裸升权」：W1-AP-0 0d 拒绝所有工具的 `danger-full-access` 升权；受控升权路径进 W1-AP 首批，作为 D-1 出题；A4 加升权格（批准之后仍读不到哨兵）；A3 的升权部分分「落地前拒绝 / 落地后出卡」；§7 第 2 行「现状」写明批准 = 无沙箱；后果说明第 4 条 | `escalation.ts:30-31` workspace-write 只能升到 danger-full-access；`bash-sandbox/src/index.ts:92-100` 该模式跳过 confine（director 已核对源码）。R4 ④ 由此回答 |
| v2.1 | G1-r2 #6 B-M1 挂载验收自相矛盾 | A0 ② 改测具体哨兵不可见 + 宿主哈希不变，不再断言 `PBOTS_DATA_DIR` 本身不存在；A3 改为「宿主不存在、内容不变」，接受影子写入落进私有 tmpfs；EROFS 断言改用未遮蔽的 `/var/tmp/bot-p5-outside`，正对照保留 | 工作区重新 bind 后祖先必然存在；tmpfs 可写（R5 L85）。影子写入不改宿主，也方便需要写 `~/.cache` 的工具，所以不另做只读遮蔽 |
| v2.1 | A-M 连接器 hint / 授权身份 | §7 第 7–9 行写明回退规则（元数据桥接好之前全部按第 8 行处理；第 9 行选「否」则任何连接器都不给 always）；授权键改为 `(botId, serverName, rawName)`；C2 ① revoke 键同步；新增 D-2 元数据桥 | R4 §3：hint 没有桥接到 pre-execute；工具名经过归一化并带 hash，同名不同 server 会继承授权（R6 L200） |
| v2.1 | A-M 连接器进程不在沙箱 | A4 去掉连接器列；后果说明第 6 条；§8 非目标加「连接器进程沙箱化」 | R4 L89；原 A4 连接器格按 v2 写法不可能通过 |
| v2.1 | A-M 工作区是遮蔽路径的祖先 | wrapper 加「重新 bind 之后再遮一次，做不到就 fail closed」；A0 ⑧ | 旧 bot 的 cwd 是 runtime 启动目录（R4 §4），可能包含 `app/sdk/.dsh` |
| v2.1 | A-M DSH_HOME 与拒写 | §7 第 6 行加 `DSH_HOME`，改为读写都拒；wrapper 遮蔽清单加 `DSH_HOME`；A0 ②、A4 加 `DSH_HOME` 哨兵和写入口格 | R5：shell-env 主动把 `DSH_HOME` 注入 bash；R4 L102：文件工具能写宿主 `/tmp`，handoff 只防读不防写 |
| v2.1 | A-LOW U2 规则表 | U2 加规则表 fixed 3 项（有数值就断言，没有就写明） | R8 L10 |
| v2.1 | R1 输入（= B-M2 部分） | §7 理由列加原版对照（global 类整机三档、默认 ask、卡片 always 改整机档位、1h 精确复用；连接器 `toolPermissions` 按 server、全机共享）；(b) 写明「所有 bot 共享 = 原版」；(c) 补原版 UI；后果说明第 7 条；§8 autoReview 定稿为非目标，加「不做 1h 复用」；§1 ② 改为已答；§10.1 改为结论引用 | `RE-approval-model.md` §1–§4 |
| v2.1 | R4 输入（= B-M2 部分） | §7「现状」列全部填实（不再写「待 R4」）；A4 入口按全表；§1 列出五个侧门；§10.4 改为结论引用；④ 由 B-H1 回答，⑤ 转 R4b；A12 时限标「待 R4b」 | `reuse/r4-tool-gates.md` 已在 v2 定稿前落盘，v2 没有吸收（两席同指） |
| v2.1 | R5 输入（= B-M2 部分） | 配置 id 改为 `sandbox`（§1、§3、A0）；证据引用从 `r5-run-5lSrb9` 改为最终的 `r5-run-qXloBM`；`runnerFailureSignatures` 取实测值；未答的 ②（fail closed）、③、⑤ 转为 W1-AP-0 验收或任务内容；§10.5 改为结论引用 | `reuse/r5-sandbox-probe.md` L62、L151：误写 id 时 overlay 静默不生效 |
| v2.1 | R6 输入（= B-M2 部分） | §3「上游复用」写明自建最小 schema（第 5 级，有反向确认）+ 复用 `store.ts` 模式；A7 写入三条存储不变量（稳定身份、落盘成功才放行、写失败没有内存授权）；C2 ① 改为「写盘成功后才代答」；§10.6 改为结论引用 | `reuse/r6-grant-format.md` §1、§5、§6；G1-r2 汇总要求写进授权任务的验收 |
| v3 | Q-014 答复（L-UI 路线） | 新增 §12：0.18 可移植性评估、观感根因 6 条（排除色彩空间）、路线 U-1 / U-2 / U-0 三选一（选 U-1，U-2 留作参照与后备 D-3）、DONE U0 / U1′–U4′ 替换 U1–U4、U5 基准改为同 fixture 驱动的原版渲染、U6 扩展到已合并的行为、对照台流程、S0 / R9 / D-3 待查；§2 中 L-UI 的「R8 闭集为边界」由 U1′ 差异闭集取代 | 用户 2026-11-03 原话（§12.1）；R3 已证明原版 bundle 可用桩挂载（`RE-stub-boot.md`）；0.18 与 0.78.1 的 coordinator 帧格式相同、只差版本号（`coordinator-client.ts:10,99-162`） |
| v2.1 | 待 R | R2（U3/U4）、R3（U5 基准）仍在跑；新增 R4b（打断时限）、D-1（受控升权）、D-2（MCP 元数据桥）；§11 W1-AP-0 扩为 0a–0e，W1-AP 首批先出 D-1/D-2 | R2/R3 不阻塞 W1-AP-0 和 W1-UI 的 U1/U2 |

## 附：Q-013 需主会话同步修订的要点（director 不改 QUESTIONS）
1. 「背景 / 核心模型」改写：「沙箱内自主」的前提从「R5 证实沙箱生效」改为「我们加的 wrapper（断网、遮住 HOME 和数据目录）通过 A0 测试」；原样附上 §7 开头的「真实后果说明」（stock 沙箱只拦写，今天 `ls ~/.ssh` 可见；生效后仍可只读系统目录）。
2. 第 1 行：ALWAYS，加注「A0 通过前为 ASK」，并写明 ALWAYS 下 bot 能做 / 不能做什么（写仅工作目录、无网络、HOME 不可见、`/tmp` 不跨调用）。
3. 第 2 行：范围扩为「升权，含联网、写工作目录外」，ASK，不可始终允许，卡片显示完整命令。
4. 第 3 行：删除「ASK 可始终允许」与「默认并入 2，无异议不用答复」，改为定稿「并入第 2 行」。
5. 第 5 行：「ASK 可始终允许」改为「ASK，不可始终允许」，按 realpath 判定。
6. 第 6 行：补「NEVER 是代码常量，配置损坏、常驻授权都不能改变它」，清单补 handoff 目录和「R5 列出的 HOME 外凭证」。
7. 第 9 行：「是否允许始终允许请你定」后加推荐「否」。
8. (b) 改为：只有连接器写工具可以始终允许，作用域每 bot × 工具（备选所有 bot 共享）。
9. 新增 (d)：「暂停自主」全局开关，只能收窄，推荐做。
10. 新增 (e)：现有 bot（含主 bot）怎么办：迁移（推荐）/ 新建主 bot / 保持全 ASK。
11. 「阻塞」字段改为「L-AP 中除 W1-AP-0（沙箱加固，只收紧）与 W1-AP-q（ledger 修复）以外的实现」。
12. 选项 A 的文字同步为「整表按 v2 草案确认（含 b = 仅连接器 × 每 bot、c = 不做、d = 做、e = 迁移）」。

连带（不属 Q-013，同样由主会话执行）：**Q-015** 按 §10.9 更新 ①③ 的措辞（仅连接器写工具），并新增 ⑤ `bots.migrateWorkspace`、⑥ 提问事件作答分支；**Q-014** 在背景里补 B-M3 的降级口径（覆盖不到的 0.78.1 项标「未验证」）。

### v2.1 增量（在上面 12 条之后追加，主会话同步到 Q-013 / Q-015）
13. 「真实后果说明」整段换成 §7 开头 v2.1 版的 7 条，原样带上。新增的内容：无网络只针对 bash，读到的东西可能经 web 外发；工具链只读挂回，不能装包；今天批准升权 = 无沙箱，W1-AP-0 起先拒绝；子代理 bash 今天不问；连接器进程不在沙箱里；原版默认全部 ask。
14. 第 1 行的例子保留 `python x.py`，加注「conda base 环境只读挂回，可以运行，不能 `pip install`」；「现状」改为「根会话每条都问，子代理里不问」。
15. 第 2 行改为「ASK，只走受控升权路径（凭证始终遮住）；该路径落地前直接拒绝」，「现状」写明「今天批准 = 这条命令没有任何沙箱」。
16. 第 5、6 行：第 6 行加 `DSH_HOME`，改为「读写都拒」，并注明「W1-AP-0 就落地，不等你答复」；第 5 行注明「子代理里为拒绝」。
17. 第 7–9 行加回退规则：分清读、写、删除需要元数据桥（D-2），桥接好之前所有连接器按第 8 行处理；第 9 行选「否」，则桥接好之前任何连接器都不给 always。
18. 第 10 行加 `plugin_manager`（全部 action）= NEVER，注明「纯收紧，W1-AP-0 落地」。
19. **新增第 11 行 web_fetch / web_search**：草案 ALWAYS（= 现状），备选 ASK，请用户定；(a) 的重点行改为 1、2、9、11。
20. 新增第 12 行「其他进程内工具」= ALWAYS（= 现状），作为信息列出，无异议不用答。
21. (b) 补一句「所有 bot 共享就是原版的做法（R1）；推荐按 bot」；(c) 补原版的连接器 reads / writes 三值档位 UI。
22. 「阻塞」字段：W1-AP-0 的内容扩为「全入口纯收紧」（wrapper、文件工具凭证常量、移除 `plugin_manager`、拒绝裸升权、子代理同表），仍然**不等 Q-013**；注明在 Q-013 答复前，子代理里的 bash 会被拒绝。
23. 选项 A 的文字同步为「整表按 v2.1 草案确认（含第 11 行 = ALWAYS）」。
24. **Q-015 增量**：① 写盘成功后才代答 allowed-once；revoke 的键改为 `{serverName, rawName}`（稳定身份），不用归一化后的 toolName。
