# T51：Connect apps 空目录死路 → 照 DSH Discover 在界面里管「目录源」

> 开单：manager (Opus 5.5) | 日期：2026-11-11 | 施工：main (GLM 5.3)
> 来源：T48 探针格 ②③（`work/settings-connectors/evidence/T48/connect-apps.light.png`、`newbot-open-connect.light.png`：「No catalog configured · …can't be changed in the app」）；Q-048-1 答复「一键参考DSH」；PLAN.md 行 C1
> 分支 / 作业目录：feat/T51 @ /tmp/bot-wt/T51
> claimed：2026-11-11 main (GLM) @ 8146cba0
> accepted：2026-11-11 feat/T51 @ 721e38f3（manager 任务 B 终验：sdk 19p、ui 单测 303p、market.spec 3p、sdk tests/market 8p、两轮复现脚本均转正确行为；见 receipts/T51.acceptance.md §5）

## 目标
市场没有目录源时，不再是死路：空态给「Add index source」，点开「Index sources」对话框能列 / 加 / 删目录地址，加完立刻能搜能装；行为照抄 DSH 的 Discover 页。

## DSH 的做法（经理探明，本单照抄语义；原版 0.78.1 目录来自 xAI 服务器，没有对应物——这是 Hivebot 自有面，外观用我们现有市场浮层的样式）
- 后端：`pluginMarket` **没有缺省目录源**（DSH 也一样），源由用户在界面加；`setIndexes(urls)` 规范化 + 校验 + 拒重复，经 `settings.update` 写回本服务的 profile 条目，生效不重挂载，广播 `plugin-market/changed`；`listIndexes()` 回每个源的标题 / 描述 / 上次失败原因，不发请求。锚点 `repos/deepseek-harness/packages/boot/plugin-market/README.md:27-53`；拒绝码 :81。
- 界面：`repos/deepseek-harness/packages/client/ui-plugin-market/README.md:27-29`——无源时空态带 **Add index source**；**Index sources** 对话框逐行显示「标题（首读前显示 host）/ URL / 上次失败原因 / 删除钮」，常驻一句「目录来自第三方」提示；被拒的 URL 保留草稿并说明原因（不支持的协议、带账号密码或 # 片段、已存在、部署存不了）；新加的源自动成为当前源。工具栏源下拉末项 **Manage index sources…**。
- 我们这边：M1 已放行 `pluginMarket/listIndexes|search|readEntryDetail`（`app/ui/main/m1-api/index.ts:23-25`），缺 `pluginMarket/setIndexes`；市场空态在 `app/ui/renderer-grok/overrides/modules/market-surface.tsx`（「No catalog configured」那条 Empty），数据层 `market-store.ts:108-116`（`enterMarket`）。

## 第 0 步：可行性探针（先做，结果写回执；不成立就停，派经理任务 C）
我们的 `plugin-market` 行在 `app/sdk/profile/patches/market.yml` 里用 `!!js process.env.P2SDK_MARKET_INDEXES` 给 `indexes`。真运行时（隔离 HOME）实测：
- Q1 `pluginMarket/setIndexes ['http://127.0.0.1:<端口>/index.json']`（用 `tests/support/connectors.ts` 的 `serveMarket()` 起的回环目录）是成功还是 `plugin-market/settings-unavailable`；
- Q2 成功后 `listIndexes` / `search` 立刻可用；
- Q3 **重启运行时后源还在**（`settings.update` 写到哪个文件、会不会被我们每次启动重生成的东西冲掉——照实记文件路径）；
- Q4 同时设了 `P2SDK_MARKET_INDEXES` 时两者谁赢。
Q1 或 Q3 不成立时允许把 market.yml 的 `indexes` 行改成「环境变量只作初值」之类的最小改法，但必须在回执写清改前改后探针输出；改不动就停。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md（含 T48b 记的 count/视口/PATH 三个坑）
2. T48 回执表格与 `work/settings-connectors/evidence/T48/probe.spec.ts`
3. `app/ui/tests/e2e/market.spec.ts`（`launchMarket`、`serveMarket` 用法）

## 边界
1. 只动：`app/ui/main/m1-api/index.ts`（加一行 `pluginMarket/setIndexes` + URL 参数守卫：数组 ≤20、每项字符串 ≤2048；真正的 URL 校验交给上游，不在 main 重写）、`app/ui/tests/unit/m1/api.test.ts`、`app/ui/renderer-grok/overrides/modules/{market-store.ts,market-surface.tsx}`、市场对应 css、`app/ui/tests/e2e/market.spec.ts`（加格）；第 0 步需要时 `app/sdk/profile/patches/market.yml`。不碰 new-bot 对话框（③ 的跳转本身是活的，修好目录后自然通）。
2. 与 T49 同改 `m1-api/index.ts`：**先做完 T51 再开 T49**，或 T49 后合并时三方合并，不整文件覆盖。
3. 不预置任何目录地址（DSH 也不预置；要不要给「一键加官方源」见 Q-049，默认不加）。
4. 先写失败测试：market.spec 新格「无源 → Add index source → 加回环源 → 列表出条目 → Connect 一个 → ✓Connected → 重开市场源还在 → 删源 → 回到空态」，看它红；m1 单测加 `pluginMarket/setIndexes` 放行格 + 超限拒绝格。
5. 文案照 DSH en 原文（Add index source / Index sources / Manage index sources… 及拒绝原因）；空态里「can't be changed in the app」删掉。
6. 测试走隔离 HOME / TMPDIR；只跑 market.spec 与 m1 单测，不跑全量 e2e。

## 验收（写命令，不写感觉）
1. `cd /home/lingxufeng/bot/app/ui && pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/m1/api.test.ts` → 全绿，新格在列。
2. `cd /home/lingxufeng/bot/app/ui && sh scripts/run-e2e.sh tests/e2e/market.spec.ts` → 全绿（含新格；原 2 格不回归）。
3. 新格里「重开市场源还在」一步必须是**重启运行时**后断言，不是只关浮层（回执贴该段代码行号）。
4. T48 探针格 ② 重跑：`cd /home/lingxufeng/bot/app/ui && NODE_PATH=$PWD/node_modules sh scripts/run-e2e.sh -c ../../work/settings-connectors/evidence/T48/pw.config.ts` → 格 ② **变红**（断的是旧空态文案），其余三格照旧绿——证明死路确实没了；回执贴红尾。
5. 截图：空态、Index sources 对话框（含一条失败源的错误行）、加源后列表，亮 / 暗各一张，放 `work/settings-connectors/evidence/T51/`；经理用 Read 亲眼看。
6. 变异：去掉 setIndexes 白名单行 → 新 e2e 格红。
7. `git diff --stat <claimed>..HEAD` 只含边界 1 的路径。

## 为什么这样验收
T48 已钉死用户踩到的是「点 Connect apps → 空页 → 说改不了」。用户要的是「参考 DSH」，DSH 解决同一个问题的方式就是让用户在界面里加源——不是我们塞一份目录。所以验收要证明的是整条路通：加源 → 能搜能装 → 重启还在 → 能删回去；重启后断言是为了防「只存在内存 / 被启动时的 env 覆盖」这种过了检查却没解决问题的情况。

## 产出
- 上列产品文件与测试；`work/settings-connectors/evidence/T51/`（探针 + 截图）；`work/tickets/receipts/T51.receipt.md`
