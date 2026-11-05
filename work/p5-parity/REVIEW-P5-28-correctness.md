# P5-28 正确性 / 回归 review（Sol）

结论：FAIL，2 条 CONFIRMED（均中等）；未发现审批行为回退。仅评价 `c6aba1b..ec423041ba93414336d214b4d671fdc64b2098c3` 指定六文件增量。
已读 LEARNINGS、VERIFY-P5-28 及六文件 diff；被测六文件与 ec42304 完全一致（`git diff --exit-code ec42304 -- <六文件>` 返回 0）。
仓根 `/home/lingxufeng/bot`；下文代码位置相对仓根，报告与证据均在主仓；未改产品/原测试、LOG 或 PLAN。

## 逐项结论

| 审点 | 结论 | 实证 / 边界 |
|---|---|---|
| 1 answers 透传、同批 id | PASS；部分匹配/乱序/重复答案导致错配的疑点 REFUTED | 反序 answers 原样透传；缺 id、多 id、重复 id、另一批仅部分重叠均本地拒绝，dsh=0；expected 取当前 eventId 的 questionIds。 |
| 2 消费时序、二答、reload | 时序正确；并发二答拒绝 CONFIRMED 不成立（F1） | RPC ok 才主动消费；ok:false/throw 保留可重试；成功后串行二答及更换 ready clientId 后二答均拒绝。两个在途调用则都透传且都可获 ok:true。 |
| 3 类型外 invalid 矩阵 | 常规坏形状拒绝；稀疏 selected CONFIRMED 漏检（F2） | null/undefined 元素、稀疏 answers、嵌套对象/数组、非串 custom 全拒；selected 稀疏槽被 every 跳过。超长 answers 有多/重复 id 时拒绝。 |
| 4 m2-mux 旧字符串兼容 | PASS；破坏旧 wire 的疑点 REFUTED | 实际调用 testAnswerEvent 的 allowed-once/rejected 与结构化 answers，均保持 `{clientId,eventId,outcome:{kind:'result',value}}`；无 dsh 仍 resolve undefined。仅扩类型，函数体未改。 |
| 5 下账与 dsh=0 | 审批条目不动 PASS；不能声称所有非法/二答均 dsh=0 | 已识别的本地拒绝分支均 dsh=0、不误消费审批；F1/F2 未被本地识别，故计数分别为 2/1。RPC 失败是已发送失败，不应要求计数 0。 |

## 确认发现

- [FIX] F1 CONFIRMED：同一提问 eventId 并发提交不同答案，M1 两次均放行；第二份被 gateway 静默忽略却仍向调用者返回成功，未兑现“二答拒绝” | 复现：`probe.test.ts` 的 `CONFIRMED concurrent`，把 dsh.rpc 延迟至两次 api 调用均发出，实测调用数=2、两份结果均 ok:true；`gateway-concurrency.mjs` 执行上游原方法体，确认只第一份 settle、第二份无动作但 RPC 成功 | 疑似位置：`app/ui/main/m1-api/index.ts:103-109` 新分支通过后接既有 `:209-224` 的 await→consume；`app/ui/tests/unit/m1/api.test.ts:334-342` 仅覆盖串行 | 严重度：中（答案被忽略却报告成功；不声称重复执行工具）
- [FIX] F2 CONFIRMED：`selected: new Array(1)` 不是有效 string[]，仍通过严格校验并进入 dsh；rpcRaw JSON 编码后成为 `[null]` | 复现：`probe.test.ts` 的 `CONFIRMED sparse selected`，structuredClone 后第 0 槽仍不存在，M1 放行、dsh 计数=1；调用真实 rpcRaw 并用 fetch 桩捕获 body，实测 selected=[null]（对照显式 [null]/[undefined] 均本地拒绝） | 疑似位置：`app/ui/main/dsh/ledger.ts:56-58` 的 selected.every 跳过稀疏槽 | 严重度：中（renderer 的结构化克隆可表达该值，本地 fail-closed 与 string[] 保证失效）

F1 是新提问分支暴露的共享发送器既有在途空窗，不将历史审批并发另报一条。上游 gateway 的幂等结算防止重复业务执行，但不把第二次 RPC 标成失败，不能据此证明 main 已拒绝二答。
F2 的捕获使用真实 rpcRaw 编码，fetch 返回成功为测试桩：证明非法值越过 M1、进入 wire；不把桩返回的成功当成真实 SDK 已完成该答案的证据。

## 查过但无问题 / REFUTED

- renderer 链路静态追踪：`preload/index.ts:17-18` 原样 invoke → `main/index.ts:259` 来源门禁 → M1 → dsh.rpc/rpcRaw；本次无 renderer 参数改写。既有 e2e 的生产路径调用与两批 marker 断言读过，本轮未运行 e2e，不冒称重新验证 Electron 端到端。
- questionIds 与答案按集合比较，不依赖位置；答案重复额外检查 `ids.size !== answers.length`，不会被 Set 静默去重放行。
- invalid 独立补充 15 格：answers 为 null/undefined/对象/字符串，元素 null/undefined/空槽，selected 为 [null]/[undefined]/[{}]/嵌套数组，id 嵌套对象、custom 对象、额外字段、10002 项重复答案；全部 invalid-args、dsh=0、审批及问题条目均保留。
- selected 长度不应等于 answers 长度：前者是某题选项数，后者是题数。10000 个字符串 selected 能通过，但上游 tool-ask-user 输出 schema 没有 maxItems；无凭据要求限制此长度，不另报缺少任意阈值。
- 错 clientId、未 ready、无 dsh、已 cancel、未知 eventId、对审批传 answers、对提问传审批串：全部本地拒绝、dsh=0、审批条目不动。
- RPC ok:false 与 throw 分别实测 pending 保留、重试成功下账；之后新 ready clientId 再答仍拒绝。此处只是更换 ledger.ready 的定向模拟，真实 page.reload 证据沿用既有 VERIFY 的范围，不重复运行。
- 既有 VERIFY 的“合法透传/常规 invalid/串行二答/旧字符串兼容”均有定向实证支持；它未覆盖 F1 并发或 F2 稀疏 selected，不能将其 PASS 外推至这两格。
- 未报告历史 renderer 差异、P5-33、风格问题或既有 handoff flake。

## 运行证据 / 复跑

证据目录：`/home/lingxufeng/bot/work/p5-parity/evidence/P5-28-correctness/`。
`results.log`：原两份定向单测 **82 passed** + 独立探针 **22 passed**，合计 **104 passed / 3 files**，耗时 470ms；确认缺陷的探针是断言当前坏行为成立，绿色不代表缺陷修复。
`gateway.log`：两次返回成功、仅第一份答案结算，exit=0。脚本只提取并执行 receive/settle/finish/remove 四个方法体，不启动 SDK/Electron。
执行时 load 9.12，收尾 6.97；single worker、fileParallelism=false；TMPDIR 与 Vite cacheDir 均隔离，无全量、build 或 e2e。

```sh
mkdir -p /tmp/bot-rev-p528c/cache
cp /home/lingxufeng/bot/work/p5-parity/evidence/P5-28-correctness/{probe.test.ts,vitest.config.mjs,gateway-concurrency.mjs} /tmp/bot-rev-p528c/
TMPDIR=/tmp/bot-rev-p528c XDG_CACHE_HOME=/tmp/bot-rev-p528c/cache node /home/lingxufeng/bot/app/ui/node_modules/vitest/vitest.mjs run --config /tmp/bot-rev-p528c/vitest.config.mjs --reporter=verbose
TMPDIR=/tmp/bot-rev-p528c node --disable-warning=ExperimentalWarning /tmp/bot-rev-p528c/gateway-concurrency.mjs
```
