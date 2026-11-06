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
