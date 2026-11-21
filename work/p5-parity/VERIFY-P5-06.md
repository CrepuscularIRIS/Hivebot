# VERIFY · P5-06（W1-AP-0 合并验收矩阵）

verdict: PASS
commit: c298eb2（feat/P5-06 @ /tmp/bot-wt/P5-06，基 7e7f267；验收时 HEAD 与申报一致，worktree 干净）

独立复跑环境：`HOME=/tmp/bot-P5-06-vfy`，vitest 5.0.5，node /usr/bin/node，boot `7.0.0-42-generic`，bwrap 0.9.0。

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| ① 入口×会话×凭证（11 类 × 7 文件入口 + bash cat/存在性/find/env；根 + 三类子会话；每格写死期望 + stock 差分） | PASS | 自跑 `pnpm -C app/sdk exec vitest run tests/e2e/w1ap0-matrix.test.ts tests/e2e/security/w1ap0-scan.test.ts` → 12/12 绿，⑧ 打印「共 514 格」；evidence/P5-06/verify/twofile-verbose.log |
| ② env 三哨兵 + /proc grep 差分 | PASS | ② 用 real provider + loopback stub：env 探针带 PROBE_DONE/PATH 存活证明、三哨兵 not.toContain、grep /proc deny 带 guard 原因、stock 差分 grep 真命中哨兵（test.ts:866-893）；同 log |
| ③ T-08 扫描 0 命中 + 正对照 | PASS | w1ap0-scan.test.ts 2 用例绿（③a 0 命中含 .zstd 会话帧前提断言；③b canary 正对照 FAIL 扫描）；同 log |
| ④ A4b loopback 全 errno 111 + 差分可连 | PASS | ④ 绿（标题即断言集）；同 log |
| ⑤ plugin_manager 三 action × 四会话 + profile 哈希 | PASS | 抽验读码：guard 字面串 + 不落 shell-ask（顺序回归哨兵）+ snapshotHome 递归 sha256 全树比对（test.ts:942-996）；同 log |
| ⑥ 外发链 provider 请求体 0 命中 + stock ≥1 | PASS | 读码 test.ts:998-1018（stub.bodies 逐请求体过滤、≥2 轮下限、stock 差分 toContain 哨兵）；同 log |
| ⑦ 数据根三格 + MASK 根，期望逐字写死 | PASS | 读码 test.ts:1098-1138（WARN 恰 1 行、三根同期望、MASK 根、stock 可见/读到）；⑦ 40 主 + 17 差分 |
| ⑧ 结论表 evidence/P5-06/matrix.md | PASS（带 2 条记账勘误，见下） | 514 格 = 我自跑 ⑧ 输出；399+115 语义分类成立但与代码 stock 标志口径不一（见新问题 1/2） |
| 独立复跑：两文件 12/12 | PASS | 首跑 76.4s exit 0（twofile.log）、复跑 76.8s exit 0（twofile-verbose.log），无 /tmp handoff ENOENT、无 policyRoots flake |
| 独立复跑：sdk 全量 31 files / 248 | PASS | `pnpm -C app/sdk test` → 31 passed (31) / 248 passed (248)，79.4s exit 0，一次过无 flake；evidence/P5-06/verify/full.log。真实 `~/.config` 零污染（无 pbots-ui 目录生成） |
| 区域：4 文件只加测试 + fake 观测通道 | PASS | `git diff 7e7f267..c298eb2 --stat` = 4 文件 +1391 全在 tests/；plugin.mjs +9 行仅把 tool/result 逐条记进观测日志（无分支、无行为注入），harness.ts +2 行纯类型 |
| P5-01.f2 复现（rc 漂移现象） | PASS（现象在，机制比报告多一层，见新问题 3） | 亲跑 3 次直驱 wrapper + 裸 bwrap：本 boot 一律 rc=1:empty；evidence/P5-06/verify/f2-repro.txt |
| 清单闭环前置（§2：无未关 .f） | PASS | matrix.md 发现 3 明示 11 类哨兵四会话全拒、零未关凭证路径 .f；matrix 全绿佐证 |

## 矩阵真实性抽验（非空转确认）

- **bash 凭证格**（①-bash, test.ts:546-580）：cat rc 逐类写死（expectProbe 对 cat.bashCat）、ppp 用不变量正则 `[01]:empty`；env 探针先断言 `PATH=`/`PROBE_DONE` 证明探针真跑再断言三哨兵缺席——防了「探针没跑→空输出→假绿」。
- **read 子会话格**（①-child, test.ts:658-699）：77 个 guard deny 精确计数、逐 deny isError、每类哨兵路径在 deny 文本点名 ≥4（proc 用 resolve 后的 `/proc/<dsh pid>/environ`）、bash 三探针落 shell-ask 恰 3、240 格数显式对账。
- **plugin_manager never 子会话格**（⑤, test.ts:964-994）：三 action 在 never 子会话必须含 `p2sdk-fs-guard` 且 **not** 含 `approval unavailable in this session`（P5-04f1 顺序回归哨兵）、asked 0、profiles 树 + runtime-patch.yml 递归 sha256 前后相等。
- **stock 差分格**（①-stock, test.ts:703-752）：逐格 `not.toContain('p2sdk-fs-guard')`、read `toContain('p506')` 真读到、find ≥1 真命中、子会话 bash 落盘文件 `toContain('p506-sentinel-ssh')` 真执行——stock 侧真命中，非空转。

## 格数对账说明（±组织差异）

- 总数 514 与我自跑 ⑧ 输出一致（`P5-06 矩阵：共 514 格`）。主格 399 = 77+21+240+4+4+12+1+40，逐段与 ⑧ tally 相符。
- 差分 115 是**语义分类**（①-stock 95 + ②1 + ④1 + ⑥1 + ⑦17）；但代码里 ①-stock 的 95 格 `cell()` 未传第三参（stock=false），⑧ 自己打印的是「含差分 20」。两个口径都自洽，但结论表与代码 tally 打架——见新问题 1/2（记账级，不动摇 514/红格 0 的实质）。

## P5-01.f2 复现详情（超出原报告的机制发现）

本 boot（7.0.0-42-generic）直驱 wrapper 3 次 + 裸 bwrap 多序对照：`--ro-bind /dev/null /etc/ppp/chap-secrets` 一律 rc=1:empty，cat stderr=`Permission denied`。关键：沙箱内 `ls -l /etc/ppp/chap-secrets` 是 `crw-rw-rw- 1,3 nobody:nogroup`——**遮蔽挂载本身在生效**（inode 已换成 /dev/null 设备节点），但 open 这个 bind 得 EACCES（同沙箱内 `cat /dev/null` 原生节点 rc=0，排除 procfs/dev 缺失）。即 rc=1 端的成因不是报告写的「遮蔽未生效」，而是「设备节点 bind 的 open 权限判定」；全局可读文件（/etc/hostname）同法也是 EACCES——**本 boot 连泄漏场景都被 EACCES 挡住**。rc=0 端本 boot 观察不到（不许重启），P5-01 证据目录也无历史 rc=0 记录，该端仅存于 builder 叙述。P5-06 的 `[01]:empty` 不变量对两端稳健，.f 保持开放是对的；f2 修复时按「设备节点 open 行为漂移」定位，别按「挂载丢失」找。

新问题（每条一行，可直接成为修复任务）：
- [FIX] matrix.md ①-stock 行计「115 差分」与该行自身明细（77+11+1+6=95）不符 | 复现：对照 verify/twofile-verbose.log ⑧ 输出「①-stock: 95 格」 | 疑似位置：work/p5-parity/evidence/P5-06/matrix.md 结论表第 4 行 | 严重度 low（笔误，总数 115=95+20 本身对）
- [FIX] ①-stock 95 格 cell() 未传 stock=true，⑧ 汇总打印「含差分 20」与结论表「差分 115」口径打架 | 复现：跑 w1ap0-matrix 看 ⑧ console 输出 | 疑似位置：app/sdk/tests/e2e/w1ap0-matrix.test.ts:709,724,731,735,749-750 | 严重度 low（纯记账，不影响断言强度）
- [FIX] P5-01.f2 诊断修正：rc=1 端 = 遮蔽挂载在生效但设备节点 bind open 得 EACCES（非「遮蔽未生效」），全局可读文件本 boot 同样 EACCES 无泄漏 | 复现：verify/f2-repro.txt（裸 bwrap --ro-bind /dev/null /etc/hostname → cat EACCES、ls 显示 crw 1,3） | 疑似位置：app/sdk/sandbox/bwrap-wrap.py hide_args；P5-01.f2 任务描述 | 严重度 info（f2 修复的定位输入）
- [FIX] 测试残留 /tmp/p2sdk-handoff-* 累积 3064 个目录（历次运行叠加，含死 launch-token）| 复现：`ls -d /tmp/p2sdk-handoff-* | wc -l`（本次验收已清为 0） | 疑似位置：tests/support/runtime.ts teardown 未覆盖全部退出路径 | 严重度 low（housekeeping；never-roots 已有 32 上限自保）
