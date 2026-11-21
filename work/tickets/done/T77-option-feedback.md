# T77 · 选项反馈（ui-quality U4：菜单项原语 + hover 族）

- 来源: work/ui-quality/PLAN.md C 行（经理 2026-11-12 立项）+ T84 验收经理提议（6 处手写 menu 随本单换原语）
- 状态: **done（部分范围）**——侧栏右键菜单原语 + 侧栏行 hover 过渡通过；未交付部分拆 `open/T77b-menu-hover-rest.md`
- accepted: 2026-11-15 feat/T77 @ 48188182（经理任务 B；范围收窄追认见文末）

## 范围

1. **菜单项换原语**：侧栏右键菜单（`production/AgentRowActions.tsx` 5 处 role=menuitem）现是 `SandButton variant=secondary` 灰底药丸居中——换原版左对齐透明行+hover 底。同一换乘顺带 T84 提议的 6 处手写 role=menu（message-actions More / group-members Add Member / plugins Filter / schedule-editor Trigger source / channels Connection actions / computer More screens）→ 走 FloatingSurface（`SandMenuContent`/`SandMenuItem`——吃 T84 入场动画）或按原版 menu-item 原语
2. **hover 族补齐**（probes.json hover.list：侧栏 bot 行、Connect apps、设置左导航、市场行、命令面板 tabs/行）：原版 hover = `background-color,color .12s ease-out`（RE-UI-LAYOUT §1.2 CSSR L7298/7399 navItem 类）；底色 token：primary-hover `#363636`(d)/`#dbdbdb`(l)（L7519 sand-5b9xvv）、secondary-hover 10%/8%（L7522 sand-19jy9ex）——全部用 palette token 不写字面量
3. reduced/键盘 focus 态与 hover 同步

## 锚（RE-UI-LAYOUT）

- §1.2 L44 hover/transition 行；L96 hover 叠层行；L122-125 neutralPrimary/Secondary hover 表（token+值+CSSR 行号）
- 0.78.1 menu-item 原语形态（左对齐透明行）：RE-UI-FACES §4 hover 条/More 菜单

## 验收

- e2e：菜单项 hover 前后 computed background-color 变化 + transition-duration .12s + 文字左对齐（text-align/justify-content）；6 处菜单全部走 FloatingSurface（.ui-menu__content 存在）
- 截图 DPR2 亮暗：侧栏右键菜单、设置导航 hover、市场行 hover——对照 `work/grok-0.79.3-re/ref/` 与 0.78.1 探针值
- 回归：t84（菜单入场动画仍挂）、t78、sidebar 相关 spec

## 前置

- worktree 新建（feat/T77）；完整 `pnpm build`（含 electron-vite——T98 教训）+ sdk install（T84 教训）

## 经理验收（任务 B · 2026-11-15）

- 复跑（隔离 HOME/TMPDIR，/tmp/bot-wt/T77/app/ui）：`run-e2e.sh t77-option-feedback bots t84-overlay-motion t59-sidebar-collapse grok-hidden-bots` → **12 passed (42.8s)**，与回执 2+9+2 口径一致；补跑原单回归项 `t78-native` → 2 passed
- 改动范围（`git show --stat 48188182`）：agent-row-actions.tsx（新覆盖）/ p5-55-layout.css / vite.config.ts 一行映射 / t77 spec——无删弱测试、上游 css diff=0
- 截图亲检（`work/ui-quality/evidence/T77/menu-{rest,hover}.{light,dark}.png`，探针临时 spec 已删）：7 项左对齐透明行、高 28 / padding-left 8 / radius 6、hover 只出底（light `rgba(28,28,28,.035)` / dark `rgba(245,245,245,.047)`）、transition `.12s` ×2；药丸灰底已消失。hover 底取上游 `ui-menu__row` 自带 token（0.18 重建 css，diff=0）——RE-UI-LAYOUT 无 menu-row 专值，§1.2 L122-125 是按钮族值，不套用
- LOW（Sol，归因更正）：成立，回执已改为「trigger 链失效（onClick/ref 未透传）」，原生 button 修复保留——处置够。残留：`p5-55-layout.css:541` 注释仍写「SandMenuItem 非 forwardRef」，并入 T77b 顺手改
- **范围收窄追认**：原单范围 1 后半（5 处手写 role=menu 走 FloatingSurface）与范围 2 其余面（Connect apps / 设置左导航 / 市场行 / 命令面板 tabs·行 hover）未做，验收条「6 处菜单全部走 FloatingSurface」未达成。用户 C① 主诉（侧栏右键菜单药丸→左对齐行）已交付且 T96 只依赖侧栏行，故本单按已交付部分通过，余量拆 T77b，不算悄悄缩水
- 已知弱断言：第二测单 bot 环境首行=选中行，只断 timing+规则存在不断值变化（回执已记档）；T77b 的多面 hover 测须在多行环境断值变化
