// 复核 X(35) vs Y(31) 工具表差异的构成：MCP 只带 1 个 ping 工具，差的另外 3 个是什么
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROOT = '/tmp/bot-wt/T-03/app/sdk'
const { launchRuntime } = await import(`${ROOT}/tests/support/runtime.ts`)
const { MARKET_YML, writeBundleFixture, writeObserverPatch } = await import(`${ROOT}/tests/market/support.ts`)

const scratch = mkdtempSync(join(tmpdir(), 'verify03d-'))
const rt = await launchRuntime({ env: { P2SDK_PATCH: `${MARKET_YML}:${writeObserverPatch(scratch)}`, P2SDK_MARKET_INDEXES: 'http://127.0.0.1:9/index.json' } })
await rt.client.call('pluginManager/installBundle', { spec: writeBundleFixture(join(scratch, 'demo-mcp')), options: { enabled: false } })

const toolNames = async (sessionId) => {
  const names = []
  const stream = await rt.client.follow(sessionId, { assistantStream: true })
  const done = (async () => {
    for await (const f of stream) {
      if (f.type === 'event' && f.event?.type === 'request/header') for (const t of f.event.data.header.tools ?? []) names.push(t.name)
      if (f.type === 'event' && f.event?.type === 'turn/end') return
    }
  })()
  await rt.client.call('session/prompt', { request: { requestId: `d-${Math.random().toString(16).slice(2)}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 'hi' }] } })
  await done
  stream.cancel()
  return [...new Set(names)].sort()
}

const { sessionId: x } = await rt.client.call('p2temp/session.createWithConnectors', { request: { connectors: ['@p2sdk-fixture/demo-mcp'], agentPreset: 'standard', cwd: join(rt.home, 'workspace') } })
const { sessionId: y } = await rt.client.call('session/create', { request: { cwd: join(rt.home, 'workspace') } })
const { sessionId: yStd } = await rt.client.call('session/create', { request: { cwd: join(rt.home, 'workspace'), agentPreset: 'standard' } })
const X = await toolNames(x)
const Y = await toolNames(y)
const Ystd = await toolNames(yStd)
console.log(`X=${X.length} Y(default)=${Y.length} Y(explicit standard)=${Ystd.length}`)
console.log('X only:', X.filter((n) => !Y.includes(n)))
console.log('Y only:', Y.filter((n) => !X.includes(n)))
console.log('Ystd identical to Y(default):', JSON.stringify(Ystd) === JSON.stringify(Y))
await rt.stop()
