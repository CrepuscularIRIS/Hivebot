# G1-r1 回应 · p2-sdk BRIEF v1 → v2 修改要点

2026-11-01 · director（Opus 5.5）· 交 drafter 起草 v2，director 审定后跑 G1-r2
总判断：4 条 HIGH 都接受，根因是同一个：v1 把「依赖未决」写成了「无条件 DONE」。v2 的结构改动只有三处：§3 加一张前提清单，§6 每条 D 标前提，P2 新增接口集中声明。范围 HOLD 不变，不加能力。
scout 纪律：S1/S2/S3/S7 结论未回，v2 不能替它们写结论，只写「结论为 X 时怎么处理」。`reuse/market-backend.md` 已经在盘上（11:23），但主会话说 S7 还没回，v2 不引用它的内容。

## 1. [A-HIGH] 路线 A 漏了「SDK 协议缺 per-session 模型 / list / history / market」→ 接受
已核实：`packages/sdk/protocol/src/types.ts:17-31` 里 `InitializeParams.provider/model` 写着 "every SDK-created agent runs on"，是进程级的。
- §3 A 行「做法」改为：dsh 作依赖，对外沿用 S3 选定的通道；**已知缺口清单**写死为 4 项：①per-session 模型/preset ②session list ③取历史 ④市场目录/安装/按 session 启用。缺口怎么补由 S3（`/api` 是否已经覆盖）和 S9（每 session 一个子进程能否解决进程级模型）决定，BRIEF 不预判。
- §3 新增「3.1 A 的前提清单」表，列为 前提 | 对应待查 | 关联 D | 否定时去向（见第 3 条映射表）。
- **临时接口标注方式**（v2 写进 §3.1 末尾）：P2 新增的对外方法只放在 `app/sdk` 的一个模块里，文件头写「P2-TEMP：P3 可推翻」；方法名用统一命名空间前缀（PLAN 定名），这样 grep 一次就能列全；`app/sdk/README.md` 单设「临时扩展」一节，逐条列出来。
- **面积上限**（吸收 A-MEDIUM 死因 a、C-MEDIUM「静默滑向自有调度」）：新增方法超出上面 4 项缺口，或为补缺口自写跨 session 调度/编排层，都必须回 G1，不能在 PLAN 里自行扩大。这一条写进 §4 作为第 5 条死因及防护。
- §3「放弃 B」部分接受 A 的批评：改成「A 和 B 都要补接口，区别在于 A 的补丁面积有上限、标了临时、P3 可以整体推翻，B 要预定整套 API 形状」。删掉「代码量最大」这个没验证过的估计（B 席意见）。「放弃 C」改成「上游合并成本持续存在」，去掉「无底」这种绝对说法（C 席意见）。补一条：前提清单否定到超出缺口清单时，A/B 回 G1 重新比较。

## 2. [A-HIGH] D1「干净 clone」和 `.gitignore:1 repos/*/`、dsh `"private": true` 冲突 → 部分接受
- 接受：S4 从「按需补派」升级为 **D1 和路线 A 的阻塞前提**（S4 已在第二波派出，见 LOG 11:39）。
- 不接受「阻塞整份 BRIEF 定稿」：S4 否定时，第 3 条映射表已经把路线 A 整体送回 G1，不需要再给 BRIEF 加一道整体闸。
- §6 D1 重写「干净 clone」：干净 clone 指 bot 仓的 clone 加一次 setup。setup 只允许做三件事：①按钉定的 commit 把 dsh 取到固定路径（取法由 S4 定）②`pnpm install` ③只构建 sdk 运行时需要的子图。dsh 的 commit 钉在 `app/sdk` 里的一个文件中，不只靠 lockfile。本机 `repos/deepseek-harness` 已存在时，setup 只校验 commit、不改动，不一致就报错退出。新增证伪：setup 改动了 `repos/`，或者 commit 校验被跳过。
- 吸收 A-MEDIUM 死因 b（构建过重）：setup 的耗时和峰值内存记进 evidence，只作证据、不设阈值；§4 加第 6 条死因「构建拖垮 D1/D7」，防护是只构建子图，且按 CLAUDE.md §4 盯 iowait 和 load。

## 3. [A-HIGH] 阻塞划分错位 → 接受（同时吸收 B-MEDIUM「待查无收敛闸门」）
- §6 开头加「6.0 条件通过规则」：G1-r2 可以有条件通过。每条 D 标为「定稿」或「有条件（前提 S#）」。前提回来以后：
  a. 肯定且 DONE 文字不用改：主会话在修订账记一行「前提满足」，不回审；
  b. 否定，或者需要改 DONE 文字、改路线：只把受影响的 D 条款送回 G1（G1-rN 只审这几条）；
  c. 所有前提必须在 PLAN 定稿 / G2 之前有结论。S3 的结论必须走完 /panel D 和用户 C2 才能实现。
- §9 每项加一列「阻塞」。**能触发 D 回审的 scout 结论**只有下面这些（其余结论只影响 PLAN）：

| 待查 | 触发回审的结论 | 回审范围 |
|---|---|---|
| S2 | sdk/headless profile 不带 superagent 起不来 | 路线 A 整体（D1–D8） |
| S4 | 干净 clone 无法拿到钉版本的 dsh | D1 + 路线 A |
| S3 | 选定通道补齐缺口需要超出 4 项缺口清单 | 路线 A/B 重比（第 1 条上限） |
| S6 | 不支持建 session 时指定 preset/模型，或没有持久化/历史，并且超出缺口清单 | D4 / D5 |
| S9 | 选「每 session 一子进程」时，编排代码超出上限 | D3 / D4 |
| S5 | dsh 无法注入 fake provider | D7（离线方案重写） |
| S7 | 市场流程映射或目录来源（第 4 条），以及 MCP 不能按 session 启用 | D6 |
| S1 / S8 | 不触发（S1 只关 Q-001，S8 只喂 PLAN） | — |

- D 条款统一用行为描述（「经 SDK 对外接口」），不写具体方法名。这样 S3 选哪个通道本身不触发回审，只有超出上限才触发。这也部分采纳了 A 席 reverse_take（先等 S3 再写 DONE）：v2 不等 S3，但 DONE 不绑定任何通道。

## 4. [B-HIGH + C-HIGH] D6 可被任意 MCP 样例满足 → 接受
- D6 标「有条件（前提 S7 + P1 RE-marketplace）」。D6 定稿前置有两项：S7 的产品流程映射，加目录来源决策。
- §6 D6 重写，三处要改：①目录来自 S7 选定的数据源，不是 `app/sdk` 里手写的；条目数 ≥ 该源快照的 N 条（N 在 S7 回来后填，同时吸收 A-MEDIUM「≥1 项太弱」）。②验收用的连接器必须是 Grok Bot 基础市场里真实存在的一个（名字在 S7/RE 回来后填），走完 浏览 → 安装 → 在 X 启用 的同一条流程；X/Y 隔离的断言不变。③D7 离线测试可以用该源的本地镜像/快照，但任意 MCP 样例只能当单元测试 fixture，不能拿来做 D6 验收。
- A-MEDIUM「插件 / OAuth 未覆盖」：**不写进非目标**，因为那会缩小 MVP，需要用户批准。改写进 D6 的前提：由 S7 判定 Grok Bot 基础市场包含哪些类型；包含插件或 OAuth 的话，走修订账补 D6 子条款，再回审。在那之前，P2 只按 MCP 推进。

## 5. 顺手纳入的两条 MEDIUM
- **D2/D3 增量数和时序断言误杀**（B-MEDIUM、C-MEDIUM，并吸收 A-MEDIUM 的标记断言和 A/C-LOW）→ 接受。
  - D2 改为手动真模型冒烟，证据是输出日志。断言只有三项：至少 1 个增量事件早于结束事件、有结束事件、退出码为 0。「多增量 / 非缓冲」移到 D7：fake 按 K 个 chunk 输出，断言客户端按顺序收到 K 个增量事件之后才收到结束事件。
  - D3 只做离线验证，必须走真实 dsh 调用路径。并发证明改用屏障：fake provider 先挂起，直到 3 个请求都进入执行再放行，断言任何一个结束之前 3 个请求都已经进入执行。路由证明：每个 prompt 带唯一标记，fake 原样回显，断言 sessionId=X 的 assistant 内容只含 X 的标记。删掉「时间交错」这个判据。
- **D4 缺执行侧判据**（B-MEDIUM、C-MEDIUM）→ 接受。fake provider 记录每次请求实际收到的模型标识，以及 preset 注入的指令/工具集合。逐 session 断言 S1 的请求是 M1/P1、S2 的请求是 M2/P2，而且两者确实不同。测试必须穿过真实 dsh runtime，不能只 mock `app/sdk` 自己的封装。只回显配置的实现必须判失败。

## 6. 其余 MEDIUM / LOW 表态
- A-M D8 哨兵 key：接受。用 `sk-canary-p2sdk-<随机>` 跑 D2/D5，再 grep 受跟踪文件、运行日志、dsh 会话存储目录（S6 给出路径）、`/proc/<pid>/cmdline`。
- B-M D8 有效 token 正例 / 跨 session 审批：接受。补一条有效 token 可用的正例，再补一条负例：审批回复的 sessionId 和请求不符时不执行，进 D7。选 stdio 时端口两项按「无监听端口」判定满足。
- A-M 死因 a / b：已在第 1、2 条吸收。C-M「复用失败重新决策条件」：已在第 1、3 条吸收。B-M 收敛闸门：已在第 3 条吸收。
- B 理由「B/C 不应被未验证估计永久排除」：部分接受，见第 1 条改写。
- A-L D7：接受，写明「setup 完成后断网，再跑 test」，覆盖率计量范围是 `app/sdk/src`，排除 examples 和 tests。
- A-L vs C D9（两席冲突）：折中处理。DONE 里只留一行占位「D9 待 Q-001；答复前 P2 出口不得宣布完成」，a/b 两个分支的文本挪到 §8 Q1。这样 DONE 里没有条件分支（A 席要求），也不把暂定选项 b 当成用户批准（C 席要求）。

## 7. 给 drafter 的同步清单
- 要改的节：§3（含新增 3.1）、§4（新增死因 5、6）、§6（新增 6.0；改 D1–D4、D6、D7、D8；D9 改为占位）、§7（不动，插件/OAuth 不进非目标）、§8 Q1（接收 D9 分支文本）、§9（加「阻塞」列，S4 提级）。
- 版本行改为「v2 · 回应 G1-r1，见 panels/G1-r1-response.md」。修订账保持空：G1 还没通过，v1→v2 不算修订。
- 总长度 ≤110 行。不新增能力，不写任何 scout 的结论。
