# T1：P5-H5a 单测 / support / market / examples 的裸 mkdtemp 改受管（残留归零）

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：work/HANDOFF.md §3 第 3 条（P5-H5）；主会话实测 unit/start.test.ts 每轮漏约 7 个目录（p2sdk-patch-* / p2sdk-main-* / p2sdk-slow-* 等）
> 分支 / 作业目录：feat/T1 @ /tmp/bot-wt/T1
> claimed：2026-11-06 01:46 main (GLM 5.3)
> accepted：

## 目标
`app/sdk` 的 unit / support / market 测试与 `examples/min-client.mjs` 跑完后，在私有 TMPDIR 里不留任何目录。e2e 留给 T8。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. `app/sdk/tests/support/tmp-sweep.ts`（`tmkdir` / `trackTmpDir`，按登记删、进程退出清扫）
3. 现状计数：`grep -rn "mkdtempSync(" app/sdk/tests/unit app/sdk/tests/support app/sdk/tests/market app/sdk/examples`

## 边界
1. 只动：`app/sdk/tests/unit/**`、`app/sdk/tests/support/**`（`tmp-sweep.ts` 本身不改）、`app/sdk/tests/market/**`、`app/sdk/examples/min-client.mjs`。**`src/**` 不碰**——`src/start.ts:71` 的 handoff 兜底 mkdtemp 是产品行为，测试侧应显式传 `P2SDK_HANDOFF=tmkdir(...)` 而不是改产品。
2. `examples/min-client.mjs` 是产品示例，不得 import `tests/support/**`：改为进程退出时 `rmSync` 自己建的 work 目录（只删自己建的那个路径）。
3. `*.proc.mjs`（被 spawn 的子进程脚本）若无法 import TS 登记簿：在脚本内 exit 时删自己建的目录；做不到的写进回执存疑项，不要绕。
4. 不改任何断言语义；只换建目录 / 补清理。改动是机械替换，发现某处目录在测试结束后**还要被别的测试复用**的，保留原样并写进回执。
5. 先写失败测试：先跑下面验收 1 拿到 RED（非零计数），贴进回执，再改。
6. 测试走隔离 HOME / TMPDIR（必须在 `/tmp/bot-T1-*` 下，便于 bot-reap 清理），DBus 指向不存在路径；不跑全量 e2e。

## 验收（写命令，不写感觉）
统一前置（每条验收都在这个环境里跑）：
```sh
T=$(mktemp -d /tmp/bot-T1-XXXX); mkdir -p $T/tmp $T/home
ENV="HOME=$T/home TMPDIR=$T/tmp DBUS_SESSION_BUS_ADDRESS=unix:path=$T/nonexistent"
cd /tmp/bot-wt/T1/app/sdk
```
1. RED→GREEN（残留计数）：`env $ENV pnpm exec vitest run --config.verify-deps-before-run=false tests/unit/start.test.ts; find $T/tmp -mindepth 1 -maxdepth 1 | wc -l`
   → 改前 > 0（贴原样列表）；改后 **0**，且 vitest `passed` 数与改前相同。
2. 全部范围内文件：`env $ENV pnpm exec vitest run --config.verify-deps-before-run=false tests/unit tests/market; find $T/tmp -mindepth 1 -maxdepth 1 | wc -l`（新 T 目录）→ exit 0、计数 **0**。若残留的是 vitest/vite 自己的缓存而非测试建的目录，原样列名写进存疑项，不要加忽略规则。
3. 静态门：`grep -rn "mkdtempSync(" tests/unit tests/support tests/market examples | grep -v "tests/support/tmp-sweep.ts"` → 只剩回执里逐条说明理由的例外（预期：`tests/support/sandbox-home.ts` 已经 `trackTmpDir` 包裹的那一处可留）。
4. min-client（需要在跑的 runtime，不单独起）：若 `tests/` 里已有用例 spawn 它（`grep -rln "min-client" tests`），在验收 2 的同一私有 TMPDIR 下跑该用例，`p2sdk-work-*` 残留为 0；没有这样的用例就在回执里贴清理代码行号（正常退出 + 异常退出两条路径），由经理读码核。
5. 无 src 改动：`git diff --stat <起点>..HEAD -- src` → 空。

## 为什么这样验收
目的是「测试不往机器上撒目录」：每轮漏 7 个目录，长期跑会堆满 /tmp 并干扰别的测试的计数。所以验收看**真实残留数**而不是看代码里换了几处——换了但还漏（比如产品兜底 mkdtemp 没传 handoff）照样不过。私有 TMPDIR 保证计数只来自本次运行。

## 产出
- 修改：`app/sdk/tests/unit/*.test.ts`、`tests/unit/*.proc.mjs`、`tests/support/*.ts`、`tests/market/*.test.ts`（仅含裸 mkdtemp 的文件）、`examples/min-client.mjs`
- 回执：`work/tickets/receipts/T1.md`
