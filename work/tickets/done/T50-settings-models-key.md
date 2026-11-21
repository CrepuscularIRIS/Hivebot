# T50：设置新增「Models」区——每条路由一行 + 状态圆点 + 只写 API key（复制改造 DSH Models 页的 key 部分）

> 开单：manager (Opus 5.5) | 日期：2026-11-11 | 施工：main (GLM 5.3)
> 来源：work/settings-connectors/BRIEF.md（Q-047「这个直接抄DSH的配置」）；PLAN 行 S2；queue 行 S2
> 分支 / 作业目录：feat/T50 @ /tmp/bot-wt/T50
> claimed：ef904037（a4614ef5 施工 + Sol MAJOR 修复，feat/T50 @ /tmp/bot-wt/T50，2026-11-11 待经理验收）
> accepted：2026-11-11 feat/T50 @ 58e13df4（manager 复验：首验 @ ef904037 未过 → T50c 修 spec console 盲区；复验重跑 t50-models.spec 1 passed (6.8s) EXIT=0，产品代码与截图沿用首验结论）
> **界面收 key → 施工完单独派 reviewer，不攒批。**

## 目标
用户在 Settings 里看见每条模型路由是否已有 key，并能填 / 换 / 清 key，下一次请求即生效；key 填进去后界面任何地方都再也拿不到它。

## 后端已就绪（不用改）
- main 窄门（T49 已合并）：`credentials/describe|set|unset`、`settings/describe`、`settings/mutate`（限 llm-pi-ai）。renderer 走 `overrides/modules/pbots-ui` 的 `api()`（`market-store.ts:9` 同款）。
- 路由来源（T49a 已验）：`settings/describe` → `namespaces[ns='llm-pi-ai'].user.providers`（真实模式首启已种 `litellm`，`apiKeyEnv: P2SDK_LLM_API_KEY`）；key 状态：`credentials/describe {refs:[…]}` → `{configured, source: env|file, writable}`。wire 形态见 `receipts/T49-probe.receipt.md`「wire 形态备忘」。

## 原版 / 搬运
- 0.78.1 没有这一区（`RE-SETTINGS-0.78.1.md`），这是 Hivebot 自有需要，交互照 **DSH `dsh-client-ui-settings-models`**（`app/sdk/node_modules/.pnpm/@deepseek-ai+dsh-client-ui-settings-models@*/…/lib/client.js`：`ProviderEditor` :1984 起、key 字段 `autoComplete:"new-password"` :173 附近）——**搬阶梯第 3 级（复制改造）**：只搬 key 字段与状态语义，文件头写 `来源: <pkg>@0.2.2-rc.1:lib/client.js:<行>`。不搬加路由 / 编辑模型（那是 T50b）。
- 外观照 0.78.1 设置体系：分组标题、设置行、按钮、输入框都用现有设置面的组件 / 类（`RE-UI-LAYOUT-0.78.1.md` §1.3–1.6、§2、§3），**不自写行样式**（T57 会统一校正行样式，本单复用同一组件即可自动跟上）。

## 第 0 步（写进回执）
1. 设置壳能否加一个导航项：`overrides/modules/settings-view.tsx`（只留 General）+ 上游 `view.tsx:20-25` 的 section 注册表，确认面板按 section id 渲染的入口在哪、能否只在 overrides 层挂一个 `models` 面板。**能 → 导航加「Models」（General 之后）**；不能（要改 recovered 源码）→ 退为 General 里一个「Models」分组，回执写明原因。
2. mock 模式（e2e 默认）不种路由 → 面板应显示空态。e2e 要有路由：测试前置用 `settings/mutate` 写一条路由（T49 守卫允许，apiKeyEnv 须为派生名），或按 T49a e2e 的做法起真实模式指向桩 endpoint——二选一写回执。

## 界面行为
- 每条路由一行：label = route 名（`litellm` 显示为 `LiteLLM`，其余原样）；description = baseURL 与模型 id（只读文本）。
- 状态圆点：`configured` 绿 / 未配红；`source: env` 时 description 末尾加「from environment」（用户知道这是启动环境给的，填新 key 会覆盖它）。
- key 输入：`type=password`、`autocomplete=new-password`、Show/Hide 切换；Apply（按钮，空值时 disabled）→ `credentials/set` → **成功后清空输入框**、重读 describe 刷新圆点；失败给行内错误（不含输入值）。
- Clear key（仅 `source: file` 时可用）→ `credentials/unset`。
- 任何时候不把 key 写进 state 以外的地方：不进 localStorage、不进 URL、不进 console、不进错误文本。

## 边界
1. 只动：`app/ui/renderer-grok/overrides/modules/` 下新增的 models 面板文件与 `settings-view.tsx`（或 `settings-panels.tsx`，视第 0 步）、对应 css、`app/ui/tests/e2e/t50-models.spec.ts`、必要的单测。不碰 `main/`、`sdk/`、recovered 源码。
2. 先写失败测试（e2e 新 spec），看红再实现。
3. 测试走隔离 HOME / TMPDIR，DBus 指向不存在路径；e2e 先 `pnpm build`。

## 验收（写命令，不写感觉）
1. `cd /tmp/bot-wt/T50/app/ui && pnpm build && PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/t50-models.spec.ts` → 全过，断言：
   - ① 打开 Settings → Models：每条路由一行，未配 key 的圆点为红；
   - ② 输入 `t50-secret-<随机>` → Apply → 输入框值为空、圆点变绿、`credentials/describe` 该 ref `source:'file'`；
   - ③ **泄漏反证**：Apply 后 `document.documentElement.outerHTML`、`localStorage` 全量、console 消息里都不含该随机串；reload 后同样不含，圆点仍绿；
   - ④ Clear key → 圆点回红（或回 env 状态）；
   - ⑤ mock 无路由 → 空态文案可见，无报错；
   - ⑥ 亮暗两张截图写到 `work/settings-connectors/evidence/T50/`。
2. 回归：`run-e2e.sh tests/e2e/theme-dual.spec.ts tests/e2e/market.spec.ts` 不新增红（低负载跑，回执贴 `passed/failed` 数字行，不要 `| tail` 吃退出码）。
3. 截图经理 Read 亲看：行样式与 General 区同一体系，暗色按钮可读。
4. `git diff --stat <claimed>..HEAD` 只含边界 1。

## 为什么这样验收
用户要的是「在界面里配 key」，但这道门开了以后最怕的是 key 回流到界面（DOM、存储、日志）——③ 是本单的核心，必须在 reload 前后都查。① ② ④ 证明能用；⑤ 防 mock / 新装无路由时白屏。

## 产出
- models 面板（复制改造，带来源头注释）、settings-view 挂载、css、e2e spec、截图、`receipts/T50.receipt.md`

## 经理验收（任务 B，2026-11-11 @ ef904037）——返修
- 验收 1 重跑：`1 passed (6.6s)`，exit 0。
- 验收 3 截图（亮 / 暗）：Models 行与 General 用同一套 `sand-settings-row`，绿点在位；暗色下 Clear key 可读，Apply 空值禁用时变淡属于正常——**通过**。
- 验收 4 范围：4 文件（settings-models.tsx/.css、settings-view.tsx、t50-models.spec.ts），在边界 1 内——**通过**。
- 产品代码：key 只存在于受控 input 的 state 里，没有 console / storage 写入，错误文本取的是上游 message——无问题。
- **Sol MAJOR 核实**：成立。**修复不完整**。监听注册已提前（:38），must-catch 探针也确实有效：监听器如果没触发，:74 会失败。但 :75 `consoleTexts.length = 0` 把 Apply 期间（:60–:63）收到的消息一起清掉了，`leak('apply 后')` 看不到提交期的输出，盲区还在。→ T50c（只改 spec，需用注入验证它会变红）。
- Sol 的 A–E 维度没有发现问题：我抽查了产品组件，同意。
- T50c 过后由经理复验，复验只看 spec 修复与注入证据，即可挪到 done / 合并。
