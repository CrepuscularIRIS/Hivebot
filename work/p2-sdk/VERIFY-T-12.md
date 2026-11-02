verdict: PASS
commit: c5fa0b4993432bb30da1ee258e5b928c25510f50

# T-12 验收（REVIEW-L 安全默认值：R1 critical + R3/5/13 + R6/12）

- 分支/worktree：feat/T-12（/tmp/bot-wt/T-12），rebase 到 e8b5034 后
- 验收环境：node 24.22.2（pnpm 管内）、vitest 5.0.5；HOME=/tmp/bot-vfy-T-12/h；全部串行（--no-file-parallelism 或单文件）
- evidence：work/p2-sdk/evidence/T-12-verify/（下文相对路径均在此目录内）
- 手工端到端：verify-default-ask.test.ts（3 用例，vitest 经 vfy.config.ts 从 evidence 目录加载；argv/env 用产品 src/start.ts 导出组件拼装，唯一偏差是 replay 脚本含 bash tool-call 探针——产品 mockReplayOverride 只有文本回复，无法驱动 bash 工具；e2e 是经 P2SDK_PATCH 挂 fake provider 实现的，「完全不设 P2SDK_PATCH」的默认链此前无覆盖）

## 验收矩阵（PLAN T-12 行①–⑤）

| 验收项 | 结果 | 证据 |
|---|---|---|
| ① 默认启动挂 approval.yml；默认链普通 bash 必问（红路径复现「没问就跑了」） | PASS | 三层证据：(a) 单测 start.test.ts 断言 buildArgs 第 2 个 patch 是 profile/patches/approval.yml（全量内）；(b) e2e approval.test.ts 4/4 绿——approval.yml 不再经 P2SDK_PATCH 挂载（patches 只带 fake provider），PRESET_ONLY 探针改为「默认挂载 + disabled: true 后层禁用」；(c) 手工默认链（完全不设 P2SDK_PATCH/HANDOFF）：普通 bash → approval/request（toolName=bash）→ rejected 后 canary 不存在、恰好 1 次询问。红路径：PRESET_ONLY=1 单跑 4/4 红（waitForApproval 超时，preset-only.log）+ 手工 noask overlay（仅 `- id: p2sdk-shell-ask / disabled: true`）：6s 内 0 次询问且 canary-plain 直接创建、danger-full-access 升权审批不受影响。vfy-run9.log |
| ② 仅「严格宽于当前模式」才跳过；同模式重复也要问 | PASS | 单测 policy.test.ts：同模式 ask、更窄/未知值 ask（fail closed）、read-only→workspace-write 与 workspace-write→danger-full-access 委托、无 sandboxPolicy 服务时 ask。手工默认链实测：workspace-write 同模式重复 → approval → allowed-once → canary 创建（累计恰 2 次）；danger-full-access（严格宽）→ 委托上游升权审批（request keys: toolName,callId,reason,displayReason）→ allowed-once → canary 创建（累计恰 3 次，无双弹窗）。vfy-run9.log |
| ③ handoff 路径不可由 env 推导；P2SDK_HOME 不进 dsh env | PASS | 实现为「默认 handoff = mkdtemp 随机 tmpdir + P2SDK_HOME 从 childEnv 剔除」（比 PLAN 措辞「home 内子目录」更强的等价达成：非确定性、也非 home 兄弟目录）。单测：env.P2SDK_HOME undefined + 父 env 的 P2SDK_HOME/HANDOFF 不透传。亲查：多轮 `readFileSync(/proc/<dsh pid>/environ)` → P2SDK_HOME/P2SDK_HANDOFF 均 ABSENT（DSH_HOME present 属设计内，上游 scrub 在工具子进程层剔除 DSH_*，证据 repos/deepseek-harness/packages/subprocess/subprocess/src/index.ts:47,69）。stderr `p2sdk: handoff <dir>` 为 operator 面元数据（入口烟测解析到并据此连 min-client 成功）。vfy-run9.log（3 轮 /proc 检查） |
| ④ 模型侧 cat/推导路径/find 均取不到 token | PASS | e2e R1 用例绿（printenv 0 / 推导 0 字节 / find home 0 / find PKG_ROOT 0 / token 不进 transcript）。手工默认链补充探针：PRINTENV_COUNT=0、CAT_DERIVED_BYTES=0、FIND_HOME_COUNT=0、token 不进 transcript；**加深实测**——把 handoff 路径直接喂给模型侧 bash（模拟攻击者已获知路径）：TOKEN_SEEN(test -f)=no、DIRECT_RC(cat)=1、DIRECT_READ_BYTES=0，同回合 workspace 内 touch rc=0（命令本身正常执行）→ 上游 bash 沙箱为 OS 级方言（sandbox/src/roots.ts 头注：bwrap/Landlock/Seatbelt，bwrap 用私有 /tmp mount），workspace 外路径在模型侧文件系统视图中不存在，/tmp 枚举面整体不可达。vfy-run8/9.log、probe-transcript.json |
| ⑤ 全量绿 | PASS | 全量 95/95 exit=0 两次（full-run2.log 79.28s；coverage 全量 coverage-run.log 亦 95/95 exit=0，无 threshold 报错：start.ts 90.37% stmts、shell-ask.mjs 100% stmts/branches 81.48%，均过 80 门槛）。一次全量 94/95：唯一红是 security.test.ts ⑤ real-key 用例（REAL_KEY=LITELLM_MASTER_KEY 实跑真实 LiteLLM），复跑+单跑×2 均绿（security-verbose.log ⑤ 14382ms 绿），判外部端点偶发抖动，非 T-12 路径（T-12 未动 ⑤ 逻辑；min-client 改动不影响显式 P2SDK_BASE_URL/TOKEN 路径） |

## 套件单跑与 demo 链路（派发步骤⑤）

| 套件 | 结果 | 证据 |
|---|---|---|
| security.test.ts | 7/7 ×2 | security-single.log、security-verbose.log |
| concurrency.test.ts | 1/1 | concurrency.log |
| restart.test.ts | 2/2 | restart.log |
| approval.test.ts（正常） | 4/4 | approval.log |
| approval.test.ts（PRESET_ONLY 红探针） | 4/4 红（预期红） | preset-only.log |
| min-client demo（真实入口） | PASS | verify-default-ask.test.ts 第 3 用例：node scripts/start.mjs（产品入口，mock，不设 PATCH/HANDOFF）→ stderr 解析 `p2sdk: handoff /tmp/p2sdk-handoff-8QekCI` → ready 行 → stdio 无 token 泄漏断言 → min-client 以 P2SDK_HANDOFF=<该目录> 完成流式往返（`turn end: true reason=completed`、`min-client PASS`、exit 0）。vfy-run9.log |

## 区域检查

- diff e8b5034..c5fa0b4 恰 **11** 个文件（派发口径 12，差 1；builder evidence/T-12.md 未附文件清单，11 个全部落在申报范围 app/sdk 内，无范围外改动）：src/start.ts、src/policy/shell-ask.mjs、profile/patches/approval.yml、examples/min-client.mjs、tests/e2e/approval.test.ts、tests/e2e/config.test.ts、tests/market/fixtures/methods-snapshot.mjs、tests/support/fake/plugin.mjs、tests/unit/policy.test.ts、tests/unit/start.test.ts、evidence/T-12.md。
- start.ts 语义合并点逐 hunk 核对：childEnv 排除名单同时含 P2SDK_HOME（T-12）与 P2SDK_TEST_V8_COVERAGE（T-11 旁路，L136 映射回 NODE_V8_COVERAGE），allowlist `keep` 行未变；锁段（acquireHomeLock/publish/stale-reclaim）零改动；writeRuntimePatch/mockReplayOverride 未变；DSH_HOME 保留（L124）正确——上游 scrub 在工具子进程层剔除 DSH_*。min-client 与两处测试 fixture 的 P2SDK_HOME→DSH_HOME 适配是剔除后的必要涟漪，e2e config.test.ts 内嵌 recorder 插件同步改读 DSH_HOME。
- 测试重写核查：policy.test.ts 旧 3 用例全保留 + 新增 4 组（同模式/更窄未知/无服务/严格宽矩阵）；approval.test.ts 旧 3 用例保留（PRESET_ONLY 机制改写为禁用行）+ 新增同模式与 R1 两用例；start.test.ts 新增 4 组断言。无删测凑数。

## 结论

①–⑤ + 区域检查全部 PASS。R1（critical）的攻击链被三重封死：env 不可推导（P2SDK_HOME/HANDOFF 不进 dsh env，亲查 /proc）、路径不可预测（随机 tmpdir，非确定性兄弟目录）、文件系统不可达（OS 级沙箱使 workspace 外路径对模型侧 shell 不存在，实测 test -f 为 no）。R3/5/13 由 buildArgs 默认挂载修复并以红路径双向验证；R6/12 由 STRICTLY_WIDER 严格宽判定修复（同模式/更窄/未知/解析失败一律 fail-closed 询问）。

## 新问题（每条一行，可直接成为修复任务）

- [FIX] security.test.ts ⑤ real-key 用例偶发红（本次 3 次全量中 1 次，D2 smoke 对外部 LiteLLM 无重试）| 复现：环境有 LITELLM_MASTER_KEY 时反复全量跑 | 疑似位置：app/sdk/tests/e2e/security.test.ts:375 | 严重度 LOW
- [FIX] R1 用例缺「模型侧直读已知路径 / /tmp 枚举」探针，OS 级沙箱方言若被切换（如纯策略级 dialect）将静默失去保护，无回归兜底 | 复现：向 approval.test.ts R1 用例补 TOKEN_SEEN/DIRECT_RC 探针（本次手工已实测当前不可达）| 疑似位置：app/sdk/tests/e2e/approval.test.ts（R1 用例）| 严重度 LOW
- [注] resolveConfig 每次调用都 mkdtempSync 一个空 handoff 目录（单测多次调用会留空 /tmp/p2sdk-handoff-* 垃圾目录；无安全影响，token 只在实际启动时写入）| 疑似位置：app/sdk/src/start.ts:62 | 严重度 LOW（ponytail 注记级）

## 待清理进程（GLM 不杀，交 process-ops）

- 459759：node /tmp/bot-wt/T-12/app/sdk/node_modules/@deepseek-ai/dsh/lib/bin.js web --patch p2sdk.yml --patch approval.yml --patch /tmp/p2sdk-vfy-ask-O368M1/runtime-patch.yml --port 0 --no-open（verify 首跑孤儿，vfy-run1 失败遗留）
- 459949：同上，argv 另含 /tmp/p2sdk-vfy-noask-LyMhw9/no-ask.yml（noask 实例，同批遗留）

后续 run（vfy-run2–9）与全部 e2e 单跑的 teardown 均干净（dsh exitCode=0）。
