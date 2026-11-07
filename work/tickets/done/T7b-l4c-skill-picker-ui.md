# T7b：L4-c bot 设置里的 Skills 段 +「Pick from your skills」对话框（接 T7a），截图对 0.78.1

> **blocked：2026-11-06 11:40 manager 任务 B — T7bc 终验 @ b2facacf 不通过（T7b 链第 3 次）。等用户答 Q-030（降级合并 fda457c2 功能链 / 再修一轮）。** 失败计数不重置。

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：p9 BRIEF 验收第 2 条（「另一个 bot 能启用」的用户入口）、验收第 4 条（UI 截图对照 0.78.1）；RE-skills Q4、Q7
> 分支 / 作业目录：feat/T7b @ /tmp/bot-wt/T7b
> 依赖：**第 1 步（参照图）现在就能做；第 2 步起要 T7a 已合并**（接 `window.pbots.skills`，接口见 `open/T7a-l4c-skill-enable-api.md`「接口」表）
> claimed：10:10 main (GLM 5.3) @ d4c3a33a（施工开始时由主 agent 填：日期、起点 SHA）
> accepted：（经理验收通过时填：日期、HEAD）

## 目标
用户在 bot B 的设置面板里看到 B 已有的 skill（可移除），点「Pick from your skills」从别的 bot 的 skill 里勾选、添加到 B。数据全走 T7a 的 `pbots.skills`（list / enable / disable），renderer 不碰文件。外观对齐 0.78.1 bot Context 对话框的 skills 部分。

原版入口有四个（bot 设置 Overview/Context、bot 复制、建 bot 向导、聊天内挑选卡，RE Q4）。本单只做**一个**：我们的 bot 设置 info pane（`overrides/modules/agent-settings.tsx`，P5-57 已在这里追加 Configuration / Model / Main bot 段）。其余入口、「Add new skill」手填、文件导入（7 种扩展名）不做——没有写入方（T7a 的库是派生视图），写进 queue 提议。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md（run-e2e 不重建 dist；Xvfb；只截目标窗口）
2. `work/p9-dsh-integration/RE-skills.md` Q4、Q7（文案与上限）；0.78.1 产物（`/dev/shm/grok-re/0.78.1/app/dist/renderer/assets/`）：`chunk-team-bot-context-dialog-BhePh4Ev.js`（`readListing` / `addSkills` / `removeBotSkill`）、`chunk-team-setup-new-skill-dialog-DwGXKoR0.js`；文案键（`index.eager-common-DbK3Oi_r.js` / `index.eager-app-iGTgHP_Q.js`）：`76J7mZ`「Pick from your skills」、`IYyHwi`「Added skills」、`ggmjet`「All skills」、`y0eCAK`（N suggested）、`WnW32b`（250 上限）、`YNjRIY`（already listed）
3. 参照图渲染法：`work/p5-parity/RE-stub-boot.md`（R3：静态起 0.78.1 renderer + preload 桩 + fake coordinator），脚本 `work/p5-parity/harness/grok-r3/{serve.mjs,drive.mjs,stub-init.js}`；加新视图的先例 `stub-init-market.js`
4. 我们这边：`app/ui/renderer-grok/README.md`（覆盖层规矩：只在 `overrides/` 与 `shim/`，`pnpm check` 保上游 diff=0）、`overrides/modules/agent-settings.tsx`（追加段的写法）、`overrides/modules/new-bot-dialog.tsx`（我们自己的对话框先例）、`overrides/modules/pbots-ui.ts` + `shim/src/bots.ts`（`window.pbotsUi` 数据面）
5. e2e 模板：`app/ui/tests/e2e/settings.spec.ts`（info pane 打开法、亮暗截图）、`app/ui/tests/support/ui.ts`（`launchProduct` / `createBots`）

## 步骤
1. **参照图**（不依赖 T7a）：用 R3 桩渲染 0.78.1 bot Context 对话框的 skills 部分——fixture：一个 bot，onBot 1 条、库里 2 条未添加；截两态 ×亮暗：(a) Added skills 列表；(b) Pick from your skills 勾选态。存 `work/p9-dsh-integration/ref/skills-{added,pick}.{light,dark}.png`，桩改动放 `work/p5-parity/harness/grok-r3/stub-init-skills.js`（新文件，不改已有桩）。**止损**：渲不出来（缺 fixture 方法、boundary 崩）累计约 2 小时就停，回执写清卡在哪个 RPC / 字段，经理定降级（静态读 CTX/DIA 布局 + 标「未验证」）。
2. **数据面**：`shim/src/bots.ts` 的 `PbotsUi` 加 `skills(req)`，透传 `window.pbots.skills`；`overrides/modules/pbots-ui.ts` 导出同名包装。
3. **UI**：`agent-settings.tsx` 在现有段之后追加 Skills 段（标题、已添加列表：名字 + 描述 + 移除）；新建 `overrides/modules/skills-dialog.tsx`：候选列表（名字、描述、来自哪个 bot）、勾选、Add（逐个 enable，回值名字带 `-2` 时照实显示）；错误码 `pbots/too-large` / `pbots/limit` 显示可读提示（文案取原版对应键）。离线（`useOnline()` 为 false）时按钮禁用，照 Model 段的写法。
4. 截图对照：e2e 里截我们这边同两态 ×亮暗，和第 1 步参照图拼「ours | ref」四张。

## 边界
1. 只动：`app/ui/renderer-grok/shim/src/bots.ts`、`app/ui/renderer-grok/overrides/modules/{agent-settings.tsx,pbots-ui.ts}`、新建 `overrides/modules/skills-dialog.tsx`、必要时 `overrides/*.css` 新增一个 `t7b.css`（不改已有 css）、新建 `app/ui/tests/e2e/skills-picker.spec.ts`、新建 `work/p5-parity/harness/grok-r3/stub-init-skills.js`、`work/p9-dsh-integration/ref/*`。`frontend/`、`source/`（上游字节）、main、preload、app/sdk 不碰。
2. 先写失败测试：先写 `skills-picker.spec.ts`，在 UI 未实现时跑一次（应在找 Skills 段 / Pick 按钮处超时红），贴原样输出。
3. 截图只截 Electron 页面（`page.screenshot`），不截整块桌面；跑在 run-e2e.sh 的 Xvfb 里，不弹真实桌面。
4. 测试走隔离 HOME / TMPDIR（`/tmp/bot-T7b-*`）。机器在跑训练：load > 20 时等一等。

## 验收（写命令，不写感觉）
统一前置：`T=$(mktemp -d /tmp/bot-T7b-XXXX); mkdir -p $T/tmp $T/home; cd /tmp/bot-wt/T7b/app/ui; E="env HOME=$T/home TMPDIR=$T/tmp"`
1. 上游未动：`cd renderer-grok && pnpm check` → 通过（upstream diff=0、资产 sha256 不变）。
2. e2e：`pnpm build && $E sh scripts/run-e2e.sh tests/e2e/skills-picker.spec.ts` → 1 passed。场景：`createBots` 建 A、B；测试直接往 `workspaces/<A>/.dsh/skills/t7b-flow/SKILL.md` 写一个合法 skill（模型链 T7a 已测，这里不再驱动 A）；打开 B 的 info pane → Skills 段 Added 为空 → 点「Pick from your skills」→ 对话框里有 `t7b-flow`（且显示来自 A）→ 勾选 → Add → 对话框关闭、Added 列表出现 `t7b-flow`，且磁盘 `workspaces/<B>/.dsh/skills/t7b-flow/SKILL.md` 存在、字节等于 A 的；点移除 → 列表与磁盘都没了，A 的还在。另一格：B 已有 250 条（测试预种）时 Add → 界面出现上限提示、磁盘无新增。
3. 截图：`test-output/T7b/` 下有 `skills-{added,pick}.{light,dark}.png` 与对应 `compare-*.png`（ours | ref）共 8 张；经理用 Read 亲眼看，回执逐张写「已对齐 / 有差异（列出，附原因）」。参照图若走了止损降级，compare 图里 ref 一栏放降级来源并在回执标「未验证」。
4. 定向回测不坏：`$E sh scripts/run-e2e.sh tests/e2e/settings.spec.ts tests/e2e/grok-dead-entries.spec.ts` → 与起点同数全绿（同一个 info pane）。
5. 变异红一格（贴原样输出，还原不提交）：M1 Add 按钮只关对话框、不调 enable → 验收 2 的磁盘断言红。
6. 收尾：`ls -A $T/tmp | grep -v node-compile-cache | wc -l` → 0；独立 shell `pgrep -af 'bot-T7b' | grep -v pgrep` → 空；R3 渲染用的 chrome / server 进程已停（`pgrep -af grok-r3 | grep -v pgrep` → 空）。
7. 改动面：`git diff --stat <起点>..HEAD` 只含边界第 1 条的文件。

## 为什么这样验收
用户在界面上真正要完成的是「把 A 的 skill 加到 B」，所以 e2e 以**磁盘上 B 的副本**为准（不是看 UI 列表刷新了没有；M1 让「UI 看着成功、其实没调接口」这种假绿必须红），移除同理要看 A 的原件还在（停用 = 删副本，RE Q7）。250 上限格保证错误路径在界面上可见，不是吞掉。外观对齐靠参照图并排给人看——0.18 移植版里没有这个对话框，没有参照就只能凭感觉，所以第 1 步先做参照、做不出来要明确降级标记而不是悄悄跳过。`pnpm check` 守住「覆盖层只在 overrides/shim」的仓规矩。

## 风险
- 0.78.1 的 Context 对话框数据可能经 `desktop.main` 而不是 coordinator 取（`readListing`），桩要逆字段；这是第 1 步止损存在的原因。
- 我们的 info pane 布局和原版 Context 对话框不是同一种容器（pane vs 弹窗），对照时容器差异算「已知差异」写明，不为此改 pane 结构。

## 产出
- 新建：`overrides/modules/skills-dialog.tsx`、`app/ui/tests/e2e/skills-picker.spec.ts`、`work/p5-parity/harness/grok-r3/stub-init-skills.js`、`work/p9-dsh-integration/ref/skills-*.png`、（可选）`overrides/t7b.css`
- 修改：`shim/src/bots.ts`、`overrides/modules/agent-settings.tsx`、`overrides/modules/pbots-ui.ts`
- 回执：`work/tickets/receipts/T7b.md`（含先红输出、M1 输出、8 张图逐张结论、参照图是否降级）
