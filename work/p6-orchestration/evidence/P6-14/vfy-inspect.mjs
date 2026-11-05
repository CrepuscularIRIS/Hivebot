// Verification-only extension; no product modifications.
import Base from '/tmp/bot-wt/P6-14/app/sdk/tests/support/orchestration-create-inspect.mjs'
export default class Inspect extends Base {
  async control(request) {
    if (request.op === 'vfy-list') {
      const agent = this.ctx.agents.get(request.sessionId)
      const set = await this.ctx.tools.resolve({ agent, modelSelection: { provider: 'p2fake', model: 'p2fake' }, signal: new AbortController().signal })
      try { return { names: this.ctx.tools.schemas(agent, set).map(t => t.name).sort() } }
      finally { set.dispose() }
    }
    if (request.op === 'vfy-restrict') {
      const agent = this.ctx.agents.get(request.sessionId)
      if (request.clear) { this.undoRestriction?.(); return { cleared: true } }
      try {
        this.undoRestriction = agent.ctx.tools.restrict({ deny: ['subagent', 'workflow'] })
        return { ok: true, hasAgentCtx: !!agent.ctx }
      } catch (e) { return { ok: false, error: String(e), hasAgentCtx: !!agent.ctx } }
    }
    return super.control(request)
  }
}
Object.defineProperty(Inspect.prototype, '@deepseek-ai/dsh-typert-protocol/remote-methods', { value: { version: 1, methods: [{ method: 'control', invocation: { kind: 'direct' } }] } })
