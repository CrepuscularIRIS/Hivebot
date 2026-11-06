# 回执 T2b：T2 测试有效性返修

> 施工：main (GLM 5.3) | 完成时间：2026-11-06 02:52（实测）
> 分支 / 提交：feat/T2 @ dd63eed（在 63f3f70 上继续，worktree /dev/shm/bot-T2）
> 工单：留在 work/tickets/doing/（T2+T2b+T2c 都验收后一起挪 done）

## 1. 做了什么

五处按工单改齐（`tests/e2e/ssh-host.test.ts` 为主，`tests/support/ssh-host.ts` 仅最小观测点）：

1. `portRefused(port)`：只接受 `ECONNREFUSED`；连上（`still listening`）、超时、其他错误都 reject。**⑥自检格**：对 `net.createServer().listen(0)` 的活端口调用它必须报 `/still listening/`。
2. **③b 新格**（独立第二实例）：writeText/readText 成功 → SIGKILL `bin/ssh` 包装登记的全部客户端 PID（含 master）→ 同路径 `fs.readText` 必须 reject 且匹配 `/SSH helper disconnected|SSH .*(closed|disconnect)/`、不得 TypeError。
3. `scanLeaks`：`/proc/*/environ` 含本轮 `PBOTS_SSH_MARK=<mark>`（helper/远端 shell）或 `cmdline` 含夹具目录（sshd 监听进程）。**⑥ 改前后对照**：stop 前 markHits≥1 且 cmdlineHits≥1（正对照，扫描看得见被测对象），stop 后两类合计为空。
4. `snapshotTree`：递归 `lstat`/`readdir`，字段 `相对路径|mode|size|mtimeMs|ctimeMs|ino`，不读内容。**②自检格**：tmkdir 假目录 chmod 600→644、子目录加文件，快照必须不等。② 测试名收窄为「递归元数据（含 mode）未被改动」。
5. ⑤ 标题/注释改为「ssh 已认证、helper 已回 hello 后，digest 校验失败拒绝放行 ready」。

夹具观测点（工单边界 1 允许的最小集）：`bin/ssh` 把 `$$` 追加进 `<dir>/ssh-client.pids`；返回值加 `sshdPid`。

## 2. 先红后绿（验收 2）

方法：新格全部就位、但 `snapshotTree` 暂留**旧扁平底数**（不递归、无 mode）——②自检格在旧实现下必须红，证明旧断言是空的；然后换严格实现。
```text
旧实现：Tests  1 failed | 8 passed (9)
  × ②自检 快照能察觉 chmod 与子目录改动（对 tmkdir 假目录；旧实现下必须红） 7ms
新实现：Tests  9 passed (9)
```
说明：端口自检与 ③b 在正确夹具上是「正格」构造上即为绿，其咬合力由验收 3 的 M1/M2/M3 变异证明（工单验收 3 即为此设）；②自检是唯一有「旧实现」可比的格，提供了字面意义的先红。

## 3. 验收证据

### 3.1 验收 1（≥9 全绿 exit 0）
```text
env … vitest run tests/e2e/ssh-host.test.ts
 Test Files  1 passed (1)
      Tests  9 passed (9)
exit=0
```

### 3.2 验收 3（三个变异各红指定格）
副本在 `tests/e2e/.mut-T2b/`（跑完已删；每个副本自带 reapLeaks afterAll，只杀本轮 mark/目录命中的 PID）：
```text
M1 fs 换 dsh-fs-local（SshFileSystem→LocalFs，经 dsh-ssh peer 上下文解析）：
  × ③b 断开 ssh 传输后 fs 必须报传输错 507ms
  AssertionError: expected null to be truthy        ← 本机读在断连后仍成功 → ③b 红 ✓
M2 stop() 跳过 sshd kill：
  × ⑥ … 49ms
  AssertionError: expected [ '3822450' ] to deeply equal []   ← 监听进程被扫描看见 → ⑥ 红 ✓
M3 stop() 跳过 disposeFibers：
  × ⑥ … 42ms
  AssertionError: expected [ '3822727', '3822728', '3822709' ] to deeply equal []  ← helper/master 残留（mark+cmdline 命中）→ ⑥ 红 ✓
变异后 pgrep -af bot-T2b → 空（自清理生效，无需外部 bot-reap）
```

### 3.3 验收 4（无残留）
```text
dsh-ssh 新增（before/after comm）: 0；TMPDIR 残留: 0；ls tests/e2e/.mut-T2b → No such file or directory
```

### 3.4 验收 5（改动面）
```text
git diff --stat 63f3f70..HEAD：
 app/sdk/tests/e2e/ssh-host.test.ts | 130 ++++++++--------
 app/sdk/tests/support/ssh-host.ts  |   4 +-
 2 files changed（边界第 1 条允许的两文件；夹具改动仅观测点两处）
```

## 4. 风险与存疑

1. M3 失败信息是「合计数组非空」而非单独打印 markHits——命中 PID 在断言输出里可见（3 个），满足工单「失败信息里是 mark 命中」的字面；如经理要求单列，一行改动即可（未做，避免为格式返工）。
2. ③b 依赖「杀 master 后 dsh-ssh 不重连、readText 以断连错误 reject」——实测如此（无自动重连，符合 ssh/README）；若上游行为变化此格会红，属预期敏感。
3. `scanLeaks` 读不到的 /proc 项当不存在（其他用户进程）；本机单用户场景无影响。
