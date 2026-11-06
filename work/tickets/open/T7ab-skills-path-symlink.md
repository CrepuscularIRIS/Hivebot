# T7ab：T7a 返修——enable/disable/list 顺着 bot 工作区内的符号链接写/删到工作区外；补漏测分支与回执正文

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：T7a 任务 B 验收（2026-11-06，经理亲跑探针 CONFIRMED）；T7a 第 1 次不通过
> 分支 / 作业目录：feat/T7a @ /tmp/bot-wt/T7a（在原分支上续提交，合并时连同 T7a 一起 --no-ff）
> claimed：（施工开始时由主 agent 填：日期、起点 SHA）
> accepted：（经理验收通过时填：日期、HEAD）

## 目标
`main/skills/index.ts` 只 `lstat` 了 `<dataDir>/workspaces/<botId>` 这一层，其下的 `.dsh`、`.dsh/skills`、`.dsh/.skills-staging` 是否为符号链接没查。bot 自己能在工作区里 `ln -s`（bash），main 进程不在沙箱里，于是：
- **enable 写出界**（经理探针，CONFIRMED）：目标 bot `t` 的 `.dsh` → `<外部>/outside`，`enable {botId:'t',fromBotId:'a',name:'flow'}` 返回 `{ok:true}`，文件落在 `<外部>/outside/skills/flow/SKILL.md`。
- **disable 删出界**（CONFIRMED）：bot `u` 的 `.dsh` → `vic`，`vic/skills` → `<外部>/victim`，`disable {botId:'u',name:'keep'}` 返回 `{ok:true}`，`<外部>/victim/keep` 被递归删除。
- 源侧同理：源 bot 的 `.dsh` / `.dsh/skills` 是链接时，会把工作区外带 `SKILL.md` 的目录复制给别的 bot；list 也会顺链读外部 frontmatter。

工单 T7a 校验第 1、3 条的本意（「符号链接会把复制变成引用，还能指向工作区外」）覆盖的就是这类路径；本单把检查补到每一层。

## 动手前先读
1. T7a 工单「接口」「校验」两节；`app/ui/main/skills/index.ts`（`skillsRoot`、`assertBotDir`、`listBotSkills`、`opEnable`、`opDisable`）
2. 经理探针写法（复现用，照搬进 unit 格即可）：建 `workspaces/t`，`ln -s <tmp>/outside workspaces/t/.dsh`，enable 后 `find <tmp>/outside -type f` 非空 = 漏洞在

## 边界
1. 只动 `app/ui/main/skills/index.ts`、`app/ui/tests/unit/skills/index.test.ts`、回执。接口和错误码不变（T7b 照原表接）。
2. 修法：在 `assertBotDir` 之后，对 `<ws>/.dsh`、`<ws>/.dsh/skills` 逐层 `lstat`——**存在且不是真目录（含符号链接）→ `pbots/invalid-args`**；不存在则照旧（enable 时由 `mkdir` 新建）。staging 也在 `.dsh` 下，`.dsh` 校验过即覆盖。enable 的源和目标两侧、disable、list 的目标 bot 都走这条；list 扫候选时遇到链接化的 bot 根就跳过该 bot（不报错，不读链接后的内容）。
   - 已知天花板（写 `ponytail:` 注释）：检查与写入之间 bot 若并发 `ln -s` 仍能竞争（TOCTOU）；彻底做法是 `openat`/`O_NOFOLLOW` 逐层打开，Node 无现成 API，等出现真实攻击面再做。
3. 先写失败测试，修前跑红贴原样输出。
4. 不放宽任何现有校验；不改 e2e spec。

## 验收（写命令，不写感觉）
统一前置同 T7a（`T=$(mktemp -d /tmp/bot-T7ab-XXXX)` …，`cd /tmp/bot-wt/T7a/app/ui`）。
1. 先红：新增格 ⑨ 在修前红（贴输出）：
   - ⑨a 目标 `.dsh` 是指向外部目录的链接 → enable 回 `pbots/invalid-args`，外部目录无新文件
   - ⑨b 目标 `.dsh` 真目录、`.dsh/skills` 是链接 → 同上
   - ⑨c disable 经链接化的 `.dsh/skills` → `pbots/invalid-args`，外部目录原样（文件仍在）
   - ⑨d 源 bot `.dsh/skills` 是链接（指向含 `x/SKILL.md` 的外部目录）→ enable `name:'x'` 回 invalid-args，目标无新增；list 目标 bot 时 candidates 不含该外部 skill
2. 补漏测分支（经理变异实测这两处删掉校验 8/8 仍绿）：
   - ⑩a `workspaces/<botId>` 本身是指向目录的符号链接 → list / enable（目标、源各一）/ disable 均 invalid-args（变异 M4：删 `assertBotDir` 里 `!st.isDirectory()` 判断 → 必红）
   - ⑩b list：`botId:'../x'` → invalid-args；不存在的 botId → not-found（变异 M5：list 跳过 `assertBotDir` → 必红）
   - ⑩c `op:'nope'`、`botId:1`、`name:1` → invalid-args
   - ⑥ 里「源 SKILL.md 是符号链接」那一格补断言「目标 `.dsh/skills` 无新增」
3. 修后：`$E pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/skills/index.test.ts` → 全绿（≥ 10 格）。
4. 变异各红（cp 备份还原，不提交；贴原样输出）：M1–M3（同 T7a 原定）+ M4、M5 + **M6**：去掉本单新增的逐层 lstat → ⑨ 红。
5. 回归：`tests/unit/m3` 与起点同数全绿（经理实测基点 9 files / 103 tests）；`pnpm build && $E pnpm --config.verify-deps-before-run=false exec sh scripts/run-e2e.sh tests/e2e/skills-enable.spec.ts` → 1 passed。注意：直接 `sh scripts/run-e2e.sh` 会撞上 conda 的 `playwright`（`unknown command 'test'`），要经 `pnpm exec`。
6. 回执 `work/tickets/receipts/T7a.md` **补正文**（现在只有两个附记，工单要求的内容不在）：unit 先红原样输出、M1–M6 原样输出、「分支 → 格名」对号表（每个错误码、每个校验分支至少一格）。
7. 收尾：独立 shell `pgrep -af 'bot-T7a|bot-T14' | grep -v pgrep` → 空。**经理验收时还挂着 3 个施工残留**：`548446`（T7a dsh runtime，已跑 3h48m）、`1737983`（T7a Xvfb）、`1704151`（T14 Xvfb），先 `~/bot/scripts/bot-reap 548446 1737983 1704151`，并查一下是哪条 e2e 没收干净，回执写一句。
8. 改动面：`git diff --stat 7bccb802..HEAD` 只含边界第 1 条的文件。

## 为什么这样验收
`pbots:skills` 是渲染进程能调、由不在沙箱里的 main 执行的写/删入口，而 bot 工作区的内容由 bot 控制。bot 被提示注入后只要 `ln -s ~/某处 .dsh`，用户在 UI 里点一次启用/停用，main 就替它写/删沙箱外的文件——这正是 P5 那套 guard 要防的事，从侧门绕过去了。⑨ 每格都断言「外部目录没变」，不是只看错误码；M6 保证修复是真的在起作用。⑩ 是原工单验收 4「每个校验分支至少一格」没兑现的部分。
