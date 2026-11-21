# VERIFY-T-11 · D7 覆盖率达标 + R11 预存红修复

verdict: PASS
commit: e1cab6808a760197baefde666369afc8d9c9bd0b（d9ab47e 预存修复 + e1cab68 本任务，分支 feat/T-11，worktree /tmp/bot-wt/T-11；验收期间 HEAD 未漂移）

环境：node v22.23.4 / vitest 5.0.5 + @vitest/coverage-v8 5.0.5；GPU 空闲、load ~5，测试全部串行（--no-file-parallelism）。工作树干净（git status 无 tracked 脏文件）。

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| 复跑①：覆盖率全量 ×2 | PASS | `pnpm exec vitest run --coverage --no-file-parallelism` 两次：均 13 files / 77 tests 全过、exit=0、无任何 "does not meet threshold" 报错。run1 17:59:12–18:00:32（80.02s）、run2 至 18:02 前后，summary 块两次逐字相同。evidence/T-11/coverage-run1.log、coverage-run2.log |
| 复跑②：无覆盖全量 | PASS | `pnpm exec vitest run --no-file-parallelism` → 13 files / 77 tests 全过，exit=0（67.86s）。evidence/T-11/plain-run.log |
| ① src/ 四项 ≥80 | PASS | Statements 92.27%（215/233）、Branches 89.34%（109/122）、Functions 94.44%（34/36）、Lines 94.63%（194/205）——四项全部 ≥80，两次运行数字完全一致。evidence/T-11/coverage-numbers.txt（含 coverage-final.json 按文件对账：187+46=233 stmts、101+21=122 branches、30+6=36 funcs，总数严丝合缝，无虚报） |
| ② p2temp 单文件 ≥85 | PASS | src/p2temp/index.mjs：stmts 46/46、funcs 6/6、branches 21/21，全部 100.00%（≥85 达标且如申报为满覆盖）；全部语句命中 ⇒ lines 亦 100%。对账来源 coverage-final.json（文本报表不打印 100% 文件的行，以 JSON 为准）。evidence/T-11/coverage-numbers.txt |
| ③ 不破坏 + 生产不注入 | PASS | 不破坏：三次全量 77/77（含全部 e2e/market 旧用例）。生产不注入双证：(a) 单测 tests/unit/start.test.ts「T-11: NODE_V8_COVERAGE reaches the dsh child only via the test-harness name」——prod 场景 launcher env 带 NODE_V8_COVERAGE='/tmp/cov' 时断言 `prod.NODE_V8_COVERAGE` undefined（allowlist 不放行该名），test 场景断言 P2SDK_TEST_V8_COVERAGE 被消费映射为 child 的 NODE_V8_COVERAGE 且原变量不透传；(b) 亲读 src/start.ts childEnv（L95-112）：唯一注入点是 `if (env.P2SDK_TEST_V8_COVERAGE)`，生产不设该变量即零注入 |
| ④ 机制注释在位 | PASS | vitest.config.ts L10-21（autoAttachSubprocess 机制 + 双坐标约束 + 生产不注入）；tests/support/runtime.ts L34-53（launcherSpawnEnv：空串豁免 + P2SDK_ 名义转交）；src/start.ts L98-105 与 L109-112（消费即丢弃 + 旁路映射）；tests/unit/p2temp.proc.mjs L1-8（为何裸子进程跑）；tests/unit/launcher-lock.test.ts L187-189（锁竞争子进程同理由）。五处互相一致 |
| R11 前半：②③⑤⑥ 不再 ENOENT | PASS | d9ab47e 后 boot() 每次 mkdtemp 独立 handoff（'p2sdk-t08-ho-'）并显式传 P2SDK_HANDOFF，ready 后从该目录读 base-url/launch-token（security.test.ts L87-108）。实测 `vitest run tests/e2e/security.test.ts --no-file-parallelism --reporter=verbose` → 7/7 绿：②1458ms、③3517ms、⑤11850ms（真 key 实跑非 skip，全量两轮中 0 skipped）、⑥2072ms。evidence/T-11/security-verbose.log |
| R11 后半：多 home 并发不写共享默认 handoff | PASS | 静态：三处真实 spawn 点（runtime.ts launchRuntime L60-67、security boot() L88-91、restart.test.ts startEnv L49-56）全部传各自 mkdtemp 的 P2SDK_HANDOFF；examples/min-client.mjs L18-19 的 ⑤ 路径改吃显式 P2SDK_BASE_URL/P2SDK_LAUNCH_TOKEN（env 名亲验存在于 min-client 源码）。动态：验收前基线 `.dsh-handoff` 空、mtime 17:19:06（builder 修复前遗留）；经我 4 轮运行（2×覆盖全量 + 1×无覆盖全量 + 1×security verbose，合计数十次 boot）后 stat 复查 mtime 与内容完全未变——零写入共享默认目录。/tmp 下本轮产生的 handoff/home 均为每次 boot 独立目录（p2sdk-t08-ho-/p2sdk-handoff-/p2sdk-runtime- 前缀） |
| builder 实测结论抽查：NODE_V8_COVERAGE 强制下传、空串豁免 | PASS，注释与实现一致，且独立复现 | 注释（runtime.ts L47-51、vitest.config.ts L16-17）与实现（launcherSpawnEnv 置 ''、childEnv 映射回真目录）一致。本机独立探针（node 22.23.4）：父进程 export NODE_V8_COVERAGE=/tmp/force-inherit-probe，子进程以显式 env（不含该变量）spawn 仍打印 "/tmp/force-inherit-probe"（强制继承属实）；显式传 NODE_V8_COVERAGE='' 时子进程见 ""（空串豁免属实）。探针目录已清理 |
| 坏路径：覆盖率门槛会咬人 | PASS | `vitest run tests/e2e/mock-demo.test.ts --coverage --no-file-parallelism`：测试本身 9/9 过，但 exit=1 且 8 条 ERROR——全局四项（51.93/43.44/66.66/54.14 < 80）+ 'src/p2temp/**' 四项（0% < 85%）全部判红。同时证明 p2temp glob 门槛非空转（该子集下 p2temp 报 0% 且被门槛点名）。evidence/T-11/threshold-probe.log |
| 区域检查 | PASS | `git log main..HEAD` = 恰好 d9ab47e + e1cab68 两个提交；合计触及 9 文件，与申报清单一一对应：vitest.config.ts、src/start.ts、tests/support/runtime.ts、tests/unit/{launcher-lock.test.ts, p2temp.proc.mjs(新), p2temp.test.ts, start.test.ts}、tests/e2e/{restart.test.ts, security.test.ts}。start.ts diff 逐 hunk 核对：仅 2 个 hunk 且都在 childEnv 内（排除条件加一项 P2SDK_TEST_V8_COVERAGE + 一个映射 if 块及注释），allowlist `keep` 行、锁逻辑（acquireHomeLock/publish/stale-reclaim）零改动。vitest.config.ts 仅 +autoAttachSubprocess +注释 +p2temp 门槛，include 与全局 80 门槛原样。测试重写核查：旧 p2temp.test.ts 9 用例在 p2temp.proc.mjs 全部保留（断言原文对应，个别合并进同一 case）并新增 6 个 service 级 case，无删测凑数 |
| 备注（非问题） | — | 两次覆盖率日志中的 "no ready line within 1ms" 是 mock-demo.test.ts:97 设计内负路径（P2SDK_READY_TIMEOUT_MS:'1'）的预期输出，非 flake |

新问题（每条一行，可直接成为修复任务）：

- [FIX] 测试 mkdtemp 目录从不清理，/tmp 已积累 1329 个 p2sdk-runtime-/p2sdk-handoff-/p2sdk-t08-ho- 前缀目录 | 复现：任跑一次全量后 `ls /tmp | grep -c 'p2sdk-runtime-\|p2sdk-handoff-\|p2sdk-t08-ho-'` 持续增长 | 疑似位置：app/sdk/tests/support/runtime.ts launchRuntime、tests/e2e/security.test.ts boot()、tests/e2e/restart.test.ts（均 mkdtempSync 无 afterAll 清理） | 严重度：LOW（预存行为，T-06/T-08 起就有，非 T-11 引入；本地开发环境影响为 /tmp inode/空间缓慢积累）

补充说明：
- 本任务无 UI，不涉及浏览器截图。
- LEARNINGS 相关约束遵守：测试串行（--no-file-parallelism）、未用 pkill -f（进程检查用 pgrep -x）、HEAD 无漂移故未启用 detach checkout。
- 证据目录：/home/lingxufeng/bot/work/p2-sdk/evidence/T-11/（coverage-run1.log、coverage-run2.log、plain-run.log、security-verbose.log、threshold-probe.log、coverage-numbers.txt）。

## rebase 复验（e4ff496）：PASS

T-11 rebase 到含 T-14（29d95c5）与 T-07（d373b6b）的 main，新 head e4ff496984a49aff620c083b488db0ebe83f2e46（5a0f8fb + 4117b3e + e4ff496）。变化面核实：顶端提交 e4ff496 只加 tests/unit/p2temp.proc.mjs（+58，两条 R14 用例），产品代码零变化（src/p2temp/index.mjs 的 +26 来自已在 main 的 T-14，未再改）。

1. 全量：`vitest run --no-file-parallelism` → 15 files / 87 tests 全绿，exit=0（71.11s）。evidence/T-11/plain-run-e4ff496.log
2. 覆盖率复跑一次：`vitest run --coverage --no-file-parallelism` → 15 files / 87 tests 绿、exit=0、0 条阈值报错；src/ 四项 stmts 92.4%（231/250）/ branches 89.2%（124/139）/ funcs 95%（38/40）/ lines 94.97%（208/219）全部 ≥80；src/p2temp/index.mjs 56/56 stmts、8/8 funcs、31/31 branches = 100%（T-14 新增的锚定逻辑被搬入的两条 runner 用例满覆盖）。start.ts 90.37/93.33/87.13 与 rebase 前一致。evidence/T-11/coverage-run-e4ff496.log
3. T-14 用例语义未被削弱（逐断言对照 29d95c5 原版）：①「anchors relative and absolute insert names beside the patch」——fixture 与四组期望（./lib→patch 旁 file URL、../sibling→包父级 URL、/abs→绝对 file URL、裸名不动）与原版逐字等价，仅 expect→assert 适配 runner；②「anchors names inside nested group rows too」——三层嵌套（./lib/nested→URL、裸名不动、深层 ../deep.mjs→node_modules/deep.mjs URL）同样逐字等价；③第三条在 market e2e（connectors.test.ts「R14: a relative-path connector loads; its tool reaches the request tool table」）：真实 dsh 运行时内安装 relative-bundle fixture、经 createWithConnectors 建临时会话、断言 connector 工具进入 request tool 表——比 unit 更强的端到端语义，在全量中随跑随绿。runner 现 13 例 = 原 11 例 + R14 两条，原用例无删减（清单核对）。
