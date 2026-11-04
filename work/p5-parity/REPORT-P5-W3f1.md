# REPORT · P5-W3.f1（L-7 整分支修复链）

worktree：`/tmp/bot-wt/P5-W3f1`（分支 `feat/P5-W3f1`，基于 main d89dfde）
审查报告：`work/p5-parity/REVIEW-P5-W3.md`（base 5bd36e0 → head 4624670，4624670 ⊂ d89dfde，锚点全部复核成立）

## R1–R6 逐条

### R1 · shell-ask mcp__ 档位查表缺 default 兜底 · 已修
- **修法**：`app/sdk/src/policy/shell-ask.mjs` 查表改为 `tiers[exec.name] ?? (mcp__ 前缀 ? tiers.mcp ?? tiers.default : tiers.default)`——稀疏 overlay（仅 default 键、省 mcp 行）不再落入 workspace 分支被 `total===0 → next()` 静默放行。按档位表语义 default 是显式回退行；A9② 的表坏 fail-closed 不受影响（表坏仍在更早分支全退 ASK）。
- **红基线**：`tests/unit/policy.test.ts` 「sparse tier overlay without an mcp row」describe——修复前 `mcp__x__search` + `{tiers:{default:'ask'}}` 返回 next()（放行），断言 ask 失败。
- **文件**：shell-ask.mjs（查表行）+ policy.test.ts。

### R2 · shim 序列化丢弃工具执行结果 · 已修（覆盖层）
- **修法**（三层，上游 frontend/ 零改动，`pnpm check` diff=0 保持）：
  1. `shim/src/entries.ts`：tool-call raw entry 原样带出 `args` / `result` / `decision`（summary 仍是 ≤120 字单行预览）；
  2. 新覆盖层 `overrides/modules/model.ts`（注册进 `overrides/vite.config.ts` MODULE_OVERRIDES）：包一层上游 `projectTranscriptEntry`，tool-call 投影附 `toolResult` 快照（上游 `TranscriptToolCall.toolResult?: ToolResultCardSnapshot` 字段与 transcript.tsx 展开区的 `<ToolResultCard>` 渲染本来就存在，只是 0.18 重建树无喂给路径）。kind 映射：bash→shell、write→file-write、edit→file-edit、read/read_image/glob/grep/present→file-read（扩展档）、其余（mcp__ 等）→connector（扩展档）；卡片视图只把 kind 当字符串用（标题回退+aria-label），attach 处单点类型收窄并注明；
  3. 无 result 且无 decision（进行中）不附卡；审批拒绝的 decision 进卡片 summary。
- **红基线**：`tests/unit/grok-shim/entries.test.ts`「tool-call 保留完整 args 与 result」（修复前 result 在序列化中消失）+ `p5-w3f1.test.ts`「projectTranscriptEntry 附带 toolResult」4 例（修复前覆盖模块不存在，import 即失败）。
- **文件**：entries.ts、overrides/modules/model.ts、overrides/vite.config.ts。

### R3 · 重开已缓存 Bot 分页状态被清空卡死 · 已修（覆盖层）
- **修法**：新覆盖层 `overrides/modules/pagination.ts`：包一层上游 `createTranscriptPaginationController`——切走 scope 前保存当前 `{entries, cursor}`（unprobed 不存），切回已见 scope 时用 `installInitialPage` 恢复（more→nextBeforeSeq、exhausted→无键），全新 scope 仍走上游清空，fresh 首页作为权威覆盖记忆，`loadOlder` 翻页合并进记忆，`reset()`（会话删除）连记忆一起丢。ProductionRenderer（上游，未改）在 A→B→A 缓存命中路径只调 `setScope`——恢复后 hasOlder 立即诚实、loadOlder 真正取数、已加载的更早页重现。
- **红基线**：`p5-w3f1.test.ts`「pagination 覆盖层在 scope 回切时恢复已装页与游标」2 例（修复前覆盖模块不存在；verifier 的独立探针已复现 A→B→A 后 entries=0 / cursor=unprobed / fetchCalls 不增）。
- **文件**：overrides/modules/pagination.ts、overrides/vite.config.ts。

### R4 · 发送回执 nonce 绑到历史第一条用户消息 · 已修
- **修法**：`shim/src/data.ts` pendingNonce 由 `Map<agentId,string>` 改为 `Map<agentId,{nonce,prompt}>`（sendPrompt 记录 nonce+发送文本）；`shim/src/entries.ts` 绑定规则改为「最后一条与发送文本一致的用户消息」，窗口里还没有该文本时**不消费**（保持 pending，下一次快照新消息到达再绑），绝不贴到内容不同的旧消息上。发送失败不删 pending（歧义场景回执仍会到达并按文本命中；文本不同的旧消息不再可能误拿 nonce——原「stale nonce 误 ack」链路被内容门挡死）。重试场景（R5 换回原 nonce 后）原消息同文本，同样命中。O2 是同根 minor，一并闭合。
- **已知余量**（记档不修）：「历史里已有同文本旧消息 + 发送失败」的双重角落里，旧消息可能提前对账乐观条目（旧实现是无条件错绑，新实现收窄到同文本；显示最终收敛）。
- **红基线**：`entries.test.ts` 3 例（修复前 nonce 贴第一条：'q1' 拿到 nonce、'q2' 未到窗口时仍被贴到 'q1'）。
- **文件**：shim/src/data.ts、shim/src/entries.ts。

### R5 · 失败重试铸全新 nonce 绕过 SDK 幂等去重 · 已修（覆盖层）
- **修法**：两个覆盖层成对：`overrides/modules/acknowledgement.ts` 包一层上游 `createTranscriptAcknowledgementController`，把 `retryFailed` 观察到的 `${agentId}::${freshNonce} → 原 nonce` 登记进模块级 `retryWireNonces`（ack 层本来就持有 priorNonces 链，只是从未接到 wire）；`overrides/modules/coordinator-client.ts` 包一层上游 `createCoordinatorClient`，`call('sendPrompt')` 出线前经 `withWireSendPromptNonce` 把 clientNonce 换回原 nonce——换点位于上游全部路由/乐观记账决策之后、wire 之前，只改帧内 clientNonce（= shim 的 `session/prompt.requestId`），SDK `commands.ts` 的 requestId 去重对「已受理但回包丢失」的重试生效；未受理时以原 requestId 正常执行一次。渲染侧回执对账由上游 priorNonces 链照常完成（配合 R4 内容绑定，echo 携带原 nonce）。
- **红基线**：`p5-w3f1.test.ts`「retryFailed 登记 fresh→prior nonce…」2 例（修复前覆盖模块不存在；verifier 证据链 P1–P6 已证 fresh nonce 原样成为 requestId）。
- **文件**：overrides/modules/acknowledgement.ts、overrides/modules/coordinator-client.ts、overrides/vite.config.ts。

### R6 · policy-state 写端未落地导致文件工具全门控 · 已修
- **修法**：`app/sdk/src/policy/shell-ask.mjs` 区分「未 provision」（候选路径上**从未存在**状态文件——写端 P5-29 未交付的生产默认态）与「存在但无效」：新增 `policyStateProvisioned(paths)`（仅 ENOENT 视为缺失，其他错误视为存在→门关），文件工具门 `fileGateOpen = policyStateValid(...) || (policyStatePaths.length > 0 && !provisioned(...))`。未 provision 时文件工具回到 P5-21 之前的工作区内放行（委派 never 子代理的文件能力恢复），**bash 必问不变**（T-07 保持），裸挂（config 无 policyStatePaths）仍门关（文件头既定行为）。文件一旦出现（无论内容）即恢复完整 fail-closed——P5-29 落地后语义自动收紧，无需再改此处。
- **依据**：verifier 定性「问题在读写两端未一起落地，而不是 fail-closed 安全规则本身」；决策 16 的「文件缺失→ALWAYS 退 ASK」字面只约束 bash（ALWAYS 类），文件工具是 workspace 类（Q-013 第 3/4 行），其门控在缺写端期间挂起。此项偏离 Q-013 第 3/4 行「门关时 ASK」的 missing 子集，属 R6 判定的回归修复；L-8 复审请回审此取舍。
- **契约更新**（既有测试的预期翻转，均有注）：`policy.test.ts` 五态循环中 missing 态的文件工具格移入新 describe 断言放行；`guard-escalation.test.ts` ④b 的 dfa never 会话「工作区内 read」从 deny 改为成功执行（A9⑦ 提前到生产默认态，bash/write 的 guard 会话级 deny 不变）。
- **红基线**：`policy.test.ts`「unprovisioned policy-state」describe 3 例（修复前 missing 态 read/write=ask、never 会话=deny）。
- **文件**：shell-ask.mjs（policyStateProvisioned + fileGateOpen + 文件头）、policy.test.ts、guard-escalation.test.ts。

## O1–O7 处置

| # | 处置 | 说明 |
|---|---|---|
| O1 | **已修** | `start.ts` `childEnv`：`P2SDK_TEST_SLIRP_NO_LOOPBACK_GUARD` / `P2SDK_TEST_SLIRP_BIN` 只在显式 `P2SDK_TEST_SANDBOX=1`（测试门变量）时透传；生产启动环境残留同名值不再生效。request-network e2e 的 `launchNet` 加门变量。红：`start.test.ts` childEnv 新例 |
| O2 | **已修**（随 R4） | 与 R4 同根（nonce 错绑），内容绑定一并闭合；`entries.test.ts` 3 例覆盖 |
| O3 | **已修** | `shell-ask.mjs` request_network 分支出卡前先过 `validateRequest`（复用 request-net.mjs 同一函数，两侧校验对称）：execute 必拒的参数直接 deny，不再出「批准了也必然失败」的卡。红：`policy.test.ts` O3 describe 2 例 |
| O4 | **已修** | `shim/src/data.ts` `createBot` 的 notice 落 `createNotices`，空会话（尚无用户消息）的 transcript 快照以 notice 条目呈现、首条用户消息后撤下——对齐旧 renderer `addCreated(sid,presetId,notice)` 的可见性（新架构呈现位置是会话内而非全局 store）。对话框本身不改（它在成功路径关闭是正确的）。红：`p5-w3f1.test.ts` O4 例 |
| O5 | **已修** | `request-net.mjs` 新增只读 `hasLivePermit(dir,session,command)`（version/session/argvHash/expiry 四重匹配，wrapper 的 claim_permit 仍是权威，TOCTOU 无害）；`shell-ask.mjs` bash 档判定会 ask 时先查许可：request_network 刚批的同会话同命令直接放行——两卡变一卡，60s TTL 不再被第二张卡消耗。`start.ts` shellAskRow 注入 permitDir（与 requestNetRow 同一推导）。红：`policy.test.ts` O5 describe 3 例 |
| O6 | **已修** | `shim/src/coordinator.ts` setAgentUnread 读 `args.isUnread`（生产调用方实参名；原先读 `args.value` 恒 undefined → Mark as Unread 反而清未读）。红：`coordinator.test.ts` 新例 |
| O7 | **已修** | `shim/src/desktop.ts` 主题偏好落 localStorage（`pbots.shim.theme-preference`，与置顶同存储同取向），构造时恢复、损坏值回 system，system 仍实时跟随 prefers-color-scheme。红：`desktop.test.ts` 新 describe 2 例 |

## 超预算未验证项（REVIEW「超出预算」节，不在本链范围）

- `data.ts:186` 断链重连快照与分页游标（major 候选未验证）：未修。R3 的 scope 恢复不覆盖断链场景；建议派发者立新任务。
- `SOURCES.tsv` commit 正文缺 `来源:` 行（68858b5 / 01fea38 单行摘要）：历史 commit 正文不可追加（改写历史需 force-push）。此处记档替代：68858b5 引入 renderer-grok 332 文件（来源 grok-bot-0.18-reconstructed@a9f633e，逐文件头 + SOURCES.tsv sha256 均在）；01fea38 引入 `app/sdk/sandbox/bin/slirp4netns`（GPL-2.0 静态二进制，来源+sha256+许可证记于 `app/sdk/sandbox/bin/README.md`）。后续新搬运 commit 正文照 CLAUDE.md §3 写。

## 验证

- app/sdk：`pnpm test` 全量 **37 文件 319 用例全绿**（unit 196 + e2e 123；含 guard-escalation ④b 更新格、request-network 差分格带门变量重跑）
- app/ui：`pnpm test`（vitest）**36 文件 399 用例全绿**；`renderer-grok pnpm check` upstream diff=0（332 文件）；`pnpm build` 绿（覆盖模块进包：retryWireNonces / tool-result-kind 均在产物 bundle）
- app/ui e2e（Xvfb）：{{E2E_RESULT}}
- 红基线汇总：SDK 7 红（policy 6 + start 1）→ 绿；UI entries 3 红 + p5-w3f1 整文件红（覆盖模块不存在）→ 绿

## 待 verifier 验收

R1-R6 全部 FIXED（无 REFUTED）；O1-O7 全部 FIXED；两包全量绿。L-8 复审注意两处契约更新理由：R6 的 missing 态放宽（上文依据段）与 guard-escalation ④b 预期翻转。
