# PLAN · p6-orchestration（主 bot 编排 + personal agent 三段式交互）

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
| P6-03 | **D1/D2 DOM 验收（新 renderer）**：确认 P5-51 shim 经 P6-01 映射；D1、D2 七格用 fake provider 脚本跑 DOM e2e；在 1a 之前建的会话上重放 D1 | frontend-dev | `app/ui/tests/e2e/p6-fold.spec.ts`（新）；接线若缺，只补 `app/ui/renderer-grok/shim/` 中调用 `foldTurns` 的那一处 | P5-51, P6-01 | blocked | –（GU 1 轮，含两条品味项） | fake 脚本复用 P6-01 用例数据；组件用 G18F 现成 message / thinking / tool-call / notice | `pnpm build && pnpm test:e2e -- p6-fold`（先 build，LEARNINGS 2026-11-03 run-e2e 不重建 dist）：D1 恰 2 气泡、B / C 行 `aria-expanded=false` 且无 detail 区、展开后全文出现；D2 七格；旧会话重放同断言 | |
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
