# T71：Connect 页去 DSH 字眼——Index sources 收二级、条目文案换原版式、「Your plugins」→「Installed」

> 开单：manager (Opus 5.5) | 日期：2026-11-12 | 施工：main (GLM 5.3)
> 来源：Q-055-1 / -2 / -4（用户 2026-11-12 全 A）；Q-056-3 默认（Index sources 收到 Installed 视图底部）
> 分支 / 作业目录：feat/T71 @ /tmp/bot-wt/T71（从集成分支 8999af14 起）
> claimed：2026-11-12 main (GLM 5.3) @ feat/T71=79134dc2（基于 de32990c）
> accepted：2026-11-12 feat/T71@d6f627e1（首验未过→T71b 同分支返修；复验见 receipts/T71-T71b.acceptance.md）

## 目标
Connect 主页不再露出 dsh「用户自配目录源 / npm / bundle / plugin」这些概念；功能保留，入口挪到二级，文案对齐原版。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md（:173 toBeVisible/滚动、:186 比字不只比框、:187 骨架屏假绿）
2. 原版锚：`work/grok-0.79.3-re/RE-CONNECTORS-0.78.1.md` §1 末（页面模式机 front → manage → detail，首页 = Installed + 分类浏览）、§2.1（Installed tab 混排）；`RE-CONNECT-PRESETS-0.78.1.md` §4 动词表（`eQkgKV` = "Installed"）
3. `app/ui/renderer-grok/overrides/modules/market-surface.tsx`（:5 :71-75 :127-128 :146-191 :245-257 :300 :322）

## 方案（逐条，行号 @8999af14）
1. **Index sources 收二级**（Q-055-1=A，落点 Q-056-3 默认 A）：
   - 删 Connect 主页头部的 `manage-index-sources` 钮（:322）。
   - Installed 视图（`mine` 视图）列表下方加一个 `size="sm" variant="secondary"` 钮「Index sources」（同 `data-action="manage-index-sources"`，点开现有管理视图，管理视图本身不动，含 :191 第三方提示——那是二级页里的真实安全提示，留）。
   - :257「No catalog configured」空态：内置 Hivebot picks 恒在（market-store.ts :123 404 也回 `[BUILTIN]`），先 grep 证明 `sources.length === 0` 不可达，不可达就删这一支；可达就停下写存疑项。
2. **条目文案原版式**（Q-055-2=A）：
   - :127 `browse`（无安装坐标）：**不显示任何说明**（原版不可装条目不解释），删这一行。
   - :128 `unsupported`：改成「Couldn't connect」一行 + `<details>`（summary「Details」）折叠 `outcomeText(outcome)`；保留 `data-install-error="not-bundle"` 属性（测试锚，非用户可见）。
   - **:129 installable 那句「…until you pick it when creating one」本单不动**——它描述的是现行为，T73d 改行为时一并删，避免文案先于行为说谎。
3. **「Your plugins」→「Installed」**（Q-055-4=A，原词 `eQkgKV`/RE-CONNECTORS §2.1「Installed」）：:73 aria-label、:248 aria-label、:300 标题、:5 注释；:245「Couldn't read your plugins」→「Couldn't load installed apps」；:247 空态「Nothing installed yet. Find plugins in the marketplace.」→「Nothing installed yet.」。全文件 grep `plugin` 剩下的用户可见串列进回执（不在此三条的不改，写存疑）。

## 边界
1. 只动：`market-surface.tsx`、对应 CSS（若 Installed 底部钮要间距）、引用旧文案的测试（market.spec、t58-market-layout.spec、t69-connect-picks.spec、boot-cover.spec、tests/support/connectors.ts、tests/unit/grok-shim/p5-57.test.ts——**只改字面串与选择器，不删断言**）。不碰 market-store / picks / sdk。
2. 先写失败测试：`app/ui/tests/unit/grok-shim/p5-57.test.ts` 加三格——① 主视图渲染后无 `[data-action="manage-index-sources"]`、Installed 视图有；② unsupported 行文本为「Couldn't connect」且细节在未展开的 `<details>` 里；③ browse 行无 `.pb-note`；全文无「Your plugins」「npm」「bundle」可见文本（textContent 断言）。看它红再改。
3. 测试走隔离 HOME / TMPDIR，DBus 指向不存在路径；不跑全量 e2e。

## 验收（写命令，不写感觉）
1. `cd app/ui && pnpm vitest run --config.verify-deps-before-run=false tests/unit/grok-shim/p5-57.test.ts tests/unit/market-picks.test.ts` → 全 passed，新增 ≥3 格
2. `cd app/ui && pnpm exec playwright test tests/e2e/market.spec.ts tests/e2e/t69-connect-picks.spec.ts tests/e2e/t58-market-layout.spec.ts` → 全 passed，0 skip
3. `grep -nE "Your plugins|npm install coordinates|connector bundle|No catalog configured" app/ui/renderer-grok/overrides/modules/market-surface.tsx` → 无输出
4. 截图（DPR=2，亮暗各一，`work/ui-borders-connect/evidence/T71/`）：connect-main、installed-with-sources-btn、unsupported-collapsed（造一条 not-bundle 行）；回执里写每张亲看确认了什么。

## 为什么这样验收
要保住的是「用户在主页看不到 dsh 机制」，同时「加源功能没丢」。①格证主页没入口、二级有入口（不是删了）；③grep 防漏网；e2e 证 Index sources 增删整条路径改道后仍通（market.spec :289 那条走生产缺省启动，见 LEARNINGS :185）。截图防「DOM 对了但钮被挤出视口」。

## 产出
- 修改 `market-surface.tsx` + 上列测试；回执 `receipts/T71.receipt.md`
