# B21: Tasks 任务岛（侧栏行+角标+跨 agent 看板 workspace）

日期：2026-11-18
来源：REQ-1.1.0-PARITY §5 候选序（B20 后下一批）

## 0.78.1 规格（chunk-view-DICrypK2.js + index.eager-app 实锤）

### 视图层
- **侧栏行**（两处可放：header=Search 旁 / bottom=侧栏底部；右键菜单 "Move Tasks next to Search" / "Move Tasks to the bottom of the sidebar" 切换，IvztbN/nRI93X）
  - 行=icon list-todo 按钮（wT，aria-label="Tasks"/"Tasks, N needs you"，S5e：count=0→"Tasks" else XP7zi7 plural）+ count>0 时角标 span（ij 组件，aria-hidden 数字）
  - 角标 count 语义：需要用户的任务数（attention+review 组的任务数，下述）
- **Tasks workspace 看板**（点击侧栏行开，全屏面板，Escape 可关）
  - 头：h1 "Tasks" + "N tasks"（huXpvM plural）
  - 排序条：SegmentedControl "Sort by"（/HgF9q）→ Status（uAQUqI）/Bot（ixkTse）两档，默认 status
  - 分组（status 排序下 4 组，Y6=[`review`,`attention`,`progress`,`done`] 渲染序）：
    - review="For review"（fmS9Up）行 lead=unread dot，text="New reply"（/kRjAH）
    - attention="Needs attention"（fAUSZy）行 lead=exclamation-circle icon，text=最后回复摘要 or "Waiting for you"（N6oHir）
    - progress="In progress"（/LCAwL）行 lead=working spinner，text=currentActivity 或任务名（QfVEDr {0}）
    - done="Done"（DPfwMq）行 lead=done check，text=null；**默认折叠**（初始 collapsedSet={group:done}）
  - bot 排序下：按 agent 分组（V 头像+名字），组内同上 4 态行
  - 行动作：progress 行有 "Mark as finished"（p7WaXc）finish 按钮（data-task-board-finish）；所有行有 "More actions for {name}"（jOsQQK）菜单=Mark as finished/Archive（B495Gs）；行尾 hover archive icon（7KhZ2e）
  - 行点击：openThread({agentId, taskId})——跳线程
  - 空态（qXAOim）："When you ask a Bot for several things at once, each one shows up here as a task"
  - 面板侧栏行还有 asleep 状态（l.panel({value,empty,asleep})）
- **行分组状态机 oMn**（@3589471）：agent.awaitingSessionIds 含 threadSessionId 且 task.status!=='done' → 'attention'；task.unreadEntryId!==undefined → 'review'；task.status==='done' → 'done'；否则 'progress'
- **RPC**：subagents family getAsyncTasks({id})（对象参）→ array；per-agent store bzn（d_ 工厂）；0.78.1 task 结构：{id,name,status:'running'|'done',subagentIds?,unreadEntryId?,...}（B(e) 行状态消费）

### 数据层（我方 shim 现状）
- getAsyncTasks 已在（B14）：运行中 worker → {kind:'subagent',id:worker sessionId,label,status:'running',startedAtMs,subagentType}
- 缺：跨 agent 聚合视图（0.78.1 是每个 agent 一个 getAsyncTasks 调用？还是 workspace 聚合？——**bzn(e)=d_(t=>e.getAsyncTasks({id:t}))，per-agent store**；workspace 聚合在 renderer 侧：agents×getAsyncTasks 全拉后分组）

## 我方差距清单

| 项 | 0.78.1 | 我方 | 差距 |
|---|---|---|---|
| 侧栏 Tasks 行 | header/bottom 可挪+角标 | 无 | 全新 |
| workspace 看板 | 4 组分组+排序+折叠+行动作 | 无（只有 per-agent AsyncTasksPanel） | 全新 |
| 行分组状态机 | awaiting/unread/done 派生 | 无 | 新增派生纯函数 |
| per-agent 任务数据 | getAsyncTasks per agent | 已有（running worker 投影） | 扩展 status:'done'/unreadEntryId 字段待评估 |
| openThread 跳转 | agent+task 定位线程 | 无 | 新增 |

## 决策
- **做**：侧栏行（固定 bottom，先不做挪位）+ 角标（count=needs-you 任务数）+ workspace 看板（4 组+status/bot 排序+done 折叠+行动作）+ 行点击跳 agent 线程 + 空态
- **不做**：挪位菜单（IvztbN/nRI93X）——记录为 P2；asleep 状态；per-agent AsyncTasksPanel 保留不动（不同入口并存）
- **shim 数据**：getAsyncTasks 投影扩展——worker 停止后短期保留 status:'done'（needs 口径：无 unread 概念，attention=无、review=无、progress=running、done=已完成）。**首版从简：done 无真实源，done 组恒空**；文档记录差距

## 验收
- 单测：分组状态机纯函数（4 态派生）+ 聚合（agents×tasks→sections）
- e2e：侧栏 Tasks 行可见+点开 workspace；空态文案；运行中 worker→progress 组行+finish 可点
