# T97a · palette 校准（0.78.1 求值器两处 bug）· 验收记录

- 施工: 2026-11-15 主 agent（GLM 5.3）· 主仓直接提交 0b32b9b0（机械小改，无独立工单文件；范围见 queue M1 行 + 回执）
- accepted: 2026-11-15 manager 任务 B @ 93ea297e（含 0b32b9b0）
- 回执 `receipts/T97a.receipt.md`；审查 `reviews/T97a-T98.review.md`（Sol 0 问题）

## 经理复跑

1. 独立比对（自写脚本，按 `html[data-theme="cursor-{light,dark}"]` 段抽 `--x: v` 求差，palette vs `work/p1-re/evidence/theme-tokens-110.css`）：
   - 0b32b9b0：light/dark 各 361 token **neq 0 / missing 0**（palette 另多 43 个 tok 文件外 token，不在比对范围）
   - 0b32b9b0^：各 neq 1（bright-black）+ missing 6（danger/success/warn × fill-pressed/foreground-hover）→ 恰为本单 2+12
2. diff tsv 的 changed 只 2 行（亮 `#575757→#1c1c1cbd`、暗 `#f8f8f8→#f5f5f5bd`），与提交逐字一致；added 12 行与 12 条补值一致
3. 改动面：只 `app/ui/renderer-grok/overrides/p5-55-palette.css`（+14/−2）

## 决策点复核：chrome 层「不适用」——同意结论，更正理由

回执理由「chrome 消费 0.18 上游自带值、不消费 index css」不准确：palette 本身含 351 条 chrome-static（来自 0.78.1 index css）。
经理核对 `work/grok-1.1.0-re/harness/out/tokens.tsv` 111 changed：与 palette 定义交集 41 条，其中 38 条（accent/base/terminal-ansi-* 等）
只在 `[data-theme]` 段定义、覆盖 :root 默认值，且已与 1.1.0 sand 求值 0 差；余 3 条在 `html:root`：`--ui-popup-box-shadow`、
`--conversation-font-size`、`--conversation-line-height`——1.1.0 只是改成多值/间接引用（新增 `--conversation-chrome-*`），计算值看不出变化。
故结论「不适用」成立；这 3 条记为 queue 提议（观感对照时顺带看），不开单。
