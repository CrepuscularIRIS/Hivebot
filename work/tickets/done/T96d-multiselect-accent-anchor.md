# T96d：多选行底色换 0.78.1 原值（accentSelected），与 active 行区分

> 开单：manager (Opus 5.5) | 日期：2026-11-16 | 施工：main (GLM 5.3)
> 来源：T96c 复验不通过（`open/T96c-selected-row-visual.md` 末「经理复验」）；T96 链第二次不通过，按任务 C 收窄为机械单——锚已由经理取得，不需再查
> 分支 / 作业目录：feat/T96 @ /tmp/bot-wt/T96（接 e3991b8b 续提交）
> claimed：
> accepted：2026-11-16 18f6d4bc（manager 任务 B 第三轮复验，T96 链整体收口：T96+T96b+T96c+T96d）——rebuild 后 t96 3p / 回归 4p；multiselect 亮暗重拍亲看：A/C 蓝调、B 无底、active 灰底三者可分；hover 选中行 50~800ms 采样与静止值完全相同

## 目标
多选行用 0.78.1 原值上色（蓝调），和当前会话（active）行一眼能分开。

## 原版锚（经理已追到，直接用）
- `work/p1-re/evidence/chunks/index.eager-app-iGTgHP_Q.js`：`F6e(o.highlight)` → `{isActive:D, isMultiSelected:O}`；行 props `isSelected:D`（=active，落 `rS.selected` = `sand-kr7fhf` = `--sand-bg-active`）、`"data-selected":O`；多选另挂 `O&&BS.accentSelected`、`O&&IA.multiSelected`
- `work/p5-parity/evidence/078-css-rules-split.txt`：
  - :6043 `.sand-ukxp9i{background-color:color-mix(in srgb,var(--sand-text-accent-primary) 20%,var(--sand-bg-active))}`
  - :7502 `.sand-qc45by:hover{同值}`（hover 不变色）
  - :5236 `.sand-jo3ci6{--sand-avatar-surface-overlay:同值}`
- 多选样式经外层 className 进 `so(…, rS.selected, f)` 的最后一参 → **active 且被多选时，多选色胜出**

## 边界
1. 只动：`overrides/p5-55-layout.css`（替换 T96c 那一条规则）、`tests/e2e/t96-sidebar-selection.spec.ts`
2. 规则要点：`.sand-agent-item[data-selected="true"]` 及其 `:hover` 都取上面的 color-mix，且压过 `:hover` 与 `[data-active="true"]` 的 `!important`（同用 `!important`，写在其后）；`--sand-avatar-surface-overlay` 同值一并设
3. 注释改写：删「未取得原版锚」，写锚点（两个文件:行号）
4. 先写失败测试：t96 第一格追加断言——选中行 computed bg ≠ active 行 bg（现状两者同为 `rgba(28, 28, 28, 0.08)`，经理实测，必红）；再加一条：选中行 hover 后 bg 不变

## 验收
1. `sh scripts/run-e2e.sh t96-sidebar-selection.spec.ts` → 3 passed
2. `sh scripts/run-e2e.sh t77-option-feedback.spec.ts t59-sidebar-collapse.spec.ts grok-hidden-bots.spec.ts` → 4 passed
3. 截图：3 bot 选 A/C（active 为第 4 行），存 `work/ui-quality/evidence/T96/multiselect.{light,dark}.png`（覆盖经理 00:5x 拍的图），回执写确认点：A/C 蓝调底、B 无底、active 行灰底与 A/C 不同
4. 回执：`receipts/T96.receipt.md` 补 **T96c 段 + T96d 段**（T96c 没写回执段），贴原样命令与 `N passed` 尾行

## 为什么这样验收
T96c 断了「选中≠未选」，但用户要分清的是「我选了哪几个」和「我现在在哪个会话」——两者同色时多选等于没用。断言直接卡这一对。

## 产出
- 上述 2 文件 + 截图 + 回执两段

## 经理复验（2026-11-16，第三轮，通过）
- 先 `pnpm build`（产物含 `text-accent-primary) 20%`），再 `PATH=node_modules/.bin:$PATH sh scripts/run-e2e.sh t96-sidebar-selection.spec.ts` → **3 passed**；`… t77-option-feedback t59-sidebar-collapse grok-hidden-bots` → **4 passed**
- 改动：e3991b8b..18f6d4bc 只 `p5-55-layout.css` + t96 spec，符合边界
- 截图重拍 `work/ui-quality/evidence/T96/multiselect.{light,dark}.png`（经理拍，覆盖旧图）亲看：A/C 蓝调底、B 无底、New chat（active）灰底，三者一眼可分。computed：亮 选中 `color(srgb .059 .352 .656 / .263)` / active `rgba(28,28,28,.08)`；暗 选中 `color(srgb .459 .692 .991 / .263)` / active `rgba(245,245,245,.08)`
- **hover 偏差追认，但断言偏弱记档**：经理探针 hover 选中行 50/150/400/800ms 四点采样与静止值**逐字相同**（规则 `!important` 生效，hover 不变色达成）。回执说的「0.19↔0.26 波动」未复现。断言 `bgHover ≠ bgUnsel`（未选行静止=透明）其实挡不住「退回灰 hover 底 0.06」——行为已由经理实测确认，不为此返修；加固（改 `toBe(bgSel)`）记 queue 提议
