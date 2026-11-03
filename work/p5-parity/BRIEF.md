# BRIEF · p5-parity（UI 对齐原版 + 审批自主化）

v2 · 2026-11-03 · director（Opus 5.5）· 回应 G1-r1 REVISE（`panels/G1-r1.md` 必须回应清单 7 条 HIGH，逐条处置见文末修订账）
v1 · 2026-11-03 · 首版
输入：QUESTIONS Q-012 答复（用户 2026-11-03 原话，见 §1）、`p4-ui/BRIEF.md` v1.3（下称 P4B）、`p4-ui/RE-visual-audit.md`（下称 AUD）、`p1-re/RE-features.md` L91、`p3-contract/CONTRACT.md` v1.4（下称 C）§4/§8、`p2-sdk/PLAN.md` T-07/T-08/T-12、Q-008/Q-009、`app/sdk/profile/patches/approval.yml`、`app/sdk/src/policy/shell-ask.mjs`、LEARNINGS；v2 新增 `panels/G1-r1{,-A,-B}.md`、`reuse/r7-ask-user.md`（下称 R7）、`RE-visual-residual.md`（下称 R8）。
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
- **凭什么换**：原版把安全边界放在档位（ceiling NEVER/ASK/ALWAYS）和常驻授权（standing grants）上，不靠每次弹窗。我们要把「人点一下」换成「OS 拦得住」，因为后者能自动化证伪。**但 dsh 自带的沙箱只拦写，不拦读，也不断网**（G1-r1 A-H1）：bwrap profile 是 `--ro-bind / /` 且没有 `--unshare-net`（`D/sandbox/sandbox-local/src/profiles.ts:17-21`）；Landlock 是 `readOnly:['/']`（同文件 :29-34）；进程内文件栅栏「Reads pass through untouched」（`D/fs/fs-sandbox/src/index.ts:7-8`）；席 A 用相同参数在本机实测，`ls ~/.ssh` 可见。所以本 slug 必须先**加固沙箱**：用上游接缝 `runnerCommand`（`D/sandbox/sandbox-local/src/index.ts:46-55`，「Override the runner argv; bwrap-compatible profile arguments are appended」，属搬运阶梯第 2 级：配置加包装层）接一个小 wrapper，补上断网和 HOME 遮蔽（§3、A0）。
- **顺带的事实**：今天用户批准的每一条 bash 同样可以读 `~/.ssh`、可以联网。所以沙箱加固（W1-AP-0）本身就是净收紧，不依赖 Q-013，可以先做。
- **没证明的部分**（写进 §9 和 §10，不假装成立）：① wrapper 在本机能否同时做到断网、遮蔽 HOME 与数据目录、工作目录仍可写，并在 wrapper 不可用时 fail closed（R5 正在验证；初步数据 `evidence/r5-run-5lSrb9/summary.json` 显示默认 profile 下外网和 loopback 都返回 200，与 A-H1 一致，**终稿待 R5 回报**）；② 原版默认档位（R1）；③ 原版登录后的真实外观，目前没有运行态截图（AUD 局限 2，RE-ui-shell L3），L-UI 的「一致」缺基准（§9-Q2、R3）。

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
| 做法 | ① **先加固**：sandbox-local 配 `runnerCommand` 指向我们的 wrapper，wrapper 在上游追加的 profile 参数之后、`--` 之前插入：`--unshare-net`，`--tmpfs` 遮蔽 `$HOME`、passwd 记录的真实 home、`PBOTS_DATA_DIR`、`PBOTS_DSH_HANDOFF`，再按原顺序**重新 `--bind` 工作区**（bwrap 按顺序挂载，遮蔽必须排在 `--ro-bind / /` 之后，重新 bind 必须排在遮蔽之后）。② 新 bot 的 cwd 固定为 `$PBOTS_DATA_DIR/workspaces/<botId>`。③ 加固后的沙箱内，普通 bash 和工作目录内的文件读写直接执行（ALWAYS）；升权（含联网、写工作目录外）以及文件工具读工作目录外，逐次 ASK，**不可始终允许**；凭证路径和权限 preset 切换为 NEVER（代码常量）。④ 连接器工具按读写分档：读 ALWAYS，写 ASK；**只有连接器写工具**的 ASK 卡提供「始终允许」，按 bot × 工具记住，bot 设置页可以列出、撤销 | 保持全部 ASK，只给卡片加「始终允许」，持久化命令前缀 / 工具规则，用户点一阵子之后逐步变安静 |
| 对上原版 | ceiling 档位 + 卡片 APPROVED/DENIED/ALWAYS + standing grants + 读写分开（RE-features L91） | 只对上卡片三态 |
| 代价 | 多一个 wrapper（几行，挂上游接缝，不改上游代码）；HOME 被遮蔽后，依赖 `~/.gitconfig`、用户级 pip 的命令会在沙箱里失效；`/tmp` 在 bwrap 下每次调用都是私有 tmpfs（profiles.ts:19），跨调用经 `/tmp` 传文件会丢；联网只能逐次升权。shell-ask 要从「必问」改成按档位查表（SDK 策略泛化）；cwd 要由 main 强制（契约变更） | 第一天的体验和现在一样；bash 前缀规则有已知坑（`git status && rm -rf …`），要做复合命令拆分，等于自建一个小解析器；而且 stock 沙箱不拦读和网络，前缀规则对 `cat ~/.ssh/x` 的拦截只能靠解析 |
| 可证伪性 | 断网、遮蔽、越界都能用 E2E 自动打，并带正对照（A0、A3、A4、A4b） | 「点得够多就安静了」没法证伪 |

**放弃路线 2 的理由**：它保留了用户抱怨的摩擦，等于没回应 Q-012。前缀匹配还要多造一个解析器，安全上也更脆。路线 2 里有用的部分（ASK 卡上的「始终允许」）已经并入路线 1′，但只给连接器工具，按 bot × 工具名记，所以没有解析器。
**为什么不是 v1 的路线 1**：v1 的前提「dsh 沙箱拦得住」对读取和网络不成立（§1），按 v1 把第 1 行设为 ALWAYS，bot 就能自主读整个 HOME 并外发。v1 的退路「沙箱内 ASK + 始终允许」继承同一个问题（对 bot × bash 点 always 就等于 ALWAYS），v2 删除。
**路线 1′ 的前提与退路**：W1-AP-0（wrapper）的 A0 带正对照通过，第 1 行才能从 ASK 改为 ALWAYS。R5 或 W1-AP-0 证伪 wrapper 方案时，L-AP 降级为「卡片三态 + 连接器始终允许 + 提问卡」，bash 保持逐次 ASK，并带数据回 G1，不硬上。
**wrapper 不可用时 fail closed**：上游文档写明，非空 `runnerCommand`「asserts full enforcement and skips built-in selection and probing」（index.ts:46-55），所以配置了 wrapper 后不会再退到 Landlock。wrapper 拒绝 profile 时由 `runnerFailureSignatures` 识别（同文件 :56-63），R5 要实测：此时 bash 是失败，而不是不带沙箱执行（A0 ⑥）。

**上游复用（已查）**：dsh 的 `ApprovalOutcome = 'allowed-once'|'rejected'|'cancelled'|'unavailable'`（`D/interaction/user-approval/src/types.ts:32`），**没有 always**。`ui-approval` 的 `onAlways` 只有 experimental/cua 一个调用方（`cua/src/client/ApplicationApproval.tsx:44`）。所以「始终允许」的持久化和匹配要我们自己写一层，正确位置是现有的 `tools/pre-execute` 策略（shell-ask 泛化）。规则格式先让 scout 找在维护的上游（R6），不凭空设计。文件工具的路径判定复用上游 `D/fs/fs-sandbox/src/containment.ts` 的 `isPathUnder` / canonicalize（先 realpath 再判包含），不自写。

## 4. 逆向一问：三个月后失败，最可能的死因
1. **自主权漏出去**（L-AP，最致命）：用户按「沙箱生效」批了第 1 行 ALWAYS，而沙箱实际不拦读、不断网；bot 被连接器内容做了提示注入，自主 `cat` 到 `~/.claude*/settings.json` 再 curl 外发，或者读到 launch token，经 loopback 直连 dsh gateway，绕过 main 侧的全部 D9 守卫给自己升权（main 断线时复用同一个 token 重连，`app/ui/main/index.ts:196-206`，说明 token 可重复使用）。测试却全绿，因为测试 HOME 在 `/tmp` 下，被 bwrap 的 `--tmpfs /tmp` 盖住了。防线：A0 wrapper 带正对照，先于任何 ALWAYS；A4 按「执行入口 × 凭证」矩阵逐格断言，包括符号链接；A4b loopback 必须失败；测试 HOME 移出 `/tmp`；NEVER 是代码常量，配置损坏也不降级（A9）；授权文件在 bot 可见范围之外（A4、A7）；bash 没有任何「始终允许」入口（A9、A10）。
2. **没有基准的无限打磨**（L-UI）：没有登录后的截图，GU 席只能凭感觉判「像不像」，一轮接一轮。防线：§2 证据准入、R8 闭集（83 行）、U2 数值断言、GU 只跑 1 轮，并且 U5 写明 REVISE 之后怎么收口（一次性修复清单，不再开第二轮）、§9-Q2 请用户给参照截图；降级基准下 0.78.1 特有项标「未验证」，不让 GU PASS 自动抹掉。
3. **改了还是很吵，或者主 bot 根本没变**：① 加固后联网和 HOME 都不可用，`pip install`、`git` 用户配置之类的常见操作全变成升权卡，用户照样点个不停；② 现有主 bot 的 cwd 不在 `workspaces/` 下（创建时没传 cwd，`app/ui/main/m3-meta/orchestrate.ts:118`），按旧 bot 规则永远全 ASK，而用户每天用、这次问的恰恰是主 bot。防线：A6 用典型 5 步任务计数卡片（fake 断言 = 0）；真模型冒烟记录实际卡片数，偏高就回来调档位表；A11 提供用户触发的迁移动作，并作为 Q-013 (e) 交用户选。
4. **自主失控**：本机在跑 GPU 训练（CLAUDE.md §4），bwrap 只有 `--unshare-pid`，没有资源限制；自主连续执行时 bot 跑飞，用户停不下来。防线：A12 中途打断；R4 回答 dsh 单轮工具调用上限。

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
| U2 | 数值落地 | R8 的 19 个 fixed 项和 6 个 in 项，凡规格列有数值的（如 A4 min-height 58、B1 行距 22、B8 radius 10 / padding 14·16、A13 折叠宽 88、E5 0.5px），在 `visual.spec` 里各有一条 computed-style 断言，亮暗两套都跑；断言条数 < 有数值项数 → FAIL。R8 局限 1（token 解析链可能有间接偏差）由这批断言暴露，暴露出的偏差按 fixed 项回修 |
| U3 | 0.78.1 特有项 **待 R2** | R2 回报的 0.78.1 值（[78] 项 + 动效）逐条按 0.78.1 落地，0.18 值不再作为这些项的依据；断言同 U2 |
| U4 | 动效 **待 R2** | R2 列出的过渡 / keyframes：断言 transition-duration 和 timing-function 等于原版值；`prefers-reduced-motion: reduce` 下全部动效时长 ≤ 0.01s |
| U5 | 并排对照 | 每个参照视图（来源按 §9-Q2 的答案：用户截图 > R3 渲染 > 0.18 重建仓渲染）生成「ours \| ref」拼图，亮暗各一张；/panel GU **只跑一轮**：两席 PASS 即通过；REVISE 时，两席发现转成一次性修复清单，修完后以 U2-U4 断言全绿 + 用户目视作为 U5 终态，不开第二轮。基准降级到 R3 或 0.18 时，参照覆盖不到的 0.78.1 项在 U5 报告里标「未验证」，GU PASS 不能消除这一标记 |
| U6 | 不回归 | P4 的 D1–D12 E2E 和单测在 main 上全绿 |

**L-AP**
| # | 条款 | 证伪方式 |
|---|---|---|
| A0 | 沙箱加固（W1-AP-0，不依赖 Q-013） | 配置 `runnerCommand` wrapper 后，fake 让 bot 执行的 bash 探针：① `curl` 外网、`curl 127.0.0.1:4001`（LiteLLM）、`curl <dsh gateway base-url>` 全部失败；② `test -e $HOME/.ssh`、`test -e <passwd home>/.ssh`、`test -e $PBOTS_DATA_DIR`、`test -e $PBOTS_DSH_HANDOFF` 全部为假；③ `$CWD` 可写，且写入在宿主侧可见；④ 宿主 `/tmp` 不可见；⑤ 正对照：同一组探针在 stock profile 下，①有至少一项成功、②有至少一项为真（否则这条测试不算数）；⑥ wrapper 不可执行或拒绝 profile 时，bash 调用失败、命令没有执行（探针命令写一个标记文件，断言标记不存在），不出现「无沙箱执行」 |
| A1 | 每个 bot 一个工作目录 | 新建 bot 后，follow header.cwd = `$PBOTS_DATA_DIR/workspaces/<botId>`，目录存在；renderer 传入其他 cwd → main 返回 `pbots/invalid-args`，dsh 没有收到调用 |
| A2 | 沙箱内自主 **[Q]** | 前提：A0 绿。fake 让 bot 依次执行 bash `echo hi > $CWD/a.txt`、`cat $CWD/a.txt`，再调 write/read 工具：全程 0 张审批卡，`approval/asked` 计数为 0，文件存在 |
| A3 | 越界拦截 **[Q]** | bash 写 `$HOME/outside`、写 `$CWD/../outside` → 返回 EROFS / ENOENT 一类错误且宿主上文件不存在（正对照：stock profile 下写 `$CWD/../outside` 得到 EROFS，证明探针命中了写栅栏）；bash 请求升权（含联网）→ 出卡，卡片显示完整命令，不显示「始终允许」。**绝不出现「无卡且越界写入成功」** |
| A4 | 凭证：执行入口 × 凭证矩阵 | 凭证哨兵：测试 HOME 下的 `~/.ssh/id_sentinel`、`~/.config/x/credentials-sentinel`，`PBOTS_DATA_DIR` 下的 launch token 与授权文件，handoff 目录。执行入口：bash（`cat`、`find ~ -name '*sentinel*' -exec cat`、`env`），以及 R4 列出的全部可读文件工具（read / grep / glob / list 等，**待 R4** 给全表），连接器工具（**待 R4**：连接器子进程是否在沙箱内）。每一格断言：读取被拒或目标不可见；另加两格符号链接：bash 在工作目录里 `ln -s <哨兵目录> k` 之后，read 工具读 `k/…` 被拒（先 realpath 再判定）；workspace 内预置指向哨兵的链接，同样被拒。env：哨兵经 real provider + loopback stub 注入（T-08 ⑥ 同法；mock 模式会 `delete P2SDK_LLM_API_KEY`，`app/sdk/src/start.ts:129`，证明不了什么），另注入不匹配上游 scrub 正则（`/KEY\|PASSWORD\|SECRET\|TOKEN/i`，`D/subprocess/subprocess/src/index.ts:47,66-69`）的 `X_AUTH`、`X_CREDENTIALS` 哨兵；bash `env` 输出不含任何哨兵。T-08 扫描器对 transcript、会话存储、日志扫描 0 命中，并带扫描器正对照（T-08 ④）。bot 写授权文件失败，文件哈希不变 |
| A4b | 拿到也用不了 | bash 自主连接 dsh gateway 和 LiteLLM（loopback）失败（与 A0 ① 同一断言，单列是为了防止 A0 被放宽时这条被一起放掉）。R5 附带回答「gateway 是否接受第二个连接复用同一个 launch token」，作为纵深防御的信息，不作为本条的通过条件 |
| A5 | ASK 往返不变 | 越界、升权、目录外读、连接器写操作 → 卡片只出现在发起它的 bot 里，挂在对应 callId 下（沿用 D3）；拒绝 → 没有副作用；仅一次 → 执行，下一次调用还会再问 |
| A6 | 典型任务安静 | J2 脚本（建脚本、跑、读输出、写总结文件，共 5 次工具调用，全部在工作目录内、不联网）→ fake 断言审批卡 **= 0**；真模型冒烟同一提示词，记录实际卡片数，作为档位表回调的依据 |
| A7 | 连接器始终允许 | 对 bot X 的连接器写工具 T 点「始终允许」→ 本次执行，之后 X 调 T 都不出卡；bot Y 调 T 仍出卡；close + launch 后 X 依然不问；授权文件权限 0600，位于 `PBOTS_DATA_DIR` 且在 wrapper 遮蔽范围内（A0 ②） |
| A8 | 列表与撤销；旧 bot 保守 | X 的设置 pane 列出「T · 始终允许」，撤销后下一次调用出卡，重启后仍处于撤销状态；cwd 不在 workspaces/ 下且未迁移的旧 bot：bash 照旧每次都问，卡片不显示「始终允许」，设置 pane 显示迁移入口（A11） |
| A9 | NEVER 优先与 fail-closed | 判定顺序固定为：NEVER（代码常量，不读配置）> 档位配置 > 常驻授权 > 故障回退。① NEVER 档工具被调用 → 不出卡，tool/result 报错并带原因；② 把档位文件或授权文件改坏（非法 JSON）→ ALWAYS 和 ASK 两类全部退回 ASK 并记日志，NEVER 仍是 NEVER；③ 在②的损坏状态下，对 NEVER 类调用尝试 `allowed-once` 批准 → 仍然失败、无副作用；④ bash 和文件工具的卡片上没有「始终允许」；⑤ wrapper 不可用（A0 ⑥）时第 1 行不生效，bash 退回逐次 ASK 或直接失败；⑥ D4 ①②③ 全部重跑通过 |
| A10 | 边界保留（P4B D9 继续生效） | D9 的拒绝测试全部照跑：`$events/result` 传 `'allowed-always'` 被拒；没有权限 preset 切换入口；danger-full-access 不可选。新的「始终允许」M1 方法只接受 eventId，工具名和 bot 由 main 从未决账本里反查，**只有「连接器写工具的 ASK 审批事件」才能写盘**：未决账本之外的 eventId、别的 bot 的 eventId、bash / 文件工具 / NEVER 类 / 提问事件（`user-questions/request`）的 eventId → 拒绝，并断言没有写盘 |
| A11 | 旧 bot 迁移 **[Q-013 (e)]** | 按用户选项落地，推荐「迁移」：现有 bot（含主 bot）的设置 pane 有「迁移到独立工作目录」按钮，点击后创建 `workspaces/<botId>`，此后新建的会话 cwd = 该目录，A2 对它成立；迁移前的会话保持原 cwd，照旧全 ASK；不复制、不移动旧 cwd 下的任何文件；冷启动和任何自动流程都不触发迁移（断言：不点按钮，重启 3 次，旧 bot 仍是旧 cwd） |
| A12 | 中途打断 | fake 让 bot 自主连续执行（第 2 步是 `sleep 600`）→ 用户点停止，5 秒内（具体上限待 R4）该 bash 子进程退出，之后不再发起新的工具调用；会话可以继续发消息 |
| A13 | 暂停自主 **[Q-013 (d)]** | 用户选「做」才有这一条：设置里一个全局开关，只能把 ALWAYS 收窄为 ASK，不能放宽任何一行；打开后 A2 的脚本每步都出卡，关掉后恢复；开关状态重启后保持；开关状态文件损坏时按「已暂停」处理 |
| A14 | 提问卡（R7） | 默认 standard preset 的模型工具表含 `ask_user_question`；fake 发问 → 只在对应 bot 的输入区出提问卡，另一个 bot 不出现；选项单选 / 多选 / 自由文本 / 跳过 / 整批提交，答案按同批 id 回到工具结果；取消、重连不重复提交；提问事件不能用 `allowed-once` 作答，审批事件不能用 answers 作答；离场 deadline 不得把审批用的 `rejected` 字符串当作问题的答案；未决账本不把提问事件记成 `toolName=undefined` 的审批（R7 ③ 的 ledger 隐患） |

## 7. 默认档位表草案 v2（**待用户确认**，Q-013 需按文末要点同步修订，类型：高风险 / 审批语义）
依据：用户原话（§1）授权的是**方向**：「一般是 bot 自己去完成，只有一些问题会询问」。具体档位必须由用户逐行确认（LEARNINGS 2026-11-02：审批默认值放宽属于安全红线）。「待 R」= 等对应调研回来后修正。
**给用户的真实后果说明（G1-r1 A-H1 要求，Q-013 必须原样带上）**：dsh 自带沙箱只拦写，不拦读，也不断网，今天在沙箱里 `ls ~/.ssh` 看得见。第 1 行的 ALWAYS 只有在我们加的 wrapper（断网、遮住 HOME 和数据目录）通过测试之后才生效；在那之前第 1 行保持 ASK。即使生效，bot 仍能只读系统目录（`/usr`、`/etc` 以及 HOME 之外其他对本用户可读的路径），HOME 之外如果还有凭证，R5 会列出路径，并加进遮蔽清单。

| # | 类别 | 例 | 草案默认 | 现状 | 卡片可点「始终允许」 | 理由 / 前提 |
|---|---|---|---|---|---|---|
| 1 | bash，加固沙箱内（断网；HOME、数据目录不可见；只写本 bot 工作目录） | `ls`、`python x.py`、`echo > a.txt` | **ALWAYS**（A0 通过前为 ASK） | ASK（shell-ask 必问），且今天批准后可读 `~/.ssh`、可联网 | —（不出卡） | 核心改动。`/tmp` 每次调用私有，跨调用不保留；依赖 HOME 配置的命令（git 用户配置、用户级 pip）在沙箱里不可用 |
| 2 | bash 升权（`sandbox_permissions` 宽于当前，含联网、写工作目录外） | `curl`、`pip install`、写 `~/x` | **ASK** | ASK（tool-bash 自带） | **否** | 离开边界，每次都问，卡片显示完整命令；原版 ceiling 也会禁用 always。升权后这一条命令拿到什么权限 **待 R4** |
| 3 | ~~bash 联网~~ | — | **并入第 2 行** | — | — | wrapper 断网是全有或全无，联网只能走升权（v1 §9-Q3 的默认，v2 定稿） |
| 4 | 文件工具，工作目录内（realpath 后） | read / write / edit / grep | **ALWAYS** | 待 R4（大概率不拦） | — | 与 1 一致；先 realpath，符号链接指出去的按第 5、6 行判 |
| 5 | 文件读，工作目录外（realpath 后，非凭证） | read `~/notes.md` | **ASK** | 待 R4 | **否** | 个人文件不该默认被自主读取；bot × 工具名表达不了「读哪里」，所以不给 always |
| 6 | 凭证路径 | `~/.ssh`、`~/.config/**/credentials*`、`~/.grokbot`、`PBOTS_DATA_DIR` 下 token 与授权文件、handoff 目录、`~/.claude*`、R5 列出的 HOME 外凭证 | **NEVER** | 部分（T-12 只隔离 launch token） | 否 | 「凭证不进模型」硬约束。文件工具：代码常量拒读清单（realpath 后匹配）；bash：wrapper 遮蔽，看不见 |
| 7 | 连接器工具，读（MCP `readOnlyHint=true`） | `mcp__x__search` | **ALWAYS** | 待 R4 | — | 对应原版 policy.reads；R4 证实 hint 到不了 pre-execute 时，全部按第 8 行处理 |
| 8 | 连接器工具，写或未标注 | `mcp__x__send`、`create_*` | **ASK** | 待 R4 | **是（按 bot × 工具）**，唯一可 always 的一行 | 对应原版 policy.writes；未标注按写处理（fail closed） |
| 9 | 连接器工具，`destructiveHint=true` | `delete_*` | **ASK** | 待 R4 | **请用户定**（推荐：否） | 删除类不可逆，推荐逐次问 |
| 10 | 权限 preset 切换 / `/permission` 命令 / configForms 写 | — | **NEVER** | NEVER（D9） | 否 | 不变 |
| — | 向用户提问 `ask_user_question` | — | 不是审批，不进档位表 | 工具已加载，UI 不处理 | — | A14 |

**判定顺序**（A9）：NEVER 常量 > 档位配置 > 常驻授权 > 故障回退（ALWAYS/ASK → ASK，NEVER 不变）。

请用户同时定五件事：
- **(a) 表中每一行**的档位，重点是 1、2、9 行。
- **(b) 「始终允许」的作用域**：v2 收窄为**只有连接器写工具**可以始终允许，按「每个 bot × 工具」记（Y 不继承 X 的授权）。备选是「所有 bot 共享」，原版 standing grants 的作用域 **待 R1**。
- **(c) 是否在 bot 设置里按连接器调读 / 写档位**：原版有 `Get|SetGrokBotMcpToolPermissions`。草案是**不做**，只做「列出 + 撤销」，档位表放在 profile 文件里，UI 只读显示。
- **(d) 要不要一个「暂停自主」开关**（A13）：全局一个，只能收窄回全 ASK。推荐：**做**（几十行，给用户一个随时收回的手柄）。
- **(e) 现有 bot（含主 bot）怎么办**（A11）：迁移（推荐，设置里点一次，之后新会话自主，旧会话不动）/ 新建一个主 bot 替换 / 保持全 ASK。

## 8. 非目标（放弃了什么、为什么）
- autoReview 二级审批：先由 R1 弄清它是什么（规则还是 LLM 复核）。如果是 LLM 复核，就是「模型审模型」，另开 slug 评估，不夹带进来。
- Spend / 虚拟卡 / 花费仪式、连接器 OAuth 授权、Messages 授权、团队 ceiling：云依赖，或没有对应的使用场景。
- 改权限 preset、开放 danger-full-access：D9 保留，路线 1′ 不需要它们。
- bash 命令前缀规则，以及 bash / 文件工具的「始终允许」：§3 放弃路线 2 的理由，B-H3。
- 沙箱资源限制（cgroup / ulimit）：A12 的打断先兜底；跑飞问题真出现再加。
- 提问的 timed 模式、迟到答案（R7 候选 C）：要新增 M2 endpoint，等需求出现再做。整套 `dsh-client-ui-user-questions` 插件也不引（R7 候选 A，依赖本项目已放弃的 dsh client 运行时）。
- 协作工具（建子 bot、SendToAgent、记忆）：§1 附表；P6 候选。
- L-UI：§2.1 的不准入项；像素级逐点比对（基准只有截图，以并排加数值断言为准）。

## 9. 待用户确认（≤3，主会话一次问一个，按下面的顺序）
1. **Q1 = Q-013（高风险，阻塞 L-AP 中除 W1-AP-0 以外的实现）**：§7 默认档位表 (a)–(e)，带上 §7 开头的真实后果说明。
2. **Q2 = Q-014（阻塞 U5 的基准选择，不阻塞 U1–U4）**：能否由你本人登录 0.78.1，按清单截约 10 张图（侧栏、会话流含 tool 行和审批卡、市场列表和详情、设置 pane、权限设置页，亮暗各一套），个人信息你自行打码后放到 `work/p5-parity/ref/`？截图过程不经过模型，凭证不进模型。不方便的话，按 R3 → 0.18 重建仓渲染的顺序降级；**降级后的验收口径**：参照覆盖不到的 0.78.1 项在 U5 标「未验证」，不算对齐（B-M3）。
3. ~~Q3~~：v2 已定稿（联网并入第 2 行，§7），不再单独问。

## 10. 待查（主会话派发，可并行；结果写 `work/p5-parity/reuse/` 或 `RE-*.md`）
状态：R7、R8 已回报，v2 已吸收；R1–R6 仍在跑，相关条款标「待 R」，回报后由 director 出 v2.x 增补，不阻塞 v2 过 G1。
1. **R1 → reverse-engineer**（待 R）：0.78.1 审批模型。目标产物：`/dev/shm/grok-re/0.78.1/app/dist/{local-exec-daemon/main.cjs, electron-main/main-core.cjs, renderer/assets/chunk-view-*.js}`。问题：① action 的分类枚举（renderer `j(o.action)` 一类的映射），以及每类的**默认** ceiling 从哪里来（用户设置、团队策略还是硬编码）；② `local-tool-approvals.json`、`local-tool-standing-grants.v1.json`、`local-tool-retirements.json` 的 schema 和作用域（machine / agent / tool / 参数模式），以及清除路径；③ autoReview 是什么，何时触发。附带：审批卡按钮的文案和顺序、always 被禁用时的 tooltip、设置页 permissions 节的结构（给 UI 用）。隔离要求：`HOME=/tmp/<目录>`，只做静态分析。
2. **R2 → reverse-engineer**（待 R）：0.78.1 视觉数值。目标：eager-app bundle 和 stylex CSS（766KB）。问题：① AUD 中 [78] 各项（A1 头部 New chat/New section、A15 市场入口、B9 审批卡、D1–D3 市场 overlay / tabs / Back，以及结论第 4 条列的反转气泡、corner-ring、titlebar、prose）在 0.78.1 的具体样式值；② 全部 `@keyframes`、transition 的时长和曲线，对应到组件；③ 输出：给 R8 表加一列「0.78.1 值」，直接作为 U3/U4 的规格。
3. **R3 → reverse-engineer（可行性，限时 0.5 天）**（待 R）：能否不登录、不联网，用桩 coordinatorPort 加 fixture 数据启动 0.78.1 renderer，渲染出侧栏、会话流、审批卡供截图？回答「能 / 不能 + 成本」。能的话产出参照截图。用 REA 的 AgentEnv 能力。
4. **R4 → scout**（读 dsh 源码和我们的 profile，待 R）：① 默认 profile 下模型可见的工具全表，每个工具今天是否会触发 `approval/asked`，并标出**所有能读文件的入口**（A4 矩阵的行）；② 连接器（MCP）工具调用是否经过审批，dsh mcp-client 是否把 `readOnlyHint` / `destructiveHint` 暴露给 `tools/pre-execute` 的 exec 上下文；**连接器子进程是否在沙箱内运行**；③ session/create 省略 cwd 时，实际 cwd 是什么，沙箱可写根是否等于它；④ **v2 新增**：`sandbox_permissions` 升权获批后，这一条命令拿到的是 danger-full-access 还是逐项放宽；⑤ **v2 新增**：dsh 有没有单轮工具调用上限，用户停止时 bash 子进程怎么被终止、多久（A12）。
5. **R5 → scout（实测，进行中）**：**v2 改为验证 wrapper 方案，不再是「看沙箱能不能」**。① `runnerCommand` + wrapper（`--unshare-net`；`--tmpfs` 遮蔽 `$HOME`、passwd home、`PBOTS_DATA_DIR`、handoff 目录；遮蔽之后重新 `--bind` 工作区）在本机能否跑通，A0 ①–⑤ 的探针结果，含 stock profile 正对照。注意：现有草稿 `evidence/r5-run-5lSrb9/bwrap-wrapper.py` 把 `--tmpfs` 插在 profile 的 `--bind` 之后，工作区在 HOME 下时会被一起遮住，必须补上重新 bind；② 配置 `runnerCommand` 后是否确实跳过 Landlock 选择；wrapper 不可执行或拒绝 profile 时，bash 是失败还是不带沙箱执行（A0 ⑥）；③ gateway 是否接受第二个连接复用同一个 launch token；④ env：核对上游 scrub（`D/subprocess/subprocess/src/index.ts:47,66-69`）是否覆盖所有注入点，列出不匹配该正则、但实际注入了的敏感名；⑤ 本机 HOME 之外有哪些凭证路径（只列路径，不读内容），供 §7 第 6 行和遮蔽清单使用。测试 HOME 放在 `/tmp` 之外（§6）。
6. **R6 → scout（GitHub，待 R）**：常驻授权的规则格式和持久化，找在维护的上游复用：opencode permission 配置、openai/codex 的 approval policy / execpolicy、Claude Code 的 permissions allow 规则。给出格式选型、许可证、维护状况。已知负证据：dsh 没有持久审批存储（§3 上游复用）。v2 只需覆盖「bot × 连接器工具」这一种键。
7. **R7 → scout**（**已回报**，`reuse/r7-ask-user.md`）：结论「第二档：事件在，作答 / UI 链路要补」，估 1–2 工程日。**决定：进本 slug**（用户原话「只有一些问题会询问」就是这个通道），走 R7 推荐路线：Host 和运输集成上游，问答 UI 改造自 `D/client/ui-user-questions/src/client/{QuestionComposer.tsx, QuestionReplyView.tsx}`（第 3 级，文件头写来源 `deepseek-ai/deepseek-harness@ce7073d5…`），不引整插件，不做 timed。R7 ③ 指出的 ledger 隐患（任何 waterfall 都被当成审批，deadline 会给提问代答 `rejected` 字符串）是今天就存在的缺陷，单列一个不依赖 Q 的修复任务（§11）。
8. **R8 → reverse-engineer / Explore**（**已回报**，`RE-visual-residual.md`）：83 行闭集，open→in 6 项，§2.1 预判全部命中。U1 直接引用，W1-UI 任务面据此确定（§11）。
9. **C2 契约问题 → 用户 C2**（= Q-015，v2 有变化，主会话同步修订，见文末）：
   - ① M1 新增 `pbots/approvals.alwaysAllow {eventId}`（main 反查工具和 bot，**只接受连接器写工具的 ASK 审批事件**，写授权文件，再代答 allowed-once），以及 `pbots/approvals.list {sessionId}`、`pbots/approvals.revoke {sessionId, toolName}`（toolName 只会是连接器工具）；
   - ② #3/#4 的 cwd 改由 main 强制为 `workspaces/<botId>`，renderer 传入则拒绝；
   - ③ P4B D3「UI 没有始终允许入口」改为「**仅连接器写工具的 ASK 卡**可始终允许」，D9 其余条款保持不变；C §4 不变式「renderer 只发 allowed-once / rejected」对审批事件保持不变（always 不走 `$events/result`）；
   - ④ SDK 侧 shell-ask 由「必问」泛化为按档位查表，含 NEVER 常量、文件工具 realpath 判定（approval.yml 语义变更，属于 Q-013 的落地，Q-013 答复前不合入）；
   - ⑤ **v2 新增**：M1 新增 `pbots/bots.migrateWorkspace {botId}`（A11，取决于 Q-013 (e)）；
   - ⑥ **v2 新增**：提问事件的作答——M1 按未决账本里的事件类别分支，审批仍只接受二值，提问事件接受严格校验的 `{answers:[{id, selected, custom?}]}`（R7 ③），不对任意 `outcome.value` 放开；
   - 实现等 Q-013 和 Q-015 都批准后再开工；W0 调研、W1-AP-0（只收紧）和 ledger 判别修复不受影响。

## 11. 波次建议（PLAN 细化）
- **W0（并行，不写代码）**：R1–R6 在跑；R7、R8 已完成。
- **W1-UI（frontend-dev，现在可开工；U3/U4 部分等 R2）**：用户要求「UI 先」，所以 W1-UI 最先开工。任务面按 R8 定：
  - **侧栏**：A2 搜索（过滤本地 bot 列表）、A13 折叠态（≤130px 容器查询，折叠宽 88）；
  - **会话流**：B7 thinking 行、B13 独立会话头（品味项，交 GU）、B14 时间分隔 / 未读线；
  - **全局 token**：E5 token 层 L1/L2 降 0.5px；
  - **断言**：19 个 fixed 项 + 6 个 in 项的 U2 computed-style 断言（不改样式，只补测试；暴露偏差就回修）。
  每页走 ux-proposer×2 → frontend-dev → verifier → GU 一轮。审批卡的视觉归 W2-AP，避免冲突。
- **W1-AP-0（builder，review M，只等 R5，不等 Q-013）**：沙箱加固 wrapper + profile 配 `runnerCommand` + `runnerFailureSignatures` → A0、A4b，以及 A3 / A4 中不依赖档位的部分（bash 入口）。它只收紧不放宽，今天的全 ASK 状态下就有收益。
- **W1-AP-q（builder，review M，不等 Q）**：ledger 按事件类别判别、deadline 不给提问代答审批字符串（R7 ③，修今天就有的缺陷）。
- **W1-AP（builder，review M，等 Q-013 + Q-015 + R4 + W1-AP-0）**：SDK 档位策略（shell-ask 泛化、NEVER 常量、realpath）+ 授权文件读取 + 工作目录强制 + 迁移 → A1、A2、A4（文件工具部分）、A9、A11、A12。
- **W2-AP（frontend-dev，review M）**：卡片三态、设置 pane 授权列表和撤销、迁移按钮、暂停开关（如选）、提问卡、新 M1 方法接入 → A5、A7、A8、A10、A13、A14。
- **W3 收口**：U5 GU、A6 真模型冒烟、整分支 `mm-review L`。

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
