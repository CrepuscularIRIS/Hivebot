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
