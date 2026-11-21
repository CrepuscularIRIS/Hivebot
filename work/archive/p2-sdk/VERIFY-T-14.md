# VERIFY-T-14 · p2temp 相对路径锚定（REVIEW-阶段收尾 R14）

verdict: PASS
commit: a59220970408e7b8fcacfb40b4f66817665e76c2（feat/T-14，/tmp/bot-wt/T-14；验收期间 head 未漂移，工作区干净）

## 验收项

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| ① 相对路径连接器 fixture 能建 session 且工具表含 relative_ping（亲跑） | PASS | worktree a592209 上 `vitest run tests/market/connectors.test.ts --reporter=verbose`：`✓ R14: a relative-path connector loads; its tool reaches the request tool table`（4/4 绿）。runtime 为真实 dsh 子进程（mock provider，scripts/start.mjs spawn），用例走 createWithConnectors → session/prompt → 流式 request/header 断言工具表含 `relative_ping`。日志：`evidence/T-14/market-connectors-verbose.log` |
| ② 绝对路径 fixture 不回归 | PASS | 同上运行中既有用例 `✓ X created with connectors sees the MCP tool; plain Y does not`（@p2sdk-fixture/demo-mcp，绝对 file:// specifier）仍绿；全量 80 绿中含该文件。日志：`evidence/T-14/market-connectors-verbose.log`、`evidence/T-14/full-a592209.log` |
| ③ 单测覆盖四类重写 + 嵌套 group 行 | PASS | 读 `tests/unit/p2temp.test.ts` 核对：一条用例覆盖 `'./lib/index.mjs'`、`'../sibling/plugin.mjs'`、`'/abs/plugin.mjs'`（重写为 pathToFileURL(resolve(base,name)).href）、`'some-package'`（保持原样）四类；另一条覆盖两层嵌套 group（config 内 relative、bare、再嵌套 group 的 `'../deep.mjs'`）。实跑 `vitest run tests/unit/p2temp.test.ts` 11/11 绿。日志：`evidence/T-14/unit-p2temp.log` |
| 全量复跑：80 绿 + 4 既红（R11，非本任务引入） | PASS | a592209 串行全量 `--no-file-parallelism`：84 用例 80 绿 4 红；4 红全在 tests/e2e/security.test.ts（②③⑤⑥），错误均为 `ENOENT ... /base-url`。独立 detach worktree（/tmp/bot-wt/T-14-verify-base，已删）在干净 d373b6b 同样串行全量：81 用例 77 绿，同样 4 红同名同 ENOENT → 既红成立；81→84、77→80 差值恰为本任务新增 3 用例全绿。日志：`evidence/T-14/full-a592209.log`、`evidence/T-14/full-d373b6b-baseline.log` |
| 实现对照上游 anchorInsertedPluginNames | PASS（行为等价，差异仅上下文适配） | 上游 `repos/deepseek-harness/packages/boot/app-boot/src/index.ts:546-557` + parsePatchList 调用点（:576-591，锚定基 `file` 即被解析的 patch 文件自身路径）。逐点对照：①重写条件同为 `typeof name === 'string' && (isAbsolute \|\| './' \|\| '../')`，裸名/无 name 行不动；②重写结果同为 `pathToFileURL(resolve(base, name)).href`，base 同为 `dirname(resolve(patchFile))`；③嵌套同为 `entry.group && Array.isArray(entry.config)` 递归 forEach(visit)。差异两处均属上下文适配：上游吃整份 patch 列表逐 patch 遍历 `insert`（一份 patch 文件一个 base，适用于所有 overlay），SDK 吃 readConnectorRows 已摊平的 insert 行（一个连接器按 package.json dsh.bundle.patch 只有一份 patch 文件，单一 base 等价）；TS→JS 去类型。 |
| 区域检查：diff 限于申报文件 | PASS | `git diff d373b6b..a592209 --stat` 共 7 文件：src/p2temp/index.mjs、tests/unit/p2temp.test.ts、tests/market/support.ts、tests/market/connectors.test.ts、tests/market/fixtures/relative-bundle/{cordis.patch.yml,lib/index.mjs,package.json}。全部在申报区域内，无越界改动。 |

## 坏路径（变异检查）

把 T-14 的测试单独 checkout 进干净 d373b6b（无修复 src）：
- unit 2 条 R14 用例红（返回未锚定原值）；
- market R14 用例红，错误逐字复现 R14 报告链：`p2temp/session.createWithConnectors failed: {"code":"agent-preset/invalid","message":"relative-tool (./lib/index.mjs): never started"}`。
证明新测试真能捕获该缺陷、修复是该红的直接原因。日志：`evidence/T-14/mutation-market-prefix.log`。检查后基线 worktree 已删除，builder 现场未动（复验 HEAD 仍 a592209、status 干净）。

## 证据清单（work/p2-sdk/evidence/T-14/）

- full-a592209.log — a592209 串行全量（84/80 绿/4 红）
- full-d373b6b-baseline.log — 干净基线全量（81/77 绿/同 4 红）
- unit-p2temp.log — unit 单跑 11/11
- market-connectors.log、market-connectors-verbose.log — market 单跑 4/4（含用例名）
- mutation-market-prefix.log — 无修复 src + 新测试的市场红（R14 原始错误链）

## 新问题

无。已知既红（security.test.ts 4 例 ENOENT，R11 范畴，T-11/T-12 在途）非本任务引入，不在本报告立新条目。

无 UI 内容，本任务不涉及截图。
