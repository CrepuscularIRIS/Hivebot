# VERIFY · P5-H1 测试运行时清理

verdict: PASS
commit: f2831a86b53b36d74516c6bda97b0d14bb013d94   # feat/P5-H1 @ /tmp/bot-wt/P5-H1，基 92d0cc8，验收期间无漂移

独立复跑（私有 TMPDIR=/tmp/bot-vfy-h1/{sdk,ui}，隔离并行污染），证据明细：`evidence/P5-H1/vfy-commands.txt`。

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| sdk 全量绿（期望 32/253） | PASS | `TMPDIR=/tmp/bot-vfy-h1/sdk pnpm test` → 32 files / 253 tests passed，88.65s |
| sdk 跑完四类前缀残留=0 | PASS | p2sdk-runtime- 0 · p2sdk-handoff- 0 · bot- 0 · p2sdk-fake-patch- 0（find 实数，见 evidence） |
| ui unit + e2e（Xvfb）绿 | PASS | unit 29 files / 249 tests；`pnpm build` 后 `pnpm test:e2e`×2 遍均 61 passed，无 failed/flaky 行 |
| ui 跑完四类前缀残留=0 | PASS | 四类全 0；TMPDIR 仅剩 5 项浏览器/工具缓存（.org.chromium.Chromium.*、*-transform-cache 等） |
| 机制：只删登记过的（对照单测在位且绿） | PASS | 两包 tmp-sweep.test.ts 各 4 例绿，含「同前缀未登记兄弟目录幸存」；另 3 例：登记即清 / 失败只 warn / 幂等 |
| 机制：wrap 抽验 tmkdir 替换 | PASS | runtime.ts（p2sdk-runtime-/p2sdk-handoff-）与 settings.spec.ts（bot-u23-ws-）diff 均为 mkdtempSync→tmkdir；vitest setupFiles afterAll + playwright exit 钩子双路接线在位 |
| 区域 43+2、无产品代码 | PASS | bae5a1c=43 files +327/-120（与申报逐字一致），f2831a8=2 files +18/-1；全部在 tests/ + vitest.config.ts，runtime.ts 属 tests/support 且仅登记钩子 |
| 偏差合理（restart 类需 home 存活） | PASS | settings.spec.ts:147 同 home 重启、restart.test.ts:203 killTree9 后 bootHome(home,…) 复用并断言历史——立即删必断用例 |

新问题（每条一行，可直接成为修复任务）：
- [FIX] sdk 全量后仍有 147 个动物园前缀临时目录（p5-01-patch×14、p2sdk-t08×14、u25-home×11 等，restart.test.ts:192 等约 60 处 spec 级 mkdtemp 未 wrap）| 复现：私有 TMPDIR 跑 app/sdk 全量后 `ls | grep -v node-compile-cache | wc -l` | 疑似位置：app/sdk/tests/e2e/*.test.ts 散点 mkdtempSync | 严重度 L（builder 已申报为后续任务，同 tmkdir 机制机械 wrap）
- [FIX] examples/min-client.mjs:28 子进程建目录登记不可见 | 复现：跑 e2e 观察该脚本产生的 tmp 目录不进登记簿 | 疑似位置：app/sdk/examples/min-client.mjs | 严重度 M
- [FIX] ui e2e visual-hairline #55 输出带 ✘ 记号但计 passed，易被误读为 flake | 复现：list reporter 跑 tests/e2e/visual-hairline.spec.ts 看 #2 用例 | 疑似位置：app/ui/tests/e2e/visual-hairline.spec.ts:59 test.fail 预期失败标记（P5-14.f1 落地后需删除，main 既有，非本分支引入）| 严重度 S
