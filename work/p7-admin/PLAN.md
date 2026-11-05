# p7-admin Implementation Plan · v1.1

> director 修订，6.1 Sol 代 Opus（用户指定）。本次只改计划和口径，不召回 F1/F2，不运行作者自己的闸门，不宣称实现/验收完成。按表执行 TDD 与独立验收。

**Goal**：和 Grok Bot 一个级别 + superagent/dsh 稍微打磨；管理四项、目标/定时最小闭环和自身进程恢复，不建设通用自主授权平台。

**Architecture**：dsh 唯一运行时、goal round-driver 唯一目标循环、schedule 唯一本地定时投递；复用 P6 身份/Assignment/delivery/安全信封/通知；SA 仅搬先存后做、Report、恢复说明。权限按原版分层，不建独立 Mandate 溯源体系、seal 协议、第二授权数据库或 supervisor 产品。

**Tech Stack**：本仓 Node/TypeScript/MJS、Electron、现有 React/shim、Vitest/Playwright；dsh 同代 `0.2.2-alpha.2`，不整代升级。

**Spec**：[BRIEF v2.4](BRIEF.md)。原34条逐一判定：**保留23 / 降级backlog 9 / 删除2**；首批活动任务23条。删行吸收必要行为不等于删除安全验收；文末保留全部原id去向。

## 1. 决策记录（用户简化令覆盖旧稿更重设计）

| 编号 | 选了什么 | 放弃什么 / 为什么 | 依据与确认状态 |
|---|---|---|---|
| K1 | REDUCE：原版级别 + SA/dsh最少胶水 | 不把Lauren式全交付平台当首批要求；长期职责/技能平台/事件/PR降backlog | 用户2026-11-05简化令；LEARNINGS「原版即规格」；旧[G1](panels/G1-r2.md)/[G2](panels/G2-r1.md)仅历史，未声称审过v1.1 |
| K2 / D-1 | **按RE定，panel确认即可不再问用户**：B方向——person-demand管理与background受托协调分开；goal/schedule只能沿既有委托与工具策略，不伪造person/source=user | 放弃A的独立Mandate全工具扩权、C结构化引擎替代driver；人类别名不能凭字符串授予权限；正文/回报不成为person | RE78 §1 COORD:930500/936594；`../p1-re/RE-features.md`「调度层」段（person/background demand）、`RE-ipc-rpc.md` §3；Q1与dsh authority.ts:75–117。person是RPC demand不是“后台等于人在场”的证据；本地自动续派为用户已要求的SA/dsh打磨 |
| K3 | authority仅原版分层 + 项目硬约束；H1为需批准档内一种校验，不是所有动作的全拒默认 | 删除逐动作逐范围原文token溯源、独立Mandate格式/数据库、三元组跨Mandate组合协议；不删除投毒/跨回合隔离反例 | RE78 §2 PLUG:44904–44990（用户指令称§4，现文件§4实际为删除回退）；`../p5-parity/RE-connector-grant.md` §③；`RE-approval-model.md` §1.4/§2.2。standing grants仅原版适用subject类，不扩成bash/插件万能grant |
| K4 / D-2 | **按RE定B′：Electron main拥有SDK，panel确认即可不再问用户** | 不选A′独立launcher作为生产owner，不加PM2/systemd；当前main不spawn属待改事实，不冒称已有 | RE78 §3 MAIN:2669140/3443434；R3核本仓适配，不重开拓扑偏好题 |
| K5 / D-4 | **按RE定，panel确认即可不再问用户；已选②不变**：人类回合建goal，schedule只投线索 | 不改dsh模型工具授权，不做blocked定时重试、不自动唤醒paused | Q1/Q2与dsh-tool-goal/lib/index.js:51,64；RE78 §5云routine仅作形状参照，本地用已装schedule |
| K6 | 管家四项复用archive/unarchive、install/setEnabled、现成撤销；F1在跑成果照验 | 不做物理purge、独立回收站页面、既有会话preset替换、新全局引用库；无证据不添加长期bot数量上限 | AR [A]–[K]/[N]；RE78 §1/§2/§4（回收站未证实≠不存在） |
| K7 | R1只查最小可信定时接缝；完整SB重构降backlog | 不为“允许自动派工”造seal/claim/wait/recovery协议；无可信归属则相应触发fail-closed且标blocked，不用全拒冒充成功 | Q2事实与G2时序反例继续保留；R1必须有正常合法成功证据才能开放对应自动触发 |
| K8 | 默认开放收进WL最后一步，保留P6-14b/独立验收/阶段出口 | 不再把已要求的自动续派变成U-3②重复授权；外部动作/自动合并仍需U-1 | 用户简化令与LEARNINGS；不以本次修改宣称默认链已开放 |

**panel交接**：以上为RE/用户指令驱动推荐，不伪造panel通过；主会话只需核对RE映射和本次砍单，行为题不再发用户。证据缺口交RE/scout，不用用户“确认”补事实。

## 2. REUSE索引（沿用原R-id，旧文冲突以本版为准）

| 行 | 首批复用途径 / 门槛 |
|---|---|
| R1 | AR[A][B][C]：M3/createWorkerBot、受限main通道、权威身份重验；只包当前消费者 |
| R2 | AR[D][E][F][I][J]：pluginMarket/installBundle/setEnabled；按RE分层代替“原consumer永禁”；HMR接缝由R3实测 |
| R3 | AR[G]：archive/unarchive + M3 restore；活动停止/roster由R3实测 |
| R4 | AR[N]、P6 ledger/delivery + SA stored work；F1一个jsonl兼操作记录/回执/撤销，不兼第二授权数据库 |
| R5 | Q1已挂goal/driver，P6 Assignment/report；复用现有委托/goal状态，不能再恢复独立Mandate任务 |
| R6 | Q2已挂schedule、every≥60、receipt仅inbox；不重复挂载或假称上游会跳过重叠 |
| R7 | R1只查最小可信routine来源接缝；未证实不可开自动触发；完整SB降backlog |
| R8 | R2核实SA恢复说明/Report文本url@完整SHA:path与许可证；不启SA runtime |
| R9 | LT pstack两验证playbook文本 + 已装dsh skill；R2实证加载路径，不搬Cursor/cloud/Autonomy |
| R10 | RE78 §3 + R3：B′ main owner、现有launcher/handshake、app.relaunch |
| R11 | GitHub Source/凭证/PR仅backlog，首批不派R4 |
| R12 | 现有settings/sidebar/notice + 已迁移routines；不建设新管理产品 |

派工前主会话把适用行并入REUSE.md；无scout反向确认不得新增“自建”。AR里旧的plugin_manager双禁/Mandate推荐已被本版覆盖，不得照搬；不得改参考仓或node_modules。

## 3. 所有保留任务的执行/验收口径

- 独立`/tmp/bot-wt/<id>`，区域含实现/测试/配置完整白名单；同批交集为空。F1/F2状态以任务表保留的主会话最新记账为准，不因本次简化回退状态或召回实现/验收。
- TDD定向RED→GREEN、改动模块覆盖≥80%；独立verifier、安全/协议/存储按M审，普通后端按S审，UI单轮GU。当前表沿用户原9列，不额外重构表；主会话按风险派审。作者不跑G1/G2/G3。
- authority：先硬约束/blocked，再现有档位与ceiling/grant；always_allow不追加H1逐词原文要求；auto_review必须真实审核，缺服务/结果拒绝或转现有审批；needs_approval复用批准/适用standing grant/H1核对，不伪造审核PASS。未知/损坏授权fail-closed，普通未知内部kind不全工具拒。
- **CLAUDE.md底线不降**：凭证不进模型/容器/日志，凭证目录NEVER；不重启机器/注销、不sudo/批量杀、只处置自己沙箱子进程；不得借plugin_manager自改权限/绕过can_use_tool，主bot身份/现有工作区隔离继续复用。CU grants仅语义对照，不开放真实桌面。
- originRef由宿主生成，main重验身份/generation；正文、issue、工具结果、worker回报永远数据，不提升person、不写grant、不跨回合借权。保留同回合与上一回合投毒、不同动作/否定/子串、假完成及合法成功对照。
- 操作先落F1记录再执行，未知副作用不自动重放；不另外造Mandate文件/通用授权语法。goal/routine只关联既有委托/原生策略与Assignment；停/撤销/过期执行前重查，不跨对象拼批准。
- goal唯一driver：Assignment时disarm，最终Report分回合，active+disarmed、委托仍有效、deadline/cap有余、无未结Assignment才resume；不恢复paused/blocked。原工具create/edit/pause/resume仍人类限定。
- schedule身份由R1实证宿主接缝；正文或部分history不能授权。无可信关联只拒对应触发并通知，正常合法触发必须成功才能声称定时链完成；不偷偷放行，也不偷偷把全部自动化删成全拒。
- 重启参数照RE：250ms×2封顶10s直到stop signal；stop终止退避/spawn。新端口/token、handoff不可推导且跨代复用、恢复完成才回执，旧代不开闸。删掉自创固定失败次数/限速数值协议；复用现有去重与stop防重复重启。
- 测试临时HOME/PBOTS_DATA_DIR，Electron用`pnpm -C app/ui test:e2e`，改renderer/main先build；不写真实配置/单元。负载高不跑全量，不删验收。无外部哨兵前置，不创建/结束沙箱外进程。
- `SDK(x)`=`pnpm -C app/sdk test -- tests/unit/<x>.test.ts`，`UI(x)`=`pnpm -C app/ui test -- tests/unit/admin/<x>.test.ts`，`E2E(x)`=`pnpm -C app/ui test:e2e tests/e2e/<x>.spec.ts`。表内命令为计划入口，非测试已通过。evidence含命令/退出码/RED-GREEN/head SHA。

## 4. 保留任务（23条；精确白名单继承v1）

| id | 任务 | owner | 区域（精确到文件） | deps | status | 捷径 | 验收（可证伪） | evidence |
|---|---|---|---|---|---|---|---|---|
| P7-F1 | **保留**：一个操作 jsonl：持久意图/审计/撤销/代际回执；恢复投影（实现与验收不变） | builder | `app/ui/main/admin/operations.ts`; `app/ui/tests/unit/admin/operations.test.ts` | R4已批准行 | done（模块范围：F1.f2独立行为/review/覆盖PASS，真三方合并6439f56后原57+独立19回测PASS，两文件字节一致；非生产管理旅程PASS） | R4：复用P6 ledger/delivery + SA先存后做；不新增授权数据库 | `UI(operations)`：append/flush失败→副作用0；同key并发仅1占位；尾行截断/版本未知/丢文件失败关闭；读回前后投影/undo；state unknown不变成功；凭证字段拒入账；覆盖≥80% | `evidence/P7-F1.txt` |
| P7-F2 | **保留**：原版分层复刻 + CLAUDE.md硬约束；来源与SDK→main受限桥（在跑不召回，调整验收口径） | builder | `app/sdk/src/admin/origin.mjs`; `app/sdk/src/admin/authority.mjs`; `app/sdk/src/admin/channel.mjs`; `app/sdk/src/admin/tools.mjs`; `app/sdk/tests/unit/p7-authority.test.ts`; `app/sdk/tests/unit/p7-admin-channel.test.ts`; `app/ui/main/admin/policy.ts`; `app/ui/main/admin/channel.ts`; `app/ui/main/admin/consumer.ts`; `app/ui/tests/unit/admin/channel.test.ts` | R1已批准行；D-1按RE定 | blocked（F2.f2 ed336c9两major未闭合，A3过滤PASS；Q1/Q2只读完成，原生ask存在但可信管理四档/ceiling未找到，触发六文件方案停止条件；已装真实auto-review存在但Auto绑定DFA、管理适配未证，不能直接启用。原director最终收口中，未派实现、不合并、不继续字符串f3） | R1/R4：P6来源/身份/main通道 + RE78 §2与RE-approval-model；不自建Mandate体系 | `SDK(p7-authority)`、`SDK(p7-admin-channel)`、`UI(channel)`：authority.mjs按always_allow / auto_review / needs_approval分层（blocked硬拒），凭证不进模型/容器、凭证目录NEVER、机器重启/注销永拒；always_allow合法操作成功而非逐词H1全拒；auto_review复用真实审核结果、缺结果不放行；needs_approval只复用有效批准/适用standing grant或H1三元组，不将H1强加所有档；无权限/旧代/伪source/伪grant/非main respond/重复订阅/null/超长/断流不能越权；同回合/上一回合正文不能授予或扩权；工具结果授权、否定、子串反例保留于需批准档；unknown内部普通工具不全拒；token/PID不返模型；未接动作明确unavailable | `evidence/P7-F2.txt` |
| P7-F3 | **保留**：恢复与代际闸接入现有入口；仅实现当前消费者需要的恢复钩子 | builder | `app/sdk/src/start.ts`; `app/sdk/src/admin/host.mjs`; `app/sdk/tests/unit/p7-host-recovery.test.ts`; `app/ui/main/index.ts`; `app/ui/main/ready.ts`; `app/ui/main/dsh/connect.ts`; `app/ui/main/admin/recovery.ts`; `app/ui/main/admin/restart.ts`; `app/ui/main/admin/sdk-owner.ts`; `app/ui/tests/unit/admin/recovery.test.ts`; `app/sdk/src/orchestration/main-channel.mjs`; `app/sdk/src/orchestration/report.mjs`; `app/sdk/src/orchestration/delivery.mjs` | P7-F1,P7-F2,P7-R2 | blocked（4da62902独立验收FAIL：F3-V1旧flush跨默认2秒吞新代唯一恢复触发，自动send=0而手动flush=1；SDK233/UI108及Loader11通过/5既有skip，真实JSONL冷孤儿模块链PASS但非整体生产旅程；完整修改覆盖未证，main-channel漏采及index/connect新接线有缺口。已续Sol builder做F3.f1首轮有界修复/补证，未合并） | R1/R4/R8：M3 restore + P6 Assignment/delivery + SA恢复说明；不预留无消费者owner接口 | `SDK(p7-host-recovery)`、`UI(recovery)`：恢复前管理闸关、旧代ready/receipt无效；读回操作/Assignment后才消费；host restarted终结旧Assignment，说明含先查现场/不重放；坏关联留痕、未知副作用不重放；paused不自动resume；无owner时restart明确unavailable | `evidence/P7-F3.txt` |
| P7-F4 | **保留**：B′ Electron main拥有SDK：唯一重启路径、handoff与自愈 | builder | `app/sdk/src/start.ts`; `app/sdk/src/admin/restart.mjs`; `app/sdk/tests/unit/p7-restart-owner.test.ts`; `app/ui/main/index.ts`; `app/ui/main/admin/sdk-owner.ts`; `app/ui/main/admin/restart.ts`; `app/ui/tests/unit/admin/restart.test.ts` | P7-F3,P7-R3；D-2按RE定B′、panel确认即可不再问用户 | todo | R10/R4：RE78 §3 MAIN:2669140/3443434；现有launcher + Electron app.relaunch，不加监督器 | `SDK(p7-restart-owner)`、`UI(restart)`：main持有SDK子树；250ms×2封顶10s until-signal，stop终止重试；请求先落盘、restore后才完成；新port/token、不可推导handoff跨代复用、旧代信号拒；不返token/PID；非owner目标0信号；明确启动失败/停止状态，不自创5次失败永久停机与3次/60秒产品协议 | `evidence/P7-F4.txt` |
| P7-L2 | **保留**：单goal循环：Assignment时disarm，最终Report分回合re-arm，恢复续派 | builder | `app/sdk/src/admin/goal-lifecycle.mjs`; `app/sdk/src/orchestration/create.mjs`; `app/sdk/src/orchestration/send.mjs`; `app/sdk/src/orchestration/report.mjs`; `app/sdk/src/orchestration/delivery.mjs`; `app/sdk/tests/unit/p7-goal-lifecycle.test.ts` | P7-F3；D-1按RE定；P6对应文件任务先合并 | todo | R5/R8：dsh唯一driver + P6 Assignment/report；复用宿主受托状态/原生权限，不造Mandate引擎 | `SDK(p7-goal-lifecycle)`：worker期间新增goal round=0；最终回报与goal分回合；宿主active+disarmed、未过deadline/cap且无未结Assignment才re-arm；revision+1可续派1；paused/blocked/撤销委托拒；重复report/reconnect只续派1；回报正文不变person来源，不授予管理/区外权限；P6 D9⑨保持绿 | `evidence/P7-L2.txt` |
| P7-L3 | **保留**：routine管理与最小可信来源绑定、重叠skip、结果投影（不建SB封存协议） | builder | `app/sdk/src/admin/routines.mjs`; `app/sdk/tests/unit/p7-routines.test.ts`; `app/ui/main/admin/routines.ts`; `app/ui/tests/unit/admin/routines.test.ts` | P7-F3,P7-R1；最小接缝决策行齐全 | todo | R6/R7：已装schedule + 原生授权 + P6 Assignment/操作记录；身份来自宿主而非正文 | `SDK(p7-routines)`、`UI(routines)`：人类建/列/暂停/删、every≥60；正常可信触发合法派工1；来源不能对应routine则该触发0并通知，不凭正文/部分history补授权；忙A=0+skip、闲B=1（可安全区分时）；撤销/暂停后旧投递0；回执仅inbox；重启保留/离线补最近1次；schedule create_goal/resume仍拒。R1若证明只能靠SB重构才能安全准入，只阻塞相应自动触发并回报，不以全拒宣称定时链完成 | `evidence/P7-L3.txt` |
| P7-L4 | **保留**：文字/按钮共用stop：停止Assignment、暂停goal/routine、挡旧投递 | builder | `app/sdk/src/admin/stop.mjs`; `app/sdk/tests/unit/p7-stop.test.ts`; `app/ui/main/admin/stop.ts`; `app/ui/tests/unit/admin/stop.test.ts` | P7-L2；routine消费者接入P7-L3后补格 | todo | R5/R6/R1：dsh pause/abort + P6 stop_bot + F1停止记录 | `SDK(p7-stop)`、`UI(stop)`：先持久暂停/撤销准入再stop；部分stop失败不重开准入；文字/按钮结果同；假钟两周期无新副作用，旧投递到达仍派工0；恢复不唤醒paused；真周期综合验收归V2 | `evidence/P7-L4.txt` |
| P7-L5 | **保留**：只搬验证技能两份playbook，fixture能真跑好/坏仓 | builder | `app/sdk/profile/skills/create-verification-skill/SKILL.md`; `app/sdk/profile/skills/maintain-verification-skill/SKILL.md`; `app/sdk/tests/unit/p7-verification-skill.test.ts`; `app/sdk/tests/fixtures/p7-verification/package.json`; `app/sdk/tests/fixtures/p7-verification/check.mjs`; `app/sdk/tests/fixtures/p7-verification/FEATURES.md` | P7-R2；执行者跟随P6 §12.3 | todo | R9/R8：pstack两份文本 + dsh现有skill加载；不造技能生命周期平台 | `SDK(p7-verification-skill)`：launch→doctor→drive→evidence→cleanup走通；注入回归同技能FAIL；未跑通不称可用；Feature Map不能掩盖FAIL；来源与安全cleanup断言；挂载路径必须R2实证，额外接线先回写白名单 | `evidence/P7-L5.txt`; `evidence/P7-L5-run.json` |
| P7-L6 | **保留**：最小运行摘要：receipt / 模型声明 / 已验证分开 | builder | `app/ui/main/admin/runs.ts`; `app/ui/tests/unit/admin/runs.test.ts` | P7-F1,P7-F3,P7-L5 | todo | R4/R5：SA Report + P6受限证据读取；不新造签名/证明系统 | `UI(runs)`：可信执行者退出码0且受限工作区证据存在才verified；模型自报路径/退出码/complete不得假绿；轮数/blocked原因/goal与routine归属可查；缺文件/坏记录留失败，不越工作区 | `evidence/P7-L6.txt` |
| P7-M1 | **保留**：长期bot建/改名模型prompt/归档恢复；不做既有会话preset替换 | builder | `app/ui/main/admin/bots.ts`; `app/ui/tests/unit/admin/bots.test.ts` | P7-F1,P7-F2,P7-F3,P7-R3 | todo | R1/R3：M3身份/工作区 + session-controller/archive/unarchive + F1；保留现成撤销 | `UI(bots)`：建后独立workspace/roster/记录；按原权限档合法操作成功；改名/model/prompt可还原；归档停止活动留结果、恢复历史不丢、共用recipe不坏；主bot保护复用现有身份边界；越界cwd/权限提升拒；不新增16个长期bot产品上限；既有会话preset变更明确不支持并引导新建 | `evidence/P7-M1.txt` |
| P7-M3 | **保留**：按原版plugin_manager语义接市场装卸与热reload；不另造更重管理权限面 | builder | `app/ui/main/admin/plugins.ts`; `app/ui/tests/unit/admin/plugins.test.ts` | P7-F1,P7-F2,P7-F3,P7-R3 | todo | R2：pluginMarket/installBundle/setBundleEnabled + RE78 §2写序锁/reload；权限复用F2 | `UI(plugins)`：规范目录安装→工具出现、禁用消失、撤销恢复；同插件写串行、写后优先reload，restart-required才走F4或明确待处理；always_allow / auto_review / needs_approval / blocked各有正反例；非目录/版本豁免/构建授权/密钥输入不偷放；凭证与权限自提升硬拒；失败留application/error/restartReason，不未知重放；引用/保护检查复用现有数据，不自建全局引用数据库 | `evidence/P7-M3.txt` |
| P7-U1 | **保留**：现有设置/通知内显示管理记录与现成撤销/恢复入口 | frontend-dev | `app/ui/renderer-grok/shim/src/admin.ts`; `app/ui/renderer-grok/overrides/modules/admin-view.tsx`; `app/ui/renderer-grok/overrides/modules/admin-view.css`; `app/ui/renderer-grok/overrides/modules/settings-view.tsx`; `app/ui/renderer-grok/overrides/modules/sidebar.tsx`; `app/ui/tests/unit/grok-shim/p7-admin.test.ts`; `app/ui/tests/e2e/p7-admin.spec.ts` | P7-F1,P7-F2,P7-F3；M服务fixture可先行 | todo | R12/R1/R3：复用settings/sidebar/notice与F1；不建独立回收站产品 | `pnpm -C app/ui test -- tests/unit/grok-shim/p7-admin.test.ts`、`E2E(p7-admin)`：谁/何时/来源/结果/可用撤销可见；撤销真正改变投影、失败不假成功；恢复不丢历史；重启记录仍在、键盘可达；不要求独立已删除页面或自创审批卡；WM接线后复跑 | `evidence/P7-U1.txt`; `evidence/P7-U1.png` |
| P7-U2 | **保留**：复用原版routines列表/编辑/开关与执行状态 | frontend-dev | `app/ui/renderer-grok/shim/src/routines.ts`; `app/ui/renderer-grok/frontend/src/recovered/features/automations/routines/controller.ts`; `app/ui/renderer-grok/frontend/src/recovered/features/automations/routines/view.tsx`; `app/ui/renderer-grok/frontend/src/recovered/features/automations/routines/view.css`; `app/ui/renderer-grok/frontend/src/recovered/features/automations/routines/run-history-provider.ts`; `app/ui/tests/unit/grok-shim/p7-routines.test.ts`; `app/ui/tests/e2e/p7-routines.spec.ts` | P7-L3 | todo | R12/R6：已移植G18组件 + RE78 §5 + dsh schedule | `pnpm -C app/ui test -- tests/unit/grok-shim/p7-routines.test.ts`、`E2E(p7-routines)`：真实schedule可编辑、60s边界；receipt不显示业务成功；skip/失败/无法可信准入可见；暂停/删除后旧投递派工0；不为backlog的seal/timeout协议另建UI | `evidence/P7-U2.txt`; `evidence/P7-U2.png` |
| P7-U3 | **保留**：复用任务通知显示摘要/证据/轮数/blocked与停止 | frontend-dev | `app/ui/renderer-grok/shim/src/runs.ts`; `app/ui/renderer-grok/overrides/modules/run-summary.tsx`; `app/ui/renderer-grok/overrides/modules/run-summary.css`; `app/ui/renderer-grok/overrides/modules/notice-view.tsx`; `app/ui/tests/unit/grok-shim/p7-runs.test.ts`; `app/ui/tests/e2e/p7-runs.spec.ts` | P7-L4,P7-L6 | todo | R12/R4/R5：P6 notice/需要你处理 + main结果投影 | `pnpm -C app/ui test -- tests/unit/grok-shim/p7-runs.test.ts`、`E2E(p7-runs)`：verified与模型声明分明；证据/卡点/轮数可查；按钮和文字stop同入口；坏数据/断流不假完成，paused不自动恢复 | `evidence/P7-U3.txt`; `evidence/P7-U3.png` |
| P7-WM | **保留**：管理链真实接线；以分层策略替代plugin_manager整工具双禁 | builder | `app/ui/main/admin/consumer.ts`; `app/ui/main/admin/ipc.ts`; `app/ui/preload/index.ts`; `app/ui/renderer-grok/shim/src/index.ts`; `app/ui/renderer-grok/shim/src/data.ts`; `app/ui/renderer-grok/shim/src/coordinator.ts`; `app/sdk/src/admin/tools.mjs`; `app/sdk/profile/patches/p7-admin.yml`; `app/ui/tests/unit/admin/management-wiring.test.ts`; `app/sdk/src/policy/guard.mjs`; `app/sdk/tests/unit/p7-plugin-policy.test.ts` | P7-F3,P7-M1,P7-M3,P7-U1 | todo | R1/R2/R3/R12：F2桥 + 原plugin-manager服务；受控开发patch先验证，不旁路can_use_tool | `UI(management-wiring)` + `E2E(p7-admin)`：真实建改归档装卸成功；已允许操作不新增p7卡，需批准档走现有审批/需要你处理；原plugin_manager按动作分层而非整工具默认全拒；伪origin/旧代/凭证/权限提升拒；IPC只查询/stop/特定undo，不给任意main动作；无owner时重启明确拒；P5既有全拒测试须同步按新分层矩阵改，不能直接删安全反例 | `evidence/P7-WM.txt` |
| P7-WG | **保留**：目标链生产接线：goal/change、Assignment/report、核验与stop | builder | `app/sdk/src/orchestration/index.mjs`; `app/sdk/src/orchestration/main-channel.mjs`; `app/sdk/src/admin/host.mjs`; `app/sdk/profile/patches/p7-admin.yml`; `app/ui/main/admin/consumer.ts`; `app/ui/main/admin/ipc.ts`; `app/ui/preload/index.ts`; `app/ui/renderer-grok/shim/src/index.ts`; `app/ui/renderer-grok/shim/src/data.ts`; `app/ui/renderer-grok/shim/src/coordinator.ts`; `app/sdk/tests/unit/p7-goal-wiring.test.ts`; `app/ui/tests/unit/admin/goal-wiring.test.ts` | P7-WM,P7-L2,P7-L4,P7-L5,P7-L6,P7-U3 | todo | R5/R8/R9/R12：既有driver + P6回报/身份 + F3恢复 | `SDK(p7-goal-wiring)`、`UI(goal-wiring)`、`E2E(p7-runs)`：真实目标入口派工→回报→核验→续派/完成；恢复仅active重arm；授权缺失拒、合法受托成功；正文不变person；不依SB；显式patch验证，不额外要求U-3②授权问题 | `evidence/P7-WG.txt` |
| P7-WL | **保留**：定时链接线与默认配置收口（吸收原P7-OPEN） | builder | `app/sdk/src/orchestration/index.mjs`; `app/sdk/src/orchestration/main-channel.mjs`; `app/sdk/src/admin/host.mjs`; `app/sdk/profile/patches/p7-admin.yml`; `app/ui/main/admin/consumer.ts`; `app/ui/main/admin/ipc.ts`; `app/ui/preload/index.ts`; `app/ui/renderer-grok/shim/src/index.ts`; `app/ui/renderer-grok/shim/src/data.ts`; `app/ui/renderer-grok/shim/src/coordinator.ts`; `app/ui/tests/unit/admin/loop-wiring.test.ts`; `app/sdk/tests/unit/p7-loop-wiring.test.ts`; `app/sdk/profile/patches/approval.yml`; `app/sdk/tests/unit/p7-default-gate.test.ts` | P7-WG,P7-L3,P7-U2；默认开放需P7-V1/P7-V2/P7-V3及P6-14b done | todo | R5/R6/R7/R12：schedule实际来源接缝 + 原生分层，不建第二调度器 | `SDK(p7-loop-wiring)`、`UI(loop-wiring)` + `E2E(p7-routines)`、`E2E(p7-runs)`：真实定时合法派工1；伪正文id/撤销/旧代0；恢复先于消费；schedule不建goal；无空成功stub。先开发patch验V1–V3，三项独立PASS后才改默认approval.yml并跑`SDK(p7-default-gate)`；P6-14b未done则默认不开；此开放子步骤不作为V1–V3的循环依赖 | `evidence/P7-WL.txt`; `evidence/P7-S1.json` |
| P7-V1 | **保留**：管理分层成功/拒绝、跨回合正文隔离、投毒与撤销综合验收 | builder | `app/ui/tests/unit/admin/management-matrix.test.ts`; `app/ui/tests/e2e/p7-management-matrix.spec.ts`; `app/sdk/tests/unit/p7-management-origin.test.ts` | P7-WM；定时补格在P7-WL开发接线后补齐 | todo | R1–R4：复用管理服务与P6来源/污染fixture；不加产品模块 | `UI(management-matrix)`、`SDK(p7-management-origin)`、`E2E(p7-management-matrix)`：按BRIEF M7来源/禁区矩阵；always_allow合法成功，auto_review拒绝/不可用不偷放，needs_approval/grant正反例与blocked全拒；同回合issue、上一回合回报、同目标异动作、否定、子串不能伪造授权/扩权；M8逐投影diff空；不得把所有正常操作0执行当安全通过 | `evidence/P7-V1.txt`; `evidence/P7-M7.json`; `evidence/P7-M8-diff.json` |
| P7-V2 | **保留**：两链确定性闭环/投毒/真实停止 + 最小真模型自用烟测 | builder | `app/sdk/tests/unit/p7-loop-integration.test.ts`; `app/sdk/tests/e2e/p7-loop-live.test.ts`; `app/ui/tests/e2e/p7-stop.spec.ts` | P7-WL开发接线；P6-24实现、P6 §12.3明确 | todo | R5/R6/R9：fake模型+dsh/P6现成链；吸收V4首批必需烟测，不造评测平台 | `SDK(p7-loop-integration)`、`pnpm -C app/sdk test -- tests/e2e/p7-loop-live.test.ts`、`E2E(p7-stop)`：目标/定时各1条合法完整链；回报与goal分回合、跨回合投毒/同目标异动作/正文扩权/假完成反例及P6 D9⑨；文字/按钮各≥120s与两周期新副作用0，旧排队到达仍0派工；技能好仓PASS坏仓FAIL；真模型目标/定时各1次，并在用户指定真实仓自用1次（clone/迁入工作区，不越界）；失败明确blocked不可挑绿，未给真实仓只阻塞该项 | `evidence/P7-V2.txt`; `evidence/P7-L-trace.json` |
| P7-V3 | **保留**：真实owner重启/恢复/不重放的最小集成探针 | builder | `app/sdk/tests/e2e/p7-restart-live.test.ts`; `app/ui/tests/e2e/p7-restart.spec.ts` | P7-F4,P7-WG；routine恢复补格在WL开发接线后 | todo | R10/R4/R5/R6：只用测试自spawn沙箱子进程；不要求用户预置外部哨兵 | `pnpm -C app/sdk test -- tests/e2e/p7-restart-live.test.ts`、`E2E(p7-restart)`：自身SDK child崩溃后按原版退避拉起；新port/token、handoff跨代、restore前闸关、旧信号拒；goal合法续派1；副作用发生后回执前crash不重放（计数1）；非owner目标0信号、stop后0spawn；token零泄漏；不操作沙箱外进程、不重启机器 | `evidence/P7-V3.txt`; `evidence/P7-M6.json` |
| P7-R1 | **保留**：查schedule最小可信来源/逐routine接缝，不做完整seal持久化系统 | scout | `work/p7-admin/reuse/q2b-authorization-bridge.md`; `work/p7-admin/evidence/P7-R1-probe.mjs`; `work/p7-admin/evidence/P7-R1.txt` | Q2已读；只读已装制品、临时HOME | done（限定调研：正常schedule投递与提交后归属成功；claim早于receipt、合批部分history/删除旧inbox反例已证，安全自动准入未证实，L3/WL相应触发仍blocked；未产出reuse Markdown） | R6→R7：优先已有source/message/history与原生授权接口；完整SB方案降backlog | 给固定源码锚点+最小probe：正常投递可否可靠对应routine、合批能否区分、暂停/重启/未结Assignment怎么处理；正文伪id与部分history不得授予权限；能否直接复用现成接缝（不预设可行）；不能可靠区分就明确阻塞相应自动触发，不新建seal协议；产出REUSE决策行与必要白名单 | `reuse/q2b-authorization-bridge.md`; `evidence/P7-R1.txt` |
| P7-R2 | **保留**：只查首批SA恢复/Report文本与验证技能挂载 | scout | `work/p7-admin/reuse/sa-skill-adapters.md`; `work/p7-admin/evidence/P7-R2-probe.mjs`; `work/p7-admin/evidence/P7-R2.txt` | AR/Q1/Q2/LT已读 | done（限定调研与14项探针；F3前置齐，L5缺口保留） | R8/R9：本地SA与pstack参考仓只读；Source/Merging/技能生命周期不在首批 | 列stored work/Restart/Report及两验证playbook的url@完整SHA:path、许可证、最小适配量；实证dsh skill目录/加载与P6执行者接口；不扩查GitHub Source/PR/通用技能平台 | `reuse/sa-skill-adapters.md`; `evidence/P7-R2.txt` |
| P7-R3 | **保留**：目标宿主archive/HMR/保护查询与B′ main启动最小适配 | scout | `work/p7-admin/reuse/host-management-probes.md`; `work/p7-admin/evidence/P7-R3-probe.mjs`; `work/p7-admin/evidence/P7-R3.txt` | AR与RE78已读；临时数据/HOME | done（限定底座调研：第7次探针27项exit0；原版删除终端语义交R3.RE，不解锁P6-24，不等于产品完成；reuse Markdown未产出） | R2/R3/R10：本仓真实宿主 + RE78 §2/§3；不是再问用户owner选型 | 实测archive活动/roster通知、plugin HMR与restart-required；列已有保护/引用查询接口，无则给最小包装不加全局库；B′ main→launcher→SDK在目标宿主怎么boot，交接env/路径/代际握手文件差异；不读凭证、不结束外部进程；给REUSE行，不重开A′/B′用户题 | `reuse/host-management-probes.md`; `evidence/P7-R3.txt` |

### 4.1 补充修复与窄题（不增加首批23项产品范围）

| id | 区域 / 复用 | status | 验收与证据 |
|---|---|---|---|
| P7-F1.f2 | 仅 `app/ui/main/admin/operations.ts`、`app/ui/tests/unit/admin/operations.test.ts`；沿F1/R4修现有账本，不加存储层 | done（d8765b6独立B1/B2行为/review/覆盖PASS；全文件89.13/87.04/97.29/94.71%、修改分支14/15；真三方6439f56合并后57+19回测PASS；历史FAIL保留，仅模块范围） | B1首笔真实append后sync失败须失败关闭，不能同key新ID双占位/finish LOST/恢复错指；B2 close永久停用旧写者，覆盖排队/在途与锁移交，不只idle guard。先RED/GREEN，改动覆盖≥80%，独立验收；报告 `evidence/P7-F1f2/REPORT.txt`，来源 `evidence/review-e5ff286/B-REVIEW.txt` |
| P7-F2.f2 | 仅 `app/sdk/src/admin/authority.mjs`、`app/sdk/tests/unit/p7-authority.test.ts`、`app/ui/main/admin/consumer.ts`、`app/ui/tests/unit/admin/channel.test.ts`；沿F2/R1/R4修现有校验与过滤，不造Mandate引擎 | blocked（ed336c9独立验收FAIL：C1引号跨子句借参数、C2 and/then动作目标交叉授权；A3桥过滤PASS，76/25回归及覆盖绿不替代反例；修复轮次已达上限，交Sol代director收窄重规划，不直接派f3，未合并） | A1 H1批准Alice不能放行Mallory及额外model/prompt/cwd；A2安装X/停用Y不能授权停用X，保留合法动作目标成功；A3 error.details与value等价过滤token/PID，实际main→SDK桥用合成数据复验。先RED/GREEN、改动覆盖≥80%、独立验收；不得全拒假绿或声称真实凭证泄漏；来源 `evidence/review-e5ff286/A-REVIEW.txt` |
| P7-F3.f1 | 继承F3已批准13文件，仅当前消费者；优先 `app/sdk/src/orchestration/report.mjs` 与 `app/sdk/tests/unit/p7-host-recovery.test.ts`；覆盖探针/报告仅 `evidence/P7-F3/f1-*`，不改原独立证据、不新增依赖/入口 | running（2026-11-05 10:33续原Sol builder，独立P7-F3@4da62902，第一轮修复；待新SHA与独立验收） | [FIX] F3恢复许可更新时Reporter丢失新代唯一reconcile触发：旧readLog挂起→新prepare/complete→过默认2秒→放旧读，自动send应恰1、旧代0；保留手动正对照与取消/stop反例。另补官方修改S/B/F/L各≥80%证据，main-channel漏采与index/connect新接线不得删项凑绿。来源 `evidence/P7-F3/VERIFY.txt:65–67`；超白名单停报 |
| P7-R3.RE | 原版0.78.1只读取证；`evidence/P7-R3-RE-delete.txt`；不改产品 | 部分可证后停止（静态请求/客户端边界已回报；存储终态及终端保护UNKNOWN，不能解锁P6-24；raw.json/rea.json有，报告TXT未生成） | 仅删除终端、server/mirror历史附件cwd边界、main/createdBy worker/subagent保护停止与晚到消息；不可见云端明确unknown。R3底座归档不冒充原版完整删除，P6-24继续blocked |

## 5. 最小波次与出口

| 波次 | 任务 / 局部前提 |
|---|---|
| W0 | F1/F2按任务表当前修复/验收状态继续，不召回；R1/R2/R3可按额度并行，R4不派 |
| W1 | F1/F2/R2齐→F3；只同文件冲突排队 |
| W2 | L2、L5、M1、M3、U1按deps分批；F4在R3齐后侧线，B′已推荐不等用户 |
| W3 | L3、L4、L6；U2/U3各等消费者；WM在M1/M3/U1齐后接线，不等SB或M2 |
| W4 | WM→WG→WL开发接线串行（共享consumer/IPC/preload/shim/patch）；V1非定时格可先，V3在F4/WG后侧线 |
| W5 | V1补定时格、V2两链/真周期/最小自用、V3补routine恢复；测试文件不交可并行，真模型独占额度 |
| W6 | 三项独立验收及P6-14b齐后，WL最后一步才收默认配置；合并后回归与阶段review由主会话负责 |

**DONE映射**：S1/S2→F3/L5/WL；L1/L2→L2/WG/V2/V3；L3→L4/U3/V2；L4→R1/L3/U2/WL/V2；L5/L6→L5/L6/U3/V2；M1–M3→M1/WM/U1/V1（既有preset替换除外）；M4/M5→M3/WM/V1；M6→F4/V3；M7/M8→F1/F2/V1。B/C、独立SB协议与多次模型基准不在首批出口。

7a出口必须有管理四项、目标链与定时链合法成功、跨回合/投毒反例、停止与恢复证据，独立verifier PASS和阶段审查；head变更旧证据重验。R1若不能提供最小可信路径，定时自动执行明确blocked交主会话，不靠文档宣称删掉或完成。真实仓未给只阻塞V2该项。U-1仅未来远端自动合并开工前问，不影响本地首批。

## 6. 待查 / 按RE定清单

1. **D-1 / D-2 / D-4**：答案见K2/K4/K5，统一“按RE定，panel确认即可不再问用户”；不再合成U-3②授权题。panel只核RE/本地适配是否一致，不代用户授权真实桌面/远端。
2. **D-3**：原会话preset select首轮锁定是已装dsh事实（AR[B][C]）；遵守锁定，新会话替换功能降backlog，不问用户是否修改CONTRACT放宽锁定。
3. **R1/R2/R3**：只查保留表内问题；不主动扩成完整SB/Source/技能平台。缺外部事实由scout/RE补，不把未知写成“原版没有”。
4. **U-*清理**：U-3①转按RE分层/原生审批与凭证硬约束；U-3②转D-1原版person/background对照 + 已有自动续派需求；U-2中的删除/本机运行按RE+dsh既有行为，GitHub首事件范围只留backlog。仅U-1远端自动合并授权、未指定真实仓等真正需求/外部动作待用户。
5. **F2口径变更通知主会话**：不召回在跑实现；验收按本行，不以“所有动作缺Mandate默认拒绝”判PASS，也不为满足旧测试追加Mandate。若已有代码重了，保留可用来源桥/硬约束，按新矩阵简化后独立验收。

## 7. 修订账

| 版本 | 改动 | 依据 / 审批状态 |
|---|---|---|
| v1 | 原34任务、9波次、独立Mandate/SB与7b/7c全宽计划 | 旧BRIEF v2.3；原panel记录仅覆盖旧设计 |
| **v1.1 · 2026-11-05** | 用户简化令：原版即规格；逐行23保留/9降级/2删除；F2 authority降为原版分层+硬约束、H1仅档内校验；D-1推荐B方向person-demand对照、D-2 B′、D-4②不变，panel确认不再问用户；砍独立Mandate/SB协议与非首批宽度；跨回合/投毒验收不删；F1/F2不召回 | 用户本轮明确指令；LEARNINGS「原版即规格」；RE78 §1/§2/§3，p5 RE-approval-model/RE-connector-grant，Q1/Q2。待主会话确认RE映射/砍单；未代跑闸门 |

## 8. 文末backlog与删除清单（不计活动23条，不得自动派工）

| 原id | 三档判定 | 去向 / 砍单理由 | 重开条件 |
|---|---|---|---|
| P7-SB | 降级backlog | 完整seal/claim/10s等待/崩溃关联授权协议超出原版粒度；首批L3仅最小可信绑定，安全反例保留 | R1证明确需、无法复用最小接缝后另给代价与范围，不自动复活 |
| P7-M2 | 降级backlog | 开始后preset/连接器新会话替换、双活回滚为非首批宽度；按原锁定/现有新建路径 | 用户真遇该编辑需求 |
| P7-V4 | 降级backlog | 两链各3次≥2完成的基准采集非首批必需；V2吸收两链各1次与真实仓1次，不删除真实使用证明 | 首批稳定后有可靠性统计需求 |
| P7-B1 | 降级backlog | 长期职责/park专用状态与UI超首批 | 用户允许7b且常用职责出现 |
| P7-B2 | 降级backlog | 技能版本/回滚/维护routine是平台化；首批只搬两验证playbook | 两份playbook不足且有实际升级需求 |
| P7-B3 | 降级backlog | GitHub issue Source/游标/triage是第二事件入口 | 定时/目标已可用且用户要求事件驱动 |
| P7-C1 | 降级backlog | PR babysit/CI修复状态机非Grok级首批 | 需要真实远端交付且U-1授权 |
| P7-C2 | 降级backlog | 自动合并不因本地自主管理需求自动获准 | U-1明确repo/队列/账号/规模/外部动作授权 |
| P7-R4 | 降级backlog | GitHub凭证/Source/merge调研无首批消费者 | B3/C任务获准重开 |
| P7-L1 | 删除 | 不建mandates.ts/独立Mandate格式与逐词溯源引擎；必要委托/停撤状态由L2/L3复用现有goal/routine/策略，F1仍记操作 | 不以改名为“授权服务”复活；真需另提证据 |
| P7-OPEN | 删除 | 删除独立重复授权闸任务；默认接线与p7-default-gate测试吸收进WL最后一步，P6/验收前提不删 | 无独立任务重开必要 |
