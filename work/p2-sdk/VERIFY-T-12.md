verdict: 进行中（骨架，边跑边补）

# T-12 验收（REVIEW-L 安全默认值：R1 critical + R3/5/13 + R6/12）

- 分支/worktree：feat/T-12（/tmp/bot-wt/T-12）
- head SHA：c5fa0b4993432bb30da1ee258e5b928c25510f50（c5fa0b4，rebase 到 e8b5034 后）
- 验收人环境：node 24.22.2（pnpm 管内）、vitest 5.0.5；HOME=/tmp/bot-vfy-T-12/h；测试全部串行
- evidence 目录：work/p2-sdk/evidence/T-12-verify/

## 已完成

| 项 | 结果 | 证据 |
|---|---|---|
| 步骤1 干净全量 | 两次全绿 95/95，exit=0（79.28s）；另有一次 94/95——红的是 security.test.ts ⑤ 真实 LiteLLM 依赖用例（REAL_KEY=LITELLM_MASTER_KEY 实跑），复跑+单跑均绿，判 flaky 环境抖动非 T-12 回归 | full-run2.log、security-single.log、security-verbose.log（⑤ 14382ms 绿） |
| 区域检查 | diff e8b5034..c5fa0b4 恰 11 个文件（非派发所说 12）：src/{start.ts,policy/shell-ask.mjs}、profile/patches/approval.yml、examples/min-client.mjs、tests/e2e/{approval,config}.test.ts、tests/market/fixtures/methods-snapshot.mjs、tests/support/fake/plugin.mjs、tests/unit/{policy,start}.test.ts、evidence/T-12.md。全部落在申报范围 app/sdk 内，无范围外文件 | git diff --stat |
| start.ts 语义合并点 | 逐 hunk 核对：childEnv 排除名单同时含 P2SDK_HOME（T-12）与 P2SDK_TEST_V8_COVERAGE（T-11 旁路，L136 映射 NODE_V8_COVERAGE），allowlist/锁逻辑零改动；buildArgs 默认插 approval.yml（L94）；resolveConfig handoff 默认 mkdtempSync 随机 tmpdir（L62）；main stderr 打 `p2sdk: handoff <dir>`（L472）；DSH_HOME 保留（L124，上游 scrub 在工具子进程层剔除 DSH_*，证据：subprocess/src/index.ts:47,69 SENSITIVE_ENV_PATTERN=/KEY|PASSWORD|SECRET|TOKEN/i + DSH_ENV_PREFIX 前缀剔除） | src/start.ts 通读 |

## 进行中

- 验收项①②③④手工端到端（不设 P2SDK_PATCH 的默认链 + 红路径对照）：verify-default-ask.test.ts 首跑因 verifier 自身脚本两个 bug 失败（replay 条目缺 kind:'chunks'；try 块作用域），已修复待重跑。
- /proc environ 亲查已在首跑中先行确认：两个 dsh 实例的 environ 中 P2SDK_HOME/P2SDK_HANDOFF 均 ABSENT。

## 待清理进程（交 process-ops，GLM 不杀）

- 459759：node .../dsh/lib/bin.js web --patch p2sdk.yml --patch approval.yml --patch /tmp/p2sdk-vfy-ask-O368M1/runtime-patch.yml --port 0 --no-open（T-12 verify 首跑孤儿）
- 459949：同上 + /tmp/p2sdk-vfy-noask-LyMhw9/no-ask.yml（T-12 verify 首跑孤儿，noask 实例）

（后续结论边跑边补。）
