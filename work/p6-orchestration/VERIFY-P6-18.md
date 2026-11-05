# VERIFY P6-18

> 转正自 evidence/P6-18/VERIFY.txt。

verdict: PASS
commit: bc86f2e880124325a2377fe8e77cc818036975f9
任务：P6-18；分支 feat/P6-18；工作树 /tmp/bot-wt/P6-18；基点 ae41ce7。
本会话禁止写报告 .md，故使用授权备用路径 evidence/P6-18/VERIFY.txt，供主会话转正。
证据目录 E=/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-18。

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
| 1. notify 单测 11、UI 单测 490、定向 e2e（notify + workers 两条） | PASS | E/vfy-notify.log：1 file / 11 passed；E/vfy-ui.log：43 files / 490 passed；E/vfy-e2e.log：3 passed (35.3s)。先独立重建，E/vfy-build.log，退出0 |
| 2. 同 eventId 恰1次、完成类不发、聚焦不发、非 worker 不发、点击回调对应 worker | PASS | 自己复跑 worker-notify.test.ts 全11条；①重投 eventId 后工厂长度1且 show计数1；③聚焦两轮0，blur后1；④cancel后两轮0；⑤主bot0；⑦点击 restore/focus 各1，openWorker恰1且参数WORKER，销毁后迟到点击不抛且不再调用 |
| 2b. Xvfb 死总线降级、不重试不崩（额外坏路径） | PASS | 原 p6-notify.spec 已跑绿；独立 E/guard.spec.ts 去掉 spec 自带 DBus 覆盖再跑：E/guard-e2e.log 输出 supported=true、shown恰1、failed恰1、二者eventId相同、3秒后不增、readErrors=0；页面执行21*2===42 |
| 3. run-e2e.sh +4行守卫只作用 Xvfb，不影响真实桌面入口；无通知泄漏 | PASS | E/vfy-scope.txt；E/guard-branches.py 实际执行脚本、仅将外部可执行程序stub：NO_XVFB=0覆盖为死路径、=1保留sentinel地址（E/guard-branches.log）；真实Xvfb探针由守卫注入地址，Electron内assert完全相同，strace连接追踪见E/guard-connect.trace与E/guard-connections.txt |
| 4. index.ts 仅接线，renderer无消费者按约定后续消费 | PASS | E/vfy-scope.txt：index实际+4行（import、注释、调用、空行），无其他变更；全main/preload/renderer/renderer-grok源码检索pbots:open-worker仅命中index.ts发送行；不把renderer消费计为本次缺口 |
| 5. p6-stuck既有两红归属记录 | PASS（归属说明） | builder E/REPORT.txt:39–41记录ae41ce7干净树两条create_bot result超时；主仓PLAN.md P6-17.f1明确unknown→隐藏create_bot及SDK/UI数据目录分裂，和基点p6-stuck.spec.ts:44–53（SDK用dataDir，UI写home/data/bots.json）互证；按派发不额外重跑stuck |

真实执行命令（非采用 builder 输出）：
cd /tmp/bot-wt/P6-18/app/ui
export HOME=/tmp/bot-p618-vfy-home PATH="$PWD/node_modules/.bin:$PATH"
vitest run tests/unit/notify/ > "$E/vfy-notify.log" 2>&1
vitest run > "$E/vfy-ui.log" 2>&1
pnpm build > "$E/vfy-build.log" 2>&1
sh scripts/run-e2e.sh tests/e2e/p6-notify.spec.ts tests/e2e/p6-workers.spec.ts > "$E/vfy-e2e.log" 2>&1
上述四步用&&串联执行，后台任务最终exit 0。build尾部：✓ built in 1.18s；shim ✓ built in 82ms。包含既有动态导入及bundle警告，不是构建失败。

守卫独立探针：
python -I "$E/make-guard-probe.py"
# 由原spec派生，仅改绝对import、去掉自身DBus覆盖、加继承地址assert和真实UI点击/截图。
PBOTS_E2E_NO_XVFB=0 strace -f -e trace=connect -s 256 -o "$E/guard-connect.trace" sh scripts/run-e2e.sh -c "$E/guard.config.ts" > "$E/guard-e2e.log" 2>&1
python -I "$E/guard-branches.py" > "$E/guard-branches.log"
python -I "$E/check-connections.py" > "$E/guard-connections.txt"
真实guard e2e：1 passed (14.3s)，exit 0。
Electron主进程PID 1649921读取的地址为unix:path=/tmp/bot-wt/P6-18/app/ui/.build/e2e-dead-bus；connect实际返回ENOENT。
全追踪进程树无/run/user/<uid>/bus、dbus-*会话socket连接；观察到Chromium子进程连接/run/dbus/system_bus_socket，因此本结论限定为“没有通知会话总线泄漏”，不声称“没有任何系统DBus活动”。
双分支stub探针首次因探针自身shift 3误吞playwright而失败，改为匹配脚本实参的shift 2后两分支assert通过；未改run-e2e.sh或产品代码，未在真实桌面启动应用。

截图与浏览器操作：
按playwright-cli skill的Playwright测试路径，真实Electron页面点击Stuck worker侧栏行，断言Local tool permissions可见后用page.screenshot仅截目标页面；所有实际e2e均经新守卫run-e2e.sh/Xvfb，没有MCP或全屏截图。
E/guard-worker.png 已用Read打开亲眼确认：左侧Main Bot与Workers下Stuck worker（橙色等待点），标题Stuck worker；会话有From Main Bot任务“Publish the docs.”与Bash git push origin docs；底部Computer审批dock含Deny once和Allow once。不是用户编辑器或桌面。

范围与不可证边界：
- 本次证据证明通知尝试与无守护降级，不证明真实桌面OS弹窗的外观、真实通知守护click事件投递；点击到openWorker(botId)依派发以单测⑦为证。
- pbots:open-worker renderer消费按派发归P6-16后续，不纳入本次PASS承诺。
- p6-stuck基点两红为builder复现记录，不冒称本验收独立复跑；本次仅核对代码形态与P6-17.f1根因一致。
- 未运行SDK全量或全套e2e；UI全490为派发明确指定。
- 未改产品源码或任务测试；探针与报告只写主仓evidence，测试自身既有输出在gitignored目录；验收结束HEAD仍为上述完整SHA，工作树git status --short为空。
- 临时HOME隔离。未手工kill任何进程；原测试finally关闭自己启动的Electron与runtime。
- 结束前 /home/lingxufeng/bot/scripts/bot-reap --dry-run --match p618，exit 0，E/vfy-reap.txt为空，无匹配残留。

新问题（每条一行，可直接成为修复任务）：
- 无本次范围内阻塞问题，无新增[FIX]。
