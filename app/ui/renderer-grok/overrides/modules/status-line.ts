// T23：0.79.3 状态行短语引擎——纯函数半边（规格 = work/tickets/doing/T23-statusline-phrases.md）。
// 0.79.3 锚点：tZ（新建状态抽签 phraseDraw）/ ren（活动切换防抖）/ Jpt（draw→短语索引）/
// Gjn=5e3（泛 working 静默期）/ Kjn=2500（thinking 静默，门 sand_side_model_status 默认关——本单
// 只实现门关语义：thinking 无静默）/ aen·oen·sen（elapsed）/ Yjn（退场 140ms）。
// 关键语义：**没有按时间的轮换**——短语只在活动切换时重抽；活动不变短语不变（T20 实测 12s 固定）。
// 时间与随机数全部由参数注入（假时钟单测可全时序推演），不依赖 React、不读 Date.now。
// ponytail: typing 模式（"Typing…"）不做——agent 记录无 composing 信号，有消费者再加。

/** 活动防抖：当前短语显示满这么久后，新活动立即切换（ren）。 */
export const SWITCH_DEBOUNCE_MS = 800
/** 泛 working 类的静默期：状态行出现后前这么久只显吉祥物不显文字（Gjn=5e3）。 */
export const WORKING_QUIET_MS = 5000
/** 同一活动显示满这么久后加 elapsed（aen/oen）。 */
export const ELAPSED_START_MS = 60000
/** 回合结束后状态行保留时长再卸载（Yjn exitUntilMs）。 */
export const EXIT_MS = 140

export type Activity = { readonly kind: 'thinking' } | { readonly kind: 'tool'; readonly tool: string } | null
export type TextKind = 'thinking' | 'working' | 'running_commands' | 'reading_file' | 'searching_web' | 'reading_web' | 'messaging_assistant'

/** 活动 → 短语类（mO 子集：只搬我们 activityOf 产得出的工具名，ORIGINAL_TOOL 映射后的值）。 */
export function textKindOf(activity: Activity): TextKind {
  if (activity == null) return 'working'
  if (activity.kind === 'thinking') return 'thinking'
  switch (activity.tool) {
    case 'Shell': return 'running_commands'
    case 'Read': case 'Skill': return 'reading_file'
    case 'WebSearch': return 'searching_web'
    case 'WebFetch': return 'reading_web'
    case 'SendToAgent': return 'messaging_assistant'
    default: return 'working' // Task / write / edit / glob / grep / … 与未知名 → 泛 working
  }
}

/** 附录 A 短语原文（i18n id 注释对应 0.79.3 表）。 */
const PHRASES: Record<TextKind, readonly string[]> = {
  thinking: ['Thinking it through' /* np8SXe */, 'Mulling it over' /* h3LL7E */, 'Putting it together' /* Px2Nkv */],
  working: ['Getting it done' /* dfCCPD */, 'Making progress' /* ZVMmJH */, 'Working on it' /* RQqcwV */, 'Handling it' /* 2z3X8R */, 'Chipping away' /* p0demG */],
  running_commands: ['Running a few commands' /* iX9Vlm */],
  reading_file: ['Reading the file' /* 0oaMjP */],
  searching_web: ['Digging around' /* LUow7U */],
  reading_web: ['Doing some reading' /* Pi4ViD */],
  messaging_assistant: ['Checking with another Bot' /* T23 附录 A */],
}

/** draw ∈ [0,1) → 短语（Jpt：floor(draw×len)）。单句类对任意 draw 恒同句。 */
export function phraseOf(activity: Activity, draw: number): string {
  const list = PHRASES[textKindOf(activity)]
  return list[Math.min(list.length - 1, Math.floor(draw * list.length))]!
}

export interface StatusState {
  readonly activity: Activity
  readonly textKind: TextKind
  /** 新建/切换活动时抽的签（tZ phraseDraw）；同类活动切换不重抽（ren 的 nen 判据）。 */
  readonly draw: number
  /** 当前短语开始显示的时刻。 */
  readonly shownAtMs: number
  /** 防抖期内排队的下一个活动（ien：只留最新一个）。 */
  readonly queued: { readonly activity: Activity; readonly at: number } | null
}

/** 新建状态（tZ）：抽一次签。 */
export function begin(activity: Activity, now: number, rand: () => number): StatusState {
  return { activity, textKind: textKindOf(activity), draw: rand(), shownAtMs: now, queued: null }
}

const sameKind = (state: StatusState, activity: Activity): boolean => textKindOf(activity) === state.textKind

/** 活动切换驱动（ren）：同类不重抽；显示满 800ms 立即切；否则排队（取最新）到 shownAt+800。 */
export function step(state: StatusState, activity: Activity, now: number, rand: () => number): StatusState {
  // 到期的排队先消费（在排队时刻生效，shownAtMs 记排队时刻）
  if (state.queued !== null && now >= state.queued.at) {
    const q = state.queued
    const next: StatusState = { activity: q.activity, textKind: textKindOf(q.activity), draw: rand(), shownAtMs: q.at, queued: null }
    return sameKind(next, activity) ? next : step(next, activity, now, rand)
  }
  // review M2：活动回到当前显示类 → 旧排队作废（A→B→A 时 B 不该再被展示）
  if (sameKind(state, activity)) return { ...state, activity, queued: null }
  if (now - state.shownAtMs >= SWITCH_DEBOUNCE_MS) {
    return { activity, textKind: textKindOf(activity), draw: rand(), shownAtMs: now, queued: null }
  }
  return { ...state, queued: { activity, at: state.shownAtMs + SWITCH_DEBOUNCE_MS } }
}

const quietMsOf = (kind: TextKind): number => (kind === 'working' ? WORKING_QUIET_MS : 0)

export function formatElapsed(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${minutes}m`
}

export interface RenderOut { readonly text: string | null; readonly elapsed: string | null }

/** 渲染快照：text=null 表示静默期（只显吉祥物，statusReveal==='quiet'）。 */
export function render(state: StatusState, now: number, visibleSince: number): RenderOut {
  const quietUntil = visibleSince + quietMsOf(state.textKind)
  const text = now < quietUntil ? null : phraseOf(state.activity, state.draw)
  const elapsed = now - state.shownAtMs >= ELAPSED_START_MS ? formatElapsed(now - state.shownAtMs) : null
  return { text, elapsed }
}

/** 下一个需要重绘的时刻：排队切换 / 静默结束 / 下一整分钟边界 三者最小；无则 null。 */
export function nextWakeMs(state: StatusState, now: number, visibleSince: number): number | null {
  const candidates: number[] = []
  if (state.queued !== null && state.queued.at > now) candidates.push(state.queued.at)
  const quietUntil = visibleSince + quietMsOf(state.textKind)
  if (now < quietUntil && quietUntil > now) candidates.push(quietUntil)
  // review M1：elapsed 首次到达也要唤醒（未满 60s 时排 shownAt+60000，满后排下一整分钟）
  const elapsedFirst = state.shownAtMs + ELAPSED_START_MS
  if (elapsedFirst > now) candidates.push(elapsedFirst)
  else {
    const nextMinute = state.shownAtMs + (Math.floor((now - state.shownAtMs) / ELAPSED_START_MS) + 1) * ELAPSED_START_MS
    if (nextMinute > now) candidates.push(nextMinute)
  }
  return candidates.length === 0 ? null : Math.min(...candidates)
}

/** 回合结束后的保留边界（Yjn exitUntilMs = now + 140）。 */
export function exitUntil(now: number): number {
  return now + EXIT_MS
}
