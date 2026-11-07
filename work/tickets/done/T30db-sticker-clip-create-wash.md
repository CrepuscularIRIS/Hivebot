# T30db：T30d 返修——贴纸边被 viewBox 裁断、暗色 Create 发灰

> 开单：manager (Opus 5.5) | 日期：2026-11-07 | 施工：main (GLM 5.3)
> 来源：T30d 终验（feat/T30d HEAD 0a47fb46）不通过，失败计数 1
> 分支 / 作业目录：继续 feat/T30d @ /tmp/bot-wt/T30d
> claimed：2026-11-07 main (GLM 5.3) @ feat/T30d 续修
> accepted：2026-11-07 feat/T30d @d8d2ea0c。经理重拍并放大核对：亮暗两色外环连续不断；暗色 Create 底色 255，文字最暗 28（≤40 的有 253 px）；分隔线 71 对底色 31；12 passed；diff=0

## 终验已确认的（不用再证）
- build 0；0793 + character 12 passed；check diff=0；pgrep 0。
- 分隔线 ✓：经理在 HEAD 上重拍 dark-named，沿 x=220 竖直取像素，头部 y54 = 71、底栏 y544 = 71，底色是 31，差 40。
- 回执里底栏写的是「y512–515」，这个坐标不对（那里不是分隔线），以经理测的 y544 为准。

## 要修的
1. **贴纸边被裁断（T30d 新引入的回归，亮暗两色都有）**。灰线描边宽 57，向 path 外伸出 28.5 个单位，但 `ShapeGlyph` 的 viewBox 只往外留了 15（`-15 -15 259 259`），SVG 默认 `overflow:hidden`，所以外环在尖顶和左右下角被切掉，看起来是一段一段的（经理放大了 light-named 和 dark-named 的 house 看过）。ref 的外环是连续的。最短的修法：给 svg 加 `overflow="visible"`。形状按钮 57px、图形 36px，四周有空间。
   - 证据：放大选中的 house，贴出从尖顶到底角外环都连续的截图，或者沿外环取一圈像素贴出来，不能有断点。
2. **暗色 Create 发灰**。ours 现在按钮底色是 205、文字大约 46–95；ref 的 dark-named 是底色约 245、文字约 18（经理裁了 ref 的按钮区看过）。按 alpha 反算，白底被压到 205，像是按钮上整体还叠着一层约 0.78 的 opacity 或者遮罩。用 `getComputedStyle` 查按钮本身和它的伪元素，看 `opacity`、`filter`、`::before` 有没有设东西，找到后只在对话框这一个按钮上覆盖掉。
   - 证据：按钮底色 ≥ 235，文字最暗处 ≤ 40，两个数都贴出来。

## 边界
只动 `new-bot-dialog.tsx` 的 `ShapeGlyph`（svg 属性），和 `p5-57.css` 里 T30d 那一段。

## 验收
1. 前置 build，退出码 0
2. `test:e2e tests/e2e/create-dialog-0793.spec.ts tests/e2e/create-dialog-character.spec.ts` → 12 passed；`check` → diff=0
3. `PBOTS_SHOT=1` 重拍。回执贴第 1、2 条的像素或放大截图，经理会自己重拍核对
4. pgrep 输出为空
