# T15：上游升级评估——dsh 0.2.2-alpha.2 → 0.2.2-rc.1（只出报告，不升级）

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：主 agent 上游巡检（2026-11-06）：npm `latest` = `0.2.2-rc.1`（11-04；`npm view @deepseek-ai/dsh dist-tags` → `{ latest: '0.2.2-rc.1', alpha: '0.2.2-alpha.3', next: '0.2.2-rc.1' }`，经理开单时实测），我们钉 `0.2.2-alpha.2`（10-27，`app/sdk/package.json:20-30`），据巡检相差约 333 个非 merge 提交。巡检点名的相关变更：ssh 族新增 guarded patch/delete/move RPC（`7bd189b3b5`）、tool-fs「沙箱决策下放 provider」（`8f798da97d`，**可能与 T14 相关**）、vendor cordis `4.0.6-alpha.1 → 4.1.0`。
> 分支 / 作业目录：不建分支（不改仓内代码）；下载物放 `/dev/shm/bot-T15/`（每个 tarball 各自新建空目录解包，只读、不执行、不 `npm install`）
> claimed：2026-11-06 07:30 manager (Opus 5.5) 执笔 @ 588d3d1e；交稿 08:20（commit 2ee87e18）
> accepted：2026-11-06 @ 2ee87e18（manager 任务 B 新实例：自检 1–7 复跑全过；抽查 T14 无关 / apply_patch 穿透 / schedule 改名绕过 三条对 tarball 与 app/sdk 源码确认成立；DESIGN helper.js:557→558 勘误已落）

## 目标
出一份升级评估报告 `work/p9-dsh-integration/EVAL-dsh-rc1.md`，回答：升到 rc.1 会动到我们哪些东西、修了我们踩过的哪些坑、带来哪些新风险、**什么时候升**。本单**不升依赖、不改 `app/**`**。

经理的默认时机判断（报告可以推翻，但要给证据）：排在 T14 + T7a + T7b 落地之后，专开一张升级单 + 全量回归；中途升级会让在途工单与已验收证据链里指向 alpha.2 的 `path:line` 锚点全部失效（T2/T4/T5 设计与 T9a 都引了装包行号）。**例外**：若 `8f798da97d` 正好修掉 T14 的根因，报告要单独写明，并给出「T14 是在 alpha.2 上自修，还是提前升级」的对比（改动量、锚点失效面、回归面）——这一条报告写完先在回执顶部标出，主 agent 可据此决定 T14 走向。

## 动手前先读
1. CLAUDE.md §4 搬运阶梯（「在维护」判据）、§5 硬约束（下载物不可信：单独目录、不执行、Python 用 `-I`）
2. 我们对上游的耦合面：`app/sdk/package.json`（9 个 `@deepseek-ai/*` 依赖）、`app/sdk/profile/patches/{approval,market,presets,p2sdk,orchestration,p6-reply-style,market-source}.yml`、`app/sdk/src/start.ts`（`writeRuntimePatch` 生成的行 id）、`app/sdk/src/policy/*.mjs`（`createRequire` 引的上游内部：`dsh-fs-sandbox`、`dsh-sandbox`、`dsh-fs`，`fs-zone.mjs:16-19`）、`app/sdk/src/policy/containment.mjs:1-3`（复制改造的上游文件）
3. 在途设计的锚点：`work/p9-dsh-integration/DESIGN-ssh-composition.md`（大量装包行号）、`work/tickets/open/T9a-*.md`
4. 踩过的坑：`work/LEARNINGS.md`、p9 `PLAN.md` §3 十条、`work/tickets/receipts/T4.md` §5、`receipts/T7a.md` 附记、T14 工单
5. 本地参考仓 `repos/deepseek-harness@ce7073d`（MANIFEST 已记）——它比 alpha.2 新、比 rc.1 旧，**不能**当任一方的实物；比较一律用 npm tarball（alpha.2 可直接用已装 `app/sdk/node_modules/.pnpm/...`）与 GitHub tag `dsh-v0.2.2-alpha.2` / `dsh-v0.2.2-rc.1`

## 边界
1. 只写：`work/p9-dsh-integration/EVAL-dsh-rc1.md`（新）、`work/tickets/evidence/T15/*`（命令与原样输出）、`work/tickets/receipts/T15.md`。仓内其他文件一律不动；不 `pnpm install`、不改 lockfile。
2. 下载：`npm pack @deepseek-ai/<pkg>@0.2.2-rc.1 --pack-destination /dev/shm/bot-T15/tgz/` 后每个包解到 `/dev/shm/bot-T15/rc1/<pkg>/`（各自空目录）；只用 `diff`/`grep`/`jq` 读，不 `node` 运行其中任何脚本。
3. GitHub：用 `gh api repos/deepseek-ai/deepseek-harness/compare/dsh-v0.2.2-alpha.2...dsh-v0.2.2-rc.1`（分页）拿提交清单；点名的三个提交用 `gh api .../commits/<sha>` 看改动文件。
4. 包范围：`app/sdk/package.json` 的 9 个直接依赖 + 我们的 profile / runtime patch 里按名字引用的全部包（从五个 patch 文件与 `start.ts` grep `@deepseek-ai/dsh-` 得清单）+ 上述 `createRequire` 的三个内部包。清单本身进证据文件。

## 报告必须有的节（验收按节名查）
- `## 1 结论与时机建议`：一段话 + 推荐时机（默认判断成立 / 推翻，附理由）。
- `## 2 T14 关系`：`8f798da97d` 改了什么（文件、行为一句话）；对照 T14 的嫌疑（claim 建会话时 `sandboxPolicy.resolve` 无 workspaceRoot）是否同一机制；结论三选一：修了 / 无关 / 看不出（附证据）。
- `## 3 我们的 patch 行对照表`：五个主 patch 文件（approval / market / presets / p2sdk / orchestration）+ `start.ts` 生成行里引用的**每一个行 id 与包名**（开单时实测五个文件共 110 个不同 id；状态完全相同的 id 可合并成一行，但每个 id 都要用反引号单独出现），列：alpha.2 中存在于哪（base / bundle / preset）｜rc.1 中是否仍存在、是否改名 / 改 config schema｜影响。
- `## 4 内部 API 依赖`：`fs-zone.mjs` 继承的 `SandboxedFileSystem`、`workspaceWritableRoots`/`canonicalPath`/`FsError`，guard / shell-ask 依赖的 `tools/pre-execute`、`tools/execute` 扩展点签名，`containment.mjs` 复制源——rc.1 是否变了（贴 diff 摘要）。
- `## 5 cordis 4.1.0 波及`：每个已装 `@deepseek-ai/*` 包在 rc.1 下的 `peerDependencies` 里 cordis 的范围；我们自己的插件（`app/sdk/src/**`、`profile/plugins/**`）是否用到 4.0→4.1 有变化的 API（列 4.1.0 的变更点与我们的命中）。
- `## 6 ssh 族变更与 T5 设计`：`7bd189b3b5` 的 guarded patch/delete/move 对 DESIGN D1（`fs-zone-ssh` 只覆盖 writeText/editText 的前提）的影响；DESIGN 里每个指向装包的锚点在 rc.1 下的新位置或失效（表）。
- `## 7 踩坑对照表`：每条坑一行（来源 LEARNINGS / PLAN §3 / T4 §5 / T7a 附记 / T14）｜rc.1 是否改了相关代码（提交 sha 或「无相关提交」）｜修了 / 没修 / 看不出。
- `## 8 升级单草案`：若建议升级，列升级单要做的事（锚点重定、哪些回归必须跑、哪些在途单要先收口）——只写草案，不开单。

## 验收（写命令，不写感觉）
统一：`cd /home/lingxufeng/bot && R=work/p9-dsh-integration/EVAL-dsh-rc1.md`
1. 节齐：`for n in 1 2 3 4 5 6 7 8; do grep -qE "^## $n " $R || echo "MISSING §$n"; done` → 空。
2. 包清单与 tarball 一一对应：`work/tickets/evidence/T15/packages.txt`（每行一个包名）里每个包在 `/dev/shm/bot-T15/rc1/<pkg>/package/package.json` 存在且 `version` = `0.2.2-rc.1`：
   `while read p; do v=$(jq -r .version /dev/shm/bot-T15/rc1/$p/package/package.json 2>/dev/null); [ "$v" = 0.2.2-rc.1 ] || echo "BAD $p $v"; done < work/tickets/evidence/T15/packages.txt` → 空。
3. §3 覆盖全部行 id：`grep -hoE '^\s*-?\s*id: [A-Za-z0-9_-]+' app/sdk/profile/patches/{approval,market,presets,p2sdk,orchestration}.yml | awk '{print $NF}' | sort -u > /tmp/bot-T15-ids.txt; while read i; do grep -q "\`$i\`" $R || echo "UNLISTED $i"; done < /tmp/bot-T15-ids.txt` → 空（报告里行 id 一律用反引号包住）。
4. 提交清单原样输出在案：`work/tickets/evidence/T15/compare.txt` 存在，行数 = 报告 §1 写的提交数；点名三个 sha 各有 `evidence/T15/commit-<sha 前 10 位>.txt`。
5. §2 结论是三选一字面之一：`sed -n '/^## 2 /,/^## 3 /p' $R | grep -cE '结论：(修了|无关|看不出)'` → 1。
6. 不动仓：`git status --short -- app/ repos/` → 空；`git diff --stat <起点>..HEAD -- . ':!work'` → 空。
7. 无执行痕迹：`/dev/shm/bot-T15/rc1/*/package/node_modules` 不存在（`ls -d /dev/shm/bot-T15/rc1/*/package/node_modules 2>/dev/null | wc -l` → 0）。

## 为什么这样验收
评估报告的用处是让「什么时候升、升的时候要做什么」有证据可依，而不是凭版本号新就升。所以：用 npm 实物而不是参考仓（参考仓版本夹在两者之间，结论会错）；§3 机械比对我们每一个行 id（升级最常见的坏法是行 id 改名后我们的禁用 / 覆盖悄悄失效——禁用一个不存在的 id 不报错）；§2 单列 T14，因为它可能改变 T14 的做法；§6 单列 T5，因为 `fs-zone-ssh` 只覆盖两个写入口的前提正被 `7bd189b3b5` 改动。不升依赖，是为了不让在途单的证据链在评估期间失效。

## 风险
- `npm pack` 会联网下载；只下 tarball，不装依赖。
- 行 id 可能在 rc.1 里搬了位置（base → bundle）但仍存在：§3 要写出新位置，不能只写「存在」。
- compare API 单页上限：分页拿全，`compare.txt` 行数要与 GitHub 页面的提交数一致。

## 产出
- 新建：`work/p9-dsh-integration/EVAL-dsh-rc1.md`、`work/tickets/evidence/T15/*`
- 回执：`work/tickets/receipts/T15.md`（顶部先写 §2 结论一句话）
