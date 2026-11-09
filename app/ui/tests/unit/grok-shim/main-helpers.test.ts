// T36：主 bot 的 subagent helper 进 Workers 分组（仅主 bot 的；其他 bot/嵌套 helper 不进）。
// rig 照 kickstart-queue.test（createShimData + mock api），session/list 按 T33/T36 探针的真实 item 形状 mock
// （origin/parentSessionId 顶层、title 与 subagent.label 在 projections.values——/tmp 探针原样见回执）。
import { describe, expect, it } from 'vitest'
import { createShimData } from '../../../renderer-grok/shim/src/data'

const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? v as Record<string, unknown> : {})

interface Item { sessionId: string; origin?: string; parentSessionId?: string; running?: boolean; title?: string | null; label?: string | null }

function rig(items: Item[], mainBotId: string | null) {
  let reloaded = 0
  let currentMain = mainBotId // review 中1：换主场景要变 meta
  const api = (method: string, args?: unknown) => {
    if (method === 'session/list') {
      reloaded += 1
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
  const metaApi = (op?: unknown) => {
    if (rec(op).op === 'patch') currentMain = rec(op).mainBotId // 生产：patch 落盘后 meta 变
    return Promise.resolve({ ok: true, value: { mainBotId: currentMain, recipes: {} } })
  }
  const data = createShimData({ authId: 'auth', api, metaApi })
  return { data, reloadCount: () => reloaded, setMain: (m: string | null) => { currentMain = m } }
}

const M = 'session-main', B = 'session-b', H1 = 'helper-1', H2 = 'helper-b', H3 = 'helper-nested'
const base = (over: Partial<Item> = {}): Item[] => [
  { sessionId: M, title: 'Main' },
  { sessionId: B, title: 'B bot' },
  { sessionId: H1, origin: 'subagent', parentSessionId: M, running: true, label: 'Count files helper' },
  { sessionId: H2, origin: 'subagent', parentSessionId: B, running: true, label: 'B helper' },
  { sessionId: H3, origin: 'subagent', parentSessionId: H1, running: true, label: 'Nested' },
  ...('extra' in over ? [] : []),
]

describe('T36 主 bot subagent 进 Workers', () => {
  it('① sections：main 的 Workers 含且只含 H1；H2/H3 不在任何 section、不在 order', async () => {
    const { data } = rig(base(), M)
    await data.dev.reloadRoster()
    expect(data.dev.state.order).toContain(H1)
    expect(data.dev.state.order).not.toContain(H2)
    expect(data.dev.state.order).not.toContain(H3)
    const secs = data.dev.sections ?? []
    const workers = secs.find((s) => rec(s).id === 'pbots:workers:' + M)
    expect(workers, 'main 的 Workers section 在').toBeTruthy()
    expect(rec(workers!).agentIds).toEqual([H1])
    const allIds = secs.flatMap((s) => rec(s).agentIds as string[])
    expect(allIds).not.toContain(H2)
    expect(allIds).not.toContain(H3)
  })
  it('② H1 完成落 Done；名字 label 优先（dsh 自动 title 是拼接串）——data.ui.agentName 直断', async () => {
    const items = base()
    items[2] = { sessionId: H1, origin: 'subagent', parentSessionId: M, running: false, title: 'count files Your parent agent', label: 'Count files helper' }
    const { data } = rig(items, M)
    await data.dev.reloadRoster()
    expect(data.ui.agentName(H1), 'label 优先').toBe('Count files helper')
    const secs = data.dev.sections ?? []
    const done = secs.find((s) => rec(s).id === 'pbots:done:' + M)
    expect(done, 'Done section 在').toBeTruthy()
    expect(rec(done!).agentIds).toContain(H1)
  })
  it('③ 重拉后新 helper 进组；parent=B 的不进（自动重拉分支是 T36 前既有代码，非本单改动面）', async () => {
    const items = base()
    const { data, reloadCount } = rig(items, M)
    await data.dev.reloadRoster()
    const before = reloadCount()
    // 此格断「重拉后新 helper 进组 + parent!==main 的不进」；未知 sid 自动重拉分支是 T36 之前的代码
    items.push({ sessionId: 'helper-4', origin: 'subagent', parentSessionId: M, running: true, label: 'Late helper' })
    await data.dev.reloadRoster()
    expect(reloadCount()).toBeGreaterThan(before)
    const secs = data.dev.sections ?? []
    expect(rec(secs.find((s) => rec(s).id === 'pbots:workers:' + M)).agentIds).toContain('helper-4')
    expect(data.dev.state.order).not.toContain(H2)
    expect(data.dev.state.order).not.toContain('helper-b2')
  })
})


describe('T36 review 修复守卫', () => {
  it('中1（生产路径）：data.ui.setMain 换主 → 重拉后旧 helper 清、新 helper 并入', async () => {
    const items = [
      { sessionId: 'old-main', title: 'OldMain' },
      { sessionId: 'new-main', title: 'NewMain' },
      { sessionId: 'helper-old', origin: 'subagent', parentSessionId: 'old-main', running: false, label: 'Old helper' },
      { sessionId: 'helper-new', origin: 'subagent', parentSessionId: 'new-main', running: true, label: 'New helper' },
    ] as Item[]
    const { data } = rig(items, 'old-main')
    await data.dev.reloadRoster()
    expect(data.dev.state.order).toContain('helper-old')
    const res = await data.ui.setMain('new-main') // 生产换主入口（metaApi patch 更新 meta；重拉由 setMain 内触发）
    expect(res.ok).toBe(true)
    expect(data.dev.state.order, '旧 main 的 helper 清除').not.toContain('helper-old')
    expect(data.dev.state.order, '新 main 的 helper 并入').toContain('helper-new')
    const secs = data.dev.sections ?? []
    expect(rec(secs.find((sc) => rec(sc).id === 'pbots:workers:new-main')).agentIds).toEqual(['helper-new'])
    expect(secs.some((sc) => rec(sc).id === 'pbots:workers:old-main'), '旧 main 的 Workers section 消失').toBe(false)
  })
  it('中3：helper 无 title 无 label → agentName 回落 Subagent（不冒充 New chat）', async () => {
    const items = base()
    items[2] = { sessionId: H1, origin: 'subagent', parentSessionId: M, running: true }
    const { data } = rig(items, M)
    await data.dev.reloadRoster()
    expect(data.ui.agentName(H1)).toBe('Subagent')
  })
})
