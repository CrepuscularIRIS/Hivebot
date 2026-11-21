# T77bb：T77b 收尾——删死副本、4 菜单补证、3 面 hover

> 开单：manager (Opus 5.5) | 日期：2026-11-16 | 施工：main (GLM 5.3)
> 来源：T77b 验收不通过（`open/T77b-menu-hover-rest.md` 末「经理验收」）
> 分支 / 作业目录：feat/T77b @ /tmp/bot-wt/T77b（接 1f6fe4e3 续提交）
> claimed：
> accepted：2026-11-16 591d5f89（manager 任务 B 第三轮复验，T77b 链整体收口：T77b+T77bb+T77bc）——rebuild 后 t77b 3p / 回归 12p / overrides 守卫 3p；diff 8da09c04..HEAD 只 4 文件；palette-row.hover 亮暗重拍亲看：被指第 2 行=aria-selected+原版选中底（亮 rgba(28,28,28,.10)=idle 首行同值）

## 目标
T77b 留下的副本每个都有用、都有测试；工单验收②的 3 面 hover 补上。

## 动手前先读
1. `open/T77b-menu-hover-rest.md` 原验收 + 末段经理意见
2. 入口条件：channels 面要 `account.kind==="logged-in"` 且非群（ProductionRenderer.tsx:1319/3623）；group-members 要 isGroup（:3602）；schedule-editor 在 routines info pane；plugins-browser 在 plugins desktop-surface

## 边界
1. 只动：`overrides/modules/{message-actions,channels-view,group-members-view,schedule-editor,plugins-browser}.tsx`、`overrides/vite.config.ts`、`tests/unit/grok-shim/overrides.test.ts`、`overrides/p5-55-layout.css`、`tests/e2e/t77b-menu-hover.spec.ts`
2. **删 `message-actions.tsx` 副本**，连同 MODULE_OVERRIDES 映射、WHOLE_REPLACEMENTS/COPIES 两处登记
3. 其余 4 个：产品里能打开的 → spec 加一格（打开菜单，断 `.ui-menu__content` 存在、项含 `ui-menu__row`、不含 `sand-kit-button`；schedule/plugins 的项若没挂 row 类，要么补上要么回执说明原因）。**产品里打不开的 → 删副本+映射+登记**，回执写打不开的证据（哪个门控条件不满足）。不留没测试的整复制
4. hover 3 面（Connect apps / 市场行 / 命令面板行）：每面一格，**非选中**元素 hover 前后 computed backgroundColor 不同 + transitionDuration 含 `0.12s`；已经满足的只加断言不改 CSS
5. 先写失败测试：新格先跑红（或回执贴出「首次即绿」的原因——说明是哪条已有规则满足）

## 验收
1. `sh scripts/run-e2e.sh t77b-menu-hover.spec.ts` → 全 passed（格数 = 2 + 留下的菜单数 + 3）
2. `sh scripts/run-e2e.sh t77-option-feedback.spec.ts t84-overlay-motion.spec.ts t91-reaction.spec.ts bots.spec.ts` → passed
3. `node_modules/.bin/vitest run tests/unit/grok-shim/overrides.test.ts` → passed
4. 留下的副本 `diff <上游> <副本>` 只有：来源头、相对 import 改全路径、className 增补（同一元素不得出现两个 className）——回执贴每个副本的 diff 行数
5. 截图亮暗：每个留下的菜单打开态 + 3 面 hover，存 `work/ui-quality/evidence/T77b/`，回执逐张写确认点

## 为什么这样验收
整复制的代价是以后跟上游要手动同步；只有真被用户看到、又有测试盯着的副本才值这个代价。

## 产出
- 上述文件；回执追加到 `receipts/T77b.receipt.md` 的 T77bb 段

## 经理复验（2026-11-16 · 任务 B 续 · feat/T77b @ 674d09b2+0995ad74+8da09c04）→ **不通过，写 open/T77bc**

重跑：t77b 3 passed；回归 t77/t84/t91/bots(+hidden) 12 passed；overrides.test 3 passed。

1. **四副本删除：全部同意。** 独立核：
   - channels：回执的理由不对——shim `desktop.ts:94` 恒 `kind:'logged-in'`，controller 生产里不为 null；真因是 P5-52 `overrides/modules/chat-header.tsx` 剥掉会话头 trailing（=Channels 按钮），palette 也滤掉 `info:channels`，`grok-dead-entries.spec.ts:142` 断 Channels 钮 count=0。生产与测试环境一样没有入口，channels RPC 在 coordinator 也无 handler。**删副本后生产不会走到上游原版**，没有取舍问题
   - plugins-browser：只被 `desktop-surface.tsx`（已映射到 market-surface，不 import browser）和 `dev/DevShell.tsx` 引用——生产不可达
   - group-members：`dead-entries.css:27` 注明产品无群聊；schedule-editor：同处注明无 automations，Routines tab 被屏蔽——都不可达
2. **palette hover 规则与原版冲突**（复验点④）：原版 `CommandPalette.tsx:374` `onMouseMove→setHighlight`，被指行即 `aria-selected` 行，底 `production.css:322` `--cursor-bg-secondary`。新规则 `.sand-command-palette [role=option]:hover` (0,3,0) 压过它：经理实测 idle 选中行 `rgba(28,28,28,0.10)`，鼠标指上去变 `0.06`——选中态反而变浅。T77bb 那格之所以绿，是 hover 了默认选中的第 1 行、靠这条冲突规则变色；且包在 `if (count>0)` 里，可能零断言通过；`check` 函数定义了没用，标题写的 Connect apps / 市场行一格都没测。
3. **Connect apps 那两行 CSS 是死的**：`p5-55-layout.css:99-105` 对该按钮 `background …!important` + `.3s !important`，经理实测 hover 前后 `rgb(31,31,31) 0.3s` 不变。另外原单要求的 `.12s` 和 P5-55 定的 `.3s` 本身矛盾——是经理开单时没查锚，移出本链进 T79。
4. 截图：补拍 `evidence/T77b/palette-row.hover.{light,dark}.png`（hover 第 2 行，选中底跟随，亲看正常）。回执无原样命令输出、无逐张确认点。
5. 本链第二次不通过 → 按 C 收窄：T77bc 只删两组 CSS + 改一格断言 + 三处清理；市场行 / Connect apps hover 进 T79。
