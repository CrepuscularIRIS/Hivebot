# T9a：L8-d ssh 组合骨架（start.ts 生成 ssh 行 + PTC 断依赖 + guard 工具名拒 glob/grep + 删 T4 死代码）

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：`work/p9-dsh-integration/DESIGN-ssh-composition.md` D8、D9（工具行）、D11、D13；实现单拆分表 T9a 行；T5 验收（`work/tickets/done/T5-l8c-ssh-composition-design.md`，accepted 2026-11-06 @ 10e9951b）
> 分支 / 作业目录：feat/T9a @ /tmp/bot-wt/T9a
> claimed：10:24 main (GLM 5.3) @ 03251ea2（施工开始时由主 agent 填：日期、起点 SHA）
> accepted：（经理验收通过时填：日期、HEAD）

## 目标
把 T4 测试里手写的 ssh 组合搬进产品启动器：`P2SDK_SSH_*` 给齐时 `start.ts` 生成 ssh 行，并把设计里「骨架就要定死」的三件做掉——PTC 全族在 ssh 模式不可用（禁 base `ptc-runtime` 断嵌套依赖）、`glob`/`grep` 在 ssh 模式被 guard 按工具名拒、强杀只留空目录。文件写围栏（T9b）和远端 bash wrapper（T10）**不在本单**：本单 ssh 模式先插原版 `fs-ssh` / `sandbox-ssh`。

**本单落地后 ssh 模式安全层不完整**（D4：原版 sandbox-ssh 下 bash 能读宿主 `~/.ssh`）。所以本单只开测试入口：产品 / UI 任何地方都不得设置 `P2SDK_SSH_*`（验收 6 钉住），直到 T10 验收。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md（ssh 本机测试的坑、P5-03 fake 游标坑）
2. 设计文档 D8、D9、D11、D13 四节全文（`work/p9-dsh-integration/DESIGN-ssh-composition.md:193-300`）
3. T4 组合原样：`app/sdk/tests/e2e/ssh-headless.test.ts:76-131`（ssh.patch.yml 生成段；:111-122 是重复的 llm-replay 死代码）、夹具 `app/sdk/tests/support/ssh-host.ts:82`（`startSshServer()`）
4. 挂点：`app/sdk/src/start.ts` `resolveConfig`（:57）、`validateStart`（:90；设计 D13 写成 `validateConfig`，以实际名为准）、`childEnv`（:147）、`sandboxRow`/`guardRow`（:202-262）、fs-zone 插入（:262-291）、`writeRuntimePatch`（:336）
5. guard 工具名拒：`app/sdk/src/policy/guard.mjs:38`（`NEVER_TOOLS` 常量）、:242（pre-execute 最前判定）、:211-231（config 校验）
6. sandbox-policy 回落语义：`repos/deepseek-harness/packages/sandbox/sandbox-policy/README.md:48`（config `workspaceRoot` 只是无 cwd 会话的回落，正常调用用会话不可变 cwd）
7. e2e 启动模板：`app/sdk/tests/e2e/skill-save.test.ts:103`（`launchRuntime`）

## 边界
1. 只动：`app/sdk/src/start.ts`、`app/sdk/src/policy/guard.mjs`、`app/sdk/tests/unit/start.test.ts`、`app/sdk/tests/unit/guard.test.ts`、`app/sdk/tests/e2e/ssh-headless.test.ts`（**只删** :111-122 那 12 行）、新建 `app/sdk/tests/e2e/ssh-product.test.ts`。超出就停下写回执。
2. **第一步**（先于任何其他改动，单独一个 commit）：删 `ssh-headless.test.ts:111-122`，跑 `ssh-headless + ssh-host` 贴「14 passed」原样，并记录 `warning: 1 entry did not activate` 是否消失（消失 = 就是它；不消失如实写，不据此下普遍结论）。
3. 配置（D13，本单只要本机测试需要的五个）：`P2SDK_SSH_HOST`（OpenSSH 别名）、`P2SDK_SSH_REMOTE_ROOT`、`P2SDK_SSH_HELPER`、`P2SDK_SSH_HELPER_HASH`、`P2SDK_SSH_NODE`。五个全空 = 本机模式（现行为一字不变）；给了但不齐 → `validateStart` 报错、启动失败。`P2SDK_SSH_REMOTE_HOME` 归 T9b、`P2SDK_SSH_RUNTIME_DIR` 归 T13，本单不加。
4. `sshRows(cfg)`（ssh 模式下由 `writeRuntimePatch` 追加；本机模式不生成）= T4 组合减重复 llm-replay：禁 `fs-sandbox`/`subprocess`/`sandbox`/`session-title-llm`、禁 PTC 四行（`ptc-runtime`、`workflow-ptc`、`tool-workflow`、`tool-executor-ptc`），插 `ssh`（host/launch node-script/helper/helperHash/workspace = REMOTE_ROOT）、`fs-ssh`、`subprocess-ssh`、`sandbox-ssh`；`sandbox-policy` 只覆盖 config `workspaceRoot = REMOTE_ROOT`（回落用，不加 headless 的 inject）。ssh 模式下**不生成**本机 wrapper 的 `id: sandbox` config 行、**不插** `fs-zone`（T9b 插 `fs-zone-ssh`）。凭证（私钥、known_hosts）不进任何生成行——只有别名。
5. guard 工具名拒：guard config 新增可选 `extraNeverTools: string[]`（校验 = 字符串数组，非法加载失败），与 `NEVER_TOOLS` 合并判定；拒绝原因为固定串，含 `not available in ssh mode`（提示改用 bash），不复用 plugin_manager 那句。`guardRow` 只在 ssh 模式写 `extraNeverTools: [glob, grep]`。
6. `childEnv`：`P2SDK_SSH_*` 五个不进 dsh 子进程（照 `P2SDK_SANDBOX_MASK` 的做法）；ssh 模式额外设 `P2SDK_SSH_MODE=1`（T9b containment 用，本单只设不读）。
7. e2e 会话一律用 `session/create {request:{cwd:<夹具 ws 下子目录>}}`（T6 的写法），不用带 sessionId 的 claim——那条路正被 T14 修，本单不和它缠在一起。T14 先合则 rebase 后照跑。
8. 先写失败测试：`start.test.ts` 新格与 `ssh-product.test.ts` ⑨ 先跑红（贴原样）再实现。
9. 测试走隔离 HOME / TMPDIR（`/tmp/bot-T9a-*`），DBus 指不存在路径；sshd 只用 `startSshServer()`，不另写夹具、不碰真实 `~/.ssh`；只跑下面列的文件。load > 20 等一等。

## 验收（写命令，不写感觉）
统一前置：
```sh
T=$(mktemp -d /tmp/bot-T9a-XXXX); mkdir -p $T/tmp $T/home
cd /tmp/bot-wt/T9a/app/sdk
E="env HOME=$T/home TMPDIR=$T/tmp DBUS_SESSION_BUS_ADDRESS=unix:path=$T/nonexistent"
V="pnpm --config.verify-deps-before-run=false exec vitest run"
ls -d /tmp/dsh-ssh-* 2>/dev/null | sort > $T/dshssh.before
```
1. 死代码：`git diff <起点>..<第一个 commit> --stat` 只有 `ssh-headless.test.ts` 删 12 行；`$E $V tests/e2e/ssh-headless.test.ts tests/e2e/ssh-host.test.ts` → 14 passed。
2. 单测：`$E $V tests/unit/start.test.ts tests/unit/guard.test.ts` → 全绿，新格至少含：
   - ① 五个 `P2SDK_SSH_*` 给齐 → runtime patch 含 `dsh-fs-ssh`、`dsh-subprocess-ssh`、`dsh-sandbox-ssh`、`- id: ptc-runtime\n  disabled: true`、guard 行含 `extraNeverTools`；**不含** `id: sandbox\n  config`（本机 wrapper）、不含 fs-zone 插入行、不含 `IdentityFile` / 私钥路径。
   - ② 任缺一个（逐个缺，5 例）→ `validateStart` 返回非空错误；五个全空 → 与改前 runtime patch 逐字相同（本机模式零变化）。
   - ③ `childEnv` 不含五个 `P2SDK_SSH_*`，ssh 模式含 `P2SDK_SSH_MODE=1`、本机模式不含。
   - ④ guard：`extraNeverTools: ['grep']` 时 `grep` 调用 deny 且原因含 `not available in ssh mode`；不配时 `grep` 不被工具名拒（正对照）；`extraNeverTools: 'grep'`（非数组）→ 加载抛错。
3. e2e：`$E $V tests/e2e/ssh-product.test.ts` → 全绿，三格：
   - ⑧（D8）从 start.ts 实际传给 dsh 的 `--patch` 文件里收集全部 `dsh-agent-preset` 行的 `config.id`（**不写死清单**；但断言收集结果 ⊇ `{standard, cordis, ptc}`（`approval.yml:65`、`:194`、`:326`，start.ts 链上必有）——防空集恒绿；若 buildArgs 还链了 `p6-reply-style.yml` / `presets.yml`，其 preset 自动进集合），每个 preset 建一个会话，fake 记录的首请求 tools 均不含 `workflow`。先红：保留禁 T4 三行、去掉禁 `ptc-runtime` → 若有 preset 出现 `workflow` 即红；若始终不出现，回执如实写「依赖链比预期更早断」并保留此格作回归（设计「未核实到底」第 2 条）。
   - ⑨（D9）同一 preset 全集，每个会话 fake 调 `grep {pattern:'x'}` 与 `glob {pattern:'*'}` → toolResult 为拒、文本含 `not available in ssh mode`。先红：去掉 `extraNeverTools` → grep 正常返回（贴原样）。（设计里的远端 rg 进程计数不做：guard 在 pre-execute 最外层拒，执行前就停了，拒绝串已足够证伪。）
   - ⑪（D11）SIGKILL launcher → 新增 `/tmp/dsh-ssh-*` ≤ 1、该目录为空、夹具端口拒连（ECONNREFUSED）。
4. 变异（各贴原样红，cp 备份还原，不提交）：M1 恢复 `ptc-runtime` 行 → ⑧ 红（若 ⑧ 先红未成立，回执写明 M1 不适用）；M2 `guardRow` 不写 `extraNeverTools` → ⑨ 红；M3 `sshRows` 照生成本机 `id: sandbox` config 行 → ① 红。
5. 本机回归不坏：`$E $V tests/unit/start.test.ts tests/e2e/guard-fs.test.ts tests/e2e/write-outside.test.ts tests/e2e/skill-save.test.ts` → 与起点同数全绿（先在起点跑一次记数；guard-fs 若基点有 P5-H8 已知超时格，以基点同格同结果为准）。
6. ssh 模式不外露：`grep -rn 'P2SDK_SSH_' /tmp/bot-wt/T9a/app/ui /tmp/bot-wt/T9a/app/sdk/profile | grep -v "disabled: !!js process.env.P2SDK_SSH_MODE === '1'"` → 空。（2026-11-06 经理改：T9ac 在 approval.yml 加了四行只读 `P2SDK_SSH_MODE` 的条件禁用。本条要防的是「产品里设置 P2SDK_SSH_*」，读它不算。）
7. 覆盖：`$E $V tests/unit/start.test.ts tests/unit/guard.test.ts --coverage --coverage.include=src/start.ts --coverage.include=src/policy/guard.mjs` → 回执列出本单新增 / 改动行的未覆盖行号，改动行覆盖 ≥ 80%。
8. 改动面：`git diff --stat <起点>..HEAD` 只含边界 1 的文件。
9. 收尾：`ls -A $T/tmp | grep -v node-compile-cache | wc -l` → 0；独立 shell `pgrep -af 'bot-T9a' | grep -v pgrep` → 空；`ls -d /tmp/dsh-ssh-* | sort | comm -13 $T/dshssh.before -` → 至多 ⑪ 那 1 个空目录（已接受残留，PLAN §3-10）。

## 为什么这样验收
骨架单最怕两件事：一是本机模式被顺手改坏（② 的「五个全空 → runtime patch 逐字相同」和验收 5 守着）；二是「禁掉了」只是测试写死的清单碰巧没漏——所以 ⑧⑨ 从启动器实际生成的 patch 枚举 preset，并要求集合含三个必有 preset，漏一个嵌套行就红。工具名拒做在 guard 而不是禁 base 行，是因为 `tool-fs-search` 嵌在 5 个 preset 的 `config.plugins` 里，按 id 禁 base 行够不着（设计 D9）。验收 6 是因为本单之后 ssh 模式的 bash 读遮蔽还没上（T10），产品入口一开就是 A4 凭证矩阵整组倒退。

## 风险
- ⑧ 先红可能不成立（嵌套 `workflow-ptc` 早于预期就断）：如实记录，不算失败。
- `session-title-llm` 禁用沿用 T4；若产品组合里它另有消费者导致 warning，写进回执，不在本单处理。
- T14 若改 `guard.mjs` 取 workspaceRoot 的方式，与本单同改 guard.mjs：后合者三方合并，不整文件覆盖。

## 产出
- 修改：`app/sdk/src/start.ts`、`app/sdk/src/policy/guard.mjs`、`app/sdk/tests/unit/start.test.ts`、`app/sdk/tests/unit/guard.test.ts`、`app/sdk/tests/e2e/ssh-headless.test.ts`（删 12 行）
- 新建：`app/sdk/tests/e2e/ssh-product.test.ts`
- 回执：`work/tickets/receipts/T9a.md`（死代码删后输出与 warning 结论、各先红原样、⑧ 枚举到的 preset 清单、变异输出、覆盖未覆盖行、/tmp/dsh-ssh-* 差分）
