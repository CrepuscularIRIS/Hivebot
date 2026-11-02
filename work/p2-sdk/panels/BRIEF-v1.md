# BRIEF · p2-sdk（P2 SDK 抽取）

v1 · 2026-11-01 · director（Opus 5.5）· 待 /panel G1

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
| 做法 | `app/sdk` = 一个 dsh profile / bundle（`cordis.yml` + 自有插件）。dsh 作为**依赖**引入；对外直接使用 dsh 现成的 SDK 协议（`packages/sdk/*`）或 `/api`（待 S3）；只补 dsh 缺的部分（多 session 编排、市场适配、per-session 配置） | `app/sdk` 新写一个 TS 服务，定义 Grok 形状的 API，内部为每个 bot 驱动一个 dsh SDK client | 把 dsh 复制进 `app/sdk`，删掉 client 包 |
| 代价 | 对外接口跟着 dsh 协议走，dsh 升级有破坏风险（用 D7 的契约测试兜住） | 等于提前定 P3 契约，而 P1 的 ipc-rpc 结论还没回来，很可能返工；代码量最大 | 约 370 个包，CI 要求 100% 覆盖，上游一更新就要手动合并，维护成本无底 |

**放弃 B**：对外接口的形状是 P3 要决定的事（路线 A / B 都在 P3 里）。P2 现在写门面，就是在猜契约。
**放弃 C**：fork 等于接下 dsh 的全部维护成本，换来的只是「目录看起来干净」。
**A 的前提**：dsh 能以依赖形式被引用，而且 sdk / headless profile 能单独起来（S2、S4）。如果前提不成立，回到 G1 重议，不要静默滑向 C。

## 4. 逆向一问：三个月后 P2 失败，最可能的死因
1. **陷进 superagent**：superagent 是「面向单个 GitHub 仓、监听 GitHub / 飞书、按工单执行」的主动 agent（见其 README），peer 依赖 dsh 0.2.1，和 MVP 的聊天旅程**没有交集**。如果为了让它跑通去修兼容性，聊天链路会一直起不来。→ **防**：superagent 不放在 P2 关键路径上（D9，待用户确认 Q1）。
2. **钉在 alpha 上漂移**：dsh 0.2.2-alpha.2 一升级，协议就变，P4 跟着崩。→ **防**：锁定依赖版本；D7 契约测试对着锁定版本跑，升级 dsh 时必须先过 D7。
3. **接口选错，P3 返工**：→ **防**：P2 不发明产品接口（放弃 B），接口选型作为契约题交给 /panel D 和用户 C2（S3）。
4. **「能聊」但不安全**：默认自动审批 exec（openclaw 反例），或者在非 loopback 地址裸露端口。→ **防**：D8。

## 5. 用户与核心旅程（≤3）
- **J1 单 bot**：启动 SDK → 建 session（选 preset）→ 发消息 → 收到增量流式事件 → 收到回合结束事件。
- **J2 多 bot**：3 个 session 同时发消息，各自的流互不串线 → 杀掉进程再起 → 列出 session，取回历史。
- **J3 市场**：浏览连接器目录 → 安装一个 MCP 连接器 → 在某个 session 启用 → 该 session 的 agent 调用到它的工具。

## 6. DONE 条款（每条附证伪方式，证据放 `work/p2-sdk/evidence/`）
命令名是暂定的，PLAN 可以改名，但必须保持「一条命令」的粒度，并在 `app/sdk/README.md`「启动」节写明。
- **D1 一条命令起**：在干净 clone 上执行 setup 命令（只运行一次）后，`pnpm -C app/sdk start` 在 60s 内输出 ready，进程常驻。证伪：超时、报错退出，或者需要手工改文件。
- **D2 最小客户端（真模型冒烟）**：`node app/sdk/examples/min-client.mjs "你好"` 建 session、发消息，依次打印 ≥2 个增量事件和 1 个回合结束事件，退出码为 0。API key 只从环境变量读取。证伪：没有增量（一次性整段返回也算失败）、没有结束事件，或者退出码非 0。
- **D3 并发不串线**：`min-client --sessions 3` 让 3 个 session 同时发不同的 prompt。断言：每条事件都带 session 标识，且只出现在自己的流里；三条流的事件在时间上交错（排除串行执行冒充并发）。证伪：脚本断言失败。
- **D4 per-session 配置**：两个 session 分别使用不同的 agent preset 或模型，查询 session 信息时各自返回自己的配置，回合确实按各自配置执行。证伪：配置互相覆盖或被忽略。
- **D5 重启存续**：建 2 个 session、各聊 1 轮后杀掉 SDK 进程，用 D1 的命令重启，list 能返回这 2 个 session，并能取回历史消息。证伪：列表或历史缺失。
- **D6 市场连接器**：通过 SDK 接口列目录（≥1 项），安装 1 个 MCP 连接器，在 session X 启用后，X 的一轮对话中出现该工具的调用和结果事件；未启用的 session Y 看不到这个工具。证伪：任何一步失败或无法区分 X / Y。
- **D7 测试绿**：在断网、没有 API key 的条件下，`pnpm -C app/sdk test` 全绿。D3–D6 的自动化版本都在其中，用 fake LLM 驱动。`app/sdk` 自有代码覆盖率 ≥80%。测试对着 lockfile 锁定的 dsh 版本跑。证伪：任一用例红，或者覆盖率不到 80%。
- **D8 安全底线**：用 `ss -ltnp` 检查，不在非 loopback 地址监听。如果对外有网络端口，不带 token 的请求会被拒绝。默认权限不是 bypass：fake LLM 发起一次 shell 工具调用时，客户端会收到审批请求，拒绝后工具不执行。`git grep` 和运行日志里都找不到 API key。证伪：上述任一项被观察到。
- **D9 superagent（待 Q1）**：选 a 时，superagent bundle 和 SDK 在同一 profile 下加载，D1–D8 不退化；选 b 时，本条移出 P2，记入修订账。

## 7. 非目标（放弃了什么、为什么）
- **自定义对外 API 门面**：属于 P3 契约，现在做就是猜（见 §3 B）。
- **fork / 裁剪 dsh 源码进 `app/`**：维护成本无底（见 §3 C）。dsh 的 `packages/client/*` UI 包由前端选型决定，P2 不碰。
- **superagent 的业务部分**（GitHub / 飞书 source、工单、Policy、web panel）：不在 MVP 旅程里。P2 最多保证它「能加载」（D9）。
- **0.18 的 35 个扩展全量映射**（roadmap R4）：只回答 MVP 用到的（session、MCP、审批、per-session 配置），其余等 P6 按功能逐个处理。
- **云电脑 / box、SSH、远程、VNC、computer-use、账号、移动端**：用户已定为 MVP 不做。
- **Python SDK、多机部署、多用户隔离、遥测**：MVP 是单人本机使用，属于 YAGNI。
- **dsh 自身的 100% 覆盖 CI**：我们只对 `app/sdk` 自有代码负责（D7），不跑上游的全量 CI。

## 8. 待用户确认（≤3，主会话转进 QUESTIONS.md，一次问一个）
- **Q1（先问）**：superagent 在 MVP 里没有对应旅程。P2 的出口要不要包含「superagent 能加载」（D9-a），还是把它整体移到 MVP 之后、作为独立 slug（D9-b）？director 建议 **b**：P2 以 dsh 为主干，superagent 不挡出口。S1 / S2 的实测结论照常收集，留作以后用。
- **Q2**：roadmap 写的是「每个 bot 对应一个 session」，也就是一个 bot 不能有多段对话。这个前提要不要保留？等 P1 的 features RE（Grok Bot 里 bot 和对话的关系）回来再问；不影响 P2 当前的 DONE。

## 9. 待查（主会话派发；scout 结论回来前，BRIEF 不下结论）
已派出的 3 个 scout（superagent 兼容性 / dsh 对外接口选型 / 市场后端复用）覆盖了 S1–S3、S7。其余各项按需补派。
- **S1（roadmap R1，待 scout 结论）**：superagent 能否在本地 dsh 0.2.2-alpha.2 上装起来，`pnpm check` 是否通过。→ builder 实测
- **S2（R2，待 scout 结论）**：只用 headless / sdk profile 能否加载 superagent bundle？`webServer` 依赖怎么处理？不带 superagent 时，sdk profile 能不能单独起来（这是 §3 A 的前提）？
- **S3（R3，待 scout 结论）→ /panel D + 用户 C2**：对外接口在 SDK JSON-RPC（stdio）、`/api` + `/api/remote.mux`（WS）、两者都要之间选。比较维度：①一个进程内能否承载多 session 并发，事件按 session 多路复用；②流式粒度；③断线重连与事件回放；④Electron renderer 的接入路径（stdio 必须经 main 进程转发）；⑤审批请求的往返方式。
- **S4 → scout**：dsh 是否以 npm 包发布（`@deepseek-ai/dsh*`，含 sdk profile）？如果没有，`app/sdk` 怎么引用 `repos/deepseek-harness`（workspace link / git 依赖 / tarball）才能满足 D1 的「干净 clone」，又不改动 `repos/`？
- **S5 → scout**：dsh 有没有可注入的 fake / mock LLM provider（或者 test-support 里的等价物），能支撑 D7 离线测试？
- **S6 → scout**：dsh 会话的持久化位置，以及 list / resume / 取历史的接口现状；SDK 协议能否在建 session 时指定 preset 或模型（D4、D5）。
- **S7（R5，待 scout 结论）→ scout + RE-marketplace**：dsh 的 `boot/plugin-market`（插件索引）、`plugin-manager`、`apps/plugin-market-generator` 和 Grok Bot 的「插件 / MCP / OAuth 连接器市场」是不是同一类东西？dsh 的 MCP 能否**按 session** 启用（D6 的 X / Y 隔离）？目录数据源取哪一个（Grok 原版目录、dsh 索引、公开 MCP registry）？如果 scout 和 RE 的结论有分歧 → /panel D。
- **S8（R4）→ scout**：只针对 MVP 用到的那几个 0.18 扩展和 runner 中间件（session、MCP、审批、配置），回答哪些能用现成的 cordis 插件表达、哪些要新写。
- **S9 → scout，可能升级为 /panel D**：进程模型选「一个 dsh 进程承载 N 个 session」，还是「每个 session 一个子进程」（`sdk/client` 会 spawn 子进程）？请给出并发上限、内存占用和隔离性的数据。

## 修订账
（G1 之后对 DONE 条款的任何修改都记在这里：改了什么 / 为什么 / 批准它的 panel 记录）
