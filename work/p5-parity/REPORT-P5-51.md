# REPORT · P5-51 coordinator shim + desktop 桥（L-UI v3 主力）

> 主会话代录（builder 写报告被拦），2026-11-03

分支 feat/P5-51 @ 40bcab8（基 9e8cab3），4 commits，15 文件 +1469。renderer-grok/shim/（entries/agents/coordinator/desktop/data/index+vite.config）+ inject-shim.mjs + build 注入 + 单测×4 + e2e grok-shim.spec。上游树零改动（pnpm check diff=0）。

## 核心实现
- entries.ts：foldTurns（直 import P6-01）→ 0.18 raw entry；assistant 正文带 role:'assistant'（**0.18 按 value.role 判侧，缺省落用户侧纯文本**——实测坑）；clientNonce 补记
- agents.ts：roster→agent；activityOf：bash→working、web_*→searching、无工具→thinking
- coordinator.ts：协议 v1 服务端；13 实底 RPC 走 deps；未知→failed unknown-method；openAgentTail 同推 snapshot（S0 坑1 解法）
- desktop.ts：~35 方法扁平桥（S0 实底）；getTeachRecordingStatus 四字段形状
- data.ts：$events+每 agent follow→reduceFollow→snapshot 事件；roster→agents 事件；主 bot 单飞防双建；断链 300ms 重开重挂；作答→$events/result
- 双装保护 + lib IIFE 构建 + 幂等插桩 index.html（先于 module bundle，CSP self 放行）
- D9：作答映射 allow-once/always→allowed-once、deny/never→rejected（永不发 always）；ceiling=ask 禁用 Always（上游机制禁用非移除，完全隐藏归 P5-31 覆盖文件）

## P5-50 坑2 查清：审批卡渲染条件
唯一路径=composer 上方 LocalToolPermissionDock（transcript 内该 kind 恒 null，transcript.tsx:709）；硬条件：entry 带 ask{status:'pending',requestId} + **permissionScope===账户槽** + **permissionScopeRevision≥0 单调整数**（ProductionRenderer.tsx:1765-1785）——S0 fixture 缺这两字段故不渲染。触发：$events approval/request（fake bash 实参必须带 description）。e2e 实测两回合出卡/作答/消失。

## 验收全 PASS
每类 entry 渲染 boundary=0；作答值集=['allowed-once','rejected']；D9 照跑全绿（单测 333 + e2e 63）；persona thinking→idle；ceiling 禁用+tooltip；MISSING=0。

## 坑与发现（9 条交后续）
①0.18 判侧按 value.role ②fake 游标多回合一次写全 ③dsh bash 实参须带 description ④roster 双拉双建主 bot（已单飞）⑤transcript 全量 snapshot（增量留 P5-54）⑥翻页 RPC 实现未测长历史 ⑦desktop platform/zoom/windowControls 桩值（P5-54 接 preload）⑧工具行结果内容未映射（上游独立 boundary）⑨切 bot composer 不接输入（上游行为，P5-52/54 观察）
