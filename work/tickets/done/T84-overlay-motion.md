# T84 · 浮层出入场参数对齐（RE-MOTION G2 / §4 拆单建议①，纯 CSS）

- claimed: 2026-11-15 主 agent（GLM 5.3）· 分支 feat/T84
- 验收: 2026-11-15 manager 任务 B @ a7215d25 **不通过**——palette 入场 keyframes 顶替 translate(-50%,-50%) 居中，开场偏右下再跳回 → 修复单主仓 `work/tickets/open/T84b-palette-motion-transform.md`（下方「T84b 提议」改名 T84c）。其余（pb-dialog .92/.18s、菜单、tooltip、reduced、t87 未动）核实通过
- accepted: 2026-11-15 6529263f（manager 任务 B 复验，T84b 并入）——3 spec 5/5 绿（t84 ×2 / t87 / settings ×2）；palette.40ms.{light,dark} 亲看居中（与 end 帧左缘差 ≈3px@DPR2，仅 scale .98 收缩），account-menu.40ms 与 end 同位；新增 getAnimations pause@40ms 中心 ≤8px 断言非空转（skipped 断言 false）
- 来源: work/grok-0.79.3-re/RE-MOTION-0.78.1.md §4（4.1/4.2/4.11）+ queue S5 G2 行
- 1.1.0 基线核查: 动效 143 keyframes 同体（MIGRATION-DELTA §2）；**R2 更正（RE-RAIL-TASKS §4）**：设置对话框 1.1.0 用 `translate(-50%,-50%) scale(.95→1)` spring 内联——scale 族方向一致，按 0.78.1 主档参数落。

## 范围（全 CSS，2 文件）

1. **pb-dialog-in 回 scale 族**（4.1 主档 sand-11nrck8-B）：`.18s cubic-bezier(.22,1,.36,1) backwards`，`opacity 0 scale(.92)→1`。T87 把它改成 wipe 260ms translateX(40px) 是覆盖面过宽（wipe 是视图切换 §3.4 的参数）——本单收窄回 scale（消化 T87b 提议）；t87-view-in（视图切换）不动。
2. **菜单/popover 入场**（4.2 主档 sand-ef87bi-B）：`.ui-menu__content`（FloatingSurface 全菜单面：account menu/More/select/context menu）挂 `.16s cubic-bezier(.16,1,.3,1)` ty-6px scale(.98) backwards。
3. **tooltip**（4.2 sand-hw0koq-B）：`.ui-menu__tooltip` 挂 `.1s cubic-bezier(.23,1,.32,1)` ty-2px。
4. **palette**（4.11）：`.sand-command-palette` 挂 ef87bi 同款（palette 走 menu 位移族）。
5. **reduced**：以上全部 animation:none（pb-dialog 段已有，补菜单/tooltip/palette）。

## 非目标（记 T84b 提议）

- 退场（4.6）：FloatingSurface/dialog 全是卸载式（open=false 即 unmount / dialog close 即 display:none），纯 CSS 不可达——需 JS exit 态 + timeout 卸载，另开单。
- 4.3/4.4/4.5 变体档、4.8 number-roll、4.12 blur stagger——P1 靠后。

## 验收

- e2e `t84-overlay-motion.spec.ts`：pb-dialog animationName/Duration/FillMode + keyframes 帧文本（scale(.92)、无 translateX(40px)）；菜单（Account menu）与 palette animationName=t84-menu-in .16s；reduced 全 none
- 截图/录屏对照 0.78.1（经理验收亲看，DPR2）
