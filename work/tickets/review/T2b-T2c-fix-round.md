# 修复复核轮 · T2b/T2c/T3b（reviewer 6.1 Sol，2026-11-06 03:11）

> 代录：reviewer 席输出要点，原文见其返回；探针在 /tmp/bot-rv2-E8rC/。REFUTED=旧问题已消除；CONFIRMED=仍有缺口或新增问题。
> 范围：feat/T2 63f3f70..18dd541、T3b 316b6c9。

- 1 端口恒绿：REFUTED 已闭合（负证：恢复宽松断言 → ⑥自检 exit 1）。
- 2 fs 未证走 ssh：REFUTED 已闭合（换 LocalFileSystem → ③b exit 1；PID 审计无混杀）。竞态另见新增中。
- 3 扫描盲区：REFUTED 已闭合（两轮 10 passed，双正对照+归零）。
- 4 快照：REFUTED 已闭合（旧扁平恢复 → ②自检 exit 1）。
- 5 digest 注释：REFUTED（对照 index.ts:312-316）。
- 6 中断兜底：监听/进程 REFUTED（三模式 clean=YES@0.1s）；**目录验收缺口 CONFIRMED/低**——term/kill 各留一个空目录，违反工单验收 4「无新增」字面，需经理豁免或返修；0.1s 是轮询标签非精确测量。
- 7 真实启动文件：REFUTED（strace 0 次、setup-failure 回滚干净、SetEnv 无注入面）。
- 8 第二条 SetEnv：REFUTED（单条生效；setpriv 2.39.3）。
- T3b：REFUTED 已闭合（四处口径一致、计数复核）。

新增发现：
- **CONFIRMED/高 并发目录误删**：ssh-host.ts:169,219-223 把全局 /tmp 差集当本实例所有——并发进程新建的 dsh-ssh 目录会被本进程 sweeper 删除（ownership.mjs 实证 SENTINEL_AFTER_SWEEP false）。应只登记有明确创建归属的目录。
- **CONFIRMED/中 ③b 调度竞态假红**：杀 master 后不等断连就读，可能拿到合法传输错 `write EPIPE` 而不匹配断言（kill-race 连续 3 次 exit 1）。应等明确断连态再断言。

总评：高1/中1/低1；T3b 可终验；T2b/T2c 处理并发误删与断连竞态、并裁决目录残留口径后过 manager 任务 B。

## 经理核实（任务 B，manager Opus 5.5，2026-11-06 03:20，feat/T2 @ 01b4dc6）

| # | 条目 | 经理结论 | 依据（经理亲自重跑，隔离 HOME/TMPDIR，`/tmp/bot-mgrB-*`） |
|---|---|---|---|
| 1–5、7、8、T3b | 旧发现闭合 | **REFUTED 维持** | ssh-host.test.ts 10/10 绿；M1（换 LocalFileSystem）→ 仅 ③b 红 `expected true to be false`（sawSuccess）；M2（stop 跳过 sshd kill）→ 仅 ⑥ 红 `expected ['3998131'] to deeply equal []`，变异后无存活（pdeathsig 收走）；strace 真实启动文件 0 次（trace 含 sshd/remote-home 行，非空跟踪），SHELL home/cwd=remote-home；setup-failure `PATH_RESTORED true / CHILDREN_ALIVE []`；T3b 验收 1–5 = 2/0/含 0 的反证行/7/1，LED 复数 `agentSkills:`=0、`.agentSkills=`=1 |
| 6 | 中断兜底 | 监听/进程 **REFUTED 维持**；目录残留 **CONFIRMED/低 → 豁免（A）** | 三模式 clean=YES；term/kill 各新增 1 个 `/tmp/dsh-ssh-*`，经理 stat：mode 700、entries=0（已按字面路径 rmdir）。裁决见 T2c 工单 accepted 行与 p9 PLAN §3 第 10 条 |
| 新-高 | 并发目录误删 | **已修，REFUTED（经理复验）** | 复核席 ownership.mjs 加正对照后重跑：`REGISTERED_FOREIGN_DIR false`、`OWN_DSH_DIRS_REGISTERED 1`、`SENTINEL_AFTER_SWEEP true`——外来目录不登记，本实例目录仍登记（exit 模式 dsh-ssh-new=0 印证）|
| 新-中 | ③b 竞态假红 | **已修，REFUTED（经理复验）** | race-fixed.test.ts 与现测试 diff 仅差 Atomics 注入行；注入 20ms 抢占连跑 3 次 10/10 绿；M1 仍红。EPIPE/ECONNRESET 入集不削弱证明：本机 fs 无管道可断，只有经 ssh 子进程的路径会出这两种错 |
| 新-低 | 硬杀残留口径 | 裁决 A（豁免） | 同上 |
