
## 附记：e2e 阻塞的完整诊断链（2026-11-06 05:46）

1. 现象：presets.yml 全产品组合（UI）下，bot 经 write 写 `<dataDir>/workspaces/<id>/.dsh/...` 被 `p2sdk-fs-guard: masked area (<HOME 或 dataDir 根>)` 拒；三种布局（dataDir 在 /dev/shm、$TMPDIR、$HOME 下）均复现，遮蔽根分别报 dataDir/HOME 根。
2. 豁免机制存在：`guard.mjs judgePath:165`——`opts.workspaceRoot !== undefined && under(workspaceRoot) → ok`（softRoots 分支内）。触发拒 ⇒ 调用时 workspaceRoot 为 undefined。
3. workspaceRoot 来源：`guard.mjs:284-295`——`ctx.get('sandboxPolicy').resolve({session: exec.agent.session}).workspaceRoot`，读不到/抛错 → 无例外全拒。
4. 对照组：T6（直连 SDK、同 runtime patch 含 guard、session/create 显式 cwd=WS、同绝对路径写）**成功零卡** ⇒ 该路径上 resolve 返回了正确 workspaceRoot。
5. 差异面只剩：UI 组合 = presets.yml + M1 包装（`orchestrate.ts:366` 确认 cwd 有传进 session/create request）+ launchSdkRuntime(cwd=workspaces)。断点在「policy.resolve 对该会话的返回」——需要插桩 guard/policy 打点定位（预期单：给 guard 加一次性诊断日志或写复现 spec 直连 vs M1 各建会话对比 resolve 结果）。
6. 影响：若确认 UI 组合下全部 bot 的 workspaceRoot 都解析失败，则**产品里所有 bot 都写不了自己工作区**（软遮蔽根覆盖 HOME/dataDir）——比 T7a 大得多的缺陷；若只是 presets.yml 某行遮住了 per-session 解析，改一行。

结论：e2e 与其 M1 变异格挂起（unit 侧 M1/M2/M3 已全验），交 manager 任务 B 裁决（开缺陷调查单 or 指 T9/T5 范围内处理）。
