// P5-54（U6：P5-12 B14 行为迁到新 renderer）· 时间分隔 / 未读线的生成器（ours）。
// 0.18 transcript 会渲染 time-separator / unread-divider 两种 entry（transcript.tsx:702-703），但重建树里没有生成器
// （P5-53 发现 4）；这里补上，语义取 0.78.1 原版（work/p1-re/evidence/chunks/index.eager-app-iGTgHP_Q.js）：
// - @1734517 `emt=9e5`：阈值 900000ms；@1739294 `vmt`：上一条无时间 → 出、|Δ| >= 阈值 → 出、跨本地自然日 → 出；
// - @1738914 `UR` + `gmt`：Intl en-US，「Today 3:04 PM」/「Yesterday …」/ 同年「Tue, Nov 3 …」/ 跨年「Nov 3, 2025 …」；
// - @1741826 `Emt`：未读线至多一条，在首条未读行前，顺序 未读线 → 分隔 → 行。
// 未读口径沿用旧 renderer（P5-12，renderer/shell/store.ts readMark）：离开 bot 时记它最新的时间为已读边界；
// 再进入时冻结「首条晚于边界、且不是用户本人消息」的行（停留期新到的消息不移动它、不长出第二条）。
export const SEP_GAP_MS = 900_000

export interface MarkerEntry { kind: string; id: string; timestampMs?: number; role?: string; message?: { type?: string } }
export type TimeSeparator = { kind: 'time-separator'; id: string; label: string }
export type UnreadDivider = { kind: 'unread-divider'; id: string; newMessageCount: number }

const sameDay = (x: number, y: number): boolean => new Date(x).toDateString() === new Date(y).toDateString()

/** 透明条目（渲染为 null，或时间是序列化兜底的 Date.now()）不参与分隔与未读：审批卡只在 dock 渲染。 */
const timed = (e: MarkerEntry): e is MarkerEntry & { timestampMs: number } =>
  typeof e.timestampMs === 'number' && Number.isFinite(e.timestampMs) && e.kind !== 'local-tool-permission'

export function timeLabel(at: number, now: number, locale = 'en-US'): string {
  const d = new Date(at)
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(d)
  if (sameDay(at, now)) return `Today ${time}`
  const y = new Date(now)
  y.setDate(y.getDate() - 1)
  if (sameDay(at, y.getTime())) return `Yesterday ${time}`
  const date = d.getFullYear() === new Date(now).getFullYear()
    ? new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric' }).format(d)
    : new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(d)
  return `${date} ${time}`
}

/** 用户本人消息 = message + role user（上游乐观条目与 shim 持久条目同形，P5-55）；send-message 是 agent 发来的消息。 */
const isUserMessage = (e: MarkerEntry): boolean => e.kind === 'message' && e.role === 'user'

/** 条目列表里最新的时间（离开 bot 时的已读边界）；无带时间的条目 → null。 */
export function latestAt(entries: readonly MarkerEntry[]): number | null {
  let max: number | null = null
  for (const e of entries) if (timed(e) && (max === null || e.timestampMs > max)) max = e.timestampMs
  return max
}

/** 未读起点：首条时间晚于 readMark 且不是用户本人消息的条目；无基线 → null。 */
export function firstUnreadId(entries: readonly MarkerEntry[], readMark: number | undefined): string | null {
  if (readMark === undefined) return null
  return entries.find((e) => timed(e) && e.timestampMs > readMark && !isUserMessage(e))?.id ?? null
}

export function withMarkers<T extends MarkerEntry>(entries: readonly T[], now: number, unreadBefore: string | null): Array<T | TimeSeparator | UnreadDivider> {
  const out: Array<T | TimeSeparator | UnreadDivider> = []
  let prev: number | null = null
  let unreadAt = -1
  for (const e of entries) {
    if (e.id === unreadBefore) { unreadAt = out.length; out.push({ kind: 'unread-divider', id: 'unread-divider', newMessageCount: 0 }) }
    if (timed(e)) {
      if (prev === null || Math.abs(e.timestampMs - prev) >= SEP_GAP_MS || !sameDay(e.timestampMs, prev)) {
        out.push({ kind: 'time-separator', id: `${e.id}:timestamp`, label: timeLabel(e.timestampMs, now) })
      }
      prev = e.timestampMs
    }
    out.push(e)
  }
  if (unreadAt >= 0) {
    const count = out.slice(unreadAt).filter((e) => e.kind === 'message' && !isUserMessage(e)).length
    out[unreadAt] = { kind: 'unread-divider', id: 'unread-divider', newMessageCount: Math.max(count, 1) }
  }
  return out
}

/** 当前会话的 agentId：ConversationTranscript 的 props 不带 agentId，由同一渲染趟里先渲染的
 * ConversationAgentHeader 覆盖写入（ProductionRenderer.tsx:3483 header 在 transcript 之前）。
 * ponytail: 渲染期写模块变量，依赖兄弟渲染顺序；上游若把 header 挪到 transcript 之后，改成 transcript 覆盖接 agentId prop。 */
export const activeAgent: { id: string | null } = { id: null }

/** 每个 bot 的已读边界 + 当前访问冻结的未读起点（模块级：transcript 实例跨 bot 复用，不随切换重挂）。 */
export interface UnreadTracker {
  /** 当前访问的未读起点（agentId 变了就结算上一个 bot 的已读边界、冻结新的起点）。 */
  visit(agentId: string, entries: readonly MarkerEntry[]): string | null
}

export function createUnreadTracker(): UnreadTracker {
  const readMarks = new Map<string, number>()
  let current: { agentId: string; entries: readonly MarkerEntry[]; unreadBefore: string | null; frozen: boolean } | null = null
  return {
    visit(agentId, entries) {
      if (current === null || current.agentId !== agentId) {
        if (current !== null) readMarks.set(current.agentId, latestAt(current.entries) ?? readMarks.get(current.agentId) ?? 0)
        current = { agentId, entries, unreadBefore: null, frozen: false }
      }
      current.entries = entries
      // 进入后首个非空快照时冻结（切过去的瞬间可能还没拿到 tail）
      if (!current.frozen && entries.length > 0) {
        current.unreadBefore = firstUnreadId(entries, readMarks.get(agentId))
        current.frozen = true
      }
      return current.unreadBefore
    },
  }
}

/** P5-55（P5-12 final #12，0.78.1 进入未读会话的定位）：线以下内容超一屏 → 线滚到视口顶下 28px；否则 null（保持上游跟底）。 */
export const UNREAD_SCROLL_INSET = 28
export function unreadScrollTop(dividerTop: number, scrollHeight: number, clientHeight: number): number | null {
  return scrollHeight - dividerTop > clientHeight ? Math.max(0, dividerTop - UNREAD_SCROLL_INSET) : null
}
