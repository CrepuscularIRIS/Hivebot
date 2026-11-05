# VERIFY P6-17.f1

> 转正自 evidence/P6-17f1/VERIFY.txt。

verdict: PASS
commit: acec699bdce40acef59abc4f9197764ced9575e9
验收范围：用户指定 P6-17.f1 快验；不以 PLAN 过时的「3 条/全量 78」替代本次范围。

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
| --- | --- | --- |
| 恰 1 测试文件 +6 行，产品零触碰 | PASS | git -C /tmp/bot-wt/P6-17f1 diff ae41ce7..HEAD --numstat；输出 6 0 app/ui/tests/e2e/p6-stuck.spec.ts；diff-vfy.txt |
| 骨架在 SDK 启动前 | PASS | 已读 launchReal 全流程：p6-stuck.spec.ts:47 从临时 home 派生 dataDir；52 mkdirSync、53 同步写 {version:1}；54 才 await launchSdkRuntime，且显式 P2SDK_ORCH_DATA_DIR=dataDir；56 才 session/create；59 保留主身份整写，60 才启动壳 |
| pnpm test:e2e p6-stuck → 2 passed | PASS | stuck-vfy.log：两条分别 11.2s、16.9s；2 passed (28.8s) |
| 抽一条既有 p6-workers | PASS | workers-vfy.log：P6-16 两侧 transcript 一条；1 passed (13.4s) |
| 额外坏路径 | PASS | workers 用例实际包含 Ghost 创建失败（Couldn't message Ghost、无可点击按钮，spec:244、257–258），以及恶意 HTML/Markdown 结果按纯文本呈现（274、289–291）；本次独立运行全部通过。stuck 第二条还实际执行 Failer error 收尾与 Failed 行断言 |
| 真实窗口截图 | PASS | stuck-worker-dock-vfy.png、stuck-failed-row-vfy.png；均为本次 e2e page.screenshot 的目标 Electron 页面，不是全屏截图，已用 Read 打开亲眼核对 |
| HEAD 稳定、工作树无修改、残留检查 | PASS | 测试后 rev-parse 仍为上述完整 SHA；git status --short 无输出；bot-reap --dry-run --match P6-17f1 无候选输出，见 reap-vfy.txt |

实际执行命令（日志文件均在本目录）：
1. env HOME=/tmp/bot-P6-17f1-vfy/home TMPDIR=/tmp/bot-P6-17f1-vfy/tmp DBUS_SESSION_BUS_ADDRESS=unix:path=/tmp/bot-P6-17f1-vfy/nonexistent-bus PBOTS_E2E_NO_XVFB=0 pnpm -C /tmp/bot-wt/P6-17f1/app/ui test:e2e p6-stuck
   输出尾部：2 passed (28.8s)，退出码 0。
2. env HOME=/tmp/bot-P6-17f1-vfy/home TMPDIR=/tmp/bot-P6-17f1-vfy/tmp DBUS_SESSION_BUS_ADDRESS=unix:path=/tmp/bot-P6-17f1-vfy/nonexistent-bus PBOTS_E2E_NO_XVFB=0 pnpm -C /tmp/bot-wt/P6-17f1/app/ui test:e2e p6-workers --grep 'P6-16 两侧 transcript'
   输出尾部：1 passed (13.4s)，退出码 0。
3. /home/lingxufeng/bot/scripts/bot-reap --dry-run --match P6-17f1
   输出为空，无需手工结束进程。仅测试自身 teardown 管理自己启动的 SDK/Electron 子进程。

隔离说明：该基点 run-e2e.sh 尚未含 DBus 守卫，因此命令额外显式注入不存在的 DBus socket；经 pnpm 入口使用本地 Playwright 和 Xvfb，未裸 sh/直接启动主屏。HOME 与 TMPDIR 均临时隔离。未修改产品、测试或运行脚本；本次只验测试修复，使用工作树已有 build，未跑全量回归。
截图核对：第一张看到 Test fixer 被选中、From Main Bot 任务、git push origin docs 审批 dock 和 Allow once/Deny once；第二张看到 Main Bot、Asker/Runner/Failer/Unreader 四行及 Failer 的 Failed: push rejected by remote、4 worker updates 合批卡。

新问题（每条一行，可直接成为修复任务）：
- 无。PLAN 条数陈旧已由用户快验口径明确为 2，不作为本修复失败项。

报告按当前 agent 禁写报告 .md 的约束落在用户指定的 evidence/P6-17f1/VERIFY.txt 备用位置。
