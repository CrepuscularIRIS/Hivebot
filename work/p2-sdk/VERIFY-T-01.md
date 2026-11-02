# VERIFY · T-01 demo 纵向链路

verdict: PASS
commit: b19c14f3fee3352fb26d080eea43d23b350f47ad（feat/T-01，worktree /tmp/bot-wt/T-01；验收于 2026-11-01 13:45–13:54，全程串行）
证据目录：`work/p2-sdk/evidence/`（下表相对此目录）

## 判定一览

| 验收项 | 结果 | 证据（命令 / 文件 / 输出摘录） |
|---|---|---|
| ⓪ v22 shell 里 setup 成功 + dsh 进程 Node ≥24.9.0 | PASS | shell `node -v`=v22.23.4、pnpm 11.0.9；删净 node_modules/.dsh 后 `pnpm -C app/sdk setup` exit 0，devEngines 装上 `node@24.22.2`（setup-local.out）。mock 与 real 两轮 start 的 dsh 进程 `readlink /proc/<pid>/exe` 均指向 `node_modules/.pnpm/node@24.22.2/.../bin/node`，`exe --version`=**v24.22.2**（mock-exe.txt、real-ss.txt） |
| ① 两场景 setup + repos 不动 + D1 证伪（G2-r2） | PASS（repos 判据按裁定②意图执行） | 本机 clone（/tmp/bot-wt/T-01）与 /tmp 新 clone（`git clone /tmp/bot-wt/T-01 /tmp/t01-verify`，HEAD 同为 b19c14f）各跑 `pnpm -C app/sdk setup`（= `pnpm install --frozen-lockfile`，输出 "Lockfile is up to date, resolution step is skipped"）均 exit 0；两场景 setup 后整树 `git status --porcelain` 为空（package.json/pnpm-lock.yaml 无改动）；已装 `@deepseek-ai/dsh` = **0.2.2-alpha.2**；`repos/deepseek-harness` HEAD 前后均 ce7073d、porcelain 均空（repos-baseline.txt、setup-local-after.txt、setup-tmp-after.txt）。/tmp clone 的 repos/ 仅含两个 git 跟踪文档，无源码目录；node_modules 对 repos/ 的 symlink = 0、lockfile 无 repos 引用 |
| ② start 60s 内 ready 常驻 + 进程树监听全 loopback | PASS | mock ready 0s（127.0.0.1:38795）、real ready 2s（127.0.0.1:35165），均常驻至主动 kill。`pgrep -P` 递归取进程树（bash→pnpm→sh→start.mjs→dsh），`ss -ltnp` 过滤树内 pid：mock 与 real 各**恰好 1 行** `LISTEN 127.0.0.1:<port>`，非 loopback 行 = 0（mock-ss.txt、real-ss.txt） |
| ③ 缺 key 非零退出报变量名；mock 不查 key 可注入 patch；逻辑在 src/start.ts | PASS | `env -u P2SDK_LLM_API_KEY pnpm -C app/sdk start` → exit 1，stderr `p2sdk: P2SDK_LLM_API_KEY is not set: …`（start-nokey.err）。mock 模式无 key + `P2SDK_PATCH=/tmp/t01-extra.yml` → ready 正常；反证：`P2SDK_PATCH=/tmp/t01-nonexistent.yml` → dsh 报 `failed to read overlay … ENOENT`、无 ready、exit 1（/tmp/t01-neg.log，证明 --patch 真被加载）。启动逻辑全在 `src/start.ts`（233 行），`scripts/start.mjs` 为单行 import 入口（代码核对） |
| ④ D2 钉定命令真模型一次 | PASS | `P2SDK_HOME=<real home> pnpm -C app/sdk exec node examples/min-client.mjs "你好"` → **exit 0**：`assistant chunks: 153`、text 非空（中文回复）、`turn end: true reason=completed`、`min-client PASS`（d2-real.out）。key 经 `P2SDK_LLM_API_KEY="$LITELLM_MASTER_KEY"` 环境引用注入，未打印未落盘；模型别名 `glm-5.3-flash` 经 `/v1/models` 实测存在。自断言（≥1 chunk 早于 turn end、有 turn end、非空 text-delta、reason≠error）内置于脚本，exit 0 即全过 |
| ⑤ ready 行与日志无 launch token | PASS | mock 与 real 两轮日志：token 值 grep **0 命中**、字面 `token=` **0 命中**（追加检查：API key 值也 0 命中）；`.dsh/launch-token`、`base-url` 权限均 **0600**（mock-token.txt、real-ss.txt）。ready 行格式 `[p2sdk] ready http://127.0.0.1:<port>`，无 token |
| ⑥ devDeps + 市场包钉齐 + 覆盖率 80% 只计 src/ | PASS | package.json：dsh-llm-replay/vitest/@vitest/coverage-v8 为 devDeps，dsh-plugin-market、dsh-plugin-manager、dsh-mcp-client 已在 dependencies，全部精确版本（setup 输出逐条列出）。`pnpm test:coverage`：**24/24 通过**，src/ 仅 start.ts：Stmts 94.18 / Branch 88.46 / Funcs 86.95 / Lines 98.64，阈值 80% 由 vitest.config.ts 强制，exit 0（coverage.out） |
| ⑦ /usr/bin/time -v 记 setup 耗时与峰值内存 | PASS | 本机干净复跑：**1.79 s / 861,004 KB**；/tmp 新 clone：**1.90 s / 872,908 KB**（store 命中；builder D1.md 另有冷装 91.12 s / 1,013,680 KB）。setup-local.time、setup-tmp.time |
| ⑧ 共享 launcher + mock 模式 min-client 自断言 | PASS | `tests/support/runtime.ts`：mkdtemp `P2SDK_HOME`、mock provider spawn `scripts/start.mjs`、经 `examples/lib` 返回已连接客户端、`release(gateId)` touch `$P2SDK_HOME/gates/<id>`（代码核对）。verbose 复跑 e2e：`min-client self-assertions pass under the mock provider` ✓、`release(gateId) touches the barrier file without opening a port` ✓ 等 6/6 通过（e2e-verbose.txt），且覆盖率达阈值的整套 run 也含此测试 |

## 坏路径（派发步骤 3）
- 缺 `P2SDK_LLM_API_KEY`：见 ③，exit 1 + 变量名。
- 非 loopback 监听：mock 与 real 两轮进程树 `ss` 判据均为 0 行（见 ②）。
- 追加反证：坏 patch 路径启动失败（见 ③）。

## 两个裁定（派发步骤 4）

**裁定① pnpm-workspace.yaml 超出派发区域清单 —— 追认（附实证）。**
探针：把 app/sdk 复制到 /tmp/t01-nows 并删去 pnpm-workspace.yaml（package.json 的 `pnpm.onlyBuiltDependencies` 保留），`pnpm install` → `[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: @deepseek-ai/dsh-subprocess-local, @google/genai, koffi, node-pty, node@24.22.2, protobufjs`。结论：**pnpm 11.0.9 完全忽略 package.json 里的 `pnpm.onlyBuiltDependencies`，allowBuilds 只能落 pnpm-workspace.yaml**，builder 的理由成立；且没有它 node@24.22.2 与原生依赖的构建被跳过，⓪/② 直接挂。文件内容只有 6 行构建许可，属 install 配置（与 lockfile 同族），区域约定里也只有 T-01 会碰它，无合并冲突面。追认，建议主会话在 PLAN §3 区域约定补记 `app/sdk/pnpm-workspace.yaml` 归 T-01。附带发现：package.json 的 `pnpm.onlyBuiltDependencies` 块在 pnpm 11 下是死配置（见新问题 FIX-1）。

**裁定② repos/ 判据字面不可能成立 —— 接受 builder 按意图执行。**
仓库跟踪 `repos/Compare.md` 与 `repos/MANIFEST.tsv`，故「repos/ 不存在或为空」在本仓库形态下永假。判据意图（§4 D1③「setup 不读写 repos/」）我已独立复核：/tmp clone 的 repos/ 仅两个文档、无源码目录；setup 前后整树 git clean；node_modules 中指向 repos/ 的 symlink = 0；package.json 与 pnpm-lock.yaml 无任何 repos/ 引用；安装流量全部走 npm store/registry。接受 evidence/D1.md 的解释，建议 PLAN 把该句改成「repos/ 下无源码目录且 setup 前后无变化」。

## 新问题（均不阻塞，可并成一个小清理任务）
- [FIX] package.json `pnpm.onlyBuiltDependencies` 是 pnpm 11 下的死配置（探针实证被忽略，真实生效的只有 pnpm-workspace.yaml） | 复现：/tmp 复制 app/sdk 删 pnpm-workspace.yaml 后 install 报 ERR_PNPM_IGNORED_BUILDS | 疑似位置：app/sdk/package.json:33-42 | 严重度 LOW（双份配置易误导后来者，删掉或加注释指回 workspace 文件）
- [FIX] start 失败消息误导：dsh 子进程秒崩时也打印 "no ready line within 60000ms"，读起来像等满了超时 | 复现：P2SDK_PATCH 指向不存在文件，日志先出现 ENOENT 崩溃栈、后出现 60000ms 超时句 | 疑似位置：app/sdk/src/start.ts:227（main 的 ready=false 分支不区分早退与超时） | 严重度 LOW（不影响判定，排查时费神）

## 备注
- 验收期间机器 load ≈ 4.2（GPU 训练中），全部命令串行执行。
- 交付文件相对区域清单的其余出入：`tests/unit/start.test.ts`、`tests/e2e/mock-demo.test.ts` 未逐字列入区域，但 ⑥ 的覆盖率阈值与 ⑧ 的 launcher 判定必然要求测试文件存在，vitest.config.ts 的 include 也已声明，视为 ⑥ 的应有之义，不记违规。`.npmrc` 未交付：pnpm 11 认 devEngines，无需回退（捷径里写明「pnpm 不认时」才需要）。
- 真模型 runtime 与 mock runtime 验收后均已按 PID 精确回收，无残留进程；探针目录 /tmp/t01-nows 已删，/tmp/t01-verify 保留（复测用）。
