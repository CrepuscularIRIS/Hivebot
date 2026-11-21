# T50a：没 key 也能启动——拒启改为「请求时 MISSING_CREDENTIAL → 引导去 Settings → Models 填 key」

> 开单：manager (Opus 5.5) | 日期：2026-11-11 | 施工：main (GLM 5.3)
> 来源：`work/settings-connectors/PLAN.md` S3 / queue「设置（API key）」节 S3 行；前置 T49 / T49a / T50 / T62 均已合并
> 分支 / 作业目录：feat/T50a @ /tmp/bot-wt/T50a（从当前集成分支开）
> claimed：f13e5d08（段1 @8ea76705 拒启改 WARN+§0 探针；段2 @f13e5d08 引导链全通——七步 e2e 1p、launcher 9p、session 单测 20p、SDK unit 668p、回归 2p。存疑项 2 文件待经理追认，见回执）
> accepted：2026-11-11 f13e5d08（验收人 manager 任务 B：session 单测 21p、start.test 58p、t50a-no-key e2e 1p 重跑一致；13 文件追认 turn-fold / production model / recovered model 三透传层；Sol MINOR 1 属实不阻塞，转 open/T50ab；见 receipts/T50a.acceptance.md）
> **行为变更单**：launcher.spec ③a「无 key 拒启」语义被本单反转，spec 跟着改是授权的，不算删弱测试。

## 目标
首次装好、还没填 key 的用户能打开 Hivebot；发第一条消息时看到一条明确提示和一个按钮，点进 Settings → Models 填 key，Apply 后**不重启**重发即可得到回复。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md、`work/settings-connectors/PLAN.md` §1b（DSH key 语义：存储优先于 env、下一次请求生效）
2. 拒启点（两处，都要去掉）：
   - `app/launcher/hivebot:152` `[ -n "${P2SDK_LLM_API_KEY:-}" ] || die "real 模式缺 …"`
   - `app/sdk/src/start.ts:121-123` `validateStart` 的 apiKey 分支（文件头 :10 注释「required for the real provider」同改）
3. 上游语义：`repos/deepseek-harness/packages/llm/llm-pi-ai/src/index.ts:220-232`（`apiKeyEnv` 引用解析不到 → `LlmError('MISSING_CREDENTIAL')`）；**注意 `adapter.ts:338-346`：缺 key 时 `listModels` 返回 `[]`**——这可能让失败提前到选模型 / 建会话，而不是在请求时（见第 0 步）。
4. 错误呈现：`app/ui/renderer/session/reduce.ts:136-149` `endNotice`（SSH 断连已有同类「按串识别 → 专用文案」先例，测试 `tests/unit/session/end-notice-ssh.test.ts`）；notice 经 `renderer-grok/shim/src/entries.ts:139` 变 grok entry，由 `overrides/modules/notice-view.tsx` 渲染；`shim/src/workers.ts:60` 依赖「回复失败：」前缀取 worker 失败文本。
5. 打开设置到指定区：`renderer-grok/frontend/src/production/ProductionRenderer.tsx:881` `settingsSection` state、`:3334` 命令面板 `setSettingsSection(section.id); setOverlay("settings")`；Models 区 id `'models'`（`overrides/modules/settings-view.tsx:12`）。改 ProductionRenderer 有 T59 先例（23cd8f58）。
6. 本地 LLM 桩可抄：`app/sdk/tests/e2e/security.test.ts:429-445`（OpenAI SSE `/chat/completions`）。

## 第 0 步（探针，先做，结果写回执 §0，**不成立就停**）
无 key、`P2SDK_PROVIDER` 不设、base URL 指本地桩，两处拒启临时注掉，起 SDK + UI 发一条消息，抓：
- 失败落在哪一层：turn 结束帧（`endNotice` 的 reason）还是更早（建会话 / 选模型报 `UNKNOWN_MODEL`、模型列表空、composer 禁用）？
- 帧里稳定可匹配的东西：`code === 'MISSING_CREDENTIAL'` 在 reason 的哪个字段（贴脱敏后的原样 JSON）。
- 桩是否收到请求（应为 0：缺 key 不该发网络请求）。

**若失败不在 turn 结束帧、或帧里没有 `MISSING_CREDENTIAL`**：停工，回执写清现象，交经理任务 C 重排（不要自己发明别的触发方式）。

## 做法（第 0 步成立后）
1. launcher：删 `:152` 的 die；改为 stderr 打**一行** `WARN hivebot: no API key yet — add one in Settings → Models`（不含任何 key 值）。env 文件读取、属主 / 权限检查（③b）原样保留。
2. sdk：`validateStart` 删 apiKey 分支；`main` 里同样打一行 WARN（launcher 直起 SDK 的路径也能看到）。其余校验不动。
3. renderer：`endNotice` 识别 `MISSING_CREDENTIAL`（按第 0 步确认的字段取 code，不靠 message 文本）→ `{ kind:'notice', tone:'danger', text: NO_KEY_NOTICE, action: 'open-models' }`，文案定为：
   `还没有填 API key。去 Settings → Models 填好后重发这条消息。`
   （以「回复失败：」以外的文本出现，同步确认 `workers.ts:60` 取 worker 失败文本时这条仍能被取到——worker 缺 key 时主 bot 回报卡上要能看到这句。）
4. notice 渲染：带 `action:'open-models'` 的 notice 末尾出一个 `SandButton size="sm" variant="secondary" shape="pill"`，文案 `Open Settings → Models`，`data-action="open-models"`。
5. 打开通道：ProductionRenderer 加最小入口（如 `window` 上的 `pbots:open-settings` CustomEvent 带 `{section}`，或挂到现有 shim 接口——选改动最少的一种，回执写明），效果 = `setSettingsSection('models'); setManageSharedRoomId(null); setOverlay('settings')`。
6. 不做：自动重发、key 校验、启动期弹窗、onboarding 加 key 步骤（都不在本单）。

## 边界
1. 只动：`app/launcher/hivebot`（:150-153 一段）、`app/sdk/src/start.ts`（validateStart + main 的 WARN + 头注释）、`app/ui/renderer/session/reduce.ts`、`app/ui/renderer-grok/shim/src/entries.ts`（透传 action）、`overrides/modules/notice-view.tsx`、`ProductionRenderer.tsx`（打开通道几行）、测试：`sdk/tests/unit/start.test.ts`、`ui/tests/unit/session/`（新文件）、`ui/tests/e2e/launcher.spec.ts`（只改 ③a）、新 `ui/tests/e2e/t50a-no-key.spec.ts`。超出就停，写进回执存疑项。
2. 先写失败测试看红（三处）：
   - `start.test.ts` 「real provider without key」改为期望 `validateStart` 返回 `null` → 红
   - `launcher.spec.ts` ③a 改为「无 key 可启动」（见验收 2）→ 红
   - 新单测 `tests/unit/session/end-notice-no-key.test.ts`：给第 0 步抓到的真帧（脱敏后入 fixture）→ 期望 NO_KEY_NOTICE + action；给一个普通错误帧 → 仍是「回复失败：…」无 action → 红
3. 测试隔离 HOME / TMPDIR、DBus 指不存在路径；不跑全量 e2e。
4. 桩 key 用明显假串（如 `sk-t50a-fake-000`），不碰真实凭证、不读 `~/.grokbot`。

## 验收（写命令，不写感觉）
（UI 相关先 `cd /tmp/bot-wt/T50a/app/ui && pnpm build`）
1. `cd /tmp/bot-wt/T50a/app/sdk && pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/start.test.ts` → 全 passed（含反转后的 key 格；mock / 相对路径 / ssh 半配置格原样通过）
2. `cd /tmp/bot-wt/T50a/app/ui && CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/launcher.spec.ts` → **9 passed**（基线 T62 = 9 passed）。其中 ③a 新语义：无 key、无 env 文件、非 mock → 20s 内**不退出**、SDK ready、electron 进程在、`ui.log` 生成、stderr 恰好一行含 `Settings → Models` 的 WARN、stderr / 日志不含 `sk-` 串；收尾 `l.stop()` 后无残留。③b（权限过宽仍拒启）、⑧（「无缺 key 报错」断言）原样过。
3. `pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/session/` → 全 passed（新 no-key 格 + 既有 ssh 格）
4. `CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/t50a-no-key.spec.ts` → 1 passed，**一条完整引导链**，每步断言：
   1. 起本地 SSE 桩（记录收到的请求与 `Authorization` 头）；SDK real 模式、无 key、base URL = 桩
   2. 发 prompt `hello` → transcript 出现 NO_KEY_NOTICE 原文 + `[data-action="open-models"]` 按钮；**桩收到 0 个请求**
   3. 点按钮 → `.sand-settings-dialog` 可见且 `[data-settings-panel="models"]` 可见（直接落在 Models 区，不是 General）
   4. 在 litellm 行填假 key → Apply → 圆点绿（复用 t50-models.spec 的定位方式）→ 关设置
   5. **不重启**，再发 `hello again` → 桩收到 1 个请求且 `Authorization: Bearer sk-t50a-fake-000`；transcript 出现桩回复文本；这一轮没有 NO_KEY_NOTICE
   6. 全程 console / 页面文本不含假 key 串（console 监听在填 key 之前注册，T50c 教训）
   7. 截图 `work/settings-connectors/evidence/T50a/no-key-notice.{light,dark}.png`（notice + 按钮）
5. 回归：`… run-e2e.sh tests/e2e/t50-models.spec.ts tests/e2e/launcher-serve.spec.ts` → 2 passed；`cd app/sdk && pnpm --config.verify-deps-before-run=false exec vitest run tests/unit` → 与改前同数 passed（贴改前改后数字行）
6. 覆盖：`endNotice` 新分支 + notice action 渲染 + 打开通道，改动行覆盖 ≥80%（vitest `--coverage` 对 reduce.ts 一份数字；渲染与通道由验收 4 的 e2e 覆盖，回执逐行指认）
7. `git diff --stat <起点>..HEAD` 只含边界 1 的文件
8. 所有 playwright 命令看 `grep -E "passed|failed"` 数字行 + `echo EXIT=$?`（`| tail` 会吃退出码，T62 教训）

## 为什么这样验收
- 真正要保住的是「新用户不被挡在门外，而且一眼知道下一步」。只删 die 而不给引导，用户会看到一大段 `llm-pi-ai: no credential for provider route…` 英文报错——过了「能启动」的检查却没达到目的，所以验收 4 要求整条链：提示 → 一键直达 Models → 填 key → 不重启重发成功。
- 「桩收到 0 个请求 / 之后收到 1 个且带正确 Bearer」两条把「key 是在请求时取的、存储优先于 env」这件事钉死，防止 UI 显示对了但后端仍走旧 env 快照。
- 按 code 识别不按文案：上游 message 文本会变，code 是稳定契约（README:119）。
- ③b / ⑧ 原样过，保证放开缺 key 没顺手放开权限检查。

## 产出
- 上述代码改动；`receipts/T50a.receipt.md`（§0 探针原样帧）；`work/settings-connectors/evidence/T50a/` 截图
