// T-03 acceptance ② and ③.
// ② Install one MCP bundle fixture (enabled:false), then X created through
//    p2temp/session.createWithConnectors gets `mcp__demo__ping` in its request
//    tool table while a plain Y does not.
// ③ P5-58 起 market.yml 在默认链：锁定「默认 runtime 开箱含 pluginMarket/*，p2temp
//    前缀恰 2 个方法」，market 挂载侧与默认侧方法表一致（原「差集恰 2」语义已随
//    默认挂载失效——两侧同集，差集恒空）。
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { BUNDLE_NAME, CONNECTOR_TOOL, MARKET_YML, REL_BUNDLE_NAME, REL_TOOL, readMethods, writeBundleFixture, writeObserverPatch, writeRelativeBundleFixture } from './support.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const SIGNATURES = [
  // agentPreset is explicit at the SDK layer: main resolves the default
  // (CONTRACT §3.1 / §8 item 2); p2temp itself rejects an omitted one.
  'p2temp/session.createWithConnectors({connectors: string[], agentPreset: string, cwd?: string}) → {sessionId}',
  'p2temp/preset.ensure({agentPreset: string, connectors: string[]}) → {presetId}',
]

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
  const scratch = tmkdir('p2sdk-t03b-')
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

it('③ P5-58: the DEFAULT chain carries pluginMarket/* and exactly the two p2temp methods', async () => {
  // 原「market-patched vs bare 差集恰 2 个 p2temp」在 market.yml 进默认链后两侧同集、
  // 差集恒空；语义改为锁定默认链本身：pluginMarket/* 开箱可用（P5-58 生产挂载），
  // p2temp 前缀恰 2 个方法（G2-r2 清单 3 的「无未知自有方法」不变）。
  const full = await readMethods(rt.home, 'p2temp/session.createWithConnectors')
  const bareList = await readMethods(rtBare.home, '')
  const bare = new Set(bareList)
  expect(full.filter((m) => m.startsWith('p2temp/')).sort()).toEqual([
    'p2temp/preset.ensure',
    'p2temp/session.createWithConnectors',
  ])
  // bare = 默认链 + observerPatch：p2temp / pluginMarket 与 market 挂载侧一致（默认挂载生效）
  expect(bareList.filter((m) => m.startsWith('p2temp/')).sort()).toEqual([
    'p2temp/preset.ensure',
    'p2temp/session.createWithConnectors',
  ])
  expect(bareList.some((m) => m.startsWith('pluginMarket/')), 'default chain exposes pluginMarket/* (P5-58)').toBe(true)
  expect(full.filter((m) => !bare.has(m))).toEqual([])
}, 120_000)

it('the P2-TEMP annotation in src matches both signatures verbatim', async () => {
  const source = readFileSync(join(import.meta.dirname, '..', '..', 'src', 'p2temp', 'index.mjs'), 'utf8')
  expect(source).toContain('P2-TEMP')
  for (const signature of SIGNATURES) expect(source).toContain(signature)
}, 30_000)
