// P6-10 ⑤ 通道 main 侧接线（CONTRACT §2.4）：常驻订阅 SDK 的 create 请求流，
// 请求 → create 编排 → respond；未加载 orchestration.yml（流报错）只记 1 行
// 日志（验收 ⑧）；每代 socket 重开订阅。
import { describe, expect, it } from 'vitest'
import { ORCH_REQUESTS_ENDPOINT, ORCH_RESPOND_METHOD, wireOrchChannel, type OrchDshLike, type OrchFrame } from '../../../main/m3-meta/orch-channel'

interface RpcCall { method: string; args: unknown }
type CreateResult = { ok: true, value: { sessionId: string, warn?: string } } | { ok: false, error: { code: string, message: string, details?: unknown } }

/** fake dsh：connect 后 openStream 生效，emit 把帧送进当前流的 onFrame。 */
function fakeDsh() {
  const rpcs: RpcCall[] = []
  const connected: Array<(generation: number) => void> = []
  let frameSink: ((frame: OrchFrame) => void) | undefined
  let readyResolve: (() => void) | undefined
  const readyPromise = new Promise<void>((resolve) => { readyResolve = resolve })
  let rpcImpl: (method: string, args: unknown) => Promise<{ ok: boolean }> = async (method, args) => {
    rpcs.push({ method, args })
    return { ok: true }
  }
  const dsh: OrchDshLike & {
    rpcs: RpcCall[]
    connect(): void
    emit(frame: OrchFrame): void
    setRpc(impl: (method: string, args: unknown) => Promise<{ ok: boolean }>): void
  } = {
    rpcs,
    onConnected(listener) { connected.push(listener) },
    async ready() {
      await readyPromise
      return {
        openStream(endpoint, _args, onFrame) {
          if (endpoint !== ORCH_REQUESTS_ENDPOINT) throw new Error(`unexpected endpoint ${endpoint}`)
          frameSink = onFrame
          return { cancel() { frameSink = undefined } }
        },
      }
    },
    async rpc(method, args) { return rpcImpl(method, args) as Promise<{ ok: boolean }> },
    connect() { for (const listener of connected) listener(1); readyResolve?.() },
    emit(frame) { frameSink?.(frame) },
    setRpc(impl) { rpcImpl = impl },
  }
  return dsh
}

const REQUEST = { requestId: 'r1', kind: 'create-bot', name: 'w', prompt: 'p', mainBotId: 'session-main' }
const respondArgs = (requestId: string, payload: object) => ({ method: ORCH_RESPOND_METHOD, args: { request: { requestId, ...payload } } })
/** connect → subscribe 走一拍微任务（openStream 异步挂 sink）。 */
const settled = () => new Promise<void>((resolve) => { setTimeout(resolve, 5) })

describe('wireOrchChannel', () => {
  it('a create request runs the orchestration and responds with the value', async () => {
    const dsh = fakeDsh()
    const seen: unknown[] = []
    wireOrchChannel({ dsh, create: async (req) => { seen.push(req); return { ok: true, value: { sessionId: 'session-w', warn: 'rename failed: x' } } } })
    dsh.connect()
    await settled()
    dsh.emit({ type: 'item', value: REQUEST })
    await new Promise((r) => setTimeout(r, 10))
    expect(seen).toEqual([REQUEST])
    expect(dsh.rpcs).toEqual([respondArgs('r1', { value: { sessionId: 'session-w', warn: 'rename failed: x' } })])
  })

  it('an orchestration failure responds with the error outcome (code + details passthrough)', async () => {
    const dsh = fakeDsh()
    wireOrchChannel({ dsh, create: async () => ({ ok: false, error: { code: 'pbots/orchestration-failed', message: 'session/create failed', details: { step: 'session/create' } } }) })
    dsh.connect()
    await settled()
    dsh.emit({ type: 'item', value: { ...REQUEST, requestId: 'r2' } })
    await new Promise((r) => setTimeout(r, 10))
    expect(dsh.rpcs[0]).toEqual(respondArgs('r2', { error: { code: 'pbots/orchestration-failed', message: 'session/create failed', details: { step: 'session/create' } } }))
  })

  it('a throwing create is contained into an orchestration-failed respond', async () => {
    const dsh = fakeDsh()
    wireOrchChannel({ dsh, create: async () => { throw new Error('boom') } })
    dsh.connect()
    await settled()
    dsh.emit({ type: 'item', value: { ...REQUEST, requestId: 'r3' } })
    await new Promise((r) => setTimeout(r, 10))
    expect(dsh.rpcs[0]?.args).toMatchObject({ request: { requestId: 'r3', error: { code: 'pbots/orchestration-failed' } } })
  })

  it('a failed respond rpc logs one line, never crashes', async () => {
    const dsh = fakeDsh()
    const logs: string[] = []
    dsh.setRpc(async () => ({ ok: false }))
    wireOrchChannel({ dsh, create: async () => ({ ok: true, value: { sessionId: 'session-w' } }), log: (m) => logs.push(m) })
    dsh.connect()
    await settled()
    dsh.emit({ type: 'item', value: { ...REQUEST, requestId: 'r4' } })
    await new Promise((r) => setTimeout(r, 10))
    expect(logs.filter((m) => m.includes('respond failed') && m.includes('r4')).length).toBe(1)
  })

  it('stream error frame (orchestration.yml not loaded) logs exactly one line (验收 ⑧)', async () => {
    const dsh = fakeDsh()
    const logs: string[] = []
    wireOrchChannel({ dsh, create: async () => ({ ok: true, value: { sessionId: 'x' } }), log: (m) => logs.push(m) })
    dsh.connect()
    await settled()
    dsh.emit({ type: 'error', error: { message: 'unknown stream endpoint' } })
    await new Promise((r) => setTimeout(r, 10))
    expect(logs.length).toBe(1)
    expect(logs[0]).toContain(ORCH_REQUESTS_ENDPOINT)
  })

  it('ready item and non-request items are ignored', async () => {
    const dsh = fakeDsh()
    const seen: unknown[] = []
    wireOrchChannel({ dsh, create: async (req) => { seen.push(req); return { ok: true, value: { sessionId: 'session-w' } } } })
    dsh.connect()
    await settled()
    dsh.emit({ type: 'item', value: { ready: true } })
    dsh.emit({ type: 'item', value: { somethingElse: true } })
    await new Promise((r) => setTimeout(r, 10))
    expect(seen).toEqual([])
    expect(dsh.rpcs).toEqual([])
  })

  it('reconnect re-subscribes (每代 socket 重开，U-16 $events 模式)', async () => {
    const dsh = fakeDsh()
    const logs: string[] = []
    wireOrchChannel({ dsh, create: async () => ({ ok: true, value: { sessionId: 'session-w' } }), log: (m) => logs.push(m) })
    dsh.connect()
    await settled()
    dsh.emit({ type: 'item', value: REQUEST })
    await new Promise((r) => setTimeout(r, 10))
    expect(dsh.rpcs.length).toBe(1)
    // 新一代连接：重新订阅后仍能处理请求
    dsh.emit({ type: 'item', value: { ...REQUEST, requestId: 'r5' } })
    await new Promise((r) => setTimeout(r, 10))
    expect(dsh.rpcs.length).toBe(2)
  })
})
