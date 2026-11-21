# VERIFY-U-25 · 裸 npm 包动态包装层

verdict: **PASS**
commit: cb4091c56d1119ba4d9936363185ffb1f9f78ce5（feat/U-25，/tmp/bot-wt/U-25，验收时 HEAD 与申报一致，单 commit 于 d175a75 之上）
日期：2026-11-02 · verifier 独立复跑 + 独立探针（非重跑 builder 输出）

| 验收项 | 结果 | 证据（命令/文件/路径） |
|---|---|---|
| ① 红线 not-bundle 复现 | PASS | builder 红线 `evidence/U-25/red-run.txt`（16:44，早于 fix commit 16:55）：同一 listing spec `@agent-infra/mcp-server-filesystem@1.2.29` 直装 `application:"failed"`（pnpm add 成功 +90 包但 plugin-manager 拒），market.test.ts 4 例红。锚点亲证：repos/deepseek-harness/packages/boot/plugin-manager/src/index.ts:984 `manifest?.dsh?.bundle === undefined → throw ManagementFailure('not-bundle')`。我的探针 ④ 又活体复现了该终点（裸名透传 → `code=not-bundle`） |
| ② 经 wrapper 直装成功 + X/Y 隔离 | PASS | 独立探针 `evidence/U-25/vfy-probe.mjs` + 转录 `vfy-probe.out`（19/19，exit 0）：listing 动态翻页取 spec（111 条）→ `pluginManager/installBundle` → `application:"applied"`、target=`@p2sdk-market/agent-infra__mcp-server-filesystem`（装的是 wrapper 不是裸包）；`listBundles` 该行 `enabled:false`，裸包从未成为 bundle；X（createWithConnectors）工具表含 `mcp__mcp-server-filesystem-3408f957__read_file`，脚本化一轮实际调用 read_file，流里 tool/call + tool/result 均在且 result 带真实 stdio server 返回的唯一标记文本；Y（session/create）始终 0 个 `mcp__*` 工具（X 用过之后复测仍 0）；盘上 `$DSH_HOME/market-wrappers/` 产物含 `dsh.bundle.patch` 声明 + `--allowed-directories $DSH_HOME/workspace` 烘焙 |
| ③ 无坐标原样拒 | PASS | 探针 ④：裸名 `@agent-infra/mcp-server-filesystem`（无 @version）→ `market-wrappers/` 无新目录（wrapper 未拦）→ 原样透传给 dsh → `application:"failed"` + 结构化 `code=not-bundle` + `target` 即原 spec（透传不改写）。单测 `tests/unit/market-wrapper.proc.mjs` 钉死 parseExactNpmSpec 对 bare/tag/range/path/flag 全 null；e2e ②c（无坐标条目结构化拒）在 148 绿内 |
| ④ 双绿离线在线 | PASS | 亲跑：在线 `pnpm -C app/sdk test` ×2 → 20 files / 148 tests 双绿（25.50s、23.55s）；离线按 PLAN.md:44 标准配方 `unshare -rn`（`ip link set lo up`、CURL-RC=6、仅 lo 网卡）→ 20 files / 148 tests / 147.59s / OUTER-EXIT=0（`vfy-online-tail.txt`、`vfy-offline-tail.txt`）。coverage `vfy-coverage-tail.txt`：src 全体 93.21% 语句、src/p2temp 100% 行、wrapper.mjs 97.18% 行——与 builder 申报一致。注：我第一次离线跑漏了 `ip link set lo up`（lo DOWN → ENETUNREACH 21 红），属跑法错误非代码问题，标准配方下绿 |

**接线复核**：`src/p2temp/index.mjs` 构造器对 `ctx.pluginManager` 调 `patchPluginManagerInstall`（own property，Symbol 防重入，restore 删 own property）；gateway 分发锚点亲证：`@deepseek-ai/dsh-typert-protocol` lib/index.js:181-182 `Reflect.get(remote, namespace)` → `Reflect.get(receiver, method).apply(receiver, values)`——调用时取 receiver 自身属性，own property 对所有调用方生效。四条件过滤（精确坐标 / 预置版本精确一致 / 未声明 dsh.bundle / bin 入口存在 + mcp-client 可解析）在 wrapper.mjs:122-141，任一不满足 → null → 原样透传；单测 130-140 行 7 个负例 + 探针 ④ 活体验证。两条市场链（market.yml:27 / market-source.yml:24）都插 p2temp，app/ui 零改动成立。

**探明结论复核**：repos/deepseek-harness/apps/plugin-market-generator/src/generate.ts:167 `!isBundle(manifest) → return []`（generator 只索引声明 dsh.bundle 的包）；index.ts:984 not-bundle 拒（见①）。dsh 确无裸包转换原生机制，自建合理。

**区域**：`git diff --name-only d175a75..cb4091c` = 6 文件，全在 app/sdk/（README.md、src/market/wrapper.mjs、src/p2temp/index.mjs、tests/e2e/market.test.ts、tests/unit/market-wrapper.{proc.mjs,test.ts}），app/ui 与 app 其余零改动。

**发现记档核对**：4 条均在主仓 work/LOG.md:478（其余 20 条待 devDep 预置——devDependencies 实际只预置 filesystem 1 条属实；参数表仅 filesystem——REQUIRED_ARGS Map 单项属实；already-installed 语义；allowed-dir 烘焙值归 P4 表单——wrapper.mjs:80 有 ponytail 标记）。README 增补 7 行同步了行为契约。均不阻塞。

**坏路径**：③（无坐标拒）即本任务最相关坏路径；另单测覆盖生成异常→null 透传（wrapper 失败不吞 dsh 语义）。进程卫生：验收产生的 82 个 vitest 遗留 dsh 子进程已用 bot-reap 按 PID 清理，沙箱外未动。

新问题（每条一行，可直接成为修复任务）：
- [FIX] vitest 失败路径的 runtime 子进程不回收（失败的套件跑完后 dsh 子进程残留，需 verifier 手动 bot-reap）| 复现：离线跑法错误（如 lo 未拉起）让套件快速红一次，pgrep -f "bot-wt/U-25/app/sdk" 见数十残留 | 疑似位置：app/sdk/tests/support/runtime.ts stop()/vitest teardown 对 beforeAll 失败文件的 afterAll 跳过 | 严重度：低（测试卫生，非 U-25 引入）
