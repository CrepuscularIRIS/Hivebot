// Verification-only: distinguish real global registry from agent preset scope.
import Base from './vfy-inspect.mjs'
import { applyWorkerRestriction, workerRestrictDeny } from '/tmp/bot-wt/P6-14/app/sdk/src/orchestration/envelope.mjs'
export default class Inspect extends Base {
  async control(request) {
    if (request.op === 'registry-scope') {
      const agent = this.ctx.agents.get(request.sessionId)
      return {
        global: this.ctx.tools.definitions().map(t => t.name).sort(),
        scoped: this.ctx.tools.definitions(agent).map(t => t.name).sort(),
      }
    }
    if (request.op === 'registry-restrict') {
      const agent = this.ctx.agents.get(request.sessionId)
      this.registryUndo?.()
      this.registryUndo = undefined
      if (request.mode === 'wrong-global') {
        const deny = workerRestrictDeny(this.ctx.tools.definitions().map(t => t.name))
        this.registryUndo = agent.ctx.tools.restrict({ deny })
        return { deny }
      }
      if (request.mode === 'correct-agent') {
        this.registryUndo = applyWorkerRestriction(agent, this.ctx.tools)
        return { applied: !!this.registryUndo }
      }
      return { cleared: true }
    }
    return super.control(request)
  }
}
Object.defineProperty(Inspect.prototype, '@deepseek-ai/dsh-typert-protocol/remote-methods', { value: { version: 1, methods: [{ method: 'control', invocation: { kind: 'direct' } }] } })
