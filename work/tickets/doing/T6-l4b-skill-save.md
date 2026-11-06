# T6：L4-b skill 根收口（关掉真实 `~/.agents` 泄漏）+ 对话里存 skill 的真组合 e2e

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：work/p9-dsh-integration/BRIEF.md L4、验收第 2 条前半；PLAN.md §1 L4 行（泄漏点）、§5 第 5 条；RE-skills.md Q1/Q3/Q6 与「对 T6/T7 的影响」第 3、6 条
> 分支 / 作业目录：feat/T6 @ /tmp/bot-wt/T6（不涉 ssh，/tmp 可用）
> claimed：2026-11-06 03:28 main (GLM 5.3) @ 973124d6（施工开始时由主 agent 填：日期、起点 SHA）
> accepted：（经理验收通过时填：日期、HEAD）

## 目标
两件小事，一张单：
1. **收口**：dsh 子进程里 `agentsHome` 现在落到真实 `~/.agents`（`dsh-home-paths`：`$DSH_AGENTS_HOME` 未设时取 `homedir()/.agents`；`childEnv` 透传真实 `HOME`）。消费者有两个：`dsh-skill-filesystem`（扫 `<agentsHome>/skills`，所有 bot 都会看到）和 `dsh-agent-instructions`。修法是在 `src/start.ts` `childEnv` 里**无条件**设 `DSH_AGENTS_HOME = join(cfg.home, 'agents')`（覆盖父进程传进来的同名变量）。一个共享函数里改一行，两个消费者、所有 preset 的 skill-filesystem 行一起收住，不逐行改 preset。`dshHome` 已经是 `DSH_HOME = cfg.home`（启动器自有目录），不动。
2. **存 → 能用**：在我们的真实产品组合（web profile + p2sdk/approval/market patch + fs-zone/guard/shell-ask）里，证明 bot 在对话中用 `write` 把一段流程存成 `<bot cwd>/.dsh/skills/<name>/SKILL.md` 后，**同一个 bot 的新会话**目录里出现它、`skill` 工具能加载全文；**另一个 bot 看不到**。

不在本单：
- **审阅链（ProposeSkills / ReviewItem）不进本单**。依据：BRIEF 验收第 2 条只要求「存下来、另一个 bot 启用后复用」，没要求审批；原版里 bot 直接写进扫描根的文件本来就会被发现（RE-skills Q1 第 3 条 `.agents/skills` project scope、Q6 `MergedAgentSkillsService` 扫描合并），ProposeSkills 审阅项落的是 per-agent 定义（Q3「批准后落点」），和 T7 的账户库 / bot 副本表是同一块。已写进 queue 提议，T7 验收后再定。
- 「另一个 bot 启用后复用」= T7（启用 = 复制快照，RE Q2/Q7）。本单只做反面对照：未启用时另一个 bot 看不到。
- 示教录屏（RE Q5）随 L9。

驱动说明：本单走产品 web runtime，多会话 + 需要看每次模型请求里的目录消息，用仓里现成的按会话脚本 fake（`tests/support/fake/plugin.mjs`，改编自上游 mock adapter，记录 `requests.jsonl`）。dsh-llm-replay 的 override 只服务主会话、按首调顺序绑定会话，做不了这个场景，不换。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md（P5-03 fake 游标坑：每个会话一次写全脚本）
2. `app/sdk/src/start.ts:147-182`（`childEnv`）、`app/sdk/tests/unit/start.test.ts:157-190`（childEnv 现有格子，照它的写法加）
3. dsh 侧：`repos/deepseek-harness/packages/skill/skill-filesystem/README.md` §Skill format、§Roots and priority、§Change detection；`packages/skill/tool-skill/README.md` §What the model gets（**目录是首次请求前的一条 user 角色消息**——fake 的 `userTexts` 能看到它）
4. 测试模板：`app/sdk/tests/e2e/write-outside.test.ts:60-140`（`fakeOverlay` / `launchWo` / `scriptedSession` / `toolCall` 形状），但**建目录一律走 `tests/support/tmp-sweep.ts` 的 `tmkdir`**，不要照抄它的裸 `mkdtempSync`（T1/T8 正在清这个）
5. `app/ui/main/m3-meta/orchestrate.ts:4-5`：bot cwd = `$PBOTS_DATA_DIR/workspaces/<botId>`，每 bot 私有 project skill 根由此而来

## 边界
1. 只动：`app/sdk/src/start.ts`（`childEnv` 一行 + 注释）、`app/sdk/tests/unit/start.test.ts`（加一格）、新建 `app/sdk/tests/e2e/skill-save.test.ts`。preset 行、`profile/**`、fake 插件不碰。
2. 先写失败测试：先加 unit 格与 e2e 的 ④，在未改 `start.ts` 时各跑一次看红（贴原样输出）——unit 应报 `DSH_AGENTS_HOME` 为 undefined / 等于父进程值；e2e ④ 应看到 `t6-leak-probe` 出现在目录里。然后再改 `childEnv`。
3. 测试走隔离 HOME / TMPDIR（`/tmp/bot-T6-*`），DBus 指不存在路径；只跑下面两个文件，不跑全量 e2e。
4. 种进测试 HOME 的 `.agents` 只能在**隔离 HOME** 下建；绝不碰真实 `~/.agents`（当前不存在，验收第 4 条核对它仍不存在）。

## 验收（写命令，不写感觉）
统一前置：
```sh
T=$(mktemp -d /tmp/bot-T6-XXXX); mkdir -p $T/tmp $T/home
cd /tmp/bot-wt/T6/app/sdk
E="env HOME=$T/home TMPDIR=$T/tmp DBUS_SESSION_BUS_ADDRESS=unix:path=$T/nonexistent"
```
1. `$E pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/start.test.ts` → 原 36 格 + 新 1 格全绿（37 passed）。新格：`childEnv(resolveConfig({P2SDK_HOME:'/tmp/h'}), {HOME:'/home/x', DSH_AGENTS_HOME:'/home/x/.agents'}).DSH_AGENTS_HOME === '/tmp/h/agents'`。
2. `$E pnpm --config.verify-deps-before-run=false exec vitest run tests/e2e/skill-save.test.ts` → **4 passed**。一个 runtime（`HOME` = 测试 home、`PBOTS_DATA_DIR` = 测试数据根），两个 bot 工作区 `workspaces/a`、`workspaces/b`；启动前在**测试 HOME** 种 `.agents/skills/t6-leak-probe/SKILL.md`（合法 frontmatter，正文含随机串 LEAK_R），在 **`<P2SDK_HOME>/agents/skills/t6-agents-ctl/SKILL.md`** 种一个合法对照 skill。
   - **① 存**：会话 A1（cwd=a）脚本：`write` 写 `.dsh/skills/t6-flow/SKILL.md`（frontmatter `name: t6-flow`、`description`，正文含随机串 BODY_R）→ 文本收尾。断言：该 `write` 的 tool result `isError === false`；文件在 `workspaces/a/.dsh/skills/t6-flow/SKILL.md` 且含 BODY_R；整个过程 0 张审批卡（区内写不该出卡，P6-25 ⑤）。
   - **② 同 bot 新会话能用**：会话 A2（cwd=a）脚本：`skill {name:'t6-flow'}` → 文本收尾。断言：A2 第一次模型请求的 `userTexts` 里出现 `t6-flow`（目录消息）；下一次请求的 `toolResults` 里该调用 `isError === false` 且文本含 BODY_R。
   - **③ 另一个 bot 看不到**：会话 B1（cwd=b）脚本同 ②。断言：B1 第一次请求的 `userTexts` 里**没有** `t6-flow`；`skill` 结果不含 BODY_R（`isError === true` 或文本报 unknown，回执贴原文）。
   - **④ 收口**：A2 与 B1 的第一次请求 `userTexts` 都含 `t6-agents-ctl`（正对照：种法合法、`DSH_AGENTS_HOME` 生效），都**不含** `t6-leak-probe`；A2 追加一次 `skill {name:'t6-leak-probe'}`，结果不含 LEAK_R。
3. 变异各红一格（贴原样输出，改完还原，不提交）：
   - M1：`childEnv` 里去掉 `DSH_AGENTS_HOME` 那行 → unit 新格红、e2e ④ 红。
   - M2：① 的写入路径改成 `.dsh/skills/t6-flow.txt`（不是合法 skill 形态）→ ② 红（证明 ② 真在看发现结果，不是只看文件存在）。
4. 真实 HOME 未被建出 `.agents`：`test -e "$(getent passwd $USER | cut -d: -f6)/.agents" && echo LEAK || echo ok` → `ok`。
5. 测试残留：`ls -A $T/tmp | grep -v node-compile-cache | wc -l` → 0；独立 shell `pgrep -af 'bot-T6' | grep -v pgrep` → 空。
6. 改动面：`git diff --stat <起点>..HEAD` 只含边界第 1 条的三个文件。
7. 覆盖：`start.ts` 改动行被验收 1 的新格执行（单行赋值，不另跑覆盖报告）。

## 为什么这样验收
用户要的是「在对话里说存成 skill，之后能复用」。真正要保住三件事：**存下来的东西被发现机制认出来**（② 看目录消息 + `skill` 加载全文，M2 保证不是「文件在就算过」）；**它只属于这个 bot**（③：每 bot 私有 project 根是 T7「按 bot 启用 = 复制」的前提，如果别的 bot 自动看见，T7 的启用就没有意义）；**不会把用户自己机器上 `~/.agents` 里的东西喂给所有 bot**（④：泄漏探针只种在隔离 HOME，正对照证明种法合法、只是根被换走了）。

给 T7 的约束（写在这里免得下张单踩）：`$DSH_HOME/skills` 与新的 `$DSH_HOME/agents/skills` 都是**所有 bot 共扫**的用户级根，T7 的账户库不能放在这两处，否则等于「全员自动启用」，违背原版「启用 = 复制到 bot」（RE Q2/Q7）。

## 风险
- 若某个 bot cwd 的祖先目录有 `.git`，project 根会上移、多个 bot 共享 skill（skill-filesystem §Roots）。测试数据根在 `/tmp` 下无此问题；产品数据根默认在 `~/.config/pbots-ui` 下。施工时不处理，回执里写一句「是否需要 T7 前加守卫」的观察即可。
- fake 游标坑：每个会话脚本一次写全（LEARNINGS P5-03）。
- 若 ② 的目录消息不在 `userTexts` 里（上游实现与 README 不符），停下，回执贴 A2 首次请求的原始记录，不要改 fake 插件去抓 system prompt。

## 产出
- 修改：`app/sdk/src/start.ts`、`app/sdk/tests/unit/start.test.ts`
- 新建：`app/sdk/tests/e2e/skill-save.test.ts`
- 回执：`work/tickets/receipts/T6.md`
