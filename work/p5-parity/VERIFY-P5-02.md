verdict: PASS
commit: e0f6b010d3c8b97a71806f6dcaa9314543bf728d（worktree /tmp/bot-wt/P5-02，基 93cbc7b，3 commits；验收期间 head 未漂移、树干净；变异验红后已恢复，git status 空）

独立复跑（全部 HOME=/tmp/bot-P5-02/home，不信 builder 输出）：
- sdk 全量：**27 files / 223 全绿，第一跑即绿**（builder 注明的 never-roots「本机真实布局」偶发 flake 本次未出现）
- app/ui：build ✓（1.09s）；单测 **28 files / 245 全绿**；e2e 抽 journeys/d4-d5-d6-journey.spec.ts **1 passed**（13.7s，真实 Electron 全旅程）
- guard-fs.test.ts 单文件基线：**9/9 绿**（35.46s）

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| ① 9 类哨兵 × 7 入口 deny + asked 0 + 写类 sha 不变 + stock 逐格差分 | PASS | 基线绿；变异 M1（isError 改盼 allow）恰在 `home-cred/p5-02-30de43-0`（read 哨兵格）红：`expected true to be false`——deny 断言是活的 |
| ② 符号链接两格（bash 建链接 + 预置 masklink） | PASS | 基线绿；变异 M2 在 bash 建的 `credlink/sentinel-key` read 格红（realpath 解链后拒） |
| ③ 目录根（grep/glob path=$HOME、grep path=/ 拒；path=$CWD 正常） | PASS | 基线绿；变异运行中 ③ 仍绿（独立性） |
| ④ 路径形态（~ 展开、cd 后相对、glob ../ 与绝对 pattern） | PASS | 基线绿（cd 用 working_directory 真实改 cwd 后读相对路径） |
| ⑤ /proc environ（self + runtime pid grep 拒；stock 差分输出含哨兵值） | PASS | 基线绿；变异 M3 在 /proc/self/environ 格红 |
| ⑥ 例外（workspaceRoot 读写放行、同级/顶层/policy-state 拒、工具链只读、.condarc 拒、/tmp 数据根同规则） | PASS | 基线绿；变异 M4 在同级 other-bot read 格红 |
| ⑦ cwd=PKG_ROOT（edit guard.mjs、write bwrap-wrap.py 拒且 sha 不变；read 放行） | PASS | 基线绿（⑦ 在变异运行中也保持绿） |
| ⑧ 正对照（普通工作区 + /etc/hostname 读成功） | PASS | 基线绿 |
| ⑨ guard 行 config 覆盖为空 → launcher 非零退出报原因 | PASS | 基线 + 恢复后 `-t '⑨'` 专项复跑各一次绿；fail-loud 机制读码核实（start.ts:754-767，ready 后 3s 窗口监测 stderr 签名 → SIGTERM + 退出 1 + `guard plugin failed to activate; not serving`） |
| ⑩ containment 单测（..、大小写、末尾斜杠、缺失目标） | PASS | 全量套件内绿（27 files/223 含 tests/unit/containment.test.ts） |
| ⑪ 两包全量绿 | PASS | 本文件顶部复跑数字 |

单源核验（读码，evidence/P5-02/verify-runs.txt [8]）：
- 清单唯一定义在 `never-roots.mjs`；wrapper（start.ts#sandboxRow → bwrap-wrap.py argv）与 guard（start.ts#guardRow → config.roots）都只消费 `computeRoots` 产物；guard.mjs 不 import 清单，仅经 config 注入（缺失即加载失败，⑨ 实证）。无第二份清单。
- `/proc` 只进 `guardRoots.hardRoots`（never-roots.mjs:159），neverRoots/maskRoots 不含 → wrapper 拿不到；bwrap-wrap.py:104 把 `--proc` 透传给 bwrap（沙箱自挂新 procfs），wrapper 侧遮 /proc 会砸沙箱 procfs——划分合理，且文件工具 /proc 读洞由 ⑤ 实测堵上（stock 差分显示哨兵值可读、guard 侧拒）。

区域与顺序：
- 实际 **12 文件 +1273/-10** vs 申报头部「11 文件 +1264/-56」（申报逐条清单本身列了 12 项，头部计数笔误）；12 文件全部在申报范围（PLAN 区域 + 报告声明的 never-roots.mjs 与三处接缝）。
- approval.yml 实读：insert 列表 `p2sdk-fs-guard` 在 `p2sdk-shell-ask` 之前 ✓。
- 三处接缝 diff 逐行看过，均为诚实更新：mock-demo 把「两次 FS_NOT_FOUND」改成「相对读仍 FS_NOT_FOUND + env-derive 读被 guard 拒」（更强），token/handoff 不进 transcript 断言保留；sandbox-hardened 删除「guard.mjs 未被创建」（文件已落地，该断言必然假），同用例 errno30+sha256 证明保留；另两个为纯新增。

新问题（每条一行，可直接成为修复任务）：
- [FIX] REPORT-P5-02 头部改动计数 11 文件/+1264/-56 与实际 12 文件/+1273/-10 不符 | 复现：`git diff --numstat 93cbc7b..e0f6b01` | 疑似位置：work/p5-parity/REPORT-P5-02.md 头部 | 严重度: trivial（文档）
- [FIX] start.ts:696 guardFailed() 的 JSDoc 写「seen on stdout」，实际监测的是 stderr | 复现：读 start.ts:696 与 :679-683 对照 | 疑似位置：app/sdk/src/start.ts:696 | 严重度: trivial（注释）
（观察，未立任务：watchGuardFailure 按 stderr chunk 逐段做正则，签名行若跨 chunk 到达会漏配——⑨ 实测签名紧跟 ready 行整段到达，当前无实害。）
