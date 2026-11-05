import Orch from '/tmp/bot-wt/P6-11/app/sdk/src/orchestration/main-channel.mjs'
export default class Probe extends Orch {
  constructor(ctx, config) { super(ctx, config); this.gated = new Set(); this.entries = []; this.active = 0; this.maxActive = 0; this.waiters = [] }
  async agentOf(id) {
    if (this.gated.has(id)) {
      this.entries.push(id); this.active++; this.maxActive = Math.max(this.maxActive, this.active)
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('serial execution: third send never entered barrier')), 5000)
        this.waiters.push(() => { clearTimeout(timer); resolve() })
        if (this.entries.length === 3) this.waiters.splice(0).forEach(fn => fn())
      })
      this.active--
    }
    return super.agentOf(id)
  }
  async control(request) {
    const r = request
    if (r.op === 'arm') { this.gated = new Set(r.ids); return { ok: true } }
    if (r.op === 'assigns') return (await this.delivery.readLog(r.id)).filter(e => e.type === 'user/message' && e.sourceKind === 'pbots-main')
    if (r.op === 'stats') return { entries: this.entries, maxActive: this.maxActive, used: this.slots.used }
    const a = await super.agentOf(r.id)
    if (r.op === 'pending') a.inbox.splice('next-turn', 0, 0, [{ id: 'vfy-user-pending', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'user just sent this' }] }])
    if (r.op === 'clear') a.inbox.remove('vfy-user-pending')
    return { status: a.status, pending: a.inbox.nextTurn.length }
  }
}
Object.defineProperty(Probe.prototype, '@deepseek-ai/dsh-typert-protocol/remote-methods', { value: { version: 1, methods: [
  { method: 'control', exportName: 'vfy.control', invocation: { kind: 'direct' } },
] } })
