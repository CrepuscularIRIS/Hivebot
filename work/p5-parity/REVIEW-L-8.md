verdict: FAIL

base: d89dfdee32be3cda2fb8af4ab2dacbe50a3b0e56  head: 92cb6af0d7ed3ae47e8a3a598f1bdab51ab6ddf3
（head 变了本报告作废）

# L-8 code review（范围 d89dfde..92cb6af）

## 阻塞问题

### R1. 审批门静默失效：policy-state 文件被删除后文件工具无门放行

- **file:line**: /home/lingxufeng/bot/app/sdk/src/policy/shell-ask.mjs:202
- **severity**: major
- **verdict**: CONFIRMED
- **summary**: L-7 R6 的 fileGateOpen 把「policy-state 文件不存在（ENOENT）」当「从未 provision」放行文件工具，但该语义无法区分「从未存在」与「存在后被删除」：一个已 provision（例如 paused:true）的状态文件被删除后，文件工具的门在下一个调用就静默打开，回到无门控放行，没有任何出卡或日志。
- **触发条件**: 候选路径上存在 policy-state.json（内容为 paused/fault/instance 不符等有效关门态——由 P5-29 写端、测试或运维手工 provision），随后该文件在会话进行中被删除（数据目录清理/轮换、main 非原子重写在中途崩溃只留空缺、手工 rm）。下一次 workspace read/write 调用时 policyStateValid()=false 且 policyStateProvisioned() 对全部路径 ENOENT=false，fileGateOpen() 返回 true。当前生产写端未交付故文件通常不存在，但一旦 P5-29 落地或任何手工/测试 provision 发生，该删除转移即可达。
- **失败表现**: 暂停/故障的 bot 在无卡、无日志的情况下恢复自主读写工作区文件（仍受 workspace fence 与 guard 掩蔽约束，无越区能力）；never 会话的委派子代理同样恢复文件工具执行。这是审批门的静默失效，用户无从感知暂停已被推翻。
- **verifier 证据**: 本次新增的 /home/lingxufeng/bot/app/sdk/src/policy/shell-ask.mjs:118-129 只检查当前 statSync 结果，全路径 ENOENT 即返回 false，没有记录此前是否已 provision；:202-203 因而把「存在后被删除」也当成「从未存在」放行。实际配置由 /home/lingxufeng/bot/app/sdk/src/start.ts:272-279 注入数据目录下的 policy-state.json，读取并非仅用于测试。已在 /dev/shm/mm-review-XXXX 临时目录内用真实 apply 注册的同一个 pre-execute 监听器复现：先写入 version:1、paused:true、instance 匹配的状态，工作区 read/write 在 ask 会话均返回 ask、在 never 会话均返回 deny；随后只删除该状态文件，两类会话的 read/write 均立即调用 next。临时目录已清理，仓库未修改。调用路径为 shell-ask.mjs:104 拒绝 paused 状态，:282、:288 通过 fileGateOpen 决定文件工具是否进入 next；:211 的 never 拒绝只在 ask 分支执行，因此也无法守住删除后的放行。此变化确由本次改动引入：此前这两处直接调用 policyStateValid，缺失时仍为 false。需限定影响：当前 P5-29 生产写端尚未交付（/home/lingxufeng/bot/app/sdk/tests/unit/policy.test.ts:443-445），不能据此声称已有 UI 暂停操作或非原子生产写端崩溃会触发；但候选明确包含已手工 provision 后被外部清理或删除的情形，该情形现有代码可直接达到且没有历史状态守卫。它会静默撤销已有暂停/故障门控，故保留 major；不是越工作区或凭证访问绕过。
- **finder**: glm:安全

### R2. 工具实参为合法 JSON 的 null 时结果卡投影抛异常，整页转录加载失败

- **file:line**: /home/lingxufeng/bot/app/ui/renderer-grok/overrides/modules/model.ts:37
- **severity**: major
- **verdict**: CONFIRMED
- **summary**: 工具实参为合法 JSON 的 null 时，新增的结果卡投影会抛异常，使该会话的转录无法正常加载或更新。
- **触发条件**: 模型发出 arguments='null' 的工具调用后，SDK 会记录原始 tool/call 并生成参数校验失败的 tool/result；/home/lingxufeng/bot/repos/deepseek-harness/packages/core/tools/src/batch.ts:157-159 在 prepare 校验前记录调用，/home/lingxufeng/bot/app/ui/renderer/session/reduce.ts:135、155 将原始实参与错误结果带入投影。新增的 /home/lingxufeng/bot/app/ui/renderer-grok/overrides/modules/model.ts:37 将 JSON.parse('null') 直接断言为对象，随后第 40 行访问 args.command 或 args.path。
- **失败表现**: 实测调用 projectTranscriptEntry({kind:'tool-call',name:'bash',status:'failed',args:'null',result:'FULL OUTPUT',id:'t',timestampMs:1},0,'Bot','a') 抛出 Cannot read properties of null (reading 'command')。该异常在 /home/lingxufeng/bot/app/ui/renderer-grok/overrides/modules/model.ts:88-100 的 feed/page 聚合投影中没有隔离，因此一个应当仅显示工具错误的模型输入，会导致整页历史投影失败；持久化的坏调用在刷新后仍会触发。
- **verifier 证据**: Reproduced live (temp script in /dev/shm, deleted): toolResultOf with {name:'bash', status:'failed', args:'null', result:'FULL OUTPUT'} throws exactly `TypeError: Cannot read properties of null (reading 'command')`; every other malformed args shape ('not json', '"str"', '[1,2]', '123', '') is safe — the crash is specific to JSON.parse returning null.

  Premise chain, each verified in code:
  1. args='null' reaches the entry unmodified. Wire event carries raw model string: repos/deepseek-harness/packages/core/session/src/types.ts:369 (`arguments: string`), appended at tools/src/batch.ts:247-249 before prepare (batch.ts:157 start → 159 prepare). UI reducer preserves it verbatim: app/ui/renderer/session/reduce.ts:135; shim carries it out: app/ui/renderer-grok/shim/src/entries.ts:106 (`args: e.args` — line newly added in this diff). No guard anywhere.
  2. The entry passes the line-34 gate. A null-arguments call still gets a tool/result: parseArguments (batch.ts:98-106) maps 'null' → JSON null (valid JSON, text-preservation only catches parse errors); the tool body throws on null args (e.g. tool-bash validateBashArgs, packages/shell/tool-bash/src/index.ts:74 `args.command.trim()`), and body throws convert to isError results via pipeline.ts:362/379/385 → toolErrorResult (pipeline.ts:695-703, content `Error: <msg>`, non-empty); settlement.commit appends tool/result at batch.ts:256-258. reduce.ts:155 maps it to status 'failed' + non-empty result, so model.ts:34 (result null/empty && decision null → return null) does not block.
  3. Upstream projection returns a tool-call entry: app/ui/renderer-grok/frontend/src/production/model.ts:395-406 (name 'bash' valid, status 'failed' in vocabulary at 275-279), so the override's toolResultOf runs (overrides/modules/model.ts:57-62).
  4. The crash site: model.ts:36-37 — `JSON.parse('null')` returns null without throwing; the `as Record<string, unknown>` cast is compile-time only; `args` becomes null; argString dereferences at model.ts:45-46 (`args[key]`) run OUTSIDE the try (which wraps only the parse). Contrast: the pre-existing argText in shim/src/entries.ts:20-26 wraps both parse and dereference in one try/catch and is safe — the poisoned entry survives serialization and crashes only in the new override.
  5. No isolation and full impact: model.ts:57-62, 88-93 (flatMap), 95-104 (map) have no per-entry try/catch. Consumers (wired via overrides/vite.config.ts:32): ProductionRenderer.tsx:2237 initial page load — caught at 2243 but converts the ENTIRE transcript to a load error (2250), and the persisted poisoned entry re-triggers on every refresh (openAgentTail at 2232-2237); ProductionRenderer.tsx:979 pagination fetchPage rejects; ProductionRenderer.tsx:2341 (feed onBaseline), 2359 (onUpdated), 2382 (onAppended) have no try/catch at all.
  6. Introduced by this diff: `git show d89dfde:app/ui/renderer-grok/overrides/modules/model.ts` → file did not exist at base; created in 92cb6af. New tests (app/ui/tests/unit/grok-shim/p5-w3f1.test.ts:59,66) only use well-formed object args ('{"command":"rm x"}'), so the case is uncovered.

  Severity major is appropriate: model-emitted tool arguments are untrusted wire input (harness convention: validate at model/tool JSON boundaries); one `arguments: "null"` emission permanently breaks that agent's transcript view (load-error on every refresh; uncaught on live feed paths). Not security/data corruption, so not critical.
- **finder**: sol:后端逻辑

### R3. 成功审批决定写入优先 summary，遮住完整输出与错误详情

- **file:line**: /home/lingxufeng/bot/app/ui/renderer-grok/overrides/modules/model.ts:48
- **severity**: major
- **verdict**: CONFIRMED
- **summary**: 新增结果卡把成功审批决定写入优先展示的 summary，导致经过审批的工具仍然看不到完整输出或错误详情。
- **触发条件**: 用户批准一个 bash 或其他需要审批的工具后，/home/lingxufeng/bot/app/ui/renderer/session/reduce.ts:146-149 将 approval/decided.outcome 保存为 decision='allowed-once'；工具完成后，新增的 /home/lingxufeng/bot/app/ui/renderer-grok/overrides/modules/model.ts:48 将该非空决定放进卡片 summary，即使第 49 行已经带有完整 result。
- **失败表现**: 实际卡片在 /home/lingxufeng/bot/app/ui/renderer-grok/frontend/src/recovered/features/conversation/tool-results/view.tsx:45、53 只渲染 summary || diff || output，因此展开时只显示 allowed-once，完整 stdout、stderr 或执行失败原因被遮住。已通过真实投影函数复现：decision='allowed-once'、result='FULL OUTPUT' 的最终展示 detail 为 allowed-once。这使本次结果卡修复在生产中最常见的普通 bash 审批路径上仍不生效。
- **verifier 证据**: CONFIRMED via code trace + live repro of the real projection function. Premises: (1) approved tool gets decision='allowed-once' — app/ui/renderer/session/reduce.ts:146-149 sets decision=str(data.outcome), outcome 值域 ⊆ {allowed-once, rejected} per app/ui/renderer-grok/shim/src/data.ts:6 and coordinator.ts:49-50; tool/result (reduce.ts:151-155) sets only status/result and never clears decision. (2) decision survives to the raw entry — app/ui/renderer/fold/turn-fold.ts:94 and app/ui/renderer-grok/shim/src/entries.ts:106 both carry decision. (3) new app/ui/renderer-grok/overrides/modules/model.ts:33 reads value.decision, :48 `summary: decision ?? ''` unconditionally — not conditioned on result presence (line 49 carries full result; the line-48 comment "置空让 output 全文呈现" states the intent the code fails to implement). (4) render shadows output — app/ui/renderer-grok/frontend/src/recovered/features/conversation/tool-results/view.tsx:45 `detail = summary || diff || output`, :53 renders only detail; card mounted at workspace/transcript.tsx:594 (import :28). (5) new in this diff — model.ts is +116 lines added in 92cb6af (whole file new); upstream production/model.ts has no decision/toolResult handling; override registered live at app/ui/renderer-grok/overrides/vite.config.ts:32. (6) test gap — app/ui/tests/unit/grok-shim/p5-w3f1.test.ts:58-62 covers only result:null+decision:'rejected'; all success-path tests (:27-35,39,45,75) omit decision. Live repro in /dev/shm/mm-review-XXXX running the actual model.ts projectTranscriptEntry: {name:'bash',status:'done',result:'FULL STDOUT OUTPUT',decision:'allowed-once'} → card summary='allowed-once', output='FULL STDOUT OUTPUT', rendered detail='allowed-once' (control without decision → detail='FULL STDOUT OUTPUT'). Effect: the L-7 R2 fix's stated goal (entries.ts:101-102 "展开工具行可见输出/错误详情") is defeated on the most common approved-bash path — expanded card shows only 'allowed-once'; users still cannot see full stdout/stderr/failure reasons (outline detail above shows only the ≤120-char upstream preview). Severity major kept: feature ineffective on primary path, no data loss/security impact. Fix shape: summary should fall back to decision only when result is empty, e.g. `summary: result ? '' : (decision ?? '')`.
- **finder**: sol:后端逻辑

### R4. 一次性联网许可可被多个后台 bash 共享，重复执行本地副作用

- **file:line**: /home/lingxufeng/bot/app/sdk/src/policy/shell-ask.mjs:252
- **severity**: major
- **verdict**: CONFIRMED
- **summary**: 联网许可只读检查可以让多个后台 bash 调用共享一次审批，从而重复执行本地副作用。
- **触发条件**: 用户批准一次含本地写入的命令，例如 `printf x >> log.txt; curl https://example.com`，随后模型在同一会话连续提交两个相同的后台 bash 调用。/home/lingxufeng/bot/repos/deepseek-harness/packages/shell/tool-bash/src/index.ts:498-509 在注册后台任务后立即返回，不等待 wrapper 抢占许可；因此第二次调用可以在第一次 wrapper 删除许可之前到达 /home/lingxufeng/bot/app/sdk/src/policy/shell-ask.mjs:252-253。局部探针确认，在同一许可尚未被 wrapper 消费时，两次 pre-execute 都返回放行。
- **失败表现**: 两个调用都跳过 bash 审批。虽然 /home/lingxufeng/bot/app/sdk/sandbox/bwrap-wrap.py:133-141 的 unlink 只允许一个调用获得网络，但另一个调用会经过该文件:397-402 的断网分支继续执行原命令，而不是拒绝执行；因此两个调用都会追加文件或产生其他本地副作用。此次改动把一次性联网许可同时用作 bash 执行授权，却没有为执行授权提供一次性抢占，破坏了卡面承诺的单次使用语义。
- **verifier 证据**: All premises verified in code (head 92cb6af); the O5 gate is introduced by this diff. (1) The gate: app/sdk/src/policy/shell-ask.mjs:246-254 — when bashAlways is false, `hasLivePermit(permitDir, sessionHeaderId(exec), command)` returns next() (no ask card); permitDir wired in app/sdk/src/start.ts shellAskRow (`permitDir: join(cfg.dataDirs[0] ?? cfg.home, 'network-permits')`). (2) In the production default this is the only card-free bash path: app/sdk/profile/tiers.json has bash=sandbox-allow but bashAlways (shell-ask.mjs:245) also requires policyStateValid, false while the P5-29 writer is undelivered (file header lines 20-23). (3) hasLivePermit is purely read-only — app/sdk/src/policy/request-net.mjs:100-126 (readdirSync/readFileSync, no unlink); local probe in /dev/shm: 3 consecutive checks on one unconsumed permit all returned true, file intact. The only consumer is the wrapper. (4) Background bash returns before any wrapper claims: repos/deepseek-harness/packages/shell/tool-bash/src/index.ts:498-509 returns {kind:'background'} immediately after startJob; startJob (index.ts:266) spawns the wrapper asynchronously inside registry.start's run(). Background is enabled here: enableRunInBackground defaults true (index.ts:57,203), tool-bash rows in app/sdk/profile/patches/approval.yml:73-75/200-202/329-331 carry no override, dsh-tool-jobs is composed (approval.yml:86). Two identical bash calls in one model message therefore both pass pre-execute while the permit file still exists (wrapper spawn+python startup+listdir+unlink takes tens of ms; no tight race needed). (5) No dedup of identical calls: app/sdk/src/policy/guard.mjs only enforces NEVER roots and DFA-session denial. (6) The extra execution is not rejected: app/sdk/sandbox/bwrap-wrap.py:133-141 claim is os.unlink (only one wrapper wins); a later wrapper gets ENOENT → continue → no match → falls past the networked branch to os.execv(BWRAP, out) (main() tail, the offline-sandbox branch) — the command still executes, so local side effects (e.g. `printf x >> log.txt` inside the workspace) repeat without network. (7) Semantics break: the card text promises single use (shell-ask.mjs:226; request-net.mjs:143,179), and the O5 comment's own worst-case claim at shell-ask.mjs:250 ("TOCTOU 无害——最坏情形退化为现状… wrapper 断网执行") is wrong for repeat calls: pre-O5 a second identical bash produced an ask card and, unapproved, no execution at all. Net effect: one approved request_network permit authorizes N bash executions (extras offline, sandbox-confined) until the first wrapper's unlink or the 60s TTL. Severity major (as filed): security/protocol surface, approval-gate invariant broken with a trivially reachable trigger (batch two identical background bash calls), but extras get no network, no sandbox escape, and the command string was approved once — not critical.
- **finder**: sol:并发与数据完整性

## 上轮未修

无

## 其他发现

### O1. 每次快照重复序列化全部历史工具输出

- **file:line**: /home/lingxufeng/bot/app/ui/renderer-grok/shim/src/entries.ts:106
- **severity**: minor
- **verdict**: CONFIRMED
- **summary**: R2 起 tool-call 的 RawEntry 原样携带完整 args/result 字符串，而 data.ts 的 entriesOf 每次快照都对整个 SessionView 重新 serialize——历史每一条工具调用的全量输出在之后每次 transcript 快照/轮询里都被重复序列化并跨 coordinator 端口传输。
- **触发条件**: 会话中出现大体积工具输出（模型可控：bash cat 大文件、长构建日志等），之后每次 entriesOf 调用（transcript 请求、tail 推送）都重建含全部历史完整输出的 RawEntry[]，成本 O(条数×单条全量输出)。
- **失败表现**: 每次快照的序列化与跨端口传输体积随会话内工具输出总量线性累积，重度会话（构建日志、大文件 cat）下渲染端内存与 CPU 持续放大、UI 卡顿；纯健壮性回归，无权限边界跨越。
- **verifier 证据**: 本次新增的 /home/lingxufeng/bot/app/ui/renderer-grok/shim/src/entries.ts:103-106 将完整 args/result 放入每次返回的 RawEntry，确实增加了历史输出的重复传输成本。/home/lingxufeng/bot/app/ui/renderer-grok/shim/src/data.ts:175-185 每次都序列化整个 view.items，且 :193-202 对每个 follow 事件（包括流式 chunk）立即推送快照；:208 的 maxMessages=40 只限制初始历史，/home/lingxufeng/bot/app/ui/renderer/session/reduce.ts:131-155 对后续工具调用持续追加并保存完整结果，没有滚动淘汰或输出截断。实际传输不是 JSON stringify，而是 /home/lingxufeng/bot/app/ui/renderer-grok/shim/src/index.ts:50-52 接入的 coordinator emit，最终在 /home/lingxufeng/bot/app/ui/renderer-grok/shim/src/coordinator.ts:66-68、80-82 通过 MessageChannel.postMessage 结构化克隆整个快照，折叠工具卡不会免除该成本。在 /dev/shm/mm-review-* 临时目录使用实际 reduceFollow、serialize 和 foldTurns 做对照，追加 200 个各含 64 KiB 文本结果的工具调用：base 快照 JSON 等价体积为 22,594 字节，head 为 13,141,994 字节；各做十次 structuredClone 分别耗时约 3 ms 和 284 ms。这证明持续会话中的普通工具结果即可造成新增的重复复制与主线程开销；具体卡顿程度取决于输出量、chunk 频率和硬件，因此保留 minor，不宣称存在权限边界问题。实验临时目录已删除，仓库未修改。
- **finder**: glm:安全

### O2. CoordinatorPortBridge 类型引用悬空（TS2459）

- **file:line**: app/ui/renderer-grok/overrides/modules/coordinator-client.ts:9
- **severity**: minor
- **verdict**: CONFIRMED
- **summary**: 从上游模块 import 的类型 CoordinatorPortBridge 并未被上游 export（TS2459: declares 'CoordinatorPortBridge' locally, but it is not exported），类型引用悬空。
- **触发条件**: 对包含 overrides/ 的工程图运行 tsc --noEmit（实测：tsc -p 覆盖 overrides/modules + shim/src 即报 coordinator-client.ts(9,8) TS2459；上游 frontend/src/production/coordinator-client.ts 只从 ../recovered/contracts/desktop-bridge import 该类型、未 re-export，export 列表里只有 ProductionCoordinatorClient 等）。
- **失败表现**: 无运行时影响（import 带 type 修饰符，esbuild/vite 构建会剥掉），但任何把覆盖层纳入类型检查的步骤（未来的 tsc 门禁 / IDE 严格模式）会在此报错，且经 export * 透传后其他模块也无法从覆盖层引用该类型。修法：改从 ../../frontend/src/recovered/contracts/desktop-bridge 导入 CoordinatorPortBridge。
- **verifier 证据**: 本次新增的 /home/lingxufeng/bot/app/ui/renderer-grok/overrides/modules/coordinator-client.ts:9 从上游模块导入 CoordinatorPortBridge，并在第25行作为参数类型使用，但 /home/lingxufeng/bot/app/ui/renderer-grok/frontend/src/production/coordinator-client.ts:2 仅导入该类型，全文没有重新导出；其真正导出位置是 /home/lingxufeng/bot/app/ui/renderer-grok/frontend/src/recovered/contracts/desktop-bridge.ts:259。触发路径不是纯粹未来假设：/home/lingxufeng/bot/app/ui/tsconfig.json:16 已包含 tests/**/*.ts，而 /home/lingxufeng/bot/app/ui/tests/unit/grok-shim/p5-w3f1.test.ts:16 直接导入该覆盖模块，因此运行 UI 类型检查会遍历到问题文件。在 /dev/shm/mm-review-* 创建继承现有 UI tsconfig 的临时配置进行验证；原配置因缺失 node 类型声明提前报 TS2688，临时仅设 types:[] 绕过这一无关前置错误后，tsc --noEmit 实际报出 coordinator-client.ts(9,8): TS2459，证明该导入确实非法。临时目录已删除，仓库未修改。严重性维持 minor：/home/lingxufeng/bot/app/ui/renderer-grok/package.json:8 的正式构建使用 Vite，type-only 导入会被擦除，没有证据表明此问题影响运行时或当前构建。
- **finder**: glm:正确性+合规

### O3. 创建通知经分页首页保存后无法撤下

- **file:line**: app/ui/renderer-grok/shim/src/data.ts:178
- **severity**: minor
- **verdict**: CONFIRMED
- **summary**: The O4 create notice is part of the first page that openAgentTail returns, and the pagination controller keeps that page. Once the first user message arrives, the shim removes the notice from the live snapshot, but ProductionRenderer's mergeOlderTranscriptEntries(liveEntries, pagination.entries) puts any id that is missing from live back at the top, so the notice never actually clears.
- **触发条件**: Create a bot through the chooser (ui.createBot) and have req.model's selectModel fail, so createNotices.set(sid, …) runs. Upstream openAgent then calls openAgentTail, entriesOf returns create-notice-<sid>, and installInitialPage stores it. The user then sends the first message.
- **失败表现**: The 'Bot created, but the model wasn't changed' notice stays pinned above the conversation, which contradicts O4's rule that it is removed once the first user message arrives. Because the R3 pagination override restores the saved page, the notice also comes back after every A→B→A switch for the life of the process.
- **verifier 证据**: 触发链可达。/home/lingxufeng/bot/app/ui/renderer-grok/overrides/modules/new-bot-dialog.tsx:108-111 在选定模型后调用 ui.createBot，并在创建成功时返回新会话 ID；/home/lingxufeng/bot/app/ui/renderer-grok/shim/src/data.ts:442-448 在 selectModel 返回失败时仍保留创建结果，并新增 createNotices 条目。chooser 的结果经该文件:396-400 返回给生产渲染器，/home/lingxufeng/bot/app/ui/renderer-grok/frontend/src/production/ProductionRenderer.tsx:2815-2819 随即打开新会话。新会话尚无用户消息，data.ts:162-172 会生成 create-notice-<sid>，并由该文件:337-346 的 openAgentTail 带入首页。ProductionRenderer.tsx:2237-2239 把整个首页安装到分页控制器。首条用户消息到达后，data.ts:166-169 确实从 shim 的实时快照移除通知，但 ProductionRenderer.tsx:2337-2354 的 baseline 更新只替换 entriesByAgent，不清理分页首页；该文件:1634-1638 仍将实时条目与分页条目合并，而 /home/lingxufeng/bot/app/ui/renderer-grok/frontend/src/recovered/features/conversation/workspace/pagination.ts:101-106 明确把实时列表中缺失的分页 ID 重新前置，因此通知仍会显示。新增的 /home/lingxufeng/bot/app/ui/renderer-grok/overrides/modules/pagination.ts:31-39、44-50 又保存并恢复包含通知的首页，ProductionRenderer.tsx:2219-2228 对已有实时缓存的会话不会重新抓取首页，所以 A→B→A 也不会移除此通知。该问题由本范围新增的 createNotices 首页条目引入；影响是非致命提示未按设计撤下，维持 minor。
- **finder**: opus:跨文件深度

### O4. 分页恢复保存整页，临时条目（审批卡/思考块）跨切换残留

- **file:line**: app/ui/renderer-grok/overrides/modules/pagination.ts:44
- **severity**: minor
- **verdict**: CONFIRMED
- **summary**: The R3 override saves the whole initial page from openAgentTail and installs it again when the user switches back. That page includes temporary shim entries: perm-<eventId> approval cards, live-reasoning and create-notice. Before this change, setScope cleared these when the user left the bot. Now they come back after a switch and get merged ahead of the live entries.
- **触发条件**: Open bot A for the first time while it has a pending approval or is streaming reasoning, so the tail page contains perm-<eventId> or live-reasoning. Answer the approval (or let main's deadline answer it), or let the stream finish. Switch to bot B, then back to A: setScope restores the saved page with saved.get(key) and installInitialPage.
- **失败表现**: pendingLocalToolPermission is computed from the merged entries (ProductionRenderer.tsx:1764). It sees the restored perm-* entry still marked pending, so the dock shows an approval card that can no longer be answered. A stale thinking block can also appear at the top of the conversation. Neither goes away on later switches, because hasLoadedEntries skips any fresh openAgentTail.
- **verifier 证据**: 该改动确实新增了临时条目跨会话切换后持续残留的问题。/home/lingxufeng/bot/app/ui/renderer-grok/shim/src/data.ts:263-264 在首次打开主 bot 的 tail 之前就启动 follow，因此首次 tail 含正在进行的思考或审批是可达的；同文件:175-185、337-346 将 live 序列化条目和 perm-* 审批条目一起作为首页返回。/home/lingxufeng/bot/app/ui/renderer-grok/overrides/modules/pagination.ts:35-39、47-50 不区分历史与临时条目，保存整页并在回切时重新安装。审批作答后，/home/lingxufeng/bot/app/ui/renderer-grok/shim/src/data.ts:386-393 删除 ask 并推送最新快照，但 /home/lingxufeng/bot/app/ui/renderer-grok/frontend/src/production/ProductionRenderer.tsx:2338-2354 只替换 liveEntries，没有更新分页首页。其 :1634-1638 又将分页页与 liveEntries 合并；/home/lingxufeng/bot/app/ui/renderer-grok/frontend/src/recovered/features/conversation/workspace/pagination.ts:101-106 仅按仍存在的相同 ID 去重，因此已从 live 快照消失的 perm-* 或 live-reasoning 会重新进入显示条目。审批 scope 守卫并非必然阻断：/home/lingxufeng/bot/app/ui/renderer-grok/frontend/src/production/local-tool-permission-scope.ts:23、31-45 对同账户不重置，并接受等于当前 revision 的条目；只要首页安装后该审批未再发布更高 revision，且没有其他审批推进 revision，旧卡仍通过。ProductionRenderer.tsx:1777-1784 据此选中已失效的 pending 审批，而 :2219-2228 对已加载 bot 提前返回，不会重新获取 tail。初始页在当前会话内残留的机制原先已存在，但旧 setScope 会清空分页页（上游 pagination.ts:170-179）；本次新增缓存恢复使切走再切回也无法清除，属于本次引入的持久化回归。维持 minor，影响为过期审批卡及思考内容残留，不构成执行权限绕过。
- **finder**: opus:跨文件深度

### O5. 每个流式 delta 克隆并重新投影全部历史工具输出（性能）

- **file:line**: app/ui/renderer-grok/shim/src/entries.ts:106
- **severity**: minor
- **verdict**: PLAUSIBLE
- **summary**: R2 now puts the full args and full result text into every tool-call raw entry. The shim re-serializes the whole view on every follow item (onFollowItem → pushTranscript, sent as a snapshot), and the renderer's onBaseline re-projects every entry. The model.ts override runs JSON.parse on each entry's args. As a result, each streaming delta clones and parses every tool output in the session.
- **触发条件**: A long session with several large tool results, for example a few read or bash calls that each return around 100 KB, followed by a new assistant reply that streams.
- **失败表现**: Each token delta sends megabytes over the MessagePort via structured clone, then re-parses and re-renders every entry. Before this change only 120-character summaries crossed the port. The UI stutters, and CPU and memory use climb as the session grows.
- **verifier 证据**: 数据量放大的路径确实可达：/home/lingxufeng/bot/app/ui/renderer/session/reduce.ts:151-155 将工具结果全文保留在视图中，:215-218 处理后续 assistant-stream chunk；/home/lingxufeng/bot/app/ui/renderer-grok/shim/src/data.ts:193-201 对每个 follow item 推送 transcript，:175-185 和 :507 重新生成包含当前视图全部条目的 snapshot。本次 /home/lingxufeng/bot/app/ui/renderer-grok/shim/src/entries.ts:103-106 新增完整 args/result，因此历史工具输出会随每个后续 chunk 重复传输；/home/lingxufeng/bot/app/ui/renderer-grok/shim/src/index.ts:52 和 /home/lingxufeng/bot/app/ui/renderer-grok/shim/src/coordinator.ts:80-82 将该 payload 交给 MessagePort.postMessage，没有增量去重。消费端 /home/lingxufeng/bot/app/ui/renderer-grok/frontend/src/recovered/features/conversation/cards/transcript-card/transcript-feed-source.ts:93-98 每次 snapshot 都调用 onBaseline，而 /home/lingxufeng/bot/app/ui/renderer-grok/frontend/src/production/ProductionRenderer.tsx:2338-2354 重新投影并替换条目数组，故重复复制全文和重建投影的开销有代码依据。但是候选中的"重新解析每个工具输出"不准确：/home/lingxufeng/bot/app/ui/renderer-grok/overrides/modules/model.ts:33-37 仅 JSON.parse(args)，结果字符串只是赋给 output（:49）。此外 /home/lingxufeng/bot/app/ui/renderer-grok/shim/src/data.ts:25、:207-208 初始历史请求限制为 40 条消息，不能直接等同于每次重传会话全部历史。未取得真实 renderer 的帧时间、CPU 或内存测量，因此不能证明候选举例的几个约 100 KB 输出就会导致可观察卡顿，也不能证明存在持续内存增长；保留 minor 性能风险，尚不足以确认其失败表现。
- **finder**: opus:跨文件深度

## 超出预算未验证

无

## 已被否定

- app/ui/renderer-grok/overrides/modules/acknowledgement.ts:29 — retryWireNonces 在 upstream retryFailed 接受重试之前就无条件登记 fresh→root 映射，控制器拒收（返回 false）时映射残留，污染随后的兜底新发送（finder: glm:正确性+合规；已否定）

## 统计

- level: L
- task: L-8
- target: d89dfde..92cb6af
- finders: 6
- candidates: 12
- verified: 10
- refuted: 1
- dupes: 2
- overBudget: 0
- 阻塞问题（CONFIRMED + critical/major）：4（R1–R4）
- 其他发现：5（O1–O5）
