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
