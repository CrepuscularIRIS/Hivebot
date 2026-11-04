// P6-10 test-only inspect plugin: tool-table visibility (S2 probe control
// pattern) + persisted-log reading (P6-21 foundation plugin pattern). Mounted
// only by the live test overlay, never production. P6-10.f1 追加两个 op：
// 'slots'（读共享容量）/ 'inject'（向 session 投一条 pbots-worker 来源的回报，
// 复刻决策 27④ 的 followup 形态——污染回合探针用）。
// P6-12 追加：'inject' 可自定义 kind/id/items（R2-1 反向用例与 ⑦ 构造）；
// 'resolve'（live inbox 投影）；'conn-count'（fake 连接器写工具计数，污染回合
// 副作用断言）；'arm-claim-crash'（主 bot 认领 pbots-report:* 即 exit——claim
// 窗口崩溃，P6-09 (f5-ii)/(g) 同法）；'arm-reject'（pre-step reject，blocked
// 终态构造，P6-09 (b) 同法）；'read' 的 user/message 投影带 sourceItems。
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
    this.connWrites = 0
    this.claimCrashArmed = false
    this.hooks = new Map() // key -> { sessionId, matchId }
    ctx.on('agent/inbox/claimed', ({ agent, message }) => {
      if (this.claimCrashArmed && String(message?.id ?? '').startsWith('pbots-report:')) process.exit(88)
    })
    ctx.on('agent/pre-step', (payload, next) => {
      for (const { sessionId, matchId } of this.hooks.values()) {
        if (String(payload.agent.id) !== sessionId) continue
        if (!payload.messages.some((m) => String(m.id) === matchId)) continue
        return { kind: 'reject' }
      }
      return next()
    })
    ctx.tools.register({
      name: 'p612_conn_write',
      description: 'P6-12 test fake connector write tool (counts side effects)',
      parameters: { type: 'object', properties: { payload: { type: 'string' } } },
      output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
      execute: async () => { this.connWrites += 1; return { ok: true } },
    }, { when: () => true })
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
      const kind = request.kind ?? 'pbots-worker'
      const source = request.items !== undefined ? { kind, form: 'relay', items: request.items } : { kind, form: 'relay' }
      agent.followup({
        id: request.id ?? `p610-f1-taint-${Date.now()}`,
        role: 'user',
        source,
        content: [{ type: 'text', text: request.text ?? 'worker report (test injection)' }],
      })
      return { ok: true }
    }
    if (op === 'resolve') {
      const agent = this.ctx.agents.get(request.sessionId)
      if (agent === undefined) throw new RemoteError('p610/not-found', `no live agent ${request.sessionId}`, {})
      return {
        status: agent.status,
        nextTurn: agent.inbox.nextTurn.map((m) => String(m.id)),
        nextStep: agent.inbox.nextStep.map((m) => String(m.id)),
      }
    }
    if (op === 'conn-count') {
      return { connWrites: this.connWrites }
    }
    if (op === 'arm-claim-crash') {
      this.claimCrashArmed = request.armed !== false
      return { armed: this.claimCrashArmed }
    }
    if (op === 'arm-reject') {
      const { key, sessionId, matchId, clear } = request
      if (clear) { this.hooks.delete(key); return { cleared: true } }
      this.hooks.set(key, { sessionId, matchId })
      return { armed: true }
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
        // tool/result 的 error 字段原样带回（断言错误码用）；user/message 带
        // sourceItems（P6-12 验收 ⑧：items[] 齐）
        return {
          events: events.map((ev) => ev.type === 'tool/result'
            ? { seq: ev.seq, type: ev.type, callId: String(ev.data?.message?.toolCallId ?? ''), isError: ev.data?.message?.isError === true, error: ev.data?.error ?? null, text: (ev.data?.message?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('') }
            : ev.type === 'user/message'
              ? { seq: ev.seq, type: ev.type, id: String(ev.data?.id ?? ''), sourceKind: String(ev.data?.source?.kind ?? ''), items: ev.data?.source?.items }
              : ev.type === 'approval/asked' || ev.type === 'approval/decided'
                ? { seq: ev.seq, type: ev.type, id: String(ev.data?.id ?? ''), outcome: ev.data?.outcome ?? null }
                : ev.type === 'agent/inbox/spliced'
                  ? { seq: ev.seq, type: ev.type, target: ev.data?.target, outcome: ev.data?.outcome ?? null, insertedIds: (ev.data?.inserted ?? []).map((m) => String(m.id)) }
                : { seq: ev.seq, type: ev.type, turn: ev.data?.turn ?? null, reason: ev.data?.reason?.kind, callId: String(ev.data?.callId ?? ''), name: String(ev.data?.name ?? '') },
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
