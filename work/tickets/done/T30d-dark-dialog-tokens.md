# T30d：暗色对话框三处 token——Create 主按钮、分隔线、形状选中贴纸边

> 开单：manager (Opus 5.5) | 日期：2026-11-07 | 施工：main (GLM 5.3)
> 来源：T30c 终验（feat/T30 HEAD 53928cf2）。T30 已经第三轮，按任务 C 把暗色这几项拆出来单做，不再挡 T30 合并
> 分支 / 作业目录：feat/T30d @ /tmp/bot-wt/T30d，起点是 T30 合并后的 docs 分支
> claimed：2026-11-07 main (GLM 5.3) @ feat/T30d
> accepted：2026-11-07 feat/T30d @d8d2ea0c（连同 T30db）｜历史：（2026-11-07 终验 @0a47fb46 不通过：分隔线 ✓；贴纸外环被 viewBox 裁断——描边 57 伸出 28.5 > 留边 15，是本单引入的回归；暗色 Create 底色 205、文字发灰，ref 是 245/18 → 返修单 `open/T30db-sticker-clip-create-wash.md`）
> 失败计数：1

## 目标
暗色下的新建对话框要和 `ref/create-dialog.dark-named.png` 对上：Create 可用时是白底黑字的 pill，头部和底栏有分隔线，选中的形状有能看见的贴纸边。

## 现状证据（经理在 53928cf2 上用 PBOTS_SHOT 自己重拍，和施工 15:59 那批图逐字节相同）
1. **Create 可用时还是白字配浅灰底**。T30c 加的规则 `[data-theme="cursor-dark"] .pb-dialog__actions [data-action="create-bot"]:not([disabled])` 没生效。可能是 SandButton 把 `data-action` 或 disabled 落在了别的元素上，也可能是上游样式优先级更高。施工回执说根因是「SandButton primary 暗色 token」。如果真是这样，问题就不只在对话框里，**全局所有 primary 按钮都受影响**，那应该修 token，不要在对话框里打补丁。先用 `getComputedStyle` 查清楚再动手。
2. **分隔线看不见**：在暗色 named 图上，头部线（y 50–57）和底栏线（y 540–547）沿竖直方向逐点取像素，全是 (31,31,31)，没有任何线。说明 `--cursor-line` 在暗色里没定义，回落到的 `--sand-border` 也和底色一样。
3. **选中形状的贴纸边看不见**：暗色下完全看不见；亮色下只有约 1px 的浅环，ref 是约 3px 表面色边加约 1px 灰线。现在灰 23、表面 19 是 viewBox 单位（259 对应 36px），灰线露出来的只有 (23−19)/2 × 36/259 ≈ 0.28px。按像素反算：表面色约 3px，也就是每侧约 22 单位、描边宽约 43；灰线再往外约 1px，描边宽约 57。

## 边界
只动：`overrides/p5-57.css`、`new-bot-dialog.tsx` 的 `ShapeGlyph`。如果第 1 条查明是全局 token 的问题，回执写明，**停下来问经理**再决定改哪里，不要自己扩大改动范围。

## 验收
1. 前置 build，退出码 0。跑 `PBOTS_SHOT=1 test:e2e tests/e2e/shot-create-dialog.spec.ts`，图写在 `work/grok-0.79.3-re/ours/`。
2. 从 dark-named 图取像素贴进回执：
   - Create 按钮中心是浅底，文字是深色
   - 头部、底栏各有一行像素和底色差 ≥8
   - 选中形状外缘有能看见的环
3. 亮色贴纸边对照 ref light-named：约 3px 边加约 1px 灰线。
4. 回归：`test:e2e tests/e2e/create-dialog-0793.spec.ts tests/e2e/create-dialog-character.spec.ts` → 7 + 5 passed；`check` → diff=0。

## 为什么这样验收
T30 三轮回执里都写过「✓」，实物却没对上。所以这次用像素数值作证据，不用文字判断。
