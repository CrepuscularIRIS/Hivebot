# 工程闭环协议（Personal Bots Harness）

> **2026-11-01 起，编排以 `.claude/skills/grok-orchestrate/SKILL.md` 为准**：改为一层派发（主会话 = GLM 5.3 直接派所有叶子 agent），`build-lead` 已归档，director 不再派 agent，不再用 cron tick 驱动。本文件里凡写「build-lead 负责 / lead 再派 / tick」的地方，一律读作「主会话负责」。阶段、PLAN 格式（§4）、panel 规则（§5）、逆向规则（§6）、review 档位（§7.1）仍然有效。

把一个需求做成「有验收证据的产品候选版本」的流程。CLAUDE.md 只放派发表；细节规则都在本文件，agents 按章节引用。

借鉴来源（只借机制，未安装）：gstack（Director 评审）、Compound Engineering（交付闭环 + 经验沉淀）、oh-my-claudecode（单一 loop authority、verify→fix 循环）、Ralph TUI / Beads（持久化任务图）。

## §0 铁律

1. **单一循环所有者**：主循环只由主会话里的 10 分钟 cron tick 驱动（§3）。不叠加 `/goal`、`/loop` 或任何插件 loop。
2. **主会话只调度和记账**：派发、更新状态、跑闸门。不写产品代码、不写方案、不自评。无论主会话是 GLM 还是 Opus 都一样（主会话是 Opus 时可以内联 director 的工作，但产物照样落盘）。
   **两层编排**：主会话只派 lead（`director`、`build-lead`）和 G 闸门的 panel；lead 再派叶子 agent（scout、reverse-engineer、builder、ux-proposer、frontend-dev、verifier、judge）。叶子 agent 不再往下派。
   这是一个待验证的假设：窄职责的 lead 应该比主会话更勤快地派发。如果 LOG 显示某个 lead 漏派，就退回由主会话按 §7 直接派叶子 agent，协议不需要改。
3. **一切落盘**：每个阶段产出一个文件，下一阶段只认文件，不认聊天记录。
4. **作者不自评**：方案由 panel 审，代码由 verifier + `mm-review`（多模型 code review，§7.1）审。
5. **证据驱动**：只有带证据的结论才能推进状态；失败证据会改写任务图，不允许原地重试同一个提示词。
6. **回执，不是承诺**（借鉴 OMC / CE）：
   - 「已派出」不等于完成，只认 agent 的终态回报
   - 证据绑定 commit SHA，分支 head 一变，旧证据就作废
   - 状态文件读不到、或者读到了解析不了，按「未完成」处理，绝不按成功处理
   - 中断后恢复：先读 PLAN 和 LOG，接着处理 running 的任务，不重复派工
7. **只向派发者回报**（2026-10-28 实测补丁）：Agent 寻址是扁平的，叶子 agent 能看见主会话，曾经把 8 次中间汇报直接发给了主会话。所以：
   - 叶子 agent 不用 SendMessage，所有结果写进文件和最终回报，最终回报会自动回到派发者手里
   - 主会话如果收到叶子的中间消息，不处理内容，只在 LOG 记一行，交给对应的 lead
8. **控制面经 lead**：主会话停不了孙代 agent。要冻结某条任务，就给对应 lead 发「冻结 <task-id>」，由 lead 执行（见 build-lead 的冻结条款）。lead 失联超过 2 次 tick → 主会话在 LOG 记一行，重派 lead 接管恢复（§0 第 6 条）

## §1 状态目录 `work/<slug>/`（git 跟踪）

| 文件 | 写入者 | 内容 |
|---|---|---|
| `BRIEF.md` | director | 目标、用户、核心旅程、完成标准（DONE 条款）、非目标、范围模式 |
| `reuse/<能力>.md` → `REUSE.md` | scout 各写一份 → director 合并 | 每项能力：集成 / 改造 / 逆向 / 自建 |
| `RE-<topic>.md` | reverse-engineer | 逆向结论 + 证据 + 局限 |
| `PLAN.md` | director 起草，主会话维护状态列 | 任务图（格式见 §4） |
| `panels/<gate>-r<n>-<席>.md` → `panels/<gate>-r<n>.md` | judge 各写原文 → 主会话只写汇总 | 三席原文 / 汇总结论 + 必须回应清单 |
| `REVIEW-<task>.md` | `mm-review` workflow | 多模型 code review 结论 |
| `ui/<task>-{A,C,final}.md` | ux-proposer / frontend-dev | 界面提案与定稿 |
| `VERIFY-<task>.md`、`evidence/` | verifier | 验收结论与证据 |
| `LOG.md` | 主会话 | 一行一事件：时间、动作、派给谁、结果 |

跨需求的经验写进 `work/LEARNINGS.md`（§10）。

## §2 阶段与闸门

```
Intake ─▶ G1 ─▶ Scout ─▶ [Reverse] ─▶ Plan ─▶ G2 ─▶ Build ⇄ Verify ─▶ G3 ─▶ Ship
 director  panel  scout   reverse-eng  director panel  builder×N  verifier  panel
                                                         frontend-dev (+GU)
```

| 阶段 | 进入条件 | 派谁 | 出口条件 |
|---|---|---|---|
| Intake | 用户提出需求 | director | `BRIEF.md` 写完，DONE 条款每条都能被证伪 |
| G1 | BRIEF 写完 | /panel G1 | PASS（§5） |
| Scout | G1 PASS | scout（按能力拆分，可多开） | BRIEF 中每项能力在 REUSE 都有决策行 |
| Reverse | REUSE 有「逆向」行，或命中 §6 规则 | reverse-engineer | `RE-*.md` 回答了 scout 提出的问题 |
| Plan | Scout 完成（以及 Reverse 完成） | director | `PLAN.md` 任务图：每条任务有验收、依赖、owner |
| G2 | PLAN 写完 | /panel G2 | PASS |
| Build | G2 PASS，任务 ready（依赖全部 done） | builder×N / frontend-dev | 回报 commit |
| Verify | 任意任务回报完成 | verifier | `VERIFY-<task>.md` PASS → 需要 review 的进入 Review，其余直接合并 |
| Review | 任务合并后（review 列 S/M/L） | build-lead 合并后直接调用 `mm-review`（§7.1） | `REVIEW-<task>.md`；FAIL 的 CONFIRMED critical/major → `.f` 任务 |
| G3 | 所有任务 done，整体验收 PASS | verifier（整体）+ `mm-review L`（整条分支）→ /panel G3 | PASS → Ship |
| Ship | G3 PASS | 主会话 | 合并、打 tag、写 LEARNINGS，删掉 cron tick |

**范围模式**（director 在 BRIEF 中声明，借鉴 gstack）：`EXPAND`（主动找出 10 星体验）/ `HOLD`（照单做好）/ `REDUCE`（砍到最小可用）。panel 审的是这个模式选得对不对，以及在该模式下做得好不好。

## §3 cron tick（循环驱动 + 进度监控）

主会话开工时用 CronCreate 建一个循环任务：`cron: "3-59/10 * * * *"`，`recurring: true`，prompt 写「按 docs/harness/PROTOCOL.md §3 跑一次 tick，slug=<slug>」。tick 只在主会话空闲时触发。Agent 和 Workflow 都是**异步**启动的，所以 tick 触发时很可能还有工作在跑：**只按落盘状态（PLAN 状态列、LOG、REVIEW/VERIFY 文件）判断阶段，绝不重派 status=running 的任务**。

每次 tick 按顺序做：
1. 读 `work/<slug>/PLAN.md`、`LOG.md` 末尾 20 行、`panels/` 最新记录，判断当前阶段。
2. 按 `docs/harness/CLAUDE.bots-v2.md` §5 派发表，找出当前阶段应该派的下一步，并派出去。tick 不能只看不派，除非处于等待用户状态。单任务 review 由 build-lead 负责（§7.1）。
3. 在 LOG 记一行快照：`<时间> tick | 阶段 | done/total | 本次派了谁 | blocker`。
4. 等待用户时：只在第一次 tick 用 PushNotification 提醒一次，之后的 tick 只记 LOG、不打扰。
5. **完成判定**：PLAN 中所有任务 status=done 且各有 VERIFY PASS（commit 等于 head），`panels/` 中有 G3 的 PASS 记录，BRIEF 中每条 DONE 条款在 `evidence/` 都有证据文件。三条全部满足才算完成：写 LEARNINGS → CronDelete → PushNotification。

注意：cron 任务只存在于当前会话，会话退出就消失，循环任务 7 天后自动过期。中断后重开会话，要重新建 tick（§0 第 6 条的恢复规则保证不会重复派工）。

**不许偷偷挪球门**：DONE 条款一旦经过 G1，任何修改都必须在 BRIEF 末尾的「修订账」里写清楚：改了什么、为什么改、哪次 panel 批准的。没有记录的修改，G3 一律判 BLOCK。

## §4 PLAN.md 任务图格式

```
| id | 任务 | owner | deps | status | review | 捷径 | 验收（可证伪） | evidence |
| T-01 | … | builder | – | todo | M | 复用 owner/repo@path / 无（理由） | `pytest tests/x` 绿；… | |
```

- **捷径列必填**：每条任务都要回答「有没有现成插件/库/资产可以直接用」。写「无」必须给理由。成熟开源插件维护多年，优先于自建
- owner ∈ builder / frontend-dev / reverse-engineer / scout
- status ∈ todo / ready / running / verify / review / done / blocked / frozen。依赖全部 done 的 todo 自动变成 ready
- review 列：`S` / `M` / `L` / `–`。由 director 在 Plan 时按风险填写（§7.1），verifier PASS 后照这一列决定是否进入 review
- 修复任务 id 写成 `T-07.f1`，deps 指向原任务。来源写进验收列：`来源 VERIFY-T-07`
- 一条任务最多 2 个 `.f` 修复轮。第 3 次失败时改为 `blocked`，交 director 重新规划（§8）

## §5 Panel（多模型评审 / 决策）

### 席位

| 席 | 派发 | 模型 | 默认权责 |
|---|---|---|---|
| A | `judge`, model=fable | Opus 5.5 | 裁决席 |
| B | `judge`, model=sonnet | 6.1 Sol | 裁决席 |
| C | `judge`, model=haiku | K3.1 Pro | 召回席：发现计入，不参与裁决 |

GU（界面）闸门例外：A + C 为裁决席，B 为召回席。

### 派发

三席**必须在同一条消息里并行派发**，提示词完全一致（只有 seat 字母不同），互相看不到对方结果。主会话不往提示词里加入自己的倾向。

### 汇总（机械执行，主会话不做判断）

1. 任一裁决席 BLOCK 且附证据 → **BLOCK**：回给作者，修完后重新开一轮 panel
2. 两个裁决席都 PASS → **PASS**
3. 其余情况 → **REVISE**
4. 不论结论是什么，所有席位（包括召回席）带证据的 BLOCKER/HIGH 发现都进入「必须回应清单」。作者要逐条写「已改 / 不改 + 理由」，追加到 panel 记录里
5. 最多 2 轮（用户 2026-10-28，为省 Opus）：第 2 轮仍为 REVISE → 有条件通过，必须回应清单转成首批任务；第 2 轮为 BLOCK → 暂停，交用户拍板

### 决策题（D）

以下情况不由单个模型拍板，必须走 D 投票：技术栈与框架选型；核心能力是复用还是自建（scout 结论拿不准时）；是否做逆向（§6 中「panel 决定」的情况）；契约或架构的修改；砍掉用户可见的功能。

规则：三席多数票通过。如果涉及安全或不可逆操作，必须 A 和 B 一致，否则交用户。三席各投一个不同选项时，交 director 裁定并写明理由。

记录写进 `panels/D-<nn>-<主题>.md`。

## §6 何时逆向（REA）

本机已有大量产物：Grok Bot 0.75.0 装在 `/opt/Grok Bot`；`~/Downloads/` 下有 grok-bot、ChatGPT、Cursor、ZCode 等桌面应用的 deb / AppImage。缺什么就用 GitHub MCP 或官方渠道补。私用不分发，逆向和资产复用都不设限。

| 情况 | 动作 |
|---|---|
| 要复刻的行为或前端资产来自闭源产物（Grok Bot 本体、其他桌面应用、线上网站） | **直接派** reverse-engineer，不需要投票 |
| 开源仓的源码与实际发布的版本可能不一致 | 读源码，同时拿发布产物交叉验证（D 投票决定要不要逆向） |
| 可读的开源仓 | 直接读源码或直接复用，不逆向 |
| 凭证文件（`~/.grokbot` 中的 credential、token） | 不读取内容，凭证不进模型 |

派发时必须写清：目标产物路径或 URL，以及 1~3 个具体问题（例如「消息流的重连与补发是怎么实现的」）。逆向结论是 Plan 的输入，不能直接拿来当代码。

## §7 Build ⇄ Verify

整个循环由 `build-lead` 负责（详见该 agent 文件）：G2 PASS 后，主会话只派一次 build-lead，等它回报「全部完成」或「blocked」。以下是 build-lead 执行时遵守的规则：

- 每个 ready 任务派一个 builder，每个 builder 一个独立 worktree（`/tmp/bot-wt/<task-id>`）。无冲突的 ready 任务**一次全部派出**
- UI 任务：ux-proposer ×2（haiku / fable，并行）→ frontend-dev 定稿实现 → verifier → GU panel
- 任何回报完成 → verifier。VERIFY PASS 后：review 列为 `–` → 合并；否则合并后调用 mm-review，不等待
- VERIFY FAIL → 主会话把 `[FIX]` 行原样变成 `.f` 任务并重新派发。不允许主会话自己改代码
- 合并：逐文件清单 checkout，禁止 `git checkout <commit> -- .` 整树覆盖。合并后检查：任务关键标记 grep 能命中，测试数量没有下降

### §7.1 Code review（`mm-review` workflow：单任务由 build-lead 调用，G3 整分支由主会话调用）

code review 是一个 Claude Code workflow，按档位预设决定规模。**负责人唯一**：单任务 review 由 build-lead 在合并后直接调用；主会话只跑 G3 前的整分支 L 档。（2026-10-29 曾因两处文档写了不同的负责人，导致 14 个任务合并后无人 review。）

| 档位 | 用于 | 规模与模型分工 |
|---|---|---|
| `S` | 普通后端 | 2 个 finder（GLM、Sol），交叉验证 |
| `M` | 安全 / 协议 / 存储 / 鉴权 | 5 个 finder（GLM 安全 + 正确性，Sol 后端 + 并发，Opus 深度），交叉验证 |
| `L` | G3 前整条分支 | M 的全部 + Sol sweep 补漏。路线一致性由 panel G3 负责 |
| `–` | UI 任务（走 GU panel）、纯文档 | 不跑 |

细则见 `docs/harness/REVIEW.md`。

**review 不阻塞合并**（用户 2026-10-28）：VERIFY PASS 就合并进 main，mm-review 在合并后跑；REVIEW FAIL 的 CONFIRMED critical/major 变成 `.f` 修复任务（照常 verify），不回滚已合并的代码。理由：review 串行排队曾经卡住整波合并，导致下游任务无法解锁、用户看不到产品。
流程：调用 `Workflow({name:"mm-review", args:"<档位> <slug> <task-id> <分支>"})`，结果写进 `REVIEW-<task>.md`。整分支 L 档跑完后，主会话把它覆盖的任务逐行写进 `work/<slug>/review-coverage.txt`（`T-xx REVIEW-<名字>.md`）。
- 没有 CONFIRMED 的 BLOCKER/HIGH → PASS，由 build-lead 合并
- 有 → 每条变成一个 `.f` 任务（status=ready），交给 build-lead
- 同一任务 review 失败与 VERIFY 失败一起计数，上限仍是 2 轮（§4）

## §8 停止与升级

| 信号 | 动作 |
|---|---|
| 任务第 3 次失败 / panel 第 3 轮 REVISE | 改为 blocked，派 director 重新规划这条任务（拆分、换路线、改用复用方案） |
| director 重新规划后仍 blocked | 暂停，交用户 |
| 需要产品取舍、花钱 | 交用户，一次最多 3 个问题 |
| §3 完成判定满足 | 写 LEARNINGS，CronDelete，通知用户 |

## §9 方法论映射（superpowers + ponytail）

各阶段使用的 skill 如下。ponytail 在所有写代码和写方案的环节都生效（复用 > 标准库 > 已装依赖 > 最少新代码），panel 也会把过度设计当作问题报出来。

| 阶段 | 角色 | superpowers skill |
|---|---|---|
| Intake | director | `brainstorming`（一次只问一个问题，先理解再发散） |
| Plan | director | `writing-plans` |
| Build | builder / frontend-dev | `test-driven-development`、`using-git-worktrees` |
| Build 中遇到 bug / FIX 任务 | builder | `systematic-debugging`（先找根因再修） |
| Build 编排 | build-lead | `dispatching-parallel-agents`、`subagent-driven-development` |
| Verify | verifier | `verification-before-completion`（先有证据再下结论） |
| 审查回应 | director / frontend-dev / builder（`.f` 任务） | `receiving-code-review`（逐条核实，不表演式同意） |
| Ship | 主会话 | `finishing-a-development-branch` |

浏览器操作一律用 `playwright-cli` skill。

## §10 经验沉淀（借鉴 Compound Engineering）

每次 Ship 之后，以及每个任务 blocked 之后，主会话在 `work/LEARNINGS.md` 追加记录，每条 ≤3 行：现象 → 根因 → 下次的规则。director 每次 Intake 和 Plan 之前必须先读这个文件。
