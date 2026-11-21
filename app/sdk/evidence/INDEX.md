# evidence/ 索引（D1–D8）

本目录放**随仓**的判定性证据（D1/D2/D8-approval 为完整记录，D3–D7 为索引页）；
原始输出（verifier 复跑日志、探针脚本、红绿留证）都在仓库的
`work/p2-sdk/evidence/`（work/ 不随 app 分发），验收结论在 `work/p2-sdk/VERIFY-*.md`。
逐条对应如下（相对路径均相对仓库根）：

| D | 判定（BRIEF §3.1） | 本目录文件 | 验收记录 | 原始输出（work/p2-sdk/evidence/…） |
|---|---|---|---|---|
| D1 | 一条命令起（钉版 + setup） | `D1.md` | `VERIFY-T-01.md` | `setup-local.*`、`setup-tmp.*`、`repos-baseline.txt` |
| D2 | 最小客户端真模型冒烟 | `D2.md` | `VERIFY-T-01.md` | `d2-real.out`、`real-ss.txt`、`mock-ss.txt` |
| D3 | 并发不串线 | `D3.md` | `VERIFY-T-04.md` | `t04-verify-rerun.txt` |
| D4 | per-session 配置 | `D4.md` | `VERIFY-T-05.md` | `T-05-full-suite.log`、`T-05-config-only.log`、`T-05-red-repro.log` |
| D5 | 重启存续 + 断线重连 | `D5.md` | `VERIFY-T-06.md` | `t06-full-suite.txt`、`t06-ondisk-decode.txt`、`t06-two-files-run.txt`、`t06-badpath-restart.*` |
| D6 | 市场连接器（真实源 N=111） | `D6.md` | `VERIFY-T-03.md`、`VERIFY-T-09.md` | `T-03/`、`T-09/`（两个子目录） |
| D7 | 测试绿（$OFFLINE + 覆盖率 ≥80%） | `D7.md` | `VERIFY-T-02.md`（+覆盖率达标 `VERIFY-T-11.md`） | `T-02-offline-equivalent.txt`、`T-02-stream-tests-verbose.txt`、`T-02-coverage.txt`、`T-11/` |
| D8 | 安全底线（审批 + 端口/鉴权/凭证不落盘） | `D8-approval.md`（审批半边）；端口/鉴权/凭证见右列 | `VERIFY-T-07.md`、`VERIFY-T-08.md` | `t07-red-baseline-repro.txt`、`t07-verify-rerun.txt`、`t08-full-suite.txt`、`t08-security-verbose.txt`、`t08-positive-control.out`、`t08-zstd-frames.out`、`t08-zstd-multiframe.txt`、`t08-rerun.out`、`t08-head.txt` |

D8 两半的分工：**审批**（普通 shell 必问、跨 session 不串、默认权限非 bypass）在
`D8-approval.md`（T-07 落地、T-12/T-12.f1 加固）；**端口/鉴权/凭证不落盘**
（loopback-only、401/403、zstd 多帧哨兵扫描 + 正对照）在 T-08，原始输出全部在
`work/p2-sdk/evidence/t08-*`（本目录不重复留副本）。

## 修复/加固任务留证（同样落在 work/p2-sdk/evidence/）

| 任务 | 内容 | 验收记录 |
|---|---|---|
| T-01.f1/f2/f3 | mux 断线健壮性 / 启动器锁与信号 / 凭证隔离 + snapshot 屏障 | `VERIFY-T-01.f1.md` 等（原始输出 `T-01.f1-*`、`t01f2-*`、`T-01.f3/`） |
| T-11 | D7 覆盖率达标 + 预存红修复 | `VERIFY-T-11.md`（`T-11/`） |
| T-12 / T-12.f1 | 安全默认值加固（handoff 随机化等）/ shell-ask 显式 approval=never | `VERIFY-T-12.md`、`VERIFY-T-12.f1.md`（`T-12-verify/`、`T-12.f1/`；本目录 `T-12.md` 为其红测试证据） |
| T-13(.f1) / T-14 | 锁一致性 / p2temp 相对路径锚定 | `VERIFY-T-13.md`、`VERIFY-T-13.f1.md`、`VERIFY-T-14.md` |
| T-16 | `p2temp/preset.ensure` + `presetIdOf`（重启恢复） | `VERIFY-T-16.md`（`T-16/`） |

出口汇合判定（$OFFLINE 全绿 + 覆盖率 + 方法差集 + D1–D8 逐条核对）按 PLAN 表下
执行，判定记录归 `work/p2-sdk/`，不在本目录。
