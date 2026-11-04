// P6-09 return-chain spike. Run with:
//   /home/lingxufeng/bot/app/sdk/node_modules/.bin/node run.mjs
// Boots the real app/sdk Loader (scripts/start.mjs) against the installed
// @deepseek-ai/dsh@0.2.2-alpha.2 with the fake provider, drives probe.mjs
// through scenario (a)...(g), and writes result.json next to this file.
// Only owns its spawned SDK child (SIGTERM teardown; SIGKILL of the dsh pid
// for crash simulation — both are literal pids of this run's own children).
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { connect } from '/home/lingxufeng/bot/app/sdk/examples/lib/client.mjs'

const sdk = '/home/lingxufeng/bot/app/sdk'
const dir = fileURLToPath(new URL('.', import.meta.url))
const runtime = mkdtempSync('/tmp/bot-p609-')
const home = join(runtime, 'dsh'), handoff = join(runtime, 'handoff')
mkdirSync(join(home, 'fake', 'scripts'), { recursive: true })
mkdirSync(join(home, 'gates'), { recursive: true })
const patch = join(runtime, 'probe.yml')
writeFileSync(patch, `- id: agent-default-model\n  config: { provider: p2fake, model: p2fake }\n- insert:\n  - id: p609-fake\n    name: '${pathToFileURL(join(sdk, 'tests/support/fake/plugin.mjs'))}'\n    config:\n      providers: [{id: p2fake, name: Fake, models: [{id: p2fake, contextWindow: 131072}]}]\n  - id: p609-probe\n    name: '${pathToFileURL(join(dir, 'probe.mjs'))}'\n`)

const sleep = ms => new Promise(r => setTimeout(r, ms))
const checks = []
const check = (label, actual, expected) => { assert.deepEqual(actual, expected, label); checks.push({ label, actual }); console.log(`PASS ${label}`) }
const note = (label, actual) => { checks.push({ label, actual, observation: true }); console.log(`NOTE ${label}: ${JSON.stringify(actual ?? null)?.slice(0, 300)}`) }

// --- fake-script bookkeeping: the fake adapter's cursor restarts at 0 on every
// SDK boot, so the runner owns each session's full logical script and rewrites
// the file (consumed prefix included) before the next model call.
const scripts = new Map()
const script = (id, calls) => { scripts.set(id, [...(scripts.get(id) ?? []), ...calls]); writeFileSync(join(home, 'fake/scripts', `${id}.json`), JSON.stringify({ calls: scripts.get(id) })) }
/** Overwrite the whole script file (the fake adapter's cursor restarts at 0 on boot). */
const scriptOverwrite = (id, calls) => { scripts.set(id, calls); writeFileSync(join(home, 'fake/scripts', `${id}.json`), JSON.stringify({ calls })) }
const text = (t = 'ok') => ({ chunks: [
  { type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text: t },
  { type: 'block-end', index: 0, block: { type: 'text', text: t } }, { type: 'finish', reason: { kind: 'stop' } }] })
const gatedText = (gateId, finishReason = { kind: 'stop' }) => ({ gateAfterChunk: 1, gateId, chunks: [
  { type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text: '.' },
  { type: 'block-end', index: 0, block: { type: 'text', text: '.' } }, { type: 'finish', reason: finishReason }] })
const echoCall = (callId, argText = 'ping') => ({ chunks: [
  { type: 'block-start', index: 0, blockType: 'tool-call' }, { type: 'tool-call-delta', index: 0, id: callId, name: 'p609_echo', argumentsDelta: JSON.stringify({ text: argText }) },
  { type: 'block-end', index: 0, block: { type: 'tool-call', id: callId, name: 'p609_echo', arguments: JSON.stringify({ text: argText }) } },
  { type: 'finish', reason: { kind: 'tool-calls' } }] })
const gatedEchoCall = (gateId, callId) => ({ gateAfterChunk: 1, gateId, chunks: [
  { type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text: '.' }, { type: 'block-end', index: 0, block: { type: 'text', text: '.' } },
  { type: 'block-start', index: 1, blockType: 'tool-call' }, { type: 'tool-call-delta', index: 1, id: callId, name: 'p609_echo', argumentsDelta: '{}' },
  { type: 'block-end', index: 1, block: { type: 'tool-call', id: callId, name: 'p609_echo', arguments: '{}' } },
  { type: 'finish', reason: { kind: 'tool-calls' } }] })
const bashCall = (callId) => ({ chunks: [
  { type: 'block-start', index: 0, blockType: 'tool-call' }, { type: 'tool-call-delta', index: 0, id: callId, name: 'bash', argumentsDelta: JSON.stringify({ command: 'echo p609' }) },
  { type: 'block-end', index: 0, block: { type: 'tool-call', id: callId, name: 'bash', arguments: JSON.stringify({ command: 'echo p609' }) } },
  { type: 'finish', reason: { kind: 'tool-calls' } }] })
const openGate = gateId => writeFileSync(join(home, 'gates', gateId), '1')

let child = null, dshPid = null, output = '', client = null, eventsReq = null
const events = []
async function until(pred, label, timeout = 60000) {
  const deadline = Date.now() + timeout
  while (!pred()) {
    if (Date.now() > deadline || (child && child.exitCode !== null && !/ready|sdk exit|probe exit/.test(label))) throw new Error(`${label}: ${output.slice(-2500)}`)
    await sleep(50)
  }
}
/** RPC wrapper for calls whose handler kills the SDK before answering. */
const withTimeout = (p, ms = 15000, label = 'rpc') => Promise.race([p, sleep(ms).then(() => { throw new Error(`${label} timeout (expected if the SDK crashed mid-call)`) })])
async function boot() {
  // Stale handoff files (previous runtime, incl. probe-side exits that bypass
  // killSdk) must not satisfy the readiness check.
  rmSync(join(handoff, 'base-url'), { force: true })
  rmSync(join(handoff, 'launch-token'), { force: true })
  output = ''
  child = spawn(process.execPath, [join(sdk, 'scripts/start.mjs')], {
    cwd: sdk,
    env: { PATH: process.env.PATH, HOME: join(runtime, 'runhome'), PBOTS_DATA_DIR: join(runtime, 'data'), P2SDK_HOME: home, P2SDK_HANDOFF: handoff, P2SDK_PROVIDER: 'mock', P2SDK_PORT: '0', P2SDK_PATCH: patch, DSH_TELEMETRY_MODE: 'DISABLED' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', c => { output += c })
  child.stderr.on('data', c => {
    output += c
    if (process.env.P609_VERBOSE) process.stderr.write(`[sdk] ${c}`)
    const m = /p2sdk: dsh pid (\d+)/.exec(c)
    if (m) dshPid = Number(m[1])
  })
  await until(() => existsSync(join(handoff, 'base-url')), 'SDK ready')
  client = await connect({ baseUrl: readFileSync(join(handoff, 'base-url'), 'utf8').trim(), token: readFileSync(join(handoff, 'launch-token'), 'utf8').trim() })
  eventsReq = await client.socket.open('p609/requests', {})
  const iterator = eventsReq[Symbol.asyncIterator]()
  check('probe stream ready', (await iterator.next()).value, { ready: true })
  void (async () => { try { for (;;) { const r = await iterator.next(); if (r.done) break; r.value.arriveTs = Date.now(); events.push(r.value) } } catch { /* SDK died (crash simulation): the events array keeps what arrived */ } })()
}
async function killSdk({ crash }) {
  if (crash) {
    note('killSdk crash: killing', { dshPid, childPid: child?.pid, exitCode: child?.exitCode })
    if (dshPid) { process.kill(dshPid, 'SIGKILL') } // literal pid of this run's own dsh child
    if (child.exitCode === null) child.kill('SIGKILL')
    note('killSdk crash: signals sent', {})
  } else {
    if (child.exitCode === null) {
      const exited = new Promise(r => child.once('exit', r))
      child.kill('SIGTERM')
      const timer = setTimeout(() => child.kill('SIGKILL'), 10000)
      await exited; clearTimeout(timer)
    }
  }
  await until(() => child.exitCode !== null || child.signalCode !== null, 'sdk exit')
  await sleep(300) // let the OS settle the sqlite sidecar files
  try { eventsReq?.cancel?.(); client?.close?.() } catch { /* socket already gone */ }
  eventsReq = null; client = null; dshPid = null
}
const control = request => client.call('p609/control', { request })
const prompt = (sessionId, text_, mode = 'queue') => client.call('session/prompt', { request: { requestId: crypto.randomUUID(), sessionId, mode, content: [{ type: 'text', text: text_ }] } })
const create = async () => (await client.call('session/create', { request: { agentPreset: 'standard' } })).sessionId
const turnEnd = sessionId => events.filter(e => e.type === 'turn/end' && e.sessionId === sessionId)
const claimedTurns = sessionId => {
  const byTurn = new Map()
  for (const e of events) if (e.type === 'claimed' && e.sessionId === sessionId) {
    if (!byTurn.has(e.turn)) byTurn.set(e.turn, [])
    byTurn.get(e.turn).push(e.kind)
  }
  return byTurn
}
const waitTurnEnd = async (sessionId, label, count = 1) => { await until(() => turnEnd(sessionId).length >= count, `${label}: turn/end x${count}`, 30000) }
const userMessages = async (sessionId, pred = () => true) => (await control({ op: 'read', sessionId })).events.filter(ev => ev.type === 'user/message' && pred(ev))

try {
  // ---------- (b) turn/end reasons + approval/question events, one session per reason
  // (the fake adapter keeps a per-session in-memory cursor; separate sessions
  //  keep the scripted-call accounting independent of cancel timing)
  await boot()
  const BC = await create()
  script(BC, [text()])
  await prompt(BC, 'b-completed')
  await waitTurnEnd(BC, '(b) completed')
  const done = turnEnd(BC).at(-1)
  check('(b) completed reason observable via subscription', done.data.reason, 'completed')
  note('(b) turn/end latency (event ts -> arrival)', done.arriveTs - done.ts)

  const BA = await create()
  script(BA, [gatedText('g-abort')])
  await prompt(BA, 'b-abort')
  await until(() => turnEnd(BA).length >= 1 || events.some(e => e.type === 'turn/start' && e.sessionId === BA), '(b) abort turn/start')
  await client.call('session/cancel', { request: { sessionId: BA } })
  await waitTurnEnd(BA, '(b) aborted turn/end')
  check('(b) aborted reason = aborted/user', turnEnd(BA).at(-1).data.reason, 'aborted')
  note('(b) abort reasonDetail', turnEnd(BA).at(-1).data.reasonDetail)

  const BB = await create()
  await control({ op: 'hook', key: 'b-block', sessionId: BB, matchId: 'pbots-assign:b-block', hookOp: 'reject' })
  await control({ op: 'deliver', sessionId: BB, id: 'pbots-assign:b-block', text: 'b-blocked', mode: 'followup', sourceKind: 'pbots-main' })
  await waitTurnEnd(BB, '(b) blocked turn/end')
  check('(b) blocked reason observable', turnEnd(BB).at(-1).data.reason, 'blocked')
  check('(b) blocked: rejected claim never lands as user/message', (await userMessages(BB, ev => ev.id === 'pbots-assign:b-block')).length, 0)
  await control({ op: 'hook', key: 'b-block', clear: true })

  const BE = await create()
  script(BE, [gatedText('g-berr', { kind: 'error', failure: { message: 'fake failure', code: 'FAKE' } })])
  await prompt(BE, 'b-error')
  await until(() => events.some(e => e.type === 'user/message' && e.sessionId === BE), '(b) error user/message')
  openGate('g-berr')
  await waitTurnEnd(BE, '(b) error turn/end')
  check('(b) error reason observable', turnEnd(BE).at(-1).data.reason, 'error')
  note('(b) error reasonDetail', turnEnd(BE).at(-1).data.reasonDetail)

  const BM = await create()
  script(BM, [gatedText('g-mt', { kind: 'max-tokens' })])
  await prompt(BM, 'b-max-tokens')
  await until(() => events.some(e => e.type === 'user/message' && e.sessionId === BM), '(b) mt user/message')
  openGate('g-mt')
  await waitTurnEnd(BM, '(b) max-tokens turn/end')
  check('(b) max-tokens reason observable', turnEnd(BM).at(-1).data.reason, 'max-tokens')

  // approval: bash under the standard tier asks; asked event arrives, cancel settles it
  const BASH = await create()
  script(BASH, [bashCall('bash-1')])
  await prompt(BASH, 'b-approval')
  let asked = null
  await until(() => { asked = events.find(e => e.type === 'approval/asked' && e.sessionId === BASH); return asked }, '(b) approval/asked event')
  note('(b) approval/asked latency', asked.arriveTs - asked.ts)
  check('(b) approval/asked latency <= 1s', asked.arriveTs - asked.ts <= 1000, true)
  await client.call('session/cancel', { request: { sessionId: BASH } })
  await until(() => events.some(e => e.type === 'approval/decided' && e.sessionId === BASH), '(b) approval/decided')
  const decided = events.find(e => e.type === 'approval/decided' && e.sessionId === BASH)
  note('(b) approval/decided latency', decided.arriveTs - decided.ts)
  note('(b) approval/decided outcome (cancelled via abort)', decided.data)

  // ---------- (c) synchronous claim-set + status inside execute ----------
  const C = await create()
  script(C, [echoCall('echo-1')])
  await prompt(C, 'c-probe')
  await waitTurnEnd(C, '(c)')
  const echoResult = JSON.parse(((await control({ op: 'read', sessionId: C })).events.find(ev => ev.type === 'tool/result' && ev.callId === 'echo-1') ?? {}).text ?? 'null')
  check('(c) execute sees own turn claim kinds (user present)', echoResult?.claimKinds?.includes('user'), true)
  note('(c) full claim kinds seen by execute', echoResult?.claimKinds)
  check('(c) execute sees self running', echoResult?.selfStatus, 'running')
  check('(c) execute reads target session status synchronously', echoResult?.targets?.[BC], 'idle')

  // ---------- (c') mixed turns: report pending + user message ----------
  const M1 = await create()
  script(M1, [gatedText('g-cpr1'), text(), text()])
  await prompt(M1, 'cpr1-orig')
  await until(() => events.some(e => e.type === 'claimed' && e.sessionId === M1), "(c') steer: orig claimed")
  await control({ op: 'deliver', sessionId: M1, id: 'pbots-report:cpr1', text: 'worker data', mode: 'followup', sourceKind: 'pbots-worker', items: [{ key: 'cpr1:end' }] })
  await prompt(M1, 'cpr1-steer', 'steer')
  openGate('g-cpr1')
  await until(() => turnEnd(M1).length >= 2, "(c') steer both turns")
  await until(() => claimedTurns(M1).has(2), "(c') steer turn2 claimed")
  const m1t = claimedTurns(M1)
  note("(c') steer variant: turn claim kinds", { 1: m1t.get(1), 2: m1t.get(2) })
  check("(c') steer joins the running turn; report runs alone in the next turn",
    [m1t.get(1)?.includes('user'), m1t.get(1)?.some(k => k === 'pbots-worker'), m1t.get(2)],
    [true, false, ['pbots-worker']])

  const M2 = await create()
  script(M2, [gatedText('g-cpr2'), text(), text(), text()])
  await prompt(M2, 'cpr2-orig')
  await until(() => events.some(e => e.type === 'claimed' && e.sessionId === M2), "(c') queue: orig claimed")
  await control({ op: 'deliver', sessionId: M2, id: 'pbots-report:cpr2', text: 'worker data', mode: 'followup', sourceKind: 'pbots-worker' })
  await prompt(M2, 'cpr2-queue')
  openGate('g-cpr2')
  await until(() => turnEnd(M2).length >= 3, "(c') queue all turns")
  await until(() => claimedTurns(M2).has(3), "(c') queue turn3 claimed")
  const m2t = claimedTurns(M2)
  note("(c') queue variant: turn claim kinds", { 1: m2t.get(1), 2: m2t.get(2), 3: m2t.get(3) })
  check("(c') queue variant: report and user message land in separate turns",
    [m2t.get(2), m2t.get(3)], [['pbots-worker'], ['user']])

  const M3 = await create()
  script(M3, [gatedText('g-cpr3', { kind: 'error', failure: { message: 'fake failure', code: 'FAKE' } }), text(), text()])
  await prompt(M3, 'cpr3-orig')
  await until(() => events.some(e => e.type === 'claimed' && e.sessionId === M3), "(c') mixed: orig claimed")
  await control({ op: 'deliver', sessionId: M3, id: 'pbots-report:cpr3', text: 'worker data', mode: 'followup', sourceKind: 'pbots-worker' })
  await prompt(M3, 'cpr3-steer', 'steer')
  openGate('g-cpr3')
  await until(() => turnEnd(M3).length >= 1 && turnEnd(M3).at(-1).data.reason === 'error', "(c') mixed: turn1 error")
  // error closes the driver without consuming next-step; wake with a queued user message
  await prompt(M3, 'cpr3-wake')
  await until(() => claimedTurns(M3).has(2), "(c') mixed: turn2 claimed")
  await waitTurnEnd(M3, "(c') mixed: turn2 end", 2)
  const m3t = claimedTurns(M3)
  note("(c') mixed-turn claim kinds", { 1: m3t.get(1), 2: m3t.get(2) })
  check("(c') steer stranded by an error turn is claimed together with the report",
    m3t.get(2)?.includes('user') && m3t.get(2)?.includes('pbots-worker'), true)

  // ---------- (e) followup vs inject while a turn runs ----------
  const E = await create()
  script(E, [gatedEchoCall('g-e1', 'echo-e'), text(), text()])
  await prompt(E, 'e-orig')
  await until(() => events.some(e => e.type === 'claimed' && e.sessionId === E), '(e) orig claimed')
  const inj = await control({ op: 'deliver', sessionId: E, id: 'pbots-main:e-inject', text: 'inject now', mode: 'inject', sourceKind: 'pbots-main' })
  const fol = await control({ op: 'deliver', sessionId: E, id: 'pbots-report:e-followup', text: 'after turn', mode: 'followup', sourceKind: 'pbots-worker' })
  note('(e) deliver returns while turn running', { inject: inj, followup: fol })
  check('(e) agent.status observable as running from the plugin', inj.status, 'running')
  openGate('g-e1')
  await until(() => turnEnd(E).length >= 2, '(e) both turns end')
  // user/message events carry no turn field (data is the bare message); a
  // message's turn is the turn/start..turn/end seq window it falls into.
  const eLog = (await control({ op: 'read', sessionId: E })).events
  const seqOf = t => eLog.filter(ev => ev.type === t).map(ev => ev.seq)
  const turnOfMsg = id => {
    const seq = eLog.find(ev => ev.type === 'user/message' && ev.id === id)?.seq
    const starts = seqOf('turn/start'), ends = seqOf('turn/end')
    for (let i = 0; i < starts.length; i++) if (seq > starts[i] && seq < ends[i]) return i + 1
    return null
  }
  check('(e) inject joins the running turn (admitted inside turn 1)', turnOfMsg('pbots-main:e-inject'), 1)
  check('(e) followup waits for the next turn (admitted inside turn 2)', turnOfMsg('pbots-report:e-followup'), 2)

  // ---------- (a) live-session injection with a own source kind ----------
  const A = await create()
  script(A, [text()])
  await prompt(A, 'a-live-init')
  await waitTurnEnd(A, '(a) live init')
  script(A, [text()])
  const aDeliver = await control({ op: 'deliver', sessionId: A, id: 'pbots-assign:a-live', text: 'a task', mode: 'followup', sourceKind: 'pbots-main', items: [{ key: 'a-live:end' }] })
  await until(() => turnEnd(A).length >= 2, '(a) live injected turn')
  const aMsg = (await userMessages(A, m => m.id === 'pbots-assign:a-live')).at(-1)
  check('(a) plugin followup on a live session starts a turn', aDeliver.wasLive, true)
  check('(a) injected message persists with own source kind and stable id',
    [aMsg?.id, aMsg?.sourceKind, Array.isArray(aMsg?.sourceItems)], ['pbots-assign:a-live', 'pbots-main', true])

  // ---------- (f4) locate the assignment turn from the worker log ----------
  const F4 = await create()
  script(F4, [text()])
  await control({ op: 'deliver', sessionId: F4, id: 'pbots-assign:a4', text: 'f4 task', mode: 'followup', sourceKind: 'pbots-main' })
  await waitTurnEnd(F4, '(f4)')
  const fold4 = (await control({ op: 'fold', sessionId: F4 })).assignments
  const f4Log = (await control({ op: 'read', sessionId: F4 })).events
  const f4ClaimSeq = f4Log.find(ev => ev.type === 'agent/inbox/spliced' && ev.insertedIds.includes('pbots-assign:a4'))?.seq
  const f4MsgSeq = f4Log.find(ev => ev.type === 'user/message' && ev.id === 'pbots-assign:a4')?.seq
  const f4StartSeq = f4Log.find(ev => ev.type === 'turn/start')?.seq
  const f4End = f4Log.filter(ev => ev.type === 'turn/end').at(-1)
  const f4RemoveSeq = f4Log.find(ev => ev.type === 'agent/inbox/spliced' && ev.removedCount === 1 && ev.outcome === undefined && ev.seq > f4StartSeq)?.seq
  check('(f4) fold(spliced+turn/start) recovers assignment->turn with end state',
    fold4['a4'], { turn: f4End.turn, reason: 'completed' })
  check('(f4) log order: insert < turn/start < claim splice < user/message < turn/end',
    f4ClaimSeq < f4StartSeq && f4StartSeq < f4RemoveSeq && f4RemoveSeq < f4MsgSeq && f4MsgSeq < f4End.seq, true)

  // ---------- (f3) stop paths ----------
  const F3 = await create()
  script(F3, [gatedText('g-f3')])
  await prompt(F3, 'f3-orig')
  await until(() => events.some(e => e.type === 'user/message' && e.sessionId === F3), '(f3) turn1 running')
  await control({ op: 'deliver', sessionId: F3, id: 'pbots-report:f3-pending', text: 'pending report', mode: 'followup', sourceKind: 'pbots-worker' })
  await client.call('session/cancel', { request: { sessionId: F3 } })
  await until(() => turnEnd(F3).length >= 1, '(f3) aborted turn/end')
  await sleep(300)
  const f3Events = (await control({ op: 'read', sessionId: F3 })).events
  check('(f3) app stop (session/cancel) aborts the turn', turnEnd(F3).at(-1).data.reason, 'aborted')
  check('(f3) session/cancel keeps the inbox (keepInbox), no canceled splice',
    [f3Events.filter(ev => ev.type === 'agent/inbox/spliced' && ev.outcome === 'canceled').length,
      f3Events.filter(ev => ev.type === 'user/message' && ev.id === 'pbots-report:f3-pending').length], [0, 0])
  const f3Live = await control({ op: 'resolve', sessionId: F3 })
  check('(f3) pending message survives the stop, still not user/message', f3Live.nextTurn.includes('pbots-report:f3-pending'), true)
  await control({ op: 'cancelDefault', sessionId: F3 })
  await sleep(300)
  const f3After = (await control({ op: 'read', sessionId: F3 })).events
  check('(f3) plugin-side cancel() without keepInbox lands outcome:canceled splices',
    f3After.filter(ev => ev.type === 'agent/inbox/spliced' && ev.outcome === 'canceled' && ev.removedCount > 0).length > 0, true)

  // ---------- (d)+(b-interrupted) crash mid-turn, resume closes with `interrupted` ----------
  await sleep(1000)
  note('(d) sdk alive before create', { exitCode: child.exitCode, signal: child.signalCode })
  const D = await create()
  note('(d) created D', { d: D })
  script(D, [gatedText('g-d')])
  note('(d) prompting', {})
  await withTimeout(prompt(D, 'd-orig'), 20000, '(d) prompt rpc')
  note('(d) prompt accepted', {})
  await until(() => events.some(e => e.type === 'user/message' && e.sessionId === D), '(d) turn open')
  note('(d) turn open', {})
  await killSdk({ crash: true })
  note('(d) crash exit', { exitCode: child.exitCode, signal: child.signalCode })

  await boot()
  const dCrashed = (await control({ op: 'read', sessionId: D })).events
  check('(d) persisted tail has turn/start with no turn/end before resume',
    dCrashed.filter(ev => ev.type === 'turn/start').length - dCrashed.filter(ev => ev.type === 'turn/end').length, 1)
  const dResolve = await control({ op: 'resolve', sessionId: D })
  check('(d) cold session resolves (resume) and idles', [dResolve.wasLive, dResolve.status], [false, 'idle'])
  const dResumed = (await control({ op: 'read', sessionId: D })).events
  const dClosed = dResumed.find(ev => ev.type === 'turn/end' && ev.reason === 'interrupted')
  check('(d) resume appends turn/end {interrupted} for the crashed turn', [dClosed?.type, dClosed?.reason], ['turn/end', 'interrupted'])
  note('(d) log tail after resume', dResumed.slice(-4))

  // ---------- (a-cold) followup into a never-loaded session after a restart ----------
  const AC = await create()
  script(AC, [text()])
  await control({ op: 'flush' }) // persist the fresh session before the crash (create alone is not yet durable)
  await killSdk({ crash: true })
  await boot()
  const acDeliver = await control({ op: 'deliver', sessionId: AC, id: 'pbots-assign:a-cold', text: 'cold task', mode: 'followup', sourceKind: 'pbots-main' })
  await until(() => turnEnd(AC).length >= 1, '(a-cold) turn/end')
  const acMsg = (await userMessages(AC, m => m.id === 'pbots-assign:a-cold')).at(-1)
  check('(a) cold session (never loaded this boot) accepts followup and runs a turn',
    [acDeliver.wasLive, acMsg?.sourceKind], [false, 'pbots-main'])

  // ---------- (f1) stable id + items across restart; SA holds dedup ----------
  const F1M = await create()
  script(F1M, [text()])
  await control({ op: 'deliver', sessionId: F1M, id: 'pbots-report:f1:x:end', text: 'f1 report', mode: 'followup', sourceKind: 'pbots-worker', items: [{ key: 'x:end', kind: 'end', outcome: 'completed' }] })
  await waitTurnEnd(F1M, '(f1) first consumption')
  await killSdk({ crash: true })
  await boot()
  const f1After = (await userMessages(F1M, m => m.id === 'pbots-report:f1:x:end')).at(-1)
  check('(f1) after restart the persisted message keeps id / kind / items',
    [f1After?.id, f1After?.sourceKind, f1After?.sourceItems?.[0]?.key], ['pbots-report:f1:x:end', 'pbots-worker', 'x:end'])
  script(F1M, [text()])
  const f1Again = await control({ op: 'deliver', sessionId: F1M, id: 'pbots-report:f1:x:end', text: 'f1 report', mode: 'followup', sourceKind: 'pbots-worker', items: [{ key: 'x:end' }] })
  await sleep(1000)
  check('(f1) same id re-delivery is skipped by history check (SA holds semantics)',
    [f1Again.skippedHistory, (await userMessages(F1M, m => m.id === 'pbots-report:f1:x:end')).length], [true, 1])

  // ---------- (f2) pending next-turn survives restart, no auto-claim, rewake ----------
  const F2 = await create()
  script(F2, [gatedText('g-f2')])
  await prompt(F2, 'f2-orig')
  await until(() => events.some(e => e.type === 'user/message' && e.sessionId === F2), '(f2) turn1 running')
  await control({ op: 'deliver', sessionId: F2, id: 'pbots-assign:f2', text: 'f2 task', mode: 'followup', sourceKind: 'pbots-main' })
  await control({ op: 'flush' }) // durably commit the queued insert before the crash (decision 27: flushed == delivered)
  await killSdk({ crash: true })
  await boot()
  scriptOverwrite(F2, [text()]) // cursor restarts at 0: turn 2 must not re-hit the gate
  const f2Resolve = await control({ op: 'resolve', sessionId: F2 })
  check('(f2) pending next-turn message survives the restart in the inbox',
    f2Resolve.nextTurn.includes('pbots-assign:f2'), true)
  check('(f2) resumed agent is idle', f2Resolve.status, 'idle')
  await sleep(1500)
  const f2Log = (await control({ op: 'read', sessionId: F2 })).events
  const f2TurnStarts = f2Log.filter(ev => ev.type === 'turn/start').length
  check('(f2) restored inbox does NOT wake the agent by itself', f2TurnStarts, 1)
  const f2Rewake = await control({ op: 'rewake', sessionId: F2, id: 'pbots-assign:f2' })
  check('(f2) inbox.remove + followup wakes it', f2Rewake.status, 'running')
  // Host fact: the resume closer (turn/end interrupted) is appended through the
  // persistence handle, NOT the live session, so it never fires session/event —
  // only the rewoken turn's own end is observable on the stream.
  await until(() => turnEnd(F2).length >= 1, '(f2) rewoken turn end (live events; resume closer is log-only)')
  note('(f2) F2 turn/end events after rewake', events.filter(e => e.sessionId === F2).map(e => `${e.type}:${e.data?.reason ?? e.data?.turn ?? ''}`))
  const f2Msgs = await userMessages(F2, m => m.id === 'pbots-assign:f2')
  check('(f2) rewoken turn consumes the message (single user/message)', f2Msgs.length, 1)

  // ---------- (g) crash inside the claim window + pre-step reject ----------
  const G = await create()
  const GM = await create()
  await control({ op: 'flush' }) // GM has no events yet: persist its creation before the crash
  await control({ op: 'hook', key: 'g-crash', sessionId: G, matchId: 'pbots-assign:a10', hookOp: 'crash' })
  await withTimeout(control({ op: 'deliver', sessionId: G, id: 'pbots-assign:a10', text: 'g task', mode: 'followup', sourceKind: 'pbots-main' }), 10000, '(g) deliver').catch(() => {})
  await until(() => child.exitCode !== null || child.signalCode !== null, '(g) probe exit in claim window')
  check('(g) SDK crashed after claim (exit code)', child.exitCode, 70)
  await boot()
  const gCrashed = (await control({ op: 'read', sessionId: G })).events
  check('(g) crash window: claim splice persisted, no user/message, no turn/end',
    [gCrashed.some(ev => ev.type === 'agent/inbox/spliced' && ev.removedCount === 1 && ev.outcome === undefined),
      gCrashed.filter(ev => ev.type === 'user/message' && ev.id === 'pbots-assign:a10').length,
      gCrashed.filter(ev => ev.type === 'turn/end').length,
      gCrashed.at(-1)?.type], [true, 0, 0, 'agent/inbox/spliced'])
  await control({ op: 'resolve', sessionId: G })
  const gResumed = (await control({ op: 'read', sessionId: G })).events
  check('(g) resume closes the claimed turn as interrupted',
    gResumed.some(ev => ev.type === 'turn/end' && ev.reason === 'interrupted'), true)
  const gFold = (await control({ op: 'fold', sessionId: G })).assignments
  check('(g) fold recovers assignmentId->turn from the claim splice alone',
    gFold['a10']?.reason, 'interrupted')
  script(GM, [text()])
  const gReconcile = await control({ op: 'reconcile', mainId: GM, workerIds: [G] })
  check('(g) reconcile produces exactly one stopped item for the crashed assignment',
    gReconcile.due, [{ key: 'a10:end', kind: 'end', workerId: G, assignmentId: 'a10', outcome: 'stopped', reason: 'interrupted', turn: gFold['a10'].turn }])
  await until(() => turnEnd(GM).length >= 1, '(g) main consumes the report')
  check('(g) report lands exactly once in the main log',
    (await userMessages(GM, m => m.sourceKind === 'pbots-worker')).length, 1)

  const G2 = await create()
  await control({ op: 'hook', key: 'g-reject', sessionId: G2, matchId: 'pbots-assign:a11', hookOp: 'reject' })
  script(G2, [text()])
  await control({ op: 'deliver', sessionId: G2, id: 'pbots-assign:a11', text: 'g2 task', mode: 'followup', sourceKind: 'pbots-main' })
  await until(() => turnEnd(G2).length >= 1, '(g) rejected turn end')
  const g2Fold = (await control({ op: 'fold', sessionId: G2 })).assignments
  check('(g) pre-step reject: assignment recoverable, turn blocked, no user/message',
    [g2Fold['a11']?.reason,
      ((await control({ op: 'read', sessionId: G2 })).events.filter(ev => ev.type === 'user/message' && ev.id === 'pbots-assign:a11')).length],
    ['blocked', 0])
  await control({ op: 'hook', key: 'g-reject', clear: true })

  // ---------- (f5) three crash points, each exactly once ----------
  const MAIN = await create()
  const W1 = await create()
  script(W1, [text()])
  await control({ op: 'deliver', sessionId: W1, id: 'pbots-assign:a9a', text: 'w1', mode: 'followup', sourceKind: 'pbots-main' })
  await waitTurnEnd(W1, '(f5-i) worker turn done') // turn/end persisted, report not yet delivered
  await control({ op: 'flush' })
  await killSdk({ crash: true })
  await boot()
  script(MAIN, [text()])
  const f5i = await control({ op: 'reconcile', mainId: MAIN, workerIds: [W1] })
  check('(f5-i) worker ended + undelivered -> reconcile finds exactly one due end key',
    f5i.due, [{ key: 'a9a:end', kind: 'end', workerId: W1, assignmentId: 'a9a', outcome: 'completed', reason: 'completed', turn: 1 }])
  await until(() => turnEnd(MAIN).length >= 1, '(f5-i) main consumes')
  const f5iAgain = await control({ op: 'reconcile', mainId: MAIN, workerIds: [W1] })
  check('(f5-i) second reconcile is a no-op and the key landed exactly once',
    [f5iAgain.due.length, (await userMessages(MAIN, m => (m.sourceItems ?? []).some(it => it.key === 'a9a:end'))).length], [0, 1])

  const W2 = await create()
  script(W2, [text()])
  await control({ op: 'deliver', sessionId: W2, id: 'pbots-assign:a9b', text: 'w2', mode: 'followup', sourceKind: 'pbots-main' })
  await waitTurnEnd(W2, '(f5-ii) worker turn done')
  try { await withTimeout(control({ op: 'reconcile', mainId: MAIN, workerIds: [W2], crashAt: 'after-splice' }), 10000, '(f5-ii) reconcile') } catch { /* expected: probe exit(72) kills the SDK */ }
  await until(() => child.exitCode !== null || child.signalCode !== null, '(f5-ii) sdk exit')
  check('(f5-ii) crash after splice+flush (exit code)', child.exitCode, 72)
  await boot()
  // Observed host fact: the woken followup gets claimed before exit(72), and a
  // crash between claim and user/message leaves the key in NEITHER history NOR
  // inbox (SA holds() cannot see it). Decision 27 self-heals: the key drops out
  // of the delivered set, reconcile re-delivers, and it lands exactly once.
  const f2mainPending = await control({ op: 'resolve', sessionId: MAIN })
  const f2landed = (await userMessages(MAIN, m => (m.sourceItems ?? []).some(it => it.key === 'a9b:end'))).length
  note('(f5-ii) post-crash main state', { landed: f2landed, nextTurn: f2mainPending.nextTurn })
  check('(f5-ii) claim-window crash: key visible in neither history nor pending (holds blind spot)',
    [f2landed, f2mainPending.nextTurn.some(id => id.startsWith('pbots-report:a9b'))], [0, false])
  script(MAIN, [text()])
  const f5ii = await control({ op: 'reconcile', mainId: MAIN, workerIds: [W2] })
  check('(f5-ii) decision-27 recompute re-delivers the lost key', f5ii.due.map(d => d.key), ['a9b:end'])
  await until(() => turnEnd(MAIN).length >= 2, '(f5-ii) re-delivered report consumed')
  check('(f5-ii) key a9b:end landed exactly once overall',
    (await userMessages(MAIN, m => (m.sourceItems ?? []).some(it => it.key === 'a9b:end'))).length, 1)

  const W3 = await create()
  script(W3, [text()])
  await control({ op: 'deliver', sessionId: W3, id: 'pbots-assign:a9c', text: 'w3', mode: 'followup', sourceKind: 'pbots-main' })
  await waitTurnEnd(W3, '(f5-iii) worker turn done')
  try { await withTimeout(control({ op: 'reconcile', mainId: MAIN, workerIds: [W3], crashAt: 'before-splice' }), 10000, '(f5-iii) reconcile') } catch { /* expected exit(73) */ }
  await until(() => child.exitCode !== null || child.signalCode !== null, '(f5-iii) sdk exit')
  check('(f5-iii) crash before splice (exit code)', child.exitCode, 73)
  await boot()
  script(MAIN, [text()])
  const f5iii = await control({ op: 'reconcile', mainId: MAIN, workerIds: [W1, W2, W3] })
  check('(f5-iii) nothing persisted before the crash -> exactly a9c due (a9a/a9b already delivered)',
    f5iii.due.map(d => d.key), ['a9c:end'])
  await until(() => turnEnd(MAIN).length >= 3, '(f5-iii) main consumes')
  check('(f5-iii) key a9c:end landed exactly once',
    (await userMessages(MAIN, m => (m.sourceItems ?? []).some(it => it.key === 'a9c:end'))).length, 1)
  const f5final = await control({ op: 'reconcile', mainId: MAIN, workerIds: [W1, W2, W3] })
  check('(f5) final reconcile: every key exactly once, nothing due', [f5final.due.length,
    (await userMessages(MAIN, m => m.sourceKind === 'pbots-worker')).reduce((n, m) => n + (m.sourceItems ?? []).length, 0)], [0, 3])

  // ---------- (c'-enum) non-user sources observed in plain user turns ----------
  // E is excluded here: its turn 1 deliberately claims a probe-injected
  // pbots-main message ((e) scenario). M1/M2/BC turn 1 are plain user turns.
  const plainKinds = [...new Set([M1, M2, BC].flatMap(s => claimedTurns(s).get(1) ?? []))]
  check("(c') plain user turns claim only 'user' from the inbox (runtime-context is appended by pre-step, never claimed)", plainKinds, ['user'])
  note("(c') non-user sources on plain user turns by the user/message lens: runtime-context (3 blocks/turn in this profile), unclaimed", { runtimeContextLandsAsUserMessage: true, claimedByInbox: false })

  // ---------- static enum: every MessageSourceMap kind in the installed host ----------
  const staticEnum = [
    { kind: 'user', where: 'dsh-llm message.ts:111 (base map)', entersInbox: true },
    { kind: 'model', where: 'dsh-llm message.ts:112 (base map, assistant role)', entersInbox: false },
    { kind: 'tool', where: 'dsh-llm message.ts:113 (base map, tool results)', entersInbox: false },
    { kind: 'system-prompt', where: 'dsh-llm message.ts:114 (base map, system role)', entersInbox: false },
    { kind: 'runtime-context', where: 'agent-loop/runtime-context.ts:14-15', entersInbox: 'claimed per step (appended by pre-step default, replaced at user/message time)' },
    { kind: 'user-approval', where: 'interaction/user-approval/src/index.ts:215-221 (setPolicy -> agent.inject)', entersInbox: true },
    { kind: 'user-question-reply', where: 'interaction/user-questions/src/index.ts:191-215 (late answer -> agent.steer)', entersInbox: true },
    { kind: 'working-directory', where: 'session/working-directory/src/index.ts:193-202 (change notice -> agent.inject)', entersInbox: true },
    { kind: 'agent-message', where: 'subagent/subagent/src/continuation-messages.ts:41 (subagent -> parent)', entersInbox: true },
    { kind: 'subagent-settled', where: 'subagent/subagent/src/continuation-messages.ts:42 (settle notice -> parent steer/followup, manager.ts:688-689)', entersInbox: true },
    { kind: 'schedule', where: 'schedule/schedule/src/runtime.ts:6-8 (due reminder -> agent.followup)', entersInbox: true },
  ]

  writeResult({ staticEnum })
  console.log(`\nALL ${checks.filter(c => !c.observation).length} assertions passed`)
} catch (error) {
  console.error(output.slice(-6000))
  writeResult({ fatal: String(error?.stack ?? error) })
  throw error
} finally {
  try { eventsReq?.cancel?.(); client?.close?.() } catch { /* teardown */ }
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = new Promise(r => child.once('exit', r))
    if (dshPid) { try { process.kill(dshPid, 'SIGTERM') } catch { /* already gone */ } }
    child.kill('SIGTERM')
    const timer = setTimeout(() => { try { process.kill(child.pid, 'SIGKILL') } catch { /* gone */ } }, 10000)
    await exited; clearTimeout(timer)
  }
  rmSync(runtime, { recursive: true, force: true })
}

function writeResult(extra) {
  const claimed = {}
  for (const e of events) if (e.type === 'claimed') {
    claimed[e.sessionId] ??= {}
    ;(claimed[e.sessionId][e.turn] ??= []).push(e.kind)
  }
  writeFileSync(join(dir, 'result.json'), JSON.stringify({
    date: new Date().toISOString(),
    installedVersion: '0.2.2-alpha.2',
    sdkLauncher: `${sdk}/scripts/start.mjs (real Loader, P2SDK_PATCH overlay)`,
    runtimeHomePolicy: '/tmp/bot-p609-* (mkdtemp), removed in finally',
    checks,
    claimedTurns: claimed,
    turnEndReasonsObserved: [...new Set(events.filter(e => e.type === 'turn/end').map(e => e.data.reason))],
    ...extra,
  }, null, 2) + '\n')
}
