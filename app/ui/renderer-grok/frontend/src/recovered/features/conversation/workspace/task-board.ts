// B21: Tasks 任务岛纯函数（分组状态机+聚合+角标）。
// 0.78.1 规格锚：chunk-view-DICrypK2.js（U 分组标题/G 行/H 行动作/ne 看板）+ index.eager-app @3589471 oMn 状态机。
// 我方数据退化口径：shim getAsyncTasks 只投影 running worker（B14），无 awaiting/unread/done 源——
// 状态机保留 0.78.1 全形，缺省字段时 done 组恒空、review/attention 不触发（progress-only 落地）。
// shortcut: 无 done 任务事件源，done 组首版恒空；接入完成事件后此处零改动。

export type TaskBoardGroup = "review" | "attention" | "progress" | "done";

/** 0.78.1 渲染序（Y6=['review','attention','progress','done']）。 */
export const TASK_BOARD_GROUP_ORDER: readonly TaskBoardGroup[] = ["review", "attention", "progress", "done"];

export interface TaskBoardTask {
  readonly id: string;
  readonly label: string;
  readonly status: "running" | "done";
  readonly startedAtMs: number;
  readonly unreadEntryId?: string;
}

export interface TaskBoardAgent {
  readonly id: string;
  readonly name: string;
  readonly awaitingSessionIds?: readonly string[];
}

export interface TaskBoardRow {
  readonly agent: TaskBoardAgent;
  readonly task: TaskBoardTask;
  readonly threadSessionId: string;
}

export type TaskBoardSection =
  | { readonly kind: "group"; readonly group: TaskBoardGroup; readonly rows: readonly TaskBoardRow[] }
  | { readonly kind: "bot"; readonly agent: TaskBoardAgent; readonly rows: readonly TaskBoardRow[] };

export type TaskBoardSort = "status" | "bot";

/** 0.78.1 oMn：attention（awaiting 且非 done）> review（unread）> done > progress。 */
export function taskBoardGroup(task: TaskBoardTask, agent: TaskBoardAgent, threadSessionId: string): TaskBoardGroup {
  if (agent.awaitingSessionIds?.includes(threadSessionId) === true && task.status !== "done") return "attention";
  if (task.unreadEntryId !== undefined) return "review";
  if (task.status === "done") return "done";
  return "progress";
}

/** status 排序=4 组定序；bot 排序=按 agent 输入序分组（0.78.1 w({rows,sort}) 聚合）。 */
export function buildTaskBoardSections(rows: readonly TaskBoardRow[], sort: TaskBoardSort): readonly TaskBoardSection[] {
  if (sort === "bot") {
    const sections: TaskBoardSection[] = [];
    const byAgent = new Map<string, TaskBoardRow[]>();
    for (const row of rows) {
      const bucket = byAgent.get(row.agent.id);
      if (bucket === undefined) byAgent.set(row.agent.id, [row]);
      else bucket.push(row);
    }
    for (const [agentId, agentRows] of byAgent) {
      sections.push({ kind: "bot", agent: agentRows[0].agent, rows: agentRows });
    }
    return sections;
  }
  const buckets = new Map<TaskBoardGroup, TaskBoardRow[]>(TASK_BOARD_GROUP_ORDER.map((group) => [group, []]));
  for (const row of rows) {
    buckets.get(taskBoardGroup(row.task, row.agent, row.threadSessionId))?.push(row);
  }
  return TASK_BOARD_GROUP_ORDER
    .filter((group) => (buckets.get(group) ?? []).length > 0)
    .map((group) => ({ kind: "group", group, rows: buckets.get(group) ?? [] }));
}

/** 侧栏角标：需要用户的任务数（S5e：count=0 → 无角标，文案退回 "Tasks"）。 */
export function needsYouCount(rows: readonly TaskBoardRow[]): number {
  return rows.filter((row) => {
    const group = taskBoardGroup(row.task, row.agent, row.threadSessionId);
    return group === "attention" || group === "review";
  }).length;
}
