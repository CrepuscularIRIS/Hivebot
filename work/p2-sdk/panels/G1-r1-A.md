seat: A
verdict: REVISE
confidence: medium
findings:
- [HIGH] BRIEF.md:18,21,23 — 路线 A 的前提只写了 S2、S4，漏了「dsh SDK 协议本身不支持 D4/D5/D6」这一条更硬的前提；A 实际要新增 per-session 配置、session 列表/历史、市场目录等方法，等于在 A 里悄悄做 B（发明接口），§3 放弃 B 的理由对 A 同样成立 — 证据: repos/deepseek-harness/packages/sdk/protocol/src/types.ts:17-31（`InitializeParams` 是 "process-wide SDK handshake"，`provider`/`model` 是 "every SDK-created agent runs on"，即模型为进程级而非 session 级）；packages/sdk/protocol/README.md:40-58 方法表只有 initialize / session/prompt|query|resume|wait|working-directory / shutdown，无 session list、无取历史、无市场方法；README.md:69 "Historical events remain in the stored log; notifications report newly committed events"（resume 不回放历史） — 建议: §3 A 行写明「SDK stdio 协议缺 per-session 模型、list、history、market；补齐方式取决于 S3（/api 已有 session-controller、plugin-market，见 packages/api/、'/api/plugin-market/detail-file'）或 S9（每 session 一个子进程）」，并把 S3/S6/S9 列为 A 的前提；P2 新增的方法统一标注「临时、P3 可推翻」，放进一个文件，不散落。
- [HIGH] BRIEF.md:38,66 — D1「干净 clone」与仓库现状冲突：`.gitignore` 第 1 行 `repos/*/`，干净 clone 里没有 dsh；dsh 根包 `"private": true`（repos/deepseek-harness/package.json:5），是否有已发布 npm 包未知。S4 决定 D1 能否成立，也是 A 的前提，但 §9 把 S4 归为「按需补派」 — 证据: /home/lingxufeng/bot/.gitignore:1；BRIEF.md:62 — 建议: S4 升为阻塞 BRIEF 定稿；D1 写明 setup 允许做什么（如 `git clone` 指定 commit 的 dsh 到固定路径、`pnpm install`、`build:lib`），并把 dsh commit/版本钉在 `app/sdk` 的文件里，而不是只靠 lockfile。
- [HIGH] BRIEF.md:61-71 — 待查项阻塞划分不对：S2/S4/S6/S9 是 D1/D4/D5 能否成立的前提，S7 的「MCP 能否按 session 启用」决定 D6 的 X/Y 隔离能否成立，但 BRIEF 只写「scout 结论回来前不下结论」，同时 §6 已把 D4/D5/D6 写成定稿条款 — 证据: BRIEF.md:41-43 vs 66-71；protocol 进程级 model（types.ts:24-26） — 建议: 显式写「G1 有条件通过：S2/S4/S6/S7(按 session 隔离)/S9 任一否定 → D4/D5/D6 回 G1 修订」，或者等这些回来再交 G1。
- [MEDIUM] BRIEF.md:43 — D6 只覆盖 MCP 连接器；roadmap MVP 原文是「插件 / MCP 市场的浏览、安装、启用」（roadmap.md:7）。插件（dsh plugin-manager）和 OAuth 连接器既没进 DONE 也没进 §7 非目标 — 证据: roadmap.md:7、:63；BRIEF.md:43、:48-55 — 建议: 二选一，补 D 条款或在 §7 明写「P2 只做 MCP，插件/OAuth 等 P1 RE-marketplace 回来再定」。
- [MEDIUM] BRIEF.md:43 — 「列目录 ≥1 项」可被一个硬编码单条 JSON 满足，验不出市场后端是否接上真实数据源 — 证据: BRIEF.md:43、:69（数据源未定） — 建议: 写成「目录来自 S7 选定的数据源，条目数 ≥ 该源快照的 N 条」或至少「非 app/sdk 内手写」。
- [MEDIUM] BRIEF.md:40 — D3「每条事件只出现在自己的流里」：SDK 只有一条 `session.event` 通知流，且推送「every session in the runtime, unfiltered」，「自己的流」是客户端按 sessionId 分拣出来的，按 sessionId 分拣永远不会串，断言是同义反复；「时间交错」在 fake LLM 下可能瞬间完成导致不稳定 — 证据: packages/sdk/protocol/src/types.ts:151-156；protocol/README.md:53 — 建议: 断言改为「每个 session 的 prompt 里放唯一标记，fake LLM 回显，断言 sessionId=X 的 assistant 内容只含 X 的标记」；交错用 fake LLM 的可控延迟（每 chunk sleep）来保证，并写明在 D7 里跑。
- [MEDIUM] BRIEF.md:45 — D8「git grep 和运行日志里找不到 API key」未说明用哪把 key、查哪些位置；session 持久化目录也可能落盘环境/请求头 — 证据: BRIEF.md:45；S6 尚未确定持久化位置（BRIEF.md:68） — 建议: 用固定哨兵 key（如 `sk-canary-p2sdk-…`）跑一遍 D2/D5，再 `grep -r` 仓库、日志、dsh 会话存储目录、`/proc/<pid>/cmdline`。
- [MEDIUM] BRIEF.md:25-29 — 死因清单漏了两个更可能的：(a) A 被 D4/D5/D6 逼成「N 个子进程 + 自写编排 + 自写 list/history/market 接口」，即悄悄滑向 B，且这层没有契约评审；(b) dsh 构建本身很重（370 包、`build:lib:host` 用 `--max-old-space-size=8192` 的 tsc、native/system，package.json:22-25），在机器跑 GPU 训练时 setup/CI 不稳，D1/D7 卡在构建而非逻辑 — 证据: repos/deepseek-harness/package.json:22-25；/home/lingxufeng/bot/CLAUDE.md §4 最后一条 — 建议: 补这两条死因及防护：(a) 新增接口面积设上限、超出即回 G1；(b) setup 只构建 sdk profile 需要的子图（如 pnpm --filter ...dsh-sdk-app...），并记录构建耗时与峰值内存作为证据。
- [LOW] BRIEF.md:44 — D7「断网」与 setup 需联网安装依赖并存，应写明「setup 后断网跑 test」；「覆盖率 ≥80%」需指明计量范围（app/sdk/src，排除 examples）— 证据: BRIEF.md:44 — 建议: 一句话补齐。
- [LOW] BRIEF.md:39 — D2 依赖真模型与真 key，不能自动化进 CI；可以接受，但应注明「手动冒烟，证据为输出日志」，与 D7 的自动化区分 — 证据: BRIEF.md:39 — 建议: 加一句标注。
- [LOW] BRIEF.md:46 — D9 两个分支写在 DONE 里，Q1 不答 DONE 就不确定；Q-001 已注明「暂按 b 推进」（QUESTIONS.md:11） — 建议: DONE 默认按 b 写，选 a 时再走修订账，避免 DONE 里留条件分支。
reverse_take: 最可能的死法是「组合式」名义下，为了满足 per-session 模型、list/history、市场目录，在 dsh SDK 外逐步长出一层没人评审过的私有接口加子进程编排，最后变成没有契约的 B；更笨更稳的做法是先等 S3 选定 `/api`（已有 session-controller、plugin-market）还是 stdio，再按所选通道已有的方法写 DONE，缺什么写成显式的「P2 临时扩展清单」。

---

## 理由

### 1. 范围
- MVP 边界基本忠实：§7（BRIEF.md:53）把云电脑 / SSH / 远程 / VNC / computer-use / 账号 / 移动端全部列为非目标，与 roadmap.md:9 一致；Python SDK、多用户、遥测按 YAGNI 剔除，合理。
- D5 超出 roadmap P2 字面出口，但 BRIEF.md:13 给了来自 P4 DONE 示例（roadmap.md:82）的理由，申报透明，接受。
- superagent 移出：roadmap P2 目的（roadmap.md:57）写的是「dsh + superagent」，移出是对 roadmap 的偏离，但已通过 Q-001 交用户决定，处理正确。
- 漏项：市场只覆盖 MCP，未覆盖 roadmap 写明的「插件」市场（见 MEDIUM）。

### 2. DONE 可证伪性
D1/D2/D5/D7 基本可判。D3 的「只出现在自己的流里」在单通知流协议下是同义反复，需改成内容级断言；D6 的「≥1 项」太弱；D8 的密钥检查需要哨兵 key 才能证伪；D4/D5/D6 的可达性取决于未回来的 scout（见 HIGH）。

### 3. 路线
放弃 C 理由成立（370 包 + 100% 覆盖 CI）。放弃 B 的理由「现在写门面就是猜契约」本身成立，但 A 并不能免于此：dsh SDK stdio 协议的模型是进程级的，没有 list / history / market 方法，A 要满足 D4/D5/D6 就得新增接口面，与 B 的风险同源。差别在于 `/api` 通道（packages/api/session-controller、plugin-market 路由）可能已经覆盖这些，所以 S3 的结论直接决定 A 的工作量和形状，应当列为 A 的前提，而不只是 S2、S4。

### 4. 死因分析
列出的四条（superagent 泥潭、alpha 漂移、接口选错、不安全）都真实。漏了「A 悄悄长成无契约的 B」和「dsh 构建过重导致 setup / 测试不稳」，见 MEDIUM。

### 5. 依赖处理
S1 只关 D9，不阻塞是对的。S4、S6、S9 和 S7 的「按 session 启用 MCP」子问题应当阻塞 D 条款定稿，目前没有阻塞。

### 为什么不是 BLOCK
没有违反安全红线（D8 反而写得比较全）；核心旅程 J1 用现成 SDK 协议即可完成（session/prompt + session.event + approval/request 都在 README.md:43-53）；方案没有建立在已证伪的事实上，A 的「只补缺的部分」措辞给了余地，只是缺口比 BRIEF 估计的大。补齐前提和阻塞关系后即可通过。
