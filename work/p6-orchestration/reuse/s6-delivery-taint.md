# S-6：投递与来源污染的反向确认

调研日期：2026-11-04。范围：PLAN 决策 27–29、S-6。仅静态源码、GitHub MCP 与 npm 元数据核查；未运行产品、未安装依赖、未读取凭证、未改参考仓或 MANIFEST。

## 结论与决策行

| 能力 | 候选（owner/repo@path 或 npm 包名） | 阶梯级别（1～5） | 许可证 | 维护（最近 commit / release） | 决策 | 理由 / 适配工作量 |
|---|---|---|---|---|---|---|
| 按回合输入来源拒绝全部工具（完整 P6 策略） | dsh 原生 `tools.guard` / pre-execute；`@argszero/cordis-plugin-goal-ask-guard` | 5（仅来源策略）；执行原语沿用 1 | MIT | dsh 本地 2026-10-30、远端 2026-11-03；argszero 2026-09-10；两者 issue 回应均未核验，不能据此宣称满足完整维护标准 | **自建** | 指定宿主范围内未发现可直接配置的完整 taint 模式。原生执行拒绝原语已存在，不能重写执行管线；只补按 agent/turn 的来源记账与生命周期、结构化拒绝适配。argszero 只匹配 goal 来源并拒一个指定工具，不符合 pbots-worker + 全工具 + 回合内单调污染。见 §1。 |
| 决策 27–28 的跨 session 幂等回报 | `deepseek-ai/dsh-superagent-prototype@src/app/delivery.ts`；比较 DSCODE session-bridge、Agents-Anywhere、dsh-program-agents | 3（SA 小文件改造；宿主投递/持久化沿用 1） | MIT（SA、DSCODE、AA dsh-bridge、program-agents） | SA 本地快照 2026-10-31；DSCODE commit 2026-10-28 + collaborator issue 回应 2026-10-12，满足在维护；AA commit 2026-11-04，issue 回应未核验；program-agents commit 2026-10-21，issue 回应未核验 | **改造** | **除 SA 外确有在维护的实现：DSCODE。** 但它引入 SQLite 邮箱作为持久权威状态、限定 session eligibility，并非两份日志重算；AA 的消息入口写 user 来源且依赖平台 metadata。保持决策 27 不变时，SA 更短、更贴合；补自有 source、items[] 键并集、合批 id、flush 后回执及恢复唤醒。见 §2。 |

**不能写成“GitHub 上没有”。** 已找到 DSCODE 反例；可以写成“本次检索未找到可原样集成且满足决策 27–29 全部约束的实现”。本报告不替代 director 取舍，不改 PLAN。

## 1. 来源污染：现成的是执行拒绝原语，不是完整策略

本地 dsh 固定 SHA：`ce7073d51254c26cd63b22a60835b8f948deb447`；以下路径相对 `/home/lingxufeng/bot/repos/deepseek-harness/`。

### 1.1 直接复用的宿主机制

- `packages/core/tools/src/index.ts:379-400`：`guard()` 注册 scoped/global guard；`checkGuards()` 返回首个拒绝理由。`packages/core/tools/src/contracts.ts:372-391`：`ToolGuard` 是 `Readonly<ToolExecution> => string | undefined`，没有重新允许的返回值。
- `packages/core/tools/src/pipeline.ts:190-231`：先走 `tools/pre-execute` waterfall、处理 ask，再在允许分支调用 `checkGuards()`；拒绝后生成工具错误，不进入 dispatch。**这是执行层强制检查，比仅靠工具隐藏/restrict 更合适。**
- 边界：guard 在审批处理之后检查，且只返回 string；当前实现不会自动填 `error.info` 的 `pbots/forbidden` 结构。若验收要求审批前拒绝且结构化错误，仍需 pre-execute 短路适配，不能把 `tools.guard` 直接等同于完整交付。可以把原生 guard 用作最终执行兜底，但是否需要双层应由真实组合测试决定。
- `packages/core/tools/src/index.ts:155-188,192-225`：`restrict()` 是 scope 工具视图过滤，继承限制取交集，scope 自有注册仍可见；不能用 `allow: []` 冒充“任意工具执行都拒绝”。
- `vendor/cordis/src/events.ts:113,142,264,296`：prepend 是 listener 顺序机制（含 boolean 简写），不是来源分类器。指定 vendor 源码检索未发现 untrusted/taint 模式。

### 1.2 指定目录及 claimed 消费者的排查结果

- `packages/guard/timeout-policy/src/index.ts:55-80`：工具 timeout signal 包装，无来源判断。
- `packages/guard/repeat-tool-reminder/src/index.ts:220-239`：重复调用提醒；human 输入只重置 chain，仍调用 next，无工具拒绝。
- `packages/core/agent-loop/src/inbox.ts:108-112`：claim 后逐条 emit `agent/inbox/claimed`；`packages/core/agent/src/runtime-types.ts:328` 声明 `{agent,message,turn}`。是策略可用的输入，不是现成策略。
- `packages/jobs/tool-jobs/src/index.ts:270-274`：human 输入重置 wake budget。
- `packages/acp/acp/src/index.ts:139-140` → `src/session.ts:370-376`：用 messageId 把 ACP inflight prompt 关联 turn。
- `packages/subagent/subagent/src/manager.ts:961-965`：更新 activation 并唤醒 settlement。
- `packages/goal/goal-round-driver/src/index.ts:315-358`：queued/claimed/admitted 等 goal prompt 状态推进。
- `packages/interaction/user-questions/src/index.ts:93-120`：question reply 的 claimedTurn/pending 生命周期。

以上生产消费者没有实现“某来源出现后本回合全部工具拒绝”。生成的 api-catalog、测试命中不算生产策略。没有把这项有限检索扩大成对全部未来宿主版本的否定。

### 1.3 外部同类候选

已完整读 [argszero 源码](https://github.com/argszero/cordis-plugin-goal-ask-guard/blob/55c47dfb53acc389545262fb0754c66338db2514/src/index.ts)、package.json 与 [MIT LICENSE](https://github.com/argszero/cordis-plugin-goal-ask-guard/blob/55c47dfb53acc389545262fb0754c66338db2514/LICENSE)。它监听 claimed，针对 `source.kind === 'goal'` 的 round 条件安装 `tools.guard`，默认只拒 `ask_user_question`。Config 只有 toolName / denyOnUnknownGoalRound，不支持直接配置 pbots-worker 来源和拒全部工具。

此外，源码里的 inserted/discarded 清理会关闭 guard window；不能不加核对地移植为“污染后本回合始终拒绝”。因此不是可直接依赖的 P6 策略，也没有必要为复用这个薄包装引入独立插件。

npm 核查：`npm view @argszero/cordis-plugin-goal-ask-guard version time.modified repository --json` → `0.1.1`、`2026-09-10T00:36:41.020Z`，仓地址一致。GitHub commit 同日；list_issues 无可见记录，issue 回应未验证。

### 1.4 第 5 级为何仍需最少自建

第 1/2 级只有执行 guard、事件和限制机制；现成插件的来源/工具范围/清理语义不匹配。第 3 级复制 goal 插件仍需重写这些关键业务规则，不比基于宿主原语写小型策略少。源码可读，无第 4 级逆向理由。**自建仅限 pbots 的业务策略，不能另造 tool executor 或 taint 框架。**

PLAN 有口径冲突：`:47` 与 P6-21 ⑥仍写未知来源 fail closed；`:190` 的 G2-r2 R2-1 已要求**只认 pbots-worker 污染**，白名单只审计，审批档位切换、提问迟到答复、schedule 不得误拒。实现前由 director 统一正文与验收，scout 不擅自选另一套规则。

## 2. 幂等投递：存在维护中替代实现，但不原样满足决策 27

### 2.1 推荐仍保留 SA 小文件改造

本地 `/home/lingxufeng/bot/repos/dsh-superagent-prototype/src/app/delivery.ts`，SHA `6337fc823ce20251c8de8085948165c81aaa701e`，MIT。

- `:16-24`：稳定 messageId 与旧来源识别。
- `:34-59`：live session event 记已见；history 先 flush，再打开持久日志分页读取。
- `:61-64`：history + nextTurn/nextStep 双查。
- `:66-85`：构造固定 id，经 inject/steer/followup 投递，再 flush。
- **注意** `accepted?.()` 在 `:83`，flush 在 `:84`；只有 send Promise 完成在 flush 后，不能把原回调当成持久回执。P6 改造必须把“送达”绑定 flush 成功。

来源标注应使用完整固定引用：[delivery.ts@6337fc8](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/6337fc823ce20251c8de8085948165c81aaa701e/src/app/delivery.ts)。它没有 Assignment、items[] 多键并集和 P6 的恢复触发/唤醒规则；这些仍是适配工作，不宣称现成包含。

### 2.2 DSCODE：确认存在且在维护，不采用整包的原因是状态模型

固定 SHA `77db18bcdeb2fc19327f6f60810e249dc4eb47ca`。

- [communication.mjs](https://github.com/qiz029/dscode/blob/77db18bcdeb2fc19327f6f60810e249dc4eb47ca/plugins/session-bridge/communication.mjs)：已完整阅读。`send()` 显式跨 session 路由；`native()` 保持 message id；`deliver()` 检查 pending、session user/message 和 live claimed batch；`confirm()` 先 sessions.flush 再 consumed；`recover()` 重建 receipts、重投 pending。不是只有 README 声称幂等。
- [mailbox.mjs](https://github.com/qiz029/dscode/blob/77db18bcdeb2fc19327f6f60810e249dc4eb47ca/plugins/session-bridge/mailbox.mjs)：已完整阅读。SQLite WAL + synchronous FULL，`UNIQUE(sender,idem)` 与内容 fingerprint；admit 在 transaction 中写 durable envelope；accepted/admitted/consumed、TTL、causal chains、budgets 都存数据库。**这确是跨 session 幂等投递实现，但 mailbox 是第三份持久权威状态。**
- [index.mjs](https://github.com/qiz029/dscode/blob/77db18bcdeb2fc19327f6f60810e249dc4eb47ca/plugins/session-bridge/index.mjs)：真实注册 send_session/reply_session 和 sessionCommunication；非独立通用 delivery 模块。CommunicationService 还限定 dscode preset / subagent，并接管 cancel 包装与 bridge 生命周期。
- [LICENSE](https://github.com/qiz029/dscode/blob/77db18bcdeb2fc19327f6f60810e249dc4eb47ca/LICENSE)：MIT。
- [最近提交](https://github.com/qiz029/dscode/commit/77db18bcdeb2fc19327f6f60810e249dc4eb47ca)：2026-10-28；[issue #16 collaborator 回应](https://github.com/qiz029/dscode/issues/16#issuecomment-6134364337)：2026-10-12，说明已发布并关闭。满足本项目维护标准（不把评论中宣称的测试当成本次自行验证结果）。
- npm `@toddzheng024/dscode` 返回 `0.7.40`、modified `2026-10-12T23:06:10.330Z`；远端 root package.json 为 private `0.7.54`，dsh 依赖 `0.2.1-rc.3`。**未验证 npm 0.7.40 是否含上述最新桥接源码，不能把 GitHub HEAD 当成当前 npm 包内容。**

第 1/2 级未选：它要求额外 mailbox/身份/socket/预算体系，违反现行“不存插件队列”的硬约束；通过包装层无法去掉其核心持久状态。复制其投递循环虽可参考，但去掉 mailbox 后仍需自接 P6 日志重算，改动大于 SA 86 行文件。若用户允许改变决策 27，DSCODE 才是应重新优先评估的集成候选。

### 2.3 其他源码比较

- **Agents-Anywhere**，SHA `1f827133d6d6de86df424898d9b9738b6b3aebf3`：[sessions.ts](https://github.com/anywhere-labs/Agents-Anywhere/blob/1f827133d6d6de86df424898d9b9738b6b3aebf3/dsh-bridge/src/bridge/runtime/sessions.ts) 已完整阅读。`submitMessage()` 有 deterministic id、logged+pending 双查、metadata.recordMessage、flush；但消息硬编码 `source.kind='user'`，并要求 platform session binding。`apiPrompt()` 同样是 Web user prompt 去重，不是可直接装配的 worker relay。沿用它会误把 worker 数据归为可信用户输入；整仓集成还引入平台 controller/metadata。不是 P6 的直接替代。[dsh-bridge/LICENSE](https://github.com/anywhere-labs/Agents-Anywhere/blob/1f827133d6d6de86df424898d9b9738b6b3aebf3/dsh-bridge/LICENSE) MIT；最近 commit 2026-11-04，issue #534 无评论，回应标准未核验。未据检索片段宣称其全仓 exactly-once。
- **tkellogg/dsh-program-agents**，SHA `8c871f6e71b2d1650c5c2d22b60813c34ac5ac18`：[src/host/agents.ts](https://github.com/tkellogg/dsh-program-agents/blob/8c871f6e71b2d1650c5c2d22b60813c34ac5ac18/src/host/agents.ts) 完整读过。notify 的 event_id hash 查内存/receipt 文件，先 deliver 再写 receipt；普通 send 使用 randomUUID。发送成功与 receipt 写盘之间崩溃仍可重复，且多一份 receipt 存储，不符合决策 27。MIT；最近 commit 2026-10-21，issue 回应未验证。
- **not-big-dog/DSH-pipeline-kernel**，SHA `b9506a8ca5c847230db1bdc85c47c0091ab8871f`：[lib/agent-runtime.js](https://github.com/not-big-dog/DSH-pipeline-kernel/blob/b9506a8ca5c847230db1bdc85c47c0091ab8871f/lib/agent-runtime.js) 完整读过。deliverWake 只查 live agent、createUserMessage 后 followup，没有稳定 id/history+pending 对账/flush；无 live target 直接 false。许可证、维护回应未验证，未据此判定“在维护”。

## 3. 检索范围、证据限制与实现交接

1. 本地先查 MANIFEST、既有 repos 和 `work/*/REUSE.md`，重点读 dsh guard、tools restrict/guard/pipeline、claimed 生产者/消费者、Cordis events 与 SA delivery；没有 clone 或写参考仓。
2. GitHub repositories 搜过 `deepseek-harness`、`dsh delivery idempotent`、`dsh multi-agent`；code 搜过 `AgentDelivery`、`agent/inbox/claimed` + deny、`inbox.nextTurn` + `message.id`、`followup` + `idempotent`/`dedup`、`@deepseek-ai/dsh-agent` + `idempotency`/`dedup`，以及上述候选 repo-scoped 搜索。结果随时间变化，不把有限分页等同全 GitHub 穷尽证明。
3. npm 搜过 `dsh delivery`、`dsh idempotent`、`dsh idempotent delivery`、`cordis goal ask guard`；delivery-receipts 等包名命中不足以证明消息投递能力，未列为已验证候选。已查询 dsh-tools/Cordis/goal guard/DSCODE 的 version、time.modified、repository。`@deepseek-ai/dsh-tools@0.2.2-alpha.2` 能查到；其无版本 npm view 却返回 `0.0.1-rc.1`，不能直接按 latest 升级宿主。
4. dsh 远端 [commit 8bd0733](https://github.com/deepseek-ai/deepseek-harness/commit/8bd073392eef6f54e921a093b95076248eb08cbb) 为 2026-11-03；MIT LICENSE 已读。但 issue API 未取得可核验回应（#6074 comments 为 404），故维护证据保留这一缺口，不冒充完整达标。
5. 未完整核读的宽搜索命中（discipline-whale、dsh-email 等）不作为“有/没有”结论依据；本任务不需要逆向闭源。
6. 交给 P6-09/P6-21/P6-12：核验真实 Loader 下 claimed→pre-step→审批→guard 的顺序、所有执行入口与 PTC/连接器路径、混合回合单调性/下一回合复位、审批迟到响应；以及 pending 恢复唤醒和三处崩溃注入。**本次没有运行这些测试，静态可复用不等于运行验收通过。**
