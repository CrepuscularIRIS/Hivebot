# T70：Connect 条目的启动配置拉回条目数据——删 wrapper 里两张取值 Map

> 开单：manager (Opus 5.5) | 日期：2026-11-12 | 施工：main (GLM 5.3)
> 来源：`work/ui-borders-connect/BRIEF.md`「2026-11-12（Connect 启动配置的形态拉直）」两句用户原话；用户方向 = 方案 A（像原版 variableFields：差异在条目数据，不在代码）
> 分支 / 作业目录：feat/T70 @ /tmp/bot-wt/T70（从 main 拉，T69 已在 main @9a22e9b8）
> claimed：2026-11-12 main (GLM 5.3) @ feat/T70=cc02cf68（基于 1da1b7bd）
> accepted：2026-11-12 feat/T70@d912cbbf（manager 验收，见 receipts/T70.acceptance.md）

## 目标
每个能装条目的启动参数 / 环境变量写在**条目数据**里（一个 JSON 文件），wrapper 按 spec 查表透传、不解释；`wrapper.mjs` 里的 `REQUIRED_ARGS` / `PACKAGE_ENV` 两张 Map 和 `launchArgsFor` / `launchEnvFor` 删掉。行为不变（同样的 args/env 落进 cordis.patch.yml）。

## 方案（经理定，不要改形）
1. **新建 `app/sdk/src/market/picks.json`**＝能装条目的唯一数据源（现在 `market-picks.ts` 里的 `V` 表 + `installable` 四行搬进来）。每条形如：
   ```json
   { "name": "@agent-infra/mcp-server-filesystem", "version": "1.2.29",
     "title": "Filesystem", "description": "…", "keywords": ["files","filesystem","edit"],
     "launch": { "args": ["--allowed-directories", "{workspace}"] } }
   ```
   memory 条：`"launch": { "env": { "MEMORY_FILE_PATH": "{workspace}/memory.jsonl" } }`。另两条无 `launch` 字段（＝零参数零 env）。`launch.args` 只能是 string[]，`launch.env` 只能是 string→string。
2. **唯一占位符 `{workspace}`**（最小 DSH 适配残留，经理定）：wrapper 生成时把 args/env 值里的 `{workspace}` 字面替换为 `join(dshHome, 'workspace')`（现行同值，生成时 mkdir 照旧）。不做别的占位符、不做表达式。理由：值依赖每个 runtime 的 `$DSH_HOME`，写死不可能；原版这类值是 variableFields 表单让用户填，我们的值预定、不出表单，一个占位符就是全部差异。
3. **数据只在 sdk 侧读，不走 M1**：wrapper 读 `picks.json`（模块加载时 `readFileSync`+`JSON.parse` 即可），按 `spec === name@version` 查 `launch`；查不到 → `args:[] env:{}`（与现行表外包一致）。**renderer 发给 `pluginManager/installBundle` 的参数不变（仍只有 spec + options）**——不往 options 里塞 launch。
   - 为什么不经 installBundle 传：`InstallBundleOptions` 是 dsh 的 typert 类型（enabled/saveExact/requestId/approvedBuilds/registry，`dsh-plugin-manager/lib/types/types.d.ts:181`），加字段要么被 gateway 拒、要么要在 m1-api 剥；更要紧的是那会让 renderer 和**第三方 index source** 成为启动配置的作者——任意源条目带 `env.NODE_OPTIONS=--require …` 或 `--allowed-directories /` 就是本机代码执行 / 全盘读写。查表模式下 launch 只来自仓内数据。
   - 后果（接受）：远端 index 列了同一精确坐标（如 `@agent-infra/mcp-server-filesystem@1.2.29`）时拿到同一份 launch——launch 是「应用自带的这个包版本怎么起」，属于包不属于源，与现行按包名查 Map 等价。
4. **renderer `market-picks.ts`**：`import` 同一 JSON 生成 installable `Entry[]`（name/title/description/metadata.keywords/versions[{version, install.spec}]），**不把 launch 带进 Entry**。`V` 表删除。登录条目（needsSignIn）不动。
5. 生成 yml 的注入面（经理已核）：patch 文件是 `JSON.stringify` 输出（JSON 是 YAML 子集，字符串一律双引号转义），cordis/dsh lib 无 `${{` 插值（grep 无命中）；替换后的值仍是字符串字面量。施工不需要额外转义，但不许把 launch 值拼进任何非 JSON.stringify 的文本。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md（合并后回测先 install+build；骨架屏假绿机理）
2. `app/sdk/src/market/wrapper.mjs` 全文；`app/ui/renderer-grok/overrides/modules/market-picks.ts`、`market-store.ts:170-195`（install 只发 spec）
3. 现有测试：`app/sdk/tests/unit/market-wrapper.proc.mjs:101-103,155`、`app/sdk/tests/market/wrapper-env.test.ts`、`app/sdk/tests/e2e/market.test.ts:300-325`、`app/ui/tests/unit/market-picks.test.ts`

## 边界
1. 只动：`app/sdk/src/market/wrapper.mjs`、新建 `app/sdk/src/market/picks.json`、`app/ui/renderer-grok/overrides/modules/market-picks.ts`、`app/sdk/tests/unit/market-wrapper.proc.mjs`（删 `launchArgsFor` 那格、换成数据驱动格）、`app/ui/tests/unit/market-picks.test.ts`（版本防漂移改读 JSON + 新格）、新建 `app/sdk/tests/market/wrapper-launch.test.ts`。
   **不动**：`wrapper-env.test.ts`、`tests/e2e/market.test.ts`、`market-store.ts`、`m1-api/`、`market-surface.tsx`——这几处必须原样保持绿，它们就是「行为不变」的证据。
2. 先写失败测试 `app/sdk/tests/market/wrapper-launch.test.ts`，看它红（picks.json 不存在 / launch 未从数据来）：
   - ① 遍历 `picks.json` 每条：`marketWrapperDirFor({spec: name@version, dshHome})` 生成的行 `config.args` ＝ `[入口, ...launch.args 替换后]`，`config.env` ＝ `launch.env 替换后`（无 launch 的条 → 仅入口 / `{}`）。期望值从 JSON 现算，不手抄。
   - ② 数据自检：每条 `launch` 只含 `args`/`env` 两键，类型如方案 1；替换后任何值不再含 `{` `}`（防拼错占位符静默残留）。
   - ③ 改动证据：断言 `wrapper.mjs` 源码不含 `REQUIRED_ARGS`、`PACKAGE_ENV`、`MEMORY_FILE_PATH`、`allowed-directories` 四个字面量（包差异不许回到代码里）。
   - ④ 不在 picks.json 的预置坐标（复用 proc.mjs 已有夹具口径即可）→ args 只有入口、env `{}`。
3. market-picks.test 加一格：`PICKS` 里每个 installable Entry 序列化后不含 `launch`（renderer 不持有启动配置）。
4. 测试走隔离 HOME / TMPDIR，DBus 指向不存在路径；不跑全量 e2e。
5. 只在本单分支提交；合并等经理验收。

## 验收（写命令，不写感觉）
1. `cd app/sdk && ./node_modules/.bin/vitest run --config.verify-deps-before-run=false tests/market/ tests/unit/market-wrapper.test.ts` → 全 passed；其中 `wrapper-env.test.ts` 文件 **0 行 diff** 仍绿；回执贴先红（新测试文件单跑，实现前）与后绿两段末 15 行原样输出。
2. `cd app/sdk && ./node_modules/.bin/vitest run --config.verify-deps-before-run=false tests/e2e/market.test.ts` → 全 passed（②b 的 `['--allowed-directories', <home>/workspace]` 断言 0 行 diff 仍绿）。
3. `cd app/ui && ./node_modules/.bin/vitest run --config.verify-deps-before-run=false tests/unit/market-picks.test.ts` → 全 passed（含新「Entry 无 launch」格、版本防漂移格读 JSON）。
4. `cd app/ui && pnpm install --offline && pnpm build` 通过后：`CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/t69-connect-picks.spec.ts` → 1 passed；`… tests/e2e/market.spec.ts` → 3 passed。回执贴末 15 行。（证明 renderer 改读 JSON 后目录照常显示、能装。）
5. `grep -nE "REQUIRED_ARGS|PACKAGE_ENV|launchArgsFor|launchEnvFor|new Map\(" app/sdk/src/market/wrapper.mjs` → 无输出。
6. `git diff --stat main...feat/T70` 只含边界 1 列出的文件。
7. 覆盖：wrapper.mjs 改动行（查表 + 占位符替换 + 缺省分支）与 market-picks.ts 改动行，按 LEARNINGS 手工核算表列出改动行 ↔ 覆盖它的测试格，≥80%。

## 为什么这样验收
用户要的是「每个 bot 的差异在声明式数据里，代码只做通用搬运」。所以：
- 证据一是**代码里不再有任何包名相关取值**（验收 5 + 新测试 ③），否则只是换个地方写 Map。
- 证据二是**行为不变**：两个既有测试文件 0 行 diff 仍绿（wrapper-env 的两 home 各自派生、e2e ②b 的 filesystem 必需参数）——它们不是这张单写的，不会被「迁就实现」改松。
- 证据三是**期望值从数据现算**（测试 ①）：以后往 picks.json 加条目带 launch，不用碰 wrapper 也不用改测试。
- 证据四是**安全面没扩**：installBundle 的 wire 参数不变（market-store / m1-api 0 diff），renderer Entry 不带 launch——第三方源无法成为启动配置作者。

## 产出
- 新建 `app/sdk/src/market/picks.json`、`app/sdk/tests/market/wrapper-launch.test.ts`
- 修改 `app/sdk/src/market/wrapper.mjs`、`app/ui/renderer-grok/overrides/modules/market-picks.ts`、`app/sdk/tests/unit/market-wrapper.proc.mjs`、`app/ui/tests/unit/market-picks.test.ts`
- 回执 `work/tickets/receipts/T70.receipt.md`

## 审查
动 sdk market 数据流 + 启动配置来源（安全面）：施工完单独派 reviewer 一批，重点看方案 3 的「不走 M1」是否守住、占位符替换是否只作用于 launch 值。
