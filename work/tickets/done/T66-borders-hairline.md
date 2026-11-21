# T66：主界面结构线 hairline 化——侧栏右缘 / info pane 左缘 / 设置 nav 分隔 / 浮层菜单描边对齐 0.78.1

> 开单：manager (Opus 5.5) | 日期：2026-11-11 | 施工：main (GLM 5.3)
> 来源：`work/ui-borders-connect/BRIEF.md`（用户 2026-11-11「这个UI的边框等等, 和原版的Grok Bot还是不太一样」）；规格 `work/grok-0.79.3-re/RE-BORDERS-0.78.1.md` §0 / §2.2 / §2.6 / §5
> 分支 / 作业目录：feat/T66 @ /tmp/bot-wt/T66（从当前集成分支开）
> claimed：7e0b2d07（侧栏 .5px 三重铁证翻案+nav tertiary+palette r16 全绿 1p；变异红；回归 5p；E5 期望修正待追认——doing 待批审）
> accepted：2026-11-12 manager(Opus 5.5) @7e0b2d07（集成 HEAD 86f238c7）——spec 2p 重跑绿；Sol NOTE palette r16 追认（CSS p5-55-layout.css:303 在、!important）；E5 期望修正追认（0.78.1 类串铁证，Sol 独立抽验）；见 receipts/T58-66-67.acceptance.md

## 目标
主界面所有「结构线」（面与面之间的分隔线、浮层外描边）用 0.78.1 的 **.5px + translucent token** 体系；今天侧栏右缘、info pane 左缘还是 1px，设置 nav 分隔线用错档（secondary，原版 tertiary），浮层菜单描边未核对。

## 经理先做的核对（REA §5 差异表有一半已过时，别照表全改）
REA §5 的「我方值」取自 recovered `view.css`，但运行时被 `overrides/p5-55-layout.css`（!important 层）盖掉了大半。经理逐行对过 p5-55-layout.css，**真实差异**只剩：

| 面 | 现值（锚点） | 0.78.1 | 本单动作 |
|---|---|---|---|
| 侧栏右缘 | `1px solid --sand-border-tertiary-translucent`（p5-55-layout.css:16） | **.5px** 同 token | 改 |
| info pane 左缘 | `1px solid tertiary`（p5-55-layout.css:311） | REA 未单列；§0「主界面结构线几乎全部 .5px」 | 第 0 步查锚，有锚才改 |
| 设置 nav 右分隔 | `.5px secondary`（settings-view-t57.css:27） | **tertiary**（RE-BORDERS §0.4 修正 RE-UI-LAYOUT §1.2；`sand-h1nr2e`） | 改 |
| 浮层菜单 / tooltip / popover | 未核对 | 菜单 `.5px solid secondary` + r16 + bg-elevated；tooltip `.5px secondary` 环；popover surface `inset 0 0 0 .5px tertiary`（§2.6） | 第 0 步实测，差的改 |

**已对、只加断言锁住、不改**：侧栏头部 / chat 顶栏无底边线（p5-55-layout.css:27 / :149 `border-bottom:0`）；侧栏底色 `--sand-bg-sidebar`（亮 #f5f5f5 / 暗 #0e0e0e，:15）；暗色 `--sand-shadow-*` 全 0 alpha（p5-55-palette.css:691 起）。
**不是差异、不改**：侧栏头部 icon 圆钮、footer「Connect apps」药丸、chat header 身份药丸的 1px tertiary——这是原版「elevated 变体」1px（RE-BORDERS §2.2 / §2.7），P5-55 实测过。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md 末条（view.css:46 特异性 + **DPR=1 下 .5px 读回 1px**）
2. RE-BORDERS-0.78.1.md §1（token 表）/ §2.2 / §2.6；`work/grok-0.79.3-re/ref/border-rules-0.78.1.txt`（907 条全表，按类名查）
3. `app/ui/renderer-grok/overrides/p5-55-layout.css`、`modules/settings-view-t57.css`
4. T57 的 spec `app/ui/tests/e2e/t57-settings-layout.spec.ts`（:108-112 nav / 外壳 .5px 那几格的写法与 DPR 注释）

## 第 0 步（只读探针，结果贴回执）
1. info pane：在 border-rules 表里查 info / details pane 容器的左缘规则（类名经 RE-UI-LAYOUT §C1 或 chunk 名反查）。查到 `.5px` → 本单改；查不到 → 不改，回执写「无锚，保持 1px」。
2. 浮层：起 app（DPR=2，见验收），逐个打开并 `getComputedStyle` 记下 border / border-radius / box-shadow / background：agent 行「…」菜单、composer「+」菜单（若有）、命令面板、侧栏折叠钮 tooltip、任何 role=menu / role=tooltip 的面。与上表 §2.6 值对，只修不一致项。某个面的描边写在 TSX inline style 里、CSS 压不住 → 不改 TSX，回执存疑项列出。

## 边界
1. 只动：`overrides/p5-55-layout.css`（侧栏 / info pane 两行 + 文件末新增「D · 浮层描边（T66）」一节）、`modules/settings-view-t57.css:27` 一处、新 `app/ui/tests/e2e/t66-hairlines.spec.ts`、`t57-settings-layout.spec.ts`（经理核过：它只读 nav `borderRightWidth`、不断言颜色，预计不用改；若改了要在回执贴前后并说明）。**不碰** `p5-57.css`（市场 / 新建对话框外壳归 T58）、composer（T67）、气泡与 view.css 硬编码色（T68）。
2. 先写失败测试：`t66-hairlines.spec.ts` 的侧栏右缘格先跑红（现 1px）。
3. 色值走 token；断言比「token 求值后的 rgba」与 computed 值，不写死十六进制。
4. 测试走隔离 HOME / TMPDIR，DBus 指不存在路径；不跑全量 e2e。

## 验收（写命令，不写感觉）
（先 `cd /tmp/bot-wt/T66/app/ui && pnpm build`；e2e 一律 `CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh <spec>`，看 `grep -E "passed|failed"` + `echo EXIT=$?`）
1. `… run-e2e.sh tests/e2e/t66-hairlines.spec.ts` → passed。spec 用 `launchShell({ extraArgs: ['--force-device-scale-factor=2'] })`，**第一格断言 `window.devicePixelRatio === 2`**（否则 .5 与 1 分不开，整单作废）；亮暗各一遍：
   - 侧栏 `.sand-agents-sidebar` `borderRightWidth === '0.5px'`、色 = tertiary token 求值；`backgroundColor` = `--sand-bg-sidebar` 求值（亮 rgb(245,245,245) / 暗 rgb(14,14,14)）
   - `.sand-agents-sidebar__header` 与 `.sand-chat-header` 的 `borderBottomWidth === '0px'`
   - info pane（打开后）左缘：按第 0 步结论断言 0.5px 或 1px
   - 设置 nav 右分隔：`0.5px` + tertiary token
   - 第 0 步列出的每个浮层面：border 宽 / 色 / radius / box-shadow 按 §2.6 值
   - 暗色：`--sand-shadow-card/popover-ambient/popover-key/modal-ambient` 四个 token 求值 alpha 全为 0
   - 变异：把 p5-55-layout.css:16 改回 1px 重建重跑 → 侧栏格红（cp 备份→改→跑→cp 还原→cmp，本体先提交，LEARNINGS 变异刀规矩）
2. 回归：`… run-e2e.sh tests/e2e/t57-settings-layout.spec.ts tests/e2e/t59-sidebar-collapse.spec.ts tests/e2e/theme-dual.spec.ts` → 全 passed
3. 截图（Read 亲眼看）：`work/ui-borders-connect/evidence/T66/{main,info-pane,menu}-{light,dark}@2x.png`；`main-*` 与 `work/p5-parity/evidence/P5-55/compare/pairs/conv-rest.{light,dark}.png` 并排，回执写侧栏右缘线在两图的像素宽与灰度（截图同为 DPR2）
4. `git diff --stat <起点>..HEAD` 只含边界 1 的文件

## 为什么这样验收
- 用户说的是「看起来不一样」。.5px vs 1px 在 DPR=1 下 computed 都读 1px（LEARNINGS 末条），T57 只能按 ±1 收——那样根本分不出这单要修的东西。所以强制 DPR=2 并把「DPR 真是 2」当第一格，否则所有宽度断言都是空转。
- 已对的项（无底线、侧栏底色、暗阴影清零）加断言锁住，防后续单回退；不对已对的东西动刀。
- 浮层面先实测再改，避免照静态表把本来对的改错。

## 产出
- 边界 1 的改动；`receipts/T66.receipt.md`（第 0 步两项结论 + 浮层实测表）；`work/ui-borders-connect/evidence/T66/` 截图
