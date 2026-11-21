verdict: PASS
commit: 25ae3fcd73489ff42ce4ca289698c6db2c627a1f
验收人：GLM verifier（独立复跑，2026-11-04）；worktree /tmp/bot-wt/P5-41f1，验收结束时 git status 干净、工作文件 sha256 == HEAD blob（b0425c80…）

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| ui vitest 期望 384 | PASS | `./node_modules/.bin/vitest run`（干净 worktree）：Test Files 35 passed, **Tests 384 passed** (3.87s) |
| 全量 e2e 期望 68（builder 报 67/68） | PASS | 干净 build（`pnpm build`，LEARNINGS：e2e 前必建）后 `pnpm test:e2e`（Xvfb 1600x1000x24）：**68 passed (8.3m)**，含 market.spec 两例，一次全绿无 flake |
| renderer-grok check diff=0 | PASS | `pnpm -C renderer-grok check`：`upstream diff=0: 332 files`，exit 0 |
| WCAG 半透明反例单测在位且红基线 | PASS | 单测 `tests/unit/support/contrast.test.ts:7-14,35-38`（rgba .56→3.93 / 旧 16.61 / opacity 折算）。红基线：硬链接副本（/tmp/bot-vfy-p541f1，已删）把 contrastRatio 改回旧行为（丢前景 alpha，diff 里旧 AUDIT 原文）→ 单测 **2 failed**（16.61 vs 期望 3.93 ×2）；新算法 4/4 绿 |
| contrast.tsv 抽 3 值亲算（含半透明） | PASS | 独立 Python 实现（非交付代码）逐条复核：工具行预览 light rgba(28,28,28,.56) on rgb(252,252,252) = 3.9266（tsv 3.93）；审批卡命令 rgb(0,133,74) on rgb(246,246,246) = 4.3628（tsv 4.36）；侧栏副题 light = 3.6761（tsv 3.67）；另验 composer 占位 dark 5.3352（tsv 5.34）、market Not available 5.8606（tsv 5.86）；旧算法丢 alpha 恰 = 16.6111（GU 指控值） |
| 改 3 项（链接黑/搜索占位/Not available） | PASS | 活 DOM computed（探针 `vfy-probe.spec.ts` → `vfy-findings.json`）：正文链接 fg rgb(28,28,28)=text-primary，ratio 14.76（改前蓝 accent 4.39）；搜索面板占位 fg rgba(28,28,28,.56)=text-tertiary，ratio 3.96（改前 Chromium #757575）；Not available：market.spec 活 DOM 审计 ≥4.5 断言在我的全量跑中绿 + `.pb-status{color:var(--sand-text-secondary)}`（p5-57.css，注释注明自定非照原版）+ Python 5.86 |
| 审批卡分段亲验（fake 出卡） | PASS | 探针（launchProduct+fake runtime，标准 preset bash 审批）：标题条 `data-pbots="ask-titlebar"` 内 laptop 徽标（data-icon-name="laptop"，1 字形）+「Computer」+ 关闭钮 aria-label="Deny once"；代码块 computed 浅底 rgba(28,28,28,.04)+绿字 rgb(0,133,74)+等宽+无边框，Copy 钮点击后剪贴板 == 命令全文（真实 clipboard readText）；关闭钮点击 → dock 消失、tool 行 failed、canary 文件未创建（=拒绝且无副作用）、全程 0 pageerror；卡高短命令精确 224px（长命令换行 244px，签收单 2.2 如实）。截图亲眼核对（vision 分析）：Computer 标题条+X、浅底绿字代码块+Copy、Deny once/Allow once、卡在 composer 上方（=签收单 2.1 申报位置偏差）——`vfy-approval-card.light.png` / `vfy-approval-card-short.light.png` |
| D2(b) p6-fold 断言含注入文本、禁 JS 异常；亲跑 | PASS | 断言在位（p6-fold.spec.ts:186-187：`toContainText('回复失败：P6-03 boom')` + `not.toContainText('Cannot read')`）；worktree 单跑 `xvfb-run … playwright test tests/e2e/p6-fold.spec.ts`：**2 passed (19.8s)**。坏路径复现：副本把 fixture 改回旧格式 `{kind:'error',message}` → 红，notice 实测 `"回复失败：Cannot read properties of undefined (reading 'code')12:38 AM"` 与 GU 指控逐字一致 → 「丢失层=测试脚本违反 dsh 契约，产品链路无恙」的诊断成立 |
| 签收单完整性 | PASS | ACCEPTED-DEVIATIONS.md §1 五行均有「我们现值+原版 ref+可选修法+空签收栏」（1.5 ref 拿不到已如实标注）；§2.1 卡位置、§3.1 原生控件弹层逐条有差异+原因+签收栏；e2e REF_FAITHFUL 钉值（3.93/4.36/3.96/3.96/3.67 ±0.05）与单值逐条相等且在我的全量跑中生效；disposition.mjs：waived:arch→signoff:arch→§2、两视图→unverified:*（不计 open=0，GU-B「须如实」落实）；引用截图全部存在于 evidence/P5-41f1/ |

## 复核说明与保留
- 签收单里 0.78.1 ref 侧数值（3.93/4.36/3.96/2.49）出自 builder 的 ref-colors 探针（已删，方法已在单头披露），本轮未独立重测 ref 侧；「我们」侧全部独立复证。
- 副本侧红基线实验脚本已存 `evidence/P5-41f1/vfy-probe.spec.ts`（探针）供复现；contrast 红基线为一次性改动，无存档必要（diff 旧算法原文在 `git show 25ae3fc`）。
- 验收事故披露（已恢复，无净影响）：红基线副本用 `cp -al` 硬链接 + Python `open('w')` 原地写，一度把 worktree 的 p6-fold.spec.ts 同 inode 改掉；已 `git checkout --` 恢复并 sha256 对照 HEAD blob 一致、git status 干净。单跑 p6-fold 的绿证据取自污染发生前，时序无混。

新问题：
- [FIX] 签收单 §1.5 侧栏副题把内部 kind 名「local-tool-permissi…」露给用户，原版同场景不显示副题（单 §6.2 已列 LOW 待用户定） | 复现：探针截图 vfy-approval-card.light.png 左栏 VFY-X 行副题 | 疑似位置：renderer-grok 侧栏 preview 取值 | 严重度 LOW
