# T58：市场浮层对齐 0.78.1——外壳同设置、输入框换成 input-group 体系、Index sources 视图排版

> 开单：manager (Opus 5.5) | 日期：2026-11-11 | 施工：main (GLM 5.3)
> 来源：queue「UI 质量专项」P3 行；规格 `work/grok-0.79.3-re/RE-UI-LAYOUT-0.78.1.md` §1.1 / §3 / §4 + `work/p5-parity/RE-market-detail.md` §1.2 / §4；前置 T51 / T56 / T57 已合并
> 分支 / 作业目录：feat/T58 @ /tmp/bot-wt/T58（从当前集成分支开；与在审的 T57c 不同文件，可并行）
> claimed：61f2b5a1→返修 143df565（外壳同设置/输入组/ActionBar 全绿 1p；回归 market 3p+8p；截图亲检——doing 待批审）
> accepted：2026-11-12 manager 复验通过 @0b9a2d58（随 T58b/T58c 一并终验；见 receipts/T58c-T68b.acceptance.md）

## 目标
市场浮层（Connect apps）的外壳、搜索框 / URL 输入框、Index sources 视图按原版规格量得上；修掉 T51 截图里看得见的毛病：Done 钮底部被裁、Add 钮与输入框不齐、输入框是灰底药丸而不是原版的 1px 描边输入组。

## 经理定的口径（不用再问）
1. **不吃 T57c 的 SettingsGroup 卡层**。原版市场列表行是 `li.sand-plugins-row` 平铺在 `sand-plugins-layout` 里（RE-market-detail §1.2），不是设置的分组卡；Index sources 是 DSH 来源的 Hivebot 自有视图，原版无对应面，用原版的列表行 + 表单词汇（input-group + ActionBar），也不套卡。
2. **外壳与设置同一套几何**：RE §1.1 高 `min(700px,100vh−96px)` 明写「设置/市场共用」；宽 `min(900px,100vw−32px)`、r14、边框 **.5px** `--sand-border-secondary-translucent`（现为 1px `--cursor-stroke-secondary`）、scrim 亮 `#00000080` / 暗 `#000000b2`（现两主题都是 `.5`）。底色：施工先在 CSSR（`work/p5-parity/evidence/078-css-rules-split.txt`）查市场 dialog surface 是否同为 `.sand-1sdb7ul`（设置用 `--sand-bg-chrome`）；同类 → 改 chrome，不同 → 保持 elevated，回执贴查到的行号。
3. **Add / Done 不改回 primary**（T51b 遗留问题的答复）：每次 Add 已经即时落盘，Done 只是返回，没有「待提交」——照原版 ActionBar 口径用 secondary。Add = `sm secondary pill`，与输入框同一行垂直居中；Done 进底部 ActionBar（`flex-end`、gap 8、RE-market-detail §4 的 actions 类），右对齐，完整可见。
4. 列表行几何（图标 40、trailing Connect = SandButton sm secondary → 高 26 / 药丸 / label 12px、✓Connected 的 check 图标 12px）已大体在位，本单只**断言**，不对就修。
5. RE §8 已说明：市场行 / 详情的**原版渲染帧没有**（ref 里的 market-list 两张是空白对话框）。像素对照只对外壳；行与输入框按静态规格数值断言。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md；T57 / T57c 工单（同壳的设置侧怎么做的、rect 相减断言写法）
2. `app/ui/renderer-grok/overrides/p5-57.css` 市场段（:5-17 外壳、:46-78 头 / 搜索 / 行、:99 `.pb-foot`、:210-217 sources）
3. `app/ui/renderer-grok/overrides/modules/market-surface.tsx`（:160-185 Index sources 视图、:290-312 tools 行）
4. 现状图：`work/settings-connectors/evidence/T51/shots/t51-{listed,manage,empty}-{light,dark}.png`

## 边界
1. 只动：`overrides/p5-57.css` 的市场段（`.pb-market*` / `.pb-search` / `.pb-row*` / `.pb-foot` / sources 段；`dialog.pb-dialog` 新建对话框共用规则若要分开，拆出市场专用选择器，**不改新建对话框外观**）、`market-surface.tsx`（只改结构 / 类名：输入组包层、ActionBar 包层；不改行为与数据流）、新 `app/ui/tests/e2e/t58-market-layout.spec.ts`。超出就停，写回执存疑项。
2. 先写失败测试：`t58-market-layout.spec.ts`（视口 1280×800，亮暗各一遍），下面验收 1 的断言先跑红再改。
3. 色值一律走 `--sand-*` / `--cursor-*` token，不写死；用 `getComputedStyle` 解析出的值与 token 求值后的值比。
4. 不跑全量 e2e。

## 验收（写命令，不写感觉）
（先 `cd /tmp/bot-wt/T58/app/ui && pnpm build`；playwright 看 `grep -E "passed|failed"` + `echo EXIT=$?`）
1. `CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/t58-market-layout.spec.ts` → passed，断言（rect 用 `getBoundingClientRect` 相减，±1）：
   - 外壳：市场 dialog rect 与同视口下设置 dialog rect 四值相等；border-top-width 0.5px 且颜色 = `--sand-border-secondary-translucent`；scrim 背景亮 alpha .5 / 暗 ≈.698；radius 14
   - 搜索框与 Index URL 输入框（RE §3）：容器 1px 边、边色 = `--sand-border-tertiary-translucent`、底 = `--cursor-bg-input-field`（亮 `#1c1c1c08` / 暗 `#f5f5f508`）；focus 后容器边色 = `--sand-border-primary-translucent`；input 本身无边无底、font-size 13 / line-height 18；placeholder 色 = text-secondary 档
   - 行（有源有结果时）：图标 40×40；Connect 钮高 26、radius ≥ 13、label font-size 12；`.sand-plugins__added` / ✓Connected 的 check 图标 12×12
   - Index sources：Add 钮中心 y 与输入组中心 y 差 ≤1；Done 在 ActionBar 内、右边 = 内容区右边（±1）、`done.bottom ≤ 滚动容器.bottom` 且 Done 的 rect 高 = 其 computed height（不被裁）；空态 / 校验错误 / 已加一条三种状态都断言一遍 Done 可见
2. 回归：`… run-e2e.sh tests/e2e/market.spec.ts` → 3 passed（:94 外壳断言若因 1px→.5px 变红，按新规格改那一格的期望值，回执贴前后——这是规格变更不是放松）；`… run-e2e.sh tests/e2e/theme-dual.spec.ts tests/e2e/t56-primary-text.spec.ts` → 2 passed；新建 bot 对话框所在 spec（施工 `grep -rl "pb-dialog\|New bot" tests/e2e` 取一个）定向跑一次，证明共用外壳规则拆分没误伤
3. 截图（亲眼打开确认内容）：`work/ui-polish-win/evidence/T58/market-{list,search-focus,sources-empty,sources-error,sources-one}-{light,dark}.png`；外壳那张与 `work/ui-polish-win/ref/market-shell-light.1280x800.png` 并排，经理像素复量外壳四边与边色
4. `git diff --stat <起点>..HEAD` 只含边界 1 的三个文件（market.spec :94 一格若改，列为第四个并在回执说明）

## 为什么这样验收
- T57 / T57b 栽过的坑：断言了 CSS 属性值，画面仍不像。这里外壳用「与设置 dialog rect 相等」+ 截图像素复量，输入框用 computed 边色 / 底色对 token，Done 用「rect 不被裁」——都是看得见的结果，不是属性存在。
- 市场行没有原版渲染帧，只能对静态规格数值；所以不写「看起来像」，只断言 RE 里写死的数字（40 / 26 / 12 / 12）。
- 新建对话框共享外壳规则，单独回归一次，防止改市场顺手改坏别的面。

## 产出
- 三个文件的改动；`receipts/T58.receipt.md`（含 CSSR 查 dialog surface 的行号结论）；`work/ui-polish-win/evidence/T58/` 截图
