# 派发提示词模板（一层派发版）

每个模板末尾都要带上「通用尾巴」。写给 GLM 的用编号步骤；写给 Opus 的给目标和动机；写给 Sol 的把范围写死，并要求用完整句子（MODELS.md §2）。

## 通用尾巴（每个派发都加）

```
- 你是被主会话直接派出的 agent，不要调用 Agent 工具再往下派，也不要用 SendMessage。
- 先读 work/LEARNINGS.md（如果存在）。
- 全文写进上面指定的文件。最终回报 ≤15 行：结论、产出文件路径、未完成项、需要主会话做什么。
- 停止条件：<写清楚>。卡住两次就停下来回报，不要第三次盲试。
- 中文。
```

## director（Opus 5.5）

```
目标：<这一步要回答的判断题 / 要产出的 BRIEF 或 PLAN>
为什么重要：<服务于哪个阶段、哪条 DONE 条款>
输入文件：<RE-*.md、reuse/*.md、上一版 PLAN、panel 汇总……>
约束：范围模式 <EXPAND|HOLD|REDUCE>；篇幅上限 <N> 行；列出放弃了什么、为什么。
需要外部事实时，不要自己查：在文件末尾的「待查」一节写出问题，主会话会派 scout。
产出：work/<slug>/<文件>
```

## scout（6.1 Sol）

```
任务：为能力「<名称>」找现成实现，并写出决策行。
范围：本地 repos/<…>，以及 GitHub。只回答下面这些问题：
1. …
2. …
产出：work/<slug>/reuse/<能力>.md（表格格式见 scout agent 文件）。每条结论附证据（文件:行 或 URL）。请用完整句子。
```

## reverse-engineer（GLM 5.3 + REA）

```
目标产物：<路径>    解包目录：/dev/shm/grok-re/0.78.1/（已解包则直接读，不要重复解包）
要回答的问题（只回答这几个）：
1. …
2. …
步骤：
1. 读 reverse-engineer-anything skill。
2. REA 先用 detail:"summary"，再按 source_paths 逐个深入。
3. 每条结论附证据（文件 / 偏移 / 函数 / 请求）。
4. 写 work/<slug>/RE-<topic>.md：结论先行 → 证据 → 复刻要点 → 局限与未验证项。
停止条件：上面的问题都回答完，或者确认无法回答（写明缺什么工具或数据）。
```

## builder（GLM 5.3）

```
任务：<T-xx> <一句话>
slug：<slug>    仓库：/home/lingxufeng/bot    worktree：/tmp/bot-wt/<T-xx>（分支 feat/<T-xx>）
区域：<PLAN 区域列>。只改这些目录；必须改区域外的文件时，停下来回报，不要自己改（别的 agent 正在并行改那里）。
必读：PLAN.md 中 <T-xx> 行；REUSE.md 对应行；<RE / CONTRACT 文件>
验收（原文照抄，不要改写）：<PLAN 验收列>
步骤：
1. `git -C /home/lingxufeng/bot worktree add /tmp/bot-wt/<T-xx> -b feat/<T-xx> main`，只在 worktree 里改。
2. 把验收条件先写成测试（红），再实现（绿）。
3. REUSE 写「集成 / 改造」的，就照着复用，不要重写。复制的文件头和 commit 正文写 `来源: <url>@<sha>:<path>`（CLAUDE.md §3）。
4. 小步 commit，正文写出处与复测命令。
回报：分支、commit SHA、改动文件、测试命令和最后几行输出、未完成项。最后写一句「待 verifier 验收」。
```

## verifier（GLM 5.3）

```
验收：<T-xx>    分支 / worktree：<…>    head SHA：<…>
验收项（原文照抄）：<…>
步骤：从干净状态安装、构建、跑测试；每条验收项都要有证据；再试一条最相关的坏路径；UI 用 playwright-cli，只截目标窗口，并 Read 截图亲眼确认。
产出：work/<slug>/VERIFY-<T-xx>.md（格式见 verifier agent 文件），证据放在 evidence/。
```
