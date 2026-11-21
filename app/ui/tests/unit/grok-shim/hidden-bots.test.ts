// T41：侧栏「Hide from sidebar」+「Hidden Bots」恢复。
// rig 照 main-helpers（createShimData + mock api）+ coordinator.test（内存端口握手），
// localStorage 用内存 Map（desktop.test 先例）。① 施工前必红（unknown-method）。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createShimData } from '../../../renderer-grok/shim/src/data'
import { createCoordinatorServer, type ShimPort } from '../../../renderer-grok/shim/src/coordinator'
import { projectSidebarSections } from '../../../renderer-grok/frontend/src/recovered/features/conversation/workspace/sidebar-section-projection'

const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? v as Record<string, unknown> : {})

interface Item { sessionId: string; origin?: string; parentSessionId?: string; running?: boolean; title?: string | null; label?: string | null }

/** 内存 localStorage（desktop.test:12 先例）。 */
const mkStore = (pre: Record<string, string> = {}) => {
  const m = new Map(Object.entries(pre))
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, removeItem: (k: string) => { m.delete(k) }, dump: () => m } as unknown as Storage & { dump(): Map<string, string> }
}

/** 内存双端端口（coordinator.test 同款最小形状）。 */
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

function rig(items: Item[], mainBotId: string, store: Storage) {
  vi.stubGlobal('window', { localStorage: store })
  const api = (method: string) => {
    if (method === 'session/list') {
      const mapped = items.map((i) => ({
        sessionId: i.sessionId, running: i.running === true, updatedAt: 1,
        ...(i.origin !== undefined ? { origin: i.origin } : {}),
        ...(i.parentSessionId !== undefined ? { parentSessionId: i.parentSessionId } : {}),
        projections: { values: { ...(i.title != null ? { title: i.title } : {}), ...(i.label != null ? { subagent: { mode: 'continuable', label: i.label } } : {}) } },
      }))
      return Promise.resolve({ ok: true, value: { items: mapped } })
    }
    return Promise.resolve({ ok: true, value: { sessionId: 's-new' } })
  }
  const metaApi = () => Promise.resolve({ ok: true, value: { mainBotId, recipes: {} } })
  const data = createShimData({ authId: 'auth', api, metaApi })
  // 完整链：真 coordinator server（协议帧 → deps → data）
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
          const o = rec(reply).outcome as { status: string; failure?: { code?: string } }
          if (o.status === 'ok') resolve(undefined)
          else reject(new Error(o.failure?.code ?? 'failed'))
          return
        }
        setTimeout(poll, 5)
      }
      poll()
    })
  }
  return { data, call, raw: () => data.deps.listAgents() as Array<Record<string, unknown>> }
}

const M = 'session-main', B = 'session-b', W = 'helper-w'
const roster = (): Item[] => [
  { sessionId: M, title: 'Main' },
  { sessionId: B, title: 'B bot' },
  { sessionId: W, origin: 'subagent', parentSessionId: M, running: false, label: 'W helper' },
]

afterEach(() => vi.unstubAllGlobals())

describe('T41 隐藏 bot', () => {
  it('① setAgentHiddenFromSidebar → ok；B raw 带 isHiddenFromSidebar=true，其余 false', async () => {
    const { data, call, raw } = rig(roster(), M, mkStore())
    await data.dev.reloadRoster()
    await call('setAgentHiddenFromSidebar', { id: B, isHidden: true })
    const b = raw().find((a) => a.id === B)
    const m = raw().find((a) => a.id === M)
    expect(b?.isHiddenFromSidebar).toBe(true)
    expect(m?.isHiddenFromSidebar).toBe(false)
  })
  it('② 持久：同一 localStorage 新建 shim → B 仍 hidden', async () => {
    const store = mkStore()
    const r1 = rig(roster(), M, store)
    await r1.data.dev.reloadRoster()
    await r1.call('setAgentHiddenFromSidebar', { id: B, isHidden: true })
    const r2 = rig(roster(), M, store)
    await r2.data.dev.reloadRoster()
    expect(r2.raw().find((a) => a.id === B)?.isHiddenFromSidebar).toBe(true)
    expect((store as unknown as { dump(): Map<string, string> }).dump().get('pbots.shim.hidden-agents')).toContain(B)
  })
  it('③ Unhide：isHidden:false → 标记消失，localStorage 不再含 B', async () => {
    const store = mkStore()
    const r = rig(roster(), M, store)
    await r.data.dev.reloadRoster()
    await r.call('setAgentHiddenFromSidebar', { id: B, isHidden: true })
    await r.call('setAgentHiddenFromSidebar', { id: B, isHidden: false })
    expect(r.raw().find((a) => a.id === B)?.isHiddenFromSidebar).toBe(false)
    expect((store as unknown as { dump(): Map<string, string> }).dump().get('pbots.shim.hidden-agents')).not.toContain(B)
  })
  it('④ 隐藏的 worker 不进组：上游投影按 isHidden 过滤（ProductionRenderer:1404/1627 等价物）', async () => {
    const { data, call, raw } = rig(roster(), M, mkStore())
    await data.dev.reloadRoster()
    await call('setAgentHiddenFromSidebar', { id: W, isHidden: true })
    const agents = raw().map((a) => ({ id: a.id as string, isHidden: a.isHiddenFromSidebar === true }))
    const sections = data.dev.sections ?? []
    // 落点：上游已过滤（visibleAgents = filter(!isHidden) 喂 projectSidebarSections——工单定案不动 workers.ts）
    const projected = projectSidebarSections({ agents: agents.filter((a) => !a.isHidden), pinnedIds: [], sections: sections as never })
    const inGroups: string[] = []
    for (const s of projected) for (const a of s.agents) inGroups.push(a.id)
    expect(inGroups, '投影后任何组不含被藏 worker').not.toContain(W)
    expect(inGroups).toContain(M) // 未藏的仍在（未分组合成段）
    // M、B 仍可见
    expect(agents.find((a) => a.id === M)?.isHidden).toBe(false)
    expect(agents.find((a) => a.id === B)?.isHidden).toBe(false)
  })
  it('⑤ 坏值：localStorage 预置 not json → 不抛、全员可见', async () => {
    const store = mkStore({ 'pbots.shim.hidden-agents': 'not json' })
    const { data, raw } = rig(roster(), M, store)
    await expect(data.dev.reloadRoster()).resolves.not.toThrow()
    for (const a of raw()) expect(a.isHiddenFromSidebar).toBe(false)
  })
})
