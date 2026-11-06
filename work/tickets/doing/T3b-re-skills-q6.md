# T3b：RE-skills.md Q6 措辞修订——「每次请求内联全文」降为推断

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：T3 验收不通过（review/T1-T3-test-validity.md 第 6 条，经理复核成立）。T3 留 doing/，T3b 验收后一起挪 done。
> 分支 / 作业目录：只改文档，直接在集成分支
> claimed：2026-11-06 02:36 main (GLM 5.3)
> accepted：

## 目标
`work/p9-dsh-integration/RE-skills.md` Q6 把「wire schema 里有 `agent_skills` 字段」写成了「原版每次请求都内联全文、与 dsh 不等价」。证据只证明字段**存在**，不证明客户端**装配和发送**它。改成推断，并把 T6/T7 影响节对应句子收窄。T3 边界第 3 条：推断必须标「推断」。

## 动手前先读
1. CLAUDE.md；T3 工单边界第 3 条
2. `RE-skills.md:84-97`（Q6）、`:117`（影响节第 6 条）、`:120`（推断清单）
3. 经理复核数据（LED = `/dev/shm/grok-re/0.78.1/app/dist/local-exec-daemon/main.cjs`，`LC_ALL=C grep -a -F -o '<串>' LED | wc -l`）：
   - `29 agent_skills #12` → 1、`AgentSkill|1 full_path 9|2 content 9` → 1（只是 proto 定义）
   - `agentSkills:` → **0**（没有任何 `new RequestContext({agentSkills: …})` 式装配）
   - `.agentSkills=` → **1**，唯一命中是 RequestContext 构造器里的 `this.agentSkills=[]` 初始化
   - `MergedAgentSkillsService.getAllAgentSkills` → 1；合并结果的消费方不在 bundle 里

## 边界
1. 只动 `work/p9-dsh-integration/RE-skills.md` 的 Q6 节、「对 T6 / T7 的影响」第 6 条、文末推断清单。其他节一字不改。
2. 不新做 RE、不运行目标；只用上面已有的计数。若想补查消费方，只能加「未找到」，不能加新结论。

## 要改的三处
1. **Q6 结论行**：改为「投递方式**未确定（推断）**：wire 层 RequestContext 有 `agent_skills`（全文）与 `SkillOptions.skill_descriptors`（描述符）两种字段；客户端产物里没找到装配或发送它们的代码，哪一种在用、多频繁不可见。」
2. **Q6 证据**：「请求内联」条目标题改为「wire 定义（只证字段存在）」，并加一条**反证**，原样引上面两个计数：`agentSkills:` 0 次、`.agentSkills=` 仅构造器 `this.agentSkills=[]`。对照条目的「**投递：不等价**」改为「投递：**无法判定**（原版装配不可见）」。
3. **影响节第 6 条**：删掉「该差异是原版服务端约束，不是产品语义」「不需要模仿原版全文内联每请求」这类以推断为前提的句子，改为「T6 走 dsh `skill-filesystem`（catalog + 按需 load）；原版投递方式不可见，这不构成与原版的已知偏离」。fail-closed 那半句保留。推断清单加一项「Q6 投递方式（全文内联 vs 描述符）」。

## 验收（写命令，不写感觉）
```sh
F=/home/lingxufeng/bot/work/p9-dsh-integration/RE-skills.md
```
1. `awk '/^## Q6/,/^## Q7/' $F | grep -c '推断'` → ≥ 2（结论行 + 投递对照）
2. `awk '/^## Q6/,/^## Q7/' $F | grep -cE '不等价|每次请求'` → **0**
3. `awk '/^## Q6/,/^## Q7/' $F | grep -c 'agentSkills:'` → ≥ 1，且该行含「0」
4. `grep -c '^## Q[1-7]' $F` → 7；`git diff --stat -- $F` 之外无其他文件改动；`git diff -- $F | grep '^[-+]' | grep -v '^[-+][-+]' ` 的行都落在 Q6 / 影响节第 6 条 / 推断清单范围内（经理读 diff 核）
5. 锚点仍可复核：`LC_ALL=C grep -a -c 'SkillDescriptor|1 name 9|2 description 9|3 folder_path 9|4 enabled 8' /dev/shm/grok-re/0.78.1/app/dist/local-exec-daemon/main.cjs` → ≥ 1

## 为什么这样验收
T6/T7 按这份文档当「原版规格」定方案。把推断写成事实，下游会以为「我们和原版不一样、是有意偏离」，或反过来去复刻一个原版可能根本没做的「全文内联」。这里要保住的是：文档里每个「原版是这样」都有证据撑着，撑不住的明确标推断。第 2 条防止只加了「推断」两个字、原来的断言还留着。

## 产出
- 修改：`work/p9-dsh-integration/RE-skills.md`
- 回执：`work/tickets/receipts/T3b.md`
