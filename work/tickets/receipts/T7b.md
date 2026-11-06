
## §7 T7bb 视觉返修（2026-11-06 11:0x）

终验发现三张破版 → 全修：
1. 暗色 Pick 按钮白底白字 → `variant=\"secondary\"` + CSS `color: inherit !important`。
2. 对话框无样式（文字粘连、原生×）→ `overrides/t7b.css` 全套 + 内衬容器（遮罩点击关闭）。
3. pick 截图截的是未勾选态 → shot spec 先 check 再截、截后 uncheck。
4. pbots-ui.ts 死 type re-export 删。
修后：skills-picker 2 passed、t7b-shot 1 passed、上游 diff=0、四张新截图已归档 ref/。
