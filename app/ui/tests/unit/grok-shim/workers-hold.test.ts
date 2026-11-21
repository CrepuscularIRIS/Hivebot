// T39：侧栏点 Done 行不换组——行换组只因其状态变，不因被点。rig 照 main-helpers。
import { describe, expect, it } from 'vitest'
import { createShimData } from '../../../renderer-grok/shim/src/data'

const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? v as Record<string, unknown> : {})

interface Item { sessionId: string; origin?: string; parentSessionId?: string; running?: boolean; title?: string | null; label?: string | null }

function rig(items: Item[], mainBotId: string) {
  const api = (method: string) => {
    if (method === 'session/list') {
      return Promise.resolve({ ok: true, value: { items: items.map((i) => ({
        sessionId: i.sessionId, running: i.running === true, updatedAt: 1,
        ...(i.origin !== undefined ? { origin: i.origin } : {}),
        ...(i.parentSessionId !== undefined ? { parentSessionId: i.parentSessionId } : {}),
        projections: { values: { ...(i.title != null ? { title: i.title } : {}), ...(i.label != null ? { subagent: { mode: 'continuable', label: i.label } } : {}) } },
      })) } })
    }
    return Promise.resolve({ ok: true, value: { sessionId: 's-new' } })
  }
  const metaApi = () => Promise.resolve({ ok: true, value: { mainBotId, recipes: {} } })
  return createShimData({ authId: 'auth', api, metaApi })
}

const M = 'session-main', H1 = 'helper-1', H2 = 'helper-2', H3 = 'helper-3'
const mk = (): Item[] => [
  { sessionId: M, title: 'Main' },
  { sessionId: H1, origin: 'subagent', parentSessionId: M, running: false, label: 'Done1' },
  { sessionId: H2, origin: 'subagent', parentSessionId: M, running: false, label: 'Done2' },
  { sessionId: H3, origin: 'subagent', parentSessionId: M, running: true, label: 'Running' },
]

describe('T39 点 Done 行不跳组', () => {
  it('① 侧栏点 Done 行：H1 仍在 done、workers 的 agentIds 与点之前逐字相同（施工前必红）', async () => {
    const data = rig(mk(), M)
    await data.dev.reloadRoster()
    const before = JSON.stringify(data.dev.sections)
    data.ui.setActive(H1)
    const after = (data.dev.sections ?? []) as SectionJson[]
    const done = after.find((s) => s.id === 'pbots:done:' + M)
    const workers = after.find((s) => s.id === 'pbots:workers:' + M)
    expect(done?.agentIds ?? []).toContain(H1)
    const beforeWorkers = (JSON.parse(before) as SectionJson[]).find((s) => s.id === 'pbots:workers:' + M)
    expect(JSON.stringify(workers?.agentIds ?? []), 'workers 组不变').toBe(JSON.stringify(beforeWorkers?.agentIds ?? []))
  })
  it('② 连点 H1/H2/M：sections 签名逐步不变（施工前必红）', async () => {
    const data = rig(mk(), M)
    await data.dev.reloadRoster()
    const sig0 = JSON.stringify(data.dev.sections)
    data.ui.setActive(H1)
    expect(JSON.stringify(data.dev.sections)).toBe(sig0)
    data.ui.setActive(H2)
    expect(JSON.stringify(data.dev.sections)).toBe(sig0)
    data.ui.setActive(M)
    expect(JSON.stringify(data.dev.sections)).toBe(sig0)
  })
  it('③ 回报卡 Open 保 f1：focus(H1)+setActive(H1) → H1 在 Workers 末；setActive(M) 后回 Done（守卫格）', async () => {
    const data = rig(mk(), M)
    await data.dev.reloadRoster()
    data.ui.focus(H1)
    data.ui.setActive(H1)
    const workers = ((data.dev.sections ?? []) as SectionJson[]).find((s) => s.id === 'pbots:workers:' + M)
    expect(workers?.agentIds).toContain(H1)
    data.ui.setActive(M)
    const done = (((data.dev.sections ?? []) as SectionJson[]).find((s) => s.id === 'pbots:done:' + M))
    expect(done?.agentIds).toContain(H1)
  })
  it('④ Workers 里读完不当场掉：setActive(H3)（rank<4 hold）→ H3 转 done 后 reloadRoster 仍在 Workers；setActive(M) 后归档（守卫格）', async () => {
    const items = mk()
    const data = rig(items, M)
    await data.dev.reloadRoster()
    data.ui.setActive(H3)
    items[3] = { sessionId: H3, origin: 'subagent', parentSessionId: M, running: false, label: 'Running' }
    await data.dev.reloadRoster()
    const workers = (((data.dev.sections ?? []) as SectionJson[]).find((s) => s.id === 'pbots:workers:' + M))
    expect(workers?.agentIds, '读完+结束时 hold 在 Workers').toContain(H3)
    data.ui.setActive(M)
    const done = (((data.dev.sections ?? []) as SectionJson[]).find((s) => s.id === 'pbots:done:' + M))
    expect(done?.agentIds, '离开后归档').toContain(H3)
  })
})

interface SectionJson { id: string; agentIds: string[] }
