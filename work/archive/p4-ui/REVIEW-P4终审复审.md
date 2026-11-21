verdict: PASS

base: 86b4c2c5bbe637966d32390c23fe5ef4ef79f15b  head: 1e18112b1e6860db3c2d67f6dc3fe035252b1cab（head 变了本报告作废）

## 阻塞问题

无（verdict=CONFIRMED 且 severity 为 critical / major 的发现：0 条）。

## 上轮未修

无（unfixedFromLastRound 为空）。

## 其他发现

### O1 · app/ui/tests/support/creds.ts:18

- **severity**: minor
- **verdict**: CONFIRMED
- **finder**: glm:正确性+合规
- **summary**: 手写 dotenv 解析不认引号与行内注释：KEY="value" 返回带引号的值，KEY=value # note 返回含注释的值（也不认 export 前缀和行首空白）
- **触发条件**: 开发者按 dotenv 惯例在 app/ui/.env 写 LITELLM_MASTER_KEY="sk-..."（带引号）或行尾 # 注释；expect(apiKey).toBeTruthy() 挡不住——带引号的值非空为真，照常传给 SDK 子进程
- **失败表现**: d1-real-model 真模型旅程拿到的 key 含字面引号/注释 → LiteLLM 401，旅程以误导性的鉴权错误 FAIL（而非清晰的「未配置」提示），排查成本高；引号形态是 dotenv 用户的常见写法
- **verifier 证据**: 这是本次新增 .env 兜底路径引入的问题。/home/lingxufeng/bot/app/ui/tests/support/creds.ts:9-10 仅在环境变量非空时提前返回，因此未导出 LITELLM_MASTER_KEY、仅通过文件配置的触发条件可达；该文件第18-20行只截取等号后的字符串并 trim，不会去除值外层引号或行内注释。已在 /dev/shm/mm-review-XXXX 临时目录使用虚构 key 调用实际函数，验证 KEY="dummy-key" 返回含字面引号的字符串，KEY=dummy-key # note 返回含注释的字符串，二者均为真值且不同于预期 key，实验目录已删除。/home/lingxufeng/bot/app/ui/tests/e2e/journeys/d1-real-model.spec.ts:19-24 将该结果经过仅检查真值的断言后直接赋给 P2SDK_LLM_API_KEY；/home/lingxufeng/bot/app/ui/tests/support/sdk-runtime.ts:77-85 和 /home/lingxufeng/bot/app/ui/tests/support/sdk-env.ts:16-19 将其原样传入 SDK 子进程。/home/lingxufeng/bot/app/sdk/src/start.ts:50-53 仅 trim，且第114-129行向真实 provider 传递该环境变量，并无修复引号或注释的守卫。因此，服务端配置的是不带引号和注释的真实 key 时，这两种常见 .env 写法会提交错误凭证并导致真模型旅程鉴权失败。未连接真实 LiteLLM，也未读取真实凭证；具体 HTTP 状态码未实测。影响限于测试凭证文件格式兼容性，保留 minor。

### O2 · app/ui/tests/e2e/settings.spec.ts:227

- **severity**: minor
- **verdict**: CONFIRMED
- **finder**: glm:正确性+合规
- **summary**: O2 竞态 e2e 的终局断言余量过薄：注入延迟 2.5s，断言前只等 3.0s，旧轮次响应若在断言后才落地则用例空转通过（假绿）
- **触发条件**: CI 机器上 agentPresets/list 的 renderer→main→dsh 往返耗时使旧轮次响应落在终局断言之后（注入 2.5s + 往返 > 断言时刻；余量仅约 1s 减去两轮 RTT 差）
- **失败表现**: O2 回归（失效 token 被移除）在此环境下不会被该用例拦截——它存在的唯一目的就是锁住这个竞态；建议改为在延迟窗口后轮询断言一段固定时间或把 waitForTimeout 拉长到注入延迟 + RTT 余量
- **verifier 证据**: 这是本次新增测试的假绿窗口，不是现有失效 token 修复本身失效。/home/lingxufeng/bot/app/ui/renderer/shell/store.ts:68-77 的 slowNext 只在真实 RPC 发起前等待 2500ms，不保证响应届时完成；后续 /home/lingxufeng/bot/app/ui/main/m1-api/index.ts:198 仍要等待 dsh.rpc，而 /home/lingxufeng/bot/app/ui/main/dsh/connect.ts:26-34 的 fetch 与 JSON 读取没有保证它们在终局断言前完成的时限。因此可达如下时序：第二轮请求先完成并选中 beta，第一轮在延迟放行后仍在等待服务端，直到终局断言之后才返回。/home/lingxufeng/bot/app/ui/tests/e2e/settings.spec.ts:224-230 仅在第二轮选中后固定等 3000ms，再用正向 toBeChecked 检查当前已成立的状态，成功后立即关闭对话框，没有等待第一轮请求完成。若移除 /home/lingxufeng/bot/app/ui/renderer/plugins/settings/NewBotDialog.tsx:54 的 stale 守卫，这个时序下测试仍会通过，但第一轮回调随后会在该文件:58 把 presetId 改回 alpha，正是测试要捕捉的回归。候选描述的具体 RTT 余量不能固定推算，但缺少旧请求完成屏障这一缺陷可由代码确认。应显式等待旧请求及其初始化回调完成后断言；单纯延长固定等待或正向轮询不能提供确定保证。

### O3 · /home/lingxufeng/bot/app/ui/tests/support/creds.ts:19

- **severity**: minor
- **verdict**: CONFIRMED
- **finder**: sol:后端逻辑
- **summary**: 新增的 dotenv 兜底解析器没有去除值两端的引号，导致合法的带引号凭证被错误传入认证链。
- **触发条件**: 当进程环境中没有 LITELLM_MASTER_KEY，而 app/ui/.env 使用标准 dotenv 写法 LITELLM_MASTER_KEY="dummy-key" 或单引号写法时，/home/lingxufeng/bot/app/ui/tests/support/creds.ts:18-20 只执行截取和 trim，返回值仍包含引号；已用虚构凭证实测确认。
- **失败表现**: /home/lingxufeng/bot/app/ui/tests/e2e/journeys/d1-real-model.spec.ts:19-24 会让该非空值通过凭证存在性断言，并将包含引号的字符串作为 P2SDK_LLM_API_KEY 传入真模型 runtime，导致有效凭证认证失败，使本应可运行的真模型验收旅程失败。
- **verifier 证据**: All premises verified. (1) creds.ts:9-10 — env-var path only returns when set and non-empty; absent env var (the exact scenario R9 built this for, per creds.ts:1-4 header) falls through to the .env path. (2) creds.ts:18-19 — the parser matches a quoted line `LITELLM_MASTER_KEY="dummy-key"` and only slices after `=` and calls .trim(), which strips whitespace but not quotes; reproduced in /dev/shm/mm-review-XXXX with the exact expressions: double-quoted form returns "\"dummy-key\"" (literal quotes included), single-quoted likewise; no guard strips quotes anywhere. (3) d1-real-model.spec.ts:19-20 — expect(apiKey).toBeTruthy() passes for the quoted non-empty string; no key-format validation. (4) d1-real-model.spec.ts:24 passes it as P2SDK_LLM_API_KEY; sdk-runtime.ts:77-85 spreads ...opts.env straight into the child env via sdkChildEnv with no sanitization, so LiteLLM receives the key with literal quotes → auth fails → streaming selectors at spec:36/38 time out → real-model journey FAILs with misleading cause (the line-20 credential assertion already passed). Standard dotenv consumers (dotenv npm, docker-compose env_file, direnv, systemd EnvironmentFile) all strip matching surrounding quotes, so a conventionally-written quoted .env silently corrupts the credential. Unit test tests/unit/support/creds.test.ts:13-14 only covers the unquoted form. Introduced by this change: creds.ts is a new file in 86b4c2c..1e18112 (new file mode in diff) and the spec's switch from process.env to envOrDotenv is in the same range. Severity minor: test-support code only, requires absent env var plus quoted .env syntax, fails loudly (no false pass, no security/data impact).

### O4 · app/ui/tests/support/launch.ts:33

- **severity**: minor
- **verdict**: CONFIRMED
- **finder**: opus:跨文件深度
- **summary**: R9 stopped deleting the credential keys from the worker's process.env. launchShell, which this change did not touch, still spreads `...process.env` into the Electron app under test, so every E2E Electron instance now gets the real LITELLM_MASTER_KEY, ANTHROPIC_API_KEY and the other stripped keys in its environment.
- **触发条件**: Run any E2E spec through launchProduct (for example settings.spec.ts) from a shell that exports LITELLM_MASTER_KEY or ANTHROPIC_API_KEY. Before the change, launchSdkRuntime ran first and deleted the keys, so launchShell's Electron env had none of them. After the change, sdkChildEnv strips the keys only from the SDK child, and launchShell passes the untouched process.env to _electron.launch.
- **失败表现**: Real credentials now reach the Electron main process and its Chromium child processes in every UI test. Before, they were kept out of everything except the explicit real-model journey. This widens credential exposure against CLAUDE.md §4 (credentials do not enter the model or the container). The fix is to build launchShell's env with the same stripping, for example by reusing SANDBOXED_CREDENTIAL_KEYS.
- **verifier 证据**: 调用链可达：/home/lingxufeng/bot/app/ui/tests/e2e/settings.spec.ts:205 调用 launchProduct；/home/lingxufeng/bot/app/ui/tests/support/ui.ts:53-54 明确先启动 SDK runtime，再启动 Electron shell。此次改动在 /home/lingxufeng/bot/app/ui/tests/support/sdk-runtime.ts:70-85 删除了原来对 worker process.env 的凭证清理，改用 sdkChildEnv；/home/lingxufeng/bot/app/ui/tests/support/sdk-env.ts:17-19 仅删除环境副本中的五个凭证键，保留 worker 原值。因此，当启动测试的环境导出了 LITELLM_MASTER_KEY、ANTHROPIC_API_KEY 等键时，随后 /home/lingxufeng/bot/app/ui/tests/support/launch.ts:29-39 的 _electron.launch 仍会通过 ...process.env 原样把这些凭证传给 Electron 主进程，HOME 和 PBOTS_DATA_DIR 隔离不会过滤它们。这是此次移除全局删除后引入的跨进程凭证暴露回归，虽然 launch.ts 本身未改动。保持 minor：代码足以证明 Electron 主进程收到不需要的真实凭证，但不足以证明凭证被发送给模型、进入容器或实际外泄；候选关于这些后果的表述不应作为已证实事实。应在 launchShell 构造环境时复用凭证键清单过滤副本，同时保留 worker 环境供真模型旅程使用。

## 超出预算未验证

无（unverifiedOverBudget 为空）。

## 已被否定

- app/ui/renderer/plugins/settings/NewBotDialog.tsx:37 — O2 失效 token 修复不完整：同一 useEffect 里的第三条异步 loadBundles()（pluginManager/listBundles）未被 stale 保护，其迟到响应仍可在关闭/重开后覆盖新一轮的 bundles 状态——正是本次 diff 声称修复的竞态类别，在同一 effect 内漏掉的一处。（finder: glm:安全）

## 统计

| 项 | 值 |
|---|---|
| finders | 6 |
| candidates | 6 |
| verified | 5 |
| refuted | 1 |
| dupes | 1 |
| overBudget | 0 |
