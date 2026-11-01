# 模型画像与派发对照

这份文件写给负责派发的一方（主会话、director、build-lead）。§1 告诉你派发时 Agent 工具填什么参数，§2 告诉你给不同模型写提示词时怎么写，§3 说明这些规则为什么存在。

画像会随使用更新：观察到新的模型行为后，在 §2 对应条目末尾追加一行「观察（日期）：…」，并在 `work/LEARNINGS.md` 记一条。

## §1 派发对照（Agent 工具参数）

slot 与实际模型的对应：`fable`=Opus 5.5，`opus`=GLM 5.3 1M，`sonnet`=6.1 Sol，`haiku`=K3.1 Pro。

**GLM 一律写完整 ID `glm-5.3[1m]`，不要写别名 `opus`**（2026-10-28 实测）：主会话是 Opus 5.5 时，`opus` 别名会被解析成主会话的 claude-opus-5-5，GLM 角色就悄悄变成了 Opus。frontmatter 和 workflow 的 `opts.model` 都填完整 ID。`fable`、`sonnet`、`haiku` 三个别名实测解析正确。Agent 工具的 `model` 参数只接受别名，所以 GLM 角色不要通过它传，靠 frontmatter。 **已实测（2026-10-28）**：frontmatter 写 `model: glm-5.3[1m]` 的 agent，从 Opus 会话派出时实际跑在 glm-5.3 上（builder、drafter 都靠这个）。

| 角色 | `subagent_type` | `model` 参数 | 实际模型 | 谁派 | 并行 |
|---|---|---|---|---|---|
| director | `director` | 不传 | Opus 5.5 | 主会话 | 单个 |
| build-lead | `build-lead` | 不传（frontmatter 为 `glm-5.3[1m]`） | GLM 5.3 | 主会话 | 单个 |
| scout | `scout` | 不传 | 6.1 Sol | director / 主会话 | 按能力多开 |
| reverse-engineer | `reverse-engineer` | 不传 | GLM 5.3 + REA | director / 主会话 | 按目标多开 |
| builder | `builder` | 不传 | GLM 5.3 | build-lead | 按 ready 任务多开 |
| ux-proposer 席 A | `ux-proposer` | `"fable"` | Opus 5.5 | build-lead | 与席 C 同一条消息派出 |
| ux-proposer 席 C | `ux-proposer` | `"haiku"` | K3.1 Pro | build-lead | 同上 |
| frontend-dev | `frontend-dev` | 不传 | Opus 5.5 | build-lead | 每条 UI 任务一个 |
| verifier | `verifier` | 不传 | GLM 5.3 | build-lead / 主会话 | 按任务多开 |
| judge 席 A | `judge` | `"fable"` | Opus 5.5 | `/panel` | 三席同一条消息派出 |
| judge 席 B | `judge` | `"sonnet"` | 6.1 Sol | `/panel` | 同上 |
| judge 席 C | `judge` | `"haiku"` | K3.1 Pro | `/panel` | 同上 |

规则：
- `judge` 和 `ux-proposer` 的 frontmatter 里**故意不锁模型**。漏传 `model` 时会继承会话模型（GLM），三席就退化成同一个模型，panel 等于没开。所以必须传。
- 其余 agent 一律**不传** `model`，以 frontmatter 为准。传了反而会覆盖掉。
- 默认前台派发。同一条消息里的多个前台 Agent 调用会并发执行，结果作为工具返回值回来，不会遗漏。
- 前提：`CLAUDE_CODE_SUBAGENT_MODEL=inherit`（claude-kimi 默认就是）。如果它被设成某个具体模型，所有 `model` 参数都会被覆盖，panel 也会失效。

## §2 模型画像（给它写提示词时怎么写）

### GLM 5.3 1M（`opus`）：主力工兵、编排者

- **code review**（用户判断 + bench，2026-10-28）：安全方向最强，也是大多数代码的主力 finder。召回尚可（Macroscope 76.4%），但精度最低（78.4%），所以**它的发现必须由 Sol 验证**，不能自证。

- **强项**：1M 上下文、快、成本低，可以大量并行；在单一、边界清楚的任务上可靠。
- **已知问题**（2026-10 旧方案中实际观察到）：
  - 当编排者时不主动派子代理，倾向自己动手
  - 容易提前宣布完成
- **提示词写法**：
  - 用编号步骤，写明产出哪个文件、回报用什么模板、停止条件是什么
  - 明确写「不要停下来请示能自己推进的事」
  - 每条硬规则后面跟一句为什么（见 §3）
  - 一个 agent 只给一条任务
- **观察（2026-10-28）**：模型探针要求「只回复收到」，GLM 却「顺带」去核验日志，5 个探针共调用 38 次工具。同样的 S 档 review，GLM 版耗时 19.5 分钟，是 Opus 版（7.9 分钟）的约 2.5 倍。所以停止条件必须写明，并靠多开并行来弥补速度。
- **作为主会话或 build-lead 时**：派发本身就是产出。每轮结束必须在 LOG 中写下「该派未派 = 0」这一行。

### Opus 5.5（`fable`）：director、前端定稿、裁决席 A

- **code review**：不担任 verifier，也不做常规 finder。用户实测发现，Opus 在 review 中能找到的问题 Sol 基本都能找到，而 Opus 成本最高、速度最慢（bench 约 10 分钟、11.6 美元一次）。它的额度主要留给开发路线和 plan 把关（director、panel 席 A）；在 review 中只在 M / L 档出 1 个深度 finder（跨文件影响、回归），召回率最高（83.8%）。

- **强项**：产品判断、品味、逆向思维，善于发现「问题本身问错了」。
- **倾向**：容易扩大范围、写得长。
- **提示词写法**：
  - 给目标、约束和动机，不给逐步清单，留出自主空间
  - 写明范围模式（EXPAND / HOLD / REDUCE）和篇幅上限
  - 要求列出「放弃了什么、为什么」

### 6.1 Sol（`sonnet`）：scout 调研、裁决席 B

- **code review**：后端正确性最强，同时承担验证。精度最高（Macroscope 90.7%，CodePanel 正常 PR 平均误报 0.7），速度最快、成本最低（约 4 分钟、1.05 美元）。它对审查范围的表述很敏感，所以提示词里的范围必须写死在 diff 命令和文件清单上。

- **强项**：证据纪律强，GitHub MCP 用得勤，适合查证和审查可行性。
- **观察（2026-10-27）**：字数上限给得太紧时，会把输出压缩成难以阅读的电报体。
- **提示词写法**：
  - 给出具体要查证的问题，尽量附上仓库或路径线索
  - 要求每条结论附证据路径
  - 字数上限放宽一些，并写明「用完整句子」

### K3.1 Pro（`haiku`）：ux-proposer 席 C、召回席 C

- **定位**：作为不同厂商的视角，负责发散和召回。它的发现必须得到回应，但不单独决定裁决（GU 闸门除外）。
- **画像待补**：本项目还没实测过。跑满 3 次 panel 后，由主会话根据它的发现命中率补写本节。
- **提示词写法**：鼓励主见和反提案，不要求面面俱到。

### 额度与分工总览

额度从少到多：Opus < Sol < GLM。

| | 方向 / plan | 实现 | code review | 评审 panel |
|---|---|---|---|---|
| Opus 5.5 | director（主） | 前端定稿 | M / L 档的 1 个深度 finder | 裁决席 A（路线把关） |
| 6.1 Sol | — | — | 后端 finder + 全部验证 | 裁决席 B |
| GLM 5.3 | — | builder、verifier（主） | 安全 finder + 主力 finder（主） | — |
| K3.1 Pro | — | ux 提案席 C | — | 召回席 C |

**实测（2026-10-28，v2 规划到第 0 波）**：输出 token（只统计 bots 的会话；初版统计误把同一 config 下其他项目的会话算进来，已更正）GLM 3.93M（73%）、Opus 1.02M（19%）、Sol 0.23M、K3 0.17M。Opus 的 76% 在 director 自己的会话里（BRIEF/PLAN 多次改版、回应 panel，以及等待 scout 时的心跳、轮询和记账），20% 在 panel A 席。用户 2026-10-28 认为 Opus 仍然偏多，需要压缩（见 DIVISION.md §3.2）。**大量调研、找素材一律交给 6.1 Sol（scout 池）**，Opus 不亲自做检索。

bench 数据来源与局限见 `CodeReview/Model.md`：数字由 GPT 整理、未逐条核实，且测的是 max 档。

## §3 为什么这样编排（动机，派发方必读）

| 规则 | 为什么 |
|---|---|
| 主会话不写代码、不写方案 | 主会话的上下文要撑过整个需求的生命周期。自己写代码会把上下文塞满，到了后面的阶段就会失忆。派发和记账就是主会话的产出 |
| 分两层（lead → 叶子） | 「调度一切」的职责太宽，模型会懒。lead 只盯一个阶段，范围窄、目标清楚，更不容易漏派 |
| 三模型 panel | 单个模型有固定盲点，而且倾向认同自己写的东西。不同厂商的模型出错的方式不同，交叉审查才能互相抓到 |
| 作者不自评 | 写的人最看不见自己的问题。verifier 和 panel 的存在就是为了推翻「已完成」 |
| Repo-first（先 scout 再写） | 40 个参考仓里已经有大部分轮子。重写等于引入新 bug，还浪费工兵时间 |
| 逆向规则 | Grok Bots 是闭源的，它的真实行为只能从产物中获得。但能读源码时就读源码，逆向的成本更高、确定性更低 |
| 一条任务一个 agent、一个 worktree | GLM 在单一明确的任务上最可靠；共享检出曾经互相覆盖 commit（2026-10-25） |
| 无冲突任务一次全部派出 | GLM 便宜，可以多开。串行派发是在浪费墙钟时间 |
| 证据绑定 commit SHA | 代码改了，旧证据就不再证明任何事情 |
| 修复最多 2 轮，之后交 director | 同一个提示词再试第 3 次，结果基本不会变，这时需要换路线 |

## §4 派发提示词模板（派发方填写）

```
任务：<id> <一句话>
slug：<slug>    仓库：/home/lingxufeng/bot
必读：work/<slug>/PLAN.md 中 <id> 行、REUSE.md 对应行、<其他文件>
完成标准：<PLAN 验收列原文，不改写>
为什么重要：<一句话，这条任务服务于哪条 DONE 条款>
回报：按你 agent 文件中「回报 / 输出」一节的格式
```

panel 用 `/panel` 自带的格式。派给 Opus 的任务可以省略步骤，但必须保留「为什么重要」。
