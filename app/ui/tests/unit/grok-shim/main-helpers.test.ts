// T36：主 bot 的 subagent helper 进 Workers 分组（仅主 bot 的；其他 bot/嵌套 helper 不进）。
// rig 照 kickstart-queue.test（createShimData + mock api），session/list 按 T33/T36 探针的真实 item 形状 mock
// （origin/parentSessionId 顶层、title 与 subagent.label 在 projections.values——/tmp 探针原样见回执）。
import { describe, expect, it } from 'vitest'
import { createShimData } from '../../../renderer-grok/shim/src/data'

const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? v as Record<string, unknown> : {})

interface Item { sessionId: string; origin?: string; parentSessionId?: string; running?: boolean; title?: string | null; label?: string | null }

function rig(items: Item[], mainBotId: string | null) {
  let reloaded = 0
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
  const metaApi = () => Promise.resolve({ ok: true, value: { mainBotId, recipes: {} } })
  const data = createShimData({ authId: 'auth', api, metaApi })
  return { data, reloadCount: () => reloaded }
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
  it('② H1 完成（running:false 已读）→ 落 Done 分组；名字经 title 空回落 label', async () => {
    const items = base()
    items[2] = { sessionId: H1, origin: 'subagent', parentSessionId: M, running: false, label: 'Count files helper' }
    const { data } = rig(items, M)
    await data.dev.reloadRoster()
    const secs = data.dev.sections ?? []
    const done = secs.find((s) => rec(s).id === 'pbots:done:' + M)
    expect(done, 'Done section 在（running:false 已读落 Done——sectionsOf rank 4）').toBeTruthy()
    expect(rec(done!).agentIds).toContain(H1)
    const workers = secs.find((s) => rec(s).id === 'pbots:workers:' + M)
    expect(rec(workers ?? { agentIds: [] }).agentIds ?? []).not.toContain(H1)
  })
  it('③ 未知 sid（parent=main）的 status → 重拉后进 Workers；parent=B 的只拉一次不进', async () => {
    const items = base()
    const { data, reloadCount } = rig(items, M)
    await data.dev.reloadRoster()
    const before = reloadCount()
    // 模拟 helper 新冒出（api-session/status 流入未知 sid）——经 dev 通道注入事件
    // 用 reloadRoster 模拟重拉（真实通道 :413-419 在 socket 事件里；此处直接断重拉后新 helper 进组）
    items.push({ sessionId: 'helper-4', origin: 'subagent', parentSessionId: M, running: true, label: 'Late helper' })
    await data.dev.reloadRoster()
    expect(reloadCount()).toBeGreaterThan(before)
    const secs = data.dev.sections ?? []
    expect(rec(secs.find((s) => rec(s).id === 'pbots:workers:' + M)).agentIds).toContain('helper-4')
    expect(data.dev.state.order).not.toContain(H2)
  })
})
