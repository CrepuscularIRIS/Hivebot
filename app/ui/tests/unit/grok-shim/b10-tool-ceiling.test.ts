// B10：per-tool ceiling 档位——读/写/前置判定。1.1.0 LocalToolPermissionCeiling（ask/always/never）。
import { afterEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()
vi.stubGlobal('window', { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } })

describe('B10 per-tool ceiling', () => {
  afterEach(() => { store.clear() })

  it('readCeiling：无档=undefined（=ask）；写读往返', async () => {
    const m = await import('../../../renderer-grok/shim/src/tool-ceiling')
    expect(m.readCeiling('mcp__x__y')).toBe(undefined)
    m.writeCeiling('mcp__x__y', 'always')
    expect(m.readCeiling('mcp__x__y')).toBe('always')
    expect(JSON.parse(store.get('pbots-tool-ceiling')!)).toEqual({ 'mcp__x__y': 'always' })
  })

  it('坏 JSON 降级空表（不 throw）', async () => {
    store.set('pbots-tool-ceiling', '{oops')
    const m = await import('../../../renderer-grok/shim/src/tool-ceiling')
    expect(m.readCeiling('any')).toBe(undefined)
  })

  it('listCeilings：全表读（设置面用）', async () => {
    const m = await import('../../../renderer-grok/shim/src/tool-ceiling')
    m.writeCeiling('a', 'always'); m.writeCeiling('b', 'never')
    expect(m.listCeilings()).toEqual({ a: 'always', b: 'never' })
  })
})
