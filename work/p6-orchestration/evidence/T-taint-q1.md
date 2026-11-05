# T-taint.q1：followup / UNKNOWN_TOOL 只读查证

## 结论与证据边界
- **不能成立的泛化**：不是「所有 followup 回合的 when 工具都 UNKNOWN_TOOL」。普通 `session/prompt(mode=queue)` 本身也调用 `agent.followup`，与注入共享 driver / admission；见下文 Q1。
- **已确认机制**：UNKNOWN_TOOL 表示该调用未获得可执行 definition，不等于工具 execute 自身拒绝；admission 是本 step 的快照，不会因执行前撤销 restriction 而补入先前未接纳的工具。
- **定位到应用层的具体触发链**：`envelope.mjs` 的 unknown 身份 scoped restriction → metadata 恢复 → 直到 pre-execute 才撤限制 → 本 step 仍缺工具。它足以解释「干净回合 UNKNOWN_TOOL、回合外 visible=true」，无需假定 dsh 的 followup 分支坏了。
- **仍未确认**：REPORT:40 的 user-approval 探针没有随报告保存原始 tool/result / 创建时 metadata / step 工具表；不能断言该历史探针必然命中了上述链，也不能据它断言 live ①实际错误码就是 UNKNOWN_TOOL。本轮未运行任何测试、构建、安装或链接。
- 范围：下列 `D/` = `/home/lingxufeng/bot/repos/deepseek-harness/`，`A/` = `/home/lingxufeng/bot/app/sdk/`，`E/` = `/home/lingxufeng/bot/work/p6-orchestration/evidence/T-taint/`。源码与已装 alpha.2 关键路径均读取；参考仓未改。
- 版本边界：当前检出 `A/src/orchestration/create.mjs:76-79,109-112` 和 `turn-origin.mjs:19-21` 仍是 `.tainted` / 只认 pbots-worker；`E/REPORT.md:10-13` 描述的 coordinatorTainted 是另一个 builder 版本，不冒充当前检出已具备它。

## Q1：如何解析；为何 UNKNOWN_TOOL
1. `followup` 仅 `send(input,'next-turn',true)`；idle 时进入同一 `kick→turn→preStep`（`D/packages/core/agent-loop/src/agent.ts:170-181,230-250,268-270`）。正常 SDK queue prompt 也走 followup（`D/packages/api/session-controller/src/commands.ts:328-339`）。
2. 每 step 先 claim inbox，再捕获 model selection，再 `tools.resolve({agent:this,...})`，用同一个 toolSet assemble prompt；claim 同步发 `agent/inbox/claimed`，所以 turn-origin 已可参与 when（`D/packages/core/agent-loop/src/agent.ts:283-295`；同目录 `inbox.ts:108-112`；`A/src/orchestration/create.mjs:49-53`）。
3. `ToolsService.view(agent)` 先做 scope 继承/遮蔽/restrict；`resolve` **仅遍历此时可见的工具**，对其 when 求值，enabled 才加入 admitted（`D/packages/core/tools/src/index.ts:199-226,264-280`）。被 restrict 掉的工具连 when 都不会调用。
4. toolSet 绑定**同一个 Agent 对象**；关闭、换对象、definition/registration 被替换、当前 restriction 隐藏，均得不到对应 definition（同文件 `281-295`）。没有 toolSet 时，conditional 注册也不可执行（`251-255`）。
5. loop 原样把 toolSet 传给 execute，step 批次结束后才 dispose；native executor / batch 原样透传（`D/packages/core/agent-loop/src/agent.ts:390-393,586-593`；`D/packages/core/tool-executor-native/src/index.ts:19-20`；`D/packages/core/tools/src/batch.ts:55-70`）。未找到 followup 专属的漏传路径。
6. pipeline 先 pre-execute policy/guards，再 dispatch 查 `tools.executable`；找不到时抛 ToolNotFoundError，而不是调用 create_bot.execute（`D/packages/core/tools/src/pipeline.ts:70-80,190-215,258-281`）。因此正常隐藏工具被 fake 模型强行点名，UNKNOWN_TOOL 是合理结果；但 pre-execute guard 也能先返回 deny。
7. 已装产物交叉核对：`A/node_modules/.pnpm/@deepseek-ai+dsh-agent-loop@0.2.2-alpha.2_04206c7ddbce35230b2bfbbb790058fc/node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js:666-711,961-970` 保留 resolve 与 toolSet 透传；`A/node_modules/.pnpm/@deepseek-ai+dsh-tools@0.2.2-alpha.2_d570a50fd9051dfa7084c71da173b036/node_modules/@deepseek-ai/dsh-tools/lib/index.js:530-571` 保留 conditional fail-closed、admitted 与 scope/closed 检查。不是拿参考仓 HEAD 代替已装包作判断。

## Q2：精确触发条件与已定位的状态窗口
- **不是 when 注册或 followup 本身**：正常同 Agent、未关闭且 admitted 有 definition，即可执行；现有源码测试也明确区分 fresh admission 成功、旧/无 admission 失败（`D/packages/core/tools/tests/activation.spec.ts:43-89`；这里只读其断言，未运行）。
- **应用侧具体窗口**（`A/src/orchestration/envelope.mjs`）：metadata 缺失/坏 JSON/version 不符/非法 bots → unknown（`95-107`）→ `isEnveloped=true`（`121-128`）→ `agent/created` 或 bootstrap 给该 agent 挂 deny（`234-237,273-279,307-309`）。deny 包含 create/send/stop、再委派、后台工具（`36-51,211`），不限带 when 的工具。
- metadata 后来恢复，单纯写文件不触发 sweep；到 `tools/pre-execute` 才 lift（同文件 `290-313`）。**如果 step admission 已在 lift 前生成，其 admitted 没有该工具，本 step 不会补回**；下一次独立 resolve 可以可见。该上限原代码注释 `294-296` 已明确记载。
- live ①具备前半链的明确源码条件：独立空 f1data 建目录但没有预写 bots.json（`A/tests/unit/orchestration-create-live.test.ts:461-489`），先 session/create，再写健康 metadata，再 inject（`513-523`）；session/create 确实 mint live agent（`D/packages/api/session-controller/src/agent.ts:443-461`）。
- 对照正常 live describe，启动前刻意写健康 bots.json（同测试 `202-205`）。因此「followup 注入组失败、普通组正常」同时混入了 metadata 初始化差异，不能归因于来源种类。
- scope 注册/祖先继承只按共同 view 规则；会话重建会重新挂身份限制，不是 UNKNOWN_TOOL 的独立充分条件。换 Agent 却复用旧 toolSet 才必失败，但标准 loop 每 step 新建 toolSet，未找到本案发生该情况的证据。

## Q3：生产影响与 GREEN 哪格空转
- **普通用户回合**：健康身份、当前 step 正常 admitted 时没有 followup 特殊故障；unknown→健康窗口同样可能误伤普通回合第一批命中的 deny 工具，不仅自动唤醒回合。若没有任何工具触发 sweep，旧 restriction 还会继续影响后续 admission，直到既有 sweep 事件发生。
- **污染回合**：when=false 隐藏协调者工具属于预期；pbots-worker 还被全工具 taint-guard 提前拒绝（`A/src/orchestration/taint-guard.mjs:25-36`；注册于 `main-channel.mjs:213-224`）。所以即便 admission 缺工具，也不能推断最后结果一定 UNKNOWN_TOOL；正常接线下该 guard 可先产生 pbots/forbidden。
- **goal/schedule**：按 REPORT 所述 builder 版本只污染协调者工具，普通工具不应被全工具 guard 拒；但上述 unknown scoped restriction 窗口仍会独立遮蔽 deny 清单。当前检出未含 coordinatorTainted，不能据此文件声称其已修。
- **worker 回合**：协调者/再委派/后台工具原本应隐藏并由 envelope 拒绝；普通前台工作工具不因 followup 自动失效。restriction 的影响面是 deny 清单，不是「全部工具」或「全部 when 工具」（`envelope.mjs:36-54,138-152,182-190`）。
- **证据失真格**：live ①的「execute 自查拒绝」没有被这些断言证明：只要求 isError、不含 reached-main、requests=0、slots=0（`A/tests/unit/orchestration-create-live.test.ts:530-539`）；UNKNOWN_TOOL、taint-guard、envelope 等较早拒绝都能满足。它证明无建 bot 副作用，却不能证明 execute 内第 2.5 段被执行。
- live ①的 visible=false 是另一次 resolve 的结果（`A/tests/support/orchestration-create-inspect.mjs:51-60`），不是发生调用那一步的 admission；可证明当时可见性，不能反推此前 execute 到达位置。REPORT:40 把它推广成所有 when 工具及 live ①实际 UNKNOWN_TOOL，证据不足。
- T-taint 新增 goal visible 用例 / 直接调用 execute 的单测不因此自动失效；但本轮只读现有报告，未重新验绿。历史 user-approval 原始失败原因保留为未验证，不把上面的充分机制误写成已重现实证。

## Q4：若修，最小位置（只建议）
- **先别改 dsh admission**：现有 fail-closed / per-step snapshot 是明确语义。不要允许 `executable` 回退实时 get，也不要在 dispatch 临时重跑 when；会破坏同一步模型工具表与执行授权一致性。
- **最小验收修正位置**：`A/tests/unit/orchestration-create-live.test.ts` 的 f1 beforeAll，参照正常组在创建首个 agent 前预写合法零 worker metadata，排除 unknown restriction 干扰；若目标是 execute 第 2.5 段，则明确绕过/隔离 when 与全工具 guard 的定向 harness，并断言精确错误/命中点，不能只断言 isError。此建议不是本轮执行内容。
- **若产品要求恢复即首步可用**：最小业务位置是 `A/src/orchestration/envelope.mjs:290-313` 的恢复 sweep 时机，在 `tools.resolve` 之前利用既有更早生命周期点做撤销；目前 `agent/pre-step` 在 resolve 之后（Q1），移到那里仍晚。具体使用哪个前置扩展点需另行核对，不能在本轮凭空承诺；保留 unknown fail-closed，不必改 create/turn-origin。
- **若只查历史现象而不修产品**：低负载获准后，只需单个区分性探针保存 step 开始的 registered/admitted 名单、身份状态、pre-execute 前后限制及完整 tool/result；对照健康 metadata 首个 followup 与 unknown→健康首个 followup。当前资料不足以唯一还原 REPORT:40 的那一次运行。
