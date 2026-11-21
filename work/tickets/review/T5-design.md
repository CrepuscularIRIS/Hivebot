# T5 设计复审（Opus 代席，2026-11-06 06:05）

> 代录：reviewer（Sol）两轮被其服务商内容策略拦截（拦分析输出非派发词，LEARNINGS 已记），改派全新上下文 Opus 实例代审；独立性由全新会话保证。Sol 补审留 queue 提议。
> 结论：**还不能进任务 B**。工单验收 1–6 复跑全过；D1/D4/D5 各有会让实现单测不出东西或照写做不下去的问题，先改文档。

## CONFIRMED（按修文档优先序）
1. [高] D1 先红法与变异都红不了：shell-ask pre-execute 已用同一句原因拒所有区外写（shell-ask.mjs:84,342,383），只插 fs-ssh 不插 fs-zone-ssh 时 ①b 照样被拒；workspaceWritableRoots 不含 /tmp（dsh-sandbox lib/index.js:225-228），「改回 workspaceWritableRoots」变异也不红。改法：绕开 pre-execute 直测 ZoneCheckedSshFileSystem.writeText/editText（目标 /tmp 与 remoteHome）；变异=去 zoneGuard 调用。
2. [高] D4 改写后 argv 只含远端根，④a 断言宿主哨兵会恒红：argv 应用宿主 computeRoots∪远端根，补 --tool/--permit-root/--slirp（wrapper 对不存在路径会跳过，bwrap-wrap.py:72-81，多传无害）。
3. [中] 「helper 根」认错对象：Hello.root 是每连接 socket 临时目录 mkdtemp(/tmp/dsh-ssh-)（helper.js:557），非 helper 安装目录；且 --policy 挂载排在 --tmpfs /tmp 之后（bwrap-wrap.py:345-353）会把 endpoint 目录露回沙箱，②c/④c 恒绿。应保护 helper 安装目录（本机已在 PKG_ROOT 策略根下）。
4. [中] D1 选 3 不选 2 的理由在 ssh 下不成立：SshFileSystem 无 checkedTarget，writeText/editText 由远端重 resolve（fs-ssh:91-108，helper.js:783-795），子类先 resolve 再写=两次 RPC，中间换链窗口与本机已接受窗口同类（fs-zone.mjs:6-7）——写侧写明 ponytail 注释+覆盖面是 writeText/editText。
5. [低中] 「只走词法」没贯穿：applyZoneRecheck（fs-zone.mjs:56,60）与 shell-ask（:340,367）仍走宿主 stat 回退；containment 一处按 ssh 模式切纯词法、全部调用方经过它。
6. [低] D2「通配项交 guard 模式匹配」不实：judgePath 只做根包含（guard.mjs:145-175）；实际兜底=整棵 remoteHome 软遮蔽，改文字即可。
7. [中] D2 漏分支：remoteHome 只信配置不校验——配错则远端 ~/.ssh 悄悄失守；启动时用 helper fs.resolve('~') 比对，不一致启动失败。
8. [中] D8/D9 漏 preset 嵌套行：p6-reply-style.yml:128-133、approval.yml:421-427（workflow 族）；嵌套 tool-fs-search（approval.yml:91,218,347、p6-reply-style.yml:54、presets.yml:38）。⑧/⑨ 应从组合后 profile 枚举全部 preset，不写死清单。
9. [高] D5 三处：FileSystem 无 mkdir（dsh-fs 只有 watch，fs-ssh/helper 均无）；只有 #4 走 p2temp（orchestrate.ts:172），#3(:222)/createWorkerBot(:366) 直调上游覆盖不到；「worker 继承 cwd」是 P6-24（blocked 未合并）——T11 补 P6-24 依赖；另写明 main 如何得知 ssh 模式与 remoteRoot。
10. [中] T12 重启触发未定义：ssh 断后 dsh 进程仍活（终止的是那一轮），launcher 监控子进程看不到；重启会打断所有 bot 在跑回合。
11. 锚点勘误：schemas.js:125 行号对但语义用错（见 3）；cordis.patch.yml:234-249 偏宽松（实际只 subprocess/sandbox/sandbox-policy/bash-sandbox 四行）。

## REFUTED / 确认
- D1 无丢项：执行期复判、fs 缺失 fail closed、解析数不足判 NEVER、任意 mode NEVER、区外写拒、FS_PERMISSION_DENIED 沿用——全保留；读侧 fd 绑定去掉且已写明。
- D4 核心断言属实：helper.js:541 无配置挂 LocalSandboxProvider；bwrap profile 以 --ro-bind / / 起头（sandbox-local lib/index.js:22-37）。
- D3 闭合（前提=第 2 条修好）：上游失败统一转 SandboxUnavailableError（sandbox-ssh:34-37），wrapper 缺件直接退出。
- 8 锚点实读位置全对。
- 自检第 7 条按本意 PASS；建议口径改为：open 的 Q 查「推荐」、answered 的 Q 查「答复：」非空。

## T7a 初判（附带）
像**产品缺陷**不像配置问题：三布局均复现、T6 直连对照成功，疑点在 UI 组合（preset isolate 隔离域或 #4 建会话路径）下 sandboxPolicy.resolve 拿不到 workspaceRoot。建议单开缺陷单，不并 T9。

## 执笔人回应（manager，2026-11-06 06:25，r2 已改文；裁决留任务 B）
先读源码核实了 1/2/3/9，均成立（锚点：shell-ask.mjs:84/342/383；bwrap-wrap.py:72-81、345-353；helper.js:557；dsh-fs-ssh lib 方法表无 mkdir、orchestrate.ts:222/366）。逐条处理：
1. D1 验证改为进程内直测 `ZoneCheckedSshFileSystem.writeText/editText`，变异 = 去 zoneGuard。附带发现：fs-sandbox 围栏用的是含 /tmp 的 `writableRoots`（dsh-sandbox lib 239-246，fs-sandbox lib 160），所以「原版 fs-ssh 写远端 /tmp 成功」正好作先红；复审说的 `workspaceWritableRoots` 不含 /tmp 也对（本机 zoneGuard 用它）。
2. D4 参数集 = 抽出的 `wrapperArgv(cfg)`（宿主全套）∪ 远端根。
3. 写保护对象改为 helper 安装目录；明文禁止把 Hello.root 当 `--policy`；②c/④c 重设计（④c 加「沙箱内看不到 /tmp/dsh-ssh-*」）。
4. D1 选 3 的理由改写：无 checkedTarget、两次 RPC 换链窗口、覆盖面 writeText/editText + 升级防漏格。
5. containment 一处按 `P2SDK_SSH_MODE` 切纯词法。
6. 通配项改为「整棵 remoteHome 软遮蔽兜底」。
7. 加 remoteHome 启动校验（`ctx.fs.resolve('~')`）+ ②d。
8. D8 改禁 base `ptc-runtime`（断嵌套 workflow-ptc 的服务依赖）；D9 tool-fs-search 改为 guard 工具名拒；⑧⑨ 从组合后 profile 枚举全部 preset。
9. D5 改为 SDK RPC `p2sdk/workspace.root/ensure`（`ctx.subprocess` 固定 argv mkdir），改 `mintWorkspace` 一处覆盖 #3/#4/worker；P6-24 进 T11 依赖；main 经 `workspace.root` 得知模式。
10. D7 定义触发（main 事件流固定串）+ 用户点「重新连接」，不自动重启（会打断他 bot 回合）。
11. 两处锚点已改。
T9 已拆 T9a/T9b；T7a 缺陷单 = `open/T14-ws-write-guard-mask.md`。自检 1–8 复跑全过（第 7 条按新口径，含负对照）。

## 经理核实（任务 B，manager Opus 5.5 全新上下文，2026-11-06 @ 10e9951b）
自检 1–8 亲自复跑全过：13 节 + 结论表 1；五件套无缺；109 锚点全可解析；证据 4 文件非空；D10 原文 `assets=0`；queue 引用 7 行、「可开」恰 1 行、删 `ssh-headless.test.ts:111-122` 写明；Q-013/024/029 口径过；无 bot-T5 进程，`/tmp/dsh-ssh-*` 相对执笔前无新增。
抽查四条读源码对照（不是只看文字）：
- 第 1 条 **修到位**：helper 的 fs 是 `SandboxedFileSystem`（helper.js:539、:783-793），其 `checkedTarget` 用含 `/tmp` 的 `writableRoots`（dsh-sandbox lib 239-246、fs-sandbox lib 160）→ 原版 fs-ssh 写远端 /tmp 必成功，①b 先红成立；①d（dfa 下 NEVER）同样原版必写成功。
- 第 2 条 **修到位**：`wrapperArgv(cfg)` 抽自 start.ts sandboxRow（argv 实在 :217-226），宿主全套∪远端根；wrapper 对不存在路径 `hide_args` 返回 `[]`（bwrap-wrap.py:76-83）。
- 第 3 条 **修到位，留一处小缺**：D2/D4 均明文禁止 Hello.root（helper.js:558 mkdtemp，文档写 :557 差一行）作 `--policy`；④c 断言沙箱内 `/tmp/dsh-ssh-*` 不可见。但 T9 基线（原版 sandbox-ssh）下 workspace-write profile 自带 `--tmpfs /tmp`（sandbox-local lib/index.js:34-35），④c 在基线也绿——它是回归格不是先红格，④d 必须点名变异「把 Hello.root 当 `--policy` 传 → ④c 红」，否则此格无人证伪。**并入 T10 验收**（queue 已写），不改设计文档。
- 第 9 条 **修到位**：三条建会话路径都先调 `mintWorkspace`（orchestrate.ts:143、:219、:349），main 侧无其他 `session/create` 发起点；FileSystem 无 mkdir 属实；RPC 形态有 p2temp 先例（p2temp/index.mjs:47-48）。`ctx.subprocess.spawn` 签名未核，T11 单测时定。
附带两处小勘误（不阻塞，并入对应实现单）：
- 「未核实到底」第 1 条兜底写「改用 ①c 作先红」不对——①c（ws 内链向 remoteHome）原版围栏也拒；兜底应为 ①d。并入 T9b 行。
- D13 ② 写 `validateConfig`，实际函数名 `validateStart`（start.ts:90）。已写进 T9a 工单。
**裁决：T5 通过。** T5 挪 done/；开 T9a。
