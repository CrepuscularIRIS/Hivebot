// P6-10 test-only inspect plugin: tool-table visibility (S2 probe control
// pattern) + persisted-log reading (P6-21 foundation plugin pattern). Mounted
// only by the live test overlay, never production. P6-10.f1 追加两个 op：
// 'slots'（读共享容量）/ 'inject'（向 session 投一条 pbots-worker 来源的回报，
// 复刻决策 27④ 的 followup 形态——污染回合探针用）。
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { sharedSlots } from '../../src/orchestration/slots.mjs'

const PKG_ROOT = join(realpathSync(new URL('..', import.meta.url).pathname), '..')
const require = createRequire(realpathSync(join(PKG_ROOT, 'node_modules', '@deepseek-ai', 'dsh-plugin-market', 'lib', 'index.js')))
const { TypertRemoteService, RemoteError } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-typert-protocol')))
const marker = '@deepseek-ai/dsh-typert-protocol/remote-methods'

export default class P610Inspect extends TypertRemoteService {
  static inject = ['tools', 'agents', 'sessionController', 'sessionPersistence']
  constructor(ctx) {
    super(ctx, 'p610inspect', { namespace: 'p610' })
  }

  async control(request) {
    const { op } = request
    if (op === 'visible') {
      // S2 §3.1 pattern: resolve the current step's admitted set for one session.
      const agent = this.ctx.agents.get(request.sessionId)
      if (agent === undefined) throw new RemoteError('p610/not-found', `no live agent ${request.sessionId}`, {})
      const toolSet = await this.ctx.tools.resolve({ agent, modelSelection: { provider: 'p2fake', model: 'p2fake' }, signal: new AbortController().signal })
      try {
        return { visible: this.ctx.tools.schemas(agent, toolSet).some((tool) => tool.name === request.tool) }
      } finally {
        toolSet.dispose()
      }
    }
    if (op === 'slots') {
      return { used: sharedSlots().used }
    }
    if (op === 'inject') {
      const agent = this.ctx.agents.get(request.sessionId)
      if (agent === undefined) throw new RemoteError('p610/not-found', `no live agent ${request.sessionId}`, {})
      agent.followup({ id: `p610-f1-taint-${Date.now()}`, role: 'user', source: { kind: 'pbots-worker', items: [] }, content: [{ type: 'text', text: 'worker report (test injection)' }] })
      return { ok: true }
    }
    if (op === 'read') {
      await this.ctx.sessionPersistence.flush()
      const handle = await this.ctx.sessionPersistence.open(request.sessionId, 'read')
      try {
        const events = []
        for (let offset = 0; ; ) {
          const { events: batch } = await handle.read(offset, 512)
          if (!batch.length) break
          events.push(...batch)
          offset += batch.length
        }
        // tool/result 的 error 字段原样带回（断言错误码用）
        return {
          events: events.map((ev) => ev.type === 'tool/result'
            ? { seq: ev.seq, type: ev.type, callId: String(ev.data?.message?.toolCallId ?? ''), isError: ev.data?.message?.isError === true, error: ev.data?.error ?? null, text: (ev.data?.message?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('') }
            : ev.type === 'user/message'
              ? { seq: ev.seq, type: ev.type, id: String(ev.data?.id ?? ''), sourceKind: String(ev.data?.source?.kind ?? '') }
              : { seq: ev.seq, type: ev.type, reason: ev.data?.reason?.kind },
        ),
        }
      } finally {
        await handle.close().catch(() => {})
      }
    }
    throw new RemoteError('p610/invalid-args', `unknown op ${op}`, {})
  }
}
Object.defineProperty(P610Inspect.prototype, marker, { value: { version: 1, methods: [
  { method: 'control', invocation: { kind: 'direct' } },
] } })
