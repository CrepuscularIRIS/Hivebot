# T57：设置对话框按 0.78.1 像素规格对齐（外壳 / 导航 / 标题 / 设置行 / Select / Switch）

> 开单：manager (Opus 5.5) | 日期：2026-11-11 | 施工：main (GLM 5.3)
> 来源：work/ui-polish-win/PLAN.md 行 P2；`work/grok-0.79.3-re/RE-UI-LAYOUT-0.78.1.md` §1.1–1.6；参照图 `work/ui-polish-win/ref/settings-general-{light,dark}.png` + `settings-general-light.deep-probe.txt`
> 分支 / 作业目录：feat/T57 @ /tmp/bot-wt/T57
> claimed：9e97fe47（56a59667 施工 + Sol MAJOR/2MINOR 修复，feat/T57 @ /tmp/bot-wt/T57，2026-11-11 待经理验收）
> accepted：2026-11-11 feat/T57 @ 442d6be1（manager 任务 B，T57+T57b 一并；遗留差距转 T57c）

## 目标
打开 Settings，几何与颜色和 0.78.1 一致（1280×800 窗口下逐项量得到），只放有实底的行。

## 规格（全部取自 RE §1，施工逐项对表，回执列「项 / 原版值 / 改前 computed / 改后 computed」）
- 外壳 §1.1：宽 `min(900px,100vw−32px)`、内容高 `min(700px,100vh−96px)`、底 `--sand-bg-chrome`（#fcfcfc / #121212）、圆角 14、四边 .5px `--sand-border-secondary-translucent`、scrim 50% / 69.7%。
- 导航 §1.2：宽 198、容器 padding 16/12、项 padding 7/9 gap 9 icon 15 字 13/18、行距 34、选中 bg `--sand-bg-active` radius 8、右分隔 .5px。
- 标题 §1.3：h2 17/500 primary；h3 12/400 secondary；pane 右留白 54；Close 32×32 tertiary。
- 设置行 §1.4：gap 8、padding-block 8、padding-inline 14/4、**radius 14（运行时值，勿抄静态 12）**、label 13/400 primary、description 13 tertiary、分组 gap 6、行高约 48。
- 控件 §1.6：Select 高 28 radius 10 padding 4/5/4/7 字 13/18 透明底 + 1px `--sand-border-quaternary-translucent`；Switch 32×20 knob 16。
- General 行序 §1.5，但**只放有实底的行**（Account / Appearance-Theme / 现有 Timezone 等；Security Key / Microphone / Bot color 无实底不放，沿用 P5-52 口径）。不加导航项（Models 是 T50 的事）。

## 第 0 步
先量现状：写 e2e spec 用 `getBoundingClientRect` + `getComputedStyle` 取上面每一项（亮暗各一遍），对表，**看哪些已对、哪些不对**——已对的不动。回执贴改前表。

## 边界
1. 只动设置相关的 overrides CSS（施工定位具体文件，回执写明）与新 spec `app/ui/tests/e2e/t57-settings-layout.spec.ts`。优先 CSS 覆盖，不改 recovered 组件结构；非改 tsx 不可时停下写回执。
2. 与 T50 并行时：本单不碰 `settings-view.tsx` 的 section 列表；T50 的 Models 行复用设置行组件，自然吃到本单的行样式。
3. 先写失败测试（spec 断言原版值），看红再改。

## 验收
1. `cd /tmp/bot-wt/T57/app/ui && pnpm build && PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/t57-settings-layout.spec.ts` → 全过（亮暗两遍，每项 ±1px / 颜色精确值）。
2. 截图：`work/ui-polish-win/evidence/T57/settings-{light,dark}.png`（1280×800），与 `ref/settings-general-{light,dark}.png` 并排；经理 Read 亲看。
3. 回归：`theme-dual.spec.ts`、`t56-primary-text.spec.ts` 不新增红（回执贴数字行）。
4. `git diff --stat` 只含边界内文件。

## 为什么这样验收
「像不像原版」靠眼睛会吵不完，靠逐项 computed 值就没得吵；但值对了画面也可能怪（叠层、溢出），所以再要并排截图。

## 经理验收（任务 B，2026-11-11 @ 9e97fe47）：不通过 → T57b
- 重跑：t57 spec `1 passed (5.1s)`；回归 theme-dual+t56 `2 passed (16.2s)`；diff 40142999..9e97fe47 = css/1 行 import/spec 三文件 ✓。
- 抽 3 项对 RE：§1.1 scrim 50%/69.7% ✓、§1.2 nav 198/padding 16·12/项 7·9/选中 8% r8 ✓、§1.6 Select 28/4·5·4·7/r10/gap4 ✓。
- **不过的原因 = 验收第 2 条（截图对 ref）**：导航项全带 0.18 按钮底+边、pane 头深色分隔线、分组卡缺失而行带圆角（RE §1.4 文本层级错，probe 为准）、scrim 规则随懒加载 chunk 才生效。详见 `open/T57b-settings-layout-fix.md`。本单留 doing，T57b 过后一并验收合并。

## 经理终验（任务 B，2026-11-11 @ 442d6be1）：通过（与 T57b 一并）——详见 `done/T57b-settings-layout-fix.md` 末段；可合并 feat/T57。遗留卡层差距转 T57c。
