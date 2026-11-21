# T69：Connect apps 内置「Hivebot picks」目录——开箱不再是空页（能装的 + 原版常见的要登录条目）

> 开单：manager (Opus 5.5) | 日期：2026-11-11 | 施工：main (GLM 5.3)
> 来源：`work/ui-borders-connect/BRIEF.md`（用户 2026-11-11「COnnect应该和一些Grok Bot的预设是差不多的」）；`work/grok-0.79.3-re/RE-CONNECT-PRESETS-0.78.1.md`、`RE-CONNECTORS-0.78.1.md` §2；Q-048（2=A：要登录的条目「显示需要登录、不假装能点」）；**Q-054 默认 A/A/A 施工，用户改答再调**
> 分支 / 作业目录：feat/T69 @ /tmp/bot-wt/T69（**T58 合并后**从集成分支开——两单同改 market-surface.tsx）
> claimed：2026-11-12 main (GLM 5.3) @ feat/T69=73e1295d（基于 92b4cb0c）
> accepted：2026-11-12 manager (Opus 5.5) @ feat/T69=54dd3eda（T69+T69b 合验；见 receipts/T69-T69b.acceptance.md）

## 目标
第一次打开 Connect apps 就看到一份目录，而不是「No catalog configured」。目录是应用自带的一个**内置目录源**「Hivebot picks」，和用户自己加的 Index sources 并列；里面两类条目：①不用登录、离线就能装上用的 MCP 连接器；②原版 Grok Bot 目录里常见的要登录的服务（Gmail、Slack、GitHub…），如实标「Needs sign-in」、没有 Connect 钮。

## 经理定的方案（为什么不是别的）
- REA 结论：原版**本地没有预置清单**，条目全来自 xAI 服务端目录；用户在原版里看到「有预设」，是因为登录后服务端给了目录。我们没有这个服务端——「服务端目录」在我们这里的等价物就是一个目录源。用户要的是「打开就有、像原版」，所以给一个**随应用自带的源**，而不是继续空页。这与 Q-049 的默认 A（不预置）相反——用户新话已改了方向，Q-049 标为被 Q-054 取代。
- **内置在 renderer，不走 dsh setIndexes**：dsh plugin-market 只收 http(s) 索引地址（`dsh-plugin-market/lib/index.js:286`），自带文件要么起本地 HTTP 服务、要么挂公网——都比一个静态模块重，且离线会空。内置源 = `overrides/modules/market-picks.ts` 里的静态 `Entry[]`，`market-store.ts` 的 `search()` 对它本地过滤分页，其余（详情、安装、已装判定）走现有代码路径。（Q-054-1 若答 B「挂公网」，本单改为种默认源，条目文件照用。）
- **能装的条目只收已预置进 app/sdk 的 npm MCP 包**：安装走现有 `pluginManager/installBundle` → U-25 wrapper（`sdk/src/market/wrapper.mjs`），包是 app/sdk devDependency 才能离线装（wrapper.mjs:14-17）；需要启动参数的在 wrapper 参数表（:79）补一行。
- **要登录的条目复用现有 `browse` 分类**（`market-store.ts:64-70` 无 install spec → browse），只把 trailing 文案按关键字 `needs-sign-in` 区分为「Needs sign-in」+ 详情页一句「Sign-in connectors aren't supported in this build yet.」——与 onboarding 灰钮口径一致（Q-048-2=A），不加新状态机。
- 图标：不搬原版 47 张品牌图（第三方商标、且会进公开仓，Q-054-3 默认 A）；用现有行图标 fallback。
- 描述文案自写一句，不抄原版文案。

## 动手前先读
1. CLAUDE.md §4 搬运阶梯（选包要「在维护」：近 6 个月有 release）、work/LEARNINGS.md
2. RE-CONNECT-PRESETS §2 / §3、RE-CONNECTORS §2.2（11 分类 + override 表，用于挑要登录条目）
3. `overrides/modules/market-store.ts`（:23-47 state、:85-121 search / enterMarket、:125-150 addIndex / removeIndex）、`market-surface.tsx`（:30-40 trailing、:110-120 详情说明、:225-262 列表与空态）
4. `app/sdk/src/market/wrapper.mjs:70-90`（预置参数表）、`app/sdk/package.json` devDependencies
5. `app/ui/tests/e2e/market.spec.ts`（T51 空态格会因本单变化——见验收 2）

## 第 0 步（探针，结果贴回执；不成立就停，交经理任务 C）
1. 挑「能装」候选（≥3 个，目标 4~6 个）：近 6 个月有 npm release、stdio 启动无需 key / 登录、Node 实现。起点候选：`@agent-infra/mcp-server-filesystem`（已预置）、`@modelcontextprotocol/server-memory`、`@modelcontextprotocol/server-sequential-thinking`、`@upstash/context7-mcp`。每个贴 `npm view <pkg> time.modified version` 输出。
2. 对每个候选在隔离 HOME 下走一次「wrapper 安装 → mcp-client 起 → tools/list ≥1」，**断网**（`unshare -rn` 或 `P2SDK_OFFLINE` 现有口径，二选一能用的）跑。不过的剔除并写原因。
3. 确认 `installBundle` 直接收 `name@version` spec（不经 pluginMarket listing）可用；若必须经 listing，停。

## 边界
1. 只动：新 `overrides/modules/market-picks.ts`（静态条目 + 常量 `BUILTIN_PICKS_URL = 'builtin:hivebot-picks'`）、`market-store.ts`（sources 前置内置源、search 本地分支、addIndex / removeIndex 提交给 dsh 前滤掉内置源）、`market-surface.tsx`（只改 `browse` 的 trailing / 详情文案按 `needs-sign-in` 分流 + Index sources 视图里内置源显示「Built-in」且无删除钮）、`app/sdk/package.json` devDependencies（第 0 步通过的包）+ lockfile、`app/sdk/src/market/wrapper.mjs` 参数表（仅需要时加行）、测试：新 `app/ui/tests/unit/market-picks.test.ts`、新 `app/ui/tests/e2e/t69-connect-picks.spec.ts`、`market.spec.ts` 空态格（规格变更）。超出就停。
2. 条目内容：能装的 = 第 0 步通过者（install spec 精确版本 = 预置版本）；要登录的 10~16 个，名字取 RE-CONNECTORS §2.4 / RE-CONNECT-PRESETS §2 里出现过的一方连接器（Gmail、Google Calendar、Google Drive、Slack、GitHub、Notion、Linear、Figma、Jira、Dropbox、Box、Microsoft 365、Canva、Airtable…），带关键字 `needs-sign-in`，**无 versions / install**。
3. 先写失败测试：`market-picks.test.ts` ①「无用户源时 sources[0] 是内置源」②「addIndex 提交的 urls 不含 builtin:」先红。
4. 测试走隔离 HOME / TMPDIR，DBus 指不存在路径；不跑全量 e2e。

## 验收（写命令，不写感觉）
1. `pnpm -C app/ui --config.verify-deps-before-run=false exec vitest run tests/unit/market-picks.test.ts` → passed，含：
   - 无用户源 → `sources[0].url === BUILTIN_PICKS_URL`、`url` 默认选中它；有用户源 → 内置源仍在第一位、用户源顺序不变
   - 内置源 search：空查询返回全部、`text:'mem'` 只返回含 mem 的条目、offset/limit 分页与 dsh 同口径（PAGE=50）
   - `classify`：能装条目 → `installable`；`needs-sign-in` 条目 → `browse`
   - addIndex / removeIndex 发给 `pluginMarket/setIndexes` 的 `urls` 不含任何 `builtin:` 前缀（mock api 抓参数）；removeIndex 对内置源是 no-op
   - 条目表自检：名字唯一；能装条目的 spec 版本 = `app/sdk/package.json` 里该包版本（读文件比，防两边漂移）
   - 改动行覆盖 ≥80%（vitest coverage 在 ui 仓不可用时按 LEARNINGS 手工核算表）
2. `pnpm -C app/ui build` 后 `CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/t69-connect-picks.spec.ts` → passed：全新 HOME、不设 `P2SDK_MARKET_INDEXES` → 侧栏「Connect apps」打开 → 可见行数 = 条目总数且不出现「No catalog configured」；搜索框输 `memory` 只剩相关行；一个 `needs-sign-in` 行 trailing 文本为「Needs sign-in」、行内无 Connect 钮、详情页有那句说明；点一个能装条目 Connect → 变 ✓Connected，`pluginManager/listBundles` 含其 wrapper 名；Index sources 视图里内置源显示「Built-in」、无删除钮；再加一个用户源（现有 fixture HTTP 源）后两源都能切换浏览。
   - `… run-e2e.sh tests/e2e/market.spec.ts` → passed。T51「无源空态」格改为「内置源在、用户源为空时 Index sources 视图仍可 Add」——规格变更，回执贴前后。
   - sdk 侧：`pnpm -C app/sdk --config.verify-deps-before-run=false test -- market` → 全绿（wrapper 参数表若改）
3. 截图（Read 亲眼看）：`work/ui-borders-connect/evidence/T69/connect-{list,signin-detail,sources}-{light,dark}.png`
4. `git diff --stat <起点>..HEAD` 只含边界 1 的文件

## 为什么这样验收
- 用户要的是「打开就有、像原版」。e2e 用**全新 HOME + 不设环境变量**打开，才是用户第一次打开的真实路径；断言「No catalog configured」不出现 + 行数，才证明空页真的没了。
- 「Needs sign-in 行没有 Connect 钮」是 Q-048-2=A 的承诺（不假装能点），必须断言按钮不存在，而不只是文案在。
- 内置源绝不能被写进 dsh 设置（否则 dsh 拿 `builtin:` 去 fetch 报 invalid-index-url、把用户的源列表弄脏）——所以单测抓 setIndexes 的真实参数。
- 能装条目的版本与 package.json 自动比对，防止以后升级包时目录里的 spec 指向一个没预置的版本、离线装失败。

## 产出
- 边界 1 的改动；`receipts/T69.receipt.md`（第 0 步候选表：包名 / 版本 / 最近发布 / 断网 tools/list 结果 / 去留）；截图
