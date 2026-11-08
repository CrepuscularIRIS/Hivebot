# T7db：skill 根父目录可改名绕过收口（父目录自绑成挂载点 + 符号链接拒绝）

> 开单：manager (Opus 5.5) | 日期：2026-11-07 | 施工：main (GLM 5.3)
> 来源：T7d 终验不通过第 1 次（receipts/review-T7d.md §4）；queue 7e 不变量「挂载点不可 rename/rm」
> 分支 / 作业目录：feat/T7d @ /tmp/bot-wt/T7d（同分支续做）
> claimed：2026-11-07 21:4x main (GLM 5.3) @ feat/T7d
> accepted：

## 目标
`mv .dsh .x && mkdir -p .dsh/skills/y && echo evil > .dsh/skills/y/SKILL.md` 这类一条命令（`.agents` 同理）必须写不进宿主 skill 根。

## 动手前先读
1. receipts/review-T7d.md §4（含 bwrap 探针原样输出与已验证修法）
2. app/sdk/sandbox/bwrap-wrap.py:354-365（派生段）、头部挂载序注释

## 边界
1. 只动：`app/sdk/sandbox/bwrap-wrap.py`、`app/sdk/tests/e2e/approval.test.ts`、`app/sdk/tests/e2e/sandbox-wrapper.test.ts`、回执。
2. 修法（探针已验证）：派生段对每个 bind，先对父目录自绑 `--bind <b>/.dsh <b>/.dsh`、`--bind <b>/.agents <b>/.agents`，再 `--ro-bind` 两根；再遮段仍排在最后。父目录照旧可写，只是不能改名或删除。
3. 符号链接拒绝：父目录和根（makedirs 之后）必须 `os.path.realpath(x) == x`，否则 `die()`。makedirs 的 OSError 也走 `die()`（bwrap: 前缀）。dry-run 照旧不落盘。
4. 头部挂载序注释补上这一段；sandbox-wrapper describe 标题里「缺失则不追加」改成现在的行为。
5. 先写失败测试：approval.test.ts 的 T7d 用例加改名父目录场景，在当前 HEAD 上看它红（贴原样）。

## 验收（写命令，不写感觉；在 app/sdk，带 --config.verify-deps-before-run=false）
1. 先红：新场景在 7e205f91 上红在「改名父目录后仍写不进」（贴原样）。
2. `vitest run tests/e2e/approval.test.ts` → 6 passed（新场景并进 T7d 用例或新增一格均可，数字照实写）。新场景：allowed-once 批准 `mv .dsh .dsh_x && mkdir -p .dsh/skills/y && echo evil > .dsh/skills/y/SKILL.md` 后 `<ws>/.dsh/skills/y/SKILL.md` 不存在、`<ws>/.dsh_x` 不存在；`.agents` 同样一条。
3. `vitest run tests/e2e/sandbox-wrapper.test.ts` → 全绿，新增断言：
   - 挂载序 `--bind ws` < `--bind ws/.dsh` < `--ro-bind ws/.dsh/skills` < 再遮（`.agents` 同）；
   - dry-run 跑完后 bare 下 `.dsh`、`.agents` 都不存在；
   - `.dsh` 是指向别处的符号链接 → 退出非零、stderr 以 `bwrap: ` 开头、链接目标下没有新建 `skills`。
4. 回归：`vitest run tests/e2e/write-outside.test.ts tests/e2e/tiers-policy.test.ts tests/e2e/guard-fs.test.ts tests/e2e/skill-write-card.test.ts` → 34 passed。
5. 变异刀：删父目录自绑这两个 `--bind` → 验收 2 的新场景红；还原。

## 为什么这样验收
要保住的是「bash 无论怎么拼都写不进 skill 根」，而不是「直接写 skill 根会报只读」。所以 e2e 必须看宿主落盘结果，覆盖改名父目录这条路径；单测要锁住挂载序（父目录自绑必须在 ws 重绑之后，否则会被盖掉）。符号链接一格防的是宿主侧 makedirs 被 bot 引到工作区外面去。

## 产出
- 上列三个文件 + receipts/T7d.md 追加「T7db」节
