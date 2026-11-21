import assert from 'node:assert/strict'
import { CreateChannel } from '/tmp/bot-wt/P6-10f2/app/sdk/src/orchestration/main-channel.mjs'
const secret = '/tmp/bot-p610f2a-verify/private/customer/sessions/deep.json'
const channel = new CreateChannel({ timeoutMs: 1000 })
const sub = { peer: 'verifier', queue: [], wake: null }; channel.attach(sub)
const details = { one: { two: { three: { leaf: `ENOTDIR '${secret}'`, list: [secret, { four: [secret, 17, null, false] }] } } } }
const original = JSON.stringify(details)
const pending = channel.request({ kind: 'create' }).catch(error => error)
channel.respond(sub.queue[0].requestId, { error: { code: 'storage', message: `read ${secret}`, details } }, 'verifier')
const error = await pending
const expected = '<path>/sessions/deep.json'
assert.equal(error.details.one.two.three.leaf, `ENOTDIR '${expected}'`)
assert.deepEqual(error.details.one.two.three.list, [expected, { four: [expected, 17, null, false] }])
assert.equal(JSON.stringify(details), original, 'input must not mutate')
assert.ok(!JSON.stringify(error).includes('/tmp/bot-p610f2a-verify'))
assert.equal(channel.pending.size, 0)
console.log('PASS three-object-level + array string/details boundary: ' + JSON.stringify(error.details))
console.log('PASS input unchanged; scalar values preserved; request settled')
channel.detach()
