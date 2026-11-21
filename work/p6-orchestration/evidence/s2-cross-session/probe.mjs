// S-2 only: Loader-mounted probe, not production code. Uses installed alpha.2.
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const require = createRequire(realpathSync('/home/lingxufeng/bot/app/sdk/node_modules/@deepseek-ai/dsh-plugin-market/lib/index.js'))
const { TypertRemoteService, RemoteError } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-typert-protocol')))
const marker = '@deepseek-ai/dsh-typert-protocol/remote-methods'
export default class S2Probe extends TypertRemoteService {
  static inject = ['tools', 'agents', 'agentPresets', 'connection', 'webServer']
  constructor(ctx) {
    super(ctx, 's2Probe', { namespace: 's2' })
    this.mainId = null
    this.subscriber = null
    this.pending = new Map()
    this.lifts = new Map()
    ctx.inject(['connection', 'webServer'], inner => { inner.connection.rpc.handle('/s2-rpc', async (endpoint, payload, _signal, peer) => ({ ok: true, value: { endpoint, payload, owner: peer.principal.kind === 'owner' } })) })
  }
  async control(request) {
    const { op, sessionId } = request
    const agent = sessionId ? this.ctx.agents.get(sessionId) : undefined
    if (op === 'install') {
      this.ctx.tools.register({
        name: 's2_new', description: 'S2 proof tool', parameters: { type: 'object', properties: {} },
        output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
        execute: async (_args, exec) => {
          if (exec.agent?.id !== this.mainId) throw new RemoteError('pbots/denied', 'not current main')
          const sub = this.subscriber
          if (!sub) throw new RemoteError('main-unavailable', 'no subscriber')
          const id = String(this.pending.size + 1)
          const pending = Promise.withResolvers()
          this.pending.set(id, { ...pending, peer: sub.peer })
          sub.queue.push({ requestId: id, source: exec.agent.id })
          sub.wake?.()
          return pending.promise
        },
      }, { when: ({ agent }) => agent.id === this.mainId })
      return { installed: true }
    }
    if (op === 'main') { this.mainId = sessionId; return { changed: true } }
    if (!agent) throw new Error('no live agent')
    if (op === 'deny') this.lifts.set(sessionId, agent.ctx.tools.restrict({ deny: ['s2_new'] }))
    if (op === 'lift') { this.lifts.get(sessionId)?.(); this.lifts.delete(sessionId) }
    const toolSet = await this.ctx.tools.resolve({ agent, modelSelection: { provider: 'p2fake', model: 'p2fake' }, signal: new AbortController().signal })
    try { return { visible: this.ctx.tools.schemas(agent, toolSet).some(tool => tool.name === 's2_new') } }
    finally { toolSet.dispose() }
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
      for (const [id, p] of this.pending) { p.reject(new RemoteError('main-unavailable', 'stream closed')); this.pending.delete(id) }
    }
  }
  async respond(request) {
    const pending = this.pending.get(request.requestId)
    if (!pending || pending.peer !== this.ctx.invocation.peer) throw new RemoteError('pbots/denied', 'wrong peer or stale request')
    this.pending.delete(request.requestId)
    pending.resolve(request.value)
    return { accepted: true }
  }
}
Object.defineProperty(S2Probe.prototype, marker, { value: { version: 1, methods: [
  { method: 'control', invocation: { kind: 'direct' } },
  { method: 'requests', mode: 'stream', invocation: { kind: 'direct' } },
  { method: 'respond', invocation: { kind: 'direct' } },
] } })
