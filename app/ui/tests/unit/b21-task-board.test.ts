// B21: Tasks 任务岛纯函数——分组状态机+聚合+角标 count。
// 0.78.1 规格锚（chunk-view-DICrypK2.js + eager-app @3589471 oMn）：
//   oMn({agent,task,threadSessionId}) = agent.awaitingSessionIds∋sid && task.status!=='done' ? 'attention'
//     : task.unreadEntryId!==undefined ? 'review' : task.status==='done' ? 'done' : 'progress'
// 我方数据面无 awaitingSessionIds/unreadEntryId/done 源（shim 投影只有 running worker），
// 状态机保留 0.78.1 全形（可选字段缺省时退化：无 awaiting→跳过、无 unread→跳过、无 done 源→done 恒空）。
import { describe, expect, it } from 'vitest'
import {
  taskBoardGroup,
  buildTaskBoardSections,
  needsYouCount,
  type TaskBoardAgent,
  type TaskBoardTask,
} from '../../renderer-grok/frontend/src/recovered/features/conversation/workspace/task-board'

const agent = (id: string, over: Partial<TaskBoardAgent> = {}): TaskBoardAgent => ({ id, name: id, ...over })
const task = (id: string, over: Partial<TaskBoardTask> = {}): TaskBoardTask => ({
  id,
  label: id,
  status: 'running',
  startedAtMs: 0,
  ...over,
})

describe('B21 taskBoardGroup（0.78.1 oMn 状态机）', () => {
  it('awaiting → attention（优先级最高，即使有 unread）', () => {
    expect(taskBoardGroup(task('t'), agent('a', { awaitingSessionIds: ['s1'] }), 's1')).toBe('attention')
    expect(taskBoardGroup(task('t', { unreadEntryId: 'e' }), agent('a', { awaitingSessionIds: ['s1'] }), 's1')).toBe('attention')
  })
  it('unread → review（非 awaiting 前提）', () => {
    expect(taskBoardGroup(task('t', { unreadEntryId: 'e' }), agent('a'), 's1')).toBe('review')
  })
  it('status done → done', () => {
    expect(taskBoardGroup(task('t', { status: 'done' }), agent('a'), 's1')).toBe('done')
  })
  it('其余 → progress', () => {
    expect(taskBoardGroup(task('t'), agent('a'), 's1')).toBe('progress')
  })
  it('awaiting 但 task 已 done → 不算 attention（oMn 口径：done 任务不挡）', () => {
    expect(taskBoardGroup(task('t', { status: 'done' }), agent('a', { awaitingSessionIds: ['s1'] }), 's1')).toBe('done')
  })
  it('awaitingSessionIds 不含当前会话 → 无视', () => {
    expect(taskBoardGroup(task('t'), agent('a', { awaitingSessionIds: ['other'] }), 's1')).toBe('progress')
  })
})

describe('B21 buildTaskBoardSections（status/bot 双排序）', () => {
  const a1 = agent('a1', { name: 'Bot One' })
  const a2 = agent('a2', { name: 'Bot Two', awaitingSessionIds: ['s2'] })
  const rows: readonly { agent: TaskBoardAgent; task: TaskBoardTask; threadSessionId: string }[] = [
    { agent: a2, task: task('t2'), threadSessionId: 's2' },
    { agent: a1, task: task('t1', { unreadEntryId: 'e' }), threadSessionId: 's1' },
    { agent: a1, task: task('t3', { status: 'done' }), threadSessionId: 's3' },
    { agent: a1, task: task('t4'), threadSessionId: 's4' },
  ]
  it('status 排序：4 组定序 review→attention→progress→done', () => {
    const sections = buildTaskBoardSections(rows, 'status')
    expect(sections.map((s) => s.kind === 'group' ? s.group : `bot:${s.agent.id}`)).toEqual([
      'review', 'attention', 'progress', 'done',
    ])
    const progress = sections[2]
    if (progress.kind !== 'group') throw new Error('unreachable')
    expect(progress.rows.length).toBe(1)
  })
  it('bot 排序：按 agent 分组，组名稳定（agents 输入序）', () => {
    const sections = buildTaskBoardSections(rows, 'bot')
    expect(sections.map((s) => s.kind === 'group' ? `group:${s.group}` : `bot:${s.agent.id}`)).toEqual(['bot:a2', 'bot:a1'])
    const second = sections[1]
    if (second.kind !== 'bot') throw new Error('unreachable')
    expect(second.rows.length).toBe(3)
  })
  it('空 rows → 空 sections（空态渲染）', () => {
    expect(buildTaskBoardSections([], 'status')).toEqual([])
  })
})

describe('B21 needsYouCount（侧栏角标）', () => {
  it('只数 attention+review', () => {
    const rows = [
      { agent: agent('a'), task: task('t1', { unreadEntryId: 'e' }), threadSessionId: 's' },
      { agent: agent('a'), task: task('t2'), threadSessionId: 's' },
      { agent: agent('a'), task: task('t3', { status: 'done' }), threadSessionId: 's' },
    ]
    expect(needsYouCount(rows)).toBe(1)
  })
  it('全 progress → 0（角标不渲染）', () => {
    const rows = [{ agent: agent('a'), task: task('t1'), threadSessionId: 's' }]
    expect(needsYouCount(rows)).toBe(0)
  })
})
