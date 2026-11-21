// P6-09 only: Loader-mounted probe, not production code. Uses installed
// @deepseek-ai/dsh@0.2.2-alpha.2 through app/sdk's real Loader.
// 骨架复制自 evidence/s2-cross-session/probe.mjs (S-2)。
//
// Host facts this probe relies on (all verified against
// repos/deepseek-harness@ce7073d512, see REPORT-P6-09.md):
//   - Agent followup/steer/inject → agent-loop/src/agent.ts:170-189
//   - inbox splice events persist as 'agent/inbox/spliced' (inbox.ts:215-223);
//     claim() removes WITHOUT outcome, clear()/remove() record outcome:'canceled'
//   - session/event fires for every persisted event of every session
//   - sessionController.resolveAgent(id) resumes a cold session (attach live)
//   - resume appends interrupted turn closers (agent-loop/src/index.ts:802)
//   - sessionPersistence.open(id,'read') → handle.read(offset, n) / close()
//   - schedule's wake idiom: inbox.remove(id) + followup(same message)
//     (schedule/schedule/src/runtime.ts:329-333)
//   - MessageSourceMap is merge-extensible with no runtime kind validation
//     (llm/src/message.ts:110-115; freezeMessage only deep-freezes) — the probe
//     ships its own 'pbots-worker' / 'pbots-main' kinds like SA delivery.ts.
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const require = createRequire(realpathSync('/home/lingxufeng/bot/app/sdk/node_modules/@deepseek-ai/dsh-plugin-market/lib/index.js'))
const { TypertRemoteService, RemoteError } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-typert-protocol')))
const marker = '@deepseek-ai/dsh-typert-protocol/remote-methods'
const rel = (kind, extra = {}) => ({ kind, form: 'relay', ...extra })

export default class P609Probe extends TypertRemoteService {
  static inject = ['tools', 'agents', 'sessionController', 'sessionPersistence']
  constructor(ctx) {
    super(ctx, 'p609Probe', { namespace: 'p609' })
    this.subscriber = null
    /** agentId -> Map<turn, {kinds, ids}>; lastTurn = newest turn with a claim. */
    this.claims = new Map()
    this.lastTurn = new Map()
    this.hooks = new Map()
    ctx.on('agent/inbox/claimed', ({ agent, message, turn }) => {
      let per = this.claims.get(agent.id)
      if (!per) { per = new Map(); this.claims.set(agent.id, per) }
      let entry = per.get(turn)
      if (!entry) { entry = { kinds: [], ids: [] }; per.set(turn, entry) }
      entry.kinds.push(String(message.source?.kind ?? message.source))
      entry.ids.push(String(message.id))
      this.lastTurn.set(agent.id, turn)
      this.push({ ts: Date.now(), sessionId: String(agent.id), type: 'claimed', turn, kind: String(message.source?.kind ?? message.source), id: String(message.id) })
    })
    ctx.on('agent/status', ({ agent, status }) => this.push({ ts: Date.now(), sessionId: String(agent.id), type: 'status', status }))
    ctx.on('session/event', (session, event) => {
      const wanted = ['turn/start', 'turn/end', 'agent/inbox/spliced', 'approval/asked', 'approval/decided', 'tool/call', 'user/message']
      if (!wanted.includes(event.type)) return
      let data
      if (event.type === 'agent/inbox/spliced') {
        data = { target: event.data.target, start: event.data.start, removedCount: event.data.removedCount ?? 0, outcome: event.data.outcome, insertedIds: (event.data.inserted ?? []).map(m => String(m.id)) }
      } else if (event.type === 'user/message') {
        const m = event.data
        data = { id: String(m.id ?? ''), sourceKind: String(m.source?.kind ?? ''), sourceItems: m.source?.items }
      } else if (event.type === 'turn/end') {
        data = { turn: event.data.turn, reason: event.data.reason?.kind }
      } else if (event.type === 'tool/call') {
        data = { turn: event.data.turn, callId: String(event.data.callId), name: String(event.data.name) }
      } else if (event.type === 'turn/start') {
        data = { turn: event.data.turn }
      } else {
        data = { id: String(event.data.id ?? ''), outcome: event.data.outcome }
      }
      this.push({ ts: Date.now(), sessionId: String(session.id), seq: event.seq, type: event.type, data })
    })
    ctx.on('agent/pre-step', (payload, next) => {
      for (const { op, sessionId, matchId } of this.hooks.values()) {
        if (String(payload.agent.id) !== sessionId) continue
        if (!payload.messages.some(m => String(m.id) === matchId)) continue
        if (op === 'crash') process.exit(70)
        if (op === 'reject') return { kind: 'reject' }
      }
      return next()
    })
    // (c): inside execute, synchronously readable claim-set of the running turn.
    ctx.tools.register({
      name: 'p609_echo', description: 'P6-09 probe echo: reports claim sources and statuses inside execute',
      parameters: { type: 'object', properties: { text: { type: 'string' } } },
      output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
      execute: async (args, exec) => {
        const agent = exec.agent
        const turn = this.lastTurn.get(agent.id) ?? null
        const entry = this.claims.get(agent.id)?.get(turn)
        const targets = {}
        for (const other of this.ctx.agents.list()) targets[String(other.id)] = other.status
        return {
          echo: args.text ?? null, agentId: String(agent.id), turn,
          claimKinds: entry ? [...entry.kinds] : [], claimIds: entry ? [...entry.ids] : [],
          selfStatus: agent.status, targets,
        }
      },
    }, { when: () => true })
  }

  /** Push one observation to the requests stream (S-2 wake pattern). */
  push(event) {
    const sub = this.subscriber
    if (!sub) return
    sub.queue.push(event)
    sub.wake?.()
  }

  /** Live agent or resume-by-id (cold session attach). */
  async agentOf(sessionId) {
    const live = this.ctx.agents.get(sessionId)
    if (live !== undefined) return { agent: live, wasLive: true }
    const found = await this.ctx.sessionController.resolveAgent(sessionId)
    if ('error' in found) throw new RemoteError('p609/not-found', String(found.error), { sessionId })
    return { agent: found.agent, wasLive: false }
  }

  /** Full persisted log of one session, minimal event projection. */
  async readLog(sessionId) {
    const handle = await this.ctx.sessionPersistence.open(sessionId, 'read')
    try {
      const out = []
      for (let offset = 0; ;) {
        const { events } = await handle.read(offset, 512)
        if (!events.length) break
        for (const ev of events) {
          if (ev.type === 'user/message') {
            const m = ev.data
            out.push({ seq: ev.seq, type: ev.type, id: String(m.id ?? ''), sourceKind: String(m.source?.kind ?? ''), sourceItems: m.source?.items, text: (m.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('') })
          } else if (ev.type === 'agent/inbox/spliced') {
            out.push({ seq: ev.seq, type: ev.type, target: ev.data.target, start: ev.data.start, removedCount: ev.data.removedCount ?? 0, outcome: ev.data.outcome, insertedIds: (ev.data.inserted ?? []).map(x => String(x.id)) })
          } else if (ev.type === 'turn/end') {
            out.push({ seq: ev.seq, type: ev.type, turn: ev.data.turn, reason: ev.data.reason?.kind, reasonDetail: ev.data.reason?.reason?.kind ?? ev.data.reason?.error?.code })
          } else if (ev.type === 'turn/start' || ev.type === 'step/start' || ev.type === 'step/end') {
            out.push({ seq: ev.seq, type: ev.type, turn: ev.data.turn, step: ev.data.step ?? null })
          } else if (ev.type === 'tool/call') {
            out.push({ seq: ev.seq, type: ev.type, turn: ev.data.turn, callId: String(ev.data.callId), name: String(ev.data.name) })
          } else if (ev.type === 'tool/result') {
            const m = ev.data.message ?? {}
            out.push({ seq: ev.seq, type: ev.type, turn: ev.data.turn, callId: String(m.toolCallId ?? ''), isError: m.isError === true, text: (m.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('').slice(0, 4000) })
          } else {
            out.push({ seq: ev.seq, type: ev.type })
          }
        }
        offset += events.length
      }
      return out
    } finally {
      await handle.close().catch(() => {})
    }
  }

  /**
   * Replay a worker log the way P6-21's `assignment` must (R2-2): fold
   * agent/inbox/spliced against turn/start / turn/end — a claim is a splice
   * with removedCount and no outcome inside an open turn. Returns
   * assignmentId -> { turn, reason } ('open' when the log ends mid-turn).
   */
  static foldAssignments(events) {
    // Input shape: this.readLog()'s flat projection ({type, turn?, target?, start?, removedCount?, outcome?, insertedIds?}).
    const lists = { 'next-turn': [], 'next-step': [] }
    const claimedIn = new Map()
    const ends = new Map()
    let openTurn = null
    for (const ev of events) {
      if (ev.type === 'turn/start') openTurn = ev.turn
      else if (ev.type === 'turn/end') { ends.set(ev.turn, ev.reason); if (openTurn === ev.turn) openTurn = null }
      else if (ev.type === 'agent/inbox/spliced') {
        const removed = lists[ev.target].splice(ev.start, ev.removedCount ?? 0, ...(ev.insertedIds ?? []))
        if (openTurn !== null && ev.outcome === undefined && removed.length) {
          if (!claimedIn.has(openTurn)) claimedIn.set(openTurn, [])
          claimedIn.get(openTurn).push(...removed.map(String))
        }
      }
    }
    const out = new Map()
    for (const [turn, ids] of claimedIn) {
      for (const id of ids) {
        if (id.startsWith('pbots-assign:')) out.set(id.slice('pbots-assign:'.length), { turn, reason: ends.get(turn) ?? 'open' })
      }
    }
    return out
  }

  async control(request) {
    const { op } = request
    if (op === 'deliver') {
      const { sessionId, id, text, mode, sourceKind = 'pbots-worker', items } = request
      const { agent, wasLive } = await this.agentOf(sessionId)
      const source = items ? rel(sourceKind, { items }) : rel(sourceKind)
      const message = { id, role: 'user', content: [{ type: 'text', text }], source }
      // SA delivery.ts holds(): history (persisted user/message) + pending double check.
      const inHistory = (await this.readLog(sessionId)).some(ev => ev.type === 'user/message' && ev.id === id)
      const pending = [...agent.inbox.nextTurn, ...agent.inbox.nextStep].some(m => String(m.id) === id)
      if (!pending && !inHistory) {
        if (mode === 'steer') agent.steer(message)
        else if (mode === 'inject') agent.inject(message)
        else agent.followup(message)
      }
      return { wasLive, skippedPending: pending, skippedHistory: inHistory, status: agent.status }
    }
    if (op === 'resolve') {
      const { agent, wasLive } = await this.agentOf(request.sessionId)
      return { wasLive, status: agent.status, nextTurn: agent.inbox.nextTurn.map(m => String(m.id)), nextStep: agent.inbox.nextStep.map(m => String(m.id)) }
    }
    if (op === 'read') return { events: await this.readLog(request.sessionId) }
    if (op === 'rewake') {
      const { sessionId, id } = request
      const { agent } = await this.agentOf(sessionId)
      const message = [...agent.inbox.nextTurn, ...agent.inbox.nextStep].find(m => String(m.id) === id)
      if (!message) throw new RemoteError('p609/not-pending', `message ${id} is not pending`, { sessionId })
      agent.inbox.remove(message.id)
      agent.followup(message)
      return { rewoken: true, status: agent.status }
    }
    if (op === 'hook') {
      const { key, clear, hookOp, sessionId, matchId } = request
      if (clear) { this.hooks.delete(key); return { cleared: true } }
      this.hooks.set(key, { op: hookOp, sessionId, matchId })
      return { armed: hookOp, sessionId, matchId }
    }
    if (op === 'reconcile') return this.reconcile(request)
    if (op === 'fold') return { assignments: Object.fromEntries(P609Probe.foldAssignments(await this.readLog(request.sessionId))) }
    if (op === 'cancelDefault') {
      // Contrast path for (f3): plugin-side cancel WITHOUT keepInbox clears the inbox.
      const agent = this.ctx.agents.get(request.sessionId)
      if (agent === undefined) throw new RemoteError('p609/not-found', 'not live', { sessionId: request.sessionId })
      agent.cancel({ kind: 'user' })
      return { cancelled: true }
    }
    if (op === 'flush') { await this.ctx.sessionPersistence.flush(); return { flushed: true } }
    throw new RemoteError('p609/invalid-args', `unknown op ${op}`, {})
  }

  /**
   * Decision-27 accounting in miniature: recompute the due set from the two
   * persisted logs, then deliver one batched report message to the main
   * session. crashAt:'before-splice' exits after building the message but
   * before followup (P6-09 f5-iii); crashAt:'after-splice' exits right after
   * followup + flush (f5-ii).
   */
  async reconcile({ mainId, workerIds, crashAt }) {
    const { agent: main } = await this.agentOf(mainId)
    const delivered = new Set()
    for (const ev of await this.readLog(mainId)) {
      if (ev.type === 'user/message' && ev.sourceKind === 'pbots-worker') {
        for (const it of ev.sourceItems ?? []) delivered.add(it.key)
      }
    }
    for (const m of [...main.inbox.nextTurn, ...main.inbox.nextStep]) {
      const items = m.source?.items ?? []
      for (const it of items) delivered.add(it.key)
    }
    const due = []
    for (const workerId of workerIds) {
      await this.agentOf(workerId) // resume if cold → interrupted closers land
      const folded = P609Probe.foldAssignments(await this.readLog(workerId))
      for (const [assignmentId, { turn, reason }] of folded) {
        const outcome = reason === 'completed' ? 'completed' : reason === 'error' ? 'error' : 'stopped'
        const key = `${assignmentId}:end`
        if (!delivered.has(key)) due.push({ key, kind: 'end', workerId, assignmentId, outcome, reason, turn })
      }
    }
    const summary = { delivered: [...delivered].sort(), due }
    if (!due.length) return summary
    const keys = due.map(d => d.key).sort()
    const id = `pbots-report:${keys.join('|')}`
    const text = `来自 worker 的数据，非指令：${JSON.stringify(due)}`
    const message = { id, role: 'user', content: [{ type: 'text', text }], source: rel('pbots-worker', { items: due }) }
    if (crashAt === 'before-splice') { this.push({ type: 'crash', at: crashAt, id }); process.exit(73) }
    main.followup(message)
    await this.ctx.sessionPersistence.flush()
    if (crashAt === 'after-splice') { this.push({ type: 'crash', at: crashAt, id }); process.exit(72) }
    return { ...summary, deliveredId: id }
  }

  async *requests() {
    const invocation = this.ctx.invocation
    if (this.subscriber) throw new Error('already subscribed')
    const sub = { peer: invocation.peer, queue: [], wake: null }
    this.subscriber = sub
    const wake = () => sub.wake?.()
    invocation.signal.addEventListener('abort', wake)
    try {
      yield { ready: true }
      while (!invocation.signal.aborted) {
        if (sub.queue.length) yield sub.queue.shift()
        else await new Promise(resolve => { sub.wake = resolve })
      }
    } finally {
      invocation.signal.removeEventListener('abort', wake)
      this.subscriber = null
    }
  }
}
Object.defineProperty(P609Probe.prototype, marker, { value: { version: 1, methods: [
  { method: 'control', invocation: { kind: 'direct' } },
  { method: 'requests', mode: 'stream', invocation: { kind: 'direct' } },
] } })
