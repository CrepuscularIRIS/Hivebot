# T7c：L4-d bot 用文件工具写 / 改自己的 skill 目录时弹确认卡（Q-028=B）

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：`work/QUESTIONS.md` Q-028 答复 B（2026-11-06 用户「要审阅」：写/改自己 skill 目录时弹确认卡，复用现有审批卡，不做待审列表）；原版形态 `work/p9-dsh-integration/RE-skills.md` Q3（PENDING→APPROVE/REJECT 审阅项——我们只取「改 skill 前要人点头」这一子集）
> 分支 / 作业目录：feat/T7c @ /tmp/bot-wt/T7c
> 排期：**T7b 之后**（同改 skill 链路的 e2e；T7a 的 `skills-enable.spec.ts` 也要随本单修订，见验收 4）
> claimed：（施工开始时由主 agent 填：日期、起点 SHA）
> accepted：（经理验收通过时填：日期、HEAD）

## 目标
bot 用 `write` / `edit` 写入自己工作区的 skill 根——`<workspaceRoot>/.dsh/skills/**` 或 `<workspaceRoot>/.agents/skills/**`（skill-filesystem 的两个 project 根，`repos/deepseek-harness/packages/skill/skill-filesystem/README.md` §Roots and priority，rank 100/200）——时，**不管自主门开没开，都出一张现有审批卡**（Allow once / Deny，P5-31 那张卡），用户点 Allow once 才写。工作区里写别的文件照旧零卡（P6-25 ⑤）。

范围与取舍：
- **改一处**：`app/sdk/src/policy/shell-ask.mjs` workspace-write 分支（现在是 `allInside` 后按门放行/出卡，`shell-ask.mjs:380-381`）在门判断之前加一条：任一候选 realpath 后落在上述两个 skill 根下 → `ask(ASK.skillWrite)`。新增一个固定原因串（写进 `ASK` 表，照现有键的写法），卡上照常显示完整路径（`overrides/modules/local-tool-view.tsx` 已显示 action 全文，不改 UI）。
- 子代理 / `approvalPolicy=never` 的会话：ASK 一律变拒（现有 P5-05 语义）→ 子代理写不了 skill。这是期望行为，不另开口子。
- **用户在 UI 上的启用（T7a 的 main 侧复制）不出卡**：那是用户自己点的，点击本身就是批准；它不经 shell-ask。
- 不做：待审列表、`ProposeSkills` 工具、聊天挑选卡（Q-028 选的是 B 不是 C）。
- **已知缺口（不在本单）**：bot 用 `bash`（如 `cat > .dsh/skills/x/SKILL.md`）写 skill 目录不经文件工具判定，本单挡不住。补法写成下一张 T7d（queue 计划行）：bot 工作区预建两个 skill 根，wrapper 把它们 ro-bind 进沙箱。本单回执必须写一句「bash 路径未覆盖，见 T7d」。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md（P5-03 fake 游标坑）
2. `app/sdk/src/policy/shell-ask.mjs:1-45`（档位语义头注释）、`:330-384`（文件档位判定与 workspace-write 分支）；`ASK` 表 `:80-88`
3. 现有出卡 / 作答写法：`app/sdk/tests/e2e/write-outside.test.ts:130-140,200-205,260-270`（`sess.next('allowed-once' | 'rejected')`、`askedCount`）
4. 要修订的老测试：`app/sdk/tests/e2e/skill-save.test.ts:222`（T6 ① 断言「区内写不出卡」）；feat/T7a 上的 `app/ui/tests/e2e/skills-enable.spec.ts`（A 用 write 存 skill 那一步）
5. `app/sdk/tests/e2e/tiers-policy.test.ts`（档位回归，照它加格）

## 边界
1. 只动：`app/sdk/src/policy/shell-ask.mjs`（一个判定 + 一个原因串 + 头注释补一行 Q-028）、新建 `app/sdk/tests/e2e/skill-write-card.test.ts`、修订 `app/sdk/tests/e2e/skill-save.test.ts`（仅验收 3 所列）与 `app/ui/tests/e2e/skills-enable.spec.ts`（仅验收 4 所列）。guard、fs-zone、wrapper、UI 覆盖层不碰。
2. **先写失败测试**：先写 `skill-write-card.test.ts` 全部格子，未改 shell-ask 时跑一次（① 应因 0 张卡而红），贴原样输出。
3. 老测试的修订只限下面写明的断言，每处改动在回执里列「原断言 → 新断言 → 理由（Q-028=B）」；不许删格、不许放宽别的断言。
4. 测试走隔离 HOME / TMPDIR（`/tmp/bot-T7c-*`），DBus 指不存在路径；只跑下面列的文件。load > 20 等一等。

## 验收（写命令，不写感觉）
统一前置：
```sh
T=$(mktemp -d /tmp/bot-T7c-XXXX); mkdir -p $T/tmp $T/home
cd /tmp/bot-wt/T7c/app/sdk
E="env HOME=$T/home TMPDIR=$T/tmp DBUS_SESSION_BUS_ADDRESS=unix:path=$T/nonexistent"
V="pnpm --config.verify-deps-before-run=false exec vitest run"
```
1. 新测试 `$E $V tests/e2e/skill-write-card.test.ts` → 全绿，格子：
   - ① `write .dsh/skills/t7c-a/SKILL.md` → 恰 1 张卡；作答 `allowed-once` → 文件存在、toolResult `isError === false`
   - ② 同上作答 `rejected` → 文件不存在、toolResult 为错误
   - ③ `edit` 已存在的 `.dsh/skills/t7c-b/SKILL.md`（测试预种）→ 1 张卡；拒 → 内容字节不变
   - ④ `.agents/skills/t7c-c/SKILL.md` 同 ① → 1 张卡
   - ⑤ 绕法：工作区内符号链接 `lnk -> .dsh/skills`，`write lnk/t7c-d/SKILL.md` → 仍 1 张卡（realpath 后判定）
   - ⑥ 对照：`write notes/t7c.md`（工作区内非 skill 根）→ 0 张卡（P6-25 ⑤ 不变）
   - ⑦ 子代理（`approvalPolicy=never`）会话 `write .dsh/skills/...` → 拒、0 张卡、文件不存在
   - ⑧ 门开态（policy-state provision 且 instance 相符，照 `tiers-policy.test.ts` 的造法）下 ① 仍出卡（不随自主门放行）
2. 变异各红（贴原样输出，cp 还原不提交）：M1 删掉新判定 → ①③④⑤⑧ 红；M2 判定只比字面前缀、不用 realpath 后的候选 → ⑤ 红。
3. **T6 老格修订**（`tests/e2e/skill-save.test.ts`）：
   - 原 `:222` `expect(askedCount(...), '区内写不出卡（P6-25 ⑤）').toBe(0)` → 新：`toBe(1)`，且 A1 的脚本作答 `allowed-once`；断言消息改为「写 skill 根出 1 张卡（Q-028=B）」。
   - ②③④ 不动。`$E $V tests/e2e/skill-save.test.ts` → 4 passed。
4. **T7a e2e 修订**（`app/ui/tests/e2e/skills-enable.spec.ts`，在 T7a 已合并的基础上）：A 用 `write` 存 skill 那一步，测试经 Local tool permissions dock 点 Allow once（照 `app/ui/tests/e2e/workspaces.spec.ts` 的 `permissionDock` 写法）再等文件出现；其余步骤不变。`cd ../ui && pnpm build && $E sh scripts/run-e2e.sh tests/e2e/skills-enable.spec.ts` → 1 passed。
5. 档位回归不坏：`$E $V tests/e2e/tiers-policy.test.ts tests/e2e/write-outside.test.ts tests/unit` → 与起点同数全绿（起点先跑一次记数）。
6. 收尾：`ls -A $T/tmp | grep -v node-compile-cache | wc -l` → 0；独立 shell `pgrep -af 'bot-T7c' | grep -v pgrep` → 空。
7. 改动面：`git diff --stat <起点>..HEAD` 只含边界 1 的四个文件。

## 为什么这样验收
用户要的是「bot 改自己的技能前，我要点头」。所以真正要保住：写 / 改 skill 两条文件工具路径都出卡（①③④）、拒了就真没写（②③ 看字节）、不能靠符号链接绕过（⑤）、自主门开着也不放行（⑧，否则开了自主就等于没要这张卡）、而工作区里别的写入照旧不打扰（⑥）。T6 / T7a 的老断言是按「直接写」的旧规格写的，规格变了就明着改并写清理由，不悄悄放宽。bash 路径挡不住是已知缺口，写进回执和 T7d，不假装覆盖了。

## 风险
- skill-filesystem 的 project 根是「最近的 `.git` 祖先，否则 cwd」：bot 在工作区里 `git init` 后根仍是工作区（`.git` 就在 ws），不受影响；若数据根祖先有 `.git`（T6 风险项），project 根会上移、判定按 workspaceRoot 算会漏——本单不处理，回执写观察。
- 卡上文案要让人看懂是「保存 / 修改技能」：原因串里带上「skill」字样，路径由卡片已有的 action 全文显示。

## 产出
- 修改：`app/sdk/src/policy/shell-ask.mjs`、`app/sdk/tests/e2e/skill-save.test.ts`、`app/ui/tests/e2e/skills-enable.spec.ts`
- 新建：`app/sdk/tests/e2e/skill-write-card.test.ts`
- 回执：`work/tickets/receipts/T7c.md`（先红输出、M1/M2 输出、老断言修订对照表、bash 缺口一句话）
