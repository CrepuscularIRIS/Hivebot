# VERIFY-U-19

verdict: PASS
commit: d88664b0360837e61be203fbcb0c9f97d07af4d8（验收期间 HEAD 未漂移，收尾复测一致）

验收对象：R1 connectors 名形状校验三道 + R10 审批作答先发送后消费（W1 预审 R1+R10）。
区域核对：8 文件（SDK 2：src/p2temp/index.mjs、tests/unit/p2temp.proc.mjs；UI 6：dsh/ledger.ts、m1-api/index.ts、m3-meta/orchestrate.ts 及三个测试文件）——`git show d88664b --stat` 逐一对上，无越界改动。

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| ①a SDK readConnectorRows 前置校验 | PASS | `/tmp/bot-wt/U-19/app/sdk/src/p2temp/index.mjs`：`BUNDLE_NAME_RE`（:118）在 readConnectorRows 开头先于一切文件访问（:122-127），非法名抛 `p2temp/connector-unavailable`。verifier 探针实测 15 个恶意变体全拒（evidence/U-19/red-traversal.txt）。 |
| ①b m1-api checkArgs 校验 | PASS | `app/ui/main/m1-api/index.ts`：导出 `BUNDLE_NAME_RE`/`invalidBundleNameReason`（:75-82），checkArgs #4 connectors 加形状检查（:120-122）。api.test.ts 新增 4 个逃逸名 case（../..、@p2/..、/abs/x、@a/b/c → invalid-args 且 dsh 计数 0）+ 合法 scoped `@p2sdk-fixture/demo` 透传 case，自跑通过。 |
| ①c orchestrate #4 入口自有校验 | PASS | `app/ui/main/m3-meta/orchestrate.ts:75-78` 调 `invalidBundleNameReason`（import 自 m1-api，与 ①b 同一函数同一正则）。必要性核实：main/index.ts wrapM1WithOrchestration（:90-102）拦截 #4 直达 createBotWithConnectors、return 处不落 base（不经 m1 checkArgs），入口校验必须自有——在位。orchestrate.test.ts 新增 4 case（含 Windows 反斜杠形态）自跑通过。 |
| ①d 三道一致性 | PASS | UI 两道共用 m1-api 导出的同一函数/正则；SDK 持逐字相同正则（跨包各持一份，注释互指：index.mjs:113-115 ↔ m1-api/index.ts:71-75），diff 逐字符比对一致。 |
| ①e 红实证（修前真读 profile 外） | PASS | verifier 在 detached worktree @1608d10 复现：`readConnectorRows(profile,'../..')` 真读到 profile 父目录的 package.json + evil.patch，返回 `[{"id":"pwned","name":"pwned-from-outside-profile"}]`；修后同一探针被拒。完整输出 `evidence/U-19/red-traversal.txt`。正则边界枚举：29 个恶意/畸形形态全拒、9 个合法形态全过（含现有 fixture 名 plain、broken-conn、@p2sdk-fixture/demo-mcp，不误伤）。 |
| ② R10 rpc 成功后才 consumeResult（失败保留可重试） | PASS | 代码：ledger.ts validateResult 拆为纯资格判定（:47-56 不再 delete）+ consumeResult（:58-61）；m1-api/index.ts:185-191 仅 `$events/result && result.ok` 才 consume，rpc throw 向上抛不消费。测试（api.test.ts:211-245，读测核对）：形态一 ok:false → 错误透传 + `pendingEvents` 保留 ev-1 → fail=false 重发 `{ok:true}` → pending 清空 → 同 eventId 第三次作答 `pbots/forbidden` 且 `dsh.apiCount===2`（没到 rpc）；形态二 rpc throw（'socket hang up'）→ pending 保留 → 重试成功下账。旁路核对：U-16 deadline 代答本就「rpc ok 才 record cancel 下账」（m2-mux/deadline.ts:75-86，不走 validateResult），R10 拆分不破坏；并发双发后到者 consume false 仅记日志。 |
| ③ 双仓全绿 | PASS | 自跑（不信 builder 输出）：app/sdk `./node_modules/.bin/vitest run` → **19 files / 137 tests 全绿**（60.1s）；app/ui 同法 → **18 files / 173 tests 全绿**（2.9s）+ 1 个 unhandled error。 |
| ④ wire.test unhandled error 与记档一致 | PASS | 该 error 源自 tests/unit/shell/wire.test.ts，verifier 在基线 1608d10（detached worktree）单跑该文件：同样 6 passed + 1 error——基线既有、非 U-19 引入。与记档一致：U-18 builder 回报（work/LOG.md:444「wire.test:107 unhandled rejection 系 1608d10 基线既有（m2-mux 常驻订阅循环）——记档待修（m2 域，U-17 在途不碰）」）+ U-19 commit 正文同源表述，两处口径一致。 |

坏路径（本任务最相关一条）：路径穿越逃逸——修前 `../..` 真读 profile 外文件（复现成功），修后连同绝对路径、反斜杠、多斜杠、编码绕过（`..%2f`）全被三道之一拒绝（①e 证据）。

新问题：无。

环境注记：验收全程 kill 零次；临时物（红 worktree /tmp/vfy-u19-red、探针目录 /tmp/vfy-u19-esc）已清理，测试用 `HOME=/tmp/bot-u19-vfy` 隔离。
