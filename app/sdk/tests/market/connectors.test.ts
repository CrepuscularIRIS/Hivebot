// T-03 acceptance ② and ③.
// ② Install one MCP bundle fixture (enabled:false), then X created through
//    p2temp/session.createWithConnectors gets `mcp__demo__ping` in its request
//    tool table while a plain Y does not.
// ③ The runtime's registered method table differs from the bare baseline
//    (which keeps every @deepseek-ai/* enabled item) by exactly one method:
//    p2temp/session.createWithConnectors.
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { BUNDLE_NAME, CONNECTOR_TOOL, MARKET_YML, REL_BUNDLE_NAME, REL_TOOL, readMethods, writeBundleFixture, writeObserverPatch, writeRelativeBundleFixture } from './support.ts'

const SIGNATURE =
  'p2temp/session.createWithConnectors({connectors: string[], agentPreset?: string, cwd?: string}) → {sessionId}'

let rt: Runtime
let rtBare: Runtime
let bundleDir: string

const requestToolNames = async (sessionId: string): Promise<string[]> => {
  const names: string[] = []
  const stream = await rt.client.follow(sessionId, { assistantStream: true })
  const done = (async () => {
    for await (const frame of stream) {
      if (frame.type === 'event' && frame.event?.type === 'request/header') {
        for (const tool of frame.event.data.header.tools ?? []) names.push(tool.name)
      }
      if (frame.type === 'event' && frame.event?.type === 'turn/end') return
    }
  })()
  await rt.client.call('session/prompt', {
    request: {
      requestId: `t03-${sessionId}-${Math.random().toString(16).slice(2, 8)}`,
      sessionId,
      mode: 'queue',
      content: [{ type: 'text', text: '你好' }],
    },
  })
  await done
  stream.cancel()
  return names
}

beforeAll(async () => {
  const scratch = mkdtempSync(join(tmpdir(), 'p2sdk-t03b-'))
  bundleDir = writeBundleFixture(join(scratch, 'demo-mcp'))
  const observerPatch = writeObserverPatch(scratch)
  rt = await launchRuntime({
    env: {
      P2SDK_PATCH: `${MARKET_YML}:${observerPatch}`,
      P2SDK_MARKET_INDEXES: 'http://127.0.0.1:9/index.json',
    },
  })
  const install = await rt.client.call('pluginManager/installBundle', {
    spec: bundleDir,
    options: { enabled: false },
  })
  if (install?.application === 'failed' || install?.error) {
    throw new Error(`installBundle failed: ${JSON.stringify(install).slice(0, 2000)}`)
  }
  const installRel = await rt.client.call('pluginManager/installBundle', {
    spec: writeRelativeBundleFixture(join(scratch, 'relative-tool')),
    options: { enabled: false },
  })
  if (installRel?.application === 'failed' || installRel?.error) {
    throw new Error(`installBundle(relative) failed: ${JSON.stringify(installRel).slice(0, 2000)}`)
  }
  rtBare = await launchRuntime({ env: { P2SDK_PATCH: observerPatch } })
}, 240_000)

afterAll(async () => {
  await rt?.stop()
  await rtBare?.stop()
}, 60_000)

it('X created with connectors sees the MCP tool; plain Y does not', async () => {
  const cwd = join(rt.home, 'workspace')
  const { sessionId: x } = await rt.client.call('p2temp/session.createWithConnectors', {
    request: { connectors: [BUNDLE_NAME], agentPreset: 'standard', cwd },
  })
  expect(typeof x).toBe('string')
  const { sessionId: y } = await rt.client.call('session/create', { request: { cwd } })
  expect(typeof y).toBe('string')
  expect(x).not.toBe(y)

  const xTools = await requestToolNames(x)
  const yTools = await requestToolNames(y)
  expect(xTools).toContain(CONNECTOR_TOOL)
  expect(yTools.filter((n) => n.startsWith('mcp__'))).toEqual([])
}, 180_000)

it('R14: a relative-path connector loads; its tool reaches the request tool table', async () => {
  const cwd = join(rt.home, 'workspace')
  const { sessionId } = await rt.client.call('p2temp/session.createWithConnectors', {
    request: { connectors: [REL_BUNDLE_NAME], agentPreset: 'standard', cwd },
  })
  expect(typeof sessionId).toBe('string')
  const tools = await requestToolNames(sessionId)
  expect(tools).toContain(REL_TOOL)
}, 180_000)

it('the method table differs from the bare baseline by exactly the one p2temp method', async () => {
  const full = await readMethods(rt.home, 'p2temp/session.createWithConnectors')
  const bare = new Set(await readMethods(rtBare.home, ''))
  const added = full.filter((m) => !bare.has(m))
  // pluginMarket/* methods come from the @deepseek-ai plugin-market service
  // that market.yml assembles; the baseline keeps them (G2-r2 item 3).
  const own = added.filter((m) => !m.startsWith('pluginMarket/'))
  expect(own).toEqual(['p2temp/session.createWithConnectors'])
  expect(full.filter((m) => m.startsWith('p2temp/'))).toEqual(['p2temp/session.createWithConnectors'])
}, 120_000)

it('the P2-TEMP annotation in src matches the signature verbatim', async () => {
  const source = readFileSync(join(import.meta.dirname, '..', '..', 'src', 'p2temp', 'index.mjs'), 'utf8')
  expect(source).toContain('P2-TEMP')
  expect(source).toContain(SIGNATURE)
}, 30_000)
