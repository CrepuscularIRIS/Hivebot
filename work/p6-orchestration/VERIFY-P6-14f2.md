# VERIFY P6-14.f2

> 转正自 evidence/P6-14f2/VERIFY.txt。

verdict: FAIL
commit: 587366007782c2b370579539e8b05164dd0cd375
branch: feat/P6-14f2
worktree: /tmp/bot-wt/P6-14f2
base: 09f627b
验收员：独立复跑；未改产品代码；最终 worktree git status --porcelain 为空。
报告按本会话禁止写报告 .md 的输出约束落到用户指定兜底路径；主会话可转正为 work/p6-orchestration/VERIFY-P6-14f2.md。
下文 E = /home/lingxufeng/bot/work/p6-orchestration/evidence/P6-14f2/vfy/。

| 验收项 | 结果 | 真实证据 |
| 1a review C 身份文件缺失/损坏，0 子会话 | PASS | 自行改造 probe-vfy.mjs；missing/corrupt 两种真实 Loader 运行均 tool subagent 返回 pbots/forbidden，session/list 1→1，live session/agent 仅父会话，子 agent/created 0；E/probe-missing.log、E/probe-corrupt.log。不是相信 builder 的 childEvents 空数组：额外观测真实 live registry 与 agent/created。 |
| 1b review C subagent 改名，创建点 veto、无 started subagent、零子代理执行、job_list 不可达 | PASS | E/probe-rename.log：rvw_delegate 真实注册且父 agent 可见；返回 child session ... denied at creation；原始 session/list 1→2（持久孤儿），live sessions/agents 均仅父会话，子代理 agent/created 0，孤儿日志 events=[]。默认子模型脚本首条是 job_list，但没有子回合也没有工具执行。不能把持久行称为“0 session”；本项按用户指定“无 started subagent/零执行”判 PASS。 |
| 2 三态、createdBy 空、健康主 bot 路径 | FAIL（生产合法形状回归） | E/semantics.log：unknown→restrict 1 层/deny 17 名/执行 deny；empty-createdBy→main/0 restrict/pass；healthy-main（bots:{} 内无该 id）→main/0 restrict/pass。上述三种人工初始态都符合实现。但真实 BotsMetaStore 零 worker 产出的合法文档根本没有 bots 键，被 resolveWorkerStatus 判 unknown；E/store-shape.log 真实 store 写盘 + 真实 guard 拒主 bot create_bot，E/probe-production-main.log 真 Loader 主 bot create_bot 返回 pbots/forbidden。违反 CONTRACT v1.5 可选 bots 语义和“主 bot 正常路径不受影响”。 |
| 3 同步 veto 不只是日志 | PASS | envelope.mjs:258-265、284 回调不是 async，同步 throw。上游 packages/core/session/src/index.ts:1287-1314（1297 收集 listener，1299 明言同步 throw veto，1310-1312 标 failed 并重抛）；已装 dsh-session/lib/types/index.js:1091-1118 同语义。agent-loop attach 源码 index.ts:625-644 在 sessions.announce 之后才 agents.enter/announce，失败 cancel，外层 dispose 通过 detachSession 撤销注册。E/probe-rename.log 真实 live sessions 无孤儿、无子 agent/created、无子日志，证明发布被撤回，不是仅报错仍启动。 |
| 4 定向回归 + faults 19×3 + 旧预期核对 | PASS（测试执行通过，不代表契约无回归） | E/regression.log：6 files / 76 tests passed，exit 0；构成为 envelope unit 32 + 五份 live 合计 44（envelope 8/create 11/send 6/stop 5/report 14）。E/faults.log：throw/missing/definitions-throw 各19 deny、late schedule_create deny、mainBotId collision deny。补跑 E/adjacent-unit.log：5 files /157 tests passed（foundation58/create39/send24/stop16/report20）。两条旧预期翻转逐条见下。 |
| 5 builder 三条新问题评估 | PASS（完成评估，含阻塞发现） | 恢复不撤销：真 Loader E/probe-recovery.log；孤儿：E/probe-rename.log + E/orphan-roster.log；main 启动顺序：真实 store E/store-shape.log，缺失→建立→恢复的真 Loader E/probe-recovery.log，及生产 main/renderer 调用方核对，详见新问题节。 |
| 6 九文件均在区域列 | FAIL（清单缺一文件） | git diff --name-only 09f627b..HEAD 恰9文件；PLAN.md:62 f2 区域只有 envelope.mjs + 测试，其中 index.mjs 不在该行。原 P6-14 行允许 index 追加导出，但 f2 行本身没有写，不能声称“九文件全在 f2 区域”。仅为记账偏差，建议补列；没有发现其他无关产品改动。 |

计数纠偏：用户写“envelope live 8 + 相邻 live 44”。此 HEAD 的全部五份 orchestration-*live.test.ts 总共44，内含 envelope 的8，独立相邻四份为36，不存在另一个44用例集合。本次把这五份全部跑了，没有少跑；未凭空报告8+44=52。builder 报告 send-live 4/4 与实际6也不一致，以本次代码和独立运行计数为准。没有运行全量回归、全套 e2e；未启动 UI，不作截图/视觉验收结论。

一、可重跑命令与输出尾部

1. 定向回归（已执行 exit 0）
cd /tmp/bot-wt/P6-14f2/app/sdk
HOME=/tmp/bot-p614f2-vfy-home ./node_modules/.bin/vitest run tests/unit/orchestration-envelope.test.ts tests/unit/orchestration-envelope-live.test.ts tests/unit/orchestration-create-live.test.ts tests/unit/orchestration-send-live.test.ts tests/unit/orchestration-stop-live.test.ts tests/unit/orchestration-report-live.test.ts
输出 E/regression.log：
  Test Files  6 passed (6)
       Tests  76 passed (76)
    Duration  84.54s (tests 100%)

2. 相邻单测（已执行 exit 0，不是全量）
cd /tmp/bot-wt/P6-14f2/app/sdk
HOME=/tmp/bot-p614f2-vfy-home ./node_modules/.bin/vitest run tests/unit/orchestration-foundation.test.ts tests/unit/orchestration-create.test.ts tests/unit/orchestration-send.test.ts tests/unit/orchestration-stop.test.ts tests/unit/orchestration-report.test.ts --reporter=verbose
输出 E/adjacent-unit.log：Test Files 5 passed (5)；Tests 157 passed (157)。

3. 两绕过探针 + 语义与坏路径（最终严格 set -e 循环全 exit 0）
HOME=/tmp/bot-p614f2-vfy-home node E/probe-vfy.mjs <mode>
mode = missing / corrupt / rename / empty-createdBy / healthy-main / production-main / recovery
E 替换为绝对目录。输出分别 E/probe-<mode>.log。
探针基于 builder probe 独立改造，连接客户端也指向验收 worktree；临时运行根由 mkdtempSync('/tmp/bot-p614f2-vfy-probe-') 派生，运行时状态不落 evidence，finally bot-reap 后删除运行根。
补强：观测 session/created header、agent/created、ctx.sessions.list()/agents.list()；对每个真实新增持久行读取日志并尝试 prompt；断言无子 live registry、无子 agent 创建和无子 turn/tool。
rename 的持久行 agentAvailable=false、blank=true、origin=subagent、parentSessionId=worker；events=[]。
特别纠正 builder 的“resume 会再次 veto”：本次 session/prompt 实际先被上游路由拒为 session/agent-busy（owned by subagent routing），不是 denied at creation。不能把 live⑧ catch 后无 turn 的证据写成“已实测 resume 再次触发 veto”。已实证的是首次创建 veto + 当前公开 prompt 不可复活；安全硬标准仍满足。

4. 故障/三态
HOME=/tmp/bot-p614f2-vfy-home node E/faults-vfy.mjs
E/faults.log：三个故障各19 worker calls denied；每个 late schedule_create denied；missing/bad-json/no-bots deny、empty-createdBy passed、mainBotId collision deny。
HOME=/tmp/bot-p614f2-vfy-home node E/semantics-vfy.mjs
E/semantics.log：unknown restrictLayers=1 denyCount=17 guard=deny；empty-createdBy/healthy-main 均 main、restrictLayers=0 guard=pass。
注意 faults 中 no-bots 的 deny 仅证明实现现状，并非该预期符合产品契约，见主阻塞。

5. 真实生产 store 文档
HOME=/tmp/bot-p614f2-vfy-home /tmp/bot-wt/P6-14f2/app/sdk/node_modules/.bin/node --experimental-strip-types E/store-shape-probe.mjs
E/store-shape.log：真实 BotsMetaStore.init(); patchMainBotId('main-real-store') 落盘 {version:1,mainBotId:'main-real-store',recipes:{}}（无 bots）。resolveWorkerStatus='unknown'；真实 registerEnvelope 对主 bot create_bot 返回 kind=deny。
这是确定性“合法主 bot 被信封拒”的探针，不是猜测。

6. 孤儿可见性（数据投影，不声称浏览器实测）
HOME=/tmp/bot-p614f2-vfy-home node E/orphan-roster-probe.mjs
读取真 Loader 得到的孤儿原始 RPC 行，并核对当前 renderer-grok/shim/src/data.ts:327 仍使用原来的 subagent/parent 过滤表达式；同表达式过滤后0项。E/orphan-roster.log：raw RPC 有孤儿，UI roster projectionCount=0，无 live session/agent，日志0。

二、两条旧预期翻转

A. orchestration-envelope.test.ts 原 registerEnvelope ③（现141行）
旧：文件不存在时 broken.call(worker,subagent) → pass-through。
现：删除此错误放行断言，并在新增⑤（160-180）明确缺失/坏JSON→deny。
判定：缺失/坏JSON这一翻转正确，正是 C-1 的安全根因，普通 read 与健康 m1 调 subagent 的原放行断言仍保留。E/unit-diff.txt 与 E/faults.log/probe-missing.log/probe-corrupt.log 互证。
但新增⑤把合法无 bots 键也列为损坏（175-176），此额外预期错误，不能以 fail-closed 为由认可。

B. 原 registerWorkerRestriction ⑤（现311行）
旧：无 bots.json → restricted=[]。
现：bootstrap 中 w1、m1 都挂 restrict，restricted=['w1','m1']。
判定：未知身份时宁可暂时误伤的翻转符合派发要求；E/semantics.log 实测17名工具收窄，E/probe-missing.log 表层与执行层均闭合。恢复后仍收窄的副作用单列评估，不掩盖。

三、builder 三条新问题：严重度与建议

1. restrict 在身份恢复后不撤销
实证：E/probe-recovery.log 按“文件缺失→session/create→写健康 bots:{}→同会话调用 job_list”运行。恢复后 guard 已不按 worker，但表层 restrict 仍在，模型不可见 job_list，强制调用得到 UNKNOWN_TOOL；普通工具保留。范围是坏文件窗口中新建/恢复且触发 agent/created 的全部 bot（主/普通/worker），以及插件 bootstrap 当时已 live 的全部 bot；原本健康、早已建好的主 bot不会仅因后续文件变坏就被补挂 restrict。受影响17个协调/委派/作业名，前台 bash/read/write/edit不在此名单。
严重度：单独看瞬时故障为 minor 可用性问题（安全不放宽；可通过销毁并恢复 agent/SDK 重启在健康身份下恢复），但与“合法省略 bots 被当坏文件”组合会变成常态主功能阻断，已并入下面 major。
建议：记录 ponytail 上限及恢复办法，非本次单独强制立自动重判任务；先修合法形状回归。若产品不接受恢复需要重启，再立受控撤销 restrict 小任务，不能先行放宽 worker。

2. veto 留持久孤儿行
实证：E/probe-rename.log 原始 session/list 1→2，新增行 blank=true、agentAvailable=false、origin=subagent、parentSessionId存在，日志 events=[]，live registry 无该 id，公开 prompt 被上游 subagent routing 拒。
用户可见性：当前 renderer-grok roster 在 data.ts:327 同时排除 origin=subagent 与 parentSessionId，数据投影探针 E/orphan-roster.log 明确剔除此真实行；主侧 deriveBots 本身不过滤 origin，但当前 renderer roster 不用它直接展示这条行。未启动浏览器，不声称已作视觉检查。原始 SDK RPC/磁盘层仍看得到，重复拒绝可累积持久行。
严重度：minor（数据卫生/长期增长，不是子代理逃逸；当前 UI bot 列表无此行）。
建议：记录，不阻塞两安全修复；将来需要再立“veto 后清理本次孤儿、保持上游生命周期”任务，勿把清理失败当成放行理由。

3. main 首启顺序依赖
builder“生产 main 启动即写”的前提不成立：BotsMetaStore.init():65-73 遇 ENOENT 直接返回，不写空文件；main/index.ts:248 创建 M3 只触发读盘；renderer-grok/shim/src/data.ts:333-338 明确先 session/create，后 patch mainBotId。冷启动首个主 bot 能在身份文件缺失时建立并被永久收窄，之后 patch 也不撤销（恢复探针已实证）。此外 store.ts:22-30、91 主动省略零 worker 的 bots，即使预先 flush，也不能解决本次合法形状误判。
严重度：major / 开放闸前置（不是“可能”）。当前 orchestration 仍 opt-in，未把默认全产品启动称为已破坏；但 P6-14b 开放后会直接阻塞首个 worker 的委派。
建议：立任务，并作为 P6-14b 前置核对项：用生产 store、生产“session/create→patch”顺序做集成回归，确保首次与已有主 bot 均保留全部协调者/委派/作业能力，同时缺失/坏文件下 worker 安全面不能倒退。不要求本次改 main，但不得仅留一句上线前关注。

四、九文件区域对照

| 文件（均以 /tmp/bot-wt/P6-14f2/ 为根） | 区域核对 |
| app/sdk/src/orchestration/envelope.mjs | f2 行明确在列 |
| app/sdk/src/orchestration/index.mjs | f2 行未列；只追加 resolveWorkerStatus/isEnveloped barrel 导出，属于父 P6-14 允许追加导出范围；建议主会话补 f2 区域记账，不伪造已在列 |
| app/sdk/tests/unit/orchestration-envelope.test.ts | f2 “测试”范围 |
| app/sdk/tests/unit/orchestration-envelope-live.test.ts | 同上 |
| app/sdk/tests/unit/orchestration-foundation.test.ts | 同上，barrel出口期望+2 |
| app/sdk/tests/unit/orchestration-create-live.test.ts | 同上；预先补 bots:{} 并把无worker合法缺省改为强带键，遮蔽了真实 store 回归，须随主修复还原契约覆盖 |
| app/sdk/tests/unit/orchestration-send-live.test.ts | 同上；同类测试 fixture 变更 |
| app/sdk/tests/unit/orchestration-stop-live.test.ts | 同上；首会话前补 bots:{} |
| app/sdk/tests/unit/orchestration-report-live.test.ts | 同上；首会话与 crash fixture 前补 bots:{} |

新问题（可直接成为修复任务）：
- [FIX] 合法零 worker bots.json（可选 bots 键省略）被 resolveWorkerStatus 当 unknown，主 bot 工具表17名被收窄、首个 create_bot 被 pbots/forbidden 拒 | 复现：执行 E/store-shape-probe.mjs；再执行 E/probe-vfy.mjs production-main（真 Loader） | 疑似位置：app/sdk/src/orchestration/envelope.mjs:97-100；app/sdk/tests/unit/orchestration-envelope.test.ts:175-176；create/send live fixtures把可选键改成必写 | major，立任务，本次 FAIL 的产品阻塞项。
- [FIX] P6-14b 冷启动前置不成立：main store.init ENOENT不写盘，生产 roster先建主 session后 patch；未知窗口建的主 agent恢复后依然 UNKNOWN_TOOL | 复现：E/probe-vfy.mjs recovery；生产顺序定位 app/ui/renderer-grok/shim/src/data.ts:333-338 与 app/ui/main/m3-meta/store.ts:65-73 | 疑似位置：main 首启编排与 envelope.mjs:266-286 持久 restrict 生命周期接缝 | major，立 P6-14b 前置集成任务；与上一项同模块/同轮可合批，不误报为新增安全绕过。
- [记录] 临时身份故障恢复后17名工具仍被 restrict，需重建 agent/重启SDK；正常前台工具不受影响 | 复现：E/probe-vfy.mjs recovery | 疑似位置：envelope.mjs:266-291 | minor；单独不强制立任务，主功能常态误伤并入上两条。
- [记录] 创建 veto 留1条持久空子 session；当前 UI roster过滤掉，RPC/磁盘可见且可累积 | 复现：E/probe-vfy.mjs rename；E/orphan-roster-probe.mjs | 疑似位置：上游持久 session create早于session/created veto | minor；记录。
- [记录] PLAN f2 区域列遗漏 index.mjs；builder“resume 再次 veto”证据实际是路由拒绝 | 复现：git diff --name-only 09f627b..HEAD 对照 PLAN:62；E/probe-rename.log resumeError | 文档/证据 minor；补列并纠正文案，不需要产品代码任务。

结束自查：/home/lingxufeng/bot/scripts/bot-reap --dry-run --match p614f2，exit 0、stdout/stderr空（无匹配残留）；E/cleanup.log。HEAD未漂移。仅清理探针自己派生的沙箱进程，未手动 kill，不碰桌面会话；运行时目录已删除，evidence仅留脚本和无凭证结果。
