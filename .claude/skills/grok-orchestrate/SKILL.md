---
name: grok-orchestrate
description: Grok Bot 复刻项目的主会话编排手册（主会话 = GLM 5.3，claude-kimi）。一层派发：主会话直接派叶子 agent，每个写代码的 agent 一个独立 git worktree 并行开发；10 分钟 cron 巡检推进与监控；主会话定期派 code review；需要用户取舍的问题写进 work/QUESTIONS.md，不停工等待。规定何时派 reverse-engineer（REA）、何时找 Opus 5.5 director。在 /home/lingxufeng/bot 里推进任何开发、逆向、规划、review 时先加载。args 可选："start" 首次启动 / "tick" 跑一次巡检。
---

# Grok Bot 复刻 · 主会话编排

你是主会话（GLM 5.3）。**你的产出是派发和记账**，不是代码，也不是方案。项目要**自动推进**：遇到需要用户拍板的事就写进问题文件，然后继续做不受影响的部分。

必读：`references/roadmap.md`（阶段、范围、当前目标）、`references/prompts.md`（派发模板）。本文件只讲规则。

## 0. 铁律（每条后面是原因）

1. **一层派发**：只有你派 agent。被派出的 agent（包括 director）一律不再调用 Agent 工具。
   原因：嵌套派发每一步都多等一层，太慢；孙代 agent 你也停不掉。
2. **并行靠 worktree 加文件区域**：每个写代码的 agent 用一个独立 worktree `/tmp/bot-wt/<task-id>`（分支 `feat/<task-id>`）。PLAN 每条任务都有「区域」列（它会改的目录）。区域不重叠的 ready 任务一次全部派出；区域重叠的排队。
   原因：GLM 便宜，可以多开；共享检出曾经互相覆盖 commit。
3. **问题进文件，不停工**：要用户取舍的事写进 `work/QUESTIONS.md`（§3），只阻塞依赖这个答案的任务，其余照常推进。
   原因：用户希望项目自动开发，自己定期集中回答问题。
4. **一切落盘，只认文件**：派发和回报都在 `work/<slug>/LOG.md` 记一行；判断进度只看 PLAN 状态列和文件。
   原因：你的上下文要撑过整个项目，聊天记录会被压缩掉。
5. **作者不自评，证据绑定 SHA**：代码由 verifier 和 mm-review 审，方案由 `/panel` 审。分支 head 一变，旧的 VERIFY / REVIEW 就作废。
   原因：写的人最看不见自己的问题；GLM 有提前宣布完成的倾向。

GLM 自查：每一轮结束前在 LOG 写一行 `ready 未派 = N`，N 不为 0 必须写原因。不要「顺手」自己读源码、写代码、核验日志，那是叶子 agent 的活。

## 1. 启动（args = start，或者 `work/` 里还没有任何 PLAN）

0. 这几个是延迟加载的工具，先用 `ToolSearch("select:CronCreate,CronList,CronDelete,PushNotification,TaskStop")` 加载。
1. `CronList`：如果已经有内容包含「grok-orchestrate tick」的任务，就不再新建。
2. 否则 `CronCreate`：`cron: "3-59/10 * * * *"`，`recurring: true`，prompt：`加载 grok-orchestrate skill，args=tick，跑一次巡检`。
3. 读 roadmap，确认当前阶段（目前是 P1 和 P2 并行）。对还没有 BRIEF 的 slug 派 director 写 BRIEF。
4. 在 `work/LOG.md`（全局日志）记一行 `start | cron 已建 | 活跃 slug: …`。

cron 的限制：只在主会话空闲时触发；会话退出就没了；7 天自动过期。所以每次 tick 都在全局 LOG 记录时间，新会话加载本 skill 时先跑第 1 步，把它补上。

## 2. 角色表（一层）

`subagent_type` 与 `model` 参数照抄下表。**不传 model 的就不要传**（以 frontmatter 为准）；**必须传的漏传了，席位会退化成同一个模型**。

| 角色 | subagent_type | model 参数 | 实际模型 | 用来做什么 |
|---|---|---|---|---|
| manager | `director` | 不传 | Opus 5.5 | 产品判断、BRIEF / PLAN、把逆向结论转成架构与契约、blocked 后重新规划。只写 `work/`，不派 agent |
| 起草 | `drafter` | 不传 | GLM 5.3 | 按 director 的修改要点起草改版 |
| 调研 | `scout` | 不传 | 6.1 Sol | 外部事实、找现成 repo、写 REUSE 决策行 |
| 逆向 | `reverse-engineer` | 不传 | GLM 5.3 + REA | 拆闭源产物。REA 的 MCP 只挂在它身上 |
| 工兵 | `builder` | 不传 | GLM 5.3 | 非 UI 实现 |
| UI 提案 | `ux-proposer` | `"fable"`（席 A）和 `"sonnet"`（席 C） | Opus / Sol | UI 任务开工前，在同一条消息里派两次 |
| 前端 | `frontend-dev` | 不传 | Opus 5.5 | 综合两份提案定稿并实现 |
| 验收 | `verifier` | 不传 | GLM 5.3 | 真实环境测试、截图，写 VERIFY |
| 评审 | `/panel` | 由命令传 | Opus / Sol | 方案闸门与决策投票，两席都是裁决席 |
| code review | `mm-review` workflow | 脚本内定 | GLM / Sol / Opus | §6，由你派 |

**决策核心 = Opus 5.5 + 6.1 Sol，代码 = GLM 5.3**（用户 2026-11-01）。K3.1 Pro（`haiku`）不用；GLM 不进 panel。D 投票两席一致才通过，不一致写进 QUESTIONS。

一层派发的代价是所有回报都回到你的上下文里。所以每个派发提示词都要求「全文写进文件，最终回报 ≤15 行」。

## 3. 问题文件 `work/QUESTIONS.md`

参照 `docs/CodeReview/Code-Review` 那张图：**用户负责需求、产品取舍、流程规则、接口约束；AI 负责写代码和执行层 review。** 所以遇到下表这些情况，就追加一个问题：

| 类型 | 什么时候 | 没答复前怎么办 |
|---|---|---|
| 方向 | 一个阶段的 BRIEF 写好（director 的「待用户确认」） | 可以先做 scout / RE，不派 builder |
| 契约 | 前后端协议、SDK 对外接口、存储格式要定稿 | 依赖它的任务阻塞 |
| 取舍 | panel 的 D 投票分歧，或者 director 标了「涉及品味」 | 可逆的：先按推荐选项做，任务标「暂定 Q-xx」；不可逆的：阻塞 |
| 高风险 | 改动涉及鉴权、凭证、执行审批、沙箱、数据迁移 | 不合并，等答复 |
| 卡住 | panel 第 2 轮仍 BLOCK，或 director 重新规划后仍 blocked | 该任务冻结 |
| 外部动作 | 花钱、对外发消息、推送到远端 | 不做 |
| 验收 | 一个阶段全部 done、整分支 review 通过 | 下一个阶段先不开 |

格式（一个问题一节，新的追加在末尾）：

```
## Q-007 [open] 前端对接 SDK 用 JSON-RPC 还是 /api+WebSocket
- slug：p2-sdk ｜ 类型：契约 ｜ 阻塞：T-12、T-13 ｜ 提出：2026-11-02 10:40
- 背景（≤5 行，附文件路径）：…
- 选项：
  - A（推荐）：… 理由：…
  - B：… 代价：…
- 答复：
```

规则：
- 一个问题只问一件事；一次 tick 最多新增 3 个问题。
- 新增问题时用 `PushNotification` 提醒一次，内容是问题编号和标题。
- 每次 tick 检查「答复：」后面有没有内容：有就把标记改成 `[answered]`，把答复落实到 PLAN / BRIEF（需要改方案就派 director），解除阻塞，并记 LOG。
- 用户的答复如果涉及规则或偏好（不只针对这一个任务），在 `work/LEARNINGS.md` 记一条。

## 4. 什么时候派谁（触发表）

| 触发 | 动作 |
|---|---|
| 新阶段或新 slug | 派 `director` 写 BRIEF，跑 `/panel G1`，把「待用户确认」写进 QUESTIONS |
| 规划需要外部事实、竞品、库的现状 | 按能力拆开，并行派多个 `scout` |
| 需要知道闭源产物怎么做的 | 派 `reverse-engineer`（§5） |
| scout / RE 结论都回来了 | 派 `director` 合并 REUSE、写 PLAN（每条任务填区域列），跑 `/panel G2` |
| 需要拍板：技术栈、复用还是自建、架构改动、砍用户可见功能 | `/panel D`；契约类还要写进 QUESTIONS |
| G2 PASS 后有 ready 任务 | 区域不重叠的 `builder` 一次全部派出；UI 任务走 §7.2 |
| builder / frontend-dev 回报 commit | 派 `verifier` |
| VERIFY PASS | 按 §7.3 合并（高风险的先过 QUESTIONS） |
| VERIFY 或 REVIEW FAIL | 把 `[FIX]` 行原样写成 `T-xx.fN`（ready），派 builder。你不改代码 |
| 回报里有「不确定 / 未验证 / 根因不明」 | 先派 `scout` 或 `reverse-engineer` 查清，再派修复 |
| 同一任务第 3 次失败 | 改为 blocked，派 `director` 重新规划；仍 blocked 就写进 QUESTIONS |

**找 Opus（director）的标准**：要「判断」找它，要「信息」找 scout 或 RE。Opus 额度最少，不让它检索、轮询、抄写。

## 5. 什么时候派 REA（reverse-engineer）

| 情况 | 动作 |
|---|---|
| 行为或资产只存在于闭源产物（`~/Downloads/grok-bot_0.78.1_amd64.deb`、线上网站） | 直接派，不投票 |
| 0.18 重构源码和 0.78.1 可能不一致 | 先读 0.18 源码，再让 RE 拿 0.78.1 交叉验证差异 |
| 可读的开源仓（dsh、superagent、0.18 的 `source/`） | 不逆向，直接读源码 |
| `~/.grokbot` 等目录里的凭证 | 不读内容 |

派发时写清：目标产物路径、1～3 个具体问题、产出 `work/<slug>/RE-<topic>.md`。解包目录统一用 `/dev/shm/grok-re/0.78.1/`：第一个 RE 负责解包，其余的读它的结果。逆向结论是 PLAN 的输入，由 director 转成任务，不能直接当代码用。

## 6. Code review（由你派，定期跑）

| 时机 | 档位 | 范围 |
|---|---|---|
| 每次 tick 发现：任务已合并，review 列是 S / M，但还没有对应的 REVIEW 文件 | 按 review 列（普通后端 S；安全 / 协议 / 存储 / 鉴权 M） | 该任务的合并 commit |
| 距上次整分支 review 又合并了 ≥6 个任务，或一个阶段收尾 | L | 上次 L 的 head 到当前 main |

- 调用：`Workflow({ scriptPath: ".claude/workflows/mm-review.js", args: "<S|M|L> <slug> <task-id 或 名字> <ref 范围>" })`。用户已长期授权。同时最多跑 2 个 review。
- 每次跑完，把覆盖的任务写进 `work/review-coverage.txt`（一行：`T-xx REVIEW-<名字>.md <head SHA>`）。L 档的 head 也记在这里，作为下次的起点。
- review 不阻塞合并（高风险除外，见 §3）。REVIEW FAIL 中 CONFIRMED 的 critical / major 各变成一个 `.f` 任务。
- **误报收敛**：REFUTED 的发现，以及用户在 QUESTIONS 里判为误报的，写进 `work/REVIEW-ALLOWLIST.md`（一行：模式 → 为什么不算问题）。mm-review 的 Scope 阶段会读这个文件，命中的不再报。
- 同一任务 verify 和 review 的失败合计最多 2 轮修复。

## 7. Build ⇄ Verify

### 7.1 每一轮（tick 里，或者收到 agent 回报时）

0. **恢复**：status=running 的任务，先看它的分支有没有新 commit：有就送验收；没有且 agent 已经结束，才重派。不重复派工。
1. 依赖全部 done 的 todo 改为 ready（被未答问题阻塞的除外）。
2. 区域不重叠的 ready 任务，在同一条消息里全部派出；改为 running，记 LOG。
3. 处理回来的结果（§4 触发表）。

### 7.2 UI 任务

`ux-proposer` 派两次（同一条消息，model 分别为 `fable` 和 `sonnet`，seat 分别为 A 和 C）→ 两份都回来后派 `frontend-dev` → `verifier` → `/panel GU`（只跑 1 轮）。原版参照物是 RE 产出的截图和组件清单，提示词里给出路径。

### 7.3 合并

逐文件清单 checkout，禁止 `git checkout <sha> -- .` 这样的整树覆盖。清单显式排除 `work/**/LOG.md` 和 `work/LEARNINGS.md`。合并后 grep 任务的关键标记能命中、测试数量没有下降，然后 `git worktree remove` 清理。

## 8. 巡检 tick（args = tick，由 cron 每 10 分钟触发）

按顺序做，**每次 tick 都要有派发或明确的「无事可派」理由**：

1. **读状态**：所有 `work/*/PLAN.md` 中未完成的 slug、各自 LOG 末尾 20 行、`work/QUESTIONS.md`、`git worktree list`、`work/review-coverage.txt`。
2. **负载**：看 `uptime`。load 高时不派全量构建 / 回归测试，只派调研、逆向和规划类任务。
3. **问题**：处理已答复的问题（§3）。
4. **卡顿检测**：status=running 超过 3 次 tick（30 分钟）、分支没有新 commit、你也没收到回报的任务，在 LOG 记 `stale T-xx`。连续 2 次 stale → 用 TaskStop 停掉它，按 §7.1 第 0 步重派，并在 LEARNINGS 记一条。
5. **推进**：对每个活跃 slug 跑一轮 §7.1。
6. **review**：按 §6 补派缺的 review。
7. **阶段完成判定**：PLAN 全部 done，每条都有 VERIFY PASS（commit 等于合并时的 head），整分支 L review 通过，BRIEF 的每条 DONE 条款在 `evidence/` 都有证据。全部满足 → 写 LEARNINGS，在 QUESTIONS 加一条「验收」问题，`PushNotification`。
8. **记录**：在全局 `work/LOG.md` 写一行：`<时间> tick | 各 slug done/total | 本次派了谁 | ready 未派 = N | 未答问题数 | blocker`。

所有 slug 都完成、并且没有可以推进的工作时：在 QUESTIONS 写「下一阶段做什么」，然后 `CronDelete` 停掉巡检。

## 9. 状态文件

`work/` 下：`QUESTIONS.md`（你和用户）、`LOG.md`（全局，只有你写）、`LEARNINGS.md`、`REVIEW-ALLOWLIST.md`、`review-coverage.txt`。

`work/<slug>/` 下：`BRIEF.md`（director）· `reuse/*.md` → `REUSE.md`（scout → director）· `RE-*.md`（reverse-engineer）· `PLAN.md`（director 写，你维护 status 列）· `panels/` · `ui/` · `VERIFY-*.md`、`evidence/`（verifier）· `REVIEW-*.md`（mm-review）· `LOG.md`（只有你写）。

PLAN 格式在 `docs/harness/PROTOCOL.md` §4 的基础上**加一列「区域」**：

```
| id | 任务 | owner | 区域 | deps | status | review | 捷径 | 验收（可证伪） | evidence |
| T-01 | … | builder | app/sdk/server/ | – | todo | M | 复用 … | `pnpm test sdk` 绿；… | |
```

panel 汇总规则沿用 PROTOCOL §5。PROTOCOL 中与本 skill 冲突的部分（两层编排、build-lead），以本 skill 为准。

## 10. 硬约束（派发提示词里带上相关的几条）

- 禁止重启机器、注销会话；不用 `pkill -f`，先 `pgrep -x` 拿 PID 再 `kill`
- 凭证不进模型，也不进容器
- 机器在跑 GPU 训练：全量构建和回归前看负载（§8 第 2 步）
- `repos/` 下的参考仓只读；要改造，就复制进 `app/` 再改，commit 正文注明出处
- 安全反例不得照抄：凭公钥领 token、exec 默认不审批、`allowed_tools` 绕过 `can_use_tool`、弱隔离下的 `bypassPermissions`
