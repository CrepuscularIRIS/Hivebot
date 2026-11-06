# 批审 T1–T3 · 测试有效性（reviewer 6.1 Sol）

> 代录：reviewer 席输出原文，未经改写。该席受自身运行约束未写报告文件；探针输出在 /tmp/bot-rv-validity/（2026-11-06，或已被清理）。
> 审查提交：T1 `d9cd458`、T2 `63f3f70`。总评：**6 条 CONFIRMED（major 4、minor 2），4 条 REFUTED；T1 可进入验收，T2/T3 建议返修后再验。**

探针命令：`T=$(mktemp -d /tmp/bot-rvReplay-XXXX); mkdir -p "$T"/{home,tmp}; env HOME="$T/home" TMPDIR="$T/tmp" DBUS_SESSION_BUS_ADDRESS=unix:path=$T/nonexistent pnpm --config.verify-deps-before-run=false -C /dev/shm/bot-T2/app/sdk exec vitest run --config /tmp/bot-rv-validity/vitest.config.mjs --reporter verbose; rm -r "$T"`；各探针已分别运行，输出保存在 `/tmp/bot-rv-validity/`。

| Verdict / 定级 | 位置 | 证据、影响与建议 |
|---|---|---|
| **CONFIRMED / major** | `/dev/shm/bot-T2/app/sdk/tests/e2e/ssh-host.test.ts:128–133` | **端口检查恒绿**：connect 成功也 reject，随后只断言 rejects，因此端口未关闭照样通过。`validity.test.ts` R1 执行原断言，输出 `LISTENING=true original-assertion=PASS`。应仅接受 `ECONNREFUSED`，连接成功及 timeout 都必须失败。 |
| **CONFIRMED / major** | `/dev/shm/bot-T2/app/sdk/tests/e2e/ssh-host.test.ts:49–64` | **③没有证明 fs 经 SSH**：仅把夹具的 `SshFileSystem` 换为真正的 `dsh-fs-local`，原六格仍 **6 passed，exit=0**。复现文件 `/tmp/bot-rv-validity/local-fs.test.ts`，输出 `/tmp/bot-rv-validity/local-fs-output.txt`。marker 只证明 subprocess；fs 应增加远端独占资源或可失败的传输路径断言。 |
| **CONFIRMED / major** | `/dev/shm/bot-T2/app/sdk/tests/e2e/ssh-host.test.ts:118–127` | **进程检查看不到真实 remote helper**。`coverage.test.ts` R6 从私有 sshd 的真实后代树找到 helper，输出 `REAL-REMOTE-HELPER live=true fixture-path-match=false`。因此 helper 残留可绕过目录字符串扫描；这不是本次观察到实际泄漏。应跟踪已创建的 PID/后代及退出状态，而非只匹配 argv。 |
| **CONFIRMED / minor** | `/dev/shm/bot-T2/app/sdk/tests/e2e/ssh-host.test.ts:17–24` | **stat 快照不能证明真实 SSH 目录“一字未动”**。R2 对假目录执行相同快照函数，chmod `0600→0644` 并改嵌套文件后，输出 `original-snapshot=UNCHANGED`。实现符合工单指定快照，但证明范围被夸大；应收窄结论，或补递归元数据、权限及访问审计。未读取真实凭证内容。 |
| **CONFIRMED / minor** | `/dev/shm/bot-T2/app/sdk/tests/e2e/ssh-host.test.ts:111` | **“连接建立前拒绝”注释不成立**。R4 错 hash 确实拒绝 ready，但输出 `ssh-invocations-delta=2 server-auth=Accepted publickey`，说明 SSH 已认证连接。正确语义是远端 helper 启动并返回 hello 后、ready 放行前校验；修改表述，不应宣传为连接前校验。 |
| **CONFIRMED / major** | `/home/lingxufeng/bot/work/p9-dsh-integration/RE-skills.md:86–95,117` | **把 wire schema 可承载全文升级为“每次请求必内联全文”**。实跑 `LC_ALL=C grep -a -c 'AgentSkill\|1 full_path 9\|2 content 9'` 对 LED 的普通字面版本命中 **1**；上下文只是 proto 定义。另查 LED：`agentSkills:` 为 **0**，`.agentSkills=` 唯一命中是构造器初始化 `[]`。这些证据没有证明请求装配和发送频率；应降为推断，不能据此坐实与 dsh 投递机制不等价。 |
| **REFUTED / 无缺陷** | `/tmp/bot-wt/T1/app/sdk/` | 已逐项核对 17 文件 diff，未发现断言删除或语义替换错误；隔离执行 `vitest run tests/unit tests/market` 得 **33 files / 591 tests passed**，仅余 `node-compile-cache`；另跑 `mock-demo.test.ts -t min-client` 得 **1 passed / 8 skipped**，`p2sdk-work-*` 残留 **0**。 |
| **REFUTED / 无缺陷** | `/dev/shm/bot-T2/app/sdk/tests/support/ssh-host.ts:69,113` | **marker 本身未发现本机继承注入路径**。R3 输出 `local-mark=EMPTY remote-mark=MATCH client-env=UNSET`；本机普通 subprocess fallback 会失败。它是有效的进程负对照，但不是 fs 证明，也不是不可伪造的安全认证。 |
| **REFUTED / 无缺陷** | `/dev/shm/bot-T2/app/sdk/tests/support/ssh-host.ts:107–111` | **`AllowTcpForwarding local` 偏离有实证依据**。R7 改回 `no` 后输出 `hello=READY small-fs=PASS subprocess-stream=REJECTED sshd=request was denied`。保留 local 合理；本验收明确不覆盖“禁 TCP forwarding 的产品环境仍可用”。 |
| **REFUTED / 锚点真实** | `/home/lingxufeng/bot/work/p9-dsh-integration/RE-skills.md:34,40,49–54` | Q2 的 Add 请求、CTX `content:le(e)}`，Q3 的 `ProposeSkills:"ProposeSkills"`、skill review change 均按要求执行普通 `LC_ALL=C grep -a -c`，各输出 **1**，并核对上下文：分别属于内容提交/导入快照、工具枚举/审阅协议；未发现这几处锚点伪造或语境错配。 |
