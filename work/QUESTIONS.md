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

## Q-013 [answered] 审批默认档位表（L-AP 高风险，逐行确认；v2.1 终版）
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
- 答复：（2026-11-03 用户聊天原话：「我觉得沙箱内bash是可行的, 但是只能执行沙箱比如对应项目内的一些指令. Web是可以做的。」→ **A**：第 1 行沙箱内 bash ALWAYS 确认（边界=对应工作目录内指令）；第 10 行 web = **允许/维持 ALWAYS**；其余行无异议按 v2.1）
- 落实（主会话 2026-11-03）：Q-013 全表定稿，L-AP 主体解锁。

## Q-014 [answered] UI 基准：能否由你登录 0.78.1 截约 10 张参照图
- slug：p5-parity ｜ 类型：方向 ｜ 阻塞：仅 U5 并排对照的基准选择（U1-U4 不阻塞）｜ 提出：2026-11-03 00:30
- 背景：L-UI 的「与原版一致」目前缺登录后运行态截图（现有只有未登录页）。最准的基准 = 你本人登录后按清单截图（侧栏、会话流含工具行+审批卡、市场、设置 pane、权限页；亮暗各一套），个人信息自行打码后放 work/p5-parity/ref/。截图不经模型，凭证不进模型。不方便就降级：R3 桩数据渲染 → 0.18 重建仓渲染；**降级口径（G1-r1 B-M3）：旧版参照覆盖不到的 0.78.1 特有项标「未验证」，不因 GU PASS 自动消除**。
- 选项：
  - A（推荐，最准）：你来截（放 work/p5-parity/ref/ 后告诉一声）
  - B：不截，按 R3 → 0.18 降级基准
- 答复：（2026-11-03 用户聊天原话：「UI部分, 你看看能否用REA去做? 还要我截图? REA做不到吗? ……这个逆向出来的不是很准, 或者说UI风格不太一样, 颜色也好, 里面的很多bot的动画都不太行. 重新做,我截图也没有办法全部截出来. 你不如直接把这个grok bot 0.18的这个, 先做出来, 然后1比1对照去对比? 我记得前端好像是opus 5.5去开发的」→ **B + 路线变更**：不用用户截图；基准与实现改为「0.18 重构仓前端 1:1 移植，跑起来后与 0.78.1（R3 桩渲染/解包产物）并排对照」）
- 落实（主会话 2026-11-03）：派 director 修订 L-UI 路线（0.18 仓可移植性评估、既有视觉任务重组、颜色/动效观感差距的根因）。

## Q-015 [answered] 契约变更 C2：审批自主化的接口与不变式修订（v2 六件）
- slug：p5-parity ｜ 类型：契约 ｜ 阻塞：W1-AP/W2-AP 实现（调研与 W1-AP-0/q 不受影响）｜ 提出：2026-11-03 00:30，v2 修订 01:40
- 背景：BRIEF v2 §10.9，与 Q-013 配套，Q-013 答复前不合入。
- 内容六件（v2.1 增补两条语义）：① M1 新增 `pbots/approvals.alwaysAllow {eventId}`（main 反查工具+bot、**写盘成功后才代答 allowed-once**；仅连接器写工具的 eventId 有效）/ `approvals.list {sessionId}` / `approvals.revoke {sessionId, serverName+rawName}`（**稳定身份键，不用归一化 toolName**；v2 补充：配置层禁止 serverName 含 `__`，防 publicName 键碰撞串 server——D2-r1 A-HIGH）；② session/create 的 cwd 改由 main 强制为 `workspaces/<botId>`，renderer 传入即拒；③ P4B D3「无始终允许入口」修订为「仅连接器写工具可始终允许」，D9 其余不变，「renderer 只发 allowed-once/rejected」不变式保持；④ SDK shell-ask 由必问泛化为按档位查表；⑤ 新增 `pbots/bots.migrateWorkspace`（用户触发的旧 bot 迁移，Q-013 (e) 的落地）；⑥ M1/M2 增加对 dsh `user-questions/request` 提问事件的作答分支（A14/R7 落地）。
- 选项：
  - A（推荐）：六件全准（含 v2.1 增补两条语义）
  - B：有修改（请指明）
- 答复：（2026-11-03 用户聊天原话：「然后015, 独立工作目录可行」→ **A**：六件全准，独立工作目录明确认可）
- 落实（主会话 2026-11-03）：契约 C2 定稿，P5-25/26/24/28 解锁。

## Q-016 [answered] D-2 分歧：连接器分档走 ②元数据桥 还是 ③统一ASK（含落行二选一）
- slug：p5-parity ｜ 类型：取舍（D 投票分歧）｜ 阻塞：P5-23（暂按 ③ 实现口径准备，等本答复定稿）｜ 提出：2026-11-03 04:3x
- 背景：两席投票分歧（panels/D2-r1.md）：Opus 席投 ③「不做 hint 分档、所有连接器统一按 ASK 处理」——理由：② 按 server 自报 hint 放行，server 报假值就静默放行且测不出（MCP 规范原文也警示不可信 annotations；destructiveHint 规范默认 true，「未标注归读」违反规范）；③ 最坏只是多点几次卡。Sol 席投 ②「自建桥读 hints 分档」——理由：若你把第 8 行（破坏性不可始终允许）答「否」，③ 下就没有任何连接器能「始终允许」，授权功能（P5-24）对所有连接器失效。
- 连带二选一（必答）：③ 下所有连接器统一落到——**第 7 行语义（ASK + 可「始终允许」，推荐，P5-24 保留）** 还是 第 8 行语义（ASK + 不可始终允许，P5-24 与身份桥一起砍）
- 选项：
  - A（推荐，暂定执行中）：③ + 落第 7 行（改动最小；以后想分档再补桥）
  - B：② 自建元数据桥分档（读类 ALWAYS 自动放行，代价：信任 server 自报）
  - C：③ + 落第 8 行（连接器全部不可始终允许，P5-24 缩水为纯 bash 外无授权对象）
- 答复：（2026-11-03 用户聊天原话：「连接器我觉得可以做」→ **A**：③+落第 7 行定稿，连接器写工具 ASK+可始终允许（bot×工具），身份表照建）
- 落实（主会话 2026-11-03）：D-2 定稿，P5-23（仅身份表子集）/P5-24 排程。

## Q-017 [answered] 新方向：superagent 编排 + personal agent 三段式交互（用户 2026-11-03 指令）
- slug：新 slug（待 director 立 BRIEF）｜ 类型：方向 ｜ 阻塞：无（p5-parity 收尾不受影响）｜ 提出：2026-11-03
- 用户原话：「之前我们提到了dsh的superagent, 其实这些是也要被放到主grok bot中的. 可以采用这种思路去做其他的编排, 例如跨session之类的内容. 每一个都是一个personal agent. personal agent的行为, 就不应该每一条信息都回复, 而是只要一开始的收到, 以及打算怎么做, 以及最后的结果. 目前从个人使用体验上, 肯定superagent会好很多. dsh可能是一个核心吧. 这些我觉得也要去开发一下.」
- 落实（主会话 2026-11-03）：①主 bot 吸收 superagent 能力（建子 bot/编排）；②跨 session 编排（SendToAgent 族）；③每个 bot = personal agent，**交互模型改三段式**（收到确认 → 打算怎么做 → 最终结果，不逐条回复）；④dsh 为核心。派 director 写新 slug BRIEF（输入：Q-001/Q-003 分工猜想、work/p2-sdk/reuse/superagent-compat.md、RE-features 的 Main Agent/SendToAgent/记忆清单）。

## Q-018 [answered] p6「superagent 好很多」具体指什么体验
- slug：p6-orchestration ｜ 类型：方向（决定路线 R1/R2）｜ 阻塞：D-1 路线投票 ｜ 提出：2026-11-03
- 背景：BRIEF v1 §9①。你说「从个人使用体验上肯定 superagent 会好很多」——三段式（收到→打算怎么做→结果）已定；剩下这个判断决定编排路线：R2 自建编排层（安静、后台并行、事件驱动通知）vs R1 直接集成 superagent 包（主动性：盯 GitHub/飞书等事件源、主动开工单）。BRIEF 推荐 R2（superagent 包面向团队工单+worker 免审批撞安全反例+上游 1 commit 无维护）。
- 选项：A（推荐）：R2 自建编排（安静+并行）｜ B：R1 superagent 包（主动性/事件源）
- 答复：（2026-11-03 用户原话：「就是superagent的整个架构思路, 是可以当作main grok bot的. 整个harness的流程, 例如可以让人无缝去做. 你可以理解为多bot的路由机制」→ **A（R2 自建）+ superagent 架构思路为设计蓝本**：多 bot 路由机制、harness 流程、人可无缝介入）
- 落实（主会话）：设计探索派 Opus 5.5 + K3.1 Pro（用户点名）；scout 调研 Claude Coworker 产品思路（用户点名参照）。

## Q-019 [answered] worker bot 默认在侧栏可见吗
- slug：p6-orchestration ｜ 类型：产品 ｜ 阻塞：UI 任务 ｜ 提出：2026-11-03
- 背景：BRIEF §9②。主 bot 建的 worker bot 是否默认显示在侧栏（可见=可点进去看过程；不可见=纯后台，需要单独入口管理）。0.18 原版行为待 RE 核实。
- 选项：A（推荐）：可见（与现有 bot 列表一致，透明）｜ B：默认隐藏（安静，设置里开）
- 答复：（同上消息：「主bot的创建的worker bot默认不可见, 但是可以和claude coworker一样去展示侧栏去工作」→ **默认隐藏 + 可像 Claude Coworker 那样展示到侧栏去工作**（B+展示机制））
- 落实（主会话）：注意 RE-1 实证：原版 hidden_from_sidebar 是通用 client state，天然支持。

## Q-020 [answered] 第一批只有主 bot 能编排？
- slug：p6-orchestration ｜ 类型：范围 ｜ 阻塞：PLAN ｜ 提出：2026-11-03
- 背景：BRIEF §9③。第一批：仅主 bot 有 CreateAgent/SendToAgent 等编排工具；普通 bot 之间互发消息是第二批。少一层递归复杂度。
- 选项：A（推荐）：是，第一批仅主 bot 编排｜ B：所有 bot 平等编排
- 答复：（同上消息：「然后第一批就主bot编排+跨session去处理. 剩下的不是问题」→ **A + 第一批含跨 session 处理**；具体设计交 Opus 5.5+K3.1 Pro）

## Q-021 [answered] 主 bot 建 worker 的 SDK→main 通道，按这个方案定稿吗？（签字题，2026-11-04 改写）
- slug：p6-orchestration ｜ 类型：契约 ｜ 阻塞：只阻塞 P6-14b（开放闸）｜ 提出：2026-11-03，改写：2026-11-04
- 方案：主 bot 要建 worker 时，SDK 通过一条只供 main 使用的通道，请 main 来建 bot。往返 S-2 已实测跑通（reuse/s2-dsh-cross-session.md，11 断言过）。安全约束：只认 main、绑定当前连接、30 秒无响应按「结果未知」处理、不自动重试。原选项 B「等 S-2(h)」已实证，不再保留。
- 附带告知（不阻塞，默认执行）：worker 做完后主 bot 只转述结果，不在该轮调用任何工具（防回报夹带内容借主 bot 工具执行）；要续派说「继续」。
- 答复：（2026-11-05 用户原话「这块应该和grok bot的设计保持一致. 例如我发布一个任务, 他就直接去执行了, 缺少信息, 不确定的时候再询问我」→ **同意定稿**；「自动续派」部分移交 p7 D-1 另议）→ P6-14b 的 Q-021 前置解除

## Q-022 [answered] 契约 v1.5 两项编辑决定（C-1 起草时拍板的，请确认）
- slug：p6-orchestration ｜ 类型：契约 ｜ 阻塞：无 ｜ 提出：2026-11-04
- 两项：①删掉落盘类型里 BotsMeta.bots[*].runtime?: 'superagent' 占位（与决策 31 的 {createdBy} 不相容，§5 本就写 runtime 不写盘）；②决策 10 ④（工具按权威 mainBotId 判定）不进契约，由 P6-10 验收承载。
- 答复：（2026-11-05 用户：「接受吧」）→ 按默认执行

## Q-023 [answered] bot 可不弹卡改写 /tmp 下你的文件——按「直接拒绝」修了，请确认
- slug：p6-orchestration ｜ 类型：高风险（审批语义）｜ 阻塞：无（已按纯收紧先做）｜ 提出：2026-11-04
- 题干：bot 用「写文件」工具可以不弹审批卡，改写电脑 /tmp 目录里属于你的任何文件（实测：worker 在 /tmp/bot-wt/P6-22 留下文件）。根因：dsh fence 默认允许写宿主 /tmp，而 bash 在 bwrap 私有 /tmp——P5 合并以来生产即存在。凭证读不到，但这是无卡持久化 + 沙箱逃逸路径。
- 选项：A 直接拒绝不弹卡（推荐，已按此修：P6-25 一律拒；P6-25.f1 执行时复判；P6-26 读侧 fd 绑定；P6-26t run_code 走 bash 档）；B 每次弹卡；C 维持现状。
- 默认：A，已实施。若你在 /tmp 放了会被自动执行的东西，P5 合并以来的窗口期可留意陌生改动。
- 补充（2026-11-05 review B 发现，P6-25.f1 已修）：判定与执行之间存在换链时序窗口，读写均可越界（含凭证目录），已按执行时复判修复，同属纯收紧先做后告知。
- 补充 2（2026-11-05，P6-26t/26/26t.f1 已合并）：ptc 的 run_code 无卡换链入口已收进 bash 档位；残余更窄窗口（fresh resolve→syscall）由 P6-26 读侧 fd 绑定 + P6-27（写侧进 bwrap，卡 P5-29）跟进。
- 答复：（2026-11-06 用户：「其他的都按照要求去处理」→ **A 定稿**：直接拒绝，已实施的全部收窄维持）

## Q-024 [answered] 主 bot 派出去的 worker，改到主 bot 的目录里工作吗？（重签 Q-015 的 C2-②）
- slug：p6-orchestration ｜ 类型：契约（修订已签约定）｜ 阻塞：P6-24、P6-14b ｜ 提出：2026-11-05
- 背景：worker 原在独立目录干活，文件出现在别处、主 bot 无法核实（r1 实测）。/panel D-3 两席一致选 ①（worker 继承发起者 cwd）。普通 bot 仍互相隔离，仅 worker↔发起主 bot 开例外。代价与防护五条见 panels/D3-r1.md（影响面扩大/同文件并发/拒写 AGENTS.md、CLAUDE.md/旧主 bot fail closed/删除不动文件）。
- 答复：（2026-11-05 用户：「这个无所谓, 可以新开一个. 按照任务决定」→ **A + 任务自适应**：执行器建 worker 时按任务需要决定直接在主 bot 目录改或新开子目录，两者均属 A 例外；D-3 五条防护照旧）→ P6-24 解锁开工、P6-14b 的 Q-024 前置解除

## Q-025 [answered] p7 立项确认：主 bot 闭环 + 管家四项（G1 评审后）
- slug：p7-admin ｜ 类型：方向 ｜ 阻塞：BRIEF/PLAN ｜ 提出：2026-11-05
- 方案：基于 dsh+SuperAgent 拼接（goal/round-driver/schedule 已装实测）。7a-L 闭环与 7a-M 管家四项并行（全自主不弹卡、护栏=可回退+溯源三元组）→ 7b 长期职责 → 7c PR 自动合并（另行确认 U-1）。
- 答复：（2026-11-05 用户：「是」）→ 按 BRIEF v2.3（G2 有条件通过）推进

## Q-026 [answered] p8「开放电脑」：bot 操控哪块屏？（高风险，护栏过 panel 前不开工）
- slug：p8-parity-full ｜ 类型：高风险（方向子题）｜ 阻塞：p8 computer use 开工 ｜ 提出：2026-11-05
- 背景：0.78.1 有完整本机 computer use（daemon 14 个 computer_* 工具，RE-computer-use.md 已逆）。浏览器 cookie 复制违反「凭证不进模型」，默认不做。
- 选项：A（推荐）隔离 Xvfb 虚拟屏起步（安全、可当远程测试目标机）；B 隔离屏基础上按应用白名单逐步放行真桌面（每应用签字）；C 直接开放真桌面（不推荐）。
- 默认：A 起步、B 渐进；护栏先过 panel + 用户签字才开工。
- 答复：（2026-11-05 主会话按「原版即规格」自决：**A 起步**——RE 证据支持：云 box 驱动即 native_x11/xdotool、原版有 desktop_lease 挂起语义；B 的按应用白名单留作后续按 RE standing grants 分层渐进，届时属法外授权再问用户）

## Q-027 [answered] P7-F3 修复收窄：是否批准「逐 report-key 先存尝试、未知不重放」的最小存储契约
- slug：p7-admin ｜ 类型：契约（存储语义）｜ 阻塞：P7-F3.f3 ｜ 提出：2026-11-05 11:30
- 背景：F3 修复两轮耗尽后 Sol 代 director REDUCE 重规划（`work/p7-admin/evidence/P7-F3/REPLAN.txt`）：V2 与混批两反例源码依据成立；「只修 timer」与「超白名单自行加存储」两个停止依据都成立，但「必须第二账本」**不成立**——既有 session 日志/writer 底座可承载（dsh jsonl persistence 单 writer + flush 汇总不吞失败）。
- 选项：
  - A（推荐）：批准最小契约——Report 每次投递前，先由现有 session writer 持久「尝试事实」（只存目标 mainId、精确 report key 集、版本/尝试关联；不存正文/凭证/Assignment 状态/重试队列）；记录持久成功才 followup，写失败则本次副作用 0；unknown 旧键不得自动重放或唤醒；恢复先过滤 old 再算 fresh batch id。白名单六文件（report.mjs/delivery.mjs/pending.mjs + 三测试文件），pending 与两测试超原 F3 13 文件范围须显式增补；若需新记录类型只批一个本地类型文件。**代价：at-most-once**（尝试已持久、followup 前崩溃 → 保守漏发一次，不是恰一次）；历史无尝试记录的 unknown 不能凭空补造，需可信切换边界（旧范围继续待核实）。验收（含跨重启故障注入）REPLAN §6 已列。
  - B：复用 F1 逐键 begin/dedupe 经受限 SDK→main 桥——不新账本，但要新增可信 RPC/键绑定/断链语义；F2 自身 blocked，范围更大。
  - C：不批准，F3 维持 blocked（新代恢复窗口的未知重投缺陷继续存在，依赖 F3 的 F4/L2/M1/M3/U1 排队不动）。
- 答复：（2026-11-06 用户：「其他的都按照要求去处理」→ **A 定稿**：最小存储契约批准，at-most-once 代价接受；P7-F3.f3 解锁）


## Q-028 [answered] skill「审阅链」要不要进这一期（bot 存 skill / 改 skill 要不要你点批准）
- slug：p9-dsh-integration ｜ 类型：需求范围 ｜ 阻塞：不阻塞（T7a/T7b 按 A 施工，答 B/C 再追加单）｜ 提出：2026-11-06 05:20
- 背景：原版有一条审阅链——bot 用 `ProposeSkills` 提议新增 / 修改 / 删除 skill，生成「待审项」（PENDING→你点 APPROVE/REJECT），聊天里还有「Pick from your skills」挑选卡（RE-skills Q3）。现在我们的做法（T6 已落地）：bot 在对话里直接把 skill 写进**它自己的** skill 目录，不出卡；别的 bot 要用，必须你在 B 的设置里「Pick from your skills」手动启用（T7a/T7b）——跨 bot 扩散这一步本来就要你点。你的验收原话（BRIEF 验收第 2 条）只要求「存下来、另一个 bot 能启用复用」，没提审批。
- 选项：
  - A（推荐）：这一期不做审阅链。理由：跨 bot 启用已经要你手动点；bot 写自己目录里的 skill 与它写自己工作区里任何别的文件（比如说明文档）是同一类风险，单独为 skill 加卡收益小。以后要再加。
  - B（轻量版）：bot 往自己的 skill 目录写入 / 改写时弹一张确认卡（复用现有审批卡，Allow once / Deny），不做待审列表。约 1 张单。
  - C（完整版，对齐原版）：`ProposeSkills` 工具 + 待审项列表（PENDING→APPROVE/REJECT，带 bot、动作、名字、描述、正文）+ 聊天内挑选卡；批准后写进 bot 副本（复用 T7a 的 enable 路径）。约 3 张单，排在 T7 之后。
- 答复：（2026-11-06 用户：「要审阅」→ **B 定稿**：bot 写/改自己 skill 目录时弹确认卡（复用现有审批卡），约 1 张单，排 T7b 后。落实：manager 开 T7c；T6 已落地的「直接写」行为在本单里改为出卡）

## Q-029 [answered] 开启「远程电脑」（ssh）后，已有的本机 bot 怎么办
- slug：p9-dsh-integration ｜ 类型：需求范围 ｜ 阻塞：T11（T9/T10 只用新建 bot 测，不阻塞）｜ 提出：2026-11-06 05:50
- 背景：T5 设计（`p9-dsh-integration/DESIGN-ssh-composition.md` D6）定为「一个运行时一台电脑」：开了远程电脑，所有 bot 都在那台电脑上干活（和你说的「bot 共用一台电脑」一致；只让部分 bot 用远程，上游插件做不到，要拆成两套运行时，是很大的一块）。问题在已有的 bot：它们的工作目录在本机，而且建好后改不了。
- 选项：
  - A（推荐）：切换就是整个产品换电脑。已有 bot 的对话照常能看，但它们再想跑命令 / 改文件会被挡住，并提示「这个 bot 的工作目录在另一台电脑上，请新建 bot」；新建的 bot 都在远程电脑上。切回本机则反过来。代价：切换后要重新建 bot（技能可以用「Pick from your skills」带过去）。
  - B：同时跑本机和远程两套，每个 bot 建的时候选在哪台电脑。体验最好，但主 bot 跨电脑派活要另做，估计 3 张单以上，排在 L2 小队验收之后。
  - C：切换时把已有 bot 的工作目录整体拷到远程电脑上继续用。拷贝过程中断会留下一半的目录，大目录很慢；不推荐。
- 答复（用户 2026-11-11）：
  - 目录从哪来：**「一键参考DSH」**——抄 DSH 的（市场/目录机制）。
  - 要登录的连接器：**不做真登录（推荐档 A）**。
  - 自定义连接器表单：**只开 HTTPS 无 token（推荐档 A）**。
  - 用户看到的 bug 具体形态未单独指认（T48 探针四格已把现状钉死，最可能=②死路空页）。

## T13 远程测试节奏 [用户定调 2026-11-06 22:1x]
本机基础 grok bot 能力全部开发完善 + 使用 1~2 天体验无问题后，再开始真实远程测试（届时提供主机）。

## Q-030 [已答 2026-11-06 22:1x] 先合并功能版，视觉破版后续修
用户原话：「先合并, 然后再修复」——feat/T7b 功能链（e2e 2 passed、M1 红、check diff=0）整枝合并；三轮截图破版（暗色按钮/对话框 CSS/未勾选态）开轻量返修单后排期。
（原题：Skills 选择对话框（T7b）返修三轮仍不过：先合并能用的功能，还是再修一轮）
- slug：p9-dsh-integration ｜ 类型：越过约束授权（失败 3 次）｜ 阻塞：T7b 链合并；T7c 合并顺序排在 feat/T7b 后面 ｜ 提出：2026-11-06 11:40
- 背景：功能已经验过（在别的 bot 设置里「Pick from your skills」→ 勾选 → Add → 磁盘上能看到副本，e2e 2 passed，上游 diff=0；经理在 f0a14235 重跑过一致）。卡住的只是外观：暗色主题下对话框的 Add 按钮是白底，字看不见。返修三轮，回执两次虚报，最新一次提交 b2facacf 甚至编译不过。
- 选项：
  - A（推荐）：功能链合并到 `fda457c2`（T7bb 的代码，构建和 e2e 都过；f0a14235 只多一份会冲突的回执，跳过它）。b2facacf 不合并。暗色 Add 的问题另开一张小单：先查清字到底画在哪个元素上，再改。已知缺陷：暗色 Add 看不见字、× 是原生按钮、Remove 失败不提示。
  - B：在 feat/T7b 上再修一轮（修构建、补 import、Add 用真正承载字色的元素断言），过了再整枝合并。T7c 合并跟着往后推。
- 答复（用户 2026-11-11）：
  - 目录从哪来：**「一键参考DSH」**——抄 DSH 的（市场/目录机制）。
  - 要登录的连接器：**不做真登录（推荐档 A）**。
  - 自定义连接器表单：**只开 HTTPS 无 token（推荐档 A）**。
  - 用户看到的 bug 具体形态未单独指认（T48 探针四格已把现状钉死，最可能=②死路空页）。

## Q-031 [open] Windows 客户端：SDK 跑在 Windows 上还是 ubuntu 上
- slug：product-launcher / p9-dsh-integration ｜ 类型：需求范围 ｜ 阻塞：不阻塞 T17（本机启动器）；阻塞 T19（Windows 设计单），影响 T12/T13 是否继续 ｜ 提出：2026-11-06 23:5x
- 背景：你定了第二阶段做 Windows exe，连 ssh 可达的 ubuntu 电脑。「bot 在哪台电脑干活」和「SDK（bot 的大脑）跑在哪」是两件事，选法决定后面几周的活。详见 `work/product-launcher/DESIGN-launcher.md` §4.1。
- 选项：
  - A：exe 里装 SDK，bot 在 Windows 上思考、通过 ssh 在 ubuntu 上跑命令改文件。正好用上已做的 ssh 链（T9–T12）。代价：dsh 要移植到 Windows（原生依赖、沙箱 bwrap 在 Windows 没有）；LLM key 放 Windows；Windows 关机 bot 就停。
  - B（推荐）：exe 只是界面；SDK 在 ubuntu 上按现在的本机模式跑，Windows 经 ssh 隧道（tailscale 负责连得上）连过去。key 只在服务器、Windows 关了 bot 照跑、沙箱用现成的。代价：现在界面进程在本机做的几件文件活（bot 名册、建工作区、复制 skill）要挪到 SDK 那边，约 3–5 张单；ssh 链对 Windows 客户端不再需要（只剩「再操控另一台机器」的用途）。
- 推荐理由：B 不用移植 dsh 到 Windows，安全面（key、沙箱）不变；正在做的 T11 两种都用得上，不浪费。
- 答复：**B**（用户 2026-11-06 23:5x：「选择B推荐的路子去走即可」）——exe 只是界面；SDK 在 ubuntu 按本机模式跑，Windows 经 ssh 隧道（tailscale）连过去。T19 按此设计；T12/T13 的 ssh 链定位改为「再操控另一台机器」用途。

## Q-032 [open] 新建 Bot 对话框改成 0.79.3 样式后，我们自己的「配置 / 连接器 / 模型」三项放哪
- slug：grok-0.79.3-re ｜ 类型：品味 ｜ 阻塞：T24（建 bot 对话框）；不阻塞 T20–T23 ｜ 提出：2026-11-07
- 背景：0.79.3 的新建对话框只有：58px 会动的吉祥物预览 + 名字 + 形状/颜色选择（选形状自动配色）+「Help me create a Bot」卡 + Cancel/Create（RE-UI-0.79.3 题 2(a)）。我们现在的对话框（P5-57）是另一套：选配置（standard 等 preset）→ 勾连接器 → 选模型。这三项原版没有（原版在云端定），但我们的 bot 要靠它们跑。
- 选项：
  - A（推荐）：上半部分 1:1 做成 0.79.3 的样子；我们的三项收进下方一个默认折叠的「More options」，不展开就用默认值（standard + 无连接器 + 默认模型）。大多数时候用户看到的和原版一样。
  - B：两步：第一步 0.79.3 样式（名字 + 形象），点 Create 后第二步再选配置 / 连接器 / 模型。
  - C：三项与形象并排平铺在同一屏（对话框变高，和原版观感差别最大）。
- 推荐理由：A 不多一步、默认路径与原版一致，现有「New bot with this app / configuration」预填入口只要把折叠区自动展开即可，改动最少。
- 默认：用户未答前 T24 按 A 施工（改起来可逆）。
- 答复（用户 2026-11-11）：
  - 目录从哪来：**「一键参考DSH」**——抄 DSH 的（市场/目录机制）。
  - 要登录的连接器：**不做真登录（推荐档 A）**。
  - 自定义连接器表单：**只开 HTTPS 无 token（推荐档 A）**。
  - 用户看到的 bug 具体形态未单独指认（T48 探针四格已把现状钉死，最可能=②死路空页）。

## Q-033 [open] 首次引导：去掉「选日常工具」和「给第一个 Bot 起名挑形象」两页吗（0.79.3 已去掉）
- slug：grok-0.79.3-re ｜ 类型：范围 ｜ 阻塞：不阻塞（T28 按默认 A 施工）｜ 提出：2026-11-07
- 背景：现在的引导（T26，用的是 0.18 的六步）最后两页是「What do you use every day?」选工具，和「New Bot」起名、挑颜色形状。0.79.3 把这两页从流程里拿掉了（产物里 `tools`/`create` 被过滤出步骤序列，渲染也返回 null），换成三页问卷：你主要做什么（9 个角色）、从哪听说的（12 个来源）、连接 Gmail/日历。问卷走完后自动建主 bot，名字和形象用默认值，角色写进 bot 的设定。
- 选项：
  - A（推荐）：照 0.79.3 做。去掉两页，加三页问卷，主 bot 自动建好。
  - B：三页问卷之后保留起名、挑形象这页（「选日常工具」照样去掉）。比原版多一步，但第一个 bot 由用户亲手命名。
- 第 2 点（T28b）：0.79.3 在用户选了角色之后，会顺手再建 2 个该角色的模板 bot（例如 Engineering 建「Bug Reproduction」和「Product Performance」），两个 bot 都会自我介绍。默认照做（开）；不想一上来就多出 2 个 bot，请回复「T28b 关」。
- 推荐理由：原版即规格；改起来可逆，选 B 只要在步骤表末尾补回一页、测试 ④ 改一下。
- 默认：用户未答前 T28 按 A 施工，T28b 按「开」排计划。
- 答复（用户 2026-11-11）：
  - 目录从哪来：**「一键参考DSH」**——抄 DSH 的（市场/目录机制）。
  - 要登录的连接器：**不做真登录（推荐档 A）**。
  - 自定义连接器表单：**只开 HTTPS 无 token（推荐档 A）**。
  - 用户看到的 bug 具体形态未单独指认（T48 探针四格已把现状钉死，最可能=②死路空页）。

## Q-034 [open] 远程电脑（ssh）断开后，要不要在通知里放一个「重新连接」按钮
- slug：p9-dsh-integration ｜ 类型：需求范围 ｜ 阻塞：不阻塞（T12a 按默认 C 施工）；决定 T12b 做不做 ｜ 提出：2026-11-07
- 背景：bot 用的远程电脑（ssh）连接断了以后，上游不会自己重连，要把整个 SDK 重启才能连回去。T12a 会把那条「回复失败：SSH connection is closed」换成「电脑连接已断开。上一步可能已执行，也可能没执行——先看看结果再决定要不要重试」。经理查了代码：现在**没有任何现成的重启路径**（启动器只起一次 SDK，SDK 退了就把窗口也关掉；界面进程拿不到 LLM key，起不了 SDK）。另外你在 Q-031 选了 B，ssh 链现在只剩「再操控另一台机器」的用途，界面里也还没有打开它的入口。原版 0.78.1 没有对应：它的电脑是云端的，断了服务端自己重连。
- 选项：
  - A：做按钮。点了以后整个 Hivebot 窗口关掉、SDK 重启、窗口重新打开（约等于你手动关了再开，所有 bot 正在跑的回合都会被打断）。做法是启动器加一个「按退出码重来一轮」的循环，约 1 张单。
  - B：做按钮，但只重启 SDK、窗口不关。要给 SDK 启动器加进程看管、让界面在 SDK 换了端口和口令后重新接上，碰到口令交付和单实例锁这两处安全设计，约 2–3 张单。
  - C（推荐）：先不做按钮。通知里写「重新打开 Hivebot 即可重新连接」，你手动关了再开。
- 推荐理由：ssh 模式现在还没有日常用户（真实远程 T13 在等你给主机），A 的效果和手动重开一样，B 代价最大。等真的开始用远程电脑，再按 A 补，T12a 的文案改一句就行。
- 默认：用户未答前按 C（T12a 照常施工，T12b 不开）。
- 补充（2026-11-07 T12a 终验实测）：断开后**别的 bot**再碰远程电脑，60s 内没有任何回应也不报错（一直转）。选 A 则重开即恢复；选 C 则另需一张「断后远端调用超时报错」单（queue 5d″）。推荐仍为 C（ssh 暂无日常用户）。
- 答复（用户 2026-11-11）：
  - 目录从哪来：**「一键参考DSH」**——抄 DSH 的（市场/目录机制）。
  - 要登录的连接器：**不做真登录（推荐档 A）**。
  - 自定义连接器表单：**只开 HTTPS 无 token（推荐档 A）**。
  - 用户看到的 bug 具体形态未单独指认（T48 探针四格已把现状钉死，最可能=②死路空页）。

## Q-035 [open] 让主 bot 替你建 bot：开多大的口子、要不要每次弹卡让你点批准
- slug：bot-product-awareness ｜ 类型：需求范围 + 越过安全约束的授权 ｜ 阻塞：不阻塞 T33（先让 bot 知道同伴和怎么建）；决定 T34 做不做、做多大 ｜ 提出：2026-11-08
- 背景：你说「我说创建其他的 bot 他都不知道」。经理查了代码：**主 bot 派活建 bot 的整套编排早就做好了**（`create_bot` 建 bot、`send_to_bot` 给它追加要求、`stop_bot` 叫停；建出来的 bot 进侧栏 Workers 分组，干完自动回报主 bot），但闸门一直关着（P6-14b，还卡在 48 组效果评测等三项前置），所以生产里的 bot 没有这几个工具。另外这套编排带一条「强制委派」规则：主 bot 只要写文件或跑命令，都必须派给新 bot 做，自己不动手——开闸等于主 bot 的行为整体改变，不只是多了「能建 bot」。原版 0.79.3：主 bot 的定位就是「你的主联系人，主动跟进、协调你的其他 bot」，有 CreateAgent / SendToAgent 工具，建 bot 时只显示一行「Creating 名字」，经理没找到审批卡的文案。
- 选项：
  - A：整套开闸（P6-14b）。主 bot 能建、能追加要求、能叫停，并且改成「动手的活一律派出去」。最接近原版的主 bot 定位，但要先补完 P6-14b 三项前置（约 3–4 张单），主 bot 体验变化大。
  - B（推荐）：只给主 bot「你明确叫它建 bot 时」能用的建 bot 工具（复用现成的 create_bot 和 Workers 分组），**不带**强制委派规则，主 bot 平时照旧自己干活。约 1–2 张单。
  - C：先不代建。T33 做完后 bot 会告诉你「按 Ctrl+N / 侧栏新建按钮，在 Create New Bot 里填名字」，你自己点。
- 第 2 点（选 A 或 B 时）：主 bot 每次建 bot 要不要弹卡让你点批准？
  - 不弹（推荐，照原版）：新 bot 的权限不会超过主 bot——只有主 bot 能建、只在你亲自发消息的那一轮能建（别的 bot 回报、定时任务、目标模式里都建不了）、同时最多跑 3 个、连接器 / 工作目录 / 配置由程序定死（bot 指定了就拒，凭证不经 bot 之手）；新 bot 跑命令照样逐条问你。
  - 弹：每次建之前出一张卡「主 bot 想建 bot『名字』，任务是……」，你点了才建。
- 推荐理由：B 直接解决你说的「叫它建它不会」，又不把主 bot 的日常行为一起改掉；A 适合等你的编排研究（T27）有结论后再决定。不弹卡是原版做法，安全边界靠上面那几条硬约束，不靠你逐个点。
- 默认：用户未答前按 C（T33 照常施工，T34 不开）。
- 答复（用户 2026-11-11）：
  - 目录从哪来：**「一键参考DSH」**——抄 DSH 的（市场/目录机制）。
  - 要登录的连接器：**不做真登录（推荐档 A）**。
  - 自定义连接器表单：**只开 HTTPS 无 token（推荐档 A）**。
  - 用户看到的 bug 具体形态未单独指认（T48 探针四格已把现状钉死，最可能=②死路空页）。

## Q-036 [open] 你说的「dsh 的 superagent」指哪一个
- slug：bot-product-awareness ｜ 类型：需求澄清 ｜ 阻塞：不阻塞 T33；决定 BRIEF 第 3 条落到哪 ｜ 提出：2026-11-08
- 背景：项目里有三样东西都可能叫「superagent」，现状各不相同：
  - ① `dsh-superagent-prototype`（DeepSeek 的研究原型）：盯一个 GitHub 仓库 / 飞书，有人提需求就自己开工单、干完回 PR，带一个网页面板。2026-11-01 你在 Q-001 选了 b，它整体移出了 MVP，**现在产品里没装**。
  - ② subagent：bot 在自己对话里临时开的内部小助手。**现在就有**（默认配置带 subagent 工具），但 bot 不会主动提，界面上也看不到子任务过程——这正是 T27（等你编排研究结论）要做的「subagent 分页 / 任务卡」。
  - ③ 主 bot 派活给其他 bot 的编排：见 Q-035。
- 选项：
  - A：指 ①，要现在把它接进产品（另立项，先评估它和 dsh 0.2.2 的兼容性——Q-001 时的结论是要单独一套配置才能装）。
  - B（推荐）：指 ② / ③。② 并入 T27，③ 按 Q-035。T33 会让 bot 知道「subagent 是内部助手、不是 bot」。
  - C：都要，① 排在 ②③ 之后。
- 推荐理由：① 是面向 GitHub 团队协作的另一种产品形态，和现在的桌面聊天体验交集小；②③ 就是原版 0.79.3 里「主 bot 协调其他 bot + 子任务可见」那一块。
- 默认：用户未答前按 B。
- 答复（用户 2026-11-11）：
  - 目录从哪来：**「一键参考DSH」**——抄 DSH 的（市场/目录机制）。
  - 要登录的连接器：**不做真登录（推荐档 A）**。
  - 自定义连接器表单：**只开 HTTPS 无 token（推荐档 A）**。
  - 用户看到的 bug 具体形态未单独指认（T48 探针四格已把现状钉死，最可能=②死路空页）。

## 拍板记录（2026-11-08 03:2x，用户）
- **Q-035 = A 全开**：「Grok Bot 本身就是一个主 Bot+一对小 Bot」——orchestration 全量开闸（含主 bot 强制委派路由）。
- **Q-036 = B**：用户记忆中的 SuperAgent = 主 bot 的协调角色（主 Bot + 一群小 Bot 架构），非 dsh-superagent-prototype；subagent 并入 T27、编排按 Q-035=A 走。

## Q-037 [open] 主 bot 的小助手（subagent）进了 Workers 以后，干完活还留不留、能不能直接跟它说话
- slug：bot-product-awareness ｜ 类型：品味 ｜ 阻塞：不阻塞 T36（按默认做） ｜ 提出：2026-11-08
- 背景：小助手的会话 dsh 会一直存着，干完不会自己消失；主 bot 用得多，小助手会越积越多。原版 0.79.3 根本不把它放侧栏（只在「Show full conversation」里分页看），这里没有原版可照。
- 第 1 点：干完以后
  - A（推荐）：和 create_bot 建的 worker 一样——干完、你看过之后进「Done」，Done 默认折叠。看得到历史，平时不占地方。
  - B：只在运行中显示，干完就从侧栏消失（要看过程只能去主 bot 的对话里找）。
- 第 2 点：点开小助手的行以后，底部输入框
  - ~~A：照常能打字~~ **实测不成立**（2026-11-08 T36 生产旁证，LOG「T36 生产旁证 6」）：从侧栏直接发给小助手，dsh 拒收，报 `subagent Sessions require their durable parent address; use subagent delivery for this child session`——小助手只收主 bot 转来的话。照现在的代码，你在它的输入框打字会看到这句英文报错。
  - B（推荐，改）：只读——输入框换成一行提示「这是主 bot 的小助手，想让它继续，请对主 bot 说」。只改 UI，小改动。
  - C：能打字，但实际是替你发给主 bot、由主 bot 转给小助手。要动 SDK 送信链路，工作量大，且回复会出现在主 bot 对话里，不在小助手这里。
- 推荐理由：第 1 点 A「和 worker 一个样」；第 2 点 dsh 不允许直接聊，B 最诚实、代码最少。
- 默认：第 1 点按 A（T36 已这样做）；第 2 点用户未答前**不改**（保持现状，报错可见），答 B/C 后另开单（queue W1c）。
- 答复（用户 2026-11-11）：
  - 目录从哪来：**「一键参考DSH」**——抄 DSH 的（市场/目录机制）。
  - 要登录的连接器：**不做真登录（推荐档 A）**。
  - 自定义连接器表单：**只开 HTTPS 无 token（推荐档 A）**。
  - 用户看到的 bug 具体形态未单独指认（T48 探针四格已把现状钉死，最可能=②死路空页）。

## Q-038 [open] 侧栏 Workers / Done：Done 默认收起吗、看过的 worker 什么时候挪进 Done
- slug：exp-polish ｜ 类型：品味 ｜ 阻塞：不阻塞 T39（按默认做） ｜ 提出：2026-11-09
- 背景：你说的「点进去只显示 2 个、worker 在跳」，根因是**点一下**就把 Done 里的行拽到 Workers（T39 修，不用你定）。修完以后剩两处「会动」是按状态动的，想确认你能不能接受：
- 第 1 点：Done 组
  - A（推荐）：照旧默认收起，组标题带个数，点开看全部；展开过就一直记住（重启也记住）。
  - B：默认展开，所有干完的都直接摆出来。
- 第 2 点：一个干完的 worker，你点开看过以后
  - A（推荐）：看的时候留在原地，**你点去别处之后**才挪进 Done。
  - B：一直留在 Workers，直到它下次又开工或者你手动收；Workers 会越堆越长。
- 推荐理由：A/A 是现在的做法，修掉「点一下就跳」之后，挪动只发生在「活干完了 / 你看完离开了」这两个时刻。
- 默认：都按 A，不开单；答 B 另开小单（queue E1b）。
- 答复（用户 2026-11-11）：
  - 目录从哪来：**「一键参考DSH」**——抄 DSH 的（市场/目录机制）。
  - 要登录的连接器：**不做真登录（推荐档 A）**。
  - 自定义连接器表单：**只开 HTTPS 无 token（推荐档 A）**。
  - 用户看到的 bug 具体形态未单独指认（T48 探针四格已把现状钉死，最可能=②死路空页）。

## Q-039 [open] 让界面多调几个 dsh 接口（看历史图片、定时例行、后台任务）——白名单要不要加行
- slug：exp-polish ｜ 类型：越过约束的授权（M1 白名单「增行须过契约问题」） ｜ 阻塞：T44 附件、E9 Routines、E10 后台任务 shell 部分 ｜ 提出：2026-11-09
- 背景：界面只能经 main 的白名单调 dsh（现在 16 个方法，`app/ui/main/m1-api/index.ts:12`）。原版的三样东西 dsh 后端都有、0.18 界面零件也在，就差白名单：① 发出去的图片在历史里读回来（`session.attachment`）+ 非图片文件上传；② 定时例行的列 / 建 / 改 / 删 / 立即跑（dsh-schedule）；③ 后台任务列表 / 输出 / 停止（dsh job.list / follow / kill）。凭证、`/permission`、configForms 那条永拒线（D9）不动。
- A（推荐）：三组都加，每行带参数校验，按 sessionId 限定范围；确切方法名由施工探针从 dsh 类型文件里读出来，经理复核后才进白名单。
- B：只加 ①（附件）；②③ 以后再说（定时例行只能在聊天里让 bot 自己建，看不到面板）。
- C：都不加：附件只能发图不能回看，Routines / 后台任务面板不做。
- 推荐理由：三样都是原版有、用户看得见的功能，且只读 / 只管自己 bot 的东西，不碰凭证面。
- 默认：未答前不动白名单；T44 / E9 / E10 不开工。
- 答复（用户 2026-11-11）：
  - 目录从哪来：**「一键参考DSH」**——抄 DSH 的（市场/目录机制）。
  - 要登录的连接器：**不做真登录（推荐档 A）**。
  - 自定义连接器表单：**只开 HTTPS 无 token（推荐档 A）**。
  - 用户看到的 bug 具体形态未单独指认（T48 探针四格已把现状钉死，最可能=②死路空页）。

## Q-040 [open] bot 要不要有「自己的电脑」（右侧实时看它操作）
- slug：exp-polish ｜ 类型：需求与范围 ｜ 阻塞：不阻塞第一批 ｜ 提出：2026-11-09
- 背景：原版每个 bot 有一台云上 Linux 电脑，会话头一个电脑钮，点开是实时画面（VNC），能看它开浏览器、能接手。0.18 界面零件全在（`computer/shell/*` 含 VNC 组件，现在被我们置空）。我们这边：dsh 的 computer use 只支持 macOS；Linux 上要自己搭（虚拟屏 + 浏览器 + 画面转发），还得过沙箱和审批。
- A：不做，保持现在（bot 只有 bash / web_fetch）。
- B：做完整版：bot 工作区里起虚拟屏和浏览器，界面电脑钮打开实时画面，bot 用浏览器自动化工具操作。大工程，单独立项。
- C（推荐）：先只做浏览器：接一个在维护的浏览器自动化 MCP（如 Playwright MCP），bot 能开网页、点、截图，截图回传到聊天（E2a）；实时画面以后再说。
- 推荐理由：你说的「browser use 的显示回传」C 就能看到；B 的成本是 C 的好几倍，C 做完再决定要不要 B。另外等 E2 测试清单实跑完再开工，以实测为准。
- 默认：按 C 排在 E2 实测之后；答 A / B 改计划。
- 答复（用户 2026-11-11）：
  - 目录从哪来：**「一键参考DSH」**——抄 DSH 的（市场/目录机制）。
  - 要登录的连接器：**不做真登录（推荐档 A）**。
  - 自定义连接器表单：**只开 HTTPS 无 token（推荐档 A）**。
  - 用户看到的 bug 具体形态未单独指认（T48 探针四格已把现状钉死，最可能=②死路空页）。

## Q-041 [open] 按住说话输入（听写）用什么转文字
- slug：exp-polish ｜ 类型：需求与范围 ｜ 阻塞：不阻塞 ｜ 提出：2026-11-09
- 背景：原版输入框有麦克风「Click or hold to dictate」，转文字在 xAI 服务端。0.18 的录音界面在（`voice.tsx`），我们缺转文字的后端。
- A（推荐）：先不做，第一批体验单做完再议。
- B：本机离线转写（whisper.cpp 一类，需要下载一个约 150MB 的模型，中文效果一般）。
- C：走模型服务商的语音转文字接口（要在 LiteLLM 那边配一个 STT 路由）。
- 默认：A。
- 答复（用户 2026-11-11）：
  - 目录从哪来：**「一键参考DSH」**——抄 DSH 的（市场/目录机制）。
  - 要登录的连接器：**不做真登录（推荐档 A）**。
  - 自定义连接器表单：**只开 HTTPS 无 token（推荐档 A）**。
  - 用户看到的 bug 具体形态未单独指认（T48 探针四格已把现状钉死，最可能=②死路空页）。

## Q-042 [open] 头像：只做上传真照片，还是也做 AI 生成
- slug：exp-polish ｜ 类型：品味 ｜ 阻塞：不阻塞 ｜ 提出：2026-11-09
- 背景：原版头像编辑器能上传 / 拖放 / 粘贴图片、拖动缩放，也能「Describe your avatar」让 AI 画。上传那半 0.18 零件全在；AI 生成要一个图像模型。
- A（推荐）：只做上传（queue E14），吉祥物形象照旧是默认。
- B：上传 + AI 生成（要接图像模型）。
- 默认：A。
- 答复（用户 2026-11-11）：
  - 目录从哪来：**「一键参考DSH」**——抄 DSH 的（市场/目录机制）。
  - 要登录的连接器：**不做真登录（推荐档 A）**。
  - 自定义连接器表单：**只开 HTTPS 无 token（推荐档 A）**。
  - 用户看到的 bug 具体形态未单独指认（T48 探针四格已把现状钉死，最可能=②死路空页）。

## Q-043 [open] 界面要不要能切中文
- slug：exp-polish ｜ 类型：需求与品味 ｜ 阻塞：不阻塞 ｜ 提出：2026-11-09
- 背景：原版 0.79.3 有 39 种界面语言（含简体 / 繁体中文）和「Language」设置；我们现在全英文。原版的中文串可以从它的语言包里搬，我们自己加的界面（市场、Workers、对话框等）要另外翻。
- A：保持英文（与原版英文界面逐字一致）。
- B（推荐）：加简体中文切换，排在 E 系列体验单之后做。
- 默认：A，直到你答。
- 答复（用户 2026-11-11）：
  - 目录从哪来：**「一键参考DSH」**——抄 DSH 的（市场/目录机制）。
  - 要登录的连接器：**不做真登录（推荐档 A）**。
  - 自定义连接器表单：**只开 HTTPS 无 token（推荐档 A）**。
  - 用户看到的 bug 具体形态未单独指认（T48 探针四格已把现状钉死，最可能=②死路空页）。

## Q-044 [open] 桌宠：自己做一个小窗（推荐），还是先原样跑 dsh-pet 看效果
- slug：exp-polish ｜ 类型：方案取舍 / 品味 ｜ 阻塞：不阻塞（T45a 按默认 A 开工） ｜ 提出：2026-11-09
- 背景：dsh-pet 装进我们的后端当插件不行（它要拿凭证去聊天、端口无鉴权、宠物会出现在后端那台机器上）。剩两条路：
- A（推荐，T45a）：我们 Hivebot 自己开一个透明置顶小窗，搬 dsh-pet 的大肥鱼动画（9 段）和它的六档状态表。好处：点宠物能回到 bot、Windows 客户端上宠物就在 Windows 桌面、只有一个 Electron。代价：第一版只有「状态动作 + 拖动 + 点击挥手」，dsh-pet 的 Q 弹 / 甩抛 / 漫游 / 睡觉要后面一项项搬（T45c）。
- B：先原样起 dsh-pet 独立版（它自己的窗口），我们只往它的 `/work-status` 推状态。好处：打磨效果马上全有。代价：两个 Electron 同时跑、点宠物回不到 Hivebot、Windows 包里要再塞一个应用；之后大概率还是要换成 A。
- 另：「代替原来的 bot 效果」我们理解为「bot 在干活 / 等你 / 出错时宠物做对应动作」，**界面里原有的状态显示（侧栏转圈、Waiting for you 等）不拿掉**。若你想要的是把界面里的 bot 头像换成宠物动画，请说明。
- 默认：A。
- 答复（用户 2026-11-11）：
  - 目录从哪来：**「一键参考DSH」**——抄 DSH 的（市场/目录机制）。
  - 要登录的连接器：**不做真登录（推荐档 A）**。
  - 自定义连接器表单：**只开 HTTPS 无 token（推荐档 A）**。
  - 用户看到的 bug 具体形态未单独指认（T48 探针四格已把现状钉死，最可能=②死路空页）。

## Q-045 [answered] Windows 连 Ubuntu 测试：确认架构 + 你那边要准备什么
- slug：exp-polish ｜ 类型：需求与范围 ｜ 阻塞：阻塞 T46b（不阻塞 T46a 打包） ｜ 提出：2026-11-09
- 背景：Windows 上的 exe 只放界面；bot 的后端、沙箱、模型 key 全留在 Ubuntu，exe 通过 SSH 隧道连过去（key 不进 exe，Windows 侧不执行 bot 的命令）。
- 需要你确认 / 准备：
  1. Windows 能 `ssh <你的用户>@<Ubuntu 地址>` **免密登录**（密钥 + ssh-agent；Win10/11 自带 OpenSSH 客户端即可）。exe 不弹密码框。
  2. Ubuntu 的地址是局域网 IP、Tailscale 之类，还是别的？（只需要 SSH 端口通，不开别的端口）
  3. exe 不做代码签名：第一次运行 Windows 会弹「已保护你的电脑」，点「更多信息 → 仍要运行」。可以接受吗？要签名需要你有代码签名证书。
- A（推荐）：照上面做，未签名，SSH 免密。
- B：要签名（请提供证书方式）/ 要别的连接方式（请说明）。
- 默认：A。
- 答复：2026-11-09 用户定案（记录见 tickets/queue.md）：A——免密 key、未签名可接受；测试用本机私有 sshd（T2 夹具）模拟，实机在 Windows 虚拟机上做。

## Q-046 [open] Windows 客户端：Ubuntu 上的后端谁来开，bot 列表要不要两边共用
- slug：exp-polish ｜ 类型：需求与范围 ｜ 阻塞：不阻塞（T46b 按默认 A 施工） ｜ 提出：2026-11-10
- 背景：Windows 上的 Hivebot 通过 SSH 连 Ubuntu 上常驻的 `hivebot serve`。两件事需要你定：
  1. **后端谁开**。A（推荐）：你在 Ubuntu 上先开着 `hivebot serve`（终端 / tmux），Windows 打开时只连；没开就提示「Ubuntu 上的 Hivebot 服务没在运行」。B：Windows 打开时若发现没开，自动在 Ubuntu 上后台起一个（关 Windows 后它继续跑，要你自己去关）。A 简单、不会在 Ubuntu 上留下你不知道的进程；B 省一步。
  2. **bot 列表**。A（推荐）：Windows 上的 bot 列表存在 Windows 本地，和 Ubuntu 桌面版各是各的（bot 的工作区文件都在 Ubuntu 上）。B：两边看到同一份列表——要额外做同步，而且两边不能同时开（现在 serve 和 Ubuntu 桌面本来就互斥）。
- 另：Ubuntu 上需要一次性做 `ln -s ~/bot/app/launcher/hivebot ~/.local/bin/hivebot`（Windows 固定用这个路径找 Hivebot）。
- 默认：1=A，2=A。
- 答复：

## Q-047 [answered 2026-11-11] 安全红线：要不要让界面能填 / 改模型 API key（放宽 D9「界面不碰凭证」）
- slug：settings-connectors ｜ 类型：越过硬约束的授权 ｜ 阻塞：阻塞 T50（模型与 key 设置卡）；不阻塞 T48 探针 ｜ 提出：2026-11-11
- 你的原话（2026-11-11）：「我们先把一些settings, 比如apikey……处理一下」。
- 现状：key 现在只能在启动前配——环境变量 `P2SDK_LLM_API_KEY` / `LITELLM_MASTER_KEY`，或文件 `~/.config/hivebot/env`（必须 chmod 600），配一个 OpenAI 兼容地址 + 一个模型（`app/launcher/hivebot:129-158`、`app/sdk/profile/patches/p2sdk.yml:26-35`）。界面上完全看不到配没配。
- 红线：P4 定的 D9 是「永久判据」——界面经 main 调后端时，**任何凭证 / 账号方法一律拒绝**，「放宽须引用户原话另开安全红线问题」（`work/p4-ui/BRIEF.md:52`）。所以「apikey 设置」不能顺手做，要你明确授权到哪一档。
- 原版参照：0.18 源码的设置里有个 Router 区，只是在 Cursor / Claude Code / Codex / OpenRouter 四个**已登录账号**之间切换，**没有 key 输入框**（`renderer-grok/frontend/src/recovered/features/settings/overlay/router.ts`、`panels.tsx:468`）；0.79.3 的设置七个区里没有 Router（`work/grok-0.79.3-re/RE-FULL-0.79.3.md` §7）。0.78.1 有没有、长什么样，等 REA 的 `RE-SETTINGS-0.78.1.md`。也就是说：原版的人不填 key，「填 key」是 Hivebot 自己用 LiteLLM 才有的需要。
- A（推荐）：**只读状态卡**。设置里加「Model provider」：显示地址、模型、key「已配置 / 未配置」和来源（环境变量 / env 文件），附一行「改 key：编辑 ~/.config/hivebot/env 后重启」。key 的值永远不经过界面。D9 只放宽到「可读是否已配置」。
- B：**界面可填**。界面输入 key → 只经 main 一次性写进 `~/.config/hivebot/env`（600），永不回传、不进日志，写完提示重启后端（或自动重启）。D9 放宽到「凭证只写不读」。Windows 客户端连 Ubuntu 时，key 会经 SSH 隧道传到 Ubuntu 再写，Windows 本地不落盘。
- C：B 再加多家预设（OpenRouter / OpenAI / Anthropic 兼容 / 本机 LiteLLM）和多模型列表，接近 0.18 Router 的样子。
- 默认：A（先做只读卡，B/C 等你答）。
- 答复（用户 2026-11-11 原话）：**「这个直接抄DSH的配置」**——不选 A/B/C 档，改为参考 DSH（我们底层的 dsh）自身的配置机制来做模型/key 配置；DSH 怎么配我们怎么配。具体形态立项探明（dsh 源码在 repos/）。
- 落实（manager 2026-11-11 任务 A 续）：DSH 的配置 = 设置里的 **Models 页**：每个 provider 一行，API key 输入框**只写不读**（`credentials.set` 存进 `$DSH_HOME/.credentials.yaml`，仅本人可读，优先于启动环境变量，下一次请求生效不用重启），状态只显示「已配置 / 缺」圆点；provider 与模型列表存在 `llm-pi-ai` 设置段（dsh `client/ui-settings-models` README「API keys」节、`api/settings-controller` README）。这些后端件**我们的运行时早已挂着**，缺的只是 main 白名单。按「放宽须引用户原话」，以本答复为据把 D9 放宽到 **DSH 同款：密钥只写不读 + 只许改 `llm-pi-ai` 设置段**，其余凭证 / 账号 / 权限类照旧永拒 → T49（桥 + 守卫，安全单单独审）、T50（界面）、T50a（没 key 也能启动，好在界面里填）。你若只想「看得到配没配」、不想界面能写，说一声，T50 退回只读。

## Q-048 [answered 2026-11-11] Connect apps 要做到多真：目录从哪来、Gmail 这类登录要不要真连、能不能自己加
- slug：settings-connectors ｜ 类型：需求与范围 ｜ 阻塞：阻塞 T51–T53；不阻塞 T48 ｜ 提出：2026-11-11
- 先问一句：你说「connected app 这块有 bug」，具体看到的是哪一种？（点开是空的 / 关不掉 / 报错 / 引导页 Connect 点不了 / 别的）。T48 探针会把四处现状截图出来，你也可以直接在截图上指。
- 现状：侧栏「Connect apps」打开的是我们的插件市场，装的是 dsh 插件包；目录地址要在启动前配 `P2SDK_MARKET_INDEXES`，**没配就显示「No catalog configured」，界面上改不了**——你本机没有 `~/.config/hivebot/env`，所以多半就是这个空页。引导页的 Gmail / Google Calendar 的 Connect 钮一直是灰的。
- 原版：目录来自 xAI 服务器；「Connect」= 加一个 MCP 服务器，要登录的走 OAuth（Gmail、日历、GitHub、Notion…）；另有「自己加」表单（远程 HTTPS 地址 + 请求头，或本机命令）（`work/p5-parity/RE-market-detail.md` §0、§4）。xAI 的目录和登录我们拿不到。我们后端的 MCP 客户端只支持本机命令和带固定请求头的 HTTPS，**不支持 OAuth**（dsh-mcp-client 0.2.2-alpha.2 `lib/index.js:40-46`）。
- 1. 目录从哪来：
  - A（推荐）：随应用自带一份目录（官方 MCP Registry 的离线快照，只收能本机跑、不要登录的条目），开箱就不是空的；高级用户仍可用 `P2SDK_MARKET_INDEXES` 换。
  - B：保持现状，只把空页文案改成教你怎么配。
- 2. 要登录的连接器（Gmail / 日历 / GitHub…）：
  - A（推荐）：这批不做真登录。引导页那两个和目录里要登录的条目显示「需要登录，这个版本还不支持」，不假装能点。
  - B：做真 OAuth：要改造 MCP 客户端加登录流程，并且**你得自己去 Google / GitHub 注册一个 OAuth 应用**拿 Client ID；工作量是本批其它所有单的几倍。
- 3. 「自己加连接器」表单（照原版：远程 HTTPS + 请求头，或本机命令）：
  - A（推荐）：只开**远程 HTTPS**（请求头里的 token 只写进本机配置、不回显——这也是界面碰凭证，和 Q-047 的 B 同一档授权；Q-047 只选 A 的话，这里只能做不带 token 的地址）。本机命令那一型不开——原版自己都警告「命令会在机器上跑」，而我们的 MCP 子进程由后端直接拉起、不走 bash 那层沙箱（mcp-client `lib/index.js:40-43` 直接 StdioClientTransport；T52 开工前再核实一次）。
  - B：两型都开（本机命令型每次添加弹确认）。
  - C：不做。
- 默认：1=A，2=A，3=A。
- 答复（用户 2026-11-11；manager 2026-11-11 从 Q-046 块挪回此处，原记错位置）：
  - 目录从哪来：**「一键参考DSH」**——抄 DSH 的（市场/目录机制）。
  - 要登录的连接器：**不做真登录（推荐档 A）**。
  - 自定义连接器表单：**只开 HTTPS 无 token（推荐档 A）**。
  - 用户看到的 bug 具体形态未单独指认（T48 探针四格已把现状钉死，最可能=②死路空页）。
- 落实（manager 2026-11-11 任务 A 续）：DSH 的目录机制 = **不预置源，用户在界面「Index sources」里加 / 删**（dsh `boot/plugin-market` README:27-53、`client/ui-plugin-market` README:27-29）→ T51 照抄。DSH 没有官方目录地址可「一键」加，是否要我们给一个预置源另见 Q-049（不阻塞）。2=A → T53；3=A（HTTPS、无请求头 / token）→ T52。

## Q-049 [superseded → Q-054] Connect apps 要不要给一个「一键加上」的预置目录源
- manager 2026-11-11 落实：用户新话「COnnect应该和一些Grok Bot的预设是差不多的」（`work/ui-borders-connect/BRIEF.md`）= 要预置，默认 A（不预置）作废；怎么预置见 Q-054，T69 按 Q-054 默认施工。
- slug：settings-connectors ｜ 类型：需求与范围 ｜ 阻塞：不阻塞（T51 按默认 A 施工） ｜ 提出：2026-11-11
- 背景：按你说的「参考 DSH」，T51 做成 DSH 那样：市场没有目录时显示「Add index source」，贴一个目录地址进去就能搜能装。但 **DSH 自己没有官方目录地址**（文档里全是 example.com），所以第一次打开仍要你自己贴地址。
- A（推荐）：和 DSH 完全一样，不预置，空态里写清「贴一个 index.json 地址」。
- B：用 DSH 自带的目录生成器（`apps/plugin-market-generator`）做一份「Hivebot 精选」目录，挂在你指定的地方（比如你的 GitHub Pages），空态多一个「Add Hivebot picks」一键加上。需要你给托管位置和想收哪些插件。
- 默认：A。
- 答复：

## Q-050 [open] Windows 上要保证哪些缩放比例
- slug：ui-polish-win ｜ 类型：需求与范围 ｜ 阻塞：不阻塞（T54 先按 VM 现状 100% 取证） ｜ 提出：2026-11-11
- 背景：测试用的 Win11 虚拟机是 1280×800、缩放 100%。真实 Windows 笔记本大多默认 125% 或 150%，字和控件会按比例放大，写死尺寸的地方更容易错位。每多保证一档，修单的验收就多一套截图。
- A（推荐）：保证 100% 和 150% 两档（150% 在虚拟机里改一次显示设置取证，取完改回）。
- B：只保证 100%（和虚拟机一致）。
- C：100% / 125% / 150% 三档全保。
- 也请告诉我：你实际在哪台 Windows 上用、缩放比例多少——那一档一定会被保证。
- 默认：A。
- 答复：

## Q-051 [open·不阻塞] 请发一张你在 Windows 上看到「UI 错位」的截图
- slug：ui-polish-win ｜ 类型：需求与范围 ｜ 阻塞：**阻塞 Windows 错位修复**（T54/T54b 已挪 blocked）；不阻塞设置 / 市场打磨 ｜ 提出：2026-11-11
- 背景：我们在 Win11 虚拟机上取证两轮，结论是：页面布局在 Windows 和 Linux 上逐像素一致（误差 ≤1.5px）；最大化时窗口边缘也正常；我们的标题栏早就用了和原版一样的方式（系统画右上角最小化 / 最大化 / 关闭三个钮，应用画其余部分）。第二轮的「双标题栏」结论是虚拟机屏幕睡眠拍到的黑屏误判，已撤回。**我们至今没见过你看到的那个错位。**
- 请给：
  1. 一两张截图（整屏，带出问题的那块），或一句话描述「哪里歪了 / 叠了 / 被挡了」；
  2. 是哪台 Windows（虚拟机还是你自己的电脑），显示缩放比例（设置 → 显示 → 缩放，如 100% / 125% / 150%），窗口是最大化还是拖小了。
- 我们这边会继续做与平台无关的打磨（暗色按钮看不清、bot 名字显示成提示原文、设置 / 市场照原版尺寸），这些在 Windows 上也会一起变好。
- 默认：无（等截图；收到前不开 Windows 专项修单）。
- 答复：
- 2026-11-11 manager 更新：T54c 第三轮在虚拟机（100% 缩放）拿到 6 张有效整屏，窗口层没有错位；能看到的问题是 bot 标题 / 侧栏 / 输入框三处显示 `<bot_introduction_request>` 提示原文（T60 在修）和虚拟机里旧版 0.1.0 的市场空页（主线已修）。**改为不阻塞**，T54 线已关闭。仍欢迎截图，尤其是 125% / 150% 缩放或你自己的电脑——收到再开 Windows 专项单。

## Q-052 [open·不阻塞] Windows 安装包从哪里拿：经你自己的 SSH 从 Ubuntu 拷，还是挂到公开 GitHub Release
- slug：install-oneclick ｜ 类型：越过硬约束的授权（对外分发）｜ 阻塞：不阻塞（T65 按默认 A 施工）｜ 提出：2026-11-11
- 背景：Windows 版是「只有界面」的薄客户端，必须连你 Ubuntu 上的 `hivebot serve`（Q-045 已定），所以 Windows 本来就要能免密 ssh 到 Ubuntu。安装包里打进了 0.18 移植层编译后的界面代码——这部分没有许可证，之前你定过「合规公开、不分发」。
- A（推荐，默认）：公开仓只放自写的 `install.ps1`；在 PowerShell 里跑一条命令（带你的 Ubuntu 别名），脚本经 SSH 从 Ubuntu 拷安装包、静默装好、写好连接配置、打开应用。不在 GitHub 上分发任何 0.18 衍生物。Ubuntu 上先跑一次 `./install.sh --win` 出包。
- B：把 exe 挂到公开仓的 GitHub Release，脚本直接下载。最省事、别人也能用；但等于公开分发 0.18 衍生代码（与之前的决定相反）。
- C：建一个私有仓放 Release，Windows 上用 `gh` 登录后下载。合规，但多一步登录。
- 默认：A。选 B / C 时只改 T65 的取包一步。
- 答复：

## Q-053 [open·建议尽快看] 公开仓上挂着 83 个开发分支，里面有不该公开的 0.18 移植树
- slug：install-oneclick ｜ 类型：越过硬约束的授权（删远端分支 / 改可见性）｜ 阻塞：不阻塞 ｜ 提出：2026-11-11
- 背景：私仓的 `origin` 就是公开仓 CrepuscularIRIS/Hivebot。公开仓 main 是干净的（发布脚本同步的），但同仓还有 83 个开发分支，比如 `feat/P5-50` 里有 376 个 `app/ui/renderer-grok/frontend/` 文件（0.18 移植树，无许可证），其余分支大概率也带着 `work/`、`CLAUDE.md` 等内部文件。这和「合规公开」相反。我们按规矩不碰远端。
- A（推荐）：私仓换一个**私有**远端（新建私有仓，`origin` 指过去，开发分支推那边）；公开仓只留 main，其余分支由你删除（`gh api -X DELETE repos/CrepuscularIRIS/Hivebot/git/refs/heads/<分支>`，我们可以列出清单）。注意：删分支后已被 fork / 抓取的内容收不回。
- B：保持现状。
- 默认：无（要你决定；我们不动远端）。
- 答复：

## Q-054 [open·不阻塞] Connect apps 的「预设」怎么做：自带在应用里，还是挂网上；要不要列出原版那些要登录的服务
- slug：ui-borders-connect ｜ 类型：需求与范围 ｜ 阻塞：不阻塞（T69 按默认 A/A/A 施工）｜ 提出：2026-11-11
- 先说查证结果（REA `work/grok-0.79.3-re/RE-CONNECT-PRESETS-0.78.1.md`）：原版 Grok Bot **安装包里没有预设清单**。你在原版里看到的 Gmail / Slack / GitHub…，是登录 xAI 账号后服务器发下来的目录；原版断网时这页也是空的。我们没有那台服务器，所以「像原版」只能由我们自己给一份目录。另外 Q-048 你已定：要登录的连接器这一版不做真登录。
- 1. 目录放哪：
  - A（推荐）：**自带在应用里**，作为一个叫「Hivebot picks」的内置目录，和你自己加的目录源并列；断网也有，第一次打开就不是空页。
  - B：挂到网上（比如公开仓 Hivebot 里放一个 index.json，要你自己推送一次），应用默认指向它；和原版一样断网就空，但以后改目录不用发新版。
- 2. 目录里放什么：
  - A（推荐）：两类都放——①不用登录、装上就能用的连接器（记忆、分步思考、文件读写、Context7 文档检索之类，4~6 个，开工时逐个实测断网能装）；②原版目录里常见的要登录的服务（Gmail、Google Calendar、Slack、GitHub、Notion、Linear、Figma…），**标「Needs sign-in」、没有 Connect 钮**，看着像原版、但不假装能连。
  - B：只放①（全部能用，但和原版长得不像，条目少）。
- 3. 图标：
  - A（推荐）：用通用图标，不搬原版安装包里那 47 张品牌图（第三方商标，且源码会同步到公开仓）。
  - B：品牌图只在本机用、发布脚本排除——观感更像，要多维护一条排除规则。
- 默认：1=A，2=A，3=A。
- 答复：

## Q-055 [open·不阻塞] 「原版为规格、DSH 只做最小适配」——下面这些 DSH 机制露在产品面上，哪几条要改
- slug：ui-borders-connect ｜ 类型：需求与范围 ｜ 阻塞：不阻塞（T70 不依赖）｜ 提出：2026-11-12（经理盘点，用户 11-12 定调「原版 Grok Bot + 部分 DSH 适配，而不是所有都适配」）
- 盘点（只列，不开单；你点头哪条再拆）：
  1. **「Index sources」管理页与空态**（`market-surface.tsx:146-191,257,322`）：「No catalog configured / Index sources are set by you…」「Index sources come from third parties…」——这是 dsh 插件市场「用户自配目录源」机制原样上了 UI。原版没有这个概念（目录由服务端下发）。现在内置 Hivebot picks 已保证不空页。
     - A（推荐）：保留功能，入口收到二级（如 Installed 页底或设置里），Connect 主页不再出现「Index sources」按钮与空态文案。 B：照旧。 C：整页删掉。
  2. **条目文案里的 npm / bundle 词**（`market-surface.tsx:127-129`）：「no npm install coordinates」「supported connector bundle」「Can't connect · not-bundle」。原版只有 Connect / Needs sign-in 这类话。
     - A（推荐）：换成原版式短文案（不可装 → 不显示说明；失败 → 「Couldn't connect」+ 细节折叠）。 B：照旧。
  3. **「装上但不对任何 bot 打开，等建 bot 时挑」**（`market-surface.tsx:129`；dsh 的 install(enabled:false)+preset 选择）：原版 Connect 后这个 app 对 bot 直接可用。这条是行为差异、改动大。
     - A（推荐）：先派 REA 核原版「Connect 后对哪些 bot 生效」，再定。 B：照旧不动。
  4. **「Your plugins」**（Installed 视图标题 `market-surface.tsx:300`）：dsh 的 plugin 词；原版对应文案待核。随 2 一起改（A）或不动（B）。
  5. **Filesystem 条目的允许目录是 `$DSH_HOME/workspace`**——全仓只有 wrapper 用这个目录，**不是 bot 的真实工作区**：装了 Filesystem 读写的是个看不见的隐藏目录（Memory 的 memory.jsonl 也放那，这个无所谓）。原版目录里也没有本地 Filesystem 连接器，而 bot 自带文件工具已覆盖。
     - A（推荐）：把 Filesystem 从 Hivebot picks 撤掉（T70 后改 picks.json 一行）。 B：`{workspace}` 改指该 bot 的真实工作区（要在 wrapper 生成时拿到 bot 工作区，多一条数据通路）。 C：照旧。
- 推荐：1=A，2=A，3=A（先查），4=A，5=A。这是盘点，你点头前不开单；T70 照常做。
- 答复：**2026-11-12 用户拍板全 A**（1=A 收二级 / 2=A 原版式文案 / 3=A 先 REA 查 / 4=A 随 2 改 / 5=A Filesystem 从 picks 撤）——待经理拆单（Q-055-3 先派 REA）。
- 落实（经理 2026-11-12 任务 A）：REA 已出 `grok-0.79.3-re/RE-CONNECTOR-GRANT-0.78.1.md`；拆为 T71（1+2+4）/ T72（5）/ T73a–d（3），见 queue.md「Q-055 落实」节；剩余品味项转 Q-056。

## Q-056 [open·不阻塞] 连接器审批卡与 Index sources 落点的几处文案 / 形态（按默认先做，你改口再跟）
- slug：ui-borders-connect ｜ 类型：品味 + 范围 ｜ 阻塞：不阻塞（T71 / T73c 按 A 施工）｜ 提出：2026-11-12（经理拆 Q-055）
- 背景：原版审批卡规格见 `grok-0.79.3-re/RE-CONNECTOR-GRANT-0.78.1.md` §2.2。原版文案里有「Team Bot」「your … account」，我们没有 Team Bot，内置连接器也都不用账号——逐字照搬会说假话。
  1. **Index sources 收到哪**：A（推荐）Connect 页「Installed」视图底部一个小钮（原版该页 front→manage 二级结构，离目录最近）。B 放进设置。C 整页删。
  2. **「Always allow」旁的下拉**（原版两项：这个 Bot / 每个 Team Bot）：A（推荐）不放下拉，主钮「Always allow」= 只对这个 bot。B 照原版放下拉、只剩一项。
  3. **卡上与回显文案**：A（推荐）去掉账号与 Team Bot 字样——标题「Allow {连接器}」；不放描述行；回显「Allowed {连接器} for your messages to this Bot.」/「Allowed {连接器} once」/「Skipped {连接器}」；设置行「Connector preferences · Clear」，确认框「Clear connector preferences?」+「Bots you always allowed to use your connectors will ask again the next time they need one.」。B 原版逐字。
  4. **「Allow once」管多久**：A（推荐，本轮）只放行这一次调用（dsh 原生，一条回复里连调几次会问几次——主钮默认就是 Always allow，影响小）。B 照原版「仅本条回复」：要多一条「这一轮已允许」的回传通路，单开一张单。
- 推荐：1=A，2=A，3=A，4=A。
- 答复：**2026-11-12 用户拍板全 A**（1=A Installed 页底 / 2+3=A 去假话 / 4=A 放行单次调用）。

## Q-057 [decided B·已落地] standing-grants「活卡」生命周期完整闭环——是否做 dsh 审批事件钩子
- slug：ui-borders-connect ｜ 类型：方案取舍 ｜ 提出：2026-11-12（Sol 复审中②，施工方回报）
- 现状：remember 合法窗=出卡后 90s 内（消费即清+新调用刷新）；「答完/拒绝/取消即失效」需要 dsh 审批服务事件对 SDK 插件面可见（现不可见，要动 dsh 侧或深挖 gateway 事件面）。
- 威胁模型：renderer 被注入时代答 remember 与直接点卡上的 Always allow 等价（同失陷面）；bot 自己写不进（硬 NEVER）。
- A：接受 90s 窗（默认，UI 卡即答即走，实际暴露面极小）  B：做 dsh 审批事件绑定（动面大，收益=防「答完后短窗内注入 remember」）
- **经理推荐 B（2026-11-12 T73b 终验）**：两个前提都不对。① 「动面大」不对：`approval/request` 是 dsh 现成的公开 waterfall（dsh-user-approval:201 触发并返回结局；dsh-sdk-jsonrpc-server:381、dsh-acp:1093 已经在挂钩），B 就是在 shell-ask 加一个中间件，约 10 行，不用改 dsh。② 「只剩拒绝侧」不对：三轮的 consume-on-approve 是死代码（dsh 批准后不回调中间件 next），现在**批准侧和拒绝侧都还有 90s 窗**。攻击面本身确实窄（renderer 已失陷时等于直接点卡上的 Always allow，同一失陷面），但「用户刚点了 Skip，注入代码在 90s 内把它翻成永久授权」违背用户明确意图，而修复成本很低。B 已写成 `tickets/open/T73b2-approval-outcome-consume.md`；你拍 A 的话就撤 T73b2，把 90s 记为残留随 T73b 走。
- **用户拍板 B（2026-11-12）→ 已落地**：T73b2（feat/T73b @ eb074a42 + b7906447 signal 两路补消费），经理终验通过 2026-11-12。
- 答复：

## Q-058 [open·不阻塞] bot 的「人格描述」要不要现在做
- slug：persona-stop-gap ｜ 类型：需求范围 ｜ 提出：2026-11-12（manager 任务 A，T80 立项）
- 现状：T80 只换全体 bot 的说话方式（像个人，不写报告）并让 bot 知道自己的名字。原版每个 bot 还有一句「描述」（0.18 `Agent profile` 的 `Description:` 行，决定它是谁、干什么、怎么说话；原版建 bot 对话框里没有这一栏，描述来自模板，或让 bot 自己改）。我们现在完全没有描述。
- A：先不做，等 T80 的语气效果看完再说（默认）
- B：照原版做：bot 能按你的话改自己的描述（「以后你说话像新闻主播」），描述写进系统提示
- C：B 再加一个手动入口（bot 信息栏里可编辑描述）——原版没有这个入口，属于自加
- **经理推荐 A**：用户最痛的是「一大堆文字」，T80 已经对准；描述是第二步，T80 验收后看语气还差不差再定。
- 答复：

## Q-059 [decided A] 会话头的「Stop」按钮要不要留
- slug：persona-stop-gap ｜ 类型：产品决策 ｜ 提出：2026-11-13（manager 任务 B，T81 终验）
- 现状：取证确认原版桌面文字聊天**没有停止按钮**（`work/persona-stop-gap/RE-STOP-0.78.1.md` §1）。原版叫停 bot 的方式是再发一条消息：正在跑的回合被打断，半截话留着，bot 马上回应你的新消息。我们的 Stop 按钮是自己加的，点了会直接杀掉整个进程、什么提示也不留，和原版体验不同。「发消息即打断」（T81a）不管怎么答都会先做。
- A：删掉 Stop 按钮，完全照原版（想让它停就发「停一下」）
- B：保留按钮，但改成和「发消息打断」同一种停法（只停这一轮、不杀进程），停完在对话里留一行「已停下」
- C：保留现状
- **经理推荐 A**：原版即规格；T81a 做完后，发一句话就能停，按钮是多余的入口，也是你说「体验完全不一样」的第一来源。担心失控时找不到急停的话选 B。
- 答复：A（2026-11-13 用户拍板，见 work/LOG.md 11-13 节）→ T81b / T81c 在 queue 2026-11-14 重排节第 4、5 序

## Q-060 [open·不阻塞] 每个 bot 自己选模型——保留（比原版多）还是照原版改成全局一个
- slug：grok-0.79.3-re ｜ 类型：品味 / 范围 ｜ 提出：2026-11-14（manager 任务 A，RE-UI-FACES §3.1 L176）
- 现状：取证确认原版**没有每个 bot 单独选模型**，模型只在全局设置里选一次（「Choose which AI model Grok Bot thinks with」）。我们 bot 信息栏里有 ModelPicker，每个 bot 能选不同的模型。原因是我们接多家模型提供方，原版只接自家。
- A：保留，记为「有意比原版多」（默认）
- B：照原版，去掉每 bot 选择，只留设置里的全局模型
- **经理推荐 A**：这是多提供方带来的真实需要，不是凭空加的；删了反而少能力。不阻塞任何单，你不回就按 A。
- 答复：

## Q-061 [open·不阻塞] bot 设置里的「Learnings」（bot 记住的东西要你审）要不要做、做到哪
- slug：grok-0.79.3-re ｜ 类型：需求范围 ｜ 提出：2026-11-14（manager 任务 A，RE-UI-FACES §3.1 L171、差距表 L193）
- 现状：原版 bot 设置是一个五页对话框（Tools / Skills / Learnings / Routines / Analytics）。其中 Learnings：bot 在聊天里学到关于你的事、或想新建 / 改一个技能时，先进「待审」，你逐条 Approve / Reject，或者一键让 bot 自己在聊天里带你过一遍。我们完全没有这一页，后端也没有「待审记忆」这个东西，要做得先设计存储和 bot 怎么提交。
- A：先不做，排在输入面 / 消息操作 / 动效之后（默认）
- B：先做五页对话框的空架子（Tools / Skills 两页把现有内容搬进去，Learnings 只放原版空态文案），记忆审阅以后再说
- C：完整做 Learnings：bot 提交记忆 → 待审 → 你批准后才生效
- **经理推荐 A**：你现在最常碰的是打字和消息操作，Learnings 只有 bot 会「学东西」以后才有用，而我们 bot 目前不会主动积累记忆；做 C 等于新开一条后端线。想先看到原版的样子选 B。
- 答复：

## Q-063 [open·不阻塞] 对齐目标版本：维持 0.78.1 基线，还是切到 1.1.0
- slug：grok-0.79.3-re ｜ 类型：需求范围 ｜ 提出：2026-11-15（manager 任务 A 轻量；材料 `work/grok-0.79.3-re/RE-UPSTREAM-TRACKER.md` §3 + 取证仓 `work/grok-1.1.0-re/`）
- **先说结论**：tracker 列的「P0 八项」大多**不是** 0.78.1 之后才有的东西。8 项里 5 项标注的版本 ≤0.78（本来就在我们的基线里），2 项的出处是 grok.com 网页端的 release notes（不是桌面版）。真正 0.78.1→1.1.0 新增的是团队化：Team Bots、Microsoft Teams、Slack 组织级、iMessage/Mac 应用、Review learnings、共享连接器、会议。1.1.0 主 chunk 新增的 535 条文案里，**没有一条**和语音/倍速/reaction/侧栏分区/多问题卡相关。
- 逐项（经理用两版 asar 做了字符串探针：`grep -rlF` 在 `deb0781` / `deb110` 的 renderer 里查）：

| # | 项 | 和 0.78.1 规格冲突吗 | 在途单受影响吗 |
|---|---|---|---|
| 1 | 审批卡三选一 | 不冲突：`Allow once` / `Always allow` 0.78.1 就有（两版命中一样） | 无。我们要是缺，算 0.78.1 差距，不算 1.x 项 |
| 2 | 语音通话重设计（倍速滑杆等） | 不冲突，属于真正的 1.x 新增，但我们没有语音面 | 无。1.1.0 主 chunk 文案里查不到 voice/speed，证据只到第三方文章 |
| 3 | 更新 UI（Restart to update） | 不冲突：0.78.1 就有这句 | 无（Hivebot 的更新走自己的发布链） |
| 4 | 消息操作进菜单（react/reply/copy） | **不冲突**：出处是网页端 09-19。0.78.1 桌面版**两处都有**：hover 笑脸钮（RE-UI-FACES §4 L210）+ More 菜单里的 Reactions 子菜单（L218）；1.1.0 里 `Add reaction`（键 9OEgyT）和 `Reactions` 都还在 | **T91 不受影响**，hover 钮就是 0.78.1 规格，1.1.0 也没删这句文案。菜单里的 Reactions 子菜单是 0.78.1 已有、我们还没做的部分（可在 T95 碰 More 菜单时顺手）。注意：文案还在不等于界面一定还在，要实锤得 diff 组件 |
| 5 | 视觉刷新（彩色聊天/字体/头像/居中） | 不冲突：0.59–0.78 的事，基线本来就包含 | 无 |
| 6 | 侧栏分区/拖拽 | 出处是网页端；桌面版没有证据；1.1.0 新文案里也没有 section | 无 |
| 7 | Pages | 不冲突：0.75.2 就有；1.1.0 只多了 Library 空态的一句说明 | 无（顶多改一句文案） |
| 8 | 多问题卡 | 不冲突：0.77.0 就有 | T40c 按 0.78.1 做，不受影响 |

- A：**维持 0.78.1 基线**，选择性吸收 1.x 改动。规则：每张单动到某个界面时，验收前花几分钟拿 1.1.0 asar 查一下这个界面的文案/组件；1.x 改了的，在这张单里一起跟上，或者记一张跟进单（默认）
- B：**切到 1.1.0 基线**：所有 RE 文档的锚点（字节偏移、i18n 键、参考图）按 1.1.0 重新取证，在途单按新规格重核
- **经理推荐 A**：1.x 主要多的是团队/企业功能，要靠 xAI/Cursor 的账号和团队后端，单人用的 Hivebot 接不上；个人用户能看到的那些（审批三选一、更新提示、消息菜单、Pages、多问题卡）0.78.1 已经有了。切 B 等于把 10 份 RE-*-0.78.1 文档和在途单全部重做一遍，换回来的是用不上的功能。只有语音一项是真正的个人向新东西，等你要做语音时再按 1.x 取证就行。另外 tracker §3 的分级要改：P0 表应该拆成「基线里已有（该补的差距）」和「真 1.x 新增」两栏，免得以后误读。
- 答复：**用户拍板 B=切 1.1.0 基线**（2026-11-15，推翻经理推荐 A）。执行顺序由经理规划：先 diff 0.78.1↔1.1.0 的 UI 面 delta 清单→已绿在途单不返工→新单按 1.1.0 锚。

## Q-064 [open·不阻塞施工探针] M1 白名单增行：session/delete（批量删除后端实底）
- slug：resume-c-polish ｜ 类型：契约（白名单增行须过契约问题，CONTRACT.md §2 表注 + m1-api/index.ts:11 注释「增行须过契约问题」） ｜ 提出：2026-11-17（主 agent 施工探针）
- **先说结论**：`session/delete` 是 ACP 标准方法（DeleteSessionRequest `{sessionId}` required，x-method session/delete；DSH asar SDK 方法表 14887182 处实证），非临时拼装。M1_ALLOW 现无此行（app/ui/main/m1-api/index.ts:12-42），shim deleteAgents 因此走 unknown-method → T96b Delete 门控回 undefined。**加行即可解锁**：① shim coordinator.ts 加 deleteAgents handler（逐个调 `session/delete`，实参 `{request:{sessionId}}` 按 typert 壳惯例）；② sidebar.tsx:75 恢复 onDeleteSelectedAgents 透传 + :85 恢复 onRequestDeleteAgent；③ T96b 门控 spec 改回正断言。
- **安全评估**：session/delete 删的是 dsh 会话（bots.json 里的 bot），非系统文件；D9 永拒层不涉（非 credentials/account/permission/configForms）。风险点：删除主 bot（mainBotId）后 meta 里 mainBotId 悬挂——shim 侧删后应同步清 meta（或拒绝删主 bot，0.18 原版语义待考）。
- **请拍板**：A. 加行 session/delete 并实装 deleteAgents（推荐——C 端用户预期「删掉的 bot 真的没了」）；B. 不加行，批量删除只做前端视觉移除（T41 hidden 已有，但语义是藏不是删）；C. 搁置。
- 探针证据：asar `grep -oaE "session/[a-z]+" | sort -u` 102 个方法名含 delete；DeleteSessionRequest schema required:["sessionId"]。

## Q-065 [open·不阻塞] DSH npm 版无 session/delete 路由——B1.A 已落软删
- slug：grok110-parity ｜ 类型：上游依赖缺口 ｜ 提出：2026-11-17（B1.A 施工实证）
- **实证**：app/sdk 依赖 @deepseek-ai/dsh@0.2.2-rc.1 的 HTTP 网关 `POST /api/session/delete` → **404 not found**（同 instance session/cancel → 200）；0.2.2-rc.3（npm 最新，11-13）同样 404，候选名 session/archive|remove|destroy|sessions/delete 全 404。探针：/tmp/probe-delete.mjs + /tmp/dsh-rc3-verify/probe2.mjs。
- **矛盾源**：Q-064 的「102 session/* 方法」证据来自本会话 GUI 跑的更新版 DSH（asar 字节实证）——该版本未发布到 npm。e2e/产品跑的是 npm rc 系列，无删除路由。
- **当前处置（已提交 c8e7d7e6）**：shim deleteAgents 改本地软删——running 先 session/cancel，archived 集 localStorage 持久（pbots.shim.archived-agents），loadRoster 过滤防复活；主 bot 过滤不可删。M1 session/delete 窄门保留，上游版本就绪即回硬删（届时删 archived 持久化层）。
- **待拍板**：无（记录性质）。上游 DSH npm 发布含 session/delete 的版本后，回头把软删切回硬删（一行实底改回 + 删 archived 基建）。

## Q-066 bot 设置面 Knowledge 区的 DSH 后端缺口（2026-11-18 B7 施工时提出）

1.1.0 bot-manage knowledge 区有 learnings 审批（listBotReviewItems/resolveBotReviewItem）与文件库（upload/listGrokBotUserStoreFiles，25MB/文件·200 文件·1GB 总）。B7 施工时六层探空（DSH asar/Tauri node_modules/extension/remote/M1_ALLOW）证实 **DSH 无 review-item、无 automation、无 bot 文件库 RPC**。当前实现：Learnings=skills 只读列表（同源 skills onBot，空态文案同款）、Routines=空态 onAsk（发消息让 bot 建）。若后续 DSH 补这些面（或接受 shim 层自建存档），真审批+文件上传可按 RE 报告（re-botmanage 题2/题7）实装。
