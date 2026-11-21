verdict: PASS
commit: 08b1ae0dc906c52054c71d166c51d88deed0133a（feat/U-11，/tmp/bot-wt/U-11，worktree 干净）

## 复跑（真实环境，非 builder 转述）

| 命令 | 结果 | 证据 |
|---|---|---|
| `pnpm test`（app/ui） | Test Files 6 passed, **Tests 56/56** | evidence/U-11/unit-tail.txt |
| `pnpm test:e2e` | **9/9 passed**（含 origin-gate (e) 非主窗口 pbots:api 被拒） | evidence/U-11/e2e-tail.txt |
| `pnpm build` | main+preload+renderer 三段全绿 | evidence/U-11/build-tail.txt |

## 验收项

| 验收项 | 结果 | 证据 |
|---|---|---|
| ① 白名单 16 方法 = CONTRACT §2 业务表 | PASS | `M1_ALLOW`（index.ts:12-29）与 C §2 表 M1 行逐项核对：#1–7、9–16、18 恰 16 个（#8/#17 是 M2、#19/#20 是 M3、#21 不进白名单），零增减；快照断言 api.test.ts:49-68。表外 → `pbots/forbidden` + 日志含 endpoint + dsh 计数 0（api.test.ts:70-86） |
| ① D9 硬拒层四类 | PASS | `d9DeniedReason`（index.ts:35-44）纯函数直测 12/12 PASS：credentials/account、`/permission` 方法行、commands/execute 两位置（args.command / args.request.command）+ 数组首位、configForms；另验大小写绕过（`Credentials/`）与前缀伪装均拒（偏严方向）、`ls -la` 与 `session/prompt` 不误伤。见 evidence/U-11/probe-out.txt |
| ② installBundle 强制 enabled:false | PASS | 省略/`true`/非布尔三例 → `pbots/invalid-args`、dsh 计数 ===0（api.test.ts:125-136）；`enabled:false` 透传计数 1（:138-144）；args=null 探针也拒 |
| ② $events/result 约束 | PASS | value `'allowed-always'`/壳非法 → invalid-args；clientId 不匹配、eventId 未下发、已 cancel、二次作答、无 ready → forbidden，全部 dsh 计数 ===0（api.test.ts:147-201）；探针复核 U-15 ③ 原例（错 clientId → forbidden）PASS |
| ② code 分类裁定 | **一致** | 见下「裁定」 |
| ③ raw result 原样透传 | PASS | api.test.ts:241-246 失败结果（含嵌套 details）`toEqual` 原样；探针实证 `r.error.details === 上游对象`（同一引用，未压平未复制）；ok value 原样不过滤（:266-271）。dsh 计数 ===0 断言遍布全部拒绝测试（:77,85,100,110,135,152,159,166,181,209,227） |
| ④ 来源校验 | PASS | main/index.ts:118 `ipcMain.handle('pbots:api', (event, req) => { assertSender(event); return m1(req) })`——`assertPbotsSender` 先于 m1；e2e origin-gate (e)「非主窗口的 pbots:api 被拒」实测 PASS（625ms）。U-00 门控对 U-11 handler 生效 |
| ⑤ 导出接口消费面 | PASS | 导出 `M1_ALLOW` / `d9DeniedReason` / `registerM1Api` / `m1Ledger`。U-12：`m1Ledger` 共享实例供 tap 喂（测试 :281-289 验证未注入时走共享台账）；U-15：`registerM1Api({dsh})` 已在 main/index.ts:117 接线，ledger 联调走默认 m1Ledger，错 clientId → forbidden 口径探针已验 |
| ⑥ 区域 | PASS | `git diff --name-only 22f806f..08b1ae0` = 恰 2 文件（app/ui/main/m1-api/index.ts + app/ui/tests/unit/m1/api.test.ts）；worktree 无未提交变更 |
| #1 p2temp 过滤 | PASS | 仅 `agentPresets/list` 滤 `p2temp-*` 且不改写上游对象（不可变，api.test.ts:248-264）；其他方法 ok value 原样 |
| #3/#4 L2 约束 | PASS | `session/create` 传 `p2temp-*` → invalid-args；#4 connectors 空/非数组/含非字符串 → invalid-args，dsh 计数 0（api.test.ts:204-238）；#4 合法 args 原样透传 |

## 裁定：builder 的 code 分类与 U-15 ③ 口径一致

- 分界：outcome 壳/value 非法（数据形状）→ `pbots/invalid-args`；clientId/eventId 不匹配（作答资格）→ `pbots/forbidden`（index.ts:79-85 注释明示口径来源）。
- U-15 ③（PLAN.md:39）原文「用错误 clientId 调 $events/result → **pbots/forbidden**，dsh 计数 === 0」——精确吻合，探针复现实测 PASS。
- BRIEF D9 允许两种 code（「`'pbots/forbidden'`或`'pbots/invalid-args'`」），未逐例指定。
- 残留字面出入：CONTRACT §2 M1 行把「§2.2 不过」整体归 invalid-args（含 clientId/eventId），与 U-15 ③ 的 clientId→forbidden 字面冲突；U-15 ③ 是更晚、更具体的 director 口径，且语义上（资格 ≠ 形状）更站得住，以 U-15 ③ 为准。eventId 不匹配归 forbidden 是同一口径的推广，方向不违反 U-15 ③（它只点名 clientId），D9 亦接受。**无阻塞。**

## 坏路径（额外一条，实为三条）

1. **并发双答同一 eventId**（probe-out.txt 坏路径A）：`Promise.all` 并发两次 → 恰一个透传 dsh（计数 1）、另一侧 `pbots/forbidden`——「成功即消费」在并发下原子。
2. dsh.rpc reject（socket gone）：异常向上传播给 ipc handler，不吞、不伪 ok。
3. installBundle `args:null` → invalid-args、dsh 计数 0。

## 合规注记（非问题，不需修复任务）

- `configForms/read` 也拒：比 BRIEF D9 的「任何 configForms 写操作」更严（读也拒），安全方向；configForms 本就不在白名单，无论何种 code 结果都是 forbidden。
- `/^credentials/i` 前缀不锚定 `/`（`credentialsFoo/x` 也拒）：偏严方向，表外方法反正 forbidden，无放宽风险。
- e2e 走 tests/support/launch.ts 的 mkdtemp 临时 HOME（HOME/XDG_* 全覆盖），符合 LEARNINGS 2026-11-01 Grok Bot 隔离条。

新问题（每条一行，可直接成为修复任务）：
- 无。

复核指引：证据在 `work/p4-ui/evidence/U-11/`（unit-tail / e2e-tail / build-tail / probe-out）；探针脚本 /tmp/vfy-U-11/probe.mjs（bundle 自 m1-api/index.ts，esbuild 原生二进制在 node_modules/.pnpm/@esbuild+linux-x64@0.25.12/，pnpm 未跑 esbuild postinstall，.bin 链接是 JS wrapper 会报 ELF SyntaxError——复跑时直接用原生二进制路径）。
