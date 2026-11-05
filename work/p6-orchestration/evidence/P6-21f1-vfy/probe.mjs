import assert from 'node:assert/strict'
import { Delivery, projectEvent } from '/tmp/bot-wt/P6-21f1/app/sdk/src/orchestration/delivery.mjs'
import { computeDue } from '/tmp/bot-wt/P6-21f1/app/sdk/src/orchestration/pending.mjs'
import { foldAssignments } from '/tmp/bot-wt/P6-21f1/app/sdk/src/orchestration/assignment.mjs'

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
const message = { id: 'pbots-assign:independent', source: { kind: 'pbots-main' }, role: 'user', content: [] }
function fixture({ failFollowup = false, failOpen = false } = {}) {
  const gate = deferred(), entered = deferred()
  let flushes = 0, calls = 0, opens = 0, closes = 0
  const agent = { id: 'independent-worker', inbox: { nextTurn: [], nextStep: [] }, followup(m) {
    calls++
    if (failFollowup && calls === 1) throw Error('injected-followup-failure')
    if (this.inbox.nextTurn.some(x => x.id === m.id)) throw Error('already pending')
    this.inbox.nextTurn.push(m)
  } }
  const registry = new Map([[agent.id, agent]])
  const delivery = new Delivery({ agents: { get: id => registry.get(id) }, sessionPersistence: {
    async flush() { if (++flushes === 1) { entered.resolve(); await gate.promise } },
    async open() { if (failOpen) throw Error('injected-open-failure'); opens++; return { async read() { return { events: [] } }, async close() { closes++ } } },
  } })
  return { delivery, agent, registry, gate, entered, counts: () => ({ calls, opens, closes }) }
}
async function concurrent(opts, count = 2) {
  const f = fixture(opts)
  const jobs = Array.from({ length: count }, () => f.delivery.send(f.agent, message))
  const result = Promise.allSettled(jobs)
  await f.entered.promise
  assert.equal(f.delivery.inflight.size, 1)
  f.gate.resolve()
  const settled = await result
  assert.equal(f.delivery.inflight.size, 0)
  assert.equal(f.counts().opens, f.counts().closes)
  return { f, settled }
}
{
  const { f, settled } = await concurrent({})
  assert.deepEqual(settled.map(x => x.value), [{ skipped: false }, { skipped: true }])
  assert.equal(f.counts().calls, 1)
  console.log('PASS concurrent identical pair: one followup; false,true; inflight=0')
}
{
  const { f, settled } = await concurrent({ failFollowup: true })
  assert.equal(settled[0].status, 'rejected')
  assert.match(settled[0].reason.message, /injected-followup/)
  assert.deepEqual(settled[1].value, { skipped: false })
  assert.equal(f.counts().calls, 2)
  assert.equal(f.agent.inbox.nextTurn.length, 1)
  console.log('PASS failed inflight: leader rejected, follower retried and delivered, not skipped')
}
{
  const f = fixture({})
  f.agent.inbox.nextStep.push(message)
  const result = Promise.all([f.delivery.send(f.agent, message), f.delivery.send(f.agent, message)])
  await f.entered.promise; f.gate.resolve()
  assert.deepEqual(await result, [{ skipped: true }, { skipped: true }])
  assert.equal(f.counts().calls, 0)
  assert.equal(f.delivery.inflight.size, 0)
  console.log('PASS busy inbox prepopulated same id in nextStep: both skipped, no followup or exception')
}
{
  const f = fixture({})
  const result = Promise.allSettled([f.delivery.send(f.agent, message), f.delivery.send(f.agent, message)])
  await f.entered.promise; f.registry.delete(f.agent.id); f.gate.resolve()
  const settled = await result
  assert(settled.every(x => x.status === 'rejected' && /disposed/.test(x.reason.message)))
  assert.equal(f.counts().calls, 0)
  assert.equal(f.delivery.inflight.size, 0)
  assert.equal(f.counts().opens, f.counts().closes)
  console.log('PASS dispose during held flush: both reject disposed, zero followups, inflight=0, handles closed')
}
{
  const { f, settled } = await concurrent({ failOpen: true }, 32)
  assert(settled.every(x => x.status === 'rejected' && /injected-open-failure/.test(x.reason.message)))
  assert.equal(f.counts().calls, 0)
  console.log('PASS extra bad path: persistence.open rejects under 32 concurrent sends; no false receipt, no reservation leak')
}
const raw = [
  { type: 'agent/inbox/spliced', data: { target: 'next-turn', start: 0, removedCount: 0, inserted: [message] } },
  { type: 'turn/start', data: { turn: 9 } },
  { type: 'agent/inbox/spliced', data: { target: 'next-turn', start: 0, removedCount: 1, inserted: [] } },
  { type: 'approval/asked', data: { id: 'approval-independent' } },
  { type: 'tool/call', data: { turn: 9, name: 'ask_user_question', callId: 'question-independent' } },
]
const events = raw.map((x, seq) => projectEvent({ ...x, seq }))
const due = (ev, idle) => computeDue({ mainId: 'main-independent', mainEvents: [], workers: [{ workerId: 'worker-independent', events: ev, idle }] }).due
assert.deepEqual(due(events, true).map(x => x.key), ['independent:end'])
assert.equal(due(events, true)[0].outcome, 'stopped')
assert.deepEqual(due(events, undefined).map(x => x.key), ['independent:end'])
assert.deepEqual(due(events, false).map(x => x.key), ['independent:ask:approval-independent', 'independent:ask:question-independent'])
const completed = [...events, projectEvent({ type: 'approval/decided', data: { id: 'approval-independent' } }), projectEvent({ type: 'tool/result', data: { turn: 9, message: { toolCallId: 'question-independent' } } }), projectEvent({ type: 'turn/end', data: { turn: 9, reason: { kind: 'completed' } } })]
assert.deepEqual(due(completed, true).map(x => [x.key, x.outcome]), [['independent:end', 'completed']])
console.log('PASS raw crash log projected: idle/default only stopped end; busy approval+question asks preserved; normal completion only completed end')
const reorder = [raw[0], { type: 'agent/inbox/spliced', data: { target: 'next-turn', start: 0, removedCount: 1, inserted: [], outcome: 'canceled' } }, raw[0]].map(projectEvent)
const fold = foldAssignments(reorder)
assert.equal(fold.assignments.size, 0)
assert.deepEqual(fold.pendingAssigns, [{ id: message.id, assignmentId: 'independent' }])
console.log('PASS same-id canceled remove/reinsert: zero claims, one pending assignment')
console.log('ALL 7 independent scenarios PASS')
