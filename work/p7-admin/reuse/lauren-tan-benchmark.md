# Lauren Tan 工作流对标：p7-admin 最小能力集

调研日期：2026-11-05。性质：外部事实调研与现状对照，不是已批准的实现计划或权限变更。

## 结论先行

用户要的「Lauren Tan 那个 level」，应理解为：**人给目标和边界，系统持续接收线索，安排执行者，在真实产品上证明结果，处理失败，留下可审计记录；人离线仍能工作，回来审重要决策，而不是逐条催工具。**不是达到某个 PR 数量，也不是堆更多并行 bot。

有一个必须纠正的归属：**Grok Bot routines 是外环；`/goal`、`/loop` 是 Cursor harness 能力；`/swarm` 是 pstack 技能。不能把三条命令都记成 Grok Bot 自带功能。**Lauren 的直接 LinkedIn 自述把这些能力组合使用，[L1] 证明使用事实；Cursor 官方与 pstack 源码分别证明语义，[C1][P1–P4]。

我们已有 P6 委派、回报、侧栏和审批旅程的底座，但**尚不能把它等同于默认可用的离线自治工厂**：P6 默认开放闸仍 blocked，真实模型路由曾仅 19/48；而回报污染回合被明确禁止一切工具，现有回报链本身不是能继续派工的自治循环。[B1–B5]

p7 应先补「可持续运行的受控任务闭环」，再增加自主程度；不要以安装 pstack 或开放权限代替工程工作。

## 1. 证据等级与范围

| 标记 | 含义 | 本文如何使用 |
|---|---|---|
| A | 直接一手页面：Lauren 自述、官方文档、官方源码 | 自述证明她说过/使用过，不证明其效果已被第三方审计；源码证明当前公开工作流，不等于演讲当时版本 |
| A′ | 一手内容的第三方转录/镜像 | 能读到第一人称原话，但未逐帧核对原视频，转录准确性保留；不编时间戳 |
| B | 独立作者摘要/社区整理 | 只作交叉核对，不能补出一手材料未说明的行为 |
| 建议 | 本次据目标提出的最小产品能力 | 不是 Lauren 已用某实现的证据，也不是实施批准 |

### 视频核验结果

- `NjoZoUm85x0`：读到 Prepublish 转录镜像，[T1] 标题为 **How I Shipped 2000 PRs Last Month — Trusting AI Agents｜Grok Bot｜Lauren Tan**，页面标示约 38 分钟。可读到验证技能、环境约束、routines/事件、cloud agents 与自动开 PR 的第一人称内容；没有可用的逐句字幕时间码。**该转录没有证明 `/goal`、`/loop`、`/swarm`，也没有证明自动合并。**
- `Cmoh-yR-usA`：YouTube 正文没有可读字幕；oEmbed 只核实标题 **Lauren Tan XAi Grokbot**；Prepublish 明确返回 transcript unavailable。[T2] **未读到原文，不能当作第二份已核实转录。**
- 补读 Matt Pocock 访谈 `MN9dGgmLyso` 的转录镜像，[T3] 有「PR 合并后再审」「能否让 agent 自己合并」及可调 verifier 数量的第一人称内容。这是另一场访谈，不冒充上述两视频的字幕。
- 交叉参考独立作者 Barnaby Robson、ThoughtfulBits，以及中文时间线整理。[S1–S3] 其中「固定五级/六级 trust ladder」是整理者的结构化表达，不能当作 Lauren 发布的精确分级标准。

## 2. 她实际使用的能力：做什么、怎么触发、自主程度与护栏

| 能力 / 所属 | 它做什么、用户怎么触发 | 自主到什么程度 | 建立信任的护栏 / 验证 | 证据与边界 |
|---|---|---|---|---|
| **Routines：定时 / 事件触发，Grok Bot 外环** | Lauren 直接说用 routines 收集 Slack bugs、X complaints、功能点子，作为选下一轮工作的输入；演讲转录另谈 Slack threads、Sentry alerts 等订阅事件。用户先配置 bot 与 routine，之后由时间或事件启动，不需每次发消息 | 自动收集、分流、发起后续工作；不是每条投诉都直接改代码 | 外部信息先 triage，复现不了、不是 bug、风险过高都能停线；事件文本不能成为越权授权。pstack Benny 公开包示范分阶段移交证据 | **她使用外环：A [L1]；事件订阅：A′ [T1]；可定时/事件启动的公开工作流：A [P1:111–118]。**具体 routine UI、时区、失败重试与交付去重语义未核实；猜测的官方 routines 路径返回 404，未据此补细节 |
| **`/goal`：Cursor 原生目标驱动** | 用户在聊天输入目标，如 `/goal fix all flaky tests and make CI green`；官方说 agent 持续追求目标直到完成 | 跨多次行动追目标，而非只答一次；可配 custom mode / `/loop` | 必须另给可判定终点、范围、预算与退出条件；这部分来自 pstack overnight contract，不是 `/goal` 官方发布说明本身承诺的安全机制 | **她使用：A [L1]；命令语义：A [C1]。**官方页面未说明崩溃持久化、超时、自动审批或是否仅云端，均未验证 |
| **`/loop`：Cursor 原生唤醒机制** | 用户指定循环/周期，例如 pstack overnight 文档的 `/loop until done`；Autopilot-full 在获准后设 `/loop 1h` 巡检未结束的委派 | 按事件或 heartbeat 重查完成条件、进度和停滞；不是无限忙等，不是另一种 swarm | 停滞应换方法，不能降低 done 标准；真死路退出并写原因；用户 stop 必须传到所有 owner；权限先于 loop | **她使用：A [L1]；归属与语义：A [P1:18–40,120][P2:20–23]。**并未证实这是 Grok Bot `/loop` |
| **`/swarm`：pstack 技能** | 用户 `/swarm`，或 `/poteto-mode` 按任务路由；先声明终点、分片/竞赛规则，再并行派 N 个 worker，最后合一份结果 | 默认云 worker，可并行覆盖、竞赛、验证；当前源码需要本机访问时才选 local | 写操作各自输出；测量/验证写清 SHA 与方法；结果缺证据要补，不得把 dropout 当 PASS；合并验证者不得是作者 | **她使用：A [L1]；机制：A [P3:18–41]。**不等于预置固定组织架构，也不等于「100 个 agent 自动更好」 |
| **Cloud agents / Cursor Projects** | 在云端备好 repo、依赖、启动/验证环境；人从 Cursor 等入口发任务，Project 协调者持续管子 agent | Lauren 自述 bots 24/7，睡觉或电脑断网仍工作；官方说明云 VM 不依赖本机在线 | 每个工作环境可独立运行/测试；先证明环境可用，记录 branch/head 与证据；主机凭证边界不能由「不同 bot」名字来假装 | **她离线使用：A [L1]；平台能力：A [C2]；协调者持久线程：A [P1:88–103]。**云运行并不等于不需要网络，也不自动授予 merge 权限 |
| **技能/插件与 `/poteto-mode` 路由** | 安装 pstack；用户用 `/poteto-mode` 进入按任务选择的 investigation、bug-fix、babysit、autopilot 等 playbook，或显式调用某技能 | 能路由、派子 agent、串验证与交付，但依赖宿主 Task/工具/模型配置；不是一个独立常驻运行时 | 工程原则下沉成可执行检查；有范围、审查与停止闸。当前官方 skill 同时含更宽的外部动作策略，**不适合原样搬进我们的权限模型** | **作者、版本、MIT：A [P0]；路由：A [P4:17–37]。**官方当前版本 0.15.36 与历史演讲版本不可混同 |
| **Babysit PR 与自动合并** | 用户让 agent 盯 CI / reviewer / PR 状态；Autopilot-full 接收获准队列，owner 从构建做到 merge；Autopilot-stack 只做到已验证 PR，留人合并 | Lauren 在另一访谈明确说先合并再审，发现问题再 revert/改规则；当前公开 playbook 支持有授权的自合并 | owner 不自评；独立 swarm 验真实产物；绿 CI 不足以批准；新 head 要有对应 CI，补丁变化按规则复验；不绕过 forge 审批；用户保留项目停在 merge-ready | **实际自述：A′ [T3]；明确工作流：A [P2:3–23][P1:76–85]。**“所有项目/所有 PR 无条件自合并”无证据；摘要提到的“通知后一小时合并”原 X 页 402，故仅二手 [S1]，不列成通用规则 |
| **验证技能：control-glass / 项目 verify skill** | 最早 control-glass 让 agent 启动 app、通过 CDP 操作、采 trace；当前公开 `/create-verification-skill` 从 repo 找启动/驱动/观察/隔离方法，产出可复跑 CLI/harness 与 Feature Map | agent 自己复现 bug、实现后重复相同旅程、采截图/视频/trace/副作用证据；不仅是编译绿 | Launch → Doctor → Drive → Evidence → Cleanup；用真实用户入口，证据与作用都可检查；新生成技能自身要真跑一遍，没跑只是 draft | **她起步经验：A′ [T1]；生成流程：A [P5:9–40]。**control-glass 是她项目的具体工具，不是“有浏览器工具就等价验证完成” |
| **验证技能的维护循环** | `/maintain-verification-skill`，可由 automation 调用；更新 feature map 与驱动方法 | 源码分片只读检查，再用真实 app 覆盖每个 feature；输出 clean / changed / blocked | 只改 verification skill 目录，产品回归必须报告，不能改地图掩盖；Doctor 失败或无法覆盖不得报 clean | **A：官方工作流 [P6:9–37]。**她的具体生产调度频率未逐条核验，不把“每天/每小时”写成所有项目固定配置 |
| **长期记忆：至少三种，不混为一谈** | ① repo 的约束和既有模式；② Feature Map 这种 materialized memory；③ `/recall` 从历史 chats、issue/代码历史等重建工作上下文 | 后续 agent 少依赖人重复讲背景；`/recall` 当前源码限定范围并复核 live state | 旧聊天不是当前事实；引用来源，按主题/工作区取历史；结构性约束优先于长 prompt | **她谈 feature map/codebase：A′ [T1]；她解释 recall：A′ [T3]；公开实现：A [P7:9–33]。Grok Bot 原生跨聊天记忆由官方 docs 证实 [G1]，但“Lauren 的工作流具体用了哪套原生存储/向量库”未验证** |
| **长期专业 bot 与创建/回收** | 官方 Grok Bot 支持角色化 bot 与跨聊天记忆，用户创建/隐藏/删除；中文整理提到 Dr Eggbot 帮造 bot | 专业 bot 能长期保留职责、上下文，挂 recurring work；可与一次任务 worker 不同 | 删除 bot 是破坏性动作；官方说隐藏仍会继续 routines，删除不等于清理共享电脑文件/登录态 | **平台能力 A [G1]；“Dr Eggbot 自动造 bot”的她个人用法仅 B [S3]，本文未补读到对应原帖。自动删 bot 无一手使用证据** |
| **自主恢复 / 自重启** | pstack 有 pause checkpoint、resume note、替换卡住 owner 的规则，默认假设 VM 会死 | 可从 durable record 接手，不应靠原会话永存 | 记录 owner/branch/head/决策，stop 后零写；替换和恢复不能越权 | **公开机制 A [P1:40][P2:12,22–23]。未证实 Lauren 有“agent 重启机器/桌面”的能力要求，不能用此对标理由新增这类权限** |

### 她如何建立信任：应学的因果链

1. **先少量监督**：一到五个对话不断纠偏的阶段，问题是不能验证，不是并发不足。[T1，A′]
2. **给 agent 眼睛与手**：能启动真实产品、重走真实旅程，留下与主张匹配的证据；Feature Map 告诉下一个 agent 去哪验证。[T1][P5]
3. **把环境修成不容易犯错**：架构/类型/编译器/lint/CI 约束，优于每次聊天重讲规则。不能照抄 Dune 特定禁令当通用最佳实践。[T1][P4]
4. **闭环可靠后再放大**：授权范围内无人值守；PR 作者和 verifier 分离；审计决策与事故，发现问题修结构。[P1][P2][T3]

这是证据支持的进阶逻辑，不是已经验证的固定五级认证，也不要求每个 PR 跑十个 verifier。

## 3. 与我们现状逐项对照

判定口径：**已有**＝有本地产物和验收证据支持该基础能力，不等于默认生产链已开放；**部分**＝只有底座/开发流程，尚未产品化或缺可靠性闸；**缺**＝本次检查的产品入口与 P6 范围没有打通该闭环，不声称底层 dsh 一定没有相应插件。

| 对标项 | 判定 | 本地证据与具体差距 |
|---|---|---|
| create / send / stop worker、任务归属、容量 | **已有（默认链未开放）** | `create_bot`、`send_to_bot`、`stop_bot` 已有源码；P6-10/11/13 已做。真实模型何时该派/续派/停止尚未达到闸值；P6-14b blocked。[B1][B2][B3] |
| worker 完成/需要人处理 → 合批回报、侧栏跳转、原卡审批 | **已有（基础链）** | P6-12、15/16、17 的实现与验收记录；P6-17 真 SDK + UI，模型用 fake，不能把其 PASS 说成真模型路由 PASS。[B1][B4] |
| swarm 执行能力 | **部分** | 能并行派 worker 与合批，但还不是有覆盖分片、证据判定、补缺、独立作者/验证者、任务队列收敛的完整 swarm 产品流程。[B1][B2] |
| `/goal` 等价的长期目标 + 可判定完成条件 | **缺（产品闭环）** | P6 定义单次 assignment/回合，没有证据表明主 bot 持有可恢复的多步目标执行契约；M1 无 goal 管理方法，现有 dsh `ui-goal` 被关闭。这不证明底层 goal 机制不可复用。[B6][B7] |
| `/loop` 等价的持续唤醒、继续派工、停滞处置 | **缺（产品闭环）** | `taint-guard` 明确：收到 worker 回报的主 bot 回合禁止全部工具，只能转述。**因此不能把“会收到回报”视为“会自主继续执行下一步”**。开发用 Claude cron 与产品 runtime 分属两个控制面。[B5] |
| 定时 / 事件 routines 外环 | **缺（当前产品入口）** | M1 没有 schedule/routine 管理方法；dsh `ui-schedule` 被关闭；未找到 P6 已交付的用户配置、触发去重、任务投递完整旅程。底座接缝需专项 scout 验证，不能因 UI 缺失重写调度器。[B6][B7] |
| 插件市场：搜索、安装 | **已有（用户手动）** | M1 有 pluginMarket 搜索/详情与 pluginManager 安装；安装要求 `enabled === false`；market 默认链与空目录诚实空态有源码支持。[B6][B8][B3] |
| 主 bot 管理技能：选择/创建/更新/评测/激活 | **部分** | 市场安装不等于技能生命周期；本次无证据显示 agent 能在现有安全约束下完成验证技能产出→审批→激活→回滚。不能静默装/启插件取代用户边界。[B6] |
| 长期角色 bot、自动增删与停用 | **部分** | P6 建的是带 createdBy 的 session/worker，preset、connectors、cwd 都 main-owned；不是长期角色、routine、权限、记忆的一体 bot 管理。主 bot 自动删除不是已交付工具。[B2][B9] |
| 跨会话长期记忆与 `/recall` | **部分** | session 日志和跨重启投递对账已有；但不等于用户偏好/项目事实/任务教训的结构化提取、溯源检索、纠错/忘记产品闭环。没有本次核实的原生记忆接口旅程。[B6][B10] |
| 可运行的验证环境与技能 | **部分** | 我们项目开发中有 verifier、e2e、Xvfb、证据与 SHA 规则；尚不能据此认定安装后的主 bot 对任意目标 repo 已拥有 launch/doctor/drive/cleanup + Feature Map 的可复用技能。[B4][B11] |
| PR babysit → 独立验证 → 受限自动合并 | **缺（主 bot 产品工作流）** | 工程团队自己的 verifier/review/合并流程存在，但不是产品主 bot 的 GitHub/CI 订阅与 merge gate。还不能证明脱离 Claude 主会话后自动跑通。[B1][B11] |
| 终端离线仍可工作 / cloud agent | **缺（已验证部署能力）** | 当前交付围绕本机 Electron + SDK。没有本次核实的远端 worker/常驻服务部署旅程。本机常开可满足“人离开”，不能满足“关机仍跑”；应明确两种验收目标。[B3][B4] |
| crash 恢复、恢复后不重复副作用 | **部分** | `Delivery` 有 persisted-history/pending 去重、flush 后回执；连接类支持指数退避重连。但**连接重连 ≠ SDK 拉起，投递恢复 ≠ 完整任务/预算/外部动作恢复**。[B10][B12] |
| 审批、沙箱、外部内容隔离 | **已有（但未到可放宽闸）** | P6 回报污染保护、worker 信封已做；P6-25/25.f1 修工作区外文件操作；PLAN 尚列 P6-26t/26/27 等安全补强。保留原审批，不把 Lauren 信任程度当授权。[B1][B5][B6] |

**最重要的现状限定**：[B1] 的状态表有个别多余列/旧状态残留，因此这里优先结合实际启动源码 [B3] 与独立 VERIFY [B4]。P6-20 的“done”表示评测任务跑完，不表示路由通过：其结果明确是 **D3′ FAIL 19/48**；后续迭代验收未过前不能包装成“编排已全量可靠”。

## 4. p7 达到相近工作方式的最小能力集

以下是建议优先序，不是依赖选型结论。新增库、上游 schedule/memory 插件、远端环境另做能力级 REUSE，优先复用现有 dsh 与 P6 地基，不在本对标任务里宣告自建。

| 优先级 | 要补的最小能力 | 一句理由 | 最小可证伪验收 |
|---|---|---|---|
| **P0 前置** | **关掉 P6 可靠性/安全缺口，明确默认开放闸** | 无人值守只会放大路由失误与越权，不应绕过未过闸项进入 p7 | 默认启动真实可见协调者工具；冻结集达到既定阈值；既有越界/污染反例仍拒；不能以放宽权限来换通过 |
| **P0** | **一个持久目标执行契约 + 单一循环所有者** | `/goal` + `/loop` 的核心是对结果负责和继续推进，不是斜杠名字 | 记录目标、done predicate、授权范围、预算、deadline、状态；worker 完成后由可信控制器核验并安排下一步；stop 后零新副作用，预算/死路明确 BLOCKED |
| **P0** | **可重复验证技能与环境包装** | 这是 Lauren 从监督走向信任的决定性能力 | 对一个真实 repo 跑 launch → doctor → 复现 → 修复后同路径验证 → 留证 → cleanup；SHA/产物对应；故意注入回归时不能报 PASS；优先复用现有 Xvfb/e2e 工具 |
| **P0** | **routines MVP：先一个定时入口，再一个事件入口** | 外环应能自己启动工作，但无需一开始接完所有 SaaS | 用户可创建/查看/暂停/删除 routine；重启后仍在；带稳定触发 id 去重、重叠执行策略、失败记录；首个 routine 可只做验证技能维护，首个事件可只接明确的一类 issue 来源 |
| **P0** | **持久运行记录 + 任务级恢复；必要时 SDK 服务级自重启** | 长任务的关键是断点和副作用可恢复，不是“机器人永不死” | 记录 assignment、owner、head、证据、下一步；模拟自身 SDK 子进程退出，恢复后任务不丢且外部副作用不重放；仅管理自己启动的 SDK/worker，不触机器或用户桌面；若进程已由可信 supervisor 管，无需再造 watchdog |
| **P1** | **长期 bot 管理 + 最小长期记忆** | 从一次 worker 升级为能持续负责一类工作的 bot，必须保留职责与事实 | create/list/update/park；绑定角色、技能、routine 与显式权限；记忆带来源/时间/作用域，可检索、纠错、忘记；先复用 session/history 与文件记录，不预设向量库。破坏性 delete 仍需用户明确确认，routine 停用独立可见 |
| **P1** | **受控技能生命周期，而非无人值守逛市场装包** | 她的收益来自能运行且维护中的验证技能，不是插件数量 | 主 bot 可提议/生成限定目录技能；真实试跑后请求用户激活；版本、来源、评测、回滚可查；插件安装/启用继续遵循当前授权 |
| **P1，最后开** | **PR babysit 与独立验证后的受限自动合并** | 真正接近“我睡觉、agent 交付”的终点，但必须最后解锁 | 先实现 autopilot-stack：一晚产出已验证 draft/ready PR；再对用户明确批准的 repo/队列开放 full：独立 verifier + 当前 head CI + merge 权限检查 + 审计/回退；检查失败、审批未满足、验证版本过期均不合并 |
| **条件项，不抢 P0** | **远端/云 worker 或常驻远端 SDK** | 若验收是本机断网/关机仍工作，仅本地循环做不到 | 用户明确需要此语义时才接一条远端执行链；不要为了“cloud”重写本地编排，也不把 worktree 隔离冒称 VM 隔离 |

### 最小交付旅程

1. 用户给一个仓库、一类低风险任务、完成条件与审批边界。
2. 一个 routine 收到线索，先 triage；不可信来源只能形成候选任务，不能授予执行/合并权。
3. 常驻协调者基于**预先授权的目标契约**决定派 worker；worker 在准备好的环境复现/修改；独立 verifier 跑真实旅程并留证。
4. CI/验证失败自动修一次或少量有界修复，超预算/需授权则停线并通知；不以更多同 prompt 重试掩盖卡死。
5. 第一版到 verified PR 等人合并；用户看过若干次完整证据后，再对窄范围启用 auto-merge。
6. 用户回来得到「做了什么、证据、卡在哪里、花了多少、哪些已合并/可回退」，不是大量 worker 原始消息。

**不列入最小集**：固定 10 个 verifier、固定几十个长期 bot、多层管理组织树、自动销毁 bot、自动给自己安装权限插件、机器重启、仿 Dune 全框架。没有证据说明这些是达到目标的必要条件。

## 5. 可复用材料与搬运阶梯判断

这里只确定**对标和 playbook 材料优先级**，不声称已在 dsh 上完成集成 spike。

| 能力 | 候选 | 阶梯级别 | 许可证 | 维护（最近 commit / release） | 决策 | 理由 / 适配工作量 |
|---|---|---|---|---|---|---|
| 路由、swarm、验证技能、night run、PR gate 的行为范本 | `cursor/plugins@bb68f2365eceafa0cb2d253112f675acf5f144cc:pstack/` | 3（在我们的宿主内） | MIT，Lauren Tan | pstack 最近路径 commit `c742dd6`，2026-10-27；plugin 0.15.36；仓无 GitHub release；issue 维护者回应本次未验证 | **改造（建议，未实施）** | 优先官方材料；第1级 Cursor 插件不能未经验证就当 dsh 插件，第2级原样使用也依赖 Cursor Task/cloud/store；若引入只搬最少 playbook/验证模板，替换宿主接口并**收紧** Autonomy 策略，不能整套照抄。来源见 [P0–P7] |
| 同一 pstack 的历史镜像 | `JoshueOsuna/pstack@f3103a1005e82d48ebc7e109db1d0b8dfb36218b` | 3 | MIT，Lauren Tan | 2026-09-13 commit；release、issue 响应未验证 | **改造（备选，不选作当前基线）** | 与官方是同源镜像，不是独立证实；当前官方更新更晚；只有比较历史行为时有必要看它，避免从镜像继承旧政策 |
| 精简工程原则 | `unicodef1wn/lauren-poteto-rules@a6f818e107855df5603c8f36f626de4b1125e5b7:SKILL.md` | 3 | MIT（仓 README 声明，本次未另读 LICENSE 正文） | 2026-09-21 commit；release、issue 响应未验证 | **改造（补充参考）** | 已读正文，强调运行产品、范围适配、逐渐放权，较便携；但作者明确说独立社区改编，不能用来证明 Lauren 实际部署或替代运行时 |

包仓库核验：`npm view pstack version time.modified repository --json` 返回 **0.1.5 / 2022-06-24 / github.com/26medias/pstack**，不是 Lauren 的 pstack，**不能 `pnpm add pstack` 当作该插件**。本次未安装包、未执行任何外部仓脚本。

值得警惕的兼容性证据：官方 `poteto-mode` 有 `disable-model-invocation: true`，issue [#1173](https://github.com/cursor/plugins/issues/1173) 报告在 Claude 的 stored prompt/scheduled/headless 场景无法直接调用；这是**尚未独立复现的 issue 报告**，不是已确定适用于 dsh 的 bug，但足以否定“复制命令名字就能无人值守”。

官方 pstack 已 shallow sparse clone 到 `/home/lingxufeng/bot/repos/cursor__plugins`，只读查看并追加 MANIFEST；没有改产品代码、安装插件、设置 routine、外发消息、创建 PR 或调整审批。

## 6. 数字与易误传结论

- **2,000 PR/月**：指定演讲转录里的 Lauren 自报，不是 GitHub/组织审计数据。[T1]
- **2,500 PR**：另一访谈转录有相近自述，二手页面也引用不同标题/口径；不能把两个数混成一个精确统计。[T3][S1–S3]
- **十个 verifier**：访谈中是可调示例，她说可从十个减到一个；不是硬性要求，也不是证明十个收益更高的 benchmark。[T3]
- PR 不等于 feature；她明确说大量工作是 gardening/重构/清理。[T3]
- 本文没有独立验证产量、成本、缺陷率或产出质量；**p7 不应设置 PR 数量作为成功指标**。
- 不把“agent 自己 merge”理解成“无需权限、无需独立验、无需 CI、无需人保留的闸”。[P2]
- 不把 repo/Feature Map/recall 与 Grok Bot 原生长期记忆混成一个已知实现。[T1][P7][G1]

## 7. 来源索引

### 一手页面 / 一手内容转录

- **[L1] Lauren Tan LinkedIn 原帖**：https://www.linkedin.com/posts/laurenelizabethtan_cloud-agents-and-cursor-harness-improvements-activity-7495972438262853632-bLQ5 。本次可读，直接自述 routines、outer loop、三命令、cloud / 24×7。
- **[T1] 指定演讲转录镜像**：https://prepublish.ai/youtube-transcript/NjoZoUm85x0 ；原视频 https://www.youtube.com/watch?v=NjoZoUm85x0 。转录不是官方字幕，未逐帧核验。
- **[T2] 第二指定视频**：https://www.youtube.com/watch?v=Cmoh-yR-usA ；元数据 https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=Cmoh-yR-usA&format=json ；不可用转录页 https://prepublish.ai/youtube-transcript/Cmoh-yR-usA 。只核到标题。
- **[T3] Matt Pocock 访谈转录镜像**：https://prepublish.ai/youtube-transcript/MN9dGgmLyso ；原视频 https://www.youtube.com/watch?v=MN9dGgmLyso 。与 T1 不同场次，无逐句时间码。
- **[C1] Cursor `/goal` 发布说明**：https://cursor.com/changelog/08-19-26 。
- **[C2] Cursor cloud agents 官方文档**：https://cursor.com/docs/cloud-agent 。
- **[G1] Grok Bot bots / memory / 生命周期官方文档**：https://docs.x.ai/grok-bot/bots 。
- **[G2] Grok Bot 审批 / Auto Review 官方文档**：https://docs.x.ai/grok-bot/security 。memory/rules 不替代审批；不同 bot 共享电脑并非安全隔离。此处是平台说明，不证明 Lauren 个人开启了全部选项。

### 官方 pstack 源码（全部固定到本次读取 SHA）

统一版本：`bb68f2365eceafa0cb2d253112f675acf5f144cc`；下列本地路径前缀均为 `/home/lingxufeng/bot/repos/cursor__plugins/pstack/`。

- **[P0]** `plugin.json:1–20`、`LICENSE`；https://github.com/cursor/plugins/blob/bb68f2365eceafa0cb2d253112f675acf5f144cc/pstack/plugin.json 。
- **[P1]** `docs/guide/07-overnight.md:7–120`；https://github.com/cursor/plugins/blob/bb68f2365eceafa0cb2d253112f675acf5f144cc/pstack/docs/guide/07-overnight.md 。
- **[P2]** `skills/poteto-mode/playbooks/autopilot-full.md:3–25`；https://github.com/cursor/plugins/blob/bb68f2365eceafa0cb2d253112f675acf5f144cc/pstack/skills/poteto-mode/playbooks/autopilot-full.md 。
- **[P3]** `skills/swarm/SKILL.md:18–41`；https://github.com/cursor/plugins/blob/bb68f2365eceafa0cb2d253112f675acf5f144cc/pstack/skills/swarm/SKILL.md 。
- **[P4]** `skills/poteto-mode/SKILL.md:17–37,82–98`；https://github.com/cursor/plugins/blob/bb68f2365eceafa0cb2d253112f675acf5f144cc/pstack/skills/poteto-mode/SKILL.md 。
- **[P5]** `skills/create-verification-skill/SKILL.md:9–44`；https://github.com/cursor/plugins/blob/bb68f2365eceafa0cb2d253112f675acf5f144cc/pstack/skills/create-verification-skill/SKILL.md 。
- **[P6]** `skills/maintain-verification-skill/SKILL.md:9–37`；https://github.com/cursor/plugins/blob/bb68f2365eceafa0cb2d253112f675acf5f144cc/pstack/skills/maintain-verification-skill/SKILL.md 。
- **[P7]** `skills/recall/SKILL.md:9–33`；https://github.com/cursor/plugins/blob/bb68f2365eceafa0cb2d253112f675acf5f144cc/pstack/skills/recall/SKILL.md 。
- Benny dormant pack：`automations/benny/README.md:3–23`；https://github.com/cursor/plugins/blob/bb68f2365eceafa0cb2d253112f675acf5f144cc/pstack/automations/benny/README.md 。
- 最近 pstack 修改（Lauren 作者身份）：https://github.com/cursor/plugins/commit/c742dd61706fbacc1b95f1a20b7b988cf096ce6c 。

### 二手交叉参考（不升级为一手）

- **[S1]** Barnaby Robson：https://barnabyrobson.org/on-pstack/ 。特别有用的是区分他自己的 ladder 整理与访谈，以及历史 pinned pstack 版本。
- **[S2]** ThoughtfulBits：https://thoughtfulbits.ai/how-to-be-like-poteto 。用于交叉核对验证、overnight、memory 的区别。
- **[S3]** 中文原帖时间线：https://ythx-101.github.io/lauren-tan-ai/ 。提供原帖链接，非 Lauren 官方文档。
- 社区规则的定位声明与源码：https://github.com/unicodef1wn/lauren-poteto-rules/blob/a6f818e107855df5603c8f36f626de4b1125e5b7/README.md 、https://github.com/unicodef1wn/lauren-poteto-rules/blob/a6f818e107855df5603c8f36f626de4b1125e5b7/SKILL.md 。
- 历史镜像：https://github.com/JoshueOsuna/pstack/tree/f3103a1005e82d48ebc7e109db1d0b8dfb36218b 。

### 本地现状证据（主仓，只读）

- **[B1]** `/home/lingxufeng/bot/work/p6-orchestration/PLAN.md:103–131`：P6-10～27、开放闸 blocked、D3′ 19/48。文档会继续更新，本结论为本次读取快照。
- **[B2]** `/home/lingxufeng/bot/app/sdk/src/orchestration/create.mjs:17–35,73–109`；`/home/lingxufeng/bot/app/sdk/src/orchestration/index.mjs:33–50`：工具、身份、任务范围。
- **[B3]** `/home/lingxufeng/bot/app/sdk/src/start.ts:113–132`：默认 p2sdk/approval/market/runtime 链，没有 orchestration.yml 默认接入。
- **[B4]** `/home/lingxufeng/bot/work/p6-orchestration/VERIFY-P6-17.md:10–16,27–39`：真实 UI/SDK 链与 fake 模型边界、默认链与身份反例。
- **[B5]** `/home/lingxufeng/bot/app/sdk/src/orchestration/taint-guard.mjs:1–15,25–36`：worker 回报回合禁止所有工具。
- **[B6]** `/home/lingxufeng/bot/app/ui/main/m1-api/index.ts:11–43,84–95`：API 白名单、永久硬拒、安装 disabled。
- **[B7]** `/home/lingxufeng/bot/app/sdk/profile/patches/p2sdk.yml:88–89,112–113`：上游 ui-goal / ui-schedule 被关闭。只证明 UI 没接，不证明底层插件不存在。
- **[B8]** `/home/lingxufeng/bot/app/sdk/profile/patches/market.yml:5–24`：直接依赖 dsh-plugin-market，目录源可为空。
- **[B9]** `/home/lingxufeng/bot/app/ui/main/m3-meta/orchestrate.ts:301–382`：worker create 只收 name/prompt/mainBotId，main 掌控 preset/connectors/cwd 与 session。
- **[B10]** `/home/lingxufeng/bot/app/sdk/src/orchestration/delivery.mjs:85–103`：跨重启幂等投递基础，不等于语义记忆或完整恢复。
- **[B11]** `/home/lingxufeng/bot/docs/harness/PROTOCOL.md:17–24,30–42` 与 `/home/lingxufeng/bot/.claude/skills/grok-orchestrate/SKILL.md`：开发流程的落盘/作者不自评约束，不能混作产品主 bot 功能。
- **[B12]** `/home/lingxufeng/bot/app/ui/main/dsh/connect.ts:41–57,88–119`：连接层重试与恢复，不是宿主进程自动拉起。

调研边界：未访问凭证目录；未执行外部内容中的安装或调度指令；没有运行产品/全量回归。一个只读组合搜索命令被 process_guard 误识别为批量结束进程而拒绝，未重试绕过；本地结论采用其余可读源码与已有 VERIFY，未据被拒命令宣称任何检索结果。
