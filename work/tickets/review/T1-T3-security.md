# 批审 T1–T3 · 安全（reviewer 6.1 Sol）

> 代录：reviewer 席输出原文，未经改写。该席受自身运行约束未写报告文件；探针脚本/输出散在 /tmp/bot-rvS-*（2026-11-06，或已被清理）。
> 审查提交：T1 `d9cd458`、T2 `63f3f70`、T3 `RE-skills.md`。总评：**发现 3 条，全部 CONFIRMED：critical 0 / major 2 / minor 1。T2 暂不通过；T1、T3 安全方向可进入验收。**

复现前置：`T=$(mktemp -d /tmp/bot-rvS-XXXX); mkdir -p "$T/tmp" "$T/home"`；下列命令均使用 `HOME=$T/home TMPDIR=$T/tmp DBUS_SESSION_BUS_ADDRESS=unix:path=$T/nonexistent`，完成后删除 T；自建进程已用 `/home/lingxufeng/bot/scripts/bot-reap` 清理。

| 审点 | Verdict / 定级 | 证据、影响与建议 |
|---|---|---|
| T2① 监听与生命周期 | **CONFIRMED／major，发现1** | `/dev/shm/bot-T2/app/sdk/tests/support/ssh-host.ts:118–139,162–204`。运行隔离环境下的 `python3 -I /tmp/bot-rvS-signal.py "$T"`，输出 `KEY_DIRECTORY_AFTER_SIGTERM True`、`LISTENER_OPEN_AFTER_SIGTERM True`；正常 `process.exit(17)` 不调 stop，也留下监听器。启动后缺少进程中断兜底；需外层监管清理自建 PID/目录。正常配置实测仅监听 `127.0.0.1` 随机端口、密码与交互认证关闭。 |
| T2② TCP 转发偏离 | REFUTED：未发现新增越权；跨用户猜端口仅 PLAUSIBLE | `/dev/shm/bot-T2/app/sdk/tests/support/ssh-host.ts:95–115`。`/tmp/bot-rvS-security.mjs normal` 实测持有效钥执行 `ssh -W` 得到自建服务的 `PRIVATE_TEST_CANARY`；错误钥输出 `WRONG_KEY_REJECTED true`。`PermitOpen any`，持钥者可连 sshd 能到达的 TCP/Unix 服务；ForceCommand 不拦转发，也不限制持钥者执行 shell，但均无新增用户权限。其他用户可扫描 loopback，未实测跨用户扫描；目录权限阻止其直接读取密钥。 |
| T2③ ForceCommand 与 HOME | **CONFIRMED／major，发现2** | `/dev/shm/bot-T2/app/sdk/tests/support/ssh-host.ts:84–90,113–115`。用 `strace -f -e trace=openat,chdir` 运行 `/tmp/bot-rvS-security.mjs normal`，记录两次 `openat(...,"/home/lingxufeng/.bashrc",O_RDONLY)=3`；远端 `cwd=/home/lingxufeng`。外层 Bash 在包装脚本重设 HOME 前已读取真实启动文件，违反隔离基线；未读取其内容入模型，未证实凭证泄露。仅对生成配置的探针将 HOME 合入首条 SetEnv 后，真实 `.bashrc` 打开数降至0；还应将执行 cwd 收到隔离目录。命令实测以 uid1000 执行，未发现额外注入或提权。 |
| T2④ PATH 作用域与恢复 | 正常路径 REFUTED；异常归入发现1 | `/dev/shm/bot-T2/app/sdk/tests/support/ssh-host.ts:159–183,188–214`。隔离环境执行 `pnpm --dir /dev/shm/bot-T2/app/sdk --config.verify-deps-before-run=false exec node /tmp/bot-rvS-security.mjs setup-failure`，输出 `SETUP_ERROR probe: helper resolution failed`、`PATH_RESTORED false`、`CHILDREN_ALIVE [3634910]`。异常发生在现有 try 之前，需扩大回滚范围；正常 stop 输出 `PATH_RESTORED true`。PATH 修改仅在该进程，未修改父 shell；未发现其他隔离测试文件的跨进程污染证据。 |
| T2⑤ 私钥与文件权限 | REFUTED | `/tmp/bot-rvS-security.mjs normal` 实测根目录700，host/client 私钥、authorized_keys、known_hosts 均600；每次启动重新生成密钥及授权文件。输出 `PRIVATE_KEY_IN_SSHD_LOG false`；检查回执及定向 Vitest 输出未见私钥内容。中断残留已计入发现1，不另计。 |
| T2⑥ 新依赖来源 | REFUTED | `/dev/shm/bot-T2/app/sdk/package.json`、`/dev/shm/bot-T2/app/sdk/pnpm-lock.yaml`：四包均精确钉版；安装包与 `/home/lingxufeng/bot/repos/deepseek-harness/packages/ssh/` 的 name/version/repository/directory 一致；逐包查询 npm registry，四个 integrity 均与锁文件一致。新增包记录只有这四包，其运行依赖复用已有 schemastery/zod，未见新增安装脚本；此结论不等于 Git 源码到发布包的可重现构建证明。 |
| T1 自清理与登记簿 | REFUTED | `/tmp/bot-wt/T1/app/sdk/tests/unit/market-wrapper.proc.mjs`、`/tmp/bot-wt/T1/app/sdk/tests/unit/p2temp.proc.mjs`、`/tmp/bot-wt/T1/app/sdk/tests/support/p626t-regression.mjs` 的 regTmp 调用只接本地 mkdtemp 返回值；`/tmp/bot-wt/T1/app/sdk/examples/min-client.mjs:28–30` 只删自建 work。实跑 tmp-sweep **4 passed**（含未登记兄弟目录幸存断言）、p2temp **27项成功且残留0**、min-client **1 passed且工作目录残留0**；默认 SIGTERM 不清理属已披露限制，未发现误删非自建路径。 |
| T3 文档泄露 | REFUTED | 全文检查 `/home/lingxufeng/bot/work/p9-dsh-integration/RE-skills.md`：内容为产物路径、代码锚点、协议字段和结论；未发现实际凭证值或个人信息泄露。 |
| T2 清理测试有效性 | **CONFIRMED／minor，发现3** | `/dev/shm/bot-T2/app/sdk/tests/e2e/ssh-host.test.ts:128–133` 的成功连接、连接错误和超时均 reject，随后 `.rejects.toThrow()` 全部接受。运行 `pnpm --dir /dev/shm/bot-T2/app/sdk --config.verify-deps-before-run=false exec vitest run --config /tmp/bot-rvS.config.mjs`，探针 `/tmp/bot-rvS-assertion.test.ts` 明确确认端口开放，原断言仍 **1 passed**。应只接受 `ECONNREFUSED`，开放与超时必须失败；原六格独立复跑 **6 passed**，不能证明上述安全边界成立。 |
