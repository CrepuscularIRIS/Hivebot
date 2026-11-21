# VERIFY · P5-31 审批卡 / 设置 L-AP 适配（v3 改范围）

verdict: PASS
commit: ef7bbf0（分支 feat/P5-31 @ /tmp/bot-wt/P5-31，基 4836bb4；验收时 worktree 干净，红基线改动已恢复）

验收环境：独立复跑，HOME=/tmp/bot-vfy-p5-31，e2e 走 run-e2e.sh 自带 Xvfb（1600x1000x24）。

| 验收项 | 结果 | 证据（命令/文件/截图） |
|---|---|---|
| 1a 最终 build 全量（builder 全量跑在样式修正前，本次为修正后复跑） | PASS | `pnpm build`（electron-vite + renderer-grok + shim + stage 四段全 built）；exit 0 |
| 1b ui vitest 期望 360 | PASS | `pnpm test` → `Test Files 33 passed / Tests 360 passed`，exit 0 |
| 1c sdk 未动回归 | PASS | `pnpm -C app/sdk test` → 304 passed / 37 files，exit 0 |
| 1d e2e 全量期望 61/0 | PASS | `pnpm test:e2e`（Xvfb）→ `61 passed (6.6m)` 0 failed，exit 0 |
| 2a bash 卡恰两钮 + 命令全文 | PASS | grok-shim.spec.ts L108-111：Always allow 按钮 count=0、Never count=0、`button` text 恰 `['Allow once','Deny once']`、`ask-command` 全文 `touch p551-ok`；单跑该 spec 1 passed。截图 `evidence/P5-31/turn1-light.png` 亲眼确认：卡标题「Allow Grok Bot to run this on your computer?」+ 说明「Only this time. Grok Bot will ask again next time.」+ 两钮（Allow once 绿主样式 / Deny once 灰）、命令全文、无任何 Always/Never 字样 |
| 2b request_network 卡 reason 全文（含范围期限） | PASS | L143-145 断言含 `reason: P5-31 probe: fetch the package index to resolve dependencies`、`command: curl …8 个 -H 头全文`、`scope: this session, one exact command, single use, expires in ~60s`；截图 `evidence/P5-31/net-card-light.png` 亲眼确认三行全文俱在、恰两钮 |
| 2c Esc = 拒绝 | PASS | L148 `page.keyboard.press('Escape')` → 卡消失（dock count=0）→ 模型回合以「网络未获批准。」收尾；D9 值集断言 L154 `['allowed-once','rejected','rejected']`（bash Deny + 网络 Esc 两拒） |
| 3 红基线：摘覆盖映射 → Always 计数红 → 恢复绿 | PASS | sed 摘 `MODULE_OVERRIDES` 的 local-tool-view 行 → `pnpm build` → 单跑 grok-shim.spec：`✘ L108 toHaveCount(0) unexpected value "1"`（Always allow 回来了）→ `git checkout --` 恢复 → 重建（4 built）→ 同 spec 1 passed。证明隐藏唯一机制就是覆盖映射，断言非空转 |
| 4 Never 隐藏取舍复核 | PASS | ui/P5-31-final.md L6 论证「coordinator 把 never 映射 rejected，点它只等于拒一次」；代码确证 `shim/src/coordinator.ts:49-50`：`dshValueOf = resolution === 'allow-once' || resolution === 'always' ? 'allowed-once' : 'rejected'`（注释 L5 同：「deny/never→rejected」）。配套 `desktop.test.ts:66-71`：set('always')/set('never') 均拒存回 'ask'（不留假 Never 态）。论证成立，取舍合理 |
| 5a 区域 13 文件 | PASS | `git diff --name-only 4836bb4..ef7bbf0` 恰 13 文件（overrides 3 + shim 3 + tests 7），+215/-40 |
| 5b 上游 diff=0 | PASS | `pnpm -C renderer-grok check` → `upstream diff=0: 332 files`，exit 0 |
| 5c 与 P5-55 冲突面标注 | PASS | REPORT 已标注两点（卡壳 inline style、MODULE_OVERRIDES 两边加行）；核对属实：P5-55 区域 = `renderer-grok/overrides/` 整目录（PLAN L223，含 token 色板与卡壳 r24 收口），与 P5-31 的 `overrides/modules/local-tool-view.tsx`（inline style）和 `overrides/vite.config.ts`（MODULE_OVERRIDES 加行）直接同域。P5-55 worktree 现停基点 4836bb4 未开工，无实际文件交集，合并时按标注三方处理即可 |

附加核验（REPORT 声称的其余交付）：
- 设置 Execution 下拉+团队文案隐藏：`d11-d12.spec.ts:53` 起断言设置不再渲染「Execution on Local Computer」且文案扫描恢复无剔除（在 61 全量内通过）。
- 截图亲验方式说明：截图由 e2e 真实 Electron 会话（Xvfb）`page.screenshot` 产生，仅含应用窗口；已拷贝至主仓 evidence 并用视觉模型逐字核对卡标题/说明/按钮/命令/scope 行。

新问题（每条一行，可直接成为修复任务）：

无。

补充观察（非问题）：net-card 截图中 curl 命令带 8 个 `-H "X-P531: long"` 头是测试脚本自造的长命令（NET_REASON/NET_COMMAND 常量，grok-shim.spec.ts:17-18），用于验证全文不截断，非产品内容。
