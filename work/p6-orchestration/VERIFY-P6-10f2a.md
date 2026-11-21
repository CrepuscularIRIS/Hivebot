# VERIFY P6-10.f2a

> 转正自 evidence/P6-10f2/VERIFY-f2a.txt。主会话裁定：PLAN 行三条验收（shuffle 全绿/探针无路径/计数不降）全 PASS，整体按 PASS 合并；verifier 标 FAIL 的第⑤项是对 builder 范围外发现的复核（guard-fs 顺序依赖复现不出），非 f2a 缺陷，记为待观察。

verdict: FAIL
commit: 8cd02406a69085a2645b1f77398a5360493b2d79
任务：P6-10.f2a；分支 feat/P6-10f2；验收 worktree /tmp/bot-wt/P6-10f2。
说明：实现相关验收①–④全部 PASS；总判 FAIL 仅因为⑤要求确认的范围外 shuffle 失败未能独立复现，不能将 builder 的归因当作已证事实。未发现本次改动的 CONFIRMED 产品缺陷。
报告使用 txt：本会话更高优先级指令禁止写报告 .md，按 evidence 文本路径落盘。

| 验收项 | 结果 | 证据（命令/文件） |
| ① details / warn 脱敏 | PASS | HOME=/tmp/bot-p610f2a-verify/home node /home/lingxufeng/bot/work/p6-orchestration/evidence/P6-10f2/probe-f2a-redact.mjs；exit 0；f2a-vfy-redact.log |
| ① 自造三层对象及数组中的字符串 | PASS | 同 HOME 执行 node .../f2a-vfy-deep.mjs；exit 0；f2a-vfy-deep.log；one.two.three.leaf / list[0] / list[1].four[0] 精确等于 <path>/sessions/deep.json 形态，输入不变、number/null/boolean 保留 |
| ① 原泄漏断言反向红基线 | PASS | 同 HOME 执行 node .../vfy-extra.mjs；exit 1，恰在 :51 的 assert.ok(JSON.stringify(ce.details).includes(secretPath)) 失败；f2a-vfy-red-baseline.log；此前 A2 三次 malformed response 容量均归零、第四次创建成功，strict 子进程及真实 ENOTDIR 均通过 |
| ② shuffle seed=61102 | PASS | sdk 包内 pnpm exec vitest run U1 U2 U3 LIVE --sequence.shuffle --sequence.seed=61102；exit 0，4 files / 108 passed；f2a-vfy-shuffle-61102.log |
| ② 新 seed=61129 | PASS | 同上 seed=61129；exit 0，4 files / 108 passed；f2a-vfy-shuffle-61129.log |
| ③ 定向 97/97 | PASS | sdk 包内 pnpm exec vitest run U1 U2 U3；exit 0，3 files / 97 passed；f2a-vfy-targeted-97.log |
| ③ create-live 有序 11/11 | PASS | sdk 包内 pnpm exec vitest run LIVE；exit 0，1 file / 11 passed；f2a-vfy-ordered-11.log |
| ④ diff / 接线 / barrel / 恢复用例 | PASS | f2a-vfy-scope.log：git diff --stat 132edd7..HEAD 为 4 files +113/-20；index.mjs 对原分支基点 29c6b1a 无 diff；main-channel 本次只新增递归脱敏及接入 details，未改 constructor、create 注册位置或 P6-11 send 注册区域；P6-11 在 main 的两行注册和 barrel 导出仍须由主会话合并保留。foundation.test.ts 中早期恢复的 2+4 共六条用例确实在分支，本次 f2a 未再改它 |
| ⑤ 范围外 guard-fs shuffle 失败及归因 | FAIL（未复现，证据缺口） | 分支 seed=61102/61129/7 均 9/9；基点 132edd7 seed=61102/7 均 9/9。完整证据见 f2a-vfy-guard-*.log。可以确认 guard-fs 及所查 policy/profile/support/start/scripts 无本次 diff，但不能据此确认 builder 的“既有 within-file 顺序依赖”说法 |

命令展开与环境：
- 测试命令 cwd=/tmp/bot-wt/P6-10f2/app/sdk，HOME=/tmp/bot-p610f2a-verify/home。
- U1=tests/unit/orchestration-create.test.ts
- U2=tests/unit/orchestration-foundation.test.ts
- U3=tests/unit/orchestration-foundation-delivery.test.ts
- LIVE=tests/unit/orchestration-create-live.test.ts
- 实际 node --version 为 v22.23.4，Vitest 为 5.0.5。不是沿用 builder 的 node 24 输出。
- 未跑全量回归、未跑整套 e2e、未改产品代码；此任务无 UI 变更，无 UI 截图项。
- 每份上述日志与脚本均位于 /home/lingxufeng/bot/work/p6-orchestration/evidence/P6-10f2/。

① 输出摘录：
PASS f2a details redacted: {"step":"session/create","code":"storage","details":{"path":"<path>/sessions/worker.json","nested":{"cause":"ENOTDIR <path>/sessions/worker.json"},"peers":["<path>/sessions/worker.json"]}}
warn 的 tool.output.render 输出文本只含 rename failed: storage ENOTDIR rename <path>/sessions/worker.json，无原绝对目录。
自造深嵌套输出：{"one":{"two":{"three":{"leaf":"ENOTDIR '<path>/sessions/deep.json'","list":["<path>/sessions/deep.json",{"four":["<path>/sessions/deep.json",17,null,false]}]}}}}

⑤ 对照方式与限制：
- guard-fs 原测试硬编码 HOME=/home/lingxufeng/bot/.test-homes/p5-02，不能仅靠命令行 HOME 隔离。为遵守临时 HOME，本次不原地修改它，而由 f2a-vfy-guard-setup.mjs 在 evidence 下生成两份探针副本，只替换 TEST_HOME、PKG_ROOT 与 import 锚点，测试体与断言不变。
- 基点通过 git archive 132edd7 app/sdk 解到 /tmp/bot-p610f2a-verify/base；复用本分支 node_modules，无安装、无产品树修改。
- 生成命令：HOME=/tmp/bot-p610f2a-verify/home node /home/lingxufeng/bot/work/p6-orchestration/evidence/P6-10f2/f2a-vfy-guard-setup.mjs。
- 分支命令：在分支 sdk 包下，HOME=/tmp/bot-p610f2a-verify/home pnpm exec vitest run --config /home/lingxufeng/bot/work/p6-orchestration/evidence/P6-10f2/f2a-vfy-guard-branch.config.mjs --sequence.shuffle --sequence.seed=61102（另跑61129和7）。全部 9 passed。
- 基点命令：cd /tmp/bot-p610f2a-verify/base/app/sdk && HOME=/tmp/bot-p610f2a-verify/home TMPDIR=/tmp/bot-p610f2a-verify/tmp node node_modules/vitest/vitest.mjs run --config /home/lingxufeng/bot/work/p6-orchestration/evidence/P6-10f2/f2a-vfy-guard-base.config.mjs --sequence.shuffle --sequence.seed=61102（另跑7）。均 9 passed。
- 基点首次尝试 pnpm exec 时，pnpm 因快照 symlink 的依赖元信息触发 install 检查，并以 NO_TTY 拒绝；没有运行到测试。日志 f2a-vfy-guard-base-61129.log 保留，后续改直接 node 调用已有 Vitest，不放宽权限、不重新安装依赖。
- 两份原始 guard-fs 源码 sha256 均为 50c8cf9aa76312ff20e25c8efaed3f04469ee7edc15a02e35f5c8b0ee323d353。
- 本次定向结果既不能复现“20红/7文件”，也不能覆盖 builder 的全量并发环境；遵守“不跑全量”约束，未为追该范围外说法启动41文件回归。

新问题（每条一行，可直接成为修复任务）：
- [FIX] 范围外 guard-fs shuffle 失败的复现证据待补，尚不能确认“既有 within-file 顺序依赖”；builder 报告称全量41文件20红/7文件，但独立单文件分支61102/61129/7与基点61102/7均9/9 | 复现：执行上述临时HOME探针均绿；请补原始失败完整命令、seed、日志及最小相关文件组合后再归因 | 疑似位置：/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-10f2/REPORT-f2a.txt:53-57、/tmp/bot-wt/P6-10f2/app/sdk/tests/e2e/guard-fs.test.ts | minor（证据缺口；未确认代码缺陷；是否立任务由主会话决定）

进程卫生与提交稳定性：
- 结束前执行 /home/lingxufeng/bot/scripts/bot-reap --dry-run --match p610f2，exit 0、无输出；见 f2a-vfy-hygiene.log，无本任务匹配残留。没有手工 kill、pkill、sudo、重启或注销操作；崩溃/重启测试只由原测试脚本操作自己启动的 SDK 子进程。
- 结束时 HEAD 仍为 8cd02406a69085a2645b1f77398a5360493b2d79，git status --short 为空，见 f2a-vfy-scope.log。
