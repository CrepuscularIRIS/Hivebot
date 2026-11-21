// Run with app/sdk/node_modules/.bin/node; only owns its spawned SDK child.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { connect } from '/home/lingxufeng/bot/app/sdk/examples/lib/client.mjs'
const sdk = '/home/lingxufeng/bot/app/sdk'
const dir = fileURLToPath(new URL('.', import.meta.url))
const runtime = mkdtempSync('/tmp/bot-s2-cross-')
const home = join(runtime, 'dsh'), handoff = join(runtime, 'handoff')
mkdirSync(join(home, 'fake', 'scripts'), { recursive: true })
const patch = join(runtime, 'probe.yml')
writeFileSync(patch, `- id: agent-default-model\n  config: { provider: p2fake, model: p2fake }\n- insert:\n  - id: s2-fake\n    name: '${pathToFileURL(join(sdk, 'tests/support/fake/plugin.mjs'))}'\n    config:\n      providers: [{id: p2fake, name: Fake, models: [{id: p2fake, contextWindow: 131072}]}]\n  - id: s2-probe\n    name: '${pathToFileURL(join(dir, 'probe.mjs'))}'\n`)
const child = spawn(process.execPath, [join(sdk, 'scripts/start.mjs')], {
  cwd: sdk,
  env: { PATH: process.env.PATH, HOME: join(runtime, 'home'), PBOTS_DATA_DIR: join(runtime, 'data'), P2SDK_HOME: home, P2SDK_HANDOFF: handoff, P2SDK_PROVIDER: 'mock', P2SDK_PORT: '0', P2SDK_PATCH: patch, DSH_TELEMETRY_MODE: 'DISABLED' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let output = ''; child.stdout.on('data', c => { output += c }); child.stderr.on('data', c => { output += c })
let client, requests
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function until(pred, label) {
  const deadline = Date.now() + 60000
  while (!pred()) { if (Date.now() > deadline || child.exitCode !== null) throw new Error(`${label}: ${output.slice(-2500)}`); await sleep(50) }
}
const checks = []
const check = (label, actual, expected) => { assert.deepEqual(actual, expected, label); checks.push({ label, actual }); console.log(`PASS ${label}`) }
const text = { chunks: [{ type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text: 'done' }, { type: 'block-end', index: 0, block: { type: 'text', text: 'done' } }, { type: 'finish', reason: { kind: 'stop' } }] }
const call = id => ({ chunks: [{ type: 'block-start', index: 0, blockType: 'tool-call' }, { type: 'tool-call-delta', index: 0, id, name: 's2_new', argumentsDelta: '{}' }, { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 's2_new', arguments: '{}' } }, { type: 'finish', reason: { kind: 'tool-calls' } }] })
async function turn(sessionId) {
  const { stream } = await client.follow(sessionId, { awaitSnapshot: true })
  const frames = []
  const drain = (async () => { for await (const f of stream) frames.push(f) })()
  await client.call('session/prompt', { request: { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: 'S2' }] } })
  await until(() => frames.some(f => f.event?.type === 'turn/end'), 'turn/end')
  stream.cancel(); await drain
  return frames.filter(f => f.event?.type === 'tool/result').map(f => f.event.data.message)
}
try {
  await until(() => existsSync(join(handoff, 'base-url')), 'SDK ready')
  client = await connect({ baseUrl: readFileSync(join(handoff, 'base-url'), 'utf8').trim(), token: readFileSync(join(handoff, 'launch-token'), 'utf8').trim() })
  const create = () => client.call('session/create', { request: { agentPreset: 'standard' } })
  const a = (await create()).sessionId, b = (await create()).sessionId
  writeFileSync(join(home, 'fake/scripts', `${a}.json`), JSON.stringify({ calls: [text, call('s2-ok'), text, call('s2-denied'), text] }))
  await turn(a) // existing session has already completed a turn before installing tool
  const control = request => client.call('s2/control', { request })
  check('old session before registration', (await control({ op: 'inspect', sessionId: a })).visible, false)
  await control({ op: 'install' }); await control({ op: 'main', sessionId: a })
  check('old session dynamically gains tool', (await control({ op: 'inspect', sessionId: a })).visible, true)
  check('other session does not gain tool', (await control({ op: 'inspect', sessionId: b })).visible, false)
  await control({ op: 'deny', sessionId: a })
  check('live scoped deny', (await control({ op: 'inspect', sessionId: a })).visible, false)
  await control({ op: 'lift', sessionId: a })
  check('lift restores tool without recreating session', (await control({ op: 'inspect', sessionId: a })).visible, true)
  const raw = await fetch(`${client.baseUrl}/s2-rpc/echo`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: client.cookie }, body: JSON.stringify({ type: 'client-request', rpcId: 's2', method: 'echo', payload: { ping: true } }) }).then(async r => ({ status: r.status, body: await r.text() }))
  checks.push({ label: 'custom RPC channel observation (not acceptance)', actual: raw })
  requests = await client.socket.open('s2/requests', {})
  const iterator = requests[Symbol.asyncIterator]()
  check('custom gateway stream ready', (await iterator.next()).value, { ready: true })
  const response = (async () => {
    const request = (await iterator.next()).value
    const worker = await create() // main client handles SDK tool request, then answers by RPC
    await client.call('s2/respond', { request: { requestId: request.requestId, value: { sessionId: worker.sessionId } } })
    return worker.sessionId
  })()
  const results = await turn(a)
  const createdId = await response
  check('SDK tool -> main stream -> create session -> SDK respond -> tool result', results.some(r => !r.isError && JSON.stringify(r.content).includes(createdId)), true)
  await control({ op: 'main', sessionId: b })
  check('old main immediately loses next-step tool', (await control({ op: 'inspect', sessionId: a })).visible, false)
  check('new main old session gains next-step tool', (await control({ op: 'inspect', sessionId: b })).visible, true)
  const denied = await turn(a)
  check('forced fake tool call by former main denied', denied.some(r => r.isError), true)
  let locked = false
  try { await client.call('agentPresets/select', { agentId: a, agentPreset: 'standard' }) } catch (e) { locked = String(e).includes('agent-preset/locked') }
  check('preset switch on started session locked', locked, true)
  writeFileSync(join(dir, 'result.json'), JSON.stringify({ date: new Date().toISOString(), installedVersion: '0.2.2-alpha.2', checks }, null, 2) + '\n')
} catch (error) {
  console.error(output.slice(-6000)); throw error
} finally {
  requests?.cancel(); client?.close()
  if (child.exitCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve))
    child.kill('SIGTERM')
    const timer = setTimeout(() => child.kill('SIGKILL'), 10000)
    await exited; clearTimeout(timer)
  }
  rmSync(runtime, { recursive: true, force: true })
}
