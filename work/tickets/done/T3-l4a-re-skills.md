# T3：L4-a 0.78.1 skill 生命周期 RE（定「库 / 按 bot 启用 / 对话里存 skill」的原版语义）

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main 派用户级 `reverse-engineer`（REA 只挂在它上面），main 收回执
> 来源：work/p9-dsh-integration/BRIEF.md L4 与验收第 2 条；PLAN.md §1 L4 行、§5 第 5 条
> 分支 / 作业目录：只写文档，直接在集成分支；RE 临时目录一律 `/tmp/bot-T3-*`（LEARNINGS 2026-11-03：不在白名单的目录残留进程清不掉）
> claimed：2026-11-06 00:51 main 派 reverse-engineer
> accepted：2026-11-06 manager (Opus 5.5) · 集成分支 @ 7359fc4（T3b 316b6c9）。锚点抽查（上轮）通过；Q6 越读由 T3b 收窄为推断，经理复跑 T3b 验收 1–5 通过。

## 目标
用 0.78.1 产物回答 L4 的七个语义问题，写成 `work/p9-dsh-integration/RE-skills.md`，让 T6 / T7 按「原版即规格」直接定方案，不再问用户。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. PLAN.md §1 L4 行（经理已找到的锚点，RE 从这里接着挖，不要重复）
3. 解包树 `/dev/shm/grok-re/0.78.1/`（已存在；若因重启丢失，按 `work/p1-re` 的解包复现步骤重建）。重点文件：`app/dist/local-exec-daemon/main.cjs`、`app/dist/node-agent-coordinator/main.cjs`、`app/dist/renderer/assets/chunk-team-setup-new-skill-dialog-*.js`、`chunk-teach-recording-controls-*.js`
4. 对照物：dsh `repos/deepseek-harness/packages/skill/skill-filesystem/README.md`（目录格式、根目录、刷新）

## 边界
1. 只写 `work/p9-dsh-integration/RE-skills.md`（必要时附 `work/p9-dsh-integration/evidence/T3/` 下的摘录）。不改代码。
2. 静态只读取证，不运行目标程序；不读 `~/.grokbot` 等凭证目录。
3. 每条结论带锚点：`<文件>` + 可 grep 的字面串（或字节偏移）。推断要标「推断」，找不到的标「未找到」，不要补想象。

## 要回答的七问（RE-skills.md 一问一节）
1. 账户级 skill 库存在哪、什么时候同步（线索：`PublishGrokBotUserSkillsSnapshot{fingerprint}`、`managed-skills-sync`、`builtin-skills-sync`、`merged-agent-skills`、`agent-skills-catalog-cache`、`getDisabledManagedSkillPaths`）。
2. per-agent skill：`Add/Update/Remove/ListGrokBotAgentSkills` 的字段与 `GrokBotAgentSkill.source` 的取值；从库「启用」到某个 bot 时是**复制内容**还是**引用**（改库里那份，已启用的 bot 会不会跟着变）。
3. `ProposeSkills` 模型工具：参数 schema、调用后是否出用户审阅（`GrokBotTeamReviewSkillChange` / `GrokBotTeamReviewSkillAction`），批准后落到 per-agent 还是账户库。
4. 「Pick from your skills / Add new skill」对话框：入口在哪（team setup / bot 设置）、允许的文件类型与大小上限（已见 `SKILL.md`、`.txt .md .csv .json .yaml`、`256e3`）、名字规则。
5. 「Teach a task」录屏示教是否产出 skill；它依赖哪条电脑操控链路（如依赖则标「随 L9」）。
6. 运行时 skill 怎么到模型面前（目录挂载 / system prompt 目录 / 工具按需加载），与 dsh `skill-filesystem` 的「catalog + 按需 load」是否等价；不等价处列出。
7. 同账户多个 bot 的启用状态存在哪一侧（bot 定义 / 账户），停用是删除副本还是标记。

## 验收（写命令，不写感觉）
1. `test -f work/p9-dsh-integration/RE-skills.md && grep -c '^## Q[1-7]' work/p9-dsh-integration/RE-skills.md` → `7`。
2. 每节至少一个锚点（锚点用反引号包裹）：`awk '/^## Q/{q=$2} q!="" && index($0,"\140"){a[q]++} END{for(k in a) print k, a[k]}' work/p9-dsh-integration/RE-skills.md` → Q1–Q7 共 7 行，每行计数 ≥ 1。
3. 经理抽查：从 Q2、Q3、Q6 各取一个锚点，`LC_ALL=C grep -a -c '<字面串>' <文件>` ≥ 1（经理验收时自己跑）。
4. 文末有「对 T6 / T7 的影响」一节：每问一句结论（如「启用 = 复制，T7 用复制」），标明哪些仍是推断。

## 为什么这样验收
T6/T7 会按这份文档定存储和交互；锚点是为了让经理能复核、避免把 RE 的猜测当成原版行为。第 4 条逼出可执行的结论，而不是一份只有观察的笔记。

## 产出
- 新建：`work/p9-dsh-integration/RE-skills.md`（+ 可选 `evidence/T3/`）
- 回执：`work/tickets/receipts/T3.md`（RE agent 的原始报告路径 + main 的摘要）
