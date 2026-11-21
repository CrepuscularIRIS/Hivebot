# VERIFY · P5-W3.f3（L-8 FAIL 修复链）

verdict: **PASS**
commit: `6ffce9c2c15f628c3d6fe8c455d9dda4b8c484bc`（worktree `/tmp/bot-wt/P5-W3f3`，分支 `feat/P5-W3f3`；验收期间 head 未漂移、树干净）

- 验收时间 2026-11-04 06:23–07:10。负载说明：全程 load 25–58（用户游戏 8 核 + GPU 训练 + 并行 P6-21 验收会话），iowait=0；所有套件在等待 ~9 分钟 load 不降后照跑，绿结果均在无并发 vitest 干扰的空档取得（见第 6 项注释）。
- 方法：base(`92cb6af`) 红线独立复现 + head 真实产品源码实测（不用测试副本、不贴 builder 输出）。证据 20 件在 `work/p5-parity/evidence/P5-W3f3-vfy/`。
- UI 项说明：R2/R3 的验收面是投影数据层（派发项给的是 summary/output 的确定值），用真实 `overrides/modules/model.ts`（esbuild 打包后 node 执行）+ 真实 `view.tsx` 的 `detail = summary || diff || output` 取值链验证；view.tsx 属 renderer-grok 上游（`pnpm check` diff=0 证明未被本链触碰），渲染层由 68 例 e2e（真 Electron+xvfb，含 visual 系）在新构建上全绿背书。

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| R1 policy-state 曾 provision 后被删除 → 文件门 fail closed；missing 语义不回归；标记+latch | PASS | ① base 红线（`repro-base.log`）：provision paused→删除后 ask 会话 read/write 由出卡变 NEXT（静默放行）、never 会话由 deny 变 NEXT（委派子代理文件工具复活）——L-8 两条失败路径均独立复现。② head 实测（`repro-head.log`，18/18）：删除后 ask 会话 read/write 仍出卡、never 仍 deny；伴生标记 `.p2sdk-policy-state-seen` 落盘且只出现在真有状态文件的 data 目录；**状态+标记双删后同进程仍出卡（进程内 latch 守住）**；重启（新 apply 闭包）凭标记仍出卡；missing 目录 read/write 放行且 data 目录零伴生文件（Q-013 偏离语义未动）；有效状态（paused:false）放行不回归。③ 字面跨进程核查（`restart-phase.mjs`）：进程 A provision→触发标记→删状态→退出，全新进程 B read/write 均出卡，仅凭磁盘标记。④ 单测覆盖：`policy.test.ts` 新 4 例（含 SDK restart 例）随套件绿。申报上限（数据目录整棵轮换清空→回 missing，由 P5-29 写端自愈）实测行为与申报一致，不判缺陷 |
| R2 args=JSON null/非对象 JSON/非 JSON 投影不抛；毒条目隔离；持久化毒条目 reload 可加载 | PASS | ① base 红线（`probe-base-ui.log`）：args='null' 抛 `TypeError: Cannot read properties of null (reading 'command')`，与 L-8 复现一致。② head 实测（`probe-r2r3.log`，22/22）：'null'、'"str"'、'[1,2]'、'123'、'not json {'、'' 六形状全部不抛且附卡 output 可见；毒条目（args getter 抛 / 上游投影抛）进 feed/page 聚合只跳过该条、好条目与游标存活；**持久化 args='null' 毒条目经 `projectTranscriptPageResult`（reload 首页路径）整页可加载**、毒条目附卡仍显示错误输出。单测 3 例随套件绿 |
| R3 decision 不遮输出 | PASS | ① base 红线：decision='allowed-once'+result='FULL STDOUT OUTPUT' → detail 渲染 'allowed-once'（`probe-base-ui.log`）。② head：同输入 summary=''、view 取值链 `summary||diff||output` 得全文；rejected+result null/'' → summary='rejected'（拒绝原因可见不回归）（`probe-r2r3.log`）。单测 2 例随套件绿 |
| R4 claimLivePermit 原子抢占恰一次；wrapper 认领不破 | PASS | ① base 红线（`repro-base.log`）：一张许可两次同命令 bash 均放行。② head 实测（`repro-head.log`）：第 1 次 NEXT、第 2 次出卡（非静默执行）；permit-* 消失、claim-*.json 存在且 session/argvHash 不变。③ **并发抢占**（`race.out`）：8 个独立进程同抢一张许可 → 恰 1 WIN / 7 LOSE，rename 原子性实测。④ wrapper 独立对拍：真 `python3 -I` importlib 加载 `bwrap-wrap.py`，对 SDK 抢占后的 claim-*.json `claim_permit` dry-run matched=true（session/argvHash 命中）；并核对 wrapper 扫描一切 `.json`、过期即删（TTL 清理覆盖 claim-*），联网授权不失。单测 5 例（含 python3 对拍）随套件绿 |
| O2 CoordinatorPortBridge 类型不悬空 | PASS | ad-hoc tsc（继承 app/ui tsconfig、include overrides+shim、`types:[]`，L-8 同法）：`coordinator-client.ts` 与 `modules/model.ts` **零报错**，全图无 TS2459；其余 16 错均在其他文件（market-store TS7016 等，报告已记为基线既有）。检测方法有效性已验证：探针按 base 旧写法 import 该类型 → 精确报出 TS2459（`o2-tsc.out`） |
| 全量回归 | PASS | SDK `pnpm test`：**37 文件 328/328**（205 单测 + 123 e2e；≥319，含本链新增 9 例单测；`sdk-full2.log`）。UI 单测：**37 文件 410/410**（≥405，基线 405+新增 5；`ui-unit.log`）。`pnpm build` 后 e2e：**68/68**（10.4m，out/ 时间戳 06:53 全新；`ui-build.log`/`ui-e2e.log`）。`renderer-grok check`：**upstream diff=0: 332 files**（`rg-check.log`）。注释：SDK 首跑 324/328（4 红）系并行 P6-21 验收会话共享固定 `.test-homes/p5-*` 互踩（哨兵随机后缀串台实锤：期望 cd3138 读到 a1cf64；当时 pgrep 见 P6-21 会话 vitest 在跑）+高载；3 个涉事文件单独重跑 **26/26**、空档全量重跑 **328/328**，与本链改动无关 |
| diff 纪律 | PASS | `git diff 92cb6af..6ffce9c --name-status`：恰 7 文件 = 产品 4（request-net.mjs / shell-ask.mjs / coordinator-client.ts / model.ts）+ 测试 3（policy.test.ts / request-net.test.ts / p5-w3f3.test.ts 新增）；测试文件删改仅 import 行扩充，无既有用例删除；零触碰 orchestration/ 与 P6-15 区域（entries/sidebar） |

新问题（每条一行，可直接成为修复任务）：
- [FIX] SDK e2e 固定 TEST_HOME（`/home/lingxufeng/bot/.test-homes/p5-*`）跨会话并发互踩，两会话并行跑 e2e 时假红（本次 4 例，哨兵随机后缀串台） | 复现：两会话同时 `pnpm -C app/sdk vitest run tests/e2e/guard-*.test.ts` | 疑似位置：app/sdk/tests/e2e/guard-escalation.test.ts:40 等固定 TEST_HOME 常量 | 严重度 minor（测试基建，改 per-run 临时根或文件锁）

无阻塞问题。申报的两条已知上限（数据目录整棵轮换丢标记→回 missing 由 P5-29 自愈；wrapper read→unlink 与 SDK rename 竞争窗口联网可能落在另一条等价调用上）实测行为与申报一致，单次使用不变量均守住，不判缺陷。
