# REVIEW P6-15.f1 · 方向 B（并发、幂等与状态同步）

> 转正自 evidence/P6-15f1-vfy/REVIEW-B.txt（txt 兜底，未经改写）。

P6-15.f1 · 方向 B：并发、幂等与状态同步
commit: 2746c311baeed86b6acb62dbdbb2f35112c9765a
parent: 5930660
结论：本方向无 CONFIRMED（本次变更新引入的问题）。critical 0 / major 0 / minor 0。
报告使用 TXT，遵守本会话不写报告类 .md 文件的约束。

审查范围
仅目标提交 data.ts 的 askPendingOf 抽取、eventId miss 行为及 setActive 重推分组；阅读 workers.ts、notice-view.tsx、reduceFollow、chat-header 激活调用和必要 carrier/coordinator 接线。CSS/测试差异仅按任务要求核对。未跑全量回归或全套 e2e。

REFUTED | severity: — | app/ui/renderer-grok/shim/src/data.ts:35-50,277-284 | 同一 eventId 同时出现在 approval/asked 和 $events，重复 request/cancel，或两个不同 id 关联同一 callId | 实测 decided 经 onFollowItem 删除 asks 对应项，两个身份查询都变 false；重复 cancel 不复活状态；worker rank 回到 4。没有复现收敛后的一个已答、一个仍待答 | /tmp/vfy-r-p615f1-b/probe.test.ts

边界实测（非本次回归）：cancel 先于 approval/decided 到达时，askPending 暂时仍从 view 读出 true，而 sidebar rank 已为 4；后续 decided 到达后 pending=false、rank=4。用父提交与本提交分别跑同一差分探针，结果完全相同：
5930660 {"transient":{"pending":true,"rank":4},"settled":{"pending":false,"rank":4}}
2746c31 {"transient":{"pending":true,"rank":4},"settled":{"pending":false,"rank":4}}
该双流传播窗口客观存在，不能声称两路帧之间完全原子；它不是此次抽取新增的问题，也没有在该探针中持续到 settled 状态。探针 /tmp/vfy-r-p615f1-b/differential.test.ts，日志 differential.log。

REFUTED | severity: — | app/ui/renderer-grok/shim/src/data.ts:41-50,178-185,580-588；overrides/modules/notice-view.tsx:71-74 | 旧回报 eventId 两路 miss，但 worker 有另一条新审批；同时打开 worker 将其设为已读 | 旧 id=false，新 audit/gateway id=true；打开后 worker rank 仍为 0，不因已读消掉待审批。历史回报显示 Answered、worker 当前显示 Needs attention 是不同审批身份，不是同一 ask 状态冲突 | /tmp/vfy-r-p615f1-b/probe.test.ts

REFUTED | severity: — | app/ui/renderer-grok/shim/src/data.ts:580-588,617-624；workers.ts:101-109 | leave、finish（turn/end+$events status）、main report 三动作全排列；随后重复打开、重复 idle 状态、离开与重进 | 6 个排列全部通过。先离开再结束保留未读并留 Workers；先结束再离开进入 Done；重进已读 worker 一律回 Workers，重复 setActive 不增加 section 通知，active 时再次 idle 不将其送入 Done。main report 不覆盖 active/order/summaries | /tmp/vfy-r-p615f1-b/probe.test.ts

REFUTED（本次受测负载下未复现） | severity: — | app/ui/tests/e2e/p6-workers.spec.ts:93-101；tests/e2e/market.spec.ts:104 | 真实 Electron、CPU 8 倍降速、亮暗切换后仍按原实现等待 600ms | 本任务两条真实 e2e 全通过（29.8s）；14 次主题检查均未观察到仍 running 的 CSSTransition，Deny once 亮暗对比度断言通过。market 同样使用固定 600ms，并无更强的完成判据。本结果只覆盖此次 8x 探针，不外推保证所有机器/所有负载永不 flaky | /tmp/vfy-r-p615f1-b/probe.spec.ts

执行方法与输出
1. python -I /tmp/vfy-r-p615f1-b/make-probes.py
   从目标源码生成临时副本，仅把相对 import 改为绝对路径，并将闭包内 onFollowItem/onEventsItem/loadRoster 暴露给探针；产品文件未修改。分组、审批逻辑使用原实现。
2. cd /home/lingxufeng/bot/app/ui && HOME=/tmp/vfy-r-p615f1-b/home ./node_modules/.bin/vitest run --config /tmp/vfy-r-p615f1-b/vitest.config.mjs --reporter=verbose
   Test Files 1 passed (1) / Tests 4 passed (4)
3. HOME=/tmp/vfy-r-p615f1-b/home ./node_modules/.bin/vitest run tests/unit/grok-shim/workers.test.ts
   Test Files 1 passed (1) / Tests 23 passed (23)
4. python -I /tmp/vfy-r-p615f1-b/compare-parent.py
   HOME=/tmp/vfy-r-p615f1-b/home ./node_modules/.bin/vitest run --config /tmp/vfy-r-p615f1-b/differential.config.mjs --reporter=verbose
   Test Files 1 passed (1) / Tests 1 passed (1)
5. HOME=/tmp/vfy-r-p615f1-b/home pnpm build
   成功后才执行下述 e2e（避免旧 dist 假绿）。
6. HOME=/tmp/vfy-r-p615f1-b/home NODE_PATH=/home/lingxufeng/bot/app/ui/node_modules pnpm exec sh scripts/run-e2e.sh -c /tmp/vfy-r-p615f1-b/playwright.config.cjs
   2 passed (29.8s)，THEME-PROBE 的 14 行均为 []。
   仅复制本任务 p6-workers.spec.ts 到临时目录，保持真实 SDK/runtime/renderer/helper，增加主题检查时的 CDP 8x CPU 降速及 running transition 观测；未改产品或原 spec。全程 run-e2e.sh 自带 Xvfb，使用 helper 临时 HOME。

截图核验
已用 Read 打开两张 page.screenshot（只含目标 Electron 页面，不是全屏）：
- /home/lingxufeng/bot/work/p6-orchestration/evidence/P6-15f1-vfy/review-b/worker-dock-focused-dark.png：暗色 Doc writer 会话，左侧 Workers 两个 worker，底部审批 dock 的 Deny once / Allow once 可见。
- /home/lingxufeng/bot/work/p6-orchestration/evidence/P6-15f1-vfy/review-b/main-report-single-light.png：亮色 Main Bot，会话内回报卡、Doc writer 的 Answered 行及左侧 Done 分组可见。

证据归档
以上脚本、配置、临时源码副本、build/unit/workers/differential/e2e 日志的持久副本均在：
/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-15f1-vfy/review-b/

清理与提交绑定
测试 helper 已完成 teardown；bot-reap --dry-run --match bot-p615-ws- 及 bot-p615-patch- 无残留匹配，输出保存 cleanup.log。宽泛 p615 匹配到其他会话回归 shell，经 ps 确认后未触碰。没有手工 kill、重启或修改真实 HOME。结束时 HEAD 仍为 2746c311baeed86b6acb62dbdbb2f35112c9765a，app/ui 无工作区改动。
