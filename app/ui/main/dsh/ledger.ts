// $events 台账（U-00 类型冻结；U-12 写入原帧 tap 的联调；P5-07 按事件类别判别）。
// ApprovalOutcome 取自 https://github.com/deepseek-ai/deepseek-harness@ce7073d51254c26cd63b22a60835b8f948deb447:packages/interaction/user-approval/src/types.ts:32
export type ApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'

/** 入账的 waterfall 事件类别（P5-07；上游 allowlist 其余事件为 emit 或不入账，R7 ②）。 */
export type LedgerEventKind = 'approval/request' | 'user-questions/request'

/** $events 流下行 item 的形状（GW/stream-protocol.ts:10-75）。提问 request 为上游投影后的
 * JSON 字段（questions/wait 等；agent/signal 已移除，GW/stream-protocol.ts:146-171），台账不读其内容。 */
export type EventsItem =
  | { type: 'ready'; clientId: string }
  | { type: 'waterfall'; event: 'approval/request'; eventId: string; agentId: string; request: { toolName: string; callId?: string; reason?: string; displayReason?: string } }
  | { type: 'waterfall'; event: 'user-questions/request'; eventId: string; agentId: string; request: Readonly<Record<string, unknown>> }
  | { type: 'cancel'; eventId: string }

/** P5-07：审批条目带 toolName/callId；提问条目没有 toolName（提问 request 无此字段，R7 ③）。 */
export type LedgerEntry =
  | { readonly event: 'approval/request'; readonly eventId: string; readonly agentId: string; readonly toolName: string; readonly callId?: string; readonly receivedAt: number }
  | { readonly event: 'user-questions/request'; readonly eventId: string; readonly agentId: string; readonly receivedAt: number }

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
        this.pending.set(item.eventId, {
          event: 'user-questions/request', eventId: item.eventId, agentId: item.agentId,
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
