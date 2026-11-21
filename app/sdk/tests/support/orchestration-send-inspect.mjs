// P6-11 test-only inspect plugin：'redeliver'——用生产 Delivery 把同一条
// pbots-assign 消息（同 assignmentId）再投一次，验幂等（同 id 两次恰一条）。
// 只挂在 live 测试 overlay，不进生产。读日志 / 可见性 / 容量复用 P6-10 的
// p610/control（orchestration-create-inspect.mjs）。
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Delivery } from '../../src/orchestration/delivery.mjs'
import { buildAssignMessage } from '../../src/orchestration/assignment.mjs'

const PKG_ROOT = join(realpathSync(new URL('..', import.meta.url).pathname), '..')
const require = createRequire(realpathSync(join(PKG_ROOT, 'node_modules', '@deepseek-ai', 'dsh-plugin-market', 'lib', 'index.js')))
const { TypertRemoteService, RemoteError } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-typert-protocol')))
const marker = '@deepseek-ai/dsh-typert-protocol/remote-methods'

export default class P611Inspect extends TypertRemoteService {
  static inject = ['agents', 'sessionController', 'sessionPersistence']
  constructor(ctx) {
    super(ctx, 'p611inspect', { namespace: 'p611' })
  }

  async control(request) {
    if (request.op === 'redeliver') {
      const { sessionId, assignmentId, mainBotId } = request
      if (typeof sessionId !== 'string' || typeof assignmentId !== 'string') {
        throw new RemoteError('p611/invalid-args', 'redeliver expects {sessionId, assignmentId, mainBotId}', {})
      }
      let agent = this.ctx.agents.get(sessionId)
      if (agent === undefined) {
        const found = await this.ctx.sessionController.resolveAgent(sessionId)
        if ('error' in found) throw new RemoteError('p611/not-found', `no agent ${sessionId}: ${String(found.error)}`, {})
        agent = this.ctx.agents.get(sessionId) ?? found.agent
      }
      const delivery = new Delivery(this.ctx)
      const out = await delivery.send(agent, buildAssignMessage({ assignmentId, mainBotId: mainBotId ?? '', text: 'redeliver probe' }))
      return { skipped: out.skipped }
    }
    throw new RemoteError('p611/invalid-args', `unknown op ${request.op}`, {})
  }
}
Object.defineProperty(P611Inspect.prototype, marker, { value: { version: 1, methods: [
  { method: 'control', invocation: { kind: 'direct' } },
] } })
