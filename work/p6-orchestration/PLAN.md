# PLAN · p6-orchestration（主 bot 编排 + personal agent 三段式交互）

v4.5 · 2026-11-05 记账重建（P6-22 事故后从 LOG/VERIFY/review-coverage 重建；行描述为摘要，证据以 VERIFY/LOG 为准）

## 重建口径与证据

本次以现存 v1 为底补回记账，不宣称逐字恢复已丢失的 v3–v4.4 决策和任务规格。当前 status 与 deps 以以下两张重建表为准；后附 v1 的决策、区域核实、任务图、计数和 D-2 题干仅保留为历史底稿，不再作为当前派发依据。修复链中的初验 FAIL 与后续 PASS 分开记载，不能把已合并等同于每份初验报告均为 PASS。

证据来源为本目录 `LOG.md`、`VERIFY-*.md`、`work/LOG.md` 和 `work/review-coverage.txt`。coverage 现存内容截至 L-7，没有后续 p6 逐任务 head；下表 SHA 来自 LOG 或 VERIFY 实文。没有 VERIFY 或 SHA 的调研、提案、契约回报明确注明缺项，不推定验收通过。决策 36、D-3、Q-024 等新增引用按派发原文保留，不凭空补写丢失的决策正文。

## 已完成任务与修复链汇总

本次共重建 44 行已完成交付及修复链记录、6 行活跃任务；修复子项单列计数，不等于 44 个独立功能均一次验收通过。

表内均为已完成交付或已并入后续修复链的任务记录；具体通过范围以证据中的最终裁定为准。没有合并 SHA 时使用验收 SHA，并明确标识。

| id | 一句话摘要 | VERIFY 文件 / 其他直接证据 | 合并或验收 SHA |
|---|---|---|---|
| P6-01 | 三段式折叠纯函数已验收通过并合并，覆盖 33 条用例。 | `VERIFY-P6-01.md`；`work/LOG.md` 11-03 13:09 | 验收 `c43dcaa` |
| P6-02 | 冻结提示集、p6-reply preset 与原始帧采集器已交付并合并。 | `VERIFY-P6-02.md`；`work/LOG.md` 11-03 13:17 | 合并 `0a18b2a` |
| P6-03 | 新 renderer 的折叠接线与 D1/D2 DOM 验收已通过并合并。 | `VERIFY-P6-03.md`；`work/LOG.md` 11-03 22:03 | 合并 `0b929f6` |
| P6-04 | D3 的 30 回合数据与计分器已验收通过，结果为 30/30。 | `VERIFY-P6-04.md`；`work/LOG.md` 11-03 13:50 | 验收 `4a7600c` |
| P6-05 | persona 段落接入默认链已验收通过并合并，后续被回退的问题由 f1 修复。 | `VERIFY-P6-05.md`；`LOG.md` 05:09、11-04 22:15 | 合并 `8973a67` |
| P6-09 | 跨会话原语 spike 的 62 条断言通过，实测修正投递与持久化语义。 | `VERIFY-P6-09.md`；`LOG.md` 11-04 06:06 | 合并 `38584ba` |
| P6-19 | 16 条编排提示集先于编排实现提交并冻结，已验收通过。 | `VERIFY-P6-19.md`；`LOG.md` 04:45 | 合并 `bba98bb` |
| P6-05.f1 | persona 恢复及真实系统提示断言已交付，初验仅余 drift 豁免面问题，随 f1a 闭合。 | `VERIFY-P6-05f1.md`、`VERIFY-P6-05f1a.md`；`LOG.md` 11-04 22:55 | 合并 `60e8b02` |
| P6-05.f1a | drift 豁免范围收紧后复验通过，已并入 persona 恢复链。 | `VERIFY-P6-05f1a.md`；`LOG.md` 11-04 22:43–22:55 | 验收 `5cc1184`；链合并 `60e8b02` |
| P6-21 | 投递地基已验收通过并合并，承接幂等投递与污染回合适配。 | `VERIFY-P6-21.md`；`LOG.md` 11-04 06:55 | 合并 `397c7c8` |
| P6-21.f1 | inflight 串行化与 stopped 跳过 asks 的修复已通过真 Loader 验收并合并。 | `VERIFY-P6-21f1.md`、`REVIEW-P6-21f1.md`；`LOG.md` 11-04 10:26 | 合并 `5930660` |
| P6-10 | create_bot、编排通道与容量检查初验失败，随 f1/f1a 修复后整体通过并合并。 | `VERIFY-P6-10.md`、`VERIFY-P6-10f1a.md`；`LOG.md` 11-04 11:27 | 合并 `29c6b1a` |
| P6-10.f1 | 污染回合限制与既有 worker 收养已修，初验发现满额漏计，交 f1a 闭合。 | `VERIFY-P6-10f1.md`、`VERIFY-P6-10f1a.md`；`LOG.md` 11-04 11:11–11:27 | 初验 `baef53c`；链合并 `29c6b1a` |
| P6-10.f1a | pending Set 与统一补收养路径修复满额漏计，终验通过。 | `VERIFY-P6-10f1a.md`；`LOG.md` 11-04 11:27 | 验收 `6028985`；链合并 `29c6b1a` |
| P6-10.f2 | review 的通道健壮性、容量与撤权等问题已批量修复，初验尾项交 f2a 闭合。 | `VERIFY-P6-10f2.md`、`VERIFY-P6-10f2a.md`；`LOG.md` 11-04 12:05–12:53 | 初验 `132edd7`；链合并 `9906bcb` |
| P6-10.f2a | details/warn 脱敏与 shuffle 顺序依赖已修，主会话按任务验收裁定 PASS 并三方合并。 | `VERIFY-P6-10f2a.md`；`LOG.md` 11-04 12:53 | 合并 `9906bcb` |
| P6-11 | send_to_bot 已通过验收并合并，包含 busy 与 inbox 待认领语义。 | `VERIFY-P6-11.md`；`LOG.md` 11-04 12:13 | 合并 `b00ab66` |
| P6-12 | worker 通知、污染守卫与撤回重试已通过真 Loader 验收并合并。 | `VERIFY-P6-12.md`；`LOG.md` 11-04 16:47 | 合并 `80880b9` |
| P6-13 | stop_bot 的两阶段语义已交付，空闲目标多调 cancel 的尾项随 f1 闭合。 | `VERIFY-P6-13.md`、`VERIFY-P6-13f1.md`；`LOG.md` 11-04 17:37 | 合并 `944afa0` |
| P6-13.f1 | 空闲目标不再调用 cancel，P6-13 整体验收通过。 | `VERIFY-P6-13f1.md`；`LOG.md` 11-04 17:37 | 验收 `23b0ac5`；链合并 `944afa0` |
| P6-14 | worker 执行信封初验失败，f1 改用上游 restrict 后整体通过，review 新发现再由 f2–f4 闭合。 | `VERIFY-P6-14.md`、`VERIFY-P6-14f1.md`、`VERIFY-P6-14f4.md`；`LOG.md` 11-04 18:42、20:39 | 首链合并 `09f627b`；终验 `528c368` |
| P6-14.f1 | 执行信封改用上游 restrict，隐藏与强拒入口的实测通过。 | `VERIFY-P6-14f1.md`；`LOG.md` 11-04 18:42 | 验收 `828aa90`；链合并 `09f627b` |
| P6-14.f2 | 身份文件损坏与改名子代理的 review 问题已修，初验新增缺键与冷启动问题，转 f3/f4 闭合。 | `VERIFY-P6-14f2.md`、`VERIFY-P6-14f4.md`；`LOG.md` 11-04 19:45、20:39 | 初验 `5873660`；链终验 `528c368` |
| P6-14.f3 | unknown 判定、store.init 骨架与撤销挂点已修，超时分支未等待初始化的问题转 f4 闭合。 | `VERIFY-P6-14f3.md`、`VERIFY-P6-14f4.md`；`LOG.md` 11-04 20:19–20:39 | 初验 `8db9636`；链终验 `528c368` |
| P6-14.f4 | 两个超时分支等待 store.init 后再放行，修复链整体终验通过并合并。 | `VERIFY-P6-14f4.md`；`LOG.md` 11-04 20:39 | 验收 `528c368`（LOG 未记录本次合并 SHA） |
| P6-15 | 合成 section 与 notice 载体的 1b UI 已验收通过并合并，GU 尾项由 f1 修复。 | `VERIFY-P6-15.md`；`LOG.md` 11-04 06:36 | 合并 `8540693` |
| P6-16 | 与 P6-15 同批交付的 worker 标记、分组及通知 UI 已验收通过并合并。 | `VERIFY-P6-15.md`（15/16 共用）；`LOG.md` 11-04 06:16、06:36 | 合并 `8540693` |
| P6-15.f1 | GU 的主题稳定等待、中性态、reduced-motion 与已读归组问题已验收通过并合并。 | `VERIFY-P6-15f1.md`；`LOG.md` 11-04 11:00 | 合并 `2746c31` |
| P6-17 | D8 的真审批卡与提问链路 e2e 已验收通过并合并；提问卡 UI 缺口另记。 | `VERIFY-P6-17.md`；`LOG.md` 11-04 19:23–19:34 | 验收 `2c5e15b`（LOG 未记录本次合并 SHA） |
| P6-17.f1 | 测试预写编排身份骨架，修复双数据目录分裂导致的 p6-stuck 红例，快验通过。 | `VERIFY-P6-17f1.md`；`LOG.md` 11-04 21:12、21:25 | 验收 `acec699` |
| P6-18 | 通知语义、死总线降级与 e2e DBus 隔离守卫已交付并验收通过。 | `VERIFY-P6-18.md`；`LOG.md` 11-04 21:17 | 验收 `bc86f2e` |
| P6-20 | 48 组 D3′ 数据已交付并合并，模型路由仍为 FAIL（19/48），报告算术笔误已修。 | `VERIFY-P6-20.md`；`LOG.md` 11-04 21:57、22:05 | 合并 `eb82460` |
| P6-22 | 路由文案迭代 r1 FAIL（3/30）→ r2 数据完整性 PASS（28/30），不等于正式 48 组定案通过。 | `VERIFY-P6-22r2.md`；`LOG.md` 11-05 01:41、07:07；`work/LOG.md` 11-05 07:26 | 验收 `cd40f65`；事故后三方恢复 `b138aad` |
| P6-25 | write/edit 区外写纯收紧已按真实落盘边界裁定 PASS 并合并，后续 TOCTOU 交 f1。 | `VERIFY-P6-25.md`；`LOG.md` 11-05 02:38 | 合并 `be37484` |
| P6-25.f1 | 执行期复判、NEVER 根复判与坏表硬拒已完成，初验文档尾项随 f1a 闭合。 | `VERIFY-P6-25f1.md`、`VERIFY-P6-25f1a.md`；`LOG.md` 11-05 04:42 | 合并 `75267c6` |
| P6-25.f1a | 来源说明、窄窗口描述与拒绝提示修正后复验通过，写侧残余窗口交 P6-27。 | `VERIFY-P6-25f1a.md`；`LOG.md` 11-05 04:34–04:46 | 验收 `d6af82e`；链合并 `75267c6` |
| P6-26 | 读侧 fd 身份绑定已交付，软链工作目录的初验缺陷随 f1 闭合并三方合并。 | `VERIFY-P6-26.md`、`VERIFY-P6-26f1.md`；`LOG.md` 11-05 06:09 | 合并 `0fa0c37` |
| P6-26.f1 | canonicalPath 修复软链工作目录下区内读被拒的问题，P6-26 整体验收通过。 | `VERIFY-P6-26f1.md`；`LOG.md` 11-05 06:09 | 验收 `d09a48f`；链合并 `0fa0c37` |
| P6-26t | run_code 等进程执行工具改走 bash 审批档位，区域列补记后主会话裁定 PASS 并合并。 | `VERIFY-P6-26t.md`；`LOG.md` 11-05 06:02 | 合并 `62f94c3` |
| C-1 | CONTRACT v1.5 已回报，通道暂定 Q-021、createdBy 可选键与防提升已记录，两项编辑待确认转 Q-022。 | `LOG.md` 04:42（无单独 VERIFY） | LOG 未记录提交 SHA |
| S-5 | Coworker 调研已回报，11 项机制及开源候选作为 1b 设计输入。 | `reuse/s5-coworker.md`；`work/LOG.md` 11-03 21:35（无单独 VERIFY） | LOG 未记录提交 SHA |
| S-6 | 污染回合适配与幂等投递复用结论已回报，LOG 明确置 done。 | `reuse/s6-delivery-taint.md`；`LOG.md` 04:47（无单独 VERIFY） | LOG 未记录提交 SHA |
| S-7 | 写侧复用调研已回报，推荐集成已装 NodePtcRuntime，不批自建 stdio，延迟尚未实测。 | `reuse/s7-confined-fs-executor.md`；`LOG.md` 11-05 04:59（无单独 VERIFY） | LOG 未记录提交 SHA |
| UX-1 | A/C 两份合成 section 提案已齐，作为 P6-15/16 实现输入。 | `ui/UX-1-A.md`、`ui/UX-1-C.md`；`LOG.md` 04:41、04:46（无单独 VERIFY） | LOG 未记录提交 SHA |

## 活跃任务（按派发原文保留）

以下为本次提供的精确任务行。P6-22 定案仍是 todo；P6-14b 原文中的「28/30」只对应 r2 子集，`VERIFY-P6-22r2.md` 明确不开放闸门。定案采集前须修采集器等待条件，48 组在依赖合并后的 main 上重跑；T-taint、启动顺序核对及 persona/section 在场断言仍为开闸硬前置。

| id | 任务 | owner | 区域 / 派发条件 | status | evidence / deps |
|---|---|---|---|---|---|
| P6-24 | worker 继承发起者工作区（决策 36+D-3 五防护+Q-024 任务自适应子目录）| builder | orchestrate.ts/store.ts/契约 C-2 | blocked（f1完整验收FAIL @71826d2；三HIGH已闭合，真实删除链未满足，R3底座已完成，R3.RE仅证请求/客户端边界，原版存储终态UNKNOWN，正式生命周期旅程仍缺；未合并） | `evidence/P6-24/REPORT-f1.txt`；删除只实测存储API，不冒称UI/RPC旅程 |
| P6-26t.f1 | subagent-policy ③ workflow 分支先等卡→答 allowed-once→再等 child（测试适配，不放宽档位）| builder | tests/e2e/subagent-policy.test.ts | done（独立验收PASS @1ffdce1；合并0e831c6后定向回测PASS） | `evidence/P6-26tf1/VERIFY.txt`（3通过；档位8通过/1基线跳过） |
| P6-27 | 写侧进 bwrap：S-7 已定集成 NodePtcRuntime（不自建 stdio）；文件操作在 guest 内执行不绑回宿主 | builder | 待 director 按 S-7 改写本行后派 | todo | 卡 P5-29（不卡 14b）|
| P6-22 定案 | 48 组全量重跑（r2 文案 0ed1ed4；采集器等待条件 minor 先修）| builder | evidence/D3-orch | todo | 等 P6-24 等依赖合并后在 main 跑 |
| P6-14b | 开放闸：start.ts 默认链加 orchestration.yml 一行 | builder | start.ts | blocked | 前置：Q-021✅ Q-024✅ P6-22 定案✅（28/30）+ goal/schedule 回合污染暴露修复（turn-origin 对 goal/schedule 回合隐藏协调者工具，D-1 定案前）+ 启动顺序核对（f4 遗留③）+ persona/section 在场断言 |
| T-taint | goal/schedule 来源回合当前不算污染（R2-1 只认 pbots-worker），create_bot 在其中可见——与 Q-021 告知矛盾 | builder | turn-origin.mjs/create.mjs | done（VERIFY.txt PASS @e5286df：RED 同点复演、删 R2-1 schedule 子断言经差分证明正当（加回即红、新口径无净损失）、taint-guard 口径不变且 coordinatorTainted 仅 create.mjs 消费、全量 29 文件 572/exit0 一致；合并 423939c。残留实证转 f1：goal/schedule 回合 send_to_bot/stop_bot visible=true 且 send execute 直达 delivery（中）；低：classify 无 claim 早返回缺 coordinatorTainted 字段并入 f1；预写 mainBotId 时 user-approval 回合真实执行与 q1 机制一致，作者「一律 UNKNOWN_TOOL」表述过宽）| evidence/T-taint/REPORT.md、VERIFY.txt；P6-14b 硬前置（f1 收口前不开闸） |
| T-taint.f1 | 残留收口：send_to_bot/stop_bot 的 when/execute 仍读 .tainted 未接 coordinatorTainted（builder 申报白名单外，各约一行；VERIFY 实证 goal/schedule 回合 visible=true 且 send execute 直达 delivery）——goal/schedule 回合仍可操作其他 bot；另 classify 无 claim 早返回缺 coordinatorTainted 字段（低，undefined falsy 恰安全但契约不一致）一并补 | builder | send_to_bot/stop_bot 定义处 + turn-origin.mjs classify 早返回 | verifying（builder @7dc1bd0：send.mjs/stop.mjs when+execute 改读 coordinatorTainted、文案对齐 create；classify 补两字段；新增 8 用例；RED 5红→GREEN 186/186；全量 30 文件 580/580 exit0（572+8）；send/stop 旧 R2-1 用例移 schedule claim 拦截断言移入新文件待核正当性；create-live 一次 socket hang 单跑绿判负载 flake）| evidence/T-taintf1/REPORT.md；verifier 独立树在跑 |
| T-taint.q1 | 查证：followup 唤醒回合内 when 工具调用一律 UNKNOWN_TOOL（builder 探针发现，疑 dsh step admission 根因；live execute 断言疑似空转满足） | 先查证只读 | dsh step admission（repos 只读）对照我们的 when 接线 | done（机制=身份 unknown 挂 scoped restriction，metadata 恢复晚于已生成 step admission，工具不补回→UNKNOWN_TOOL 而事后 visible=true；非所有 followup 异常。live ① 断言只证无建 bot 副作用、不证 execute 自查命中；历史 user-approval 探针缺原始记录无法唯一归因。不放宽 dsh admission；生产恢复窗口改善最小位置=envelope 恢复 sweep 时机，暂不立修） | evidence/T-taint-q1.md |

## v4.5 重建修订账

| 来源要点 | 本次处置 | 落点 |
|---|---|---|
| 1 已完成任务按 LOG/VERIFY/coverage 重建。 | 已补交付与修复链汇总，保留初验 FAIL、最终裁定与实文 SHA，不补造丢失的规格。 | 「已完成任务与修复链汇总」。 |
| 2 六条活跃任务使用提供的原文。 | 已逐字保留六行，另据 VERIFY 注明 r2 子集通过不等于正式定案通过。 | 「活跃任务」；`VERIFY-P6-22r2.md`。 |
| 3 p5 丢失追加行同步恢复。 | 已在 p5 PLAN 尾部补行，并把 P6-27 的跨 PLAN 依赖补回 P5-29。 | `work/p5-parity/PLAN.md` 的重建追加表及 P5-29 deps。 |
| 4 证据文件不改写。 | 本次只重建两份 PLAN 正文，LOG/VERIFY/coverage 保持原文。 | 本节及两份原文件快照。 |

## 以下为事故后现存 v1 历史底稿

v1 · 2026-11-03 · director（Opus 5.5）· 首版。输入：`BRIEF.md` v2.1（下称 B）；`panels/G1-r2.md`（有条件通过，清单已进 B v2.1 修订账）；`work/p5-parity/PLAN.md` 2026-11-03 快照 + `work/LOG.md` 12:12 行（P5-21/25/27/28 已派 builder，P5 PLAN 状态列尚未同步）；只读核实 `app/ui/renderer/plugins/session/reduce.ts`、`app/sdk/src/start.ts:114-127`、`app/sdk/profile/patches/{approval,presets}.yml`、各 P5 worktree 的 `git diff --name-only`。
口径：1a 无契约增量；1b 的接口改动全部 blocked 到 D-2 经 /panel D 并交用户 C2 批准。REUSE.md 尚未产出（S-1~S-4 待派）：1a 的捷径只用本仓第 2 级复用，已在下表写明；**1b 任务在 REUSE 有决策行之前不得转 ready**，届时 director 回填捷径列。

## 0. 决策记录
| # | 选了 | 放弃 | 为什么 | 记录 |
|---|---|---|---|---|
| 1 三段式落点 | renderer 位置折叠（首工具前 = ack、末工具后 = result、中间进 thinking 行），不依赖模型调工具 | send_message 工具为基线 | GLM 不调工具时黑屏 / 刷屏；旧 bot 立即生效 | B §2.2；G1-r1 #3 |
| 2 折叠函数输入 | reduce.ts 归约结果（`SessionView.items` + `hasMore` / `running` / `endReason`），只 import 不改 | 自写 dsh 帧解析 | 第 2 级复用；同一套 reasoning / 终止原因语义（reduce.ts:99、:115-120）；P5-12 正在改 reduce.ts 同目录 | B §2.2 v2.1；G1-r2 A-H1 |
| 3 折叠文件位置（机械） | `app/ui/renderer/fold/turn-fold.ts`（新目录） | ①`renderer/plugins/session/`：P5-12 在跑、P5-54 会删、B 同步要点 4 禁止；②`renderer-grok/shim/`：P5-50 尚未建树、属 P5-51 区域 | tsconfig `renderer/**/*.ts` 与 vitest `tests/unit/**` 都已覆盖，零配置；P5-54 只删 `renderer/{plugins,shell}` | B §2.3 |
| 4 D3 的 preset 载体 | 新文件 `profile/patches/p6-reply-style.yml`，**insert** 一个新 preset `p6-reply`（standard 工具表 + persona 追加段落），D3 经 `P2SDK_PATCH` 加载、session/create 显式选它（T-05 `presets.yml` 同法） | 在 approval.yml 的 `preset-standard` 行改 persona | dsh patch 对非 insert 行整 config 覆盖（approval.yml:32-42，P5-03 用它禁 plugin_manager）；再覆盖一次 preset-standard 有冲掉 P5-03 的风险，且 approval.yml 在 P5-21 已派区域内。代价：生产默认链要等 P5-21 合并后由 P6-05 一行接入 | 本 PLAN |
| 5 notice 来源（机械） | (b)(e) 直接用 reduce.ts `endNotice` 产出的那条；折叠函数只新增 (d) 一种 notice | 折叠函数另出「本回合出错」 | 不重复显示；文案已存在 | B v2.1 修订账 |
| 6 回合切分（机械，带上限） | 以 `user` 条目为界，assistant / thinking 的 `t<turn>-` 前缀变化也切；tool 条目归当前段 | 改 reduce.ts 给 tool 加 turn 字段 | 不改 reduce.ts（决策 2）。**上限**：无用户消息触发、且首个条目是工具的回合（只出现在 1b 的通知唤醒回合），首个工具会被归到上一段 → P6-01 写 `ponytail:` 注释；P6-12 验收负责闭合（届时 reduce.ts 已随 P5-51 移植，可加 turn 字段） | 本 PLAN |
| 7 1b 路线 | R2 自建编排层（暂定） | R1 superagent 集成 / R3 dsh 原生 agent-team | B §3；R1 待 S-1 / S-3，R3 与 C2 ②、P5-05 冲突 | D-1 待投 |
| 8 create_bot 落点 | SDK 工具只发 `{name, prompt}`，main #4 编排建 bot、写 `createdBy` | SDK 直建 session | 无 recipe 冷启动只读、BotsMeta 只由 main 写 | B §4-3；G1-r1 #1 |
| 9 并发上限 | SDK 编排插件内一个 `reserveSlot` / `releaseSlot`：查 + 占位同 tick 无 await；create_bot 与 send_to_bot 共用；占用按 worker 会话回合运行态计、不分来源（侧栏人工启动计入）；检查只在协调者工具入口执行（用户消息永不被拒） | 只在 create_bot 限流；人工启动不计 | B §4-5 v2.1；单进程 JS 同 tick 即原子，不需要锁。`ponytail:` 进程内计数，重启归零——重启后 worker 全部被打断（D5），归零正确 | G1-r2 B-H1 |

**品味项（交 GU 一轮，各 1 行）**：①中间过程逐行（0.18 原生）vs 合并成一个「工作过程」块，默认逐行；②正文降级 thinking 行收起态是否露首行预览、标签是否仍写「Thinking」（transcript.tsx:553-556、:607）。

## 1. 区域核实（2026-11-03，`git -C /tmp/bot-wt/<id> diff --name-only main...HEAD` + `status --short`）
| 在跑 P5 任务 | 声明区域 | 当前实改 | 与 p6 1a |
|---|---|---|---|
| P5-12（frontend-dev） | `renderer/plugins/session/`、`tests/e2e/visual-session.spec.ts` | — | P6-01 只 import `reduce.ts`，不改该目录 → 文件级无交叠；P5-12 合并后单跑 `tests/unit/fold` 防类型漂移 |
| P5-21（builder） | `app/sdk/src/policy/`、`src/start.ts`、**`app/sdk/profile/patches/`**、`app/sdk/tests/` | 尚无改动 | **目录级有交叠**（patches/）。P6-02 只**新建** `p6-reply-style.yml`，不改该目录任何已有文件、不改 start.ts、不写 `app/sdk/tests/` → 文件级无交叠。默认链接入（改 approval.yml / start.ts）推到 P6-05，排 P5-21 合并后 |
| P5-25（builder） | `main/m3-meta/orchestrate.ts`、`m1-api/`、`tests/unit/m3/` | `p2temp/index.mjs`、`main/index.ts`、`orchestrate.ts` 等 | 1a 无交叠；1b P6-10 同文件 → 排 P5-25 合并后，三方对照（LEARNINGS 2026-11-03） |
| P5-27（builder） | `tests/e2e/interrupt.test.ts` | 同 | 无 |
| P5-28（builder） | `main/dsh/ledger.ts`、`m1-api/`、`m2-mux/` | 同 + `m2-mux/index.ts` | 1a 无；1b 若 D-2⑤ 选 M2 推送帧，P6-10 排 P5-28 合并后 |
| P5-H1（todo，有 worktree） | `app/sdk/tests/support/runtime.ts` 等 | 测试支撑 | P6-02 的 D3 脚本**不 import** `runtime.ts`（它硬编码 mock provider，且 P5-H1 要改），直接 spawn `app/sdk/scripts/start.mjs` + 复用 `app/sdk/examples/lib/client.mjs`（只读） |

## 2. 任务图

status：ready = 现在可派；todo = 只差本 PLAN 内前序；blocked = 等 PLAN 外的 P5 任务 / Q / D / scout。review：M / S / –（UI 走 GU 1 轮）。通用约定：测试 HOME 一律 `/tmp/bot-p6-<id>`；进程清理只杀自己 spawn 的子进程（CLAUDE.md §5）；报告写主仓 `work/p6-orchestration/`，不写 worktree 内的 work/（LEARNINGS 2026-11-02）；evidence 只放报告 + 脚本 + 帧，运行时目录用后即删，凭证不落盘。

### 2.1 波次 1a · 三段式（位置折叠）
| id | 任务 | owner | 区域 | deps | status | review | 捷径 | 验收（可证伪） | evidence |
|---|---|---|---|---|---|---|---|---|---|
| P6-01 | **折叠纯函数**：`foldTurns(items, {hasMore, running}) → entries`，规则 = B §2.2 规则表 + 三件套 + 兜底 (a)–(g)；同时给出进行中流式文本的落点 `streamingAs: 'message' \| 'thinking'`（当前段还没有工具 → message，否则 thinking）；输出里正文降级行带区分字段（如 `from: 'text' \| 'reasoning'`） | builder | `app/ui/renderer/fold/turn-fold.ts`（新）、`app/ui/tests/unit/fold/turn-fold.test.ts`（新） | – | done | S | 建在 `reduce.ts` 归约结果之上（本仓第 2 级，只 import）；(b)(e) notice 复用 `endNotice`（决策 5） | `cd app/ui && pnpm vitest run tests/unit/fold` 绿，用例覆盖：① D1 函数层：A→t1→B→t2→C→t3→E→completed 恰 2 个 assistant 气泡（A、E），B、C 为 `from:'text'` thinking，3 个 tool，E 只出现一次；无工具问答恰 1 气泡；回合进行中 `running:true` 时气泡 ≤1 且 `streamingAs` 在首工具后为 thinking；② D2 七格 (a)–(g) 各至少一例，(e) 三枚举各一例；③ 不变量（对全部用例断言）：每段正文在输出里恰出现 1 次、`from:'reasoning'` 行永不成气泡、已结束回合可见 entry ≥1（(g) 除外）；④ 多回合：两回合相邻时前一回合 result 不因后一回合工具降级；⑤ `git diff main --name-only` ⊆ 区域列，`renderer/plugins/` 零改动；⑥ `pnpm exec tsc -p .` 无新错误；决策 6 的上限写 `ponytail:` 注释 | |
| P6-02 | **D3 前置：冻结提示集 + preset 提示 + 原始事件采集**。三个 commit 依次：①`evidence/D3/prompts.json`（10 条：5 多步 + 5 简单，B D3 口径）；②`p6-reply-style.yml` insert preset `p6-reply`（工具表与 approval.yml `preset-standard` 行一致、`tool-plugin-manager` 保持 disabled；persona prefix 末尾追加 B §2.2 的回复段落，文件头注来源）；③`evidence/D3/run.mjs`：spawn `app/sdk/scripts/start.mjs`（`P2SDK_PROVIDER=real`、`P2SDK_PATCH=<abs>/p6-reply-style.yml`、`HOME=/tmp/bot-p6-d3`），每回合新会话、显式选 `p6-reply`，把 follow 原始帧逐回合写 `evidence/D3/raw/<prompt>-<rep>.jsonl`，并记 model id、LiteLLM route、temperature / top_p、preset 段落 sha256 | builder | `app/sdk/profile/patches/p6-reply-style.yml`（新）、`work/p6-orchestration/evidence/D3/{prompts.json,run.mjs}`（新） | – | done | S | preset insert 写法照抄 `profile/patches/presets.yml`（T-05）；工具表照抄 `approval.yml:45-`；段落第 3 级取自 `repos/grok-bot-0.18-reconstructed@a9f633e:source/packages/agent/prompts/project-prompt.ts:110-119` 与 `repos/dsh-superagent-prototype@6337fc8:prompts/replies.md:13-27`；客户端复用 `app/sdk/examples/lib/client.mjs` | ① `git log --format=%H -- <prompts.json>` 的提交早于 `p6-reply-style.yml` 的首个提交，且之后 prompts.json 无改动；② `grep -c 'id: preset-standard' p6-reply-style.yml` = 0（不覆盖 standard），`git diff main --name-only` ⊆ 区域列；③ 与 approval.yml 的 preset-standard 工具表逐 id 对比一致，plugin_manager 仍禁用（`tests/e2e/guard-plugin-manager.test.ts` 在加载本 patch 时仍绿）；④ mock provider 干跑 1 条：raw jsonl 含 `turn/start`…`turn/end`，元数据字段齐；⑤ 真模型冒烟 1 条（不计入 D3）：session header.agentPreset = `p6-reply`；⑥ `grep -rE 'sk-\|P2SDK_LLM_API_KEY=' evidence/D3` 为空，运行后 `/tmp/bot-p6-d3` 已删、无残留子进程（按自身 spawn 的 PID 查 `/proc`） | |
| P6-03 | **D1/D2 DOM 验收（新 renderer）**：确认 P5-51 shim 经 P6-01 映射；D1、D2 七格用 fake provider 脚本跑 DOM e2e；在 1a 之前建的会话上重放 D1 | frontend-dev | `app/ui/tests/e2e/p6-fold.spec.ts`（新）；接线若缺，只补 `app/ui/renderer-grok/shim/` 中调用 `foldTurns` 的那一处 | P5-51, P6-01 | done | –（GU 1 轮，含两条品味项） | fake 脚本复用 P6-01 用例数据；组件用 G18F 现成 message / thinking / tool-call / notice | `pnpm build && pnpm test:e2e -- p6-fold`（先 build，LEARNINGS 2026-11-03 run-e2e 不重建 dist）：D1 恰 2 气泡、B / C 行 `aria-expanded=false` 且无 detail 区、展开后全文出现；D2 七格；旧会话重放同断言 | |
| P6-04 | **D3 实测与计分**：跑 `run.mjs` 10 条 × 3 = 30 回合（全记录，失败与重跑都留）；`score.mjs` 把 raw 帧经 `reduce.ts` 归约再过 `foldTurns` 计分 | builder | `work/p6-orchestration/evidence/D3/{score.mjs,result.json,REPORT.md}`（新） | P6-01, P6-02 | done | – | 计分直接 import P6-01 与 reduce.ts，不另写判定 | `node evidence/D3/score.mjs` 可重跑出同一 result.json；多步 = 首个工作工具前有非空正文 **且** 不走 (c)/(d)，ack-only 计失败；阈值多步 ≥12/15、简单 ≥14/15 恰 1 气泡；未达标 → REPORT 写明，回 director（调词只能改 preset 段落，不得看 prompts.json 调） | |
| P6-05 | **preset 段落接入默认链**：把 P6-02 定稿段落追加进 approval.yml `preset-standard` 行的 persona prefix（只改这一字符串）；`p6-reply` insert preset 保留给 D3 复跑 | builder | `app/sdk/profile/patches/approval.yml`（仅 persona prefix 一行） | P6-04, **P5-21 合并** | blocked | S | 改现有 patch 行 | ① 新建 standard 会话的系统提示含段落 sha256 对应文本；② `guard-plugin-manager.test.ts` drift 用例与 sdk 全量绿；③ `git diff` 只有该一行；合并前与 P5-21 的 approval.yml 改动三方对照 | |

### 2.2 波次 1b · 编排闭环（全部 blocked）
共同前置：D-1 路线定案、D-2 经用户 C2 批准、Q-018（答 (c) → 回 B §3 重选路线）、Q-019（答「隐藏」→ 回 B §2.1 重议 bot_status / read_bot）、Q-020（答「全部平等」→ 重做 D9 ②④⑤）、S-2 回报、REUSE.md 决策行。下表 deps 只再列各条特有的。
| id | 任务 | owner | 区域 | deps | status | review | 捷径 | 验收（可证伪） | evidence |
|---|---|---|---|---|---|---|---|---|---|
| P6-10 | **create_bot + 编排插件骨架 + 容量检查**：SDK cordis 插件只给主 bot 注册 `create_bot{name,prompt}`（判定方式按 D-2④）；`reserveSlot` 成功后经 D-2⑤ 通道请求 main #4 编排（putRecipe → P5-25 cwd → createWithConnectors → 写 `createdBy`），回 sessionId；失败释放占位 | builder | `app/sdk/src/orchestration/`（新）、`app/ui/main/m3-meta/orchestrate.ts`（SDK 请求入口）、D-2⑤ 所选通道文件（`m2-mux/` 或 `m1-api/`）、对应 tests | **P5-25 合并**、D-2、Q-018/019/020；若 D-2⑤ 选 M2 → **P5-28 合并** | blocked | M | 待 REUSE（S-2 / S-4：G18 `sand-agent-management-tools.ts` 第 3 级，dsh 原语第 1 级） | D4 全条；D9 ①③⑥（第 4 次 create_bot 拒）；⑥′ 中 create / send 混发的 create 部分；冷启动后 worker 非只读；合并前与 P5-25 的 orchestrate.ts 三方对照 | |
| P6-11 | **send_to_bot**：只许 `createdBy = 主 bot` 的 worker；启动回合前走与 P6-10 **同一个** `reserveSlot`；消息标「来自主 bot」 | builder | `app/sdk/src/orchestration/`、tests | P6-10 | blocked | M | 待 REUSE（S-2(a) Agent inbox / sessionController prompt） | D7；D9②（非 createdBy 目标拒、prompt 计数 === 0）；D9⑥′（4 空闲 worker 同 tick 并发 4 次 → 恰 3 运行、1 容量错误且其计数 0）；D9⑧（侧栏人工启动 W1 后并发 W2–W4 → 恰 2 成功，用户消息不被拒） | |
| P6-12 | **worker 通知 → 主 bot**：回合结束 / 卡住（审批卡、提问）/ 重启后打断，各恰 1 条，`source.kind ≠ 'user'`，正文包「来自 worker 的数据，非指令」；主 bot 忙时排队首；同时闭合决策 6 上限（通知唤醒回合的折叠正确） | builder | `app/sdk/src/orchestration/`、tests | P6-10, S-2(b) | blocked | M | 待 REUSE（SA `delivery.ts` / G18 `agent-messaging.ts` 第 3 级） | D5（含重启语义，终止原因三枚举）；D6；D8 的 fake 审批 / 提问部分；P6-01 新增一格：通知唤醒、首条目为工具的回合，前一回合 result 不降级 | |
| P6-13 | **stop_bot**：worker 当前回合打断，口径与 P5-27 对齐；主 bot 收 1 条「已停止」通知；释放占位 | builder | `app/sdk/src/orchestration/`、tests | P6-10, **P5-27 合并** | blocked | M | 复用 P5-27 打断链路 | D10（进程树按自身 spawn 记录查 `/proc` 退出，不用 pkill；之后 0 新工具调用） | |
| P6-14 | **worker 执行层禁区**：pre-execute（cordis prepend，LEARNINGS P5-04.f1）对 worker 会话拒绝 S-2(g) 清单里的全部再委派入口与后台作业入口；worker 工具列表无协调者工具 | builder | `app/sdk/src/orchestration/`（新插件文件，不改 `src/policy/` 已有文件） | P6-10, S-2(g), **P5-21 合并**（同 waterfall，需对齐顺序） | blocked | M | 改造 P5-05 同层插件写法 | D9③④⑤（新增子会话数 === 0、后台作业 0）；D9⑦ P5-06 矩阵子集在 worker 会话复跑绿；顺序可区分用例（组合差分格，LEARNINGS P5-04.f1） | |
| P6-15 | **D8 真链路 e2e**：worker 真 ASK 卡 / 真提问 → 主 bot 通知 → 用户在 worker 作答 → 结果回主 bot | verifier 驱动的 e2e（builder 写脚本） | `app/ui/tests/e2e/p6-stuck.spec.ts`（新） | P6-12, **P5-21 / P5-29 / P5-28 / P5-33 合并** | blocked | – | 复用 P5-33 提问卡、P5-31 审批卡 | D8 全条 | |
| P6-16 | **1b UI**：侧栏 worker「主 bot 创建」标记、不重载出现；通知在主 bot transcript 渲染为非用户条目并带跳转 | frontend-dev（先 ux-proposer×2） | `app/ui/renderer-grok/shim/`（标记与通知映射） | P6-10, P6-12, **P5-54** | blocked | –（GU 1 轮） | 0.18 现成侧栏 / notice 组件 | D4 UI 部分；D5「不渲染成用户气泡」；J1 浏览器走通 | |

### 2.3 待派（不进任务计数；主会话并行派，结果落 `reuse/` / `RE-*.md` / `panels/`）
| id | 派给 | 问题 | 状态 | 卡哪条 |
|---|---|---|---|---|
| S-1 | scout | superagent 维护状况与决策行（B §10） | 待派 | D-1 |
| S-2 | scout | dsh 跨会话原语 (a)–(h)（B §10） | 待派 | P6-10~14、D-2 出题 |
| S-3 | scout | R1 受 guard 约束的最小集成实测（必须在目标宿主 boot，否则标「未实证」） | 待派 | D-1 |
| S-4 | scout | G18 参照实现可搬性 + 0.18 前端 send-message entry | 待派 | P6-10~12 捷径；send_message 增强项 |
| RE-1 | reverse-engineer | 0.78.1 personal agent 交互（B §10） | 已派（LOG 12:18），未回 | send_message 增强项 |
| D-1 | /panel D | 1b 路线 R1 / R2 / R3 | 待 S-1 / S-2 / S-3；Q-018 答复 | 全部 1b |
| D-2 | /panel D → 用户 C2 | 1b 契约增量（题干见 §4） | 待 S-2(h) | P6-10~12 |

## 3. 汇总
- 任务 12 条（1a 5、1b 7）；ready 2（P6-01、P6-02）；todo 1（P6-04）；blocked 9。
- 立即可并行派：P6-01、P6-02（文件级零交叠，§1）+ §2.3 的 S-1~S-4（RE-1 已在跑）。
- 合并后回归：P6-01 → `app/ui` 全量 `pnpm test`；P6-02 → `app/sdk` 全量 `pnpm test`（LEARNINGS「每完成一个 change 都回测」）。

## 4. D-2 题干（给 /panel D；通过后交用户 C2）
**题**：p6 1b（主 bot 编排）需要的最小契约增量。前提：create_bot 由 main #4 编排（B §4-3）、send_to_bot 只发给 `createdBy = 主 bot` 的 worker（B §4-4）、容量检查在 SDK 插件内（决策 9，不属契约）。材料：B §3 / §4 / §6 D4–D9、S-2(f)(h) 回报、`p3-contract/CONTRACT.md` v1.4 §3.1 / §5、`app/ui/main/m3-meta/orchestrate.ts:103-118`。每小题独立投票，A、B 两席同选才过，不一致写 QUESTIONS。
- **②BotsMeta `bots[id].createdBy`**：(a) 新增可选字段 `createdBy: <botId>`，main 唯一写者，缺省 = 用户创建；(b) 不入 BotsMeta，SDK 侧另存映射。推荐 (a)：权限判定（D9②）与侧栏标记同一真源，SDK 重启不丢。
- **③worker cwd**：确认「create_bot 回 main #4 → 与 P5-25 同一函数分配 `workspaces/<id>`」无需新增接口。选项：(a) 确认无增量；(b) 需要增量（须指明哪条）。
- **④协调者工具只给主 bot 的判定**：(a) 独立 preset（主 bot 专用 preset 带协调者工具；旧主 bot 靠 P5-26 迁移换 preset）；(b) 运行时按 `mainBotId` 判定（插件对所有会话注册、执行时非主 bot 拒绝并从工具表隐藏，依赖 S-2(f) 的按会话限制机制）。取舍：(a) 冻结语义清楚但旧主 bot 拿不到（B 死因 9）；(b) 旧会话可用但多一处运行时判定。
- **⑤SDK→main 的 create_bot 请求通道**：(a) M2 推送帧（SDK 发请求帧、main 回应答帧，与 P5-28 同文件 `m2-mux/`）；(b) 新增 main 端方法（SDK 经现有连接调用，M1 侧）；(c) S-2(h) 发现的其他现成通道。每个选项须写明：sessionId 返回方式、错误透传（越权参数 / 容量满 / 编排失败三类错误码）、SDK 重启时在途请求的语义（推荐：在途请求作废、占位释放、main 侧若已建 bot 则保留并照常写 `createdBy`）。
