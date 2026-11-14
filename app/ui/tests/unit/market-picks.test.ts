// T69：内置「Hivebot picks」目录源——store 集成与条目表自检（工单验收 1 全项）。
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('../../renderer-grok/overrides/modules/pbots-ui', () => ({
  api: vi.fn(),
  monogram: (n: string): string => n.slice(0, 2),
  text: (v: unknown): string => (typeof v === 'string' ? v : ''),
  ui: {},
  useOnline: () => true,
  installedBundles: vi.fn(() => []),
}))
// store 是模块级单例：每个 it 前重置（resetMarket 若无则 reload 模块）——用动态 import + vi.resetModules
const load = async (): Promise<typeof import('../../renderer-grok/overrides/modules/market-store')> => {
  vi.resetModules()
  return import('../../renderer-grok/overrides/modules/market-store')
}
const picks = async (): Promise<typeof import('../../renderer-grok/overrides/modules/market-picks')> => {
  vi.resetModules()
  return import('../../renderer-grok/overrides/modules/market-picks')
}

const listIndexesReply: { ok: boolean; value?: unknown; error?: { code?: string; message?: string } } = { ok: true, value: [] }

describe('T69 内置 picks 源', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('无用户源 → sources[0] 是内置源且默认选中', async () => {
    const { api } = await import('../../renderer-grok/overrides/modules/pbots-ui')
    const mocked = vi.mocked(api)
    const store = await load()
    const { BUILTIN_PICKS_URL } = await picks()
    mocked.mockResolvedValue({ ok: true, value: [] } as never)
    await store.enterMarket(true)
    expect(store.getMarket().sources?.[0]?.url).toBe(BUILTIN_PICKS_URL)
    expect(store.getMarket().url).toBe(BUILTIN_PICKS_URL)
  })

  it('有用户源 → 内置恒第一位、用户源顺序不变；默认浏览 = 用户第一个源', async () => {
    const { api } = await import('../../renderer-grok/overrides/modules/pbots-ui')
    const mocked = vi.mocked(api)
    const store = await load() // resetModules → 新单例（模拟另一次全新启动）
    const { BUILTIN_PICKS_URL } = await picks()
    mocked.mockResolvedValue({ ok: true, value: [{ url: 'http://a.test/i.json' }, { url: 'http://b.test/i.json' }] } as never)
    await store.enterMarket(true)
    expect(store.getMarket().sources?.map((s) => s.url)).toEqual([BUILTIN_PICKS_URL, 'http://a.test/i.json', 'http://b.test/i.json'])
    expect(store.getMarket().url).toBe('http://a.test/i.json')
  })

  it('内置源 search：空查询返回全部；mem 只剩含 mem；分页 50 同口径', async () => {
    const { searchPicks, PICKS } = await picks()
    const all = searchPicks({})
    expect(all.total).toBe(PICKS.length)
    expect(all.entries.length).toBe(PICKS.length)
    expect(all.nextOffset).toBeNull()
    const mem = searchPicks({ text: 'memory' })
    expect(mem.total).toBeGreaterThanOrEqual(1)
    for (const e of mem.entries) expect(`${e.name} ${String(e.title)} ${String(e.description ?? '')}`.toLowerCase()).toContain('mem')
    const page = searchPicks({ offset: 0, limit: 2 })
    expect(page.entries.length).toBe(2)
    expect(page.nextOffset).toBe(2)
    const page2 = searchPicks({ offset: 2, limit: 2 })
    expect(page2.entries[0]?.name).toBe(PICKS[2]?.name)
  })

  it('classify：能装条目 installable；needs-sign-in 条目 browse', async () => {
    const store = await load()
    const { PICKS } = await picks()
    const mem = PICKS.find((e) => e.name === '@modelcontextprotocol/server-memory')!
    const gmail = PICKS.find((e) => e.name === 'signin:gmail')!
    expect(store.classify(mem, new Set(), {})).toBe('installable')
    expect(store.classify(gmail, new Set(), {})).toBe('browse')
  })

  it('addIndex/removeIndex 提交的 urls 不含 builtin:（mock api 抓参数）；removeIndex 对内置源 no-op', async () => {
    const { api } = await import('../../renderer-grok/overrides/modules/pbots-ui')
    const mocked = vi.mocked(api)
    const store = await load()
    const { BUILTIN_PICKS_URL } = await picks()
    mocked.mockResolvedValue({ ok: true, value: [{ url: BUILTIN_PICKS_URL }, { url: 'http://user.test/i.json' }] } as never)
    await store.enterMarket(true)
    mocked.mockClear()
    mocked.mockResolvedValue({ ok: true } as never)
    // removeIndex 内置源：no-op（不调 setIndexes）
    expect(await store.removeIndex(BUILTIN_PICKS_URL)).toBeNull()
    expect(mocked.mock.calls.filter((c) => String(c[0]).includes('setIndexes'))).toHaveLength(0)
    // addIndex：提交的 urls 不含 builtin
    await store.addIndex('http://new.test/i.json')
    const call = mocked.mock.calls.find((c) => String(c[0]).includes('setIndexes'))
    expect(call, 'setIndexes 被调').toBeDefined()
    expect(JSON.stringify(call?.[1])).not.toContain('builtin:')
    // removeIndex 用户源：提交的 urls 也不含 builtin
    mocked.mockClear()
    await store.removeIndex('http://user.test/i.json')
    const call2 = mocked.mock.calls.find((c) => String(c[0]).includes('setIndexes'))
    expect(call2, 'setIndexes 被调（删用户源）').toBeDefined()
    expect(JSON.stringify(call2?.[1])).not.toContain('builtin:')
  })

  it('T69b 意见3：任何 builtin: 前缀的 addIndex/removeIndex 输入都在提交前拒绝（不调 setIndexes）', async () => {
    const { api } = await import('../../renderer-grok/overrides/modules/pbots-ui')
    const mocked = vi.mocked(api)
    const store = await load()
    mocked.mockResolvedValue({ ok: true, value: [] } as never)
    await store.enterMarket(true)
    mocked.mockClear()
    // addIndex：内置 URL 本尊、任意其他 builtin: 前缀、带空白的前缀输入——全部拒绝
    for (const bad of ['builtin:hivebot-picks', 'builtin:other', ' builtin:x ']) {
      const err = await store.addIndex(bad)
      expect(err, `addIndex(${JSON.stringify(bad)}) 返回拒绝`).toBeTruthy()
    }
    // removeIndex：任意 builtin: 前缀 no-op（含带空白的输入——T69b 审低1）
    expect(await store.removeIndex('builtin:other')).toBeNull()
    expect(await store.removeIndex(' builtin:x ')).toBeNull()
    expect(mocked.mock.calls.filter((c) => String(c[0]).includes('setIndexes'))).toHaveLength(0)
  })

  it('条目表自检：名字唯一；能装条目 spec 版本 = app/sdk package.json 预置版本（防漂移）', async () => {
    const { PICKS } = await picks()
    const names = PICKS.map((e) => e.name)
    expect(new Set(names).size).toBe(names.length)
    const sdkPkg = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'sdk', 'package.json'), 'utf8')) as { devDependencies: Record<string, string> }
    for (const e of PICKS) {
      if (e.metadata?.keywords?.includes('needs-sign-in') === true) {
        expect(e.versions, `${e.name}（needs-sign-in）无 versions`).toBeUndefined()
        continue
      }
      const spec = e.versions?.[0]?.install?.spec
      expect(spec, `${e.name} 有 install spec`).toBeDefined()
      const ver = sdkPkg.devDependencies[e.name]
      expect(ver, `${e.name} 预置于 app/sdk devDependencies`).toBeDefined()
      expect(spec).toBe(`${e.name}@${ver}`)
    }
  })

  it('T70：renderer Entry 不持有启动配置（序列化不含 launch）', async () => {
    const { PICKS } = await picks()
    for (const e of PICKS) {
      expect(JSON.stringify(e), `${e.name} Entry 无 launch`).not.toContain('"launch"')
    }
  })

  it('T72：Filesystem 撤下目录——无该条目、恰 17 条、搜索 filesystem 为 0', async () => {
    const { PICKS, searchPicks } = await picks()
    expect(PICKS.map((e) => e.name), '目录无 Filesystem').not.toContain('@agent-infra/mcp-server-filesystem')
    expect(PICKS.length, '3 能装 + 14 要登录').toBe(17)
    expect(searchPicks({ text: 'filesystem' }).total).toBe(0)
    for (const e of searchPicks({ text: 'files' }).entries) expect(e.name, "'files' 命中不含 Filesystem").not.toBe('@agent-infra/mcp-server-filesystem')
  })
})
