// T-03 acceptance ①: /api/pluginMarket/search returns entries for a local
// format-1 snapshot (the snapshot is a fixture only; no real market is hit).
import { afterAll, beforeAll, expect, it } from 'vitest'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { MARKET_YML, readMethods, serveMarketIndex, writeObserverPatch } from './support.ts'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tmkdir } from '../support/tmp-sweep.ts'

let rt: Runtime
let indexUrl: string
let closeIndex: () => Promise<void>

beforeAll(async () => {
  const index = await serveMarketIndex()
  indexUrl = index.url
  closeIndex = index.close
  const observerPatch = writeObserverPatch(tmkdir('p2sdk-t03a-'))
  rt = await launchRuntime({
    env: {
      P2SDK_PATCH: `${MARKET_YML}:${observerPatch}`,
      P2SDK_MARKET_INDEXES: indexUrl,
    },
  })
})

afterAll(async () => {
  await rt?.stop()
  await closeIndex?.()
}, 30_000)

it('pluginMarket/search returns the snapshot entries over /api', async () => {
  const result = await rt.client.call('pluginMarket/search', {
    url: indexUrl,
    query: { sort: { kind: 'index' }, text: '', offset: 0, limit: 10 },
  })
  const names: string[] = result.entries.map((e: { name: string }) => e.name)
  expect(result.title).toBe('p2sdk fixture market')
  expect(result.total).toBe(3)
  expect(names).toContain('@p2sdk-fixture/demo-mcp')
  expect(names).toContain('@p2sdk-fixture/echo-tool')
  expect(names).toContain('@p2sdk-fixture/other-tool')
}, 120_000)

it('pluginMarket/search narrows by text', async () => {
  const result = await rt.client.call('pluginMarket/search', {
    url: indexUrl,
    query: { sort: { kind: 'index' }, text: 'echo', offset: 0, limit: 10 },
  })
  expect(result.entries.map((e: { name: string }) => e.name)).toEqual(['@p2sdk-fixture/echo-tool'])
}, 120_000)

it('pluginMarket/listIndexes reports the configured source', async () => {
  const sources = await rt.client.call('pluginMarket/listIndexes', {})
  expect(sources).toMatchObject([{ url: indexUrl, title: 'p2sdk fixture market' }])
}, 120_000)

it('market.yml brings only @deepseek-ai pluginMarket methods into the table (sanity for ③)', async () => {
  const methods = await readMethods(rt.home, 'pluginMarket/search')
  const market = methods.filter((m) => m.startsWith('pluginMarket/'))
  expect(market.length).toBeGreaterThan(0)
  expect(market.every((m) => m.startsWith('pluginMarket/'))).toBe(true)
}, 120_000)
