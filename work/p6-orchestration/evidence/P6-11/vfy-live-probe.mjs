import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { launchRuntime } from '/tmp/bot-wt/P6-11/app/sdk/tests/support/runtime.ts'
const pkg = '/tmp/bot-wt/P6-11/app/sdk'
const ev = '/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-11'
const home = mkdtempSync('/tmp/bot-p611-vfy-live-'); const data = join(home, 'data')
mkdirSync(data); mkdirSync(join(home, 'fake/scripts'), { recursive: true })
const overlay = join(home, 'probe.yml')
writeFileSync(overlay, `- id: agent-default-model
  config:
    provider: p2fake
    model: p2fake
- insert:
    - id: p2sdk-fake-llm
      name: 'file://${pkg}/tests/support/fake/plugin.mjs'
      config:
        providers:
          - id: p2fake
            name: P2 Fake
            models:
              - id: p2fake
                contextWindow: 131072
    - id: pbots-orchestration
      name: 'file://${ev}/vfy-probe-plugin.mjs'
    - id: p610-inspect
      name: 'file://${pkg}/tests/support/orchestration-create-inspect.mjs'
`)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const text = t => ({ paceMs: 5, chunks: [{ type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text: t }, { type: 'block-end', index: 0, block: { type: 'text', text: t } }, { type: 'finish', reason: { kind: 'stop' } }] })
const burst = pairs => ({ chunks: [...pairs.flatMap(({ id, args }, i) => [
  { type: 'block-start', index: i, blockType: 'tool-call' },
  { type: 'tool-call-delta', index: i, id, name: 'send_to_bot', argumentsDelta: JSON.stringify(args) },
  { type: 'block-end', index: i, block: { type: 'tool-call', id, name: 'send_to_bot', arguments: JSON.stringify(args) } },
]), { type: 'finish', reason: { kind: 'tool-calls' } }] })
const script = (id, calls) => writeFileSync(join(home, 'fake/scripts', `${id}.json`), JSON.stringify({ calls }))
let rt
try {
  rt = await launchRuntime({ env: { P2SDK_HOME: home, P2SDK_ORCH_DATA_DIR: data, PBOTS_DATA_DIR: data, P2SDK_PATCH: overlay } })
  const rpc = (method, request) => rt.client.call(method, { request })
  const session = async () => (await rpc('session/create', { agentPreset: 'standard' })).sessionId
  const control = request => rpc('pbots/vfy.control', request)
  const log = async id => (await rpc('p610/control', { op: 'read', sessionId: id })).events
  const until = async fn => { const end = Date.now() + 30000; while (!await fn()) { if (Date.now() > end) throw new Error('probe timeout'); await sleep(50) } }
  const run = async (m, pairs) => {
    script(m, [burst(pairs), text('done')])
    await rpc('session/prompt', { requestId: `vfy-${m}`, sessionId: m, mode: 'queue', content: [{ type: 'text', text: 'explicit user worker request' }] })
    await until(async () => (await log(m)).some(e => e.type === 'turn/end'))
    return (await log(m)).filter(e => e.type === 'tool/result')
  }
  const own = async (m, ws) => writeFileSync(join(data, 'bots.json'), JSON.stringify({ version: 1, mainBotId: m, recipes: {}, bots: Object.fromEntries(ws.map(w => [w, { createdBy: m }])) }))
  const m = await session(); const w = await session(); await own(m, [w])
  let state = await control({ op: 'pending', id: w }); assert.equal(state.status, 'idle'); assert.equal(state.pending, 1)
  let out = await run(m, [{ id: 'pending', args: { bot: w, message: 'pending must not queue' } }])
  assert.equal(out.length, 1); assert.equal(out[0].isError, true); assert.match(JSON.stringify(out[0]), /pbots\/busy:/)
  assert.equal((await log(w)).filter(e => e.sourceKind === 'pbots-main').length, 0)
  console.log('PASS live idle+user-pending: status=idle pending=1, bot/message aliases, pbots/busy: once, assigns=0')
  state = await control({ op: 'clear', id: w }); assert.equal(state.pending, 0)
  const m2 = await session(); await own(m2, [w]); script(w, [text('idle recovery')])
  out = await run(m2, [{ id: 'idle', args: { workerId: w, text: 'idle must succeed' } }]); assert.equal(out[0].isError, false)
  await until(async () => (await log(w)).some(e => e.type === 'turn/end'))
  console.log('PASS live cleared pending: workerId/text aliases accepted, idle worker delivered exactly once')
  const m3 = await session(); const ws = []
  for (let i = 0; i < 3; i++) { ws.push(await session()); script(ws[i], [text(`worker-${i}`)]) }
  await own(m3, ws); await control({ op: 'arm', ids: ws })
  out = await run(m3, ws.map((id, i) => ({ id: `parallel-${i}`, args: { botId: id, prompt: `UNIQUE-${i}` } })))
  const stats = await control({ op: 'stats' }); assert.equal(stats.maxActive, 3); assert.equal(new Set(stats.entries).size, 3)
  assert.equal(out.length, 3); assert.ok(out.every(r => !r.isError)); assert.equal(new Set(out.map(r => JSON.parse(r.text).assignmentId)).size, 3)
  for (const w of ws) { await until(async () => (await log(w)).some(e => e.type === 'turn/end')); assert.equal((await log(w)).filter(e => e.sourceKind === 'pbots-main').length, 1) }
  for (let i = 0; i < ws.length; i++) { const msgs = await control({ op: 'assigns', id: ws[i] }); assert.equal(msgs.length, 1); assert.ok(msgs[0].text.endsWith(`UNIQUE-${i}`)); assert.equal(msgs[0].id, `pbots-assign:${JSON.parse(out.find(r => r.callId === `parallel-${i}`).text).assignmentId}`) }
  assert.equal((await control({ op: 'stats' })).used, 0)
  console.log('PASS real Loader concurrency barrier: all 3 execute entered agentOf before any returns; maxActive=3; 3 distinct assignmentIds; one assign per target; slots return to 0')
  const m4 = await session(); await own(m4, ws)
  out = await run(m4, [{ id: 'invalid', args: { id: ws[0], text: 'bad', cwd: '/forbidden' } }])
  assert.equal(out[0].isError, true); assert.match(JSON.stringify(out[0]), /pbots\/invalid-args:/)
  console.log('PASS bad path: extra cwd rejected with pbots/invalid-args: prefix')
} finally { if (rt) await rt.stop(); rmSync(home, { recursive: true, force: true }) }
