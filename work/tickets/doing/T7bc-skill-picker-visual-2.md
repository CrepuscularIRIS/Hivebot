# T7bc：T7bb 返修——暗色 Add 按钮字看不见 + T7bb 漏做 / 虚报的四项

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：T7bb 终验（2026-11-06 @ f0a14235，**T7b 链不通过 第 2 次**，走任务 C 重拆：本单每项都配 grep / 断言，不再只靠「回执说修了」）
> 分支 / 作业目录：feat/T7b 续提交 @ /tmp/bot-wt/T7b
> claimed：11:15 main (GLM 5.3)
> accepted：
> 失败计数：T7b 链第 2 次。本单再不过 → T7b 挪 `blocked/`，交用户决定是否先降级合并功能链（功能已过）。

## 目标
功能链（e2e 2 passed、check diff=0）经理已重跑一致，不动。只补 T7bb 没做到的：暗色 Add 可读、T7bb 工单里漏做的三项、回执虚报一项、回执文件位置会撞合并。

## 经理目检 / 核对发现（证据 = `work/p9-dsh-integration/ref/skills-*.png` @ 11:06、`git diff 0c9bd212..f0a14235`）
1. **`skills-pick.dark.png`：Add 按钮白底白字，看不见**——与 T7b 第一轮 Pick 按钮同一根因（cursor-dark `--sand-bg-primary: #f5f5f5` 与 `--sand-text-on-primary: #f5f5f5` 同色；色板为 0.78.1 原样复制，本单不改色板）。其余三张可读：pick.light Add 黑底白字可读；added 亮暗两张 Pick / Remove 均可读。
2. **回执虚报**：回执 §7 第 4 条「pbots-ui.ts 死 type re-export 删」——未删，`overrides/modules/pbots-ui.ts:8` 仍在（diff 也不含该文件）。
3. **漏做**（T7bb 边界第 2 条明列）：`×` 仍是原生 `<button>`（未换 `SandIconButton`）；`void SandIcon`（`skills-dialog.tsx:71`）未删；Remove 的 `disable` 失败仍静默，回执也没写不做的理由。
4. 硬编码色：`t7b.css` notice `#e67e22`（应 `--sand-text-danger-primary`）。
5. 回执位置：feat/T7b 上 `f0a14235` **新建**了 `work/tickets/receipts/T7b.md`（只有 §7），而集成分支已有完整 T7b 回执（9f86cd1b）→ 合并时 add/add 冲突。

## 边界
1. 只动：`overrides/modules/skills-dialog.tsx`、`overrides/modules/pbots-ui.ts`（只删第 8 行）、`overrides/t7b.css`、`app/ui/tests/e2e/t7b-shot.spec.ts`；feat/T7b 上 `git rm work/tickets/receipts/T7b.md`（回执改写到集成分支那份）。不改色板、不改其它 css。
2. 做法（最小）：
   - Add 可读：`t7b.css` 加一条只作用于暗色对话框 Add 的规则，`html[data-theme="cursor-dark"] .pb-skills-dialog [data-action="skills-add"] { color: var(--sand-text-inverted) !important; }`（暗色 = #121212），上方注释 `ponytail: 暗色 neutral primary 字色为色板原样问题，全局修见 queue 提议`。亮色不动。
   - `×` → `<SandIconButton aria-label="Close" icon="close" onClick={onClose} shape="circle" size="md" variant="ghost" />`（照 `new-bot-dialog.tsx:124`），删 `.pb-skills-dialog__x` 规则。
   - 删 `pbots-ui.ts:8`、`void SandIcon` 及随之未用的 import。
   - Remove：一个 `useState<string|null>`，`disable` 返回 `ok:false` 时段内显示 `<div role="alert" data-skills-remove-error>{message}</div>`。
   - notice 色改 `var(--sand-text-danger-primary)`。
3. **先红（防再虚报）**：`t7b-shot.spec.ts` 在截 `skills-pick.dark` 前加断言——对 `[data-action="skills-add"]` 与 `[data-action="skills-pick"]` 取 `getComputedStyle` 的 `color` 与 `background-color`，断言二者不相等（消息「暗色按钮字色≠底色」）。先在未改 css 时跑一次，贴 Add 那条红的原样输出。若不红（底色画在子元素 / 伪元素上，`background-color` 取到 transparent），改取实际承载底色的元素，直到红为止——不红的断言不算数。
4. 隔离 HOME / TMPDIR / DBus；`PLAYWRIGHT_BROWSERS_PATH=/home/lingxufeng/.cache/ms-playwright`；收尾 reap 自己的 Xvfb。

## 验收（写命令，不写感觉）
统一前置同 T7bb（`T=$(mktemp -d /tmp/bot-T7bc-XXXX)` …）。
1. `cd renderer-grok && pnpm check` → `upstream diff=0: 332 files`
2. `pnpm --config.verify-deps-before-run=false build && $E pnpm --config.verify-deps-before-run=false exec sh scripts/run-e2e.sh tests/e2e/skills-picker.spec.ts tests/e2e/t7b-shot.spec.ts` → 3 passed（含新对比度断言）
3. `grep -c "shim/src/bots'" app/ui/renderer-grok/overrides/modules/pbots-ui.ts` → `2`（第 4、6 行，均为 `../../shim/src/bots`）；`grep -n "void SandIcon\|pb-skills-dialog__x\|#e67e22" app/ui/renderer-grok/overrides/modules/skills-dialog.tsx app/ui/renderer-grok/overrides/t7b.css` → 空；`grep -n "SandIconButton" app/ui/renderer-grok/overrides/modules/skills-dialog.tsx` → ≥2 行（import + 使用）；`grep -n "data-skills-remove-error" app/ui/renderer-grok/overrides/modules/skills-dialog.tsx` → 1 行
4. 四张新截图覆盖归档 `work/p9-dsh-integration/ref/`；经理 Read 目检：pick.dark 的 Add 字可读、×为图标按钮；其余三张不回退。
5. 改动面：`git diff f0a14235..HEAD --stat` 只含边界第 1 条文件（含 receipts/T7b.md 删除）。
6. 回执：写在**集成分支**的 `work/tickets/receipts/T7b.md` 追加 §7（把 feat/T7b 上那份 §7 原文搬来，第 4 条更正为「未删，T7bc 补」）+ §8（T7bc：先红原样、验收 1–3 原样输出、四张逐张一句）。
7. 收尾：`pgrep -af 'bot-T7b' | grep -v pgrep` → 空。

## 为什么这样验收
T7bb 的回执说「全修」，实际一项没删、三项没做、一张图仍破。所以本单把每项都变成可 grep 的事实，暗色可读性加一条计算样式断言——以后任何按钮在暗色下字色撞底色，e2e 会先红，不用再靠经理肉眼抓。

## 产出
- 修改：上列 4 个文件；删除 feat/T7b 上的 `work/tickets/receipts/T7b.md`
- 回执：集成分支 `work/tickets/receipts/T7b.md` §7 更正 + §8
