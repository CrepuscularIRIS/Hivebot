# BRIEF：Workers/编排 UI 打磨 + bug 修（2026-11-08 05:3x）

## 用户原话
> 然后这个呼唤的T34, 能否名称, 还有字体UI上稍微打磨一下, 目前bug还是很多的.

（T34 编排开闸后用户在产品里实测 worker 相关 UI——Workers 分组、worker 名称、回报卡、任务卡等）

## 拆解
1. **名称**：worker 命名/显示（T34 Probe 这类自动名 vs 用户可读名；侧栏行/回报卡里的名字呈现）
2. **字体/UI 打磨**：Workers 分组与回报卡（P6-16 transcript 卡）的版式、字号、间距——对照 0.79.3 原版（原版有 Workers 分组与「Creating 名字」一行呈现——立项经理探针提过）
3. **bug 清单**：待用户列出具体遇到的问题（已请用户补充）

## 参照
- work/grok-0.79.3-re/ref/（原版截图）
- repos/grok-bot-0.18-reconstructed/（Workers UI 源码参考）
- app/ui 的 p6-workers spec（现有断言）+ shim data.ts Workers 分组（:180-206）
