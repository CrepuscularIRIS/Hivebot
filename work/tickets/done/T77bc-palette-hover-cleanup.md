# T77bc：撤掉与原版冲突的 palette hover 规则 + 死 CSS，hover 格按原版行为断

> 开单：manager (Opus 5.5) | 日期：2026-11-16 | 施工：main (GLM 5.3)
> 来源：T77bb 复验不通过（`open/T77bb-menu-copies-verify.md` 末「经理复验」）；T77b 链第二次不通过，按任务 C 收窄范围（见下「范围变更」）
> 分支 / 作业目录：feat/T77b @ /tmp/bot-wt/T77b（接 8da09c04 续提交）
> claimed：
> accepted：2026-11-16 591d5f89（manager 任务 B 第三轮复验，T77b 链整体收口：T77b+T77bb+T77bc）——rebuild 后 t77b 3p / 回归 12p / overrides 守卫 3p；diff 8da09c04..HEAD 只 4 文件；palette-row.hover 亮暗重拍亲看：被指第 2 行=aria-selected+原版选中底（亮 rgba(28,28,28,.10)=idle 首行同值）

## 目标
删掉 T77bb 加的两组 CSS（一组和原版选中态打架、一组完全不生效），palette 那格测试改成断原版本来就有的 hover 行为。

## 范围变更（经理裁定）
- **四个副本删除：全部追认**，不再动
- **Connect apps hover 移出本链**：这颗药丸按钮 P5-55 已定 `.3s cubic-bezier(.2,0,0,1)`（`p5-55-layout.css:99-105`，`!important`），T77b 工单要求的 `.12s` 是经理当时没查锚写错的。是否有 hover 底，进 T79 对照 0.78.1 再定
- **市场行 hover 移出本链**：同样没有原版锚，进 T79

## 边界
1. 只动：`overrides/p5-55-layout.css`、`tests/e2e/t77b-menu-hover.spec.ts`、`tests/unit/grok-shim/overrides.test.ts`、`overrides/vite.config.ts`
2. `p5-55-layout.css` 末尾 T77bb 两段：
   - 删 `.sand-agents-sidebar__plugins…` 两行（被 :99-105 的 `!important` 压死，经理实测 hover 前后 `rgb(31,31,31) 0.3s` 不变）
   - 删 `.sand-command-palette … :hover { background … }` 一行（原版 `CommandPalette.tsx:374` `onMouseMove → setHighlight`，hover 行即 `aria-selected` 行，原底 `production.css:322` `--cursor-bg-secondary`；本规则 (0,3,0) 压过它，被指行从 0.10 变 0.06，选中态变浅）。transition 那行可留
3. spec 第 3 格：
   - 标题改为「palette 行 hover = 原版高亮跟随」；删未用的 `check` 函数；删 `if (count > 0)`（改 `expect(count).toBeGreaterThan(1)`）
   - hover **第 2 行**（非默认选中行），断：它变 `aria-selected="true"`、bg 与 hover 前不同、与「idle 时第 1 行的选中底」相同
4. 顺手清理：`overrides.test.ts` COPIES 里残留的 `'plugins-browser.tsx'`、WHOLE_REPLACEMENTS 那行只剩空格的空行；`vite.config.ts` 无条目的 `// T77b：…` 注释
5. 「首次即绿」可接受：第 3 格测的是原版已有行为，回执写明由 `CommandPalette.tsx:374` + `production.css:322` 满足

## 验收
1. `sh scripts/run-e2e.sh t77b-menu-hover.spec.ts` → 3 passed
2. `sh scripts/run-e2e.sh t77-option-feedback.spec.ts t84-overlay-motion.spec.ts t91-reaction.spec.ts bots.spec.ts grok-hidden-bots.spec.ts` → 12 passed
3. `node_modules/.bin/vitest run tests/unit/grok-shim/overrides.test.ts` → 3 passed
4. `git diff 8da09c04..HEAD --stat` 只含上面 4 个文件
5. 回执 `receipts/T77b.receipt.md` 补 T77bc 段，贴原样命令与 `N passed` 尾行；T77bb 段补一句更正：channels 不可达的真因是 P5-52 `chat-header.tsx` 剥掉了 Channels 按钮（`grok-dead-entries.spec.ts:142` 在测），不是「controller 为 null」（shim `desktop.ts:94` 恒 logged-in）

## 为什么这样验收
T77bb 那格靠新 CSS 把「选中行被 hover」改浅才变绿，等于测试在给冲突背书；而且 `if (count>0)` 让它可能一行都不断就过。这次断的是用户真正看到的东西：鼠标指哪行，哪行就是选中底。

## 产出
- 上述 4 文件；回执两处

## 经理复验（2026-11-16，第三轮，通过）
- 先 `pnpm build`，再 `PATH=node_modules/.bin:$PATH sh scripts/run-e2e.sh t77b-menu-hover.spec.ts` → **3 passed**；回归 5 spec → **12 passed**；`pnpm exec vitest run tests/unit/grok-shim/overrides.test.ts` → **3 passed**
- `git diff 8da09c04..HEAD --stat` 只 4 文件（p5-55-layout.css / vite.config.ts / t77b spec / overrides.test.ts），符合边界
- 第 3 格「首次即绿」接受：断的是原版行为（hover 第 2 行→aria-selected=true、bg=idle 首行选中底），`expect(count).toBeGreaterThan(1)` 消除零断言路径
- 截图重拍 `evidence/T77b/palette-row.hover.{light,dark}.png`（上轮图是删规则前拍的，已覆盖）亲看：被指「Chat Settings」行=选中底，亮 `rgba(28,28,28,.10)` 与 idle 首行同值（原 0.06 变浅已消）；其余行透明；Connect apps 探针 `rgb(31,31,31) 0.3s` 不变（按范围变更进 T79）
- 残留小瑕（不返修，合并时顺手或 T79）：`overrides.test.ts` WHOLE_REPLACEMENTS 内仍剩一行单空格行；COPIES 尾 `, ]`
