# T49 第 0 步回执：可行性探针 P1–P5——全通，但**工单两处放行范围需按实测修订**（请经理判定）

> 施工：main (GLM 5.3) | 2026-11-11 | 探针：`work/settings-connectors/evidence/T49/`（probe.spec.ts + probe.txt + p4a-settings-describe.json + p2-events.json）

## 结论先行

| 探针 | 结果 | 原样输出（probe.txt） |
|---|---|---|
| P1 env 层 describe | ✅ | `{"P2SDK_LLM_API_KEY":{"configured":true,"source":"env","writable":true}}` |
| P2 set 盖过 env | ✅ | 下一条请求 auth=**`Bearer probe-new`**（即时生效不重启）；`.credentials.yaml exists=true mode=600`；describe 转 `"source":"file"` |
| P3 重启持久 | ✅ | 同 home 重启后 describe 仍 `source:"file"`（runtime-patch.yml 不冲掉） |
| P4 settings llm-pi-ai | ✅（按修订形态，见下） | mutate 写路由成功；catalog 出现 `litellm:glm-5.3-flash`；重启仍在 |
| P5 沙箱读不到 | ✅ | 沙箱 bash `cat $DSH_HOME/.credentials.yaml` → **`No such file or directory` exit=1**；凭证值绝不进工具结果（1/1 passed） |

**P5 不成立即停的红线没踩——凭证不进模型成立。**

## 实测推翻工单的两处（需改单，证据链如下）

### ① `settings/update` 在 llm-pi-ai 上不可用——必须放行 `settings/mutate`

- 工单预设 `settings/update` 只许 llm-pi-ai——实测 **update 和 mutate 都报同一个错**：
  `settings/rejected: $.providers.litellm.baseURL expected string but got [object Object]`
- 根因不在写法（带引号 `!!js "…"` 同炸）：`profile/patches/p2sdk.yml` 用 `!!js` 定义 litellm 路由，**!!js 节点在 settings 合并校验的原始树里是对象**（describe 的 value 视图才是求值后的字符串）——任何 settings 写操作合并校验都炸。
- 佐证：`market.yml` 注释（T51 先例）早已记载「a config on the insert row makes settings.update refuse every later write ("overridden by a home patch")」——**patch 层给 settings 管的 ns 配 config 本身就是反模式**。
- **正确形态（DSH 官方）**：`dsh-base cordis.patch.yml:125-135` 明文「llm-pi-ai mounted dormant: zero routes until a `llm-pi-ai:` settings section supplies provider profiles…which providers run is the user's settings document」；DSH Models 页新建路由就是 **一条 `settings.mutate` path-op**（`dsh-client-ui-settings-models lib/client.js:1646`「One settings.mutate sets the whole profile at providers.<route>；the key travels separately through credentials/set」）。

### ② 默认 litellm 路由不能留在 p2sdk.yml——需 sdk 侧配套单（建议 T49a）

- 探针验证的干净形态：p2sdk.yml **删 llm-pi-ai config 段**（挂载由 dsh-base 默认提供，零路由）+ agent-default-model 静态化（mock 由 runtime overlay 覆盖）→ **mutate 写 user 层路由全链通**（P4b/P4c/P4d）。
- 路由注入时机：**launcher 启动后（ready 前）经 settings/mutate 写默认 litellm 路由**（探针 P4b 的调用即同款）——用户在 Models 页看到的是一条真实可编辑的已配置路由，与 DSH 同构。
- t49probe 第二路由 mutate 写入成功但 catalog 未激活（`T49PROBE_API_KEY` 未设——「routes register live, keys resolving per request」，缺 key 不激活）——照实记，符合预期。
- **sdk 实验态已复原**（git checkout p2sdk.yml + start.ts 未动）；正式改动待经理开单。

## 对 T49 施工面的影响（请经理判定）

1. m1 白名单照工单加 credentials 三法 + `settings/describe`；但写口从 `settings/update` **改为 `settings/mutate`**（仍限 llm-pi-ai、限 `providers` 路径 ops、update/replace/openSettingsDocument 不放）——参数守卫相应改 shape。
2. credentials 守卫的「合法引用名」集（工单边界 2）：**当前 llm-pi-ai 设置里出现过的 apiKeyEnv + `<ROUTE>_API_KEY` 派生**——干净形态下 user 层就是唯一来源，语义不变。
3. 建议拆 **T49a（sdk 侧）**：p2sdk.yml 去 llm-pi-ai config + agent-default-model 静态化 + writeRuntimePatch/start.ts 启动注入默认路由（mutate）。T49（m1 侧）依赖 T49a 才能在真环境 e2e 验证——单测用桩不受影响，可先行。

## wire 形态备忘（探针踩实，施工直接用）

- `credentials/describe` `{refs:[…]}`、`credentials/set` `{ref, value}`——**顶层无 request 壳**（gateway 报错原文为证）；session/* 才是 `{request:{…}}`。
- `settings/mutate` `{ns, ops:[{op:'set', path:['providers','<route>'], value:{…}}]}`。
- `session/modelCatalog` `{}`；`session/events` `{request:{address:{kind:'session',sessionId}}}`。
- real provider 探针的 base URL 环境变量是 **`P2SDK_LLM_BASE_URL`**（start.ts:70/222 读它并覆写 child 的 API_BASE）——设错名会静默打到默认 LiteLLM:4001。
- 沙箱探针的 tool/result 在 **per-session follow 流**（`client.follow(sessionId)`），不在 $events 流；作答用 `$events/result`（clientId 取 ready 帧）。
