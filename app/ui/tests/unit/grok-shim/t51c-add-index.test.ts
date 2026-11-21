// T51c R2：addIndex 选中的必须是上游规范化后的地址（不是用户原样输入）
import { describe, expect, it, vi, beforeEach } from 'vitest'

const apiMock = vi.fn()
vi.mock('../../../renderer-grok/overrides/modules/pbots-ui', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../../renderer-grok/overrides/modules/pbots-ui')>()
  return { ...orig, api: (...a: unknown[]) => apiMock(...a) }
})
const { addIndex, getMarket } = await import('../../../renderer-grok/overrides/modules/market-store')

const CANON = 'https://example.com/index.json' // 上游对大写/.. 路径的规范化产物

describe('T51c R2：新加源选中规范化地址', () => {
  beforeEach(() => { apiMock.mockReset() })

  it('输入 https://EXAMPLE.com:443/a/../index.json → state.url === 规范地址，search 只打规范地址', async () => {
    const searches: string[] = []
    apiMock.mockImplementation(async (method: string, args: { url?: string }) => {
      if (method === 'pluginMarket/setIndexes') return { ok: true, value: null }
      if (method === 'pluginMarket/listIndexes') return { ok: true, value: [{ url: CANON }] }
      if (method === 'pluginMarket/search') { searches.push(args.url ?? ''); return { ok: true, value: { entries: [], total: 0, nextOffset: null } } }
      if (method === 'pluginManager/listBundles') return { ok: true, value: [] }
      return { ok: true, value: null }
    })
    const err = await addIndex('https://EXAMPLE.com:443/a/../index.json')
    expect(err).toBeNull()
    expect(getMarket().url, '选中规范地址').toBe(CANON)
    expect(getMarket().sources?.map((s) => s.url)).toEqual(['builtin:hivebot-picks', CANON]) // T69 起内置恒第一位
    expect(searches.filter((u) => u === 'https://EXAMPLE.com:443/a/../index.json'), '不再对原样输入发起搜索').toHaveLength(0)
  })
})
