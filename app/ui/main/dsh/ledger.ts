// $events 台账（U-00 类型冻结；U-12 写入原帧 tap 的联调；P5-07 按事件类别判别；P5-28 提问作答校验源）。
// ApprovalOutcome 取自 https://github.com/deepseek-ai/deepseek-harness@ce7073d51254c26cd63b22a60835b8f948deb447:packages/interaction/user-approval/src/types.ts:32
export type ApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'

/** 入账的 waterfall 事件类别（P5-07；上游 allowlist 其余事件为 emit 或不入账，R7 ②）。 */
export type LedgerEventKind = 'approval/request' | 'user-questions/request'

/** $events 流下行 item 的形状（GW/stream-protocol.ts:10-75）。提问 request 为上游投影后的
 * JSON 字段（questions/wait 等；agent/signal 已移除，GW/stream-protocol.ts:146-171）；P5-28 起台账只读其 questions[].id。 */
export type EventsItem =
  | { type: 'ready'; clientId: string }
  | { type: 'waterfall'; event: 'approval/request'; eventId: string; agentId: string; request: { toolName: string; callId?: string; reason?: string; displayReason?: string } }
  | { type: 'waterfall'; event: 'user-questions/request'; eventId: string; agentId: string; request: Readonly<Record<string, unknown>> }
  | { type: 'cancel'; eventId: string }

/** P5-07：审批条目带 toolName/callId；提问条目没有 toolName（提问 request 无此字段，R7 ③）。
 * P5-28：提问条目带该批问题 id 集（作答 id 集合校验源）。 */
export type LedgerEntry =
  | { readonly event: 'approval/request'; readonly eventId: string; readonly agentId: string; readonly toolName: string; readonly callId?: string; readonly receivedAt: number }
  | { readonly event: 'user-questions/request'; readonly eventId: string; readonly agentId: string; readonly questionIds: ReadonlySet<string>; readonly receivedAt: number }

/** 提问 request 里该批问题 id 集；questions 缺失/非数组/空/id 非字符串 → undefined（P5-28 fail-closed：不入账）。 */
function questionIdsOf(request: Readonly<Record<string, unknown>>): ReadonlySet<string> | undefined {
  const questions = request.questions
  if (!Array.isArray(questions) || questions.length === 0) return undefined
  const ids = new Set<string>()
  for (const question of questions) {
    const id = (typeof question === 'object' && question !== null ? (question as { id?: unknown }).id : undefined)
    if (typeof id !== 'string' || id === '') return undefined
    ids.add(id)
  }
  return ids
}

/**
 * P5-28：提问作答严格校验（纯函数）。合法 outcome = {kind:'result', value:{answers:[{id, selected,
 * custom?}]}}，answers 的 id 集合恰等于 expected（该批问题 id 集合，无序；缺/多/重复/类型错/额外字段都拒）。
 * 形状依据 tool-ask-user 输出 schema（additionalProperties:false，id/selected/custom，
 * repos/deepseek-harness/packages/interaction/tool-ask-user/src/index.ts:60-83）。
 * 返回 undefined = 通过；否则返回拒绝原因（invalid-args 级，m1-api 定 code）。
 */
export function invalidQuestionAnswersReason(outcome: unknown, expected: ReadonlySet<string>): string | undefined {
  if (typeof outcome !== 'object' || outcome === null) return "outcome must be {kind:'result', value:{answers:[…]}}"
  const { kind, value } = outcome as { kind?: unknown; value?: unknown }
  if (kind !== 'result') return "outcome.kind must be 'result'"
  if (typeof value !== 'object' || value === null || !Array.isArray((value as { answers?: unknown }).answers)) {
    return 'outcome.value must be {answers: […]}'
  }
  if (Object.keys(value).some((k) => k !== 'answers')) return 'outcome.value must contain only answers'
  const answers = (value as { answers: unknown[] }).answers
  const ids = new Set<string>()
  for (const [i, answer] of answers.entries()) {
    if (typeof answer !== 'object' || answer === null) return `answers[${i}] must be an object`
    const { id, selected, custom } = answer as { id?: unknown; selected?: unknown; custom?: unknown }
    if (typeof id !== 'string' || id === '') return `answers[${i}].id must be a non-empty string`
    if (!Array.isArray(selected) || !selected.every((s) => typeof s === 'string')) {
      return `answers[${i}].selected must be string[]`
    }
    if (custom !== undefined && typeof custom !== 'string') return `answers[${i}].custom must be a string when present`
    const allowed = custom !== undefined ? ['id', 'selected', 'custom'] : ['id', 'selected']
    if (Object.keys(answer).some((k) => !allowed.includes(k))) {
      return `answers[${i}] must contain only ${allowed.join('/')} fields`
    }
    ids.add(id)
  }
  if (ids.size !== answers.length) return 'answers must not repeat question ids'
  const missing = [...expected].filter((id) => !ids.has(id))
  if (missing.length > 0) return `answers missing question id(s): ${missing.join(', ')}`
  const extra = [...ids].filter((id) => !expected.has(id))
  if (extra.length > 0) return `answers contain unknown question id(s): ${extra.join(', ')}`
  return undefined
}

/** ready clientId + 未决 eventId 台账；$events/result 的 main 校验数据源（C §2.2）。 */
export class EventsLedger {
  private clientId: string | undefined
  private readonly pending = new Map<string, LedgerEntry>()
  private readonly warn: (message: string) => void

  constructor(opts: { warn?: (message: string) => void } = {}) {
    this.warn = opts.warn ?? ((message: string) => { console.warn(`[events-ledger] ${message}`) })
  }

  get readyClientId(): string | undefined { return this.clientId }

  pendingEvents(): readonly LedgerEntry[] { return [...this.pending.values()] }

  /** eventId 的入账事件类别；未入账（或非字符串）→ undefined。 */
  pendingEventKind(eventId: unknown): LedgerEventKind | undefined {
    return typeof eventId === 'string' ? this.pending.get(eventId)?.event : undefined
  }

  /** P5-28：未决提问事件的问题 id 集（作答 id 集合校验源）；非未决提问事件（或非字符串 eventId）→ undefined。 */
  questionIds(eventId: unknown): ReadonlySet<string> | undefined {
    if (typeof eventId !== 'string') return undefined
    const entry = this.pending.get(eventId)
    return entry !== undefined && entry.event === 'user-questions/request' ? entry.questionIds : undefined
  }

  /** P5-28：提问作答资格（clientId 口径与审批一致；eventId 未决已由 questionIds 判过）。 */
  validateQuestionResult(clientId: unknown): { ok: true } | { ok: false; reason: string } {
    if (this.clientId === undefined) return { ok: false, reason: 'no $events client ready' }
    if (clientId !== this.clientId) return { ok: false, reason: 'clientId mismatch' }
    return { ok: true }
  }

  /** 喂 $events 下行 item（U-12 会接 socket tap；spike 里由桥直接喂）。
   * P5-07：只有审批与提问两类 waterfall 入账；其他 waterfall 不入账，记 warn。 */
  record(item: EventsItem): void {
    if (item.type === 'ready') {
      this.clientId = item.clientId
      return
    }
    if (item.type === 'waterfall') {
      if (item.event === 'approval/request') {
        this.pending.set(item.eventId, {
          event: 'approval/request', eventId: item.eventId, agentId: item.agentId, toolName: item.request.toolName,
          ...(item.request.callId !== undefined ? { callId: item.request.callId } : {}),
          receivedAt: Date.now(),
        })
        return
      }
      if (item.event === 'user-questions/request') {
        // P5-28：提取该批问题 id 集；形状不合法 → 不入账只记 warn（fail-closed：无法作答，deadline 到期协议级拒绝）
        const questionIds = questionIdsOf(item.request)
        if (questionIds === undefined) {
          this.warn(`user-questions/request (${item.eventId}) has no valid questions array; not ledgered`)
          return
        }
        this.pending.set(item.eventId, {
          event: 'user-questions/request', eventId: item.eventId, agentId: item.agentId, questionIds,
          receivedAt: Date.now(),
        })
        return
      }
      // 类型层只见两类；线上 allowlist 还可能有其他 waterfall（remote-events.ts:26-57），不入账只记 warn
      this.warn(`waterfall "${String((item as { event: string }).event)}" (${item.eventId}) not ledgered`)
      return
    }
    this.pending.delete(item.eventId)
  }

  /** §2.2 校验（纯资格判定，不消费）：outcome 恰为 allowed-once|rejected；clientId 匹配 ready；eventId 未决。
   * P5-07：提问事件不接受审批字符串作答（作答分支 = P5-28）。
   * 消费时机在 consumeResult（R10：rpc 发送成功后才下账，发送失败保留 pending 可重试）。 */
  validateResult(clientId: unknown, eventId: unknown, value: unknown): { ok: true } | { ok: false; reason: string } {
    if (this.clientId === undefined) return { ok: false, reason: 'no $events client ready' }
    if (clientId !== this.clientId) return { ok: false, reason: 'clientId mismatch' }
    if (typeof eventId !== 'string') return { ok: false, reason: 'eventId not pending' }
    const entry = this.pending.get(eventId)
    if (entry === undefined) return { ok: false, reason: 'eventId not pending' }
    if (entry.event === 'user-questions/request') {
      return { ok: false, reason: 'user-questions event cannot be answered with an approval outcome value' }
    }
    if (value !== 'allowed-once' && value !== 'rejected') {
      return { ok: false, reason: `outcome value must be 'allowed-once' or 'rejected', got ${JSON.stringify(value)}` }
    }
    return { ok: true }
  }

  /** R10：下账（$events/result 发送成功后调用）。返回是否真的消费（false = 并发路径已消费）。 */
  consumeResult(eventId: unknown): boolean {
    if (typeof eventId !== 'string') return false
    return this.pending.delete(eventId)
  }
}
