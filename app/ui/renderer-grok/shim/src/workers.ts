// P6-15 · worker 分组的纯函数（定稿 work/p6-orchestration/ui/P6-15-16-FINAL.md）：
// 状态档（决策 21）、侧栏预览、主 bot 汇总、合成 section 推导、编排工具行 / 回报 / 任务的 peer 元数据。
// 输入全部来自 shim 已有的数据（createdBy = M3 bots[id]，运行态 / 未读 / 审批 = data.ts 现有集合，
// 结果 / 终态 = follow 归约出的 SessionView），不新增存储。
import type { ReportItem, SessionView } from '../../../renderer/session/reduce'

/** 0 blocked · 1 running · 2 failed/stopped 未读 · 3 unread · 4 done（决策 21：审批/提问 > 回合中 > 出错/已停止 > 新结果 > 空闲）。 */
export type WorkerRank = 0 | 1 | 2 | 3 | 4

export interface WorkerFacts {
  id: string
  /** 待决审批 / 提问的可读原因（null = 不在等人）。 */
  blockedReason: string | null
  running: boolean
  unread: boolean
  /** 最近一个回合的终态；null = 从未跑完过回合。 */
  end: 'ok' | 'failed' | 'stopped' | null
  /** 失败原因首行（end === 'failed' 时）。 */
  failure: string | null
  /** 最近一条 assistant 正文。 */
  lastText: string | null
  updatedAt: number
}

export const PREVIEW_MAX = 80
export const WORKERS_LABEL = 'Workers'
export const DONE_LABEL = 'Done'
export const sectionId = {
  main: (creatorId: string): string => `pbots:main:${creatorId}`,
  workers: (creatorId: string): string => `pbots:workers:${creatorId}`,
  done: (creatorId: string): string => `pbots:done:${creatorId}`,
}
export const isPbotsSection = (id: string): boolean => id.startsWith('pbots:')
export const isDoneSection = (id: string): boolean => id.startsWith('pbots:done:')
export const isWorkerSection = (id: string): boolean => id.startsWith('pbots:workers:') || isDoneSection(id)

/** 首个非空行，≤max 字（超出加省略号）；空 → null。 */
export function firstLine(text: string | null | undefined, max = PREVIEW_MAX): string | null {
  const line = (text ?? '').split(/\r?\n/).map((l) => l.trim()).find((l) => l !== '')
  if (line === undefined) return null
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

/** turn/end 终止原因 → 终态类（completed=ok；用户 / 打断类=stopped；其余=failed）。 */
export function endKind(reason: string | null): WorkerFacts['end'] {
  if (reason === null) return null
  if (reason === 'completed') return 'ok'
  if (reason === 'aborted' || reason === 'interrupted' || reason === 'cancelled') return 'stopped'
  return 'failed'
}

/** 从 follow 视图取预览所需的三件事（终态 / 失败原因 / 最近正文）。 */
export function viewFacts(view: SessionView | undefined): Pick<WorkerFacts, 'end' | 'failure' | 'lastText'> {
  if (view === undefined || !view.loaded) return { end: null, failure: null, lastText: null }
  let lastText: string | null = null
  let failure: string | null = null
  for (let i = view.items.length - 1; i >= 0; i -= 1) {
    const item = view.items[i]!
    if (lastText === null && item.kind === 'assistant') lastText = item.text
    if (failure === null && item.kind === 'notice' && item.tone === 'danger') failure = item.text.replace(/^回复失败：/, '')
    if (lastText !== null && failure !== null) break
  }
  const end = view.running ? null : endKind(view.endReason)
  return { end, failure: end === 'failed' ? failure : null, lastText }
}

export function rankOf(f: WorkerFacts): WorkerRank {
  if (f.blockedReason !== null) return 0
  if (f.running) return 1
  if (f.unread && (f.end === 'failed' || f.end === 'stopped')) return 2
  if (f.unread) return 3
  return 4
}

/** 侧栏行预览（lastMessagePreview 槽）：blocked 由上游 `Waiting for you:` 前缀承担，这里给其余四档。 */
export function previewOf(f: WorkerFacts): string {
  if (f.end === 'failed') return `Failed: ${firstLine(f.failure) ?? 'something went wrong'}`
  if (f.end === 'stopped') return 'Stopped'
  return firstLine(f.lastText) ?? (f.end === null && !f.running ? 'Not started yet' : 'Working')
}

/** 组内次序：rank → updatedAt 降序 → sessionId（稳定平局）。 */
export function orderWorkers(workers: readonly WorkerFacts[]): WorkerFacts[] {
  return [...workers].sort((a, b) => rankOf(a) - rankOf(b) || b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** 决策 21 主 bot 行汇总：任一 blocked → 等待原因；任一 rank 2/3 → 未读。打开主 bot 不清（读主 bot ≠ 读 worker）。 */
export function aggregateOf(workers: readonly WorkerFacts[], nameOf: (id: string) => string): { reason: string | null; unread: boolean } {
  const blocked = workers.filter((w) => w.blockedReason !== null)
  const reason = blocked.length === 0 ? null
    : blocked.length === 1 ? `${nameOf(blocked[0]!.id)}: ${blocked[0]!.blockedReason}`
      : `${blocked.length} workers need you`
  return { reason, unread: workers.some((w) => { const r = rankOf(w); return r === 2 || r === 3 }) }
}

export interface SectionRecord { id: string; name: string; agentIds: string[]; isCollapsed: boolean }

/** 合成 section：每个创建者 main（仅本人，header 隐藏）→ Workers（rank 0–3）→ Done（rank 4）；`__agents__` 由上游补在最后。
 * 没有任何 worker → null（侧栏走今天的扁平列表，D11⑤ 字节不变）。
 * activeId：正打开着的 worker 读完即 rank 4，但不在用户眼前跳进折叠的 Done——离开它之后才归档（排在 Workers 末尾）。 */
export function sectionsOf(groups: ReadonlyArray<{ creatorId: string; workers: readonly WorkerFacts[] }>, activeId: string | null = null): SectionRecord[] | null {
  const live = groups.filter((g) => g.workers.length > 0)
  if (live.length === 0) return null
  return live.flatMap(({ creatorId, workers }) => {
    const ordered = orderWorkers(workers)
    return [
      { id: sectionId.main(creatorId), name: '', agentIds: [creatorId], isCollapsed: false },
      { id: sectionId.workers(creatorId), name: WORKERS_LABEL, agentIds: ordered.filter((w) => rankOf(w) < 4 || w.id === activeId).map((w) => w.id), isCollapsed: false },
      { id: sectionId.done(creatorId), name: DONE_LABEL, agentIds: ordered.filter((w) => rankOf(w) === 4 && w.id !== activeId).map((w) => w.id), isCollapsed: false },
    ]
  })
}

// ---- P6-16 peer 元数据（notice 载体 + pbotsUi.peer，覆盖层 notice-view.tsx 消费）----

export type AssignPeer = {
  kind: 'assign'
  tool: 'create_bot' | 'send_to_bot'
  status: 'pending' | 'done' | 'failed'
  workerId: string | null
  /** 工具实参里的名字（create_bot.name）；send_to_bot 由覆盖层按 workerId 现查。 */
  name: string | null
  preview: string
  /** failed 时的可读原因（不露错误码原文）。 */
  error: string | null
}
export type PeerMeta =
  | AssignPeer
  | { kind: 'report'; items: ReportItem[] }
  | { kind: 'task'; fromId: string | null; text: string }

export const ASSIGN_TOOLS: ReadonlySet<string> = new Set(['create_bot', 'send_to_bot'])
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

const parse = (text: string | null): Record<string, unknown> => {
  if (text === null || text === '') return {}
  try {
    const v = JSON.parse(text) as unknown
    return typeof v === 'object' && v !== null ? v as Record<string, unknown> : {}
  } catch { return {} }
}
const strOf = (...vs: unknown[]): string | null => {
  for (const v of vs) if (typeof v === 'string' && v.trim() !== '') return v.trim()
  return null
}

/** 编排错误码 → 文案（契约 §2.4 错误码；不认识的取首行）。 */
export function assignError(result: string | null, name: string | null): string {
  const text = result ?? ''
  if (text.includes('pbots/busy')) return `${name ?? 'This worker'} is busy`
  if (text.includes('pbots/forbidden')) return 'Not allowed'
  if (text.includes('pbots/capacity')) return 'Too many workers running'
  if (text.includes('main-unavailable')) return 'Result unknown — check Workers'
  if (text.includes('pbots/invalid-args')) return 'Invalid request'
  return firstLine(text) ?? 'Failed'
}

/** create_bot / send_to_bot 工具行 → Messaging 行元数据。实参名未冻结（P6-10/11），常见键都认。 */
export function assignPeer(tool: { name: string; args: string; status: 'running' | 'done' | 'failed'; result: string | null }): AssignPeer {
  const args = parse(tool.args)
  const res = parse(tool.result)
  const name = strOf(args.name)
  const kind = tool.name === 'send_to_bot' ? 'send_to_bot' : 'create_bot'
  const fromResult = strOf(res.sessionId, res.botId, res.workerId) ?? (tool.status === 'done' ? (UUID.exec(tool.result ?? '')?.[0] ?? null) : null)
  const workerId = kind === 'send_to_bot' ? strOf(args.botId, args.bot, args.workerId, args.sessionId, args.id) : (tool.status === 'done' ? fromResult : null)
  return {
    kind: 'assign', tool: kind,
    status: tool.status === 'running' ? 'pending' : tool.status,
    workerId, name,
    preview: firstLine(strOf(args.prompt, args.message, args.text), 120) ?? '',
    error: tool.status === 'failed' ? assignError(tool.result, name) : null,
  }
}

export const STATUS_WORD = { completed: 'Done', error: 'Failed', stopped: 'Stopped' } as const

/** 覆盖层失效时的回落文本（上游 notice 渲染）——保证仍可读。 */
export function peerFallback(meta: PeerMeta): string {
  if (meta.kind === 'assign') {
    const who = meta.name ?? 'another assistant'
    return meta.status === 'failed' ? `Couldn't message ${who}: ${meta.error ?? ''}` : `Messaging ${who}`
  }
  if (meta.kind === 'task') return `From main bot: ${firstLine(meta.text, 200) ?? ''}`
  return meta.items.map((i) => `${i.name ?? 'Worker'} · ${i.kind === 'ask' ? 'Needs you' : STATUS_WORD[i.outcome ?? 'completed']}`).join('; ') || 'Worker update'
}
