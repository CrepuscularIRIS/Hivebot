# P5-28 安全 / 信任边界审查

- 席位：6.1 Sol；日期：2026-11-05；结论：**FAIL（2 条 CONFIRMED：1 条生产测试面暴露、1 条拒绝闭环回归）**。
- 范围：仅 `git diff c6aba1b..ec42304` 指定 6 文件；运行源码由 `git show ec42304:<path>` 提取，未修改产品或仓内测试文件。
- 已读 `work/LEARNINGS.md`、`VERIFY-P5-28.md`、全部指定 diff；沿调用链核对 sender、preload、window、socket、deadline、main 接线及实际安装的 dsh `0.2.2-alpha.2`（参考仓只作辅助）。

## 逐项结论

| 审点 | 判定 | 证据 / 边界 |
|---|---|---|
| 1a 谁能作答 | REFUTED：任意 webContents / 子代理伪造入口 | M1 IPC 先校验主窗口 webContents、主 frame、`pbots-app://app/`；4 类错误来源直调均抛拒。实际 gateway 非 owner、跨 Peer、失活 client 各被拒。不是仅知道 eventId/clientId 就能代答。 |
| 1b testAnswerEvent | **CONFIRMED S1** | 无生产门控；生产定义压缩后的 M2 仍挂 `globalThis.__pbotsM2.testAnswerEvent`，非法 answers 可跳过 M1，真实 gateway 接受并 settle。需要 main JS 访问权，未发现 renderer 到该 global 的通道。 |
| 2 审批语义 / id 碰撞 | REFUTED | 审批事件传 answers、提问事件传 allowed-once/rejected 都 invalid-args，dsh=0 且两条 pending 均保留；gateway 两类事件及不同 bot 共用自生成 UUID + pending 去重，调用方传入同名 eventId 不被采用。 |
| 3 原型 / 注入 | REFUTED：可达污染或键冒充 | 没有逐字段 hasOwn 检查，但问题 id 用 Set、eventId 用 Map，无对象键写入；`__proto__`/`constructor` 作 id 是惰性字符串，作额外自有字段被拒。继承属性仅同进程直调可通过，structuredClone 后丢失并被 M1 拒；Unicode 异形 / 规范等价但不同编码均不匹配。 |
| 4 fail-closed / 顺序 | **CONFIRMED S2**；合法批次的答案校验顺序无问题 | 解析后的非法答案矩阵全部拒绝、dsh=0、不下账；rpc throw/ok:false 保留 pending，成功返回后才消费。新增非法问题批次“不入账”却令 deadline 无从拒绝。 |
| 5 跨 bot / clientId / 持久化 | REFUTED：越权重放 | ledger 是 main 进程内全局 Map，跨 bot 共用、非持久化；事件属于整个 gateway 的 UUID 空间而非按 bot 重复编号。换 ready clientId 后旧 client 拒、新 client 可接手仍未决事件；消费后再答被拒、dsh 不增加。实际 gateway 二答即使返回幂等 ok，也只 settle 一次。 |

## 发现

### S1 · 生产构建保留结构化作答测试旁路（中，生产测试面暴露）
- 位置：`app/ui/main/m2-mux/index.ts:64-67,355-362`（diff 扩展类型）；新增 e2e `questions-answer.spec.ts:140-146` 使用该旁路。
- 精确边界：无门控 global 钩子及直通 rpc 逻辑在基线已存在；本次显式扩展为结构化 answers 并用于新功能验收，属于本次暴露的测试面，**不声称本次新增了 JS 后门，也不声称任意 renderer/SDK 扩展可调用**。
- 复现：`NODE_ENV=production` 下注册 M2，账上问题 id=q；同一 `{answers:[{id:'not-q',selected:[]}]}` 经 M1 → invalid-args、rpc=0；经 global 钩子 → rpc=1、实际安装 gateway 返回 ok 且 source.resolve 收到非法批次。
- 原因：testAnswerEvent 直接使用 main 的 owner Peer 调 `$events/result`，不经过 `invalidQuestionAnswersReason`、ledger 资格及消费逻辑；gateway 校验 Peer/投递资格，但不核对业务问题 id。
- [FIX] S1 中｜生产构建不安装 `testAnswerEvent`；测试专用安装须显式隔离，普通作答全部走同一 M1 校验入口；用生产构建断言钩子不存在。不要把“global 仅 main 可见”写成“生产钩子已禁用”。

### S2 · 非法问题不入账，反而绕过 deadline 的协议级拒绝（中，可用性 / 拒绝闭环）
- 位置：`app/ui/main/dsh/ledger.ts:23-30,123-128`（新增早退）；新测试 `tests/unit/shell/ledger.test.ts:138-154` 只验证“不入账”，未验证声称存在的 deadline 拒绝。
- 可达输入：`questions:[{id:'',question:'Q?'}]`。实际安装 `UserQuestionService.prototype.ask` 直调确实进入 waterfall；空字符串符合上游 string schema，服务不拒该 id（与空 questions 数组会被上游拒不同）。
- 差分复现：相同空 id waterfall，c6aba1b ledger pending=1，ec42304 pending=0；复用真实 `createApprovalDeadline`，无 renderer、main client ready，模拟时钟越过 deadline：非法批次 rpc=0；合法 q 对照 rpc=1 且 outcome.kind=rejected。
- 影响：主桥不会接受该批次答案，也不再发协议拒绝；非 timed、外部不取消的提问可持续挂起。不是审批放行，但不能称“交 deadline 到期拒绝”；VERIFY 的该表述不成立。
- [FIX] S2 中｜无法校验的问题批次也必须保留到协议拒绝完成的监督记录，或在接收时用 main 合法 client 显式发送 rejected 并处理失败；绝不以 result 放行。补“空 id → 最终 rejected”的定向闭环测试。

## 查过但未发现本次安全问题

- 审批 / 提问双向互斥；未知、已消费、错误 client、未 ready 的作答不可越过资格校验。
- 11 类非法 answers / outcome、漏答、多答、重复 id、错类型；均未进入 dsh，原 pending 不变。
- `__proto__` / `constructor` 键、继承属性、Unicode 异形体及 1 MiB custom 字符串：未发生污染、执行或错误 id 匹配。字符串无新增长度上限；本次仅实证其惰性透传，不把 1 MiB 成功等同于无限资源安全，也未凭猜测报 DoS。
- rpc 异常及失败保留 pending；校验在发送前，消费在成功后；无“先下账后校验”。并发多发依赖 gateway 单次 settle，实际二答仅 settle=1，不报历史并发行为。
- reload 不承诺所有旧 eventId 作废：仍未决事件会补发给新 client，合法接手不是重放；已经消费的事件不会再次恢复。ledger 无磁盘持久化或跨启动旧账恢复。
- sender 只接受主窗主 frame；preload 不暴露 main global；nodeIntegration=false、contextIsolation=true、sandbox=true、devTools=false。因此 S1 不外推成任意扩展 / webContents 越权。

## 实际运行证据

- 隔离目录 / cache：`/tmp/bot-rev-p528s`；运行时 load 约 8.6，只跑定向单测与 Node，无全量、无 e2e、无服务重启、无凭证读取。
- 准备：`TMPDIR=/tmp/bot-rev-p528s node /tmp/bot-rev-p528s/prepare.mjs`（提取 ec42304 源码；esbuild 生产定义压缩；仅 electron MessageChannelMain 作无副作用桩，未模拟来源校验或 gateway 规则）。
- 单测：`TMPDIR=/tmp/bot-rev-p528s node /home/lingxufeng/bot/app/ui/node_modules/vitest/vitest.mjs run --root /tmp/bot-rev-p528s --config /tmp/bot-rev-p528s/vitest.config.mjs` → **2 files / 82 tests PASS**。
- 探针：`TMPDIR=/tmp/bot-rev-p528s NODE_ENV=production node /tmp/bot-rev-p528s/probe.mjs` → **12 probes PASS**；摘要 `/tmp/bot-rev-p528s/results.json`。
- 差分 / 真 gateway：同环境运行 `/tmp/bot-rev-p528s/base-and-hook.mjs` → **2 CONFIRMED**：`tracked before (1), dropped after (0)`；`M1 denies (rpc=0), global hook settles real gateway (rpc=1)`。首次运行探针自身 execFileSync options 写错，修正后复跑成功，不计产品失败。
- 网关探针调用实际锁定包的方法、构造最小内存 Peer / pending 状态，未启动 SDK/Electron 或网络；不是完整 Electron e2e，也未声称跑过真实打包流程。主仓六文件 `git diff --exit-code` 为 0。
