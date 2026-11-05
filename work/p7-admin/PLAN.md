# p7-admin Implementation Plan · v1

> **执行方式**：主会话按 `.claude/skills/grok-orchestrate/SKILL.md` 一层派发；builder 使用 superpowers:executing-plans / test-driven-development 执行本行，不再派子 agent。本计划由 director 首版执笔；Opus 限流期由 Sol 代跑。用户指定的任务表与权限边界优先于技能默认模板。

**Goal**：按既定 BRIEF v2.3 拼接出可停止、可恢复、可核验的两条自主链，以及不弹审批卡、有限可撤销的管家四项。

**Architecture**：保留 dsh 为唯一运行时，goal round-driver 为唯一自动 goal 消息排队者，schedule 为唯一本地定时投递者。SA 只搬先存后做、Mandate、Report、Restart 与 Source 语义；P6 的身份、Assignment、delivery、受限 main 通道、安全信封和通知继续复用。不新增编排框架、第二个审计数据库或 supervisor 产品。

**Tech Stack**：本仓 Node / TypeScript / MJS、Electron、现有 React/shim、Vitest / Playwright；已装 `@deepseek-ai/dsh-*` 同代 `0.2.2-alpha.2`。不为本计划整代升级、不混装 npm latest。

**Spec**：[BRIEF v2.3](BRIEF.md)，尤其 §6、§7、§9、§14；G2 的通过是有条件通过，不表示 P7-SB 或待决项已经完成。共 **34 条任务**，全部初始 `todo`；不含已由 p6 承担的实现，不加 review 列。

## 1. 决策记录（已定与待决分开）

| 编号 | 选择 / 状态 | 放弃什么、为什么 | 依据 / panel 记录 |
|---|---|---|---|
| K1 | **REDUCE，S 拼接路线**；7a-L 与 7a-M → 7b → 7c | 不整包启用 SA，不另造循环、云执行或第三套 agent 系统；先交付真实闭环，不用 PR 数量冒充效果 | BRIEF §2–4；[G1-r1](panels/G1-r1.md)、[G1-r2](panels/G1-r2.md) |
| K2 | goal / schedule **已挂载且运行时已激活**，新增工作为安全与生命周期胶水 | 不重复挂载；不把 schedule receipt 当业务成功，不把“不重叠”当成上游功能 | [Q1](reuse/q1-goal-mount.md)、[Q2](reuse/q2-schedule-mount.md)；[G2-r1](panels/G2-r1.md) |
| K3 | Mandate 按 **goalId / routineId** 定位，独立审计；H1 每动作须完整满足同一授权三元组 | 不按 goal revision 失效；pause/resume 会递增 revision，按 revision 绑定会使合法续派永远失败；不跨 Mandate 拼权 | BRIEF §6.1、§13–14；[G1-r2](panels/G1-r2.md)、[G2-r1](panels/G2-r1.md) |
| K4 | **P7-SB 是阻塞前置**：完整批次封存 + messageId 持久关联 + 有界准入 / 恢复 | 不靠正文、当前任务列表、部分 history 或静默等待推断完整；不以“全拒绝”替代成功验收 | BRIEF §6.1.3、§14 #1–2；[G2-r1](panels/G2-r1.md) |
| K5 | 共享底座先合并，消费者按**精确文件白名单**并行；入口接线再串行收口 | 不声称 L/M 整阶段可直接并行；D-2 只卡 owner 路径，P7-SB 只卡定时链，不连坐普通管理 | BRIEF §7、§14 #4；[G2-r1](panels/G2-r1.md) |
| K6 | 删除 = 无限期 archive/unarchive；卸载 = setBundleEnabled(false/true)；一个 jsonl 兼审计、回执、撤销句柄 | 不物理删会话 / 工作区 / 共享 recipe，不做定时 purge；不承诺撤销已运行代码及外部副作用；不新增回收站数据库 | BRIEF §6.2；AR [G][I][N]；[G1-r1](panels/G1-r1.md) |
| K7 | **D-4 已定②**：goal 只在人类回合建，routine 自带 Mandate，schedule 仅投线索 | 不改 dsh 模型工具授权；不伪造 source=user；③ blocked 定时重试推到 7b，不自动唤醒 paused | BRIEF §10 D-4；[G1-r1](panels/G1-r1.md)、[G1-r2](panels/G1-r2.md)；不是待投票题 |
| K8 | D-1 **未定**；共同底座只收紧来源/H1，自动模型循环按 A/B 路线列依赖 | C 不是等价工具面切换：若胜出须重开 BRIEF 所列范围与 DONE，不能照旧 re-arm。①人类来源别名、②结构化回报存根一并待决 | BRIEF §10 D-1、§14 #3；[G2-r1](panels/G2-r1.md)。**品味 / 权限取舍 → 主会话 /panel D → 用户 C2** |
| K9 | D-2 **未定**，A′ launcher 有界循环 / B′ main 拥有 SDK 二选一；先取 Q-7 实测 | 不把不存在的 main spawn 当现状；不加 PM2（额外守护进程，BRIEF 已否决），不引入 systemd --user 单元方案（不在既定两案内，测试也不得写真实单元目录）；不把断掉的 tool promise 当重启完成 | BRIEF §10 D-2；AR [J][K][N]；[G1-r1](panels/G1-r1.md)。**架构取舍 → 主会话 /panel D；交接契约 → 用户 C2** |
| K10 | D-3 待确认，当前范围按 A 新会话替换、旧会话归档列任务 | 不偷偷解除 preset select 首轮后锁定；B 涉 CONTRACT 147–152，若选择须回写计划与契约 | BRIEF §6.2、§10；AR [A][B][C]。**→ 主会话 /panel D → 用户 C2** |
| K11 | 核验跟随 P6-24/Q-024 的 A：共享主工作区，允许按任务建子目录；执行核验的人跟随 P6 §12.3 | 不让主 bot 去隔离区外读写；若 §12.3=B，由 verifier worker 跑验证，主 bot 读可信退出码与证据，不偷还 bash/write/edit | BRIEF §7⑴–⑶；`work/QUESTIONS.md` Q-024 已答，不代表 P6-24 实现已完成 |
| K12 | 默认链单独开放任务；7b/7c 受阶段出口及用户节奏约束 | Q-025 的立项“是”不是 U-3② 自动续派授权；不擅自推远端 / 建 PR / 合并 | BRIEF §7、§11；`work/QUESTIONS.md` Q-025；7c 的 U-1 开工前再问 |

## 2. REUSE 决策索引与派工前门槛

本索引只汇总已读调研的决策行，不把未知能力写成“scout 已确认”。AR = [admin-reuse](reuse/admin-reuse.md)，Q1/Q2/LT 分别为 [goal](reuse/q1-goal-mount.md)、[schedule](reuse/q2-schedule-mount.md)、[对标与 pstack](reuse/lauren-tan-benchmark.md)。主会话派 builder 前须将本索引与后续 scout 产物合并进 `REUSE.md`，每行保留此 R-id；没有对应已批准决策行就不派该能力。首批可直接合并的 R1–R6 不必等所有调研回齐。

| 决策行 | 能力与路线 | 来源 / 结论 | 实现门槛 |
|---|---|---|---|
| R1 | 管理通道与长期 bot **集成 / 小改造** | AR §3 [A][B][C]、§4[A]：M3/createWorkerBot、M1 #3/#6、SDK→main request/respond、身份重验；第三方 persona 管理项目确实存在，但对象与版本不匹配，不冒称 GitHub 没有 | 可进入底座；新增受限协议字段须用户 C2 确认后合并，沿用 Q-021 不等于任意扩权 |
| R2 | 市场装卸 **集成** | AR §3 [D][E][F][I][J]：精确市场目录 + installBundle(enabled:false) + setBundleEnabled；原 plugin_manager consumer 不启用 | HMR/restart-required 与引用清点实测待 P7-R3；构建/密钥路径默认转人工 |
| R3 | 删除与恢复 **集成** | AR §3 [G]：workspace archive/unarchive；P6 M3/store/restore/slots | 归档不等于进程已退出；实际停活动与 provider 行为待 P7-R3 |
| R4 | 操作记录与代际回执 **业务胶水** | AR §3 [N] 已明确各 supervisor/原生能力不懂本仓恢复协议；P6 ledger/delivery、SA stored work 语义 | 一个 jsonl，不新造事务数据库；SA 精确搬运文件 / SHA 由 P7-R2 补，不先复制未核实文本 |
| R5 | goal / 单一 driver **集成** | Q1 §2–4：已装三包、宿主 disarm/resume、armed 不持久；P6 assignment/report/delivery/slots | 生命周期实现待 D-1 A/B；C 胜出重规划。Mandate 是本仓边界适配，不重写 goal 引擎 |
| R6 | schedule **集成**，重叠准入是本仓胶水 | Q2 §4：原会话投递、every≥60、合批、flush→history、仅 kind 来源；不升级上游 | 普通查询/人类建任务可复用；自动授权**必须**走 R7，不能把本行当 R7 的已实现证据 |
| R7 | 定时授权桥 **路线待证实** | P7-R1 回填 `reuse/q2b-authorization-bridge.md` 的接缝实证、可持久 claim 前完整封存与崩溃关联、反向确认 | 阻塞 P7-SB；没有可行路径就 blocked，若需改上游/适配包先 → /panel D、用户 C2；不直接编辑 node_modules |
| R8 | SA 恢复说明 / Source / Merging **第3级复制改造** | P7-R2 回填 `reuse/sa-skill-adapters.md`；既有本地参考 `repos/dsh-superagent-prototype/src/core/engine.ts`、`src/app/delivery.ts` 只读 | 必须给来源 URL@完整SHA:path、许可证、枚举与适配面；只搬用到的语义/文本，不启 SA 运行时 |
| R9 | 验证技能 **第3级文本改造 + 已装 skill 集成** | LT §5：`cursor/plugins@bb68f2365eceafa0cb2d253112f675acf5f144cc:pstack/skills/{create-verification-skill,maintain-verification-skill}/SKILL.md`，MIT；P6 run-e2e.sh | P7-R2 补 dsh skill 挂载/限定目录/宿主接口；不安装同名 npm 包、不搬 Cursor Task/cloud/宽泛 Autonomy |
| R10 | SDK owner/热重载 **集成 + 最小胶水，未定路线** | AR [J][K][N] + BRIEF 引用 RE78 §3；P7-R3 给目标宿主结果 | D-2、交接契约确认后 P7-F4；AR [L] 的 PM2 推荐已被较新 BRIEF 覆盖，不能据旧行再引 PM2 |
| R11 | 事件凭证隔离 / PR 动作 **待调研** | P7-R4 回填 `reuse/github-credentials.md`：dsh credentials/authorization 与 SA Source | B3/C1/C2 派工前补决策；若无可信凭证隔离不做远端执行，不以 token 填 prompt 补洞 |
| R12 | UI **复制改造 / 本仓现有接线** | LT、AR、BRIEF UI 面：已迁移 routines controller/view/history，现有 sidebar/settings/notice、P6-18；复用本仓 M1/M2/M3 carrier，不扩大 M1 管理白名单 | 双 ux-proposer → frontend-dev → verifier → 单轮 GU；shim/状态改动按主会话规则补 B 方向审查 |

维护证据限度：dsh 最近 commit/release 已核实，issue 人工回应未验证；不能据此宣称完整维护性审计通过。参考仓均只读；复制代码/文本在文件头标 `来源: <url>@<sha>:<path>`，提交时按项目规则注明出处。新增通用能力若拟标“自建”，先补 scout 的搬运阶梯反向确认，不能由 builder 自批。

## 3. 全局约束与底座契约

### 3.1 所有任务共同遵守

- 实现只在独立 `/tmp/bot-wt/<id>`；模型/agent 参数由主会话先读 MODELS 决定，director 不派发。并行 GLM ≤3；真模型评测独占相关模型额度窗口，不与 GLM builder 抢同一服务。
- `区域` 是**全部可写文件**，含测试/配置；未列目录不表示可任写。新文件也写出完整路径。白名单外需求停该任务、回写 PLAN；与 p6 在跑任务文件有交集也排队/三方合并，禁止覆盖。任务 evidence 写自己的 `work/p7-admin/evidence/<id>.*`，主会话独占 LOG/状态记账；LOG/LEARNINGS 不随实现分支覆盖。
- 所有动作先落记录再执行；未授权管理动作 **0 执行** → P6-18“需要你处理”，不再弹审批卡。凭证/account/permission/configForms、审批档位/tiers/approval.yml、主 bot 自改、区外路径、系统级动作在执行端拒绝；原 plugin_manager 保持 preset + guard 双禁。
- 不读取真实凭证，不把 token 放进模型/容器/错误日志。测试临时 HOME、PBOTS_DATA_DIR；不改真实 ~/.config、~/.local、systemd 单元。Electron 一律 `pnpm -C app/ui test:e2e <spec>`（run-e2e.sh 的 Xvfb + 死 DBus）；不直跑 Electron/Playwright。
- 禁机器重启、注销、sudo、批量杀进程；测试只结束自己 spawn 的子进程，必要残留用 bot-reap。M6 的“外部哨兵”由**用户**预置并提供可观测 PID，agent 不在沙箱外创建/结束它；没有该前提就标该验收阻塞，不伪造沙箱外证据。机器真重启不是验收方式。
- TDD：先加本行反例/成功例，运行定向命令记录 RED → 最小实现 → 同命令 GREEN → 重构；新增/改动模块覆盖率 ≥80%。builder/verifier不跑全量，主会话合并后看负载再做全量；不能以负载为由删验收。
- `todo` 不等于 ready；deps 全 done、相应调研/C2/阶段条件满足、REUSE 行齐全才可派。高风险鉴权/协议/存储/审批变动按主会话规则等用户确认再合并。已有批准不重复问；新增格式/接口的确认只卡其消费者，不能暗作已获同意。

### 3.2 文件职责与最小接口（拟定契约，C2 确认后冻结）

路径均相对仓根。下面的模块是有当前消费者的边界，不做通用插件注册框架。

| 边界 | 文件 / 唯一职责 | 输入 → 输出及失败规则 |
|---|---|---|
| 操作账本 | `app/ui/main/admin/operations.ts`；运行数据 `${PBOTS_DATA_DIR}/admin-operations.jsonl` | `beginOperation(request)` → 持久 operationId/去重键；`finishOperation(id,result)`、`readOperations()`、`readUndo(id)`；同 key 串行占位，写/flush 失败不执行。每行 version、operationId、时间、generation、session/turn/source、动作/精确目标/受限参数、授权依据/goalId/routineId/assignmentId、前后投影、状态、undoOf/句柄。append-only 的状态事件仍在同一个 jsonl，不让 schedule history 成为第二个审计库 |
| 权限边界 | `app/sdk/src/admin/authority.mjs`、`origin.mjs`、`app/ui/main/admin/policy.ts` | SDK 从**宿主** turn/source/message 原文取证，不接收模型自报 human/mandate；main 按权威身份、generation、记录重验，authority 输出 allow/deny + reason/evidenceRef。普通未知 kind 不污染，但没有自主授权；已认领 pbots-worker 污染仍走旧 guard |
| 受限管理桥 | `app/sdk/src/admin/channel.mjs`、`tools.mjs`；`app/ui/main/admin/channel.ts`、`consumer.ts` | 请求 `{requestId,generation,sessionId,turnId,originRef,action,target,params}`；originRef 是宿主生成且可重验的引用，不是模型声明。main-only 请求流/respond、单订阅与旧代拒绝沿用 P6。回复 `{ok,value?,error?}` + operationId，不返 token/PID/敏感路径。断流/超时 unknown 不重试副作用，以查询操作状态恢复 |
| 生命周期底座 | `app/sdk/src/admin/host.mjs`、`app/ui/main/admin/recovery.ts`；现有 main/index、ready、dsh/connect | 恢复 owner = **宿主逻辑 owner**，不同于 D-2 的 SDK **进程 owner**。提供按代 `beginGeneration`→restore→settled、恢复操作/Assignment 状态与查询；默认恢复不派工、不 re-arm。缺数据/坏尾行保留现场、标人工处理，不把未知状态改成成功。F3 只提供宿主生命周期闸；具体 D-1 re-arm 在 L2、进程自愈在 F4 |
| 重启接头 | `app/ui/main/admin/restart.ts`、`sdk-owner.ts`，SDK `admin/restart.mjs` | F3 提供未接 owner 时的**明确拒绝**接头，绝非重启已实现；F4 按 D-2 替换为真实 owner 路径。请求先落账、只处理允许目标、完成由新代 restore 写回执；调用中的 promise 断掉不算完成 |
| Mandate / 任务投影 | `app/ui/main/admin/mandates.ts`、`runs.ts`；SDK `admin/goal-lifecycle.mjs` | grant/revoke/lookup 根据人类原文与 goal/change 更新同一账本投影；授权占位与失效重查同一临界区。`runs` 只把可信验证退出码0 + 可访问证据文件标 verified；模型 complete 无记录是 claimed-unverified |
| 授权桥 | `app/sdk/src/admin/schedule-bridge.mjs`、`app/ui/main/admin/schedule-admission.ts` | 输入可信 seal/bind/claim 引用，输出逐 routine admitted/skip/rejected/terminal；seal/bind/timeout/准入记录全部进操作账本，恢复先于消费。具体上游接缝只由 R1 实证后定，不在此假定存在 API |
| UI | 新 `renderer-grok/shim/src/admin.ts`、`routines.ts`、`runs.ts` 与对应覆盖层 | 只吃 main 查询投影；管理撤销走新受限 main IPC，不拓宽 renderer M1；循环/定时接线到现有 coordinator 的真实 handler，不保留点击即成功的 stub |

F2 的 `consumer.ts` 初版只实现已具备的账本查询/受限分发，未接动作明确 unavailable；F3 创建真实可测的生命周期接头，未接 owner 仍明确拒绝。WM/WG/WL 分别是**管理/目标/定时生产接线交付**，不能把前置模块单测绿当旅程已通；共享入口按WM→WG→WL串行。WG不依赖SB，保证J2-a不会被定时接缝连坐。F4 可以晚于 WM/WG：它们不碰 owner 文件，不依赖未定 D-2；重启分支直到 F4 合并仍关闭。

### 3.3 H1 的执行器常量与确定性匹配

以下是收紧执行边界，不用 LLM 判断“像不像授权”。语义不清转“需要你处理”，不猜用户意图。

- 动作规范名/词表：create=`建/创建/新建/create`；modify=`改/修改/改名/设置/更换/rename/modify/set/change`；archive=`删/删除/归档/delete/archive`；install=`装/安装/install`；disable=`卸/卸载/停用/uninstall/disable`；dispatch=`派/派工/委派/dispatch/delegate`；restart=`重启/restart/relaunch`。文字停止单独识别 `stop/停止/停下`，只能收紧，不能借它授予安装/恢复权限。undo/unarchive/re-enable 仍核对相应动作、精确目标和已有撤销句柄，不是万能越权入口。
- 否定词：`别/不要/不许/禁止/先别/暂不/勿/不/勿再`、`no/not/never/don't/do not/without`。按 `。；;！？!?\n` 划分指令子句；逗号可切分并列指令，但不能把目标从否定子句借到肯定子句；否定出现在该动作指令子句中即拒绝该动作。`不是不要…` 等双重否定/引用命令歧义不反推肯定；引号/代码块里的动作不授予权限。出现同动作同目标的正负冲突按否定优先。分别测试“不要装X，装Y”、否定在动作前/后、英文缩写、换行。
- NFKC、Unicode case-fold、去零宽控制符、空白归一；保留 id 内 `-_.:/`，不折叠成另一个 id。拉丁/数字目标必须整 token 相等；CJK 只在已识别指令模板的动作/连接词边界解析目标值，不把任意汉字子串当目标。只有固定动作词和连接词可剥离，不能剥离名称中的字符来凑授权。明确引号中的**目标值**可作完整值，引用中的**指令**不能授权。
- 人类安装目标必须与市场目录规范 id 完全相等；catalog 解析出坐标后再比对，不把 issue 链接、别名、git/tarball/path/registry 当目录 id。改/删/卸须精确 id 或规范化完整 bot 名；`MIN_BOT_NAME_CODEPOINTS=2`（ponytail 常量，短名一律要求 id）；新建人类回合只核动作/参数与数量，不假造新对象目标匹配。
- Mandate 授予：逐个动作和范围值在人类来源原文找到授权证据，保存 originRef；工具结果、网页、worker 回报里同词不算。每次动作完整匹配**同一份** Mandate，禁止并集；范围采用规范工作区/仓 id，路径经过现有 P6 工作区校验，不接受模型自带 cwd。
- `MAX_ACTIVE_LONG_BOTS=16`（不含主 bot/已归档/短期 worker；worker 仍受 P6 slots 限制）。preset 权限不得高于主 bot；保护插件集合从本仓启用 profile patches 的组件标识静态枚举，R3 给确切清单后由 M3 冻结为代码常量，不能让模型传保护列表。
- 普通内部/未知 kind 保持 R2-1 不污染、不全工具拒绝；仅管理/协调动作须授权。`user` 是已证人类基线；`user-approval`、`user-question-reply` 的授予能力须等 D-1 子题①，等待期间不自行把别名算授权。D-1 A/B 选择影响非人类工具暴露，不削弱此节执行检查。

### 3.4 有界等待、恢复与停止的参数

- P7-SB：`AUTH_BRIDGE_WAIT_MS=10000`、`AUTH_BRIDGE_RETRY_MS=250`、`AUTH_BRIDGE_MAX_RETRIES=40`（首次检查不计重试，达到 deadline 即终结，不再额外 sleep）。首次 claim 持久写 expiresAt；重启不重置等待预算；注入 clock/timer 验边界，不依赖真睡10秒。超时 = 持久 `authorization_bridge_timeout`，坏/失踪关联 = 有界 `authorization_bridge_unrecoverable`；包含 batchId/messageId、缺失项、原因，通知，执行0；迟到 history 不能复活。
- 正常调度：真实选择的**完整成员清单**在可持久 claim 前封存；消息实际身份有崩溃前可信持久关联。封存不可追加；messageId 唯一绑定 session/generation/batch、全 routineId/scheduledAt 与 count。原子占位键至少含 routineId+scheduledAt+delivery/messageId，操作/Assignment 绑定唯一 Mandate；不是只锁“这条消息处理过”。
- 正常 history 延迟在 T 内齐备才能放行；崩溃窗口依 R1 证明的持久关联恢复并核对，不伪造已提交 history、不按时间邻近/正文补关联。若接缝无法保证常规 flush 窗口可恢复，SB blocked，而非全部 unrecoverable 验收通过。已派工、外部动作未知均不重放。
- D-2 两案共同参数：child 重启退避250ms×2、最大10000ms；连续启动/restore失败最多5次，窗口10分钟；模型主动重启最多3次/60秒，超额拒绝并记账；成功 restore 才清连续失败计数。stop signal 终止退避与后续spawn。超限停下并通知，不无限挂起/风暴。
- handoff：launcher 生命周期 mkdtemp 一次，0700，跨 child 代际稳定且不可推导；token 每代换、原子替换写；main 断线重读，generation 不匹配的 ready/receipt 拒绝。新代随机端口，不把地址/凭证输出给模型。
- stop 的不可回退顺序：先持久撤销/暂停准入，再发 stop_bot、暂停派生 routine、goal paused；失败逐项留痕，不因某一 stop 失败重开派工。UI/文字共用该入口。每次准入仍查 paused/revoked，保证旧已入队投递不能钻过去。

## 4. 任务表（34 行；所有路径均为具体白名单）

验收缩写：`SDK(x)` = `pnpm -C app/sdk test -- tests/unit/<x>.test.ts`；`UI(x)` = `pnpm -C app/ui test -- tests/unit/admin/<x>.test.ts`；`E2E(x)` = `pnpm -C app/ui test:e2e tests/e2e/<x>.spec.ts`。live SDK 用表内明确命令。每条命令是拟新增或既有的可运行测试入口，**不是声称文件现在已存在或测试已通过**。evidence 列均为待生成证据，须含命令、退出码、RED/GREEN 与验收 SHA；scout 证据含固定来源与可复现实测命令。

### 4.1 首批单列：共享底座（先合并，再开依赖它的消费者）

| id | 任务 | owner | 区域（精确到文件） | deps | status | 捷径 | 验收（可证伪） | evidence |
|---|---|---|---|---|---|---|---|---|
| P7-F1 | 一个操作 jsonl：持久意图/审计/撤销/代际回执；恢复投影 | builder | `app/ui/main/admin/operations.ts`; `app/ui/tests/unit/admin/operations.test.ts` | R4已批准行；存储C2合并前确认 | **running** | R4：P6 ledger/delivery先落盘幂等模式 + SA stored work语义；Node fs，不加数据库 | `UI(operations)`：append/flush失败→副作用0；同key并发仅1占位；尾行截断/版本未知/丢文件失败关闭；读回前后投影/undo；state unknown不变成功；凭证字段拒入账；覆盖≥80% | `evidence/P7-F1.txt` |
| P7-F2 | 共同来源分类/H1/禁区与受限 SDK→main 管理桥；未接动作关闭 | builder | `app/sdk/src/admin/origin.mjs`; `app/sdk/src/admin/authority.mjs`; `app/sdk/src/admin/channel.mjs`; `app/sdk/src/admin/tools.mjs`; `app/sdk/tests/unit/p7-authority.test.ts`; `app/sdk/tests/unit/p7-admin-channel.test.ts`; `app/ui/main/admin/policy.ts`; `app/ui/main/admin/channel.ts`; `app/ui/main/admin/consumer.ts`; `app/ui/tests/unit/admin/channel.test.ts` | R1已批准行；新通道字段C2合并前确认；D-1只影响可放开分支 | **running** | R1/R4：P6 main-channel、turn-origin/turns/taint、身份校验、P6-18；SA边界语义，不改R2-1 | `SDK(p7-authority)`、`SDK(p7-admin-channel)`、`UI(channel)`：宿主取原文、main重验；伪source/旧代/非main respond/重复订阅/超长/null/断流均无越权；§3.3词表反例和“装X”正例；同目标异动作/否定/子串/工具结果授权失败；unknown内部普通工具不被全拒；未知副作用不重试；不返token/PID | `evidence/P7-F2.txt` |
| P7-F3 | 宿主恢复 owner + 代际闸 + 共同入口接线（不是D-1循环，也不是D-2进程自愈） | builder | `app/sdk/src/start.ts`; `app/sdk/src/admin/host.mjs`; `app/sdk/tests/unit/p7-host-recovery.test.ts`; `app/ui/main/index.ts`; `app/ui/main/ready.ts`; `app/ui/main/dsh/connect.ts`; `app/ui/main/admin/recovery.ts`; `app/ui/main/admin/restart.ts`; `app/ui/main/admin/sdk-owner.ts`; `app/ui/tests/unit/admin/recovery.test.ts` | P7-F1,P7-F2,P7-R2；生命周期/交接C2合并前确认 | todo | R1/R4/R8：M3 restore、P6 Assignment/delivery/通知 + SA Restart文本；F2 dispatch接入真实main；owner未定分支明确拒绝 | `SDK(p7-host-recovery)`、`UI(recovery)`：restore前M1/M2管理闸关闭，旧ready/receipt不开新闸；恢复账本/Assignment先于新消费；host restarted终结旧Assignment并保留恢复说明；说明含先查现场/不重放，存在性断言入套件（S2）；缺失/损坏关联不猜、不重放；不自动resume paused/blocked；不宣称已实现restart | `evidence/P7-F3.txt` |
| P7-F4 | 唯一重启路径：进程 owner、handoff、限速、自愈、原生app.relaunch | builder | `app/sdk/src/start.ts`; `app/sdk/src/admin/restart.mjs`; `app/sdk/tests/unit/p7-restart-owner.test.ts`; `app/ui/main/index.ts`; `app/ui/main/admin/sdk-owner.ts`; `app/ui/main/admin/restart.ts`; `app/ui/tests/unit/admin/restart.test.ts` | P7-F3,P7-R3；D-2决定、交接C2 | todo | R10/R4：A′现有launcher/spawn或B′main持有child二选一；Electron app.relaunch；RE78退避参数；不引PM2/systemd | `SDK(p7-restart-owner)`、`UI(restart)`：§3.4参数、请求先持久再退出、恢复后才回执；新端口/token/同handoff目录；token日志0命中；旧代信号拒绝；失败5次停下通知；stop时不再spawn；模型无PID目标；目标不属owner树则0信号；owner未启动/断线不能假报成功 | `evidence/P7-F4.txt` |

F1/F2 可独立写代码与单测；协议/存储C2是合并门槛。F3/F4 的共享文件依赖明确串行。**F4 尚待 D-2 时，只挂起它和重启消费者**，F3 的逻辑恢复底座可独立合并；WM/L链无需等进程owner选择，未接重启路径保持关闭。

### 4.2 阻塞前置：P7-SB 单列，不算已实现

| id | 任务 | owner | 区域（精确到文件） | deps | status | 捷径 | 验收（可证伪） | evidence |
|---|---|---|---|---|---|---|---|---|
| P7-SB | 定时授权桥：可信完整seal、实际投递id反查/持久绑定、有界等待、崩溃恢复与逐routine原子准入 | builder | `app/sdk/src/admin/schedule-bridge.mjs`; `app/sdk/tests/unit/p7-schedule-bridge.test.ts`; `app/sdk/tests/e2e/p7-schedule-bridge-live.test.ts`; `app/ui/main/admin/schedule-admission.ts`; `app/ui/tests/unit/admin/schedule-admission.test.ts` | P7-F1,P7-F2,P7-F3,P7-R1,P7-L1；R7决策+桥契约C2；若需上游适配先回写精确白名单 | todo | R6/R7/R4：dsh实际投递批次/flush/history + P6原子占位/Assignment + 同一操作账本；不是另建调度器 | `SDK(p7-schedule-bridge)`、`UI(schedule-admission)`、`pnpm -C app/sdk test -- tests/e2e/p7-schedule-bridge-live.test.ts`。BRIEF §14 #1三项：正常合法派工1；第二history前claim全批0→T内齐备后各合法1，超T持久timeout且迟到不复活；flush后history前崩溃→可信关联恢复同投递总1，丢/坏关联有界unrecoverable总0+通知。A忙B闲=0/1、A撤销B有效=0/1、跨Mandate拼权=0、同Mandate完整授权=1；seal后追加/正文伪routine/并发双claim拒；§3.4可控时钟，不无限轮询 | `evidence/P7-SB.txt`; `evidence/P7-SB-batches.json` |

**SB 白名单故意不预写未知上游接缝**。P7-R1 若证明必须改 schedule adapter、patch 或包配置，主会话先交 director 回写此行和波次/C2，再派 builder；不能边做边改 node_modules。无可靠接缝则 blocked，不能以当前列表/部分 history 替换契约。

### 4.3 7a-L / 7a-M 消费者与 UI（按文件而非大目录并行）

| id | 任务 | owner | 区域（精确到文件） | deps | status | 捷径 | 验收（可证伪） | evidence |
|---|---|---|---|---|---|---|---|---|
| P7-L1 | goal/routine Mandate授予/失效/撤销与持久投影 | builder | `app/ui/main/admin/mandates.ts`; `app/ui/tests/unit/admin/mandates.test.ts` | P7-F1,P7-F2,P7-F3；Mandate格式C2 | todo | R5/R6/R4：dsh goal/change与schedule状态、SA Mandate语义 + F1账本；不造goal存储 | `UI(mandates)`：goalId键；create/edit/clear失效，pause/resume/complete/blocked/disarm不失效；人类撤销/过期拒；routine改/删/暂停失效；非法授予/同回合issue扩权0；所有动作与范围逐项溯源；同一Mandate原子占位，与撤销并发无TOCTOU放行 | `evidence/P7-L1.txt` |
| P7-L2 | goal单循环生命周期：Assignment disarm、最终Report分回合re-arm、恢复续派 | builder | `app/sdk/src/admin/goal-lifecycle.mjs`; `app/sdk/src/orchestration/create.mjs`; `app/sdk/src/orchestration/send.mjs`; `app/sdk/src/orchestration/report.mjs`; `app/sdk/src/orchestration/delivery.mjs`; `app/sdk/tests/unit/p7-goal-lifecycle.test.ts` | P7-L1；D-1=A/B、子题①②及用户C2；P6对应文件任务先合并 | todo | R5/R8：唯一dsh driver + P6 Assignment/report/delivery/slots；SA仅最终Report结案；按D-1需要最小化回报存根，不重写delivery | `SDK(p7-goal-lifecycle)`：worker期间新增goal round=0；最终回报投递后H5五条件全真才宿主resume；revision+1仍合法续派1；回报与goal不混回合；paused/blocked/deadline/cap/revoked/未结Assignment各拒；重复report/reconnect仅1续派；cap/deadline blocked带code；P6 D9⑨仍绿 | `evidence/P7-L2.txt` |
| P7-L3 | routine管理/结果投影/重叠skip与唯一Mandate归属 | builder | `app/sdk/src/admin/routines.mjs`; `app/sdk/tests/unit/p7-routines.test.ts`; `app/ui/main/admin/routines.ts`; `app/ui/tests/unit/admin/routines.test.ts` | P7-SB；D-1=A/B及子题/C2 | todo | R6/R7：已挂schedule_create/list/update/delete + SB；SA Source/Mandate语义 + P6最终Report；不造周期引擎 | `SDK(p7-routines)`、`UI(routines)`：人类建/列/暂停/删；every<60拒、every=60合法，短测after_seconds；未结时照收投递但该routine派工0写skip；删除/暂停不撤已排消息但派工0；receipt仅inbox；无rrule/新目标会话伪功能；schedule create_goal/resume由原dsh拒；重启保留/离线只补最近一次 | `evidence/P7-L3.txt` |
| P7-L4 | stop共同入口：文字/按钮、停Assignment、暂停派生routine/goal、旧投递隔离 | builder | `app/sdk/src/admin/stop.mjs`; `app/sdk/tests/unit/p7-stop.test.ts`; `app/ui/main/admin/stop.ts`; `app/ui/tests/unit/admin/stop.test.ts` | P7-L1,P7-L2；模块及目标接线不依赖定时链，真周期综合验收归V2 | todo | R5/R6/R1：dsh pause/abort、P6 stop_bot + F1停止意图，保持paused不恢复 | `SDK(p7-stop)`、`UI(stop)`：文字与按钮入口同结果；先关闭授权再stop，部分stop失败不恢复准入；假钟两周期后新副作用0；旧已入队投递到达仍0；新代恢复不唤醒paused。≥2分钟真周期证据归V2 | `evidence/P7-L4.txt` |
| P7-L5 | 生成/维护验证技能playbook与fixture可执行闭环 | builder | `app/sdk/profile/skills/create-verification-skill/SKILL.md`; `app/sdk/profile/skills/maintain-verification-skill/SKILL.md`; `app/sdk/tests/unit/p7-verification-skill.test.ts`; `app/sdk/tests/fixtures/p7-verification/package.json`; `app/sdk/tests/fixtures/p7-verification/check.mjs`; `app/sdk/tests/fixtures/p7-verification/FEATURES.md` | P7-R2；P6 §12.3决定执行者；R9批准的skill承载目录/接线 | todo | R9/R8：只搬pstack两playbook文本；dsh skill/fs + SA GitHub技能写法 + P6 Xvfb/死DBus；不依赖Cursor Task | `SDK(p7-verification-skill)`：launch→doctor→drive→evidence→cleanup跑通才激活；注入产品回归同技能FAIL；未跑通draft；不能改Feature Map掩盖FAIL；来源/宿主指令/安全cleanup存在性断言；若R2确定需额外挂载文件，派工前回写白名单，不假定profile目录自动激活 | `evidence/P7-L5.txt`; `evidence/P7-L5-run.json` |
| P7-L6 | 运行摘要/可信核验记录：区分receipt、模型声明与verified | builder | `app/ui/main/admin/runs.ts`; `app/ui/tests/unit/admin/runs.test.ts` | P7-F1,P7-F3,P7-L1,P7-L5 | todo | R4/R5：SA Report语义 + P6日志/证据文件读取边界 + dsh goal phase；不改模型complete权限 | `UI(runs)`：验证执行者签收的退出码0且fd绑定证据存在才verified；模型伪路径/伪退出码/complete无记录显示“模型声明完成，无证据”；round数、blocked原因、routine/goal/Assignment归属准确；不越P6工作区；坏文件/缺记录不假绿 | `evidence/P7-L6.txt` |
| P7-M1 | 长期bot建/改名模型prompt/归档恢复/撤销（不含preset替换） | builder | `app/ui/main/admin/bots.ts`; `app/ui/tests/unit/admin/bots.test.ts` | P7-F1,P7-F2,P7-F3,P7-R3 | todo | R1/R3：M3 createWorkerBot/store身份/强制workspace、dsh session-controller/archive/unarchive + F1；复用现有recipe，不重写roster | `UI(bots)`：建后独立workspace/roster/操作记录、卡片0；上限16拒；name/model/prompt撤旧值；主bot任何字段/删除拒；archive停活动结果留痕、无限期可恢复、历史数相等、共享recipe不坏；创建撤销进入已删除；不接自带cwd/越权preset；各§6.2业务投影diff空 | `evidence/P7-M1.txt` |
| P7-M2 | preset/连接器变更的可撤销新会话替换 | builder | `app/ui/main/admin/bot-replacement.ts`; `app/ui/tests/unit/admin/bot-replacement.test.ts` | P7-M1；D-3=A及用户C2 | todo | R1/R3/AR[B][C]：现有M3 recipe/ensure + dsh锁定语义，业务适配已在AR列自建边界；不改preset引擎 | `UI(bot-replacement)`：首轮后变更创建新会话、归档旧会话；反向切回原会话工具表一致；切换失败/中途崩溃不双活不丢历史；主bot拒；并发撤销/替换最多1活跃；残留新归档会话属允许残留 | `evidence/P7-M2.txt` |
| P7-M3 | 市场精确安装/逻辑卸载/引用与保护清单/撤销 | builder | `app/ui/main/admin/plugins.ts`; `app/ui/tests/unit/admin/plugins.test.ts` | P7-F1,P7-F2,P7-F3,P7-R3；无owner时持久记录待重启，不阻塞装卸模块 | todo | R2：pluginMarket + pluginManager.installBundle(enabled:false)/setBundleEnabled + 本仓MCP wrapper；SA先存后做；不启原工具 | `UI(plugins)`：目录规范id/精确坐标、安装前快照、application/changed/error/restartReason留痕；五类非目录坐标全拒；approvedBuilds/兼容豁免/密钥输入不自动放行；工具出现→禁用消失→撤销恢复；跨bot引用与保护清单每项拒；HMR失败/未知状态不重放安装；owner未就绪restart-required持久待处理不假完成 | `evidence/P7-M3.txt` |
| P7-U1 | 管理记录/一键撤销/已删除列表，含错误/空态与主bot保护 | frontend-dev | `app/ui/renderer-grok/shim/src/admin.ts`; `app/ui/renderer-grok/overrides/modules/admin-view.tsx`; `app/ui/renderer-grok/overrides/modules/admin-view.css`; `app/ui/renderer-grok/overrides/modules/settings-view.tsx`; `app/ui/renderer-grok/overrides/modules/sidebar.tsx`; `app/ui/tests/unit/grok-shim/p7-admin.test.ts`; `app/ui/tests/e2e/p7-admin.spec.ts` | P7-F1,P7-F2,P7-F3；UI契约C2；M服务可用确定性fixture先行 | todo | R12/R1/R3：现有settings/sidebar/roster/通知 + F1投影；不画第二套审批卡 | `pnpm -C app/ui test -- tests/unit/grok-shim/p7-admin.test.ts`、`E2E(p7-admin)`：谁/时间/来源/前后值/undo可见；撤销真实投影改变、错误不假成功；已删除恢复历史数相等；重启后记录仍在；键盘可达/禁区不可操作；生产接线后WM复跑 | `evidence/P7-U1.txt`; `evidence/P7-U1.png` |
| P7-U2 | routines列表/编辑/暂停删除/回执与执行状态分层 | frontend-dev | `app/ui/renderer-grok/shim/src/routines.ts`; `app/ui/renderer-grok/frontend/src/recovered/features/automations/routines/controller.ts`; `app/ui/renderer-grok/frontend/src/recovered/features/automations/routines/view.tsx`; `app/ui/renderer-grok/frontend/src/recovered/features/automations/routines/view.css`; `app/ui/renderer-grok/frontend/src/recovered/features/automations/routines/run-history-provider.ts`; `app/ui/tests/unit/grok-shim/p7-routines.test.ts`; `app/ui/tests/e2e/p7-routines.spec.ts` | P7-L3；UI契约C2 | todo | R12/R6：G18已移植routines组件、RE78 §5最小功能与现有schedule；不承诺云/rrule/新目标会话 | `pnpm -C app/ui test -- tests/unit/grok-shim/p7-routines.test.ts`、`E2E(p7-routines)`：有效schedule类型可编辑，60s边界可见；receipt不显示执行成功；skip/timeout/unrecoverable/失败原因可见；暂停/删除后已入队仍0派工；刷新不丢状态 | `evidence/P7-U2.txt`; `evidence/P7-U2.png` |
| P7-U3 | J2运行摘要/证据/轮数/blocked与停止按钮 | frontend-dev | `app/ui/renderer-grok/shim/src/runs.ts`; `app/ui/renderer-grok/overrides/modules/run-summary.tsx`; `app/ui/renderer-grok/overrides/modules/run-summary.css`; `app/ui/renderer-grok/overrides/modules/notice-view.tsx`; `app/ui/tests/unit/grok-shim/p7-runs.test.ts`; `app/ui/tests/e2e/p7-runs.spec.ts` | P7-L4,P7-L6；UI契约C2 | todo | R12/R4/R5：P6任务/回报notice与需要你处理 + main核验投影；SA Report摘要语义 | `pnpm -C app/ui test -- tests/unit/grok-shim/p7-runs.test.ts`、`E2E(p7-runs)`：verified/声明无证据明确区分；证据/卡点/轮数可查；按钮停与文字stop同入口；坏数据/流断开不假完成；resume不对paused开放自动路径 | `evidence/P7-U3.txt`; `evidence/P7-U3.png` |

### 4.4 接线、整体验收与默认链（不由作者运行闸门）

| id | 任务 | owner | 区域（精确到文件） | deps | status | 捷径 | 验收（可证伪） | evidence |
|---|---|---|---|---|---|---|---|---|
| P7-WM | 人类管理链生产接线：SDK工具→main服务、受限查询/撤销IPC、管理UI入口 | builder | `app/ui/main/admin/consumer.ts`; `app/ui/main/admin/ipc.ts`; `app/ui/preload/index.ts`; `app/ui/renderer-grok/shim/src/index.ts`; `app/ui/renderer-grok/shim/src/data.ts`; `app/ui/renderer-grok/shim/src/coordinator.ts`; `app/sdk/src/admin/tools.mjs`; `app/sdk/profile/patches/p7-admin.yml`; `app/ui/tests/unit/admin/management-wiring.test.ts` | P7-F3,P7-M1,P7-M2,P7-M3,P7-U1；受限IPC/工具schema C2 | todo | R1/R2/R3/R12：F2桥、P6 carrier/通知和M3；只在P2SDK_PATCH显式开发加载，不扩M1白名单 | `UI(management-wiring)` + `E2E(p7-admin)`：从真实UI/模型入口建改删装卸、每条卡片数0；管理/undo入账先于执行；renderer伪造管理请求/旧originRef拒；IPC只暴露查询、stop、特定undo，不给任意main动作；原plugin_manager双禁不变；不依赖SB/进程owner，无owner时重启明确拒 | `evidence/P7-WM.txt` |
| P7-WG | 目标链独立生产接线：goal/change、Assignment/report、核验与停止摘要 | builder | `app/sdk/src/orchestration/index.mjs`; `app/sdk/src/orchestration/main-channel.mjs`; `app/sdk/src/admin/host.mjs`; `app/sdk/profile/patches/p7-admin.yml`; `app/ui/main/admin/consumer.ts`; `app/ui/main/admin/ipc.ts`; `app/ui/preload/index.ts`; `app/ui/renderer-grok/shim/src/index.ts`; `app/ui/renderer-grok/shim/src/data.ts`; `app/ui/renderer-grok/shim/src/coordinator.ts`; `app/sdk/tests/unit/p7-goal-wiring.test.ts`; `app/ui/tests/unit/admin/goal-wiring.test.ts` | P7-WM,P7-L2,P7-L4,P7-L5,P7-L6,P7-U3；D-1=A/B及C2 | todo | R5/R8/R9/R12：F3生命周期 + P6回报/身份 + dsh唯一driver；不依赖schedule桥，不新增循环 | `SDK(p7-goal-wiring)`、`UI(goal-wiring)`、`E2E(p7-runs)`：真实目标链入口可派工、分回合回报/goal、核验和停止；宿主恢复可re-arm且不唤醒paused；无Mandate拒/合法Mandate成功；SB未接时目标链仍可独立走通；只在显式开发patch开启 | `evidence/P7-WG.txt` |
| P7-WL | 定时链生产接线与两链开发patch收口（共享入口在WG后串行改） | builder | `app/sdk/src/orchestration/index.mjs`; `app/sdk/src/orchestration/main-channel.mjs`; `app/sdk/src/admin/host.mjs`; `app/sdk/profile/patches/p7-admin.yml`; `app/ui/main/admin/consumer.ts`; `app/ui/main/admin/ipc.ts`; `app/ui/preload/index.ts`; `app/ui/renderer-grok/shim/src/index.ts`; `app/ui/renderer-grok/shim/src/data.ts`; `app/ui/renderer-grok/shim/src/coordinator.ts`; `app/ui/tests/unit/admin/loop-wiring.test.ts`; `app/sdk/tests/unit/p7-loop-wiring.test.ts` | P7-WG,P7-SB,P7-L3,P7-U2；D-1=A/B与C2；p6入口修改先合并 | todo | R5/R6/R7/R8/R9/R12：F3生命周期挂goal/change、schedule桥、Assignment/report；既有skill挂载按R2实证；main核验/现有UI请求handler | `SDK(p7-loop-wiring)`、`UI(loop-wiring)` + `E2E(p7-routines)`、`E2E(p7-runs)`：真实入口到执行器，移除空成功stub；安装同代/插件激活、源码新增范围S1快照；无Mandate隐藏/拒，合法Mandate正例1；schedule不建goal；F3恢复hook先于定时消费；未知内部不污染。无C案照搬re-arm | `evidence/P7-WL.txt`; `evidence/P7-S1.json` |
| P7-V1 | 管家M1–M5/M7/M8综合对抗与撤销投影测试 | builder | `app/ui/tests/unit/admin/management-matrix.test.ts`; `app/ui/tests/e2e/p7-management-matrix.spec.ts`; `app/sdk/tests/unit/p7-management-origin.test.ts` | P7-WM；定时授权补格另依P7-SB/P7-WL，不阻塞非定时格先验 | todo | R1–R4/R7：复用各M服务与P6通知/污染fixtures，不加产品模块 | `UI(management-matrix)`、`SDK(p7-management-origin)`、`E2E(p7-management-matrix)`：BRIEF M7的5禁区×6动作×6来源表驱动，N/A写理由；M4四类溯源反例/装X成功；Mandate扩宽0；M8按§6.2逐投影diff空；SB补格逐routine0/1含合法成功；卡0；重启仍有账；所有保护项逐项测 | `evidence/P7-V1.txt`; `evidence/P7-M7.json`; `evidence/P7-M8-diff.json` |
| P7-V2 | L1–L5确定性闭环/投毒/停止真实周期综合探针 | builder | `app/sdk/tests/unit/p7-loop-integration.test.ts`; `app/sdk/tests/e2e/p7-loop-live.test.ts`; `app/ui/tests/e2e/p7-stop.spec.ts` | P7-WL；P6-24实现、P6 §12.3核验执行者明确 | todo | R5/R6/R7/R9：fake模型驱动现成dsh与P6链；不再写循环引擎 | `SDK(p7-loop-integration)`、`pnpm -C app/sdk test -- tests/e2e/p7-loop-live.test.ts`、`E2E(p7-stop)`：L1四拒绝+edit失效/revision+1成功；L2完整链、四投毒/假完成/P6 D9⑨；L4全部合批/桥正反例与schedule建goal/resume拒；文字/按钮各观察≥2周期且≥120s，新副作用0，旧已入队仍到达且派工0；L5技能好仓PASS坏仓FAIL | `evidence/P7-V2.txt`; `evidence/P7-L-trace.json` |
| P7-V3 | SDK/应用代际重启与崩溃窗口集成探针（M6/S2/L1重启部分） | builder | `app/sdk/tests/e2e/p7-restart-live.test.ts`; `app/ui/tests/e2e/p7-restart.spec.ts` | P7-F4,P7-L1,P7-WG；owner路径C2；外部哨兵由用户预置 | todo | R10/R4/R5/R6：真实owner + restore/日志 + 沙箱子进程；服务级崩溃，不碰机器 | `pnpm -C app/sdk test -- tests/e2e/p7-restart-live.test.ts`、`E2E(p7-restart)`：M6全部条件；测试只kill自身child；外部副作用发生/回执未落盘处crash总计1；新port/token同handoff、restore前闸关、旧代信号拒、main重连M1/M2可用；goal re-arm后续派1，routine/Assignment恢复；限速/风暴停下；用户哨兵PID/信号观测不变；上下文token零泄漏 | `evidence/P7-V3.txt`; `evidence/P7-M6.json` |
| P7-V4 | J2真模型采集：目标链3次、定时链3次、指定真实仓1次 | builder | `app/sdk/tests/e2e/p7-real-model.test.ts`; `app/sdk/tests/fixtures/p7-real-model/cases.json` | P7-V2,P7-V3,P7-V1；P6-22 PASS或§12.3替代项、P6-24 done；用户指定真实仓与安全进入方式 | todo | R5/R6/R7/R9：复用现有provider与真实dsh/P6链，只做采集脚本；凭证留宿主已有通道 | `pnpm -C app/sdk test -- tests/e2e/p7-real-model.test.ts`：L2真模型3次可与J2-a同一组三次复用，J2-a/J2-b各3次各≥2完成，其余blocked有因；另真实仓clone/迁入工作区1次，不放宽区外写；固定版本/seed(可用时)/采样参数/trace/退出码/证据、失败也入分母；短429有界退避，长限额停止报告不改分母 | `evidence/P7-V4.txt`; `evidence/P7-L6-runs.json` |
| P7-OPEN | 默认链开放的独立、显式变更（不是立项自动授权） | builder | `app/sdk/profile/patches/approval.yml`; `app/sdk/tests/unit/p7-default-gate.test.ts` | P7-V1,P7-V2,P7-V3,P7-V4；P6-14b done；D-1及U-3②用户明确授权；7a独立验收/阶段审查通过 | todo | R1/R5/R6/R7：仅从显式开发patch接现有默认链；不改审批档位/权限词义，不启原plugin_manager | `SDK(p7-default-gate)`：授权前默认无自动协调续派；授权后按D-1工具面加载，非法来源/无Mandate仍0；goal/schedule原授权保持；配置/恢复文本存在性断言入套件；主会话负责合并后全量、阶段review与G3，builder不替作者跑闸 | `evidence/P7-OPEN.txt` |

V1 可先交非定时格的定向证据，整行 done 必须补齐 SB 格；V2 的 fake 与定向真周期不替代 V4 的真模型。S1/S2、L1–L6、M1–M8 的最终通过均须独立 verifier；本表不是作者自评结论。

### 4.5 7b / 7c（保留全阶段范围，不提前派工）

| id | 任务 | owner | 区域（精确到文件） | deps | status | 捷径 | 验收（可证伪） | evidence |
|---|---|---|---|---|---|---|---|---|
| P7-B1 | 长期职责绑定routine+技能、park/unpark及独立UI状态 | frontend-dev | `app/ui/main/admin/responsibilities.ts`; `app/ui/renderer-grok/shim/src/responsibilities.ts`; `app/ui/renderer-grok/overrides/modules/admin-view.tsx`; `app/ui/main/admin/consumer.ts`; `app/ui/renderer-grok/shim/src/data.ts`; `app/ui/tests/unit/admin/responsibilities.test.ts`; `app/ui/tests/e2e/p7-responsibilities.spec.ts` | 7a出口用户验收并允许7b；P7-OPEN；职责契约C2 | todo | R1/R5/R6/R9/R12：长期bot+现有routine/skill，不造服务目录；SA长期执行者语义 | `UI(responsibilities)`、`E2E(p7-responsibilities)`：B1一bot+一routine+一skill；park后停止触发/unpark恢复，UI状态独立可见；不把paused goal自动唤醒；R4账本可撤；不默认引入D-4③ | `evidence/P7-B1.txt`; `evidence/P7-B1.png` |
| P7-B2 | 技能生命周期：限定目录、真试跑激活、版本回滚与维护routine | builder | `app/sdk/src/admin/skill-lifecycle.mjs`; `app/sdk/profile/skills/maintain-verification-skill/SKILL.md`; `app/sdk/tests/unit/p7-skill-lifecycle.test.ts`; `app/sdk/tests/e2e/p7-skill-lifecycle-live.test.ts` | 7a出口用户验收并允许7b；P7-L5,P7-R2；R9具体挂载/生命周期契约C2 | todo | R9/R8/R6：dsh filesystem skill + pstack维护playbook + 现有schedule/账本，不做技能商店 | `SDK(p7-skill-lifecycle)`、`pnpm -C app/sdk test -- tests/e2e/p7-skill-lifecycle-live.test.ts`：B2限定目录越界拒；未试跑draft、真PASS激活、可回滚上一版；维护仅clean/changed/blocked；注入产品回归改Feature Map不能抹FAIL；旧版/半写文件不激活 | `evidence/P7-B2.txt` |
| P7-B3 | 一类GitHub issue事件Source、去重、triage候选任务及凭证隔离 | builder | `app/sdk/src/admin/github-source.mjs`; `app/sdk/tests/unit/p7-github-source.test.ts`; `app/sdk/tests/e2e/p7-github-source-live.test.ts`; `app/ui/main/admin/event-admission.ts`; `app/ui/tests/unit/admin/event-admission.test.ts` | 7a出口用户验收并允许7b；P7-B1,P7-R2,P7-R4；R8/R11决策；事件/凭证契约C2 | todo | R8/R11：第3级搬SA单一GitHub Source + dsh credentials/authorization实证接缝 + H1/Mandate，不引新事件总线 | `SDK(p7-github-source)`、`UI(event-admission)`、`pnpm -C app/sdk test -- tests/e2e/p7-github-source-live.test.ts`：B3同event两次只1候选；事件不是人类授权；正文装X/删Y执行0；bad payload/游标重启/重放幂等；token不进模型/worker沙箱/日志；真实只读事件订阅按用户范围 | `evidence/P7-B3.txt` |
| P7-C1 | PR babysit：verified PR、CI修复上限、推新head前撤auto-merge | builder | `app/sdk/src/admin/pr-babysit.mjs`; `app/sdk/tests/unit/p7-pr-babysit.test.ts`; `app/sdk/tests/e2e/p7-pr-babysit-live.test.ts`; `app/sdk/profile/skills/pr-babysit/SKILL.md` | 7b出口用户验收并允许7c；P7-B2,P7-B3,P7-R4；U-1明确repo/队列/规模/账号及外部动作授权；R8/R11批准 | todo | R8/R11/R9：SA Delivery requirements/Merging文本 + 现有验证技能、GitHub受限API，不另造CI平台 | `SDK(p7-pr-babysit)`、`pnpm -C app/sdk test -- tests/e2e/p7-pr-babysit-live.test.ts`：C1一次夜间真实任务产出证据齐的verified PR；`MAX_CI_FIX_ATTEMPTS=3`超额blocked；更新head前先撤auto-merge，撤失败不push；旧CI不能充新head证据；全部远端动作在批准范围且token不出宿主 | `evidence/P7-C1.txt` |
| P7-C2 | 受限自动合并：批准范围+独立verifier+当前head CI+head稳定 | builder | `app/sdk/src/admin/merge-guard.mjs`; `app/sdk/tests/unit/p7-merge-guard.test.ts`; `app/sdk/tests/e2e/p7-merge-guard-live.test.ts` | P7-C1；U-1及合并契约C2、R11批准 | todo | R8/R11：SA Merging约束文本 + GitHub受限原子head检查；复用独立核验结果，不让作者自签PASS | `SDK(p7-merge-guard)`、`pnpm -C app/sdk test -- tests/e2e/p7-merge-guard-live.test.ts`：C2批准repo/queue内才成功；head变/CI过期/verifier版本旧/无审批各不合并；提交合并时用expected head原子防竞态；token模型/worker/日志零泄漏；无远端授权仅fixture，不宣称真实验收通过 | `evidence/P7-C2.txt` |

### 4.6 待查任务（由主会话派 scout；这些也是34行总量的一部分）

| id | 任务 | owner | 区域（精确到文件） | deps | status | 捷径 | 验收（可证伪） | evidence |
|---|---|---|---|---|---|---|---|---|
| P7-R1 | Q-2b两窄题：抛错/逐routine拦截；可信批次/消息持久关联接缝实证 | scout | `work/p7-admin/reuse/q2b-authorization-bridge.md`; `work/p7-admin/evidence/P7-R1-probe.mjs`; `work/p7-admin/evidence/P7-R1.txt` | Q2已读；只读已装制品，临时HOME | todo | R6→R7：查已装schedule与flush/claim顺序；优先上游现成接缝，需适配给最小路径而不是凭记忆提API | ①resolve-agent waterfall抛错后是重试/失败/无限重投？逐routine拦截能否不连坐B？②确定性gate在第二history前claim、flush后crash，证明可claim前完整seal与崩溃前消息关联；给固定源码锚点、可运行probe、REUSE行、若需自建逐级反向确认与精确文件清单；不可行明确blocked | `reuse/q2b-authorization-bridge.md`; `evidence/P7-R1.txt` |
| P7-R2 | Q-3+Q-6合并清点：SA可搬件、skill挂载与pstack宿主替换 | scout | `work/p7-admin/reuse/sa-skill-adapters.md`; `work/p7-admin/evidence/P7-R2-probe.mjs`; `work/p7-admin/evidence/P7-R2.txt` | AR/Q1/Q2/LT已读 | todo | R8/R9：现有SA、cursor/plugins只读，先查MANIFEST避免重复clone；只搬语义/文本 | stored work/Restart两约束/Report枚举/Source/Merging逐个url@sha:path、许可证/适配量；实证dsh skill/fs目录、加载/激活路径与必要patch文件；列出Cursor Task/cloud替换接口；第三方能否直接复用/不行理由，待自建项给反向确认；不把恢复文案复制等同恢复owner实现 | `reuse/sa-skill-adapters.md`; `evidence/P7-R2.txt` |
| P7-R3 | Q-7目标宿主：archive/停活动/roster/providers、HMR、启动拓扑与跨代握手 | scout | `work/p7-admin/reuse/host-management-probes.md`; `work/p7-admin/evidence/P7-R3-probe.mjs`; `work/p7-admin/evidence/P7-R3.txt` | AR已读；临时数据/临时HOME | todo | R2/R3/R10：已装dsh与本仓真实launcher/main接缝，不借参考仓旧行为下结论 | 六项逐项可复现：归档gate/provider/活动停/roster通知调度；安装HMR结果application/restartReason；生产SDK/Electron真实入口谁启动谁；SDK新port/token后main身份握手；列保护组件精确id与跨bot引用查询接口；不读凭证/不杀外部进程；输出D-2两案代价与文件差异 | `reuse/host-management-probes.md`; `evidence/P7-R3.txt` |
| P7-R4 | Q-5凭证隔离：GitHub Source/授权/合并可复用路径 | scout | `work/p7-admin/reuse/github-credentials.md`; `work/p7-admin/evidence/P7-R4-probe.mjs`; `work/p7-admin/evidence/P7-R4.txt` | SA参考仓只读；只用测试凭证/fixture不读真实secret | todo | R11：查dsh credentials/authorization、SA Source与既有GitHub集成；不自写secret broker | 固定源码/版本/许可证与接口；证明Source/merge可宿主使用凭证而模型/worker容器/错误日志无secret；无可行路径明确阻塞B3/C，不以env全文透传补洞；每级候选可用性/失败理由与REUSE行 | `reuse/github-credentials.md`; `evidence/P7-R4.txt` |

## 5. 7a 波次（依赖与白名单双约束）

下表列出全部7a任务及其调研输入；一行波次内不是强制一次派完，主会话还须按GLM≤3/模型额度/当前main文件冲突分批。逻辑依赖永远优先；“侧线”表示不把未答D-2、SB等串成全局屏障。

| 波次 | 可派任务 / 先决条件 | 白名单与阻塞边界 |
|---|---|---|
| W0 首批 | **P7-F1 ∥ P7-F2**；同时主会话可派 P7-R1/P7-R2/P7-R3/P7-R4，按模型额度择批 | F1/F2产品和测试文件集合不交；scout只写各自reuse/probe；先并行调研不是等待全部调研才开底座。C2高风险合并条件如表，不自授权 |
| W1 底座收口 | F1/F2合并且R2回齐后 **P7-F3** | start.ts、main/index/ready/connect由F3独占；与p6同文件在跑时先解决交集，不暗改区域 |
| W2 底座分支/独立消费者 | **P7-L1 ∥ P7-L5 ∥ P7-M1 ∥ P7-M3 ∥ P7-U1**，各满足本行门槛后分批；**P7-F4侧线**（R3+D-2+C2到齐才派） | 五条文件均不交；F4只改owner/start/index，消费者不碰这些文件。F4未决不能卡M1/M3/U1；共同底座的重启专属部分直到F4才开放 |
| W3 按能力展开 | **P7-SB ∥ P7-L2 ∥ P7-L6 ∥ P7-M2**（各按deps）；F4仍可侧线 | SB依R1+L1、L2依D-1、L6依L5、M2依D-3；四条文件不交。SB迟到不拖L2目标链与管理；D-1=C则L2暂停重规划，管理继续 |
| W4 功能补齐 | **P7-L3 ∥ P7-L4**；L4/L6完成可派U3；L3完成可派U2；**P7-WM**待M/U1齐备即可侧线 | L3/L4/U2/U3与WM白名单互不交；U1已完成才WM，避免修改正在定稿的管理UI入口；WM不依SB/F4，不因定时/owner不明阻塞普通管理接线 |
| W5 独立目标链→定时链收口 | **P7-WG**在其deps齐后先接目标链；**P7-WL**须WG与SB/U2齐后再接定时链；**P7-V1非定时格**可在WM后先跑；**P7-V3**在F4+WG后侧线 | 本波是两个串行子波，不同时派WG/WL。WM→WG→WL的consumer/IPC/preload/shim/patch交集明确串行；V1/V3测试文件与它们不交。WG/V3不依SB，目标与重启可先验 |
| W6 7a综合确定性验收 | **P7-V2 ∥ P7-V1定时补格**，V3缺项继续 | V1与V2/V3文件不交；真实停止两分钟不能用假钟代替，SB验收必须含1次合法成功；V1整行等补格才done |
| W7 真模型与真实仓 | **P7-V4**（V1/V2/V3全齐及P6前提） | 采集独占模型窗口；失败保留分母，不以重跑挑绿；真实仓未指定则只阻塞真实仓项/本行最终done |
| W8 默认链 | **P7-OPEN**（用户授权、P6-14b与7a闸门齐） | 只此时修改默认approval.yml；与p6该文件任务串行，禁止以开发patch验证成功推断默认已开放。之后7b仍须用户允许推进 |

**可机械检查的并行不交约束**：同批所有任务的区域集合两两交集必须空；任务实现文件与测试文件都计入。跨波次重复路径是显式串行接线，不是授权后续任务覆盖上游改动。若R1/R2/R3结果要求增加文件，先修白名单与此波次表，不能保持旧表却让builder扩大区域。

## 6. DONE→任务/证据映射与交付条件

| BRIEF DONE | 覆盖任务 | 不得省略的出口 |
|---|---|---|
| S1/S2 | F3、L5、WL、V3；各行来源标注 | 同代清单、实际goal/schedule source、源码新增范围diff；恢复说明套件存在性 |
| L1 | L1/L2、V2/V3 | 重启revision+1仍可派；create/edit/clear失效；paused/deadline/cap/revoked拒 |
| L2 | L2/L6/WL、V2/V4 | worker期间0goal round、分回合回报/goal、续派成功、四投毒/假完成；fake+真模型3次；D9⑨不退 |
| L3 | L4/U3、V2 | 按钮和文字各测，≥120秒/两周期0新副作用，已排旧投递到达仍0 |
| L4 | R1、SB、L3/U2、V2 | 三桥验收、四合批反例/成功正例；不得全拒；60s边界、schedule建goal/resume拒 |
| L5/L6 | R2、L5/L6/U3、V2/V4 | 技能真跑/注入回归FAIL；两链各3次各≥2完成+指定真实仓1次 |
| M1/M2/M3 | M1/M2、U1/WM、V1 | 卡0；数量/主bot保护；archive可恢复、共享recipe不坏；替换与反向切回 |
| M4/M5 | M3/WM、V1 | 真市场MCP工具表变化；精确坐标、拒绝矩阵、引用/保护项、安装残留边界 |
| M6 | F3/F4、V3 | 新代真实M1/M2可用、旧信号不开闸、owner自愈与续派、外部动作不重放、限速、用户哨兵不受影响 |
| M7/M8 | F1/F2/L1、V1、SB、U1 | 完整来源禁区矩阵+合法正例；每条可撤销业务投影diff空，重启留痕 |
| B1/B2/B3 | B1/B2/B3、R2/R4 | 职责可park、技能试跑/回滚、一类事件去重且正文无授权 |
| C1/C2 | C1/C2、R4 | 真verified PR、修复上限、head前撤auto-merge；四失败拒合并、凭证隔离 |

- 产品完成以 BRIEF DONE 与独立证据为准，不以任务行代码合并数为准；各 evidence 必须绑定当时 head SHA，head变更后的旧证据按主会话规则重验。
- 主会话按当前 grok-orchestrate §6 派独立verifier/Sol分方向review（不调用已停用mm-review），UI按单轮GU；规模不在任务表预定。高风险合并先等C2；每次合并后的全量由主会话跑并看负载。director不替产物跑G1/G2/G3。
- 7a出口：全部S/L/M证据齐、独立验收绿、阶段整段审查无未修critical/major、主会话阶段闸门/用户验收完成。U-3②未答时维持隔离开发状态，OPEN不done；不能借此自动开启7b。7c更不能凭本PLAN直接执行远端动作。

## 7. 待查 / 待决（只阻塞所列范围，不阻塞无关首批）

1. **Q-2b① → P7-R1/scout**：resolve-agent抛错的重试/失败/重投语义，逐routine前置拦截是否连坐同批B。目标产物 `reuse/q2b-authorization-bridge.md`。这是投递前优化可行性题；不能由不抛错或全批拒绝猜结论。不阻塞F1/F2/M链。
2. **Q-2b② → P7-R1/scout，P7-SB阻塞输入**：在实际batch selection→followup→flush→逐history commit接缝，如何在可持久claim前封存完整集合并留下崩溃前实际消息关联？用第二history前claim与flush后crash gate实证。需要适配/自建则给搬运阶梯反向确认、精确文件、REUSE行 → /panel D；接口 → 用户C2。无可靠路径则SB blocked，不得降级为部分history放行；不阻塞普通管理和J2-a。
3. **D-1 → 主会话 /panel D → 用户C2（与U-3②合成一次提问）**：A协调者+管理工具均限Mandate；B仅协调者+goal complete/blocked，管理限人类；C非人类不经模型、引擎结构化续派。另①人类来源集合；②回报是否存根化。C若胜出，按BRIEF §10重开S1、L1–L4/L6/M6/M7及J2/H5/driver消费路径再派相关实现；不动J1/管理四项/L5既定范围。未定只卡L2/L3/WL与自动授权开放，不妨碍共同安全底座。
4. **D-2 → 主会话 /panel D；交接 → 用户C2**：P7-R3先证生产入口，A′launcher循环或B′main拥有SDK。没有“沿用现存main spawn”第三选项；PM2/systemd不加回范围。阻塞F4/V3/重启消费者，不阻塞WM与独立管理模块；R3只读实测不能启动/结束外部服务。
5. **D-4 保留已定状态，不重开投票**：7a选②两链，拒①改模型工具授权；③blocked定时重试仅7b后另提，不包含在B1/B2默认范围，不自动恢复paused。验收由L3/V2明确验证schedule的create_goal/resume仍拒。
6. **D-3 → 主会话 /panel D → 用户C2**：A新会话替换/旧归档；B修CONTRACT允许原会话重组。M2按A列计划但答复前不派；若B胜出先修计划/契约，不静默在M2扩大区域。
7. **Q-3/Q-6 → P7-R2；Q-7 → P7-R3；Q-5 → P7-R4**：分别补SA/skill精确可搬件、宿主管理/owner实测、GitHub凭证隔离；只阻塞表内消费者。R2若确定技能目录不是本计划所列profile路径，先改L5/B2白名单再派；R3给保护id后M3才能冻结代码清单。
8. **P6/用户依赖与契约**：P6-14b默认开放前提；P6-22 PASS或§12.3替代项/P6-24真模型前提；Q-024已选A但实现状态由主会话核对。U-3②未确认不开放默认自动续派；用户真实仓未给则V4真实仓项阻塞。新账本/受限通道/生命周期、Mandate、桥、UI读撤销接口须由主会话按C2记录确认，不将本计划当用户批准。U-1在7c开工前一次一问，未答C1/C2不开。
