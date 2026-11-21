# T49a：默认 litellm 路由搬出 p2sdk.yml，改为启动时经 settings/mutate 写入 user 层（DSH 同构）

> 开单：manager (Opus 5.5) | 日期：2026-11-11 | 施工：main (GLM 5.3)
> 来源：`receipts/T49-probe.receipt.md` ②（探针 P4b–P4d 已在实验态跑通该形态）；T49 改单记录；queue 行 S1a
> 分支 / 作业目录：feat/T49a @ /tmp/bot-wt/T49a
> claimed：2026-11-11 @ ef030630（单测 52p+sdk 662p+e2e 三断言+onboarding exit0；launcher 回归在跑）
> accepted：2026-11-11 feat/T49a @ 84c43dc0（manager 任务 B 终验 T49a 线：start.test 58p、t49a e2e 1p 亲跑；对集成分支 diff 仅 4 文件；Sol M2/M3/M4 + 增量 CR/MINOR 均闭合）

## 目标
`profile/patches/p2sdk.yml` 不再给 `llm-pi-ai` 配 config（含 `!!js` 的 litellm 路由让一切 settings 写操作被拒）；默认 litellm 路由改由 sdk 启动时经 `settings/mutate` 写进 user 层，成为一条用户在 Models 页可编辑的普通路由——与 DSH「llm-pi-ai 零路由挂载，路由由用户设置文档提供」同构。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. 探针：`work/settings-connectors/evidence/T49/probe.spec.ts`（P4b 的 mutate 调用即本单要落进 start 的那一条）、`probe.txt`
3. `app/sdk/profile/patches/p2sdk.yml:23-44`（llm-pi-ai 段 + agent-default-model）、`app/sdk/src/start.ts`（:66-81 配置、:221-232 子进程 env、:408 writeRuntimePatch）
4. 先例：`app/sdk/profile/patches/market.yml` 头注释（T51：env 只作首启种子，patch 不配 config）
5. DSH 锚：`repos/deepseek-harness/packages/bundle/base/cordis.patch.yml:128-135`

## 边界
1. 只动：`app/sdk/profile/patches/p2sdk.yml`、`app/sdk/src/start.ts`（必要时同目录新增一个小模块）、`app/sdk/tests/unit/start.test.ts` 及新增单测、`app/sdk/tests/e2e/` 下新增一个 spec。不碰 `app/ui/`（m1 桥是 T49）。
2. 语义（照 T51 env 种子口径）：
   - **只在 user 层 `llm-pi-ai.providers.litellm` 不存在时写入**（首启种子）；已存在（用户改过 baseURL / 模型 / 删过再加）一律不覆盖。用户删掉整条路由后重启是否再种，照实测写回执，默认「再种」（无路由 = 无模型可用）。
   - 种子值：`api: openai-completions`、`baseURL` = 现行 `P2SDK_LLM_API_BASE` 解析结果（start.ts:222 那份）、`apiKeyEnv: P2SDK_LLM_API_KEY`、`models: [{id: <P2SDK_LLM_MODEL 解析结果>, contextWindow: 131072}]`——与现 p2sdk.yml 值一致，只是换了落点。
   - mock 模式：不种路由（mock 不需要），`agent-default-model` 改静态值后 mock 由 runtime overlay 覆盖——按探针验证过的形态做，回执贴证据。
   - 写入时机：dsh 就绪后、对外打印 `[p2sdk] ready` 之前；写失败 → 启动失败并报错（不静默起一个无模型的实例），错误信息不含 key。
3. 先写失败测试：单测「user 层无 litellm → 发出一条 mutate，ops 形状 = `[{op:'set', path:['providers','litellm'], value:{…}}]`」「已有 litellm → 不发」「mock → 不发」；e2e 新 spec 起真实 sdk（隔离 HOME），断言 settings 写可用（mutate 第二条路由不被拒）。看红再实现。
4. 测试走隔离 HOME / TMPDIR，DBus 指向不存在路径；pnpm 跑 vitest 带 `--config.verify-deps-before-run=false`。凭证不进代码、文档、日志。

## 验收（写命令，不写感觉）
1. `cd app/sdk && pnpm vitest run --config.verify-deps-before-run=false tests/unit/start.test.ts <新单测>` → 全过，含上面三格。
2. 新 e2e spec → passed，断言：①首启后 `session/modelCatalog` groups 含 `litellm:<model>`；②`settings/mutate` 再加一条路由**不报** `expected string but got [object Object]`；③重启同 HOME 后 litellm 路由仍在且未被重写（先 mutate 改 baseURL，重启后 describe 仍是改后的值）。
3. 回归（低负载时跑）：sdk 全量单测 `pnpm vitest run --config.verify-deps-before-run=false` 不新增红；`app/ui` 下 launcher.spec 与一条真实对话 e2e（主 agent 选现有的、写进回执）不新增红。
4. `grep -n "llm-pi-ai" -A3 app/sdk/profile/patches/p2sdk.yml` → 没有 `config:`。
5. 改动行覆盖 ≥80%：`pnpm vitest run --coverage --config.verify-deps-before-run=false`，贴新代码文件那一行。

## 为什么这样验收
要保住两件事：**settings 写口真能用**（否则 T49/T50 的 Models 页白做——验收 2② 直接复现探针那条错误的反面），以及**现有用户启动后照样能聊天**（验收 2① + 回归 3）。验收 2③ 防「每次启动重种覆盖掉用户改的路由」——这正是 T51 市场踩过的坑。

## 产出
- `app/sdk/profile/patches/p2sdk.yml`（删 llm-pi-ai config、agent-default-model 静态化）
- `app/sdk/src/start.ts`（启动种子路由）
- 单测、e2e spec 各一；回执 `receipts/T49a.receipt.md`
