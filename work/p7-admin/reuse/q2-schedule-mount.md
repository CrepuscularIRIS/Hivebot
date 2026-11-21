# Q-2 · Schedule 默认挂载、实测与来源边界

日期：2026-11-05。主仓 HEAD：`0fa0c37ed1b6650fad0cc61749b1654624e931a6`（主仓原有未提交改动另计）。本次仅写 `work/p7-admin/` 调研及探针文件，未改产品代码、安装依赖或参考仓。

## 结论与决策行

**默认 `start.ts → dsh web` 已挂载 schedule 服务及 standard preset 的四个调度工具，不需要补后端挂载。当前安装版不等于较新上游源码：每 2 秒循环被拒绝；没有“上轮未结束就跳过并留记录”。因此 Q-2 挂载可用，但不能据此宣布 BRIEF 的完整 L4 已满足。**

| 能力 | 候选（包 / 源码） | 阶梯级别 | 许可证 | 维护（最近 commit / release） | 决策 | 理由 / 适配工作量 |
|---|---|---|---|---|---|---|
| 指定原会话的持久定时投递 | 已装 `@deepseek-ai/dsh-schedule@0.2.2-alpha.2` + `@deepseek-ai/dsh-tool-schedule@0.2.2-alpha.2` | 1 | MIT | 仓库 schedule 最近 commit `abc0e7092b8e2d221eedf681e474e1bf6309cc63`，2026-11-04；dsh rc.1 release 2026-11-04；issue 人工回应未验证（查询无 issue） | 集成 | 继续复用现有锁定依赖；**服务挂载工作量为零**。真实宿主通过 after-2s 投递、every-60s 投递、删除、重启与 latest-missed 检查。管理 UI / 授权桥接另算，不能把未有的能力包装成已支持。 |
| rrule / 新建目标会话 / 更强反重叠 | 同一上游较新 schedule 源码；本地参考仓 `ce7073d51254c26cd63b22a60835b8f948deb447`，另核验 GitHub `fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159` | 1（升级路径） | MIT | 同上；npm schedule modified 2026-11-04 | 集成 | 如需这些能力，优先**整套兼容升级**，不是单换 schedule 包。新源码有 executing/whenIdle、target 与 rrule；尚未在本宿主验证升级和存储兼容。即便升级，等待后补最近一次也不等于逐次 skip 记录。 |
| 独立秒级计时与重叠保护替代 | `croner@11.0.0`，`Hexagon/croner@2df1672da4738c1ec806acf2d2d93ed487c9d146:src/croner.ts` | 1（仅候选，未采纳） | MIT | commit / release merge 2026-10-26；npm modified 2026-11-04；issue 回应未验证 | 集成 | 不选：源码有计时与 protect 回调，但不是 dsh 的持久任务 / Session 投递集成，仍需另外补任务存储、离线恢复、inbox flush 与回执，反而绕远。只比较候选，不增加依赖。 |

维护判断保留限制：已核实近期 commit/release，未证明项目 §3 的“issue 有人回应”条件；这里不将未验证项说成通过。上述第一行是复用**已经在宿主工作的锁定依赖**，不是批准不经验证地追 latest。

证据：上游 [schedule commits](https://github.com/deepseek-ai/deepseek-harness/commits/master/packages/schedule)、[rc.1 release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.1)、[Croner 源码](https://github.com/Hexagon/croner/blob/2df1672da4738c1ec806acf2d2d93ed487c9d146/src/croner.ts#L650-L677)、[Croner LICENSE](https://github.com/Hexagon/croner/blob/2df1672da4738c1ec806acf2d2d93ed487c9d146/LICENSE)。npm 查询 `npm view <pkg> version time.modified repository --json`：schedule latest `0.0.1-rc.3`，tool-schedule latest `0.0.1-rc.2`，croner latest `11.0.0`；这些版本号不能当作当前 alpha.2 功能的证据。

## 1. 制品定位与证据路径

以下缩写均是本机**实际安装制品**，不是参考仓 TS：

- `S` = `/home/lingxufeng/bot/app/sdk/node_modules/.pnpm/@deepseek-ai+dsh-schedule@0.2.2-alpha.2_4a48717f67e8a6b8febb28d598132875/node_modules/@deepseek-ai/dsh-schedule`
- `T` = `/home/lingxufeng/bot/app/sdk/node_modules/.pnpm/@deepseek-ai+dsh-tool-schedule@0.2.2-alpha.2_@deepseek-ai+cordis@4.0.6-alpha.1_@deepsee_68b73341a9a43b7d8f63208cd02f5221/node_modules/@deepseek-ai/dsh-tool-schedule`
- `W` = `/home/lingxufeng/bot/app/sdk/node_modules/.pnpm/@deepseek-ai+dsh-web-app@0.2.2-alpha.2_17b2e48b78ef39fb520c787ba13e6ea3/node_modules/@deepseek-ai/dsh-web-app`
- `B` = `/home/lingxufeng/bot/app/sdk/node_modules/.pnpm/@deepseek-ai+dsh-base@0.2.2-alpha.2_01465288dceca7eaaa661770e359c71c/node_modules/@deepseek-ai/dsh-base`
- `E` = `/home/lingxufeng/bot/work/p7-admin/evidence`

`S/package.json:4,47–67` 确认版本、MIT 和依赖；`T/package.json:4,30–36` 确认同代版本、MIT 和 peer。未把参考仓更丰富的实现冒充安装版。

## 2. 全部挂载条件与 start.ts 逐项对照

启动真实链路：`/home/lingxufeng/bot/app/sdk/src/start.ts:114–132` 选择 `web`，依次加 p2sdk、approval、market、runtime 及额外 patch；`:147–183` 设置隔离 `DSH_HOME`；`:716–724` spawn 实际安装的 dsh。宿主能力由所选 base/web profile 提供，不能只在 start.ts 中找是否手写 schedule。

| 挂载 / 运行条件 | 安装包要求 | 当前启动链供给 | 缺口 |
|---|---|---|---|
| schedule 插件本体 | `S/lib/index.js:1970–1975` 的 service 注入 | `W/cordis.patch.yml:131–132`，默认未 disabled | 无；运行时 schedule=true |
| `agents` | 静态 inject；按会话找 agent、withoutInitiator 派送 | `B/cordis.patch.yml:82–83` 的 dsh-agent | 无；运行时 true |
| `sessions` | 静态 inject；实际调用 `sessions.flush(agent.session)` | `B/cordis.patch.yml:40–41` 的 dsh-session | 无；运行时 true，实测有回执 |
| `storageDomain` | 静态 inject；open(scheduleDomain)，任务持久表 | `B/cordis.patch.yml:182–190` 的 storage-json / storage-domain，backend=json | 无；真实进程重启读回同任务 |
| `sessionPersistence` | 静态 inject；目标会话元数据与 session 落盘链 | `B/cordis.patch.yml:138–141` 的 JSONL provider，根为隔离 DSH_HOME/sessions | 无；运行时 true，重启能恢复原会话 |
| `sessionController` | 动态 inject，resolveAgent fallback；冷会话恢复时实际必需 | `W/cordis.patch.yml:113–114` 的 api-session-controller | 无；重启自动唤醒原 session 成功 |
| `schedule/resolve-agent` 扩展 | waterfall hook；允许宿主提前接管 activation | `S/lib/index.js:1565` 无 handler 时 fallback 到上述 controller | 不必新增 handler；fallback 已实测 |
| 工具注册表 `tools` | `T/lib/index.js:17` 唯一静态 inject；`:497–499` 再动态 inject schedule | `B/cordis.patch.yml:494–495`；standard preset `W/presets/standard.patch.yml:35–36` 装 tool-schedule | 无；恢复后的原会话四工具均可见 |
| 创建 / 执行可用 Session 与模型 | 工具从调用方取 session；投递 followup 后由既有 agent loop 执行 | 标准会话由 controller.create 创建；本探针只把模型换为已存在的 fake provider | 指定原会话路径无缺口；未证明新建目标会话能力 |
| schedule UI | 不是服务 / 工具的必要依赖 | `/home/lingxufeng/bot/app/sdk/profile/patches/p2sdk.yml:112–113` 仅 disabled ui-schedule | 管理 UI 仍需对接；关闭 UI 不会关闭后台调度 |

运行时七项服务都 true：`E/q2-results.jsonl:2,19`。四个工具为 `schedule_create/list/delete/update`，不是新源码的 `create/list/view/edit`；`E/q2-claims.jsonl:4` 验证四者均 true。

注意探针自身一次误测：第一轮 session 结果 `E/q2-results.jsonl:3` 的 tools=false 是把 `agent.ctx` 错当工具查询的 Agent scope。已按安装版 tools API 的 `get(name, scope)` 修正为传 Agent；重启后的 `q2-claims.jsonl:4` 才是有效工具可见性证据，不能据早先 false 推导产品缺少挂载。

**包解析依赖与 Cordis 服务依赖不是一回事。** `S/package.json:48–67` 的全部 peer 为 agent、api-session-controller、brand、llm、session、session-persistence、session-projection、storage-domain、subagent、tools、typert-protocol、util-time、workspace（均 `@deepseek-ai/dsh-* @0.2.2-alpha.2`）与 Cordis `~4.0.6-alpha.1`；普通依赖为 schemastery `~3.18.6-alpha.1`、Temporal polyfill `0.5.1`、zod `4.4.3`。`T/package.json:31–36` 的 peer 为 Cordis、llm、schedule、subagent、tools。实际宿主已解析并运行这些制品，无需逐项另挂同名 service。**安装版 tool-schedule 不要求 systemPrompt 注入；那是较新源码的要求，不可混代。**

## 3. 真实目标宿主实测

### 方法与隔离

运行 `node /home/lingxufeng/bot/work/p7-admin/evidence/q2-run.mjs`。它真正 spawn `app/sdk/scripts/start.mjs`，走上面的完整 profile/guard 链；只插入只读宿主观测 / 命令桥和既有 `tests/support/fake/plugin.mjs`，**没有主动启用或另挂 schedule/tool-schedule**。任务通过实际 `ctx.schedule` 公共 API 建删，而非自造计时器。会话、存储、HOME、workspace、handoff 都位于新建 `/tmp/bot-q2-schedule-*`；没有读取 handoff、真实凭证或用户配置，没有联网调用真实模型。

观测入口：`E/q2-host-plugin.mjs`；运行脚本：`E/q2-run.mjs`；完整断言流水：`E/q2-results.jsonl`；实际 `agent/inbox/claimed` 消息：`E/q2-claims.jsonl`。两次初始探针等 root ready 事件超时，宿主本身已 ready；把探针就绪标志移到插件 apply 后才得到有效结果，未改任何产品启动逻辑。最终有效运行退出码 **0**，`q2-results.jsonl:24` 的 PASS 只是下述观测断言通过，**不是 every-2s 或完整 L4 通过**。

| 检查项 | 实际结果 | 证据 |
|---|---|---|
| 创建 every-2s | **拒绝** `ScheduleInputError/frequency_too_high`，文本 `every_seconds must be at least 60.`；不得声称每 2 秒循环成功 | `E/q2-results.jsonl:4`；`S/lib/index.js:22,996` |
| 替代短等待：after-2s → 指定会话 | 11:33:19.578Z 到期，原会话 turn 1 claim；flush 后 11:33:19.616Z 的 receipt 与 messageId 对应 | `E/q2-results.jsonl:5–7`；`E/q2-claims.jsonl:1` |
| 实际循环：every-60s | 首次 11:34:19.895Z，第二次 11:35:19.895Z，都产生投递回执 | `E/q2-results.jsonl:9–12` |
| 上轮未结束时的行为 | 首轮 fake 模型被 gate 阻塞超过下次到期；agent.status=running，第二条已进入 nextTurn，history 有 2 条 receipt。**是排队投递，不是跳过并记录** | `E/q2-results.jsonl:10–12` |
| 删除与无未来残留投递 | 11:35:22 删除；放开 gate 后等待 63 秒，catalog=[]，同任务 claims 仍恰好 2 条。第二条原已入队，删除不撤回它 | `E/q2-results.jsonl:13–15`；`S/lib/index.js:2170–2196` |
| 真进程重启后任务仍在 | 11:36:25 建任务；仅用 bot-reap 停宿主与 launcher；离线 125 秒，再用同临时 HOME 启动，任务 id 与目标 session 保留，并自动投递 | `E/q2-results.jsonl:16–22` |
| 离线错过只补最近一次 | 原首次应为 11:37:25.540Z，离线又错过 11:38:25.540Z；重启只生成后者 1 条 receipt（11:38:36.035Z 投递），下一次为 11:39:25.540Z，没有补前者 | `E/q2-results.jsonl:20–22` |
| 清理 | 最后任务已删除；bot-reap dry-run 无匹配；临时运行树已删除 | `E/q2-results.jsonl:23–25`；完成后再次 `bot-reap --dry-run --match bot-q2-schedule-` 无输出 |

**重启证据范围**：这是真实宿主/launcher 停止再启动，不是系统重启，也不是拔电崩溃恢复；未验证 flush 与 receipt commit 之间 crash 的 exactly-once。仅跑定向轻量探针，未跑全量回归 / 构建。

### BRIEF 四项论断的核定

1. **重启后任务仍在：PASS（本次 every-60s、原会话路径）。** Host-wide schedule domain 与 session JSONL 都在临时 HOME 持久；重启无需人为 reopen 会话。
2. **离线错过只补最近一次：PASS（本次固定周期错过两次）。** 静态公式 `S/lib/index.js:581–595` 用 `target + floor((now-target)/interval)*interval` 算最近到期；实测相符。不扩张为所有时区/DST规则已验收。
3. **投递有回执：PASS，但只是 durable inbox 投递确认。** `S/lib/index.js:1584–1611` 先 followup，再 await sessions.flush，再存 scheduledAt/deliveredAt/messageId；不是模型执行完成、业务成功或工具副作用成功回执。history 实测默认 retention 为 30 天 / 200 条；删除任务也删除其 history，不能直接当永久审计库。
4. **上轮未结束时跳过并留记录：FAIL。** 安装 runtime 没 executing/whenIdle 准入闸，实测第二次照样进入 nextTurn 且记成功投递回执。单 agent 的回合排队不等于任务级跳过。若 BRIEF 把此项列作待补胶水，则仍是待实现项，不是上游现成保证。

## 4. 制品与较新源码的能力差距

安装版 `S/lib/index.js:2100–2126` 仅接受 `at / after_seconds / every_seconds / daily / weekly / cron`，每个任务绑定传入的原 `sessionId`；存储 status 为 active/inactive（`:1663–1677`）。**没有 rrule selector，也没有 new_once/new 目标创建接口。** 所以派发时 BRIEF 表格若把 rrule、新会话目标与旧 selector 并列写成“已装具备”，应拆成版本表，不能沿用一个大勾。

本地参考仓 `/home/lingxufeng/bot/repos/deepseek-harness/packages/schedule/schedule/src/runtime.ts:70,202–215,353–381` 有 executing、whenIdle 和后续 requestDrive；`.../tool-schedule/src/index.ts:35,236–248,381–387` 有 systemPrompt、rrule 与三种目标。它的复用会话策略是**上一轮结束后重新计算并投递最近一次**，仍非“每个被略过 tick 都有一条 skip 记录”。该较新实现只读源码核验，未替换当前包运行。

如 L4 需求不降级，最短后续顺序是：先评估整代上游兼容升级能覆盖多少；剩余精确 skip 审计、结果回执与授权关联再由 director 定胶水边界。这里**不建议新建第二套 scheduler**，也不批准复制 runtime 自维护。

## 5. source kind、P6-21 与 D-1

- 安装版投递是 `role:'user'`，但可信来源标签为 **`source:{kind:'schedule'}`**（`S/lib/index.js:1574–1585`；实测 `E/q2-claims.jsonl:1–4`）。不是 `pbots-worker`，也没有把定时消息伪装成来源缺省的人工输入。
- `/home/lingxufeng/bot/app/sdk/src/orchestration/create.mjs:47–50` 从 inbox claimed 收集 source.kind；`.../turn-origin.mjs:11–21` 只把 `pbots-worker` 判作 tainted。直接运行该分类函数：schedule-only → false；worker-only → true；schedule+worker → true，证据 `E/q2-origin-check.json:1–31`。**现行 P6 不会仅因 schedule 标签拦住编排工具，混入 worker 回报仍保持 taint。**
- 因而“增加第三类回合”**不是让 schedule 服务跑起来的技术前提**；它是 P7 对长期用户委托、授权范围和审计来源的产品/安全建模选择。不能以 source.kind=schedule 或 reminder 正文中的 “from the user” 就认定它拥有当前人工用户全部权限。
- 安装版可信 source 中仅有 kind，没有 taskId、creator、mandate、授权范围或有效期。任务 id 在正文 framing，正文不是新的可信授权字段；原生任务存储也没有提供这里所需的完整授权绑定。若 D-1 要选择“明确授权的第三类”，需要把已确认授权与具体任务身份建立可校验、持久关联，并定义与 tainted 消息混合后的规则；本次不替用户拍板，也不修改 P6 放行范围。

## 交付边界

已验证后端真实默认挂载、短延时、循环、删除、跨进程持久化、latest-missed、持久 inbox 回执与来源；已明确否证 every-2s 和 overlap skip-and-record。未验证新版本升级、全部 recurrence/DST、业务完成回执、崩溃 exactly-once、永久审计、第三类授权契约或 0.78.1 UI。本文件不构成完整 P7 L4 验收通过。
