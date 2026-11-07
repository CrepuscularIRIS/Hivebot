# T7bd：T7b 合并后返修——对话框打不开（SandIconButton 未导入）+ 暗色 Add 可读 + 截图换成 HEAD 构建出的

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：Q-030（用户：「先合并, 然后再修复」）；done/T7b、T7bb、T7bc 三轮终验记录；经理开单探针（下面「现状」第 1 条）
> 分支 / 作业目录：**直接在集成分支 `docs/rebuild-p6-p5-plan`**（主仓 `~/bot`）。小单，且第 1 步是修主线已坏的功能，越早落越好。分两个提交：① 导入修复 ② 视觉 + 截图 + 回执
> 排期：**现在就开，与 T11 并行**（不碰 T11 任何文件）。唯一的冲突点是 e2e：本单跑 app/ui e2e 时 T11 不跑 sdk e2e，同一时刻只跑一套
> claimed：2026-11-06 22:2x main (GLM 5.3) @ 集成分支（紧急修优先）
> accepted：
> 失败计数：新单，从 0 计（T7b 链 3 次失败已由 Q-030 收口）

## 目标
主线上的「Pick from your skills」对话框现在**打不开**，先修好；再把三轮终验留下的视觉问题收口：暗色 Add 字看不见、对话框底色写死在内联样式、截图必须是已提交代码构建出来的。

## 现状（经理 2026-11-06 22:1x 在主线 9d9ce518 实测）
1. **功能回退，不只是外观**：`skills-dialog.tsx:48` 用了 `SandIconButton`，但第 5 行只导入 `SandButton, SandIcon`。esbuild 不做类型检查，所以 build 能过；产物 `out/renderer/assets/index-BNmaxC-O.js`（22:07）里 `SandIconButton` 只出现 1 次（使用处，无定义）→ 对话框一渲染就 ReferenceError。经理在主仓直接跑 `run-e2e.sh tests/e2e/skills-picker.spec.ts` → **2 failed**，两格都卡在 `skills-picker.spec.ts:96` `expect(locator('[data-skills-dialog]')).toBeVisible()` 超时。LOG 22:3x 写的「回测 114+2 绿」与此不符。
2. **暗色 Add**：Add 是 `SandButton` 默认 neutral primary，字色类 `.sand-xcaa6e:not(#\#)×3 { color: var(--sand-text-on-primary) }`、底色类 `.sand-1wclgxm { background-color: var(--sand-fill-primary) }` 都挂在 `<button>` 本身（内层 span 只有 min-width/overflow/ellipsis，字色继承 button）。cursor-dark 下 `--sand-text-on-primary` 是 `#f5f5f5`。`t7b.css:31-33` 已有一条 `html[data-theme="cursor-dark"] .pb-skills-dialog [data-action="skills-add"] { color: #121212 !important }`，但三轮截图从来不是 HEAD 构建出来的，这条规则到底有没有生效没人验证过。
3. **对话框底色写死**：`skills-dialog.tsx:45` 内联 `style={{ background: 'var(--sand-bg-elevated, #fff)', borderRadius: 12, boxShadow: … }}`，应进 `t7b.css`（`--sand-bg-elevated` 亮暗都有定义，不需要 `#fff` 兜底）。
4. **截图**：`work/p9-dsh-integration/ref/skills-pick.dark.png` 是勾选态、× 是图标、行已分开，但 Add 仍是白块没字；而且它来自 T7bc 施工时未提交的构建，不能当证据。`t7b-shot.spec.ts` 现在已经是先勾选再截（T7bb「未勾选态」一项在 spec 上已解决），只差在 HEAD 上真跑一次。
5. **回执旧账**：集成分支 `receipts/T7b.md` §8 写「SandIconButton≥2、e2e 3 passed」，与第 1 条事实不符（虚报）。feat/T7b 上那份重复回执已删，合并后不再撞文件。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md（run-e2e 不重建产物；隔离 HOME/TMPDIR；一律 `pnpm --config.verify-deps-before-run=false exec sh scripts/run-e2e.sh`）
2. `done/T7bc-skill-picker-visual-2.md`「终验」节
3. `overrides/modules/new-bot-dialog.tsx:10,124`（SandIconButton 的导入与用法先例）

## 边界
1. 只动：`app/ui/renderer-grok/overrides/modules/skills-dialog.tsx`、`app/ui/renderer-grok/overrides/t7b.css`、`app/ui/tests/e2e/t7b-shot.spec.ts`、`work/p9-dsh-integration/ref/skills-*.png`、`work/tickets/receipts/T7b.md`（只在 §8 后加一行更正）、新建 `work/tickets/receipts/T7bd.md`。不改色板、不改别的 css、不改 `skills-picker.spec.ts`。
2. 做法（最小）：
   - 第 5 行改成 `import { SandButton, SandIconButton } from …`（`SandIcon` 无人用，一并去掉）。**这一步单独一个提交**，跑绿就提交（主线功能先恢复）。
   - `skills-dialog.tsx:45` 的内联 style 删掉，挪到 `t7b.css` 的 `.pb-skills-dialog > div`（`background: var(--sand-bg-elevated); border-radius: 12px; box-shadow: …`）。
   - `t7b.css:32` 的 `#121212` 换成 `var(--sand-text-inverted)`（暗色 = #121212，工单 T7bc 原指定）。
   - `t7b.css:27` `[data-action="skills-pick"] { color: inherit !important; }`：Pick 已是 secondary，删掉后若验收 3 的 skills-pick 断言仍绿就删（少一条 !important），红就留。
   - `t7b-shot.spec.ts`：删没用的 `shot` 函数、末行 `void shot`、未用的 `readFileSync`/`existsSync` 导入。对比度断言不动。
3. 先红（两处，原样贴回执）：
   - ① 在**当前 HEAD**（导入修复前）`pnpm build` 后跑 skills-picker → 2 failed，卡在 `:96` `[data-skills-dialog]`。
   - ② 导入修好后，临时删掉 `t7b.css` 的暗色 Add 那条规则，`pnpm build` 后跑 t7b-shot → 断言「暗色按钮字色≠底色 [data-action="skills-add"]」红（贴出 color 与 bg 的实际值）。还原后绿。**若删了规则也不红**，说明断言取错了元素或规则从未生效，停下写进回执存疑项，不许改成「能过」的断言。
4. 隔离 HOME / TMPDIR / DBus；`PLAYWRIGHT_BROWSERS_PATH=/home/lingxufeng/.cache/ms-playwright`；load > 20 时等。收尾 `bot-reap` 自己的 Xvfb。

## 验收（写命令，不写感觉）
统一前置：`T=$(mktemp -d /tmp/bot-T7bd-XXXX); mkdir -p $T/tmp $T/home; cd ~/bot/app/ui; E="env HOME=$T/home TMPDIR=$T/tmp DBUS_SESSION_BUS_ADDRESS=unix:path=/nonexistent PLAYWRIGHT_BROWSERS_PATH=/home/lingxufeng/.cache/ms-playwright"`
1. `git status --short app/ui` → 空（**证明下面跑的是已提交代码**）；`git rev-parse --short HEAD` 贴出
2. `pnpm --config.verify-deps-before-run=false build` → exit 0；`ls -l --time-style=+%H:%M:%S out/renderer/assets/index-*.js` 时间晚于 HEAD 提交时间（`git log -1 --format=%cd --date=format:%H:%M:%S`）
3. `$E pnpm --config.verify-deps-before-run=false exec sh scripts/run-e2e.sh tests/e2e/skills-picker.spec.ts tests/e2e/t7b-shot.spec.ts` → 3 passed
4. `$E pnpm --config.verify-deps-before-run=false exec sh scripts/run-e2e.sh tests/e2e/settings.spec.ts tests/e2e/grok-dead-entries.spec.ts` → 3 passed
5. `cd renderer-grok && pnpm check` → `upstream diff=0: 332 files`
6. `grep -c SandIconButton renderer-grok/overrides/modules/skills-dialog.tsx` → 2；`grep -n "style={{\|#121212\|#fff" renderer-grok/overrides/modules/skills-dialog.tsx renderer-grok/overrides/t7b.css` → 空；`grep -c SandIconButton out/renderer/assets/index-*.js` → ≥2（有定义，不再是孤立引用）
7. 四张 `test-output/T7b/skills-{added,pick}.{light,dark}.png` 覆盖归档到 `work/p9-dsh-integration/ref/`。经理 Read 目检：pick 两张为勾选态、Add 亮暗都看得清「Add」字；× 是图标按钮；候选行名字 / 来源 / 描述分开；对话框暗色底不是白的；added 两张 Pick / Remove 可读。
8. 改动面：`git diff 9d9ce518..HEAD --stat` 只含边界第 1 条的文件。
9. 收尾：`pgrep -af 'bot-T7bd' | grep -v pgrep` → 空；`ls -A $T/tmp | grep -v -e node-compile-cache -e playwright-transform-cache | wc -l` → 0。

## 为什么这样验收
三轮返修失败的共同根子不是 CSS 难写，而是**证据不来自已提交代码**：回执贴的 e2e 和截图都出自工作区里的临时构建，HEAD 本身连对话框都渲染不出来，合并时也没人发现。所以验收 1–2 先钉死「工作区干净 + 产物比提交新」，3 用 skills-picker 守住功能（磁盘副本断言），先红②证明对比度断言真能咬住暗色 Add，7 由经理亲眼看图。参照图仍按 T7b 的降级处理（不要求 0.78.1 compare 拼版）。

## 产出
- 提交 ①：`skills-dialog.tsx` 第 5 行
- 提交 ②：`skills-dialog.tsx`（删内联 style）、`t7b.css`、`t7b-shot.spec.ts`、`ref/skills-*.png`、`receipts/T7bd.md`（先红两段 + 验收 1–9 原样输出 + 四张图逐张一句）、`receipts/T7b.md` §8 后加一行「§8 所称 SandIconButton≥2 / 3 passed 不实，见 T7bd」
