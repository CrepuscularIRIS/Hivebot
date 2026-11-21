// B26：dsh schedule/list → 0.78.1 Routines 行投影的纯映射。
// 0.78.1 EM 行字段：{id, name, isEnabled, trigger}——我们用 dsh scheduled task 投影：
// name=title，isEnabled=!paused（active），schedule 描述=rrule 人读化（Ponytail：只取 FREQ 前缀）。
export interface RoutineRow {
  readonly id: string
  readonly name: string
  readonly enabled: boolean
  readonly schedule: string
}

interface ScheduleTask {
  id?: string
  title?: string
  prompt?: string
  /** DSH ScheduleCatalogEntry：kind='daily'|'weekly'|…+time/timeZone（typed timing，非 rrule 字符串） */
  kind?: string
  time?: string
  timeZone?: string
  /** active|paused|ended（status 字段） */
  status?: string
  active?: boolean
}

/** schedule/list 的 items → 行。非法项跳过（0.78.1 ftt 的 ntt 过滤同位）。 */
export function routineRowsFrom(value: unknown): RoutineRow[] {
  const items = (value as { items?: unknown } | null | undefined)?.items
  if (!Array.isArray(items)) return []
  const out: RoutineRow[] = []
  for (const raw of items) {
    const t = raw as ScheduleTask
    if (typeof t.id !== 'string' || t.id === '') continue
    const name = typeof t.title === 'string' && t.title !== '' ? t.title : typeof t.prompt === 'string' && t.prompt !== '' ? t.prompt : 'Untitled routine'
    out.push({ id: t.id, name, enabled: t.status !== 'paused' && t.status !== 'ended', schedule: describeTiming(t) })
  }
  return out
}

/** DSH typed timing → 人读短语（0.78.1 Kj 的最小等价：频度词；解析不了给原文）。 */
export function describeTiming(t: { kind?: string; time?: string; timeZone?: string }): string {
  switch (t.kind) {
    case 'daily': return `Every day at ${(t.time ?? '').slice(0, 5)}`
    case 'weekly': return `Every week at ${(t.time ?? '').slice(0, 5)}`
    case 'every': return 'Recurring'
    case 'after': return 'Once, after a delay'
    case 'at': return 'Once, at a set time'
    case 'cron': return 'Custom schedule'
    case 'rrule': return 'Custom schedule'
    default: return 'Custom schedule'
  }
}

/** rrule → 人读短语（保留给 rrule timing 用；解析不了给原文）。 */
export function describeRrule(rrule: string | undefined): string {
  if (typeof rrule !== 'string' || rrule === '') return 'Custom schedule'
  const m = /FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY|HOURLY|MINUTELY)/.exec(rrule)
  if (m === null) return rrule.length > 60 ? `${rrule.slice(0, 57)}…` : rrule
  const word: Record<string, string> = { DAILY: 'Every day', WEEKLY: 'Every week', MONTHLY: 'Every month', YEARLY: 'Every year', HOURLY: 'Every hour', MINUTELY: 'Every minute' }
  const byDay = /BYDAY=([A-Z,]+)/.exec(rrule)
  if (m[1] === 'WEEKLY' && byDay !== null) {
    const names: Record<string, string> = { MO: 'Monday', TU: 'Tuesday', WE: 'Wednesday', TH: 'Thursday', FR: 'Friday', SA: 'Saturday', SU: 'Sunday' }
    const days = byDay[1].split(',').map((d) => names[d] ?? d)
    return days.length > 1 ? `${days.slice(0, -1).join(', ')} and ${days[days.length - 1]}` : days[0]
  }
  return word[m[1]] ?? 'Custom schedule'
}
