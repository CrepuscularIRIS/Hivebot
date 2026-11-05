import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { launchRuntime } from '/tmp/bot-wt/P6-14/app/sdk/tests/support/runtime.ts'
import { DELEGATION_TOOLS, JOB_TOOLS, RESTRICT_TOOLS } from '/tmp/bot-wt/P6-14/app/sdk/src/orchestration/envelope.mjs'
const pkg = '/tmp/bot-wt/P6-14/app/sdk'
const root = mkdtempSync('/tmp/bot-p614f1-vfy-registry-')
process.env.HOME = join(root, 'home')
const home = join(root, 'sdk'), data = join(root, 'data')
for (const p of [process.env.HOME, join(home, 'fake', 'scripts'), data]) mkdirSync(p, { recursive: true })
const overlay = join(root, 'overlay.yml')
writeFileSync(overlay, `- id: agent-default-model\n  config:\n    provider: p2fake\n    model: p2fake\n- insert:\n    - id: p2sdk-fake-llm\n      name: '${pathToFileURL(join(pkg, 'tests/support/fake/plugin.mjs')).href}'\n      config:\n        providers:\n          - id: p2fake\n            name: P2 Fake\n            models:\n              - id: p2fake\n                contextWindow: 131072\n    - id: vfy-registry-inspect\n      name: '${new URL('./vfy-f1-registry-inspect.mjs', import.meta.url).href}'\n`)
let rt
try {
  rt = await launchRuntime({ env: { P2SDK_HOME: home, PBOTS_DATA_DIR: data, P2SDK_ORCH_DATA_DIR: data, P2SDK_PATCH: join(pkg, 'profile/patches/orchestration.yml') + ':' + overlay } })
  const control = request => rt.client.call('p610/control', { request })
  const names = async id => (await control({ op: 'vfy-list', sessionId: id })).names
  const create = async (label, sessionId) => {
    const cwd = join(process.env.HOME, label); mkdirSync(cwd, { recursive: true })
    return (await rt.client.call('session/create', { request: { agentPreset: 'standard', cwd, ...(sessionId ? { sessionId } : {}) } })).sessionId
  }
  const M = await create('main')
  const W = await create('late-worker')
  const writeBots = bots => writeFileSync(join(data, 'bots.json'), JSON.stringify({ version: 1, mainBotId: M, recipes: {}, bots }))
  writeBots({ [W]: { createdBy: M } })
  const mainBefore = await names(M), workerBefore = await names(W)
  const registry = await control({ op: 'registry-scope', sessionId: W })
  const presetOnly = [...DELEGATION_TOOLS, ...JOB_TOOLS]
  for (const name of presetOnly) {
    assert.equal(registry.global.includes(name), false, name + ' must be absent globally')
    assert.ok(registry.scoped.includes(name), name + ' must exist in agent scope')
    assert.ok(workerBefore.includes(name), name + ' must be executable/visible before restrict')
  }
  console.log('REAL_REGISTRY_SPLIT', JSON.stringify({ registry, presetOnly }))
  const wrong = await control({ op: 'registry-restrict', sessionId: W, mode: 'wrong-global' })
  const wrongAfter = await names(W)
  for (const name of presetOnly) assert.ok(wrongAfter.includes(name), name + ' demonstrates global intersection leak')
  console.log('CONFIRMED_WRONG_GLOBAL_LEAK', JSON.stringify({ wrong, stillVisible: presetOnly }))
  const correct = await control({ op: 'registry-restrict', sessionId: W, mode: 'correct-agent' })
  assert.equal(correct.applied, true)
  const workerAfter = await names(W)
  for (const name of RESTRICT_TOOLS) assert.equal(workerAfter.includes(name), false, name + ' must be restricted')
  for (const name of ['bash', 'read', 'write', 'edit']) assert.ok(workerAfter.includes(name))
  assert.deepEqual(await names(M), mainBefore)
  console.log('PASS_CORRECT_AGENT_RESTRICT', JSON.stringify({ workerBefore, workerAfter, mainBefore, mainAfter: await names(M) }))
  // Direct execution with intentionally invalid arguments: envelope must reject before schema/UNKNOWN_TOOL.
  const before = (await rt.client.call('session/list', { _request: {} })).items.length
  const calls = presetOnly.map((name, i) => ({ id: 'bad-' + i, name, arguments: '{}' }))
  const batch = { chunks: [...calls.flatMap((c, index) => [
    { type: 'block-start', index, blockType: 'tool-call' },
    { type: 'tool-call-delta', index, id: c.id, name: c.name, argumentsDelta: c.arguments },
    { type: 'block-end', index, block: { type: 'tool-call', ...c } },
  ]), { type: 'finish', reason: { kind: 'tool-calls' } }] }
  const done = { chunks: [{ type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text: 'done' }, { type: 'block-end', index: 0, block: { type: 'text', text: 'done' } }, { type: 'finish', reason: { kind: 'stop' } }] }
  writeFileSync(join(home, 'fake', 'scripts', W + '.json'), JSON.stringify({ calls: [batch, done] }))
  await rt.client.call('session/prompt', { request: { requestId: crypto.randomUUID(), sessionId: W, mode: 'queue', content: [{ type: 'text', text: 'p614f1 invalid args on restricted preset tools' }] } })
  const deadline = Date.now() + 60000
  let events
  do {
    events = (await control({ op: 'read', sessionId: W })).events
    if (events.some(e => e.type === 'turn/end')) break
    await new Promise(r => setTimeout(r, 100))
  } while (Date.now() < deadline)
  assert.ok(events.some(e => e.type === 'turn/end'), 'turn completed')
  const results = events.filter(e => e.type === 'tool/result')
  assert.equal(results.length, presetOnly.length)
  for (const r of results) { assert.equal(r.isError, true); assert.match(r.text, /pbots\/forbidden/); assert.doesNotMatch(r.text, /UNKNOWN_TOOL/) }
  assert.equal(events.filter(e => e.type === 'approval/asked').length, 0)
  assert.equal((await rt.client.call('session/list', { _request: {} })).items.length, before)
  console.log('PASS_BAD_PATH_ALL_14_PRESET_TOOLS_DENIED', JSON.stringify(results))
  await control({ op: 'registry-restrict', sessionId: W, mode: 'clear' })
  assert.deepEqual(await names(W), workerBefore)
  // Independent production-order witness: no manual restrict on this new worker.
  const P = 'session-' + crypto.randomUUID()
  writeBots({ [W]: { createdBy: M }, [P]: { createdBy: M } })
  assert.equal(await create('production-worker', P), P)
  const production = await names(P)
  for (const name of RESTRICT_TOOLS) assert.equal(production.includes(name), false)
  for (const name of ['bash', 'read', 'write', 'edit']) assert.ok(production.includes(name))
  assert.deepEqual(await names(M), mainBefore)
  console.log('PASS_AUTOMATIC_PRODUCTION_RESTRICT', JSON.stringify({ production, mainUnchanged: true, disposerRestoredLateWorker: true }))
} finally {
  await rt?.stop()
  if (rt) rmSync(rt.handoff, { recursive: true, force: true })
  rmSync(root, { recursive: true, force: true })
}
