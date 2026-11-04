verdict: FAIL
base: 5bd36e0af6fed2ed00f9d9b317285cf77e639e4f  head: 4624670ff3ee04364c5d252607dfe1b23e506642  （head 变更则本报告作废）

level: L · task: P5-W3 · target: 5bd36e0..4624670 · incrementalFrom: null

## 阻塞问题

（verdict=CONFIRMED 且 severity 为 critical / major，共 6 条）

### R1 · app/sdk/src/policy/shell-ask.mjs:213 · major · CONFIRMED

**summary**：mcp__ 工具的档位查找 `tiers[exec.name] ?? (… tiers.mcp)` 缺少 `?? tiers.default` 兜底：当经文件头明文支持的 runtime patch / 后置 overlay `config.tiers` 整体覆盖档位表且省略 "mcp" 键时（validateTiers 只强制要求 default 键，line 120-125，该表校验通过），kind 为 undefined，越过 allow/ask/sandbox-allow 三个分支落入 workspace-write 兜底分支；MCP 工具在 guard extractPaths 中无路径候选，line 226 `if (total === 0) return next()` 直接放行。这违反同文件头的设计（第 7 行：连接器 mcp__ 前缀 → ask，『一律出卡』）与 A9② 的 fail-closed 约定（表坏全退 ASK）——一张能通过校验的表让连接器静默免审批。

**触发条件**：任一运营方/测试经文档化机制注入 config.tiers 覆盖表（如 `{default:'allow', bash:'sandbox-allow', …}` 无 "mcp" 行；单测 policy.test.ts 只用自带 mcp 行的默认表测过 mcp__ ask，未覆盖 overlay 缺键场景），随后模型调用任意 `mcp__*` 连接器工具。

**失败表现**：连接器（MCP）工具调用完全绕过每调用审批卡，直接执行——审批绕过；破坏本模块自己的『一律出卡』与 A9② fail-closed 契约（表有效但语义静默失效）。

**verifier 证据**：该问题由本次查表改动引入，且可经受支持的后置 overlay 触发。/home/lingxufeng/bot/app/sdk/src/start.ts:128-130 将 extraPatches 放在 runtime patch 之后；/home/lingxufeng/bot/repos/deepseek-harness/vendor/include/src/index.ts:120-123 对同 id 的 config 整键替换，因此可向 p2sdk-shell-ask 注入省略 mcp 行的 tiers。/home/lingxufeng/bot/app/sdk/src/policy/shell-ask.mjs:113-126 接受这样的表，只要求 default 合法，而 :213 对 mcp__ 工具取不到 tiers.mcp 时没有回退 default。运行时存在 fs.resolve 服务时，控制流进入 :225-226；/home/lingxufeng/bot/app/sdk/src/policy/guard.mjs:91-113 不为 MCP 工具提取路径，所以 total 为 0，直接 next()。外层 guard 也在同文件 :257-258 将此类工具委托给后续处理，不会补做审批。上游流水线 /home/lingxufeng/bot/repos/deepseek-harness/packages/core/tools/src/pipeline.ts:199-205 的最终默认结果为 allow，只有 ask 才调用审批服务。已用实际 apply/loadTiers 做最小实验：同一个 mcp__probe__search 调用，在 tiers={default:'ask'} 时返回 allow，增加 mcp:'ask' 后返回 ask。这比候选中的 default:'allow' 更直接证明默认审批策略被忽略，而不只是运营方显式选择放宽权限。默认完整档位表不受影响，但合法的稀疏覆盖表会静默绕过 MCP 每调用审批，因此维持 major。实验未修改仓库，临时目录已删除。

**finder**：glm:正确性+合规

### R2 · /home/lingxufeng/bot/app/ui/renderer-grok/shim/src/entries.ts:95 · major · CONFIRMED

**summary**：工具调用的序列化丢弃了完整执行结果，使展开工具行也无法查看输出或错误详情。

**触发条件**：任意 bash、read 或连接器工具产生执行结果时，/home/lingxufeng/bot/app/ui/renderer-grok/shim/src/entries.ts:92-96 只输出 name、status 和 summary；:31-35 的 summary 优先取命令或路径并截断为 120 字，不保留 result 和完整参数。

**失败表现**：/home/lingxufeng/bot/app/ui/renderer-grok/frontend/src/production/model.ts:395-405 只接收该摘要，而 /home/lingxufeng/bot/app/ui/renderer-grok/frontend/src/recovered/features/conversation/workspace/transcript.tsx:589-594 的展开区只能显示 summary 或另行提供的 toolResult，当前 shim 没有提供后者。因此命令即使失败，用户也只能看见命令摘要和失败状态，无法查看实际错误、文件内容或命令输出。序列化探针确认输入中的唯一结果字符串在输出中完全消失。

**verifier 证据**：Premise chain, all verified in head 4624670: (1) Input has full data — app/ui/renderer/fold/turn-fold.ts:15 and :91 emit tool-call entries with full `args: string` and `result: string | null`. (2) Serialization drops it — app/ui/renderer-grok/shim/src/entries.ts:92-96 emits only {kind,id,timestampMs,name,status,summary}; toolSummary (entries.ts:31-36) prefers argText (command/path/file_path/query/url, entries.ts:19-28) truncated to 120 chars, using `result` only as fallback when args lack those keys (and then whitespace-collapsed + truncated to 120). For bash/read/connector tools args always carry command/path, so the result string (error output, file content) disappears entirely from the shim output. (3) Projection propagates the loss — app/ui/renderer-grok/frontend/src/production/model.ts:395-405 projects tool-call picking only name/status/summary. (4) UI cannot recover it — app/ui/renderer-grok/frontend/src/recovered/features/conversation/workspace/transcript.tsx:587-596 renders the expanded detail as entry.summary plus ToolResultCard only when entry.toolResult != null; toolResult (optional, workspace/model.ts:263) is attached solely by createToolResultTranscriptBoundary (app/ui/renderer-grok/frontend/src/recovered/features/conversation/tool-results/transcript-boundary.ts:127-139 via applyToolUpdate :217-231), which has zero references outside its own file (grep across app/ui) — unwired recovered code. Grep of frontend/src/production/ finds no toolResult/tool-results/getToolResult reference and ProductionRenderer.tsx has no ToolResultCard usage. No guard, caller, or type constraint blocks any premise: a failed bash/read/connector run shows only a ≤120-char command/path snippet and a failed icon; the actual error text or output is unreachable anywhere in the UI. Introduced by this diff: git cat-file -e 5bd36e0:app/ui/renderer-grok/shim/src/entries.ts fails (file absent at base; renderer-grok tree created by P5-54/55 inside the range). Severity major (not critical: no data loss/security impact; not minor: the entire tool-output/error-detail surface is invisible to users, while upstream 0.78.1's ToolResultCard machinery exists in the recovered layer but is never fed).

**finder**：sol:后端逻辑

### R3 · /home/lingxufeng/bot/app/ui/renderer-grok/frontend/src/production/ProductionRenderer.tsx:2226 · major · CONFIRMED

**summary**：再次打开已缓存的 Bot 时，分页状态被清空后直接返回，导致历史消息无法继续加载。

**触发条件**：打开一个超过首页窗口大小的 Bot A，再切到 Bot B，最后切回 A。/home/lingxufeng/bot/app/ui/renderer-grok/frontend/src/production/ProductionRenderer.tsx:2220 调用 setScope，而 :2226 因 hasLoadedEntries 为真直接返回，没有重新执行 :2239 的 installInitialPage。

**失败表现**：/home/lingxufeng/bot/app/ui/renderer-grok/frontend/src/recovered/features/conversation/workspace/pagination.ts:170-179 会在切换 scope 时清空历史页并将游标重置为 unprobed，但 :195-197 的 loadOlder 只接受 more 游标。独立运行该控制器的 A→B→A 探针得到 hasOlder=true、cursor=unprobed、fetchCalls=0，因此界面仍声称可以加载更早记录，实际不会发请求，已经加载的更早记录也会消失。

**verifier 证据**：CONFIRMED at major. Premise chain, all verified in code (all under /home/lingxufeng/bot):

1. Cache hit on reopen — ProductionRenderer.tsx:2219 `hasLoadedEntries = entriesByAgentRef.current[agentId] != null`; entriesByAgent is written only on first successful fetch (:2238) and never cleared on agent switch, so A→B→A reopens A with hasLoadedEntries=true.

2. setScope wipes pagination state unconditionally — ProductionRenderer.tsx:2220 calls `transcriptPaginationController.setScope(slot, agentId)` before the early return; pagination.ts:170-179 setScope (scope B→A differs) runs clearPageState: entries=[], cursor reset to {kind:"unprobed"}.

3. Early return skips installInitialPage — ProductionRenderer.tsx:2226 `if (!shouldOpen || hasLoadedEntries || client == null) { ...; return; }` returns before :2239 `transcriptPaginationController.installInitialPage(projectedPage)`, the only call site of installInitialPage in the file.

4. No repair path exists:
   - ProductionRenderer.tsx:1349-1351 effect calls setScope(slot, activeAgentId) on activeAgentId change, but scope already equals (slot, A) → pagination.ts:171 early-returns, no state change.
   - ProductionRenderer.tsx:2571-2573 re-open effect gated on `entriesByAgent[activeAgentId] == null` — cached, so skipped.
   - reset() is called only in the agent-delete handler (:2377), not on switches.

5. Stuck state: pagination.ts:135 `hasOlder: cursor.kind === "unprobed" || cursor.kind === "more"` → hasOlder=true, but pagination.ts:196 `loadOlder` requires `cursor.kind === "more"` and silently resolves on "unprobed" — no fetch, no error, no cursor change. transcript.tsx:652-677 auto-invokes loadOlder whenever hasOlder && scrollTop<=600, so it retries forever as a silent no-op.

6. Visible loss: ProductionRenderer.tsx:1634-1640 — rendered entries = mergeOlderTranscriptEntries(liveEntries from entriesByAgent cache, transcriptPaginationSnapshot.entries). Older pages loaded via loadOlder live only in the controller (pagination.ts:217 merges into controller.entries; never written back to entriesByAgent), so after the scope switch the user sees only the cached 200-entry tail, previously loaded older history disappears, and the UI still claims more history is available.

7. Introduced by this diff: `git cat-file -e 5bd36e0:app/ui/renderer-grok/frontend/src/production/ProductionRenderer.tsx` fails (path does not exist at base) — the whole renderer-grok tree, including this openAgent/pagination wiring, is new in the reviewed range (P5-54).

8. Live probe (temp dir under /dev/shm, deleted): drove the actual pagination.ts controller through A→install→loadOlder→B→install→setScope(A) without reinstall: result `back to A: agentId=A hasOlder=true cursor={"kind":"unprobed"} entries=0`, then `loadOlder` left fetchCalls unchanged (1) and cursor at unprobed — matches the finder's probe exactly.

Severity major (not critical): older history becomes unreachable and the affordance lies, but no crash, data corruption, or security impact; the tail still renders and a reload/account re-entry restores loading.

**finder**：sol:并发与数据完整性

### R4 · /home/lingxufeng/bot/app/ui/renderer-grok/shim/src/entries.ts:81 · major · CONFIRMED

**summary**：发送回执的 nonce 被绑定到历史第一条用户消息，而不是此次发送对应的消息。

**触发条件**：在已有用户消息的会话中发送新输入，并在 session/prompt 尚未完成时收到一次 follow 更新。/home/lingxufeng/bot/app/ui/renderer-grok/shim/src/data.ts:363 先保存 nonce，:164-169 随后把它交给整个历史窗口序列化；/home/lingxufeng/bot/app/ui/renderer-grok/shim/src/entries.ts:81 无条件把它放到遍历遇到的第一条 user 上，而不校验消息身份或等待新消息到达。

**失败表现**：历史消息会被当成新输入的持久化回执，且 /home/lingxufeng/bot/app/ui/renderer-grok/shim/src/data.ts:169 立即删除真正待确认的 nonce。独立序列化探针中，old/new 两条消息配上 new-request 后，nonce 实际落在 old 上。如果此时发送返回失败，/home/lingxufeng/bot/app/ui/renderer-grok/frontend/src/production/ProductionRenderer.tsx:1070 会按错误的 nonce 标记历史消息失败，用户通过 :3027 重试时发送的将是历史消息的正文，而不是刚才输入的内容。

**verifier 证据**：CONFIRMED (major). Premise-by-premise:

1) Renderer passes a clientNonce on every send: ProductionRenderer.tsx:2943 (makeClientNonce), :2960-2970 (insertOptimistic record N + pending bubble `pending-N`), :1001-1013 (`clientNonce: submission.nonce` in sendPrompt call).

2) Shim stores it before the prompt round-trip: data.ts:362-363 — `pendingNonce.set(agentId, args.clientNonce)` runs synchronously before `await api('session/prompt')`; there is NO cleanup when the call throws at data.ts:365 (stale nonce survives a failed send).

3) Nonce attaches to the FIRST user entry with no identity check: entries.ts:73-84 (`let nonceUsed=false`; first `case 'user'` gets `entry.clientNonce`), fold order is timeline order (turn-fold.ts:89). data.ts:164-169 hands the whole history window to serialize and deletes pendingNonce if ANY entry carries the nonce — always true once ≥1 user entry exists. The view holds the last 40 messages (data.ts:25, :193 maxMessages HISTORY_PAGE), so any session with a prior user message in the window mis-binds.

4) Probe (esbuild-transformed real sources, /dev/shm sandbox, since deleted): with items [old-u1, old-a1, new-u1] + clientNonce N-123 → nonce lands on old-u1 (new-u1 gets null) — deterministic even when the new message is ALREADY in the view; with only [old-u1, old-a1] + N-456 → nonce on old-u1. The race is not even required; and a snapshot fires on EVERY follow item (data.ts:186 onFollowItem → pushTranscript, gated only by `tailed` at :176; wiring index.ts:52 → server.emit transcript snapshot), so during a running turn (mode:'queue', data.ts:364) the mis-attached snapshot is emitted while the send is still in flight.

5) Downstream failure chain verified: snapshot → onBaseline (transcript-feed-source.ts:93-99, ProductionRenderer.tsx:2337-2354) → ingestTranscriptEvent(N@old-u1) removes the record (acknowledgement.ts:203-223 — no content/identity verification, any message echo completes) and :2354 wholesale-replaces entriesByAgent, dropping the `pending-N` bubble (no other optimisticEntries consumer — grep confirmed). If the send then fails: onPhase('failed') markFailed(N) is a no-op (record gone, ProductionRenderer.tsx:1056), and :1070-1073 marks every entry with `clientNonce === N` → the OLD message old-u1 gets `delivery:'failed'`; retry (resendFailedSend, :2996-3038) builds `retrySubmission.prompt = entry.text.trim()` at :3027 from that old entry → resends the historical message content instead of what the user typed (typed text survives only via onFailure draft recovery :1078-1082). Additional variant: after a failed send the stale pendingNonce is never cleared, so the NEXT snapshot mis-acknowledges the failed nonce on an old message and silently removes the failed record/bubble.

6) Introduced by this diff: both files added in commit 934c58b (P5-51) — `git diff 5bd36e0..4624670 --stat` shows app/ui/renderer-grok/shim/src/data.ts (+502) and entries.ts (+133) as new files; merge-base check confirms the adding commit descends from the range base.

Files: /home/lingxufeng/bot/app/ui/renderer-grok/shim/src/entries.ts:81, /home/lingxufeng/bot/app/ui/renderer-grok/shim/src/data.ts:164-169,186,363-365, /home/lingxufeng/bot/app/ui/renderer-grok/frontend/src/production/ProductionRenderer.tsx:1070,2343-2354,3027.

**finder**：sol:并发与数据完整性

### R5 · /home/lingxufeng/bot/app/ui/renderer-grok/frontend/src/production/ProductionRenderer.tsx:2999 · major · CONFIRMED

**summary**：失败发送的重试生成全新请求标识，绕过 SDK 已有的幂等去重并可能重复执行同一输入。

**触发条件**：session/prompt 已被 SDK 接收并开始执行，但 HTTP 响应因断链或超时未到达 renderer，且 follow 回显尚未处理；用户随后点击失败消息的重试。/home/lingxufeng/bot/app/ui/renderer-grok/frontend/src/production/ProductionRenderer.tsx:2999 为该逻辑输入生成全新 nonce，并在 :3025 用它提交重试。

**失败表现**：/home/lingxufeng/bot/app/ui/renderer-grok/shim/src/data.ts:362-365 将每次 clientNonce 原样作为 session/prompt.requestId。SDK 在 /home/lingxufeng/bot/repos/deepseek-harness/packages/api/session-controller/src/commands.ts:306 只按 requestId 去重，因此第二次请求不会命中第一次的记录，会再次入队并执行。对于会写文件或调用连接器的输入，这不只是重复气泡，而是重复执行已经成功的操作。

**verifier 证据**：Premise-by-premise verification (all files new in range 5bd36e0..4624670 — added by P5-50 merge 68858b5; diff-stat: ProductionRenderer.tsx +3735, submission.ts +149, acknowledgement.ts +254, data.ts +502, all insertions, so the issue is introduced by this diff): P1 RETRY MINTS FRESH NONCE — CONFIRMED. ProductionRenderer.tsx:2996-3038 `resendFailedSend`: :2999 `const clientNonce = makeClientNonce()`, :3024-3030 `retrySubmission = { nonce: clientNonce, ... }`, submitted at :3032. `makeClientNonce` (:469-471) returns a plain random UUID — no reuse of the original nonce as wire id. P2 FRESH NONCE BECOMES requestId VERBATIM — CONFIRMED. ProductionRenderer.tsx:3032 → send-journal-approval-lifecycle.ts:133-146 → journal.resendFailed ProductionRenderer.tsx:1028-1040 (`queue.submit(input.submission)`) → queue send :1049-1051 (resend nonce → `sendComposerPrompt`) → `client.call("sendPrompt", { clientNonce: submission.nonce })` :1001-1013 → shim/src/coordinator.ts:118 (`case 'sendPrompt'`) → shim/src/data.ts:359-367: :362 `nonce = args.clientNonce`, :364 `api('session/prompt', { request: { requestId: nonce, ... } })`. No layer rewrites or preserves the original id. P3 SDK DEDUP IS requestId-ONLY — CONFIRMED. repos/deepseek-harness/packages/api/session-controller/src/commands.ts:306 `if (hasPromptRequest(agent, request.requestId)) return { accepted: true }`; hasPromptRequest (:542-552) is exact `source.rpcId === requestId` matching against journaled user messages. A fresh UUID misses → `agent.followup(message)` (~:339) admits and executes a second copy of the same input. No content-based dedup anywhere in the path. P4 AMBIGUOUS-OUTCOME "failed" STATE REACHABLE — CONFIRMED. submission.ts:75-94: phase "failed" on any `send()` rejection. coordinator-client.ts:81-96 `rejectCalls`/`disconnect` reject every in-flight call on port close/shutdown/protocol error — including the case where session/prompt was already delivered and accepted by the SDK and only the response was lost. shim/src/index.ts:42 maps carrier errors to `{ok:false}` → data.ts:365 throws → send rejects. ProductionRenderer.tsx:1056 + :1065-1073 then set entry `delivery: "failed"`, exposing the retry affordance (:3509 `onResendFailedSend`). No code distinguishes "rejected before delivery" from "response lost after acceptance". P5 NO GUARD ON RETRY — CONFIRMED. resendFailedSend (:2996-3038) has no outcome-ambiguity check. Notably the queue's own reconnect path IS idempotent (submission.ts:102-108 flush resubmits the same record with the same nonce → hits commands.ts:306 dedup), so idempotent retry was available and only the manual retry path drops the key. The acknowledgement layer even preserves the logical nonce chain (acknowledgement.ts:77-102 logicalNonce, :193-201 retryFailed priorNonces) — but only for echo reconciliation; it is never applied to the wire requestId. P6 FAILURE WINDOW IS REAL, NOT JUST SUB-SECOND. Echo reconciliation (ProductionRenderer.tsx:2379-2409 onAppended, :2338-2354 onBaseline) does replace the failed bubble via the nonce/priorNonce chain once the follow snapshot replays, but: (a) retry clicked while still disconnected queues the fresh-nonce submission and flushes on transport-connected (:1092-1097, fires on lifecycle ready coordinator-client.ts:104-108) racing ahead of the 300ms-delayed re-follow (data.ts:310-316) — the fresh-nonce prompt is dispatched regardless of later UI reconciliation; (b) if the SDK gateway restarts slower than the renderer reconnects, or the agent's snapshot is not re-pushed, the failed bubble persists indefinitely and a later retry re-executes against the durable log that already holds the first message. CONCLUSION: every premise is satisfiable in code; the described failure (duplicate admission and re-execution of the same user input — duplicate turns, re-executed file-writing tools / connector calls) follows directly. Severity major is appropriate: silent duplicate execution of side effects, but gated on an ambiguous transport failure plus user retry, on an otherwise loopback-local transport.

**finder**：sol:并发与数据完整性

### R6 · app/sdk/src/policy/shell-ask.mjs:230 · major · CONFIRMED

**summary**：P5-21 now sends read/glob/grep/present/write/edit through the policy-state gate. Nothing in the product writes policy-state.json yet (P5-29 is still blocked and app/ui/main has no writer), so the gate is always closed, and ask() turns every closed-gate case into NEVER_DENY in approvalPolicy=never sessions.

**触发条件**：Production launch, where no <dataDir>/policy-state.json exists. The main bot delegates through the `subagent` tool (or a workflow agent()), and the child, which is pinned to approval 'never', calls read, grep, glob or edit on a file inside its own workspace.

**失败表现**：Delegated subagents lose every file tool: they are denied with 'approval unavailable in this session'. Before this range, shell-ask returned next() for every non-bash tool, so this worked. A9⑦ ('child sessions run ALWAYS-tier tools normally') was only tested with a valid policy-state injected. Main sessions are hit too: every in-workspace read, glob, grep, write and edit now raises an approval card.

**verifier 证据**：该候选成立，是默认生产链新增文件工具门控、但尚未交付状态写入端造成的功能回归。/home/lingxufeng/bot/app/sdk/src/start.ts:269 只把各数据根下的 policy-state.json 路径注入插件；检查生产 app 代码未发现状态写入者，/home/lingxufeng/bot/work/p5-parity/PLAN.md:107 的写入任务 P5-29 仍为 blocked。文件缺失时，/home/lingxufeng/bot/app/sdk/src/policy/shell-ask.mjs:93-104 必然返回 false；/home/lingxufeng/bot/app/sdk/profile/tiers.json:4-10 将 read/read_image/glob/grep/present/write/edit 纳入 workspace 档，因此合法工作区调用在 /home/lingxufeng/bot/app/sdk/src/policy/shell-ask.mjs:230-238 进入 ask，而 :175 又将 never 会话的 ask 直接转为 deny。触发入口确实存在：默认审批 patch 注册了 subagent 与 workflow（/home/lingxufeng/bot/app/sdk/profile/patches/approval.yml:143-160），已安装上游 /home/lingxufeng/bot/app/sdk/node_modules/.pnpm/@deepseek-ai+dsh-subagent@0.2.2-alpha.2_e72a824cc41824c874c3a20e9bb7fd64/node_modules/@deepseek-ai/dsh-subagent/lib/index.js:409-432 把委派子会话审批固定为 never 并写入子会话日志。执行管线遇到 deny 会产生 isError 工具结果而不 dispatch（/home/lingxufeng/bot/repos/deepseek-harness/packages/core/tools/src/pipeline.ts:213-229），故不是仅多显示提示。已在 /dev/shm/mm-review-XXXX 临时目录做最小差分实验并清理：同一工作区、有效 handoff、缺失 policy-state 下，read/glob/grep/present/write/edit 在基线 5bd36e0 的插件全部 next/allow，在审查版本插件的 never 会话全部返回 'approval unavailable in this session'，ask 根会话则全部要求审批；当前相关生产文件与审查 head 4624670 之间无差异。现有子会话验收先人为 provision 状态（/home/lingxufeng/bot/app/sdk/tests/e2e/tiers-policy.test.ts:126-130、449），因此不能覆盖默认生产缺文件情形。保留 major：委派子代理的正常工作区文件能力整体不可用；问题在读写两端未一起落地，而不是 fail-closed 安全规则本身。

**finder**：opus:跨文件深度

## 上轮未修

无（unfixedFromLastRound 为空）。

## 其他发现

（CONFIRMED 但 severity 为 minor，共 7 条）

### O1 · app/sdk/sandbox/bwrap-wrap.py:186 · minor · CONFIRMED

**summary**：联网路径的宿主回环防护与 slirp 二进制选择由无生产守卫的测试环境变量控制：P2SDK_TEST_SLIRP_NO_LOOPBACK_GUARD 存在即静默去掉 --disable-host-loopback（L186-187），P2SDK_TEST_SLIRP_BIN 存在即优先于启动器经 --slirp 钉死的 sha256 已核验二进制（L377）。已核实模型不可达此路径（上游 tool-bash BashToolArgs 无 env 参数，bash-local spawnSpec 的 spec.env 非 bash 工具可达、dshEnv 仅 DSH_* 快照），故仅剩宿主侧误配置触发。

**触发条件**：生产 Electron/SDK 进程的启动环境（用户 shell、桌面会话或 systemd 单元）中残留 P2SDK_TEST_SLIRP_NO_LOOPBACK_GUARD=1（例如手动调试后未清除、或从测试工具生成的启动脚本继承）时，本进程派生的一切 bwrap-wrap.py 均读到该值；随后任一次经用户批准的 request_network 许可命中即走 run_networked。

**失败表现**：被批准联网的那条命令在沙箱内可额外访问宿主回环——本机上即 127.0.0.1:4001 的 LiteLLM 代理与 CLIProxyAPI（审批卡明示 host loopback stays blocked，实际未阻断）；若同时残留 P2SDK_TEST_SLIRP_BIN，宿主还会以当前用户身份执行任意指定可执行文件代替已核验的 slirp4netns。均不逃逸沙箱文件遮蔽，且需要宿主环境误配置 + 一次用户批准双重前提，故评 minor。

**verifier 证据**：候选在其限定的“宿主启动环境误配置”条件下成立，且由本次 diff 新增。/home/lingxufeng/bot/app/sdk/src/start.ts:147-161 将两个 P2SDK_TEST_SLIRP_* 变量原样传入生产 runtime，:664、:685 使用该环境启动 runtime；下游 /home/lingxufeng/bot/repos/deepseek-harness/packages/subprocess/subprocess/src/index.ts:47、:66-69 仅剔除凭证形状和 DSH_* 名称，因此不剔除这两个变量，/home/lingxufeng/bot/repos/deepseek-harness/packages/subprocess/subprocess-local/src/spawn.ts:44-46 又将该环境传给子进程。/home/lingxufeng/bot/app/sdk/sandbox/bwrap-wrap.py:186-187 在 NO_LOOPBACK_GUARD 为非空字符串时无条件省略 --disable-host-loopback，没有生产模式守卫；:374-394 在许可命中后进入联网路径，而 :377 的 SLIRP_BIN 环境覆盖优先于 --slirp，最终由 :207-208 在宿主 supervisor 中直接 Popen 执行。由此，生产启动环境残留这些值，再执行一次许可命中的命令，确实会关闭宿主回环防护或执行指定 helper。回环访问应准确描述为通过 10.0.2.2 网关别名到达宿主回环，并非沙箱内直接访问 127.0.0.1；现有 /home/lingxufeng/bot/app/sdk/tests/e2e/request-network.test.ts:384-394 也专门断言该差分及 localhost 仍属沙箱自身。/home/lingxufeng/bot/app/sdk/src/policy/request-net.mjs:142 却始终返回 Host loopback stays blocked，未反映该保护已关闭。维持 minor：此结论不证明模型可修改父进程环境，也不构成无批准联网；触发仍依赖宿主误配置及有效许可。另收窄候选的完整性表述：已核实的是覆盖启动器指定的默认二进制路径（/home/lingxufeng/bot/app/sdk/src/start.ts:212），不是证明启动器在运行时做了 SHA256 校验。本轮仅做代码与调用链核验，未运行网络实验或现有测试。

**finder**：glm:安全

### O2 · app/ui/renderer-grok/shim/src/data.ts:363 · minor · CONFIRMED

**summary**：sendPrompt 把 clientNonce 记入 pendingNonce 后，entries.ts toRawEntries（line 81 `if (nonce !== undefined && !nonceUsed)`）把 nonce 补到序列化窗口的**第一条**用户消息上；在有历史消息的会话里第一条是最早的历史消息，不是本次刚发出的提示。上游 ProductionRenderer.tsx:2343 按条目携带的 clientNonce ingest 作答事件，会拿这条旧消息去 reconcile 本次发送的乐观条目 pending-<nonce>（提前判定 echo 已到、移除乐观气泡），而真正的新消息事件因 nonce 已被错误条目消费（data.ts:169）而不带 nonce 到达。注释自述『补记到第一条用户消息』只在空会话成立，单测（entries.test.ts:69）也只测了两条用户消息取第一条的行为，未覆盖『第一条≠本次发送』的场景。

**触发条件**：在任何已有用户历史消息的会话里发送一条消息（上游 composer 恒带 clientNonce），下一次 transcript 快照推送时 nonce 被贴到窗口内最早的旧用户消息上。

**失败表现**：已发送消息的乐观气泡在 echo 事件落盘前被提前回收，对话底部已发出的消息短暂消失再重现（flicker）；应答生命周期（acknowledgementController）由错误条目核对，submission 状态与实际 echo 不一致。

**verifier 证据**：确认本次新增 shim 存在 nonce 错配和错误 echo 对账，但不能把“每次发送必然闪烁”作为已证实的表现。生产发送路径 /home/lingxufeng/bot/app/ui/renderer-grok/frontend/src/production/ProductionRenderer.tsx:2960-2971 先登记 pending 乐观消息，随后通过 :1001-1007 将同一 clientNonce 传给 sendPrompt；/home/lingxufeng/bot/app/ui/renderer-grok/shim/src/data.ts:359-364 将其存入 pendingNonce。历史不会在发送时清空，/home/lingxufeng/bot/app/ui/renderer/session/reduce.ts:109-111 会将新用户消息追加到已有 items，/home/lingxufeng/bot/app/ui/renderer/fold/turn-fold.ts:45-46、86-89 保持用户消息顺序。因此，有历史用户消息的已加载会话在下一次快照序列化时，/home/lingxufeng/bot/app/ui/renderer-grok/shim/src/entries.ts:74-82 会把新 nonce 贴到窗口内第一条历史用户消息，而非新消息；/home/lingxufeng/bot/app/ui/renderer-grok/shim/src/data.ts:164-169 随即消费该 nonce，后续真正的新消息也不再携带它。快照不是被忽略的数据：/home/lingxufeng/bot/app/ui/renderer-grok/frontend/src/recovered/features/conversation/cards/transcript-card/transcript-feed-source.ts:93-100 将每次 snapshot 转为 onBaseline，/home/lingxufeng/bot/app/ui/renderer-grok/frontend/src/production/ProductionRenderer.tsx:2342-2352 对带 nonce 的历史条目执行 ingestTranscriptEvent。/home/lingxufeng/bot/app/ui/renderer-grok/frontend/src/recovered/features/conversation/workspace/acknowledgement.ts:203-222 仅凭作用域、nonce 和 message 类型就移除本次 acknowledgement record，不检查消息内容或对应的新消息 ID，故错误对账确实发生。在规定的 /dev/shm 临时目录中调用实际 serialize 和 acknowledgement controller 的轻量探针已复现：历史消息 old 获得 new-nonce，新消息 new 的 nonce 为空，喂入 old 后本次 acknowledgement records 从 1 变成 0；临时目录已删除。需要限定候选的视觉结论：若下一快照已经包含新消息，:2354 会直接显示新消息，不一定产生闪烁；且该处快照整体替换 entries，本身就会移除未进入快照的乐观气泡，不能把气泡消失完全归因于 nonce 错配。因此保留 minor，确认的是可达的消息关联及确认状态错误，不声称已证明每次发送都会短暂消失。

**finder**：glm:正确性+合规

### O3 · app/sdk/src/policy/shell-ask.mjs:186 · minor · CONFIRMED

**summary**：request_network 的长度校验只存在于工具 execute 侧（request-net.mjs validateRequest 的 MAX_COMMAND_CHARS=8192），而 shell-ask 的 pre-execute ASK 分支把 `args.command` 原文（不截断，仅 reason 截 500）整段拼进出卡 reason。两侧校验不对称：超过 8192 字符的命令仍会生成完整审批卡，用户看到并批准后 execute 才以 "command is too long" 拒绝。

**触发条件**：模型调用 request_network 且 command 超过 8192 字符（长 heredoc/内嵌脚本即可达到，无需畸形输入）：出卡成功 → 用户批准 → execute 抛 'request_network: "command" is too long (>8192 chars)'。

**失败表现**：审批卡渲染未设上限的命令文本（巨量文本进事件流与卡片 DOM）；用户点 Allow once 后工具直接抛错，批准被浪费且模型收到与卡面不符的失败，用户对『批准了什么/为何失败』产生误判。

**verifier 证据**：该问题由本次新增的 request_network 路径引入，且可达。/home/lingxufeng/bot/app/sdk/src/policy/request-net.mjs:107-114 的工具参数 schema 对 command 仅声明 string，没有长度约束；/home/lingxufeng/bot/app/sdk/src/policy/shell-ask.mjs:183-187 在普通可审批会话中直接返回 ask，只截断 reason，command 则全文进入审批原因。上游管线 /home/lingxufeng/bot/repos/deepseek-harness/packages/core/tools/src/pipeline.ts:199-205 先运行 pre-execute 并发起审批，:449-458 将完整 reason 交给审批服务并把 allowed-once 转成 allow，随后 :275 才调用工具 execute。此时 /home/lingxufeng/bot/app/sdk/src/policy/request-net.mjs:130-132 才执行 validateRequest，并由 :65 拒绝超过 8192 字符的 command。已用两个生产插件的 apply 捕获实际回调，在 /dev/shm/mm-review-XXXX 临时目录中以 8193 字符 command 复现：返回 ask，审批 reason 为 8367 字符且包含完整 command；模拟批准后调用已注册 execute，确定抛出 command is too long (>8192 chars)，临时目录已删除。因此用户会被要求批准一个必然失败的调用。维持 minor：这是校验时机不一致导致的无效审批，并非越权执行；/home/lingxufeng/bot/app/ui/renderer-grok/overrides/modules/local-tool-view.tsx:95-97 虽全文渲染命令，但设置了 maxHeight 和滚动，现有证据不足以声称必然造成 UI 卡死。

**finder**：glm:正确性+合规

### O4 · /home/lingxufeng/bot/app/ui/renderer-grok/overrides/modules/new-bot-dialog.tsx:111 · minor · CONFIRMED

**summary**：新建 Bot 成功但切换所选模型失败时，调用方丢弃了错误提示并直接关闭对话框。

**触发条件**：用户在新建对话框中选择非默认模型，session/create 成功，但紧随其后的 session/selectModel 返回失败。/home/lingxufeng/bot/app/ui/renderer-grok/shim/src/data.ts:424-426 会正确生成 notice，并在 :439 将其随成功结果返回；/home/lingxufeng/bot/app/ui/renderer-grok/overrides/modules/new-bot-dialog.tsx:108-111 却只读取 sessionId。

**失败表现**：对话框按正常成功路径关闭，Bot 实际使用默认模型，但调用链没有任何位置展示返回的 notice。用户无法知道模型选择未生效，也不能根据失败原因恢复；原实现会把该非致命失败传给新建后的会话提示，当前迁移将这条错误处理路径截断了。

**verifier 证据**：CONFIRMED. (1) Non-default model selectable: app/ui/renderer-grok/overrides/modules/new-bot-dialog.tsx:61 (model state), :172-178 (model select), :107-108 (picked model passed as req.model to createBot) — no guard. (2) Create-succeeds-selectModel-fails branch reachable: app/ui/renderer-grok/shim/src/data.ts:418-421 (create), :424-427 (ui.selectModel failure only sets local notice), :450-453 (selectModel is a bare api('session/selectModel') call, no fallback), :439 (returns {ok:true, sessionId, notice}), :475 (devSurface.failNext exists specifically to inject such failures in E2E — proof the authors treat it as reachable). (3) Notice discarded: new-bot-dialog.tsx:110-112 reads only res.ok and res.sessionId, then finish() (:33-38) resolves openNewBot with sessionId alone; sole chooser consumer data.ts:380-383 returns recordOf(chosen) (id only). Grep for '.notice' in renderer-grok (excluding upstream source/ snapshot): only ProductionRenderer.tsx:2926, which is the stageComposerFiles flow, unrelated to createBot. The type contract shim/src/bots.ts:47 (CreateResult = { ok: true; sessionId: string; notice: string | null } | { ok: false; message: string }) declares the field with zero readers — dead field. (4) Introduced by this diff: git diff --stat 5bd36e0..4624670 shows new-bot-dialog.tsx added (191 insertions) replacing the deleted app/ui/renderer/plugins/settings/NewBotDialog.tsx (186 deletions); the old submit called addCreated(sid, presetId, notice) and old store.ts:311-321 did `if (notice !== null) set({ notice })`, surfacing the failure in global UI state — the migration truncated that error path. No accepted deviation covers it: work/p5-parity/ui/P5-57-final.md:42 mentions notice only for the unrelated connector-unavailable flow. Failure mode as described: bot is created, dialog closes on the normal success path, bot silently runs on the preset default model, and the non-fatal selectModel error is never shown anywhere. Severity minor confirmed: non-destructive (bot usable), rare path, but silently swallowed error contradicts the project's error-handling rule and drops parity with the old renderer.

**finder**：sol:后端逻辑

### O5 · app/sdk/src/policy/request-net.mjs:137 · minor · CONFIRMED

**summary**：The permit's 60s TTL starts when the request_network card is approved. Because the policy-state gate is never open in production, the follow-up bash call raises a second ordinary approval card, and the TTL keeps running while that card waits.

**触发条件**：The user approves request_network{command:C}, the model calls bash with the same C, and the user takes more than about 60s to approve the second card (ASK.bash).

**失败表现**：In claim_permit, bwrap-wrap.py sees the permit as expired, deletes it, and runs C on the offline path. The network the user explicitly approved never appears, the permit is already gone, and the whole two-card flow has to be repeated.

**verifier 证据**：触发条件可达。/home/lingxufeng/bot/app/sdk/src/policy/request-net.mjs:130-142 在 request_network 获批后的 execute 中立即签发许可；同文件:74-83 从签发时刻计算 expiresAt，默认 TTL 为 60000ms（:35-36），不会暂停等待后续审批。普通 bash 调用仍独立走 /home/lingxufeng/bot/app/sdk/src/policy/shell-ask.mjs:190-208，policy-state 无效时返回 ASK，且不检查已有网络许可；生产 main/preload 中未发现 policy-state 写入路径，因此正常默认流程会出现第二张审批卡，即使以后启用门，在暂停自治时也能触发。审批不会必然在 60 秒内结束：/home/lingxufeng/bot/app/ui/main/m2-mux/deadline.ts:114-129 在 renderer 端口挂载时清空超时窗口并直接返回，用户留在界面上超过一分钟仍可批准。批准后，/home/lingxufeng/bot/app/sdk/sandbox/bwrap-wrap.py:124-132 删除过期许可并跳过；:374-378 因返回 None 不进入联网分支，随后 :401-402 执行保留 --unshare-net（:337）的断网命令。已在允许的 /dev/shm/mm-review-* 临时目录实测真实签发函数和 wrapper 的 claim_permit：相同 session/argv 在虚拟时钟 +1s 时命中，+61s 时返回 None 且许可文件被删除；同时真实 shell-ask handler 在门关闭时返回 ask，临时目录已清除。相关文件与审查 head 一致，request-net 是本范围新增代码。维持 minor：这是超出 TTL 后需要重新申请的可恢复可用性问题，不会放宽权限或造成网络越权。

**finder**：opus:跨文件深度

### O6 · /home/lingxufeng/bot/app/ui/renderer-grok/shim/src/coordinator.ts:130 · minor · CONFIRMED

**summary**：setAgentUnread 读取错误的参数名，使“Mark as Unread”实际执行清除未读。

**触发条件**：在侧栏行菜单点击“Mark as Unread”。ProductionRenderer.tsx:3113 实际发送 {id, isUnread:true}，但此分支读取 args.value === true；用真实 coordinator server 和内存端口发送该生产参数，观察到 deps.setAgentUnread('bot-1', false)。

**失败表现**：shim 的 unread 集合不会增加该 Bot，反而删除已有未读状态。调用方虽乐观显示未读，但下一次 agents 推送（例如任一会话流式更新）会用 shim 的已读状态覆盖，用户无法可靠手动标记未读。应按生产调用方契约读取 isUnread。

**verifier 证据**：Premise chain, all verified in head 4624670 (file absent in base 5bd36e0 — introduced by this diff, P5-54): (1) Menu path: app/ui/renderer-grok/frontend/src/production/agent-row-actions-model.ts:41-43,56 (MARK_UNREAD_ACTION shown when hasUnread=false), AgentRowActions.tsx:94 (onSetAgentUnread?.(agentId, markAgentUnreadValue(action))), agent-row-actions-model.ts:86-88 (markAgentUnreadValue → true for "mark-unread"), sidebar.tsx:295+453 prop chain, ProductionRenderer.tsx:3450 wiring. (2) Wire arg name is isUnread: ProductionRenderer.tsx:3110-3113 client.call("setAgentUnread", { id: agentId, isUnread }); coordinator-client.ts:158-163 posts the frame verbatim (no renaming). (3) Server reads args.value: shim/src/coordinator.ts:130 `deps.setAgentUnread(args.id, args.value === true)` — args.value is undefined for this caller → always false. No guard blocks it: args coerced to Record<string, unknown> at coordinator.ts:95 with no field validation; upstream table source/shared/rpc/coordinator.ts:122 declares only args:"object" (no field schema); repo-wide grep finds no other wire caller sending `value` (sole wire call site is ProductionRenderer.tsx:3113; app/ui/tests/unit/grok-shim/coordinator.test.ts:79 only stubs the dep). (4) Effect: shim/src/data.ts:377 `if (value) unread.add(id); else unread.delete(id); push.agents()` → deletes instead of adds; renderer's agents subscription ProductionRenderer.tsx:2321-2327 (setAgents(projected)) overrides the optimistic update at 3114, so unread never persists — exactly the reported failure. "Mark as Read" (isUnread:false) coincidentally still works; bug manifests only on "Mark as Unread". One wording nuance: "deletes existing unread" overstates it, since the Mark-as-Unread menu item only appears when hasUnread is already false (agent-row-actions-model.ts:56) — the real failure is unread never being set plus optimistic-state revert. Severity minor is appropriate: shim-backed dev/E2E environment only, single menu action affected.

**finder**：sol:sweep

### O7 · /home/lingxufeng/bot/app/ui/renderer-grok/shim/src/desktop.ts:93 · minor · CONFIRMED

**summary**：主题选择仅修改内存，刷新或重启后无条件恢复为跟随系统。

**触发条件**：通过设置 Appearance 或主题命令选择与系统不同的主题，然后刷新页面或重启应用。用同一个 localStorage 替身重建 createDesktopBridge，实测第一次 theme.set('dark') 后为 dark；重建后变回 {preference:'system', resolved:'light'}，期间没有任何持久化写入。

**失败表现**：新增主题设置向用户返回成功，但无法保存用户偏好；每次启动都会丢弃手动选择。构造函数第42行固定初始化为 system，而 theme.set 没有使用文件中已有的 persist/persisted 持久化路径。应保存 preference 并在初始化时恢复；system 的 resolved 仍应实时根据系统计算。

**verifier 证据**：All premises hold; reproduced with the real file. (1) Shim is production's window.desktop: renderer-grok/README.md ("shim/ ... is the real data layer ... emits shim.iife.js and injects it into the built index.html"); real preload app/ui/preload/index.ts has zero theme references (grep); app/ui/main/window.ts:16,40 only reads nativeTheme for titlebar tint — no themeSource set, no persistence anywhere else. (2) User theme selection routes through theme.set: settings/overlay/desktop.ts:159,183 (snapshot = bridge.theme.get().preference) and :203-205 (setThemePreference → bridge.theme.set); ProductionRenderer.tsx:3335-3342 (palette theme commands → bridge.theme.set). (3) No renderer-side persistence: ProductionRenderer.tsx:896-897, 2758, 2777-2778 all initialize from bridge.theme.initial; clientPersistence used only for router.ts:71, sidebar-sections-state.ts:251-258, draft-state.ts:119-130, roster/selection-state.ts:78-89, sidebar-collapse-state.ts:142-149 — never theme; zero localStorage usage in frontend/src. (4) The omission: shim/src/desktop.ts:42 hardcodes init to {preference:'system'} with no persisted() restore, and :93-99 theme.set updates memory + listeners only, never persist(); working persist/persisted helpers exist at :35-38 and are used by clientPersistence (:179-187) and pinned agents (:64-70,:167-171) — and the file's own P5-58 comment (:61-63) required pin persistence precisely because silent loss of a visible preference on reload is a bug, which is exactly this failure class. (5) Introduced by this diff: file absent at base 5bd36e0, present at head 4624670 (git cat-file), added in P5-51 merge 934c58b within range. (6) Repro (esbuild bundle of the actual desktop.ts, /dev/shm, cleaned up): boot1 theme.set('dark') → {preference:'dark',resolved:'dark'}, localStorage keys after set = []; rebuild with same store → initial {preference:'system',resolved:'light'} — manual choice silently discarded. Severity minor kept: cosmetic user preference only, no data loss beyond the preference itself, one-click recoverable; but it is a real user-visible defect against the project's own persistence bar.

**finder**：sol:sweep

## 超出预算未验证

- /home/lingxufeng/bot/app/ui/renderer-grok/shim/src/data.ts:186 · major · sol:并发与数据完整性 — 断链重连后的新快照没有同步重建分页游标，导致旧窗口与新窗口之间的消息无法被取回。
- app/ui/renderer-grok/SOURCES.tsv:1 · minor · glm:正确性+合规 — 合规问题：CLAUDE.md §3 搬运阶梯第 3 级要求「复制改造：只搬用得到的文件到 `app/`，**文件头和 commit 正文**写 `来源: <url>@<sha>:<path>`，改动尽量小」。文件头一半已满足（332 个上游文件首行 `来源: grok-bot-0.18-reconstructed@a9f633e:…`、SOURCES.tsv 有 upstream sha256、slirp4netns 的 sandbox/bin/README.md 记来源+sha256+许可证）；但 commit 正文一半未满足：引入 renderer-grok 搬运树的 68858b5（P5-50，332 文件）与引入 GPL-2.0 slirp4netns 静态二进制的 01fea38（P5-22，app/sdk/sandbox/bin/slirp4netns）正文均为单行摘要，无任何 `来源:` 行。

## 已被否定

无（refuted 为空）。

## 统计

- finders：6
- candidates：17
- verified：13
- refuted：0
- dupes：2
- overBudget：2
