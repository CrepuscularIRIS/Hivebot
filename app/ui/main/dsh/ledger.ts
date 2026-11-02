// $events 台账（U-00 类型冻结；U-12 写入原帧 tap 的联调）。
// ApprovalOutcome 取自 https://github.com/deepseek-ai/deepseek-harness@ce7073d51254c26cd63b22a60835b8f948deb447:packages/interaction/user-approval/src/types.ts:32
export type ApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'

/** $events 流下行 item 的形状（GW/stream-protocol.ts:10-75）。 */
export type EventsItem =
  | { type: 'ready'; clientId: string }
  | { type: 'waterfall'; event: 'approval/request'; eventId: string; agentId: string; request: { toolName: string; callId?: string; reason?: string; displayReason?: string } }
  | { type: 'cancel'; eventId: string }

export interface LedgerEntry {
  readonly eventId: string
  readonly agentId: string
  readonly toolName: string
  readonly callId?: string
  readonly receivedAt: number
}

/** ready clientId + 未决 eventId 台账；$events/result 的 main 校验数据源（C §2.2）。 */
export class EventsLedger {
  private clientId: string | undefined
  private readonly pending = new Map<string, LedgerEntry>()

  get readyClientId(): string | undefined { return this.clientId }

  pendingEvents(): readonly LedgerEntry[] { return [...this.pending.values()] }

  /** 喂 $events 下行 item（U-12 会接 socket tap；spike 里由桥直接喂）。 */
  record(item: EventsItem): void {
    if (item.type === 'ready') {
      this.clientId = item.clientId
      return
    }
    if (item.type === 'waterfall') {
      this.pending.set(item.eventId, {
        eventId: item.eventId, agentId: item.agentId, toolName: item.request.toolName,
        ...(item.request.callId !== undefined ? { callId: item.request.callId } : {}),
        receivedAt: Date.now(),
      })
      return
    }
    this.pending.delete(item.eventId)
  }

  /** §2.2 校验：outcome 恰为 allowed-once|rejected；clientId 匹配 ready；eventId 未决（成功即消费，防重复作答）。 */
  validateResult(clientId: unknown, eventId: unknown, value: unknown): { ok: true } | { ok: false; reason: string } {
    if (this.clientId === undefined) return { ok: false, reason: 'no $events client ready' }
    if (clientId !== this.clientId) return { ok: false, reason: 'clientId mismatch' }
    if (typeof eventId !== 'string' || !this.pending.has(eventId)) return { ok: false, reason: 'eventId not pending' }
    if (value !== 'allowed-once' && value !== 'rejected') {
      return { ok: false, reason: `outcome value must be 'allowed-once' or 'rejected', got ${JSON.stringify(value)}` }
    }
    this.pending.delete(eventId)
    return { ok: true }
  }
}
