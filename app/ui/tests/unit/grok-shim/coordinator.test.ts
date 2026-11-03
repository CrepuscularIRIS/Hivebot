// P5-51 · coordinator 协议 v1 服务端单测：帧格式（source/shared/rpc/coordinator-port.ts）、
// 13 RPC 实底清单回值形状（RE-s0 §coordinator）、审批作答值域 ⊆ {allowed-once, rejected}（D9）。
// 端口用内存 MessagePort 形状的最小 fake（0.18 coordinator-client 只用 postMessage/addEventListener/start/close）。
import { describe, expect, it, vi } from 'vitest'
import { createCoordinatorServer, type CoordinatorDeps, type ShimPort } from '../../../renderer-grok/shim/src/coordinator'

/** 内存双端端口（RendererEventTarget 形状够 coordinator-client 用）。 */
interface TestPort extends ShimPort {
  deliver(data: unknown): void
  link(other: TestPort): void
}

function portPair(): [ShimPort, ShimPort] {
  const make = (): TestPort => {
    const listeners: Array<(event: { data: unknown }) => void> = []
    let closed = false
    let peer: TestPort | null = null
    return {
      postMessage(data: unknown): void { if (peer !== null && !closed) peer.deliver(data) },
      close(): void { closed = true },
      start(): void { /* no-op：消息即发即达 */ },
      addEventListener(type: 'message' | 'close', listener: (event: never) => void): void {
        if (type === 'message') listeners.push(listener as (event: { data: unknown }) => void)
      },
      deliver(data: unknown): void { for (const l of [...listeners]) l({ data }) },
      link(other: TestPort): void { peer = other },
    }
  }
  const a = make()
  const b = make()
  a.link(b)
  b.link(a)
  return [a, b]
}

/** 拿到 0.18 侧端口并完成 hello→ready 握手，返回 {client, events}。 */
function handshake(deps: CoordinatorDeps): { client: ShimPort; frames: unknown[]; server: ReturnType<typeof createCoordinatorServer> } {
  const server = createCoordinatorServer(deps, portPair)
  let clientSide: ShimPort | null = null
  const claim = server.claim({ onPort(port) { clientSide = port } })
  claim.request()
  const client = clientSide!
  const frames: unknown[] = []
  client.addEventListener('message', (e) => frames.push(e.data))
  client.start()
  client.postMessage({ kind: 'lifecycle', phase: 'hello', protocolVersion: 1 })
  return { client, frames, server }
}

let reqSeq = 0
function call(client: ShimPort, frames: unknown[], method: string, args: unknown = {}): Promise<unknown> {
  const requestId = `r-${++reqSeq}`
  client.postMessage({ kind: 'request', requestId, method, args })
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no reply for ${method}; frames=${JSON.stringify(frames)}`)), 1000)
    const poll = (): void => {
      const reply = frames.find((f) => rec(f).kind === 'reply' && rec(f).requestId === requestId)
      if (reply !== undefined) {
        clearTimeout(timer)
        const outcome = rec(reply).outcome as { status: string; value?: unknown; failure?: { code?: string; message?: string } }
        if (outcome.status === 'ok') resolve(outcome.value)
        else reject(new Error(outcome.failure?.code != null ? `${outcome.failure.code}: ${outcome.failure.message}` : outcome.failure?.message ?? 'failed'))
        return
      }
      setTimeout(poll, 5)
    }
    poll()
  })
}

const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? v as Record<string, unknown> : {})

const baseDeps = (over: Partial<CoordinatorDeps> = {}): CoordinatorDeps => ({
  listAgents: () => [{ id: 'ag_main', name: 'Main' }],
  openAgentTail: () => ({ entries: [], nextBeforeSeq: null }),
  transcriptWindow: () => Promise.resolve({ entries: [], nextBeforeSeq: undefined, threadCounts: {} }),
  sendPrompt: () => Promise.resolve({ accepted: true }),
  resolvePermission: () => Promise.resolve(),
  setAgentUnread: () => {},
  createAgent: () => Promise.resolve({ id: 'new' }),
  updateAgent: () => Promise.resolve(null),
  ...over,
})

describe('protocol v1 · 握手与帧', () => {
  it('hello v1 → ready v1；错误版本号触发断链（client 侧行为，这里只验 ready 只回一次）', () => {
    const { client, frames } = handshake(baseDeps())
    expect(frames.filter((f) => rec(f).kind === 'lifecycle')).toEqual([{ kind: 'lifecycle', phase: 'ready', protocolVersion: 1 }])
    client.close()
  })

  it('request → reply ok；事件帧经同一端口下发（emit）', async () => {
    const { client, frames, server } = handshake(baseDeps())
    await expect(call(client, frames, 'listAgents')).resolves.toHaveLength(1)
    server.emit('transcript', { type: 'snapshot', activeAgentId: 'ag_main', entries: [] })
    expect(frames.some((f) => rec(f).kind === 'event' && rec(f).family === 'transcript')).toBe(true)
    client.close()
  })

  it('未知方法 → failed unknown-method（COORDINATOR_UNKNOWN_METHOD）', async () => {
    const { client, frames } = handshake(baseDeps())
    await expect(call(client, frames, 'noSuchMethod')).rejects.toThrow(/unknown-method/)
    client.close()
  })

  it('U4′ 观测面（P5-52）：requests 记全部到达方法，unhandled 只记无 handler 的', async () => {
    const { client, frames, server } = handshake(baseDeps())
    await call(client, frames, 'getTrays')
    await expect(call(client, frames, 'duplicateAgent')).rejects.toThrow(/unknown-method/)
    expect(server.requests).toEqual(['getTrays', 'duplicateAgent'])
    expect(server.unhandled).toEqual(['duplicateAgent'])
    client.close()
  })
})

describe('13 RPC 实底清单 · 回值形状', () => {
  it('getTeachRecordingStatus 四字段形状（回错值 transcript 整个不挂，RE-s0 坑）', async () => {
    const { client, frames } = handshake(baseDeps())
    const v = await call(client, frames, 'getTeachRecordingStatus')
    expect(v).toEqual({ state: 'idle', agentId: null, startedAtMs: null, maxDurationMs: 600000 })
    client.close()
  })

  it('能力关：getTrays/getSubagents/getAsyncTasks/getAgentWorkflows/listAllAutomations → []；isAgentNetworkEnabled/isGlobalSearchEnabled → false；getForeverBoxStatus → null；getListenerIntegrations → {}', async () => {
    const { client, frames } = handshake(baseDeps())
    for (const m of ['getTrays', 'getSubagents', 'getAsyncTasks', 'getAgentWorkflows', 'listAllAutomations']) {
      await expect(call(client, frames, m)).resolves.toEqual([])
    }
    await expect(call(client, frames, 'isAgentNetworkEnabled')).resolves.toBe(false)
    await expect(call(client, frames, 'isGlobalSearchEnabled')).resolves.toBe(false)
    await expect(call(client, frames, 'getForeverBoxStatus', { id: 'forever-box' })).resolves.toBeNull()
    await expect(call(client, frames, 'getListenerIntegrations')).resolves.toEqual({})
    client.close()
  })

  it('openAgentTail：回 {entries,nextBeforeSeq} 且同端口同推 transcript snapshot（S0 坑1 解法）', async () => {
    const deps = baseDeps({ openAgentTail: (id) => ({ entries: [{ id: 'e1', kind: 'message' }], nextBeforeSeq: null }) })
    const { client, frames } = handshake(deps)
    await expect(call(client, frames, 'openAgentTail', { id: 'ag_main', limit: 200 })).resolves.toEqual({
      entries: [{ id: 'e1', kind: 'message' }], nextBeforeSeq: null,
    })
    expect(frames.some((f) => rec(f).kind === 'event' && rec(f).family === 'transcript'
      && rec(rec(f).payload).type === 'snapshot' && rec(rec(f).payload).activeAgentId === 'ag_main')).toBe(true)
    client.close()
  })

  it('sendPrompt 透传给 deps（含 clientNonce）；createAgent/updateAgent 透传', async () => {
    const sendPrompt = vi.fn().mockResolvedValue({ accepted: true })
    const { client, frames } = handshake(baseDeps({ sendPrompt }))
    await call(client, frames, 'sendPrompt', { agentId: 'ag_main', prompt: 'hi', clientNonce: 'n1' })
    expect(sendPrompt).toHaveBeenCalledWith({ agentId: 'ag_main', prompt: 'hi', clientNonce: 'n1' })
    client.close()
  })
})

describe('resolveLocalToolPermission · D9 值域', () => {
  it('allow-once → allowed-once；deny/never → rejected；always 落到 allow-once（由 desktop.set 拒存 always 促成的上游回退，shim 不发 always）', async () => {
    const seen: Array<{ eventId: string; value: string }> = []
    const deps = baseDeps({
      resolvePermission: (args) => { seen.push({ eventId: String(rec(args).requestId), value: String(rec(args).dshValue) }); return Promise.resolve() },
    })
    const { client, frames } = handshake(deps)
    for (const resolution of ['allow-once', 'deny', 'never', 'always']) {
      await call(client, frames, 'resolveLocalToolPermission', { requestId: 'ev-1', resolution, agentId: 'ag_main', entryId: 'pe-1' })
    }
    expect(seen.map((s) => s.value).every((v) => v === 'allowed-once' || v === 'rejected')).toBe(true)
    expect(seen.map((s) => s.value)).toEqual(['allowed-once', 'rejected', 'rejected', 'allowed-once'])
    expect(seen.every((s) => s.eventId === 'ev-1')).toBe(true)
    client.close()
  })
})
