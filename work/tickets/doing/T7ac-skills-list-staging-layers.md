# T7ac：T7ab 返修——list 目标 bot 未过逐层检查（读外部 frontmatter）、`.skills-staging` 链接未查、⑥ 补断言未落

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：T7ab 任务 B 验收（2026-11-06 @ d44ee165，经理探针 P4/P5/P6）；T7ab 第 1 次不通过
> 分支 / 作业目录：feat/T7a @ /tmp/bot-wt/T7a（续提交；过后 T7a+T7ab+T7ac 一起 --no-ff 合并）
> claimed：10:00 main (GLM 5.3) @ 0e7fcd4e（施工开始时由主 agent 填：日期、起点 SHA）
> accepted：（经理验收通过时填：日期、HEAD）

## 目标
T7ab 的三个探针场景已堵死（经理复跑：enable 目标 `.dsh`→外部 拒且外部空；disable 经链接化 skills 拒且外部原样；源侧链接不进 candidates）。剩三处：
- **R1（T7ab 边界 2 明写、未做）**：`op:'list'` 只走 `assertBotDir`，目标 bot 的 `.dsh/skills` 是链接时 `listBotSkills` 顺链读外部。经理探针 P4 原样输出：
  `{"ok":true,"value":{"onBot":[{"name":"secret","description":"OUTSIDE-FRONTMATTER"}],...}}`（`secret/SKILL.md` 在工作区外）。
- **R2（T7ab 前提错，经理的锅）**：工单写「staging 在 `.dsh` 下，`.dsh` 校验过即覆盖」不成立——`.dsh` 真目录、`.dsh/.skills-staging` 是链接时：P5 指向外部目录 → enable `ok`，复制过程中在外部建 `<uuid>/skill/SKILL.md` 再 rename 走（瞬时出界写）；P6 指向不存在路径 → `mkdir(staging)` 在 try 外抛 `ENOTDIR`，handler 直接 reject，不回 `SkillsResult`。
- **R3**：T7ab 验收 2 末条「⑥ 源 SKILL.md 是符号链接那格补断言目标无新增」没加（`tests/unit/skills/index.test.ts:141` 后无断言），回执对号表却写「⑥（补断言）」。

## 动手前先读
1. `app/ui/main/skills/index.ts`：`assertSkillLayers`（:66）、`registerSkills` 的 list 分支（:269-273）、`opEnable` staging 段（:209-212）
2. T7ab 工单边界 2

## 边界
1. 只动 `app/ui/main/skills/index.ts`、`app/ui/tests/unit/skills/index.test.ts`、回执。接口与错误码不变。
2. 修法（最短路径，都走现有咽喉 `assertSkillLayers`）：
   - segments 加 `join('.dsh', '.skills-staging')`（悬空链接 lstat 成功、非目录 → invalid-args，P6 一并解决）；
   - list 分支在 `assertBotDir` 后对目标 bot 调 `assertSkillLayers`，不过 → 返回其错误（invalid-args）。
3. 先写失败测试：新格 ⑪，修前红，贴原样输出：
   - ⑪a 目标 `.dsh/skills` → 含 `secret/SKILL.md` 的外部目录 → `list` 回 `pbots/invalid-args`（不得出现 `secret`）
   - ⑪b `.dsh` 真目录、`.dsh/.skills-staging` → 外部空目录 → enable 回 `pbots/invalid-args`，外部目录仍空，目标 `.dsh/skills` 无新增
   - ⑪c `.skills-staging` → 不存在路径 → enable **resolve**（不 reject）且为 `pbots/invalid-args`
   - ⑥ 第 141 行后补 `expect(skillCount(dataDir, 't')).toBe(0)`
4. 不放宽现有校验；不改 e2e spec。

## 验收（写命令，不写感觉）
前置同 T7ab（隔离 HOME/TMPDIR/DBus，`cd /tmp/bot-wt/T7a/app/ui`）。
1. 修前 ⑪ 红（贴输出）；修后 `$E pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/skills/index.test.ts` → 11 passed。
2. 变异（cp 备份还原，贴原样输出——**原样**，不是只填表）：M7 删 segments 里的 staging 项 → ⑪b/⑪c 红；M8 删 list 分支的 `assertSkillLayers` → ⑪a 红；M6 仍红 ⑨。
3. 回归：`tests/unit/m3` → 9 files / 103 passed；`pnpm build && $E pnpm --config.verify-deps-before-run=false exec sh scripts/run-e2e.sh tests/e2e/skills-enable.spec.ts` → 1 passed。
4. `git diff --stat d44ee165..HEAD` 只含边界 1 的文件；收尾 `pgrep -af 'bot-T7a' | grep -v pgrep` 空。
5. 回执 `receipts/T7a.md` 对号表改正 ⑥ 行，加 ⑪ / M7 / M8 行。

## 为什么这样验收
同 T7ab：main 不在沙箱里，bot 能在自己工作区 `ln -s`。list 的结果进渲染进程，等于让 bot 借 main 读沙箱外文件的头部；staging 链接让 main 在沙箱外建目录写文件。⑪ 断言的是「外部不变 / 外部内容不出现」，不只是错误码；M7/M8 证明修复在起作用。
