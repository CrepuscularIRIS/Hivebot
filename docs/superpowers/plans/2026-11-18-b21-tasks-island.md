# B21: Tasks 任务岛

- Goal: 0.78.1 Tasks 侧栏行+角标+跨 agent 看板 workspace（4 组分组/排序/折叠/行动作/跳线程）
- Constraints: shim getAsyncTasks 投影不改已有语义（B14 面板依赖）；per-agent AsyncTasksPanel 保留；挪位菜单 P2 不做；done 组首版恒空（无真实完成事件源）
- Steps:
  1. 纯函数：taskBoardGroup(task,agent) 4 态 + buildTaskBoardSections(agents,tasksByAgent,sort) 聚合 + needsYouCount
  2. UI：sidebar TasksIslandRow（bottom 固定，icon list-todo+角标）→ TaskBoardWorkspace 面板（头部/排序 SegmentedControl/分组 section 折叠/行=状态 lead+动作菜单+archive）
  3. 接线：ProductionRenderer 聚合 agents×asyncTasksProvider 快照 → 行/角标/workspace 数据；openThread=跳 agent 会话
  4. 单测：状态机+聚合纯函数
  5. e2e：开 workspace、空态、运行中 worker 行、finish 动作
- Review Focus: 分组边界（awaiting→attention 优先于 unread→review）；聚合排序稳定性；角标 count 只数 needs-you
