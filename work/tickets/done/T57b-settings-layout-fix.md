# T57b：T57 返修——截图对 ref 不过：导航项残留 0.18 按钮底+边、pane 头分隔线、行/分组卡层级放错、scrim 懒加载

> 开单：manager (Opus 5.5) | 日期：2026-11-11 | 施工：main (GLM 5.3)
> 来源：T57 任务 B 验收（@ 9e97fe47 不通过）；Sol 批审 `review/T57-T62.sol-review.md` 末尾经理核实段
> 分支 / 作业目录：feat/T57 @ /tmp/bot-wt/T57（在 9e97fe47 上续提交）
> claimed：442d6be1（main，feat/T57 @ /tmp/bot-wt/T57）
> accepted：2026-11-11 feat/T57 @ 442d6be1（manager 任务 B，T57+T57b 一并；遗留差距转 T57c）

## 目标
`evidence/T57/settings-{light,dark}.png` 与 `ref/settings-general-{light,dark}.png` 并排看，除「无实底行不放」外结构一致；spec 断言值以 **渲染 probe**（`ref/settings-general-light.deep-probe.txt`）为准。

## 为什么返修（经理亲看截图 + 对 probe 发现）
spec 1 passed，但截图与 ref 明显不同；且 RE §1.4 把「分组卡」和「行」的值混写了，spec 照抄了错层级。
1. **导航项（Sol MAJOR 未治本）**：view.css:46 `.sand-settings-dialog button:not(...)`（0,4,1）钉 background+border 到所有 nav 项。T57 只反压了选中项 bg——**未选中项**仍有 bg-secondary 底 + 1px 边，**选中项**也有 1px 边（截图 Models/General 都是框）。probe 行 6/9/12：未选中 bg `rgba(0,0,0,0)`、全部 `border-width:0`。修法：在已有的 (0,5,1) 条上加 `background: transparent; border: 0;`（选中条仍覆盖 bg）。
2. **pane 头（§1.3）**：view.css:27 `.sand-settings-panel > h2` 的 `border-bottom` + `padding 17px 24px` + `height 54` 未覆盖——截图标题下一条深色实线、标题 x≈413/y≈80。probe 行 18/20：header padding `32px 54px 6px 32px`、无边；h2 rect [421,85]、24px 行高、`padding-inline-start 8px`、letter-spacing −0.136px；ref 标题 x≈429。
3. **行 vs 分组卡（§1.4，RE 文本层级错）**：probe 行 59/60/74：
   - 分组卡（h3 下的容器）：`padding 8px 0`、`radius 14`、bg 亮 `rgb(255,255,255)`（施工查 palette 对应 token，暗色取同 token 暗值；ref 暗图卡底 ≈#1e1e1e 带细边——边是 box-shadow/outline 的话 probe 不显示，施工用 getComputedStyle 的 box-shadow/outline 再确认）
   - `.sand-settings-row`：`padding 10px 14px`、`radius 0`、透明底、`gap 8px 20px`、高 48
   - section：gap 8（标题与卡之间）；`.sand-settings-general` 分组间 gap 28；pane padding `22px 32px 28px`
   - 现状：T57 把 radius 14 + padding 8/14/4 放在**行**上、无卡；Account 卡仍是 0.18 灰底 + 深色 1px 边（view.css:36）。spec 129–132 行断言（padding 8/14/4、行 radius 14）要改成上面 probe 值，并新增分组卡 bg/radius/padding 断言（亮暗各一）。
   - 我方 General 是 `section > h3 + label…` 结构（无卡 wrapper）。先试纯 CSS（如对 section 内非 h3 子项做首尾圆角 + 同底色拼成卡）；**纯 CSS 做不到就停下写回执**，不改 recovered 组件结构（T57 边界 1 不变）。
4. **scrim 懒加载（Sol MINOR 修复的副作用）**：`.sand-dialog__scrim` 规则放在 `settings-view-t57.css`，而它经 `settings-view.tsx` 只随 `ProductionRenderer.tsx:154` 的 **lazy** `desktop-surface` 加载——会话里开过设置前，其他 OverlayDialog（deep-links / sign-out / app-alert / feedback，`grep -rl OverlayDialog frontend/src`）暗色 scrim 是 50%，开过后变 69.7%，结果取决于打开顺序。修法：把这一行挪到首屏就加载的 overrides 样式表（与 p5-55 系列同处，施工定位），文件头注释写明「平台 dialog 通用」。注：市场浮层**不走** OverlayDialog（走 ProductionRenderer overlay 帧，见 `overrides/p5-57.css:53`），不受此行影响——派单说「市场面同吃」不成立。
5. `settings-view-t57.css` 文件头注释仍写「scrim 暗色 69.7% 不做」，与 9e97fe47 矛盾，删掉。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md（T57 特异性战一条）
2. `ref/settings-general-light.deep-probe.txt` 行 3–75（用 `python3 -c` 逐行 json 取 rect/padding/radius/bg 最省事）
3. recovered `features/settings/overlay/view.css` 行 19–46

## 边界
1. 只动：`settings-view-t57.css`、`t57-settings-layout.spec.ts`、scrim 挪去的那一个 eager overrides 样式表（一行）。不改 recovered、不改 tsx 结构。
2. 先改 spec 断言到 probe 值（新增：未选中 nav 项 bg 透明 + 全部 nav 项 border 0；header padding/无 border-bottom；分组卡 bg/radius/padding；行 padding 10/14、radius 0），看红再改 CSS。
3. 不跑全量 e2e。

## 验收
1. `cd /tmp/bot-wt/T57/app/ui && pnpm build && CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/t57-settings-layout.spec.ts` → 1 passed（含上面新增断言，亮暗两遍）
2. 回归：`... run-e2e.sh tests/e2e/theme-dual.spec.ts tests/e2e/t56-primary-text.spec.ts` → 2 passed
3. 截图重生成后与 ref 并排：导航无框、标题下无线、分组为圆角卡、行无单独圆角。经理 Read 亲看。
4. `git diff --stat 9e97fe47..HEAD` 只含边界 1 的文件。

## 为什么这样验收
T57 第一轮证明了「spec 全绿 ≠ 像原版」：断言只取了 RE 文本，RE 文本把卡和行的值放错层，导航只断言了选中项。所以这次断言以渲染 probe 为准、补上「未选中」与「边框」这类反向断言，再用截图兜底。

## 经理验收（任务 B，2026-11-11 @ 442d6be1）：通过（T57+T57b 一并），遗留差距转 T57c
- 重跑（先 `pnpm build` exit 0）：t57 spec `  1 passed (5.0s)`；回归 theme-dual+t56 `  2 passed (15.7s)`。
- 范围：`git diff --stat 9e97fe47..HEAD` = settings-view-t57.css / p5-55-layout.css(+7) / t57 spec，边界 1 内 ✓。
- ④scrim 核实成立：`renderer-grok/scripts/inject-shim.mjs:20-22` 把 `overrides/*.css` 逐个 `<link>` 进 index.html；构建产物 `renderer-grok/.build/frontend-shell/index.html` 含 `override-p5-55-layout.css`，该文件含 `.sand-dialog__scrim`；`--sand-bg-scrim` 亮 #00000080 / 暗 #000000b2（p5-55-palette.css:227/590）✓。
- 截图亲看（evidence/T57 vs ref，亮暗）：导航无框 ✓、标题下无线 ✓、Appearance/Agent 为圆角白卡 ✓、行无单独圆角 ✓——验收第 3 条四点成立。
- **卡近似请示 → 选 B**：原版卡是真实 DOM 层（probe 行 39：padding 8px 0 / r14 / 白底，Account 也包在同一层里），CSS 拼卡做不出上下 8px、做不出卡边、管不到 Account。授权改 recovered `computer-view-internals.tsx` 的 `SettingsGroup`（加一层卡 div），另开 `open/T57c-settings-group-card.md`。
- 像素实测的遗留差距（python 逐列取色，x=700；全部转 T57c，不算本单返修）：
  | 项 | ref | 我方 |
  |---|---|---|
  | 首个 h3 文字顶 | y140 | y150 |
  | h3 文字底→卡顶 | 13 | 26（h3 自带 margin，spec 断言的是 section gap 计算值，不是实际间距） |
  | 卡底→下一卡顶 | 53 | 78 |
  | 卡边 | 1px #ededed（亮） | Theme/Timezone 卡无边；Account 仍 0.18 灰底 #e5e5e5 + #393939 深边 |
  | h3 文字 x | 435 | 421 |
