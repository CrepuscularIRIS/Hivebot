# P5-28.f1 新增逻辑单席复审（6.1 Sol）

结论：**PASS；本 diff 新增/暴露的可报告问题 0 条**。不是对旧四发现的修复验收重签。
范围：`git diff 423939c..01d5190` 全部 7 文件；运行源码用 `git show 01d5190:<path>` 提取到独立 `/tmp/bot-rev-p528f1`，不依赖活动 HEAD。
已读 LEARNINGS、f1 REPORT/VERIFY、P5-28 correctness/security 背景，并追踪 M1 注册、M2 tap/main 订阅、deadline、测试启动 env 与已安装 gateway。

## 逐项结论

| 审点 | 结论 | 静态依据与实际探针 |
|---|---|---|
| 1a 守卫建立窗口 | REFUTED：不存在 await 后才加锁的空窗 | `m1-api/index.ts:212-223` 校验后同步 add，再调用 rpc；让 rpc 同步重入同一个 api，内层立即拒绝，rpc 恰 1 次。 |
| 1b 失败与消费顺序 | REFUTED：无失败误占、无清锁至消费竞态 | 同步 throw、Promise reject、ok:false 三格均保留 pending，下一次可成功；finally 清锁至 consume 没有 await，同一 JS continuation 不让出执行权；在 resolve 同轮追加微任务作答仍被拒，rpc 恰 1 次。 |
| 1c clientId 换代 | REFUTED：不是按旧 clientId 锁死 | Set 属单次 M1 注册闭包，key 仅 eventId；ready 换新 client 后在途新答仍拒，失败后新 client 能重试，旧 client 被资格检查拒；成功后新旧均不能重答。main/index.ts 只注册一份生产 M1，不因 renderer 重连重建。 |
| 2a 两层稀疏数组 | REFUTED：常规洞/虚增 length 漏检 | selected 的逐槽 `in`+typeof 与 answers.entries 的逐槽读值都拒洞；length=1、1000000、4294967295 两层均在首个洞拒绝，不遍历虚长尾部。两者并非同一语句，但对 IPC 可达输入同规则。 |
| 2b Array.prototype | REFUTED：renderer 原型修改不能填 main 的洞 | 自定义数组原型数字槽在同进程直调可被继承读取，但 structuredClone 后洞保留、原型数字槽消失，两层均拒；JSON 下行不能表达原型。`in` 不是 own 检查，不声称能防已污染的 main Array.prototype；本 diff 无 main 原型写点。 |
| 2c 正常透传 | REFUTED：未改写合法 payload | 空 selected、Unicode/NUL custom、数组额外非索引属性实际通过；rpc 捕获的 JSON 字节与提交前完全一致。原两文件中的乱序 answers、审批与正常提问回归全绿。 |
| 3a env 时机 | REFUTED：不是模块加载时一次缓存 | `m2-mux/index.ts:124` 每次 registerM2Mux 读一次，非每次钩子调用；同一模块先无 opt-in 注册，再设 1 注册，再设 true 注册，结果分别无/有/无。之后改 env 不追溯撤销旧 handler；是显式安装开关，不是动态撤权接口。 |
| 3b opt-in 与下账 | REFUTED：门控没有新增消费不同步 | 钩子仍绕过 M1 校验、in-flight 和 consume，函数体与基线一致；真实已安装 gateway 的 result 确实 settle，但仅 main client 时本地 pending 当场仍在，随后 deadline 的幂等 no-op 成功后下账。其他订阅收到 cancel 时走 ledger.record 下账；不把钩子谎称为生产 M1 路径。 |
| 3c 集中 opt-in 半径 | REFUTED：没有新生产入口 | 所有经脚本启动的 spec/其 shell 子进程都获得 opt-in，确会让测试默认有钩子；shellChildEnv 继承此变量。但脚本只被 test:e2e、test:compare-app 引用，export 只影响其子进程，不修改调用者 env；钩子不通过 preload/IPC 暴露，普通 M1 不被改道。生产缺省安装测试仍独立锁定。 |
| 4a 监督拒绝清账 | REFUTED：deadline 成功后未残留 | 空串 id 保留监督记录；rpc 失败保留并重试，成功 record(cancel) 清账；重复 cancel 无动作。监督记录与普通 pending 同 Map、同 deadline，无新增配额抢占机制；两种事件同时存在可分别完成。 |
| 4b 同批重复 | REFUTED：在途重复未多发/增槽 | 同 eventId 连续 10 次 record 只占一个 Map 槽；deadline 在途重复帧不增 rpc，失败后重复到达不重置 since，成功清空。迟到 waterfall 后随同一订阅的有序 cancel 清空且不二次拒绝；并未承诺接受上游已结算后凭空伪造的孤立 waterfall。 |
| 4c 崩溃/补发 | REFUTED：无新增持久化悬账 | ledger、守卫、deadline 均是进程内存，无落盘监督表。两次独立 Node 子进程初始 pending 都为 0；向新进程重喂未决帧后监督拒绝可清账。真实 gateway 源码 openRemoteEvents 遍历 pending 补发、removeRemoteEventClient 只移交付不删除 pending；不冒称实跑 Electron crash/restart。 |
| 5 脚本 +3 行 | REFUTED：不是 3 行新执行逻辑 | 实际为 2 行注释 + 1 行 export；位于 NO_XVFB 分支之前。用假 playwright/xvfb-run 执行精确提交脚本，两分支均输出 hooks=1，参数仍为 test sentinel；无浏览器/Xvfb 启动。全 app 搜索无生产调用者。 |

## [FIX] 行

- [FIX] 无：没有符合本 diff 范围、且经运行证明的新缺陷。

## 查过无新增问题 / 必须保留的边界

- 守卫不会覆盖 deadline 或测试钩子的独立 rpc 发送器；这是现有独立路径，不把 per-M1 守卫宣传为全局网关互斥。gateway 幂等结算仍是最终防线。
- renderer `$events` 端口在场时，非法批次和合法批次一样暂停 deadline；探针验证离场后重新计时并清账。保留的是既有宽限契约，不声称“任何在场状态也限时强制拒绝”。
- 同 eventId 重复 record 会刷新 receivedAt，但 deadline 用自己的 since，不因此延后；Map 无新增容量限制，未凭空要求新增任意数量阈值。
- 纠正既有 REPORT §6 / VERIFY NOTE 的表述：`PBOTS_E2E_NO_XVFB=1 pnpm test:e2e ...` **仍经过 export，有钩子**；只有绕开脚本直接 `pnpm exec playwright test ...` 才没有默认 opt-in。后者不是脚本逃生分支失效。
- opt-in 钩子的本地即时消费缺失是原函数体行为，本轮实证并标清边界，不回报成门控新增漏洞；普通生产路径仍按 M1 成功后消费。

## 运行证据

- 目录：`/tmp/bot-rev-p528f1/`；独立 `probe.test.ts`、精确提交源码/两原测试、`vitest.config.mjs`、`results.log`、子进程 `restart.mjs` 与 shell 桩均留存可复跑。
- 命令：`TMPDIR=/tmp/bot-rev-p528f1 XDG_CACHE_HOME=/tmp/bot-rev-p528f1/cache node /home/lingxufeng/bot/app/ui/node_modules/vitest/vitest.mjs run --config /tmp/bot-rev-p528f1/vitest.config.mjs --reporter=verbose`。
- 最终运行：**3 files / 108 passed / exit 0 / 700ms**（92 原测试 + 16 独立探针）；12:50:44 开始。首次 105/106，唯一红项是自写 xvfb 桩多 shift 一次，修探针后复跑；产品码未改。
- 单 worker、fileParallelism=false、TMPDIR/cacheDir 隔离；未跑 build、全量或 e2e，未读凭证、未手工杀进程、未写 LOG/PLAN、未提交。收尾 load=13.02，停止额外测试。
