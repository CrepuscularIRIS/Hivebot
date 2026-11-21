# Q-1：Goal 在 headless p2sdk 的挂载与恢复

日期：2026-11-05。目标代码基点：`0fa0c37ed1b6650fad0cc61749b1654624e931a6`。运行产物：已装 dsh `0.2.2-alpha.2` 同代组合。参考源码：`repos/deepseek-harness@ce7073d51254c26cd63b22a60835b8f948deb447`；源码行号与发布产物可能小幅不同，行为结论以目标宿主实测为准。

## 结论与决策

**可以直接集成，而且三包已经在默认启动组合内，无需补挂载或重写 loop。** 实测通过 create → 自动 arm → round 1 完整结束 → 自动进入 round 2 → 停止 SDK 进程 → 同 HOME 再启动 → goal 恢复但 disarmed → 人类明确 resume → 自动进入 round 3。没有调用真实模型，没有改产品代码。

| 能力 | 候选 | 阶梯级别（1～5） | 许可证 | 维护（最近 commit / release） | 决策 | 理由 / 适配工作量 |
|---|---|---|---|---|---|---|
| 持久会话目标 | `@deepseek-ai/dsh-goal@0.2.2-alpha.2`；`deepseek-ai/deepseek-harness@packages/goal/goal` | 1 | MIT | 上游 commit 2026-11-04；release `dsh-v0.2.2-rc.1` 2026-11-04；issue 响应未验证 | 集成 | 已安装、默认已加载，`sessionProjections` 实际可用；直接使用 `ctx.goals` 与 session 持久化。挂载零改动，业务授权/预算是外层责任。证据 E1、S1。 |
| 同会话自动续跑 | `@deepseek-ai/dsh-goal-round-driver@0.2.2-alpha.2`；同仓 `packages/goal/goal-round-driver` | 1 | MIT | 同上；npm modified 2026-11-04 | 集成 | 实测空闲后自动续 round；只有 active+armed 才运行。恢复 owner 需在授权仍有效时显式 resume，不能把持久 goal 当作持久 armed。证据 E1、S2。 |
| 模型目标工具 | `@deepseek-ai/dsh-tool-goal@0.2.2-alpha.2`；同仓 `packages/goal/tool-goal` | 1 | MIT | 同上；npm modified 2026-11-04 | 集成 | `get_goal/create_goal/update_goal` 在真实 runtime 工具路径执行成功；复用已有 authority 检查。必须保留来源标签，不伪造 user。证据 E2、S3。 |
| 较重的自治任务/恢复替代方案（非本次选择） | `deepseek-ai/dsh-superagent-prototype@src/core/engine.ts` | 3（仅作为后续恢复语义搬件候选） | MIT | commit `8c32a9dc5d72c033816c6a8110b37f40cf94fba4`，2026-10-31；issue 响应未验证 | 改造 | 已读源码及 LICENSE：Engine 管 Ticket、Mandate、Assignment，含 `assignmentInterrupted()`，不是现有 session goal driver 的直接替代。为 Q-1 整仓引入会多一套业务状态机；不采用。恢复语义可由 Q-3 单独评估，尚未确定复制文件清单。仓内 `package.json:2–7` 为 `dsh-superagent`、`private:true`；npm 查询该名返回 E404。证据 S5。 |

维护判断边界：近期 commit/release 已满足六个月窗口；GitHub issues 查询返回空，**没有验证“issue 有人回应”**，因此不能宣称已完成项目 §3 的全部维护审计。这里的第 1 级是对**已安装并通过实测组合**的复用建议，不是批准无条件引入或升级新版本；若正式选型闸门要求两项都证实，issue 响应仍待补证。

## 1. 真实启动链及 providers/config/preset

本仓所谓 headless 宿主实际是 `scripts/start.mjs → src/start.ts → 已装 dsh web --no-open`，再由 p2sdk patch 禁用浏览器 UI；不是另建 `Context` 手动 `ctx.plugin()` 的模拟。

- `app/sdk/src/start.ts:114–132`：加载 p2sdk、approval、market、generated runtime patch，最后追加 `P2SDK_PATCH`；`716–787` spawn 已装 dsh。探针只用额外 patch 替换默认模型并加载既有 fake provider、只读 observer，**没有 insert goal/driver/tool-goal**。
- 已装 `@deepseek-ai/dsh-base/cordis.patch.yml`：`138` session-persistence-jsonl、`172` session-projection、`323` goal、`326` goal-round-driver、`440` tool-goal。参考源码对应 `packages/bundle/base/cordis.patch.yml:138–173,326–333,441–444`。
- web-app 将 goal service/driver 留在 host plane，把 command/tool 放到 preset plane；参考 `packages/bundle/web-app/cordis.patch.yml:527–535`。本仓 `app/sdk/profile/patches/approval.yml:103–106` 保留 standard preset 的 command-goal/tool-goal 接线；同文件还覆盖 cordis/ptc preset。本次只验证默认选中 preset，不冒充逐个 preset 都跑过。
- `app/sdk/profile/patches/p2sdk.yml:88–89`：`ui-goal disabled:true`。本次仍成功运行，说明它不是 host driver 的前提。

| 包 | 必要服务注入 | 配置/接口 |
|---|---|---|
| goal | `agents`, `sessionProjections` | `defaultMaxGoalRounds` 默认 256；服务 create 的 `maxGoalRounds` 可覆盖；create 同时 arm。 |
| goal-round-driver | `agents`, `goals`, `sessions` | 本次所读入口未声明独立 Config；读取 goal 的 round cap。checkpoint `sessions.flush()` 后才安排后续 round，有活跃 descendants 时等待其 settle。 |
| tool-goal | `agents`, `goals`, `tools`, `systemPrompt` | `blockedAfterConsecutiveRounds` 默认 3；create 工具参数为 `max_goal_rounds`；get/create/update 三工具，更新带 goal id/revision。 |

源码锚点：S1 `237–269,305–321`；S2 `19–20,145–220`；S3 `28–40,187–193,222–229`。

## 2. 目标宿主实测证据

复跑命令（无需真实 API key）：

```sh
node /home/lingxufeng/bot/work/p7-admin/evidence/q1-goal-probe.mjs
```

探针复用 `app/sdk/tests/support/fake/plugin.mjs`，脚本化模型工具调用，但工具执行、runtime profile、driver、session 持久化均走真实路径。临时 HOME 为 `/tmp/bot-p7q1-BGfGI5/home`，runtime home 为同根 `runtime/`；通过 gate 留住第二个自动 round，然后仅停止本次 SDK 进程，再以同一 runtime home 启动。不是机器重启测试，也不是断电/存储故障测试。

| 验收项 | 结果 | 证据 |
|---|---|---|
| `ctx.sessionProjections` 及 goals 存在 | PASS | `evidence/observer-first.jsonl:1`、`observer-second.jsonl:1`；observer 声明强注入，成功 boot。 |
| 人类 root turn 创建目标并 arm | PASS | `observer-first.jsonl:2,9`：root 创建、create_goal `isError:false`，goal 为 active/armed。 |
| 无额外人类输入，自动走完一轮并继续 | PASS | `observer-first.jsonl:14,16,18,21`：goal round 1 source、get_goal 成功、turn/end、随后 round 2 source。 |
| goal 重启持久 | PASS | E1 `5–25`：同 goal id、revision=1、active、roundsStarted=2；重启后仍相同。 |
| activation 不持久 | PASS | E1 `14,25`：armed → disarmed；`observer-second.jsonl:2,7,9` 读状态后依然 disarmed。 |
| 读状态不隐式 rearm | PASS（有限观察窗） | 探针 `43–47` 等 idle 后观察 600ms，无 goal-source 自动消息；源码默认 disarmed 是更强依据。 |
| 显式人类 resume 可恢复 driver | PASS | `observer-second.jsonl:15,20`：update_goal 成功，revision=2，自动 round 3；E1 `27–39`。 |
| UI goal 关闭不阻塞 host 能力 | PASS | 本仓 p2sdk patch 未改变；上述真实组合运行通过。 |

完整结果 E1 `completedGoalRound:1, pass:true`。启动日志在 `evidence/boot-first.log`、`boot-second.log`。测试握手仅使用新临时宿主自己产生的 token，并在程序内消费；没有读取真实凭证或把握手值写入 evidence。结束清理只用 `scripts/bot-reap --match <本次临时根>`；最终 `scripts/bot-reap --dry-run --match bot-p7q1` 没有匹配进程。

限制：未跑真模型质量测试、多个 preset 矩阵、round-cap 耗尽、paused/blocked 坏路径或 worker 的 authority 拒绝矩阵；这些对应行为为源码核对，不标实测 PASS。

## 3. Q-1 六问

### ① sessionProjections

存在。GoalService 强依赖该服务并注册 goal projection；持久状态写 `goal/change`，不靠 UI 内存保存。实测两次 boot 都注入成功。见 S1 `237–269,607–625`、E2。

### ② goal source 与本仓 TurnOrigin

driver 注入的是 **user/message 事件，来源不是人类 user，而是**：

```js
{ kind: 'goal', goalId, revision, round }
```

见 S2 `202–220`、`observer-first.jsonl:14,21`、`observer-second.jsonl:20`。`app/sdk/src/orchestration/turn-origin.mjs:11,19–21` 仅在来源集合含 `pbots-worker` 时置 tainted；纯 goal 来源会是 `tainted:false, auditKinds:['goal']`。这不表示已实现新的“受托回合”，也不自动赋予管理权限；若同回合混入 worker source，仍按现有污染规则处理。D-1 是尚需决策的权限模型，不能把当前二分类误写成三分类已落地。

### ③ 直接人类请求、顶层回合检查是否适用于主 bot

适用于 **runtime root agent 上的真实人类 user turn**，本次 create 与 resume 正是通过该路径。S4 `47–59` 同时验证 exact live agent、running、currentInitiator；`79–83` 要求 `agents.roots().includes(agent)`，且当前 open turn 内存在 `user/message`、`source.kind==='user'`。

这里的 root 是 dsh agent 图概念，不是本仓 roster 的 `mainBotId` 身份判断；不能据此宣称“仅主 bot 能调用”。本次未逐个验证 UI roster 的 bot 类型。非人类生产者必须显式带 source：省略 `followup()/steer()` source 会默认 user，源码 S4 `74–77` 明确警告，不可用省略来源来偷过授权。

create/edit/pause/resume 依赖直接人类 authority；complete/blocked 也可由当前 goal id/revision/round 精确匹配的自动 round 发起。paused goal 的模型 resume 另被拒绝（S3 `269–275`），不要把 active+disarmed 的实测扩大成所有 phase 都能由模型恢复。

### ④ 重启由谁重新 arm

**上游不会自动重新 arm。** Goal 持久化 phase/revision/rounds，activation 存在 `WeakMap<Session,...>`，新 runtime state 默认 disarmed；driver 挂到既有 agents 时也主动 disarm。见 S1 `248,484–494`、S2 `447–452`。

现有可用路径是：人类明确继续，在当次人类 turn 调 `update_goal action=resume`；实测通过。若 7a-L 要求人离开后宿主重启仍自动续跑，应由应用的恢复 owner 验证持久 Mandate/策略、目标版本、deadline/预算、暂停/撤销状态，然后通过 host 服务 `ctx.goals.resume(agent, ref)` 显式恢复。此项是**需补的业务胶水**，本次没有实现、没有宣称现有恢复链已具备。

服务 resume 会增加 revision，必须保留 round cap 剩余容量；不能无条件复活 complete/已耗尽目标。不要伪造 source=user、不要把“恢复说明”当人类授权。恢复 owner 和 driver 分工：前者批准恢复与提供上下文，后者继续作为唯一自动 round 排队者，避免另写一个重复循环。见 S1 `365–384`。

### ⑤ 禁 ui-goal 是否影响 driver

不影响本次默认组合；服务/driver 在 host plane，ui-goal 只是客户端表面。实测禁用条件下的 create、自动 round 与持久恢复均成功。关闭 UI 不等于关闭模型工具，若产品要禁目标能力，应在 host/preset 能力面控制，不应只隐藏 UI。

### ⑥ token/时间预算的反向确认

可以确认的是：**goal/round-driver 没有目标级累计 token、金额、wall-time 或 provider quota 预算；它们只有 round-count cap。** S1 README `158`、S2 README `128` 明确如此；目标 schema/Config 亦没有这些字段。driver 对 `turn/end` 的 max-tokens 处理会 disarm（S2 `348–351`），但不等于目标级累计 token 账本或 deadline。

不能确认并且不应写成“整个 dsh 没有 token/时间机制”：这是过宽论断，源码已有反例。`packages/core/agent-loop/src/index.ts:303` 配置 `maxTokens`，`src/agent.ts:623–627` 将其用于模型请求；`packages/session/session-title-llm/src/index.ts:76–91,256–279` 有辅助请求的 timeout 与 output token cap。它们不是 goal 的累计资源预算。建议 BRIEF Q-1 改成“目标级资源预算不由 goal/driver 提供，外层补执行业务检查”，而不是全仓否定。

## 4. 模型上下文与 P6-22 路由 section

- **goal service 本身**：保存 projection，不直接注册 system section；读取目标由工具结果进入模型上下文。
- **round-driver**：构造 `<goal_round>` user-message，而非 system section。内容含 JSON 编码的 objective、round/maxGoalRounds，以及“同会话继续、检查当前目录/工具结果/持久状态、取得完成证据、读目标后再标 complete、未完成留 active”的指示。见 `packages/goal/goal-round-driver/src/prompt.ts:1–18`。因此续轮会增加模型可见上下文与调用次数，不能当作零 token 成本。
- **tool-goal**：注册 `name:'tool:goal'`、order key `TOOL_GOAL`；文本说明直接人类请求可建 goal、恢复后的 active 默认 disarmed、人类要求继续时用 resume、达到目标才 complete、相同 blocker 至少持续配置轮数才 blocked。S3 `114–123,187–193`。实测 `observer-first.jsonl` 的 `model-input.messages` 中 system 文本确实含该段，默认阈值为 3。observer 的 `options.system` 不承载它，应看 messages 的 role=system。
- **P6-22**：检查的是独立 worktree `/tmp/bot-wt/P6-22/app/sdk/src/orchestration/routing-prompt.mjs`（当时 HEAD `f7ba26f`），**不是本次目标 main 已交付能力，也没有在本探针里组合启动它**。其 `8,58–63` 注册 `pbots:orchestration-routing`、order key `TEAM_POLICY`，按权威 mainBotId/worker 身份选择是否出文本。

静态判断：注册名不同，不会因同名覆盖；上游默认 `TEAM_POLICY=600`、`TOOL_GOAL=2400`（`packages/core/system-prompt/src/index.ts:140,157`），路由段排在 goal 工具段前。排序本身不是冲突解决或权限保证。

语义风险：P6-22 要求主 bot 把写文件/跑命令交给 worker，goal-round 则泛称“make concrete progress”。两者可按“主 bot 通过授权协调 worker 推进，不能自己执行写入/命令”解释共存，但**尚未用真模型组合验证**。此外 P6-22 把 worker report 定义为只转述结果，而 7a-L 若要求自动续派，仍须 D-1/授权规则正式收口，不能靠 goal prompt 绕过污染回合禁工具策略。

## 5. 上游与包仓库证据

- S1：`https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/goal/goal/src/index.ts`，及同目录 README。
- S2：同 SHA `packages/goal/goal-round-driver/src/index.ts`、`src/prompt.ts`、README。
- S3：同 SHA `packages/goal/tool-goal/src/index.ts`。
- S4：同 SHA `packages/goal/tool-goal/src/authority.ts`。
- S5：`https://github.com/deepseek-ai/dsh-superagent-prototype/blob/8c32a9dc5d72c033816c6a8110b37f40cf94fba4/src/core/engine.ts`：已读实际 Engine 源码及同 SHA LICENSE，MIT。已有本地 clone，未重复拉取、未修改 repos 或 MANIFEST。
- 上游维护 commit：`https://github.com/deepseek-ai/deepseek-harness/commit/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159`（2026-11-04T08:40:00Z）。release：`https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.1`（2026-11-04T13:07:14Z）。通过 GitHub MCP 读取，不只依赖 README。
- npm 查询 `npm view <pkg> version time.modified repository`：`@deepseek-ai/dsh-goal` latest=`0.0.1-rc.1`、modified=`2026-11-04T09:03:58.362Z`；driver latest=`0.0.1-rc.3`、modified=`2026-11-04T09:04:30.337Z`；tool-goal latest=`0.0.1-rc.1`、modified=`2026-11-04T09:07:34.802Z`。repository 均指向 deepseek-harness 的对应目录。已装三包 package.json 均为 MIT。
- **npm latest 编号与本仓已装同代 `0.2.2-alpha.2` 不同**，本次未安装/升级，不建议按 latest 单独替换某一包。结论绑定已装组合；升级需整套兼容验证。

本地证据索引（以下相对路径均以 `/home/lingxufeng/bot/work/p7-admin/` 为根）：E1=`evidence/q1-goal-result.json`；E2=`evidence/observer-first.jsonl`、`evidence/observer-second.jsonl`；可执行探针=`evidence/q1-goal-probe.mjs`，observer=`evidence/q1-goal-observer.mjs`。本次新增仅为本能力的 reuse 文档和 evidence 探针/输出，不改 `REUSE.md`、产品代码或其他 agent 的文件。
