# T7bb：T7b 返修——Pick 对话框无样式（名字/来源/描述粘连）+ 暗色 Pick 按钮字看不见

> **blocked：2026-11-06 11:40 manager 任务 B — T7bc 终验 @ b2facacf 不通过（T7b 链第 3 次）。等用户答 Q-030（降级合并 fda457c2 功能链 / 再修一轮）。** 失败计数不重置。

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：T7b 终验（不通过 第 1 次，功能链全过、截图目检不过）；receipts/T7b.md §6
> 分支 / 作业目录：feat/T7b 续提交 @ /tmp/bot-wt/T7b
> claimed：11:05 main (GLM 5.3)（施工开始时由主 agent 填：日期、起点 SHA）
> accepted：（经理验收通过时填：日期、HEAD）
> 终验：2026-11-06 @ f0a14235 **不通过（T7b 链第 2 次，任务 C 重拆）** → `open/T7bc-skill-picker-visual-2.md`：pick.dark Add 白底白字；回执称删的 pbots-ui.ts:8 未删；×/void SandIcon/Remove 失败可见三项漏做；回执文件撞合并。e2e 2 passed + check diff=0 经理重跑一致。

## 目标
T7b 的功能链已过（e2e 2 passed、M1 磁盘断言红、pnpm check diff=0，经理重跑一致）。只差界面：四张截图里两处破版，修到经理目检过。

## 经理目检发现（证据 = `work/p9-dsh-integration/ref/skills-*.png`）
1. **对话框完全没样式**：`pb-skills-dialog*` 类在任何 css 里都不存在（`grep -rn pb-skills overrides/*.css` 空）。结果：候选行渲成一串 `t7b-flowT7b-AT7b ref flow`（名字、来源 bot、描述粘在一起）；标题与原生 `×` 按钮挤一起；原生复选框。亮暗两张 pick 图都这样。
2. **暗色 Pick 按钮字看不见**：`skills-added.dark.png` 与回测产出的 `test-output/P5-57/config-pane-dark.png` 里，「Pick from your skills」是白底 + 近白字。成因：neutral primary 在我们暗色板里 `--sand-text-on-primary: #f5f5f5`，底色却是浅色。pane 里其它按钮（Set as main bot / New bot with this configuration）都是 `variant="secondary"`。
3. `overrides/modules/pbots-ui.ts` 新加的 `export type { SkillsApiResult, SkillsReq, SkillEntry, CandidateEntry } from './shim/src/bots'`：路径错（应为 `../../shim/src/bots`），且 `SkillEntry`/`CandidateEntry` 不在 bots.ts 里。type-only 被 esbuild 抹掉所以构建不报，属死行。
4. Remove 的 `disable` 结果没看（失败静默），与本单「错误路径在界面上可见」不一致。
5. pick 截图是未勾选态；工单要的是勾选态。

## 动手前先读
1. `overrides/modules/skills-dialog.tsx`、`overrides/p5-57.css`（`pb-pane-*` 行样式、token 用法）
2. `overrides/modules/new-bot-dialog.tsx:124`（关闭按钮用 `SandIconButton icon="close" variant="ghost"`）
3. `work/p9-dsh-integration/ref/skills-ref-notes.md`（原版列表项：flex 行、列表滚动区）

## 边界
1. 只动：`overrides/modules/skills-dialog.tsx`、`overrides/modules/pbots-ui.ts`（只删第 3 条那一行）、新建 `overrides/t7b.css`（`scripts/inject-shim.mjs:20` 自动注入 `overrides/*.css`，不用接线）、`app/ui/tests/e2e/t7b-shot.spec.ts`（勾选后再截 pick；顺手删未用 import 与 `void shot`）。不改已有 css、不改调色板（调色板问题另列 queue 提议）。
2. 做法（最小）：
   - Pick 按钮 `variant="secondary"`（与 pane 内兄弟按钮一致）。
   - `t7b.css`：对话框做成 pane 内卡片（边框 / 圆角 / 内边距用 `--sand-*` token，亮暗都跟 token 走）；头部 flex 两端对齐；候选行 = 复选框 + 两行文本（第一行名字 500 字重 + 来源 bot 次要色小字，第二行描述次要色、单行省略）；notice 用 danger 文字色。`×` 换 `SandIconButton icon="close" variant="ghost"`。
   - 删第 3 条死行与 `void SandIcon` / 未用 import。
   - Remove：`disable` 返回 `ok:false` 时在段内显示 `role="alert"` 的 message（不另起状态机，一个 `useState<string|null>`）。
3. 先红：在 `skills-picker.spec.ts` **不改**的前提下，本单没有新的行为断言要先红（第 4 条除外：可选加一格「disable 失败可见」，没有就回执说明没加的理由）。视觉项以截图为准。
4. 隔离 HOME / TMPDIR / DBus；`PLAYWRIGHT_BROWSERS_PATH=/home/lingxufeng/.cache/ms-playwright`；load > 20 等。收尾 `bot-reap` 自己的 Xvfb（上轮残留 `Xvfb :99` PID 2149395，auth 在 `/tmp/bot-T7b-Oulv`，先 reap）。

## 验收（写命令，不写感觉）
统一前置：`T=$(mktemp -d /tmp/bot-T7bb-XXXX); mkdir -p $T/tmp $T/home; cd /tmp/bot-wt/T7b/app/ui; E="env HOME=$T/home TMPDIR=$T/tmp DBUS_SESSION_BUS_ADDRESS=unix:path=/nonexistent PLAYWRIGHT_BROWSERS_PATH=/home/lingxufeng/.cache/ms-playwright"`
1. `cd renderer-grok && pnpm check` → `upstream diff=0: 332 files`
2. `pnpm --config.verify-deps-before-run=false build && $E pnpm --config.verify-deps-before-run=false exec sh scripts/run-e2e.sh tests/e2e/skills-picker.spec.ts tests/e2e/t7b-shot.spec.ts` → 3 passed
3. `$E pnpm --config.verify-deps-before-run=false exec sh scripts/run-e2e.sh tests/e2e/settings.spec.ts tests/e2e/grok-dead-entries.spec.ts` → 3 passed
4. 截图：四张 `test-output/T7b/skills-{added,pick}.{light,dark}.png` 覆盖归档到 `work/p9-dsh-integration/ref/`；pick 为勾选态（Add 可点）。经理 Read 目检：候选行名字 / 来源 / 描述分得开；暗色两态所有按钮字可读；无原生 `×`。
5. `grep -rn "pb-skills" app/ui/renderer-grok/overrides/t7b.css | wc -l` ≥ 5；`grep -n "shim/src/bots'" app/ui/renderer-grok/overrides/modules/pbots-ui.ts` 只剩原有一行（`../../shim/src/bots`）。
6. 改动面：`git diff 0c9bd212..HEAD --stat` 只含边界第 1 条文件 + 回执。
7. 收尾：`pgrep -af 'bot-T7b' | grep -v pgrep` → 空。

## 为什么这样验收
T7b 的用户价值已由磁盘断言锁住，这单只为「人能看懂、暗色能用」。破版是经理亲眼看出的，所以验收仍以经理目检截图为准；grep 两条防「截图换了但样式没真加 / 死行没删」。参照图维持降级（「未验证」），不要求 compare 拼版。

## 产出
- 新建：`overrides/t7b.css`
- 修改：`overrides/modules/skills-dialog.tsx`、`overrides/modules/pbots-ui.ts`、`tests/e2e/t7b-shot.spec.ts`、`work/p9-dsh-integration/ref/skills-*.png`
- 回执：`work/tickets/receipts/T7b.md` 追加 §7（T7bb），贴原样输出 + 四张逐张一句
