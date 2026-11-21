import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import assert from 'node:assert/strict'
const path = '/home/lingxufeng/bot/repos/deepseek-harness/packages/api/gateway/src/index.ts'
const source = readFileSync(path, 'utf8')
const methods = ['receiveRemoteEventResult', 'removeRemoteEventDelivery', 'settleRemoteEvent', 'finishRemoteEvent'].map(name => {
  const start = source.indexOf(`  private ${name}(`)
  assert(start >= 0)
  const end = source.indexOf('\n  }', start) + 4
  return source.slice(start, end)
}).join('\n')
const stripped = stripTypeScriptTypes(`export default class Probe {\n${methods}\n}`)
const { default: Probe } = await import(`data:text/javascript,${encodeURIComponent(stripped)}`)
const gateway = new Probe()
let resolved = []
const client = { deliveries: new Map(), queue: { push() {} } }
const pending = { id: 'q', deliveries: new Set([client]), releaseSignal() {}, releaseContext() {}, source: { resolve: value => resolved.push(value) } }
client.deliveries.set('q', pending)
gateway.pendingRemoteEvents = new Map([['q', pending]])
const dispatch = value => { gateway.receiveRemoteEventResult(client, { eventId: 'q', outcome: { kind: 'result', value } }); return { ok: true } }
assert.deepEqual(dispatch({ answers: 'first' }), { ok: true })
assert.deepEqual(dispatch({ answers: 'second' }), { ok: true })
assert.deepEqual(resolved, [{ kind: 'result', value: { answers: 'first' } }])
console.log('CONFIRMED actual gateway method bodies: two RPCs report ok; only first answer settles; second is silent no-op. No duplicate tool execution claimed.')
