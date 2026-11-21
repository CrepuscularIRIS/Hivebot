// B3.1 单测：outline 全量化——transcriptWindow 翻页取回的旧页并进 view.items，outline 读到全量。
// rig 照 b1a-delete-agents.test.ts（createShimData + mock api + coordinator 内存端口握手 + call()）。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createShimData } from '../../../renderer-grok/shim/src/data'
import { createCoordinatorServer, type ShimPort } from '../../../renderer-grok/shim/src/coordinator'

const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? v as Record<string, unknown> : {})

const mkStore = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, removeItem: (k: string) => { m.delete(k) } } as unknown as Storage
}

function portPair(): [ShimPort, ShimPort] {
  const make = (): ShimPort & { deliver(d: unknown): void; link(o: unknown): void } => {
    const listeners: Array<(e: { data: unknown }) => void> = []
    let peer: ShimPort & { deliver(d: unknown): void } | null = null
    return {
      postMessage(d: unknown): void { peer!.deliver(d) },
      close(): void {}, start(): void {},
      addEventListener(t: 'message' | 'close', l: (e: never) => void): void { if (t === 'message') listeners.push(l as (e: { data: unknown }) => void) },
      deliver(d: unknown): void { for (const l of [...listeners]) l({ data: d }) },
      link(o: unknown): void { peer = o as ShimPort & { deliver(d: unknown): void } },
    }
  }
  const a = make(), b = make()
  a.link(b); b.link(a)
  return [a, b]
}

// 帧形状锚 reduce.ts user/message（source.kind='user' 才进 items）与 assistant/message（message.content）。
// id 锚 reduce.ts：user 条目 id=data.id（缺省 u-N 兜底）；assistant 条目 id=`t{turn}-s{step}`。
// 这里给显式 id（user）/唯一 turn（assistant），outline 断言直接可读。
const mkMsg = (seq: number, kind: 'user/message' | 'assistant/message') => ({
  type: 'event',
  event: kind === 'user/message'
    ? { seq, type: kind, data: { id: `u${seq}`, content: [{ type: 'text', text: `m${seq}` }], source: { kind: 'user' } } }
    : { seq, type: kind, data: { turn: seq, step: 1, message: { content: [{ type: 'text', text: `m${seq}` }] } } },
})

describe('B3.1 outline 全量化', () => {
  afterEach(() => vi.unstubAllGlobals())

  const rig = async (opts: { eventsFail?: boolean } = {}) => {
    vi.stubGlobal('window', { localStorage: mkStore() })
    const eventsCalls: Array<Record<string, unknown>> = []
    const api = (method: string, args?: unknown) => {
      if (method === 'session/events') {
        eventsCalls.push(rec(args))
        if (opts.eventsFail) return Promise.resolve({ ok: false, error: { message: 'boom' } })
        const before = rec(rec(args).request).beforeSeq
        // 首拉（无 beforeSeq）：seq 41-80；beforeSeq=41：seq 21-40（旧页）
        if (before === undefined) return Promise.resolve({ ok: true, value: { records: [mkMsg(41, 'user/message'), mkMsg(42, 'assistant/message')], hasMore: true } })
        if (before === 41) return Promise.resolve({ ok: true, value: { records: [mkMsg(21, 'user/message'), mkMsg(22, 'assistant/message')], hasMore: false } })
        return Promise.resolve({ ok: true, value: { records: [], hasMore: false } })
      }
      if (method === 'session/get') return Promise.resolve({ ok: true, value: { records: [mkMsg(41, 'user/message'), mkMsg(42, 'assistant/message')], hasMore: true } })
      if (method === 'session/list') return Promise.resolve({ ok: true, value: { items: [{ sessionId: 'main', running: false, updatedAt: 1, projections: { values: { title: 'Main' } } }] } })
      return Promise.resolve({ ok: true, value: {} })
    }
    const data = createShimData({ authId: 'a', api, metaApi: () => Promise.resolve({ ok: true, value: { mainBotId: 'main', recipes: {} } }) })
    const server = createCoordinatorServer(data.deps, portPair)
    let clientSide: ShimPort | null = null
    server.claim({ onPort(p) { clientSide = p } }).request()
    const client = clientSide!
    const frames: unknown[] = []
    client.addEventListener('message', (e) => { frames.push(e.data) })
    client.start()
    client.postMessage({ kind: 'lifecycle', phase: 'hello', protocolVersion: 1 })
    let seq = 0
    const call = (method: string, args: unknown = {}): Promise<unknown> => {
      const requestId = `r-${++seq}`
      client.postMessage({ kind: 'request', requestId, method, args })
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`no reply for ${method}; frames=${JSON.stringify(frames)}`)), 1000)
        const poll = (): void => {
          const reply = frames.find((f) => rec(f).kind === 'reply' && rec(f).requestId === requestId)
          if (reply !== undefined) {
            clearTimeout(timer)
            const o = rec(reply).outcome as { status: string; value?: unknown; failure?: { code?: string; message?: string } }
            if (o.status === 'ok') resolve(o.value)
            else reject(new Error(o.failure?.code != null ? `${o.failure.code}: ${o.failure.message}` : o.failure?.message ?? 'failed'))
            return
          }
          setTimeout(poll, 5)
        }
        poll()
      })
    }
    return { data, call, eventsCalls }
  }

  // live 窗口灌入：testFollowItem 直灌快照帧（reduceFollow 拆 items/firstSeq/hasMore/loaded——
  // b2 confirm 测试同款；比 openAgentTail 短路 mux 依赖，生产语义等价：快照经 onFollowItem 进 view）。
  const seedLive = (rig0: Awaited<ReturnType<typeof rig>>) => {
    rig0.data.dev.testFollowItem('main', { type: 'snapshot', sessionId: 'main', records: [mkMsg(41, 'user/message'), mkMsg(42, 'assistant/message')], hasMore: true })
    return rig0
  }

  it('① 翻页后 outline 含旧页条目', async () => {
    const r = seedLive(await rig())
    // live 窗口（seq 41/42）；翻页 beforeSeq=41 → 旧页 21/22
    const w = await r.call('getAgentTranscriptWindow', { id: 'main', beforeSeq: 41 }) as { entries?: unknown[] }
    expect(w?.entries?.length ?? 0).toBeGreaterThan(0)
    const outline = await r.call('getConversationOutline', { id: 'main' }) as Array<{ id?: string }>
    const ids = outline.map((o) => String(o.id ?? '')).join(',')
    expect(ids).toContain('u21')
    expect(ids).toContain('u41')
  })

  it('② 同页重取不重复', async () => {
    const r = seedLive(await rig())
    await r.call('getAgentTranscriptWindow', { id: 'main', beforeSeq: 41 })
    await r.call('getAgentTranscriptWindow', { id: 'main', beforeSeq: 41 })
    const outline = await r.call('getConversationOutline', { id: 'main' }) as Array<{ id?: string }>
    const ids = outline.map((o) => String(o.id ?? ''))
    const dup = ids.filter((v, i) => ids.indexOf(v) !== i)
    expect(dup).toEqual([])
  })

  it('③ 旧页在前 live 在后（顺序保持）', async () => {
    const r = seedLive(await rig())
    await r.call('getAgentTranscriptWindow', { id: 'main', beforeSeq: 41 })
    const outline = await r.call('getConversationOutline', { id: 'main' }) as Array<{ id?: string }>
    const idx21 = outline.findIndex((o) => String(o.id ?? '').includes('21'))
    const idx41 = outline.findIndex((o) => String(o.id ?? '').includes('41'))
    expect(idx21).toBeGreaterThanOrEqual(0)
    expect(idx41).toBeGreaterThan(idx21)
  })

  it('④ api 失败不并旧页', async () => {
    const r = seedLive(await rig({ eventsFail: true }))
    // live 灌好后再开失败开关：直接断言失败调用后 outline 无 21
    await expect(r.call('getAgentTranscriptWindow', { id: 'main', beforeSeq: 41 })).rejects.toThrow('boom')
    const outline = await r.call('getConversationOutline', { id: 'main' }) as Array<{ id?: string }>
    expect(outline.some((o) => String(o.id ?? '').includes('21'))).toBe(false)
  })
})
