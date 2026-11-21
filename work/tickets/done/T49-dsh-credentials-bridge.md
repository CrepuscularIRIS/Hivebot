# T49：模型 key 走 DSH 自己的配置口——M1 放行 credentials / settings（限 llm-pi-ai）

> 开单：manager (Opus 5.5) | 日期：2026-11-11 | 施工：main (GLM 5.3)
> 来源：work/settings-connectors/BRIEF.md；Q-047 答复「这个直接抄DSH的配置」；PLAN.md 行 S1
> 分支 / 作业目录：feat/T49 @ /tmp/bot-wt/T49
> claimed：2026-11-11 @ 9fbb02c7（m1 段完工：81 单测+变异两红+探针 P1-P5；真环境 e2e 等 T49a；待单独 reviewer）
> accepted：2026-11-11 feat/T49 @ 9d13a770（manager 任务 B：连同 T49b；tests/unit/m1 84p 亲跑；Sol M1 已修，增量 diff 2 文件经理逐行读过）
> **安全单**：动 D9 永久拒绝层 → 施工完**单独派 reviewer**，不攒批。

## 目标
界面能经 main 用 DSH 原生的 `credentials.describe / set / unset` 存模型 key（只写不读）、用 `settings.describe / mutate` 改 `llm-pi-ai` 一个命名空间（2026-11-11 经理改单：update→mutate，见「改单记录」）；其余凭证 / 设置写法照旧永拒。本单只做 main 侧的桥和守卫，不做界面（界面是 T50）。

## DSH 的做法（经理探明，本单照抄语义）
- 我们的运行时已经挂着这些：dsh web profile 的 base 段自带 `settings`（dsh-settings）、`credentials`（dsh-credentials-local，文件 `$DSH_HOME/.credentials.yaml`，仅本人可读）、`settings-controller`（dsh-api-settings-controller，生成 `remote.settings` / `remote.credentials` 两个命名空间）。锚点：`app/sdk/node_modules/.pnpm/@deepseek-ai+dsh@0.2.2-rc.1_*/node_modules/@deepseek-ai/dsh-base/cordis.patch.yml:109-135`、web-app `cordis.patch.yml:146-147`。
- 契约：`repos/deepseek-harness/packages/api/settings-controller/README.md`（describe 一次 ≤64 个引用名；`set` 空值 → bad-request；**没有任何方法回传密钥值**；拒绝码 `credential-rejected` / `settings-conflict` / `settings-rejected`）；`docs/subsystems/credentials.md:35,140-178,231-259`（存储文件优先于启动环境变量；`describe` 只回「是否已配、来自哪层、能否写」）。
- llm-pi-ai 的 `apiKeyEnv` 就是凭证引用名，**每次请求现解析**（`packages/llm/llm-pi-ai/README.md:38`）。我们的默认路由 `litellm` 引用 `P2SDK_LLM_API_KEY`（`app/sdk/profile/patches/p2sdk.yml:26-35`），所以对它 `credentials.set('P2SDK_LLM_API_KEY', v)` 就会盖过启动时的环境变量，下一次请求生效、不用重启。
- DSH 自己的 Models 页（`packages/client/ui-settings-models/README.md`「API keys」节）就是这么写 key 的：输入框只写、永不回读，状态只看 redacted `describe`。

## 第 0 步：可行性探针（先做，写进回执；任一不成立就停，回执写清，派经理任务 C）
在隔离 HOME 下起真运行时（`launchSdkRuntime`，provider=real、base URL 指向本地假 OpenAI 兼容端点即可，不打真 LLM）：
- P1 `credentials/describe ['P2SDK_LLM_API_KEY']`：只用环境变量时回什么（层 = 环境？）。
- P2 `credentials/set('P2SDK_LLM_API_KEY','probe-new')` 后，下一次 `session/prompt` 打到假端点的 `Authorization` 头是新值（证明存储层盖过环境、不用重启）；`$DSH_HOME/.credentials.yaml` 权限 600。
- P3 重启运行时后 P2 的值仍生效（存储不被我们每次启动重写的 `runtime-patch.yml` 冲掉）。
- P4 `settings/describe` 里 `llm-pi-ai` 命名空间长什么样；`settings/update` 加一条路由后 `session/modelCatalog` 是否多出模型、重启后是否还在、与 p2sdk.yml 写死的 `litellm` 路由是合并还是覆盖（照实记，不臆测）。
- P5 沙箱内 bash `cat $DSH_HOME/.credentials.yaml` 失败（DSH_HOME = `$HB_DIR/dsh`，在 `P2SDK_SANDBOX_MASK` 里，`app/launcher/hivebot:75-76`）。**这条不成立就是凭证进模型，直接停。**

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. `app/ui/main/m1-api/index.ts`（`M1_ALLOW`、`d9DeniedReason`）、`app/ui/tests/unit/m1/api.test.ts`
3. `work/p4-ui/BRIEF.md:52`（D9 原文）、QUESTIONS Q-047 答复与落实行

## 边界
1. 只动：`app/ui/main/m1-api/index.ts`、`app/ui/tests/unit/m1/api.test.ts`（加格，**不删不弱化既有 D9 格**），探针写在 `work/settings-connectors/evidence/T49/`。不碰 renderer、sdk、launcher。
2. 放行范围（白名单加 5 行，再加参数守卫；守卫写在 main，不信 renderer）：
   - `credentials/describe`：引用名数组 ≤64，每个名须匹配 `^[A-Z][A-Z0-9_]*$`。
   - `credentials/set`、`credentials/unset`：引用名须是**当前 `llm-pi-ai` 设置（user 层，main 现读 `settings/describe`）里出现过的 `apiKeyEnv`**，或形如 `<ROUTE>_API_KEY`（DSH Models 页给新路由派生的名字，见 ui-settings-models README）；其它名（如 `GITHUB_TOKEN`、`DSH_*`、`llm-pi-ai/<id>` 记录键）一律 `pbots/forbidden`。
   - `settings/describe`：放行（上游已 redactSecrets）。
   - `settings/mutate`：只许 `ns:'llm-pi-ai'`；每条 op 的 `op` 只许 DSH Models 页实际用到的几种（施工按 `dsh-client-ui-settings-models/lib/client.js` 实际调用列出，写进回执；最少 `set`），`path` 须是 `['providers', <route>]`，route 匹配 `^[a-z0-9][a-z0-9_-]{0,63}$`；`value` 是纯 JSON 对象（无函数、无 `!!js`），且 **`apiKeyEnv` 必须等于 `<ROUTE 大写，- 换 _>_API_KEY`，或 route 为 `litellm` 时为 `P2SDK_LLM_API_KEY`**——否则 `pbots/forbidden`。
     *为什么*：mutate 能写 `baseURL` + `apiKeyEnv`；不锁 apiKeyEnv，界面就能把宿主任意环境变量（`GITHUB_TOKEN`、`ANTHROPIC_AUTH_TOKEN`…，credentials 层 source:env 可解析）当 key 发到任意 baseURL——凭证外泄。这是本单最重要的一格。
   - `settings/update`、`settings/replace`、`settings/openSettingsDocument` 不放（update 在本仓 llm-pi-ai 上实测不可用，见探针回执①）。
   - 所有 `credentials/*` 的**返回值**经 main 时再过一遍：出现任何非 `CredentialInfo` 字段就丢弃（防上游加宽）。
   - main 日志 / 错误信息里不出现 `set` 的 value（单测断言）。
3. `d9DeniedReason` 的 `^credentials` 整拒改为「除上面三法外仍拒」，`^account`、`/permission`、configForms 不动。文件头注释写明放宽依据：Q-047 用户原话 + 日期。
4. 先写失败测试：`tests/unit/m1/api.test.ts` 新格 ①–⑧（下），看红再实现。
5. 测试走隔离 HOME / TMPDIR，DBus 指向不存在路径。

## 单测格
① `credentials/set` 合法引用 → 透传 dsh，返回不含 value；② 非法引用名 / 非 llm 引用 → forbidden，dsh 计数 0；③ `credentials/describe` 65 个名 → invalid-args；④ 上游回包多出 `value` 字段 → main 丢掉；⑤ `settings/mutate` 非 `llm-pi-ai` ns / path 不在 `providers.<route>` / op 不在白名单 → forbidden；⑤b mutate 的 `apiKeyEnv` 为 `GITHUB_TOKEN` 或别的 route 的名 → forbidden，dsh 计数 0；⑥ `settings/update|replace|openSettingsDocument` → forbidden；⑦ 既有 D9 全集（account、/permission、configForms、allowed-always…）照旧拒；⑧ 失败路径的错误信息与 main 日志不含传入的 key 原文。

## 验收（写命令，不写感觉）
1. `cd /home/lingxufeng/bot/app/ui && pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/m1/api.test.ts` → 全绿，新格 ①–⑧ 在列。
2. 变异：把引用名守卫改成恒放行 → ② 红；把回包过滤去掉 → ④ 红（回执贴两次红尾）。
3. 第 0 步探针：`work/settings-connectors/evidence/T49/` 下探针可重跑，P1–P5 结果逐条贴原样输出；P5 必须是「读不到」。
4. 改动行覆盖 ≥80%：`pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/m1/api.test.ts --coverage --coverage.include=main/m1-api/index.ts`。
5. `git diff --stat <claimed>..HEAD` 只含边界 1 列出的路径。

## 为什么这样验收
用户要「抄 DSH 的配置」，DSH 的配置口就是 settings-controller 这两个命名空间，后端早挂着，缺的只是 main 的白名单——所以本单是「开一道窄门」，不是造新东西。要保住的是 D9 的本意：**密钥只进不出、bot 拿不到、界面不能借这道门改权限类设置**。所以验收重在反例（②④⑤⑥⑦⑧）和 P5 沙箱读不到，而不是「能存进去」。第 0 步的 P3/P4 决定 T50 界面能做到哪一步（只填 key，还是能加路由），必须先实测。

## 产出
- `app/ui/main/m1-api/index.ts`、`app/ui/tests/unit/m1/api.test.ts`
- `work/settings-connectors/evidence/T49/`（探针 + 输出）、`work/tickets/receipts/T49.receipt.md`

## 改单记录（2026-11-11 manager，依据 `receipts/T49-probe.receipt.md`）
- 写口 `settings/update` → `settings/mutate`：探针实测 update 在 llm-pi-ai 上报 `$.providers.litellm.baseURL expected string but got [object Object]`（p2sdk.yml 的 `!!js` 节点进合并校验是对象；`market.yml` T51 注释同类先例）。经理核实 DSH 锚点：`dsh-client-ui-settings-models@0.2.2-rc.1 lib/client.js:1646`「One `settings.mutate` sets the whole profile at `providers.<route>`; the key travels separately through `credentials/set`」；dsh-base `cordis.patch.yml:128-135` llm-pi-ai「mounted dormant: zero routes until a `llm-pi-ai:` settings section supplies provider profiles」。
- 经理加的守卫：mutate 锁 `apiKeyEnv`（边界 2、单测格 ⑤b），防外泄宿主环境变量。
- 合法引用名改为只读 user 层（p2sdk.yml 的路由段由 T49a 移除）。
- 真环境 e2e 依赖 **T49a**（sdk 侧）；单测格用桩，不受影响，可先施工。安全单照旧单独派 reviewer。
