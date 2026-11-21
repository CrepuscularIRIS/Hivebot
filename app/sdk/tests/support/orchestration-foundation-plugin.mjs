// P6-21 test-only plugin: drives src/orchestration/delivery.mjs inside the
// real dsh runtime through a typert remote (so the unit test can exercise
// holds/send/flush against a live Loader). Not production code.
// 骨架复制自 work/p6-orchestration/evidence/p6-09/probe.mjs（P6-09，typert
// remote + createRequire 锚点写法），仅保留 control 通道。
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Delivery } from '../../src/orchestration/delivery.mjs'

const PKG_ROOT = join(realpathSync(new URL('..', import.meta.url).pathname), '..')
const require = createRequire(realpathSync(join(PKG_ROOT, 'node_modules', '@deepseek-ai', 'dsh-plugin-market', 'lib', 'index.js')))
const { TypertRemoteService, RemoteError } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-typert-protocol')))
const marker = '@deepseek-ai/dsh-typert-protocol/remote-methods'

export default class P621Plugin extends TypertRemoteService {
  static inject = ['tools', 'agents', 'sessionController', 'sessionPersistence']
  constructor(ctx) {
    super(ctx, 'p621foundation', { namespace: 'p621' })
    this.delivery = new Delivery(ctx)
  }

  /** Live agent or resume-by-id (cold session attach), probe agentOf pattern. */
  async agentOf(sessionId) {
    const live = this.ctx.agents.get(sessionId)
    if (live !== undefined) return live
    const found = await this.ctx.sessionController.resolveAgent(sessionId)
    if ('error' in found) throw new RemoteError('p621/not-found', String(found.error), { sessionId })
    return found.agent
  }

  async control(request) {
    const { op } = request
    if (op === 'deliver') {
      const agent = await this.agentOf(request.sessionId)
      return this.delivery.send(agent, request.message)
    }
    if (op === 'holds') {
      const agent = await this.agentOf(request.sessionId)
      return { holds: await this.delivery.holds(agent, request.id) }
    }
    if (op === 'read') {
      const events = await this.delivery.readLog(request.sessionId)
      return {
        events: events.filter((ev) => ['user/message', 'agent/inbox/spliced', 'turn/start', 'turn/end'].includes(ev.type)),
      }
    }
    throw new RemoteError('p621/invalid-args', `unknown op ${op}`, {})
  }
}
Object.defineProperty(P621Plugin.prototype, marker, { value: { version: 1, methods: [
  { method: 'control', invocation: { kind: 'direct' } },
] } })
