// 来源: https://github.com/deepseek-ai/dsh-superagent-prototype@6337fc823ce20251c8de8085948165c81aaa701e:src/app/delivery.ts
// （MIT，第 3 级改造：SA AgentDelivery 的自有 source + 稳定 id + history/pending
// 双查 + flush 后回执语义，适配 pbots 的两种自有来源与消息形态。与上游差异：
// 去掉 user-RPC rpcId 兼容路径（P6-21 验收 ⑤：用户手发消息不算已投）、去掉
// steer/inject 模式与 authorize/accepted 回调（P6-10/P6-12 只需要 followup 唤醒式
// 投递）、去掉 per-Session 的 seen 缓存（worker ≤ 数十个，每次读日志换正确性）。
// 新增：wake 原语（P6-09 (f2)：inbox.remove + 同 id followup 重排唤醒）与
// projectEvent 日志投影（assignment/pending 的 fold 输入）。
//
// 分工（决策 27②）：本文件的 history + live-inbox 双查只作**投递前去重**，
// 不作已投依据；回报「已投」的权威判定是 pending.mjs 的主 session 日志 fold
// （claim 后崩溃的键在两张表里都不可见，P6-09 (f5-ii) 实证）。
/** Cross-session idempotent delivery on the dsh host (P6-21). */

/** Source kinds owned by this SDK's orchestration layer. */
export const OWN_SOURCE_KINDS = ['pbots-worker', 'pbots-main']

/**
 * The delivery id of a message: its own id when it carries a pbots source
 * kind, otherwise undefined (user-authored and host-internal messages are
 * never "delivered by us", SA deliveryId minus the legacy user-RPC branch).
 * @param {{ id?: unknown, source?: { kind?: unknown } } | undefined} message
 * @returns {string | undefined}
 */
export function deliveryIdOf(message) {
  if (!message || !OWN_SOURCE_KINDS.includes(message.source?.kind)) return undefined
  return String(message.id)
}

/**
 * Project one persisted session event into the flat shape the folds consume.
 * Unknown event types pass through as `{ seq, type }`.
 * @param {{ seq?: number, type: string, data?: any }} event
 */
export function projectEvent(event) {
  const d = event.data ?? {}
  switch (event.type) {
    case 'user/message':
      return {
        seq: event.seq, type: event.type,
        id: String(d.id ?? ''),
        sourceKind: String(d.source?.kind ?? ''),
        sourceItems: d.source?.items,
        text: (d.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join(''),
      }
    case 'agent/inbox/spliced':
      return {
        seq: event.seq, type: event.type,
        target: d.target, start: d.start,
        removedCount: d.removedCount ?? 0,
        outcome: d.outcome,
        inserted: (d.inserted ?? []).map((m) => ({ id: String(m.id ?? ''), kind: String(m.source?.kind ?? ''), items: m.source?.items })),
      }
    case 'turn/end':
      return { seq: event.seq, type: event.type, turn: d.turn, reason: d.reason?.kind }
    case 'turn/start':
      return { seq: event.seq, type: event.type, turn: d.turn }
    case 'step/start':
    case 'step/end':
      return { seq: event.seq, type: event.type, turn: d.turn, step: d.step ?? null }
    case 'approval/asked':
    case 'approval/decided':
      return { seq: event.seq, type: event.type, id: String(d.id ?? ''), outcome: d.outcome }
    case 'tool/call':
      return { seq: event.seq, type: event.type, turn: d.turn, callId: String(d.callId ?? ''), name: String(d.name ?? '') }
    case 'tool/result':
      return {
        seq: event.seq, type: event.type, turn: d.turn,
        callId: String(d.message?.toolCallId ?? ''),
        isError: d.message?.isError === true,
        text: (d.message?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('').slice(0, 4000),
      }
    default:
      return { seq: event.seq, type: event.type }
  }
}

/**
 * Idempotent message delivery across sessions and SDK restarts.
 * Dedupes against persisted history and the live pending inbox, delivers with
 * `agent.followup` (next-turn, wakes the agent), and acknowledges only after
 * `sessionPersistence.flush()` (决策 27④：flush 之后才算送达).
 */
export class Delivery {
  /**
   * @param {{ sessionPersistence: object, agents: { get(id: string): object } }} ctx
   * dsh plugin context; only the two services SA's AgentDelivery uses.
   */
  constructor(ctx) {
    this.ctx = ctx
    // P6-21.f1 (L-9): in-flight reservation per `${agent.id}:${messageId}`.
    // holds() 与 followup 之间隔着 await（flush + 全量读日志），两个并发 send
    // 同 (agent,id) 都会读到「未投过」→ 空闲目标 followup 两次、忙碌目标第二
    // 次撞宿主 already pending。预留保证恰一次投递：在途调用成功后来者得
    // skipped，失败后来者重试（不谎报已投）。
    this.inflight = new Map()
  }

  /**
   * Flush, then read one session's whole persisted log as projected events.
   * The flush first is SA's ordering (:45): in-memory events must reach the
   * log before a fresh read handle can see them.
   * @param {string} sessionId
   * @returns {Promise<object[]>}
   */
  async readLog(sessionId) {
    await this.ctx.sessionPersistence.flush()
    const handle = await this.ctx.sessionPersistence.open(sessionId, 'read')
    try {
      const out = []
      for (let offset = 0; ; ) {
        const { events } = await handle.read(offset, 512)
        if (!events.length) break
        for (const ev of events) out.push(projectEvent(ev))
        offset += events.length
      }
      return out
    } finally {
      await handle.close().catch(() => {})
    }
  }

  /**
   * Whether the message id is already delivered (persisted user/message) or
   * pending (live inbox). Pre-delivery dedupe only — see the module header.
   * @param {{ id: string, inbox: { nextTurn: object[], nextStep: object[] } }} agent
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async holds(agent, id) {
    // history side only counts own-kind messages (SA :50-54): a human prompt
    // landing as user/message must never mark its id as delivered (验收 ⑤).
    const inHistory = (await this.readLog(agent.id)).some(
      (ev) => ev.type === 'user/message' && deliveryIdOf({ id: ev.id, source: { kind: ev.sourceKind } }) === id,
    )
    const pending = [...agent.inbox.nextTurn, ...agent.inbox.nextStep].some((m) => deliveryIdOf(m) === id)
    return inHistory || pending
  }

  /**
   * Deliver one pbots-owned message at most once per its stable id, then flush.
   * Single-flighted per (agent.id, message id): concurrent sends of the same
   * id yield exactly one followup — the rest return `{skipped:true}` once the
   * in-flight one lands, or retry it if it failed (P6-21.f1, L-9).
   * @param {object} agent target agent (live or resumed).
   * @param {{ id: string, source: { kind: string } }} message
   * @returns {Promise<{ skipped: boolean }>} skipped = already held.
   */
  async send(agent, message) {
    const id = deliveryIdOf(message)
    if (!id) throw new Error('delivery.send requires a pbots-owned message source')
    const key = `${agent.id}:${id}`
    const running = this.inflight.get(key)
    if (running !== undefined) {
      try {
        await running
        return { skipped: true } // the concurrent call delivered (or held) it
      } catch {
        return this.send(agent, message) // it failed undelivered — take over
      }
    }
    const attempt = (async () => {
      if (await this.holds(agent, id)) return { skipped: true }
      // mutation: dispose guard removed
      agent.followup(message)
      await this.ctx.sessionPersistence.flush()
      return { skipped: false }
    })()
    this.inflight.set(key, attempt)
    try {
      return await attempt
    } finally {
      if (this.inflight.get(key) === attempt && await attempt.then(() => false, () => true)) this.inflight.delete(key) // mutation: only rejected attempts cleaned
    }
  }

  /**
   * Wake an idle agent around a pending message (P6-09 (f2) idiom, schedule
   * runtime.ts:329-333): durably remove it (lands `outcome:'canceled'`),
   * then re-insert the same id via followup. The assignment fold reads this
   * pair as a reorder, not consumption.
   * @param {object} agent
   * @param {string} id pending message id.
   * @returns {boolean} whether the message was pending and got rewoken.
   */
  wake(agent, id) {
    const message = [...agent.inbox.nextTurn, ...agent.inbox.nextStep].find((m) => String(m.id) === id)
    if (!message) return false
    agent.inbox.remove(message.id)
    agent.followup(message)
    return true
  }
}
