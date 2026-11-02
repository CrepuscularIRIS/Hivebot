verdict: FAIL
base: f9dfc45c64a574f2584781e747bf1654618c4729  head: b634e9d0dc33e058e8bea83dd18f9ce95c16a366（head 若已变更，本报告作废）

# mm-review L 档 · P2最终收尾 · 范围 f9dfc45..b634e9d

## 阻塞问题

### R1

- file:line: /home/lingxufeng/bot/app/sdk/src/policy/shell-ask.mjs:91
- severity: major
- verdict: CONFIRMED
- finder: sol:后端逻辑
- summary: 读取 session 审批策略失败时仍回退部署级 never，导致本应 fail-closed 的异常路径放行普通 shell。
- 触发条件: 部署级 approval.config.policy 为 never，而当前 session 通过 override 设置为 ask；如果审批投影因状态不可读或历史序号缺失而使 overrideOf(session) 抛错，/home/lingxufeng/bot/app/sdk/src/policy/shell-ask.mjs:88-94 会吞掉异常，将 override 置为 undefined，然后 :96-98 采用部署级 never。上游投影确有缺失序号时抛错的路径，见 /home/lingxufeng/bot/repos/deepseek-harness/packages/session/session-projection/src/index.ts:794-798。
- 失败表现: 外层 /home/lingxufeng/bot/app/sdk/src/policy/shell-ask.mjs:45 会调用 next()，普通 bash 不再经过本策略的审批请求，因此无法确认 session 策略时反而绕过其 ask 限制；改动前该路径会要求审批而不是直接放行。已用 config.policy=never 且 overrideOf 抛错的服务替身复现返回 next 的放行结果，现有异常测试仅覆盖 config 未设置的情况。

verifier 证据：

All premises verified; reproduced with the real module and a throwing stub.

Premise 1 — deployment config.policy='never' is reachable: /home/lingxufeng/bot/repos/deepseek-harness/packages/interaction/user-approval/src/index.ts:167-169 (Config schema allows 'never'), :176 (constructor `public config`, so svc.config.policy is the deployment config), /home/lingxufeng/bot/repos/deepseek-harness/packages/bundle/base/cordis.patch.yml:262 (DSH_PERMISSION_MODE=danger-full-access wires policy: 'never'). No guard blocks this value.

Premise 2 — session override 'ask' coexisting with config 'never' is a legitimate state: /home/lingxufeng/bot/repos/deepseek-harness/packages/interaction/permission-presets/src/index.ts:183-185 ('workspace-write' preset = approval 'ask'), :398-418 (set/apply writes setApprovalPolicy on preset switch), :429-457 (pinInitialPermission pins the default preset's approval for fresh sessions). The diff's own test comment (app/sdk/tests/unit/policy.test.ts:138-143) names "the pinned 'ask' of the default preset". No caller guarantee prevents this combination.

Premise 3 — overrideOf can throw: /home/lingxufeng/bot/repos/deepseek-harness/packages/interaction/user-approval/src/index.ts:279-283 (overrideOf -> approvalStateOf -> projectionHandle.stateOf), /home/lingxufeng/bot/repos/deepseek-harness/packages/session/session-projection/src/index.ts:794-798 (advanceCell throws "cannot advance across missing seq" on a gapped session log). The SDK author added the try/catch precisely for this path, so it is treated as reachable by both sides.

Failure path confirmed: /home/lingxufeng/bot/app/sdk/src/policy/shell-ask.mjs:88-94 swallows the throw and sets override=undefined; :96-98 evaluates (undefined ?? 'never' ?? 'ask') === 'never' -> true; :43-45 returns next() so ordinary unprivileged bash is delegated with no ask (nothing downstream asks for non-escalated bash). Reproduction in an isolated /dev/shm dir against the actual module: (A) override 'ask' readable + config 'never' -> ask (correct); (B) throw + config unset -> ask (the only case the existing test covers, tests/unit/policy.test.ts:184 uses approvalSvc(undefined, undefined, true)); (C) throw + config 'never' with the session's true override 'ask' -> PASS-THROUGH, i.e. ordinary bash silently bypasses the ask gate.

Introduced by this diff: git diff f9dfc45..b634e9d shows the entire approvalNever function and the line-45 `if (approvalNever(ctx, exec)) return next()` were added in this range. Pre-change, this path always returned ask; the ask would then fail loudly inside user-approval's effectivePolicy (same projection throw propagates, user-approval index.ts:270-272 has no silent catch), so bash never ran silently. Post-change it does.

The behavior also contradicts the function's own documented contract: shell-ask.mjs:79-81 states "overrideOf 抛错 → false（照旧 ask，fail closed：无法证明 never 就不放宽）" and the catch comment at :92 claims "fail closed 方向" — but with configured==='never' the error path is fail-open, silently degrading a session pinned to 'ask' to the deployment-wide 'never'.

Severity major (not critical): it is a genuine approval-policy bypass on ordinary shell, but triggering requires an abnormal session-projection state (missing seq / unreadable projection) combined with a deployment configured for never, not an everyday configuration. Fix direction: on overrideOf throw, return false from approvalNever (treat unreadable as not-never) instead of falling through to configured, matching the documented fail-closed contract; add the throws+config-never test case.

### R2

- file:line: /home/lingxufeng/bot/app/sdk/src/p2temp/index.mjs:197
- severity: major
- verdict: CONFIRMED
- finder: sol:并发与数据完整性
- summary: 幂等检查把激活失败的 preset 当作成功结果缓存，导致修复连接器后仍无法重试恢复。
- 触发条件: 连接器的 manifest 和 JSON patch 可以读取，但插入的插件行无效、模块无法加载或启动失败。上游 /home/lingxufeng/bot/repos/deepseek-harness/packages/preset/agent-preset-registry/src/index.ts:97-136 会先保存 definition，再把激活失败保留为 broken，而不是让 register 必然抛错。首次调用后修正连接器，再对相同 recipe 调用 preset.ensure 或 createWithConnectors，就会命中 /home/lingxufeng/bot/app/sdk/src/p2temp/index.mjs:197 的提前返回。
- 失败表现: preset.ensure 首次就可能返回成功的 presetId，后续重试既不重读修复后的 patch，也不重新激活，使用该 preset 的会话继续报 agent-preset/invalid，直到重启运行时。已用安装的真实 AgentPresetRegistry 复现：插入缺少 name 的行时 ensure 返回成功；修正 patch 后再次 ensure，resolve 仍返回原来的 broken 诊断。本次由随机新 id 改为固定 id 加 has-check，使此前下一次创建能够重新注册的路径永久复用失败记录。

verifier 证据：

All premises verified against code; the failure path is fully deterministic.

Premise 1 — connector patch readable while inserted row is invalid: /home/lingxufeng/bot/app/sdk/src/p2temp/index.mjs:102-129 (readConnectorRows) validates only that package.json parses, dsh.bundle.patch is a string, the patch is JSON, and rows are non-empty. No row-shape validation; anchorInsertedPluginNames (index.mjs:84-94) only rewrites path-like names. A row without a "name" string passes the SDK layer but fails upstream activation via entryListProblem (repos/deepseek-harness/packages/preset/agent-preset-registry/src/definition.ts:18-39, called at registry src/index.ts:123), as does any module-load/mount failure in mountPreset.

Premise 2 — upstream register resolves despite activation failure: repos/deepseek-harness/packages/preset/agent-preset-registry/src/index.ts:102 sets this.definitions.set(definition.id, record) BEFORE activation (line 114); activate() (lines 119-138) catches every failure into record.broken (lines 133-137) and never rejects; register's only throw paths are empty id (99) and duplicate (100). So `await this.ctx.agentPresets.register({id, plugins: rows})` at index.mjs:204 resolves and registerPreset returns id as success while the preset is unusable — preset.ensure (index.mjs:169-174) returns {presetId} success.

Premise 3 — broken record persists: index.mjs:204 discards the returned unregister disposer; the ponytail comment at index.mjs:202-203 says temp presets are never unregistered; unregister (registry index.ts:104-113) is the only deletor of definitions. Sessions then fail: retain() (registry index.ts:248-263) → diagnostic returns record.broken (151-153) → throws RemoteError('agent-preset/invalid') (257-259) when the session's Agent mounts the preset.

Premise 4 — same id after fixing the connector on disk: preset-id.mjs:26-32 hashes only [agentPreset, normalized connector names]; header lines 5-7 explicitly exclude rows/patch content, so fixing the bundle's patch under the same bundle name leaves the id unchanged.

Premise 5 — early return with no health check: index.mjs:197 `if (this.ctx.agentPresets.definitions?.get(id) !== undefined) return id` returns the stale id for the broken record (present since registry line 102 runs before activation); the patch re-read at index.mjs:200-201 and re-register at 204 are both skipped on retry. No resolve()/diagnostic/broken check anywhere in registerPreset (index.mjs:196-206).

Premise 6 — introduced by this diff: git log shows d0a8008 (inside f9dfc45..b634e9d) touched both files; the base version (git show f9dfc45:app/sdk/src/p2temp/index.mjs) generated `p2temp-${++this.tempPresets}-${Math.random()...}` per call with no has-check, so a broken registration never poisoned retries — each retry re-registered under a fresh id. The content-based id + has-check early return at line 197 is new in this range, making the stale-broken reuse permanent until runtime restart.

Corroborating: the code's own JSDoc (index.mjs:179-181) claims "registry 不留半成品，失败后……重试走完整路径" — an assumption upstream register() does not honor for activation failures; the documented invariant is violated by actual upstream behavior (this coupling is acknowledged at index.mjs:69-70 and is the same definitions map the SDK reads for its has-check).

Severity major (not critical): silent success for an unusable preset plus unrecoverable retry until runtime restart defeats preset.ensure's documented purpose (CONTRACT #21 restart recovery), but there is no security/data-loss impact and a runtime restart recovers.

### R3

- file:line: /home/lingxufeng/bot/app/sdk/src/p2temp/index.mjs:185
- severity: major
- verdict: CONFIRMED
- finder: sol:并发与数据完整性
- summary: preset id 使用规范化连接器集合，但实际注册使用原始数组，使相同 id 的内容取决于先到达的请求。
- 触发条件: 调用方先提交包含重复连接器的数组，例如 ['c','c']，再提交 ['c']，或并发提交同一集合的不同顺序。/home/lingxufeng/bot/app/sdk/src/p2temp/preset-id.mjs:13-31 对数组去重排序后生成相同 id，但 /home/lingxufeng/bot/app/sdk/src/p2temp/index.mjs:200-204 仍按原始数组拼接插件行；后续请求由 :186-187 的单飞或 :197 的 has-check 复用首个组合。
- 失败表现: 请求 ['c'] 可能拿到含两份连接器插件行的 preset；当 patch 含允许省略 id 的插件行时，两份匿名行会分别参与加载。不同连接器复用同一插件行 id 时，换序还会改变上游 /home/lingxufeng/bot/repos/deepseek-harness/vendor/loader/src/config/group.ts:48-58 的最后一行覆盖结果，因此并发到达顺序或重启时 recipe 的规范化顺序能够改变相同 presetId 的实际连接器配置。已通过服务路径复现 ['c','c'] 注册两行后，['c'] 返回相同 id 并继续复用这两行；本次新增的稳定 id 和复用逻辑把一个请求的原始数组差异传播到了其他会话。

verifier 证据：

All premises hold against the real code and a live repro (run in /dev/shm/mm-review-*, deleted afterwards) using the actual modules. (1) ID/content mismatch: preset-id.mjs:22 dedupes+sorts ([...new Set(connectors)].sort()) and :30 derives the id from the normalized list, but index.mjs:185-188 keys the in-flight/has-check on that id while passing the RAW connectors array to registerPreset, which iterates it at index.mjs:201 (for...rows.push per occurrence). Repro: presetIdOf('base',['a','a'])===presetIdOf('base',['a']) and id(['a','b'])===id(['b','a']) both true. (2) No guard: normalizeConnectors (index.mjs:57-67) only checks non-empty strings and returns the array unchanged despite its comment claiming it returns a normalized array; remote entry points index.mjs:154-161 and :169-174 pass request.connectors through raw; CONTRACT §2.2's planned main-side checks (non-empty strings only) do not dedupe or fix order either. (3) Reuse spreads the first request's shape: repro showed ensurePreset('base',['conn-a','conn-a']) registering plugins ["root","shared-mcp","shared-mcp"], then ensurePreset('base',['conn-a']) returning the SAME id with 1 total register (has-check index.mjs:197; registry Duplicate throw at repos/deepseek-harness/packages/preset/agent-preset-registry/src/index.ts:100 is never reached, so no re-register corrects it). (4) Failure manifestation: entryListProblem (agent-preset-registry/src/definition.ts:16-32) accepts duplicate rows/ids; loader EntryGroup.update (vendor/loader/src/config/group.ts:51-58) keys by options.id with Object.fromEntries (same-id rows: last occurrence wins) and gives anonymous rows unique Symbol keys (both load) — repro confirmed same presetId with reversed row order for ['b','a'] vs ['a','b'], so the effective composition under a shared row id depends on arrival order (and on recipe replay order at restart, CONTRACT #21). Caveat scoping the impact: pure duplicates of identical id-carrying rows collapse at mount to one entry (benign); the harm requires anonymous patch rows (connector loads twice) or row-id reuse across connectors (last-wins content flip), both permitted by the row format — exactly as the finding itself scoped it. (5) Introduced by this diff: git cat-file shows app/sdk/src/p2temp/preset-id.mjs absent at base f9dfc45 and ensurePreset/registerPreset/in-flight are new (T-16). Severity kept major: the content-addressed-id invariant (same id ⇔ same content, relied on by restart replay and cross-session reuse) is silently broken and reachable from the whitelisted remote surface (#4 session.createWithConnectors); not critical since no crash, data loss, or security impact and P2-TEMP presets are few. Fix is one line: register from normalizedConnectors(connectors) instead of the raw array.

### R4

- file:line: app/sdk/src/p2temp/index.mjs:197
- severity: major
- verdict: CONFIRMED
- finder: opus:跨文件深度
- summary: The has-check treats any registered id as reusable. Upstream AgentPresetRegistry.register() puts the record into `definitions` before it activates the preset, and it does not reject when activation fails: it only sets record.broken, and a mount failure is final. So a content-addressed p2temp preset that failed to mount stays cached under that id for the life of the runtime, and later createWithConnectors/preset.ensure calls with the same (agentPreset, connectors) return it again instead of re-registering.
- 触发条件: Call createWithConnectors({agentPreset:'standard', connectors:[X]}) where X's patch row fails at mount. Example: the bundle's plugin module is missing or corrupt, or its row config is invalid, so mountPreset's audit.failed is non-empty. Then fix or reinstall X with pluginManager/installBundle and retry the same call, or have main call p2temp/preset.ensure for that recipe.
- 失败表现: Every retry returns the same broken id. sessionController.create then fails in retain() with agent-preset/invalid until dsh restarts, while preset.ensure reports success ({presetId}) for the unusable preset. Before T-16 each retry registered a fresh random id, so a fixed bundle worked on retry. This also breaks CONTRACT §8 item 1 and the code comment's promise that the registry keeps no half-built preset and a retry goes through the full path. The unit test only passes because its mock register() rejects, which the real registry never does.

verifier 证据：

问题由本次内容定 id 与 has-check 引入。/home/lingxufeng/bot/app/sdk/src/p2temp/index.mjs:124-128 只要求 JSON patch 能提取非空 insert 行，没有验证插件是否能挂载；因此 insert 行缺少 name、插件模块缺失或初始化失败都能进入 register。实际安装的上游实现 /home/lingxufeng/bot/app/sdk/node_modules/.pnpm/@deepseek-ai+dsh-agent-preset-registry@0.2.2-alpha.2_af750413c870bb185a943f20eba5ab71/node_modules/@deepseek-ai/dsh-agent-preset-registry/lib/index.js:486-509 先将 record 写入 definitions，再等待 activate，并正常返回注销函数；同文件:511-536 捕获行校验或 mountPreset 失败，仅设置 record.broken 并释放 scope，不删除定义或拒绝注册。其 :549-551 在没有 generation 时始终返回保存的 broken，所以修复连接器文件不会重新激活该记录。/home/lingxufeng/bot/app/sdk/src/p2temp/index.mjs:197 对此类失败记录直接返回 id，跳过连接器重读和注册；:204-205 也未检查首次注册后的诊断，且丢弃了注销函数。因此首次 preset.ensure 就可能报告成功，而修复 patch 或模块后再次调用仍返回不可用 id。/home/lingxufeng/bot/app/sdk/src/p2temp/preset-id.mjs:25-31 只对基础预设名和连接器名求 hash，修复 patch 不改变 id。会话失败链也成立：/home/lingxufeng/bot/app/sdk/src/p2temp/index.mjs:158-159 将该 id 交给 sessionController.create；/home/lingxufeng/bot/repos/deepseek-harness/packages/api/session-controller/src/agent.ts:276-281 随后调用 presets.mount；/home/lingxufeng/bot/repos/deepseek-harness/packages/preset/agent-preset-registry/src/index.ts:297-298 进入 retain，而 :254-259 对 broken 定义抛出 agent-preset/invalid。基线每次注册新随机 id，修复后重试能重新读取并激活；本次改动则将一次失败固定在同一 recipe 上，需重启或显式移除定义才能恢复。/home/lingxufeng/bot/app/sdk/tests/unit/p2temp.proc.mjs:282-293 的失败重试测试将 register 模拟为直接抛错，没有模拟真实上游保留 broken 定义并正常返回的行为，因此未覆盖此缺陷。以上为源码及实际安装依赖的静态调用链核验，未修改仓库或运行全量测试。

### R5

- file:line: app/sdk/scripts/fetch-market-fixture.mjs:76
- severity: major
- verdict: CONFIRMED
- finder: opus:跨文件深度
- summary: toPlugin emits each registry server as a format-1 npm entry whose name is the made-up `@<registry-name>` (for example @io.github.bytedance/mcp-server-filesystem) and whose version is the registry's server version (1.0.0), not an npm package that exists. plugin-market's listingOf/marketInstallTarget turns that entry into the install spec `@io.github.bytedance/mcp-server-filesystem@1.0.0`, which does not exist on npm and is not a dsh bundle anyway.
- 触发条件: Point P2SDK_MARKET_SOURCE_INDEXES (market-source.yml) at the generated index.json, list the market, and install the selected connector, or any of the 111 entries, using the listing's versions[].install spec through pluginManager/installBundle.
- 失败表现: None of the market entries can be installed, so the D6 list → install → enable journey breaks for a real user or the P4 UI. market.test.ts gets around this by installing a hand-written wrapper bundle around the devDependency @agent-infra/mcp-server-filesystem@1.2.29, which is a different name and version from the listed entry. D6 shows PASS even though the listed connector cannot be installed from the directory.

verifier 证据：

本次新增的 /home/lingxufeng/bot/app/sdk/scripts/fetch-market-fixture.mjs:76-83 把 registry server 名称机械转换为 npm 包名，并把 server.version 当作 npm 版本，未生成或发布对应的 dsh bundle。实际快照 /home/lingxufeng/bot/app/sdk/tests/e2e/fixtures/market/index.json:1463-1472 因而将选定连接器声明为 @io.github.bytedance/mcp-server-filesystem@1.0.0、source.type=npm；安装目标确实可达，因为 /home/lingxufeng/bot/app/sdk/node_modules/@deepseek-ai/dsh-plugin-market/lib/index.js:1450-1454 将每个版本经 marketInstallTarget 暴露为 versions[].install，且 /home/lingxufeng/bot/app/sdk/tests/e2e/market.test.ts:228-232、253-273 已配置该索引并通过 SDK 搜索到此条目。在已删除的 /dev/shm/mm-review-* 临时目录中调用实际安装的 marketInstallTarget，得到 {"spec":"@io.github.bytedance/mcp-server-filesystem@1.0.0"}；随后匿名 GET https://registry.npmjs.org/%40io.github.bytedance%2Fmcp-server-filesystem 返回 HTTP 404 和 {"error":"Not found"}，因此将该 listing 的 spec 传给 installBundle 无法安装选定连接器。现有验收绕过了此断点：/home/lingxufeng/bot/app/sdk/tests/e2e/market.test.ts:110-134 另造名为 @p2sdk-real/filesystem 的本地 bundle，直接引用已安装的 @agent-infra/mcp-server-filesystem，随后在 :240-245 安装本地目录、在 :300-302 启用 wrapper，而不是安装搜索结果的目标，所以用例通过不能证明浏览→安装链路成立。保留 major：选定连接器的核心安装链路已实证失败；不将此实验扩张为已逐一证实全部 111 个条目均不存在。

## 上轮未修

无（unfixedFromLastRound 为空）。

## 其他发现

### O1

- file:line: /home/lingxufeng/bot/app/sdk/src/p2temp/index.mjs（未给出行号）
- severity: minor
- verdict: CONFIRMED
- finder: glm:安全
- summary: Duplicate connector names pass normalizeConnectors (which returns the original array unchanged) and registerPreset iterates the raw list, so a request like connectors:['x','x'] pushes connector x's insert rows twice into the preset — while presetIdOf dedupes, hashing ['x','x'] to the exact same id as ['x'] (verified: presetIdOf('standard',['a','a']) === presetIdOf('standard',['a'])). The first duplicate-carrying call therefore registers a polluted preset under the id that every clean, deduped recipe maps to, and the has-check in registerPreset (index.mjs:197) then serves that polluted preset to all later clean callers.
- 触发条件: Any gateway-authenticated client calls p2temp/preset.ensure or p2temp/session.createWithConnectors (both remote methods added/changed in this diff, src/p2temp/index.mjs:154-174) with a repeated bundle name in the connectors array, e.g. request {agentPreset:'standard', connectors:['@p2sdk-fixture/demo','@p2sdk-fixture/demo']} — normalizeConnectors only rejects non-string/empty entries, not duplicates.
- 失败表现: The preset registered under the shared content id carries the connector's insert rows twice (double plugin/MCP-server rows, or an upstream duplicate-row failure at activation); every later p2temp/preset.ensure or p2temp/session.createWithConnectors with the clean deduped recipe silently reuses the polluted preset via the has-check, and the CONTRACT §21 restart-recovery path can rebuild a different preset than the one the session header froze — the 'id ↔ normalized recipe' invariant T-16 relies on is silently broken.

verifier 证据：

可达且属于本次新增的共享内容 id 缓存污染，而不只是旧有的重复输入问题。/home/lingxufeng/bot/app/sdk/src/p2temp/index.mjs:57-66 的 normalizeConnectors 只校验成员类型与非空，不拒绝或移除重复值；两个公开方法在同文件:154-173 均把原始 connectors 继续传给 ensurePreset。/home/lingxufeng/bot/app/sdk/src/p2temp/preset-id.mjs:22、30 将 connectors 去重排序后计算 id，但 /home/lingxufeng/bot/app/sdk/src/p2temp/index.mjs:200-204 仍遍历原始数组、重复读取并追加同一连接器的插件行，因此 ['demo','demo'] 与 ['demo'] 使用相同 id，却注册不同的 plugins 内容。后续干净请求在同文件:197 命中 definitions 后直接返回，无法纠正已有内容。在 /dev/shm/mm-review-XXXX 临时目录使用真实 P2TempService、真实连接器文件读取及最小 registry 替身复现：先 ensure 重复 recipe，再 ensure 单一 recipe，两次返回 p2temp-33cb5256189e，register 仅调用一次，缓存中保留两条相同 connector 插件行；断言全部通过，临时目录已删除。上游 /home/lingxufeng/bot/repos/deepseek-harness/packages/preset/agent-preset-registry/src/index.ts:97-102 直接保存传入 definition，且 /home/lingxufeng/bot/repos/deepseek-harness/packages/preset/agent-preset-registry/src/definition.ts:18-38 的校验不去重，因此没有上游归一化可以消除此不一致。保留 minor：已证实重复行与跨请求复用污染，但未把候选中的 MCP 双启动、激活失败或重启恢复差异当作实测结论。

### O2

- file:line: /home/lingxufeng/bot/app/sdk/src/p2temp/index.mjs（未给出行号）
- severity: minor
- verdict: CONFIRMED
- finder: glm:正确性+合规
- summary: Duplicate bundle names in `connectors` are silently accepted and produce a preset with the connector's insert rows applied twice, while sharing the same content-derived id as the de-duplicated recipe (id/content divergence between createWithConnectors and preset.ensure).
- 触发条件: Call the exposed remote method with a repeated bundle name, e.g. p2temp/session.createWithConnectors({connectors: ['@p2sdk-real/filesystem', '@p2sdk-real/filesystem'], agentPreset: 'standard'}). normalizeConnectors (index.mjs:57) only validates each name is a non-empty string, so duplicates pass; presetIdOf/preset-id.mjs:14 de-duplicates for the id, but registerPreset (index.mjs:201) iterates the raw array, pushing the connector rows twice. Whatever registers first (['a','a'] vs later ensure(['a'])) fixes the preset content for that id.
- 失败表现: The content-derived preset id no longer determines the preset content (CONTRACT §3.1 determinism broken): the connector's plugin insert rows are applied twice in the registered preset, so sessions created under that id get duplicated plugin rows (same plugin/service id twice at composition — load error or double-mounted tools). preset.ensure can never repair it: the has-check (definitions.get(id)) and same-id in-flight sharing return the poisoned definition for the whole runtime lifetime.

verifier 证据：

确认本次引入了同 id 对应不同插件组成的问题，但不能仅凭这些证据断言真实连接器必然加载失败。对外方法在 /home/lingxufeng/bot/app/sdk/src/p2temp/index.mjs:154-158、169-173 接收 connectors，所调用的 normalizeConnectors 只检查非空数组和字符串，不拒绝或去除重复项（同文件:57-66）。/home/lingxufeng/bot/app/sdk/src/p2temp/preset-id.mjs:22、30 在计算 id 时去重排序，而 index.mjs:200-204 按原始数组逐项读取并追加插件行，故 ['demo','demo'] 和 ['demo'] 共用 id，却生成不同的注册内容。index.mjs:197 的 has-check 又使后续单项 ensure 直接复用重复行定义。本次 diff 把原先随机、一次性的 id 改为上述共享内容 id，因此共享定义污染是新增问题，虽重复追加行为此前已经存在。已在 /dev/shm/mm-review-XXXX 临时目录用真实 P2TempService、JSON connector patch 和记录型 registry 复现：先 createWithConnectors(['demo','demo'])，再 presetEnsure(['demo'])，返回相同 id p2temp-33cb5256189e，register 仅调用一次，保存的 plugins 确实包含两条完全相同的 connector 行；临时目录已删除。此实验直接证明 id/内容不一致与后续无法通过 ensure 纠正；未运行完整 dsh，因此保留 minor，不将推测的加载错误或双挂载作为已验证后果。

## 超出预算未验证

无。

## 已被否定

- /home/lingxufeng/bot/app/sdk/scripts/fetch-market-fixture.mjs — toPlugin's publishTimestamp falls back to wall-clock Date.now() when a registry entry lacks the official publishedAt meta, making the regenerated fixture non-deterministic; a missing server.version would likewise emit a versions row with the `version` key silently dropped.（finder: glm:正确性+合规）

## 统计

| 项 | 值 |
|---|---|
| finders | 6 |
| candidates | 11 |
| verified | 8 |
| refuted | 1 |
| dupes | 3 |
| overBudget | 0 |

- verdict: FAIL
- 阻塞问题：R1–R5（CONFIRMED 且 major）
- 其他发现：O1–O2（CONFIRMED 且 minor）
