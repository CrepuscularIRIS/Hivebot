import assert from 'node:assert/strict'
import { Delivery } from '/home/lingxufeng/bot/app/sdk/src/orchestration/delivery.mjs'
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
function fixture({ fail = 0, gate, persisted = false } = {}) {
  let calls = 0, closes = 0, flushes = 0
  const pending = []
  const agent = { id: 'w1', inbox: { nextTurn: pending, nextStep: [] }, followup(m) { calls++; if (calls <= fail) throw Error('host boom'); pending.push(m) } }
  const registry = new Map([[agent.id, agent]])
  const ctx = { agents: registry, sessionPersistence: {
    async flush() { flushes++; if (gate) await gate.promise },
    async open() { return { async read(offset) { return { events: persisted && offset === 0 ? [{ type: 'user/message', data: { id: 'pbots-assign:x', source: { kind: 'pbots-main' } } }] : [] } }, async close() { closes++ } } },
  } }
  const delivery = new Delivery(ctx)
  const message = { id: 'pbots-assign:x', source: { kind: 'pbots-main' } }
  return { delivery, agent, message, registry, stats: () => ({ calls, closes, flushes }) }
}
{
  const f = fixture(); const result = await Promise.all(Array.from({ length: 100 }, () => f.delivery.send(f.agent, f.message)))
  assert.equal(result.filter(x => !x.skipped).length, 1); assert.equal(f.stats().calls, 1); assert.equal(f.delivery.inflight.size, 0)
  console.log('REFUTED success/skipped map leak: 100 callers, 1 followup, 99 skips, map=0')
}
{
  const f = fixture({ persisted: true }); assert.deepEqual(await Promise.all([f.delivery.send(f.agent, f.message), f.delivery.send(f.agent, f.message)]), [{ skipped: true }, { skipped: true }]); assert.equal(f.stats().calls, 0); assert.equal(f.delivery.inflight.size, 0)
  console.log('REFUTED already-held follower regression: both skipped, no followup, map=0')
}
{
  const f = fixture({ fail: 1 }); const r = await Promise.allSettled([f.delivery.send(f.agent, f.message), f.delivery.send(f.agent, f.message)])
  assert.deepEqual(r.map(x => x.status), ['rejected', 'fulfilled']); assert.equal(r[1].value.skipped, false); assert.equal(f.delivery.inflight.size, 0); assert.equal(f.stats().closes, 2)
  console.log('REFUTED failure/takeover leak: rejection then successful takeover, handles closed=2, map=0')
}
{
  const gate = deferred(); const f = fixture({ gate }); const requests = [f.delivery.send(f.agent, f.message), f.delivery.send(f.agent, f.message)]
  assert.equal(f.delivery.inflight.size, 1); f.registry.delete('w1'); gate.resolve()
  const r = await Promise.allSettled(requests); assert(r.every(x => x.status === 'rejected' && /disposed/.test(x.reason.message))); assert.equal(f.stats().calls, 0); assert.equal(f.delivery.inflight.size, 0)
  console.log('REFUTED dispose cleanup defect: 2 disposed rejections, 0 followup, map=0')
}
{
  const gate = deferred(); const f = fixture({ gate }); const requests = Array.from({ length: 1000 }, (_, i) => f.delivery.send(f.agent, { ...f.message, id: `pbots-assign:${i}` }))
  assert.equal(f.delivery.inflight.size, 1000); gate.resolve(); await Promise.all(requests); assert.equal(f.delivery.inflight.size, 0); assert.equal(f.stats().closes, 1000)
  console.log('RESOURCE: no fixed capacity; 1000 active unique keys => map=1000; all settled => map=0, handles closed=1000')
}
console.log('ALL PROBES PASSED')
