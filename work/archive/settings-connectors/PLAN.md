# PLAN · settings（API key）+ connected apps

> 立项：manager 任务 A，2026-11-11。需求见 `BRIEF.md`。工单顺序以 `work/tickets/queue.md`「设置（API key）+ Connect apps」节为准。

## 1. 我们这边现在是什么样（纯读探针结论）

### settings / API key
- **key 怎么配**：只在启动前配。`app/launcher/hivebot:129-158` 按顺序取 `P2SDK_LLM_API_KEY` → `LITELLM_MASTER_KEY` → `~/.config/hivebot/env`（属主本人 + 600，白名单 4 键：`P2SDK_LLM_API_KEY / P2SDK_LLM_BASE_URL / P2SDK_LLM_MODEL / P2SDK_MARKET_INDEXES`）。key 只进 SDK 进程，Electron env 剥 5 个凭证键（:115、:225）。
- **后端只认一个 provider、一个模型**：`app/sdk/profile/patches/p2sdk.yml:26-44`（`llm-pi-ai` 的 `litellm`，openai-completions，`apiKeyEnv: P2SDK_LLM_API_KEY`，模型取 `P2SDK_LLM_MODEL`，缺省 `glm-5.3-flash`）；`app/sdk/src/start.ts:63-71,219-221`。
- **本机配了没**：`~/.config/hivebot/env` 不存在 → 用户是靠 shell 环境变量起的。
- **界面能不能触达**：不能。而且有硬约束挡着：P4 D9 永久判据「任何 credentials/account 方法」在 main 一律拒（`work/p4-ui/BRIEF.md:52`），放宽要用户原话 + 单独红线问题 → **Q-047**。
- **P5-52 / P5-31 为什么剥**（读 `settings-view.tsx`、`settings-panels.tsx` 头注 + `work/p5-parity/REPORT-P5-52.md`）：都是「没实底」，不是桩写错——
  - Router：0.18 的 Router 是在 Cursor / Claude Code / Codex / OpenRouter 四个**已登录账号**间选一个，存 `clientPersistence`（`frontend/src/recovered/features/settings/overlay/router.ts`），**没有 key 输入**；与我们 LiteLLM 单 provider 对不上。
  - Updates：`update.*` 桩 not-packaged。
  - Auto-review（dsh 无对应能力）、Security Key（webauthn 桩）、Execution on Local Computer（P5-31：renderer 读不到真实档位，只读展示会说错）。这三组本批**不放回**。
- **原版对照**：0.79.3 设置七区 General / Texting / Computer / Permissions / Vault / Usage / Updates，**没有 Router**（`work/grok-0.79.3-re/RE-FULL-0.79.3.md` §7）。0.78.1 待 REA `RE-SETTINGS-0.78.1.md`。
- **判断**：原版用户不填 key，「apikey 设置」是 Hivebot 用自带 LiteLLM 才有的需要。按我们需要做一张最小卡（Q-047 默认 A：只读状态），不为了像原版硬造 Router 下拉。

### connected apps
- **入口**：侧栏 footer「Connect apps」药丸 = `frontend/src/production/ProductionRenderer.tsx:3454` → `setOverlay("plugins")` → P5-57 整面替换的市场（`overrides/modules/market-surface.tsx` + `market-store.ts`）；文案覆盖在 `overrides/modules/evidence.ts:7`。新建 bot 对话框里另有「Open Connect apps」链接（`overrides/modules/new-bot-dialog.tsx:215,220`）。
- **市场 = 装 dsh 插件包**，不是账号连接：数据走 M1 #12–#16；裸 npm MCP 包由 `app/sdk/src/market/wrapper.mjs` 动态包成 bundle（stdio mcp-client 行）；装好后在新建 bot 时勾选启用（`p2temp/session.createWithConnectors`）。
- **最可能的 bug 形态**：生产恒链 `market.yml`（`app/sdk/src/start.ts:158-161`），目录源只来自 `P2SDK_MARKET_INDEXES`，缺省空 → 市场显示「No catalog configured · Catalogs come from the profile's market.yml and can't be changed in the app」——用户点进去是死路。待 T48 实证（也可能还有层叠 / 关不掉 / 控制台错误）。
- **onboarding**：`overrides/modules/onboarding-steps-0793.tsx:53-63` Gmail / Google Calendar 的 Connect 恒 disabled（title「Connector sign-in isn't wired in this build yet」）。
- **后端能力上限**：dsh-mcp-client 0.2.2-alpha.2 只有 `stdio` 与 `streamable-http`（固定 headers），**无 OAuth**（`lib/index.js:40-46`）。原版 Gmail / 日历 / GitHub 这类走 xAI 云目录 + OAuth，拿不到 → **Q-048**。
- **既有原版规格**：`work/p5-parity/RE-market-detail.md`（R-04，0.78.1）已有列表行 / 详情页 / 自定义 MCP 表单（§4：HTTPS+headers / STDIO，无测试连接钮，保存后 30s 轮询）/ Connect→Connecting…→✓Connected。REA 新产出 `RE-CONNECTORS-0.78.1.md` 补入口全貌与状态存储。

## 1b. 重排输入（2026-11-11 任务 A 续）

- **用户答**：Q-047「这个直接抄DSH的配置」；Q-048 目录「一键参考DSH」、要登录的不做真登录（A）、自定义连接器只开 HTTPS 无 token（A）。
- **REA**：`work/grok-0.79.3-re/RE-SETTINGS-0.78.1.md`（0.78.1 **无 Router / API key 段**，P5-52 剥除是忠实还原；原版「填密钥」只在 MCP 安装表单的 secret 字段）；`RE-CONNECTORS-0.78.1.md`（入口 / OAuth / 状态机 / ConnectorGrant 卡；onboarding ConnectStep 现状与 0.79.3 一致）。
- **T48 证据**（`evidence/T48/`）：① 设置只剩 General、无任何 key UI；② Connect apps = 「No catalog configured · can't be changed in the app」死路；③ 新建对话框「Open Connect apps」跳过去还是那页；④ 引导页 Connect 恒灰。用户踩的是 ②。
- **DSH 怎么配 key**（经理探明）：
  - 后端三件 `dsh-settings` / `dsh-credentials-local` / `dsh-api-settings-controller` 由 dsh web profile 自带，**我们的运行时已经挂着**（`app/sdk/node_modules/.pnpm/@deepseek-ai+dsh@0.2.2-rc.1_*/node_modules/@deepseek-ai/dsh-base/cordis.patch.yml:109-135`，web-app `cordis.patch.yml:146-147`）。
  - `remote.credentials.{describe,set,unset}`：密钥只进不出；存 `$DSH_HOME/.credentials.yaml`（本人可读），**优先于启动环境变量**，llm-pi-ai 每次请求按 `apiKeyEnv` 引用现解析 → 存完下一次请求生效（`repos/deepseek-harness/packages/api/settings-controller/README.md`、`docs/subsystems/credentials.md`、`packages/llm/llm-pi-ai/README.md:38`）。
  - 界面 = `packages/client/ui-settings-models`（Models 页：provider 行 + 圆点状态 + 只写 key 框 + 模型列表 + 自定义路由，5.5k 行）。我们只搬 key 部分（T50），其余按需（T50b）。
  - 我们默认路由 `litellm` 的引用名就是 `P2SDK_LLM_API_KEY` → 对它 `credentials.set` 即可替代 env 文件。`$DSH_HOME` = `$HB_DIR/dsh`，在沙箱遮蔽表里（`app/launcher/hivebot:75-76`）——T49 P5 实测 bash 读不到。
- **DSH 怎么管目录**：`pluginMarket` 不预置源；用户在 Discover 的「Index sources」对话框加 / 删，`setIndexes` 经 `settings.update` 落盘、广播 `plugin-market/changed`（`packages/boot/plugin-market/README.md:27-53`、`packages/client/ui-plugin-market/README.md:27-29`）。DSH 没有官方目录地址 → 「一键」没有现成对象，Q-049。
- **D9**：以 Q-047 原话为据放宽到「DSH 同款：密钥只写不读 + 只许改 `llm-pi-ai` 设置段」，落实行写在 QUESTIONS Q-047；`account`、`/permission`、configForms、其它凭证引用照旧永拒。

## 2. 方案（重排后）
1. 现存 bug 先修：T51 把空目录死路换成 DSH 式「Index sources」（不预置源）。
2. key 按 DSH：T49 main 开窄门（安全单）→ T50 设置加 Hivebot 自有「Models」区（只搬 key 字段）‖ T50a 没 key 也能启动 → T50b 加 provider / 编辑模型（按需）。
3. 连接器：T52 自定义连接器只开 HTTPS 无 token，走现成 wrapper。
4. 不做：真 OAuth、ConnectorGrant 卡（无真连接器）、onboarding 连接步改动（现状即 A 档口径）、Router 下拉（原版无）、七区导航 / Updates / Auto-review（REA 建议，本需求外，记 queue 提议）。

## 3. 任务索引

| 行 | 工单 | 类别 | 依赖 | 状态 |
|---|---|---|---|---|
| S0 | T48 现状探针（四格） | 现存 bug 排查 | — | 施工完，T48b 复验在验收线 |
| C1 | T51 / T51b / T51c 空目录死路 → DSH 式 Index sources | 现存 bug | — | done 2026-11-11 @ feat/T51 721e38f3，待合并 |
| S1 | T49 M1 放行 DSH credentials / settings（限 llm-pi-ai） | 我们自有需要（照 DSH） | T51 后（同改 m1-api） | done（T49+T49b @ 9d13a770、T49a+T49ab+T49ac @ 84c43dc0，已合并） |
| S2 | T50 设置「Models」区（key 只写 + 状态圆点） | 我们自有需要（照 DSH） | T49、REA 布局规格（`work/ui-polish-win/`） | done（2026-11-11 经理复验 @ 58e13df4，含 T50c；已合并 40142999，回测 5p 全绿） |
| S3 | T50a 没 key 也能启动 | 我们自有需要 | T49 P2/P3 | 验收通过待合并（2026-11-11 @ f13e5d08；修复单 T50ab 测试清理） |
| S4 | T50b 加 provider / 编辑模型列表 | 我们自有需要（照 DSH） | T49 P4、T50 | 计划（按需） |
| C2 | T52 自定义连接器（HTTPS、无 token） | 复刻缺失 | T51、REA | 计划 |
| — | T53 onboarding 连接步 | — | — | 不做（现状即答复口径） |

## 4. 待用户拍板
- Q-047 / Q-048：已答（2026-11-11）。
- Q-049：要不要给「一键加上」的预置目录源。默认 A 不预置（与 DSH 一致），不阻塞。

## 5. 旁证（不在本需求范围）
- bot 标题吃了隐藏提示标签「<bot_introduction_request>…」（`work/t46b-final-goodhost.png`），已记 queue「提议」。
