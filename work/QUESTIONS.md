# QUESTIONS（主会话 ↔ 用户）

用户负责：需求、产品取舍、流程规则、接口约束。每次 tick 检查「答复：」栏。
格式见 grok-orchestrate SKILL.md §3。新的问题追加在末尾。

## Q-001 [answered] superagent 要不要算进 P2 出口
- slug：p2-sdk ｜ 类型：取舍（可逆）｜ 阻塞：仅 D9 定稿，D1–D8 照常推进 ｜ 提出：2026-11-01 11:37
- 背景（详见 work/p2-sdk/BRIEF.md §4、§8）：superagent 是面向单个 GitHub 仓、按工单工作的主动 agent（peer 依赖 dsh 0.2.1），与 MVP 的聊天旅程没有交集。若为它修兼容性会卡住聊天主干。**scout 结论（work/p2-sdk/reuse/superagent-compat.md，2026-11-01）：决策=改造；`sessionController.inspect` 已删除、adapter 必须迁移；headless/sdk profile 缺 Host 服务承载不了原版 bundle，最短路径是独立 Web 模板 profile——即「与 SDK 同一 profile 加载」（原 D9-a 写法）按现状做不到，选 A 需回 G1 改 D9 写法。**
- 选项：
  - A：P2 出口包含「superagent 能加载」（原 D9-a：同 profile 加载且 D1–D8 不退化；按 scout 结论需改为「独立 profile 可加载」并回 G1 过审）
  - B（推荐，director 意见，暂按推荐推进）：superagent 整体移出 P2，作为 MVP 后独立 slug；S1/S2 实测结论照常收集留作以后用。理由：P2 以 dsh 为主干，superagent 不挡出口
- 答复：可以的, superagent可以先不做. superagent可能是一种另外的模式, 例如可能是总Grok Bot是SuperAgent? 还是说大部分日常的Grok Bot是DSH? 就是有一种分工
- 落实（主会话 2026-11-01 11:52）：选 B 定稿——superagent 移出 P2，D9=移出，修订账记一条。用户的「分工猜想」（主 bot=SuperAgent、日常 bot=DSH 式分工）作为附加问题并进 P1 features RE 的 Q1（bot 数据模型），RE 派发时带上；同时留给未来 superagent slug 的 BRIEF 输入。

## Q-002 [answered] P1 截图要不要用户本人登录后截取
- slug：p1-re ｜ 类型：取舍（可逆，默认值先执行）｜ 阻塞：无（只截未登录页面）｜ 提出：2026-11-01 11:45
- 背景（work/p1-re/BRIEF.md §9-1）：0.78.1 已装在 /opt/Grok Bot。登录后截 MVP 页面截图更完整，但可能带账号个人数据；凭证全程不进模型。
- 选项：
  - A（默认，暂按默认执行、待答复，非批准）：不登录，只截未登录可达页面，其余靠静态分析
  - B：用户本人登录后由 RE 截取 MVP 页面（用户需在场配合）
- 答复： 当然, 测试可以使用本地litellm的glm 5.3 flash, 目标是跑通过好吧
- 落实（主会话 2026-11-01 11:52）：「当然」按接受默认 A 解读（不登录截图）；答复主体是关于 P2 测试的真模型来源——**本地 LiteLLM 的 glm 5.3 flash（本机 http://127.0.0.1:4001/，key 走环境变量）可用于 D2/D5 真模型冒烟，不需要云端 key**。已传给 PLAN 作者落实到相应任务验收。若「当然」并非指默认 A，请纠正。

## Q-003 [answered] 跨会话消息 RE 深度：深挖 → 清单
- slug：p1-re ｜ 类型：取舍（可逆，默认值先执行）｜ 阻塞：无 ｜ 提出：2026-11-01 11:45
- 背景（work/p1-re/BRIEF.md §8）：roadmap 原写跨会话消息深挖；director 建议降为清单（不在 MVP 里，P6 有独立 slug 届时再挖，现在挖到 P6 也过期了）。
- 选项：
  - A（默认，暂按默认执行、待答复，非批准）：同意降为清单（一行：位置、一句话、0.18 对照）
  - B：维持 roadmap 原文，P1 就深挖
- 答复：（2026-11-01 11:56 用户口头：剩下的取舍不重要，按推荐走，先把 demo 跑出来）
- 落实（主会话 2026-11-01 11:56）：按 A 定稿——降为清单。 这个有两个思路, 让Opus去设计, 一个是主grok bot用dsh superagent, 剩下的用dsh.  这样还是需要深挖的, 或者是我们先把整个流程跑通过, 然后再决定继承.
- 用户补充的落实（2026-11-02 00:40）：「主 bot 分工」两思路——①主 Grok bot 用 dsh+superagent、其余用 dsh（则跨会话消息需深挖）②先跑通整个流程再决定——**交 Opus（director）在 P3 契约设计时一并出对比备忘**，不阻塞 MVP 主线。 

## Q-004 [answered] P2 SDK 对外接口通道：/api+remote.mux 还是 JSON-RPC stdio
- slug：p2-sdk ｜ 类型：契约 ｜ 阻塞：PLAN 中通道接线类实现任务（BRIEF v2 / G1-r2 不阻塞，DONE 已通道无关）｜ 提出：2026-11-01 11:31
- 背景（work/p2-sdk/reuse/dsh-api.md 全文对比；dsh-as-dependency.md 独立发现同一点）：MVP 硬需求 = 多 session 并发 + 流式事件推送到前端。stdio JSON-RPC 支持多 session 与 durable 事件，但当前无实时 assistant chunk 转发，且 Electron renderer 接入须经 main 转发。/api + remote.mux 有现成宿主侧鉴权与路由。**/panel D-iface r1 已投票（2026-11-01 11:33，panels/D-iface-r1.md）：两席一致选 B**，与 scout 推荐一致；附架构约束（renderer 经 IPC、main 唯一 mux 客户端、token 只留 main）。
- 选项：
  - A：SDK JSON-RPC（stdio）。进程内直连、无网络端口；需补实时流桥接与 renderer 转发层。
  - B（panel 两席一致 + scout 推荐）：`/api` + `/api/remote.mux`（WebSocket）。复用 dsh 宿主侧 /api 鉴权，`session/follow` 开 `assistantStream:true` 推实时 chunk；loopback 监听 + token。
- 答复：（2026-11-01 11:56 用户口头：剩下的取舍不重要，按推荐走，先把 demo 跑出来）
- 落实（主会话 2026-11-01 11:56）：按 B 定稿，契约定稿。通道接线任务解除阻塞；架构约束（renderer 经 IPC、main 唯一 mux 客户端、token 只留 main、D7 断线重连用例）随契约生效。




## Q-005 [answered] P1 验收确认与 P3 开启
- slug：p1-re ｜ 类型：验收 ｜ 阻塞：P3 契约阶段开启 ｜ 提出：2026-11-01 14:32
- 背景：P1 全部 DONE 条款 VERIFY PASS（work/p1-re/VERIFY-p1.md，11/11，12 锚点抽查全中、坏路径无假阳性）；核心产出 ARCH-0.78.md（29 方法最小接口面、22 云 RPC 替身清单、12 推定项、有主 bot 无总控 bot）。P3 要定：契约路线 A（保留 0.78.1 renderer 外形 + 适配层）vs B（重写 renderer 直连 SDK）——director 建议 P3 先跑 /panel D。
- 选项：
  - A（推荐）：验收 P1，开启 P3（先 panel D 投契约路线，再写 CONTRACT.md）
  - B：验收 P1，P3 缓开（P2 的 T-02–T-09 先收口）
- 答复： A
- 落实（主会话 2026-11-02 00:40）：P1 验收通过；P3 开启——第一步 /panel D 投契约路线（材料 ARCH-0.78 §4 P3 输入）；Q-003 用户补充的「主 bot 分工两思路」作为 P3 director 的设计输入。

## Q-006 [answered] work/ 状态文件是否纳入 git
- slug：全局 ｜ 类型：流程规则 ｜ 阻塞：无 ｜ 提出：2026-11-01 14:32
- 背景：work/（BRIEF/PLAN/RE/VERIFY/QUESTIONS 等全部状态与证据）目前 untracked，机器故障或误操作会丢；合并规则本身预设跟踪。p1-re 的九份 RE 报告含全部逆向结论。
- 选项：
  - A（推荐）：`git add work/ && git commit`（已人工确认无凭证内容）
  - B：继续不跟踪
- 答复： A
- 落实（主会话 2026-11-02 00:40）：已提交（见 LOG 的 commit SHA）；后续 work/ 变更随合并节奏提交。

## Q-007 [answered] P3 契约路线确认：重写 renderer（B/B′）
- slug：p3-contract ｜ 类型：契约 ｜ 阻塞：CONTRACT.md 定稿（起草并行进行，标暂定）｜ 提出：2026-11-02 00:50
- 背景：/panel D-route 两席一致投 B（panels/D-route-r1.md）。B′ 变体：以 dsh 自带 74 个 MIT React client 包为骨架 + 从 0.78.1 提取字体/图标/CSS + 只做 4 个 MVP 页；路线 A（保留 0.78.1 renderer + 适配层）因三条硬伤被否（per-bot 配置无协议字段、适配层=两套外来协议翻译的第 5 级自建、启动面无运行态证据）。
- 选项：
  - B′（panel 两席一致，暂按此推进）：重写 renderer 直连 SDK，dsh client 包骨架 + Grok 资产，4 页封顶
  - A：保留 0.78.1 renderer + 适配层（需先实测启动面，成本更高）
- 答复：可行, 直接重写即可. B
- 落实（主会话 2026-11-02 05:00）：B/B′ 定稿——CONTRACT.md 转正，v1.1 改版吸收 scout 与 T-15 结论后过 panel G1。

## Q-008 [answered] 契约变更：p2temp 增第 2 方法 preset.ensure（连接器 bot 重启恢复）
- slug：p3-contract ｜ 类型：契约 ｜ 阻塞：preset.ensure 实现、CONTRACT v1.1 定稿（起草并行标暂定）｜ 提出：2026-11-02 01:30
- 背景：T-15 探明①红（work/p3-contract/VERIFY-T-15.md）：带连接器的 bot 重启后对旧 session 发 prompt 报 `Unknown agent preset: p2temp-*`——临时 preset 只在内存 registry，不落盘。方案：p2temp 增幂等 `preset.ensure({agentPreset, connectors})`，preset id 由内容确定，main 启动按 bots.json 逐个调用；探明已证同内容重注册路径可跑通。注意：客户端错误 code 是 gateway/internal（判错只能看 message）。附带：T-03③ 的「p2temp 恰 1 方法」验收数字随之改为 2。
- 选项：
  - A（推荐，T-15 实测必须）：加 preset.ensure（p2temp 组内第 2 方法，仍不超 BRIEF 4 项缺口清单的「市场/按 session 启用」语义）
  - B：不做重启恢复（带连接器的 bot 重启即失效）——违反 D5 重启存续
- 答复：（2026-11-02 06:30 用户聊天原话：「可以跑A即可, 黑尔问题你不用来询问我, 我只需要使用什么开源的套件, 以及效率快速复现, 全线的问题」→ **A**）
- 落实（主会话 2026-11-02 06:30）：A 定稿——p2temp 增 preset.ensure（T-16）；T-03③ 验收数字改 2。

## Q-009 [answered] danger-full-access preset 下 shell-ask 的行为（增量 L 复审 R2）
- slug：p2-sdk ｜ 类型：高风险（审批语义）｜ 阻塞：T-12.f1 ｜ 提出：2026-11-02 02:30
- 背景：T-12 把 approval.yml（shell-ask：普通 bash 必问）挂进默认启动链。但用户显式选 danger-full-access preset（其 approval 配置为 never）时，user-approval 对一切 ask 一律拒绝 → **bash 完全不可用**（死锁，非放行）。REVIEW R2 判 major。修复涉及「何时可以不问」——权限系统要求用户明示。
- 选项：
  - A（放行显式选择）：shell-ask 读 approval 策略，显式 never（用户主动配置）时放行——默认 preset（workspace-write+ask）仍必问，D8 底线由既有测试守护
  - B（保持死锁 + 文档说明）：never preset 与默认审批插件互斥，选 never 需同时 P2SDK_PATCH 摘除 approval.yml（文档写明）
  - C（never 时改为 warn 日志放行）：同 A 但每次放行打警告日志留痕
- 答复：（2026-11-02 06:30 用户聊天原话：「可以跑A即可, 黑尔问题你不用来询问我」→ **A**）
- 落实（主会话 2026-11-02 06:30）：A 定稿——shell-ask 尊重显式 never（用户主动配置时放行），默认 preset 必问由既有测试守护（T-12.f1）。

## Q-010 [answered] P2 验收确认
- slug：p2-sdk ｜ 类型：验收 ｜ 阻塞：无（P4 已在跑）｜ 提出：2026-11-02 13:10
- 背景：P2 全部完成——PLAN 21/21 done（含 .f 修复链）、出口汇合四项 PASS（$OFFLINE 127→136/136、覆盖率 92.98/86.88/96.49/94.94、方法差集恰 2、D1–D8 证据齐）、三轮 L review 的全部 CONFIRMED 均修复闭环（终审对 P2 范围 0 发现；报告 FAIL 系范围外 P4 代码污染，已归口 work/p4-ui/REVIEW-W1-pre.md）。SDK 交付：一条命令起、真模型流式（LiteLLM）、3 session 并发、重启存续、真实市场连接器（registry N=111）、审批闸门、preset.ensure 恢复。
- 选项：
  - A：验收 P2（demo 后端全部就绪；P4 UI 继续推进中）
  - B：有保留意见（请写明）
- 答复：（2026-11-02 22:37 用户聊天原话：「Q不是question里面很多还是open吗? 我们已经是回复了」→ 按 **A** 解读）
- 落实（主会话 2026-11-02 22:37）：P2 验收通过。若「已回复」并非指本条验收，请纠正。

## Q-011 [answered] P4（Grok Bot UI）阶段验收
- slug：p4-ui ｜ 类型：验收 ｜ 阻塞：下一阶段开题 ｜ 提出：2026-11-02 22:12
- 背景：P4 全部任务 done（U-00~U-31）+ 修复链闭环（L-5 整分支终审 9 发现 → U-28/U-29 → L-6 复审 **PASS，0 critical/major**）。VERIFY-U-31：D1–D12 全 PASS（真模型流式、D10b gate-4 屏障、D12 零外网+8 截图）；main 217 单测 + 54 e2e 全绿。UI 按「尽量和原来一致」经 62 项源码级视觉审计 + U-27 润色。剩余：L-6 的 4 条 CONFIRMED minor（全在测试支撑代码）已转 U-32 在途，不阻塞验收。
- 选项：
  - A（推荐）：验收 P4——MVP 四阶段 P1✅ P2✅ P3✅ P4✅ 全部完成（P2 验收见 Q-010）
  - B：有保留意见（请写明，如需额外视觉对照/旅程演示）
- 答复：（2026-11-02 22:37 用户聊天原话同 Q-010 → 按 **A** 解读）
- 落实（主会话 2026-11-02 22:37）：P4 验收通过——**MVP 四阶段 P1✅ P2✅ P3✅ P4✅ 全部完成**。U-32（测试侧 4 minor）合并后 MVP 彻底收口，届时提「下一阶段」问题。若并非指验收，请纠正。

## Q-012 [answered] MVP 收口后下一阶段做什么
- slug：全局 ｜ 类型：方向 ｜ 阻塞：新 slug 开题 ｜ 提出：2026-11-02 23:45
- 背景：MVP 四阶段全部验收（P1✅P2✅P3✅P4✅，Q-010/Q-011），U-32/U-33 收尾 minor 已合并。roadmap 里 MVP 后只有两类：P5（远程与云端：远程连接、SSH、云电脑/box、实时画面、computer-use——「用户说开始再开始」）与 P6（其他功能：跨会话消息 SendToAgent、群聊、自动化定时、记忆、审批分级、浏览器、语音、bot 邮箱——顺序由用户定）。另有无路线图选项：打包分发（deb/AppImage，对外分发前需整体许可证重审）、superagent 模式（Q-001 遗留：主 bot=SuperAgent、日常 bot=DSH 的分工猜想）。
- 选项：
  - A：P5 远程与云端（computer-use/SSH/云电脑方向）
  - B：P6 里挑功能（请点名：跨会话消息/群聊/自动化/记忆/浏览器/语音/…）
  - C：superagent 分工模式（Q-001/Q-003 遗留的「主 bot=SuperAgent」设计）
  - D：先打包分发 + 日常使用打磨（不含对外发布）
- 答复：（2026-11-03 00:0x 用户聊天原话：「现在我们打算把UI先打磨到Grok Bot一致的level. 然后主bot部分…我记得Personal Agent是不会比如说权限也好, 这些其实是不会给Grok Bot去做的…一般是bot自己去完成, 只有一些问题会询问. 这种调整, 可能是我们要去做的」→ 新方向 = ①UI 对齐原版 level + ②审批模型改原版自主分级（ceiling NEVER/ASK/ALWAYS + ALWAYS 卡 + always-allow 管理），替代 A-D 选项）
- 落实（主会话 2026-11-03）：派 director 写新阶段 BRIEF（①视觉对齐深化 ②审批自主化）；审批默认档位表属高风险（执行审批语义），方案出来后开 QUESTIONS 请用户确认再动工。

## Q-013 [open] 审批默认档位表（L-AP 高风险，逐行确认；v2.1 终版）
- slug：p5-parity ｜ 类型：高风险（审批语义）｜ 阻塞：L-AP 中除 W1-AP-0（全入口纯收紧：wrapper、凭证拒读写、移除 plugin_manager、拒裸升权、子代理同表——**不等本答复**）与 W1-AP-q（ledger 修复）以外的实现 ｜ 提出：2026-11-03 00:30，v2 01:40，v2.1 02:30
- 背景（v2.1）：方向你已给（bot 自己完成，只有一些问题询问）。**真实后果 7 条**：①「无网络」只针对 bash——bot 读到的东西可能经 web 工具外发；②工具链（conda/pnpm 等）只读挂回：能跑 `python x.py`，不能 `pip install`；③今天批准升权 = 该命令完全没有沙箱，W1-AP-0 起先直接拒绝，受控升权路径（D-1）落地前 bot 不能联网也不能写工作目录外；④子代理里的 bash 今天不问，W1-AP-0 起改为拒绝（等你答复后按档位放行）；⑤连接器（MCP）进程不在沙箱里；⑥原版默认全部 ask（我们比原版更自主）；⑦沙箱加固前 `ls ~/.ssh` 可见——W1-AP-0 修；⑧新 NEVER 规则比清单更严：**HOME 下所有点目录（.ssh/.config/.claude/.codex 等）默认拒读**（白名单例外放行）、**/proc 整个拒**（防从 environ 读 key）——W1-AP-0 落地不等答复；⑨cwd 在 app/sdk 或仓根的旧 bot：策略代码只读保护后**迁移（P5-26）前连自己工作区都写不了**，需要先迁移。
- 档位表 v2.1（# / 类别 / 默认）：
  1. bash 沙箱内（工作目录内读写无升权；例 `python x.py`）→ **ALWAYS**（A0 通过前 ASK；现状：根会话每条都问、子代理不问）
  2. bash 升权（联网 curl/pip、写工作目录外、danger-full-access）→ **ASK 只走受控升权路径（凭证始终遮住）；D-1 落地前直接拒绝**，不可始终允许
  3. 文件工具工作目录内 → ALWAYS
  4. 文件读工作目录外 → **ASK，不可始终允许**（realpath 判定；子代理里为拒绝）
  5. 凭证路径（~/.ssh、credentials*、~/.grokbot、launch token/handoff、授权文件、DSH_HOME 等）→ **NEVER 读写都拒，代码常量，W1-AP-0 就落地不等答复**
  6. 连接器读（readOnlyHint=true）→ ALWAYS（**需 D-2 元数据桥；桥接前一律按第 7 行处理**）
  7. 连接器写/未标注 → **ASK 可「始终允许」**（唯一可始终允许类别，bot×工具；桥接前所有连接器按本行）
  8. 连接器 destructiveHint=true → ASK+警示，是否可始终允许：**推荐否**（否=桥接前任何连接器都拿不到 always）
  9. 权限 preset 切换 / permission 命令 / **plugin_manager 全部 action** → **NEVER（纯收紧，W1-AP-0 落地）**
  10. **web_fetch / web_search → 草案 ALWAYS（=现状不放宽）；备选 ASK——请你定（重点行）**
  11. 其他进程内工具（R4 全表 32 个）→ ALWAYS（=现状，信息列出，无异议不用答）
- 另定四件：
  - (b) 「始终允许」作用域：仅连接器写工具，**每 bot × 工具**（备选所有 bot 共享=原版做法，R1）；推荐按 bot
  - (c) bot 设置按连接器调读/写档位：**不做**（原版有三值档位 UI，我们 UI 只读+撤销）
  - (d) 全局「暂停自主」开关（只能收窄）：**推荐做**
  - (e) 现有 bot（含主 bot）：**推荐设置里手动迁移**（旧会话不动、文件不搬）
- 选项：
  - A（推荐）：整表按 v2.1 确认（含第 10 行 web=ALWAYS、b=仅连接器×每bot、c=不做、d=做、e=迁移）
  - B：部分行改（请指明行号和新档位；重点行 1、2、8、10）
- 答复：

## Q-014 [open] UI 基准：能否由你登录 0.78.1 截约 10 张参照图
- slug：p5-parity ｜ 类型：方向 ｜ 阻塞：仅 U5 并排对照的基准选择（U1-U4 不阻塞）｜ 提出：2026-11-03 00:30
- 背景：L-UI 的「与原版一致」目前缺登录后运行态截图（现有只有未登录页）。最准的基准 = 你本人登录后按清单截图（侧栏、会话流含工具行+审批卡、市场、设置 pane、权限页；亮暗各一套），个人信息自行打码后放 work/p5-parity/ref/。截图不经模型，凭证不进模型。不方便就降级：R3 桩数据渲染 → 0.18 重建仓渲染；**降级口径（G1-r1 B-M3）：旧版参照覆盖不到的 0.78.1 特有项标「未验证」，不因 GU PASS 自动消除**。
- 选项：
  - A（推荐，最准）：你来截（放 work/p5-parity/ref/ 后告诉一声）
  - B：不截，按 R3 → 0.18 降级基准
- 答复：

## Q-015 [open] 契约变更 C2：审批自主化的接口与不变式修订（v2 六件）
- slug：p5-parity ｜ 类型：契约 ｜ 阻塞：W1-AP/W2-AP 实现（调研与 W1-AP-0/q 不受影响）｜ 提出：2026-11-03 00:30，v2 修订 01:40
- 背景：BRIEF v2 §10.9，与 Q-013 配套，Q-013 答复前不合入。
- 内容六件（v2.1 增补两条语义）：① M1 新增 `pbots/approvals.alwaysAllow {eventId}`（main 反查工具+bot、**写盘成功后才代答 allowed-once**；仅连接器写工具的 eventId 有效）/ `approvals.list {sessionId}` / `approvals.revoke {sessionId, serverName+rawName}`（**稳定身份键，不用归一化 toolName**；v2 补充：配置层禁止 serverName 含 `__`，防 publicName 键碰撞串 server——D2-r1 A-HIGH）；② session/create 的 cwd 改由 main 强制为 `workspaces/<botId>`，renderer 传入即拒；③ P4B D3「无始终允许入口」修订为「仅连接器写工具可始终允许」，D9 其余不变，「renderer 只发 allowed-once/rejected」不变式保持；④ SDK shell-ask 由必问泛化为按档位查表；⑤ 新增 `pbots/bots.migrateWorkspace`（用户触发的旧 bot 迁移，Q-013 (e) 的落地）；⑥ M1/M2 增加对 dsh `user-questions/request` 提问事件的作答分支（A14/R7 落地）。
- 选项：
  - A（推荐）：六件全准（含 v2.1 增补两条语义）
  - B：有修改（请指明）
- 答复：

## Q-016 [open] D-2 分歧：连接器分档走 ②元数据桥 还是 ③统一ASK（含落行二选一）
- slug：p5-parity ｜ 类型：取舍（D 投票分歧）｜ 阻塞：P5-23（暂按 ③ 实现口径准备，等本答复定稿）｜ 提出：2026-11-03 04:3x
- 背景：两席投票分歧（panels/D2-r1.md）：Opus 席投 ③「不做 hint 分档、所有连接器统一按 ASK 处理」——理由：② 按 server 自报 hint 放行，server 报假值就静默放行且测不出（MCP 规范原文也警示不可信 annotations；destructiveHint 规范默认 true，「未标注归读」违反规范）；③ 最坏只是多点几次卡。Sol 席投 ②「自建桥读 hints 分档」——理由：若你把第 8 行（破坏性不可始终允许）答「否」，③ 下就没有任何连接器能「始终允许」，授权功能（P5-24）对所有连接器失效。
- 连带二选一（必答）：③ 下所有连接器统一落到——**第 7 行语义（ASK + 可「始终允许」，推荐，P5-24 保留）** 还是 第 8 行语义（ASK + 不可始终允许，P5-24 与身份桥一起砍）
- 选项：
  - A（推荐，暂定执行中）：③ + 落第 7 行（改动最小；以后想分档再补桥）
  - B：② 自建元数据桥分档（读类 ALWAYS 自动放行，代价：信任 server 自报）
  - C：③ + 落第 8 行（连接器全部不可始终允许，P5-24 缩水为纯 bash 外无授权对象）
- 答复：
