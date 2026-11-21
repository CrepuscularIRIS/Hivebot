# T50c：T50 spec 的 console 泄漏检查仍有 Apply 期盲区（Sol MAJOR 修复不完整）

> 开单：manager (Opus 5.5) | 日期：2026-11-11 | 施工：main (GLM 5.3)
> 来源：T50 任务 B 验收（返修）；编号避开 queue 已占用的 T50b（加 provider）
> 分支 / 作业目录：feat/T50 @ /tmp/bot-wt/T50（在同分支上追加提交）
> claimed：58e13df4（feat/T50 追加提交，2026-11-11 三连实证完待经理复验）
> accepted：2026-11-11 feat/T50 @ 58e13df4（manager 复验：spec 核实——探针 `t50-listener-alive` 非 key、在 openModels 前（:41-43）、`consoleTexts.length = 0` 已删、leak 两次（:82/:86）覆盖注册起全程；diff ef904037..HEAD 仅 spec 9+/10-；worktree 干净；重跑 1 passed (6.8s)。回执三连（旧绿/新红恰为「apply 后: console 不含 key」/撤注入绿）采信——文案与机制吻合，未重做注入）

## 问题（经理核实 @ ef904037）
`app/ui/tests/e2e/t50-models.spec.ts`：监听已在 :38 注册（先于 :60 fill / :61 Apply），但 :75 `consoleTexts.length = 0` 把 :38–:72 收集到的**全部**消息清掉，其中包括 fill / Apply / 刷圆点期间的产品 console 输出。随后 `leak('apply 后')` 只看清空之后的消息。结果：产品若在提交期间 `console.log(key)`，测试照样 1 passed——Sol 指出的盲区换了个位置还在。

## 修法（只改 spec，最小）
must-catch 探针挪到 :38 注册监听之后、`openModels` 之前，用**非 key 的标记串**（如 `t50-listener-alive`）验证监听器活着，然后**删掉** `consoleTexts.length = 0`。这样从注册起的每条 console 都留在数组里，`leak()` 能覆盖 Apply 期间的输出。（另一种做法：保留探针位置，把清空改成过滤掉 `t50-probe ` 开头的那一行。二选一，回执写明选了哪种。）

## 边界
只动 `app/ui/tests/e2e/t50-models.spec.ts`。不碰产品代码。

## 验收
1. 先证明修好后的断言能抓到 Apply 期的泄漏（必做，回执贴原样输出）：临时在 `settings-models.tsx` 的 `apply()` 第一行加 `console.log(value)`，跑 spec → 必须**失败**，失败信息为 `apply 后: console 不含 key`；然后撤掉这行（`git diff` 不得含它）。现行 ef904037 的 spec 在同样注入下会 passed——这正是要修的问题。
2. `cd /tmp/bot-wt/T50/app/ui && CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/t50-models.spec.ts 2>&1 | grep -E "passed|failed"` → `1 passed`。
3. `git diff --stat ef904037..HEAD` 只含 spec 一个文件。

## 为什么这样验收
③ 泄漏反证是 T50 的核心。只跑绿证明不了断言有用，必须用注入看到它变红。
