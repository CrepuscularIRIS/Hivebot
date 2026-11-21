# T60：bot 标题显示成介绍提示原文「<bot_introduction_request>You were just…」

> 开单：manager (Opus 5.5) | 日期：2026-11-11 | 施工：main (GLM 5.3)
> 来源：queue 提议（2026-11-11）；实物 `work/t46b-final-goodhost.png`、`work/ui-polish-win/evidence/T54/04-titlebar.win.png`（侧栏行、会话头药丸、info pane Name、composer 占位符四处都是这串）
> 分支 / 作业目录：feat/T60 @ /tmp/bot-wt/T60
> claimed：2026-11-11 @ d6018d44（main GLM 施工，worktree /tmp/bot-wt/T60）
> accepted：2026-11-11 feat/T60 @ d6018d44（manager 任务 B；shim 单测 23 文件 234p、build+onboarding.spec 6p 亲跑；截图亲检零泄漏；未经 Sol 审，改动 2 处显示层过滤，风险低）

## 目标
新建的 bot 在任何地方都不显示 `<bot_introduction_request>…` 这段内部提示；没起名的 bot 显示的名字与原版口径一致。

## 已知（经理读码）
- 介绍提示由 shim 拼：`app/ui/renderer-grok/shim/src/entries.ts:40`（整段包在 `<bot_introduction_request>…</bot_introduction_request>` 里）；同文件 :48 有识别函数，transcript 里已把它藏掉。
- 改名走 `session/rename`（`shim/src/data.ts:694,722,734,768`），只在 `name !== ''` / `titled` 时调。没名字的 bot 标题因此落到 dsh 的自动标题——取自第一条用户消息，也就是这段介绍提示（截断成「<bot_introduction_request>You were just」）。**这是推断，第 0 步要证实**。

## 第 0 步（先做，写回执）
复现：隔离 HOME 走一次「不填名字建 bot」或 onboarding 的 walk（`onboarding.spec.ts` 已有路径），读 `session/list` 里该 bot 的 `title` 字段，确认它来自哪里（dsh 自动标题？哪个插件？），贴原样输出。
原版口径：查 `work/grok-0.79.3-re/onboarding-0793-extract.json` 与 0.18 源码里新 bot 的默认名（如「New chat」/ 人格名），写清锚点；查不到写进回执存疑项，按我们侧栏现有的「New chat」口径处理。

## 边界
1. 只动 shim（`entries.ts` / `data.ts` 中与新建 bot 命名相关的最小处）与对应单测 / e2e 断言；不改 dsh、不改 sdk。
2. 修在根上：让带介绍提示的会话**拿不到**这串当标题（例：建 bot 时先给默认标题再发介绍，或标题投影时识别并替换），二选一以第 0 步证据定；不要在侧栏、会话头、info pane、composer 四处各自过滤。
3. 已经被错误命名的老 bot：标题投影层识别到这串前缀就按默认名显示即可（不批量 rename 用户数据）。
4. 先写失败测试：单测——给投影一个 title = `<bot_introduction_request>You were just` 的会话 → 显示名不含 `<bot_introduction_request>`；e2e——onboarding walk 之后侧栏行文字、会话头、composer placeholder 都不含该串。

## 验收（写命令，不写感觉）
1. `cd /tmp/bot-wt/T60/app/ui && pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/grok-shim` → 全绿，新格在列，回执贴改前红尾。
2. `cd /tmp/bot-wt/T60/app/ui && pnpm build && PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/onboarding.spec.ts` → 全绿（含新断言）。
3. 截图：onboarding 完成后的主界面一张（侧栏 + 会话头 + composer 可见），放 `work/ui-polish-win/evidence/T60/`；经理 Read 看。
4. 改动行覆盖 ≥80%（shim 改动函数）。
5. `git diff --stat <claimed>..HEAD` 只含边界 1。

## 为什么这样验收
这串出现在用户每天看的四个地方，是最显眼的「不像成品」。修在命名源头或唯一的投影口，才能保证四处一起好、以后新加的显示位也不会再漏；老数据只在显示层兜底，不动用户的会话记录。

## 产出
- shim 改动、单测、e2e 断言、截图、`work/tickets/receipts/T60.receipt.md`
