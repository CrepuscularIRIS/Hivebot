# VERIFY-T-16 · preset.ensure + presetIdOf（Q-008=A 落地）

verdict: **PASS**
commit: `47bd735dfbf0fe80653fdda1bb2ec85ed9f45125`（feat/T-16 最终 head）
（派发 head c1dc6fc；验收进行中协调者通知 head 前进到 47bd735——增量=删 Duplicate 文案匹配改 in-flight 注册表，按协调者指令以 47bd735 为准收尾，已完成大项不重做）

- 验收人：verifier（GLM 5.3），2026-11-02 06:40–06:58
- 验收方式：派生 worktree 独立跑（`/tmp/bot-wt/T-16-vfy` detach @47bd735、`/tmp/bot-wt/T-16-red` detach @97cb7cf），全串行 `--no-file-parallelism`（GPU 训练约束）。全程未手工杀进程（测试内 SIGKILL 均为测试框架自管子进程的 afterAll 清理）。
- 过程事件：builder 在我首跑期间并发改 `/tmp/bot-wt/T-16`（未提交），首跑混入脏改动（115 用例 1 红）——按 LEARNINGS 改用独立 detach worktree 重跑，脏树日志另存。该「脏跑」意外成为 47bd735 增量红测试的**亲见红证据**（见下）。

## 验收项

| 验收项 | 结果 | 证据 |
|---|---|---|
| ① 干净全量 + p2temp 覆盖率 ≥85 | PASS | @47bd735 独立 detach：`vitest run --no-file-parallelism` **17 文件 / 115 用例全绿，EXIT=0**（`evidence/T-16/full-47bd735.log` 尾部）；`--coverage`：`src/p2temp | 100 | 96.29 | 100 | 100`（%St/%Br/%Fn/%Ln），与申报逐字一致，全部门槛（全局 80 / p2temp 85）通过，EXIT=0（`evidence/T-16/coverage-47bd735.log`）。链上中间点 @c1dc6fc 干净 detach 全量 **114/114 绿**（`full-c1dc6fc.log`） |
| ②-1 presetIdOf：sha256 内容定 id、去重排序、拒绝缺省 | PASS | `src/p2temp/preset-id.mjs:26-32` = `'p2temp-'+sha256(JSON.stringify([agentPreset, normalizedConnectors(connectors)])).slice(0,12)`，与 CONTRACT §3.1 逐字同式；normalizedConnectors `[...new Set(x)].sort()`（:22）；agentPreset 缺省/空白 throw（:27-29）。单测亲跑绿：`presetIdOf: same content ⇒ same id; order/dedup insensitive; different presets differ`、`rejects missing or empty agentPreset and invalid connectors`（`verbose-keycases-47bd735.log`）。不用 rows 内容派生的理由与 CONTRACT §3.1 一致（旧方案实证：01c6921 的 id 是 `p2temp-${counter}-${Math.random…}` 纯随机，跨运行必变——见红基线） |
| ②-2 createWithConnectors 用 presetIdOf + has-check 幂等 | PASS | `index.mjs` createWithConnectors → ensurePreset（presetIdOf → definitions.get(id) 命中即复用）；单测绿：happy path（registered[0].id === presetIdOf、session 用临时 id）、second identical call 1 register 2 create、并发用例（见 ②-新） |
| ③ presetEnsure 幂等 + RemoteError('p2temp/connector-unavailable') 含连接器名 + 不毒化 registry | PASS | 实现侧：readConnectorRows 全部失败路径走 `connectorUnavailable(name)` = `new RemoteError('p2temp/connector-unavailable', msg, {connector:name})`，消息内嵌名字；失败全部发生在 register 之前。测试侧（`tests/unit/p2temp.proc.mjs`，亲跑绿）：断言 `error.code==='p2temp/connector-unavailable'`、`error.details` deepEqual `{connector:'@nope/missing'}`、message 匹配名字、`calls.registered.length===0`、`definitions` 无 `p2temp-*` 残留、原 'standard' 仍在（§8 第 1 条） |
| ④ connector-restart 转绿（ensure 调用 + 重建 id===header 冻结 id） | PASS | `tests/e2e/connector-restart.test.ts`（@c1dc6fc 引入、47bd735 未改）：boot1 建连接器 bot X → 从 follow snapshot header 读出冻结 `presetId`（断言 `/^p2temp-/`）→ kill -9 → boot2 同 env 重启 → **调 `p2temp/preset.ensure` 断言 `ensured.presetId === presetId`（header 冻结值）** → 新建 bot 一回合 + 旧 session follow + prompt + turnEnd 全绿。亲跑：verbose 绿 4826ms（`verbose-keycases-47bd735.log`）；全量内亦绿。黑盒 #21 替身逻辑成立（main 启动编排属 P4） |
| ⑤ 方法差集=2 + P2-TEMP grep 两处 | PASS | `connectors.test.ts`：own diff（滤 pluginMarket/*）deepEqual `['p2temp/preset.ensure','p2temp/session.createWithConnectors']`、`full.filter(p2temp/*)` 同二项，亲跑绿；`grep -rn P2-TEMP app/sdk/src` 命中恰两文件（`p2temp/index.mjs`、`p2temp/preset-id.mjs`）；签名逐字断言（both signatures verbatim）绿 |
| ⑥ events-replay 保持绿 | PASS | `tests/e2e/events-replay.test.ts`（97cb7cf 引入时即绿探针）@47bd735 verbose 亲跑绿 1952ms；@c1dc6fc 与 @47bd735 两次全量内均绿 |
| 红基线（cherry-pick 后红 → 实现转绿链） | PASS | @97cb7cf detach 亲跑 connector-restart：**1 failed，EXIT=1**，错误原文 `session/prompt failed: {"code":"gateway/internal","message":"resume failed … RemoteError: Unknown agent preset: p2temp-1-8bae0f"}`，diff 中 `prompt ok:false / turnEnd:false`（`red-97cb7cf-connector-restart.log`）。后缀 6 hex 与 builder 记录的 `5a3a40`、T-15 的 `79362c` 各不相同——旧 id 含 `Math.random()`（01c6921:133），跨运行必变，形状 `Unknown agent preset: p2temp-1-` 稳定，红签名吻合。链：97cb7cf 红 → 798206a 实现 → c1dc6fc 驱动转绿（114/114 亲证）→ 47bd735（115/115 亲证） |
| 增量（协调者追加）②-新 in-flight 实现 + 红测试语义 | PASS | 实现：`this.inflight = new Map()`（:146），ensurePreset 同 id 共享一条 registerPreset promise，`done.then(clear,clear)` 且 `clear` 带 `get(id)===done` 身份守卫（旧 settled promise 不会误删新槽）；has-check 移入单飞路径 registerPreset。红测试亲见红：脏树首跑（47bd735 提交前 06:43）`concurrent same-id … 2 !== 1` = 旧实现 register 触达两次（`full-c1dc6fc-DIRTY-worktree.log`）；@47bd735 同用例绿 + `ensure failure clears the in-flight slot: retry attempts===2` 绿（失败清槽、重试走全路径）+ 旧「Duplicate 视为已存在」用例随语义删除 |
| 增量③ 'Duplicate agent preset' src 零命中 | PASS | @47bd735 干净 detach `grep -rn "Duplicate agent preset" app/sdk/src` → 0 命中（exit 1）。原派发第 5 项「Duplicate 文案匹配脆弱性」由此增量直接消除，无需等 P3 |
| 区域检查（6 文件、未碰 src/start.ts） | PASS | `git diff --name-status 01c6921..47bd735`：M index.mjs、A preset-id.mjs、A connector-restart.test.ts、A events-replay.test.ts、M connectors.test.ts、M p2temp.proc.mjs——恰 6 文件；`--name-only | grep -c start.ts` = 0；47bd735 增量仅动其中 2 文件（index.mjs + proc.mjs） |

## 结论

①–⑥ + 红基线 + 区域 + 两项增量全部 PASS，verdict: **PASS**。

## 新问题（不阻塞合并）

- [FIX-LOW] connector-restart 测试标题与失败文案停留在红探针时代 | 复现：读 `app/sdk/tests/e2e/connector-restart.test.ts`——it() 标题尾仍写 `(target semantics, expected red)`，最终断言 message 仍写 `red here IS the CONTRACT §7.1 answer: the persisted temp preset no longer resolves after restart`；c1dc6fc 起该测试期望全绿，真红时这句文案会把排障方向指反（preset.ensure 缺失 vs ensure 已调但失败） | 疑似位置：connector-restart.test.ts:169 标题、:262-265 message | 严重度：low（文案）
- [记录] 47bd735 已消除 Duplicate 文案耦合；剩余上游耦合是单测 fake registry 复刻 0.2.2-alpha.2 的 definitions/register 行为（proc.mjs 内有注释标明），上游升级时需跟随——P2-TEMP 生命周期内可接受，P3 推翻时一并处理
- [记录] 旧 preset id 含 Math.random（01c6921:133）为跨运行不可重建的根因，新 presetIdOf 仅从 (agentPreset, 连接器名) 派生、跨运行稳定——P4 main 侧按 recipes 重建的前提已成立（本验收在单运行内证 id===header；跨运行同 id 由内容派生性质保证，P4 首个真实 main 编排任务会再实测）

## 证据清单（work/p2-sdk/evidence/T-16/）

- `full-47bd735.log` — 最终 head 干净全量 115/115，EXIT=0
- `coverage-47bd735.log` — 115/115 + `src/p2temp 100/96.29/100/100`，门槛全过
- `full-c1dc6fc.log` — 链上中间点干净全量 114/114
- `verbose-keycases-47bd735.log` — 关键用例逐名绿（method diff=2、签名逐字、connector-restart、events-replay、并发单飞、失败清槽、不毒化）
- `red-97cb7cf-connector-restart.log` — 红基线：Unknown agent preset: p2temp-1-8bae0f，1 failed EXIT=1
- `full-c1dc6fc-DIRTY-worktree.log` — 脏树观察（47bd735 提交前）：增量并发用例亲见红 `2 !== 1`
