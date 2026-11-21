// B21: Tasks 任务岛视图——侧栏行 + 跨 agent 看板 workspace。
// 0.78.1 规格锚：chunk-view-DICrypK2.js（ne 看板/G 分组 section/H 行/U 组标题）+ eager-app（S5e/ij 角标、C5e 侧栏行、aj 挪位菜单——挪位 P2 不做）。
// 差距口径：shim 只有 running worker 投影 → done/review/attention 无源恒空，progress-only 落地（task-board.ts 头注）。
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  buildTaskBoardSections,
  needsYouCount,
  type TaskBoardAgent,
  type TaskBoardRow,
  type TaskBoardSort,
  type TaskBoardGroup,
} from "./task-board";
import type { AsyncTasksProvider, AsyncTask } from "../../agent-info/async-tasks/provider";

export interface TaskBoardSidebarRowProps {
  readonly isOpen: boolean;
  readonly onOpen: () => void;
  readonly rows: readonly TaskBoardRow[];
}

/** 0.78.1 C5e：icon list-todo 按钮 + count>0 角标（ij，aria-hidden 数字）；文案 S5e（count=0→"Tasks"）。 */
export function TaskBoardSidebarRow({ isOpen, onOpen, rows }: TaskBoardSidebarRowProps) {
  const count = needsYouCount(rows);
  const label = count === 0 ? "Tasks" : `Tasks, ${count} ${count === 1 ? "needs you" : "need you"}`;
  return <div className="sand-tasks-island-row" data-tasks-peek-island="">
    <button aria-expanded={isOpen} aria-label={label} aria-pressed={isOpen} className="sand-tasks-island-row__button" data-icon-name="list-todo" data-tasks-peek-count="" onClick={onOpen} type="button">
      <span aria-hidden="true" data-icon-name="list-todo" />
      <span className="sand-tasks-island-row__label">Tasks</span>
      {count === 0 ? null : <span aria-hidden="true" className="sand-tasks-island-row__badge">{count}</span>}
    </button>
  </div>;
}

const GROUP_TITLES: Readonly<Record<TaskBoardGroup, string>> = {
  review: "For review",
  attention: "Needs attention",
  progress: "In progress",
  done: "Done",
};

function agentTasksToRows(agent: TaskBoardAgent, tasks: readonly AsyncTask[]): TaskBoardRow[] {
  return tasks.map((task) => ({ agent, task, threadSessionId: task.id }));
}

/** 每 agent 订阅 asyncTasks 快照并拉平成行（0.78.1 workspace 聚合同构：agents×getAsyncTasks）。
 * 注意：hook-in-map 会随 agents 长度变化崩 rules-of-hooks，故这里聚合进单一 store 订阅。 */
export function useTaskBoardRows(
  agents: readonly TaskBoardAgent[],
  provider: AsyncTasksProvider | null,
): readonly TaskBoardRow[] {
  const agentsKey = useMemo(() => agents.map((agent) => agent.id).join("\u0000"), [agents]);
  const subscribe = useMemo(() => {
    if (provider == null) return () => () => {};
    // 自建聚合 store：订阅全部 agent entries，任一变化通知。
    const ids = agentsKey.split("\u0000");
    const handles = ids.map((id) => provider.snapshotsFor(id));
    const listeners = new Set<() => void>();
    const unsubscribers = handles.map((handle) => handle.subscribe(() => { for (const listener of listeners) listener(); }));
    return (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) { for (const unsubscribe of unsubscribers) unsubscribe(); }
      };
    };
  }, [provider, agentsKey]);
  const getSnapshot = useMemo(() => {
    if (provider == null) return () => [] as readonly TaskBoardRow[];
    const ids = agentsKey.split("\u0000");
    const handles = ids.map((id) => provider.snapshotsFor(id));
    const EMPTY: readonly TaskBoardRow[] = [];
    // uSES 要求引用稳定：成员快照全不变时复用上次 rows 数组，否则渲染循环（React #185）。
    let cached: readonly TaskBoardRow[] = EMPTY;
    let cachedInputs: unknown[] = [];
    return () => {
      const inputs = handles.map((handle) => handle.get());
      if (inputs.every((snapshot, index) => snapshot === cachedInputs[index])) return cached;
      const rows: TaskBoardRow[] = [];
      handles.forEach((handle, index) => {
        const snapshot = inputs[index];
        if (snapshot.status !== "ready" && !(snapshot.status === "failed" && "previous" in snapshot)) return;
        const agent = agents[index];
        if (agent == null) return;
        rows.push(...agentTasksToRows(agent, snapshot.value ?? snapshot.previous));
      });
      cached = rows.length === 0 ? EMPTY : rows;
      cachedInputs = inputs;
      return cached;
    };
  }, [provider, agentsKey, agents]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export interface TaskBoardWorkspaceProps {
  readonly onClose: () => void;
  readonly onOpenThread: (agentId: string) => void;
  readonly rows: readonly TaskBoardRow[];
}

/** 0.78.1 ne：h1 Tasks+N tasks、Sort by（status/bot）、分组折叠（done 默认折叠）、空态长文案。 */
export function TaskBoardWorkspace({ onClose, onOpenThread, rows }: TaskBoardWorkspaceProps) {
  const [sort, setSort] = useState<TaskBoardSort>("status");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set(["group:done"]));
  const sections = useMemo(() => buildTaskBoardSections(rows, sort), [rows, sort]);
  // G2（1.1.0 TAt 锚）：Escape 关闭；外点关闭（island/卡片内点除外）。
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target == null || !(target instanceof Element)) return;
      if (target.closest('[data-tasks-peek-card], [data-tasks-peek-island]') != null) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer, true);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onPointer, true); };
  }, [onClose]);
  return <aside aria-label="Tasks" className="sand-task-board sand-task-board--peek" data-task-board="" data-tasks-peek-card="" role="dialog">
    <header className="sand-task-board__header">
      <h1 className="sand-task-board__title">Tasks</h1>
      <span className="sand-task-board__count">{rows.length} {rows.length === 1 ? "task" : "tasks"}</span>
      <button aria-label="Close Tasks" className="sand-task-board__close" data-icon-name="close" onClick={onClose} type="button" />
    </header>
    <div aria-label="Sort by" className="sand-task-board__sortbar" role="group">
      <span className="sand-task-board__sortby">Sort by</span>
      <button aria-pressed={sort === "status"} className="sand-task-board__sort-item" onClick={() => setSort("status")} type="button">Status</button>
      <button aria-pressed={sort === "bot"} className="sand-task-board__sort-item" onClick={() => setSort("bot")} type="button">Bot</button>
    </div>
    <div className="sand-task-board__list" role="list">
      {rows.length === 0
        ? <p className="sand-task-board__empty">When you ask a Bot for several things at once, each one shows up here as a task</p>
        : sections.map((section) => {
          const key = section.kind === "group" ? `group:${section.group}` : `bot:${section.agent.id}`;
          const title = section.kind === "group" ? GROUP_TITLES[section.group] : section.agent.name;
          const isCollapsed = collapsed.has(key);
          return <section className="sand-task-board__section" data-task-board-section={key} key={key}>
            <h2 className="sand-task-board__section-title">
              <button aria-expanded={!isCollapsed} onClick={() => setCollapsed((prev) => {
                const next = new Set(prev);
                if (!next.delete(key)) next.add(key);
                return next;
              })} type="button">{title}</button>
            </h2>
            {isCollapsed ? null : <ul className="sand-task-board__rows">
              {section.rows.map((row) => <li className="sand-task-board__row" data-task-board-row="" key={`${row.agent.id}/${row.task.id}`}>
                <button className="sand-task-board__row-main" onClick={() => onOpenThread(row.agent.id)} type="button">
                  <span className="sand-task-board__row-label">{row.task.label}</span>
                  <span className="sand-task-board__row-meta">{row.agent.name}</span>
                </button>
              </li>)}
            </ul>}
          </section>;
        })}
    </div>
  </aside>;
}
