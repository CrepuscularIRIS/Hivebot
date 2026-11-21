# T77b：选项反馈余量——5 处手写菜单换原语 + 其余面 hover 族

> 开单：manager (Opus 5.5) | 日期：2026-11-15 | 施工：main (GLM 5.3)
> 来源：T77 验收范围收窄（`done/T77-option-feedback.md` 文末）；ui-quality PLAN C 行 ②；T84 提议
> 分支 / 作业目录：feat/T77b @ /tmp/bot-wt/T77b（从 T77 合并后的集成分支起）
> claimed：
> accepted：2026-11-16 591d5f89（manager 任务 B 第三轮复验，T77b 链整体收口：T77b+T77bb+T77bc）——rebuild 后 t77b 3p / 回归 12p / overrides 守卫 3p；diff 8da09c04..HEAD 只 4 文件；palette-row.hover 亮暗重拍亲看：被指第 2 行=aria-selected+原版选中底（亮 rgba(28,28,28,.10)=idle 首行同值）

## 目标
T77 只换了侧栏右键菜单；其余 5 处手写 role=menu 和 4 个面的 hover 仍是原样，补齐。

## 动手前先读
1. `receipts/T77.receipt.md`「关键定位」两个坑：SandMenuTrigger 子元素须透传 onClick/ref（用原生 button）；顶层项不在 MenuContext 内不能用真 SandMenuItem（借 `ui-menu__row` 类的 plain 行）
2. T84 验收里列的 5 处：message-actions More / group-members Add Member / plugins Filter / schedule-editor Trigger source / channels Connection actions / computer More screens（以 `grep -rn 'role="menu"' renderer-grok/overrides renderer-grok/frontend/src` 实数为准，回执列出）
3. RE-UI-LAYOUT-0.78.1 §1.2 L44（`background-color,color .12s ease-out`）、L122-126

## 边界
1. 只动：上述菜单所在覆盖模块（无覆盖的走 MODULE_OVERRIDES 新映射，**同步登记 overrides.test.ts 白名单**）、`p5-55-layout.css`、新 spec `t77b-menu-hover.spec.ts`。上游 css diff=0
2. 顺手：`p5-55-layout.css:541` 注释改为真因（trigger 链 onClick/ref 未透传），不留旧「非 forwardRef」说法
3. 先写失败测试：t77b spec 先红（菜单无 `.ui-menu__content` / hover 值不变）

## 验收
1. `sh scripts/run-e2e.sh t77b-menu-hover.spec.ts` → passed，断言：①每处菜单打开后 `.ui-menu__content` 存在、项含 `ui-menu__row`、不含 `sand-kit-button`；②Connect apps / 设置左导航 / 市场行 / 命令面板行：**非选中**元素 hover 前后 computed background-color 不同 + transitionDuration 含 `0.12s`（多行环境，不拿选中行断）
2. 回归 `sh scripts/run-e2e.sh t77-option-feedback.spec.ts t84-overlay-motion.spec.ts bots.spec.ts` → passed
3. `node_modules/.bin/vitest run tests/unit/grok-shim/overrides.test.ts` → passed
4. 截图亮暗：每处菜单 + 设置导航 hover + 市场行 hover，存 `work/ui-quality/evidence/T77b/`，回执写每张确认点

## 为什么这样验收
T77 的第二测在单 bot 环境拿选中行断，值本来就等于 hover 底——只断 timing 会假绿。这里要求非选中元素的值真的变；菜单要真进 FloatingSurface 才吃得到 T84 入场动画。

## 经理验收（2026-11-16 · 任务 B · feat/T77b @ 1f6fe4e3）→ **不通过，写 open/T77bb**

重跑：t77b 2p + 回归 t77/t84/t91/bots/hidden 共 14 passed；overrides.test 3 passed。截图 evidence/T77b/（More 菜单 40ms+hover 亮暗、设置导航 hover 亮暗）。

1. **偏差追认**：运行时 More 菜单是 workspace/transcript.tsx 的 inline 版，属性选择器挂 T84 动画 + 行 hover，断言改 animationName——**追认**。为 1 个 className 整复制 4000 行不划算；意图（吃入场动画、行有 hover 底）达成，截图行 hover 底可见。
2. **守卫 5 条目**：逐个 diff 上游——channels/group-members/schedule-editor/plugins-browser 是真整复制（只多 className + 相对 import 改全路径 + 来源头）。**message-actions.tsx 不合格**：两个按钮写了重复 `className`（`className="sand-message-hover-actions__button ui-menu__row" … className="ui-menu__row"`，后者覆盖前者，丢掉 hover-actions 按钮类；TS17001），而且回执自己说这条菜单路径没启用——死路径带 bug 的 312 行副本，删。
3. **验收①缺口**：spec 只测 inline More；4 个真副本的菜单 0 条 e2e——映射是否真生效、`.ui-menu__content` 是否出现，都没有证据。
4. **验收②缺口**：Connect apps / 市场行 / 命令面板行 hover 未做（回执「时间盒」）。
5. 截图只有 More + 设置导航，验收④要求每处菜单都有。
观察（不阻塞，进 T79）：亮色 More 菜单盖在用户气泡上（定位是上游 inline，非本单引入）；设置导航 hover 底和选中底肉眼几乎一样。
