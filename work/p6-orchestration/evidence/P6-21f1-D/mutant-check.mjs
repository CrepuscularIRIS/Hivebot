import assert from 'node:assert/strict'
import { Delivery } from './delivery-mutant.mjs'
const message = { id: 'pbots-assign:x', source: { kind: 'pbots-main' } }
let calls = 0
const agent = { id: 'w', inbox: { nextTurn: [], nextStep: [] }, followup() { calls++ } }
const ctx = { agents: new Map([['w', agent]]), sessionPersistence: { async flush() {}, async open() { return { async read() { return { events: [] } }, async close() {} } } } }
const success = new Delivery(ctx)
await success.send(agent, message)
assert.equal(success.inflight.size, 1)
console.log('CONFIRMED mutation survives existing 56 tests: successful send leaves inflight.size=1')
ctx.agents.delete('w')
const disposed = new Delivery(ctx)
assert.deepEqual(await disposed.send(agent, message), { skipped: false })
assert.equal(calls, 2)
console.log('CONFIRMED mutation survives existing 56 tests: disposed target incorrectly receives followup')
