verdict: PASS
commit: 39ae3eb7acf333b33c36cfef771dd5ce69212fed

验收环境：worktree /tmp/bot-wt/T-19（feat/T-19，验收期间 HEAD 无漂移、worktree 干净），
pnpm 11.0.9 / node v22.23.4，依赖已由 frozen-lockfile 安装。证据均在
`work/p2-sdk/evidence/T-19/`（online-test.txt / offline-test.txt / probe-output.txt / spotcheck.txt）。

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| ① listing install spec = 真实 npm 坐标 | PASS | spotcheck.txt §A：fixture `@agent-infra/mcp-server-filesystem@1.2.29`（title 保留 io.github.bytedance/...）；probe-output.txt：真实 SDK surface `pluginMarket/search` 返回 `versions[0].install.spec == "@agent-infra/mcp-server-filesystem@1.2.29"`；spotcheck.txt §B：registry.npmjs.org dist-tags.latest=1.2.29 且 packument 含 1.2.29 |
| ② 90 条 not-installable 结构化拒 | PASS | spotcheck.txt §A：21 有坐标 / 90 标记（与 source.json npmCoordinates 一致），2 条抽验 keywords=['not-installable'] 在位；probe-output.txt ②c 亲跑 `@ac.inference.sh/mcp@2.0.1`（listing 可见）installBundle → `application:"failed"` + `packageResult.exitCode:1` + `ERR_PNPM_FETCH_404`，结构化错误非静默 |
| ③ D6 全链 + ②b listing spec 安装 | PASS | D6 wrapper journey 未动、含在 129 绿内；probe-output.txt ②b 亲跑 listing spec：pnpm `resolved 90, reused 90, added 90, exitCode:0`（真实解析+添加）→ dsh `not-bundle` 拒绝 → listBundles 无裸包残留（回滚干净）——与预 T-19 的 registry-404 operation-error 语义可区分 |
| ④ 双绿 | PASS | online-test.txt：18 files / 129 tests / 30.77s；offline-test.txt：`unshare -rn`（仅 lo，CURL-RC=6）129 tests / 149.42s |
| ⑤ fetch 脚本复核 | PASS | spotcheck.txt §C：线上 payload `packages[]` 三例形态（connector version='latest'、@adeu '1.7.1'、@2kw '8.0.3'）与 `npmPackageOf` 提取条件（registryType==='npm' + identifier 非空）一致；抽验 3 条坐标（@2kw/ai-mcp-server@8.0.3、filesystem-mcp@1.3.0、@adeu/mcp-server@1.7.1）npm packument 全部存在；dist-tags 解析的一次性语境在 `npmVersion` JSDoc（"part of this script's one online run, so $OFFLINE consumers never pay for it"） |
| ⑥ diff 恰 4 文件 | PASS | spotcheck.txt §D：fetch-market-fixture.mjs / market.test.ts / index.json / source.json，无其他改动 |

坏路径覆盖：断网（offline netns 全量 129 绿）、错误输入（②c 404 结构化拒）、dsh 边界拒绝后回滚（②b，bundles 列表无残留）。

核对方式说明：index.json 的 versions[] 无显式 install 字段，install spec 由 SDK/dsh 从 name@version 合成并在 pluginMarket/search 响应中给出——验收同时核了 fixture 层（name+version）与 SDK surface 层（install.spec），两层一致。

新问题（每条一行，可直接成为修复任务）：
- 无 BLOCKER/HIGH。观察（不立 FIX）：probe ②c 的安装尝试 registries 列表含 npmmirror 而 ②b 仅默认 registry，属 dsh runtime 的 registry 选择行为，与 T-19 无关，P4 接 UI 前可顺带确认。
