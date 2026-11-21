# T84b · T84 返修：palette 入场动画覆盖 translate(-50%,-50%) 居中，开场 160ms 偏到右下再跳回

- 来源: manager 任务 B 验收 T84（2026-11-15）@ feat/T84 a7215d25，不通过
- accepted: 2026-11-15 6529263f（manager 任务 B 复验通过，随 T84 合并）——改动只在 p5-55-layout.css T84 段 keyframes + t84 spec 一格；e2e 5/5 绿；40ms 帧截图居中
- 分支: 在 feat/T84 上续提（worktree /tmp/bot-wt/T84），合并时随 T84 一起
- 编号说明: T84 工单「非目标」里预留给退场（4.6）的 T84b 提议改名为 **T84c**（queue 已同步）

## 问题（经理截图实锤）

`production.css:261` 的 `.sand-command-palette` 靠 `left:50%; top:50%; transform: translate(-50%,-50%)` 居中。T84 给它挂了 `t84-menu-in`，keyframes 写的是 `transform: translateY(-6px) scale(.98) → none`。动画进行时 keyframes 的 transform 整个顶替掉居中用的 translate，结果是 palette 左上角落在窗口中心，偏到右下角，160ms 结束后再跳回居中。
- 证据: `work/ui-quality/evidence/T84/palette.40ms.light.png`（偏到右下）对 `palette.end.*.png`（居中）
- 现有 spec 只断言 animationName / Duration，看不到位置，所以没抓住

其他挂点（`.ui-menu__content` / `.ui-menu__tooltip` / `dialog.pb-dialog`）用 left/top 或 margin:auto 定位，没有 transform 冲突，已逐条查过。

## 修法（推荐，最短）

把 `t84-menu-in` / `t84-tooltip-in` 的 keyframes 改用独立属性 `translate:` / `scale:`（例如 `from { opacity:0; translate: 0 -6px; scale: .98 }`）。独立属性与元素自身的 `transform` 叠加生效，不会互相顶替，菜单 / tooltip / palette 三处一次修好。只动 `overrides/p5-55-layout.css` 的 T84 段。

## 验收

1. **先红**: t84-overlay-motion.spec.ts 加一格。打开 palette 后用 `document.getAnimations()` 找 t84-menu-in，pause 并设 `currentTime=40`，量 `.sand-command-palette` 的 getBoundingClientRect 中心，要求距视口中心 ≤8px（容许 ty-6 / scale .98 的偏差）。在 a7215d25 上先跑，确认红。
2. 修后 `sh scripts/run-e2e.sh t84-overlay-motion.spec.ts t87-view-wipe.spec.ts settings.spec.ts` 全绿。
3. 重拍 `palette.40ms.{light,dark}.png`（DPR2，方法同经理探针 `/tmp/bot-mgr-acc/t84/shots.probe.spec.ts`），确认 40ms 帧居中。

为什么这样验收：要保住的是「入场过程不跳位」。只断言动画名，和这次一样看不到位置。

## 非目标

- 手写 role=menu 的 6 处（message-actions More / group-members Add Member / plugins Filter / schedule-editor Trigger source / channels Connection actions / computer More screens）没有走 FloatingSurface，所以吃不到 `.ui-menu__content` 动画。这些面一直没有入场动画，不是 T84 引入的回归，记 queue 提议，等 T77 换原语时一并处理。
