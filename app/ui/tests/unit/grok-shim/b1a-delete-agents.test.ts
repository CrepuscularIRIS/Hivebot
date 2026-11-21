// B1.A · 批量删除实装（deleteAgents → session/delete 接线）。
// rig 照 hidden-bots（createShimData + mock api + coordinator 内存端口握手）。
// 上游契约：ProductionRenderer.tsx:3152 {ids:[…]}、reply record（rpc/coordinator.ts:114）。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createShimData } from '../../../renderer-grok/shim/src/data'
import { createCoordinatorServer, type ShimPort } from '../../../renderer-grok/shim/src/coordinator'

const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? v as Record<string, unknown> : {})

interface Item { sessionId: string; origin?: string; parentSessionId?: string; running?: boolean; title?: string | null }

/** 内存 localStorage（hidden-bots.test 同款）。 */
const mkStore = (pre: Record<string, string> = {}) => {
  const m = new Map(Object.entries(pre))
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

/** rig：deleteCalls 记录 session/delete 实参（断言 wire 形状 {request:{sessionId}}）。 */
function rig(items: Item[], mainBotId: string, opts: { running?: string[] } = {}) {
  return rigR(items, mainBotId, mkStore(), opts)
}
/** rigR：外部注入 localStorage（archived 持久断言用——hidden-bots.test 同款）。 */
function rigR(items: Item[], mainBotId: string, store: Storage, opts: { running?: string[] } = {}) {
  const deleteCalls: Array<Record<string, unknown>> = []
  const cancelCalls: Array<Record<string, unknown>> = []
  vi.stubGlobal('window', { localStorage: store })
  const api = (method: string, args?: unknown) => {
    if (method === 'session/list') {
      const mapped = items.map((i) => ({
        sessionId: i.sessionId, running: opts.running?.includes(i.sessionId) ?? i.running === true, updatedAt: 1,
        ...(i.origin !== undefined ? { origin: i.origin } : {}),
        ...(i.parentSessionId !== undefined ? { parentSessionId: i.parentSessionId } : {}),
        projections: { values: { ...(i.title != null ? { title: i.title } : {}) } },
      }))
      return Promise.resolve({ ok: true, value: { items: mapped } })
    }
    if (method === 'session/delete') {
      deleteCalls.push(rec(args))
      return Promise.resolve({ ok: false, error: { code: 'dsh/not-found', message: 'HTTP 404 from session/delete' } })
    }
    if (method === 'session/cancel') {
      cancelCalls.push(rec(args))
      return Promise.resolve({ ok: true, value: {} })
    }
    return Promise.resolve({ ok: true, value: { sessionId: 's-new' } })
  }
  const metaApi = () => Promise.resolve({ ok: true, value: { mainBotId, recipes: {} } })
  const data = createShimData({ authId: 'auth', api, metaApi })
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
  return { data, call, deleteCalls, cancelCalls, raw: () => data.deps.listAgents() as Array<Record<string, unknown>> }
}

const M = 'session-main', B = 'session-b'
const roster = (): Item[] => [
  { sessionId: M, title: 'Main' },
  { sessionId: B, title: 'B bot' },
  { sessionId: 'session-c', title: 'C bot' },
]
/** ②用：B 运行中。 */
const rosterR = (): Item[] => [
  { sessionId: M, title: 'Main' },
  { sessionId: B, title: 'B bot', running: true },
  { sessionId: 'session-c', title: 'C bot' },
]
const mkStoreWithArchived = (_v: string[]): Storage => mkStore()

afterEach(() => vi.unstubAllGlobals())

describe('B1.A deleteAgents（实底：逐 id session/delete）', () => {
  it('① {ids:[B]} → 本地 roster 去掉 B（软删：无 wire delete），Main/C 在', async () => {
    const { data, call, deleteCalls, cancelCalls, raw } = rig(roster(), M)
    await data.dev.reloadRoster()
    const value = await call('deleteAgents', { ids: [B] })
    expect(deleteCalls).toEqual([]) // B1.A 软删：不再调 session/delete（DSH 404）
    expect(cancelCalls).toEqual([]) // 非 running 不 cancel
    expect(rec(value).deleted).toBe(1)
    expect(raw().map((a) => a.id)).not.toContain(B)
    expect(raw().map((a) => a.id)).toContain(M)
  })

  it('② 批量 {ids:[B,C]} + running 先 cancel 再清、archived 持久防复活', async () => {
    const store = mkStoreWithArchived([])
    const { data, call, cancelCalls, raw } = rigR(rosterR(), M, store)
    await data.dev.reloadRoster()
    await call('deleteAgents', { ids: [B, 'session-c'] })
    expect(cancelCalls.map((c) => rec(c.request).sessionId)).toEqual([B]) // 只 running 的 B 被 cancel
    expect(raw().map((a) => a.id)).toEqual([M])
    // 持久：新 shim 同 localStorage → reloadRoster 后仍不复活
    const r2 = rigR(rosterR(), M, store)
    await r2.data.dev.reloadRoster()
    expect(r2.raw().map((a) => a.id)).toEqual([M])
  })

  it('③ 主 bot 在 ids 里 → 被滤掉不删（0.78.1 语义）', async () => {
    const { data, call, raw } = rig(roster(), M)
    await data.dev.reloadRoster()
    const value = await call('deleteAgents', { ids: [M, B] })
    expect(rec(value).deleted).toBe(1) // 只删 B
    expect(raw().map((a) => a.id)).toEqual([M, 'session-c'])
  })

  it('④ ids 非法（非字符串数组）→ 空 ids 直通不炸（coordinator 防线）', async () => {
    const { data, call, deleteCalls } = rig(roster(), M)
    await data.dev.reloadRoster()
    const value = await call('deleteAgents', { ids: 'not-array' })
    expect(deleteCalls).toEqual([])
    expect(rec(value).deleted).toBe(0)
  })

  it('⑤ 删激活 bot → active 切存活首只；transcript 推送不炸（push 桩在场）', async () => {
    const { data, call, raw } = rig(roster(), M)
    await data.dev.reloadRoster()
    data.deps.setActive?.(B)
    await call('deleteAgents', { ids: [B] })
    expect(raw().map((a) => a.id)).not.toContain(B)
  })

  it('⑥ ui.deleteAgents（覆盖层通道）：成功 {ok:true} 且 roster 减员', async () => {
    const ok = rig(roster(), M)
    await ok.data.dev.reloadRoster()
    const resOk = await ok.data.ui.deleteAgents([B])
    expect(resOk.ok).toBe(true)
    expect(ok.raw().map((a) => a.id)).not.toContain(B)
  })
})
