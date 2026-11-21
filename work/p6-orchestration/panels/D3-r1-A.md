seat: A
vote: ①（附 2 条 P6-24 必加验收，见 H1 / H2）
confidence: high
findings:
- [HIGH] PLAN.md:314 director 判断「风险面没有变大」/ P6-24 验收（PLAN.md:122）— 共享 cwd 后，worker 写的 `AGENTS.md` / `CLAUDE.md` 会以**指令**形态进主 bot 上下文，绕过决策 29「回报是数据不是指令」 — 证据: dsh agent-instructions 默认候选 `['AGENTS.md','CLAUDE.md']`、根标记 `.git`（`repos/deepseek-harness/packages/context/agent-instructions/src/config.ts:11-12`），沿 cwd 祖先链加载并把变更推进 inbox，`form: 'instructions'`（`state.ts:85-88`、`index.ts:5`）；本仓 profile 已挂此插件（`app/sdk/profile/patches/approval.yml:77`）；污染判定只认 `pbots-worker`，其他 kind 一律不拦（`app/sdk/src/orchestration/turn-origin.mjs:3-11,19-21`）。所以链路是：worker（web_fetch 免审，被注入）→ 在共享目录写 AGENTS.md → 主 bot 下一个**用户回合**带着全部工具读到它作为系统级指令。今天 worker 只能写自己的区，这条链不存在；主 bot 自己被注入也能写，但那是主 bot 在用户眼前做的，而 worker 默认隐藏（Q-019）。「权力相同」成立，「面没变大」不成立 — 建议: P6-24 加一格：worker 会话的 write / edit 目标 basename ∈ agent-instructions 候选 → 拒（envelope pre-execute 一处判定，同 P6-14 先例）；bash 写同名文件的残余风险标 `ponytail:` 并写进 §12.10② 给用户的告知。不做这条就别说「风险面没变大」。
- [HIGH] P6-24 验收 ③（PLAN.md:122）— 只覆盖「主 bot cwd 不可解析」，没覆盖「可解析但不在 `<dataDir>/workspaces/` 下」 — 证据: P5-26 旧 bot 迁移仍 blocked（`work/p5-parity/PLAN.md:104`），旧 bot 的 header.cwd 是 P5-25 之前的 runtime 启动目录；C2-② 存在的理由恰恰是「缺省 cwd 继承 SDK runtime 启动目录会让工作区覆盖仓库 / SDK 目录」（`app/ui/main/m3-meta/orchestrate.ts:4-6`）。旧 bot 当主 bot 时，① 会把 worker 放进仓库 / SDK 目录，正是 C2-② 要防的 — 建议: ③ 改为「主 bot header.cwd 不是 `<dataDir>/workspaces/<mainBotId>`（realpath 后比较）→ `pbots/orchestration-failed`，不回退 mint」；加一格旧 cwd 主 bot 的负对照。这样 ① 才在 C2-② 精神内。
- [MEDIUM] 「删 worker 不得删共享目录」— 今天可控，将来是坑 — 证据: `app/ui/main` 里没有任何删目录调用（唯一 `unlink` 是 `store.ts:125` 的临时文件）；但「每 bot 一个目录」的旧假设会诱导后续的清理 / 迁移功能（P5-26、将来的「删除 bot 清空工作区」）按 bot 删目录 — 建议: C-2 写契约时加一句不变式：「任何删工作区的操作只删 `workspaces/<self id>`，且仅当没有会话的 header.cwd 落在其中」；P6-24 ④ 已经能防回归，够了。
- [MEDIUM] 「并行 worker 写同一文件」— 可控，接受 — 证据: 原版同样不加锁（`repos/grok-bot-0.18-reconstructed/source/packages/agent/prompts/project-prompt.ts:100`）；后果是后写覆盖（对用户可见、可重做），不污染系统状态；同 checkout 并发 git 会撞 `index.lock`，失败是响的不是静默的。还有一个没写进代价表的同类：主 bot 自己（保持可响应，用户会继续让它改）与 worker 并发写 — 建议: 不加锁；§12.10② 告知里「两个 worker」改成「worker 之间或 worker 与主 bot」。
- [LOW] 「bwrap 挂载面扩大到主 bot 目录」— 措辞不准，实际不扩大 — 证据: 遮蔽例外只认会话创建时的 header.cwd 子树（`app/sdk/src/policy/guard.mjs:14-16`），policy-state 按数据根而非工作区（`shell-ask.mjs:185`）；① 下 worker 的挂载面 = 主 bot 的挂载面，并且 `createdBy` 存在时不再 mint 自己的区，是**替换**不是叠加。P6-14「worker 禁写其他 bot 工作区」仍成立：其他 bot 的 `workspaces/<id>` 依旧在软遮蔽里，发起者的目录本来就不算「其他」 — 建议: 无需改设计；P6-24 ⑤ 复跑足够。
- [LOW] 换主之后 — 旧主 A 建的 worker，被新主 B 用 send_to_bot 追加任务，产物会落在 A 的目录，而不是 B 的 — 证据: P6-24 只在 createWorkerBot 时取 cwd（PLAN.md:122），header.cwd 不可变（orchestrate.ts:6）— 建议: 不改；在回报里带上路径就够了（③ 的「附路径」可以作为 ① 的附件零成本采纳）。
reverse_take: ① 三个月后最可能出事的不是互踩，而是一个默认隐藏的 worker 在用户真正在用的目录里留下 AGENTS.md / git hook 这类之后会被当成指令或代码执行的文件；更笨更稳的补法不是退回 ② / ③，而是在 ① 上加「worker 不得写指令文件」和「主 bot cwd 必须在 workspaces/ 下」两道一行判定。

## 各选项风险评级

| 选项 | 风险 | 解决「改我的文件」吗 | 理由 |
|---|---|---|---|
| ① 继承发起者 cwd | **MEDIUM**（加上 H1、H2 两条后可降为 LOW-MEDIUM） | 是 | 代码改一处（`orchestrate.ts:318` 起的 mintWorkspace 调用换成主 bot header.cwd）。三项代价里：互踩可接受；删目录今天就没有删除路径；挂载面是替换不是扩大。真正新增的是 H1（指令文件）与 H2（旧 cwd 主 bot） |
| ② 共享产物子目录 | LOW（安全）/ **产品上不达标** | 否 | worker 的遮蔽例外只认自己的 header.cwd 子树（`guard.mjs:14-16`），在 `workspaces/<main>/workers/<id>` 里看不见上层文件，「改我的 config」做不到（PLAN.md:311）；还要新造目录布局和删除语义，代码比 ① 多 |
| ③ 回报附路径 + 主 bot 只读 worker 区 | LOW（安全）/ **产品上不达标** | 否 | 放宽的是读，写一个都没解决；回报回合拒全部工具（决策 29，PLAN.md:49），核实要等下一回合；文件仍在用户找不到的地方（PLAN.md:312） |

## C2-② 是否被推翻

**字面上改了，精神上没改，仍需用户重签（§12.10② 的走法正确）。**
- C2-② 原文：「session/create 的 cwd 改由 main 强制为 `workspaces/<botId>`，renderer 传入即拒」（`work/QUESTIONS.md:159` 第②件）；用户答「独立工作目录可行」（`:163`）。
- 它要防的是「cwd 默认继承 runtime 启动目录、覆盖仓库 / SDK」（`orchestrate.ts:4-6`）。① 保留了这条的全部机制：cwd 仍由 main 决定、renderer 仍不能传、仍落在 `workspaces/` 下（前提是 H2 落实）。
- 变的是「每个 bot 一个」这一点。签字时（2026-11-03）worker 这个概念还没有，所以这是一个签字时没覆盖到的新情形，不是推翻用户的明确偏好；但用户原话里有「独立」二字，按规矩应当让用户重签，不能由 panel 认定「在精神内」后直接实施。§12.10② 的题干写得清楚，建议把 H1 的残余风险（worker 可以写会被主 bot 当作指令的文件）也写进代价一句。

## 投票理由（≤5 行）
1. 用户的诉求是「派活改我的文件」（PLAN.md:303），只有 ① 能做到；②③ 只解决「找得到」或「看得到」（PLAN.md:311-312）。
2. 与原版同义：worker 在同一 checkout 上改（`project-prompt.ts:100`）。
3. 隔离按 header.cwd 判（`guard.mjs:14-16`），所以 P6-14 的信封、其他 bot 的工作区遮蔽都原样成立，挂载面不扩大。
4. 最担心的风险：H1，即 worker 写 AGENTS.md / CLAUDE.md，经 agent-instructions 以指令形态进入主 bot，绕过只认 `pbots-worker` 的污染判定（`turn-origin.mjs:11`）。修法是一行 envelope 判定，不是放弃 ①。
