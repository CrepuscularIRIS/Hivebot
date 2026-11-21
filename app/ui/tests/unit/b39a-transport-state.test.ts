// B39-A：shim 断链 → coordinator-transport-state 推 down；重连 → connected。
// renderer 消费链已在（coordinator-client.ts:130 family 匹配 → transportListeners）；
// 本测锁 shim 侧 server.emit('coordinator-transport-state', {state}) 的帧格式与时序。
import { expect, it } from 'vitest'
import { createCoordinatorServer, type CoordinatorDeps, type ShimPort } from '../../renderer-grok/shim/src/coordinator'

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

function baseDeps(): CoordinatorDeps {
  return {
    listAgents: () => [],
    getAgent: () => null,
    getAgentTranscriptTail: () => Promise.resolve({ entries: [], nextBeforeSeq: null }),
    openAgentTail: () => Promise.resolve({ entries: [], nextBeforeSeq: null }),
    getAgentTranscriptWindow: () => Promise.resolve({ entries: [] }),
    getAgentThread: () => Promise.resolve({ entries: [] }),
    isEgressTunnelAvailable: () => Promise.resolve(false),
    reactToMessage: () => Promise.resolve({ ok: true }),
  } as unknown as CoordinatorDeps
}

function handshake(): { frames: unknown[]; server: ReturnType<typeof createCoordinatorServer> } {
  const server = createCoordinatorServer(baseDeps(), portPair)
  let clientSide: ShimPort | null = null
  const claim = server.claim({ onPort(port) { clientSide = port } })
  claim.request()
  const frames: unknown[] = []
  clientSide!.addEventListener('message', (e) => frames.push(e.data))
  clientSide!.start()
  clientSide!.postMessage({ kind: 'lifecycle', phase: 'hello', protocolVersion: 1 })
  return { frames, server }
}

it('server.emit(coordinator-transport-state) → port 帧 {kind:event, family, payload:{state}}', () => {
  const { frames, server } = handshake()
  const emit = server.emit.bind(server)
  emit('coordinator-transport-state', { state: 'down' })
  emit('coordinator-transport-state', { state: 'connected' })
  const states = frames
    .filter((f) => (f as { kind?: string; family?: string }).kind === 'event' && (f as { family?: string }).family === 'coordinator-transport-state')
    .map((f) => (f as { payload?: { state?: string } }).payload?.state)
  expect(states).toEqual(['down', 'connected'])
})
