# Sol 审查：T9b 链安全面（fefd99b3..92461969）

> 代录：reviewer（Sol 6.1）2026-11-06 18:0x 完成；范围 T9b/T9b2/T9b3。
> 结论：CONFIRMED 1（中 1）；PLAUSIBLE 2（需真实远端）；REFUTED 2。

## CONFIRMED
1.【中，已复现】`src/policy/guard.mjs:254-270`：remoteHome 校验的轮询 `setTimeout` 未登记 cordis 清理，回调无 disposed 判断——**插件已释放后仍可 process.exit(86) 误杀进程**。真 Cordis Context + fiber.dispose + 前移 61s 实测：退出码 86。终验漏网：guard 单测只覆盖校验三态、未覆盖释放；九刀未触生命周期。修法：定时器登记清理（ctx.effect），已启动回调 disposed 后不再校验/退出。

## PLAUSIBLE
- P1 `fs-zone-ssh.mjs:66-78` 根缓存假设远端 realpath 永久稳定（内存探针换映射后仍回旧值）；未实测真实远端换链。
- P2 `guard.mjs:335-353` 目标远端 resolve 而 workspaceRoot 原串——cwd 为远端符号链接时合法区内目标可能被误拒（探针 deny:mask）；未跑真实会话。

## REFUTED
- applyZoneRecheck 宿主 canonicalPath 只写 p2sdkReadScope，SSH 后端不读，未改变判定。
- MODE 孙进程继承不反向影响父进程 containment；重复 hardRoots 无行为问题。

## 覆盖声明
已读 log/diff、四模块 HEAD、上游 provider/helper、根规范化与 cordis 释放实现；guard 单文件 26/26 复跑绿。未跑全量 e2e。

## 经理核实（manager Opus 5.5，2026-11-06，主线 HEAD e1561617）

探针零落盘于仓库（`/tmp/mgr-c1/`，隔离 HOME/TMPDIR），真 cordis 4.1.0 `Context` + 主线 `src/policy/guard.mjs`。

**C1 成立 → `open/T9b4-guard-remotehome-dispose.md`。** 两条路径都复现：
- 轮询路径（不提供 ssh）：`root.plugin({apply: guard.apply}, {roots, remoteHome:'/configured'})` → `await fiber.dispose()`（uid → null）→ `Date.now` +61s → stderr `remoteHome verification timed out waiting for the ssh service` → **exit=86**；对照（dispose 后不拨钟）进程照常活着 exit=0。
- ready 路径（Sol 未单列）：`provide/set('ssh', {ready: 挂起})` + `fs.resolve → /actual` → dispose → 放行 ready → stderr `does not match the remote home` → **exit=86**。已发出的 `ready.then` 撤不回，单靠 clearTimeout 堵不住，T9b4 要求回调入口判 disposed，并用变异证 ⓑ 格真在测。
- 严重度维持中：触发需 guard 行被热重载 / plugin-manager 停用（旧实例带旧 remoteHome 误判或 60s 后误杀）；正常单次启动不触发。修法照仓内先例 `request-net.mjs:194`（`ctx.effect`）或 `routing-prompt.mjs:74`（`ctx.on('dispose')`）。

**P1 驳回（作为缺陷）；注释更正并入 T9b4。** 内存探针复现「换映射后 `p2sdkWritableRootsOf` 仍回旧 key」属实，但方向是安全的：缓存＝首次解析即钉住可写根，ws 原串事后被换链 → 新目标 WRITE_OUT（拒），不跟随放宽；NEVER 判定不读缓存（zoneGuardSsh 先查 neverRoots）。反过来「删缓存、每调用重解析」会让换链到 `~` 之类的 ws 把可写根放宽到整棵远端家目录——比现状更差。真问题只是 :47-48 注释前提写错（「对同一拼写稳定」），T9b4 改成如实描述钉住语义与上限。根治（首次解析前就被换链会钉错）= T11 建远端 ws 时存 canonical 路径，已写进 queue 5c 行。

**P2 成立（可用性，fail closed 方向）→ 挂起到 T11，T13 真机复核。** `P2SDK_SSH_MODE=1` 下 `judgePath('/home/u/real/x', soft=['/home/u'], {isWrite, workspaceRoot:'/home/u/ws'})` → `deny:mask`；ws 给 canonical `/home/u/real` → `ok`；经链读 `~/.ssh` 仍 `never`。即只是 ws 原串含远端符号链接时合法写被误拒，不放行任何东西。不在 guard 里每调用 `fs.resolve(workspaceRoot)` 修（同 P1：跟随换链＝放宽软遮蔽例外，且多一个 RTT）；正解是 T11 `workspace.root/ensure` 返回远端 realpath、header.cwd 存 canonical，guard / fs-zone-ssh 两处同时受益。不需要真实远端也能写格（内存 fs），T11 验收带一格「ws 原串为链接 → 合法写放行、换链后不放宽」。

**REFUTED 两条：** 未复核，接受（均为「无行为影响」结论，不产生工单）。
