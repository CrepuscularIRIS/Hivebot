# BRIEF · p2-sdk（P2 SDK 抽取）

v2 · 2026-11-01 · 回应 G1-r1，见 panels/G1-r1-response.md · 待 /panel G1-r2
v2 审定 · 2026-11-01 · director（审改 13 处）
v2.1 · 2026-11-01 · G1-r2 有条件通过后的修订，见文末修订账 R-1～R-4

## 1. 目标与需求证明
- **一句话**：`app/sdk/` 用一条命令起一个只含后端的 dsh 运行时，对上提供「多 session 并发 + 流式事件 + 每 session 独立配置 + 市场连接器」这四种能力，且有离线测试守住。它是 P3 契约和 P4 UI 的地基。
- **谁用**：直接消费者是 P4 前端（Grok 风格 renderer / Electron main）以及 P3 契约的作者；最终用户是在本机同时开多个 bot 的用户本人。
- **现在怎么凑合**：dsh 自带 web / desktop 前端（`packages/client/*`、`apps/desktop`），已经能聊天，也有插件市场 UI，但界面是 dsh 的，不是 Grok Bot 的。
- **凭什么换**：用户要的是 Grok Bot 的体验，后端仍用 dsh。前端不能直接耦合 dsh 内部的 68 个 client 包，中间需要一层**可单独启动、可测、版本钉死**的后端。P2 的价值就在这层边界本身，不在于新写多少代码。

## 2. 范围模式：HOLD
MVP 由用户在 2026-11-01 定稿：多 dsh session 并发 + 市场连接器，roadmap 里已经写了出口条件。P2 只把这些做扎实，不主动扩展。
只有一处超出 roadmap 字面出口：D5（重启后 session 仍在）。理由是 P4 的 DONE 示例「关掉再开，bot 列表和历史还在」必须由后端提供；如果 P2 不做，P4 会被卡住。

## 3. 路线（强制双方案）
| | A. 组合式（**选**） | B. 自有门面 | C. 裁剪 fork |
|---|---|---|---|
| 做法 | `app/sdk` = 一个 dsh profile / bundle（`cordis.yml` + 自有插件）。dsh 作为**依赖**引入；对外沿用 S3 选定的通道；只补**已知缺口**，清单写死 4 项：①per-session 模型/preset ②session list ③取历史 ④市场目录/安装/按 session 启用。缺口怎么补由 S3（`/api` 是否已覆盖）和 S9（每 session 一个子进程能否解决进程级模型）决定，BRIEF 不预判 | `app/sdk` 新写一个 TS 服务，定义 Grok 形状的 API，内部为每个 bot 驱动一个 dsh SDK client | 把 dsh 复制进 `app/sdk`，删掉 client 包 |
| 代价 | 对外接口跟着 dsh 协议走，dsh 升级有破坏风险（用 D7 的契约测试兜住） | 等于提前定 P3 契约，而 P1 的 ipc-rpc 结论还没回来，很可能返工 | 约 370 个包，CI 要求 100% 覆盖，上游合并成本持续存在 |

**放弃 B**：A 和 B 都要补接口，区别在于 A 的补丁面积有上限（就 §3.1 的 4 项缺口）、标注了临时、P3 可以整体推翻；B 则要预定整套 API 形状，而接口形状是 P3 要决定的事，现在写门面就是在猜契约。
**放弃 C**：fork 等于接下 dsh 的上游合并成本（持续存在），换来的只是「目录看起来干净」。
前提清单否定到超出 4 项缺口所能覆盖的范围时，A/B 回 G1 重新比较，不要静默滑向任何一边。

### 3.1 A 的前提清单
任一前提被否定时，按「否定时去向」处理。本表是前提 → D 映射的唯一依据，§6 标注和 §9「阻塞」与它保持一致。
**统一规则**（R-1）：路线不可行，或补缺口超出 4 项面积上限（§4 死因 5）→ 路线 A/B 回 G1 重比，并回审「关联 D」列全部条款；只是条款所需能力不足 → 只回审该行「关联 D」。§6.0、§9 只引用本规则，不另立口径。
| 前提 | 对应待查 | 关联 D | 否定时去向 |
|---|---|---|---|
| 干净 clone 能取到钉版本的 dsh | S4 | D1、D7、路线 A | D1 / D7 + 路线 A 回 G1 |
| sdk / headless profile 不带 superagent 能单独起 | S2 | D1–D8 | 路线 A 整体回 G1 |
| 选定通道能在 4 项缺口内补齐接口 | S3 | D7、路线 A/B | 超出缺口清单 → A/B 回 G1 重比；需补用例（断线重连）→ D7 回审 |
| 建 session 可指定 preset/模型、可取持久化与历史（或可在此缺口内补） | S6 | D4、D5、D8 | 超出缺口清单 → D4 / D5 回审；会话存储路径不可定 → D8 回审 |
| 选「每 session 一子进程」时编排代码不超面积上限 | S9 | D3、D4 | D3 / D4 回审 |
| 可注入 fake / mock LLM provider | S5 | D3、D4、D7、D8 | D3 / D4 / D7 / D8 回审（离线方案重写） |
| 市场流程可映射、目录来源可定、MCP 可按 session 启用 | S7 + P1 RE-marketplace | D6 | D6 回审 |

**临时接口的标注方式**：P2 新增的对外方法集中放在 `app/sdk` 的一个模块里，文件头标注「P2-TEMP：P3 可推翻」；方法名用统一命名空间前缀（PLAN 定名），grep 一次即可列全；`app/sdk/README.md` 单设「临时扩展」一节逐条列出。新增方法的面积上限见 §4 死因 5。

## 4. 逆向一问：三个月后 P2 失败，最可能的死因
1. **陷进 superagent**：superagent 是「面向单个 GitHub 仓、监听 GitHub / 飞书、按工单执行」的主动 agent（见其 README），peer 依赖 dsh 0.2.1，和 MVP 的聊天旅程**没有交集**。如果为了让它跑通去修兼容性，聊天链路会一直起不来。→ **防**：superagent 移出 P2（Q-001 已答 b，R-2）。
2. **钉在 alpha 上漂移**：dsh 0.2.2-alpha.2 一升级，协议就变，P4 跟着崩。→ **防**：锁定依赖版本；D7 契约测试对着锁定版本跑，升级 dsh 时必须先过 D7。
3. **接口选错，P3 返工**：→ **防**：P2 不发明产品接口（放弃 B），接口选型作为契约题交给 /panel D 和用户 C2（S3）。
4. **「能聊」但不安全**：默认自动审批 exec（openclaw 反例），或者在非 loopback 地址裸露端口。→ **防**：D8。
5. **接口面积失守**：P2 新增的对外方法超出 §3.1 的 4 项缺口，或者为补缺口自写出跨 session 的调度/编排层，在 PLAN 里把边界悄悄扩大。→ **防**：面积上限写死，超出即回 G1，不得在 PLAN 里自行扩大；临时接口按 §3.1 集中标注。
6. **构建拖垮 D1/D7**：setup 要构建的子图过大，60s 内起不来、离线测试也跑不动。→ **防**：只构建 sdk 运行时需要的子图，setup 耗时和峰值内存记进 evidence（只作证据、不设阈值）；按 CLAUDE.md §4 盯 iowait 和 load，负载高时暂停全量回归。

## 5. 用户与核心旅程（≤3）
- **J1 单 bot**：启动 SDK → 建 session（选 preset）→ 发消息 → 收到增量流式事件 → 收到回合结束事件。
- **J2 多 bot**：3 个 session 同时发消息，各自的流互不串线 → 杀掉进程再起 → 列出 session，取回历史。
- **J3 市场**：浏览连接器目录 → 安装一个 MCP 连接器 → 在某个 session 启用 → 该 session 的 agent 调用到它的工具。

## 6. DONE 条款（每条附证伪方式，证据放 `work/p2-sdk/evidence/`）
命令名是暂定的，PLAN 可以改名，但必须保持「一条命令」的粒度，并在 `app/sdk/README.md`「启动」节写明。条款一律用行为描述（「经 SDK 对外接口」），不绑定具体通道或方法名。

### 6.0 条件通过规则
G1-r2 可以**有条件通过**：每条 D 标注「定稿」或「有条件（前提 S#）」，前提与待查的对应见 §3.1、§9。S2、S3、S4 是**路线级前提**，否定时按 §3.1 统一规则处理；各条只标条款级前提（S4 同时直接约束 D1，故 D1 照标），「定稿」指没有条款级前提。前提结论回来后：
- a. 结论为肯定、且 DONE 文字不用改：主会话在修订账记一行「前提满足」，不回审；
- b. 结论为否定，或需要改 DONE 文字、改路线：只把受影响的 D 条款送回 G1（G1-rN 只审这几条）；
- c. 按条款卡（R-3）：有条件的 D 对应的 PLAN 任务，在其前提有结论之前不得进 ready；其余任务照常定稿、照常开工。S3 的结论必须走完 /panel D 和用户 C2（Q-004）才能实现。

- **D1 一条命令起（有条件，前提 S4）**：干净 clone 指 bot 仓的 clone 加一次 setup。setup 只允许做三件事：①按钉定的 commit 把 dsh 取到固定路径（取法由 S4 定）②`pnpm install` ③只构建 sdk 运行时需要的子图。dsh 的 commit 钉在 `app/sdk` 里的一个文件，不只靠 lockfile。本机 `repos/deepseek-harness` 已存在时，setup 只校验 commit、不改动，不一致就报错退出。setup 完成后 `pnpm -C app/sdk start` 在 60s 内输出 ready，进程常驻；setup 的耗时和峰值内存记进 evidence，只作证据、不设阈值。证伪：超时、报错退出、需要手工改文件、setup 改动了 `repos/`、或 commit 校验被跳过。
- **D2 最小客户端·真模型手动冒烟（定稿）**：`node app/sdk/examples/min-client.mjs "你好"` 建 session、发消息，人工核对输出日志，断言三项：至少 1 个增量事件早于结束事件、有回合结束事件、退出码为 0。API key 只从环境变量读取。证伪：三项任一不满足（「多增量 / 非缓冲」的自动断言在 D7）。
- **D3 并发不串线·仅离线验证（有条件，前提 S5、S9）**：3 个 session 同时发不同的 prompt，只用离线测试验证，且必须走真实 dsh 调用路径。并发证明用屏障：fake provider 先挂起，直到 3 个请求都进入执行再放行，断言任何一个回合结束之前 3 个请求都已进入执行。路由证明：每个 prompt 带唯一标记，fake 原样回显，断言 sessionId=X 的流里 assistant 内容只含 X 的标记。证伪：任一断言失败。
- **D4 per-session 配置（有条件，前提 S5、S6、S9）**：两个 session 分别使用不同的模型 M1/M2 与 preset P1/P2。fake provider 记录每次请求实际收到的模型标识，以及 preset 注入的指令/工具集合；逐 session 断言 S1 的请求是 M1/P1、S2 的请求是 M2/P2，且两者确实不同。测试必须穿过真实 dsh runtime，不能只 mock `app/sdk` 自己的封装；只回显配置的实现判失败。经 SDK 对外接口查询 session 信息时各自返回自己的配置。证伪：请求侧记录与断言不符，或配置互相覆盖、被忽略。
- **D5 重启存续（有条件，前提 S6）**：建 2 个 session、各聊 1 轮后杀掉 SDK 进程，用 D1 的命令重启，list 能返回这 2 个 session，并能取回历史消息。证伪：列表或历史缺失。
- **D6 市场连接器（有条件，前提 S7 + P1 RE-marketplace）**：通过 SDK 对外接口列目录，目录来自 S7 选定的数据源（不是 `app/sdk` 里手写的），条目数 ≥ 该源快照的 N 条（N 在 S7 回来后填）。验收用的连接器必须是 Grok Bot 基础市场里真实存在的一个（名字在 S7 / RE 回来后填），走完 浏览 → 安装 → 在 X 启用 的同一条流程；X 的一轮对话中出现该工具的调用和结果事件，未启用的 session Y 看不到这个工具（X/Y 隔离断言不变）。证伪：任何一步失败或无法区分 X / Y。D7 离线测试可用该源的本地镜像/快照，但任意 MCP 样例只能当单元测试 fixture，不能做 D6 验收。市场类型的前提：由 S7 判定 Grok Bot 基础市场包含哪些类型；若含插件或 OAuth 连接器，走修订账补 D6 子条款再回审；在那之前 P2 只按 MCP 推进。
- **D7 测试绿（有条件，前提 S5）**：setup 完成后断网、没有 API key 的条件下，`pnpm -C app/sdk test` 全绿。D3–D6 的自动化版本都在其中，用 fake LLM 驱动：fake 按 K 个 chunk 输出，断言客户端按顺序收到 K 个增量事件之后才收到结束事件（承接 D2 的「多增量 / 非缓冲」判据）；D8 的跨 session 审批负例也在其中。覆盖率按 `app/sdk/src` 计量（排除 examples 和 tests），自有代码 ≥80%。测试对着 D1 钉定的 dsh commit 跑。证伪：任一用例红，或者覆盖率不到 80%。
- **D8 安全底线（有条件，前提 S5、S6）**：用 `ss -ltnp` 检查，不在非 loopback 地址监听（选 stdio、无监听端口时，端口两项按「无监听端口」判定满足）。若对外有网络端口：不带 token 的请求被拒绝，带有效 token 的请求可用（正例）。默认权限不是 bypass：LLM 发起一次 shell 工具调用时（自动化版由 D7 的 fake 触发），客户端收到审批请求，拒绝后工具不执行；审批回复的 sessionId 与请求不符时不执行（负例，进 D7）。凭证不落盘：用哨兵 key `sk-canary-p2sdk-<随机>` 跑 D2/D5，再 grep 受跟踪文件、运行日志、dsh 会话存储目录（路径由 S6 给出）和 `/proc/<pid>/cmdline`，不得出现该 key。证伪：上述任一项被观察到。
- **D9 superagent**：已移出 P2（Q-001 答 b，见修订账 R-2），不再是出口条件。

## 7. 非目标（放弃了什么、为什么）
- **自定义对外 API 门面**：属于 P3 契约，现在做就是猜（见 §3 B）。
- **fork / 裁剪 dsh 源码进 `app/`**：上游合并成本持续存在（见 §3 C）。dsh 的 `packages/client/*` UI 包由前端选型决定，P2 不碰。
- **superagent 的业务部分**（GitHub / 飞书 source、工单、Policy、web panel）：不在 MVP 旅程里。Q-001 已答 b：superagent 整体移出 P2（R-2）。
- **0.18 的 35 个扩展全量映射**（roadmap R4）：只回答 MVP 用到的（session、MCP、审批、per-session 配置），其余等 P6 按功能逐个处理。
- **云电脑 / box、SSH、远程、VNC、computer-use、账号、移动端**：用户已定为 MVP 不做。
- **Python SDK、多机部署、多用户隔离、遥测**：MVP 是单人本机使用，属于 YAGNI。
- **dsh 自身的 100% 覆盖 CI**：我们只对 `app/sdk` 自有代码负责（D7），不跑上游的全量 CI。

## 8. 待用户确认（≤3，主会话转进 QUESTIONS.md，一次问一个）
- **Q1（已答 b，2026-11-01，见 QUESTIONS Q-001 与 R-2；以下为原题存档）**：superagent 在 MVP 里没有对应旅程，P2 的出口要不要包含「superagent 能加载」？
  - **a**：包含。superagent bundle 和 SDK 在同一 profile 下加载，D1–D8 不退化（作为 D9 写回 DONE）。
  - **b**：不包含。superagent 整体移到 MVP 之后、作为独立 slug，D9 移出 DONE 并记入修订账。
  director 建议 **b**：P2 以 dsh 为主干，superagent 不挡出口。S1 / S2 的实测结论照常收集，留作以后用。
- **Q2**：roadmap 写的是「每个 bot 对应一个 session」，也就是一个 bot 不能有多段对话。这个前提要不要保留？等 P1 的 features RE（Grok Bot 里 bot 和对话的关系）回来再问；不影响 P2 当前的 DONE。

## 9. 待查（主会话派发；scout 结论回来前，BRIEF 不下结论）
已派出的 3 个 scout（superagent 兼容性 / dsh 对外接口选型 / 市场后端复用）覆盖了 S1–S3、S7；S4 已在第二波派出，并提级为 D1 和路线 A 的**阻塞前提**；其余各项按需补派。每项末尾的「阻塞」标注列出能触发 D 回审的结论（走 §6.0-b，与 §3.1 不一致时以 §3.1 为准），未标触发的结论只影响 PLAN。
- **S1（roadmap R1，待 scout 结论）**：superagent 能否在本地 dsh 0.2.2-alpha.2 上装起来，`pnpm check` 是否通过。→ builder 实测。**阻塞**：不触发回审（只关 Q1）。
- **S2（R2，待 scout 结论）**：只用 headless / sdk profile 能否加载 superagent bundle？`webServer` 依赖怎么处理？不带 superagent 时，sdk profile 能不能单独起来（这是 §3 A 的前提）？**阻塞**：sdk/headless profile 不带 superagent 起不来 → 路线 A 整体（D1–D8）回 G1。
- **S3（R3，待 scout 结论）→ /panel D + 用户 C2**：对外接口在 SDK JSON-RPC（stdio）、`/api` + `/api/remote.mux`（WS）、两者都要之间选。比较维度：①一个进程内能否承载多 session 并发，事件按 session 多路复用；②流式粒度；③断线重连与事件回放；④Electron renderer 的接入路径（stdio 必须经 main 进程转发）；⑤审批请求的往返方式。/panel D 记录见 panels/D-iface-r1.md，Q-004 用户已答 **B**（`/api` + `/api/remote.mux`，2026-11-01 11:56）；答复后若需给 D7 补用例（如断线重连），按 §6.0-b 回审 D7。**阻塞**：选定通道补齐缺口需超出 4 项缺口清单 → 路线 A/B 回 G1 重比。
- **S4（D1 与路线 A 的阻塞前提，已派出）→ scout**：dsh 是否以 npm 包发布（`@deepseek-ai/dsh*`，含 sdk profile）？如果没有，`app/sdk` 怎么引用 `repos/deepseek-harness`（workspace link / git 依赖 / tarball）才能满足 D1 的「干净 clone」，又不改动 `repos/`？**阻塞**：干净 clone 无法拿到钉版本的 dsh → D1 + 路线 A 回 G1。
- **S5 → scout**：dsh 有没有可注入的 fake / mock LLM provider（或者 test-support 里的等价物），能支撑 D7 离线测试？**阻塞**：dsh 无法注入 fake provider → D3 / D4 / D7 回审（离线方案重写）。
- **S6 → scout**：dsh 会话的持久化位置，以及 list / resume / 取历史的接口现状；SDK 协议能否在建 session 时指定 preset 或模型（D4、D5）。**阻塞**：不支持建 session 时指定 preset/模型，或没有持久化/历史，且超出缺口清单 → D4 / D5 回审。
- **S7（R5，待 scout 结论）→ scout + RE-marketplace**：dsh 的 `boot/plugin-market`（插件索引）、`plugin-manager`、`apps/plugin-market-generator` 和 Grok Bot 的「插件 / MCP / OAuth 连接器市场」是不是同一类东西？dsh 的 MCP 能否**按 session** 启用（D6 的 X / Y 隔离）？目录数据源取哪一个（Grok 原版目录、dsh 索引、公开 MCP registry）？如果 scout 和 RE 的结论有分歧 → /panel D。**阻塞**：市场流程映射或目录来源的结论（见 D6 前提），以及 MCP 不能按 session 启用 → D6 回审。
- **S8（R4）→ scout**：只针对 MVP 用到的那几个 0.18 扩展和 runner 中间件（session、MCP、审批、配置），回答哪些能用现成的 cordis 插件表达、哪些要新写。**阻塞**：不触发（只喂 PLAN）。
- **S9 → scout，可能升级为 /panel D**：进程模型选「一个 dsh 进程承载 N 个 session」，还是「每个 session 一个子进程」（`sdk/client` 会 spawn 子进程）？请给出并发上限、内存占用和隔离性的数据。**阻塞**：选「每 session 一子进程」且编排代码超出面积上限 → D3 / D4 回审。

## 修订账
（G1 之后对 DONE 条款的任何修改都记在这里：改了什么 / 为什么 / 批准它的 panel 记录。v1→v2 是 G1-r1 修改要点的落实，不算修订。）

| # | 日期 | 改了什么 | 为什么 | 批准 |
|---|---|---|---|---|
| R-1 | 11-01 | §3.1：S4、S3 行补 D7；S5、S6 行补 D8；加「统一规则」一行，§6.0 改为引用它；D8 由「定稿」改「有条件（前提 S5、S6）」 | 表漏了正文依赖（D7←S4 :68、D7←S3 D-iface-r1.md:19、D8←S5/S6 :69），「唯一依据」会压掉合法回审；路线级/条款级口径两处不一 | G1-r2 必须回应清单 2（A-HIGH）+ B-MEDIUM（G1-r2-B.md:12）；PLAN T-00 |
| R-2 | 11-01 | D9 移出 P2，§4 死因 1、§7、§8 Q1 同步 | 用户答 Q-001 = b（QUESTIONS.md:12）；独立 profile 才能装 superagent（reuse/superagent-compat.md:9） | 用户 Q-001 |
| R-3 | 11-01 | §6.0-c 由「全部前提先有结论」改为按条款卡 | 否则整份 PLAN 等 P1 RE-marketplace | G1-r2 A-MEDIUM（G1-r2-A.md:9），待 G2 复核 |
| R-4 | 11-01 | 前提结论（§6.0-a/b 分流）：S2 a（web 模板不含 superagent，superagent-compat.md:59）；S3 a，Q-004=B，新增方法只有「连接器按 session 启用」1 项（dsh-sessions.md:15,42-44；market-backend.md:9；ext-mapping.md:32）；S5 a（dsh-as-dependency.md:10,83）；S6 a（dsh-sessions.md:13-15,29）；S9 a，单 runtime 承载 N session（dsh-sessions.md:16,102）；**S4 b**：npm 精确版本，D1「commit / 固定路径 / 校验 repos」与 D7「钉定 commit」措辞失效（dsh-as-dependency.md:9,49）；S3 另需给 D7 补断线重连用例 → **b**；S7 仅 dsh 侧回来，D6 仍等 RE-marketplace | — | D1/D7/D8 改写提案见 PLAN §4，待 §6.0-b 回审（只审这三条） |
