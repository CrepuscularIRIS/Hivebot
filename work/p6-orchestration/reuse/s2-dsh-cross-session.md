# S-2 · dsh 跨会话与动态工具实证

调研日期：2026-11-03。用途：`PLAN.md:56-77` 的 S-2，以及 D-2④⑤补证；不代替两席回核或生产验收。

## 0. 结论

- **(f) 条件成立**：已经完成过 turn 的旧 session 可以动态获得新注册工具，不必重建 session；`when` 在每个模型 step 求值，scoped restriction 可在存活 Agent 上加/解除。**不是 preset 热切换**：已开始 session 的公开 preset select 会报 `agent-preset/locked`。工具表按 step 更新，执行时仍必须重新读取当前权威 `mainBotId` 并拒绝未知身份。
- **(h) 是，但须准确区分方向**：SDK 可以通过自定义 Cordis/Typert service 导出 unary/stream 端点，不必改 core endpoint 白名单。main 可作为客户端订阅 SDK 自定义请求流，再调用 SDK 的 respond 方法完成关联应答。已经实测 **SDK 工具 → 自定义流 → main 角色客户端 → 真实 session/create → respond RPC → 工具返回真实 sessionId**。这不是“main 自动成为可被 SDK 直接调用的 RPC server”。
- **D-2④**：④(b) 的上游能力前提已获实证；采用全局 conditional registration + 每次执行鉴权，而非用专属 preset 固化主 bot 身份。
- **D-2⑤**：A 席的“SDK 自有流端点 + main 常驻订阅 + RPC 应答”收窄方案已有完整往返证据，可交两席回核；不支持把原⑤(b)“直接调用 main 方法”当成现成能力。应沿用既有 mux transport，不扩 renderer 的 M1/M2 公共白名单。

## 1. 基线、检索范围与维护状态

1. 只读源码基线：`repos/deepseek-harness/`，完整 SHA `ce7073d51254c26cd63b22a60835b8f948deb447`；本地 commit 时间为 2026-10-30T00:13:15+08:00。许可证见 `repos/deepseek-harness/LICENSE:1-3`，MIT。既有登记见 `repos/MANIFEST.tsv:4`，本次未重复 clone。
2. 实际探针运行的是项目已安装 **`@deepseek-ai/dsh@0.2.2-alpha.2`**，不是把源码 HEAD 当作运行结果；版本记录见 `evidence/s2-cross-session/result.json:2-3`。项目依赖与 Loader 路径沿用 `app/sdk/package.json`、`app/sdk/src/start.ts:114-126` 和 `app/sdk/src/p2temp/index.mjs:28-57`。
3. GitHub MCP 已核验固定 SHA 的 `packages/core/tools/src/index.ts`。上游最新可见 commit 为 `8bd073392eef6f54e921a093b95076248eb08cbb`，2026-11-03T07:27:29Z；最新 release 为 [dsh-v0.2.2-alpha.3](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-alpha.3)，2026-11-03T07:56:48Z。**不建议本任务顺手升级**。
4. `npm view @deepseek-ai/dsh-tools version time.modified repository --json`、`@deepseek-ai/dsh-client-connection`、`@deepseek-ai/dsh-api-gateway` 查询均找到已发布包，modified 为 2026-11-03；默认 tag 的 version 为 `0.0.1-rc.1`，不等于项目锁定的 alpha.2，不能据此替换 lock。仓库路径分别是本报告对应的 tools、connection、gateway 包。
5. 维护判断的“近六个月 commit/release”已满足；**issue 有人回应未验证，不能声称满足项目 §3 全部维护条件**。同仓既有调研 `work/p5-parity/reuse/d2-mcp-meta.md:8,25` 记录仓库关闭 issues、可见 issue/PR 为空。本报告“集成”是复用已经选定并安装的底座及公开扩展点，不新增一个已全面核准维护状态的供应商；如把完整维护条件作为新增依赖硬闸门，此项应保留待确认。
6. 已先查本地 manifest、现有 p5/p4 REUSE 与 SDK 接线。本题指定核验 dsh 能力，不更换宿主；同类候选比较的是 dsh 的不同公开机制，未将其他框架伪列为已深读的替换仓。

下文上游路径均相对 `repos/deepseek-harness/`，且固定上述 SHA；本任务证据与投票路径相对 `work/p6-orchestration/`。

## 2. 搬运阶梯决策行

| 能力 | 候选（owner/repo@path 或 npm 包名） | 阶梯级别 | 许可证 | 维护（最近 commit / release） | 决策 | 理由 / 适配工作量 |
|---|---|---|---|---|---|---|
| 旧 session 动态工具 | `@deepseek-ai/dsh-tools`：`packages/core/tools/src/index.ts:128-188,264-295` | 1（复用已装底座；维护限定见 §1） | MIT | commit 2026-11-03 / release 2026-11-03；issue 回应未验证 | 集成 | `register(...,{when})` 每 step 判定；scoped restriction 加/解除不重建 Agent。生产插件补权威 mainBotId 读取和执行期拒绝；无须复制工具注册表 |
| 身份与 preset 绑定备选 | `deepseek-ai/deepseek-harness@packages/preset/agent-preset-registry/src/index.ts:97-137,266-289,357-382` | 1（既有底座候选，不选本用途） | MIT | 同上 | 集成 | 只适合现有 preset 的创建/选择生命周期，不选作动态协调者授权。started session select 被锁；不能用更换 preset 替代动态身份 |
| SDK→main 应用层请求应答 | `@deepseek-ai/dsh-api-gateway` + Typert Remote service：`packages/api/gateway/src/index.ts:878-916,1000-1010` | 1（复用已装底座；维护限定见 §1） | MIT | 同上 | 集成 | **首选**。自定义 stream + respond unary，沿用既有 mux、connection admission 和 invocation Peer。只补请求关联、超时/断流及业务校验，不另造网络协议 |
| 独立认证 RPC channel 备选 | `@deepseek-ai/dsh-client-connection`：`packages/client/connection/src/rpc.ts:179-202`、`rpc-host.ts:253-276` | 1（API 候选，目标组合未验证） | MIT | 同上 | 集成 | 源码有 `rpc.handle(channel, handler)`；本次 alpha.2 probe 的 `/s2-rpc/echo` 得 405，原因未查清，不作为已跑通载体或首选 |
| 原始 HTTP/SSE 备选 | `deepseek-ai/deepseek-harness@packages/host/webserver/src/index.ts:48-58,445-465` | 1（既有底座候选，不选本用途） | MIT | 同上 | 集成 | 能注册 route/upgrade，SSE 可持有 response，但要另接认证、Peer 和生命周期；比 gateway stream 工作更多，本次未做端到端验证 |
| 既有 `$events` waterfall 备选 | `deepseek-ai/deepseek-harness@packages/api/remotes/src/remote-events.ts:26-57` | 3（若坚持扩固定表则须改造；不选） | MIT | 同上 | 改造 | 编译期常量只列 `approval/request`、`user-questions/request` 两个 waterfall；新编排事件不能直接注册进去。已有动态 Remote service 足用，无理由改这张上游表 |

“集成”不表示上游提供现成完整的 `create_bot` 跨进程业务服务。上游提供注册表、条件、传输和 invocation 机制；本项目业务包装仍需少量代码。未发现需要逆向的闭源能力，也不需要自建 transport。

## 3. (f) 旧会话动态获工具

### 3.1 注册表与 restriction 并非创建时冻结

- `packages/core/tools/src/index.ts:128-152` 的 `register` 在 live registry 加定义并返回 disposer；`:199-226` 的 `view(scope)` 当前求继承工具与 restrictions 的交集。
- `restrict` 在 `:162-188`：只能对 scoped context 调用，allow/deny 数组在注册时编译为 Set（`:172-175`），不是随 `mainBotId` 自动变化的 predicate。要动态修改需要加/解除 restriction，或使用下面的 `when`。
- scope 自己注册的工具不受该 scope 对继承工具的 restriction 遮蔽（`:199-226`）。因此若采用“全局注册 + scoped deny”，不要又在同一 Agent scope 注册同名/自有协调者工具绕开预期。
- `when` 是公开注册选项，类型与语义见 `packages/core/tools/src/contracts.ts:104-123`。`resolve(context)` 在 `index.ts:264-295` 调用 `await registration.when(context)`，构造该 step admitted set。
- `packages/core/agent-loop/src/agent.ts:283-315,344-347` 每个模型 step 重新 resolve，将同一个 toolSet 用于 prompt/schema 与执行器；因此新工具在**下一 step**进入旧 session。

### 3.2 必须区分 step 快照、实时 registry 与授权

- 同一步 admitted set 是快照：后注册的工具不会加入已经准备好的 step；下一 step 重新计算。移除或 scoped deny 会通过 live view 再过滤，见 `tools/src/index.ts:281-295`。
- 上游测试 `packages/core/tools/tests/activation.spec.ts:43-58,79-90,115-138` 覆盖 condition 切换、live restriction、同名重注册和 resolve 期间移除。
- `get/definitions/schemas` **省略 toolSet 时只读注册定义、不计算 when**；执行查找 `executable` 在没有 toolSet 时排除 conditional registrations。见 `tools/src/index.ts:239-254,305-317`。若另做 UI“工具列表”，必须明确要展示注册目录还是当前 Agent 的 resolved selection，不能直接用无 toolSet 的 schemas 声称已隐藏。
- `when` 的外部身份条件不会因 `mainBotId` 在 step 中途变化而自行重新跑。每次实际工具执行仍须读权威身份；可用 `tools.guard` 做同步拒绝（`index.ts:384-400`），需要异步读取则在 execute 等执行入口 await 并 fail closed。**探针只证实下一 step 失权，不是中途切换竞态的完整安全验收**。

### 3.3 preset 不是替代热更新方案

- `packages/preset/agent-preset-registry/src/index.ts:97-137,164-167,266-289` 将 live Agent 绑定到特定 preset generation，旧 generation 在使用者清空后才释放；重新注册定义不是自动重挂旧 Agent。
- `:329-354` 中 recompose 的说明针对 blank Agent，不构成 started session 公开热切换承诺。
- `:357-382` 的 `select` 检查 open turn 和 lastTurn；已经开始即抛 `agent-preset/locked`。实测 wire 参数必须是 `{agentId, agentPreset}`，不能传 `sessionId`。
- 所以答案不是“所有工具在 preset 创建时永远冻结”，也不是“给任何旧 bot 换 preset 都即时生效”：**registry/when 是动态的；preset selection 生命周期是受限的**。已激活插件向 registry 注册新工具可以生效，但只改 preset 文件/元数据不等同于向存活 Agent 注册。

### 3.4 对 D-2④ 的落地边界

推荐全局插件注册 `create_bot`、`send_to_bot`，`when({agent})` 每 step 按当前权威 `mainBotId` 判断是否进入模型工具表；execute 每次再读同一真源并验证调用 Agent。身份未知、数据根不一致、读取失败一律拒绝。#20 切换主 bot 后，旧主即使持有旧 step 的工具 schema，也不能通过 execute；新主下一 step 获得工具。

该结论支持两席对④(b)的能力条件（`panels/D2-p6-r1-A.md:15-18`、`D2-p6-r1-B.md:11`），不替实现者证明真实 bots.json 权威读取、#20 接线或 worker 不得提升的约束已经完成。

## 4. (h) 可行载体与推荐最小接线

### 4.1 已证实的扩展点：自定义 Remote service

- `packages/api/gateway/src/index.ts:878-916`：严格 descriptor 之外可从 live Cordis services 扫描 Typert Remote metadata；`:891-905` 是自定义服务发现，`:1000-1010` 处理 stream mode。因此不是只能调用已编译 core API 列表。
- 参考上游可运行 fixture：`packages/api/gateway/tests/operator-connect-fixture.ts:21-33,63-75,97-105`，包含继承 `TypertRemoteService`、stream 方法，以及 invocation Peer/signal。
- gateway 调用绑定 invocation，见 `packages/api/gateway/src/index.ts:827-858`。本次 probe 沿用项目现有 `app/sdk/src/p2temp/index.mjs:42-57,261-264` 的 Remote metadata 标记方式，避免引入另一套协议运行时实例。

### 4.2 最小 demo 方案与已完成的能力探针

1. Loader 加一个 SDK 插件，注册 `s2/requests` stream 与 `s2/respond` unary；SDK 工具保存 requestId→pending promise，并向当前订阅流送请求。
2. main 继续作为 SDK 客户端，用既有 mux socket 打开 `s2/requests`，不启动 main HTTP listener。
3. main 收请求后执行既有编排；能力探针用真实 `session/create` 返回新 sessionId，再调用 `s2/respond{requestId,value:{sessionId}}`。
4. SDK 校验响应属于持流 Peer、找到在途项，resolve 工具 promise，模型侧看到工具结果。

对应证据：`evidence/s2-cross-session/probe.mjs:21-36,47-71,74-78`；客户端完整往返 `run.mjs:58-69`；结果 `result.json:33-40`。这是实际网络与 Loader 接线，只有模型由 fake 替代；并非仅用 mock 函数互调。

**这套接线复用既有 transport，只新增业务方法和请求关联。** 不要求修改 M2 的公共转发帧协议，不要求把编排端点暴露给 renderer。真实生产编排应调用已选定的 main 编排入口，不能照 probe 直接绕过 createdBy、容量、cwd 等业务约束。

### 4.3 其他通道为何不优先

- `connection.rpc.handle` 的独立 authenticated channel 是公开 API（`packages/client/connection/src/rpc.ts:136-141,179-202`、`rpc-host.ts:253-276`）。但本次测试得到 **405 空 body**，`result.json:25-30`；只能写“源码提供、当前探针未跑通”，不能断言此 API 不存在，也不能将它列为完成实证。
- `connection.rpc.intercept('/api',...)` 不是可无限叠加的插件路由表：`rpc-host.ts:279-300` 限制单实例，gateway 已使用；不要抢占它实现第二套转发。
- 原始 `webServer.register` 支持 exact/prefix route、长持有 response 和 upgrade（`packages/host/webserver/src/index.ts:48-58,445-465`）；它不自动等于现成的业务鉴权通道，本次未验证该支路。
- `$events` 现有 waterfall 的固定 allowlist 不能直接容纳新编排事件（`packages/api/remotes/src/remote-events.ts:26-57`）；不用修改上游常量来绕过已存在的 Remote service 扩展点。

### 4.4 生产必须补齐，而非能力探针已经保证

- 请求流和 respond 仅供 main，不进 M1/M2 renderer 白名单；respond 绑定持流 Peer。探针实现 Peer 相等检查，但**尚未做错 Peer 攻击用例**。
- 无订阅者立即 `main-unavailable`；断流/SDK 重启作废在途，拒绝迟到响应，不重放。明确超时、去重和取消；不能让工具无限挂起。
- 错误保留 `pbots/invalid-args`、`pbots/capacity`、`pbots/orchestration-failed`、`main-unavailable` 及底层 details，按现有 envelope 应答。
- main 校验输入并复用既有编排，先持久化 createdBy，再建立会话/返回；请求作废不是回滚已建 bot，结果未知禁止自动重试。
- 探针的内存 mainId、`pending.size+1` requestId、未设完整超时/容量的队列都只适合一次能力演示，**禁止原样搬生产**。不据此宣布 D9 安全条款通过。

以上对应两席最低契约 `panels/D2-p6-r1.md:12-13`、`D2-p6-r1-A.md:20-24`、`D2-p6-r1-B.md:8,12-14`。

## 5. 可复核证据与覆盖范围

### 5.1 本次轻量能力检查

运行入口（仅按需复核，不要求为了读报告再跑）：

```sh
/home/lingxufeng/bot/app/sdk/node_modules/.bin/node /home/lingxufeng/bot/work/p6-orchestration/evidence/s2-cross-session/run.mjs
```

最终一次运行 exit 0，11 个断言通过，另有 1 个不作 acceptance 的 HTTP 405 观察。`result.json` 的 `actual:false` 在“不可见”断言中是**期望结果**，不是失败。

| 观察 | 证据 |
|---|---|
| A session 先完成 turn，再注册；旧 session 获工具，B 不获工具 | `run.mjs:44-51`；`result.json:5-15` |
| A scoped deny 后不可见，解除后恢复，无重建 | `run.mjs:52-55`；`result.json:17-23` |
| 自定义 stream ready；真实 session 创建及工具结果往返 | `run.mjs:58-69`；`result.json:33-40` |
| 换主到已创建的 B 后，A 下一 step 不可见，B 可见；fake 强制 A 调工具得到 error | `run.mjs:70-74`；`result.json:43-52` |
| 已开始 A 不能 select preset | `run.mjs:75-77`；`result.json:55-56` |
| 独立 channel 未通过 | `run.mjs:56-57`；`result.json:25-30` |

### 5.2 不是完整生产验收

未验证：真实 mainBotId 持久化与读取失败、同一步中途换主竞态、恶意错 Peer 应答、断流/SDK 重启迟到响应、所有错误码、容量/超时、UI白名单、完整 createdBy/cwd 编排。没有跑全量回归，也没有把 fake 模型结果称为真实模型行为。

运行隔离：`run.mjs:10-18` 显式临时 HOME/PBOTS_DATA_DIR/SDK home，不继承真实凭证环境；`:81-89` 只关闭自身客户端、结束自己 spawn 的 SDK 子进程并移除自身临时目录。证据 JSON 无 launch token/cookie；参考仓、产品代码、PLAN、REUSE 汇总文件均未修改。

## 6. 交给 D-2 回核的判词

- **④(b)：能力前提支持；条件不能删。** 模型工具表在每 step 重新求值，真正权限在每次 execute 读取权威 mainBotId；不能宣称 preset 热切换或单靠隐藏授权。
- **⑤：支持“自定义 SDK stream + main 客户端订阅 + SDK respond unary”。** 完整往返已补证，满足 B 席要求的载体实证；main 仍是客户端，不存在凭空可调用的 main 方法。安全、故障与真实业务编排测试仍由后续任务闭合，再交两席冻结契约。
