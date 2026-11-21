# T87：overlay 浮层 wipe 进场（G3）——经理补单

> 开单：manager (Opus 5.5) | 2026-11-15（施工先行，补单）| 施工：main (GLM 5.3)
> 来源：done/T82-audit-motion-behavior.md 尾部 S5 / RE-MOTION-0.78.1.md §3.4（±40px .26s cubic-bezier(.22,1,.36,1)）
> 分支：feat/T87 @ /tmp/bot-wt/T87
> claimed：2d665e2a
> accepted：2026-11-15 eaa97fc7

## 目标
设置面板、市场浮层进场用 0.78.1 §3.4 wipe 参数；reduced 纯 opacity。router 层双帧 wipe 不在本单。

## 边界
只动 renderer-grok/overrides/p5-55-layout.css、p5-57.css、tests/e2e/t87-view-wipe.spec.ts。

## 验收
1. `run-e2e.sh tests/e2e/t87-view-wipe.spec.ts` → 1 passed（设置 t87-view-in / 0.26s / cb(.22,1,.36,1)；市场 pb-dialog-in；reduced 降级）
2. 回归 t75-font-stack + t81-panel-hotkeys → 2 passed；`pnpm check` differs=14（基线）

## 为什么这样验收
读计算样式确认动画真挂到真元素上（不是只断言 keyframes 存在）。

## 经理验收（2026-11-15，HEAD eaa97fc7）——通过
- 重跑 t87 + t75 → 2 passed (12.7s)；t81-panel-hotkeys → 1 passed (4.2s)。共 3p，对上回执。check 14 未重跑（frontend/ 零改动）。
- 改动范围三文件，符合边界。
- pb-dialog-in 升级：认可，但 `dialog.pb-dialog` 不止市场，还覆盖 new-bot-dialog.tsx:144 与 settings-panels.tsx:38 清连接确认框——确认类模态现在也横向滑入。原版模态是否同用 §3.4 未取证 → queue 提议，不挡。
- t69-connect-picks.spec.ts:104 等 400ms 仍覆盖 260ms，无冲突。
- router 双帧 wipe 记档：认可，进 queue 计划，不在本单。
