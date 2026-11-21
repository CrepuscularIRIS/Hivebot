# T58b：T58 返修——Done 标签下沉（T51 原毛病仍在）+ 空/一条两态用无 env 源路径补齐

> 开单：manager (Opus 5.5) | 日期：2026-11-12 | 施工：main (GLM 5.3)
> 来源：T58 任务 B 验收（`receipts/T58-66-67.acceptance.md`）；父单 `doing/T58-market-overlay-align.md`
> 分支 / 作业目录：feat/T58 @ /tmp/bot-wt/T58（接 143df565 继续提交）
> claimed：0b578f36（字心根因修复+真三态+requestSubmit 三轮稳 2p；market 回归 3p；亲检居中——doing 待批审）
> accepted：2026-11-12 manager 复验通过 @0b9a2d58（经 T58c 返修闭合；见 receipts/T58c-T68b.acceptance.md）

## 目标
1. **Done 标签下沉 4px**：T58 证据图 `work/ui-polish-win/evidence/T58/sources-error-light.png` 像素量（CSS px）：Done 药丸 y 386–412（可见高 ≈27），「Done」字形 y 399–407，字心比药丸中心低 ≈4px；同图 Add 钮药丸 274–296、字形 280–289，居中。T51 原图 `t51-manage-light.png` 同一症状——这正是工单目标里的「Done 底部被裁」，T58 没修掉。现有 `doneIntact`（与滚动容器比边界 + rect 高 = computed 高）看不见这种「钮内标签溢出 / 钮被压矮」。
2. **三态前提不成立**：回执返修段 3 说空态 / 一条态「构造不出、SDK setIndexes 在 env 源下无效」。经理核实：`P2SDK_MARKET_SOURCE_INDEXES` 由 `app/sdk/profile/patches/market-source.yml` 以 `!!js` 在每次加载时把 `indexes` 整行写死，作为 `--patch` 叠在界面写入的 `profiles/web/cordis.patch.yml` 之上——**env 源钉死是配置层设计如此，不是 SDK 缺陷**；market.spec :286-360（T51）走的是**不设 env 源**的生产缺省路径，在那条路径上 add / remove 正常（:350 删源回空态通过）。所以两者不矛盾，三态完全构造得出。

## 口径
- 先找根因再修：在 DPR2 下读 Done 的 `height / min-height / padding-block / line-height / box-sizing`、其内层 label 元素的 rect、`.pb-market__footbar` 与 `.pb-market__sources` 的 rect 和 flex 属性（column flex 子项被 shrink、或某条 height 规则压矮都可能）。回执贴读数，再改 CSS。
- 只改市场专用选择器（`.pb-market__*`），不动全局 kit 按钮、不动新建对话框。

## 边界
1. 只动：`overrides/p5-57.css` 市场 sources 段、`tests/e2e/t58-market-layout.spec.ts`。超出就停写存疑。
2. 先写失败测试：下面验收 1 的「标签居中」格先在 143df565 上跑红。

## 验收
（`cd /tmp/bot-wt/T58/app/ui && pnpm build`；e2e `CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh <spec>`）
1. `… t58-market-layout.spec.ts` → passed，新增：
   - `doneIntact` 加两格：Done 内文字（label 元素或 Range 取文字 rect）中心 y 与 Done rect 中心 y 差 ≤1；Done rect 高 ≥ 其 `min-height`/kit md 规定高（施工读出 md 规定值写进断言注释）。
   - **空态 / 一条态**：另起一段走 market.spec :289 的生产缺省启动（不设 `P2SDK_MARKET_SOURCE_INDEXES`，独立 HOME）：进 Index sources → 空态 `doneIntact('空')` + 截 `sources-empty-light.png` → 加一条 `server.realUrl` → `[data-index-item]` 计数 = 1 → `doneIntact('一条')` + 截 `sources-one-light.png` → 非法 URL / 重复 → `doneIntact('空态错误')`。原 env 段保留两源 + 错误态，删除「Remove 后 20s 行为记录」循环（前提已推翻），截图改名为 `sources-two-light.png`，不再冒名 empty / one。
2. 回归：`… market.spec.ts` → 3 passed。
3. 截图：Read 亲看 `sources-{empty,one,error}-light.png` 的 Done，回执贴 Done 药丸上下沿与字形上下沿的像素行号（同本单目标 1 的量法），字心偏差 ≤1。
4. `git diff --stat 143df565..HEAD` 只含边界 1 两文件。

## 为什么这样验收
- 用户看到的毛病是「Done 字往下掉、像被切了底」；只比外框不比字，等于没验。字心对钮心是看得见的结果。
- 三态里「空」正是 T51 出毛病的那一态；用错启动方式绕开它，等于没覆盖原缺陷场景。
