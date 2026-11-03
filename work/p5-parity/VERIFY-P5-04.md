verdict: PASS
commit: e5291aaf4716dcb3044fe7da727d9c1473b4f8ce（基 77067fb，worktree /tmp/bot-wt/P5-04，验收时工作区干净）

验收范围 = 派发 ①-④（arguments 级拒绝）；PLAN 行的 ④（dfa 启动态会话级）⑤（顺序格）已转 P5-04.f1，不在本次范围，未验。

| 验收项 | 结果 | 证据 |
|---|---|---|
| 前置：sdk 全量 29 files/231 绿（独立复跑，每次清 .test-homes/p5-04 后从零建） | PASS | evidence/P5-04/verify-runs.txt [1]：`Test Files 29 passed (29) / Tests 231 passed (231)`，38.10s |
| 前置：guard-escalation 单文件 4/4 | PASS | verify-runs.txt [2]：`Tests 4 passed (4)`；运行后 workspace 仅 leak-dfa-stock.txt + parity-marker.txt，guarded 侧无标记 |
| ① dfa bash 读哨兵 → deny + 字面串 + asked 0 + 标记不存在 | PASS | 测试 :228-239（isError、`p2sdk-fs-guard` 前缀、`escalation path not available`、askedFor===0、marker 不存在）；红基线 verify-runs.txt [3]：摘 dfa 判定后同调用 `expected 1 to be +0`（approval/asked 出现），加自动批准后 leak-dfa-guarded.txt 生成且内容===本轮哨兵（de5aa3）——拦的是真实「批准即无沙箱执行」路径；恢复后 4/4 绿 |
| ② dfa write/edit 工作区外 → deny（dfa 原因非路径原因）+ 无副作用 + asked 0 | PASS | 测试 :241-262（双工具 deny、not.toContain('masked area')、无新文件、原文件 sha256 不变）；红基线：摘判定后原因落 `is in a masked area`——dfa 判定先于 P5-02 路径判定 |
| ③ 差分 stock：同 bash 出卡恰 1，批准后 leak 文件===哨兵 | PASS | 亲自复核：断言 :273-276（asked 恰 1、marker 存在、内容 toBe(SENTINEL_CONTENT)）；本轮独立 cmp 哨兵 vs leak-dfa-stock.txt → IDENTICAL，且随机后缀 3d1e5a 同源（排除陈旧文件）——stock 下批准后是真实无沙箱执行（读到 wrapper 遮蔽的 $HOME/.ssh 哨兵） |
| ④ 普通不带参 bash 照旧出卡+批准执行；既有 approval e2e 抽 2 条绿 | PASS | 测试 :279-296（asked 恰 1、parity-marker.txt=p504-parity）；抽 approval.test.ts:246（D8 普通出卡-拒-批）与 :407（P5-05 R2 反转用例）各 1 passed——P5-04 合入下互斥区域照绿（G2-r2 #1 双原因枚举成立） |
| 区域：2 文件；dfa 判定位置 NEVER_TOOLS 后、路径判定前；字面串与 PLAN v2.1 一致 | PASS | `git diff --stat 77067fb..e5291aa` = guard.mjs +20 / guard-escalation.test.ts +296（新）；guard.mjs:210-215 位置正确、对任何工具生效（含 known 外的 bash）；`escalation path not available` 在 guard 与测试双侧同源；f1 的会话级检查（`session mode is not supported`、sandboxPolicy.resolve）未混入 |

红基线方法说明：guard 条件临时改 `false &&`、test ① 临时加自动批准回调，跑完 `git checkout` 恢复并重跑 4/4 绿、`git status` 干净——worktree 未留任何改动。

新问题：
- 无。（PLAN ④⑤ 两格欠账已在 P5-04.f1 立项，builder 报告如实申报未扩范围，非隐瞒。）
