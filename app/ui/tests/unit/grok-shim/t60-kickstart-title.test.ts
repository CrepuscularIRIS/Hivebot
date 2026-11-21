// T60：dsh 自动标题吃了 kickstart 提示原文（'<bot_introduction_request>You were just'——截断无闭合标签）
// → roster 唯一入口 summaryOf 识别前缀置 null → toAgentRecord 回落 New chat（agents.ts:30，同 0.18 model.ts:133 口径）。
// ① 施工前必红：title 原样穿 summaries → listAgents().title 是提示原文。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createShimData } from '../../../renderer-grok/shim/src/data'

const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? v as Record<string, unknown> : {})

interface Item { sessionId: string; origin?: string; parentSessionId?: string; running?: boolean; title?: string | null; label?: string | null }

const mkStore = (): Storage => {
  const m = new Map<string, string>([['pbots.shim.onboarding-seen', '1']])
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v) }, removeItem: (k) => { m.delete(k) } } as unknown as Storage
}

function rig(items: Item[], mainBotId: string) {
  vi.stubGlobal('window', { localStorage: mkStore() })
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
  const agents = (): Array<Record<string, unknown>> => data.deps.listAgents() as Array<Record<string, unknown>>
  return { data, agents }
}

const M = 'session-main', B = 'session-b', W = 'helper-w'
const LEAK = '<bot_introduction_request>You were just' // c2-01restored 实机形态（截断无闭合标签）

afterEach(() => vi.unstubAllGlobals())

describe('T60 kickstart 提示不当标题', () => {
  it('① 泄漏标题（截断前缀形态）→ listAgents name 回落 New chat（修前=提示原文）', async () => {
    const { data, agents } = rig([
      { sessionId: M, title: LEAK }, // 主 bot 没起名，dsh 自动标题=提示原文
      { sessionId: B, title: '我的 bot' },
    ], M)
    await data.dev.reloadRoster()
    const m = agents().find((a) => a.id === M)
    const b = agents().find((a) => a.id === B)
    expect(m?.name).toBe('New chat') // 修前=LEAK（回执红尾）
    expect(b?.name).toBe('我的 bot')
  })
  it('② 完整标签形态（未截断的整段）同滤；user 起的含标签中缀名不滤', async () => {
    const { data, agents } = rig([
      { sessionId: M, title: '<bot_introduction_request>You were just created. Greet the user and introduce yourself in two or three short sentences: your name if you have one, your personality, and what you can help with. Don\'t use any tools.</bot_introduction_request>' },
      { sessionId: B, title: '笔记 <bot_introduction_request> 复盘' }, // 中缀=用户自己起的，照显示（工单边界 3：识别前缀）
    ], M)
    await data.dev.reloadRoster()
    expect(agents().find((a) => a.id === M)?.name).toBe('New chat')
    expect(agents().find((a) => a.id === B)?.name).toBe('笔记 <bot_introduction_request> 复盘')
  })
  it('③ helper label 优先路径不受影响', async () => {
    const { data, agents } = rig([
      { sessionId: M, title: LEAK },
      { sessionId: W, origin: 'subagent', parentSessionId: M, label: LEAK }, // 主 bot 给 helper 的 label 也吃了提示
    ], M)
    await data.dev.reloadRoster()
    expect(agents().find((a) => a.id === W)?.name ?? '').not.toContain('<bot_introduction_request>') // helper 行不显示提示原文
  })
})
