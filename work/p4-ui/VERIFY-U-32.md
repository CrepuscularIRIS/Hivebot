verdict: PASS
commit: 4af3c9b605e12787881707508f18551c94275ffa（feat/U-32 @ /tmp/bot-wt/U-32，基 0025559；验收期间无漂移，验收终态复查仍为该 SHA）

环境：HOME=/tmp/bot-vfy-u32（临时 HOME）；e2e 全程 Xvfb（xvfb-run -a --server-args="-screen 0 1600x1000x24"），用户桌面零弹窗。全部证据文件在 work/p4-ui/evidence/U-32/。

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| 构建 | PASS | `pnpm -C app/ui build` → `✓ built in 1.07s`（renderer 1236.96 kB） |
| 单测全量 | PASS | `pnpm -C app/ui exec vitest run` → `Test Files 27 passed (27)` / `Tests 224 passed (224)`，含新增 creds 引号/注释/export 形态与 shellChildEnv 用例（4s 内） |
| e2e 全量（Xvfb） | PASS | `xvfb-run -a … playwright test --workers=1` → `54 passed (5.1m)`，本轮零 flaky、零重试（NewBotDialog 族本轮未触发，见新问题 1） |
| O1+O3 creds 解析 | PASS | 独立实测（非只看测试）：esbuild 编译 worktree 的 creds.ts 后自构 18 种 .env 变体（虚构键 VFY_FAKE_KEY_X）直调 `envOrDotenv`——双/单引号、空白+# 行内注释、export 前缀、行首空白、引号内 # 、引号后注释、CRLF、tab 注释、空值/空引号/纯注释→undefined、KEY2 前缀不误配、未闭合引号不崩溃、env 优先语义不回归，18/18 全过。evidence/U-32/{o1o3-probe-creds.txt, probe-creds.mjs} |
| O2 事件屏障 | PASS | settings.spec.ts 终局断言前轮询 main 侧 `__pbotsDsh.apiCount`（connect.ts:72/181 既有观测面，无新 IPC）至 base+6，超出即 fail loud；原 `waitForTimeout(3_000)` 已删，非拉长固定等待（残余 500ms 仅覆盖 RPC 已发出后的回包尾程）。反向自证：摘 NewBotDialog.tsx:54 守卫 → build → 单跑必红（14 拍 unchecked，round1 迟到回调翻回 p2-alpha 被终局断言抓住）；恢复 → rebuild → 绿（6.6s）；终态 diff 零产品代码、工作树净。evidence/U-32/o2-reverse-selfcheck.txt |
| O4 launchShell 剥凭证 | PASS | launch.ts env 改 `shellChildEnv(home, opts.env)`（sdk-env.ts 复用 SANDBOXED_CREDENTIAL_KEYS 副本剥离）；独立直测 shellChildEnv（fake 值注入 worker env）：返回 env 无 5 个凭证键、HOME/XDG_*/PBOTS_DATA_DIR/extra 照常、PATH 不误删、worker process.env 原值未动（sdk-runtime 语义不回归）16/16；grep 全 tests/support 仅 sdk-env.ts:20 一处 `{...process.env}`，两条子进程路径同口径。evidence/U-32/{o4-probe-shell-env.txt, probe-shell-env.mjs} |
| 区域 | PASS | `git diff 0025559..HEAD --stat` = 仅 app/ui/tests/ 6 文件（+140/−17），`--name-only | grep -v "^app/ui/tests/"` 0 行；renderer/main/app/sdk 一行未动；验收终态 `git status --porcelain` 0 行（e2e 刷新的 evidence png 已 `git checkout -- work/` 还原，与 REPORT 新发现 3 同因） |

凭证纪律：所有探针用虚构键值（VFY_FAKE_KEY_X / vfy-fake-*），未读取、未打印任何真实凭证；探针脚本与输出只落 evidence/U-32/。

REPORT-U-32.md 尾部 3 条新发现评估：
1. NewBotDialog 族高负载系统性超时——**真实**。落点核实：app/ui/tests/support/ui.ts:73 `check({ timeout: 15_000 })`（createViaDialog）；builder 4 红均此签名且单跑绿 + 0025559 基线绿。本人本轮 Xvfb（load≈2.7–3.4）54 全绿未复现，与「高负载才触发」一致。见新问题 1。
2. 真实显示跑 e2e 弹 Electron 窗口——**真实**但已有归属任务 U-33（PLAN:49，Xvfb 默认化），不重复立项。
3. e2e 刷新 work/ 下 evidence png——**真实**，本人验收中独立复现（9 张 PAB png 变脏，已还原）。影响仅工作区卫生，低严重度。见新问题 2。

新问题（每条一行，可直接成为修复任务）：
- [FIX] NewBotDialog 族 e2e 高负载（load≈3.3）系统性 15s check 超时 | 复现：高负载时全量 e2e，4 次/2 轮卡 ui.ts:73 `[data-preset-option] input` check；单跑均绿 | 疑似位置：app/ui/tests/support/ui.ts:73（超时偏紧）或 agentPresets/list 高负载慢 | 严重度 low（已知 flaky，最终轮全绿）
- [FIX] e2e 运行会把 work/p4-ui/evidence/ 下被引用的期望截图刷新脏（本轮 9 张 PAB png，需手工 git checkout 还原） | 复现：跑全量 e2e 后 `git status` 见 work/ 下 png 全 M | 疑似位置：app/ui/tests/e2e/visual.spec.ts 截图输出路径直接指向仓内 evidence/ | 严重度 low（工作区卫生，无产品影响）
